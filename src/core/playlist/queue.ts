// Play-order logic for the four play modes. Pure functions for easy testing.

export type PlayMode = "sequential" | "loop" | "single" | "shuffle";

export const PLAY_MODES: PlayMode[] = ["sequential", "loop", "single", "shuffle"];

export function nextMode(mode: PlayMode): PlayMode {
  return PLAY_MODES[(PLAY_MODES.indexOf(mode) + 1) % PLAY_MODES.length];
}

export interface QueueState {
  length: number;
  index: number;
  mode: PlayMode;
  /** Shuffle order (a permutation of indices) for the current round. */
  order: number[];
  /** Indices played so far, most recent last (for "previous" in shuffle). */
  history: number[];
}

export function shuffled(length: number, first?: number, rand: () => number = Math.random): number[] {
  const a = Array.from({ length }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (first !== undefined && first >= 0 && first < length) {
    const k = a.indexOf(first);
    [a[0], a[k]] = [a[k], a[0]];
  }
  return a;
}

/**
 * Index to play after the current one.
 * `auto` = the track ended by itself (single-loop repeats; sequential stops at the end).
 * Returns null when playback should stop.
 */
export function nextIndex(q: QueueState, auto: boolean, rand: () => number = Math.random): { index: number | null; order: number[] } {
  const { length, index, mode } = q;
  if (length === 0) return { index: null, order: q.order };
  if (mode === "single" && auto) return { index, order: q.order };
  if (mode === "shuffle") {
    let order = q.order.length === length ? q.order : shuffled(length, index, rand);
    let pos = order.indexOf(index);
    if (pos < 0 || pos === length - 1) {
      // New round; avoid immediately repeating the current track.
      order = shuffled(length, undefined, rand);
      if (length > 1 && order[0] === index) [order[0], order[1]] = [order[1], order[0]];
      pos = -1;
    }
    return { index: order[pos + 1], order };
  }
  if (index + 1 < length) return { index: index + 1, order: q.order };
  if (mode === "sequential" && auto) return { index: null, order: q.order };
  return { index: 0, order: q.order };
}

/** Index for the "previous" button. */
export function prevIndex(q: QueueState): { index: number; history: number[] } {
  const { length, index, mode } = q;
  if (length === 0) return { index: -1, history: q.history };
  if (mode === "shuffle" && q.history.length > 0) {
    const history = q.history.slice();
    let prev = history.pop()!;
    while (prev === index && history.length) prev = history.pop()!;
    if (prev !== index && prev < length) return { index: prev, history };
  }
  return { index: (index - 1 + length) % length, history: q.history };
}
