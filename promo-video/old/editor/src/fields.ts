// What the editor lists, and where each text can be seen in each video.

import { DEFAULT_TEXTS, type VideoKey } from "../../src/shared/texts";
import { type VideoDef, VIDEOS } from "../../src/videos";

/** A moment to show: a scene of one video and a frame inside it (30 fps). */
export type Peek = { scene: string; frame: number };

export type Field = {
  /** Dotted path into Texts, also the `data-tk` on screen. */
  path: string;
  label: string;
  /** Suggested length; longer text still fits but gets smaller. */
  max?: number;
  hint?: string;
  where: Partial<Record<VideoKey, Peek>>;
};

export type Group = {
  id: string;
  title: string;
  note?: string;
  /** Set for headline groups that belong to one scene of one video. */
  scene?: string;
  fields: Field[];
  /** Shared groups start folded. */
  folded?: boolean;
};

const at = (key: VideoKey, scene: string, frame: number) => ({ [key]: { scene, frame } }) as Partial<Record<VideoKey, Peek>>;

// ------------------------------------------------------------------ Headlines

type Line = [key: string, label: string, frame: number, max?: number];

/** Each scene's headlines, with a frame where they are fully on screen. */
const SCENES: Record<VideoKey, [scene: string, lines: Line[]][]> = {
  a: [
    ["A1-Opening", [["opening", "标题", 100, 6]]],
    ["A2-Icon", [["brand", "名称", 112, 14]]],
    ["A3-Hero", [["hero", "标题", 62, 10]]],
    [
      "A4-Formats",
      [
        ["formats1", "第一行", 100, 8],
        ["formats2", "第二行", 100, 8],
      ],
    ],
    [
      "A5-Lyrics",
      [
        ["lyrics1", "第一行", 46, 8],
        ["lyrics2", "第二行", 46, 8],
      ],
    ],
    [
      "A6-Vinyl",
      [
        ["vinyl1", "第一行", 120, 6],
        ["vinyl2", "第二行", 120, 6],
      ],
    ],
    [
      "A7-Weather",
      [
        ["weather1", "第一行", 58, 8],
        ["weather2", "第二行", 58, 8],
      ],
    ],
    ["A8-Desktop", [["desktop", "标题", 100, 12]]],
    ["A9-Customize", [["customize", "标题", 80, 10]]],
    [
      "A10-End",
      [
        ["endName", "名称", 110, 14],
        ["endTagline", "副标题", 110, 24],
      ],
    ],
  ],
  b: [
    ["B1-Intro", [["intro", "大字", 76, 5]]],
    ["B2-Library", [["library", "标题", 50, 12]]],
    [
      "B3-Mosaic",
      [
        ["formats1", "第一行", 100, 10],
        ["formats2", "第二行", 100, 10],
      ],
    ],
    [
      "B4-Lyrics",
      [
        ["lyrics1", "第一行", 60, 5],
        ["lyrics2", "第二行", 60, 5],
      ],
    ],
    [
      "B5-Vinyl",
      [
        ["vinyl1", "第一行", 100, 5],
        ["vinyl2", "第二行", 100, 5],
      ],
    ],
    ["B6-Weather", [["weather", "标题", 90, 12]]],
    ["B7-Desktop", [["desktop", "标题", 76, 12]]],
    ["B8-Customize", [["customize", "标题", 60, 12]]],
    [
      "B9-End",
      [
        ["endName", "名称", 90, 14],
        ["endTagline", "副标题", 90, 24],
      ],
    ],
  ],
  c: [
    ["C1-Opening", [["opening", "标题", 105, 6]]],
    ["C2-Hero", [["hero", "标题", 76, 12]]],
    [
      "C3-Lyrics",
      [
        ["lyrics1", "第一行", 40, 8],
        ["lyrics2", "第二行", 40, 8],
      ],
    ],
    [
      "C4-Vinyl",
      [
        ["vinyl1", "第一行", 110, 5],
        ["vinyl2", "第二行", 110, 5],
      ],
    ],
    ["C5-Day", [["day", "标题", 80, 12]]],
    ["C6-Desktop", [["desktop", "标题", 92, 12]]],
    ["C7-Customize", [["customize", "标题", 80, 12]]],
    [
      "C8-End",
      [
        ["endName", "名称", 95, 14],
        ["endTagline", "副标题", 95, 24],
      ],
    ],
  ],
};

/** Headline groups for one video, one per scene. */
export function headlineGroups(video: VideoDef): Group[] {
  return SCENES[video.key].map(([scene, lines]) => ({
    id: scene,
    scene,
    title: video.scenes.find((s) => s.id === scene)!.label,
    fields: lines.map(([key, label, frame, max]) => ({
      path: `${video.key}.${key}`,
      label,
      max,
      where: at(video.key, scene, frame),
    })),
  }));
}

// ------------------------------------------------------------------ Shared

/** Where song `i` is easiest to see in each video. */
const songPeek = (i: number): Partial<Record<VideoKey, Peek>> => ({
  a: i === 0 ? { scene: "A3-Hero", frame: 120 } : i === 5 ? { scene: "A7-Weather", frame: 150 } : { scene: "A9-Customize", frame: 90 },
  b: i === 2 ? { scene: "B8-Customize", frame: 50 } : i === 4 ? { scene: "B2-Library", frame: 60 } : { scene: "B6-Weather", frame: 90 },
  ...(i === 0 ? at("c", "C2-Hero", 90) : i === 4 ? at("c", "C5-Day", 90) : i === 1 ? at("c", "C7-Customize", 80) : {}),
});

