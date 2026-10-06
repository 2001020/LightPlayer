import { useEffect } from "react";
import * as C from "./core/controller";
import { AsrSetupDialog } from "./components/AsrSetupDialog";
import { AsrTasks, AsrTasksButton } from "./components/AsrTasks";
import { CommentsPanel } from "./components/CommentsPanel";
import { ContextMenuHost } from "./components/ContextMenu";
import { LibraryFolders } from "./components/LibraryFolders";
import { NeteaseLogin } from "./components/NeteaseLogin";
import { PlaylistPanel, usePlaylistLayout, usePlaylistShown } from "./components/PlaylistPanel";
import { useSample } from "./components/NowPlayingParts";
import { PromptHost } from "./components/Prompt";
import { DesktopLyricsOverlay } from "./components/DesktopLyrics";
import { isTauri } from "./lib/ipc";
import { Icon } from "./components/Icon";
import { LyricsEditor } from "./components/LyricsEditor";
import { SettingsDialog } from "./components/SettingsDialog";
import { UpdateButton, UpdateDialog } from "./components/UpdateDialog";
import { startUpdateChecks } from "./stores/updater";
import { Tooltips, tip } from "./components/Tooltip";
import { TransportBar } from "./components/TransportBar";
import { VideoInfoDialog } from "./components/VideoInfoDialog";
import { WeatherChip } from "./components/WeatherChip";
import { WindowControls } from "./components/WindowControls";
import { Background, useFullscreenSync, useIdle, useKeyboard, useTheme } from "./hooks";
import { LibraryPage } from "./pages/LibraryPage";
import { LyricsPage } from "./pages/LyricsPage";
import { PlayerPage } from "./pages/PlayerPage";
import { usePlayer, useUI } from "./stores/player";
import { useSettings } from "./stores/settings";
import { activeLayout, useLayouts } from "./stores/layout";

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
  const privateMode = useSettings((s) => s.privateMode);
  const weatherTheme = useSettings((s) => s.theme === "weather");
  const immersive = fullscreen && media?.kind === "video";
  const idle = useIdle(immersive);

  useEffect(() => {
    void C.init();
    startUpdateChecks();
  }, []);

  useEffect(() => {
    const title = media ? `${media.meta?.title || media.name}${media.meta?.artist ? " — " + media.meta.artist : ""}` : "LightPlayer";
    document.title = title;
  }, [media]);

  const showLyrics = page === "lyrics" && media?.kind === "audio";
  const showLibrary = page === "library" && !immersive;
  const listLayout = usePlaylistLayout();
  const listShown = usePlaylistShown();
  const listBeside = showLyrics && listShown && listLayout === "side";
  const commentsOpen = useUI((s) => s.commentsOpen);
  const listFloating = !!media && listShown && listLayout === "float" && !showLibrary && !immersive;
  const playerStyle = useSettings((s) => s.playerStyle);
  const freeLayout = useLayouts((s) => !activeLayout(s).classic || !!s.draft);
  const sample = useSample();

  // State plugins can style by (see docs/plugins/README.md).
  useEffect(() => {
    const root = document.documentElement.dataset;
    root.page = showLyrics ? "lyrics" : showLibrary ? "library" : "player";
    // The layout editor's sample song counts as audio.
    root.media = sample ? "audio" : media?.kind ?? "none";
    root.playerStyle = playerStyle;
    root.fullscreen = fullscreen ? "true" : "false";
    root.playerLayout = playerStyle === "classic" && freeLayout ? "free" : "classic";
  }, [showLyrics, showLibrary, media?.kind, playerStyle, fullscreen, freeLayout, sample]);

  return (
    <div className={`app ${immersive ? "immersive" : ""} ${immersive && idle ? "idle" : ""}`}>
      <Background />
      <header className="titlebar" data-lp="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="dot" /> LightPlayer
        </div>
        <div className="spacer" data-tauri-drag-region />
        {media && (
          <div className="now-title" data-lp-raw data-tauri-drag-region>
            {media.fileName}
          </div>
        )}
        <div className="spacer" data-tauri-drag-region />
        {weatherTheme && <WeatherChip />}
        {privateMode && (
          <button className="private-badge" onClick={() => C.setPrivateMode(false)} {...tip("无痕浏览中，打开的文件不会被记录。点击关闭", "⇧⌘N")}>
            <Icon name="incognito" size={15} /> 无痕
          </button>
        )}
        <button
          className={`icon-btn ${page === "library" ? "active" : ""}`}
          onClick={() => useUI.setState({ page: page === "library" ? "player" : "library" })}
          {...tip(page === "library" ? "返回播放页" : "媒体库", "⌘L")}
        >
          <Icon name="library" />
        </button>
        <UpdateButton />
        <AsrTasksButton />
        <button className="icon-btn" onClick={C.openWithDialog} {...tip("打开文件", "⌘O")}>
          <Icon name="folder" />
        </button>
        <button className="icon-btn" onClick={() => useUI.setState({ overlay: "settings" })} {...tip("设置", "⌘,")}>
          <Icon name="settings" />
        </button>
        <WindowControls />
      </header>
      <main className="main" data-lp="main">
        {showLyrics ? (
          <div className={`lyrics-host ${listBeside ? "with-list" : ""}`}>
            <LyricsPage />
            {listBeside && <PlaylistPanel />}
          </div>
        ) : (
          // Kept mounted (just hidden) under the library so a playing video keeps playing.
          <div className={`page-host ${showLibrary ? "hidden" : ""}`}>
            <PlayerPage />
          </div>
        )}
        {showLibrary && <LibraryPage />}
        {listFloating && <PlaylistPanel floating />}
        {commentsOpen && !immersive && <CommentsPanel />}
      </main>
      {immersive && (
        <div className="immersive-top">
          <div className="name">{media.meta?.title || media.fileName}</div>
        </div>
      )}
      <TransportBar />
      {overlay === "settings" && <SettingsDialog />}
      {overlay === "editor" && <LyricsEditor />}
      {overlay === "videoInfo" && <VideoInfoDialog />}
      {overlay === "asrSetup" && <AsrSetupDialog />}
      {overlay === "asrTasks" && <AsrTasks />}
      {overlay === "libraryFolders" && <LibraryFolders />}
      {overlay === "neteaseLogin" && <NeteaseLogin />}
      {overlay === "update" && <UpdateDialog />}
      {!isTauri && <DesktopLyricsOverlay />}
      <PromptHost />
      <ContextMenuHost />
      <Toasts />
      <Tooltips />
      {dragOver && <div className="drop-hint">{page === "library" ? "松开以加入媒体库" : "松开以打开文件"}</div>}
    </div>
  );
}
