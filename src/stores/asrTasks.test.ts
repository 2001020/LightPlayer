import { describe, expect, it } from "vitest";
import { addTasks, finish, HISTORY_LIMIT, moveUp, nextQueued, queuePosition, restore, retry, type AsrTask, type AsrTaskInput } from "./asrTasks";

const input = (path: string): AsrTaskInput => ({ path, name: path, kind: "audio" });

describe("recognition queue", () => {
  it("queues in order and skips files already waiting", () => {
    let r = addTasks([], [input("a"), input("b")], 1);
    expect(r.added.map((t) => t.path)).toEqual(["a", "b"]);
    r = addTasks(r.tasks, [input("b"), input("c")], 2);
    expect(r.skipped).toBe(1);
    expect(r.tasks.map((t) => t.path)).toEqual(["a", "b", "c"]);
    expect(nextQueued(r.tasks)?.path).toBe("a");
  });

  it("runs one task at a time and reports queue places", () => {
    const { tasks } = addTasks([], [input("a"), input("b"), input("c")]);
    const running = tasks.map((t, i) => (i === 0 ? { ...t, status: "running" as const } : t));
    expect(nextQueued(running)).toBeUndefined();
    expect(queuePosition(running, "a")).toBe(0);
    expect(queuePosition(running, "c")).toBe(2);
    expect(queuePosition(running, "x")).toBeNull();
  });

  it("moves a queued task up past the previous queued one", () => {
    const { tasks } = addTasks([], [input("a"), input("b"), input("c")]);
    const moved = moveUp(tasks, tasks[2].id);
    expect(moved.map((t) => t.path)).toEqual(["a", "c", "b"]);
    expect(moveUp(moved, moved[0].id)).toBe(moved);
  });

  it("re-queues failed tasks and replaces old finished entries", () => {
    let { tasks } = addTasks([], [input("a")]);
    tasks = finish(tasks, tasks[0].id, { status: "failed", error: "x" }, 5);
    tasks = retry(tasks, tasks[0].id, 6);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ status: "queued", error: null, finishedAt: undefined });
    tasks = finish(tasks, tasks[0].id, { status: "done" }, 7);
    tasks = addTasks(tasks, [input("a")], 8).tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("queued");
  });

  it("puts interrupted work back in a paused queue after a restart", () => {
    const { tasks } = addTasks([], [input("a"), input("b")]);
    const r = restore([{ ...tasks[0], status: "running", stage: "transcribing", percent: 40 }, tasks[1]]);
    expect(r.paused).toBe(true);
    expect(r.tasks[0]).toMatchObject({ status: "queued", percent: 0 });
    expect(restore([]).paused).toBe(false);
  });

  it("keeps the finished history bounded", () => {
    let tasks: AsrTask[] = addTasks([], Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => input(`f${i}`))).tasks;
    tasks.forEach((t, i) => (tasks = finish(tasks, t.id, { status: "done" }, i)));
    expect(tasks).toHaveLength(HISTORY_LIMIT);
    expect(tasks.some((t) => t.path === "f0")).toBe(false);
  });
});
