import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { addListening, emptyListening, sanitizeListening, type Listened, type ListeningData } from "../core/listening";

interface ListeningStore extends ListeningData {
  add: (song: Listened, seconds: number, now?: Date) => void;
  clear: () => void;
}

/** Listening time, kept on this computer only. */
export const useListening = create<ListeningStore>()(
  persist(
    (set) => ({
      ...emptyListening,
      add: (song, seconds, now = new Date()) => set((s) => addListening(s, song, seconds, now)),
      clear: () => set({ ...emptyListening }),
    }),
    {
      name: "lightplayer-listening",
      version: 1,
      partialize: ({ days, songs, artists, since }) => ({ days, songs, artists, since }),
      merge: (persisted, current) => ({ ...current, ...sanitizeListening(persisted) }),
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
    },
  ),
);
