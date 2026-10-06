// Replaces UI text by the plugins' string tables ({"原文": "替换文字"}).
//
// The UI is rendered by React with its Chinese text inline, so instead of
// routing every string through a lookup, a MutationObserver rewrites text as
// it appears. A text node is replaced when its trimmed text equals a key; an
// element whose children are all text nodes (JSX like `共 {n} 条` renders
// three of them) is matched as a whole. Keys may contain `{name}` placeholders.
// User content (lyrics, titles, file names, comments) is marked
// `data-lp-raw` and left alone, as are inputs and editable text.

const ATTRS = ["title", "placeholder", "aria-label", "data-tip"];
const SKIP = "[data-lp-raw], input, textarea, select, [contenteditable], script, style, svg";

export interface StringTable {
  exact: Map<string, string>;
  patterns: { re: RegExp; names: string[]; out: string }[];
}

export function compileStrings(table: Record<string, string>): StringTable {
  const exact = new Map<string, string>();
  const patterns: StringTable["patterns"] = [];
  for (const [rawKey, out] of Object.entries(table)) {
    const key = rawKey.trim();
    if (!key || typeof out !== "string") continue;
    if (!/\{[A-Za-z_][\w]*\}/.test(key)) {
      exact.set(key, out);
      continue;
    }
    const names: string[] = [];
    const src = key
      .split(/(\{[A-Za-z_]\w*\})/)
      .map((part) => {
        const m = /^\{([A-Za-z_]\w*)\}$/.exec(part);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        names.push(m[1]);
        return "(.+?)";
      })
      .join("");
    patterns.push({ re: new RegExp(`^${src}$`, "s"), names, out });
  }
  return { exact, patterns };
}

/** The replacement for `text` (whitespace around it kept), or null. */
export function translate(t: StringTable, text: string): string | null {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const core = m[2];
  if (!core) return null;
  let out = t.exact.get(core);
  if (out === undefined) {
    for (const p of t.patterns) {
      const hit = p.re.exec(core);
      if (!hit) continue;
      out = p.out.replace(/\{([A-Za-z_]\w*)\}/g, (all, name: string) => {
        const i = p.names.indexOf(name);
        return i >= 0 ? hit[i + 1] : all;
      });
      break;
    }
  }
  return out === undefined ? null : m[1] + out + m[3];
}

interface Rec {
  orig: string;
  wrote: string;
}

export class TextReplacer {
  private table: StringTable | null = null;
  private observer: MutationObserver | null = null;
  private texts = new WeakMap<Text, Rec>();
  private attrs = new WeakMap<Element, Map<string, Rec>>();
  private touched = new Set<Text | Element>();

  constructor(private root: HTMLElement) {}

  /** Applies a new table (null or empty: puts every original text back). */
  set(table: Record<string, string> | null) {
    this.restore();
    const compiled = table ? compileStrings(table) : null;
    this.table = compiled && (compiled.exact.size || compiled.patterns.length) ? compiled : null;
    if (!this.table) {
      this.observer?.disconnect();
      this.observer = null;
      return;
    }
    if (!this.observer) {
      this.observer = new MutationObserver((list) => this.onMutations(list));
      this.observer.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    this.scan(this.root);
  }

  stop() {
    this.set(null);
  }

  /** The text a node had before it was replaced. */
  private original(n: Text): string {
    const r = this.texts.get(n);
    return r && n.data === r.wrote ? r.orig : n.data;
  }

  private write(n: Text, orig: string, value: string) {
    if (value === orig) {
      this.texts.delete(n);
      this.touched.delete(n);
    } else {
      this.texts.set(n, { orig, wrote: value });
      this.touched.add(n);
    }
    if (n.data !== value) n.data = value;
  }

  private element(el: Element) {
    const t = this.table;
    if (!t || el.closest(SKIP)) return;
    const kids = el.childNodes;
    const texts: Text[] = [];
    let onlyText = kids.length > 0;
    for (const k of kids) {
      if (k.nodeType === Node.TEXT_NODE) texts.push(k as Text);
      else if (k.nodeType !== Node.COMMENT_NODE) onlyText = false;
    }
    if (texts.length > 1 && onlyText) {
      const origs = texts.map((n) => this.original(n));
      const joined = translate(t, origs.join(""));
      if (joined !== null) {
        texts.forEach((n, i) => this.write(n, origs[i], i === 0 ? joined : ""));
        return;
      }
    }
    for (const n of texts) {
      const orig = this.original(n);
      this.write(n, orig, translate(t, orig) ?? orig);
    }
  }

  private attribute(el: Element, name: string) {
    const t = this.table;
    if (!t || el.closest("[data-lp-raw]")) return;
    const cur = el.getAttribute(name);
    let recs = this.attrs.get(el);
    const rec = recs?.get(name);
    if (cur === null) {
      recs?.delete(name);
      return;
    }
    const orig = rec && cur === rec.wrote ? rec.orig : cur;
    const value = translate(t, orig) ?? orig;
    if (value === orig) {
      recs?.delete(name);
    } else {
      if (!recs) this.attrs.set(el, (recs = new Map()));
      recs.set(name, { orig, wrote: value });
      this.touched.add(el);
    }
    if (cur !== value) el.setAttribute(name, value);
  }

  private scan(root: Element) {
    this.element(root);
    for (const a of ATTRS) if (root.hasAttribute(a)) this.attribute(root, a);
    const all = root.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.firstChild) this.element(el);
      for (const a of ATTRS) if (el.hasAttribute(a)) this.attribute(el, a);
    }
  }

  private onMutations(list: MutationRecord[]) {
    const els = new Set<Element>();
    const attrs: [Element, string][] = [];
    for (const m of list) {
      if (m.type === "attributes") attrs.push([m.target as Element, m.attributeName!]);
      else if (m.type === "characterData") {
        const p = m.target.parentElement;
        if (p) els.add(p);
      } else {
        if (m.target.nodeType === Node.ELEMENT_NODE) els.add(m.target as Element);
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.ELEMENT_NODE) this.scan(n as Element);
        }
      }
    }
    for (const el of els) if (el.isConnected) this.element(el);
    for (const [el, a] of attrs) this.attribute(el, a);
    if (this.touched.size > 20000) this.prune();
    // Our own writes come back as mutations; drop them so they do not loop.
    this.observer?.takeRecords();
  }

  private prune() {
    for (const n of this.touched) if (!n.isConnected) this.touched.delete(n);
  }

  /** Puts the original text back everywhere it was replaced. */
  private restore() {
    for (const n of this.touched) {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = n as Text;
        const r = this.texts.get(t);
        if (r && t.data === r.wrote) t.data = r.orig;
        this.texts.delete(t);
      } else {
        const el = n as Element;
        for (const [name, r] of this.attrs.get(el) ?? []) {
          if (el.getAttribute(name) === r.wrote) el.setAttribute(name, r.orig);
        }
        this.attrs.delete(el);
      }
    }
    this.touched.clear();
    this.observer?.takeRecords();
  }
}
