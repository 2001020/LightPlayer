// The layout editor's toolbar and inspector, shown over the player page while
// a layout is edited, plus the layout menu shown otherwise.

import { useEffect, useRef, type ReactNode } from "react";
import { ColorChoices } from "../components/ColorChoices";
import { Icon, type IconName } from "../components/Icon";
import { Popover } from "../components/Popover";
import { promptText } from "../components/Prompt";
import { Seg, Switch } from "../components/SettingsControls";
import { tip } from "../components/Tooltip";
import { confirmDialog } from "../lib/confirm";
import { api, isTauri } from "../lib/ipc";
import { keys } from "../lib/platform";
import { toast, usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import {
  activeLayout,
  addElement,
  allLayouts,
  cancelEditing,
  deleteLayout,
  draftChanged,
  duplicateElement,
  duplicateLayout,
  finishEditing,
  moveElement,
  redo,
  removeElement,
  renameLayout,
  selectElement,
  setActiveLayout,
  startEditing,
  undo,
  updateDraft,
  updateElement,
  useLayouts,
} from "../stores/layout";
import { measureClassic } from "./FreeLayout";
import {
  BUILTIN_KINDS,
  BUILTIN_LAYOUTS,
  ENTER_TYPES,
  EXTRA_KINDS,
  KIND_LABEL,
  exportableLayout,
  hasText,
  type ElementKind,
  type EnterType,
  type LayoutElement,
  type TextStyle,
} from "./model";

const KIND_ICON: Record<ElementKind, IconName> = {
  cover: "album",
  title: "text",
  artist: "user",
  album: "album",
  chips: "list",
  lyric: "lyrics",
  text: "text",
  image: "image",
  clock: "clock",
  progress: "minus",
  time: "timer",
};

const isBuiltin = (k: ElementKind) => (BUILTIN_KINDS as string[]).includes(k);
const elementName = (e: LayoutElement) => (e.kind === "text" && e.content ? e.content.replace(/\s+/g, " ").slice(0, 16) : KIND_LABEL[e.kind]);

// ------------------------------------------------------------------ controls

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`le-field ${wide ? "wide" : ""}`}>
      <span className="le-label">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, min, max, step = 1, unit }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string }) {
  return (
    <span className="le-num">
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
      {unit && <em>{unit}</em>}
    </span>
  );
}

