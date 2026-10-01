// Application actions: wires the playback engine, stores and backend together.

import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { engine } from "./player/engine";
import { startWeather } from "./weather/service";
import { startDesktopLyrics } from "./desktopLyrics";
import { parseLyrics, serializeLrc, type Lyrics, type LyricLine } from "./lyrics/lrc";
import { moveItem, nextIndex, nextMode, prevIndex, removeItem } from "./playlist/queue";
import {
  api,
  AUDIO_EXTS,
  detectCaps,
  extOf,
  isTauri,
  kindOf,
  on,
  pickBrowserFiles,
  registerBrowserFiles,
  VIDEO_EXTS,
  type AsrDone,
  type AsrProgressEvent,
  type Caps,
  type DownloadProgress,
  type LyricsOrigin,
  type OpenedMedia,
  type MediaControlEvent,
  type MediaEntry,
  type MediaKind,
} from "../lib/ipc";
import { confirmDialog } from "../lib/confirm";
import { stem } from "../lib/format";
import { useLyrics, useModels, usePlayer, usePlaylist, useSubtitles, useUI, toast } from "../stores/player";
import { useSettings } from "../stores/settings";
import { initLibrary, libraryAction, useLibrary } from "../stores/library";
import {
  addTasks,
  finish as finishTasks,
  moveUp,
  nextQueued,
  queuePosition,
  retry as retryTasks,
  runningTask,
  updateTask,
  useAsrTasks,
  type AsrTask,
  type AsrTaskInput,
} from "../stores/asrTasks";

let caps: Caps | null = null;
const LYRIC_EXTS = ["lrc", "srt", "vtt", "txt"];

function settings() {
  return useSettings.getState();
}

function errText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

// ------------------------------------------------------------------ opening

export async function openFiles(paths: string[]) {
  const lyricFiles = paths.filter((p) => LYRIC_EXTS.includes(extOf(p)));
  const media = paths.filter((p) => kindOf(p) !== null);
  if (!media.length && lyricFiles.length && usePlayer.getState().media) {
    await importLyricsFromPath(lyricFiles[0]);
    return;
  }
  const first = media[0] ?? paths.find((p) => !LYRIC_EXTS.includes(extOf(p)));
  if (!first) return;
  await openFile(first);
}

export async function openFile(path: string) {
  // Opening a single file (Finder, the open dialog, dropping onto the player)
  // shows the player; the library page only stays for its own queues.
  if (useUI.getState().page === "library") useUI.setState({ page: "player" });
  try {
    const kind = kindOf(path) ?? undefined;
    const items = await api.scanPlaylist(path, kind);
    const index = Math.max(0, items.findIndex((i) => i.path === path));
    usePlaylist.setState({ items, index, order: [], history: [], source: null });
    await playIndex(index);
  } catch (e) {
    toast(`无法打开文件：${errText(e)}`, "error");
  }
}

/** Plays `entries[index]` with `entries` as the queue (library views). */
export async function playList(entries: MediaEntry[], index: number, source: string) {
  if (!entries[index]) return;
  const page = useUI.getState().page;
  // Videos need the player page; music keeps the library open.
  if (page === "lyrics" || (page === "library" && entries[index].kind === "video")) useUI.setState({ page: "player" });
  // Picking what is already playing just adopts the new queue and keeps going.
  if (engine.media && usePlayer.getState().media?.path === entries[index].path) {
    usePlaylist.setState({ items: entries, index, order: [], history: [], source });
    if (engine.paused) void engine.play();
    return;
  }
  usePlaylist.setState({ items: entries, index: -1, order: [], history: [], source });
  await playIndex(index);
}

/** Inserts entries right after the current item ("play next"). */
export function playNext(entries: MediaEntry[]) {
  insertIntoQueue(entries, true);
}

// ------------------------------------------------------------------ precise timing

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Some downloaded files (VBR MP3 without a seek table, odd FLAC) make WebKit
 * run a clock that drifts from the real audio, so lyrics get further and
 * further ahead. Such files report a duration that disagrees with ffprobe;
 * they are then played through an ffmpeg-decoded copy instead.
 */
async function checkTiming(media: OpenedMedia) {
  const probed = media.duration ?? 0;
  if (probed < 20 || settings().precisePaths.includes(media.path)) return;
  for (let i = 0; i < 40 && !(engine.duration > 0); i++) await sleep(100);
  if (engine.media?.path !== media.path) return;
  const actual = engine.duration;
  if (!(actual > 0) || !isFinite(actual)) return;
  if (Math.abs(actual - probed) > Math.max(1.5, probed * 0.01)) {
    console.warn(`timing mismatch for ${media.path}: webkit ${actual.toFixed(2)}s, ffprobe ${probed.toFixed(2)}s`);
    await setPreciseTiming(media.path, true, true);
  }
}

