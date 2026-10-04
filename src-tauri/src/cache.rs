//! "Delete cache files": the converted audio copies and the library
//! thumbnails, all made again on demand. Streams being played (HLS sessions,
//! the file the player has open) are left alone.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

const DIRS: &[&str] = &["audio", "thumbs"];

fn files(cache_dir: &Path) -> Vec<(PathBuf, u64)> {
    DIRS.iter()
        .filter_map(|d| std::fs::read_dir(cache_dir.join(d)).ok())
        .flatten()
        .flatten()
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            m.is_file().then(|| (e.path(), m.len()))
        })
        .collect()
}

/// Bytes the cache takes.
pub fn size(cache_dir: &Path) -> u64 {
    files(cache_dir).iter().map(|f| f.1).sum()
}

/// Deletes the cache files except `keep`; returns the bytes freed.
pub fn clear(cache_dir: &Path, keep: &HashSet<PathBuf>) -> u64 {
    files(cache_dir)
        .into_iter()
        .filter(|(p, _)| !keep.contains(p))
        .filter(|(p, _)| std::fs::remove_file(p).is_ok())
        .map(|(_, len)| len)
        .sum()
}

/// The local file behind a media server `/file?p=` URL.
pub fn served_path(url: &str) -> Option<PathBuf> {
    let u = reqwest::Url::parse(url).ok()?;
    if !u.path().ends_with("/file") {
        return None;
    }
    u.query_pairs().find(|(k, _)| k == "p").map(|(_, v)| PathBuf::from(v.into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clears_all_but_the_files_in_use() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for d in ["audio", "thumbs", "hls/abc"] {
            std::fs::create_dir_all(root.join(d)).unwrap();
        }
        let playing = root.join("audio/a 1.wav");
        std::fs::write(&playing, [0u8; 10]).unwrap();
        std::fs::write(root.join("audio/b.wav"), [0u8; 20]).unwrap();
        std::fs::write(root.join("thumbs/c-256.jpg"), [0u8; 5]).unwrap();
        std::fs::write(root.join("hls/abc/index.m3u8"), [0u8; 7]).unwrap();
        assert_eq!(size(root), 35);

        let url = format!("http://127.0.0.1:1234/tok/file?p={}", crate::server::urlencode(&playing.to_string_lossy()));
        assert_eq!(served_path(&url).as_deref(), Some(playing.as_path()));
        assert_eq!(served_path("http://127.0.0.1:1234/tok/hls/x/index.m3u8"), None);

        let keep: HashSet<PathBuf> = [served_path(&url).unwrap()].into();
        assert_eq!(clear(root, &keep), 25);
        assert!(playing.is_file());
        assert!(root.join("hls/abc/index.m3u8").is_file());
        assert_eq!(size(root), 10);
    }
}
