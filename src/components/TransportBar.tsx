import * as C from "../core/controller";
import { formatTime } from "../lib/format";
import { usePlayer, usePlaylist, useSubtitles, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useLibrary } from "../stores/library";
import { Icon, SkipIcon, type IconName } from "./Icon";
import { Popover } from "./Popover";
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
  const playlistOpen = useSettings((s) => s.playlistOpen);
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
          onClick={() => media?.kind === "audio" && useUI.setState({ page: page === "lyrics" ? "player" : "lyrics" })}
          {...(media?.kind === "audio" ? tip("打开歌词", "Y") : {})}
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
          <RateMenu />
          <SleepMenu />
          {media?.kind === "audio" && (
            <button
              className={`icon-btn ${page === "lyrics" ? "active" : ""}`}
              onClick={() => useUI.setState({ page: page === "lyrics" ? "player" : "lyrics" })}
              {...tip(page === "lyrics" ? "返回播放页" : "歌词", "Y")}
            >
              <Icon name="lyrics" />
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
            className={`icon-btn pl-toggle ${playlistOpen ? "active" : ""}`}
            onClick={() => {
              useSettings.getState().set({ playlistOpen: page === "lyrics" ? true : !playlistOpen });
              useUI.setState({ page: "player" });
            }}
            {...tip(playlistOpen && page !== "lyrics" ? "收起播放列表" : "显示播放列表")}
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
