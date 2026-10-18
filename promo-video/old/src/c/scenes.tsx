// Candidate C, "流光": everything floats on a slowly flowing mesh gradient
// whose colors follow the music, with frosted-glass windows.

import { AbsoluteFill, Interactive, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { accentAt, ACCENTS } from "../shared/accents";
import { AppIcon } from "../shared/AppIcon";
import { FONT } from "../shared/fonts";
import { FontSync } from "../shared/FontSync";
import { AURORA } from "../shared/gl/shaders";
import { ShaderCanvas } from "../shared/gl/ShaderCanvas";
import { Headline } from "../shared/Headline";
import { fitSize, useTexts } from "../shared/texts";
import { clamp, EASE_IN_OUT, EASE_OUT } from "../shared/tokens";
import { AppScreen, Karaoke } from "../shared/ui/AppScreen";
import { DesktopLyrics } from "../shared/ui/DesktopLyrics";
import { MacWindow } from "../shared/ui/MacWindow";
import { Skeleton } from "../shared/ui/Skeleton";
import { Vinyl } from "../shared/ui/Vinyl";

type Palette = readonly [string, string, string, string];

const P = {
  deep: ["#070b1f", "#16245e", "#2b6fd0", "#66ccff"],
  lyric: ["#04102a", "#123a78", "#2a8fd0", "#8fdcff"],
  warm: ["#24091c", "#8e2a68", "#ff6f5e", "#ffc35a"],
  dawn: ["#3b2c66", "#ff8f9c", "#ffc9a3", "#9cbcff"],
  noon: ["#1d64c8", "#4fa8ff", "#9fd6ff", "#e2f4ff"],
  dusk: ["#2a1150", "#c2417f", "#ff8a57", "#ffcf75"],
  night: ["#030817", "#0c1a42", "#1b2d66", "#3f56a8"],
  violet: ["#0d0624", "#3a1d7a", "#7a4cff", "#ff7ac8"],
} satisfies Record<string, Palette>;

const rgb = (c: string) => {
  if (c.startsWith("#")) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];
  const m = c.match(/[\d.]+/g)!.map(Number);
  return [m[0] / 255, m[1] / 255, m[2] / 255] as [number, number, number];
};

/** The flowing background, blending between palettes at the given frames. */
const Aurora: React.FC<{ keys: { f: number; p: Palette }[]; dark?: number; opacity?: number }> = ({ keys, dark = 0.55, opacity = 1 }) => {
  const frame = useCurrentFrame();
  const ks = keys.length === 1 ? [keys[0], { ...keys[0], f: keys[0].f + 1 }] : keys;
  const slot = (i: number) =>
    rgb(
      interpolateColors(
        frame,
        ks.map((k) => k.f),
        ks.map((k) => k.p[i]),
      ),
    );
  return (
    <ShaderCanvas
      frag={AURORA}
      resolution={0.5}
      uniforms={{ u_c0: slot(0), u_c1: slot(1), u_c2: slot(2), u_c3: slot(3), u_dark: dark }}
      style={{ opacity }}
    />
  );
};

const center: React.CSSProperties = { alignItems: "center", justifyContent: "center" };
const GLOW = "0 0 40px rgba(255,255,255,.35)";
const glass: React.CSSProperties = { background: "rgba(14,16,30,.34)", backdropFilter: "blur(44px) saturate(1.7)" };

/** Window on frosted glass so the colors show through. */
const GlassWindow: React.FC<{ scale: number; children: React.ReactNode }> = ({ scale, children }) => (
  <MacWindow scale={scale} shadow="0 40px 120px rgba(0,0,0,.35)" style={glass}>
    {children}
  </MacWindow>
);

// ------------------------------------------------------------------ 1. 听见光

