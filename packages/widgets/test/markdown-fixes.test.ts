import { describe, expect, test } from "bun:test";
import { createMarkdown, renderMarkdownToString } from "../src/markdown";

const SLACK = Number(process.env.GISTUI_PERF_SLACK ?? 3);

function dom(content: string, streaming = false): string {
  const el = document.createElement("div");
  createMarkdown(el, { content, streaming });
  return el.innerHTML;
}

/** Streams `content` cut at the given offsets; returns every intermediate HTML and the final one. */
function stream(content: string, cuts: number[]): { frames: string[]; html: string; el: HTMLElement } {
  const el = document.createElement("div");
  const w = createMarkdown(el, { content: "", streaming: true });
  const frames: string[] = [];
  for (const c of cuts) {
    w.update({ content: content.slice(0, c), streaming: true });
    frames.push(el.innerHTML);
  }
  w.update({ content, streaming: false });
  return { frames, html: el.innerHTML, el };
}

const everyChar = (s: string) => Array.from({ length: s.length }, (_, i) => i + 1);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCuts(len: number, rand: () => number, max = 12): number[] {
  const cuts: number[] = [];
  let i = 0;
  while (i < len) {
    i += 1 + Math.floor(rand() * max);
    cuts.push(Math.min(i, len));
  }
  return cuts;
}

function ms(f: () => unknown): number {
  const t0 = performance.now();
  f();
  return performance.now() - t0;
}

const TABLE = "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";

describe("a table right after a paragraph line (W5)", () => {
  test("the table starts its own block", () => {
    expect(dom("Here is the comparison:\n| A | B |\n|---|---|\n| 1 | 2 |")).toBe(`<p>Here is the comparison:</p>${TABLE}`);
    expect(dom("One\ntwo\nA | B\n--- | ---\n1 | 2\n\nafter")).toBe(`<p>One<br>two</p>${TABLE}<p>after</p>`);
    expect(renderMarkdownToString("Intro\n| A | B |\n|:--|--:|\n| 1 | 2 |")).toContain("<p>Intro</p><table>");
  });

  test("inside a list item and a block quote", () => {
    expect(dom("- Intro\n  | A | B |\n  |---|---|\n  | 1 | 2 |")).toBe(`<ul><li><p>Intro</p>${TABLE}</li></ul>`);
    expect(dom("> Intro\n> | A | B |\n> |---|---|\n> | 1 | 2 |")).toBe(`<blockquote><p>Intro</p>${TABLE}</blockquote>`);
  });

  test("a pipe line without a matching delimiter row stays in the paragraph", () => {
    expect(dom("text\n| a | b |\n|---|")).toBe("<p>text<br>| a | b |<br>|---|</p>");
    expect(dom("text\n| a | b |\nmore")).toBe("<p>text<br>| a | b |<br>more</p>");
    // A delimiter row needs a pipe: `---` alone is a thematic break, as before.
    expect(dom("text\na | b\n---")).toBe("<p>text<br>a | b</p><hr>");
  });

  test("streaming: the header never flashes as text, and any chunking gives the one-shot result", () => {
    const doc = "Here is the comparison:\n| A | B |\n|---|---|\n| 1 | 2 |";
    const { frames, html } = stream(doc, everyChar(doc));
    expect(html).toBe(dom(doc));
    for (const f of frames) expect(f.replace(/<[^>]+>/g, "")).not.toContain("|");
    expect(frames[doc.indexOf("| A")]).toBe("<p>Here is the comparison:</p>");
    expect(frames.at(-1)).toBe(`<p>Here is the comparison:</p>${TABLE}`);

    const docs = [
      doc,
      "Intro:\n| a | b |\n|---|---|x\nmore text\n\nnext",
      "Intro:\n| a | b |\n|---|---|---|\n| 1 | 2 |",
      "# H\npara\n| a | b |\n|:-:|--:|\n| 1 | **2** |\n| 3 | 4 |\ntail\n\n- item\n  | x | y |\n  |---|---|\n  | 5 | 6 |\n\nend | of | doc",
      "a\nb | c\n-|-\nd | e\n\n> q\n> | f | g |\n> |---|---|\n> | h | i |",
    ];
    for (const [d, src] of docs.entries()) {
      const oneShot = dom(src);
      expect(stream(src, everyChar(src)).html).toBe(oneShot);
      const rand = rng(77 + d);
      for (let run = 0; run < 60; run++) expect(stream(src, randomCuts(src.length, rand)).html).toBe(oneShot);
    }
  });
});

