// Updates from GitHub Releases: check, download with progress, install.

import { create } from "zustand";
import { api, isTauri, on, type AppInfo, type UpdateInfo } from "../lib/ipc";
import { toast, useUI } from "./player";
import { useSettings } from "./settings";

/** speed: bytes per second; connections: several when aria2 downloads. */
export type UpdateProgress = { received: number; total: number; speed?: number; connections?: number };

export type UpdateStatus = "idle" | "checking" | "latest" | "available" | "downloading" | "installing" | "error";

interface UpdaterState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  /** Date.now() of the last finished check. */
  checkedAt: number | null;
  app: AppInfo | null;
}

export const useUpdater = create<UpdaterState>(() => ({
  status: "idle",
  info: null,
  progress: null,
  error: null,
  checkedAt: null,
  app: null,
}));

/** A version string with a pre-release part (1.6.0b1, 1.6.0-beta.1). */
export const isPrereleaseVersion = (v: string) => /^\D*\d+(?:\.\d+)*[^\d.]/.test(v.trim());

export async function loadAppInfo(): Promise<AppInfo> {
  const cur = useUpdater.getState().app;
  if (cur) return cur;
  const app = await api.appInfo().catch(
    (): AppInfo => ({ version: __APP_VERSION__, prerelease: isPrereleaseVersion(__APP_VERSION__), install: "manual" }),
  );
  useUpdater.setState({ app });
  return app;
}

/** Offer pre-releases: the user's choice, or yes when this build is one. */
export function includePrerelease(): boolean {
  const choice = useSettings.getState().update.prerelease;
  return choice ?? useUpdater.getState().app?.prerelease ?? isPrereleaseVersion(__APP_VERSION__);
}

/**
 * Looks for a newer release. `manual`: the user asked (reports "up to date"
 * and errors, and ignores a skipped version); otherwise a found update opens
 * the update window unless the user skipped that version or is busy.
 */
export async function checkForUpdates(manual: boolean): Promise<void> {
  const s = useUpdater.getState();
  if (s.status === "checking" || s.status === "downloading" || s.status === "installing") return;
  await loadAppInfo();
  useUpdater.setState({ status: "checking", error: null });
  try {
    const info = await api.updateCheck(includePrerelease());
    useUpdater.setState({ status: info ? "available" : "latest", info, checkedAt: Date.now() });
    if (!info) {
      if (manual) toast(`已是最新版本（${__APP_VERSION__}）`, "success");
      return;
    }
    const ui = useUI.getState();
    const skipped = useSettings.getState().update.skip === info.version;
    if (manual || (!skipped && !ui.overlay && !ui.fullscreen)) useUI.setState({ overlay: "update" });
  } catch (e) {
    useUpdater.setState({ status: "error", error: String(e), checkedAt: Date.now() });
    if (manual) toast(`检查更新失败：${String(e)}`, "error", 6000);
  }
}

export async function openReleasePage(url?: string) {
  const page = url ?? useUpdater.getState().info?.page ?? "https://github.com/2001020/LightPlayer/releases";
  if (!isTauri) {
    window.open(page, "_blank");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(page);
}

/** Downloads and installs the found update; the app restarts as the new version. */
export async function startUpdate(): Promise<void> {
  const { info, status } = useUpdater.getState();
  if (!info || status === "downloading" || status === "installing") return;
  if (!info.asset || info.kind === "manual") {
    await openReleasePage(info.page);
    return;
  }
  useUpdater.setState({ status: "downloading", progress: { received: 0, total: info.asset.size }, error: null });
  const off = await on<UpdateProgress>("update://progress", (p) => useUpdater.setState({ progress: p }));
  let path: string;
  try {
    path = await api.updateDownload(info.asset);
  } catch (e) {
    const cancelled = String(e).includes("已取消");
    useUpdater.setState({ status: "available", progress: null, error: cancelled ? null : `下载失败：${String(e)}` });
    return;
  } finally {
    off();
  }
  useUpdater.setState({ status: "installing" });
  try {
    await api.updateInstall(path);
  } catch (e) {
    useUpdater.setState({ status: "available", progress: null, error: `安装失败：${String(e)}` });
  }
}

export function cancelUpdate() {
  void api.updateCancel();
}

/** Don't offer this version again automatically. */
export function skipUpdate() {
  const v = useUpdater.getState().info?.version;
  if (!v) return;
  const s = useSettings.getState();
  s.set({ update: { ...s.update, skip: v } });
  useUI.setState({ overlay: null });
}

let timer = 0;

/** Checks at launch (after a short delay) and every 12 hours, when enabled. */
export function startUpdateChecks() {
  if (timer) return;
  void api.updateStartup().then(
    (failed) => failed && toast("上次自动更新没有完成，LightPlayer 仍是原来的版本。请从 GitHub 下载新版本手动安装（设置 > 关于 > 所有版本）", "error", 12000),
    () => {},
  );
  const run = () => {
    if (useSettings.getState().update.auto) void checkForUpdates(false);
  };
  window.setTimeout(run, 8000);
  timer = window.setInterval(run, 12 * 3600_000);
}
