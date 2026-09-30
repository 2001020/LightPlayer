//! ffmpeg-backed conversions: cached audio decode and live HLS sessions.

use super::probe::Probe;
use super::router::Caps;
use crate::error::{AppError, AppResult};
use crate::tools::{command, has_encoder, tools};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Child;

/// Maximum size of the transcoded-audio cache.
const AUDIO_CACHE_LIMIT: u64 = 2 * 1024 * 1024 * 1024;

pub fn file_key(path: &Path) -> String {
    let meta = std::fs::metadata(path).ok();
    let mut h = Sha1::new();
    h.update(path.to_string_lossy().as_bytes());
    if let Some(m) = meta {
        h.update(m.len().to_le_bytes());
        if let Ok(t) = m.modified() {
            if let Ok(d) = t.duration_since(std::time::UNIX_EPOCH) {
                h.update(d.as_secs().to_le_bytes());
            }
        }
    }
    hex::encode(&h.finalize()[..10])
}

/// Decodes any audio file to FLAC (or WAV when FLAC is unsupported) in the cache
/// directory and returns the cached path. Subsequent calls are instant.
pub async fn audio_to_cache(path: &Path, probe: &Probe, caps: &Caps, cache_dir: &Path) -> AppResult<PathBuf> {
    let dir = cache_dir.join("audio");
    tokio::fs::create_dir_all(&dir).await?;
    let ext = if caps.flac { "flac" } else { "wav" };
    let out = dir.join(format!("{}.{ext}", file_key(path)));
    if out.is_file() {
        let _ = filetime_touch(&out);
        return Ok(out);
    }
    let tmp = dir.join(format!("{}.part.{ext}", file_key(path)));
    let mut cmd = command(&tools().ffmpeg);
    cmd.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i"])
        .arg(path)
        .args(["-map", "0:a:0", "-vn", "-sn", "-map_metadata", "-1"]);
    let sr = probe.audio().and_then(|a| a.sample_rate).unwrap_or(44100.0);
    if sr > 192_000.0 {
        // DSD and friends decode to absurd PCM rates.
        cmd.args(["-ar", "96000"]);
    }
    if ext == "flac" {
        cmd.args(["-c:a", "flac", "-compression_level", "0"]);
    } else {
        cmd.args(["-c:a", "pcm_s16le"]);
    }
    cmd.arg(&tmp);
    let res = cmd.output().await?;
    if !res.status.success() {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(AppError::msg(format!(
            "音频转换失败：{}",
            String::from_utf8_lossy(&res.stderr).trim()
        )));
    }
    tokio::fs::rename(&tmp, &out).await?;
    prune_dir(&dir, AUDIO_CACHE_LIMIT);
    Ok(out)
}

fn filetime_touch(p: &Path) -> std::io::Result<()> {
    let f = std::fs::OpenOptions::new().append(true).open(p)?;
    f.set_modified(std::time::SystemTime::now())
}

