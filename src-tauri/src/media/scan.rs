use super::kinds::{kind_of, MediaKind};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaEntry {
    pub path: String,
    pub file_name: String,
    pub name: String,
    pub kind: MediaKind,
    pub size: u64,
}

impl MediaEntry {
    pub fn from_path(path: &Path, kind: MediaKind) -> Self {
        let file_name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let name = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| file_name.clone());
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        MediaEntry {
            path: path.to_string_lossy().into_owned(),
            file_name,
            name,
            kind,
            size,
        }
    }
}

/// Lists media files of `kind` in the same directory as `path` (non-recursive),
/// naturally sorted by file name ("2" before "10"). The current file is always
/// included even if its extension is unusual.
pub fn scan_siblings(path: &Path, kind: MediaKind) -> Vec<MediaEntry> {
    let Some(dir) = path.parent() else {
        return vec![MediaEntry::from_path(path, kind)];
    };
    let mut entries: Vec<MediaEntry> = match std::fs::read_dir(dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
            .map(|e| e.path())
            .filter(|p| {
                let hidden = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with('.'))
                    .unwrap_or(true);
                !hidden && kind_of(p) == Some(kind)
            })
            .map(|p| MediaEntry::from_path(&p, kind))
            .collect(),
        Err(_) => Vec::new(),
    };
    let current = path.to_string_lossy();
    if !entries.iter().any(|e| e.path == current) {
        entries.push(MediaEntry::from_path(path, kind));
    }
    entries.sort_by(|a, b| natord::compare_ignore_case(&a.file_name, &b.file_name));
    entries
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn scans_same_kind_with_natural_order() {
        let dir = tempfile::tempdir().unwrap();
        for f in ["10 b.mp3", "2 a.flac", "1.mp4", "cover.jpg", ".hidden.mp3", "song.lrc", "3.MKV"] {
            File::create(dir.path().join(f)).unwrap();
        }
        let audio = scan_siblings(&dir.path().join("2 a.flac"), MediaKind::Audio);
        let names: Vec<_> = audio.iter().map(|e| e.file_name.as_str()).collect();
        assert_eq!(names, vec!["2 a.flac", "10 b.mp3"]);

        let video = scan_siblings(&dir.path().join("1.mp4"), MediaKind::Video);
        let names: Vec<_> = video.iter().map(|e| e.file_name.as_str()).collect();
        assert_eq!(names, vec!["1.mp4", "3.MKV"]);
    }
}
