// Desktop lyrics: one line at a time in a floating, always-on-top window.
// `DesktopLyricsWindow` is the content of that window (Tauri); in the browser
// preview `DesktopLyricsOverlay` shows the same thing as a floating box.

import { useEffect, useRef, useState } from "react";
import { DESKTOP_EVENTS, setDesktopLyrics, setDesktopLyricsColor, useDesktopLine, type DesktopLine } from "../core/desktopLyrics";
import { useSettings } from "../stores/settings";
import { ColorChoices } from "./ColorChoices";
import { Icon } from "./Icon";

const PRESETS = ["#66ccff", "#ffd166", "#ff4d8d", "#13ce66", "#ffffff", "#ff7849", "#b388ff"];

/** Smallest window: room for the colour row and the two buttons. */
export const DL_MIN = { w: 360, h: 56 } as const;

interface ViewProps {
  line: DesktopLine;
  onClose: () => void;
  onColor: (c: string) => void;
  /** Starts moving the window (pointer down on the background). */
  onMoveStart?: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  dragRegion?: boolean;
}

function DesktopLyricsView({ line, onClose, onColor, onMoveStart, onResizeStart, dragRegion }: ViewProps) {
  const [palette, setPalette] = useState(false);
  const leaveTimer = useRef(0);
  const drag = dragRegion ? { "data-tauri-drag-region": true } : {};

  // The colour row closes with Esc, or shortly after the pointer leaves.
  useEffect(() => {
    if (!palette) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPalette(false);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      clearTimeout(leaveTimer.current);
    };
  }, [palette]);

  return (
    <div
      className={`dl-root ${palette ? "open" : ""}`}
      {...drag}
      onPointerDown={onMoveStart}
      onPointerEnter={() => clearTimeout(leaveTimer.current)}
      onPointerLeave={() => {
        clearTimeout(leaveTimer.current);
        if (palette) leaveTimer.current = window.setTimeout(() => setPalette(false), 1500);
      }}
    >
      <div key={line.key} className="dl-line" style={{ color: line.color }} {...drag}>
        {line.text}
      </div>
      <div className="dl-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button className={`dl-btn ${palette ? "on" : ""}`} onClick={() => setPalette((p) => !p)} title={palette ? "收起颜色" : "文字颜色"}>
          <span className="dl-dot" style={{ background: line.color }} />
        </button>
        <button className="dl-btn" onClick={onClose} title="关闭桌面歌词">
          <Icon name="close" size={14} />
        </button>
      </div>
      {palette && (
        <div className="dl-palette" onPointerDown={(e) => e.stopPropagation()}>
          <ColorChoices value={line.color} presets={PRESETS} onChange={(c) => c && onColor(c)} />
        </div>
      )}
      {!palette && <div className="dl-resize" onPointerDown={onResizeStart} title="拖动调整大小" />}
    </div>
  );
}

/** Content of the separate desktop lyrics window. */
export function DesktopLyricsWindow() {
  const [line, setLine] = useState<DesktopLine>({ key: "", text: "", color: "#66ccff" });
  const win = useRef<import("@tauri-apps/api/webviewWindow").WebviewWindow | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("desktop-lyrics");
    let off: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const { emitTo } = await import("@tauri-apps/api/event");
      const { LogicalPosition, LogicalSize } = await import("@tauri-apps/api/dpi");
      const w = getCurrentWebviewWindow();
      win.current = w;
      off = await w.listen<DesktopLine>(DESKTOP_EVENTS.line, (e) => setLine(e.payload));
      // Restore the last place and size.
      try {
        const saved = JSON.parse(localStorage.getItem("lightplayer-desktop-lyrics-rect") ?? "null");
        if (saved) {
          await w.setSize(new LogicalSize(Math.max(DL_MIN.w, saved.w), Math.max(DL_MIN.h, saved.h)));
          await w.setPosition(new LogicalPosition(saved.x, saved.y));
        }
      } catch {
        /* first run */
      }
      const save = async () => {
        try {
          const f = await w.scaleFactor();
          const p = (await w.outerPosition()).toLogical(f);
          const s = (await w.innerSize()).toLogical(f);
          localStorage.setItem("lightplayer-desktop-lyrics-rect", JSON.stringify({ x: p.x, y: p.y, w: s.width, h: s.height }));
        } catch {
          /* ignore */
        }
      };
      await w.onMoved(() => void save());
      await w.onResized(() => void save());
      await emitTo("main", DESKTOP_EVENTS.ready, null);
    })();
    return () => off?.();
  }, []);

  const resize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const w = win.current;
    if (!w) return;
    // Read the event now: React clears it before any await resumes.
    const x0 = e.screenX;
    const y0 = e.screenY;
    let start: { width: number; height: number } | null = null;
    let LogicalSize: typeof import("@tauri-apps/api/dpi").LogicalSize | null = null;
    void (async () => {
      LogicalSize = (await import("@tauri-apps/api/dpi")).LogicalSize;
      start = (await w.innerSize()).toLogical(await w.scaleFactor());
    })();
    let raf = 0;
    const move = (ev: PointerEvent) => {
      if (!start || !LogicalSize) return;
      const size = new LogicalSize(Math.max(DL_MIN.w, start.width + ev.screenX - x0), Math.max(DL_MIN.h, start.height + ev.screenY - y0));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => void w.setSize(size));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const emitMain = async (event: string, payload: unknown) => {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("main", event, payload);
  };

  return (
    <DesktopLyricsView
      line={line}
      dragRegion
      onClose={() => void emitMain(DESKTOP_EVENTS.closed, null)}
      onColor={(c) => {
        setLine((l) => ({ ...l, color: c }));
        void emitMain(DESKTOP_EVENTS.color, c);
      }}
      onResizeStart={resize}
    />
  );
}

/** Browser preview: the desktop lyrics as a floating box over the page. */
export function DesktopLyricsOverlay() {
  const enabled = useSettings((s) => s.desktopLyrics.enabled);
  const line = useDesktopLine();
  const [rect, setRect] = useState(() => ({ x: Math.max(16, (window.innerWidth - 640) / 2), y: window.innerHeight - 230, w: 640, h: 96 }));
  if (!enabled) return null;
  const track = (e: React.PointerEvent, apply: (dx: number, dy: number) => void) => {
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => apply(ev.clientX - x0, ev.clientY - y0);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="dl-overlay" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      <DesktopLyricsView
        line={line}
        onClose={() => setDesktopLyrics(false)}
        onColor={setDesktopLyricsColor}
        onMoveStart={(e) => {
          const r = rect;
          track(e, (dx, dy) => setRect({ ...r, x: r.x + dx, y: r.y + dy }));
        }}
        onResizeStart={(e) => {
          e.stopPropagation();
          const r = rect;
          track(e, (dx, dy) => setRect({ ...r, w: Math.max(DL_MIN.w, r.w + dx), h: Math.max(DL_MIN.h, r.h + dy) }));
        }}
      />
    </div>
  );
}
