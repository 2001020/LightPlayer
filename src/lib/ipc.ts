// Typed wrappers around Tauri commands, plus a small in-browser fallback so the
// UI can be developed and tested with `pnpm dev` outside of Tauri.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { stem } from "./format";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type MediaKind = "audio" | "video";
export type Strategy = "direct" | "audioTranscode" | "hlsRemux" | "hlsTranscode";

export interface Caps {
  hevc: boolean;
  av1: boolean;
  vp9: boolean;
  flac: boolean;
  opus: boolean;
  vorbis: boolean;
}

export interface AudioMeta {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  cover?: string | null;
  duration?: number | null;
}

export interface SubtitleTrack {
  label: string;
  language?: string | null;
  url: string;
  default: boolean;
}

export interface OpenedMedia {
  path: string;
  fileName: string;
  name: string;
  kind: MediaKind;
  strategy: Strategy;
  url: string;
  baseOffset: number;
  duration?: number | null;
  meta?: AudioMeta | null;
  subtitles: SubtitleTrack[];
}

export interface AssocKind {
  /** Extensions opened by LightPlayer by default. */
  ours: string[];
  others: string[];
}

export interface FileAssociations {
  /** Only the macOS build can change the default apps. */
  supported: boolean;
  audio: AssocKind;
  video: AssocKind;
}

export interface MediaEntry {
  path: string;
  fileName: string;
  name: string;
  kind: MediaKind;
  size: number;
}

export interface VideoInfo {
  fileName: string;
  fileSize: number;
  container: string;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  displayAspectRatio?: string | null;
  rotation?: number | null;
  fps?: number | null;
  totalBitrate?: number | null;
  videoBitrate?: number | null;
  audioBitrate?: number | null;
  videoCodec?: string | null;
  videoProfile?: string | null;
  pixFmt?: string | null;
  hdr?: string | null;
  audioCodec?: string | null;
  sampleRate?: number | null;
  channels?: number | null;
  channelLayout?: string | null;
  subtitleCount: number;
}

export type LyricsOrigin = "sidecar" | "embedded" | "library" | "ai" | "ai_reviewed";

export interface LyricsPayload {
  content: string;
  origin: LyricsOrigin;
  format: string;
  path?: string | null;
  model?: string | null;
}

export interface SavedLyrics {
  location: "same_dir" | "library";
  path: string;
  fallback: boolean;
  error?: string | null;
}

export interface ModelStatus {
  id: string;
  file: string;
  sizeMb: number;
  label: string;
  description: string;
  recommended: boolean;
  downloaded: boolean;
  partialBytes: number;
}

export interface DownloadProgress {
  id: string;
  downloaded: number;
  total: number;
  state: "downloading" | "verifying" | "done" | "error" | "cancelled";
  error?: string | null;
}

export interface AsrOptions {
  model: string;
  language: string;
  vocalFocus: boolean;
  simplified: boolean;
  useVad: boolean;
  wordTimestamps: boolean;
  title?: string | null;
  artist?: string | null;
}

export interface AsrProgressEvent {
  mediaPath: string;
  stage: "decoding" | "loading" | "transcribing" | "finishing";
  percent: number;
}

export interface AsrResult {
  lrc: string;
  lineCount: number;
  language: string;
  model: string;
}

export interface AsrDone {
  mediaPath: string;
  ok: boolean;
  cancelled: boolean;
  result?: AsrResult | null;
  error?: string | null;
}

export type TrackSource = "folder" | "played" | "added";

export interface LibraryTrack {
  path: string;
  kind: MediaKind;
  size: number;
  mtime: number;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  trackNo?: number | null;
  discNo?: number | null;
  year?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  source: TrackSource;
  addedAt: number;
  playCount: number;
  lastPlayed?: number | null;
}

export interface LibraryFolder {
  path: string;
  addedAt: number;
}

export interface UserPlaylist {
  id: string;
  name: string;
  items: string[];
  createdAt: number;
}

export interface LibraryData {
  folders: LibraryFolder[];
  tracks: LibraryTrack[];
  favorites: string[];
  playlists: UserPlaylist[];
  excluded: string[];
}

export interface LibraryProgress {
  scanning: boolean;
  done: number;
  total: number;
}

export interface WeatherPlace {
  lat: number;
  lon: number;
  source: "gps" | "ip";
  name?: string | null;
  /** Why the precise position was not used. */
  note?: string | null;
}

