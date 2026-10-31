import { describe, expect, it } from "vitest";
import { HAPPY_ENDING_PATH, isHappyEnding } from "./egg";

describe("Happy ending egg", () => {
  it("wakes only for its song", () => {
    expect(isHappyEnding(HAPPY_ENDING_PATH)).toBe(true);
    expect(isHappyEnding("netease:3448017289")).toBe(false);
    expect(isHappyEnding("/Music/What do you want more than a Happy ending.flac")).toBe(false);
    expect(isHappyEnding(null)).toBe(false);
  });
});
