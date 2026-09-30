use crate::asr::{models, pipeline};
use crate::error::{AppError, AppResult};
use crate::lyrics::{self, LyricsPayload, Origin};
use crate::media::kinds::{ext_of, kind_of, MediaKind};
use crate::media::metadata::{self, AudioMeta};
use crate::media::probe::{self, Probe, VideoInfo};
use crate::media::router::{self, Caps, Strategy};
use crate::media::scan::{self, MediaEntry};
use crate::media::transcode::{self, HlsMode};
use crate::tools::{command, tools};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub label: String,
    pub language: Option<String>,
    pub url: String,
    pub default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedMedia {
    pub path: String,
    pub file_name: String,
    pub name: String,
    pub kind: MediaKind,
    pub strategy: Strategy,
    pub url: String,
    pub base_offset: f64,
    pub duration: Option<f64>,
    pub meta: Option<AudioMeta>,
    pub subtitles: Vec<SubtitleTrack>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub url: String,
    pub base_offset: f64,
}

async fn cached_probe(state: &AppState, path: &Path) -> AppResult<Probe> {
    let key = path.to_string_lossy().into_owned();
    if let Some(p) = state.probes.lock().unwrap().get(&key) {
        return Ok(p.clone());
    }
    let p = probe::probe(path).await?;
    let mut map = state.probes.lock().unwrap();
    if map.len() > 64 {
        map.clear();
    }
    map.insert(key, p.clone());
    Ok(p)
}

fn media_kind(path: &Path, probe: Option<&Probe>) -> MediaKind {
    kind_of(path).unwrap_or_else(|| {
        if probe.and_then(|p| p.video()).is_some() {
            MediaKind::Video
        } else {
            MediaKind::Audio
        }
    })
}

const TEXT_SUB_CODECS: &[&str] = &["subrip", "ass", "ssa", "mov_text", "webvtt", "text"];

fn find_subtitles(state: &AppState, path: &Path, probe: &Probe) -> Vec<SubtitleTrack> {
    let mut out = Vec::new();
    if let (Some(dir), Some(stem)) = (path.parent(), path.file_stem()) {
        let stem = stem.to_string_lossy().to_lowercase();
        if let Ok(rd) = std::fs::read_dir(dir) {
            let mut files: Vec<PathBuf> = rd
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| matches!(ext_of(p).as_str(), "srt" | "vtt" | "ass" | "ssa"))
                .filter(|p| {
                    p.file_stem()
                        .map(|s| {
                            let s = s.to_string_lossy().to_lowercase();
                            s == stem || s.starts_with(&format!("{stem}."))
                        })
                        .unwrap_or(false)
                })
                .collect();
            files.sort();
            for f in files {
                let label = f.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                out.push(SubtitleTrack {
                    label: format!("外挂：{label}"),
                    language: None,
                    url: state.server.subtitle_url(&f, None),
                    default: out.is_empty(),
                });
            }
        }
    }
    for s in probe.subtitles() {
        if !TEXT_SUB_CODECS.contains(&s.codec_name.as_str()) {
            continue; // bitmap subtitles (PGS/VobSub) cannot be rendered as WebVTT
        }
        let lang = s.tag("language").map(|l| l.to_string());
        let title = s.tag("title").map(|t| t.to_string());
        let label = match (&title, &lang) {
            (Some(t), Some(l)) => format!("{t} ({l})"),
            (Some(t), None) => t.clone(),
            (None, Some(l)) => format!("内嵌字幕 ({l})"),
            (None, None) => format!("内嵌字幕 #{}", s.index),
        };
        out.push(SubtitleTrack {
            label,
            language: lang,
            url: state.server.subtitle_url(path, Some(s.index)),
            default: false,
        });
    }
    out
}

