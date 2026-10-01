//! Media library: watched folders, played/added files, favourites and user
//! playlists, persisted as one JSON document in the app data directory.

pub mod scan;
pub mod thumb;

use crate::error::{AppError, AppResult};
use crate::media::kinds::{kind_of, MediaKind};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// Found by scanning a library folder.
    Folder,
    /// Recorded automatically because it was played.
    Played,
    /// Added explicitly (dropped onto the library page).
    Added,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub path: String,
    pub added_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub path: String,
    pub kind: MediaKind,
    pub size: u64,
    pub mtime: u64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub year: Option<i32>,
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub source: Source,
    pub added_at: u64,
    #[serde(default)]
    pub play_count: u32,
    #[serde(default)]
    pub last_played: Option<u64>,
}

impl Track {
    /// Copies the file/tag fields of a fresh scan while keeping user stats.
    fn refresh_from(&mut self, fresh: &Track) {
        let (source, added_at, play_count, last_played) = (self.source, self.added_at, self.play_count, self.last_played);
        *self = fresh.clone();
        self.source = source;
        self.added_at = added_at;
        self.play_count = play_count;
        self.last_played = last_played;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub items: Vec<String>,
    pub created_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Library {
    pub folders: Vec<Folder>,
    pub tracks: Vec<Track>,
    pub favorites: Vec<String>,
    pub playlists: Vec<Playlist>,
    /// Folder files the user removed from the library.
    pub excluded: Vec<String>,
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// True when `path` is `root` or lies inside it.
pub fn is_under(path: &str, root: &str) -> bool {
    let root = root.trim_end_matches(['/', '\\']);
    path == root
        || (path.len() > root.len()
            && path.starts_with(root)
            && matches!(path.as_bytes()[root.len()], b'/' | b'\\'))
}

impl Library {
    pub fn index_of(&self, path: &str) -> Option<usize> {
        self.tracks.iter().position(|t| t.path == path)
    }

    fn under_folder(&self, path: &str) -> bool {
        self.folders.iter().any(|f| is_under(path, &f.path))
    }

    /// Adds a folder; nested duplicates are merged into the outer folder.
    pub fn add_folder(&mut self, path: &str) -> bool {
        let path = path.trim_end_matches(['/', '\\']).to_string();
        if path.is_empty() || self.folders.iter().any(|f| is_under(&path, &f.path)) {
            return false;
        }
        self.folders.retain(|f| !is_under(&f.path, &path));
        self.folders.push(Folder { path, added_at: now_secs() });
        true
    }

    /// Removes a folder and the tracks that only it contributed.
    pub fn remove_folder(&mut self, path: &str) {
        self.folders.retain(|f| f.path != path);
        let folders = self.folders.clone();
        self.tracks.retain(|t| {
            t.source != Source::Folder || !is_under(&t.path, path) || folders.iter().any(|f| is_under(&t.path, &f.path))
        });
        self.excluded.retain(|p| !is_under(p, path));
    }

    /// Merges the result of a folder scan. `scanned` holds every media file
    /// found under the folders in `roots_ok` (roots that could be read).
    pub fn merge_scan(&mut self, roots_ok: &[String], scanned: Vec<Track>) {
        let found: HashSet<String> = scanned.iter().map(|t| t.path.clone()).collect();
        // Folder files that disappeared from a readable root are dropped;
        // roots that are offline (e.g. an unplugged drive) keep their tracks.
        self.tracks.retain(|t| {
            t.source != Source::Folder || found.contains(&t.path) || !roots_ok.iter().any(|r| is_under(&t.path, r))
        });
        let mut idx: HashMap<String, usize> = self.tracks.iter().enumerate().map(|(i, t)| (t.path.clone(), i)).collect();
        for fresh in scanned {
            if let Some(&i) = idx.get(&fresh.path) {
                let t = &mut self.tracks[i];
                t.refresh_from(&fresh);
                t.source = Source::Folder;
            } else {
                idx.insert(fresh.path.clone(), self.tracks.len());
                self.tracks.push(fresh);
            }
        }
    }

    /// Adds loose files (played or dropped). Returns how many were new.
    pub fn add_files(&mut self, tracks: Vec<Track>) -> usize {
        let mut added = 0;
        for t in tracks {
            self.excluded.retain(|p| p != &t.path);
            if let Some(i) = self.index_of(&t.path) {
                if t.source == Source::Added && self.tracks[i].source == Source::Played {
                    self.tracks[i].source = Source::Added;
                }
                continue;
            }
            self.tracks.push(t);
            added += 1;
        }
        added
    }

    pub fn record_play(&mut self, path: &str) {
        if let Some(i) = self.index_of(path) {
            let t = &mut self.tracks[i];
            t.play_count += 1;
            t.last_played = Some(now_secs());
        }
    }

    /// Removes tracks. Folder files are remembered as excluded so a rescan
    /// doesn't bring them back.
    pub fn remove_tracks(&mut self, paths: &[String]) {
        let set: HashSet<&String> = paths.iter().collect();
        for p in paths {
            if self.under_folder(p) && !self.excluded.contains(p) {
                self.excluded.push(p.clone());
            }
        }
        self.tracks.retain(|t| !set.contains(&t.path));
        self.favorites.retain(|p| !set.contains(p));
    }

    pub fn set_favorite(&mut self, path: &str, on: bool) {
        self.favorites.retain(|p| p != path);
        if on {
            self.favorites.insert(0, path.to_string());
        }
    }

    pub fn create_playlist(&mut self, name: &str, items: Vec<String>) -> String {
        let id = format!("pl{:x}", rand::random::<u64>());
        let name = if name.trim().is_empty() { "新建歌单".to_string() } else { name.trim().to_string() };
        self.playlists.push(Playlist { id: id.clone(), name, items: dedupe(items), created_at: now_secs() });
        id
    }

    pub fn playlist_mut(&mut self, id: &str) -> AppResult<&mut Playlist> {
        self.playlists
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| AppError::msg("歌单不存在"))
    }

    pub fn delete_playlist(&mut self, id: &str) {
        self.playlists.retain(|p| p.id != id);
    }
}

fn dedupe(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    items.into_iter().filter(|p| seen.insert(p.clone())).collect()
}

/// The library document plus its file and scan state.
pub struct LibraryStore {
    file: PathBuf,
    pub data: Mutex<Library>,
    pub scanning: AtomicBool,
}

impl LibraryStore {
    pub fn load(data_dir: &Path) -> Self {
        let file = data_dir.join("library.json");
        let data = std::fs::read_to_string(&file)
            .ok()
            .and_then(|s| serde_json::from_str::<Library>(&s).ok())
            .unwrap_or_default();
        LibraryStore { file, data: Mutex::new(data), scanning: AtomicBool::new(false) }
    }

    pub fn snapshot(&self) -> Library {
        self.data.lock().unwrap().clone()
    }

    /// Applies `f` and writes the document atomically.
    pub fn update<R>(&self, f: impl FnOnce(&mut Library) -> R) -> AppResult<R> {
        let (r, json) = {
            let mut lib = self.data.lock().unwrap();
            let r = f(&mut lib);
            (r, serde_json::to_string(&*lib)?)
        };
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = self.file.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, &self.file)?;
        Ok(r)
    }
}

/// Media files among `paths`; directories are returned separately.
pub fn split_paths(paths: &[String]) -> (Vec<PathBuf>, Vec<String>) {
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    for p in paths {
        let pb = PathBuf::from(p);
        if pb.is_dir() {
            dirs.push(p.clone());
        } else if pb.is_file() && kind_of(&pb).is_some() {
            files.push(pb);
        }
    }
    (files, dirs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(path: &str, source: Source) -> Track {
        Track {
            path: path.into(),
            kind: MediaKind::Audio,
            size: 1,
            mtime: 1,
            title: Some(path.into()),
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
            added_at: 0,
            play_count: 0,
            last_played: None,
        }
    }

    #[test]
    fn under_checks_boundaries() {
        assert!(is_under("/music/a.mp3", "/music"));
        assert!(is_under("/music/a.mp3", "/music/"));
        assert!(!is_under("/musicx/a.mp3", "/music"));
        assert!(is_under("/music", "/music"));
    }

    #[test]
    fn folders_merge_nested() {
        let mut l = Library::default();
        assert!(l.add_folder("/m/pop"));
        assert!(l.add_folder("/m"));
        assert!(!l.add_folder("/m/rock"));
        assert_eq!(l.folders.len(), 1);
        assert_eq!(l.folders[0].path, "/m");
    }

    #[test]
    fn merge_keeps_stats_and_offline_roots() {
        let mut l = Library::default();
        l.add_folder("/m");
        l.add_folder("/usb");
        l.merge_scan(&["/m".into(), "/usb".into()], vec![track("/m/a.mp3", Source::Folder), track("/usb/b.mp3", Source::Folder)]);
        l.record_play("/m/a.mp3");
        // Rescan: a.mp3 changed, /usb offline.
        let mut a = track("/m/a.mp3", Source::Folder);
        a.title = Some("new".into());
        l.merge_scan(&["/m".into()], vec![a]);
        assert_eq!(l.tracks.len(), 2);
        let a = &l.tracks[l.index_of("/m/a.mp3").unwrap()];
        assert_eq!(a.title.as_deref(), Some("new"));
        assert_eq!(a.play_count, 1);
        // Rescan with the file gone.
        l.merge_scan(&["/m".into(), "/usb".into()], vec![track("/usb/b.mp3", Source::Folder)]);
        assert!(l.index_of("/m/a.mp3").is_none());
    }

    #[test]
    fn played_files_survive_scans_and_become_folder_tracks() {
        let mut l = Library::default();
        l.add_files(vec![track("/x/p.mp3", Source::Played), track("/m/q.mp3", Source::Played)]);
        l.add_folder("/m");
        l.merge_scan(&["/m".into()], vec![track("/m/q.mp3", Source::Folder)]);
        assert_eq!(l.tracks.len(), 2);
        assert_eq!(l.tracks[l.index_of("/m/q.mp3").unwrap()].source, Source::Folder);
        assert_eq!(l.tracks[l.index_of("/x/p.mp3").unwrap()].source, Source::Played);
    }

    #[test]
    fn removed_folder_tracks_are_excluded() {
        let mut l = Library::default();
        l.add_folder("/m");
        l.merge_scan(&["/m".into()], vec![track("/m/a.mp3", Source::Folder)]);
        l.set_favorite("/m/a.mp3", true);
        l.remove_tracks(&["/m/a.mp3".into()]);
        assert!(l.tracks.is_empty() && l.favorites.is_empty());
        assert_eq!(l.excluded, vec!["/m/a.mp3".to_string()]);
        l.remove_folder("/m");
        assert!(l.excluded.is_empty() && l.folders.is_empty());
    }

    #[test]
    fn playlists_and_persistence() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::load(dir.path());
        let id = store
            .update(|l| l.create_playlist(" 我的最爱 ", vec!["/a".into(), "/b".into(), "/a".into()]))
            .unwrap();
        store
            .update(|l| {
                let p = l.playlist_mut(&id).unwrap();
                p.items = vec!["/b".into(), "/a".into()];
                p.name = "改名".into();
            })
            .unwrap();
        let again = LibraryStore::load(dir.path()).snapshot();
        assert_eq!(again.playlists.len(), 1);
        assert_eq!(again.playlists[0].name, "改名");
        assert_eq!(again.playlists[0].items, vec!["/b".to_string(), "/a".to_string()]);
        store.update(|l| l.delete_playlist(&id)).unwrap();
        assert!(LibraryStore::load(dir.path()).snapshot().playlists.is_empty());
    }
}
