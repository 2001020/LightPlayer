// Player page layouts: the classic page as-is, or a free layout of elements
// placed on the stage (cover, song info, lyric preview and added text,
// pictures, clocks, progress and time). Layouts are plain JSON, so plugins can
// ship them (manifest `layouts`) and the editor can export them as a plugin.
//
// Coordinates: `x` / `y` are the element's centre in percent of the stage;
// sizes are in `u`, where 1u is 1% of the stage's shorter side, so a layout
// keeps its proportions in any window size.

export type BuiltinKind = "cover" | "title" | "artist" | "album" | "chips" | "lyric";
export type ExtraKind = "text" | "image" | "clock" | "progress" | "time";
export type ElementKind = BuiltinKind | ExtraKind;

export const BUILTIN_KINDS: BuiltinKind[] = ["cover", "title", "artist", "album", "chips", "lyric"];
export const EXTRA_KINDS: ExtraKind[] = ["text", "image", "clock", "progress", "time"];

export const KIND_LABEL: Record<ElementKind, string> = {
  cover: "封面",
  title: "歌名",
  artist: "歌手",
  album: "专辑",
  chips: "标签",
  lyric: "歌词预览",
  text: "文字",
  image: "图片",
  clock: "时钟",
  progress: "进度",
  time: "播放时间",
};

export type EnterType = "none" | "fade" | "up" | "down" | "left" | "right" | "zoom" | "blur";
export const ENTER_TYPES: [EnterType, string][] = [
  ["none", "无"],
  ["fade", "淡入"],
  ["up", "上滑"],
  ["down", "下滑"],
  ["left", "左滑"],
  ["right", "右滑"],
  ["zoom", "缩放"],
  ["blur", "模糊渐显"],
];

export interface EnterAnim {
  type: EnterType;
  /** Milliseconds. */
  duration: number;
  delay: number;
}

export interface TextStyle {
  /** Font size in u. */
  size: number;
  weight: number;
  /** null: the theme's colour for this element. */
  color: string | null;
  /** "" (the app's font), "serif", "mono", "rounded" or a font family name. */
  font: string;
  italic: boolean;
  /** A soft shadow that keeps text readable over pictures. */
  shadow: boolean;
  /** Letter spacing in em. */
  spacing: number;
  align: "left" | "center" | "right";
}

export interface CoverStyle {
  shape: "square" | "vinyl";
  /** square: corner radius in percent of the width (50 = round). */
  radius: number;
  shadow: boolean;
  /** vinyl: turns while playing; `speed` is seconds per turn. */
  spin: boolean;
  speed: number;
  arm: boolean;
  grooves: boolean;
  /** vinyl: the cover's diameter in percent of the record. */
  label: number;
}

export type ClockFormat = "HH:mm" | "HH:mm:ss" | "date" | "datetime";
export type TimeFormat = "elapsed" | "remaining" | "both";

export interface ProgressStyle {
  style: "bar" | "ring";
  /** Thickness in u. */
  thickness: number;
  /** null: the accent colour. */
  color: string | null;
}

export interface LayoutElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  /** Width in u. */
  w: number;
  rotate: number;
  /** 0–1. */
  opacity: number;
  hidden: boolean;
  enter: EnterAnim;
  text?: TextStyle;
  cover?: CoverStyle;
  /** text: the words, with {title} {artist} {album} {elapsed} {duration} {remaining} {time} {date}. */
  content?: string;
  /** image: "asset:<name>" (added in the editor), "plugin:<id>/<path>" or a data: URL. */
  src?: string;
  /** image: corner radius in percent. */
  radius?: number;
  clock?: ClockFormat;
  progress?: ProgressStyle;
  time?: TimeFormat;
  /** lyric: also show the next line. */
  next?: boolean;
}

export interface PlayerLayout {
  id: string;
  name: string;
  /** The classic page, unchanged (only the built-in "default" layout). */
  classic?: boolean;
  elements: LayoutElement[];
  /** Set on layouts that come from a plugin. */
  plugin?: string;
}

export const DEFAULT_LAYOUT_ID = "default";
export const MAX_ELEMENTS = 60;

const TEXT_KINDS: ElementKind[] = ["title", "artist", "album", "chips", "lyric", "text", "clock", "time"];
export const hasText = (k: ElementKind) => TEXT_KINDS.includes(k);

