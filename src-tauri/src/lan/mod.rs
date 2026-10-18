//! LAN sync playback: send the open media file to another LightPlayer on the
//! same network, then keep its playback in step with ours.
//!
//! The sender only makes outgoing connections. The receiving side runs a small
//! HTTP service on its own listener (never the localhost media server, which
//! can read any file) plus a UDP responder for discovery; both can be turned
//! off in Settings.
//!
//! Sharing, step by step (A sends to B):
//! 1. A finds B: a UDP query broadcast, B answers straight back.
//! 2. A offers the file; B's user accepts or declines (A long-polls for it).
//! 3. A uploads the file in one streamed request; B writes a partial file,
//!    checks the length and renames it into Movies/LightPlayer.
//! 4. A posts its playback state on every change and once a second; B's UI
//!    follows it. Either side can end the session at any time.

pub mod client;
pub mod commands;
pub mod device;
pub mod discovery;
pub mod protocol;
pub mod server;

use protocol::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

/// What the service needs from the app (an AppHandle in the app, a recorder
/// in tests).
pub trait LanHost: Send + Sync + 'static {
    fn emit(&self, event: &str, payload: Value);
    /// Where received files go (Movies/LightPlayer); created on first use.
    fn receive_dir(&self) -> Option<PathBuf>;
    /// An offer arrived: make sure the user notices.
    fn attention(&self);
}

pub mod events {
    pub const DEVICES: &str = "lan://devices";
    pub const OFFER: &str = "lan://offer";
    pub const PROGRESS: &str = "lan://progress";
    pub const SESSION: &str = "lan://session";
    pub const SYNC: &str = "lan://sync";
}

#[derive(Clone, Debug)]
pub struct LanConfig {
    pub bind_ip: IpAddr,
    /// Preferred TCP port (another one is picked when it is taken; 0 = any).
    pub tcp_port: u16,
    /// UDP port the discovery responder listens on.
    pub udp_port: u16,
    /// UDP port queries are sent to.
    pub query_port: u16,
    /// Send queries here instead of broadcasting (tests).
    pub discovery_targets: Vec<SocketAddr>,
    /// How long the receiver's user has to answer an offer.
    pub offer_timeout: Duration,
    /// A pending offer is withdrawn when the sender stops asking about it.
    pub poll_idle: Duration,
    /// Longest wait of one offer poll.
    pub poll_wait: Duration,
    /// The upload must start this soon after the offer is accepted.
    pub upload_start: Duration,
    /// Longest pause in an upload before it counts as stalled.
    pub chunk_idle: Duration,
    /// Without a sync message for this long the receiver shows "connection lost".
    pub sync_idle: Duration,
    /// ...and ends the session after this long.
    pub lost_end: Duration,
    /// The sender posts its state at least this often.
    pub heartbeat: Duration,
    pub sync_timeout: Duration,
    /// Housekeeping interval (expiring offers, idle sessions).
    pub tick: Duration,
    pub query_every: Duration,
    /// A discovered device disappears after this long without an answer.
    pub device_ttl: Duration,
}

