// Feature tiles for the "and so much more" montage, drawn with the same UI
// primitives as the app (small pieces of the real interface on each tile).
(function () {
  const PV = (window.PV = window.PV || {});
  const { rr } = PV.util;
  const I = PV.icons;

  const PRESETS = ["#66ccff", "#7c5cff", "#13ce66", "#ff7849", "#ff4d8d", "#f7b500", "#00b8a9", "#8e8e93"];

  PV.drawTiles = function drawTiles(ctx, ui, copy, TW, TH, cols) {
    const P = ui.prim;
    const Th = ui.THEMES.dark;
    const F = ui.FONT;

    copy.tiles.forEach((tile, i) => {
      const x = (i % cols) * TW;
      const y = Math.floor(i / cols) * TH;
      ctx.save();
      ctx.translate(x, y);
      rr(ctx, 0, 0, TW, TH, 26);
      ctx.clip();
      // tile surface
      const g = ctx.createLinearGradient(0, 0, TW, TH);
      g.addColorStop(0, "#202026");
      g.addColorStop(1, "#141418");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TW, TH);
      const glow = ctx.createRadialGradient(TW * 0.85, -20, 0, TW * 0.85, -20, TW * 0.8);
      glow.addColorStop(0, "rgba(102, 204, 255, 0.12)");
      glow.addColorStop(1, "rgba(102, 204, 255, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, TW, TH);
      P.strokeRR(ctx, 0, 0, TW, TH, 26, "rgba(255, 255, 255, 0.1)", 2);

      // icon + text
      I.draw(ctx, tile.icon, 34, 32, 34, "#66ccff", 1.9);
      P.text(ctx, tile.t, 34, TH - 78, { size: 28, weight: 700, color: "#f5f5f7", max: TW - 68 });
      P.text(ctx, tile.d, 34, TH - 40, { size: 18, color: "#a1a1a6", max: TW - 68 });

      // illustration, top right
      const ax = 150;
      const ay = 40;
      const aw = TW - ax - 34;
      switch (tile.kind) {
        case "ab": {
          P.slider(ctx, Th, ax, ay + 70, aw, 0.52, { ab: [0.3, 0.62], hover: true });
          P.text(ctx, "A", ax + aw * 0.3, ay + 44, { size: 15, weight: 700, color: Th.accentText, align: "center" });
          P.text(ctx, "B", ax + aw * 0.62, ay + 44, { size: 15, weight: 700, color: Th.accentText, align: "center" });
          P.text(ctx, "1:24", ax, ay + 104, { size: 14, color: Th.textFaint });
          P.text(ctx, "2:31", ax + aw, ay + 104, { size: 14, color: Th.textFaint, align: "right" });
          break;
        }
        case "speed": {
          const gg = ctx.createLinearGradient(ax, 0, ax + aw, 0);
          gg.addColorStop(0, "#66ccff");
          gg.addColorStop(1, "#b388ff");
          P.text(ctx, "1.5×", ax + aw, ay + 64, { size: 84, weight: 700, color: gg, align: "right" });
          break;
        }
        case "timer": {
          const cx = ax + aw - 66;
          const cy = ay + 70;
          ctx.lineCap = "round";
          ctx.lineWidth = 10;
          ctx.strokeStyle = Th.track;
          ctx.beginPath();
          ctx.arc(cx, cy, 58, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "#66ccff";
          ctx.beginPath();
          ctx.arc(cx, cy, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.62);
          ctx.stroke();
          P.text(ctx, "18:30", cx, cy + 2, { size: 26, weight: 600, color: "#f5f5f7", align: "center" });
          break;
        }
        case "private": {
          ctx.save();
          ctx.translate(ax + aw - 190, ay + 46);
          ctx.scale(2, 2);
          const label = copy.ui.privateBadge;
          const w = 10 + 15 + 5 + P.measure(ctx, label, 12, 600) + 10;
          P.fillRR(ctx, 95 - w, 0, w, 26, 13, "rgba(242, 242, 245, 0.82)");
          I.center(ctx, "incognito", 95 - w + 17.5, 13, 15, "#111115");
          P.text(ctx, label, 95 - w + 30, 13.5, { size: 12, weight: 600, color: "#111115" });
          ctx.restore();
          break;
        }
        case "editor": {
          const rows = copy.editorRows;
          rows.forEach(([ts, txt], k) => {
            const ry = ay + 4 + k * 46;
            const cursor = k === 2;
            if (cursor) {
              P.fillRR(ctx, ax - 8, ry, aw + 8, 40, 8, Th.accentSoft);
              P.strokeRR(ctx, ax - 8, ry, aw + 8, 40, 8, "#66ccff", 1.5);
            }
            P.text(ctx, ts, ax + 4, ry + 20, { size: 14, color: ts.startsWith("-") ? Th.textFaint : Th.accentText, family: ui.MONO });
            P.text(ctx, txt, ax + 96, ry + 20, { size: 14, color: "#f2f2f5", max: aw - 100 });
          });
          break;
        }
        case "frames": {
          for (let k = 0; k < 3; k++) {
            const fx = ax + 10 + k * 92;
            const fy = ay + 18;
            const gr = ctx.createLinearGradient(fx, fy, fx, fy + 62);
            gr.addColorStop(0, "#f39a6b");
            gr.addColorStop(0.55, "#7d5c86");
            gr.addColorStop(0.56, "#1d3557");
            gr.addColorStop(1, "#0b1a33");
            P.fillRR(ctx, fx, fy, 84, 62, 6, gr);
            P.fillRR(ctx, fx + 30 + k * 6, fy + 22, 14, 14, 7, "rgba(255, 236, 200, 0.95)");
            if (k === 1) P.strokeRR(ctx, fx - 3, fy - 3, 90, 68, 8, "#66ccff", 2.5);
          }
          [",", "."].forEach((key, k) => {
            const kx = ax + 300 + k * 46;
            const ky = ay + 36;
            P.fillRR(ctx, kx, ky, 38, 38, 8, "rgba(255, 255, 255, 0.06)");
            P.strokeRR(ctx, kx, ky, 38, 38, 8, "rgba(255, 255, 255, 0.16)", 1.5);
            P.text(ctx, key, kx + 19, ky + 17, { size: 22, weight: 700, color: "#f2f2f5", align: "center", family: ui.MONO });
          });
          break;
        }
        case "swatches": {
          PRESETS.forEach((c, k) => {
            const sx = ax + 14 + k * 40;
            P.circle(ctx, sx, ay + 66, 15, c);
            if (k === 0) {
              ctx.strokeStyle = "#f2f2f5";
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(sx, ay + 66, 18.5, 0, Math.PI * 2);
              ctx.stroke();
            }
          });
          break;
        }
        case "queue": {
          copy.queueRows.forEach(([t, s], k) => {
            const ry = ay + k * 46;
            if (k === 0) P.fillRR(ctx, ax - 8, ry, aw + 8, 42, 9, Th.accentSoft);
            P.thumbImg(ctx, ax, ry + 5, 32, 6, PV.art.cover([0, 1, 3][k], 128));
            P.text(ctx, t, ax + 42, ry + 14, { size: 13.5, weight: 600, color: "#f2f2f5", max: 130 });
            P.text(ctx, s, ax + 42, ry + 31, { size: 12, color: Th.textDim, max: aw - 50 });
            if (k === 0) {
              P.fillRR(ctx, ax + 190, ry + 12, aw - 200, 4, 2, Th.track);
              P.fillRR(ctx, ax + 190, ry + 12, (aw - 200) * 0.72, 4, 2, "#66ccff");
            }
          });
          break;
        }
        default: {
          I.center(ctx, tile.icon, ax + aw - 60, ay + 64, 96, "rgba(102, 204, 255, 0.18)", 1.4);
        }
      }
      ctx.restore();
    });
  };
})();
