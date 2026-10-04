// Minimize, maximize and close buttons for the Windows build, whose window
// has no system title bar (the macOS one keeps its traffic lights).

import { useEffect, useState } from "react";
import { isTauri } from "../lib/ipc";
import { isWindows } from "../lib/platform";
import { useUI } from "../stores/player";

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function WindowControls() {
  const fullscreen = useUI((s) => s.fullscreen);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isWindows || !isTauri) return;
    let off: (() => void) | undefined;
    let disposed = false;
    void win().then(async (w) => {
      const sync = () => void w.isMaximized().then((m) => !disposed && setMaximized(m));
      sync();
      const un = await w.onResized(sync);
      if (disposed) un();
      else off = un;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);

  if (!isWindows || fullscreen) return null;
  const act = (f: (w: Awaited<ReturnType<typeof win>>) => Promise<void>) => () => {
    if (isTauri) void win().then(f);
  };
  return (
    <div className="win-controls">
      <button className="win-btn" onClick={act((w) => w.minimize())} aria-label="最小化">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 5.5h10" />
        </svg>
      </button>
      <button className="win-btn" onClick={act((w) => w.toggleMaximize())} aria-label={maximized ? "还原" : "最大化"}>
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M.5.5h9v9h-9z" />
          </svg>
        )}
      </button>
      <button className="win-btn close" onClick={act((w) => w.close())} aria-label="关闭">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}
