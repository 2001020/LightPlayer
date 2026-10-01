import { create } from "zustand";
import { api, ensureServerBase, isTauri, on, type LibraryData, type LibraryProgress } from "../lib/ipc";
import { toast } from "./player";
import { useSettings } from "./settings";

export type LibraryNav =
  | { view: "songs" | "albums" | "artists" | "videos" | "favorites" | "recent" }
  | { view: "album"; key: string; from: "albums" | "artists" }
  | { view: "artist"; name: string }
  | { view: "playlist"; id: string };

interface LibraryState {
  data: LibraryData;
  loaded: boolean;
  progress: LibraryProgress | null;
  nav: LibraryNav;
  query: string;
}

const empty: LibraryData = { folders: [], tracks: [], favorites: [], playlists: [], excluded: [] };

export const useLibrary = create<LibraryState>(() => ({
  data: empty,
  loaded: false,
  progress: null,
  nav: { view: "songs" },
  query: "",
}));

export async function refreshLibrary() {
  try {
    const data = await api.libraryGet();
    useLibrary.setState({ data: data ?? empty, loaded: true });
  } catch (e) {
    console.warn("library", e);
  }
}

/** Runs a library mutation, reports failures and refreshes the snapshot. */
export async function libraryAction<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const r = await fn();
    await refreshLibrary();
    return r;
  } catch (e) {
    toast(String(e), "error");
    return undefined;
  }
}

let started = false;

export async function initLibrary() {
  if (started) return;
  started = true;
  await ensureServerBase().catch(() => {});
  await refreshLibrary();
  if (!isTauri) return;
  let timer = 0;
  await on("library://changed", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void refreshLibrary(), 120);
  });
  await on<LibraryProgress>("library://progress", (p) => useLibrary.setState({ progress: p.scanning ? p : null }));
  if (useSettings.getState().libraryAutoRescan && useLibrary.getState().data.folders.length) void api.libraryRescan();
}
