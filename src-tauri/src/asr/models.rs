//! Whisper model registry and resumable, verified downloads.

use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSpec {
    pub id: &'static str,
    pub file: &'static str,
    #[serde(skip)]
    pub repo: &'static str,
    pub size_mb: u32,
    #[serde(skip)]
    pub sha1: Option<&'static str>,
    pub label: &'static str,
    pub description: &'static str,
    pub recommended: bool,
}

pub const VAD_ID: &str = "silero-vad";

pub const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny",
        file: "ggml-tiny.bin",
        repo: "ggerganov/whisper.cpp",
        size_mb: 75,
        sha1: Some("bd577a113a864445d4c299885e0cb97d4ba92b5f"),
        label: "Tiny",
        description: "速度最快，准确率较低，适合快速试用",
        recommended: false,
    },
    ModelSpec {
        id: "base",
        file: "ggml-base.bin",
        repo: "ggerganov/whisper.cpp",
        size_mb: 142,
        sha1: Some("465707469ff3a37a2b9b8d8f89f2f99de7299dac"),
        label: "Base",
        description: "体积小、速度快，适合配置较低的电脑",
        recommended: false,
    },
    ModelSpec {
        id: "small",
        file: "ggml-small.bin",
        repo: "ggerganov/whisper.cpp",
        size_mb: 466,
        sha1: Some("55356645c2b361a969dfd0ef2c5a50d530afd8d5"),
        label: "Small",
        description: "速度与准确率均衡",
        recommended: false,
    },
    ModelSpec {
        id: "large-v3-turbo-q5_0",
        file: "ggml-large-v3-turbo-q5_0.bin",
        repo: "ggerganov/whisper.cpp",
        size_mb: 547,
        sha1: Some("e050f7970618a659205450ad97eb95a18d69c9ee"),
        label: "Large v3 Turbo（量化）",
        description: "推荐：接近 Large 的准确率，Apple Silicon 上速度很快",
        recommended: true,
    },
    ModelSpec {
        id: "medium",
        file: "ggml-medium.bin",
        repo: "ggerganov/whisper.cpp",
        size_mb: 1500,
        sha1: Some("fd9727b6e1217c2f614f9b698455c4ffd82463b4"),
        label: "Medium",
        description: "准确率高，速度较慢",
        recommended: false,
    },
    ModelSpec {
        id: "large-v3-turbo",
        file: "ggml-large-v3-turbo.bin",
        repo: "ggerganov/whisper.cpp",
        size_mb: 1550,
        sha1: Some("4af2b29d7ec73d781377bfd1758ca957a807e941"),
        label: "Large v3 Turbo",
        description: "最高准确率，需要较多内存",
        recommended: false,
    },
    ModelSpec {
        id: VAD_ID,
        file: "ggml-silero-v5.1.2.bin",
        repo: "ggml-org/whisper-vad",
        size_mb: 1,
        sha1: None,
        label: "Silero VAD",
        description: "人声活动检测：跳过纯伴奏段落，减少“幻听”并加快识别",
        recommended: true,
    },
];

pub fn spec(id: &str) -> Option<&'static ModelSpec> {
    MODELS.iter().find(|m| m.id == id)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    #[serde(flatten)]
    pub spec: ModelSpec,
    pub downloaded: bool,
    pub partial_bytes: u64,
}

pub fn model_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(spec.file)
}

pub fn list(dir: &Path) -> Vec<ModelStatus> {
    MODELS
        .iter()
        .map(|m| {
            let p = model_path(dir, m);
            let part = dir.join(format!("{}.part", m.file));
            ModelStatus {
                spec: *m,
                downloaded: p.is_file(),
                partial_bytes: std::fs::metadata(part).map(|m| m.len()).unwrap_or(0),
            }
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub downloaded: u64,
    pub total: u64,
    /// "downloading" | "verifying" | "done" | "error" | "cancelled"
    pub state: String,
    pub error: Option<String>,
}

pub fn mirror_base(mirror: &str) -> &'static str {
    match mirror {
        "hf-mirror" => "https://hf-mirror.com",
        _ => "https://huggingface.co",
    }
}

fn sha1_file(path: &Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha1::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex::encode(h.finalize()))
}

/// Downloads a model into `dir`, resuming a previous `.part` file.
pub async fn download(
    dir: &Path,
    spec: &'static ModelSpec,
    mirror: &str,
    cancel: Arc<AtomicBool>,
    progress: impl Fn(DownloadProgress),
) -> AppResult<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let target = model_path(dir, spec);
    if target.is_file() {
        return Ok(target);
    }
    let part = dir.join(format!("{}.part", spec.file));
    let url = format!("{}/{}/resolve/main/{}", mirror_base(mirror), spec.repo, spec.file);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .user_agent("LightPlayer/0.1")
        .build()?;

    let mut have = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    let mut req = client.get(&url);
    if have > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={have}-"));
    }
    let resp = req.send().await?;
    let status = resp.status();
    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        // The partial file is already complete (or corrupt); verify below.
    } else if !status.is_success() {
        return Err(AppError::msg(format!("下载失败：HTTP {status}")));
    }
    let resumed = status == reqwest::StatusCode::PARTIAL_CONTENT;
    if !resumed && status.is_success() {
        have = 0;
    }
    let total = resp.content_length().map(|l| l + have).unwrap_or(spec.size_mb as u64 * 1_048_576);

    if status.is_success() {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(resumed)
            .truncate(!resumed)
            .open(&part)?;
        let mut stream = resp.bytes_stream();
        let mut last = Instant::now();
        let mut done = have;
        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                progress(DownloadProgress {
                    id: spec.id.into(),
                    downloaded: done,
                    total,
                    state: "cancelled".into(),
                    error: None,
                });
                return Err(AppError::Cancelled);
            }
            let chunk = chunk?;
            file.write_all(&chunk)?;
            done += chunk.len() as u64;
            if last.elapsed() > Duration::from_millis(200) {
                last = Instant::now();
                progress(DownloadProgress {
                    id: spec.id.into(),
                    downloaded: done,
                    total,
                    state: "downloading".into(),
                    error: None,
                });
            }
        }
        file.flush()?;
    }

    progress(DownloadProgress {
        id: spec.id.into(),
        downloaded: total,
        total,
        state: "verifying".into(),
        error: None,
    });
    if let Some(expected) = spec.sha1 {
        let p = part.clone();
        let actual = tokio::task::spawn_blocking(move || sha1_file(&p))
            .await
            .map_err(|e| AppError::msg(e.to_string()))??;
        if actual != expected {
            let _ = std::fs::remove_file(&part);
            return Err(AppError::msg("模型文件校验失败，请重新下载"));
        }
    } else {
        let len = std::fs::metadata(&part)?.len();
        if len < 100 * 1024 {
            let _ = std::fs::remove_file(&part);
            return Err(AppError::msg("模型文件不完整，请重新下载"));
        }
    }
    std::fs::rename(&part, &target)?;
    progress(DownloadProgress {
        id: spec.id.into(),
        downloaded: total,
        total,
        state: "done".into(),
        error: None,
    });
    Ok(target)
}

pub fn delete(dir: &Path, spec: &ModelSpec) -> AppResult<()> {
    let _ = std::fs::remove_file(dir.join(format!("{}.part", spec.file)));
    let p = model_path(dir, spec);
    if p.is_file() {
        std::fs::remove_file(p)?;
    }
    Ok(())
}
