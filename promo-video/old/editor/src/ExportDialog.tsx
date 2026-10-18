import { useEffect, useState } from "react";
import { framesAt, VIDEOS } from "../../src/videos";
import { CODECS, type ExportSettings, FRAME_RATES, type GpuReport, HEIGHTS, type JobStatus, type SystemInfo, type VideoCodec } from "../shared/types";
import { api } from "./api";

const RESOLUTIONS: Record<number, { name: string; sub: string }> = {
  720: { name: "720p", sub: "1280 × 720" },
  1080: { name: "1080p", sub: "1920 × 1080" },
  1440: { name: "2K", sub: "2560 × 1440" },
  2160: { name: "4K", sub: "3840 × 2160" },
};

const CODEC_INFO: Record<VideoCodec, { name: string; sub: string }> = {
  h264: { name: "H.264", sub: "MP4，哪里都能播" },
  h265: { name: "H.265", sub: "MP4，体积约小一半" },
  prores: { name: "ProRes 422", sub: "MOV，用于后期剪辑" },
};

const STAGES: Record<string, string> = {
  bundle: "打包项目",
  browser: "启动渲染浏览器",
  prepare: "准备画面",
  render: "渲染并编码",
  finish: "完成",
};

const STORAGE_KEY = "lightplayer-editor-export";

export const DEFAULT_SETTINGS: Omit<ExportSettings, "video"> = { height: 2160, fps: 60, codec: "h264", quality: "high", gpu: true, hwEncode: true };

function loadSettings(video: string): ExportSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<ExportSettings>;
    return { ...DEFAULT_SETTINGS, ...saved, video };
  } catch {
    return { ...DEFAULT_SETTINGS, video };
  }
}

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`;
};

/** "h264_videotoolbox" → "VideoToolbox", "hevc_nvenc" → "NVIDIA NVENC". */
const encoderName = (ffmpegName: string) => (/videotoolbox/.test(ffmpegName) ? "VideoToolbox" : /nvenc/.test(ffmpegName) ? "NVIDIA NVENC" : ffmpegName);

const fmtSize = (bytes: number) => (bytes > 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`);