describe("a pipe in prose is not a pending table (W6)", () => {
  test("the open paragraph keeps rendering", () => {
    expect(dom("Run `ls | grep foo` to filter", true)).toBe("<p>Run <code>ls | grep foo</code> to filter</p>");
    expect(dom("Use a | b here", true)).toBe("<p>Use a | b here</p>");
    expect(dom("Escaped \\| pipes \\| too", true)).toBe("<p>Escaped | pipes | too</p>");
    const doc = "First.\n\nRun `ls | grep foo` to filter the list.";
    const { frames } = stream(doc, everyChar(doc));
    for (const f of frames.slice(doc.indexOf("Run") + 2)) expect(f).toContain("Run");
    expect(frames.at(-1)).toBe("<p>First.</p><p>Run <code>ls | grep foo</code> to filter the list.</p>");
  });

  test("a line that looks like a table header is still held back until its second line", () => {
    expect(dom("| a | b |", true)).toBe("");
    expect(dom("a | b | c", true)).toBe("");
    expect(dom("| a | b |\n|--", true)).toBe("");
    expect(dom("a | b | c\nmore", true)).toBe("<p>a | b | c<br>more</p>");
    expect(dom("a | b | c", false)).toBe("<p>a | b | c</p>");
    expect(dom("text\na | b | c", true)).toBe("<p>text</p>");
  });
});

describe("hostile input stays linear (S11)", () => {
  /** As many copies as fit under the inline size cap, so the parser itself is measured, not the cap. */
  const fit = (unit: string, max = 49_000) => unit.repeat(Math.floor(max / unit.length));
  const cases: [string, string][] = [
    // As reported (these are also over the size cap).
    ["bare URL + 20k )", "see https://a.com/x" + ")".repeat(20_000)],
    ["80k spaces before a line break", "a" + " ".repeat(80_000) + "x\nb"],
    ["a**b* x 20k", "a**b*".repeat(20_000)],
    ["`a* ` x 32k", "a* ".repeat(32_000)],
    ["delimiter row of 40k spaces", "a|b\n" + " ".repeat(40_000) + "|"],
    ["pending table, 40k spaces", "a|b|c\n" + " ".repeat(40_000) + "x"],
    // Under the cap: each of these took between 0.2 s and 14 s before.
    ["bare URL + )", "see https://a.com/x" + fit(")", 48_000)],
    ["spaces before a line break", "a" + fit(" ", 48_000) + "x\nb"],
    ["spaces before a backslash break", "a" + fit(" ", 48_000) + "x\\\nb"],
    ["a**b*", fit("a**b*")],
    ["a* ", fit("a* ")],
    ["*a (openers only)", fit("*a ")],
    ["_a*b_c*", fit("_a*b_c*")],
    ["mixed emphasis", fit("**a *b __c _d ~~e ")],
    ["openers then closers", fit("***a ", 24_000) + fit("b*** ", 24_000)],
    ["~~~a~~~", fit("~~~a~~~ ")],
    ["[", fit("[")],
    ["[a", fit("[a")],
    ["![", fit("![")],
    ["[a](", fit("[a](")],
    ["[a](<b", fit("[a](<b")],
    ["[a](<b, one line, > at the end", fit("[a](<b", 40_000) + "\n>"],
    ['[a](b "', fit('[a](b "')],
    ["[a](b (", fit("[a](b (")],
    ["[ then links", fit("[", 25_000) + fit("[a](b)", 24_000)],
    ["URLs inside brackets", fit("[x https://a.co ")],
    ["<", fit("<")],
    ["<a", fit("<a")],
    ["<aaaa… then space", fit("<" + "a".repeat(2040) + " ")],
    ["&", fit("&")],
    ["backtick runs", Array.from({ length: 300 }, (_, i) => "`".repeat(i + 1)).join(" a ")],
    ["`a", fit("`a")],
    ["# + 40k #", "# " + "#".repeat(40_000) + "x"],
    ["40k spaces line", " ".repeat(40_000) + "x"],
    ["``` + 40k spaces + x", "```\ncode\n```" + " ".repeat(40_000) + "x"],
    ["table row with 20k cells", "|a|b|\n|-|-|\n" + "|x".repeat(20_000)],
    ["hr-like 40k", "- ".repeat(20_000) + "x"],
    ["40k-column delimiter row", "a|b\n" + "-|".repeat(20_000)],
  ];

  test("every case renders in well under a frame budget, final and streaming", () => {
    const slow: string[] = [];
    for (const [name, src] of cases) {
      for (const streaming of [false, true]) {
        const t = ms(() => dom(src, streaming));
        if (t > 60 * SLACK) slow.push(`${name} (${streaming ? "streaming" : "final"}): ${t.toFixed(0)} ms`);
      }
      const t = ms(() => renderMarkdownToString(src));
      if (t > 60 * SLACK) slow.push(`${name} (string): ${t.toFixed(0)} ms`);
    }
    expect(slow).toEqual([]);
  });

  test("the emphasis rules still hold on the inputs that were slow", () => {
    expect(dom("a**b*a**b*")).toBe("<p>a<strong>b*a</strong>b*</p>");
    expect(dom("a* a* a*")).toBe("<p>a* a* a*</p>");
    expect(dom("*a **b** c* _d_ __e *f* g__ ~~h~~ *i**j**k*")).toBe(
      "<p><em>a <strong>b</strong> c</em> <em>d</em> <strong>e <em>f</em> g</strong> <del>h</del> <em>i<strong>j</strong>k</em></p>",
    );
    expect(dom("***a** b* **c *d***  *e**f* g** h*")).toBe("<p><em><strong>a</strong> b</em> <strong>c <em>d</em></strong>  <em>e**f</em> g** h*</p>");
    expect(dom("see https://a.com/x(y)). done")).toBe('<p>see <a href="https://a.com/x(y)" rel="noopener noreferrer nofollow" target="_blank">https://a.com/x(y)</a>). done</p>');
    expect(dom("a   \nb")).toBe("<p>a<br>b</p>");
  });

  test("a block beyond the size cap renders as plain text, line breaks kept", () => {
    const big = `**bold** and \`code\`\n`.repeat(6000); // one paragraph, ~120 KB
    const html = renderMarkdownToString(big);
    expect(html).not.toContain("<strong>");
    expect(html).toContain("**bold** and `code`<br>**bold**");
    expect(ms(() => dom(big, true))).toBeLessThan(100 * SLACK);
    expect(renderMarkdownToString("**bold**\n".repeat(100))).toContain("<strong>");
  });
});