/** Plays a file through an exact-timing ffmpeg copy (or back to direct playback). */
export async function setPreciseTiming(path: string, on: boolean, auto = false) {
  const list = settings().precisePaths.filter((p) => p !== path);
  useSettings.getState().set({ precisePaths: on ? [path, ...list].slice(0, 300) : list });
  const pl = usePlaylist.getState();
  if (usePlayer.getState().media?.path !== path || pl.items[pl.index]?.path !== path) return;
  const at = engine.position;
  const wasPlaying = !engine.paused;
  if (on) toast(auto ? "这首歌的文件计时不标准，已切换为精确计时播放，歌词会对得更准" : "正在切换为精确计时播放…", "info", 5000);
  await playIndex(pl.index, wasPlaying, { at });
  if (!on) toast("已恢复普通播放");
}

/** Drag-and-drop reordering in the play queue. */
export function moveQueueItem(from: number, to: number) {
  const pl = usePlaylist.getState();
  const r = moveItem(pl.items, pl.index, from, to);
  if (r.items === pl.items) return;
  // Shuffle order and history refer to old positions; start them afresh.
  usePlaylist.setState({ items: r.items, index: r.index, order: [], history: [] });
}

/** Takes an item out of the play queue (the file itself is untouched). */
export async function removeQueueItem(at: number) {
  const pl = usePlaylist.getState();
  if (pl.items.length <= 1) {
    toast("播放列表中至少要保留一项");
    return;
  }
  const r = removeItem(pl.items, pl.index, at);
  usePlaylist.setState({ items: r.items, index: r.removedCurrent ? -1 : r.index, order: [], history: [] });
  if (r.removedCurrent) await playIndex(r.index, !engine.paused);
}

/** Appends entries to the end of the queue. */
export function enqueue(entries: MediaEntry[]) {
  insertIntoQueue(entries, false);
}

function insertIntoQueue(entries: MediaEntry[], next: boolean) {
  if (!entries.length) return;
  const pl = usePlaylist.getState();
  if (pl.index < 0 || !usePlayer.getState().media) {
    void playList(entries, 0, "播放队列");
    return;
  }
  const current = pl.items[pl.index];
  entries = entries.filter((e) => e.path !== current.path);
  if (!entries.length) {
    toast("正在播放这一项");
    return;
  }
  const adding = new Set(entries.map((e) => e.path));
  const rest = pl.items.filter((it, i) => i === pl.index || !adding.has(it.path));
  const at = rest.indexOf(current);
  const items = next ? [...rest.slice(0, at + 1), ...entries, ...rest.slice(at + 1)] : [...rest, ...entries];
  usePlaylist.setState({ items, index: items.indexOf(current), order: [], history: [], source: pl.source ?? "当前文件夹" });
  toast(next ? `将在下一首播放${entries.length > 1 ? ` ${entries.length} 个文件` : ""}` : `已加入播放队列`, "success");
}

export async function openWithDialog() {
  if (!isTauri) {
    const paths = await pickBrowserFiles();
    if (paths.length) await openFiles(paths);
    return;
  }
  const res = await openDialog({
    multiple: false,
    directory: false,
    filters: [
      { name: "媒体文件", extensions: [...AUDIO_EXTS, ...VIDEO_EXTS] },
      { name: "音频", extensions: AUDIO_EXTS },
      { name: "视频", extensions: VIDEO_EXTS },
    ],
  });
  if (typeof res === "string") await openFile(res);
}

export async function playIndex(index: number, autoplay = true, reload?: { at: number }) {
  const pl = usePlaylist.getState();
  const entry = pl.items[index];
  if (!entry) return;
  const prev = usePlayer.getState().media;
  if (prev) rememberPosition(true);
  usePlaylist.setState((s) => ({
    index,
    history: s.index >= 0 && s.index !== index ? [...s.history, s.index].slice(-200) : s.history,
  }));
  usePlayer.setState({ loading: true, error: null, abLoop: { a: null, b: null } });
  caps ??= detectCaps();
  try {
    const media = await api.openMedia(entry.path, caps, settings().precisePaths.includes(entry.path));
    // Ignore stale results if the user skipped again in the meantime.
    if (usePlaylist.getState().items[usePlaylist.getState().index]?.path !== entry.path) return;
    const st = settings();
    let startAt = reload?.at ?? 0;
    const saved = st.positions[media.path];
    const dur = media.duration ?? 0;
    if (!reload && st.resume && saved && saved > 10 && (!dur || saved < dur - 10)) {
      startAt = saved;
      toast(`已从上次位置 ${Math.floor(saved / 60)}:${String(Math.floor(saved % 60)).padStart(2, "0")} 继续播放`);
    }
    usePlayer.setState({ media, loading: false, duration: dur, position: startAt });
    if (!st.privateMode && !reload) useSettings.getState().addRecent(media.path);
    if (media.kind === "video" && useUI.getState().page === "lyrics") useUI.setState({ page: "player" });
    await engine.load(media, startAt, autoplay);
    if (!reload) {
      void loadLyrics(media.path);
      setupSubtitles();
    }
    void updateNowPlaying();
    void updateDynamicAccent();
    if (media.kind === "audio" && media.strategy === "direct") void checkTiming(media);
    if (!reload && !st.privateMode && (isTauri || media.path.startsWith("browser:"))) {
      void api.libraryRecordPlay(media.path, st.libraryRecordPlays).catch(() => {});
    }
  } catch (e) {
    usePlayer.setState({ loading: false, error: errText(e) });
    toast(`播放失败：${errText(e)}`, "error", 5000);
  }
}