const OpeningInner: React.FC = () => {
  const frame = useCurrentFrame();
  const track = interpolate(frame, [26, 110], [0.42, 0.1], { ...clamp, easing: EASE_OUT });
  const t = useTexts().c;
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#000" }} />
      <Aurora keys={[{ f: 0, p: P.deep }]} opacity={interpolate(frame, [0, 70], [0, 1], clamp)} dark={0.75} />
      <AbsoluteFill style={center}>
        <Headline at={26} size={170} weight={600} stagger={7} duration={40} blur={26} rise={0.15} letterSpacing={`${track}em`} glow={GLOW} tk="c.opening">
          {t.opening}
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const COpening = Interactive.create({ Component: OpeningInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 2. 轻巧 也全能

const HeroInner: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [10, 70], [0, 1], { ...clamp, easing: EASE_OUT });
  const t = useTexts().c;
  return (
    <>
      <Aurora keys={[{ f: 0, p: P.deep }, { f: 150, p: P.lyric }]} />
      <AbsoluteFill style={{ alignItems: "center", top: 70 }}>
        <Headline at={18} size={104} weight={700} stagger={3} glow={GLOW} tk="c.hero">
          {t.hero}
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 250 }}>
        <div
          style={{
            opacity: p,
            scale: String(0.9 + 0.1 * p + 0.02 * Math.sin(frame / 40)),
            translate: `0 ${(1 - p) * 120 + 8 * Math.sin(frame / 32)}px`,
            filter: p < 1 ? `blur(${(1 - p) * 16}px)` : undefined,
          }}
        >
          <GlassWindow scale={0.92}>
            <AppScreen theme="dark" page="player" backdrop="clear" glass song={0} time={83 + frame / 30} lyric={2 + frame / 60} />
          </GlassWindow>
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const CHero = Interactive.create({ Component: HeroInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 3. 每一句 都在发光

const LyricsInner: React.FC = () => {
  const frame = useCurrentFrame();
  const show = interpolate(frame, [58, 82], [0, 1], clamp);
  const pos = Math.max(0, (frame - 58) / 44);
  const cur = Math.floor(pos);
  const frac = pos - cur;
  const glide = 1 - Math.pow(1 - Math.min(1, frac / 0.22), 3);
  const LH = 128;
  const { c: t, lyrics } = useTexts();
  return (
    <>
      <Aurora keys={[{ f: 0, p: P.lyric }]} dark={0.4} />
      <AbsoluteFill style={{ ...center, flexDirection: "column", gap: 6 }}>
        <Headline at={2} out={42} size={132} weight={700} stagger={4} glow={GLOW} tk="c.lyrics1">
          {t.lyrics1}
        </Headline>
        <Headline at={14} out={44} size={132} weight={700} stagger={4} glow={GLOW} tk="c.lyrics2">
          {t.lyrics2}
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: show, maskImage: "linear-gradient(transparent 6%, #000 32%, #000 68%, transparent 94%)" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 540 - LH / 2 - (cur + glide) * LH, fontFamily: FONT, textAlign: "center" }}>
          {lyrics.map((l, i) => {
            const active = i === cur;
            const d = Math.abs(i - (cur + glide));
            return (
              <div
                key={i}
                style={{
                  height: LH,
                  lineHeight: `${LH}px`,
                  fontSize: fitSize(l, 84, 1700),
                  whiteSpace: "nowrap",
                  fontWeight: 700,
                  color: "#fff",
                  opacity: active ? 1 : Math.max(0.12, 0.42 - (d - 1) * 0.12),
                  scale: active ? String(1 + 0.06 * glide) : "1",
                  filter: !active && d > 1.2 ? `blur(${Math.min(4, (d - 1) * 2)}px)` : undefined,
                }}
              >
                <span data-tk={`lyrics.${i}`}>
                  {active ? <Karaoke text={l} progress={Math.min(1, frac / 0.9)} color="#ffffff" base="#ffffff" baseOpacity={0.42} /> : l}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const CLyrics = Interactive.create({ Component: LyricsInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 4. 让唱片 转起来

const VinylInner: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 50], [0, 1], { ...clamp, easing: EASE_OUT });
  const t = useTexts().c;
  return (
    <>
      <Aurora keys={[{ f: 0, p: P.warm }]} dark={0.5} />
      <AbsoluteFill style={{ justifyContent: "center", left: 190 }}>
        <div style={{ opacity: p, scale: String(0.85 + 0.15 * p), filter: p < 1 ? `blur(${(1 - p) * 14}px)` : undefined }}>
          <Vinyl size={680} cover={3} spin={frame * 5} arm={interpolate(frame, [20, 56], [0, 1], { ...clamp, easing: EASE_IN_OUT })} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", left: 1150 }}>
        <Headline at={24} size={128} weight={700} stagger={4} glow={GLOW} maxWidth={690} tk="c.vinyl1">
          {t.vinyl1}
        </Headline>
        <Headline at={36} size={128} weight={700} stagger={4} glow={GLOW} maxWidth={690} tk="c.vinyl2">
          {t.vinyl2}
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const CVinyl = Interactive.create({ Component: VinylInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 5. 天色 随时间流转

const DayInner: React.FC = () => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [0, 165], [Math.PI * 1.02, Math.PI * -0.02]);
  const moon = interpolate(frame, [118, 140], [0, 1], clamp);
  const sunX = 960 + Math.cos(a) * 860;
  const sunY = 980 - Math.sin(a) * 760;
  const sunCol = interpolateColors(frame, [0, 50, 100, 130], ["#ffd1a6", "#fffbe8", "#ffb066", "#ff8a57"]);
  const p = interpolate(frame, [8, 60], [0, 1], { ...clamp, easing: EASE_OUT });
  const t = useTexts().c;
  return (
    <>
      <Aurora
        keys={[
          { f: 0, p: P.dawn },
          { f: 50, p: P.noon },
          { f: 100, p: P.dusk },
          { f: 150, p: P.night },
        ]}
        dark={0.35}
      />
      <div
        style={{
          position: "absolute",
          left: sunX - 260,
          top: sunY - 260,
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${sunCol} 0%, ${sunCol} 12%, rgba(255,255,255,0) 60%)`,
          opacity: 1 - moon,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: sunX - 180,
          top: sunY - 180,
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, #f4f6ff 0%, #f4f6ff 13%, rgba(160,180,255,.25) 30%, transparent 62%)",
          opacity: moon,
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", top: 70 }}>
        <Headline at={18} size={104} weight={700} stagger={3} glow="0 4px 30px rgba(0,0,0,.2)" tk="c.day">
          {t.day}
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 250 }}>
        <div style={{ opacity: p, translate: `0 ${(1 - p) * 140}px` }}>
          <GlassWindow scale={0.92}>
            <AppScreen theme="dark" page="lyrics" backdrop="clear" glass song={4} time={96 + frame / 30} lyric={3 + frame / 55} />
          </GlassWindow>
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const CDay = Interactive.create({ Component: DayInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 6. 歌词 浮于桌面之上

const DesktopInner: React.FC = () => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [12, 40], [0, 1], { ...clamp, easing: EASE_OUT });
  const { c: t, lyrics } = useTexts();
  return (
    <>
      <Aurora keys={[{ f: 0, p: P.violet }]} dark={0.4} />
      <Skeleton x={190} y={330} w={780} h={400} tone="glass" />
      <Skeleton x={1050} y={380} w={660} h={360} tone="glass" />
      <AbsoluteFill style={{ alignItems: "center", top: 110 }}>
        <Headline at={30} out={106} size={112} weight={700} stagger={3} glow={GLOW} tk="c.desktop">
          {t.desktop}
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 800 }}>
        <div style={{ opacity: appear, translate: `0 ${(1 - appear) * 40}px` }}>
          <DesktopLyrics scale={1.25} color="#ff9bd6" text={lyrics[5]} tk="lyrics.5" progress={interpolate(frame, [20, 110], [0, 1], clamp)} />
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const CDesktop = Interactive.create({ Component: DesktopInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 7. 由你定义

/** Backgrounds that follow each accent color. */
const TINTS: Palette[] = [
  P.deep,
  ["#1c0612", "#6e1640", "#ff6b8b", "#ffb3c4"],
  ["#04140c", "#145a34", "#4fc27a", "#c8f5d4"],
  ["#1a0f02", "#6e4210", "#ffb84d", "#ffe3b0"],
  ["#0d0624", "#3a1d7a", "#a78bfa", "#e2d9ff"],
  P.deep,
];

const CustomizeInner: React.FC = () => {
  const frame = useCurrentFrame();
  const every = 22;
  const accent = accentAt(frame - 10, every);
  const pick = Math.max(0, Math.min(ACCENTS.length - 2, Math.round((frame - 10) / every)));
  const p = interpolate(frame, [0, 40], [0, 1], { ...clamp, easing: EASE_OUT });
  const t = useTexts().c;
  return (
    <>
      <Aurora keys={TINTS.map((p, i) => ({ f: 10 + i * every, p }))} dark={0.5} />
      <AbsoluteFill style={{ alignItems: "center", top: 70 }}>
        <Headline at={18} size={112} weight={700} stagger={3} glow={GLOW} tk="c.customize">
          {t.customize}
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 240 }}>
        <div style={{ opacity: p, translate: `0 ${(1 - p) * 100}px` }}>
          <GlassWindow scale={0.8}>
            <AppScreen theme="dark" page="player" disc="vinyl" backdrop="clear" glass song={1} spin={frame * 5} accent={accent} time={30 + frame / 30} lyric={5 + frame / 50} />
          </GlassWindow>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 932 }}>
        <div style={{ display: "flex", gap: 30, opacity: interpolate(frame, [18, 38], [0, 1], clamp) }}>
          {ACCENTS.slice(0, 5).map((c, i) => (
            <div
              key={c}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: c,
                boxShadow: i === pick ? `0 0 0 4px rgba(10,12,24,.6), 0 0 0 7px ${c}, 0 0 24px ${c}` : "inset 0 0 0 1px rgba(255,255,255,.25)",
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const CCustomize = Interactive.create({ Component: CustomizeInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 8. End

const EndInner: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 40], [0, 1], { ...clamp, easing: EASE_OUT });
  const out = interpolate(frame, [112, 135], [1, 0], clamp);
  const t = useTexts().c;
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#000" }} />
      <Aurora keys={[{ f: 0, p: P.deep }]} dark={0.8} opacity={out} />
      <AbsoluteFill style={{ ...center, flexDirection: "column", top: -20, opacity: out }}>
        <div style={{ opacity: p, scale: String(0.86 + 0.14 * p), filter: p < 1 ? `blur(${(1 - p) * 12}px)` : undefined }}>
          <AppIcon size={210} style={{ filter: "drop-shadow(0 20px 60px rgba(102,204,255,.5))" }} />
        </div>
        <div style={{ height: 40 }} />
        <Headline at={18} size={96} weight={600} stagger={2} letterSpacing="-0.01em" glow={GLOW} tk="c.endName">
          {t.endName}
        </Headline>
        <div style={{ height: 16 }} />
        <Headline at={38} size={46} weight={500} color="rgba(255,255,255,.72)" stagger={2} blur={10} letterSpacing="0.04em" tk="c.endTagline">
          {t.endTagline}
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const CEnd = Interactive.create({ Component: EndInner, layout: "absolute-fill" });
