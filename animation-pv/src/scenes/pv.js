// pv.js: the LightPlayer promo film (64 s). Storyboard: STORYBOARD.md.
// Every frame is a pure function of t. Times below are video times in seconds.
(() => {
  // ---------- staging ----------
  const WX = 256, WY = 170, WS = 1.1;                       // the app window in the world (1280 × 780 CSS px → 1408 × 858)
  const U = (x, y, wx = WX, wy = WY, ws = WS) => [wx + x * ws, wy + y * ws];
  const LEDGE_Y = U(0, TRANSPORT_TOP)[1];                   // the play bar's top edge: Clawd stands on it
  function win(fn, wx = WX, wy = WY, ws = WS) { uiPush(wx, wy, ws); const r = fn(); uiPop(); return r; }

  // The songs (made up for the film). Formats from the README: APE and WMA are converted, DSF too, FLAC plays directly.
  const SONGS = [
    { title: '晚风与光', artist: 'Clawd', album: '纸上旋律', dur: '3:56', secs: 236, cover: 'dusk', file: '晚风与光.ape', fmt: 'APE', col: '#ff9a62' },
    { title: '无名的海', artist: '小陶', album: '潮汐', dur: '4:12', secs: 252, cover: 'sea', file: '无名的海.wma', fmt: 'WMA', col: '#1f8f8f' },
    { title: '雨后森林', artist: '小陶', album: '春天', dur: '3:21', secs: 201, cover: 'leaf', file: '雨后森林.dsf', fmt: 'DSF', col: '#5fb36a' },
    { title: '城市灯火', artist: '霓虹', album: '夜行', dur: '3:48', secs: 228, cover: 'city', file: '城市灯火.flac', fmt: 'FLAC', col: '#4a4ea8' },
  ];
  const LYRICS_A = ['风吹过黄昏的街角', '把光留在你眉梢', '我哼着那首老歌谣', '纸上的旋律在奔跑', '晚风啊请你慢一点', '让这束光再亮一点', '我们走过的每一天', '都在歌里不会走远'];
  const LYRICS_B = ['海浪轻轻拍着岸', '没有名字的夜晚', '星星落进我掌心', '潮水带走了叹息', '你说远方有灯塔', '我就一直向前划'];

  // ---------- backdrop: a painted wall behind the window, a different colour in every shot ----------
  function wall(c0, c1, c2, key, a = 1) {
    if (a <= 0) return;
    boilSeed(key + 'wall');
    paint(rectPts(-200, -200, W + 400, H + 400), { wash: c0, washOp: 255 * a, ink: null });
    boilSeed(key + 'b1'); paint(ellPts(260, 180, 520, 330, 26, 6), { wash: c1, washOp: 150 * a, ink: null });
    boilSeed(key + 'b2'); paint(ellPts(1700, 900, 600, 380, 26, 6), { wash: c2, washOp: 140 * a, ink: null });
    boilSeed(key + 'b3'); paint(ellPts(1500, 120, 380, 200, 22, 6), { wash: c2, washOp: 80 * a, ink: null });
  }
  function nightSky(t, key = 'night') {
    boilSeed(key);
    paint(rectPts(-300, -300, W + 600, H + 600), { wash: '#1c2350', ink: null });
    boilSeed(key + 'v'); paint(ellPts(W * .5, H * 1.05, W * .8, H * .45, 30, 10), { wash: '#3a3478', washOp: 150, ink: null });
    boilSeed(key + 'i'); paint(ellPts(W * .22, H * .12, W * .4, H * .25, 24, 10), { wash: '#2b3b7c', washOp: 120, ink: null });
    for (let i = 0; i < 46; i++) {
      boilSeed(key + 'st' + i);
      const x = hash(i) * (W + 200) - 100, y = hash(i + 100) * H * .9 - 40, tw = .55 + .45 * Math.sin(t * (2 + 2 * hash(i + 300)) + i);
      paint(starPts(x, y, (3 + 5 * hash(i + 200)) * tw, .35, 4), { wash: PAL.cream, washOp: Math.min(255, 140 + 100 * tw), ink: null });
    }
  }

  // ---------- tagline: a brush stroke sweeps in, the words write on, then both leave (screen space) ----------
  function tagline(s, t, t0, t1, col, ink = PAL.ink, y = 92) {
    if (t < t0 || t > t1 + .4) return;
    const tw = textW(s, 54, 400, FONT_TITLE), w = tw + 120, x0 = W / 2 - w / 2;
    const kIn = easeOut(seg(t, t0, t0 + .45)), kOut = ease(seg(t, t1, t1 + .4));
    const L = x0 + w * kOut, R = x0 + w * kIn;
    if (R - L > 8) {
      boilSeed('tagstroke' + t0);
      const pts = [];
      for (let k = 0; k <= 10; k++) pts.push([lerp(L, R, k / 10), y - 44 + Math.sin(k * .9 + t0) * 4]);
      pts.push([R + 18, y - 10], [R + 6, y + 30]);
      for (let k = 10; k >= 0; k--) pts.push([lerp(L, R, k / 10), y + 42 + Math.sin(k * 1.1 + t0) * 4]);
      pts.push([L - 14, y + 8]);
      paint(pts, { wash: col, washOp: 245, ink: PAL.ink, sw: .7, curv: .4 });
    }
    const reveal = seg(t, t0 + .25, t0 + .25 + s.length * .045), a = 1 - kOut;
    glyph(c => {
      c.save(); c.beginPath(); const cl = Math.max(L, W / 2 - tw / 2 - 10), cr = Math.min(R, W / 2 - tw / 2 - 10 + (tw + 20) * reveal); c.rect(cl, y - 60, Math.max(0, cr - cl), 120); c.clip();
      c.font = `54px ${FONT_TITLE}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = ink; c.fillText(s, W / 2, y + 3); c.restore();
    }, 1);
  }

  // ---------- the cursor: a painted pointer that glides on arcs and clicks ----------
  // keys: [[t, x, y], ...] in world px; clicks: [t, ...]
  function cursor(t, keys, clicks = [], col = '#ffffff') {
    if (t < keys[0][0] - .2 || t > keys[keys.length - 1][0] + .5) return;
    const a = clamp(Math.min(seg(t, keys[0][0] - .2, keys[0][0]), 1 - seg(t, keys[keys.length - 1][0] + .2, keys[keys.length - 1][0] + .5)));
    let x = keys[0][1], y = keys[0][2];
    for (let i = 1; i < keys.length; i++) {
      const [ta, xa, ya] = keys[i - 1], [tb, xb, yb] = keys[i];
      if (t >= tb) { x = xb; y = yb; continue; }
      if (t > ta) { const k = ease(seg(t, ta, tb)), [px, py] = arcPt([xa, ya], [xb, yb], Math.hypot(xb - xa, yb - ya) * .18, k); x = px; y = py; }
      break;
    }
    let sq = 1;
    for (const c of clicks) {
      const d = t - c;
      if (d > -.08 && d < .12) sq = 1 - .18 * Math.sin(seg(t, c - .08, c + .12) * Math.PI);
      if (d > 0 && d < .45) { boilSeed('ring' + c); paint(ellPts(x, y, 10 + 60 * easeOut(d / .45), 10 + 60 * easeOut(d / .45), 26), { wash: null, ink: ACC.accent, sw: 1.4 * (1 - d / .45) + .2 }); }
    }
    if (a <= 0) return;
    push(); translate(x, y); scale(sq * 1.25);
    boilSeed('cursor');
    paint([[0, 0], [0, 34], [8, 26], [14, 39], [20, 36], [14, 24], [25, 24]], { wash: col, washOp: 255 * a, ink: PAL.ink, sw: .9 });
    pop();
  }

  // ---------- the spark: the motif (a bead of blue light with a trail) ----------
  function spark(path, t, t0, t1, o = {}) {
    if (t < t0 || t > t1 + (o.linger || 0)) return null;
    const at = tt => { const k = (o.ease || easeIn)(seg(tt, t0, t1)); return path(k); };
    const P = []; for (let k = 7; k >= 0; k--) P.push(at(Math.max(t0, t - k * .04)));
    const [x, y] = at(t);
    if (Math.hypot(P[7][0] - P[0][0], P[7][1] - P[0][1]) > 6) { boilSeed('trail' + t0); paint(ribbon(P, 2, 22), { wash: '#bfe8ff', washOp: 220, ink: null }); }
    glow(x, y, 120, '#66ccff', 1); glow(x, y, 40, '#ffffff', .8);
    boilSeed('sparkcore' + t0);
    paint(starPts(x, y, 18 * (1 + .1 * Math.sin(t * 30)), .4, 4, t * 4), { wash: '#ffffff', ink: null });
    return [x, y];
  }
  const sparkle = (x, y, r, k, col = PAL.cream) => { if (k > 0 && k < 1) { boilSeed('spk' + (x | 0) + (y | 0)); paint(starPts(x, y, r * backOut(k) * (1 - k * .6), .25, 4, k * 2), { wash: col, washOp: 255 * (1 - k * k), ink: null }); } };

  // ---------- a full-frame wash wipe (the kit's brush wipe without the slow watercolour) ----------
  function wipe(p, cols, dir = 1) {
    if (p <= 0 || p >= 1) return;
    const n = 5, bh = (H + 420) / n + 40;
    push(); translate(W / 2, H / 2); rotate(-.1 * dir); if (dir < 0) scale(-1, 1); translate(-W / 2, -H / 2);
    for (let i = 0; i < n; i++) {
      const y0 = -230 + i * (H + 420) / n, d = [0, .14, .06, .18, .1][i];
      const q = p < .5 ? easeOut(clamp((p * 2 - d) / (1 - d))) : ease(clamp(((p - .5) * 2 - d) / (1 - d)));
      const x0 = p < .5 ? -300 : lerp(-300, W + 400, q), x1 = p < .5 ? lerp(-300, W + 400, q) : W + 400;
      if (x1 - x0 < 30) continue;
      boilSeed('wipe' + i);
      const pts = [], rag = k => 40 + 50 * hash(i * 31 + k);
      for (let k = 0; k <= 8; k++) pts.push([lerp(x0, x1, k / 8), y0 + Math.sin(k * .9 + i) * 14]);
      for (let k = 1; k < 9; k++) pts.push([x1 + rag(k) - 40, y0 + bh * k / 9]);
      for (let k = 8; k >= 0; k--) pts.push([lerp(x0, x1, k / 8), y0 + bh + Math.sin(k * .8 + i * 2) * 14]);
      if (p >= .5) for (let k = 8; k > 0; k--) pts.push([x0 - rag(k + 20) + 40, y0 + bh * k / 9]);
      paint(pts, { wash: cols[i % cols.length], ink: PAL.ink, sw: .6 });
    }
    pop();
  }

  // ---------- an umbrella Clawd can hold (arm space: +x along the arm) ----------
  const umbrella = k => (u, sw) => {
    if (k <= 0) return;
    const L = 5.2 * u, R = 6.4 * u * easeOut(k), Hh = 3 * u * easeOut(k);
    inkLine([[0, 0], [L + Hh * .2, 0]], sw * .9, PAL.ink, 'ink', 0);
    const cols = ['#ff4d6d', '#ffd166', '#66ccff', '#13ce66', '#ff7849', '#7c5cff'];
    for (let i = 0; i < 6; i++) {
      const a0 = -Math.PI / 2 + i * Math.PI / 6, a1 = a0 + Math.PI / 6, P = [[L, 0]];
      for (let j = 0; j <= 4; j++) { const a = lerp(a0, a1, j / 4); P.push([L + Math.cos(a) * Hh, Math.sin(a) * R]); }
      paint(P, { wash: cols[i], ink: PAL.ink, sw: sw * .5 });
    }
    paint(ellPts(L + Hh + .3 * u, 0, .35 * u, .35 * u, 8), { wash: PAL.ink, ink: null });
  };
  // a stack of file cards Clawd carries (body space)
  function fileCard(x, y, s, fmt, col, rot = 0, a = 1) {
    push(); translate(x, y); rotate(rot); scale(s);
    boilSeed('card' + fmt);
    paint([[-40, -52], [22, -52], [40, -34], [40, 52], [-40, 52]], { wash: '#fffdf7', washOp: 255 * a, ink: PAL.ink, sw: .8 });
    paint([[22, -52], [22, -34], [40, -34]], { wash: mixCol(col, '#ffffff', .4), ink: PAL.ink, sw: .5 });
    paint(rrPts(-30, 10, 60, 30, 7), { wash: col, ink: null });
    pop();
    uiPush(x, y, s, rot);
    txt(fmt, 0, 25.5, { size: 17, weight: 700, color: '#ffffff', align: 'center', font: FONT_LOGO, alpha: a });
    icon('music', 0, -18, 30, mixCol(col, PAL.ink, .2), { alpha: a });
    uiPop();
  }

  // =============================================================== A: the light (0 – 6)
  const ICX = 960, ICY = 430, ICS = 340;                  // the icon on screen: centre and 1024-box size
  const icRect = () => { const s = ICS / 1024; return [ICX - 412 * s, ICY - 412 * s, 824 * s, 824 * s, 190 * s]; };
  const winRect = () => [WX, WY, APP_W * WS, APP_H * WS, 12 * WS];
  function morphRect(k) { const a = icRect(), b = winRect(); return a.map((v, i) => lerp(v, b[i], k)); }
  const sparkPathA = k => arcPt([240, -60], [ICX, ICY], -260, k);

  function shotA(t) {
    nightSky(t);
    const bloom = seg(t, 2.0, 2.7), morph = ease(seg(t, 5.0, 6.0));
    // the spark falls on an arc and blooms into the icon
    const sp = spark(sparkPathA, t, .6, 2.0, { ease: k => easeIn(k) * .6 + ease(k) * .4 });
    if (t > 2.0) glow(ICX, ICY, 260 * (1 - morph), '#66ccff', .55 * (1 - morph) * (1 - .4 * Math.exp(-(t - 2) * 3)));
    if (t >= 2.0 && morph < .02) {
      const s = backOut(bloom);
      appIcon(ICX, ICY, ICS * s, { bars: seg(t, 2.6, 3.0) * (.6 + .4 * pulse(t)) });
    }
    if (morph >= .02) {
      const [x, y, w, h, r] = morphRect(morph);
      rr(x, y, w, h, r, { fill: '#5aa9ff', ink: PAL.ink, sw: 1, key: 'morph' });
      if (morph < .35) appIcon(ICX, ICY, ICS, { alpha: 1 - morph / .35, ink: null });
      if (morph < .5) { boilSeed('mtri'); const c = [x + w / 2, y + h / 2], sc = (1 - morph * 2) * ICS / 1024; paint([[c[0] - 92 * sc, c[1] - 172 * sc], [c[0] + 188 * sc, c[1]], [c[0] - 92 * sc, c[1] + 172 * sc]], { wash: '#ffffff', washOp: 255 * (1 - morph * 2), ink: null }); }
    }
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + .3, q = seg(t, 2.0 + i * .02, 2.7 + i * .02); sparkle(ICX + Math.cos(a) * 260 * q, ICY + Math.sin(a) * 230 * q, 22, q, i % 2 ? '#bfe8ff' : PAL.cream); }
    // title and the one-line introduction (README)
    const tk = seg(t, 3.6, 4.2), sk = seg(t, 4.2, 4.8), out = seg(t, 4.85, 5.2);
    if (tk > 0) {
      const s = 'LightPlayer';
      for (let i = 0; i < s.length; i++) {
        const k = backOut(seg(t, 3.6 + i * .04, 3.95 + i * .04)), x = W / 2 - textW(s, 120, 600, FONT_LOGO) / 2 + textW(s.slice(0, i), 120, 600, FONT_LOGO) + textW(s[i], 120, 600, FONT_LOGO) / 2;
        if (k > 0) glyph(c => { c.translate(x, 700 + (1 - k) * 30); c.scale(k, k); c.font = `600 120px ${FONT_LOGO}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#0d1230'; c.fillText(s[i], 5, 6); c.fillStyle = i < 5 ? '#ffffff' : '#9fdcff'; c.fillText(s[i], 0, 0); }, 1 - out);
      }
    }
    if (sk > 0) txt('轻量的 macOS 与 Windows 多媒体播放器', W / 2, 800, { size: 40, font: FONT_TITLE, color: PAL.cream, align: 'center', alpha: easeOut(sk) * (1 - out) });
    // Clawd peeks up from below, starstruck, and ducks out as the window opens
    const up = easeOut(seg(t, 2.8, 3.4)) - easeIn(seg(t, 4.9, 5.4));
    if (up > 0) {
      flushLetters();
      const mood = emotions(t, [[0, 'surprised'], [3.25, 'starstruck']]);
      clawd(1580, 1080 + 40 - 250 * up, 26, { ...mood, lookX: -.8, lookY: -.6, noShadow: true });
    }
    if (t < .7) iris(W / 2, H / 2 - 40, lerp(0, 1300, easeIn(t / .7)), '#0d1230');
  }

  // =============================================================== B: everything plays (6 – 14.5)
  const DROPS = [7.9, 8.85, 9.8, 10.75];   // each card leaves Clawd's hand here
  const FLY = .55;
  const PLAY_AT = 12.95, MINI_AT = 13.85;
  function libRows(t) {
    return SONGS.map((s, i) => {
      const land = DROPS[i] + FLY, k = easeOut(seg(t, land, land + .3));
      return { ...s, fmt: null, k, flash: k > 0 ? Math.exp(-(t - land) * 3) * .9 : 0, current: i === 0 && t > PLAY_AT };
    });
  }
  function emptyLib(k) {
    if (k <= 0) return;
    const cx = 232 + (APP_W - 10 - 232) / 2, cy = 400;
    rr(cx - 32, cy - 92, 64, 64, 18, { fill: mixCol(ACC.accent, '#ffffff', .82), key: 'eico' });
    icon('library', cx, cy - 60, 30, ACC.text, { alpha: k });
    txt('媒体库还是空的', cx, cy - 2, { size: 18, weight: 700, align: 'center', alpha: k });
    txt('添加你的音乐或视频文件夹（会包含所有子文件夹），也可以直接把', cx, cy + 32, { size: 14, color: TH.faint, align: 'center', alpha: k });
    txt('文件、文件夹拖到这里。播放过的文件也会自动记录在媒体库中。', cx, cy + 54, { size: 14, color: TH.faint, align: 'center', alpha: k });
    btn(cx - 58, cy + 80, '添加文件夹', { kind: 'primary', icon: 'folderPlus', w: 116 });
  }
  function shotB(t) {
    wall('#e6e0f5', '#cfe9fb', '#f6dcef', 'B');
    useTheme(LIGHT, '#66ccff');
    const rows = libRows(t), first = rows[0].k;
    const playing = t > PLAY_AT, pos = playing ? (t - PLAY_AT) : 0;
    const hint = DROPS.reduce((m, d) => Math.max(m, seg(t, d + .25, d + .4) * (1 - seg(t, d + FLY, d + FLY + .25))), 0);
    let playAll;
    win(() => {
      winFrame(); titlebar({ page: 'library', file: playing ? SONGS[0].file : null });
      playAll = libraryPage({ rows: first > 0 ? rows.filter(r => r.k > 0) : [], press: Math.sin(seg(t, PLAY_AT - .08, PLAY_AT + .14) * Math.PI), hot: t > PLAY_AT - .4 && t < PLAY_AT + .3 }).playAll;
      emptyLib(1 - seg(t, DROPS[0] + FLY - .05, DROPS[0] + FLY + .15));
      transport(playing ? { pos: 0 + pos, dur: 236, playing: true, title: SONGS[0].title, artist: SONGS[0].artist, cover: 'dusk', press: Math.sin(seg(t, MINI_AT - .08, MINI_AT + .12) * Math.PI) * 0 } : {});
      dropHint(hint);
    });
    // the blue icon fading off the new window (the match cut from shot A)
    if (t < 6.7) rr(...winRect(), { fill: '#5aa9ff', op: 255 * (1 - ease(seg(t, 6.0, 6.7))), key: 'morphfade' });
    flushLetters();
    // Clawd: hops in with the cards, throws them one by one, then watches
    const u = 19, gx = 1735, gy = 1046;
    const enter = seg(t, 6.6, 7.5), x = lerp(2100, gx, easeOut(enter)), hop = enter > 0 && enter < 1 ? -Math.abs(Math.sin(enter * Math.PI * 3)) * 1.3 : 0;
    let aR = .3, sq = 0, rot = 0;
    for (const d of DROPS) { const w = seg(t, d - .3, d), f = seg(t, d, d + .25); if (t > d - .3 && t < d + .35) { aR = lerp(.3, 1.7, ease(w)) - 2.2 * easeOut(f); rot = .08 * ease(w) - .1 * easeOut(f) * (1 - f); sq = .12 * ease(w) - .12 * f; } }
    const left = DROPS.filter(d => t < d).length;
    const mood = emotions(t, [[0, 'happy'], [7.6, 'determined'], [11.5, 'proud'], [PLAY_AT + .2, 'excited'], [MINI_AT - .2, 'happy']]);
    clawd(x, gy, u, { ...mood, flip: true, view: enter < 1 ? 'q' : 'front', walk: enter * 6, dy: (mood.dy || 0) + hop, aR: t > 7.4 && t < 11.4 ? aR : mood.aR, aL: t > 7.4 && t < 11.4 ? .9 : mood.aL, sq: (mood.sq || 0) + sq, rot: (mood.rot || 0) + rot, lookX: -.7,
      draw: left > 0 && t > 6.6 ? (uu, sw) => { for (let i = 0; i < left; i++) { const c = SONGS[DROPS.length - left + i]; push(); translate(-6.6 * uu + i * .5 * uu, -6.8 * uu - i * .35 * uu); rotate(-.2 + i * .08); paint(rrPts(-1.8 * uu, -2.3 * uu, 3.6 * uu, 4.6 * uu, .4 * uu), { wash: '#fffdf7', ink: PAL.ink, sw: sw * .6 }); paint(rrPts(-1.3 * uu, .3 * uu, 2.6 * uu, 1.3 * uu, .3 * uu), { wash: c.col, ink: null }); pop(); } } : null });
    // the flying cards
    DROPS.forEach((d, i) => {
      const k = seg(t, d, d + FLY); if (k <= 0 || k >= 1) return;
      const [tx, ty] = U(700, 290 + i * 44), from = [gx - 120, gy - 170];
      const [px, py] = arcPt(from, [tx, ty], 330, easeOut(k));
      fileCard(px, py, lerp(1, .55, easeIn(k)), SONGS[i].fmt, SONGS[i].col, -k * 5.2 + .4, 1 - seg(k, .85, 1));
    });
    // play all: the cursor clicks it, then the mini player in the play bar (which opens the player page)
    const pa = U(...playAll), mini = U(10 + 18 + 21, TRANSPORT_TOP + 51);
    cursor(t, [[12.2, 1300, 760], [PLAY_AT - .1, pa[0] + 6, pa[1] + 4], [13.3, pa[0] + 6, pa[1] + 4], [MINI_AT - .1, mini[0] + 4, mini[1] + 2], [14.2, mini[0] + 4, mini[1] + 2]], [PLAY_AT, MINI_AT]);
    tagline('几乎所有音视频格式，打开就能播', t, 11.35, 12.95, '#ffd166');
    if (t > 14.0) wipe((t - 14.0) / 1.0, ['#ff9a62', '#ffcf7a', '#e8607a']);
  }

  // =============================================================== C: the record (14.5 – 22.5)
  const ARM_T = 15.4, VINYL_CLICK = 21.75;
  const peekAt = (t, lines, t0, step) => {
    const i = Math.floor((t - t0) / step); if (i < 0) return [];
    const res = [{ cur: lines[i % lines.length], next: lines[(i + 1) % lines.length], k: seg(t - t0 - i * step, 0, .42) }];
    if (i > 0) { const o = seg(t - t0 - i * step, 0, .36); if (o < 1) res.push({ cur: lines[(i - 1) % lines.length], next: lines[i % lines.length], k: 1, out: o }); }
    return res;
  };
  function shotC(t) {
    wall('#fbe3d0', '#ffd0b5', '#f8c3d4', 'C');
    useTheme(LIGHT, '#66ccff');
    const enter = seg(t, 14.5, 15.4), arm = ease(seg(t, ARM_T, ARM_T + .9)), ang = (t - 14.5) * TAU / 20;
    const pos = (t - PLAY_AT);
    // camera: a slow push toward the record, then into its label for the cut
    const push2 = ease(seg(t, VINYL_CLICK, 22.5));
    const [vx, vy] = U(...SP(30, 52));
    camBegin(lerp(960, vx, push2 * .9 + ease(seg(t, 14.5, 21.5)) * .05), lerp(560, vy, push2 * .9), 1 + .03 * ease(seg(t, 14.5, 21.5)) + 1.6 * easeIn(push2));
    let v;
    win(() => {
      winFrame(); titlebar({ file: SONGS[0].file });
      v = playerPage({ title: SONGS[0].title, artist: SONGS[0].artist, album: SONGS[0].album, fmt: 'APE', chip2: '实时转换播放', enter, arm, ang, cover: 'dusk', peek: peekAt(t, LYRICS_A, 15.9, 2.2) });
      transport({ pos, dur: 236, playing: true, title: SONGS[0].title, artist: SONGS[0].artist, cover: 'dusk' });
    });
    flushLetters();
    // Clawd on the play bar with headphones, swaying to the beat
    const mood = emotions(t, [[0, 'happy'], [16.1, 'love', { emote: 'music' }]]);
    const sway = move('sway', t, 2);
    clawd(U(1135, 0)[0], LEDGE_Y, 17, { ...mood, ...sway, dy: (mood.dy || 0) + (sway.dy || 0), hat: 'headphones', eyes: t > 16.1 ? 'closed' : mood.eyes, lookX: -.5 });
    // floating notes on the beat
    for (let i = 0; i < 4; i++) {
      const ph = frac((t - 16.2) / 2.4 + i / 4); if (t < 16.2) break;
      const x = U(1135, 0)[0] - 40 + Math.sin(ph * 6 + i) * 30 + i * 22, y = LEDGE_Y - 170 - ph * 160;
      emote('music', x, y, 9, clamp(ph * 5) * (1 - seg(ph, .75, 1)), t);
    }
    cursor(t, [[20.9, 1500, 700], [VINYL_CLICK - .1, vx + 60, vy - 40], [22.2, vx + 60, vy - 40]], [VINYL_CLICK]);
    camEnd();
    tagline('黑胶唱片，随乐而转', t, 18.7, 20.6, '#9fdcff');
    if (t < 14.75) wipe(.5 + (t - 14.0) / 1.0, ['#ff9a62', '#ffcf7a', '#e8607a']);
    if (t > 22.1) iris(W / 2, H / 2, lerp(1400, 0, easeIn(seg(t, 22.1, 22.5))), '#141416');
  }

  // =============================================================== D: lyrics, word by word (22.5 – 30.5)
  const HL_CLICK = 26.35, PINK_CLICK = 27.45, NEXT_CLICK = 30.05;
  const lineTimes = (t0, step, n) => Array.from({ length: n }, (_, i) => t0 + i * step);
  const LT_A = lineTimes(22.2, 1.75, 8);
  function lyricState(t, LT) {
    let i = 0; while (i + 1 < LT.length && t >= LT[i + 1]) i++;
    const scroll = i - 1 + easeOut(seg(t, LT[i], LT[i] + .45));   // the list scrolls to centre the new line
    const p = seg(t, LT[i] + .05, (LT[i + 1] ?? LT[i] + 1.7) - .1);
    return { at: Math.max(0, i === 0 ? 0 : scroll), p, i };
  }
  function shotD(t) {
    wall('#dcecff', '#ffe1ef', '#d9f5e8', 'D');
    useTheme(LIGHT, '#66ccff');
    const hl = t > PINK_CLICK ? '#ff4d8d' : null, pop = seg(t, HL_CLICK + .05, HL_CLICK + .25) * (1 - seg(t, PINK_CLICK + .15, PINK_CLICK + .3));
    const st = lyricState(t, LT_A);
    const camZ = 1.06 + .04 * ease(seg(t, 25.6, 26.3)) - .04 * ease(seg(t, 28.0, 28.8));
    const focus = ease(seg(t, 25.6, 26.3)) * (1 - ease(seg(t, 28.0, 28.8)));
    camBegin(lerp(960, 1300, focus), lerp(590, 470, focus), camZ);
    let pos, pp;
    win(() => {
      winFrame(); titlebar({ file: SONGS[0].file });
      const lk = seg(t, 22.5, 22.85);
      uiPush(0, (1 - easeOut(lk)) * 12, 1);
      pos = lyricsHead({ title: SONGS[0].title, artist: SONGS[0].artist, hl: hl ?? ACC.accent, hot: t > HL_CLICK - .3 && t < PINK_CLICK + .3 ? 'hl' : null });
      lyricLines(LYRICS_A.map(s => ({ text: s, k: lk })), st.at, st.p, { hl: hl ?? ACC.strong });
      uiPop();
      pp = hlPopover(pos.hl[0], pos.hl[1], pop, hl ?? null, t > PINK_CLICK - .35 && t < PINK_CLICK ? '#ff4d8d' : null);
      transport({ pos: t - PLAY_AT, dur: 236, playing: true, title: SONGS[0].title, artist: SONGS[0].artist, cover: 'dusk', press: 0 });
    });
    flushLetters();
    // Clawd sings along on the play bar (the mouth opens on the beat)
    const mood = emotions(t, [[0, 'happy', { emote: 'music' }], [26.2, 'thinking', { emote: null }], [PINK_CLICK + .1, 'love']]);
    const sing = t < 26.2 || t > 28.6;
    clawd(U(1135, 0)[0], LEDGE_Y, 17, { ...mood, mouth: sing ? (pulse2(t, 5) > .4 ? 'open' : 'o') : mood.mouth, hat: 'headphones', lookX: -.6, lookY: -.3 });
    const hlW = pos && U(...pos.hl), pink = U(pos.hl[0] - 5, pos.hl[1] + 76), nextB = U(PLAY_BTN[0] + 87, PLAY_BTN[1]);
    cursor(t, [[25.6, 1500, 760], [HL_CLICK - .1, hlW[0] + 4, hlW[1] + 3], [26.9, hlW[0] + 4, hlW[1] + 3], [PINK_CLICK - .1, pink[0] + 4, pink[1] + 3], [28.1, 1400, 640], [29.4, 1400, 640], [NEXT_CLICK - .1, nextB[0] + 3, nextB[1] + 3], [30.4, nextB[0] + 3, nextB[1] + 3]], [HL_CLICK, PINK_CLICK, NEXT_CLICK]);
    camEnd();
    tagline('逐字歌词，高亮颜色随心换', t, 28.15, 29.85, '#ffb3cf');
    if (t < 22.9) iris(W / 2, H / 2, lerp(0, 1400, easeOut(seg(t, 22.5, 22.9))), '#141416');
    if (t > 30.15) wipe((t - 30.15) / .7, ['#1f8f8f', '#7fd6c8', '#22446e'], -1);
  }

  // =============================================================== E: AI lyrics, offline (30.5 – 39)
  const AI_CLICK = 33.1, REC0 = 33.35, REC1 = 34.2, REC2 = 36.0, REC3 = 36.4;
  const LT_B = lineTimes(36.4, 1.6, 6);
  function shotE(t) {
    wall('#d6f2ea', '#cde6ff', '#fff1c9', 'E');
    useTheme(LIGHT, '#66ccff');
    const s = SONGS[1];
    const zoom = ease(seg(t, 32.4, 33.2)) * (1 - ease(seg(t, 36.3, 37.0)));
    camBegin(lerp(960, 960, zoom), lerp(575, 560, zoom), 1.04 + .16 * zoom);
    let ai;
    win(() => {
      winFrame(); titlebar({ file: s.file, asr: t > REC0 && t < REC3 });
      lyricsHead({ title: s.title, artist: s.artist, offset: t > REC3 });
      if (t < REC0) ai = noLyrics({ press: Math.sin(seg(t, AI_CLICK - .08, AI_CLICK + .14) * Math.PI), hot: t > AI_CLICK - .4, k: 1 - seg(t, AI_CLICK + .05, REC0) }).ai;
      else if (t < REC3) {
        const k = seg(t, REC0, REC0 + .3) * (1 - seg(t, REC3 - .2, REC3));
        asrCard(t < REC1 ? { stage: '正在加载模型…', k } : t < REC2 ? { stage: '正在识别…', pct: 100 * ease(seg(t, REC1, REC2)), k } : { stage: '正在整理结果…', k });
      } else {
        const st = lyricState(t, LT_B);
        lyricLines(LYRICS_B.map((x, i) => ({ text: x, k: easeOut(seg(t, REC3 + i * .08, REC3 + .35 + i * .08)) })), st.at, st.p, { cy: 420 });
        aiBanner(seg(t, REC3 + .2, REC3 + .6));
      }
      transport({ pos: t - 30.4, dur: s.secs, playing: true, title: s.title, artist: s.artist, cover: s.cover });
    });
    flushLetters();
    const mood = emotions(t, [[0, 'neutral'], [31.9, 'confused'], [REC0 + .3, 'thinking'], [REC3 + .5, 'excited'], [38.2, 'happy']]);
    clawd(U(1135, 0)[0], LEDGE_Y, 17, { ...mood, hat: 'headphones', lookX: -.7, lookY: t > REC0 && t < REC3 ? -.2 : -.5 });
    if (ai) { const a = U(...ai); cursor(t, [[32.3, 1500, 800], [AI_CLICK - .1, a[0] + 4, a[1] + 3], [33.6, a[0] + 4, a[1] + 3]], [AI_CLICK]); }
    camEnd();
    tagline('AI 离线识别歌词，不上传任何音频', t, 37.25, 38.85, '#b9f0d8');
    if (t < 30.85) wipe(.5 + (t - 30.15) / .7, ['#1f8f8f', '#7fd6c8', '#22446e'], -1);
  }

  // =============================================================== F: desktop lyrics (39 – 46)
  const DL_CLICK = 39.25, DOT_CLICK = 42.35, YEL_CLICK = 43.3;
  const DLR = [330, 150, 1260, 128];   // the lyric window on the desktop (world px)
  function wallpaper(t, a = 1) {
    boilSeed('wp');
    paint(rectPts(-200, -200, W + 400, H + 400), { wash: '#ffd9c2', ink: null });
    boilSeed('wp1'); paint([[-200, 520], [300, 430], [800, 520], [1300, 420], [2120, 500], [2120, 1300], [-200, 1300]], { wash: '#f7a8b8', ink: null, curv: .5 });
    boilSeed('wp2'); paint([[-200, 700], [500, 610], [1100, 700], [1600, 620], [2120, 690], [2120, 1300], [-200, 1300]], { wash: '#b48cd8', ink: null, curv: .5 });
    boilSeed('wp3'); paint([[-200, 880], [600, 800], [1300, 880], [2120, 820], [2120, 1300], [-200, 1300]], { wash: '#6f6fc6', ink: null, curv: .5 });
    boilSeed('wpsun'); paint(ellPts(1560, 330, 110, 110, 30), { wash: '#fff1c9', ink: null });
    // the menu bar and the dock
    boilSeed('menubar'); paint(rectPts(-20, -20, W + 40, 52), { wash: '#ffffff', washOp: 150, ink: null });
    boilSeed('dock'); paint(rrPts(560, 990, 800, 78, 22), { wash: '#ffffff', washOp: 120, ink: '#ffffff', sw: .5 });
    const cols = ['#66ccff', '#ff7849', '#13ce66', '#ffd166', '#7c5cff', '#ff4d8d', '#00b8a9', '#8e8e93'];
    cols.forEach((c, i) => { boilSeed('dk' + i); paint(rrPts(590 + i * 94, 1003, 58, 58, 14), { wash: c, ink: null }); });
    if (a > .02) appIcon(590 + 29, 1003 + 29, 58 / .805, { ink: null, alpha: a });
  }
  function shotF(t) {
    // the window shrinks to a corner of the desktop
    const k = ease(seg(t, 39.45, 40.5)), ws = lerp(WS, .62, k), wx = lerp(WX, 140, k), wy = lerp(WY, 330, k);
    const back = ease(seg(t, 45.3, 46.0));
    useTheme(LIGHT, '#66ccff');
    const wk = ease(seg(t, 39.3, 40.3));
    wallpaper(t, wk); wall('#d6f2ea', '#cde6ff', '#fff1c9', 'E', 1 - wk);
    camBegin(lerp(960, 640, back), lerp(540, 600, back), 1 + 1.2 * easeIn(back));
    const s = SONGS[1], on = t > DL_CLICK;
    win(() => {
      winFrame(); titlebar({ file: s.file });
      lyricsHead({ title: s.title, artist: s.artist });
      const st = lyricState(t, LT_B);
      lyricLines(LYRICS_B.map(x => ({ text: x })), st.at, st.p, { cy: 420 });
      aiBanner(1);
      transport({ pos: t - 30.4, dur: s.secs, playing: true, title: s.title, artist: s.artist, cover: s.cover, lyricsOn: on, dlHot: t > DL_CLICK - .3 && t < DL_CLICK + .3 });
    }, wx, wy, ws);
    flushLetters();
    // the desktop lyric window: one line at a time
    const lineAt = t < 43.75 ? 0 : 1, lk = lineAt ? seg(t, 43.75, 44.15) : seg(t, 40.6, 41.0);
    const col = t > YEL_CLICK ? '#ffd166' : '#66ccff';
    const hover = seg(t, 41.6, 41.9) * (1 - seg(t, 44.3, 44.6));
    const pal = seg(t, DOT_CLICK + .05, DOT_CLICK + .3) * (1 - seg(t, YEL_CLICK + .1, YEL_CLICK + .3));
    let dpos = {};
    if (t > 40.5) dpos = desktopLyrics(...DLR, { line: lineAt ? LYRICS_B[3] : LYRICS_B[2], color: col, k: lk, hover, palette: pal, sel: t > YEL_CLICK ? '#ffd166' : '#66ccff' });
    flushLetters();
    // Clawd hops from the window onto the lyric bar and rides it
    const jk = seg(t, 41.0, 41.7), from = [wx + 1135 * ws, wy + TRANSPORT_TOP * ws], to = [DLR[0] + 210, DLR[1] + DLR[3] + 2];
    const [cx, cy] = jk <= 0 ? from : jk >= 1 ? to : arcPt(from, to, 260, ease(jk));
    const j = jump(t, 41.0, 41.7, 0);
    const mood = emotions(t, [[0, 'happy'], [41.75, 'playful'], [YEL_CLICK + .15, 'starstruck'], [44.6, 'happy']]);
    clawd(cx, cy, lerp(17 * ws / WS, 15, ease(jk)), { ...mood, sq: (mood.sq || 0) + j.sq, hat: 'headphones', flip: jk > 0 && jk < 1, lookX: .6, lookY: -.2 });
    const dl = U(...DL_BTN, wx, wy, ws), dot = dpos.dot || [DLR[0] + DLR[2] - 49, DLR[1] + 18], yel = dpos.sw ? dpos.sw[1] : [W / 2, DLR[1] + DLR[3] / 2];
    cursor(t, [[38.95, 1400, 800], [DL_CLICK - .1, dl[0] + 3, dl[1] + 3], [39.7, dl[0] + 3, dl[1] + 3], [41.9, 1500, 420], [DOT_CLICK - .1, dot[0] + 3, dot[1] + 3], [42.8, dot[0] + 3, dot[1] + 3], [YEL_CLICK - .1, yel[0] + 3, yel[1] + 3], [43.9, yel[0] + 3, yel[1] + 3]], [DL_CLICK, DOT_CLICK, YEL_CLICK]);
    camEnd();
    tagline('桌面歌词，悬浮在所有窗口之上', t, 44.25, 45.5, '#ffe08a', PAL.ink, 980);
    if (t > 45.6) wipe((t - 45.6) / .8, ['#34528f', '#c97f78', '#f4b98d']);
  }

  // =============================================================== G: the weather theme (46 – 56)
  // Sky stages from src/core/weather/scene.ts; the accent follows the time of day.
  const PHASES = [[46.0, 'sunrise'], [47.7, 'noon'], [49.1, 'rain'], [52.4, 'sunset'], [54.0, 'night']];
  function skyAt(t) {
    let i = 0; while (i + 1 < PHASES.length && t >= PHASES[i + 1][0]) i++;
    const cur = SKY[PHASES[i][1]], prev = SKY[PHASES[Math.max(0, i - 1)][1]], k = ease(seg(t, PHASES[i][0], PHASES[i][0] + .8));
    return { sky: cur.sky.map((c, j) => mixCol(prev.sky[j], c, k)), accent: mixCol(prev.accent, cur.accent, k), id: PHASES[i][1], k };
  }
  const RAIN0 = 49.3, RAIN1 = 52.2;
  function rainDrops(t, ledges) {
    if (t < RAIN0 - .2 || t > RAIN1 + 1) return;
    const dens = seg(t, RAIN0 - .2, RAIN0 + .5) * (1 - seg(t, RAIN1 - .3, RAIN1 + .4));
    for (let i = 0; i < 90; i++) {
      if (hash(i * 3.1) > dens) continue;
      const per = .7 + .3 * hash(i + 7), ph = frac((t + hash(i) * 10) / per), x0 = hash(i * 1.7) * (W + 300) - 150, y0 = -80, len = 1250;
      const x = x0 - ph * 120, y = y0 + ph * len;
      // land on a ledge: the play bar top or the cover top
      let hit = null;
      for (const L of ledges) if (x > L[0] && x < L[1] && y > L[2]) { hit = L; break; }
      boilSeed('rd' + i);
      if (hit) {
        const age = (y - hit[2]) / len * per; if (age < .22) for (const s of [-1, 1]) inkLine([[x, hit[2]], [x + s * (8 + 40 * age), hit[2] - 30 * Math.sin(age / .22 * Math.PI) - 2]], .45, '#e6f3ff', 'inkfine', .5);
        continue;
      }
      inkLine([[x, y], [x + 7, y - 42]], .55, '#dceeff', 'inkfine', 0);
    }
  }
  function cloud(x, y, s, col, op, key) {
    boilSeed(key);
    for (const [dx, dy, r] of [[-1, .2, .7], [-.3, -.25, .9], [.5, -.1, .8], [1.1, .25, .6], [0, .35, .9]]) paint(ellPts(x + dx * s, y + dy * s, r * s, r * s * .72, 18), { wash: col, washOp: op, ink: null });
  }
  function shotG(t) {
    const sk = skyAt(t), night = seg(t, 53.6, 54.6), raining = seg(t, 48.9, 49.6) * (1 - seg(t, 52.0, 52.8));
    // the whole frame is sky: outside the window, hills; inside, the theme's gradient
    skyFill(-60, -60, W + 120, H + 120, sk.sky, 0, 'gsky');
    // sun and moon on an arc
    const sunA = lerp(Math.PI * .95, Math.PI * .1, seg(t, 46, 53.8)), sx = 960 + Math.cos(sunA) * 820, sy = 820 - Math.sin(sunA) * 640;
    if (night < 1) { glow(sx, sy, 220, '#ffd36b', (1 - night) * (1 - raining * .8)); boilSeed('sun'); paint(ellPts(sx, sy, 62, 62, 30), { wash: '#fff1c2', washOp: 255 * (1 - night) * (1 - raining * .7), ink: null }); }
    if (night > 0) {
      for (let i = 0; i < 40; i++) { boilSeed('gst' + i); const x = hash(i + 50) * W, y = hash(i + 150) * 600, tw = .55 + .45 * Math.sin(t * (2 + 2 * hash(i)) + i); paint(starPts(x, y, (3 + 4 * hash(i + 9)) * tw, .35, 4), { wash: PAL.cream, washOp: 230 * night, ink: null }); }
      const mx = lerp(300, 420, seg(t, 54, 56)), my = lerp(330, 250, seg(t, 54, 56));
      glow(mx, my, 160, '#cfd8ff', .6 * night); boilSeed('moon'); paint(ellPts(mx, my, 54, 54, 26), { wash: '#f3f0dc', washOp: 255 * night, ink: null });
    }
    // clouds drift; rain clouds darken
    for (let i = 0; i < 5; i++) { const x = (hash(i + 20) * 2200 + t * (14 + 10 * hash(i))) % 2400 - 240, y = 90 + hash(i + 40) * 260; cloud(x, y, 70 + 40 * hash(i), mixCol('#ffffff', '#5a6878', raining), 120 + 90 * raining, 'cl' + i); }
    // hills
    boilSeed('gh1'); paint([[-100, 900], [400, 820], [900, 900], [1500, 830], [2020, 880], [2020, 1200], [-100, 1200]], { wash: mixCol(mixCol('#7fb27a', '#3a4a6a', night), '#5d7590', raining * .5), ink: null, curv: .5 });
    useTheme(WEATHER, sk.accent);
    const s = SONGS[0];
    const wchip = { sunrise: ['sun', '18°'], noon: ['sun', '26°'], rain: ['rain', '21°'], sunset: ['cloudSun', '23°'], night: ['moon', '19°'] }[sk.id];
    camBegin(960, 570, 1.02);
    // classic layout (AudioNowPlaying): the cover is a ledge the rain lands on
    const cs = 250, gap = 64, infoW = 380, total = cs + gap + infoW, cx0 = 640 - total / 2, cyc = STAGE.y + STAGE.h / 2;
    win(() => {
      winFrame({ sky: sk.sky, skyKey: 'wsky' });
      rr(0, 0, APP_W, APP_H, 12, { fill: '#060c1a', op: 26, key: 'wdim' });
      titlebar({ file: s.file, weather: { icon: wchip[0], label: wchip[1] } });
      btn(12, STAGE.y, '返回', { kind: 'ghost', icon: 'chevronLeft', isz: 18, pad: 12, color: TH.text });
      shadowRR(cx0, cyc - cs / 2, cs, cs, 16, 1.2, '#000000');
      coverArt('dusk', cx0, cyc - cs / 2, cs, 16);
      const ix = cx0 + cs + gap;
      txt(s.title, ix, cyc - 82, { size: 34, weight: 700, shadow: 'rgba(0,0,0,.32)' });
      txt(s.artist, ix, cyc - 40, { size: 17, color: TH.dim, shadow: 'rgba(0,0,0,.32)' });
      txt(s.album, ix, cyc - 12, { size: 13.5, color: TH.faint, shadow: 'rgba(0,0,0,.32)' });
      const cw = chip2(ix, cyc + 18);
      const pk = peekAt(t, LYRICS_A, 46.6, 2.3);
      for (const L of pk) { const y = cyc + 70 + (1 - easeOut(L.k)) * 14 - (L.out ? easeIn(L.out) * 14 : 0), a = easeOut(L.k) * (1 - (L.out || 0)); txt(L.cur, ix, y, { size: 16, color: TH.dim, alpha: a, shadow: 'rgba(0,0,0,.32)' }); txt(L.next, ix, y + 30, { size: 13, color: TH.faint, alpha: a, shadow: 'rgba(0,0,0,.32)' }); }
      transport({ pos: t - 40, dur: s.secs, playing: true, title: s.title, artist: s.artist, cover: 'dusk' });
    });
    function chip2(x, y) { const w1 = chip(x, y, 'APE'); chip(x + w1 + 6, y, '实时转换播放', { accent: true }); }
    flushLetters();
    // rain lands on the play bar and the cover (WeatherSky.tsx LEDGES)
    const coverL = U(cx0, cyc - cs / 2), coverR = U(cx0 + cs, 0), barL = U(10, TRANSPORT_TOP), barR = U(APP_W - 10, 0);
    rainDrops(t, [[coverL[0], coverR[0], coverL[1]], [barL[0], barR[0], barL[1]]]);
    // Clawd with the umbrella during the rain, then looks up at the stars
    const umb = seg(t, 49.0, 49.4) * (1 - seg(t, 52.3, 52.7));
    const mood = emotions(t, [[0, 'happy'], [48.9, 'surprised'], [49.35, 'playful'], [52.6, 'relieved'], [54.3, 'love', { emote: 'stars' }]]);
    clawd(U(1135, 0)[0], LEDGE_Y, 17, { ...mood, aR: umb > 0 ? lerp(mood.aR ?? .2, 1.45, ease(umb)) : mood.aR, armR: umbrella(umb), lookX: -.3, lookY: night > 0 ? -.9 : -.4, hat: umb > 0 ? null : 'headphones' });
    camEnd();
    tagline('天气主题，天空随时间与天气变化', t, 54.1, 55.7, '#c9b8ff');
    if (t < 46.4) wipe(.5 + (t - 45.6) / .8, ['#34528f', '#c97f78', '#f4b98d']);
  }

  // =============================================================== H: colours, then home (56 – 64)
  const SHRINK0 = 58.4, SHRINK1 = 59.6;
  function shotH(t) {
    const shrink = ease(seg(t, SHRINK0, SHRINK1));
    nightSky(t, 'hnight');
    const ai = Math.min(ACCENT_PRESETS.length - 1, Math.floor(seg(t, 56.0, 58.3) * ACCENT_PRESETS.length));
    const acc = ACCENT_PRESETS[ai], ak = seg(t, 56.0 + ai * 2.3 / 8, 56.15 + ai * 2.3 / 8);
    useTheme(LIGHT, acc);
    if (shrink < 1) {
      if (shrink === 0) {
        const s = SONGS[0];
        win(() => {
          winFrame(); titlebar({ file: s.file });
          playerPage({ title: s.title, artist: s.artist, album: s.album, fmt: 'APE', chip2: '实时转换播放', arm: 1, ang: (t - 14.5) * TAU / 20, cover: 'dusk', peek: peekAt(t, LYRICS_A, 55.6, 2.3) });
          transport({ pos: t - 40, dur: s.secs, playing: true, title: s.title, artist: s.artist, cover: 'dusk', press: Math.sin(ak * Math.PI) * .6 });
        });
        // a ring of the eight presets above the window, lighting up in turn
        flushLetters();
        ACCENT_PRESETS.forEach((c, i) => { const x = W / 2 + (i - 3.5) * 74, on = i <= ai, k = seg(t, 56.0 + i * 2.3 / 8, 56.2 + i * 2.3 / 8); circ(x, 100, 22 * (on ? .9 + .25 * backOut(k) * (1 - seg(t, 56.3 + i * 2.3 / 8, 56.6 + i * 2.3 / 8)) : .7), { fill: c, ink: PAL.ink, sw: .6, key: 'acc' + i }); if (i === ai) glow(x, 100, 70, c, .7); });
        const pb = U(...PLAY_BTN); if (ak > 0 && ak < 1) { boilSeed('accring'); paint(ellPts(pb[0], pb[1], 30 + 90 * easeOut(ak), 30 + 90 * easeOut(ak), 28), { wash: null, ink: acc, sw: 2 * (1 - ak) + .3 }); }
      } else {
        const [x, y, w, h, r] = morphRect(1 - shrink), cover = seg(shrink, 0, .35);
        if (cover < 1) {
          const sc = w / APP_W, s = SONGS[0];
          win(() => {
            winFrame(); titlebar({ file: s.file });
            playerPage({ title: s.title, artist: s.artist, album: s.album, fmt: 'APE', chip2: '实时转换播放', arm: 1, ang: (t - 14.5) * TAU / 20, cover: 'dusk' });
            transport({ pos: t - 40, dur: s.secs, playing: true, title: s.title, artist: s.artist, cover: 'dusk' });
          }, x, y + h / 2 - APP_H * sc / 2, sc);
          flushLetters();
        }
        rr(x, y, w, h, r, { fill: mixCol('#f4f4f7', '#5aa9ff', seg(shrink, .3, .7)), op: 255 * Math.max(cover, .001), ink: cover >= 1 ? PAL.ink : null, sw: 1, key: 'morph' });
        if (shrink > .7) appIcon(ICX, ICY, ICS, { alpha: seg(shrink, .7, 1), ink: null, bars: .6 });
      }
    }
    if (shrink >= 1) appIcon(ICX, ICY, ICS, { bars: .6 + .4 * pulse(t) });
    if (t > SHRINK1) glow(ICX, ICY, 260, '#66ccff', .5 * (1 - seg(t, 62.6, 63.3)));
    const tk = seg(t, 59.7, 60.3), sk = seg(t, 60.2, 60.8), gk = seg(t, 60.7, 61.3);
    if (tk > 0) {
      const s = 'LightPlayer';
      for (let i = 0; i < s.length; i++) {
        const k = backOut(seg(t, 59.7 + i * .04, 60.05 + i * .04)), x = W / 2 - textW(s, 120, 600, FONT_LOGO) / 2 + textW(s.slice(0, i), 120, 600, FONT_LOGO) + textW(s[i], 120, 600, FONT_LOGO) / 2;
        if (k > 0) glyph(c => { c.translate(x, 700 + (1 - k) * 30); c.scale(k, k); c.font = `600 120px ${FONT_LOGO}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#0d1230'; c.fillText(s[i], 5, 6); c.fillStyle = i < 5 ? '#ffffff' : '#9fdcff'; c.fillText(s[i], 0, 0); });
      }
    }
    if (sk > 0) txt('轻量的 macOS 与 Windows 多媒体播放器', W / 2, 800, { size: 40, font: FONT_TITLE, color: PAL.cream, align: 'center', alpha: easeOut(sk) });
    if (gk > 0) txt('在 GitHub Releases 下载最新版本', W / 2, 868, { size: 28, color: '#bfe8ff', align: 'center', alpha: easeOut(gk) });
    // Clawd comes back up to wave goodbye; the light leaves the icon
    const up = easeOut(seg(t, 61.0, 61.6));
    if (up > 0) {
      flushLetters();
      const wave = move('wave', t, 1), mood = emotions(t, [[0, 'happy'], [62.3, 'love']]);
      clawd(1580, 1120 - 250 * up, 26, { ...mood, ...wave, eyes: 'happy', mouth: 'grin', lookX: -.6, lookY: -.5, noShadow: true });
    }
    spark(k => arcPt([ICX + 30, ICY], [1800, -120], 200, k), t, 61.9, 63.0, { ease: k => easeIn(k) });
    if (t > 62.9) iris(ICX, ICY, lerp(1500, 0, easeIn(seg(t, 62.9, 63.7))), '#0d1230');
  }

  const S = fn => (t, lt, dur) => { uiReset(); fn(t, lt, dur); };
  shots([[0, S(shotA)], [6.0, S(shotB)], [14.5, S(shotC)], [22.5, S(shotD)], [30.5, S(shotE)], [39.0, S(shotF)], [46.0, S(shotG)], [56.0, S(shotH)]]);
})();
