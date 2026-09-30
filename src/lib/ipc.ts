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

export interface MediaControlEvent {
  action: "play" | "pause" | "toggle" | "next" | "previous" | "seekBy" | "seekTo";
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

async function mock<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const path = (args.path ?? args.mediaPath) as string | undefined;
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
      return [] as T;
    case "take_pending_open":
      return [] as T;
    case "server_base":
      return "" as T;
    case "ffmpeg_available":
      return true as T;
    case "get_video_info":
      return { fileName: path, fileSize: browserFiles.get(path!)?.size ?? 0, container: "—", subtitleCount: 0 } as T;
    case "waveform_envelope":
      return [] as T;
    default:
      return undefined as T;
  }
}

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return isTauri ? invoke<T>(cmd, args) : mock<T>(cmd, args);
}

export const api = {
  openMedia: (path: string, caps: Caps) => call<OpenedMedia>("open_media", { path, caps }),
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
  asrModels: () => call<ModelStatus[]>("asr_models"),
  asrDownload: (id: string, mirror: string) => call<void>("asr_download", { id, mirror }),
  asrCancelDownload: (id: string) => call<void>("asr_cancel_download", { id }),
  asrDeleteModel: (id: string) => call<void>("asr_delete_model", { id }),
  asrStart: (path: string, options: AsrOptions) => call<void>("asr_start", { path, options }),
  asrCancel: () => call<void>("asr_cancel"),
  waveformEnvelope: (path: string) => call<number[]>("waveform_envelope", { path }),
  serverBase: () => call<string>("server_base"),
  importBackground: (path: string) => call<string>("import_background", { path }),
  takePendingOpen: () => call<string[]>("take_pending_open"),
  nowPlayingMetadata: (m: { title: string; artist?: string | null; album?: string | null; duration?: number | null; cover?: string | null }) =>
    call<void>("now_playing_metadata", m),
  nowPlayingState: (playing: boolean, position?: number) => call<void>("now_playing_state", { playing, position }),
  ffmpegAvailable: () => call<boolean>("ffmpeg_available"),
};

export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!isTauri) return Promise.resolve(() => {});
  return listen<T>(event, (e) => handler(e.payload));
}

let serverBaseCache: string | null = null;

/** URL for a local file served by the backend media server (e.g. background images). */
export async function localFileUrl(path: string): Promise<string> {
  if (!isTauri) return browserFiles.has(path) ? browserUrl(path) : path;
  if (serverBaseCache === null) serverBaseCache = await api.serverBase();
  return `${serverBaseCache}/file?p=${encodeURIComponent(path)}`;
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
