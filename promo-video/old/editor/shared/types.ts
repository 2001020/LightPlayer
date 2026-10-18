// Shapes shared by the editor page and its local server.

export const HEIGHTS = [720, 1080, 1440, 2160] as const;
export const FRAME_RATES = [24, 25, 30, 50, 60] as const;
export const CODECS = ["h264", "h265", "prores"] as const;

export type Height = (typeof HEIGHTS)[number];
export type FrameRate = (typeof FRAME_RATES)[number];
export type VideoCodec = (typeof CODECS)[number];

export type ExportSettings = {
  /** Composition id, e.g. "A-Dark". */
  video: string;
  height: Height;
  fps: FrameRate;
  codec: VideoCodec;
  quality: "high" | "standard";
  /** Draw frames with the graphics card (WebGL, blur, 3D). */
  gpu: boolean;
  /** Encode with the graphics card's video encoder when there is one. */
  hwEncode: boolean;
};

export type Stage = "bundle" | "browser" | "prepare" | "render" | "finish";

export type JobStatus = {
  id: number;
  state: "idle" | "running" | "done" | "error" | "cancelled";
  stage?: Stage;
  /** 0..1 across the whole export. */
  progress: number;
  /** Shown under the bar, e.g. download progress of the render browser. */
  detail?: string;
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
  startedAt?: number;
  finishedAt?: number;
  /** Milliseconds left, once there is enough to estimate from. */
  etaMs?: number;
  settings?: ExportSettings;
  output?: string;
  outputName?: string;
  size?: number;
  /** Human readable: which renderer and encoder were used. */
  renderer?: string;
  encoder?: string;
  notes: string[];
  error?: string;
};

export type GpuReport = {
  /** True when WebGL in the render browser runs on a graphics card. */
  accelerated: boolean;
  /** WebGL's renderer string, e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, …)". */
  renderer: string;
  error?: string;
};

export type SystemInfo = {
  platform: string;
  outDir: string;
  /** Hardware video encoders that worked in a quick test, per codec. */
  hwEncoders: Partial<Record<VideoCodec, string>>;
};
