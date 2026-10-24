// The archive array: which song each box stands for, and how high it sits.
// The wave shapes come from LBEILC/RhineLabUI (MIT, see
// public/archive/LICENSE-RhineLabUI.txt), with its times made relative.

export type Cell = { lane: number; row: number };

/** World distance between neighbouring columns / boxes in a column. */
export const COLUMN_SPACING = 5.2;
export const ROW_SPACING = 0.62;
/** Box base height in the world. */
export const BASE_Y = -4.6;

export const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + 6 * t));
};

const bell = (x: number, width: number) => Math.exp(-0.5 * (x / width) ** 2);

export const wrap = (value: number, count: number) => ((value % count) + count) % count;

/** Columns for a playlist of `n` songs: at most 5, at least 1. */
export interface Layout {
  n: number;
  lanes: number;
  /** Songs in each column (the last ones may hold one fewer). */
  sizes: number[];
  /** Index of the first song of each column. */
  starts: number[];
}

export function layout(n: number): Layout {
  const lanes = Math.max(1, Math.min(5, n));
  const base = Math.floor(n / lanes);
  const extra = n % lanes;
  const sizes = Array.from({ length: lanes }, (_, i) => base + (i < extra ? 1 : 0));
  const starts: number[] = [];
  let at = 0;
  for (const s of sizes) {
    starts.push(at);
    at += s;
  }
  return { n, lanes, sizes, starts };
}

/** The song a box stands for: columns and rows repeat without end. */
export function trackAt({ lane, row }: Cell, l: Layout): number {
  if (l.n <= 0) return -1;
  const c = wrap(lane, l.lanes);
  return l.starts[c] + wrap(row, l.sizes[c]);
}

/** Where song `index` is in the canonical tile (lane 0..lanes-1). */
export function homeOf(index: number, l: Layout): Cell {
  let lane = l.lanes - 1;
  while (lane > 0 && l.starts[lane] > index) lane--;
  return { lane, row: index - l.starts[lane] };
}

/** The nearest copy of `value` (repeating every `period`) to `center`. */
export const nearest = (value: number, center: number, period: number) =>
  value + Math.round((center - value) / period) * period;

/** The box of song `index` nearest to `near`, so the camera takes the short way. */
export function cellOf(index: number, near: Cell, l: Layout): Cell {
  const home = homeOf(index, l);
  return {
    lane: nearest(home.lane, near.lane, l.lanes),
    row: nearest(home.row, near.row, l.sizes[home.lane]),
  };
}

/** A quiet drift, neighbouring boxes slightly out of phase (at most ~0.1). */
export function idleWave(row: number, lane: number, time: number) {
  return (
    0.075 * Math.sin((time * Math.PI * 2) / 8 + row * 0.3 - lane * 0.45) +
    0.027 * Math.sin((time * Math.PI * 2) / 13 - row * 0.17 + lane * 0.3)
  );
}

/** The ripple that runs out from a newly chosen box (`age` in seconds). */
export function selectionWave(distance: number, age: number) {
  if (age < 0 || age > 3.2) return 0;
  return (
    0.8 *
    smooth(age / 0.2) *
    Math.exp(-age * 1.15) *
    Math.cos((distance - age * 8) * 0.58) *
    bell(distance - age * 8, 3.4)
  );
}

/** The settled shoulders around the chosen box in its column. */
export function shoulder(distance: number) {
  const envelope = Math.max(-0.42, 2.15 - 0.17 * (Math.sqrt(distance * distance + 1) - 1));
  // Settled value of the reference's wave once its ring has died out.
  const age = 1.51 - Math.abs(distance) * 0.065;
  const rise = smooth(age / 0.62);
  const ring = age > 0 ? Math.sin(age * 5.1) * Math.exp(-age * 1.3) : 0;
  return envelope * (rise + 0.18 * ring * smooth(age / 0.16));
}

/** How much a column takes part in the shoulders: fully the chosen one. */
export const columnStrength = (lane: number, focus: number) => 0.25 + 0.75 * bell(lane - focus, 0.55);

export interface Spring {
  value: number;
  velocity: number;
}

/** A critically damped spring step towards `target`. */
export function damp(s: Spring, target: number, rate: number, dt: number) {
  const delta = s.value - target;
  const impulse = s.velocity + rate * delta;
  const decay = Math.exp(-rate * dt);
  s.value = target + (delta + impulse * dt) * decay;
  s.velocity = (s.velocity - rate * impulse * dt) * decay;
}

export const settled = (s: Spring, target: number, eps = 1e-3) => Math.abs(s.value - target) < eps && Math.abs(s.velocity) < eps;
