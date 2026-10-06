// UI text must not use the middle dot (product requirement). Scans the
// frontend and backend sources, since backend strings reach the UI too.
import { describe, expect, it } from "vitest";

const DOT = "·";

const sources = {
  ...import.meta.glob("/src/**/*.{ts,tsx,css,json}", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("/src-tauri/src/**/*.rs", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("/index.html", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;

describe("UI text", () => {
  it("contains no middle dot", () => {
    const files = Object.keys(sources);
    expect(files.length).toBeGreaterThan(20);
    const hits = files.flatMap((f) =>
      sources[f]
        .split("\n")
        .map((line, i) => (line.includes(DOT) ? `${f}:${i + 1}: ${line.trim()}` : null))
        .filter((x): x is string => x !== null),
    );
    expect(hits).toEqual([]);
  });
});
