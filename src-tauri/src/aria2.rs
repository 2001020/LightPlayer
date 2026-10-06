//! Downloads through the bundled aria2c: one file over several connections at
//! once, which is much faster than a single stream when each connection to
//! GitHub is slow. aria2 runs only for the download and is driven over its
//! JSON-RPC interface on localhost (random port and secret).

use crate::error::{AppError, AppResult};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// Connections per download.
pub const CONNECTIONS: u32 = 16;

/// Give up (and let the caller fall back) when nothing arrives for this long.
const STALL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Status {
    pub completed: u64,
    /// 0 until aria2 knows the size.
    pub total: u64,
    /// Bytes per second.
    pub speed: u64,
    pub connections: u32,
}

/// aria2's control file next to a download (`<out>.aria2`).
pub fn control_file(out: &Path) -> PathBuf {
    let mut name = out.as_os_str().to_owned();
    name.push(".aria2");
    PathBuf::from(name)
}

/// The command line: an RPC-only aria2 that quits with this process.
fn args(port: u16, secret: &str, user_agent: &str, proxy: Option<(String, Option<String>)>, ca: Option<&Path>) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--no-conf=true".into(),
        "--quiet=true".into(),
        "--enable-rpc=true".into(),
        "--rpc-listen-all=false".into(),
        format!("--rpc-listen-port={port}"),
        format!("--rpc-secret={secret}"),
        format!("--stop-with-process={}", std::process::id()),
        format!("--split={CONNECTIONS}"),
        format!("--max-connection-per-server={CONNECTIONS}"),
        "--min-split-size=1M".into(),
        "--continue=true".into(),
        "--allow-overwrite=true".into(),
        "--auto-file-renaming=false".into(),
        "--file-allocation=none".into(),
        "--max-tries=5".into(),
        "--retry-wait=2".into(),
        "--connect-timeout=15".into(),
        "--timeout=30".into(),
        // The system resolver follows the system's DNS settings.
        "--async-dns=false".into(),
        "--check-certificate=true".into(),
        format!("--user-agent={user_agent}"),
    ];
    if let Some((p, bypass)) = proxy {
        a.push(format!("--all-proxy={p}"));
        if let Some(b) = bypass.filter(|b| !b.trim().is_empty()) {
            a.push(format!("--no-proxy={b}"));
        }
    }
    if let Some(ca) = ca {
        a.push(format!("--ca-certificate={}", ca.display()));
    }
    a
}

/// `127.0.0.1:7890` / `http://host:port` as an aria2 proxy; aria2 speaks
/// only to HTTP proxies (not SOCKS).
fn http_proxy(v: &str) -> Option<String> {
    let v = v.trim().trim_end_matches('/');
    if v.is_empty() {
        return None;
    }
    match v.split_once("://") {
        None => Some(format!("http://{v}")),
        Some((scheme, _)) if scheme.eq_ignore_ascii_case("http") => Some(v.to_string()),
        _ => None,
    }
}

/// `scutil --proxy` (macOS): the HTTPS proxy, else the HTTP one, when enabled.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_scutil(out: &str) -> Option<String> {
    let get = |key: &str| {
        out.lines().find_map(|l| {
            let (k, v) = l.split_once(" : ")?;
            (k.trim() == key).then(|| v.trim().to_string())
        })
    };
    ["HTTPS", "HTTP"].iter().find_map(|p| {
        if get(&format!("{p}Enable")).as_deref() != Some("1") {
            return None;
        }
        let host = get(&format!("{p}Proxy")).filter(|h| !h.is_empty())?;
        let port = get(&format!("{p}Port")).unwrap_or_else(|| "80".into());
        http_proxy(&format!("{host}:{port}"))
    })
}

/// `reg query …\Internet Settings` (Windows): `ProxyServer` when `ProxyEnable` is set.
#[cfg_attr(not(windows), allow(dead_code))]
fn parse_reg(out: &str) -> Option<String> {
    let get = |key: &str| {
        out.lines().find_map(|l| {
            let mut it = l.split_whitespace();
            (it.next()? == key).then(|| it.skip(1).collect::<Vec<_>>().join(" "))
        })
    };
    if get("ProxyEnable").as_deref() != Some("0x1") {
        return None;
    }
    let server = get("ProxyServer")?;
    if !server.contains('=') {
        return http_proxy(&server);
    }
    // Per-protocol: "http=host:port;https=host:port;socks=…"
    ["https", "http"].iter().find_map(|p| {
        server.split(';').find_map(|e| {
            let (k, v) = e.split_once('=')?;
            (k.trim().eq_ignore_ascii_case(p)).then(|| http_proxy(v)).flatten()
        })
    })
}

