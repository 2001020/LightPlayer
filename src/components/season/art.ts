// The season theme's landscapes, drawn as SVG: each season is a layered scene
// (sky things, far mountains, hills, water, trees, a foreground), put together
// from a few drawing routines and a seeded random source, so every start
// shows the same picture.
//
// The canvas is 1600 wide and anchored to the bottom of the window; the
// horizon sits around y = 600 and the scenes are composed down to y = 900.
// Below that is a strip of plain foreground, which the playback bar covers.
// Strong detail stays in the lower third, where the page has no text of its own.

import type { Season } from "../../core/season";

type P = [number, number];
type Rng = () => number;

const W = 1600;
const H = 970;

/** Seeded random numbers in [0, 1). */
function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const between = (r: Rng, a: number, b: number) => a + r() * (b - a);
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** A smooth curve through the points. */
function smooth(pts: P[]): string {
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

interface Line {
  pts: P[];
  /** Height of the line at x. */
  at: (x: number) => number;
}

function line(pts: P[]): Line {
  return {
    pts,
    at: (x) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        if (x <= x1) {
          const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
          // Eased like the curve drawn through the points.
          const s = t * t * (3 - 2 * t);
          return y0 + (y1 - y0) * s;
        }
      }
      return pts[pts.length - 1][1];
    },
  };
}

/** Rolling ground: a few broad waves around `y`. */
function hills(r: Rng, y: number, amp: number, count: number, tilt = 0): Line {
  const pts: P[] = [];
  for (let i = 0; i <= count; i++) {
    const x = -60 + ((W + 120) * i) / count;
    pts.push([x, y + (r() - 0.5) * 2 * amp + tilt * (i / count - 0.5)]);
  }
  return line(pts);
}

/** The area under a line down to the bottom edge. */
const fillUnder = (l: Line, curved = true) =>
  `${curved ? smooth(l.pts) : "M" + l.pts.map((p) => `${n(p[0])} ${n(p[1])}`).join("L")}L${n(l.pts[l.pts.length - 1][0])} ${H}L${n(l.pts[0][0])} ${H}Z`;

/** A mountain range: peaks and saddles with a craggy outline. */
function range(r: Rng, base: number, height: number, peaks: number, x0 = -80, x1 = W + 80): { outline: Line; tops: P[] } {
  let pts: P[] = [];
  const tops: P[] = [];
  for (let i = 0; i <= peaks * 2; i++) {
    const x = x0 + ((x1 - x0) * i) / (peaks * 2) + (i > 0 && i < peaks * 2 ? between(r, -0.3, 0.3) * ((x1 - x0) / (peaks * 2)) : 0);
    const peak = i % 2 === 1;
    const y = peak ? base - height * between(r, 0.55, 1) : base - height * between(r, 0.05, 0.3);
    pts.push([x, y]);
    if (peak) tops.push([x, y]);
  }
  // Break every slope twice so it reads as rock, not as a zigzag.
  for (let pass = 0; pass < 2; pass++) {
    const next: P[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const k = between(r, 0.35, 0.65);
      const span = Math.abs(by - ay);
      next.push([ax + (bx - ax) * k, ay + (by - ay) * k + between(r, -0.16, 0.16) * span], pts[i + 1]);
    }
    pts = next;
  }
  return { outline: line(pts), tops };
}

/** The shaded side and the ridge lines of a mountain range, lit from the left. */
function facets(r: Rng, m: { outline: Line; tops: P[] }, base: number, shade: string, opacity: number): string {
  let out = "";
  const pts = m.outline.pts;
  for (const [tx, ty] of m.tops) {
    const i = pts.findIndex((p) => p[0] === tx && p[1] === ty);
    if (i < 0) continue;
    // Down the right-hand slope to the next saddle.
    let j = i;
    while (j < pts.length - 1 && pts[j + 1][1] > pts[j][1] - 4) j++;
    const edge = pts.slice(i, j + 1);
    // A spine wandering down from the top.
    const spine: P[] = [];
    const depth = base - ty;
    const steps = 5;
    let sx = tx;
    for (let s = 1; s <= steps; s++) {
      sx += between(r, -6, 22) * (depth / 160);
      spine.push([sx, ty + (depth * s) / steps]);
    }
    const poly = [...edge, [edge[edge.length - 1][0], base] as P, ...spine.reverse()];
    out += `M${poly.map((p) => `${n(p[0])} ${n(p[1])}`).join("L")}Z`;
  }
  return `<path d="${out}" fill="${shade}" opacity="${opacity}"/>`;
}

/** Snow on the tops of a range: down to `reach` of each peak's height, with a ragged lower edge. */
function snowcaps(r: Rng, m: { outline: Line; tops: P[] }, base: number, reach: number, fill: string): string {
  let out = "";
  const pts = m.outline.pts;
  for (const [tx, ty] of m.tops) {
    const limit = ty + (base - ty) * reach;
    const i = pts.findIndex((p) => p[0] === tx && p[1] === ty);
    let a = i;
    while (a > 0 && pts[a - 1][1] < limit) a--;
    let b = i;
    while (b < pts.length - 1 && pts[b + 1][1] < limit) b++;
    if (a === b) continue;
    const top = pts.slice(a, b + 1);
    const lower: P[] = [];
    const [lx, ly] = top[0];
    const [rx, ry] = top[top.length - 1];
    const teeth = 5 + Math.floor(r() * 3);
    for (let t = 0; t <= teeth; t++) {
      const k = t / teeth;
      const y = ly + (ry - ly) * k + (t % 2 ? between(r, 10, 26) : between(r, -6, 4)) * ((base - ty) / 220);
      lower.push([rx + (lx - rx) * k, Math.max(y, m.outline.at(rx + (lx - rx) * k) + 2)]);
    }
    out += `M${[...top, ...lower].map((p) => `${n(p[0])} ${n(p[1])}`).join("L")}Z`;
  }
  return `<path d="${out}" fill="${fill}"/>`;
}

