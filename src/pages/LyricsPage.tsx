import { useEffect } from "react";
import { ColorChoices } from "../components/ColorChoices";
import * as C from "../core/controller";
import { Icon } from "../components/Icon";
import { LyricsView } from "../components/LyricsView";
import { isCloudPath } from "../lib/ipc";
import { Popover } from "../components/Popover";
import { tip } from "../components/Tooltip";
import { ASR_STAGES } from "../components/AsrTasks";
import { queuePosition, useAsrTasks } from "../stores/asrTasks";
import { useLyrics, usePlayer, useUI } from "../stores/player";
import { clampLyricSize, defaultSettings, LYRIC_SIZE_MAX, LYRIC_SIZE_MIN, useSettings } from "../stores/settings";

function FontSizeMenu() {
  const size = useSettings((s) => s.lyricFontSize);
  const set = (v: number) => useSettings.getState().set({ lyricFontSize: clampLyricSize(v) });
  return (
    <Popover
      down
      trigger={(open, t) => (
        <button className={`icon-btn ${open ? "active" : ""}`} onClick={t} {...tip("歌词字号", "⌘+ / ⌘−")}>
          <Icon name="textSize" />
        </button>
      )}
    >
      {() => (
        <div className="font-menu">
          <div className="label">歌词字号</div>
          <div className="font-row">
            <button className="icon-btn small" onClick={() => set(size - 2)} disabled={size <= LYRIC_SIZE_MIN} aria-label="缩小">
              <span style={{ fontSize: 12, fontWeight: 700 }}>A</span>
            </button>
            <input
              type="range"
              min={LYRIC_SIZE_MIN}
              max={LYRIC_SIZE_MAX}
              value={size}
              onChange={(e) => set(+e.target.value)}
              aria-label="歌词字号"
            />
            <button className="icon-btn small" onClick={() => set(size + 2)} disabled={size >= LYRIC_SIZE_MAX} aria-label="放大">
              <span style={{ fontSize: 18, fontWeight: 700 }}>A</span>
            </button>
          </div>
          <div className="font-foot">
            <span>{size}px</span>
            <button className="btn small ghost" onClick={() => set(defaultSettings.lyricFontSize)} disabled={size === defaultSettings.lyricFontSize}>
              恢复默认
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Progress (or queue place) of the recognition task for `path`. */
export function AsrProgressCard({ path }: { path: string }) {
  const task = useAsrTasks((s) => s.tasks.find((t) => t.path === path && (t.status === "running" || t.status === "queued")));
  const place = useAsrTasks((s) => queuePosition(s.tasks, path));
  const paused = useAsrTasks((s) => s.paused);
  if (!task) return null;
  const queued = task.status === "queued";
  const indeterminate = queued || (task.stage !== "transcribing" && task.stage !== "downloading");
  return (
    <div className="asr-card panel">
      <div className="stage">
        <Icon name="sparkles" size={16} />{" "}
        {queued ? `已在识别队列中，排在第 ${place} 位${paused ? "（队列已暂停）" : ""}` : ASR_STAGES[task.stage]}
        {!indeterminate && <span className="muted"> {Math.round(task.percent)}%</span>}
      </div>
      {!queued && (
        <div className={`progress-bar ${indeterminate ? "indeterminate" : ""}`}>
          <div style={{ width: `${task.percent}%` }} />
        </div>
      )}
      <div className="note">识别在本机离线进行，不会上传任何音频。歌曲较长时可能需要一两分钟，可以继续听歌。</div>
      <div className="asr-card-actions">
        <button className="btn small ghost" onClick={() => useUI.setState({ overlay: "asrTasks" })}>
          <Icon name="list" size={14} /> 查看全部任务
        </button>
        <button className="btn small" onClick={() => C.cancelTask(task.id)}>
          {queued ? "移出队列" : "取消"}
        </button>
      </div>
    </div>
  );
}

/** Where the lyrics come from: rescan, upload, recognise again, remove AI lyrics. */
function HighlightMenu() {
  const color = useSettings((s) => s.lyricHighlight);
  return (
    <Popover
      down
      trigger={(open, t) => (
        <button className={`icon-btn ${open ? "active" : ""}`} onClick={t} {...tip("歌词高亮颜色")}>
          <span className="hl-dot" style={{ background: color ?? "var(--accent)" }} />
        </button>
      )}
    >
      {() => (
        <div className="font-menu">
          <div className="label">当前歌词高亮颜色</div>
          <ColorChoices value={color} onChange={(lyricHighlight) => useSettings.getState().set({ lyricHighlight })} allowDefault="跟随主题色" />
        </div>
      )}
    </Popover>
  );
}

function LyricsSourceMenu({ isAi, busy }: { isAi: boolean; busy: boolean }) {
  const path = usePlayer((s) => s.media?.path);
  const precise = useSettings((s) => !!path && s.precisePaths.includes(path));
  const cloud = isCloudPath(path);
  return (
    <Popover
      down
      trigger={(open, t) => (
        <button className={`icon-btn ${open ? "active" : ""}`} onClick={t} {...tip("歌词来源")}>
          <Icon name="more" />
        </button>
      )}
    >
      {(close) => (
        <div className="menu-list">
          <div className="label">歌词来源</div>
          <div className="item" onClick={() => (close(), void C.rescanLyrics())}>
            <Icon name="refresh" size={15} /> {cloud ? "重新获取网易云音乐歌词" : "重新查找本地歌词文件"}
          </div>
          <div className="item" onClick={() => (close(), void C.importLyricsWithDialog())}>
            <Icon name="upload" size={15} /> 上传歌词文件…
          </div>
          {!cloud && (
            <div className={`item ${busy ? "disabled" : ""}`} onClick={() => !busy && (close(), C.rerunRecognition())}>
              <Icon name="sparkles" size={15} /> {isAi ? "重新识别（可换模型）…" : "AI 识别歌词（可选模型）…"}
            </div>
          )}
          {isAi && (
            <>
              <div className="sep" />
              <div className="item danger" onClick={() => (close(), void C.removeAiLyrics())}>
                <Icon name="trash" size={15} /> 移除 AI 歌词
              </div>
            </>
          )}
          {path && !cloud && (
            <>
              <div className="sep" />
              <div className="label">播放计时</div>
              <div className="item" onClick={() => (close(), void C.setPreciseTiming(path, !precise))}>
                <Icon name="timer" size={15} /> {precise ? "恢复普通播放" : "歌词越来越快或越慢？改用精确计时"}
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

export function LyricsPage() {
  const media = usePlayer((s) => s.media);
  const { status, lyrics, origin, model } = useLyrics();
  const taskHere = useAsrTasks((st) => (media ? st.tasks.some((t) => t.path === media.path && (t.status === "running" || t.status === "queued")) : false));
  const s = useSettings();
  const offset = media ? s.lyricOffsets[media.path] ?? 0 : 0;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Esc closes an open menu first, then leaves the lyrics page.
      if (e.key === "Escape" && !useUI.getState().overlay && !document.querySelector(".popover")) useUI.setState({ page: "player" });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!media) return null;
  const meta = media.meta ?? {};
  const isAi = origin === "ai";
  const editLabel = status === "loaded" ? "编辑歌词" : "制作歌词";
  const nudge = (d: number) => s.setLyricOffset(media.path, offset + d);

  return (
    <div className="lyrics-page" data-lp="lyrics-page" style={s.lyricHighlight ? ({ "--lyric-hl": s.lyricHighlight } as React.CSSProperties) : undefined}>
      <div className="lyrics-head" data-lp="lyrics-head">
        <div>
          <button className="btn ghost" onClick={() => useUI.setState({ page: "player" })} {...tip("返回播放页", "Esc")}>
            <Icon name="chevronLeft" size={18} /> 返回
          </button>
        </div>
        <div className="who" data-lp-raw>
          <div style={{ minWidth: 0 }}>
            <div className="t">{meta.title || media.name}</div>
            {meta.artist && <div className="a">{meta.artist}</div>}
          </div>
        </div>
        <div className="tools">
          {status === "loaded" && lyrics?.synced && (
            <span className="offset-ctl" {...tip("歌词整体偏移（歌词慢了点按 +，快了点按 −）")}>
              <button className="icon-btn" onClick={() => nudge(-0.5)} {...tip("歌词延后 0.5 秒")}>
                <Icon name="minus" size={16} />
              </button>
              {offset > 0 ? "+" : ""}
              {offset.toFixed(1)}s
              <button className="icon-btn" onClick={() => nudge(0.5)} {...tip("歌词提前 0.5 秒")}>
                <Icon name="plus" size={16} />
              </button>
            </span>
          )}
          <HighlightMenu />
          <FontSizeMenu />
          <button className="icon-btn" onClick={C.importLyricsWithDialog} {...tip("上传歌词文件")}>
            <Icon name="upload" />
          </button>
          <button className="icon-btn" onClick={() => useUI.setState({ overlay: "editor" })} {...tip(editLabel, "E")}>
            <Icon name="edit" />
          </button>
          <button className="icon-btn" onClick={() => C.startRecognition()} disabled={taskHere} {...tip("AI 识别歌词")}>
            <Icon name="sparkles" />
          </button>
          <LyricsSourceMenu isAi={isAi || origin === "ai_reviewed"} busy={taskHere} />
        </div>
      </div>

      <div>
        {status === "loaded" && isAi && !taskHere && (
          <div className="banner">
            <Icon name="warning" size={16} />
            <span className="grow">本歌词由识别模型生成，可能有误{model ? `（${model}）` : ""}</span>
            <button className="btn small" onClick={() => useUI.setState({ overlay: "editor" })}>
              <Icon name="edit" size={14} /> 校对编辑
            </button>
            <button className="btn small" onClick={C.rerunRecognition}>
              <Icon name="sparkles" size={14} /> 重新识别
            </button>
            <button className="btn small" onClick={() => void C.removeAiLyrics()}>
              <Icon name="trash" size={14} /> 移除
            </button>
          </div>
        )}
      </div>

      <div className="lyrics-body" data-lp="lyrics-body">
        <div style={{ minHeight: 0, minWidth: 0 }}>
          {taskHere ? (
            <div className="lyric-empty">
              <AsrProgressCard path={media.path} />
            </div>
          ) : status === "loading" ? (
            <div className="lyric-empty">
              <div className="spinner dark" />
            </div>
          ) : status === "loaded" && lyrics ? (
            <LyricsView
              lines={lyrics.lines}
              synced={lyrics.synced}
              offset={offset}
              fontSize={s.lyricFontSize}
              align={s.lyricAlign}
              showTranslation={s.showTranslation}
              karaoke={s.karaoke}
              onSeek={C.seek}
            />
          ) : (
            <div className="lyric-empty">
              <div className="box">
                <h2>暂无歌词</h2>
                <p>没有在歌曲所在目录找到同名歌词文件</p>
                <div className="actions">
                  <button className="btn" onClick={C.importLyricsWithDialog}>
                    <Icon name="upload" size={16} /> 上传歌词文件
                  </button>
                  <button className="btn" onClick={() => useUI.setState({ overlay: "editor" })}>
                    <Icon name="edit" size={16} /> 手动制作
                  </button>
                  <button className="btn primary" onClick={() => C.startRecognition()}>
                    <Icon name="sparkles" size={16} /> AI 识别歌词
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
