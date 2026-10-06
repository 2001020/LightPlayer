// Player page layouts: the user's own (saved), the built-in ones, and those of
// enabled plugins; plus the editor's working copy with undo and redo.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BUILTIN_LAYOUTS,
  DEFAULT_LAYOUT_ID,
  checkLayout,
  defaultElement,
  newElementId,
  type ElementKind,
  type LayoutElement,
  type PlayerLayout,
} from "../layout/model";

interface LayoutState {
  /** The user's layouts. */
  custom: PlayerLayout[];
  /** The layout the player page shows. */
  active: string;
  /** Layouts of the enabled plugins (not saved). */
  plugin: PlayerLayout[];
  /** The layout being edited; null outside the editor. */
  draft: PlayerLayout | null;
  /** Where the draft came from (its id before editing). */
  draftFrom: string | null;
  selected: string | null;
  past: PlayerLayout[];
  future: PlayerLayout[];
  /** Bumped to replay the entrance animations. */
  replay: number;
  /** The inspector sits on this side of the stage. */
  panelSide: "left" | "right";
  /** The inspector is folded away (to see the whole stage). */
  panelHidden: boolean;
  /** The player page shows a sample song, to edit a layout with nothing playing. */
  sample: boolean;
}

export const useLayouts = create<LayoutState>()(
  persist(
    (): LayoutState => ({
      custom: [],
      active: DEFAULT_LAYOUT_ID,
      plugin: [],
      draft: null,
      draftFrom: null,
      selected: null,
      past: [],
      future: [],
      replay: 0,
      panelSide: "right",
      panelHidden: false,
      sample: false,
    }),
    {
      name: "lightplayer-layouts",
      version: 1,
      partialize: (s) => ({ custom: s.custom, active: s.active, panelSide: s.panelSide }),
      merge: (saved, cur) => {
        const s = (saved ?? {}) as Partial<LayoutState>;
        const custom = (Array.isArray(s.custom) ? s.custom : [])
          .map((l, i) => checkLayout(l, `custom-${i + 1}`))
          .filter((l): l is PlayerLayout => !!l && !l.classic);
        return {
          ...cur,
          custom,
          active: typeof s.active === "string" ? s.active : DEFAULT_LAYOUT_ID,
          panelSide: s.panelSide === "left" ? "left" : "right",
        };
      },
    },
  ),
);

export function allLayouts(s: LayoutState = useLayouts.getState()): PlayerLayout[] {
  return [...BUILTIN_LAYOUTS, ...s.custom, ...s.plugin];
}

export function findLayout(id: string, s: LayoutState = useLayouts.getState()): PlayerLayout | undefined {
  return allLayouts(s).find((l) => l.id === id);
}

/** The layout shown: a missing one (a removed plugin) falls back to the default. */
export function activeLayout(s: LayoutState = useLayouts.getState()): PlayerLayout {
  return findLayout(s.active, s) ?? BUILTIN_LAYOUTS[0];
}

export function useActiveLayout(): PlayerLayout {
  return useLayouts((s) => s.draft ?? activeLayout(s));
}

export function setActiveLayout(id: string) {
  useLayouts.setState({ active: id });
}

const clone = (l: PlayerLayout): PlayerLayout => JSON.parse(JSON.stringify(l));

