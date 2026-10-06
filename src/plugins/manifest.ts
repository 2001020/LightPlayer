// Plugin options and config: the parts of a manifest the runtime and the
// settings page turn into CSS variables, <html> classes and app settings.
// The backend checks manifests in full (src-tauri/src/plugins.rs); these
// helpers only coerce values defensively.

import type { PluginManifest, PluginOption, PluginOptionValue } from "../lib/ipc";

const IDENT = /^[A-Za-z_][\w-]{0,63}$/;
const VAR = /^--[A-Za-z_][\w-]{0,62}$/;
const COLOR = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

export const validClass = (c: unknown): c is string => typeof c === "string" && IDENT.test(c);
export const validVar = (v: unknown): v is string => typeof v === "string" && VAR.test(v);
export const validColor = (v: unknown): v is string => typeof v === "string" && COLOR.test(v);

/** `1.6.0` → [1, 6, 0]; a pre-release suffix (`b1`, `-beta`) is ignored. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

export function versionAtLeast(have: string, need: string): boolean {
  const a = parseVersion(have);
  const b = parseVersion(need);
  if (!a || !b) return true;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

/** An option's value: the saved one when it fits the option, else its default. */
export function optionValue(o: PluginOption, saved: PluginOptionValue | undefined): PluginOptionValue {
  const v = saved ?? o.default;
  switch (o.type) {
    case "range": {
      const n = typeof v === "number" && Number.isFinite(v) ? v : Number(o.default);
      return Math.min(o.max ?? n, Math.max(o.min ?? n, n));
    }
    case "color":
      return validColor(v) ? v : String(o.default);
    case "toggle":
      return typeof v === "boolean" ? v : !!o.default;
    case "select":
      return o.choices?.some((c) => c.value === v) ? v : String(o.default);
  }
}

/** The CSS variables and <html> classes a plugin's options produce. */
export function optionEffects(m: PluginManifest, saved: Record<string, PluginOptionValue> | undefined) {
  const vars: [string, string][] = [];
  const classes: string[] = [];
  for (const o of m.options ?? []) {
    const v = optionValue(o, saved?.[o.id]);
    if (validVar(o.var)) {
      const css = o.type === "range" ? `${v}${o.unit ?? ""}` : o.type === "toggle" ? (v ? "1" : "0") : String(v);
      // Values come from the manifest or a color/number input; keep them to one declaration.
      if (!/[;{}<>]/.test(css)) vars.push([o.var, css]);
    }
    if (o.type === "toggle" && v && validClass(o.class)) classes.push(o.class);
    if (o.type === "select") {
      const c = o.choices?.find((c) => c.value === v)?.class;
      if (validClass(c)) classes.push(c);
    }
  }
  return { vars, classes };
}

/** App settings a plugin may set (`config`), with the values each accepts. */
export const CONFIG_KEYS: Record<string, (v: unknown) => boolean> = {
  theme: (v) => ["system", "light", "dark", "weather"].includes(v as string),
  accent: validColor,
  dynamicAccent: (v) => typeof v === "boolean",
  coverBackground: (v) => typeof v === "boolean",
  playerStyle: (v) => v === "classic" || v === "flow",
  lyricFontSize: (v) => typeof v === "number" && v >= 14 && v <= 56,
  lyricAlign: (v) => v === "center" || v === "left",
  showTranslation: (v) => typeof v === "boolean",
  karaoke: (v) => typeof v === "boolean",
  lyricHighlight: (v) => v === null || validColor(v),
  "desktopLyrics.color": validColor,
};

/** The usable entries of a plugin's `config`. */
export function pluginConfig(m: PluginManifest): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m.config ?? {})) if (CONFIG_KEYS[k]?.(v)) out[k] = v;
  return out;
}

/** Reads a dotted key ("desktopLyrics.color") from an object. */
export function getPath(obj: object, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** A partial update setting a dotted key, keeping the siblings of nested objects. */
export function patchPath(obj: object, key: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = key.split(".");
  if (!rest.length) return { [head]: value };
  const inner = (obj as Record<string, unknown>)[head];
  return { [head]: { ...(inner as object), ...patchPath((inner as object) ?? {}, rest.join("."), value) } };
}

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