impl Default for LanConfig {
    fn default() -> Self {
        LanConfig {
            bind_ip: IpAddr::V4(Ipv4Addr::UNSPECIFIED),
            tcp_port: DEFAULT_PORT,
            udp_port: DEFAULT_PORT,
            query_port: DEFAULT_PORT,
            discovery_targets: Vec::new(),
            offer_timeout: Duration::from_secs(60),
            poll_idle: Duration::from_secs(15),
            poll_wait: Duration::from_secs(10),
            upload_start: Duration::from_secs(30),
            chunk_idle: Duration::from_secs(30),
            sync_idle: Duration::from_secs(5),
            lost_end: Duration::from_secs(60),
            heartbeat: Duration::from_secs(1),
            sync_timeout: Duration::from_secs(2),
            tick: Duration::from_millis(250),
            query_every: Duration::from_secs(2),
            device_ttl: Duration::from_secs(6),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InStage {
    Offered,
    Accepted,
    Receiving,
    Received,
    Syncing,
    Lost,
    Ended,
}

impl InStage {
    fn as_str(self) -> &'static str {
        match self {
            InStage::Offered => "offered",
            InStage::Accepted => "accepted",
            InStage::Receiving => "receiving",
            InStage::Received => "received",
            InStage::Syncing => "syncing",
            InStage::Lost => "lost",
            InStage::Ended => "ended",
        }
    }

    /// Accepted and not over yet.
    fn active(self) -> bool {
        !matches!(self, InStage::Offered | InStage::Ended)
    }
}

/// A file someone is sending to us.
pub(crate) struct Incoming {
    pub id: String,
    pub ip: IpAddr,
    pub from: Peer,
    pub file: FileInfo,
    pub stage: InStage,
    pub reason: Option<&'static str>,
    pub token: String,
    pub follow: bool,
    pub expires: Instant,
    pub last_poll: Instant,
    pub since: Instant,
    pub last_sync: Instant,
    pub seq: u64,
    pub path: Option<PathBuf>,
    pub partial: Option<PathBuf>,
    pub cancel: CancellationToken,
    /// Bumped on every change (wakes offer polls).
    pub changed: watch::Sender<()>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum OutStage {
    Connecting,
    Waiting,
    Sending,
    Syncing,
    Ended,
}

impl OutStage {
    fn as_str(self) -> &'static str {
        match self {
            OutStage::Connecting => "connecting",
            OutStage::Waiting => "waiting",
            OutStage::Sending => "sending",
            OutStage::Syncing => "syncing",
            OutStage::Ended => "ended",
        }
    }
}

/// A file we are sending.
pub(crate) struct Outgoing {
    pub id: String,
    pub addr: SocketAddr,
    pub peer: Peer,
    pub path: PathBuf,
    pub file: FileInfo,
    pub stage: OutStage,
    pub reason: Option<&'static str>,
    pub token: Option<String>,
    pub following: bool,
    pub expires_at: Option<f64>,
    pub ended_at: Option<Instant>,
    pub cancel: CancellationToken,
}

/// The sender's playback position, as last reported by its UI.
#[derive(Clone, Debug)]
pub struct Anchor {
    pub path: String,
    pub pos: f64,
    pub playing: bool,
    pub rate: f64,
    pub at: Instant,
}

impl Anchor {
    pub fn position_now(&self) -> f64 {
        self.pos + if self.playing { self.at.elapsed().as_secs_f64() * self.rate } else { 0.0 }
    }
}

/// A LightPlayer found on the network.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub version: String,
    pub addr: String,
    /// Added by address (stays until discovery stops).
    pub manual: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub addresses: Vec<String>,
    pub receive_dir: Option<String>,
    pub error: Option<String>,
    pub name: String,
}

struct Running {
    port: u16,
    stop: CancellationToken,
    server: tokio::task::JoinHandle<()>,
}

pub(crate) struct Inner {
    pub host: Arc<dyn LanHost>,
    pub cfg: LanConfig,
    /// Random per launch (a copied settings file must not make two
    /// computers look like one).
    pub id: String,
    pub version: String,
    pub name: Mutex<String>,
    pub http: reqwest::Client,
    running: tokio::sync::Mutex<Option<Running>>,
    pub port: Mutex<Option<u16>>,
    /// Port of the discovery responder.
    pub udp_port: Mutex<Option<u16>>,
    pub error: Mutex<Option<&'static str>>,
    pub incoming: Mutex<HashMap<String, Incoming>>,
    pub outgoing: Mutex<HashMap<String, Outgoing>>,
    pub anchor: watch::Sender<Option<Anchor>>,
    pub devices: Mutex<HashMap<String, (Device, Instant)>>,
    pub discovery: Mutex<Option<CancellationToken>>,
    /// Nonces of our own discovery queries (the responder ignores them).
    pub nonces: Mutex<Vec<String>>,
    /// Recent declines per address (repeated offers are turned away for a while).
    pub declines: Mutex<HashMap<IpAddr, Vec<Instant>>>,
    /// Discovery answers sent per address in the current second.
    pub answered: Mutex<HashMap<IpAddr, (Instant, u32)>>,
    pub exiting: AtomicBool,
}

pub fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

/// Maps a reason code from a peer to ours (unknown ones become `failed`).
pub fn known_reason(s: &str) -> &'static str {
    use reason::*;
    for r in [
        DECLINED, TIMEOUT, TOO_LARGE, UNSUPPORTED, BUSY, DISABLED, VERSION, CANCELED, DISK_FULL, WRITE_FAILED, INCOMPLETE,
        STALLED, FAILED, SWITCHED, STOPPED, LEFT, EXIT, LOST, REPLACED, DONE, FORBIDDEN, NOT_FOUND, UNREACHABLE,
        NOT_LIGHTPLAYER, LOCAL_NETWORK_DENIED, NO_FOLDER,
    ] {
        if r == s {
            return r;
        }
    }
    FAILED
}

