// Renders a free player layout, and in the editor lets elements be dragged,
// resized and selected.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import * as C from "../core/controller";
import { Icon } from "../components/Icon";
import { LyricPeek, SAMPLE_TRACK, TrackChips, usePlaying, useProgress, useTrack } from "../components/NowPlayingParts";
import { tip } from "../components/Tooltip";
import { ensureServerBase, layoutImageUrl } from "../lib/ipc";
import { useUI } from "../stores/player";
import { selectElement, updateElement, useLayouts } from "../stores/layout";
import {
  defaultElement,
  fillTemplate,
  fontFamily,
  formatClock,
  formatTimeEl,
  round1,
  snap,
  snapAngle,
  usesClock,
  usesPosition,
  type CoverStyle,
  type LayoutElement,
  type PlayerLayout,
} from "./model";

/** Stage size in px; 1u is 1% of the shorter side. */
function useStageSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** The current time, updated every `ms`. */
function useNow(ms: number, on: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms, on]);
  return now;
}

const toLyrics = () => useUI.setState({ page: "lyrics" });

// ------------------------------------------------------------------ cover

/** The record player's arm: rests beside the record, swings onto it while playing. */
function Tonearm() {
  return (
    <svg className="tonearm" data-lp="tonearm" viewBox="0 0 100 100" aria-hidden>
      <g className="arm">
        <rect className="weight" x="45.5" y="-21" width="8" height="6.5" rx="1.4" transform="rotate(45 49.5 -17.75)" />
        <path className="tube" d="M55 -13 C 60 -8, 66 -2, 70.5 4.5 S 75 12, 76 14" />
        <g transform="translate(77.2 16.6) rotate(-36)">
          <rect className="head" x="-3.6" y="-2.6" width="7.2" height="9" rx="1" />
          <line className="slot" x1="-1.6" y1="0.2" x2="-1.6" y2="4.6" />
          <line className="slot" x1="1.6" y1="0.2" x2="1.6" y2="4.6" />
        </g>
        <circle className="pivot" cx="55" cy="-13" r="4.2" />
        <circle className="pivot-cap" cx="55" cy="-13" r="1.6" />
      </g>
    </svg>
  );
}

function CoverArt({ src }: { src?: string | null }) {
  return src ? (
    <img src={src} alt="" draggable={false} />
  ) : (
    <div className="placeholder">
      <Icon name="music" size={64} />
    </div>
  );
}

function Vinyl({ c, src, playing, onClick }: { c: CoverStyle; src?: string | null; playing: boolean; onClick?: () => void }) {
  const style = { "--spin": `${c.speed}s`, "--label": `${c.label}%` } as CSSProperties;
  const cls = ["vinyl", playing ? "playing" : "", c.spin ? "spin" : "", c.grooves ? "grooves" : "", c.shadow ? "shadow" : ""].join(" ");
  return (
    <div className={cls} data-lp="vinyl" style={style} onClick={onClick} {...(onClick ? tip("查看歌词", "Y") : {})}>
      <div className="vinyl-disc" />
      <div className="vinyl-sheen" />
      <div className="vinyl-label" data-lp="cover">
        <CoverArt src={src} />
        <i className="vinyl-hole" />
      </div>
      {c.arm && <Tonearm />}
    </div>
  );
}

function Cover({ e, editing }: { e: LayoutElement; editing: boolean }) {
  const playing = usePlaying();
  const src = useTrack()?.meta?.cover;
  const c = e.cover!;
  const click = editing ? undefined : toLyrics;
  if (c.shape === "vinyl") return <Vinyl c={c} src={src} playing={playing} onClick={click} />;
  return (
    <div
      className={`cover fl-square ${playing ? "" : "paused"}`}
      data-lp="cover"
      style={{ borderRadius: `${c.radius}%`, boxShadow: c.shadow ? undefined : "none" }}
      onClick={click}
    >
      <CoverArt src={src} />
      {!editing && <div className="hint">点击查看歌词</div>}
    </div>
  );
}

// ------------------------------------------------------------------ others