/// Deletes the oldest files until the directory is below `limit` bytes.
pub fn prune_dir(dir: &Path, limit: u64) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<(std::time::SystemTime, u64, PathBuf)> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            m.is_file().then(|| (m.modified().unwrap_or(std::time::UNIX_EPOCH), m.len(), e.path()))
        })
        .collect();
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    files.sort_by_key(|f| f.0);
    for (_, len, p) in files {
        if total <= limit {
            break;
        }
        if std::fs::remove_file(&p).is_ok() {
            total = total.saturating_sub(len);
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HlsMode {
    Copy,
    Transcode,
}

struct Session {
    dir: PathBuf,
    child: Option<Child>,
    stderr: Arc<Mutex<String>>,
}

/// Owns the running ffmpeg HLS processes. Only the newest session is kept
/// alive: starting a new one (seek / next track) tears down the previous.
pub struct HlsManager {
    root: PathBuf,
    sessions: Mutex<HashMap<String, Session>>,
}

pub struct HlsStart {
    pub id: String,
    pub base_offset: f64,
}

impl HlsManager {
    pub fn new(cache_dir: &Path) -> Self {
        let root = cache_dir.join("hls");
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::create_dir_all(&root);
        HlsManager { root, sessions: Mutex::new(HashMap::new()) }
    }

    pub fn session_dir(&self, id: &str) -> Option<PathBuf> {
        self.sessions.lock().unwrap().get(id).map(|s| s.dir.clone())
    }

    /// Returns (is_running, last stderr) for a session.
    pub fn status(&self, id: &str) -> Option<(bool, String)> {
        let mut map = self.sessions.lock().unwrap();
        let s = map.get_mut(id)?;
        let running = match s.child.as_mut() {
            Some(c) => matches!(c.try_wait(), Ok(None)),
            None => false,
        };
        let err = s.stderr.lock().unwrap().clone();
        Some((running, err))
    }

    pub fn stop_all(&self) {
        let mut map = self.sessions.lock().unwrap();
        for (_, mut s) in map.drain() {
            if let Some(mut c) = s.child.take() {
                let _ = c.start_kill();
            }
            let dir = s.dir.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(500));
                let _ = std::fs::remove_dir_all(dir);
            });
        }
    }

    pub async fn start(&self, path: &Path, probe: &Probe, start: f64, mode: HlsMode) -> AppResult<HlsStart> {
        self.stop_all();
        let id = format!("{:016x}", rand::random::<u64>());
        let dir = self.root.join(&id);
        tokio::fs::create_dir_all(&dir).await?;

        let mut base_offset = start.max(0.0);
        if mode == HlsMode::Copy && base_offset > 0.5 {
            if let Some(k) = keyframe_before(path, probe, base_offset).await {
                base_offset = k;
            }
        }

        let video = probe.video();
        let audio = probe.audio();
        let mut cmd = command(&tools().ffmpeg);
        cmd.args(["-hide_banner", "-loglevel", "error", "-nostdin"]);
        if base_offset > 0.0 {
            cmd.args(["-ss", &format!("{base_offset:.3}")]);
        }
        cmd.arg("-i").arg(path);
        cmd.args(["-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1"]);

        match mode {
            HlsMode::Copy => {
                cmd.args(["-c:v", "copy"]);
                if video.map(|v| v.codec_name == "hevc").unwrap_or(false) {
                    cmd.args(["-tag:v", "hvc1"]);
                }
            }
            HlsMode::Transcode => {
                let height = video.and_then(|v| v.height).unwrap_or(1080);
                let scale = "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p";
                cmd.args(["-vf", scale]);
                if has_encoder("h264_videotoolbox").await {
                    let br = match height {
                        0..=480 => "2500k",
                        481..=720 => "5000k",
                        721..=1080 => "9000k",
                        _ => "20000k",
                    };
                    cmd.args(["-c:v", "h264_videotoolbox", "-b:v", br, "-realtime", "1", "-allow_sw", "1"]);
                } else if has_encoder("libx264").await {
                    cmd.args(["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-tune", "zerolatency"]);
                } else {
                    cmd.args(["-c:v", "h264"]);
                }
                cmd.args(["-profile:v", "high", "-force_key_frames", "expr:gte(t,n_forced*2)"]);
            }
        }

        let copy_audio = audio
            .map(|a| a.codec_name == "aac" && a.channels.unwrap_or(2) <= 2)
            .unwrap_or(false);
        if copy_audio {
            cmd.args(["-c:a", "copy"]);
        } else {
            cmd.args(["-c:a", "aac", "-b:a", "192k", "-ac", "2"]);
        }
        cmd.args([
            "-f", "hls",
            "-hls_time", "4",
            "-hls_list_size", "0",
            "-hls_playlist_type", "event",
            "-hls_segment_type", "fmp4",
            "-hls_fmp4_init_filename", "init.mp4",
            "-hls_flags", "independent_segments+temp_file",
            "-hls_segment_filename",
        ]);
        cmd.arg(dir.join("seg_%05d.m4s"));
        cmd.arg(dir.join("index.m3u8"));
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::msg(format!("无法启动 ffmpeg：{e}")))?;
        let stderr_buf = Arc::new(Mutex::new(String::new()));
        if let Some(mut err) = child.stderr.take() {
            let buf = stderr_buf.clone();
            tokio::spawn(async move {
                let mut chunk = [0u8; 2048];
                while let Ok(n) = err.read(&mut chunk).await {
                    if n == 0 {
                        break;
                    }
                    let mut b = buf.lock().unwrap();
                    b.push_str(&String::from_utf8_lossy(&chunk[..n]));
                    if b.len() > 8192 {
                        let cut = b.len() - 4096;
                        let cut = (cut..b.len()).find(|i| b.is_char_boundary(*i)).unwrap_or(0);
                        b.replace_range(..cut, "");
                    }
                }
            });
        }
        self.sessions.lock().unwrap().insert(
            id.clone(),
            Session { dir, child: Some(child), stderr: stderr_buf },
        );
        Ok(HlsStart { id, base_offset })
    }
}

