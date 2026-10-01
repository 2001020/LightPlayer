// Film player: sizing, the clock (follows the soundtrack when it plays),
// on-screen controls, keyboard shortcuts, WebM recording and a frame-exact
// capture hook (?capture=1) for offline rendering.
(function () {
  const PV = window.PV;
  const copy = PV.copy;
  const P = copy.player;
  const q = new URLSearchParams(location.search);
  const capture = q.has("capture");

  const stage = document.getElementById("stage");
  const canvas = document.getElementById("pv");
  const ui = PV.createUI(copy);
  const world = PV.createWorld(canvas, ui, copy, {
    preserve: capture,
    uiScale: +(q.get("ui") || 2),
    samples: q.has("nomsaa") ? 0 : 4,
  });
  const scenes = PV.createScenes(world, ui, copy);
  const caps = PV.createCaptions(world, copy);
  const music = PV.createMusic ? PV.createMusic(PV.TIMELINE) : null;
  const DURATION = scenes.DURATION;

  // ------------------------------------------------------------ size
  function fit() {
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;
    let cw = vw;
    let ch = (vw * 9) / 16;
    if (ch > vh) {
      ch = vh;
      cw = (vh * 16) / 9;
    }
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    let h;
    if (q.get("res")) h = +q.get("res");
    else h = Math.round(ch * Math.min(window.devicePixelRatio || 1, 2));
    h = Math.max(360, Math.min(2160, h));
    const w = Math.round((h * 16) / 9);
    world.setSize(w, h);
    caps.resize(w, h);
  }
  window.addEventListener("resize", fit);
  fit();

  // ------------------------------------------------------------ frame
  function frame(t) {
    scenes.render(t);
    if (caps.draw(t, scenes.captions)) world.capTex.needsUpdate = true;
    world.render(t);
  }

  // ------------------------------------------------------------ clock
  let t = +(q.get("t") || 0);
  let playing = false;
  let last = 0;
  let audioOn = !q.has("mute");

  function now() {
    if (playing && music && music.running()) return music.time();
    return t;
  }

  function play() {
    if (t >= DURATION - 0.05) t = 0;
    playing = true;
    last = performance.now();
    if (music && audioOn) music.start(t);
    document.body.classList.add("playing");
    document.body.classList.remove("ended");
    showBar();
  }
  function pause() {
    t = now();
    playing = false;
    if (music) music.stop();
    document.body.classList.remove("playing");
    showBar();
  }
  function seek(nt) {
    t = Math.max(0, Math.min(DURATION - 0.01, nt));
    if (playing && music && audioOn) music.start(t);
    last = performance.now();
  }

  function loop(ms) {
    if (playing) {
      if (music && music.running()) t = music.time();
      else t += Math.min(0.1, (ms - last) / 1000);
      last = ms;
      if (t >= DURATION) {
        t = DURATION;
        playing = false;
        if (music) music.stop();
        document.body.classList.remove("playing");
        document.body.classList.add("ended");
        if (recorder) recorder.stop();
        showBar();
      }
    }
    frame(Math.min(t, DURATION - 1e-3));
    updateBar();
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ controls
  const $ = (id) => document.getElementById(id);
  const bar = $("bar");
  const scrub = $("scrub");
  const timeEl = $("time");
  const playBtn = $("play");
  const startBtn = $("start");
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  scrub.max = String(DURATION);

  startBtn.querySelector("span").textContent = P.start;
  playBtn.title = P.play;
  $("mute").title = P.mute;
  $("full").title = P.fullscreen;
  $("rec").title = P.record;
  $("hint").textContent = P.hint;

  let hideTimer = 0;
  function showBar() {
    bar.classList.add("show");
    clearTimeout(hideTimer);
    if (playing) hideTimer = setTimeout(() => bar.classList.remove("show"), 2200);
  }
  function updateBar() {
    const cur = Math.min(now(), DURATION);
    if (!scrubbing) scrub.value = String(cur);
    timeEl.textContent = `${fmt(cur)} / ${fmt(DURATION)}`;
    playBtn.classList.toggle("on", playing);
    scrub.style.setProperty("--p", `${(cur / DURATION) * 100}%`);
  }

  let scrubbing = false;
  scrub.addEventListener("input", () => {
    scrubbing = true;
    seek(+scrub.value);
  });
  scrub.addEventListener("change", () => (scrubbing = false));
  playBtn.addEventListener("click", () => (playing ? pause() : play()));
  startBtn.addEventListener("click", () => {
    document.body.classList.add("started");
    play();
  });
  $("mute").addEventListener("click", () => {
    audioOn = !audioOn;
    $("mute").classList.toggle("off", !audioOn);
    if (!audioOn && music) music.stop();
    else if (audioOn && playing && music) music.start(now());
  });
  $("full").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.();
  });
  stage.addEventListener("mousemove", showBar);
  stage.addEventListener("click", (e) => {
    if (e.target === canvas && document.body.classList.contains("started")) playing ? pause() : play();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      if (!document.body.classList.contains("started")) document.body.classList.add("started");
      playing ? pause() : play();
    } else if (e.key === "ArrowRight") seek(now() + 5);
    else if (e.key === "ArrowLeft") seek(now() - 5);
    else if (e.key === "f" || e.key === "F") $("full").click();
    else if (e.key === "m" || e.key === "M") $("mute").click();
    else if (e.key === "Home") seek(0);
    else return;
    showBar();
  });

  // ------------------------------------------------------------ recording (WebM)
  let recorder = null;
  $("rec").addEventListener("click", () => {
    if (recorder) {
      recorder.stop();
      return;
    }
    if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
      alert(P.noRecord);
      return;
    }
    const stream = canvas.captureStream(60);
    if (music && audioOn) {
      const a = music.stream();
      if (a) a.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = types.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 24e6 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `LightPlayer-PV-${copy.lang}.webm`;
      a.click();
      recorder = null;
      document.body.classList.remove("recording");
      $("rec").title = P.record;
    };
    document.body.classList.add("recording", "started");
    $("rec").title = P.recording;
    seek(0);
    recorder.start(1000);
    if (!playing) play();
  });

  // ------------------------------------------------------------ offline capture hook
  if (capture) {
    document.body.classList.add("started", "capture");
    window.PV_RENDER = (time) => {
      frame(time);
      return true;
    };
    window.PV_DURATION = DURATION;
    // the soundtrack as 16-bit PCM WAV, base64 encoded
    window.PV_AUDIO = async () => {
      const buf = await music.renderOffline(48000);
      const n = buf.length;
      const out = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
      str(0, "RIFF");
      out.setUint32(4, 36 + n * 4, true);
      str(8, "WAVE");
      str(12, "fmt ");
      out.setUint32(16, 16, true);
      out.setUint16(20, 1, true);
      out.setUint16(22, 2, true);
      out.setUint32(24, 48000, true);
      out.setUint32(28, 48000 * 4, true);
      out.setUint16(32, 4, true);
      out.setUint16(34, 16, true);
      str(36, "data");
      out.setUint32(40, n * 4, true);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      for (let i = 0; i < n; i++) {
        out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      const bytes = new Uint8Array(out.buffer);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    };
    frame(t);
  } else {
    requestAnimationFrame((ms) => {
      last = ms;
      loop(ms);
    });
    if (q.has("autoplay")) startBtn.click();
  }
})();
