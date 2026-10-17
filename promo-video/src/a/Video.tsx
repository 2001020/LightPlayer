import { type SceneDef, Series } from "../shared/Series";
import { ACustomize, ADesktop, AEnd, AFormats, AHero, AIcon, ALyrics, AOpening, AVinyl, AWeather } from "./scenes";

export const A_CROSSFADE = 15;

export const A_SCENES: SceneDef[] = [
  { id: "A1-Opening", label: "开场", duration: 120, Component: AOpening },
  { id: "A2-Icon", label: "图标", duration: 135, Component: AIcon },
  { id: "A3-Hero", label: "轻巧全能", duration: 165, Component: AHero },
  { id: "A4-Formats", label: "格式", duration: 165, Component: AFormats },
  { id: "A5-Lyrics", label: "歌词", duration: 210, Component: ALyrics },
  { id: "A6-Vinyl", label: "黑胶", duration: 150, Component: AVinyl },
  { id: "A7-Weather", label: "天气", duration: 195, Component: AWeather },
  { id: "A8-Desktop", label: "桌面歌词", duration: 135, Component: ADesktop },
  { id: "A9-Customize", label: "自定义", duration: 135, Component: ACustomize },
  { id: "A10-End", label: "结尾", duration: 150, Component: AEnd },
];

/** 暗场: 1560 frames of scenes minus 9 15-frame crossfades = 1425 frames. */
export const ADark: React.FC = () => <Series name="暗场" scenes={A_SCENES} crossfade={A_CROSSFADE} background="#000" />;
