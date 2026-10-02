import { describe, expect, test } from "bun:test";
import { createStream, defineLibrary, Runtime, type RuntimeEvent } from "../src/index";

const lib = defineLibrary({
  components: [
    { name: "Stack", children: true, props: {} },
    { name: "Card", args: ["title"], children: true, props: { title: { type: "string", required: true } } },
    { name: "Text", args: ["content"], props: { content: { type: "string", required: true } } },
    { name: "Stat", args: ["label", "value"], props: { label: { type: "string", required: true }, value: { type: "string", required: true } } },
    { name: "Callout", args: ["title"], props: { title: { type: "string", required: true }, tone: { type: "enum", values: ["info", "success"] } } },
    { name: "Select", args: ["name", "options"], props: { name: { type: "string", required: true }, options: { type: "array" }, bind: { type: "state" } } },
    { name: "Chart", args: ["data"], props: { data: { type: "data" } } },
    { name: "Button", args: ["label"], props: { label: { type: "string", required: true }, do: { type: "action" } } },
  ],
});

function setup(src: string, opts: ConstructorParameters<typeof Runtime>[1] = {}) {
  const s = createStream(lib);
  s.push(src);
  s.end();
  const rt = new Runtime(s, opts);
  /** The rendered tree, as type(props)[children], resolving views like a renderer does. */
  const tree = (id = s.store.root!): unknown => {
    const n = rt.view(id)!;
    const kids = n.children.map((c) => tree(c));
    return n.type === "#fragment" ? kids : { type: n.type, props: n.props, ...(kids.length ? { children: kids } : {}) };
  };
  return { s, rt, tree };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("runtime", () => {
  test("@each makes keyed components; ternaries and computed text follow state", () => {
    const { rt, tree } = setup(
      [
        `$tab = "a"`,
        `root = Stack(list, total, body)`,
        `rows = [{id:"x", name:"A", total:10}, {id:"y", name:"B", total:32}]`,
        `list = @each(rows, r => Card(r.name, Stat("Revenue", "$" + r.total)))`,
        `total = "Total: " + @sum(rows.total)`,
        `body = $tab == "done" ? done : Text("Not yet")`,
        `done = Callout("All set", tone:success)`,
        ``,
      ].join("\n"),
    );
    const t = tree() as { children: unknown[] };
    expect(t.children[0]).toEqual([
      { type: "Card", props: { title: "A" }, children: [{ type: "Stat", props: { label: "Revenue", value: "$10" } }] },
      { type: "Card", props: { title: "B" }, children: [{ type: "Stat", props: { label: "Revenue", value: "$32" } }] },
    ]);
    expect(t.children[1]).toEqual([{ type: "Text", props: { content: "Total: 42" } }]);
    expect(t.children[2]).toEqual([{ type: "Text", props: { content: "Not yet" } }]);
    // Generated ids follow the item keys.
    expect(rt.view("list")!.children.every((c) => c.includes("[x]") || c.includes("[y]"))).toBe(true);
    rt.setState("tab", "done");
    expect((tree() as { children: unknown[] }).children[2]).toEqual([{ type: "Callout", props: { title: "All set", tone: "success" } }]);
  });

  test("only views that read a changed variable re-evaluate and notify", () => {
    const { rt } = setup(`$n = 1\nroot = Stack(a, b)\na = Text("n=" + $n)\nb = Text("static")\n`);
    rt.view("a");
    rt.view("b");
    let a = 0;
    let b = 0;
    rt.subscribe("a", () => a++);
    rt.subscribe("b", () => b++);
    const before = rt.view("a");
    rt.setState("n", 2);
    expect(rt.view("a")!.props.content).toBe("n=2");
    expect(rt.view("a")).not.toBe(before);
    expect([a, b]).toEqual([1, 0]);
    rt.setState("n", 2); // unchanged: nothing
    expect(a).toBe(1);
  });

  test("builtins: count, avg, min, max, sort, filter, round, fmt, pluck, tables as records", () => {
    const { rt } = setup(`root = Stack()\nt = |Name|Score\n|Ada|90\n|Bo|72\n|Cy|81\n`);
    const e = (src: string) => {
      const s = createStream(lib);
      s.push(`x = ${src}\n`);
      s.end();
      return rt.evaluate(s.program.program.exprs.get("x")!);
    };
    expect(e(`@count(t)`)).toBe(3);
    expect(e(`@avg(t.Score)`)).toBeCloseTo(81);
    expect(e(`@max(t, r => r.Score)`)).toBe(90);
    expect(e(`@first(@sort(t, "Score", "desc")).Name`)).toBe("Ada");
    expect(e(`@count(@filter(t, r => r.Score > 80))`)).toBe(2);
    expect(e(`@round(2.345, 2)`)).toBe(2.35);
    expect(e(`@fmt(412000, "$")`)).toBe("$412,000");
    expect(e(`@fmt(0.125, "%")`)).toBe("12.5%");
    expect(e(`t.Name`)).toEqual(["Ada", "Bo", "Cy"]);
    expect(e(`@fmt("2026-10-14", "date")`)).toBe("Oct 14, 2026");
  });

  test("in generated components, a prop given by name keeps its slot", () => {
    const { tree } = setup(`root = Stack(list)\nrows = [{a:"Revenue", b:"$1.2M"}]\nlist = @each(rows, r => Stat(label:r.a, r.b))\n`);
    expect(tree()).toEqual({ type: "Stack", props: {}, children: [[{ type: "Stat", props: { label: "Revenue", value: "$1.2M" } }]] });
  });

  test("formatted number cells keep their text in records and still count as numbers", () => {
    const { rt } = setup(`root = Stack()\nf = |Code|Price|Seats\n|NH 7|$1,184|12\n|DL 275|$948|3\n`);
    const e = (src: string) => {
      const s = createStream(lib);
      s.push(`x = ${src}\n`);
      s.end();
      return rt.evaluate(s.program.program.exprs.get("x")!);
    };
    expect(e(`f.Price`)).toEqual(["$1,184", "$948"]);
    expect(e(`f.Seats`)).toEqual([12, 3]);
    expect(e(`@sum(f.Price)`)).toBe(2132);
    expect(e(`@first(@sort(f, "Price")).Code`)).toBe("DL 275");
    expect(e(`@count(@filter(f, r => r.Price > 1000))`)).toBe(1);
    expect(e(`"$948" < "$1,184"`)).toBe(true);
    expect(e(`"apple" < "banana"`)).toBe(true);
  });

  test("queries: called with their args, deduped, re-run when a variable changes, default until then", async () => {
    const calls: unknown[] = [];
    const tools = {
      get_sales: async (args: { range: string }) => {
        calls.push(args);
        return { rows: [{ m: "Apr", v: args.range === "7d" ? 1 : 2 }] };
      },
    };
    const { rt } = setup(`$range = "30d"\nroot = Stack(c, c2)\nsales = @query("get_sales", {range:$range}, default:{rows:[]})\nc = Chart(sales.rows)\nc2 = Chart(sales.rows)\n`, { tools });
    expect(rt.view("c")!.props.data).toEqual([]);
    expect(rt.view("c2")!.props.data).toEqual([]);
    await flush();
    expect(calls).toEqual([{ range: "30d" }]);
    expect(rt.view("c")!.props.data).toEqual([{ m: "Apr", v: 2 }]);
    expect(rt.queryStatus("sales")).toMatchObject({ loading: false, error: null });
    rt.setState("range", "7d");
    await flush();
    expect(calls).toEqual([{ range: "30d" }, { range: "7d" }]);
    expect(rt.view("c")!.props.data).toEqual([{ m: "Apr", v: 1 }]);
    rt.dispose();
  });

  test("a query never runs while its statement is streaming; an unknown tool is an error", async () => {
    let calls = 0;
    const s = createStream(lib);
    s.push(`root = Stack(c)\nc = Chart(q)\nq = @query("load", {page:`);
    s.flush();
    const rt = new Runtime(s, { tools: { load: async () => (calls++, [1]) } });
    rt.view("c");
    await flush();
    expect(calls).toBe(0);
    s.push(`2})\n`);
    s.end();
    rt.sync();
    rt.view("c");
    await flush();
    expect(calls).toBe(1);
    const { rt: rt2 } = setup(`root = Stack(c)\nc = Chart(q)\nq = @query("nope", {})\n`);
    rt2.view("c");
    await flush();
    expect(rt2.queryStatus("q").error).toBe('Tool "nope" is not available to @query (read-only tools go in `tools`)');
  });

  test("actions: @set, @run(mutation), @send, @open (blocked schemes), @emit; a failed mutation stops", async () => {
    const events: RuntimeEvent[] = [];
    const saved: unknown[] = [];
    const tools = {
      save_goal: async (a: unknown) => (saved.push(a), { ok: true }),
      fail: async () => {
        throw new Error("nope");
      },
    };
    const { s, rt } = setup(
      [
        `$goal = 100`,
        `root = Stack(ok, bad, evil)`,
        `save = @mutation("save_goal", {goal:$goal})`,
        `boom = @mutation("fail", {})`,
        `ok = Button("Save", do:[@set($goal, $goal + 5), @run(save), @send("Saved " + $goal), @open("https://x.com"), @emit("saved", {goal:$goal})])`,
        `bad = Button("Bad", do:[@run(boom), @send("never")])`,
        `evil = Button("Evil", do:[@open("javascript:alert(1)")])`,
        ``,
      ].join("\n"),
      { mutations: tools, onEvent: (e) => events.push(e) },
    );
    await rt.run(s.store.get("ok")!.dyn!.do!, "ok");
    expect(saved).toEqual([{ goal: 105 }]);
    expect(rt.evaluate({ k: "member", o: { k: "ref", name: "save" }, name: "status" })).toBe("success");
    expect(events.filter((e) => e.type !== "state")).toEqual([
      { type: "send", message: "Saved 105", nodeId: "ok" },
      { type: "open", url: "https://x.com", nodeId: "ok" },
      { type: "emit", event: "saved", payload: { goal: 105 }, nodeId: "ok" },
    ]);
    events.length = 0;
    await rt.run(s.store.get("bad")!.dyn!.do!, "bad");
    expect(events.map((e) => e.type)).toEqual(["error"]);
    events.length = 0;
    await rt.run(s.store.get("evil")!.dyn!.do!, "evil");
    expect(events).toEqual([{ type: "error", code: "blocked-url", message: 'Blocked URL "javascript:alert(1)"', nodeId: "evil" }]);
  });

  test("state: initial values from the host; re-declaring keeps the runtime value; @reset restores", async () => {
    const s = createStream(lib);
    s.push(`$a = 1\n$b = "x"\nroot = Stack(r)\nr = Button("R", do:[@reset($a)])\n`);
    s.flush();
    const rt = new Runtime(s, { initialState: { b: "host" } });
    expect([rt.getState("a"), rt.getState("b")]).toEqual([1, "host"]);
    rt.setState("a", 9);
    s.push(`$a = 2\n`);
    s.end();
    rt.sync();
    expect(rt.getState("a")).toBe(9);
    await rt.run(s.store.get("r")!.dyn!.do!);
    expect(rt.getState("a")).toBe(2);
  });
});

describe("runtime: generated components keep their actions", () => {
  test("a button made by a ternary or @each runs its steps, with its own row's values", async () => {
    const events: RuntimeEvent[] = [];
    const { rt } = setup(
      [
        `$pick = null`,
        `root = Stack(list, act)`,
        `rows = [{id:"a", name:"Alpha"}, {id:"b", name:"Beta"}]`,
        `list = @each(rows, r => Button(r.name, do:[@set($pick, r.id), @send("Picked " + r.name)]))`,
        `act = $pick ? Button("Clear " + $pick, do:[@set($pick, null)]) : Text("None")`,
        ``,
      ].join("\n"),
      { onEvent: (e) => events.push(e) },
    );
    const beta = rt.view(rt.view("list")!.children[1]!)!;
    expect(beta.props.label).toBe("Beta");
    await rt.run(beta.dyn!.do!, beta.id);
    expect(rt.getState("pick")).toBe("b");
    expect(events.filter((e) => e.type === "send")).toEqual([{ type: "send", message: "Picked Beta", nodeId: beta.id }]);
    const clear = rt.view(rt.view("act")!.children[0]!)!;
    expect(clear.props.label).toBe("Clear b");
    await rt.run(clear.dyn!.do!, clear.id);
    expect(rt.getState("pick")).toBe(null);
  });
});
