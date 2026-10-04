import { useRef, useState } from "react";
import * as C from "../core/controller";
import { formatTime } from "../lib/format";
import { usePlayer, usePlaylist, useSubtitles, useUI } from "../stores/player";
import { NETEASE_QUALITIES, useSettings } from "../stores/settings";
import { isCloudPath } from "../lib/ipc";
import { useLibrary } from "../stores/library";
import { Icon, SkipIcon, type IconName } from "./Icon";
import { Popover } from "./Popover";
import { togglePlaylist, usePlaylistShown } from "./PlaylistPanel";
import { setDesktopLyrics } from "../core/desktopLyrics";
import { Slider } from "./Slider";
import { tip } from "./Tooltip";

const MODE_META: Record<string, { icon: IconName; label: string }> = {
  sequential: { icon: "sequential", label: "顺序播放" },
  loop: { icon: "loop", label: "列表循环" },
  single: { icon: "single", label: "单曲循环" },
  shuffle: { icon: "shuffle", label: "随机播放" },
};

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];

function ProgressRow() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const buffered = usePlayer((s) => s.buffered);
  const ab = usePlayer((s) => s.abLoop);
  return (
    <div className="progress-row">
      <span>{formatTime(position)}</span>
      <Slider
        value={position}
        max={duration}
        buffered={buffered}
        ab={ab}
        onCommit={(v) => C.seek(v)}
        format={formatTime}
        ariaLabel="播放进度"
      />
      <span>{formatTime(duration)}</span>
    </div>
  );
}

function Volume() {
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  const icon: IconName = muted || volume === 0 ? "mute" : volume < 0.5 ? "volumeLow" : "volume";
  return (
    <div className="volume">
      <button className="icon-btn" onClick={C.toggleMute} {...tip(muted ? "取消静音" : "静音", "M")}>
        <Icon name={icon} />
      </button>
      <Slider
        value={muted ? 0 : volume}
        max={1}
        live
        onCommit={(v) => C.setVolume(v)}
        format={(v) => `${Math.round(v * 100)}%`}
        ariaLabel="音量"
        onWheelDelta={(d) => C.setVolume(volume + (d > 0 ? 0.05 : -0.05))}
      />
    </div>
  );
}

