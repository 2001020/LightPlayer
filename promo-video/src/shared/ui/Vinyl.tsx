import { Img } from "remotion";
import { coverUrl } from "../covers";

/**
 * The player's vinyl record: grooves, a rotating label with the album art,
 * a fixed light sheen and a tonearm that swings from its rest onto the record.
 */
export const Vinyl: React.FC<{ size: number; cover: number; spin: number; arm: number; style?: React.CSSProperties }> = ({
  size,
  cover,
  spin,
  arm,
  style,
}) => {
  const label = size * 0.38;
  const angle = 4 + arm * 22;
  return (
    <div style={{ position: "relative", width: size * 1.12, height: size, flex: "none", ...style }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: "50%",
          background: "repeating-radial-gradient(circle at 50% 50%, #121214 0px, #121214 1.2px, #202024 2px, #121214 2.8px)",
          boxShadow: "0 30px 70px rgba(0,0,0,.45), 0 6px 18px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.06)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: (size - label) / 2,
            top: (size - label) / 2,
            width: label,
            height: label,
            borderRadius: "50%",
            overflow: "hidden",
            rotate: `${spin}deg`,
            boxShadow: "0 0 0 6px #0c0c0e",
          }}
        >
          <Img src={coverUrl(cover)} style={{ width: label, height: label }} />
        </div>
        <div
          style={{
            position: "absolute",
            left: size / 2 - 5,
            top: size / 2 - 5,
            width: 10,
            height: 10,
            borderRadius: 5,
            background: "#d9d9de",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "conic-gradient(from 20deg, transparent 0deg, rgba(255,255,255,.13) 22deg, transparent 50deg, transparent 180deg, rgba(255,255,255,.1) 205deg, transparent 232deg)",
            maskImage: `radial-gradient(circle, transparent ${label / 2 + 6}px, #000 ${label / 2 + 7}px)`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: size * 1.02 - 20,
          top: size * 0.06 - 20,
          width: 40,
          height: 40,
          borderRadius: 20,
          background: "radial-gradient(circle at 35% 30%, #f4f4f6, #9a9aa2 60%, #5c5c64)",
          boxShadow: "0 6px 14px rgba(0,0,0,.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: size * 1.02 - 3,
          top: size * 0.06,
          width: 6,
          height: size * 0.71,
          borderRadius: 3,
          background: "linear-gradient(90deg, #8d8d95, #f2f2f5 45%, #9c9ca4)",
          transformOrigin: "50% 0",
          rotate: `${angle}deg`,
          boxShadow: "4px 8px 12px rgba(0,0,0,.3)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -9,
            bottom: -20,
            width: 24,
            height: 34,
            borderRadius: 5,
            background: "linear-gradient(90deg, #6c6c74, #d8d8de 50%, #7a7a82)",
          }}
        />
      </div>
    </div>
  );
};
