import { describe, expect, it } from "vitest";
import { basename, formatBitrate, formatBytes, formatCommentTime, formatCount, formatTime, stem } from "./format";

describe("format", () => {
  it("formats time", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(NaN)).toBe("0:00");
  });
  it("formats sizes and bitrates", () => {
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(1_073_741_824)).toBe("1.00 GB");
    expect(formatBitrate(5_631_820)).toBe("5.63 Mbps");
    expect(formatBitrate(192000)).toBe("192 kbps");
  });
  it("splits paths", () => {
    expect(basename("/a/b/周杰伦 - 晴天.flac")).toBe("周杰伦 - 晴天.flac");
    expect(stem("/a/b/song.v2.mp3")).toBe("song.v2");
    expect(basename("C:\\m\\x.mp4")).toBe("x.mp4");
  });
});

describe("comment formatting", () => {
  it("shortens counts like NetEase", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(9999)).toBe("9999");
    expect(formatCount(10000)).toBe("1万");
    expect(formatCount(12345)).toBe("1.2万");
    expect(formatCount(1234567)).toBe("123万");
    expect(formatCount(340000000)).toBe("3.4亿");
  });
  it("formats comment times relative to now", () => {
    const now = new Date(2026, 9, 4, 15, 0);
    expect(formatCommentTime(new Date(2026, 9, 4, 9, 5).getTime(), now)).toBe("09:05");
    expect(formatCommentTime(new Date(2026, 9, 3, 23, 59).getTime(), now)).toBe("昨天 23:59");
    expect(formatCommentTime(new Date(2026, 2, 8, 12, 0).getTime(), now)).toBe("3月8日");
    expect(formatCommentTime(new Date(2021, 2, 8, 12, 0).getTime(), now)).toBe("2021年3月8日");
  });
});