/** A cloud with a level base, built from a few big puffs; `tone` is [body, shade]. */
function cloud(r: Rng, cx: number, base: number, width: number, height: number, tone: [string, string], opacity = 1): string {
  const puffs: [number, number, number][] = [];
  const count = Math.max(3, Math.round(width / 58));
  for (let i = 0; i < count; i++) {
    const k = i / (count - 1);
    // Tallest a little off the middle, small at the ends.
    const rr = (height / 2) * (0.46 + 0.54 * Math.sin(Math.PI * (0.1 + k * 0.8)) ** 1.4) * between(r, 0.85, 1.15);
    puffs.push([cx - width * 0.36 + width * 0.72 * k, base - rr * 0.92, rr]);
  }
  const crown = puffs[Math.floor(count / 2)];
  puffs.push([crown[0] + between(r, -0.12, 0.12) * width, crown[1] - crown[2] * 0.62, crown[2] * 0.74]);
  if (count > 4) {
    const second = puffs[1 + Math.floor(r() * (count - 2))];
    puffs.push([second[0] + between(r, -8, 8), second[1] - second[2] * 0.5, second[2] * 0.62]);
  }
  const circles = (dx: number, dy: number, grow: number, fill: string) => puffs.map(([x, y, rr]) => `<circle cx="${n(x + dx)}" cy="${n(y + dy)}" r="${n(rr * grow)}" fill="${fill}"/>`).join("");
  // A low mound closes the gaps along the base.
  const mound = (fill: string, lift: number) => `<ellipse cx="${n(cx)}" cy="${n(base - height * 0.2 - lift)}" rx="${n(width / 2)}" ry="${n(height * 0.2)}" fill="${fill}"/>`;
  return `<g opacity="${opacity}" filter="url(#ss-soft)">${circles(0, 0, 1, tone[1])}${mound(tone[1], 0)}${circles(-height * 0.02, -height * 0.085, 0.93, tone[0])}${mound(tone[0], height * 0.09)}</g>`;
}

/** A thunderhead: puffs heaped up from a level base, each casting a little shade on the ones behind. */
function thunderhead(r: Rng, cx: number, base: number, width: number, height: number, tone: [string, string]): string {
  let out = "";
  const levels = 5;
  for (let l = levels - 1; l >= 0; l--) {
    const k = l / (levels - 1);
    const w = width * (1 - k * 0.72);
    const count = Math.max(2, Math.round(w / (width * 0.14)) + 1);
    for (let i = 0; i < count; i++) {
      const rr = width * between(r, 0.085, 0.125) * (1 - k * 0.12);
      const x = cx + width * 0.05 * k + (i / (count - 1) - 0.5) * (w - rr) + between(r, -0.015, 0.015) * width;
      const y = Math.min(base - rr * 0.78, base - rr * 0.8 - height * k * 0.8 + between(r, -0.03, 0.03) * height);
      out += `<circle cx="${n(x + rr * 0.1)}" cy="${n(y + rr * 0.16)}" r="${n(rr)}" fill="${tone[1]}"/><circle cx="${n(x - rr * 0.04)}" cy="${n(y - rr * 0.07)}" r="${n(rr * 0.97)}" fill="${tone[0]}"/>`;
    }
  }
  return `<g filter="url(#ss-soft)">${out}<ellipse cx="${n(cx)}" cy="${n(base - 3)}" rx="${n(width * 0.52)}" ry="${n(height * 0.045)}" fill="${tone[1]}"/></g>`;
}

/** A thin streak of high cloud. */
function wisp(r: Rng, cx: number, cy: number, width: number, fill: string, opacity: number): string {
  let out = "";
  for (let i = 0; i < 3; i++) {
    const w = width * between(r, 0.5, 1);
    out += `<ellipse cx="${n(cx + between(r, -0.2, 0.2) * width)}" cy="${n(cy + i * 7 + between(r, -3, 3))}" rx="${n(w / 2)}" ry="${n(between(r, 3, 6.5))}" fill="${fill}"/>`;
  }
  return `<g opacity="${opacity}">${out}</g>`;
}

/** Birds in the distance: shallow wing strokes. */
function birds(list: [number, number, number][], stroke: string, opacity = 0.7): string {
  const d = list.map(([x, y, s]) => `M${n(x - 9 * s)} ${n(y - 2 * s)}q${n(5 * s)} ${n(-5 * s)} ${n(9 * s)} ${n(2 * s)}q${n(4 * s)} ${n(-7 * s)} ${n(10 * s)} ${n(-3 * s)}`).join("");
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
}

/** A row of small round trees standing on a line, far away: [body, shade, light]. */
function grove(r: Rng, l: Line, x0: number, x1: number, step: number, size: number, tones: readonly [string, string, string][], sink = 0.1, trunk = "#6b5148"): string {
  let stems = "";
  let shade = "";
  let body = "";
  let light = "";
  for (let x = x0; x < x1; x += step * between(r, 0.55, 1.5)) {
    const s = size * between(r, 0.7, 1.3);
    const y = l.at(x) + s * sink;
    const [b, sh, li] = pick(r, tones);
    if (size > 13) stems += `M${n(x)} ${n(y + s * 0.1)}v${n(-s * 0.6)}`;
    const lobes = 3 + Math.floor(r() * 2);
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + r();
      const d = i === 0 ? 0 : s * between(r, 0.3, 0.5);
      const cx = x + Math.cos(a) * d;
      const cy = y - s * 0.8 + Math.sin(a) * d * 0.7;
      const rr = s * (i === 0 ? 0.56 : between(r, 0.3, 0.44));
      shade += `<circle cx="${n(cx + rr * 0.14)}" cy="${n(cy + rr * 0.2)}" r="${n(rr)}" fill="${sh}"/>`;
      body += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rr * 0.96)}" fill="${b}"/>`;
      if (i < 2) light += `<circle cx="${n(cx - rr * 0.3)}" cy="${n(cy - rr * 0.34)}" r="${n(rr * 0.42)}" fill="${li}"/>`;
    }
  }
  return `<path d="${stems}" fill="none" stroke="${trunk}" stroke-width="${n(Math.max(1, size / 11))}" stroke-linecap="round"/>${shade}${body}${light}`;
}

