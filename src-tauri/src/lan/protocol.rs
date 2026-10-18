//! Messages and rules shared by both ends of a LAN share.
//!
//! Everything a peer sends is checked here: names are cleaned before they
//! touch the file system, sizes and kinds are limited before anything is
//! accepted. Errors travel as short ASCII reason codes; the UI words them.

use crate::media::kinds::{kind_of, MediaKind};
use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Protocol version; peers with another one are turned away with `version`.
pub const PROTO: u32 = 1;
/// Preferred TCP port, and the UDP port discovery queries go to.
pub const DEFAULT_PORT: u16 = 47390;
/// Largest file that can be shared (1 GiB).
pub const MAX_SIZE: u64 = 1 << 30;
/// Every request carries this header (browsers cannot add it to a simple
/// cross-site request, so web pages cannot pose as a LightPlayer).
pub const HEADER: &str = "x-lightplayer";
/// The session token, handed out once an offer is accepted.
pub const TOKEN_HEADER: &str = "x-lp-token";
/// Extension of files still being received.
pub const PARTIAL_EXT: &str = "lpdownload";
/// Discovery datagrams larger than this are ignored.
pub const MAX_DATAGRAM: usize = 512;

/// Reason codes (ASCII, translated by the UI).
pub mod reason {
    pub const DECLINED: &str = "declined";
    pub const TIMEOUT: &str = "timeout";
    pub const TOO_LARGE: &str = "too_large";
    pub const UNSUPPORTED: &str = "unsupported";
    pub const BUSY: &str = "busy";
    pub const DISABLED: &str = "disabled";
    pub const VERSION: &str = "version";
    pub const CANCELED: &str = "canceled";
    pub const DISK_FULL: &str = "disk_full";
    pub const WRITE_FAILED: &str = "write_failed";
    pub const INCOMPLETE: &str = "incomplete";
    pub const STALLED: &str = "stalled";
    pub const FAILED: &str = "failed";
    pub const SWITCHED: &str = "switched";
    pub const STOPPED: &str = "stopped";
    pub const LEFT: &str = "left";
    pub const EXIT: &str = "exit";
    pub const LOST: &str = "lost";
    pub const REPLACED: &str = "replaced";
    pub const DONE: &str = "done";
    pub const FORBIDDEN: &str = "forbidden";
    pub const NOT_FOUND: &str = "not_found";
    pub const UNREACHABLE: &str = "unreachable";
    pub const NOT_LIGHTPLAYER: &str = "not_lightplayer";
    pub const LOCAL_NETWORK_DENIED: &str = "local_network_denied";
    pub const NO_FOLDER: &str = "no_folder";
}

/// Who is on the other end.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub platform: String,
    #[serde(default)]
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
    pub kind: MediaKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    pub session: String,
    pub proto: u32,
    pub from: Peer,
    pub file: FileInfo,
}

/// `GET /lan/v1/info`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub app: String,
    pub proto: u32,
    #[serde(flatten)]
    pub peer: Peer,
    pub port: u16,
}

/// Where an offer stands (`GET /lan/v1/offer/{id}`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferState {
    /// "pending", "accepted" or "ended".
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// One playback state from the sender (`POST /lan/v1/sync/{id}`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMsg {
    pub seq: u64,
    pub playing: bool,
    /// Position (seconds) when the request was sent.
    pub pos: f64,
    pub rate: f64,
    /// Estimated one-way delay (milliseconds).
    #[serde(default)]
    pub lat: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReply {
    pub following: bool,
}

/// An error answer: `{"reason": "..."}`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Refusal {
    pub reason: String,
}

/// Checks an offer before the user is asked; returns a reason code.
pub fn validate_offer(o: &Offer) -> Result<(), &'static str> {
    if o.proto != PROTO {
        return Err(reason::VERSION);
    }
    if o.file.size > MAX_SIZE {
        return Err(reason::TOO_LARGE);
    }
    let name = sanitize_file_name(&o.file.name);
    if o.file.size == 0 || kind_of(Path::new(&name)).is_none() {
        return Err(reason::UNSUPPORTED);
    }
    if o.session.is_empty() || o.session.len() > 64 || !o.session.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        return Err(reason::FORBIDDEN);
    }
    if o.from.id.len() > 64 || o.from.name.chars().count() > 255 || o.file.name.chars().count() > 1024 {
        return Err(reason::FORBIDDEN);
    }
    Ok(())
}

