// Following another device's playback (LAN sync): the pure parts, kept out of
// the runtime so they can be tested on their own.

/** The sender's playback, as received (`at` is this computer's Date.now()). */
export interface Remote {
  pos: number;
  at: number;
  playing: boolean;
  rate: number;
}

export interface Local {
  pos: number;
  playing: boolean;
  /** Nominal speed (without the nudge). */
  rate: number;
  /** Whether jumping to `t` is quick (no stream to restart). */
  canSeekInPlace: (t: number) => boolean;
}

export interface SyncCtx {
  /** A speed nudge is under way (hysteresis). */
  nudging: boolean;
  /** How long recent jumps took to settle (seconds), aimed ahead by that much. */
  lead: number;
}

export interface SyncStep {
  rate?: number;
  seek?: number;
  play?: true;
  pause?: true;
  /** Speed factor on top of `rate` (1 = none). */
  nudge: number;
}

/** Beyond these gaps a jump beats catching up by speed. */
export const SEEK_GAP = 0.5;
/** ...when the jump means restarting a stream (HLS, exact-timing copy). */
export const SLOW_SEEK_GAP = 2.5;
const NUDGE_START = 0.06;
const NUDGE_STOP = 0.02;
const NUDGE_MAX = 0.04;

/** Where the sender is `now`. */
export function remotePosition(r: Remote, now: number): number {
  return r.pos + (r.playing ? ((now - r.at) / 1000) * r.rate : 0);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** What to do to line local playback up with the sender's. */
export function syncAction(local: Local, remote: Remote, now: number, ctx: SyncCtx): SyncStep {
  const step: SyncStep = { nudge: 1 };
  if (Math.abs(local.rate - remote.rate) > 1e-3) step.rate = remote.rate;
  const target = remotePosition(remote, now);
  const d = local.pos - target;
  if (!remote.playing) {
    if (local.playing) step.pause = true;
    if (Math.abs(d) > 0.05) step.seek = target;
    return step;
  }
  const lead = clamp(ctx.lead, 0, 3) * remote.rate;
  const inPlace = local.canSeekInPlace(target);
  if (Math.abs(d) > (inPlace ? SEEK_GAP : SLOW_SEEK_GAP)) {
    step.seek = target + lead;
    if (!local.playing) step.play = true;
    return step;
  }
  if (!local.playing) {
    step.play = true;
    if (Math.abs(d) > 0.15) step.seek = target + lead;
    return step;
  }
  if (Math.abs(d) > (ctx.nudging ? NUDGE_STOP : NUDGE_START)) {
    // Ahead: a little slower; behind: a little faster (closes in ~5 s).
    step.nudge = 1 - clamp(0.2 * d, -NUDGE_MAX, NUDGE_MAX);
  }
  return step;
}

// ------------------------------------------------------------------ following

export type FollowMode = "off" | "following" | "paused" | "ended";

export interface FollowState {
  id: string | null;
  peer: string;
  path: string | null;
  mode: FollowMode;
  /** The sender is not heard from (shown, playback goes on). */
  lost: boolean;
  reason: string | null;
  /** The speed the user had before following, restored afterwards. */
  userRate: number | null;
}

export const NO_FOLLOW: FollowState = { id: null, peer: "", path: null, mode: "off", lost: false, reason: null, userRate: null };

export type FollowEvent =
  | { type: "start"; id: string; peer: string; path: string; userRate: number }
  | { type: "user"; action: "play" | "pause" | "seek" | "rate" | "open" | "background" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "stage"; id: string; stage: string; reason?: string | null }
  | { type: "dismiss" };

export function follow(s: FollowState, e: FollowEvent): FollowState {
  switch (e.type) {
    case "start":
      return { id: e.id, peer: e.peer, path: e.path, mode: "following", lost: false, reason: null, userRate: e.userRate };
    case "user":
      if (s.mode !== "following" && s.mode !== "paused") return s;
      // Opening something else ends it; anything else just pauses following.
      if (e.action === "open") return { ...s, mode: "ended", reason: "opened" };
      return s.mode === "following" ? { ...s, mode: "paused" } : s;
    case "resume":
      return s.mode === "paused" ? { ...s, mode: "following" } : s;
    case "stop":
      return s.mode === "following" || s.mode === "paused" ? { ...s, mode: "ended", reason: "left" } : s;
    case "stage":
      if (e.id !== s.id || (s.mode !== "following" && s.mode !== "paused")) return s;
      if (e.stage === "ended") return { ...s, mode: "ended", lost: false, reason: e.reason ?? null };
      if (e.stage === "lost") return { ...s, lost: true };
      if (e.stage === "syncing") return { ...s, lost: false };
      return s;
    case "dismiss":
      return s.mode === "ended" ? NO_FOLLOW : s;
  }
}

/** Following is over and the session should be ended on our side too. */
export const leftByUs = (prev: FollowState, next: FollowState) =>
  prev.mode !== "ended" && next.mode === "ended" && (next.reason === "opened" || next.reason === "left");
