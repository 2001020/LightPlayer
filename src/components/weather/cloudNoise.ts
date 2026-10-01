// Procedural cloud textures: wide, wispy sheets of domain-warped fractal
// noise (stratus), lit from the sun's (or moon's) direction. Pure computation
// (no DOM) so it can run in a worker.

import type { DayPhase, SkyKind } from "../../core/weather/scene";

type RGB = [number, number, number];

export interface CloudPalette {
  /** Colour facing the light. */
  lit: RGB;
  /** Colour of the shaded, thick parts. */
  shadow: RGB;
  /** Direction towards the light in sprite space (+x right, +y down). */
  light: [number, number];
  /** How quickly light dies inside the cloud. */
  absorb: number;
  opacity: number;
}

export interface CloudJob {
  palette: CloudPalette;
  seed: number;
  /** 0..1: a few thin wisps at the low end, an unbroken sheet at 1. */
  cover: number;
  w: number;
  h: number;
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 2D gradient noise, optionally periodic in x (period in lattice cells). */
class Noise {
  private perm = new Uint8Array(512);
  private gx = new Float32Array(256);
  private gy = new Float32Array(256);

  constructor(seed: number) {
    const rnd = mulberry32(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) {
      const a = rnd() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  at(x: number, y: number, period: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const wrap = (i: number) => (period ? ((i % period) + period) % period : i) & 255;
    const x0 = wrap(xi);
    const x1 = wrap(xi + 1);
    const y0 = yi & 255;
    const y1 = (yi + 1) & 255;
    const { perm, gx, gy } = this;
    const h00 = perm[x0 + perm[y0]];
    const h10 = perm[x1 + perm[y0]];
    const h01 = perm[x0 + perm[y1]];
    const h11 = perm[x1 + perm[y1]];
    const n00 = gx[h00] * xf + gy[h00] * yf;
    const n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
    const n01 = gx[h01] * xf + gy[h01] * (yf - 1);
    const n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
    const u = fade(xf);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), fade(yf)) * 1.414;
  }

  fbm(x: number, y: number, octaves: number, period: number): number {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.at(x * f, y * f, period * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

}

/** A wide band of cloud from warped noise, tileable left to right. */
export function stratusDensity(job: Omit<CloudJob, "palette">): Float32Array {
  const { w, h } = job;
  const noise = new Noise(job.seed);
  // Less cover: the band's body fades and only the noise ridges remain (wisps).
  const body = 0.78 * (0.35 + 0.65 * job.cover);
  const cut = 0.22 + (1 - job.cover) * 0.2;
  const F = 6;
  const yScale = (h / w) * F * 2.4;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const env = smoothstep(0, 0.32, v) * smoothstep(1, 0.5, v);
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * F;
      const ny = v * yScale;
      const wx = noise.fbm(nx + 5.2, ny + 1.3, 3, F);
      const wy = noise.fbm(nx + 1.7, ny + 9.2, 3, F);
      const n = noise.fbm(nx + 0.85 * wx, ny + 0.85 * wy, 5, F);
      out[y * w + x] = smoothstep(0, 0.55, env * body + n * 0.62 - cut);
    }
  }
  return out;
}

/** RGBA pixels (not premultiplied) for one cloud texture. */
export function renderCloud(job: CloudJob): Uint8ClampedArray {
  const { w, h, palette: p } = job;
  const dens = stratusDensity(job);
  const px = new Uint8ClampedArray(w * h * 4);
  const len = Math.hypot(p.light[0], p.light[1]) || 1;
  const step = Math.max(2, w * 0.012);
  const lx = (p.light[0] / len) * step;
  const ly = (p.light[1] / len) * step;
  const sample = (x: number, y: number) => {
    const yi = Math.round(y);
    if (yi < 0 || yi >= h) return 0;
    const xi = ((Math.round(x) % w) + w) % w;
    return dens[yi * w + xi];
  };
  for (let y = 0; y < h; y++) {
    const under = 1 - 0.25 * smoothstep(0.35, 0.9, y / h);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = dens[i];
      if (d < 0.004) continue;
      let depth = 0;
      for (let k = 1; k <= 5; k++) depth += sample(x + lx * k, y + ly * k) * (1 - k * 0.12);
      const light = Math.exp(-depth * p.absorb) * under;
      const t = Math.min(1, light * (1 + (1 - d) * 0.45));
      const o = i * 4;
      px[o] = lerp(p.shadow[0], p.lit[0], t);
      px[o + 1] = lerp(p.shadow[1], p.lit[1], t);
      px[o + 2] = lerp(p.shadow[2], p.lit[2], t);
      px[o + 3] = 255 * Math.min(1, d * 1.05) * p.opacity;
    }
  }
  return px;
}

