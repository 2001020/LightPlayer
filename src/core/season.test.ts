import { describe, expect, it } from "vitest";
import { activeSeason, seasonOf } from "./season";

const d = (m: number) => new Date(2026, m - 1, 15);

describe("seasonOf", () => {
  it("goes by month in the northern hemisphere", () => {
    expect([1, 2, 3, 5, 6, 8, 9, 11, 12].map((m) => seasonOf(d(m)))).toEqual([
      "winter", "winter", "spring", "spring", "summer", "summer", "autumn", "autumn", "winter",
    ]);
  });
  it("is half a year apart in the southern hemisphere", () => {
    expect(seasonOf(d(11), true)).toBe("spring");
    expect(seasonOf(d(1), true)).toBe("summer");
    expect(seasonOf(d(4), true)).toBe("autumn");
    expect(seasonOf(d(7), true)).toBe("winter");
  });
});

describe("activeSeason", () => {
  it("follows the calendar for the automatic theme", () => {
    expect(activeSeason("season", d(11))).toBe("autumn");
    expect(activeSeason("season", d(11), true)).toBe("spring");
  });
  it("keeps a chosen season whatever the date", () => {
    expect(activeSeason("winter", d(7))).toBe("winter");
    expect(activeSeason("spring", d(11), true)).toBe("spring");
  });
  it("is null for the other themes", () => {
    expect(["system", "light", "dark", "weather"].map((t) => activeSeason(t, d(1)))).toEqual([null, null, null, null]);
  });
});
