import { describe, expect, it } from "vitest";
import { cloudDecks, cloudPalette, renderCloud, stratusDensity, type CloudJob } from "./cloudNoise";

const job = (p: Partial<CloudJob> = {}): CloudJob => ({
  palette: cloudPalette("cloudy", "day"),
  seed: 7,
  cover: 0.6,
  w: 192,
  h: 48,
  ...p,
});

const mean = (d: Float32Array) => d.reduce((a, b) => a + b, 0) / d.length;

describe("cloud textures", () => {
  it("is deterministic for a seed", () => {
    expect(renderCloud(job())).toEqual(renderCloud(job()));
    expect(renderCloud(job({ seed: 8 }))).not.toEqual(renderCloud(job()));
  });

  it("tiles seamlessly from right to left", () => {
    const { w, h } = job();
    const d = stratusDensity(job({ seed: 5 }));
    let seam = 0;
    let inner = 0;
    for (let y = 0; y < h; y++) {
      seam += Math.abs(d[y * w + w - 1] - d[y * w]);
      inner += Math.abs(d[y * w + w / 2] - d[y * w + w / 2 - 1]);
    }
    expect(seam).toBeLessThan(inner * 3 + 0.5);
  });

  it("thins out into wisps as the cover drops", () => {
    const thin = mean(stratusDensity(job({ cover: 0.25 })));
    const mid = mean(stratusDensity(job({ cover: 0.6 })));
    const full = mean(stratusDensity(job({ cover: 1 })));
    expect(thin).toBeGreaterThan(0);
    expect(thin).toBeLessThan(mid);
    expect(mid).toBeLessThan(full);
  });
});

describe("cloud layout", () => {
  it("uses bands only, more and thicker as the weather turns", () => {
    expect(cloudDecks("clear", 0)).toEqual([]);
    const partly = cloudDecks("partly", 0.3);
    const overcast = cloudDecks("overcast", 0.95);
    expect(partly.length).toBeGreaterThan(0);
    expect(overcast.length).toBeGreaterThanOrEqual(partly.length);
    expect(Math.max(...overcast.map((d) => d.cover))).toBeGreaterThan(Math.max(...partly.map((d) => d.cover)));
  });
});
