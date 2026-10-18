//! The receiving side's HTTP service (`/lan/v1/*`), on its own listener.

use super::protocol::*;
use super::{events, now_ms, InStage, Incoming, Inner};
use axum::body::Body;
use axum::extract::{ConnectInfo, Path as AxPath, Query, Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::serve::ListenerExt;
use axum::{Json, Router};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

type St = State<Arc<Inner>>;

pub async fn serve(inner: Arc<Inner>, listener: tokio::net::TcpListener, stop: CancellationToken) {
    let app = Router::new()
        .route("/lan/v1/info", get(info))
        .route("/lan/v1/offer", post(offer))
        .route("/lan/v1/offer/{id}", get(poll))
        .route("/lan/v1/upload/{id}", put(upload))
        .route("/lan/v1/sync/{id}", post(sync))
        .route("/lan/v1/session/{id}", delete(end))
        .layer(middleware::from_fn(guard))
        .with_state(inner);
    let listener = listener.tap_io(|tcp| {
        let _ = tcp.set_nodelay(true);
    });
    let _ = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(async move { stop.cancelled().await })
        .await;
}

fn refuse(status: StatusCode, why: &str) -> Response {
    (status, Json(json!({ "reason": why }))).into_response()
}

/// Only LightPlayer may talk to this service: the custom header cannot be set
/// by a web page without a CORS preflight (which is never answered), and
/// browsers always send `Origin` on such requests.
async fn guard(req: Request, next: Next) -> Response {
    let h = req.headers();
    if h.contains_key(header::ORIGIN) || h.get(HEADER).map(|v| v.as_bytes()) != Some(b"1") {
        return refuse(StatusCode::FORBIDDEN, reason::FORBIDDEN);
    }
    next.run(req).await
}

async fn info(State(inner): St) -> Response {
    let port = inner.port.lock().unwrap().unwrap_or(0);
    Json(Info { app: "LightPlayer".into(), proto: PROTO, peer: inner.me(), port }).into_response()
}

async fn offer(State(inner): St, ConnectInfo(addr): ConnectInfo<SocketAddr>, Json(o): Json<Offer>) -> Response {
    if !inner.running() {
        return refuse(StatusCode::SERVICE_UNAVAILABLE, reason::DISABLED);
    }
    if let Err(why) = validate_offer(&o) {
        let status = if why == reason::TOO_LARGE { StatusCode::PAYLOAD_TOO_LARGE } else { StatusCode::BAD_REQUEST };
        return refuse(status, why);
    }
    if inner.host.receive_dir().is_none() {
        return refuse(StatusCode::SERVICE_UNAVAILABLE, reason::NO_FOLDER);
    }
    let ip = addr.ip();
    if inner.declines.lock().unwrap().get(&ip).is_some_and(|v| v.len() >= 3) {
        return refuse(StatusCode::FORBIDDEN, reason::DECLINED);
    }
    let now = Instant::now();
    let ev = {
        let mut map = inner.incoming.lock().unwrap();
        if map.contains_key(&o.session) {
            return refuse(StatusCode::CONFLICT, reason::FORBIDDEN);
        }
        let pending: Vec<&Incoming> = map.values().filter(|s| s.stage == InStage::Offered).collect();
        if pending.len() >= 3 || pending.iter().any(|s| s.ip == ip) {
            return refuse(StatusCode::TOO_MANY_REQUESTS, reason::BUSY);
        }
        let file = FileInfo { name: sanitize_file_name(&o.file.name), size: o.file.size, kind: o.file.kind };
        let from = Peer {
            id: o.from.id.chars().take(64).collect(),
            name: clean_label(&o.from.name),
            platform: clean_label(&o.from.platform),
            version: clean_label(&o.from.version),
        };
        let (changed, _) = tokio::sync::watch::channel(());
        let s = Incoming {
            id: o.session.clone(),
            ip,
            from,
            file,
            stage: InStage::Offered,
            reason: None,
            token: random_id(),
            follow: false,
            expires: now + inner.cfg.offer_timeout,
            last_poll: now,
            since: now,
            last_sync: now,
            seq: 0,
            path: None,
            partial: None,
            cancel: CancellationToken::new(),
            changed,
        };
        let ev = Inner::in_event(&s);
        map.insert(o.session.clone(), s);
        ev
    };
    inner.emit(events::OFFER, ev.clone());
    inner.emit(events::SESSION, ev);
    inner.host.attention();
    let ms = inner.cfg.offer_timeout.as_millis() as u64;
    (StatusCode::ACCEPTED, Json(json!({ "expiresIn": ms }))).into_response()
}

#[derive(Deserialize)]
struct PollQuery {
    #[serde(default)]
    wait: Option<f64>,
}

fn offer_state(s: &Incoming) -> OfferState {
    match s.stage {
        InStage::Offered => OfferState { state: "pending".into(), token: None, reason: None },
        InStage::Ended => OfferState { state: "ended".into(), token: None, reason: s.reason.map(String::from) },
        _ => OfferState { state: "accepted".into(), token: Some(s.token.clone()), reason: None },
    }
}

/// Long poll: answers when the offer changes or after `wait` seconds.
async fn poll(State(inner): St, ConnectInfo(addr): ConnectInfo<SocketAddr>, AxPath(id): AxPath<String>, Query(q): Query<PollQuery>) -> Response {
    let wait = Duration::from_secs_f64(q.wait.unwrap_or(0.0).clamp(0.0, 3600.0)).min(inner.cfg.poll_wait);
    let deadline = Instant::now() + wait;
    loop {
        let mut rx = {
            let mut map = inner.incoming.lock().unwrap();
            let Some(s) = map.get_mut(&id) else { return refuse(StatusCode::NOT_FOUND, reason::NOT_FOUND) };
            if s.ip != addr.ip() {
                return refuse(StatusCode::FORBIDDEN, reason::FORBIDDEN);
            }
            s.last_poll = Instant::now();
            let st = offer_state(s);
            if st.state != "pending" || Instant::now() >= deadline {
                return Json(st).into_response();
            }
            s.changed.subscribe()
        };
        let left = deadline.saturating_duration_since(Instant::now());
        let _ = tokio::time::timeout(left, rx.changed()).await;
    }
}

/// Session access for a peer: same address, right token.
fn authorized(s: &Incoming, ip: IpAddr, headers: &HeaderMap) -> bool {
    s.ip == ip && headers.get(TOKEN_HEADER).map(|v| v.as_bytes()) == Some(s.token.as_bytes())
}

/// Deletes the partial file and ends the session unless disarmed (covers
/// every way the upload can stop, including the sender disconnecting).
struct PartialGuard {
    inner: Arc<Inner>,
    id: String,
    path: PathBuf,
    why: &'static str,
    armed: bool,
}

impl Drop for PartialGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
            if let Some(s) = self.inner.incoming.lock().unwrap().get_mut(&self.id) {
                s.partial = None;
            }
            self.inner.end_in(&self.id, self.why);
        }
    }
}