// ------------------------------------------------------------------ transport

export function toggle() {
  if (!usePlayer.getState().media) {
    void openWithDialog();
    return;
  }
  engine.toggle();
}

export async function next(auto = false) {
  const pl = usePlaylist.getState();
  const r = nextIndex({ length: pl.items.length, index: pl.index, mode: pl.mode, order: pl.order, history: pl.history }, auto);
  usePlaylist.setState({ order: r.order });
  if (r.index === null) {
    engine.pause();
    void engine.seek(0);
    return;
  }
  if (r.index === pl.index) {
    await engine.seek(0);
    await engine.play();
    return;
  }
  await playIndex(r.index);
}

export async function prev() {
  if (engine.position > 3) {
    await engine.seek(0);
    return;
  }
  const pl = usePlaylist.getState();
  const r = prevIndex({ length: pl.items.length, index: pl.index, mode: pl.mode, order: pl.order, history: pl.history });
  if (r.index < 0) return;
  // Going back must not push the current track onto the history again.
  await playIndex(r.index);
  usePlaylist.setState({ history: r.history });
}

export function seek(t: number) {
  void engine.seek(t);
  usePlayer.setState({ position: t });
}

export function seekBy(d: number) {
  const t = Math.max(0, engine.position + d);
  seek(t);
}

export function setVolume(v: number) {
  v = Math.min(1, Math.max(0, v));
  engine.setVolume(v);
  if (engine.muted && v > 0) engine.setMuted(false);
  useSettings.getState().set({ volume: v, muted: engine.muted });
}

export function toggleMute() {
  engine.setMuted(!engine.muted);
  useSettings.getState().set({ muted: engine.muted });
}

export function setRate(r: number) {
  engine.setRate(r);
  useSettings.getState().set({ rate: r });
}

export function cycleMode() {
  const mode = nextMode(usePlaylist.getState().mode);
  usePlaylist.setState({ mode, order: [] });
  useSettings.getState().set({ mode });
  const labels = { sequential: "顺序播放", loop: "列表循环", single: "单曲循环", shuffle: "随机播放" };
  toast(labels[mode]);
}

export function cycleAbLoop() {
  const { a, b } = usePlayer.getState().abLoop;
  const t = engine.position;
  if (a === null) {
    usePlayer.setState({ abLoop: { a: t, b: null } });
    toast("已设置 A 点，再次点击设置 B 点");
  } else if (b === null) {
    if (t <= a + 0.5) {
      toast("B 点必须在 A 点之后", "error");
      return;
    }
    usePlayer.setState({ abLoop: { a, b: t } });
    toast("A-B 循环已开启");
  } else {
    usePlayer.setState({ abLoop: { a: null, b: null } });
    toast("A-B 循环已关闭");
  }
}

export function setSleepTimer(minutes: number | "end" | null) {
  if (minutes === null) {
    usePlayer.setState({ sleep: { until: null, endOfTrack: false } });
    toast("睡眠定时已取消");
  } else if (minutes === "end") {
    usePlayer.setState({ sleep: { until: null, endOfTrack: true } });
    toast("将在本曲结束后暂停");
  } else {
    usePlayer.setState({ sleep: { until: Date.now() + minutes * 60_000, endOfTrack: false } });
    toast(`${minutes} 分钟后自动暂停`);
  }
}

export function stepFrame(dir: 1 | -1) {
  if (engine.media?.kind !== "video") return;
  engine.pause();
  const fps = frameRate ?? 30;
  void engine.seek(engine.position + dir / fps);
}

let frameRate: number | null = null;

export async function screenshot() {
  const v = engine.video;
  if (engine.media?.kind !== "video" || !v.videoWidth) return;
  const canvas = document.createElement("canvas");
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(v, 0, 0);
  let data: string;
  try {
    data = canvas.toDataURL("image/png");
  } catch {
    toast("当前视频无法截图", "error");
    return;
  }
  const t = Math.floor(engine.position);
  const name = `${stem(engine.media.path)}_${Math.floor(t / 60)}m${t % 60}s.png`;
  if (!isTauri) {
    const a = document.createElement("a");
    a.href = data;
    a.download = name;
    a.click();
    return;
  }
  const dir = engine.media.path.replace(/[\\/][^\\/]*$/, "");
  const target = await saveDialog({ defaultPath: `${dir}/${name}`, filters: [{ name: "PNG", extensions: ["png"] }] });
  if (!target) return;
  try {
    await api.writeBase64File(target, data);
    toast("截图已保存", "success");
  } catch (e) {
    toast(`保存失败：${errText(e)}`, "error");
  }
}

// ------------------------------------------------------------------ lyrics

export function setLyrics(content: string, format: string, origin: LyricsOrigin, sourcePath: string | null, model: string | null = null) {
  const lyrics = parseLyrics(content, format);
  useLyrics.setState({
    status: lyrics.lines.length ? "loaded" : "none",
    lyrics,
    raw: content,
    origin,
    format,
    model,
    sourcePath,
  });
}

