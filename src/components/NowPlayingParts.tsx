// Parts of the "now playing" page shared by the classic page and free layouts.

import { useEffect, useState } from "react";
import { findLineIndex, spokenLines } from "../core/lyrics/lrc";
import { useLyrics, usePlayer, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { CommentsChip } from "./CommentsPanel";

export const STRATEGY_LABEL: Record<string, string> = {
  direct: "",
  audioTranscode: "实时转换播放",
  hlsRemux: "转封装播放",
  hlsTranscode: "实时转码播放",
};

interface PeekLine {
  key: string;
  cur: string;
  next: string;
  leaving: boolean;
}

/**
 * Current and next lyric line. The box has a fixed size so changing lines
 * never moves the cover or the song info; lines slide and fade in and out.
 */
export function LyricPeek({ showNext = true, interactive = true }: { showNext?: boolean; interactive?: boolean }) {
  const lyrics = useLyrics((s) => s.lyrics);
  const position = usePlayer((s) => s.position);
  const media = usePlayer((s) => s.media);
  const offset = useSettings((s) => (media ? s.lyricOffsets[media.path] ?? 0 : 0));
  const synced = !!lyrics?.synced;
  const said = synced ? spokenLines(lyrics!.lines) : [];
  const i = synced ? findLineIndex(said, position + offset) : -1;
  // Before the first line only the upcoming one is shown.
  const cur = said[i]?.text || said[i]?.translation || "";
  const next = said[i + 1]?.text || said[i + 1]?.translation || "";
  const key = `${media?.path}|${i}`;
  const [lines, setLines] = useState<PeekLine[]>([]);
  useEffect(() => {
    if (!synced) {
      setLines([]);
      return;
    }
    setLines((prev) => {
      if (prev[0]?.key === key) return prev;
      return [{ key, cur, next, leaving: false }, ...prev.filter((l) => !l.leaving).slice(0, 1).map((l) => ({ ...l, leaving: true }))];
    });
    const t = window.setTimeout(() => setLines((prev) => prev.filter((l) => !l.leaving)), 450);
    return () => clearTimeout(t);
  }, [key, cur, next, synced]);
  if (!synced) return null;
  return (
    <div
      className={`lyric-peek ${showNext ? "" : "single"}`}
      data-lp="lyric-peek"
      data-lp-raw
      onClick={interactive ? () => useUI.setState({ page: "lyrics" }) : undefined}
    >
      {lines.map((l) => (
        <div key={l.key} className={`peek-line ${l.leaving ? "out" : "in"}`} data-lp="lyric-peek-line">
          {l.cur && <span className="cur">{l.cur}</span>}
          {showNext && l.next && <span className="next">{l.next}</span>}
        </div>
      ))}
    </div>
  );
}

/** File type, playback strategy, AI lyrics and comments. */
export function TrackChips() {
  const media = usePlayer((s) => s.media);
  const origin = useLyrics((s) => s.origin);
  const status = useLyrics((s) => s.status);
  if (!media) return null;
  const strat = STRATEGY_LABEL[media.strategy];
  return (
    <div className="chips" data-lp="chips">
      <span className="chip">{media.fileName.split(".").pop()?.toUpperCase()}</span>
      {strat && <span className="chip accent">{strat}</span>}
      {status === "loaded" && origin === "ai" && <span className="chip">AI 歌词</span>}
      {status === "loaded" && origin === "ai_reviewed" && <span className="chip">AI 歌词（已校对）</span>}
      <CommentsChip />
    </div>
  );
}
