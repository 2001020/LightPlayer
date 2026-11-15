import { localFileUrl } from "./ipc";
import { useSettings, type UiFont } from "../stores/settings";

/** The family name the user's font is loaded under. */
export const UI_FONT_FAMILY = "LightPlayer Custom";

let face: FontFace | null = null;
let applied: string | null = null;
let turn = 0;

/** Whether the web view can read the font file at `path`. */
export async function loadFont(path: string): Promise<FontFace | null> {
  try {
    const url = await localFileUrl(path);
    return await new FontFace(UI_FONT_FAMILY, `url("${url.replace(/["\\]/g, encodeURIComponent)}")`).load();
  } catch {
    return null;
  }
}

/**
 * Makes `font` the interface font: it goes in front of the built-in font list,
 * so the characters it lacks (say, Chinese in a Latin font) still come from
 * the system's fonts.
 */
export async function applyUiFont(font: UiFont | null): Promise<void> {
  const path = font?.path ?? null;
  if (path === applied) return;
  applied = path;
  const mine = ++turn;
  const next = path ? await loadFont(path) : null;
  if (mine !== turn) return;
  const root = document.documentElement;
  if (face) document.fonts.delete(face);
  face = next;
  if (next) {
    document.fonts.add(next);
    root.style.setProperty("--font", `"${UI_FONT_FAMILY}", var(--font-fallback)`);
  } else {
    root.style.removeProperty("--font");
  }
}

/** Follows the setting, in the main window and (through localStorage) the desktop lyrics window. */
export function startUiFont() {
  void applyUiFont(useSettings.getState().uiFont);
  useSettings.subscribe((s, prev) => {
    if (s.uiFont !== prev.uiFont) void applyUiFont(s.uiFont);
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== "lightplayer-settings" || !e.newValue) return;
    try {
      const font = (JSON.parse(e.newValue) as { state?: { uiFont?: UiFont | null } }).state?.uiFont;
      void applyUiFont(font && typeof font.path === "string" ? font : null);
    } catch {
      // Not ours to read.
    }
  });
}