export interface WeatherReport {
  place: string;
  lat: number;
  lon: number;
  /** WMO weather interpretation code. */
  code: number;
  temperature: number;
  apparent: number;
  humidity: number;
  isDay: boolean;
  cloudCover: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
  high?: number | null;
  low?: number | null;
  /** Unix seconds. */
  sunrise?: number | null;
  sunset?: number | null;
  fetchedAt: number;
}

export interface CityHit {
  name: string;
  region: string;
  lat: number;
  lon: number;
}

export interface MediaControlEvent {
  action: "play" | "pause" | "toggle" | "next" | "previous" | "seekBy" | "seekTo" | "privateMode";
  value?: number | null;
}

export const AUDIO_EXTS = [
  "mp3", "flac", "wav", "m4a", "m4b", "aac", "ogg", "oga", "opus", "ape", "wma", "aiff", "aif", "aifc", "alac",
  "wv", "dsf", "dff", "tta", "mka", "caf", "ac3", "dts", "amr", "mpc", "spx", "mp2", "au",
];
export const VIDEO_EXTS = [
  "mp4", "m4v", "mov", "mkv", "avi", "webm", "flv", "f4v", "wmv", "asf", "ts", "m2ts", "mts", "mpg", "mpeg",
  "3gp", "3g2", "rmvb", "rm", "vob", "ogv", "divx", "mxf",
];

export function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1).toLowerCase() : "";
}

export function kindOf(path: string): MediaKind | null {
  const e = extOf(path);
  if (AUDIO_EXTS.includes(e)) return "audio";
  if (VIDEO_EXTS.includes(e)) return "video";
  return null;
}

// ------------------------------------------------------------------ browser mock

const browserFiles = new Map<string, File>();
const browserUrls = new Map<string, string>();

/** Opens a native file picker in browser dev mode and resolves registered paths. */
export function pickBrowserFiles(accept = "", multiple = true): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      resolve(input.files?.length ? registerBrowserFiles(input.files) : []);
      input.remove();
    });
    input.click();
  });
}

/** Registers files picked through an <input type=file> (browser dev mode only). */
export function registerBrowserFiles(files: FileList | File[]): string[] {
  const paths: string[] = [];
  for (const f of Array.from(files)) {
    const p = `browser:/${f.name}`;
    browserFiles.set(p, f);
    paths.push(p);
  }
  return paths;
}

function browserUrl(path: string): string {
  let u = browserUrls.get(path);
  if (!u) {
    const f = browserFiles.get(path);
    if (!f) throw new Error("文件不存在");
    u = URL.createObjectURL(f);
    browserUrls.set(path, u);
  }
  return u;
}

const mockLib: LibraryData = { folders: [], tracks: [], favorites: [], playlists: [], excluded: [] };

function mockTrack(path: string, source: TrackSource): LibraryTrack | null {
  const kind = kindOf(path);
  if (!kind) return null;
  const name = stem(path);
  const [artist, title] = name.includes(" - ") ? name.split(" - ", 2) : [null, name];
  return {
    path,
    kind,
    size: browserFiles.get(path)?.size ?? 0,
    mtime: 0,
    title: kind === "audio" ? title : null,
    artist: kind === "audio" ? artist : null,
    album: null,
    duration: null,
    source,
    addedAt: Math.floor(Date.now() / 1000),
    playCount: 0,
    lastPlayed: null,
  };
}

function mockLibrary(cmd: string, args: Record<string, unknown>): unknown {
  const l = mockLib;
  const pl = () => l.playlists.find((p) => p.id === args.id);
  switch (cmd) {
    case "library_get":
      return structuredClone(l);
    case "library_add_paths": {
      let files = 0;
      for (const p of args.paths as string[]) {
        if (l.tracks.some((t) => t.path === p)) continue;
        const t = mockTrack(p, "added");
        if (t) {
          l.tracks.push(t);
          files++;
        }
      }
      return { folders: 0, files };
    }
    case "library_record_play": {
      let t = l.tracks.find((x) => x.path === args.path);
      if (!t && args.add) {
        t = mockTrack(args.path as string, "played") ?? undefined;
        if (t) l.tracks.push(t);
      }
      if (t) {
        t.playCount++;
        t.lastPlayed = Math.floor(Date.now() / 1000);
      }
      return null;
    }
    case "library_trash_tracks": {
      const paths = args.paths as string[];
      const set = new Set(paths);
      l.tracks = l.tracks.filter((t) => !set.has(t.path));
      l.favorites = l.favorites.filter((p) => !set.has(p));
      for (const p of l.playlists) p.items = p.items.filter((i) => !set.has(i));
      return { trashed: paths, failed: [], error: null };
    }
    case "library_remove_tracks": {
      const set = new Set(args.paths as string[]);
      l.tracks = l.tracks.filter((t) => !set.has(t.path));
      l.favorites = l.favorites.filter((p) => !set.has(p));
      return null;
    }
    case "library_set_favorite":
      l.favorites = l.favorites.filter((p) => p !== args.path);
      if (args.on) l.favorites.unshift(args.path as string);
      return null;
    case "playlist_create": {
      const id = `pl${Math.random().toString(16).slice(2)}`;
      l.playlists.push({ id, name: (args.name as string).trim() || "新建歌单", items: [...new Set(args.items as string[])], createdAt: Date.now() / 1000 });
      return id;
    }
    case "playlist_rename":
      if (pl()) pl()!.name = args.name as string;
      return null;
    case "playlist_delete":
      l.playlists = l.playlists.filter((p) => p.id !== args.id);
      return null;
    case "playlist_set_items":
      if (pl()) pl()!.items = [...new Set(args.items as string[])];
      return null;
    default:
      return null;
  }
}

