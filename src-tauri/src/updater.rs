//! Updates from GitHub Releases: finds a newer release with a file for this
//! kind of install, downloads it with the bundled aria2 (checking its size and
//! SHA-256), and swaps it in once the app has quit, then starts the new version.
//!
//! - macOS: replaces the running LightPlayer.app with the one in `*_aarch64.app.zip`.
//! - Windows installer: runs `*_x64-setup.exe /S` into the same folder.
//! - Windows portable: copies `*_x64_portable.zip` over the app folder.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub const REPO: &str = "2001020/LightPlayer";

/// This build's version: the release tag it was built for (`v1.6.0b1`), or
/// the package version for local builds.
pub fn current_version() -> &'static str {
    match option_env!("LP_RELEASE_TAG") {
        Some(tag) if !tag.trim().is_empty() => tag.trim().trim_start_matches('v'),
        _ => env!("CARGO_PKG_VERSION"),
    }
}

/// `1.6.0b1` → (1, 6, 0, pre-release 1); a final release sorts after its pre-releases.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    /// false for a pre-release (b1, -beta.2, rc1).
    pub release: bool,
    pub pre: u64,
}

impl Version {
    pub fn parse(s: &str) -> Option<Version> {
        let s = s.trim().trim_start_matches(['v', 'V']);
        let end = s.find(|c: char| !(c.is_ascii_digit() || c == '.')).unwrap_or(s.len());
        let (core, rest) = s.split_at(end);
        let mut nums = core.trim_end_matches('.').split('.').map(|n| n.parse::<u64>().ok());
        let major = nums.next()??;
        let minor = nums.next().unwrap_or(Some(0))?;
        let patch = nums.next().unwrap_or(Some(0))?;
        let rest = rest.trim_start_matches(['-', '.', '+']);
        let digits: String = rest.chars().skip_while(|c| !c.is_ascii_digit()).take_while(|c| c.is_ascii_digit()).collect();
        Some(Version {
            major,
            minor,
            patch,
            release: rest.is_empty(),
            pre: digits.parse().unwrap_or(0),
        })
    }

    pub fn is_prerelease(&self) -> bool {
        !self.release
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
// Each system only ever detects its own kinds.
#[allow(dead_code)]
pub enum InstallKind {
    MacApp,
    WindowsSetup,
    WindowsPortable,
    /// A development build or a system without published builds: link to the page.
    Manual,
}

impl InstallKind {
    /// The release file for this kind of install.
    pub fn asset_suffix(self) -> Option<&'static str> {
        match self {
            InstallKind::MacApp => Some("_aarch64.app.zip"),
            InstallKind::WindowsSetup => Some("_x64-setup.exe"),
            InstallKind::WindowsPortable => Some("_x64_portable.zip"),
            InstallKind::Manual => None,
        }
    }
}

/// The running .app bundle (macOS).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn app_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.parent()?.parent()?.parent()?.to_path_buf();
    (bundle.extension().is_some_and(|e| e == "app") && bundle.join("Contents/Info.plist").is_file()).then_some(bundle)
}