function Range({ value, onChange, min, max, step = 1, unit, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; format?: (v: number) => string }) {
  return (
    <span className="le-range">
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <em>{format ? format(value) : `${Math.round(value * 10) / 10}${unit ?? ""}`}</em>
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="le-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ inspector

const FONTS: [string, string][] = [
  ["", "默认"],
  ["serif", "宋体 / 衬线"],
  ["rounded", "圆体"],
  ["mono", "等宽"],
];

function TextControls({ e }: { e: LayoutElement }) {
  const t = e.text!;
  const set = (patch: Partial<TextStyle>, key: string) => updateElement(e.id, (x) => Object.assign(x.text!, patch), true, key);
  const custom = !FONTS.some(([f]) => f === t.font);
  return (
    <Section title="文字">
      <Field label="字号">
        <Range value={t.size} min={0.8} max={16} step={0.1} unit="u" onChange={(size) => set({ size }, "size")} />
      </Field>
      <Field label="粗细">
        <select value={t.weight} onChange={(ev) => set({ weight: Number(ev.target.value) }, "weight")}>
          {[200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </Field>
      <Field label="字体">
        <select value={custom ? "custom" : t.font} onChange={(ev) => set({ font: ev.target.value === "custom" ? "PingFang SC" : ev.target.value }, "font")}>
          {FONTS.map(([f, l]) => (
            <option key={f} value={f}>
              {l}
            </option>
          ))}
          <option value="custom">其他字体…</option>
        </select>
      </Field>
      {custom && (
        <Field label="字体名称">
          <input type="text" value={t.font} placeholder="例如 PingFang SC" onChange={(ev) => set({ font: ev.target.value.replace(/["'\\;{}<>]/g, "") }, "fontname")} />
        </Field>
      )}
      <Field label="对齐">
        <Seg value={t.align} options={[["left", "左"], ["center", "中"], ["right", "右"]]} onChange={(align) => set({ align }, "align")} />
      </Field>
      <Field label="字间距">
        <Range value={t.spacing} min={-0.1} max={0.6} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(spacing) => set({ spacing }, "spacing")} />
      </Field>
      <Field label="颜色" wide>
        <ColorChoices value={t.color} allowDefault="跟随主题" onChange={(color) => set({ color }, "color")} />
      </Field>
      <div className="le-toggles">
        <label>
          <Switch on={t.italic} onChange={(italic) => set({ italic }, "italic")} /> 斜体
        </label>
        <label>
          <Switch on={t.shadow} onChange={(shadow) => set({ shadow }, "shadow")} /> 阴影
        </label>
      </div>
    </Section>
  );
}

function CoverControls({ e }: { e: LayoutElement }) {
  const c = e.cover!;
  const set = (patch: Partial<typeof c>, key: string) => updateElement(e.id, (x) => Object.assign(x.cover!, patch), true, key);
  return (
    <Section title="封面">
      <Field label="形状">
        <Seg value={c.shape} options={[["square", "方形"], ["vinyl", "唱片"]]} onChange={(shape) => set({ shape }, "shape")} />
      </Field>
      {c.shape === "square" ? (
        <Field label="圆角">
          <Range value={c.radius} min={0} max={50} step={0.5} unit="%" onChange={(radius) => set({ radius }, "radius")} />
        </Field>
      ) : (
        <>
          <Field label="封面大小">
            <Range value={c.label} min={30} max={90} unit="%" onChange={(label) => set({ label }, "label")} />
          </Field>
          <Field label="转一圈">
            <Range value={c.speed} min={2} max={60} step={1} unit=" 秒" onChange={(speed) => set({ speed }, "speed")} />
          </Field>
        </>
      )}
      <div className="le-toggles">
        <label>
          <Switch on={c.shadow} onChange={(shadow) => set({ shadow }, "shadow")} /> 阴影
        </label>
        {c.shape === "vinyl" && (
          <>
            <label>
              <Switch on={c.spin} onChange={(spin) => set({ spin }, "spin")} /> 播放时旋转
            </label>
            <label>
              <Switch on={c.arm} onChange={(arm) => set({ arm }, "arm")} /> 唱臂
            </label>
            <label>
              <Switch on={c.grooves} onChange={(grooves) => set({ grooves }, "grooves")} /> 纹路与光泽
            </label>
          </>
        )}
      </div>
    </Section>
  );
}

async function chooseImage(): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, title: "选择图片", filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }] });
    if (typeof path !== "string") return null;
    try {
      return await api.layoutAssetAdd(path);
    } catch (e) {
      toast(`无法使用这张图片：${String(e)}`, "error");
      return null;
    }
  }
  // Browser preview: kept inline.
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      if (f.size > 2_500_000) {
        toast("图片太大（预览中最多 2.5 MB）", "error");
        return resolve(null);
      }
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(f);
    };
    input.click();
  });
}

const PLACEHOLDERS: [string, string][] = [
  ["{title}", "歌名"],
  ["{artist}", "歌手"],
  ["{album}", "专辑"],
  ["{elapsed}", "已播放"],
  ["{duration}", "总时长"],
  ["{remaining}", "剩余"],
  ["{time}", "时间"],
  ["{date}", "日期"],
];

