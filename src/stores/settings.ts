import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PlayMode } from "../core/playlist/queue";

export type ThemeMode = "system" | "light" | "dark" | "weather";

export interface WeatherSettings {
  /** "auto": the system location service (or the network as a fallback). */
  source: "auto" | "city";
  city: { name: string; lat: number; lon: number } | null;
  /** Animated rain, snow, clouds and lightning. */
  motion: boolean;
}

export interface AsrSettings {
  model: string;
  language: string;
  mirror: "huggingface" | "hf-mirror";
  vocalFocus: boolean;
  simplified: boolean;
  useVad: boolean;
  wordTimestamps: boolean;
}

export interface BackgroundSettings {
  path: string | null;
  blur: number;
  dim: number;
  fit: "cover" | "contain" | "tile";
}

export interface Settings {
  theme: ThemeMode;
  accent: string;
  dynamicAccent: boolean;
  background: BackgroundSettings;
  coverBackground: boolean;
  weather: WeatherSettings;
  seekStep: number;
  jumpStep: number;
  resume: boolean;
  volume: number;
  muted: boolean;
  mode: PlayMode;
  rate: number;
  lyricFontSize: number;
  lyricAlign: "center" | "left";
  showTranslation: boolean;
  karaoke: boolean;
  playlistOpen: boolean;
  libraryAutoRescan: boolean;
  libraryRecordPlays: boolean;
  /** Closing the window keeps the app (and playback) running in the menu bar. */
  runInBackground: boolean;
  /** Show the song title next to the menu bar icon. */
  trayShowTitle: boolean;
  /** Private browsing: opened files leave no history (recent list, plays, positions). */
  privateMode: boolean;
  tapCompensation: number;
  asr: AsrSettings;
  recent: string[];
  positions: Record<string, number>;
  lyricOffsets: Record<string, number>;
}

interface SettingsStore extends Settings {
  set: (p: Partial<Settings>) => void;
  setAsr: (p: Partial<AsrSettings>) => void;
  setBackground: (p: Partial<BackgroundSettings>) => void;
  setWeather: (p: Partial<WeatherSettings>) => void;
  addRecent: (path: string) => void;
  savePosition: (path: string, t: number | null) => void;
  setLyricOffset: (path: string, offset: number) => void;
}

export const LYRIC_SIZE_MIN = 14;
export const LYRIC_SIZE_MAX = 56;
export const clampLyricSize = (v: number) => Math.min(LYRIC_SIZE_MAX, Math.max(LYRIC_SIZE_MIN, Math.round(v)));

export const ACCENT_PRESETS = ["#66ccff", "#7c5cff", "#13ce66", "#ff7849", "#ff4d8d", "#f7b500", "#00b8a9", "#8e8e93"];

export const defaultSettings: Settings = {
  theme: "system",
  accent: ACCENT_PRESETS[0],
  dynamicAccent: false,
  background: { path: null, blur: 16, dim: 0.35, fit: "cover" },
  coverBackground: true,
  weather: { source: "auto", city: null, motion: true },
  seekStep: 5,
  jumpStep: 15,
  resume: true,
  volume: 0.8,
  muted: false,
  mode: "loop",
  rate: 1,
  lyricFontSize: 22,
  lyricAlign: "center",
  showTranslation: true,
  karaoke: true,
  playlistOpen: true,
  libraryAutoRescan: true,
  libraryRecordPlays: true,
  runInBackground: true,
  trayShowTitle: false,
  privateMode: false,
  tapCompensation: 0.15,
  asr: {
    model: "large-v3-turbo-q5_0",
    language: "auto",
    mirror: "huggingface",
    vocalFocus: true,
    simplified: true,
    useVad: true,
    wordTimestamps: true,
  },
  recent: [],
  positions: {},
  lyricOffsets: {},
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      set: (p) => set(p),
      setAsr: (p) => set((s) => ({ asr: { ...s.asr, ...p } })),
      setBackground: (p) => set((s) => ({ background: { ...s.background, ...p } })),
      setWeather: (p) => set((s) => ({ weather: { ...s.weather, ...p } })),
      addRecent: (path) =>
        set((s) => ({ recent: [path, ...s.recent.filter((r) => r !== path)].slice(0, 12) })),
      savePosition: (path, t) =>
        set((s) => {
          const positions = { ...s.positions };
          if (t === null) delete positions[path];
          else positions[path] = Math.round(t);
          const keys = Object.keys(positions);
          if (keys.length > 200) delete positions[keys[0]];
          return { positions };
        }),
      setLyricOffset: (path, offset) =>
        set((s) => {
          const lyricOffsets = { ...s.lyricOffsets };
          if (Math.abs(offset) < 0.001) delete lyricOffsets[path];
          else lyricOffsets[path] = Math.round(offset * 100) / 100;
          return { lyricOffsets };
        }),
    }),
    {
      name: "lightplayer-settings",
      version: 5,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<Settings> & { waveform?: unknown; waveformStyle?: unknown };
        // v2: default accent changed from purple to light blue.
        if (version < 2 && (!p.accent || p.accent === "#7c5cff")) p.accent = "#66ccff";
        // v4: the sound-wave animation was removed.
        delete p.waveform;
        delete p.waveformStyle;
        return p as SettingsStore;
      },
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
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>;
        return {
          ...current,
          ...p,
          asr: { ...current.asr, ...(p.asr ?? {}) },
          background: { ...current.background, ...(p.background ?? {}) },
          weather: { ...current.weather, ...(p.weather ?? {}) },
        };
      },
    },
  ),
);
