// Original album covers and video stills, drawn as SVG so the video needs no
// image files. `coverUrl()` gives a data URL for <Img>; `coverSvg()` the raw
// markup for textures.

/** A small deterministic random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

function stars(seed: number, n: number, w: number, h: number, maxY: number) {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h * maxY;
    const s = 0.6 + r() * 1.8;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="#fff" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}

const NIGHT = svg(
  600,
  600,
  `<defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050d26"/><stop offset=".5" stop-color="#143a75"/><stop offset=".78" stop-color="#2f8fcf"/><stop offset="1" stop-color="#8fdcff"/></linearGradient>
    <radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d8" stop-opacity=".9"/><stop offset=".35" stop-color="#fff6d8" stop-opacity=".25"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#s)"/>
  ${stars(7, 70, 600, 600, 0.55)}
  <circle cx="410" cy="190" r="150" fill="url(#g)"/>
  <circle cx="410" cy="190" r="44" fill="#fffbea"/>
  <path d="M0 470 C 120 420 220 440 320 470 S 520 430 600 455 L600 600 L0 600Z" fill="#0b1f45"/>
  <path d="M0 520 C 160 480 260 500 380 525 S 540 505 600 515 L600 600 L0 600Z" fill="#06122c"/>`,
);

const SEA = svg(
  600,
  600,
  `<defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1150"/><stop offset=".35" stop-color="#9b2f6e"/><stop offset=".55" stop-color="#ff7a6b"/><stop offset=".62" stop-color="#ffc58a"/></linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c9"/><stop offset="1" stop-color="#ffab6b"/></linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2a6e"/><stop offset="1" stop-color="#160a2e"/></linearGradient>
  </defs>
  <rect width="600" height="380" fill="url(#s)"/>
  <circle cx="300" cy="372" r="104" fill="url(#sun)"/>
  <rect y="372" width="600" height="228" fill="url(#sea)"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7]
    .map((i) => {
      const w = 210 - i * 22;
      return `<rect x="${300 - w / 2}" y="${384 + i * 22}" width="${w}" height="${6 - i * 0.5}" rx="3" fill="#ffc98f" opacity="${(0.85 - i * 0.1).toFixed(2)}"/>`;
    })
    .join("")}`,
);

const SLOW = svg(
  600,
  600,
  `<rect width="600" height="600" fill="#f3ebdd"/>
  <circle cx="215" cy="385" r="175" fill="#e07a5f"/>
  <circle cx="405" cy="225" r="135" fill="#81b29a" style="mix-blend-mode:multiply"/>
  <path d="M330 600 A 150 150 0 0 1 600 600 Z" fill="#f2cc8f"/>
  <circle cx="455" cy="455" r="34" fill="#3d405b"/>
  <rect x="70" y="80" width="150" height="10" rx="5" fill="#3d405b"/>
  <rect x="70" y="104" width="96" height="10" rx="5" fill="#3d405b" opacity=".5"/>`,
);

function rays() {
  let out = "";
  for (let i = 0; i < 9; i++) {
    const a0 = (100 + i * 12) * (Math.PI / 180);
    const a1 = a0 + 0.07;
    const L = 900;
    out += `<path d="M480 90 L${(480 + Math.cos(a0) * L).toFixed(0)} ${(90 + Math.sin(a0) * L).toFixed(0)} L${(480 + Math.cos(a1) * L).toFixed(0)} ${(90 + Math.sin(a1) * L).toFixed(0)}Z" fill="#fff" opacity="${(0.06 + (i % 3) * 0.035).toFixed(3)}"/>`;
  }
  return out;
}

const RAYS = svg(
  600,
  600,
  `<defs><radialGradient id="g" cx=".8" cy=".15" r="1"><stop offset="0" stop-color="#fff3bf"/><stop offset=".22" stop-color="#ffc35a"/><stop offset=".5" stop-color="#ff7461"/><stop offset=".8" stop-color="#9b2c6e"/><stop offset="1" stop-color="#4a1958"/></radialGradient></defs>
  <rect width="600" height="600" fill="url(#g)"/>
  ${rays()}
  <circle cx="480" cy="90" r="38" fill="#fffbe8"/>
  <path d="M0 540 L600 500 L600 600 L0 600Z" fill="#3a1247" opacity=".85"/>`,
);

function city() {
  const r = rng(42);
  let out = "";
  let x = -10;
  while (x < 600) {
    const w = 38 + r() * 46;
    const h = 120 + r() * 220;
    out += `<rect x="${x.toFixed(0)}" y="${(600 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#0c0720"/>`;
    for (let wy = 600 - h + 14; wy < 585; wy += 18) {
      for (let wx = x + 8; wx < x + w - 10; wx += 14) {
        if (r() < 0.32) out += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="6" height="8" fill="#ffd27a" opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`;
      }
    }
    x += w + 4;
  }
  return out;
}

const CITY = svg(
  600,
  600,
  `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f0826"/><stop offset=".45" stop-color="#3a1a62"/><stop offset=".75" stop-color="#c2417f"/><stop offset="1" stop-color="#ff8f5e"/></linearGradient></defs>
  <rect width="600" height="600" fill="url(#s)"/>
  ${stars(11, 40, 600, 600, 0.4)}
  <circle cx="140" cy="130" r="30" fill="#ffe9f2" opacity=".95"/>
  ${city()}`,
);

function petals() {
  const r = rng(5);
  let out = "";
  for (let i = 0; i < 26; i++) {
    const x = r() * 600;
    const y = r() * 600;
    const s = 8 + r() * 14;
    out += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${s.toFixed(1)}" ry="${(s * 0.55).toFixed(1)}" transform="rotate(${(r() * 180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${r() < 0.5 ? "#ff8fab" : "#ffc2d1"}" opacity="${(0.55 + r() * 0.4).toFixed(2)}"/>`;
  }
  return out;
}

const SPRING = svg(
  600,
  600,
  `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe1ea"/><stop offset=".55" stop-color="#fff0dc"/><stop offset="1" stop-color="#d8f3d0"/></linearGradient></defs>
  <rect width="600" height="600" fill="url(#s)"/>
  <path d="M-20 140 C 120 170 230 150 330 210 S 520 330 640 300" stroke="#6b4f45" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M250 175 C 270 120 300 100 340 90" stroke="#6b4f45" stroke-width="6" fill="none" stroke-linecap="round"/>
  ${petals()}
  <circle cx="330" cy="210" r="26" fill="#ff7096"/><circle cx="340" cy="90" r="20" fill="#ff8fab"/><circle cx="520" cy="300" r="24" fill="#ff7096"/>`,
);

export const COVERS = [NIGHT, SEA, SLOW, RAYS, CITY, SPRING];

/** Abstract covers for the media wall. */
export function genCover(seed: number) {
  const r = rng(seed * 977 + 13);
  const h = Math.floor(r() * 360);
  const h2 = (h + 30 + Math.floor(r() * 80)) % 360;
  const kind = seed % 4;
  let shapes = "";
  if (kind === 0) shapes = `<circle cx="${200 + r() * 200}" cy="${200 + r() * 200}" r="${120 + r() * 80}" fill="hsl(${h2},80%,70%)" opacity=".85"/>`;
  if (kind === 1)
    shapes = [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="300" cy="300" r="${60 + i * 42}" fill="none" stroke="hsl(${h2},90%,80%)" stroke-width="10" opacity="${0.8 - i * 0.12}"/>`).join("");
  if (kind === 2)
    shapes = [0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="0" y="${i * 90 + 20}" width="600" height="${18 + (i % 3) * 10}" fill="hsl(${h2},85%,${60 + i * 4}%)" opacity=".7"/>`).join("");
  if (kind === 3) shapes = `<path d="M0 ${380 + r() * 80} Q 300 ${180 + r() * 120} 600 ${360 + r() * 80} L600 600 L0 600Z" fill="hsl(${h2},70%,35%)"/><circle cx="${150 + r() * 300}" cy="180" r="56" fill="hsl(${h2},90%,88%)"/>`;
  return svg(
    600,
    600,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},75%,62%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},70%,30%)"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/>${shapes}`,
  );
}

/** Landscape stills for the video tiles (16:9). */
export function genFrame(seed: number) {
  const r = rng(seed * 131 + 7);
  const h = Math.floor(r() * 360);
  const layers = [0, 1, 2]
    .map((i) => {
      let d = `M0 ${330 - i * 0 + i * 40}`;
      for (let x = 0; x <= 960; x += 60) d += ` L${x} ${(260 + i * 60 + Math.sin(x / (90 + i * 30) + seed + i) * (40 - i * 8) + r() * 20).toFixed(0)}`;
      d += " L960 540 L0 540Z";
      return `<path d="${d}" fill="hsl(${(h + 200) % 360},${30 + i * 10}%,${32 - i * 9}%)" opacity="${0.75 + i * 0.12}"/>`;
    })
    .join("");
  return svg(
    960,
    540,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h},70%,${55 + r() * 15}%)"/><stop offset="1" stop-color="hsl(${(h + 30) % 360},80%,80%)"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><circle cx="${200 + r() * 560}" cy="${150 + r() * 80}" r="${40 + r() * 30}" fill="#fff6dc" opacity=".9"/>${layers}`,
  );
}

export const svgUrl = (markup: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
export const coverUrl = (i: number) => svgUrl(COVERS[i % COVERS.length]);
