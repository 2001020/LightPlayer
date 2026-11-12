// An easter egg for one NetEase song, "What do you want more than a Happy
// ending?": while it plays (in any theme), the whole player
// takes on the look of its artwork, a sunny platform with doves, vines and
// flowers. Switching songs brings everything back.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePlayer } from "../../stores/player";
import { DOVES_AT, isHappyEnding } from "./egg";

export function useHappyEnding() {
  const path = usePlayer((s) => s.media?.path);
  return isHappyEnding(path);
}

/** The artwork behind the UI, softened so the text stays readable. */
export function HappyEndingBackground() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.bg = "image";
    return () => {
      delete root.dataset.bg;
    };
  }, []);
  return (
    <>
      <div className="bg-layer" />
      <div className="egg-bg" />
      <div className="egg-veil" />
      <Paints />
      <Bush />
    </>
  );
}

/** Fixed pseudo-random numbers, so the scene looks the same each time. */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** The watercolour washes every drawing below fills itself with. */
function Paints() {
  const wash = (id: string, from: string, to: string, angle = 90) => (
    <linearGradient id={id} gradientTransform={`rotate(${angle} 0.5 0.5)`}>
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  );
  return (
    <svg className="egg-paints" width="0" height="0" aria-hidden="true">
      <defs>
        {wash("egg-leaf-0", "#b5e6d3", "#63b89f", 20)}
        {wash("egg-leaf-1", "#8fd3bd", "#3f957f", 20)}
        {wash("egg-leaf-2", "#cdeedd", "#86cbb4", 20)}
        {wash("egg-stem", "#7fb79f", "#4f9079", 60)}
        <radialGradient id="egg-petal-white" cx="0.5" cy="1" r="1">
          <stop offset="0" stopColor="#ffe3ee" />
          <stop offset="0.45" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f3f6fc" />
        </radialGradient>
        <radialGradient id="egg-petal-lilac" cx="0.5" cy="1" r="1">
          <stop offset="0" stopColor="#b79be6" />
          <stop offset="0.5" stopColor="#dccdf5" />
          <stop offset="1" stopColor="#f1eafc" />
        </radialGradient>
        <radialGradient id="egg-petal-pink" cx="0.5" cy="1" r="1">
          <stop offset="0" stopColor="#f58fb6" />
          <stop offset="0.55" stopColor="#ffd3e3" />
          <stop offset="1" stopColor="#fff1f6" />
        </radialGradient>
        {wash("egg-dove-body", "#ffffff", "#dfe8f3")}
        {wash("egg-dove-wing", "#ffffff", "#e7eef7", 70)}
        {wash("egg-dove-far", "#eef3f9", "#cbd7e6", 70)}
        {wash("egg-bf-up", "#ffc1d9", "#ee6fa1", 60)}
        {wash("egg-bf-low", "#ffd9e8", "#f48bb5", 60)}
      </defs>
    </svg>
  );
}