/// A display name from a peer: no control characters, at most 64 characters.
pub fn clean_label(s: &str) -> String {
    let t: String = s.chars().filter(|c| !c.is_control()).take(64).collect();
    let t = t.trim().to_string();
    if t.is_empty() {
        "LightPlayer".into()
    } else {
        t
    }
}

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];
const MAX_NAME_CHARS: usize = 150;

/// A safe file name for a received file: only the last path component, no
/// characters Windows or macOS reject, no hidden or reserved names, and short
/// enough for Windows paths. The extension is kept.
pub fn sanitize_file_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if "<>:\"|?*".contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace());
    let (stem, ext) = match trimmed.rfind('.') {
        Some(i) if i > 0 && trimmed.len() - i <= 17 => (&trimmed[..i], &trimmed[i + 1..]),
        _ => (trimmed, ""),
    };
    let stem = stem.trim_matches(|c: char| c == '.' || c.is_whitespace());
    let ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase();
    let room = MAX_NAME_CHARS.saturating_sub(ext.len() + 1);
    let mut stem: String = stem.chars().take(room).collect();
    stem = stem.trim_end_matches(|c: char| c == '.' || c.is_whitespace()).to_string();
    if stem.is_empty() {
        stem = "LightPlayer".into();
    }
    let upper = stem.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED.contains(&upper.as_str()) {
        stem = format!("_{stem}");
    }
    if ext.is_empty() {
        stem
    } else {
        format!("{stem}.{ext}")
    }
}

/// `dir/name`, or `dir/stem (n).ext` if that is taken.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    for n in 1..10_000 {
        let p = dir.join(format!("{stem} ({n}){ext}"));
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{stem} ({}){ext}", rand::random::<u32>()))
}

/// Maps a write error to a reason code.
pub fn write_reason(e: &std::io::Error) -> &'static str {
    // ENOSPC on Unix; ERROR_HANDLE_DISK_FULL / ERROR_DISK_FULL on Windows.
    let full = if cfg!(windows) { matches!(e.raw_os_error(), Some(39) | Some(112)) } else { e.raw_os_error() == Some(28) };
    if full {
        reason::DISK_FULL
    } else {
        reason::WRITE_FAILED
    }
}

/// macOS refuses local network traffic with EHOSTUNREACH until the user
/// allows it (System Settings > Privacy & Security > Local Network).
pub fn is_local_network_denied(e: &std::io::Error) -> bool {
    cfg!(target_os = "macos") && e.raw_os_error() == Some(65)
}

// ------------------------------------------------------------------ discovery

/// A discovery datagram: a query (`q`) broadcast by a sender, or the answer
/// (`a`) a receiver sends straight back.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Beacon {
    pub lp: String,
    pub v: u32,
    /// Nonce of the query (copied into the answer).
    pub n: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ver: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
}

impl Beacon {
    pub fn query(nonce: &str) -> Self {
        Beacon { lp: "q".into(), v: PROTO, n: nonce.into(), id: None, name: None, platform: None, ver: None, port: None }
    }