function Progress({ e, editing }: { e: LayoutElement; editing: boolean }) {
  const { position, duration } = useProgress();
  const p = e.progress!;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const color = p.color ?? undefined;
  if (p.style === "ring") {
    const sw = Math.min(40, (p.thickness / e.w) * 100);
    const r = 50 - sw / 2;
    return (
      <svg className="fl-ring" viewBox="0 0 100 100">
        <circle className="track" cx="50" cy="50" r={r} strokeWidth={sw} />
        <circle className="fill" cx="50" cy="50" r={r} strokeWidth={sw} pathLength={100} strokeDasharray={`${pct} 100`} style={{ stroke: color }} />
      </svg>
    );
  }
  const seek = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (editing || duration <= 0) return;
    const r = ev.currentTarget.getBoundingClientRect();
    C.seek(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * duration);
  };
  return (
    <div className="fl-bar" style={{ height: `calc(var(--u) * ${p.thickness})` }} onClick={seek}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function TextEl({ e }: { e: LayoutElement }) {
  const media = useTrack();
  const content = e.content ?? "";
  const { position, duration } = useProgress(true, usesPosition(content));
  const now = useNow(1000, usesClock(content));
  const meta = media?.meta ?? {};
  const text = fillTemplate(content, {
    title: meta.title || media?.name || "",
    artist: meta.artist ?? "",
    album: meta.album ?? "",
    position,
    duration,
    now,
  });
  return <div className="fl-text" data-lp-raw>{text}</div>;
}

function Clock({ e }: { e: LayoutElement }) {
  const f = e.clock ?? "HH:mm";
  const now = useNow(f === "HH:mm:ss" ? 250 : 1000, true);
  return <div className="fl-clock">{formatClock(now, f)}</div>;
}

function Time({ e }: { e: LayoutElement }) {
  const { position, duration } = useProgress(true);
  return <div className="fl-time">{formatTimeEl(e.time ?? "both", position, duration)}</div>;
}

function Picture({ e, editing }: { e: LayoutElement; editing: boolean }) {
  const [, ready] = useState(0);
  useEffect(() => {
    void ensureServerBase().then(() => ready((n) => n + 1));
  }, []);
  const url = e.src ? layoutImageUrl(e.src) : null;
  if (!url) return editing ? <div className="fl-image-empty">选择图片</div> : null;
  return <img className="fl-image" src={url} alt="" draggable={false} style={{ borderRadius: `${e.radius ?? 0}%` }} />;
}

function Content({ e, editing }: { e: LayoutElement; editing: boolean }) {
  const media = useTrack();
  const meta = media?.meta ?? {};
  // The song's own text is left untranslated; the sample's and placeholders are UI text.
  const isSample = media === SAMPLE_TRACK;
  const raw = (own: unknown) => (own && !isSample ? { "data-lp-raw": "" } : {});
  switch (e.kind) {
    case "cover":
      return <Cover e={e} editing={editing} />;
    case "title":
      return (
        <div className="fl-title" data-lp="track-title" {...raw(true)} onClick={editing ? undefined : toLyrics}>
          {meta.title || media?.name}
        </div>
      );
    case "artist":
      return meta.artist || editing ? (
        <div className="fl-artist" data-lp="track-artist" {...raw(meta.artist)}>
          {meta.artist || "歌手"}
        </div>
      ) : null;
    case "album":
      return meta.album || editing ? (
        <div className="fl-album" data-lp="track-album" {...raw(meta.album)}>
          {meta.album || "专辑"}
        </div>
      ) : null;
    case "chips":
      return <TrackChips />;
    case "lyric":
      return <LyricPeek showNext={e.next !== false} interactive={!editing} placeholder={editing} />;
    case "text":
      return <TextEl e={e} />;
    case "image":
      return <Picture e={e} editing={editing} />;
    case "clock":
      return <Clock e={e} />;
    case "progress":
      return <Progress e={e} editing={editing} />;
    case "time":
      return <Time e={e} />;
  }
}

/** Inline styles of an element's box. */
function boxStyle(e: LayoutElement): CSSProperties {
  const st: CSSProperties = {
    left: `${e.x}%`,
    top: `${e.y}%`,
    width: `calc(var(--u) * ${e.w})`,
    transform: `translate(-50%, -50%)${e.rotate ? ` rotate(${e.rotate}deg)` : ""}`,
    opacity: e.opacity,
  };
  const t = e.text;
  if (t) {
    st.fontSize = `calc(var(--u) * ${t.size})`;
    st.fontWeight = t.weight;
    st.textAlign = t.align;
    if (t.color) st.color = t.color;
    const family = fontFamily(t.font);
    if (family) st.fontFamily = family;
    if (t.italic) st.fontStyle = "italic";
    if (t.spacing) st.letterSpacing = `${t.spacing}em`;
  }
  return st;
}

function enterStyle(e: LayoutElement): CSSProperties | undefined {
  if (e.enter.type === "none") return undefined;
  return { animation: `fl-${e.enter.type} ${e.enter.duration}ms var(--ease) ${e.enter.delay}ms both` };
}

// ------------------------------------------------------------------ layout

interface Drag {
  id: string;
  mode: "move" | "resize" | "rotate";
  startX: number;
  startY: number;
  orig: LayoutElement;
  moved: boolean;
  /** Rotating: the element's centre on screen, and the pointer's angle around it at the start. */
  cx: number;
  cy: number;
  a0: number;
}

const deg = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;


export function FreeLayout({ layout, editing }: { layout: PlayerLayout; editing: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useStageSize(ref);
  const u = Math.min(size.w, size.h) / 100;
  const path = useTrack()?.path;
  const replay = useLayouts((s) => s.replay);
  const selected = useLayouts((s) => (editing ? s.selected : null));
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [angle, setAngle] = useState<{ deg: number; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  const begin = (ev: ReactPointerEvent, e: LayoutElement, mode: Drag["mode"]) => {
    if (!editing || ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    selectElement(e.id);
    const target = ev.currentTarget as HTMLElement;
    target.setPointerCapture(ev.pointerId);
    // The box of a rotated element is still centred on it.
    const box = (target.closest(".fl-item") ?? target).getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    drag.current = { id: e.id, mode, startX: ev.clientX, startY: ev.clientY, orig: e, moved: false, cx, cy, a0: deg(ev.clientX - cx, ev.clientY - cy) };
  };
  const move = (ev: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !size.w || !size.h) return;
    const dx = ev.clientX - d.startX;
    const dy = ev.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    const record = !d.moved;
    d.moved = true;
    if (d.mode === "move") {
      let x = d.orig.x + (dx / size.w) * 100;
      let y = d.orig.y + (dy / size.h) * 100;
      let gx: number | null = null;
      let gy: number | null = null;
      if (!ev.altKey) {
        const others = layout.elements.filter((o) => o.id !== d.id && !o.hidden);
        const sx = snap(x, [50, ...others.map((o) => o.x)], (6 / size.w) * 100);
        const sy = snap(y, [50, ...others.map((o) => o.y)], (6 / size.h) * 100);
        x = sx.value;
        y = sy.value;
        gx = sx.guide;
        gy = sy.guide;
      }
      setGuides({ x: gx, y: gy });
      updateElement(d.id, (el) => {
        el.x = round1(x);
        el.y = round1(y);
      }, record);
    } else if (d.mode === "rotate") {
      const r = snapAngle(d.orig.rotate + deg(ev.clientX - d.cx, ev.clientY - d.cy) - d.a0, ev.shiftKey, ev.altKey);
      const st = ref.current!.getBoundingClientRect();
      setAngle({ deg: r, x: ev.clientX - st.left, y: ev.clientY - st.top });
      updateElement(d.id, (el) => (el.rotate = r), record);
    } else {
      // Along the element's own x axis (it may be rotated); it grows on both sides.
      const a = (d.orig.rotate * Math.PI) / 180;
      const along = dx * Math.cos(a) + dy * Math.sin(a);
      const w = Math.max(2, Math.min(400, d.orig.w + (2 * along) / u));
      updateElement(d.id, (el) => (el.w = round1(w)), record);
    }
  };
  const end = () => {
    drag.current = null;
    setGuides({ x: null, y: null });
    setAngle(null);
  };

  const style = { "--u": `${u}px` } as CSSProperties;
  return (
    <div
      ref={ref}
      className={`fl-stage ${editing ? "editing" : ""}`}
      data-lp="player-layout"
      style={style}
      onPointerDown={editing ? () => selectElement(null) : undefined}
      onPointerMove={editing ? move : undefined}
      onPointerUp={editing ? end : undefined}
      onPointerCancel={editing ? end : undefined}
    >
      {u > 0 &&
        layout.elements.map((e) =>
          e.hidden ? null : (
            <div
              key={e.id}
              className={`fl-item kind-${e.kind} ${e.text?.shadow ? "shadowed" : ""} ${selected === e.id ? "selected" : ""}`}
              data-lp="layout-item"
              data-kind={e.kind}
              data-id={e.id}
              style={boxStyle(e)}
              onPointerDown={editing ? (ev) => begin(ev, e, "move") : undefined}
            >
              <div className="fl-anim" key={e.enter.type === "none" ? "still" : `${path}|${replay}`} style={enterStyle(e)}>
                <Content e={e} editing={editing} />
              </div>
              {editing && selected === e.id && (
                <>
                  <div className="fl-handle" onPointerDown={(ev) => begin(ev, e, "resize")} />
                  <div
                    className="fl-rotate"
                    onPointerDown={(ev) => begin(ev, e, "rotate")}
                    onDoubleClick={(ev) => {
                      ev.stopPropagation();
                      updateElement(e.id, (el) => (el.rotate = 0));
                    }}
                    {...tip("拖动旋转；按住 Shift 以 15° 为步长，双击归零")}
                  />
                </>
              )}
            </div>
          ),
        )}
      {editing && guides.x !== null && <div className="fl-guide v" style={{ left: `${guides.x}%` }} />}
      {editing && guides.y !== null && <div className="fl-guide h" style={{ top: `${guides.y}%` }} />}
      {editing && angle && (
        <div className="fl-angle" style={{ left: angle.x, top: angle.y }}>
          {angle.deg}°
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ classic → free

/**
 * Where the parts of the classic page are now, as free elements: the editor's
 * starting point when the default layout is edited.
 */
export function measureClassic(stage: HTMLElement | null): LayoutElement[] {
  if (!stage) return [];
  const s = stage.getBoundingClientRect();
  if (!s.width || !s.height) return [];
  const u = Math.min(s.width, s.height) / 100;
  const out: LayoutElement[] = [];
  const at = (sel: string) => stage.querySelector<HTMLElement>(`[data-lp="${sel}"]`);
  const base = (id: LayoutElement["kind"], el: HTMLElement): LayoutElement => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const align = cs.textAlign === "center" ? "center" : cs.textAlign === "right" || cs.textAlign === "end" ? "right" : "left";
    return {
      id,
      kind: id,
      x: round1(((r.left + r.width / 2 - s.left) / s.width) * 100),
      y: round1(((r.top + r.height / 2 - s.top) / s.height) * 100),
      w: round1(r.width / u),
      rotate: 0,
      opacity: 1,
      hidden: false,
      enter: { type: "none", duration: 600, delay: 0 },
      text: { size: round1(parseFloat(cs.fontSize) / u), weight: parseInt(cs.fontWeight) || 400, color: null, font: "", italic: false, shadow: false, spacing: 0, align },
    };
  };
  const cover = at("cover");
  if (cover) {
    const e = base("cover", cover);
    delete e.text;
    const radius = parseFloat(getComputedStyle(cover).borderTopLeftRadius) || 0;
    e.cover = { shape: "square", radius: round1(Math.min(50, (radius / cover.getBoundingClientRect().width) * 100)), shadow: true, spin: true, speed: 20, arm: false, grooves: true, label: 66 };
    // The cover shrinks a little while paused.
    if (cover.classList.contains("paused")) e.w = round1(e.w / 0.94);
    out.push(e);
  }
  let last: LayoutElement | null = null;
  // Parts this song lacks (no album, no synced lyrics) go where the classic
  // page would put them; what follows moves down to make room.
  let shift = 0;
  for (const [kind, sel] of [
    ["title", "track-title"],
    ["artist", "track-artist"],
    ["album", "track-album"],
    ["chips", "chips"],
    ["lyric", "lyric-peek"],
  ] as const) {
    const el = at(sel);
    if (el) {
      last = base(kind, el);
      last.y = round1(last.y + shift);
      out.push(last);
    } else if (last) {
      const d = defaultElement(kind);
      const lineH = ((d.text!.size * u * 1.3 + 10) / s.height) * 100;
      const y: number = last.y + ((last.text?.size ?? 2) * u * 0.65) / s.height * 100 + lineH / 2 + (kind === "lyric" ? 2 : 0);
      last = { ...d, x: last.x, w: last.w, y: round1(y), text: { ...d.text!, align: last.text?.align ?? "center" } };
      out.push(last);
      if (kind !== "lyric") shift += lineH;
    }
  }
  return out;
}
