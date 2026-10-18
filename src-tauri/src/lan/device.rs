//! What this computer is called and where it can be reached.

use std::net::Ipv4Addr;

pub fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

/// The name people know the computer by ("Zhou's MacBook Pro", "DESKTOP-1A2B").
pub fn default_name() -> String {
    #[cfg(target_os = "macos")]
    if let Some(n) = std::process::Command::new("/usr/sbin/scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|n| !n.is_empty())
    {
        return n;
    }
    for var in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(n) = std::env::var(var) {
            if !n.trim().is_empty() {
                return n.trim().to_string();
            }
        }
    }
    #[cfg(unix)]
    if let Ok(n) = std::fs::read_to_string("/etc/hostname") {
        if !n.trim().is_empty() {
            return n.trim().to_string();
        }
    }
    "LightPlayer".into()
}

/// IPv4 addresses of the network interfaces, with their broadcast addresses
/// (loopback excluded).
pub fn interfaces() -> Vec<(Ipv4Addr, Option<Ipv4Addr>)> {
    let mut out = Vec::new();
    for i in if_addrs::get_if_addrs().unwrap_or_default() {
        if i.is_loopback() {
            continue;
        }
        if let if_addrs::IfAddr::V4(v4) = i.addr {
            if v4.ip.is_link_local() {
                continue;
            }
            if !out.iter().any(|(ip, _)| *ip == v4.ip) {
                out.push((v4.ip, v4.broadcast));
            }
        }
    }
    out
}

/// Addresses shown in Settings for connecting by hand.
pub fn addresses() -> Vec<String> {
    interfaces().into_iter().map(|(ip, _)| ip.to_string()).collect()
}
