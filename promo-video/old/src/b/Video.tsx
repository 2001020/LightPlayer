import { type SceneDef, Series } from "../shared/Series";
import { BCustomize, BDesktop, BEnd, BIntro, BLibrary, BLyrics, BMosaic, BVinyl, BWeather } from "./scenes";

export const B_CROSSFADE = 10;

export const B_SCENES: SceneDef[] = [
  { id: "B1-Intro", label: "开场", duration: 90, Component: BIntro },
  { id: "B2-Library", label: "媒体库", duration: 150, Component: BLibrary },
  { id: "B3-Mosaic", label: "格式", duration: 135, Component: BMosaic },
  { id: "B4-Lyrics", label: "歌词", duration: 165, Component: BLyrics },
  { id: "B5-Vinyl", label: "黑胶", duration: 135, Component: BVinyl },
  { id: "B6-Weather", label: "天气", duration: 150, Component: BWeather },
  { id: "B7-Desktop", label: "桌面歌词", duration: 120, Component: BDesktop },
  { id: "B8-Customize", label: "自定义", duration: 130, Component: BCustomize },
  { id: "B9-End", label: "结尾", duration: 120, Component: BEnd },
];

/** 白昼: 1195 frames of scenes minus 8 10-frame crossfades = 1115 frames. */
export const BLight: React.FC = () => <Series name="白昼" scenes={B_SCENES} crossfade={B_CROSSFADE} background="#fbfbfd" />;