export async function loadLyrics(mediaPath: string) {
  useLyrics.setState({ forPath: mediaPath, status: "loading", lyrics: null, raw: null, origin: null, model: null });
  try {
    const p = await api.findLyrics(mediaPath);
    if (useLyrics.getState().forPath !== mediaPath) return;
    if (!p) {
      useLyrics.setState({ status: "none" });
      return;
    }
    if (engine.media?.kind === "video") {
      if (p.origin === "ai" || p.origin === "ai_reviewed") addAiSubtitles(p.content, false);
      useLyrics.setState({ status: "none" });
      return;
    }
    setLyrics(p.content, p.format, p.origin, p.path ?? null, p.model ?? null);
  } catch (e) {
    useLyrics.setState({ status: "error" });
    console.warn("lyrics", e);
  }
}

const isAiOrigin = (o: LyricsOrigin | null) => o === "ai" || o === "ai_reviewed";

/** Looks for lyrics again, e.g. after a .lrc was put next to the song. */
export async function rescanLyrics() {
  const media = usePlayer.getState().media;
  if (!media) return;
  const wasAi = isAiOrigin(useLyrics.getState().origin);
  await loadLyrics(media.path);
  const { status, origin } = useLyrics.getState();
  if (status !== "loaded") toast("歌曲所在目录中没有找到歌词文件");
  else if (wasAi && isAiOrigin(origin)) toast("目录中没有找到同名歌词文件，继续显示 AI 歌词");
  else toast(origin === "sidecar" ? "已加载歌曲目录中的歌词文件" : "已重新加载歌词", "success");
}

/** Removes AI-recognised lyrics (or AI subtitles) of the current media. */
export async function removeAiLyrics() {
  const media = usePlayer.getState().media;
  if (!media) return;
  const what = media.kind === "video" ? "AI 字幕" : "AI 识别的歌词";
  if (!(await confirmDialog(`移除 ${what}？之后可以重新识别或上传歌词文件。`))) return;
  try {
    await api.removeLibraryLyrics(media.path);
  } catch (e) {
    toast(`移除失败：${errText(e)}`, "error");
    return;
  }
  if (media.kind === "video") {
    const s = useSubtitles.getState();
    const removedActive = s.tracks[s.active]?.kind === "ai";
    const tracks = s.tracks.filter((t) => t.kind !== "ai");
    useSubtitles.setState({ tracks, active: removedActive ? -1 : s.tracks.filter((t, i) => i < s.active && t.kind !== "ai").length });
    if (removedActive) void selectSubtitle(-1);
  } else {
    await loadLyrics(media.path);
  }
  toast(`已移除 ${what}`, "success");
}

/** Recognises the current media again, letting the user pick a model first. */
export function rerunRecognition() {
  const media = usePlayer.getState().media;
  if (!media) return;
  useAsrTasks.setState({ pendingSetup: [taskInput({ ...media, title: media.meta?.title, artist: media.meta?.artist })], setupRerun: true });
  void refreshModels();
  useUI.setState({ overlay: "asrSetup" });
}

async function importLyricsFromPath(path: string) {
  const media = usePlayer.getState().media;
  if (!media) return;
  try {
    const content = await api.readTextFile(path);
    const parsed = parseLyrics(content, extOf(path));
    if (!parsed.lines.length) {
      toast("没有在文件中找到歌词", "error");
      return;
    }
    if (media.kind === "video") {
      useSubtitles.setState((s) => ({
        tracks: [...s.tracks, { label: `导入：${path.split(/[\\/]/).pop()}`, url: `inline:${content}`, kind: "file" }],
      }));
      selectSubtitle(useSubtitles.getState().tracks.length - 1);
      return;
    }
    // Persist as LRC so it is found automatically next time.
    const lrc = parsed.synced ? serializeLrc(parsed.lines, parsed.meta) : content;
    const saved = await api.saveLyrics(media.path, lrc, "same_dir", "library");
    setLyrics(lrc, parsed.synced ? "lrc" : "txt", saved.location === "same_dir" ? "sidecar" : "library", saved.path);
    toast(saved.fallback ? "歌曲目录不可写，已保存到应用歌词库" : "歌词已导入并保存到歌曲目录", saved.fallback ? "info" : "success");
  } catch (e) {
    toast(`导入失败：${errText(e)}`, "error");
  }
}

export async function importLyricsWithDialog() {
  if (!isTauri) {
    const [p] = await pickBrowserFiles(".lrc,.srt,.vtt,.txt", false);
    if (p) await importLyricsFromPath(p);
    return;
  }
  const res = await openDialog({ multiple: false, filters: [{ name: "歌词文件", extensions: ["lrc", "srt", "vtt", "txt"] }] });
  if (typeof res === "string") await importLyricsFromPath(res);
}