function Dove({ style, blur }: { style: CSSProperties; blur?: boolean }) {
  return (
    <div className={`egg-dove ${blur ? "blur" : ""}`} style={style}>
      <svg viewBox="0 0 160 110" aria-hidden="true">
        <g className="wing back">
          <path d="M92 54 C84 32 66 14 40 8 C46 15 49 21 50 27 C42 25 36 25 30 27 C40 31 46 37 52 43 C60 51 74 56 92 54 Z" fill="url(#egg-dove-far)" />
        </g>
        {/* Tail feathers, fanned. */}
        <path d="M46 62 L8 52 L22 62 L4 66 L22 69 L10 78 L48 70 Z" fill="url(#egg-dove-far)" />
        <path d="M46 63 L16 59 M46 66 L14 67 M46 68 L20 74" stroke="#c3d0e0" strokeWidth="0.8" fill="none" strokeLinecap="round" />
        <path
          d="M40 64 C52 49 84 45 108 49 C118 50 126 47 131 42 C138 36 149 38 150 47 C151 54 144 59 136 61 C124 71 96 77 70 74 C56 72 44 70 40 64 Z"
          fill="url(#egg-dove-body)"
        />
        {/* Shade under the belly. */}
        <path d="M52 69 C72 76 100 75 124 66 C104 78 72 80 52 69 Z" fill="#c9d6e6" opacity="0.55" />
        <path d="M149 44 L159 47.5 L149 50 Z" fill="#eab08c" />
        <circle cx="141.5" cy="45.5" r="1.9" fill="#33394a" />
        <circle cx="142.1" cy="44.9" r="0.6" fill="#fff" />
        <g className="wing front">
          <path
            d="M98 56 C92 32 76 10 46 2 C52 10 55 16 56 22 C48 18 40 18 34 20 C42 24 47 29 50 34 C43 33 37 34 32 37 C42 40 50 46 58 52 C68 58 84 60 98 56 Z"
            fill="url(#egg-dove-wing)"
            stroke="#d5deea"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          <path d="M92 52 C82 36 70 22 54 12 M86 54 C74 42 62 32 46 26 M80 55 C70 48 58 42 44 38" stroke="#cdd8e6" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          {/* The short covering feathers near the shoulder. */}
          <path d="M98 56 C94 46 88 38 80 33 C82 42 80 50 74 55 C82 58 90 58 98 56 Z" fill="#ffffff" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}

/** The doves crossing the window once. */
function Flock() {
  const doves = [
    { top: 18, size: 132, dur: 5.2, delay: 0, rise: -10 },
    { top: 32, size: 92, dur: 4.6, delay: 0.35, rise: -16 },
    { top: 10, size: 74, dur: 5.6, delay: 0.7, rise: -6 },
    { top: 46, size: 164, dur: 4.2, delay: 0.15, rise: -22, blur: true },
    { top: 26, size: 64, dur: 6, delay: 1.1, rise: -12 },
    { top: 58, size: 204, dur: 3.8, delay: 0.55, rise: -28, blur: true },
    { top: 6, size: 52, dur: 6.4, delay: 1.5, rise: -4 },
  ];
  return (
    <div className="egg-flock">
      {doves.map((d, i) => (
        <Dove
          key={i}
          blur={d.blur}
          style={{
            top: `${d.top}%`,
            width: d.size,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
            ["--rise" as string]: `${d.rise}vh`,
            ["--beat" as string]: `${0.3 + rand(i, 20) * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

type Paint = "white" | "lilac" | "pink";

/** A five-petalled blossom; each petal has the small notch of a cherry flower. */
function Flower({ x, y, r, paint = "white", turn = 0 }: { x: number; y: number; r: number; paint?: Paint; turn?: number }) {
  const k = r / 10;
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn}) scale(${k})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          key={a}
          d="M0 0 C-7 -4 -8 -11 -3.4 -14.5 L0 -12.4 L3.4 -14.5 C8 -11 7 -4 0 0 Z"
          fill={`url(#egg-petal-${paint})`}
          stroke="rgba(150, 130, 180, 0.28)"
          strokeWidth="0.5"
          transform={`rotate(${a})`}
        />
      ))}
      {[36, 108, 180, 252, 324].map((a) => (
        <circle key={a} cx="0" cy="-4.6" r="0.75" fill="#e2a23a" transform={`rotate(${a})`} />
      ))}
      <circle r="2.5" fill="#f7d778" />
    </g>
  );
}

/** A leaf growing from (x, y) towards angle `a`, with its midrib. */
function Leaf({ x, y, a, s, tone }: { x: number; y: number; a: number; s: number; tone: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`}>
      <path d="M0 0 C6 -9 19 -10 27 0 C19 9 6 8 0 0 Z" fill={`url(#egg-leaf-${tone % 3})`} />
      <path d="M1.5 0 C9 -1.2 17 -1 25 0" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="0.8" fill="none" strokeLinecap="round" />
    </g>
  );
}

type Pt = [number, number];
/** A point on a cubic curve, and the direction the curve runs there (degrees). */
function along(c: [Pt, Pt, Pt, Pt], t: number) {
  const u = 1 - t;
  const at = (i: 0 | 1) => u * u * u * c[0][i] + 3 * u * u * t * c[1][i] + 3 * u * t * t * c[2][i] + t * t * t * c[3][i];
  const d = (i: 0 | 1) => 3 * u * u * (c[1][i] - c[0][i]) + 6 * u * t * (c[2][i] - c[1][i]) + 3 * t * t * (c[3][i] - c[2][i]);
  return { x: at(0), y: at(1), angle: (Math.atan2(d(1), d(0)) * 180) / Math.PI };
}
const curve = (c: [Pt, Pt, Pt, Pt]) => `M${c[0]} C${c[1]} ${c[2]} ${c[3]}`;

/** One strand: a stem with leaves in alternating pairs and a few blossoms. */
function Strand({ c, pairs, blooms, seed, width }: { c: [Pt, Pt, Pt, Pt]; pairs: number; blooms: number[]; seed: number; width: number }) {
  const leaves = Array.from({ length: pairs * 2 }, (_, i) => {
    const pair = Math.floor(i / 2);
    const t = 0.08 + (pair / pairs) * 0.9 + (i % 2) * 0.025;
    const p = along(c, t);
    const side = i % 2 ? 1 : -1;
    // Smaller towards the tip, like a growing shoot.
    const s = (1.05 - t * 0.5) * (0.85 + rand(i, seed) * 0.3);
    return { x: p.x, y: p.y, a: p.angle + side * (48 + rand(i, seed + 1) * 22), s, tone: i + seed };
  });
  return (
    <>
      <path d={curve(c)} fill="none" stroke="url(#egg-stem)" strokeWidth={width} strokeLinecap="round" />
      {leaves.map((l, i) => (
        <Leaf key={i} {...l} />
      ))}
      {blooms.map((t, i) => {
        const p = along(c, t);
        const off = (i % 2 ? 1 : -1) * 7;
        const rad = ((p.angle + 90) * Math.PI) / 180;
        return (
          <Flower
            key={`f${i}`}
            x={p.x + Math.cos(rad) * off}
            y={p.y + Math.sin(rad) * off}
            r={6.5 + rand(i, seed + 2) * 3.5}
            paint={(i + seed) % 3 === 0 ? "lilac" : "white"}
            turn={rand(i, seed + 3) * 72}
          />
        );
      })}
    </>
  );
}

/** A vine hanging from a top corner, with leaves and small flowers. */
function Vine({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`egg-vine ${side}`} viewBox="0 0 260 220" aria-hidden="true">
      <g className="egg-strand slow">
        <Strand c={[[10, -4], [90, 14], [170, 4], [252, 34]]} pairs={7} blooms={[0.3, 0.62, 0.95]} seed={1} width={2.2} />
      </g>
      <g className="egg-strand">
        <Strand c={[[-4, 8], [86, 10], [150, 64], [168, 196]]} pairs={9} blooms={[0.22, 0.45, 0.7, 0.97]} seed={5} width={2.6} />
      </g>
      <g className="egg-strand quick">
        <Strand c={[[-4, 30], [40, 44], [72, 92], [62, 168]]} pairs={6} blooms={[0.4, 0.96]} seed={9} width={1.9} />
      </g>
    </svg>
  );
}

/** Flowers growing in a bottom corner, behind the UI: far, middle and near. */
function Bush() {
  const stems = Array.from({ length: 13 }, (_, i) => {
    const layer = i % 3; // 0 far, 1 middle, 2 near
    const x0 = 6 + rand(i, 6) * 190;
    const h = 46 + layer * 16 + rand(i, 7) * 44;
    const lean = (rand(i, 8) - 0.35) * 46;
    const c: [Pt, Pt, Pt, Pt] = [
      [x0, 170],
      [x0 + lean * 0.1, 170 - h * 0.45],
      [x0 + lean * 0.6, 170 - h * 0.8],
      [x0 + lean, 170 - h],
    ];
    return { c, layer, i };
  }).sort((a, b) => a.layer - b.layer);
  return (
    <svg className="egg-bush" viewBox="0 0 230 170" aria-hidden="true">
      {stems.map(({ c, layer, i }) => {
        const top = along(c, 1);
        const scale = 0.7 + layer * 0.22;
        return (
          <g key={i} opacity={0.62 + layer * 0.19} className={`egg-strand ${layer === 2 ? "quick" : layer === 0 ? "slow" : ""}`}>
            <path d={curve(c)} fill="none" stroke="url(#egg-stem)" strokeWidth={1.4 + layer * 0.5} strokeLinecap="round" />
            {[0.3, 0.55].map((t, j) => {
              const p = along(c, t);
              return <Leaf key={j} x={p.x} y={p.y} a={p.angle + (j ? 52 : -56)} s={scale * (1 - t * 0.3)} tone={i + j} />;
            })}
            <Flower x={top.x} y={top.y} r={(7 + rand(i, 12) * 4) * scale} paint={i % 4 === 0 ? "lilac" : i % 5 === 2 ? "pink" : "white"} turn={rand(i, 13) * 72} />
          </g>
        );
      })}
    </svg>
  );
}

function Butterfly({ className }: { className: string }) {
  const wing = (
    <>
      <path d="M24 20 C19 6 7 1 3.5 8 C1 14.5 9 21.5 24 20 Z" fill="url(#egg-bf-up)" stroke="#d95c90" strokeWidth="0.5" />
      <path d="M24 20 C14 22 7.5 28 11 34 C15 38.5 22 30.5 24 20 Z" fill="url(#egg-bf-low)" stroke="#d95c90" strokeWidth="0.5" />
      <path d="M24 20 C17 15 11 11 6 10 M24 20 C17 24 13 28 12 32" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="0.6" fill="none" />
      <circle cx="8.5" cy="10" r="1.7" fill="#fff" opacity="0.85" />
      <circle cx="13" cy="30.5" r="1.3" fill="#fff" opacity="0.8" />
    </>
  );
  return (
    <div className={`egg-butterfly ${className}`}>
      <svg viewBox="0 0 48 40" aria-hidden="true">
        <g className="bf-wing">{wing}</g>
        <g transform="translate(48 0) scale(-1 1)">
          <g className="bf-wing">{wing}</g>
        </g>
        <path d="M23.6 13.5 C22.5 9 20.5 6.5 18 5.5 M24.4 13.5 C25.5 9 27.5 6.5 30 5.5" stroke="#6b3b52" strokeWidth="0.6" fill="none" strokeLinecap="round" />
        <ellipse cx="24" cy="20" rx="1.3" ry="7" fill="#6b3b52" />
      </svg>
    </div>
  );
}

/** Petals and leaves drifting down, turning over as they go. */
function Drift() {
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const petal = i % 4 !== 0;
        const style = {
          left: `${rand(i, 13) * 100}%`,
          width: 12 + rand(i, 17) * 9,
          animationDuration: `${10 + rand(i, 14) * 8}s`,
          animationDelay: `${-rand(i, 15) * 16}s`,
          ["--sway" as string]: `${(rand(i, 16) - 0.5) * 180}px`,
          ["--spin" as string]: `${3 + rand(i, 18) * 3}s`,
        };
        return (
          <div key={i} className="egg-fall" style={style}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {petal ? (
                <path d="M12 5.4 L10 2.4 C4.5 4.6 2.6 11 12 21.5 C21.4 11 19.5 4.6 14 2.4 Z" fill={`url(#egg-petal-${i % 2 ? "pink" : "white"})`} />
              ) : (
                <g transform="translate(0 12)">
                  <path d="M0 0 C6 -8.5 18 -8.5 24 0 C18 8.5 6 8.5 0 0 Z" fill="url(#egg-leaf-0)" />
                  <path d="M1.5 0 L22 0" stroke="rgba(255, 255, 255, 0.55)" strokeWidth="0.8" />
                </g>
              )}
            </svg>
          </div>
        );
      })}
    </>
  );
}

