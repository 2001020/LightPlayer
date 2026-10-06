// Collects the UI text in the source (Simplified Chinese, the language the UI
// is written in) and checks the locale tables in src/i18n/locales.
//
//   node scripts/i18n.mjs          lists the strings each locale lacks
//   node scripts/i18n.mjs --keys   prints every string found, as JSON
//   node scripts/i18n.mjs --hant   adds the missing Traditional Chinese
//                                  strings (OpenCC, Taiwan usage) and drops
//                                  strings no longer in the source from all
//                                  tables; hand edits are kept
//
// Text is found where it is written: string and template literals, string
// concatenations, and JSX text. A template's `${…}` parts and a JSX element's
// `{…}` parts become placeholders {a}, {b}, … (the form the text replacer in
// src/plugins/text.ts matches), so `已添加 ${n} 首` is the key `已添加 {a} 首`.
// Rust strings that reach the UI (errors, mostly) are collected too; their
// format! arguments become placeholders the same way.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
export const LOCALES = ["zh-Hant", "en", "ja", "ko"];
const CJK = /[㐀-鿿豈-﫿]/;
const NAMES = "abcdefghijklmnopqrstuvwxyz";

/** The text with `i18n-ignore-start` … `i18n-ignore-end` regions blanked (same length, so offsets hold). */
function unignored(text) {
  return text.replace(/i18n-ignore-start[\s\S]*?i18n-ignore-end/g, (m) => m.replace(/[^\n]/g, " "));
}

function walk(dir, ok, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ok, out);
    else if (ok(p)) out.push(p);
  }
  return out;
}

const norm = (s) => s.replace(/\s+/g, " ").trim();

/** React's JSX text rule: lines are trimmed, blank ones dropped, the rest joined by a space. */
function jsxText(raw) {
  if (!raw.includes("\n")) return raw;
  const lines = raw.split(/\r?\n/);
  const kept = lines
    .map((l, i) => {
      let s = l.replace(/\t/g, " ");
      if (i > 0) s = s.replace(/^\s+/, "");
      if (i < lines.length - 1) s = s.replace(/\s+$/, "");
      return s;
    })
    .filter((s) => s !== "");
  return kept.join(" ");
}

/** The source files whose text is UI text. */
function tsFiles() {
  return walk(join(ROOT, "src"), (p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) && !p.includes(`${sep}__tests__${sep}`) && !p.includes(`${sep}i18n${sep}`) && !p.endsWith(".d.ts"));
}

const SKIP_CALLS = new Set(["console.log", "console.warn", "console.error", "console.debug", "console.info"]);

function calleeName(n) {
  const e = n.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return `${e.expression.getText()}.${e.name.text}`;
  return "";
}

/** Strings found in one TS/TSX file: key → true. */
function extractTsFile(file, add) {
  const raw = readFileSync(file, "utf8");
  const ignored = [...raw.matchAll(/i18n-ignore-start[\s\S]*?i18n-ignore-end/g)].map((m) => [m.index, m.index + m[0].length]);
  const text = raw;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const where = relative(ROOT, file);

  /** A + chain or template as a key, or null when it holds no literal text. */
  const concat = (n) => {
    const parts = [];
    const flat = (x) => {
      if (ts.isParenthesizedExpression(x)) return flat(x.expression);
      if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        flat(x.left);
        flat(x.right);
      } else parts.push(x);
    };
    flat(n);
    let key = "";
    let k = 0;
    let lit = false;
    for (const p of parts) {
      if (ts.isStringLiteral(p) || ts.isNoSubstitutionTemplateLiteral(p)) {
        key += p.text;
        lit = true;
      } else if (ts.isTemplateExpression(p)) {
        key += p.head.text;
        for (const s of p.templateSpans) key += `{${NAMES[k++ % 26]}}` + s.literal.text;
        lit = true;
      } else key += `{${NAMES[k++ % 26]}}`;
    }
    return lit ? key : null;
  };

  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    const at = n.getStart(sf);
    if (ignored.some(([a, b]) => at >= a && at < b)) {
      ts.forEachChild(n, visit);
      return;
    }
    if (ts.isCallExpression(n) && SKIP_CALLS.has(calleeName(n))) return;
    // Concatenations and templates as a whole (one text node when rendered).
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && !(ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      const key = concat(n);
      if (key && CJK.test(key)) add(key, where);
    } else if (ts.isTemplateExpression(n)) {
      const key = concat(n);
      if (key && CJK.test(key)) add(key, where);
    } else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (CJK.test(n.text)) add(n.text, where);
    } else if (ts.isJsxText(n)) {
      const t = jsxText(n.text);
      if (CJK.test(t)) add(t, where);
    }
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      // An element holding only text and {expressions} renders only text nodes,
      // which the replacer matches joined.
      const kids = n.children;
      if (kids.length > 1 && kids.every((c) => ts.isJsxText(c) || ts.isJsxExpression(c))) {
        let key = "";
        let k = 0;
        for (const c of kids) {
          if (ts.isJsxText(c)) key += jsxText(c.text);
          else if (!c.expression) continue;
          else if (ts.isStringLiteral(c.expression)) key += c.expression.text;
          else key += `{${NAMES[k++ % 26]}}`;
        }
        if (CJK.test(key)) add(norm(key), where);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/** Rust files whose strings can reach the UI. */
function rustFiles() {
  return walk(join(ROOT, "src-tauri", "src"), (p) => p.endsWith(".rs") && !/asr[\\/]postprocess\.rs$/.test(p) && !/lyrics[\\/]encoding\.rs$/.test(p));
}

function extractRustFile(file, add) {
  let text = unignored(readFileSync(file, "utf8"));
  // Tests are not UI.
  const t = text.search(/#\[cfg\(test\)\]\s*mod tests/);
  if (t >= 0) text = text.slice(0, t);
  const where = relative(ROOT, file);
  // Plain string literals (no raw strings with CJK in this code base).
  const re = /"((?:[^"\\\n]|\\.)*)"/g;
  for (const m of text.matchAll(re)) {
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    const line = text.slice(lineStart, m.index);
    if (/^\s*\/\//.test(line) || /\/\/[^"]*$/.test(line)) continue;
    let s = m[1];
    if (!CJK.test(s)) continue;
    s = s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    let k = 0;
    s = s.replace(/\{\{|\}\}|\{(\w*)(:[^}]*)?\}/g, (all, name) => {
      if (all === "{{") return "{";
      if (all === "}}") return "}";
      // Named arguments keep their name; positional ones ({}, {0}) become letters.
      return name && !/^\d/.test(name) ? `{${name}}` : `{${NAMES[k++ % 26]}}`;
    });
    add(s, where);
  }
}

