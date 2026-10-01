// Weather theme state. The last report and position are kept so the sky
// shows up right away on the next launch, before the network answers.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { WeatherPlace, WeatherReport } from "../lib/ipc";

export type WeatherStatus = "idle" | "locating" | "loading" | "ready" | "error";

interface WeatherState {
  report: WeatherReport | null;
  /** Last automatic position and when it was taken (ms). */
  place: (WeatherPlace & { at: number }) | null;
  status: WeatherStatus;
  error: string | null;
  /** Session-only override from the settings page ("效果预览"). */
  preview: string | null;
}

export const useWeather = create<WeatherState>()(
  persist(() => ({ report: null, place: null, status: "idle", error: null, preview: null }) as WeatherState, {
    name: "lightplayer-weather",
    version: 1,
    partialize: (s) => ({ report: s.report, place: s.place }),
    storage: createJSONStorage(() => {
      try {
        return localStorage;
      } catch {
        const mem = new Map<string, string>();
        return {
          getItem: (k: string) => mem.get(k) ?? null,
          setItem: (k: string, v: string) => void mem.set(k, v),
          removeItem: (k: string) => void mem.delete(k),
        };
      }
    }),
  }),
);
