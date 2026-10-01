// The film's timeline. Scenes are laid out on a bar grid (128 BPM, 1.875 s a
// bar, 24 bars, 45 s in all) so every cut lands on a downbeat. Cuts are hard,
// with a short push-in and zoom blur, in the manner of Apple product films.
// Every frame is a pure function of time t: scrubbing and frame-exact export
// just call render(t).
(function () {
  const PV = (window.PV = window.PV || {});
  const { clamp, lerp, ease, prog, envelope, hash } = PV.util;

  const BAR = 1.875;
  const BEAT = BAR / 4;
  const PLAN = [
    ["intro", 0, 2],
    ["hero", 2, 4],
    ["formats", 4, 6],
    ["lyrics", 6, 8],
    ["ai", 8, 11],
    ["desktop", 11, 13],
    ["weather", 13, 16],
    ["library", 16, 18],
    ["video", 18, 20],
    ["more", 20, 22],
    ["outro", 22, 24],
  ];
  const SCENES = PLAN.map(([id, a, b]) => ({ id, t0: a * BAR, t1: b * BAR }));
  const DURATION = 24 * BAR;
  // hard cuts inside a scene (seconds from its start)
  const INNER_CUTS = { weather: [2 * BEAT, 4 * BEAT] };

  function createScenes(W, ui, copy) {
    const T = window.THREE;
    const C = copy.cap;
    const L = copy.lyrics;
    const NL = L.length;
    const cover512 = PV.art.cover(0, 512);
    const cover256 = PV.art.cover(0, 256);
    const v3 = (x, y, z) => new T.Vector3(x, y, z);
    const scene = (id) => SCENES.find((s) => s.id === id);
    const at = (id) => scene(id).t0;
    const len = (id) => scene(id).t1 - scene(id).t0;

    // ------------------------------------------------------------ shared state helpers
    const songPos = (t) => 42 + t;
    function lyricAt(t) {
      const k = Math.floor(t / BAR);
      return { i: (((k + 2) % NL) + NL) % NL, k: t - k * BAR };
    }
    function peekAt(t) {
      const a = lyricAt(t);
      return { cur: L[a.i], next: L[(a.i + 1) % NL], prev: [L[(a.i + NL - 1) % NL], L[a.i]], k: a.k };
    }
    function transport(t, extra = {}) {
      return {
        position: songPos(t),
        duration: copy.song.duration,
        playing: true,
        title: copy.song.title,
        artist: copy.song.artist,
        cover: cover256,
        fav: true,
        playlistShown: false,
        mode: "loop",
        jump: 15,
        volume: 0.8,
        ...extra,
      };
    }
    /** Lyric scroll from a list of [time, line] events (line changes). */
    function lyricTrack(u, events, lineDur = 2 * BEAT) {
      let cur = events[0];
      let prev = events[0];
      for (const e of events) {
        if (e[0] <= u) {
          prev = cur;
          cur = e;
        }
      }
      const k = clamp((u - cur[0]) / 0.24);
      const scroll = prev[1] + (cur[1] - prev[1]) * ease.outCubic(k);
      return { scroll, active: scroll, karaoke: clamp((u - cur[0]) / (lineDur * 0.9)), line: cur[1] };
    }

    function cam(pos, look, fov = 35, roll = 0) {
      W.camera.position.copy(pos);
      W.camera.fov = fov;
      W.camera.up.set(Math.sin(roll), Math.cos(roll), 0);
      W.camera.lookAt(look);
      W.camera.updateProjectionMatrix();
    }
    /** Piecewise camera path: keys of [u, pos, look, fov?]. */
    function camPath(u, keys, fn = ease.inOutSine) {
      let i = 0;
      while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
      const a = keys[i];
      const b = keys[i + 1] || a;
      const k = b === a ? 0 : fn(clamp((u - a[0]) / (b[0] - a[0])));
      cam(a[1].clone().lerp(b[1], k), a[2].clone().lerp(b[2], k), lerp(a[3] || 35, b[3] || 35, k));
    }
    function place(obj, o) {
      obj.position.set(o.x || 0, o.y || 0, o.z || 0);
      obj.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
      obj.scale.setScalar(o.s ?? 1);
    }
    /** Cursor along keyframes [[u, x, y], ...] with presses [[u0, u1], ...]. */
    function cursorAt(u, keys, presses = [], end = Infinity) {
      const first = keys[0];
      let x = first[1];
      let y = first[2];
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
      const alpha = clamp((u - (first[0] - 0.25)) / 0.2) * clamp((end - u) / 0.25);
      return { x, y, press, alpha };
    }
    function drawCursor(ctx, cursor) {
      if (!cursor || cursor.alpha <= 0.001) return;
      ctx.save();
      ctx.globalAlpha = cursor.alpha;
      ui.drawCursor(ctx, cursor.x, cursor.y, cursor.press);
      ctx.restore();
    }
    function drawApp(state, cursor) {
      W.drawUI((ctx) => {
        ui.drawApp(ctx, state);
        drawCursor(ctx, cursor);
      });
    }
    /** Fade from or to black at the ends of a scene (only the film's ends). */
    function dip(u, dur, fin = 0, fout = 0) {
      W.comp.uFade.value = Math.min(fin > 0 ? ease.inOutSine(clamp(u / fin)) : 1, fout > 0 ? ease.inOutSine(clamp((dur - u) / fout)) : 1);
    }
    function showWindow(o) {
      W.win.group.visible = true;
      place(W.win.group, o);
    }
    function setSky(colors) {
      W.win.u.uSkyTop.value.set(colors[0]);
      W.win.u.uSkyMid.value.set(colors[1]);
      W.win.u.uSkyBot.value.set(colors[2]);
    }
    const mixCols = (a, b, k) => a.map((c, i) => PV.util.mixHex(c, b[i], k));

    // ------------------------------------------------------------ scenes
    const update = {};

    update.intro = (u) => {
      const D = len("intro");
      const P = W.particles;
      P.points.visible = true;
      P.points.position.set(0, 0.83, 0);
      P.u.uTime.value = u * 1.6 + 3;
      const conv = ease.inOutCubic(prog(u, 1.75, 2.85));
      P.u.uConverge.value = conv;
      P.u.uSpread.value = 1;
      P.u.uOpacity.value = Math.min(prog(u, 0, 0.45), 1 - prog(u, 2.75, 3.25)) * lerp(0.8, 1, prog(u, 1.6, 2.4));
      P.u.uGlow.value = lerp(1.7, 0.42, conv);
      const L3 = W.logo;
      if (u > 2.7) {
        const k = prog(u, 2.7, 3.15, ease.inOutSine);
        L3.group.visible = true;
        L3.group.position.set(0, 0.83, 0);
        L3.group.scale.setScalar(lerp(0.86, 1, prog(u, 2.7, D, ease.outCubic)));
        L3.mesh.rotation.set(0.05 * Math.sin(u * 0.5), lerp(-0.55, 0.0, prog(u, 2.7, D + 0.6, ease.outCubic)), 0);
        [L3.face, L3.side].forEach((m) => {
          m.transparent = true;
          m.opacity = k;
        });
        L3.glow.userData.mat.uniforms.uAlpha.value = 0.5 * k;
      }
      W.bg.uAurora.value = 0.55 * prog(u, 2.5, D);
      W.bg.uCenter.value.set(0, 0.12);
      cam(v3(0, 0, lerp(15.5, 12.6, ease.inOutSine(prog(u, 0, D)))), v3(0, 0, 0));
      dip(u, D, 0.2, 0);
    };

    update.hero = (u) => {
      const LP = W.laptop;
      LP.group.visible = true;
      LP.group.position.set(0, -2.3, 0);
      LP.group.rotation.set(0, 0, 0);
      const open = ease.inOutCubic(prog(u, 0.0, 1.35));
      LP.lidPivot.rotation.x = lerp(Math.PI / 2, -0.2, open);
      LP.u.uBright.value = ease.inOutSine(prog(u, 0.55, 1.25));
      LP.u.uTime.value = u;
      LP.u.uSheen.value = lerp(-0.6, 1.8, prog(u, 1.1, 3.4));
      const t = at("hero") + u;
      drawApp({
        page: "player",
        theme: "dark",
        media: { file: copy.song.file },
        coverImg: cover512,
        playing: true,
        playlistShown: true,
        time: u,
        peek: peekAt(t),
        transport: transport(t, { playlistShown: true }),
      });
      W.bg.uAurora.value = 0.3 * prog(u, 0.6, 2);
      W.bg.uCenter.value.set(0, 0.25);
      camPath(u, [
        [0, v3(8.2, 1.3, 13.5), v3(0.6, -1.5, -0.8)],
        [1.7, v3(2.6, 3.9, 18.4), v3(0, 3.2, -4.8)],
        [len("hero"), v3(0, 4.0, 17.0), v3(0, 3.5, -5.1)],
      ]);
    };

    // format chips
    const COLS = [
      ["MP3", "FLAC", "WAV", "M4A", "MP4"],
      ["MKV", "FLV", "TS", "AVI", "M2TS"],
      ["APE", "WMA", "DSF", "TTA", "WV"],
      ["WMV", "RMVB", "MPEG", "VOB", "3GP"],
    ];
    const COL_X = [384, 768, 1152, 1536];
    const chipTargets = new Map();
    COLS.forEach((col, c) =>
      col.forEach((label, r) => {
        chipTargets.set(W.chips.labels.indexOf(label), { c, r });
      }),
    );
    function screenToWorld(sx, sy, dist) {
      return [(sx / 1920 - 0.5) * 2 * 0.5606 * dist, (0.5 - sy / 1080) * 2 * 0.3153 * dist];
    }
    update.formats = (u) => {
      const ch = W.chips;
      ch.mesh.visible = true;
      const N = 150;
      for (let i = 0; i < N; i++) {
        const r1 = hash(i * 1.37 + 0.1);
        const r2 = hash(i * 2.11 + 3.3);
        const r3 = hash(i * 3.71 + 7.7);
        const r4 = hash(i * 5.17 + 1.9);
        const speed = 15 + 12 * r1;
        const z = -78 + ((r2 * 92 + u * speed) % 92);
        const ang = r3 * Math.PI * 2 + u * 0.2 * (r4 - 0.5);
        const rad = 2.4 + r4 * 7.8;
        let x = Math.cos(ang) * rad * 1.55;
        let y = Math.sin(ang) * rad;
        let zz = z;
        let rz = (r1 - 0.5) * 0.5;
        let h = 0.62;
        let alpha = clamp((z + 78) / 18) * clamp((12 - z) / 6) * prog(u, 0, 0.35);
        const cell = i % ch.labels.length;
        const target = i < ch.labels.length ? chipTargets.get(cell) : null;
        if (target) {
          const st = 1.4 + target.c * 0.09 + target.r * 0.045;
          const k = ease.inOutCubic(prog(u, st, st + 0.85));
          const [tx, ty] = screenToWorld(COL_X[target.c], 452 + target.r * 92, 20);
          x = lerp(x, tx, k);
          y = lerp(y, ty, k);
          zz = lerp(zz, 0, k);
          rz = lerp(rz, 0, k);
          h = lerp(h, 0.64, k);
          alpha = lerp(alpha, 1, k);
        } else alpha *= 1 - prog(u, 1.25, 1.9);
        ch.set(i, cell, [x, y, zz], [0, 0, rz], h, alpha, 0);
      }
      ch.commit(N);
      W.bg.uAurora.value = 0.38;
      W.bg.uCenter.value.set(0, 0);
      const roll = 0.06 * Math.sin(u * 0.9) * (1 - prog(u, 1.2, 2.3));
      cam(v3(0, 0, lerp(21, 20, prog(u, 0, 2.4, ease.outCubic))), v3(0, 0, 0), 35, roll);
    };

    update.lyrics = (u) => {
      const D = len("lyrics");
      const t = at("lyrics") + u;
      const jump = 5 * BEAT + 0.1;
      const tr = lyricTrack(u, [
        [-9, 1],
        [0, 2],
        [2 * BEAT, 3],
        [4 * BEAT, 4],
        [jump, 7],
        [7 * BEAT, 8],
      ]);
      const cursor = cursorAt(u, [
        [1.1, 930, 300],
        [2.05, 650, 545],
        [2.95, 940, 300],
      ], [[jump - 0.16, jump]], 3.4);
      drawApp(
        {
          page: "lyrics",
          theme: "dark",
          media: { file: copy.song.file },
          state: "loaded",
          lines: L,
          scroll: tr.scroll,
          active: tr.active,
          karaoke: tr.karaoke,
          hoverLine: u > 2.05 && u < jump ? 7 : null,
          transport: transport(u < jump ? t : t + 20),
        },
        cursor,
      );
      showWindow({ x: 5.0, y: -0.2, ry: lerp(-0.48, -0.36, prog(u, 0, D, ease.inOutSine)), rx: 0.03, s: 1.16 });
      W.win.u.uSheen.value = lerp(-0.5, 1.6, prog(u, 0.2, 2.2));
      W.bg.uAurora.value = 0.32;
      W.bg.uCenter.value.set(0.55, 0);
      camPath(u, [
        [0, v3(0.6, 0.3, 19.6), v3(1.4, 0, 0)],
        [D, v3(0.9, 0.1, 16.6), v3(1.4, 0, 0)],
      ]);
    };

    update.ai = (u) => {
      const D = len("ai");
      const t = at("ai") + u;
      const press = [0.62, 0.78];
      const asr0 = 0.8;
      const asr1 = 3.3;
      let state = "empty";
      let percent = 0;
      let decoding = false;
      if (u >= asr0 && u < asr1) {
        state = "asr";
        decoding = u < asr0 + 0.25;
        percent = 100 * ease.inOutSine(prog(u, asr0 + 0.25, asr1 - 0.05));
      } else if (u >= asr1) state = "loaded";
      const tr = lyricTrack(u, [
        [-9, 0],
        [asr1, 0],
        [asr1 + 2 * BEAT, 1],
        [asr1 + 4 * BEAT, 2],
      ]);
      const busy = state === "asr";
      W.drawUI((ctx) => {
        ui.drawApp(ctx, {
          page: "lyrics",
          theme: "dark",
          media: { file: copy.song.file },
          state,
          percent,
          decoding,
          time: u,
          lines: L,
          scroll: tr.scroll,
          active: tr.active,
          karaoke: state === "loaded" ? tr.karaoke : null,
          banner: state === "loaded" ? prog(u, asr1 + 0.08, asr1 + 0.45) : 0,
          hover: u > 0.45 && u < asr0 + 0.05 ? "ai" : null,
          press: "ai",
          pressK: envelope(u, press[0], press[1], 0.04, 0.06, ease.linear),
          asrBusy: busy,
          asrCount: busy ? 1 : 0,
          transport: transport(t),
        });
        const target = ui.hits["empty-ai"] || { cx: 700, cy: 450 };
        drawCursor(
          ctx,
          cursorAt(u, [
            [0.2, 820, 640],
            [0.5, target.cx + 10, target.cy + 4],
            [1.15, target.cx + 140, target.cy + 110],
          ], [press], 1.5),
        );
      });
      showWindow({ x: 0, y: -0.95, rx: -0.1, s: 1.0 });
      W.win.u.uSheen.value = lerp(-0.5, 1.6, prog(u, asr1, asr1 + 1.8));
      W.win.group.updateMatrixWorld(true);

      // spectrum bars and recognised words
      const bA = envelope(u, asr0, asr1 + 0.4, 0.35, 0.5);
      if (bA > 0) {
        const B = W.bars;
        B.mesh.visible = true;
        B.mesh.position.set(0, -5.75, 2.6);
        B.u.uOpacity.value = bA;
        const energy = 0.55 + 0.45 * Math.sin(u * 3.4) * Math.sin(u * 1.3 + 1);
        B.layout(0.085, 0.075, (i) => {
          const n = 0.5 + 0.5 * Math.sin(i * 0.31 + u * 9.5) * Math.cos(i * 0.17 - u * 5.3);
          const n2 = 0.5 + 0.5 * Math.sin(i * 0.83 - u * 14.0 + Math.sin(i));
          const fall = Math.exp(-Math.pow((i - B.N / 2) / (B.N * 0.36), 4));
          return (0.12 + 1.5 * Math.pow(n, 2) * energy + 0.35 * n2 * n2) * fall * bA;
        });
      }
      const tk = W.tokens;
      const n = 64;
      let used = 0;
      const tmp = new T.Vector3();
      for (let j = 0; j < n; j++) {
        const birth = 1.2 + j * 0.03;
        const life = 1.0;
        const k = (u - birth) / life;
        if (k < 0 || k > 1) continue;
        const r = hash(j * 3.3 + 0.7);
        const r2 = hash(j * 7.1 + 2.1);
        const sx = (r - 0.5) * 11.5;
        const start = v3(sx, -5.75 + 1.0 + r2 * 0.8, 2.6);
        tmp.copy(W.winLocal(590 + (r2 - 0.5) * 460, 330 + (r - 0.5) * 140, 0.3));
        W.win.group.localToWorld(tmp);
        const e = ease.inOutCubic(k);
        const p = start.clone().lerp(tmp, e);
        p.y += Math.sin(k * Math.PI) * 1.1;
        p.z += Math.sin(k * Math.PI) * 1.4;
        const a = Math.min(clamp(k / 0.15), clamp((1 - k) / 0.35));
        tk.set(used++, j % tk.labels.length, [p.x, p.y, p.z], [0, 0, (r - 0.5) * 0.3 * (1 - e)], lerp(0.62, 0.34, e), a, 0.25);
      }
      if (used) {
        tk.mesh.visible = true;
        tk.commit(used);
      }
      W.bg.uAurora.value = 0.3 + 0.2 * bA;
      W.bg.uCenter.value.set(0, -0.35);
      camPath(u, [
        [0, v3(0, 0.2, 16.2), v3(0, -0.1, 0)],
        [0.75, v3(0, 0.0, 15.4), v3(0, -0.2, 0)],
        [1.6, v3(0, 0.6, 20.6), v3(0, -0.7, 0)],
        [asr1 + 0.1, v3(0, 0.5, 20.2), v3(0, -0.72, 0)],
        [D, v3(0, -0.2, 16.8), v3(0, -0.55, 0)],
      ]);
    };

    // desktop: (1600 x 900) points
    const DLW = W.desktop.DLW;
    const DL_RECT = { x: 800 - DLW / 2, y: 722, w: DLW, h: 96 };
    const DL_DOT = DLW - 49;
    const DL_PINK = 14 + (DLW - 88 - (8 * 22 + 7 * 7.92)) / 2 + 11 + 2 * 29.92;
    const WIN_RECT = { x: 560, y: 70, s: 0.8 };
    update.desktop = (u) => {
      const D = len("desktop");
      const t = at("desktop") + u;
      const DK = W.desktop;
      DK.group.visible = true;
      DK.group.position.set(0, 0, 0);
      DK.wallMat.uniforms.uTime.value = t;
      const trayAt = 2.4;
      DK.drawMenuBar({ title: copy.song.title, open: u > trayAt });
      const item = ui.hits.trayItem || { x: 1270, w: 90, cx: 1315 };
      // app window (closes at 1.55 s)
      const closeK = prog(u, 1.55, 1.85, ease.inOutSine);
      if (closeK < 1) {
        showWindow({});
        const c = DK.local(WIN_RECT.x + (ui.W * WIN_RECT.s) / 2, WIN_RECT.y + (ui.H * WIN_RECT.s) / 2, 0.25);
        W.win.group.position.copy(c);
        W.win.group.scale.setScalar(WIN_RECT.s * 2 * lerp(1, 0.92, closeK));
        W.win.u.uOpacity.value = 1 - closeK;
        W.win.glow.visible = false;
        W.win.shadow.userData.mat.uniforms.uAlpha.value = 0.6 * (1 - closeK);
        drawApp({
          page: "player",
          theme: "dark",
          media: { file: copy.song.file },
          coverImg: cover512,
          playing: true,
          playlistShown: false,
          noHandle: false,
          time: u,
          peek: peekAt(t),
          transport: transport(t, { desktopLyrics: true }),
        });
      }
      // desktop lyrics
      const a = lyricAt(t);
      const color = u < 1.3 ? "#66ccff" : "#ff4d8d";
      const hover = envelope(u, 0.4, 1.6, 0.15, 0.2);
      DK.dl.position.copy(DK.local(DL_RECT.x + DL_RECT.w / 2, DL_RECT.y + DL_RECT.h / 2, 0.45));
      DK.drawLyrics({ text: L[a.i], lineK: a.k, color, hover, palette: u > 0.98 && u < 1.45 });
      // status item menu
      const trayK = prog(u, trayAt, trayAt + 0.15, ease.outCubic);
      DK.tray.visible = trayK > 0;
      if (trayK > 0) {
        DK.drawTray({ hover: u > 2.85 ? 2 : null });
        DK.trMat.uniforms.uOpacity.value = trayK;
        DK.tray.position.copy(DK.local(item.x + 140, 28 + 5 + 150 - 6 * (1 - trayK), 0.5));
      }
      // pointer
      const cur = cursorAt(u, [
        [0.2, 760, 560],
        [0.5, 930, 770],
        [0.82, DL_RECT.x + DL_DOT, DL_RECT.y + 18],
        [1.15, DL_RECT.x + DL_PINK, DL_RECT.y + 48],
        [1.65, 880, 600],
        [2.2, item.cx, 14],
        [2.75, item.x + 64, 28 + 5 + 6 + 24 + 11 + 14],
      ], [[0.88, 1.0], [1.2, 1.32], [trayAt - 0.12, trayAt]]);
      DK.pointer(cur.x, cur.y, cur.alpha, cur.press);
      camPath(u, [
        [0, v3(0, 0, 27.6), v3(0, 0, 0)],
        [1.3, v3(0.6, -1.6, 22.5), v3(0.6, -1.7, 0)],
        [1.85, v3(0.6, -1.6, 22.5), v3(0.6, -1.7, 0)],
        [2.6, v3(10.6, 4.9, 13.5), v3(10.6, 5.2, 0)],
        [D, v3(10.9, 5.0, 12.4), v3(10.9, 5.3, 0)],
      ]);
    };

    const SKY = {
      rain: ["#3a4c61", "#56687d", "#738396"],
      snow: ["#7f95ae", "#a7b8cb", "#cfdae6"],
      night: ["#060a1c", "#111d45", "#22346a"],
    };
    const WX_SNOW = 2.0;
    const WX_NIGHT = 3.75;
    update.weather = (u) => {
      const D = len("weather");
      const t = at("weather") + u;
      const [c1, c2] = INNER_CUTS.weather;
      const kAB = prog(u, WX_SNOW, WX_SNOW + 0.6, ease.inOutSine);
      const kBC = prog(u, WX_NIGHT, WX_NIGHT + 0.55, ease.inOutSine);
      const cols = kBC > 0 ? mixCols(SKY.snow, SKY.night, kBC) : mixCols(SKY.rain, SKY.snow, kAB);
      setSky(cols);
      const wu = W.win.u;
      wu.uMode.value = 1;
      wu.uTime.value = u + 20;
      wu.uRain.value = 1 - kAB;
      wu.uSnow.value = kAB * (1 - kBC);
      wu.uClouds.value = 0.85 * (1 - kBC);
      wu.uStars.value = kBC;
      wu.uSnowCover.value = clamp((u - WX_SNOW - 0.3) / 1.3) * (1 - kBC);
      wu.uFlash.value = 0.55 * Math.exp(-Math.pow((u - 0.35) / 0.05, 2)) + 0.4 * Math.exp(-Math.pow((u - 0.52) / 0.07, 2)) + 0.45 * Math.exp(-Math.pow((u - 1.4) / 0.06, 2));
      wu.uWind.value = 0.14;
      const phase = u < WX_SNOW + 0.3 ? "rain" : u < WX_NIGHT + 0.25 ? "snow" : "night";
      const weather = {
        rain: { icon: "rain", temp: "16°" },
        snow: { icon: "snow", temp: "-2°" },
        night: { icon: "moon", temp: "12°" },
      }[phase];
      drawApp({
        page: "player",
        theme: phase === "snow" ? "weatherBright" : "weather",
        media: { file: copy.song.file },
        coverImg: cover512,
        playing: true,
        playlistShown: false,
        time: u,
        peek: peekAt(t),
        weather,
        transport: transport(t),
      });
      showWindow({ x: 0, y: -1.12, ry: 0.06 * Math.sin(u * 0.5), rx: -0.02, s: 1.22 });
      W.win.glow.userData.mat.uniforms.uAlpha.value = 0.12;
      // wide, then a hard cut to the play bar in the rain, then wide again
      camPath(u, [
        [0, v3(0, 0.0, 20.8), v3(0, -0.25, 0)],
        [c1, v3(0, 0.0, 20.2), v3(0, -0.25, 0)],
        [c1 + 1e-3, v3(1.7, -3.25, 8.4), v3(1.0, -4.75, 0)],
        [c2, v3(1.0, -3.35, 7.7), v3(0.5, -4.85, 0)],
        [c2 + 1e-3, v3(0, 0.0, 20.4), v3(0, -0.25, 0)],
        [D, v3(0, 0.0, 19.0), v3(0, -0.25, 0)],
      ], ease.linear);
    };

    update.library = (u) => {
      const D = len("library");
      const t = at("library") + u;
      const sw = 2.45;
      const view = u < sw ? "albums" : "songs";
      const lift = (i) => envelope(u, 0.3 + i * 0.04, 2.05 + i * 0.02, 0.6, 0.45, ease.inOutCubic);
      const hidden = {};
      for (let i = 0; i < copy.albums.length; i++) hidden[i] = view === "albums" ? lift(i) : 0;
      W.drawUI((ctx) => {
        ui.drawApp(ctx, {
          page: "library",
          theme: "dark",
          media: { file: copy.song.file },
          view,
          hoverCard: u > 0.02 && u < 0.35 ? 2 : null,
          cardPlay: prog(u, 0.02, 0.18),
          hiddenCards: hidden,
          current: 0,
          time: u,
          hoverRow: u > 2.95 ? 4 : null,
          favs: [0, 3, 6],
          transport: transport(t),
        });
        const nav = ui.hits["nav-songs"] || { cx: 100, cy: 70 };
        const row = ui.hits.row4 || { cx: 600, cy: 360 };
        drawCursor(
          ctx,
          cursorAt(u, [
            [1.9, 420, 420],
            [2.22, nav.cx - 40, nav.cy + 3],
            [2.95, view === "songs" ? row.x + 300 : 600, view === "songs" ? row.cy + 4 : 360],
          ], [[sw - 0.13, sw]]),
        );
      });
      showWindow({ x: 0.4, y: -1.25, ry: lerp(0.3, -0.05, prog(u, 0, D, ease.inOutSine)), rx: -0.05, s: 1.1 });
      // covers lift out of the grid
      const g = ui.hits.grid;
      if (g && view === "albums") {
        W.covers.group.visible = true;
        W.covers.list.forEach((cv, i) => {
          const k = lift(i);
          const col = i % g.cols;
          const row = Math.floor(i / g.cols);
          const px = g.x0 + col * (g.cw + 16) + g.cw / 2;
          const py = g.y0 + row * g.pitch + g.cw / 2;
          const base = W.winLocal(px, py, 0.02);
          const s = g.cw / 100;
          const fan = col - (g.cols - 1) / 2;
          cv.mesh.visible = k > 0.001;
          cv.shadow.visible = k > 0.001;
          cv.mesh.position.set(base.x + fan * 0.42 * k, base.y + (0.35 - row * 0.15) * k, 0.02 + (1.9 + 0.35 * Math.sin(i * 1.7)) * k);
          cv.mesh.rotation.set(0.12 * k, -fan * 0.16 * k, fan * -0.03 * k);
          cv.mesh.scale.setScalar(s * (1 + 0.12 * k));
          cv.shadow.position.set(base.x + fan * 0.3 * k, base.y - 0.25 * k, 0.015);
          cv.shadow.scale.setScalar(s);
          cv.shadow.userData.mat.uniforms.uAlpha.value = 0.55 * k;
        });
      }
      W.bg.uAurora.value = 0.28;
      W.bg.uCenter.value.set(0, -0.3);
      camPath(u, [
        [0, v3(-2.2, 1.0, 20.5), v3(0.2, -0.4, 0)],
        [D, v3(0.8, 0.4, 19.2), v3(0.4, -0.6, 0)],
      ]);
    };

    const VID_IN = [0.7, 1.35];
    update.video = (u) => {
      const im = ease.inOutCubic(prog(u, VID_IN[0], VID_IN[1]));
      const controls = 1 - prog(u, 2.45, 2.75);
      const s1 = [1.45, 2.55];
      const s2 = [2.65, 3.95];
      const sub = u > s1[0] && u < s1[1] ? copy.video.subs[0] : u > s2[0] ? copy.video.subs[1] : null;
      const subAlpha = u < s1[1] + 0.05 ? envelope(u, s1[0], s1[1], 0.15, 0.1) : envelope(u, s2[0], s2[1], 0.15, 0.1);
      drawApp({
        page: "video",
        theme: "dark",
        media: { file: copy.video.file },
        immersive: im,
        controls: im > 0.99 ? controls : 1,
        sub,
        subAlpha,
        transport: {
          position: 724 + u,
          duration: 3735,
          playing: true,
          title: copy.video.title,
          artist: copy.video.file,
          cover: null,
          fav: false,
          kind: "video",
          playlistShown: false,
          subtitlesOn: true,
          fullscreen: im > 0.5,
          volume: 0.8,
          jump: 15,
          mode: "loop",
        },
      });
      const vr = ui.videoRect(prog(u, VID_IN[0], VID_IN[1]));
      const wu = W.win.u;
      wu.uMode.value = 2;
      wu.uVideo.value.set(vr.x, vr.y, vr.w, vr.h);
      wu.uVideoR.value = vr.r;
      wu.uVideoT.value = 140 + u;
      wu.uRadius.value = lerp(10, 0, im);
      wu.uBorder.value = 1 - im;
      const fill = (2 * 0.3153 * 19.5) / W.WIN_H;
      showWindow({ x: 0, y: lerp(-1.3, 0, im), ry: lerp(0.16, 0, im) + 0.05 * (1 - im) * Math.sin(u * 1.6), rx: lerp(-0.05, 0, im), s: lerp(1.02, fill, im) });
      W.win.glow.userData.mat.uniforms.uAlpha.value = 0.2 * (1 - im);
      W.win.shadow.userData.mat.uniforms.uAlpha.value = 0.75 * (1 - im);
      W.bg.uAurora.value = 0.25 * (1 - im);
      cam(v3(0, 0, 19.5), v3(0, 0, 0));
    };

    update.more = (u) => {
      const D = len("more");
      const G = W.tiles;
      G.group.visible = true;
      const cols = 4;
      const tw = G.TW / 100;
      const th = G.TH / 100;
      G.list.forEach((tile, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const d = 0.8 + (c + r) * 0.08 + hash(i * 9.1) * 0.08;
        const k = ease.outCubic(prog(u, d, d + 0.7));
        tile.mesh.position.set((c - 1.5) * (tw + 0.36), (1 - r) * (th + 0.36) + 0.12 * Math.sin(u * 1.2 + i), lerp(-7, 0, k));
        tile.mesh.rotation.set(lerp(0.7, 0, k), lerp((c - 1.5) * 0.2, 0, k), 0);
        tile.mat.uniforms.uOpacity.value = k;
      });
      G.group.position.set(0, -0.2, 0);
      G.group.rotation.set(lerp(0.12, -0.02, prog(u, 0, D, ease.inOutSine)), lerp(-0.22, 0.14, prog(u, 0, D, ease.inOutSine)), 0);
      W.bg.uAurora.value = 0.45;
      W.bg.uCenter.value.set(0, 0);
      camPath(u, [
        [0, v3(0, 0, 25), v3(0, 0, 0)],
        [D, v3(0, -0.3, 19.8), v3(0, -0.2, 0)],
      ]);
    };

    update.outro = (u) => {
      const D = len("outro");
      const L3 = W.logo;
      L3.group.visible = true;
      const k = prog(u, 0.0, 0.6, ease.outCubic);
      L3.group.position.set(0, 1.45, 0);
      L3.group.scale.setScalar(lerp(0.8, 0.92, prog(u, 0, D, ease.outCubic)));
      L3.mesh.rotation.set(0.04 * Math.sin(u * 0.8), lerp(0.55, -0.1, prog(u, 0, D, ease.outCubic)), 0);
      [L3.face, L3.side].forEach((m) => {
        m.transparent = true;
        m.opacity = k;
      });
      L3.glow.userData.mat.uniforms.uAlpha.value = 0.45 * k;
      const P = W.particles;
      P.points.visible = true;
      P.points.position.set(0, 0, -4);
      P.u.uTime.value = u + 40;
      P.u.uConverge.value = 0;
      P.u.uSpread.value = 1.2;
      P.u.uOpacity.value = 0.22 * prog(u, 0, 1);
      W.bg.uAurora.value = 0.42;
      W.bg.uCenter.value.set(0, 0.2);
      cam(v3(0, 0, 14), v3(0, 0, 0));
      dip(u, D, 0, 0.5);
    };

    // ------------------------------------------------------------ captions (scene-relative times)
    // Headlines reveal word by word (st: stagger); a caption that runs to the
    // end of its scene leaves with the cut.
    const caps = [];
    const add = (id, u0, u1, text, style, x, y, o = {}) => {
      const s = scene(id);
      const end = u1 == null ? s.t1 - s.t0 : u1;
      caps.push({ t0: s.t0 + u0, t1: s.t0 + end, text, style, x, y, fout: u1 == null ? 0.06 : 0.25, ...o });
    };
    const HEAD = { stagger: true };
    add("intro", 0.05, 2 * BEAT - 0.04, C.intro[0], "intro", 960, 540, { ...HEAD, zoom: true, fin: 0.3, fout: 0.08 });
    add("intro", 2 * BEAT, 4 * BEAT - 0.04, C.intro[1], "intro", 960, 540, { ...HEAD, zoom: true, fin: 0.3, fout: 0.08 });
    add("intro", 4 * BEAT, 2.75, C.intro[2], "intro", 960, 540, { ...HEAD, zoom: true, fin: 0.3, fout: 0.18 });
    add("intro", 2.85, null, "LightPlayer", "mark", 960, 735, { fin: 0.5 });
    add("hero", 1.0, null, C.heroTitle, "hero", 960, 132, HEAD);
    add("hero", 1.45, null, C.heroSub, "sub", 960, 222);
    add("formats", 0.1, 1.35, C.fmtTitle, "title", 960, 540, { ...HEAD, max: 1500, fout: 0.2 });
    C.fmtCols.forEach((col, c) => {
      add("formats", 1.6 + c * 0.08, null, col.t, "col", COL_X[c], 318, { fin: 0.45 });
      add("formats", 1.8 + c * 0.08, null, col.d, "colsub", COL_X[c], 370, { fin: 0.45 });
    });
    add("formats", 2.3, null, C.fmtFoot, "small", 960, 1000, { fin: 0.45 });
    add("lyrics", 0.12, null, C.lyrTitle, "title", 140, 470, { ...HEAD, align: "left", max: 600, size: 70 });
    add("lyrics", 0.6, null, C.lyrSub, "sub", 140, 640, { align: "left", max: 560 });
    add("ai", 0.08, 2.25, C.aiTitle, "title", 960, 124, HEAD);
    add("ai", 2.35, 3.9, C.aiSub1, "subBright", 960, 124, { max: 1500, fin: 0.4 });
    add("ai", 4.0, null, C.aiSub2, "titleGrad", 960, 124, { ...HEAD, size: 64 });
    add("desktop", 0.08, 1.8, C.dlTitle, "title", 110, 330, { ...HEAD, align: "left", max: 660, size: 68 });
    add("desktop", 1.95, null, C.dlSub, "subBright", 110, 960, { align: "left", max: 1100, fin: 0.4 });
    add("weather", 0.08, INNER_CUTS.weather[0] - 0.02, C.wxTitle, "title", 960, 128, { ...HEAD, fout: 0.06 });
    add("weather", INNER_CUTS.weather[0] + 0.06, INNER_CUTS.weather[1] - 0.02, C.wxSplash, "subBright", 960, 128, { fin: 0.35, fout: 0.06 });
    add("weather", INNER_CUTS.weather[1] + 0.12, WX_NIGHT, C.wxSub1, "subBright", 960, 128, { max: 1500, fin: 0.4 });
    add("weather", WX_NIGHT + 0.15, null, C.wxSub2, "subBright", 960, 128, { max: 1500, fin: 0.4 });
    add("library", 0.08, 2.4, C.libTitle, "title", 960, 124, HEAD);
    add("library", 2.5, null, C.libSub, "subBright", 960, 124, { max: 1500, fin: 0.4 });
    add("video", 0.08, 1.3, C.vidTitle, "title", 960, 118, HEAD);
    add("video", 1.45, null, C.vidSub, "subBright", 960, 110, { max: 1500, size: 30, fin: 0.4 });
    add("more", 0.04, 1.0, C.moreTitle, "hero", 960, 540, { ...HEAD, size: 120, zoom: true, fout: 0.2 });
    add("more", 1.35, null, C.moreSub, "small", 960, 1010, { fin: 0.45 });
    add("outro", 0.25, null, "LightPlayer", "mark", 960, 672, { fin: 0.6, fout: 0.5 });
    add("outro", 0.55, null, C.outroTag, "sub", 960, 760, { size: 40, fin: 0.6, fout: 0.5 });
    add("outro", 0.95, null, C.outroAvail, "small", 960, 900, { fin: 0.6, fout: 0.5 });
    add("outro", 1.15, null, C.outroUrl, "url", 960, 948, { fin: 0.6, fout: 0.5 });

    function sceneAt(t) {
      for (const s of SCENES) if (t >= s.t0 && t < s.t1) return s;
      return SCENES[SCENES.length - 1];
    }

    /**
     * Cut energy: after each cut the camera pushes in from a little further
     * back and the frame settles out of a zoom blur; just before a cut the
     * blur builds, so shots hand over like a whip.
     */
    function cutFx(s, u) {
      const dur = s.t1 - s.t0;
      const inner = INNER_CUTS[s.id] || [];
      let since = u;
      let next = dur;
      for (const c of inner) {
        if (u >= c) since = u - c;
        else if (c < next) next = c;
      }
      const isFirst = s.id === "intro" && since === u;
      const isLast = s.id === "outro";
      let zoom = 0;
      if (!isFirst) {
        const k = clamp(since / 0.55);
        W.camera.translateZ(2.4 * (1 - ease.outExpo(k)));
        zoom = 0.9 * (1 - ease.outCubic(clamp(since / 0.3)));
      }
      if (!isLast) zoom = Math.max(zoom, 0.55 * ease.inQuad(prog(u, next - 0.12, next)));
      W.comp.uZoom.value = zoom;
    }

    function render(t) {
      const tt = clamp(t, 0, DURATION - 1e-4);
      W.reset();
      const s = sceneAt(tt);
      update[s.id](tt - s.t0, tt);
      cutFx(s, tt - s.t0);
      return s;
    }

    return { render, captions: caps, SCENES, DURATION, BAR, sceneAt };
  }

  PV.createScenes = createScenes;
  PV.TIMELINE = { SCENES, DURATION, BAR, INNER_CUTS };
})();
