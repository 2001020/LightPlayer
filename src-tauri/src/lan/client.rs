//! The sending side: offer, upload and the sync loop for one session.

use super::protocol::*;
use super::{known_reason, Device, Inner, OutStage};
use futures_util::StreamExt;
use reqwest::header::{CONTENT_LENGTH, CONTENT_TYPE};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

fn url(addr: SocketAddr, path: &str) -> String {
    format!("http://{addr}/lan/v1/{path}")
}

/// A connection error as a reason code.
fn net_reason(e: &reqwest::Error) -> &'static str {
    let mut src: Option<&(dyn std::error::Error + 'static)> = Some(e);
    while let Some(s) = src {
        if let Some(io) = s.downcast_ref::<std::io::Error>() {
            if is_local_network_denied(io) {
                return reason::LOCAL_NETWORK_DENIED;
            }
        }
        src = s.source();
    }
    if e.is_timeout() || e.is_connect() {
        reason::UNREACHABLE
    } else {
        reason::FAILED
    }
}

async fn refusal(resp: reqwest::Response) -> &'static str {
    let body = resp.bytes().await.unwrap_or_default();
    serde_json::from_slice::<Refusal>(&body).map(|r| known_reason(&r.reason)).unwrap_or(reason::FAILED)
}

/// `GET /info` at `addr`.
pub async fn info(inner: &Inner, addr: SocketAddr, timeout: Duration) -> Result<Device, &'static str> {
    let resp = inner.http.get(url(addr, "info")).header(HEADER, "1").timeout(timeout).send().await.map_err(|e| net_reason(&e))?;
    if !resp.status().is_success() {
        return Err(reason::NOT_LIGHTPLAYER);
    }
    let body = resp.bytes().await.map_err(|e| net_reason(&e))?;
    let i: Info = serde_json::from_slice(&body).map_err(|_| reason::NOT_LIGHTPLAYER)?;
    if i.app != "LightPlayer" {
        return Err(reason::NOT_LIGHTPLAYER);
    }
    if i.proto != PROTO {
        return Err(reason::VERSION);
    }
    let port = if i.port > 0 { i.port } else { addr.port() };
    Ok(Device {
        id: i.peer.id,
        name: clean_label(&i.peer.name),
        platform: i.peer.platform,
        version: i.peer.version,
        addr: SocketAddr::new(addr.ip(), port).to_string(),
        manual: false,
    })
}

/// Tells the receiver the session is over (best effort).
pub async fn delete(inner: &Inner, addr: SocketAddr, id: &str, token: Option<&str>, why: &str) {
    let mut req = inner
        .http
        .delete(url(addr, &format!("session/{id}?reason={why}")))
        .header(HEADER, "1")
        .timeout(Duration::from_secs(2));
    if let Some(t) = token {
        req = req.header(TOKEN_HEADER, t);
    }
    let _ = req.send().await;
}

struct Job {
    id: String,
    addr: SocketAddr,
    path: PathBuf,
    file: FileInfo,
    cancel: CancellationToken,
}

/// Runs a whole share and reports how it ended.
pub async fn run_send(inner: Arc<Inner>, id: String) {
    let job = {
        let map = inner.outgoing.lock().unwrap();
        let Some(s) = map.get(&id) else { return };
        Job { id: id.clone(), addr: s.addr, path: s.path.clone(), file: s.file.clone(), cancel: s.cancel.clone() }
    };
    let mut token: Option<String> = None;
    let r = flow(&inner, &job, &mut token).await;
    let why = match r {
        Ok(()) => reason::STOPPED,
        Err(w) => w,
    };
    // Ended on this side: tell the receiver (quitting tells it separately).
    if (job.cancel.is_cancelled() || why == reason::SWITCHED) && !inner.exiting.load(Ordering::SeqCst) {
        delete(&inner, job.addr, &id, token.as_deref(), why).await;
    }
    inner.end_out(&id, why);
}

