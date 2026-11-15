import { describe, expect, it, vi } from "vitest";
import { bindMediaSession, remoteFilter, setSessionState } from "./remote";

describe("remote commands", () => {
  it("acts once on a command that arrives through both channels", () => {
    const ok = remoteFilter(400);
    expect(ok("next", "session", 1000)).toBe(true);
    expect(ok("next", "system", 1100)).toBe(false);
    // The same key pressed again, by either channel.
    expect(ok("next", "session", 1200)).toBe(true);
    expect(ok("next", "session", 1250)).toBe(true);
    expect(ok("next", "system", 2000)).toBe(true);
    // Another command is not a repeat.
    expect(ok("previous", "session", 2050)).toBe(true);
    expect(ok("next", "system", 2060)).toBe(true);
  });

  it("takes play, pause and toggle for the same key", () => {
    const ok = remoteFilter(400);
    expect(ok("pause", "session", 0)).toBe(true);
    expect(ok("toggle", "system", 50)).toBe(false);
    expect(ok("toggle", "system", 1000)).toBe(true);
    expect(ok("play", "session", 1100)).toBe(false);
    expect(ok("seekBy", "session", 1150)).toBe(true);
  });

  it("answers the web view's media session, previous and next included", () => {
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const ms = {
      metadata: null,
      playbackState: "none" as MediaSessionPlaybackState,
      setActionHandler: (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
        // Like a web view that lacks an action.
        if (a === "stop") throw new TypeError("unsupported");
        handlers.set(a, h);
      },
      setPositionState: vi.fn(),
    };
    const run = vi.fn();
    expect(bindMediaSession(run, ms)).toBe(true);
    expect(bindMediaSession(run, null)).toBe(false);
    const fire = (action: MediaSessionAction, extra: Partial<MediaSessionActionDetails> = {}) => handlers.get(action)!({ action, ...extra } as MediaSessionActionDetails);
    fire("previoustrack");
    fire("nexttrack");
    fire("play");
    fire("pause");
    fire("seekbackward");
    fire("seekforward", { seekOffset: 30 });
    fire("seekto", { seekTime: 42.5 });
    fire("seekto");
    expect(run.mock.calls).toEqual([["previous"], ["next"], ["play"], ["pause"], ["seekBy", -15], ["seekBy", 30], ["seekTo", 42.5]]);

    setSessionState(true, 500, 200, 0, ms);
    expect(ms.playbackState).toBe("playing");
    expect(ms.setPositionState).toHaveBeenLastCalledWith({ duration: 200, playbackRate: 1, position: 200 });
    // A stream without a known length: the state only.
    setSessionState(false, 5, 0, 1, ms);
    expect(ms.playbackState).toBe("paused");
    expect(ms.setPositionState).toHaveBeenCalledTimes(1);
  });
});
