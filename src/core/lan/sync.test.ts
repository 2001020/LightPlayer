import { describe, expect, it } from "vitest";
import { follow, leftByUs, NO_FOLLOW, remotePosition, SEEK_GAP, SLOW_SEEK_GAP, syncAction, type Local, type Remote } from "./sync";

const now = 100_000;
const remote = (pos: number, playing = true, rate = 1, at = now): Remote => ({ pos, at, playing, rate });
const local = (pos: number, playing = true, rate = 1, inPlace = true): Local => ({ pos, playing, rate, canSeekInPlace: () => inPlace });
const ctx = { nudging: false, lead: 0 };

describe("remotePosition", () => {
  it("extrapolates while playing", () => {
    expect(remotePosition(remote(10, true, 1, now - 2000), now)).toBeCloseTo(12);
    expect(remotePosition(remote(10, true, 1.5, now - 2000), now)).toBeCloseTo(13);
    expect(remotePosition(remote(10, false, 1, now - 2000), now)).toBe(10);
  });
});

describe("syncAction", () => {
  it("leaves things alone when in step", () => {
    expect(syncAction(local(10.01), remote(10), now, ctx)).toEqual({ nudge: 1 });
  });

  it("matches the speed first", () => {
    expect(syncAction(local(10, true, 1), remote(10, true, 1.25), now, ctx).rate).toBe(1.25);
  });

  it("pauses at the sender's position", () => {
    expect(syncAction(local(12), remote(10, false), now, ctx)).toEqual({ nudge: 1, pause: true, seek: 10 });
    expect(syncAction(local(10.02, false), remote(10, false), now, ctx)).toEqual({ nudge: 1 });
  });

  it("jumps on large gaps, aiming ahead by the measured lead", () => {
    const s = syncAction(local(5), remote(10), now, { nudging: false, lead: 0.3 });
    expect(s.seek).toBeCloseTo(10.3);
    expect(s.play).toBeUndefined();
    expect(syncAction(local(10 + SEEK_GAP + 0.1), remote(10), now, ctx).seek).toBe(10);
  });

  it("avoids restarting a stream for moderate gaps", () => {
    const s = syncAction(local(11.5, true, 1, false), remote(10), now, ctx);
    expect(s.seek).toBeUndefined();
    expect(s.nudge).toBeLessThan(1);
    expect(syncAction(local(10 + SLOW_SEEK_GAP + 0.5, true, 1, false), remote(10), now, ctx).seek).toBe(10);
  });

  it("starts playing when the sender plays", () => {
    expect(syncAction(local(10, false), remote(10), now, ctx)).toEqual({ nudge: 1, play: true });
    expect(syncAction(local(9.5, false), remote(10), now, ctx)).toEqual({ nudge: 1, play: true, seek: 10 });
  });

  it("nudges the speed on small gaps, with hysteresis", () => {
    const ahead = syncAction(local(10.2), remote(10), now, ctx);
    expect(ahead.nudge).toBeCloseTo(0.96);
    const behind = syncAction(local(9.9), remote(10), now, ctx);
    expect(behind.nudge).toBeCloseTo(1.02);
    // Not started below the start threshold, but kept until the stop threshold.
    expect(syncAction(local(10.04), remote(10), now, ctx).nudge).toBe(1);
    expect(syncAction(local(10.04), remote(10), now, { nudging: true, lead: 0 }).nudge).toBeLessThan(1);
    expect(syncAction(local(10.01), remote(10), now, { nudging: true, lead: 0 }).nudge).toBe(1);
  });
});

describe("follow", () => {
  const started = follow(NO_FOLLOW, { type: "start", id: "s1", peer: "Mac", path: "/m.mp4", userRate: 1.25 });

  it("starts following", () => {
    expect(started).toMatchObject({ id: "s1", mode: "following", userRate: 1.25 });
  });

  it("pauses following on the user's own playback changes", () => {
    for (const action of ["play", "pause", "seek", "rate", "background"] as const) {
      expect(follow(started, { type: "user", action }).mode).toBe("paused");
    }
    const paused = follow(started, { type: "user", action: "seek" });
    expect(follow(paused, { type: "resume" }).mode).toBe("following");
  });

  it("ends when the user opens something else or stops", () => {
    const opened = follow(started, { type: "user", action: "open" });
    expect(opened).toMatchObject({ mode: "ended", reason: "opened" });
    expect(leftByUs(started, opened)).toBe(true);
    const stopped = follow(started, { type: "stop" });
    expect(stopped).toMatchObject({ mode: "ended", reason: "left" });
    expect(leftByUs(started, stopped)).toBe(true);
    expect(follow(stopped, { type: "dismiss" })).toEqual(NO_FOLLOW);
  });

  it("tracks the session", () => {
    const lost = follow(started, { type: "stage", id: "s1", stage: "lost" });
    expect(lost.lost).toBe(true);
    expect(follow(lost, { type: "stage", id: "s1", stage: "syncing" }).lost).toBe(false);
    const ended = follow(lost, { type: "stage", id: "s1", stage: "ended", reason: "switched" });
    expect(ended).toMatchObject({ mode: "ended", reason: "switched", lost: false });
    expect(leftByUs(lost, ended)).toBe(false);
    // Other sessions do not matter.
    expect(follow(started, { type: "stage", id: "other", stage: "ended" })).toBe(started);
  });

  it("ignores user actions when not following", () => {
    expect(follow(NO_FOLLOW, { type: "user", action: "open" })).toBe(NO_FOLLOW);
  });
});
