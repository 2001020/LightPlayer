// GLSL sources for the film: the app window compositor (UI over the weather
// sky or the video picture), backgrounds, particles, chips, spectrum bars,
// soft shadows and the post-processing chain (bloom and final grade).
(function () {
  const PV = (window.PV = window.PV || {});

  const common = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

  const basicVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

  const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

  // ------------------------------------------------------------------ window
  // A rounded app window. The UI canvas is composited in sRGB (as the browser
  // would) over: nothing, the weather sky with rain and snow, or the video.
  const windowFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uSize;
uniform float uRadius;
uniform float uOpacity;
uniform float uMode;
uniform float uTime;
uniform float uBright;
uniform float uBorder;
uniform float uSheen;
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyBot;
uniform float uRain;
uniform float uSnow;
uniform float uStars;
uniform float uClouds;
uniform float uFlash;
uniform float uWind;
uniform float uSnowCover;
uniform vec4 uLedge;
uniform vec4 uVideo;
uniform float uVideoR;
uniform float uVideoT;
varying vec2 vUv;
${common}

vec3 skyColor(vec2 px) {
  float y = px.y / uSize.y;
  vec3 c = y < 0.55 ? mix(uSkyTop, uSkyMid, y / 0.55) : mix(uSkyMid, uSkyBot, (y - 0.55) / 0.45);
  return c;
}

float rainLayer(vec2 px, float cw, float ch, float speed, float len, float density, float seed) {
  vec2 q = vec2(px.x + px.y * uWind, px.y - uTime * speed);
  vec2 cell = floor(q / vec2(cw, ch));
  vec2 l = q - cell * vec2(cw, ch);
  vec2 r = hash22(cell + seed);
  if (r.y > density) return 0.0;
  float x = 2.0 + r.x * (cw - 4.0);
  float y0 = hash12(cell + seed + 7.1) * (ch - len);
  float dx = abs(l.x - x);
  float a = smoothstep(1.1, 0.2, dx) * step(y0, l.y) * step(l.y, y0 + len);
  float k = (l.y - y0) / len;
  return a * k;
}

float snowLayer(vec2 px, float cs, float speed, float size, float density, float seed) {
  float sway = sin(uTime * 0.8 + px.y * 0.01 + seed) * 6.0;
  vec2 q = vec2(px.x + sway + px.y * uWind * 0.5, px.y - uTime * speed);
  vec2 cell = floor(q / cs);
  vec2 l = q - cell * cs;
  vec2 r = hash22(cell + seed);
  if (hash12(cell + seed + 3.3) > density) return 0.0;
  vec2 c = 0.2 * cs + r * 0.6 * cs;
  float s = size * (0.6 + 0.6 * r.x);
  return smoothstep(s, s * 0.35, length(l - c));
}

vec3 weatherBack(vec2 px) {
  vec3 c = skyColor(px);
  float y = px.y / uSize.y;
  // stars and moon (clear night)
  if (uStars > 0.0) {
    vec2 g = floor(px / 9.0);
    float h = hash12(g);
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    float star = step(0.985, h) * smoothstep(1.4, 0.3, length(fract(px / 9.0) - 0.5) * 9.0) * tw;
    c += vec3(star) * uStars * (1.0 - smoothstep(0.35, 0.8, y));
    vec2 mc = vec2(uSize.x * 0.8, uSize.y * 0.17);
    float md = length(px - mc);
    c += vec3(0.85, 0.9, 1.0) * exp(-md / 70.0) * 0.18 * uStars;
    float disk = smoothstep(25.0, 23.5, md);
    float shade = smoothstep(25.0, 10.0, length(px - mc - vec2(9.0, -6.0)));
    c = mix(c, vec3(0.96, 0.95, 0.88), disk * (1.0 - 0.85 * shade) * uStars);
  }
  // cloud bands across the top of the sky
  if (uClouds > 0.0) {
    vec2 cp = vec2(px.x / 520.0 + uTime * 0.012, px.y / 170.0);
    float n = fbm(cp + vec2(0.0, uTime * 0.004));
    float band = smoothstep(0.42, 0.78, n) * (1.0 - smoothstep(0.05, 0.62, y));
    vec3 cc = mix(skyColor(px) * 1.25 + 0.05, vec3(0.92, 0.94, 0.97), 0.35);
    c = mix(c, cc, band * uClouds);
  }
  c += vec3(0.55, 0.6, 0.75) * uFlash;
  if (uRain > 0.0) {
    float r = rainLayer(px, 13.0, 140.0, 980.0, 26.0, 0.55, 1.0) * 0.42;
    r += rainLayer(px + 37.0, 19.0, 190.0, 1280.0, 38.0, 0.45, 5.0) * 0.52;
    c = mix(c, vec3(0.86, 0.9, 0.98), clamp(r * uRain, 0.0, 1.0));
  }
  if (uSnow > 0.0) {
    float s = snowLayer(px, 42.0, 38.0, 2.2, 0.5, 2.0) * 0.75;
    s += snowLayer(px + 13.0, 64.0, 62.0, 3.0, 0.45, 9.0) * 0.9;
    c = mix(c, vec3(1.0), clamp(s * uSnow, 0.0, 1.0));
  }
  return c;
}

vec3 weatherFront(vec3 c, vec2 px) {
  float x0 = uLedge.x;
  float x1 = uLedge.y;
  float ly = uLedge.z;
  // splashes on the play bar
  if (uRain > 0.0) {
    float cw = 23.0;
    float cell = floor(px.x / cw);
    float r = hash12(vec2(cell, 3.7));
    float period = 0.45 + r * 0.9;
    float a = fract(uTime / period + r * 9.0);
    float cx = (cell + 0.2 + 0.6 * hash12(vec2(cell, 9.1))) * cw;
    if (cx > x0 + 10.0 && cx < x1 - 10.0 && a < 0.3) {
      float k = a / 0.3;
      float s = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i) - 1.0;
        vec2 dp = vec2(cx + fi * 7.0 * k, ly - 1.5 - sin(k * 3.14159) * (5.0 + 3.0 * abs(fi)) * (1.0 - 0.3 * abs(fi)));
        s += smoothstep(1.6, 0.4, length(px - dp)) * (1.0 - k);
      }
      // the flattened drop ring
      vec2 e = (px - vec2(cx, ly - 0.5)) / vec2(4.0 + 8.0 * k, 1.4);
      s += smoothstep(1.0, 0.6, length(e)) * (1.0 - k) * 0.6;
      c = mix(c, vec3(0.9, 0.95, 1.0), clamp(s * uRain, 0.0, 1.0));
    }
    // a few big drops in front
    float near = rainLayer(px + 101.0, 61.0, 320.0, 1700.0, 60.0, 0.25, 11.0);
    c = mix(c, vec3(0.92, 0.95, 1.0), near * 0.45 * uRain);
  }
  if (uSnowCover > 0.0 && px.x > x0 + 7.0 && px.x < x1 - 7.0) {
    float edge = smoothstep(x0 + 7.0, x0 + 22.0, px.x) * smoothstep(x1 - 7.0, x1 - 22.0, px.x);
    float h = uSnowCover * edge * (2.2 + 2.6 * vnoise(vec2(px.x / 26.0, 1.0)) + 1.2 * vnoise(vec2(px.x / 7.0, 4.0)));
    float d = ly + 0.5 - px.y;
    float m = smoothstep(h + 0.8, h - 0.4, d) * step(-0.6, d);
    c = mix(c, vec3(0.97, 0.98, 1.0), m);
  }
  if (uSnow > 0.0) {
    float s = snowLayer(px + 71.0, 120.0, 90.0, 4.2, 0.35, 21.0);
    c = mix(c, vec3(1.0), s * 0.9 * uSnow);
  }
  return c;
}