function SleepMenu() {
  const sleep = usePlayer((s) => s.sleep);
  const active = sleep.until !== null || sleep.endOfTrack;
  const left = sleep.until ? Math.max(0, Math.ceil((sleep.until - Date.now()) / 60000)) : null;
  return (
    <Popover
      trigger={(_, t) => (
        <button className={`icon-btn hide-narrow ${active ? "active" : ""}`} onClick={t} {...tip("睡眠定时")}>
          <Icon name="timer" />
          {left !== null && <span className="badge">{left}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="label">睡眠定时（到时渐弱暂停）</div>
          {[15, 30, 45, 60, 90].map((m) => (
            <div key={m} className="item" onClick={() => (C.setSleepTimer(m), close())}>
              {m} 分钟
            </div>
          ))}
          <div className={`item ${sleep.endOfTrack ? "selected" : ""}`} onClick={() => (C.setSleepTimer("end"), close())}>
            本曲结束后
          </div>
          {active && (
            <>
              <div className="sep" />
              <div className="item" onClick={() => (C.setSleepTimer(null), close())}>
                取消定时
              </div>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

function RateMenu() {
  const rate = useSettings((s) => s.rate);
  return (
    <Popover
      trigger={(_, t) => (
        <button className={`icon-btn hide-narrow ${rate !== 1 ? "active" : ""}`} onClick={t} {...tip("播放速度", "[ / ]")}>
          {rate === 1 ? <Icon name="speed" /> : <span style={{ fontSize: 11.5, fontWeight: 700 }}>{rate}×</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="label">播放速度</div>
          {RATES.map((r) => (
            <div key={r} className={`item ${r === rate ? "selected" : ""}`} onClick={() => (C.setRate(r), close())}>
              {r === 1 ? "正常" : `${r}×`}
              {r === rate && <Icon name="check" size={16} />}
            </div>
          ))}
        </>
      )}
    </Popover>
  );
}

/** NetEase level names, including ones only some songs have. */
const LEVEL_NAMES: Record<string, string> = {
  ...Object.fromEntries(NETEASE_QUALITIES),
  higher: "较高",
  jyeffect: "高清环绕声",
  sky: "沉浸环绕声",
  jymaster: "超清母带",
};
const LEVEL_RANK: Record<string, number> = { standard: 0, higher: 1, exhigh: 2, lossless: 3, hires: 4 };

/** Four snapping stops, lowest quality on the left; applied on release. */
function QualitySlider({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const last = NETEASE_QUALITIES.length - 1;
  const stopAt = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * last);
  };
  const shown = drag ?? value;
  const pct = (i: number) => `${(i / last) * 100}%`;
  return (
    <div className="q-slider">
      <div
        ref={ref}
        className={`q-track ${drag !== null ? "dragging" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="音质"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={shown}
        aria-valuetext={NETEASE_QUALITIES[shown][1]}
        onPointerDown={(e) => {
          ref.current!.setPointerCapture(e.pointerId);
          setDrag(stopAt(e.clientX));
        }}
        onPointerMove={(e) => drag !== null && setDrag(stopAt(e.clientX))}
        onPointerUp={(e) => {
          if (drag === null) return;
          setDrag(null);
          onChange(stopAt(e.clientX));
        }}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          onChange(Math.min(last, Math.max(0, value + d)));
        }}
      >
        <div className="q-rail" />
        <div className="q-fill" style={{ width: pct(shown) }} />
        {NETEASE_QUALITIES.map((_, i) => (
          <span key={i} className={`q-dot ${i <= shown ? "on" : ""}`} style={{ left: pct(i) }} />
        ))}
        <span className="q-knob" style={{ left: pct(shown) }} />
      </div>
      <div className="q-labels">
        {NETEASE_QUALITIES.map(([q, label], i) => (
          <button key={q} className={i === shown ? "on" : ""} style={{ left: pct(i) }} onClick={() => onChange(i)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function QualityMenu() {
  const quality = useSettings((s) => s.netease.quality);
  const got = usePlayer((s) => s.media?.quality);
  const loading = usePlayer((s) => s.loading);
  const index = Math.max(0, NETEASE_QUALITIES.findIndex(([q]) => q === quality));
  const label = NETEASE_QUALITIES[index][1];
  const lower = !!got?.level && (LEVEL_RANK[got.level] ?? 9) < (LEVEL_RANK[quality] ?? 0);
  return (
    <Popover
      trigger={(_, t) => (
        <button className="icon-btn q-btn" onClick={t} {...tip("音质（网易云音乐）")}>
          {label}
        </button>
      )}
    >
      {() => (
        <div className="q-menu">
          <div className="label">音质</div>
          <QualitySlider value={index} onChange={(i) => void C.setNeteaseQuality(NETEASE_QUALITIES[i][0])} />
          <div className="q-now">
            {loading ? (
              "正在切换…"
            ) : got?.level || got?.kbps ? (
              <>
                当前播放：{LEVEL_NAMES[got.level ?? ""] ?? got.level ?? ""}
                {got.kbps ? ` ${got.kbps} kbps` : ""}
                {lower && <div className="warn">账号或这首歌不支持更高音质</div>}
              </>
            ) : (
              "无损和 Hi-Res 需要会员"
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

function SubtitleMenu() {
  const { tracks, active } = useSubtitles();
  return (
    <Popover
      trigger={(_, t) => (
        <button className={`icon-btn ${active >= 0 ? "active" : ""}`} onClick={t} {...tip("字幕")}>
          <Icon name="subtitles" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="label">字幕</div>
          <div className={`item ${active < 0 ? "selected" : ""}`} onClick={() => (C.selectSubtitle(-1), close())}>
            关闭
          </div>
          {tracks.map((t, i) => (
            <div key={i} className={`item ${i === active ? "selected" : ""}`} onClick={() => (C.selectSubtitle(i), close())}>
              {t.label}
            </div>
          ))}
          <div className="sep" />
          <div className="item" onClick={() => (C.importLyricsWithDialog(), close())}>
            导入字幕文件…
          </div>
          <div className="item" onClick={() => (C.startRecognition(), close())}>
            AI 识别生成字幕…
          </div>
          {tracks.some((t) => t.kind === "ai") && (
            <>
              <div className="item" onClick={() => (C.rerunRecognition(), close())}>
                重新识别（可换模型）…
              </div>
              <div className="item" onClick={() => (void C.removeAiLyrics(), close())}>
                移除 AI 字幕
              </div>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

function FavButton({ path }: { path: string }) {
  const fav = useLibrary((s) => s.data.favorites.includes(path));
  return (
    <button
      className={`icon-btn small fav ${fav ? "on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        void C.toggleFavorite(path, !fav);
      }}
      {...tip(fav ? "取消收藏" : "收藏")}
    >
      <Icon name={fav ? "heartFill" : "heart"} size={16} />
    </button>
  );
}

export function TransportBar() {
  const media = usePlayer((s) => s.media);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const ab = usePlayer((s) => s.abLoop);
  const mode = usePlaylist((s) => s.mode);
  const count = usePlaylist((s) => s.items.length);
  const playlistShown = usePlaylistShown();
  const desktopLyrics = useSettings((s) => s.desktopLyrics.enabled);
  const page = useUI((s) => s.page);
  const fullscreen = useUI((s) => s.fullscreen);
  const jump = useSettings((s) => s.jumpStep);
  const isVideo = media?.kind === "video";
  const title = media ? media.meta?.title || media.name : "LightPlayer";
  const artist = media ? (media.kind === "audio" ? media.meta?.artist : media.fileName) : "未在播放";
  const m = MODE_META[mode];

  return (
    <footer className="transport panel">
      <ProgressRow />
      <div className="controls">
        <div
          className="mini"
          onClick={() => {
            if (media?.kind === "audio") useUI.setState({ page: page === "lyrics" ? "player" : "lyrics" });
            else if (media && page !== "player") useUI.setState({ page: "player" });
          }}
          {...(media?.kind === "audio" ? tip("打开歌词", "Y") : media && page !== "player" ? tip("返回视频播放页") : {})}
        >
          <div className="thumb">
            {media?.meta?.cover ? <img src={media.meta.cover} alt="" /> : <Icon name={isVideo ? "film" : "music"} />}
          </div>
          <div className="meta">
            <div className="t">{title}</div>
            {artist && <div className="a">{artist}</div>}
          </div>
          {media && <FavButton path={media.path} />}
        </div>

        <div className="center">
          <button className="icon-btn" onClick={C.cycleMode} {...tip(`${m.label}（点击切换）`)}>
            <Icon name={m.icon} />
          </button>
          <button className="icon-btn" onClick={() => C.prev()} disabled={!count} {...tip("上一曲", "⌘←")}>
            <Icon name="prev" />
          </button>
          <button className="icon-btn skip-btn" onClick={() => C.seekBy(-jump)} disabled={!media} {...tip(`后退 ${jump} 秒`, "J")}>
            <SkipIcon dir="back" seconds={jump} />
          </button>
          <button className="icon-btn play-btn" onClick={C.toggle} {...tip(playing ? "暂停" : "播放", "空格")}>
            {loading ? <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : <Icon name={playing ? "pause" : "play"} size={22} />}
          </button>
          <button className="icon-btn skip-btn" onClick={() => C.seekBy(jump)} disabled={!media} {...tip(`前进 ${jump} 秒`, "L")}>
            <SkipIcon dir="fwd" seconds={jump} />
          </button>
          <button className="icon-btn" onClick={() => C.next()} disabled={!count} {...tip("下一曲", "⌘→")}>
            <Icon name="next" />
          </button>
          <button
            className={`icon-btn hide-narrow ${ab.a !== null ? "active" : ""}`}
            onClick={C.cycleAbLoop}
            disabled={!media}
            {...tip(ab.a === null ? "A-B 段落循环：设置 A 点" : ab.b === null ? "A-B 段落循环：设置 B 点" : "关闭 A-B 循环", "A")}
          >
            <Icon name="ab" />
          </button>
        </div>

        <div className="right">
          {isCloudPath(media?.path) && <QualityMenu />}
          <RateMenu />
          <SleepMenu />
          {media?.kind === "audio" && (
            <button
              className={`icon-btn ${desktopLyrics ? "active" : ""}`}
              onClick={() => setDesktopLyrics(!desktopLyrics)}
              {...tip(desktopLyrics ? "关闭桌面歌词" : "桌面歌词（悬浮在所有窗口之上）")}
            >
              <Icon name="desktopLyrics" />
            </button>
          )}
          {isVideo && <SubtitleMenu />}
          {isVideo && (
            <button className="icon-btn hide-narrow" onClick={C.screenshot} {...tip("截图", "S")}>
              <Icon name="camera" />
            </button>
          )}
          {isVideo && (
            <button className="icon-btn" onClick={() => useUI.setState({ overlay: "videoInfo" })} {...tip("视频详细信息", "I")}>
              <Icon name="info" />
            </button>
          )}
          <button
            className={`icon-btn pl-toggle ${playlistShown ? "active" : ""}`}
            onClick={() => togglePlaylist()}
            {...tip(playlistShown ? "收起播放列表" : "显示播放列表")}
          >
            <Icon name="list" />
          </button>
          <Volume />
          {isVideo && (
            <button className="icon-btn" onClick={() => toggleFullscreen()} {...tip(fullscreen ? "退出全屏" : "全屏", fullscreen ? "Esc" : "F")}>
              <Icon name={fullscreen ? "exitFullscreen" : "fullscreen"} />
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}

/** Time of the last fullscreen request; window-state syncing waits for its animation. */
export let lastFullscreenToggle = 0;

export async function toggleFullscreen(force?: boolean) {
  const next = force ?? !useUI.getState().fullscreen;
  lastFullscreenToggle = Date.now();
  useUI.setState({ fullscreen: next });
  try {
    const { isTauri } = await import("../lib/ipc");
    if (isTauri) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setFullscreen(next);
    } else if (next) {
      await document.documentElement.requestFullscreen?.();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* ignore */
  }
}
