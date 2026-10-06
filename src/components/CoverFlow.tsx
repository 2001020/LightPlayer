// "Flow" player style: the play queue as a Cover Flow. The song playing sits
// in the middle; the wheel, dragging or the bar underneath browse the others.
// Clicking a side cover brings it to the middle, clicking the middle one (or
// double-clicking any) plays it. After a while the flow returns to the song
// playing.

import { useEffect, useMemo, useRef, useState } from "react";
import * as C from "../core/controller";
import { flowCoverSize, flowTransform } from "../core/flow";
import { trackArtist, trackTitle } from "../core/library/views";
import { ensureServerBase, isCloudPath, thumbUrl, type MediaEntry } from "../lib/ipc";
import { useLibrary } from "../stores/library";
import { usePlayer, usePlaylist, useUI } from "../stores/player";
import { Icon } from "./Icon";
import { CommentsChip } from "./CommentsPanel";
import { Slider } from "./Slider";

/** Covers drawn on each side of the centre. */
const RANGE = 8;
/** Back to the song playing after this long without browsing. */
const IDLE_RETURN = 4000;
/** Wheel distance per cover. */
const WHEEL_STEP = 60;

interface Info {
  title: string;
  artist: string;
  album: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function CoverFlow() {
  const queue = usePlaylist((s) => s.items);
  const index = usePlaylist((s) => s.index);
  const media = usePlayer((s) => s.media);
  const playing = usePlayer((s) => s.playing);
  const tracks = useLibrary((s) => s.data.tracks);
  const byPath = useMemo(() => new Map(tracks.map((t) => [t.path, t])), [tracks]);

  // A file opened on its own may not be in the queue.
  const items: MediaEntry[] = useMemo(() => {
    if (queue.length || !media) return queue;
    return [{ path: media.path, fileName: media.fileName, name: media.name, kind: media.kind, size: 0 }];
  }, [queue, media]);
  const current = clamp(index, 0, Math.max(0, items.length - 1));
  const last = Math.max(0, items.length - 1);

  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(260);
  const [pos, setPos] = useState(current);
  const [target, setTarget] = useState(current);
  /** Restarts the glide (also when the target stays the same, e.g. after a drag). */
  const [glide, setGlide] = useState(0);
  const posRef = useRef(current);
  const targetRef = useRef(current);
  const idle = useRef<number | null>(null);
  const dragged = useRef(false);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const [, setServer] = useState(false);

  useEffect(() => {
    void ensureServerBase()
      .then(() => setServer(true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(flowCoverSize(el.clientWidth, el.clientHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goTo = (t: number) => {
    targetRef.current = clamp(t, 0, last);
    setTarget(targetRef.current);
    setGlide((g) => g + 1);
  };

  /** The user is browsing: come back to the song playing later. */
  const browse = () => {
    if (idle.current !== null) clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      idle.current = null;
      goTo(usePlaylist.getState().index);
    }, IDLE_RETURN);
  };

  // A new song (or queue) brings the flow back to it.
  useEffect(() => {
    goTo(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, items.length]);

  useEffect(
    () => () => {
      if (idle.current !== null) clearTimeout(idle.current);
    },
    [],
  );

  // Glide towards the target.
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const diff = targetRef.current - posRef.current;
      if (Math.abs(diff) < 0.002) {
        posRef.current = targetRef.current;
        setPos(posRef.current);
        raf = 0;
        return;
      }
      posRef.current += diff * (1 - Math.exp(-dt * 11));
      setPos(posRef.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [glide]);

  // The wheel browses (horizontal or vertical scrolling alike).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      acc += e.deltaMode === 1 ? d * 30 : d;
      const steps = Math.trunc(acc / WHEEL_STEP);
      if (!steps) return;
      acc -= steps * WHEEL_STEP;
      goTo(Math.round(targetRef.current) + steps);
      browse();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  // Dragging sideways browses; release settles on the nearest cover.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const x0 = e.clientX;
    const p0 = posRef.current;
    const perCover = size * 0.42;
    let moved = false;
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 5) return;
      if (!moved) {
        moved = true;
        dragged.current = true;
        el.setPointerCapture(e.pointerId);
      }
      posRef.current = clamp(p0 - dx / perCover, 0, last);
      targetRef.current = posRef.current;
      setPos(posRef.current);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (!moved) return;
      browse();
      // Let the click that ends the drag pass first.
      window.setTimeout(() => (dragged.current = false), 0);
      goTo(Math.round(posRef.current));
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const centre = clamp(Math.round(pos), 0, last);
  const play = (i: number) => {
    if (i !== usePlaylist.getState().index) void C.playIndex(i);
  };
  const onCoverClick = (i: number) => {
    if (dragged.current) return;
    if (i !== Math.round(targetRef.current)) {
      goTo(i);
      browse();
    } else if (i === usePlaylist.getState().index) {
      useUI.setState({ page: "lyrics" });
    } else {
      play(i);
    }
  };

  const infoOf = (i: number): Info => {
    const e = items[i];
    if (!e) return { title: "", artist: "", album: "" };
    if (i === current && media?.path === e.path) {
      const m = media.meta ?? {};
      return { title: m.title || media.name, artist: m.artist ?? "", album: m.album ?? "" };
    }
    const t = byPath.get(e.path);
    if (t) return { title: trackTitle(t), artist: trackArtist(t), album: t.album?.trim() ?? "" };
    // Online songs: "artist - title" in the file name.
    const artist = isCloudPath(e.path) && e.fileName.endsWith(` - ${e.name}`) ? e.fileName.slice(0, -(e.name.length + 3)) : "";
    return { title: e.name, artist, album: "" };
  };

  const coverOf = (i: number): string | null => {
    const e = items[i];
    if (i === current && media?.path === e.path && media.meta?.cover) return media.meta.cover;
    return thumbUrl(e.path, 400);
  };

  const from = Math.max(0, Math.floor(pos) - RANGE);
  const to = Math.min(last, Math.ceil(pos) + RANGE);
  const shown: number[] = [];
  for (let i = from; i <= to; i++) shown.push(i);
  const info = infoOf(centre);
  const atCurrent = centre === current;

  return (
    <div className="flow" data-lp="flow" ref={root} style={{ "--flow-size": `${size}px` } as React.CSSProperties}>
      <div className="flow-stage" onPointerDown={onPointerDown}>
        {shown.map((i) => {
          const d = i - pos;
          const p = flowTransform(d, size);
          const url = coverOf(i);
          const fade = clamp(RANGE + 0.5 - Math.abs(d), 0, 1);
          return (
            <div
              key={items[i].path}
              className={`flow-cover ${i === current ? "now" : ""}`}
              style={{
                // Viewed from the stage's centre, as a `perspective` on the stage
                // would, but each cover drawn on its own.
                transform: `perspective(${size * 3.4}px) translate3d(${p.x}px, 0, ${p.z}px) rotateY(${p.rotate}deg)`,
                zIndex: p.zIndex,
                opacity: fade,
              }}
              onClick={() => onCoverClick(i)}
              onDoubleClick={() => play(i)}
            >
              {url && !broken.has(url) ? (
                <img
                  className="art"
                  src={url}
                  alt=""
                  draggable={false}
                  onError={() => setBroken((b) => new Set(b).add(url))}
                />
              ) : (
                <div className="art placeholder">
                  <Icon name={items[i].kind === "video" ? "film" : "music"} size={Math.round(size * 0.28)} />
                </div>
              )}
              {i === current && (
                <span className="flow-eq">
                  <span className={`eq ${playing ? "" : "paused"}`}>
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flow-info" data-lp="track-info">
        <div className="title" data-lp="track-title" data-lp-raw onClick={() => onCoverClick(centre)}>
          {info.title}
        </div>
        {info.artist && (
          <div className="artist" data-lp="track-artist" data-lp-raw>
            {info.artist}
          </div>
        )}
        {info.album && (
          <div className="album" data-lp="track-album" data-lp-raw>
            {info.album}
          </div>
        )}
        {atCurrent && (
          <div className="flow-chips" data-lp="chips">
            <CommentsChip />
          </div>
        )}
        <div className="flow-peek">
          {!atCurrent && (
            <div className="flow-hint">
              点击封面播放
              <span>
                第 {centre + 1} 首，共 {items.length} 首
              </span>
            </div>
          )}
        </div>
      </div>
      {items.length > 1 && (
        <div className="flow-bar">
          <Slider
            value={target}
            max={last}
            live
            onCommit={(v) => {
              goTo(Math.round(v));
              browse();
            }}
            format={(v) => `第 ${Math.round(v) + 1} 首`}
            ariaLabel="浏览播放列表"
          />
        </div>
      )}
    </div>
  );
}
