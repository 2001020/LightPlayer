import { describe, expect, it } from "vitest";
import { addListening, creditFor, dayKey, emptyListening, lastDays, sanitizeListening, topArtists, topSongs, totals } from "./listening";

const song = (n: number, artist: string | null = "歌手") => ({ path: `/music/${n}.mp3`, title: `歌 ${n}`, artist });
// Wednesday 2026-11-18, 21:30 local time.
const now = new Date(2026, 10, 18, 21, 30);

describe("listening time", () => {
  it("adds up by day, song and artist", () => {
    let d = addListening(emptyListening, song(1), 100, now);
    d = addListening(d, song(1), 20.04, now);
    d = addListening(d, song(2, null), 50, new Date(2026, 10, 17, 9));
    expect(d.days).toEqual({ "2026-11-18": 120, "2026-11-17": 50 });
    expect(d.songs["/music/1.mp3"]).toMatchObject({ title: "歌 1", seconds: 120, last: now.getTime() });
    expect(d.artists).toEqual({ 歌手: 120 });
    expect(d.since).toBe(now.getTime() - 100_000);
    // Nothing to add: the same object comes back.
    expect(addListening(d, song(1), 0, now)).toBe(d);
    expect(addListening(d, song(1), NaN, now)).toBe(d);
    expect(emptyListening).toEqual({ days: {}, songs: {}, artists: {}, since: null });
  });

  it("forgets the least listened songs past the limit, keeping the totals", () => {
    let d = emptyListening;
    for (let i = 1; i <= 4; i++) d = addListening(d, song(i), i * 10, now, 3);
    expect(Object.keys(d.songs).sort()).toEqual(["/music/2.mp3", "/music/3.mp3", "/music/4.mp3"]);
    // A new song is kept even though it has the least time.
    d = addListening(d, song(9), 1, now, 3);
    expect(Object.keys(d.songs).sort()).toEqual(["/music/3.mp3", "/music/4.mp3", "/music/9.mp3"]);
    expect(d.days["2026-11-18"]).toBe(101);
    expect(d.artists.歌手).toBe(101);
  });

  it("credits short stretches in full and long ones by how far the song moved", () => {
    expect(creditFor(0, 10_000, 0, 1)).toBe(10);
    expect(creditFor(0, 20_000, 3, 1)).toBe(20);
    // A held-back timer: the song really played for the whole minute.
    expect(creditFor(0, 60_000, 60, 1)).toBe(60);
    expect(creditFor(0, 60_000, 90, 1.5)).toBe(60);
    // The computer slept for an hour: the song moved 4 seconds.
    expect(creditFor(0, 3_600_000, 4, 1)).toBe(4);
    // A seek backwards, or forwards past the stretch.
    expect(creditFor(0, 60_000, -100, 1)).toBe(0);
    expect(creditFor(0, 60_000, 500, 1)).toBe(60);
    expect(creditFor(10, 10, 5, 1)).toBe(0);
    expect(creditFor(10, 0, 5, 1)).toBe(0);
  });

  it("totals today, the week from Monday, the month and all time", () => {
    const days = {
      "2026-11-18": 600, // today (Wednesday)
      "2026-11-16": 300, // Monday
      "2026-11-15": 120, // last Sunday
      "2026-11-01": 60,
      "2026-10-31": 30,
      "2026-11-19": 999, // a clock set back: not this week's
    };
    const t = totals({ ...emptyListening, days }, now);
    expect(t).toEqual({ today: 600, week: 900, month: 600 + 300 + 120 + 60 + 999, all: 2109, activeDays: 6 });
    // On a Sunday the week still began on Monday.
    const sun = new Date(2026, 10, 15, 8);
    expect(totals({ ...emptyListening, days }, sun).week).toBe(120);
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("lists the last days in order, across a month boundary", () => {
    const d = { ...emptyListening, days: { "2026-10-31": 30, "2026-11-02": 45 } };
    const got = lastDays(d, 4, new Date(2026, 10, 2, 23, 59));
    expect(got.map((x) => [x.key, x.seconds])).toEqual([
      ["2026-10-30", 0],
      ["2026-10-31", 30],
      ["2026-11-01", 0],
      ["2026-11-02", 45],
    ]);
    expect(got[3].date.getDate()).toBe(2);
  });

  it("ranks songs and artists by time", () => {
    let d = emptyListening;
    d = addListening(d, song(1, "甲"), 30, now);
    d = addListening(d, song(2, "乙"), 90, now);
    d = addListening(d, song(3, "甲"), 80, now);
    expect(topSongs(d, 2).map((s) => s.path)).toEqual(["/music/2.mp3", "/music/3.mp3"]);
    expect(topArtists(d, 5)).toEqual([
      { name: "甲", seconds: 110 },
      { name: "乙", seconds: 90 },
    ]);
  });

  it("drops what it cannot read from stored data", () => {
    expect(sanitizeListening(null)).toEqual(emptyListening);
    expect(sanitizeListening("x")).toEqual(emptyListening);
    const got = sanitizeListening({
      days: { "2026-11-18": 12, bad: 5, "2026-11-17": "9", "2026-11-16": -1 },
      songs: { a: { title: "A", artist: 5, seconds: 3 }, b: { title: "B", seconds: 0 }, c: null, d: { seconds: 4 } },
      artists: { 甲: 7, 乙: null },
      since: "yesterday",
    });
    expect(got).toEqual({ days: { "2026-11-18": 12 }, songs: { a: { title: "A", artist: null, seconds: 3, last: 0 } }, artists: { 甲: 7 }, since: null });
  });
});
