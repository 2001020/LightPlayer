// Feeds the desktop lyrics window (a separate, always-on-top window) with the
// current lyric line, and keeps the play bar button in sync with it.

import { create } from "zustand";
import { api, isTauri, on } from "../lib/ipc";
import { useLyrics, usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { findLineIndex } from "./lyrics/lrc";

export interface DesktopLine {
  /** Changes whenever the shown line changes (drives the line animation). */
  key: string;
  text: string;
  color: string;
}

export const useDesktopLine = create<DesktopLine>(() => ({ key: "", text: "", color: "#66ccff" }));

export const DESKTOP_EVENTS = {
  line: "desktop-lyrics://line",
  ready: "desktop-lyrics://ready",
  closed: "desktop-lyrics://closed",
  color: "desktop-lyrics://color",
} as const;

function current(): DesktopLine {
  const s = useSettings.getState();
  const color = s.desktopLyrics.color;
  const media = usePlayer.getState().media;
  if (!media) return { key: "none", text: "LightPlayer", color };
  const { status, lyrics } = useLyrics.getState();
  if (media.kind === "audio" && status === "loaded" && lyrics?.synced) {
    const offset = s.lyricOffsets[media.path] ?? 0;
    const i = findLineIndex(lyrics.lines, usePlayer.getState().position + offset);
    const line = lyrics.lines[i];
    return { key: `${media.path}|${i}`, text: line?.text || "♪", color };
  }
  const title = media.meta?.title || media.name;
  const artist = media.meta?.artist;
  return { key: `${media.path}|title`, text: artist ? `${title} - ${artist}` : title, color };
}

async function send(line: DesktopLine) {
  if (!isTauri) return;
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("desktop-lyrics", DESKTOP_EVENTS.line, line);
  } catch {
    /* the window may not exist yet */
  }
}

export function setDesktopLyrics(enabled: boolean) {
  const s = useSettings.getState();
  s.set({ desktopLyrics: { ...s.desktopLyrics, enabled } });
}

export function setDesktopLyricsColor(color: string) {
  const s = useSettings.getState();
  s.set({ desktopLyrics: { ...s.desktopLyrics, color } });
}

let started = false;

export async function startDesktopLyrics() {
  if (started) return;
  started = true;
  const update = () => {
    if (!useSettings.getState().desktopLyrics.enabled) return;
    const next = current();
    const prev = useDesktopLine.getState();
    if (next.key === prev.key && next.text === prev.text && next.color === prev.color) return;
    useDesktopLine.setState(next);
    void send(next);
  };
  usePlayer.subscribe(update);
  useLyrics.subscribe(update);
  const show = (on: boolean) => {
    if (isTauri) void api.desktopLyricsSet(on).catch((e) => console.warn("desktop lyrics", e));
    if (on) {
      useDesktopLine.setState({ key: "" });
      update();
    }
  };
  useSettings.subscribe((s, p) => {
    if (s.desktopLyrics.enabled !== p.desktopLyrics.enabled) show(s.desktopLyrics.enabled);
    else if (s.desktopLyrics.color !== p.desktopLyrics.color || s.lyricOffsets !== p.lyricOffsets) update();
  });
  if (isTauri) {
    // The window asks for the line once it has loaded.
    await on(DESKTOP_EVENTS.ready, () => void send(current()));
    await on(DESKTOP_EVENTS.closed, () => setDesktopLyrics(false));
    await on<string>(DESKTOP_EVENTS.color, (c) => setDesktopLyricsColor(c));
  }
  if (useSettings.getState().desktopLyrics.enabled) show(true);
}
