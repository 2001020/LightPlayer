// The player page in the archive theme: the 3D field (drawn by the
// background) takes the whole window. On it: three lines of lyrics at the top left, the
// song chosen in the field, and the playing song with a few controls at the
// bottom left (the play bar is not shown in this view).

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as C from "../../core/controller";
import { formatTime } from "../../lib/format";
import { ensureServerBase, isCloudPath, isTauri, previewCover, thumbUrl } from "../../lib/ipc";
import { findLineIndex, spokenLines } from "../../core/lyrics/lrc";
import { useLyrics, usePlayer, usePlaylist, useUI } from "../../stores/player";
import { useSettings } from "../../stores/settings";
import { Icon } from "../Icon";
import { KaraokeWords } from "../LyricsView";
import { Slider } from "../Slider";
import { tip } from "../Tooltip";
import { toggleComments } from "../CommentsPanel";
import { MODE_META, RateMenu, Volume } from "../TransportBar";
import { useArchive } from "./ArchiveBackground";
import type { CoverUrl } from "./scene";
import { useSongInfo } from "./songInfo";

/** Wheel distance (px) for one box. */
const WHEEL_STEP = 60;
/** Without input for this long, the field goes back to the playing song. */
const IDLE_RETURN = 5000;

/** Covers from the media server; made-up ones in the browser preview. */
const coverUrl: CoverUrl = (path, size) => thumbUrl(path, size) ?? (isTauri ? null : previewCover(path));

/** Text and controls laid over the field, which take the pointer from it. */
const overUi = (e: { target: EventTarget }) => !!(e.target as Element).closest?.(".archive-now");

/** A title whose letters roll into place whenever it changes. */
function RollText({ text }: { text: string }) {
  return (
    <span className="roll" key={text} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ animationDelay: `${Math.min(i, 40) * 22}ms` }}>
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </span>
  );
}

