// Subtle real-time audio visualisation: a low strip of vertical bars right
// above the control bar, spanning its full width and mirrored from the
// centre (bass in the middle, treble towards both ends). Uses the Web Audio
// analyser when available; otherwise falls back to a precomputed loudness
// envelope from the backend.

import { useEffect, useRef } from "react";
import { engine } from "../core/player/engine";
import { api, isTauri } from "../lib/ipc";
import { usePlayer } from "../stores/player";

const envCache = new Map<string, number[]>();

/** Bars per half (the strip is mirrored, so twice as many are drawn). */
const HALF = 32;
/** Tallest bar in CSS pixels. */
const MAX_BAR = 52;

export function Waveform({ style }: { style: "bars" | "wave" }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const path = usePlayer((s) => s.media?.path);

  useEffect(() => {
    if (path && isTauri && !envCache.has(path)) {
      envCache.set(path, []);
      api
        .waveformEnvelope(path)
        .then((e) => envCache.set(path, e))
        .catch(() => {});
    }
  }, [path]);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let last = 0;
    let silentSince = performance.now();
    const smooth = new Float32Array(HALF);
    const freq = new Uint8Array(128);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33 || document.hidden) return; // ~30 fps
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const playing = !engine.paused;
      const target = new Float32Array(HALF);
      let energy = 0;
      if (engine.analyser && playing) {
        engine.analyser.getByteFrequencyData(freq);
        for (let i = 0; i < HALF; i++) {
          // Log-ish mapping so bass doesn't dominate.
          const a = Math.floor(Math.pow(i / HALF, 1.6) * 100);
          const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / HALF, 1.6) * 100));
          let s = 0;
          for (let k = a; k < b; k++) s += freq[k];
          target[i] = s / (b - a) / 255;
          energy += target[i];
        }
      }
      if (energy > 0.01) silentSince = now;
      if (playing && energy <= 0.01 && now - silentSince > 1500 && path) {
        // Fallback: envelope-driven pseudo spectrum.
        const env = envCache.get(path);
        if (env && env.length) {
          const idx = Math.min(env.length - 1, Math.floor(engine.position * 20));
          const v = env[idx] / 255;
          for (let i = 0; i < HALF; i++) {
            const shape = 0.55 + 0.45 * Math.sin(i * 0.7 + now / 420);
            target[i] = v * shape * (1 - i / HALF / 1.6);
          }
        }
      }
      for (let i = 0; i < HALF; i++) {
        const k = target[i] > smooth[i] ? 0.35 : 0.08;
        smooth[i] += (target[i] - smooth[i]) * (reduced ? 1 : k);
      }

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#66ccff";
      const pad = 18;
      const usable = Math.max(40, w - pad * 2);
      const cols = HALF * 2;
      const step = usable / cols;
      const base = h - 1;
      const maxH = Math.min(h - 4, MAX_BAR);
      // Column j (left to right) → frequency bin, mirrored around the centre.
      const binOf = (j: number) => (j < HALF ? HALF - 1 - j : j - HALF);
      const xAt = (j: number) => pad + step * (j + 0.5);
      const grad = ctx.createLinearGradient(0, base - maxH, 0, base);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, accent);
      ctx.lineCap = "round";

      if (style === "bars") {
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(2, Math.min(5, step * 0.42));
        for (let j = 0; j < cols; j++) {
          const bh = smooth[binOf(j)] * maxH;
          if (bh < 2) continue;
          const x = xAt(j);
          ctx.beginPath();
          ctx.moveTo(x, base);
          ctx.lineTo(x, base - bh);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(xAt(0), base);
        for (let j = 0; j < cols; j++) ctx.lineTo(xAt(j), base - smooth[binOf(j)] * maxH);
        ctx.lineTo(xAt(cols - 1), base);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.24;
        ctx.fill();
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let j = 0; j < cols; j++) {
          const x = xAt(j);
          const y = base - smooth[binOf(j)] * maxH;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Fade both ends into the window edges.
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "destination-out";
      const fade = ctx.createLinearGradient(0, 0, w, 0);
      fade.addColorStop(0, "rgba(0,0,0,0.9)");
      fade.addColorStop(0.16, "rgba(0,0,0,0)");
      fade.addColorStop(0.84, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.9)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [style, path]);

  return <canvas ref={canvas} />;
}
