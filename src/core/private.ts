// Private playback: what the system (media keys, lock screen, the menu bar
// title) is told about the current media.

export interface NowPlayingInfo {
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  cover: string | null;
}

interface MediaLike {
  name: string;
  duration?: number | null;
  meta?: { title?: string | null; artist?: string | null; album?: string | null; cover?: string | null } | null;
}

/** In private mode only the app's name goes out: no title, artist, album or cover. */
export function nowPlayingInfo(m: MediaLike, privateMode: boolean): NowPlayingInfo {
  if (privateMode) return { title: "LightPlayer", artist: null, album: null, duration: m.duration ?? null, cover: null };
  return {
    title: m.meta?.title || m.name,
    artist: m.meta?.artist ?? null,
    album: m.meta?.album ?? null,
    duration: m.duration ?? null,
    cover: m.meta?.cover ?? null,
  };
}

/** The keys `next` has that `prev` lacks. */
export const addedKeys = (prev: readonly string[], next: readonly string[]) => next.filter((k) => !prev.includes(k));
