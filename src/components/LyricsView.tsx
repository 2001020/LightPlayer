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

/** Short eased scroll; the native smooth scroll is slow for long distances. */
function smoothScroll(box: HTMLElement, target: number, anim: { current: number }, ms = 280) {
  cancelAnimationFrame(anim.current);
  const from = box.scrollTop;
  const dist = target - from;
  if (Math.abs(dist) < 1) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    box.scrollTop = target;
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / ms);
    box.scrollTop = from + dist * (1 - Math.pow(1 - k, 3));
    if (k < 1) anim.current = requestAnimationFrame(step);
  };
  anim.current = requestAnimationFrame(step);
}

export function LyricsView({ lines, synced, offset = 0, fontSize, align = "center", showTranslation = true, karaoke = true, onSeek }: Props) {
  const position = usePlayer((s) => s.position);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anim = useRef(0);
  const placed = useRef(false);
  const [boxH, setBoxH] = useState(0);
  const [userScrollUntil, setUserScrollUntil] = useState(0);
  // Line clicked by the user: highlighted at once, before playback catches up
  // (seeking can land a few ms early and the media needs a moment to resume).
  const [pending, setPending] = useState<{ i: number; at: number } | null>(null);
  const natural = synced ? findLineIndex(lines, position + offset) : -1;
  const active = pending ? pending.i : natural;
  const style = useMemo(() => ({ fontSize, textAlign: align }), [fontSize, align]);

  useEffect(() => {
    if (!pending) return;
    // Release once playback has settled on the clicked line (or after 1.2 s).
    const age = Date.now() - pending.at;
    if (natural === pending.i && age > 400) {
      setPending(null);
      return;
    }
    const id = window.setTimeout(() => setPending(null), Math.max(0, 1200 - age));
    return () => clearTimeout(id);
  }, [pending, natural]);

  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box || active < 0 || Date.now() < userScrollUntil) return;
    const el = box.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!el) return;
    // Keep the highlighted line in the vertical centre of the view.
    const max = box.scrollHeight - box.clientHeight;
    const target = Math.min(max, Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2));
    if (placed.current) smoothScroll(box, target, anim);
    else box.scrollTop = target; // first placement: no animation
    placed.current = true;
  }, [active, userScrollUntil, fontSize, boxH]);

  // Re-centre when the view is resized.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBoxH(box.clientHeight));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const onUserScroll = () => {
    cancelAnimationFrame(anim.current);
    setUserScrollUntil(Date.now() + 3000);
  };

  useEffect(() => {
    if (!userScrollUntil) return;
    const id = window.setTimeout(() => setUserScrollUntil(0), Math.max(0, userScrollUntil - Date.now()) + 20);
    return () => clearTimeout(id);
  }, [userScrollUntil]);

  const jump = (i: number, l: LyricLine) => {
    if (!synced || l.time === null) return;
    setUserScrollUntil(0);
    setPending({ i, at: Date.now() });
    // A hair past the line start so frame-aligned seeks still land inside it.
    onSeek?.(Math.max(0, l.time - offset + 0.02));
  };

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
            onClick={() => jump(i, l)}
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
