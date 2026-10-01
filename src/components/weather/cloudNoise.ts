// Procedural cloud textures: domain-warped fractal noise shaped into
// cumulus, stratus or cumulonimbus forms, lit from the sun's (or moon's)
// direction. Pure computation (no DOM) so it can run in a worker.

import type { DayPhase, SkyKind } from "../../core/weather/scene";

export type CloudKind = "cumulus" | "stratus" | "cumulonimbus";
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
  kind: CloudKind;
  palette: CloudPalette;
  /** Overall form (domes, base height). */
  shapeSeed: number;
  /** Fine detail; two detail seeds on one shape give a slowly morphing cloud. */
  detailSeed: number;
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

interface Puff {
  x: number;
  y: number;
  r: number;
  /** Extra height: puffs near the middle of the cloud sit higher. */
  z: number;
}

/**
 * The cloud as a pile of round puffs at several scales (big ones inside,
 * small ones at the edges), like the cauliflower tops of a cumulus.
 */
function makePuffs(kind: CloudKind, seed: number, w: number, h: number): { puffs: Puff[]; base: number } {
  const rnd = mulberry32(seed * 7919 + 13);
  const r = (a: number, b: number) => a + rnd() * (b - a);
  const cb = kind === "cumulonimbus";
  const base = h * (cb ? r(0.8, 0.85) : r(0.74, 0.8));
  // Outline: a few overlapping ellipses (main body plus towers).
  const domes = [{ x: r(0.45, 0.55), y: cb ? 0.58 : 0.62, rx: cb ? 0.36 : r(0.3, 0.36), ry: cb ? 0.3 : r(0.17, 0.21) }];
  const towers = cb ? 4 : 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < towers; i++) domes.push({ x: r(0.3, 0.7), y: cb ? r(0.32, 0.48) : r(0.42, 0.55), rx: r(0.1, 0.16), ry: cb ? r(0.18, 0.24) : r(0.13, 0.2) });
  if (cb) domes.push({ x: r(0.45, 0.58), y: r(0.17, 0.22), rx: r(0.3, 0.38), ry: 0.07 }); // anvil
  const inside = (u: number, v: number) => {
    let best = -1;
    for (const d of domes) {
      const dx = (u - d.x) / d.rx;
      const dy = (v - d.y) / d.ry;
      best = Math.max(best, 1 - (dx * dx + dy * dy));
    }
    return best;
  };
  const puffs: Puff[] = [];
  const count = cb ? 170 : 130;
  let tries = 0;
  while (puffs.length < count && tries++ < count * 30) {
    const u = r(0.06, 0.94);
    const v = r(0.06, 0.94);
    const depth = inside(u, v);
    // Stay inside the outline so no lone bubbles stick out.
    if (depth <= 0.08 || v * h > base + 2) continue;
    const scale = 0.4 + 0.6 * Math.sqrt(depth);
    const rad = w * (cb ? 0.085 : 0.075) * scale * r(0.65, 1.15);
    puffs.push({ x: u * w, y: v * h, r: rad, z: depth * w * 0.06 });
  }
  // Big puffs first so small ones add detail on top.
  puffs.sort((a, b) => b.r - a.r);
  return { puffs, base };
}

/** Height of the cloud surface (<= 0 outside) for cumulus-type clouds. */
function puffHeight(job: Omit<CloudJob, "palette">): { H: Float32Array; base: number } {
  const { w, h } = job;
  const { puffs, base } = makePuffs(job.kind, job.shapeSeed, w, h);
  // Smooth union of the puffs (log-sum-exp), so neighbours merge without seams.
  const k = w * 0.018;
  const S = new Float32Array(w * h);
  for (const p of puffs) {
    const x0 = Math.max(0, Math.floor(p.x - p.r));
    const x1 = Math.min(w - 1, Math.ceil(p.x + p.r));
    const y0 = Math.max(0, Math.floor(p.y - p.r));
    const y1 = Math.min(h - 1, Math.ceil(p.y + p.r));
    const r2 = p.r * p.r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - p.x;
        const dy = y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const z = p.z * (1 - d2 / r2) + Math.sqrt(r2 - d2);
        S[y * w + x] += Math.exp(z / k);
      }
    }
  }
  const H = new Float32Array(w * h);
  for (let i = 0; i < H.length; i++) H[i] = S[i] > 0 ? Math.max(0, k * Math.log(S[i])) : -1;
  return { H, base };
}

