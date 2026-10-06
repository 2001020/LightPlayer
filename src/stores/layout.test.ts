import { beforeEach, describe, expect, it } from "vitest";
import {
  activeLayout,
  addElement,
  cancelEditing,
  deleteLayout,
  duplicateElement,
  finishEditing,
  redo,
  removeElement,
  setActiveLayout,
  setPluginLayouts,
  startEditing,
  undo,
  updateElement,
  useLayouts,
} from "./layout";
import { checkLayout, defaultElement } from "../layout/model";

const draft = () => useLayouts.getState().draft!;
const el = (id: string) => draft().elements.find((e) => e.id === id)!;

beforeEach(() => {
  useLayouts.setState({ custom: [], active: "default", plugin: [], draft: null, draftFrom: null, selected: null, past: [], future: [] });
});

describe("layout editor", () => {
  it("turns the classic page into free elements and saves a new layout", () => {
    startEditing(() => [{ ...defaultElement("cover"), x: 30 }]);
    expect(draft().name).toBe("我的布局");
    expect(el("cover").x).toBe(30);
    // Every built-in part is there (unmeasured ones hidden).
    expect(draft().elements).toHaveLength(6);
    updateElement("cover", (e) => (e.cover!.shape = "vinyl"));
    finishEditing();
    const s = useLayouts.getState();
    expect(s.draft).toBeNull();
    expect(s.custom.map((l) => [l.id, l.name])).toEqual([["custom-1", "我的布局"]]);
    expect(activeLayout().elements.find((e) => e.kind === "cover")!.cover!.shape).toBe("vinyl");
  });

  it("saves edits of a built-in layout as a copy, and of one's own in place", () => {
    setActiveLayout("vinyl");
    startEditing();
    updateElement("title", (e) => (e.y = 70));
    finishEditing();
    let s = useLayouts.getState();
    expect(s.active).toBe("custom-1");
    expect(s.custom[0].name).toBe("黑胶唱片机（自定义）");
    startEditing();
    updateElement("title", (e) => (e.y = 60));
    finishEditing();
    s = useLayouts.getState();
    expect(s.custom).toHaveLength(1);
    expect(s.custom[0].elements.find((e) => e.id === "title")!.y).toBe(60);
  });

  it("undoes and redoes, one step per drag or slider", () => {
    setActiveLayout("vinyl");
    startEditing();
    const y0 = el("title").y;
    updateElement("title", (e) => (e.y = 1));
    updateElement("title", (e) => (e.y = 2), false);
    updateElement("title", (e) => (e.y = 3), false);
    updateElement("title", (e) => (e.text!.size = 3), true, "size");
    updateElement("title", (e) => (e.text!.size = 4), true, "size");
    expect(useLayouts.getState().past).toHaveLength(2);
    undo();
    expect([el("title").y, el("title").text!.size]).toEqual([3, 4.2]);
    undo();
    expect(el("title").y).toBe(y0);
    redo();
    expect(el("title").y).toBe(3);
    useLayouts.setState({ sample: true });
    cancelEditing();
    expect(useLayouts.getState().draft).toBeNull();
    // The sample song goes with the editor.
    expect(useLayouts.getState().sample).toBe(false);
    expect(activeLayout().id).toBe("vinyl");
  });

  it("adds, copies and removes elements; built-in ones are only hidden", () => {
    setActiveLayout("vinyl");
    startEditing();
    const id = addElement("text");
    expect(id).toBe("text-1");
    expect(useLayouts.getState().selected).toBe(id);
    const copy = duplicateElement(id)!;
    expect(copy).toBe("text-2");
    expect(duplicateElement("cover")).toBeNull();
    removeElement(id);
    expect(draft().elements.some((e) => e.id === id)).toBe(false);
    removeElement("cover");
    expect(el("cover").hidden).toBe(true);
  });

  it("falls back to the default when the shown layout goes away", () => {
    const l = checkLayout({ name: "P", elements: [{ id: "cover", kind: "cover" }] }, "")!;
    setPluginLayouts([{ ...l, id: "plugin:com.x.y:0", plugin: "com.x.y" }]);
    setActiveLayout("plugin:com.x.y:0");
    expect(activeLayout().name).toBe("P");
    setPluginLayouts([]);
    expect(activeLayout().id).toBe("default");
    // Back when the plugin is enabled again.
    setPluginLayouts([{ ...l, id: "plugin:com.x.y:0", plugin: "com.x.y" }]);
    expect(activeLayout().name).toBe("P");

    setActiveLayout("vinyl");
    startEditing();
    finishEditing();
    deleteLayout("custom-1");
    expect(useLayouts.getState().active).toBe("default");
  });
});
