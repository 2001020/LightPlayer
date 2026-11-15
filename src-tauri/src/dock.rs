//! The Dock icon's menu (macOS): what is playing, playback controls and a few
//! shortcuts, above the items the system adds itself (options, show, quit).
//!
//! The menu is put together each time the Dock asks for it, from the state
//! kept here. Its items send the same `media-control` events to the UI as the
//! media keys and the menu bar icon.

use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Default)]
struct State {
    /// "Title - Artist" of what is open.
    now: Option<String>,
    playing: bool,
    private_mode: bool,
    desktop_lyrics: bool,
    /// Labels in the UI language, by their Chinese text.
    labels: HashMap<String, String>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

fn update(f: impl FnOnce(&mut State)) {
    f(STATE.lock().unwrap().get_or_insert_with(State::default));
}

pub fn set_now_playing(title: &str, artist: Option<&str>) {
    let text = match artist {
        Some(a) if !a.is_empty() => format!("{title} - {a}"),
        _ => title.to_string(),
    };
    update(|s| s.now = Some(text));
}

pub fn set_playing(playing: bool) {
    update(|s| s.playing = playing);
}

pub fn set_private_mode(on: bool) {
    update(|s| s.private_mode = on);
}

pub fn set_desktop_lyrics(on: bool) {
    update(|s| s.desktop_lyrics = on);
}

pub fn set_labels(labels: HashMap<String, String>) {
    update(|s| s.labels = labels);
}

const TOGGLE: isize = 1;
const PREVIOUS: isize = 2;
const NEXT: isize = 3;
const OPEN_FILE: isize = 4;
const LIBRARY: isize = 5;
const LYRICS: isize = 6;
const DESKTOP_LYRICS: isize = 7;
const PRIVATE_MODE: isize = 8;
const SETTINGS: isize = 9;

#[derive(Debug, PartialEq)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
enum Entry {
    /// A line of text that cannot be chosen.
    Info(String),
    Action { tag: isize, title: String, checked: bool },
    Separator,
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn entries(s: &State) -> Vec<Entry> {
    let label = |zh: &str| s.labels.get(zh).cloned().unwrap_or_else(|| zh.to_string());
    let action = |tag: isize, zh: &str| Entry::Action { tag, title: label(zh), checked: false };
    let check = |tag: isize, zh: &str, checked: bool| Entry::Action { tag, title: label(zh), checked };
    // A long title would make the menu as wide as the screen.
    let now = s.now.as_ref().map(|n| if n.chars().count() > 48 { format!("{}…", n.chars().take(48).collect::<String>()) } else { n.clone() });
    vec![
        Entry::Info(now.unwrap_or_else(|| label("未在播放"))),
        Entry::Separator,
        action(TOGGLE, if s.playing { "暂停" } else { "播放" }),
        action(PREVIOUS, "上一首"),
        action(NEXT, "下一首"),
        Entry::Separator,
        action(OPEN_FILE, "打开文件…"),
        action(LIBRARY, "媒体库"),
        action(LYRICS, "歌词"),
        Entry::Separator,
        check(DESKTOP_LYRICS, "桌面歌词", s.desktop_lyrics),
        check(PRIVATE_MODE, "无痕播放模式", s.private_mode),
        Entry::Separator,
        action(SETTINGS, "设置…"),
    ]
}

/// What choosing an item does: the `media-control` action, its value, and
/// whether the main window comes to the front for it.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn command(tag: isize, s: &State) -> Option<(&'static str, Option<f64>, bool)> {
    let flip = |on: bool| Some(if on { 0.0 } else { 1.0 });
    Some(match tag {
        TOGGLE => ("toggle", None, false),
        PREVIOUS => ("previous", None, false),
        NEXT => ("next", None, false),
        OPEN_FILE => ("openFile", None, true),
        LIBRARY => ("library", None, true),
        LYRICS => ("lyrics", None, true),
        DESKTOP_LYRICS => ("desktopLyrics", flip(s.desktop_lyrics), false),
        PRIVATE_MODE => ("privateMode", flip(s.private_mode), false),
        SETTINGS => ("settings", None, true),
        _ => return None,
    })
}

#[cfg(target_os = "macos")]
mod imp {
    use super::{command, entries, Entry, State, STATE};
    use crate::nowplaying::ControlEvent;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{msg_send, sel, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
    use objc2_foundation::NSString;
    use std::ffi::CStr;
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};

    static APP: OnceLock<AppHandle> = OnceLock::new();

    /// `-[NSApplicationDelegate applicationDockMenu:]`
    extern "C-unwind" fn dock_menu(this: &AnyObject, _cmd: Sel, _sender: *mut AnyObject) -> *mut NSMenu {
        let Some(mtm) = MainThreadMarker::new() else {
            return std::ptr::null_mut();
        };
        let list = entries(STATE.lock().unwrap().get_or_insert_with(State::default));
        let menu = NSMenu::new(mtm);
        // Items are enabled as set here, not by looking for who handles them.
        menu.setAutoenablesItems(false);
        for entry in list {
            let item = match entry {
                Entry::Separator => NSMenuItem::separatorItem(mtm),
                Entry::Info(text) => {
                    let item = NSMenuItem::new(mtm);
                    item.setTitle(&NSString::from_str(&text));
                    item.setEnabled(false);
                    item
                }
                Entry::Action { tag, title, checked } => {
                    let item = NSMenuItem::new(mtm);
                    item.setTitle(&NSString::from_str(&title));
                    item.setTag(tag);
                    // SAFETY: the delegate has `lpDockAction:` (added in `install`) and outlives the menu.
                    unsafe {
                        item.setTarget(Some(this));
                        item.setAction(Some(sel!(lpDockAction:)));
                        if checked {
                            let _: () = msg_send![&*item, setState: 1isize];
                        }
                    }
                    item
                }
            };
            menu.addItem(&item);
        }
        Retained::autorelease_return(menu)
    }

