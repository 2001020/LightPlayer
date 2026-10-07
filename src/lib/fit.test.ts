import { describe, expect, it } from "vitest";
import { fitRow } from "./fit";

const base = { items: [60, 36, 36, 36, 36], pinned: 36, volume: 134, volumeIcon: 36, more: 36 };

describe("fitRow", () => {
  it("shows everything when there is room", () => {
    expect(fitRow({ ...base, avail: 500 })).toEqual({ fold: 0, compactVolume: false });
  });

  it("shrinks the volume slider before folding anything", () => {
    // Everything: 204 + 36 + 134 = 374. With the volume button: 276.
    expect(fitRow({ ...base, avail: 300 })).toEqual({ fold: 0, compactVolume: true });
  });

  it("folds from the left and makes room for the more button", () => {
    // Folding the first two leaves 108 + 36 + 36 + 36 = 216.
    expect(fitRow({ ...base, avail: 230 })).toEqual({ fold: 2, compactVolume: true });
    expect(fitRow({ ...base, avail: 216 })).toEqual({ fold: 2, compactVolume: true });
    expect(fitRow({ ...base, avail: 215 })).toEqual({ fold: 3, compactVolume: true });
  });

  it("folds everything when even the pinned buttons barely fit", () => {
    expect(fitRow({ ...base, avail: 50 })).toEqual({ fold: 5, compactVolume: true });
  });

  it("keeps room for the more button when asked", () => {
    expect(fitRow({ ...base, avail: 374 })).toEqual({ fold: 0, compactVolume: false });
    expect(fitRow({ ...base, avail: 374, alwaysMore: true })).toEqual({ fold: 0, compactVolume: true });
  });

  it("handles no foldable items", () => {
    expect(fitRow({ ...base, items: [], avail: 100 })).toEqual({ fold: 0, compactVolume: true });
  });
});
