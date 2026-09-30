//! System media controls: macOS Now Playing / media keys (and Windows SMTC in
//! the future) via souvlaki. Events are forwarded to the WebView as
//! `media-control` events.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
pub struct ControlEvent {
    pub action: String,
    pub value: Option<f64>,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod imp {
    use super::ControlEvent;
    use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig, SeekDirection};
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};

    pub struct NowPlaying(Mutex<Option<MediaControls>>);

    // MediaControls on macOS is a unit struct wrapping global MPRemoteCommandCenter state.
    unsafe impl Send for NowPlaying {}
    unsafe impl Sync for NowPlaying {}

    impl NowPlaying {
        pub fn new(app: &AppHandle) -> Self {
            let config = PlatformConfig { display_name: "LightPlayer", dbus_name: "lightplayer", hwnd: None };
            let controls = MediaControls::new(config).ok().and_then(|mut c| {
                let app = app.clone();
                c.attach(move |e| {
                    let (action, value) = match e {
                        MediaControlEvent::Play => ("play", None),
                        MediaControlEvent::Pause | MediaControlEvent::Stop => ("pause", None),
                        MediaControlEvent::Toggle => ("toggle", None),
                        MediaControlEvent::Next => ("next", None),
                        MediaControlEvent::Previous => ("previous", None),
                        MediaControlEvent::Seek(SeekDirection::Forward) => ("seekBy", Some(15.0)),
                        MediaControlEvent::Seek(SeekDirection::Backward) => ("seekBy", Some(-15.0)),
                        MediaControlEvent::SeekBy(SeekDirection::Forward, d) => ("seekBy", Some(d.as_secs_f64())),
                        MediaControlEvent::SeekBy(SeekDirection::Backward, d) => ("seekBy", Some(-d.as_secs_f64())),
                        MediaControlEvent::SetPosition(MediaPosition(d)) => ("seekTo", Some(d.as_secs_f64())),
                        _ => return,
                    };
                    let _ = app.emit("media-control", ControlEvent { action: action.into(), value });
                })
                .ok()?;
                Some(c)
            });
            NowPlaying(Mutex::new(controls))
        }

        pub fn set_metadata(&self, title: &str, artist: Option<&str>, album: Option<&str>, duration: Option<f64>, cover_url: Option<&str>) {
            if let Some(c) = self.0.lock().unwrap().as_mut() {
                let _ = c.set_metadata(MediaMetadata {
                    title: Some(title),
                    artist,
                    album,
                    cover_url,
                    duration: duration.filter(|d| d.is_finite() && *d > 0.0).map(Duration::from_secs_f64),
                });
            }
        }

        pub fn set_playback(&self, playing: bool, position: Option<f64>) {
            if let Some(c) = self.0.lock().unwrap().as_mut() {
                let progress = position.filter(|p| p.is_finite() && *p >= 0.0).map(|p| MediaPosition(Duration::from_secs_f64(p)));
                let _ = c.set_playback(if playing {
                    MediaPlayback::Playing { progress }
                } else {
                    MediaPlayback::Paused { progress }
                });
            }
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
    use tauri::AppHandle;

    pub struct NowPlaying;

    impl NowPlaying {
        pub fn new(_app: &AppHandle) -> Self {
            NowPlaying
        }
        pub fn set_metadata(&self, _t: &str, _a: Option<&str>, _al: Option<&str>, _d: Option<f64>, _c: Option<&str>) {}
        pub fn set_playback(&self, _playing: bool, _position: Option<f64>) {}
    }
}

pub use imp::NowPlaying;
