/**
 * The host (`mount`), not the components: which engine a mount shows as its options change, what it
 * touches in the DOM, and how often it renders a component.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { Engine } from "@gistui/headless/engine";
import type { Runtime } from "@gistui/core";
import { componentLibrary, h, libraryOf, mount, setAttrs, syncChildren, syncOptions, type DomContext, type DomRenderer, type GistUIMount, type MountOptions } from "../src/index";
import { lazyGroup, lazyModule } from "../src/lazy";
import { ui } from "../src/ui";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await tick(5);
};

/** A stream fed by hand (a late push into a stream nobody reads any more is ignored). */
function manual() {
  let c!: ReadableStreamDefaultController<string>;
  const stream = new ReadableStream<string>({ start: (x) => void (c = x) });
  const quiet = (fn: () => void) => {
    try {
      fn();
    } catch {}
  };
  return { stream, push: (text: string) => quiet(() => c.enqueue(text)), close: () => quiet(() => c.close()) };
}

/** A container renderer that counts how often it is created and updated. */
function counting(tag: keyof HTMLElementTagNameMap = "div") {
  const calls = { created: 0, updated: 0 };
  const render: DomRenderer = (ctx) => {
    calls.created++;
    const el = h(tag, { "data-type": ctx.type });
    ctx.place(el);
    return {
      el,
      update(c) {
        calls.updated++;
        c.place(el);
        return true;
      },
    };
  };
  return { calls, render };
}

const titles = (host: Element) => [...host.querySelectorAll(".gistui-header__title")].map((t) => t.textContent);
const COUNTER = `$n = 0\nroot = Page(Button("Inc", do:[@set($n, $n + 1), @send("n is " + $n)]), Text("n=" + $n))\n`;

