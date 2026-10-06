//! Locates the ffmpeg / ffprobe / aria2c executables.
//!
//! Bundled builds ship them as Tauri sidecars next to the main executable
//! (`Contents/MacOS/ffmpeg`). During development we fall back to common
//! install locations and finally to `$PATH`.

use once_cell::sync::OnceCell;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Tools {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
}

static TOOLS: OnceCell<Tools> = OnceCell::new();

pub fn tools() -> &'static Tools {
    TOOLS.get_or_init(|| Tools {
        ffmpeg: locate("ffmpeg"),
        ffprobe: locate("ffprobe"),
    })
}

fn exe_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// aria2c for update downloads; None when there is none (or
/// `LIGHTPLAYER_ARIA2=off`), and updates download over one connection.
pub fn aria2() -> Option<&'static Path> {
    static ARIA2: OnceCell<Option<PathBuf>> = OnceCell::new();
    ARIA2
        .get_or_init(|| {
            let off = std::env::var("LIGHTPLAYER_ARIA2").is_ok_and(|v| matches!(v.as_str(), "0" | "off" | "false"));
            let p = locate("aria2c");
            (!off && p.is_file()).then_some(p)
        })
        .as_deref()
}

fn locate(name: &str) -> PathBuf {
    let file = exe_name(name);
    if let Ok(dir) = std::env::var("LIGHTPLAYER_FFMPEG_DIR") {
        let p = Path::new(&dir).join(&file);
        if p.is_file() {
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join(&file);
            if p.is_file() {
                return p;
            }
        }
    }
    // GUI apps launched from Finder get a minimal PATH, so probe common dirs.
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        let p = Path::new(dir).join(&file);
        if p.is_file() {
            return p;
        }
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let p = dir.join(&file);
            if p.is_file() {
                return p;
            }
        }
    }
    PathBuf::from(file)
}

/// A tokio command that never opens a console window on Windows.
pub fn command(program: &Path) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.kill_on_drop(true);
    cmd
}

/// Blocking variant used inside worker threads.
pub fn std_command(program: &Path) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

/// Lists hardware/software encoders available in the bundled ffmpeg.
pub async fn has_encoder(name: &str) -> bool {
    static ENCODERS: tokio::sync::OnceCell<String> = tokio::sync::OnceCell::const_new();
    let list = ENCODERS
        .get_or_init(|| async {
            match command(&tools().ffmpeg)
                .args(["-hide_banner", "-encoders"])
                .output()
                .await
            {
                Ok(out) => String::from_utf8_lossy(&out.stdout).into_owned(),
                Err(_) => String::new(),
            }
        })
        .await;
    list.lines()
        .any(|l| l.split_whitespace().nth(1) == Some(name))
}
