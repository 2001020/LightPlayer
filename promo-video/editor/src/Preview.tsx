// The live preview: the real composition in a Remotion Player, with the
// text being edited outlined on screen and click-to-edit on any text.

import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Texts } from "../../src/shared/texts";
import { HEIGHT, type VideoDef, WIDTH } from "../../src/videos";

export type PreviewHandle = { seek: (frame: number) => void; pause: () => void };

type Box = { x: number; y: number; w: number; h: number };

/** Opacity an element actually has on screen, through its ancestors. */
function shownOpacity(el: Element, stop: Element) {
  let o = 1;
  for (let e: Element | null = el; e && e !== stop; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return 0;
    o *= parseFloat(cs.opacity || "1");
    if (o < 0.04) return 0;
  }
  return o;
}

/** Tight box around an element's text, relative to `origin`. */
function textBox(el: Element, origin: DOMRect): Box | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
}

/** Visible text boxes for one path, or for every path when none is given. */
function findBoxes(stage: HTMLElement, origin: DOMRect, path?: string) {
  const sel = path ? `[data-tk="${CSS.escape(path)}"]` : "[data-tk]";
  const out: { path: string; box: Box }[] = [];
  for (const el of stage.querySelectorAll(sel)) {
    if (shownOpacity(el, stage) < 0.04) continue;
    const box = textBox(el, origin);
    if (box) out.push({ path: el.getAttribute("data-tk")!, box });
  }
  return out;
}

const fmt = (frames: number) => {
  const s = Math.max(0, frames) / 30;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

export const Preview = forwardRef<
  PreviewHandle,
  {
    video: VideoDef;
    /** Frame to show when a video is opened. */
    initialFrame: number;
    texts: Texts;
    active: string | null;
    labelOf: (path: string) => string | undefined;
    onPick: (path: string) => void;
  }
>(({ video, initialFrame, texts, active, labelOf, onPick }, ref) => {
  const player = useRef<PlayerRef>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(initialFrame);
  const [playing, setPlaying] = useState(false);
  const [activeBoxes, setActiveBoxes] = useState<Box[]>([]);
  const [hover, setHover] = useState<{ path: string; box: Box } | null>(null);
  const inputProps = useMemo(() => ({ texts, fps: 30 }), [texts]);

  useImperativeHandle(ref, () => ({
    seek: (f) => {
      player.current?.pause();
      player.current?.seekTo(f);
    },
    pause: () => player.current?.pause(),
  }));

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    setFrame(p.getCurrentFrame());
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
    };
  }, [video]);

  // Follow the edited text every animation frame: it moves while playing and
  // its size changes while typing.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const w = wrap.current;
      const stage = player.current?.getContainerNode();
      if (w && stage && active) {
        const next = findBoxes(stage, w.getBoundingClientRect(), active).map((b) => b.box);
        setActiveBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      } else {
        setActiveBoxes((prev) => (prev.length ? [] : prev));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  /** The smallest visible text under the pointer. */
  const hit = useCallback((x: number, y: number) => {
    const w = wrap.current;
    const stage = player.current?.getContainerNode();
    if (!w || !stage) return null;
    const origin = w.getBoundingClientRect();
    const px = x - origin.left;
    const py = y - origin.top;
    let best: { path: string; box: Box } | null = null;
    for (const b of findBoxes(stage, origin)) {
      const pad = 6;
      if (px < b.box.x - pad || px > b.box.x + b.box.w + pad || py < b.box.y - pad || py > b.box.y + b.box.h + pad) continue;
      if (!best || b.box.w * b.box.h < best.box.w * best.box.h) best = b;
    }
    return best;
  }, []);

  const seekAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const f = Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (video.duration - 1));
    player.current?.seekTo(f);
  };

  const sceneIndex = video.starts.findLastIndex((s) => frame >= s);

  return (
    <div className="preview">
      <div
        ref={wrap}
        className={`stage${hover && !playing ? " picking" : ""}`}
        onPointerMove={(e) => setHover(hit(e.clientX, e.clientY))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const h = hit(e.clientX, e.clientY);
          // Clicking beside a text should not start playback, so a miss only pauses.
          player.current?.pause();
          if (h) onPick(h.path);
        }}
      >
        <Player
          key={video.id}
          ref={player}
          component={video.Component}
          inputProps={inputProps}
          durationInFrames={video.duration}
          initialFrame={initialFrame}
          fps={30}
          compositionWidth={WIDTH}
          compositionHeight={HEIGHT}
          style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          acknowledgeRemotionLicense
          loop
        />
        <div className="overlay">
          {activeBoxes.map((b, i) => (
            <div key={i} className="hl active" style={{ left: b.x - 6, top: b.y - 4, width: b.w + 12, height: b.h + 8 }} />
          ))}
          {hover && !playing && hover.path !== active ? (
            <div className="hl hover" style={{ left: hover.box.x - 6, top: hover.box.y - 4, width: hover.box.w + 12, height: hover.box.h + 8 }}>
              <span className="hl-tag">{labelOf(hover.path) ?? hover.path} · 点击编辑</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="transport">
        <button
          className="icon-btn play"
          aria-label={playing ? "暂停" : "播放"}
          onClick={() => (playing ? player.current?.pause() : player.current?.play())}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className="time">
          {fmt(frame)} <span className="dim">/ {fmt(video.duration)}</span>
        </span>
        <div
          className="timeline"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            player.current?.pause();
            seekAt(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (e.buttons) seekAt(e.clientX, e.currentTarget);
          }}
        >
          {video.scenes.map((s, i) => (
            <div
              key={s.id}
              className={`seg${i === sceneIndex ? " on" : ""}`}
              style={{ left: `${(video.starts[i] / video.duration) * 100}%`, width: `${((s.duration - (i < video.scenes.length - 1 ? video.crossfade : 0)) / video.duration) * 100}%` }}
              title={s.label}
            >
              <span>{s.label}</span>
            </div>
          ))}
          <div className="playhead" style={{ left: `${(frame / Math.max(1, video.duration - 1)) * 100}%` }} />
        </div>
      </div>
    </div>
  );
});
Preview.displayName = "Preview";
