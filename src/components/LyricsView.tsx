import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { engine } from "../core/player/engine";
import { findLineIndex, spokenLines, type LyricLine } from "../core/lyrics/lrc";
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

/** How long a line takes to settle, and how much later each next line starts. */
const MOVE_MS = 900;
const STAGGER_MS = 50;
/** Close to a soft, well damped spring: a quick start and a long gentle landing. */
const MOVE_EASE = "cubic-bezier(0.38, 0.7, 0.22, 1)";

/** The vertical offset a line is drawn at right now (mid-animation or 0). */
function currentOffset(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  return new DOMMatrixReadOnly(t).m42;
}

/**
 * Moves the view to `target` the way Apple Music does: the scroll position
 * changes at once, and each line glides from where it was to its new place,
 * the lines after the current one a little later than the ones before, so the
 * text flows up like a wave instead of moving as one block.
 */
function flowTo(box: HTMLElement, target: number, active: number) {
  // Scrolling by `dist` moves every line up by as much; they start out that far down.
  const dist = target - box.scrollTop;
  if (Math.abs(dist) < 1) return;
  const lines = Array.from(box.querySelectorAll<HTMLElement>(".lyric-line"));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof lines[0]?.animate !== "function") {
    box.scrollTop = target;
    return;
  }
  // Long jumps (a seek) move together and a bit faster; the wave is for line to line.
  const wave = Math.abs(dist) < box.clientHeight * 0.6;
  const top = target - box.clientHeight * 0.5;
  const bottom = target + box.clientHeight * 1.5;
  const starts = lines.map((el) => {
    const visible = el.offsetTop + el.offsetHeight > top && el.offsetTop < bottom;
    // Where it is drawn now, so a move that interrupts another carries on from there.
    const from = visible ? currentOffset(el) : 0;
    el.getAnimations().forEach((a) => a.cancel());
    return visible ? from + dist : null;
  });
  box.scrollTop = target;
  lines.forEach((el, n) => {
    const from = starts[n];
    if (from === null || Math.abs(from) < 0.5) return;
    const i = Number(el.dataset.i);
    const delay = wave ? Math.min(8, Math.max(0, i - active + 1)) * STAGGER_MS : 0;
    el.animate([{ transform: `translateY(${from}px)` }, { transform: "translateY(0)" }], {
      duration: wave ? MOVE_MS : MOVE_MS * 0.75,
      delay,
      easing: MOVE_EASE,
      fill: "backwards",
    });
  });
}

export function LyricsView({ lines: all, synced, offset = 0, fontSize, align = "center", showTranslation = true, karaoke = true, onSeek }: Props) {
  const lines = synced ? spokenLines(all) : all;
  const position = usePlayer((s) => s.position);
  const scrollRef = useRef<HTMLDivElement>(null);
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
    if (placed.current) flowTo(box, target, active);
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

  // Wheel and touch events come many times a second: move the deadline only
  // now and then, not re-rendering every line on each of them.
  const onUserScroll = () => {
    const until = Date.now() + 3000;
    if (until - userScrollUntil > 400) setUserScrollUntil(until);
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
      data-lp="lyric-scroll"
      data-lp-raw
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
          active >= 0 && i < active ? "past" : "",
          karaoke && l.words ? "karaoke" : "",
        ].join(" ");
        return (
          <div
            key={i}
            data-i={i}
            data-lp="lyric-line"
            data-active={i === active ? "" : undefined}
            className={cls}
            // Distance from the current line: the farther, the softer.
            style={{ "--d": active < 0 ? 2 : Math.min(4, Math.abs(i - active)) } as React.CSSProperties}
            onClick={() => jump(i, l)}
          >
            {/* Scaled and faded on its own, so the line's movement stays separate. */}
            <div className="lyric-body">
              {i === active && karaoke && l.words?.length ? <KaraokeWords line={l} offset={offset} /> : l.text || "\u00a0"}
              {showTranslation && l.translation && (
                <span className="tr" data-lp="lyric-translation">
                  {l.translation}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className="pad" />
    </div>
  );
}
