// Subtle real-time audio visualisation for the sides of the lyrics page.
// Uses the Web Audio analyser when available; otherwise falls back to a
// precomputed loudness envelope from the backend.

import { useEffect, useRef } from "react";
import { engine } from "../core/player/engine";
import { api, isTauri } from "../lib/ipc";
import { usePlayer } from "../stores/player";

const envCache = new Map<string, number[]>();

export function Waveform({ side, style }: { side: "left" | "right"; style: "bars" | "wave" }) {
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
    const bins = 40;
    const smooth = new Float32Array(bins);
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
      const target = new Float32Array(bins);
      let energy = 0;
      if (engine.analyser && playing) {
        engine.analyser.getByteFrequencyData(freq);
        for (let i = 0; i < bins; i++) {
          // Log-ish mapping so bass doesn't dominate the column.
          const a = Math.floor(Math.pow(i / bins, 1.6) * 100);
          const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / bins, 1.6) * 100));
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
          for (let i = 0; i < bins; i++) {
            const shape = 0.55 + 0.45 * Math.sin(i * 0.7 + now / 420 + (side === "left" ? 0 : 1.3));
            target[i] = v * shape * (1 - i / bins / 1.6);
          }
        }
      }
      for (let i = 0; i < bins; i++) {
        const k = target[i] > smooth[i] ? 0.35 : 0.08;
        smooth[i] += (target[i] - smooth[i]) * (reduced ? 1 : k);
      }

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7c5cff";
      const maxLen = Math.min(w * 0.8, 180);
      const inner = side === "left" ? w - 12 : 12;
      const dir = side === "left" ? -1 : 1;
      const top = h * 0.12;
      const span = h * 0.76;
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineCap = "round";

      if (style === "bars") {
        const gap = span / bins;
        ctx.lineWidth = Math.max(2, gap * 0.38);
        for (let i = 0; i < bins; i++) {
          // Low frequencies at the bottom.
          const y = top + span - (i + 0.5) * gap;
          const len = 2 + smooth[i] * maxLen;
          if (len < 3) continue;
          ctx.beginPath();
          ctx.moveTo(inner, y);
          ctx.lineTo(inner + dir * len, y);
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i <= bins; i++) {
          const v = smooth[Math.min(bins - 1, i)];
          const y = top + span - (i / bins) * span;
          const x = inner + dir * (6 + v * maxLen);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.07;
        ctx.lineTo(inner, top);
        ctx.lineTo(inner, top + span);
        ctx.closePath();
        ctx.fill();
      }
      // Fade the ends.
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "destination-out";
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.18, "rgba(0,0,0,0)");
      g.addColorStop(0.82, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [side, style, path]);

  return <canvas ref={canvas} />;
}
