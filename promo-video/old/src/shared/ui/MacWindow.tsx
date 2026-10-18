import { APP_H, APP_W } from "./AppScreen";

/** The app window at `scale`, with rounded corners and a soft drop shadow. */
export const MacWindow: React.FC<{
  scale: number;
  children: React.ReactNode;
  shadow?: string;
  style?: React.CSSProperties;
}> = ({ scale, children, shadow = "0 50px 120px rgba(0,0,0,.45), 0 12px 30px rgba(0,0,0,.25)", style }) => (
  <div
    style={{
      position: "relative",
      width: APP_W * scale,
      height: APP_H * scale,
      borderRadius: 12 * scale,
      overflow: "hidden",
      boxShadow: `${shadow}, 0 0 0 ${Math.max(1, scale)}px rgba(255,255,255,.10)`,
      flex: "none",
      ...style,
    }}
  >
    <div style={{ width: APP_W, height: APP_H, scale: String(scale), transformOrigin: "0 0" }}>{children}</div>
  </div>
);
