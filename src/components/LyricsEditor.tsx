import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as C from "../core/controller";
import { engine } from "../core/player/engine";
import { findLineIndex, formatTimestamp, parseLrc, parseTimestamp, type LyricLine } from "../core/lyrics/lrc";
import { confirmDialog } from "../lib/confirm";
import { formatTime } from "../lib/format";
import { useLyrics, usePlayer, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { Icon } from "./Icon";
import { LyricsView } from "./LyricsView";
import { Slider } from "./Slider";

type Tab = "tap" | "table" | "preview";

function initialRows(): LyricLine[] {
  const l = useLyrics.getState().lyrics;
  if (!l) return [];
  return l.lines.map((x) => ({ ...x }));
}

function MiniTransport() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const playing = usePlayer((s) => s.playing);
  const rate = useSettings((s) => s.rate);
  return (
    <>
      <button className="icon-btn" onClick={() => C.seekBy(-5)} title="后退 5 秒 (←)">
        <Icon name="back15" />
      </button>
      <button className="icon-btn play-btn" style={{ width: 38, height: 38 }} onClick={() => engine.toggle()} title="播放/暂停 (P)">
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>
      <button className="icon-btn" onClick={() => C.seekBy(5)} title="前进 5 秒 (→)">
        <Icon name="fwd15" />
      </button>
      <span className="time">
        {formatTimestamp(position)} / {formatTime(duration)}
      </span>
      <Slider value={position} max={duration} onCommit={C.seek} format={formatTime} />
      <select value={rate} onChange={(e) => C.setRate(parseFloat(e.target.value))} title="播放速度（打标时可放慢）">
        {[0.5, 0.75, 1, 1.25].map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
    </>
  );
}

export function LyricsEditor() {
  const media = usePlayer((s) => s.media);
  const origin = useLyrics((s) => s.origin);
  const compensation = useSettings((s) => s.tapCompensation);
  const [rows, setRows] = useState<LyricLine[]>(initialRows);
  const [tab, setTab] = useState<Tab>(() => (useLyrics.getState().lyrics?.synced ? "table" : "tap"));
  const [cursor, setCursor] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [paste, setPaste] = useState(() => (rows.length && !rows.some((r) => r.time !== null) ? rows.map((r) => r.text).join("\n") : ""));
  const [showPaste, setShowPaste] = useState(rows.length === 0);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const position = usePlayer((s) => s.position);

  const update = useCallback((fn: (r: LyricLine[]) => LyricLine[]) => {
    setRows((r) => fn(r.map((x) => ({ ...x }))));
    setDirty(true);
  }, []);

  const stamp = useCallback(() => {
    setRows((rs) => {
      if (cursor >= rs.length) return rs;
      const next = rs.map((x) => ({ ...x }));
      const t = Math.max(0, engine.position - compensation);
      next[cursor] = { ...next[cursor], time: t, words: undefined, end: undefined };
      return next;
    });
    setDirty(true);
    setCursor((c) => Math.min(c + 1, rows.length));
  }, [cursor, compensation, rows.length]);

  const unstamp = useCallback(() => {
    if (cursor <= 0) return;
    const c = cursor - 1;
    update((rs) => {
      rs[c] = { ...rs[c], time: null, words: undefined };
      return rs;
    });
    setCursor(c);
  }, [cursor, update]);

  const close = useCallback(async () => {
    if (dirty && !(await confirmDialog("有未保存的修改，确定要关闭编辑器吗？"))) return;
    useUI.setState({ overlay: null });
  }, [dirty]);

  // Keyboard: tap mode owns Space/Enter/Backspace; Esc closes.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const typing = tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT";
      if (e.key === "Escape") {
        e.preventDefault();
        void close();
        return;
      }
      if (typing) return;
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        engine.toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        C.seekBy(-3);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        C.seekBy(3);
      } else if (tab === "tap" && !showPaste) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          stamp();
        } else if (e.key === "Backspace") {
          e.preventDefault();
          unstamp();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursor((c) => Math.max(0, c - 1));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursor((c) => Math.min(rows.length, c + 1));
        }
      } else if (e.key === " ") {
        e.preventDefault();
        engine.toggle();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [tab, showPaste, stamp, unstamp, close, rows.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cursor, tab]);

  const timed = useMemo(
    () => rows.filter((r) => r.time !== null).sort((a, b) => a.time! - b.time!),
    [rows],
  );
  const playingIdx = useMemo(() => {
    const i = findLineIndex(timed, position);
    return i >= 0 ? rows.indexOf(timed[i]) : -1;
  }, [timed, rows, position]);

  if (!media) return null;

  const applyPaste = () => {
    const text = paste.trim();
    if (!text) return;
    const parsed = parseLrc(text);
    const lines = parsed.synced ? parsed.lines : text.split(/\r?\n/).map((t) => ({ time: null, text: t.trim() })).filter((l) => l.text);
    setRows(lines);
    setDirty(true);
    setShowPaste(false);
    setCursor(parsed.synced ? 0 : 0);
    if (!parsed.synced) {
      setTab("tap");
      void C.seek(0);
    }
  };

  const save = async (target: "same_dir" | "library" | "export") => {
    const missing = rows.filter((r) => r.time === null && r.text.trim()).length;
    const allUntimed = rows.every((r) => r.time === null);
    let out: LyricLine[];
    if (allUntimed) {
      if (!(await confirmDialog("所有歌词都还没有时间点，将保存为不滚动的纯文本歌词。继续吗？"))) return;
      out = rows.filter((r) => r.text.trim());
    } else {
      if (missing && !(await confirmDialog(`有 ${missing} 行还没有打时间点，这些行将不会被保存。继续吗？`))) return;
      out = timed;
    }
    setSaving(true);
    const ok = await C.saveEditedLyrics(out, target);
    setSaving(false);
    if (ok) {
      setDirty(false);
      if (target !== "export") useUI.setState({ overlay: null });
    }
  };

  const stamped = rows.filter((r) => r.time !== null).length;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && void close()}>
      <div className="dialog full">
        <header>
          <h2>
            歌词编辑器 · {media.meta?.title || media.name}
            {(origin === "ai" || origin === "ai_reviewed") && <span className="chip" style={{ marginLeft: 8 }}>AI 识别结果校对</span>}
          </h2>
          <div className="tabs">
            <button className={tab === "tap" ? "on" : ""} onClick={() => setTab("tap")}>
              打标
            </button>
            <button className={tab === "table" ? "on" : ""} onClick={() => setTab("table")}>
              逐行编辑
            </button>
            <button className={tab === "preview" ? "on" : ""} onClick={() => setTab("preview")}>
              预览
            </button>
          </div>
          <button className="icon-btn" onClick={() => void close()} title="关闭 (Esc)">
            <Icon name="close" />
          </button>
        </header>
        <div className="editor">
          <div className="bar">
            <MiniTransport />
          </div>
          <div className="content">
            {showPaste ? (
              <>
                <textarea
                  className="paste"
                  placeholder={"在这里粘贴歌词文本，每行一句。\n也可以直接粘贴带时间标签的 LRC 歌词。"}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  autoFocus
                />
                <div className="tap-help">
                  <span className="grow">粘贴后点击“下一步”，然后边听边按空格为每一句打上时间点。</span>
                  {rows.length > 0 && (
                    <button className="btn" onClick={() => setShowPaste(false)}>
                      取消
                    </button>
                  )}
                  <button className="btn primary" onClick={applyPaste} disabled={!paste.trim()}>
                    下一步
                  </button>
                </div>
              </>
            ) : tab === "tap" ? (
              <>
                <div className="tap-list" ref={listRef}>
                  {rows.map((r, i) => (
                    <div
                      key={i}
                      data-row={i}
                      className={`tap-row ${r.time !== null ? "stamped" : ""} ${i === cursor ? "cursor" : ""} ${i === playingIdx ? "playing" : ""}`}
                      onClick={() => {
                        setCursor(i);
                        if (r.time !== null) C.seek(r.time);
                      }}
                    >
                      <span className="ts">{r.time !== null ? formatTimestamp(r.time) : "--:--.--"}</span>
                      <span className="txt">{r.text || <span className="muted">（空行）</span>}</span>
                    </div>
                  ))}
                  <div data-row={rows.length} className={`tap-row ${cursor >= rows.length ? "cursor" : ""}`}>
                    <span className="ts" />
                    <span className="muted">— 结束 —</span>
                  </div>
                </div>
                <div className="tap-help">
                  <span>
                    <kbd>空格</kbd>/<kbd>回车</kbd> 为高亮行打点　<kbd>⌫</kbd> 撤销上一句　<kbd>↑</kbd>
                    <kbd>↓</kbd> 移动　<kbd>P</kbd> 播放/暂停　<kbd>←</kbd>
                    <kbd>→</kbd> ±3 秒
                  </span>
                  <span className="grow muted">
                    已打点 {stamped}/{rows.length}　反应补偿 {compensation.toFixed(2)}s
                  </span>
                  <button className="btn" onClick={() => setShowPaste(true)}>
                    <Icon name="edit" size={15} /> 粘贴歌词文本
                  </button>
                  <button className="btn primary" onClick={stamp} disabled={cursor >= rows.length}>
                    <Icon name="target" size={15} /> 打点
                  </button>
                </div>
              </>
            ) : tab === "table" ? (
              <>
                <div className="table-edit" ref={listRef}>
                  {rows.map((r, i) => (
                    <TableRow
                      key={i}
                      index={i}
                      row={r}
                      playing={i === playingIdx}
                      onChange={(nr) =>
                        update((rs) => {
                          rs[i] = nr;
                          return rs;
                        })
                      }
                      onInsert={() =>
                        update((rs) => {
                          rs.splice(i + 1, 0, { time: r.time !== null ? r.time + 2 : null, text: "" });
                          return rs;
                        })
                      }
                      onDelete={() =>
                        update((rs) => {
                          rs.splice(i, 1);
                          return rs;
                        })
                      }
                      onMove={(d) =>
                        update((rs) => {
                          const j = i + d;
                          if (j < 0 || j >= rs.length) return rs;
                          [rs[i], rs[j]] = [rs[j], rs[i]];
                          return rs;
                        })
                      }
                    />
                  ))}
                  {!rows.length && <div className="muted" style={{ padding: 20, textAlign: "center" }}>还没有歌词行</div>}
                </div>
                <div className="table-tools">
                  <button className="btn" onClick={() => update((rs) => [...rs, { time: engine.position, text: "" }])}>
                    <Icon name="plus" size={15} /> 在当前时间添加一行
                  </button>
                  <button className="btn" onClick={() => update((rs) => rs.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity)))}>
                    按时间排序
                  </button>
                  <span className="muted" style={{ marginLeft: 8 }}>整体偏移</span>
                  {[-0.5, -0.1, 0.1, 0.5].map((d) => (
                    <button
                      key={d}
                      className="btn small"
                      onClick={() => update((rs) => rs.map((x) => shiftLine(x, d)))}
                    >
                      {d > 0 ? "+" : ""}
                      {d}s
                    </button>
                  ))}
                  <span style={{ flex: 1 }} />
                  <button className="btn" onClick={() => setShowPaste(true)}>
                    替换为粘贴的文本
                  </button>
                </div>
              </>
            ) : (
              <div className="preview-wrap">
                {timed.length ? (
                  <LyricsView lines={timed} synced fontSize={22} onSeek={C.seek} />
                ) : (
                  <div className="lyric-empty">
                    <p>还没有打上时间点的歌词</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <footer>
          <span className="note" style={{ flex: 1, alignSelf: "center" }}>
            保存到歌曲目录会生成与歌曲同名的 .lrc 文件；已有文件会备份为 .lrc.bak。
          </span>
          <button className="btn" onClick={() => save("export")} disabled={saving || !rows.length}>
            导出为…
          </button>
          <button className="btn" onClick={() => save("library")} disabled={saving || !rows.length}>
            保存到应用歌词库
          </button>
          <button className="btn primary" onClick={() => save("same_dir")} disabled={saving || !rows.length}>
            保存到歌曲目录
          </button>
        </footer>
      </div>
    </div>
  );
}

function shiftLine(l: LyricLine, d: number): LyricLine {
  if (l.time === null) return l;
  return {
    ...l,
    time: Math.max(0, l.time + d),
    end: l.end !== undefined ? Math.max(0, l.end + d) : undefined,
    words: l.words?.map((w) => ({ ...w, time: Math.max(0, w.time + d) })),
  };
}

function TableRow({
  index,
  row,
  playing,
  onChange,
  onInsert,
  onDelete,
  onMove,
}: {
  index: number;
  row: LyricLine;
  playing: boolean;
  onChange: (r: LyricLine) => void;
  onInsert: () => void;
  onDelete: () => void;
  onMove: (d: number) => void;
}) {
  const [timeText, setTimeText] = useState(row.time !== null ? formatTimestamp(row.time) : "");
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setTimeText(row.time !== null ? formatTimestamp(row.time) : "");
    setBad(false);
  }, [row.time]);
  const commitTime = () => {
    if (!timeText.trim()) {
      onChange({ ...row, time: null, words: undefined });
      return;
    }
    const t = parseTimestamp(timeText);
    if (t === null) {
      setBad(true);
      return;
    }
    if (t !== row.time) onChange(row.time !== null ? shiftLine(row, t - row.time) : { ...row, time: t });
  };
  return (
    <div className={`te-row ${playing ? "playing" : ""}`}>
      <span className="n">{index + 1}</span>
      <input
        type="text"
        className={`t ${bad ? "bad" : ""}`}
        value={timeText}
        placeholder="mm:ss.xx"
        onChange={(e) => setTimeText(e.target.value)}
        onBlur={commitTime}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <input
        type="text"
        className="x"
        value={row.text}
        placeholder="歌词"
        onChange={(e) => onChange({ ...row, text: e.target.value, words: undefined })}
      />
      <div className="ops">
        <button className="icon-btn" title="从这一句开始播放" disabled={row.time === null} onClick={() => row.time !== null && (C.seek(row.time), void engine.play())}>
          <Icon name="play" size={14} />
        </button>
        <button className="icon-btn" title="设为当前播放时间" onClick={() => onChange({ ...row, time: engine.position, words: undefined })}>
          <Icon name="target" size={15} />
        </button>
        <button className="icon-btn" title="-0.1 秒" disabled={row.time === null} onClick={() => onChange(shiftLine(row, -0.1))}>
          <Icon name="minus" size={15} />
        </button>
        <button className="icon-btn" title="+0.1 秒" disabled={row.time === null} onClick={() => onChange(shiftLine(row, 0.1))}>
          <Icon name="plus" size={15} />
        </button>
        <button className="icon-btn" title="上移" onClick={() => onMove(-1)}>
          <Icon name="arrowUp" size={15} />
        </button>
        <button className="icon-btn" title="下移" onClick={() => onMove(1)}>
          <Icon name="arrowDown" size={15} />
        </button>
        <button className="icon-btn" title="在下方插入一行" onClick={onInsert}>
          <Icon name="list" size={15} />
        </button>
        <button className="icon-btn" title="删除" onClick={onDelete}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    </div>
  );
}
