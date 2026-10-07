import { describe, expect, it } from "vitest";
import type { WeatherReport } from "../../lib/ipc";
import { dayPhase, describeCode, mix, phaseStarts, previewScene, PREVIEWS, sceneOf, skyColors, TIME_PHASES, timeOfDay, windDrift } from "./scene";

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

  it("splits the day into nine stages around sunrise and sunset", () => {
    const at = (h: number) => timeOfDay(SUNRISE + h * 3600, SUNRISE, SUNSET).phase;
    // Sunrise 06:00, sunset 18:00.
    expect(at(-0.5)).toBe("daybreak"); // 05:30
    expect(at(0.2)).toBe("sunrise"); // 06:12
    expect(at(3)).toBe("morning"); // 09:00
    expect(at(6)).toBe("noon"); // 12:00
    expect(at(8)).toBe("afternoon"); // 14:00
    expect(at(11)).toBe("evening"); // 17:00
    expect(at(12)).toBe("sunset"); // 18:00
    expect(at(14)).toBe("night"); // 20:00
    expect(at(19)).toBe("midnight"); // 01:00
    expect(at(19 + 24)).toBe("midnight"); // any day
    // Every stage comes up, in order.
    const seen: string[] = [];
    for (let m = -60; m < 24 * 60 - 60; m += 5) {
      const p = timeOfDay(SUNRISE + m * 60, SUNRISE, SUNSET).phase;
      if (seen[seen.length - 1] !== p) seen.push(p);
    }
    expect(seen).toEqual(["midnight", ...TIME_PHASES.map((p) => p.id)]);
  });

  it("keeps the stages in order on very short and very long days", () => {
    for (const hours of [0.5, 4, 9, 12, 16, 20, 23.5]) {
      const starts = phaseStarts(hours * 3600).map(([, t]) => t);
      for (let i = 1; i < starts.length; i++) expect(starts[i], `${hours}h`).toBeGreaterThan(starts[i - 1]);
      expect(starts[starts.length - 1] - starts[0]).toBeLessThan(86400);
    }
  });

  it("moves the sun and moon and changes colour without jumps", () => {
    const noon = timeOfDay(SUNRISE + 6 * 3600, SUNRISE, SUNSET);
    expect(noon.sun).toBeCloseTo(0.5);
    expect(noon.look.light).toBe(1);
    const late = timeOfDay(SUNSET + 6 * 3600, SUNRISE, SUNSET);
    expect(late.sun).toBeGreaterThan(1);
    expect(late.moon).toBeCloseTo(0.5);
    const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    let prev = timeOfDay(SUNRISE - 3 * 3600, SUNRISE, SUNSET).look;
    for (let m = 1; m <= 24 * 60; m++) {
      const look = timeOfDay(SUNRISE - 3 * 3600 + m * 60, SUNRISE, SUNSET).look;
      for (let k = 0; k < 3; k++) {
        const d = Math.max(...rgb(look.sky[k]).map((v, i) => Math.abs(v - rgb(prev.sky[k])[i])));
        expect(d, `minute ${m}`).toBeLessThanOrEqual(4);
      }
      expect(Math.abs(look.light - prev.light)).toBeLessThan(0.02);
      prev = look;
    }
  });

  it("follows a 06:00 to 18:30 clock without sunrise and sunset", () => {
    const d = new Date(2026, 9, 7, 12, 0);
    expect(timeOfDay(d.getTime() / 1000).phase).toBe("noon");
    d.setHours(2);
    expect(timeOfDay(d.getTime() / 1000).phase).toBe("midnight");
  });

  it("turns wind into a drift of the right side", () => {
    expect(windDrift(30, 90)).toBeLessThan(0); // from the east, blows west
    expect(windDrift(30, 270)).toBeGreaterThan(0);
    expect(Math.abs(windDrift(500, 270))).toBeLessThanOrEqual(0.81);
  });

  it("builds a scene from a report", () => {
    const s = sceneOf(report({ code: 61, cloudCover: 100 }), SUNRISE + 5 * 3600);
    expect(s).toMatchObject({ kind: "rain", phase: "day", label: "小雨" });
    expect(s.time.phase).toBe("noon"); // 11:00
    expect(s.clouds).toBeGreaterThan(0.8);
    expect(sceneOf(report({ code: 0, cloudCover: 40 }), SUNRISE + 5 * 3600).clouds).toBe(0);
  });

  it("has colours for every preview", () => {
    for (const p of PREVIEWS) {
      const s = previewScene(p.id)!;
      expect(skyColors(s).every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    }
    for (const p of TIME_PHASES) expect(previewScene(`time:${p.id}`)!.time.phase).toBe(p.id);
    expect(previewScene("nightRain")!.phase).toBe("night");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});
