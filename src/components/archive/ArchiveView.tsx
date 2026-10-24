// The player page in the archive theme: the 3D field (drawn by the
// background) takes the whole window. Only two things are written on it: the
// song that is playing and the song chosen in the field.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as C from "../../core/controller";
import { formatTime } from "../../lib/format";
import { usePlayer, usePlaylist } from "../../stores/player";
import { useArchive } from "./ArchiveBackground";
import { useSongInfo } from "./songInfo";

/** Wheel distance (px) for one box. */
const WHEEL_STEP = 60;
/** Drag distance (px) for one column / one box. */
const DRAG_LANE = 110;
const DRAG_ROW = 34;

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

function NowPlaying() {
  const items = usePlaylist((s) => s.items);
  const index = usePlaylist((s) => s.index);
  const position = usePlayer((s) => s.position);
  const info = useSongInfo(items[index]);
  if (!info) return null;
  const pct = info.duration ? Math.min(100, (position / info.duration) * 100) : 0;
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
        <div className="archive-line">
          <i style={{ width: `${pct}%` }} />
        </div>
        <span>{info.duration ? formatTime(info.duration) : "--:--"}</span>
      </div>
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

  // The field holds the playlist and brings the playing song forward.
  useEffect(() => {
    if (!scene) return;
    scene.setPlaylist(items.length);
    if (useArchive.getState().chosen < 0 || useArchive.getState().chosen >= items.length) {
      scene.choose(Math.max(0, index), false);
      useArchive.setState({ chosen: scene.chosenSong });
    }
  }, [scene, items.length, index]);
  useEffect(() => {
    if (!scene || index < 0) return;
    scene.choose(index);
    useArchive.setState({ chosen: scene.chosenSong });
  }, [scene, index]);

  const step = (lanes: number, rows: number) => {
    if (!scene) return;
    useArchive.setState({ chosen: scene.step(lanes, rows) });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    scene?.setPointer({ x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    if (!d.moved) setGrabbing(true);
    d.moved = true;
    // Dragging carries the field: right brings the column on the left forward.
    if (Math.abs(dx) >= DRAG_LANE) {
      step(-Math.sign(dx), 0);
      d.x = e.clientX;
    } else if (Math.abs(dy) >= DRAG_ROW) {
      step(0, -Math.sign(dy));
      d.y = e.clientY;
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGrabbing(false);
    if (!scene || !d || d.moved || e.button !== 0) return;
    const song = scene.songAt(e.clientX, e.clientY);
    if (song < 0) return;
    scene.choose(song);
    useArchive.setState({ chosen: scene.chosenSong });
    if (song === usePlaylist.getState().index && usePlayer.getState().media) C.play();
    else void C.playIndex(song);
  };

  const onWheel = (e: React.WheelEvent) => {
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
        drag.current = null;
        setGrabbing(false);
      }}
      onPointerDown={(e) => {
        if (e.button === 0) drag.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      {items.length > 0 && shown >= 0 && shown < items.length && <Selected index={shown} />}
      {hasMedia && items.length > 0 && <NowPlaying />}
      {!items.length && <div className="archive-hint">{failed ? "这台电脑不能显示三维档案阵列" : "打开或拖入音频文件"}</div>}
    </div>
  );
}
