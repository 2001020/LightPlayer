import { useEffect, useRef, type MouseEvent } from "react";
import * as C from "../core/controller";
import { engine } from "../core/player/engine";
import { findActiveCue } from "../core/lyrics/lrc";
import { Icon } from "../components/Icon";
import { PlaylistPanel, togglePlaylist, usePlaylistLayout, usePlaylistShown } from "../components/PlaylistPanel";
import { tip } from "../components/Tooltip";
import { toggleFullscreen } from "../components/TransportBar";
import { CoverFlow } from "../components/CoverFlow";
import { LyricPeek, STRATEGY_LABEL, TrackChips } from "../components/NowPlayingParts";
import { basename } from "../lib/format";
import { usePlayer, useSubtitles, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { keys } from "../lib/platform";
import { FreeLayout } from "../layout/FreeLayout";
import { LayoutEditor, LayoutMenu } from "../layout/LayoutEditor";
import { useActiveLayout, useLayouts } from "../stores/layout";

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
        <div className="empty-actions">
          <button className="btn primary large" onClick={C.openWithDialog}>
            <Icon name="folder" size={18} /> 打开文件 <kbd style={{ background: "transparent", color: "inherit" }}>{keys("⌘O")}</kbd>
          </button>
          <button className="btn large" onClick={() => useUI.setState({ page: "library" })}>
            <Icon name="library" size={18} /> 媒体库 <kbd style={{ background: "transparent", color: "inherit" }}>{keys("⌘L")}</kbd>
          </button>
        </div>
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

function AudioNowPlaying() {
  const media = usePlayer((s) => s.media)!;
  const playing = usePlayer((s) => s.playing);
  const meta = media.meta ?? {};
  const toLyrics = () => useUI.setState({ page: "lyrics" });
  return (
    <div className="now-playing" data-lp="now-playing">
      <div className={`cover ${playing ? "" : "paused"}`} data-lp="cover" onClick={toLyrics}>
        {meta.cover ? (
          <img src={meta.cover} alt="" draggable={false} />
        ) : (
          <div className="placeholder">
            <Icon name="music" size={72} />
          </div>
        )}
        <div className="hint">点击查看歌词</div>
      </div>
      <div className="track-info" data-lp="track-info">
        <div className="title" data-lp="track-title" data-lp-raw onClick={toLyrics} {...tip("查看歌词", "Y")}>
          {meta.title || media.name}
        </div>
        {meta.artist && (
          <div className="artist" data-lp="track-artist" data-lp-raw>
            {meta.artist}
          </div>
        )}
        {meta.album && (
          <div className="album" data-lp="track-album" data-lp-raw>
            {meta.album}
          </div>
        )}
        <TrackChips />
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
    <div className="subtitle-overlay" data-lp="subtitles" data-lp-raw>
      <span>{cue.text}</span>
      {cue.translation && <span className="sub2">{cue.translation}</span>}
    </div>
  );
}

function VideoStage() {
  const host = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);
  const waiting = usePlayer((s) => s.waiting || s.loading);
  const media = usePlayer((s) => s.media)!;
  useEffect(() => {
    const el = engine.video;
    host.current?.appendChild(el);
    return () => {
      if (clickTimer.current !== null) clearTimeout(clickTimer.current);
    };
  }, []);
  const strat = STRATEGY_LABEL[media.strategy];
  // A single click toggles playback, a double click toggles fullscreen. The
  // single click waits briefly so a double click doesn't pause and resume.
  const onClick = (e: MouseEvent) => {
    if (e.detail > 1) return;
    if (clickTimer.current !== null) clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      C.toggle();
    }, 220);
  };
  const onDoubleClick = () => {
    if (clickTimer.current !== null) clearTimeout(clickTimer.current);
    clickTimer.current = null;
    void toggleFullscreen();
  };
  return (
    <div className="video-stage" data-lp="video" onDoubleClick={onDoubleClick}>
      <div className="video-host" ref={host} onClick={onClick} />
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

function BackButton() {
  return (
    <button className="btn ghost back-btn" onClick={() => useUI.setState({ page: "library" })} {...tip("返回媒体库", "⌘L")}>
      <Icon name="chevronLeft" size={18} /> 返回
    </button>
  );
}

function StyleToggle() {
  const style = useSettings((s) => s.playerStyle);
  const flow = style === "flow";
  return (
    <button
      className="btn ghost style-toggle"
      onClick={() => useSettings.getState().set({ playerStyle: flow ? "classic" : "flow" })}
      {...tip(flow ? "切换到经典样式" : "切换到 Flow 样式（封面墙）")}
    >
      <Icon name={flow ? "music" : "flow"} size={17} /> {flow ? "经典" : "Flow"}
    </button>
  );
}

function PlaylistHandle() {
  return (
    <button
      className="playlist-handle"
      onClick={() => togglePlaylist(true)}
      {...tip("显示播放列表")}
    >
      <Icon name="chevronLeft" size={16} />
      <span>列</span>
      <span>表</span>
    </button>
  );
}

export function PlayerPage() {
  const media = usePlayer((s) => s.media);
  const loading = usePlayer((s) => s.loading);
  const layout = usePlaylistLayout();
  const shown = usePlaylistShown();
  const showList = !!media && shown && layout === "side";
  const style = useSettings((s) => s.playerStyle);
  const free = useActiveLayout();
  const audio = media?.kind === "audio";
  const editing = useLayouts((s) => !!s.draft) && audio && style !== "flow";
  return (
    <div className={`player-page ${showList ? "with-list" : ""}`} data-lp="player">
      <div className={`stage ${media?.kind === "video" ? "is-video" : ""} ${editing ? "layout-editing" : ""}`}>
        {!editing && <BackButton />}
        {!media && !loading && <EmptyState />}
        {!media && loading && (
          <div className="empty">
            <div className="spinner dark" />
          </div>
        )}
        {audio && !editing && (
          <div className="stage-tools">
            {style !== "flow" && <LayoutMenu />}
            <StyleToggle />
          </div>
        )}
        {audio && (style === "flow" ? <CoverFlow peek={<LyricPeek />} /> : free.classic ? <AudioNowPlaying /> : <FreeLayout layout={free} editing={editing} />)}
        {editing && <LayoutEditor />}
        {media?.kind === "video" && <VideoStage />}
        {media && !shown && <PlaylistHandle />}
      </div>
      {showList && <PlaylistPanel />}
    </div>
  );
}
