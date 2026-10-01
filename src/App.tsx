import { useEffect } from "react";
import * as C from "./core/controller";
import { AsrSetupDialog } from "./components/AsrSetupDialog";
import { Icon } from "./components/Icon";
import { LyricsEditor } from "./components/LyricsEditor";
import { SettingsDialog } from "./components/SettingsDialog";
import { Tooltips, tip } from "./components/Tooltip";
import { TransportBar, toggleFullscreen } from "./components/TransportBar";
import { VideoInfoDialog } from "./components/VideoInfoDialog";
import { Background, useFullscreenSync, useIdle, useKeyboard, useTheme } from "./hooks";
import { LyricsPage } from "./pages/LyricsPage";
import { PlayerPage } from "./pages/PlayerPage";
import { usePlayer, useUI } from "./stores/player";

function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  useTheme();
  useKeyboard();
  useFullscreenSync();
  const page = useUI((s) => s.page);
  const overlay = useUI((s) => s.overlay);
  const fullscreen = useUI((s) => s.fullscreen);
  const dragOver = useUI((s) => s.dragOver);
  const media = usePlayer((s) => s.media);
  const immersive = fullscreen && media?.kind === "video";
  const idle = useIdle(immersive);

  useEffect(() => {
    void C.init();
  }, []);

  useEffect(() => {
    const title = media ? `${media.meta?.title || media.name}${media.meta?.artist ? " — " + media.meta.artist : ""}` : "LightPlayer";
    document.title = title;
  }, [media]);

  const showLyrics = page === "lyrics" && media?.kind === "audio";

  return (
    <div className={`app ${immersive ? "immersive" : ""} ${immersive && idle ? "idle" : ""}`}>
      <Background />
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="dot" /> LightPlayer
        </div>
        <div className="spacer" data-tauri-drag-region />
        {media && (
          <div className="now-title" data-tauri-drag-region>
            {media.fileName}
          </div>
        )}
        <div className="spacer" data-tauri-drag-region />
        <button className="icon-btn" onClick={C.openWithDialog} {...tip("打开文件", "⌘O")}>
          <Icon name="folder" />
        </button>
        <button className="icon-btn" onClick={() => useUI.setState({ overlay: "settings" })} {...tip("设置", "⌘,")}>
          <Icon name="settings" />
        </button>
      </header>
      <main className="main">{showLyrics ? <LyricsPage /> : <PlayerPage />}</main>
      {immersive && (
        <div className="immersive-top">
          <div className="name">{media.meta?.title || media.fileName}</div>
          <button className="icon-btn" onClick={() => void toggleFullscreen(false)} {...tip("退出全屏", "Esc")}>
            <Icon name="exitFullscreen" />
          </button>
        </div>
      )}
      <TransportBar />
      {overlay === "settings" && <SettingsDialog />}
      {overlay === "editor" && <LyricsEditor />}
      {overlay === "videoInfo" && <VideoInfoDialog />}
      {overlay === "asrSetup" && <AsrSetupDialog />}
      <Toasts />
      <Tooltips />
      {dragOver && <div className="drop-hint">松开以打开文件</div>}
    </div>
  );
}