/** Saves editor output. Returns true on success. */
export async function saveEditedLyrics(lines: LyricLine[], target: "same_dir" | "library" | "export"): Promise<boolean> {
  const media = usePlayer.getState().media;
  if (!media) return false;
  const lyr = useLyrics.getState();
  const meta = { ...(lyr.lyrics?.meta ?? {}) };
  delete meta.offset;
  meta.title ??= media.meta?.title ?? media.name;
  if (media.meta?.artist) meta.artist ??= media.meta.artist;
  meta.by = "LightPlayer";
  const content = serializeLrc(lines, meta);
  const wasAi = lyr.origin === "ai" || lyr.origin === "ai_reviewed";
  try {
    if (target === "export") {
      if (!isTauri) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
        a.download = `${media.name}.lrc`;
        a.click();
        return true;
      }
      const dir = media.path.replace(/[\\/][^\\/]*$/, "");
      const path = await saveDialog({ defaultPath: `${dir}/${media.name}.lrc`, filters: [{ name: "LRC 歌词", extensions: ["lrc"] }] });
      if (!path) return false;
      await api.writeTextFile(path, content);
      toast("歌词已导出", "success");
      return true;
    }
    const origin: LyricsOrigin = wasAi ? "ai_reviewed" : "library";
    const saved = await api.saveLyrics(media.path, content, target, origin);
    const newOrigin: LyricsOrigin = saved.location === "same_dir" ? "sidecar" : origin;
    setLyrics(content, "lrc", newOrigin, saved.path, lyr.model);
    if (saved.fallback) toast(`无法写入歌曲目录（${saved.error ?? ""}），已保存到应用歌词库`);
    else toast(saved.location === "same_dir" ? `已保存：${saved.path}` : "已保存到应用歌词库", "success");
    return true;
  } catch (e) {
    toast(`保存失败：${errText(e)}`, "error");
    return false;
  }
}

// ------------------------------------------------------------------ subtitles

function setupSubtitles() {
  const media = engine.media;
  frameRate = null;
  if (!media || media.kind !== "video") {
    useSubtitles.setState({ tracks: [], active: -1, cues: null });
    return;
  }
  const tracks = media.subtitles.map((s) => ({ label: s.label, url: s.url, kind: "file" as const }));
  useSubtitles.setState({ tracks, active: -1, cues: null });
  const def = media.subtitles.findIndex((s) => s.default);
  if (def >= 0) selectSubtitle(def);
  api
    .getVideoInfo(media.path)
    .then((i) => (frameRate = i.fps ?? null))
    .catch(() => {});
}

export async function selectSubtitle(index: number) {
  const tr = useSubtitles.getState().tracks[index];
  if (!tr) {
    useSubtitles.setState({ active: -1, cues: null });
    return;
  }
  useSubtitles.setState({ active: index, cues: null });
  try {
    const text = tr.url.startsWith("inline:") ? tr.url.slice(7) : await (await fetch(tr.url)).text();
    const cues = parseLyrics(text, tr.url.startsWith("inline:") ? "lrc" : "vtt");
    if (useSubtitles.getState().active === index) useSubtitles.setState({ cues });
  } catch (e) {
    toast(`字幕加载失败：${errText(e)}`, "error");
  }
}

function addAiSubtitles(lrc: string, select = true) {
  const s = useSubtitles.getState();
  const tracks = s.tracks.filter((t) => t.kind !== "ai");
  tracks.push({ label: "AI 识别字幕（可能有误）", url: `inline:${lrc}`, kind: "ai" });
  useSubtitles.setState({ tracks });
  if (select || s.active < 0) void selectSubtitle(tracks.length - 1);
}

// ------------------------------------------------------------------ recognition

export async function refreshModels() {
  try {
    useModels.setState({ models: await api.asrModels() });
  } catch {
    /* ignore */
  }
}

export function modelReady(id: string): boolean {
  return !!useModels.getState().models.find((m) => m.id === id)?.downloaded;
}

export async function downloadModel(id: string): Promise<boolean> {
  try {
    useModels.setState((s) => ({
      downloads: { ...s.downloads, [id]: { id, downloaded: 0, total: 0, state: "downloading" } },
    }));
    await api.asrDownload(id, settings().asr.mirror);
    await refreshModels();
    return true;
  } catch (e) {
    const msg = errText(e);
    if (msg !== "已取消") toast(`模型下载失败：${msg}`, "error", 6000);
    return false;
  } finally {
    useModels.setState((s) => {
      const downloads = { ...s.downloads };
      delete downloads[id];
      return { downloads };
    });
    await refreshModels();
  }
}

/** What a recognition task needs to know about a file. */
export function taskInput(e: { path: string; name: string; kind: MediaKind; title?: string | null; artist?: string | null }): AsrTaskInput {
  return { path: e.path, name: e.name, kind: e.kind, title: e.title ?? null, artist: e.artist ?? null };
}

/** Recognises the current media (lyrics for music, subtitles for video). */
export function startRecognition() {
  const media = usePlayer.getState().media;
  if (!media) return;
  void recognize([taskInput({ ...media, title: media.meta?.title, artist: media.meta?.artist })]);
}

/**
 * Queues files for recognition. Prompts for a model first when none is
 * downloaded yet; the setup dialog then calls `confirmPendingRecognition`.
 */