function KindControls({ e }: { e: LayoutElement }) {
  const area = useRef<HTMLTextAreaElement>(null);
  switch (e.kind) {
    case "text":
      return (
        <Section title="内容">
          <textarea
            ref={area}
            className="le-textarea"
            rows={3}
            value={e.content ?? ""}
            maxLength={500}
            onChange={(ev) => updateElement(e.id, (x) => (x.content = ev.target.value), true, "content")}
          />
          <div className="le-chips">
            {PLACEHOLDERS.map(([p, l]) => (
              <button
                key={p}
                className="chip"
                onClick={() => {
                  const el = area.current;
                  const at = el?.selectionStart ?? (e.content ?? "").length;
                  updateElement(e.id, (x) => (x.content = (x.content ?? "").slice(0, at) + p + (x.content ?? "").slice(at)));
                }}
                {...tip(`插入${l}`)}
              >
                {l}
              </button>
            ))}
          </div>
        </Section>
      );
    case "image":
      return (
        <Section title="图片">
          <div className="le-row">
            <button
              className="btn small"
              onClick={async () => {
                const src = await chooseImage();
                if (src) updateElement(e.id, (x) => (x.src = src));
              }}
            >
              <Icon name="image" size={15} /> {e.src ? "更换图片…" : "选择图片…"}
            </button>
          </div>
          <Field label="圆角">
            <Range value={e.radius ?? 0} min={0} max={50} step={0.5} unit="%" onChange={(r) => updateElement(e.id, (x) => (x.radius = r), true, "radius")} />
          </Field>
        </Section>
      );
    case "clock":
      return (
        <Section title="时钟">
          <Field label="显示">
            <select value={e.clock ?? "HH:mm"} onChange={(ev) => updateElement(e.id, (x) => (x.clock = ev.target.value as typeof x.clock))}>
              <option value="HH:mm">时:分</option>
              <option value="HH:mm:ss">时:分:秒</option>
              <option value="date">日期</option>
              <option value="datetime">日期和时间</option>
            </select>
          </Field>
        </Section>
      );
    case "time":
      return (
        <Section title="播放时间">
          <Field label="显示">
            <select value={e.time ?? "both"} onChange={(ev) => updateElement(e.id, (x) => (x.time = ev.target.value as typeof x.time))}>
              <option value="elapsed">已播放</option>
              <option value="remaining">剩余</option>
              <option value="both">已播放 / 总长</option>
            </select>
          </Field>
        </Section>
      );
    case "progress": {
      const p = e.progress!;
      const set = (patch: Partial<typeof p>, key: string) => updateElement(e.id, (x) => Object.assign(x.progress!, patch), true, key);
      return (
        <Section title="进度">
          <Field label="样式">
            <Seg value={p.style} options={[["bar", "进度条"], ["ring", "圆环"]]} onChange={(style) => set({ style }, "style")} />
          </Field>
          <Field label="粗细">
            <Range value={p.thickness} min={0.2} max={6} step={0.1} unit="u" onChange={(thickness) => set({ thickness }, "thickness")} />
          </Field>
          <Field label="颜色" wide>
            <ColorChoices value={p.color} allowDefault="主题色" onChange={(color) => set({ color }, "color")} />
          </Field>
          {p.style === "ring" && <p className="le-hint">把圆环放在封面上、调成与封面同样大小，就是一圈进度。</p>}
        </Section>
      );
    }
    case "lyric":
      return (
        <Section title="歌词预览">
          <div className="le-toggles">
            <label>
              <Switch on={e.next !== false} onChange={(next) => updateElement(e.id, (x) => (x.next = next))} /> 显示下一句
            </label>
          </div>
        </Section>
      );
    default:
      return null;
  }
}

