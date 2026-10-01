// Builds cloud textures off the main thread.

import { renderCloud, type CloudJob } from "./cloudNoise";

type Reply = { postMessage(message: unknown, transfer: Transferable[]): void };

self.onmessage = (e: MessageEvent<CloudJob & { id: number }>) => {
  const pixels = renderCloud(e.data);
  (self as unknown as Reply).postMessage({ id: e.data.id, pixels }, [pixels.buffer]);
};