export async function recognize(inputs: AsrTaskInput[], opts: { skipSetup?: boolean } = {}) {
  if (!inputs.length) return;
  await refreshModels();
  if (!opts.skipSetup && !modelReady(settings().asr.model)) {
    useAsrTasks.setState({ pendingSetup: inputs, setupRerun: false });
    useUI.setState({ overlay: "asrSetup" });
    return;
  }
  const st = useAsrTasks.getState();
  const busy = st.tasks.some((t) => t.status === "running" || t.status === "queued");
  const priv = settings().privateMode;
  const r = addTasks(st.tasks, priv ? inputs.map((i) => ({ ...i, private: true })) : inputs);
  useAsrTasks.setState({ tasks: r.tasks, pendingSetup: null, setupRerun: false });
  if (!r.added.length) toast(inputs.length > 1 ? "这些文件已在识别队列中" : "已在识别队列中");
  else if (r.added.length > 1) toast(`已加入 ${r.added.length} 个识别任务${r.skipped ? `（${r.skipped} 个已在队列中）` : ""}`, "success");
  else if (busy) toast(`已加入识别队列，排在第 ${queuePosition(r.tasks, r.added[0].path)} 位`, "success");
  if (useAsrTasks.getState().paused && r.added.length) toast("识别队列已暂停，可在识别任务中继续");
  void pumpRecognition();
}

export function confirmPendingRecognition() {
  const pending = useAsrTasks.getState().pendingSetup;
  if (pending) void recognize(pending, { skipSetup: true });
}

let pumping = false;

/** Starts the next queued task when nothing is running and the queue isn't paused. */
export async function pumpRecognition() {
  if (pumping) return;
  const st = useAsrTasks.getState();
  if (st.paused) return;
  const task = nextQueued(st.tasks);
  if (!task) return;
  pumping = true;
  const stillRunning = () => useAsrTasks.getState().tasks.find((t) => t.id === task.id)?.status === "running";
  let advance = false;
  try {
    updateTask(task.id, { status: "running", stage: "preparing", percent: 0, error: null });
    const asr = settings().asr;
    await refreshModels();
    if (asr.useVad && !modelReady("silero-vad")) {
      updateTask(task.id, { stage: "downloading", percent: 0 });
      await downloadModel("silero-vad");
    }
    if (stillRunning() && !modelReady(asr.model)) {
      updateTask(task.id, { stage: "downloading", percent: 0 });
      if (!(await downloadModel(asr.model))) {
        if (stillRunning()) {
          // Every later task would need the same model: stop here.
          finishTask(task.id, { status: "failed", error: "识别模型下载失败" });
          useAsrTasks.setState({ paused: true });
        } else advance = true;
        return;
      }
    }
    if (!stillRunning()) {
      advance = true; // cancelled while preparing
      return;
    }
    updateTask(task.id, { stage: "decoding", percent: 0 });
    await api.asrStart(task.path, {
      model: asr.model,
      language: asr.language,
      vocalFocus: asr.vocalFocus,
      simplified: asr.simplified,
      useVad: asr.useVad,
      wordTimestamps: asr.wordTimestamps,
      title: task.title ?? task.name,
      artist: task.artist ?? null,
    });
  } catch (e) {
    finishTask(task.id, { status: "failed", error: errText(e) });
    advance = true;
  } finally {
    pumping = false;
    if (advance) void pumpRecognition();
  }
}

function finishTask(id: string, patch: Partial<AsrTask>) {
  useAsrTasks.setState((s) => ({ tasks: finishTasks(s.tasks, id, patch) }));
}

/** Cancels a running task or removes a queued / finished one. */
export function cancelTask(id: string) {
  const t = useAsrTasks.getState().tasks.find((x) => x.id === id);
  if (!t) return;
  if (t.status !== "running") {
    useAsrTasks.setState((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) }));
    return;
  }
  if (t.stage === "preparing" || t.stage === "downloading") {
    for (const m of Object.keys(useModels.getState().downloads)) void api.asrCancelDownload(m);
    finishTask(id, { status: "cancelled" });
    toast("识别已取消");
    return;
  }
  // The backend reports the cancellation through asr://done.
  void api.asrCancel();
}

/** Cancels whatever is being recognised (lyrics page card). */
export function cancelRecognition() {
  const t = runningTask();
  if (t) cancelTask(t.id);
}

export function retryTask(id: string) {
  useAsrTasks.setState((s) => ({ tasks: retryTasks(s.tasks, id) }));
  void pumpRecognition();
}

export function moveTaskUp(id: string) {
  useAsrTasks.setState((s) => ({ tasks: moveUp(s.tasks, id) }));
}

export function clearFinishedTasks() {
  useAsrTasks.setState((s) => ({ tasks: s.tasks.filter((t) => t.status === "queued" || t.status === "running") }));
}

export function setRecognitionPaused(paused: boolean) {
  useAsrTasks.setState({ paused });
  if (!paused) void pumpRecognition();
}

/** Opens a finished task's file and, for music, its lyrics. */
export async function openTaskResult(t: AsrTask) {
  useUI.setState({ overlay: null });
  if (usePlayer.getState().media?.path !== t.path) await openFile(t.path);
  if (t.kind === "audio" && usePlayer.getState().media?.path === t.path) useUI.setState({ page: "lyrics" });
  else useUI.setState({ page: "player" });
}