vec3 videoPicture(vec2 uv, float t) {
  vec2 p = vec2(uv.x, 1.0 - uv.y);
  float hz = 0.43;
  vec2 sunP = vec2(0.56, hz + 0.075 - t * 0.0015);
  vec3 col;
  if (p.y > hz) {
    float h = (p.y - hz) / (1.0 - hz);
    col = mix(vec3(1.0, 0.56, 0.27), vec3(0.34, 0.33, 0.55), smoothstep(0.0, 0.55, h));
    col = mix(col, vec3(0.07, 0.11, 0.27), smoothstep(0.45, 1.0, h));
    float d = length((p - sunP) * vec2(16.0 / 9.0, 1.0));
    col += vec3(1.0, 0.7, 0.4) * (exp(-d * 7.0) * 0.55 + exp(-d * 26.0) * 0.8);
    col = mix(col, vec3(1.0, 0.93, 0.78), smoothstep(0.042, 0.037, d));
    vec2 cp = vec2(p.x * 2.6 + t * 0.012, (p.y - hz) * 9.0);
    float cl = fbm(cp + vec2(0.0, 0.3));
    float c2 = smoothstep(0.5, 0.82, cl) * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.55, 0.95, h));
    vec3 cc = mix(vec3(1.0, 0.55, 0.42), vec3(0.42, 0.3, 0.5), clamp(h * 1.6, 0.0, 1.0));
    col = mix(col, cc, c2 * 0.85);
  } else {
    float dpt = (hz - p.y) / hz;
    float persp = 1.0 / (dpt + 0.035);
    vec2 wp = vec2((p.x - 0.5) * persp * 1.6, persp * 0.9);
    float w = fbm(wp * vec2(1.4, 3.2) + vec2(t * 0.08, t * 0.35));
    float w2 = fbm(wp * vec2(3.0, 7.0) - vec2(t * 0.05, t * 0.5));
    vec3 sea = mix(vec3(0.6, 0.34, 0.3), vec3(0.03, 0.06, 0.13), pow(dpt, 0.45));
    float path = exp(-pow((p.x - sunP.x) * (1.4 + dpt * 1.5) * 5.0, 2.0));
    float glit = smoothstep(0.58, 0.85, w * 0.6 + w2 * 0.5) * path;
    col = sea + vec3(1.0, 0.72, 0.42) * glit * 1.6 * (1.1 - dpt) + vec3(1.0, 0.6, 0.35) * path * 0.22 * (1.0 - dpt);
    col += vec3(0.5, 0.6, 0.7) * smoothstep(0.75, 0.95, w2) * 0.08 * dpt;
  }
  vec2 q = uv - 0.5;
  col *= 1.0 - 0.35 * dot(q, q) * 1.6;
  return clamp(col, 0.0, 1.0);
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float d = sdRoundBox(px - uSize * 0.5, uSize * 0.5, uRadius);
  float aa = max(fwidth(d), 0.0001);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.0) discard;
  vec3 base = vec3(0.0);
  if (uMode > 0.5 && uMode < 1.5) base = weatherBack(px);
  if (uMode > 1.5) {
    vec2 vp = px - uVideo.xy;
    float vd = sdRoundBox(vp - uVideo.zw * 0.5, uVideo.zw * 0.5, uVideoR);
    if (vd < 0.5) {
      // object-fit: contain for a 16:9 picture
      float ar = uVideo.z / uVideo.w;
      vec2 uv = vp / uVideo.zw;
      vec2 sc = ar > 16.0 / 9.0 ? vec2(ar / (16.0 / 9.0), 1.0) : vec2(1.0, (16.0 / 9.0) / ar);
      vec2 vuv = (uv - 0.5) * sc + 0.5;
      bool inside = all(greaterThanEqual(vuv, vec2(0.0))) && all(lessThanEqual(vuv, vec2(1.0)));
      base = inside ? videoPicture(vuv, uVideoT) : vec3(0.0);
    }
  }
  vec4 ui = texture2D(uMap, vUv);
  vec3 c = mix(base, ui.rgb, ui.a);
  if (uMode > 0.5 && uMode < 1.5) c = weatherFront(c, px);
  vec3 lin = toLinear(c) * uBright;
  // hairline window border
  float rim = smoothstep(-1.6, -0.4, d) * uBorder;
  lin += vec3(0.16) * rim;
  // a soft sheen that sweeps across the glass
  if (uSheen > -1.0) {
    float s = (vUv.x * 0.8 + (1.0 - vUv.y) * 0.45) - uSheen;
    lin += vec3(0.06) * exp(-s * s * 60.0);
  }
  gl_FragColor = vec4(lin, mask * uOpacity);
}
`;

  // ------------------------------------------------------------------ flat textured card
  // Rounded rectangle with a texture (desktop lyrics, menu bar, tiles, covers).
  const cardFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uSize;
uniform float uRadius;
uniform float uOpacity;
uniform vec4 uCell;
uniform float uBright;
uniform float uSRGB;
varying vec2 vUv;
${common}
void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float d = sdRoundBox(px - uSize * 0.5, uSize * 0.5, uRadius);
  float aa = max(fwidth(d), 0.0001);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  vec4 t = texture2D(uMap, uCell.xy + vUv * uCell.zw);
  vec3 c = uSRGB > 0.5 ? toLinear(t.rgb) : t.rgb;
  float a = t.a * mask * uOpacity;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(c * uBright, a);
}
`;

  // ------------------------------------------------------------------ soft shadow / glow
  const shadowFrag = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uBox;
