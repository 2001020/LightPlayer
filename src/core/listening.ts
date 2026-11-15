// Listening time: how long songs actually played, per day, per song and per
// artist. Pure bookkeeping; the store (stores/listening.ts) keeps it and the
// controller feeds it while audio plays.

export interface SongTime {
  title: string;
  artist: string | null;
  seconds: number;
  /** When it was last listened to (ms). */
  last: number;
}

export interface ListeningData {
  /** Seconds per local day ("YYYY-MM-DD"). */
  days: Record<string, number>;
  /** Seconds per song, by media path. */
  songs: Record<string, SongTime>;
  /** Seconds per artist. */
  artists: Record<string, number>;
  /** When recording began (ms); null: nothing recorded yet. */
  since: number | null;
}

export const emptyListening: ListeningData = { days: {}, songs: {}, artists: {}, since: null };

/** The most songs kept; past it the least listened are forgotten (their time stays in the days). */
export const MAX_SONGS = 2000;

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const round = (v: number) => Math.round(v * 10) / 10;

export interface Listened {
  path: string;
  title: string;
  artist: string | null;
}

/** `data` with `seconds` more of `song`, listened to up to `now`. */
export function addListening(data: ListeningData, song: Listened, seconds: number, now: Date, maxSongs = MAX_SONGS): ListeningData {
  if (!(seconds > 0)) return data;
  const key = dayKey(now);
  const days = { ...data.days, [key]: round((data.days[key] ?? 0) + seconds) };
  const old = data.songs[song.path];
  let songs = { ...data.songs, [song.path]: { title: song.title, artist: song.artist, seconds: round((old?.seconds ?? 0) + seconds), last: now.getTime() } };
  const paths = Object.keys(songs);
  if (paths.length > maxSongs) {
    // Drop the least listened (the oldest among equals), never the current one.
    const drop = paths
      .filter((p) => p !== song.path)
      .sort((a, b) => songs[a].seconds - songs[b].seconds || songs[a].last - songs[b].last)
      .slice(0, paths.length - maxSongs);
    songs = { ...songs };
    for (const p of drop) delete songs[p];
  }
  const artists = song.artist ? { ...data.artists, [song.artist]: round((data.artists[song.artist] ?? 0) + seconds) } : data.artists;
  return { days, songs, artists, since: data.since ?? now.getTime() - seconds * 1000 };
}

/**
 * Seconds to credit for the stretch from `from` to `to` (ms) of continuous
 * playback. Short stretches count in full. A long one means the timer was
 * held back or the computer slept: then only as much as the song actually
 * advanced (`moved` seconds of it at `rate`) counts.
 */
export function creditFor(from: number, to: number, moved: number, rate: number): number {
  const dt = (to - from) / 1000;
  if (!(dt > 0)) return 0;
  if (dt <= 20) return dt;
  return Math.min(dt, Math.max(0, moved / (rate > 0 ? rate : 1)));
}

export interface DayTime {
  key: string;
  date: Date;
  seconds: number;
}

/** The last `n` days up to `now`, oldest first. */
export function lastDays(data: ListeningData, n: number, now: Date): DayTime[] {
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i));
    const key = dayKey(date);
    return { key, date, seconds: data.days[key] ?? 0 };
  });
}

export interface Totals {
  today: number;
  /** This week, from Monday. */
  week: number;
  month: number;
  all: number;
  /** Days with any listening. */
  activeDays: number;
}

export function totals(data: ListeningData, now: Date): Totals {
  const today = dayKey(now);
  const monday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
  const month = today.slice(0, 8);
  const t: Totals = { today: 0, week: 0, month: 0, all: 0, activeDays: 0 };
  for (const [k, s] of Object.entries(data.days)) {
    if (!(s > 0)) continue;
    t.all += s;
    t.activeDays++;
    if (k === today) t.today += s;
    if (k >= monday && k <= today) t.week += s;
    if (k.startsWith(month)) t.month += s;
  }
  return t;
}

export function topSongs(data: ListeningData, n: number): (SongTime & { path: string })[] {
  return Object.entries(data.songs)
    .map(([path, s]) => ({ path, ...s }))
    .sort((a, b) => b.seconds - a.seconds || b.last - a.last)
    .slice(0, n);
}

export function topArtists(data: ListeningData, n: number): { name: string; seconds: number }[] {
  return Object.entries(data.artists)
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** Checks data read back from storage; anything odd is dropped. */
export function sanitizeListening(v: unknown): ListeningData {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof ListeningData, unknown>>;
  const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
  const rec = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.entries(x as Record<string, unknown>) : []);
  const days = Object.fromEntries(rec(o.days).filter(([k, s]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && num(s))) as Record<string, number>;
  const artists = Object.fromEntries(rec(o.artists).filter(([, s]) => num(s))) as Record<string, number>;
  const songs: Record<string, SongTime> = {};
  for (const [path, s] of rec(o.songs)) {
    const t = s as Partial<SongTime> | null;
    if (!t || typeof t.title !== "string" || !num(t.seconds)) continue;
    songs[path] = { title: t.title, artist: typeof t.artist === "string" ? t.artist : null, seconds: t.seconds, last: num(t.last) ? t.last : 0 };
  }
  return { days, songs, artists, since: num(o.since) ? o.since : null };
}
