// Captions: large headlines and supporting lines in the style of Apple
// product films. Headlines reveal word by word (one character at a time in
// Chinese), rising out of a soft blur. Drawn on a 2D canvas (1920 x 1080
// design units) that the final GLSL pass lays over the picture.
(function () {
  const PV = (window.PV = window.PV || {});
  const { clamp, ease } = PV.util;

  const DISPLAY = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Microsoft YaHei", "Noto Sans CJK SC", "Inter", "Noto Sans SC", "WenQuanYi Zen Hei", sans-serif';

  const STYLES = {
    intro: { size: 104, weight: 700, color: "#f5f5f7", ls: -1.5 },
    hero: { size: 96, weight: 700, color: "grad", ls: -1.5 },
    title: { size: 76, weight: 700, color: "#f5f5f7", ls: -1 },
    titleGrad: { size: 76, weight: 700, color: "grad", ls: -1 },
    sub: { size: 34, weight: 500, color: "#a1a1a6", ls: 0, lh: 1.35 },
    subBright: { size: 34, weight: 500, color: "#d2d2d7", ls: 0, lh: 1.35 },
    col: { size: 36, weight: 700, color: "#f5f5f7", ls: -0.3 },
    colsub: { size: 22, weight: 500, color: "#86868b", ls: 0 },
    small: { size: 26, weight: 500, color: "#86868b", ls: 0 },
    mark: { size: 84, weight: 700, color: "#f5f5f7", ls: -1.5 },
    url: { size: 28, weight: 500, color: "#66ccff", ls: 0.2 },
  };
  const STAGGER = 0.045;

  function createCaptions(world, copy) {
    const canvas = world.capCanvas;
    const ctx = canvas.getContext("2d");
    let key = "";
    const hasFilter = "filter" in ctx;

    function resize(w, h) {
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        key = "";
      }
    }

    function gradFor(x0, x1, y) {
      const g = ctx.createLinearGradient(x0, y, x1, y);
      g.addColorStop(0, "#9be3ff");
      g.addColorStop(0.5, "#66ccff");
      g.addColorStop(1, "#b9a4ff");
      return g;
    }

    function wrapLines(text, maxW) {
      const out = [];
      for (const para of text.split("\n")) {
        if (!maxW) {
          out.push(para);
          continue;
        }
        const toks = para.match(/[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]|[^\s\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]+|\s+/g) || [];
        let cur = "";
        for (const t of toks) {
          const test = cur + t;
          if (ctx.measureText(test.trimEnd()).width > maxW && cur.trim()) {
            if (/[\uff0c\u3002\u3001\uff1b\uff1a\uff01\uff1f]/.test(t)) {
              out.push(test.trimEnd());
              cur = "";
              continue;
            }
            out.push(cur.trimEnd());
            cur = t.trimStart();
          } else cur = test;
        }
        if (cur.trim()) out.push(cur.trimEnd());
      }
      return out;
    }

    /** Splits a line into reveal units: CJK characters, or words with their spaces. */
    function units(line) {
      return line.match(/[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f][\uff0c\u3002\u3001\uff1b\uff1a\uff01\uff1f]?|[^\s\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]+\s*|\s+/g) || [line];
    }

    /**
     * Draws the captions active at time t. Each item: { t0, t1, text, style,
     * x, y, align, fin, fout, max, rise, stagger, zoom }.
     */
    function draw(t, items) {
      const active = [];
      for (const c of items) {
        if (t < c.t0 || t > c.t1) continue;
        const fin = c.fin ?? 0.55;
        const fout = c.fout ?? 0.25;
        const span = c.stagger ? fin + STAGGER * c.text.length : fin;
        const kout = clamp((c.t1 - t) / fout);
        if (kout <= 0) continue;
        const local = t - c.t0;
        active.push({ c, fin, local, kout, state: local < span ? local.toFixed(3) : "h" });
      }
      const k = active.map(({ c, state, kout }) => `${c.text}|${state}|${kout.toFixed(3)}|${c.x}|${c.y}`).join("#") + `@${canvas.width}`;
      if (k === key) return false;
      key = k;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const s = canvas.width / 1920;
      for (const { c, fin, local, kout } of active) {
        const st = { ...STYLES[c.style || "title"], ...(c.size ? { size: c.size } : {}) };
        const eout = ease.inOutSine(kout);
        const rise = c.rise ?? (c.stagger ? 0.32 * st.size : 30);
        ctx.save();
        ctx.setTransform(s, 0, 0, s, 0, 0);
        if (c.zoom) {
          // headline settles from slightly larger, Apple keynote style
          const z = 1 + 0.08 * (1 - ease.outExpo(clamp(local / 0.9)));
          ctx.translate(c.x, c.y);
          ctx.scale(z, z);
          ctx.translate(-c.x, -c.y);
        }
        ctx.font = `${st.weight} ${st.size}px ${DISPLAY}`;
        if ("letterSpacing" in ctx) ctx.letterSpacing = `${st.ls || 0}px`;
        ctx.textBaseline = "middle";
        const lines = wrapLines(c.text, c.max);
        const lh = st.size * (st.lh || 1.16);
        const exitDy = -10 * (1 - eout);
        const y0 = c.y + exitDy - ((lines.length - 1) * lh) / 2;
        let idx = 0;
        lines.forEach((line, li) => {
          const w = ctx.measureText(line).width;
          const ax = c.align === "left" ? c.x : c.align === "right" ? c.x - w : c.x - w / 2;
          const ly = y0 + li * lh;
          const fill = st.color === "grad" ? gradFor(ax, ax + w, ly) : st.color;
          const parts = c.stagger ? units(line) : [line];
          let x = ax;
          for (const part of parts) {
            const pw = ctx.measureText(part).width;
            const kin = clamp((local - idx * STAGGER) / fin);
            if (c.stagger && part.trim()) idx++;
            const ein = ease.outCubic(kin);
            const alpha = Math.min(ein, eout);
            if (alpha > 0.002) {
              const blur = 12 * (1 - ein) + 8 * (1 - eout);
              ctx.globalAlpha = alpha;
              ctx.filter = hasFilter && blur > 0.3 ? `blur(${(blur * s).toFixed(2)}px)` : "none";
              ctx.fillStyle = fill;
              ctx.textAlign = "left";
              if (c.glow) {
                ctx.shadowColor = "rgba(102, 204, 255, 0.55)";
                ctx.shadowBlur = 30 * s;
              }
              ctx.fillText(part, x, ly + rise * (1 - ein));
            }
            x += pw;
          }
        });
        ctx.restore();
      }
      return true;
    }

    return { resize, draw, STYLES };
  }

  PV.createCaptions = createCaptions;
})();
