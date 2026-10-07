// What the sky looks like for a weather report: the kind of weather, the
// time of day and the colours, in the spirit of the iOS Weather app.

import type { IconName } from "../../components/Icon";
import type { WeatherReport } from "../../lib/ipc";

export type SkyKind =
  | "clear"
  | "partly"
  | "cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavyRain"
  | "thunder"
  | "snow"
  | "sleet"
  | "hail";

export type DayPhase = "dawn" | "day" | "dusk" | "night";

/** The nine stages of the day the sky follows, from before sunrise to the small hours. */
export type TimePhase = "daybreak" | "sunrise" | "morning" | "noon" | "afternoon" | "evening" | "sunset" | "night" | "midnight";

export const TIME_PHASES: { id: TimePhase; label: string }[] = [
  { id: "daybreak", label: "破晓" },
  { id: "sunrise", label: "日出" },
  { id: "morning", label: "上午" },
  { id: "noon", label: "中午" },
  { id: "afternoon", label: "下午" },
  { id: "evening", label: "傍晚" },
  { id: "sunset", label: "日落" },
  { id: "night", label: "夜晚" },
  { id: "midnight", label: "午夜" },
];

/** How a clear sky looks at some moment: gradient (top, middle, bottom), daylight, horizon glow and accent colour. */
export interface SkyLook {
  sky: [string, string, string];
  /** 0 (dark night) to 1 (full daylight). */
  light: number;
  /** Warm glow on the horizon, 0–1. */
  glow: number;
  accent: string;
}

export interface TimeOfDay {
  phase: TimePhase;
  /** The sun's way across the sky: 0 at sunrise, 1 at sunset, outside 0–1 below the horizon. */
  sun: number;
  /** The moon's way across the night sky: 0 at sunset, 1 at the next sunrise. */
  moon: number;
  /** The look at this moment, blended smoothly between neighbouring stages. */
  look: SkyLook;
}

export interface Scene {
  kind: SkyKind;
  /** Coarse time of day, derived from `time`. */
  phase: DayPhase;
  time: TimeOfDay;
  /** Precipitation strength, 0–1. */
  intensity: number;
  /** Cloud amount, 0–1. */
  clouds: number;
  /** Horizontal drift of falling particles per unit of fall, signed. */
  wind: number;
  label: string;
}

interface CodeInfo {
  kind: SkyKind;
  intensity: number;
  label: string;
}

const CODES: Record<number, CodeInfo> = {
  0: { kind: "clear", intensity: 0, label: "晴" },
  1: { kind: "partly", intensity: 0, label: "晴间少云" },
  2: { kind: "cloudy", intensity: 0, label: "多云" },
  3: { kind: "overcast", intensity: 0, label: "阴" },
  45: { kind: "fog", intensity: 0.6, label: "雾" },
  48: { kind: "fog", intensity: 0.8, label: "雾凇" },
  51: { kind: "drizzle", intensity: 0.25, label: "小毛毛雨" },
  53: { kind: "drizzle", intensity: 0.4, label: "毛毛雨" },
  55: { kind: "drizzle", intensity: 0.55, label: "大毛毛雨" },
  56: { kind: "sleet", intensity: 0.35, label: "冻毛毛雨" },
  57: { kind: "sleet", intensity: 0.55, label: "冻毛毛雨" },
  61: { kind: "rain", intensity: 0.4, label: "小雨" },
  63: { kind: "rain", intensity: 0.65, label: "中雨" },
  65: { kind: "heavyRain", intensity: 0.9, label: "大雨" },
  66: { kind: "sleet", intensity: 0.45, label: "冻雨" },
  67: { kind: "sleet", intensity: 0.75, label: "强冻雨" },
  71: { kind: "snow", intensity: 0.35, label: "小雪" },
  73: { kind: "snow", intensity: 0.6, label: "中雪" },
  75: { kind: "snow", intensity: 0.9, label: "大雪" },
  77: { kind: "snow", intensity: 0.4, label: "米雪" },
  80: { kind: "rain", intensity: 0.5, label: "阵雨" },
  81: { kind: "rain", intensity: 0.75, label: "中阵雨" },
  82: { kind: "heavyRain", intensity: 1, label: "强阵雨" },
  85: { kind: "snow", intensity: 0.5, label: "阵雪" },
  86: { kind: "snow", intensity: 0.9, label: "强阵雪" },
  95: { kind: "thunder", intensity: 0.85, label: "雷阵雨" },
  96: { kind: "hail", intensity: 0.8, label: "雷阵雨伴有冰雹" },
  99: { kind: "hail", intensity: 1, label: "强雷阵雨伴有冰雹" },
};

