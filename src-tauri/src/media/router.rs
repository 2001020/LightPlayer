//! Decides how a file is delivered to the WebView: directly, via an audio
//! transcode cache, or through an on-the-fly HLS remux/transcode.

use super::kinds::MediaKind;
use super::probe::Probe;
use serde::{Deserialize, Serialize};

/// Decoding capabilities reported by the WebView (`canPlayType`).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Caps {
    pub hevc: bool,
    pub av1: bool,
    pub vp9: bool,
    pub flac: bool,
    pub opus: bool,
    pub vorbis: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Strategy {
    /// Serve the original file with HTTP range support.
    Direct,
    /// Decode the audio to a cached FLAC/WAV file, then serve it directly.
    AudioTranscode,
    /// Copy the video bitstream into HLS fMP4 segments (audio re-encoded to AAC).
    HlsRemux,
    /// Re-encode video to H.264 into HLS segments.
    HlsTranscode,
}

fn is_mp4_family(format_name: &str) -> bool {
    format_name.split(',').any(|f| matches!(f, "mov" | "mp4" | "m4a" | "3gp"))
}

fn has(format_name: &str, name: &str) -> bool {
    format_name.split(',').any(|f| f == name)
}

fn video_codec_ok(codec: &str, pix_fmt: Option<&str>, caps: &Caps) -> bool {
    // VideoToolbox cannot decode 10-bit H.264 (Hi10P) or 4:2:2/4:4:4 H.264.
    let eight_bit_420 = pix_fmt
        .map(|p| matches!(p, "yuv420p" | "yuvj420p" | "nv12"))
        .unwrap_or(true);
    match codec {
        "h264" => eight_bit_420,
        "hevc" => caps.hevc,
        "av1" => caps.av1,
        _ => false,
    }
}

fn mp4_audio_ok(codec: &str) -> bool {
    matches!(codec, "aac" | "mp3" | "alac" | "ac3" | "eac3")
}

