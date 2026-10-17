import { interpolate, interpolateColors } from "remotion";
import { clamp, EASE_IN_OUT } from "./tokens";

export type SkyKey = { f: number; top: string; horizon: string; sun: number; cloud: number; lit: string; shade: string; night: number; rain: number; snow: number };

export const SKY_KEYS: SkyKey[] = [
  { f: 0, top: "#2a74d6", horizon: "#a7dcff", sun: 1, cloud: 0.25, lit: "#ffffff", shade: "#c9dcef", night: 0, rain: 0, snow: 0 },
  { f: 52, top: "#2a74d6", horizon: "#a7dcff", sun: 1, cloud: 0.3, lit: "#ffffff", shade: "#c9dcef", night: 0, rain: 0, snow: 0 },
  { f: 78, top: "#3f4d5e", horizon: "#8794a3", sun: 0, cloud: 0.9, lit: "#9aa6b4", shade: "#4b5563", night: 0, rain: 1, snow: 0 },
  { f: 112, top: "#3f4d5e", horizon: "#8794a3", sun: 0, cloud: 0.9, lit: "#9aa6b4", shade: "#4b5563", night: 0, rain: 1, snow: 0 },
  { f: 134, top: "#7f93aa", horizon: "#dce5ee", sun: 0, cloud: 0.75, lit: "#f2f5f8", shade: "#aab6c3", night: 0, rain: 0, snow: 1 },
  { f: 158, top: "#7f93aa", horizon: "#dce5ee", sun: 0, cloud: 0.75, lit: "#f2f5f8", shade: "#aab6c3", night: 0, rain: 0, snow: 1 },
  { f: 182, top: "#040a1e", horizon: "#1d2d5c", sun: 0, cloud: 0.15, lit: "#3a4a74", shade: "#151d38", night: 1, rain: 0, snow: 0 },
];

export function skyAt(frame: number, keys: SkyKey[] = SKY_KEYS) {
  const fs = keys.map((k) => k.f);
  const num = (pick: (k: SkyKey) => number) => interpolate(frame, fs, keys.map(pick), { ...clamp, easing: EASE_IN_OUT });
  const col = (pick: (k: SkyKey) => string) => interpolateColors(frame, fs, keys.map(pick));
  const rgb = (c: string) => {
    const m = c.match(/[\d.]+/g)!.map(Number);
    return [m[0] / 255, m[1] / 255, m[2] / 255] as const;
  };
  return {
    sky: {
      u_top: rgb(col((k) => k.top)),
      u_horizon: rgb(col((k) => k.horizon)),
      u_sun: num((k) => k.sun),
      u_sunPos: [0.78, 0.76],
      u_cloud: num((k) => k.cloud),
      u_cloudLit: rgb(col((k) => k.lit)),
      u_cloudShade: rgb(col((k) => k.shade)),
      u_night: num((k) => k.night),
    },
    precip: { u_rain: num((k) => k.rain), u_snow: num((k) => k.snow) },
  };
}


/** Fixed weather looks for single-state cards. */
export const SKY_STATES = {
  sunny: SKY_KEYS[0],
  rain: SKY_KEYS[2],
  snow: SKY_KEYS[4],
  night: SKY_KEYS[6],
};
