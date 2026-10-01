// Library actions shared by the views: playing a view as the queue and the
// right-click menu for tracks.

import * as C from "../controller";
import { shuffled } from "../playlist/queue";
import { api, isTauri, type LibraryTrack } from "../../lib/ipc";
import { confirmDialog } from "../../lib/confirm";
import { stem } from "../../lib/format";
import { libraryAction, useLibrary } from "../../stores/library";
import { toast } from "../../stores/player";
import { openMenu, sep, type MenuItem } from "../../components/ContextMenu";
import { promptText } from "../../components/Prompt";
import { toEntry, trackTitle } from "./views";

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
    { label: "在访达中显示", icon: "reveal", disabled: !isTauri, onClick: () => void reveal(t.path) },
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