/** A conifer of stacked, drooping boughs; snow lies on them when `snow` is given. */
function conifer(r: Rng, x: number, y: number, h: number, tones: [string, string], snow?: string): string {
  const w = h * between(r, 0.36, 0.46);
  const tiers = Math.max(3, Math.round(h / 26));
  let dark = "";
  let lit = "";
  let white = "";
  for (let i = tiers - 1; i >= 0; i--) {
    const k = i / tiers; // 0 at the top
    const top = y - h + h * k * 0.82;
    const bottom = top + (h / tiers) * 1.75;
    const half = (w / 2) * (0.22 + 0.78 * ((i + 1) / tiers));
    const lean = between(r, -0.08, 0.08) * half;
    const teeth = 3 + Math.floor(half / 9);
    const edge: P[] = [];
    for (let t = 0; t <= teeth; t++) {
      const u = t / teeth;
      edge.push([x - half + 2 * half * u + lean, bottom - (t % 2 ? between(r, 0.1, 0.24) * (bottom - top) : 0) + Math.abs(u - 0.5) * -6]);
    }
    const poly = [[x, top] as P, ...edge.reverse()];
    dark += `M${poly.map((p) => `${n(p[0])} ${n(p[1])}`).join("L")}Z`;
    // The lit half, towards the light on the left.
    lit += `M${n(x)} ${n(top)}L${n(x - half + lean)} ${n(bottom)}L${n(x - half * 0.2 + lean)} ${n(bottom - (bottom - top) * 0.18)}Z`;
    if (snow) {
      const sh = (bottom - top) * 0.46;
      white += `M${n(x)} ${n(top - 1)}L${n(x - half * 0.92 + lean)} ${n(bottom - 2)}L${n(x - half * 0.5 + lean)} ${n(bottom - sh * 0.5)}L${n(x - half * 0.16 + lean)} ${n(bottom - sh * 0.1)}L${n(x + half * 0.16 + lean)} ${n(bottom - sh * 0.9)}L${n(x + half * 0.36 + lean)} ${n(bottom - sh * 0.62)}L${n(x + half * 0.5 + lean)} ${n(bottom - sh * 1.15)}Z`;
    }
  }
  const trunk = `<rect x="${n(x - h * 0.018)}" y="${n(y - h * 0.12)}" width="${n(h * 0.036)}" height="${n(h * 0.14)}" fill="${tones[0]}"/>`;
  return `${trunk}<path d="${dark}" fill="${tones[0]}"/><path d="${lit}" fill="${tones[1]}" opacity=".55"/>${snow ? `<path d="${white}" fill="${snow}"/>` : ""}`;
}

interface Tree {
  /** Branch strokes, thickest first: [d, width]. */
  wood: [string, number][];
  tips: P[];
}

/** A branching tree grown from (x, y): returns its wood and where foliage goes. */
function grow(r: Rng, x: number, y: number, height: number, spread: number, lean = 0): Tree {
  const tree: Tree = { wood: [], tips: [] };
  const branch = (bx: number, by: number, ang: number, len: number, width: number, depth: number) => {
    const bend = between(r, -0.22, 0.22);
    const mx = bx + Math.cos(ang + bend) * len * 0.55;
    const my = by + Math.sin(ang + bend) * len * 0.55;
    const ex = bx + Math.cos(ang) * len;
    const ey = by + Math.sin(ang) * len;
    tree.wood.push([`M${n(bx)} ${n(by)}Q${n(mx)} ${n(my)} ${n(ex)} ${n(ey)}`, width]);
    if (depth >= 2) tree.tips.push([ex, ey]);
    if (depth >= 5 || len < height * 0.07) {
      tree.tips.push([ex, ey]);
      return;
    }
    const kids = depth === 0 ? 3 : r() < 0.35 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const side = k / (kids - 1) - 0.5;
      const a = ang + side * spread * between(r, 0.8, 1.25) + between(r, -0.12, 0.12);
      // Boughs that reach out sideways sag a little.
      const sag = Math.cos(a) * 0.018 * depth;
      branch(ex, ey, a + sag, len * between(r, 0.62, 0.8), Math.max(1.1, width * 0.62), depth + 1);
    }
  };
  branch(x, y, -Math.PI / 2 + lean, height * 0.34, height * 0.055, 0);
  tree.wood.sort((a, b) => b[1] - a[1]);
  return tree;
}

const wood = (t: Tree, stroke: string) =>
  `<g fill="none" stroke="${stroke}" stroke-linecap="round">${t.wood.map(([d, w]) => `<path d="${d}" stroke-width="${n(w)}"/>`).join("")}</g>`;

/** Clumps of foliage or blossom around the tips of a tree: [shade, body, light]. */
function foliage(r: Rng, tips: P[], size: number, tones: [string, string, string], density = 1, speck = "#fff"): string {
  let shade = "";
  let body = "";
  let light = "";
  let specks = "";
  for (const [x, y] of tips) {
    const count = Math.round(between(r, 3, 6) * density);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * size * 1.15;
      const cx = x + Math.cos(a) * d;
      const cy = y + Math.sin(a) * d * 0.72;
      const rr = size * between(r, 0.28, 0.62);
      shade += `<circle cx="${n(cx + rr * 0.22)}" cy="${n(cy + rr * 0.34)}" r="${n(rr)}"/>`;
      body += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rr * 0.94)}"/>`;
      if (r() < 0.6) light += `<circle cx="${n(cx - rr * 0.28)}" cy="${n(cy - rr * 0.36)}" r="${n(rr * 0.5)}"/>`;
      if (r() < 0.5) specks += `<circle cx="${n(cx + between(r, -1, 1) * rr)}" cy="${n(cy + between(r, -1, 1) * rr)}" r="${n(size * between(r, 0.05, 0.11))}"/>`;
    }
  }
  return `<g fill="${tones[0]}">${shade}</g><g fill="${tones[1]}">${body}</g><g fill="${tones[2]}">${light}</g><g fill="${speck}" opacity=".5">${specks}</g>`;
}

/** Broad patches of lighter or darker ground below a line. */
function patches(r: Rng, l: Line, count: number, depth: number, fill: string, opacity: number): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = between(r, 0, W);
    const k = r();
    out += `<ellipse cx="${n(x)}" cy="${n(l.at(x) + 14 + k * depth)}" rx="${n(between(r, 90, 260) * (0.6 + k))}" ry="${n(between(r, 5, 12) * (0.6 + k))}"/>`;
  }
  return `<g fill="${fill}" opacity="${opacity}">${out}</g>`;
}

/** Blades of grass along a line, as one path per colour. */
function grass(r: Rng, l: Line, x0: number, x1: number, step: number, height: number, colours: string[], drop = 6): string {
  const d = colours.map(() => "");
  for (let x = x0; x < x1; x += step * between(r, 0.4, 1.6)) {
    const y = l.at(x) + between(r, 0, drop);
    const h = height * between(r, 0.5, 1.25);
    const lean = between(r, -0.5, 0.5) * h;
    const c = Math.floor(r() * colours.length);
    d[c] += `M${n(x)} ${n(y)}q${n(lean * 0.2)} ${n(-h * 0.6)} ${n(lean)} ${n(-h)}`;
  }
  return colours.map((c, i) => `<path d="${d[i]}" fill="none" stroke="${c}" stroke-width="${n(Math.max(1, height / 9))}" stroke-linecap="round"/>`).join("");
}

