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

export interface Scene {
  kind: SkyKind;
  phase: DayPhase;
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

const TWILIGHT = 40 * 60;

/** Dawn and dusk are the 40 minutes either side of sunrise and sunset. */
export function dayPhase(nowSec: number, sunrise?: number | null, sunset?: number | null, isDay = true): DayPhase {
  if (!sunrise || !sunset) return isDay ? "day" : "night";
  // The report's sunrise and sunset are for "today" there; compare by time of day.
  const day = 86400;
  const t = (((nowSec - sunrise) % day) + day) % day; // seconds since sunrise
  const len = (((sunset - sunrise) % day) + day) % day; // daylight length
  if (t < TWILIGHT || t > day - TWILIGHT) return "dawn";
  if (Math.abs(t - len) < TWILIGHT) return "dusk";
  return t < len ? "day" : "night";
}

/** Wind (km/h, direction it blows from) as a sideways drift of rain and snow. */
export function windDrift(speed: number, fromDeg: number): number {
  const toward = -Math.sin((fromDeg * Math.PI) / 180); // easterly wind blows westward
  const strength = Math.min(speed / 45, 0.75);
  return Math.round((0.06 + strength) * (toward >= 0 ? 1 : -1) * 100) / 100;
}

export function sceneOf(r: WeatherReport, nowSec = Date.now() / 1000): Scene {
  const info = describeCode(r.code);
  return {
    kind: info.kind,
    phase: dayPhase(nowSec, r.sunrise, r.sunset, r.isDay),
    intensity: info.intensity,
    clouds: info.kind === "clear" ? 0 : Math.max(CLOUDS[info.kind], Math.min(1, r.cloudCover / 100) * 0.9),
    wind: windDrift(r.windSpeed, r.windDirection),
    label: info.label,
  };
}

/** Before any report arrives: a clear sky that follows the clock. */
export function fallbackScene(now = new Date()): Scene {
  const h = now.getHours() + now.getMinutes() / 60;
  const phase: DayPhase = h < 5.5 || h >= 19.5 ? "night" : h < 7 ? "dawn" : h >= 18 ? "dusk" : "day";
  return { kind: "clear", phase, intensity: 0, clouds: 0, wind: 0.1, label: "晴" };
}

// ------------------------------------------------------------------ previews

export const PREVIEWS: { id: string; label: string; scene: Omit<Scene, "label"> }[] = [
  { id: "clear", label: "晴", scene: { kind: "clear", phase: "day", intensity: 0, clouds: 0, wind: 0.1 } },
  { id: "partly", label: "少云", scene: { kind: "partly", phase: "day", intensity: 0, clouds: 0.3, wind: 0.1 } },
  { id: "cloudy", label: "多云", scene: { kind: "cloudy", phase: "day", intensity: 0, clouds: 0.6, wind: 0.15 } },
  { id: "overcast", label: "阴", scene: { kind: "overcast", phase: "day", intensity: 0, clouds: 0.95, wind: 0.15 } },
  { id: "fog", label: "雾", scene: { kind: "fog", phase: "day", intensity: 0.7, clouds: 0.45, wind: 0.05 } },
  { id: "drizzle", label: "毛毛雨", scene: { kind: "drizzle", phase: "day", intensity: 0.4, clouds: 0.75, wind: 0.12 } },
  { id: "rain", label: "雨", scene: { kind: "rain", phase: "day", intensity: 0.65, clouds: 0.88, wind: 0.2 } },
  { id: "heavyRain", label: "大雨", scene: { kind: "heavyRain", phase: "day", intensity: 1, clouds: 1, wind: 0.35 } },
  { id: "thunder", label: "雷雨", scene: { kind: "thunder", phase: "day", intensity: 0.9, clouds: 1, wind: 0.3 } },
  { id: "snow", label: "雪", scene: { kind: "snow", phase: "day", intensity: 0.7, clouds: 0.8, wind: 0.15 } },
  { id: "sleet", label: "雨夹雪", scene: { kind: "sleet", phase: "day", intensity: 0.6, clouds: 0.85, wind: 0.2 } },
  { id: "hail", label: "冰雹", scene: { kind: "hail", phase: "day", intensity: 0.85, clouds: 1, wind: 0.2 } },
  { id: "dusk", label: "黄昏", scene: { kind: "partly", phase: "dusk", intensity: 0, clouds: 0.3, wind: 0.1 } },
  { id: "night", label: "晴夜", scene: { kind: "clear", phase: "night", intensity: 0, clouds: 0, wind: 0.1 } },
  { id: "nightRain", label: "雨夜", scene: { kind: "rain", phase: "night", intensity: 0.65, clouds: 0.9, wind: 0.2 } },
];

export function previewScene(id: string): Scene | null {
  const p = PREVIEWS.find((x) => x.id === id);
  return p ? { ...p.scene, label: p.label } : null;
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

const CLEAR_TWILIGHT: Record<"dawn" | "dusk" | "night", [string, string, string]> = {
  dawn: ["#34528f", "#c97f78", "#f4b98d"],
  dusk: ["#27356f", "#8f5a8c", "#ee9066"],
  night: ["#060a1c", "#111d45", "#22346a"],
};

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
export function skyColors(s: Pick<Scene, "kind" | "phase" | "clouds">): [string, string, string] {
  const day = DAY_SKY[s.kind];
  if (s.phase === "day") return day;
  if (s.kind === "clear" || s.kind === "partly") {
    const t = CLEAR_TWILIGHT[s.phase];
    return s.kind === "clear" ? t : [mix(t[0], day[0], 0.15), mix(t[1], day[1], 0.2), mix(t[2], day[2], 0.2)];
  }
  if (s.phase === "night") return [mix(day[0], "#050812", 0.7), mix(day[1], "#070b18", 0.66), mix(day[2], "#0b1222", 0.6)];
  // Cloudy dawn or dusk: a muted warm glow near the horizon.
  const warm = s.phase === "dawn" ? "#e7a07c" : "#d97a5a";
  const glow = 0.4 * (1 - s.clouds * 0.6);
  return [mix(day[0], "#1f2440", 0.35), mix(day[1], "#6a5068", 0.3), mix(day[2], warm, glow)];
}