pub fn install_kind() -> InstallKind {
    if cfg!(debug_assertions) {
        return InstallKind::Manual;
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    if app_bundle().is_some() {
        return InstallKind::MacApp;
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    if let Some(dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf)) {
        // The NSIS installer leaves its uninstaller next to the app.
        return if dir.join("uninstall.exe").is_file() { InstallKind::WindowsSetup } else { InstallKind::WindowsPortable };
    }
    InstallKind::Manual
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
    /// Hex SHA-256 when GitHub lists one.
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    pub tag: String,
    pub name: String,
    pub notes: String,
    pub page: String,
    pub published: Option<String>,
    pub prerelease: bool,
    pub kind: InstallKind,
    /// None: nothing to install automatically; open `page` instead.
    pub asset: Option<UpdateAsset>,
}

/// The newest release above `current` in a GitHub `releases` listing.
pub fn pick_update(releases: &Value, current: &str, include_prerelease: bool, kind: InstallKind) -> Option<UpdateInfo> {
    let cur = Version::parse(current)?;
    let s = |v: &Value| v.as_str().unwrap_or_default().to_string();
    let best = releases
        .as_array()?
        .iter()
        .filter(|r| !r["draft"].as_bool().unwrap_or(false))
        .filter(|r| include_prerelease || !r["prerelease"].as_bool().unwrap_or(false))
        .filter_map(|r| Some((Version::parse(r["tag_name"].as_str()?)?, r)))
        .filter(|(v, _)| *v > cur)
        .max_by_key(|(v, _)| *v)?
        .1;
    let asset = kind.asset_suffix().and_then(|suffix| {
        best["assets"].as_array()?.iter().find(|a| a["name"].as_str().is_some_and(|n| n.ends_with(suffix))).map(|a| UpdateAsset {
            name: s(&a["name"]),
            url: s(&a["browser_download_url"]),
            size: a["size"].as_u64().unwrap_or(0),
            sha256: a["digest"].as_str().and_then(|d| d.strip_prefix("sha256:")).map(str::to_ascii_lowercase),
        })
    });
    let tag = s(&best["tag_name"]);
    Some(UpdateInfo {
        version: tag.trim_start_matches(['v', 'V']).to_string(),
        current: current.to_string(),
        name: best["name"].as_str().filter(|n| !n.is_empty()).map(str::to_string).unwrap_or_else(|| tag.clone()),
        tag,
        notes: s(&best["body"]),
        page: s(&best["html_url"]),
        published: best["published_at"].as_str().map(str::to_string),
        prerelease: best["prerelease"].as_bool().unwrap_or(false),
        kind,
        asset,
    })
}

fn client() -> AppResult<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(format!("LightPlayer/{}", current_version()))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()?)
}

pub async fn check(include_prerelease: bool) -> AppResult<Option<UpdateInfo>> {
    let resp = client()?
        .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=30"))
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?;
    match resp.status().as_u16() {
        200 => {}
        403 | 429 => return Err(AppError::msg("GitHub 暂时限制了请求次数，请过一会儿再试")),
        code => return Err(AppError::msg(format!("GitHub 返回错误 {code}"))),
    }
    let releases: Value = serde_json::from_slice(&resp.bytes().await?)?;
    Ok(pick_update(&releases, current_version(), include_prerelease, install_kind()))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub received: u64,
    pub total: u64,
    /// Bytes per second.
    pub speed: u64,
    /// Connections in use: several with aria2, 1 otherwise.
    pub connections: u32,
}

/// Downloads `asset` into `dir`, reporting progress; checks size and SHA-256.
/// Uses the bundled aria2 (several connections) and falls back to a single
/// connection when aria2 is missing or fails.
pub async fn download(asset: &UpdateAsset, dir: &Path, cancel: &AtomicBool, progress: impl FnMut(Progress)) -> AppResult<PathBuf> {
    download_with(crate::tools::aria2(), asset, dir, cancel, progress).await
}

async fn download_with(aria2: Option<&Path>, asset: &UpdateAsset, dir: &Path, cancel: &AtomicBool, mut progress: impl FnMut(Progress)) -> AppResult<PathBuf> {
    let name = Path::new(&asset.name).file_name().ok_or_else(|| AppError::msg("文件名无效"))?;
    tokio::fs::create_dir_all(dir).await?;
    let dest = dir.join(name);
    let part = dir.join(format!("{}.part", name.to_string_lossy()));
    let control = crate::aria2::control_file(&part);
    let remove = |files: Vec<PathBuf>| async move {
        for f in files {
            let _ = tokio::fs::remove_file(f).await;
        }
    };
    let mut done = false;
    if let Some(aria2) = aria2 {
        let ua = format!("LightPlayer/{}", current_version());
        let report = |s: crate::aria2::Status| {
            progress(Progress {
                received: s.completed,
                total: if s.total > 0 { s.total } else { asset.size },
                speed: s.speed,
                connections: s.connections,
            })
        };
        match crate::aria2::download(aria2, &asset.url, &part, &ua, cancel, report).await {
            Ok(()) => done = true,
            Err(AppError::Cancelled) => {
                remove(vec![part, control]).await;
                return Err(AppError::Cancelled);
            }
            Err(e) => log::warn!("aria2 download failed, using a single connection: {e}"),
        }
    }
    if !done {
        remove(vec![control]).await;
        if let Err(e) = single(asset, &part, cancel, &mut progress).await {
            remove(vec![part]).await;
            return Err(e);
        }
    }
    if let Err(e) = verify(&part, asset).await {
        remove(vec![part]).await;
        return Err(e);
    }
    tokio::fs::rename(&part, &dest).await?;
    Ok(dest)
}

