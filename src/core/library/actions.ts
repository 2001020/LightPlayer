// Library actions shared by the views: playing a view as the queue and the
// right-click menu for tracks.

import * as C from "../controller";
import { shuffled } from "../playlist/queue";
import { api, isCloudPath, isTauri, type LibraryTrack } from "../../lib/ipc";
import { confirmDialog } from "../../lib/confirm";
import { stem } from "../../lib/format";
import { libraryAction, useLibrary } from "../../stores/library";
import { toast, usePlayer, usePlaylist } from "../../stores/player";
import { openMenu, sep, type MenuItem } from "../../components/ContextMenu";
import { promptText } from "../../components/Prompt";
import { engine } from "../player/engine";
import { toEntry, trackTitle, type Album } from "./views";
import { FILE_MANAGER, TRASH } from "../../lib/platform";

/** Plays `tracks[index]` with the whole list as the queue. */
export function playTracks(tracks: LibraryTrack[], index: number, source: string) {
  void C.playList(tracks.map(toEntry), index, source);
}

export function shuffleTracks(tracks: LibraryTrack[], source: string) {
  if (!tracks.length) return;
  const order = shuffled(tracks.length);
  void C.playList(order.map((i) => toEntry(tracks[i])), 0, source);
}

export async function newPlaylist(items: string[] = []): Promise<string | undefined> {
  const name = await promptText("新建歌单", "", { placeholder: "歌单名称", ok: "创建" });
  if (!name) return undefined;
  const id = await libraryAction(() => api.playlistCreate(name, items));
  if (id && items.length) toast(`已添加到歌单“${name}”`, "success");
  return id;
}

export async function addToPlaylist(id: string, paths: string[]) {
  const pl = useLibrary.getState().data.playlists.find((p) => p.id === id);
  if (!pl) return;
  const have = new Set(pl.items);
  const fresh = paths.filter((p) => !have.has(p));
  if (!fresh.length) {
    toast(`已在歌单“${pl.name}”中`);
    return;
  }
  await libraryAction(() => api.playlistSetItems(id, [...pl.items, ...fresh]));
  toast(`已添加到歌单“${pl.name}”`, "success");
}

export async function renamePlaylist(id: string) {
  const pl = useLibrary.getState().data.playlists.find((p) => p.id === id);
  if (!pl) return;
  const name = await promptText("重命名歌单", pl.name, { ok: "保存" });
  if (name && name !== pl.name) await libraryAction(() => api.playlistRename(id, name));
}

export async function deletePlaylist(id: string) {
  const pl = useLibrary.getState().data.playlists.find((p) => p.id === id);
  if (!pl) return;
  if (!(await confirmDialog(`删除歌单“${pl.name}”？歌单里的文件不会被删除。`))) return;
  await libraryAction(() => api.playlistDelete(id));
  if (useLibrary.getState().nav.view === "playlist") useLibrary.setState({ nav: { view: "songs" } });
}

export async function reveal(path: string) {
  if (!isTauri) return;
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
  } catch (e) {
    toast(String(e), "error");
  }
}

function trackTaskInput(t: LibraryTrack) {
  return C.taskInput({ path: t.path, name: stem(t.path), kind: t.kind, title: trackTitle(t), artist: t.artist });
}

export interface TrackMenuContext {
  queue: LibraryTrack[];
  source: string;
  playlistId?: string;
}

/** Right-click menu for `t` (one of `ctx.queue`). */
export function openTrackMenu(e: React.MouseEvent, t: LibraryTrack, ctx: TrackMenuContext) {
  if (isCloudPath(t.path)) {
    // Online songs: queue actions only (no files, library or AI behind them).
    if (t.unavailable) return;
    const entry = toEntry(t);
    const queue = ctx.queue.filter((q) => !q.unavailable);
    return openMenu(e, [
      { label: "播放", icon: "play", onClick: () => playTracks(queue, Math.max(0, queue.indexOf(t)), ctx.source) },
      { label: "下一首播放", icon: "queue", onClick: () => C.playNext([entry]) },
      { label: "加入播放队列", icon: "list", onClick: () => C.enqueue([entry]) },
    ]);
  }
  const { data } = useLibrary.getState();
  const fav = data.favorites.includes(t.path);
  const entry = toEntry(t);
  const playlists: MenuItem[] = [
    { label: "新建歌单…", icon: "plus", onClick: () => void newPlaylist([t.path]) },
    ...(data.playlists.length ? [sep] : []),
    ...data.playlists.map((p) => ({
      label: p.name,
      icon: "playlist" as const,
      disabled: p.id === ctx.playlistId,
      onClick: () => void addToPlaylist(p.id, [t.path]),
    })),
  ];
  const items: MenuItem[] = [
    { label: "播放", icon: "play", onClick: () => playTracks(ctx.queue, Math.max(0, ctx.queue.indexOf(t)), ctx.source) },
    { label: "下一首播放", icon: "queue", onClick: () => C.playNext([entry]) },
    { label: "加入播放队列", icon: "list", onClick: () => C.enqueue([entry]) },
    sep,
    { label: "添加到歌单", icon: "playlist", children: playlists },
    { label: fav ? "取消收藏" : "收藏", icon: fav ? "heartFill" : "heart", onClick: () => void C.toggleFavorite(t.path, !fav) },
    sep,
    {
      label: t.kind === "video" ? "AI 生成字幕" : "AI 识别歌词",
      icon: "sparkles",
      onClick: () => void C.recognize([trackTaskInput(t)]),
    },
    ...(ctx.queue.length > 1
      ? [
          {
            label: `AI 识别当前列表全部 ${ctx.queue.length} 项`,
            icon: "sparkles" as const,
            onClick: () => void C.recognize(ctx.queue.map(trackTaskInput)),
          },
        ]
      : []),
    sep,
    { label: `在${FILE_MANAGER}中显示`, icon: "reveal", disabled: !isTauri, onClick: () => void reveal(t.path) },
  ];
  if (ctx.playlistId) {
    const id = ctx.playlistId;
    items.push({
      label: "从歌单中移除",
      icon: "minus",
      danger: true,
      onClick: () => {
        const pl = useLibrary.getState().data.playlists.find((p) => p.id === id);
        if (pl) void libraryAction(() => api.playlistSetItems(id, pl.items.filter((p) => p !== t.path)));
      },
    });
  } else {
    items.push({
      label: "从媒体库移除",
      icon: "trash",
      danger: true,
      onClick: async () => {
        if (await confirmDialog(`从媒体库移除“${trackTitle(t)}”？文件本身不会被删除。`)) {
          await libraryAction(() => api.libraryRemoveTracks([t.path]));
        }
      },
    });
  }
  openMenu(e, items);
}

