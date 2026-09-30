import { useEffect, useState } from "react";
import { api, isTauri, localFileUrl, registerBrowserFiles } from "../lib/ipc";
import { useUI, type UIState } from "../stores/player";
import { ACCENT_PRESETS, defaultSettings, useSettings } from "../stores/settings";
import { Icon, type IconName } from "./Icon";
import { AsrOptions, ModelManager } from "./ModelManager";

type Tab = UIState["settingsTab"];

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "appearance", label: "外观", icon: "image" },
  { id: "playback", label: "播放", icon: "play" },
  { id: "lyrics", label: "歌词", icon: "lyrics" },
  { id: "asr", label: "歌词识别", icon: "sparkles" },
  { id: "shortcuts", label: "快捷键", icon: "keyboard" },
  { id: "about", label: "关于", icon: "info" },
];

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="lbl">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="ctl">{children}</div>
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={String(v)} className={v === value ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Appearance() {
  const s = useSettings();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (s.background.path) localFileUrl(s.background.path).then(setPreview);
    else setPreview(null);
  }, [s.background.path]);

  const pickBackground = async () => {
    if (!isTauri) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => input.files?.length && s.setBackground({ path: registerBrowserFiles(input.files)[0] });
      input.click();
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const res = await open({ multiple: false, filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp", "gif", "heic", "bmp"] }] });
    if (typeof res === "string") {
      const stored = await api.importBackground(res).catch(() => res);
      s.setBackground({ path: stored });
    }
  };

  return (
    <>
      <h3>主题</h3>
      <Row label="外观模式">
        <Seg value={s.theme} options={[["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]]} onChange={(theme) => s.set({ theme })} />
      </Row>
      <Row label="主题色" hint="用于按钮、进度条、高亮歌词等">
        <div className="swatches">
          {ACCENT_PRESETS.map((c) => (
            <button key={c} className={`swatch ${s.accent === c && !s.dynamicAccent ? "on" : ""}`} style={{ background: c }} onClick={() => s.set({ accent: c, dynamicAccent: false })} />
          ))}
          <input type="color" value={s.accent} onChange={(e) => s.set({ accent: e.target.value, dynamicAccent: false })} title="自定义颜色" />
        </div>
      </Row>
      <Row label="随封面变色" hint="自动从当前歌曲封面中提取主题色">
        <Switch on={s.dynamicAccent} onChange={(dynamicAccent) => s.set({ dynamicAccent })} />
      </Row>

      <h3>背景</h3>
      <Row label="自定义背景图片" hint="图片会复制到应用数据目录">
        <div className="bg-preview" style={preview ? { backgroundImage: `url("${preview}")` } : undefined} />
        <button className="btn" onClick={pickBackground}>
          选择图片…
        </button>
        {s.background.path && (
          <button className="btn ghost" onClick={() => s.setBackground({ path: null })}>
            移除
          </button>
        )}
      </Row>
      <Row label="背景模糊" hint={`${s.background.blur}px`}>
        <input type="range" min={0} max={40} value={s.background.blur} onChange={(e) => s.setBackground({ blur: +e.target.value })} />
      </Row>
      <Row label="背景遮罩" hint={`${Math.round(s.background.dim * 100)}%，让文字更清晰`}>
        <input type="range" min={0} max={0.9} step={0.05} value={s.background.dim} onChange={(e) => s.setBackground({ dim: +e.target.value })} />
      </Row>
      <Row label="背景填充方式">
        <Seg value={s.background.fit} options={[["cover", "填充"], ["contain", "适应"], ["tile", "平铺"]]} onChange={(fit) => s.setBackground({ fit })} />
      </Row>
      <Row label="播放音乐时使用封面作为背景" hint="未设置自定义背景时生效">
        <Switch on={s.coverBackground} onChange={(coverBackground) => s.set({ coverBackground })} />
      </Row>
    </>
  );
}

function Playback() {
  const s = useSettings();
  return (
    <>
      <h3>跳转</h3>
      <Row label="方向键 ← → 步长">
        <Seg value={s.seekStep} options={[[3, "3 秒"], [5, "5 秒"], [10, "10 秒"]]} onChange={(seekStep) => s.set({ seekStep })} />
      </Row>
      <Row label="快进 / 快退按钮步长" hint="也可以用 J / L 键">
        <Seg value={s.jumpStep} options={[[10, "10 秒"], [15, "15 秒"], [30, "30 秒"]]} onChange={(jumpStep) => s.set({ jumpStep })} />
      </Row>
      <h3>其他</h3>
      <Row label="断点续播" hint="时长超过 10 分钟的视频/有声书会记住上次播放位置">
        <Switch on={s.resume} onChange={(resume) => s.set({ resume })} />
      </Row>
      <Row label="清除最近播放记录">
        <button className="btn" onClick={() => s.set({ recent: [], positions: {} })}>
          清除
        </button>
      </Row>
    </>
  );
}

function LyricsSettings() {
  const s = useSettings();
  return (
    <>
      <h3>显示</h3>
      <Row label="歌词字号" hint={`${s.lyricFontSize}px`}>
        <input type="range" min={14} max={40} value={s.lyricFontSize} onChange={(e) => s.set({ lyricFontSize: +e.target.value })} />
      </Row>
      <Row label="对齐方式">
        <Seg value={s.lyricAlign} options={[["center", "居中"], ["left", "左对齐"]]} onChange={(lyricAlign) => s.set({ lyricAlign })} />
      </Row>
      <Row label="显示翻译" hint="同一时间点的第二行歌词作为翻译显示">
        <Switch on={s.showTranslation} onChange={(showTranslation) => s.set({ showTranslation })} />
      </Row>
      <Row label="逐字高亮（卡拉 OK）" hint="歌词包含逐字时间时生效">
        <Switch on={s.karaoke} onChange={(karaoke) => s.set({ karaoke })} />
      </Row>
      <h3>音频波形</h3>
      <Row label="歌词页两侧显示音频波形" hint="窗口宽度足够时显示，低调不打扰">
        <Switch on={s.waveform} onChange={(waveform) => s.set({ waveform })} />
      </Row>
      <Row label="波形样式">
        <Seg value={s.waveformStyle} options={[["bars", "细条"], ["wave", "曲线"]]} onChange={(waveformStyle) => s.set({ waveformStyle })} />
      </Row>
      <h3>打标</h3>
      <Row label="反应补偿" hint={`打点时自动提前 ${s.tapCompensation.toFixed(2)} 秒，抵消按键反应时间`}>
        <input type="range" min={0} max={0.5} step={0.05} value={s.tapCompensation} onChange={(e) => s.set({ tapCompensation: +e.target.value })} />
      </Row>
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ["空格", "播放 / 暂停"],
  ["← / →", "后退 / 前进（可在“播放”中设置步长）"],
  ["J / L", "后退 / 前进 15 秒"],
  ["↑ / ↓", "音量 + / −"],
  ["M", "静音"],
  ["⌘← / ⌘→", "上一曲 / 下一曲"],
  ["⌘O", "打开文件"],
  ["⌘,", "设置"],
  ["Y", "打开歌词页"],
  ["E", "歌词编辑器"],
  ["I", "视频详细信息"],
  ["F", "全屏（视频）"],
  ["S", "视频截图"],
  [", / .", "逐帧后退 / 前进（视频暂停时）"],
  ["[ / ]", "减速 / 加速"],
  ["A", "A-B 循环"],
  ["Esc", "返回 / 关闭 / 退出全屏"],
];

function Shortcuts() {
  return (
    <div className="kbd-list">
      {SHORTCUTS.map(([k, d]) => (
        <div key={k} style={{ display: "contents" }}>
          <kbd>{k}</kbd>
          <span>{d}</span>
        </div>
      ))}
    </div>
  );
}

function About() {
  const reset = () => {
    const keep = useSettings.getState();
    useSettings.setState({ ...defaultSettings, recent: keep.recent, positions: keep.positions, lyricOffsets: keep.lyricOffsets });
  };
  return (
    <>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div className="empty" style={{ height: "auto", padding: 0 }}>
          <div className="logo" style={{ width: 56, height: 56, borderRadius: 16 }}>
            <Icon name="play" size={26} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>LightPlayer</div>
          <div className="muted">版本 0.1.0</div>
        </div>
      </div>
      <p className="note" style={{ marginTop: 16 }}>
        一款轻量的桌面多媒体播放器：几乎支持所有音视频格式（由 FFmpeg 提供解码 / 转码），支持同名歌词自动加载、手动打标制作歌词，
        并内置基于 Whisper（whisper.cpp）的本地离线歌词识别。
      </p>
      <p className="note">
        第三方组件：Tauri、React、FFmpeg（LGPL/GPL）、whisper.cpp（MIT）、OpenAI Whisper 模型权重（MIT）、Silero VAD（MIT）、hls.js（Apache-2.0）。
      </p>
      <h3>重置</h3>
      <Row label="恢复默认设置" hint="不会删除歌词、模型和播放记录">
        <button className="btn danger" onClick={reset}>
          恢复默认
        </button>
      </Row>
    </>
  );
}

export function SettingsDialog() {
  const tab = useUI((s) => s.settingsTab);
  const close = () => useUI.setState({ overlay: null });
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog wide" style={{ height: "min(680px, calc(100vh - 48px))" }}>
        <header>
          <h2>设置</h2>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="settings">
          <nav>
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => useUI.setState({ settingsTab: t.id })}>
                <Icon name={t.icon} size={17} /> {t.label}
              </button>
            ))}
          </nav>
          <div className="pane">
            {tab === "appearance" && <Appearance />}
            {tab === "playback" && <Playback />}
            {tab === "lyrics" && <LyricsSettings />}
            {tab === "asr" && (
              <>
                <h3>识别模型</h3>
                <ModelManager />
                <h3>识别选项</h3>
                <AsrOptions />
              </>
            )}
            {tab === "shortcuts" && <Shortcuts />}
            {tab === "about" && <About />}
          </div>
        </div>
      </div>
    </div>
  );
}
