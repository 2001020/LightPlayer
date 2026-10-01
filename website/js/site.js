// The LightPlayer site: language switch, scroll reveals, and the live app
// windows. Every window is the app's UI drawn by the promo film's Canvas2D
// kit (animation-pv/js/ui.js); the weather sky, the video picture and the
// desktop wallpaper come from the film's GLSL through js/gl.js.
(function () {
  const PV = window.PV;
  const { clamp, lerp, ease, prog, envelope } = PV.util;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const root = document.documentElement;
  root.classList.add("js");

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const { W: UW, H: UH } = PV.UI_SIZE;
  const clock = () => performance.now() / 1000;
  const mod = (a, n) => ((a % n) + n) % n;

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch {
      return null;
    }
    return null;
  }

  // ------------------------------------------------------------ language
  const EN = window.SITE_EN || {};
  const ZH = {
    "vid.enter": "进入沉浸模式",
    "vid.exit": "退出沉浸模式",
    "dl2.copy": "拷贝",
    "dl2.copied": "已拷贝",
  };
  const SWATCH_NAMES = {
    zh: ["浅蓝", "金黄", "粉红", "翠绿", "白色", "橙色", "淡紫"],
    en: ["Light blue", "Gold", "Pink", "Green", "White", "Orange", "Lavender"],
  };
  const original = new Map();
  const originalAttr = new Map();
  let lang = pickLang();

  function pickLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "zh") return q;
    const saved = store("lp-site-lang");
    if (saved === "en" || saved === "zh") return saved;
    const langs = navigator.languages || [navigator.language || "zh"];
    return langs.some((l) => /^zh/i.test(l)) ? "zh" : "en";
  }
  function tr(key) {
    if (lang === "en") return EN[key] ?? key;
    return ZH[key] ?? original.get(key) ?? key;
  }
  function applyLang(next) {
    lang = next;
    for (const el of $$("[data-i18n]")) {
      const key = el.dataset.i18n;
      if (!original.has(key)) original.set(key, el.innerHTML);
      el.innerHTML = lang === "en" ? (EN[key] ?? original.get(key)) : original.get(key);
    }
    for (const el of $$("[data-i18n-attr]")) {
      for (const pair of el.dataset.i18nAttr.split(";")) {
        const [attr, key] = pair.split(":");
        const id = `${key}@${attr}`;
        if (!originalAttr.has(id)) originalAttr.set(id, el.getAttribute(attr));
        el.setAttribute(attr, lang === "en" ? (EN[key] ?? originalAttr.get(id)) : originalAttr.get(id));
      }
    }
    root.lang = lang === "en" ? "en" : "zh-CN";
    for (const a of [$("#film-link"), $("#film-link-2")]) if (a) a.href = `../animation-pv/${lang}.html`;
    syncImmersiveButton();
    buildSwatches();
    demos.forEach((d) => (d.dirty = true));
  }
  $("#lang").addEventListener("click", () => {
    applyLang(lang === "en" ? "zh" : "en");
    store("lp-site-lang", lang);
  });

  const uis = {};
  const uiNow = () => uis[lang] || (uis[lang] = PV.createUI(PV.copies[lang]));
  const copyNow = () => PV.copies[lang];

  // ------------------------------------------------------------ shared app state
  const cover512 = PV.art.cover(0, 512);
  const cover256 = PV.art.cover(0, 256);
  const LINE = 3.2;

  function lyricAt(t) {
    const L = copyNow().lyrics;
    const k = Math.floor(t / LINE);
    return { i: mod(k + 2, L.length), k: t - k * LINE };
  }
  function peekAt(t) {
    const L = copyNow().lyrics;
    const a = lyricAt(t);
    return { cur: L[a.i], next: L[(a.i + 1) % L.length], prev: [L[mod(a.i - 1, L.length)], L[a.i]], k: a.k };
  }
  function transport(t, extra = {}) {
    const c = copyNow();
    return {
      position: 42 + mod(t, c.song.duration - 50),
      duration: c.song.duration,
      playing: true,
      title: c.song.title,
      artist: c.song.artist,
      cover: cover256,
      fav: true,
      playlistShown: false,
      mode: "loop",
      jump: 15,
      volume: 0.8,
      ...extra,
    };
  }
  /** Pointer along keyframes [[u, x, y], ...] with presses [[u0, u1], ...]. */
  function cursorAt(u, keys, presses = [], end = Infinity) {
    let [, x, y] = keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      const [ta, xa, ya] = keys[i];
      const [tb, xb, yb] = keys[i + 1];
      if (u >= tb) {
        x = xb;
        y = yb;
      } else if (u >= ta) {
        const k = ease.inOutCubic((u - ta) / (tb - ta));
        x = lerp(xa, xb, k);
        y = lerp(ya, yb, k);
        break;
      }
    }
    let press = 0;
    for (const [a, b] of presses) press = Math.max(press, envelope(u, a, b, 0.04, 0.06, ease.linear));
    const alpha = clamp((u - (keys[0][0] - 0.25)) / 0.2) * clamp((end - u) / 0.25);
    return { x, y, press, alpha };
  }
  function drawCursor(ctx, c) {
    if (c.alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = c.alpha;
    uiNow().drawCursor(ctx, c.x, c.y, c.press);
    ctx.restore();
  }

  // ------------------------------------------------------------ demo loop
  // Each demo draws only while it is on screen. 2D windows redraw at about
  // 30 fps; shader passes run every frame.
  const demos = [];
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const d = demos.find((x) => x.el === e.target);
              if (d) {
                d.visible = e.isIntersecting;
                if (d.visible) d.dirty = true;
              }
            }
          },
          { rootMargin: "200px 0px" },
        )
      : null;

  function addDemo(el, o) {
    const d = { el, visible: !io, dirty: true, last: -1, ...o };
    demos.push(d);
    if (io) io.observe(el);
    return d;
  }
  /** Sizes a canvas to its box at the device scale; true when it changed. */
  function fit(canvas, aspect) {
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr()));
    const h = Math.max(1, Math.round(w / aspect));
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  window.addEventListener("resize", () => demos.forEach((d) => (d.dirty = true)));

  const t0 = clock();
  function frame() {
    const now = clock();
    const t = now - t0;
    for (const d of demos) {
      if (!d.visible) continue;
      if (reduce && !d.dirty) continue;
      const time = reduce ? d.poster || 0 : t;
      const fresh = d.dirty || t - d.last >= 1 / 30;
      d.dirty = false;
      if (fresh) d.last = t;
      d.draw(time, fresh, now);
    }
    requestAnimationFrame(frame);
  }

  /** A plain 2D app window. */
  function windowDemo(canvas, state, poster) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    addDemo(canvas, {
      poster,
      draw(t, fresh) {
        if (!fresh) return;
        fit(canvas, UW / UH);
        ctx.setTransform(canvas.width / UW, 0, 0, canvas.width / UW, 0, 0);
        state(ctx, t);
      },
    });
  }

  // ------------------------------------------------------------ hero
  windowDemo(
    $("#cv-hero"),
    (ctx, t) => {
      const c = copyNow();
      uiNow().drawApp(ctx, {
        page: "player",
        theme: "dark",
        media: { file: c.song.file },
        coverImg: cover512,
        playing: true,
        playlistShown: true,
        time: t,
        peek: peekAt(t + 5),
        transport: transport(t, { playlistShown: true }),
      });
    },
    1.2,
  );
  const heroStage = $("#hero-stage");
  function tilt() {
    if (!heroStage || reduce) return;
    const r = heroStage.getBoundingClientRect();
    const k = clamp((r.top - window.innerHeight * 0.18) / (window.innerHeight * 0.62));
    heroStage.style.setProperty("--tilt", k.toFixed(3));
  }
  window.addEventListener("scroll", tilt, { passive: true });
  window.addEventListener("resize", tilt);

  // ------------------------------------------------------------ lyrics
  windowDemo(
    $("#cv-lyrics"),
    (ctx, t) => {
      const c = copyNow();
      const NL = c.lyrics.length;
      const LD = 2.6;
      const n = Math.floor(t / LD);
      const u = t - n * LD;
      const cur = mod(n, NL);
      const k = ease.outCubic(clamp(u / 0.32));
      const scroll = cur === 0 ? 0 : lerp(cur - 1, cur, k);
      uiNow().drawApp(ctx, {
        page: "lyrics",
        theme: "dark",
        media: { file: c.song.file },
        state: "loaded",
        lines: c.lyrics,
        scroll,
        active: scroll,
        karaoke: clamp(u / (LD * 0.9)),
        transport: transport(t + 60),
      });
    },
    3 * 2.6 + 1.6,
  );

  // ------------------------------------------------------------ AI recognition
  windowDemo(
    $("#cv-ai"),
    (ctx, t) => {
      const c = copyNow();
      const ui = uiNow();
      const u = mod(t, 13);
      const asr0 = 1.3;
      const asr1 = 5.6;
      const press = [0.95, 1.15];
      let state = "empty";
      let percent = 0;
      if (u >= asr0 && u < asr1) {
        state = "asr";
        percent = 100 * ease.inOutSine(prog(u, asr0 + 0.4, asr1 - 0.1));
      } else if (u >= asr1) state = "loaded";
      const line = Math.max(0, Math.floor((u - asr1) / 2.2));
      const lu = u - asr1 - line * 2.2;
      const scroll = state === "loaded" ? lerp(Math.max(0, line - 1), line, ease.outCubic(clamp(lu / 0.3))) : 0;
      ui.drawApp(ctx, {
        page: "lyrics",
        theme: "dark",
        media: { file: c.song.file },
        state,
        percent,
        decoding: state === "asr" && u < asr0 + 0.4,
        time: u,
        lines: c.lyrics,
        scroll,
        active: scroll,
        karaoke: state === "loaded" ? clamp(lu / 2.0) : null,
        banner: state === "loaded" ? prog(u, asr1 + 0.1, asr1 + 0.5) : 0,
        hover: u > 0.6 && u < asr0 + 0.05 ? "ai" : null,
        press: "ai",
        pressK: envelope(u, press[0], press[1], 0.04, 0.06, ease.linear),
        asrBusy: state === "asr",
        asrCount: state === "asr" ? 1 : 0,
        transport: transport(t + 20),
      });
      const target = ui.hits["empty-ai"] || { cx: 700, cy: 450 };
      drawCursor(
        ctx,
        cursorAt(u, [
          [0.3, 820, 640],
          [0.75, target.cx + 10, target.cy + 4],
          [1.6, target.cx + 140, target.cy + 110],
        ], [press], 2.0),
      );
    },
    7.4,
  );

  // ------------------------------------------------------------ library
  let libView = "albums";
  let libPicked = false;
  let shownView = "albums";
  windowDemo(
    $("#cv-library"),
    (ctx, t) => {
      const c = copyNow();
      const view = libPicked ? libView : Math.floor(t / 6) % 2 ? "songs" : "albums";
      if (view !== shownView) syncSeg("#lib-seg", "view", (shownView = view));
      uiNow().drawApp(ctx, {
        page: "library",
        theme: "dark",
        media: { file: c.song.file },
        view,
        hoverCard: view === "albums" ? Math.floor(t / 1.3) % 8 : null,
        cardPlay: 1,
        hiddenCards: {},
        current: 0,
        time: t,
        hoverRow: view === "songs" ? Math.floor(t / 1.1) % 9 : null,
        favs: [0, 3, 6],
        transport: transport(t + 90),
      });
    },
    0.5,
  );
  for (const b of $$("#lib-seg button")) {
    b.addEventListener("click", () => {
      libPicked = true;
      libView = b.dataset.view;
      syncSeg("#lib-seg", "view", libView);
      demos.forEach((d) => (d.dirty = true));
    });
  }
  function syncSeg(sel, attr, value) {
    for (const b of $$(`${sel} button`)) b.setAttribute("aria-selected", String(b.dataset[attr] === value));
  }

  // ------------------------------------------------------------ weather (GLSL window)
  const SKY = {
    rain: ["#3a4c61", "#56687d", "#738396"],
    snow: ["#7f95ae", "#a7b8cb", "#cfdae6"],
    night: ["#060a1c", "#111d45", "#22346a"],
  };
  const WX = {
    rain: { rain: 1, snow: 0, stars: 0, clouds: 0.85, icon: "rain", temp: "16°", theme: "weather" },
    snow: { rain: 0, snow: 1, stars: 0, clouds: 0.85, icon: "snow", temp: "-2°", theme: "weatherBright" },
    night: { rain: 0, snow: 0, stars: 1, clouds: 0, icon: "moon", temp: "12°", theme: "weather" },
  };
  const ORDER = ["rain", "snow", "night"];
  let wxPicked = null;
  let wxFrom = "rain";
  let wxTo = "rain";
  let wxAt = -10;
  function setWeather(name, now) {
    if (name === wxTo) return;
    wxFrom = wxTo;
    wxTo = name;
    wxAt = now;
    syncSeg("#wx-seg", "wx", name);
  }

  /** A window composited by the film's shader over a sky or a picture. */
  function glWindow(canvas, setup) {
    if (!canvas) return null;
    const layer = document.createElement("canvas");
    const lctx = layer.getContext("2d");
    const pass = PV.gl.createPass(canvas, PV.shaders.windowFrag, { linear: true });
    let ctx2d = null;
    if (!pass) ctx2d = canvas.getContext("2d");
    const base = {
      uSize: [UW, UH],
      uRadius: 10,
      uOpacity: 1,
      uBright: 1,
      uBorder: 1,
      uSheen: -2,
      uWind: 0.14,
      uLedge: [10, 1170, 668, 18],
      uVideo: [10, 48, 1160, 608],
      uVideoR: 18,
      uVideoT: 0,
      uMode: 0,
      uRain: 0,
      uSnow: 0,
      uStars: 0,
      uClouds: 0,
      uFlash: 0,
      uSnowCover: 0,
      uSkyTop: [0, 0, 0],
      uSkyMid: [0, 0, 0],
      uSkyBot: [0, 0, 0],
    };
    if (pass) for (const [k, v] of Object.entries(base)) pass.set(k, v);
    return addDemo(canvas, {
      poster: setup.poster,
      draw(t, fresh, now) {
        fit(canvas, UW / UH);
        if (layer.width !== canvas.width || layer.height !== canvas.height) {
          layer.width = canvas.width;
          layer.height = canvas.height;
          fresh = true;
        }
        const u = setup.uniforms(t, now);
        if (fresh) {
          lctx.setTransform(layer.width / UW, 0, 0, layer.width / UW, 0, 0);
          setup.ui(lctx, t, now);
        }
        if (pass) {
          for (const [k, v] of Object.entries(u)) pass.set(k, v);
          if (fresh) pass.texture(layer);
          pass.render();
        } else if (fresh && ctx2d) {
          // no WebGL2: the interface over a plain backdrop
          ctx2d.setTransform(1, 0, 0, 1, 0, 0);
          ctx2d.fillStyle = setup.fallback ? setup.fallback(ctx2d, canvas) : "#111115";
          ctx2d.fillRect(0, 0, canvas.width, canvas.height);
          ctx2d.drawImage(layer, 0, 0);
        }
      },
    });
  }

  function wxMix(now) {
    const k = reduce ? 1 : ease.inOutSine(clamp((now - wxAt) / 1.2));
    const a = WX[wxFrom];
    const b = WX[wxTo];
    const sky = SKY[wxFrom].map((c, i) => PV.util.mixHex(c, SKY[wxTo][i], k));
    return { k, a, b, sky };
  }
  glWindow($("#cv-weather"), {
    poster: 3,
    uniforms(t, now) {
      if (!wxPicked && !reduce) setWeather(ORDER[Math.floor(t / 7) % 3], now);
      const { k, a, b, sky } = wxMix(now);
      const rain = lerp(a.rain, b.rain, k);
      const tp = mod(t, 6.5);
      const flash = rain * (0.55 * Math.exp(-Math.pow((tp - 1.2) / 0.05, 2)) + 0.4 * Math.exp(-Math.pow((tp - 1.38) / 0.07, 2)));
      const snowFor = wxTo === "snow" ? (reduce ? 1 : clamp((now - wxAt - 0.6) / 2.5)) : wxFrom === "snow" ? 1 - k : 0;
      return {
        uMode: 1,
        uTime: t + 20,
        uRain: rain,
        uSnow: lerp(a.snow, b.snow, k),
        uStars: lerp(a.stars, b.stars, k),
        uClouds: lerp(a.clouds, b.clouds, k),
        uFlash: flash,
        uSnowCover: snowFor,
        uSkyTop: PV.gl.rgb(sky[0]),
        uSkyMid: PV.gl.rgb(sky[1]),
        uSkyBot: PV.gl.rgb(sky[2]),
      };
    },
    ui(ctx, t, now) {
      const c = copyNow();
      const { k, a, b } = wxMix(now);
      const w = k < 0.5 ? a : b;
      uiNow().drawApp(ctx, {
        page: "player",
        theme: w.theme,
        media: { file: c.song.file },
        coverImg: cover512,
        playing: true,
        playlistShown: false,
        time: t,
        peek: peekAt(t + 11),
        weather: { icon: w.icon, temp: w.temp },
        transport: transport(t + 30),
      });
    },
    fallback(ctx2d, canvas) {
      const s = SKY[wxTo];
      const g = ctx2d.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, s[0]);
      g.addColorStop(0.5, s[1]);
      g.addColorStop(1, s[2]);
      return g;
    },
  });
  for (const b of $$("#wx-seg button")) {
    b.addEventListener("click", () => {
      wxPicked = b.dataset.wx;
      setWeather(wxPicked, clock());
      demos.forEach((d) => (d.dirty = true));
    });
  }

  // ------------------------------------------------------------ video (GLSL window)
  let imOn = false;
  let imAt = -10;
  let lastMove = -10;
  const vidCanvas = $("#cv-video");
  function imK(now) {
    const k = reduce ? 1 : clamp((now - imAt) / 0.8);
    return imOn ? k : 1 - k;
  }
  function controlsK(now) {
    if (!imOn || reduce) return 1;
    return 1 - clamp((now - Math.max(lastMove, imAt + 0.8) - 2.2) / 0.3);
  }
  glWindow(vidCanvas, {
    poster: 1.5,
    uniforms(t, now) {
      const k = imK(now);
      const vr = uiNow().videoRect(k);
      return {
        uMode: 2,
        uTime: t,
        uVideo: [vr.x, vr.y, vr.w, vr.h],
        uVideoR: vr.r,
        uVideoT: 140 + mod(t, 120),
        uRadius: lerp(10, 0, k),
        uBorder: 1 - k,
      };
    },
    ui(ctx, t, now) {
      const c = copyNow();
      const k = imK(now);
      const slot = 3.4;
      const i = Math.floor(t / slot);
      const su = t - i * slot;
      uiNow().drawApp(ctx, {
        page: "video",
        theme: "dark",
        media: { file: c.video.file },
        immersive: k,
        controls: k > 0.99 ? controlsK(now) : 1,
        sub: c.video.subs[mod(i, c.video.subs.length)],
        subAlpha: reduce ? 1 : envelope(su, 0.2, slot - 0.2, 0.15, 0.12),
        transport: {
          position: 724 + mod(t, 600),
          duration: 3735,
          playing: true,
          title: c.video.title,
          artist: c.video.file,
          cover: null,
          fav: false,
          kind: "video",
          playlistShown: false,
          subtitlesOn: true,
          fullscreen: k > 0.5,
          volume: 0.8,
          jump: 15,
          mode: "loop",
        },
      });
    },
    fallback() {
      return "#1d2b4a";
    },
  });
  const imBtn = $("#immersive");
  function syncImmersiveButton() {
    if (!imBtn) return;
    imBtn.textContent = tr(imOn ? "vid.exit" : "vid.enter");
    imBtn.setAttribute("aria-pressed", String(imOn));
  }
  imBtn?.addEventListener("click", () => {
    imOn = !imOn;
    imAt = clock();
    lastMove = imAt;
    syncImmersiveButton();
    demos.forEach((d) => (d.dirty = true));
  });
  vidCanvas?.addEventListener("pointermove", () => {
    lastMove = clock();
  });

  // ------------------------------------------------------------ desktop lyrics and menu bar
  const DW = 1600;
  const DH = 900;
  let dlColor = 0;
  let dlColorAt = -10;
  let dlHover = 0;
  let pointer = null;
  let trayOpen = null; // null: follow the demo loop; true or false: the visitor chose
  const wallCanvas = $("#cv-wall");
  const deskCanvas = $("#cv-desk");
  const wall = wallCanvas ? PV.gl.createPass(wallCanvas, PV.shaders.wallpaperFrag, { linear: true }) : null;
  if (wall) wall.set("uOpacity", 1);
  else if (wallCanvas) wallCanvas.hidden = true;
  const dlRect = () => {
    const w = copyNow().dlWidth || 640;
    return { x: DW / 2 - w / 2, y: 690, w, h: 96 };
  };
  const trayShown = (t) => (trayOpen === null ? !reduce && mod(t, 9) > 5 : trayOpen);
  if (deskCanvas) {
    const dctx = deskCanvas.getContext("2d");
    addDemo(deskCanvas, {
      poster: 4,
      draw(t, fresh, now) {
        if (wall) {
          fit(wallCanvas, 16 / 9);
          wall.set("uTime", t);
          wall.render();
        }
        if (!fresh) return;
        fit(deskCanvas, 16 / 9);
        const ui = uiNow();
        const c = copyNow();
        const s = deskCanvas.width / DW;
        dctx.setTransform(1, 0, 0, 1, 0, 0);
        dctx.clearRect(0, 0, deskCanvas.width, deskCanvas.height);
        dctx.setTransform(s, 0, 0, s, 0, 0);
        const open = trayShown(t);
        ui.drawMenuBar(dctx, { title: c.song.title, open, w: DW });
        // desktop lyrics bar
        const r = dlRect();
        const over = pointer && pointer.x > r.x && pointer.x < r.x + r.w && pointer.y > r.y && pointer.y < r.y + r.h;
        const picking = !reduce && now - dlColorAt < 1.4;
        dlHover = lerp(dlHover, over || picking ? 1 : 0, reduce ? 1 : 0.25);
        const a = lyricAt(t);
        dctx.save();
        dctx.translate(r.x, r.y);
        ui.drawDesktopLyrics(dctx, {
          text: c.lyrics[a.i],
          lineK: reduce ? 1 : a.k,
          color: ui.DL_PRESETS[dlColor],
          hover: dlHover,
          palette: picking && now - dlColorAt < 1.0,
          w: r.w,
          h: r.h,
        });
        dctx.restore();
        // the status item menu
        if (open) {
          const item = ui.hits.trayItem;
          if (item) {
            dctx.save();
            dctx.translate(item.x, 28 + 5);
            const rows = [2, 3, 4, 6, 8];
            ui.drawTrayMenu(dctx, { hover: pointer ? hoverRow(item) : rows[Math.floor(t / 0.9) % rows.length] });
            dctx.restore();
          }
        }
        if (dlHover > 0.02 || open || picking) this.dirty = true;
      },
    });
    function hoverRow(item) {
      const y = pointer.y - 33;
      if (pointer.x < item.x || pointer.x > item.x + 280 || y < 6) return null;
      const layout = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (i === 1 || i === 5 || i === 7 ? 11 : 24));
      let yy = 6;
      for (let i = 0; i < layout.length; i++) {
        if (y >= yy && y < yy + layout[i]) return layout[i] === 24 && i !== 0 ? i : null;
        yy += layout[i];
      }
      return null;
    }
    const toLogical = (e) => {
      const b = deskCanvas.getBoundingClientRect();
      return { x: ((e.clientX - b.left) / b.width) * DW, y: ((e.clientY - b.top) / b.height) * DH };
    };
    deskCanvas.addEventListener("pointermove", (e) => {
      pointer = toLogical(e);
      const item = uiNow().hits.trayItem;
      const onItem = item && pointer.y < 28 && pointer.x > item.x && pointer.x < item.x + item.w;
      deskCanvas.style.cursor = onItem ? "pointer" : "default";
    });
    deskCanvas.addEventListener("pointerleave", () => {
      pointer = null;
    });
    deskCanvas.addEventListener("click", (e) => {
      const p = toLogical(e);
      const item = uiNow().hits.trayItem;
      const onItem = item && p.y < 28 && p.x > item.x && p.x < item.x + item.w;
      const shown = trayShown(clock() - t0);
      trayOpen = onItem ? !shown : false;
      demos.forEach((d) => (d.dirty = true));
    });
  }
  function buildSwatches() {
    const box = $("#swatches");
    if (!box) return;
    const ui = uiNow();
    box.textContent = "";
    ui.DL_PRESETS.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(i === dlColor));
      b.setAttribute("aria-label", SWATCH_NAMES[lang][i] || c);
      b.style.setProperty("--c", c);
      b.addEventListener("click", () => {
        dlColor = i;
        dlColorAt = clock();
        for (const x of box.children) x.setAttribute("aria-checked", String(x === b));
        demos.forEach((d) => (d.dirty = true));
      });
      box.appendChild(b);
    });
  }

  // ------------------------------------------------------------ feature icons
  function drawIcons() {
    for (const li of $$("#more-grid [data-icon]")) {
      let cv = li.querySelector("canvas");
      if (!cv) {
        cv = document.createElement("canvas");
        cv.setAttribute("aria-hidden", "true");
        li.prepend(cv);
      }
      const s = dpr();
      cv.width = 30 * s;
      cv.height = 30 * s;
      const ctx = cv.getContext("2d");
      ctx.setTransform(s, 0, 0, s, 0, 0);
      PV.icons.draw(ctx, li.dataset.icon, 1, 1, 28, "#66ccff", 1.7);
    }
  }

  // ------------------------------------------------------------ shortcuts
  const keysSection = $("#keys");
  function inView(el) {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight * 0.8 && r.bottom > window.innerHeight * 0.2;
  }
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    const meta = e.metaKey || e.ctrlKey;
    const key = e.key === " " ? "space" : e.key.toLowerCase();
    const combo = (e.shiftKey && meta ? "shift+" : "") + (meta ? "meta+" : "") + key;
    const li = $$("#keylist li").find((x) => x.dataset.k.split(" ").includes(combo));
    if (!li) return;
    if (!meta && keysSection && inView(keysSection) && /^(space|arrow)/.test(key) && tag !== "BUTTON") e.preventDefault();
    li.classList.add("hit");
    clearTimeout(li._t);
    li._t = setTimeout(() => li.classList.remove("hit"), 420);
  });

  // ------------------------------------------------------------ copy the install command
  const copyBtn = $("#copy-cmd");
  copyBtn?.addEventListener("click", () => {
    const text = $("#cmd-text").textContent;
    const done = () => {
      copyBtn.textContent = tr("dl2.copied");
      clearTimeout(copyBtn._t);
      copyBtn._t = setTimeout(() => (copyBtn.textContent = tr("dl2.copy")), 1600);
    };
    const select = () => {
      const range = document.createRange();
      range.selectNodeContents($("#cmd-text"));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, select);
    else select();
  });

  // ------------------------------------------------------------ reveal on scroll
  const items = $$(".rv");
  if ("IntersectionObserver" in window && !reduce) {
    const rio = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          rio.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    items.forEach((el) => rio.observe(el));
    // anything already scrolled past (a jump to an anchor) shows up too
    window.addEventListener(
      "scroll",
      () => {
        for (const el of items) {
          if (el.classList.contains("in")) continue;
          if (el.getBoundingClientRect().top < window.innerHeight) {
            el.classList.add("in");
            rio.unobserve(el);
          }
        }
      },
      { passive: true },
    );
  } else items.forEach((el) => el.classList.add("in"));

  // ------------------------------------------------------------ start
  applyLang(lang);
  drawIcons();
  tilt();
  requestAnimationFrame(frame);
})();