/** Small flowers scattered below a line: a dot of colour, some with a heart. */
function flowers(r: Rng, l: Line, x0: number, x1: number, count: number, depth: number, size: number, colours: string[], heart?: string): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = between(r, x0, x1);
    const k = r();
    const y = l.at(x) + 4 + k * depth;
    const s = size * (0.55 + k * 0.75);
    const c = pick(r, colours);
    if (s > size * 0.9) {
      // Close enough to show petals.
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + k;
        out += `<circle cx="${n(x + Math.cos(a) * s * 0.55)}" cy="${n(y + Math.sin(a) * s * 0.55)}" r="${n(s * 0.48)}" fill="${c}"/>`;
      }
      if (heart) out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.36)}" fill="${heart}"/>`;
    } else out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.6)}" fill="${c}"/>`;
  }
  return out;
}

/** Glints on water: short level strokes, denser towards `cx` when given. */
function glints(r: Rng, x0: number, x1: number, y0: number, y1: number, count: number, stroke: string, cx?: number, spread = 160): string {
  let d = "";
  for (let i = 0; i < count; i++) {
    const k = r();
    const y = y0 + (y1 - y0) * k;
    const x = cx === undefined ? between(r, x0, x1) : cx + (r() + r() + r() - 1.5) * spread * (0.35 + k);
    if (x < x0 || x > x1) continue;
    const len = between(r, 6, 26) * (0.5 + k);
    d += `M${n(x - len / 2)} ${n(y)}h${n(len)}`;
  }
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>`;
}

const defs: string[] = [];
/** What drifts across the sky (clouds), kept apart from the land so it can move cheaply. */
const drifting: { slow: boolean; body: string }[] = [];
const drift = (slow: boolean, body: string) => void drifting.push({ slow, body });

/** A gradient definition; returns its paint reference. */
function gradient(id: string, kind: "linear" | "radial", stops: [number, string, number?][], attrs = 'x1="0" y1="0" x2="0" y2="1"'): string {
  defs.push(
    `<${kind}Gradient id="${id}" ${kind === "linear" ? attrs : ""}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? "" : ` stop-opacity="${a}"`}/>`).join("")}</${kind}Gradient>`,
  );
  return `url(#${id})`;
}

/** Mist lying in front of a layer: a level band fading upwards. */
const mist = (id: string, y: number, height: number, colour: string, strength: number) =>
  `<rect x="0" y="${n(y - height)}" width="${W}" height="${n(height)}" fill="${gradient(id, "linear", [[0, colour, 0], [1, colour, strength]])}"/>`;

// ---------------------------------------------------------------- spring

