import { type SceneDef, Series } from "../shared/Series";
import { CCustomize, CDay, CDesktop, CEnd, CHero, CLyrics, COpening, CVinyl } from "./scenes";

export const C_CROSSFADE = 20;

export const C_SCENES: SceneDef[] = [
  { id: "C1-Opening", label: "开场", duration: 120, Component: COpening },
  { id: "C2-Hero", label: "轻巧全能", duration: 150, Component: CHero },
  { id: "C3-Lyrics", label: "歌词", duration: 190, Component: CLyrics },
  { id: "C4-Vinyl", label: "黑胶", duration: 140, Component: CVinyl },
  { id: "C5-Day", label: "天色", duration: 165, Component: CDay },
  { id: "C6-Desktop", label: "桌面歌词", duration: 130, Component: CDesktop },
  { id: "C7-Customize", label: "自定义", duration: 130, Component: CCustomize },
  { id: "C8-End", label: "结尾", duration: 135, Component: CEnd },
];

/** 流光: 1160 frames of scenes minus 7 20-frame crossfades = 1020 frames. */
export const CAurora: React.FC = () => <Series name="流光" scenes={C_SCENES} crossfade={C_CROSSFADE} background="#000" />;
