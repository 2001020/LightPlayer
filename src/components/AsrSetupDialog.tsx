import * as C from "../core/controller";
import { useAsrTasks } from "../stores/asrTasks";
import { useModels, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { Icon } from "./Icon";
import { AsrOptions, ModelManager } from "./ModelManager";

export function AsrSetupDialog() {
  const model = useSettings((s) => s.asr.model);
  const models = useModels((s) => s.models);
  const downloads = useModels((s) => s.downloads);
  const spec = models.find((m) => m.id === model);
  const pending = useAsrTasks((s) => s.pendingSetup);
  const rerun = useAsrTasks((s) => s.setupRerun);
  const close = () => {
    useUI.setState({ overlay: null });
    useAsrTasks.setState({ pendingSetup: null, setupRerun: false });
  };
  const busy = Object.keys(downloads).length > 0;
  const start = () => {
    useUI.setState({ overlay: null });
    C.confirmPendingRecognition();
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog wide">
        <header>
          <Icon name="sparkles" />
          <h2>{rerun ? "重新识别：选择识别模型" : "AI 识别歌词：选择识别模型"}</h2>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="body">
          <p className="note" style={{ marginTop: 0 }}>
            LightPlayer 使用 Whisper 语音识别模型在本机离线识别歌词，音频不会被上传。首次使用需要下载模型（只需一次）。
            识别结果会作为普通歌词显示并滚动，但可能存在错误，你可以随时用歌词编辑器校对并保存。
          </p>
          {rerun && <p className="note">识别完成后会替换当前的 AI 歌词。如果对结果不满意，可以换一个更大、更准确的模型。</p>}
          <ModelManager />
          <h3 style={{ fontSize: 13, color: "var(--text-faint)", margin: "18px 0 4px" }}>识别选项</h3>
          <AsrOptions />
        </div>
        <footer>
          <button className="btn" onClick={close}>
            取消
          </button>
          <button className="btn primary" onClick={start} disabled={busy}>
            <Icon name={spec?.downloaded ? "sparkles" : "download"} size={16} />
            {spec?.downloaded ? (rerun ? "重新识别" : "开始识别") : `下载 ${spec?.label ?? "模型"} 并开始识别`}
            {pending && pending.length > 1 ? `（${pending.length} 项）` : ""}
          </button>
        </footer>
      </div>
    </div>
  );
}
