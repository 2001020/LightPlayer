// Candidate B, "白昼": bright, typographic and quick, like a product page
// that moves.

import { AbsoluteFill, Img, Interactive, interpolate, useCurrentFrame } from "remotion";
import { accentAt, ACCENTS } from "../shared/accents";
import { AppIcon } from "../shared/AppIcon";
import { COVERS, coverUrl, genCover, genFrame, svgUrl } from "../shared/covers";
import { LYRICS, SONGS } from "../shared/data";
import { FONT } from "../shared/fonts";
import { FontSync } from "../shared/FontSync";
import { PRECIP, SKY, WALLPAPER } from "../shared/gl/shaders";
import { ShaderCanvas } from "../shared/gl/ShaderCanvas";
import { Headline } from "../shared/Headline";
import { Icon, type IconName } from "../shared/Icon";
import { clamp, EASE_IN_OUT, EASE_OUT } from "../shared/tokens";
import { AppScreen, Karaoke } from "../shared/ui/AppScreen";
import { DesktopLyrics } from "../shared/ui/DesktopLyrics";
import { MacWindow } from "../shared/ui/MacWindow";
import { Skeleton } from "../shared/ui/Skeleton";
import { Vinyl } from "../shared/ui/Vinyl";
import { SKY_STATES, skyAt, type SkyKey } from "../shared/weather";

const INK = "#1d1d1f";
const GREY = "#86868b";
const PAPER = "#fbfbfd";
const BLUE_TEXT = "linear-gradient(90deg, #2fb4f5 0%, #1f8fff 55%, #5b6cff 100%)";
const center: React.CSSProperties = { alignItems: "center", justifyContent: "center" };
const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];

// ------------------------------------------------------------------ 1. 听 见 光

