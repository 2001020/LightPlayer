import { describe, expect, it } from "vitest";
import { detectWindows, keysFor } from "./platform";

describe("platform", () => {
  it("recognises WebView2 on Windows", () => {
    expect(detectWindows("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/129.0")).toBe(true);
    expect(detectWindows("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe(false);
  });

  it("keeps macOS shortcut labels", () => {
    expect(keysFor("⇧⌘N", false)).toBe("⇧⌘N");
  });

  it("spells shortcuts out with Ctrl on Windows", () => {
    expect(keysFor("⌘O", true)).toBe("Ctrl+O");
    expect(keysFor("⇧⌘N", true)).toBe("Ctrl+Shift+N");
    expect(keysFor("⌘,", true)).toBe("Ctrl+,");
    expect(keysFor("⌘← / ⌘→", true)).toBe("Ctrl+← / Ctrl+→");
    expect(keysFor("⌘+ / ⌘− / ⌘0", true)).toBe("Ctrl++ / Ctrl+− / Ctrl+0");
    expect(keysFor("J / L", true)).toBe("J / L");
    expect(keysFor("空格", true)).toBe("空格");
  });
});
