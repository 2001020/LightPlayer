// Parts of the "now playing" page shared by the classic page and free layouts.

import { useEffect, useState } from "react";
import { findLineIndex, spokenLines } from "../core/lyrics/lrc";
import type { OpenedMedia } from "../lib/ipc";
import { useLayouts } from "../stores/layout";
import { useLyrics, usePlayer, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { CommentsChip } from "./CommentsPanel";

export const STRATEGY_LABEL: Record<string, string> = {
  direct: "",
  audioTranscode: "实时转换播放",
  hlsRemux: "转封装播放",
  hlsTranscode: "实时转码播放",
};

// ------------------------------------------------------------------ sample song

/** What the layout editor shows when no song is playing. */
export const SAMPLE_TRACK: OpenedMedia = {
  path: "lightplayer:sample",
  fileName: "示例歌曲.flac",
  name: "示例歌曲",
  kind: "audio",
  strategy: "direct",
  url: "",
  baseOffset: 0,
  duration: 236,
  meta: { title: "歌曲名称", artist: "歌手", album: "专辑" },
  subtitles: [],
};
const SAMPLE_POSITION = 83;
const SAMPLE_LYRIC = { cur: "这里显示当前这句歌词", next: "下一句歌词" };

/** Whether the player page shows the sample song (editing a layout with no song playing). */
export function useSample() {
  const on = useLayouts((s) => s.sample);
  const audio = usePlayer((s) => s.media?.kind === "audio");
  return on && !audio;
}

/** The song the now playing page shows: the playing one, or the sample. */
export function useTrack(): OpenedMedia | null {
  const media = usePlayer((s) => s.media);
  return useSample() ? SAMPLE_TRACK : media;
}

/** Whether playing; the sample song is always shown playing. */
export function usePlaying() {
  const playing = usePlayer((s) => s.playing);
  return useSample() || playing;
}

/** Position and duration in seconds (whole seconds when `whole`). */
export function useProgress(whole = false, on = true) {
  const sample = useSample();
  const position = usePlayer((s) => (sample || !on ? 0 : whole ? Math.floor(s.position) : s.position));
  const duration = usePlayer((s) => s.duration);
  return sample ? { position: SAMPLE_POSITION, duration: SAMPLE_TRACK.duration! } : { position, duration };
}

// ------------------------------------------------------------------ parts

interface PeekLine {
  key: string;
  cur: string;
  next: string;
  leaving: boolean;
}

/**
 * Current and next lyric line. The box has a fixed size so changing lines
 * never moves the cover or the song info; lines slide and fade in and out.
 * `placeholder` shows sample lines when the song has no synced lyrics (in
 * the layout editor), as does the sample song.
 */
export function LyricPeek({ showNext = true, interactive = true, placeholder = false }: { showNext?: boolean; interactive?: boolean; placeholder?: boolean }) {
  const sample = useSample();
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
  if (sample || (placeholder && !synced)) {
    return (
      <div className={`lyric-peek ${showNext ? "" : "single"}`} data-lp="lyric-peek">
        <div className="peek-line" data-lp="lyric-peek-line">
          <span className="cur">{SAMPLE_LYRIC.cur}</span>
          {showNext && <span className="next">{SAMPLE_LYRIC.next}</span>}
        </div>
      </div>
    );
  }
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
  const media = useTrack();
  const sample = useSample();
  const origin = useLyrics((s) => s.origin);
  const status = useLyrics((s) => s.status);
  if (!media) return null;
  if (sample) {
    return (
      <div className="chips" data-lp="chips">
        <span className="chip">FLAC</span>
      </div>
    );
  }
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
