// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import * as C from "./controller";
import { engine } from "./player/engine";
import { useSettings } from "../stores/settings";

describe("user actions", () => {
  it("reports the user's playback changes but not ones made for LAN sync", () => {
    const seen: string[] = [];
    const off = C.onUserAction((a) => seen.push(a));
    C.seek(10);
    C.setRate(1.5);
    C.play();
    C.pause();
    C.syncSeek(20);
    C.syncRate(1.25);
    off();
    C.seek(5);
    expect(seen).toEqual(["seek", "rate", "play", "pause"]);
    expect(engine.rate).toBe(1.25);
    expect(useSettings.getState().rate).toBe(1.25);
  });

  it("nudges the speed without changing the nominal rate", () => {
    engine.setRate(1);
    engine.nudge(1.03);
    expect(engine.rate).toBe(1);
    expect(engine.audio.playbackRate).toBeCloseTo(1.03);
    engine.setRate(2);
    expect(engine.audio.playbackRate).toBe(2);
  });
});
