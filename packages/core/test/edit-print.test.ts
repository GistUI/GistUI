/** The canonical printout, edit merge and autofix must never lose or move what the program said. */
import { describe, expect, test } from "bun:test";
import { autofix, createEditStream, merge, parse, toEditSource } from "../src/index";
import { lib } from "./fixtures/lib";
import { view } from "./helpers";

const tree = (src: string) => view(parse(src, lib).root);

describe("printout", () => {
  test("bare enum words and bare text are kept (they are not dangling references)", () => {
    expect(toEditSource(`root = Callout("Hi", success)\n`, lib)).toBe(`root = Callout("Hi", success)\n`);
    const src = `root = Card(Callout("x", warning), Header(title), sunk)\n`;
    expect(tree(toEditSource(src, lib))).toEqual(tree(src));
    // A reference to nothing is still dropped, as the store drops it.
    expect(toEditSource(`root = Stack(a, missing)\na = Text("x")\n`, lib)).toBe(`root = Stack(a)\na = Text("x")\n`);
  });

  test("a patch to a prop written as a bare word replaces that word", () => {
    const base = `c = Callout(warning, "Text")\n`;
    const merged = merge(base, `c.content = "New"\n`, lib).source;
    expect(tree(merged)).toEqual(tree(`c = Callout("New", tone:warning)\n`));
    const tone = merge(base, `c.tone = info\n`, lib).source;
    expect(tree(tone)).toEqual(tree(`c = Callout("Text", tone:info)\n`));
    // The printout renders exactly what the live edit stream shows.
    const live = createEditStream(base, lib);
    live.push(`c.content = "New"\n`);
    live.end();
    expect(view(live.snapshot())).toEqual(tree(merged));
  });

  test("merge without a `root` statement keeps the UI (the first component is the root)", () => {
    const merged = merge(`data = |a|b\n|1|2\nmain = Card(Table(data))\n`, `main += Text("x")\n`, lib).source;
    expect(merged).toContain("main = Card(");
    expect(merged).toContain(`Text("x")`);
    expect(merge(`$tab = "a"\nmain = Card(Text($tab))\n`, `main += Text("y")\n`, lib).source).toContain("main = Card(");
  });
});

describe("autofix does not make a program worse", () => {
  test("a cycle loses only the reference that closes it", () => {
    const r = autofix(`root = Stack(root, Text("hi"))\n`, lib, { shape: "original" });
    expect(r.valid).toBe(true);
    expect(tree(r.source)).toEqual(tree(`root = Stack(Text("hi"))\n`));
  });

  test("an unused statement's own children are not added to root as well", () => {
    const r = autofix(`root = Stack(Text("a"))\np = Card(c)\nc = Text("c")\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toContain("root = Stack(_c1, p)"); // `c` comes along inside `p`, not in root too
    expect(r.changes).toEqual(["p: added to root (it was defined but not used)"]);
  });

  test("a statement that is only a dangling reference is removed with what points to it", () => {
    const r = autofix(`root = Stack(a, b)\na = Missing\nb = Text("kept")\n`, lib, { shape: "original" });
    expect(r.valid).toBe(true);
    expect(tree(r.source)).toEqual(tree(`root = Stack(b)\nb = Text("kept")\n`));
  });

  test("repairs keep bare words: only what was wrong is listed and changed", () => {
    const r = autofix(`root = Card(Callout("x", warning), Header(title), bogus:1)\n`, lib, { shape: "original" });
    expect(r.changes).toEqual([`root: removed unknown prop "bogus"`]);
    expect(tree(r.source)).toEqual(tree(`root = Card(Callout("x", warning), Header(title))\n`));
  });
});
