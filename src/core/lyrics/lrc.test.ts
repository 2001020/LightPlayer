import { describe, expect, it } from "vitest";
import {
  findActiveCue,
  findLineIndex,
  formatTimestamp,
  parseCues,
  parseLrc,
  parseLyrics,
  parseTimestamp,
  serializeLrc,
} from "./lrc";

describe("parseLrc", () => {
  it("parses metadata, multi-stamp lines, translations and offset", () => {
    const l = parseLrc(
      [
        "[ti:晴天]",
        "[ar:周杰伦]",
        "[offset:500]",
        "[00:10.50][01:10.50]故事的小黄花",
        "[00:10.50]The little yellow flower",
        "[00:05.00]前奏",
      ].join("\r\n"),
    );
    expect(l.synced).toBe(true);
    expect(l.meta.title).toBe("晴天");
    expect(l.meta.artist).toBe("周杰伦");
    expect(l.lines.map((x) => [x.time, x.text])).toEqual([
      [4.5, "前奏"],
      [10, "故事的小黄花"],
      [70, "故事的小黄花"],
    ]);
    expect(l.lines[1].translation).toBe("The little yellow flower");
  });

  it("parses enhanced word timestamps", () => {
    const l = parseLrc("[00:01.00]<00:01.00>Hel<00:01.50>lo<00:02.00> world<00:03.00>");
    const line = l.lines[0];
    expect(line.text).toBe("Hello world");
    expect(line.words?.map((w) => w.time)).toEqual([1, 1.5, 2]);
    expect(line.end).toBe(3);
  });

  it("treats text without timestamps as unsynced", () => {
    const l = parseLrc("line one\nline two\n");
    expect(l.synced).toBe(false);
    expect(l.lines).toHaveLength(2);
    expect(l.lines[0].time).toBeNull();
  });

  it("handles 3-digit milliseconds and colon fractions", () => {
    const l = parseLrc("[00:01.123]a\n[00:02:50]b");
    expect(l.lines[0].time).toBeCloseTo(1.123);
    expect(l.lines[1].time).toBeCloseTo(2.5);
  });
});

describe("cues", () => {
  it("parses srt", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,500\n<i>Hello</i>\nWorld\n\n2\n00:01:00,000 --> 00:01:01,000\nBye\n";
    const l = parseCues(srt);
    expect(l.lines).toHaveLength(2);
    expect(l.lines[0]).toMatchObject({ time: 1, end: 2.5, text: "Hello", translation: "World" });
    expect(l.lines[1].time).toBe(60);
    expect(findActiveCue(l.lines, 2)?.text).toBe("Hello");
    expect(findActiveCue(l.lines, 30)).toBeNull();
  });

  it("detects vtt automatically", () => {
    const vtt = "WEBVTT\n\n00:05.000 --> 00:06.000\nHi";
    expect(parseLyrics(vtt, "txt").lines[0]).toMatchObject({ time: 5, text: "Hi" });
  });
});

describe("timestamps", () => {
  it("formats and parses", () => {
    expect(formatTimestamp(65.432)).toBe("01:05.43");
    expect(formatTimestamp(0)).toBe("00:00.00");
    expect(parseTimestamp("01:05.43")).toBeCloseTo(65.43);
    expect(parseTimestamp("[02:00]")).toBe(120);
    expect(parseTimestamp("12.5")).toBe(12.5);
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
  });

  it("finds the active line", () => {
    const { lines } = parseLrc("[00:01.00]a\n[00:03.00]b\n[00:05.00]c");
    expect(findLineIndex(lines, 0.5)).toBe(-1);
    expect(findLineIndex(lines, 1)).toBe(0);
    expect(findLineIndex(lines, 4.9)).toBe(1);
    expect(findLineIndex(lines, 100)).toBe(2);
  });
});

describe("serializeLrc", () => {
  it("round-trips", () => {
    const src = "[ti:T]\n[ar:A]\n[00:01.00]a\n[00:01.00]trans\n[00:02.50]<00:02.50>b<00:03.00>c<00:04.00>\n";
    const parsed = parseLrc(src);
    const out = serializeLrc(parsed.lines, parsed.meta);
    expect(out).toBe(src);
    expect(parseLrc(out)).toEqual(parsed);
  });
});