/// Finds the last video keyframe at or before `t` (seconds from file start),
/// so a stream-copy session starts exactly where the timeline says it does.
async fn keyframe_before(path: &Path, probe: &Probe, t: f64) -> Option<f64> {
    let start_time = probe.format.start_time.unwrap_or(0.0);
    let abs = t + start_time;
    let from = (abs - 20.0).max(0.0);
    let out = command(&tools().ffprobe)
        .args(["-v", "quiet", "-select_streams", "v:0", "-skip_frame", "nokey", "-read_intervals"])
        .arg(format!("{from:.3}%{:.3}", abs + 0.05))
        .args(["-show_entries", "frame=pts_time,best_effort_timestamp_time", "-of", "csv=p=0"])
        .arg(path)
        .output()
        .await
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .filter_map(|l| l.split(',').find_map(|v| v.trim().parse::<f64>().ok()))
        .filter(|k| *k <= abs + 0.01)
        .fold(None, |acc: Option<f64>, k| Some(acc.map_or(k, |a| a.max(k))))
        .map(|k| (k - start_time).max(0.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::kinds::MediaKind;
    use crate::media::probe::probe;
    use crate::media::router::{decide, Strategy};

    fn ffmpeg_ok() -> bool {
        std::process::Command::new(&tools().ffmpeg).arg("-version").output().is_ok()
    }

    fn gen(args: &[&str], out: &Path) {
        let st = std::process::Command::new(&tools().ffmpeg)
            .args(["-hide_banner", "-loglevel", "error", "-y"])
            .args(args)
            .arg(out)
            .status()
            .unwrap();
        assert!(st.success(), "ffmpeg failed to generate {out:?}");
    }

    #[tokio::test]
    async fn transcodes_unsupported_audio_to_cache() {
        if !ffmpeg_ok() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let wma = dir.path().join("tone.wma");
        gen(&["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "wmav2"], &wma);
        let p = probe(&wma).await.unwrap();
        let caps = Caps { flac: true, ..Default::default() };
        assert_eq!(decide(MediaKind::Audio, &p, "wma", &caps), Strategy::AudioTranscode);
        let out = audio_to_cache(&wma, &p, &caps, dir.path()).await.unwrap();
        assert!(out.extension().unwrap() == "flac");
        let converted = probe(&out).await.unwrap();
        assert_eq!(converted.audio().unwrap().codec_name, "flac");
        // Second call is served from the cache.
        assert_eq!(audio_to_cache(&wma, &p, &caps, dir.path()).await.unwrap(), out);
    }

    #[tokio::test]
    async fn produces_hls_for_remux_and_transcode() {
        if !ffmpeg_ok() || !has_encoder("libx264").await {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let mkv = dir.path().join("clip.mkv");
        gen(
            &[
                "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=12",
                "-f", "lavfi", "-i", "sine=duration=12",
                "-c:v", "libx264", "-g", "25", "-pix_fmt", "yuv420p", "-c:a", "flac", "-shortest",
            ],
            &mkv,
        );
        let avi = dir.path().join("clip.avi");
        gen(
            &["-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=6", "-c:v", "mpeg4"],
            &avi,
        );
        let mgr = HlsManager::new(dir.path());
        let caps = Caps::default();

        let p = probe(&mkv).await.unwrap();
        assert_eq!(decide(MediaKind::Video, &p, "mkv", &caps), Strategy::HlsRemux);
        let s = mgr.start(&mkv, &p, 5.3, HlsMode::Copy).await.unwrap();
        assert!((s.base_offset - 5.0).abs() < 0.05, "keyframe-aligned offset, got {}", s.base_offset);
        wait_for_playlist(&mgr, &s.id).await;

        let p = probe(&avi).await.unwrap();
        assert_eq!(decide(MediaKind::Video, &p, "avi", &caps), Strategy::HlsTranscode);
        let s2 = mgr.start(&avi, &p, 0.0, HlsMode::Transcode).await.unwrap();
        wait_for_playlist(&mgr, &s2.id).await;
        // Starting a new session tears down the previous one.
        assert!(mgr.session_dir(&s.id).is_none());
        mgr.stop_all();
    }

    async fn wait_for_playlist(mgr: &HlsManager, id: &str) {
        let dir = mgr.session_dir(id).unwrap();
        for _ in 0..200 {
            if let Ok(t) = std::fs::read_to_string(dir.join("index.m3u8")) {
                if t.contains("#EXTINF") {
                    assert!(dir.join("init.mp4").is_file());
                    return;
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("no playlist produced: {:?}", mgr.status(id));
    }
}
