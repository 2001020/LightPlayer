// The season theme's background: a soft sky, rolling ground, and whatever the
// season lets fall, cherry petals, leaves or snow.

import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import type { Season } from "../core/season";

const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 91.7 + salt * 173.3) * 43758.5453;
  return x - Math.floor(x);
};

const PETAL = "M12 5.4 L10 2.4 C4.5 4.6 2.6 11 12 21.5 C21.4 11 19.5 4.6 14 2.4 Z";
const LEAF = "M1 12 C7 3.5 17 3.5 23 12 C17 20.5 7 20.5 1 12 Z";
const MAPLE = "M12 1 L14.2 6.2 L18.4 4 L17.2 9.2 L22.5 9 L18.6 13 L21.2 16 L15.6 16.4 L16 20.6 L12 18 L8 20.6 L8.4 16.4 L2.8 16 L5.4 13 L1.5 9 L6.8 9.2 L5.6 4 L9.8 6.2 Z";
const GINKGO = "M12 23 L12 15.5 C4.5 15.5 1 9.5 3 4 C6 6.2 9 6 12 3 C15 6 18 6.2 21 4 C23 9.5 19.5 15.5 12 15.5";

/** What falls in each season: [shape, colours]. */
const FALLING: Record<Season, { count: number; shapes: [string, string[]][] }> = {
  spring: { count: 26, shapes: [[PETAL, ["#ffd3e2", "#ffb7d0", "#fff0f5", "#ffc4da"]]] },
  summer: { count: 8, shapes: [[LEAF, ["#7fd0a0", "#4fb27c", "#a7e2b8"]]] },
  autumn: { count: 22, shapes: [[MAPLE, ["#e2562f", "#f08a2e", "#c93f2a"]], [GINKGO, ["#f2c230", "#e9a81f"]], [LEAF, ["#c9772e", "#e09a3a"]]] },
  winter: { count: 46, shapes: [] },
};

function Falling({ season }: { season: Season }) {
  const items = useMemo(() => {
    const { count, shapes } = FALLING[season];
    return Array.from({ length: count }, (_, i) => {
      const near = rand(i, 1); // 0 far .. 1 near
      const style = {
        left: `${rand(i, 2) * 104 - 2}%`,
        animationDuration: `${(season === "winter" ? 9 : 11) + (1 - near) * 10 + rand(i, 3) * 4}s`,
        animationDelay: `${-rand(i, 4) * 24}s`,
        opacity: 0.45 + near * 0.5,
        ["--sway" as string]: `${(rand(i, 5) - 0.5) * (season === "autumn" ? 320 : 200)}px`,
        ["--spin" as string]: `${2.6 + rand(i, 6) * 3.4}s`,
      } as CSSProperties;
      if (season === "winter") {
        const size = 3 + near * 7;
        return <i key={i} className="season-fall snow" style={{ ...style, width: size, height: size, filter: near < 0.35 ? "blur(1px)" : undefined }} />;
      }
      const [d, colours] = shapes[i % shapes.length];
      return (
        <div key={i} className="season-fall" style={{ ...style, width: 10 + near * 16 }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={d} fill={colours[i % colours.length]} />
          </svg>
        </div>
      );
    });
  }, [season]);
  return <>{items}</>;
}

/** Soft discs of light drifting about: sun through leaves, fireflies, stars. */
function Lights({ season }: { season: Season }) {
  const n = season === "summer" ? 16 : season === "winter" ? 34 : 9;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const size = season === "winter" ? 1.5 + rand(i, 7) * 2 : 26 + rand(i, 7) * 90;
        return (
          <i
            key={i}
            className="season-light"
            style={{
              left: `${rand(i, 8) * 100}%`,
              top: `${rand(i, 9) * (season === "winter" ? 55 : 80)}%`,
              width: size,
              height: size,
              animationDuration: `${5 + rand(i, 10) * 7}s`,
              animationDelay: `${-rand(i, 11) * 10}s`,
            }}
          />
        );
      })}
    </>
  );
}

/** Three rolling ridges along the bottom; trees stand on the far ones. */
function Ground({ season }: { season: Season }) {
  const tree = (x: number, y: number, s: number, key: number): ReactNode => (
    <g key={key} transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-2 0 L-1.2 -26 L1.2 -26 L2 0 Z" className="trunk" />
      <path d="M0 -26 L-9 -40 M0 -30 L8 -44 M0 -22 L-12 -30 M0 -24 L11 -31" className="twig" />
      {season === "winter" ? (
        <path d="M-12 -30 L0 -26 L11 -31 M-9 -40 L0 -30 L8 -44" className="frost" />
      ) : (
        <>
          <circle cx="0" cy="-42" r="15" className="crown" />
          <circle cx="-12" cy="-34" r="11" className="crown" />
          <circle cx="12" cy="-35" r="11" className="crown two" />
          <circle cx="4" cy="-50" r="9" className="crown two" />
        </>
      )}
    </g>
  );
  return (
    <svg className="season-ground" viewBox="0 0 1200 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path className="ridge far" d="M0 150 C160 96 300 120 460 134 C640 150 780 84 960 104 C1070 116 1150 140 1200 128 L1200 260 L0 260 Z" />
      {[[150, 122, 1.25], [820, 96, 1.5], [1040, 114, 1.05]].map(([x, y, s], i) => tree(x, y, s, i))}
      <path className="ridge mid" d="M0 196 C200 150 380 190 560 178 C760 164 900 204 1200 160 L1200 260 L0 260 Z" />
      {[[330, 176, 1.9], [1110, 170, 2.2]].map(([x, y, s], i) => tree(x, y, s, i + 10))}
      <path className="ridge near" d="M0 232 C240 204 520 244 760 226 C960 212 1080 236 1200 220 L1200 260 L0 260 Z" />
    </svg>
  );
}

export function SeasonSky({ season, motion, paused }: { season: Season; motion: boolean; paused: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.bg = "season";
    root.dataset.season = season;
    return () => {
      delete root.dataset.bg;
      delete root.dataset.season;
    };
  }, [season]);
  return (
    <div className={`season-sky ${motion ? "" : "still"} ${paused ? "paused" : ""}`} aria-hidden="true">
      <div className="season-glow" />
      <Lights season={season} />
      <Ground season={season} />
      {motion && !paused && <Falling season={season} />}
    </div>
  );
}
