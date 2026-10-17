import { Easing } from "remotion";

export const ACCENT = "#66ccff";
export const ACCENT_DEEP = "#3d8bff";

/** Long, soft deceleration, the default for things arriving. */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** Symmetric ease for camera moves and things leaving. */
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const EASE_IN = Easing.bezier(0.55, 0, 0.75, 0.2);

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type ThemeName = "light" | "dark";

/** The app's own color tokens (src/styles/app.css). */
export const THEMES = {
  light: {
    bg: "#f4f4f7",
    bgGrad:
      "radial-gradient(1200px 700px at 10% -10%, rgba(102, 204, 255, 0.14), transparent 60%), radial-gradient(900px 600px at 110% 110%, rgba(160, 140, 255, 0.08), transparent 60%)",
    panel: "rgba(255, 255, 255, 0.72)",
    panelSolid: "#ffffff",
    panel2: "rgba(0, 0, 0, 0.035)",
    hover: "rgba(0, 0, 0, 0.05)",
    border: "rgba(0, 0, 0, 0.08)",
    text: "#16161a",
    textDim: "#5b5b66",
    textFaint: "#9a9aa6",
    track: "rgba(0, 0, 0, 0.1)",
    accentText: "#1b93c9",
    accentSoft: "rgba(102, 204, 255, 0.16)",
    shadow: "0 10px 40px rgba(20, 20, 40, 0.12), 0 2px 8px rgba(20, 20, 40, 0.06)",
  },
  dark: {
    bg: "#111115",
    bgGrad:
      "radial-gradient(1200px 700px at 10% -10%, rgba(102, 204, 255, 0.12), transparent 60%), radial-gradient(900px 600px at 110% 110%, rgba(31, 182, 255, 0.10), transparent 60%)",
    panel: "rgba(28, 28, 34, 0.72)",
    panelSolid: "#1c1c22",
    panel2: "rgba(255, 255, 255, 0.045)",
    hover: "rgba(255, 255, 255, 0.07)",
    border: "rgba(255, 255, 255, 0.09)",
    text: "#f2f2f5",
    textDim: "#a8a8b3",
    textFaint: "#6d6d78",
    track: "rgba(255, 255, 255, 0.14)",
    accentText: "#66ccff",
    accentSoft: "rgba(102, 204, 255, 0.16)",
    shadow: "0 10px 40px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)",
  },
} as const;

export type Theme = (typeof THEMES)[ThemeName];