function spring(): string {
  const r = rng(20260321);
  let s = "";
  // A pale morning sun and thin cloud.
  s += `<circle cx="1210" cy="150" r="250" fill="${gradient("sp-halo", "radial", [[0, "#fff8e2", 0.95], [0.3, "#fff3d6", 0.5], [1, "#fff3d6", 0]])}"/><circle cx="1210" cy="150" r="44" fill="#fffdf2"/>`;
  drift(true, `${wisp(r, 380, 150, 420, "#fff", 0.7)}${wisp(r, 1300, 300, 340, "#fff", 0.55)}`);
  drift(false, `${cloud(r, 300, 330, 260, 84, ["#ffffff", "#ecdff0"], 0.95)}${cloud(r, 1430, 440, 240, 74, ["#ffffff", "#f3dbe6"], 0.9)}`);
  s += birds([[640, 300, 1], [676, 318, 0.8]], "#7a6a86", 0.55);

  // Mountains, the tallest still under snow.
  const far = range(r, 640, 270, 4);
  s += `<path d="${fillUnder(far.outline, false)}" fill="${gradient("sp-far", "linear", [[0, "#b3c1e4"], [1, "#dde2f3"]])}"/>${facets(r, far, 640, "#8394cb", 0.3)}${snowcaps(r, far, 640, 0.3, "#fbfbff")}`;
  s += mist("sp-m1", 660, 160, "#fdeef4", 0.95);
  const near = range(rng(7), 660, 150, 6);
  s += `<path d="${fillUnder(near.outline, false)}" fill="${gradient("sp-near", "linear", [[0, "#9dbbd3"], [1, "#d5e6e0"]])}"/>${facets(r, near, 660, "#628aab", 0.26)}`;
  s += mist("sp-m2", 668, 90, "#fbeaf0", 0.9);

  // Hills in bloom, and a river coming down between them.
  const pinks: [string, string, string][] = [["#ffc4d9", "#f09dbd", "#ffe6ef"], ["#ffd6e4", "#f5aec8", "#fff2f6"], ["#f9b3cd", "#e88cb0", "#ffd9e6"]];
  const greens: [string, string, string][] = [["#a9d79a", "#84be7b", "#cbe9bd"], ["#93cc8f", "#6fb274", "#b9e0b0"]];
  const h1 = hills(r, 640, 22, 7, -30);
  s += `<path d="${fillUnder(h1)}" fill="${gradient("sp-h1", "linear", [[0, "#c8e4bf"], [0.5, "#b6dbb1"]])}"/>`;
  s += patches(r, h1, 4, 30, "#e3f2d6", 0.6);
  s += grove(r, h1, -20, W, 84, 13, [...pinks, ...pinks, ...greens]);
  const h2 = hills(r, 700, 22, 6, 40);
  s += `<path d="${fillUnder(h2)}" fill="${gradient("sp-h2", "linear", [[0, "#a9d7a1"], [0.6, "#8dc88e"]])}"/>`;
  s += patches(r, h2, 4, 50, "#c4e6b6", 0.55);
  // The river: from the hills, widening towards us.
  const ry = h2.at(770) + 3;
  s += `<path d="M752 ${n(ry)}C820 ${n(ry + 22)} 700 ${n(ry + 44)} 742 ${n(ry + 72)}C800 ${n(ry + 110)} 560 ${n(ry + 150)} 470 ${H}L1070 ${H}C1040 ${n(ry + 150)} 900 ${n(ry + 112)} 872 ${n(ry + 74)}C850 ${n(ry + 44)} 870 ${n(ry + 20)} 790 ${n(ry)}Z" fill="${gradient("sp-river", "linear", [[0, "#eaf6fc"], [0.5, "#bfe2f3"], [1, "#96cbe8"]])}"/>`;
  s += glints(r, 520, 1040, ry + 30, 892, 70, "#ffffff", 790, 100);
  s += grove(r, h2, 330, 690, 150, 24, pinks);
  s += grove(r, h2, 900, W + 20, 150, 24, [...pinks, ...greens]);

  // The near meadow.
  const h3 = hills(r, 790, 16, 5, -30);
  const bank = (x0: number, x1: number, edge: number) =>
    `<path d="${smooth(h3.pts.filter((p) => p[0] >= x0 - 400 && p[0] <= x1 + 400))}L${x1 + 400} ${H}L${x0 - 400} ${H}Z" fill="${gradient(`sp-h3${edge}`, "linear", [[0, "#84c385"], [1, "#5fa96b"]])}" clip-path="url(#sp-bank${edge})"/>`;
  defs.push(`<clipPath id="sp-bank0"><path d="M-80 0H640C600 830 560 860 500 ${H}H-80Z"/></clipPath><clipPath id="sp-bank1"><path d="M1700 0H930C960 820 1010 860 1050 ${H}H1700Z"/></clipPath>`);
  s += bank(-80, 640, 0) + bank(930, 1700, 1);
  s += grass(r, h3, -10, 620, 7, 13, ["#6fb476", "#9bd193", "#58a166"]) + grass(r, h3, 950, W, 7, 13, ["#6fb476", "#9bd193", "#58a166"]);
  s += flowers(r, h3, 0, 560, 20, 90, 5, ["#ffffff", "#fff3a8", "#ffc1d8", "#f7a1c4", "#c9b6f2"], "#f6c445");
  s += flowers(r, h3, 1040, W, 20, 90, 5, ["#ffffff", "#fff3a8", "#ffc1d8", "#f7a1c4", "#c9b6f2"], "#f6c445");

  // A cherry tree in full bloom.
  const tree = grow(rng(31), 236, 850, 380, 1.3, 0.08);
  s += `<ellipse cx="262" cy="852" rx="170" ry="15" fill="#3f7f52" opacity=".28"/>`;
  s += wood(tree, "#5a3d38");
  s += foliage(rng(5), tree.tips, 26, ["#ea8fb3", "#ffbbd3", "#ffe1ec"], 1.3);
  const front = hills(r, 872, 9, 4, 10);
  s += `<path d="${smooth(front.pts.filter((p) => p[0] < 700))}L520 ${H}L-60 ${H}Z" fill="#4f9a60"/><path d="${smooth(front.pts.filter((p) => p[0] > 900))}L1660 ${H}L1030 ${H}Z" fill="#4f9a60"/>`;
  s += grass(r, front, -10, 500, 5, 20, ["#4a9159", "#74b97a", "#3f8350"], 4) + grass(r, front, 1060, W, 5, 20, ["#4a9159", "#74b97a", "#3f8350"], 4);
  s += flowers(r, front, 0, 480, 8, 22, 8, ["#ffffff", "#ffd0e0", "#fff0a0"], "#f2b93b") + flowers(r, front, 1080, W, 8, 22, 8, ["#ffffff", "#ffd0e0", "#fff0a0"], "#f2b93b");
  return s;
}

// ---------------------------------------------------------------- summer

function sunflower(r: Rng, x: number, y: number, s: number): string {
  const h = 78 * s * between(r, 0.8, 1.15);
  const lean = between(r, -8, 8) * s;
  const hx = x + lean;
  const hy = y - h;
  let out = `<path d="M${n(x)} ${n(y)}Q${n(x + lean * 0.2)} ${n(y - h * 0.5)} ${n(hx)} ${n(hy)}" fill="none" stroke="#4d8f3f" stroke-width="${n(3.2 * s)}" stroke-linecap="round"/>`;
  for (const side of [-1, 1]) {
    const ly = y - h * between(r, 0.3, 0.6);
    out += `<path d="M${n(x + lean * 0.4)} ${n(ly)}q${n(side * 20 * s)} ${n(-14 * s)} ${n(side * 30 * s)} ${n(2 * s)}q${n(side * -16 * s)} ${n(8 * s)} ${n(side * -30 * s)} ${n(-2 * s)}Z" fill="${side < 0 ? "#5fa348" : "#4a8d3c"}"/>`;
  }
  const petals = 16;
  let ring = "";
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * 360;
    ring += `<ellipse cx="${n(hx)}" cy="${n(hy - 15 * s)}" rx="${n(4.6 * s)}" ry="${n(9.5 * s)}" transform="rotate(${n(a)} ${n(hx)} ${n(hy)})"/>`;
  }
  out += `<g fill="#f2b21d">${ring}</g><g fill="#ffd23e" transform="rotate(11 ${n(hx)} ${n(hy)})">${ring}</g>`;
  out += `<circle cx="${n(hx)}" cy="${n(hy)}" r="${n(9 * s)}" fill="#7a4a21"/><circle cx="${n(hx - 1.5 * s)}" cy="${n(hy - 1.5 * s)}" r="${n(5.5 * s)}" fill="#96602c"/>`;
  return out;
}

