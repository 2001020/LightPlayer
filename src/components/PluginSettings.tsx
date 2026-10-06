// Settings > 插件: install, turn on, order and configure plugins.

import { useEffect, useState } from "react";
import { api, isTauri, pluginBaseUrl, type PluginEntry, type PluginOption, type PluginOptionValue } from "../lib/ipc";
import { confirmDialog } from "../lib/confirm";
import { FILE_MANAGER, keys } from "../lib/platform";
import { optionValue } from "../plugins/manifest";
import { toast } from "../stores/player";
import {
  installPlugin,
  movePlugin,
  refreshPlugins,
  reloadPlugins,
  removePlugin,
  resetPluginOptions,
  setPluginEnabled,
  setPluginOption,
  setSafeMode,
  usable,
  usePlugins,
} from "../stores/plugins";
import { Icon } from "./Icon";
import { Row, Seg, Switch } from "./SettingsControls";
import { tip } from "./Tooltip";

export const PLUGIN_DOCS_URL = "https://github.com/2001020/LightPlayer/blob/HEAD/docs/plugins/README.md";

async function openDocs() {
  if (!isTauri) {
    window.open(PLUGIN_DOCS_URL, "_blank");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(PLUGIN_DOCS_URL);
}

async function install(folder: boolean) {
  if (!isTauri) {
    toast("浏览器预览中不能安装插件", "error");
    return;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = folder
    ? await open({ directory: true, title: "选择插件文件夹（包含 manifest.json）" })
    : await open({ multiple: false, title: "选择插件包", filters: [{ name: "LightPlayer 插件", extensions: ["lpplugin", "zip"] }] });
  if (typeof path !== "string") return;
  let id: string;
  try {
    id = await installPlugin(path, false);
  } catch (e) {
    if (!String(e).includes("PLUGIN_EXISTS")) {
      toast(`安装失败：${String(e)}`, "error", 8000);
      return;
    }
    if (!(await confirmDialog("已经安装了这个插件（id 相同）。要用所选的版本替换它吗？", "替换插件"))) return;
    try {
      id = await installPlugin(path, true);
    } catch (e2) {
      toast(`安装失败：${String(e2)}`, "error", 8000);
      return;
    }
  }
  const entry = usePlugins.getState().installed?.find((p) => p.id === id);
  toast(`已安装插件“${entry?.manifest?.name ?? id}”，打开它的开关即可启用`, "success", 5000);
}

function OptionControl({ id, o, value }: { id: string; o: PluginOption; value: PluginOptionValue }) {
  const set = (v: PluginOptionValue) => setPluginOption(id, o.id, v);
  switch (o.type) {
    case "range":
      return (
        <input type="range" min={o.min} max={o.max} step={o.step ?? 1} value={Number(value)} onChange={(e) => set(Number(e.target.value))} />
      );
    case "color":
      return <input type="color" value={String(value)} onChange={(e) => set(e.target.value)} />;
    case "toggle":
      return <Switch on={!!value} onChange={set} />;
    case "select":
      return (o.choices?.length ?? 0) <= 4 ? (
        <Seg value={String(value)} options={(o.choices ?? []).map((c) => [c.value, c.label] as [string, string])} onChange={set} />
      ) : (
        <select value={String(value)} onChange={(e) => set(e.target.value)}>
          {o.choices?.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      );
  }
}

function hintOf(o: PluginOption, v: PluginOptionValue) {
  const parts = [o.description, o.type === "range" ? `${v}${o.unit ?? ""}` : null].filter(Boolean);
  return parts.length ? parts.join("，") : undefined;
}

function PluginCard({ p, index, count }: { p: PluginEntry; index: number; count: number }) {
  const enabled = index >= 0;
  const saved = usePlugins((s) => s.options[p.id]);
  const loadError = usePlugins((s) => s.errors[p.id]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const m = p.manifest;
  useEffect(() => {
    if (!m?.preview) return setPreview(null);
    let live = true;
    void pluginBaseUrl(p.id).then((base) => live && setPreview(base + m.preview!.split("/").map(encodeURIComponent).join("/")));
    return () => {
      live = false;
    };
  }, [p.id, m?.preview]);
  const ok = usable(p);
  const problem = p.error ?? (p.incompatible || (m && !ok) ? `需要 LightPlayer ${m?.minAppVersion} 或更新版本` : null);
  const options = m?.options ?? [];
  const config = Object.keys(m?.config ?? {});
  const remove = async () => {
    if (!(await confirmDialog(`删除插件“${m?.name ?? p.id}”？它的文件夹会被删除。`, "删除插件"))) return;
    try {
      await removePlugin(p.id);
    } catch (e) {
      toast(`删除失败：${String(e)}`, "error");
    }
  };
  return (
    <div className={`plugin-card ${enabled ? "on" : ""} ${problem ? "bad" : ""}`}>
      <div className="plugin-main">
        <div className="plugin-art">{preview ? <img src={preview} alt="" /> : <Icon name="puzzle" size={26} />}</div>
        <div className="plugin-info">
          <div className="plugin-title">
            <b data-lp-raw>{m?.name ?? p.id}</b>
            {m && <span className="muted">{m.version}</span>}
            {m?.author && <span className="muted" data-lp-raw>{m.author}</span>}
          </div>
          {m?.description && (
            <div className="plugin-desc" data-lp-raw>
              {m.description}
            </div>
          )}
          <div className="plugin-id muted">{p.id}</div>
          {problem && (
            <div className="plugin-error">
              <Icon name="warning" size={14} /> {problem}
            </div>
          )}
          {!problem && loadError && (
            <div className="plugin-error">
              <Icon name="warning" size={14} /> {loadError}
            </div>
          )}
          {enabled && config.length > 0 && <div className="plugin-note muted">启用时调整了 {config.length} 项设置，停用后会恢复（你之后手动改过的除外）</div>}
        </div>
        <div className="plugin-actions">
          {enabled && count > 1 && (
            <>
              <button className="icon-btn small" disabled={index === 0} onClick={() => movePlugin(p.id, -1)} {...tip("上移（更早加载，优先级更低）")}>
                <Icon name="arrowUp" size={15} />
              </button>
              <button className="icon-btn small" disabled={index === count - 1} onClick={() => movePlugin(p.id, 1)} {...tip("下移（更晚加载，优先级更高）")}>
                <Icon name="arrowDown" size={15} />
              </button>
            </>
          )}
          {options.length > 0 && (
            <button className={`icon-btn small ${open ? "active" : ""}`} onClick={() => setOpen((o) => !o)} {...tip("插件选项")}>
              <Icon name="settings" size={15} />
            </button>
          )}
          <button className="icon-btn small" onClick={() => void remove()} {...tip("删除插件")}>
            <Icon name="trash" size={15} />
          </button>
          <Switch on={enabled} onChange={(on) => setPluginEnabled(p.id, on)} />
        </div>
      </div>
      {open && m && options.length > 0 && (
        <div className="plugin-options">
          {options.map((o) => {
            const v = optionValue(o, saved?.[o.id]);
            return (
              <Row key={o.id} label={o.label} hint={hintOf(o, v)}>
                <OptionControl id={p.id} o={o} value={v} />
              </Row>
            );
          })}
          <div className="row-actions">
            <span className="muted">{enabled ? "修改会立即生效" : "启用插件后生效"}</span>
            <button className="btn small ghost" onClick={() => resetPluginOptions(p.id)} disabled={!saved}>
              恢复默认选项
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PluginSettings() {
  const installed = usePlugins((s) => s.installed);
  const enabled = usePlugins((s) => s.enabled);
  const safeMode = usePlugins((s) => s.safeMode);
  useEffect(() => {
    void refreshPlugins();
  }, []);
  const on = enabled.filter((id) => installed?.some((p) => p.id === id));
  const list = installed ? [...on.map((id) => installed.find((p) => p.id === id)!), ...installed.filter((p) => !on.includes(p.id))] : [];
  const openFolder = async () => {
    try {
      await api.pluginsOpenDir();
    } catch (e) {
      toast(`无法打开插件文件夹：${String(e)}`, "error");
    }
  };
  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        插件可以改变界面布局、样式、文字和字体，以及播放页和歌词页的样式与设置。插件只包含样式表、字体和文字替换表，不能运行代码。
        多个插件同时启用时，列表中靠下的优先。
      </p>
      {safeMode && (
        <div className="plugin-safe">
          <Icon name="warning" size={16} />
          <span>安全模式：所有插件已临时停用（{keys("⌥⇧⌘P")}）。</span>
          <button className="btn small" onClick={() => setSafeMode(false)}>
            恢复插件
          </button>
        </div>
      )}
      <div className="plugin-toolbar">
        <button className="btn primary" onClick={() => void install(false)}>
          <Icon name="plus" size={15} /> 安装插件包…
        </button>
        <button className="btn" onClick={() => void install(true)}>
          从文件夹安装…
        </button>
        <span className="grow" />
        <button className="icon-btn" onClick={() => void openFolder()} {...tip(`在${FILE_MANAGER}中打开插件文件夹`)}>
          <Icon name="folder" size={17} />
        </button>
        <button className="icon-btn" onClick={() => void reloadPlugins()} {...tip("重新加载插件（修改插件文件后）")}>
          <Icon name="refresh" size={17} />
        </button>
        <button className="icon-btn" onClick={() => void openDocs()} {...tip("插件开发标准")}>
          <Icon name="info" size={17} />
        </button>
      </div>
      {installed === null ? (
        <div className="muted">正在读取插件…</div>
      ) : list.length ? (
        <div className="plugin-list">
          {list.map((p) => (
            <PluginCard key={p.id} p={p} index={on.indexOf(p.id)} count={on.length} />
          ))}
        </div>
      ) : (
        <div className="plugin-empty">
          <Icon name="puzzle" size={30} />
          <div>还没有安装插件</div>
          <div className="muted">
            安装 .lpplugin 插件包，或者参照
            <button className="link" onClick={() => void openDocs()}>
              插件开发标准
            </button>
            制作自己的插件。
          </div>
        </div>
      )}
      <p className="note">
        插件把界面改乱了？按 {keys("⌥⇧⌘P")} 进入安全模式，临时停用所有插件。
      </p>
    </>
  );
}
