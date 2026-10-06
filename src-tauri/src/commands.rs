use crate::asr::{models, pipeline};
use crate::error::{AppError, AppResult};
use crate::lyrics::{self, LyricsPayload, Origin};
use crate::media::kinds::{ext_of, kind_of, MediaKind};
use crate::media::metadata::{self, AudioMeta};
use crate::media::probe::{self, Probe, VideoInfo};
use crate::media::router::{self, Caps, Strategy};
use crate::media::scan::{self, MediaEntry};
use crate::media::transcode::{self, HlsMode};
use crate::netease;
use crate::tools::tools;
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
    /// Shown to the user once playback starts (e.g. "preview clip only").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
    /// The quality an online stream actually has.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<StreamQuality>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamQuality {
    pub level: Option<String>,
    pub kbps: Option<u32>,
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

/// An exact-seeking copy of an audio file that WebKit only seeks by estimate
/// (MP3, FLAC); `None` when the file already seeks exactly. The player
/// switches to it on the next jump, so the lyrics match the audio afterwards.
#[tauri::command]
pub async fn exact_audio(state: State<'_, AppState>, path: String, quality: Option<String>) -> AppResult<Option<String>> {
    if let Some(id) = netease::song_id(&path) {
        return exact_netease(&state, id, quality.as_deref().unwrap_or("exhigh")).await;
    }
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(AppError::msg("文件不存在"));
    }
    let probe = cached_probe(&state, &p).await?;
    if media_kind(&p, Some(&probe)) != MediaKind::Audio || !router::seeks_by_estimate(&probe) {
        return Ok(None);
    }
    let out = transcode::audio_to_cache(&p, &probe, &state.cache_dir).await?;
    Ok(Some(state.server.file_url(&out)))
}

/// Online songs kept as exact-seeking copies: the recent few only (playback
/// cache, not a download store).
const NETEASE_COPIES: usize = 3;

/// The exact-seeking copy of an online song at `level`: the stream is fetched
/// and decoded to PCM; `None` for a preview clip.
async fn exact_netease(state: &AppState, id: u64, level: &str) -> AppResult<Option<String>> {
    let dir = state.cache_dir.join("audio");
    tokio::fs::create_dir_all(&dir).await?;
    let level: String = level.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let out = dir.join(format!("netease-{id}-{level}.wav"));
    if out.is_file() {
        let _ = transcode::filetime_touch(&out);
        return Ok(Some(state.server.file_url(&out)));
    }
    let stream = state.netease.stream(id, &level).await?;
    if stream.trial {
        return Ok(None);
    }
    let nonce = rand::random::<u32>();
    let src = dir.join(format!("netease-{id}-{level}.{nonce:08x}.download"));
    let res = async {
        state.netease.fetch_stream(&stream.url, &src).await?;
        let probe = probe::probe(&src).await?;
        transcode::decode_wav(&src, &probe, &out).await
    }
    .await;
    let _ = tokio::fs::remove_file(&src).await;
    res?;
    prune_netease_copies(&dir, &out);
    Ok(Some(state.server.file_url(&out)))
}

/// Keeps the newest few online-song copies (and always `current`).
fn prune_netease_copies(dir: &Path, current: &Path) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut copies: Vec<(std::time::SystemTime, PathBuf)> = rd
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            n.starts_with("netease-") && n.ends_with(".wav") && !n.contains(".part")
        })
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .filter(|(_, p)| p != current)
        .collect();
    copies.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in copies.into_iter().skip(NETEASE_COPIES - 1) {
        let _ = std::fs::remove_file(p);
    }
}

