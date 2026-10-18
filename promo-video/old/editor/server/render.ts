// Exports a video with Remotion's renderer on this machine. Frames are drawn
// by Chrome with GPU-backed WebGL (ANGLE: Metal on macOS, Direct3D on
// Windows) and encoded with the graphics card's encoder when one works.

import { bundle } from "@remotion/bundler";
import {
  type ChromeMode,
  type Codec,
  ensureBrowser,
  makeCancelSignal,
  type OnBrowserDownload,
  openBrowser,
  type OpenGlRenderer,
  renderMedia,
  RenderInternals,
  selectComposition,
} from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { mergeTexts } from "../../src/shared/texts";
import type { ExportSettings, GpuReport, JobStatus, SystemInfo, VideoCodec } from "../shared/types";

const BASE_HEIGHT = 1080;

/** Optional overrides, mainly for machines where Remotion cannot download Chrome. */
const browserExecutable = process.env.LP_BROWSER_EXECUTABLE || null;
const chromeModeOverride = process.env.LP_CHROME_MODE as ChromeMode | undefined;

export const glFor = (gpu: boolean): OpenGlRenderer => {
  if (!gpu) return "swangle";
  // ANGLE picks Metal on macOS and Direct3D 11 on Windows.
  if (process.platform === "linux") return "angle-egl";
  return "angle";
};

const chromeModeFor = (gpu: boolean): ChromeMode => chromeModeOverride ?? (gpu && process.platform === "linux" ? "chrome-for-testing" : "headless-shell");

const rendererName = (gpu: boolean) =>
  !gpu
    ? "软件渲染（SwiftShader）"
    : process.platform === "darwin"
      ? "显卡渲染（ANGLE / Metal）"
      : process.platform === "win32"
        ? "显卡渲染（ANGLE / Direct3D）"
        : "显卡渲染（ANGLE / EGL）";

// ------------------------------------------------------------------ Encoders

const HW_ENCODERS: Partial<Record<NodeJS.Platform, Partial<Record<VideoCodec, string>>>> = {
  darwin: { h264: "h264_videotoolbox", h265: "hevc_videotoolbox", prores: "prores_videotoolbox" },
  win32: { h264: "h264_nvenc", h265: "hevc_nvenc" },
  linux: { h264: "h264_nvenc", h265: "hevc_nvenc" },
};

const SW_ENCODERS: Record<VideoCodec, string> = { h264: "x264", h265: "x265", prores: "ProRes (prores_ks)" };

let hwProbe: Promise<Partial<Record<VideoCodec, string>>> | null = null;

/** Tries each hardware encoder on a few blank frames; keeps the ones that work. */
export function probeHardwareEncoders() {
  hwProbe ??= (async () => {
    const found: Partial<Record<VideoCodec, string>> = {};
    for (const [codec, encoder] of Object.entries(HW_ENCODERS[process.platform] ?? {})) {
      try {
        await RenderInternals.callFf({
          bin: "ffmpeg",
          args: ["-hide_banner", "-f", "lavfi", "-i", "color=c=black:s=640x360:r=30", "-frames:v", "3", "-c:v", encoder, "-f", "null", "-"],
          indent: false,
          logLevel: "error",
          binariesDirectory: null,
          cancelSignal: undefined,
        });
        found[codec as VideoCodec] = encoder;
      } catch {
        // Not available on this machine (no such GPU or driver).
      }
    }
    return found;
  })();
  return hwProbe;
}

export async function systemInfo(outDir: string): Promise<SystemInfo> {
  return { platform: process.platform, outDir, hwEncoders: await probeHardwareEncoders() };
}

// ------------------------------------------------------------------ Bundle

let bundled: { url: string; stamp: number } | null = null;
let bundling: Promise<string> | null = null;

/** Newest modification time among the files that make up the video. */
function sourceStamp(root: string) {
  let newest = 0;
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  walk(path.join(root, "src"));
  walk(path.join(root, "public"));
  return Math.max(newest, fs.statSync(path.join(root, "package.json")).mtimeMs);
}

