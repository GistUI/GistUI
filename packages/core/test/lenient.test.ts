/**
 * Sloppy but unambiguous syntax is accepted as meant, with a `lenient-syntax` warning: nothing is
 * dropped, and the tree is exactly what the model wrote. Each rule is checked at every chunk size.
 */
import { describe, expect, test } from "bun:test";
import { createStream, parse } from "../src/index";
import { lib } from "./fixtures/lib";
import { view as strip } from "./helpers";

const codes = (src: string) => parse(src, lib).errors.map((e) => e.code);
const tree = (src: string) => strip(parse(src, lib).root);
/** The same program pushed in chunks of every size from 1 to 7 gives the same tree and errors. */
function chunked(src: string): void {
  const want = parse(src, lib);
  for (let size = 1; size <= 7; size++) {
    const s = createStream(lib);
    for (let i = 0; i < src.length; i += size) {
      s.push(src.slice(i, i + size));
      s.flush();
    }
    s.end();
    expect(strip(s.snapshot())).toEqual(strip(want.root));
    expect(s.errors().map((e) => e.code)).toEqual(want.errors.map((e) => e.code));
  }
}

describe("a call left open when the next statement begins", () => {
  const SRC = `root = Page(a, b\na = Card("one")\nb = Card("two", v:sunk\n`;

  test("the call ends at its line; later statements are not swallowed", () => {
    expect(tree(SRC)).toEqual(tree(`root = Page(a, b)\na = Card("one")\nb = Card("two", v:sunk)\n`));
    expect(codes(SRC)).toEqual(["lenient-syntax", "lenient-syntax"]);
    expect(parse(SRC, lib).valid.strict).toBe(true);
    chunked(SRC);
  });

  test("only a line that starts a statement at column 0 ends the call", () => {
    // Continuation lines: indented, after a comma, a named argument, `==`, a lambda.
    const multi = `root = Page(\n  a,\n  b,\n  gap:lg)\na = Card("one")\nb = Card(Text("x")\n  , v:sunk)\n`;
    expect(codes(multi)).toEqual([]);
    expect(tree(multi)).toEqual(tree(`root = Page(a, b, gap:lg)\na = Card("one")\nb = Card(Text("x"), v:sunk)\n`));
    chunked(multi);
    // After a comma the next line is still an argument, even written `key = value` at column 0.
    const named = `root = Page(a,\ngap = lg)\na = Card("one")\n`;
    expect(tree(named)).toEqual(tree(`root = Page(a, gap:lg)\na = Card("one")\n`));
    chunked(named);
  });

  test("blank lines and a state declaration after the open call", () => {
    const src = `root = Page(a\n\n$tab = "x"\na = Card("one")\n`;
    // ($tab is not used by anything, hence `unreachable`.)
    expect(codes(src)).toEqual(["lenient-syntax", "unreachable"]);
    expect(tree(src)).toEqual(tree(`root = Page(a)\n$tab = "x"\na = Card("one")\n`));
    chunked(src);
  });

  test("the end of the answer closes open brackets (a warning, not a parse error)", () => {
    const src = `root = Page(Card(Text("x"), v:sunk`;
    expect(codes(src)).toEqual(["lenient-syntax"]);
    expect(tree(src)).toEqual(tree(`root = Page(Card(Text("x"), v:sunk))`));
    chunked(src);
    // An open string at the end is still an error, reported once.
    expect(codes(`root = Page(Text("x`)).toEqual(["unterminated-string"]);
  });
});

describe("arguments", () => {
  test("an empty slot is an argument left out", () => {
    const src = `root = Stat("MRR", "$412k", , )\n`;
    expect(codes(src)).toEqual(["lenient-syntax"]);
    expect(tree(src)).toEqual(tree(`root = Stat("MRR", "$412k")\n`));
    const mid = `root = Header("Title", , )\nx = Stack("a", , "b")\n`;
    expect(parse(mid, lib).errors.filter((e) => e.code !== "lenient-syntax" && e.code !== "unreachable")).toEqual([]);
    chunked(src);
  });

  test('JSON-style `"key": value` is a named argument', () => {
    const src = `root = Callout("Heads up", "tone": "info")\n`;
    expect(codes(src)).toEqual(["lenient-syntax"]);
    expect(tree(src)).toEqual(tree(`root = Callout("Heads up", tone:info)\n`));
    chunked(src);
  });

  test("a component name in lowercase is still a call", () => {
    const src = `root = card(text("hello"))\n`;
    expect(codes(src)).toEqual(["lenient-syntax", "lenient-syntax"]);
    expect(tree(src)).toEqual(tree(`root = Card(Text("hello"))\n`));
    chunked(src);
  });

  test("`+5.2` is a number", () => {
    const src = `root = Select("n", "N", [+5.2, -3.1, 4])\n`;
    expect(codes(src)).toEqual(["lenient-syntax"]);
    expect(tree(src)).toEqual(tree(`root = Select("n", "N", [5.2, -3.1, 4])\n`));
  });
});

