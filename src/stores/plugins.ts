// Installed plugins, which are on (in cascade order), their option values and
// the app settings their `config` changed (restored when turned off).

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api, isTauri, type PluginEntry, type PluginManifest, type PluginOptionValue } from "../lib/ipc";
import { getPath, patchPath, pluginConfig, sameValue, versionAtLeast } from "../plugins/manifest";
import { useSettings } from "./settings";

/** A config key a plugin set: what it was before and what the plugin wrote. */
interface ConfigChange {
  before: unknown;
  applied: unknown;
}

interface PluginsState {
  /** On, in cascade order (later ones win). */
  enabled: string[];
  options: Record<string, Record<string, PluginOptionValue>>;
  changes: Record<string, Record<string, ConfigChange>>;
  /** Bumped on install / remove / reload so other windows and caches refresh. */
  rev: number;
  /** Not persisted: */
  installed: PluginEntry[] | null;
  /** Load errors found while applying (a style sheet or string table failed). */
  errors: Record<string, string>;
  /** Every plugin off for this run (⌥⇧⌘P). */
  safeMode: boolean;
}

const memoryStorage = () => {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
};

export const usePlugins = create<PluginsState>()(
  persist(
    (): PluginsState => ({
      enabled: [],
      options: {},
      changes: {},
      rev: 0,
      installed: null,
      errors: {},
      safeMode: false,
    }),
    {
      name: "lightplayer-plugins",
      version: 1,
      partialize: (s) => ({ enabled: s.enabled, options: s.options, changes: s.changes, rev: s.rev }),
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return memoryStorage();
        }
      }),
    },
  ),
);

export const PLUGINS_CHANGED = "lightplayer://plugins-changed";
/** Identifies this window's own broadcasts. */
export const WINDOW_TOKEN = Math.random().toString(36).slice(2);

/** Tells the other window (desktop lyrics) to pick up the change. */
async function broadcast() {
  if (!isTauri) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(PLUGINS_CHANGED, WINDOW_TOKEN);
  } catch {
    /* the other window also follows localStorage */
  }
}

/** A plugin can be turned on: valid and made for this version. */
export function usable(p: PluginEntry | undefined): p is PluginEntry & { manifest: PluginManifest } {
  return !!p?.manifest && !p.error && !p.incompatible && versionAtLeast(__APP_VERSION__, p.manifest.minAppVersion ?? "0");
}

export async function refreshPlugins(clearErrors = false) {
  try {
    const installed = await api.pluginsList();
    usePlugins.setState((s) => ({ installed, errors: clearErrors ? {} : s.errors }));
  } catch (e) {
    usePlugins.setState({ installed: [] });
    console.error("plugins", e);
  }
}

function applyConfig(id: string, m: PluginManifest) {
  const config = pluginConfig(m);
  const keys = Object.keys(config);
  if (!keys.length) return;
  const settings = useSettings.getState();
  const changes: Record<string, ConfigChange> = {};
  let patch: Record<string, unknown> = {};
  for (const k of keys) {
    changes[k] = { before: getPath(settings, k), applied: config[k] };
    patch = { ...patch, ...patchPath({ ...settings, ...patch }, k, config[k]) };
  }
  settings.set(patch);
  usePlugins.setState((s) => ({ changes: { ...s.changes, [id]: changes } }));
}

/** Puts back the settings a plugin changed, unless the user changed them since. */
function revertConfig(id: string) {
  const changes = usePlugins.getState().changes[id];
  if (!changes) return;
  const settings = useSettings.getState();
  let patch: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(changes)) {
    if (sameValue(getPath(settings, k), c.applied)) patch = { ...patch, ...patchPath({ ...settings, ...patch }, k, c.before) };
  }
  if (Object.keys(patch).length) settings.set(patch);
  usePlugins.setState((s) => {
    const rest = { ...s.changes };
    delete rest[id];
    return { changes: rest };
  });
}

export function setPluginEnabled(id: string, on: boolean) {
  const s = usePlugins.getState();
  const entry = s.installed?.find((p) => p.id === id);
  if (on === s.enabled.includes(id)) return;
  if (on) {
    if (!usable(entry)) return;
    usePlugins.setState({ enabled: [...s.enabled, id] });
    applyConfig(id, entry.manifest);
  } else {
    usePlugins.setState({ enabled: s.enabled.filter((x) => x !== id) });
    revertConfig(id);
  }
  void broadcast();
}

/** Moves an enabled plugin up (-1) or down (+1) the cascade. */
export function movePlugin(id: string, by: -1 | 1) {
  const list = [...usePlugins.getState().enabled];
  const i = list.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  usePlugins.setState({ enabled: list });
  void broadcast();
}

export function setPluginOption(id: string, option: string, value: PluginOptionValue) {
  usePlugins.setState((s) => ({ options: { ...s.options, [id]: { ...s.options[id], [option]: value } } }));
  void broadcast();
}

export function resetPluginOptions(id: string) {
  usePlugins.setState((s) => {
    const options = { ...s.options };
    delete options[id];
    return { options };
  });
  void broadcast();
}

/** Re-reads the plugin folders and style sheets (after editing a plugin). */
export async function reloadPlugins() {
  usePlugins.setState((s) => ({ rev: s.rev + 1 }));
  await refreshPlugins(true);
  void broadcast();
}

/** Installs a folder or package; returns the plugin id. `replace` overwrites one already installed. */
export async function installPlugin(path: string, replace: boolean): Promise<string> {
  const id = await api.pluginInstall(path, replace);
  await reloadPlugins();
  return id;
}

export async function removePlugin(id: string) {
  setPluginEnabled(id, false);
  await api.pluginRemove(id);
  resetPluginOptions(id);
  await reloadPlugins();
}

export function setSafeMode(on: boolean) {
  usePlugins.setState({ safeMode: on });
}

export function setPluginError(id: string, error: string) {
  usePlugins.setState((s) => (s.errors[id] === error ? s : { errors: { ...s.errors, [id]: error } }));
}
