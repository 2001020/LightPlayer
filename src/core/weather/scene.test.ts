import { describe, expect, it } from "vitest";
import type { WeatherReport } from "../../lib/ipc";
import { dayPhase, describeCode, mix, previewScene, PREVIEWS, sceneOf, skyColors, windDrift } from "./scene";

const SUNRISE = 1_790_805_600; // 06:00
const SUNSET = SUNRISE + 12 * 3600; // 18:00

const report = (p: Partial<WeatherReport>): WeatherReport => ({
  place: "x",
  lat: 0,
  lon: 0,
  code: 0,
  temperature: 20,
  apparent: 20,
  humidity: 50,
  isDay: true,
  cloudCover: 0,
  precipitation: 0,
  windSpeed: 0,
  windDirection: 0,
  sunrise: SUNRISE,
  sunset: SUNSET,
  fetchedAt: 0,
  ...p,
});

describe("weather scene", () => {
  it("maps WMO codes", () => {
    expect(describeCode(0).kind).toBe("clear");
    expect(describeCode(3).label).toBe("阴");
    expect(describeCode(65).kind).toBe("heavyRain");
    expect(describeCode(75)).toMatchObject({ kind: "snow", label: "大雪" });
    expect(describeCode(95).kind).toBe("thunder");
    expect(describeCode(99).kind).toBe("hail");
    expect(describeCode(1234).kind).toBe("cloudy");
  });

  it("works out the time of day from sunrise and sunset", () => {
    expect(dayPhase(SUNRISE + 3600 * 6, SUNRISE, SUNSET)).toBe("day");
    expect(dayPhase(SUNRISE + 10 * 60, SUNRISE, SUNSET)).toBe("dawn");
    expect(dayPhase(SUNRISE - 10 * 60, SUNRISE, SUNSET)).toBe("dawn");
    expect(dayPhase(SUNSET + 20 * 60, SUNRISE, SUNSET)).toBe("dusk");
    expect(dayPhase(SUNSET + 3 * 3600, SUNRISE, SUNSET)).toBe("night");
    // The next day, same clock time: still day.
    expect(dayPhase(SUNRISE + 86400 + 3600 * 5, SUNRISE, SUNSET)).toBe("day");
    expect(dayPhase(0, null, null, false)).toBe("night");
  });

  it("turns wind into a drift of the right side", () => {
    expect(windDrift(30, 90)).toBeLessThan(0); // from the east, blows west
    expect(windDrift(30, 270)).toBeGreaterThan(0);
    expect(Math.abs(windDrift(500, 270))).toBeLessThanOrEqual(0.81);
  });

  it("builds a scene from a report", () => {
    const s = sceneOf(report({ code: 61, cloudCover: 100 }), SUNRISE + 5 * 3600);
    expect(s).toMatchObject({ kind: "rain", phase: "day", label: "小雨" });
    expect(s.clouds).toBeGreaterThan(0.8);
    expect(sceneOf(report({ code: 0, cloudCover: 40 }), SUNRISE + 5 * 3600).clouds).toBe(0);
  });

  it("has colours for every preview", () => {
    for (const p of PREVIEWS) {
      const s = previewScene(p.id)!;
      expect(skyColors(s).every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    }
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});
