// Pretend songs for the video: original titles, artists and lyrics.

export type Song = { title: string; artist: string; cover: number; duration: number };

export const SONGS: Song[] = [
  { title: "夏夜微光", artist: "林间", cover: 0, duration: 252 },
  { title: "海边的信", artist: "南风", cover: 1, duration: 228 },
  { title: "慢慢来", artist: "白昼", cover: 2, duration: 201 },
  { title: "向光而行", artist: "星野", cover: 3, duration: 245 },
  { title: "晚安城市", artist: "林间", cover: 4, duration: 236 },
  { title: "第七个春天", artist: "雾岛", cover: 5, duration: 270 },
];

export const LYRICS = [
  "晚风经过窗台",
  "把灯光吹成海",
  "你说慢一点也没关系",
  "我们还有整个夏天",
  "星星落在耳边",
  "旋律替我说完",
  "那些没讲出口的想念",
  "都在这首歌里面",
];

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
