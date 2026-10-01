// Canvas weather: sun, moon and stars, drifting clouds, fog, rain, snow,
// hail and lightning behind the UI, plus a sparse foreground layer whose
// drops, flakes and hailstones land on the app itself (the play bar, open
// dialogs, cover art): rain splashes, snow piles up in a thin line and
// melts, hail bounces.

import type { Scene } from "../../core/weather/scene";
import { cloudKey, cloudTexture, peekCloud } from "./cloudBank";
import { cloudKindsFor, cloudPalette, type CloudJob } from "./cloudNoise";

type Kind = "rain" | "snow" | "hail";

interface P {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  r: number;
  len: number;
  phase: number;
  bounces: number;
}

/** Short-lived bits: rain splashes, beads on an edge, resting hail. */
interface Bit {
  kind: "splash" | "bead" | "hail";
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  /** Edge the bit belongs to: it disappears below it. */
  floor: number;
}

export interface LedgeRect {
  el: Element;
  left: number;
  right: number;
  top: number;
}

interface Snowline {
  heights: Float32Array;
  width: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const COL = 3; // snow height-map column width (px)
const SNOW_MAX = 6;

function sprite(size: number, paint: (c: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d")!, size);
  return c;
}

function softDot(rgb: string): HTMLCanvasElement {
  return sprite(32, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.45, `rgba(${rgb},0.85)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

function fogSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.save();
  g.scale(1, 0.25);
  const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, "rgba(232,236,240,0.9)");
  grad.addColorStop(0.6, "rgba(232,236,240,0.35)");
  grad.addColorStop(1, "rgba(232,236,240,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.restore();
  return c;
}

/** One generated texture and when it became available. */
interface Tex {
  key: string;
  img: HTMLCanvasElement | null;
  readyAt: number;
}

interface Cloud {
  /** Two textures of the same shape with different detail, cross-faded slowly. */
  a: Tex;
  b: Tex;
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  alpha: number;
  flip: boolean;
  phase: number;
  period: number;
}

/** A tileable sheet of stratus across the top of the sky. */
interface Deck {
  tex: Tex;
  x: number;
  y: number;
  h: number;
  w: number;
  speed: number;
  alpha: number;
}

function texture(job: CloudJob, t: number): Tex {
  const key = cloudKey(job);
  const img = cloudTexture(job, key);
  return { key, img, readyAt: img ? t - 10 : 0 };
}

export class WeatherRenderer {
  private bg: CanvasRenderingContext2D;
  private fg: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private scene: Scene;
  private far: P[] = [];
  private near: P[] = [];
  private bits: Bit[] = [];
  private clouds: Cloud[] = [];
  private decks: Deck[] = [];
  /** No animation: draw everything fully faded in. */
  private still = false;
  private stars: { x: number; y: number; r: number; a: number; f: number; p: number }[] = [];
  private fog: { y: number; hgt: number; x: number; speed: number; a: number }[] = [];
  private ledges: LedgeRect[] = [];
  private snow = new WeakMap<Element, Snowline>();
  private flakeImg = softDot("255,255,255");
  private hailImg = softDot("235,245,255");
  private fogImg = fogSprite();
  private t = 0;
  private nextFlash = rand(3, 8);
  private flashAt = -10;
  private bolt: [number, number][][] | null = null;
  private rainRgb = "225,235,245";

  constructor(bg: HTMLCanvasElement, fg: HTMLCanvasElement, scene: Scene) {
    this.bg = bg.getContext("2d")!;
    this.fg = fg.getContext("2d")!;
    this.scene = scene;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    for (const ctx of [this.bg, this.fg]) {
      ctx.canvas.width = Math.round(w * dpr);
      ctx.canvas.height = Math.round(h * dpr);
      ctx.canvas.style.width = `${w}px`;
      ctx.canvas.style.height = `${h}px`;
    }
    this.build();
  }

  setScene(scene: Scene) {
    const changed = scene.kind !== this.scene.kind || scene.phase !== this.scene.phase || scene.intensity !== this.scene.intensity;
    this.scene = scene;
    if (changed) this.build();
    else for (const p of [...this.far, ...this.near]) p.vx = p.vy * scene.wind * (p.kind === "snow" ? 0.6 : 1);
  }

  setLedges(ledges: LedgeRect[]) {
    this.ledges = ledges;
  }

  private get night() {
    return this.scene.phase === "night";
  }

  // ---------------------------------------------------------------- setup

  private build() {
    if (!this.w) return;
    const s = this.scene;
    const area = Math.min(2.4, (this.w * this.h) / (1280 * 800));
    const k = s.intensity;
    let rain = 0;
    let snow = 0;
    let hail = 0;
    let nearRain = 0;
    let nearSnow = 0;
    let nearHail = 0;
    switch (s.kind) {
      case "drizzle":
        rain = 110 + 120 * k;
        nearRain = 8 + 14 * k;
        break;
      case "rain":
        rain = 150 + 260 * k;
        nearRain = 14 + 40 * k;
        break;
      case "heavyRain":
      case "thunder":
        rain = 380 + 160 * k;
        nearRain = 46 + 30 * k;
        break;
      case "snow":
        snow = 90 + 230 * k;
        nearSnow = 18 + 46 * k;
        break;
      case "sleet":
        rain = 130 + 120 * k;
        snow = 60 + 80 * k;
        nearRain = 12 + 16 * k;
        nearSnow = 8 + 14 * k;
        break;
      case "hail":
        rain = 200 + 100 * k;
        hail = 50 + 40 * k;
        nearRain = 18;
        nearHail = 16 + 14 * k;
        break;
    }
    const n = (x: number, cap: number) => Math.min(cap, Math.round(x * area));
    this.far = [];
    this.near = [];
    for (let i = 0; i < n(rain, 600); i++) this.far.push(this.spawn("rain", false, true));
    for (let i = 0; i < n(snow, 450); i++) this.far.push(this.spawn("snow", false, true));
    for (let i = 0; i < n(hail, 140); i++) this.far.push(this.spawn("hail", false, true));
    for (let i = 0; i < n(nearRain, 110); i++) this.near.push(this.spawn("rain", true, true));
    for (let i = 0; i < n(nearSnow, 90); i++) this.near.push(this.spawn("snow", true, true));
    for (let i = 0; i < n(nearHail, 40); i++) this.near.push(this.spawn("hail", true, true));
    this.bits = [];
    this.rainRgb = this.night ? "160,178,206" : s.kind === "thunder" || s.kind === "hail" ? "200,210,226" : "226,236,246";
    this.buildClouds();
    this.buildStars();
    this.fog = [];
    if (s.kind === "fog") {
      for (let i = 0; i < 7; i++) {
        this.fog.push({ y: rand(0.2, 1.0) * this.h, hgt: rand(0.16, 0.32) * this.h, x: rand(0, this.w), speed: rand(5, 14), a: rand(0.22, 0.4) * (0.6 + k * 0.6) });
      }
    }
  }

  private spawn(kind: Kind, near: boolean, anywhere: boolean): P {
    const s = this.scene;
    const drizzle = s.kind === "drizzle";
    const z = near ? rand(1.15, 1.5) : rand(0.25, 1);
    let vy: number;
    let r = 0;
    let len = 0;
    if (kind === "rain") {
      vy = (drizzle ? 360 : 760) + (drizzle ? 220 : 560) * z;
      len = (drizzle ? 5 : 12) + (drizzle ? 6 : 17) * z;
    } else if (kind === "snow") {
      vy = 22 + 58 * z;
      r = 0.8 + 2.3 * z;
    } else {
      vy = 640 + 360 * z;
      r = 1.2 + 1.5 * z;
    }
    const drift = s.wind * (kind === "snow" ? 0.6 : 1);
    const spread = Math.abs(drift) * this.h;
    const x = rand(drift > 0 ? -spread : 0, this.w + (drift < 0 ? spread : 0));
    const y = anywhere ? rand(-this.h * 0.1, this.h) : rand(-this.h * 0.25, -len - r);
    return { kind, x, y, z, vx: vy * drift, vy, r, len, phase: rand(0, Math.PI * 2), bounces: 0 };
  }

  private buildClouds() {
    const s = this.scene;
    this.clouds = [];
    this.decks = [];
    if (s.clouds <= 0.01) return;
    const { puffs, decks } = cloudKindsFor(s.kind);
    const palette = cloudPalette(s.kind, s.phase);
    const cb = puffs === "cumulonimbus";
    const [tw, th] = cb ? [512, 288] : [448, 224];
    const t = this.t;
    const scaleBase = Math.min(1.7, Math.max(0.75, this.w / 1280));
    const count = cb ? 3 + Math.round(s.clouds * 3) : Math.max(3, Math.round(s.clouds * (decks ? 8 : 13)));
    const shapes = 5;
    for (let i = 0; i < count; i++) {
      const layer = i % 3;
      const shape = (i % shapes) + 1 + (cb ? 100 : 0);
      const job = (detail: number): CloudJob => ({ kind: puffs, palette, shapeSeed: shape, detailSeed: shape * 31 + detail, w: tw, h: th });
      const w = tw * scaleBase * (0.8 + layer * 0.38) * rand(0.85, 1.2) * (cb ? 1.35 : 1);
      const h = (w * th) / tw;
      this.clouds.push({
        a: texture(job(1), t),
        b: texture(job(2), t),
        x: rand(-0.3, 1.05) * this.w,
        y: rand(-0.12, 0.08 + 0.3 * s.clouds) * this.h - h * 0.2 + (cb ? this.h * 0.05 : 0),
        w,
        h,
        speed: (4 + layer * 6) * (1 + Math.abs(s.wind) * 2.2) * (s.wind < 0 ? -1 : 1),
        alpha: Math.min(1, (decks ? 0.78 : 0.85) + layer * 0.07) * (this.night ? 0.9 : 1),
        flip: Math.random() < 0.5,
        phase: rand(0, Math.PI * 2),
        period: rand(40, 80),
      });
    }
    // Far clouds first.
    this.clouds.sort((a, b) => a.w - b.w);
    for (let d = 0; d < decks; d++) {
      const job: CloudJob = { kind: "stratus", palette, shapeSeed: 0, detailSeed: 200 + d, w: 768, h: 192 };
      const light = s.kind === "cloudy" || s.kind === "fog";
      this.decks.push({
        tex: texture(job, t),
        x: rand(0, this.w),
        y: (d ? 0.06 : -0.08) * this.h,
        h: this.h * (d ? 0.48 : 0.42) * (cb ? 1.15 : 1),
        w: this.w * 1.3,
        speed: (3 + d * 5) * (1 + Math.abs(s.wind) * 2) * (s.wind < 0 ? -1 : 1),
        alpha: (d ? 0.8 : 0.95) * (light ? 0.5 : 1),
      });
    }
  }

  /** Fade-in factor for a texture (0 until generated). */
  private shown(tex: Tex): number {
    if (!tex.img) {
      tex.img = peekCloud(tex.key);
      if (!tex.img) return 0;
      tex.readyAt = this.t;
    }
    return this.still ? 1 : Math.min(1, (this.t - tex.readyAt) / 0.8);
  }

  private drawClouds(dt: number, boost = 0) {
    const { bg, w } = this;
    // The lightning pass (boost) only re-lights the cloud puffs.
    for (const d of boost ? [] : this.decks) {
      const k = this.shown(d.tex);
      d.x = (((d.x + d.speed * dt) % d.w) + d.w) % d.w;
      if (!k || !d.tex.img) continue;
      bg.globalAlpha = (boost || d.alpha) * k;
      // Tileable: two copies side by side cover the window.
      for (let x = d.x - d.w; x < w; x += d.w) bg.drawImage(d.tex.img, x, d.y, d.w, d.h);
    }
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.speed > 0 && c.x > w + 40) c.x = -c.w - rand(0, 200);
      if (c.speed < 0 && c.x < -c.w - 40) c.x = w + rand(0, 200);
      const ka = this.shown(c.a);
      if (!ka || !c.a.img) continue;
      const kb = this.shown(c.b);
      // Slowly morphing: the second texture fades in and out over the first.
      const m = kb && !boost ? (0.5 + 0.5 * Math.sin((this.t * Math.PI * 2) / c.period + c.phase)) * kb : 0;
      const alpha = (boost || c.alpha) * ka;
      this.blit(c.a.img, c, alpha);
      if (m > 0.01 && c.b.img) this.blit(c.b.img, c, alpha * m);
    }
    bg.globalAlpha = 1;
  }

  private blit(img: HTMLCanvasElement, c: Cloud, alpha: number) {
    const { bg } = this;
    bg.globalAlpha = alpha;
    if (!c.flip) {
      bg.drawImage(img, c.x, c.y, c.w, c.h);
      return;
    }
    bg.save();
    bg.translate(c.x + c.w, c.y);
    bg.scale(-1, 1);
    bg.drawImage(img, 0, 0, c.w, c.h);
    bg.restore();
  }

  private buildStars() {
    this.stars = [];
    if (!this.night || this.scene.clouds > 0.7) return;
    const count = Math.round(150 * (1 - this.scene.clouds) * Math.min(2, (this.w * this.h) / (1280 * 800)));
    for (let i = 0; i < count; i++) {
      this.stars.push({ x: rand(0, this.w), y: rand(0, this.h * 0.75), r: rand(0.4, 1.4), a: rand(0.35, 0.95), f: rand(0.6, 2.2), p: rand(0, 6.3) });
    }
  }

  // ---------------------------------------------------------------- frame

  /** Advances by `dt` seconds and draws. With `animate` false only the still parts are drawn. */
  frame(dt: number, animate: boolean) {
    this.t += dt;
    this.still = !animate;
    const { bg, fg, dpr } = this;
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    fg.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg.clearRect(0, 0, this.w, this.h);
    fg.clearRect(0, 0, this.w, this.h);
    this.drawSky(animate ? dt : 0);
    if (!animate) return;
    this.step(dt);
    this.drawFar();
    this.drawNear();
    this.drawSnowlines(dt);
    this.drawLightning();
  }

  private drawSky(dt: number) {
    const { bg, w, h, t } = this;
    const s = this.scene;
    // Stars.
    for (const st of this.stars) {
      bg.globalAlpha = st.a * (0.65 + 0.35 * Math.sin(t * st.f + st.p));
      bg.fillStyle = "#fff";
      bg.fillRect(st.x, st.y, st.r, st.r);
    }
    bg.globalAlpha = 1;
    // Sun or moon.
    const sunny = (s.kind === "clear" || s.kind === "partly") && !this.night;
    if (sunny) this.drawSun(s.phase === "day" ? 1 : 0.75);
    if (this.night && s.clouds < 0.75) this.drawMoon(1 - s.clouds);
    if ((s.phase === "dawn" || s.phase === "dusk") && s.clouds < 0.8) {
      const g = bg.createRadialGradient(w * 0.7, h * 1.05, 0, w * 0.7, h * 1.05, Math.max(w, h) * 0.75);
      g.addColorStop(0, `rgba(255,170,110,${0.35 * (1 - s.clouds)})`);
      g.addColorStop(1, "rgba(255,170,110,0)");
      bg.fillStyle = g;
      bg.fillRect(0, 0, w, h);
    }
    this.drawClouds(dt);
    // Fog.
    if (this.fog.length) {
      bg.fillStyle = `rgba(214,220,226,${0.12 + 0.12 * s.intensity})`;
      bg.fillRect(0, 0, w, h);
      for (const f of this.fog) {
        f.x = (f.x + f.speed * dt) % (w * 1.4);
        bg.globalAlpha = f.a;
        const fw = w * 1.4;
        bg.drawImage(this.fogImg, f.x - fw, f.y - f.hgt / 2, fw, f.hgt);
        bg.drawImage(this.fogImg, f.x, f.y - f.hgt / 2, fw, f.hgt);
      }
      bg.globalAlpha = 1;
    }
  }

  private drawSun(strength: number) {
    const { bg, w, h, t } = this;
    const low = this.scene.phase !== "day";
    const cx = w * 0.84;
    const cy = low ? h * 0.78 : h * 0.1;
    const R = Math.max(w, h) * 0.55;
    const glow = bg.createRadialGradient(cx, cy, 0, cx, cy, R);
    const warm = low ? "255,196,140" : "255,244,214";
    glow.addColorStop(0, `rgba(${warm},${0.6 * strength})`);
    glow.addColorStop(0.18, `rgba(${warm},${0.22 * strength})`);
    glow.addColorStop(1, `rgba(${warm},0)`);
    bg.fillStyle = glow;
    bg.fillRect(0, 0, w, h);
    // Slowly turning rays.
    bg.save();
    bg.translate(cx, cy);
    bg.rotate(t * 0.015);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      bg.rotate((Math.PI * 2) / rays);
      const g = bg.createLinearGradient(0, 0, R * 0.9, 0);
      g.addColorStop(0, `rgba(255,250,235,${0.08 * strength})`);
      g.addColorStop(1, "rgba(255,250,235,0)");
      bg.fillStyle = g;
      bg.beginPath();
      bg.moveTo(0, 0);
      bg.lineTo(R * 0.9, -R * 0.05);
      bg.lineTo(R * 0.9, R * 0.05);
      bg.closePath();
      bg.fill();
    }
    bg.restore();
    // Disc.
    const disc = bg.createRadialGradient(cx, cy, 0, cx, cy, 46);
    disc.addColorStop(0, `rgba(255,255,250,${0.95 * strength})`);
    disc.addColorStop(0.55, `rgba(255,250,230,${0.75 * strength})`);
    disc.addColorStop(1, "rgba(255,250,230,0)");
    bg.fillStyle = disc;
    bg.beginPath();
    bg.arc(cx, cy, 46, 0, Math.PI * 2);
    bg.fill();
    // A faint lens flare across the sky.
    for (const [f, r, a] of [
      [0.35, 18, 0.07],
      [0.55, 34, 0.05],
      [0.8, 12, 0.08],
    ] as const) {
      const x = cx + (w * 0.35 - cx) * f;
      const y = cy + (h * 0.6 - cy) * f;
      bg.fillStyle = `rgba(255,255,255,${a * strength})`;
      bg.beginPath();
      bg.arc(x, y, r, 0, Math.PI * 2);
      bg.fill();
    }
  }

  private drawMoon(strength: number) {
    const { bg, w, h } = this;
    const cx = w * 0.8;
    const cy = h * 0.14;
    const glow = bg.createRadialGradient(cx, cy, 0, cx, cy, 160);
    glow.addColorStop(0, `rgba(220,228,255,${0.3 * strength})`);
    glow.addColorStop(1, "rgba(220,228,255,0)");
    bg.fillStyle = glow;
    bg.fillRect(cx - 160, cy - 160, 320, 320);
    bg.fillStyle = `rgba(244,241,230,${0.95 * strength})`;
    bg.beginPath();
    bg.arc(cx, cy, 24, 0, Math.PI * 2);
    bg.fill();
    bg.fillStyle = `rgba(200,198,190,${0.35 * strength})`;
    for (const [dx, dy, r] of [
      [-7, -5, 5],
      [6, 4, 4],
      [-2, 9, 3],
    ]) {
      bg.beginPath();
      bg.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
      bg.fill();
    }
  }

  private step(dt: number) {
    const { w, h } = this;
    for (let i = 0; i < this.far.length; i++) {
      const p = this.far[i];
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      if (p.kind === "snow") p.x += Math.sin(this.t * (0.6 + p.z) + p.phase) * 16 * p.z * dt;
      if (p.y - p.len > h || p.x < -w * 0.6 || p.x > w * 1.6) this.far[i] = this.spawn(p.kind, false, false);
    }
    for (let i = 0; i < this.near.length; i++) {
      const p = this.near[i];
      const y0 = p.y;
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      if (p.kind === "snow") p.x += Math.sin(this.t * 0.9 + p.phase) * 22 * dt;
      if (p.kind === "hail" && p.bounces > 0) p.vy += 1800 * dt;
      const hit = this.hitLedge(p, y0);
      if (hit) {
        if (!this.land(p, hit)) this.near[i] = this.spawn(p.kind, true, false);
      } else if (p.y - p.len > h || p.x < -w * 0.6 || p.x > w * 1.6) {
        this.near[i] = this.spawn(p.kind, true, false);
      }
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.kind !== "bead") {
        b.vy += 1400 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.kind === "hail" && b.y > b.floor && b.vy > 0) {
          b.y = b.floor;
          b.vy = 0;
          b.vx *= 0.9;
        }
      }
      if (b.life <= 0 || (b.kind === "splash" && b.vy > 0 && b.y > b.floor + 1)) this.bits.splice(i, 1);
    }
  }

  private snowAt(l: LedgeRect, x: number): number {
    const line = this.snow.get(l.el);
    if (!line) return 0;
    return line.heights[Math.floor((x - l.left) / COL)] ?? 0;
  }

  /** The first ledge whose top edge the particle crossed this frame. */
  private hitLedge(p: P, y0: number): LedgeRect | null {
    let best: LedgeRect | null = null;
    for (const l of this.ledges) {
      if (p.x < l.left || p.x > l.right) continue;
      const top = p.kind === "snow" ? l.top - this.snowAt(l, p.x) : l.top;
      if (y0 <= top && p.y >= top && (!best || l.top < best.top)) best = l;
    }
    return best;
  }

  /** Lands a near particle on a ledge; returns true when it keeps going (a bouncing hailstone). */
  private land(p: P, l: LedgeRect): boolean {
    if (p.kind === "rain") {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        this.bits.push({ kind: "splash", x: p.x, y: l.top - 1, vx: rand(-120, 120) + p.vx * 0.15, vy: rand(-230, -90), r: rand(0.8, 1.5), life: rand(0.3, 0.5), max: 0.5, floor: l.top });
      }
      if (Math.random() < 0.22) this.bits.push({ kind: "bead", x: p.x, y: l.top - 1.5, vx: 0, vy: 0, r: rand(1.4, 2.4), life: rand(0.8, 1.4), max: 1.4, floor: l.top });
      return false;
    }
    if (p.kind === "snow") {
      this.addSnow(l, p.x, 0.55 + p.r * 0.25);
      return false;
    }
    // Hail bounces once or twice, then comes to rest and fades.
    if (p.bounces < 2) {
      p.bounces++;
      p.y = l.top - 0.5;
      p.vy = -Math.abs(p.vy) * (p.bounces === 1 ? 0.32 : 0.22);
      p.vx = rand(-90, 90);
      return true;
    }
    this.bits.push({ kind: "hail", x: p.x, y: l.top - p.r, vx: p.vx * 0.3, vy: 0, r: p.r, life: rand(0.5, 0.9), max: 0.9, floor: l.top - p.r });
    return false;
  }

  private snowline(l: LedgeRect): Snowline {
    const width = l.right - l.left;
    let line = this.snow.get(l.el);
    const cols = Math.max(1, Math.ceil(width / COL));
    if (!line || line.heights.length !== cols) {
      const heights = new Float32Array(cols);
      if (line) for (let i = 0; i < cols; i++) heights[i] = line.heights[Math.floor((i / cols) * line.heights.length)] ?? 0;
      line = { heights, width };
      this.snow.set(l.el, line);
    }
    return line;
  }

  private addSnow(l: LedgeRect, x: number, amount: number) {
    const { heights } = this.snowline(l);
    const c = Math.floor((x - l.left) / COL);
    for (let d = -3; d <= 3; d++) {
      const i = c + d;
      if (i < 0 || i >= heights.length) continue;
      heights[i] = Math.min(SNOW_MAX, heights[i] + amount * Math.exp(-(d * d) / 3));
    }
  }

  private drawFar() {
    const { bg } = this;
    // Rain in three depth buckets, one stroke each.
    const buckets: P[][] = [[], [], []];
    for (const p of this.far) {
      if (p.kind === "rain") buckets[p.z < 0.5 ? 0 : p.z < 0.78 ? 1 : 2].push(p);
    }
    const widths = [0.7, 1, 1.3];
    const alphas = [0.16, 0.26, 0.36];
    buckets.forEach((list, i) => {
      if (!list.length) return;
      bg.strokeStyle = `rgba(${this.rainRgb},${alphas[i]})`;
      bg.lineWidth = widths[i];
      bg.lineCap = "round";
      bg.beginPath();
      for (const p of list) {
        const k = p.len / p.vy;
        bg.moveTo(p.x, p.y);
        bg.lineTo(p.x - p.vx * k, p.y - p.len);
      }
      bg.stroke();
    });
    for (const p of this.far) {
      if (p.kind === "rain") continue;
      const img = p.kind === "snow" ? this.flakeImg : this.hailImg;
      const d = p.r * (p.kind === "snow" ? 2.6 : 2.2);
      bg.globalAlpha = p.kind === "snow" ? 0.35 + 0.55 * p.z : 0.7;
      bg.drawImage(img, p.x - d / 2, p.y - d / 2, d, d);
    }
    bg.globalAlpha = 1;
  }

  private drawNear() {
    const { fg } = this;
    fg.strokeStyle = `rgba(${this.rainRgb},0.34)`;
    fg.lineWidth = 1.5;
    fg.lineCap = "round";
    fg.beginPath();
    for (const p of this.near) {
      if (p.kind !== "rain") continue;
      const k = p.len / p.vy;
      fg.moveTo(p.x, p.y);
      fg.lineTo(p.x - p.vx * k, p.y - p.len);
    }
    fg.stroke();
    for (const p of this.near) {
      if (p.kind === "rain") continue;
      const img = p.kind === "snow" ? this.flakeImg : this.hailImg;
      const d = p.r * 2.6;
      fg.globalAlpha = p.kind === "snow" ? 0.92 : 0.95;
      fg.drawImage(img, p.x - d / 2, p.y - d / 2, d, d);
    }
    for (const b of this.bits) {
      const a = Math.max(0, Math.min(1, b.life / (b.max * 0.5)));
      if (b.kind === "hail") {
        fg.globalAlpha = a;
        const d = b.r * 2.4;
        fg.drawImage(this.hailImg, b.x - d / 2, b.y - d / 2, d, d);
        continue;
      }
      fg.globalAlpha = a * (b.kind === "bead" ? 0.85 : 0.7);
      fg.fillStyle = `rgb(${this.rainRgb})`;
      fg.beginPath();
      const r = b.kind === "bead" ? b.r * (0.6 + 0.4 * (1 - b.life / b.max)) : b.r;
      fg.arc(b.x, b.y, r, 0, Math.PI * 2);
      fg.fill();
      if (b.kind === "bead") {
        fg.fillStyle = "rgba(255,255,255,0.9)";
        fg.beginPath();
        fg.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.35, 0, Math.PI * 2);
        fg.fill();
      }
    }
    fg.globalAlpha = 1;
  }

  private drawSnowlines(dt: number) {
    const { fg } = this;
    const snowing = this.scene.kind === "snow" || this.scene.kind === "sleet";
    fg.fillStyle = "rgba(255,255,255,0.93)";
    fg.strokeStyle = "rgba(205,218,235,0.7)";
    fg.lineWidth = 0.8;
    for (const l of this.ledges) {
      const line = this.snow.get(l.el);
      if (!line) continue;
      const hs = line.heights;
      let any = false;
      for (let i = 0; i < hs.length; i++) {
        // Melts slowly; faster when it is no longer snowing or the pile is high.
        const melt = (snowing ? 0.05 : 1.2) + (hs[i] > 4 ? 0.3 : 0);
        hs[i] = Math.max(0, hs[i] - melt * dt);
        if (hs[i] > 0.15) any = true;
      }
      if (!any) continue;
      const step = (l.right - l.left) / hs.length;
      fg.beginPath();
      fg.moveTo(l.left, l.top);
      for (let i = 0; i < hs.length; i++) fg.lineTo(l.left + (i + 0.5) * step, l.top - hs[i]);
      fg.lineTo(l.right, l.top);
      fg.closePath();
      fg.fill();
      fg.stroke();
    }
  }

  private drawLightning() {
    const s = this.scene;
    if (s.kind !== "thunder" && s.kind !== "hail") return;
    const { bg, fg, w, h } = this;
    if (this.t >= this.nextFlash) {
      this.flashAt = this.t;
      this.nextFlash = this.t + rand(4, 12);
      this.bolt = Math.random() < 0.6 ? this.makeBolt() : null;
    }
    const e = this.t - this.flashAt;
    if (e > 0.9) return;
    const env = e < 0.07 ? 1 : e < 0.15 ? 0.25 : e < 0.24 ? 0.85 : Math.max(0, 1 - (e - 0.24) / 0.6) * 0.55;
    bg.fillStyle = `rgba(222,230,255,${env * 0.3})`;
    bg.fillRect(0, 0, w, h);
    // The flash lights the clouds from inside.
    if (env > 0.15) {
      bg.globalCompositeOperation = "lighter";
      this.drawClouds(0, env * 0.35);
      bg.globalCompositeOperation = "source-over";
    }
    fg.fillStyle = `rgba(255,255,255,${env * 0.08})`;
    fg.fillRect(0, 0, w, h);
    if (this.bolt) {
      for (const [lw, a] of [
        [7, 0.18],
        [2.2, 0.95],
      ] as const) {
        bg.strokeStyle = `rgba(235,240,255,${a * env})`;
        bg.lineWidth = lw;
        bg.lineJoin = "round";
        for (const path of this.bolt) {
          bg.beginPath();
          path.forEach(([x, y], i) => (i ? bg.lineTo(x, y) : bg.moveTo(x, y)));
          bg.stroke();
        }
      }
    }
  }

  private makeBolt(): [number, number][][] {
    const { w, h } = this;
    const main: [number, number][] = [];
    let x = rand(0.15, 0.85) * w;
    let y = 0;
    const end = rand(0.35, 0.62) * h;
    while (y < end) {
      main.push([x, y]);
      y += rand(10, 26);
      x += rand(-18, 18);
    }
    const paths = [main];
    for (let b = 0; b < 2; b++) {
      const from = main[Math.floor(rand(0.25, 0.75) * main.length)];
      if (!from) continue;
      const br: [number, number][] = [from];
      let [bx, by] = from;
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 6; i++) {
        bx += dir * rand(6, 20);
        by += rand(8, 20);
        br.push([bx, by]);
      }
      paths.push(br);
    }
    return paths;
  }
}