let mockAsrCancel = false;

/** Simulated recognition: a few seconds of progress, then a tiny LRC. */
function mockRecognition(mediaPath: string) {
  mockAsrCancel = false;
  let pct = 0;
  const timer = window.setInterval(() => {
    if (mockAsrCancel) {
      clearInterval(timer);
      mockEmit("asr://done", { mediaPath, ok: false, cancelled: true });
      return;
    }
    pct += 12.5;
    mockEmit("asr://progress", { mediaPath, stage: pct < 15 ? "decoding" : "transcribing", percent: Math.min(pct, 100) });
    if (pct >= 100) {
      clearInterval(timer);
      const lrc = "[00:00.50]这是浏览器预览中模拟的识别结果\n[00:03.00]第二行歌词\n";
      mockEmit("asr://done", { mediaPath, ok: true, cancelled: false, result: { lrc, lineCount: 2, language: "zh", model: "mock" } });
    }
  }, 400);
}

let mockAssoc = false;

async function mock<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const path = (args.path ?? args.mediaPath) as string | undefined;
  if (cmd.startsWith("library_") || cmd.startsWith("playlist_")) return mockLibrary(cmd, args) as T;
  switch (cmd) {
    case "open_media": {
      const kind = kindOf(path!) ?? "audio";
      const name = stem(path!);
      const [artist, title] = name.includes(" - ") ? name.split(" - ", 2) : [null, name];
      return {
        path,
        fileName: path!.slice(9),
        name,
        kind,
        strategy: "direct",
        url: browserUrl(path!),
        baseOffset: 0,
        duration: null,
        meta: kind === "audio" ? { title, artist } : null,
        subtitles: [],
      } as T;
    }
    case "scan_playlist": {
      const kind = kindOf(path!);
      return [...browserFiles.keys()]
        .filter((p) => kindOf(p) === kind)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((p) => ({ path: p, fileName: p.slice(9), name: stem(p), kind, size: browserFiles.get(p)!.size })) as T;
    }
    case "find_lyrics": {
      const s = stem(path!).toLowerCase();
      for (const [p, f] of browserFiles) {
        const e = extOf(p);
        if (["lrc", "srt", "vtt", "txt"].includes(e) && stem(p).toLowerCase() === s) {
          return { content: await f.text(), origin: "sidecar", format: e, path: p } as T;
        }
      }
      return null as T;
    }
    case "read_text_file":
      return (await browserFiles.get(path!)?.text()) as T;
    case "save_lyrics":
      return { location: "library", path: "browser", fallback: false } as T;
    case "asr_models":
      // Pretend the default models are present so the task UI can be tried.
      return ["large-v3-turbo-q5_0", "silero-vad"].map((id) => ({
        id,
        file: `${id}.bin`,
        sizeMb: 0,
        label: id,
        description: "",
        recommended: false,
        downloaded: true,
        partialBytes: 0,
      })) as T;
    case "asr_start":
      mockRecognition(path!);
      return undefined as T;
    case "asr_cancel":
      mockAsrCancel = true;
      return undefined as T;
    case "take_pending_open":
      return [] as T;
    case "file_associations": {
      // Browser preview: pretend to be the Mac app, half set up.
      const all = { audio: ["mp3", "flac", "wav", "m4a"], video: ["mp4", "mkv", "mov"] };
      return {
        supported: true,
        audio: { ours: mockAssoc ? all.audio : [], others: mockAssoc ? [] : all.audio },
        video: { ours: mockAssoc ? all.video : ["mp4"], others: mockAssoc ? [] : ["mkv", "mov"] },
      } as T;
    }
    case "set_file_associations":
      mockAssoc = true;
      return [] as T;
    case "server_base":
      return "" as T;
    case "ffmpeg_available":
      return true as T;
    case "weather_locate":
      return { lat: 31.23, lon: 121.47, source: "ip", name: "Shanghai", note: "此系统不支持定位服务" } as T;
    case "weather_fetch": {
      const now = Math.floor(Date.now() / 1000);
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      const midnight = Math.floor(day.getTime() / 1000);
      return {
        place: (args.name as string | undefined) || "上海",
        lat: args.lat,
        lon: args.lon,
        code: 2,
        temperature: 23.4,
        apparent: 24.8,
        humidity: 68,
        isDay: true,
        cloudCover: 55,
        precipitation: 0,
        windSpeed: 11,
        windDirection: 120,
        high: 26,
        low: 19,
        sunrise: midnight + 6 * 3600,
        sunset: midnight + 18 * 3600,
        fetchedAt: now,
      } as T;
    }
    case "weather_search": {
      const q = String(args.query ?? "").trim();
      const all: CityHit[] = [
        { name: "北京", region: "中国", lat: 39.91, lon: 116.4 },
        { name: "杭州市", region: "浙江省，中国", lat: 30.29, lon: 120.16 },
        { name: "哈尔滨", region: "黑龙江省，中国", lat: 45.75, lon: 126.65 },
        { name: "伦敦", region: "英格兰，英国", lat: 51.51, lon: -0.13 },
      ];
      return all.filter((c) => q && (c.name.includes(q) || c.region.includes(q))) as T;
    }
    case "get_video_info":
      return { fileName: path, fileSize: browserFiles.get(path!)?.size ?? 0, container: "—", subtitleCount: 0 } as T;
    default:
      return undefined as T;
  }
}

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return isTauri ? invoke<T>(cmd, args) : mock<T>(cmd, args);
}

