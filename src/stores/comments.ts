// NetEase comments of the song playing now: hot and newest lists, and the
// replies of the threads the user opened. Kept for the current song only.

import { create } from "zustand";
import { api, NETEASE_PREFIX, type NeteaseComment, type NeteaseCommentPage } from "../lib/ipc";

export interface CommentList {
  items: NeteaseComment[];
  hasMore: boolean;
  loading: boolean;
  error?: string;
  /** Where the next page starts (see `NeteaseCommentPage.cursor`). */
  cursor?: number | null;
}

export type CommentSort = "hot" | "new";

interface CommentsState {
  /** NetEase song id the lists belong to. */
  songId: number | null;
  /** Total comment count, once the first page arrived. */
  total: number | null;
  hot: CommentList;
  latest: CommentList;
  /** Opened reply threads, by comment id. */
  replies: Record<number, CommentList>;
}

const empty = (): CommentList => ({ items: [], hasMore: true, loading: false });

export const useComments = create<CommentsState>(() => ({
  songId: null,
  total: null,
  hot: empty(),
  latest: empty(),
  replies: {},
}));

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The NetEase song id of a media path, if it is one. */
export function cloudSongId(path: string | null | undefined): number | null {
  if (!path?.startsWith(NETEASE_PREFIX)) return null;
  const id = Number(path.slice(NETEASE_PREFIX.length));
  return Number.isFinite(id) ? id : null;
}

/** Appends without repeating comments (pages can overlap while new ones arrive). */
function merge(a: NeteaseComment[], b: NeteaseComment[]): NeteaseComment[] {
  const seen = new Set(a.map((c) => c.id));
  return [...a, ...b.filter((c) => !seen.has(c.id))];
}

const key = (sort: CommentSort) => (sort === "hot" ? "hot" : "latest");

/**
 * Loads the first page for `songId` unless it is already there. That page
 * holds the newest comments, the first hot ones and the total.
 */
export async function ensureComments(songId: number) {
  const s = useComments.getState();
  if (s.songId === songId && (s.latest.loading || s.latest.items.length || s.total !== null)) return;
  useComments.setState({
    songId,
    total: null,
    hot: { ...empty(), loading: true },
    latest: { ...empty(), loading: true },
    replies: {},
  });
  try {
    const page = await api.neteaseComments(songId, false, 0, null);
    if (useComments.getState().songId !== songId) return;
    useComments.setState({
      total: page.total,
      hot: { items: page.hot, hasMore: page.moreHot, loading: false },
      latest: { items: page.comments, hasMore: page.hasMore, loading: false, cursor: page.cursor },
    });
  } catch (e) {
    if (useComments.getState().songId !== songId) return;
    const error = errText(e);
    useComments.setState({ hot: { ...empty(), hasMore: false, error }, latest: { ...empty(), hasMore: false, error } });
  }
}

/** Retries after an error on the first page. */
export function reloadComments() {
  const id = useComments.getState().songId;
  if (id === null) return;
  useComments.setState({ songId: null });
  void ensureComments(id);
}

/** Loads the next page of one list. */
export async function loadMoreComments(sort: CommentSort) {
  const s = useComments.getState();
  const k = key(sort);
  const list = s[k];
  if (s.songId === null || list.loading || !list.hasMore) return;
  if (list.error && !list.items.length) return reloadComments();
  const songId = s.songId;
  useComments.setState({ [k]: { ...list, loading: true, error: undefined } } as Partial<CommentsState>);
  try {
    const page: NeteaseCommentPage = await api.neteaseComments(songId, sort === "hot", list.items.length, list.cursor);
    if (useComments.getState().songId !== songId) return;
    const cur = useComments.getState()[k];
    const items = merge(cur.items, page.comments);
    // Stop when a page brings nothing new, whatever NetEase says.
    const hasMore = page.hasMore && items.length > cur.items.length;
    useComments.setState({ [k]: { items, hasMore, loading: false, cursor: page.cursor ?? cur.cursor } } as Partial<CommentsState>);
  } catch (e) {
    if (useComments.getState().songId !== songId) return;
    useComments.setState({ [k]: { ...useComments.getState()[k], loading: false, error: errText(e) } } as Partial<CommentsState>);
  }
}

/** Shows or hides the replies of comment `parent`. */
export function toggleReplies(parent: number) {
  const s = useComments.getState();
  if (s.replies[parent]) {
    const { [parent]: _, ...rest } = s.replies;
    useComments.setState({ replies: rest });
    return;
  }
  useComments.setState({ replies: { ...s.replies, [parent]: empty() } });
  void loadMoreReplies(parent);
}

/** Loads the next page of replies of comment `parent`. */
export async function loadMoreReplies(parent: number) {
  const s = useComments.getState();
  const list = s.replies[parent];
  if (s.songId === null || !list || list.loading || !list.hasMore) return;
  const songId = s.songId;
  const set = (l: CommentList) => useComments.setState((st) => (st.songId === songId && st.replies[parent] ? { replies: { ...st.replies, [parent]: l } } : {}));
  set({ ...list, loading: true, error: undefined });
  try {
    const page = await api.neteaseCommentReplies(songId, parent, list.cursor);
    const cur = useComments.getState().replies[parent];
    if (!cur) return;
    const items = merge(cur.items, page.comments);
    set({ items, hasMore: page.hasMore && items.length > cur.items.length, loading: false, cursor: page.cursor });
  } catch (e) {
    const cur = useComments.getState().replies[parent];
    if (cur) set({ ...cur, loading: false, error: errText(e) });
  }
}
