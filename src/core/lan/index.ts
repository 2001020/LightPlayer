// LAN sync playback in the main window: keeps the service configured, tells
// devices we share with where our playback is, and follows a sender's
// playback after receiving a file from it.

import * as C from "../controller";
import { engine } from "../player/engine";
import {
  api,
  on,
  LAN_EVENTS,
  type LanAnchor,
  type LanDevice,
  type LanDevicesEvent,
  type LanProgress,
  type LanSession,
  type LanSyncEvent,
} from "../../lib/ipc";
import { basename } from "../../lib/format";
import { activeSend, applyProgress, mergeSession, nextOffers, useLan } from "../../stores/lan";
import { toast, usePlayer } from "../../stores/player";
import { useSettings } from "../../stores/settings";
import { errCode, reasonText } from "./reasons";
import { follow, leftByUs, remotePosition, syncAction, type FollowEvent, type Remote } from "./sync";

let started = false;

export async function startLan() {
  if (started) return;
  started = true;

  let nameTimer: number | undefined;
  const configure = () => {
    const l = useSettings.getState().lan;
    api.lanConfigure(l.enabled, l.name).then(
      (status) => useLan.setState({ status }),
      (e) => console.warn("lan", e),
    );
  };
  configure();
  useSettings.subscribe((s, p) => {
    if (s.lan.enabled !== p.lan.enabled) configure();
    else if (s.lan.name !== p.lan.name) {
      window.clearTimeout(nameTimer);
      nameTimer = window.setTimeout(configure, 500);
    }
  });

  await on<LanDevicesEvent>(LAN_EVENTS.devices, (e) => useLan.setState({ devices: e.devices, discoverError: e.error }));
  await on<LanSession>(LAN_EVENTS.offer, (s) => useLan.setState((st) => ({ shares: mergeSession(st.shares, s), offers: nextOffers(st.offers, s) })));
  await on<LanProgress>(LAN_EVENTS.progress, (p) => useLan.setState((st) => ({ shares: applyProgress(st.shares, p) })));
  await on<LanSession>(LAN_EVENTS.session, onSession);
  await on<LanSyncEvent>(LAN_EVENTS.sync, onSync);

  C.onUserAction((action) => dispatch({ type: "user", action }));
  // A followed file stops at its end (the sender decides what comes next).
  C.setHoldAtEnd(() => {
    const m = useLan.getState().follow.mode;
    return m === "following" || m === "paused";
  });
  usePlayer.subscribe(() => publish());
  window.setInterval(() => publish(), 1000);
  window.setInterval(followStep, 250);
}

// ------------------------------------------------------------------ sending

let lastSent: LanAnchor | null = null;
let waitingSince: number | null = null;

function anchorNow(): LanAnchor {
  const now = Date.now();
  const stalled = !engine.paused && engine.waiting;
  if (stalled) waitingSince ??= now;
  else waitingSince = null;
  // Brief stalls (starting, a seek) do not pause the receivers.
  const playing = !engine.paused && !(waitingSince !== null && now - waitingSince > 500);
  return { path: usePlayer.getState().media?.path ?? "", pos: engine.position, playing, rate: engine.rate, at: now };
}

/** Reports our playback to the backend while we share with someone. */
function publish(force = false) {
  if (!force && !activeSend(useLan.getState())) {
    lastSent = null;
    return;
  }
  const a = anchorNow();
  const l = lastSent;
  const drift = l ? Math.abs(l.pos + (l.playing ? ((a.at - l.at) / 1000) * l.rate : 0) - a.pos) : Infinity;
  if (force || !l || a.path !== l.path || a.playing !== l.playing || a.rate !== l.rate || drift > 0.1 || a.at - l.at > 5000) {
    lastSent = a;
    void api.lanPublish(a).catch(() => {});
  }
}

export async function sendTo(d: LanDevice) {
  const media = usePlayer.getState().media;
  if (!media) return;
  try {
    await api.lanSend({ addr: d.addr, id: d.id, name: d.name, platform: d.platform }, media.path);
    publish(true);
  } catch (e) {
    toast(reasonText(errCode(e), "send"), "error", 5000);
  }
}

export function startDiscovery() {
  useLan.setState({ discovering: true });
  void api.lanDiscover(true).catch(() => {});
}

export function stopDiscovery() {
  useLan.setState({ discovering: false, devices: [] });
  void api.lanDiscover(false).catch(() => {});
}

/** Adds a device by its address; returns an error message or null. */
export async function addByAddress(addr: string): Promise<string | null> {
  try {
    await api.lanProbe(addr.trim());
    return null;
  } catch (e) {
    return reasonText(errCode(e), "send");
  }
}

export function cancelShare(id: string) {
  void api.lanCancel(id).catch(() => {});
}

export async function refreshStatus() {
  try {
    useLan.setState({ status: await api.lanStatus() });
  } catch {
    // Not available in this build.
  }
}

// ------------------------------------------------------------------ receiving

