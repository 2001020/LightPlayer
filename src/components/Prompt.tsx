// Minimal text prompt (WKWebView has no window.prompt). `promptText()`
// resolves with the entered text, or null when cancelled.

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Icon } from "./Icon";

interface PromptState {
  title: string;
  placeholder: string;
  initial: string;
  ok: string;
  resolve: ((v: string | null) => void) | null;
}

const usePrompt = create<PromptState>(() => ({ title: "", placeholder: "", initial: "", ok: "确定", resolve: null }));

export function promptText(title: string, initial = "", opts: { placeholder?: string; ok?: string } = {}): Promise<string | null> {
  usePrompt.getState().resolve?.(null);
  return new Promise((resolve) =>
    usePrompt.setState({ title, initial, placeholder: opts.placeholder ?? "", ok: opts.ok ?? "确定", resolve }),
  );
}

export function PromptHost() {
  const { title, placeholder, initial, ok, resolve } = usePrompt();
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!resolve) return;
    setValue(initial);
    requestAnimationFrame(() => input.current?.select());
  }, [resolve, initial]);
  if (!resolve) return null;
  const done = (v: string | null) => {
    usePrompt.setState({ resolve: null });
    resolve(v);
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form
        className="dialog prompt"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) done(value.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            done(null);
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => done(null)} aria-label="关闭">
            <Icon name="close" />
          </button>
        </header>
        <div className="body">
          <input type="text" ref={input} value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} maxLength={80} />
        </div>
        <footer>
          <button type="button" className="btn" onClick={() => done(null)}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            {ok}
          </button>
        </footer>
      </form>
    </div>
  );
}