const CLOUDS: Record<SkyKind, number> = {
  clear: 0,
  partly: 0.28,
  cloudy: 0.58,
  overcast: 0.92,
  fog: 0.45,
  drizzle: 0.72,
  rain: 0.85,
  heavyRain: 1,
  thunder: 1,
  snow: 0.8,
  sleet: 0.85,
  hail: 1,
};

export function describeCode(code: number): CodeInfo {
  return CODES[code] ?? { kind: "cloudy", intensity: 0, label: "多云" };
}

const DAY = 86400;
const MIN = 60;

/** Clear-sky looks for each stage, at its middle. */
const LOOKS: Record<TimePhase, SkyLook> = {
  daybreak: { sky: ["#1b2a5a", "#5b5b90", "#d6978d"], light: 0.3, glow: 0.55, accent: "#a78bfa" },
  sunrise: { sky: ["#34528f", "#c97f78", "#f4b98d"], light: 0.55, glow: 0.9, accent: "#ff8a4c" },
  morning: { sky: ["#2f80da", "#6aaee2", "#b4d8f3"], light: 0.92, glow: 0.08, accent: "#2fa4ff" },
  noon: { sky: ["#2a78d6", "#5ea6ea", "#a3d0f5"], light: 1, glow: 0, accent: "#0a84ff" },
  afternoon: { sky: ["#3073c6", "#69a3da", "#b9d3e8"], light: 0.95, glow: 0.06, accent: "#14b8a6" },
  evening: { sky: ["#3a67aa", "#9e98ae", "#f0c287"], light: 0.75, glow: 0.5, accent: "#f5a524" },
  sunset: { sky: ["#27356f", "#8f5a8c", "#ee9066"], light: 0.4, glow: 1, accent: "#ff6b5b" },
  night: { sky: ["#060a1c", "#111d45", "#22346a"], light: 0.06, glow: 0, accent: "#8b7cf6" },
  midnight: { sky: ["#03060f", "#0a1230", "#16244e"], light: 0, glow: 0, accent: "#6d7cf2" },
};

/**
 * Where each stage starts, in seconds since sunrise (daybreak is negative),
 * for a day with `light` seconds between sunrise and sunset. Short days and
 * nights shrink the stages so they always stay in order.
 */
export function phaseStarts(light: number): [TimePhase, number][] {
  const L = Math.min(DAY - 2 * MIN, Math.max(2 * MIN, light));
  const dark = DAY - L;
  const twilight = Math.min(40 * MIN, dark * 0.15);
  const noon = Math.min(60 * MIN, L * 0.1);
  const nightStart = L + twilight;
  const nightEnd = DAY - twilight;
  return [
    ["daybreak", -twilight],
    ["sunrise", 0],
    ["morning", Math.min(40 * MIN, L * 0.15)],
    ["noon", L / 2 - noon],
    ["afternoon", L / 2 + noon],
    ["evening", L - Math.min(90 * MIN, L * 0.2)],
    ["sunset", L - Math.min(20 * MIN, L * 0.05)],
    ["night", nightStart],
    ["midnight", nightStart + (nightEnd - nightStart) * 0.4],
  ];
}

const smooth = (x: number) => x * x * (3 - 2 * x);

function blendLook(a: SkyLook, b: SkyLook, t: number): SkyLook {
  return {
    sky: [mix(a.sky[0], b.sky[0], t), mix(a.sky[1], b.sky[1], t), mix(a.sky[2], b.sky[2], t)],
    light: a.light + (b.light - a.light) * t,
    glow: a.glow + (b.glow - a.glow) * t,
    accent: mix(a.accent, b.accent, t),
  };
}

/** The time of day at `t` seconds since sunrise, with `light` seconds of daylight. */
function timeAt(t: number, light: number): TimeOfDay {
  const starts = phaseStarts(light);
  const first = starts[0][1];
  // Into [daybreak, next daybreak).
  t = ((((t - first) % DAY) + DAY) % DAY) + first;
  let i = starts.length - 1;
  while (i > 0 && t < starts[i][1]) i--;
  // Colours change continuously: between the middles of neighbouring stages.
  const ends = starts.map((_, k) => (k + 1 < starts.length ? starts[k + 1][1] : first + DAY));
  const mid = (k: number) => (starts[k][1] + ends[k]) / 2;
  const n = starts.length;
  let a = t < mid(i) ? (i + n - 1) % n : i;
  let ma = mid(a);
  let mb = mid((a + 1) % n);
  if (ma > t) ma -= DAY;
  if (mb < ma) mb += DAY;
  const f = mb > ma ? Math.min(1, Math.max(0, (t - ma) / (mb - ma))) : 0;
  const look = blendLook(LOOKS[starts[a][0]], LOOKS[starts[(a + 1) % n][0]], smooth(f));
  const L = Math.min(DAY - 2 * MIN, Math.max(2 * MIN, light));
  const sinceSunset = (((t - L) % DAY) + DAY) % DAY;
  return { phase: starts[i][0], sun: t / L, moon: sinceSunset / (DAY - L), look };
}

