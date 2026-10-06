// NetEase comments of the song playing now, in a panel on the right. Only
// for NetEase songs; it closes by itself when a local file starts playing.

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { tip } from "./Tooltip";
import { formatCommentTime, formatCount } from "../lib/format";
import { remoteUrl, type NeteaseComment } from "../lib/ipc";
import { usePlayer, useUI } from "../stores/player";
import {
  cloudSongId,
  ensureComments,
  loadMoreComments,
  loadMoreReplies,
  reloadComments,
  toggleReplies,
  useComments,
  type CommentList,
  type CommentSort,
} from "../stores/comments";

/** Shows or hides the comments of the NetEase song playing now. */
export function toggleComments(show?: boolean) {
  useUI.setState((u) => {
    const commentsOpen = show ?? !u.commentsOpen;
    return { commentsOpen, playlistFloat: commentsOpen ? false : u.playlistFloat };
  });
}

function avatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("data:") ? url : remoteUrl(`${url}?param=64y64`);
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : avatarUrl(url);
  return (
    <div className="cm-avatar">
      {src ? <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} /> : <span>{[...name][0] ?? "?"}</span>}
    </div>
  );
}

function ListFooter({ list, onMore, emptyText, quietEnd = false }: { list: CommentList; onMore: () => void; emptyText: string; quietEnd?: boolean }) {
  if (list.loading) return <div className="cm-foot"><div className="spinner dark" /></div>;
  if (list.error)
    return (
      <div className="cm-foot error">
        <span>{list.error}</span>
        <button className="btn small" onClick={onMore}>重试</button>
      </div>
    );
  if (!list.items.length) return <div className="cm-foot muted">{emptyText}</div>;
  if (list.hasMore) return <button className="cm-foot more" onClick={onMore}>{quietEnd ? "更多回复" : "加载更多"}</button>;
  return quietEnd ? null : <div className="cm-foot muted">没有更多了</div>;
}

function CommentItem({ c, reply = false }: { c: NeteaseComment; reply?: boolean }) {
  const thread = useComments((s) => (reply ? undefined : s.replies[c.id]));
  return (
    <div className={`cm-item ${reply ? "reply" : ""}`}>
      <Avatar name={c.user.nickname} url={c.user.avatar} />
      <div className="cm-body">
        <div className="cm-head">
          <span className="cm-name" data-lp-raw>{c.user.nickname || "网易云用户"}</span>
          <span className="cm-likes" {...tip(`${c.likedCount} 人点赞`)}>
            <Icon name="heart" size={13} />
            {c.likedCount > 0 && formatCount(c.likedCount)}
          </span>
        </div>
        <div className="cm-text" data-lp-raw>
          {c.content}
        </div>
        {c.replied && (
          <div className="cm-quote">
            <b data-lp-raw>@{c.replied.nickname}</b>：{c.replied.content ? <span data-lp-raw>{c.replied.content}</span> : <i>该评论已删除</i>}
          </div>
        )}
        <div className="cm-meta">
          <span>{formatCommentTime(c.time)}</span>
          {c.location && <span>{c.location}</span>}
        </div>
        {!reply && c.replyCount > 0 && (
          <button className="cm-replies-toggle" onClick={() => toggleReplies(c.id)}>
            {thread ? "收起回复" : `展开 ${formatCount(c.replyCount)} 条回复`}
            <Icon name={thread ? "chevronDown" : "chevronRight"} size={13} />
          </button>
        )}
        {thread && (
          <div className="cm-thread">
            {thread.items.map((r) => (
              <CommentItem key={r.id} c={r} reply />
            ))}
            <ListFooter list={thread} onMore={() => void loadMoreReplies(c.id)} emptyText="暂无回复" quietEnd />
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentsPanel() {
  const media = usePlayer((s) => s.media);
  const songId = cloudSongId(media?.path);
  const total = useComments((s) => (s.songId === songId ? s.total : null));
  const hot = useComments((s) => s.hot);
  const latest = useComments((s) => s.latest);
  const [sort, setSort] = useState<CommentSort>("hot");
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const list = sort === "hot" ? hot : latest;

  // A local file has no NetEase comments: close. A new song: its comments.
  useEffect(() => {
    if (songId === null) {
      useUI.setState({ commentsOpen: false });
      return;
    }
    void ensureComments(songId);
    listRef.current?.scrollTo({ top: 0 });
  }, [songId]);

  useEffect(() => listRef.current?.scrollTo({ top: 0 }), [sort]);

  // The next page when the end of the list comes into view.
  useEffect(() => {
    const end = endRef.current;
    if (!end || !list.hasMore || list.loading || list.error || !list.items.length) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void loadMoreComments(sort), { root: listRef.current, rootMargin: "200px" });
    io.observe(end);
    return () => io.disconnect();
  }, [sort, list.hasMore, list.loading, list.error, list.items.length]);

  if (songId === null) return null;
  const title = media?.meta?.title || media?.name;
  return (
    <aside className="comments panel" data-lp="comments" aria-label="网易云评论">
      <header>
        <div className="row">
          <h3>
            评论 {total !== null && <span className="count">共 {total.toLocaleString()} 条</span>}
          </h3>
          <button className="icon-btn small" onClick={() => toggleComments(false)} {...tip("关闭评论", "Esc")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="cm-song">
          {title}
          {media?.meta?.artist && <span> - {media.meta.artist}</span>}
        </div>
        <div className="seg">
          <button className={sort === "hot" ? "on" : ""} onClick={() => setSort("hot")}>热门</button>
          <button className={sort === "new" ? "on" : ""} onClick={() => setSort("new")}>最新</button>
        </div>
      </header>
      <div className="cm-list" ref={listRef}>
        {list.items.map((c) => (
          <CommentItem key={c.id} c={c} />
        ))}
        <div ref={endRef} />
        <ListFooter
          list={list}
          onMore={() => (list.error && !list.items.length ? reloadComments() : void loadMoreComments(sort))}
          emptyText={sort === "hot" ? "暂无热门评论" : "还没有评论"}
        />
      </div>
    </aside>
  );
}

/** "评论 1.2万" next to the song info; opens the panel. */
export function CommentsChip() {
  const media = usePlayer((s) => s.media);
  const songId = cloudSongId(media?.path);
  const total = useComments((s) => (s.songId === songId ? s.total : null));
  useEffect(() => {
    if (songId !== null) void ensureComments(songId);
  }, [songId]);
  if (songId === null) return null;
  return (
    <button className="chip cm-chip" onClick={() => toggleComments()} {...tip("网易云评论", "C")}>
      <Icon name="comment" size={13} />
      {total !== null ? `评论 ${formatCount(total)}` : "评论"}
    </button>
  );
}
