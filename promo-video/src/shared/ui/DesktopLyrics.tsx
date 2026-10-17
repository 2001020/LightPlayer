import { FONT } from "../fonts";
import { Karaoke } from "./AppScreen";

/** The desktop lyrics window: one line floating above everything. */
export const DesktopLyrics: React.FC<{
  text: string;
  progress: number;
  color: string;
  scale?: number;
  /** How dark the glass is; raise it over bright wallpapers. */
  shade?: number;
  style?: React.CSSProperties;
}> = ({ text, progress, color, scale = 1, shade = 0.34, style }) => (
  <div
    style={{
      padding: `${18 * scale}px ${44 * scale}px`,
      borderRadius: 20 * scale,
      background: `rgba(18,18,24,${shade})`,
      border: "1px solid rgba(255,255,255,.14)",
      backdropFilter: "blur(22px) saturate(1.3)",
      boxShadow: "0 20px 60px rgba(0,0,0,.35)",
      fontFamily: FONT,
      fontSize: 48 * scale,
      fontWeight: 700,
      letterSpacing: 2 * scale,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    <Karaoke text={text} progress={progress} color={color} base="#ffffff" />
  </div>
);