impl Inner {
    pub fn me(&self) -> Peer {
        Peer {
            id: self.id.clone(),
            name: self.name.lock().unwrap().clone(),
            platform: device::platform().into(),
            version: self.version.clone(),
        }
    }

    pub fn emit(&self, event: &str, payload: Value) {
        self.host.emit(event, payload);
    }

    pub(crate) fn in_event(s: &Incoming) -> Value {
        let left = s.expires.saturating_duration_since(Instant::now()).as_secs_f64() * 1000.0;
        json!({
            "id": s.id,
            "role": "receive",
            "stage": s.stage.as_str(),
            "peer": { "name": s.from.name, "platform": s.from.platform, "addr": s.ip.to_string() },
            "file": s.file,
            "reason": s.reason,
            "path": s.path.as_ref().map(|p| p.to_string_lossy().into_owned()),
            "following": s.follow,
            "expiresAt": if s.stage == InStage::Offered { Some(now_ms() + left) } else { None },
        })
    }

    fn out_event(s: &Outgoing) -> Value {
        json!({
            "id": s.id,
            "role": "send",
            "stage": s.stage.as_str(),
            "peer": { "name": s.peer.name, "platform": s.peer.platform, "addr": s.addr.to_string() },
            "file": s.file,
            "reason": s.reason,
            "path": s.path.to_string_lossy(),
            "following": s.following,
            "expiresAt": s.expires_at,
        })
    }

    /// Changes an incoming session under the lock, then reports it.
    pub fn update_in(&self, id: &str, f: impl FnOnce(&mut Incoming)) -> bool {
        let ev = {
            let mut map = self.incoming.lock().unwrap();
            let Some(s) = map.get_mut(id) else { return false };
            f(s);
            s.changed.send_replace(());
            Self::in_event(s)
        };
        self.emit(events::SESSION, ev);
        true
    }

    /// Ends an incoming session (no-op once ended).
    pub fn end_in(&self, id: &str, why: &'static str) {
        let ev = {
            let mut map = self.incoming.lock().unwrap();
            let Some(s) = map.get_mut(id) else { return };
            if s.stage == InStage::Ended {
                return;
            }
            s.stage = InStage::Ended;
            s.reason = Some(why);
            s.since = Instant::now();
            s.cancel.cancel();
            s.changed.send_replace(());
            Self::in_event(s)
        };
        self.emit(events::SESSION, ev);
    }

    pub fn update_out(&self, id: &str, f: impl FnOnce(&mut Outgoing)) {
        let ev = {
            let mut map = self.outgoing.lock().unwrap();
            let Some(s) = map.get_mut(id) else { return };
            if s.stage == OutStage::Ended {
                return;
            }
            f(s);
            Self::out_event(s)
        };
        self.emit(events::SESSION, ev);
    }

    pub fn end_out(&self, id: &str, why: &'static str) {
        self.update_out(id, |s| {
            s.stage = OutStage::Ended;
            s.reason = Some(why);
            s.ended_at = Some(Instant::now());
            s.cancel.cancel();
        });
    }

