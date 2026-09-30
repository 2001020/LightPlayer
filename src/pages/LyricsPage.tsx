import { useEffect, useState } from "react";
import * as C from "../core/controller";
import { Icon } from "../components/Icon";
import { LyricsView } from "../components/LyricsView";
import { Waveform } from "../components/Waveform";
import { useLyrics, usePlayer, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";

const STAGES: Record<string, string> = {
  preparing: "准备中…",
  downloading: "正在下载识别模型…",
  decoding: "正在解码音频…",
  loading: "正在加载模型…",
  transcribing: "正在识别歌词…",
  finishing: "正在整理结果…",
};

function useWide() {
  const [wide, setWide] = useState(() => window.innerWidth >= 1100);
  useEffect(() => {
    const h = () => setWide(window.innerWidth >= 1100);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return wide;
}

export function AsrProgressCard() {
  const asr = useLyrics((s) => s.asr);
  if (!asr) return null;
  const indeterminate = asr.stage !== "transcribing" && asr.stage !== "downloading";
  return (
    <div className="asr-card panel">
      <div className="stage">
        <Icon name="sparkles" size={16} /> {STAGES[asr.stage]}
        {!indeterminate && <span className="muted"> {Math.round(asr.percent)}%</span>}
      </div>
      <div className={`progress-bar ${indeterminate ? "indeterminate" : ""}`}>
        <div style={{ width: `${asr.percent}%` }} />
      </div>
      <div className="note">识别在本机离线进行，不会上传任何音频。歌曲较长时可能需要一两分钟，可以继续听歌。</div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn small" onClick={C.cancelRecognition}>
          取消
        </button>
      </div>
    </div>
  );
}

export function LyricsPage() {
  const media = usePlayer((s) => s.media);
  const { status, lyrics, origin, model, asr } = useLyrics();
  const s = useSettings();
  const wide = useWide();
  const offset = media ? s.lyricOffsets[media.path] ?? 0 : 0;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !useUI.getState().overlay) useUI.setState({ page: "player" });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!media) return null;
  const meta = media.meta ?? {};
  const asrHere = asr && asr.mediaPath === media.path;
  const isAi = origin === "ai";
  const editLabel = status === "loaded" ? "编辑歌词" : "制作歌词";
  const nudge = (d: number) => s.setLyricOffset(media.path, offset + d);

  return (
    <div className="lyrics-page">
      <div className="lyrics-head">
        <div>
          <button className="btn ghost" onClick={() => useUI.setState({ page: "player" })} title="返回 (Esc)">
            <Icon name="chevronLeft" size={18} /> 返回
          </button>
        </div>
        <div className="who">
          {meta.cover ? <img src={meta.cover} alt="" /> : <div className="ph" />}
          <div style={{ minWidth: 0 }}>
            <div className="t">{meta.title || media.name}</div>
            {meta.artist && <div className="a">{meta.artist}</div>}
          </div>
        </div>
        <div className="tools">
          {status === "loaded" && lyrics?.synced && (
            <span className="offset-ctl" title="歌词整体偏移（快了点 +，慢了点 −）">
              <button className="icon-btn" onClick={() => nudge(-0.5)} title="歌词延后 0.5 秒">
                <Icon name="minus" size={16} />
              </button>
              {offset > 0 ? "+" : ""}
              {offset.toFixed(1)}s
              <button className="icon-btn" onClick={() => nudge(0.5)} title="歌词提前 0.5 秒">
                <Icon name="plus" size={16} />
              </button>
            </span>
          )}
          <button className="icon-btn" onClick={() => s.set({ lyricFontSize: Math.max(14, s.lyricFontSize - 2) })} title="缩小字号">
            <span style={{ fontSize: 12, fontWeight: 700 }}>A-</span>
          </button>
          <button className="icon-btn" onClick={() => s.set({ lyricFontSize: Math.min(40, s.lyricFontSize + 2) })} title="放大字号">
            <span style={{ fontSize: 15, fontWeight: 700 }}>A+</span>
          </button>
          <button className="icon-btn" onClick={C.importLyricsWithDialog} title="上传歌词文件">
            <Icon name="upload" />
          </button>
          <button className="icon-btn" onClick={() => useUI.setState({ overlay: "editor" })} title={editLabel}>
            <Icon name="edit" />
          </button>
          <button className="icon-btn" onClick={() => C.startRecognition()} disabled={!!asr} title="AI 识别歌词">
            <Icon name="sparkles" />
          </button>
        </div>
      </div>

      <div>
        {status === "loaded" && isAi && !asrHere && (
          <div className="banner">
            <Icon name="warning" size={16} />
            <span className="grow">本歌词由识别模型生成，可能有误{model ? `（${model}）` : ""}</span>
            <button className="btn small" onClick={() => useUI.setState({ overlay: "editor" })}>
              <Icon name="edit" size={14} /> 校对编辑
            </button>
          </div>
        )}
      </div>

      <div className="lyrics-body">
        <div className="wave-side">{wide && s.waveform && <Waveform side="left" style={s.waveformStyle} />}</div>
        <div style={{ minHeight: 0, minWidth: 0 }}>
          {asrHere ? (
            <div className="lyric-empty">
              <AsrProgressCard />
            </div>
          ) : status === "loading" ? (
            <div className="lyric-empty">
              <div className="spinner dark" />
            </div>
          ) : status === "loaded" && lyrics ? (
            <LyricsView
              lines={lyrics.lines}
              synced={lyrics.synced}
              offset={offset}
              fontSize={s.lyricFontSize}
              align={s.lyricAlign}
              showTranslation={s.showTranslation}
              karaoke={s.karaoke}
              onSeek={C.seek}
            />
          ) : (
            <div className="lyric-empty">
              <div className="box">
                <h2>暂无歌词</h2>
                <p>没有在歌曲所在目录找到同名歌词文件</p>
                <div className="actions">
                  <button className="btn" onClick={C.importLyricsWithDialog}>
                    <Icon name="upload" size={16} /> 上传歌词文件
                  </button>
                  <button className="btn" onClick={() => useUI.setState({ overlay: "editor" })}>
                    <Icon name="edit" size={16} /> 手动制作
                  </button>
                  <button className="btn primary" onClick={() => C.startRecognition()} disabled={!!asr}>
                    <Icon name="sparkles" size={16} /> AI 识别歌词
                  </button>
                </div>
                {asr && !asrHere && <p className="note">另一首歌曲正在识别中…</p>}
              </div>
            </div>
          )}
        </div>
        <div className="wave-side">{wide && s.waveform && <Waveform side="right" style={s.waveformStyle} />}</div>
      </div>
    </div>
  );
}
