// LAN sync playback: devices found, shares in both directions, and whether
// this device follows another one. Not persisted.

import { create } from "zustand";
import type { LanDevice, LanProgress, LanSession, LanStatus } from "../lib/ipc";
import { NO_FOLLOW, type FollowState } from "../core/lan/sync";

export interface LanShare extends LanSession {
  bytes: number;
  total: number;
  speed: number;
  /** Date.now() of the last change (old finished shares are dropped). */
  updated: number;
}

export interface LanState {
  status: LanStatus | null;
  devices: LanDevice[];
  discovering: boolean;
  /** Discovery problem (e.g. local network access denied). */
  discoverError: string | null;
  shares: Record<string, LanShare>;
  /** Offers waiting for an answer, oldest first. */
  offers: string[];
  follow: FollowState;
  /** A received file the user chose not to follow (offers to play it). */
  received: { path: string; name: string; peer: string } | null;
}

export const useLan = create<LanState>(() => ({
  status: null,
  devices: [],
  discovering: false,
  discoverError: null,
  shares: {},
  offers: [],
  follow: NO_FOLLOW,
  received: null,
}));

const FINISHED_KEEP_MS = 10 * 60_000;

/** Applies a session event: new shares are added, known ones updated, old finished ones dropped. */
export function mergeSession(shares: Record<string, LanShare>, ev: LanSession, now = Date.now()): Record<string, LanShare> {
  const out: Record<string, LanShare> = {};
  for (const [id, s] of Object.entries(shares)) {
    if (s.stage !== "ended" || now - s.updated < FINISHED_KEEP_MS) out[id] = s;
  }
  const old = out[ev.id];
  const done = ev.stage === "received" || ev.stage === "syncing";
  out[ev.id] = {
    ...ev,
    bytes: done ? ev.file.size : (old?.bytes ?? 0),
    total: old?.total || ev.file.size,
    speed: old?.speed ?? 0,
    updated: now,
  };
  return out;
}

export function applyProgress(shares: Record<string, LanShare>, p: LanProgress): Record<string, LanShare> {
  const s = shares[p.id];
  if (!s || s.stage === "ended") return shares;
  return { ...shares, [p.id]: { ...s, bytes: Math.max(s.bytes, p.bytes), total: p.total, speed: p.speed } };
}

/** Pending offers after a session event. */
export function nextOffers(offers: string[], ev: LanSession): string[] {
  if (ev.role !== "receive") return offers;
  if (ev.stage === "offered") return offers.includes(ev.id) ? offers : [...offers, ev.id];
  return offers.filter((id) => id !== ev.id);
}

/** Shares this device is sending, newest first. */
export const sendingShares = (shares: Record<string, LanShare>) =>
  Object.values(shares)
    .filter((x) => x.role === "send")
    .sort((a, b) => b.updated - a.updated);

/** A send in progress or syncing (the play bar button lights up). */
export const activeSend = (s: LanState) => Object.values(s.shares).some((x) => x.role === "send" && x.stage !== "ended");

/** The incoming file currently being received. */
export const receiving = (s: LanState) =>
  Object.values(s.shares).find((x) => x.role === "receive" && (x.stage === "accepted" || x.stage === "receiving")) ?? null;
