//! Tauri commands and the app side of `LanHost`.

use super::{Device, LanHost, LanStatus, Target};
use crate::error::{AppError, AppResult};
use crate::AppState;
use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct TauriHost(pub AppHandle);

impl LanHost for TauriHost {
    fn emit(&self, event: &str, payload: Value) {
        let _ = self.0.emit_to("main", event, payload);
    }

    fn receive_dir(&self) -> Option<PathBuf> {
        let p = self.0.path();
        p.video_dir().or_else(|_| p.download_dir()).or_else(|_| p.home_dir()).ok().map(|d| d.join("LightPlayer"))
    }

    fn attention(&self) {
        let Some(w) = self.0.get_webview_window("main") else { return };
        if !w.is_visible().unwrap_or(true) || w.is_minimized().unwrap_or(false) {
            crate::tray::show_main(&self.0);
        }
        let _ = w.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
}

fn code(e: &'static str) -> AppError {
    AppError::msg(e)
}

#[tauri::command]
pub async fn lan_configure(state: State<'_, AppState>, enabled: bool, name: String) -> AppResult<LanStatus> {
    Ok(state.lan.configure(enabled, &name).await)
}

#[tauri::command]
pub async fn lan_status(state: State<'_, AppState>) -> AppResult<LanStatus> {
    Ok(state.lan.status())
}

#[tauri::command]
pub async fn lan_discover(state: State<'_, AppState>, on: bool) -> AppResult<()> {
    state.lan.discover(on);
    Ok(())
}

#[tauri::command]
pub async fn lan_probe(state: State<'_, AppState>, addr: String) -> AppResult<Device> {
    state.lan.probe(&addr).await.map_err(code)
}

#[tauri::command]
pub async fn lan_scan_subnet(state: State<'_, AppState>) -> AppResult<usize> {
    Ok(state.lan.scan_subnet().await)
}

#[tauri::command]
pub async fn lan_send(state: State<'_, AppState>, target: Target, path: String) -> AppResult<String> {
    state.lan.send(target, Path::new(&path)).map_err(code)
}

#[tauri::command]
pub async fn lan_cancel(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.lan.cancel(&id);
    Ok(())
}

#[tauri::command]
pub async fn lan_answer(state: State<'_, AppState>, id: String, accept: bool, follow: bool) -> AppResult<bool> {
    Ok(state.lan.answer(&id, accept, follow))
}

#[tauri::command]
pub async fn lan_follow(state: State<'_, AppState>, id: String, on: bool) -> AppResult<()> {
    state.lan.follow(&id, on);
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnchorIn {
    pub path: String,
    pub pos: f64,
    pub playing: bool,
    pub rate: f64,
    pub at: Option<f64>,
}

#[tauri::command]
pub fn lan_publish(state: State<'_, AppState>, anchor: AnchorIn) {
    state.lan.publish(anchor.path, anchor.pos, anchor.playing, anchor.rate, anchor.at);
}

#[tauri::command]
pub fn lan_open_receive_dir(app: AppHandle) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let dir = TauriHost(app.clone()).receive_dir().ok_or_else(|| code(super::protocol::reason::NO_FOLDER))?;
    std::fs::create_dir_all(&dir)?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| AppError::msg(e.to_string()))
}