describe("deep nesting does not overflow the stack (S9)", () => {
  test("block quotes and lists nest at most 32 deep; deeper content is plain text", () => {
    for (const src of ["> ".repeat(30_000) + "x", "1. ".repeat(30_000) + "x", "- > ".repeat(15_000) + "x", "+ ".repeat(30_000) + "x"]) {
      let html = "";
      expect(() => (html = renderMarkdownToString(src))).not.toThrow();
      expect(() => dom(src, true)).not.toThrow();
      expect(dom(src)).toBe(html);
      const depth = (html.match(/<(?:blockquote|ul|ol)\b/g) ?? []).length;
      expect(depth).toBe(32);
      expect(html).toContain("x");
    }
    // 32 levels still nest for real.
    const ok = renderMarkdownToString("> ".repeat(32) + "x");
    expect((ok.match(/<blockquote>/g) ?? []).length).toBe(32);
    expect(ok).toContain("<p>x</p>");
  });

  test("inline nesting is bounded too", () => {
    const n = 30_000;
    for (const [src, streaming] of [["*a ".repeat(n), true], ["*a".repeat(n) + "a*".repeat(n), false], ["**a _b ".repeat(n / 2), true], ["[".repeat(n) + "x", true]] as const) {
      expect(() => dom(src, streaming)).not.toThrow();
      expect(() => renderMarkdownToString(src)).not.toThrow();
    }
    const el = document.createElement("div");
    createMarkdown(el, { content: "*a ".repeat(200), streaming: true });
    let depth = 0;
    for (let e: Element | null = el.querySelector("em"); e; e = e.querySelector("em")) depth++;
    expect(depth).toBeLessThanOrEqual(32);
    expect(el.textContent).toContain("a a a");
    // Ordinary nesting is untouched.
    expect(dom("*a **b ~~c *d* c~~ b** a*")).toBe("<p><em>a <strong>b <del>c <em>d</em> c</del> b</strong> a</em></p>");
  });
});

