//! Localhost HTTP server that feeds media to the WebView.
//!
//! WKWebView requires byte-range support for `<video>`, and HLS for streams, so
//! a tiny axum server is more reliable than a custom URI scheme. It only binds
//! 127.0.0.1 and every URL carries a per-launch random token.

pub mod range;

use crate::media::transcode::HlsManager;
use crate::tools::{command, tools};
use axum::body::Body;
use axum::extract::{Path as AxPath, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone)]
pub struct ServerState {
    pub token: String,
    pub hls: Arc<HlsManager>,
}

#[derive(Clone)]
pub struct ServerInfo {
    pub port: u16,
    pub token: String,
}

impl ServerInfo {
    pub fn base(&self) -> String {
        format!("http://127.0.0.1:{}/{}", self.port, self.token)
    }

    pub fn file_url(&self, path: &std::path::Path) -> String {
        format!("{}/file?p={}", self.base(), urlencode(&path.to_string_lossy()))
    }

    pub fn hls_url(&self, id: &str) -> String {
        format!("{}/hls/{}/index.m3u8", self.base(), id)
    }

    pub fn subtitle_url(&self, path: &std::path::Path, stream: Option<i64>) -> String {
        let mut u = format!("{}/sub?p={}", self.base(), urlencode(&path.to_string_lossy()));
        if let Some(s) = stream {
            u.push_str(&format!("&s={s}"));
        }
        u
    }
}

pub fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub async fn start(hls: Arc<HlsManager>) -> std::io::Result<ServerInfo> {
    let token = format!("{:032x}", rand::random::<u128>());
    let state = ServerState { token: token.clone(), hls };
    let app = Router::new()
        .route("/{token}/file", get(file_handler))
        .route("/{token}/hls/{id}/{name}", get(hls_handler))
        .route("/{token}/sub", get(subtitle_handler))
        .layer(middleware::from_fn(cors))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    Ok(ServerInfo { port, token })
}

async fn cors(req: Request, next: Next) -> Response {
    if req.method() == Method::OPTIONS {
        let mut r = StatusCode::NO_CONTENT.into_response();
        add_cors(r.headers_mut());
        return r;
    }
    let mut r = next.run(req).await;
    add_cors(r.headers_mut());
    r
}

fn add_cors(h: &mut HeaderMap) {
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    h.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("*"));
    h.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Range, Content-Length, Accept-Ranges"),
    );
}

#[derive(Deserialize)]
struct FileQuery {
    p: String,
}

fn forbidden() -> Response {
    StatusCode::FORBIDDEN.into_response()
}

async fn file_handler(
    State(st): State<ServerState>,
    AxPath(token): AxPath<String>,
    Query(q): Query<FileQuery>,
    headers: HeaderMap,
) -> Response {
    if token != st.token {
        return forbidden();
    }
    range::serve_file(PathBuf::from(q.p), &headers).await
}