uniform float uRadius;
uniform float uBlur;
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
${common}
void main() {
  vec2 px = (vUv - 0.5) * uSize;
  float d = sdRoundBox(px, uBox * 0.5, uRadius);
  float a = 1.0 - smoothstep(-uBlur * 0.5, uBlur, d);
  a = a * a * uAlpha;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

  // ------------------------------------------------------------------ backgrounds
  const wallpaperFn = /* glsl */ `
vec3 wallpaper(vec2 uv, float t) {
  vec3 c = mix(vec3(0.015, 0.03, 0.09), vec3(0.04, 0.09, 0.24), uv.y);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float y0 = 0.86 - fi * 0.13 + 0.06 * sin(uv.x * 2.6 + fi * 1.9 + t * 0.06) + 0.025 * sin(uv.x * 6.3 - fi * 1.3 - t * 0.09);
    float dd = uv.y - y0;
    float below = smoothstep(0.003, -0.003, dd);
    vec3 a = mix(vec3(0.16, 0.55, 1.0), vec3(0.52, 0.32, 0.95), fi / 5.0);
    vec3 b = mix(vec3(0.02, 0.12, 0.38), vec3(0.12, 0.05, 0.3), fi / 5.0);
    float crest = exp(max(-dd, 0.0) * -9.0);
    vec3 band = mix(b, a, crest * 0.85);
    c *= 1.0 - 0.35 * exp(-max(dd, 0.0) * 40.0) * step(0.0, dd) * (1.0 - below);
    c = mix(c, band, below);
  }
  float g = fbm(uv * vec2(3.0, 2.0) + t * 0.01);
  c += vec3(0.02, 0.04, 0.08) * g;
  return c;
}
`;

  const backgroundFrag = /* glsl */ `
uniform float uTime;
uniform float uAspect;
uniform float uAurora;
uniform float uWall;
uniform float uLift;
uniform vec3 uTint;
uniform vec3 uTint2;
uniform vec2 uCenter;
varying vec2 vUv;
${common}
${wallpaperFn}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec3 col = vec3(0.0);
  if (uAurora > 0.0) {
    float t = uTime;
    float n1 = fbm(p * 0.75 + vec2(t * 0.02, -t * 0.014));
    float n2 = fbm(p * 1.05 - vec2(t * 0.012, t * 0.008) + 4.0);
    float r = length((p - uCenter) * vec2(0.75, 1.15));
    vec3 a = uTint * smoothstep(0.3, 0.85, n1) + uTint2 * 0.7 * smoothstep(0.45, 0.95, n2);
    a *= smoothstep(1.3, 0.0, r);
    a += uTint * 0.35 * exp(-r * r * 3.0);
    col += a * uAurora;
  }
  if (uLift > 0.0) col += vec3(0.012, 0.014, 0.02) * uLift * (1.0 - vUv.y);
  if (uWall > 0.0) col = mix(col, toLinear(wallpaper(vUv, uTime)), uWall);
  gl_FragColor = vec4(col, 1.0);
}
`;

  const wallpaperFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
${common}
${wallpaperFn}
void main() {
  gl_FragColor = vec4(toLinear(wallpaper(vUv, uTime)), uOpacity);
}
`;

  // ------------------------------------------------------------------ particles
  const particlesVert = /* glsl */ `
attribute vec4 aSeed;
attribute vec3 aTarget;
uniform float uTime;
uniform float uConverge;
uniform float uSpread;
uniform float uSize;
uniform float uPixel;
varying float vAlpha;
varying float vHue;
${common}
void main() {
  float t = uTime;
  vec3 drift = vec3(
    (aSeed.x - 0.5) * 26.0 + sin(t * 0.21 + aSeed.w * 6.28) * 0.6,
    (aSeed.y - 0.5) * 15.0 + cos(t * 0.17 + aSeed.z * 6.28) * 0.5,
    -aSeed.z * 30.0 + 6.0 + mod(t * (0.6 + aSeed.w * 1.6), 30.0) - 15.0
  );
  drift.xy *= uSpread;
  float k = clamp(uConverge * 1.6 - aSeed.w * 0.6, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);
  vec3 pos = mix(drift, aTarget, k);
  // a little swirl on the way in
  float sw = (1.0 - k) * k * 3.0;
  pos.xy += vec2(-pos.y, pos.x) * sw * 0.15;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = uSize * (0.35 + pow(aSeed.x, 4.0) * 3.2) * mix(1.0, 0.6, k);
  gl_PointSize = size * uPixel / -mv.z;
  vAlpha = (0.35 + 0.65 * aSeed.y) * smoothstep(-40.0, -6.0, mv.z) * smoothstep(-0.5, -3.0, mv.z);
  vHue = aSeed.z;
}
`;
  const particlesFrag = /* glsl */ `
uniform float uOpacity;
uniform float uGlow;
varying float vAlpha;
varying float vHue;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  vec3 col = mix(vec3(0.40, 0.80, 1.0), vec3(0.85, 0.92, 1.0), step(0.72, vHue));
  col = mix(col, vec3(0.55, 0.45, 1.0), step(0.93, vHue));
  gl_FragColor = vec4(col * uGlow, a * vAlpha * uOpacity);
}
`;

  // ------------------------------------------------------------------ instanced atlas cards (chips, tokens)
  const atlasVert = /* glsl */ `