#[tauri::command]
pub async fn open_media(state: State<'_, AppState>, path: String, caps: Caps) -> AppResult<OpenedMedia> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(AppError::msg("文件不存在"));
    }
    state.hls.stop_all();
    let probe = cached_probe(&state, &p).await?;
    let kind = media_kind(&p, Some(&probe));
    let strategy = router::decide(kind, &probe, &ext_of(&p), &caps);
    let (url, base_offset) = match strategy {
        Strategy::Direct => (state.server.file_url(&p), 0.0),
        Strategy::AudioTranscode => {
            let out = transcode::audio_to_cache(&p, &probe, &caps, &state.cache_dir).await?;
            (state.server.file_url(&out), 0.0)
        }
        Strategy::HlsRemux | Strategy::HlsTranscode => {
            let mode = if strategy == Strategy::HlsRemux { HlsMode::Copy } else { HlsMode::Transcode };
            let s = state.hls.start(&p, &probe, 0.0, mode).await?;
            (state.server.hls_url(&s.id), s.base_offset)
        }
    };
    let meta = if kind == MediaKind::Audio {
        let pp = p.clone();
        let mut m = tokio::task::spawn_blocking(move || metadata::read(&pp)).await.unwrap_or_default();
        if m.title.is_none() {
            m.title = probe.format_tag("title").map(|s| s.to_string());
        }
        if m.artist.is_none() {
            m.artist = probe.format_tag("artist").map(|s| s.to_string());
        }
        if m.album.is_none() {
            m.album = probe.format_tag("album").map(|s| s.to_string());
        }
        Some(m)
    } else {
        None
    };
    let subtitles = if kind == MediaKind::Video { find_subtitles(&state, &p, &probe) } else { vec![] };
    let entry = MediaEntry::from_path(&p, kind);
    Ok(OpenedMedia {
        path,
        file_name: entry.file_name,
        name: entry.name,
        kind,
        strategy,
        url,
        base_offset,
        duration: probe.duration().or(meta.as_ref().and_then(|m| m.duration)),
        meta,
        subtitles,
    })
}

/// Restarts an HLS session at `start` seconds (seeking outside the produced range).
#[tauri::command]
pub async fn request_stream(state: State<'_, AppState>, path: String, start: f64, transcode: bool) -> AppResult<StreamInfo> {
    let p = PathBuf::from(&path);
    let probe = cached_probe(&state, &p).await?;
    let mode = if transcode { HlsMode::Transcode } else { HlsMode::Copy };
    let s = state.hls.start(&p, &probe, start, mode).await?;
    Ok(StreamInfo { url: state.server.hls_url(&s.id), base_offset: s.base_offset })
}

#[tauri::command]
pub fn stop_streams(state: State<'_, AppState>) {
    state.hls.stop_all();
}

#[tauri::command]
pub fn scan_playlist(path: String, kind: Option<MediaKind>) -> Vec<MediaEntry> {
    let p = PathBuf::from(&path);
    let kind = kind.or_else(|| kind_of(&p)).unwrap_or(MediaKind::Audio);
    scan::scan_siblings(&p, kind)
}

#[tauri::command]
pub async fn get_video_info(state: State<'_, AppState>, path: String) -> AppResult<VideoInfo> {
    let p = PathBuf::from(&path);
    let probe = cached_probe(&state, &p).await?;
    let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(probe::video_info(&probe, name, size))
}

#[tauri::command]
pub async fn find_lyrics(state: State<'_, AppState>, path: String) -> AppResult<Option<LyricsPayload>> {
    let p = PathBuf::from(&path);
    let pp = p.clone();
    let embedded = tokio::task::spawn_blocking(move || {
        if kind_of(&pp) == Some(MediaKind::Audio) {
            metadata::read(&pp).embedded_lyrics
        } else {
            None
        }
    })
    .await
    .unwrap_or(None);
    Ok(state.library.find(&p, embedded))
}

