import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import type { GistUINode, Patch } from "../src/store";
import { createStream, parse } from "../src/stream";
import { DASHBOARD, lib } from "./fixtures/lib";
import { chunks, view } from "./helpers";

const PROGRAMS: Record<string, string> = {
  dashboard: DASHBOARD,
  state: `$range = "30d"
root = Page(filter, chart, ask)
filter = Select("range", "Range", ["7d", "30d", "90d"], bind:$range)
sales = @query("get_sales", {range:$range}, default:{rows:[]})
chart = Chart(sales.rows, type:line)
ask = Button("Explain this trend", do:[@send("Why did sales change?")])
`,
  edits: `root = Stack(kpis, note)
kpis = Row(k1, k2)
k1 = Stat("MAU", "128k")
k2 = Stat("MRR", "$412k")
note = Card("## Notes\\n- one, (two)\\n- \\"three\\"", "🚀 émoji ✓")
k2.value = "$415k"
kpis += k3
k3 = Stat("Churn", "2%")
k1 = null
`,
  messy: `Sure — here you go:
\`\`\`gistui
root = Page(a, b, gap:medium)
a = Crad("x" "y")
b = Row(c, missing, wrap)
c = Text("unterminated
t = |A|B
|1|2
# done
\`\`\`
Thanks!`,
};

/** A final-state fingerprint: tree, node count and error codes. */
function fingerprint(s: ReturnType<typeof createStream>) {
  return JSON.stringify({ tree: view(s.snapshot()), size: s.store.size, errors: s.errors().map((e) => e.code) });
}

function runChunks(src: string, parts: string[], flushEach: boolean) {
  const s = createStream(lib);
  for (const p of parts) {
    s.push(p);
    if (flushEach) s.flush();
  }
  s.end();
  return s;
}

/** Splits `src` at the given cut points. */
function cut(src: string, points: number[]): string[] {
  const cuts = [...new Set(points.map((p) => p % (src.length + 1)))].sort((a, b) => a - b);
  const out: string[] = [];
  let last = 0;
  for (const c of cuts) {
    out.push(src.slice(last, c));
    last = c;
  }
  out.push(src.slice(last));
  return out;
}

/** Applies a patch stream to a plain map, to check that patches alone reproduce the store. */
function mirror(patches: readonly Patch[], into: Map<string, GistUINode>) {
  for (const p of patches) {
    switch (p.op) {
      case "create":
        into.set(p.id, p.node);
        break;
      case "props": {
        const n = into.get(p.id)!;
        const props = { ...n.props };
        for (const [k, v] of Object.entries(p.diff)) {
          if (v === undefined) delete props[k];
          else props[k] = v;
        }
        const next: GistUINode = { ...n, props, ...(p.partial !== undefined ? { partial: p.partial } : {}) };
        if (p.dyn === null) delete (next as { dyn?: unknown }).dyn;
        else if (p.dyn) (next as { dyn?: unknown }).dyn = p.dyn;
        into.set(p.id, next);
        break;
      }
      case "children":
        into.set(p.id, { ...into.get(p.id)!, children: p.ids });
        break;
      case "text": {
        const n = into.get(p.id)!;
        into.set(p.id, { ...n, props: { ...n.props, [p.prop]: String(n.props[p.prop] ?? "") + p.append } });
        break;
      }
      case "remove":
        into.delete(p.id);
        break;
    }
  }
}