function Choice<T extends string | number | boolean>({ value, options, onChange }: { value: T; options: { value: T; name: string; sub?: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="choice">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? "on" : ""} disabled={o.disabled} onClick={() => onChange(o.value)}>
          <span className="choice-name">{o.name}</span>
          {o.sub ? <span className="choice-sub">{o.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}

export const ExportDialog: React.FC<{
  video: string;
  job: JobStatus | null;
  /** Open on the result of the last export instead of the settings. */
  showResult?: boolean;
  onClose: () => void;
  /** Saves pending edits; resolves when the texts on disk are current. */
  onBeforeExport: () => Promise<boolean>;
  onJob: (job: JobStatus) => void;
}> = ({ video, job, showResult = false, onClose, onBeforeExport, onJob }) => {
  const [s, setS] = useState<ExportSettings>(() => loadSettings(video));
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [gpu, setGpu] = useState<GpuReport | "checking" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!job || !(job.state === "running" || (showResult && job.state !== "idle")));

  useEffect(() => {
    api.system().then(setSystem, () => undefined);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Private mode: settings are just not remembered.
    }
  }, [s]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const checkGpu = () => {
    setGpu("checking");
    api.gpuCheck().then(setGpu, (e: unknown) => setGpu({ accelerated: false, renderer: "", error: String(e) }));
  };

  const set = <K extends keyof ExportSettings>(k: K, v: ExportSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const def = VIDEOS.find((v) => v.id === s.video)!;
  const frames = framesAt(def.duration, s.fps);
  const width = Math.round((1920 * s.height) / 1080);
  const hw = system?.hwEncoders[s.codec];

  const start = async () => {
    setError(null);
    if (!(await onBeforeExport())) return;
    try {
      onJob(await api.startExport(s));
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const running = job?.state === "running";
  const showProgress = !showForm && job && job.state !== "idle";
  const elapsed = job?.startedAt ? (job.finishedAt ?? Date.now()) - job.startedAt : 0;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header className="modal-head">
          <h2 id="export-title">导出视频</h2>
          <button className="icon-btn" aria-label="关闭" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        {showProgress && job ? (
          <div className="modal-body">
            <div className="job-title">
              {job.outputName}
              <span className="dim">
                {job.settings ? ` · ${Math.round((1920 * job.settings.height) / 1080)} × ${job.settings.height} · ${job.settings.fps} 帧/秒` : ""}
              </span>
            </div>
            {job.state === "running" ? (
              <>
                <div className="stage-line">
                  <span>{STAGES[job.stage ?? "bundle"]}</span>
                  <span className="dim">{Math.floor(job.progress * 100)}%</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${job.progress * 100}%` }} />
                </div>
                <div className="stats">
                  {job.totalFrames ? (
                    <span>
                      已渲染 {job.renderedFrames} / {job.totalFrames} 帧，已编码 {job.encodedFrames} 帧
                    </span>
                  ) : null}
                  <span>已用 {fmtDuration(elapsed)}</span>
                  {job.etaMs ? <span>约剩 {fmtDuration(job.etaMs)}</span> : null}
                </div>
                {job.detail ? <p className="detail">{job.detail}</p> : null}
                <div className="engine">
                  {job.renderer ? <span>{job.renderer}</span> : null}
                  {job.encoder ? <span>{job.encoder}</span> : null}
                </div>
              </>
            ) : null}
            {job.state === "done" ? (
              <div className="result ok">
                <p>
                  已导出，用时 {fmtDuration(elapsed)}
                  {job.size ? `，${fmtSize(job.size)}` : ""}
                </p>
                <code className="path">{job.output}</code>
                <div className="engine">
                  {job.renderer ? <span>{job.renderer}</span> : null}
                  {job.encoder ? <span>{job.encoder}</span> : null}
                </div>
              </div>
            ) : null}
            {job.state === "error" ? (
              <div className="result bad">
                <p>导出失败</p>
                <pre className="error">{job.error}</pre>
              </div>
            ) : null}
            {job.state === "cancelled" ? <p className="result">已取消导出</p> : null}
            {job.notes.length ? (
              <ul className="notes">
                {job.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
            <footer className="modal-foot">
              {running ? (
                <>
                  <span className="dim small">可以关闭这个窗口继续编辑，导出会在后台进行</span>
                  <button className="btn" onClick={() => void api.cancelExport().then(onJob)}>
                    取消导出
                  </button>
                </>
              ) : (
                <>
                  {job.state === "done" && job.output ? (
                    <>
                      <button className="btn" onClick={() => void api.reveal(job.output!, true)}>
                        在文件夹中显示
                      </button>
                      <button className="btn" onClick={() => void api.reveal(job.output!, false)}>
                        播放视频
                      </button>
                    </>
                  ) : null}
                  <span className="spacer" />
                  <button className="btn primary" onClick={() => setShowForm(true)}>
                    {job.state === "done" ? "再导出一个" : "返回设置"}
                  </button>
                </>
              )}
            </footer>
          </div>
        ) : (
          <div className="modal-body">
            <div className="row">
              <div className="row-label">视频</div>
              <Choice value={s.video} onChange={(v) => set("video", v)} options={VIDEOS.map((v) => ({ value: v.id, name: v.name, sub: `${(v.duration / 30).toFixed(1)} 秒` }))} />
            </div>
            <div className="row">
              <div className="row-label">分辨率</div>
              <Choice value={s.height} onChange={(v) => set("height", v)} options={HEIGHTS.map((h) => ({ value: h, name: RESOLUTIONS[h].name, sub: RESOLUTIONS[h].sub }))} />
            </div>
            <div className="row">
              <div className="row-label">帧率</div>
              <Choice value={s.fps} onChange={(v) => set("fps", v)} options={FRAME_RATES.map((f) => ({ value: f, name: `${f}`, sub: "帧/秒" }))} />
            </div>
            <div className="row">
              <div className="row-label">编码</div>
              <Choice value={s.codec} onChange={(v) => set("codec", v)} options={CODECS.map((c) => ({ value: c, ...CODEC_INFO[c] }))} />
            </div>
            <div className="row">
              <div className="row-label">画质</div>
              <Choice
                value={s.quality}
                onChange={(v) => set("quality", v)}
                options={[
                  { value: "high", name: "高", sub: "推荐" },
                  { value: "standard", name: "标准", sub: "文件更小" },
                ]}
              />
            </div>
            <div className="row">
              <div className="row-label">画面渲染</div>
              <div>
                <Choice
                  value={s.gpu}
                  onChange={(v) => set("gpu", v)}
                  options={[
                    { value: true, name: "显卡", sub: "快，推荐" },
                    { value: false, name: "软件", sub: "没有显卡时用" },
                  ]}
                />
                <div className="gpu-check">
                  {gpu === null ? (
                    <button className="link" onClick={checkGpu}>
                      检测显卡是否可用
                    </button>
                  ) : gpu === "checking" ? (
                    <span className="dim">正在检测显卡…（第一次需要先打包项目，可能要半分钟）</span>
                  ) : gpu.error ? (
                    <span className="warn">检测失败：{gpu.error}</span>
                  ) : gpu.accelerated ? (
                    <span className="good">显卡可用：{gpu.renderer}</span>
                  ) : (
                    <span className="warn">
                      没有用上显卡（{gpu.renderer}），选“显卡”也会退回软件渲染，速度较慢
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="row">
              <div className="row-label">视频编码器</div>
              <div>
                <Choice
                  value={s.hwEncode}
                  onChange={(v) => set("hwEncode", v)}
                  options={[
                    { value: true, name: "显卡编码", sub: hw ? encoderName(hw) : system ? "本机不支持，会用软件" : "检测中…" },
                    { value: false, name: "软件编码", sub: "画质稳定" },
                  ]}
                />
              </div>
            </div>

            <div className="summary">
              <div>
                <b>LightPlayer-{s.video}-{s.height}p{s.fps}.{s.codec === "prores" ? "mov" : "mp4"}</b>
              </div>
              <div className="dim">
                {width} × {s.height} · {s.fps} 帧/秒 · {(def.duration / 30).toFixed(1)} 秒 · {frames} 帧 · 无声 · 保存到 {system?.outDir ?? "out"}
              </div>
              {s.height >= 2160 && s.fps >= 50 ? <div className="dim">4K 60 帧计算量是 1080p 30 帧的 8 倍，请耐心等待</div> : null}
            </div>
            {error ? <p className="warn">{error}</p> : null}

            <footer className="modal-foot">
              {job && job.state !== "idle" ? (
                <button className="btn" onClick={() => setShowForm(false)}>
                  查看{running ? "进行中的导出" : "上次导出"}
                </button>
              ) : null}
              <span className="spacer" />
              <button className="btn primary" disabled={running} onClick={() => void start()}>
                {running ? "已有导出在进行" : "保存并导出"}
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
};
