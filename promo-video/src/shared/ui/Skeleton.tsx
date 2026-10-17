/** A placeholder app window on the desktop: traffic lights and lines of "content". */
export const Skeleton: React.FC<{ x: number; y: number; w: number; h: number; tone: "light" | "dark" | "glass" }> = ({ x, y, w, h, tone }) => {
  const bg = { light: "rgba(246,246,250,.9)", dark: "rgba(30,30,38,.82)", glass: "rgba(255,255,255,.1)" }[tone];
  const line = { light: "rgba(0,0,0,.07)", dark: "rgba(255,255,255,.08)", glass: "rgba(255,255,255,.12)" }[tone];
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 14,
        background: bg,
        border: tone === "glass" ? "1px solid rgba(255,255,255,.18)" : undefined,
        backdropFilter: tone === "glass" ? "blur(40px) saturate(1.6)" : undefined,
        boxShadow: "0 30px 80px rgba(0,0,0,.3)",
        overflow: "hidden",
      }}
    >
      <div style={{ height: 40, display: "flex", gap: 8, alignItems: "center", paddingLeft: 18 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
        ))}
      </div>
      {[0.82, 0.64, 0.9, 0.48, 0.74, 0.58, 0.86, 0.7, 0.52].map((f, i) => (
        <div key={i} style={{ margin: "18px 32px 0", width: `${f * 100 - 10}%`, height: 14, borderRadius: 7, background: line }} />
      ))}
    </div>
  );
};