// ------------------------------------------------------------------ looks

const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)].map(Math.round) as RGB;

/** Cloud colours and light direction for a sky. */
export function cloudPalette(kind: SkyKind, phase: DayPhase): CloudPalette {
  let lit: RGB;
  let shadow: RGB;
  let absorb = 0.85;
  let opacity = 0.96;
  switch (kind) {
    case "clear":
    case "partly":
      lit = [255, 255, 255];
      shadow = [150, 166, 192];
      break;
    case "cloudy":
      lit = [248, 250, 253];
      shadow = [138, 152, 174];
      break;
    case "overcast":
      lit = [222, 228, 236];
      shadow = [126, 136, 152];
      absorb = 0.7;
      break;
    case "fog":
      lit = [228, 232, 236];
      shadow = [168, 175, 184];
      absorb = 0.5;
      opacity = 0.85;
      break;
    case "snow":
      lit = [238, 242, 248];
      shadow = [148, 158, 176];
      absorb = 0.7;
      break;
    case "drizzle":
    case "rain":
    case "sleet":
      lit = [198, 206, 218];
      shadow = [98, 108, 124];
      absorb = 0.8;
      break;
    default:
      // heavy rain, thunder, hail
      lit = [168, 176, 194];
      shadow = [46, 52, 66];
      absorb = 1.05;
  }
  // Sun or moon direction: high on the right by day and night, low at the ends of the day.
  let light: [number, number] = [0.55, -0.85];
  if (phase === "dawn" || phase === "dusk") {
    const warm: RGB = phase === "dusk" ? [255, 178, 140] : [255, 206, 176];
    const dusky: RGB = phase === "dusk" ? [112, 88, 128] : [120, 108, 146];
    const k = kind === "clear" || kind === "partly" || kind === "cloudy" ? 0.85 : 0.35;
    lit = mixRGB(lit, warm, k);
    shadow = mixRGB(shadow, dusky, k * 0.8);
    light = [0.8, 0.45];
  } else if (phase === "night") {
    lit = mixRGB(lit, [118, 132, 164], 0.62).map((c) => Math.round(c * 0.7)) as RGB;
    shadow = mixRGB(shadow, [22, 26, 40], 0.7);
    opacity *= 0.92;
  }
  return { lit, shadow, light, absorb, opacity };
}

export interface DeckLayout {
  cover: number;
  /** Top edge and height as fractions of the window height. */
  y: number;
  h: number;
  alpha: number;
  /** Relative drift speed (nearer bands move faster). */
  speed: number;
}

/** The cloud bands for a sky, far (top) to near. `amount` is the scene's cloud cover. */
export function cloudDecks(kind: SkyKind, amount: number): DeckLayout[] {
  const a = Math.min(1, Math.max(0, amount));
  switch (kind) {
    case "clear":
      return [];
    case "partly":
      return [
        { cover: 0.25 + a * 0.25, y: -0.04, h: 0.3, alpha: 0.75, speed: 1 },
        { cover: 0.2 + a * 0.25, y: 0.16, h: 0.28, alpha: 0.6, speed: 1.6 },
      ];
    case "cloudy":
      return [
        { cover: 0.45 + a * 0.2, y: -0.06, h: 0.36, alpha: 0.85, speed: 1 },
        { cover: 0.4 + a * 0.2, y: 0.1, h: 0.34, alpha: 0.75, speed: 1.5 },
        { cover: 0.3 + a * 0.2, y: 0.28, h: 0.3, alpha: 0.6, speed: 2.1 },
      ];
    case "fog":
      return [
        { cover: 0.7, y: -0.06, h: 0.44, alpha: 0.5, speed: 1 },
        { cover: 0.55, y: 0.18, h: 0.4, alpha: 0.4, speed: 1.6 },
      ];
    case "heavyRain":
    case "thunder":
    case "hail":
      return [
        { cover: 1, y: -0.1, h: 0.5, alpha: 1, speed: 1 },
        { cover: 0.9, y: 0.06, h: 0.52, alpha: 0.9, speed: 1.6 },
        { cover: 0.72, y: 0.26, h: 0.42, alpha: 0.75, speed: 2.3 },
      ];
    default:
      // overcast, drizzle, rain, snow, sleet
      return [
        { cover: 0.85 + a * 0.15, y: -0.08, h: 0.44, alpha: 0.95, speed: 1 },
        { cover: 0.7 + a * 0.15, y: 0.06, h: 0.46, alpha: 0.85, speed: 1.6 },
        { cover: 0.5 + a * 0.15, y: 0.24, h: 0.38, alpha: 0.7, speed: 2.3 },
      ];
  }
}