/// One connection, straight to `part`.
async fn single(asset: &UpdateAsset, part: &Path, cancel: &AtomicBool, progress: &mut impl FnMut(Progress)) -> AppResult<()> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;
    let resp = client()?.get(&asset.url).send().await?.error_for_status()?;
    let total = resp.content_length().unwrap_or(asset.size);
    let mut file = tokio::fs::File::create(part).await?;
    let mut received = 0u64;
    let mut last = 0u64;
    // Speed over the last half second or more.
    let mut window = (std::time::Instant::now(), 0u64, 0u64);
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Err(AppError::Cancelled);
        }
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        received += chunk.len() as u64;
        let elapsed = window.0.elapsed().as_secs_f64();
        if elapsed >= 0.5 {
            window = (std::time::Instant::now(), received, ((received - window.1) as f64 / elapsed) as u64);
        }
        if received - last >= 256 * 1024 || received == total {
            last = received;
            progress(Progress { received, total, speed: window.2, connections: 1 });
        }
    }
    file.flush().await?;
    Ok(())
}

/// Size and SHA-256 (when GitHub lists one) of a finished download.
async fn verify(file: &Path, asset: &UpdateAsset) -> AppResult<()> {
    let received = tokio::fs::metadata(file).await?.len();
    if asset.size > 0 && received != asset.size {
        return Err(AppError::msg(format!("下载不完整（{received} / {} 字节），请重试", asset.size)));
    }
    let Some(want) = asset.sha256.clone() else { return Ok(()) };
    let file = file.to_path_buf();
    let got = tokio::task::spawn_blocking(move || -> std::io::Result<String> {
        let mut hash = Sha256::new();
        std::io::copy(&mut std::fs::File::open(file)?, &mut hash)?;
        Ok(hex::encode(hash.finalize()))
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;
    if got != want {
        return Err(AppError::msg("下载的文件校验失败，请重试"));
    }
    Ok(())
}

/// Can files be replaced in `dir`?
fn writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".lightplayer-update-{}", std::process::id()));
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

/// The folder in `dir` (or `dir` itself) that holds `file`.
fn find_with(dir: &Path, file: &str) -> Option<PathBuf> {
    if dir.join(file).exists() {
        return Some(dir.to_path_buf());
    }
    std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| p.is_dir() && p.join(file).exists())
}

#[cfg(windows)]
fn extract_zip(file: &Path, to: &Path) -> AppResult<()> {
    let f = std::fs::File::open(file)?;
    let mut zip = zip::ZipArchive::new(f).map_err(|e| AppError::msg(e.to_string()))?;
    zip.extract(to).map_err(|e| AppError::msg(e.to_string()))
}

/// Written by the install helper when it could not put the new version in place.
pub const FAILED_MARKER: &str = "update-failed";

/// At launch: whether the last install failed; clears old downloads.
pub fn startup(work: &Path) -> bool {
    let failed = work.join(FAILED_MARKER).is_file();
    let _ = std::fs::remove_dir_all(work);
    failed
}

#[cfg(target_os = "macos")]
const MAC_SCRIPT: &str = r#"
pid="$1"; old="$2"; new="$3"; marker="$4"; launch="${5:-open}"
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
backup="$old.lp-old-$$"
ok=0
if mv "$old" "$backup"; then
  if mv "$new" "$old"; then rm -rf "$backup"; ok=1; else mv "$backup" "$old"; fi
fi
[ $ok = 1 ] || echo failed > "$marker"
xattr -dr com.apple.quarantine "$old" 2>/dev/null
"$launch" "$old"
"#;

/// Waits for `pid` to exit, swaps `new` in for the bundle `old` (restoring it
/// and writing `marker` on failure), then starts it with `launch` (`open`).
#[cfg(target_os = "macos")]
fn mac_helper(pid: &str, old: &Path, new: &Path, marker: &Path, launch: &str) -> std::io::Result<std::process::Child> {
    use std::os::unix::process::CommandExt;
    std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg(MAC_SCRIPT)
        .arg("lightplayer-update")
        .arg(pid)
        .arg(old)
        .arg(new)
        .arg(marker)
        .arg(launch)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        // Its own process group: it outlives the app.
        .process_group(0)
        .spawn()
}

