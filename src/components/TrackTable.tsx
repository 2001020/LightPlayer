// Virtualised track list used by the library views (thousands of rows stay
// smooth). Single click plays the row with the visible list as the queue.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as C from "../core/controller";
import { openTrackMenu, playTracks } from "../core/library/actions";
import { sortTracks, trackArtist, trackTitle, type SortKey } from "../core/library/views";
import { formatTime } from "../lib/format";
import { api, isCloudPath, thumbUrl, type LibraryTrack } from "../lib/ipc";
import { libraryAction, useLibrary } from "../stores/library";
import { toast, usePlayer } from "../stores/player";
import { Icon, type IconName } from "./Icon";
import { tip } from "./Tooltip";

const ROW = 44;
const OVERSCAN = 8;

/** Album art / video frame with a placeholder while loading or when missing. */
export const Thumb = memo(function Thumb({
  path,
  size = 64,
  icon = "music",
  className = "",
}: {
  path: string;
  size?: number;
  icon?: IconName;
  className?: string;
}) {
  const url = thumbUrl(path, size);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <div className={`thumb-img ${className}`}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <Icon name={icon} size={Math.round(Math.min(size, 96) * 0.36)} />
      )}
    </div>
  );
});

interface Column {
  key: SortKey | null;
  label: string;
  className: string;
}

const COLUMNS: Column[] = [
  { key: null, label: "#", className: "c-idx" },
  { key: "title", label: "标题", className: "c-title" },
  { key: "artist", label: "艺术家", className: "c-artist" },
  { key: "album", label: "专辑", className: "c-album" },
  { key: "duration", label: "时长", className: "c-dur" },
  { key: null, label: "", className: "c-fav" },
];

export function TrackTable({
  tracks,
  source,
  playlistId,
  hideAlbum,
  sortable = true,
  numbered = "index",
}: {
  tracks: LibraryTrack[];
  /** Queue label when a row is played, e.g. "专辑《叶惠美》". */
  source: string;
  playlistId?: string;
  hideAlbum?: boolean;
  sortable?: boolean;
  /** "index" = row number, "track" = the tag's track number. */
  numbered?: "index" | "track";
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const rows = useMemo(() => (sort ? sortTracks(tracks, sort.key, sort.desc) : tracks), [tracks, sort]);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  const current = usePlayer((s) => s.media?.path);
  const playing = usePlayer((s) => s.playing);
  const favorites = useLibrary((s) => s.data.favorites);
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset sorting when the list itself changes identity (another view).
  useEffect(() => setSort(null), [source]);

  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  const reorderable = !!playlistId && !sort;

  const clickHeader = (c: Column) => {
    if (!sortable || !c.key) return;
    setSort((s) => (s?.key === c.key ? (s.desc ? null : { key: c.key!, desc: true }) : { key: c.key!, desc: false }));
  };

  // Pointer-driven reordering for playlists (works inside the virtual list).
  const startDrag = (e: React.PointerEvent, from: number) => {
    if (!reorderable) return;
    e.preventDefault();
    e.stopPropagation();
    const el = box.current!;
    const rect = el.getBoundingClientRect();
    let to = from;
    setDrag({ from, to });
    const move = (ev: PointerEvent) => {
      const y = ev.clientY - rect.top + el.scrollTop;
      to = Math.max(0, Math.min(rows.length - 1, Math.floor(y / ROW)));
      setDrag({ from, to });
      if (ev.clientY < rect.top + 30) el.scrollTop -= 12;
      else if (ev.clientY > rect.bottom - 30) el.scrollTop += 12;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (to === from || !playlistId) return;
      const items = rows.map((t) => t.path);
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      void libraryAction(() => api.playlistSetItems(playlistId, items));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const cols = COLUMNS.filter((c) => !(hideAlbum && c.className === "c-album"));

  // Songs that cannot be played (online, no copyright) stay out of the queue.
  const play = (t: LibraryTrack) => {
    if (t.unavailable) return toast("这首歌在网易云音乐暂无版权，无法播放");
    const queue = rows.filter((r) => !r.unavailable);
    playTracks(queue, queue.indexOf(t), source);
  };

  return (
    <div className={`track-table ${hideAlbum ? "no-album" : ""}`}>
      <div className="tt-head">
        {cols.map((c) => (
          <div
            key={c.className}
            className={`${c.className} ${sortable && c.key ? "sortable" : ""} ${sort?.key === c.key ? "sorted" : ""}`}
            onClick={() => clickHeader(c)}
          >
            {c.label}
            {sort?.key === c.key && c.key && <Icon name={sort.desc ? "arrowDown" : "arrowUp"} size={12} />}
          </div>
        ))}
      </div>
      <div
        className="tt-body"
        ref={box}
        onScroll={(e) => {
          // Read now: React clears currentTarget before a deferred updater runs.
          const top = e.currentTarget.scrollTop;
          setView((v) => ({ ...v, top }));
        }}
      >
        <div style={{ height: rows.length * ROW, position: "relative" }}>
          {rows.slice(first, last).map((t, k) => {
            const i = first + k;
            const isCur = t.path === current;
            const fav = favSet.has(t.path);
            const offset = drag ? (i === drag.from ? (drag.to - drag.from) * ROW : i > drag.from && i <= drag.to ? -ROW : i < drag.from && i >= drag.to ? ROW : 0) : 0;
            return (
              <div
                key={t.path}
                className={`tt-row ${isCur ? "current" : ""} ${drag?.from === i ? "dragging" : ""} ${t.unavailable ? "unavailable" : ""}`}
                style={{ transform: `translateY(${i * ROW + offset}px)` }}
                onClick={() => (isCur ? C.toggle() : play(t))}
                onContextMenu={(e) => openTrackMenu(e, t, { queue: rows, source, playlistId })}
              >
                <div className="c-idx">
                  {reorderable && (
                    <span className="grip" onPointerDown={(e) => startDrag(e, i)} onClick={(e) => e.stopPropagation()} {...tip("拖动排序")}>
                      <Icon name="grip" size={16} />
                    </span>
                  )}
                  {isCur ? (
                    <span className={`eq ${playing ? "" : "paused"}`}>
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <span className="num">{numbered === "track" && t.trackNo ? t.trackNo : i + 1}</span>
                  )}
                </div>
                <div className="c-title">
                  <Thumb path={t.path} size={64} icon={t.kind === "video" ? "film" : "music"} />
                  <span className="t" data-tip={trackTitle(t)}>
                    {trackTitle(t)}
                  </span>
                  {t.badge && <span className={`tt-badge ${t.unavailable ? "off" : ""}`}>{t.badge}</span>}
                </div>
                <div className="c-artist">{trackArtist(t) || <span className="faint">未知</span>}</div>
                {!hideAlbum && <div className="c-album">{t.album || <span className="faint">未知</span>}</div>}
                <div className="c-dur">{t.duration ? formatTime(t.duration) : ""}</div>
                <div className="c-fav">
                  {!isCloudPath(t.path) && <button
                    className={`icon-btn small fav ${fav ? "on" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void C.toggleFavorite(t.path, !fav);
                    }}
                    {...tip(fav ? "取消收藏" : "收藏")}
                  >
                    <Icon name={fav ? "heartFill" : "heart"} size={16} />
                  </button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
