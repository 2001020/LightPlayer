// An easter egg for one NetEase song, "What do you want more than a Happy
// ending?": while it plays (in any theme but the archive), the whole player
// takes on the look of its artwork, a sunny platform with doves, vines and
// flowers. Switching songs brings everything back.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePlayer } from "../../stores/player";
import { useSettings } from "../../stores/settings";
import { DOVES_AT, isHappyEnding } from "./egg";

export function useHappyEnding() {
  const path = usePlayer((s) => s.media?.path);
  const theme = useSettings((s) => s.theme);
  return isHappyEnding(path, theme);
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
      <Bush />
    </>
  );
}

/** Fixed pseudo-random numbers, so the scene looks the same each time. */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function Dove({ style, blur }: { style: CSSProperties; blur?: boolean }) {
  return (
    <div className={`egg-dove ${blur ? "blur" : ""}`} style={style}>
      <svg viewBox="0 0 120 80" aria-hidden="true">
        <g className="wing back">
          <path d="M58 38 C48 14 30 4 12 6 C26 14 34 24 40 36 Z" fill="#e9eef5" />
        </g>
        <path d="M22 44 C34 34 58 32 78 36 C90 38 100 34 108 30 C104 40 96 46 86 48 C70 54 46 56 30 52 C24 50 20 48 22 44 Z" fill="#fbfcfe" />
        <path d="M100 31 L114 28 L104 35 Z" fill="#c9a98a" />
        <circle cx="99" cy="32" r="1.6" fill="#3a3f4b" />
        <path d="M22 44 L4 40 L10 48 L2 54 L24 50 Z" fill="#eef2f7" />
        <g className="wing front">
          <path d="M60 38 C52 12 36 -2 14 0 C30 10 40 22 46 40 Z" fill="#ffffff" stroke="#dfe6ef" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}

/** The doves crossing the window once. */
function Flock() {
  const doves = [
    { top: 18, size: 120, dur: 5.2, delay: 0, rise: -10 },
    { top: 32, size: 86, dur: 4.6, delay: 0.35, rise: -16 },
    { top: 10, size: 70, dur: 5.6, delay: 0.7, rise: -6 },
    { top: 46, size: 150, dur: 4.2, delay: 0.15, rise: -22, blur: true },
    { top: 26, size: 60, dur: 6, delay: 1.1, rise: -12 },
    { top: 58, size: 190, dur: 3.8, delay: 0.55, rise: -28, blur: true },
  ];
  return (
    <div className="egg-flock">
      {doves.map((d, i) => (
        <Dove
          key={i}
          blur={d.blur}
          style={{ top: `${d.top}%`, width: d.size, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s`, ["--rise" as string]: `${d.rise}vh` }}
        />
      ))}
    </div>
  );
}

function Flower({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy={-r} rx={r * 0.62} ry={r} fill={color} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.45} fill="#f6d77a" />
    </g>
  );
}

function Leaf({ x, y, a, s, color }: { x: number; y: number; a: number; s: number; color: string }) {
  return <path d="M0 0 C6 -8 18 -8 24 0 C18 8 6 8 0 0 Z" fill={color} transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`} />;
}

/** A vine hanging from a top corner, with leaves and small flowers. */
function Vine({ side }: { side: "left" | "right" }) {
  const greens = ["#7cc9b4", "#56a894", "#a4dccb", "#3f8f7d"];
  const leaves = Array.from({ length: 26 }, (_, i) => {
    const t = i / 25;
    return { x: 20 + t * 200 + Math.sin(t * 9) * 18, y: 10 + t * 150 + Math.cos(t * 7) * 14, a: rand(i, 1) * 360, s: 0.7 + rand(i, 2) * 0.8, color: greens[i % 4] };
  });
  const flowers = Array.from({ length: 9 }, (_, i) => {
    const t = (i + 0.5) / 9;
    return { x: 30 + t * 190 + rand(i, 3) * 20, y: 20 + t * 140 + rand(i, 4) * 26, r: 4 + rand(i, 5) * 3, color: i % 3 === 0 ? "#d9c8f2" : "#ffffff" };
  });
  return (
    <svg className={`egg-vine ${side}`} viewBox="0 0 260 200" aria-hidden="true">
      <path d="M0 6 C60 20 90 40 120 70 C150 100 180 120 240 170" fill="none" stroke="#5f9e86" strokeWidth="2.5" />
      <path d="M40 14 C60 50 70 70 66 110" fill="none" stroke="#6fae96" strokeWidth="1.6" />
      {leaves.map((l, i) => (
        <Leaf key={i} {...l} />
      ))}
      {flowers.map((f, i) => (
        <Flower key={i} {...f} />
      ))}
    </svg>
  );
}

/** A clump of small white and lilac flowers in a bottom corner, behind the UI. */
function Bush() {
  return (
    <svg className="egg-bush" viewBox="0 0 220 160" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <Leaf key={`l${i}`} x={10 + rand(i, 6) * 180} y={60 + rand(i, 7) * 90} a={-30 - rand(i, 8) * 120} s={0.9 + rand(i, 9)} color={["#7cc9b4", "#56a894", "#a4dccb"][i % 3]} />
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <Flower key={`f${i}`} x={14 + rand(i, 10) * 190} y={50 + rand(i, 11) * 100} r={4 + rand(i, 12) * 4} color={i % 4 === 0 ? "#d9c8f2" : "#ffffff"} />
      ))}
    </svg>
  );
}

function Butterfly({ className }: { className: string }) {
  return (
    <div className={`egg-butterfly ${className}`}>
      <svg viewBox="0 0 40 30" aria-hidden="true">
        <g className="bf-wing l">
          <path d="M20 15 C12 2 2 2 3 10 C4 16 12 17 20 15 Z M20 15 C12 20 6 28 12 28 C16 28 19 22 20 15 Z" fill="#f07aa8" />
        </g>
        <g className="bf-wing r">
          <path d="M20 15 C28 2 38 2 37 10 C36 16 28 17 20 15 Z M20 15 C28 20 34 28 28 28 C24 28 21 22 20 15 Z" fill="#f59ac0" />
        </g>
        <rect x="19.2" y="9" width="1.6" height="13" rx="0.8" fill="#6b3b52" />
      </svg>
    </div>
  );
}

/** Petals and leaves drifting down. */
function Drift() {
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const petal = i % 3 !== 0;
        const style = {
          left: `${rand(i, 13) * 100}%`,
          animationDuration: `${9 + rand(i, 14) * 7}s`,
          animationDelay: `${-rand(i, 15) * 14}s`,
          ["--sway" as string]: `${(rand(i, 16) - 0.5) * 160}px`,
        };
        return (
          <div key={i} className="egg-fall" style={style}>
            <svg viewBox="0 0 24 16" aria-hidden="true">
              {petal ? (
                <ellipse cx="12" cy="8" rx="7" ry="4.5" fill={i % 2 ? "#ffd6e6" : "#ffffff"} />
              ) : (
                <path d="M0 8 C6 0 18 0 24 8 C18 16 6 16 0 8 Z" fill="#7cc9b4" />
              )}
            </svg>
          </div>
        );
      })}
    </>
  );
}

/** Small prism-coloured glints, like light through the station glass. */
function Glints() {
  const spots = [
    [62, 22],
    [74, 48],
    [30, 64],
    [86, 30],
    [48, 80],
  ];
  return (
    <>
      {spots.map(([x, y], i) => (
        <i key={i} className="egg-glint" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.9}s` }} />
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
