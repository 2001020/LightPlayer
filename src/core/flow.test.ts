import { describe, expect, it } from "vitest";
import { FLOW_ANGLE, flowCoverSize, flowTransform } from "./flow";

describe("cover flow", () => {
  it("faces the centre cover forward", () => {
    expect(flowTransform(0, 300)).toEqual({ x: 0, z: -0, rotate: -0, zIndex: 1000 });
  });

  it("turns side covers and stacks them", () => {
    const r1 = flowTransform(1, 300);
    const r3 = flowTransform(3, 300);
    expect(r1.rotate).toBe(-FLOW_ANGLE);
    expect(r3.rotate).toBe(-FLOW_ANGLE);
    expect(r1.x).toBeCloseTo(186);
    expect(r3.x - r1.x).toBeCloseTo(2 * 72);
    expect(r3.z).toBe(r1.z);
    expect(r1.zIndex).toBeGreaterThan(r3.zIndex);
  });

  it("is mirrored left and right", () => {
    for (const d of [0.3, 1, 2.5, 6]) {
      const l = flowTransform(-d, 240);
      const r = flowTransform(d, 240);
      expect(l.x).toBeCloseTo(-r.x);
      expect(l.rotate).toBeCloseTo(-r.rotate);
      expect(l.z).toBeCloseTo(r.z);
      expect(l.zIndex).toBe(r.zIndex);
    }
  });

  it("moves continuously between positions", () => {
    const half = flowTransform(0.5, 300);
    expect(half.rotate).toBeCloseTo(-FLOW_ANGLE / 2);
    expect(half.x).toBeCloseTo(93 + 42);
    // No jump where the turn ends and the stacking begins.
    expect(flowTransform(0.999, 300).x).toBeCloseTo(flowTransform(1.001, 300).x, 0);
  });

  it("never lets two covers cut through each other", () => {
    // Seen from above, each cover is a segment in x-z; none may cross.
    const seg = (d: number) => {
      const p = flowTransform(d, 1);
      const th = (p.rotate * Math.PI) / 180;
      const dx = Math.cos(th) / 2;
      const dz = -Math.sin(th) / 2;
      return [p.x - dx, p.z - dz, p.x + dx, p.z + dz];
    };
    const cross = ([x1, y1, x2, y2]: number[], [x3, y3, x4, y4]: number[]) => {
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-12) return false;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
      return t > 0 && t < 1 && u > 0 && u < 1;
    };
    for (let pos = 0; pos <= 1; pos += 0.01) {
      const covers = Array.from({ length: 13 }, (_, i) => seg(i - 6 - pos));
      for (let a = 0; a < covers.length; a++)
        for (let b = a + 1; b < covers.length; b++) expect(cross(covers[a], covers[b]), `pos ${pos.toFixed(2)}: ${a} and ${b}`).toBe(false);
    }
  });

  it("sizes covers to the stage", () => {
    expect(flowCoverSize(1600, 1000)).toBe(340);
    expect(flowCoverSize(900, 500)).toBe(210);
    expect(flowCoverSize(300, 200)).toBe(120);
  });
});