function onAsrProgress(p: AsrProgressEvent) {
  const t = runningTask();
  if (!t || t.path !== p.mediaPath) return;
  if (t.stage !== p.stage || Math.abs(t.percent - p.percent) >= 1) updateTask(t.id, { stage: p.stage, percent: p.percent });
}

function onAsrDone(d: AsrDone) {
  const t = runningTask();
  if (t && t.path === d.mediaPath) {
    if (d.cancelled) finishTask(t.id, { status: "cancelled" });
    else if (!d.ok || !d.result) finishTask(t.id, { status: "failed", error: d.error ?? "未知错误" });
    else finishTask(t.id, { status: "done", percent: 100, lineCount: d.result.lineCount, model: d.result.model });
  }
  void pumpRecognition();
  if (d.cancelled) {
    toast("识别已取消");
    return;
  }
  const name = t?.title || stem(d.mediaPath);
  if (!d.ok || !d.result) {
    toast(`《${name}》识别失败：${d.error ?? "未知错误"}`, "error", 6000);
    return;
  }
  const media = usePlayer.getState().media;
  if (!media || media.path !== d.mediaPath) {
    toast(`《${name}》识别完成，共 ${d.result.lineCount} 行`, "success");
    return;
  }
  if (media.kind === "video") {
    addAiSubtitles(d.result.lrc);
  } else {
    setLyrics(d.result.lrc, "lrc", "ai", null, d.result.model);
    useUI.setState({ page: "lyrics" });
  }
  toast(`识别完成，共 ${d.result.lineCount} 行`, "success");
}

function onModelDownload(p: DownloadProgress) {
  useModels.setState((s) => ({ downloads: { ...s.downloads, [p.id]: p } }));
  const t = runningTask();
  if (t && t.stage === "downloading" && p.total > 0) {
    const percent = (p.downloaded / p.total) * 100;
    if (Math.abs(t.percent - percent) >= 1) updateTask(t.id, { percent });
  }
}

// ------------------------------------------------------------------ misc

/** Private browsing: nothing opened from now on is remembered. */
export function setPrivateMode(on: boolean) {
  if (settings().privateMode === on) return;
  useSettings.getState().set({ privateMode: on });
  toast(on ? "已开启无痕浏览，不会记录打开的文件" : "已关闭无痕浏览", on ? "success" : "info");
}

async function updateNowPlaying() {
  const m = engine.media;
  if (!m || !isTauri) return;
  await api
    .nowPlayingMetadata({
      title: m.meta?.title ?? m.name,
      artist: m.meta?.artist ?? null,
      album: m.meta?.album ?? null,
      duration: m.duration ?? null,
      cover: m.meta?.cover ?? null,
    })
    .catch(() => {});
}

async function updateDynamicAccent() {
  const cover = engine.media?.meta?.cover;
  if (!cover) {
    useUI.setState({ dynamicAccent: null });
    return;
  }
  const { dominantColor } = await import("../lib/color");
  useUI.setState({ dynamicAccent: await dominantColor(cover) });
}

function rememberPosition(final = false) {
  const m = engine.media;
  if (!m || settings().privateMode) return;
  const d = engine.duration;
  if (!d || d < 600) return; // only long media (videos, audiobooks, podcasts)
  const t = engine.position;
  const set = useSettings.getState().savePosition;
  if (t > d - 15 || t < 10) set(m.path, null);
  else if (final || Math.round(t) % 5 === 0) set(m.path, t);
}

let lastNpSync = 0;
let lastPosSave = 0;

function tick() {
  const p = usePlayer.getState();
  const media = engine.media;
  if (media) {
    const position = engine.position;
    const now = performance.now();
    const patch: Partial<typeof p> = {};
    if (Math.abs(position - p.position) > 0.03) patch.position = position;
    const duration = engine.duration;
    if (duration !== p.duration) patch.duration = duration;
    const playing = !engine.paused;
    if (playing !== p.playing) patch.playing = playing;
    const waiting = playing && engine.waiting;
    if (waiting !== p.waiting) patch.waiting = waiting;
    if (now % 500 < 70) patch.buffered = engine.buffered();
    if (Object.keys(patch).length) usePlayer.setState(patch);

    const { a, b } = p.abLoop;
    if (a !== null && b !== null && position >= b) void engine.seek(a);
    if (p.sleep.until && Date.now() >= p.sleep.until) {
      usePlayer.setState({ sleep: { until: null, endOfTrack: false } });
      engine.fadeOutAndPause();
    }
    if (now - lastPosSave > 5000 && playing) {
      lastPosSave = now;
      rememberPosition();
    }
    if (isTauri && now - lastNpSync > 5000) {
      lastNpSync = now;
      void api.nowPlayingState(playing, position).catch(() => {});
    }
  }
  window.setTimeout(() => requestAnimationFrame(tick), 50);
}

let initialized = false;