function ElementInspector({ e }: { e: LayoutElement }) {
  const set = (fn: (x: LayoutElement) => void, key: string) => updateElement(e.id, fn, true, key);
  return (
    <>
      <div className="le-head">
        <Icon name={KIND_ICON[e.kind]} size={16} />
        <b>{elementName(e)}</b>
        <span className="spacer" />
        <button className="icon-btn small" onClick={() => moveElement(e.id, 1)} {...tip("移到上层")}>
          <Icon name="arrowUp" size={15} />
        </button>
        <button className="icon-btn small" onClick={() => moveElement(e.id, -1)} {...tip("移到下层")}>
          <Icon name="arrowDown" size={15} />
        </button>
        {!isBuiltin(e.kind) && (
          <button className="icon-btn small" onClick={() => duplicateElement(e.id)} {...tip("复制", "⌘D")}>
            <Icon name="copy" size={15} />
          </button>
        )}
        <button className="icon-btn small" onClick={() => removeElement(e.id)} {...tip(isBuiltin(e.kind) ? "隐藏" : "删除", "Delete")}>
          <Icon name={isBuiltin(e.kind) ? "eyeOff" : "trash"} size={15} />
        </button>
      </div>
      <Section title="位置与大小">
        <div className="le-grid">
          <Field label="X">
            <Num value={e.x} min={-50} max={150} step={0.5} unit="%" onChange={(v) => set((x) => (x.x = v), "x")} />
          </Field>
          <Field label="Y">
            <Num value={e.y} min={-50} max={150} step={0.5} unit="%" onChange={(v) => set((x) => (x.y = v), "y")} />
          </Field>
          <Field label="宽度">
            <Num value={e.w} min={2} max={400} step={1} unit="u" onChange={(v) => set((x) => (x.w = v), "w")} />
          </Field>
          <Field label="旋转">
            <Num value={e.rotate} min={-360} max={360} step={1} unit="°" onChange={(v) => set((x) => (x.rotate = v), "rotate")} />
          </Field>
        </div>
        <Field label="不透明度">
          <Range value={Math.round(e.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => set((x) => (x.opacity = v / 100), "opacity")} />
        </Field>
      </Section>
      {e.cover && <CoverControls e={e} />}
      <KindControls e={e} />
      {hasText(e.kind) && e.text && <TextControls e={e} />}
      <Section title="切歌入场动画">
        <Field label="效果">
          <select value={e.enter.type} onChange={(ev) => set((x) => (x.enter.type = ev.target.value as EnterType), "enter")}>
            {ENTER_TYPES.map(([t, l]) => (
              <option key={t} value={t}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {e.enter.type !== "none" && (
          <>
            <Field label="时长">
              <Range value={e.enter.duration} min={100} max={3000} step={50} format={(v) => `${(v / 1000).toFixed(2)} 秒`} onChange={(v) => set((x) => (x.enter.duration = v), "duration")} />
            </Field>
            <Field label="延迟">
              <Range value={e.enter.delay} min={0} max={3000} step={50} format={(v) => `${(v / 1000).toFixed(2)} 秒`} onChange={(v) => set((x) => (x.enter.delay = v), "delay")} />
            </Field>
            <div className="le-row">
              <button className="btn small" onClick={() => useLayouts.setState((s) => ({ replay: s.replay + 1 }))}>
                <Icon name="play" size={14} /> 预览动画
              </button>
            </div>
          </>
        )}
      </Section>
    </>
  );
}

function AddButtons() {
  return (
    <div className="le-add">
      <span>添加</span>
      {EXTRA_KINDS.map((k) => (
        <button
          key={k}
          className="btn small"
          onClick={() => {
            const id = addElement(k);
            if (k === "image")
              void chooseImage().then((src) => {
                if (src) updateElement(id, (x) => (x.src = src), false);
              });
          }}
          {...tip(`添加${KIND_LABEL[k]}`)}
        >
          <Icon name={KIND_ICON[k]} size={14} /> {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

function Layers() {
  const elements = useLayouts((s) => s.draft?.elements) ?? [];
  const selected = useLayouts((s) => s.selected);
  return (
    <Section title="元素">
      <div className="le-layers">
        {[...elements].reverse().map((e) => (
          <div key={e.id} className={`le-layer ${selected === e.id ? "on" : ""} ${e.hidden ? "off" : ""}`} onClick={() => selectElement(e.id)}>
            <Icon name={KIND_ICON[e.kind]} size={15} />
            <span>{elementName(e)}</span>
            <button
              className="icon-btn small"
              onClick={(ev) => {
                ev.stopPropagation();
                updateElement(e.id, (x) => (x.hidden = !x.hidden));
              }}
              {...tip(e.hidden ? "显示" : "隐藏")}
            >
              <Icon name={e.hidden ? "eyeOff" : "eye"} size={15} />
            </button>
          </div>
        ))}
      </div>
      <AddButtons />
    </Section>
  );
}

function Inspector() {
  const selected = useLayouts((s) => s.draft?.elements.find((e) => e.id === s.selected) ?? null);
  const side = useLayouts((s) => s.panelSide);
  const hidden = useLayouts((s) => s.panelHidden);
  if (hidden) return null;
  return (
    <aside className={`le-panel ${side}`} data-lp="layout-editor" onPointerDown={(e) => e.stopPropagation()}>
      <Layers />
      {selected ? (
        <ElementInspector key={selected.id} e={selected} />
      ) : (
        <p className="le-hint">
          点选元素进行设置。拖动可移动，拖右下角可调大小，拖上方圆点可旋转（按住 ⇧ 以 15° 为步长）；按住 {keys("⌥")} 拖动时不吸附对齐线。方向键微调，{keys("⌘Z")} 撤销。
        </p>
      )}
    </aside>
  );
}

function Toolbar() {
  const name = useLayouts((s) => s.draft?.name ?? "");
  const canUndo = useLayouts((s) => s.past.length > 0);
  const canRedo = useLayouts((s) => s.future.length > 0);
  const side = useLayouts((s) => s.panelSide);
  const hidden = useLayouts((s) => s.panelHidden);
  const cancel = async () => {
    if (!draftChanged() || (await confirmDialog("放弃对布局的修改？"))) cancelEditing();
  };
  return (
    <div className="le-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <Icon name="layout" size={16} />
      <input
        className="le-name"
        value={name}
        maxLength={40}
        onChange={(e) => updateDraft((l) => (l.name = e.target.value), true, "name")}
        onBlur={() => !name.trim() && updateDraft((l) => (l.name = "我的布局"))}
        {...tip("布局名称")}
      />
      <button className="icon-btn" disabled={!canUndo} onClick={undo} {...tip("撤销", "⌘Z")}>
        <Icon name="undo" size={17} />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={redo} {...tip("重做", "⇧⌘Z")}>
        <Icon name="redo" size={17} />
      </button>
      <button className="icon-btn" onClick={() => useLayouts.setState((s) => ({ replay: s.replay + 1 }))} {...tip("预览入场动画")}>
        <Icon name="play" size={16} />
      </button>
      <button className={`icon-btn ${hidden ? "" : "active"}`} onClick={() => useLayouts.setState({ panelHidden: !hidden })} {...tip(hidden ? "显示设置面板" : "隐藏设置面板")}>
        <Icon name="settings" size={17} />
      </button>
      {!hidden && (
        <button className="icon-btn" onClick={() => useLayouts.setState({ panelSide: side === "right" ? "left" : "right" })} {...tip("面板移到另一侧")}>
          <Icon name="sidebar" size={17} />
        </button>
      )}
      <span className="sep" />
      <button className="btn small" onClick={() => void cancel()}>
        取消
      </button>
      <button
        className="btn small primary"
        onClick={() => {
          // With the sample song the page goes back to empty: say where the layout went.
          const sample = useLayouts.getState().sample && usePlayer.getState().media?.kind !== "audio";
          finishEditing();
          if (sample) toast("布局已保存，播放歌曲时生效", "success");
        }}
      >
        完成
      </button>
    </div>
  );
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

/** Editor keys, ahead of the app's own shortcuts. */
function useEditorKeys() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (typing(e) || document.querySelector(".overlay")) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const sel = useLayouts.getState().selected;
      let handled = true;
      if (mod && k === "z") (e.shiftKey ? redo : undo)();
      else if (mod && k === "y") redo();
      else if (mod && k === "d" && sel) duplicateElement(sel);
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) removeElement(sel);
      else if (e.key === "Escape" && sel) selectElement(null);
      else if (e.key.startsWith("Arrow") && sel && !mod) {
        const step = e.shiftKey ? 5 : 0.5;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateElement(sel, (x) => {
          x.x = Math.round((x.x + dx) * 10) / 10;
          x.y = Math.round((x.y + dy) * 10) / 10;
        }, true, "nudge");
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);
}

export function LayoutEditor() {
  useEditorKeys();
  return (
    <>
      <Toolbar />
      <Inspector />
    </>
  );
}

// ------------------------------------------------------------------ menu

/**
 * Opens the editor on the shown layout. The player page must be showing (or
 * about to show). With no song playing it shows a sample song to edit with;
 * the Flow style switches to the classic one, the only one with layouts.
 */
export function editActiveLayout() {
  const go = () => startEditing(() => measureClassic(document.querySelector<HTMLElement>(".player-page .stage")));
  const settings = useSettings.getState();
  const flow = settings.playerStyle === "flow";
  if (flow) settings.set({ playerStyle: "classic" });
  // Kept for the whole edit, so the sample takes over if the song is closed meanwhile.
  useLayouts.setState({ sample: true });
  if (!flow && usePlayer.getState().media?.kind === "audio") go();
  // The classic page has to be on screen to measure it.
  else requestAnimationFrame(() => requestAnimationFrame(go));
}

async function exportLayout(id: string) {
  const l = allLayouts().find((x) => x.id === id);
  if (!l) return;
  if (!isTauri) {
    toast("浏览器预览中不能导出", "error");
    return;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const dest = await save({ title: "导出为插件", defaultPath: `${l.name.replace(/[\\/:*?"<>|]/g, "")}.lpplugin`, filters: [{ name: "LightPlayer 插件", extensions: ["lpplugin"] }] });
  if (!dest) return;
  try {
    await api.layoutExport(dest, exportableLayout(l));
    toast("已导出。别人在 设置 > 插件 中安装后，即可在“布局”菜单中选用", "success", 6000);
  } catch (e) {
    toast(`导出失败：${String(e)}`, "error", 6000);
  }
}

export function LayoutMenu() {
  const active = useLayouts((s) => activeLayout(s).id);
  const custom = useLayouts((s) => s.custom);
  const plugin = useLayouts((s) => s.plugin);
  const list = [...BUILTIN_LAYOUTS, ...custom, ...plugin];
  const groups: [string, typeof list][] = [
    ["内置", list.filter((l) => !l.plugin && !l.id.startsWith("custom-"))],
    ["我的布局", list.filter((l) => l.id.startsWith("custom-"))],
    ["来自插件", list.filter((l) => l.plugin)],
  ];
  const cur = list.find((l) => l.id === active);
  const own = active.startsWith("custom-");
  return (
    <Popover
      down
      trigger={(open, toggle) => (
        <button className={`btn ghost layout-btn ${open ? "on" : ""}`} onClick={toggle} {...tip("播放页布局")}>
          <Icon name="layout" size={17} /> 布局
        </button>
      )}
    >
      {(close) => (
        <div className="layout-menu">
          {groups.map(([title, items]) =>
            items.length ? (
              <div key={title}>
                <div className="label">{title}</div>
                {items.map((l) => (
                  <button key={l.id} className={`item ${l.id === active ? "selected" : ""}`} onClick={() => setActiveLayout(l.id)}>
                    <Icon name={l.id === active ? "check" : l.classic ? "music" : "vinyl"} size={16} />
                    <span>{l.name}</span>
                  </button>
                ))}
              </div>
            ) : null,
          )}
          <div className="sep" />
          <button
            className="item"
            onClick={() => {
              close();
              editActiveLayout();
            }}
          >
            <Icon name="edit" size={16} /> 编辑布局…
          </button>
          {cur && !cur.classic && (
            <button className="item" onClick={() => duplicateLayout(cur.id)}>
              <Icon name="copy" size={16} /> 复制为新布局
            </button>
          )}
          {own && cur && (
            <>
              <button
                className="item"
                onClick={async () => {
                  close();
                  const n = await promptText("重命名布局", cur.name);
                  if (n) renameLayout(cur.id, n);
                }}
              >
                <Icon name="text" size={16} /> 重命名…
              </button>
              <button
                className="item"
                onClick={() => {
                  close();
                  void exportLayout(cur.id);
                }}
              >
                <Icon name="upload" size={16} /> 导出为插件…
              </button>
              <button
                className="item danger"
                onClick={async () => {
                  close();
                  if (await confirmDialog(`删除布局“${cur.name}”？`)) deleteLayout(cur.id);
                }}
              >
                <Icon name="trash" size={16} /> 删除
              </button>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
