//! Folder scanning and per-file metadata for the library.

use super::{is_under, now_secs, Source, Track};
use crate::media::kinds::{kind_of, MediaKind};
use crate::media::metadata::split_artist_title;
use crate::media::probe::Probe;
use crate::tools::{std_command, tools};
use lofty::config::ParseOptions;
use lofty::prelude::*;
use lofty::tag::ItemKey;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

const MAX_DEPTH: usize = 12;
const WORKERS: usize = 4;

/// Recursively lists media files under `root` (hidden entries and symlinks skipped).
pub fn walk(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let name = e.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
            let Ok(ft) = e.file_type() else { continue };
            let p = e.path();
            if ft.is_dir() {
                if depth < MAX_DEPTH {
                    stack.push((p, depth + 1));
                }
            } else if ft.is_file() && kind_of(&p).is_some() {
                out.push(p);
            }
        }
    }
    out
}

fn file_stamp(path: &Path) -> (u64, u64) {
    let m = std::fs::metadata(path).ok();
    let size = m.as_ref().map(|m| m.len()).unwrap_or(0);
    let mtime = m
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (size, mtime)
}

fn clean(s: Option<std::borrow::Cow<'_, str>>) -> Option<String> {
    s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Reads one file's tags (audio) or stream info (video).
pub fn read_track(path: &Path, source: Source) -> Option<Track> {
    let kind = kind_of(path)?;
    let (size, mtime) = file_stamp(path);
    let mut t = Track {
        path: path.to_string_lossy().into_owned(),
        kind,
        size,
        mtime,
        title: None,
        artist: None,
        album: None,
        album_artist: None,
        track_no: None,
        disc_no: None,
        year: None,
        duration: None,
        width: None,
        height: None,
        source,
        added_at: now_secs(),
        play_count: 0,
        last_played: None,
    };
    match kind {
        MediaKind::Audio => read_audio_tags(path, &mut t),
        MediaKind::Video => read_video_info(path, &mut t),
    }
    if kind == MediaKind::Audio && (t.title.is_none() || t.artist.is_none()) {
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            let (artist, title) = split_artist_title(stem);
            t.artist = t.artist.or(artist);
            t.title = t.title.or(Some(title));
        }
    }
    Some(t)
}

fn read_audio_tags(path: &Path, t: &mut Track) {
    let opts = ParseOptions::new().read_cover_art(false);
    let Ok(tagged) = lofty::probe::Probe::open(path).and_then(|p| p.options(opts).read()) else {
        // Unsupported by lofty (e.g. some APE/WMA variants): fall back to ffprobe.
        read_video_info(path, t);
        return;
    };
    t.duration = Some(tagged.properties().duration().as_secs_f64()).filter(|d| *d > 0.0);
    let mut tags: Vec<&lofty::tag::Tag> = Vec::new();
    if let Some(p) = tagged.primary_tag() {
        tags.push(p);
    }
    tags.extend(tagged.tags().iter());
    for tag in tags {
        t.title = t.title.take().or_else(|| clean(tag.title()));
        t.artist = t.artist.take().or_else(|| clean(tag.artist()));
        t.album = t.album.take().or_else(|| clean(tag.album()));
        t.album_artist = t
            .album_artist
            .take()
            .or_else(|| tag.get_string(ItemKey::AlbumArtist).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()));
        t.track_no = t.track_no.or_else(|| tag.track());
        t.disc_no = t.disc_no.or_else(|| tag.disk());
        t.year = t.year.or_else(|| tag.date().map(|d| d.year as i32));
    }
}

