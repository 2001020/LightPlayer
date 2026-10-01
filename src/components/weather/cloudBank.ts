// Cloud textures, generated in a worker (or in small steps on the main
// thread if workers are unavailable) and cached by their parameters.

import { renderCloud, type CloudJob } from "./cloudNoise";

const cache = new Map<string, HTMLCanvasElement>();
const queued = new Set<string>();
const listeners = new Set<() => void>();
const CACHE_LIMIT = 60;

export function cloudKey(j: CloudJob): string {
  const p = j.palette;
  return [j.kind, p.lit, p.shadow, p.light, p.absorb, p.opacity, j.shapeSeed, j.detailSeed, j.w, j.h].join("|");
}

function store(key: string, job: CloudJob, pixels: Uint8ClampedArray) {
  queued.delete(key);
  const c = document.createElement("canvas");
  c.width = job.w;
  c.height = job.h;
  const img = new ImageData(job.w, job.h);
  img.data.set(pixels);
  c.getContext("2d")!.putImageData(img, 0, 0);
  cache.set(key, c);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  for (const l of listeners) l();
}

// ---------------------------------------------------------------- main thread fallback

const local: { key: string; job: CloudJob }[] = [];
let localBusy = false;

function runLocal() {
  if (localBusy) return;
  const next = local.shift();
  if (!next) return;
  localBusy = true;
  window.setTimeout(() => {
    try {
      store(next.key, next.job, renderCloud(next.job));
    } catch (e) {
      console.warn("cloud texture", e);
      queued.delete(next.key);
    }
    localBusy = false;
    runLocal();
  }, 16);
}

// ---------------------------------------------------------------- worker

let worker: Worker | null | undefined;
let seq = 0;
const inflight = new Map<number, { key: string; job: CloudJob }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./cloudWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; pixels: Uint8ClampedArray }>) => {
      const job = inflight.get(e.data.id);
      inflight.delete(e.data.id);
      if (job) store(job.key, job.job, e.data.pixels);
    };
    worker.onerror = (e) => {
      console.warn("cloud worker", e.message);
      worker?.terminate();
      worker = null;
      for (const j of inflight.values()) local.push(j);
      inflight.clear();
      runLocal();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** The texture for `job` if it is ready; otherwise starts making it and returns null. */
export function cloudTexture(job: CloudJob, key = cloudKey(job)): HTMLCanvasElement | null {
  const hit = cache.get(key);
  if (hit) return hit;
  if (queued.has(key)) return null;
  queued.add(key);
  const w = getWorker();
  if (w) {
    const id = ++seq;
    inflight.set(id, { key, job });
    w.postMessage({ ...job, id });
  } else {
    local.push({ key, job });
    runLocal();
  }
  return null;
}

export function peekCloud(key: string): HTMLCanvasElement | null {
  return cache.get(key) ?? null;
}

/** Called whenever a texture finishes. */
export function onCloudReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