async fn upload(State(inner): St, ConnectInfo(addr): ConnectInfo<SocketAddr>, AxPath(id): AxPath<String>, headers: HeaderMap, body: Body) -> Response {
    let Some(dir) = inner.host.receive_dir() else { return refuse(StatusCode::SERVICE_UNAVAILABLE, reason::NO_FOLDER) };
    // Checked and claimed under one lock: a second upload for the session is refused.
    let (file, cancel, partial, ev) = {
        let mut map = inner.incoming.lock().unwrap();
        let Some(s) = map.get_mut(&id) else { return refuse(StatusCode::GONE, reason::NOT_FOUND) };
        if !authorized(s, addr.ip(), &headers) {
            return refuse(StatusCode::FORBIDDEN, reason::FORBIDDEN);
        }
        if s.stage != InStage::Accepted {
            return refuse(StatusCode::CONFLICT, s.reason.unwrap_or(reason::FORBIDDEN));
        }
        let short: String = id.chars().take(8).collect();
        let partial = dir.join(format!(".{}.{short}.{PARTIAL_EXT}", s.file.name));
        s.stage = InStage::Receiving;
        s.partial = Some(partial.clone());
        s.changed.send_replace(());
        (s.file.clone(), s.cancel.clone(), partial, Inner::in_event(s))
    };
    inner.emit(events::SESSION, ev);
    let mut guard = PartialGuard { inner: inner.clone(), id: id.clone(), path: partial.clone(), why: reason::FAILED, armed: true };
    macro_rules! fail {
        ($why:expr) => {{
            guard.why = $why;
            return refuse(StatusCode::UNPROCESSABLE_ENTITY, $why);
        }};
    }
    if let Err(e) = tokio::fs::create_dir_all(&dir).await {
        fail!(write_reason(&e));
    }
    let f = match tokio::fs::File::create(&partial).await {
        Ok(f) => f,
        Err(e) => fail!(write_reason(&e)),
    };
    let mut w = tokio::io::BufWriter::with_capacity(1 << 20, f);
    let mut stream = body.into_data_stream();
    let mut got: u64 = 0;
    let mut meter = Meter::default();
    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => {
                let why = inner.incoming.lock().unwrap().get(&id).and_then(|s| s.reason).unwrap_or(reason::CANCELED);
                guard.why = why;
                return refuse(StatusCode::CONFLICT, why);
            }
            r = tokio::time::timeout(inner.cfg.chunk_idle, stream.next()) => r,
        };
        match next {
            Err(_) => fail!(reason::STALLED),
            Ok(None) => break,
            Ok(Some(Err(_))) => fail!(reason::INCOMPLETE),
            Ok(Some(Ok(chunk))) => {
                got += chunk.len() as u64;
                if got > file.size {
                    fail!(reason::TOO_LARGE);
                }
                if let Err(e) = w.write_all(&chunk).await {
                    fail!(write_reason(&e));
                }
                if meter.tick(got) {
                    inner.progress(&id, "receive", got, file.size, meter.speed());
                }
            }
        }
    }
    if let Err(e) = w.flush().await {
        fail!(write_reason(&e));
    }
    let f = w.into_inner();
    if let Err(e) = f.sync_all().await {
        fail!(write_reason(&e));
    }
    drop(f);
    if got != file.size {
        fail!(reason::INCOMPLETE);
    }
    let dest = unique_path(&dir, &file.name);
    let mut tries = 0;
    loop {
        match tokio::fs::rename(&partial, &dest).await {
            Ok(()) => break,
            // A virus scanner may still hold the fresh file on Windows.
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied && tries < 5 => {
                tries += 1;
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            Err(e) => fail!(write_reason(&e)),
        }
    }
    guard.armed = false;
    inner.progress(&id, "receive", got, file.size, meter.speed());
    let mut follow = false;
    inner.update_in(&id, |s| {
        s.partial = None;
        s.path = Some(dest.clone());
        s.stage = InStage::Received;
        s.last_sync = Instant::now();
        follow = s.follow;
    });
    // Not following: the share is complete once the file is here.
    if !follow {
        inner.end_in(&id, reason::DONE);
    }
    let name = dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Json(json!({ "name": name })).into_response()
}

