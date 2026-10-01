//! Cached thumbnails for the library grid: album art for audio, a frame for
//! video. Generated on demand by the local server and stored as JPEG.

use crate::media::kinds::{kind_of, MediaKind};
use crate::media::metadata;
use crate::media::transcode::file_key;
use crate::tools::{command, tools};
use once_cell::sync::Lazy;
use std::path::{Path, PathBuf};
use tokio::sync::Semaphore;

/// At most a few ffmpeg processes at once while a grid scrolls into view.
static LIMIT: Lazy<Semaphore> = Lazy::new(|| Semaphore::new(3));

pub fn thumbs_dir(cache_dir: &Path) -> PathBuf {
    cache_dir.join("thumbs")
}

/// Returns the cached thumbnail for `path`, creating it if needed. `None`
/// means the file has no artwork (or it could not be decoded).
pub async fn get(dir: &Path, path: &Path, size: u32) -> Option<PathBuf> {
    let kind = kind_of(path)?;
    let size = size.clamp(64, 512);
    let key = format!("{}-{size}", file_key(path));
    let out = dir.join(format!("{key}.jpg"));
    let miss = dir.join(format!("{key}.none"));
    if out.exists() {
        return Some(out);
    }
    if miss.exists() {
        return None;
    }
    let _permit = LIMIT.acquire().await.ok()?;
    if out.exists() {
        return Some(out);
    }
    std::fs::create_dir_all(dir).ok()?;
    let ok = match kind {
        MediaKind::Audio => audio_thumb(dir, path, &out, &key, size).await,
        MediaKind::Video => video_thumb(path, &out, size).await,
    };
    if ok && out.exists() {
        Some(out)
    } else {
        let _ = std::fs::write(&miss, b"");
        None
    }
}

async fn audio_thumb(dir: &Path, path: &Path, out: &Path, key: &str, size: u32) -> bool {
    let p = path.to_path_buf();
    let src = tokio::task::spawn_blocking(move || {
        metadata::embedded_cover(&p).map(Ok).or_else(|| metadata::folder_cover_path(&p).map(Err))
    })
    .await
    .ok()
    .flatten();
    let (input, tmp) = match src {
        Some(Ok(bytes)) => {
            let tmp = dir.join(format!("{key}.src"));
            if std::fs::write(&tmp, bytes).is_err() {
                return false;
            }
            (tmp.clone(), Some(tmp))
        }
        Some(Err(file)) => (file, None),
        None => return false,
    };
    let vf = format!("scale={size}:{size}:force_original_aspect_ratio=increase,crop={size}:{size}");
    let ok = ffmpeg_image(&["-i"], &input, &vf, out).await;
    if let Some(t) = tmp {
        let _ = std::fs::remove_file(t);
    }
    ok
}

async fn video_thumb(path: &Path, out: &Path, size: u32) -> bool {
    let dur = crate::media::probe::probe(path).await.ok().and_then(|p| p.duration()).unwrap_or(0.0);
    let at = format!("{:.2}", (dur * 0.1).min(60.0));
    let w = size * 3 / 2;
    let vf = format!("scale={w}:-2");
    ffmpeg_image(&["-ss", &at, "-i"], path, &vf, out).await
}

async fn ffmpeg_image(pre: &[&str], input: &Path, vf: &str, out: &Path) -> bool {
    let tmp = out.with_extension("tmp.jpg");
    let status = command(&tools().ffmpeg)
        .args(["-v", "error", "-y"])
        .args(pre)
        .arg(input)
        .args(["-frames:v", "1", "-vf", vf, "-q:v", "4"])
        .arg(&tmp)
        .status()
        .await;
    let ok = matches!(status, Ok(s) if s.success()) && tmp.exists();
    if ok {
        std::fs::rename(&tmp, out).is_ok()
    } else {
        let _ = std::fs::remove_file(&tmp);
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ffmpeg(args: &[&str]) -> bool {
        std::process::Command::new(&tools().ffmpeg)
            .args(["-hide_banner", "-loglevel", "error", "-y"])
            .args(args)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    fn jpeg_size(p: &Path) -> Option<(u32, u32)> {
        let out = std::process::Command::new(&tools().ffprobe)
            .args(["-v", "quiet", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0"])
            .arg(p)
            .output()
            .ok()?;
        let s = String::from_utf8_lossy(&out.stdout);
        let (w, h) = s.trim().split_once(',')?;
        Some((w.parse().ok()?, h.parse().ok()?))
    }

    #[tokio::test]
    async fn makes_cover_and_frame_thumbnails() {
        if !ffmpeg(&["-version"]) {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        let song = d.join("有封面.mp3");
        let s = song.to_string_lossy().into_owned();
        assert!(ffmpeg(&[
            "-f", "lavfi", "-i", "sine=duration=1", "-f", "lavfi", "-i", "color=red:s=600x400:d=1",
            "-map", "0", "-map", "1", "-c:v", "mjpeg", "-frames:v", "1", "-disposition:v", "attached_pic",
            "-id3v2_version", "3", &s,
        ]));
        let bare = d.join("sub").join("无封面.mp3");
        std::fs::create_dir_all(bare.parent().unwrap()).unwrap();
        assert!(ffmpeg(&["-f", "lavfi", "-i", "sine=duration=1", &bare.to_string_lossy()]));
        let clip = d.join("clip.mkv");
        assert!(ffmpeg(&["-f", "lavfi", "-i", "testsrc=size=640x360:rate=10:d=2", "-c:v", "mpeg4", &clip.to_string_lossy()]));

        let thumbs = d.join("thumbs");
        let a = get(&thumbs, &song, 128).await.expect("cover thumbnail");
        assert_eq!(jpeg_size(&a), Some((128, 128)));
        // Cached on the second call.
        assert_eq!(get(&thumbs, &song, 128).await, Some(a));
        assert!(get(&thumbs, &bare, 128).await.is_none());
        let v = get(&thumbs, &clip, 128).await.expect("video frame");
        assert_eq!(jpeg_size(&v), Some((192, 108)));
    }
}