export async function init() {
  if (initialized) return;
  initialized = true;
  const st = settings();
  engine.setVolume(st.volume);
  engine.setMuted(st.muted);
  engine.setRate(st.rate);
  usePlaylist.setState({ mode: st.mode });

  engine.onEnded = () => {
    const s = usePlayer.getState().sleep;
    const m = engine.media;
    if (m && !settings().privateMode) useSettings.getState().savePosition(m.path, null);
    if (s.endOfTrack) {
      usePlayer.setState({ sleep: { until: null, endOfTrack: false } });
      toast("睡眠定时：已暂停");
      return;
    }
    void next(true);
  };
  engine.onError = (msg) => {
    usePlayer.setState({ error: msg });
    toast(msg, "error", 5000);
  };
  engine.onChange = () => {
    usePlayer.setState({ playing: !engine.paused, waiting: !engine.paused && engine.waiting });
    if (isTauri && engine.media) void api.nowPlayingState(!engine.paused, engine.position).catch(() => {});
  };
  requestAnimationFrame(tick);
  void initLibrary();

  window.addEventListener("beforeunload", () => rememberPosition(true));

  // Menu bar icon, "keep running when the window is closed" and private mode.
  const syncBackground = (s: { runInBackground: boolean; trayShowTitle: boolean; privateMode: boolean }) =>
    void api.setBackgroundPrefs(s.runInBackground, s.trayShowTitle, s.privateMode).catch(() => {});
  syncBackground(st);
  useSettings.subscribe((s, prev) => {
    if (s.runInBackground !== prev.runInBackground || s.trayShowTitle !== prev.trayShowTitle || s.privateMode !== prev.privateMode)
      syncBackground(s);
  });

  startWeather();
  void startDesktopLyrics();

  await on<AsrProgressEvent>("asr://progress", onAsrProgress);
  await on<AsrDone>("asr://done", onAsrDone);
  await on<DownloadProgress>("asr://download", onModelDownload);
  void pumpRecognition();

  if (isTauri) {
    await on<string[]>("app://open-files", (paths) => void openFiles(paths));
    await on<MediaControlEvent>("media-control", (e) => {
      switch (e.action) {
        case "play":
          void engine.play();
          break;
        case "pause":
          engine.pause();
          break;
        case "toggle":
          toggle();
          break;
        case "next":
          void next();
          break;
        case "previous":
          void prev();
          break;
        case "seekBy":
          seekBy(e.value ?? 15);
          break;
        case "seekTo":
          seek(e.value ?? 0);
          break;
        case "privateMode":
          setPrivateMode(!!e.value);
          break;
      }
    });
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      await getCurrentWebview().onDragDropEvent((event) => {
        const t = event.payload.type;
        if (t === "enter" || t === "over") useUI.setState({ dragOver: true });
        else if (t === "leave") useUI.setState({ dragOver: false });
        else if (t === "drop") {
          useUI.setState({ dragOver: false });
          if (useUI.getState().page === "library") void addToLibrary(event.payload.paths);
          else void openFiles(event.payload.paths);
        }
      });
    } catch (e) {
      console.warn("drag-drop", e);
    }
    const ok = await api.ffmpegAvailable().catch(() => false);
    if (!ok) toast("未找到 ffmpeg 组件，部分格式将无法播放", "error", 8000);
    void refreshModels();
    const pending = await api.takePendingOpen().catch(() => [] as string[]);
    if (pending.length) void openFiles(pending);
  } else {
    // Browser preview: HTML5 drag & drop.
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
      useUI.setState({ dragOver: true });
    });
    window.addEventListener("dragleave", (e) => {
      if (!e.relatedTarget) useUI.setState({ dragOver: false });
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      useUI.setState({ dragOver: false });
      if (!e.dataTransfer?.files.length) return;
      const paths = registerBrowserFiles(e.dataTransfer.files);
      if (useUI.getState().page === "library") void addToLibrary(paths);
      else void openFiles(paths);
    });
  }
}

/** Adds dropped files / folders to the media library. */
export async function addToLibrary(paths: string[]) {
  const r = await libraryAction(() => api.libraryAddPaths(paths));
  if (!r) return;
  const parts = [r.folders ? `${r.folders} 个文件夹` : "", r.files ? `${r.files} 个文件` : ""].filter(Boolean);
  toast(parts.length ? `已加入媒体库：${parts.join("，")}` : "这些文件已在媒体库中", parts.length ? "success" : "info");
}

/** Picks folders (Tauri) or files (browser preview) to add to the library. */
export async function addLibraryFolderWithDialog() {
  if (!isTauri) {
    const paths = await pickBrowserFiles();
    if (paths.length) await addToLibrary(paths);
    return;
  }
  const res = await openDialog({ directory: true, multiple: true, title: "选择要加入媒体库的文件夹" });
  const dirs = typeof res === "string" ? [res] : res ?? [];
  for (const d of dirs) await libraryAction(() => api.libraryAddFolder(d));
  if (dirs.length) toast("已添加文件夹，正在扫描…", "success");
}

export async function toggleFavorite(path: string, on?: boolean) {
  const fav = useLibrary.getState().data.favorites.includes(path);
  const next = on ?? !fav;
  if (next && !useLibrary.getState().data.tracks.some((t) => t.path === path)) {
    // Favouriting a file that isn't in the library yet adds it first.
    await api.libraryAddPaths([path]).catch(() => {});
  }
  await libraryAction(() => api.librarySetFavorite(path, next));
}

export type { Lyrics };