function summer(): string {
  const r = rng(20260621);
  let s = "";
  s += `<circle cx="1330" cy="110" r="300" fill="${gradient("su-halo", "radial", [[0, "#fffbe0", 1], [0.25, "#fff6c8", 0.55], [1, "#fff6c8", 0]])}"/><circle cx="1330" cy="110" r="40" fill="#fffef4"/>`;
  drift(true, `${wisp(r, 760, 110, 380, "#fff", 0.5)}`);
  // Thunderheads piled up over the sea.
  drift(true, `${thunderhead(r, 430, 612, 620, 330, ["#ffffff", "#cfe3f5"])}`);
  drift(false, cloud(r, 1040, 330, 230, 62, ["#ffffff", "#dcedf9"], 0.92));
  s += birds([[700, 210, 1], [742, 196, 0.85]], "#3f6f96", 0.5);

  // The sea, a sail on it, and a headland with a lighthouse.
  s += `<rect x="0" y="606" width="${W}" height="150" fill="${gradient("su-sea", "linear", [[0, "#3f9fd6"], [0.5, "#4fb5dc"], [1, "#7fd3de"]])}"/>`;
  s += glints(r, 0, W, 612, 700, 150, "#ffffff", 1330, 320);
  s += glints(r, 0, W, 612, 700, 60, "#d9f4fb");
  s += `<path d="M1010 640l34 -4l-8 9h-22z" fill="#fff"/><path d="M1026 634v-46l24 40z" fill="#fff"/><path d="M1023 634v-38l-18 34z" fill="#eaf3f8"/>`;
  const cape = hills(rng(12), 620, 16, 5);
  s += `<path d="M-60 ${H}L-60 ${n(cape.at(-60) - 40)}C120 548 260 560 380 590C450 606 540 630 640 676C700 704 760 720 830 732L830 ${H}Z" fill="${gradient("su-cape", "linear", [[0, "#8fd095"], [1, "#5fb47a"]])}"/>`;
  s += `<path d="M184 566l5 -66h14l5 66z" fill="#fbfbf7"/><path d="M186 546h22l1 9h-24z" fill="#e2574c"/><path d="M186 500h20v-10l-10 -9l-10 9z" fill="#3d5568"/><rect x="190" y="492" width="12" height="8" fill="#ffe9a3"/>`;

  // Green hills rolling down to the shore.
  const h1 = hills(r, 690, 20, 6, 60);
  s += `<path d="${fillUnder(h1)}" fill="${gradient("su-h1", "linear", [[0, "#86cf8b"], [0.6, "#63b877"]])}"/>${patches(r, h1, 4, 40, "#a6e0a0", 0.5)}`;
  s += grove(r, h1, 640, W + 20, 150, 26, [["#3f9a61", "#2c7c4c", "#69bb7e"], ["#55aa6c", "#398756", "#84cb93"]]);
  const h2 = hills(r, 762, 18, 5, -40);
  s += `<path d="${fillUnder(h2)}" fill="${gradient("su-h2", "linear", [[0, "#5fb873"], [1, "#3f9a5c"]])}"/>`;
  s += grass(r, h2, -10, W, 6, 12, ["#4aa565", "#7fcc8c", "#3a8e54"]);

  // A big shade tree.
  const tree = grow(rng(42), 1352, 846, 440, 1.15, -0.06);
  s += `<ellipse cx="1330" cy="852" rx="220" ry="20" fill="#226b43" opacity=".34"/>`;
  s += wood(tree, "#5b4633");
  s += foliage(rng(8), tree.tips, 34, ["#2a7b4a", "#3f9f5f", "#74c884"], 1.35, "#c6f0a8");

  // A stand of sunflowers.
  const field = hills(r, 836, 8, 4, -14);
  s += `<path d="${fillUnder(field)}" fill="#3c9457"/>`;
  const rows: [number, number, number][] = [[826, 60, 0.74], [858, 84, 1]];
  for (const [y, step, scale] of rows) for (let x = -10; x < 760; x += step * between(r, 0.75, 1.3)) s += sunflower(r, x, y + between(r, -4, 6) + (x / 760) * 14, scale);
  const front = hills(r, 876, 8, 4);
  s += `<path d="${fillUnder(front)}" fill="#2f8650"/>${grass(r, front, -10, W, 5, 22, ["#2f8650", "#58b06c", "#256f41"], 4)}`;
  return s;
}

// ---------------------------------------------------------------- autumn

function pampas(r: Rng, x: number, y: number, s: number): string {
  let stems = "";
  let plumes = "";
  const count = 5 + Math.floor(r() * 4);
  for (let i = 0; i < count; i++) {
    const lean = between(r, -0.7, 0.7);
    const h = 120 * s * between(r, 0.7, 1.1);
    const ex = x + lean * h * 0.55;
    const ey = y - h;
    stems += `M${n(x + between(r, -6, 6) * s)} ${n(y)}Q${n(x + lean * h * 0.12)} ${n(y - h * 0.6)} ${n(ex)} ${n(ey)}`;
    const a = (Math.atan2(-h, lean * h * 0.55) * 180) / Math.PI + 90 + lean * 26;
    plumes += `<ellipse cx="${n(ex + lean * 9 * s)}" cy="${n(ey - 4 * s)}" rx="${n(5.5 * s)}" ry="${n(26 * s)}" transform="rotate(${n(a)} ${n(ex)} ${n(ey)})"/>`;
  }
  return `<path d="${stems}" fill="none" stroke="#b78a4c" stroke-width="${n(1.5 * s)}" stroke-linecap="round"/><g fill="#fff3d6" opacity=".92">${plumes}</g>`;
}

