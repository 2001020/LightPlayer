// Title, artist and duration of playlist songs for the archive view: from the
// song that is playing, the library, or the file's own tags (read on demand).

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { api, isCloudPath, type LibraryTrack, type MediaEntry, type TrackTags } from "../../lib/ipc";
import { useLibrary } from "../../stores/library";
import { usePlayer } from "../../stores/player";

export interface SongInfo {
  title: string;
  artist: string;
  /** Seconds; 0 when not known (yet). */
  duration: number;
}

/** Tags read from files, by path (null: unreadable). */
const useTags = create<Record<string, TrackTags | null>>(() => ({}));
const pending = new Set<string>();
let timer = 0;

/** Reads the tags of `paths` not read yet, in one batch shortly after. */
export function requestTags(paths: string[]) {
  const known = useTags.getState();
  for (const p of paths) if (!(p in known) && !isCloudPath(p)) pending.add(p);
  if (!pending.size || timer) return;
  timer = window.setTimeout(() => {
    timer = 0;
    const batch = [...pending].slice(0, 40);
    for (const p of batch) pending.delete(p);
    api.trackTags(batch).then(
      (tags) => useTags.setState(Object.fromEntries(batch.map((p, i) => [p, tags[i] ?? null]))),
      () => useTags.setState(Object.fromEntries(batch.map((p) => [p, null]))),
    );
    if (pending.size) requestTags([]);
  }, 60);
}

/** Library tracks by path. */
function useLibraryIndex() {
  const tracks = useLibrary((s) => s.data.tracks);
  return useMemo(() => new Map<string, LibraryTrack>(tracks.map((t) => [t.path, t])), [tracks]);
}

export function useSongInfo(entry: MediaEntry | undefined): SongInfo | null {
  const lib = useLibraryIndex();
  const tags = useTags((s) => (entry ? s[entry.path] : undefined));
  const media = usePlayer((s) => s.media);
  const playingDuration = usePlayer((s) => s.duration);
  const t = entry ? lib.get(entry.path) : undefined;
  useEffect(() => {
    if (entry && !t) requestTags([entry.path]);
  }, [entry, t]);
  if (!entry) return null;
  const current = media?.path === entry.path ? media : null;
  const title = current?.meta?.title?.trim() || t?.title?.trim() || tags?.title?.trim() || entry.name;
  const artist = current?.meta?.artist?.trim() || t?.artist?.trim() || tags?.artist?.trim() || "";
  const duration = (current && playingDuration) || t?.duration || tags?.duration || 0;
  return { title, artist, duration };
}