attribute vec4 aCell;
attribute float aAlpha;
attribute float aGlow;
varying vec2 vUv;
varying float vAlpha;
varying float vGlow;
void main() {
  vUv = aCell.xy + uv * aCell.zw;
  vAlpha = aAlpha;
  vGlow = aGlow;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;
  const atlasFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vGlow;
${common}
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha * uOpacity;
  if (a <= 0.002) discard;
  vec3 c = toLinear(t.rgb) * (1.0 + vGlow);
  gl_FragColor = vec4(c, a);
}
`;

  // ------------------------------------------------------------------ spectrum bars
  const barsVert = /* glsl */ `
attribute float aHeight;
attribute float aIndex;
varying vec2 vUv;
varying float vH;
varying float vI;
void main() {
  vUv = uv;
  vH = aHeight;
  vI = aIndex;
  vec3 p = position;
  p.y = (p.y + 0.5) * aHeight;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;
  const barsFrag = /* glsl */ `
uniform float uOpacity;
uniform float uGlow;
uniform float uWidth;
varying vec2 vUv;
varying float vH;
varying float vI;
void main() {
  // capsule: round the ends
  float w = uWidth;
  float y = vUv.y * vH;
  float x = (vUv.x - 0.5) * w;
  float r = w * 0.5;
  float dy = max(max(r - y, y - (vH - r)), 0.0);
  float d = length(vec2(x, dy)) - r;
  float a = 1.0 - smoothstep(-0.004, 0.004, d);
  vec3 c1 = vec3(0.40, 0.80, 1.0);
  vec3 c2 = vec3(0.70, 0.55, 1.0);
  vec3 col = mix(c1, c2, smoothstep(0.0, 1.0, vI)) * (0.7 + 0.6 * vUv.y);
  gl_FragColor = vec4(col * uGlow, a * uOpacity);
}
`;

  // ------------------------------------------------------------------ post
  const brightFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.6, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`;
  const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 h = uTexel;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv - h).rgb;
  s += texture2D(tSrc, vUv + h).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb;
  s += texture2D(tSrc, vUv - vec2(h.x, -h.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}
`;
  const upFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tAdd;
uniform vec2 uTexel;
uniform float uAddWeight;
varying vec2 vUv;
void main() {
  vec2 h = uTexel;
  vec3 s = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb * uAddWeight, 1.0);
}
`;
  const compositeFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tCaption;
uniform float uBloom;
uniform float uTime;
uniform float uFade;
uniform float uFlash;
uniform float uVignette;
uniform float uGrain;
uniform float uExposure;
uniform float uCaptionOn;
uniform vec2 uRes;
varying vec2 vUv;
${common}
vec3 softClip(vec3 x) {
  vec3 k = vec3(0.9);
  return mix(x, k + 0.1 * (1.0 - exp(-(x - k) / 0.1)), step(k, x));
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb * uExposure;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c = softClip(c);
  vec2 q = vUv - 0.5;
  c *= mix(1.0, 1.0 - smoothstep(0.25, 0.85, length(q * vec2(1.0, 1.15))) * 0.85, uVignette);
  c = toSRGB(c);
  c += (hash12(vUv * uRes + fract(uTime * 7.13) * 431.0) - 0.5) * uGrain;
  c = mix(c, vec3(1.0), uFlash);
  c *= uFade;
  if (uCaptionOn > 0.5) {
    vec4 cap = texture2D(tCaption, vUv);
    c = mix(c, cap.rgb, cap.a);
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

  PV.shaders = {
    common,
    basicVert,
    fullscreenVert,
    windowFrag,
    cardFrag,
    shadowFrag,
    backgroundFrag,
    wallpaperFrag,
    particlesVert,
    particlesFrag,
    atlasVert,
    atlasFrag,
    barsVert,
    barsFrag,
    brightFrag,
    downFrag,
    upFrag,
    compositeFrag,
  };
})();
