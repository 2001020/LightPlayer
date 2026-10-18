import { Sequence, useVideoConfig } from "remotion";
import { BASE_FPS } from "./tokens";

/**
 * The scenes count frames at 30 fps. At any other rate this plays them back
 * at the matching speed, so children see (fractional) 30 fps frames and a
 * 60 fps export gets genuinely new in-between frames instead of repeats.
 * A Sequence's playbackRate is used rather than <Freeze>, because Remotion
 * clamps frozen frames to the composition length, which is shorter than the
 * 30 fps length below 30 fps.
 */
export const TimeScale: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { fps } = useVideoConfig();
  if (fps === BASE_FPS) return <>{children}</>;
  return (
    <Sequence layout="none" playbackRate={BASE_FPS / fps} name={`${fps} fps`}>
      {children}
    </Sequence>
  );
};
