import { describe, expect, test } from "bun:test";
import { highlight, HIGHLIGHT_MAX } from "../src/highlight";

const text = (tokens: { text: string }[]) => tokens.map((t) => t.text).join("");
const kinds = (tokens: { kind: string; text: string }[]) => tokens.filter((t) => t.kind).map((t) => `${t.kind}:${t.text}`);
const timed = <T>(f: () => T) => {
  const t0 = performance.now();
  const out = f();
  return { out, ms: performance.now() - t0 };
};

describe("highlight: output for ordinary code is unchanged", () => {
  test("markup: comments, tags, attributes", () => {
    const src = '<!-- note --><a href="x" class=y disabled>t</a><br/>\n<!-- open';
    const t = highlight(src, "html");
    expect(text(t)).toBe(src);
    expect(kinds(t)).toEqual(["c:<!-- note -->", "p:<", "t:a", "a:href", "p:=", 's:"x"', "a:class", "p:=", "s:y", "a:disabled", "p:>", "p:</", "t:a", "p:>", "p:<", "t:br", "p:/>"]);
  });

  test("code: line and block comments, strings, numbers, keywords, calls", () => {
    const src = "// c\nconst a = f(1, 'x'); /* b */ /* open";
    const t = highlight(src, "js");
    expect(text(t)).toBe(src);
    expect(kinds(t)).toEqual(["c:// c", "k:const", "f:f", "n:1", "s:'x'", "c:/* b */"]);
    expect(kinds(highlight("# c\nx = 1 -- y /* z */", "py"))).toEqual(["c:# c", "n:1"]);
    expect(kinds(highlight("select 1 -- c\n/* b */ from t", "sql"))).toEqual(["k:select", "n:1", "c:-- c", "c:/* b */", "k:from"]);
    expect(kinds(highlight("a { color: red; /* c */ }", "css"))).toEqual(["a:color", "c:/* c */"]);
    expect(kinds(highlight('{"a": 1, "b": true} // x', "json"))).toEqual(['s:"a"', "n:1", 's:"b"', "k:true"]);
  });
});

describe("highlight: hostile input stays fast (S12)", () => {
  test("unterminated comments are scanned once", () => {
    for (const [src, lang] of [["<!--".repeat(12_000), "html"], ["/*".repeat(24_000), "js"], ["/* ".repeat(16_000), "css"], ["/*".repeat(24_000), "sql"]] as const) {
      expect(src.length).toBeLessThanOrEqual(HIGHLIGHT_MAX);
      const { out, ms } = timed(() => highlight(src, lang));
      expect(text(out)).toBe(src);
      expect([lang, ms < 100]).toEqual([lang, true]);
    }
  });

  test("source beyond the cap is returned as plain text", () => {
    const src = "<!--".repeat(40_000);
    const { out, ms } = timed(() => highlight(src, "html"));
    expect(out).toEqual([{ kind: "", text: src }]);
    expect(ms).toBeLessThan(20);
    const js = `const a = 1;\n`.repeat(HIGHLIGHT_MAX / 10);
    expect(highlight(js, "js")).toEqual([{ kind: "", text: js }]);
    expect(highlight("const a = 1;", "js").length).toBeGreaterThan(1);
  });

  test("broken tags with many attributes stay linear, and no text is lost", () => {
    const many = [
      "<a x=".repeat(HIGHLIGHT_MAX / 5),
      "<a x=".repeat(HIGHLIGHT_MAX / 5 - 1) + ' ">',
      // Each quoted value can also be read as a bare one: 2^40 ways to fail for a backtracking regex.
      "<a" + ' b="x"'.repeat(40) + " !>",
      "<svg" + ' width="24"'.repeat(60),
      "<a" + " b='x y'".repeat(5000) + " !>",
      "<a b=\"" .repeat(10_000) + ">",
    ];
    for (const src of many) {
      const { out, ms } = timed(() => highlight(src, "html"));
      expect(text(out)).toBe(src);
      expect([src.slice(0, 20), ms < 150]).toEqual([src.slice(0, 20), true]);
    }
    // A quoted value followed by more text is one bare value, as the grammar reads it.
    expect(kinds(highlight('<a b="c"d>x', "html"))).toEqual(["p:<", "t:a", "a:b", "p:=", 's:"c"d', "p:>"]);
    expect(text(highlight('<a b="c"d>x', "html"))).toBe('<a b="c"d>x');
    expect(kinds(highlight("<a b='c d' e=f/>", "html"))).toEqual(["p:<", "t:a", "a:b", "p:=", "s:'c d'", "a:e", "p:=", "s:f/", "p:>"]);
    expect(kinds(highlight("<a b= c>", "html"))).toEqual([]);
  });
});
