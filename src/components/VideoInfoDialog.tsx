import { useEffect, useState } from "react";
import { api, type VideoInfo } from "../lib/ipc";
import { formatBitrate, formatBytes, formatTime } from "../lib/format";
import { usePlayer, useUI } from "../stores/player";
import { Icon } from "./Icon";

const STRATEGY: Record<string, string> = {
  direct: "原生直接播放",
  audioTranscode: "音频实时转换",
  hlsRemux: "转封装（无损，保留原视频流）",
  hlsTranscode: "实时硬件转码（H.264）",
};

export function VideoInfoDialog() {
  const media = usePlayer((s) => s.media);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!media) return;
    api.getVideoInfo(media.path).then(setInfo, (e) => setErr(String(e)));
  }, [media]);
  const close = () => useUI.setState({ overlay: null });
  useEffect(() => {
    const h = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "i" || e.key === "I") && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  if (!media) return null;
  const res = info?.width && info?.height ? `${info.width} × ${info.height}` : "—";
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog">
        <header>
          <h2>视频详细信息</h2>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="body">
          {err && <p className="toast error">{err}</p>}
          {!info && !err && <div className="spinner dark" style={{ margin: "30px auto" }} />}
          {info && (
            <dl className="kv">
              <div className="section">文件</div>
              <dt>文件名</dt>
              <dd>{info.fileName}</dd>
              <dt>文件大小</dt>
              <dd>
                {formatBytes(info.fileSize)} <span className="muted">（{info.fileSize.toLocaleString()} 字节）</span>
              </dd>
              <dt>容器格式</dt>
              <dd>{info.container}</dd>
              <dt>时长</dt>
              <dd>{formatTime(info.duration)}</dd>
              <dt>总码率</dt>
              <dd>{formatBitrate(info.totalBitrate)}</dd>
              <dt>播放方式</dt>
              <dd>{STRATEGY[media.strategy]}</dd>

              <div className="section">视频</div>
              <dt>分辨率</dt>
              <dd>
                {res}
                {info.displayAspectRatio && <span className="muted">（{info.displayAspectRatio}）</span>}
                {info.rotation ? <span className="muted">（旋转 {info.rotation}°）</span> : null}
              </dd>
              <dt>帧率</dt>
              <dd>{info.fps ? `${info.fps.toFixed(info.fps % 1 ? 3 : 0)} fps` : "—"}</dd>
              <dt>视频码率</dt>
              <dd>{formatBitrate(info.videoBitrate)}</dd>
              <dt>编码</dt>
              <dd>
                {info.videoCodec ?? "—"}
                {info.videoProfile && <span className="muted">（{info.videoProfile}）</span>}
              </dd>
              <dt>像素格式</dt>
              <dd>
                {info.pixFmt ?? "—"}
                {info.hdr && <span className="chip accent" style={{ marginLeft: 6 }}>{info.hdr}</span>}
              </dd>

              <div className="section">音频</div>
              <dt>编码</dt>
              <dd>{info.audioCodec ?? "无音轨"}</dd>
              <dt>音频码率</dt>
              <dd>{formatBitrate(info.audioBitrate)}</dd>
              <dt>采样率</dt>
              <dd>{info.sampleRate ? `${(info.sampleRate / 1000).toFixed(1)} kHz` : "—"}</dd>
              <dt>声道</dt>
              <dd>
                {info.channels ?? "—"}
                {info.channelLayout && <span className="muted">（{info.channelLayout}）</span>}
              </dd>
              <dt>字幕轨</dt>
              <dd>{info.subtitleCount}</dd>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