async fn sync(State(inner): St, ConnectInfo(addr): ConnectInfo<SocketAddr>, AxPath(id): AxPath<String>, headers: HeaderMap, Json(m): Json<SyncMsg>) -> Response {
    let (following, resumed, payload) = {
        let mut map = inner.incoming.lock().unwrap();
        let Some(s) = map.get_mut(&id) else { return refuse(StatusCode::GONE, reason::NOT_FOUND) };
        if !authorized(s, addr.ip(), &headers) {
            return refuse(StatusCode::FORBIDDEN, reason::FORBIDDEN);
        }
        match s.stage {
            InStage::Received | InStage::Syncing | InStage::Lost => {}
            InStage::Ended => return refuse(StatusCode::GONE, s.reason.unwrap_or(reason::LEFT)),
            _ => return refuse(StatusCode::CONFLICT, reason::FORBIDDEN),
        }
        if m.seq <= s.seq {
            return Json(SyncReply { following: s.follow }).into_response();
        }
        s.seq = m.seq;
        s.last_sync = Instant::now();
        let resumed = s.stage != InStage::Syncing;
        s.stage = InStage::Syncing;
        let pos = if m.pos.is_finite() { m.pos.max(0.0) } else { 0.0 };
        let rate = if m.rate.is_finite() && m.rate > 0.0 { m.rate.min(16.0) } else { 1.0 };
        let lat = if m.lat.is_finite() { m.lat.clamp(0.0, 2000.0) } else { 0.0 };
        let payload = json!({ "id": id, "playing": m.playing, "pos": pos, "rate": rate, "at": now_ms() - lat });
        (s.follow, resumed, payload)
    };
    if resumed {
        inner.update_in(&id, |_| {});
    }
    inner.emit(events::SYNC, payload);
    Json(SyncReply { following }).into_response()
}

#[derive(Deserialize)]
struct EndQuery {
    #[serde(default)]
    reason: Option<String>,
}

/// The sender ends the session (cancelled, stopped, switched media, quit).
async fn end(State(inner): St, ConnectInfo(addr): ConnectInfo<SocketAddr>, AxPath(id): AxPath<String>, headers: HeaderMap, Query(q): Query<EndQuery>) -> Response {
    {
        let map = inner.incoming.lock().unwrap();
        let Some(s) = map.get(&id) else { return StatusCode::NO_CONTENT.into_response() };
        let ok = if s.stage == InStage::Offered { s.ip == addr.ip() } else { authorized(s, addr.ip(), &headers) };
        if !ok {
            return refuse(StatusCode::FORBIDDEN, reason::FORBIDDEN);
        }
    }
    let why = match q.reason.as_deref() {
        Some(reason::CANCELED) => reason::CANCELED,
        Some(reason::SWITCHED) => reason::SWITCHED,
        Some(reason::EXIT) => reason::EXIT,
        _ => reason::STOPPED,
    };
    inner.end_in(&id, why);
    StatusCode::NO_CONTENT.into_response()
}