#[tauri::command]
pub async fn open_media(
    state: State<'_, AppState>,
    path: String,
    caps: Caps,
    precise: Option<bool>,
    quality: Option<String>,
) -> AppResult<OpenedMedia> {
    if let Some(id) = netease::song_id(&path) {
        return open_netease(&state, path, id, quality.as_deref().unwrap_or("exhigh")).await;
    }
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(AppError::msg("文件不存在"));
    }
    state.hls.stop_all();
    let probe = cached_probe(&state, &p).await?;
    let kind = media_kind(&p, Some(&probe));
    let mut strategy = router::decide(kind, &probe, &ext_of(&p), &caps);
    // "Precise timing": decode with ffmpeg into a clean file instead of letting
    // WebKit play a file whose timing it gets wrong (lyrics drift further and
    // further). Asked for by the UI, or when the file is known to be odd.
    if strategy == Strategy::Direct && kind == MediaKind::Audio && (precise.unwrap_or(false) || router::odd_timing(&p, &probe)) {
        strategy = Strategy::AudioTranscode;
    }
    let (url, base_offset) = match strategy {
        Strategy::Direct => (state.server.file_url(&p), 0.0),
        Strategy::AudioTranscode => {
            let out = transcode::audio_to_cache(&p, &probe, &state.cache_dir).await?;
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
        notice: None,
        quality: None,
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
    if let Some(id) = netease::song_id(&path) {
        // Lyrics the user edited and saved come first.
        if let Some(saved) = state.library.find(&p, None) {
            return Ok(Some(saved));
        }
        return Ok(state.netease.lyrics(id).await?.map(|content| LyricsPayload {
            content,
            origin: Origin::Online,
            format: "lrc".into(),
            path: None,
            model: None,
        }));
    }
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

/// Drops the app-library lyrics of a file (e.g. AI-recognised ones). Lyrics
/// files next to the media are never touched.
#[tauri::command]
pub fn remove_library_lyrics(state: State<'_, AppState>, path: String) {
    state.library.remove(Path::new(&path));
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
    // Online songs have no folder to put a lyrics file in.
    let target = if netease::song_id(&media_path).is_some() { SaveTarget::Library } else { target };
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

#[tauri::command]
pub fn server_base(state: State<'_, AppState>) -> String {
    state.server.base()
}

// ------------------------------------------------------------ updates ----

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub prerelease: bool,
    pub install: crate::updater::InstallKind,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    let version = crate::updater::current_version();
    AppInfo {
        version: version.to_string(),
        prerelease: crate::updater::Version::parse(version).is_some_and(|v| v.is_prerelease()),
        install: crate::updater::install_kind(),
    }
}

/// The newest release on GitHub above this version, if any.
#[tauri::command]
pub async fn update_check(include_prerelease: bool) -> AppResult<Option<crate::updater::UpdateInfo>> {
    crate::updater::check(include_prerelease).await
}

/// Downloads an update file (progress: `update://progress`); returns its path.
#[tauri::command]
pub async fn update_download(app: AppHandle, state: State<'_, AppState>, asset: crate::updater::UpdateAsset) -> AppResult<String> {
    let cancel = state.update_cancel.clone();
    cancel.store(false, Ordering::SeqCst);
    let dir = state.cache_dir.join("updates");
    let path = crate::updater::download(&asset, &dir, &cancel, |p| {
        let _ = app.emit("update://progress", p);
    })
    .await?;
    Ok(path.to_string_lossy().into_owned())
}

/// At launch: true when the last automatic install did not complete.
#[tauri::command]
pub fn update_startup(state: State<'_, AppState>) -> bool {
    crate::updater::startup(&state.cache_dir.join("updates"))
}

#[tauri::command]
pub fn update_cancel(state: State<'_, AppState>) {
    state.update_cancel.store(true, Ordering::SeqCst);
}

/// Installs a downloaded update: the app quits and the new version starts.
#[tauri::command]
pub fn update_install(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<()> {
    let dir = state.cache_dir.join("updates");
    let file = PathBuf::from(&path);
    if !file.starts_with(&dir) || !file.is_file() {
        return Err(AppError::msg("找不到下载的更新文件"));
    }
    crate::updater::install(&file, crate::updater::install_kind(), &dir)?;
    // ffmpeg helpers would keep files in use on Windows.
    state.hls.stop_all();
    app.exit(0);
    Ok(())
}

// ------------------------------------------------------------ plugins ----

#[tauri::command]
pub async fn plugins_list(app: AppHandle, state: State<'_, AppState>) -> AppResult<Vec<crate::plugins::PluginEntry>> {
    let dir = state.plugins_dir.clone();
    let version = app.package_info().version.to_string();
    Ok(tokio::task::spawn_blocking(move || crate::plugins::list(&dir, &version)).await.unwrap_or_default())
}

/// Installs a plugin folder or `.lpplugin` file; returns its id. Fails with
/// `PLUGIN_EXISTS` when it is installed already and `replace` is off.
#[tauri::command]
pub async fn plugin_install(state: State<'_, AppState>, path: String, replace: bool) -> AppResult<String> {
    let dir = state.plugins_dir.clone();
    tokio::task::spawn_blocking(move || crate::plugins::install(Path::new(&path), &dir, replace))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
        .map_err(AppError::Msg)
}

#[tauri::command]
pub fn plugin_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    crate::plugins::remove(&state.plugins_dir, &id).map_err(AppError::Msg)
}

/// Opens the plugins folder in Finder / File Explorer.
#[tauri::command]
pub fn plugins_open_dir(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(state.plugins_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::msg(e.to_string()))
}

/// Copies a picture for a player layout into the app data folder; returns
/// its "asset:<name>" source.
#[tauri::command]
pub fn layout_asset_add(state: State<'_, AppState>, path: String) -> AppResult<String> {
    crate::layouts::add_asset(Path::new(&path), &state.assets_dir).map_err(AppError::Msg)
}

/// Writes a player layout and its pictures as a `.lpplugin` file.
#[tauri::command]
pub async fn layout_export(state: State<'_, AppState>, dest: String, layout: serde_json::Value) -> AppResult<()> {
    let (assets, plugins) = (state.assets_dir.clone(), state.plugins_dir.clone());
    tokio::task::spawn_blocking(move || crate::layouts::export(&layout, Path::new(&dest), &assets, &plugins))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
        .map_err(AppError::Msg)
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

/// Which declared audio/video types open with this app by default.
#[tauri::command]
pub fn file_associations(app: tauri::AppHandle) -> crate::file_assoc::Status {
    crate::file_assoc::status(&app.config().identifier)
}

/// Makes this app the default for the chosen kinds; returns what failed.
#[tauri::command]
pub fn set_file_associations(app: tauri::AppHandle, audio: bool, video: bool) -> Vec<String> {
    crate::file_assoc::associate(&app.config().identifier, audio, video)
}

/// Bytes taken by the cache files ("delete cache files" in Settings).
#[tauri::command]
pub async fn cache_size(state: State<'_, AppState>) -> AppResult<u64> {
    let dir = state.cache_dir.clone();
    Ok(tokio::task::spawn_blocking(move || crate::cache::size(&dir)).await.unwrap_or(0))
}

/// Deletes the cache files, except those behind the media server URLs in
/// `keep` (what the player has open); returns the bytes freed.
#[tauri::command]
pub async fn cache_clear(state: State<'_, AppState>, keep: Vec<String>) -> AppResult<u64> {
    let dir = state.cache_dir.clone();
    let keep = keep.iter().filter_map(|u| crate::cache::served_path(u)).collect();
    Ok(tokio::task::spawn_blocking(move || crate::cache::clear(&dir, &keep)).await.unwrap_or(0))
}

#[tauri::command]
pub fn take_pending_open(state: State<'_, AppState>) -> Vec<String> {
    let mut pending = state.pending_open.lock().unwrap();
    state.frontend_ready.store(true, Ordering::SeqCst);
    std::mem::take(&mut *pending)
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
        let (head, b64) = c.split_once("base64,")?;
        let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
        // Windows loads the artwork by its file type.
        let ext = if head.contains("image/png") { "png" } else { "jpg" };
        let p = state.cache_dir.join(format!("nowplaying-{}.{ext}", rand::random::<u32>()));
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
    state.tray.set_now_playing(&title, artist.as_deref());
}

#[tauri::command]
pub fn now_playing_state(state: State<'_, AppState>, playing: bool, position: Option<f64>) {
    state.now_playing.set_playback(playing, position);
    state.tray.set_playing(playing);
}

/// The UI language, and the menu bar / notification area menu's labels in it.
#[tauri::command]
pub fn ui_language(state: State<'_, AppState>, lang: String, labels: std::collections::HashMap<String, String>) {
    crate::weather::set_language(&lang);
    state.tray.set_labels(labels);
}

/// "Run in background" (closing the window hides it) and the menu bar title.
#[tauri::command]
pub fn set_background_prefs(state: State<'_, AppState>, run_in_background: bool, show_title: bool, private_mode: bool) {
    state.tray.set_prefs(run_in_background, show_title, private_mode);
}

// ---------------------------------------------------------------- desktop lyrics

#[tauri::command]
pub fn desktop_lyrics_set(app: AppHandle, show: bool) -> AppResult<()> {
    crate::desktop_lyrics::set_visible(&app, show).map_err(|e| AppError::msg(e.to_string()))
}

// ---------------------------------------------------------------- weather theme

#[tauri::command]
pub async fn weather_locate(app: AppHandle) -> AppResult<crate::weather::Place> {
    crate::weather::locate(&app).await
}

#[tauri::command]
pub async fn weather_fetch(lat: f64, lon: f64, name: Option<String>) -> AppResult<crate::weather::WeatherReport> {
    crate::weather::fetch(lat, lon, name).await
}

#[tauri::command]
pub async fn weather_search(query: String) -> AppResult<Vec<crate::weather::CityHit>> {
    crate::weather::search(&query).await
}

#[tauri::command]
pub fn ffmpeg_available() -> bool {
    crate::tools::std_command(&tools().ffprobe).arg("-version").output().map(|o| o.status.success()).unwrap_or(false)
}

// ---------------------------------------------------------------- media library

use crate::library::{self as medialib, Library, LibraryStore, Source};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryProgress {
    pub scanning: bool,
    pub done: usize,
    pub total: usize,
}

fn lib_changed(app: &AppHandle) {
    let _ = app.emit("library://changed", ());
}

#[tauri::command]
pub fn library_get(state: State<'_, AppState>) -> Library {
    state.media_lib.snapshot()
}

/// Rescans every library folder in the background (incremental).
fn spawn_rescan(app: AppHandle, store: Arc<LibraryStore>) {
    if store.scanning.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let snap = store.snapshot();
        let roots: Vec<String> = snap.folders.iter().map(|f| f.path.clone()).collect();
        let known = snap.tracks.into_iter().map(|t| (t.path.clone(), t)).collect();
        let progress = |done: usize, total: usize| {
            let _ = app.emit("library://progress", LibraryProgress { scanning: true, done, total });
        };
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            medialib::scan::scan(&roots, &snap.excluded, &known, &progress)
        }));
        match result {
            Ok(r) => {
                let total = r.tracks.len();
                if let Err(e) = store.update(|l| l.merge_scan(&r.roots_ok, r.tracks)) {
                    log::warn!("library save failed: {e}");
                }
                store.scanning.store(false, Ordering::SeqCst);
                let _ = app.emit("library://progress", LibraryProgress { scanning: false, done: total, total });
            }
            Err(_) => {
                store.scanning.store(false, Ordering::SeqCst);
                let _ = app.emit("library://progress", LibraryProgress { scanning: false, done: 0, total: 0 });
            }
        }
        lib_changed(&app);
    });
}

