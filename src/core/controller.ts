// Application actions: wires the playback engine, stores and backend together.

import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { engine } from "./player/engine";
import { parseLyrics, serializeLrc, type Lyrics, type LyricLine } from "./lyrics/lrc";
import { nextIndex, nextMode, prevIndex } from "./playlist/queue";
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
  type MediaControlEvent,
} from "../lib/ipc";
import { stem } from "../lib/format";
import { useLyrics, useModels, usePlayer, usePlaylist, useSubtitles, useUI, toast } from "../stores/player";
import { useSettings } from "../stores/settings";

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
  try {
    const kind = kindOf(path) ?? undefined;
    const items = await api.scanPlaylist(path, kind);
    const index = Math.max(0, items.findIndex((i) => i.path === path));
    usePlaylist.setState({ items, index, order: [], history: [] });
    await playIndex(index);
  } catch (e) {
    toast(`无法打开文件：${errText(e)}`, "error");
  }
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

export async function playIndex(index: number, autoplay = true) {
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
    const media = await api.openMedia(entry.path, caps);
    // Ignore stale results if the user skipped again in the meantime.
    if (usePlaylist.getState().items[usePlaylist.getState().index]?.path !== entry.path) return;
    const st = settings();
    let startAt = 0;
    const saved = st.positions[media.path];
    const dur = media.duration ?? 0;
    if (st.resume && saved && saved > 10 && (!dur || saved < dur - 10)) {
      startAt = saved;
      toast(`已从上次位置 ${Math.floor(saved / 60)}:${String(Math.floor(saved % 60)).padStart(2, "0")} 继续播放`);
    }
    usePlayer.setState({ media, loading: false, duration: dur, position: startAt });
    useSettings.getState().addRecent(media.path);
    if (media.kind === "video" && useUI.getState().page === "lyrics") useUI.setState({ page: "player" });
    await engine.load(media, startAt, autoplay);
    void loadLyrics(media.path);
    setupSubtitles();
    void updateNowPlaying();
    void updateDynamicAccent();
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

/** Starts lyric/subtitle recognition, prompting for a model download first if needed. */
export async function startRecognition(opts: { skipSetup?: boolean } = {}) {
  const media = usePlayer.getState().media;
  if (!media) return;
  if (!isTauri) {
    toast("浏览器预览模式不支持本地识别", "error");
    return;
  }
  if (useLyrics.getState().asr) {
    toast("已有识别任务正在进行");
    return;
  }
  await refreshModels();
  const asr = settings().asr;
  if (!opts.skipSetup && !modelReady(asr.model)) {
    useUI.setState({ overlay: "asrSetup" });
    return;
  }
  useLyrics.setState({ asr: { mediaPath: media.path, stage: "preparing", percent: 0 } });
  if (asr.useVad && !modelReady("silero-vad")) {
    useLyrics.setState({ asr: { mediaPath: media.path, stage: "downloading", percent: 0 } });
    await downloadModel("silero-vad");
  }
  if (!modelReady(asr.model)) {
    useLyrics.setState({ asr: { mediaPath: media.path, stage: "downloading", percent: 0 } });
    const ok = await downloadModel(asr.model);
    if (!ok) {
      useLyrics.setState({ asr: null });
      return;
    }
  }
  try {
    await api.asrStart(media.path, {
      model: asr.model,
      language: asr.language,
      vocalFocus: asr.vocalFocus,
      simplified: asr.simplified,
      useVad: asr.useVad,
      wordTimestamps: asr.wordTimestamps,
      title: media.meta?.title ?? media.name,
      artist: media.meta?.artist ?? null,
    });
  } catch (e) {
    useLyrics.setState({ asr: null });
    toast(`无法开始识别：${errText(e)}`, "error");
  }
}

export function cancelRecognition() {
  void api.asrCancel();
  const a = useLyrics.getState().asr;
  if (a?.stage === "downloading") {
    for (const id of Object.keys(useModels.getState().downloads)) void api.asrCancelDownload(id);
    useLyrics.setState({ asr: null });
  }
}

function onAsrDone(d: AsrDone) {
  useLyrics.setState({ asr: null });
  if (d.cancelled) {
    toast("识别已取消");
    return;
  }
  if (!d.ok || !d.result) {
    toast(`识别失败：${d.error ?? "未知错误"}`, "error", 6000);
    return;
  }
  const media = usePlayer.getState().media;
  const name = stem(d.mediaPath);
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

// ------------------------------------------------------------------ misc

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
  if (!m) return;
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
    if (m) useSettings.getState().savePosition(m.path, null);
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

  // The Web Audio graph (app volume + waveform analyser) may only start inside a gesture.
  const gesture = () => engine.enableGraph();
  window.addEventListener("pointerdown", gesture, true);
  window.addEventListener("keydown", gesture, true);

  window.addEventListener("beforeunload", () => rememberPosition(true));

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
      }
    });
    await on<AsrProgressEvent>("asr://progress", (p) => {
      const cur = useLyrics.getState().asr;
      if (!cur || cur.mediaPath !== p.mediaPath) {
        useLyrics.setState({ asr: { mediaPath: p.mediaPath, stage: p.stage, percent: p.percent } });
        return;
      }
      if (cur.stage !== p.stage || Math.abs(cur.percent - p.percent) >= 1) {
        useLyrics.setState({ asr: { ...cur, stage: p.stage, percent: p.percent } });
      }
    });
    await on<AsrDone>("asr://done", onAsrDone);
    await on<DownloadProgress>("asr://download", (p) => {
      useModels.setState((s) => ({ downloads: { ...s.downloads, [p.id]: p } }));
      const a = useLyrics.getState().asr;
      if (a && a.stage === "downloading" && p.total > 0) {
        useLyrics.setState({ asr: { ...a, percent: (p.downloaded / p.total) * 100 } });
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
          void openFiles(event.payload.paths);
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
      if (e.dataTransfer?.files.length) void openFiles(registerBrowserFiles(e.dataTransfer.files));
    });
  }
}

export type { Lyrics };