// ---------------------------------------------------------------- albums

/** Removes an album's tracks from the library; the files stay on disk. */
export async function removeAlbum(a: Album) {
  const ok = await confirmDialog(`从媒体库移除专辑《${a.title}》（${a.tracks.length} 首）？\n文件本身不会被删除，刷新文件夹时也不会再加回来。`);
  if (!ok) return;
  const done = await libraryAction(async () => {
    await api.libraryRemoveTracks(a.tracks.map((t) => t.path));
    return true;
  });
  if (done) toast(`已从媒体库移除《${a.title}》`, "success");
}

/** Moves an album's files to the Trash and drops them from the library. */
export async function trashAlbum(a: Album) {
  const ok = await confirmDialog(`把专辑《${a.title}》的 ${a.tracks.length} 个文件移到${TRASH}？\n可以在${TRASH}中恢复。`);
  if (!ok) return;
  const paths = a.tracks.map((t) => t.path);
  const playing = usePlayer.getState().media?.path;
  if (playing && paths.includes(playing)) {
    // Let go of the file before it moves.
    engine.pause();
    if (usePlaylist.getState().items.some((i) => !paths.includes(i.path))) await C.next();
  }
  const r = await libraryAction(() => api.libraryTrashTracks(paths));
  if (!r) return;
  if (r.failed.length) toast(`${r.trashed.length} 个文件已移到${TRASH}，${r.failed.length} 个失败：${r.error ?? "未知错误"}`, "error", 6000);
  else toast(`已把《${a.title}》移到${TRASH}`, "success");
}

/** Right-click menu for an album card. */
export function openAlbumMenu(e: React.MouseEvent, a: Album, open: () => void) {
  const { data } = useLibrary.getState();
  const paths = a.tracks.map((t) => t.path);
  const source = `专辑《${a.title}》`;
  const entries = a.tracks.map(toEntry);
  openMenu(e, [
    { label: "播放", icon: "play", onClick: () => playTracks(a.tracks, 0, source) },
    { label: "随机播放", icon: "shuffle", onClick: () => shuffleTracks(a.tracks, source) },
    { label: "下一首播放", icon: "queue", onClick: () => C.playNext(entries) },
    { label: "加入播放队列", icon: "list", onClick: () => C.enqueue(entries) },
    sep,
    {
      label: "添加到歌单",
      icon: "playlist",
      children: [
        { label: "新建歌单…", icon: "plus", onClick: () => void newPlaylist(paths) },
        ...(data.playlists.length ? [sep] : []),
        ...data.playlists.map((p) => ({ label: p.name, icon: "playlist" as const, onClick: () => void addToPlaylist(p.id, paths) })),
      ],
    },
    { label: "打开专辑", icon: "album", onClick: open },
    { label: `在${FILE_MANAGER}中显示`, icon: "reveal", disabled: !isTauri, onClick: () => void reveal(paths[0]) },
    sep,
    { label: "从媒体库移除专辑", icon: "minus", danger: true, onClick: () => void removeAlbum(a) },
    { label: `移到${TRASH}`, icon: "trash", danger: true, onClick: () => void trashAlbum(a) },
  ]);
}

// ---------------------------------------------------------------- import

/** Picks a folder, adds its music and videos to the library and makes a playlist of them. */
export async function importFolderAsPlaylist(): Promise<string | undefined> {
  if (!isTauri) {
    // Browser preview: pick files instead of a folder.
    const { pickBrowserFiles } = await import("../../lib/ipc");
    const files = await pickBrowserFiles();
    if (!files.length) return undefined;
    await libraryAction(() => api.libraryAddPaths(files));
    const id = await libraryAction(() => api.playlistCreate("导入的文件夹", files));
    if (id) toast(`已导入 ${files.length} 个文件，并建立歌单“导入的文件夹”`, "success");
    return id;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, multiple: false, title: "选择要导入为歌单的文件夹" });
  if (typeof dir !== "string") return undefined;
  toast("正在导入文件夹…");
  const r = await libraryAction(() => api.libraryImportFolder(dir));
  if (!r) return undefined;
  toast(`已导入 ${r.files} 个文件，并建立歌单“${r.name}”`, "success");
  return r.playlistId;
}
