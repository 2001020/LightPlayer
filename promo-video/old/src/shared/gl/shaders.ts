// GLSL ES 3.00 fragment shaders for <ShaderCanvas>. Every shader is a pure
// function of u_time and its uniforms, so any frame can be rendered alone.

const HEADER = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
out vec4 o;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
vec3 tonemap(vec3 c) { return 1.0 - exp(-c); }
`;

/**
 * A horizontal beam of light that grows from the center.
 * u_grow 0..1 length, u_power brightness, u_y vertical offset (-0.5..0.5).
 */
export const BEAM = `${HEADER}
uniform float u_grow;
uniform float u_power;
uniform float u_y;
uniform vec3 u_tint;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float dy = p.y - u_y;
  float len = u_grow * 1.05;
  float along = smoothstep(len, len * 0.15, abs(p.x));
  float core = exp(-abs(dy) * 700.0) * along;
  float halo = exp(-abs(dy) * 34.0) * along * 0.32;
  float bloom = exp(-length(vec2(p.x * 0.42, dy)) * 5.0) * 0.38 * u_grow;
  float flare = exp(-abs(dy) * 260.0) * exp(-abs(p.x) * 1.2) * 0.6 * u_grow;
  float shimmer = 0.85 + 0.15 * noise(vec2(p.x * 6.0 - u_time * 0.8, u_time * 0.5));
  vec3 c = vec3(1.0) * core * 2.2 + u_tint * (halo + bloom) * shimmer + mix(u_tint, vec3(1.0), 0.5) * flare;
  // A few drifting motes of dust in the light.
  vec2 g = p * 38.0 + vec2(u_time * 0.6, u_time * 0.25);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 - (vec2(hash(id), hash(id + 3.1)) - 0.5) * 0.7;
  float mote = smoothstep(0.06, 0.0, length(f)) * step(0.93, hash(id + 7.7)) * exp(-abs(dy) * 4.0) * u_grow;
  c += u_tint * mote * 0.9;
  o = vec4(tonemap(c * u_power), 1.0);
}
`;

/**
 * Weather sky behind the window: gradient, sun, clouds, stars and moon.
 * Colors and amounts come from the scene's keyframes.
 */
export const SKY = `${HEADER}
uniform vec3 u_top;
uniform vec3 u_horizon;
uniform float u_sun;
uniform vec2 u_sunPos;
uniform float u_cloud;
uniform vec3 u_cloudLit;
uniform vec3 u_cloudShade;
uniform float u_night;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec3 col = mix(u_horizon, u_top, pow(uv.y, 0.85));

  // Stars and moon.
  vec2 sp = uv * vec2(aspect, 1.0) * 140.0;
  vec2 sid = floor(sp);
  vec2 sf = fract(sp) - 0.5;
  float star = step(0.985, hash(sid)) * smoothstep(0.18, 0.0, length(sf));
  star *= 0.6 + 0.4 * sin(u_time * 2.0 + hash(sid + 1.3) * 30.0);
  col += vec3(star) * u_night * smoothstep(0.25, 0.7, uv.y);
  vec2 mp = (uv - vec2(0.24, 0.78)) * vec2(aspect, 1.0);
  float moon = smoothstep(0.052, 0.048, length(mp));
  float moonCut = smoothstep(0.05, 0.046, length(mp - vec2(0.022, 0.012)));
  col += vec3(1.0, 0.97, 0.88) * (moon - moonCut * 0.92) * u_night;
  col += vec3(0.5, 0.6, 0.9) * exp(-length(mp) * 9.0) * 0.25 * u_night;

  // Sun with a wide warm glow.
  vec2 dp = (uv - u_sunPos) * vec2(aspect, 1.0);
  float d = length(dp);
  col += vec3(1.0, 0.95, 0.8) * smoothstep(0.065, 0.058, d) * u_sun;
  col += vec3(1.0, 0.85, 0.6) * exp(-d * 5.0) * 0.55 * u_sun;
  col += vec3(1.0, 0.9, 0.75) * exp(-d * 1.4) * 0.18 * u_sun;

  // Two layers of drifting clouds, lit from the top.
  vec2 cp = uv * vec2(aspect, 1.0) * 2.2 + vec2(u_time * 0.035, 0.0);
  float n1 = fbm(cp + vec2(0.0, u_time * 0.01));
  float n2 = fbm(cp * 1.8 + vec2(u_time * 0.05, 3.0));
  float cover = mix(0.72, 0.32, u_cloud);
  float c1 = smoothstep(cover, cover + 0.22, n1) * smoothstep(0.05, 0.45, uv.y + 0.15);
  float c2 = smoothstep(cover + 0.05, cover + 0.3, n2) * 0.7;
  float shade = smoothstep(0.35, 0.85, fbm(cp + vec2(0.0, 0.25)));
  vec3 cloudCol = mix(u_cloudLit, u_cloudShade, shade);
  col = mix(col, cloudCol, clamp(c1 + c2 * (1.0 - c1), 0.0, 1.0) * 0.92);
  o = vec4(col, 1.0);
}
`;

/** Rain streaks and snowflakes in front of everything (transparent). */
export const PRECIP = `${HEADER}
uniform float u_rain;
uniform float u_snow;
void main() {
  vec2 p = gl_FragCoord.xy / u_res.y;
  float a = 0.0;
  // Rain: three depths of slanted streaks.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 22.0 + fi * 16.0;
    vec2 q = vec2(p.x + p.y * 0.18, p.y) * vec2(scale, scale * 0.12);
    q.y += u_time * (2.6 + fi * 0.8);
    vec2 id = floor(q);
    vec2 f = fract(q);
    float r = hash(id + fi * 17.0);
    float on = step(0.72, r);
    float x = abs(f.x - 0.2 - 0.6 * hash(id.xx + 3.0 + fi));
    float drop = smoothstep(0.05, 0.0, x) * smoothstep(0.0, 0.6, f.y) * smoothstep(1.0, 0.75, f.y);
    a += drop * on * (0.55 - fi * 0.12);
  }
  a *= u_rain;
  // Snow: soft flakes that sway as they fall.
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 9.0 + fi * 7.0;
    vec2 q = p * scale;
    q.y += u_time * (0.55 + fi * 0.25);
    q.x += sin(q.y * 0.9 + fi * 2.0 + u_time * 0.7) * 0.35;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5 - (vec2(hash(id), hash(id + 5.2)) - 0.5) * 0.6;
    float on = step(0.45, hash(id + 9.1 + fi));
    s += smoothstep(0.11 - fi * 0.025, 0.0, length(f)) * on * (0.95 - fi * 0.2);
  }
  a += s * u_snow;
  o = vec4(vec3(1.0), clamp(a, 0.0, 1.0) * 0.85);
}
`;

/** A calm desktop wallpaper: slow luminous bands of color. */
export const WALLPAPER = `${HEADER}
uniform vec3 u_a;
uniform vec3 u_b;
uniform vec3 u_c;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0);
  vec3 col = mix(u_a, u_b, uv.y);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = 0.25 + fi * 0.16 + 0.07 * sin(p.x * (1.4 + fi * 0.35) + u_time * 0.25 + fi * 1.7) + 0.04 * fbm(p * 1.5 + fi);
    float band = smoothstep(0.16, 0.0, abs(uv.y - y));
    float edge = exp(-abs(uv.y - y) * 60.0);
    col = mix(col, mix(u_b, u_c, 0.4 + fi * 0.18), band * 0.35);
    col += u_c * edge * 0.12;
  }
  col *= 0.9 + 0.1 * fbm(p * 3.0 + u_time * 0.05);
  o = vec4(col, 1.0);
}
`;

/**
 * Flowing mesh gradient (Apple Music style): four colors warped by noise.
 * u_c0..u_c3 are the palette, u_dark darkens toward the edges.
 */
export const AURORA = `${HEADER}
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_dark;
float soft(vec2 p) {
  float v = 0.0, a = 0.6;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 1.9 + 7.3; a *= 0.45; }
  return v / 0.96;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 0.9;
  float t = u_time * 0.09;
  vec2 q = vec2(soft(p + vec2(t, -t * 0.7)), soft(p + vec2(-t * 0.6, t * 0.5) + 4.2));
  vec2 r = vec2(soft(p * 1.1 + 1.6 * q + vec2(1.7, 9.2) + t * 0.8), soft(p * 1.1 + 1.6 * q + vec2(8.3, 2.8) - t * 0.6));
  float a = smoothstep(0.18, 0.82, r.x);
  float b = smoothstep(0.2, 0.8, r.y);
  vec3 col = mix(mix(u_c0, u_c1, a), mix(u_c2, u_c3, a), b);
  // Soft light pooling where the bright colors meet.
  col += (u_c3 - col) * 0.18 * smoothstep(0.55, 0.95, a * b);
  float vig = smoothstep(1.3, 0.2, length((uv - 0.5) * vec2(1.25, 1.0)));
  col *= mix(1.0, vig, u_dark);
  // A whisper of grain so the gradients do not band.
  col += (hash(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) / 255.0 * 2.0;
  o = vec4(col, 1.0);
}
`;