/// The proxy to use and the hosts that bypass it: `HTTPS_PROXY` /
/// `ALL_PROXY` with `NO_PROXY`, else the system setting.
fn proxy() -> Option<(String, Option<String>)> {
    let env = |keys: &[&str]| keys.iter().find_map(|k| std::env::var(k).ok().filter(|v| !v.trim().is_empty()));
    if let Some(v) = env(&["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]) {
        return Some((http_proxy(&v)?, env(&["NO_PROXY", "no_proxy"])));
    }
    system_proxy().map(|p| (p, None))
}

fn system_proxy() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let out = crate::tools::std_command(Path::new("/usr/sbin/scutil")).arg("--proxy").output().ok()?;
        parse_scutil(&String::from_utf8_lossy(&out.stdout))
    }
    #[cfg(windows)]
    {
        let out = crate::tools::std_command(Path::new("reg"))
            .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings"])
            .output()
            .ok()?;
        parse_reg(&String::from_utf8_lossy(&out.stdout))
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    None
}

/// The CA bundle to trust: macOS and Windows builds use the system store;
/// elsewhere aria2 needs a file.
fn ca_bundle() -> Option<PathBuf> {
    if cfg!(any(target_os = "macos", windows)) {
        return None;
    }
    std::env::var_os("SSL_CERT_FILE").map(PathBuf::from).filter(|p| p.is_file())
}

fn free_port() -> AppResult<u16> {
    Ok(std::net::TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port())
}

fn num(v: &Value) -> u64 {
    v.as_str().and_then(|s| s.parse().ok()).unwrap_or(0)
}

fn status(v: &Value) -> Status {
    Status {
        completed: num(&v["completedLength"]),
        total: num(&v["totalLength"]),
        speed: num(&v["downloadSpeed"]),
        connections: num(&v["connections"]) as u32,
    }
}

struct Rpc {
    client: reqwest::Client,
    url: String,
    token: String,
}

impl Rpc {
    async fn call(&self, method: &str, params: Vec<Value>) -> AppResult<Value> {
        let mut all = vec![json!(self.token)];
        all.extend(params);
        let body = serde_json::to_vec(&json!({ "jsonrpc": "2.0", "id": "lp", "method": method, "params": all }))?;
        let resp = self.client.post(&self.url).header("Content-Type", "application/json").body(body).send().await?;
        let v: Value = serde_json::from_slice(&resp.bytes().await?)?;
        if let Some(e) = v.get("error") {
            return Err(AppError::msg(format!("aria2: {}", e["message"].as_str().unwrap_or("error"))));
        }
        Ok(v["result"].clone())
    }
}

/// Downloads `url` to `out` with `program` (aria2c), reporting progress.
/// On failure the partial file and aria2's control file (`control_file`)
/// stay for the caller to remove.
pub async fn download(program: &Path, url: &str, out: &Path, user_agent: &str, cancel: &AtomicBool, progress: impl FnMut(Status)) -> AppResult<()> {
    let dir = out.parent().ok_or_else(|| AppError::msg("文件名无效"))?;
    let name = out.file_name().ok_or_else(|| AppError::msg("文件名无效"))?.to_string_lossy().into_owned();
    let port = free_port()?;
    let secret = hex::encode(rand::random::<[u8; 16]>());
    let mut child = crate::tools::command(program)
        .args(args(port, &secret, user_agent, proxy(), ca_bundle().as_deref()))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| AppError::msg(format!("aria2 did not start: {e}")))?;
    let rpc = Rpc {
        client: reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(10)).build()?,
        url: format!("http://127.0.0.1:{port}/jsonrpc"),
        token: format!("token:{secret}"),
    };
    let result = run(&rpc, &mut child, url, dir, &name, cancel, progress).await;
    // Stop aria2 so nothing holds the file (Windows) before it is moved.
    let _ = child.kill().await;
    result
}

