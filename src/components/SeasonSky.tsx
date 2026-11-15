// The season theme's background: a landscape for each season (season/art.ts)
// under its sky, and whatever the season lets fall: cherry petals, leaves or snow.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Season } from "../core/season";
import { SCENE_VIEWBOX, scene } from "./season/art";

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

/** Stars over the winter night. */
function Stars() {
  return (
    <>
      {Array.from({ length: 70 }, (_, i) => {
        const size = 1.2 + rand(i, 7) * 2.2;
        return (
          <i
            key={i}
            className="season-light"
            style={{
              left: `${rand(i, 8) * 100}%`,
              top: `${rand(i, 9) * 58}%`,
              width: size,
              height: size,
              animationDuration: `${3 + rand(i, 10) * 6}s`,
              animationDelay: `${-rand(i, 11) * 10}s`,
            }}
          />
        );
      })}
    </>
  );
}

/**
 * The softening blur, in the drawing's units: `--scene-blur` (pixels on screen)
 * at the scale the drawing is shown at. Follows the window size.
 */
function useSceneBlur(host: React.RefObject<HTMLDivElement | null>): number {
  const [blur, setBlur] = useState(0);
  useEffect(() => {
    const [, , vw, vh] = SCENE_VIEWBOX.split(" ").map(Number);
    let timer = 0;
    const measure = () => {
      const el = host.current;
      if (!el) return;
      const px = parseFloat(getComputedStyle(el).getPropertyValue("--scene-blur")) || 0;
      // preserveAspectRatio "slice": the drawing covers the window.
      const scale = Math.max(el.clientWidth / vw, el.clientHeight / vh) || 1;
      setBlur(Math.round((px / scale) * 10) / 10);
    };
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(measure, 200);
    };
    measure();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [host]);
  return blur;
}

/**
 * The season's landscape, anchored to the bottom of the window. The clouds are
 * layers of their own, so their drifting never repaints the land.
 *
 * The softening blur is part of the drawing (an SVG filter), not a CSS filter
 * on the layers: drawn once, the layers are then only moved, where a CSS
 * filter would be worked out again on every frame of the drift.
 */
function Scene({ season, blur }: { season: Season; blur: number }) {
  const art = useMemo(() => scene(season), [season]);
  const soft = (html: string) => (blur > 0 ? `<g filter="url(#ss-scene-blur)">${html}</g>` : html);
  const layer = (key: string, cls: string, html: string) => (
    <svg key={key} className={`season-scene ${cls}`} viewBox={SCENE_VIEWBOX} preserveAspectRatio="xMidYMax slice" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
  );
  const filter = `<defs><filter id="ss-scene-blur" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>`;
  return (
    <>
      {art.drift.map((d, i) => layer(`${season}-drift-${i}`, `drift ${d.slow ? "slow" : ""}`, soft(d.body)))}
      {layer(`${season}-land`, "land", art.defs + filter + soft(art.land))}
    </>
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
  const host = useRef<HTMLDivElement>(null);
  const blur = useSceneBlur(host);
  return (
    <div ref={host} className={`season-sky ${motion ? "" : "still"} ${paused ? "paused" : ""}`} aria-hidden="true">
      {season === "winter" && <Stars />}
      <Scene season={season} blur={blur} />
      {motion && !paused && <Falling season={season} />}
    </div>
  );
}
