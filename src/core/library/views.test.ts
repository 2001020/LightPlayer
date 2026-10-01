import { describe, expect, it } from "vitest";
import type { LibraryData, LibraryTrack } from "../../lib/ipc";
import { derive, filterTracks, groupAlbums, playlistTracks, sortTracks, toEntry, UNKNOWN_ALBUM, UNKNOWN_ARTIST } from "./views";

let n = 0;
function t(path: string, p: Partial<LibraryTrack> = {}): LibraryTrack {
  return { path, kind: "audio", size: 1, mtime: 0, source: "folder", addedAt: n++, playCount: 0, ...p };
}

describe("library views", () => {
  const tracks = [
    t("/m/周杰伦/叶惠美/02 晴天.mp3", { title: "晴天", artist: "周杰伦", album: "叶惠美", trackNo: 2, year: 2003, duration: 269 }),
    t("/m/周杰伦/叶惠美/01 以父之名.mp3", { title: "以父之名", artist: "周杰伦", album: "叶惠美", trackNo: 1, duration: 342 }),
    t("/m/陈奕迅/U87/浮夸.flac", { title: "浮夸", artist: "陈奕迅", album: "U87" }),
    t("/m/loose/demo.mp3"),
    t("/v/clip.mkv", { kind: "video", width: 1920, height: 1080 }),
  ];
  const data: LibraryData = {
    folders: [],
    tracks,
    favorites: ["/m/陈奕迅/U87/浮夸.flac", "/gone.mp3"],
    playlists: [{ id: "a", name: "x", items: ["/m/loose/demo.mp3", "/gone.mp3", "/m/周杰伦/叶惠美/02 晴天.mp3"], createdAt: 0 }],
    excluded: [],
  };

  it("groups albums in track order with the unknown bucket last", () => {
    const albums = groupAlbums(tracks);
    expect(albums.map((a) => a.title).sort()).toEqual(["U87", "叶惠美", UNKNOWN_ALBUM].sort());
    expect(albums[albums.length - 1].title).toBe(UNKNOWN_ALBUM);
    const yhm = albums.find((a) => a.title === "叶惠美")!;
    expect(yhm.artist).toBe("周杰伦");
    expect(yhm.tracks.map((x) => x.title)).toEqual(["以父之名", "晴天"]);
    expect(yhm.year).toBe(2003);
    expect(yhm.duration).toBe(611);
  });

  it("derives artists, videos, favourites and playlists", () => {
    const d = derive(data);
    expect(d.songs).toHaveLength(4);
    expect(d.videos.map((v) => v.path)).toEqual(["/v/clip.mkv"]);
    expect(d.artists.map((a) => a.name)).toEqual(["陈奕迅", "周杰伦", UNKNOWN_ARTIST]);
    expect(d.favorites.map((f) => f.title)).toEqual(["浮夸"]);
    expect(derive(data)).toBe(d); // memoised
    expect(playlistTracks(data, "a").map((x) => x.path)).toEqual(["/m/loose/demo.mp3", "/m/周杰伦/叶惠美/02 晴天.mp3"]);
  });

  it("sorts by pinyin and filters by every word", () => {
    expect(sortTracks(tracks.slice(0, 3), "title").map((x) => x.title)).toEqual(["浮夸", "晴天", "以父之名"]);
    expect(sortTracks(tracks.slice(0, 2), "duration", true)[0].title).toBe("以父之名");
    expect(filterTracks(tracks, "周杰伦 晴").map((x) => x.title)).toEqual(["晴天"]);
    expect(filterTracks(tracks, "DEMO")).toHaveLength(1);
  });

  it("builds queue entries", () => {
    expect(toEntry(tracks[0])).toEqual({ path: tracks[0].path, fileName: "02 晴天.mp3", name: "02 晴天", kind: "audio", size: 1 });
  });
});
