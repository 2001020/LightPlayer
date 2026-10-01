import { useEffect, useMemo, useRef, useState } from "react";
import * as C from "../core/controller";
import { extOf } from "../lib/ipc";
import { usePlayer, usePlaylist } from "../stores/player";
import { Icon } from "./Icon";
import { tip } from "./Tooltip";
import { useSettings } from "../stores/settings";

export function PlaylistPanel() {
  const items = usePlaylist((s) => s.items);
  const index = usePlaylist((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const media = usePlayer((s) => s.media);
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items.map((it, i) => ({ it, i })).filter(({ it }) => !k || it.fileName.toLowerCase().includes(k));
  }, [items, q]);

  useEffect(() => {
    const el = listRef.current?.querySelector(".pl-item.active") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  const kindLabel = media?.kind === "video" ? "个视频" : "首";

  return (
    <aside className="playlist panel">
      <header>
        <div className="row">
          <h3>
            播放列表 <span className="count">{items.length} {kindLabel}</span>
          </h3>
          <button className="icon-btn small" onClick={() => useSettings.getState().set({ playlistOpen: false })} {...tip("收起播放列表")}>
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
        {items.length > 8 && (
          <div className="search">
            <Icon name="search" size={15} />
            <input type="search" placeholder="搜索当前目录" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
      </header>
      <div className="items" ref={listRef}>
        {!items.length && (
          <div className="muted" style={{ padding: "20px 10px", textAlign: "center", lineHeight: 1.7 }}>
            打开文件后，这里会列出同一目录下的其他{media?.kind === "video" ? "视频" : "音频"}文件
          </div>
        )}
        {filtered.map(({ it, i }) => (
          <div
            key={it.path}
            className={`pl-item ${i === index ? "active" : ""}`}
            onClick={() => (i === index ? C.toggle() : void C.playIndex(i))}
            data-tip={it.fileName}
          >
            <span className="idx">
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
            <span className="name">{it.name}</span>
            <span className="ext">{extOf(it.fileName)}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
