import { describe, expect, it } from "vitest";
import { cellOf, damp, homeOf, idleWave, layout, selectionWave, settled, shoulder, trackAt } from "./field";

describe("archive layout", () => {
  it("splits a playlist into at most five columns", () => {
    expect(layout(1)).toMatchObject({ lanes: 1, sizes: [1], starts: [0] });
    expect(layout(3)).toMatchObject({ lanes: 3, sizes: [1, 1, 1] });
    expect(layout(8)).toMatchObject({ lanes: 5, sizes: [2, 2, 2, 1, 1], starts: [0, 2, 4, 6, 7] });
    expect(layout(100).sizes).toEqual([20, 20, 20, 20, 20]);
  });

  it("maps every box to a song and every song to its box", () => {
    for (const n of [1, 3, 5, 8, 12, 100]) {
      const l = layout(n);
      const seen = new Set<number>();
      for (let lane = -12; lane <= 12; lane++) {
        for (let row = -40; row <= 40; row++) {
          const i = trackAt({ lane, row }, l);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(n);
          seen.add(i);
        }
      }
      expect(seen.size).toBe(n);
      for (let i = 0; i < n; i++) expect(trackAt(homeOf(i, l), l)).toBe(i);
    }
    expect(trackAt({ lane: 0, row: 0 }, layout(0))).toBe(-1);
  });

  it("picks the copy of a song nearest to where the camera is", () => {
    const l = layout(12); // columns of 3, 3, 2, 2, 2
    const near = { lane: 10, row: 31 };
    for (let i = 0; i < 12; i++) {
      const c = cellOf(i, near, l);
      expect(trackAt(c, l)).toBe(i);
      const home = homeOf(i, l);
      expect(Math.abs(c.lane - near.lane)).toBeLessThanOrEqual(l.lanes / 2);
      expect(Math.abs(c.row - near.row)).toBeLessThanOrEqual(l.sizes[home.lane] / 2);
    }
  });
});

describe("archive waves", () => {
  it("are still outside their time and stay small", () => {
    expect(selectionWave(0, -0.1)).toBe(0);
    expect(selectionWave(0, 3.3)).toBe(0);
    let peak = 0;
    for (let age = 0; age < 3.2; age += 0.01) for (let d = 0; d < 30; d += 0.5) peak = Math.max(peak, Math.abs(selectionWave(d, age)));
    expect(peak).toBeLessThan(0.8);
    for (let t = 0; t < 30; t += 0.37) expect(Math.abs(idleWave(3, 2, t))).toBeLessThan(0.103);
  });

  it("raises a shoulder around the chosen box that falls off with distance", () => {
    expect(shoulder(0)).toBeGreaterThan(2);
    expect(shoulder(6)).toBeLessThan(shoulder(1));
    expect(shoulder(40)).toBeGreaterThanOrEqual(-0.42);
  });

  it("springs settle on their target", () => {
    const s = { value: 0, velocity: 0 };
    for (let i = 0; i < 300; i++) damp(s, 5, 4, 1 / 60);
    expect(settled(s, 5)).toBe(true);
  });
});