export const api = {
  openMedia: (path: string, caps: Caps, precise = false) => call<OpenedMedia>("open_media", { path, caps, precise }),
  /** URL of an exact-seeking copy of an MP3/FLAC (null when the file seeks exactly). */
  exactAudio: (path: string) => call<string | null>("exact_audio", { path }),
  requestStream: (path: string, start: number, transcode: boolean) =>
    call<{ url: string; baseOffset: number }>("request_stream", { path, start, transcode }),
  stopStreams: () => call<void>("stop_streams"),
  scanPlaylist: (path: string, kind?: MediaKind) => call<MediaEntry[]>("scan_playlist", { path, kind }),
  getVideoInfo: (path: string) => call<VideoInfo>("get_video_info", { path }),
  findLyrics: (path: string) => call<LyricsPayload | null>("find_lyrics", { path }),
  readTextFile: (path: string) => call<string>("read_text_file", { path }),
  writeTextFile: (path: string, content: string) => call<void>("write_text_file", { path, content }),
  writeBase64File: (path: string, data: string) => call<void>("write_base64_file", { path, data }),
  saveLyrics: (mediaPath: string, content: string, target: "same_dir" | "library", origin?: LyricsOrigin) =>
    call<SavedLyrics>("save_lyrics", { mediaPath, content, target, origin }),
  removeLibraryLyrics: (path: string) => call<void>("remove_library_lyrics", { path }),
  asrModels: () => call<ModelStatus[]>("asr_models"),
  asrDownload: (id: string, mirror: string) => call<void>("asr_download", { id, mirror }),
  asrCancelDownload: (id: string) => call<void>("asr_cancel_download", { id }),
  asrDeleteModel: (id: string) => call<void>("asr_delete_model", { id }),
  asrStart: (path: string, options: AsrOptions) => call<void>("asr_start", { path, options }),
  asrCancel: () => call<void>("asr_cancel"),
  serverBase: () => call<string>("server_base"),
  importBackground: (path: string) => call<string>("import_background", { path }),
  takePendingOpen: () => call<string[]>("take_pending_open"),
  fileAssociations: () => call<FileAssociations>("file_associations"),
  /** Returns the extensions that could not be changed. */
  setFileAssociations: (audio: boolean, video: boolean) => call<string[]>("set_file_associations", { audio, video }),
  nowPlayingMetadata: (m: { title: string; artist?: string | null; album?: string | null; duration?: number | null; cover?: string | null }) =>
    call<void>("now_playing_metadata", m),
  nowPlayingState: (playing: boolean, position?: number) => call<void>("now_playing_state", { playing, position }),
  ffmpegAvailable: () => call<boolean>("ffmpeg_available"),
  setBackgroundPrefs: (runInBackground: boolean, showTitle: boolean, privateMode: boolean) =>
    call<void>("set_background_prefs", { runInBackground, showTitle, privateMode }),
  desktopLyricsSet: (show: boolean) => call<void>("desktop_lyrics_set", { show }),
  weatherLocate: () => call<WeatherPlace>("weather_locate"),
  weatherFetch: (lat: number, lon: number, name?: string | null) => call<WeatherReport>("weather_fetch", { lat, lon, name: name ?? null }),
  weatherSearch: (query: string) => call<CityHit[]>("weather_search", { query }),
  libraryGet: () => call<LibraryData>("library_get"),
  libraryAddFolder: (path: string) => call<boolean>("library_add_folder", { path }),
  libraryRemoveFolder: (path: string) => call<void>("library_remove_folder", { path }),
  libraryRescan: () => call<void>("library_rescan"),
  libraryAddPaths: (paths: string[]) => call<{ folders: number; files: number }>("library_add_paths", { paths }),
  libraryRemoveTracks: (paths: string[]) => call<void>("library_remove_tracks", { paths }),
  libraryTrashTracks: (paths: string[]) => call<{ trashed: string[]; failed: string[]; error?: string | null }>("library_trash_tracks", { paths }),
  libraryImportFolder: (path: string) => call<{ playlistId: string; name: string; files: number }>("library_import_folder", { path }),
  libraryRecordPlay: (path: string, add: boolean) => call<void>("library_record_play", { path, add }),
  librarySetFavorite: (path: string, on: boolean) => call<void>("library_set_favorite", { path, on }),
  playlistCreate: (name: string, items: string[]) => call<string>("playlist_create", { name, items }),
  playlistRename: (id: string, name: string) => call<void>("playlist_rename", { id, name }),
  playlistDelete: (id: string) => call<void>("playlist_delete", { id }),
  playlistSetItems: (id: string, items: string[]) => call<void>("playlist_set_items", { id, items }),
};

