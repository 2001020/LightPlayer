// Every piece of text shown in the videos. The saved copy lives in
// texts.json at the project root and is edited with `npm run editor`;
// compositions receive it as the `texts` prop.

import { createContext, useContext, useMemo } from "react";

export const DEFAULT_TEXTS = {
  version: 1,
  a: {
    opening: "听见光",
    brand: "LightPlayer",
    hero: "轻巧 也全能",
    formats1: "几乎所有格式",
    formats2: "打开就播",
    lyrics1: "每一句",
    lyrics2: "都在发光",
    vinyl1: "让唱片",
    vinyl2: "转起来",
    weather1: "窗外的天气",
    weather2: "就是主题",
    desktop: "歌词 浮于桌面之上",
    customize: "由你定义",
    endName: "LightPlayer",
    endTagline: "macOS 与 Windows",
  },
  b: {
    intro: "听见光",
    library: "你的音乐 一目了然",
    formats1: "几乎所有格式",
    formats2: "打开就播",
    lyrics1: "每一句",
    lyrics2: "都在发光",
    vinyl1: "让唱片",
    vinyl2: "转起来",
    weather: "天气 就是主题",
    desktop: "歌词 浮于桌面之上",
    customize: "由你定义",
    endName: "LightPlayer",
    endTagline: "macOS 与 Windows",
  },
  c: {
    opening: "听见光",
    hero: "轻巧 也全能",
    lyrics1: "每一句",
    lyrics2: "都在发光",
    vinyl1: "让唱片",
    vinyl2: "转起来",
    day: "天色 随时间流转",
    desktop: "歌词 浮于桌面之上",
    customize: "由你定义",
    endName: "LightPlayer",
    endTagline: "macOS 与 Windows",
  },
  /** The six songs used across all videos (covers and lengths are fixed). */
  songs: [
    { title: "夏夜微光", artist: "林间" },
    { title: "海边的信", artist: "南风" },
    { title: "慢慢来", artist: "白昼" },
    { title: "向光而行", artist: "星野" },
    { title: "晚安城市", artist: "林间" },
    { title: "第七个春天", artist: "雾岛" },
  ],
  /** The other six albums on the albums page. */
  albums: [
    { title: "山间小屋", artist: "青木" },
    { title: "雨后", artist: "空山" },
    { title: "远行", artist: "鹿鸣" },
    { title: "旧时光", artist: "北岸" },
    { title: "蓝色星球", artist: "云端" },
    { title: "落日飞行", artist: "风铃" },
  ],
  lyrics: ["晚风经过窗台", "把灯光吹成海", "你说慢一点也没关系", "我们还有整个夏天", "星星落在耳边", "旋律替我说完", "那些没讲出口的想念", "都在这首歌里面"],
  playlists: ["通勤路上", "夜晚独处", "周末慢时光"],
  /** Labels inside the rebuilt app window. `{…}` are filled in. */
  ui: {
    appName: "LightPlayer",
    fileName: "{artist} - {title}.flac",
    back: "返回",
    layout: "布局",
    discVinyl: "黑胶",
    discCover: "封面",
    formatTag: "FLAC",
    navSongs: "歌曲",
    navAlbums: "专辑",
    navArtists: "艺术家",
    navVideos: "视频",
    navFavorites: "收藏",
    navRecent: "最近播放",
    playlistsHeader: "歌单",
    manageFolders: "管理文件夹",
    albumCount: "{n} 张",
    search: "搜索标题、艺术家、专辑",
    playAll: "播放全部",
    shuffle: "随机播放",
  },
};

export type Texts = typeof DEFAULT_TEXTS;
export type VideoKey = "a" | "b" | "c";

/**
 * Takes whatever was saved (possibly from an older version, or hand-edited)
 * and returns a complete Texts: known keys keep their saved string, anything
 * missing or malformed falls back to the default. Line breaks become spaces.
 */
export function mergeTexts(saved: unknown): Texts {
  const walk = (def: unknown, val: unknown): unknown => {
    if (typeof def === "string") return typeof val === "string" ? val.replace(/\s*[\r\n]+\s*/g, " ") : def;
    if (typeof def === "number") return def;
    if (Array.isArray(def)) return def.map((d, i) => walk(d, Array.isArray(val) ? val[i] : undefined));
    const out: Record<string, unknown> = {};
    const obj = val && typeof val === "object" ? (val as Record<string, unknown>) : {};
    for (const [k, d] of Object.entries(def as Record<string, unknown>)) out[k] = walk(d, obj[k]);
    return out;
  };
  return walk(DEFAULT_TEXTS, saved) as Texts;
}

/** Reads a dotted path such as "a.opening" or "songs.2.title". */
export function getText(texts: Texts, path: string): string {
  let v: unknown = texts;
  for (const k of path.split(".")) v = (v as Record<string, unknown> | undefined)?.[k];
  return typeof v === "string" ? v : "";
}

/** Returns a copy of `texts` with the string at `path` replaced. */
export function setText(texts: Texts, path: string, value: string): Texts {
  const keys = path.split(".");
  const put = (node: unknown, i: number): unknown => {
    if (i === keys.length) return value;
    const k = keys[i];
    if (Array.isArray(node)) return node.map((n, j) => (String(j) === k ? put(n, i + 1) : n));
    const obj = node as Record<string, unknown>;
    return { ...obj, [k]: put(obj[k], i + 1) };
  };
  return put(texts, 0) as Texts;
}

/** Fills `{name}` placeholders. */
export const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/**
 * Rough advance width of a line in em. Chinese characters are one em; Latin
 * letters are estimated a little wide so the result errs on the safe side.
 */
export function textWidthEm(text: string, letterSpacingEm = 0) {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (/\s/.test(ch)) w += 0.3;
    else if (c >= 0x2e80) w += 1;
    else if (/[A-Z]/.test(ch)) w += 0.7;
    else if (/[a-z0-9]/.test(ch)) w += 0.58;
    else w += 0.36;
    w += letterSpacingEm;
  }
  return w;
}

/** The font size that keeps `text` within `maxWidth` px, never above `size`. */
export function fitSize(text: string, size: number, maxWidth: number, letterSpacingEm = 0) {
  const w = textWidthEm(text, letterSpacingEm) * size;
  return w > maxWidth ? (size * maxWidth) / w : size;
}

const TextsContext = createContext<Texts>(DEFAULT_TEXTS);

export const useTexts = () => useContext(TextsContext);

export const TextsProvider: React.FC<{ texts?: unknown; children: React.ReactNode }> = ({ texts, children }) => {
  const value = useMemo(() => mergeTexts(texts), [texts]);
  return <TextsContext.Provider value={value}>{children}</TextsContext.Provider>;
};
