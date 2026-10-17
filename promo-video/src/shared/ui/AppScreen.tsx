// A faithful, simplified rebuild of the LightPlayer window at its native
// 1280 x 800 size (see src/styles/app.css in the app). Everything is driven
// by props so scenes can animate it frame by frame.

import { Img } from "remotion";
import { coverUrl, genCover, svgUrl } from "../covers";
import { fmtTime, LYRICS, SONGS } from "../data";
import { FONT } from "../fonts";
import { Icon, SkipIcon, type IconName } from "../Icon";
import { ACCENT, THEMES, type Theme, type ThemeName } from "../tokens";
import { Vinyl } from "./Vinyl";

export const APP_W = 1280;
export const APP_H = 800;

export type Page = "library" | "albums" | "player" | "lyrics";

export type AppScreenProps = {
  theme?: ThemeName;
  page?: Page;
  song?: number;
  /** Seconds into the song. */
  time?: number;
  playing?: boolean;
  /** Fractional lyric line: 2.4 means 40% into the third line. */
  lyric?: number;
  /** "plain": app background; "cover": blurred album art; "clear": transparent. */
  backdrop?: "plain" | "cover" | "clear";
  accent?: string;
  /** Cover style on the player page. */
  disc?: "cover" | "vinyl";
  /** Vinyl rotation in degrees. */
  spin?: number;
  /** 0 = tonearm parked, 1 = on the record. */
  arm?: number;
  /** Glass panels for skies and gradients behind the window. */
  glass?: boolean;
  /** Highlighted row in the library. */
  activeRow?: number;
};

const Traffic: React.FC = () => (
  <div style={{ position: "absolute", left: 20, top: 16, display: "flex", gap: 8 }}>
    {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
      <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,.2)" }} />
    ))}
  </div>
);

const Titlebar: React.FC<{ t: Theme; accent: string; file: string | null; page: Page }> = ({ t, accent, file, page }) => {
  const icons: IconName[] = ["library", "sparkles", "folder", "settings"];
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 44 }}>
      <Traffic />
      <div style={{ position: "absolute", left: 86, top: 0, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: `linear-gradient(135deg, ${accent}, #3d8bff)` }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: t.textDim }}>LightPlayer</div>
      </div>
      {file ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: t.textFaint }}>
          {file}
        </div>
      ) : null}
      {icons.map((n, i) => {
        const active = i === 0 && (page === "library" || page === "albums");
        return (
          <div key={n} style={{ position: "absolute", top: 12, left: 1108 + i * 44, width: 20, height: 20, color: active ? accent : t.textDim }}>
            <Icon name={n} size={20} />
            {active ? <div style={{ position: "absolute", left: 8.5, top: 23, width: 3, height: 3, borderRadius: 2, background: accent }} /> : null}
          </div>
        );
      })}
    </div>
  );
};

