// Playback engine: owns the <audio>/<video> elements, HLS attachment, the
// virtual timeline for restartable HLS sessions and the Web Audio graph used
// for app-level volume and the waveform analyser.

import Hls from "hls.js";
import { api, type OpenedMedia } from "../../lib/ipc";

type Handler = () => void;

export class PlayerEngine {
  readonly audio: HTMLAudioElement;
  readonly video: HTMLVideoElement;
  media: OpenedMedia | null = null;
  /** Absolute media time corresponding to element time 0 (HLS sessions). */
  baseOffset = 0;
  volume = 0.8;
  muted = false;
  rate = 1;
  restarting = false;

  onEnded: Handler = () => {};
  onChange: Handler = () => {};
  onError: (msg: string) => void = () => {};

  private hls: Hls | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private graphFailed = false;
  private loadToken = 0;
  private fadeTimer: number | null = null;

  constructor() {
    this.audio = document.createElement("audio");
    this.video = document.createElement("video");
    for (const el of [this.audio, this.video]) {
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      (el as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true;
      el.addEventListener("ended", () => {
        if (el === this.el) this.onEnded();
      });
      el.addEventListener("error", () => {
        if (el !== this.el || !el.error || this.restarting) return;
        const codes: Record<number, string> = {
          1: "播放被中止",
          2: "网络错误，媒体加载失败",
          3: "解码失败，文件可能已损坏",
          4: "不支持的媒体格式",
        };
        this.onError(codes[el.error.code] ?? "播放失败");
      });
      for (const ev of ["play", "pause", "waiting", "playing", "loadedmetadata", "durationchange", "ratechange", "seeked", "canplay"]) {
        el.addEventListener(ev, () => {
          if (el === this.el) this.onChange();
        });
      }
    }
    this.video.playsInline = true;
    this.video.className = "video-el";
  }

  get el(): HTMLMediaElement {
    return this.media?.kind === "video" ? this.video : this.audio;
  }

  get isHls(): boolean {
    const s = this.media?.strategy;
    return s === "hlsRemux" || s === "hlsTranscode";
  }

  get position(): number {
    return this.baseOffset + (this.el.currentTime || 0);
  }

  get duration(): number {
    const d = this.media?.duration;
    if (d && isFinite(d)) return d;
    const e = this.el.duration;
    return isFinite(e) ? e + this.baseOffset : 0;
  }

  get paused(): boolean {
    return this.el.paused;
  }

  get waiting(): boolean {
    return this.restarting || this.el.readyState < 3;
  }

  /** Buffered ranges in absolute time. */
  buffered(): [number, number][] {
    const b = this.el.buffered;
    const out: [number, number][] = [];
    for (let i = 0; i < b.length; i++) out.push([b.start(i) + this.baseOffset, b.end(i) + this.baseOffset]);
    return out;
  }

  private seekableEnd(): number {
    const s = this.el.seekable;
    let end = 0;
    for (let i = 0; i < s.length; i++) end = Math.max(end, s.end(i));
    return end;
  }

  private detach(el: HTMLMediaElement) {
    el.pause();
    el.removeAttribute("src");
    try {
      el.load();
    } catch {
      /* ignore */
    }
  }

  private setSource(url: string) {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const el = this.el;
    const native = el.canPlayType("application/vnd.apple.mpegurl");
    if (this.isHls && !native && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 60, enableWorker: true });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal && !this.restarting) this.onError(`流媒体错误：${data.details}`);
      });
      hls.loadSource(url);
      hls.attachMedia(el as HTMLVideoElement);
      this.hls = hls;
    } else {
      el.src = url;
    }
  }

  async load(media: OpenedMedia, startAt = 0, autoplay = true): Promise<void> {
    const token = ++this.loadToken;
    this.cancelFade();
    const prevEl = this.media ? this.el : null;
    this.media = media;
    if (prevEl && prevEl !== this.el) this.detach(prevEl);
    this.baseOffset = media.baseOffset;
    let url = media.url;
    if (this.isHls && startAt > 1) {
      const s = await api.requestStream(media.path, startAt, media.strategy === "hlsTranscode");
      if (token !== this.loadToken) return;
      url = s.url;
      this.baseOffset = s.baseOffset;
    }
    this.setSource(url);
    const el = this.el;
    el.playbackRate = this.rate;
    this.applyVolume();
    if (!this.isHls && startAt > 0) {
      const seekTo = () => {
        el.currentTime = startAt;
      };
      if (el.readyState >= 1) seekTo();
      else el.addEventListener("loadedmetadata", seekTo, { once: true });
    }
    this.onChange();
    if (autoplay) await this.play();
  }

  unload() {
    this.loadToken++;
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.detach(this.audio);
    this.detach(this.video);
    this.media = null;
    this.baseOffset = 0;
    this.onChange();
  }

  private ensureGraph() {
    if (this.ctx || this.graphFailed || this.el !== this.audio) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(this.audio);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.86;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.connect(analyser);
      this.ctx = ctx;
      this.gain = gain;
      this.analyser = analyser;
    } catch {
      this.graphFailed = true;
    }
    this.applyVolume();
  }

  async play(): Promise<void> {
    if (!this.media) return;
    this.ensureGraph();
    if (this.ctx?.state === "suspended") await this.ctx.resume().catch(() => {});
    try {
      await this.el.play();
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") this.onChange();
    }
  }

  pause() {
    this.el.pause();
  }

  toggle() {
    if (this.el.paused) void this.play();
    else this.pause();
  }

  async seek(t: number): Promise<void> {
    if (!this.media) return;
    const dur = this.duration;
    t = Math.max(0, dur ? Math.min(t, dur - 0.05) : t);
    if (!this.isHls) {
      this.el.currentTime = t;
      this.onChange();
      return;
    }
    const rel = t - this.baseOffset;
    if (rel >= 0 && rel <= this.seekableEnd() - 0.25) {
      this.el.currentTime = rel;
      this.onChange();
      return;
    }
    // Outside the produced range: restart ffmpeg at the new position.
    const wasPlaying = !this.el.paused;
    const token = ++this.loadToken;
    this.restarting = true;
    this.onChange();
    try {
      const s = await api.requestStream(this.media.path, t, this.media.strategy === "hlsTranscode");
      if (token !== this.loadToken) return;
      this.baseOffset = s.baseOffset;
      this.setSource(s.url);
      this.el.playbackRate = this.rate;
      if (wasPlaying) await this.play();
    } catch (e) {
      this.onError(String(e));
    } finally {
      if (token === this.loadToken) {
        this.restarting = false;
        this.onChange();
      }
    }
  }

  seekBy(delta: number) {
    return this.seek(this.position + delta);
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolume();
  }

  private applyVolume() {
    const v = this.muted ? 0 : this.volume;
    // Only the app's own output is changed; the system volume is never touched.
    if (this.gain && this.el === this.audio) {
      this.audio.volume = 1;
      this.gain.gain.setTargetAtTime(v * v, this.ctx!.currentTime, 0.015);
    } else {
      this.el.volume = v * v; // perceptual curve
    }
    this.video.muted = false;
    this.audio.muted = false;
  }

  setRate(r: number) {
    this.rate = r;
    this.audio.playbackRate = r;
    this.video.playbackRate = r;
  }

  /** Fades out over `ms`, pauses, then restores the volume (sleep timer). */
  fadeOutAndPause(ms = 8000) {
    this.cancelFade();
    const start = performance.now();
    const from = this.volume;
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / ms);
      const v = from * (1 - k);
      if (this.gain && this.el === this.audio) this.gain.gain.value = v * v;
      else this.el.volume = v * v;
      if (k < 1) this.fadeTimer = window.setTimeout(step, 50);
      else {
        this.fadeTimer = null;
        this.pause();
        this.applyVolume();
      }
    };
    step();
  }

  private cancelFade() {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
      this.applyVolume();
    }
  }
}

export const engine = new PlayerEngine();
