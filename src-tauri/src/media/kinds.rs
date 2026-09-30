use serde::{Deserialize, Serialize};
use std::path::Path;

pub const AUDIO_EXTS: &[&str] = &[
    "mp3", "flac", "wav", "m4a", "m4b", "aac", "ogg", "oga", "opus", "ape", "wma", "aiff", "aif",
    "aifc", "alac", "wv", "dsf", "dff", "tta", "mka", "caf", "ac3", "dts", "amr", "mpc", "spx",
    "mp2", "au",
];

pub const VIDEO_EXTS: &[&str] = &[
    "mp4", "m4v", "mov", "mkv", "avi", "webm", "flv", "f4v", "wmv", "asf", "ts", "m2ts", "mts",
    "mpg", "mpeg", "3gp", "3g2", "rmvb", "rm", "vob", "ogv", "divx", "mxf",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Audio,
    Video,
}

pub fn ext_of(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default()
}

pub fn kind_of(path: &Path) -> Option<MediaKind> {
    let ext = ext_of(path);
    if AUDIO_EXTS.contains(&ext.as_str()) {
        Some(MediaKind::Audio)
    } else if VIDEO_EXTS.contains(&ext.as_str()) {
        Some(MediaKind::Video)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_by_extension() {
        assert_eq!(kind_of(Path::new("/a/b.MP3")), Some(MediaKind::Audio));
        assert_eq!(kind_of(Path::new("x.flac")), Some(MediaKind::Audio));
        assert_eq!(kind_of(Path::new("x.mkv")), Some(MediaKind::Video));
        assert_eq!(kind_of(Path::new("x.lrc")), None);
        assert_eq!(kind_of(Path::new("noext")), None);
    }
}
