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

/// Above `limit` bytes, deletes the least recently used cache files (except
/// `keep`) until the cache is down to `target`; returns the bytes freed.
pub fn trim(cache_dir: &Path, limit: u64, target: u64, keep: &HashSet<PathBuf>) -> u64 {
    let mut all: Vec<(PathBuf, u64, std::time::SystemTime)> = DIRS
        .iter()
        .filter_map(|d| std::fs::read_dir(cache_dir.join(d)).ok())
        .flatten()
        .flatten()
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            let used = m.accessed().ok().into_iter().chain(m.modified().ok()).max()?;
            m.is_file().then(|| (e.path(), m.len(), used))
        })
        .collect();
    let mut total: u64 = all.iter().map(|f| f.1).sum();
    if total <= limit {
        return 0;
    }
    all.sort_by_key(|f| f.2);
    let mut freed = 0;
    for (p, len, _) in all {
        if total <= target {
            break;
        }
        if keep.contains(&p) || std::fs::remove_file(&p).is_err() {
            continue;
        }
        total -= len;
        freed += len;
    }
    freed
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

    #[test]
    fn trims_the_oldest_files_past_the_limit() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("audio")).unwrap();
        let old = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
        for (name, age) in [("a.wav", 3), ("b.wav", 2), ("c.wav", 1)] {
            let p = root.join("audio").join(name);
            std::fs::write(&p, [0u8; 10]).unwrap();
            let t = old + std::time::Duration::from_secs(60 * (3 - age));
            let f = std::fs::File::options().write(true).open(&p).unwrap();
            f.set_times(std::fs::FileTimes::new().set_accessed(t).set_modified(t)).unwrap();
        }
        let none = HashSet::new();
        assert_eq!(trim(root, 30, 10, &none), 0);
        let keep: HashSet<PathBuf> = [root.join("audio/a.wav")].into();
        assert_eq!(trim(root, 25, 20, &keep), 10);
        assert!(root.join("audio/a.wav").is_file());
        assert!(!root.join("audio/b.wav").exists());
        assert!(root.join("audio/c.wav").is_file());
    }
}
