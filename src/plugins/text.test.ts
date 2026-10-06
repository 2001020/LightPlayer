// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { compileStrings, TextReplacer, translate } from "./text";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("translate", () => {
  const t = compileStrings({ 媒体库: "Library", "共 {n} 条": "{n} in total", "第 {i} 首，共 {n} 首": "{i} of {n}", " ": "x" });
  it("matches whole trimmed text and keeps the whitespace around it", () => {
    expect(translate(t, "媒体库")).toBe("Library");
    expect(translate(t, "  媒体库 ")).toBe("  Library ");
    expect(translate(t, "媒体库s")).toBeNull();
    expect(translate(t, "   ")).toBeNull();
  });
  it("fills placeholders", () => {
    expect(translate(t, "共 12,345 条")).toBe("12,345 in total");
    expect(translate(t, "第 3 首，共 10 首")).toBe("3 of 10");
    // A placeholder stands for at least one character.
    expect(translate(t, "共  条")).toBeNull();
  });
  it("translates what placeholders stand for, and tries the most specific pattern first", () => {
    const r = compileStrings({ "保存失败：{a}": "Save failed: {a}", 文件不存在: "File not found", "{a}失败：{b}": "{a} failed: {b}" });
    expect(translate(r, "保存失败：文件不存在")).toBe("Save failed: File not found");
    expect(translate(r, "保存失败：disk full")).toBe("Save failed: disk full");
  });
  it("counts line breaks as spaces", () => {
    const r = compileStrings({ "第一行\n第二行": "one two", "共 {n} 条": "{n} in total" });
    expect(translate(r, "第一行 第二行")).toBe("one two");
    expect(translate(r, "第一行\n  第二行")).toBe("one two");
  });
  it("skips text without Chinese when every key has some", () => {
    const r = compileStrings({ "{a} 首": "{a} songs" });
    expect(r.cjkOnly).toBe(true);
    expect(translate(r, "12:34")).toBeNull();
    expect(compileStrings({ LightPlayer: "x" }).cjkOnly).toBe(false);
  });
  it("treats regex characters in keys literally", () => {
    const r = compileStrings({ "A+B (x) {n}?": "ok {n}" });
    expect(translate(r, "A+B (x) 5?")).toBe("ok 5");
    expect(translate(r, "AAB (x) 5?")).toBeNull();
  });
});

describe("TextReplacer", () => {
  let r: TextReplacer | null = null;
  afterEach(() => {
    r?.stop();
    document.body.innerHTML = "";
  });

  it("replaces text, attributes and grouped text nodes, and puts them back", async () => {
    document.body.innerHTML = `
      <button data-tip="打开文件" aria-label="打开文件">媒体库</button>
      <p id="mixed">媒体库<b>媒体库</b></p>
      <span id="raw" data-lp-raw>媒体库</span>
      <input placeholder="搜索" value="媒体库">`;
    const span = document.createElement("span");
    span.append("共 ", "1,234", " 条");
    document.body.append(span);
    r = new TextReplacer(document.body);
    r.set({ 媒体库: "Library", 打开文件: "Open", 搜索: "Search", "共 {n} 条": "{n} total" });
    const btn = document.querySelector("button")!;
    expect(btn.textContent).toBe("Library");
    expect(btn.getAttribute("data-tip")).toBe("Open");
    expect(btn.getAttribute("aria-label")).toBe("Open");
    expect(document.querySelector("#mixed")!.textContent).toBe("LibraryLibrary");
    expect(document.querySelector("#raw")!.textContent).toBe("媒体库");
    expect(document.querySelector("input")!.getAttribute("placeholder")).toBe("Search");
    expect(document.querySelector("input")!.value).toBe("媒体库");
    expect(span.textContent).toBe("1,234 total");

    // React updates the middle text node: the group is matched again.
    (span.childNodes[1] as Text).data = "99";
    await flush();
    expect(span.textContent).toBe("99 total");

    // New content is translated as it appears.
    const added = document.createElement("div");
    added.innerHTML = "<i>打开文件</i>";
    document.body.append(added);
    await flush();
    expect(added.textContent).toBe("Open");

    // A text node changed to something else is left as is.
    btn.firstChild!.textContent = "设置";
    await flush();
    expect(btn.textContent).toBe("设置");

    r.set(null);
    expect(document.querySelector("#mixed")!.textContent).toBe("媒体库媒体库");
    expect(btn.getAttribute("data-tip")).toBe("打开文件");
    expect(document.querySelector("input")!.getAttribute("placeholder")).toBe("搜索");
    expect(span.textContent).toBe("共 99 条");
    expect(added.textContent).toBe("打开文件");
  });

  it("does not loop when a replacement is itself a key", async () => {
    document.body.innerHTML = `<b>甲</b><b>乙</b>`;
    r = new TextReplacer(document.body);
    r.set({ 甲: "乙", 乙: "甲" });
    await flush();
    await flush();
    const [a, b] = document.querySelectorAll("b");
    expect(a.textContent).toBe("乙");
    expect(b.textContent).toBe("甲");
    r.set({ 甲: "A" });
    expect(a.textContent).toBe("A");
    expect(b.textContent).toBe("乙");
  });
});
