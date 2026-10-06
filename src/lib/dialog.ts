// The system's open / save / ask dialogs with their text in the UI language
// (the page's text replacer cannot reach native windows).

import type { OpenDialogOptions, SaveDialogOptions, ConfirmDialogOptions } from "@tauri-apps/plugin-dialog";
import { tr } from "../i18n";

const filters = (f?: { name: string; extensions: string[] }[]) => f?.map((x) => ({ ...x, name: tr(x.name) }));

export async function open<T extends OpenDialogOptions>(o: T) {
  const d = await import("@tauri-apps/plugin-dialog");
  return d.open<T>({ ...o, title: o.title && tr(o.title), filters: filters(o.filters) } as T);
}

export async function save(o: SaveDialogOptions) {
  const d = await import("@tauri-apps/plugin-dialog");
  return d.save({ ...o, title: o.title && tr(o.title), filters: filters(o.filters) });
}

export async function ask(message: string, o: ConfirmDialogOptions) {
  const d = await import("@tauri-apps/plugin-dialog");
  return d.ask(tr(message), { ...o, title: o.title && tr(o.title), okLabel: o.okLabel && tr(o.okLabel), cancelLabel: o.cancelLabel && tr(o.cancelLabel) });
}
