import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import * as C from "../core/controller";
import { formatTime } from "../lib/format";
import { usePlayer, usePlaylist, useSubtitles, useUI } from "../stores/player";
import { NETEASE_QUALITIES, useSettings } from "../stores/settings";
import { isCloudPath } from "../lib/ipc";
import { useLibrary } from "../stores/library";
import { loadNeteaseLiked, useNetease, useNeteaseLiked } from "../stores/netease";
import { Icon, SkipIcon, type IconName } from "./Icon";
import { Popover } from "./Popover";
import { togglePlaylist, usePlaylistShown } from "./PlaylistPanel";
import { toggleComments } from "./CommentsPanel";
import { setDesktopLyrics } from "../core/desktopLyrics";
import { Slider } from "./Slider";
import { Marquee } from "./Marquee";
import { tip } from "./Tooltip";
import { keys } from "../lib/platform";
import { fitRow, type RowFit } from "../lib/fit";

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
    <div className="progress-row" data-lp="progress">
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

function volumeIcon(volume: number, muted: boolean): IconName {
  return muted || volume === 0 ? "mute" : volume < 0.5 ? "volumeLow" : "volume";
}

function Volume() {
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  return (
    <div className="volume" data-lp="volume" data-slot="volume">
      <button className="icon-btn" onClick={C.toggleMute} {...tip(muted ? "取消静音" : "静音", "M")}>
        <Icon name={volumeIcon(volume, muted)} />
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

/** Narrow windows: a volume button whose slider pops up on hover or click. */
function CompactVolume() {
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const leave = useRef<number | undefined>(undefined);
  const open = hover || pinned;
  useEffect(() => {
    if (!pinned) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPinned(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setPinned(false);
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k);
    };
  }, [pinned]);
  useEffect(() => () => window.clearTimeout(leave.current), []);
  const wheel = (e: { deltaY: number }) => C.setVolume(volume + (e.deltaY < 0 ? 0.05 : -0.05));
  return (
    <div
      ref={ref}
      className="volume compact popover-wrap"
      data-lp="volume"
      data-slot="volume-icon"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        window.clearTimeout(leave.current);
        setHover(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        leave.current = window.setTimeout(() => setHover(false), 250);
      }}
      onWheel={wheel}
    >
      <button
        className={`icon-btn ${open ? "active" : ""}`}
        onClick={() => setPinned((p) => !p)}
        aria-label="音量"
        aria-expanded={open}
      >
        <Icon name={volumeIcon(volume, muted)} />
      </button>
      {open && (
        <div className="popover vol-pop">
          <div className="vol-value">{muted ? "静音" : `${Math.round(volume * 100)}%`}</div>
          <Slider value={muted ? 0 : volume} max={1} live vertical onCommit={(v) => C.setVolume(v)} ariaLabel="音量" />
          <button className={`icon-btn small ${muted ? "active" : ""}`} onClick={C.toggleMute} {...tip(muted ? "取消静音" : "静音", "M")}>
            <Icon name={muted ? "mute" : "volume"} size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function sleepValue(sleep: { until: number | null; endOfTrack: boolean }) {
  if (sleep.endOfTrack) return "本曲结束后";
  if (sleep.until === null) return "关闭";
  return `${Math.max(0, Math.ceil((sleep.until - Date.now()) / 60000))} 分钟`;
}

function SleepItems({ close }: { close: () => void }) {
  const sleep = usePlayer((s) => s.sleep);
  const active = sleep.until !== null || sleep.endOfTrack;
  return (
    <>
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
  );
}

function SleepMenu() {
  const sleep = usePlayer((s) => s.sleep);
  const active = sleep.until !== null || sleep.endOfTrack;
  const left = sleep.until ? Math.max(0, Math.ceil((sleep.until - Date.now()) / 60000)) : null;
  return (
    <Popover
      trigger={(_, t) => (
        <button className={`icon-btn ${active ? "active" : ""}`} onClick={t} {...tip("睡眠定时")}>
          <Icon name="timer" />
          {left !== null && <span className="badge">{left}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="label">睡眠定时（到时渐弱暂停）</div>
          <SleepItems close={close} />
        </>
      )}
    </Popover>
  );
}

const rateValue = (r: number) => (r === 1 ? "正常" : `${r}×`);

function RateItems({ close }: { close: () => void }) {
  const rate = useSettings((s) => s.rate);
  return (
    <>
      {RATES.map((r) => (
        <div key={r} className={`item ${r === rate ? "selected" : ""}`} onClick={() => (C.setRate(r), close())}>
          {rateValue(r)}
          {r === rate && <Icon name="check" size={16} />}
        </div>
      ))}
    </>
  );
}

function RateMenu() {
  const rate = useSettings((s) => s.rate);
  return (
    <Popover
      trigger={(_, t) => (
        <button className={`icon-btn ${rate !== 1 ? "active" : ""}`} onClick={t} {...tip("播放速度", "[ / ]")}>
          {rate === 1 ? <Icon name="speed" /> : <span style={{ fontSize: 11.5, fontWeight: 700 }}>{rate}×</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="label">播放速度</div>
          <RateItems close={close} />
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

function useQualityLabel() {
  const quality = useSettings((s) => s.netease.quality);
  const index = Math.max(0, NETEASE_QUALITIES.findIndex(([q]) => q === quality));
  return NETEASE_QUALITIES[index][1];
}

function QualityPanel({ label }: { label?: boolean }) {
  const quality = useSettings((s) => s.netease.quality);
  const got = usePlayer((s) => s.media?.quality);
  const switching = usePlayer((s) => s.qualitySwitch !== null);
  const loading = usePlayer((s) => s.loading) || switching;
  const index = Math.max(0, NETEASE_QUALITIES.findIndex(([q]) => q === quality));
  const lower = !!got?.level && (LEVEL_RANK[got.level] ?? 9) < (LEVEL_RANK[quality] ?? 0);
  return (
    <div className="q-menu">
      {label && <div className="label">音质</div>}
      <QualitySlider value={index} onChange={(i) => void C.setNeteaseQuality(NETEASE_QUALITIES[i][0])} />
      <div className="q-now">
        {loading ? (
          "正在准备新音质，当前播放不会中断…"
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
  );
}

function QualityMenu() {
  const label = useQualityLabel();
  return (
    <Popover
      trigger={(_, t) => (
        <button className="icon-btn q-btn" onClick={t} {...tip("音质（网易云音乐）")}>
          {label}
        </button>
      )}
    >
      {() => <QualityPanel label />}
    </Popover>
  );
}

function SubtitleItems({ close }: { close: () => void }) {
  const { tracks, active } = useSubtitles();
  return (
    <>
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
  );
}

function SubtitleMenu() {
  const { active } = useSubtitles();
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
          <SubtitleItems close={close} />
        </>
      )}
    </Popover>
  );
}

function FavButton({ path }: { path: string }) {
  const cloud = isCloudPath(path);
  const local = useLibrary((s) => s.data.favorites.includes(path));
  const liked = useNeteaseLiked(path);
  const fav = cloud ? liked : local;
  const unknown = useNetease((s) => s.liked === null);
  useEffect(() => {
    if (cloud && unknown) void loadNeteaseLiked();
  }, [cloud, unknown]);
  return (
    <button
      className={`icon-btn small fav ${fav ? "on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        void C.toggleFavorite(path, !fav);
      }}
      {...tip(cloud ? (fav ? "从“我喜欢的音乐”中移除" : "添加到“我喜欢的音乐”") : fav ? "取消收藏" : "收藏")}
    >
      <Icon name={fav ? "heartFill" : "heart"} size={16} />
    </button>
  );
}

type Sub = "quality" | "rate" | "sleep" | "subtitle";

const SUB_TITLES: Record<Sub, string> = { quality: "音质", rate: "播放速度", sleep: "睡眠定时", subtitle: "字幕" };

interface MenuRow {
  icon: IconName;
  label: string;
  /** Current value, shown on the right. */
  value?: string;
  /** Checked toggle. */
  on?: boolean;
  kbd?: string;
  disabled?: boolean;
  sub?: Sub;
  run?: () => void;
}

/** A button that may move into the "more" menu when the bar is narrow. */
interface Slot {
  id: string;
  node: ReactNode;
  row: MenuRow;
}

function MoreMenu({ rows, active }: { rows: MenuRow[]; active: boolean }) {
  const [sub, setSub] = useState<Sub | null>(null);
  return (
    <div className="tb-slot" data-slot="more">
      <Popover
        trigger={(open, t) => (
          <button
            className={`icon-btn more-btn ${active || open ? "active" : ""}`}
            onClick={() => (setSub(null), t())}
            {...tip("更多")}
          >
            <Icon name="more" />
          </button>
        )}
      >
        {(close) =>
          sub ? (
            <div className="more-menu">
              <div className="item more-back" onClick={() => setSub(null)}>
                <Icon name="chevronLeft" size={16} />
                <span className="more-label">{SUB_TITLES[sub]}</span>
              </div>
              <div className="sep" />
              {sub === "quality" && <QualityPanel />}
              {sub === "rate" && <RateItems close={close} />}
              {sub === "sleep" && <SleepItems close={close} />}
              {sub === "subtitle" && <SubtitleItems close={close} />}
            </div>
          ) : (
            <div className="more-menu">
              {rows.map((r) => (
                <div
                  key={r.label}
                  className={`item ${r.on ? "selected" : ""} ${r.disabled ? "disabled" : ""}`}
                  onClick={() => {
                    if (r.disabled) return;
                    if (r.sub) setSub(r.sub);
                    else {
                      r.run?.();
                      close();
                    }
                  }}
                >
                  <Icon name={r.icon} size={18} />
                  <span className="more-label">{r.label}</span>
                  {r.value && <span className="more-value">{r.value}</span>}
                  {r.on && <Icon name="check" size={16} />}
                  {r.kbd && <kbd>{keys(r.kbd)}</kbd>}
                  {r.sub && <Icon name="chevronRight" size={16} />}
                </div>
              ))}
            </div>
          )
        }
      </Popover>
    </div>
  );
}

function TransportRight({ abRef }: { abRef: RefObject<HTMLButtonElement | null> }) {
  const media = usePlayer((s) => s.media);
  const ab = usePlayer((s) => s.abLoop);
  const sleep = usePlayer((s) => s.sleep);
  const rate = useSettings((s) => s.rate);
  const desktopLyrics = useSettings((s) => s.desktopLyrics.enabled);
  const commentsOpen = useUI((s) => s.commentsOpen);
  const fullscreen = useUI((s) => s.fullscreen);
  const playlistShown = usePlaylistShown();
  const subs = useSubtitles();
  const quality = useQualityLabel();
  const isVideo = media?.kind === "video";
  const cloud = isCloudPath(media?.path);

  const slots: Slot[] = [];
  if (cloud) {
    slots.push({ id: "quality", node: <QualityMenu />, row: { icon: "sparkles", label: "音质", value: quality, sub: "quality" } });
    slots.push({
      id: "comments",
      node: (
        <button
          className={`icon-btn cm-toggle ${commentsOpen ? "active" : ""}`}
          onClick={() => toggleComments()}
          {...tip(commentsOpen ? "收起评论" : "网易云评论", "C")}
        >
          <Icon name="comment" />
        </button>
      ),
      row: { icon: "comment", label: "网易云评论", on: commentsOpen, kbd: "C", run: () => toggleComments() },
    });
  }
  slots.push({ id: "rate", node: <RateMenu />, row: { icon: "speed", label: "播放速度", value: rateValue(rate), sub: "rate" } });
  slots.push({ id: "sleep", node: <SleepMenu />, row: { icon: "timer", label: "睡眠定时", value: sleepValue(sleep), sub: "sleep" } });
  if (media?.kind === "audio") {
    slots.push({
      id: "desktop-lyrics",
      node: (
        <button
          className={`icon-btn ${desktopLyrics ? "active" : ""}`}
          onClick={() => setDesktopLyrics(!desktopLyrics)}
          {...tip(desktopLyrics ? "关闭桌面歌词" : "桌面歌词（悬浮在所有窗口之上）")}
        >
          <Icon name="desktopLyrics" />
        </button>
      ),
      row: { icon: "desktopLyrics", label: "桌面歌词", on: desktopLyrics, run: () => setDesktopLyrics(!desktopLyrics) },
    });
  }
  if (isVideo) {
    slots.push({
      id: "subtitles",
      node: <SubtitleMenu />,
      row: { icon: "subtitles", label: "字幕", value: subs.active >= 0 ? subs.tracks[subs.active]?.label : "关闭", sub: "subtitle" },
    });
    slots.push({
      id: "screenshot",
      node: (
        <button className="icon-btn" onClick={C.screenshot} {...tip("截图", "S")}>
          <Icon name="camera" />
        </button>
      ),
      row: { icon: "camera", label: "截图", kbd: "S", run: C.screenshot },
    });
    slots.push({
      id: "info",
      node: (
        <button className="icon-btn" onClick={() => useUI.setState({ overlay: "videoInfo" })} {...tip("视频详细信息", "I")}>
          <Icon name="info" />
        </button>
      ),
      row: { icon: "info", label: "视频详细信息", kbd: "I", run: () => useUI.setState({ overlay: "videoInfo" }) },
    });
  }

  const ref = useRef<HTMLDivElement>(null);
  const widths = useRef<Record<string, number>>({});
  const [fit, setFit] = useState<RowFit & { abHidden: boolean }>({ fold: 0, compactVolume: false, abHidden: false });
  const ids = slots.map((s) => s.id).join(" ");

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const known = widths.current;
    let pinned = 0;
    for (const c of Array.from(el.children) as HTMLElement[]) {
      const w = c.offsetWidth;
      if (c.dataset.slot) known[c.dataset.slot] = w;
      else if (w) pinned += w + gap;
    }
    const width = (id: string, d: number) => {
      const w = known[id] ?? d;
      return w ? w + gap : 0;
    };
    const abHidden = !!abRef.current && getComputedStyle(abRef.current).display === "none";
    const next = {
      ...fitRow({
        avail: el.clientWidth + gap,
        items: ids ? ids.split(" ").map((id) => width(id, 34)) : [],
        pinned,
        volume: width("volume", 132),
        volumeIcon: width("volume-icon", 34),
        more: width("more", 34),
        alwaysMore: abHidden,
      }),
      abHidden,
    };
    setFit((f) => (f.fold === next.fold && f.compactVolume === next.compactVolume && f.abHidden === next.abHidden ? f : next));
  }, [ids, abRef]);

  useLayoutEffect(measure);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const folded = slots.slice(0, fit.fold);
  const rows = folded.map((s) => s.row);
  if (fit.abHidden) {
    rows.push({
      icon: "ab",
      label: ab.a === null ? "A-B 段落循环：设置 A 点" : ab.b === null ? "A-B 段落循环：设置 B 点" : "关闭 A-B 循环",
      kbd: "A",
      disabled: !media,
      run: C.cycleAbLoop,
    });
  }
  const moreActive =
    (fit.abHidden && ab.a !== null) ||
    folded.some(
      (s) =>
        s.row.on ||
        (s.id === "rate" && rate !== 1) ||
        (s.id === "sleep" && (sleep.until !== null || sleep.endOfTrack)) ||
        (s.id === "subtitles" && subs.active >= 0),
    );

  return (
    <div className="right" data-lp="transport-right" ref={ref}>
      {rows.length > 0 && <MoreMenu rows={rows} active={moreActive} />}
      {slots.slice(fit.fold).map((s) => (
        <div key={s.id} className="tb-slot" data-slot={s.id}>
          {s.node}
        </div>
      ))}
      <button
        className={`icon-btn pl-toggle ${playlistShown ? "active" : ""}`}
        onClick={() => togglePlaylist()}
        {...tip(playlistShown ? "收起播放列表" : "显示播放列表")}
      >
        <Icon name="list" />
      </button>
      {fit.compactVolume ? <CompactVolume /> : <Volume />}
      {isVideo && (
        <button className="icon-btn" onClick={() => toggleFullscreen()} {...tip(fullscreen ? "退出全屏" : "全屏", fullscreen ? "Esc" : "F")}>
          <Icon name={fullscreen ? "exitFullscreen" : "fullscreen"} />
        </button>
      )}
    </div>
  );
}

export function TransportBar() {
  const media = usePlayer((s) => s.media);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const ab = usePlayer((s) => s.abLoop);
  const mode = usePlaylist((s) => s.mode);
  const count = usePlaylist((s) => s.items.length);
  const page = useUI((s) => s.page);
  const jump = useSettings((s) => s.jumpStep);
  const isVideo = media?.kind === "video";
  const title = media ? media.meta?.title || media.name : "LightPlayer";
  const artist = media ? (media.kind === "audio" ? media.meta?.artist : media.fileName) : "未在播放";
  const m = MODE_META[mode];
  const abRef = useRef<HTMLButtonElement>(null);

  return (
    <footer className="transport panel" data-lp="transport">
      <ProgressRow />
      <div className="controls" data-lp="transport-controls">
        <div
          className="mini"
          data-lp="transport-now"
          onClick={() => {
            // Audio: the player page first, the lyrics from there.
            if (media?.kind === "audio") useUI.setState({ page: page === "player" ? "lyrics" : "player" });
            else if (media && page !== "player") useUI.setState({ page: "player" });
          }}
          {...(!media
            ? {}
            : page !== "player"
              ? tip(isVideo ? "返回视频播放页" : "返回播放页")
              : media.kind === "audio"
                ? tip("打开歌词", "Y")
                : {})}
        >
          <div className="thumb">
            {media?.meta?.cover ? <img src={media.meta.cover} alt="" /> : <Icon name={isVideo ? "film" : "music"} />}
          </div>
          <div className="meta">
            <Marquee className="t" raw>
              {title}
            </Marquee>
            {/* "Not playing" is UI text, the rest is the song's. */}
            {artist && (
              <Marquee className="a" raw={!!media}>
                {artist}
              </Marquee>
            )}
          </div>
          {media && <FavButton path={media.path} />}
        </div>

        <div className="center" data-lp="transport-center">
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
            ref={abRef}
            className={`icon-btn hide-narrow ${ab.a !== null ? "active" : ""}`}
            onClick={C.cycleAbLoop}
            disabled={!media}
            {...tip(ab.a === null ? "A-B 段落循环：设置 A 点" : ab.b === null ? "A-B 段落循环：设置 B 点" : "关闭 A-B 循环", "A")}
          >
            <Icon name="ab" />
          </button>
        </div>

        <TransportRight abRef={abRef} />
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
