// A small WebGL2 runner for the film's GLSL (animation-pv/js/shaders.js): it
// draws one full-canvas pass, so the website can show the same window
// compositor (UI over the weather sky or the video picture) and the same
// desktop wallpaper without Three.js. The film's shaders are written for
// Three's GLSL 1 style; a short prelude maps them onto GLSL ES 3.00, and the
// linear result is converted to sRGB for a plain canvas. The film's fragment
// sources already carry the shared helpers (noise, toSRGB and so on).
(function () {
  const PV = (window.PV = window.PV || {});

  const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  function fragment(src, linear) {
    return `#version 300 es
precision highp float;
#define varying in
#define texture2D texture
#define gl_FragColor fragColor
out vec4 fragColor;
#define main passMain
${src}
#undef main
void main() {
  passMain();
  vec3 c = ${linear ? "toSRGB(fragColor.rgb)" : "fragColor.rgb"};
  fragColor = vec4(c * fragColor.a, fragColor.a);
}`;
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader error");
    return s;
  }

  /**
   * Creates a pass on `canvas` running fragment source `src`. `linear` says
   * the shader outputs linear light (the window compositor does).
   * Returns null where WebGL2 is not available.
   */
  function createPass(canvas, src, { linear = false } = {}) {
    let gl = null;
    try {
      gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
    } catch {
      gl = null;
    }
    if (!gl) return null;
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragment(src, linear)));
      gl.bindAttribLocation(prog, 0, "aPos");
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link error");
    } catch (e) {
      console.warn("LightPlayer site: shader unavailable,", e.message);
      return null;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      uniforms[info.name] = { loc: gl.getUniformLocation(prog, info.name), type: info.type, value: null };
    }
    let tex = null;

    function set(name, value) {
      const u = uniforms[name];
      if (u) u.value = value;
    }
    /** Uploads a canvas (the UI layer) as the uMap texture. */
    function texture(source) {
      if (!tex) {
        tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      set("uMap", 0);
    }
    function render() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      if (tex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      }
      for (const u of Object.values(uniforms)) {
        const v = u.value;
        if (v == null) continue;
        switch (u.type) {
          case gl.FLOAT:
            gl.uniform1f(u.loc, v);
            break;
          case gl.FLOAT_VEC2:
            gl.uniform2fv(u.loc, v);
            break;
          case gl.FLOAT_VEC3:
            gl.uniform3fv(u.loc, v);
            break;
          case gl.FLOAT_VEC4:
            gl.uniform4fv(u.loc, v);
            break;
          case gl.SAMPLER_2D:
          case gl.INT:
            gl.uniform1i(u.loc, v);
            break;
        }
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    return { gl, set, texture, render };
  }

  /** "#rrggbb" to a float triple. */
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  PV.gl = { createPass, rgb };
})();
