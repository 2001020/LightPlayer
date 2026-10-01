// The film's timeline. Scenes are laid out on a bar grid (100 BPM, 2.4 s a
// bar) so cuts land on the music. Every frame is a pure function of time t:
// scrubbing and frame-exact export just call update(t).
(function () {
  const PV = (window.PV = window.PV || {});
  const { clamp, lerp, ease, prog, envelope, hash } = PV.util;

  const BAR = 2.4;
  const PLAN = [
    ["intro", 0, 4],
    ["hero", 4, 8],
    ["formats", 8, 12],
    ["lyrics", 12, 16],
    ["ai", 16, 21],
    ["desktop", 21, 24],
    ["weather", 24, 29],
    ["library", 29, 33],
    ["video", 33, 36],
    ["more", 36, 40],
    ["outro", 40, 44],
  ];
  const SCENES = PLAN.map(([id, a, b]) => ({ id, t0: a * BAR, t1: b * BAR }));
  const DURATION = 44 * BAR;

  function createScenes(W, ui, copy) {
    const T = window.THREE;
    const C = copy.cap;
    const U = copy.ui;
    const L = copy.lyrics;
    const NL = L.length;
    const cover512 = PV.art.cover(0, 512);
    const cover256 = PV.art.cover(0, 256);
    const v3 = (x, y, z) => new T.Vector3(x, y, z);
    const at = (id) => SCENES.find((s) => s.id === id).t0;

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
    function lyricTrack(u, events) {
      let cur = events[0];
      let prev = events[0];
      for (const e of events) {
        if (e[0] <= u) {
          prev = cur;
          cur = e;
        }
      }
      const k = clamp((u - cur[0]) / 0.28);
      const scroll = prev[1] + (cur[1] - prev[1]) * ease.outCubic(k);
      return { scroll, active: scroll, karaoke: clamp((u - cur[0]) / (BAR * 0.86)), line: cur[1] };
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
      for (const [a, b] of presses) press = Math.max(press, envelope(u, a, b, 0.05, 0.08, ease.linear));
      const alpha = clamp((u - (first[0] - 0.4)) / 0.35) * clamp((end - u) / 0.35);
      return { x, y, press, alpha };
    }
    function drawApp(state, cursor) {
      W.drawUI((ctx) => {
        ui.drawApp(ctx, state);
        if (cursor && cursor.alpha > 0.001) {
          ctx.save();
          ctx.globalAlpha = cursor.alpha;
          ui.drawCursor(ctx, cursor.x, cursor.y, cursor.press);
          ctx.restore();
        }
      });
    }
    /** Dip to black at both ends of a scene. */
    function dip(u, dur, fin = 0.35, fout = 0.35) {
      W.comp.uFade.value = Math.min(fin > 0 ? ease.inOutSine(clamp(u / fin)) : 1, fout > 0 ? ease.inOutSine(clamp((dur - u) / fout)) : 1);
    }
    function showWindow(o) {
      W.win.group.visible = true;
      place(W.win.group, o);
    }
    function setSky(u, colors) {
      W.win.u.uSkyTop.value.set(colors[0]);
      W.win.u.uSkyMid.value.set(colors[1]);
      W.win.u.uSkyBot.value.set(colors[2]);
    }
    const mixCols = (a, b, k) => a.map((c, i) => PV.util.mixHex(c, b[i], k));

    // ------------------------------------------------------------ scenes
    const update = {};

    update.intro = (u) => {
      const P = W.particles;
      P.points.visible = true;
      P.points.position.set(0, 0.83, 0);
      P.u.uTime.value = u + 3;
      const conv = ease.inOutCubic(prog(u, 4.7, 7.0));
      P.u.uConverge.value = conv;
      P.u.uSpread.value = 1;
      P.u.uOpacity.value = Math.min(prog(u, 0.2, 1.8), 1 - prog(u, 6.8, 7.9)) * lerp(0.75, 1, prog(u, 4.5, 6));
      P.u.uGlow.value = lerp(1.7, 0.42, conv);
      const L3 = W.logo;
      const k = prog(u, 6.6, 7.8, ease.inOutSine);
      if (u > 6.6) {
        L3.group.visible = true;
        L3.group.position.set(0, 0.83, 0);
        L3.group.scale.setScalar(lerp(0.86, 1, prog(u, 6.6, 8.6, ease.outCubic)));
        L3.mesh.rotation.set(0.05 * Math.sin(u * 0.5), lerp(-0.55, 0.0, prog(u, 6.6, 9.0, ease.outCubic)) + 0.05 * Math.sin(u * 0.4), 0);
        [L3.face, L3.side].forEach((m) => {
          m.transparent = true;
          m.opacity = k;
        });
        L3.glow.userData.mat.uniforms.uAlpha.value = 0.5 * k;
      }
      W.bg.uAurora.value = 0.55 * prog(u, 6.4, 8.6);
      W.bg.uCenter.value.set(0, 0.12);
      cam(v3(0, 0, lerp(15.5, 12.8, ease.inOutSine(prog(u, 0, 9.6)))), v3(0, 0, 0));
      dip(u, 9.6, 0.01, 0.4);
    };

    update.hero = (u) => {
      const LP = W.laptop;
      LP.group.visible = true;
      LP.group.position.set(0, -2.3, 0);
      LP.group.rotation.set(0, 0, 0);
      const open = ease.inOutCubic(prog(u, 0.2, 3.1));
      LP.lidPivot.rotation.x = lerp(Math.PI / 2, -0.2, open);
      LP.u.uBright.value = ease.inOutSine(prog(u, 1.3, 2.7));
      LP.u.uTime.value = u;
      LP.u.uSheen.value = lerp(-0.6, 1.8, prog(u, 2.4, 5.4));
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
      W.bg.uAurora.value = 0.3 * prog(u, 1.5, 4);
      W.bg.uCenter.value.set(0, 0.25);
      camPath(u, [
        [0, v3(8.2, 1.3, 13.5), v3(0.6, -1.5, -0.8)],
        [3.4, v3(4.2, 3.7, 18.0), v3(0, 3.0, -4.6)],
        [7.9, v3(0, 4.1, 18.4), v3(0, 3.55, -5.1)],
        [8.5, v3(0, 4.05, 17.6), v3(0, 3.5, -5.1)],
        [9.6, v3(0, 2.55, 1.6), v3(0, 2.45, -5.1), 32],
      ]);
      dip(u, 9.6, 0.5, 0.45);
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
        const speed = 8 + 7 * r1;
        const z = -78 + ((r2 * 92 + u * speed) % 92);
        const ang = r3 * Math.PI * 2 + u * 0.12 * (r4 - 0.5);
        const rad = 2.4 + r4 * 7.8;
        let x = Math.cos(ang) * rad * 1.55;
        let y = Math.sin(ang) * rad;
        let zz = z;
        let rz = (r1 - 0.5) * 0.5;
        let h = 0.62;
        let alpha = clamp((z + 78) / 18) * clamp((12 - z) / 6) * prog(u, 0, 0.9);
        const cell = i % ch.labels.length;
        const target = i < ch.labels.length ? chipTargets.get(cell) : null;
        if (target) {
          const st = 5.0 + target.c * 0.12 + target.r * 0.06;
          const k = ease.inOutCubic(prog(u, st, st + 1.5));
          const [tx, ty] = screenToWorld(COL_X[target.c], 452 + target.r * 92, 20);
          x = lerp(x, tx, k);
          y = lerp(y, ty, k);
          zz = lerp(zz, 0, k);
          rz = lerp(rz, 0, k);
          h = lerp(h, 0.64, k);
          alpha = lerp(alpha, 1, k);
        } else alpha *= 1 - prog(u, 4.8, 5.8);
        ch.set(i, cell, [x, y, zz], [0, 0, rz], h, alpha, 0);
      }
      ch.commit(N);
      W.bg.uAurora.value = 0.38;
      W.bg.uCenter.value.set(0, 0);
      const roll = 0.05 * Math.sin(u * 0.55) * (1 - prog(u, 4.6, 6.2));
      cam(v3(0, 0, 20), v3(0, 0, 0), 35, roll);
      dip(u, 9.6, 0.35, 0.4);
    };

    update.lyrics = (u) => {
      const t = at("lyrics") + u;
      const tr = lyricTrack(u, [
        [-9, 1],
        [0, 2],
        [2.4, 3],
        [4.8, 4],
        [5.5, 7],
        [7.9, 8],
      ]);
      const cursor = cursorAt(u, [
        [3.5, 930, 300],
        [5.0, 650, 545],
        [6.3, 940, 300],
      ], [[5.36, 5.58]], 7.0);
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
          hoverLine: u > 5.0 && u < 5.5 ? 7 : null,
          transport: transport(u < 5.5 ? t : t + 20),
        },
        cursor,
      );
      showWindow({ x: 5.0, y: -0.2, ry: lerp(-0.46, -0.36, prog(u, 0, 9.6, ease.inOutSine)), rx: 0.03, s: 1.16 });
      W.win.u.uSheen.value = lerp(-0.5, 1.6, prog(u, 0.5, 4.5));
      W.bg.uAurora.value = 0.32;
      W.bg.uCenter.value.set(0.55, 0);
      camPath(u, [
        [0, v3(0.6, 0.3, 20.5), v3(1.4, 0, 0)],
        [9.6, v3(0.9, 0.1, 16.4), v3(1.4, 0, 0)],
      ]);
      dip(u, 9.6, 0.35, 0.35);
    };

    update.ai = (u) => {
      const t = at("ai") + u;
      let state = "empty";
      let percent = 0;
      let decoding = false;
      if (u >= 2.25 && u < 6.85) {
        state = "asr";
        decoding = u < 2.9;
        percent = 100 * ease.inOutSine(prog(u, 2.9, 6.8));
      } else if (u >= 6.85) state = "loaded";
      const tr = lyricTrack(u, [
        [-9, 0],
        [6.85, 0],
        [8.4, 1],
        [10.8, 2],
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
          banner: state === "loaded" ? prog(u, 6.95, 7.5) : 0,
          hover: u > 1.75 && u < 2.3 ? "ai" : null,
          press: "ai",
          pressK: envelope(u, 2.0, 2.22, 0.05, 0.08, ease.linear),
          asrBusy: busy,
          asrCount: busy ? 1 : 0,
          transport: transport(t),
        });
        const target = ui.hits["empty-ai"] || { cx: 700, cy: 450 };
        const cursor = cursorAt(u, [
          [0.9, 820, 640],
          [1.75, target.cx + 10, target.cy + 4],
          [2.7, target.cx + 140, target.cy + 110],
        ], [[2.0, 2.22]], 3.3);
        if (cursor.alpha > 0.001) {
          ctx.save();
          ctx.globalAlpha = cursor.alpha;
          ui.drawCursor(ctx, cursor.x, cursor.y, cursor.press);
          ctx.restore();
        }
      });
      showWindow({ x: 0, y: -0.95, rx: -0.1, s: 1.0 });
      W.win.u.uSheen.value = lerp(-0.5, 1.6, prog(u, 6.9, 9.5));
      W.win.group.updateMatrixWorld(true);

      // spectrum bars and recognised words
      const bA = envelope(u, 2.2, 7.6, 0.6, 0.9);
      if (bA > 0) {
        const B = W.bars;
        B.mesh.visible = true;
        B.mesh.position.set(0, -5.75, 2.6);
        B.u.uOpacity.value = bA;
        const energy = 0.55 + 0.45 * Math.sin(u * 2.3) * Math.sin(u * 0.9 + 1);
        B.layout(0.085, 0.075, (i) => {
          const n = 0.5 + 0.5 * Math.sin(i * 0.31 + u * 7.3) * Math.cos(i * 0.17 - u * 4.1);
          const n2 = 0.5 + 0.5 * Math.sin(i * 0.83 - u * 11.0 + Math.sin(i));
          const fall = Math.exp(-Math.pow((i - B.N / 2) / (B.N * 0.36), 4));
          return (0.12 + 1.5 * Math.pow(n, 2) * energy + 0.35 * n2 * n2) * fall * bA;
        });
      }
      const tk = W.tokens;
      const n = 64;
      let used = 0;
      const tmp = new T.Vector3();
      for (let j = 0; j < n; j++) {
        const birth = 3.0 + j * 0.058;
        const life = 1.35;
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
        [2.2, v3(0, 0.0, 15.4), v3(0, -0.2, 0)],
        [3.6, v3(0, 0.6, 20.6), v3(0, -0.7, 0)],
        [7.0, v3(0, 0.5, 20.2), v3(0, -0.72, 0)],
        [12, v3(0, -0.2, 16.4), v3(0, -0.55, 0)],
      ]);
      dip(u, 12, 0.35, 0.35);
    };

    // desktop: (1600 x 900) points
    const DLW = W.desktop.DLW;
    const DL_RECT = { x: 800 - DLW / 2, y: 722, w: DLW, h: 96 };
    const DL_DOT = DLW - 49;
    const DL_PINK = 14 + (DLW - 88 - (8 * 22 + 7 * 7.92)) / 2 + 11 + 2 * 29.92;
    const WIN_RECT = { x: 560, y: 70, s: 0.8 };
    update.desktop = (u) => {
      const t = at("desktop") + u;
      const D = W.desktop;
      D.group.visible = true;
      D.group.position.set(0, 0, 0);
      D.wallMat.uniforms.uTime.value = t;
      D.drawMenuBar({ title: copy.song.title, open: u > 5.05 });
      const item = ui.hits.trayItem || { x: 1270, w: 90, cx: 1315 };
      // app window (closes at 3.6 s)
      const closeK = prog(u, 3.6, 4.0, ease.inOutSine);
      if (closeK < 1) {
        showWindow({});
        const c = D.local(WIN_RECT.x + (ui.W * WIN_RECT.s) / 2, WIN_RECT.y + (ui.H * WIN_RECT.s) / 2, 0.25);
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
      const color = u < 2.8 ? "#66ccff" : "#ff4d8d";
      const hover = envelope(u, 1.45, 3.9, 0.2, 0.3);
      D.dl.position.copy(D.local(DL_RECT.x + DL_RECT.w / 2, DL_RECT.y + DL_RECT.h / 2, 0.45));
      D.drawLyrics({ text: L[a.i], lineK: a.k, color, hover, palette: u > 2.25 && u < 3.55 });
      // status item menu
      const trayK = prog(u, 5.05, 5.25, ease.outCubic);
      D.tray.visible = trayK > 0;
      if (trayK > 0) {
        D.drawTray({ hover: u > 5.75 ? 2 : null });
        D.trMat.uniforms.uOpacity.value = trayK;
        D.tray.position.copy(D.local(item.x + 140, 28 + 5 + 150 - 6 * (1 - trayK), 0.5));
      }
      // pointer
      const cur = cursorAt(u, [
        [0.9, 760, 560],
        [1.55, 930, 770],
        [2.0, DL_RECT.x + DL_DOT, DL_RECT.y + 18],
        [2.5, DL_RECT.x + DL_PINK, DL_RECT.y + 48],
        [3.3, 880, 600],
        [4.6, item.cx, 14],
        [5.55, item.x + 64, 28 + 5 + 6 + 24 + 11 + 14],
      ], [[2.1, 2.25], [2.68, 2.84], [4.92, 5.08]]);
      D.pointer(cur.x, cur.y, cur.alpha, cur.press);
      camPath(u, [
        [0, v3(0, 0, 28.6), v3(0, 0, 0)],
        [3.5, v3(0.6, -1.6, 22.5), v3(0.6, -1.7, 0)],
        [4.0, v3(0.6, -1.6, 22.5), v3(0.6, -1.7, 0)],
        [5.4, v3(10.6, 4.9, 13.5), v3(10.6, 5.2, 0)],
        [7.2, v3(10.9, 5.0, 12.4), v3(10.9, 5.3, 0)],
      ]);
      dip(u, 7.2, 0.35, 0.35);
    };

    const SKY = {
      rain: ["#3a4c61", "#56687d", "#738396"],
      snow: ["#7f95ae", "#a7b8cb", "#cfdae6"],
      night: ["#060a1c", "#111d45", "#22346a"],
    };
    update.weather = (u) => {
      const t = at("weather") + u;
      const kAB = prog(u, 4.2, 5.4, ease.inOutSine);
      const kBC = prog(u, 8.2, 9.4, ease.inOutSine);
      const cols = kBC > 0 ? mixCols(SKY.snow, SKY.night, kBC) : mixCols(SKY.rain, SKY.snow, kAB);
      setSky(u, cols);
      const wu = W.win.u;
      wu.uMode.value = 1;
      wu.uTime.value = u + 20;
      wu.uRain.value = 1 - kAB;
      wu.uSnow.value = kAB * (1 - kBC);
      wu.uClouds.value = 0.85 * (1 - kBC);
      wu.uStars.value = kBC;
      wu.uSnowCover.value = clamp((u - 5.0) / 2.8) * (1 - kBC);
      wu.uFlash.value = 0.55 * Math.exp(-Math.pow((u - 1.75) / 0.05, 2)) + 0.4 * Math.exp(-Math.pow((u - 2.02) / 0.07, 2)) + 0.45 * Math.exp(-Math.pow((u - 4.05) / 0.06, 2));
      wu.uWind.value = 0.14;
      const phase = u < 4.8 ? "rain" : u < 8.8 ? "snow" : "night";
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
      showWindow({ x: 0, y: -1.12, ry: 0.06 * Math.sin(u * 0.32), rx: -0.02, s: 1.22 });
      W.win.glow.userData.mat.uniforms.uAlpha.value = 0.12;
      camPath(u, [
        [0, v3(0, 0.0, 20.6), v3(0, -0.25, 0)],
        [2.6, v3(0, 0.0, 20.2), v3(0, -0.25, 0)],
        [3.6, v3(1.6, -3.2, 8.6), v3(1.0, -4.75, 0)],
        [4.7, v3(1.1, -3.35, 8.0), v3(0.6, -4.85, 0)],
        [5.8, v3(0, 0.0, 19.9), v3(0, -0.25, 0)],
        [12, v3(0, 0.0, 19.4), v3(0, -0.25, 0)],
      ]);
      dip(u, 12, 0.35, 0.35);
    };

    update.library = (u) => {
      const t = at("library") + u;
      const view = u < 5.45 ? "albums" : "songs";
      const lift = (i) => envelope(u, 1.0 + i * 0.07, 4.7 + i * 0.03, 0.95, 0.85, ease.inOutCubic);
      const hidden = {};
      for (let i = 0; i < copy.albums.length; i++) hidden[i] = view === "albums" ? lift(i) : 0;
      W.drawUI((ctx) => {
        ui.drawApp(ctx, {
          page: "library",
          theme: "dark",
          media: { file: copy.song.file },
          view,
          hoverCard: u > 0.4 && u < 1.0 ? 2 : null,
          cardPlay: prog(u, 0.4, 0.6),
          hiddenCards: hidden,
          current: 0,
          time: u,
          hoverRow: u > 6.6 ? 4 : null,
          favs: [0, 3, 6],
          transport: transport(t),
        });
        const nav = ui.hits["nav-songs"] || { cx: 100, cy: 70 };
        const row = ui.hits.row4 || { cx: 600, cy: 360 };
        const cursor = cursorAt(u, [
          [4.7, 420, 420],
          [5.15, nav.cx - 40, nav.cy + 3],
          [6.6, view === "songs" ? row.x + 300 : 600, view === "songs" ? row.cy + 4 : 360],
        ], [[5.28, 5.45]], 8.8);
        if (cursor.alpha > 0.001) {
          ctx.save();
          ctx.globalAlpha = cursor.alpha;
          ui.drawCursor(ctx, cursor.x, cursor.y, cursor.press);
          ctx.restore();
        }
      });
      showWindow({ x: 0.4, y: -1.25, ry: lerp(0.3, -0.05, prog(u, 0, 9.6, ease.inOutSine)), rx: -0.05, s: 1.1 });
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
        [9.6, v3(0.8, 0.4, 19.2), v3(0.4, -0.6, 0)],
      ]);
      dip(u, 9.6, 0.35, 0.35);
    };

    update.video = (u) => {
      const im = ease.inOutCubic(prog(u, 2.0, 3.1));
      const controls = 1 - prog(u, 5.0, 5.45);
      const sub = u > 3.4 && u < 5.25 ? copy.video.subs[0] : u > 5.4 ? copy.video.subs[1] : null;
      const subAlpha = u < 5.3 ? envelope(u, 3.4, 5.25, 0.18, 0.15) : envelope(u, 5.4, 7.4, 0.18, 0.15);
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
      const vr = ui.videoRect(prog(u, 2.0, 3.1));
      const wu = W.win.u;
      wu.uMode.value = 2;
      wu.uVideo.value.set(vr.x, vr.y, vr.w, vr.h);
      wu.uVideoR.value = vr.r;
      wu.uVideoT.value = 140 + u;
      wu.uRadius.value = lerp(10, 0, im);
      wu.uBorder.value = 1 - im;
      const fill = (2 * 0.3153 * 19.5) / W.WIN_H;
      showWindow({ x: 0, y: lerp(-1.3, 0, im), ry: lerp(0.16, 0, im) + 0.04 * (1 - im) * Math.sin(u), rx: lerp(-0.05, 0, im), s: lerp(1.02, fill, im) });
      W.win.glow.userData.mat.uniforms.uAlpha.value = 0.2 * (1 - im);
      W.win.shadow.userData.mat.uniforms.uAlpha.value = 0.75 * (1 - im);
      W.bg.uAurora.value = 0.25 * (1 - im);
      cam(v3(0, 0, 19.5), v3(0, 0, 0));
      dip(u, 7.2, 0.35, 0.35);
    };

    update.more = (u) => {
      const G = W.tiles;
      G.group.visible = true;
      const cols = 4;
      const tw = G.TW / 100;
      const th = G.TH / 100;
      G.list.forEach((tile, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const d = 1.35 + (c + r) * 0.13 + hash(i * 9.1) * 0.12;
        const k = ease.outCubic(prog(u, d, d + 1.2));
        tile.mesh.position.set((c - 1.5) * (tw + 0.36), (1 - r) * (th + 0.36) + 0.12 * Math.sin(u * 0.8 + i), lerp(-7, 0, k));
        tile.mesh.rotation.set(lerp(0.7, 0, k), lerp((c - 1.5) * 0.2, 0, k), 0);
        tile.mat.uniforms.uOpacity.value = k;
      });
      G.group.position.set(0, -0.2, 0);
      G.group.rotation.set(lerp(0.12, -0.02, prog(u, 0, 9.6, ease.inOutSine)), lerp(-0.22, 0.14, prog(u, 0, 9.6, ease.inOutSine)), 0);
      W.bg.uAurora.value = 0.45;
      W.bg.uCenter.value.set(0, 0);
      camPath(u, [
        [0, v3(0, 0, 26), v3(0, 0, 0)],
        [9.6, v3(0, -0.3, 19.6), v3(0, -0.2, 0)],
      ]);
      dip(u, 9.6, 0.35, 0.4);
    };

    update.outro = (u) => {
      const L3 = W.logo;
      L3.group.visible = true;
      const k = prog(u, 0.3, 1.6, ease.outCubic);
      L3.group.position.set(0, 1.45, 0);
      L3.group.scale.setScalar(lerp(0.8, 0.92, prog(u, 0.3, 9.6, ease.outCubic)));
      L3.mesh.rotation.set(0.04 * Math.sin(u * 0.6), lerp(0.5, -0.12, prog(u, 0.3, 9.6, ease.outCubic)), 0);
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
      P.u.uOpacity.value = 0.22 * prog(u, 0, 2);
      W.bg.uAurora.value = 0.42;
      W.bg.uCenter.value.set(0, 0.2);
      cam(v3(0, 0, 14), v3(0, 0, 0));
      dip(u, 9.6, 0.35, 0.8);
    };

    // ------------------------------------------------------------ captions (absolute times)
    const caps = [];
    const add = (scene, u0, u1, text, style, x, y, o = {}) => caps.push({ t0: at(scene) + u0, t1: at(scene) + u1, text, style, x, y, ...o });
    add("intro", 0.9, 2.95, C.intro[0], "intro", 960, 540);
    add("intro", 2.95, 4.95, C.intro[1], "intro", 960, 540);
    add("intro", 4.95, 6.7, C.intro[2], "intro", 960, 540);
    add("intro", 7.3, 9.3, "LightPlayer", "mark", 960, 735, { fout: 0.5 });
    add("hero", 3.6, 9.0, C.heroTitle, "hero", 960, 132, { fout: 0.5 });
    add("hero", 4.3, 9.0, C.heroSub, "sub", 960, 222, { fout: 0.5 });
    add("formats", 0.5, 4.8, C.fmtTitle, "title", 960, 540, { max: 1500 });
    C.fmtCols.forEach((col, c) => {
      add("formats", 5.5 + c * 0.12, 9.3, col.t, "col", COL_X[c], 318, { fout: 0.4 });
      add("formats", 5.8 + c * 0.12, 9.3, col.d, "colsub", COL_X[c], 370, { fout: 0.4 });
    });
    add("formats", 6.6, 9.3, C.fmtFoot, "small", 960, 1000, { fout: 0.4 });
    add("lyrics", 0.7, 9.2, C.lyrTitle, "title", 140, 470, { align: "left", max: 600, size: 70 });
    add("lyrics", 1.5, 9.2, C.lyrSub, "sub", 140, 640, { align: "left", max: 560 });
    add("ai", 0.5, 5.5, C.aiTitle, "title", 960, 124);
    add("ai", 5.9, 8.9, C.aiSub1, "subBright", 960, 124, { max: 1500 });
    add("ai", 9.1, 11.8, C.aiSub2, "titleGrad", 960, 124, { size: 64 });
    add("desktop", 0.5, 3.6, C.dlTitle, "title", 110, 330, { align: "left", max: 520, size: 68 });
    add("desktop", 4.4, 7.0, C.dlSub, "subBright", 110, 960, { align: "left", max: 1100 });
    add("weather", 0.5, 2.75, C.wxTitle, "title", 960, 128, { fout: 0.45 });
    add("weather", 6.3, 11.7, C.wxSub, "subBright", 960, 128, { max: 1500 });
    add("library", 0.5, 5.2, C.libTitle, "title", 960, 124);
    add("library", 5.5, 9.3, C.libSub, "subBright", 960, 124, { max: 1500 });
    add("video", 0.3, 2.1, C.vidTitle, "title", 960, 118);
    add("video", 3.5, 7.0, C.vidSub, "subBright", 960, 110, { max: 1500, size: 30 });
    add("more", 0.25, 2.2, C.moreTitle, "hero", 960, 540, { size: 110 });
    add("outro", 1.0, 9.2, "LightPlayer", "mark", 960, 672);
    add("outro", 1.7, 9.2, C.outroTag, "sub", 960, 760, { size: 40 });
    add("outro", 2.8, 9.2, C.outroAvail, "small", 960, 900);
    add("outro", 3.2, 9.2, C.outroUrl, "url", 960, 948);

    function sceneAt(t) {
      for (const s of SCENES) if (t >= s.t0 && t < s.t1) return s;
      return SCENES[SCENES.length - 1];
    }

    function render(t) {
      const tt = clamp(t, 0, DURATION - 1e-4);
      W.reset();
      const s = sceneAt(tt);
      update[s.id](tt - s.t0, tt);
      return s;
    }

    return { render, captions: caps, SCENES, DURATION, BAR, sceneAt };
  }

  PV.createScenes = createScenes;
  PV.TIMELINE = { SCENES, DURATION, BAR };
})();
