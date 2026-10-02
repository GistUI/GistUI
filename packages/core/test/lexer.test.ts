import { describe, expect, test } from "bun:test";
import { Lexer, type RawStatement } from "../src/lexer";

function lex(src: string, opts: { inline?: boolean; chunk?: number } = {}) {
  const stmts: RawStatement[] = [];
  const prose: string[] = [];
  let unterminated = 0;
  const lx = new Lexer(
    { statement: (s) => stmts.push(s), prose: (t) => prose.push(t), unterminatedString: () => unterminated++, autoClosed: () => {} },
    opts.inline ?? false,
  );
  const size = opts.chunk ?? src.length;
  for (let i = 0; i < src.length; i += size) lx.push(src.slice(i, i + size));
  lx.end();
  return { stmts, prose, unterminated };
}

describe("lexer", () => {
  test("splits statements at depth-0 newlines", () => {
    const { stmts } = lex(`a = Card("x")\nb = Row(\n  a,\n  c\n)\nc = "hi"`);
    expect(stmts.map((s) => s.text)).toEqual([`a = Card("x")`, `b = Row(\n  a,\n  c\n)`, `c = "hi"`]);
    expect(stmts.map((s) => s.line)).toEqual([1, 2, 6]);
  });

  test("brackets and newlines inside strings do not split", () => {
    const { stmts } = lex(`a = Card("(not a paren", "]")\nb = 1`);
    expect(stmts).toHaveLength(2);
  });

  test("pipe tables continue while lines start with |", () => {
    const { stmts } = lex(`t = |A|B\n|1|2\n  |3|4\nroot = Table(t)`);
    expect(stmts[0]).toEqual({ text: "t = |A|B\n|1|2\n|3|4", line: 1, kind: "table" });
    expect(stmts[1]!.text).toBe("root = Table(t)");
  });

  test("table cells may contain quotes and brackets", () => {
    const { stmts } = lex(`t = |Name|Note\n|O'Reilly|"quoted (x\nroot = Table(t)`);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]!.kind).toBe("table");
  });

  test("a table body may start on the next line", () => {
    const { stmts } = lex(`t =\n|A|B\n|1|2`);
    expect(stmts[0]!.kind).toBe("table");
    expect(stmts[0]!.text).toBe("t = |A|B\n|1|2");
  });

  test("comments, fences and prose are skipped", () => {
    const { stmts, prose } = lex("Here is your UI:\n```gistui\n# comment\nroot = Page(a) # trailing\na = Text(\"x\")\n```\nHope that helps!");
    expect(stmts.map((s) => s.text)).toEqual(["root = Page(a) ", `a = Text("x")`]);
    expect(prose).toEqual(["Here is your UI:", "Hope that helps!"]);
  });

  test("a line with == is prose, not an assignment", () => {
    const { stmts, prose } = lex(`x == y\nz = 1`);
    expect(stmts.map((s) => s.text)).toEqual(["z = 1"]);
    expect(prose).toEqual(["x == y"]);
  });

  test("patches, appends and state declarations", () => {
    const { stmts } = lex(`k3.value = "$415k"\nkpis += k5\n$tab = "a"`);
    expect(stmts.map((s) => s.text)).toEqual([`k3.value = "$415k"`, "kpis += k5", `$tab = "a"`]);
  });

  test("a raw newline closes an unterminated string", () => {
    const { stmts, unterminated } = lex(`a = Text("oops\nb = 1`);
    expect(unterminated).toBe(1);
    expect(stmts.map((s) => s.text)).toEqual([`a = Text("oops")`, "b = 1"]);
  });

  test("inline mode: only gistui (or untagged) blocks are code; other code blocks are chat text", () => {
    const src = [
      "Here is some JS:",
      "```js",
      "root = notGistUI()",
      "```",
      "~~~GistUI title",
      "root = Page()",
      "~~~",
      "````markdown",
      "```gistui",
      "root = Example()",
      "```",
      "````",
      "```",
      "a = Text(1)",
      "```",
    ].join("\n");
    for (const chunk of [undefined, 1, 3]) {
      const { stmts, prose } = lex(src, { inline: true, chunk });
      expect(stmts.map((s) => s.text.trim())).toEqual(["root = Page()", "a = Text(1)"]);
      expect(prose).toContain("root = notGistUI()");
      expect(prose).toContain("root = Example()");
    }
  });

  test("inline mode: a longer fence is closed only by one at least as long", () => {
    const { stmts, prose } = lex("````gistui\nroot = Page(a)\n```\na = Text(1)\n````\nafter = Text(2)", { inline: true });
    expect(stmts.map((s) => s.text.trim())).toEqual(["root = Page(a)", "a = Text(1)"]);
    expect(prose).toContain("after = Text(2)");
  });

  test("not inline: tilde fence markers are stripped like backtick ones", () => {
    const { stmts, prose } = lex("~~~gistui\nroot = Page()\n~~~\n");
    expect(stmts.map((s) => s.text.trim())).toEqual(["root = Page()"]);
    expect(prose).toEqual([]);
  });

  test("a fence line ends a statement that was left open: the closing fence is not swallowed", () => {
    const src = "```gistui\nroot = Card(a,\n```\nThanks = not code\n```gistui\na = Text(1)\n```\n";
    for (const chunk of [undefined, 1, 4]) {
      const { stmts, prose } = lex(src, { inline: true, chunk });
      expect(stmts.map((s) => s.text.replace(/\s+/g, ""))).toEqual(["root=Card(a,)", "a=Text(1)"]);
      expect(prose).toContain("Thanks = not code");
    }
    // One or two backticks inside brackets are not a fence: the statement goes on.
    const { stmts } = lex("a = Card(\n``x,\n)\n");
    expect(stmts).toHaveLength(1);
  });

  test("inline mode parses only fenced code", () => {
    const { stmts, prose } = lex("Sure!\nroot = not code\n```gistui\nroot = Page()\n```\nDone.", { inline: true });
    expect(stmts.map((s) => s.text)).toEqual(["root = Page()"]);
    expect(prose).toEqual(["Sure!", "root = not code", "Done."]);
  });

  test("any chunking gives the same statements", () => {
    const src = `root = Page(a, b)\na = Card("x, (y)", "\\"q\\"")\n# c\nt = |A|B\n|1|2\nb = Row(a,\n  t)\n`;
    const once = lex(src).stmts;
    for (const chunk of [1, 2, 3, 5, 8, 13]) expect(lex(src, { chunk }).stmts).toEqual(once);
  });
});