/** The usual look of each kind of element. */
export function defaultElement(kind: ElementKind, id: string = kind): LayoutElement {
  const base: LayoutElement = { id, kind, x: 50, y: 50, w: 40, rotate: 0, opacity: 1, hidden: false, enter: { type: "none", duration: 600, delay: 0 } };
  const text = (size: number, weight = 400, extra: Partial<TextStyle> = {}): TextStyle => ({
    size,
    weight,
    color: null,
    font: "",
    italic: false,
    shadow: false,
    spacing: 0,
    align: "center",
    ...extra,
  });
  switch (kind) {
    case "cover":
      return { ...base, w: 56, cover: { shape: "square", radius: 4, shadow: true, spin: true, speed: 20, arm: true, grooves: true, label: 66 } };
    case "title":
      return { ...base, w: 70, text: text(4.6, 700) };
    case "artist":
      return { ...base, w: 70, text: text(2.8) };
    case "album":
      return { ...base, w: 70, text: text(2.2) };
    case "chips":
      return { ...base, w: 70, text: text(1.9) };
    case "lyric":
      return { ...base, w: 80, next: true, text: text(2.6) };
    case "text":
      return { ...base, w: 50, content: "正在播放：{title}", text: text(2.6) };
    case "image":
      return { ...base, w: 20, src: "", radius: 0 };
    case "clock":
      return { ...base, w: 30, clock: "HH:mm", text: text(5, 300, { spacing: 0.02 }) };
    case "progress":
      return { ...base, w: 50, progress: { style: "bar", thickness: 0.6, color: null } };
    case "time":
      return { ...base, w: 30, time: "both", text: text(2, 400, { font: "mono" }) };
  }
}

/** A new id for an added element. */
export function newElementId(kind: ElementKind, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) {
    const id = `${kind}-${i}`;
    if (!used.has(id)) return id;
  }
}

// ------------------------------------------------------------------ built-in

function place(kind: BuiltinKind, x: number, y: number, w: number, patch: (e: LayoutElement) => void = () => {}): LayoutElement {
  const e = { ...defaultElement(kind), x, y, w };
  patch(e);
  return e;
}

const left = (e: LayoutElement) => {
  if (e.text) e.text.align = "left";
};

export const BUILTIN_LAYOUTS: PlayerLayout[] = [
  { id: DEFAULT_LAYOUT_ID, name: "默认", classic: true, elements: [] },
  {
    id: "vinyl",
    name: "黑胶唱片机",
    elements: [
      place("cover", 50, 44, 62, (e) => {
        e.cover!.shape = "vinyl";
        e.enter = { type: "zoom", duration: 700, delay: 0 };
      }),
      place("title", 50, 82.5, 90, (e) => {
        e.text!.size = 4.2;
        e.enter = { type: "up", duration: 600, delay: 80 };
      }),
      place("artist", 50, 88.5, 80, (e) => {
        e.enter = { type: "up", duration: 600, delay: 160 };
      }),
      place("album", 50, 91, 80, (e) => (e.hidden = true)),
      place("chips", 50, 91, 80, (e) => (e.hidden = true)),
      place("lyric", 50, 95, 110, (e) => {
        e.text!.size = 2.3;
        e.next = false;
      }),
    ],
  },
  {
    id: "vinyl-split",
    name: "唱片 + 左右分栏",
    elements: [
      place("cover", 30, 52, 66, (e) => {
        e.cover!.shape = "vinyl";
        e.enter = { type: "left", duration: 700, delay: 0 };
      }),
      place("title", 74, 33, 64, (e) => {
        left(e);
        e.text!.size = 5;
        e.enter = { type: "right", duration: 600, delay: 80 };
      }),
      place("artist", 74, 41, 64, (e) => {
        left(e);
        e.enter = { type: "right", duration: 600, delay: 140 };
      }),
      place("album", 74, 46, 64, (e) => {
        left(e);
        e.enter = { type: "right", duration: 600, delay: 200 };
      }),
      place("chips", 74, 51.5, 64, left),
      place("lyric", 74, 64, 64, (e) => {
        left(e);
        e.text!.size = 2.8;
      }),
    ],
  },
];

export const isBuiltinLayout = (id: string) => BUILTIN_LAYOUTS.some((l) => l.id === id);

// ------------------------------------------------------------------ checking