async fn hls_handler(
    State(st): State<ServerState>,
    AxPath((token, id, name)): AxPath<(String, String, String)>,
    headers: HeaderMap,
) -> Response {
    if token != st.token {
        return forbidden();
    }
    if name.contains('/') || name.contains("..") {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Some(dir) = st.hls.session_dir(&id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let path = dir.join(&name);
    if name.ends_with(".m3u8") {
        // Wait until ffmpeg has written at least one segment.
        for _ in 0..600 {
            if let Ok(text) = tokio::fs::read_to_string(&path).await {
                if text.contains("#EXTINF") {
                    // Event playlists would otherwise start near the live edge.
                    let text = if text.contains("#EXT-X-START") {
                        text
                    } else {
                        text.replacen("#EXTM3U", "#EXTM3U\n#EXT-X-START:TIME-OFFSET=0,PRECISE=YES", 1)
                    };
                    let mut r = (StatusCode::OK, text).into_response();
                    let h = r.headers_mut();
                    h.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/vnd.apple.mpegurl"));
                    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
                    return r;
                }
            }
            match st.hls.status(&id) {
                Some((false, err)) if !path.is_file() || !err.is_empty() => {
                    // ffmpeg ended without producing a playlist.
                    if !tokio::fs::read_to_string(&path).await.map(|t| t.contains("#EXTINF")).unwrap_or(false) {
                        return (StatusCode::INTERNAL_SERVER_ERROR, format!("ffmpeg: {err}")).into_response();
                    }
                }
                None => return StatusCode::NOT_FOUND.into_response(),
                _ => {}
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        return StatusCode::GATEWAY_TIMEOUT.into_response();
    }
    // Segments are referenced by the playlist only once fully written.
    for _ in 0..100 {
        if path.is_file() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    range::serve_file(path, &headers).await
}

#[derive(Deserialize)]
struct SubQuery {
    p: String,
    s: Option<i64>,
}

/// Converts an external subtitle file or an embedded subtitle stream to WebVTT.
async fn subtitle_handler(
    State(st): State<ServerState>,
    AxPath(token): AxPath<String>,
    Query(q): Query<SubQuery>,
) -> Response {
    if token != st.token {
        return forbidden();
    }
    let mut cmd = command(&tools().ffmpeg);
    cmd.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-i"]).arg(&q.p);
    match q.s {
        Some(idx) => cmd.args(["-map", &format!("0:{idx}")]),
        None => cmd.args(["-map", "0:s:0"]),
    };
    cmd.args(["-f", "webvtt", "-"]);
    match cmd.output().await {
        Ok(out) if out.status.success() => {
            let mut r = Response::new(Body::from(out.stdout));
            r.headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static("text/vtt; charset=utf-8"));
            r
        }
        Ok(out) => (StatusCode::UNPROCESSABLE_ENTITY, String::from_utf8_lossy(&out.stderr).into_owned())
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::probe::probe;
    use crate::media::transcode::HlsMode;

    fn ffmpeg(args: &[&str]) -> bool {
        std::process::Command::new(&tools().ffmpeg)
            .args(["-hide_banner", "-loglevel", "error", "-y"])
            .args(args)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    #[tokio::test]
    async fn serves_ranges_hls_and_subtitles() {
        let dir = tempfile::tempdir().unwrap();
        let hls = Arc::new(HlsManager::new(dir.path()));
        let info = start(hls.clone()).await.unwrap();
        let client = reqwest::Client::new();

        let file = dir.path().join("数据 file.bin");
        std::fs::write(&file, (0u8..=255).collect::<Vec<_>>()).unwrap();
        let url = info.file_url(&file);
        let r = client.get(&url).header("Range", "bytes=10-19").send().await.unwrap();
        assert_eq!(r.status(), 206);
        assert_eq!(r.headers()["content-range"], "bytes 10-19/256");
        assert_eq!(r.headers()["access-control-allow-origin"], "*");
        assert_eq!(r.bytes().await.unwrap().to_vec(), (10u8..20).collect::<Vec<_>>());
        let r = client.get(&url).send().await.unwrap();
        assert_eq!(r.status(), 200);
        assert_eq!(r.bytes().await.unwrap().len(), 256);
        let bad = url.replace(&info.token, "wrong");
        assert_eq!(client.get(&bad).send().await.unwrap().status(), 403);

        // Subtitles and HLS need a working ffmpeg with libx264.
        let srt = dir.path().join("a.srt");
        std::fs::write(&srt, "1\n00:00:01,000 --> 00:00:02,000\n你好\n").unwrap();
        if !ffmpeg(&["-version"]) {
            return;
        }
        let vtt = client.get(info.subtitle_url(&srt, None)).send().await.unwrap();
        assert_eq!(vtt.status(), 200);
        let text = vtt.text().await.unwrap();
        assert!(text.starts_with("WEBVTT") && text.contains("你好"), "{text}");

        let mkv = dir.path().join("v.mkv");
        if !ffmpeg(&[
            "-f", "lavfi", "-i", "testsrc=size=160x120:rate=25:duration=6",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", mkv.to_str().unwrap(),
        ]) {
            return;
        }
        let p = probe(&mkv).await.unwrap();
        let s = hls.start(&mkv, &p, 0.0, HlsMode::Copy).await.unwrap();
        let pl = client.get(info.hls_url(&s.id)).send().await.unwrap();
        assert_eq!(pl.status(), 200);
        assert_eq!(pl.headers()["content-type"], "application/vnd.apple.mpegurl");
        let body = pl.text().await.unwrap();
        assert!(body.contains("#EXT-X-START:TIME-OFFSET=0"));
        let seg = body.lines().find(|l| l.ends_with(".m4s")).expect("segment listed");
        let base = info.hls_url(&s.id).replace("index.m3u8", "");
        let init = client.get(format!("{base}init.mp4")).send().await.unwrap();
        assert_eq!(init.status(), 200);
        let seg = client.get(format!("{base}{seg}")).send().await.unwrap();
        assert_eq!(seg.status(), 200);
        assert!(seg.bytes().await.unwrap().len() > 100);
        hls.stop_all();
    }
}