async fn flow(inner: &Arc<Inner>, job: &Job, token: &mut Option<String>) -> Result<(), &'static str> {
    let c = &job.cancel;
    // Offer.
    let offer = Offer { session: job.id.clone(), proto: PROTO, from: inner.me(), file: job.file.clone() };
    let req = inner
        .http
        .post(url(job.addr, "offer"))
        .header(HEADER, "1")
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&offer).unwrap_or_default())
        .timeout(Duration::from_secs(5))
        .send();
    let resp = tokio::select! {
        _ = c.cancelled() => return Err(reason::CANCELED),
        r = req => r.map_err(|e| net_reason(&e))?,
    };
    if resp.status().as_u16() != 202 {
        return Err(refusal(resp).await);
    }
    let body = resp.bytes().await.map_err(|e| net_reason(&e))?;
    let expires_in = serde_json::from_slice::<serde_json::Value>(&body).ok().and_then(|v| v["expiresIn"].as_f64()).unwrap_or(60_000.0);
    inner.update_out(&job.id, |s| {
        s.stage = OutStage::Waiting;
        s.expires_at = Some(super::now_ms() + expires_in);
    });

    // Wait for the answer.
    let mut errors = 0;
    let t = loop {
        let req = inner
            .http
            .get(url(job.addr, &format!("offer/{}?wait=10", job.id)))
            .header(HEADER, "1")
            .timeout(Duration::from_secs(15))
            .send();
        let r = tokio::select! {
            _ = c.cancelled() => return Err(reason::CANCELED),
            r = req => r,
        };
        let state = match r {
            Ok(resp) if resp.status().is_success() => resp.bytes().await.ok().and_then(|b| serde_json::from_slice::<OfferState>(&b).ok()),
            // The receiver no longer knows the offer (it restarted).
            Ok(resp) if resp.status().as_u16() == 404 => return Err(reason::LOST),
            Ok(resp) => return Err(refusal(resp).await),
            Err(_) => None,
        };
        match state {
            Some(s) if s.state == "accepted" => break s.token.unwrap_or_default(),
            Some(s) if s.state == "ended" => return Err(known_reason(s.reason.as_deref().unwrap_or(reason::FAILED))),
            Some(_) => errors = 0,
            None => {
                errors += 1;
                if errors >= 3 {
                    return Err(reason::UNREACHABLE);
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    };
    *token = Some(t.clone());
    inner.update_out(&job.id, |s| {
        s.stage = OutStage::Sending;
        s.token = Some(t.clone());
        s.expires_at = None;
    });

    upload(inner, job, &t).await?;
    inner.update_out(&job.id, |s| {
        s.stage = OutStage::Syncing;
        s.following = true;
    });
    sync_loop(inner, job, &t).await
}

/// Why an upload broke off, according to the receiver.
async fn ask_reason(inner: &Inner, job: &Job) -> Option<&'static str> {
    let resp = inner
        .http
        .get(url(job.addr, &format!("offer/{}", job.id)))
        .header(HEADER, "1")
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .ok()?;
    let b = resp.bytes().await.ok()?;
    let s: OfferState = serde_json::from_slice(&b).ok()?;
    s.reason.map(|r| known_reason(&r))
}

async fn upload(inner: &Arc<Inner>, job: &Job, token: &str) -> Result<(), &'static str> {
    let size = job.file.size;
    let file = tokio::fs::File::open(&job.path).await.map_err(|_| reason::NOT_FOUND)?;
    let sent = Arc::new(AtomicU64::new(0));
    let counter = sent.clone();
    let stream = tokio_util::io::ReaderStream::with_capacity(file, 256 * 1024).map(move |r| {
        if let Ok(b) = &r {
            counter.fetch_add(b.len() as u64, Ordering::Relaxed);
        }
        r
    });
    let req = inner
        .http
        .put(url(job.addr, &format!("upload/{}", job.id)))
        .header(HEADER, "1")
        .header(TOKEN_HEADER, token)
        .header(CONTENT_LENGTH, size)
        .body(reqwest::Body::wrap_stream(stream))
        .send();
    tokio::pin!(req);
    let mut meter = Meter::default();
    let mut last = (0u64, Instant::now());
    let mut tick = tokio::time::interval(Duration::from_millis(125));
    loop {
        tokio::select! {
            _ = job.cancel.cancelled() => return Err(reason::CANCELED),
            r = &mut req => {
                return match r {
                    Ok(resp) if resp.status().is_success() => {
                        inner.progress(&job.id, "send", size, size, meter.speed());
                        Ok(())
                    }
                    Ok(resp) => Err(refusal(resp).await),
                    Err(e) => Err(ask_reason(inner, job).await.unwrap_or_else(|| net_reason(&e))),
                };
            }
            _ = tick.tick() => {
                let b = sent.load(Ordering::Relaxed).min(size);
                let now = Instant::now();
                if b != last.0 {
                    last = (b, now);
                } else if now.duration_since(last.1) >= inner.cfg.chunk_idle * if b >= size { 2 } else { 1 } {
                    return Err(reason::STALLED);
                }
                if meter.tick(b) {
                    // The last bit counts once the receiver has checked and saved the file.
                    inner.progress(&job.id, "send", b.min(size.saturating_sub(1)), size, meter.speed());
                }
            }
        }
    }
}