describe("input: stream and source", () => {
  test("a new stream passed to update() starts a new render", async () => {
    const host = document.createElement("div");
    const a = manual();
    const b = manual();
    const view = mount(host, { library: ui, stream: a.stream });
    a.push(`root = Card(Header("One"))\n`);
    await until(() => titles(host).length > 0);
    expect(titles(host)).toEqual(["One"]);
    view.update({ stream: b.stream });
    b.push(`root = Card(Header("Two"))\n`);
    b.close();
    await until(() => titles(host)[0] === "Two");
    expect(titles(host)).toEqual(["Two"]);
    // The same stream again changes nothing.
    const card = host.querySelector(".gistui-card");
    view.update({ stream: b.stream });
    expect(host.querySelector(".gistui-card")).toBe(card);
    view.destroy();
  });

  test("switching from a stream to a source starts over and lets go of the stream", async () => {
    const host = document.createElement("div");
    const s = manual();
    const errors: unknown[][] = [];
    const disposed: Engine[] = [];
    const dispose = Engine.prototype.dispose;
    Engine.prototype.dispose = function (this: Engine) {
      disposed.push(this);
      dispose.call(this);
    };
    try {
      const view = mount(host, { library: ui, stream: s.stream, autofix: false, onError: (e) => errors.push(e) });
      s.push(`root = Page(Header("From stream"), more)\n`);
      await until(() => titles(host).length > 0);
      const source = `root = Card(Header("From source"))\n`;
      view.update({ stream: null, source });
      expect(titles(host)).toEqual(["From source"]);
      expect(host.querySelector(".gistui-page")).toBeNull();
      expect(host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
      expect(errors).toEqual([[]]);
      // The stream ending later is nobody's business any more: no second report, nothing shown.
      s.push(`more = Header("late")\n`);
      s.close();
      await tick(20);
      expect(titles(host)).toEqual(["From source"]);
      expect(errors).toEqual([[]]);
      // The source has an engine of its own, and destroy() disposes that one.
      const own = () => disposed.filter((e) => e.consumed === source).length;
      expect(own()).toBe(0);
      view.destroy();
      expect(own()).toBe(1);
    } finally {
      Engine.prototype.dispose = dispose;
    }
  });

  test("a stream after a source, and no input at all after a stream", async () => {
    const host = document.createElement("div");
    const s = manual();
    const view = mount(host, { library: ui, source: `root = Card(Header("Source"))\n` });
    view.update({ stream: s.stream });
    expect(titles(host)).toEqual([]);
    expect(host.querySelector(".gistui")!.getAttribute("aria-busy")).toBe("true");
    s.push(`root = Card(Header("Stream"))\n`);
    await until(() => titles(host).length > 0);
    expect(titles(host)).toEqual(["Stream"]);
    view.update({ stream: undefined, source: undefined });
    expect(titles(host)).toEqual([]);
    expect(host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    view.destroy();
  });
});

describe("options", () => {
  test("an option set to undefined is unset: the default applies again", () => {
    const host = document.createElement("div");
    const view = mount(host, { library: ui, source: `root = Card(Header("x"))\n`, theme: "dark", color: "teal", className: "mine", tokens: { primary: "#0f766e" }, classNames: { Card: "p-8" } });
    const root = host.querySelector(".gistui")!;
    expect(root.querySelector("style")).not.toBeNull();
    view.update({ theme: undefined, color: undefined, className: undefined, tokens: undefined, classNames: undefined });
    expect([root.getAttribute("data-gistui-theme"), root.getAttribute("data-gistui-color"), root.getAttribute("data-gistui-scope"), root.className]).toEqual(["system", null, null, "gistui"]);
    expect(root.querySelector("style")).toBeNull();
    expect(host.querySelector(".gistui-card")!.className).toBe("gistui-card");
    // The library cannot be unset.
    view.update({ library: undefined });
    expect(titles(host)).toEqual(["x"]);
    view.destroy();
  });

  test("`inline` changing parses a source again, in the other mode", () => {
    const host = document.createElement("div");
    const prose: string[] = [];
    // Outside the fence: a statement for a whole-answer program, chat text for an inline one.
    const source = "note = Header(\"Outside\")\n```gistui\nroot = Page(note, Header(\"Inside\"))\n```\n";
    const view = mount(host, { library: ui, source, autofix: false, onProse: (t) => prose.push(t) });
    expect(titles(host)).toEqual(["Outside", "Inside"]);
    expect(prose).toEqual([]);
    view.update({ inline: true });
    expect(titles(host)).toEqual(["Inside"]);
    expect(prose.join("")).toContain("Outside");
    view.update({ inline: undefined });
    expect(titles(host)).toEqual(["Outside", "Inside"]);
    view.destroy();
  });

  test("tools, handlers and `openLinks` are read when they are used", async () => {
    const host = document.createElement("div");
    const seen: unknown[] = [];
    const opened: unknown[] = [];
    const open = window.open;
    window.open = ((url: string) => (opened.push(url), null)) as typeof window.open;
    try {
      const view = mount(host, {
        library: ui,
        source: `root = Page(Button("Load", do:[@run(q)]), Button("Site", do:[@open("https://example.com")]), Text("" + q))\nq = @query("load", {}, default:"none")\n`,
        tools: { load: async () => (seen.push("first"), 1) },
        openLinks: false,
      });
      await until(() => seen.length === 1);
      const [load, site] = [...host.querySelectorAll<HTMLButtonElement>(".gistui-button")];
      view.update({ tools: { load: async () => (seen.push("second"), 2) } });
      load!.click();
      await until(() => seen.length === 2);
      expect(seen).toEqual(["first", "second"]);
      site!.click();
      await tick(5);
      expect(opened).toEqual([]);
      view.update({ openLinks: undefined });
      site!.click();
      await until(() => opened.length > 0);
      expect(opened).toEqual(["https://example.com"]);
      view.destroy();
    } finally {
      window.open = open;
    }
  });

  test("`mutations` run from a click, `tools` do not serve them, and `onToolCall` can refuse a call", async () => {
    const host = document.createElement("div");
    const called: string[] = [];
    const actions: { type: string; code?: string }[] = [];
    let allow = true;
    const view = mount(host, {
      library: ui,
      source: `root = Page(Button("Save", do:[@run(save)]))\nsave = @mutation("save_goal", {goal: 5})\n`,
      tools: { save_goal: async () => (called.push("as a read-only tool"), 0) },
      onToolCall: (call) => (called.push(`asked: ${call.kind} ${call.name}`), allow),
      onAction: (a) => actions.push(a),
    });
    const button = host.querySelector<HTMLButtonElement>(".gistui-button")!;
    // Not in `mutations` yet: a tool given for reading is not reachable from @mutation.
    button.click();
    await until(() => actions.length > 0);
    expect([called, actions.map((a) => a.code)]).toEqual([[], ["tool-not-found"]]);
    view.update({ mutations: { save_goal: async () => (called.push("saved"), 1) } });
    button.click();
    await until(() => called.includes("saved"));
    expect(called).toEqual(["asked: mutation save_goal", "saved"]);
    allow = false;
    button.click();
    await until(() => actions.length > 1);
    expect(called.filter((c) => c === "saved").length).toBe(1);
    view.destroy();
  });

  test("syncOptions sends exactly the options that differ, and undefined for one that is gone", () => {
    const calls: Partial<MountOptions>[] = [];
    const view: GistUIMount = { element: document.createElement("div"), update: (o) => void calls.push(o), destroy() {} };
    const tools = { a: async () => 1 };
    const prev = { library: ui, color: "teal", theme: "dark" as const, source: "a", lockUntil: "done" as const };
    syncOptions(view, prev, { ...prev });
    expect(calls).toEqual([]);
    syncOptions(view, prev, { library: ui, theme: "dark", source: "ab", lockUntil: "ready", tools });
    expect(calls).toEqual([{ color: undefined, source: "ab", lockUntil: "ready", tools }]);
    expect(Object.keys(calls[0]!).sort()).toEqual(["color", "lockUntil", "source", "tools"]);
  });

  test("componentLibrary: one renderer per component, and the same entries give the same library", () => {
    const made: string[] = [];
    const A = { name: "A" };
    const B = { name: "B" };
    const withComponents = componentLibrary((c: { name: string }) => (made.push(c.name), (ctx) => ({ el: h("div", { "data-by": c.name, "data-type": ctx.type }) })));
    expect(withComponents(ui, undefined)).toBe(ui);
    const lib = withComponents(ui, { Card: A });
    expect(withComponents(ui, { Card: A })).toBe(lib);
    expect(lib.core).toBe(ui.core);
    const next = withComponents(ui, { Card: A, Header: B });
    expect(next).not.toBe(lib);
    expect(next.components.get("Card")).toBe(lib.components.get("Card")!);
    expect(made).toEqual(["A", "B"]);
    // Another base library is another library.
    const other = libraryOf(ui.core, new Map());
    expect(withComponents(other, { Card: A, Header: B })).not.toBe(next);
  });
});

describe("library changes", () => {
  const Plain: DomRenderer = (ctx) => {
    const el = h("p", { class: "plain" }, String(ctx.props.content ?? ""));
    return { el };
  };

  test("stream mode: new renderers keep the engine, and actions still run", async () => {
    const host = document.createElement("div");
    const s = manual();
    const actions: unknown[] = [];
    const view = mount(host, { library: ui, stream: s.stream, onAction: (a) => actions.push(a) });
    s.push(COUNTER);
    s.close();
    await until(() => host.querySelector(".gistui-button") !== null && !host.querySelector(".gistui")!.hasAttribute("aria-busy"));
    const button = host.querySelector<HTMLButtonElement>(".gistui-button")!;
    view.update({ library: ui.extend({ Text: Plain }) });
    // Only the component whose renderer changed is built again.
    expect(host.querySelector(".gistui-button")).toBe(button);
    expect(host.querySelector(".plain")!.textContent).toBe("n=0");
    expect(host.querySelector(".gistui-text")).toBeNull();
    button.click();
    await until(() => host.querySelector(".plain")!.textContent === "n=1");
    expect(host.querySelector(".plain")!.textContent).toBe("n=1");
    expect(actions).toEqual([{ type: "send", message: "n is 1", nodeId: expect.any(String) }]);
    // Other schemas too: a stream cannot be read again, so the program stays as it was parsed.
    view.update({ library: libraryOf({ ...ui.core }, ui.components) });
    expect(host.querySelector(".gistui-button")).toBe(button);
    button.click();
    await until(() => host.querySelector(".gistui-text")?.textContent === "n=2");
    expect(host.querySelector(".gistui-text")!.textContent).toBe("n=2");
    view.destroy();
  });

  test("source mode: new renderers keep state and untouched components; new schemas start over", async () => {
    const host = document.createElement("div");
    const view = mount(host, { library: ui, source: COUNTER });
    const button = host.querySelector<HTMLButtonElement>(".gistui-button")!;
    button.click();
    await until(() => host.querySelector(".gistui-text")!.textContent === "n=1");
    view.update({ library: ui.extend({ Text: Plain }) });
    expect(host.querySelector(".gistui-button")).toBe(button);
    expect(host.querySelector(".plain")!.textContent).toBe("n=1");
    // A library with other schemas parses the source again: a new program, with its initial state.
    view.update({ library: libraryOf({ ...ui.core }, ui.components) });
    expect(host.querySelector(".gistui-button")).not.toBe(button);
    expect(host.querySelector(".gistui-text")!.textContent).toBe("n=0");
    host.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    await until(() => host.querySelector(".gistui-text")!.textContent === "n=1");
    expect(host.querySelector(".gistui-text")!.textContent).toBe("n=1");
    view.destroy();
  });
});

describe("one stream, several mounts", () => {
  test("destroy and mount again before the root arrives: the new mount renders", async () => {
    const s = manual();
    const first = document.createElement("div");
    const second = document.createElement("div");
    mount(first, { library: ui, stream: s.stream }).destroy();
    const view = mount(second, { library: ui, stream: s.stream });
    s.push(`root = Card(Header("Hello"))\n`);
    s.close();
    await until(() => titles(second).length > 0);
    expect(titles(second)).toEqual(["Hello"]);
    expect(second.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    view.destroy();
  });

  const handlers = () => {
    const seen: unknown[] = [];
    return {
      seen,
      options: {
        onAction: (a: { type: string }) => seen.push(a.type),
        onStateChange: (name: string, value: unknown) => seen.push([name, value]),
        onFlush: () => seen.push("flush"),
        tools: { ping: async () => (seen.push("tool"), "pong") },
      },
    };
  };
  // A state change, an action, and a query that is run again on a click.
  const PROGRAM = `$n = 0\nroot = Page(Button("Go", do:[@set($n, $n + 1), @send("go"), @run(pong)]), Text("n=" + $n), Text("" + pong))\npong = @query("ping", {}, default:"none")\n`;

  test("mount again after the stream finished: events, flushes and tools reach the new mount", async () => {
    const s = manual();
    const first = document.createElement("div");
    const second = document.createElement("div");
    const a = handlers();
    const b = handlers();
    const one = mount(first, { library: ui, stream: s.stream, ...a.options });
    s.push(PROGRAM);
    s.close();
    await until(() => first.querySelector(".gistui-button") !== null && !first.querySelector(".gistui")!.hasAttribute("aria-busy"));
    one.destroy();
    const two = mount(second, { library: ui, stream: s.stream, ...b.options });
    a.seen.length = 0;
    second.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    await until(() => b.seen.includes("tool"));
    expect(second.querySelector(".gistui-text")!.textContent).toBe("n=1");
    expect(b.seen).toEqual(expect.arrayContaining([["n", 1], "send", "tool"]));
    expect(a.seen).toEqual([]);
    two.destroy();
  });

  test("mount again long after the last mount left: the program is shown again, and works", async () => {
    const s = manual();
    const first = document.createElement("div");
    const second = document.createElement("div");
    const b = handlers();
    const one = mount(first, { library: ui, stream: s.stream });
    s.push(PROGRAM);
    s.close();
    await until(() => first.querySelector(".gistui-button") !== null && !first.querySelector(".gistui")!.hasAttribute("aria-busy"));
    one.destroy();
    // The run is let go of (and its engine disposed) once nothing has shown it for a moment.
    await tick(20);
    const two = mount(second, { library: ui, stream: s.stream, ...b.options });
    expect(second.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    second.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    await until(() => b.seen.includes("send") && b.seen.includes("tool"));
    expect(second.querySelector(".gistui-text")!.textContent).toBe("n=1");
    expect(b.seen).toEqual(expect.arrayContaining([["n", 1], "send", "tool"]));
    two.destroy();
  });

  test("two mounts of one stream at once both render it", async () => {
    const s = manual();
    const first = document.createElement("div");
    const second = document.createElement("div");
    const one = mount(first, { library: ui, stream: s.stream });
    const two = mount(second, { library: ui, stream: s.stream });
    s.push(`root = Card(Header("Both"))\n`);
    s.close();
    await until(() => titles(first).length > 0 && titles(second).length > 0);
    expect([titles(first), titles(second)]).toEqual([["Both"], ["Both"]]);
    one.destroy();
    two.destroy();
  });
  test("a mount destroyed from another mount's callback is not rendered or told anything after that", async () => {
    const s = manual();
    const first = document.createElement("div");
    const second = document.createElement("div");
    const header = counting();
    const library = ui.extend({ Header: header.render });
    const told: string[] = [];
    let two: GistUIMount | undefined;
    const one = mount(first, { library, stream: s.stream, autofix: false, onFlush: () => two?.destroy(), onError: () => told.push("first") });
    two = mount(second, { library, stream: s.stream, autofix: false, onError: () => told.push("second") });
    s.push(`root = Page(Header("Only once"))\n`);
    await until(() => header.calls.created > 0);
    s.close();
    await until(() => told.length > 0);
    expect(header.calls.created).toBe(1);
    expect(second.children.length).toBe(0);
    expect(told).toEqual(["first"]);
    one.destroy();
  });

  test("a mount destroyed when the stream ends, by an earlier mount's onError, gets no onError", async () => {
    const s = manual();
    const told: string[] = [];
    let two: GistUIMount | undefined;
    const one = mount(document.createElement("div"), { library: ui, stream: s.stream, autofix: false, onError: () => (told.push("first"), two?.destroy()) });
    two = mount(document.createElement("div"), { library: ui, stream: s.stream, autofix: false, onError: () => told.push("second") });
    s.push(`root = Page(Header("x"))\n`);
    s.close();
    await until(() => told.length > 0);
    await tick(5);
    expect(told).toEqual(["first"]);
    one.destroy();
  });
});

describe("the DOM it touches", () => {
  test("syncChildren moves nothing that stays: a focused input keeps focus when an earlier sibling goes", () => {
    const box = document.createElement("div");
    document.body.append(box);
    const [a, b] = [h("p"), h("p")];
    const input = h("input");
    box.append(a, input, b);
    input.focus();
    syncChildren(box, [input, b]);
    expect([...box.childNodes]).toEqual([input, b]);
    expect(document.activeElement).toBe(input);
    // Replacing an earlier sibling keeps it too.
    const c = h("p");
    syncChildren(box, [c, input, b]);
    const d = h("p");
    syncChildren(box, [d, input, b]);
    expect([...box.childNodes]).toEqual([d, input, b]);
    expect(document.activeElement).toBe(input);
    // Reordering still works.
    syncChildren(box, [b, d, input]);
    expect([...box.childNodes]).toEqual([b, d, input]);
    syncChildren(box, []);
    expect(box.childNodes.length).toBe(0);
    box.remove();
  });

  test("syncChildren: 30 children resolving in order cost 30 insertions", () => {
    const box = document.createElement("div");
    const list: Node[] = Array.from({ length: 30 }, () => h("div", { class: "gistui-skeleton" }));
    syncChildren(box, list);
    let inserts = 0;
    const insertBefore = box.insertBefore.bind(box);
    box.insertBefore = ((n: Node, ref: Node | null) => (inserts++, insertBefore(n, ref))) as typeof box.insertBefore;
    for (let i = 0; i < 30; i++) {
      list[i] = h("section");
      syncChildren(box, list);
    }
    expect([...box.childNodes] as Node[]).toEqual(list);
    expect(inserts).toBe(30);
  });

  test("a focused input keeps focus while an earlier section streams in", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const src = `root = Page(intro, Input("name", "Name"))\n`;
    const view = mount(host, { library: ui, source: src, streaming: true, lockUntil: "ready" });
    expect(host.querySelector(".gistui-skeleton")).not.toBeNull();
    const input = host.querySelector<HTMLInputElement>('input[name="name"]')!;
    input.focus();
    expect(document.activeElement).toBe(input);
    view.update({ source: `${src}intro = Header("Welcome")\n` });
    expect(titles(host)).toEqual(["Welcome"]);
    expect(document.activeElement).toBe(input);
    view.destroy();
    host.remove();
  });

  test("what a component appends to the root (an open lightbox) survives flushes and look changes", () => {
    const host = document.createElement("div");
    const src = `root = Page(Header("One"), more)\n`;
    const view = mount(host, { library: ui, source: src, streaming: true });
    const root = host.querySelector(".gistui")!;
    const dialog = document.createElement("dialog");
    root.append(dialog);
    view.update({ source: `${src}more = Header("Two")\n` });
    expect(dialog.parentNode).toBe(root);
    view.update({ color: "teal" });
    expect(dialog.parentNode).toBe(root);
    // A scoped <style> arrives: it goes first, the program next, the dialog stays last.
    view.update({ tokens: { primary: "#0f766e" } });
    expect([...root.children].map((c) => c.className || c.tagName)).toEqual(["STYLE", "gistui-page", "DIALOG"]);
    view.update({ tokens: undefined, source: `root = Card(Header("Other"))\n`, streaming: false });
    expect([...root.children].map((c) => c.className || c.tagName)).toEqual(["gistui-card", "DIALOG"]);
    view.destroy();
    expect(host.children.length).toBe(0);
  });

  test("setAttrs does not write an attribute that already has the value", () => {
    const el = h("div", { "data-a": "1", hidden: true });
    let writes = 0;
    const setAttribute = el.setAttribute.bind(el);
    el.setAttribute = (k: string, v: string) => (writes++, setAttribute(k, v));
    setAttrs(el, { "data-a": "1", hidden: true, "data-b": undefined });
    expect(writes).toBe(0);
    setAttrs(el, { "data-a": 2, hidden: false, "data-b": "x" });
    expect(writes).toBe(2);
    expect([el.getAttribute("data-a"), el.hasAttribute("hidden"), el.getAttribute("data-b")]).toEqual(["2", false, "x"]);
  });
});

describe("where children are placed", () => {
  const SRC = `root = Card(a, b)\na = Header("A")\n`;

  test("a component that places its children once keeps getting them (as in the README)", () => {
    const host = document.createElement("div");
    const Card: DomRenderer = (ctx) => {
      const el = h("section", { class: "my-card" });
      ctx.place(el);
      return { el, update: () => true };
    };
    const view = mount(host, { library: ui.extend({ Card }), source: SRC, streaming: true });
    view.update({ source: `${SRC}b = Header("B")\n`, streaming: false });
    expect(titles(host.querySelector(".my-card")!)).toEqual(["A", "B"]);
    view.destroy();
  });

  // A child without `update`: every change gives it a new element, which its parent has to place.
  let runtime!: Runtime;
  const Header: DomRenderer = (ctx) => ((runtime = ctx.runtime), { el: h("h2", { class: "gistui-header__title" }, String(ctx.props.title ?? "")) });
  const slots = (c: DomContext) => c.childList.map((e) => h("div", { class: "slot" }, ...e.nodes));
  // `$k` changes the Card (v: card, then sunk), `$n` its first child.
  const STATE = `$n = 0\n$k = 0\nroot = Card(Header("A" + $n), Header("B"), v:$k == 0 ? "card" : "sunk")\n`;

  test("children follow the component from one element to another, and back", () => {
    const host = document.createElement("div");
    const [one, two] = [h("div"), h("div")];
    const Card: DomRenderer = (ctx) => {
      const el = h("section");
      const apply = (c: DomContext) => {
        const box = c.props.v === "card" ? one : two;
        c.place(box);
        syncChildren(el, [box]);
      };
      apply(ctx);
      return { el, update: (c) => (apply(c), true) };
    };
    const view = mount(host, { library: ui.extend({ Card, Header }), source: STATE });
    expect([titles(one), titles(two)]).toEqual([["A0", "B"], []]);
    runtime.setState("k", 1);
    expect([titles(one), titles(two)]).toEqual([[], ["A0", "B"]]);
    runtime.setState("k", 0);
    expect([titles(one), titles(two)]).toEqual([["A0", "B"], []]);
    // A child gets a new element: it goes where the children are now, not where they once were.
    runtime.setState("n", 1);
    expect([titles(one), titles(two)]).toEqual([["A1", "B"], []]);
    view.destroy();
  });

  test("a new instance (update returned false) does not inherit the old one's container", () => {
    const host = document.createElement("div");
    const boxes: Element[] = [];
    // The first instance places its children; the one that replaces it lays them out by hand.
    const Card: DomRenderer = (ctx) => {
      const el = h("section");
      boxes.push(el);
      if (boxes.length === 1) {
        ctx.place(el);
        return { el, update: () => false };
      }
      syncChildren(el, slots(ctx));
      return { el, update: () => true };
    };
    const view = mount(host, { library: ui.extend({ Card, Header }), source: STATE });
    expect(titles(boxes[0]!)).toEqual(["A0", "B"]);
    runtime.setState("k", 1);
    expect(boxes.length).toBe(2);
    runtime.setState("n", 1);
    expect(boxes[0]!.childNodes.length).toBe(0);
    expect([...host.querySelectorAll(".slot")].map((s) => titles(s))).toEqual([["A1"], ["B"]]);
    view.destroy();
  });

  test("a component that stops placing and lays its children out itself keeps them where it put them", () => {
    const host = document.createElement("div");
    const fields = h("div", { class: "fields" });
    // Like a Form that becomes a step form: `place` at first, one slot per child once `v` changes.
    const Card: DomRenderer = (ctx) => {
      const el = h("section");
      const draw = (c: DomContext) => {
        if (c.props.v === "card") {
          c.place(fields);
          syncChildren(el, [fields]);
        } else syncChildren(el, slots(c));
      };
      draw(ctx);
      return { el, update: (c) => (draw(c), true) };
    };
    const view = mount(host, { library: ui.extend({ Card, Header }), source: STATE });
    expect(titles(fields)).toEqual(["A0", "B"]);
    runtime.setState("k", 1);
    expect(host.querySelectorAll(".slot").length).toBe(2);
    runtime.setState("n", 1);
    expect(fields.childNodes.length).toBe(0);
    expect([...host.querySelectorAll(".slot")].map((s) => titles(s))).toEqual([["A1"], ["B"]]);
    view.destroy();
  });

  test("a child that arrives later reaches a component that placed its children once", () => {
    const host = document.createElement("div");
    const Card: DomRenderer = (ctx) => {
      const el = h("section", { class: "my-card" });
      ctx.place(el);
      return { el, update: () => true };
    };
    // The statement is still being written: its second child is not there yet.
    const view = mount(host, { library: ui.extend({ Card }), source: `root = Card(Header("A"), `, streaming: true });
    const card = host.querySelector(".my-card")!;
    expect(titles(card)).toEqual(["A"]);
    view.update({ source: `root = Card(Header("A"), Header("B"))\n`, streaming: false });
    expect(host.querySelector(".my-card")).toBe(card);
    expect(titles(card)).toEqual(["A", "B"]);
    view.destroy();
  });
  test("a component that lays out `children` itself (no place, no watch) gets them as they arrive", () => {
    const host = document.createElement("div");
    let updates = 0;
    const Card: DomRenderer = (ctx) => {
      const el = h("section", { class: "my-card" });
      syncChildren(el, ctx.children);
      return { el, update: (c) => (updates++, syncChildren(el, c.children), true) };
    };
    const src = `root = Card(a, b)\n`;
    const view = mount(host, { library: ui.extend({ Card }), source: src, streaming: true });
    const card = host.querySelector(".my-card")!;
    expect(card.querySelectorAll(".gistui-skeleton").length).toBe(2);
    view.update({ source: `${src}a = Header("A")\n` });
    expect([titles(card), card.querySelectorAll(".gistui-skeleton").length]).toEqual([["A"], 1]);
    view.update({ source: `${src}a = Header("A")\nb = Header("B")\n`, streaming: false });
    expect([titles(card), card.querySelectorAll(".gistui-skeleton").length]).toEqual([["A", "B"], 0]);
    expect(updates).toBe(2);
    view.destroy();
  });

  test("a component that could not be shown is tried again when a child arrives, and when the stream ends", () => {
    const host = document.createElement("div");
    let tries = 0;
    // Refuses a child that is still pending, and (second variant) to render while streaming.
    const Card: DomRenderer = (ctx) => {
      tries++;
      if (ctx.childList.some((e) => e.node?.type === "#pending")) throw new Error("not yet");
      if (ctx.props.v === "sunk" && ctx.runtime.view("late") === undefined) throw new Error("still streaming");
      const el = h("section", { class: "my-card" });
      ctx.place(el);
      return { el, update: (c) => (c.place(el), true) };
    };
    const src = `root = Page(Card(a), Card(Header("B"), v:sunk))\n`;
    const view = mount(host, { library: ui.extend({ Card }), source: src, streaming: true });
    expect([host.querySelectorAll(".gistui-error").length, host.querySelectorAll(".my-card").length]).toEqual([2, 0]);
    view.update({ source: `${src}a = Header("A")\n` });
    expect([host.querySelectorAll(".gistui-error").length, titles(host)]).toEqual([1, ["A"]]);
    const before = tries;
    view.update({ source: `${src}a = Header("A")\nlate = Header("late")\n`, streaming: false });
    expect(tries).toBe(before + 1);
    expect([host.querySelectorAll(".gistui-error").length, titles(host)]).toEqual([0, ["A", "B"]]);
    view.destroy();
  });
});

describe("lazy chunks", () => {
  const Real: DomRenderer = (ctx) => ({ el: h("b", { class: "real" }, String(ctx.props.content ?? "")), update: () => true });
  const lib = (render: DomRenderer) => ui.extend({ Text: render });

  test("lazyModule retries a failed import with a backoff, and again on the next load()", async () => {
    let calls = 0;
    const mod = lazyModule(async () => {
      if (++calls < 3) throw new Error("offline");
      return { ok: true };
    }, 2, 1);
    expect(await mod.load()).toEqual({ ok: true });
    expect([calls, mod.current]).toEqual([3, { ok: true }]);
    let tries = 0;
    const never = lazyModule(async () => {
      if (++tries <= 2) throw new Error("offline");
      return 1;
    }, 1, 1);
    await expect(never.load()).rejects.toThrow("offline");
    expect(never.current).toBeNull();
    expect(await never.load()).toBe(1);
    expect(tries).toBe(3);
  });

  test("a chunk that loads on a retry is shown", async () => {
    let calls = 0;
    const group = lazyGroup(
      async () => {
        if (++calls === 1) throw new Error("offline");
        return { Text: Real };
      },
      2,
      1,
    );
    const host = document.createElement("div");
    const view = mount(host, { library: lib(group.get("Text")), source: `root = Page(Text("hello"))\n` });
    expect(host.querySelector(".gistui-skeleton")).not.toBeNull();
    await until(() => host.querySelector(".real") !== null);
    expect(host.querySelector(".real")?.textContent).toBe("hello");
    expect(host.querySelector(".gistui-skeleton")).toBeNull();
    expect(calls).toBe(2);
    view.destroy();
  });

  test("when every retry failed the placeholder says so; a later load that works shows the component", async () => {
    let calls = 0;
    const group = lazyGroup(async () => {
      if (++calls === 1) throw new Error("offline");
      return { Text: Real };
    }, 0);
    const host = document.createElement("div");
    const view = mount(host, { library: lib(group.get("Text")), source: `root = Page(Text("hello"))\n` });
    const skeleton = host.querySelector(".gistui-skeleton")!;
    expect([skeleton.getAttribute("aria-busy"), skeleton.hasAttribute("data-failed")]).toEqual(["true", false]);
    await tick(10);
    expect([skeleton.getAttribute("aria-busy"), skeleton.hasAttribute("data-failed"), skeleton.getAttribute("aria-label")]).toEqual([null, true, "Text could not load"]);
    expect(host.querySelector(".gistui-skeleton")).toBe(skeleton);
    // Another load (a later mount, or a preload) succeeds: every placeholder becomes the component.
    await group.load();
    expect(host.querySelector(".real")?.textContent).toBe("hello");
    expect(host.querySelector(".gistui-skeleton")).toBeNull();
    view.destroy();
  });

  test("a chunk that cannot load: the placeholder is kept (not rebuilt) and the import is not repeated on every update", async () => {
    let calls = 0;
    const group = lazyGroup<{ Text: DomRenderer }>(async () => {
      calls++;
      throw new Error("offline");
    }, 1, 1);
    const host = document.createElement("div");
    const view = mount(host, { library: lib(group.get("Text")), source: `root = Page(Text("a"))\n` });
    await tick(30);
    expect(calls).toBe(2);
    const skeleton = host.querySelector(".gistui-skeleton")!;
    for (let i = 0; i < 5; i++) view.update({ classNames: { Text: `c${i}` } });
    await tick(30);
    expect(host.querySelector(".gistui-skeleton")).toBe(skeleton);
    expect(calls).toBe(2);
    expect(skeleton.getAttribute("data-failed")).toBe("");
    view.destroy();
  });

  test("with a fallback: it takes over when the chunk fails, and what renders after a later load gets the real component", async () => {
    let calls = 0;
    let arrive!: (m: { Text: DomRenderer }) => void;
    const group = lazyGroup<{ Text: DomRenderer }>(() => (++calls === 1 ? Promise.reject(new Error("offline")) : new Promise((r) => (arrive = r))), 0);
    const Fallback: DomRenderer = (ctx) => ({ el: h("i", { class: "fallback" }, String(ctx.props.content ?? "")), update: () => true });
    const library = lib(group.get("Text", undefined, Fallback));
    const host = document.createElement("div");
    const view = mount(host, { library, source: `root = Page(Text("one"))\n` });
    await until(() => host.querySelector(".fallback") !== null);
    expect(host.querySelector(".fallback")?.textContent).toBe("one");
    // The chunk is asked for again, in the background: until it is there, the fallback shows at once.
    expect(calls).toBe(2);
    const host2 = document.createElement("div");
    const view2 = mount(host2, { library, source: `root = Page(Text("two"))\n` });
    expect(host2.querySelector(".fallback")?.textContent).toBe("two");
    arrive({ Text: Real });
    await tick(5);
    const host3 = document.createElement("div");
    const view3 = mount(host3, { library, source: `root = Page(Text("three"))\n` });
    expect(host3.querySelector(".real")?.textContent).toBe("three");
    // A fallback in use is left alone (it may hold what the user typed).
    expect(host.querySelector(".fallback")).not.toBeNull();
    expect(calls).toBe(2);
    for (const v of [view, view2, view3]) v.destroy();
  });

  test("a placeholder that was destroyed is not rendered when the chunk arrives", async () => {
    let release!: (m: { Text: DomRenderer }) => void;
    let created = 0;
    const group = lazyGroup(() => new Promise<{ Text: DomRenderer }>((r) => (release = r)));
    const host = document.createElement("div");
    const view = mount(host, { library: lib(group.get("Text")), source: `root = Page(Text("x"))\n` });
    view.destroy();
    release({ Text: (ctx) => (created++, Real(ctx)) });
    await tick(5);
    expect(created).toBe(0);
  });
});

describe("how often components render", () => {
  test("an option that did not change renders nothing", () => {
    const host = document.createElement("div");
    const card = counting();
    const header = counting();
    const classNames = { Card: "p-8" };
    const view = mount(host, { library: ui.extend({ Card: card.render, Header: header.render }), source: `root = Page(Card(Header("a")), Card(Header("b")))\n`, color: "teal", classNames, lockUntil: "done" });
    expect([card.calls, header.calls]).toEqual([{ created: 2, updated: 0 }, { created: 2, updated: 0 }]);
    view.update({ color: "teal", classNames: { Card: "p-8" }, lockUntil: "done", theme: "system", source: `root = Page(Card(Header("a")), Card(Header("b")))\n`, streaming: false });
    expect([card.calls.updated, header.calls.updated]).toEqual([0, 0]);
    // A class for one type renders that type only.
    view.update({ classNames: { Card: "p-4" } });
    expect([card.calls.updated, header.calls.updated]).toEqual([2, 0]);
    // The colour and the lock: only the components that read them.
    view.update({ color: "rose", lockUntil: "ready" });
    expect([card.calls.updated, header.calls.updated]).toEqual([2, 0]);
    expect(host.querySelector(".gistui")!.getAttribute("data-gistui-color")).toBe("rose");
    view.destroy();
  });

  test("the end of a stream renders only the components that read `locked` or `streaming`", () => {
    const host = document.createElement("div");
    const header = counting();
    const locks: boolean[] = [];
    const Button: DomRenderer = (ctx) => {
      const el = h("button", { disabled: ctx.locked });
      locks.push(ctx.locked);
      return { el, update: (c) => (locks.push(c.locked), setAttrs(el, { disabled: c.locked }), true) };
    };
    const src = `root = Page(Header("a"), Header("b"), Button("Go"))\n`;
    const view = mount(host, { library: ui.extend({ Header: header.render, Button }), source: src, streaming: true });
    expect(header.calls).toEqual({ created: 2, updated: 0 });
    view.update({ streaming: false });
    expect(header.calls).toEqual({ created: 2, updated: 0 });
    expect(locks).toEqual([true, false]);
    expect(host.querySelector("button")!.hasAttribute("disabled")).toBe(false);
    // `lockUntil` and the host colour reach the components that read them, and only those.
    const before = locks.length;
    view.update({ lockUntil: "ready" });
    expect(locks.length).toBe(before + 1);
    expect(header.calls.updated).toBe(0);
    view.destroy();
  });

  test("a context kept by a component reads the current `streaming` and `locked`", () => {
    const host = document.createElement("div");
    let kept!: { streaming: boolean; locked: boolean };
    const Header: DomRenderer = (ctx) => ((kept = ctx), { el: h("div"), update: () => true });
    const view = mount(host, { library: ui.extend({ Header }), source: `root = Page(Header("a"))\n`, streaming: true });
    expect([kept.streaming, kept.locked]).toEqual([true, true]);
    view.update({ streaming: false });
    expect([kept.streaming, kept.locked]).toEqual([false, false]);
    view.destroy();
  });

  test("children of a component that provides something are created once, after it", () => {
    const host = document.createElement("div");
    const KEY = Symbol("test");
    const header = counting();
    const got: unknown[] = [];
    const Header: DomRenderer = (ctx) => {
      got.push(ctx.consume(KEY));
      return header.render(ctx);
    };
    const Form: DomRenderer = (ctx) => {
      const el = h("form");
      ctx.provide(KEY, "provided");
      ctx.place(el);
      return { el, update: (c) => (c.provide(KEY, "provided"), c.place(el), true) };
    };
    const names = Array.from({ length: 20 }, (_, i) => `Header("h${i}")`).join(", ");
    const view = mount(host, { library: ui.extend({ Form, Header }), source: `root = Form("f", ${names})\n` });
    expect(header.calls).toEqual({ created: 20, updated: 0 });
    expect(got).toEqual(Array(20).fill("provided"));
    expect(host.querySelectorAll("form > [data-type='Header']").length).toBe(20);
    view.destroy();
  });

  test("the built-in Form: 20 headers inside cost 20 renders", () => {
    const host = document.createElement("div");
    const header = counting();
    const names = Array.from({ length: 20 }, (_, i) => `Header("h${i}")`).join(", ");
    const view = mount(host, { library: ui.extend({ Header: header.render }), source: `root = Form("f", ${names})\n` });
    expect(header.calls).toEqual({ created: 20, updated: 0 });
    expect(host.querySelectorAll("form [data-type='Header']").length).toBe(20);
    view.destroy();
  });

  test("a component that provides late, or reads its children first, still reaches them", () => {
    const host = document.createElement("div");
    const KEY = Symbol("late");
    const got: unknown[] = [];
    const Header: DomRenderer = (ctx) => {
      const el = h("div");
      got.push(ctx.consume(KEY));
      return { el, update: (c) => (got.push(c.consume(KEY)), true) };
    };
    const Card: DomRenderer = (ctx) => {
      const el = h("section");
      expect(ctx.children.length).toBe(2);
      expect(ctx.childList.map((e) => e.nodes.length)).toEqual([1, 1]);
      ctx.place(el);
      ctx.provide(KEY, "late");
      return { el, update: (c) => (c.place(el), true) };
    };
    const view = mount(host, { library: ui.extend({ Card, Header }), source: `root = Card(Header("a"), Header("b"))\n` });
    expect(got).toEqual([undefined, undefined, "late", "late"]);
    expect(host.querySelectorAll("section > div").length).toBe(2);
    view.destroy();
  });

  test("Accordion items are built once, as accordion items (never as the stand-alone fallback first)", async () => {
    const SRC = `root = Accordion(Item("First", Text("one"), open), Item("Second", Text("two")))\n`;
    // Load the chunk first.
    const warm = document.createElement("div");
    const w = mount(warm, { library: ui, source: SRC });
    await until(() => warm.querySelector('[data-scope="accordion"][data-part="item-trigger"]') !== null);
    w.destroy();
    let details = 0;
    const createElement = document.createElement.bind(document);
    document.createElement = ((tag: string, o?: ElementCreationOptions) => (tag === "details" && details++, createElement(tag, o))) as typeof document.createElement;
    try {
      const host = document.createElement("div");
      const view = mount(host, { library: ui, source: SRC });
      expect(host.querySelectorAll('[data-scope="accordion"][data-part="item-trigger"]').length).toBe(2);
      expect(details).toBe(0);
      view.destroy();
    } finally {
      document.createElement = createElement;
    }
  });
});

describe("streaming", () => {
  /** Tag, classes, component and text of every node: what must not depend on how the text arrived. */
  function shape(el: Element): string {
    const out: string[] = [];
    const walk = (n: Node, depth: number) => {
      if (n.nodeType === 3) {
        const t = n.textContent!.trim();
        if (t) out.push(`${" ".repeat(depth)}"${t}"`);
        return;
      }
      if (n.nodeType !== 1) return;
      const e = n as Element;
      const flags = ["hidden", "disabled"].filter((a) => e.hasAttribute(a)).join(" ");
      out.push(`${" ".repeat(depth)}${e.tagName.toLowerCase()}.${e.getAttribute("class") ?? ""}[${e.getAttribute("data-gistui") ?? ""}] ${flags}`);
      for (const c of Array.from(e.childNodes)) walk(c, depth + 1);
    };
    walk(el, 0);
    return out.join("\n");
  }

  test("a program that arrives a few characters at a time ends up as the same DOM as one given whole", async () => {
    const dir = `${import.meta.dir}/../../../spec/conformance`;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".gistui"))) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      const [whole, streamed] = [document.createElement("div"), document.createElement("div")];
      document.body.append(whole, streamed);
      const a = mount(whole, { library: ui, source, autofix: false });
      const b = mount(streamed, { library: ui, source: "", streaming: true, autofix: false });
      for (let i = 5; i < source.length; i += 5) b.update({ source: source.slice(0, i) });
      b.update({ source, streaming: false });
      // Lazy chunks arrive in their own time, for both.
      await until(() => shape(whole) === shape(streamed) && !whole.querySelector(".gistui-skeleton"));
      expect(`${file}\n${shape(streamed)}`).toBe(`${file}\n${shape(whole)}`);
      for (const [v, host] of [[a, whole], [b, streamed]] as const) {
        v.destroy();
        host.remove();
      }
    }
  }, 30000);
});