describe("habits from other languages", () => {
  test("single-quoted text is a string where a value can start", () => {
    const src = `root = Card(Text('hello'), Callout('a "quoted" word', tone:'info'))\n`;
    expect(new Set(codes(src))).toEqual(new Set(["lenient-syntax"]));
    expect(tree(src)).toEqual(tree(`root = Card(Text("hello"), Callout("a \\"quoted\\" word", tone:info))\n`));
    chunked(src);
    // Elsewhere an apostrophe is ordinary text: a table row written inside a call still works.
    const rows = `root = Table(\n  |Item|Note\n  |Q1|Men's\n)\n`;
    expect(parse(rows, lib).errors.filter((e) => e.severity === "error")).toEqual([]);
  });

  test("a trailing `;`, a `//` comment and a missing comma", () => {
    const src = `root = Card(Text("a") Text("b"), v:sunk); // the card\n`;
    expect(new Set(codes(src))).toEqual(new Set(["lenient-syntax"]));
    expect(parse(src, lib).valid.strict).toBe(true);
    expect(tree(src)).toEqual(tree(`root = Card(Text("a"), Text("b"), v:sunk)\n`));
    chunked(src);
    // A URL inside a string is not a comment.
    expect(tree(`root = Text("see https://example.com/a")\n`)).toEqual({ type: "Text", props: { content: "see https://example.com/a" } });
  });

  test("`.5` is a number; a byte-order mark is skipped", () => {
    expect(tree(`root = Select("n", "N", [.5, 1.5])\n`)).toEqual(tree(`root = Select("n", "N", [0.5, 1.5])\n`));
    expect(codes(`\uFEFFroot = Text("x")\n`)).toEqual([]);
    expect(tree(`\uFEFFroot = Text("x")\n`)).toEqual(tree(`root = Text("x")\n`));
  });

  test("a program without `root` renders its first component, with a warning", () => {
    const r = parse(`main = Card(Text("x"))\n`, lib);
    expect(r.errors.map((e) => [e.code, e.severity])).toEqual([["no-root", "warning"]]);
    expect(r.valid.strict).toBe(true);
    expect(parse(`data = [1, 2]\n`, lib).errors.map((e) => [e.code, e.severity])).toEqual([["no-root", "error"]]);
  });
});

describe("strings", () => {
  test("a backslash at the end of a line does not keep the string open", () => {
    const src = `root = Page(a, b)\na = Text("abc\\\nb = Text("x")\n`;
    const r = parse(src, lib);
    expect(r.errors.map((e) => e.code)).toEqual(["unterminated-string"]);
    expect(strip(r.root)).toEqual(tree(`root = Page(a, b)\na = Text("abc")\nb = Text("x")\n`));
    chunked(src);
  });

  test("an invalid \\u escape does not skip past the closing quote", () => {
    const src = `root = Stack(Text("\\u12"), Text("b"))\n`;
    expect(tree(src)).toEqual(tree(`root = Stack(Text("12"), Text("b"))\n`));
    chunked(src);
  });

  test("CRLF: an unterminated string does not keep the carriage return", () => {
    const r = parse(`root = Text("abc\r\n`, lib);
    expect((strip(r.root) as { props: { content: string } }).props.content).toBe("abc");
  });
});

describe("limits", () => {
  test("deep nesting is a reported limit, not a stack overflow", () => {
    for (const src of [`root = ${"Card(".repeat(20000)}`, `root = Text(${"[".repeat(20000)}`, `root = Text(${"(".repeat(20000)}`, `root = Text(${"!".repeat(100000)}x)`, `root = Text(${Array(100000).fill('"a"').join(" + ")})`]) {
      const r = parse(src, lib);
      expect(r.errors.some((e) => e.code === "limit")).toBe(true);
      const s = createStream(lib);
      for (let i = 0; i < src.length; i += 1000) {
        s.push(src.slice(i, i + 1000));
        s.flush();
      }
      s.end();
    }
  });

  test("a line starting with `||` continues an expression; it is not a table row", () => {
    const src = `$a = 1\n$b = 2\nroot = Text(content: ($a == 1\n  || $b == 2) ? "yes" : "no")\n`;
    expect(codes(src)).toEqual([]);
    expect(parse(src, lib).root).not.toBeNull();
  });

  test("a long digit run in a cell is parsed in linear time", () => {
    const t0 = performance.now();
    parse(`root = Table(t)\nt = |a|b:n\n|x|${"1".repeat(80000)}x\n`, lib);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
