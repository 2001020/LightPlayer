import { describe, expect, it } from "vitest";
import { cloudPalette, renderCloud, stratusDensity, type CloudJob } from "./cloudNoise";

const job = (p: Partial<CloudJob> = {}): CloudJob => ({
  kind: "cumulus",
  palette: cloudPalette("partly", "day"),
  shapeSeed: 3,
  detailSeed: 7,
  w: 160,
  h: 80,
  ...p,
});

const alphaAt = (px: Uint8ClampedArray, w: number, x: number, y: number) => px[(y * w + x) * 4 + 3];

describe("cloud textures", () => {
  it("is deterministic for a seed", () => {
    expect(renderCloud(job())).toEqual(renderCloud(job()));
    expect(renderCloud(job({ detailSeed: 8 }))).not.toEqual(renderCloud(job()));
  });

  it("fades to nothing at the sprite border (no clipped edges)", () => {
    for (const kind of ["cumulus", "cumulonimbus"] as const) {
      const { w, h } = job();
      const px = renderCloud(job({ kind }));
      for (let x = 0; x < w; x++) {
        expect(alphaAt(px, w, x, 0)).toBe(0);
        expect(alphaAt(px, w, x, h - 1)).toBe(0);
      }
      for (let y = 0; y < h; y++) {
        expect(alphaAt(px, w, 0, y)).toBe(0);
        expect(alphaAt(px, w, w - 1, y)).toBe(0);
      }
      // ...and there is a real cloud in the middle.
      expect(alphaAt(px, w, w / 2, Math.round(h * 0.6))).toBeGreaterThan(150);
    }
  });

  it("tiles stratus seamlessly from right to left", () => {
    const w = 192;
    const h = 48;
    const d = stratusDensity({ kind: "stratus", shapeSeed: 0, detailSeed: 5, w, h });
    let seam = 0;
    let inner = 0;
    for (let y = 0; y < h; y++) {
      seam += Math.abs(d[y * w + w - 1] - d[y * w]);
      inner += Math.abs(d[y * w + w / 2] - d[y * w + w / 2 - 1]);
    }
    expect(seam).toBeLessThan(inner * 3 + 0.5);
  });

  it("is brighter on the side facing the light", () => {
    const px = renderCloud(job({ w: 240, h: 120 }));
    const lum = (x0: number, x1: number, y0: number, y1: number) => {
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * 240 + x) * 4;
          if (px[i + 3] < 128) continue;
          sum += px[i] + px[i + 1] + px[i + 2];
          n++;
        }
      return n ? sum / n : 0;
    };
    // Day light comes from the upper right; the base is shaded.
    expect(lum(120, 240, 0, 60)).toBeGreaterThan(lum(0, 120, 60, 120));
  });
});
