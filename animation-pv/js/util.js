// Shared helpers for the LightPlayer promo film: easing, timing envelopes,
// deterministic random numbers and small Canvas2D utilities.
(function () {
  const PV = (window.PV = window.PV || {});

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };

  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOutExpo: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    // The app's --ease: cubic-bezier(0.2, 0.8, 0.2, 1).
    app: bezier(0.2, 0.8, 0.2, 1),
    // Apple-like gentle curve.
    apple: bezier(0.25, 0.1, 0.25, 1),
    outBack: (t) => {
      const c1 = 1.4;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  /** CSS cubic-bezier timing function. */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 6; i++) {
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= (sx(t) - x) / d;
      }
      t = clamp(t);
      return sy(t);
    };
  }

  /** 0..1 progress of t through [a, b], eased. */
  function prog(t, a, b, fn = ease.linear) {
    return fn(clamp((t - a) / (b - a)));
  }

  /** Fade-in / hold / fade-out envelope over [a, b]. */
  function envelope(t, a, b, fin = 0.5, fout = 0.5, fn = ease.inOutSine) {
    if (t <= a || t >= b) return 0;
    const i = fin > 0 ? fn(clamp((t - a) / fin)) : 1;
    const o = fout > 0 ? fn(clamp((b - t) / fout)) : 1;
    return Math.min(i, o);
  }

  /** Deterministic hash in [0, 1). */
  function hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  /** Small seeded generator (mulberry32). */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function mixHex(a, b, t) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    const f = (i) => Math.round(x[i] + (y[i] - x[i]) * t);
    return `#${((1 << 24) | (f(0) << 16) | (f(1) << 8) | f(2)).toString(16).slice(1)}`;
  }

  /** Rounded rectangle path (radius may be a number or [tl, tr, br, bl]). */
  function rr(ctx, x, y, w, h, r) {
    const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
    const m = Math.min(w, h) / 2;
    const c = (v) => Math.max(0, Math.min(v, m));
    ctx.beginPath();
    ctx.moveTo(x + c(tl), y);
    ctx.lineTo(x + w - c(tr), y);
    ctx.arcTo(x + w, y, x + w, y + c(tr), c(tr));
    ctx.lineTo(x + w, y + h - c(br));
    ctx.arcTo(x + w, y + h, x + w - c(br), y + h, c(br));
    ctx.lineTo(x + c(bl), y + h);
    ctx.arcTo(x, y + h, x, y + h - c(bl), c(bl));
    ctx.lineTo(x, y + c(tl));
    ctx.arcTo(x, y, x + c(tl), y, c(tl));
    ctx.closePath();
  }

  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    return c;
  }

  PV.util = { clamp, lerp, smooth, ease, bezier, prog, envelope, hash, rng, hexToRgb, rgba, mixHex, rr, canvas };
})();