async fn run(rpc: &Rpc, child: &mut tokio::process::Child, url: &str, dir: &Path, name: &str, cancel: &AtomicBool, mut progress: impl FnMut(Status)) -> AppResult<()> {
    let tick = || tokio::time::sleep(Duration::from_millis(250));
    let started = Instant::now();
    while rpc.call("aria2.getVersion", vec![]).await.is_err() {
        if let Some(code) = child.try_wait()? {
            return Err(AppError::msg(format!("aria2 exited ({code})")));
        }
        if started.elapsed() > Duration::from_secs(10) {
            return Err(AppError::msg("aria2 is not responding"));
        }
        if cancel.load(Ordering::SeqCst) {
            return Err(AppError::Cancelled);
        }
        tick().await;
    }
    let gid = rpc.call("aria2.addUri", vec![json!([url]), json!({ "dir": dir.to_string_lossy(), "out": name })]).await?;
    let keys = json!(["status", "totalLength", "completedLength", "downloadSpeed", "connections", "errorCode", "errorMessage"]);
    let mut last = (0u64, Instant::now());
    loop {
        if cancel.load(Ordering::SeqCst) {
            let _ = rpc.call("aria2.forceRemove", vec![gid.clone()]).await;
            return Err(AppError::Cancelled);
        }
        let v = rpc.call("aria2.tellStatus", vec![gid.clone(), keys.clone()]).await?;
        let s = status(&v);
        progress(s);
        match v["status"].as_str().unwrap_or_default() {
            "complete" => return Ok(()),
            "error" | "removed" => {
                let msg = v["errorMessage"].as_str().filter(|m| !m.is_empty()).unwrap_or("download failed");
                return Err(AppError::msg(format!("aria2: {msg} (code {})", v["errorCode"].as_str().unwrap_or("?"))));
            }
            _ => {}
        }
        if s.completed != last.0 {
            last = (s.completed, Instant::now());
        } else if last.1.elapsed() > STALL {
            return Err(AppError::msg("aria2: no data received"));
        }
        tick().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_proxy_settings() {
        assert_eq!(http_proxy("127.0.0.1:7890").as_deref(), Some("http://127.0.0.1:7890"));
        assert_eq!(http_proxy("http://user:pw@proxy:8080/").as_deref(), Some("http://user:pw@proxy:8080"));
        assert_eq!(http_proxy("socks5://127.0.0.1:7891"), None);
        assert_eq!(http_proxy(" "), None);

        let scutil = "<dictionary> {\n  ExceptionsList : <array> {\n    0 : *.local\n  }\n  HTTPEnable : 1\n  HTTPPort : 7890\n  HTTPProxy : 127.0.0.1\n  HTTPSEnable : 1\n  HTTPSPort : 7891\n  HTTPSProxy : 127.0.0.1\n  SOCKSEnable : 0\n}\n";
        assert_eq!(parse_scutil(scutil).as_deref(), Some("http://127.0.0.1:7891"));
        assert_eq!(parse_scutil(&scutil.replace("HTTPSEnable : 1", "HTTPSEnable : 0")).as_deref(), Some("http://127.0.0.1:7890"));
        assert_eq!(parse_scutil("<dictionary> {\n  HTTPEnable : 0\n}\n"), None);

        let reg = |enable: &str, server: &str| {
            format!("\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    ProxyEnable    REG_DWORD    {enable}\r\n    ProxyServer    REG_SZ    {server}\r\n    ProxyOverride    REG_SZ    <local>\r\n")
        };
        assert_eq!(parse_reg(&reg("0x1", "127.0.0.1:7890")).as_deref(), Some("http://127.0.0.1:7890"));
        assert_eq!(parse_reg(&reg("0x0", "127.0.0.1:7890")), None);
        assert_eq!(parse_reg(&reg("0x1", "http=a:1;https=b:2;socks=c:3")).as_deref(), Some("http://b:2"));
        assert_eq!(parse_reg(&reg("0x1", "socks=c:3")), None);
    }

    #[test]
    fn builds_the_command_line() {
        let a = args(6800, "s3cret", "LightPlayer/1.6.2", Some(("http://127.0.0.1:7890".into(), Some("localhost,127.0.0.1".into()))), None);
        for want in ["--enable-rpc=true", "--rpc-listen-all=false", "--rpc-listen-port=6800", "--rpc-secret=s3cret", "--split=16", "--all-proxy=http://127.0.0.1:7890", "--no-proxy=localhost,127.0.0.1", "--user-agent=LightPlayer/1.6.2"] {
            assert!(a.iter().any(|x| x == want), "{want} in {a:?}");
        }
        assert!(a.iter().any(|x| x.starts_with("--stop-with-process=")));
        assert!(!args(1, "s", "ua", None, None).iter().any(|x| x.starts_with("--all-proxy")));
        assert_eq!(control_file(Path::new("/tmp/a.zip.part")), Path::new("/tmp/a.zip.part.aria2"));
        let s = status(&json!({ "completedLength": "100", "totalLength": "400", "downloadSpeed": "50", "connections": "16" }));
        assert_eq!(s, Status { completed: 100, total: 400, speed: 50, connections: 16 });
    }
}
