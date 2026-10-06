import { beforeEach, describe, expect, it } from "vitest";
import type { PluginEntry } from "../lib/ipc";
import { movePlugin, setPluginEnabled, usePlugins } from "./plugins";
import { useSettings } from "./settings";

const entry = (id: string, config?: Record<string, unknown>, minAppVersion?: string): PluginEntry => ({
  id,
  manifest: { manifestVersion: 1, id, name: id, version: "1.0.0", config, minAppVersion },
  error: null,
  incompatible: false,
});

describe("plugin store", () => {
  beforeEach(() => {
    usePlugins.setState({ enabled: [], options: {}, changes: {}, installed: [] });
    useSettings.getState().set({ lyricAlign: "center", lyricFontSize: 22, desktopLyrics: { enabled: true, color: "#66ccff" } });
  });

  it("applies config on enable and restores it on disable", () => {
    usePlugins.setState({ installed: [entry("a.plugin", { lyricAlign: "left", lyricFontSize: 30, "desktopLyrics.color": "#ffffff" })] });
    setPluginEnabled("a.plugin", true);
    let s = useSettings.getState();
    expect([s.lyricAlign, s.lyricFontSize, s.desktopLyrics]).toEqual(["left", 30, { enabled: true, color: "#ffffff" }]);
    // The user changes one of them afterwards: that one is kept.
    s.set({ lyricFontSize: 40 });
    setPluginEnabled("a.plugin", false);
    s = useSettings.getState();
    expect([s.lyricAlign, s.lyricFontSize, s.desktopLyrics]).toEqual(["center", 40, { enabled: true, color: "#66ccff" }]);
    expect(usePlugins.getState().changes).toEqual({});
  });

  it("refuses plugins that are broken or need a newer app", () => {
    const broken: PluginEntry = { ...entry("b.plugin"), error: "bad" };
    usePlugins.setState({ installed: [broken, entry("c.plugin", undefined, "99.0.0"), entry("d.plugin")] });
    setPluginEnabled("b.plugin", true);
    setPluginEnabled("c.plugin", true);
    setPluginEnabled("d.plugin", true);
    expect(usePlugins.getState().enabled).toEqual(["d.plugin"]);
  });

  it("orders the cascade", () => {
    usePlugins.setState({ installed: [entry("x.one"), entry("x.two"), entry("x.three")] });
    for (const id of ["x.one", "x.two", "x.three"]) setPluginEnabled(id, true);
    movePlugin("x.three", -1);
    expect(usePlugins.getState().enabled).toEqual(["x.one", "x.three", "x.two"]);
    movePlugin("x.one", -1);
    expect(usePlugins.getState().enabled).toEqual(["x.one", "x.three", "x.two"]);
  });
});