const Transport: React.FC<{ t: Theme; accent: string; song: number | null; time: number; playing: boolean; glass: boolean }> = ({
  t,
  accent,
  song,
  time,
  playing,
  glass,
}) => {
  const s = song === null ? null : SONGS[song];
  const p = s ? Math.min(1, time / s.duration) : 0;
  const btn = (n: IconName, x: number, on = false) => (
    <div style={{ position: "absolute", left: x - 10, top: 41, color: on ? accent : t.textDim }}>
      <Icon name={n} size={20} />
      {on ? <div style={{ position: "absolute", left: 8.5, top: 23, width: 3, height: 3, borderRadius: 2, background: accent }} /> : null}
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        top: 708,
        height: 82,
        borderRadius: 16,
        background: glass ? "rgba(255,255,255,0.14)" : t.panel,
        border: `1px solid ${glass ? "rgba(255,255,255,0.22)" : t.border}`,
        boxShadow: t.shadow,
        backdropFilter: glass ? "blur(24px) saturate(1.4)" : undefined,
        color: t.text,
      }}
    >
      <div style={{ position: "absolute", left: 19, top: 8, fontSize: 11.5, color: t.textFaint, fontVariantNumeric: "tabular-nums" }}>{fmtTime(time)}</div>
      <div style={{ position: "absolute", left: 87, right: 87, top: 13, height: 4, borderRadius: 2, background: t.track }}>
        <div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 2, background: accent }} />
        <div
          style={{
            position: "absolute",
            left: `calc(${p * 100}% - 6px)`,
            top: -4,
            width: 12,
            height: 12,
            borderRadius: 6,
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,.3)",
            opacity: s ? 1 : 0,
          }}
        />
      </div>
      <div style={{ position: "absolute", right: 19, top: 8, fontSize: 11.5, color: t.textFaint, fontVariantNumeric: "tabular-nums" }}>
        {s ? fmtTime(s.duration) : "0:00"}
      </div>

      <div style={{ position: "absolute", left: 19, top: 30, width: 42, height: 42, borderRadius: 8, overflow: "hidden", background: t.panel2 }}>
        {s ? <Img src={coverUrl(s.cover)} style={{ width: 42, height: 42 }} /> : null}
      </div>
      <div style={{ position: "absolute", left: 71, top: 33, lineHeight: 1.3 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{s ? s.title : "LightPlayer"}</div>
        <div style={{ fontSize: 12, color: t.textDim }}>{s ? s.artist : "未在播放"}</div>
      </div>

      {btn("loop", 503)}
      {btn("prev", 543)}
      <div style={{ position: "absolute", left: 569, top: 37, color: t.textDim }}>
        <SkipIcon dir="back" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 606,
          top: 28,
          width: 48,
          height: 48,
          borderRadius: 24,
          background: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          boxShadow: `0 6px 18px ${accent}66`,
        }}
      >
        <Icon name={playing ? "pause" : "play"} size={22} />
      </div>
      <div style={{ position: "absolute", left: 663, top: 37, color: t.textDim }}>
        <SkipIcon dir="fwd" />
      </div>
      {btn("next", 717)}
      {btn("ab", 758)}

      {btn("speed", 972)}
      {btn("timer", 1008)}
      {btn("desktopLyrics", 1044)}
      {btn("list", 1080, true)}
      {btn("volume", 1116)}
      <div style={{ position: "absolute", left: 1137, width: 94, top: 49, height: 4, borderRadius: 2, background: t.track }}>
        <div style={{ width: "80%", height: "100%", borderRadius: 2, background: accent }} />
      </div>
    </div>
  );
};

const Sidebar: React.FC<{ t: Theme; accent: string; page: Page }> = ({ t, accent, page }) => {
  const items: [IconName, string][] = [
    ["music", "歌曲"],
    ["album", "专辑"],
    ["user", "艺术家"],
    ["film", "视频"],
    ["heart", "收藏"],
    ["clock", "最近播放"],
  ];
  const active = page === "albums" ? 1 : 0;
  return (
    <div style={{ position: "absolute", left: 12, top: 52, width: 206, bottom: 106 }}>
      {items.map(([icon, label], i) => (
        <div
          key={label}
          style={{
            height: 34,
            marginBottom: 2,
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 10px",
            fontSize: 14,
            fontWeight: i === active ? 600 : 400,
            color: i === active ? t.accentText : t.textDim,
            background: i === active ? t.accentSoft : "transparent",
          }}
        >
          <Icon name={icon} size={17} color={i === active ? accent : t.textDim} />
          {label}
        </div>
      ))}
      <div style={{ marginTop: 22, padding: "0 10px", fontSize: 12, fontWeight: 600, color: t.textFaint, display: "flex", justifyContent: "space-between" }}>
        歌单
        <div style={{ display: "flex", gap: 14 }}>
          <Icon name="folderPlus" size={15} color={t.textDim} />
          <Icon name="plus" size={15} color={t.textDim} />
        </div>
      </div>
      {["通勤路上", "夜晚独处", "周末慢时光"].map((n) => (
        <div key={n} style={{ height: 34, display: "flex", alignItems: "center", gap: 12, padding: "0 10px", fontSize: 14, color: t.textDim }}>
          <Icon name="list" size={16} color={t.textDim} />
          {n}
        </div>
      ))}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
        <div style={{ height: 34, display: "flex", alignItems: "center", gap: 12, padding: "0 10px", fontSize: 14, color: t.textDim }}>
          <Icon name="folder" size={16} color={t.textDim} />
          管理文件夹
        </div>
      </div>
    </div>
  );
};

