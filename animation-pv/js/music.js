// Procedural soundtrack (Web Audio). 100 BPM in D major, one chord a bar
// (I, vi, IV, V); sections follow the film's scene grid so cuts land on
// downbeats. The audio clock drives the picture while it plays.
(function () {
  const PV = (window.PV = window.PV || {});

  const BPM = 100;
  const STEP = 60 / BPM / 4; // a sixteenth note
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // D, Bm, G, A (voicings with added colour tones)
  const CHORDS = [
    { root: 38, pad: [50, 57, 61, 64, 66], arp: [62, 66, 69, 73, 74, 76, 78, 81] },
    { root: 35, pad: [47, 54, 57, 62, 64], arp: [59, 62, 66, 69, 71, 74, 76, 78] },
    { root: 31, pad: [43, 50, 54, 57, 59], arp: [55, 59, 62, 66, 67, 71, 74, 78] },
    { root: 33, pad: [45, 52, 57, 59, 62], arp: [57, 61, 64, 69, 71, 73, 76, 81] },
  ];
  const ARP = [0, 2, 4, 6, 5, 3, 1, 4, 7, 5, 3, 1, 2, 4, 6, 3];
  const LEAD = [
    [76, 0, 3],
    [74, 4, 2],
    [73, 6, 2],
    [69, 8, 4],
    [71, 12, 4],
  ];

  /** Section of the score at bar b: which instruments play. */
  function section(b) {
    if (b < 4) return { pad: 0.8, bell: b >= 1 ? 0.65 : 0, intro: true };
    if (b < 8) return { pad: 0.6, kick: "half", bass: 0.5, arp: 0.45, hat: b >= 6 ? 0.3 : 0 };
    if (b < 12) return { pad: 0.5, kick: "four", bass: 0.7, arp: 0.5, hat: 0.55, clap: 0.5 };
    if (b < 16) return { pad: 0.55, kick: "four", bass: 0.7, arp: 0.55, hat: 0.5, clap: 0.45 };
    if (b < 21) return { pad: 0.55, kick: b >= 17 && b < 19 ? "half" : "four", bass: 0.65, arp: 0.5, hat: 0.5, clap: 0.4, bubbles: b >= 16 && b < 19 ? 0.5 : 0 };
    if (b < 24) return { pad: 0.65, arp: 0.5, bell: 0.45, hat: 0.2 };
    if (b < 29) return { pad: 0.55, kick: "four", bass: 0.65, arp: 0.45, hat: 0.5, clap: 0.4 };
    if (b < 33) return { pad: 0.55, kick: "four", bass: 0.7, arp: 0.55, hat: 0.55, clap: 0.45 };
    if (b < 36) return { pad: 0.7, kick: "half", bass: 0.6, bell: 0.4 };
    if (b < 40) return { pad: 0.55, kick: "four", bass: 0.75, arp: 0.55, hat: 0.6, clap: 0.5, lead: 0.5 };
    return { pad: 0.6, bell: 0.55, outro: true };
  }

  function createMusic(timeline) {
    let ctx = null;
    let master = null;
    let comp = null;
    let reverb = null;
    let delay = null;
    let streamDest = null;
    let noise = null;
    let bus = null;
    let timer = 0;
    let startCtx = 0;
    let startT = 0;
    let nextStep = 0;
    let running = false;
    const END = timeline.DURATION;
    const sceneStarts = timeline.SCENES.map((s) => Math.round(s.t0 / (STEP * 16)));

    function init(given) {
      if (ctx && !given) return;
      ctx = given || new (window.AudioContext || window.webkitAudioContext)();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = 0.72;
      master.connect(comp);
      comp.connect(ctx.destination);
      if (ctx.createMediaStreamDestination) {
        streamDest = ctx.createMediaStreamDestination();
        comp.connect(streamDest);
      }
      // reverb: generated impulse response
      reverb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 3.2);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      reverb.buffer = ir;
      const rvGain = ctx.createGain();
      rvGain.gain.value = 0.32;
      reverb.connect(rvGain);
      rvGain.connect(master);
      // dotted-eighth echo
      delay = ctx.createDelay(2);
      delay.delayTime.value = STEP * 3;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const dlp = ctx.createBiquadFilter();
      dlp.type = "lowpass";
      dlp.frequency.value = 2600;
      delay.connect(dlp);
      dlp.connect(fb);
      fb.connect(delay);
      const dGain = ctx.createGain();
      dGain.gain.value = 0.35;
      dlp.connect(dGain);
      dGain.connect(master);
      dGain.connect(reverb);
      // noise
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }

    // ------------------------------------------------------------ voices
    function env(g, t0, a, peak, d, sustain, rel, end) {
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + a);
      g.gain.setTargetAtTime(peak * sustain, t0 + a, d);
      g.gain.setTargetAtTime(0, end, rel);
    }
    function out(node, dry = 1, rv = 0, dl = 0) {
      if (dry) {
        const g = ctx.createGain();
        g.gain.value = dry;
        node.connect(g);
        g.connect(bus);
      }
      if (rv) {
        const g = ctx.createGain();
        g.gain.value = rv;
        node.connect(g);
        g.connect(reverb);
      }
      if (dl) {
        const g = ctx.createGain();
        g.gain.value = dl;
        node.connect(g);
        g.connect(delay);
      }
    }
    function pad(chord, t0, dur, level) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(700, t0);
      lp.frequency.linearRampToValueAtTime(1800, t0 + dur * 0.6);
      const g = ctx.createGain();
      env(g, t0, 0.5, level * 0.06, 1.2, 0.85, 0.5, t0 + dur);
      lp.connect(g);
      out(g, 1, 0.9);
      chord.pad.forEach((n) => {
        [-7, 7].forEach((cents) => {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = midi(n);
          o.detune.value = cents;
          o.connect(lp);
          o.start(t0);
          o.stop(t0 + dur + 2.5);
        });
      });
    }
    function pluck(n, t0, level, pan = 0) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = midi(n);
      const o2 = ctx.createOscillator();
      o2.type = "square";
      o2.frequency.value = midi(n);
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      o2.connect(g2);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(4200, t0);
      lp.frequency.exponentialRampToValueAtTime(900, t0 + 0.25);
      o.connect(lp);
      g2.connect(lp);
      const g = ctx.createGain();
      env(g, t0, 0.004, level * 0.11, 0.09, 0.0, 0.05, t0 + 0.3);
      lp.connect(g);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) {
        p.pan.value = pan;
        g.connect(p);
      }
      out(p || g, 1, 0.25, 0.6);
      o.start(t0);
      o2.start(t0);
      o.stop(t0 + 0.5);
      o2.stop(t0 + 0.5);
    }
    function bell(n, t0, level) {
      const car = ctx.createOscillator();
      car.type = "sine";
      car.frequency.value = midi(n);
      const mod = ctx.createOscillator();
      mod.frequency.value = midi(n) * 3.01;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(midi(n) * 1.2, t0);
      mg.gain.exponentialRampToValueAtTime(1, t0 + 1.4);
      mod.connect(mg);
      mg.connect(car.frequency);
      const g = ctx.createGain();
      env(g, t0, 0.003, level * 0.07, 0.6, 0.0, 0.4, t0 + 1.6);
      car.connect(g);
      out(g, 0.8, 0.8, 0.4);
      car.start(t0);
      mod.start(t0);
      car.stop(t0 + 3);
      mod.stop(t0 + 3);
    }
    function kick(t0, level) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(130, t0);
      o.frequency.exponentialRampToValueAtTime(44, t0 + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * 0.9, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
      o.connect(g);
      out(g, 1);
      o.start(t0);
      o.stop(t0 + 0.5);
    }
    function noiseHit(t0, level, type, freq, q, decay, rv = 0.1) {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
      s.connect(f);
      f.connect(g);
      out(g, 1, rv);
      s.start(t0, Math.random() * 1.5);
      s.stop(t0 + decay + 0.05);
    }
    function clap(t0, level) {
      for (let i = 0; i < 3; i++) noiseHit(t0 + i * 0.011, level * 0.32, "bandpass", 1500, 0.8, 0.09 + i * 0.05, 0.35);
    }
    function hat(t0, level) {
      noiseHit(t0, level * 0.12, "highpass", 7500, 0.7, 0.05);
    }
    function bass(n, t0, dur, level) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midi(n + 12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(900, t0);
      lp.frequency.exponentialRampToValueAtTime(260, t0 + dur);
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = midi(n);
      const g = ctx.createGain();
      env(g, t0, 0.008, level * 0.16, 0.25, 0.6, 0.06, t0 + dur);
      o.connect(lp);
      lp.connect(g);
      const sg = ctx.createGain();
      env(sg, t0, 0.008, level * 0.32, 0.4, 0.7, 0.06, t0 + dur);
      sub.connect(sg);
      out(g, 1);
      out(sg, 1);
      [o, sub].forEach((x) => {
        x.start(t0);
        x.stop(t0 + dur + 0.4);
      });
    }
    function lead(n, t0, dur, level) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midi(n);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vg = ctx.createGain();
      vg.gain.value = 4;
      vib.connect(vg);
      vg.connect(o.detune);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      const g = ctx.createGain();
      env(g, t0, 0.03, level * 0.05, 0.3, 0.75, 0.15, t0 + dur);
      o.connect(lp);
      lp.connect(g);
      out(g, 1, 0.5, 0.4);
      o.start(t0);
      vib.start(t0);
      o.stop(t0 + dur + 1);
      vib.stop(t0 + dur + 1);
    }
    function riser(t0, dur, level) {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t0);
      f.frequency.exponentialRampToValueAtTime(7000, t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(level * 0.18, t0 + dur);
      g.gain.setTargetAtTime(0, t0 + dur, 0.05);
      s.connect(f);
      f.connect(g);
      out(g, 1, 0.4);
      s.start(t0);
      s.stop(t0 + dur + 0.3);
    }
    function impact(t0, level) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(90, t0);
      o.frequency.exponentialRampToValueAtTime(28, t0 + 1.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * 0.55, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
      o.connect(g);
      out(g, 1, 0.5);
      o.start(t0);
      o.stop(t0 + 1.7);
      noiseHit(t0, level * 0.25, "lowpass", 900, 0.5, 0.9, 0.8);
    }

    // ------------------------------------------------------------ score
    function playStep(s, when, first) {
      const bar = Math.floor(s / 16);
      const pos = s % 16;
      if (bar >= 44) return;
      const sec = section(bar);
      const ch = CHORDS[bar % 4];
      const barDur = STEP * 16;
      if (pos === 0 || first) {
        const rest = (16 - pos) * STEP;
        if (sec.pad) pad(sec.outro && bar === 43 ? CHORDS[0] : sec.outro ? CHORDS[bar % 2 === 0 ? 0 : 2] : ch, when, sec.outro ? rest + 2 : rest + 0.15, sec.pad);
        if (pos === 0 && sceneStarts.includes(bar) && bar > 0) impact(when, bar === 40 ? 0.9 : 0.55);
      }
      if (sec.bass && pos % 8 === 0) bass(ch.root, when, STEP * (sec.kick === "four" ? 3.6 : 7.5), sec.bass);
      if (sec.bass && sec.kick === "four" && pos % 8 === 6) bass(ch.root + 12, when, STEP * 1.6, sec.bass * 0.7);
      if (sec.kick === "four" && pos % 4 === 0) kick(when, 0.95);
      if (sec.kick === "half" && (pos === 0 || pos === 10)) kick(when, 0.85);
      if (sec.clap && (pos === 4 || pos === 12)) clap(when, sec.clap);
      if (sec.hat && pos % 4 === 2) hat(when, sec.hat);
      if (sec.hat && sec.hat > 0.45 && pos % 2 === 1) hat(when, sec.hat * 0.45);
      if (sec.arp && (pos % 2 === 0 || bar >= 8)) {
        const n = ch.arp[ARP[pos] % ch.arp.length];
        pluck(n, when, sec.arp * (pos % 4 === 0 ? 1 : 0.75), Math.sin(s * 0.7) * 0.4);
      }
      if (sec.bubbles && pos % 1 === 0) pluck(ch.arp[(pos * 3) % 8] + 12, when, sec.bubbles * 0.5, Math.sin(s) * 0.6);
      if (sec.bell && (pos === 0 || pos === 6 || pos === 10)) bell(ch.arp[(bar * 3 + pos) % 8] + 12, when, sec.bell);
      if (sec.lead) LEAD.forEach(([n, at, len]) => at === pos && lead(n + (bar % 2 ? -2 : 0), when, len * STEP * 0.95, sec.lead));
      // risers into the big sections
      if (pos === 0 && (bar === 3 || bar === 7 || bar === 35)) riser(when, barDur, 0.9);
    }

    function schedule() {
      const horizon = ctx.currentTime + 0.25;
      while (true) {
        const tl = nextStep * STEP;
        const when = startCtx + (tl - startT);
        if (when > horizon || tl >= END) break;
        if (when >= ctx.currentTime - 0.02) playStep(nextStep, Math.max(when, ctx.currentTime), false);
        nextStep++;
      }
    }

    function start(t) {
      init();
      if (ctx.state === "suspended") ctx.resume();
      stop();
      bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(master);
      startT = t;
      startCtx = ctx.currentTime + 0.06;
      nextStep = Math.ceil(t / STEP - 1e-6);
      // a pad for the bar already under way
      const s0 = Math.floor(t / STEP);
      if (s0 % 16 !== 0 && t < END) playStep(s0, startCtx, true);
      running = true;
      schedule();
      timer = setInterval(schedule, 40);
    }

    function stop() {
      running = false;
      clearInterval(timer);
      if (bus && ctx) {
        const b = bus;
        b.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        setTimeout(() => b.disconnect(), 400);
      }
      bus = null;
    }

    /** Renders the whole score offline; returns an AudioBuffer. */
    async function renderOffline(sampleRate = 48000) {
      stop();
      const live = ctx;
      const off = new OfflineAudioContext(2, Math.ceil((END + 3) * sampleRate), sampleRate);
      init(off);
      bus = ctx.createGain();
      bus.connect(master);
      for (let s = 0; s * STEP < END; s++) playStep(s, s * STEP, false);
      const buf = await ctx.startRendering();
      bus = null;
      ctx = live;
      if (!live) master = null;
      return buf;
    }

    return {
      start,
      stop,
      renderOffline,
      running: () => running && !!ctx && ctx.state === "running",
      time: () => (ctx ? startT + Math.max(0, ctx.currentTime - startCtx) : startT),
      stream: () => (streamDest ? streamDest.stream : null),
    };
  }

  PV.createMusic = createMusic;
})();
