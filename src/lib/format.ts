export function formatTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(r).padStart(2, "0")}`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatBitrate(bps: number | null | undefined): string {
  if (!bps || bps <= 0) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
}

export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function stem(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(0, i) : b;
}

/** A count the way NetEase shows it: 9999, 1.2万, 3.4亿. */
export function formatCount(n: number): string {
  const short = (v: number, unit: string) => `${v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
  if (n < 10000) return String(n);
  if (n < 1e8) return short(n / 1e4, "万");
  return short(n / 1e8, "亿");
}

/** A comment's time: "14:05" today, "昨天 14:05", "3月8日" this year, else "2021年3月8日". */
export function formatCommentTime(ms: number, now: Date = new Date()): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return hm;
  if (diff === 1) return `昨天 ${hm}`;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}年${md}`;
}