    pub fn answer(nonce: &str, me: &Peer, port: u16) -> Self {
        Beacon {
            lp: "a".into(),
            v: PROTO,
            n: nonce.into(),
            id: Some(me.id.clone()),
            name: Some(me.name.clone()),
            platform: Some(me.platform.clone()),
            ver: Some(me.version.clone()),
            port: Some(port),
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        serde_json::to_vec(self).unwrap_or_default()
    }

    /// Parses a datagram; anything malformed, oversized or foreign is `None`.
    pub fn decode(buf: &[u8]) -> Option<Beacon> {
        if buf.len() > MAX_DATAGRAM {
            return None;
        }
        let b: Beacon = serde_json::from_slice(buf).ok()?;
        if b.n.is_empty() || b.n.len() > 64 {
            return None;
        }
        match b.lp.as_str() {
            "q" => Some(b),
            "a" if b.id.is_some() && b.port.unwrap_or(0) > 0 => Some(b),
            _ => None,
        }
    }
}

/// Where discovery queries go: each interface's broadcast address plus the
/// limited broadcast address (loopback interfaces are skipped).
pub fn broadcast_targets(ifaces: &[(Ipv4Addr, Option<Ipv4Addr>)], port: u16) -> Vec<SocketAddr> {
    let mut out: Vec<SocketAddr> = Vec::new();
    for (ip, bcast) in ifaces {
        if ip.is_loopback() || ip.is_unspecified() {
            continue;
        }
        if let Some(b) = bcast {
            let a = SocketAddr::V4(SocketAddrV4::new(*b, port));
            if !out.contains(&a) {
                out.push(a);
            }
        }
    }
    out.push(SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::BROADCAST, port)));
    out
}

/// Parses "ip" or "ip:port" typed by the user.
pub fn parse_addr(s: &str) -> Option<SocketAddr> {
    let s = s.trim();
    if let Ok(a) = s.parse::<SocketAddr>() {
        return Some(a);
    }
    s.parse::<Ipv4Addr>().ok().map(|ip| SocketAddr::V4(SocketAddrV4::new(ip, DEFAULT_PORT)))
}

/// A random id for sessions, tokens and nonces.
pub fn random_id() -> String {
    format!("{:032x}", rand::random::<u128>())
}

// ------------------------------------------------------------------ progress

/// Transfer speed over a sliding window of about a second.
pub struct Meter {
    mark: (Instant, u64),
    speed: f64,
    last_emit: Option<Instant>,
}

impl Default for Meter {
    fn default() -> Self {
        Meter { mark: (Instant::now(), 0), speed: 0.0, last_emit: None }
    }
}

impl Meter {
    /// Updates the speed; true when a progress event is due (at most 8 per second).
    pub fn tick(&mut self, bytes: u64) -> bool {
        let now = Instant::now();
        let dt = now.duration_since(self.mark.0).as_secs_f64();
        if dt >= 1.0 {
            self.speed = bytes.saturating_sub(self.mark.1) as f64 / dt;
            self.mark = (now, bytes);
        } else if self.speed == 0.0 && dt >= 0.3 {
            self.speed = bytes.saturating_sub(self.mark.1) as f64 / dt;
        }
        let due = self.last_emit.map_or(true, |t| now.duration_since(t) >= Duration::from_millis(125));
        if due {
            self.last_emit = Some(now);
        }
        due
    }

