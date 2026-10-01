// Pure helpers that turn the library document into the views the UI shows:
// albums, artists, sorted / filtered track lists and queue entries.

import { basename, stem } from "../../lib/format";
import type { LibraryData, LibraryTrack, MediaEntry } from "../../lib/ipc";

export const UNKNOWN_ALBUM = "未知专辑";
export const UNKNOWN_ARTIST = "未知艺术家";

export interface Album {
  key: string;
  title: string;
  artist: string;
  year: number | null;
  tracks: LibraryTrack[];
  duration: number;
}

export interface Artist {
  name: string;
  tracks: LibraryTrack[];
  albums: Album[];
}

export type SortKey = "title" | "artist" | "album" | "duration" | "added" | "plays";

const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
export const compareText = (a: string, b: string) => collator.compare(a, b);

export const trackTitle = (t: LibraryTrack) => t.title?.trim() || stem(t.path);
export const trackArtist = (t: LibraryTrack) => t.artist?.trim() || "";
export const albumArtistOf = (t: LibraryTrack) => t.albumArtist?.trim() || t.artist?.trim() || UNKNOWN_ARTIST;

export function toEntry(t: LibraryTrack): MediaEntry {
  return { path: t.path, fileName: basename(t.path), name: stem(t.path), kind: t.kind, size: t.size };
}

/** Disc, then track number, then title. */
export function albumOrder(a: LibraryTrack, b: LibraryTrack): number {
  return (
    (a.discNo ?? 1) - (b.discNo ?? 1) ||
    (a.trackNo ?? 1e6) - (b.trackNo ?? 1e6) ||
    compareText(trackTitle(a), trackTitle(b))
  );
}

export function sortTracks(list: LibraryTrack[], key: SortKey, desc = false): LibraryTrack[] {
  const cmp: Record<SortKey, (a: LibraryTrack, b: LibraryTrack) => number> = {
    title: (a, b) => compareText(trackTitle(a), trackTitle(b)),
    artist: (a, b) => compareText(trackArtist(a) || "￿", trackArtist(b) || "￿") || albumOrder(a, b),
    album: (a, b) => compareText(a.album || "￿", b.album || "￿") || albumOrder(a, b),
    duration: (a, b) => (a.duration ?? 0) - (b.duration ?? 0),
    added: (a, b) => a.addedAt - b.addedAt,
    plays: (a, b) => a.playCount - b.playCount || (a.lastPlayed ?? 0) - (b.lastPlayed ?? 0),
  };
  const out = [...list].sort(cmp[key]);
  return desc ? out.reverse() : out;
}

export function filterTracks(list: LibraryTrack[], query: string): LibraryTrack[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const words = q.split(/\s+/);
  return list.filter((t) => {
    const hay = `${trackTitle(t)} ${t.artist ?? ""} ${t.album ?? ""} ${basename(t.path)}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function groupAlbums(tracks: LibraryTrack[]): Album[] {
  const map = new Map<string, Album>();
  for (const t of tracks) {
    if (t.kind !== "audio") continue;
    const title = t.album?.trim() || UNKNOWN_ALBUM;
    const artist = title === UNKNOWN_ALBUM ? "" : albumArtistOf(t);
    const key = `${artist}\u0000${title}`;
    let a = map.get(key);
    if (!a) {
      a = { key, title, artist, year: null, tracks: [], duration: 0 };
      map.set(key, a);
    }
    a.tracks.push(t);
    a.duration += t.duration ?? 0;
    if (t.year && (!a.year || t.year < a.year)) a.year = t.year;
  }
  const albums = [...map.values()];
  for (const a of albums) a.tracks.sort(albumOrder);
  // Real albums first (by title), the "unknown album" bucket last.
  return albums.sort((x, y) => Number(x.title === UNKNOWN_ALBUM) - Number(y.title === UNKNOWN_ALBUM) || compareText(x.title, y.title));
}

export function groupArtists(tracks: LibraryTrack[]): Artist[] {
  const map = new Map<string, LibraryTrack[]>();
  for (const t of tracks) {
    if (t.kind !== "audio") continue;
    const name = trackArtist(t) || UNKNOWN_ARTIST;
    (map.get(name) ?? map.set(name, []).get(name)!).push(t);
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, tracks: sortTracks(list, "album"), albums: groupAlbums(list) }))
    .sort((x, y) => Number(x.name === UNKNOWN_ARTIST) - Number(y.name === UNKNOWN_ARTIST) || compareText(x.name, y.name));
}

export interface Derived {
  byPath: Map<string, LibraryTrack>;
  songs: LibraryTrack[];
  videos: LibraryTrack[];
  albums: Album[];
  artists: Artist[];
  favorites: LibraryTrack[];
  favoriteSet: Set<string>;
  recent: LibraryTrack[];
}

const cache = new WeakMap<LibraryData, Derived>();

/** Memoised views of one library snapshot. */
export function derive(data: LibraryData): Derived {
  const hit = cache.get(data);
  if (hit) return hit;
  const byPath = new Map(data.tracks.map((t) => [t.path, t]));
  const songs = sortTracks(
    data.tracks.filter((t) => t.kind === "audio"),
    "title",
  );
  const videos = [...data.tracks.filter((t) => t.kind === "video")].sort((a, b) => compareText(basename(a.path), basename(b.path)));
  const d: Derived = {
    byPath,
    songs,
    videos,
    albums: groupAlbums(songs),
    artists: groupArtists(songs),
    favorites: data.favorites.map((p) => byPath.get(p)).filter((t): t is LibraryTrack => !!t),
    favoriteSet: new Set(data.favorites),
    recent: data.tracks
      .filter((t) => t.lastPlayed)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
      .slice(0, 200),
  };
  cache.set(data, d);
  return d;
}

/** Tracks of a playlist in order, skipping files no longer in the library. */
export function playlistTracks(data: LibraryData, id: string): LibraryTrack[] {
  const d = derive(data);
  const pl = data.playlists.find((p) => p.id === id);
  return pl ? pl.items.map((p) => d.byPath.get(p)).filter((t): t is LibraryTrack => !!t) : [];
}

/** True when `path` is `root` or inside it. */
export function isUnder(path: string, root: string): boolean {
  const r = root.replace(/[\\/]+$/, "");
  return path === r || (path.startsWith(r) && (path[r.length] === "/" || path[r.length] === "\\"));
}
