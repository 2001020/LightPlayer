//! ffprobe wrapper and derived video information.

use crate::error::{AppError, AppResult};
use crate::tools::{command, tools};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;
use std::path::Path;

fn de_num<'de, D: Deserializer<'de>>(d: D) -> Result<Option<f64>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum N {
        S(String),
        F(f64),
    }
    Ok(match Option::<N>::deserialize(d)? {
        Some(N::S(s)) => s.trim().parse::<f64>().ok(),
        Some(N::F(f)) => Some(f),
        None => None,
    })
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Disposition {
    #[serde(default)]
    pub attached_pic: i32,
    #[serde(default)]
    pub default: i32,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct SideData {
    #[serde(default)]
    pub rotation: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Stream {
    #[serde(default)]
    pub index: i64,
    #[serde(default)]
    pub codec_type: String,
    #[serde(default)]
    pub codec_name: String,
    #[serde(default)]
    pub codec_long_name: Option<String>,
    #[serde(default)]
    pub codec_tag_string: Option<String>,
    #[serde(default)]
    pub profile: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub display_aspect_ratio: Option<String>,
    #[serde(default)]
    pub pix_fmt: Option<String>,
    #[serde(default)]
    pub color_transfer: Option<String>,
    #[serde(default)]
    pub color_primaries: Option<String>,
    #[serde(default)]
    pub avg_frame_rate: Option<String>,
    #[serde(default)]
    pub r_frame_rate: Option<String>,
    #[serde(default, deserialize_with = "de_num")]
    pub bit_rate: Option<f64>,
    #[serde(default, deserialize_with = "de_num")]
    pub sample_rate: Option<f64>,
    #[serde(default)]
    pub channels: Option<u32>,
    #[serde(default)]
    pub channel_layout: Option<String>,
    #[serde(default)]
    pub disposition: Disposition,
    #[serde(default)]
    pub tags: HashMap<String, String>,
    #[serde(default)]
    pub side_data_list: Vec<SideData>,
}

impl Stream {
    pub fn tag(&self, key: &str) -> Option<&str> {
        self.tags
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v.as_str())
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Format {
    #[serde(default)]
    pub format_name: String,
    #[serde(default)]
    pub format_long_name: Option<String>,
    #[serde(default, deserialize_with = "de_num")]
    pub duration: Option<f64>,
    #[serde(default, deserialize_with = "de_num")]
    pub start_time: Option<f64>,
    #[serde(default, deserialize_with = "de_num")]
    pub bit_rate: Option<f64>,
    #[serde(default, deserialize_with = "de_num")]
    pub size: Option<f64>,
    #[serde(default)]
    pub tags: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Probe {
    #[serde(default)]
    pub format: Format,
    #[serde(default)]
    pub streams: Vec<Stream>,
}

impl Probe {
    pub fn parse(json: &str) -> AppResult<Self> {
        Ok(serde_json::from_str(json)?)
    }

    /// First real video stream (cover art pictures are ignored).
    pub fn video(&self) -> Option<&Stream> {
        self.streams
            .iter()
            .find(|s| s.codec_type == "video" && s.disposition.attached_pic == 0)
    }

    pub fn audio(&self) -> Option<&Stream> {
        self.streams
            .iter()
            .find(|s| s.codec_type == "audio" && s.disposition.default == 1)
            .or_else(|| self.streams.iter().find(|s| s.codec_type == "audio"))
    }

    pub fn subtitles(&self) -> impl Iterator<Item = &Stream> {
        self.streams.iter().filter(|s| s.codec_type == "subtitle")
    }

    pub fn format_tag(&self, key: &str) -> Option<&str> {
        self.format
            .tags
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v.as_str())
            .or_else(|| self.audio().and_then(|a| a.tag(key)))
    }

    pub fn duration(&self) -> Option<f64> {
        self.format.duration
    }
}

pub async fn probe(path: &Path) -> AppResult<Probe> {
    let out = command(&tools().ffprobe)
        .args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams"])
        .arg(path)
        .output()
        .await
        .map_err(|e| AppError::msg(format!("无法运行 ffprobe（{e}）。请确认 ffmpeg 组件已安装。")))?;
    if !out.status.success() {
        return Err(AppError::msg("无法解析该媒体文件"));
    }
    Probe::parse(&String::from_utf8_lossy(&out.stdout))
}

/// Parses "24000/1001" / "25/1" / "30" into frames per second.
pub fn parse_rate(s: &str) -> Option<f64> {
    let s = s.trim();
    let v = if let Some((n, d)) = s.split_once('/') {
        let n: f64 = n.trim().parse().ok()?;
        let d: f64 = d.trim().parse().ok()?;
        if d == 0.0 {
            return None;
        }
        n / d
    } else {
        s.parse().ok()?
    };
    (v.is_finite() && v > 0.0).then_some(v)
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub file_name: String,
    pub file_size: u64,
    pub container: String,
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub display_aspect_ratio: Option<String>,
    pub rotation: Option<i32>,
    pub fps: Option<f64>,
    pub total_bitrate: Option<f64>,
    pub video_bitrate: Option<f64>,
    pub audio_bitrate: Option<f64>,
    pub video_codec: Option<String>,
    pub video_profile: Option<String>,
    pub pix_fmt: Option<String>,
    pub hdr: Option<String>,
    pub audio_codec: Option<String>,
    pub sample_rate: Option<f64>,
    pub channels: Option<u32>,
    pub channel_layout: Option<String>,
    pub subtitle_count: usize,
}

pub fn video_info(probe: &Probe, file_name: String, file_size: u64) -> VideoInfo {
    let v = probe.video();
    let a = probe.audio();
    let fps = v.and_then(|v| {
        v.avg_frame_rate
            .as_deref()
            .and_then(parse_rate)
            .or_else(|| v.r_frame_rate.as_deref().and_then(parse_rate))
    });
    let rotation = v.and_then(|v| {
        v.side_data_list
            .iter()
            .find_map(|s| s.rotation)
            .or_else(|| v.tag("rotate").and_then(|r| r.parse().ok()))
            .map(|r| r as i32)
            .filter(|r| *r != 0)
    });
    let hdr = v.and_then(|v| match v.color_transfer.as_deref() {
        Some("smpte2084") => Some("HDR10 / PQ".to_string()),
        Some("arib-std-b67") => Some("HLG".to_string()),
        _ => None,
    });
    let total_bitrate = probe.format.bit_rate.or_else(|| {
        let size = probe.format.size.unwrap_or(file_size as f64);
        probe.format.duration.filter(|d| *d > 0.0).map(|d| size * 8.0 / d)
    });
    VideoInfo {
        file_name,
        file_size,
        container: probe
            .format
            .format_long_name
            .clone()
            .unwrap_or_else(|| probe.format.format_name.clone()),
        duration: probe.format.duration,
        width: v.and_then(|v| v.width),
        height: v.and_then(|v| v.height),
        display_aspect_ratio: v
            .and_then(|v| v.display_aspect_ratio.clone())
            .filter(|r| r != "0:1" && r != "N/A"),
        rotation,
        fps,
        total_bitrate,
        video_bitrate: v.and_then(|v| v.bit_rate),
        audio_bitrate: a.and_then(|a| a.bit_rate),
        video_codec: v.map(|v| v.codec_long_name.clone().unwrap_or_else(|| v.codec_name.clone())),
        video_profile: v.and_then(|v| v.profile.clone()),
        pix_fmt: v.and_then(|v| v.pix_fmt.clone()),
        hdr,
        audio_codec: a.map(|a| a.codec_long_name.clone().unwrap_or_else(|| a.codec_name.clone())),
        sample_rate: a.and_then(|a| a.sample_rate),
        channels: a.and_then(|a| a.channels),
        channel_layout: a.and_then(|a| a.channel_layout.clone()),
        subtitle_count: probe.subtitles().count(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MKV: &str = r#"{
      "streams": [
        {"index":0,"codec_name":"h264","codec_long_name":"H.264 / AVC","profile":"High","codec_type":"video",
         "width":1920,"height":1080,"display_aspect_ratio":"16:9","pix_fmt":"yuv420p",
         "avg_frame_rate":"24000/1001","r_frame_rate":"24000/1001","disposition":{"default":1,"attached_pic":0}},
        {"index":1,"codec_name":"aac","codec_type":"audio","sample_rate":"48000","channels":2,
         "channel_layout":"stereo","bit_rate":"192000","disposition":{"default":1,"attached_pic":0},
         "tags":{"language":"jpn"}},
        {"index":2,"codec_name":"subrip","codec_type":"subtitle","disposition":{"default":0}}
      ],
      "format": {"format_name":"matroska,webm","format_long_name":"Matroska / WebM",
                 "duration":"1420.5","size":"1000000000","bit_rate":"5631820","tags":{"title":"Demo"}}
    }"#;

    #[test]
    fn parses_frame_rates() {
        assert!((parse_rate("24000/1001").unwrap() - 23.976).abs() < 0.001);
        assert_eq!(parse_rate("25/1"), Some(25.0));
        assert_eq!(parse_rate("0/0"), None);
        assert_eq!(parse_rate("30"), Some(30.0));
    }

    #[test]
    fn builds_video_info() {
        let p = Probe::parse(MKV).unwrap();
        let info = video_info(&p, "a.mkv".into(), 1_000_000_000);
        assert_eq!(info.width, Some(1920));
        assert_eq!(info.height, Some(1080));
        assert!((info.fps.unwrap() - 23.976).abs() < 0.001);
        assert_eq!(info.total_bitrate, Some(5631820.0));
        assert_eq!(info.audio_bitrate, Some(192000.0));
        assert_eq!(info.subtitle_count, 1);
        assert_eq!(info.container, "Matroska / WebM");
        assert_eq!(p.format_tag("TITLE"), Some("Demo"));
    }

    #[test]
    fn computes_bitrate_when_missing() {
        let json = r#"{"streams":[],"format":{"format_name":"avi","duration":"10","size":"1000"}}"#;
        let p = Probe::parse(json).unwrap();
        let info = video_info(&p, "x".into(), 1000);
        assert_eq!(info.total_bitrate, Some(800.0));
    }
}
