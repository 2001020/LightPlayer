import { useLayoutEffect } from "react";
import { continueRender, delayRender, useCurrentFrame } from "remotion";

/**
 * The CJK font is split into many small files that load when a character
 * first appears. On every frame this forces a layout, and if that started
 * loading a font file, holds the frame until it has arrived.
 */
export const FontSync: React.FC = () => {
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    void document.body.offsetHeight;
    if (document.fonts.status === "loaded") return;
    const handle = delayRender(`Loading fonts for frame ${frame}`);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      continueRender(handle);
    };
    void document.fonts.ready.then(finish);
    return finish;
  }, [frame]);
  return null;
};
