// The system LightPlayer runs on (macOS or Windows) and the words and
// shortcut labels that differ between them. WebView2 reports "Windows" in its
// user agent; everything else is treated like macOS.

export function detectWindows(ua: string): boolean {
  return /Windows/i.test(ua);
}

export const isWindows = typeof navigator !== "undefined" && detectWindows(navigator.userAgent);

/** Shortcut label for this system: "⇧⌘N" becomes "Ctrl+Shift+N" on Windows. */
export function keysFor(s: string, windows: boolean): string {
  if (!windows) return s;
  return s.replace(/((?:[⌃⌥⇧⌘])+)(\S)/g, (_, mods: string, key: string) => {
    const names: string[] = [];
    if (mods.includes("⌃") || mods.includes("⌘")) names.push("Ctrl");
    if (mods.includes("⌥")) names.push("Alt");
    if (mods.includes("⇧")) names.push("Shift");
    return [...names, key].join("+");
  });
}

export const keys = (s: string) => keysFor(s, isWindows);

/** The file manager, the trash and the status icon by their names on this system. */
export const FILE_MANAGER = isWindows ? "文件资源管理器" : "访达";
export const TRASH = isWindows ? "回收站" : "废纸篓";
export const TRAY = isWindows ? "通知区域图标" : "菜单栏图标";