#[cfg(windows)]
const WIN_SCRIPT: &str = r#"
param([int]$ProcId, [string]$Mode, [string]$Source, [string]$Dir, [string]$Exe, [string]$Marker, [string]$Launch = 'yes')
$ErrorActionPreference = 'Stop'
$Log = Join-Path (Split-Path -Parent $Marker) 'install-update.log'
function Note($text) { Add-Content -LiteralPath $Log -Value "$(Get-Date -Format o) $text" -ErrorAction SilentlyContinue }
Note "mode=$Mode source=$Source dir=$Dir"
Wait-Process -Id $ProcId -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
try {
  if ($Mode -eq 'setup') {
    $p = Start-Process -FilePath $Source -ArgumentList @('/S', "/D=$Dir") -Wait -PassThru
    if ($p.ExitCode -ne 0) { Set-Content -LiteralPath $Marker -Value "setup exit $($p.ExitCode)" }
  } else {
    Get-ChildItem -LiteralPath $Source | Where-Object { $_.Name -ne 'LightPlayer.exe' } |
      Copy-Item -Destination $Dir -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $Source 'LightPlayer.exe') -Destination $Exe -Force
  }
  Note 'done'
} catch {
  Note "failed: $_"
  Set-Content -LiteralPath $Marker -Value "$_"
} finally {
  if ($Launch -eq 'yes') { Start-Process -FilePath $Exe }
}
"#;

/// Waits for `pid` to exit, then runs the installer (`setup`) or copies the
/// unpacked portable version (`portable`) into `dir`, and starts `exe`.
#[cfg(windows)]
#[allow(clippy::too_many_arguments)]
fn windows_helper(work: &Path, pid: &str, mode: &str, source: &Path, dir: &Path, exe: &Path, marker: &Path, launch: bool) -> std::io::Result<std::process::Child> {
    use std::os::windows::process::CommandExt;
    let script = work.join("install-update.ps1");
    std::fs::write(&script, WIN_SCRIPT)?;
    std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .args(["-ProcId", pid, "-Mode", mode, "-Source"])
        .arg(source)
        .arg("-Dir")
        .arg(dir)
        .arg("-Exe")
        .arg(exe)
        .arg("-Marker")
        .arg(marker)
        .args(["-Launch", if launch { "yes" } else { "no" }])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP: a hidden console of its
        // own; the helper keeps running after the app quits.
        .creation_flags(0x0800_0000 | 0x0000_0200)
        .spawn()
}

