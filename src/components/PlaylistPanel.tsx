import { useEffect, useMemo, useRef, useState } from "react";
import * as C from "../core/controller";
import { reveal } from "../core/library/actions";
import { extOf, isCloudPath, isTauri } from "../lib/ipc";
import { usePlayer, usePlaylist, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { openMenu } from "./ContextMenu";
import { Icon } from "./Icon";
import { tip } from "./Tooltip";
import { FILE_MANAGER } from "../lib/platform";

/** Below these widths the list floats over the page instead of taking a column. */
const SIDE_MIN = { player: 900, lyrics: 1180 } as const;

export type PlaylistLayout = "side" | "float";

function layoutFor(width: number, page: string): PlaylistLayout {
  return width >= (page === "lyrics" ? SIDE_MIN.lyrics : SIDE_MIN.player) ? "side" : "float";
}

export function usePlaylistLayout(): PlaylistLayout {
  const page = useUI((s) => s.page);
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return layoutFor(width, page);
}

/** Whether the play queue is visible right now (in either layout). */
export function usePlaylistShown(): boolean {
  const layout = usePlaylistLayout();
  const side = useSettings((s) => s.playlistOpen);
  const float = useUI((s) => s.playlistFloat);
  return layout === "side" ? side : float;
}

/** Shows or hides the play queue: a column when there is room, otherwise a floating panel. */
export function togglePlaylist(show?: boolean) {
  const layout = layoutFor(window.innerWidth, useUI.getState().page);
  if (layout === "side") {
    const s = useSettings.getState();
    s.set({ playlistOpen: show ?? !s.playlistOpen });
  } else {
    // The floating queue and the comments panel take the same spot.
    useUI.setState((u) => {
      const playlistFloat = show ?? !u.playlistFloat;
      return { playlistFloat, commentsOpen: playlistFloat ? false : u.commentsOpen };
    });
  }
}

interface Drag {
  from: number;
  to: number;
}

export function PlaylistPanel({ floating = false }: { floating?: boolean }) {
  const items = usePlaylist((s) => s.items);
  const index = usePlaylist((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const media = usePlayer((s) => s.media);
  const source = usePlaylist((s) => s.source);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items.map((it, i) => ({ it, i })).filter(({ it }) => !k || it.fileName.toLowerCase().includes(k));
  }, [items, q]);
  const canReorder = !q.trim();

  useEffect(() => {
    const el = listRef.current?.querySelector(".pl-item.active") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  // The floating panel closes when clicking elsewhere (but not on its toggle).
  useEffect(() => {
    if (!floating) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t) || t.closest(".pl-toggle, .playlist-handle, .ctx-menu")) return;
      useUI.setState({ playlistFloat: false });
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [floating]);

  const close = () => (floating ? useUI.setState({ playlistFloat: false }) : useSettings.getState().set({ playlistOpen: false }));

  const startDrag = (e: React.PointerEvent, from: number) => {
    if (!canReorder) return;
    e.preventDefault();
    e.stopPropagation();
    const box = listRef.current!;
    const rows = [...box.querySelectorAll<HTMLElement>(".pl-item")];
    let to = from;
    setDrag({ from, to });
    const move = (ev: PointerEvent) => {
      // Drop target: the row whose middle the pointer passed last.
      let t = 0;
      rows.forEach((r, i) => {
        const b = r.getBoundingClientRect();
        if (ev.clientY > b.top + b.height / 2) t = i + (i >= from ? 0 : 1);
      });
      to = Math.max(0, Math.min(items.length - 1, t));
      setDrag({ from, to });
      const bb = box.getBoundingClientRect();
      if (ev.clientY < bb.top + 28) box.scrollTop -= 10;
      else if (ev.clientY > bb.bottom - 28) box.scrollTop += 10;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      C.moveQueueItem(from, to);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const menu = (e: React.MouseEvent, i: number) => {
    const it = items[i];
    openMenu(e, [
      { label: i === index ? (playing ? "暂停" : "播放") : "播放", icon: i === index && playing ? "pause" : "play", onClick: () => (i === index ? C.toggle() : void C.playIndex(i)) },
      {
        label: "下一首播放",
        icon: "queue",
        disabled: i === index || i === index + 1,
        onClick: () => C.moveQueueItem(i, i < index ? index : index + 1),
      },
      { label: `在${FILE_MANAGER}中显示`, icon: "reveal", disabled: !isTauri || isCloudPath(it.path), onClick: () => void reveal(it.path) },
      { label: "从播放列表移除", icon: "minus", danger: true, disabled: items.length <= 1, onClick: () => void C.removeQueueItem(i) },
    ]);
  };

  const mixed = items.some((i) => i.kind === "audio") && items.some((i) => i.kind === "video");
  const online = items.some((i) => isCloudPath(i.path));
  const kindLabel = mixed ? "项" : (items[0]?.kind ?? media?.kind) === "video" ? "个视频" : "首";

  return (
    <aside ref={panelRef} className={`playlist panel ${floating ? "floating" : ""} ${drag ? "reordering" : ""}`}>
      <header>
        <div className="row">
          <h3>
            播放列表 <span className="count">{items.length} {kindLabel}</span>
          </h3>
          <button className="icon-btn small" onClick={close} {...tip(floating ? "关闭播放列表" : "收起播放列表")}>
            <Icon name={floating ? "close" : "chevronRight"} size={18} />
          </button>
        </div>
        <div className="pl-source">{source ? `来自${source}` : "当前文件夹"}</div>
        {items.length > 8 && (
          <div className="search">
            <Icon name="search" size={15} />
            <input type="search" placeholder={online ? "搜索播放列表" : "搜索当前目录"} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
      </header>
      <div className="items" ref={listRef}>
        {!items.length && (
          <div className="muted" style={{ padding: "20px 10px", textAlign: "center", lineHeight: 1.7 }}>
            打开文件后，这里会列出同一目录下的其他{media?.kind === "video" ? "视频" : "音频"}文件
          </div>
        )}
        {filtered.map(({ it, i }) => {
          const target = drag && drag.to === i && drag.from !== i ? (drag.to > drag.from ? "drop-after" : "drop-before") : "";
          return (
            <div
              key={it.path}
              className={`pl-item ${i === index ? "active" : ""} ${drag?.from === i ? "dragging" : ""} ${target}`}
              onClick={() => (i === index ? C.toggle() : void C.playIndex(i))}
              onContextMenu={(e) => menu(e, i)}
              data-tip={drag ? undefined : it.fileName}
            >
              <span className="idx">
                {canReorder && (
                  <span className="grip" onPointerDown={(e) => startDrag(e, i)} onClick={(e) => e.stopPropagation()} {...tip("拖动调整顺序")}>
                    <Icon name="grip" size={15} />
                  </span>
                )}
                <span className="num">
                  {i === index ? (
                    <span className={`eq ${playing ? "" : "paused"}`}>
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    i + 1
                  )}
                </span>
              </span>
              <span className="name">{it.name}</span>
              {!isCloudPath(it.path) && <span className="ext">{extOf(it.fileName)}</span>}
              {items.length > 1 && (
                <button
                  className="remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    void C.removeQueueItem(i);
                  }}
                  {...tip("从播放列表移除")}
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
