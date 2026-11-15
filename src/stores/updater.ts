// Updates from GitHub Releases: check, download with progress (in the window
// or in the background), then install once the user says so.

import { create } from "zustand";
import { api, isTauri, on, type AppInfo, type UpdateInfo } from "../lib/ipc";
import { toast, useUI } from "./player";
import { useSettings } from "./settings";

/**
 * speed: bytes per second; connections: several when aria2 downloads;
 * restarted: the download broke off and a single connection started over;
 * sources: sites downloaded from at once; host: the site when there is one.
 */
export type UpdateProgress = {
  received: number;
  total: number;
  speed?: number;
  connections?: number;
  restarted?: boolean;
  sources?: number;
  host?: string;
};

/** ready: downloaded, waiting for the user to install. */
export type UpdateStatus = "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "installing" | "error";

/** Mirrors of GitHub's downloads (the same list as the app's updater). */
export const UPDATE_MIRRORS = ["ghfast.top", "gh-proxy.com", "ghproxy.net", "gh-proxy.org"];

interface UpdaterState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  /** The downloaded file, once status is "ready". */
  file: string | null;
  /** Date.now() of the last finished check. */
  checkedAt: number | null;
  app: AppInfo | null;
}

export const useUpdater = create<UpdaterState>(() => ({
  status: "idle",
  info: null,
  progress: null,
  error: null,
  file: null,
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
  if (s.status === "checking" || s.status === "downloading" || s.status === "ready" || s.status === "installing") return;
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

/** The update window is not open (it was sent to the background or closed). */
const inBackground = () => useUI.getState().overlay !== "update";

/** Brings up the update window when nothing else is in the way. */
function showUpdateWindow(): boolean {
  const ui = useUI.getState();
  if (ui.overlay === "update") return true;
  if (ui.overlay || ui.fullscreen) return false;
  useUI.setState({ overlay: "update" });
  return true;
}

/**
 * Downloads the found update. It keeps going when the window is closed
 * ("后台下载"); once done, the window asks before installing.
 */
export async function startUpdate(): Promise<void> {
  const { info, status } = useUpdater.getState();
  if (!info || status === "downloading" || status === "ready" || status === "installing") return;
  if (!info.asset || info.kind === "manual") {
    await openReleasePage(info.page);
    return;
  }
  useUpdater.setState({ status: "downloading", progress: { received: 0, total: info.asset.size }, error: null, file: null });
  const off = await on<UpdateProgress>("update://progress", (p) => useUpdater.setState({ progress: p }));
  let path: string;
  try {
    path = await api.updateDownload(info.asset, useSettings.getState().update.source || "auto");
  } catch (e) {
    const cancelled = String(e).includes("已取消");
    useUpdater.setState({ status: "available", progress: null, error: cancelled ? null : `下载失败：${String(e)}` });
    if (!cancelled && inBackground()) toast(`新版本下载失败：${String(e)}`, "error", 8000);
    return;
  } finally {
    off();
  }
  useUpdater.setState({ status: "ready", file: path, progress: null });
  if (inBackground() && !showUpdateWindow()) toast(`LightPlayer ${info.version} 已下载完成，点击标题栏的更新按钮安装`, "success", 8000);
}

/** Installs the downloaded update: the app quits and restarts as the new version. */
export async function installUpdate(): Promise<void> {
  const { file, status } = useUpdater.getState();
  if (!file || status !== "ready") return;
  useUpdater.setState({ status: "installing", error: null });
  try {
    await api.updateInstall(file);
  } catch (e) {
    useUpdater.setState({ status: "ready", error: `安装失败：${String(e)}` });
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