const IntroInner: React.FC = () => {
  const frame = useCurrentFrame();
  const chars = ["听", "见", "光"];
  const lit = interpolate(frame, [34, 52], [0, 1], { ...clamp, easing: EASE_OUT });
  const settle = interpolate(frame, [60, 90], [1, 0.9], { ...clamp, easing: EASE_IN_OUT });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: PAPER }} />
      <AbsoluteFill style={center}>
        <div
          style={{
            width: 1100,
            height: 1100,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(102,204,255,.45) 0%, rgba(102,204,255,.12) 40%, transparent 68%)",
            scale: String(0.2 + 0.8 * lit),
            opacity: lit,
            translate: "250px 0",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ ...center, flexDirection: "row", gap: 30, scale: String(settle), fontFamily: FONT }}>
        {chars.map((c, i) => {
          const p = interpolate(frame, [4 + i * 9, 22 + i * 9], [0, 1], { ...clamp, easing: EASE_OUT });
          const last = i === 2;
          return (
            <div
              key={c}
              style={{
                position: "relative",
                fontSize: 300,
                fontWeight: 800,
                lineHeight: 1,
                color: INK,
                opacity: p,
                scale: String(1.25 - 0.25 * p),
                filter: p < 1 ? `blur(${(1 - p) * 14}px)` : undefined,
              }}
            >
              <span style={{ opacity: last ? 1 - lit : 1 }}>{c}</span>
              {last ? (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    opacity: lit,
                    backgroundImage: BLUE_TEXT,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {c}
                </span>
              ) : null}
            </div>
          );
        })}
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const BIntro = Interactive.create({ Component: IntroInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 2. 你的音乐 一目了然

const LibraryInner: React.FC = () => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [8, 58], [0, 1], { ...clamp, easing: EASE_OUT });
  const zoom = interpolate(frame, [66, 150], [1, 1.32], { ...clamp, easing: EASE_IN_OUT });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#f5f5f7" }} />
      <AbsoluteFill style={{ alignItems: "center", top: 84 }}>
        <Headline at={2} out={70} size={100} weight={700} color={INK} stagger={2} blur={10} rise={0.2}>
          你的音乐 一目了然
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 250 }}>
        <div
          style={{
            translate: `0 ${(1 - rise) * 640 - 170 * interpolate(frame, [66, 150], [0, 1], { ...clamp, easing: EASE_IN_OUT })}px`,
            scale: String(zoom),
            transformOrigin: "62% 30%",
          }}
        >
          <MacWindow scale={1.12} shadow="0 50px 120px rgba(0,0,0,.14), 0 10px 30px rgba(0,0,0,.08)">
            <AppScreen theme="light" page="albums" song={1} time={64 + frame / 30} />
          </MacWindow>
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const BLibrary = Interactive.create({ Component: LibraryInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 3. 几乎所有格式

const TILE_H = 210;
const ROWS = Array.from({ length: 7 }, (_, r) =>
  Array.from({ length: 14 }, (_, c) => {
    const k = r * 14 + c;
    const video = (k * 7) % 5 === 0;
    const src = video
      ? svgUrl(genFrame((k % 10) + 1))
      : k % 4 === 0
        ? coverUrl(k % COVERS.length)
        : svgUrl(genCover((k % 10) + 1));
    return { src, w: video ? TILE_H * 1.78 : TILE_H };
  }),
);

const MosaicInner: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 64], [2.7, 1], { ...clamp, easing: EASE_OUT });
  const card = interpolate(frame, [40, 66], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#fff" }} />
      <AbsoluteFill style={{ ...center, scale: String(zoom) }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {ROWS.map((row, r) => (
            <div key={r} style={{ display: "flex", gap: 18, translate: `${(r % 2 ? -1 : 1) * (frame * 1.6) - 600 - (r % 3) * 120}px 0` }}>
              {row.map((t, i) => (
                <Img key={i} src={t.src} style={{ width: t.w, height: TILE_H, borderRadius: 22, flex: "none", boxShadow: "0 8px 20px rgba(0,0,0,.08)" }} />
              ))}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={center}>
        <div
          style={{
            padding: "56px 96px",
            borderRadius: 48,
            background: "rgba(255,255,255,.86)",
            backdropFilter: "blur(30px) saturate(1.6)",
            boxShadow: "0 30px 90px rgba(0,0,0,.18)",
            opacity: card,
            scale: String(0.9 + 0.1 * card),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Headline at={46} size={116} weight={700} color={INK} stagger={2} blur={10} rise={0.2}>
            几乎所有格式
          </Headline>
          <Headline at={58} size={116} weight={700} gradient={BLUE_TEXT} stagger={2} blur={10} rise={0.2}>
            打开就播
          </Headline>
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const BMosaic = Interactive.create({ Component: MosaicInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 4. 每一句 都在发光

const LyricsInner: React.FC = () => {
  const frame = useCurrentFrame();
  const pos = 0.35 + frame / 42;
  const cur = Math.floor(pos);
  const frac = pos - cur;
  const glide = 1 - Math.pow(1 - Math.min(1, frac / 0.22), 3);
  const LH = 108;
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: PAPER }} />
      <AbsoluteFill style={{ justifyContent: "center", left: 150 }}>
        <Headline at={4} size={124} weight={800} color={INK} stagger={3} blur={10} rise={0.2}>
          每一句
        </Headline>
        <Headline at={14} size={124} weight={800} gradient={BLUE_TEXT} stagger={3} blur={10} rise={0.2}>
          都在发光
        </Headline>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 860,
          right: 60,
          top: 0,
          bottom: 0,
          overflow: "hidden",
          maskImage: "linear-gradient(transparent 4%, #000 30%, #000 70%, transparent 96%)",
          opacity: interpolate(frame, [10, 34], [0, 1], clamp),
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 540 - LH / 2 - (cur + glide) * LH, fontFamily: FONT }}>
          {LYRICS.map((l, i) => {
            const active = i === cur;
            return (
              <div
                key={i}
                style={{
                  height: LH,
                  lineHeight: `${LH}px`,
                  fontSize: 74,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  color: i < cur ? "#c7c7cc" : "#d8d8dd",
                  scale: active ? String(1 + 0.04 * glide) : "1",
                  transformOrigin: "0 50%",
                }}
              >
                {active ? <Karaoke text={l} progress={Math.min(1, frac / 0.9)} color="#1f9bf0" base={INK} baseOpacity={1} glow={false} /> : l}
              </div>
            );
          })}
        </div>
      </div>
      <FontSync />
    </>
  );
};

export const BLyrics = Interactive.create({ Component: LyricsInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 5. 让唱片 转起来

const VinylInner: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 46], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#f3f0eb" }} />
      <AbsoluteFill style={{ justifyContent: "center", left: 170 }}>
        <div style={{ translate: `${(1 - enter) * -700}px 0`, opacity: enter }}>
          <Vinyl size={700} cover={1} spin={frame * 5 + enter * 160} arm={interpolate(frame, [24, 60], [0, 1], { ...clamp, easing: EASE_IN_OUT })} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", left: 1130 }}>
        <Headline at={22} size={128} weight={800} color={INK} stagger={3} blur={10} rise={0.2}>
          让唱片
        </Headline>
        <Headline at={32} size={128} weight={800} gradient="linear-gradient(90deg, #ff9f43, #ff5e62)" stagger={3} blur={10} rise={0.2}>
          转起来
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const BVinyl = Interactive.create({ Component: VinylInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 6. 天气 就是主题

const still = (k: SkyKey): SkyKey[] => [
  { ...k, f: 0 },
  { ...k, f: 1 },
];

const WeatherCard: React.FC<{ state: keyof typeof SKY_STATES; icon: IconName; song: number; at: number; x: number }> = ({ state, icon, song, at, x }) => {
  const frame = useCurrentFrame();
  const { sky, precip } = skyAt(0, still(SKY_STATES[state]));
  const p = interpolate(frame, [at, at + 30], [0, 1], { ...clamp, easing: EASE_OUT });
  const s = SONGS[song];
  const W = 380;
  const H = 540;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 330,
        width: W,
        height: H,
        borderRadius: 36,
        overflow: "hidden",
        boxShadow: "0 30px 70px rgba(0,0,0,.16)",
        opacity: p,
        translate: `0 ${(1 - p) * 140}px`,
      }}
    >
      <ShaderCanvas frag={SKY} width={W} height={H} uniforms={sky} />
      <ShaderCanvas frag={PRECIP} width={W} height={H} uniforms={precip} />
      <div style={{ position: "absolute", left: 30, top: 28 }}>
        <Icon name={icon} size={48} color="#fff" strokeWidth={1.6} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 18,
          height: 76,
          borderRadius: 20,
          background: "rgba(255,255,255,.2)",
          border: "1px solid rgba(255,255,255,.3)",
          backdropFilter: "blur(20px) saturate(1.5)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 14px",
          fontFamily: FONT,
          color: "#fff",
        }}
      >
        <Img src={coverUrl(s.cover)} style={{ width: 50, height: 50, borderRadius: 10 }} />
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{s.title}</div>
          <div style={{ fontSize: 15, opacity: 0.8 }}>{s.artist}</div>
        </div>
      </div>
    </div>
  );
};

const WeatherInner: React.FC = () => (
  <>
    <AbsoluteFill style={{ backgroundColor: "#f5f5f7" }} />
    <AbsoluteFill style={{ alignItems: "center", top: 104 }}>
      <Headline at={6} out={134} size={116} weight={800} color={INK} stagger={3} blur={10} rise={0.2}>
        天气 就是主题
      </Headline>
    </AbsoluteFill>
    <WeatherCard state="sunny" icon="sun" song={3} at={12} x={146} />
    <WeatherCard state="rain" icon="rain" song={1} at={19} x={562} />
    <WeatherCard state="snow" icon="snow" song={5} at={26} x={978} />
    <WeatherCard state="night" icon="moon" song={0} at={33} x={1394} />
    <FontSync />
  </>
);

export const BWeather = Interactive.create({ Component: WeatherInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 7. 歌词 浮于桌面之上

const DesktopInner: React.FC = () => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [10, 36], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <>
      <ShaderCanvas frag={WALLPAPER} resolution={0.5} uniforms={{ u_a: hex("#8fb8f5"), u_b: hex("#e9c9f5"), u_c: hex("#ffffff") }} />
      <Skeleton x={190} y={330} w={780} h={400} tone="light" />
      <Skeleton x={1050} y={380} w={660} h={360} tone="light" />
      <AbsoluteFill style={{ alignItems: "center", top: 110 }}>
        <Headline at={10} out={104} size={112} weight={800} color={INK} stagger={3} blur={10} rise={0.2}>
          歌词 浮于桌面之上
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 790 }}>
        <div style={{ opacity: appear, translate: `0 ${(1 - appear) * 60}px`, scale: String(0.94 + 0.06 * appear) }}>
          <DesktopLyrics scale={1.3} shade={0.62} color="#66ccff" text={LYRICS[4]} progress={interpolate(frame, [26, 110], [0, 1], clamp)} />
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const BDesktop = Interactive.create({ Component: DesktopInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 8. 由你定义

const CustomizeInner: React.FC = () => {
  const frame = useCurrentFrame();
  const every = 20;
  const accent = accentAt(frame - 12, every);
  const pick = Math.max(0, Math.min(ACCENTS.length - 2, Math.round((frame - 12) / every)));
  const dark = interpolate(frame, [64, 78], [0, 1], clamp);
  const rise = interpolate(frame, [0, 34], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#f5f5f7" }} />
      <AbsoluteFill style={{ alignItems: "center", top: 70 }}>
        <Headline at={10} size={112} weight={800} color={INK} stagger={3} blur={10} rise={0.2}>
          由你定义
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 236 }}>
        <div style={{ position: "relative", opacity: rise, translate: `0 ${(1 - rise) * 120}px` }}>
          <MacWindow scale={0.8} shadow="0 40px 100px rgba(0,0,0,.16)">
            <AppScreen theme="light" page="player" song={2} accent={accent} time={50 + frame / 30} lyric={1 + frame / 50} />
          </MacWindow>
          <div style={{ position: "absolute", inset: 0, opacity: dark }}>
            <MacWindow scale={0.8} shadow="0 40px 100px rgba(0,0,0,.16)">
              <AppScreen theme="dark" page="player" disc="vinyl" song={2} spin={frame * 5} accent={accent} time={50 + frame / 30} lyric={1 + frame / 50} />
            </MacWindow>
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 930 }}>
        <div style={{ display: "flex", gap: 30, opacity: interpolate(frame, [20, 40], [0, 1], clamp) }}>
          {ACCENTS.slice(0, 5).map((c, i) => (
            <div
              key={c}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: c,
                boxShadow: i === pick ? `0 0 0 4px #f5f5f7, 0 0 0 7px ${c}` : "inset 0 0 0 1px rgba(0,0,0,.08)",
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const BCustomize = Interactive.create({ Component: CustomizeInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 9. End

const EndInner: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 30], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: PAPER }} />
      <AbsoluteFill style={{ ...center, flexDirection: "column", top: -20 }}>
        <div style={{ opacity: p, scale: String(0.8 + 0.2 * p) }}>
          <AppIcon size={200} style={{ filter: "drop-shadow(0 24px 40px rgba(61,139,255,.3))" }} />
        </div>
        <div style={{ height: 40 }} />
        <Headline at={12} size={96} weight={700} color={INK} stagger={2} blur={10} rise={0.2} letterSpacing="-0.01em">
          LightPlayer
        </Headline>
        <div style={{ height: 16 }} />
        <Headline at={30} size={46} weight={500} color={GREY} stagger={2} blur={8} rise={0.2} letterSpacing="0.04em">
          macOS 与 Windows
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const BEnd = Interactive.create({ Component: EndInner, layout: "absolute-fill" });
