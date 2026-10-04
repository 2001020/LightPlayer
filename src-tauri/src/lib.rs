mod asr;
mod cache;
mod commands;
mod error;
mod library;
mod lyrics;
mod media;
mod netease;
mod nowplaying;
mod file_assoc;
mod server;
mod tools;
mod desktop_lyrics;
mod trash;
mod tray;
mod weather;
#[cfg(target_os = "macos")]
mod location_macos;

use media::probe::Probe;
use media::transcode::HlsManager;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

pub struct AppState {
    pub server: server::ServerInfo,
    pub hls: Arc<HlsManager>,
    pub library: lyrics::LyricsLibrary,
    pub media_lib: Arc<library::LibraryStore>,
    pub cache_dir: PathBuf,
    pub data_dir: PathBuf,
    pub models_dir: PathBuf,
    pub probes: Mutex<HashMap<String, Probe>>,
    pub pending_open: Mutex<Vec<String>>,
    pub frontend_ready: AtomicBool,
    pub asr_job: Mutex<Option<Arc<AtomicBool>>>,
    pub downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub now_playing: nowplaying::NowPlaying,
    pub tray: tray::TrayState,
    pub netease: netease::Netease,
}

/// Files macOS asks to open before `setup` has run: launching the app by
/// double-clicking a file delivers it ahead of `applicationDidFinishLaunching`.
/// (Windows passes them on the command line instead.)
static EARLY_OPEN: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Queues files to open, or forwards them right away once the UI is ready.
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
fn open_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        EARLY_OPEN.lock().unwrap().extend(paths);
        return;
    };
    // Checked under the queue lock, which `take_pending_open` also holds while
    // marking the UI ready, so nothing slips between the two.
    let mut pending = state.pending_open.lock().unwrap();
    if state.frontend_ready.load(Ordering::SeqCst) {
        drop(pending);
        let _ = app.emit("app://open-files", paths);
        tray::show_main(app);
        return;
    }
    pending.extend(paths);
}

/// The files among command line arguments (relative ones resolved against `cwd`).
fn file_args(args: impl IntoIterator<Item = String>, cwd: &std::path::Path) -> Vec<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a))
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

pub fn run() {
    let builder = tauri::Builder::default();
    // Double-clicking a file while LightPlayer runs starts a second process on
    // Windows: hand its files to the running one instead.
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        let paths = file_args(argv.into_iter().skip(1), std::path::Path::new(&cwd));
        if paths.is_empty() {
            tray::show_main(app);
        } else {
            open_paths(app, paths);
        }
    }));
    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let cache_dir = app.path().app_cache_dir()?;
            let data_dir = app.path().app_data_dir()?;
            let models_dir = data_dir.join("models");
            std::fs::create_dir_all(&cache_dir)?;
            std::fs::create_dir_all(&models_dir)?;
            let hls = Arc::new(HlsManager::new(&cache_dir));
            let server = tauri::async_runtime::block_on(server::start(hls.clone(), library::thumb::thumbs_dir(&cache_dir)))?;
            let cwd = std::env::current_dir().unwrap_or_default();
            let mut pending = file_args(std::env::args().skip(1), &cwd);
            pending.append(&mut EARLY_OPEN.lock().unwrap());
            app.manage(AppState {
                server,
                hls,
                netease: netease::Netease::new(&data_dir),
                library: lyrics::LyricsLibrary::new(&data_dir),
                media_lib: Arc::new(library::LibraryStore::load(&data_dir)),
                cache_dir,
                data_dir,
                models_dir,
                probes: Mutex::new(HashMap::new()),
                pending_open: Mutex::new(pending),
                frontend_ready: AtomicBool::new(false),
                asr_job: Mutex::new(None),
                downloads: Mutex::new(HashMap::new()),
                now_playing: nowplaying::NowPlaying::new(&handle),
                tray: tray::TrayState::new(),
            });
            // The menu bar icon is optional (e.g. Linux desktops without a tray).
            match tray::create(&handle) {
                Ok(t) => *app.state::<AppState>().tray.tray.lock().unwrap() = Some(t),
                Err(e) => eprintln!("menu bar icon unavailable: {e}"),
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let background = app.try_state::<AppState>().map(|s| s.tray.background.load(Ordering::SeqCst)).unwrap_or(false);
                let has_tray = app.try_state::<AppState>().map(|s| s.tray.tray.lock().unwrap().is_some()).unwrap_or(false);
                if window.label() == desktop_lyrics::LABEL {
                    api.prevent_close();
                    desktop_lyrics::on_close_requested(app);
                } else if window.label() == "main" && background && has_tray {
                    // Keep playing in the background; the menu bar icon or the Dock brings it back.
                    api.prevent_close();
                    // The UI pauses a video here unless it may keep playing.
                    let _ = app.emit("app://closed-to-background", ());
                    if window.is_fullscreen().unwrap_or(false) {
                        let _ = window.set_fullscreen(false);
                    }
                    let _ = window.hide();
                } else if window.label() == "main" {
                    // Quitting: take the desktop lyrics window along.
                    app.exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_media,
            commands::exact_audio,
            commands::cache_size,
            commands::cache_clear,
            commands::request_stream,
            commands::stop_streams,
            commands::scan_playlist,
            commands::get_video_info,
            commands::find_lyrics,
            commands::read_text_file,
            commands::write_text_file,
            commands::write_base64_file,
            commands::save_lyrics,
            commands::remove_library_lyrics,
            commands::asr_models,
            commands::asr_download,
            commands::asr_cancel_download,
            commands::asr_delete_model,
            commands::asr_start,
            commands::asr_cancel,
            commands::server_base,
            commands::import_background,
            commands::take_pending_open,
            commands::file_associations,
            commands::netease_status,
            commands::netease_qr_start,
            commands::netease_qr_check,
            commands::netease_login_cookie,
            commands::netease_web_login,
            commands::netease_web_login_cancel,
            commands::netease_logout,
            commands::netease_playlists,
            commands::netease_playlist,
            commands::netease_daily,
            commands::netease_search,
            commands::netease_comments,
            commands::netease_comment_replies,
            commands::set_file_associations,
            commands::now_playing_metadata,
            commands::now_playing_state,
            commands::set_background_prefs,
            commands::desktop_lyrics_set,
            commands::library_trash_tracks,
            commands::library_import_folder,
            commands::weather_locate,
            commands::weather_fetch,
            commands::weather_search,
            commands::ffmpeg_available,
            commands::library_get,
            commands::library_add_folder,
            commands::library_remove_folder,
            commands::library_rescan,
            commands::library_add_paths,
            commands::library_remove_tracks,
            commands::library_record_play,
            commands::library_set_favorite,
            commands::playlist_create,
            commands::playlist_rename,
            commands::playlist_delete,
            commands::playlist_set_items,
        ])
        .build(tauri::generate_context!())
        .expect("error while building LightPlayer");

    app.run(|handle, event| match event {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        tauri::RunEvent::Opened { urls } => {
            let paths = urls
                .into_iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            open_paths(handle, paths);
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => tray::show_main(handle),
        tauri::RunEvent::Exit => {
            if let Some(state) = handle.try_state::<AppState>() {
                state.hls.stop_all();
            }
        }
        _ => {
            let _ = handle;
        }
    });
}
