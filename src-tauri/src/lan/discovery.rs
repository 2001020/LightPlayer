//! Finding other LightPlayers: the sender broadcasts a small UDP query, every
//! receiver answers it directly. (Plain UDP rather than mDNS: no fight with
//! the system's own responder over port 5353, and on Windows the answers to a
//! query get through the firewall without a rule on the sending side.)

use super::protocol::*;
use super::{Device, Inner};
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio_util::sync::CancellationToken;

/// Answers discovery queries until `stop`.
pub async fn respond(inner: Arc<Inner>, sock: UdpSocket, port: u16, stop: CancellationToken) {
    let mut buf = [0u8; MAX_DATAGRAM + 1];
    loop {
        let (n, from) = tokio::select! {
            _ = stop.cancelled() => return,
            r = sock.recv_from(&mut buf) => match r {
                Ok(v) => v,
                // e.g. ICMP "port unreachable" from an earlier answer (Windows).
                Err(_) => continue,
            },
        };
        let Some(q) = Beacon::decode(&buf[..n]) else { continue };
        if q.lp != "q" || q.v != PROTO || inner.nonces.lock().unwrap().contains(&q.n) || !allow(&inner, from.ip()) {
            continue;
        }
        let a = Beacon::answer(&q.n, &inner.me(), port);
        let _ = sock.send_to(&a.encode(), from).await;
    }
}

/// At most 10 answers per second to one address.
fn allow(inner: &Inner, ip: IpAddr) -> bool {
    let mut map = inner.answered.lock().unwrap();
    let now = Instant::now();
    if map.len() > 1024 {
        map.retain(|_, (t, _)| now.duration_since(*t) < Duration::from_secs(1));
    }
    let e = map.entry(ip).or_insert((now, 0));
    if now.duration_since(e.0) >= Duration::from_secs(1) {
        *e = (now, 0);
    }
    e.1 += 1;
    e.1 <= 10
}

fn targets(inner: &Inner) -> Vec<SocketAddr> {
    if inner.cfg.discovery_targets.is_empty() {
        broadcast_targets(&super::device::interfaces(), inner.cfg.query_port)
    } else {
        inner.cfg.discovery_targets.clone()
    }
}

/// Queries the network until `stop`, keeping `inner.devices` up to date.
pub async fn query(inner: Arc<Inner>, stop: CancellationToken) {
    let bind = if inner.cfg.discovery_targets.is_empty() { SocketAddr::from(([0, 0, 0, 0], 0)) } else { SocketAddr::new(inner.cfg.bind_ip, 0) };
    let sock = match UdpSocket::bind(bind).await {
        Ok(s) => s,
        Err(e) => {
            log::warn!("LAN discovery: {e}");
            return;
        }
    };
    let _ = sock.set_broadcast(true);
    let nonce = random_id();
    inner.nonces.lock().unwrap().push(nonce.clone());
    let packet = Beacon::query(&nonce).encode();
    let mut round = tokio::time::interval(inner.cfg.query_every);
    let mut again: Option<tokio::time::Instant> = None;
    let mut buf = [0u8; MAX_DATAGRAM + 1];
    inner.emit_devices();
    loop {
        tokio::select! {
            _ = stop.cancelled() => break,
            _ = round.tick() => {
                send_all(&inner, &sock, &packet).await;
                // A second copy shortly after, in case the first was lost.
                again = Some(tokio::time::Instant::now() + Duration::from_millis(150));
                expire(&inner);
            }
            _ = async { tokio::time::sleep_until(again.unwrap()).await }, if again.is_some() => {
                again = None;
                send_all(&inner, &sock, &packet).await;
            }
            r = sock.recv_from(&mut buf) => {
                let Ok((n, from)) = r else { continue };
                let Some(a) = Beacon::decode(&buf[..n]) else { continue };
                if a.lp != "a" || a.n != nonce || a.v != PROTO {
                    continue;
                }
                let d = Device {
                    id: a.id.unwrap_or_default(),
                    name: clean_label(a.name.as_deref().unwrap_or("")),
                    platform: a.platform.unwrap_or_default(),
                    version: a.ver.unwrap_or_default(),
                    addr: SocketAddr::new(from.ip(), a.port.unwrap_or(DEFAULT_PORT)).to_string(),
                    manual: false,
                };
                if inner.saw_device(d) {
                    inner.emit_devices();
                }
            }
        }
    }
    inner.nonces.lock().unwrap().retain(|n| *n != nonce);
}

async fn send_all(inner: &Inner, sock: &UdpSocket, packet: &[u8]) {
    let mut denied = false;
    for t in targets(inner) {
        if let Err(e) = sock.send_to(packet, t).await {
            denied |= is_local_network_denied(&e);
        }
    }
    let was = *inner.error.lock().unwrap() == Some(reason::LOCAL_NETWORK_DENIED);
    if denied != was {
        inner.set_error(if denied { Some(reason::LOCAL_NETWORK_DENIED) } else { None });
        inner.emit_devices();
    }
}

/// Drops devices that stopped answering (ones added by address stay).
fn expire(inner: &Inner) {
    let ttl = inner.cfg.device_ttl;
    let removed = {
        let mut map = inner.devices.lock().unwrap();
        let before = map.len();
        map.retain(|_, (d, seen)| d.manual || seen.elapsed() < ttl);
        before != map.len()
    };
    if removed {
        inner.emit_devices();
    }
}
