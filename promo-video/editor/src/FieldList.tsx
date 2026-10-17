import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TEXTS, getText, type Texts, textWidthEm } from "../../src/shared/texts";
import type { VideoDef } from "../../src/videos";
import { type Field, type Group, peekFrame } from "./fields";

const fmtTime = (frames: number) => {
  const s = Math.round(frames / 30);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Counts a Chinese character as one and a Latin letter as about half. */
const visualLength = (s: string) => Math.round(textWidthEm(s));

const FieldRow: React.FC<{
  field: Field;
  video: VideoDef;
  value: string;
  saved: string;
  active: boolean;
  onFocus: () => void;
  onChange: (v: string) => void;
}> = ({ field, video, value, saved, active, onFocus, onChange }) => {
  const input = useRef<HTMLInputElement>(null);
  const peek = field.where[video.key];
  const def = getText(DEFAULT_TEXTS, field.path);
  const len = visualLength(value);
  const over = field.max !== undefined && len > field.max;
  const sceneLabel = peek ? video.scenes.find((s) => s.id === peek.scene)?.label : undefined;

  useEffect(() => {
    if (active && document.activeElement !== input.current) {
      input.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      input.current?.focus({ preventScroll: true });
    }
  }, [active]);

  return (
    <label className={`field${active ? " active" : ""}${peek ? "" : " absent"}`} data-path={field.path}>
      <div className="field-head">
        <span className="field-label">
          {value !== saved ? <i className="dot" title="未保存" /> : null}
          {field.label}
        </span>
        <span className="field-meta">
          {peek ? (
            <span className="where" title="在预览中的位置">
              {sceneLabel} {fmtTime(peekFrame(video, peek))}
            </span>
          ) : (
            <span className="where muted">本片未出现</span>
          )}
        </span>
      </div>
      <div className="field-input">
        <input
          ref={input}
          value={value}
          spellCheck={false}
          placeholder="（留空则不显示）"
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, " "))}
        />
        {field.max !== undefined ? (
          <span className={`count${over ? " over" : ""}`} title={over ? "超出建议长度，文字会自动缩小以放得下" : "建议长度"}>
            {len}/{field.max}
          </span>
        ) : null}
        <button
          type="button"
          className="icon-btn reset"
          title={`恢复默认：${def}`}
          aria-label="恢复默认"
          disabled={value === def}
          onClick={(e) => {
            e.preventDefault();
            onChange(def);
            onFocus();
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
      </div>
      {field.hint ? <div className="hint">{field.hint}</div> : null}
      {over ? <div className="hint warn">比建议的长，画面里会自动缩小字号</div> : null}
    </label>
  );
};

export const FieldList: React.FC<{
  video: VideoDef;
  groups: Group[];
  texts: Texts;
  saved: Texts;
  active: string | null;
  onFocus: (field: Field) => void;
  onChange: (path: string, value: string) => void;
  onSceneClick: (scene: string) => void;
}> = ({ video, groups, texts, saved, active, onFocus, onChange, onSceneClick }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Unfold the group of a text picked on screen.
  useEffect(() => {
    if (!active) return;
    const g = groups.find((gr) => gr.fields.some((f) => f.path === active));
    if (g) setOpen((o) => ((o[g.id] ?? !g.folded) ? o : { ...o, [g.id]: true }));
  }, [active, groups]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          fields: q ? g.fields.filter((f) => f.label.toLowerCase().includes(q) || getText(texts, f.path).toLowerCase().includes(q) || g.title.includes(q)) : g.fields,
        }))
        .filter((g) => g.fields.length > 0),
    [groups, q, texts],
  );

  const headlineGroups = shown.filter((g) => g.scene);
  const sharedGroups = shown.filter((g) => !g.scene);

  const renderGroup = (g: Group) => {
    const isOpen = q ? true : (open[g.id] ?? !g.folded);
    const sceneIdx = g.scene ? video.scenes.findIndex((s) => s.id === g.scene) : -1;
    const changed = g.fields.filter((f) => getText(texts, f.path) !== getText(saved, f.path)).length;
    return (
      <section key={g.id} className={`group${isOpen ? " open" : ""}`}>
        <button
          type="button"
          className="group-head"
          onClick={() => {
            setOpen((o) => ({ ...o, [g.id]: !isOpen }));
            if (g.scene) onSceneClick(g.scene);
          }}
        >
          <svg className="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span className="group-title">{g.title}</span>
          {changed ? <i className="dot" title={`${changed} 处未保存`} /> : null}
          <span className="group-meta">{sceneIdx >= 0 ? fmtTime(video.starts[sceneIdx]) : `${g.fields.length} 项`}</span>
        </button>
        {g.note && isOpen ? <p className="group-note">{g.note}</p> : null}
        {isOpen ? (
          <div className="group-body">
            {g.fields.map((f) => (
              <FieldRow
                key={f.path}
                field={f}
                video={video}
                value={getText(texts, f.path)}
                saved={getText(saved, f.path)}
                active={active === f.path}
                onFocus={() => onFocus(f)}
                onChange={(v) => onChange(f.path, v)}
              />
            ))}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <aside className="fields">
      <div className="search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索文字" />
        {query ? (
          <button type="button" className="icon-btn" aria-label="清除" onClick={() => setQuery("")}>
            ×
          </button>
        ) : null}
      </div>
      <div className="fields-scroll">
        {headlineGroups.length ? (
          <>
            <h2 className="section">{video.name} 的标题</h2>
            {headlineGroups.map(renderGroup)}
          </>
        ) : null}
        {sharedGroups.length ? (
          <>
            <h2 className="section">
              共用内容 <span className="section-note">三个风格都会用到</span>
            </h2>
            {sharedGroups.map(renderGroup)}
          </>
        ) : null}
        {!shown.length ? <p className="empty">没有找到“{query}”</p> : null}
      </div>
    </aside>
  );
};