describe("streaming", () => {
  for (const [name, src] of Object.entries(PROGRAMS)) {
    test(`${name}: any chunking gives the same final state as a one-shot parse`, () => {
      const expected = fingerprint(runChunks(src, [src], false));
      fc.assert(
        fc.property(fc.array(fc.nat(), { maxLength: 40 }), fc.boolean(), (points, flushEach) => {
          expect(fingerprint(runChunks(src, cut(src, points), flushEach))).toBe(expected);
        }),
        { numRuns: 150 },
      );
      for (const size of [1, 2, 3, 7, 10]) expect(fingerprint(runChunks(src, chunks(src, size), true))).toBe(expected);
    });

    test(`${name}: every prefix flushes without throwing`, () => {
      const s = createStream(lib);
      for (const ch of src) {
        s.push(ch);
        s.flush();
        s.snapshot();
      }
      s.end();
    });

    test(`${name}: the patch stream reproduces the store`, () => {
      const s = createStream(lib);
      const m = new Map<string, GistUINode>();
      s.store.onPatches((p) => mirror(p, m));
      for (const part of chunks(src, 3)) {
        s.push(part);
        s.flush();
      }
      s.end();
      expect(m.size).toBe(s.store.size);
      for (const id of s.store.ids()) {
        const a = s.store.get(id)!;
        const b = m.get(id)!;
        expect({ ...b, props: b.props }).toEqual({ ...a });
      }
    });
  }

  test("arbitrary input never throws and is chunk-invariant", () => {
    const alphabet = fc.constantFrom(..."abc=()[]{},:\"\\|#$@ \n\t.+-*/<>!?'`1Card Row Text Stat".split(""));
    fc.assert(
      fc.property(fc.array(alphabet, { maxLength: 200 }), fc.array(fc.nat(), { maxLength: 10 }), (chars, points) => {
        const src = chars.join("");
        const once = fingerprint(runChunks(src, [src], false));
        expect(fingerprint(runChunks(src, cut(src, points), true))).toBe(once);
      }),
      { numRuns: 400 },
    );
  });

  test("root renders as soon as `root = Page(` arrives", () => {
    const s = createStream(lib);
    s.push("root = Page(");
    s.flush();
    expect(s.store.root).toBe("root");
    expect(s.store.get("root")).toMatchObject({ type: "Page", partial: true, children: [] });
  });

  test("unchanged nodes keep their identity while later statements stream", () => {
    const s = createStream(lib);
    const src = DASHBOARD;
    const at = src.indexOf("kpis = ");
    s.push(src.slice(0, at));
    s.flush();
    const head = s.store.get("head");
    const root = s.store.get("root");
    for (const part of chunks(src.slice(at), 5)) {
      s.push(part);
      s.flush();
      expect(s.store.get("head")).toBe(head!);
      expect(s.store.get("root")).toBe(root!);
    }
    s.end();
    expect(s.store.get("head")).toBe(head!);
  });

  test("snapshots keep the identity of unchanged subtrees", () => {
    const s = createStream(lib);
    s.push(`root = Page(a, b)\na = Card("x")\n`);
    s.flush();
    const first = s.snapshot()!;
    s.push(`b = Card("y")\n`);
    s.flush();
    const second = s.snapshot()!;
    expect(second).not.toBe(first);
    expect(second.children[0]).toBe(first.children[0]!);
  });

  test("streaming string content uses text patches", () => {
    const s = createStream(lib);
    const all: Patch[] = [];
    s.store.onPatches((p) => all.push(...p));
    const src = `root = Card("## Title\\n\\nSome **bold** text that streams in slowly, with \\"quotes\\" and \\u00e9.")\n`;
    for (const part of chunks(src, 4)) {
      s.push(part);
      s.flush();
    }
    s.end();
    expect(all.filter((p) => p.op === "text").length).toBeGreaterThan(10);
    expect(s.store.get("root/0")!.props.content).toBe('## Title\n\nSome **bold** text that streams in slowly, with "quotes" and é.');
  });

  test("streaming tables emit row patches", () => {
    const s = createStream(lib);
    const all: Patch[] = [];
    s.store.onPatches((p) => all.push(...p));
    const src = `root = Table(t)\nt = |A|B\n|a|1\n|b|2\n|c|3\n`;
    for (const part of chunks(src, 2)) {
      s.push(part);
      s.flush();
    }
    s.end();
    expect(all.filter((p) => p.op === "rows").flatMap((p) => (p.op === "rows" ? p.append : []))).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect((s.store.get("root")!.props.data as { rows: unknown[] }).rows).toHaveLength(3);
  });

  test("UTF-8 bytes split inside a character", () => {
    const src = `root = Text("héllo 🚀 wörld")\n`;
    const bytes = new TextEncoder().encode(src);
    const s = createStream(lib);
    for (let i = 0; i < bytes.length; i++) {
      s.push(bytes.slice(i, i + 1));
      s.flush();
    }
    s.end();
    expect(s.store.get("root")!.props.content).toBe("héllo 🚀 wörld");
  });

  test("surrogate pairs split across string chunks", () => {
    const src = `root = Text("a🚀b")\n`;
    const i = src.indexOf("🚀") + 1; // between the two UTF-16 halves
    const s = createStream(lib);
    s.push(src.slice(0, i));
    s.flush();
    s.push(src.slice(i));
    s.end();
    expect(s.store.get("root")!.props.content).toBe("a🚀b");
  });

  test("a partially streamed statement whose final text fails to parse is removed", () => {
    const s = createStream(lib);
    s.push(`root = Page(a)\na = Card(`);
    s.flush();
    expect(s.store.get("a")!.type).toBe("Card");
    s.push(`?)\n`);
    s.end();
    expect(s.store.get("a")).toBeUndefined();
    expect(parse(`root = Page(a)\na = Card(?)\n`, lib).errors.map((e) => e.code)).toEqual(["parse-failed", "unresolved-ref"]);
  });

  test("inline mode reports chat text as prose", () => {
    const prose: string[] = [];
    const s = createStream(lib, { inline: true, onProse: (t) => prose.push(t) });
    s.push("Here is the chart:\n```gistui\nroot = Text(\"x\")\n```\nAnything else?");
    s.end();
    expect(prose).toEqual(["Here is the chart:", "Anything else?"]);
    expect(s.store.get("root")!.type).toBe("Text");
    expect(s.errors()).toEqual([]);
  });
});