/** Today's local clock time as a unix timestamp. */
function clock(now: Date, h: number, m = 0): number {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.getTime() / 1000;
}

/**
 * The time of day from sunrise and sunset (unix seconds, any day: only the
 * time of day counts). Without them, a 06:00 sunrise and 18:30 sunset on the
 * local clock.
 */
export function timeOfDay(nowSec: number, sunrise?: number | null, sunset?: number | null): TimeOfDay {
  if (!sunrise || !sunset) {
    const now = new Date(nowSec * 1000);
    sunrise = clock(now, 6);
    sunset = clock(now, 18, 30);
  }
  const light = (((sunset - sunrise) % DAY) + DAY) % DAY;
  return timeAt(nowSec - sunrise, light);
}

export function coarsePhase(p: TimePhase): DayPhase {
  switch (p) {
    case "daybreak":
    case "sunrise":
      return "dawn";
    case "sunset":
      return "dusk";
    case "night":
    case "midnight":
      return "night";
    default:
      return "day";
  }
}

/** Dawn is daybreak and sunrise, dusk the sunset stage. */
export function dayPhase(nowSec: number, sunrise?: number | null, sunset?: number | null, isDay = true): DayPhase {
  if (!sunrise || !sunset) return isDay ? "day" : "night";
  return coarsePhase(timeOfDay(nowSec, sunrise, sunset).phase);
}

export function timeLabel(p: TimePhase): string {
  return TIME_PHASES.find((x) => x.id === p)!.label;
}

/** Wind (km/h, direction it blows from) as a sideways drift of rain and snow. */
export function windDrift(speed: number, fromDeg: number): number {
  const toward = -Math.sin((fromDeg * Math.PI) / 180); // easterly wind blows westward
  const strength = Math.min(speed / 45, 0.75);
  return Math.round((0.06 + strength) * (toward >= 0 ? 1 : -1) * 100) / 100;
}

export function sceneOf(r: WeatherReport, nowSec = Date.now() / 1000): Scene {
  const info = describeCode(r.code);
  const time = timeOfDay(nowSec, r.sunrise, r.sunset);
  return {
    kind: info.kind,
    phase: coarsePhase(time.phase),
    time,
    intensity: info.intensity,
    clouds: info.kind === "clear" ? 0 : Math.max(CLOUDS[info.kind], Math.min(1, r.cloudCover / 100) * 0.9),
    wind: windDrift(r.windSpeed, r.windDirection),
    label: info.label,
  };
}

/** Before any report arrives: a clear sky that follows the clock. */
export function fallbackScene(now = new Date()): Scene {
  const time = timeOfDay(now.getTime() / 1000);
  return { kind: "clear", phase: coarsePhase(time.phase), time, intensity: 0, clouds: 0, wind: 0.1, label: "晴" };
}

// ------------------------------------------------------------------ previews

type Weather = Omit<Scene, "label" | "phase" | "time">;

const WEATHER_PREVIEWS: { id: string; label: string; scene: Weather; at?: TimePhase }[] = [
  { id: "clear", label: "晴", scene: { kind: "clear", intensity: 0, clouds: 0, wind: 0.1 } },
  { id: "partly", label: "少云", scene: { kind: "partly", intensity: 0, clouds: 0.3, wind: 0.1 } },
  { id: "cloudy", label: "多云", scene: { kind: "cloudy", intensity: 0, clouds: 0.6, wind: 0.15 } },
  { id: "overcast", label: "阴", scene: { kind: "overcast", intensity: 0, clouds: 0.95, wind: 0.15 } },
  { id: "fog", label: "雾", scene: { kind: "fog", intensity: 0.7, clouds: 0.45, wind: 0.05 } },
  { id: "drizzle", label: "毛毛雨", scene: { kind: "drizzle", intensity: 0.4, clouds: 0.75, wind: 0.12 } },
  { id: "rain", label: "雨", scene: { kind: "rain", intensity: 0.65, clouds: 0.88, wind: 0.2 } },
  { id: "heavyRain", label: "大雨", scene: { kind: "heavyRain", intensity: 1, clouds: 1, wind: 0.35 } },
  { id: "thunder", label: "雷雨", scene: { kind: "thunder", intensity: 0.9, clouds: 1, wind: 0.3 } },
  { id: "snow", label: "雪", scene: { kind: "snow", intensity: 0.7, clouds: 0.8, wind: 0.15 } },
  { id: "sleet", label: "雨夹雪", scene: { kind: "sleet", intensity: 0.6, clouds: 0.85, wind: 0.2 } },
  { id: "hail", label: "冰雹", scene: { kind: "hail", intensity: 0.85, clouds: 1, wind: 0.2 } },
  { id: "nightRain", label: "雨夜", scene: { kind: "rain", intensity: 0.65, clouds: 0.9, wind: 0.2 }, at: "night" },
];

