// Experimental NetEase Cloud Music section: account, playlists and the song
// lists shown in the library. Songs are plain library rows with a
// `netease:<id>` path, so the track table, the queue and the player work on
// them unchanged.

import { create } from "zustand";
import { api, cloudCovers, NETEASE_PREFIX, type LibraryTrack, type NeteaseAccount, type NeteasePlaylist, type NeteaseSong } from "../lib/ipc";
import { toast } from "./player";

export interface NeteaseList {
  loading: boolean;
  tracks: LibraryTrack[];
  error?: string;
}

interface NeteaseState {
  /** null: not checked yet. */
  account: NeteaseAccount | null | undefined;
  playlists: NeteasePlaylist[];
  /** Song lists by key: "daily", "search", "pl:<id>". */
  lists: Record<string, NeteaseList>;
  searchQuery: string;
}

export const useNetease = create<NeteaseState>(() => ({
  account: undefined,
  playlists: [],
  lists: {},
  searchQuery: "",
}));

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function songToTrack(s: NeteaseSong): LibraryTrack {
  const path = `${NETEASE_PREFIX}${s.id}`;
  if (s.cover) cloudCovers.set(path, s.cover);
  return {
    path,
    kind: "audio",
    size: 0,
    mtime: 0,
    title: s.name,
    artist: s.artists.join(" / ") || null,
    album: s.album || null,
    duration: s.duration || null,
    source: "added",
    addedAt: 0,
    playCount: 0,
    badge: s.unavailable ? "无版权" : s.vip ? "VIP" : undefined,
    unavailable: s.unavailable,
  };
}

/** Checks the sign-in and loads the playlists. */
export async function refreshNetease() {
  try {
    const { account } = await api.neteaseStatus();
    useNetease.setState({ account });
    if (!account) {
      useNetease.setState({ playlists: [], lists: {} });
      return;
    }
    const playlists = await api.neteasePlaylists();
    // Liked songs first, then own playlists, then saved ones.
    playlists.sort((a, b) => Number(b.liked) - Number(a.liked) || Number(b.mine) - Number(a.mine));
    useNetease.setState({ playlists });
  } catch (e) {
    useNetease.setState({ account: useNetease.getState().account ?? null });
    toast(errText(e), "error", 6000);
  }
}

async function loadInto(key: string, fetch: () => Promise<NeteaseSong[]>) {
  const prev = useNetease.getState().lists[key];
  useNetease.setState((s) => ({ lists: { ...s.lists, [key]: { loading: true, tracks: prev?.tracks ?? [] } } }));
  try {
    const tracks = (await fetch()).map(songToTrack);
    useNetease.setState((s) => ({ lists: { ...s.lists, [key]: { loading: false, tracks } } }));
  } catch (e) {
    useNetease.setState((s) => ({ lists: { ...s.lists, [key]: { loading: false, tracks: prev?.tracks ?? [], error: errText(e) } } }));
  }
}

/** Loads a list once (or again with `force`). */
export function loadNeteaseList(key: string, force = false) {
  const have = useNetease.getState().lists[key];
  if (have && !force && (have.loading || !have.error)) return;
  if (key === "daily") void loadInto(key, api.neteaseDaily);
  else if (key.startsWith("pl:")) {
    const id = Number(key.slice(3));
    void loadInto(key, () => api.neteasePlaylist(id));
  }
}

export function searchNetease(query: string) {
  const q = query.trim();
  useNetease.setState({ searchQuery: q });
  if (q) void loadInto("search", () => api.neteaseSearch(q));
}

export async function neteaseLogout() {
  await api.neteaseLogout().catch(() => {});
  useNetease.setState({ account: null, playlists: [], lists: {} });
  toast("已退出网易云音乐");
}