function uniqueName(base: string): string {
  const names = new Set(allLayouts().map((l) => l.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

function newLayoutId(): string {
  const taken = new Set(useLayouts.getState().custom.map((l) => l.id));
  for (let i = 1; ; i++) if (!taken.has(`custom-${i}`)) return `custom-${i}`;
}

// ------------------------------------------------------------------ editor

/**
 * Opens the editor on the active layout. The classic page is turned into
 * free elements first (`fromClassic` measures where its parts are now).
 */
export function startEditing(fromClassic?: () => LayoutElement[]) {
  const s = useLayouts.getState();
  if (s.draft) return;
  const cur = activeLayout(s);
  let draft = clone(cur);
  if (cur.classic) {
    const measured = fromClassic?.() ?? [];
    draft = checkLayout({ id: cur.id, name: "我的布局", elements: measured }, cur.id)!;
  }
  useLayouts.setState({ draft, draftFrom: cur.id, selected: null, past: [], future: [] });
}

let lastKey = "";
let lastAt = 0;

/**
 * Changes the draft. `record: false` for the moves of a drag after its first;
 * changes with the same `key` within a second (a slider, typing) are one step.
 */
export function updateDraft(fn: (l: PlayerLayout) => void, record = true, key = "") {
  const s = useLayouts.getState();
  if (!s.draft) return;
  const now = Date.now();
  if (key && key === lastKey && now - lastAt < 1000) record = false;
  lastKey = key;
  lastAt = now;
  const next = clone(s.draft);
  fn(next);
  useLayouts.setState({
    draft: next,
    past: record ? [...s.past.slice(-99), s.draft] : s.past,
    future: record ? [] : s.future,
  });
}

export function updateElement(id: string, fn: (e: LayoutElement) => void, record = true, key = "") {
  updateDraft(
    (l) => {
      const e = l.elements.find((x) => x.id === id);
      if (e) fn(e);
    },
    record,
    key && `${id}:${key}`,
  );
}

export function undo() {
  const s = useLayouts.getState();
  if (!s.draft || !s.past.length) return;
  useLayouts.setState({ draft: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.draft, ...s.future] });
}

export function redo() {
  const s = useLayouts.getState();
  if (!s.draft || !s.future.length) return;
  useLayouts.setState({ draft: s.future[0], future: s.future.slice(1), past: [...s.past, s.draft] });
}

export function selectElement(id: string | null) {
  useLayouts.setState({ selected: id });
}

export function addElement(kind: ElementKind, patch: Partial<LayoutElement> = {}): string {
  const draft = useLayouts.getState().draft;
  if (!draft) return "";
  const id = newElementId(kind, draft.elements.map((e) => e.id));
  updateDraft((l) => l.elements.push({ ...defaultElement(kind, id), ...patch }));
  selectElement(id);
  return id;
}

/** Removes an added element; a built-in one is hidden instead. */
export function removeElement(id: string) {
  const e = useLayouts.getState().draft?.elements.find((x) => x.id === id);
  if (!e) return;
  if (["cover", "title", "artist", "album", "chips", "lyric"].includes(e.kind)) {
    updateElement(id, (x) => (x.hidden = true));
  } else {
    updateDraft((l) => (l.elements = l.elements.filter((x) => x.id !== id)));
  }
  if (useLayouts.getState().selected === id) selectElement(null);
}

export function duplicateElement(id: string): string | null {
  const draft = useLayouts.getState().draft;
  const e = draft?.elements.find((x) => x.id === id);
  if (!draft || !e || ["cover", "title", "artist", "album", "chips", "lyric"].includes(e.kind)) return null;
  const copy: LayoutElement = { ...JSON.parse(JSON.stringify(e)), id: newElementId(e.kind, draft.elements.map((x) => x.id)), x: e.x + 3, y: e.y + 3 };
  updateDraft((l) => l.elements.splice(l.elements.findIndex((x) => x.id === id) + 1, 0, copy));
  selectElement(copy.id);
  return copy.id;
}

/** Moves an element up (towards the front) or down in the stacking order. */
export function moveElement(id: string, dir: 1 | -1) {
  updateDraft((l) => {
    const i = l.elements.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.elements.length) return;
    [l.elements[i], l.elements[j]] = [l.elements[j], l.elements[i]];
  });
}

/**
 * Saves the draft and leaves the editor. A built-in or plugin layout is saved
 * as a new layout of the user's; their own is updated in place.
 */
export function finishEditing() {
  const s = useLayouts.getState();
  if (!s.draft) return;
  const own = s.custom.some((l) => l.id === s.draft!.id);
  const saved: PlayerLayout = { ...clone(s.draft), plugin: undefined, classic: undefined };
  if (own) {
    useLayouts.setState({ custom: s.custom.map((l) => (l.id === saved.id ? saved : l)) });
  } else {
    const from = findLayout(s.draftFrom ?? "");
    saved.id = newLayoutId();
    saved.name = from && !from.classic ? uniqueName(`${saved.name}（自定义）`) : uniqueName(saved.name);
    useLayouts.setState({ custom: [...s.custom, saved] });
  }
  useLayouts.setState({ active: saved.id, draft: null, draftFrom: null, selected: null, past: [], future: [], sample: false });
}

export function cancelEditing() {
  useLayouts.setState({ draft: null, draftFrom: null, selected: null, past: [], future: [], sample: false });
}

/** Whether the draft differs from what it was opened from. */
export function draftChanged(): boolean {
  return useLayouts.getState().past.length > 0;
}

// ------------------------------------------------------------------ presets

/** Copies a layout into a new one of the user's and shows it. */
export function duplicateLayout(id: string): string | null {
  const l = findLayout(id);
  if (!l || l.classic) return null;
  const copy: PlayerLayout = { ...clone(l), id: newLayoutId(), name: uniqueName(`${l.name} 副本`), plugin: undefined };
  useLayouts.setState((s) => ({ custom: [...s.custom, copy], active: copy.id }));
  return copy.id;
}

export function renameLayout(id: string, name: string) {
  const n = name.trim().slice(0, 40);
  if (!n) return;
  useLayouts.setState((s) => ({ custom: s.custom.map((l) => (l.id === id ? { ...l, name: n } : l)) }));
}

export function deleteLayout(id: string) {
  useLayouts.setState((s) => ({
    custom: s.custom.filter((l) => l.id !== id),
    active: s.active === id ? DEFAULT_LAYOUT_ID : s.active,
  }));
}

/** Plugin layouts, read by the plugin runtime: replaces those of every plugin. */
export function setPluginLayouts(layouts: PlayerLayout[]) {
  useLayouts.setState({ plugin: layouts });
}
