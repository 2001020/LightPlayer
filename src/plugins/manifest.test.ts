import { describe, expect, it } from "vitest";
import type { PluginManifest } from "../lib/ipc";
import { optionEffects, optionValue, patchPath, getPath, pluginConfig, versionAtLeast } from "./manifest";

const m: PluginManifest = {
  manifestVersion: 1,
  id: "test.plugin",
  name: "Test",
  version: "1.0.0",
  options: [
    { id: "size", label: "Size", type: "range", min: 10, max: 40, unit: "px", default: 20, var: "--t-size" },
    { id: "color", label: "Color", type: "color", default: "#ff0000", var: "--t-color" },
    { id: "on", label: "On", type: "toggle", default: true, class: "t-on", var: "--t-on" },
    { id: "mode", label: "Mode", type: "select", default: "a", choices: [{ value: "a", label: "A", class: "t-a" }, { value: "b", label: "B" }] },
    { id: "bad", label: "Bad", type: "color", default: "#000000", var: "--t;bad" },
  ],
  config: { lyricAlign: "left", lyricFontSize: 300, volume: 1, lyricHighlight: null, "desktopLyrics.color": "#fff" },
};

describe("plugin options", () => {
  it("falls back to defaults and clamps", () => {
    const [size, color, on, mode] = m.options!;
    expect(optionValue(size, undefined)).toBe(20);
    expect(optionValue(size, 99)).toBe(40);
    expect(optionValue(size, "x")).toBe(20);
    expect(optionValue(color, "red; x")).toBe("#ff0000");
    expect(optionValue(on, "yes")).toBe(true);
    expect(optionValue(mode, "zzz")).toBe("a");
    expect(optionValue(mode, "b")).toBe("b");
  });

  it("produces CSS variables and classes", () => {
    expect(optionEffects(m, undefined)).toEqual({
      vars: [["--t-size", "20px"], ["--t-color", "#ff0000"], ["--t-on", "1"]],
      classes: ["t-on", "t-a"],
    });
    expect(optionEffects(m, { size: 30, on: false, mode: "b" })).toEqual({
      vars: [["--t-size", "30px"], ["--t-color", "#ff0000"], ["--t-on", "0"]],
      classes: [],
    });
  });
});

describe("plugin config", () => {
  it("keeps only allowed keys with valid values", () => {
    expect(pluginConfig(m)).toEqual({ lyricAlign: "left", lyricHighlight: null, "desktopLyrics.color": "#fff" });
  });
  it("reads and patches dotted keys", () => {
    const s = { desktopLyrics: { enabled: true, color: "#000" }, lyricAlign: "center" };
    expect(getPath(s, "desktopLyrics.color")).toBe("#000");
    expect(patchPath(s, "desktopLyrics.color", "#fff")).toEqual({ desktopLyrics: { enabled: true, color: "#fff" } });
    expect(patchPath(s, "lyricAlign", "left")).toEqual({ lyricAlign: "left" });
  });
});

describe("versions", () => {
  it("compares app and required versions", () => {
    expect(versionAtLeast("1.6.0", "1.6.0")).toBe(true);
    expect(versionAtLeast("1.6.0", "1.5.9")).toBe(true);
    expect(versionAtLeast("1.6.0", "1.10")).toBe(false);
    expect(versionAtLeast("2.0.0", "1.99.99")).toBe(true);
    expect(versionAtLeast("1.6.0", "v1.6.0b1")).toBe(true);
  });
});
