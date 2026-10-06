import { isTauri } from "./ipc";
import { tr } from "../i18n";

export async function confirmDialog(message: string, title = "LightPlayer"): Promise<boolean> {
  if (isTauri) {
    const { ask } = await import("./dialog");
    return ask(message, { title, kind: "warning", okLabel: "确定", cancelLabel: "取消" });
  }
  return window.confirm(tr(message));
}
