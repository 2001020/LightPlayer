import { useEffect } from "react";
import * as C from "../core/controller";
import { api } from "../lib/ipc";
import { confirmDialog } from "../lib/confirm";
import { formatBytes } from "../lib/format";
import { useModels } from "../stores/player";
import { useSettings } from "../stores/settings";
import { Icon } from "./Icon";

export const LANGUAGES: [string, string][] = [
  ["auto", "自动检测"],
  ["zh", "中文（普通话）"],
  ["yue", "粤语"],
  ["en", "英语"],
  ["ja", "日语"],
  ["ko", "韩语"],
  ["fr", "法语"],
  ["de", "德语"],
  ["es", "西班牙语"],
  ["ru", "俄语"],
];

export function ModelManager({ selectable = true }: { selectable?: boolean }) {
  const { models, downloads } = useModels();
  const asr = useSettings((s) => s.asr);
  const setAsr = useSettings((s) => s.setAsr);
  useEffect(() => {
    void C.refreshModels();
  }, []);
  const main = models.filter((m) => m.id !== "silero-vad");
  const vad = models.find((m) => m.id === "silero-vad");
  if (!models.length) return <p className="note">正在读取模型列表…（浏览器预览模式下不可用）</p>;
  return (
    <div className="model-list">
      {main.map((m) => {
        const d = downloads[m.id];
        const pct = d && d.total ? (d.downloaded / d.total) * 100 : 0;
        return (
          <div key={m.id} className={`model ${selectable && asr.model === m.id ? "on" : ""}`} onClick={() => selectable && setAsr({ model: m.id })}>
            {selectable ? <span className="radio" /> : <Icon name="sparkles" size={16} />}
            <div>
              <div className="name">
                {m.label}
                {m.recommended && <span className="chip accent">推荐</span>}
                {m.downloaded && <span className="chip">已下载</span>}
              </div>
              <small>
                {m.description} · 约 {m.sizeMb >= 1000 ? `${(m.sizeMb / 1024).toFixed(1)} GB` : `${m.sizeMb} MB`}
                {!m.downloaded && m.partialBytes > 0 && !d && `（已下载 ${formatBytes(m.partialBytes)}，可继续）`}
              </small>
              {d && (
                <>
                  <div className={`progress-bar ${d.state === "verifying" ? "indeterminate" : ""}`}>
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <small>
                    {d.state === "verifying" ? "正在校验…" : `${formatBytes(d.downloaded)} / ${formatBytes(d.total)}`}
                  </small>
                </>
              )}
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              {d ? (
                <button className="btn small" onClick={() => api.asrCancelDownload(m.id)}>
                  取消
                </button>
              ) : m.downloaded ? (
                <button
                  className="btn small ghost danger"
                  title="删除模型"
                  onClick={async () => {
                    if (await confirmDialog(`删除模型 ${m.label}？`)) {
                      await api.asrDeleteModel(m.id);
                      void C.refreshModels();
                    }
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              ) : (
                <button className="btn small" onClick={() => C.downloadModel(m.id)}>
                  <Icon name="download" size={15} /> 下载
                </button>
              )}
            </div>
          </div>
        );
      })}
      {vad && (
        <div className="model" style={{ cursor: "default" }}>
          <Icon name="target" size={16} />
          <div>
            <div className="name">
              {vad.label} {vad.downloaded && <span className="chip">已下载</span>}
            </div>
            <small>{vad.description}（约 1 MB，开启“人声检测”时自动下载）</small>
          </div>
          <div />
        </div>
      )}
      <div className="setting-row">
        <div className="lbl">
          下载源
          <small>国内网络可选择镜像源以加快下载</small>
        </div>
        <div className="ctl">
          <div className="seg">
            <button className={asr.mirror === "huggingface" ? "on" : ""} onClick={() => setAsr({ mirror: "huggingface" })}>
              Hugging Face
            </button>
            <button className={asr.mirror === "hf-mirror" ? "on" : ""} onClick={() => setAsr({ mirror: "hf-mirror" })}>
              国内镜像
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AsrOptions() {
  const asr = useSettings((s) => s.asr);
  const setAsr = useSettings((s) => s.setAsr);
  const Toggle = ({ k, label, hint }: { k: "vocalFocus" | "simplified" | "useVad" | "wordTimestamps"; label: string; hint: string }) => (
    <div className="setting-row">
      <div className="lbl">
        {label}
        <small>{hint}</small>
      </div>
      <button className={`switch ${asr[k] ? "on" : ""}`} onClick={() => setAsr({ [k]: !asr[k] })} />
    </div>
  );
  return (
    <>
      <div className="setting-row">
        <div className="lbl">
          歌曲语言
          <small>明确指定语言通常比自动检测更准确</small>
        </div>
        <select value={asr.language} onChange={(e) => setAsr({ language: e.target.value })}>
          {LANGUAGES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <Toggle k="useVad" label="人声检测（VAD）" hint="跳过纯伴奏段落，明显减少模型“编造”歌词" />
      <Toggle k="vocalFocus" label="人声频段增强" hint="识别前滤除低频鼓点与高频噪声，突出人声" />
      <Toggle k="simplified" label="输出简体中文" hint="将识别出的繁体字转换为简体" />
      <Toggle k="wordTimestamps" label="逐字时间轴" hint="生成卡拉 OK 式逐字高亮歌词" />
    </>
  );
}
