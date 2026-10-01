// Procedural artwork drawn with Canvas2D: album covers for the demo library
// and the LightPlayer app icon (same geometry as assets/icon.svg).
(function () {
  const PV = (window.PV = window.PV || {});
  const { rng, canvas, rr } = PV.util;

  const cache = new Map();

  function grain(ctx, size, amount, seed) {
    const r = rng(seed);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * amount;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function blob(ctx, x, y, r, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  function vgrad(ctx, s, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  const styles = [
    // 0: light blue sky with soft clouds (the hero song)
    (ctx, s, r) => {
      vgrad(ctx, s, [
        [0, "#2f7fe0"],
        [0.5, "#7cc6ff"],
        [0.82, "#d9efff"],
        [1, "#ffe3ec"],
      ]);
      blob(ctx, s * 0.72, s * 0.3, s * 0.38, "rgba(255,248,225,0.95)", 0.8);
      for (let i = 0; i < 60; i++) {
        const y = s * (0.55 + r() * 0.4);
        blob(ctx, r() * s, y, s * (0.05 + r() * 0.12), "rgba(255,255,255,0.9)", 0.35 + r() * 0.3);
      }
      for (let i = 0; i < 18; i++) blob(ctx, r() * s, s * (0.15 + r() * 0.25), s * (0.03 + r() * 0.07), "rgba(255,255,255,0.8)", 0.25);
      // a single bird line
      ctx.strokeStyle = "rgba(20,40,80,0.55)";
      ctx.lineWidth = s * 0.006;
      ctx.lineCap = "round";
      ctx.beginPath();
      const bx = s * 0.3;
      const by = s * 0.34;
      ctx.moveTo(bx - s * 0.03, by - s * 0.012);
      ctx.quadraticCurveTo(bx - s * 0.012, by - s * 0.016, bx, by);
      ctx.quadraticCurveTo(bx + s * 0.012, by - s * 0.016, bx + s * 0.03, by - s * 0.014);
      ctx.stroke();
    },
    // 1: coastline at dusk
    (ctx, s, r) => {
      vgrad(ctx, s, [
        [0, "#f6b18e"],
        [0.45, "#f7d6c0"],
        [0.55, "#3c6e9e"],
        [1, "#123456"],
      ]);
      blob(ctx, s * 0.5, s * 0.52, s * 0.22, "rgba(255,226,180,1)", 0.9);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let i = 0; i < 26; i++) {
        const y = s * (0.56 + i * 0.017);
        const w = s * (0.1 + r() * 0.5);
        ctx.fillRect(s * 0.5 - w / 2 + (r() - 0.5) * s * 0.1, y, w, s * 0.004);
      }
    },
    // 2: midnight radio, neon arcs
    (ctx, s, r) => {
      vgrad(ctx, s, [
        [0, "#0b0f2a"],
        [1, "#1b1145"],
      ]);
      ctx.lineCap = "round";
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = i % 2 ? "rgba(255,77,141,0.85)" : "rgba(102,204,255,0.85)";
        ctx.lineWidth = s * 0.012;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = s * 0.03;
        ctx.beginPath();
        ctx.arc(s * 0.5, s * 0.78, s * (0.08 + i * 0.07), Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.78, s * 0.025, 0, Math.PI * 2);
      ctx.fill();
      void r;
    },
    // 3: summer echoes, sun and stripes
    (ctx, s) => {
      vgrad(ctx, s, [
        [0, "#ff9a3c"],
        [1, "#ffd166"],
      ]);
      ctx.fillStyle = "#ff5e3a";
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd166";
      for (let i = 0; i < 7; i++) ctx.fillRect(0, s * (0.55 + i * 0.045), s, s * (0.008 + i * 0.004));
    },
    // 4: paper planes on mint
    (ctx, s, r) => {
      vgrad(ctx, s, [
        [0, "#c9f2e3"],
        [1, "#8fd8c4"],
      ]);
      for (let i = 0; i < 7; i++) {
        const x = s * (0.15 + r() * 0.7);
        const y = s * (0.15 + r() * 0.7);
        const k = s * (0.06 + r() * 0.08);
        const a = -0.6 + r() * 0.4;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(-k, -k * 0.55);
        ctx.lineTo(-k * 0.45, 0);
        ctx.lineTo(-k, k * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(60,120,110,0.25)";
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(-k * 0.45, 0);
        ctx.lineTo(-k, k * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
    // 5: city in the fog
    (ctx, s, r) => {
      vgrad(ctx, s, [
        [0, "#9aa9b8"],
        [1, "#e1e6ea"],
      ]);
      for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = ["rgba(90,105,125,0.45)", "rgba(60,72,90,0.6)", "rgba(30,38,52,0.85)"][layer];
        let x = 0;
        while (x < s) {
          const w = s * (0.04 + r() * 0.08);
          const h = s * (0.15 + r() * 0.35) * (0.6 + layer * 0.25);
          ctx.fillRect(x, s - h - layer * s * 0.02, w - s * 0.006, h + s);
          x += w;
        }
        blob(ctx, s * 0.5, s * 0.75, s * 0.7, "rgba(230,235,240,0.9)", 0.35);
      }
    },
    // 6: under the neon, synth grid
    (ctx, s) => {
      vgrad(ctx, s, [
        [0, "#1a0533"],
        [0.55, "#5b1a6e"],
        [0.551, "#12051f"],
        [1, "#12051f"],
      ]);
      const g = ctx.createLinearGradient(0, s * 0.2, 0, s * 0.55);
      g.addColorStop(0, "#ffd166");
      g.addColorStop(1, "#ff4d8d");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.55, s * 0.24, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#5b1a6e";
      for (let i = 0; i < 6; i++) ctx.fillRect(0, s * (0.42 + i * 0.024), s, s * (0.004 + i * 0.002));
      ctx.strokeStyle = "rgba(255,77,214,0.8)";
      ctx.lineWidth = s * 0.004;
      for (let i = 0; i < 9; i++) {
        const y = s * 0.55 + Math.pow(i / 8, 2) * s * 0.45;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
      }
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(s * 0.5 + i * s * 0.03, s * 0.55);
        ctx.lineTo(s * 0.5 + i * s * 0.16, s);
        ctx.stroke();
      }
    },
    // 7: distant hills
    (ctx, s, r) => {
      vgrad(ctx, s, [
        [0, "#e9f5ef"],
        [1, "#b9dcca"],
      ]);
      const cols = ["#8cc0a8", "#5e9e86", "#3b7a66", "#1f5446"];
      cols.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, s);
        const base = s * (0.45 + i * 0.13);
        for (let x = 0; x <= s; x += s / 40) {
          const y = base - Math.sin(x / s * (3 + i) + i * 2 + r() * 0.2) * s * 0.06 - Math.sin(x / s * 9 + i) * s * 0.015;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(s, s);
        ctx.fill();
      });
    },
    // 8: take it slow, a calm curve
    (ctx, s) => {
      vgrad(ctx, s, [
        [0, "#f3e9dc"],
        [1, "#e6d3bd"],
      ]);
      ctx.strokeStyle = "#c0603d";
      ctx.lineWidth = s * 0.028;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s * 0.12, s * 0.75);
      ctx.bezierCurveTo(s * 0.35, s * 0.2, s * 0.55, s * 0.95, s * 0.88, s * 0.3);
      ctx.stroke();
      ctx.fillStyle = "#2f4858";
      ctx.beginPath();
      ctx.arc(s * 0.88, s * 0.3, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
    },
    // 9: saturday sea, moon and waves
    (ctx, s) => {
      vgrad(ctx, s, [
        [0, "#0d2b52"],
        [1, "#1d5f8f"],
      ]);
      blob(ctx, s * 0.7, s * 0.28, s * 0.2, "rgba(255,250,230,0.9)", 0.5);
      ctx.fillStyle = "#fffbe8";
      ctx.beginPath();
      ctx.arc(s * 0.7, s * 0.28, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `rgba(160,220,255,${0.25 + i * 0.1})`;
        ctx.lineWidth = s * 0.012;
        ctx.beginPath();
        const y0 = s * (0.55 + i * 0.075);
        for (let x = 0; x <= s; x += s / 60) ctx.lineTo(x, y0 + Math.sin(x / s * 14 + i * 1.3) * s * 0.015);
        ctx.stroke();
      }
    },
  ];

  /** Album cover `i` (0..9) as a square canvas. */
  function cover(i, size = 512) {
    const key = `${i}:${size}`;
    if (cache.has(key)) return cache.get(key);
    const c = canvas(size, size);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    styles[i % styles.length](ctx, size, rng(1000 + i * 77));
    grain(ctx, size, 10, 50 + i);
    cache.set(key, c);
    return c;
  }

  /**
   * The app icon (assets/icon.svg), drawn at `size` px. With `full`, the plate
   * fills the whole square (used as the face texture of the 3D icon).
   */
  function appIcon(size = 1024, { plate = true, full = false } = {}) {
    const key = `icon:${size}:${plate}:${full}`;
    if (cache.has(key)) return cache.get(key);
    const c = canvas(size, size);
    const ctx = c.getContext("2d");
    const k = size / 1024;
    if (full) {
      ctx.scale(size / 824, size / 824);
      ctx.translate(-100, -100);
      const g = ctx.createLinearGradient(100, 100, 924, 924);
      g.addColorStop(0, "#66CCFF");
      g.addColorStop(1, "#3D8BFF");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1024, 1024);
      const glow = ctx.createRadialGradient(100 + 824 * 0.3, 100 + 824 * 0.25, 0, 100 + 824 * 0.3, 100 + 824 * 0.25, 824 * 0.8);
      glow.addColorStop(0, "rgba(255,255,255,0.35)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1024, 1024);
    } else ctx.scale(k, k);
    if (plate && !full) {
      const g = ctx.createLinearGradient(100, 100, 924, 924);
      g.addColorStop(0, "#66CCFF");
      g.addColorStop(1, "#3D8BFF");
      rr(ctx, 100, 100, 824, 824, 190);
      ctx.fillStyle = g;
      ctx.fill();
      const glow = ctx.createRadialGradient(100 + 824 * 0.3, 100 + 824 * 0.25, 0, 100 + 824 * 0.3, 100 + 824 * 0.25, 824 * 0.8);
      glow.addColorStop(0, "rgba(255,255,255,0.35)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 40;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(420, 340);
    ctx.lineTo(700, 512);
    ctx.lineTo(420, 684);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    rr(ctx, 236, 452, 36, 120, 18);
    ctx.fill();
    rr(ctx, 300, 402, 36, 220, 18);
    ctx.fill();
    rr(ctx, 752, 432, 36, 160, 18);
    ctx.fill();
    ctx.globalAlpha = 1;
    cache.set(key, c);
    return c;
  }

  PV.art = { cover, appIcon, count: styles.length };
})();
