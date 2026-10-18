import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TEXTS, setText, type Texts } from "../../src/shared/texts";
import { VIDEOS } from "../../src/videos";
import type { JobStatus } from "../shared/types";
import { api } from "./api";
import { ExportDialog } from "./ExportDialog";
import { type Field, groupsFor, peekFrame } from "./fields";
import { FieldList } from "./FieldList";
import { Preview, type PreviewHandle } from "./Preview";

const VIDEO_KEY = "lightplayer-editor-video";

const same = (a: Texts, b: Texts) => JSON.stringify(a) === JSON.stringify(b);

export const App: React.FC = () => {
  const [videoId, setVideoId] = useState(() => {
    try {
      return localStorage.getItem(VIDEO_KEY) ?? VIDEOS[0].id;
    } catch {
      return VIDEOS[0].id;
    }
  });
  const video = VIDEOS.find((v) => v.id === videoId) ?? VIDEOS[0];
  const [texts, setTexts] = useState<Texts | null>(null);
  const [saved, setSaved] = useState<Texts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [exporting, setExporting] = useState<false | "settings" | "result">(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [menu, setMenu] = useState(false);
  const preview = useRef<PreviewHandle>(null);

  const groups = useMemo(() => groupsFor(video), [video]);
  const fieldByPath = useMemo(() => new Map(groups.flatMap((g) => g.fields.map((f) => [f.path, { field: f, group: g }] as const))), [groups]);
  const dirty = texts && saved ? !same(texts, saved) : false;
  const firstPeek = useMemo(() => {
    const peek = groups[0]?.fields[0]?.where[video.key];
    return peek ? peekFrame(video, peek) : 0;
  }, [groups, video]);

  useEffect(() => {
    api.texts().then(
      (t) => {
        setTexts(t);
        setSaved(t);
      },
      (e: unknown) => setLoadError(String(e)),
    );
    api.status().then(setJob, () => undefined);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIDEO_KEY, video.id);
    } catch {
      // Not remembered in private mode.
    }
  }, [video.id]);

  // When an export finishes in the background, show how it went.
  const lastState = useRef(job?.state);
  useEffect(() => {
    if (lastState.current === "running" && job && job.state !== "running") setExporting((e) => e || "result");
    lastState.current = job?.state;
  }, [job]);

  // Keep polling while an export runs, even with the dialog closed.
  useEffect(() => {
    if (job?.state !== "running") return;
    const t = setInterval(() => {
      api.status().then(setJob, () => undefined);
    }, 700);
    return () => clearInterval(t);
  }, [job?.state]);

  const save = useCallback(async () => {
    if (!texts) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const t = await api.save(texts);
      setSaved(t);
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [texts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [save, dirty]);

  const activeRef = useRef(active);
  activeRef.current = active;

  // Focusing a field shows where its text is, unless it was just picked on
  // screen (then the preview already shows it).
  const focusField = useCallback(
    (f: Field) => {
      if (activeRef.current === f.path) return;
      setActive(f.path);
      const peek = f.where[video.key];
      if (peek) preview.current?.seek(peekFrame(video, peek));
    },
    [video],
  );

  const showScene = (scene: string) => {
    const g = groups.find((gr) => gr.scene === scene);
    const peek = g?.fields[0]?.where[video.key];
    if (peek) preview.current?.seek(peekFrame(video, peek));
  };

  const switchVideo = (id: string) => {
    setVideoId(id);
    setActive(null);
  };

  if (loadError) return <div className="boot">读取文字失败：{loadError}</div>;
  if (!texts || !saved) return <div className="boot">正在载入…</div>;

  const running = job?.state === "running";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <span>LightPlayer 宣传片</span>
          <span className="dim">文字编辑</span>
        </div>
        <nav className="tabs" aria-label="选择视频">
          {VIDEOS.map((v) => (
            <button key={v.id} className={v.id === video.id ? "on" : ""} onClick={() => switchVideo(v.id)} title={v.blurb}>
              {v.name}
            </button>
          ))}
        </nav>
        <div className="actions">
          <span className={`save-state${dirty ? " dirty" : ""}`}>{saveError ? `保存失败：${saveError}` : saving ? "正在保存…" : dirty ? "有未保存的修改" : "已保存"}</span>
          <div className="menu-wrap">
            <button className="btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              更多
            </button>
            {menu ? (
              <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
                <button
                  role="menuitem"
                  disabled={!dirty}
                  onClick={() => {
                    setTexts(saved);
                    setMenu(false);
                  }}
                >
                  放弃未保存的修改
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    if (window.confirm("把所有文字恢复成最初的版本？保存后才会写入文件。")) setTexts(DEFAULT_TEXTS);
                  }}
                >
                  全部恢复默认文字
                </button>
              </div>
            ) : null}
          </div>
          <button className="btn" disabled={!dirty || saving} onClick={() => void save()} title="⌘S / Ctrl+S">
            保存
          </button>
          <button className="btn primary" onClick={() => setExporting("settings")}>
            {running ? `导出中 ${Math.floor((job?.progress ?? 0) * 100)}%` : "导出视频"}
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="left">
          <Preview
            ref={preview}
            video={video}
            initialFrame={firstPeek}
            texts={texts}
            active={active}
            labelOf={(p) => {
              const hit = fieldByPath.get(p);
              return hit ? (hit.group.scene ? `${hit.group.title} · ${hit.field.label}` : hit.field.label) : undefined;
            }}
            onPick={(p) => {
              const hit = fieldByPath.get(p);
              if (hit) setActive(p);
            }}
          />
          <p className="tip">
            点击画面里的文字可以直接跳到对应的输入框；在右侧输入时，预览会停在这段文字出现的位置，并用蓝框标出。
          </p>
        </section>
        <FieldList
          video={video}
          groups={groups}
          texts={texts}
          saved={saved}
          active={active}
          onFocus={focusField}
          onChange={(path, value) => setTexts((t) => (t ? setText(t, path, value) : t))}
          onSceneClick={showScene}
        />
      </main>

      {exporting ? <ExportDialog video={video.id} job={job} showResult={exporting === "result"} onClose={() => setExporting(false)} onBeforeExport={() => (dirty ? save() : Promise.resolve(true))} onJob={setJob} /> : null}
    </div>
  );
};
