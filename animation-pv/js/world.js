// The 3D stage built with Three.js: renderer and post-processing, a studio
// environment, the laptop, the floating app window, the 3D app icon, particle
// field, format chips, spectrum bars, feature tiles, album covers and the
// desktop (wallpaper, menu bar, desktop lyrics).
(function () {
  const PV = (window.PV = window.PV || {});
  const T = window.THREE;
  const S = PV.shaders;
  const { canvas: makeCanvas, rng, rr } = PV.util;

  const WIN_W = 11.8; // world units for the 1180 x 760 window
  const WIN_H = 7.6;

  function roundedShape(x0, y0, w, h, r) {
    const s = new T.Shape();
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + w - r, y0);
    s.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x0 + w, y0 + h - r);
    s.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x0 + r, y0 + h);
    s.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x0, y0 + r);
    s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }

  function canvasTexture(c, { srgb = false, mip = true, aniso = 1 } = {}) {
    const t = new T.CanvasTexture(c);
    t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
    t.generateMipmaps = mip;
    t.minFilter = mip ? T.LinearMipmapLinearFilter : T.LinearFilter;
    t.magFilter = T.LinearFilter;
    t.anisotropy = aniso;
    return t;
  }

  function createWorld(canvas, ui, copy, opts = {}) {
    const renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: !!opts.preserve,
    });
    renderer.setPixelRatio(1);
    renderer.toneMapping = T.NoToneMapping;
    const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(35, 16 / 9, 0.1, 500);
    camera.position.set(0, 0, 20);

    // ------------------------------------------------------------ studio environment
    const pmrem = new T.PMREMGenerator(renderer);
    const envScene = new T.Scene();
    envScene.add(
      new T.Mesh(
        new T.SphereGeometry(60, 32, 16),
        new T.ShaderMaterial({
          side: T.BackSide,
          vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader: "varying vec3 vP; void main(){ float y = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.004), vec3(0.03, 0.035, 0.045), smoothstep(-0.3, 0.8, y)), 1.0); }",
        }),
      ),
    );
    const softbox = (w, h, pos, color, k) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(k), side: T.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    softbox(34, 7, [0, 30, 14], "#ffffff", 3.6);
    softbox(7, 34, [-34, 6, 6], "#ffffff", 2.0);
    softbox(7, 30, [34, 4, -4], "#9fdcff", 1.8);
    softbox(46, 2.5, [0, -4, -34], "#ffffff", 1.2);
    softbox(14, 14, [10, 12, 34], "#ffffff", 1.6);
    softbox(60, 10, [0, -20, 20], "#ffffff", 0.35);
    const envRT = pmrem.fromScene(envScene, 0.035);
    scene.environment = envRT.texture;

    // ------------------------------------------------------------ background
    const quadGeo = new T.BufferGeometry();
    quadGeo.setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    quadGeo.setAttribute("uv", new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const bgMat = new T.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 16 / 9 },
        uAurora: { value: 0 },
        uWall: { value: 0 },
        uLift: { value: 0 },
        uTint: { value: new T.Color(0.05, 0.22, 0.42) },
        uTint2: { value: new T.Color(0.16, 0.08, 0.32) },
        uCenter: { value: new T.Vector2(0, -0.1) },
      },
      vertexShader: S.fullscreenVert,
      fragmentShader: S.backgroundFrag,
      depthTest: false,
      depthWrite: false,
    });
    const bg = new T.Mesh(quadGeo, bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -1000;
    scene.add(bg);

    // ------------------------------------------------------------ shared helpers
    function shadowMesh(boxW, boxH, radius, blur, color, alpha, additive = false) {
      const pad = blur * 2.5;
      const mat = new T.ShaderMaterial({
        uniforms: {
          uSize: { value: new T.Vector2(boxW + pad * 2, boxH + pad * 2) },
          uBox: { value: new T.Vector2(boxW, boxH) },
          uRadius: { value: radius },
          uBlur: { value: blur },
          uColor: { value: new T.Color(color) },
          uAlpha: { value: alpha },
        },
        vertexShader: S.basicVert,
        fragmentShader: S.shadowFrag,
        transparent: true,
        depthWrite: false,
        blending: additive ? T.AdditiveBlending : T.NormalBlending,
      });
      const m = new T.Mesh(new T.PlaneGeometry(boxW + pad * 2, boxH + pad * 2), mat);
      m.userData.mat = mat;
      return m;
    }

    function cardMaterial(tex, wpx, hpx, radiusPx, { srgb = true, cell = [0, 0, 1, 1] } = {}) {
      return new T.ShaderMaterial({
        uniforms: {
          uMap: { value: tex },
          uSize: { value: new T.Vector2(wpx, hpx) },
          uRadius: { value: radiusPx },
          uOpacity: { value: 1 },
          uCell: { value: new T.Vector4(...cell) },
          uBright: { value: 1 },
          uSRGB: { value: srgb ? 1 : 0 },
        },
        vertexShader: S.basicVert,
        fragmentShader: S.cardFrag,
        transparent: true,
        depthWrite: false,
      });
    }

    // ------------------------------------------------------------ the app window
    const UI_SCALE = opts.uiScale || 2;
    const uiCanvas = makeCanvas(ui.W * UI_SCALE, ui.H * UI_SCALE);
    const uiCtx = uiCanvas.getContext("2d");
    const uiTex = canvasTexture(uiCanvas, { aniso });

    function windowMaterial(radius) {
      return new T.ShaderMaterial({
        uniforms: {
          uMap: { value: uiTex },
          uSize: { value: new T.Vector2(ui.W, ui.H) },
          uRadius: { value: radius },
          uOpacity: { value: 1 },
          uMode: { value: 0 },
          uTime: { value: 0 },
          uBright: { value: 1 },
          uBorder: { value: 1 },
          uSheen: { value: -2 },
          uSkyTop: { value: new T.Color() },
          uSkyMid: { value: new T.Color() },
          uSkyBot: { value: new T.Color() },
          uRain: { value: 0 },
          uSnow: { value: 0 },
          uStars: { value: 0 },
          uClouds: { value: 0 },
          uFlash: { value: 0 },
          uWind: { value: 0.12 },
          uSnowCover: { value: 0 },
          uLedge: { value: new T.Vector4(10, 1170, 668, 18) },
          uVideo: { value: new T.Vector4(10, 48, 1160, 608) },
          uVideoR: { value: 18 },
          uVideoT: { value: 0 },
        },
        vertexShader: S.basicVert,
        fragmentShader: S.windowFrag,
        transparent: true,
        depthWrite: false,
      });
    }

    const win = (() => {
      const group = new T.Group();
      const mat = windowMaterial(10);
      const mesh = new T.Mesh(new T.PlaneGeometry(WIN_W, WIN_H), mat);
      mesh.renderOrder = 10;
      const shadow = shadowMesh(WIN_W, WIN_H, 0.2, 1.1, "#000000", 0.75);
      shadow.position.set(0, -0.35, -0.02);
      shadow.renderOrder = 5;
      const glow = shadowMesh(WIN_W, WIN_H, 0.3, 3.2, "#2a7fd0", 0.16, true);
      glow.position.set(0, 0, -0.05);
      glow.renderOrder = 4;
      group.add(glow, shadow, mesh);
      scene.add(group);
      return { group, mesh, mat, u: mat.uniforms, shadow, glow };
    })();

    /** Window pixel (0..1180, 0..760) to the window group's local space. */
    function winLocal(px, py, z = 0) {
      return new T.Vector3((px / ui.W - 0.5) * WIN_W, (0.5 - py / ui.H) * WIN_H, z);
    }

    function drawUI(fn) {
      uiCtx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
      fn(uiCtx);
      uiTex.needsUpdate = true;
    }

    // ------------------------------------------------------------ laptop
    const laptop = (() => {
      const group = new T.Group();
      const alu = new T.MeshPhysicalMaterial({ color: 0xc4c6ca, metalness: 1, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3 });
      const baseGeo = new T.ExtrudeGeometry(roundedShape(-6.6, -4.5, 13.2, 9.0, 0.55), {
        depth: 0.24,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments: 4,
        curveSegments: 20,
      });
      baseGeo.rotateX(-Math.PI / 2);
      const base = new T.Mesh(baseGeo, alu);
      base.position.y = 0.05;
      // keyboard deck
      const dc = makeCanvas(1320, 900);
      const d = dc.getContext("2d");
      d.fillStyle = "#c4c6ca";
      d.fillRect(0, 0, 1320, 900);
      d.fillStyle = "#111113";
      rr(d, 150, 40, 1020, 420, 16);
      d.fill();
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const n = r === 0 ? 14 : r === 5 ? 9 : 14 - (r === 1 ? 0 : 1);
        const kh = r === 0 ? 34 : 62;
        const y = 52 + (r === 0 ? 0 : 46 + (r - 1) * 72);
        const kw = (996 - (n - 1) * 8) / n;
        for (let k = 0; k < n; k++) {
          let w = kw;
          let x = 162 + k * (kw + 8);
          if (r === 5 && k === 4) w = kw * 3;
          if (r === 5 && k > 4) x += kw * 2 + 16;
          if (r === 5 && k > 4 && x + w > 1158) continue;
          d.fillStyle = "#070708";
          rr(d, x, y, w, kh, 7);
          d.fill();
          d.strokeStyle = "rgba(255,255,255,0.05)";
          d.lineWidth = 1.5;
          d.stroke();
        }
      }
      d.fillStyle = "#b9bbbf";
      rr(d, 385, 500, 550, 340, 20);
      d.fill();
      d.strokeStyle = "rgba(0,0,0,0.5)";
      d.lineWidth = 2;
      d.stroke();
      d.fillStyle = "rgba(0,0,0,0.45)";
      for (let y = 60; y < 440; y += 12)
        for (let x = 0; x < 6; x++) {
          d.beginPath();
          d.arc(70 + x * 10, y, 2.4, 0, Math.PI * 2);
          d.arc(1250 - x * 10, y, 2.4, 0, Math.PI * 2);
          d.fill();
        }
      const deckTex = canvasTexture(dc, { srgb: true, aniso });
      const deck = new T.Mesh(new T.PlaneGeometry(12.6, 8.6), new T.MeshPhysicalMaterial({ map: deckTex, metalness: 0.85, roughness: 0.42 }));
      deck.rotation.x = -Math.PI / 2;
      deck.position.y = 0.345;
      const lidPivot = new T.Group();
      lidPivot.position.set(0, 0.34, -4.42);
      const lidGeo = new T.ExtrudeGeometry(roundedShape(-6.6, 0, 13.2, 8.7, 0.5), {
        depth: 0.13,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 3,
        curveSegments: 20,
      });
      const lid = new T.Mesh(lidGeo, alu);
      const bezel = new T.Mesh(
        new T.ShapeGeometry(roundedShape(-6.52, 0.08, 13.04, 8.54, 0.44), 20),
        new T.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 }),
      );
      bezel.position.z = 0.162;
      const screenMat = windowMaterial(18);
      screenMat.uniforms.uBorder.value = 0;
      const screen = new T.Mesh(new T.PlaneGeometry(WIN_W, WIN_H), screenMat);
      screen.position.set(0, 0.5 + WIN_H / 2, 0.166);
      screen.renderOrder = 10;
      // the camera notch
      const notch = new T.Mesh(
        new T.ShapeGeometry(roundedShape(-0.55, 0, 1.1, 0.26, 0.1), 8),
        new T.MeshBasicMaterial({ color: 0x000000 }),
      );
      notch.position.set(0, 0.5 + WIN_H - 0.2, 0.168);
      notch.renderOrder = 11;
      lidPivot.add(lid, bezel, screen, notch);
      const contact = shadowMesh(13.6, 9.4, 0.8, 1.6, "#000000", 0.9);
      contact.rotation.x = -Math.PI / 2;
      contact.position.y = -0.01;
      const halo = shadowMesh(13.2, 6, 1, 6, "#1d6fd6", 0.18, true);
      halo.position.set(0, 4.6, -5.2);
      group.add(halo, contact, base, deck, lidPivot);
      scene.add(group);
      return { group, lidPivot, screen, screenMat, u: screenMat.uniforms, alu };
    })();

    // ------------------------------------------------------------ 3D app icon
    const logo = (() => {
      const group = new T.Group();
      const faceTex = canvasTexture(PV.art.appIcon(1024, { full: true }), { srgb: true, aniso });
      const r = 190 / 824;
      const geo = new T.ExtrudeGeometry(roundedShape(0, 0, 1, 1, r), {
        depth: 0.1,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.025,
        bevelSegments: 8,
        curveSegments: 32,
      });
      geo.translate(-0.5, -0.5, -0.05);
      const face = new T.MeshPhysicalMaterial({
        color: 0x404040,
        map: faceTex,
        emissiveMap: faceTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.92,
        roughness: 0.22,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
      });
      const side = new T.MeshPhysicalMaterial({ color: 0x5fb8ff, metalness: 0.55, roughness: 0.22, emissive: 0x1a5fd0, emissiveIntensity: 0.35, clearcoat: 1 });
      const mesh = new T.Mesh(geo, [face, side]);
      mesh.scale.setScalar(3);
      const glow = shadowMesh(3, 3, 0.7, 2.2, "#3d9bff", 0.55, true);
      glow.position.z = -0.4;
      group.add(glow, mesh);
      scene.add(group);
      return { group, mesh, face, side, glow };
    })();

    // ------------------------------------------------------------ particles
    const particles = (() => {
      const N = 5200;
      const R = rng(7);
      const seeds = new Float32Array(N * 4);
      const targets = new Float32Array(N * 3);
      // targets on the icon: half on the white glyph, half on the plate
      const ic = PV.art.appIcon(256, { full: true });
      const id = ic.getContext("2d").getImageData(0, 0, 256, 256).data;
      const glyph = [];
      for (let y = 0; y < 256; y += 1)
        for (let x = 0; x < 256; x += 1) {
          const i = (y * 256 + x) * 4;
          if (id[i] > 235 && id[i + 1] > 235 && id[i + 2] > 235) glyph.push([x, y]);
        }
      const inPlate = (x, y) => {
        const rr2 = 190 / 824;
        const qx = Math.max(Math.abs(x - 0.5) - (0.5 - rr2), 0);
        const qy = Math.max(Math.abs(y - 0.5) - (0.5 - rr2), 0);
        return Math.hypot(qx, qy) <= rr2;
      };
      for (let i = 0; i < N; i++) {
        seeds.set([R(), R(), R(), R()], i * 4);
        let u;
        let v;
        if (i % 2 === 0 && glyph.length) {
          const g = glyph[Math.floor(R() * glyph.length)];
          u = (g[0] + R()) / 256;
          v = (g[1] + R()) / 256;
        } else {
          do {
            u = R();
            v = R();
          } while (!inPlate(u, v));
        }
        targets.set([(u - 0.5) * 3, (0.5 - v) * 3, 0.25 + (R() - 0.5) * 0.08], i * 3);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(N * 3), 3));
      geo.setAttribute("aSeed", new T.Float32BufferAttribute(seeds, 4));
      geo.setAttribute("aTarget", new T.Float32BufferAttribute(targets, 3));
      const mat = new T.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uConverge: { value: 0 },
          uSpread: { value: 1 },
          uSize: { value: 0.09 },
          uPixel: { value: 1080 },
          uOpacity: { value: 1 },
          uGlow: { value: 1.6 },
        },
        vertexShader: S.particlesVert,
        fragmentShader: S.particlesFrag,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });
      const points = new T.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = 20;
      scene.add(points);
      return { points, u: mat.uniforms };
    })();

    // ------------------------------------------------------------ instanced atlas cards
    function atlasField(atlas, cells, count) {
      const tex = canvasTexture(atlas.canvas, { aniso });
      const geo = new T.PlaneGeometry(1, 1);
      const aCell = new T.InstancedBufferAttribute(new Float32Array(count * 4), 4);
      const aAlpha = new T.InstancedBufferAttribute(new Float32Array(count), 1);
      const aGlow = new T.InstancedBufferAttribute(new Float32Array(count), 1);
      aCell.setUsage(T.DynamicDrawUsage);
      aAlpha.setUsage(T.DynamicDrawUsage);
      aGlow.setUsage(T.DynamicDrawUsage);
      geo.setAttribute("aCell", aCell);
      geo.setAttribute("aAlpha", aAlpha);
      geo.setAttribute("aGlow", aGlow);
      const mat = new T.ShaderMaterial({
        uniforms: { uMap: { value: tex }, uOpacity: { value: 1 } },
        vertexShader: S.atlasVert,
        fragmentShader: S.atlasFrag,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new T.InstancedMesh(geo, mat, count);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 30;
      scene.add(mesh);
      const m4 = new T.Matrix4();
      const q = new T.Quaternion();
      const e = new T.Euler();
      const sc = new T.Vector3();
      const pos = new T.Vector3();
      return {
        mesh,
        cells,
        u: mat.uniforms,
        set(i, cell, p, rot, h, alpha, glow = 0) {
          const c = cells[cell];
          e.set(rot[0], rot[1], rot[2]);
          q.setFromEuler(e);
          pos.set(p[0], p[1], p[2]);
          sc.set(h * c.aspect, h, 1);
          m4.compose(pos, q, sc);
          mesh.setMatrixAt(i, m4);
          aCell.setXYZW(i, c.u, c.v, c.du, c.dv);
          aAlpha.setX(i, alpha);
          aGlow.setX(i, glow);
        },
        commit(n) {
          mesh.count = n;
          mesh.instanceMatrix.needsUpdate = true;
          aCell.needsUpdate = true;
          aAlpha.needsUpdate = true;
          aGlow.needsUpdate = true;
        },
      };
    }

    function buildAtlas(labels, { cw, ch, cols, draw }) {
      const rows = Math.ceil(labels.length / cols);
      const W = cw * cols;
      const H = 2 ** Math.ceil(Math.log2(ch * rows));
      const c = makeCanvas(W, H);
      const ctx = c.getContext("2d");
      const cells = labels.map((label, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cw;
        const y = row * ch;
        const [w, h] = draw(ctx, label, x, y, cw, ch);
        return {
          label,
          aspect: w / h,
          u: (x + (cw - w) / 2) / W,
          v: 1 - (y + (ch + h) / 2) / H,
          du: w / W,
          dv: h / H,
        };
      });
      return { canvas: c, cells };
    }

    const FORMAT_LABELS = ["MP3", "FLAC", "WAV", "AAC", "M4A", "OGG", "OPUS", "ALAC", "AIFF", "APE", "WMA", "DSF", "DFF", "TTA", "WV", "MKA", "MP4", "MOV", "MKV", "AVI", "WEBM", "FLV", "TS", "M2TS", "WMV", "RMVB", "MPEG", "VOB", "3GP", "OGV"];
    const chipAtlas = buildAtlas(FORMAT_LABELS, {
      cw: 512,
      ch: 128,
      cols: 4,
      draw: (ctx, label, x, y, cw, ch) => {
        const h = 96;
        ctx.font = `700 50px ${ui.FONT}`;
        if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
        const tw = ctx.measureText(label).width;
        const w = Math.min(cw - 8, tw + 84);
        const px = x + (cw - w) / 2;
        const py = y + (ch - h) / 2;
        const g = ctx.createLinearGradient(px, py, px, py + h);
        g.addColorStop(0, "rgba(255,255,255,0.20)");
        g.addColorStop(1, "rgba(255,255,255,0.07)");
        rr(ctx, px + 2, py + 2, w - 4, h - 4, (h - 4) / 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.42)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, px + w / 2, py + h / 2 + 2);
        if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
        return [w, h];
      },
    });
    const chips = atlasField(chipAtlas, chipAtlas.cells, 200);
    chips.labels = FORMAT_LABELS;

    // recognised words (characters for Chinese, words for English)
    const tokenLabels = [];
    copy.lyrics.slice(0, 4).forEach((l) =>
      copy.splitWords(l).forEach((w) => {
        const s = w.trim();
        if (s && !tokenLabels.includes(s)) tokenLabels.push(s);
      }),
    );
    const tokenAtlas = buildAtlas(tokenLabels, {
      cw: 320,
      ch: 128,
      cols: 6,
      draw: (ctx, label, x, y, cw, ch) => {
        ctx.font = `600 76px ${ui.FONT}`;
        const tw = Math.min(cw - 16, ctx.measureText(label).width + 12);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(102,204,255,0.8)";
        ctx.shadowBlur = 8;
        ctx.fillText(label, x + cw / 2, y + ch / 2 + 3, cw - 16);
        ctx.shadowBlur = 0;
        return [tw, 100];
      },
    });
    const tokens = atlasField(tokenAtlas, tokenAtlas.cells, 160);
    tokens.labels = tokenLabels;

    // ------------------------------------------------------------ spectrum bars
    const bars = (() => {
      const N = 84;
      const geo = new T.PlaneGeometry(1, 1);
      const aH = new T.InstancedBufferAttribute(new Float32Array(N), 1);
      const aI = new T.InstancedBufferAttribute(new Float32Array(N), 1);
      aH.setUsage(T.DynamicDrawUsage);
      geo.setAttribute("aHeight", aH);
      geo.setAttribute("aIndex", aI);
      const mat = new T.ShaderMaterial({
        uniforms: { uOpacity: { value: 1 }, uGlow: { value: 1.35 }, uWidth: { value: 0.09 } },
        vertexShader: S.barsVert,
        fragmentShader: S.barsFrag,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });
      const mesh = new T.InstancedMesh(geo, mat, N);
      mesh.frustumCulled = false;
      mesh.renderOrder = 25;
      const m4 = new T.Matrix4();
      for (let i = 0; i < N; i++) aI.setX(i, i / (N - 1));
      scene.add(mesh);
      return {
        mesh,
        N,
        u: mat.uniforms,
        layout(width, gap, fn) {
          for (let i = 0; i < N; i++) {
            const x = (i - (N - 1) / 2) * (width + gap);
            m4.makeScale(width, 1, 1);
            m4.setPosition(x, 0, 0);
            mesh.setMatrixAt(i, m4);
            aH.setX(i, Math.max(width, fn(i)));
          }
          mat.uniforms.uWidth.value = width;
          mesh.instanceMatrix.needsUpdate = true;
          aH.needsUpdate = true;
        },
      };
    })();

    // ------------------------------------------------------------ feature tiles
    const tiles = (() => {
      const TW = 520;
      const TH = 330;
      const SC = 2;
      const cols = 4;
      const n = copy.tiles.length;
      const c = makeCanvas(TW * SC * cols, TH * SC * Math.ceil(n / cols));
      const ctx = c.getContext("2d");
      ctx.scale(SC, SC);
      PV.drawTiles(ctx, ui, copy, TW, TH, cols);
      const tex = canvasTexture(c, { aniso });
      const group = new T.Group();
      const list = copy.tiles.map((_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const rows = Math.ceil(n / cols);
        const mat = cardMaterial(tex, TW, TH, 26, { srgb: true, cell: [col / cols, 1 - (row + 1) / rows, 1 / cols, 1 / rows] });
        const mesh = new T.Mesh(new T.PlaneGeometry(TW / 100, TH / 100), mat);
        mesh.renderOrder = 15;
        group.add(mesh);
        return { mesh, mat };
      });
      scene.add(group);
      return { group, list, TW, TH };
    })();

    // ------------------------------------------------------------ album covers in 3D
    const covers = (() => {
      const group = new T.Group();
      const list = copy.albums.map((_, i) => {
        const tex = canvasTexture(PV.art.cover(i, 512), { srgb: true, aniso });
        const mat = cardMaterial(tex, 512, 512, 37, { srgb: true });
        const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
        mesh.renderOrder = 40;
        const sh = shadowMesh(1, 1, 0.08, 0.25, "#000000", 0.55);
        sh.renderOrder = 39;
        group.add(sh, mesh);
        return { mesh, mat, shadow: sh };
      });
      win.group.add(group);
      return { group, list };
    })();

    // ------------------------------------------------------------ desktop
    const desktop = (() => {
      const group = new T.Group();
      const SW = 32; // a 1600 x 900 point screen at 50 points per unit
      const SH = 18;
      const wallMat = new T.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
        vertexShader: S.basicVert,
        fragmentShader: S.wallpaperFrag,
        transparent: true,
        depthWrite: false,
      });
      const wall = new T.Mesh(new T.PlaneGeometry(SW, SH), wallMat);
      wall.renderOrder = 1;
      // menu bar
      const mbScale = 2;
      const mbCanvas = makeCanvas(1600 * mbScale, 28 * mbScale);
      const mbCtx = mbCanvas.getContext("2d");
      const mbTex = canvasTexture(mbCanvas, { aniso });
      const mbMat = cardMaterial(mbTex, 1600, 28, 0, { srgb: true });
      const menubar = new T.Mesh(new T.PlaneGeometry(SW, 28 / 50), mbMat);
      menubar.position.set(0, SH / 2 - 14 / 50, 0.01);
      menubar.renderOrder = 2;
      // status item menu
      const trScale = 2;
      const trCanvas = makeCanvas(280 * trScale, 300 * trScale);
      const trCtx = trCanvas.getContext("2d");
      const trTex = canvasTexture(trCanvas, { aniso });
      const trMat = cardMaterial(trTex, 280, 300, 0, { srgb: true });
      const tray = new T.Mesh(new T.PlaneGeometry(280 / 50, 300 / 50), trMat);
      tray.renderOrder = 60;
      // desktop lyrics window
      const dlScale = 3;
      const DLW = copy.dlWidth || 640;
      const dlCanvas = makeCanvas(DLW * dlScale, 96 * dlScale);
      const dlCtx = dlCanvas.getContext("2d");
      const dlTex = canvasTexture(dlCanvas, { aniso });
      const dlMat = cardMaterial(dlTex, DLW, 96, 0, { srgb: true });
      const dl = new T.Mesh(new T.PlaneGeometry(DLW / 50, 96 / 50), dlMat);
      dl.renderOrder = 50;
      // pointer
      const cuScale = 4;
      const cuCanvas = makeCanvas(24 * cuScale, 30 * cuScale);
      const cuCtx = cuCanvas.getContext("2d");
      cuCtx.setTransform(cuScale, 0, 0, cuScale, 0, 0);
      ui.drawCursor(cuCtx, 4, 3, 0, 1);
      const cuTex = canvasTexture(cuCanvas, { aniso });
      const cuMat = cardMaterial(cuTex, 24, 30, 0, { srgb: true });
      const cursor = new T.Mesh(new T.PlaneGeometry(24 / 50, 30 / 50), cuMat);
      cursor.renderOrder = 80;
      group.add(wall, menubar, tray, dl, cursor);
      scene.add(group);
      return {
        group,
        SW,
        SH,
        wall,
        wallMat,
        menubar,
        tray,
        trMat,
        dl,
        dlMat,
        cursor,
        cuMat,
        DLW,
        /** Desktop point (0..1600, 0..900) to the desktop group's local space. */
        local(px, py, z = 0) {
          return new T.Vector3((px / 1600 - 0.5) * SW, (0.5 - py / 900) * SH, z);
        },
        /** Places the pointer with its tip at desktop point (px, py). */
        pointer(px, py, alpha = 1, press = 0) {
          const p = this.local(px - 4 + 12, py - 3 + 15, 0.6);
          cursor.position.copy(p);
          cursor.scale.setScalar(1 - 0.12 * press);
          cuMat.uniforms.uOpacity.value = alpha;
          cursor.visible = alpha > 0.001;
        },
        drawMenuBar(o) {
          mbCtx.setTransform(mbScale, 0, 0, mbScale, 0, 0);
          ui.drawMenuBar(mbCtx, { ...o, w: 1600 });
          mbTex.needsUpdate = true;
        },
        drawTray(o) {
          trCtx.setTransform(trScale, 0, 0, trScale, 0, 0);
          ui.drawTrayMenu(trCtx, o);
          trTex.needsUpdate = true;
        },
        drawLyrics(o) {
          dlCtx.setTransform(dlScale, 0, 0, dlScale, 0, 0);
          ui.drawDesktopLyrics(dlCtx, { ...o, w: DLW, h: 96 });
          dlTex.needsUpdate = true;
        },
      };
    })();

    // ------------------------------------------------------------ captions layer
    const capCanvas = makeCanvas(16, 16);
    const capTex = canvasTexture(capCanvas, { mip: false });

    // ------------------------------------------------------------ post-processing
    const rtOpts = { type: T.HalfFloatType, colorSpace: T.LinearSRGBColorSpace, depthBuffer: false };
    let rtScene = null;
    let levels = [];
    let ups = [];
    const post = new T.Scene();
    const postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new T.Mesh(quadGeo, null);
    quad.frustumCulled = false;
    post.add(quad);
    const mk = (frag, uniforms) =>
      new T.ShaderMaterial({ uniforms, vertexShader: S.fullscreenVert, fragmentShader: frag, depthTest: false, depthWrite: false });
    const brightMat = mk(S.brightFrag, { tSrc: { value: null }, uThreshold: { value: 1.0 } });
    const downMat = mk(S.downFrag, { tSrc: { value: null }, uTexel: { value: new T.Vector2() } });
    const upMat = mk(S.upFrag, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new T.Vector2() }, uAddWeight: { value: 1 } });
    const compMat = mk(S.compositeFrag, {
      tScene: { value: null },
      tBloom: { value: null },
      tCaption: { value: capTex },
      uBloom: { value: 0.9 },
      uTime: { value: 0 },
      uFade: { value: 1 },
      uFlash: { value: 0 },
      uVignette: { value: 0.55 },
      uGrain: { value: 0.022 },
      uExposure: { value: 1 },
      uCaptionOn: { value: 1 },
      uZoom: { value: 0 },
      uRes: { value: new T.Vector2(1920, 1080) },
    });
    const pass = (mat, target) => {
      quad.material = mat;
      renderer.setRenderTarget(target);
      renderer.render(post, postCam);
    };

    let size = { w: 0, h: 0 };
    function setSize(w, h) {
      if (w === size.w && h === size.h) return;
      size = { w, h };
      renderer.setSize(w, h, false);
      rtScene?.dispose();
      levels.forEach((l) => l.dispose());
      ups.forEach((l) => l.dispose());
      rtScene = new T.WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: true, samples: opts.samples ?? 4 });
      levels = [];
      ups = [];
      let lw = w;
      let lh = h;
      for (let i = 0; i < 6; i++) {
        lw = Math.max(1, Math.round(lw / 2));
        lh = Math.max(1, Math.round(lh / 2));
        levels.push(new T.WebGLRenderTarget(lw, lh, rtOpts));
        if (i < 5) ups.push(new T.WebGLRenderTarget(lw, lh, rtOpts));
      }
      compMat.uniforms.uRes.value.set(w, h);
      particles.u.uPixel.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }

    function render(time) {
      bgMat.uniforms.uTime.value = time;
      compMat.uniforms.uTime.value = time;
      renderer.setRenderTarget(rtScene);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, camera);
      // bloom: bright pass, then down and up the chain
      brightMat.uniforms.tSrc.value = rtScene.texture;
      pass(brightMat, levels[0]);
      for (let i = 1; i < levels.length; i++) {
        downMat.uniforms.tSrc.value = levels[i - 1].texture;
        downMat.uniforms.uTexel.value.set(1 / levels[i - 1].width, 1 / levels[i - 1].height);
        pass(downMat, levels[i]);
      }
      let src = levels[levels.length - 1];
      for (let i = levels.length - 2; i >= 0; i--) {
        upMat.uniforms.tSrc.value = src.texture;
        upMat.uniforms.tAdd.value = levels[i].texture;
        upMat.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
        pass(upMat, ups[i]);
        src = ups[i];
      }
      compMat.uniforms.tScene.value = rtScene.texture;
      compMat.uniforms.tBloom.value = src.texture;
      pass(compMat, null);
    }

    /** Hides every object; each scene shows what it needs. */
    function reset() {
      [win.group, laptop.group, logo.group, particles.points, chips.mesh, tokens.mesh, bars.mesh, tiles.group, desktop.group].forEach((o) => (o.visible = false));
      covers.group.visible = false;
      win.group.position.set(0, 0, 0);
      win.group.rotation.set(0, 0, 0);
      win.group.scale.setScalar(1);
      win.u.uOpacity.value = 1;
      win.u.uMode.value = 0;
      win.u.uBright.value = 1;
      win.u.uSheen.value = -2;
      win.u.uBorder.value = 1;
      win.u.uRadius.value = 10;
      win.glow.visible = true;
      win.shadow.visible = true;
      win.glow.userData.mat.uniforms.uAlpha.value = 0.16;
      win.shadow.userData.mat.uniforms.uAlpha.value = 0.75;
      laptop.u.uMode.value = 0;
      bgMat.uniforms.uAurora.value = 0;
      bgMat.uniforms.uWall.value = 0;
      bgMat.uniforms.uLift.value = 0;
      bgMat.uniforms.uCenter.value.set(0, -0.1);
      bgMat.uniforms.uTint.value.setRGB(0.05, 0.22, 0.42);
      bgMat.uniforms.uTint2.value.setRGB(0.16, 0.08, 0.32);
      compMat.uniforms.uBloom.value = 0.9;
      compMat.uniforms.uFade.value = 1;
      compMat.uniforms.uFlash.value = 0;
      compMat.uniforms.uZoom.value = 0;
      compMat.uniforms.uVignette.value = 0.55;
      compMat.uniforms.uExposure.value = 1;
      brightMat.uniforms.uThreshold.value = 1.0;
      camera.fov = 35;
      camera.up.set(0, 1, 0);
    }

    return {
      renderer,
      scene,
      camera,
      setSize,
      render,
      reset,
      ui,
      win,
      winLocal,
      drawUI,
      uiCanvas,
      laptop,
      logo,
      particles,
      chips,
      tokens,
      bars,
      tiles,
      covers,
      desktop,
      bg: bgMat.uniforms,
      comp: compMat.uniforms,
      bright: brightMat.uniforms,
      capCanvas,
      capTex,
      WIN_W,
      WIN_H,
    };
  }

  PV.createWorld = createWorld;
})();
