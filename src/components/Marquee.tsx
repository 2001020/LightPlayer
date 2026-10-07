import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Scrolling speed of text that does not fit, in px per second. */
const SPEED = 28;

/**
 * One line of text. When it is wider than its box it scrolls to the end,
 * waits, and scrolls back.
 */
export function Marquee({ children, className, raw }: { children: ReactNode; className?: string; raw?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  const measure = () => {
    if (!box.current || !text.current) return;
    const d = Math.ceil(text.current.scrollWidth - box.current.clientWidth);
    setShift(d > 1 ? d : 0);
  };
  useLayoutEffect(measure, [children]);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    ro.observe(box.current!);
    ro.observe(text.current!);
    return () => ro.disconnect();
  }, []);

  // Each way takes 38% of the cycle; the rest is the pauses at both ends.
  const duration = Math.max(6, shift / SPEED / 0.38);
  return (
    <div
      ref={box}
      className={`marquee ${shift ? "scrolling" : ""} ${className ?? ""}`}
      style={shift ? ({ "--mq-shift": `-${shift}px`, "--mq-dur": `${duration.toFixed(1)}s` } as CSSProperties) : undefined}
      data-lp-raw={raw ? "" : undefined}
    >
      <span ref={text}>{children}</span>
    </div>
  );
}
