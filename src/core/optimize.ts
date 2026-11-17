// Background upkeep: every 30 minutes, at a quiet moment, LightPlayer tidies
// what builds up over hours of playback, without anything visible changing:
//
// - animations that have finished but are still held by the page;
// - the season sky's drawn layers, which are put down afresh (the system web
//   view keeps their rendering tiles and textures otherwise for as long as
//   the app runs);
// - the record of interface text replaced for the chosen language, for text
//   no longer on the page;
// - the cache folder (the same trimming as "自动清理缓存").

import { create } from "zustand";
import { useSettings } from "../stores/settings";
import { pruneReplacedText } from "../plugins/runtime";

export const OPTIMIZE_EVERY_MS = 30 * 60_000;

/** Bumped by each upkeep; layers keyed on it are drawn afresh. */
export const useUpkeep = create<{ epoch: number; last: number | null }>(() => ({ epoch: 0, last: null }));

/** Animations that have run to the end and hold nothing on screen. */
export function finishedAnimations(list: Animation[]): Animation[] {
  return list.filter((a) => {
    if (a.playState !== "finished") return false;
    const fill = a.effect?.getTiming().fill;
    return fill !== "forwards" && fill !== "both";
  });
}

/** A moment when nothing is moving under the user's hand: no lyric line in flight. */
function busy(): boolean {
  return document.getAnimations().some((a) => a.playState === "running" && (a.effect as KeyframeEffect | null)?.target instanceof HTMLElement && (a.effect as KeyframeEffect).target!.classList.contains("lyric-line"));
}

function whenIdle(run: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 5000 });
  else window.setTimeout(run, 0);
}

/** One round of upkeep; `trim` empties the cache folder down to its limit. */
export function optimize(trim?: () => Promise<void>, tries = 0) {
  // Between two lyric lines; after half a minute, regardless.
  if (busy() && tries < 75) {
    window.setTimeout(() => optimize(trim, tries + 1), 400);
    return;
  }
  whenIdle(() => {
    for (const a of finishedAnimations(document.getAnimations())) a.cancel();
    pruneReplacedText();
    useUpkeep.setState((s) => ({ epoch: s.epoch + 1, last: Date.now() }));
    void trim?.().catch(() => {});
  });
}

let timer = 0;

/** Starts the half-hourly upkeep (when the setting is on). */
export function startUpkeep(trim?: () => Promise<void>) {
  if (timer) return;
  timer = window.setInterval(() => {
    if (useSettings.getState().autoOptimize) optimize(trim);
  }, OPTIMIZE_EVERY_MS);
}
