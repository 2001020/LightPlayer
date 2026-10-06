// The UI language. The UI is written in Simplified Chinese; other languages
// are tables keyed by that text (src/i18n/locales/*.json), applied to the page
// by the text replacer the plugins use (src/plugins/text.ts), with plugin
// string tables on top. `tr` is for text that never reaches the page (native
// dialogs, the menu bar menu). scripts/i18n.mjs finds strings a table lacks.

import { useSyncExternalStore } from "react";
import { compileStrings, translate, type StringTable } from "../plugins/text";

export type Lang = "zh-Hans" | "zh-Hant" | "en" | "ja" | "ko";
export type LangSetting = "auto" | Lang;

/** The languages offered, named in themselves. */
export const LANGS: { id: Lang; name: string }[] = [
  { id: "zh-Hans", name: "简体中文" },
  { id: "zh-Hant", name: "繁體中文" },
  { id: "en", name: "English" },
  { id: "ja", name: "日本語" },
  { id: "ko", name: "한국어" },
];

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.id === v);
export const isLangSetting = (v: unknown): v is LangSetting => v === "auto" || isLang(v);

/** The language the system prefers, among ours (English for any other). */
export function systemLang(prefs: readonly string[] = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : []): Lang {
  for (const raw of prefs) {
    const p = raw.toLowerCase();
    if (p.startsWith("zh")) return /hant|tw|hk|mo/.test(p) ? "zh-Hant" : "zh-Hans";
    if (p.startsWith("ja")) return "ja";
    if (p.startsWith("ko")) return "ko";
    if (p.startsWith("en")) return "en";
  }
  return "en";
}

export function resolveLang(setting: LangSetting): Lang {
  return setting === "auto" ? systemLang() : setting;
}

let current: Lang = "zh-Hans";
let table: StringTable | null = null;

export const lang = () => current;

/** The language tag for Intl formatting. */
export function locale(l: Lang = current): string {
  return l === "zh-Hans" ? "zh-CN" : l === "zh-Hant" ? "zh-TW" : l;
}

let version = 0;
const listeners = new Set<() => void>();

/** Called by the runtime once the tables are loaded. */
export function setActiveStrings(l: Lang, merged: Record<string, string> | null) {
  current = l;
  table = merged && Object.keys(merged).length ? compileStrings(merged) : null;
  if (typeof document !== "undefined") document.documentElement.lang = l;
  version++;
  for (const f of listeners) f();
}

/** Re-renders when the language (or a plugin's strings) changes, for text made in code. */
export function useUILang(): Lang {
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => version,
  );
  return current;
}

/** Joins parts of a line the way the language lists them (translating each). */
export function joinParts(xs: (string | number | false | null | undefined)[]): string {
  const sep = current.startsWith("zh") ? "，" : current === "ja" ? "、" : ", ";
  return xs
    .filter((x) => x !== false && x !== null && x !== undefined && x !== "" && x !== 0)
    .map((x) => tr(String(x)))
    .join(sep);
}

/** `text` in the UI language (the same replacement the page gets). */
export function tr(text: string): string {
  return table ? translate(table, text) ?? text : text;
}

const loaders = import.meta.glob<{ default: Record<string, string> }>("./locales/*.json");

/** A language's table (empty for Simplified Chinese, the source). */
export async function loadLocale(l: Lang): Promise<Record<string, string>> {
  const load = loaders[`./locales/${l}.json`];
  if (!load) return {};
  try {
    return (await load()).default;
  } catch {
    return {};
  }
}

/**
 * Release notes are Chinese, then English after `<!-- en -->`
 * (.github/workflows/build-macos.yml); the part for the UI language.
 */
export function releaseNotesFor(text: string, l: Lang = current): string {
  const mark = "<!-- en -->";
  const i = text.indexOf(mark);
  if (i < 0) return text;
  const zh = text.slice(0, i).trim();
  const en = text
    .slice(i + mark.length)
    .replace(/^\s*---\s*/, "")
    .trim();
  return l.startsWith("zh") ? zh : en;
}

// ------------------------------------------------------------------ formatting

const cap = (s: string) => s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);

/** "today", "yesterday" in the UI language. */
export function relativeDay(days: 0 | -1): string {
  return cap(new Intl.RelativeTimeFormat(locale(), { numeric: "auto" }).format(days, "day"));
}

/** Month and day (and the year when `year`), e.g. 3月8日, Mar 8. */
export function monthDay(d: Date, year = false): string {
  return new Intl.DateTimeFormat(locale(), { year: year ? "numeric" : undefined, month: current === "en" ? "short" : "long", day: "numeric" }).format(d);
}

/** Month, day and weekday, e.g. 10月6日星期二, Tuesday, October 6. */
export function longDate(d: Date): string {
  return new Intl.DateTimeFormat(locale(), { month: "long", day: "numeric", weekday: "long" }).format(d);
}

/** A short count: 9999, 1.2万, 1.2K. */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
