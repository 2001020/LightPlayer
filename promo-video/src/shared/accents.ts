import { interpolateColors } from "remotion";

export const ACCENTS = ["#66ccff", "#ff6b8b", "#7bd88f", "#ffb84d", "#a78bfa", "#66ccff"];

export function accentAt(frame: number, every = 26) {
  return interpolateColors(
    frame,
    ACCENTS.map((_, i) => i * every),
    ACCENTS,
  );
}