const num = (v: unknown, min: number, max: number, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], def: T): T => (opts.includes(v as T) ? (v as T) : def);
const str = (v: unknown, max: number, def: string) => (typeof v === "string" ? v.slice(0, max) : def);
export const isColor = (v: unknown): v is string => typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
const color = (v: unknown, def: string | null) => (v === null ? null : isColor(v) ? v : def);
/** A font family a user typed: no characters that could leave the CSS value. */
const fontName = (v: unknown) => str(v, 64, "").replace(/["'\\;{}<>]/g, "").trim();

/** Image sources a layout may use (never a remote address). */
export function validSrc(src: string): boolean {
  if (/^asset:[0-9a-f]{16,64}\.(png|jpe?g|webp|gif|svg)$/.test(src)) return true;
  if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(src)) return src.length <= 4_000_000;
  const m = /^plugin:([a-z0-9][a-z0-9.-]{1,62}[a-z0-9])\/(.+)$/.exec(src);
  return !!m && validRelPath(m[2]);
}

/** A plugin-relative path: segments without "." / "..", no backslashes or colons. */
export function validRelPath(p: string): boolean {
  return !!p && !p.startsWith("/") && !/[\\:]/.test(p) && p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

const ENTERS = ENTER_TYPES.map(([t]) => t);

function checkElement(raw: unknown, plugin?: string): LayoutElement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = oneOf(r.kind, [...BUILTIN_KINDS, ...EXTRA_KINDS] as ElementKind[], "text");
  if (r.kind !== kind) return null;
  const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) ? r.id : null;
  if (!id) return null;
  const d = defaultElement(kind, id);
  const e: LayoutElement = {
    id,
    kind,
    x: num(r.x, -50, 150, d.x),
    y: num(r.y, -50, 150, d.y),
    w: num(r.w, 1, 400, d.w),
    rotate: num(r.rotate, -360, 360, 0),
    opacity: num(r.opacity, 0, 1, 1),
    hidden: bool(r.hidden, false),
    enter: { type: "none", duration: 600, delay: 0 },
  };
  const en = (r.enter ?? {}) as Record<string, unknown>;
  e.enter = { type: oneOf(en.type, ENTERS, "none"), duration: num(en.duration, 100, 5000, 600), delay: num(en.delay, 0, 5000, 0) };
  if (d.text) {
    const t = (r.text ?? {}) as Record<string, unknown>;
    e.text = {
      size: num(t.size, 0.5, 40, d.text.size),
      weight: Math.round(num(t.weight, 100, 900, d.text.weight) / 100) * 100,
      color: color(t.color, null),
      font: fontName(t.font),
      italic: bool(t.italic, false),
      shadow: bool(t.shadow, false),
      spacing: num(t.spacing, -0.2, 1, d.text.spacing),
      align: oneOf(t.align, ["left", "center", "right"] as const, d.text.align),
    };
  }
  if (d.cover) {
    const c = (r.cover ?? {}) as Record<string, unknown>;
    e.cover = {
      shape: oneOf(c.shape, ["square", "vinyl"] as const, "square"),
      radius: num(c.radius, 0, 50, d.cover.radius),
      shadow: bool(c.shadow, true),
      spin: bool(c.spin, true),
      speed: num(c.speed, 2, 120, d.cover.speed),
      arm: bool(c.arm, true),
      grooves: bool(c.grooves, true),
      label: num(c.label, 30, 90, d.cover.label),
    };
  }
  if (kind === "text") e.content = str(r.content, 500, d.content!);
  if (kind === "image") {
    let src = str(r.src, 4_000_000, "");
    // A plugin's layout names files in its own folder.
    if (plugin && src && !src.startsWith("data:")) src = validRelPath(src) ? `plugin:${plugin}/${src}` : "";
    e.src = validSrc(src) ? src : "";
    e.radius = num(r.radius, 0, 50, 0);
  }
  if (kind === "clock") e.clock = oneOf(r.clock, ["HH:mm", "HH:mm:ss", "date", "datetime"] as const, "HH:mm");
  if (kind === "time") e.time = oneOf(r.time, ["elapsed", "remaining", "both"] as const, "both");
  if (kind === "progress") {
    const p = (r.progress ?? {}) as Record<string, unknown>;
    e.progress = { style: oneOf(p.style, ["bar", "ring"] as const, "bar"), thickness: num(p.thickness, 0.1, 20, 0.6), color: color(p.color, null) };
  }
  if (kind === "lyric") e.next = bool(r.next, true);
  return e;
}

