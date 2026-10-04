import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DesktopLyricsWindow } from "./components/DesktopLyrics";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isWindows } from "./lib/platform";
import "./styles/app.css";

// The same bundle also runs the desktop lyrics window.
const desktopLyrics = window.location.hash === "#desktop-lyrics";
if (isWindows) document.documentElement.dataset.platform = "windows";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>{desktopLyrics ? <DesktopLyricsWindow /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
);
