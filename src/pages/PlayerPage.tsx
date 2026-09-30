import { useEffect, useRef } from "react";
import * as C from "../core/controller";
import { engine } from "../core/player/engine";
import { findActiveCue, findLineIndex } from "../core/lyrics/lrc";
import { Icon } from "../components/Icon";
import { PlaylistPanel } from "../components/PlaylistPanel";
import { basename } from "../lib/format";
import { useLyrics, usePlayer, useSubtitles, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";

const STRATEGY_LABEL: Record<string, string> = {
  direct: "",
  audioTranscode: "实时转换播放",
  hlsRemux: "转封装播放",
  hlsTranscode: "实时转码播放",
};

function EmptyState() {
  const recent = useSettings((s) => s.recent);
  return (
    <div className="empty">
      <div className="card panel">
        <div className="logo">
          <Icon name="play" size={34} />
        </div>
        <h1>LightPlayer</h1>
        <p>
          把音频或视频文件拖到窗口里，或点击下方按钮打开。
          <br />
          同一文件夹里的同类文件会自动加入播放列表。
        </p>
        <button className="btn primary large" onClick={C.openWithDialog}>
          <Icon name="folder" size={18} /> 打开文件 <kbd style={{ background: "transparent", color: "inherit" }}>⌘O</kbd>
        </button>
        {recent.length > 0 && (
          <div className="recent">
            <div className="label">最近播放</div>
            {recent.slice(0, 6).map((p) => (
              <div key={p} className="row" onClick={() => C.openFile(p)} title={p}>
                <Icon name="music" size={15} />
                <span>{basename(p)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LyricPeek() {
  const lyrics = useLyrics((s) => s.lyrics);
  const position = usePlayer((s) => s.position);
  const media = usePlayer((s) => s.media);
  const offset = useSettings((s) => (media ? s.lyricOffsets[media.path] ?? 0 : 0));
  if (!lyrics?.synced) return null;
  const i = findLineIndex(lyrics.lines, position + offset);
  const cur = lyrics.lines[i];
  const nxt = lyrics.lines[i + 1];
  return (
    <div className="lyric-peek" onClick={() => useUI.setState({ page: "lyrics" })}>
      {cur?.text || "♪"}
      {nxt && <span className="next">{nxt.text}</span>}
    </div>
  );
}

function AudioNowPlaying() {
  const media = usePlayer((s) => s.media)!;
  const playing = usePlayer((s) => s.playing);
  const origin = useLyrics((s) => s.origin);
  const status = useLyrics((s) => s.status);
  const meta = media.meta ?? {};
  const toLyrics = () => useUI.setState({ page: "lyrics" });
  const strat = STRATEGY_LABEL[media.strategy];
  return (
    <div className="now-playing">
      <div className={`cover ${playing ? "" : "paused"}`} onClick={toLyrics} title="查看歌词">
        {meta.cover ? (
          <img src={meta.cover} alt="" draggable={false} />
        ) : (
          <div className="placeholder">
            <Icon name="music" size={96} />
          </div>
        )}
        <div className="hint">点击查看歌词</div>
      </div>
      <div className="track-info">
        <div className="title" onClick={toLyrics} title="查看歌词">
          {meta.title || media.name}
        </div>
        {meta.artist && <div className="artist">{meta.artist}</div>}
        {meta.album && <div className="album">{meta.album}</div>}
        <div className="chips">
          <span className="chip">{media.fileName.split(".").pop()?.toUpperCase()}</span>
          {strat && <span className="chip accent">{strat}</span>}
          {status === "loaded" && origin === "ai" && <span className="chip">AI 歌词</span>}
          {status === "loaded" && origin === "ai_reviewed" && <span className="chip">AI 歌词 · 已校对</span>}
        </div>
        <LyricPeek />
      </div>
    </div>
  );
}

function SubtitleOverlay() {
  const cues = useSubtitles((s) => s.cues);
  const position = usePlayer((s) => s.position);
  if (!cues) return null;
  const cue = findActiveCue(cues.lines, position);
  if (!cue) return null;
  return (
    <div className="subtitle-overlay">
      <span>{cue.text}</span>
      {cue.translation && <span className="sub2">{cue.translation}</span>}
    </div>
  );
}

function VideoStage() {
  const host = useRef<HTMLDivElement>(null);
  const waiting = usePlayer((s) => s.waiting || s.loading);
  const media = usePlayer((s) => s.media)!;
  useEffect(() => {
    const el = engine.video;
    host.current?.appendChild(el);
  }, []);
  const strat = STRATEGY_LABEL[media.strategy];
  return (
    <div className="video-stage" onDoubleClick={() => import("../components/TransportBar").then((m) => m.toggleFullscreen())}>
      <div className="video-host" ref={host} onClick={() => C.toggle()} />
      <SubtitleOverlay />
      {strat && <div className="video-badge">{strat}</div>}
      {waiting && (
        <div className="video-loading">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}

export function PlayerPage() {
  const media = usePlayer((s) => s.media);
  const loading = usePlayer((s) => s.loading);
  const playlistOpen = useUI((s) => s.playlistOpen);
  return (
    <div className="player-page" style={!playlistOpen || !media ? { gridTemplateColumns: "1fr" } : undefined}>
      <div className="stage">
        {!media && !loading && <EmptyState />}
        {!media && loading && (
          <div className="empty">
            <div className="spinner dark" />
          </div>
        )}
        {media?.kind === "audio" && <AudioNowPlaying />}
        {media?.kind === "video" && <VideoStage />}
      </div>
      {media && playlistOpen && <PlaylistPanel />}
    </div>
  );
}