/** Bundles the Remotion project once and reuses it until the source changes. */
async function getBundle(root: string, onProgress: (p: number) => void): Promise<string> {
  // One bundle at a time: the GPU check and an export may both ask for it.
  if (bundling) {
    await bundling.catch(() => undefined);
    return getBundle(root, onProgress);
  }
  const stamp = sourceStamp(root);
  if (bundled && bundled.stamp === stamp && fs.existsSync(bundled.url)) return bundled.url;
  bundling = bundle({
    entryPoint: path.join(root, "src", "index.ts"),
    publicDir: path.join(root, "public"),
    outDir: path.join(root, "node_modules", ".cache", "lightplayer-editor-bundle"),
    rspack: true,
    onProgress: (p) => onProgress(p / 100),
  });
  try {
    const url = await bundling;
    bundled = { url, stamp };
    return url;
  } finally {
    bundling = null;
  }
}

// ------------------------------------------------------------------ GPU check

/**
 * Launches the render browser exactly as an export would and asks WebGL which
 * renderer it got: a graphics card, or a software fallback.
 */
export async function checkGpu(root: string): Promise<GpuReport> {
  let browser: Awaited<ReturnType<typeof openBrowser>> | null = null;
  try {
    const serveUrl = await getBundle(root, () => undefined);
    const chromeMode = chromeModeFor(true);
    const gl = glFor(true);
    await ensureBrowser({ browserExecutable, chromeMode, logLevel: "error" });
    browser = await openBrowser("chrome", { browserExecutable, chromeMode, chromiumOptions: { gl }, logLevel: "error" });
    const probe = await selectComposition({ serveUrl, id: "GpuProbe", inputProps: { gpuProbe: true }, puppeteerInstance: browser, browserExecutable, chromiumOptions: { gl }, chromeMode, logLevel: "error" });
    const renderer = String((probe.props as { renderer?: string }).renderer ?? "");
    const accelerated = renderer !== "" && !/swiftshader|llvmpipe|softpipe|software|basic render|WebGL 不可用/i.test(renderer);
    return { accelerated, renderer };
  } catch (e) {
    return { accelerated: false, renderer: "", error: e instanceof Error ? e.message : String(e) };
  } finally {
    await browser?.close({ silent: true }).catch(() => undefined);
  }
}

// ------------------------------------------------------------------ Export

const idle = (id: number): JobStatus => ({ id, state: "idle", progress: 0, renderedFrames: 0, encodedFrames: 0, totalFrames: 0, notes: [] });

let job: JobStatus = idle(0);
let cancel: (() => void) | null = null;

export const status = () => job;

export const outputName = (s: ExportSettings) => `LightPlayer-${s.video}-${s.height}p${s.fps}.${s.codec === "prores" ? "mov" : "mp4"}`;

/** Target bitrate for hardware encoders, which do not take a CRF. */
function bitrate(s: ExportSettings) {
  const w = Math.round((1920 * s.height) / BASE_HEIGHT);
  const bitsPerPixel = (s.quality === "high" ? 0.2 : 0.1) * (s.codec === "h265" ? 0.6 : 1);
  return `${Math.round((w * s.height * s.fps * bitsPerPixel) / 1000)}k`;
}

const crfFor = (s: ExportSettings) => (s.codec === "h265" ? (s.quality === "high" ? 20 : 25) : s.quality === "high" ? 17 : 22);

const looksLikeEncoderFailure = (msg: string) => /nvenc|videotoolbox|encoder|hwaccel|OpenEncodeSession|No capable devices|Cannot load/i.test(msg);

/**
 * Starts an export in the background; poll `status()` for progress. Only one
 * export runs at a time.
 */