/** The line being sung with the one before and after it; only shown, not clickable. */
function ArchiveLyrics() {
  const media = usePlayer((s) => s.media);
  const position = usePlayer((s) => s.position);
  const status = useLyrics((s) => s.status);
  const lyrics = useLyrics((s) => s.lyrics);
  const offset = useSettings((s) => (media ? s.lyricOffsets[media.path] ?? 0 : 0));
  const showTranslation = useSettings((s) => s.showTranslation);
  const karaoke = useSettings((s) => s.karaoke);
  const said = useMemo(() => (lyrics?.synced ? spokenLines(lyrics.lines) : []), [lyrics]);
  if (!media || status !== "loaded" || !said.length) return null;
  const i = findLineIndex(said, position + offset);
  return (
    <div className="archive-lyrics" data-lp="archive-lyrics" data-lp-raw>
      {[i - 1, i, i + 1].map((k) => {
        const l = said[k];
        const active = k === i;
        // Keyed by line, so a line keeps its element as it moves up a place.
        return (
          <div
            key={k}
            data-lp="lyric-line"
            data-active={active ? "" : undefined}
            className={`lyric-line ${active ? "active" : ""} ${active && karaoke && l?.words?.length ? "karaoke" : ""}`}
          >
            {!l ? "\u00a0" : active && karaoke && l.words?.length ? <KaraokeWords line={l} offset={offset} /> : l.text || "\u00a0"}
            {showTranslation && l?.translation && (
              <span className="tr" data-lp="lyric-translation">
                {l.translation}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Controls({ away, onBack }: { away: boolean; onBack: () => void }) {
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const cloud = usePlayer((s) => isCloudPath(s.media?.path));
  const commentsOpen = useUI((s) => s.commentsOpen);
  const mode = usePlaylist((s) => s.mode);
  const count = usePlaylist((s) => s.items.length);
  const m = MODE_META[mode];
  return (
    <div className="archive-controls" data-lp="archive-controls">
      <button className="icon-btn" onClick={C.cycleMode} {...tip(`${m.label}（点击切换）`)}>
        <Icon name={m.icon} />
      </button>
      <button className="icon-btn" onClick={() => C.prev()} disabled={!count} {...tip("上一曲", "⌘←")}>
        <Icon name="prev" />
      </button>
      <button className="icon-btn play-btn" onClick={C.toggle} {...tip(playing ? "暂停" : "播放", "空格")}>
        {loading ? <div className="spinner dark" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <Icon name={playing ? "pause" : "play"} size={22} />}
      </button>
      <button className="icon-btn" onClick={() => C.next()} disabled={!count} {...tip("下一曲", "⌘→")}>
        <Icon name="next" />
      </button>
      {cloud && (
        <button className={`icon-btn ${commentsOpen ? "active" : ""}`} onClick={() => toggleComments()} {...tip(commentsOpen ? "收起评论" : "网易云评论", "C")}>
          <Icon name="comment" />
        </button>
      )}
      <RateMenu />
      <Volume />
      <button className="icon-btn archive-back" onClick={onBack} disabled={!away} {...tip("回到当前歌曲")}>
        <Icon name="target" />
      </button>
    </div>
  );
}

function NowPlaying({ away, onBack }: { away: boolean; onBack: () => void }) {
  const items = usePlaylist((s) => s.items);
  const index = usePlaylist((s) => s.index);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const info = useSongInfo(items[index]);
  if (!info) return null;
  const total = duration || info.duration;
  return (
    <div className="archive-now" data-lp="archive-now">
      <div className="archive-caption">正在播放</div>
      <div className="archive-now-title" data-lp-raw>
        <RollText text={info.title} />
      </div>
      {info.artist && (
        <div className="archive-now-artist" data-lp-raw>
          {info.artist}
        </div>
      )}
      <div className="archive-now-progress">
        <span>{formatTime(position)}</span>
        <Slider value={position} max={duration} onCommit={(v) => C.seek(v)} format={formatTime} ariaLabel="播放进度" />
        <span>{total ? formatTime(total) : "--:--"}</span>
      </div>
      <Controls away={away} onBack={onBack} />
    </div>
  );
}

function Selected({ index }: { index: number }) {
  const entry = usePlaylist((s) => s.items[index]);
  const info = useSongInfo(entry);
  if (!info) return null;
  return (
    <div className="archive-selected" data-lp="archive-selected">
      <div className="archive-caption">选中</div>
      <h2 className="archive-title" data-lp-raw>
        <RollText text={info.title} />
      </h2>
      <div className="archive-rule" />
      <div className="archive-meta">
        <span data-lp-raw>{info.artist || "—"}</span>
        <span>{info.duration ? formatTime(info.duration) : "--:--"}</span>
      </div>
    </div>
  );
}

export function ArchiveView() {
  const scene = useArchive((s) => s.scene);
  const failed = useArchive((s) => s.failed);
  const hover = useArchive((s) => s.hover);
  const chosen = useArchive((s) => s.chosen);
  const items = usePlaylist((s) => s.items);
  const index = usePlaylist((s) => s.index);
  const hasMedia = usePlayer((s) => !!s.media);
  const wheel = useRef(0);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const lastInput = useRef(Date.now());
  const [serverReady, setServerReady] = useState(!isTauri);
  const songs = useMemo(() => items.map((e) => ({ path: e.path, name: e.name })), [items]);

  useEffect(() => {
    void ensureServerBase().finally(() => setServerReady(true));
  }, []);

  // The field holds the playlist and brings the playing song forward.
  useEffect(() => {
    if (!scene || !serverReady) return;
    scene.setPlaylist(songs, coverUrl);
    if (scene.chosenSong < 0) scene.choose(Math.max(0, usePlaylist.getState().index), false);
  }, [scene, serverReady, songs]);
  useEffect(() => {
    if (scene && index >= 0) scene.choose(index);
  }, [scene, index]);

  const backToPlaying = () => {
    const playing = usePlaylist.getState().index;
    if (!scene || playing < 0) return;
    scene.choose(playing);
    // Show the playing song, not the box that is now under a resting pointer.
    scene.setPointer(null);
    useArchive.setState({ hover: null });
  };

  // Left alone for a while, the field goes back to the playing song.
  useEffect(() => {
    if (!scene) return;
    const id = window.setInterval(() => {
      const playing = usePlaylist.getState().index;
      if (playing < 0 || drag.current || scene.moving || Date.now() - lastInput.current < IDLE_RETURN) return;
      if (scene.chosenSong !== playing || useArchive.getState().hover !== null) backToPlaying();
    }, 1000);
    return () => clearInterval(id);
    // backToPlaying only reads the scene and the stores.
  }, [scene]);

  const step = (lanes: number, rows: number) => scene?.step(lanes, rows);

  const onPointerMove = (e: ReactPointerEvent) => {
    lastInput.current = Date.now();
    const d = drag.current;
    if (!d && overUi(e)) {
      scene?.setPointer(null);
      return;
    }
    scene?.setPointer({ x: e.clientX, y: e.clientY });
    if (!d || !scene) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    if (!d.moved) {
      d.moved = true;
      setGrabbing(true);
      scene.grab();
    }
    // The field follows the pointer in any direction.
    scene.panBy(dx, dy);
    d.x = e.clientX;
    d.y = e.clientY;
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    lastInput.current = Date.now();
    const d = drag.current;
    drag.current = null;
    setGrabbing(false);
    if (!scene || !d) return;
    if (d.moved) {
      scene.release();
      return;
    }
    if (e.button !== 0) return;
    const song = scene.songAt(e.clientX, e.clientY);
    if (song < 0) return;
    scene.choose(song);
    if (song === usePlaylist.getState().index && usePlayer.getState().media) C.play();
    else void C.playIndex(song);
  };

  const onWheel = (e: React.WheelEvent) => {
    lastInput.current = Date.now();
    if (overUi(e)) return;
    const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    wheel.current += sideways ? e.deltaX || e.deltaY : e.deltaY;
    while (Math.abs(wheel.current) >= WHEEL_STEP) {
      const dir = Math.sign(wheel.current);
      wheel.current -= dir * WHEEL_STEP;
      if (sideways) step(dir, 0);
      else step(0, dir);
    }
  };

  const shown = hover ?? chosen;
  return (
    <div
      className={`archive-view ${hover !== null ? "pointing" : ""} ${grabbing ? "grabbing" : ""}`}
      data-lp="archive"
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        scene?.setPointer(null);
        if (drag.current?.moved) scene?.release();
        drag.current = null;
        setGrabbing(false);
      }}
      onPointerDown={(e) => {
        lastInput.current = Date.now();
        if (e.button === 0 && !overUi(e)) drag.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      <ArchiveLyrics />
      {items.length > 0 && shown >= 0 && shown < items.length && <Selected index={shown} />}
      {hasMedia && items.length > 0 && <NowPlaying away={chosen !== index} onBack={backToPlaying} />}
      {!items.length && <div className="archive-hint">{failed ? "这台电脑不能显示三维档案阵列" : "打开或拖入音频文件"}</div>}
    </div>
  );
}
