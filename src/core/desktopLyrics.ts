// Feeds the desktop lyrics window (a separate, always-on-top window) and keeps
// the play bar button in sync with it.
//
// The window works out the current line itself from the lyric lines and a
// playback anchor (position, wall-clock time, playing, rate): it stays on
// screen, while the main window's timers stop or slow down once it is hidden
// or minimised. The main window only sends new anchors when playback jumps or
// changes state, plus an occasional resync.

import { create } from "zustand";
import { api, isTauri, on } from "../lib/ipc";
import { useLyrics, usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { engine } from "./player/engine";
import { findLineIndex, spokenLines } from "./lyrics/lrc";

export interface DesktopLine {
  /** Changes whenever the shown line changes (drives the line animation). */
  key: string;
  text: string;
  color: string;
}

export interface DesktopAnchor {
  /** Playback position (seconds) at `at`. */
  pos: number;
  /** Date.now() when `pos` was read. */
  at: number;
  playing: boolean;
  rate: number;
}

export interface DesktopState {
  /** Identifies the song and lyrics. */
  key: string;
  /** Synced lines to follow; empty shows `fallback`. */
  lines: { time: number; text: string }[];
  /** Shown before the first line, or when there are no synced lyrics. */
  fallback: string;
  /** User lyric offset (seconds). */
  offset: number;
  color: string;
  anchor: DesktopAnchor;
}

export const EMPTY_STATE: DesktopState = {
  key: "none",
  lines: [],
  fallback: "LightPlayer",
  offset: 0,
  color: "#66ccff",
  anchor: { pos: 0, at: 0, playing: false, rate: 1 },
};

/** The last state sent (also drives the browser preview). */
export const useDesktopState = create<DesktopState>(() => EMPTY_STATE);

export const DESKTOP_EVENTS = {
  state: "desktop-lyrics://state",
  anchor: "desktop-lyrics://anchor",
  ready: "desktop-lyrics://ready",
  closed: "desktop-lyrics://closed",
  color: "desktop-lyrics://color",
} as const;

/** Playback position `now` according to an anchor. */
export function anchorPosition(a: DesktopAnchor, now = Date.now()): number {
  return a.pos + (a.playing ? ((now - a.at) / 1000) * a.rate : 0);
}

/** The line to show at `now`. */
export function lineAt(s: DesktopState, now = Date.now()): DesktopLine {
  if (s.lines.length) {
    const i = findLineIndex(s.lines, anchorPosition(s.anchor, now) + s.offset);
    if (i >= 0) return { key: `${s.key}|${i}`, text: s.lines[i].text, color: s.color };
  }
  return { key: `${s.key}|title`, text: s.fallback, color: s.color };
}

function anchorNow(): DesktopAnchor {
  return { pos: engine.position, at: Date.now(), playing: !engine.paused && !engine.waiting, rate: engine.rate };
}

function build(): DesktopState {
  const s = useSettings.getState();
  const color = s.desktopLyrics.color;
  const media = usePlayer.getState().media;
  if (!media) return { ...EMPTY_STATE, color, anchor: anchorNow() };
  const { status, lyrics } = useLyrics.getState();
  const title = media.meta?.title || media.name;
  const artist = media.meta?.artist;
  const synced = media.kind === "audio" && status === "loaded" && !!lyrics?.synced;
  return {
    key: `${media.path}|${synced ? lyrics!.lines.length : 0}`,
    lines: synced ? spokenLines(lyrics!.lines).map((l) => ({ time: l.time ?? 0, text: l.text || l.translation || "" })) : [],
    fallback: artist ? `${title} - ${artist}` : title,
    offset: s.lyricOffsets[media.path] ?? 0,
    color,
    anchor: anchorNow(),
  };
}

async function emit(event: string, payload: unknown) {
  if (!isTauri) return;
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("desktop-lyrics", event, payload);
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
  const enabled = () => useSettings.getState().desktopLyrics.enabled;

  const sendState = () => {
    const next = build();
    useDesktopState.setState(next, true);
    void emit(DESKTOP_EVENTS.state, next);
  };
  let lastSync = 0;
  const sendAnchor = () => {
    const anchor = anchorNow();
    lastSync = anchor.at;
    useDesktopState.setState({ anchor });
    void emit(DESKTOP_EVENTS.anchor, anchor);
  };

  // A new anchor when playback starts, stops, changes speed or jumps (seek,
  // reload), and every few seconds while playing to absorb clock drift.
  usePlayer.subscribe((p, prev) => {
    if (!enabled()) return;
    if (p.media !== prev.media) return sendState();
    const a = useDesktopState.getState().anchor;
    const playing = !engine.paused && !engine.waiting;
    const drift = Math.abs(anchorPosition(a) - engine.position);
    if (playing !== a.playing || engine.rate !== a.rate || drift > 0.25 || (playing && Date.now() - lastSync > 4000)) sendAnchor();
  });
  useLyrics.subscribe((l, prev) => {
    if (enabled() && (l.lyrics !== prev.lyrics || l.status !== prev.status)) sendState();
  });

  const show = (on: boolean) => {
    if (isTauri) void api.desktopLyricsSet(on).catch((e) => console.warn("desktop lyrics", e));
    if (on) sendState();
  };
  useSettings.subscribe((s, p) => {
    if (s.desktopLyrics.enabled !== p.desktopLyrics.enabled) show(s.desktopLyrics.enabled);
    else if (enabled() && (s.desktopLyrics.color !== p.desktopLyrics.color || s.lyricOffsets !== p.lyricOffsets)) sendState();
  });
  if (isTauri) {
    // The window asks for the state once it has loaded.
    await on(DESKTOP_EVENTS.ready, () => sendState());
    await on(DESKTOP_EVENTS.closed, () => setDesktopLyrics(false));
    await on<string>(DESKTOP_EVENTS.color, (c) => setDesktopLyricsColor(c));
  }
  if (enabled()) show(true);
}
