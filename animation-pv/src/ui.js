// ui.js: LightPlayer's interface, redrawn from the app's source code.
//
// Surfaces (window, panels, buttons, covers, the record) are painted with p5.brush like everything else.
// Text and icons go on a crisp layer in the UI's own coordinates (CSS px of the app window), using the
// same data as the app:
//   icons        the SVG paths in src/components/Icon.tsx (24px grid, stroke 1.8, round caps)
//   sizes        src/styles/app.css (titlebar 44px, transport 92px, radii 8/12/18px, fonts, gaps)
//   colours      the CSS tokens, accentPalette() from src/lib/color.ts, ACCENT_PRESETS, the weather skies
//   text         the Chinese UI strings in the components
// All coordinates below are in app CSS px unless a comment says otherwise.

const FONT_UI = '"Noto Sans SC", "WenQuanYi Zen Hei", sans-serif';
const FONT_TITLE = '"ZCOOL KuaiLe", "Noto Sans SC", sans-serif';
const FONT_LOGO = '"Fredoka", "Noto Sans SC", sans-serif';

// ---------- icons: src/components/Icon.tsx ----------
const ICONS = {
  play: 'M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z',
  pause: 'M7 5h3.2v14H7zM13.8 5H17v14h-3.2z',
  next: 'M5 5.8v12.4a.8.8 0 0 0 1.24.66L15 13V18.2h2V5.8h-2V11L6.24 5.14A.8.8 0 0 0 5 5.8z',
  prev: 'M19 5.8v12.4a.8.8 0 0 1-1.24.66L9 13V18.2H7V5.8h2V11l8.76-5.86A.8.8 0 0 1 19 5.8z',
  sequential: 'M4 7h12M4 12h12M4 17h8M18 14v6l3-3z',
  loop: 'M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  volume: 'M4 9v6h4l5 4V5L8 9zM16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  lyrics: 'M4 5h16M4 10h10M4 15h16M4 20h8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 15l.6 1.4 1.4.6-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
  chevronLeft: 'M15 18l-6-6 6-6',
  textSize: 'M3 19l5-13 5 13M4.8 14.5h6.4M14 19l3.5-8.5L21 19M15.1 16.3h4.8',
  close: 'M6 6l12 12M18 6L6 18',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2 2M9 2h6',
  speed: 'M12 21a9 9 0 1 1 9-9M12 12l5-3',
  ab: 'M4 18L8 6l4 12M5.3 14h5.4M15 6h3.5a3 3 0 0 1 0 6H15zM15 12h4a3 3 0 0 1 0 6h-4z',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  warning: 'M12 3L2 20h20zM12 10v4M12 17h.01',
  library: 'M5 4h3v16H5zM10.5 4h3v16h-3zM16 5l2.9-.8 3.9 15-2.9.8z',
  heart: 'M12 20s-7-4.4-9.2-8.6C1.3 8.4 3.2 5 6.5 5c2 0 3.5 1.2 5.5 3.2C14 6.2 15.5 5 17.5 5c3.3 0 5.2 3.4 3.7 6.4C19 15.6 12 20 12 20z',
  heartFill: 'M12 20s-7-4.4-9.2-8.6C1.3 8.4 3.2 5 6.5 5c2 0 3.5 1.2 5.5 3.2C14 6.2 15.5 5 17.5 5c3.3 0 5.2 3.4 3.7 6.4C19 15.6 12 20 12 20z',
  flow: 'M9 5.5h6v13H9zM6 7.5 3 8.5v7l3 1zM18 7.5l3 1v7l-3 1z',
  album: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  playlist: 'M4 6h11M4 11h11M4 16h7M18 13v7M14.5 16.5h7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  folderPlus: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10.5v5M9.5 13h5',
  desktopLyrics: 'M3 4.5h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1zM8.5 20.5h7M12 16.5v4M6.5 10.5h4.5M13.5 10.5h4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  layout: 'M4 5h16v14H4zM4 10h16M10 10v9',
  cloudSun: 'M8 2.5V4M3.4 4.4l1 1M2 9.5h1.5M5.2 11.4A3.5 3.5 0 0 1 11.3 7M9.5 20h8a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.6 13 3.5 3.5 0 0 0 9.5 20z',
  rain: 'M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 7.1 4 4 0 0 0 7 15zM8.5 18l-1 3M12.5 18l-1 3M16.5 18l-1 3',
  vinyl: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 6.5A5.5 5.5 0 0 0 6.5 12',
  check: 'M5 12l5 5L20 7',
};
const FILLED = new Set(['play', 'pause', 'next', 'prev', 'heartFill']);
// SkipIcon (Icon.tsx): circular "jump back / forward N seconds", stroke 1.6, the step written inside.
const SKIP = {
  back: ['M12 4.6A8.6 8.6 0 1 1 4.55 8.9', 'M14.3 2.3 11.7 4.6l2.6 2.3'],
  fwd: ['M12 4.6A8.6 8.6 0 1 0 19.45 8.9', 'M9.7 2.3 12.3 4.6 9.7 6.9'],
};
// The tonearm (src/layout/FreeLayout.tsx), in the record's 0..100 viewBox.
const TONEARM = { tube: 'M55 -13 C 60 -8, 66 -2, 70.5 4.5 S 75 12, 76 14' };

const P2D = {};
const path2d = d => P2D[d] || (P2D[d] = new Path2D(d));

// ---------- colours ----------
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbHex({ r, g, b }) { const c = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'); return `#${c(r)}${c(g)}${c(b)}`; }
function rgbHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
const chan = v => { const s = v / 255; return s <= .03928 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4); };
const lum = ({ r, g, b }) => .2126 * chan(r) + .7152 * chan(g) + .0722 * chan(b);
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };
function readable(h, s, l, bg, dark, min) {
  let c = hslRgb(h, s, l);
  for (let i = 0; i < 24 && contrast(c, bg) < min; i++) { l = dark ? Math.min(.92, l + .03) : Math.max(.08, l - .03); c = hslRgb(h, s, l); }
  return [c, l];
}
// accentPalette() from src/lib/color.ts
const ACC_CACHE = {};
function accentPalette(hex, dark = false) {
  const key = hex + dark; if (ACC_CACHE[key]) return ACC_CACHE[key];
  const [h, s, l] = rgbHsl(hexRgb(hex)), bg = dark ? { r: 18, g: 18, b: 22 } : { r: 250, g: 250, b: 252 };
  const [fill] = readable(h, s, l, bg, dark, 1.4), [text, tl] = readable(h, s, l, bg, dark, 3), [strong] = readable(h, Math.min(1, s + .05), tl, bg, dark, 4.2);
  return ACC_CACHE[key] = { accent: rgbHex(fill), text: rgbHex(text), strong: rgbHex(strong), on: lum(fill) > .62 ? '#111111' : '#ffffff' };
}
const ACCENT_PRESETS = ['#66ccff', '#7c5cff', '#13ce66', '#ff7849', '#ff4d8d', '#f7b500', '#00b8a9', '#8e8e93'];   // src/stores/settings.ts
const HL_PRESETS = ['#66ccff', '#7c5cff', '#13ce66', '#ffd166', '#ff7849', '#ff4d8d', '#ffffff', '#00e5ff'];        // ColorChoices.tsx
const DL_PRESETS = ['#66ccff', '#ffd166', '#ff4d8d', '#13ce66', '#ffffff', '#ff7849', '#b388ff'];                   // DesktopLyrics.tsx
// The nine stages of the day (src/core/weather/scene.ts): sky gradient top / 55% / bottom, and the accent.
const SKY = {
  daybreak: { sky: ['#1b2a5a', '#5b5b90', '#d6978d'], accent: '#a78bfa' },
  sunrise: { sky: ['#34528f', '#c97f78', '#f4b98d'], accent: '#ff8a4c' },
  morning: { sky: ['#2f80da', '#6aaee2', '#b4d8f3'], accent: '#2fa4ff' },
  noon: { sky: ['#2a78d6', '#5ea6ea', '#a3d0f5'], accent: '#0a84ff' },
  afternoon: { sky: ['#3073c6', '#69a3da', '#b9d3e8'], accent: '#14b8a6' },
  evening: { sky: ['#3a67aa', '#9e98ae', '#f0c287'], accent: '#f5a524' },
  sunset: { sky: ['#27356f', '#8f5a8c', '#ee9066'], accent: '#ff6b5b' },
  night: { sky: ['#060a1c', '#111d45', '#22346a'], accent: '#8b7cf6' },
  midnight: { sky: ['#03060f', '#0a1230', '#16244e'], accent: '#6d7cf2' },
  rain: { sky: ['#3a4c61', '#56687d', '#738396'], accent: '#5ea6ea' },
};

