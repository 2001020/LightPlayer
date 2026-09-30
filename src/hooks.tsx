import { useEffect, useState } from "react";
import * as C from "./core/controller";
import { engine } from "./core/player/engine";
import { accentPalette } from "./lib/color";
import { localFileUrl } from "./lib/ipc";
import { usePlayer, useUI } from "./stores/player";
import { useSettings } from "./stores/settings";
import { toggleFullscreen } from "./components/TransportBar";

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return dark;
}

/** Applies light/dark mode and the accent palette as CSS variables. */
export function useTheme() {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const dynamic = useSettings((s) => s.dynamicAccent);
  const dynamicColor = useUI((s) => s.dynamicAccent);
  const systemDark = useSystemDark();
  const dark = theme === "dark" || (theme === "system" && systemDark);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    const p = accentPalette(dynamic && dynamicColor ? dynamicColor : accent, dark);
    root.style.setProperty("--accent", p.accent);
    root.style.setProperty("--accent-hover", p.hover);
    root.style.setProperty("--accent-strong", p.strong);
    root.style.setProperty("--accent-soft", p.soft);
    root.style.setProperty("--on-accent", p.onAccent);
  }, [dark, accent, dynamic, dynamicColor]);
  return dark;
}

export function Background() {
  const bg = useSettings((s) => s.background);
  const coverBg = useSettings((s) => s.coverBackground);
  const cover = usePlayer((s) => (s.media?.kind === "audio" ? s.media.meta?.cover ?? null : null));
  const page = useUI((s) => s.page);
  const [custom, setCustom] = useState<string | null>(null);
  useEffect(() => {
    if (bg.path) localFileUrl(bg.path).then(setCustom);
    else setCustom(null);
  }, [bg.path]);

  const image = custom ?? (coverBg ? cover : null);
  const isCover = !custom && !!image;
  const blur = isCover ? Math.max(40, bg.blur * 2) : bg.blur;
  const dim = isCover ? Math.max(0.45, bg.dim) : bg.dim;
  return (
    <>
      <div className="bg-layer" />
      {image && (
        <>
          <div
            className="bg-image"
            style={{
              backgroundImage: `url("${image}")`,
              backgroundSize: bg.fit === "tile" && !isCover ? "auto" : bg.fit === "contain" && !isCover ? "contain" : "cover",
              backgroundRepeat: bg.fit === "tile" && !isCover ? "repeat" : "no-repeat",
              filter: `blur(${blur}px) saturate(${isCover ? 1.3 : 1})`,
              opacity: isCover && page !== "lyrics" ? 0.55 : 1,
            }}
          />
          <div className="bg-dim" style={{ background: `color-mix(in srgb, var(--bg) ${Math.round(dim * 100)}%, transparent)` }} />
        </>
      )}
    </>
  );
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

/** Global keyboard shortcuts (disabled while the lyrics editor is open). */
export function useKeyboard() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const s = useSettings.getState();
      const media = usePlayer.getState().media;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void C.openWithDialog();
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        useUI.setState({ overlay: "settings" });
        return;
      }
      if (ui.overlay === "editor" || isTyping(e)) return;
      if (ui.overlay && e.key !== " ") return;
      const k = e.key;
      let handled = true;
      if (k === " ") {
        (document.activeElement as HTMLElement | null)?.blur?.();
        C.toggle();
      }
      else if (k === "ArrowLeft" && mod) void C.prev();
      else if (k === "ArrowRight" && mod) void C.next();
      else if (k === "ArrowLeft") C.seekBy(e.shiftKey ? -s.jumpStep : -s.seekStep);
      else if (k === "ArrowRight") C.seekBy(e.shiftKey ? s.jumpStep : s.seekStep);
      else if (k === "ArrowUp") C.setVolume(s.volume + 0.05);
      else if (k === "ArrowDown") C.setVolume(s.volume - 0.05);
      else if (k === "j" || k === "J") C.seekBy(-s.jumpStep);
      else if (k === "l" || k === "L") C.seekBy(s.jumpStep);
      else if (k === "m" || k === "M") C.toggleMute();
      else if ((k === "i" || k === "I") && media?.kind === "video") useUI.setState({ overlay: "videoInfo" });
      else if ((k === "f" || k === "F") && media?.kind === "video") void toggleFullscreen();
      else if ((k === "s" || k === "S") && media?.kind === "video") void C.screenshot();
      else if ((k === "y" || k === "Y") && media?.kind === "audio") useUI.setState({ page: ui.page === "lyrics" ? "player" : "lyrics" });
      else if ((k === "e" || k === "E") && media?.kind === "audio") useUI.setState({ overlay: "editor" });
      else if (k === "a" || k === "A") media && C.cycleAbLoop();
      else if (k === ",") C.stepFrame(-1);
      else if (k === ".") C.stepFrame(1);
      else if (k === "[") C.setRate(Math.max(0.25, Math.round((s.rate - 0.25) * 100) / 100));
      else if (k === "]") C.setRate(Math.min(4, Math.round((s.rate + 0.25) * 100) / 100));
      else if (k === "Escape" && ui.fullscreen) void toggleFullscreen(false);
      else handled = false;
      if (handled) e.preventDefault();
    };
    // Clicking a button must not leave it focused, otherwise Space would both
    // toggle playback and re-activate the button.
    const noFocus = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest("button");
      if (b && !b.closest(".dialog")) e.preventDefault();
    };
    window.addEventListener("keydown", h);
    window.addEventListener("mousedown", noFocus);
    return () => {
      window.removeEventListener("keydown", h);
      window.removeEventListener("mousedown", noFocus);
    };
  }, []);
}

/** Hides controls in fullscreen video after a short idle period. */
export function useIdle(active: boolean, ms = 2500) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!active) {
      setIdle(false);
      return;
    }
    let t = window.setTimeout(() => setIdle(!engine.paused), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = window.setTimeout(() => setIdle(!engine.paused), ms);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [active, ms]);
  return idle;
}
