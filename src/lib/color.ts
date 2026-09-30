// Small colour helpers for theming (no dependencies).

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface AccentPalette {
  accent: string;
  hover: string;
  soft: string;
  strong: string;
  onAccent: string;
}

/**
 * Derives an accent palette that stays readable on the current theme.
 * Too-dark accents are lifted in dark mode and too-light ones darkened in light mode.
 */
export function accentPalette(hex: string, dark: boolean): AccentPalette {
  const rgb = hexToRgb(hex) ?? { r: 124, g: 92, b: 255 };
  let [h, s, l] = rgbToHsl(rgb);
  const bg = dark ? { r: 18, g: 18, b: 22 } : { r: 250, g: 250, b: 252 };
  let base = hslToRgb(h, s, l);
  for (let i = 0; i < 20 && contrast(base, bg) < 3; i++) {
    l = dark ? Math.min(0.9, l + 0.04) : Math.max(0.1, l - 0.04);
    base = hslToRgb(h, s, l);
  }
  const hover = hslToRgb(h, s, dark ? Math.min(0.92, l + 0.07) : Math.max(0.08, l - 0.07));
  const strong = hslToRgb(h, Math.min(1, s + 0.05), dark ? Math.min(0.95, l + 0.15) : Math.max(0.05, l - 0.15));
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  return {
    accent: rgbToHex(base),
    hover: rgbToHex(hover),
    strong: rgbToHex(strong),
    soft: `rgba(${Math.round(base.r)}, ${Math.round(base.g)}, ${Math.round(base.b)}, ${dark ? 0.2 : 0.14})`,
    onAccent: contrast(base, white) >= contrast(base, black) ? "#ffffff" : "#111111",
  };
}

/** Picks a vivid representative colour from an image (e.g. album art). */
export async function dominantColor(src: string): Promise<string | null> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
  // Bucket by hue, weight by saturation so greys don't win.
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const [h, s, l] = rgbToHsl(rgb);
    if (l < 0.12 || l > 0.92) continue;
    const w = s * s + 0.02;
    const key = Math.round(h / 20);
    const bk = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    bk.w += w;
    bk.r += rgb.r * w;
    bk.g += rgb.g * w;
    bk.b += rgb.b * w;
    buckets.set(key, bk);
  }
  let best: { w: number; r: number; g: number; b: number } | null = null;
  for (const b of buckets.values()) if (!best || b.w > best.w) best = b;
  if (!best || best.w === 0) return null;
  return rgbToHex({ r: best.r / best.w, g: best.g / best.w, b: best.b / best.w });
}
