import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";

export type SceneDef = {
  /** Composition id of the scene on its own, e.g. "A1-Opening". */
  id: string;
  /** Short Chinese name shown in Studio and the editor. */
  label: string;
  /** Length in 30 fps frames. */
  duration: number;
  Component: React.FC;
};

/** Total length: all scenes, minus the overlap of each crossfade. */
export const seriesLength = (scenes: SceneDef[], crossfade: number) =>
  scenes.reduce((n, s) => n + s.duration, 0) - crossfade * (scenes.length - 1);

/** Frame at which each scene starts in the full video. */
export const sceneStarts = (scenes: SceneDef[], crossfade: number) => {
  let at = 0;
  return scenes.map((s) => {
    const start = at;
    at += s.duration - crossfade;
    return start;
  });
};

/** The scenes one after another, crossfading for `crossfade` frames. */
export const Series: React.FC<{ name: string; scenes: SceneDef[]; crossfade: number; background: string }> = ({ name, scenes, crossfade, background }) => (
  <AbsoluteFill style={{ backgroundColor: background }}>
    <TransitionSeries name={name}>
      {scenes.flatMap(({ id, label, duration, Component }, i) => [
        ...(i > 0 ? [<TransitionSeries.Transition key={`${id}-in`} presentation={fade()} timing={linearTiming({ durationInFrames: crossfade })} />] : []),
        <TransitionSeries.Sequence key={id} name={label} durationInFrames={duration}>
          <Component />
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);