/// Posts the playback state on every change and once per heartbeat until
/// either side ends the session.
async fn sync_loop(inner: &Arc<Inner>, job: &Job, token: &str) -> Result<(), &'static str> {
    let mine = job.path.to_string_lossy().into_owned();
    let mut rx = inner.anchor.subscribe();
    let mut seq: u64 = 0;
    let mut rtt: Option<f64> = None;
    let mut fails = 0;
    let mut following = true;
    let mut beat = tokio::time::interval(inner.cfg.heartbeat);
    beat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        let anchor = rx.borrow_and_update().clone();
        if let Some(a) = anchor {
            if a.path != mine {
                return Err(reason::SWITCHED);
            }
            seq += 1;
            let msg = SyncMsg { seq, playing: a.playing, pos: a.position_now(), rate: a.rate, lat: rtt.map(|r| r / 2.0).unwrap_or(0.0) };
            let t0 = Instant::now();
            let req = inner
                .http
                .post(url(job.addr, &format!("sync/{}", job.id)))
                .header(HEADER, "1")
                .header(TOKEN_HEADER, token)
                .header(CONTENT_TYPE, "application/json")
                .body(serde_json::to_vec(&msg).unwrap_or_default())
                .timeout(inner.cfg.sync_timeout)
                .send();
            let r = tokio::select! {
                _ = job.cancel.cancelled() => return Err(reason::STOPPED),
                r = req => r,
            };
            match r {
                Ok(resp) if resp.status().is_success() => {
                    let ms = t0.elapsed().as_secs_f64() * 1000.0;
                    rtt = Some(rtt.map_or(ms, |r| r * 0.8 + ms * 0.2));
                    fails = 0;
                    let reply = resp.bytes().await.ok().and_then(|b| serde_json::from_slice::<SyncReply>(&b).ok());
                    if let Some(rp) = reply {
                        if rp.following != following {
                            following = rp.following;
                            inner.update_out(&job.id, |s| s.following = following);
                        }
                    }
                }
                Ok(resp) if matches!(resp.status().as_u16(), 404 | 410) => {
                    let why = refusal(resp).await;
                    return Err(if why == reason::NOT_FOUND || why == reason::FAILED { reason::LEFT } else { why });
                }
                _ => {
                    fails += 1;
                    if fails >= 3 {
                        return Err(reason::LOST);
                    }
                }
            }
            beat.reset();
        }
        tokio::select! {
            _ = job.cancel.cancelled() => return Err(reason::STOPPED),
            r = rx.changed() => if r.is_err() { return Err(reason::STOPPED) },
            _ = beat.tick() => {}
        }
    }
}