// The CSS tokens: light theme, and the weather theme's white text over glass.
const LIGHT = {
  mode: 'light', bg: '#f4f4f7', panel: '#fbfbfd', panelOp: 255, panelSolid: '#ffffff', panel2: '#ececf0', hover: '#e7e7ec', border: '#dcdce4',
  text: '#16161a', dim: '#5b5b66', faint: '#9a9aa6', track: '#dadae0', shadow: '#2a2a50',
};
const WEATHER = {
  mode: 'weather', bg: '#1b2433', panel: '#16203a', panelOp: 70, panelSolid: '#1f2738', panel2: '#ffffff', hover: '#ffffff', border: '#c9d3e6',
  text: '#ffffff', dim: 'rgba(255,255,255,.86)', faint: 'rgba(255,255,255,.66)', track: '#ffffff', shadow: '#08101e',
};
let TH = LIGHT, ACC = accentPalette('#66ccff');
function useTheme(th, accent) { TH = th; ACC = accentPalette(accent, th.mode !== 'light'); }

// ---------- the UI transform: app CSS px → world (mirrors p5's matrix for the crisp layer) ----------
const IDM = [1, 0, 0, 1, 0, 0];
const mmul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
let UIS = [IDM];
function uiPush(tx = 0, ty = 0, s = 1, rot = 0) {
  push(); translate(tx, ty); if (rot) rotate(rot); scale(s);
  const c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
  UIS.push(mmul(UIS[UIS.length - 1], [c, sn, -sn, c, tx, ty]));
}
function uiPop() { pop(); UIS.pop(); }
function uiReset() { UIS = [IDM]; }
function camM() {
  if (!CAM) return IDM;
  const { cx, cy, zoom, rot } = CAM, c = Math.cos(rot) * zoom, s = Math.sin(rot) * zoom;
  return [c, s, -s, c, W / 2 - (c * cx - s * cy), H / 2 - (s * cx + c * cy)];
}
// UI point → screen px (for aiming irises and for Clawd's taps)
function uiToWorld(x, y) { const m = UIS[UIS.length - 1]; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

// A crisp mark in the current UI coordinates, composited with the lettering (call flushLetters() to put it under later paint).
function glyph(fn, alpha = 1) { if (alpha > .003) LETTERS.push({ fn, m: mmul(camM(), UIS[UIS.length - 1]), alpha: clamp(alpha) }); }

function font(o) { return `${o.italic ? 'italic ' : ''}${o.weight || 400} ${o.size || 14}px ${o.font || FONT_UI}`; }
function txt(s, x, y, o = {}) {
  glyph(c => {
    c.font = font(o); c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'middle';
    if (o.spacing) c.letterSpacing = o.spacing + 'px';
    if (o.shadow) { c.shadowColor = o.shadow; c.shadowBlur = o.blur ?? 6; c.shadowOffsetY = o.sy ?? 1; }
    if (o.stroke) { c.lineJoin = 'round'; c.lineWidth = o.strokeW || 3; c.strokeStyle = o.stroke; c.strokeText(s, x, y); }
    c.fillStyle = o.color || TH.text;
    if (o.maxW) { const w = c.measureText(s).width; if (w > o.maxW) { c.save(); c.beginPath(); c.rect(x - (o.align === 'center' ? o.maxW / 2 : 0), y - 100, o.maxW, 200); c.clip(); c.fillText(s, x, y); c.restore(); return; } }
    c.fillText(s, x, y);
  }, o.alpha ?? 1);
}
// Karaoke: the line fills word by word with the highlight colour (LyricsView: background-clip text, --p).
function karaoke(s, x, y, o, p, hl, dimCol) {
  glyph(c => {
    c.font = font(o); c.textAlign = 'center'; c.textBaseline = 'middle';
    if (o.shadow) { c.shadowColor = o.shadow; c.shadowBlur = 6; c.shadowOffsetY = 1; }
    const w = c.measureText(s).width, x0 = x - w / 2;
    c.fillStyle = dimCol; c.fillText(s, x, y);
    if (p > 0) { c.save(); c.beginPath(); c.rect(x0 - 2, y - o.size, w * clamp(p) + 2, o.size * 2); c.clip(); c.fillStyle = hl; c.fillText(s, x, y); c.restore(); }
  }, o.alpha ?? 1);
}
function icon(name, x, y, size = 20, col = TH.dim, o = {}) {
  glyph(c => {
    c.translate(x - size / 2, y - size / 2); c.scale(size / 24, size / 24);
    const p = path2d(ICONS[name]);
    if (FILLED.has(name) && !o.outline) { c.fillStyle = col; c.fill(p); }
    else { c.strokeStyle = col; c.lineWidth = o.sw || 1.8; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(p); }
  }, o.alpha ?? 1);
}
function skipIcon(dir, secs, x, y, size, col) {
  glyph(c => {
    c.translate(x - size / 2, y - size / 2); c.scale(size / 24, size / 24);
    c.strokeStyle = col; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const d of SKIP[dir]) c.stroke(path2d(d));
    c.fillStyle = col; c.font = `650 8.2px ${FONT_UI}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(String(secs), 12, 16.25);
  });
}
// A smooth gradient fill for small UI marks (the brand dot, the icon): crisp layer.
function gradRR(x, y, w, h, r, c1, c2, alpha = 1) {
  glyph(c => { const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); c.fillStyle = g; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }, alpha);
}

// ---------- painted shapes ----------
// rr: a painted rounded rectangle. o: { fill, op, ink, sw, key }. Seeds its own boil from its geometry.
function rr(x, y, w, h, r, o = {}) {
  if (w < 1 || h < 1) return;
  boilSeed(o.key || `rr${x | 0},${y | 0},${w | 0},${h | 0}`);
  paint(rrPts(x, y, w, h, Math.max(.5, Math.min(r, w / 2, h / 2)), o.j ?? 0), { wash: o.fill, washOp: o.op ?? 255, ink: o.ink === undefined ? null : o.ink, sw: o.sw ?? .45, br: o.br || 'inkfine' });
}
function circ(x, y, r, o = {}) {
  boilSeed(o.key || `c${x | 0},${y | 0},${r | 0}`);
  paint(ellPts(x, y, r, r, o.n || Math.max(14, Math.min(48, r | 0)), o.j ?? 0), { wash: o.fill, washOp: o.op ?? 255, ink: o.ink === undefined ? null : o.ink, sw: o.sw ?? .45, br: o.br || 'inkfine' });
}
// A soft drop shadow: a few offset washes (--shadow / --cover-shadow).
function shadowRR(x, y, w, h, r, k = 1, col = TH.shadow) {
  for (let i = 0; i < 3; i++) { const g = (3 - i) * 5 * k; rr(x - g * .4, y + g * .6, w + g * .8, h + g * .5, r + g * .5, { fill: col, op: 11 * k, key: `sh${i}${x | 0}${y | 0}` }); }
}
// --panel: a frosted surface (border 1px var(--border), radius 18).
function panel(x, y, w, h, r = 18, o = {}) {
  rr(x, y, w, h, r, { fill: o.fill || TH.panel, op: o.op ?? TH.panelOp, ink: TH.mode === 'light' ? TH.border : null, sw: .4, key: o.key });
  if (TH.mode !== 'light') inkLine([[x + r, y + .5], [x + w - r, y + .5]], .35, '#ffffff', 'inkfine', 0);
}
// .btn (height 32, radius 8, panel-2 background, 1px border); kind: '' | 'primary' | 'ghost'; returns its width.
function btn(x, y, label, o = {}) {
  const h = o.h || 32, fs = o.fs || 14, pad = o.pad ?? 12, iw = o.icon ? (o.isz || 16) + 6 : 0, w = o.w || Math.round(pad * 2 + iw + textW(label, fs, o.weight || 400));
  const kind = o.kind || '', sc = o.press ? 1 - .03 * o.press : 1;
  uiPush(x + w / 2, y + h / 2, sc);
  const X = -w / 2, Y = -h / 2;
  if (kind === 'primary') rr(X, Y, w, h, o.r || 8, { fill: o.hot ? mixCol(ACC.accent, '#000000', .08) : ACC.accent, key: o.key });
  else if (kind !== 'ghost' || o.hot) rr(X, Y, w, h, o.r || 8, { fill: o.hot ? TH.hover : TH.panel2, op: TH.mode === 'light' ? 255 : 40, ink: kind === 'ghost' ? null : TH.border, sw: .35, key: o.key });
  const col = kind === 'primary' ? ACC.on : o.color || TH.text;
  if (o.icon) icon(o.icon, X + pad + (o.isz || 16) / 2, 0, o.isz || 16, col);
  txt(label, X + pad + iw, .5, { size: fs, color: col, weight: o.weight || 400 });
  uiPop();
  return w;
}
// Width of a text run, measured with the real font.
let MEASURE = null;
function textW(s, size, weight = 400, f = FONT_UI) {
  if (!MEASURE) MEASURE = document.createElement('canvas').getContext('2d');
  MEASURE.font = `${weight} ${size}px ${f}`; return MEASURE.measureText(s).width;
}
// .icon-btn: a 34px round button; `on` = .active (accent text + 4px dot under it).
function iconBtn(name, x, y, o = {}) {
  if (o.hot) circ(x, y, (o.d || 34) / 2, { fill: TH.hover, op: TH.mode === 'light' ? 255 : 50 });
  icon(name, x, y, o.size || 20, o.on ? ACC.text : o.color || TH.dim, o);
  if (o.on) circ(x, y + 14, 2, { fill: ACC.accent });
}
// .slider: 4px rail (6px when hovered), accent fill, optional thumb.
function slider(x, y, w, v, o = {}) {
  const h = o.h || 4;
  rr(x, y - h / 2, w, h, h / 2, { fill: TH.track, op: TH.mode === 'light' ? 255 : 70, key: o.key && o.key + 'r' });
  if (o.buf) rr(x, y - h / 2, w * o.buf, h, h / 2, { fill: TH.track, op: TH.mode === 'light' ? 255 : 70, key: o.key && o.key + 'b' });
  if (v > .003) rr(x, y - h / 2, Math.max(h, w * v), h, h / 2, { fill: o.color || ACC.accent, key: o.key && o.key + 'f' });
  if (o.thumb) { circ(x + w * v, y + 1, 7.5, { fill: TH.shadow, op: 40 }); circ(x + w * v, y, 7, { fill: '#ffffff', ink: '#c8c8d0', sw: .3 }); }
}
function chip(x, y, label, o = {}) {
  const w = textW(label, 11.5) + 18, h = 20;
  rr(x, y - h / 2, w, h, 10, o.accent ? { fill: mixCol(ACC.accent, TH.mode === 'light' ? '#ffffff' : '#1b2433', .78) } : { fill: TH.panel2, op: TH.mode === 'light' ? 255 : 45, ink: TH.border, sw: .3 });
  txt(label, x + 9, y + .5, { size: 11.5, color: o.accent ? ACC.text : TH.dim });
  return w;
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;   // lib/format formatTime

// ---------- covers (painted album art; the songs are made up for the film) ----------
// kind: 'dusk' (warm sun over waves), 'sea' (teal sea under a moon), 'bloom' (pink petals), 'city', 'leaf', 'mono'
function coverArt(kind, x, y, s, r = 0) {
  const pal = {
    dusk: ['#ff9a62', '#ffcf7a', '#e8607a', '#7b5ca8'], sea: ['#1f8f8f', '#7fd6c8', '#22446e', '#f6f1d8'],
    bloom: ['#ff8fb1', '#ffe0ea', '#c4407a', '#fff5e2'], city: ['#4a4ea8', '#8ea2ff', '#f7b500', '#1e2050'],
    leaf: ['#5fb36a', '#d4f0a8', '#2f6f4f', '#fff5e2'], mono: ['#3d8bff', '#66ccff', '#ffffff', '#1b4b9a'],
  }[kind];
  const R = r || s * .06;
  rr(x, y, s, s, R, { fill: pal[0], key: 'cv' + kind + (x | 0) });
  boilSeed('cvart' + kind + (x | 0) + (y | 0));
  const P = (a, b) => [x + a * s, y + b * s];
  if (kind === 'dusk') {
    paint(ellPts(...P(.5, .5), s * .24, s * .24, 26), { wash: pal[1], ink: null });
    paint([P(.06, .66), P(.3, .6), P(.55, .68), P(.8, .6), P(.94, .66), P(.94, .94), P(.06, .94)], { wash: pal[2], ink: null, curv: .5 });
    paint([P(.06, .8), P(.35, .74), P(.6, .82), P(.94, .76), P(.94, .94), P(.06, .94)], { wash: pal[3], ink: null, curv: .5 });
  } else if (kind === 'sea') {
    paint(ellPts(...P(.68, .3), s * .12, s * .12, 22), { wash: pal[3], ink: null });
    paint([P(.06, .58), P(.4, .52), P(.7, .6), P(.94, .54), P(.94, .94), P(.06, .94)], { wash: pal[1], ink: null, curv: .5 });
    paint([P(.06, .74), P(.45, .68), P(.94, .74), P(.94, .94), P(.06, .94)], { wash: pal[2], ink: null, curv: .5 });
  } else if (kind === 'bloom') {
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; paint(ellPts(...P(.5 + Math.cos(a) * .17, .5 + Math.sin(a) * .17), s * .15, s * .1, 16, 0, a), { wash: pal[1], ink: null }); }
    paint(ellPts(...P(.5, .5), s * .08, s * .08, 14), { wash: pal[2], ink: null });
  } else if (kind === 'city') {
    paint(ellPts(...P(.72, .26), s * .1, s * .1, 18), { wash: pal[2], ink: null });
    for (let i = 0; i < 6; i++) paint(rectPts(...P(.08 + i * .145, .5 + hash(i + 3) * .2), s * .12, s * (.44 - hash(i + 3) * .2)), { wash: i % 2 ? pal[3] : pal[1], ink: null });
  } else if (kind === 'leaf') {
    paint(ribbon([P(.2, .8), P(.45, .45), P(.8, .2)], s * .02, s * .3), { wash: pal[1], ink: null });
    paint(ribbon([P(.3, .85), P(.6, .62), P(.85, .55)], s * .02, s * .18), { wash: pal[2], ink: null });
  } else {
    paint(ellPts(...P(.5, .5), s * .3, s * .3, 26), { wash: pal[1], ink: null });
    paint(ellPts(...P(.5, .5), s * .06, s * .06, 12), { wash: pal[2], ink: null });
  }
}

// ---------- the app window ----------
// The window is 1280 × 780 CSS px. Rows: titlebar 44, main, transport 92 (margin 0 10px 10px).
const APP_W = 1280, APP_H = 780, TB_H = 44, TR_H = 92;
const MAIN_Y = TB_H, MAIN_B = APP_H - TR_H;
// Window frame and background. o.sky: [top, mid, bottom] for the weather theme.
function winFrame(o = {}) {
  shadowRR(0, 0, APP_W, APP_H, 12, 1.6, '#1d1a33');
  if (o.sky) skyFill(0, 0, APP_W, APP_H, o.sky, 12, o.skyKey || 'win');
  else {
    rr(0, 0, APP_W, APP_H, 12, { fill: TH.bg, ink: '#b9b9c8', sw: .5, key: 'winbg' });
    // --bg-grad: accent tint top left, violet tint bottom right
    boilSeed('bggrad');
    paint(ellPts(130, -70, 620, 360, 30), { wash: ACC.accent, washOp: 26, ink: null });
    paint(ellPts(1350, 830, 560, 380, 30), { wash: '#a08cff', washOp: 16, ink: null });
  }
}
// A painted vertical gradient: bands of wash between the three stops (top, 55%, bottom), with soft wavy seams.
function skyFill(x, y, w, h, cols, r, key, n = 16) {
  rr(x, y, w, h, r, { fill: cols[0], key: key + 'base' });
  for (let i = 1; i < n; i++) {
    const k = i / n, col = k < .55 ? mixCol(cols[0], cols[1], k / .55) : mixCol(cols[1], cols[2], (k - .55) / .45);
    const yy = y + h * k, pts = [];
    for (let j = 0; j <= 8; j++) pts.push([x + w * j / 8, yy + Math.sin(j * 1.3 + i) * 5]);
    pts.push([x + w, y + h - (i === n - 1 ? 0 : 0)]);
    const bottom = y + h;
    boilSeed(key + 'band' + i);
    const R = Math.min(r, bottom - yy);
    const poly = pts.concat([[x + w, bottom - R], [x + w - R * .3, bottom - R * .05], [x + w - R, bottom], [x + R, bottom], [x + R * .3, bottom - R * .05], [x, bottom - R]]);
    paint(poly, { wash: col, ink: null });
  }
}
// Titlebar: traffic lights, brand, file name, the buttons on the right (App.tsx).
function titlebar(o = {}) {
  [['#ff5f57', 20], ['#febc2e', 40], ['#28c840', 60]].forEach(([c, x]) => circ(x, 22, 6, { fill: c, ink: mixCol(c, '#000000', .25), sw: .25, key: 'tl' + x }));
  gradRR(86, 17, 10, 10, 3, ACC.accent, '#3d8bff');
  txt('LightPlayer', 104, 22.5, { size: 14, weight: 600, color: TH.dim, spacing: .2 });
  if (o.file) txt(o.file, 640, 22.5, { size: 12.5, color: TH.faint, align: 'center' });
  let x = APP_W - 14 - 17;
  iconBtn('settings', x, 22); x -= 44;
  iconBtn('folder', x, 22); x -= 44;
  if (o.asr) { iconBtn('sparkles', x, 22, { on: true }); x -= 44; }
  iconBtn('library', x, 22, { on: o.page === 'library' }); x -= 44;
  if (o.weather) { const s = o.weather; icon(s.icon, x - 14, 22, 17, TH.text); txt(s.label, x - 2, 22.5, { size: 13, weight: 600, color: TH.text }); }
}
// The play bar (TransportBar.tsx). o: { pos, dur, playing, title, artist, cover, fav, lyricsOn, mode, press }
function transport(o = {}) {
  const X = 10, Y = APP_H - TR_H, Wd = APP_W - 20, Hh = TR_H - 10;
  panel(X, Y, Wd, Hh, 18, { key: 'transport' });
  // progress row: 58px | 1fr | 58px, gap 10, padding 0 18px
  const py = Y + 4 + 11, sx = X + 18 + 58 + 10, sw = Wd - 36 - 116 - 20;
  txt(fmt(o.pos || 0), X + 18, py, { size: 11.5, color: TH.faint });
  txt(fmt(o.dur || 0), X + Wd - 18, py, { size: 11.5, color: TH.faint, align: 'right' });
  slider(sx, py, sw, o.dur ? o.pos / o.dur : 0, { buf: o.dur ? Math.min(1, o.pos / o.dur + .18) : 0, key: 'prog' });
  const cy = Y + 4 + 22 + 25;
  // left: the mini now-playing block
  const mx = X + 18;
  if (o.cover) coverArt(o.cover, mx, cy - 21, 42, 8); else { rr(mx, cy - 21, 42, 42, 8, { fill: TH.panel2, op: TH.mode === 'light' ? 255 : 45 }); icon('music', mx + 21, cy, 20, TH.faint); }
  txt(o.title || 'LightPlayer', mx + 52, cy - 9, { size: 14, weight: 600, maxW: 220 });
  txt(o.artist || '未在播放', mx + 52, cy + 10, { size: 12, color: TH.dim, maxW: 220 });
  if (o.title) icon(o.fav ? 'heartFill' : 'heart', mx + 62 + Math.min(220, Math.max(textW(o.title, 14, 600), textW(o.artist || '', 12))), cy, 16, o.fav ? '#ff4d6d' : TH.faint);
  // centre: mode, prev, back 15, play, forward 15, next, A-B (gap 6)
  const c0 = APP_W / 2 - 144;
  let x = c0 + 17;
  iconBtn(o.mode || 'sequential', x, cy); x += 40;
  iconBtn('prev', x, cy); x += 40;
  skipIcon('back', 15, x, cy, 28, TH.dim); x += 40 + 7;
  const ps = 1 - .08 * (o.press || 0);
  circ(x, cy + 5, 24 * ps, { fill: ACC.accent, op: 40, key: 'pbsh' });
  circ(x, cy, 24 * ps, { fill: ACC.accent, key: 'pb' });
  icon(o.playing ? 'pause' : 'play', x + (o.playing ? 0 : 1), cy, 22 * ps, ACC.on);
  x += 24 + 6 + 17;
  skipIcon('fwd', 15, x, cy, 28, TH.dim); x += 40;
  iconBtn('next', x, cy); x += 40;
  iconBtn('ab', x, cy);
  // right: speed, sleep timer, desktop lyrics, playlist, volume (132px)
  let r = X + Wd - 18 - 132;
  iconBtn('volume', r + 17, cy); slider(r + 38, cy, 90, .72, { key: 'vol' });
  r -= 2 + 17; iconBtn('list', r, cy);
  r -= 36; iconBtn('desktopLyrics', r, cy, { on: o.lyricsOn, hot: o.dlHot });
  r -= 36; iconBtn('timer', r, cy);
  r -= 36; iconBtn('speed', r, cy);
}
// Where things sit in the play bar (for Clawd and for the rain).
const TRANSPORT_TOP = APP_H - TR_H;
const PLAY_BTN = [APP_W / 2 - 144 + 17 + 40 * 3 + 7, APP_H - TR_H + 51];
const DL_BTN = [10 + APP_W - 20 - 18 - 132 - 2 - 17 - 36, APP_H - TR_H + 51];

// ---------- library page (LibraryPage.tsx, TrackTable.tsx) ----------
const NAV = [['music', '歌曲'], ['album', '专辑'], ['user', '艺术家'], ['film', '视频'], ['heart', '收藏'], ['clock', '最近播放']];
function libraryPage(o = {}) {
  const top = MAIN_Y + 4;
  // sidebar 210px
  let y = top + 4 + 18;
  NAV.forEach(([ic, label], i) => {
    if (i === 0) rr(12, y - 17, 206, 34, 9, { fill: mixCol(ACC.accent, TH.bg, .84), key: 'navon' });
    icon(ic, 32, y, 17, i === 0 ? ACC.text : TH.dim);
    txt(label, 51, y + .5, { size: 13.5, color: i === 0 ? ACC.text : TH.dim, weight: i === 0 ? 600 : 400 });
    y += 36;
  });
  y += 10;
  txt('歌单', 20, y + 8, { size: 11.5, weight: 600, color: TH.faint, spacing: .5 });
  icon('folderPlus', 176, y + 8, 16, TH.dim); icon('plus', 204, y + 8, 16, TH.dim);
  y += 34;
  [['夜里散步', 12], ['通勤路上', 28], ['周末慢歌', 9]].forEach(([n, c]) => {
    icon('playlist', 32, y, 17, TH.dim); txt(n, 51, y + .5, { size: 13.5, color: TH.dim }); txt(String(c), 205, y + .5, { size: 11.5, color: TH.faint, align: 'right' });
    y += 36;
  });
  inkLine([[14, MAIN_B - 58], [216, MAIN_B - 58]], .3, TH.border, 'inkfine', 0);
  icon('folder', 32, MAIN_B - 34, 17, TH.dim); txt('管理文件夹', 51, MAIN_B - 33.5, { size: 13.5, color: TH.dim });
  // main panel
  const mx = 232, mw = APP_W - 10 - mx, mb = MAIN_B - 12;
  panel(mx, top, mw, mb - top, 18, { key: 'libmain' });
  const n = o.rows.length;
  txt('歌曲', mx + 20, top + 36, { size: 24, weight: 700 });
  txt(`${n} 首歌曲`, mx + 20, top + 62, { size: 12.5, color: TH.faint });
  // actions: search 220px, 播放全部, 随机播放
  let ax = mx + mw - 20;
  const w2 = textW('随机播放', 14) + 24 + 21; ax -= w2; btn(ax, top + 34, '随机播放', { icon: 'shuffle', isz: 15, w: w2 });
  const w1 = textW('播放全部', 14) + 24 + 21; ax -= w1 + 8; btn(ax, top + 34, '播放全部', { icon: 'play', isz: 15, w: w1, kind: 'primary', press: o.press, hot: o.hot });
  ax -= 8 + 220;
  rr(ax, top + 33, 220, 34, 8, { fill: TH.panel2, ink: TH.border, sw: .35 });
  icon('search', ax + 9 + 7.5, top + 50, 15, TH.faint); txt('搜索标题、艺术家、专辑', ax + 30, top + 50.5, { size: 14, color: TH.faint });
  // table: # 52 | title 2.2fr | artist 1.2fr | album 1.2fr | 64 | 44, gap 10, padding 0 14
  const tx = mx + 6 + 14, tw = mw - 12 - 28, fr = (tw - 52 - 64 - 44 - 50) / 4.6;
  const cols = [tx, tx + 62, tx + 62 + fr * 2.2 + 10, tx + 62 + fr * 3.4 + 20, tx + 62 + fr * 4.6 + 30, tx + 62 + fr * 4.6 + 104];
  const hy = top + 90 + 16;
  txt('#', cols[0] + 52, hy, { size: 12, color: TH.faint, align: 'right' });
  ['标题', '艺术家', '专辑'].forEach((l, i) => txt(l, cols[i + 1], hy, { size: 12, color: TH.faint }));
  txt('时长', cols[4] + 64, hy, { size: 12, color: TH.faint, align: 'right' });
  inkLine([[mx + 6, hy + 16], [mx + mw - 6, hy + 16]], .3, TH.border, 'inkfine', 0);
  let ry = hy + 16 + 4 + 22;
  o.rows.forEach((r, i) => {
    const a = r.k ?? 1; if (a <= 0) { ry += 44; return; }
    const dy = (1 - a) * 18;
    uiPush(0, dy, 1);
    if (r.flash > 0) rr(mx + 6, ry - 22, mw - 12, 44, 9, { fill: mixCol(ACC.accent, TH.bg, .8), op: 255 * r.flash, key: 'rowfl' + i });
    if (r.current) rr(mx + 6, ry - 22, mw - 12, 44, 9, { fill: mixCol(ACC.accent, TH.bg, .84), key: 'rowcur' + i });
    txt(String(i + 1), cols[0] + 52, ry, { size: 12, color: TH.faint, align: 'right', alpha: a });
    coverArt(r.cover, cols[1], ry - 16, 32, 5);
    txt(r.title, cols[1] + 42, ry + .5, { size: 13.5, alpha: a, color: r.current ? ACC.text : TH.text, weight: r.current ? 600 : 400 });
    const tw2 = textW(r.title, 13.5, r.current ? 600 : 400);
    if (r.fmt) { const fk = r.fmtK ?? 1; uiPush(cols[1] + 52 + tw2, ry, .6 + .4 * backOut(fk)); chip(0, 0, r.fmt, { accent: r.fmtHot }); uiPop(); }
    txt(r.artist, cols[2], ry + .5, { size: 13.5, color: TH.dim, alpha: a });
    txt(r.album, cols[3], ry + .5, { size: 13.5, color: TH.dim, alpha: a });
    txt(r.dur, cols[4] + 64, ry + .5, { size: 13.5, color: TH.faint, align: 'right', alpha: a });
    if (r.fav) icon('heartFill', cols[5] + 22, ry, 16, '#ff4d6d');
    uiPop();
    ry += 44;
  });
  return { playAll: [mx + mw - 20 - w2 - 8 - w1 / 2, top + 50] };
}
// .drop-hint: dashed accent frame, "松开以加入媒体库"
function dropHint(k) {
  if (k <= 0) return;
  rr(12, 12, APP_W - 24, APP_H - 24, 22, { fill: TH.bg, op: 200 * k, key: 'drophintbg' });
  rr(12, 12, APP_W - 24, APP_H - 24, 22, { fill: ACC.accent, op: 45 * k, key: 'drophint' });
  const P = rrPts(12, 12, APP_W - 24, APP_H - 24, 22);
  boilSeed('dropdash');
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 16));
    for (let j = 0; j < n; j++) { const u0 = j / n, u1 = (j + .55) / n; inkLine([[lerp(a[0], b[0], u0), lerp(a[1], b[1], u0)], [lerp(a[0], b[0], u1), lerp(a[1], b[1], u1)]], .55, ACC.accent, 'inkfine', 0); }
  }
  txt('松开以加入媒体库', APP_W / 2, APP_H / 2, { size: 20, weight: 700, color: ACC.text, align: 'center', alpha: k });
}

// ---------- the record (FreeLayout Vinyl + Tonearm) ----------
// d = diameter (CSS px), ang = turn in radians, arm = 0 (lifted, -30°) .. 1 (on the record)
function vinyl(cx, cy, d, o = {}) {
  const R = d / 2, label = d * (o.label || .66) / 2;
  circ(cx + 2, cy + R * .06, R * 1.01, { fill: '#000000', op: 50, key: 'vsh' });
  circ(cx, cy, R, { fill: '#141416', ink: '#000000', sw: .5, key: 'vdisc' });
  // grooves (they turn with the record, so they are drawn as broken rings at the record's angle)
  boilSeed('grooves');
  for (let i = 0; i < 9; i++) {
    const rr2 = lerp(label + 6, R - 6, i / 8), a0 = (o.ang || 0) + i * 1.7, pts = [];
    for (let k = 0; k <= 16; k++) { const a = a0 + k / 16 * 4.6; pts.push([cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2]); }
    inkLine(pts, .28, '#3a3a40', 'inkfine', .6);
  }
  // sheen: two soft wedges that stay where the light is
  boilSeed('sheen');
  for (const [a, w, op] of [[-.95, .4, 16], [2.2, .35, 11]]) {
    const pts = [[cx + Math.cos(a - w) * label * 1.05, cy + Math.sin(a - w) * label * 1.05]];
    for (let k = 0; k <= 6; k++) { const q = a - w + 2 * w * k / 6; pts.push([cx + Math.cos(q) * R * .97, cy + Math.sin(q) * R * .97]); }
    pts.push([cx + Math.cos(a + w) * label * 1.05, cy + Math.sin(a + w) * label * 1.05]);
    paint(pts, { wash: '#ffffff', washOp: op, ink: null });
  }
  // label = the cover, turning
  uiPush(cx, cy, 1, o.ang || 0);
  circ(0, 0, label + 2.5, { fill: '#000000', op: 170, key: 'vlabrim' });
  push(); coverDisc(o.cover, label); pop();
  circ(0, 0, d * .0225, { fill: '#101012', ink: '#cfcfd6', sw: .3, key: 'vhole' });
  uiPop();
  if (o.arm !== undefined) tonearm(cx - R, cy - R, d, o.arm);
}
function coverDisc(kind, r) {
  const pal = { dusk: ['#ff9a62', '#ffcf7a', '#e8607a', '#7b5ca8'], sea: ['#1f8f8f', '#7fd6c8', '#22446e', '#f6f1d8'] }[kind] || ['#66ccff', '#3d8bff', '#ffffff', '#1b4b9a'];
  circ(0, 0, r, { fill: pal[0], key: 'cd0' + kind });
  boilSeed('cdisc' + kind);
  paint(ellPts(-r * .05, -r * .18, r * .42, r * .42, 24), { wash: pal[1], ink: null });
  const wave = (y0, col) => {
    const a0 = Math.asin(clamp(y0 / r, -1, 1)), P = [];
    for (let k = 0; k <= 10; k++) { const a = lerp(a0, Math.PI - a0, k / 10); P.push([Math.cos(a) * r * .99, Math.sin(a) * r * .99]); }
    for (let k = 9; k >= 1; k--) { const xr = Math.cos(a0) * r * .99, x = lerp(-xr, xr, k / 10); P.push([x, y0 + Math.sin(k * 1.2) * r * .05]); }
    paint(P, { wash: col, ink: null });
  };
  wave(r * .2, pal[2]); wave(r * .48, pal[3]);
}
function tonearm(x0, y0, d, k) {
  // Points are mapped by hand (record viewBox 0..100 → CSS px, then the arm's rotation about its pivot): p5.brush
  // gets very slow when it paints tiny shapes under a large scale.
  const s = d / 100, rot = -30 * (1 - k) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
  const A = (x, y) => { const dx = x - 55, dy = y + 13; return [x0 + (55 + dx * cr - dy * sr) * s, y0 + (-13 + dx * sr + dy * cr) * s]; };
  const box = (cx, cy, a, pts) => pts.map(([x, y]) => A(cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)));
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const st = { wash: '#f3f3f5', ink: '#8a8a92', sw: .3, br: 'inkfine' };
  boilSeed('tw'); paint(box(49.5, -17.75, Math.PI / 4, rect(-4, -3.25, 8, 6.5)), st);
  boilSeed('tube'); paint(ribbon([[55, -13], [61, -6.5], [67, 0], [71, 5], [74.5, 10.5], [76, 14]].map(p => A(...p)), 1.9 * s, 1.7 * s), st);
  boilSeed('th'); paint(box(77.2, 16.6, -36 * Math.PI / 180, rect(-3.6, -2.6, 7.2, 9)), st);
  for (const sx of [-1.6, 1.6]) inkLine(box(77.2, 16.6, -36 * Math.PI / 180, [[sx, .2], [sx, 4.6]]), .25, '#9a9aa2', 'inkfine', 0);
  boilSeed('tp'); paint(ellPts(...A(55, -13), 4.2 * s, 4.2 * s, 16), st);
  boilSeed('tpc'); paint(ellPts(...A(55, -13), 1.6 * s, 1.6 * s, 10), { wash: '#c9c9cf', ink: null });
}

// Player page, built-in layout "vinyl-split" (唱片 + 左右分栏), src/layout/model.ts:
// stage = main minus padding (4px 10px 12px); 1u = 1% of the stage's shorter side; x/y = element centre in %.
const STAGE = { x: 10, y: MAIN_Y + 4, w: APP_W - 20, h: MAIN_B - MAIN_Y - 16 };
const SU = Math.min(STAGE.w, STAGE.h) / 100;
const SP = (px, py) => [STAGE.x + STAGE.w * px / 100, STAGE.y + STAGE.h * py / 100];
function playerPage(o = {}) {
  // back button and stage tools (返回 | 布局 + Flow)
  btn(2 + 10, STAGE.y, '返回', { kind: 'ghost', icon: 'chevronLeft', isz: 18, pad: 12, color: TH.text });
  const fw = btn(APP_W - 10 - 2 - 74, STAGE.y, 'Flow', { kind: 'ghost', icon: 'flow', isz: 17, color: TH.text, w: 74 });
  icon('layout', APP_W - 10 - 2 - fw - 22, STAGE.y + 16, 20, TH.dim);
  const e = o.enter ?? 1;
  // cover: (30, 52), 66u, vinyl, enters from the left
  const [vx, vy] = SP(30, 52), vd = 66 * SU, ek = easeOut(seg(e, 0, .7));
  uiPush(-(1 - ek) * vd * .12, 0, 1);
  if (ek > 0) vinyl(vx, vy, vd, { ang: o.ang || 0, arm: o.arm ?? 1, cover: o.cover || 'dusk' });
  uiPop();
  // text column: x 74%, width 64u, left aligned, enters from the right
  const tx = SP(74, 0)[0] - 32 * SU, tk = k => easeOut(seg(e, k, k + .6)), off = k => (1 - tk(k)) * 40;
  const [, ty] = SP(74, 33), [, ay] = SP(74, 41), [, aly] = SP(74, 46), [, cy] = SP(74, 51.5), [, ly] = SP(74, 64);
  txt(o.title, tx + off(.08), ty, { size: 5 * SU, weight: 700, font: FONT_UI, alpha: tk(.08) });
  txt(o.artist, tx + off(.14), ay, { size: 2.8 * SU, color: TH.dim, alpha: tk(.14) });
  txt(o.album, tx + off(.2), aly, { size: 2.2 * SU, color: TH.faint, alpha: tk(.2) });
  if (tk(.2) > .5) { const cw = chip(tx, cy, o.fmt || 'FLAC'); if (o.chip2) chip(tx + cw + 6, cy, o.chip2, { accent: true }); }
  // lyric peek: current line (2.8u) and the next (0.8125em), sliding in from below (peek-in 0.42s)
  if (o.peek) for (const L of o.peek) {
    const k = L.k, y = ly - 12 + (1 - easeOut(k)) * 14 - (L.out ? easeIn(L.out) * 14 : 0), a = easeOut(k) * (1 - (L.out || 0));
    txt(L.cur, tx, y, { size: 2.8 * SU, color: TH.dim, alpha: a });
    if (L.next) txt(L.next, tx, y + 2.8 * SU * 1.5 * .5 + 6 + 2.8 * SU * .8125 * .75, { size: 2.8 * SU * .8125, color: TH.faint, alpha: a });
  }
  return { vinyl: [vx, vy, vd] };
}

// ---------- lyrics page (LyricsPage.tsx + LyricsView) ----------
// lines: [{ text }]; at = the active line index as a float (scroll position); p = karaoke progress of the active line.
function lyricsHead(o = {}) {
  const y = MAIN_Y + 4 + 16;
  btn(16, y - 16, '返回', { kind: 'ghost', icon: 'chevronLeft', isz: 18, color: TH.text });
  txt(o.title, APP_W / 2, y - 8, { size: 15, weight: 700, align: 'center' });
  txt(o.artist, APP_W / 2, y + 10, { size: 12.5, color: TH.dim, align: 'center' });
  // tools, right to left: more, sparkles, edit, upload, text size, highlight dot, offset control
  let x = APP_W - 16 - 17;
  const tools = ['more', 'sparkles', 'edit', 'upload', 'textSize'];
  const pos = {};
  for (const n of tools) { iconBtn(n, x, y, { on: o.on === n, hot: o.hot === n }); pos[n] = [x, y]; x -= 38; }
  if (o.hot === 'hl') circ(x, y, 17, { fill: TH.hover });
  circ(x, y, 9.5, { fill: TH.border, key: 'hlring' }); circ(x, y, 8, { fill: o.hl || ACC.accent, key: 'hldot' }); pos.hl = [x, y]; x -= 38;
  if (o.offset !== false) { icon('plus', x, y, 16, TH.dim); txt('0.0s', x - 24, y + .5, { size: 12, color: TH.dim, align: 'center' }); icon('minus', x - 48, y, 16, TH.dim); }
  return pos;
}
function lyricLines(lines, at, p, o = {}) {
  const fs = o.size || 22, lh = fs * 1.45 + 20 + 4, cx = APP_W / 2, cy = o.cy || (MAIN_Y + 48 + MAIN_B) / 2 + 6;
  const top = MAIN_Y + 60, bot = MAIN_B - 6, hl = o.hl || ACC.strong;
  const ai = Math.round(at);
  lines.forEach((L, i) => {
    const y = cy + (i - at) * lh;
    if (y < top - 20 || y > bot + 20) return;
    // mask: fade over the top and bottom 14%
    const fade = Math.min(clamp((y - top) / ((bot - top) * .14)), clamp((bot - y) / ((bot - top) * .14)));
    const d = Math.abs(i - at), act = clamp(1 - d), near = d < 1.6;
    const sc = 1 + (1.08 - 1) * act, alpha = (L.k ?? 1) * fade;
    const dimA = near ? .62 : .48;
    const dimCol = TH.mode === 'light' ? `rgba(22,22,26,${dimA})` : `rgba(255,255,255,${dimA + .1})`;
    uiPush(cx, y, sc);
    if (i === ai && o.karaoke !== false) karaoke(L.text, 0, 0, { size: fs, weight: 600, alpha, shadow: TH.mode === 'light' ? null : 'rgba(0,0,0,.32)' }, p, hl, act > .5 ? (TH.mode === 'light' ? 'rgba(22,22,26,.48)' : 'rgba(255,255,255,.55)') : dimCol);
    else txt(L.text, 0, 0, { size: fs, weight: 600, align: 'center', color: dimCol, alpha, shadow: TH.mode === 'light' ? null : 'rgba(0,0,0,.32)' });
    uiPop();
  });
}
// .banner (warning): 本歌词由识别模型生成，可能有误（model）
function aiBanner(k, model = 'large-v3-turbo') {
  if (k <= 0) return;
  const w = 720, x = (APP_W - w) / 2, y = MAIN_Y + 50;
  uiPush(0, (1 - easeOut(k)) * -10, 1);
  rr(x, y, w, 38, 12, { fill: '#fdf0cc', op: 255 * k, key: 'aiban' });
  icon('warning', x + 12 + 8, y + 19, 16, '#8a5a00', { alpha: k });
  txt(`本歌词由识别模型生成，可能有误（${model}）`, x + 46, y + 19.5, { size: 13, color: '#8a5a00', alpha: k });
  let bx = x + w - 12;
  for (const [ic, l] of [['trash', '移除'], ['sparkles', '重新识别'], ['edit', '校对编辑']]) {
    const bw = textW(l, 12.5) + 16 + 20; bx -= bw;
    if (k > .5) btn(bx, y + 6, l, { h: 26, fs: 12.5, pad: 8, icon: ic, isz: 14, w: bw });
    bx -= 6;
  }
  uiPop();
}
// .lyric-empty: 暂无歌词 + three buttons. Returns where the AI button is.
function noLyrics(o = {}) {
  const cy = (MAIN_Y + 92 + MAIN_B) / 2 - 10;
  txt('暂无歌词', APP_W / 2, cy - 44, { size: 24, weight: 700, color: TH.dim, align: 'center', alpha: o.k ?? 1 });
  txt('没有在歌曲所在目录找到同名歌词文件', APP_W / 2, cy - 8, { size: 14, color: TH.faint, align: 'center', alpha: o.k ?? 1 });
  const b = [['upload', '上传歌词文件', ''], ['edit', '手动制作', ''], ['sparkles', 'AI 识别歌词', 'primary']];
  const ws = b.map(([, l]) => Math.round(24 + 22 + textW(l, 14))), total = ws.reduce((a, c) => a + c, 0) + 16;
  let x = APP_W / 2 - total / 2, ai = null;
  b.forEach(([ic, l, kind], i) => { btn(x, cy + 22, l, { icon: ic, kind, w: ws[i], press: kind ? o.press : 0, hot: kind && o.hot }); if (kind) ai = [x + ws[i] / 2, cy + 38]; x += ws[i] + 8; });
  return { ai };
}
// .asr-card: stage, percent, progress bar, the offline note, the actions.
function asrCard(o = {}) {
  const w = 420, h = 168, x = (APP_W - w) / 2, y = (MAIN_Y + 92 + MAIN_B) / 2 - h / 2 - 10, k = o.k ?? 1;
  uiPush(APP_W / 2, y + h / 2, .96 + .04 * easeOut(k)); uiPush(-APP_W / 2, -(y + h / 2), 1);
  shadowRR(x, y, w, h, 18, .8);
  panel(x, y, w, h, 18, { fill: TH.panelSolid, op: 255, key: 'asr' });
  icon('sparkles', x + 20 + 8, y + 30, 16, TH.text);
  txt(o.stage, x + 42, y + 30.5, { size: 14, weight: 600 });
  if (o.pct != null) txt(`${Math.round(o.pct)}%`, x + 48 + textW(o.stage, 14, 600), y + 30.5, { size: 14, color: TH.faint });
  rr(x + 20, y + 54, w - 40, 6, 3, { fill: TH.track, key: 'asrtrack' });
  if (o.pct != null) { if (o.pct > .5) rr(x + 20, y + 54, (w - 40) * o.pct / 100, 6, 3, { fill: ACC.accent, key: 'asrfill' }); }
  else { const q = frac(T / 1.2), bw = (w - 40) * .35, bx = lerp(-bw, w - 40, q); const L = Math.max(0, bx), R = Math.min(w - 40, bx + bw); if (R - L > 3) rr(x + 20 + L, y + 54, R - L, 6, 3, { fill: ACC.accent, key: 'asrind' }); }
  txt('识别在本机离线进行，不会上传任何音频。歌曲较长时可能', x + 20, y + 84, { size: 12.5, color: TH.faint });
  txt('需要一两分钟，可以继续听歌。', x + 20, y + 104, { size: 12.5, color: TH.faint });
  btn(x + 20, y + 124, '查看全部任务', { kind: 'ghost', h: 26, fs: 12.5, pad: 8, icon: 'list', isz: 14, color: TH.text });
  btn(x + w - 20 - 52, y + 124, '取消', { h: 26, fs: 12.5, pad: 8, w: 52 });
  uiPop(); uiPop();
}
// Highlight colour popover (font-menu 240px, label, swatches), opening down from (ax, ay), right aligned.
function hlPopover(ax, ay, k, sel, hot) {
  if (k <= 0) return null;
  const w = 240, h = 116, x = ax + 17 - w, y = ay + 26;
  uiPush(ax, y, .98 + .02 * easeOut(k)); uiPush(-ax, -y, 1);
  shadowRR(x, y, w, h, 12, .7);
  rr(x, y + (1 - easeOut(k)) * 4, w, h, 12, { fill: TH.panelSolid, ink: TH.border, sw: .35, op: 255, key: 'hlpop' });
  txt('当前歌词高亮颜色', x + 14, y + 20, { size: 11.5, color: TH.faint, alpha: k });
  const pos = [];
  const items = ['A', ...HL_PRESETS, 'custom'];
  items.forEach((c, i) => {
    const col = i % 7, row = Math.floor(i / 7), sx = x + 14 + 12 + col * 32, sy = y + 50 + row * 34;
    pos.push([sx, sy]);
    if (c === 'A') { circ(sx, sy, 12, { fill: TH.panel2, ink: TH.border, sw: .3 }); txt('A', sx, sy + .5, { size: 11, weight: 700, color: ACC.text, align: 'center', alpha: k }); }
    else if (c === 'custom') { rr(sx - 12, sy - 12, 24, 24, 6, { fill: '#ffffff', ink: TH.border, sw: .3 }); gradRR(sx - 9, sy - 9, 18, 18, 4, '#ff4d8d', '#66ccff', k); }
    else { if (c === sel) circ(sx, sy, 14, { fill: TH.text, key: 'swsel' }); circ(sx, sy, 12, { fill: c, ink: '#c9c9d2', sw: .25, key: 'sw' + i }); }
    if (hot === c) circ(sx, sy, 15, { fill: TH.text, op: 30, key: 'swhot' });
  });
  uiPop(); uiPop();
  return pos;
}

// ---------- desktop lyrics (DesktopLyrics.tsx): a borderless window, one line at a time ----------
// x, y, w, h in the current coordinates. o: { line, color, k (line entrance 0..1), hover, palette 0..1, sel }
function desktopLyrics(x, y, w, h, o = {}) {
  const hv = o.hover || 0;
  if (hv > 0) rr(x, y, w, h, 14, { fill: '#12141c', op: 107 * hv, key: 'dlbg' });
  const fs = Math.min(120, Math.max(14, h * .46));
  if (o.line && !(o.palette > .5)) {
    const k = o.k ?? 1;
    uiPush(0, (1 - easeOut(k)) * fs * .22, 1);
    txt(o.line, x + w / 2, y + h / 2, { size: fs, weight: 700, align: 'center', color: o.color, alpha: easeOut(k), shadow: 'rgba(0,0,0,.75)', blur: 6, sy: 2, spacing: fs * .02 });
    uiPop();
  }
  // tools: the colour dot and close (24px, rgba(0,0,0,.5)), top right 6px / 8px
  const tx = x + w - 8 - 12, ty = y + 6 + 12, pos = {};
  if (hv > 0) {
    circ(tx, ty, 12, { fill: '#000000', op: 128 * hv, key: 'dlclose' }); icon('close', tx, ty, 14, '#ffffff', { alpha: hv });
    circ(tx - 29, ty, 12, { fill: o.palette > .5 ? '#ffffff' : '#000000', op: (o.palette > .5 ? 56 : 128) * hv, key: 'dldotbg' });
    circ(tx - 29, ty, 7.5, { fill: '#ffffff', key: 'dldotring' }); circ(tx - 29, ty, 6, { fill: o.color, key: 'dldot' });
    pos.dot = [tx - 29, ty];
  }
  if (o.palette > 0) {
    const sw = Math.min(22, h * .4), gap = Math.max(4, sw * .36), n = DL_PRESETS.length + 1, rowW = n * sw + (n - 1) * gap;
    let sx = x + 14 + (w - 14 - 74 - rowW) / 2 + sw / 2;
    pos.sw = [];
    [...DL_PRESETS, 'custom'].forEach((c, i) => {
      const pk = easeOut(seg(o.palette, i * .05, .5 + i * .05));
      if (c === 'custom') gradRR(sx - sw / 2, h / 2 + y - sw / 2, sw, sw, 5, '#ff4d8d', '#66ccff', pk);
      else { if (c === o.sel) circ(sx, y + h / 2, sw / 2 + 2.5, { fill: '#ffffff', key: 'dlsel' }); circ(sx, y + h / 2, sw / 2 * pk, { fill: c, key: 'dlsw' + i }); }
      pos.sw.push([sx, y + h / 2]);
      sx += sw + gap;
    });
  }
  return pos;
}

// ---------- the app icon (assets/icon.svg), painted: rounded square, play triangle, three bars ----------
// size = the icon's full 1024 box in px; bars = 0..1 beat bounce
function appIcon(cx, cy, size, o = {}) {
  const s = size / 1024, x0 = cx - 512 * s, y0 = cy - 512 * s, a = o.alpha ?? 1;
  rr(x0 + 100 * s, y0 + 118 * s, 824 * s, 824 * s, 190 * s, { fill: '#0d1a40', op: 90 * a, key: 'icsh' });
  rr(x0 + 100 * s, y0 + 100 * s, 824 * s, 824 * s, 190 * s, { fill: '#5aa9ff', op: 255 * a, ink: o.ink === undefined ? PAL.ink : o.ink, sw: o.sw ?? .9, key: 'icbg' });
  const b = o.bars || 0;
  glyph(c => {
    c.translate(x0, y0); c.scale(s, s);
    const g = c.createLinearGradient(100, 100, 924, 924); g.addColorStop(0, '#66CCFF'); g.addColorStop(1, '#3D8BFF');
    c.fillStyle = g; c.beginPath(); c.roundRect(100, 100, 824, 824, 190); c.fill();
    const r = c.createRadialGradient(100 + 824 * .3, 100 + 824 * .25, 0, 100 + 824 * .3, 100 + 824 * .25, 824 * .8);
    r.addColorStop(0, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    [[236, 452, 120], [300, 402, 220], [752, 432, 160]].forEach(([x, y, h], i) => {
      const hh = h * (1 + .22 * b * Math.sin(i * 2.1 + T * 7.3)); c.beginPath(); c.roundRect(x, y + (h - hh) / 2, 36, hh, 18); c.fill();
    });
    c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineWidth = 40; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(420, 340); c.lineTo(700, 512); c.lineTo(420, 684); c.closePath(); c.fill(); c.stroke();
  }, a);
}
