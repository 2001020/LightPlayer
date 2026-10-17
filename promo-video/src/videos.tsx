// The three videos and their scenes, shared by Root.tsx (Remotion Studio and
// rendering) and the text editor (preview).

import type { CalculateMetadataFunction } from "remotion";
import { A_SCENES, A_CROSSFADE, ADark } from "./a/Video";
import { B_SCENES, B_CROSSFADE, BLight } from "./b/Video";
import { C_SCENES, C_CROSSFADE, CAurora } from "./c/Video";
import { type SceneDef, sceneStarts, seriesLength } from "./shared/Series";
import { type Texts, TextsProvider, type VideoKey } from "./shared/texts";
import { TimeScale } from "./shared/TimeScale";
import { BASE_FPS } from "./shared/tokens";

export const WIDTH = 1920;
export const HEIGHT = 1080;

export type VideoProps = {
  texts: Texts;
  /** Output frame rate; the animation keeps its speed at any rate. */
  fps?: number;
};

/** Gives a composition its texts and plays it at the requested frame rate. */
const withTexts = (Inner: React.FC) => {
  const Wrapped: React.FC<VideoProps> = ({ texts }) => (
    <TextsProvider texts={texts}>
      <TimeScale>
        <Inner />
      </TimeScale>
    </TextsProvider>
  );
  return Wrapped;
};

export type VideoDef = {
  id: string;
  key: VideoKey;
  name: string;
  blurb: string;
  crossfade: number;
  scenes: SceneDef[];
  /** Scene start frames in the full video (30 fps). */
  starts: number[];
  /** Length in 30 fps frames. */
  duration: number;
  Component: React.FC<VideoProps>;
};

const video = (id: string, key: VideoKey, name: string, blurb: string, scenes: SceneDef[], crossfade: number, Inner: React.FC): VideoDef => ({
  id,
  key,
  name,
  blurb,
  crossfade,
  scenes,
  starts: sceneStarts(scenes, crossfade),
  duration: seriesLength(scenes, crossfade),
  Component: withTexts(Inner),
});

export const VIDEOS: VideoDef[] = [
  video("A-Dark", "a", "暗场", "黑色舞台，立体物体与光", A_SCENES, A_CROSSFADE, ADark),
  video("B-Light", "b", "白昼", "白底黑字，排版为主", B_SCENES, B_CROSSFADE, BLight),
  video("C-Aurora", "c", "流光", "流动色彩与毛玻璃", C_SCENES, C_CROSSFADE, CAurora),
];

/** Each scene as its own composition, for Studio. */
export const SCENE_COMPONENTS: Record<string, React.FC<VideoProps>> = Object.fromEntries(
  VIDEOS.flatMap((v) => v.scenes.map((s) => [s.id, withTexts(s.Component)])),
);

export const clampFps = (fps: number | undefined) => Math.min(120, Math.max(1, fps ?? BASE_FPS));

/** Frames at `fps` for something that lasts `frames` at 30 fps. */
export const framesAt = (frames: number, fps: number) => Math.max(1, Math.round((frames * fps) / BASE_FPS));

/** Lets the `fps` prop choose the frame rate at render time. */
export const metadataFor =
  (frames: number): CalculateMetadataFunction<VideoProps> =>
  ({ props }) => {
    const fps = clampFps(props.fps);
    return { fps, durationInFrames: framesAt(frames, fps) };
  };
