// The "new version" window: release notes, then download progress and restart.

import { Fragment, useEffect, type ReactNode } from "react";
import { formatBytes } from "../lib/format";
import { useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { cancelUpdate, openReleasePage, skipUpdate, startUpdate, useUpdater } from "../stores/updater";
import { Icon } from "./Icon";
import { tip } from "./Tooltip";

/** **bold**, `code` and [links](…) inside a line of release notes. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<b key={m.index}>{m[1]}</b>);
    else if (m[2] !== undefined) out.push(<code key={m.index}>{m[2]}</code>);
    else
      out.push(
        <button key={m.index} className="link" onClick={() => void openReleasePage(m![4])}>
          {m[3]}
        </button>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A small Markdown subset: headings, nested lists, code blocks, paragraphs. */
export function ReleaseNotes({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let code: string[] | null = null;
  text.replace(/\r\n/g, "\n").split("\n").forEach((line, i) => {
    if (line.trim().startsWith("```")) {
      if (code) {
        blocks.push(<pre key={i}>{code.join("\n")}</pre>);
        code = null;
      } else code = [];
      return;
    }
    if (code) {
      code.push(line.replace(/^ {0,4}/, ""));
      return;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (h) blocks.push(<h4 key={i} className={`h${h[1].length}`}>{inline(h[2])}</h4>);
    else if (li)
      blocks.push(
        <div
          key={i}
          className="li"
          style={{ paddingLeft: 14 + Math.floor(li[1].length / 2) * 16, "--indent": `${Math.floor(li[1].length / 2) * 16}px` } as React.CSSProperties}
        >
          {inline(li[2])}
        </div>,
      );
    else if (line.trim()) blocks.push(<p key={i}>{inline(line.trim())}</p>);
  });
  if (code) blocks.push(<pre key="end">{(code as string[]).join("\n")}</pre>);
  return <Fragment>{blocks}</Fragment>;
}

const KIND_NOTE: Record<string, string> = {
  macApp: "下载完成后会替换“应用程序”中的 LightPlayer 并自动重新打开。",
  windowsSetup: "下载完成后会自动安装新版本并重新打开 LightPlayer。",
  windowsPortable: "下载完成后会更新便携版所在文件夹中的文件并重新打开 LightPlayer。",
};

export function UpdateDialog() {
  const { status, info, progress, error } = useUpdater();
  const close = () => useUI.setState({ overlay: null });
  const busy = status === "downloading" || status === "installing";
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && !useUpdater.getState().status.match(/downloading|installing/) && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  if (!info) return null;
  const date = info.published ? new Date(info.published).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : null;
  const pct = progress && progress.total ? Math.min(100, (progress.received / progress.total) * 100) : 0;
  const auto = !!info.asset && info.kind !== "manual";
  const skipped = useSettings.getState().update.skip === info.version;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="dialog update-dialog" data-lp="update">
        <header>
          <h2>{status === "installing" ? "正在更新" : "发现新版本"}</h2>
          {!busy && (
            <button className="icon-btn" onClick={close} {...tip("关闭", "Esc")}>
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className="update-head">
          <div className="update-logo">
            <Icon name="download" size={22} />
          </div>
          <div>
            <div className="update-title">
              LightPlayer {info.version}
              {info.prerelease && <span className="chip">预发布</span>}
            </div>
            <div className="muted">
              当前版本 {info.current}
              {date && `，发布于 ${date}`}
            </div>
          </div>
        </div>
        <div className="update-notes" data-lp-raw>
          <ReleaseNotes text={info.notes || "（没有更新说明）"} />
        </div>
        <footer className="update-foot">
          {status === "downloading" && progress ? (
            <div className="update-progress">
              <div className="bar">
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="muted">
                正在下载 {formatBytes(progress.received)} / {formatBytes(progress.total)}
              </span>
              <button className="btn" onClick={cancelUpdate}>
                取消
              </button>
            </div>
          ) : status === "installing" ? (
            <div className="update-progress">
              <div className="spinner dark" />
              <span>正在安装，LightPlayer 将自动重新启动…</span>
            </div>
          ) : (
            <>
              <div className="update-note">
                {error ? <span className="err">{error}</span> : <span className="muted">{auto ? KIND_NOTE[info.kind] : "这个版本需要从 GitHub 下载安装。"}</span>}
              </div>
              <div className="update-actions">
                {!skipped && (
                  <button className="btn ghost" onClick={skipUpdate}>
                    跳过此版本
                  </button>
                )}
                <button className="btn" onClick={close}>
                  以后再说
                </button>
                {auto && (
                  <button className="btn ghost" onClick={() => void openReleasePage()} {...tip("在浏览器中打开发布页")}>
                    <Icon name="reveal" size={15} />
                  </button>
                )}
                <button className="btn primary" onClick={() => void startUpdate()}>
                  {auto ? (error ? "重试" : "立即更新") : "前往下载"}
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/** Title bar button while an update waits (the window was closed with "以后再说"). */
export function UpdateButton() {
  const status = useUpdater((s) => s.status);
  const version = useUpdater((s) => s.info?.version);
  const skip = useSettings((s) => s.update.skip);
  const shown = (status === "available" && version !== skip) || status === "downloading" || status === "installing";
  if (!shown) return null;
  return (
    <button className="icon-btn update-btn" onClick={() => useUI.setState({ overlay: "update" })} {...tip(`有新版本 ${version}，点击更新`)}>
      <Icon name="download" />
      <span className="update-dot" />
    </button>
  );
}
