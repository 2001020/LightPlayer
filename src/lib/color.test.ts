import { describe, expect, it } from "vitest";
import { accentPalette, contrast, hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from "./color";

describe("color", () => {
  it("converts hex", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgbToHex({ r: 124, g: 92, b: 255 })).toBe("#7c5cff");
    expect(hexToRgb("nope")).toBeNull();
  });

  it("round-trips hsl", () => {
    const rgb = { r: 31, g: 182, b: 255 };
    const [h, s, l] = rgbToHsl(rgb);
    const back = hslToRgb(h, s, l);
    expect(rgbToHex(back)).toBe(rgbToHex(rgb));
  });

  it("keeps the chosen fill and makes text readable", () => {
    const bgDark = { r: 18, g: 18, b: 22 };
    const bgLight = { r: 250, g: 250, b: 252 };
    const blue = accentPalette("#66ccff", false);
    expect(blue.accent).toBe("#66ccff");
    expect(blue.onAccent).toBe("#ffffff");
    expect(contrast(hexToRgb(blue.text)!, bgLight)).toBeGreaterThanOrEqual(3);
    expect(accentPalette("#66ccff", true).accent).toBe("#66ccff");
    const p = accentPalette("#101010", true);
    expect(contrast(hexToRgb(p.text)!, bgDark)).toBeGreaterThanOrEqual(3);
    const light = accentPalette("#ffff66", false);
    expect(contrast(hexToRgb(light.text)!, bgLight)).toBeGreaterThanOrEqual(3);
    expect(light.onAccent).toBe("#111111");
  });
});
