import { create } from "zustand";
import type { Lyrics } from "../core/lyrics/lrc";
import type { PlayMode } from "../core/playlist/queue";
import type { LyricsOrigin, MediaEntry, ModelStatus, OpenedMedia, DownloadProgress } from "../lib/ipc";

export interface PlayerState {
  media: OpenedMedia | null;
  loading: boolean;
  playing: boolean;
  waiting: boolean;
  position: number;
  duration: number;
  buffered: [number, number][];
  error: string | null;
  abLoop: { a: number | null; b: number | null };
  sleep: { until: number | null; endOfTrack: boolean };
  /** The NetEase quality being prepared while the current stream keeps playing. */
  qualitySwitch: string | null;
}

export const usePlayer = create<PlayerState>(() => ({
  media: null,
  loading: false,
  playing: false,
  waiting: false,
  position: 0,
  duration: 0,
  buffered: [],
  error: null,
  abLoop: { a: null, b: null },
  sleep: { until: null, endOfTrack: false },
  qualitySwitch: null,
}));

export interface PlaylistState {
  items: MediaEntry[];
  index: number;
  order: number[];
  history: number[];
  mode: PlayMode;
  /** Where the queue came from, e.g. "专辑《叶惠美》"; null = the file's folder. */
  source: string | null;
}

export const usePlaylist = create<PlaylistState>(() => ({
  items: [],
  index: -1,
  order: [],
  history: [],
  mode: "loop",
  source: null,
}));

export type LyricsStatus = "idle" | "loading" | "none" | "loaded" | "error";

export interface LyricsState {
  forPath: string | null;
  status: LyricsStatus;
  lyrics: Lyrics | null;
  raw: string | null;
  origin: LyricsOrigin | null;
  format: string | null;
  model: string | null;
  sourcePath: string | null;
}

export const useLyrics = create<LyricsState>(() => ({
  forPath: null,
  status: "idle",
  lyrics: null,
  raw: null,
  origin: null,
  format: null,
  model: null,
  sourcePath: null,
}));

export interface SubtitleState {
  tracks: { label: string; url: string; kind: "file" | "ai" }[];
  active: number;
  cues: Lyrics | null;
}

export const useSubtitles = create<SubtitleState>(() => ({ tracks: [], active: -1, cues: null }));

export interface ModelsState {
  models: ModelStatus[];
  downloads: Record<string, DownloadProgress>;
}

export const useModels = create<ModelsState>(() => ({ models: [], downloads: {} }));

export type Page = "player" | "lyrics" | "library";
export type Overlay = null | "settings" | "editor" | "videoInfo" | "asrSetup" | "asrTasks" | "shortcuts" | "libraryFolders" | "neteaseLogin";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error" | "success";
}

export interface UIState {
  page: Page;
  overlay: Overlay;
  settingsTab: "appearance" | "playback" | "lyrics" | "asr" | "netease" | "plugins" | "shortcuts" | "about";
  /** The floating play queue (narrow windows). */
  playlistFloat: boolean;
  /** The NetEase comments panel. */
  commentsOpen: boolean;
  fullscreen: boolean;
  toasts: Toast[];
  dragOver: boolean;
  dynamicAccent: string | null;
  backgroundUrl: string | null;
}

export const useUI = create<UIState>(() => ({
  page: "library",
  overlay: null,
  settingsTab: "appearance",
  playlistFloat: false,
  commentsOpen: false,
  fullscreen: false,
  toasts: [],
  dragOver: false,
  dynamicAccent: null,
  backgroundUrl: null,
}));

let toastId = 0;
export function toast(text: string, kind: Toast["kind"] = "info", ms = 3600) {
  const id = ++toastId;
  useUI.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-4) }));
  window.setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