/**
 * Reads a layout from JSON (a saved one, or a plugin's): unknown fields are
 * dropped, numbers clamped, and every built-in element is present exactly once.
 */
export function checkLayout(raw: unknown, fallbackId: string, plugin?: string): PlayerLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.elements)) return null;
  const seen = new Set<string>();
  const elements: LayoutElement[] = [];
  for (const item of r.elements.slice(0, MAX_ELEMENTS)) {
    const e = checkElement(item, plugin);
    if (!e || seen.has(e.id)) continue;
    // One of each built-in element.
    if ((BUILTIN_KINDS as string[]).includes(e.kind)) {
      if (elements.some((x) => x.kind === e.kind)) continue;
    }
    seen.add(e.id);
    elements.push(e);
  }
  for (const k of BUILTIN_KINDS) {
    if (!elements.some((e) => e.kind === k)) {
      let id: string = k;
      if (seen.has(id)) id = newElementId(k, seen);
      seen.add(id);
      elements.push({ ...defaultElement(k, id), hidden: true });
    }
  }
  const name = str(r.name, 40, "").trim() || "未命名布局";
  const id = typeof r.id === "string" && /^[A-Za-z0-9:._-]{1,80}$/.test(r.id) ? r.id : fallbackId;
  return { id, name, elements, ...(plugin ? { plugin } : {}) };
}

/** The JSON a plugin ships (`layouts` in its manifest): no id, plugin-relative images. */
export function exportableLayout(l: PlayerLayout): { name: string; elements: LayoutElement[] } {
  return { name: l.name, elements: l.elements.map((e) => ({ ...e })) };
}

// ------------------------------------------------------------------ text

export interface TrackFacts {
  title: string;
  artist: string;
  album: string;
  position: number;
  duration: number;
  now: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatClock(d: Date, f: ClockFormat): string {
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const date = `${d.getMonth() + 1}月${d.getDate()}日 星期${"日一二三四五六"[d.getDay()]}`;
  switch (f) {
    case "HH:mm":
      return hm;
    case "HH:mm:ss":
      return `${hm}:${pad(d.getSeconds())}`;
    case "date":
      return date;
    case "datetime":
      return `${date} ${hm}`;
  }
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Fills the {placeholders} of a text element. */
export function fillTemplate(text: string, f: TrackFacts): string {
  const values: Record<string, string> = {
    title: f.title,
    artist: f.artist,
    album: f.album,
    elapsed: formatDuration(f.position),
    duration: formatDuration(f.duration),
    remaining: `-${formatDuration(Math.max(0, f.duration - f.position))}`,
    time: formatClock(f.now, "HH:mm"),
    date: formatClock(f.now, "date"),
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

export const usesClock = (text: string) => /\{(time|date)\}/.test(text);
export const usesPosition = (text: string) => /\{(elapsed|remaining)\}/.test(text);

export function formatTimeEl(f: TimeFormat, position: number, duration: number): string {
  switch (f) {
    case "elapsed":
      return formatDuration(position);
    case "remaining":
      return `-${formatDuration(Math.max(0, duration - position))}`;
    case "both":
      return `${formatDuration(position)} / ${formatDuration(duration)}`;
  }
}

export const FONT_STACKS: Record<string, string> = {
  serif: '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", Georgia, serif',
  mono: 'var(--mono)',
  rounded: '"SF Pro Rounded", "Arial Rounded MT Bold", "Yuanti SC", "YouYuan", var(--font)',
};

/** The CSS font-family for a text style's `font`. */
export function fontFamily(font: string): string | undefined {
  if (!font) return undefined;
  return FONT_STACKS[font] ?? `"${font}", var(--font)`;
}

// ------------------------------------------------------------------ snapping

/** Snaps `v` to the nearest target within `range`; returns the value and the target used. */
export function snap(v: number, targets: number[], range: number): { value: number; guide: number | null } {
  let best: number | null = null;
  for (const t of targets) if (Math.abs(t - v) <= range && (best === null || Math.abs(t - v) < Math.abs(best - v))) best = t;
  return best === null ? { value: v, guide: null } : { value: best, guide: best };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