fn read_video_info(path: &Path, t: &mut Track) {
    let Ok(out) = std_command(&tools().ffprobe)
        .args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams"])
        .arg(path)
        .output()
    else {
        return;
    };
    let Ok(p) = Probe::parse(&String::from_utf8_lossy(&out.stdout)) else { return };
    t.duration = t.duration.or(p.duration());
    if let Some(v) = p.video() {
        t.width = v.width;
        t.height = v.height;
    }
    t.title = t.title.take().or_else(|| p.format_tag("title").map(|s| s.trim().to_string()).filter(|s| !s.is_empty()));
    if t.kind == MediaKind::Audio {
        t.artist = t.artist.take().or_else(|| p.format_tag("artist").map(str::to_string));
        t.album = t.album.take().or_else(|| p.format_tag("album").map(str::to_string));
    }
}

pub struct ScanResult {
    pub roots_ok: Vec<String>,
    pub tracks: Vec<Track>,
}

/// Scans `roots`. Files whose size and mtime match `known` reuse that record
/// instead of being parsed again. `progress(done, total)` is called as files
/// are processed.
pub fn scan(
    roots: &[String],
    excluded: &[String],
    known: &HashMap<String, Track>,
    progress: &(dyn Fn(usize, usize) + Sync),
) -> ScanResult {
    let mut roots_ok = Vec::new();
    let mut files = Vec::new();
    for r in roots {
        let root = Path::new(r);
        if root.is_dir() && std::fs::read_dir(root).is_ok() {
            roots_ok.push(r.clone());
            files.extend(walk(root));
        }
    }
    files.retain(|p| {
        let s = p.to_string_lossy();
        !excluded.iter().any(|e| is_under(&s, e))
    });
    files.sort();
    files.dedup();
    let total = files.len();
    let done = AtomicUsize::new(0);
    progress(0, total);
    let chunk = total.div_ceil(WORKERS).max(1);
    let mut tracks: Vec<Track> = std::thread::scope(|s| {
        let handles: Vec<_> = files
            .chunks(chunk)
            .map(|part| {
                let done = &done;
                s.spawn(move || {
                    let mut out = Vec::with_capacity(part.len());
                    for p in part {
                        let key = p.to_string_lossy();
                        let (size, mtime) = file_stamp(p);
                        let t = match known.get(key.as_ref()) {
                            Some(k) if k.size == size && k.mtime == mtime => Some(k.clone()),
                            _ => read_track(p, Source::Folder),
                        };
                        if let Some(t) = t {
                            out.push(t);
                        }
                        let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                        if n % 25 == 0 || n == total {
                            progress(n, total);
                        }
                    }
                    out
                })
            })
            .collect();
        handles.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
    });
    for t in &mut tracks {
        t.source = Source::Folder;
    }
    ScanResult { roots_ok, tracks }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walks_recursively_and_reuses_known() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("专辑 A");
        std::fs::create_dir_all(sub.join(".hidden")).unwrap();
        std::fs::write(sub.join("周杰伦 - 晴天.mp3"), b"not really mp3").unwrap();
        std::fs::write(sub.join("cover.jpg"), b"x").unwrap();
        std::fs::write(sub.join(".hidden").join("x.mp3"), b"x").unwrap();
        std::fs::write(dir.path().join("clip.mkv"), b"x").unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let r = scan(&[root.clone(), "/definitely/missing".into()], &[], &HashMap::new(), &|_, _| {});
        assert_eq!(r.roots_ok, vec![root.clone()]);
        assert_eq!(r.tracks.len(), 2);
        let song = r.tracks.iter().find(|t| t.kind == MediaKind::Audio).unwrap();
        assert_eq!(song.artist.as_deref(), Some("周杰伦"));
        assert_eq!(song.title.as_deref(), Some("晴天"));

        // Unchanged files are taken from `known` as-is.
        let mut known = HashMap::new();
        let mut k = song.clone();
        k.title = Some("cached".into());
        known.insert(k.path.clone(), k);
        let excluded = vec![dir.path().join("clip.mkv").to_string_lossy().into_owned()];
        let r2 = scan(&[root], &excluded, &known, &|_, _| {});
        assert_eq!(r2.tracks.len(), 1);
        assert_eq!(r2.tracks[0].title.as_deref(), Some("cached"));
    }
}