/// Prepares the downloaded update and starts a helper that installs it once
/// this process has exited (the caller then quits the app).
pub fn install(file: &Path, kind: InstallKind, work: &Path) -> AppResult<()> {
    let staged = work.join("staged");
    let _ = std::fs::remove_dir_all(&staged);
    std::fs::create_dir_all(&staged)?;
    let pid = std::process::id().to_string();
    match kind {
        #[cfg(target_os = "macos")]
        InstallKind::MacApp => {
            let bundle = app_bundle().ok_or_else(|| AppError::msg("找不到正在运行的 LightPlayer.app"))?;
            let parent = bundle.parent().ok_or_else(|| AppError::msg("找不到应用所在的文件夹"))?;
            if !writable(parent) {
                return Err(AppError::msg(format!("没有权限写入 {}，请手动下载安装", parent.display())));
            }
            // ditto keeps the bundle's permissions, links and signature.
            let ok = std::process::Command::new("/usr/bin/ditto").args(["-x", "-k"]).arg(file).arg(&staged).status()?.success();
            let new_app = std::fs::read_dir(&staged)?
                .flatten()
                .map(|e| e.path())
                .find(|p| p.extension().is_some_and(|e| e == "app") && p.join("Contents/Info.plist").is_file());
            let Some(new_app) = new_app.filter(|_| ok) else {
                return Err(AppError::msg("更新包内容不完整，请重试"));
            };
            mac_helper(&pid, &bundle, &new_app, &work.join(FAILED_MARKER), "open")?;
            Ok(())
        }
        #[cfg(windows)]
        InstallKind::WindowsSetup | InstallKind::WindowsPortable => {
            let exe = std::env::current_exe()?;
            let dir = exe.parent().ok_or_else(|| AppError::msg("找不到应用所在的文件夹"))?.to_path_buf();
            let (mode, source) = if kind == InstallKind::WindowsSetup {
                ("setup", file.to_path_buf())
            } else {
                if !writable(&dir) {
                    return Err(AppError::msg(format!("没有权限写入 {}，请手动下载安装", dir.display())));
                }
                extract_zip(file, &staged)?;
                let src = find_with(&staged, "LightPlayer.exe").ok_or_else(|| AppError::msg("更新包内容不完整，请重试"))?;
                ("portable", src)
            };
            windows_helper(work, &pid, mode, &source, &dir, &exe, &work.join(FAILED_MARKER), true)?;
            Ok(())
        }
        _ => {
            let _ = (file, find_with, writable, pid);
            Err(AppError::msg("这个版本不能自动更新，请从 GitHub 下载安装"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn orders_versions() {
        let v = |s: &str| Version::parse(s).unwrap();
        assert!(v("1.6.0b1") < v("1.6.0b2"));
        assert!(v("1.6.0b2") < v("1.6.0"));
        assert!(v("1.6.0") < v("1.6.1b1"));
        assert!(v("v1.5.0") < v("1.6.0b1"));
        assert!(v("1.10.0") > v("1.9.9"));
        assert_eq!(v("1.6.0-beta.2"), v("1.6.0b2"));
        assert_eq!(v("v2"), v("2.0.0"));
        assert!(v("1.6.0rc1").is_prerelease() && !v("1.6.0").is_prerelease());
        assert!(Version::parse("latest").is_none());
    }

    fn release(tag: &str, pre: bool, assets: &[&str]) -> Value {
        json!({
            "tag_name": tag, "name": format!("LightPlayer {tag}"), "draft": false, "prerelease": pre,
            "body": "notes", "html_url": format!("https://github.com/{REPO}/releases/tag/{tag}"),
            "published_at": "2026-10-06T00:00:00Z",
            "assets": assets.iter().map(|n| json!({
                "name": n, "size": 100, "browser_download_url": format!("https://example.com/{n}"),
                "digest": "sha256:ABCDEF"
            })).collect::<Vec<_>>()
        })
    }

    #[test]
    fn picks_the_newest_matching_release() {
        let mut draft = release("v9.0.0", false, &[]);
        draft["draft"] = json!(true);
        let list = json!([
            release("v1.6.1b1", true, &["LightPlayer_1.6.1b1_aarch64.app.zip", "LightPlayer_1.6.1b1_x64-setup.exe"]),
            release("v1.6.0", false, &["LightPlayer_1.6.0_aarch64.app.zip", "LightPlayer_1.6.0_aarch64.dmg", "LightPlayer_1.6.0_x64-setup.exe", "LightPlayer_1.6.0_x64_portable.zip"]),
            release("v1.6.0b1", true, &[]),
            release("v1.5.0", false, &[]),
            draft,
        ]);
        // Final releases only.
        let u = pick_update(&list, "1.5.0", false, InstallKind::MacApp).unwrap();
        assert_eq!((u.version.as_str(), u.prerelease), ("1.6.0", false));
        let a = u.asset.unwrap();
        assert_eq!(a.name, "LightPlayer_1.6.0_aarch64.app.zip");
        assert_eq!(a.sha256.as_deref(), Some("abcdef"));
        // A pre-release user gets the final release of the same version.
        assert_eq!(pick_update(&list, "1.6.0b1", false, InstallKind::WindowsSetup).unwrap().asset.unwrap().name, "LightPlayer_1.6.0_x64-setup.exe");
        // With pre-releases.
        let u = pick_update(&list, "1.6.0b1", true, InstallKind::WindowsPortable).unwrap();
        assert_eq!(u.version, "1.6.1b1");
        assert!(u.asset.is_none(), "no portable file in that release");
        assert_eq!(pick_update(&list, "1.6.0", true, InstallKind::Manual).unwrap().version, "1.6.1b1");
        // Up to date.
        assert!(pick_update(&list, "1.6.0", false, InstallKind::MacApp).is_none());
        assert!(pick_update(&list, "1.6.1b1", true, InstallKind::MacApp).is_none());
    }

    /// A trimmed copy of the real listing (v1.3.0–v1.5.0).
    #[test]
    fn reads_the_github_listing() {
        let list: Value = serde_json::from_str(include_str!("../tests/github_releases.json")).unwrap();
        for (kind, file) in [
            (InstallKind::MacApp, "LightPlayer_1.5.0_aarch64.app.zip"),
            (InstallKind::WindowsSetup, "LightPlayer_1.5.0_x64-setup.exe"),
            (InstallKind::WindowsPortable, "LightPlayer_1.5.0_x64_portable.zip"),
        ] {
            let u = pick_update(&list, "1.4.0", false, kind).unwrap();
            assert_eq!((u.version.as_str(), u.tag.as_str()), ("1.5.0", "v1.5.0"));
            let a = u.asset.unwrap();
            assert_eq!(a.name, file);
            assert!(a.size > 1_000_000 && a.url.starts_with("https://github.com/2001020/LightPlayer/releases/download/v1.5.0/"));
            assert_eq!(a.sha256.map(|h| h.len()), Some(64));
        }
        assert!(pick_update(&list, "1.5.0", true, InstallKind::MacApp).is_none());
    }

    #[test]
    fn finds_the_app_folder() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("LightPlayer")).unwrap();
        std::fs::write(tmp.path().join("LightPlayer/LightPlayer.exe"), b"").unwrap();
        assert_eq!(find_with(tmp.path(), "LightPlayer.exe").unwrap(), tmp.path().join("LightPlayer"));
        assert!(find_with(tmp.path(), "nothing.exe").is_none());
        assert!(writable(tmp.path()));
    }

    #[test]
    fn reports_a_failed_install_once() {
        let tmp = tempfile::tempdir().unwrap();
        let work = tmp.path().join("updates");
        assert!(!startup(&work));
        std::fs::create_dir_all(work.join("staged")).unwrap();
        std::fs::write(work.join("old.zip"), b"x").unwrap();
        std::fs::write(work.join(FAILED_MARKER), b"failed").unwrap();
        assert!(startup(&work));
        assert!(!work.exists(), "old downloads are removed");
        assert!(!startup(&work));
    }

    /// A process id that has already exited.
    #[cfg(any(target_os = "macos", windows))]
    fn finished_pid() -> String {
        let mut c = if cfg!(windows) {
            let mut c = std::process::Command::new("cmd");
            c.args(["/C", "exit"]);
            c
        } else {
            std::process::Command::new("true")
        };
        let mut child = c.spawn().unwrap();
        child.wait().unwrap();
        child.id().to_string()
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn mac_helper_swaps_the_bundle() {
        let tmp = tempfile::tempdir().unwrap();
        let app = |dir: &Path, v: &str| {
            std::fs::create_dir_all(dir.join("Contents")).unwrap();
            std::fs::write(dir.join("Contents/Info.plist"), v).unwrap();
        };
        let old = tmp.path().join("Applications/LightPlayer.app");
        let new = tmp.path().join("staged/LightPlayer.app");
        let marker = tmp.path().join(FAILED_MARKER);
        app(&old, "old");
        app(&new, "new");
        let mut c = mac_helper(&finished_pid(), &old, &new, &marker, "true").unwrap();
        assert!(c.wait().unwrap().success());
        assert_eq!(std::fs::read_to_string(old.join("Contents/Info.plist")).unwrap(), "new");
        assert!(!new.exists() && !marker.exists());
        assert_eq!(std::fs::read_dir(old.parent().unwrap()).unwrap().count(), 1, "no backup left behind");
        // A missing new bundle: the old one stays and the failure is recorded.
        let mut c = mac_helper(&finished_pid(), &old, &new, &marker, "true").unwrap();
        c.wait().unwrap();
        assert_eq!(std::fs::read_to_string(old.join("Contents/Info.plist")).unwrap(), "new");
        assert!(marker.is_file());
    }

    #[cfg(windows)]
    #[test]
    fn windows_helper_installs() {
        let tmp = tempfile::tempdir().unwrap();
        let work = tmp.path().join("updates");
        let dir = tmp.path().join("Light Player");
        let marker = work.join(FAILED_MARKER);
        std::fs::create_dir_all(&work).unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("LightPlayer.exe");
        std::fs::write(&exe, "old").unwrap();
        std::fs::write(dir.join("ffmpeg.exe"), "old").unwrap();

        // Portable: the new files replace the old ones.
        let src = work.join("staged/LightPlayer");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("LightPlayer.exe"), "new").unwrap();
        std::fs::write(src.join("ffmpeg.exe"), "new").unwrap();
        let log = || {
            let read = |p: &Path| std::fs::read_to_string(p).unwrap_or_else(|e| format!("({e})"));
            format!("update helper log: {} marker: {}", read(&work.join("install-update.log")), read(&marker))
        };
        let mut c = windows_helper(&work, &finished_pid(), "portable", &src, &dir, &exe, &marker, false).unwrap();
        assert!(c.wait().unwrap().success(), "{}", log());
        assert_eq!(std::fs::read_to_string(&exe).unwrap(), "new", "{}", log());
        assert_eq!(std::fs::read_to_string(dir.join("ffmpeg.exe")).unwrap(), "new", "{}", log());
        assert!(!marker.exists());

        // Installer: runs silently into the same folder (a stand-in records its arguments).
        let setup = work.join("fake-setup.cmd");
        std::fs::write(&setup, "@echo %* > \"%~dp0args.txt\"\r\n@exit /b 0\r\n").unwrap();
        let mut c = windows_helper(&work, &finished_pid(), "setup", &setup, &dir, &exe, &marker, false).unwrap();
        assert!(c.wait().unwrap().success());
        let args = std::fs::read_to_string(work.join("args.txt")).unwrap_or_else(|e| panic!("{e}; {}", log()));
        assert!(args.contains("/S") && args.contains(&format!("/D={}", dir.display())), "{args}");
        assert!(!marker.exists(), "{}", log());

        // A failing installer is recorded.
        std::fs::write(&setup, "@exit /b 2\r\n").unwrap();
        let mut c = windows_helper(&work, &finished_pid(), "setup", &setup, &dir, &exe, &marker, false).unwrap();
        c.wait().unwrap();
        assert!(marker.is_file(), "{}", log());
    }

    /// Serves `data` at `/f.zip` with Range support (and 404 elsewhere).
    async fn serve(data: Vec<u8>) -> String {
        use axum::http::{header, HeaderMap, StatusCode};
        use axum::response::IntoResponse;
        let data = std::sync::Arc::new(data);
        let app = axum::Router::new().route(
            "/f.zip",
            axum::routing::get(move |h: HeaderMap| {
                let data = data.clone();
                async move {
                    let len = data.len();
                    let range = h.get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|v| {
                        let (a, b) = v.strip_prefix("bytes=")?.split_once('-')?;
                        let a: usize = a.parse().ok()?;
                        let b: usize = if b.is_empty() { len - 1 } else { b.parse::<usize>().ok()?.min(len - 1) };
                        (a <= b).then_some((a, b))
                    });
                    let (a, b) = range.unwrap_or((0, len - 1));
                    // Slow, like a throttled connection, so several are used at once.
                    let chunks: Vec<Vec<u8>> = data[a..=b].chunks(64 * 1024).map(<[u8]>::to_vec).collect();
                    let body = axum::body::Body::from_stream(futures_util::StreamExt::then(futures_util::stream::iter(chunks), |c| async move {
                        tokio::time::sleep(std::time::Duration::from_millis(15)).await;
                        Ok::<_, std::io::Error>(c)
                    }));
                    let mut headers = vec![(header::ACCEPT_RANGES, "bytes".to_string()), (header::CONTENT_LENGTH, (b + 1 - a).to_string())];
                    let status = if range.is_some() {
                        headers.push((header::CONTENT_RANGE, format!("bytes {a}-{b}/{len}")));
                        StatusCode::PARTIAL_CONTENT
                    } else {
                        StatusCode::OK
                    };
                    let mut resp = (status, body).into_response();
                    for (k, v) in headers {
                        resp.headers_mut().insert(k, v.parse().unwrap());
                    }
                    resp
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://127.0.0.1:{port}")
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn downloads_with_aria2_and_falls_back() {
        let data: Vec<u8> = (0..6_000_000u32).map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8).collect();
        let sha = hex::encode(Sha256::digest(&data));
        let base = serve(data.clone()).await;
        let asset = |path: &str, sha: &str| UpdateAsset {
            name: "LightPlayer_9.9.9_test.zip".into(),
            url: format!("{base}{path}"),
            size: data.len() as u64,
            sha256: Some(sha.into()),
        };
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("updates");
        let leftovers = || std::fs::read_dir(&dir).map(|d| d.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect::<Vec<_>>()).unwrap_or_default();
        let cancel = AtomicBool::new(false);

        match crate::tools::aria2() {
            Some(aria2) => {
                let mut most = 0;
                let mut last = 0;
                let file = download_with(Some(aria2), &asset("/f.zip", &sha), &dir, &cancel, |p| {
                    most = most.max(p.connections);
                    last = p.received;
                })
                .await
                .unwrap();
                assert_eq!(std::fs::read(&file).unwrap(), data);
                assert_eq!(last, data.len() as u64);
                assert!(most > 1, "aria2 used {most} connection(s)");
                assert_eq!(leftovers(), vec!["LightPlayer_9.9.9_test.zip".to_string()]);
                std::fs::remove_file(&file).unwrap();

                // A wrong checksum: rejected, nothing left behind.
                let e = download_with(Some(aria2), &asset("/f.zip", &"0".repeat(64)), &dir, &cancel, |_| {}).await.unwrap_err();
                assert!(e.to_string().contains("校验失败"), "{e}");
                assert!(leftovers().is_empty(), "{:?}", leftovers());

                // Cancelled.
                cancel.store(true, Ordering::SeqCst);
                assert!(matches!(download_with(Some(aria2), &asset("/f.zip", &sha), &dir, &cancel, |_| {}).await, Err(AppError::Cancelled)));
                assert!(leftovers().is_empty(), "{:?}", leftovers());
                cancel.store(false, Ordering::SeqCst);

                // A missing file: aria2 and the single connection both fail.
                assert!(download_with(Some(aria2), &asset("/missing.zip", &sha), &dir, &cancel, |_| {}).await.is_err());
                assert!(leftovers().is_empty(), "{:?}", leftovers());
            }
            None => eprintln!("no aria2c here: only the fallback is tested"),
        }

        // aria2 cannot start: one connection instead.
        let mut conns = 0;
        let file = download_with(Some(Path::new("/nonexistent/aria2c")), &asset("/f.zip", &sha), &dir, &cancel, |p| conns = p.connections).await.unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), data);
        assert_eq!(conns, 1);
    }

    /// Downloads this platform's file from the newest final release with aria2,
    /// then over one connection: `cargo test aria2_live -- --ignored --nocapture`.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn aria2_live() {
        let aria2 = crate::tools::aria2().expect("aria2c (bundled next to the app, or on PATH)");
        let releases: Value = serde_json::from_slice(
            &client().unwrap().get(format!("https://api.github.com/repos/{REPO}/releases?per_page=10")).send().await.unwrap().bytes().await.unwrap(),
        )
        .unwrap();
        let kind = if cfg!(windows) { InstallKind::WindowsPortable } else { InstallKind::MacApp };
        let asset = pick_update(&releases, "0.1.0", false, kind).and_then(|u| u.asset).expect("a release file");
        let tmp = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        for (label, program) in [("aria2", Some(aria2)), ("single connection", None)] {
            let started = std::time::Instant::now();
            let mut most = 0;
            let file = download_with(program, &asset, tmp.path(), &cancel, |p| most = most.max(p.connections)).await.unwrap_or_else(|e| panic!("{label}: {e}"));
            let secs = started.elapsed().as_secs_f64();
            println!("{label}: {} {:.1} MB in {secs:.1} s ({:.2} MB/s, up to {most} connections, sha256 checked: {})", asset.name, asset.size as f64 / 1e6, asset.size as f64 / 1e6 / secs, asset.sha256.is_some());
            std::fs::remove_file(file).unwrap();
        }
    }

    /// Talks to GitHub: `cargo test updater_live -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn updater_live() {
        let all = check(true).await.expect("GitHub releases");
        println!("current {} → with pre-releases: {:?}", current_version(), all.as_ref().map(|u| (&u.version, u.asset.as_ref().map(|a| &a.name))));
        let releases: Value = client()
            .unwrap()
            .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=30"))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .map(|b| serde_json::from_slice(&b).unwrap())
            .unwrap();
        let n = releases.as_array().map(|a| a.len()).unwrap_or(0);
        println!("releases listed: {n}");
        assert!(n > 0);
        // From an old version every kind of install finds its file in the newest final release.
        for kind in [InstallKind::MacApp, InstallKind::WindowsSetup, InstallKind::WindowsPortable] {
            let u = pick_update(&releases, "0.1.0", false, kind).expect("a final release");
            let a = u.asset.unwrap_or_else(|| panic!("{kind:?}: no file in {}", u.tag));
            println!("{kind:?}: {} {} ({} bytes, sha256 {})", u.tag, a.name, a.size, a.sha256.is_some());
            assert!(a.size > 1_000_000);
        }
    }
}