    /// The action of the menu's items.
    extern "C-unwind" fn dock_action(_this: &AnyObject, _cmd: Sel, sender: *mut AnyObject) {
        if sender.is_null() {
            return;
        }
        // SAFETY: the sender is the NSMenuItem that was chosen.
        let tag: isize = unsafe { msg_send![sender, tag] };
        let chosen = command(tag, STATE.lock().unwrap().get_or_insert_with(State::default));
        let (Some((action, value, show)), Some(app)) = (chosen, APP.get()) else {
            return;
        };
        if show {
            crate::tray::show_main(app);
        }
        let _ = app.emit("media-control", ControlEvent { action: action.into(), value });
    }

    /// Gives the app's delegate (the window toolkit's) the Dock menu methods.
    /// Call on the main thread, once the app has launched.
    pub fn install(app: &AppHandle) {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        if APP.set(app.clone()).is_err() {
            return;
        }
        let ns_app = NSApplication::sharedApplication(mtm);
        // SAFETY: plain getters and setters of NSApplication, on the main thread;
        // the methods added match their Objective-C signatures ("@@:@", "v@:@").
        unsafe {
            let delegate: *mut AnyObject = msg_send![&*ns_app, delegate];
            let Some(delegate) = delegate.as_ref() else {
                return;
            };
            let class = delegate.class() as *const AnyClass as *mut AnyClass;
            let menu_imp: Imp = std::mem::transmute(dock_menu as extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject) -> *mut NSMenu);
            let action_imp: Imp = std::mem::transmute(dock_action as extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject));
            let object = CStr::from_bytes_with_nul_unchecked(b"@@:@\0");
            let void = CStr::from_bytes_with_nul_unchecked(b"v@:@\0");
            objc2::ffi::class_addMethod(class, sel!(lpDockAction:), action_imp, void.as_ptr());
            if !objc2::ffi::class_addMethod(class, sel!(applicationDockMenu:), menu_imp, object.as_ptr()).as_bool() {
                return;
            }
            // The app may have noted which delegate methods exist when the
            // delegate was set: set it again now that there is one more.
            let _: () = msg_send![&*ns_app, setDelegate: std::ptr::null_mut::<AnyObject>()];
            let _: () = msg_send![&*ns_app, setDelegate: delegate];
        }
    }
}

#[cfg(target_os = "macos")]
pub use imp::install;

#[cfg(test)]
mod tests {
    use super::*;

    fn titles(s: &State) -> Vec<String> {
        entries(s)
            .into_iter()
            .map(|e| match e {
                Entry::Info(t) => format!("({t})"),
                Entry::Action { title, checked, .. } => format!("{}{title}", if checked { "✓" } else { "" }),
                Entry::Separator => "-".into(),
            })
            .collect()
    }

    #[test]
    fn shows_the_state_it_was_told() {
        let mut s = State::default();
        assert_eq!(
            titles(&s),
            ["(未在播放)", "-", "播放", "上一首", "下一首", "-", "打开文件…", "媒体库", "歌词", "-", "桌面歌词", "无痕播放模式", "-", "设置…"]
        );
        s.now = Some("晴天 - 周杰伦".into());
        s.playing = true;
        s.private_mode = true;
        s.desktop_lyrics = true;
        s.labels = HashMap::from([("暂停".to_string(), "Pause".to_string()), ("设置…".to_string(), "Settings…".to_string())]);
        let t = titles(&s);
        assert_eq!(t[0], "(晴天 - 周杰伦)");
        assert_eq!(t[2], "Pause");
        assert_eq!(&t[10..12], ["✓桌面歌词", "✓无痕播放模式"]);
        assert_eq!(t[13], "Settings…");
        // Long titles are cut.
        s.now = Some("长".repeat(80));
        assert_eq!(titles(&s)[0].chars().count(), 48 + 3);
    }

    #[test]
    fn every_item_has_a_command_and_switches_flip() {
        let mut s = State::default();
        for e in entries(&s) {
            if let Entry::Action { tag, title, .. } = e {
                assert!(command(tag, &s).is_some(), "{title}");
            }
        }
        assert_eq!(command(TOGGLE, &s), Some(("toggle", None, false)));
        assert_eq!(command(SETTINGS, &s), Some(("settings", None, true)));
        assert_eq!(command(PRIVATE_MODE, &s), Some(("privateMode", Some(1.0), false)));
        assert_eq!(command(DESKTOP_LYRICS, &s), Some(("desktopLyrics", Some(1.0), false)));
        s.private_mode = true;
        s.desktop_lyrics = true;
        assert_eq!(command(PRIVATE_MODE, &s), Some(("privateMode", Some(0.0), false)));
        assert_eq!(command(DESKTOP_LYRICS, &s), Some(("desktopLyrics", Some(0.0), false)));
        assert_eq!(command(99, &s), None);
    }
}
