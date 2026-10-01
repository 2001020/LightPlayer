import { describe, expect, it } from "vitest";
import { moveItem, nextIndex, nextMode, prevIndex, removeItem, shuffled, type QueueState } from "./queue";

const q = (over: Partial<QueueState>): QueueState => ({ length: 5, index: 0, mode: "sequential", order: [], history: [], ...over });

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe("queue", () => {
  it("cycles modes", () => {
    expect(nextMode("sequential")).toBe("loop");
    expect(nextMode("shuffle")).toBe("sequential");
  });

  it("sequential stops at the end only when auto-advancing", () => {
    expect(nextIndex(q({ index: 2 }), true).index).toBe(3);
    expect(nextIndex(q({ index: 4 }), true).index).toBeNull();
    expect(nextIndex(q({ index: 4 }), false).index).toBe(0);
  });

  it("loop wraps around", () => {
    expect(nextIndex(q({ index: 4, mode: "loop" }), true).index).toBe(0);
  });

  it("single repeats on auto but advances manually", () => {
    expect(nextIndex(q({ index: 2, mode: "single" }), true).index).toBe(2);
    expect(nextIndex(q({ index: 2, mode: "single" }), false).index).toBe(3);
  });

  it("shuffle plays every track once per round", () => {
    const rand = seeded(42);
    let state = q({ mode: "shuffle", index: 3, length: 6 });
    const seen = new Set([3]);
    for (let i = 0; i < 5; i++) {
      const r = nextIndex(state, true, rand);
      expect(r.index).not.toBeNull();
      seen.add(r.index!);
      state = { ...state, index: r.index!, order: r.order };
    }
    expect(seen.size).toBe(6);
    // Next round does not repeat the last track immediately.
    const r = nextIndex(state, true, rand);
    expect(r.index).not.toBe(state.index);
  });

  it("previous uses shuffle history", () => {
    expect(prevIndex(q({ mode: "shuffle", index: 4, history: [1, 3, 4] })).index).toBe(3);
    expect(prevIndex(q({ index: 0 })).index).toBe(4);
  });

  it("shuffled keeps a requested first element", () => {
    const s = shuffled(10, 7, seeded(1));
    expect(s[0]).toBe(7);
    expect([...s].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("moves items and keeps track of the playing one", () => {
    const items = ["a", "b", "c", "d"];
    expect(moveItem(items, 1, 0, 3)).toEqual({ items: ["b", "c", "d", "a"], index: 0 });
    expect(moveItem(items, 1, 1, 3)).toEqual({ items: ["a", "c", "d", "b"], index: 3 });
    expect(moveItem(items, 2, 3, 0)).toEqual({ items: ["d", "a", "b", "c"], index: 3 });
    expect(moveItem(items, 1, 2, 2).items).toBe(items);
  });

  it("removes items and picks what plays next", () => {
    const items = ["a", "b", "c"];
    expect(removeItem(items, 1, 0)).toEqual({ items: ["b", "c"], index: 0, removedCurrent: false });
    expect(removeItem(items, 1, 2)).toEqual({ items: ["a", "b"], index: 1, removedCurrent: false });
    expect(removeItem(items, 1, 1)).toEqual({ items: ["a", "c"], index: 1, removedCurrent: true });
    expect(removeItem(items, 2, 2)).toEqual({ items: ["a", "b"], index: 1, removedCurrent: true });
  });
});
