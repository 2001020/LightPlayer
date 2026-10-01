// Weather theme background: an animated sky behind the whole app, and a
// foreground layer (above the UI, click-through) where rain, snow and hail
// land on the play bar, dialogs and cover art.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { skyColors, type Scene } from "../core/weather/scene";
import { onCloudReady } from "./weather/cloudBank";
import { WeatherRenderer, type LedgeRect } from "./weather/effects";

/** Elements precipitation can land on (their top edge). */
const LEDGES = ".transport, .dialog, .now-playing .cover, .video-host, .lib-card .art, .lib-hero .art, .popover";

function readLedges(): LedgeRect[] {
  const out: LedgeRect[] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const el of document.querySelectorAll(LEDGES)) {
    const r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 8 || r.top < 2 || r.top > vh - 4 || r.right < 0 || r.left > vw) continue;
    // Skip edges that are scrolled away or covered by something else.
    const probe = document.elementFromPoint(Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), r.top + 3);
    if (!probe || !(el === probe || el.contains(probe))) continue;
    out.push({ el, left: Math.max(0, r.left), right: Math.min(vw, r.right), top: r.top });
  }
  return out;
}

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function WeatherSky({ scene, motion, paused }: { scene: Scene; motion: boolean; paused: boolean }) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<WeatherRenderer | null>(null);
  const [broken, setBroken] = useState(false);

  // Crossfade between two gradient layers when the sky changes.
  const colors = skyColors(scene).join(",");
  const [layers, setLayers] = useState({ a: colors, b: colors, front: "a" as "a" | "b" });
  useEffect(() => {
    setLayers((l) => {
      const shown = l.front === "a" ? l.a : l.b;
      if (shown === colors) return l;
      return l.front === "a" ? { ...l, b: colors, front: "b" } : { ...l, a: colors, front: "a" };
    });
  }, [colors]);

  useEffect(() => {
    if (!bgRef.current || !fgRef.current || broken) return;
    const r = new WeatherRenderer(bgRef.current, fgRef.current, scene);
    renderer.current = r;
    const size = () => {
      r.resize(window.innerWidth, window.innerHeight, Math.min(1.5, window.devicePixelRatio || 1));
      // Same frame as the resize: no blank or stretched canvas in between.
      try {
        r.redraw();
      } catch {
        /* the animation loop reports errors */
      }
    };
    size();
    window.addEventListener("resize", size);
    return () => {
      window.removeEventListener("resize", size);
      renderer.current = null;
    };
    // The renderer follows scene changes through setScene below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broken]);

  useEffect(() => {
    renderer.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    const r = renderer.current;
    if (!r || broken) return;
    // Paused (fullscreen video) or still: one static frame, foreground cleared.
    const animate = motion && !paused && !reducedMotion();
    let raf = 0;
    let last = performance.now();
    let lastLedges = 0;
    const draw = (now: number) => {
      try {
        if (now - lastLedges > 400) {
          lastLedges = now;
          r.setLedges(animate ? readLedges() : []);
        }
        r.frame(Math.min(0.05, (now - last) / 1000), animate);
      } catch (e) {
        console.warn("weather effects", e);
        setBroken(true);
        return;
      }
      last = now;
      if (animate && document.visibilityState === "visible") raf = requestAnimationFrame(draw);
    };
    const wake = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(draw);
    };
    wake();
    // A still sky is drawn once; draw again as cloud textures arrive.
    const offClouds = onCloudReady(() => !animate && wake());
    const onVis = () => document.visibilityState === "visible" && wake();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", wake);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", wake);
      offClouds();
    };
  }, [motion, paused, broken, scene]);

  const grad = (c: string) => `linear-gradient(to bottom, ${c.split(",")[0]} 0%, ${c.split(",")[1]} 55%, ${c.split(",")[2]} 100%)`;
  return (
    <>
      <div className="weather-sky" style={{ background: grad(layers.a), opacity: layers.front === "a" ? 1 : 0 }} />
      <div className="weather-sky" style={{ background: grad(layers.b), opacity: layers.front === "b" ? 1 : 0 }} />
      {!broken && <canvas ref={bgRef} className="weather-canvas" />}
      <div className="weather-dim" />
      {!broken && createPortal(<canvas ref={fgRef} className="weather-fg" />, document.body)}
    </>
  );
}
