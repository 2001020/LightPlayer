// LRC / SRT / VTT / plain-text lyric parsing and LRC serialisation.

export interface LyricWord {
  time: number;
  text: string;
}

export interface LyricLine {
  /** Seconds; null for unsynced lines. */
  time: number | null;
  /** Optional end time (SRT/VTT cues, enhanced LRC). */
  end?: number;
  text: string;
  translation?: string;
  words?: LyricWord[];
}

export interface LyricMeta {
  title?: string;
  artist?: string;
  album?: string;
  by?: string;
  /** Global offset in milliseconds (LRC `[offset:]`, positive = earlier). */
  offset?: number;
  [key: string]: string | number | undefined;
}

export interface Lyrics {
  lines: LyricLine[];
  meta: LyricMeta;
  synced: boolean;
}

const TS = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TS = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const META = /^\[([a-zA-Z#]+):(.*)\]\s*$/;

function toSeconds(m: string, s: string, frac?: string): number {
  let f = 0;
  if (frac) f = parseInt(frac, 10) / Math.pow(10, frac.length);
  return parseInt(m, 10) * 60 + parseInt(s, 10) + f;
}

function parseWords(body: string): { text: string; words?: LyricWord[]; end?: number } {
  WORD_TS.lastIndex = 0;
  if (!WORD_TS.test(body)) return { text: body.trim() };
  WORD_TS.lastIndex = 0;
  const words: LyricWord[] = [];
  let m: RegExpExecArray | null;
  let lastTime: number | null = null;
  let lastIdx = 0;
  let lead = "";
  while ((m = WORD_TS.exec(body))) {
    const chunk = body.slice(lastIdx, m.index);
    if (lastTime === null) lead += chunk;
    else if (chunk) words.push({ time: lastTime, text: chunk });
    lastTime = toSeconds(m[1], m[2], m[3]);
    lastIdx = m.index + m[0].length;
  }
  const tail = body.slice(lastIdx);
  let end: number | undefined;
  if (tail && lastTime !== null) words.push({ time: lastTime, text: tail });
  else if (lastTime !== null) end = lastTime;
  if (lead.trim() && words.length) words[0] = { ...words[0], text: lead + words[0].text };
  const text = words.map((w) => w.text).join("").trim();
  return { text, words: words.length ? words : undefined, end };
}

export function parseLrc(text: string): Lyrics {
  const meta: LyricMeta = {};
  const timed: LyricLine[] = [];
  const plain: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    TS.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let rest = line;
    // Leading timestamps: [00:01.00][00:30.00]text
    while ((m = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(rest))) {
      stamps.push(toSeconds(m[1], m[2], m[3]));
      rest = rest.slice(m[0].length);
    }
    if (stamps.length) {
      const { text: body, words, end } = parseWords(rest);
      for (const t of stamps) {
        timed.push({
          time: t,
          text: body,
          words: stamps.length === 1 ? words : undefined,
          end: stamps.length === 1 ? end : undefined,
        });
      }
      continue;
    }
    const mm = META.exec(line);
    if (mm) {
      const key = mm[1].toLowerCase();
      const value = mm[2].trim();
      if (key === "offset") meta.offset = parseInt(value, 10) || 0;
      else if (key === "ti") meta.title = value;
      else if (key === "ar") meta.artist = value;
      else if (key === "al") meta.album = value;
      else if (key === "by") meta.by = value;
      else meta[key] = value;
      continue;
    }
    plain.push(line);
  }
  if (!timed.length) {
    return { lines: plain.map((t) => ({ time: null, text: t })), meta, synced: false };
  }
  // Stable sort by time; identical timestamps → second line is a translation.
  const sorted = timed
    .map((l, i) => ({ l, i }))
    .sort((a, b) => a.l.time! - b.l.time! || a.i - b.i)
    .map((x) => x.l);
  const lines: LyricLine[] = [];
  for (const l of sorted) {
    const prev = lines[lines.length - 1];
    if (prev && Math.abs(prev.time! - l.time!) < 0.001 && l.text && prev.text && !prev.translation) {
      prev.translation = l.text;
      continue;
    }
    lines.push(l);
  }
  const off = (meta.offset ?? 0) / 1000;
  if (off) {
    for (const l of lines) {
      l.time = Math.max(0, l.time! - off);
      if (l.end !== undefined) l.end = Math.max(0, l.end - off);
      l.words = l.words?.map((w) => ({ ...w, time: Math.max(0, w.time - off) }));
    }
  }
  return { lines, meta, synced: true };
}

const CUE_TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

/** Parses SRT or WebVTT cues. Formatting tags are stripped. */
export function parseCues(text: string): Lyrics {
  const lines: LyricLine[] = [];
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const rows = block.split("\n");
    const idx = rows.findIndex((r) => CUE_TIME.test(r));
    if (idx < 0) continue;
    const m = CUE_TIME.exec(rows[idx])!;
    const start = (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, "0") / 1000;
    const end = (+(m[5] ?? 0)) * 3600 + +m[6] * 60 + +m[7] + +m[8].padEnd(3, "0") / 1000;
    const body = rows
      .slice(idx + 1)
      .map((r) => r.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim())
      .filter(Boolean);
    if (!body.length) continue;
    lines.push({ time: start, end, text: body[0], translation: body.slice(1).join(" ") || undefined });
  }
  lines.sort((a, b) => a.time! - b.time!);
  return { lines, meta: {}, synced: lines.length > 0 };
}

export function parseLyrics(content: string, format: string): Lyrics {
  const f = format.toLowerCase();
  if (f === "srt" || f === "vtt" || /^WEBVTT/.test(content) || (f !== "lrc" && CUE_TIME.test(content))) {
    const cues = parseCues(content);
    if (cues.lines.length) return cues;
  }
  return parseLrc(content);
}

export function formatTimestamp(t: number): string {
  const cs = Math.round(Math.max(0, t) * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor(cs / 100) % 60;
  const c = cs % 100;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** Parses "mm:ss.xx", "m:ss", "ss.x" into seconds. */
export function parseTimestamp(s: string): number | null {
  const t = s.trim().replace(/^\[|\]$/g, "");
  const m = /^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/.exec(t);
  if (!m) return null;
  const min = m[1] ? parseInt(m[1], 10) : 0;
  const sec = parseFloat(m[2].replace(",", "."));
  if (!isFinite(sec) || (m[1] && sec >= 60)) return null;
  return min * 60 + sec;
}

export function serializeLrc(lines: LyricLine[], meta: LyricMeta = {}, keepWords = true): string {
  const out: string[] = [];
  if (meta.title) out.push(`[ti:${meta.title}]`);
  if (meta.artist) out.push(`[ar:${meta.artist}]`);
  if (meta.album) out.push(`[al:${meta.album}]`);
  if (meta.by) out.push(`[by:${meta.by}]`);
  for (const l of lines) {
    if (l.time === null) {
      out.push(l.text);
      continue;
    }
    const ts = `[${formatTimestamp(l.time)}]`;
    if (keepWords && l.words && l.words.length > 1) {
      let body = l.words.map((w) => `<${formatTimestamp(w.time)}>${w.text}`).join("");
      if (l.end !== undefined) body += `<${formatTimestamp(l.end)}>`;
      out.push(ts + body);
    } else {
      out.push(ts + l.text);
    }
    if (l.translation) out.push(ts + l.translation);
  }
  return out.join("\n") + "\n";
}

/** Index of the line active at time `t` (-1 before the first line). */
export function findLineIndex(lines: LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const time = lines[mid].time;
    if (time === null) return -1;
    if (time <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** For cue-style tracks (subtitles): the cue covering `t`, if any. */
export function findActiveCue(lines: LyricLine[], t: number): LyricLine | null {
  const i = findLineIndex(lines, t);
  if (i < 0) return null;
  const l = lines[i];
  const end = l.end ?? lines[i + 1]?.time ?? l.time! + 5;
  return t <= end ? l : null;
}
