import { describe, expect, it } from "vitest";
import type { LanSession } from "../lib/ipc";
import { applyProgress, mergeSession, nextOffers } from "./lan";

const ev = (patch: Partial<LanSession> = {}): LanSession => ({
  id: "s1",
  role: "send",
  stage: "waiting",
  peer: { name: "PC", platform: "windows", addr: "192.168.1.5:47390" },
  file: { name: "a.mp4", size: 1000, kind: "video" },
  reason: null,
  path: "/a.mp4",
  following: false,
  expiresAt: null,
  ...patch,
});

describe("lan shares", () => {
  it("adds and updates sessions, keeping progress", () => {
    let s = mergeSession({}, ev(), 1);
    expect(s.s1).toMatchObject({ stage: "waiting", bytes: 0, total: 1000 });
    s = mergeSession(s, ev({ stage: "sending" }), 2);
    s = applyProgress(s, { id: "s1", role: "send", bytes: 400, total: 1000, speed: 50 });
    expect(s.s1).toMatchObject({ stage: "sending", bytes: 400, speed: 50 });
    // Progress never goes back.
    s = applyProgress(s, { id: "s1", role: "send", bytes: 300, total: 1000, speed: 50 });
    expect(s.s1.bytes).toBe(400);
    s = mergeSession(s, ev({ stage: "syncing", following: true }), 3);
    expect(s.s1).toMatchObject({ stage: "syncing", bytes: 1000, following: true });
  });

  it("ignores progress for unknown or finished sessions", () => {
    const s = mergeSession({}, ev({ stage: "ended", reason: "declined" }), 1);
    expect(applyProgress(s, { id: "s1", role: "send", bytes: 1, total: 1000, speed: 1 })).toBe(s);
    expect(applyProgress(s, { id: "nope", role: "send", bytes: 1, total: 1000, speed: 1 })).toBe(s);
  });

  it("drops old finished sessions", () => {
    let s = mergeSession({}, ev({ stage: "ended", reason: "done" }), 0);
    s = mergeSession(s, ev({ id: "s2" }), 11 * 60_000);
    expect(Object.keys(s)).toEqual(["s2"]);
  });

  it("tracks pending offers", () => {
    const offered = ev({ role: "receive", stage: "offered" });
    let o = nextOffers([], offered);
    expect(o).toEqual(["s1"]);
    expect(nextOffers(o, offered)).toEqual(["s1"]);
    o = nextOffers(o, ev({ role: "receive", stage: "accepted" }));
    expect(o).toEqual([]);
    expect(nextOffers(["x"], ev({ stage: "waiting" }))).toEqual(["x"]);
  });
});
