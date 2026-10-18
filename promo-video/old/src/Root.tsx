import { Composition, Folder, getInputProps } from "remotion";
import saved from "../texts.json";
import { GpuProbe, probeGpu } from "./GpuProbe";
import { mergeTexts } from "./shared/texts";
import { BASE_FPS } from "./shared/tokens";
import { HEIGHT, metadataFor, SCENE_COMPONENTS, type VideoProps, VIDEOS, WIDTH } from "./videos";
import "./shared/fonts";

// Three style candidates for the LightPlayer promo, 1920 x 1080, silent.
// The text comes from texts.json (edit it with `npm run editor`); pass
// `fps` in the props to render at another frame rate.
const defaultProps: VideoProps = { texts: mergeTexts(saved), fps: BASE_FPS };

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {getInputProps().gpuProbe ? <Composition id="GpuProbe" component={GpuProbe} durationInFrames={1} fps={BASE_FPS} width={16} height={16} calculateMetadata={probeGpu} /> : null}
      <Folder name="Candidates">
        {VIDEOS.map((v) => (
          <Composition
            key={v.id}
            id={v.id}
            component={v.Component}
            durationInFrames={v.duration}
            fps={BASE_FPS}
            width={WIDTH}
            height={HEIGHT}
            defaultProps={defaultProps}
            calculateMetadata={metadataFor(v.duration)}
          />
        ))}
      </Folder>
      {VIDEOS.map((v) => (
        <Folder key={v.id} name={`${v.key.toUpperCase()}-Scenes`}>
          {v.scenes.map((s) => (
            <Composition
              key={s.id}
              id={s.id}
              component={SCENE_COMPONENTS[s.id]}
              durationInFrames={s.duration}
              fps={BASE_FPS}
              width={WIDTH}
              height={HEIGHT}
              defaultProps={defaultProps}
              calculateMetadata={metadataFor(s.duration)}
            />
          ))}
        </Folder>
      ))}
    </>
  );
};
