import { describe, expect, it } from "vitest";
import { addedKeys, nowPlayingInfo } from "./private";

const media = { name: "a.mp3", duration: 200, meta: { title: "夜航星", artist: "不才", album: "专辑", cover: "data:image/png;base64,AA" } };

describe("nowPlayingInfo", () => {
  it("reports the song normally", () => {
    expect(nowPlayingInfo(media, false)).toEqual({ title: "夜航星", artist: "不才", album: "专辑", duration: 200, cover: "data:image/png;base64,AA" });
    expect(nowPlayingInfo({ name: "b.flac" }, false).title).toBe("b.flac");
  });
  it("gives away nothing about the song in private mode", () => {
    expect(nowPlayingInfo(media, true)).toEqual({ title: "LightPlayer", artist: null, album: null, duration: 200, cover: null });
  });
});

describe("addedKeys", () => {
  it("lists only the new ones", () => {
    expect(addedKeys(["a", "b"], ["c", "a", "b", "d"])).toEqual(["c", "d"]);
    expect(addedKeys(["a"], ["a"])).toEqual([]);
  });
});