function autumn(): string {
  const r = rng(20260923);
  let s = "";
  // A low sun in a hazy sky.
  s += `<circle cx="360" cy="430" r="420" fill="${gradient("au-halo", "radial", [[0, "#fff1c9", 1], [0.2, "#ffdf9f", 0.7], [0.55, "#ffcf8a", 0.22], [1, "#ffcf8a", 0]])}"/><circle cx="360" cy="430" r="62" fill="#fff6dc"/>`;
  drift(true, `${wisp(r, 720, 170, 520, "#fff7e6", 0.75)}${wisp(r, 1260, 260, 420, "#fff7e6", 0.6)}`);
  drift(false, `${cloud(r, 1010, 380, 300, 64, ["#fff8ea", "#f6c79a"], 0.85)}`);
  // Geese heading south.
  const geese: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) geese.push([930 - i * 26, 250 + i * 15, 0.9], [930 + i * 24, 250 + i * 13, 0.9]);
  s += birds(geese.slice(1), "#6d4a3a", 0.6);

  const far = range(r, 650, 230, 4);
  s += `<path d="${fillUnder(far.outline, false)}" fill="${gradient("au-far", "linear", [[0, "#cfa0a0"], [1, "#f3cfae"]])}"/>${facets(r, far, 650, "#93607a", 0.26)}`;
  s += mist("au-m1", 664, 170, "#fde6c4", 0.96);
  const near = range(rng(17), 664, 140, 6);
  s += `<path d="${fillUnder(near.outline, false)}" fill="${gradient("au-near", "linear", [[0, "#b9746a"], [1, "#e7b089"]])}"/>${facets(r, near, 664, "#7c4057", 0.24)}`;
  s += mist("au-m2", 672, 80, "#fbdcb4", 0.85);

  // Wooded slopes in their autumn colours, around a lake.
  const reds: [string, string, string][] = [["#d9482b", "#a8321f", "#f0774a"], ["#ee8a2a", "#c2651a", "#f9b25a"], ["#f2c230", "#c9961c", "#fbe07a"], ["#b73a2e", "#8a2620", "#dd6247"], ["#8f9a3c", "#6a7628", "#b7c063"]];
  const h1 = hills(r, 650, 22, 7, 20);
  s += `<path d="${fillUnder(h1)}" fill="#b96a38"/>${grove(r, h1, -20, W + 20, 52, 18, reds, 0.1, "#5a3524")}`;
  s += `<rect x="0" y="690" width="${W}" height="110" fill="${gradient("au-lake", "linear", [[0, "#fbd9a0"], [0.5, "#f1b783"], [1, "#d9a07c"]])}"/>`;
  s += `<rect x="0" y="690" width="${W}" height="3" fill="#fff1d2" opacity=".7"/>`;
  s += glints(r, 0, W, 700, 792, 110, "#fff6dc", 360, 150);
  s += glints(r, 0, W, 700, 792, 50, "#fbe2bd");
  const shoreL = line([[-60, 730], [120, 716], [300, 724], [470, 752], [560, 790], [600, 830]]);
  s += `<path d="${smooth(shoreL.pts)}L600 ${H}L-60 ${H}Z" fill="${gradient("au-shl", "linear", [[0, "#cf8a47"], [1, "#a8642e"]])}"/>`;
  s += grove(r, shoreL, 330, 470, 90, 30, reds, 0.1);
  const shoreR = line([[1040, 830], [1110, 780], [1230, 746], [1400, 728], [1660, 716]]);
  s += `<path d="${smooth(shoreR.pts)}L1660 ${H}L1040 ${H}Z" fill="${gradient("au-shr", "linear", [[0, "#d39049"], [1, "#a8642e"]])}"/>`;
  s += grove(r, shoreR, 1080, 1200, 90, 32, reds, 0.1);

  const h3 = hills(r, 812, 14, 5, -16);
  s += `<path d="${fillUnder(h3)}" fill="${gradient("au-h3", "linear", [[0, "#c98443"], [1, "#9a5a2a"]])}"/>`;
  s += grass(r, h3, -10, W, 7, 14, ["#d9a45a", "#b9783a", "#e8c07a"]);
  s += flowers(r, h3, 0, W, 34, 70, 4.2, ["#e2562f", "#f2c230", "#f08a2e", "#c93f2a"]);

  // A maple on the right, a ginkgo on the left.
  const maple = grow(rng(64), 1330, 850, 450, 1.25, -0.1);
  s += `<ellipse cx="1300" cy="856" rx="210" ry="18" fill="#6b3a1c" opacity=".3"/>${wood(maple, "#4b2f25")}${foliage(rng(2), maple.tips, 30, ["#a52c1e", "#d94a2a", "#f58a4c"], 1.35, "#ffd08a")}`;
  const ginkgo = grow(rng(71), 250, 846, 300, 0.95, 0.06);
  s += `<ellipse cx="270" cy="850" rx="120" ry="11" fill="#6b3a1c" opacity=".28"/>${wood(ginkgo, "#56392a")}${foliage(rng(6), ginkgo.tips, 21, ["#cf9a1a", "#f2c230", "#fde27e"], 1.3, "#fff6c2")}`;

  const front = hills(r, 872, 8, 4, 10);
  s += `<path d="${fillUnder(front)}" fill="#7d4520"/>${grass(r, front, -10, W, 6, 18, ["#a8672f", "#c98a45", "#7a4520"], 4)}`;
  for (const [x, y, k] of [[600, 892, 1.15], [800, 884, 0.95], [980, 894, 1.1]] as const) s += pampas(r, x, y, k);
  s += flowers(r, front, 0, W, 14, 24, 6, ["#e2562f", "#f2c230", "#f08a2e"]);
  return s;
}

// ---------------------------------------------------------------- winter

