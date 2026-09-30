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
    const bins = 28;
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

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#66ccff";
      // Vertical bars rising from the bottom edge (right above the control bar).
      // Bass sits next to the lyrics column, treble towards the window edge.
      const pad = 14;
      const usable = Math.max(40, w - pad * 2);
      const base = h - 2;
      const maxH = Math.min(h * 0.42, 220);
      const xAt = (i: number) => {
        const k = (i + 0.5) / bins;
        return side === "left" ? pad + usable * (1 - k) : pad + usable * k;
      };
      const grad = ctx.createLinearGradient(0, base - maxH, 0, base);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, accent);
      ctx.globalAlpha = 0.32;
      ctx.lineCap = "round";

      if (style === "bars") {
        const step = usable / bins;
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(2, Math.min(6, step * 0.5));
        for (let i = 0; i < bins; i++) {
          const bh = smooth[i] * maxH;
          if (bh < 2) continue;
          const x = xAt(i);
          ctx.beginPath();
          ctx.moveTo(x, base);
          ctx.lineTo(x, base - bh);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(xAt(0), base);
        for (let i = 0; i < bins; i++) ctx.lineTo(xAt(i), base - smooth[i] * maxH);
        ctx.lineTo(xAt(bins - 1), base);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < bins; i++) {
          const x = xAt(i);
          const y = base - smooth[i] * maxH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Soften the outer end so the animation fades into the window edge.
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "destination-out";
      const fade = ctx.createLinearGradient(0, 0, w, 0);
      const outer = side === "left" ? 0 : 1;
      fade.addColorStop(outer, "rgba(0,0,0,0.85)");
      fade.addColorStop(side === "left" ? 0.35 : 0.65, "rgba(0,0,0,0)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [side, style, path]);

  return <canvas ref={canvas} />;
}
