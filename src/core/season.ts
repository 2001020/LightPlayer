// The season theme: which season to show, and its colours.

export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

export const SEASON_LABELS: Record<Season, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

/** The accent colour of each season. */
export const SEASON_ACCENT: Record<Season, string> = {
  spring: "#e8799f",
  summer: "#2f9e6e",
  autumn: "#d9772b",
  winter: "#4f8fd6",
};

/** The season of a date, by month: March to May is spring in the north, autumn in the south. */
export function seasonOf(date: Date, southern = false): Season {
  const quarter = Math.floor(((date.getMonth() + 10) % 12) / 3); // Mar..May -> 0
  return SEASONS[(quarter + (southern ? 2 : 0)) % 4];
}

/** The season a theme shows: "season" follows the calendar; null for other themes. */
export function activeSeason(theme: string, date: Date, southern = false): Season | null {
  if (theme === "season") return seasonOf(date, southern);
  return (SEASONS as string[]).includes(theme) ? (theme as Season) : null;
}

/** Winter is a night scene with light text; the others are bright. */
export const seasonIsDark = (s: Season) => s === "winter";