pub fn decide(kind: MediaKind, probe: &Probe, ext: &str, caps: &Caps) -> Strategy {
    let fmt = probe.format.format_name.as_str();
    let video = probe.video();
    let audio_codec = probe.audio().map(|a| a.codec_name.as_str()).unwrap_or("");

    if kind == MediaKind::Audio || video.is_none() {
        let direct = if has(fmt, "mp3") {
            audio_codec == "mp3"
        } else if is_mp4_family(fmt) {
            matches!(audio_codec, "aac" | "alac" | "mp3")
        } else if has(fmt, "wav") || has(fmt, "aiff") {
            audio_codec.starts_with("pcm_")
        } else if has(fmt, "flac") {
            caps.flac
        } else if has(fmt, "ogg") {
            (audio_codec == "vorbis" && caps.vorbis) || (audio_codec == "opus" && caps.opus)
        } else if has(fmt, "webm") && ext == "webm" {
            (audio_codec == "vorbis" && caps.vorbis) || (audio_codec == "opus" && caps.opus)
        } else {
            false
        };
        return if direct { Strategy::Direct } else { Strategy::AudioTranscode };
    }

    let v = video.unwrap();
    let vcodec = v.codec_name.as_str();
    let vok = video_codec_ok(vcodec, v.pix_fmt.as_deref(), caps);
    let no_audio = probe.audio().is_none();

    // WebKit only plays HEVC in MP4 when tagged `hvc1` (not `hev1`); remux fixes the tag.
    let tag_ok = vcodec != "hevc" || v.codec_tag_string.as_deref() == Some("hvc1");
    if is_mp4_family(fmt) && vok && tag_ok && (no_audio || mp4_audio_ok(audio_codec)) && ext != "3gp" {
        return Strategy::Direct;
    }
    if has(fmt, "webm")
        && ext == "webm"
        && caps.vp9
        && matches!(vcodec, "vp8" | "vp9" | "av1")
        && (no_audio || matches!(audio_codec, "opus" | "vorbis"))
    {
        return Strategy::Direct;
    }
    if vok {
        Strategy::HlsRemux
    } else {
        Strategy::HlsTranscode
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe(format: &str, streams: &str) -> Probe {
        Probe::parse(&format!(
            r#"{{"format":{{"format_name":"{format}"}},"streams":[{streams}]}}"#
        ))
        .unwrap()
    }

    const H264: &str = r#"{"codec_type":"video","codec_name":"h264","pix_fmt":"yuv420p"}"#;
    const HI10: &str = r#"{"codec_type":"video","codec_name":"h264","pix_fmt":"yuv420p10le"}"#;
    const HEVC: &str = r#"{"codec_type":"video","codec_name":"hevc","pix_fmt":"yuv420p10le"}"#;
    const WMV: &str = r#"{"codec_type":"video","codec_name":"wmv3"}"#;
    const COVER: &str = r#"{"codec_type":"video","codec_name":"mjpeg","disposition":{"attached_pic":1}}"#;
    fn a(codec: &str) -> String {
        format!(r#"{{"codec_type":"audio","codec_name":"{codec}"}}"#)
    }

    #[test]
    fn audio_routes() {
        let caps = Caps { flac: true, ..Default::default() };
        let mp3 = probe("mp3", &format!("{},{}", a("mp3"), COVER));
        assert_eq!(decide(MediaKind::Audio, &mp3, "mp3", &caps), Strategy::Direct);
        let flac = probe("flac", &a("flac"));
        assert_eq!(decide(MediaKind::Audio, &flac, "flac", &caps), Strategy::Direct);
        assert_eq!(decide(MediaKind::Audio, &flac, "flac", &Caps::default()), Strategy::AudioTranscode);
        let ape = probe("ape", &a("ape"));
        assert_eq!(decide(MediaKind::Audio, &ape, "ape", &caps), Strategy::AudioTranscode);
        let m4a = probe("mov,mp4,m4a,3gp,3g2,mj2", &a("alac"));
        assert_eq!(decide(MediaKind::Audio, &m4a, "m4a", &caps), Strategy::Direct);
        let wma = probe("asf", &a("wmav2"));
        assert_eq!(decide(MediaKind::Audio, &wma, "wma", &caps), Strategy::AudioTranscode);
        let wav = probe("wav", &a("pcm_s16le"));
        assert_eq!(decide(MediaKind::Audio, &wav, "wav", &caps), Strategy::Direct);
    }

    #[test]
    fn video_routes() {
        let caps = Caps { hevc: true, ..Default::default() };
        let mp4 = probe("mov,mp4,m4a,3gp,3g2,mj2", &format!("{H264},{}", a("aac")));
        assert_eq!(decide(MediaKind::Video, &mp4, "mp4", &caps), Strategy::Direct);
        let mkv = probe("matroska,webm", &format!("{H264},{}", a("flac")));
        assert_eq!(decide(MediaKind::Video, &mkv, "mkv", &caps), Strategy::HlsRemux);
        let hevc = probe("matroska,webm", &format!("{HEVC},{}", a("aac")));
        assert_eq!(decide(MediaKind::Video, &hevc, "mkv", &caps), Strategy::HlsRemux);
        assert_eq!(decide(MediaKind::Video, &hevc, "mkv", &Caps::default()), Strategy::HlsTranscode);
        let hi10 = probe("matroska,webm", &format!("{HI10},{}", a("aac")));
        assert_eq!(decide(MediaKind::Video, &hi10, "mkv", &caps), Strategy::HlsTranscode);
        let wmv = probe("asf", &format!("{WMV},{}", a("wmav2")));
        assert_eq!(decide(MediaKind::Video, &wmv, "wmv", &caps), Strategy::HlsTranscode);
        let hev1 = probe(
            "mov,mp4,m4a,3gp,3g2,mj2",
            &format!(r#"{{"codec_type":"video","codec_name":"hevc","codec_tag_string":"hev1"}},{}"#, a("aac")),
        );
        assert_eq!(decide(MediaKind::Video, &hev1, "mp4", &caps), Strategy::HlsRemux);
        let hvc1 = probe(
            "mov,mp4,m4a,3gp,3g2,mj2",
            &format!(r#"{{"codec_type":"video","codec_name":"hevc","codec_tag_string":"hvc1"}},{}"#, a("aac")),
        );
        assert_eq!(decide(MediaKind::Video, &hvc1, "mp4", &caps), Strategy::Direct);
        let opus_mp4 = probe("mov,mp4,m4a,3gp,3g2,mj2", &format!("{H264},{}", a("opus")));
        assert_eq!(decide(MediaKind::Video, &opus_mp4, "mp4", &caps), Strategy::HlsRemux);
    }
}