// Browser preview: events emitted by the mock backend.
const mockBus = new Map<string, Set<(payload: unknown) => void>>();
function mockEmit(event: string, payload: unknown) {
  for (const h of mockBus.get(event) ?? []) h(payload);
}

export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!isTauri) {
    const set = mockBus.get(event) ?? new Set();
    mockBus.set(event, set);
    const h = handler as (payload: unknown) => void;
    set.add(h);
    return Promise.resolve(() => void set.delete(h));
  }
  return listen<T>(event, (e) => handler(e.payload));
}

let serverBaseCache: string | null = null;

/** URL for a local file served by the backend media server (e.g. background images). */
export async function localFileUrl(path: string): Promise<string> {
  if (!isTauri) return browserFiles.has(path) ? browserUrl(path) : path;
  if (serverBaseCache === null) serverBaseCache = await api.serverBase();
  return `${serverBaseCache}/file?p=${encodeURIComponent(path)}`;
}

/** Thumbnail (album art or video frame) for a library item; null in browser mode. */
export function thumbUrl(path: string, size = 256): string | null {
  if (!isTauri || serverBaseCache === null) return null;
  return `${serverBaseCache}/thumb?p=${encodeURIComponent(path)}&s=${size}`;
}

/** Loads the media server base so `thumbUrl` can be used synchronously. */
export async function ensureServerBase(): Promise<void> {
  if (isTauri && serverBaseCache === null) serverBaseCache = await api.serverBase();
}

export function detectCaps(): Caps {
  const v = document.createElement("video");
  const a = document.createElement("audio");
  const ok = (s: string) => s === "probably" || s === "maybe";
  return {
    hevc: ok(v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')),
    av1: ok(v.canPlayType('video/mp4; codecs="av01.0.05M.08"')),
    vp9: ok(v.canPlayType('video/webm; codecs="vp9"')),
    flac: ok(a.canPlayType("audio/flac")) || ok(a.canPlayType("audio/x-flac")),
    opus: ok(a.canPlayType('audio/ogg; codecs="opus"')),
    vorbis: ok(a.canPlayType('audio/ogg; codecs="vorbis"')),
  };
}
