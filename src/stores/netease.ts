// Experimental NetEase Cloud Music section: account, playlists and the song
// lists shown in the library. Songs are plain library rows with a
// `netease:<id>` path, so the track table, the queue and the player work on
// them unchanged.

import { create } from "zustand";
import { api, cloudCovers, NETEASE_PREFIX, type LibraryTrack, type NeteaseAccount, type NeteasePlaylist, type NeteaseSong } from "../lib/ipc";
import { toast, useUI } from "./player";

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
  /** Ids in the account's "liked songs" (the heart); null: not loaded. */
  liked: Set<number> | null;
}

export const useNetease = create<NeteaseState>(() => ({
  account: undefined,
  playlists: [],
  lists: {},
  searchQuery: "",
  liked: null,
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
      useNetease.setState({ playlists: [], lists: {}, liked: null });
      return;
    }
    void loadNeteaseLiked();
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
  useNetease.setState({ account: null, playlists: [], lists: {}, liked: null });
  toast("已退出网易云音乐");
}

/** The NetEase song id of a `netease:<id>` path. */
export const neteaseId = (path: string) => (path.startsWith(NETEASE_PREFIX) ? Number(path.slice(NETEASE_PREFIX.length)) : null);

let likedLoading = false;

/** Loads which songs are in "liked songs", for the hearts. */
export async function loadNeteaseLiked() {
  if (likedLoading) return;
  likedLoading = true;
  try {
    useNetease.setState({ liked: new Set(await api.neteaseLikedIds()) });
  } catch {
    // Signed out or offline: the hearts stay empty.
  } finally {
    likedLoading = false;
  }
}

/** Whether the heart of `path` (a NetEase song) is on. */
export const useNeteaseLiked = (path: string) => {
  const id = neteaseId(path);
  return useNetease((s) => id !== null && !!s.liked?.has(id));
};

/**
 * The heart of a NetEase song: adds it to (or removes it from) the account's
 * "liked songs", like NetEase's own clients.
 */
export async function setNeteaseLiked(path: string, on: boolean) {
  const id = neteaseId(path);
  if (id === null) return;
  if (!useNetease.getState().account) {
    const { account } = await api.neteaseStatus().catch(() => ({ account: null }));
    useNetease.setState({ account });
    if (!account) {
      toast("登录网易云音乐后，才能把歌曲添加到“我喜欢的音乐”", "info", 5000);
      useUI.setState({ overlay: "neteaseLogin" });
      return;
    }
  }
  const flip = (want: boolean) =>
    useNetease.setState((s) => {
      const liked = new Set(s.liked ?? []);
      if (want) liked.add(id);
      else liked.delete(id);
      return { liked };
    });
  flip(on);
  try {
    await api.neteaseLike(id, on);
  } catch (e) {
    flip(!on);
    toast(errText(e), "error", 6000);
    return;
  }
  toast(on ? "已添加到“我喜欢的音乐”" : "已从“我喜欢的音乐”中移除", "success");
  // Keep the liked playlist's count and an opened copy of it current.
  const list = useNetease.getState().playlists.find((p) => p.liked);
  if (!list) return;
  useNetease.setState((s) => ({
    playlists: s.playlists.map((p) => (p === list ? { ...p, count: Math.max(0, p.count + (on ? 1 : -1)) } : p)),
  }));
  if (useNetease.getState().lists[`pl:${list.id}`]) loadNeteaseList(`pl:${list.id}`, true);
}
