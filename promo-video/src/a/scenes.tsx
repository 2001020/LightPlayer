// Candidate A, "暗场": a dark, cinematic film with 3D objects and light.

import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useLayoutEffect } from "react";
import { AbsoluteFill, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { accentAt } from "../shared/accents";
import { APP_ICON_SVG, AppIcon } from "../shared/AppIcon";
import { LYRICS } from "../shared/data";
import { FontSync } from "../shared/FontSync";
import { BEAM, PRECIP, SKY, WALLPAPER } from "../shared/gl/shaders";
import { ShaderCanvas } from "../shared/gl/ShaderCanvas";
import { Headline } from "../shared/Headline";
import { canvasTexture, svgCanvas, useAsset } from "../shared/three/assets";
import { StudioEnv } from "../shared/three/Env";
import { IconSlab } from "../shared/three/IconSlab";
import { MediaTunnel, useTunnelTextures } from "../shared/three/MediaTunnel";
import { useVinylTextures, Vinyl3D } from "../shared/three/Vinyl3D";
import { ACCENT, clamp, EASE_IN_OUT, EASE_OUT } from "../shared/tokens";
import { skyAt } from "../shared/weather";
import { AppScreen } from "../shared/ui/AppScreen";
import { DesktopLyrics } from "../shared/ui/DesktopLyrics";
import { MacWindow } from "../shared/ui/MacWindow";
import { Skeleton } from "../shared/ui/Skeleton";

const WHITE_TO_SKY = "linear-gradient(90deg, #ffffff 0%, #ffffff 35%, #bfe9ff 100%)";
const SKY_TO_BLUE = "linear-gradient(90deg, #8fdcff 0%, #66ccff 45%, #3d8bff 100%)";
const center: React.CSSProperties = { alignItems: "center", justifyContent: "center" };

const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];

/** Points the camera at a target; R3F has no lookAt prop. */
const LookAt: React.FC<{ position: [number, number, number]; target: [number, number, number] }> = ({ position, target }) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  });
  return null;
};

// ------------------------------------------------------------------ 1. 听见光