    pub fn speed(&self) -> f64 {
        self.speed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offer(name: &str, size: u64) -> Offer {
        Offer {
            session: "abc123".into(),
            proto: PROTO,
            from: Peer { id: "x".into(), name: "Mac".into(), platform: "macos".into(), version: "1.6.7".into() },
            file: FileInfo { name: name.into(), size, kind: MediaKind::Video },
        }
    }

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize_file_name("../../etc/passwd.mp4"), "passwd.mp4");
        assert_eq!(sanitize_file_name("C:\\Users\\a\\movie.MKV"), "movie.mkv");
        assert_eq!(sanitize_file_name("a\0b\nc.mp3"), "abc.mp3");
        assert_eq!(sanitize_file_name("what?<now>:*.mp4"), "what__now___.mp4");
        assert_eq!(sanitize_file_name("CON.mp4"), "_CON.mp4");
        assert_eq!(sanitize_file_name("aux.mp4"), "_aux.mp4");
        assert_eq!(sanitize_file_name("song.mp3. . "), "song.mp3");
        assert_eq!(sanitize_file_name("...hidden.mp4"), "hidden.mp4");
        assert_eq!(sanitize_file_name(".mp4"), "mp4");
        assert_eq!(sanitize_file_name(""), "LightPlayer");
        assert_eq!(sanitize_file_name("   .flac"), "flac");
        assert_eq!(sanitize_file_name("我的 电影 (2024).mp4"), "我的 电影 (2024).mp4");
        let long = format!("{}.mp4", "长".repeat(300));
        let s = sanitize_file_name(&long);
        assert!(s.ends_with(".mp4"));
        assert_eq!(s.chars().count(), MAX_NAME_CHARS);
    }

    #[test]
    fn unique_paths() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(unique_path(dir.path(), "a.mp4"), dir.path().join("a.mp4"));
        std::fs::write(dir.path().join("a.mp4"), b"x").unwrap();
        assert_eq!(unique_path(dir.path(), "a.mp4"), dir.path().join("a (1).mp4"));
        std::fs::write(dir.path().join("a (1).mp4"), b"x").unwrap();
        assert_eq!(unique_path(dir.path(), "a.mp4"), dir.path().join("a (2).mp4"));
        std::fs::write(dir.path().join("noext"), b"x").unwrap();
        assert_eq!(unique_path(dir.path(), "noext"), dir.path().join("noext (1)"));
    }

    #[test]
    fn validates_offers() {
        assert!(validate_offer(&offer("a.mp4", MAX_SIZE)).is_ok());
        assert_eq!(validate_offer(&offer("a.mp4", MAX_SIZE + 1)), Err(reason::TOO_LARGE));
        assert_eq!(validate_offer(&offer("a.exe", 10)), Err(reason::UNSUPPORTED));
        assert_eq!(validate_offer(&offer("a.mp4", 0)), Err(reason::UNSUPPORTED));
        let mut o = offer("a.flac", 10);
        o.proto = 2;
        assert_eq!(validate_offer(&o), Err(reason::VERSION));
        let mut o = offer("a.flac", 10);
        o.session = "../x".into();
        assert_eq!(validate_offer(&o), Err(reason::FORBIDDEN));
    }

    #[test]
    fn beacons_round_trip_and_reject_junk() {
        let me = Peer { id: "id1".into(), name: "PC".into(), platform: "windows".into(), version: "1.6.7".into() };
        let q = Beacon::query("n1");
        assert_eq!(Beacon::decode(&q.encode()), Some(q));
        let a = Beacon::answer("n1", &me, 47390);
        assert_eq!(Beacon::decode(&a.encode()).unwrap().port, Some(47390));
        assert!(Beacon::decode(b"hello").is_none());
        assert!(Beacon::decode(br#"{"lp":"x","v":1,"n":"a"}"#).is_none());
        assert!(Beacon::decode(br#"{"lp":"a","v":1,"n":"a"}"#).is_none());
        assert!(Beacon::decode(br#"{"lp":"q","v":1,"n":""}"#).is_none());
        let big = format!(r#"{{"lp":"q","v":1,"n":"{}"}}"#, "a".repeat(600));
        assert!(Beacon::decode(big.as_bytes()).is_none());
    }

    #[test]
    fn broadcast_targets_skip_loopback() {
        let t = broadcast_targets(
            &[
                (Ipv4Addr::LOCALHOST, Some(Ipv4Addr::new(127, 255, 255, 255))),
                (Ipv4Addr::new(192, 168, 1, 23), Some(Ipv4Addr::new(192, 168, 1, 255))),
                (Ipv4Addr::new(192, 168, 1, 24), Some(Ipv4Addr::new(192, 168, 1, 255))),
                (Ipv4Addr::new(10, 0, 0, 2), None),
            ],
            47390,
        );
        assert_eq!(t, vec!["192.168.1.255:47390".parse().unwrap(), "255.255.255.255:47390".parse().unwrap()]);
    }

    #[test]
    fn parses_typed_addresses() {
        assert_eq!(parse_addr("192.168.1.5"), Some("192.168.1.5:47390".parse().unwrap()));
        assert_eq!(parse_addr(" 10.0.0.2:5000 "), Some("10.0.0.2:5000".parse().unwrap()));
        assert_eq!(parse_addr("example.com"), None);
    }
}
