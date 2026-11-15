// Remote commands (media keys, the lock screen, Control Centre, headsets).
//
// They reach the app two ways: through the system controls the backend
// registers (`media-control` events) and through the web view's own media
// session. Which one the system asks depends on who it takes for the player:
// on macOS that is often the web view, which only answers the keys the page
// has handlers for. Without them, play/pause works (the web view does that by
// itself) while previous/next (F7/F9) do nothing. So both are served, and a
// command arriving through both counts once.

import type { NowPlayingInfo } from "./private";

export type RemoteSource = "system" | "session";

export type RemoteAction = "play" | "pause" | "toggle" | "next" | "previous" | "seekBy" | "seekTo";

/** Play, pause and toggle are the same key: one cancels the repeat of another. */
const group = (action: string) => (action === "play" || action === "pause" || action === "toggle" ? "playback" : action);

/**
 * Returns a filter that is true for commands to act on: a command repeated
 * through the other channel within `windowMs` is dropped.
 */
export function remoteFilter(windowMs = 400) {
  let last: { group: string; source: RemoteSource; at: number } | null = null;
  return (action: string, source: RemoteSource, now = Date.now()): boolean => {
    const g = group(action);
    if (last && last.group === g && last.source !== source && now - last.at < windowMs) return false;
    last = { group: g, source, at: now };
    return true;
  };
}

type Session = Pick<MediaSession, "setActionHandler" | "metadata" | "playbackState"> & Partial<Pick<MediaSession, "setPositionState">>;

const session = (): Session | null => (typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null);

/** Registers the web view's media session handlers; `run` gets each command. */
export function bindMediaSession(run: (action: RemoteAction, value?: number) => void, ms: Session | null = session()): boolean {
  if (!ms) return false;
  const bind = (name: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      ms.setActionHandler(name, handler);
    } catch {
      // An action this web view does not know.
    }
  };
  bind("play", () => run("play"));
  bind("pause", () => run("pause"));
  bind("stop", () => run("pause"));
  bind("previoustrack", () => run("previous"));
  bind("nexttrack", () => run("next"));
  bind("seekbackward", (d) => run("seekBy", -(d.seekOffset || 15)));
  bind("seekforward", (d) => run("seekBy", d.seekOffset || 15));
  bind("seekto", (d) => {
    if (typeof d.seekTime === "number") run("seekTo", d.seekTime);
  });
  return true;
}

/** What plays, for the web view's media session (null: nothing open). */
export function setSessionMetadata(info: NowPlayingInfo | null, ms: Session | null = session()) {
  if (!ms || typeof MediaMetadata === "undefined") return;
  try {
    ms.metadata = info
      ? new MediaMetadata({
          title: info.title,
          artist: info.artist ?? "",
          album: info.album ?? "",
          artwork: info.cover ? [{ src: info.cover }] : [],
        })
      : null;
  } catch {
    // Artwork the web view refuses: go without.
    try {
      ms.metadata = info ? new MediaMetadata({ title: info.title, artist: info.artist ?? "", album: info.album ?? "" }) : null;
    } catch {
      /* no metadata then */
    }
  }
}

/** Playing or paused, and where, for the web view's media session. */
export function setSessionState(playing: boolean, position: number, duration: number, rate: number, ms: Session | null = session()) {
  if (!ms) return;
  try {
    ms.playbackState = playing ? "playing" : "paused";
    if (ms.setPositionState && duration > 0 && isFinite(duration)) {
      ms.setPositionState({ duration, playbackRate: rate > 0 ? rate : 1, position: Math.min(Math.max(0, position), duration) });
    }
  } catch {
    // A state the web view refuses is not worth an error.
  }
}
