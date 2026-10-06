//! Menu bar (status bar) icon and background running.
//!
//! Closing the main window only hides it while "run in background" is on, so
//! playback continues; the menu bar icon controls playback and brings the
//! window back. Its menu actions reuse the `media-control` events the system
//! "Now Playing" controls already send to the UI.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
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
    prev: MenuItem<Wry>,
    next: MenuItem<Wry>,
    private: CheckMenuItem<Wry>,
    show: MenuItem<Wry>,
    quit: MenuItem<Wry>,
    title: Mutex<String>,
    /// Something is open (the "now playing" line shows it, not the idle label).
    has_now: AtomicBool,
    playing: AtomicBool,
}

pub struct TrayState {
    pub tray: Mutex<Option<Tray>>,
    /// Hide instead of quitting when the window is closed.
    pub background: AtomicBool,
    /// Show the song title next to the menu bar icon (macOS).
    pub show_title: AtomicBool,
    /// The menu's labels in the UI language, keyed by their Chinese text.
    labels: Mutex<HashMap<String, String>>,
}

impl TrayState {
    pub fn new() -> Self {
        TrayState { tray: Mutex::new(None), background: AtomicBool::new(true), show_title: AtomicBool::new(false), labels: Mutex::new(HashMap::new()) }
    }

    /// A menu label in the UI language.
    fn label(&self, zh: &str) -> String {
        self.labels.lock().unwrap().get(zh).cloned().unwrap_or_else(|| zh.to_string())
    }

    /// The UI language's labels for the menu (from the frontend, which has the tables).
    pub fn set_labels(&self, labels: HashMap<String, String>) {
        *self.labels.lock().unwrap() = labels;
        if let Some(t) = self.tray.lock().unwrap().as_ref() {
            let playing = t.playing.load(Ordering::SeqCst);
            let _ = t.toggle.set_text(self.label(if playing { "暂停" } else { "播放" }));
            let _ = t.prev.set_text(self.label("上一首"));
            let _ = t.next.set_text(self.label("下一首"));
            let _ = t.private.set_text(self.label("无痕浏览模式"));
            let _ = t.show.set_text(self.label("显示 LightPlayer"));
            let _ = t.quit.set_text(self.label("退出 LightPlayer"));
            if !t.has_now.load(Ordering::SeqCst) {
                let _ = t.now.set_text(self.label("未在播放"));
            }
        }
    }

    pub fn set_prefs(&self, background: bool, show_title: bool, private_mode: bool) {
        self.background.store(background, Ordering::SeqCst);
        self.show_title.store(show_title, Ordering::SeqCst);
        if let Some(t) = self.tray.lock().unwrap().as_ref() {
            t.apply_title(show_title);
            let _ = t.private.set_checked(private_mode);
        }
    }

    pub fn set_now_playing(&self, title: &str, artist: Option<&str>) {
        let text = match artist {
            Some(a) if !a.is_empty() => format!("{title} - {a}"),
            _ => title.to_string(),
        };
        if let Some(t) = self.tray.lock().unwrap().as_ref() {
            t.has_now.store(true, Ordering::SeqCst);
            let _ = t.now.set_text(&text);
            let _ = t.icon.set_tooltip(Some(format!("LightPlayer\n{text}")));
            *t.title.lock().unwrap() = title.to_string();
            t.apply_title(self.show_title.load(Ordering::SeqCst));
        }
    }

    pub fn set_playing(&self, playing: bool) {
        if let Some(t) = self.tray.lock().unwrap().as_ref() {
            t.playing.store(playing, Ordering::SeqCst);
            let _ = t.toggle.set_text(self.label(if playing { "暂停" } else { "播放" }));
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
    let private = CheckMenuItem::with_id(app, "lp-private", "无痕浏览模式", true, false, None::<&str>)?;
    // Cloned into the menu handler so it never needs the tray lock.
    let private_item = private.clone();
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
            &private,
            &PredefinedMenuItem::separator(app)?,
            &show,
            &quit,
        ],
    )?;
    // macOS: a monochrome template icon in the menu bar, menu on click.
    // Windows: the app icon in the notification area; a click brings the
    // window back and the menu opens with a right click.
    #[cfg(not(target_os = "windows"))]
    let builder = TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray-template.png"))?)
        .icon_as_template(true)
        .show_menu_on_left_click(true);
    #[cfg(target_os = "windows")]
    let builder = TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    let icon = builder
        .tooltip("LightPlayer")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "lp-toggle" => control(app, "toggle"),
            "lp-prev" => control(app, "previous"),
            "lp-next" => control(app, "next"),
            "lp-private" => {
                // The item has already flipped its own check mark.
                let on = private_item.is_checked().unwrap_or(false);
                let _ = app.emit("media-control", ControlEvent { action: "privateMode".into(), value: Some(if on { 1.0 } else { 0.0 }) });
            }
            "lp-show" => show_main(app),
            "lp-quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(Tray {
        icon,
        now,
        toggle,
        prev,
        next,
        private,
        show,
        quit,
        title: Mutex::new(String::new()),
        has_now: AtomicBool::new(false),
        playing: AtomicBool::new(false),
    })
}