/** Where lyric line `i` is on screen (or closest to the middle). */
const lyricPeek = (i: number): Partial<Record<VideoKey, Peek>> => {
  const b: Peek = i <= 3 ? { scene: "B4-Lyrics", frame: Math.max(34, Math.round((i + 0.15) * 42) + 8) } : i === 4 ? { scene: "B7-Desktop", frame: 80 } : { scene: "B4-Lyrics", frame: 152 };
  const c: Peek =
    i <= 3
      ? { scene: "C3-Lyrics", frame: Math.min(168, Math.max(82, Math.round(58 + (i + 0.15) * 44))) }
      : i === 5
        ? { scene: "C6-Desktop", frame: 90 }
        : i === 4
          ? { scene: "C5-Day", frame: 70 }
          : { scene: "C7-Customize", frame: i === 6 ? 60 : 106 };
  return { a: i === 2 || i === 3 ? { scene: "A8-Desktop", frame: i === 2 ? 60 : 120 } : { scene: "A5-Lyrics", frame: 180 }, b, c };
};

const LIBRARY: Partial<Record<VideoKey, Peek>> = { a: { scene: "A9-Customize", frame: 90 }, b: { scene: "B2-Library", frame: 60 } };
const PLAYER: Partial<Record<VideoKey, Peek>> = { a: { scene: "A3-Hero", frame: 120 }, b: { scene: "B8-Customize", frame: 50 }, c: { scene: "C2-Hero", frame: 90 } };
const VINYL: Partial<Record<VideoKey, Peek>> = { a: { scene: "A9-Customize", frame: 90 }, b: { scene: "B8-Customize", frame: 100 }, c: { scene: "C7-Customize", frame: 80 } };

const UI_LABELS: [key: keyof typeof DEFAULT_TEXTS.ui, label: string, where: Partial<Record<VideoKey, Peek>>, hint?: string][] = [
  ["appName", "标题栏 App 名称", PLAYER],
  ["fileName", "标题栏文件名", PLAYER, "{artist} 换成艺术家，{title} 换成歌名"],
  ["back", "返回按钮", PLAYER],
  ["layout", "布局按钮", PLAYER],
  ["discCover", "封面模式按钮", PLAYER],
  ["discVinyl", "黑胶模式按钮", VINYL],
  ["formatTag", "格式标签", PLAYER],
  ["navSongs", "侧栏：歌曲", LIBRARY],
  ["navAlbums", "侧栏：专辑（也是页面标题）", LIBRARY],
  ["navArtists", "侧栏：艺术家", LIBRARY],
  ["navVideos", "侧栏：视频", LIBRARY],
  ["navFavorites", "侧栏：收藏", LIBRARY],
  ["navRecent", "侧栏：最近播放", LIBRARY],
  ["playlistsHeader", "侧栏：歌单标题", LIBRARY],
  ["manageFolders", "侧栏：管理文件夹", LIBRARY],
  ["albumCount", "专辑数量", LIBRARY, "{n} 换成专辑数"],
  ["search", "搜索框提示", LIBRARY],
  ["playAll", "播放全部按钮", LIBRARY],
  ["shuffle", "随机播放按钮", LIBRARY],
];

export const SHARED_GROUPS: Group[] = [
  {
    id: "songs",
    title: "歌曲",
    note: "播放页、播放栏、天气卡片和专辑墙上的六首歌",
    fields: DEFAULT_TEXTS.songs.flatMap((_, i) => [
      { path: `songs.${i}.title`, label: `第 ${i + 1} 首 歌名`, max: 10, where: songPeek(i) },
      { path: `songs.${i}.artist`, label: `第 ${i + 1} 首 艺术家`, max: 10, where: songPeek(i) },
    ]),
  },
  {
    id: "lyrics",
    title: "歌词",
    note: "滚动歌词、桌面歌词和播放页里的同一首歌词",
    fields: DEFAULT_TEXTS.lyrics.map((_, i) => ({ path: `lyrics.${i}`, label: `第 ${i + 1} 句`, max: 14, where: lyricPeek(i) })),
  },
  {
    id: "albums",
    title: "专辑墙上的其他专辑",
    folded: true,
    fields: DEFAULT_TEXTS.albums.flatMap((_, i) => [
      { path: `albums.${i}.title`, label: `专辑 ${i + 7} 名称`, max: 8, where: LIBRARY },
      { path: `albums.${i}.artist`, label: `专辑 ${i + 7} 艺术家`, max: 8, where: LIBRARY },
    ]),
  },
  {
    id: "playlists",
    title: "侧栏歌单",
    folded: true,
    fields: DEFAULT_TEXTS.playlists.map((_, i) => ({ path: `playlists.${i}`, label: `歌单 ${i + 1}`, max: 8, where: LIBRARY })),
  },
  {
    id: "ui",
    title: "界面文字",
    note: "窗口里的按钮和标签",
    folded: true,
    fields: UI_LABELS.map(([key, label, where, hint]) => ({ path: `ui.${key}`, label, hint, where })),
  },
];

/** Every field for a video: its own headlines, then the shared content. */
export const groupsFor = (video: VideoDef): Group[] => [...headlineGroups(video), ...SHARED_GROUPS];

/** Frame in the full video (30 fps) for a peek. */
export function peekFrame(video: VideoDef, peek: Peek) {
  const i = video.scenes.findIndex((s) => s.id === peek.scene);
  return i < 0 ? 0 : video.starts[i] + peek.frame;
}

export const videoByKey = (key: VideoKey) => VIDEOS.find((v) => v.key === key)!;
