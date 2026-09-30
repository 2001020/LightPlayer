//! Local lyrics recognition: ffmpeg → 16 kHz mono PCM → whisper.cpp.

use super::models::{self, VAD_ID};
use super::postprocess::{self, RawSegment, RawToken};
use crate::error::{AppError, AppResult};
use crate::tools::{std_command, tools};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperVadParams};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrOptions {
    pub model: String,
    /// "auto" or an ISO code such as "zh", "en", "ja".
    #[serde(default = "auto")]
    pub language: String,
    /// Band-pass + loudness normalisation to emphasise vocals over the band.
    #[serde(default = "yes")]
    pub vocal_focus: bool,
    /// Convert Traditional Chinese output to Simplified.
    #[serde(default = "yes")]
    pub simplified: bool,
    /// Use the Silero VAD model when it has been downloaded.
    #[serde(default = "yes")]
    pub use_vad: bool,
    /// Emit per-word timestamps (enhanced LRC).
    #[serde(default = "yes")]
    pub word_timestamps: bool,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
}

fn auto() -> String {
    "auto".into()
}
fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrProgress {
    /// "decoding" | "loading" | "transcribing" | "finishing"
    pub stage: String,
    pub percent: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrResult {
    pub lrc: String,
    pub line_count: usize,
    pub language: String,
    pub model: String,
}

pub fn decode_pcm(media: &Path, vocal_focus: bool, cancel: &AtomicBool) -> AppResult<Vec<f32>> {
    let mut cmd = std_command(&tools().ffmpeg);
    cmd.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-i"])
        .arg(media)
        .args(["-vn", "-sn", "-map", "0:a:0", "-ac", "1", "-ar", "16000"]);
    if vocal_focus {
        cmd.args(["-af", "highpass=f=100,lowpass=f=7500,dynaudnorm=f=250:g=15"]);
    }
    cmd.args(["-f", "f32le", "-"]);
    cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::msg(format!("无法运行 ffmpeg：{e}")))?;
    let mut stdout = child.stdout.take().unwrap();
    let mut bytes = Vec::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            return Err(AppError::Cancelled);
        }
        let n = stdout.read(&mut buf)?;
        if n == 0 {
            break;
        }
        bytes.extend_from_slice(&buf[..n]);
    }
    let out = child.wait_with_output()?;
    if !out.status.success() {
        return Err(AppError::msg(format!(
            "音频解码失败：{}",
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    Ok(bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect())
}

fn initial_prompt(lang: &str) -> Option<&'static str> {
    match lang {
        "zh" => Some("以下是一首中文歌曲的歌词，使用简体中文。"),
        "yue" => Some("以下是一首粤语歌曲的歌词。"),
        "ja" => Some("以下は日本語の歌の歌詞です。"),
        "ko" => Some("다음은 한국어 노래 가사입니다."),
        "en" => Some("Song lyrics:"),
        _ => None,
    }
}

pub fn transcribe(
    media: &Path,
    opts: &AsrOptions,
    models_dir: &Path,
    cancel: Arc<AtomicBool>,
    progress: Arc<dyn Fn(AsrProgress) + Send + Sync>,
) -> AppResult<AsrResult> {
    let spec = models::spec(&opts.model).ok_or_else(|| AppError::msg("未知的模型"))?;
    let model_path = models::model_path(models_dir, spec);
    if !model_path.is_file() {
        return Err(AppError::msg("模型尚未下载"));
    }

    progress(AsrProgress { stage: "decoding".into(), percent: 0.0 });
    let pcm = decode_pcm(media, opts.vocal_focus, &cancel)?;
    if pcm.len() < 16000 {
        return Err(AppError::msg("音频过短，无法识别"));
    }

    progress(AsrProgress { stage: "loading".into(), percent: 0.0 });
    let ctx = WhisperContext::new_with_params(
        model_path.to_string_lossy().as_ref(),
        WhisperContextParameters::default(),
    )
    .map_err(|e| AppError::msg(format!("加载模型失败：{e}")))?;
    let mut state = ctx.create_state().map_err(|e| AppError::msg(format!("初始化模型失败：{e}")))?;

    let mut params = FullParams::new(SamplingStrategy::BeamSearch { beam_size: 5, patience: -1.0 });
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8) as i32;
    params.set_n_threads(threads);
    let lang = opts.language.as_str();
    params.set_language(Some(if lang.is_empty() { "auto" } else { lang }));
    if let Some(p) = initial_prompt(lang) {
        params.set_initial_prompt(p);
    }
    params.set_translate(false);
    params.set_no_context(true);
    params.set_token_timestamps(true);
    params.set_suppress_nst(true);
    params.set_no_speech_thold(0.6);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    let vad_path = models::spec(VAD_ID).map(|s| models::model_path(models_dir, s));
    let vad_path_str = vad_path
        .filter(|p| opts.use_vad && p.is_file())
        .map(|p| p.to_string_lossy().into_owned());
    if let Some(p) = vad_path_str.as_deref() {
        // whisper-rs requires the model path to be set before enabling VAD.
        params.set_vad_model_path(Some(p));
        params.enable_vad(true);
        let mut vp = WhisperVadParams::new();
        vp.set_threshold(0.4);
        vp.set_min_silence_duration(300);
        vp.set_speech_pad(200);
        params.set_vad_params(vp);
    }

    let prog = progress.clone();
    params.set_progress_callback_safe(move |p: i32| {
        prog(AsrProgress { stage: "transcribing".into(), percent: p as f32 });
    });
    let c = cancel.clone();
    params.set_abort_callback_safe(move || c.load(Ordering::Relaxed));

    progress(AsrProgress { stage: "transcribing".into(), percent: 0.0 });
    let res = state.full(params, &pcm);
    if cancel.load(Ordering::Relaxed) {
        return Err(AppError::Cancelled);
    }
    res.map_err(|e| AppError::msg(format!("识别失败：{e}")))?;

    progress(AsrProgress { stage: "finishing".into(), percent: 100.0 });
    let eot = ctx.token_eot();
    let n = state.full_n_segments();
    let mut segments = Vec::with_capacity(n.max(0) as usize);
    for i in 0..n {
        let Some(seg) = state.get_segment(i) else { continue };
        let text = seg.to_str_lossy().map(|s| s.into_owned()).unwrap_or_default();
        let mut tokens = Vec::new();
        for j in 0..seg.n_tokens() {
            let Some(tok) = seg.get_token(j) else { continue };
            if tok.token_id() >= eot {
                continue; // special / timestamp tokens
            }
            let data = tok.token_data();
            let bytes = tok.to_bytes().map(|b| b.to_vec()).unwrap_or_default();
            let (t0, t1) = if data.t0 >= 0 && data.t1 >= data.t0 {
                (data.t0 as f64 / 100.0, data.t1 as f64 / 100.0)
            } else {
                (-1.0, -1.0)
            };
            tokens.push(RawToken { bytes, t0, t1 });
        }
        segments.push(RawSegment {
            start: seg.start_timestamp() as f64 / 100.0,
            end: seg.end_timestamp() as f64 / 100.0,
            text,
            no_speech: seg.no_speech_probability(),
            tokens,
        });
    }
    let lang_id = state.full_lang_id_from_state();
    let detected = whisper_rs::get_lang_str(lang_id).unwrap_or("auto").to_string();

    let mut lines = postprocess::build_lines(&segments);
    if opts.simplified && (detected == "zh" || lang == "zh") {
        postprocess::to_simplified(&mut lines);
    }
    if lines.is_empty() {
        return Err(AppError::msg("未识别到人声歌词（可能是纯音乐）"));
    }
    let lrc = postprocess::to_lrc(
        &lines,
        opts.title.as_deref(),
        opts.artist.as_deref(),
        spec.label,
        opts.word_timestamps,
    );
    Ok(AsrResult { lrc, line_count: lines.len(), language: detected, model: spec.id.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end recognition check. Needs a downloaded model and a speech clip:
    /// `LP_ASR_MODEL_DIR=<dir with ggml-tiny.bin> LP_ASR_AUDIO=<file> cargo test asr_smoke -- --ignored`
    #[test]
    #[ignore]
    fn asr_smoke() {
        let dir = std::env::var("LP_ASR_MODEL_DIR").expect("LP_ASR_MODEL_DIR");
        let audio = std::env::var("LP_ASR_AUDIO").expect("LP_ASR_AUDIO");
        let opts = AsrOptions {
            model: std::env::var("LP_ASR_MODEL").unwrap_or_else(|_| "tiny".into()),
            language: "en".into(),
            vocal_focus: false,
            simplified: false,
            use_vad: true,
            word_timestamps: true,
            title: Some("Smoke".into()),
            artist: None,
        };
        let last = Arc::new(std::sync::Mutex::new(0f32));
        let l = last.clone();
        let progress: Arc<dyn Fn(AsrProgress) + Send + Sync> = Arc::new(move |p| *l.lock().unwrap() = p.percent);
        let res = transcribe(Path::new(&audio), &opts, Path::new(&dir), Arc::new(AtomicBool::new(false)), progress)
            .expect("transcription failed");
        println!("{}", res.lrc);
        let lower = res.lrc.to_lowercase();
        assert!(res.line_count >= 1);
        assert!(lower.contains("[00:"), "timestamps present");
        assert!(lower.contains("music") || lower.contains("player") || lower.contains("lyrics"), "recognised words");
    }
}
