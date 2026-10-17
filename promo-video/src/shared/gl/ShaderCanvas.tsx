import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export type Uniforms = Record<string, number | readonly number[]>;

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

type GLState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  locs: Map<string, WebGLUniformLocation | null>;
};

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
  return s;
}

function init(canvas: HTMLCanvasElement, frag: string): GLState {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
  if (!gl) throw new Error("WebGL2 is not available");
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link error");
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return { gl, program, locs: new Map() };
}

/**
 * A full-frame GLSL ES 3.00 fragment shader. It gets `u_res` (pixels),
 * `u_time` (seconds, from the current frame) and the given uniforms, and
 * redraws on every frame so renders stay deterministic.
 */
export const ShaderCanvas: React.FC<{
  frag: string;
  uniforms?: Uniforms;
  /** Drawing-buffer size relative to the composition (lower is faster). */
  resolution?: number;
  width?: number;
  height?: number;
  style?: CSSProperties;
}> = ({ frag, uniforms = {}, resolution = 1, width, height, style }) => {
  const frame = useCurrentFrame();
  const { fps, width: vw, height: vh } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef<GLState | null>(null);
  const w = Math.round((width ?? vw) * resolution);
  const h = Math.round((height ?? vh) * resolution);

  useLayoutEffect(() => {
    const canvas = ref.current!;
    if (!state.current) state.current = init(canvas, frag);
    const { gl, program, locs } = state.current;
    const set = (name: string, v: number | readonly number[]) => {
      if (!locs.has(name)) locs.set(name, gl.getUniformLocation(program, name));
      const l = locs.get(name)!;
      if (!l) return;
      if (typeof v === "number") gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    };
    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    set("u_res", [w, h]);
    set("u_time", frame / fps);
    for (const [k, v] of Object.entries(uniforms)) set(k, v);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ position: "absolute", inset: 0, width: width ?? "100%", height: height ?? "100%", ...style }}
    />
  );
};
