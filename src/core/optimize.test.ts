import { describe, expect, it } from "vitest";
import { finishedAnimations } from "./optimize";

const anim = (playState: string, fill?: string) => ({ playState, effect: { getTiming: () => ({ fill }) } }) as unknown as Animation;

describe("background upkeep", () => {
  it("lets go of finished animations that hold nothing on screen", () => {
    const list = [anim("finished", "backwards"), anim("finished", "none"), anim("finished"), anim("finished", "forwards"), anim("finished", "both"), anim("running", "backwards"), anim("paused")];
    expect(finishedAnimations(list)).toEqual([list[0], list[1], list[2]]);
  });
});