describe("allowedHosts and paused", () => {
  const program = `d = {secret: "s3cr3t"}\nroot = Stack(Image("https://evil.example/a.png"), Image("https://pics.example/b.png"), Image("https://pics.example/c.png?d=" + d.secret), Image("/local.png"))\n`;
  const srcs = (el: Element) => [...el.querySelectorAll("img")].map((i) => i.getAttribute("src")).filter(Boolean);

  test("allowedHosts: only those hosts load; changing the list parses the source again", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const view = mount(host, { library: ui, source: program, autofix: false, allowedHosts: ["pics.example"] });
    await until(() => srcs(host).length === 3);
    expect(srcs(host).sort()).toEqual(["/local.png", "https://pics.example/b.png", "https://pics.example/c.png?d=s3cr3t"]);
    view.update({ allowedHosts: ["evil.example"] });
    await until(() => srcs(host).includes("https://evil.example/a.png"));
    expect(srcs(host).sort()).toEqual(["/local.png", "https://evil.example/a.png"]);
    // No list: what the program wrote out loads; what it assembled from data does not.
    view.update({ allowedHosts: undefined });
    await until(() => srcs(host).length === 3);
    expect(srcs(host).sort()).toEqual(["/local.png", "https://evil.example/a.png", "https://pics.example/b.png"]);
    view.destroy();
    host.remove();
  });

  test("paused: the data loads once and is not refreshed on a timer", async () => {
    let calls = 0;
    const host = document.createElement("div");
    document.body.append(host);
    const view = mount(host, { library: ui, source: `root = Stack(Table(q))\nq = @query("orders", {}, default:[], every:5)\n`, autofix: false, paused: true, tools: { orders: async () => (calls++, [{ Order: `#${calls}` }]) } });
    await until(() => host.textContent!.includes("#1"));
    expect(calls).toBe(1);
    view.destroy();
    host.remove();
  });
});

