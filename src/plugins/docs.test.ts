// The plugin standard (docs/plugins/README.md) lists the public interface;
// these tests keep it in step with the code.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_KEYS } from "./manifest";
import { BUILTIN_KINDS, EXTRA_KINDS } from "../layout/model";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const doc = read("docs/plugins/README.md");

/** The first-column `names` of a marked table in the standard. */
function section(name: string): string {
  const m = new RegExp(`<!-- ${name} -->([\\s\\S]*?)<!-- /${name} -->`).exec(doc);
  if (!m) throw new Error(`section ${name} missing`);
  return m[1];
}
const firstColumn = (text: string) =>
  text
    .split("\n")
    .filter((l) => l.startsWith("| `"))
    .flatMap((l) => [...l.split("|")[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]));

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? sources(p) : /\.tsx?$/.test(f) && !f.includes(".test.") ? [p] : [];
  });
}

describe("plugin standard", () => {
  it("documents exactly the data-lp anchors in the UI", () => {
    const used = new Set(sources("src").flatMap((f) => [...read(f).matchAll(/data-lp="([a-z-]+)"/g)].map((m) => m[1])));
    expect(firstColumn(section("anchors")).sort()).toEqual([...used].sort());
  });

  it("documents CSS variables that app.css defines", () => {
    const css = read("src/styles/app.css");
    const names = firstColumn(section("css-vars")).flatMap((n) => n.split(/\s*\/\s*/));
    expect(names.length).toBeGreaterThan(15);
    // Defined on :root, or (--lyric-hl) read with a fallback.
    for (const v of names) expect(css, v).toMatch(new RegExp(`${v}:|var\\(${v},`));
  });

  it("lists the same config keys as the code and the schema", () => {
    const documented = firstColumn(section("config-keys")).sort();
    expect(documented).toEqual(Object.keys(CONFIG_KEYS).sort());
    const schema = JSON.parse(read("docs/plugins/manifest.schema.json"));
    expect(Object.keys(schema.properties.config.properties).sort()).toEqual(documented);
    const rust = /CONFIG_KEYS: &\[&str\] = &\[([\s\S]*?)\];/.exec(read("src-tauri/src/plugins.rs"))![1];
    expect([...rust.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(documented);
  });

  it("documents the <html> state attributes that are set", () => {
    const attrs = firstColumn(section("root-attrs"));
    const code = read("src/App.tsx") + read("src/main.tsx") + read("src/hooks.tsx");
    for (const a of attrs) {
      const key = a.replace(/^data-/, "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      expect(code, a).toMatch(new RegExp(`\\.${key} =`));
    }
  });

  it("documents the layout element kinds the code knows", () => {
    const kinds = [...BUILTIN_KINDS, ...EXTRA_KINDS].sort();
    expect(firstColumn(section("layout-kinds")).sort()).toEqual(kinds);
    const schema = JSON.parse(read("docs/plugins/layout.schema.json"));
    expect([...schema.$defs.element.properties.kind.enum].sort()).toEqual(kinds);
    const rust = /const KINDS: &\[&str\] = &\[([\s\S]*?)\];/.exec(read("src-tauri/src/layouts.rs"))![1];
    expect([...rust.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(kinds);
  });

  it("example layouts follow the layout schema's fields", () => {
    const schema = JSON.parse(read("docs/plugins/layout.schema.json"));
    const allowed = Object.keys(schema.$defs.element.properties);
    const file = JSON.parse(read("examples/plugins/example.retro-turntable/layouts/turntable.json"));
    for (const e of file.elements) for (const k of Object.keys(e)) expect(allowed, `${e.id}.${k}`).toContain(k);
  });
});
