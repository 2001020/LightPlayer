// Recognition task manager: the running task, the queue and finished work.

import { useEffect } from "react";
import * as C from "../core/controller";
import { reveal } from "../core/library/actions";
import { isTauri } from "../lib/ipc";
import { useAsrTasks, type AsrTask } from "../stores/asrTasks";
import { useUI } from "../stores/player";
import { Icon } from "./Icon";
import { tip } from "./Tooltip";
import { Thumb } from "./TrackTable";

export const ASR_STAGES: Record<AsrTask["stage"], string> = {
  preparing: "准备中…",
  downloading: "正在下载识别模型…",
  decoding: "正在解码音频…",
  loading: "正在加载模型…",
  transcribing: "正在识别…",
  finishing: "正在整理结果…",
};

function when(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const hm = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

function TaskRow({ task, first }: { task: AsrTask; first?: boolean }) {
  const what = task.kind === "video" ? "字幕" : "歌词";
  const running = task.status === "running";
  const indeterminate = running && task.stage !== "transcribing" && task.stage !== "downloading";
  let status: string;
  switch (task.status) {
    case "running":
      status = `${ASR_STAGES[task.stage]}${indeterminate ? "" : ` ${Math.round(task.percent)}%`}`;
      break;
    case "queued":
      status = "排队中";
      break;
    case "done":
      status = `已生成${what}，共 ${task.lineCount ?? 0} 行${task.model ? `（${task.model}）` : ""}`;
      break;
    case "failed":
      status = `失败：${task.error ?? "未知错误"}`;
      break;
    default:
      status = "已取消";
  }
  return (
    <div className={`task-row ${task.status}`}>
      <Thumb path={task.path} size={64} icon={task.kind === "video" ? "film" : "music"} />
      <div className="grow">
        <div className="t" title={task.path}>
          {task.title || task.name}
          {task.artist && <span className="a">{task.artist}</span>}
        </div>
        <div className="s">
          {task.status === "done" && <Icon name="check" size={13} />}
          {task.status === "failed" && <Icon name="warning" size={13} />}
          <span>{status}</span>
          {task.finishedAt && <span className="time">{when(task.finishedAt)}</span>}
        </div>
        {running && (
          <div className={`progress-bar ${indeterminate ? "indeterminate" : ""}`}>
            <div style={{ width: `${task.percent}%` }} />
          </div>
        )}
      </div>
      <div className="acts">
        {task.status === "done" && (
          <button className="btn small" onClick={() => void C.openTaskResult(task)}>
            <Icon name="play" size={13} /> {task.kind === "video" ? "播放" : "播放并查看歌词"}
          </button>
        )}
        {(task.status === "failed" || task.status === "cancelled") && (
          <button className="btn small" onClick={() => C.retryTask(task.id)}>
            <Icon name="refresh" size={13} /> 重试
          </button>
        )}
        {task.status === "queued" && !first && (
          <button className="icon-btn small" onClick={() => C.moveTaskUp(task.id)} {...tip("提前")}>
            <Icon name="arrowUp" size={16} />
          </button>
        )}
        {task.status !== "running" && task.status !== "queued" && isTauri && (
          <button className="icon-btn small" onClick={() => void reveal(task.path)} {...tip("在访达中显示")}>
            <Icon name="reveal" size={16} />
          </button>
        )}
        <button
          className="icon-btn small"
          onClick={() => C.cancelTask(task.id)}
          {...tip(running ? "取消识别" : task.status === "queued" ? "移出队列" : "删除记录")}
        >
          <Icon name={running ? "close" : task.status === "queued" ? "minus" : "trash"} size={16} />
        </button>
      </div>
    </div>
  );
}

export function AsrTasks() {
  const tasks = useAsrTasks((s) => s.tasks);
  const paused = useAsrTasks((s) => s.paused);
  const close = () => useUI.setState({ overlay: null });
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".ctx-menu") && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const running = tasks.filter((t) => t.status === "running");
  const queued = tasks.filter((t) => t.status === "queued");
  const finished = tasks
    .filter((t) => t.status !== "running" && t.status !== "queued")
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog wide asr-tasks">
        <header>
          <Icon name="sparkles" />
          <h2>识别任务</h2>
          {(queued.length > 0 || paused) && (
            <button className="btn small" onClick={() => C.setRecognitionPaused(!paused)}>
              <Icon name={paused ? "play" : "pause"} size={14} /> {paused ? "继续队列" : "暂停队列"}
            </button>
          )}
          {finished.length > 0 && (
            <button className="btn small ghost" onClick={C.clearFinishedTasks}>
              <Icon name="trash" size={14} /> 清除已完成
            </button>
          )}
          <button className="icon-btn" onClick={close} aria-label="关闭">
            <Icon name="close" />
          </button>
        </header>
        <div className="body">
          {tasks.length === 0 && (
            <div className="folder-empty">
              还没有识别任务。在歌词页点“AI 识别歌词”，或在媒体库里右键歌曲或视频，选择“AI 识别歌词”或“AI 生成字幕”，可以一次加入多个任务。
            </div>
          )}
          {paused && (
            <div className="banner">
              <Icon name="pause" size={16} />
              <span className="grow">队列已暂停{running.length ? "，当前任务完成后不再开始新的任务" : ""}</span>
              <button className="btn small" onClick={() => C.setRecognitionPaused(false)}>
                继续
              </button>
            </div>
          )}
          {running.length > 0 && (
            <section>
              <h3>正在识别</h3>
              {running.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </section>
          )}
          {queued.length > 0 && (
            <section>
              <h3>排队中（{queued.length}）</h3>
              {queued.map((t, i) => (
                <TaskRow key={t.id} task={t} first={i === 0} />
              ))}
            </section>
          )}
          {finished.length > 0 && (
            <section>
              <h3>已完成</h3>
              {finished.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </section>
          )}
          <p className="note">识别在本机离线进行，一次识别一个文件；识别出的歌词和字幕会自动保存，下次打开时直接显示。</p>
        </div>
      </div>
    </div>
  );
}

/** Titlebar button; shows how many tasks are waiting or running. */
export function AsrTasksButton() {
  const active = useAsrTasks((s) => s.tasks.filter((t) => t.status === "running" || t.status === "queued").length);
  const running = useAsrTasks((s) => s.tasks.some((t) => t.status === "running"));
  const open = useUI((s) => s.overlay === "asrTasks");
  return (
    <button
      className={`icon-btn asr-btn ${open ? "active" : ""} ${running ? "busy" : ""}`}
      onClick={() => useUI.setState({ overlay: open ? null : "asrTasks" })}
      {...tip(active ? `识别任务（${active} 个进行中）` : "识别任务")}
    >
      <Icon name="sparkles" />
      {active > 0 && <span className="badge">{active}</span>}
    </button>
  );
}
