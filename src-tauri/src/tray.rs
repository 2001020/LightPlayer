//! Menu bar (status bar) icon and background running.
//!
//! Closing the main window only hides it while "run in background" is on, so
//! playback continues; the menu bar icon controls playback and brings the
//! window back. Its menu actions reuse the `media-control` events the system
//! "Now Playing" controls already send to the UI.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

#[derive(Clone, Serialize)]
struct ControlEvent {
    action: String,
    value: Option<f64>,
}

pub struct Tray {
    icon: TrayIcon,
    now: MenuItem<Wry>,
    toggle: MenuItem<Wry>,
    title: Mutex<String>,
}

pub struct TrayState {
    pub tray: Mutex<Option<Tray>>,
    /// Hide instead of quitting when the window is closed.
    pub background: AtomicBool,
    /// Show the song title next to the menu bar icon (macOS).
    pub show_title: AtomicBool,
}

impl TrayState {
    pub fn new() -> Self {
        TrayState { tray: Mutex::new(None), background: AtomicBool::new(true), show_title: AtomicBool::new(false) }
    }

    pub fn set_prefs(&self, background: bool, show_title: bool) {
        self.background.store(background, Ordering::SeqCst);
        self.show_title.store(show_title, Ordering::SeqCst);
        if let Some(t) = self.tray.lock().unwrap().as_ref() {
            t.apply_title(show_title);
        }
    }

    pub fn set_now_playing(&self, title: &str, artist: Option<&str>) {
        let text = match artist {
            Some(a) if !a.is_empty() => format!("{title} - {a}"),
            _ => title.to_string(),
        };
        if let Some(t) = self.tray.lock().unwrap().as_ref() {
            let _ = t.now.set_text(&text);
            let _ = t.icon.set_tooltip(Some(format!("LightPlayer\n{text}")));
            *t.title.lock().unwrap() = title.to_string();
            t.apply_title(self.show_title.load(Ordering::SeqCst));
        }
    }

    pub fn set_playing(&self, playing: bool) {
        if let Some(t) = self.tray.lock().unwrap().as_ref() {
            let _ = t.toggle.set_text(if playing { "暂停" } else { "播放" });
        }
    }
}

impl Tray {
    fn apply_title(&self, show: bool) {
        let title = self.title.lock().unwrap().clone();
        let shown = if show && !title.is_empty() {
            let short: String = title.chars().take(24).collect();
            Some(if title.chars().count() > 24 { format!("{short}…") } else { short })
        } else {
            None
        };
        let _ = self.icon.set_title(shown);
    }
}

/// Brings the main window back (from the menu bar, the Dock or Finder).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn control(app: &AppHandle, action: &str) {
    let _ = app.emit("media-control", ControlEvent { action: action.into(), value: None });
}

pub fn create(app: &AppHandle) -> tauri::Result<Tray> {
    let now = MenuItem::with_id(app, "lp-now", "未在播放", false, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "lp-toggle", "播放", true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "lp-prev", "上一首", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "lp-next", "下一首", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "lp-show", "显示 LightPlayer", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "lp-quit", "退出 LightPlayer", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &now,
            &PredefinedMenuItem::separator(app)?,
            &toggle,
            &prev,
            &next,
            &PredefinedMenuItem::separator(app)?,
            &show,
            &quit,
        ],
    )?;
    let icon = TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray-template.png"))?)
        .icon_as_template(true)
        .tooltip("LightPlayer")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "lp-toggle" => control(app, "toggle"),
            "lp-prev" => control(app, "previous"),
            "lp-next" => control(app, "next"),
            "lp-show" => show_main(app),
            "lp-quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(Tray { icon, now, toggle, title: Mutex::new(String::new()) })
}