function winter(): string {
  const r = rng(20261221);
  let s = "";
  // The moon and a ring of thin cloud.
  s += `<circle cx="1260" cy="170" r="260" fill="${gradient("wi-halo", "radial", [[0, "#dbe8ff", 0.55], [0.3, "#b9d0ff", 0.2], [1, "#b9d0ff", 0]])}"/>`;
  s += `<circle cx="1260" cy="170" r="52" fill="#f6f9ff"/><g fill="#d6e2f6" opacity=".7"><circle cx="1244" cy="156" r="10"/><circle cx="1278" cy="186" r="13"/><circle cx="1270" cy="148" r="5"/><circle cx="1238" cy="190" r="6"/></g>`;
  drift(true, `${wisp(r, 1140, 250, 460, "#c9d9f6", 0.22)}${wisp(r, 420, 190, 520, "#c9d9f6", 0.18)}${wisp(r, 820, 360, 380, "#c9d9f6", 0.14)}`);

  const far = range(r, 650, 260, 4);
  s += `<path d="${fillUnder(far.outline, false)}" fill="${gradient("wi-far", "linear", [[0, "#3f5f96"], [1, "#6f8fc0"]])}"/>${facets(r, far, 650, "#1c315c", 0.42)}${snowcaps(r, far, 650, 0.46, "#dfeaff")}`;
  s += mist("wi-m1", 664, 160, "#7f9fd0", 0.75);
  const near = range(rng(27), 664, 150, 6);
  s += `<path d="${fillUnder(near.outline, false)}" fill="${gradient("wi-near", "linear", [[0, "#56769f"], [1, "#9cb6da"]])}"/>${facets(r, near, 664, "#243c66", 0.4)}${snowcaps(r, near, 664, 0.5, "#eaf1ff")}`;
  s += mist("wi-m2", 672, 80, "#a9c0e2", 0.7);

  // Snowfields, with dark pinewoods along them.
  const h1 = hills(r, 664, 20, 7, 24);
  s += `<path d="${fillUnder(h1)}" fill="${gradient("wi-h1", "linear", [[0, "#b9cdea"], [1, "#9fb8dc"]])}"/>`;
  for (let x = -10; x < W; x += between(r, 12, 30)) if (x < 560 || x > 900) s += conifer(r, x, h1.at(x) + 6, between(r, 38, 70), ["#23395f", "#3d5a8a"], "#e6eeff");
  const h2 = hills(r, 742, 22, 5, -36);
  s += `<path d="${fillUnder(h2)}" fill="${gradient("wi-h2", "linear", [[0, "#dbe7fa"], [1, "#b8cdea"]])}"/>`;
  // Hollows of blue shadow in the snow.
  s += `<g fill="#9db6dc" opacity=".45"><ellipse cx="420" cy="800" rx="210" ry="13"/><ellipse cx="1180" cy="790" rx="260" ry="12"/><ellipse cx="800" cy="834" rx="180" ry="10"/></g>`;

  // A cabin with its lamp lit.
  const cx = 1010;
  const cy = h2.at(1010) + 22;
  s += `<ellipse cx="${cx - 30}" cy="${n(cy + 26)}" rx="190" ry="34" fill="${gradient("wi-spill", "radial", [[0, "#ffd98a", 0.5], [1, "#ffd98a", 0]])}"/>`;
  s += `<path d="M${cx - 62} ${n(cy)}v-52h124v52z" fill="#4a3530"/><path d="M${cx - 62} ${n(cy - 40)}h124M${cx - 62} ${n(cy - 28)}h124M${cx - 62} ${n(cy - 16)}h124M${cx - 62} ${n(cy - 4)}h124" stroke="#3a2824" stroke-width="1.6"/>`;
  s += `<path d="M${cx + 30} ${n(cy - 98)}h16v34h-16z" fill="#56403a"/><path d="M${cx + 27} ${n(cy - 102)}h22v7h-22z" fill="#f2f6ff"/>`;
  s += `<path d="M${cx - 78} ${n(cy - 50)}L${cx} ${n(cy - 104)}L${cx + 78} ${n(cy - 50)}L${cx + 70} ${n(cy - 44)}L${cx} ${n(cy - 92)}L${cx - 70} ${n(cy - 44)}Z" fill="#3a2824"/>`;
  s += `<path d="M${cx - 84} ${n(cy - 52)}Q${cx - 40} ${n(cy - 92)} ${cx} ${n(cy - 112)}Q${cx + 40} ${n(cy - 92)} ${cx + 84} ${n(cy - 52)}Q${cx + 70} ${n(cy - 54)} ${cx + 64} ${n(cy - 60)}L${cx} ${n(cy - 100)}L${cx - 64} ${n(cy - 60)}Q${cx - 70} ${n(cy - 54)} ${cx - 84} ${n(cy - 52)}Z" fill="#f4f8ff"/>`;
  s += `<rect x="${cx - 46}" y="${n(cy - 40)}" width="30" height="24" fill="#ffd77a"/><path d="M${cx - 31} ${n(cy - 40)}v24M${cx - 46} ${n(cy - 28)}h30" stroke="#6a4a32" stroke-width="2"/><rect x="${cx + 18}" y="${n(cy - 40)}" width="26" height="24" fill="#ffca6a"/><path d="M${cx + 31} ${n(cy - 40)}v24M${cx + 18} ${n(cy - 28)}h26" stroke="#6a4a32" stroke-width="2"/>`;
  s += `<rect x="${cx - 9}" y="${n(cy - 34)}" width="20" height="34" fill="#2e201c"/><circle cx="${cx + 7}" cy="${n(cy - 16)}" r="1.6" fill="#ffd77a"/>`;
  s += `<path d="M${cx - 66} ${n(cy)}q66 -9 132 0v6h-132z" fill="#eef3ff"/>`;
  // Smoke from the chimney.
  s += `<g fill="#c9d6ee">${[[0, 0, 8, 0.5], [6, -20, 11, 0.4], [-2, -44, 14, 0.3], [10, -72, 18, 0.2], [2, -104, 22, 0.12]].map(([dx, dy, rr, o]) => `<circle cx="${n(cx + 38 + dx)}" cy="${n(cy - 108 + dy)}" r="${rr}" opacity="${o}"/>`).join("")}</g>`;
  // A fence running down to the gate.
  let fence = "";
  for (let x = 690; x < 930; x += 34) fence += `M${x} ${n(h2.at(x) + 34)}v-22`;
  s += `<path d="${fence}" stroke="#4a3a3a" stroke-width="3.4" stroke-linecap="round"/><path d="M686 ${n(h2.at(690) + 18)}L926 ${n(h2.at(926) + 18)}M686 ${n(h2.at(690) + 26)}L926 ${n(h2.at(926) + 26)}" stroke="#4a3a3a" stroke-width="2.2"/><path d="${fence.replace(/v-22/g, "m-3 -23h6")}" stroke="#f4f8ff" stroke-width="3" stroke-linecap="round"/>`;

  // Big firs on either side, heavy with snow.
  for (const [x, y, h] of [[150, 852, 330], [60, 870, 250], [262, 866, 220], [1450, 858, 350], [1556, 874, 270], [1348, 868, 200]] as const) s += conifer(rng(x), x, y, h, ["#182a4a", "#2f4a78"], "#f1f6ff");
  const front = hills(r, 862, 10, 4, 10);
  s += `<path d="${fillUnder(front)}" fill="${gradient("wi-front", "linear", [[0, "#f3f7ff"], [1, "#cfdcf2"]])}"/>`;
  // Dry stalks standing out of the snow.
  s += grass(r, front, -10, W, 26, 16, ["#6a7896", "#8b97b2"], 3);
  s += `<g fill="#b3c6e6" opacity=".5"><ellipse cx="600" cy="884" rx="150" ry="8"/><ellipse cx="1120" cy="890" rx="190" ry="7"/></g>`;
  return s;
}

const SCENES: Record<Season, () => string> = { spring, summer, autumn, winter };
export interface Scene {
  /** Gradients and filters, shared by the layers. */
  defs: string;
  /** Cloud layers, behind the land; the slow ones are the far ones. */
  drift: { slow: boolean; body: string }[];
  land: string;
}

const cache = new Map<Season, Scene>();

/** The SVG content of a season's landscape, in layers. */
export function scene(season: Season): Scene {
  let out = cache.get(season);
  if (!out) {
    defs.length = 0;
    drifting.length = 0;
    const land = SCENES[season]();
    out = {
      defs: `<defs><filter id="ss-soft" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>${defs.join("")}</defs>`,
      drift: drifting.map((d) => ({ ...d })),
      land,
    };
    defs.length = 0;
    drifting.length = 0;
    cache.set(season, out);
  }
  return out;
}

export const SCENE_VIEWBOX = `0 0 ${W} ${H}`;
