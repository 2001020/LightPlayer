import { useEffect, useState } from "react";
import * as C from "../core/controller";
import { describeCode, PREVIEWS } from "../core/weather/scene";
import { refreshWeather } from "../core/weather/service";
import { api, isTauri, localFileUrl, pickBrowserFiles, type CityHit, type FileAssociations } from "../lib/ipc";
import { useWeather } from "../stores/weather";
import { toast, useUI, type UIState } from "../stores/player";
import { ACCENT_PRESETS, defaultSettings, useSettings, LYRIC_SIZE_MAX, LYRIC_SIZE_MIN } from "../stores/settings";
import { ColorChoices } from "./ColorChoices";
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

function CitySearch({ onPick }: { onPick: (c: CityHit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CityHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits(null);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      setBusy(true);
      api
        .weatherSearch(query)
        .then((h) => live && (setHits(h), setErr(null)))
        .catch((e) => live && setErr(String(e)))
        .finally(() => live && setBusy(false));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="city-search">
      <input type="text" placeholder="输入城市名，例如 杭州" value={q} onChange={(e) => setQ(e.target.value)} />
      {(busy || err || hits) && (
        <div className="city-hits">
          {busy && <div className="muted">正在搜索…</div>}
          {err && <div className="muted">搜索失败：{err}</div>}
          {!busy && hits && !hits.length && <div className="muted">没有找到这个城市</div>}
          {!busy &&
            hits?.map((h) => (
              <button
                key={`${h.lat},${h.lon}`}
                className="city-hit"
                onClick={() => {
                  onPick(h);
                  setQ("");
                }}
              >
                <b>{h.name}</b>
                <span>{h.region}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function WeatherOptions() {
  const w = useSettings((s) => s.weather);
  const setWeather = useSettings((s) => s.setWeather);
  const report = useWeather((s) => s.report);
  const place = useWeather((s) => s.place);
  const status = useWeather((s) => s.status);
  const error = useWeather((s) => s.error);
  const preview = useWeather((s) => s.preview);
  const busy = status === "locating" || status === "loading";
  const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  let state: string;
  if (status === "locating") state = "正在定位…";
  else if (status === "loading") state = "正在获取天气…";
  else if (status === "error") state = `获取失败：${error}`;
  else if (report) state = `${report.place}，${describeCode(report.code).label}，${Math.round(report.temperature)}°，更新于 ${time(report.fetchedAt)}`;
  else state = "还没有天气数据";
  const autoNote =
    w.source === "auto" && place
      ? place.source === "gps"
        ? "已使用系统定位"
        : `${place.note ? `${place.note}，` : ""}已改用网络大致位置。可在 系统设置 > 隐私与安全性 > 定位服务 中允许 LightPlayer`
      : null;
  return (
    <>
      <h3>天气</h3>
      <Row label="位置" hint={w.source === "city" ? (w.city ? `已选择：${w.city.name}` : "请搜索并选择一个城市") : autoNote ?? "使用系统定位服务；无法定位时改用网络大致位置"}>
        <Seg value={w.source} options={[["auto", "自动定位"], ["city", "指定城市"]]} onChange={(source) => setWeather({ source })} />
      </Row>
      {w.source === "city" && (
        <Row label="搜索城市">
          <CitySearch onPick={(c) => setWeather({ city: { name: c.name, lat: c.lat, lon: c.lon } })} />
        </Row>
      )}
      <Row label="当前天气" hint={state}>
        <button className="btn" disabled={busy} onClick={() => void refreshWeather(true)}>
          <Icon name="refresh" size={14} /> 刷新
        </button>
      </Row>
      <Row label="动态效果" hint="雨、雪、冰雹、云和闪电的动画，雨雪会落在播放栏等界面元素上；关闭后只显示静态天空">
        <Switch on={w.motion} onChange={(motion) => setWeather({ motion })} />
      </Row>
      <Row label="效果预览" hint="临时查看其他天气的效果，不会保存">
        <select value={preview ?? ""} onChange={(e) => useWeather.setState({ preview: e.target.value || null })}>
          <option value="">实时天气</option>
          {PREVIEWS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Row>
      <p className="note">天气数据来自 Open-Meteo，地名来自 BigDataCloud，都无需账号；位置只用于查询天气，不会保存到别处。</p>
    </>
  );
}

function Appearance() {
  const s = useSettings();
  const weather = s.theme === "weather";
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (s.background.path) localFileUrl(s.background.path).then(setPreview);
    else setPreview(null);
  }, [s.background.path]);

  const pickBackground = async () => {
    if (!isTauri) {
      const [p] = await pickBrowserFiles("image/*", false);
      if (p) s.setBackground({ path: p });
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
        <Seg
          value={s.theme}
          options={[["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"], ["weather", "天气"]]}
          onChange={(theme) => s.set({ theme })}
        />
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

      {weather && <WeatherOptions />}

      <h3>背景</h3>
      {weather && <p className="note">天气主题下由实时天气效果作为背景，以下设置在切换回其他主题后生效。</p>}
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

/** "Open with LightPlayer by default" for audio and video (macOS). */
function DefaultPlayer() {
  const [st, setSt] = useState<FileAssociations | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => void api.fileAssociations().then((r) => setSt(r ?? null), () => setSt(null));
  useEffect(refresh, []);
  if (!st?.supported) return null;
  const count = (k: FileAssociations["audio"]) => `${k.ours.length}/${k.ours.length + k.others.length}`;
  const done = !st.audio.others.length && !st.video.others.length;
  const apply = async () => {
    setBusy(true);
    try {
      const failed = await api.setFileAssociations(true, true);
      if (failed.length) toast(`部分格式未能设置：${failed.join("，")}`, "error", 6000);
      else toast("已设为默认播放器，双击音频或视频文件会直接用 LightPlayer 播放", "success");
    } catch (e) {
      toast(`设置失败：${String(e)}`, "error");
    } finally {
      setBusy(false);
      refresh();
    }
  };
  return (
    <>
      <h3>文件关联</h3>
      <Row
        label="设为默认播放器"
        hint={`双击 mp3、flac、mp4、mkv 等音频和视频文件时直接用 LightPlayer 播放。目前默认用 LightPlayer 打开的格式：音频 ${count(st.audio)}，视频 ${count(st.video)}`}
      >
        <button className="btn" disabled={busy} onClick={() => void apply()}>
          {busy ? "正在设置…" : done ? "重新设置" : "一键设置"}
        </button>
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
      <h3>媒体库</h3>
      <Row label="启动时自动刷新媒体库" hint="检查已添加文件夹中新增、修改或删除的文件">
        <Switch on={s.libraryAutoRescan} onChange={(libraryAutoRescan) => s.set({ libraryAutoRescan })} />
      </Row>
      <Row label="自动记录播放过的文件" hint="不在媒体库文件夹里的文件，播放后也会出现在媒体库中">
        <Switch on={s.libraryRecordPlays} onChange={(libraryRecordPlays) => s.set({ libraryRecordPlays })} />
      </Row>
      <Row label="管理媒体库文件夹">
        <button className="btn" onClick={() => useUI.setState({ overlay: "libraryFolders" })}>
          打开
        </button>
      </Row>
      <DefaultPlayer />
      <h3>后台与菜单栏</h3>
      <Row label="关闭窗口后继续在后台播放" hint="点窗口左上角的红色按钮只会隐藏窗口；用顶部菜单栏图标或程序坞可以重新打开，从菜单栏图标选择“退出”才会完全退出">
        <Switch on={s.runInBackground} onChange={(runInBackground) => s.set({ runInBackground })} />
      </Row>
      <Row label="在菜单栏图标旁显示歌名">
        <Switch on={s.trayShowTitle} onChange={(trayShowTitle) => s.set({ trayShowTitle })} />
      </Row>

      <h3>隐私</h3>
      <Row
        label="无痕浏览模式"
        hint="开启后，打开的文件不会出现在最近播放中，不记录播放次数和播放位置，也不会自动加入媒体库。也可以按 ⇧⌘N 或在菜单栏图标中切换"
      >
        <Switch on={s.privateMode} onChange={(on) => C.setPrivateMode(on)} />
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
        <input type="range" min={LYRIC_SIZE_MIN} max={LYRIC_SIZE_MAX} value={s.lyricFontSize} onChange={(e) => s.set({ lyricFontSize: +e.target.value })} />
      </Row>
      <Row label="对齐方式">
        <Seg value={s.lyricAlign} options={[["center", "居中"], ["left", "左对齐"]]} onChange={(lyricAlign) => s.set({ lyricAlign })} />
      </Row>
      <Row label="显示翻译" hint="同一时间点的第二行歌词作为翻译显示">
        <Switch on={s.showTranslation} onChange={(showTranslation) => s.set({ showTranslation })} />
      </Row>
      <Row label="当前歌词高亮颜色" hint="歌词页中正在唱的那一行">
        <ColorChoices value={s.lyricHighlight} onChange={(lyricHighlight) => s.set({ lyricHighlight })} allowDefault="跟随主题色" />
      </Row>
      <Row label="逐字高亮（卡拉 OK）" hint="歌词包含逐字时间时生效">
        <Switch on={s.karaoke} onChange={(karaoke) => s.set({ karaoke })} />
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
  ["⌘L", "媒体库"],
  ["⌘,", "设置"],
  ["⇧⌘N", "开启 / 关闭无痕浏览"],
  ["Y", "打开歌词页"],
  ["E", "歌词编辑器"],
  ["⌘+ / ⌘− / ⌘0", "歌词字号放大 / 缩小 / 恢复"],
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
          <div className="muted">版本 {__APP_VERSION__}</div>
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
                <div className="row-actions">
                  <span className="muted">识别歌词和字幕的任务会排队依次进行。</span>
                  <button className="btn small" onClick={() => useUI.setState({ overlay: "asrTasks" })}>
                    <Icon name="list" size={14} /> 查看识别任务
                  </button>
                </div>
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