    pub fn progress(&self, id: &str, role: &str, bytes: u64, total: u64, speed: f64) {
        self.emit(events::PROGRESS, json!({ "id": id, "role": role, "bytes": bytes, "total": total, "speed": speed }));
    }

    pub fn running(&self) -> bool {
        self.port.lock().unwrap().is_some()
    }

    pub fn set_error(&self, e: Option<&'static str>) {
        *self.error.lock().unwrap() = e;
    }

    pub fn emit_devices(&self) {
        let mut list: Vec<Device> = self.devices.lock().unwrap().values().map(|(d, _)| d.clone()).collect();
        list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.addr.cmp(&b.addr)));
        let error = *self.error.lock().unwrap();
        self.emit(events::DEVICES, json!({ "devices": list, "error": error }));
    }

    /// Adds or refreshes a device; true when the list changed.
    pub fn saw_device(&self, d: Device) -> bool {
        if d.id == self.id {
            return false;
        }
        let mut map = self.devices.lock().unwrap();
        // The same computer may answer on several interfaces: one entry per id.
        let changed = match map.get(&d.id) {
            Some((old, _)) => old.name != d.name || old.addr != d.addr || (d.manual && !old.manual),
            None => true,
        };
        let manual = d.manual || map.get(&d.id).is_some_and(|(o, _)| o.manual);
        map.insert(d.id.clone(), (Device { manual, ..d }, Instant::now()));
        changed
    }

    /// Housekeeping for incoming sessions and the decline history.
    fn reap(&self) {
        let now = Instant::now();
        let mut ends: Vec<(String, &'static str)> = Vec::new();
        let mut lost: Vec<String> = Vec::new();
        {
            let mut map = self.incoming.lock().unwrap();
            map.retain(|_, s| !(s.stage == InStage::Ended && now.duration_since(s.since) > Duration::from_secs(120)));
            for s in map.values() {
                match s.stage {
                    InStage::Offered if now >= s.expires => ends.push((s.id.clone(), reason::TIMEOUT)),
                    InStage::Offered if now.duration_since(s.last_poll) >= self.cfg.poll_idle => {
                        ends.push((s.id.clone(), reason::CANCELED))
                    }
                    InStage::Accepted if now.duration_since(s.since) >= self.cfg.upload_start => {
                        ends.push((s.id.clone(), reason::TIMEOUT))
                    }
                    InStage::Received | InStage::Syncing if now.duration_since(s.last_sync) >= self.cfg.sync_idle => {
                        lost.push(s.id.clone())
                    }
                    InStage::Lost if now.duration_since(s.last_sync) >= self.cfg.lost_end => {
                        ends.push((s.id.clone(), reason::LOST))
                    }
                    _ => {}
                }
            }
        }
        for id in lost {
            self.update_in(&id, |s| s.stage = InStage::Lost);
        }
        for (id, why) in ends {
            self.end_in(&id, why);
        }
        self.declines.lock().unwrap().retain(|_, v| {
            v.retain(|t| now.duration_since(*t) < Duration::from_secs(120));
            !v.is_empty()
        });
    }

    /// Ends every incoming session (service turned off or app quitting).
    fn end_all_in(&self, why: &'static str) {
        let ids: Vec<String> = self.incoming.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.end_in(&id, why);
        }
    }
}

/// Cheap to clone; all clones share one service.
#[derive(Clone)]
pub struct LanService {
    pub(crate) inner: Arc<Inner>,
}

/// A device to send to (from the device list).
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub addr: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub platform: String,
}

