import type { CalculateMetadataFunction } from "remotion";

export type GpuProbeProps = { renderer?: string };

/**
 * Not a video: the editor selects this composition to learn which WebGL
 * renderer the render browser uses (a GPU, or SwiftShader in software).
 */
export const GpuProbe: React.FC<GpuProbeProps> = () => null;

export const probeGpu: CalculateMetadataFunction<GpuProbeProps> = () => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  let renderer = "WebGL 不可用";
  if (gl) {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  }
  return { props: { renderer } };
};