export function startExport(root: string, settings: ExportSettings, texts: unknown): JobStatus {
  if (job.state === "running") throw new Error("已有导出正在进行");
  const id = job.id + 1;
  job = { ...idle(id), state: "running", stage: "bundle", startedAt: Date.now(), settings, outputName: outputName(settings), renderer: rendererName(settings.gpu) };
  const signal = makeCancelSignal();
  let cancelled = false;
  cancel = () => {
    cancelled = true;
    signal.cancel();
  };
  const update = (patch: Partial<JobStatus>) => {
    if (job.id === id) job = { ...job, ...patch };
  };

  void (async () => {
    const outDir = path.join(root, "out");
    const output = path.join(outDir, outputName(settings));
    let browser: Awaited<ReturnType<typeof openBrowser>> | null = null;
    try {
      fs.mkdirSync(outDir, { recursive: true });
      const serveUrl = await getBundle(root, (p) => update({ progress: 0.08 * p, detail: `打包项目 ${Math.round(p * 100)}%` }));
      if (cancelled) throw new Error("cancelled");

      update({ stage: "browser", progress: 0.08, detail: undefined });
      const chromeMode = chromeModeFor(settings.gpu);
      const onBrowserDownload: OnBrowserDownload = () => ({
        version: null,
        onProgress: ({ percent, downloadedBytes, totalSizeInBytes }) =>
          update({ detail: `首次使用，正在下载渲染用的浏览器 ${Math.round(percent * 100)}%（${(downloadedBytes / 1e6).toFixed(0)} / ${(totalSizeInBytes / 1e6).toFixed(0)} MB）` }),
      });
      await ensureBrowser({ browserExecutable, chromeMode, onBrowserDownload, logLevel: "error" });
      const gl = glFor(settings.gpu);
      browser = await openBrowser("chrome", { browserExecutable, chromeMode, chromiumOptions: { gl }, logLevel: "error" });
      if (cancelled) throw new Error("cancelled");

      update({ stage: "prepare", progress: 0.1, detail: undefined });
      const inputProps = { texts: mergeTexts(texts), fps: settings.fps };
      const composition = await selectComposition({ serveUrl, id: settings.video, inputProps, puppeteerInstance: browser, browserExecutable, chromiumOptions: { gl }, chromeMode, logLevel: "error" });
      update({ totalFrames: composition.durationInFrames });

      const hw = settings.hwEncode ? (await probeHardwareEncoders())[settings.codec] : undefined;
      const codec: Codec = settings.codec;
      const run = async (useHw: boolean) => {
        update({ encoder: useHw && hw ? `显卡编码（${hw}）` : `软件编码（${SW_ENCODERS[settings.codec]}）` });
        const started = Date.now();
        const hardwareAcceleration = useHw ? ("required" as const) : ("disable" as const);
        await renderMedia({
          serveUrl,
          composition,
          inputProps,
          codec,
          outputLocation: output,
          overwrite: true,
          muted: true,
          scale: settings.height / BASE_HEIGHT,
          imageFormat: "jpeg",
          jpegQuality: 92,
          colorSpace: "bt709",
          hardwareAcceleration,
          ...(codec === "prores"
            ? { proResProfile: settings.quality === "high" ? ("hq" as const) : ("standard" as const) }
            : useHw
              ? { videoBitrate: bitrate(settings) }
              : { crf: crfFor(settings) }),
          chromiumOptions: { gl },
          chromeMode,
          browserExecutable,
          puppeteerInstance: browser!,
          timeoutInMilliseconds: 120000,
          cancelSignal: signal.cancelSignal,
          logLevel: "error",
          onProgress: (p) => {
            const elapsed = Date.now() - started;
            update({
              stage: "render",
              progress: 0.1 + 0.88 * p.progress,
              renderedFrames: p.renderedFrames,
              encodedFrames: p.encodedFrames,
              etaMs: p.progress > 0.02 ? (elapsed / p.progress) * (1 - p.progress) : undefined,
              detail: p.renderedDoneIn !== null && p.encodedDoneIn === null ? "正在完成编码…" : undefined,
            });
          },
        });
      };
      try {
        await run(Boolean(hw));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!hw || cancelled || !looksLikeEncoderFailure(msg)) throw e;
        update({ notes: [...job.notes, `显卡编码器 ${hw} 出错，已改用软件编码重新导出。`], renderedFrames: 0, encodedFrames: 0 });
        await run(false);
      }
      if (cancelled) throw new Error("cancelled");
      update({ state: "done", stage: "finish", progress: 1, etaMs: 0, output, size: fs.statSync(output).size, finishedAt: Date.now(), detail: undefined });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (cancelled || /cancel/i.test(msg)) {
        update({ state: "cancelled", finishedAt: Date.now(), detail: undefined });
        fs.rmSync(output, { force: true });
      } else {
        update({ state: "error", error: msg, finishedAt: Date.now(), detail: undefined });
      }
    } finally {
      cancel = null;
      await browser?.close({ silent: true }).catch(() => undefined);
    }
  })();
  return job;
}

export function cancelExport() {
  cancel?.();
}
