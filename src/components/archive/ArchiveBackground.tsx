// The archive theme's background: the 3D field behind the whole window. The
// scene (and three.js) loads only when this theme is chosen.

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { usePlayer, useUI } from "../../stores/player";
import { useSettings } from "../../stores/settings";
import type { ArchiveScene } from "./scene";

interface ArchiveState {
  scene: ArchiveScene | null;
  /** The song under the pointer (index in the playlist). */
  hover: number | null;
  /** The song brought forward by the wheel or by playback. */
  chosen: number;
  failed: boolean;
}

export const useArchive = create<ArchiveState>(() => ({ scene: null, hover: null, chosen: -1, failed: false }));

/** The archive view shows on the player page with no media or a song. */
export function useArchiveActive() {
  const archive = useSettings((s) => s.theme === "archive");
  const page = useUI((s) => s.page);
  const kind = usePlayer((s) => s.media?.kind ?? null);
  return archive && page === "player" && kind !== "video";
}

export function ArchiveBackground() {
  const host = useRef<HTMLDivElement>(null);
  const active = useArchiveActive();
  const quality = useSettings((s) => s.archive.quality);
  const motion = useSettings((s) => s.archive.motion);
  const playing = usePlayer((s) => s.playing);
  const scene = useArchive((s) => s.scene);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.bg = "archive";
    let disposed = false;
    let made: ArchiveScene | null = null;
    void import("./scene")
      .then(async ({ ArchiveScene }) => {
        if (disposed || !host.current) return;
        made = new ArchiveScene(host.current);
        made.onHover = (hover) => useArchive.getState().hover !== hover && useArchive.setState({ hover });
        await made.load(`${import.meta.env.BASE_URL}archive/archive-cassette.glb`);
        if (disposed) return;
        useArchive.setState({ scene: made, failed: false });
      })
      .catch((e) => {
        console.warn("archive scene", e);
        if (!disposed) useArchive.setState({ failed: true });
      });
    return () => {
      disposed = true;
      delete root.dataset.bg;
      made?.dispose();
      useArchive.setState({ scene: null, hover: null, chosen: -1 });
    };
  }, []);

  useEffect(() => scene?.setQuality(quality), [scene, quality]);
  useEffect(() => scene?.setMotion(motion), [scene, motion]);
  useEffect(() => scene?.setPlaying(playing), [scene, playing]);
  useEffect(() => scene?.setActive(active), [scene, active]);

  return (
    <>
      <div className="bg-layer" />
      <div ref={host} className={`archive-field ${active ? "" : "covered"}`} aria-hidden="true" />
    </>
  );
}

/** Edges of the window that show the title bar / play bar when the pointer is near. */
const TOP_EDGE = 56;
const BOTTOM_EDGE = 110;

/**
 * In the archive view the title bar and play bar stay hidden: they fade in
 * while the pointer is near their edge (or over them, or a menu of theirs is
 * open), and the play bar shows for a moment after a key press.
 */
export function useArchiveChrome(active: boolean) {
  const [show, setShow] = useState({ top: false, bottom: false });
  useEffect(() => {
    if (!active) {
      setShow({ top: false, bottom: false });
      return;
    }
    let keyUntil = 0;
    let timer = 0;
    let last = { x: -1, y: -1 };
    const update = () => {
      const { x, y } = last;
      const over = (sel: string) => {
        const el = x >= 0 ? document.elementFromPoint(x, y) : null;
        return !!el?.closest(sel);
      };
      const menu = !!document.querySelector(".transport .popover, .ctx-menu");
      const top = (y >= 0 && y < TOP_EDGE) || over(".titlebar");
      const bottom = (y >= 0 && y > window.innerHeight - BOTTOM_EDGE) || over(".transport") || menu || Date.now() < keyUntil;
      setShow((s) => (s.top === top && s.bottom === bottom ? s : { top, bottom }));
    };
    const move = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      update();
    };
    const leave = () => {
      last = { x: -1, y: -1 };
      update();
    };
    const key = (e: KeyboardEvent) => {
      // Shift alone steers the wheel sideways; it is not a command.
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      keyUntil = Date.now() + 2500;
      update();
      clearTimeout(timer);
      timer = window.setTimeout(update, 2600);
    };
    // Menus open and close without the pointer moving.
    const poll = window.setInterval(update, 500);
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(poll);
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("keydown", key);
    };
  }, [active]);
  return show;
}
