// Recognition (AI lyrics / subtitles) task queue. Tasks run one at a time;
// the runner lives in core/controller.ts. The list is persisted so finished
// work stays visible and queued work survives a restart (paused until the
// user resumes it).

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MediaKind } from "../lib/ipc";

export type AsrTaskStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export type AsrStage = "preparing" | "downloading" | "decoding" | "loading" | "transcribing" | "finishing";

export interface AsrTaskInput {
  path: string;
  name: string;
  kind: MediaKind;
  title?: string | null;
  artist?: string | null;
}

export interface AsrTask extends AsrTaskInput {
  id: string;
  status: AsrTaskStatus;
  stage: AsrStage;
  percent: number;
  error?: string | null;
  lineCount?: number;
  model?: string | null;
  addedAt: number;
  finishedAt?: number;
}

export const HISTORY_LIMIT = 100;

export const isActive = (t: AsrTask) => t.status === "queued" || t.status === "running";
export const isFinished = (t: AsrTask) => !isActive(t);

let seq = 0;
const newId = (now: number) => `${now.toString(36)}-${(++seq).toString(36)}`;

/** Appends inputs as queued tasks; files already queued or running are skipped. */
export function addTasks(tasks: AsrTask[], inputs: AsrTaskInput[], now = Date.now()) {
  const active = new Set(tasks.filter(isActive).map((t) => t.path));
  const added: AsrTask[] = [];
  let skipped = 0;
  for (const input of inputs) {
    if (active.has(input.path)) {
      skipped++;
      continue;
    }
    active.add(input.path);
    added.push({ ...input, id: newId(now), status: "queued", stage: "preparing", percent: 0, addedAt: now });
  }
  // A re-run replaces the file's older finished entry.
  const paths = new Set(added.map((t) => t.path));
  const kept = tasks.filter((t) => !(isFinished(t) && paths.has(t.path)));
  return { tasks: [...kept, ...added], added, skipped };
}

export function nextQueued(tasks: AsrTask[]): AsrTask | undefined {
  if (tasks.some((t) => t.status === "running")) return undefined;
  return tasks.find((t) => t.status === "queued");
}

/** Moves a queued task one place earlier among the queued tasks. */
export function moveUp(tasks: AsrTask[], id: string): AsrTask[] {
  const queued = tasks.filter((t) => t.status === "queued");
  const i = queued.findIndex((t) => t.id === id);
  if (i <= 0) return tasks;
  const a = tasks.indexOf(queued[i - 1]);
  const b = tasks.indexOf(queued[i]);
  const out = tasks.slice();
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

/** Marks a task finished and keeps the history bounded. */
export function finish(tasks: AsrTask[], id: string, patch: Partial<AsrTask>, now = Date.now()): AsrTask[] {
  const out = tasks.map((t) => (t.id === id ? { ...t, ...patch, finishedAt: now } : t));
  const finished = out.filter(isFinished).sort((x, y) => (y.finishedAt ?? 0) - (x.finishedAt ?? 0));
  if (finished.length <= HISTORY_LIMIT) return out;
  const drop = new Set(finished.slice(HISTORY_LIMIT).map((t) => t.id));
  return out.filter((t) => !drop.has(t.id));
}

/** Puts a failed or cancelled task back at the end of the queue. */
export function retry(tasks: AsrTask[], id: string, now = Date.now()): AsrTask[] {
  const t = tasks.find((x) => x.id === id);
  if (!t || isActive(t) || tasks.some((x) => x.path === t.path && isActive(x))) return tasks;
  const again: AsrTask = { ...t, status: "queued", stage: "preparing", percent: 0, error: null, finishedAt: undefined, addedAt: now };
  return [...tasks.filter((x) => x.id !== id), again];
}

/** After a restart nothing is running any more: interrupted work is queued again. */
export function restore(tasks: AsrTask[]): { tasks: AsrTask[]; paused: boolean } {
  const out = tasks.map((t) => (t.status === "running" ? { ...t, status: "queued" as const, stage: "preparing" as const, percent: 0 } : t));
  return { tasks: out, paused: out.some((t) => t.status === "queued") };
}

/** 1-based place in the queue (the running task counts as place 0). */
export function queuePosition(tasks: AsrTask[], path: string): number | null {
  const t = tasks.find((x) => x.path === path && isActive(x));
  if (!t) return null;
  if (t.status === "running") return 0;
  return tasks.filter((x) => x.status === "queued").indexOf(t) + 1;
}

interface AsrTasksState {
  tasks: AsrTask[];
  /** When paused, the running task finishes but no new one starts. */
  paused: boolean;
  /** Inputs waiting for the model setup dialog to be confirmed. */
  pendingSetup: AsrTaskInput[] | null;
  /** The setup dialog was opened to recognise again with another model. */
  setupRerun: boolean;
}

export const useAsrTasks = create<AsrTasksState>()(
  persist(() => ({ tasks: [], paused: false, pendingSetup: null, setupRerun: false }) as AsrTasksState, {
    name: "lightplayer-asr-tasks",
    version: 1,
    partialize: (s) => ({ tasks: s.tasks, paused: s.paused }),
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
      const p = (persisted ?? {}) as Partial<AsrTasksState>;
      const r = restore(Array.isArray(p.tasks) ? p.tasks : []);
      return { ...current, tasks: r.tasks, paused: !!p.paused || r.paused };
    },
  }),
);

export function updateTask(id: string, patch: Partial<AsrTask>) {
  useAsrTasks.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function runningTask(): AsrTask | undefined {
  return useAsrTasks.getState().tasks.find((t) => t.status === "running");
}
