// LightPlayer UI, redrawn with Canvas2D at the app's own metrics (see
// src/styles/app.css and the React components). Everything is drawn in the
// window's logical pixels (1180 x 760, the default Tauri window); the caller
// sets the device scale on the context.
(function () {
  const PV = (window.PV = window.PV || {});
  const { rr, clamp, ease, lerp } = PV.util;
  const I = PV.icons;

  const W = 1180;
  const H = 760;
  const TITLE_H = 44;
  const TRANSPORT_H = 92;

  const ACCENT = {
    accent: "#66ccff",
    accentHover: "#85d6ff",
    accentText: "#66ccff",
    accentStrong: "#66ccff",
    accentSoft: "rgba(102, 204, 255, 0.2)",
    onAccent: "#ffffff",
  };

  const THEMES = {
    dark: {
      ...ACCENT,
      name: "dark",
      bg: "#111115",
      panel: "rgba(28, 28, 34, 0.72)",
      panelSolid: "#1c1c22",
      panel2: "rgba(255, 255, 255, 0.045)",
      hover: "rgba(255, 255, 255, 0.07)",
      border: "rgba(255, 255, 255, 0.09)",
      text: "#f2f2f5",
      textRgb: "242, 242, 245",
      textDim: "#a8a8b3",
      textFaint: "#6d6d78",
      track: "rgba(255, 255, 255, 0.14)",
      warnBg: "rgba(247, 181, 0, 0.16)",
      warnText: "#ffcf5c",
      danger: "#e5484d",
      halo: null,
      lyricDim: 0.48,
      lyricNear: 0.62,
    },
  };
  THEMES.weather = {
    ...THEMES.dark,
    name: "weather",
    bg: "#1b2433",
    panel: "rgba(22, 30, 48, 0.24)",
    panelSolid: "#1f2738",
    panel2: "rgba(255, 255, 255, 0.07)",
    hover: "rgba(255, 255, 255, 0.12)",
    border: "rgba(255, 255, 255, 0.16)",
    text: "#ffffff",
    textRgb: "255, 255, 255",
    textDim: "rgba(255, 255, 255, 0.82)",
    textFaint: "rgba(255, 255, 255, 0.62)",
    track: "rgba(255, 255, 255, 0.26)",
    halo: { color: "rgba(0, 0, 0, 0.32)", blur: 6, y: 1 },
    lyricDim: 0.66,
    lyricNear: 0.8,
  };
  // Bright skies (clear, partly, snow and fog by day) get a touch more glass.
  THEMES.weatherBright = {
    ...THEMES.weather,
    name: "weatherBright",
    panel: "rgba(18, 34, 64, 0.26)",
    halo: { color: "rgba(10, 30, 60, 0.45)", blur: 7, y: 1 },
  };
  // Controls on top of a full-screen picture always use this dark palette.
  THEMES.immersive = {
    ...THEMES.dark,
    name: "immersive",
    panel: "rgba(18, 18, 22, 0.62)",
    panel2: "rgba(255, 255, 255, 0.06)",
    hover: "rgba(255, 255, 255, 0.1)",
    border: "rgba(255, 255, 255, 0.1)",
    textDim: "#c4c4cc",
    textFaint: "#9a9aa6",
    track: "rgba(255, 255, 255, 0.2)",
  };

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return `${h ? h + ":" : ""}${mm}:${String(r).padStart(2, "0")}`;
  }

  function createUI(copy) {
    const U = copy.ui;
    const FONT = U.font;
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
    const hits = {};

    // ------------------------------------------------------------ primitives
    const scaleOf = (ctx) => {
      const m = ctx.getTransform();
      return Math.hypot(m.a, m.b);
    };
    function shadow(ctx, color, blur, ox = 0, oy = 0) {
      const s = scaleOf(ctx);
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * s;
      ctx.shadowOffsetX = ox * s;
      ctx.shadowOffsetY = oy * s;
    }
    function noShadow(ctx) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    function setFont(ctx, size, weight = 400, family = FONT) {
      ctx.font = `${weight} ${size}px ${family}`;
    }
    function spacing(ctx, px) {
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${px || 0}px`;
    }
    function measure(ctx, s, size, weight = 400, family = FONT, ls = 0) {
      setFont(ctx, size, weight, family);
      spacing(ctx, ls);
      const w = ctx.measureText(s).width;
      spacing(ctx, 0);
      return w;
    }
    /** Single-line text, vertically centred on y. Returns the drawn width. */
    function text(ctx, s, x, y, o = {}) {
      setFont(ctx, o.size || 14, o.weight || 400, o.family || FONT);
      spacing(ctx, o.ls);
      ctx.textAlign = o.align || "left";
      ctx.textBaseline = o.baseline || "middle";
      let str = String(s);
      if (o.max && ctx.measureText(str).width > o.max) {
        const chars = Array.from(str);
        while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > o.max) chars.pop();
        str = chars.join("") + "…";
      }
      if (o.halo) shadow(ctx, o.halo.color, o.halo.blur, 0, o.halo.y);
      ctx.fillStyle = o.color || "#fff";
      ctx.fillText(str, x, y);
      if (o.halo) noShadow(ctx);
      const w = ctx.measureText(str).width;
      spacing(ctx, 0);
      return w;
    }
    const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
    /** Greedy line wrapping (CJK may break anywhere, Latin at spaces). */
    function wrap(ctx, s, maxW, size, weight = 400) {
      setFont(ctx, size, weight);
      const toks = s.match(/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]|[^\s\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]+|\s+/g) || [];
      const lines = [];
      let cur = "";
      for (const t of toks) {
        const test = cur + t;
        if (ctx.measureText(test.trimEnd()).width > maxW && cur.trim()) {
          // Keep CJK closing punctuation on the line it closes.
          if (CJK.test(t) && /[\uff0c\u3002\u3001\uff1b\uff1a\uff01\uff1f\uff09\u300d\u300f\u3011]/.test(t)) {
            lines.push(test.trimEnd());
            cur = "";
            continue;
          }
          lines.push(cur.trimEnd());
          cur = t.trimStart();
        } else cur = test;
      }
      if (cur.trim()) lines.push(cur.trimEnd());
      return lines;
    }
    function fillRR(ctx, x, y, w, h, r, fill) {
      rr(ctx, x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    function strokeRR(ctx, x, y, w, h, r, color, lw = 1) {
      rr(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, Math.max(0, (Array.isArray(r) ? r[0] : r) - lw / 2));
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    function circle(ctx, cx, cy, r, fill) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    function panel(ctx, T, x, y, w, h, r = 18, o = {}) {
      if (o.shadow) shadow(ctx, o.shadow[0], o.shadow[1], 0, o.shadow[2] || 0);
      fillRR(ctx, x, y, w, h, r, o.fill || T.panel);
      noShadow(ctx);
      strokeRR(ctx, x, y, w, h, r, o.border || T.border);
    }
    function hit(name, x, y, w, h) {
      hits[name] = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    }

    /** .icon-btn (34px round, or 28px when small). */
    function iconBtn(ctx, T, cx, cy, name, o = {}) {
      const size = o.size || 34;
      const is = o.iconSize || 20;
      ctx.save();
      if (o.disabled) ctx.globalAlpha *= 0.35;
      if (o.hover || o.bg) circle(ctx, cx, cy, size / 2, o.bg || T.hover);
      const color = o.color || (o.active ? T.accentText : o.hover ? T.text : T.textDim);
      if (o.draw) o.draw(cx, cy, color);
      else if (name) I.center(ctx, name, cx, cy, is, color);
      if (o.active && !o.noDot) circle(ctx, cx, cy + size / 2 - 5, 2, T.accent);
      if (o.badge != null) text(ctx, String(o.badge), cx + size / 2 - 1, cy - size / 2 + 8, { size: 9, weight: 700, color: T.accentText, align: "right" });
      ctx.restore();
      if (o.id) hit(o.id, cx - size / 2, cy - size / 2, size, size);
    }

    /** .btn and its variants. (x, y) is the top-left unless `right` is set. */
    function btn(ctx, T, x, y, label, o = {}) {
      const kind = o.size || "normal";
      const h = kind === "small" ? 26 : kind === "large" ? 40 : 32;
      const pad = kind === "small" ? 8 : kind === "large" ? 18 : 12;
      const fs = kind === "small" ? 12.5 : kind === "large" ? 15 : 14;
      const r = kind === "large" ? 12 : 8;
      const is = o.icon ? o.iconSize || 16 : 0;
      const gap = 6;
      const tw = label ? measure(ctx, label, fs, o.weight || 400) : 0;
      const w = pad * 2 + 2 + (o.icon ? is + (label ? gap : 0) : 0) + tw;
      const bx = o.right ? x - w : o.center ? x - w / 2 : x;
      const by = o.cy !== undefined ? o.cy - h / 2 : y;
      ctx.save();
      if (o.disabled) ctx.globalAlpha *= 0.45;
      let fg = T.text;
      if (o.primary) {
        fillRR(ctx, bx, by, w, h, r, o.hover ? T.accentHover : T.accent);
        fg = T.onAccent;
      } else if (o.ghost) {
        if (o.hover) fillRR(ctx, bx, by, w, h, r, T.hover);
      } else {
        fillRR(ctx, bx, by, w, h, r, o.hover ? T.hover : T.panel2);
        strokeRR(ctx, bx, by, w, h, r, T.border);
      }
      if (o.color) fg = o.color;
      if (o.press) {
        // :active { transform: scale(0.97) }
        const k = 1 - 0.03 * o.press;
        ctx.translate(bx + w / 2, by + h / 2);
        ctx.scale(k, k);
        ctx.translate(-(bx + w / 2), -(by + h / 2));
      }
      let cx = bx + pad + 1;
      const cy = by + h / 2;
      if (o.icon) {
        I.center(ctx, o.icon, cx + is / 2, cy, is, fg);
        cx += is + (label ? gap : 0);
      }
      if (label) text(ctx, label, cx, cy + 0.5, { size: fs, weight: o.weight || 400, color: fg, halo: o.halo });
      ctx.restore();
      if (o.id) hit(o.id, bx, by, w, h);
      return { x: bx, y: by, w, h };
    }

    function slider(ctx, T, x, cy, w, frac, o = {}) {
      const hh = o.hover ? 6 : 4;
      ctx.save();
      rr(ctx, x, cy - hh / 2, w, hh, 4);
      ctx.fillStyle = T.track;
      ctx.fill();
      ctx.clip();
      if (o.buffered) {
        ctx.fillStyle = T.track;
        ctx.fillRect(x, cy - hh / 2, w * clamp(o.buffered), hh);
      }
      if (o.ab) {
        const a = x + w * o.ab[0];
        const b = x + w * o.ab[1];
        ctx.fillStyle = T.accentSoft;
        ctx.fillRect(a, cy - hh / 2, b - a, hh);
        ctx.strokeStyle = T.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(a + 0.5, cy - hh / 2 + 0.5, b - a - 1, hh - 1);
      }
      fillRR(ctx, x, cy - hh / 2, Math.max(0, w * clamp(frac)), hh, 4, T.accent);
      ctx.restore();
      if (o.hover) {
        shadow(ctx, "rgba(0, 0, 0, 0.35)", 4, 0, 1);
        circle(ctx, x + w * clamp(frac), cy, 7, "#ffffff");
        noShadow(ctx);
      }
    }

    function chip(ctx, T, x, cy, label, o = {}) {
      const w = measure(ctx, label, 11.5) + 16 + 2;
      const h = 18;
      fillRR(ctx, x, cy - h / 2, w, h, h / 2, o.accent ? T.accentSoft : T.panel2);
      if (!o.accent) strokeRR(ctx, x, cy - h / 2, w, h, h / 2, T.border);
      text(ctx, label, x + 9, cy + 0.5, { size: 11.5, color: o.accent ? T.accentText : T.textDim });
      return w;
    }

    function thumbImg(ctx, x, y, size, r, img, icon) {
      ctx.save();
      rr(ctx, x, y, size, size, r);
      ctx.clip();
      if (img) ctx.drawImage(img, x, y, size, size);
      else {
        const g = ctx.createLinearGradient(x, y, x + size, y + size);
        g.addColorStop(0, "#66ccff");
        g.addColorStop(1, "#3d8bff");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, size, size);
        const is = Math.round(Math.min(size, 96) * 0.36);
        I.center(ctx, icon || "music", x + size / 2, y + size / 2, is, "rgba(255, 255, 255, 0.9)");
      }
      ctx.restore();
    }

    /** The equaliser bars shown for the playing row. */
    function eq(ctx, T, cx, cy, time, playing = true) {
      const bars = [0, -0.3, -0.6];
      bars.forEach((d, i) => {
        const ph = playing ? (((time + -d) % 0.9) + 0.9) % 0.9 / 0.9 : 0.25;
        const k = ease.inOutSine(ph < 0.5 ? ph * 2 : 2 - ph * 2);
        const h = 3 + 9 * k;
        fillRR(ctx, cx - 6.5 + i * 5, cy + 6 - h, 3, h, 1.5, T.accent);
      });
    }

    // ------------------------------------------------------------ shell
    function drawBackground(ctx, T) {
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, W, H);
      const ell = (cx, cy, rx, ry, color) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, color);
        g.addColorStop(0.6, color.replace(/[\d.]+\)$/, "0)"));
        ctx.fillStyle = g;
        ctx.fillRect(-cx - 10, (-cy - 10) * (rx / ry), W + 20, (H + 20) * (rx / ry));
        ctx.restore();
      };
      ell(W * 0.1, -H * 0.1, 1200, 700, "rgba(102, 204, 255, 0.12)");
      ell(W * 1.1, H * 1.1, 900, 600, "rgba(31, 182, 255, 0.1)");
    }

    function trafficLights(ctx) {
      const cols = [
        ["#ff5f57", "#e0443e"],
        ["#febc2e", "#dea123"],
        ["#28c840", "#1aab29"],
      ];
      cols.forEach(([f, s], i) => {
        circle(ctx, 25 + i * 20, 22, 6, f);
        ctx.strokeStyle = s;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(25 + i * 20, 22, 5.7, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    function drawTitlebar(ctx, T, o = {}) {
      const halo = T.halo;
      trafficLights(ctx);
      // brand
      const dg = ctx.createLinearGradient(86, 17, 96, 27);
      dg.addColorStop(0, T.accent);
      dg.addColorStop(1, "#3d8bff");
      fillRR(ctx, 86, 17, 10, 10, 3, dg);
      const bw = text(ctx, "LightPlayer", 104, 22.5, { size: 14, weight: 600, color: T.textDim, ls: 0.2, halo });
      // right-hand buttons, right to left
      let x = W - 14;
      const right = [
        ["settings", "settings"],
        ["folder", "open"],
        ["sparkles", "asr"],
        ["library", "library"],
      ];
      right.forEach(([icon, id]) => {
        const active = (id === "library" && o.page === "library") || (id === "asr" && o.asrOpen);
        const busy = id === "asr" && o.asrBusy;
        iconBtn(ctx, T, x - 17, 22, icon, {
          id: "tb-" + id,
          active,
          hover: o.hover === id,
          color: busy ? T.accentText : undefined,
        });
        if (id === "asr" && o.asrCount) {
          const bx = x - 17 + 17;
          const label = String(o.asrCount);
          const bwid = Math.max(15, measure(ctx, label, 10, 700) + 8);
          fillRR(ctx, bx - bwid, 22 - 17 + 1, bwid, 15, 8, T.accent);
          text(ctx, label, bx - bwid / 2, 22 - 17 + 1 + 8, { size: 10, weight: 700, color: T.onAccent, align: "center" });
        }
        x -= 34 + 10;
      });
      if (o.privateMode) {
        const label = U.privateBadge;
        const w = 10 + 15 + 5 + measure(ctx, label, 12, 600) + 10;
        x -= 4;
        fillRR(ctx, x - w, 22 - 13, w, 26, 13, `rgba(${T.textRgb}, 0.82)`);
        I.center(ctx, "incognito", x - w + 10 + 7.5, 22, 15, T.bg);
        text(ctx, label, x - w + 30, 22.5, { size: 12, weight: 600, color: T.bg });
        x -= w + 10;
      }
      if (o.weather) {
        const label = o.weather.temp;
        const w = 9 + 16 + 5 + measure(ctx, label, 13, 600) + 9;
        if (o.weather.active) fillRR(ctx, x - w, 22 - 14, w, 28, 14, T.hover);
        I.center(ctx, o.weather.icon, x - w + 9 + 8, 22, 16, T.text);
        text(ctx, label, x - w + 30, 22.5, { size: 13, weight: 600, color: T.text, halo });
        x -= w + 10;
      }
      if (o.nowTitle) {
        const left = 104 + bw + 10;
        const rightEdge = x;
        const maxW = Math.min(W * 0.4, rightEdge - left - 20);
        text(ctx, o.nowTitle, (left + rightEdge) / 2, 22.5, { size: 12.5, color: T.textFaint, align: "center", max: maxW, halo });
      }
    }

    // ------------------------------------------------------------ transport
    function drawTransport(ctx, T, o) {
      const x = o.x ?? 10;
      const y = o.y ?? H - TRANSPORT_H;
      const w = o.w ?? W - 20;
      const h = o.h ?? TRANSPORT_H - 10;
      const halo = T.halo;
      panel(ctx, T, x, y, w, h, 18, o.floating ? { shadow: ["rgba(0, 0, 0, 0.5)", 40, 12] } : {});
      hit("transport", x, y, w, h);
      const ix = x + 19;
      const iw = w - 38;
      const isVideo = o.kind === "video";

      // progress row (22px)
      const py = y + 1 + 4 + 11;
      text(ctx, fmtTime(o.position), ix, py, { size: 11.5, color: T.textFaint, halo });
      text(ctx, fmtTime(o.duration), ix + iw, py, { size: 11.5, color: T.textFaint, align: "right", halo });
      const sx = ix + 58 + 10;
      const sw = iw - 58 * 2 - 20;
      slider(ctx, T, sx, py, sw, o.position / o.duration, { hover: o.seekHover, ab: o.ab, buffered: o.buffered });
      hit("seek", sx, py - 9, sw, 18);

      // controls row
      const rowH = Math.max(50, h - 2 - 14 - 22);
      const cy = y + 1 + 4 + 22 + rowH / 2;
      const items = [
        ["mode", 34],
        ["prev", 34],
        ["back", 34],
        ["play", 48],
        ["fwd", 34],
        ["next", 34],
        ["ab", 34],
      ];
      const total = items.reduce((a, [, s]) => a + s, 0) + 6 * (items.length - 1);
      let cx = x + w / 2 - total / 2;
      const jump = o.jump || 15;
      for (const [id, s] of items) {
        const c = cx + s / 2;
        const hov = o.hover === id;
        if (id === "play") {
          shadow(ctx, T.accentSoft, 18, 0, 6);
          circle(ctx, c, cy, 24, hov ? T.accentHover : T.accent);
          noShadow(ctx);
          I.center(ctx, o.playing ? "pause" : "play", c, cy, 22, T.onAccent);
          hit("play", c - 24, cy - 24, 48, 48);
        } else if (id === "back" || id === "fwd") {
          iconBtn(ctx, T, c, cy, null, {
            id,
            hover: hov,
            draw: (px, py2, col) => I.skip(ctx, id === "back" ? "back" : "fwd", jump, px, py2, 28, col, FONT),
          });
        } else {
          const icon = id === "mode" ? o.mode || "loop" : id;
          iconBtn(ctx, T, c, cy, icon, { id, hover: hov, active: id === "ab" && !!o.ab });
        }
        cx += s + 6;
      }

      // left: mini (cover, title, artist, favourite)
      const thumbX = ix;
      const tw = 42;
      if (o.hover === "mini") fillRR(ctx, ix - 4, cy - 25, o.miniW || 260, 50, 8, T.hover);
      ctx.save();
      rr(ctx, thumbX, cy - 21, tw, tw, 8);
      ctx.clip();
      if (o.cover) ctx.drawImage(o.cover, thumbX, cy - 21, tw, tw);
      else {
        ctx.fillStyle = T.panel2;
        ctx.fillRect(thumbX, cy - 21, tw, tw);
        I.center(ctx, isVideo ? "film" : "music", thumbX + 21, cy, 20, T.textFaint);
      }
      ctx.restore();
      const colW = (iw - total - 24) / 2;
      const metaMax = colW - 52 - 40;
      const t1 = text(ctx, o.title, thumbX + 52, cy - 8.5, { size: 14, weight: 600, color: T.text, max: metaMax, halo });
      const t2 = o.artist ? text(ctx, o.artist, thumbX + 52, cy + 9, { size: 12, color: T.textDim, max: metaMax, halo }) : 0;
      const favX = thumbX + 52 + Math.max(t1, t2) + 10 + 14;
      iconBtn(ctx, T, favX, cy, o.fav ? "heartFill" : "heart", {
        size: 28,
        iconSize: 16,
        color: o.fav ? "#ff4d6d" : T.textFaint,
        id: "fav",
      });
      hit("mini", ix - 4, cy - 25, favX + 14 - ix + 8, 50);

      // right group, right to left
      let rx = ix + iw;
      const rightItems = isVideo
        ? [["fullscreen"], ["volume"], ["list"], ["info"], ["camera"], ["subtitles"]]
        : [["volume"], ["list"], ["desktopLyrics"], ["timer"], ["speed"]];
      for (const [id] of rightItems) {
        if (id === "volume") {
          const vw = 132;
          const vx = rx - vw;
          iconBtn(ctx, T, vx + 17, cy, (o.volume ?? 0.8) < 0.5 ? "volumeLow" : "volume", { id: "mute" });
          slider(ctx, T, vx + 38, cy, vw - 38, o.volume ?? 0.8, {});
          rx -= vw + 2;
          continue;
        }
        let icon = id;
        let active = false;
        if (id === "fullscreen") icon = o.fullscreen ? "exitFullscreen" : "fullscreen";
        if (id === "list") active = !!o.playlistShown;
        if (id === "desktopLyrics") active = !!o.desktopLyrics;
        if (id === "subtitles") active = !!o.subtitlesOn;
        if (id === "speed" && o.rate && o.rate !== 1) {
          iconBtn(ctx, T, rx - 17, cy, null, {
            id,
            active: true,
            draw: (px, py2, col) => text(ctx, `${o.rate}×`, px, py2 + 0.5, { size: 11.5, weight: 700, color: col, align: "center" }),
          });
        } else iconBtn(ctx, T, rx - 17, cy, icon, { id, active, hover: o.hover === id });
        rx -= 34 + 2;
      }
    }

    // ------------------------------------------------------------ player page
    function drawCover(ctx, x, y, size, img, o = {}) {
      const s = o.scale ?? 1;
      ctx.save();
      ctx.translate(x + size / 2, y + size / 2 + (o.lift || 0));
      ctx.scale(s, s);
      ctx.translate(-size / 2, -size / 2);
      shadow(ctx, "rgba(0, 0, 0, 0.28)", 60, 0, 24);
      fillRR(ctx, 0, 0, size, size, 16, "#3d8bff");
      shadow(ctx, "rgba(0, 0, 0, 0.15)", 14, 0, 4);
      fillRR(ctx, 0, 0, size, size, 16, "#3d8bff");
      noShadow(ctx);
      rr(ctx, 0, 0, size, size, 16);
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      if (o.hint) {
        const label = U.coverHint;
        const tw = measure(ctx, label, 12) + 20;
        ctx.globalAlpha = o.hint;
        fillRR(ctx, size / 2 - tw / 2, size - 14 - 22, tw, 22, 11, "rgba(0, 0, 0, 0.45)");
        text(ctx, label, size / 2, size - 14 - 10.5, { size: 12, color: "#fff", align: "center" });
      }
      ctx.restore();
    }

    function drawPlaylist(ctx, T, o) {
      const x = o.x;
      const y = o.y;
      const w = 320;
      const h = o.h;
      panel(ctx, T, x, y, w, h, 18);
      const items = copy.playlist;
      // header
      const rowCy = y + 1 + 14 + 14;
      const hw = text(ctx, U.playlist, x + 15, rowCy, { size: 15, weight: 700, color: T.text });
      text(ctx, U.count(items.length), x + 15 + hw + 8, rowCy + 1.5, { size: 12, color: T.textFaint });
      iconBtn(ctx, T, x + w - 14 + 6 - 14, rowCy, "chevronRight", { size: 28, iconSize: 18 });
      text(ctx, U.fromFolder, x + 15, rowCy + 14 + 8 - 4 + 8.5, { size: 12, color: T.textFaint });
      const sy = rowCy + 14 + 8 - 4 + 17 + 8;
      fillRR(ctx, x + 15, sy, w - 30, 33, 8, T.panel2);
      strokeRR(ctx, x + 15, sy, w - 30, 33, 8, T.border);
      I.center(ctx, "search", x + 15 + 9 + 7.5, sy + 16.5, 15, T.textFaint);
      text(ctx, U.searchFolder, x + 15 + 30, sy + 17, { size: 14, color: T.textFaint });
      // rows
      let ry = sy + 33 + 8 + 2;
      const ROW = 34;
      ctx.save();
      rr(ctx, x, ry - 2, w, y + h - ry - 8, 0);
      ctx.clip();
      items.forEach((name, i) => {
        const active = i === (o.index ?? 0);
        const rx = x + 9;
        const rw = w - 18;
        if (active) fillRR(ctx, rx, ry, rw, ROW, 9, T.accentSoft);
        const cy = ry + ROW / 2;
        if (active) eq(ctx, T, rx + 8 + 14, cy, o.time || 0, o.playing !== false);
        else text(ctx, String(i + 1), rx + 8 + 14, cy, { size: 12, color: T.textFaint, align: "center" });
        const ext = name === copy.playlist[0] ? copy.song.ext.toLowerCase() : "flac";
        const ew = measure(ctx, ext.toUpperCase(), 10.5);
        text(ctx, name, rx + 8 + 28 + 8, cy, {
          size: 14,
          weight: active ? 600 : 400,
          color: active ? T.accentText : T.text,
          max: rw - 16 - 28 - 16 - ew,
        });
        text(ctx, ext.toUpperCase(), rx + rw - 8, cy, { size: 10.5, color: T.textFaint, align: "right" });
        ry += ROW;
      });
      ctx.restore();
    }

    function drawPlaylistHandle(ctx, T, stageRight, stageCy) {
      const n = U.handle.length;
      const h = 10 + 16 + 2 + n * 14.4 + (n - 1) * 2 + 2 + 10;
      const x = stageRight + 10 - 26;
      const y = stageCy - h / 2;
      ctx.save();
      ctx.globalAlpha *= 0.75;
      fillRR(ctx, x, y, 26, h, [10, 0, 0, 10], T.panel);
      strokeRR(ctx, x, y, 27, h, [10, 0, 0, 10], T.border);
      I.center(ctx, "chevronLeft", x + 13, y + 10 + 8, 16, T.textDim);
      U.handle.forEach((c, i) => text(ctx, c, x + 13, y + 10 + 16 + 4 + 7.2 + i * 16.4, { size: 11.5, color: T.textDim, align: "center" }));
      ctx.restore();
    }

    /** Current and next lyric line under the song info (LyricPeek). */
    function drawPeek(ctx, T, x, y, w, peek) {
      const draw = (cur, next, alpha, dy, blur) => {
        if (alpha <= 0.001) return;
        ctx.save();
        ctx.globalAlpha *= alpha;
        if (blur > 0.05 && "filter" in ctx) ctx.filter = `blur(${blur * scaleOf(ctx)}px)`;
        let yy = y + dy;
        if (cur) {
          const lines = wrap(ctx, cur, w, 16).slice(0, 2);
          lines.forEach((l, i) => text(ctx, l, x, yy + 12 + i * 24, { size: 16, color: T.textDim, halo: T.halo }));
          yy += lines.length * 24;
        }
        if (next) text(ctx, next, x, yy + 6 + 9.75, { size: 13, color: T.textFaint, max: w, halo: T.halo });
        ctx.restore();
      };
      const k = peek.k ?? 1;
      const kin = clamp(k / 0.42);
      const kout = clamp(k / 0.36);
      if (peek.prev && kout < 1) draw(peek.prev[0], peek.prev[1], 1 - kout, -14 * kout, 2 * kout);
      const e = ease.app(kin);
      draw(peek.cur, peek.next, e, 14 * (1 - e), 2 * (1 - e));
    }

    function drawPlayerPage(ctx, T, o) {
      const listShown = !!o.playlistShown;
      const stageX = 10;
      const stageY = TITLE_H + 4;
      const stageH = H - TITLE_H - TRANSPORT_H - 16;
      const stageW = listShown ? W - 20 - 320 - 14 : W - 20;
      if (listShown) drawPlaylist(ctx, T, { x: W - 10 - 320, y: stageY, h: stageH, index: 0, time: o.time, playing: o.playing });
      else if (!o.noHandle) drawPlaylistHandle(ctx, T, stageX + stageW, stageY + stageH / 2);
      btn(ctx, T, stageX + 2, stageY, U.back, { ghost: true, icon: "chevronLeft", iconSize: 18, halo: T.halo, id: "back-lib" });

      const song = copy.song;
      const cover = Math.min(H * 0.32, W * 0.28, 300);
      const gap = Math.round(clamp(W * 0.05, 24, 64));
      const padX = clamp(W * 0.04, 16, 56);
      const avail = stageW - padX * 2 - cover - gap;
      const titleW = measure(ctx, song.title, 34, 700);
      const infoW = clamp(Math.max(titleW, measure(ctx, song.artist, 17), measure(ctx, song.album, 13.5)), Math.min(260, W * 0.3), Math.min(460, W * 0.42, avail));
      const total = cover + gap + infoW;
      const x0 = stageX + (stageW - total) / 2;
      const cy = stageY + stageH / 2;
      const infoH = 40.8 + 10 + 23 + 10 + 18 + 10 + 4 + 18 + 10 + 18 + 73.5;
      drawCover(ctx, x0, cy - cover / 2, cover, o.coverImg, { scale: o.playing === false ? 0.94 : 1, hint: o.coverHint });
      hit("cover", x0, cy - cover / 2, cover, cover);
      const ix = x0 + cover + gap;
      let iy = cy - infoH / 2;
      text(ctx, song.title, ix, iy + 20.4, { size: 34, weight: 700, color: o.titleHover ? T.accentText : T.text, halo: T.halo });
      iy += 40.8 + 10;
      text(ctx, song.artist, ix, iy + 11.5, { size: 17, color: T.textDim, halo: T.halo });
      iy += 23 + 10;
      text(ctx, song.album, ix, iy + 9, { size: 13.5, color: T.textFaint, halo: T.halo });
      iy += 18 + 10 + 4;
      let chx = ix;
      chx += chip(ctx, T, chx, iy + 9, song.ext) + 6;
      if (o.aiChip) chip(ctx, T, chx, iy + 9, U.aiChip);
      iy += 18 + 10 + 18;
      if (o.peek) drawPeek(ctx, T, ix, iy, Math.min(460, W * 0.42), o.peek);
    }

    // ------------------------------------------------------------ lyrics page
    function lyricLineColor(T, a, near) {
      const base = T.lyricDim;
      const alpha = lerp(lerp(base, T.lyricNear, near), 1, a);
      return `rgba(${T.textRgb}, ${alpha})`;
    }

    function drawLyricsHead(ctx, T, o) {
      const cy = TITLE_H + 4 + 18;
      btn(ctx, T, 16, 0, U.back, { ghost: true, icon: "chevronLeft", iconSize: 18, cy, halo: T.halo });
      const song = copy.song;
      text(ctx, song.title, W / 2, cy - 8.5, { size: 15, weight: 700, color: T.text, align: "center", halo: T.halo });
      text(ctx, song.artist, W / 2, cy + 9.5, { size: 12.5, color: T.textDim, align: "center", halo: T.halo });
      // tools, right to left
      let x = W - 16;
      const tools = ["more", "sparkles", "edit", "upload", "textSize", "hl"];
      for (const id of tools) {
        if (id === "hl") {
          iconBtn(ctx, T, x - 17, cy, null, {
            id: "hl",
            draw: (px, py) => {
              circle(ctx, px, py, 8 + 3, T.border);
              circle(ctx, px, py, 8 + 2, T.panelSolid);
              circle(ctx, px, py, 8, o.hl || T.accent);
            },
          });
        } else iconBtn(ctx, T, x - 17, cy, id, { id: "lt-" + id, hover: o.hover === id, disabled: id === "sparkles" && o.asrBusy });
        x -= 34 + 4;
      }
      if (o.synced) {
        iconBtn(ctx, T, x - 17, cy, "plus", { iconSize: 16 });
        x -= 34 + 2;
        const label = "0.0s";
        const lw = measure(ctx, label, 12);
        text(ctx, label, x - lw, cy + 0.5, { size: 12, color: T.textDim });
        x -= lw + 2;
        iconBtn(ctx, T, x - 17, cy, "minus", { iconSize: 16 });
      }
      return TITLE_H + 4 + 36 + 8;
    }

    function drawBanner(ctx, T, y) {
      const w = 720;
      const x = (W - w) / 2;
      fillRR(ctx, x, y, w, 42, 12, T.warnBg);
      I.center(ctx, "warning", x + 12 + 8, y + 21, 16, T.warnText);
      let bx = x + w - 12;
      const b3 = btn(ctx, T, bx, 0, U.remove, { size: "small", icon: "trash", iconSize: 14, right: true, cy: y + 21, color: T.warnText });
      bx = b3.x - 8 + 4;
      const b2 = btn(ctx, T, bx, 0, U.rerun, { size: "small", icon: "sparkles", iconSize: 14, right: true, cy: y + 21, color: T.warnText });
      bx = b2.x - 8 + 4;
      const b1 = btn(ctx, T, bx, 0, U.review, { size: "small", icon: "edit", iconSize: 14, right: true, cy: y + 21, color: T.warnText });
      text(ctx, U.aiBanner, x + 12 + 16 + 10, y + 21.5, { size: 13, color: T.warnText, max: b1.x - (x + 38) - 10 });
    }

    function drawLyricLines(ctx, T, o, top, bottom) {
      const lines = o.lines;
      const fs = o.fontSize || 22;
      const lh = fs * 1.45;
      const pitch = lh + 20 + 2;
      const viewCy = (top + bottom) / 2;
      const viewH = bottom - top;
      const cx = W / 2;
      const maxW = 680 - 24 - 28;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, W, viewH);
      ctx.clip();
      for (let i = 0; i < lines.length; i++) {
        const yc = viewCy + (i - o.scroll) * pitch;
        if (yc < top - pitch || yc > bottom + pitch) continue;
        // mask-image: linear-gradient(transparent 0, #000 14%, #000 86%, transparent 100%)
        const f = (yc - top) / viewH;
        const mask = clamp(Math.min(f / 0.14, (1 - f) / 0.14));
        if (mask <= 0) continue;
        const a = clamp(1 - Math.abs(i - o.active));
        const near = clamp(1 - Math.abs(Math.abs(i - o.active) - 1));
        const sc = 1 + 0.08 * ease.app(a);
        ctx.save();
        ctx.globalAlpha *= mask;
        ctx.translate(cx, yc);
        ctx.scale(sc, sc);
        if (o.hoverLine === i) fillRR(ctx, -maxW / 2 - 14, -lh / 2 - 10, maxW + 28, lh + 20, 12, T.hover);
        const str = lines[i];
        const isActive = i === Math.round(o.active) && a > 0.5;
        if (isActive && o.karaoke != null) {
          // dim text, then the sung part in the highlight colour
          text(ctx, str, 0, 0, { size: fs, weight: 600, color: `rgba(${T.textRgb}, ${T.lyricDim})`, align: "center", halo: T.halo });
          const words = copy.splitWords(str);
          setFont(ctx, fs, 600);
          const full = ctx.measureText(str).width;
          let acc = 0;
          let fillTo = 0;
          const n = words.length;
          const pos = clamp(o.karaoke) * n;
          words.forEach((wd, k) => {
            const ww = ctx.measureText(wd).width;
            const p = clamp(pos - k);
            if (p > 0) fillTo = acc + ww * p;
            acc += ww;
          });
          ctx.save();
          ctx.beginPath();
          ctx.rect(-full / 2 - 2, -lh, fillTo + 2, lh * 2);
          ctx.clip();
          text(ctx, str, 0, 0, { size: fs, weight: 600, color: o.hl || T.accentStrong, align: "center" });
          ctx.restore();
        } else {
          const color = isActive ? o.hl && !o.karaokeOff ? o.hl : T.text : lyricLineColor(T, a, near);
          text(ctx, str, 0, 0, { size: fs, weight: 600, color, align: "center", halo: T.halo });
        }
        ctx.restore();
        hits["line" + i] = { x: cx - maxW / 2, y: yc - lh / 2 - 10, w: maxW, h: lh + 20, cx, cy: yc };
      }
      ctx.restore();
    }

    function drawEmptyLyrics(ctx, T, top, bottom, o) {
      const cy = (top + bottom) / 2;
      text(ctx, U.emptyTitle, W / 2, cy - 44, { size: 24, weight: 700, color: T.textDim, align: "center" });
      text(ctx, U.emptyText, W / 2, cy - 4, { size: 14, color: T.textFaint, align: "center" });
      const labels = [
        [U.upload, "upload", false, "up"],
        [U.manual, "edit", false, "manual"],
        [U.aiRecognize, "sparkles", true, "ai"],
      ];
      const widths = labels.map(([l]) => 24 + 16 + 6 + measure(ctx, l, 14));
      const total = widths.reduce((a, b) => a + b, 0) + 8 * (labels.length - 1);
      let x = W / 2 - total / 2;
      labels.forEach(([l, icon, primary, id], i) => {
        btn(ctx, T, x, cy + 22, l, { icon, iconSize: 16, primary, id: "empty-" + id, hover: o.hover === id, press: o.press === id ? o.pressK : 0 });
        x += widths[i] + 8;
      });
    }

    function drawAsrCard(ctx, T, top, bottom, o) {
      const w = 420;
      const x = (W - w) / 2;
      const noteLines = wrap(ctx, U.asrNote, w - 40, 12.5);
      const h = 20 + 20 + 12 + 6 + 12 + noteLines.length * 20 + 12 + 26 + 20;
      const y = (top + bottom) / 2 - h / 2;
      panel(ctx, T, x, y, w, h, 18, { fill: T.panel });
      let yy = y + 20 + 10;
      I.center(ctx, "sparkles", x + 20 + 8, yy, 16, T.text);
      const stage = o.decoding ? U.asrDecoding : U.asrStage;
      const sw = text(ctx, " " + stage, x + 20 + 16, yy + 0.5, { size: 14, weight: 600, color: T.text });
      if (!o.decoding) text(ctx, ` ${Math.round(o.percent)}%`, x + 36 + sw, yy + 0.5, { size: 14, color: T.textFaint });
      yy += 10 + 12;
      fillRR(ctx, x + 20, yy, w - 40, 6, 6, T.track);
      if (o.decoding) {
        const ph = (o.time % 1.2) / 1.2;
        const bw = (w - 40) * 0.35;
        const bx = x + 20 - bw + ph * ((w - 40) + bw) * 1.0;
        ctx.save();
        rr(ctx, x + 20, yy, w - 40, 6, 6);
        ctx.clip();
        fillRR(ctx, bx, yy, bw, 6, 6, T.accent);
        ctx.restore();
      } else fillRR(ctx, x + 20, yy, (w - 40) * clamp(o.percent / 100), 6, 6, T.accent);
      yy += 6 + 12;
      noteLines.forEach((l, i) => text(ctx, l, x + 20, yy + 10 + i * 20, { size: 12.5, color: T.textFaint }));
      yy += noteLines.length * 20 + 12;
      btn(ctx, T, x + 20, yy, U.viewAll, { size: "small", ghost: true, icon: "list", iconSize: 14 });
      btn(ctx, T, x + w - 20, yy, U.cancel, { size: "small", right: true });
      hit("asrCard", x, y, w, h);
    }

    function drawLyricsPage(ctx, T, o) {
      const bodyTopBase = drawLyricsHead(ctx, T, { synced: o.state === "loaded", hl: o.hl, hover: o.hoverTool, asrBusy: o.state === "asr" });
      let top = bodyTopBase;
      if (o.banner) {
        ctx.save();
        ctx.globalAlpha *= o.banner;
        drawBanner(ctx, T, top);
        ctx.restore();
        top += 48 * ease.app(clamp(o.banner * 1.4));
      }
      const bottom = H - TRANSPORT_H;
      if (o.state === "loaded") drawLyricLines(ctx, T, o, top, bottom);
      else if (o.state === "empty") drawEmptyLyrics(ctx, T, top, bottom, o);
      else if (o.state === "asr") drawAsrCard(ctx, T, top, bottom, o);
    }

    // ------------------------------------------------------------ library
    function drawLibrarySidebar(ctx, T, o) {
      const x = 12;
      const w = 206;
      let y = TITLE_H + 4 + 4;
      const nav = [
        ["music", U.nav[0], "songs"],
        ["album", U.nav[1], "albums"],
        ["user", U.nav[2], "artists"],
        ["film", U.nav[3], "videos"],
        ["heart", U.nav[4], "favorites"],
        ["clock", U.nav[5], "recent"],
      ];
      const link = (icon, label, on, hov, count) => {
        if (on) fillRR(ctx, x, y, w, 34, 9, T.accentSoft);
        else if (hov) fillRR(ctx, x, y, w, 34, 9, T.hover);
        const color = on ? T.accentText : hov ? T.text : T.textDim;
        I.center(ctx, icon, x + 10 + 8.5, y + 17, 17, color);
        text(ctx, label, x + 10 + 17 + 10, y + 17.5, { size: 13.5, weight: on ? 600 : 400, color, max: w - 60 - (count ? 30 : 0) });
        if (count != null) text(ctx, String(count), x + w - 10, y + 17.5, { size: 11.5, color: T.textFaint, align: "right" });
      };
      nav.forEach(([icon, label, id]) => {
        link(icon, label, o.view === id, o.hoverNav === id);
        hit("nav-" + id, x, y, w, 34);
        y += 36;
      });
      y += -2 + 16;
      text(ctx, U.playlistsGroup, x + 10, y + 14, { size: 11.5, weight: 600, color: T.textFaint, ls: 0.5 });
      iconBtn(ctx, T, x + w - 4 - 14, y + 14, "plus", { size: 28, iconSize: 16 });
      iconBtn(ctx, T, x + w - 4 - 14 - 30, y + 14, "folderPlus", { size: 28, iconSize: 16 });
      y += 28 + 4;
      U.userPlaylists.forEach(([name, n]) => {
        link("playlist", name, false, false, n);
        y += 36;
      });
      const footY = H - TRANSPORT_H - 12 - 4 - 42;
      ctx.fillStyle = T.border;
      ctx.fillRect(x, footY, w, 1);
      y = footY + 8;
      link("folder", U.manageFolders, false, false);
    }

    function libHeader(ctx, T, mx, mw, title, sub) {
      const y = TITLE_H + 4 + 1 + 18;
      text(ctx, title, mx + 21, y + 14.4, { size: 24, weight: 700, color: T.text, halo: T.halo });
      text(ctx, sub, mx + 21, y + 28.8 + 4 + 8.5, { size: 12.5, color: T.textFaint, halo: T.halo });
      const bottom = y + 49.8;
      let x = mx + mw - 21;
      const b2 = btn(ctx, T, x, bottom - 32, U.shuffle, { icon: "shuffle", iconSize: 15, right: true });
      x = b2.x - 8;
      const b1 = btn(ctx, T, x, bottom - 32, U.playAll, { icon: "play", iconSize: 15, right: true, primary: true });
      x = b1.x - 8;
      const sw = 220;
      fillRR(ctx, x - sw, bottom - 33, sw, 33, 8, T.panel2);
      strokeRR(ctx, x - sw, bottom - 33, sw, 33, 8, T.border);
      I.center(ctx, "search", x - sw + 9 + 7.5, bottom - 16.5, 15, T.textFaint);
      text(ctx, U.search, x - sw + 30, bottom - 16, { size: 14, color: T.textFaint, max: sw - 40 });
      return bottom + 12;
    }

    function drawAlbums(ctx, T, mx, mw, top, bottom, o) {
      const pad = 21;
      const inner = mw - pad * 2;
      const cols = Math.floor((inner + 16) / (150 + 16));
      const cw = (inner - (cols - 1) * 16) / cols;
      const pitch = cw + 8 + 17.5 + 2 + 15.6 + 18;
      ctx.save();
      ctx.beginPath();
      ctx.rect(mx, top, mw, bottom - top);
      ctx.clip();
      const scroll = o.scrollY || 0;
      copy.albums.forEach(([title, artist], i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = mx + pad + c * (cw + 16);
        const y = top + 6 + r * pitch - scroll;
        if (y > bottom || y + pitch < top) return;
        const hov = o.hoverCard === i;
        const lift = hov ? -2 : 0;
        if (o.hiddenCards && o.hiddenCards[i] != null) {
          // the 3D cover flies above this card; leave a soft slot
          ctx.globalAlpha = 1 - o.hiddenCards[i];
        }
        ctx.save();
        shadow(ctx, hov ? "rgba(0, 0, 0, 0.18)" : "rgba(0, 0, 0, 0.12)", hov ? 26 : 18, 0, hov ? 10 : 6);
        fillRR(ctx, x, y + lift, cw, cw, 12, "#222");
        noShadow(ctx);
        rr(ctx, x, y + lift, cw, cw, 12);
        ctx.clip();
        ctx.drawImage(PV.art.cover(i), x, y + lift, cw, cw);
        ctx.restore();
        ctx.globalAlpha = 1;
        if (o.current === i) strokeRR(ctx, x - 4, y + lift - 4, cw + 8, cw + 8, 15, T.accent, 2);
        if (hov && o.cardPlay) {
          const k = ease.app(clamp(o.cardPlay));
          ctx.save();
          ctx.globalAlpha *= k;
          shadow(ctx, "rgba(0, 0, 0, 0.25)", 12, 0, 4);
          circle(ctx, x + cw - 8 - 18, y + lift + cw - 8 - 18 + 6 * (1 - k), 18, T.accent);
          noShadow(ctx);
          I.center(ctx, "play", x + cw - 8 - 18, y + lift + cw - 8 - 18 + 6 * (1 - k), 18, T.onAccent);
          ctx.restore();
        }
        hit("card" + i, x, y, cw, cw);
        text(ctx, title, x, y + cw + 8 + 9, { size: 13.5, weight: 600, color: T.text, max: cw, halo: T.halo });
        text(ctx, artist, x, y + cw + 8 + 17.5 + 2 + 8, { size: 12, color: T.textFaint, max: cw, halo: T.halo });
      });
      ctx.restore();
      return { cols, cw, pitch, x0: mx + pad, y0: top + 6 };
    }

    function drawSongs(ctx, T, mx, mw, top, bottom, o) {
      const x0 = mx + 7 + 14;
      const inner = mw - 14 - 28;
      const fr = (inner - 52 - 64 - 44 - 50) / 4.6;
      const cols = [52, 2.2 * fr, 1.2 * fr, 1.2 * fr, 64, 44];
      const xs = [];
      let acc = x0;
      cols.forEach((c) => {
        xs.push(acc);
        acc += c + 10;
      });
      // head
      const hy = top + 16;
      text(ctx, U.cols[0], xs[0] + cols[0], hy, { size: 12, color: T.textFaint, align: "right" });
      text(ctx, U.cols[1], xs[1], hy, { size: 12, color: T.textFaint });
      text(ctx, U.cols[2], xs[2], hy, { size: 12, color: T.textFaint });
      text(ctx, U.cols[3], xs[3], hy, { size: 12, color: T.textFaint });
      text(ctx, U.cols[4], xs[4] + cols[4], hy, { size: 12, color: T.textFaint, align: "right" });
      ctx.fillStyle = T.border;
      ctx.fillRect(mx + 6, top + 31, mw - 12, 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(mx, top + 32, mw, bottom - top - 32);
      ctx.clip();
      let y = top + 32 + 4 - (o.scrollY || 0);
      copy.songs.forEach(([title, artist, album, dur], i) => {
        const cur = i === (o.current ?? 0);
        const hov = o.hoverRow === i;
        if (cur) fillRR(ctx, mx + 6, y, mw - 12, 44, 9, T.accentSoft);
        else if (hov) fillRR(ctx, mx + 6, y, mw - 12, 44, 9, T.hover);
        const cy = y + 22;
        if (cur) eq(ctx, T, xs[0] + cols[0] - 7, cy, o.time || 0, true);
        else text(ctx, String(i + 1), xs[0] + cols[0], cy, { size: 12, color: T.textFaint, align: "right" });
        const al = copy.albums.findIndex((a) => a[0] === album);
        thumbImg(ctx, xs[1], cy - 16, 32, 6, al >= 0 ? PV.art.cover(al, 128) : null);
        text(ctx, title, xs[1] + 42, cy + 0.5, { size: 13.5, weight: cur ? 600 : 400, color: cur ? T.accentText : T.text, max: cols[1] - 42 });
        text(ctx, artist, xs[2], cy + 0.5, { size: 13.5, color: T.textDim, max: cols[2] });
        text(ctx, album, xs[3], cy + 0.5, { size: 13.5, color: T.textDim, max: cols[3] });
        text(ctx, dur, xs[4] + cols[4], cy + 0.5, { size: 13.5, color: T.textFaint, align: "right" });
        const fav = o.favs && o.favs.includes(i);
        if (fav || hov) iconBtn(ctx, T, xs[5] + 22, cy, fav ? "heartFill" : "heart", { size: 28, iconSize: 16, color: fav ? "#ff4d6d" : T.textFaint });
        hit("row" + i, mx + 6, y, mw - 12, 44);
        y += 44;
      });
      ctx.restore();
    }

    function drawLibraryPage(ctx, T, o) {
      drawLibrarySidebar(ctx, T, o);
      const mx = 232;
      const mw = W - 10 - mx;
      const my = TITLE_H + 4;
      const mh = H - TITLE_H - TRANSPORT_H - 16;
      panel(ctx, T, mx, my, mw, mh, 18);
      ctx.save();
      rr(ctx, mx, my, mw, mh, 18);
      ctx.clip();
      const albums = o.view === "albums";
      const top = libHeader(ctx, T, mx, mw, albums ? U.albumsTitle : U.songsTitle, albums ? U.albumsSub(copy.albums.length + 74) : U.songsSub);
      if (albums) hits.grid = drawAlbums(ctx, T, mx, mw, top, my + mh, o);
      else drawSongs(ctx, T, mx, mw, top, my + mh, o);
      ctx.restore();
    }

    // ------------------------------------------------------------ video
    /** Video page; the picture itself is rendered by the GPU into the hole. */
    function drawVideoPage(ctx, T, o) {
      const im = clamp(o.immersive || 0);
      const stage = videoRect(im);
      // the hole for the picture
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      fillRR(ctx, stage.x, stage.y, stage.w, stage.h, stage.r, "#000");
      ctx.restore();
      if (im < 0.5) {
        ctx.save();
        ctx.globalAlpha *= 1 - im * 2;
        const label = copy.video.strategy;
        const bw = measure(ctx, label, 11.5) + 18;
        fillRR(ctx, stage.x + stage.w - 12 - bw, stage.y + 12, bw, 22, 11, "rgba(0, 0, 0, 0.45)");
        text(ctx, label, stage.x + stage.w - 12 - bw / 2, stage.y + 23.5, { size: 11.5, color: "#fff", align: "center" });
        // back chip over the video
        const b = measure(ctx, U.back, 14) + 12 * 2 + 18 + 6;
        fillRR(ctx, stage.x + 10, stage.y + 10, b, 32, 8, "rgba(18, 18, 22, 0.5)");
        I.center(ctx, "chevronLeft", stage.x + 10 + 12 + 9, stage.y + 26, 18, "#f2f2f5");
        text(ctx, U.back, stage.x + 10 + 12 + 24, stage.y + 26.5, { size: 14, color: "#f2f2f5" });
        ctx.restore();
      }
      if (o.sub) {
        const fs = clamp(W * 0.026, 16, 30);
        const bottomY = im > 0 ? lerp(stage.y + stage.h * 0.94, H - (TRANSPORT_H + 36), o.controls ?? 1) : stage.y + stage.h * 0.94;
        ctx.save();
        ctx.globalAlpha *= o.subAlpha ?? 1;
        const sw = measure(ctx, o.sub, fs);
        const bh = fs * 1.35 + 4;
        fillRR(ctx, W / 2 - sw / 2 - 10, bottomY - bh, sw + 20, bh, 6, "rgba(0, 0, 0, 0.28)");
        shadow(ctx, "rgba(0, 0, 0, 0.8)", 6, 0, 2);
        text(ctx, o.sub, W / 2, bottomY - bh / 2 + 1, { size: fs, color: "#fff", align: "center" });
        shadow(ctx, "#000", 4, 0, 0);
        text(ctx, o.sub, W / 2, bottomY - bh / 2 + 1, { size: fs, color: "#fff", align: "center" });
        noShadow(ctx);
        ctx.restore();
      }
      if (im > 0) {
        const c = o.controls ?? 1;
        ctx.save();
        ctx.globalAlpha *= im * c;
        const g = ctx.createLinearGradient(0, 0, 0, 14 + 36 + 22);
        g.addColorStop(0, "rgba(0, 0, 0, 0.62)");
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, -12 * (1 - c), W, 72);
        shadow(ctx, "rgba(0, 0, 0, 0.6)", 4, 0, 1);
        text(ctx, copy.video.title, 24, 14 + 11 - 12 * (1 - c), { size: 15, weight: 600, color: "#f2f2f5" });
        noShadow(ctx);
        ctx.restore();
      }
      return stage;
    }

    /** Where the picture sits: inside the stage, or the whole window. */
    function videoRect(im) {
      const s = { x: 10, y: TITLE_H + 4, w: W - 20, h: H - TITLE_H - TRANSPORT_H - 16, r: 18 };
      const e = ease.app(clamp(im));
      return {
        x: lerp(s.x, 0, e),
        y: lerp(s.y, 0, e),
        w: lerp(s.w, W, e),
        h: lerp(s.h, H, e),
        r: lerp(s.r, 0, e),
      };
    }

    // ------------------------------------------------------------ cursor
    const ARROW = new Path2D("M0 0 L0 17.2 L4.1 13.3 L6.9 19.8 L9.5 18.7 L6.8 12.3 L12.4 12.3 Z");
    function drawCursor(ctx, x, y, press = 0, scale = 1) {
      ctx.save();
      ctx.translate(x, y);
      const k = scale * (1 - 0.12 * press);
      ctx.scale(k, k);
      shadow(ctx, "rgba(0, 0, 0, 0.35)", 4, 0, 1.5);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.stroke(ARROW);
      noShadow(ctx);
      ctx.fillStyle = "#000000";
      ctx.fill(ARROW);
      ctx.restore();
    }

    // ------------------------------------------------------------ whole window
    /**
     * Draws the app window. `s` holds the page and its state; the sky (weather
     * theme) and the video picture are added by the shader underneath.
     */
    function drawApp(ctx, s) {
      const T = THEMES[s.theme || "dark"];
      ctx.clearRect(0, 0, W, H);
      if (s.theme === "weather" || s.theme === "weatherBright") {
        ctx.fillStyle = "rgba(6, 12, 26, 0.1)";
        ctx.fillRect(0, 0, W, H);
      } else if (s.page !== "video" || !(s.immersive >= 1)) drawBackground(ctx, T);
      const im = s.page === "video" ? clamp(s.immersive || 0) : 0;
      if (im < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - im;
        drawTitlebar(ctx, T, {
          page: s.page,
          nowTitle: s.page === "library" && !s.media ? null : s.media ? s.media.file : null,
          weather: s.weather,
          asrBusy: s.asrBusy,
          asrCount: s.asrCount,
          privateMode: s.privateMode,
          hover: s.titleHover,
        });
        ctx.restore();
      }
      if (s.page === "player") drawPlayerPage(ctx, T, s);
      else if (s.page === "lyrics") drawLyricsPage(ctx, T, s);
      else if (s.page === "library") drawLibraryPage(ctx, T, s);
      else if (s.page === "video") drawVideoPage(ctx, T, s);
      if (s.page === "video") {
        const c = s.controls ?? 1;
        if (im > 0) {
          // the transport floats over the picture in full screen
          const TI = THEMES.immersive;
          const fw = Math.min(1100, W - 40);
          ctx.save();
          ctx.globalAlpha *= c;
          drawTransport(ctx, im >= 1 ? TI : T, {
            ...s.transport,
            x: lerp(10, (W - fw) / 2, ease.app(im)),
            y: lerp(H - TRANSPORT_H, H - 18 - TRANSPORT_H, ease.app(im)) + 20 * (1 - c),
            w: lerp(W - 20, fw, ease.app(im)),
            h: lerp(TRANSPORT_H - 10, TRANSPORT_H, ease.app(im)),
            floating: im > 0.5,
            kind: "video",
          });
          ctx.restore();
        } else drawTransport(ctx, T, { ...s.transport, kind: "video" });
      } else if (s.transport) drawTransport(ctx, T, s.transport);
      if (s.cursor && s.cursor.alpha > 0) {
        ctx.save();
        ctx.globalAlpha *= s.cursor.alpha;
        drawCursor(ctx, s.cursor.x, s.cursor.y, s.cursor.press || 0);
        ctx.restore();
      }
    }

    // ------------------------------------------------------------ floating pieces
    const DL_PRESETS = ["#66ccff", "#ffd166", "#ff4d8d", "#13ce66", "#ffffff", "#ff7849", "#b388ff"];

    /** Desktop lyrics window content (640 x 96). */
    function drawDesktopLyrics(ctx, o) {
      const w = o.w || 640;
      const h = o.h || 96;
      ctx.clearRect(0, 0, w, h);
      const hover = clamp(o.hover || 0);
      if (hover > 0) {
        ctx.save();
        ctx.globalAlpha = hover;
        fillRR(ctx, 0, 0, w, h, 14, "rgba(18, 20, 28, 0.42)");
        ctx.restore();
      }
      const fs = clamp(h * 0.46, 14, 120);
      if (!o.palette) {
        const k = clamp(o.lineK ?? 1);
        const e = ease.app(clamp(k / 0.38 * 0.38 / 0.38));
        const draw = (str, alpha, dy, blur) => {
          if (alpha <= 0.001 || !str) return;
          ctx.save();
          ctx.globalAlpha *= alpha;
          if (blur > 0.05 && "filter" in ctx) ctx.filter = `blur(${blur * scaleOf(ctx)}px)`;
          const max = w - 44;
          shadow(ctx, "rgba(0, 0, 0, 0.5)", 8, 0, 2);
          text(ctx, str, w / 2, h / 2 + dy + 1, { size: fs, weight: 700, color: o.color, align: "center", ls: fs * 0.02, max });
          shadow(ctx, "rgba(0, 0, 0, 0.85)", 2, 0, 0);
          text(ctx, str, w / 2, h / 2 + dy + 1, { size: fs, weight: 700, color: o.color, align: "center", ls: fs * 0.02, max });
          noShadow(ctx);
          ctx.restore();
        };
        draw(o.text, e, fs * 1.25 * 0.22 * (1 - e), 3 * (1 - e));
      } else {
        // colour row in place of the line
        const sw = Math.min(22, h * 0.4);
        const gap = Math.max(4, sw * 0.36);
        const n = DL_PRESETS.length + 1;
        const total = n * sw + (n - 1) * gap;
        const left = 14;
        const right = w - 74;
        let x = left + (right - left - total) / 2;
        const cy = h / 2;
        DL_PRESETS.forEach((c) => {
          circle(ctx, x + sw / 2, cy, sw / 2, c);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x + sw / 2, cy, sw / 2 - 0.5, 0, Math.PI * 2);
          ctx.stroke();
          if (c.toLowerCase() === o.color.toLowerCase()) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x + sw / 2, cy, sw / 2 - 1, 0, Math.PI * 2);
            ctx.stroke();
          }
          hits["dl-" + c] = { cx: x + sw / 2, cy };
          x += sw + gap;
        });
        // the custom colour well
        if (ctx.createConicGradient) {
          const g = ctx.createConicGradient(0, x + sw / 2, cy);
          ["#ff4d4d", "#ffd166", "#13ce66", "#66ccff", "#7c5cff", "#ff4d8d", "#ff4d4d"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
          fillRR(ctx, x + 2, cy - sw / 2 + 2, sw - 4, sw - 4, 4, g);
        } else fillRR(ctx, x + 2, cy - sw / 2 + 2, sw - 4, sw - 4, 4, "#7c5cff");
        strokeRR(ctx, x + 1, cy - sw / 2 + 1, sw - 2, sw - 2, 5, "rgba(255, 255, 255, 0.6)");
      }
      if (hover > 0) {
        ctx.save();
        ctx.globalAlpha = hover;
        const by = 6 + 12;
        const closeX = w - 8 - 12;
        const dotX = closeX - 24 - 5;
        circle(ctx, dotX, by, 12, o.palette ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.5)");
        circle(ctx, dotX, by, 6 + 1.5, "#ffffff");
        circle(ctx, dotX, by, 6, o.color);
        circle(ctx, closeX, by, 12, "rgba(0, 0, 0, 0.5)");
        I.center(ctx, "close", closeX, by, 14, "#ffffff");
        hits["dl-dot"] = { cx: dotX, cy: by };
        if (!o.palette) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(w - 3 - 1, h - 3 - 14);
          ctx.lineTo(w - 3 - 1, h - 3 - 7);
          ctx.arcTo(w - 4, h - 4, w - 4 - 6, h - 4, 6);
          ctx.lineTo(w - 3 - 14, h - 3 - 1);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (o.cursor && o.cursor.alpha > 0) {
        ctx.save();
        ctx.globalAlpha *= o.cursor.alpha;
        drawCursor(ctx, o.cursor.x, o.cursor.y, o.cursor.press || 0, 1);
        ctx.restore();
      }
    }

    /** macOS menu bar with the LightPlayer status item (width x 28). */
    function drawMenuBar(ctx, o) {
      const w = o.w;
      const h = 28;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(24, 26, 36, 0.42)";
      ctx.fillRect(0, 0, w, h);
      let x = 18;
      // the system menu glyph is left out; the app menus start the bar
      x += text(ctx, "LightPlayer", x, h / 2 + 0.5, { size: 13, weight: 700, color: "#fff" }) + 20;
      copy.menubar.menus.forEach((m) => {
        x += text(ctx, m, x, h / 2 + 0.5, { size: 13, color: "rgba(255, 255, 255, 0.92)" }) + 20;
      });
      // right side: clock, battery, wifi, then the LightPlayer item
      let rx = w - 16;
      rx -= text(ctx, copy.menubar.clock, rx, h / 2 + 0.5, { size: 13, color: "#fff", align: "right" }) + 18;
      // battery
      strokeRR(ctx, rx - 25, h / 2 - 6, 22, 12, 3.5, "rgba(255, 255, 255, 0.85)", 1.2);
      fillRR(ctx, rx - 23, h / 2 - 4, 15, 8, 2, "#fff");
      fillRR(ctx, rx - 2.5, h / 2 - 2.5, 1.8, 5, 1, "rgba(255, 255, 255, 0.85)");
      rx -= 25 + 18;
      // wifi
      ctx.save();
      ctx.translate(rx - 9, h / 2 + 5);
      ctx.strokeStyle = "#fff";
      ctx.lineCap = "round";
      ctx.lineWidth = 1.8;
      [10, 6.5].forEach((r) => {
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * 1.25, Math.PI * 1.75);
        ctx.stroke();
      });
      circle(ctx, 0, -1.2, 1.6, "#fff");
      ctx.restore();
      rx -= 18 + 20;
      // LightPlayer status item: template icon plus the song title
      const title = o.title || "";
      const tw = title ? measure(ctx, title, 13) + 6 : 0;
      const itemW = 16 + tw + 12;
      if (o.open) fillRR(ctx, rx - itemW, 3, itemW, h - 6, 5, "rgba(255, 255, 255, 0.22)");
      const ix = rx - itemW + 6;
      strokeRR(ctx, ix, h / 2 - 7, 14, 14, 3.5, "#fff", 1.5);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(ix + 5, h / 2 - 3.5);
      ctx.lineTo(ix + 10.5, h / 2);
      ctx.lineTo(ix + 5, h / 2 + 3.5);
      ctx.closePath();
      ctx.fill();
      if (title) text(ctx, title, ix + 16 + 6, h / 2 + 0.5, { size: 13, color: "#fff" });
      hits.trayItem = { x: rx - itemW, y: 0, w: itemW, h, cx: rx - itemW / 2, cy: h / 2 };
    }

    /** The status item's menu (macOS style), 280 wide. */
    function drawTrayMenu(ctx, o) {
      const w = 280;
      const items = copy.menubar.tray;
      const rows = [
        { t: items[0], disabled: true },
        { sep: true },
        { t: items[1] },
        { t: items[2] },
        { t: items[3] },
        { sep: true },
        { t: items[4], check: !!o.privateOn },
        { sep: true },
        { t: items[5] },
        { t: items[6] },
      ];
      const h = 6 + rows.reduce((a, r) => a + (r.sep ? 11 : 24), 0) + 6;
      ctx.clearRect(0, 0, w, 300);
      shadow(ctx, "rgba(0, 0, 0, 0.45)", 30, 0, 10);
      fillRR(ctx, 0.5, 0.5, w - 1, h - 1, 10, "rgba(42, 44, 52, 0.94)");
      noShadow(ctx);
      strokeRR(ctx, 0, 0, w, h, 10, "rgba(255, 255, 255, 0.14)");
      let y = 6;
      rows.forEach((r, i) => {
        if (r.sep) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
          ctx.fillRect(14, y + 5, w - 28, 1);
          y += 11;
          return;
        }
        if (o.hover === i) fillRR(ctx, 5, y, w - 10, 24, 5, "#2f6fd6");
        if (r.check) I.center(ctx, "check", 18, y + 12, 13, "#fff", 2.2);
        text(ctx, r.t, 28, y + 12.5, { size: 13, color: r.disabled ? "rgba(255, 255, 255, 0.45)" : "#fff", max: w - 44 });
        y += 24;
      });
      return h;
    }

    return {
      W,
      H,
      THEMES,
      hits,
      fmtTime,
      drawApp,
      drawDesktopLyrics,
      drawMenuBar,
      drawTrayMenu,
      drawCursor,
      videoRect,
      prim: { text, measure, wrap, btn, iconBtn, slider, chip, panel, fillRR, strokeRR, circle, shadow, noShadow, eq, thumbImg },
      FONT,
      MONO,
      DL_PRESETS,
    };
  }

  PV.createUI = createUI;
  PV.UI_SIZE = { W, H, TITLE_H, TRANSPORT_H };
})();