#[tauri::command]
pub fn read_text_file(path: String) -> AppResult<String> {
    lyrics::read_text_file(Path::new(&path))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedLyrics {
    /// "same_dir" | "library"
    pub location: String,
    pub path: String,
    /// True when writing next to the media failed and the library was used.
    pub fallback: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SaveTarget {
    SameDir,
    Library,
}

#[tauri::command]
pub fn save_lyrics(
    state: State<'_, AppState>,
    media_path: String,
    content: String,
    target: SaveTarget,
    origin: Option<Origin>,
) -> AppResult<SavedLyrics> {
    let media = PathBuf::from(&media_path);
    let origin = origin.unwrap_or(Origin::Library);
    match target {
        SaveTarget::SameDir => match lyrics::save_same_dir(&media, &content) {
            Ok(p) => {
                // The sidecar now wins; drop any stale library copy.
                state.library.remove(&media);
                Ok(SavedLyrics { location: "same_dir".into(), path: p.to_string_lossy().into_owned(), fallback: false, error: None })
            }
            Err(e) => {
                let p = state.library.save(&media, &content, origin, None)?;
                Ok(SavedLyrics {
                    location: "library".into(),
                    path: p.to_string_lossy().into_owned(),
                    fallback: true,
                    error: Some(e.to_string()),
                })
            }
        },
        SaveTarget::Library => {
            let p = state.library.save(&media, &content, origin, None)?;
            Ok(SavedLyrics { location: "library".into(), path: p.to_string_lossy().into_owned(), fallback: false, error: None })
        }
    }
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> AppResult<()> {
    std::fs::write(path, content)?;
    Ok(())
}

/// Writes base64 data (optionally a `data:` URL), e.g. video screenshots.
#[tauri::command]
pub fn write_base64_file(path: String, data: String) -> AppResult<()> {
    use base64::Engine;
    let b64 = data.split_once("base64,").map(|(_, b)| b).unwrap_or(&data);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| AppError::msg(format!("数据无效：{e}")))?;
    std::fs::write(path, bytes)?;
    Ok(())
}

// ---------------------------------------------------------------- ASR ----

#[tauri::command]
pub fn asr_models(state: State<'_, AppState>) -> Vec<models::ModelStatus> {
    models::list(&state.models_dir)
}

#[tauri::command]
pub async fn asr_download(app: AppHandle, state: State<'_, AppState>, id: String, mirror: String) -> AppResult<()> {
    let spec = models::spec(&id).ok_or_else(|| AppError::msg("未知的模型"))?;
    let cancel = Arc::new(AtomicBool::new(false));
    state.downloads.lock().unwrap().insert(id.clone(), cancel.clone());
    let emitter = app.clone();
    let res = models::download(&state.models_dir, spec, &mirror, cancel, move |p| {
        let _ = emitter.emit("asr://download", p);
    })
    .await;
    state.downloads.lock().unwrap().remove(&id);
    if let Err(e) = &res {
        if !matches!(e, AppError::Cancelled) {
            let _ = app.emit(
                "asr://download",
                models::DownloadProgress { id: id.clone(), downloaded: 0, total: 0, state: "error".into(), error: Some(e.to_string()) },
            );
        }
    }
    res.map(|_| ())
}

#[tauri::command]
pub fn asr_cancel_download(state: State<'_, AppState>, id: String) {
    if let Some(c) = state.downloads.lock().unwrap().get(&id) {
        c.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn asr_delete_model(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let spec = models::spec(&id).ok_or_else(|| AppError::msg("未知的模型"))?;
    models::delete(&state.models_dir, spec)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrDone {
    pub media_path: String,
    pub ok: bool,
    pub cancelled: bool,
    pub result: Option<pipeline::AsrResult>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AsrProgressEvent {
    media_path: String,
    #[serde(flatten)]
    progress: pipeline::AsrProgress,
}

#[tauri::command]
pub fn asr_start(app: AppHandle, state: State<'_, AppState>, path: String, options: pipeline::AsrOptions) -> AppResult<()> {
    {
        let running = state.asr_job.lock().unwrap();
        if running.is_some() {
            return Err(AppError::msg("已有识别任务正在进行"));
        }
    }
    let cancel = Arc::new(AtomicBool::new(false));
    *state.asr_job.lock().unwrap() = Some(cancel.clone());
    let models_dir = state.models_dir.clone();
    let data_dir = state.data_dir.clone();
    std::thread::spawn(move || {
        let media = PathBuf::from(&path);
        let emitter = app.clone();
        let mp = path.clone();
        let progress: Arc<dyn Fn(pipeline::AsrProgress) + Send + Sync> = Arc::new(move |p| {
            let _ = emitter.emit("asr://progress", AsrProgressEvent { media_path: mp.clone(), progress: p });
        });
        // A panic inside whisper must not leave the job marked as running.
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            pipeline::transcribe(&media, &options, &models_dir, cancel, progress)
        }))
        .unwrap_or_else(|e| {
            let msg = e
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| e.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "未知错误".into());
            Err(AppError::msg(format!("识别引擎异常：{msg}")))
        });
        let done = match res {
            Ok(r) => {
                let lib = lyrics::LyricsLibrary::new(&data_dir);
                let _ = lib.save(&media, &r.lrc, Origin::Ai, Some(r.model.clone()));
                AsrDone { media_path: path, ok: true, cancelled: false, result: Some(r), error: None }
            }
            Err(AppError::Cancelled) => AsrDone { media_path: path, ok: false, cancelled: true, result: None, error: None },
            Err(e) => AsrDone { media_path: path, ok: false, cancelled: false, result: None, error: Some(e.to_string()) },
        };
        use tauri::Manager;
        if let Some(st) = app.try_state::<AppState>() {
            *st.asr_job.lock().unwrap() = None;
        }
        let _ = app.emit("asr://done", done);
    });
    Ok(())
}

#[tauri::command]
pub fn asr_cancel(state: State<'_, AppState>) {
    if let Some(c) = state.asr_job.lock().unwrap().as_ref() {
        c.store(true, Ordering::Relaxed);
    }
}

// ------------------------------------------------------------ misc -------

/// Coarse loudness envelope (20 values per second, 0–255) used to drive the
/// lyrics-page waveform when live audio analysis is unavailable.
#[tauri::command]
pub async fn waveform_envelope(path: String) -> AppResult<Vec<u8>> {
    let out = command(&tools().ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-nostdin", "-i"])
        .arg(&path)
        .args(["-vn", "-map", "0:a:0", "-ac", "1", "-ar", "8000", "-f", "f32le", "-"])
        .output()
        .await?;
    if !out.status.success() {
        return Err(AppError::msg("无法分析音频"));
    }
    let samples: Vec<f32> = out
        .stdout
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    let rms: Vec<f32> = samples
        .chunks(400)
        .map(|w| (w.iter().map(|s| s * s).sum::<f32>() / w.len() as f32).sqrt())
        .collect();
    let peak = rms.iter().cloned().fold(0.0001f32, f32::max);
    Ok(rms.iter().map(|v| ((v / peak).sqrt() * 255.0) as u8).collect())
}

#[tauri::command]
pub fn server_base(state: State<'_, AppState>) -> String {
    state.server.base()
}

/// Copies a user-chosen background image into the app data folder so it
/// survives the original being moved.
#[tauri::command]
pub fn import_background(state: State<'_, AppState>, path: String) -> AppResult<String> {
    let src = PathBuf::from(&path);
    let dir = state.data_dir.join("backgrounds");
    std::fs::create_dir_all(&dir)?;
    let ext = ext_of(&src);
    let dest = dir.join(format!("bg-{}.{}", transcode::file_key(&src), if ext.is_empty() { "img".into() } else { ext }));
    std::fs::copy(&src, &dest)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn take_pending_open(state: State<'_, AppState>) -> Vec<String> {
    state.frontend_ready.store(true, Ordering::SeqCst);
    std::mem::take(&mut *state.pending_open.lock().unwrap())
}

#[tauri::command]
pub fn now_playing_metadata(
    state: State<'_, AppState>,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
    cover: Option<String>,
) {
    let cover_url = cover.and_then(|c| {
        use base64::Engine;
        let (_, b64) = c.split_once("base64,")?;
        let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
        let p = state.cache_dir.join(format!("nowplaying-{}.img", rand::random::<u32>()));
        // Remove stale artwork files.
        if let Ok(rd) = std::fs::read_dir(&state.cache_dir) {
            for e in rd.flatten() {
                if e.file_name().to_string_lossy().starts_with("nowplaying-") {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
        std::fs::write(&p, bytes).ok()?;
        Some(format!("file://{}", p.to_string_lossy()))
    });
    state.now_playing.set_metadata(&title, artist.as_deref(), album.as_deref(), duration, cover_url.as_deref());
}

#[tauri::command]
pub fn now_playing_state(state: State<'_, AppState>, playing: bool, position: Option<f64>) {
    state.now_playing.set_playback(playing, position);
}

#[tauri::command]
pub fn ffmpeg_available() -> bool {
    std::process::Command::new(&tools().ffprobe).arg("-version").output().map(|o| o.status.success()).unwrap_or(false)
}
