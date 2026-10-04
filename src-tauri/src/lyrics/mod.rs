//! Finding, loading and saving lyrics.
//!
//! Lookup order: same-name file next to the media (`.lrc`, then `.srt`/`.vtt`,
//! then `.txt`) → user/reviewed entry in the app lyrics library → embedded tag
//! lyrics → AI-generated library entry.

pub mod encoding;

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Origin {
    Sidecar,
    Embedded,
    Library,
    Ai,
    AiReviewed,
    /// From an online music service.
    Online,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsPayload {
    pub content: String,
    pub origin: Origin,
    /// "lrc" | "srt" | "vtt" | "txt"
    pub format: String,
    pub path: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LibraryMeta {
    origin: Origin,
    media_path: String,
    #[serde(default)]
    model: Option<String>,
}

pub struct LyricsLibrary {
    dir: PathBuf,
}

fn key(media: &Path) -> String {
    let mut h = Sha1::new();
    h.update(media.to_string_lossy().as_bytes());
    hex::encode(h.finalize())
}

const SIDECAR_EXTS: &[&str] = &["lrc", "srt", "vtt", "txt"];

/// Finds `<stem>.<ext>` (case-insensitive) or `<stem>.<anything>.lrc` next to the media.
pub fn find_sidecar(media: &Path) -> Option<(PathBuf, String)> {
    let dir = media.parent()?;
    let stem = media.file_stem()?.to_string_lossy().to_lowercase();
    let entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    for ext in SIDECAR_EXTS {
        let exact = entries.iter().find(|p| {
            crate::media::kinds::ext_of(p) == *ext
                && p.file_stem().map(|s| s.to_string_lossy().to_lowercase() == stem).unwrap_or(false)
        });
        if let Some(p) = exact {
            return Some((p.clone(), ext.to_string()));
        }
        if *ext == "lrc" {
            // e.g. "song.zh.lrc" / "song.ai.lrc"
            let prefix = format!("{stem}.");
            let loose = entries.iter().find(|p| {
                crate::media::kinds::ext_of(p) == "lrc"
                    && p.file_stem()
                        .map(|s| s.to_string_lossy().to_lowercase().starts_with(&prefix))
                        .unwrap_or(false)
            });
            if let Some(p) = loose {
                return Some((p.clone(), "lrc".to_string()));
            }
        }
    }
    None
}

pub fn read_text_file(path: &Path) -> AppResult<String> {
    let bytes = std::fs::read(path)?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err(AppError::msg("歌词文件过大"));
    }
    Ok(encoding::decode(&bytes))
}

impl LyricsLibrary {
    pub fn new(data_dir: &Path) -> Self {
        let dir = data_dir.join("lyrics");
        let _ = std::fs::create_dir_all(&dir);
        LyricsLibrary { dir }
    }

    fn entry(&self, media: &Path) -> Option<(String, LibraryMeta, PathBuf)> {
        let k = key(media);
        let lrc = self.dir.join(format!("{k}.lrc"));
        let meta_path = self.dir.join(format!("{k}.json"));
        let content = std::fs::read_to_string(&lrc).ok()?;
        let meta = std::fs::read_to_string(meta_path)
            .ok()
            .and_then(|m| serde_json::from_str(&m).ok())
            .unwrap_or(LibraryMeta {
                origin: Origin::Library,
                media_path: media.to_string_lossy().into_owned(),
                model: None,
            });
        Some((content, meta, lrc))
    }

    pub fn save(&self, media: &Path, content: &str, origin: Origin, model: Option<String>) -> AppResult<PathBuf> {
        let k = key(media);
        let lrc = self.dir.join(format!("{k}.lrc"));
        std::fs::write(&lrc, content)?;
        let meta = LibraryMeta { origin, media_path: media.to_string_lossy().into_owned(), model };
        std::fs::write(self.dir.join(format!("{k}.json")), serde_json::to_string_pretty(&meta)?)?;
        Ok(lrc)
    }

    pub fn remove(&self, media: &Path) {
        let k = key(media);
        let _ = std::fs::remove_file(self.dir.join(format!("{k}.lrc")));
        let _ = std::fs::remove_file(self.dir.join(format!("{k}.json")));
    }

    pub fn find(&self, media: &Path, embedded: Option<String>) -> Option<LyricsPayload> {
        if let Some((path, ext)) = find_sidecar(media) {
            if let Ok(content) = read_text_file(&path) {
                if !content.trim().is_empty() {
                    return Some(LyricsPayload {
                        content,
                        origin: Origin::Sidecar,
                        format: ext,
                        path: Some(path.to_string_lossy().into_owned()),
                        model: None,
                    });
                }
            }
        }
        let lib = self.entry(media);
        if let Some((content, meta, path)) = &lib {
            if meta.origin != Origin::Ai {
                return Some(LyricsPayload {
                    content: content.clone(),
                    origin: meta.origin,
                    format: "lrc".into(),
                    path: Some(path.to_string_lossy().into_owned()),
                    model: meta.model.clone(),
                });
            }
        }
        if let Some(text) = embedded {
            let format = if text.contains("[0") || text.contains("[1") { "lrc" } else { "txt" };
            return Some(LyricsPayload {
                content: text,
                origin: Origin::Embedded,
                format: format.into(),
                path: None,
                model: None,
            });
        }
        lib.map(|(content, meta, path)| LyricsPayload {
            content,
            origin: meta.origin,
            format: "lrc".into(),
            path: Some(path.to_string_lossy().into_owned()),
            model: meta.model,
        })
    }
}

/// Writes `<stem>.lrc` next to the media. An existing, different file is kept
/// as `<stem>.lrc.bak`.
pub fn save_same_dir(media: &Path, content: &str) -> AppResult<PathBuf> {
    let dir = media.parent().ok_or_else(|| AppError::msg("无效的媒体路径"))?;
    let stem = media.file_stem().ok_or_else(|| AppError::msg("无效的媒体路径"))?;
    let target = dir.join(format!("{}.lrc", stem.to_string_lossy()));
    if target.is_file() {
        let old = std::fs::read(&target).unwrap_or_default();
        if old != content.as_bytes() {
            let bak = dir.join(format!("{}.lrc.bak", stem.to_string_lossy()));
            std::fs::copy(&target, bak)?;
        }
    }
    std::fs::write(&target, content).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            AppError::msg("媒体所在目录不可写")
        } else {
            AppError::Io(e)
        }
    })?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_order_and_saving() {
        let media_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        let lib = LyricsLibrary::new(data_dir.path());
        let media = media_dir.path().join("Song.flac");
        std::fs::write(&media, b"").unwrap();

        assert!(lib.find(&media, None).is_none());

        lib.save(&media, "[00:01.00]ai", Origin::Ai, Some("base".into())).unwrap();
        let found = lib.find(&media, Some("embedded words".into())).unwrap();
        assert_eq!(found.origin, Origin::Embedded, "embedded beats unreviewed AI");
        assert_eq!(found.format, "txt");

        let found = lib.find(&media, None).unwrap();
        assert_eq!(found.origin, Origin::Ai);
        assert_eq!(found.model.as_deref(), Some("base"));

        let (gbk, _, _) = encoding_rs::GBK.encode("[00:02.00]本地歌词");
        std::fs::write(media_dir.path().join("song.LRC"), &gbk).unwrap();
        let found = lib.find(&media, None).unwrap();
        assert_eq!(found.origin, Origin::Sidecar);
        assert_eq!(found.content, "[00:02.00]本地歌词");

        let saved = save_same_dir(&media, "[00:03.00]new").unwrap();
        assert_eq!(saved.file_name().unwrap(), "Song.lrc");
        assert!(saved.exists());
    }

    #[test]
    fn backs_up_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let media = dir.path().join("a.mp3");
        std::fs::write(dir.path().join("a.lrc"), "old").unwrap();
        save_same_dir(&media, "new").unwrap();
        assert_eq!(std::fs::read_to_string(dir.path().join("a.lrc.bak")).unwrap(), "old");
        assert_eq!(std::fs::read_to_string(dir.path().join("a.lrc")).unwrap(), "new");
    }
}
