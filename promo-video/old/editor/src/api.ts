import type { Texts } from "../../src/shared/texts";
import type { ExportSettings, GpuReport, JobStatus, SystemInfo } from "../shared/types";

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: { "Content-Type": "application/json", "X-LightPlayer-Editor": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `请求失败（${res.status}）`);
  return data;
}

export const api = {
  texts: () => call<Texts>("GET", "/texts"),
  save: (texts: Texts) => call<Texts>("PUT", "/texts", texts),
  system: () => call<SystemInfo>("GET", "/system"),
  gpuCheck: () => call<GpuReport>("POST", "/gpu-check"),
  status: () => call<JobStatus>("GET", "/export"),
  /** Exports with the texts saved on disk. */
  startExport: (settings: ExportSettings) => call<JobStatus>("POST", "/export", { settings }),
  cancelExport: () => call<JobStatus>("POST", "/export/cancel"),
  reveal: (file: string, show: boolean) => call<{ ok: true }>("POST", "/reveal", { file, show }),
};
