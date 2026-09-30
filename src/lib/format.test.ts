import { describe, expect, it } from "vitest";
import { basename, formatBitrate, formatBytes, formatTime, stem } from "./format";

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
