import { FONT } from "../fonts";
import { fitSize } from "../texts";
import { Karaoke } from "./AppScreen";

/** The desktop lyrics window: one line floating above everything. */
export const DesktopLyrics: React.FC<{
  text: string;
  progress: number;
  color: string;
  scale?: number;
  /** How dark the glass is; raise it over bright wallpapers. */
  shade?: number;
  /** Long lines shrink so the window stays within this width (px). */
  maxWidth?: number;
  tk?: string;
  style?: React.CSSProperties;
}> = ({ text, progress, color, scale = 1, shade = 0.34, maxWidth = 1680, tk, style }) => (
  <div
    data-tk={tk}
    style={{
      padding: `${18 * scale}px ${44 * scale}px`,
      borderRadius: 20 * scale,
      background: `rgba(18,18,24,${shade})`,
      border: "1px solid rgba(255,255,255,.14)",
      backdropFilter: "blur(22px) saturate(1.3)",
      boxShadow: "0 20px 60px rgba(0,0,0,.35)",
      fontFamily: FONT,
      fontSize: fitSize(text, 48 * scale, maxWidth - 88 * scale, 2 / 48),
      fontWeight: 700,
      letterSpacing: 2 * scale,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    <Karaoke text={text} progress={progress} color={color} base="#ffffff" />
  </div>
);