impl LanService {
    pub fn new(host: Arc<dyn LanHost>, cfg: LanConfig, version: &str) -> Self {
        let http = reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_secs(3))
            .tcp_keepalive(Duration::from_secs(15))
            .tcp_nodelay(true)
            .pool_idle_timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        let (anchor, _) = watch::channel(None);
        LanService {
            inner: Arc::new(Inner {
                host,
                cfg,
                id: random_id(),
                version: version.into(),
                name: Mutex::new(device::default_name()),
                http,
                running: tokio::sync::Mutex::new(None),
                port: Mutex::new(None),
                udp_port: Mutex::new(None),
                error: Mutex::new(None),
                incoming: Mutex::new(HashMap::new()),
                outgoing: Mutex::new(HashMap::new()),
                anchor,
                devices: Mutex::new(HashMap::new()),
                discovery: Mutex::new(None),
                nonces: Mutex::new(Vec::new()),
                declines: Mutex::new(HashMap::new()),
                answered: Mutex::new(HashMap::new()),
                exiting: AtomicBool::new(false),
            }),
        }
    }

    pub fn status(&self) -> LanStatus {
        let i = &self.inner;
        LanStatus {
            running: i.running(),
            port: *i.port.lock().unwrap(),
            addresses: device::addresses(),
            receive_dir: i.host.receive_dir().map(|p| p.to_string_lossy().into_owned()),
            error: i.error.lock().unwrap().map(String::from),
            name: i.name.lock().unwrap().clone(),
        }
    }

    pub fn port(&self) -> Option<u16> {
        *self.inner.port.lock().unwrap()
    }

    pub fn udp_port(&self) -> Option<u16> {
        *self.inner.udp_port.lock().unwrap()
    }

    /// Turns the receiving service on or off and sets the device name
    /// (empty: the computer's name).
    pub async fn configure(&self, enabled: bool, name: &str) -> LanStatus {
        let name = name.trim();
        *self.inner.name.lock().unwrap() = if name.is_empty() { device::default_name() } else { clean_label(name) };
        let mut running = self.inner.running.lock().await;
        if enabled && running.is_none() {
            match self.start().await {
                Ok(r) => *running = Some(r),
                Err(e) => {
                    log::warn!("LAN service: {e}");
                    self.inner.set_error(Some(if is_local_network_denied(&e) { reason::LOCAL_NETWORK_DENIED } else { "listen_failed" }));
                }
            }
        } else if !enabled {
            if let Some(r) = running.take() {
                self.stop(r).await;
            }
            self.inner.set_error(None);
        }
        drop(running);
        self.status()
    }

    async fn start(&self) -> std::io::Result<Running> {
        let cfg = &self.inner.cfg;
        let listener = match tokio::net::TcpListener::bind((cfg.bind_ip, cfg.tcp_port)).await {
            Ok(l) => l,
            Err(e) if cfg.tcp_port != 0 && e.kind() == std::io::ErrorKind::AddrInUse => {
                tokio::net::TcpListener::bind((cfg.bind_ip, 0)).await?
            }
            Err(e) => return Err(e),
        };
        let port = listener.local_addr()?.port();
        let stop = CancellationToken::new();
        self.inner.set_error(None);
        clean_partials(self.inner.host.receive_dir().as_deref());

        let server = tokio::spawn(server::serve(self.inner.clone(), listener, stop.clone()));
        match tokio::net::UdpSocket::bind((cfg.bind_ip, cfg.udp_port)).await {
            Ok(sock) => {
                let _ = sock.set_broadcast(true);
                *self.inner.udp_port.lock().unwrap() = sock.local_addr().ok().map(|a| a.port());
                tokio::spawn(discovery::respond(self.inner.clone(), sock, port, stop.clone()));
            }
            Err(e) => {
                // Sending and connecting by address still work.
                log::warn!("LAN discovery responder: {e}");
                self.inner.set_error(Some("udp_unavailable"));
            }
        }
        let inner = self.inner.clone();
        let reaper_stop = stop.clone();
        tokio::spawn(async move {
            let mut t = tokio::time::interval(inner.cfg.tick);
            loop {
                tokio::select! {
                    _ = reaper_stop.cancelled() => break,
                    _ = t.tick() => inner.reap(),
                }
            }
        });
        *self.inner.port.lock().unwrap() = Some(port);
        Ok(Running { port, stop, server })
    }

    async fn stop(&self, r: Running) {
        self.inner.end_all_in(reason::DISABLED);
        *self.inner.port.lock().unwrap() = None;
        *self.inner.udp_port.lock().unwrap() = None;
        r.stop.cancel();
        let _ = tokio::time::timeout(Duration::from_secs(2), r.server).await;
        log::info!("LAN service on port {} stopped", r.port);
    }

    /// Starts or stops looking for other devices.
    pub fn discover(&self, on: bool) {
        let mut d = self.inner.discovery.lock().unwrap();
        if on {
            if d.is_none() {
                let stop = CancellationToken::new();
                tokio::spawn(discovery::query(self.inner.clone(), stop.clone()));
                *d = Some(stop);
            }
        } else if let Some(stop) = d.take() {
            stop.cancel();
            self.inner.devices.lock().unwrap().clear();
        }
    }

    /// Checks an address typed by the user and adds the device found there.
    pub async fn probe(&self, addr: &str) -> Result<Device, &'static str> {
        let a = parse_addr(addr).ok_or(reason::UNREACHABLE)?;
        let d = client::info(&self.inner, a, Duration::from_secs(2)).await?;
        if d.id == self.inner.id {
            return Err(reason::NOT_LIGHTPLAYER);
        }
        let d = Device { manual: true, ..d };
        self.inner.saw_device(d.clone());
        self.inner.emit_devices();
        Ok(d)
    }

    /// Asks every address of the local /24 networks; returns how many devices answered.
    pub async fn scan_subnet(&self) -> usize {
        use futures_util::stream::{self, StreamExt};
        let mut hosts: Vec<SocketAddr> = Vec::new();
        for (ip, _) in device::interfaces() {
            if !ip.is_private() {
                continue;
            }
            let o = ip.octets();
            for h in 1..=254u8 {
                if h != o[3] {
                    hosts.push(SocketAddr::new(IpAddr::V4(Ipv4Addr::new(o[0], o[1], o[2], h)), DEFAULT_PORT));
                }
            }
        }
        let inner = self.inner.clone();
        let found: Vec<Device> = stream::iter(hosts)
            .map(|a| {
                let inner = inner.clone();
                async move { client::info(&inner, a, Duration::from_millis(400)).await.ok() }
            })
            .buffer_unordered(64)
            .filter_map(|d| async move { d })
            .collect()
            .await;
        let mut n = 0;
        for d in found {
            if d.id != self.inner.id {
                n += 1;
                self.inner.saw_device(Device { manual: true, ..d });
            }
        }
        self.inner.emit_devices();
        n
    }

    /// Starts sending `path` to `target`; returns the session id. Progress
    /// and stages arrive as events.
    pub fn send(&self, target: Target, path: &Path) -> Result<String, &'static str> {
        let addr = parse_addr(&target.addr).ok_or(reason::UNREACHABLE)?;
        let meta = std::fs::metadata(path).map_err(|_| reason::NOT_FOUND)?;
        if !meta.is_file() {
            return Err(reason::NOT_FOUND);
        }
        if meta.len() > MAX_SIZE {
            return Err(reason::TOO_LARGE);
        }
        let kind = crate::media::kinds::kind_of(path).ok_or(reason::UNSUPPORTED)?;
        if meta.len() == 0 {
            return Err(reason::UNSUPPORTED);
        }
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let id = random_id();
        let s = Outgoing {
            id: id.clone(),
            addr,
            peer: Peer { id: target.id, name: clean_label(&target.name), platform: target.platform, version: String::new() },
            path: path.to_path_buf(),
            file: FileInfo { name, size: meta.len(), kind },
            stage: OutStage::Connecting,
            reason: None,
            token: None,
            following: false,
            expires_at: None,
            ended_at: None,
            cancel: CancellationToken::new(),
        };
        let ev = Inner::out_event(&s);
        {
            let mut map = self.inner.outgoing.lock().unwrap();
            map.retain(|_, o| o.ended_at.map_or(true, |t| t.elapsed() < Duration::from_secs(600)));
            map.insert(id.clone(), s);
        }
        self.inner.emit(events::SESSION, ev);
        tokio::spawn(client::run_send(self.inner.clone(), id.clone()));
        Ok(id)
    }

    /// Ends a session in either role at any stage.
    pub fn cancel(&self, id: &str) {
        let out = self.inner.outgoing.lock().unwrap().get(id).map(|s| s.cancel.clone());
        if let Some(c) = out {
            // The send task tells the other side and reports the end.
            c.cancel();
            return;
        }
        let stage = self.inner.incoming.lock().unwrap().get(id).map(|s| s.stage);
        match stage {
            Some(InStage::Offered) => self.answer(id, false, false),
            Some(InStage::Accepted) | Some(InStage::Receiving) => {
                self.inner.end_in(id, reason::CANCELED);
                true
            }
            Some(_) => {
                self.inner.end_in(id, reason::LEFT);
                true
            }
            None => false,
        };
    }

    /// The user's answer to an offer; false when it is no longer pending.
    pub fn answer(&self, id: &str, accept: bool, follow: bool) -> bool {
        let (ip, pending) = {
            let map = self.inner.incoming.lock().unwrap();
            match map.get(id) {
                Some(s) => (s.ip, s.stage == InStage::Offered),
                None => return false,
            }
        };
        if !pending {
            return false;
        }
        if !accept {
            self.inner.declines.lock().unwrap().entry(ip).or_default().push(Instant::now());
            self.inner.end_in(id, reason::DECLINED);
            return true;
        }
        // One file at a time: accepting replaces whatever was received or followed before.
        let others: Vec<String> = self
            .inner
            .incoming
            .lock()
            .unwrap()
            .values()
            .filter(|s| s.id != id && s.stage.active())
            .map(|s| s.id.clone())
            .collect();
        for o in others {
            self.inner.end_in(&o, reason::REPLACED);
        }
        self.inner.update_in(id, |s| {
            s.stage = InStage::Accepted;
            s.follow = follow;
            s.since = Instant::now();
        })
    }

    /// Following on or off for a received file (the sender sees it).
    pub fn follow(&self, id: &str, on: bool) {
        self.inner.update_in(id, |s| s.follow = on);
    }

    /// The sender's UI reports its playback state.
    pub fn publish(&self, path: String, pos: f64, playing: bool, rate: f64, at_ms: Option<f64>) {
        let age = at_ms.map(|a| ((now_ms() - a).clamp(0.0, 2000.0)) / 1000.0).unwrap_or(0.0);
        let at = Instant::now().checked_sub(Duration::from_secs_f64(age)).unwrap_or_else(Instant::now);
        let pos = if pos.is_finite() { pos.max(0.0) } else { 0.0 };
        let rate = if rate.is_finite() && rate > 0.0 { rate.min(16.0) } else { 1.0 };
        self.inner.anchor.send_replace(Some(Anchor { path, pos, playing, rate, at }));
    }

    /// Tells peers we are going and removes partial files (app exit).
    pub async fn shutdown(&self, timeout: Duration) {
        let inner = &self.inner;
        inner.exiting.store(true, Ordering::SeqCst);
        let ends: Vec<(SocketAddr, String, Option<String>)> = {
            let map = inner.outgoing.lock().unwrap();
            map.values()
                .filter(|s| s.stage != OutStage::Ended)
                .map(|s| (s.addr, s.id.clone(), s.token.clone()))
                .collect()
        };
        let tells = ends.iter().map(|(a, id, t)| client::delete(inner, *a, id, t.as_deref(), reason::EXIT));
        let _ = tokio::time::timeout(timeout, futures_util::future::join_all(tells)).await;
        for (_, id, _) in &ends {
            inner.end_out(id, reason::EXIT);
        }
        let partials: Vec<PathBuf> = inner.incoming.lock().unwrap().values().filter_map(|s| s.partial.clone()).collect();
        inner.end_all_in(reason::EXIT);
        for p in partials {
            let _ = std::fs::remove_file(p);
        }
        if let Some(r) = inner.running.lock().await.take() {
            r.stop.cancel();
        }
    }
}

/// Removes partial files left behind by a crash.
fn clean_partials(dir: Option<&Path>) {
    let Some(dir) = dir else { return };
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) == Some(PARTIAL_EXT) {
            let _ = std::fs::remove_file(p);
        }
    }
}

#[cfg(test)]
mod tests;
