// Settings > 关于 > 更新.

import { useEffect } from "react";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/player";
import { checkForUpdates, includePrerelease, loadAppInfo, openReleasePage, useUpdater } from "../stores/updater";
import { Row, Switch } from "./SettingsControls";
import { locale } from "../i18n";

const KIND: Record<string, string> = {
  macApp: "macOS 版，可自动更新",
  windowsSetup: "Windows 安装版，可自动更新",
  windowsPortable: "Windows 便携版，可自动更新",
  manual: "开发版本，需要手动下载新版本",
};

function ago(t: number) {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} 小时前` : new Date(t).toLocaleDateString(locale());
}

export function UpdateSettings() {
  const u = useSettings((s) => s.update);
  const set = (p: Partial<typeof u>) => useSettings.getState().set({ update: { ...useSettings.getState().update, ...p } });
  const { status, info, error, checkedAt, app } = useUpdater();
  useEffect(() => {
    void loadAppInfo();
  }, []);
  let state: string;
  if (status === "checking") state = "正在检查…";
  else if (status === "available" || status === "downloading" || status === "installing") state = `有新版本 ${info?.version}`;
  else if (status === "latest") state = `已是最新版本，${ago(checkedAt!)}检查`;
  else if (status === "error") state = `检查失败：${error}`;
  else state = app ? KIND[app.install] : "";
  const available = status === "available" || status === "downloading" || status === "installing";
  return (
    <>
      <h3>更新</h3>
      <Row label="检查更新" hint={state}>
        {available ? (
          <button className="btn primary" onClick={() => useUI.setState({ overlay: "update" })}>
            查看新版本
          </button>
        ) : (
          <button className="btn" disabled={status === "checking"} onClick={() => void checkForUpdates(true)}>
            检查更新
          </button>
        )}
        <button className="btn ghost" onClick={() => void openReleasePage("https://github.com/2001020/LightPlayer/releases")}>
          所有版本
        </button>
      </Row>
      <Row label="自动检查更新" hint="启动时和每隔 12 小时检查 GitHub 上的新版本，有新版本时提示">
        <Switch on={u.auto} onChange={(auto) => set({ auto })} />
      </Row>
      <Row label="包括预发布版本" hint="预发布版本包含仍在测试的新功能，可能不够稳定">
        <Switch on={u.prerelease ?? includePrerelease()} onChange={(prerelease) => set({ prerelease })} />
      </Row>
      {u.skip && (
        <Row label="已跳过的版本" hint={`不再自动提示 ${u.skip}`}>
          <button className="btn ghost" onClick={() => set({ skip: null })}>
            恢复提示
          </button>
        </Row>
      )}
    </>
  );
}
