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
}

export function Slider({ value, max, onCommit, live, buffered, ab, format, className, ariaLabel, onWheelDelta }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const valueAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return k * max;
  };

  const down = (e: RPointerEvent) => {
    if (!max) return;
    ref.current!.setPointerCapture(e.pointerId);
    const v = valueAt(e.clientX);
    setDrag(v);
    if (live) onCommit(v);
  };
  const move = (e: RPointerEvent) => {
    if (!max) return;
    const v = valueAt(e.clientX);
    setHover(v);
    if (drag !== null) {
      setDrag(v);
      if (live) onCommit(v);
    }
  };
  const up = (e: RPointerEvent) => {
    if (drag === null) return;
    const v = valueAt(e.clientX);
    setDrag(null);
    onCommit(v);
  };

  const shown = drag ?? value;
  const pct = (v: number) => (max > 0 ? `${Math.min(100, Math.max(0, (v / max) * 100))}%` : "0%");
  const tipAt = drag ?? hover;

  return (
    <div
      ref={ref}
      className={`slider ${drag !== null ? "dragging" : ""} ${className ?? ""}`}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
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
        <div className="fill" style={{ width: pct(shown) }} />
      </div>
      <div className="thumb" style={{ left: pct(shown) }} />
      {format && tipAt !== null && max > 0 && (
        <div className="tip" style={{ left: pct(tipAt) }}>
          {format(tipAt)}
        </div>
      )}
    </div>
  );
}
