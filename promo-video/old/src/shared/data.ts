// Pretend songs for the video. Titles, artists and lyrics are original and
// editable (see texts.tsx); covers and lengths are fixed here.

import { useMemo } from "react";
import { useTexts } from "./texts";

export type Song = { title: string; artist: string; cover: number; duration: number };

const META = [
  { cover: 0, duration: 252 },
  { cover: 1, duration: 228 },
  { cover: 2, duration: 201 },
  { cover: 3, duration: 245 },
  { cover: 4, duration: 236 },
  { cover: 5, duration: 270 },
];

/** The six songs with their current titles and artists. */
export function useSongs(): Song[] {
  const { songs } = useTexts();
  return useMemo(() => META.map((m, i) => ({ ...m, ...songs[i] })), [songs]);
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
