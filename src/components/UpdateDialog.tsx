// The "new version" window: release notes, then download progress (which can
// go on in the background), then a confirmation before installing.

import { Fragment, useEffect, type ReactNode } from "react";
import { formatBytes } from "../lib/format";
import { useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { cancelUpdate, installUpdate, openReleasePage, skipUpdate, startUpdate, useUpdater, type UpdateProgress } from "../stores/updater";
import { Icon } from "./Icon";
import { tip } from "./Tooltip";
import { locale, releaseNotesFor, tr, useUILang } from "../i18n";

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

/** How the file is coming in, for the speed's tooltip. */
function how(p: UpdateProgress): string {
  if (p.connections && p.connections > 1) return p.sources && p.sources > 1 ? `aria2 多线程下载（${p.connections} 个连接，${p.sources} 个下载源）` : `aria2 多线程下载（${p.connections} 个连接）`;
  return p.host ? `单线程下载（${p.host}）` : "单线程下载";
}

/** What installing does, once the file is here. */
const READY_NOTE: Record<string, string> = {
  macApp: "安装时 LightPlayer 会退出，替换“应用程序”中的旧版本后自动重新打开。",
  windowsSetup: "安装时 LightPlayer 会退出，安装新版本后自动重新打开。",
  windowsPortable: "安装时 LightPlayer 会退出，更新便携版文件夹中的文件后自动重新打开。",
};


export function UpdateDialog() {
  const { status, info, progress, error } = useUpdater();
  const close = () => useUI.setState({ overlay: null });
  // Closing while downloading sends the download to the background.
  const busy = status === "installing";
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && useUpdater.getState().status !== "installing" && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const lang = useUILang();
  if (!info) return null;
  const date = info.published ? new Date(info.published).toLocaleDateString(locale(), { year: "numeric", month: "long", day: "numeric" }) : null;
  const pct = progress && progress.total ? Math.min(100, (progress.received / progress.total) * 100) : 0;
  const auto = !!info.asset && info.kind !== "manual";
  const skipped = useSettings.getState().update.skip === info.version;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="dialog update-dialog" data-lp="update">
        <header>
          <h2>{status === "installing" ? "正在更新" : status === "ready" ? "新版本已下载" : "发现新版本"}</h2>
          {!busy && (
            <button className="icon-btn" onClick={close} {...tip(status === "downloading" ? "后台下载" : "关闭", "Esc")}>
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
          <ReleaseNotes text={info.notes ? releaseNotesFor(info.notes, lang) : tr("（没有更新说明）")} />
        </div>
        <footer className="update-foot">
          {status === "downloading" && progress ? (
            <div className="update-progress">
              {/* The bar has its own column so changing numbers never resize it. */}
              <div className="update-progress-main">
                <div className="bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="update-progress-meta muted">
                  <span>
                    正在下载 {formatBytes(progress.received)} / {formatBytes(progress.total)}
                  </span>
                  <span className="update-speed" {...(progress.speed ? tip(how(progress)) : {})}>
                    {progress.speed ? `${formatBytes(progress.speed)}/s` : ""}
                  </span>
                </div>
                {progress.restarted && (
                  <div className="update-restart muted">{progress.host ? `下载中断，已改用 ${progress.host} 重新下载` : "下载中断，已改用单线程重新下载"}</div>
                )}
              </div>
              <button className="btn" onClick={cancelUpdate}>
                取消
              </button>
              <button className="btn primary" onClick={close} {...tip("关闭窗口，下载完成后再提示安装")}>
                后台下载
              </button>
            </div>
          ) : status === "ready" ? (
            <>
              <div className="update-note">
                {error ? <span className="err">{error}</span> : <span className="muted">{READY_NOTE[info.kind] ?? ""}</span>}
              </div>
              <div className="update-actions">
                <button className="btn" onClick={close} {...tip("可随时点击标题栏的更新按钮安装")}>
                  稍后安装
                </button>
                <button className="btn primary" onClick={() => void installUpdate()}>
                  {error ? "重试安装" : "立即安装并重启"}
                </button>
              </div>
            </>
          ) : status === "installing" ? (
            <div className="update-progress">
              <div className="spinner dark" />
              <span>正在安装，LightPlayer 将自动重新启动…</span>
            </div>
          ) : (
            <>
              <div className="update-note">
                {error ? <span className="err">{error}</span> : <span className="muted">{auto ? "下载可以转到后台进行，完成后会先询问再安装。" : "这个版本需要从 GitHub 下载安装。"}</span>}
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

/**
 * Title bar button while an update waits (the window was closed with "以后再说"),
 * downloads in the background (with its progress) or is ready to install.
 */
export function UpdateButton() {
  const status = useUpdater((s) => s.status);
  const version = useUpdater((s) => s.info?.version);
  const progress = useUpdater((s) => s.progress);
  const skip = useSettings((s) => s.update.skip);
  const shown = (status === "available" && version !== skip) || status === "downloading" || status === "ready" || status === "installing";
  if (!shown) return null;
  const pct = progress && progress.total ? Math.min(100, Math.floor((progress.received / progress.total) * 100)) : 0;
  const label =
    status === "downloading" ? `正在后台下载新版本 ${version}（${pct}%）` : status === "ready" ? `新版本 ${version} 已下载，点击安装` : `有新版本 ${version}，点击更新`;
  return (
    <button className={`icon-btn update-btn ${status}`} onClick={() => useUI.setState({ overlay: "update" })} {...tip(label)}>
      <Icon name="download" />
      {status === "downloading" ? (
        <span className="update-mini">
          <i style={{ width: `${pct}%` }} />
        </span>
      ) : (
        <span className="update-dot" />
      )}
    </button>
  );
}