/** Soft coloured sparkles, like light through the station glass. */
function Glints() {
  const spots: [number, number, string, number][] = [
    [62, 22, "255, 190, 215", 34],
    [74, 48, "190, 225, 255", 26],
    [30, 64, "255, 236, 170", 30],
    [86, 30, "215, 200, 255", 22],
    [48, 80, "190, 240, 215", 28],
    [16, 34, "255, 255, 255", 20],
  ];
  return (
    <>
      {spots.map(([x, y, c, size], i) => (
        <i key={i} className="egg-glint" style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDelay: `${i * 0.9}s`, ["--c" as string]: c }} />
      ))}
    </>
  );
}

/** Marks the document while the egg is on, and draws its decorations. */
export function HappyEndingEgg() {
  const on = useHappyEnding();
  const path = usePlayer((s) => s.media?.path);
  const reached = usePlayer((s) => s.playing && s.position >= DOVES_AT && s.position < DOVES_AT + 3);
  const flown = useRef(false);
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.dataset.egg = "happy-ending";
    return () => {
      delete root.dataset.egg;
    };
  }, [on]);

  // A new play of the song may bring the doves again.
  useEffect(() => {
    flown.current = false;
    setFlying(false);
  }, [path]);

  useEffect(() => {
    if (!on || !reached || flown.current) return;
    flown.current = true;
    setFlying(true);
  }, [on, reached]);

  useEffect(() => {
    if (!flying) return;
    const id = window.setTimeout(() => setFlying(false), 7500);
    return () => clearTimeout(id);
  }, [flying]);

  if (!on) return null;
  return (
    <div className="egg-layer" aria-hidden="true" data-lp="egg">
      <Glints />
      <Vine side="left" />
      <Vine side="right" />
      <Drift />
      <Butterfly className="one" />
      <Butterfly className="two" />
      {flying && <Flock />}
    </div>
  );
}