describe("long lists and tables are not re-parsed on every chunk (W26a)", () => {
  /** A widget whose URL check counts its calls: one call per link each time a block is rendered. */
  function counted(content: string) {
    const el = document.createElement("div");
    const seen: string[] = [];
    const isSafeUrl = (url: string) => (seen.push(url), true);
    const w = createMarkdown(el, { content, streaming: true, isSafeUrl });
    return { el, seen, update: (content: string, streaming = true) => (seen.splice(0), w.update({ content, streaming, isSafeUrl })) };
  }

  test("a completed list item is frozen: later chunks render only the open item", () => {
    const items = Array.from({ length: 6 }, (_, i) => `- [link ${i}](/l${i})`);
    const { el, seen, update } = counted(items.slice(0, 5).join("\n"));
    const first = el.querySelector("li")!;
    // An item is complete once the next item's first line is: the last two items are still open.
    update(`${items.slice(0, 5).join("\n")}\n- [link 5`);
    expect(seen).toEqual(["/l3", "/l4"]);
    update(`${items.join("\n")}`);
    expect(seen).toEqual(["/l4", "/l5"]);
    update(`${items.join("\n")} more`);
    expect(seen).toEqual(["/l4", "/l5"]);
    expect(el.querySelector("li")).toBe(first);
    update(`${items.join("\n")} more\n\ndone`, false);
    expect(el.innerHTML).toBe(`<ul>${Array.from({ length: 6 }, (_, i) => `<li><a href="/l${i}">link ${i}</a>${i === 5 ? " more" : ""}</li>`).join("")}</ul><p>done</p>`);
  });

  test("a completed table row is frozen too", () => {
    const head = "| a | b |\n|---|---|\n";
    const rows = Array.from({ length: 5 }, (_, i) => `| [r${i}](/r${i}) | ${i} |`);
    const { el, seen, update } = counted(head + rows.slice(0, 4).join("\n"));
    const cell = el.querySelector("td")!;
    // Every row but the last is complete.
    update(`${head}${rows.slice(0, 4).join("\n")}\n| [r4`);
    expect(seen).toEqual(["/r3"]);
    update(`${head}${rows.join("\n")}`);
    expect(seen).toEqual(["/r4"]);
    update(`${head}${rows.join("\n")}\n| **x`);
    expect(seen).toEqual(["/r4"]);
    expect(el.querySelector("td")).toBe(cell);
    update(`${head}${rows.join("\n")}\n| **x** | y |\n\nafter`, false);
    expect(el.innerHTML).toBe(
      `<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody>${rows.map((_, i) => `<tr><td><a href="/r${i}">r${i}</a></td><td>${i}</td></tr>`).join("")}<tr><td><strong>x</strong></td><td>y</td></tr></tbody></table><p>after</p>`,
    );
  });

  test("any chunking of lists and tables gives the one-shot result", () => {
    const docs = [
      "- a\n- b\n  - c\n  - d\n- e\n\n- f\n\n  para in f\nlazy\n- [x] task\n- [ ] todo\n* other list\n* second\n\n3. three\n4. four\n   more\n5. five\n\ntext",
      "| h1 | h2 |\n|:--|--:|\n| a | **b** |\n| c | `d` |\n| e | f\n| g |\n1. list after table\n2. two\n\n| x |\n|---|\n| y |\ntext after table\n| z |",
      "1. one\n2. two\n3. three\n-\n4. four\n- x\n-- not a list\n- y\n---\n- z\n- - nested\n- last",
      "| a | b |\n|---|---|\n| 1 | 2 |\n-\n| 3 | 4 |\n1\n| 5 | 6 |\n1.\n",
      "- a\n\n\n- b\n> quote\n- c\n```\n- not an item\n```\n- d",
    ];
    for (const [d, src] of docs.entries()) {
      const oneShot = dom(src);
      expect(renderMarkdownToString(src).replace(/disabled=""|checked=""/g, (m) => m)).toBeTruthy();
      expect(stream(src, everyChar(src)).html).toBe(oneShot);
      const rand = rng(500 + d);
      for (let run = 0; run < 80; run++) expect(stream(src, randomCuts(src.length, rand)).html).toBe(oneShot);
      for (let run = 0; run < 20; run++) expect(stream(src, randomCuts(src.length, rand, 60)).html).toBe(oneShot);
    }
  });

  test("a 1,000-item list and a 1,000-row table stream in a fraction of the old time", () => {
    const list = Array.from({ length: 1000 }, (_, i) => `- Item ${i} with **bold** and a [link](https://example.com/${i})`).join("\n");
    const table = "| # | Name | Value |\n|---|---|---|\n" + Array.from({ length: 1000 }, (_, i) => `| ${i} | row *${i}* | ${i * 7} |`).join("\n");
    for (const [name, doc, budget] of [["list", list, 400], ["table", table, 400]] as const) {
      const el = document.createElement("div");
      const w = createMarkdown(el, { content: "", streaming: true });
      const t = ms(() => {
        for (let i = 4; i < doc.length; i += 4) w.update({ content: doc.slice(0, i), streaming: true });
        w.update({ content: doc, streaming: false });
      });
      console.log(`1,000-${name === "list" ? "item list" : "row table"}, 4-char updates: ${t.toFixed(0)} ms (${Math.ceil(doc.length / 4)} updates)`);
      expect(el.innerHTML).toBe(dom(doc));
      expect(t).toBeLessThan(budget * SLACK);
    }
  });
});
