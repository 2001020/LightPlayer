//! The desktop lyrics window: a small transparent, always-on-top window that
//! shows the current lyric line over other apps. Its content is the same web
//! app (`index.html#desktop-lyrics`); the main window sends it the lines.

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "desktop-lyrics";

pub fn set_visible(app: &AppHandle, show: bool) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(LABEL) {
        if show {
            w.show()?;
        } else {
            w.hide()?;
        }
        return Ok(());
    }
    if !show {
        return Ok(());
    }
    let (w, h) = (760.0, 110.0);
    let mut b = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#desktop-lyrics".into()))
        .title("桌面歌词")
        .inner_size(w, h)
        .min_inner_size(240.0, 56.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(true)
        .focused(false);
    // Default place: bottom centre of the main screen.
    if let Some(m) = app.primary_monitor()? {
        let s = m.scale_factor();
        let (mw, mh) = (m.size().width as f64 / s, m.size().height as f64 / s);
        let (mx, my) = (m.position().x as f64 / s, m.position().y as f64 / s);
        b = b.position(mx + (mw - w) / 2.0, my + mh - h - 96.0);
    }
    b.build()?;
    Ok(())
}

/// Closing the window (⌘W) only hides it; the main window is told so the
/// play bar button turns off.
pub fn on_close_requested(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
    let _ = app.emit_to("main", "desktop-lyrics://closed", ());
}
