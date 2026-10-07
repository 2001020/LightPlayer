import { useRef, useState, type PointerEvent as RPointerEvent } from "react";

interface Props {
  value: number;
  max: number;
  /** Called continuously while dragging when `live` is set, otherwise on release. */
  onCommit: (v: number) => void;
  live?: boolean;
  buffered?: [number, number][];
  ab?: { a: number | null; b: number | null };
  format?: (v: number) => string;
  className?: string;
  ariaLabel?: string;
  onWheelDelta?: (d: number) => void;
  /** Bottom to top instead of left to right. */
  vertical?: boolean;
}

export function Slider({ value, max, onCommit, live, buffered, ab, format, className, ariaLabel, onWheelDelta, vertical }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const valueAt = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    const k = vertical ? (r.bottom - e.clientY) / r.height : (e.clientX - r.left) / r.width;
    return Number.isFinite(k) ? Math.min(1, Math.max(0, k)) * max : 0;
  };

  const down = (e: RPointerEvent) => {
    if (!max) return;
    ref.current!.setPointerCapture(e.pointerId);
    const v = valueAt(e);
    setDrag(v);
    if (live) onCommit(v);
  };
  const move = (e: RPointerEvent) => {
    if (!max) return;
    const v = valueAt(e);
    setHover(v);
    if (drag !== null) {
      setDrag(v);
      if (live) onCommit(v);
    }
  };
  const up = (e: RPointerEvent) => {
    if (drag === null) return;
    const v = valueAt(e);
    setDrag(null);
    onCommit(v);
  };

  const shown = drag ?? value;
  const pct = (v: number) => (max > 0 ? `${Math.min(100, Math.max(0, (v / max) * 100))}%` : "0%");
  const tipAt = drag ?? hover;

  return (
    <div
      ref={ref}
      className={`slider ${vertical ? "vertical" : ""} ${drag !== null ? "dragging" : ""} ${className ?? ""}`}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-orientation={vertical ? "vertical" : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onWheel={onWheelDelta ? (e) => onWheelDelta(-e.deltaY) : undefined}
    >
      <div className="rail">
        {buffered?.map(([s, e], i) => (
          <div key={i} className="buffered" style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }} />
        ))}
        {ab && ab.a !== null && (
          <div className="ab" style={{ left: pct(ab.a), width: `calc(${pct(ab.b ?? ab.a + max * 0.004)} - ${pct(ab.a)})` }} />
        )}
        <div className="fill" style={vertical ? { height: pct(shown) } : { width: pct(shown) }} />
      </div>
      <div className="thumb" style={vertical ? { bottom: pct(shown) } : { left: pct(shown) }} />
      {format && !vertical && tipAt !== null && max > 0 && (
        <div className="tip" style={{ left: pct(tipAt) }}>
          {format(tipAt)}
        </div>
      )}
    </div>
  );
}