const OpeningInner: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#000" }} />
      <ShaderCanvas
        frag={BEAM}
        resolution={0.67}
        uniforms={{
          u_grow: interpolate(frame, [0, 55], [0, 1], { ...clamp, easing: EASE_OUT }),
          u_power: interpolate(frame, [0, 18, 45, 120], [0, 1.3, 1, 0.7], clamp),
          u_y: interpolate(frame, [22, 92], [0, -0.17], { ...clamp, easing: EASE_IN_OUT }),
          u_tint: [0.4, 0.8, 1],
        }}
      />
      <AbsoluteFill style={center}>
        <Headline at={40} size={156} weight={600} gradient={WHITE_TO_SKY} stagger={6} duration={36} blur={24} letterSpacing="0.1em">
          听见光
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const AOpening = Interactive.create({ Component: OpeningInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 2. Icon

const IconInner: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tex = useAsset(async () => canvasTexture(await svgCanvas(APP_ICON_SVG, 1024, 1024)), "Icon texture");
  const p = interpolate(frame, [0, 80], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 50% at 50% 46%, #0a1d33 0%, #000 70%)" }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 22% 16% at 50% 62%, ${ACCENT}55, transparent 70%)`,
          opacity: p,
        }}
      />
      {tex ? (
        <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 6], fov: 30 }} flat>
          <StudioEnv intensity={0.9} />
          <directionalLight position={[-3, 4, 5]} intensity={1.2} />
          <pointLight position={[interpolate(frame, [20, 120], [-4, 4], clamp), 1.5, 2.5]} intensity={18} color="#dff4ff" />
          <IconSlab
            texture={tex}
            scale={0.62}
            position={[0, 0.32, -4 + 4 * p]}
            rotation={[0.5 * (1 - p) + 0.03 * Math.sin(frame / 30), -1.2 * (1 - p) + 0.08 * Math.sin(frame / 45), 0.1 * (1 - p)]}
          />
        </ThreeCanvas>
      ) : null}
      <AbsoluteFill style={{ alignItems: "center", top: 700 }}>
        <Headline at={56} size={104} weight={600} stagger={2} duration={30} letterSpacing="-0.01em">
          LightPlayer
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const AIcon = Interactive.create({ Component: IconInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 3. 轻巧 也全能

const HeroInner: React.FC = () => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [18, 100], [0, 1], { ...clamp, easing: EASE_OUT });
  const push = interpolate(frame, [95, 165], [0, 1], { ...clamp, easing: EASE_IN_OUT });
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 45% at 50% 100%, #0d2440 0%, #000 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", top: 96 }}>
        <Headline at={4} out={96} size={112} weight={700} gradient={WHITE_TO_SKY} stagger={3}>
          轻巧 也全能
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ ...center, perspective: 2200 }}>
        <div
          style={{
            opacity: rise,
            transform: `translateY(${360 * (1 - rise) + 60 * (1 - push)}px) rotateX(${30 * (1 - rise) + 6 * (1 - push)}deg) scale(${0.86 + 0.24 * push})`,
            WebkitBoxReflect: "below 28px linear-gradient(transparent 76%, rgba(255,255,255,.16))",
          }}
        >
          <MacWindow scale={1}>
            <AppScreen theme="dark" page="player" song={0} time={83 + frame / 30} lyric={2 + frame / 70} />
          </MacWindow>
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const AHero = Interactive.create({ Component: HeroInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 4. 几乎所有格式

const FormatsInner: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const textures = useTunnelTextures();
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#000" }} />
      {textures ? (
        <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 4], fov: 52 }} flat>
          <fog attach="fog" args={["#000000", 5, 30]} />
          <MediaTunnel textures={textures} travel={34 * (1 - Math.exp(-frame / 38)) + frame * 0.035} />
        </ThreeCanvas>
      ) : null}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 34% 30% at 50% 50%, rgba(0,0,0,.85), transparent 100%)" }} />
      <AbsoluteFill style={{ ...center, flexDirection: "column", gap: 4 }}>
        <Headline at={28} size={128} weight={700} stagger={3}>
          几乎所有格式
        </Headline>
        <Headline at={52} size={128} weight={700} stagger={3} gradient={SKY_TO_BLUE}>
          打开就播
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const AFormats = Interactive.create({ Component: FormatsInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 5. 每一句 都在发光

const LyricsInner: React.FC = () => {
  const frame = useCurrentFrame();
  const show = interpolate(frame, [52, 76], [0, 1], clamp);
  const zoom = interpolate(frame, [64, 205], [2.35, 1.02], { ...clamp, easing: EASE_IN_OUT });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#000" }} />
      <AbsoluteFill style={{ ...center, opacity: show }}>
        <div style={{ scale: String(zoom) }}>
          <MacWindow scale={0.98}>
            <AppScreen theme="dark" page="lyrics" backdrop="cover" song={0} time={32 + frame / 30} lyric={0.7 + frame / 62} />
          </MacWindow>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ ...center, flexDirection: "column", gap: 8 }}>
        <Headline at={2} out={50} size={132} weight={700} stagger={4}>
          每一句
        </Headline>
        <Headline at={16} out={52} size={132} weight={700} stagger={4} gradient={SKY_TO_BLUE} glow="0 0 40px rgba(102,204,255,.35)">
          都在发光
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const ALyrics = Interactive.create({ Component: LyricsInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 6. 让唱片 转起来

const VinylInner: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const textures = useVinylTextures(3);
  const orbit = -0.35 + frame * 0.0022;
  const dist = 6.6 - 0.6 * interpolate(frame, [0, 150], [0, 1], { ...clamp, easing: EASE_IN_OUT });
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 55% 60% at 64% 50%, #221a12 0%, #070605 62%, #000 100%)" }} />
      {textures ? (
        <ThreeCanvas width={width} height={height} camera={{ fov: 34 }} flat>
          <LookAt position={[Math.sin(orbit) * dist + 1.6, 3.9, Math.cos(orbit) * dist]} target={[1.6, -0.2, 0.15]} />
          <StudioEnv intensity={0.55} />
          <spotLight position={[-1, 6, -4]} intensity={90} angle={0.6} penumbra={1} color="#ffe7c4" />
          <spotLight position={[6, 5, 4]} intensity={40} angle={0.5} penumbra={1} color="#ffffff" />
          <pointLight position={[4, 2, -4]} intensity={30} color="#7fc8ff" />
          <group position={[2.2, 0, 0]}>
            <Vinyl3D textures={textures} spin={-frame * 0.116} arm={interpolate(frame, [8, 58], [0, 1], { ...clamp, easing: EASE_IN_OUT })} />
          </group>
        </ThreeCanvas>
      ) : null}
      <AbsoluteFill style={{ justifyContent: "center", left: 170 }}>
        <Headline at={44} size={120} weight={700} stagger={4}>
          让唱片
        </Headline>
        <Headline at={60} size={120} weight={700} stagger={4} gradient="linear-gradient(90deg, #ffe2b8, #ffb36b)">
          转起来
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const AVinyl = Interactive.create({ Component: VinylInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 7. 窗外的天气 就是主题

const WeatherInner: React.FC = () => {
  const frame = useCurrentFrame();
  const { sky, precip } = skyAt(frame);
  const rise = interpolate(frame, [62, 118], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <>
      <ShaderCanvas frag={SKY} resolution={0.5} uniforms={sky} />
      <AbsoluteFill style={{ ...center, flexDirection: "column", gap: 6, top: -40 }}>
        <Headline at={6} out={66} size={124} weight={700} stagger={3} glow="0 4px 30px rgba(0,40,90,.25)">
          窗外的天气
        </Headline>
        <Headline at={22} out={68} size={124} weight={700} stagger={3} glow="0 4px 30px rgba(0,40,90,.25)">
          就是主题
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ ...center, perspective: 2400 }}>
        <div style={{ opacity: rise, transform: `translateY(${520 * (1 - rise)}px) rotateX(${14 * (1 - rise)}deg)` }}>
          <MacWindow scale={1.02} shadow="0 40px 100px rgba(0,20,50,.35)">
            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.04)" }} />
            <AppScreen theme="dark" page="player" backdrop="clear" glass song={5} time={58 + frame / 30} lyric={4 + frame / 60} />
          </MacWindow>
        </div>
      </AbsoluteFill>
      <ShaderCanvas frag={PRECIP} resolution={0.75} uniforms={precip} />
      <FontSync />
    </>
  );
};

export const AWeather = Interactive.create({ Component: WeatherInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 8. 歌词 浮于桌面之上

const DesktopInner: React.FC = () => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [12, 40], [0, 1], { ...clamp, easing: EASE_OUT });
  const second = frame >= 78;
  const lineFrame = second ? frame - 78 : frame - 18;
  const swap = interpolate(frame, [72, 78, 84], [1, 0, 1], clamp);
  return (
    <>
      <ShaderCanvas frag={WALLPAPER} resolution={0.5} uniforms={{ u_a: hex("#0b1030"), u_b: hex("#24316e"), u_c: hex("#5fb8ff") }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 34, background: "rgba(20,22,40,.35)", backdropFilter: "blur(20px)" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ position: "absolute", right: 28 + i * 40, top: 11, width: 22, height: 12, borderRadius: 4, background: "rgba(255,255,255,.55)" }} />
        ))}
      </div>
      <Skeleton x={190} y={330} w={780} h={400} tone="light" />
      <Skeleton x={1050} y={380} w={660} h={360} tone="dark" />
      <AbsoluteFill style={{ alignItems: "center", top: 110 }}>
        <Headline at={46} size={112} weight={700} stagger={3} glow="0 6px 40px rgba(0,0,0,.45)">
          歌词 浮于桌面之上
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 800 }}>
        <div style={{ opacity: appear * swap, translate: `0 ${(1 - appear) * 40}px`, scale: String(0.94 + 0.06 * appear) }}>
          <DesktopLyrics
            scale={1.25}
            color={ACCENT}
            text={second ? LYRICS[3] : LYRICS[2]}
            progress={interpolate(lineFrame, [0, 54], [0, 1], clamp)}
          />
        </div>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const ADesktop = Interactive.create({ Component: DesktopInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 9. 由你定义

const CustomizeInner: React.FC = () => {
  const frame = useCurrentFrame();
  const accent = accentAt(frame - 30);
  const p = interpolate(frame, [0, 60], [0, 1], { ...clamp, easing: EASE_OUT });
  const drift = interpolate(frame, [0, 135], [40, -40]);
  const card = (i: number, child: React.ReactNode) => {
    const side = i - 1;
    return (
      <div
        style={{
          position: "absolute",
          opacity: interpolate(frame, [i * 6, i * 6 + 24], [0, 1], clamp),
          transform: `translateX(${side * 600 * (0.7 + 0.3 * p) + drift}px) translateZ(${side === 0 ? 0 : -260}px) rotateY(${-side * 30}deg)`,
        }}
      >
        {child}
      </div>
    );
  };
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 55% at 50% 70%, #121a28 0%, #000 72%)" }} />
      <AbsoluteFill style={{ alignItems: "center", top: 92 }}>
        <Headline at={6} size={124} weight={700} stagger={4}>
          由你定义
        </Headline>
      </AbsoluteFill>
      <AbsoluteFill style={{ ...center, top: 150, perspective: 2000 }}>
        {card(0, <MacWindow scale={0.56}><AppScreen theme="light" page="player" disc="vinyl" song={3} spin={frame * 1.2} accent={accent} time={40 + frame / 30} /></MacWindow>)}
        {card(2, <MacWindow scale={0.56}><AppScreen theme="dark" page="lyrics" backdrop="cover" song={4} accent={accent} time={70 + frame / 30} lyric={3 + frame / 60} /></MacWindow>)}
        {card(1, <MacWindow scale={0.62}><AppScreen theme="dark" page="albums" song={1} accent={accent} time={20 + frame / 30} /></MacWindow>)}
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const ACustomize = Interactive.create({ Component: CustomizeInner, layout: "absolute-fill" });

// ------------------------------------------------------------------ 10. End

const EndInner: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 40], [0, 1], { ...clamp, easing: EASE_OUT });
  const out = interpolate(frame, [128, 150], [1, 0], clamp);
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#000" }} />
      <AbsoluteFill style={{ ...center, flexDirection: "column", opacity: out, top: -30 }}>
        <div style={{ position: "relative", opacity: p, scale: String(0.86 + 0.14 * p), filter: p < 1 ? `blur(${(1 - p) * 12}px)` : undefined }}>
          <div style={{ position: "absolute", inset: -80, background: `radial-gradient(circle, ${ACCENT}44, transparent 65%)` }} />
          <AppIcon size={220} style={{ position: "relative", filter: "drop-shadow(0 20px 50px rgba(61,139,255,.45))" }} />
        </div>
        <div style={{ height: 44 }} />
        <Headline at={22} size={96} weight={600} stagger={2} letterSpacing="-0.01em">
          LightPlayer
        </Headline>
        <div style={{ height: 18 }} />
        <Headline at={44} size={46} weight={500} color="#a1a1a6" stagger={2} blur={10} letterSpacing="0.04em">
          macOS 与 Windows
        </Headline>
      </AbsoluteFill>
      <FontSync />
    </>
  );
};

export const AEnd = Interactive.create({ Component: EndInner, layout: "absolute-fill" });