#[tauri::command]
pub fn library_rescan(app: AppHandle, state: State<'_, AppState>) {
    spawn_rescan(app, state.media_lib.clone());
}

#[tauri::command]
pub fn library_add_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<bool> {
    if !Path::new(&path).is_dir() {
        return Err(AppError::msg("文件夹不存在"));
    }
    let added = state.media_lib.update(|l| l.add_folder(&path))?;
    lib_changed(&app);
    spawn_rescan(app, state.media_lib.clone());
    Ok(added)
}

#[tauri::command]
pub fn library_remove_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<()> {
    state.media_lib.update(|l| l.remove_folder(&path))?;
    lib_changed(&app);
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddPathsResult {
    pub folders: usize,
    pub files: usize,
}

/// Files and folders dropped onto the library page.
#[tauri::command]
pub async fn library_add_paths(app: AppHandle, state: State<'_, AppState>, paths: Vec<String>) -> AppResult<AddPathsResult> {
    let (files, dirs) = medialib::split_paths(&paths);
    let tracks = tokio::task::spawn_blocking(move || {
        files
            .iter()
            .filter_map(|p| medialib::scan::read_track(p, Source::Added))
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?;
    let (folders, added) = state.media_lib.update(|l| {
        let folders = dirs.iter().filter(|d| l.add_folder(d)).count();
        (folders, l.add_files(tracks))
    })?;
    lib_changed(&app);
    if !dirs.is_empty() {
        spawn_rescan(app, state.media_lib.clone());
    }
    Ok(AddPathsResult { folders, files: added })
}

#[tauri::command]
pub fn library_remove_tracks(app: AppHandle, state: State<'_, AppState>, paths: Vec<String>) -> AppResult<()> {
    state.media_lib.update(|l| l.remove_tracks(&paths))?;
    lib_changed(&app);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashResult {
    pub trashed: Vec<String>,
    pub failed: Vec<String>,
    pub error: Option<String>,
}

/// Moves files to the Trash and drops the ones that went from the library.
#[tauri::command]
pub async fn library_trash_tracks(app: AppHandle, state: State<'_, AppState>, paths: Vec<String>) -> AppResult<TrashResult> {
    let (trashed, failed, error) = tokio::task::spawn_blocking(move || {
        let mut ok = Vec::new();
        let mut failed = Vec::new();
        let mut error = None;
        for p in paths {
            match crate::trash::trash(&p) {
                Ok(()) => ok.push(p),
                Err(e) => {
                    error.get_or_insert(e);
                    failed.push(p);
                }
            }
        }
        (ok, failed, error)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?;
    if !trashed.is_empty() {
        state.media_lib.update(|l| {
            l.remove_tracks(&trashed);
            for pl in l.playlists.iter_mut() {
                pl.items.retain(|i| !trashed.contains(i));
            }
        })?;
        lib_changed(&app);
    }
    Ok(TrashResult { trashed, failed, error })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFolderResult {
    pub playlist_id: String,
    pub name: String,
    pub files: usize,
}

/// Adds every media file under `path` to the library and makes a playlist
/// of them named after the folder.
#[tauri::command]
pub async fn library_import_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<ImportFolderResult> {
    let root = path.clone();
    let mut tracks = tokio::task::spawn_blocking(move || {
        let known = std::collections::HashMap::new();
        medialib::scan::scan(std::slice::from_ref(&root), &[], &known, &|_, _| {}).tracks
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?;
    if tracks.is_empty() {
        return Err(AppError::msg("这个文件夹里没有可以播放的音乐或视频"));
    }
    tracks.sort_by(|a, b| natord::compare(&a.path, &b.path));
    for t in tracks.iter_mut() {
        t.source = Source::Added;
    }
    let items: Vec<String> = tracks.iter().map(|t| t.path.clone()).collect();
    let base = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "导入的文件夹".into());
    let files = items.len();
    let (playlist_id, name) = state.media_lib.update(|l| {
        l.add_files(tracks);
        let name = medialib::unique_playlist_name(l, &base);
        (l.create_playlist(&name, items), name)
    })?;
    lib_changed(&app);
    Ok(ImportFolderResult { playlist_id, name, files })
}

/// Counts a play; files outside the library are recorded as "played".
#[tauri::command]
pub async fn library_record_play(app: AppHandle, state: State<'_, AppState>, path: String, add: bool) -> AppResult<()> {
    let known = state.media_lib.data.lock().unwrap().index_of(&path).is_some();
    if !known && !add {
        return Ok(());
    }
    let fresh = if known {
        None
    } else {
        let p = PathBuf::from(&path);
        tokio::task::spawn_blocking(move || medialib::scan::read_track(&p, Source::Played))
            .await
            .map_err(|e| AppError::msg(e.to_string()))?
    };
    state.media_lib.update(|l| {
        if let Some(t) = fresh {
            l.add_files(vec![t]);
        }
        l.record_play(&path);
    })?;
    lib_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn library_set_favorite(app: AppHandle, state: State<'_, AppState>, path: String, on: bool) -> AppResult<()> {
    state.media_lib.update(|l| l.set_favorite(&path, on))?;
    lib_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn playlist_create(app: AppHandle, state: State<'_, AppState>, name: String, items: Vec<String>) -> AppResult<String> {
    let id = state.media_lib.update(|l| l.create_playlist(&name, items))?;
    lib_changed(&app);
    Ok(id)
}

#[tauri::command]
pub fn playlist_rename(app: AppHandle, state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::msg("歌单名称不能为空"));
    }
    state.media_lib.update(|l| l.playlist_mut(&id).map(|p| p.name = name))??;
    lib_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn playlist_delete(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.media_lib.update(|l| l.delete_playlist(&id))?;
    lib_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn playlist_set_items(app: AppHandle, state: State<'_, AppState>, id: String, items: Vec<String>) -> AppResult<()> {
    let mut seen = std::collections::HashSet::new();
    let items: Vec<String> = items.into_iter().filter(|p| seen.insert(p.clone())).collect();
    state.media_lib.update(|l| l.playlist_mut(&id).map(|p| p.items = items))??;
    lib_changed(&app);
    Ok(())
}

// ------------------------------------------------------------------ NetEase (experimental)

async fn open_netease(state: &AppState, path: String, id: u64, quality: &str) -> AppResult<OpenedMedia> {
    let ne = &state.netease;
    let song = ne.song(id).await?;
    let stream = ne.stream(id, quality).await?;
    let artist = song.artists.join(" / ");
    let name = if artist.is_empty() { song.name.clone() } else { format!("{artist} - {}", song.name) };
    let cover = song.cover.as_ref().map(|c| state.server.remote_url(&format!("{c}?param=600y600")));
    // A preview clip is shorter than the song: let the player find its length.
    let duration = (!stream.trial && song.duration > 0.0).then_some(song.duration);
    Ok(OpenedMedia {
        file_name: name.clone(),
        name,
        kind: MediaKind::Audio,
        strategy: Strategy::Direct,
        url: state.server.remote_url(&stream.url),
        base_offset: 0.0,
        duration,
        meta: Some(AudioMeta {
            title: Some(song.name.clone()),
            artist: (!artist.is_empty()).then_some(artist),
            album: (!song.album.is_empty()).then(|| song.album.clone()),
            cover,
            duration,
            embedded_lyrics: None,
        }),
        subtitles: vec![],
        quality: Some(StreamQuality { level: stream.level, kbps: stream.kbps }),
        notice: stream.notice,
        path,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseStatus {
    pub account: Option<netease::Account>,
}

#[tauri::command]
pub async fn netease_status(state: State<'_, AppState>) -> AppResult<NeteaseStatus> {
    Ok(NeteaseStatus { account: state.netease.account().await? })
}

#[tauri::command]
pub async fn netease_qr_start(state: State<'_, AppState>) -> AppResult<netease::QrStart> {
    state.netease.qr_start().await
}

#[tauri::command]
pub async fn netease_qr_check(state: State<'_, AppState>, key: String) -> AppResult<netease::QrState> {
    state.netease.qr_check(&key).await
}

#[tauri::command]
pub async fn netease_login_cookie(state: State<'_, AppState>, cookie: String) -> AppResult<netease::Account> {
    state.netease.set_cookie(&cookie).await
}

const NETEASE_LOGIN_WINDOW: &str = "netease-login";

/// Opens music.163.com in its own window (no access to the app) and waits
/// until the user has signed in there, then takes over the sign-in cookies.
/// `None` when the window was closed first.
#[tauri::command]
pub async fn netease_web_login(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<netease::Account>> {
    web_login(&app, &state.netease, "https://music.163.com/".parse().unwrap()).await
}

pub async fn web_login(app: &AppHandle, ne: &netease::Netease, url: tauri::Url) -> AppResult<Option<netease::Account>> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    if let Some(old) = app.get_webview_window(NETEASE_LOGIN_WINDOW) {
        let _ = old.close();
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }
    WebviewWindowBuilder::new(app, NETEASE_LOGIN_WINDOW, WebviewUrl::External(url.clone()))
        .title("登录网易云音乐（点右上角“登录”，登录成功后这个窗口会自动关闭）")
        .inner_size(1060.0, 740.0)
        .min_inner_size(720.0, 520.0)
        .center()
        // A plain Safari, so the site serves its normal page.
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")
        // Its own throwaway cookie store: nothing stays behind in the app's web data.
        .incognito(true)
        .build()
        .map_err(|e| AppError::msg(format!("无法打开登录窗口：{e}")))?;
    let started = std::time::Instant::now();
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        let Some(w) = app.get_webview_window(NETEASE_LOGIN_WINDOW) else { return Ok(None) };
        if started.elapsed() > std::time::Duration::from_secs(15 * 60) {
            let _ = w.close();
            return Ok(None);
        }
        let Ok(cookies) = w.cookies_for_url(url.clone()) else { continue };
        if !cookies.iter().any(|c| c.name() == "MUSIC_U" && !c.value().is_empty()) {
            continue;
        }
        let text = cookies
            .iter()
            .filter(|c| matches!(c.name(), "MUSIC_U" | "__csrf" | "NMTID" | "MUSIC_A_T" | "MUSIC_R_T"))
            .map(|c| format!("{}={}", c.name(), c.value()))
            .collect::<Vec<_>>()
            .join("; ");
        let account = ne.set_cookie(&text).await;
        let _ = w.close();
        return account.map(Some);
    }
}

/// Closes the web sign-in window (the login dialog was closed).
#[tauri::command]
pub fn netease_web_login_cancel(app: AppHandle) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window(NETEASE_LOGIN_WINDOW) {
        let _ = w.close();
    }
}

#[tauri::command]
pub fn netease_logout(state: State<'_, AppState>) {
    state.netease.logout();
}

#[tauri::command]
pub async fn netease_playlists(state: State<'_, AppState>) -> AppResult<Vec<netease::Playlist>> {
    state.netease.playlists().await
}

#[tauri::command]
pub async fn netease_playlist(state: State<'_, AppState>, id: u64) -> AppResult<Vec<netease::Song>> {
    state.netease.playlist_songs(id).await
}

#[tauri::command]
pub async fn netease_daily(state: State<'_, AppState>) -> AppResult<Vec<netease::Song>> {
    state.netease.daily().await
}

#[tauri::command]
pub async fn netease_search(state: State<'_, AppState>, query: String) -> AppResult<Vec<netease::Song>> {
    state.netease.search(&query).await
}

#[tauri::command]
pub async fn netease_comments(
    state: State<'_, AppState>,
    id: u64,
    hot: bool,
    offset: u32,
    before: Option<i64>,
) -> AppResult<netease::CommentPage> {
    state.netease.comments(id, hot, offset, before).await
}

#[tauri::command]
pub async fn netease_comment_replies(
    state: State<'_, AppState>,
    id: u64,
    parent: u64,
    time: Option<i64>,
) -> AppResult<netease::CommentPage> {
    state.netease.comment_replies(id, parent, time).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_recent_online_copies() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        let names = ["netease-1-exhigh.wav", "netease-2-exhigh.wav", "netease-3-lossless.wav", "netease-4-hires.wav", "abc.wav"];
        for (i, n) in names.iter().enumerate() {
            let p = d.join(n);
            std::fs::write(&p, b"x").unwrap();
            let t = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000 + i as u64 * 10);
            std::fs::File::options().append(true).open(&p).unwrap().set_modified(t).unwrap();
        }
        // The current one is the oldest file but stays; of the rest, the newest two.
        prune_netease_copies(d, &d.join("netease-1-exhigh.wav"));
        let mut left: Vec<String> = std::fs::read_dir(d).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        left.sort();
        assert_eq!(left, ["abc.wav", "netease-1-exhigh.wav", "netease-3-lossless.wav", "netease-4-hires.wav"]);
    }
}