const ALBUMS = [
  ...SONGS.map((s) => ({ title: s.title, artist: s.artist, src: coverUrl(s.cover) })),
  ...[
    ["山间小屋", "青木"],
    ["雨后", "空山"],
    ["远行", "鹿鸣"],
    ["旧时光", "北岸"],
    ["蓝色星球", "云端"],
    ["落日飞行", "风铃"],
  ].map(([title, artist], i) => ({ title, artist, src: svgUrl(genCover(i + 3)) })),
];

const LibraryPanel: React.FC<{ t: Theme; accent: string; page: Page; song: number | null; glass: boolean; activeRow?: number }> = ({
  t,
  accent,
  page,
  song,
  glass,
  activeRow,
}) => {
  const albums = page === "albums";
  return (
    <div
      style={{
        position: "absolute",
        left: 233,
        top: 49,
        right: 11,
        height: 646,
        borderRadius: 14,
        background: glass ? "rgba(255,255,255,0.12)" : t.panel,
        border: `1px solid ${glass ? "rgba(255,255,255,0.2)" : t.border}`,
        backdropFilter: glass ? "blur(24px) saturate(1.4)" : undefined,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 20, top: 16, fontSize: 24, fontWeight: 700, color: t.text }}>{albums ? "专辑" : "歌曲"}</div>
      <div style={{ position: "absolute", left: 20, top: 52, fontSize: 12.5, color: t.textFaint }}>{albums ? "12 张" : "6 首"}</div>
      <div
        style={{
          position: "absolute",
          left: 574,
          top: 36,
          width: 220,
          height: 32,
          borderRadius: 9,
          background: t.panel2,
          border: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px",
          fontSize: 13.5,
          color: t.textFaint,
        }}
      >
        <Icon name="search" size={15} color={t.textFaint} />
        搜索标题、艺术家、专辑
      </div>
      <div
        style={{
          position: "absolute",
          left: 802,
          top: 36,
          height: 32,
          padding: "0 14px",
          borderRadius: 9,
          background: accent,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <Icon name="play" size={14} color="#fff" />
        播放全部
      </div>
      <div
        style={{
          position: "absolute",
          left: 913,
          top: 36,
          height: 30,
          padding: "0 12px",
          borderRadius: 9,
          border: `1px solid ${t.border}`,
          background: t.panelSolid,
          color: t.text,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
        }}
      >
        <Icon name="shuffle" size={14} color={t.text} />
        随机播放
      </div>

      {albums ? (
        <div style={{ position: "absolute", left: 20, top: 92, right: 20, display: "flex", flexWrap: "wrap", columnGap: 19, rowGap: 18 }}>
          {ALBUMS.map((a, i) => (
            <div key={a.title} style={{ width: 150 }}>
              <div style={{ width: 150, height: 150, borderRadius: 10, overflow: "hidden", boxShadow: "0 10px 24px rgba(0,0,0,.18)" }}>
                <Img src={a.src} style={{ width: 150, height: 150 }} />
              </div>
              <div style={{ marginTop: 9, fontSize: 13.5, fontWeight: 600, color: i === song ? t.accentText : t.text }}>{a.title}</div>
              <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>{a.artist}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ position: "absolute", left: 6, right: 6, top: 82 }}>
          <div style={{ height: 32, display: "flex", alignItems: "center", fontSize: 12.5, color: t.textFaint, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ width: 66, textAlign: "right", paddingRight: 10 }}>#</div>
            <div style={{ width: 386 }}>标题</div>
            <div style={{ width: 215 }}>艺术家</div>
            <div style={{ width: 215 }}>专辑</div>
            <div>时长</div>
          </div>
          {SONGS.map((s, i) => {
            const on = i === (activeRow ?? song);
            return (
              <div
                key={s.title}
                style={{
                  height: 44,
                  marginTop: i === 0 ? 4 : 0,
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 10,
                  background: on ? t.accentSoft : "transparent",
                  fontSize: 14,
                  color: t.text,
                }}
              >
                <div style={{ width: 66, textAlign: "right", paddingRight: 10, color: on ? accent : t.textFaint, fontSize: 12.5 }}>
                  {on ? <Icon name="volume" size={14} color={accent} style={{ verticalAlign: "middle" }} /> : i + 1}
                </div>
                <div style={{ width: 386, display: "flex", alignItems: "center", gap: 10, fontWeight: on ? 600 : 400, color: on ? t.accentText : t.text }}>
                  <Img src={coverUrl(s.cover)} style={{ width: 32, height: 32, borderRadius: 6 }} />
                  {s.title}
                </div>
                <div style={{ width: 215, color: t.textDim }}>{s.artist}</div>
                <div style={{ width: 215, color: t.textDim }}>{s.title}</div>
                <div style={{ color: t.textDim, fontVariantNumeric: "tabular-nums" }}>{fmtTime(s.duration)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PlayerPanel: React.FC<{ t: Theme; accent: string; song: number; lyric: number; disc: "cover" | "vinyl"; spin: number; arm: number }> = ({
  t,
  accent,
  song,
  lyric,
  disc,
  spin,
  arm,
}) => {
  const s = SONGS[song];
  const size = disc === "vinyl" ? 330 : 280;
  const line = LYRICS[Math.max(0, Math.floor(lyric)) % LYRICS.length];
  return (
    <>
      <div style={{ position: "absolute", left: 28, top: 52, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: t.text }}>
        <Icon name="chevronLeft" size={18} />
        返回
      </div>
      <div style={{ position: "absolute", right: 28, top: 52, display: "flex", gap: 26, fontSize: 14, color: t.text }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="layout" size={16} />
          布局
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name={disc === "vinyl" ? "vinyl" : "flow"} size={16} />
          {disc === "vinyl" ? "黑胶" : "封面"}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 44, height: 664, display: "flex", alignItems: "center", justifyContent: "center", gap: 76 }}>
        {disc === "vinyl" ? (
          <Vinyl size={size} cover={s.cover} spin={spin} arm={arm} />
        ) : (
          <div
            style={{
              width: size,
              height: size,
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.28), 0 4px 14px rgba(0, 0, 0, 0.15)",
            }}
          >
            <Img src={coverUrl(s.cover)} style={{ width: size, height: size }} />
          </div>
        )}
        <div style={{ width: 380, color: t.text }}>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 1 }}>{s.title}</div>
          <div style={{ fontSize: 18, color: t.textDim, marginTop: 10 }}>{s.artist}</div>
          <div
            style={{
              display: "inline-block",
              marginTop: 14,
              padding: "2px 8px",
              borderRadius: 6,
              border: `1px solid ${t.border}`,
              fontSize: 11.5,
              color: t.textDim,
            }}
          >
            FLAC
          </div>
          <div style={{ marginTop: 34, fontSize: 15, fontWeight: 500, color: accent }}>{line}</div>
        </div>
      </div>
    </>
  );
};

const LyricsPanel: React.FC<{ t: Theme; accent: string; song: number; lyric: number; onImage: boolean }> = ({ t, accent, song, lyric, onImage }) => {
  const s = SONGS[song];
  const cur = Math.floor(lyric);
  const frac = lyric - cur;
  const LH = 58;
  // The active line eases to the center; a short glide right after each change.
  const glide = Math.min(1, frac / 0.18);
  const ease = 1 - Math.pow(1 - glide, 3);
  const offset = -(cur - 1 + ease) * LH;
  const tools: IconName[] = ["textSize", "upload", "edit", "more"];
  return (
    <>
      <div style={{ position: "absolute", left: 28, top: 52, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: t.text }}>
        <Icon name="chevronLeft" size={18} />
        返回
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 48, textAlign: "center", color: t.text }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{s.title}</div>
        <div style={{ fontSize: 12.5, color: t.textDim }}>{s.artist}</div>
      </div>
      <div style={{ position: "absolute", right: 28, top: 54, display: "flex", gap: 22, color: t.textDim }}>
        <div style={{ width: 18, height: 18, borderRadius: 9, background: accent, boxShadow: `0 0 0 3px ${t.accentSoft}` }} />
        {tools.map((n) => (
          <Icon key={n} name={n} size={19} />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 100,
          height: 600,
          overflow: "hidden",
          maskImage: "linear-gradient(transparent, #000 18%, #000 82%, transparent)",
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, top: 300 - LH / 2 + offset - LH * 0 }}>
          {LYRICS.map((l, i) => {
            const d = i - (cur + ease);
            const active = i === cur;
            const dist = Math.abs(d);
            const opacity = active ? 1 : Math.max(0.16, 0.62 - (dist - 1) * 0.16);
            return (
              <div
                key={i}
                style={{
                  height: LH,
                  lineHeight: `${LH}px`,
                  textAlign: "center",
                  fontSize: 30,
                  fontWeight: 700,
                  color: t.text,
                  opacity,
                  scale: active ? 1 + 0.08 * Math.min(1, frac / 0.18) : 1,
                  textShadow: onImage ? "0 1px 10px rgba(0,0,0,.35)" : undefined,
                }}
              >
                {active ? <Karaoke text={l} progress={Math.min(1, frac / 0.85)} color={accent} base={t.text} /> : l}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

/** A lyric line whose sung part is painted in `color`, left to right. */
export const Karaoke: React.FC<{ text: string; progress: number; color: string; base: string; baseOpacity?: number; glow?: boolean }> = ({
  text,
  progress,
  color,
  base,
  baseOpacity = 0.55,
  glow = true,
}) => (
  <span style={{ position: "relative", display: "inline-block" }}>
    <span style={{ color: base, opacity: baseOpacity }}>{text}</span>
    <span
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        color,
        whiteSpace: "nowrap",
        clipPath: `inset(-50% ${(1 - progress) * 100}% -50% -10%)`,
        textShadow: glow ? `0 0 18px ${color}99` : undefined,
      }}
    >
      {text}
    </span>
  </span>
);

export const AppScreen: React.FC<AppScreenProps> = ({
  theme = "dark",
  page = "player",
  song = 0,
  time = 0,
  playing = true,
  lyric = 0,
  backdrop = "plain",
  accent = ACCENT,
  disc = "cover",
  spin = 0,
  arm = 1,
  glass = false,
  activeRow,
}) => {
  const t = THEMES[theme];
  const s = SONGS[song];
  const library = page === "library" || page === "albums";
  return (
    <div
      style={{
        position: "relative",
        width: APP_W,
        height: APP_H,
        overflow: "hidden",
        fontFamily: FONT,
        color: t.text,
        background: backdrop === "clear" ? "transparent" : t.bg,
      }}
    >
      {backdrop === "plain" ? <div style={{ position: "absolute", inset: 0, background: t.bgGrad }} /> : null}
      {backdrop === "cover" ? (
        <>
          <Img
            src={coverUrl(s.cover)}
            style={{ position: "absolute", left: -160, top: -160, width: APP_W + 320, height: APP_H + 320, objectFit: "cover", filter: "blur(70px) saturate(1.5)" }}
          />
          <div style={{ position: "absolute", inset: 0, background: theme === "dark" ? "rgba(10,10,16,.42)" : "rgba(255,255,255,.35)" }} />
        </>
      ) : null}
      <Titlebar t={t} accent={accent} file={library ? null : `${s.artist} - ${s.title}.flac`} page={page} />
      {library ? <Sidebar t={t} accent={accent} page={page} /> : null}
      {library ? <LibraryPanel t={t} accent={accent} page={page} song={song} glass={glass} activeRow={activeRow} /> : null}
      {page === "player" ? <PlayerPanel t={t} accent={accent} song={song} lyric={lyric} disc={disc} spin={spin} arm={arm} /> : null}
      {page === "lyrics" ? <LyricsPanel t={t} accent={accent} song={song} lyric={lyric} onImage={backdrop !== "plain"} /> : null}
      <Transport t={t} accent={accent} song={song} time={time} playing={playing} glass={glass} />
    </div>
  );
};
