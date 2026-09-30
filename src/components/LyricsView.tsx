import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { engine } from "../core/player/engine";
import { findLineIndex, type LyricLine } from "../core/lyrics/lrc";
import { usePlayer } from "../stores/player";

interface Props {
  lines: LyricLine[];
  synced: boolean;
  /** Seconds added to the playback position before matching (user lyric offset). */
  offset?: number;
  fontSize: number;
  align?: "center" | "left";
  showTranslation?: boolean;
  karaoke?: boolean;
  onSeek?: (t: number) => void;
}

function KaraokeWords({ line, offset }: { line: LyricLine; offset: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const words = line.words!;
    const spans = Array.from(ref.current?.querySelectorAll<HTMLSpanElement>(".w") ?? []);
    const loop = () => {
      const t = engine.position + offset;
      for (let i = 0; i < words.length; i++) {
        const start = words[i].time;
        const end = words[i + 1]?.time ?? line.end ?? start + 0.6;
        const p = t <= start ? 0 : t >= end ? 1 : (t - start) / Math.max(0.05, end - start);
        spans[i]?.style.setProperty("--p", p.toFixed(3));
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [line, offset]);
  return (
    <span ref={ref}>
      {line.words!.map((w, i) => (
        <span key={i} className="w">
          {w.text}
        </span>
      ))}
    </span>
  );
}

export function LyricsView({ lines, synced, offset = 0, fontSize, align = "center", showTranslation = true, karaoke = true, onSeek }: Props) {
  const position = usePlayer((s) => s.position);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrollUntil, setUserScrollUntil] = useState(0);
  const active = synced ? findLineIndex(lines, position + offset) : -1;
  const style = useMemo(() => ({ fontSize, textAlign: align }), [fontSize, align]);

  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box || active < 0 || Date.now() < userScrollUntil) return;
    const el = box.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!el) return;
    const top = el.offsetTop - box.clientHeight * 0.42 + el.offsetHeight / 2;
    box.scrollTo({ top, behavior: "smooth" });
  }, [active, userScrollUntil, fontSize]);

  const onUserScroll = () => setUserScrollUntil(Date.now() + 3000);

  useEffect(() => {
    if (!userScrollUntil) return;
    const id = window.setTimeout(() => setUserScrollUntil(0), Math.max(0, userScrollUntil - Date.now()) + 20);
    return () => clearTimeout(id);
  }, [userScrollUntil]);

  return (
    <div
      className={`lyric-scroll align-${align}`}
      ref={scrollRef}
      style={style}
      onWheel={onUserScroll}
      onTouchMove={onUserScroll}
    >
      <div className="pad" />
      {lines.map((l, i) => {
        const cls = [
          "lyric-line",
          !synced ? "unsynced" : "",
          i === active ? "active" : "",
          Math.abs(i - active) === 1 ? "near" : "",
          karaoke && l.words ? "karaoke" : "",
        ].join(" ");
        return (
          <div
            key={i}
            data-i={i}
            className={cls}
            onClick={() => synced && l.time !== null && onSeek?.(Math.max(0, l.time - offset))}
          >
            {i === active && karaoke && l.words?.length ? <KaraokeWords line={l} offset={offset} /> : l.text || "♪"}
            {showTranslation && l.translation && <span className="tr">{l.translation}</span>}
          </div>
        );
      })}
      <div className="pad" />
    </div>
  );
}
