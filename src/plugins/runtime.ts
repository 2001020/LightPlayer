// Applies the enabled plugins to this window: their style sheets (linked after
// the app's own, in cascade order), fonts, option variables and classes on
// <html>, and string tables. Runs in the main and the desktop lyrics window;
// only what changed is touched, so options update live.

import { isTauri, on, pluginBaseUrl, type PluginManifest } from "../lib/ipc";
import { PLUGINS_CHANGED, WINDOW_TOKEN, refreshPlugins, setPluginError, usable, usePlugins } from "../stores/plugins";
import { optionEffects } from "./manifest";
import { checkLayout, type PlayerLayout } from "../layout/model";
import { setPluginLayouts } from "../stores/layout";
import { TextReplacer } from "./text";

const LINK_ATTR = "data-plugin";

interface Active {
  id: string;
  manifest: PluginManifest;
  base: string;
}

let replacer: TextReplacer | null = null;
let classes: string[] = [];
let stylesKey = "";
let stringsKey = "";
let generation = 0;
let layoutsKey = "";
let layoutGeneration = 0;

function styleEl(name: string): HTMLStyleElement {
  let el = document.head.querySelector<HTMLStyleElement>(`style[${LINK_ATTR}="${name}"]`);
  if (!el) {
    el = document.createElement("style");
    el.setAttribute(LINK_ATTR, name);
    document.head.appendChild(el);
  }
  return el;
}

const cssString = (s: string) => `"${s.replace(/["\\\n]/g, "")}"`;

function fileUrl(base: string, path: string, rev: number) {
  return `${base}${path.split("/").map(encodeURIComponent).join("/")}?v=${rev}`;
}

/** The style sheet links, fonts and variables (in this order, after the app's CSS). */
function applyStyles(active: Active[], rev: number) {
  const key = JSON.stringify([rev, active.map((a) => [a.id, a.manifest.styles, a.manifest.fonts])]);
  if (key !== stylesKey) {
    stylesKey = key;
    document.head.querySelectorAll(`link[${LINK_ATTR}]`).forEach((l) => l.remove());
    const fonts: string[] = [];
    for (const a of active) {
      for (const f of a.manifest.fonts ?? []) {
        const weight = f.weight !== undefined ? `font-weight: ${String(f.weight).replace(/[^\w ]/g, "")};` : "";
        const style = f.style ? `font-style: ${f.style.replace(/[^\w ]/g, "")};` : "";
        fonts.push(`@font-face { font-family: ${cssString(f.family)}; src: url(${cssString(fileUrl(a.base, f.src, rev))}); ${weight} ${style} font-display: swap; }`);
      }
      for (const s of a.manifest.styles ?? []) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = fileUrl(a.base, s, rev);
        link.setAttribute(LINK_ATTR, a.id);
        link.onerror = () => setPluginError(a.id, `无法加载样式表 ${s}`);
        document.head.appendChild(link);
      }
    }
    styleEl("fonts").textContent = fonts.join("\n");
  }
  // Variables and classes follow the style sheets so they can be read there.
  const s = usePlugins.getState();
  const vars: string[] = [];
  const next: string[] = [];
  for (const a of active) {
    const fx = optionEffects(a.manifest, s.options[a.id]);
    for (const [k, v] of fx.vars) vars.push(`  ${k}: ${v};`);
    next.push(...fx.classes);
  }
  const varsEl = styleEl("options");
  const css = vars.length ? `:root {\n${vars.join("\n")}\n}` : "";
  if (varsEl.textContent !== css) varsEl.textContent = css;
  document.head.appendChild(varsEl);
  const root = document.documentElement;
  for (const c of classes) if (!next.includes(c)) root.classList.remove(c);
  for (const c of next) root.classList.add(c);
  classes = next;
}

async function loadStrings(a: Active, rev: number): Promise<Record<string, string>> {
  const src = a.manifest.strings;
  if (!src) return {};
  if (typeof src === "object") return src;
  try {
    const r = await fetch(fileUrl(a.base, src, rev));
    if (!r.ok) throw new Error(String(r.status));
    const table = await r.json();
    if (!table || typeof table !== "object" || Array.isArray(table)) throw new Error("not an object");
    return table as Record<string, string>;
  } catch {
    setPluginError(a.id, `无法加载文字替换表 ${src}`);
    return {};
  }
}

async function applyStrings(active: Active[], rev: number) {
  const key = JSON.stringify([rev, active.map((a) => [a.id, a.manifest.strings])]);
  if (key === stringsKey) return;
  stringsKey = key;
  const gen = ++generation;
  const tables = await Promise.all(active.map((a) => loadStrings(a, rev)));
  if (gen !== generation) return;
  // Later plugins win, like their style sheets.
  const merged: Record<string, string> = Object.assign({}, ...tables);
  replacer ??= new TextReplacer(document.body);
  replacer.set(Object.keys(merged).length ? merged : null);
}

/** Player page layouts the plugins ship (`layouts`), offered in the layout menu. */
async function applyLayouts(active: Active[], rev: number) {
  // Only the main window has a player page. (Writing the layout store from the
  // desktop lyrics window would also save its stale copy of the user's layouts.)
  if (document.documentElement.dataset.window !== "main") return;
  const key = JSON.stringify([rev, active.map((a) => [a.id, a.manifest.layouts])]);
  if (key === layoutsKey) return;
  layoutsKey = key;
  const gen = ++layoutGeneration;
  const out: PlayerLayout[] = [];
  for (const a of active) {
    for (const [i, file] of (a.manifest.layouts ?? []).entries()) {
      try {
        const r = await fetch(fileUrl(a.base, file, rev));
        if (!r.ok) throw new Error(String(r.status));
        const l = checkLayout(await r.json(), "", a.id);
        if (!l) throw new Error("invalid");
        out.push({ ...l, id: `plugin:${a.id}:${i}` });
      } catch {
        setPluginError(a.id, `无法加载布局 ${file}`);
      }
    }
  }
  if (gen === layoutGeneration) setPluginLayouts(out);
}

async function apply() {
  const s = usePlugins.getState();
  const ids = s.safeMode || !s.installed ? [] : s.enabled;
  const active: Active[] = [];
  for (const id of ids) {
    const entry = s.installed?.find((p) => p.id === id);
    if (usable(entry)) active.push({ id, manifest: entry.manifest, base: await pluginBaseUrl(id) });
  }
  applyStyles(active, s.rev);
  await Promise.all([applyStrings(active, s.rev), applyLayouts(active, s.rev)]);
}

let started = false;

export function startPlugins() {
  if (started) return;
  started = true;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      void apply();
    });
  };
  usePlugins.subscribe((s, prev) => {
    if (s.enabled !== prev.enabled || s.options !== prev.options || s.installed !== prev.installed || s.safeMode !== prev.safeMode || s.rev !== prev.rev) schedule();
  });
  void refreshPlugins();
  // The other window changed something.
  const sync = async () => {
    await usePlugins.persist.rehydrate();
    await refreshPlugins();
  };
  window.addEventListener("storage", (e) => {
    if (e.key === usePlugins.persist.getOptions().name) void sync();
  });
  if (isTauri) void on<string>(PLUGINS_CHANGED, (from) => from !== WINDOW_TOKEN && void sync());
}