/** Every UI string: key → files it is in. */
export function extractKeys() {
  const keys = new Map();
  const add = (k, where) => {
    const key = norm(k);
    if (!key || !CJK.test(key)) return;
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key).add(where);
  };
  for (const f of tsFiles()) extractTsFile(f, add);
  for (const f of rustFiles()) extractRustFile(f, add);
  return new Map([...keys.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function loadLocale(lang) {
  const p = join(ROOT, "src", "i18n", "locales", `${lang}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

/** Keys a locale lacks, and placeholders its translations lose or invent. */
export function checkLocale(lang, keys = extractKeys()) {
  const table = loadLocale(lang);
  const missing = [...keys.keys()].filter((k) => typeof table[k] !== "string");
  const badPlaceholders = [];
  const ph = (s) => [...s.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]).sort().join(",");
  for (const [k, v] of Object.entries(table)) if (typeof v === "string" && ph(k) !== ph(v)) badPlaceholders.push(k);
  return { missing, badPlaceholders };
}

/** Taiwan usage OpenCC's phrase table does not cover (applied after it). */
const HANT_FIXES = [
  ["播放列表", "播放清單"],
  ["預釋出", "預發行"],
  ["釋出", "發布"],
  ["訪達", "Finder"],
  ["廢紙簍", "垃圾桶"],
  ["回收站", "資源回收筒"],
  ["檔案資源管理器", "檔案總管"],
  ["全屏", "全螢幕"],
  ["快捷鍵", "快速鍵"],
  ["賬號", "帳號"],
  ["粘貼", "貼上"],
  ["搜索", "搜尋"],
  ["進度條", "進度列"],
  ["識別", "辨識"],
  ["本地", "本機"],
  ["選單欄", "選單列"],
  ["菜單欄", "選單列"],
  ["後臺", "背景"],
  ["映象", "鏡像"],
  ["回車", "Enter"],
  ["“", "「"],
  ["”", "」"],
  ["‘", "『"],
  ["’", "』"],
];

function writeLocale(lang, table) {
  const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(join(ROOT, "src", "i18n", "locales", `${lang}.json`), JSON.stringify(sorted, null, 2) + "\n");
}

async function updateHant(keys) {
  const { Converter } = (await import("opencc-js")).default ?? (await import("opencc-js"));
  const convert = Converter({ from: "cn", to: "twp" });
  for (const lang of LOCALES) {
    const table = loadLocale(lang);
    for (const k of Object.keys(table)) if (!keys.has(k)) delete table[k];
    if (lang === "zh-Hant") {
      for (const k of keys.keys()) {
        if (typeof table[k] === "string") continue;
        let v = convert(k);
        for (const [a, b] of HANT_FIXES) v = v.split(a).join(b);
        table[k] = v;
      }
    }
    writeLocale(lang, table);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const keys = extractKeys();
  if (process.argv.includes("--hant")) {
    await updateHant(keys);
    console.log("updated src/i18n/locales");
  } else if (process.argv.includes("--keys")) {
    console.log(JSON.stringify(Object.fromEntries([...keys].map(([k, v]) => [k, [...v]])), null, 1));
  } else {
    let bad = 0;
    for (const lang of LOCALES) {
      const { missing, badPlaceholders } = checkLocale(lang, keys);
      console.log(`${lang}: ${keys.size - missing.length}/${keys.size} translated${badPlaceholders.length ? `, ${badPlaceholders.length} with wrong placeholders` : ""}`);
      for (const k of missing.slice(0, 20)) console.log(`  missing: ${k}`);
      for (const k of badPlaceholders.slice(0, 20)) console.log(`  placeholders: ${k}`);
      bad += missing.length + badPlaceholders.length;
    }
    process.exit(bad ? 1 : 0);
  }
}
