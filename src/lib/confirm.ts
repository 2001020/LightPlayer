import { isTauri } from "./ipc";

export async function confirmDialog(message: string, title = "LightPlayer"): Promise<boolean> {
  if (isTauri) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(message, { title, kind: "warning", okLabel: "确定", cancelLabel: "取消" });
  }
  return window.confirm(message);
}
