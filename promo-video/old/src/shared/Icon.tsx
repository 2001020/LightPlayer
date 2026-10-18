// Icons from the app (src/components/Icon.tsx), 24px grid, stroke-based unless noted.

const paths = {
  play: "M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z",
  pause: "M7 5h3.2v14H7zM13.8 5H17v14h-3.2z",
  next: "M5 5.8v12.4a.8.8 0 0 0 1.24.66L15 13V18.2h2V5.8h-2V11L6.24 5.14A.8.8 0 0 0 5 5.8z",
  prev: "M19 5.8v12.4a.8.8 0 0 1-1.24.66L9 13V18.2H7V5.8h2V11l8.76-5.86A.8.8 0 0 1 19 5.8z",
  loop: "M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4",
  shuffle: "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  volume: "M4 9v6h4l5 4V5L8 9zM16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  lyrics: "M4 5h16M4 10h10M4 15h16M4 20h8",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  sparkles: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 15l.6 1.4 1.4.6-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  textSize: "M3 19l5-13 5 13M4.8 14.5h6.4M14 19l3.5-8.5L21 19M15.1 16.3h4.8",
  timer: "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2 2M9 2h6",
  speed: "M12 21a9 9 0 1 1 9-9M12 12l5-3",
  ab: "M4 18L8 6l4 12M5.3 14h5.4M15 6h3.5a3 3 0 0 1 0 6H15zM15 12h4a3 3 0 0 1 0 6h-4z",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  library: "M5 4h3v16H5zM10.5 4h3v16h-3zM16 5l2.9-.8 3.9 15-2.9.8z",
  heart: "M12 20s-7-4.4-9.2-8.6C1.3 8.4 3.2 5 6.5 5c2 0 3.5 1.2 5.5 3.2C14 6.2 15.5 5 17.5 5c3.3 0 5.2 3.4 3.7 6.4C19 15.6 12 20 12 20z",
  heartFill: "M12 20s-7-4.4-9.2-8.6C1.3 8.4 3.2 5 6.5 5c2 0 3.5 1.2 5.5 3.2C14 6.2 15.5 5 17.5 5c3.3 0 5.2 3.4 3.7 6.4C19 15.6 12 20 12 20z",
  flow: "M9 5.5h6v13H9zM6 7.5 3 8.5v7l3 1zM18 7.5l3 1v7l-3 1z",
  album: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  folderPlus: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10.5v5M9.5 13h5",
  desktopLyrics: "M3 4.5h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1zM8.5 20.5h7M12 16.5v4M6.5 10.5h4.5M13.5 10.5h4",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  layout: "M4 5h16v14H4zM4 10h16M10 10v9",
  vinyl: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 6.5A5.5 5.5 0 0 0 6.5 12",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  cloud: "M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 10.6 4 4 0 0 0 7 18.5z",
  rain: "M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 7.1 4 4 0 0 0 7 15zM8.5 18l-1 3M12.5 18l-1 3M16.5 18l-1 3",
  snow: "M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 6.1 4 4 0 0 0 7 14zM8 17.5h.01M12 17h.01M16 17.5h.01M10 20.5h.01M14 20.5h.01",
  location: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  puzzle: "M9 4.5a2 2 0 1 1 4 0V6h3.5a1 1 0 0 1 1 1v3.5H19a2 2 0 1 1 0 4h-1.5V18a1 1 0 0 1-1 1H13v-1.5a2 2 0 1 0-4 0V19H5.5a1 1 0 0 1-1-1v-3.5H6a2 2 0 1 0 0-4H4.5V7a1 1 0 0 1 1-1H9z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
} satisfies Record<string, string>;

const filled = new Set(["play", "pause", "next", "prev", "heartFill"]);

export type IconName = keyof typeof paths;

export const Icon: React.FC<{ name: IconName; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }> = ({
  name,
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
  style,
}) => {
  const fill = filled.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? color : "none"}
      stroke={fill ? "none" : color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none", ...style }}
    >
      <path d={paths[name]} />
    </svg>
  );
};

/** Circular "jump back / forward 15 seconds" icon. */
export const SkipIcon: React.FC<{ dir: "back" | "fwd"; size?: number; color?: string }> = ({ dir, size = 28, color = "currentColor" }) => {
  const back = dir === "back";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={back ? "M12 4.6A8.6 8.6 0 1 1 4.55 8.9" : "M12 4.6A8.6 8.6 0 1 0 19.45 8.9"} />
      <path d={back ? "M14.3 2.3 11.7 4.6l2.6 2.3" : "M9.7 2.3 12.3 4.6 9.7 6.9"} />
      <text x="12" y="16.25" textAnchor="middle" fill={color} stroke="none" fontSize={8.2} fontWeight={650}>
        15
      </text>
    </svg>
  );
};