/** A clear sky in the middle of a stage, on a day with a 06:00 sunrise and 18:00 sunset. */
export function previewTime(p: TimePhase): TimeOfDay {
  const light = 12 * 3600;
  const starts = phaseStarts(light);
  const i = starts.findIndex(([id]) => id === p);
  const end = i + 1 < starts.length ? starts[i + 1][1] : starts[0][1] + DAY;
  return timeAt((starts[i][1] + end) / 2, light);
}

export const PREVIEWS: { id: string; label: string; group: "weather" | "time" }[] = [
  ...WEATHER_PREVIEWS.map((p) => ({ id: p.id, label: p.label, group: "weather" as const })),
  ...TIME_PHASES.map((p) => ({ id: `time:${p.id}`, label: p.label, group: "time" as const })),
];

export function previewScene(id: string): Scene | null {
  const stage = TIME_PHASES.find((x) => `time:${x.id}` === id);
  if (stage) {
    const time = previewTime(stage.id);
    return { kind: "clear", phase: coarsePhase(stage.id), time, intensity: 0, clouds: 0, wind: 0.1, label: stage.label };
  }
  const p = WEATHER_PREVIEWS.find((x) => x.id === id);
  if (!p) return null;
  const at = p.at ?? "noon";
  return { ...p.scene, phase: coarsePhase(at), time: previewTime(at), label: p.label };
}

// ------------------------------------------------------------------ looks

export function sceneIcon(s: Pick<Scene, "kind" | "phase">): IconName {
  switch (s.kind) {
    case "clear":
      return s.phase === "night" ? "moon" : "sun";
    case "partly":
      return s.phase === "night" ? "moon" : "cloudSun";
    case "cloudy":
    case "overcast":
      return "cloud";
    case "fog":
      return "fog";
    case "drizzle":
    case "rain":
    case "heavyRain":
      return "rain";
    case "thunder":
    case "hail":
      return "bolt";
    case "snow":
    case "sleet":
      return "snow";
  }
}

/** Daytime sky colours (top, middle, bottom). */
const DAY_SKY: Record<SkyKind, [string, string, string]> = {
  clear: ["#2a78d6", "#5ea6ea", "#a3d0f5"],
  partly: ["#3479c6", "#6da5de", "#a9cdee"],
  cloudy: ["#4f6f93", "#7f9bb9", "#adc0d4"],
  overcast: ["#5f6d7d", "#87939f", "#a9b3bd"],
  fog: ["#7f8a96", "#a1aab3", "#c2c8ce"],
  drizzle: ["#4a5d73", "#6c7e92", "#8c9bab"],
  rain: ["#3a4c61", "#56687d", "#738396"],
  heavyRain: ["#283647", "#3e4d61", "#556477"],
  thunder: ["#1c2131", "#30364e", "#474e69"],
  snow: ["#7f95ae", "#a7b8cb", "#cfdae6"],
  sleet: ["#56687c", "#7a8c9f", "#9eadbc"],
  hail: ["#212638", "#363d56", "#4d5571"],
};

const NIGHT_SKY: [string, string, string] = ["#050812", "#070b18", "#0b1222"];

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${((1 << 24) | (f(r1, r2) << 16) | (f(g1, g2) << 8) | f(b1, b2)).toString(16).slice(1)}`;
}

/** Sky gradient colours for a scene, top to bottom. */
export function skyColors(s: Pick<Scene, "kind" | "clouds" | "time">): [string, string, string] {
  const { sky, light, glow } = s.time.look;
  if (s.kind === "clear") return sky;
  // Weather skies: the daytime colours, darkened as the light goes and warmed near the horizon.
  const day = DAY_SKY[s.kind];
  const dim = 1 - light;
  const base = day.map((c, i) => mix(c, NIGHT_SKY[i], dim * [0.72, 0.68, 0.62][i]));
  const warm = glow * 0.45 * (1 - s.clouds * 0.6);
  const cloudy: [string, string, string] = [mix(base[0], "#1f2440", glow * 0.3), mix(base[1], "#6a5068", glow * 0.25), mix(base[2], sky[2], warm)];
  if (s.kind !== "partly") return cloudy;
  // A few clouds: mostly the clear sky at dawn, dusk and night, the cloudy day sky at noon.
  const k = 0.15 + 0.85 * light * (1 - glow);
  return [mix(sky[0], cloudy[0], k), mix(sky[1], cloudy[1], k), mix(sky[2], cloudy[2], k)];
}