export async function answerOffer(id: string, accept: boolean, followIt: boolean) {
  useLan.setState((st) => ({ offers: st.offers.filter((o) => o !== id) }));
  const ok = await api.lanAnswer(id, accept, followIt).catch(() => false);
  if (!ok && accept) toast("这个请求已经失效", "error");
}

async function onSession(s: LanSession) {
  const prev = useLan.getState().shares[s.id];
  useLan.setState((st) => ({ shares: mergeSession(st.shares, s), offers: nextOffers(st.offers, s) }));
  if (s.role === "send") {
    publish();
    return;
  }
  if (s.stage === "received" && prev?.stage !== "received" && s.path) await onReceived(s, s.path);
  dispatch({ type: "stage", id: s.id, stage: s.stage, reason: s.reason });
  if (s.stage === "ended" && prev && prev.stage !== "ended" && (prev.stage === "accepted" || prev.stage === "receiving")) {
    toast(`没有收到“${s.file.name}”：${reasonText(s.reason, "receive")}`, "error", 6000);
  }
}

async function onReceived(s: LanSession, path: string) {
  if (!s.following) {
    useLan.setState({ received: { path, name: basename(path), peer: s.peer.name } });
    return;
  }
  dispatch({ type: "start", id: s.id, peer: s.peer.name, path, userRate: useSettings.getState().rate });
  usePlayer.setState({ abLoop: { a: null, b: null } });
  const r = remote && remote.id === s.id ? remote.r : null;
  await C.openReceived(path, r ? remotePosition(r, Date.now()) : 0, false);
}

let remote: { id: string; r: Remote } | null = null;
let lastRemoteRate: number | null = null;

function onSync(e: LanSyncEvent) {
  remote = { id: e.id, r: { pos: e.pos, at: e.at, playing: e.playing, rate: e.rate } };
  if (e.id === useLan.getState().follow.id) {
    lastRemoteRate = e.rate;
    followStep();
  }
}

let dismissTimer: number | undefined;

function dispatch(e: FollowEvent) {
  const prev = useLan.getState().follow;
  const next = follow(prev, e);
  if (next === prev) return;
  useLan.setState({ follow: next });
  const id = prev.id ?? next.id;
  if (id && next.mode !== "ended" && (prev.mode === "following") !== (next.mode === "following") && prev.mode !== "off") {
    void api.lanFollow(id, next.mode === "following").catch(() => {});
  }
  if (id && leftByUs(prev, next)) void api.lanCancel(id).catch(() => {});
  if (next.mode !== "following") {
    engine.nudge(1);
    nudging = false;
    seekStarted = null;
  }
  if (next.mode === "ended" && prev.mode !== "ended") {
    // Back to the user's own speed, unless they changed it meanwhile.
    if (next.userRate !== null && lastRemoteRate !== null && useSettings.getState().rate === lastRemoteRate && lastRemoteRate !== next.userRate) {
      C.syncRate(next.userRate);
    }
    lastRemoteRate = null;
    window.clearTimeout(dismissTimer);
    dismissTimer = window.setTimeout(() => dispatch({ type: "dismiss" }), 8000);
  }
}

export const stopFollowing = () => dispatch({ type: "stop" });
export const resumeFollowing = () => dispatch({ type: "resume" });
export const dismissFollow = () => dispatch({ type: "dismiss" });

let nudging = false;
/** How long recent jumps took to settle (seconds). */
let lead = 0;
let seekStarted: { at: number; playing: boolean } | null = null;
let settleUntil = 0;

/** One round of lining our playback up with the sender's. */
function followStep() {
  const f = useLan.getState().follow;
  if (f.mode !== "following" || !remote || remote.id !== f.id) return;
  const media = engine.media;
  if (!media || media.path !== f.path || usePlayer.getState().loading) return;
  const now = Date.now();
  if (seekStarted) {
    const busy = engine.seeking || engine.restarting || (!engine.paused && engine.waiting);
    if (busy && now - seekStarted.at < 8000) return;
    if (seekStarted.playing) lead = Math.min(3, lead * 0.5 + ((now - seekStarted.at) / 1000) * 0.5);
    seekStarted = null;
    settleUntil = now + 300;
    return;
  }
  if (now < settleUntil || engine.restarting || engine.seeking || (!engine.paused && engine.waiting)) return;
  const step = syncAction(
    { pos: engine.position, playing: !engine.paused, rate: engine.rate, canSeekInPlace: (t) => engine.canSeekInPlace(t) },
    remote.r,
    now,
    { nudging, lead },
  );
  if (step.rate !== undefined) C.syncRate(step.rate);
  if (step.seek !== undefined) {
    seekStarted = { at: now, playing: remote.r.playing };
    C.syncSeek(step.seek);
  }
  if (step.pause) engine.pause();
  if (step.play) void engine.play();
  engine.nudge(step.nudge);
  nudging = step.nudge !== 1;
}

/** Plays a received file the user chose not to follow. */
export async function playReceived() {
  const r = useLan.getState().received;
  if (!r) return;
  useLan.setState({ received: null });
  await C.openFile(r.path);
}
