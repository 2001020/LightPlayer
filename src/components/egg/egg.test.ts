import { describe, expect, it } from "vitest";
import { HAPPY_ENDING_PATH, isHappyEnding } from "./egg";

describe("Happy ending egg", () => {
  it("wakes only for its song, in every theme but the archive", () => {
    for (const theme of ["system", "light", "dark", "weather"]) expect(isHappyEnding(HAPPY_ENDING_PATH, theme)).toBe(true);
    expect(isHappyEnding(HAPPY_ENDING_PATH, "archive")).toBe(false);
    expect(isHappyEnding("netease:3448017289", "light")).toBe(false);
    expect(isHappyEnding("/Music/What do you want more than a Happy ending.flac", "light")).toBe(false);
    expect(isHappyEnding(null, "light")).toBe(false);
  });
});
