import { interpolate, useCurrentFrame } from "remotion";
import { FONT } from "./fonts";
import { clamp, EASE_IN, EASE_OUT } from "./tokens";

export type HeadlineProps = {
  children: string;
  /** Frame the first character starts to appear. */
  at?: number;
  /** Frame the line starts to leave; omit to stay. */
  out?: number;
  size?: number;
  weight?: number;
  color?: string;
  /** A CSS gradient painted across the whole line. */
  gradient?: string;
  /** Frames between characters. */
  stagger?: number;
  /** Frames each character takes to arrive. */
  duration?: number;
  /** Starting blur in px. */
  blur?: number;
  rise?: number;
  letterSpacing?: string;
  glow?: string;
  style?: React.CSSProperties;
};

/**
 * Apple-style headline: characters rise out of a soft blur one after
 * another, and the line dissolves upward when it leaves.
 */
export const Headline: React.FC<HeadlineProps> = ({
  children,
  at = 0,
  out,
  size = 120,
  weight = 700,
  color = "#fff",
  gradient,
  stagger = 2,
  duration = 26,
  blur = 16,
  rise = 0.3,
  letterSpacing = "0.02em",
  glow,
  style,
}) => {
  const frame = useCurrentFrame();
  const chars = [...children];
  const n = chars.length;
  const leave = out === undefined ? 0 : interpolate(frame, [out, out + 16], [0, 1], { ...clamp, easing: EASE_IN });
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: weight,
        letterSpacing,
        lineHeight: 1.18,
        whiteSpace: "pre",
        color,
        opacity: 1 - leave,
        translate: `0 ${-leave * size * 0.12}px`,
        filter: leave > 0 ? `blur(${leave * 10}px)` : undefined,
        ...style,
      }}
    >
      {chars.map((c, i) => {
        const p = interpolate(frame, [at + i * stagger, at + i * stagger + duration], [0, 1], { ...clamp, easing: EASE_OUT });
        const b = (1 - p) * blur;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              translate: `0 ${(1 - p) * size * rise}px`,
              scale: String(0.96 + 0.04 * p),
              filter: b > 0.05 ? `blur(${b}px)` : undefined,
              textShadow: glow,
              ...(gradient
                ? {
                    backgroundImage: gradient,
                    backgroundSize: `${n * 100}% 100%`,
                    backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% 0`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }
                : null),
            }}
          >
            {c}
          </span>
        );
      })}
    </div>
  );
};