/** Stratus: a wide sheet of cloud from warped noise, tileable left to right. */
export function stratusDensity(job: Omit<CloudJob, "palette">): Float32Array {
  const { w, h } = job;
  const noise = new Noise(job.detailSeed);
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
      out[y * w + x] = smoothstep(0, 0.55, env * 0.78 + n * 0.62 - 0.22);
    }
  }
  return out;
}

function renderStratus(job: CloudJob): Uint8ClampedArray {
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

/** RGBA pixels (not premultiplied) for one cloud texture. */
export function renderCloud(job: CloudJob): Uint8ClampedArray {
  if (job.kind === "stratus") return renderStratus(job);
  const { w, h, palette: p, kind } = job;
  const { H, base } = puffHeight(job);
  const noise = new Noise(job.detailSeed);
  const px = new Uint8ClampedArray(w * h * 4);
  const F = 6.5;
  // Soft, worn edges: noise eats into the outline, more where the cloud is thin.
  const soft = w * 0.035;
  const [lx0, ly0] = p.light;
  const lz0 = 0.7;
  const ll = Math.hypot(lx0, ly0, lz0);
  const lx = lx0 / ll;
  const ly = ly0 / ll;
  const lz = lz0 / ll;
  const step = w * 0.02;
  const pl = Math.hypot(lx0, ly0) || 1;
  const sx = (lx0 / pl) * step;
  const sy = (ly0 / pl) * step;
  const hAt = (x: number, y: number) => {
    const xi = Math.min(w - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(h - 1, Math.max(0, Math.round(y)));
    return H[yi * w + xi];
  };
  const underK = kind === "cumulonimbus" ? 0.62 : 0.4;
  const maxH = w * 0.14;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    // Flat, darker base.
    const baseFade = smoothstep(base + soft * 0.6, base - soft * 0.4, y);
    const under = 1 - underK * smoothstep(h * 0.3, base, y);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const z = H[i];
      if (z <= -0.5) continue;
      const nx = (x / w) * F;
      const ny = v * F * (h / w);
      const wx = noise.fbm(nx + 3.1, ny + 7.7, 2, 0);
      const n = noise.fbm(nx + 0.9 * wx, ny + 0.9 * wx, 5, 0);
      const erode = Math.max(0, 0.5 + n * 1.7) * soft;
      const alpha = smoothstep(0, soft, z - erode * 0.9 + soft * 0.25) * baseFade;
      if (alpha < 0.004) continue;
      // Normal of the puff surface, with a little noise for texture.
      const gx = (hAt(x + 1, y) - hAt(x - 1, y)) * 0.5;
      const gy = (hAt(x, y + 1) - hAt(x, y - 1)) * 0.5;
      const tex = n * 0.35;
      const nxv = -gx + tex;
      const nyv = -gy + tex * 0.5;
      const nl = Math.hypot(nxv, nyv, 1);
      const diffuse = Math.max(0, (nxv * lx + nyv * ly + lz) / nl);
      // Cloud piled up between this point and the light.
      let depth = 0;
      for (let k = 1; k <= 4; k++) depth += Math.max(0, hAt(x + sx * k, y + sy * k) - z * 0.6);
      const shade = Math.exp((-depth / maxH) * p.absorb * 0.5);
      // Thin edges let light through.
      const rim = (1 - alpha) * 0.35;
      const light = Math.min(1, (0.38 + 0.72 * diffuse * shade + rim) * under);
      const o = i * 4;
      px[o] = lerp(p.shadow[0], p.lit[0], light);
      px[o + 1] = lerp(p.shadow[1], p.lit[1], light);
      px[o + 2] = lerp(p.shadow[2], p.lit[2], light);
      px[o + 3] = 255 * alpha * p.opacity;
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

export function cloudKindsFor(kind: SkyKind): { puffs: CloudKind; decks: number } {
  switch (kind) {
    case "clear":
      return { puffs: "cumulus", decks: 0 };
    case "partly":
      return { puffs: "cumulus", decks: 0 };
    case "cloudy":
      return { puffs: "cumulus", decks: 1 };
    case "heavyRain":
    case "thunder":
    case "hail":
      return { puffs: "cumulonimbus", decks: 2 };
    case "fog":
      return { puffs: "cumulus", decks: 1 };
    default:
      return { puffs: "cumulus", decks: 2 };
  }
}
