import { describe, expect, it } from "vitest";
import {
  BUILTIN_KINDS,
  BUILTIN_LAYOUTS,
  checkLayout,
  fillTemplate,
  formatClock,
  formatTimeEl,
  fontFamily,
  snap,
  snapAngle,
  validSrc,
  type PlayerLayout,
} from "./model";

describe("player layouts", () => {
  it("built-in layouts are complete and survive a check", () => {
    for (const l of BUILTIN_LAYOUTS.filter((l) => !l.classic)) {
      expect(l.elements.map((e) => e.kind).sort()).toEqual([...BUILTIN_KINDS].sort());
      const again = checkLayout(JSON.parse(JSON.stringify(l)), "x")!;
      expect(again.elements).toEqual(l.elements);
    }
  });

  it("cleans what it reads", () => {
    const l = checkLayout(
      {
        id: "custom-3",
        name: "  ",
        elements: [
          { id: "cover", kind: "cover", x: 500, y: -900, w: 0, cover: { shape: "disc", label: 10 }, extra: 1 },
          { id: "cover", kind: "title" },
          { id: "c2", kind: "cover" },
          { id: "bad id!", kind: "text" },
          { id: "s", kind: "script" },
          { id: "t", kind: "text", content: "x".repeat(900), text: { color: "red", font: 'A"; }', weight: 432, align: "justify" } },
          { id: "i", kind: "image", src: "https://example.com/a.png" },
        ],
      },
      "fallback",
    )!;
    expect(l.id).toBe("custom-3");
    expect(l.name).toBe("未命名布局");
    const cover = l.elements.find((e) => e.kind === "cover")!;
    expect([cover.x, cover.y, cover.w]).toEqual([150, -50, 1]);
    expect(cover.cover).toMatchObject({ shape: "square", label: 30 });
    expect("extra" in cover).toBe(false);
    // One cover only; the duplicate id and unknown kinds are dropped.
    expect(l.elements.filter((e) => e.kind === "cover")).toHaveLength(1);
    expect(l.elements.some((e) => e.id === "s" || e.id === "bad id!")).toBe(false);
    const t = l.elements.find((e) => e.id === "t")!;
    expect(t.content).toHaveLength(500);
    expect(t.text).toMatchObject({ color: null, font: "A", weight: 400, align: "center" });
    expect(l.elements.find((e) => e.id === "i")!.src).toBe("");
    // Missing built-in parts are added, hidden.
    for (const k of BUILTIN_KINDS) expect(l.elements.filter((e) => e.kind === k)).toHaveLength(1);
    expect(l.elements.find((e) => e.kind === "lyric")!.hidden).toBe(true);
    expect(checkLayout({ elements: "x" }, "a")).toBeNull();
  });

  it("resolves a plugin's pictures inside its folder", () => {
    const l = checkLayout(
      {
        name: "P",
        elements: [
          { id: "a", kind: "image", src: "images/a.png" },
          { id: "b", kind: "image", src: "../b.png" },
          { id: "c", kind: "image", src: "asset:0123456789abcdef0123456789abcdef.png" },
        ],
      },
      "p",
      "com.example.deck",
    ) as PlayerLayout;
    const src = (id: string) => l.elements.find((e) => e.id === id)!.src;
    expect(src("a")).toBe("plugin:com.example.deck/images/a.png");
    expect(src("b")).toBe("");
    // A plugin cannot point at the user's own pictures.
    expect(src("c")).toBe("");
    expect(l.plugin).toBe("com.example.deck");
  });

  it("accepts only local picture sources", () => {
    expect(validSrc("asset:0123456789abcdef0123456789abcdef.png")).toBe(true);
    expect(validSrc("asset:../x.png")).toBe(false);
    expect(validSrc("plugin:com.example.x/img/a.webp")).toBe(true);
    expect(validSrc("plugin:com.example.x/../a.webp")).toBe(false);
    expect(validSrc("data:image/png;base64,AAAA")).toBe(true);
    expect(validSrc("data:text/html;base64,AAAA")).toBe(false);
    expect(validSrc("https://example.com/a.png")).toBe(false);
  });

  it("fills text placeholders", () => {
    const now = new Date(2026, 9, 6, 9, 5, 7);
    const f = { title: "晴天", artist: "周杰伦", album: "叶惠美", position: 65, duration: 269, now };
    expect(fillTemplate("{title} - {artist}《{album}》", f)).toBe("晴天 - 周杰伦《叶惠美》");
    expect(fillTemplate("{elapsed}/{duration} {remaining} {time} {nope}", f)).toBe("1:05/4:29 -3:24 09:05 {nope}");
    expect(fillTemplate("{date}", f)).toBe("10月6日 星期二");
    expect(formatClock(now, "HH:mm:ss")).toBe("09:05:07");
    expect(formatTimeEl("both", 3725, 4000)).toBe("1:02:05 / 1:06:40");
  });

  it("snaps to nearby lines", () => {
    expect(snap(49.4, [50, 20], 1)).toEqual({ value: 50, guide: 50 });
    expect(snap(47, [50], 1)).toEqual({ value: 47, guide: null });
    expect(snap(20.6, [50, 20, 21], 1).value).toBe(21);
  });

  it("snaps rotation angles", () => {
    expect(snapAngle(43.2, false, false)).toBe(45);
    expect(snapAngle(43.2, false, true)).toBe(43);
    expect(snapAngle(38, false, false)).toBe(38);
    expect(snapAngle(38, true, false)).toBe(45);
    expect(snapAngle(200, false, true)).toBe(-160);
    expect(snapAngle(-181, false, true)).toBe(179);
    expect(snapAngle(179.6, false, true)).toBe(-180);
    expect(snapAngle(-1, false, false)).toBe(0);
  });

  it("names fonts safely", () => {
    expect(fontFamily("")).toBeUndefined();
    expect(fontFamily("mono")).toBe("var(--mono)");
    expect(fontFamily("PingFang SC")).toBe('"PingFang SC", var(--font)');
  });
});
