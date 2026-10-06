import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS build script
import { LOCALES, checkLocale, extractKeys } from "../../scripts/i18n.mjs";
import { releaseNotesFor, systemLang } from ".";

describe("UI languages", () => {
  const keys = extractKeys();

  it("finds the UI text, but not what is not UI", () => {
    expect(keys.has("媒体库")).toBe(true);
    // Template and JSX parts become placeholders.
    expect(keys.has("已导入 {a} 个文件，并建立歌单“{b}”")).toBe(true);
    // Rust format! arguments too.
    expect(keys.has("下载失败：HTTP {status}")).toBe(true);
    expect(keys.has("IO 错误: {a}")).toBe(true);
    // Whisper prompts and the browser preview's pretend data are left out.
    expect(keys.has("以下是一首中文歌曲的歌词，使用简体中文。")).toBe(false);
    expect(keys.has("一只猫")).toBe(false);
  });

  it.each(LOCALES as string[])("%s has every string, with the same placeholders", (lang) => {
    const { missing, badPlaceholders } = checkLocale(lang, keys);
    expect(missing).toEqual([]);
    expect(badPlaceholders).toEqual([]);
  });

  it("follows the system language", () => {
    expect(systemLang(["zh-CN"])).toBe("zh-Hans");
    expect(systemLang(["zh-Hant-TW"])).toBe("zh-Hant");
    expect(systemLang(["zh-HK"])).toBe("zh-Hant");
    expect(systemLang(["ja-JP", "en"])).toBe("ja");
    expect(systemLang(["ko"])).toBe("ko");
    expect(systemLang(["de-DE", "en-GB"])).toBe("en");
    expect(systemLang(["fr"])).toBe("en");
  });

  it("shows the release notes in the UI language", () => {
    const body = "# 1.6.0\n\n新功能\n\n<!-- en -->\n\n---\n\n# 1.6.0\n\nNew features";
    expect(releaseNotesFor(body, "zh-Hans")).toBe("# 1.6.0\n\n新功能");
    expect(releaseNotesFor(body, "zh-Hant")).toBe("# 1.6.0\n\n新功能");
    expect(releaseNotesFor(body, "ja")).toBe("# 1.6.0\n\nNew features");
    expect(releaseNotesFor("只有中文", "en")).toBe("只有中文");
  });
});
