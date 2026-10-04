// Delayed hover tooltips for any element carrying `data-tip` (and optionally
// `data-kbd` for a shortcut hint). Mounted once; uses event delegation so
// components only need the attributes.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { keys } from "../lib/platform";

const DELAY = 1000;

/** Attributes for a delayed tooltip plus an accessible name. */
export function tip(text: string, kbd?: string): { "data-tip": string; "data-kbd"?: string; "aria-label": string } {
  return kbd ? { "data-tip": text, "data-kbd": keys(kbd), "aria-label": text } : { "data-tip": text, "aria-label": text };
}

interface Tip {
  text: string;
  kbd: string | null;
  rect: DOMRect;
}

export function Tooltips() {
  const [cur, setCur] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    let target: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      target = null;
      setCur(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]") ?? null;
      if (el === target) return;
      hide();
      if (!el) return;
      target = el;
      timer = window.setTimeout(() => {
        if (!target || !target.isConnected || !target.dataset.tip) return;
        setCur({ text: target.dataset.tip, kbd: target.dataset.kbd ?? null, rect: target.getBoundingClientRect() });
      }, DELAY);
    };
    const leaveWindow = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", leaveWindow);
    window.addEventListener("pointerdown", hide, true);
    window.addEventListener("keydown", hide, true);
    window.addEventListener("wheel", hide, { capture: true, passive: true });
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", leaveWindow);
      window.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("keydown", hide, true);
      window.removeEventListener("wheel", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!cur || !box.current) {
      setPos(null);
      return;
    }
    const b = box.current.getBoundingClientRect();
    const gap = 8;
    let top = cur.rect.top - b.height - gap;
    if (top < 6) top = cur.rect.bottom + gap;
    const left = Math.min(window.innerWidth - b.width - 6, Math.max(6, cur.rect.left + cur.rect.width / 2 - b.width / 2));
    setPos({ left, top });
  }, [cur]);

  if (!cur) return null;
  return (
    <div
      ref={box}
      className="tooltip"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999, opacity: 0 }}
    >
      {cur.text}
      {cur.kbd && <kbd>{cur.kbd}</kbd>}
    </div>
  );
}
