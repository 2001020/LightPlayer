/** The LightPlayer app icon (assets/icon.svg), without the transparent margin. */
export const AppIcon: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <svg width={size} height={size} viewBox="100 100 824 824" style={{ display: "block", flex: "none", ...style }}>
    <defs>
      <linearGradient id="lp-icon-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#66CCFF" />
        <stop offset="1" stopColor="#3D8BFF" />
      </linearGradient>
      <radialGradient id="lp-icon-glow" cx="0.3" cy="0.25" r="0.8">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x="100" y="100" width="824" height="824" rx="190" fill="url(#lp-icon-bg)" />
    <rect x="100" y="100" width="824" height="824" rx="190" fill="url(#lp-icon-glow)" />
    <path d="M420 340 L700 512 L420 684 Z" fill="#ffffff" stroke="#ffffff" strokeWidth="40" strokeLinejoin="round" />
    <g fill="#ffffff" opacity="0.55">
      <rect x="236" y="452" width="36" height="120" rx="18" />
      <rect x="300" y="402" width="36" height="220" rx="18" />
      <rect x="752" y="432" width="36" height="160" rx="18" />
    </g>
  </svg>
);

/** The same icon as an SVG string, for textures. */
export const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="100 100 824 824"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#66CCFF"/><stop offset="1" stop-color="#3D8BFF"/></linearGradient><radialGradient id="glow" cx="0.3" cy="0.25" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect x="100" y="100" width="824" height="824" fill="url(#bg)"/><rect x="100" y="100" width="824" height="824" fill="url(#glow)"/><path d="M420 340 L700 512 L420 684 Z" fill="#ffffff" stroke="#ffffff" stroke-width="40" stroke-linejoin="round"/><g fill="#ffffff" opacity="0.55"><rect x="236" y="452" width="36" height="120" rx="18"/><rect x="300" y="402" width="36" height="220" rx="18"/><rect x="752" y="432" width="36" height="160" rx="18"/></g></svg>`;
