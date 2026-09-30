//! Audio tag metadata (title / artist / album / cover / embedded lyrics).

use base64::Engine;
use lofty::prelude::*;
use lofty::picture::PictureType;
use lofty::tag::ItemKey;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioMeta {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    /// `data:` URL of the cover image.
    pub cover: Option<String>,
    pub duration: Option<f64>,
    #[serde(skip)]
    pub embedded_lyrics: Option<String>,
}

fn non_empty(s: Option<std::borrow::Cow<'_, str>>) -> Option<String> {
    s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn data_url(mime: &str, bytes: &[u8]) -> String {
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn sniff_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/jpeg"
    }
}

/// Reads tags with lofty. Missing values are filled in from folder images and
/// the "Artist - Title" file name convention.
pub fn read(path: &Path) -> AudioMeta {
    let mut meta = AudioMeta::default();
    if let Ok(tagged) = lofty::read_from_path(path) {
        meta.duration = Some(tagged.properties().duration().as_secs_f64()).filter(|d| *d > 0.0);
        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            meta.title = non_empty(tag.title());
            meta.artist = non_empty(tag.artist());
            meta.album = non_empty(tag.album());
            meta.embedded_lyrics = tag
                .get_string(ItemKey::Lyrics)
                .or_else(|| tag.get_string(ItemKey::UnsyncLyrics))
                .map(|s| s.to_string())
                .filter(|s| !s.trim().is_empty());
            let pics = tag.pictures();
            let pic = pics
                .iter()
                .find(|p| p.pic_type() == PictureType::CoverFront)
                .or_else(|| pics.first());
            if let Some(pic) = pic {
                let mime = pic
                    .mime_type()
                    .map(|m| m.as_str().to_string())
                    .filter(|m| m.starts_with("image/"))
                    .unwrap_or_else(|| sniff_mime(pic.data()).to_string());
                meta.cover = Some(data_url(&mime, pic.data()));
            }
        }
        // Other tag types in the same file may carry what the primary lacks.
        for tag in tagged.tags() {
            if meta.title.is_none() {
                meta.title = non_empty(tag.title());
            }
            if meta.artist.is_none() {
                meta.artist = non_empty(tag.artist());
            }
            if meta.cover.is_none() {
                if let Some(pic) = tag.pictures().first() {
                    meta.cover = Some(data_url(sniff_mime(pic.data()), pic.data()));
                }
            }
        }
    }
    if meta.cover.is_none() {
        meta.cover = folder_cover(path);
    }
    if meta.title.is_none() || meta.artist.is_none() {
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            let (artist, title) = split_artist_title(stem);
            if meta.artist.is_none() {
                meta.artist = artist;
            }
            if meta.title.is_none() {
                meta.title = Some(title);
            }
        }
    }
    meta
}

/// "周杰伦 - 晴天" -> (Some("周杰伦"), "晴天"); "01. 晴天" -> (None, "01. 晴天").
pub fn split_artist_title(stem: &str) -> (Option<String>, String) {
    for sep in [" - ", " – ", " — ", "－"] {
        if let Some((a, t)) = stem.split_once(sep) {
            let a = a.trim();
            let t = t.trim();
            if !a.is_empty() && !t.is_empty() && !a.chars().all(|c| c.is_ascii_digit()) {
                return (Some(a.to_string()), t.to_string());
            }
        }
    }
    (None, stem.trim().to_string())
}

fn folder_cover(path: &Path) -> Option<String> {
    let dir = path.parent()?;
    let stem = path.file_stem()?.to_string_lossy().to_lowercase();
    let wanted = [stem.as_str(), "cover", "folder", "front", "album", "albumart"];
    let entries: Vec<_> = std::fs::read_dir(dir).ok()?.filter_map(|e| e.ok()).collect();
    for want in wanted {
        for e in &entries {
            let p = e.path();
            let ext = super::kinds::ext_of(&p);
            if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp") {
                continue;
            }
            let s = p.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
            if s == want {
                let bytes = std::fs::read(&p).ok()?;
                if bytes.len() > 20 * 1024 * 1024 {
                    continue;
                }
                return Some(data_url(sniff_mime(&bytes), &bytes));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_artist_title() {
        assert_eq!(
            split_artist_title("周杰伦 - 晴天"),
            (Some("周杰伦".into()), "晴天".into())
        );
        assert_eq!(split_artist_title("01 - Intro"), (None, "01 - Intro".into()));
        assert_eq!(split_artist_title("Song"), (None, "Song".into()));
    }
}
