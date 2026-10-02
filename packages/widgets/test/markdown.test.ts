import { describe, expect, test } from "bun:test";
import { createMarkdown, renderMarkdownToString } from "../src/markdown";

/** Final render through the widget (DOM path). */
function dom(content: string, streaming = false): string {
  const el = document.createElement("div");
  createMarkdown(el, { content, streaming });
  return el.innerHTML;
}

/** Normalizes an HTML string through the DOM serializer, so string and DOM output compare fairly. */
function norm(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.innerHTML;
}

/** Streams `content` in the given chunks, calling update() after each, then ends the stream. */
function stream(content: string, cuts: number[]): { el: HTMLElement; html: string } {
  const el = document.createElement("div");
  const w = createMarkdown(el, { content: "", streaming: true });
  for (const c of cuts) w.update({ content: content.slice(0, c), streaming: true });
  w.update({ content, streaming: false });
  return { el, html: el.innerHTML };
}

/** Deterministic PRNG (mulberry32) for random chunkings. */
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

function randomCuts(len: number, rand: () => number): number[] {
  const cuts: number[] = [];
  let i = 0;
  while (i < len) {
    i += 1 + Math.floor(rand() * 12);
    cuts.push(Math.min(i, len));
  }
  return cuts;
}

const DOC = `# Quarterly report

Revenue grew **12%** to *$4.1M*, driven by ~~ads~~ \`subscriptions\`.
See [the dashboard](https://example.com/dash) or <https://example.com>.

## Highlights

- New users: **24,950**
- Churn down to _2.1%_
  - EU: 1.8%
  - US: 2.4%
- [x] Launch pricing page
- [ ] Hire two engineers

1. Plan
2. Build
3. Ship

> Customers love the new onboarding.
> > Nested quote.

\`\`\`ts
const total = rows.reduce((a, r) => a + r.value, 0);
\`\`\`

| Region | Revenue | Growth |
|:-------|--------:|:------:|
| EU     | $1.2M   | +8%    |
| US     | $2.9M   | +14%   |

---

Ending with a line break
and a final https://example.com/end.`;

describe("markdown syntax", () => {
  test("headings, paragraphs and soft breaks", () => {
    expect(dom("# One\n###### Six\nnot a heading #tag")).toBe("<h1>One</h1><h6>Six</h6><p>not a heading #tag</p>");
    expect(dom("## Closed ##")).toBe("<h2>Closed</h2>");
    expect(dom("line one\nline two\n\nnext")).toBe("<p>line one<br>line two</p><p>next</p>");
  });

  test("emphasis, strong, strike and code spans", () => {
    expect(dom("**b** __b__ *e* _e_ ~~s~~ `c`")).toBe(
      "<p><strong>b</strong> <strong>b</strong> <em>e</em> <em>e</em> <del>s</del> <code>c</code></p>",
    );
    expect(dom("***both***")).toBe("<p><em><strong>both</strong></em></p>");
    expect(dom("snake_case_name and 2 * 3 * 4")).toBe("<p>snake_case_name and 2 * 3 * 4</p>");
    expect(dom("``a `b` c``")).toBe("<p><code>a `b` c</code></p>");
    expect(dom("**unclosed")).toBe("<p>**unclosed</p>");
  });

  test("links, autolinks, bare URLs and images", () => {
    expect(dom("[t](/rel) [x](#top)")).toBe('<p><a href="/rel">t</a> <a href="#top">x</a></p>');
    expect(dom('[t](https://a.com "Title")')).toBe(
      '<p><a href="https://a.com" rel="noopener noreferrer nofollow" target="_blank">t</a></p>',
    );
    expect(dom("mail <mailto:a@b.co>")).toBe('<p>mail <a href="mailto:a@b.co">mailto:a@b.co</a></p>');
    expect(dom("see https://a.com/x_(y), ok")).toBe(
      '<p>see <a href="https://a.com/x_(y)" rel="noopener noreferrer nofollow" target="_blank">https://a.com/x_(y)</a>, ok</p>',
    );
    expect(dom("![Logo](https://a.com/l.png)")).toBe('<p><img src="https://a.com/l.png" alt="Logo" loading="lazy"></p>');
    expect(dom("[no dest] and [a [b](/x)")).toBe('<p>[no dest] and [a <a href="/x">b</a></p>');
  });

  test("lists: bullets, ordered with start, nesting, tasks", () => {
    expect(dom("- a\n- b\n  - c")).toBe("<ul><li>a</li><li><p>b</p><ul><li>c</li></ul></li></ul>");
    expect(dom("3. three\n4. four")).toBe('<ol start="3"><li>three</li><li>four</li></ol>');
    expect(dom("- [ ] todo\n- [x] done")).toBe(
      '<ul><li class="task"><input type="checkbox" disabled=""> todo</li><li class="task"><input type="checkbox" disabled="" checked=""> done</li></ul>',
    );
    expect(dom("- a\n* b")).toBe("<ul><li>a</li></ul><ul><li>b</li></ul>");
    expect(dom("para\n- item")).toBe("<p>para</p><ul><li>item</li></ul>");
  });

  test("block quotes, code fences and thematic breaks", () => {
    expect(dom("> a\nlazy\n> > b")).toBe("<blockquote><p>a<br>lazy</p><blockquote><p>b</p></blockquote></blockquote>");
    expect(dom("```js\nlet a = 1 < 2;\n\n```")).toBe('<pre><code class="language-js" data-lang="js">let a = 1 &lt; 2;\n</code></pre>');
    expect(dom("~~~\nraw **not bold**\n~~~")).toBe("<pre><code>raw **not bold**</code></pre>");
    expect(dom("a\n\n***\n\n- - -")).toBe("<p>a</p><hr><hr>");
  });

  test("GFM tables with alignment and escaped pipes", () => {
    expect(dom("| a | b | c |\n|:--|:-:|--:|\n| 1 | x \\| y | **3** |")).toBe(
      '<table><thead><tr><th style="text-align:left">a</th><th style="text-align:center">b</th><th style="text-align:right">c</th></tr></thead>' +
        '<tbody><tr><td style="text-align:left">1</td><td style="text-align:center">x | y</td><td style="text-align:right"><strong>3</strong></td></tr></tbody></table>',
    );
    // A header row and its delimiter row start a table, also right after a paragraph line (W5).
    expect(dom("text\n| a | b |\n|---|---|")).toBe("<p>text</p><table><thead><tr><th>a</th><th>b</th></tr></thead></table>");
    // Without a delimiter row with as many cells, a pipe line stays in the paragraph.
    expect(dom("text\n| a | b |\n|---|")).toBe("<p>text<br>| a | b |<br>|---|</p>");
  });

  test("escapes and entities", () => {
    expect(dom("\\*not em\\* \\# \\[x]")).toBe("<p>*not em* # [x]</p>");
    expect(dom("&amp; &lt; &gt; &quot; &#39; &#x41; &nbsp;|&copy;")).toBe("<p>&amp; &lt; &gt; \" ' A &nbsp;|&amp;copy;</p>");
  });
});

describe("security", () => {
  test("raw HTML is text", () => {
    expect(dom("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(dom('<img src=x onerror="alert(1)">')).toBe('<p>&lt;img src=x onerror="alert(1)"&gt;</p>');
    const el = document.createElement("div");
    createMarkdown(el, { content: '<b onclick="x()">hi</b>' });
    expect(el.querySelector("b")).toBeNull();
  });

  test("dangerous link schemes render as plain text", () => {
    for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "vbscript:x", "data:text/html,<script>", " javascript:x"]) {
      const el = document.createElement("div");
      createMarkdown(el, { content: `[click](${url}) <${url}>` });
      expect(el.querySelector("a")).toBeNull();
    }
    expect(dom("[click](javascript:alert(1))")).toBe("<p>click</p>");
  });

  test("images only from http(s) or relative URLs", () => {
    expect(dom("![x](data:image/png;base64,AAAA)")).toBe("<p>x</p>");
    expect(dom("![x](javascript:alert(1))")).toBe("<p>x</p>");
    expect(dom("![x](/img.png)")).toBe('<p><img src="/img.png" alt="x" loading="lazy"></p>');
  });

  test("a custom allowlist narrows URLs, but never re-allows javascript:", () => {
    const el = document.createElement("div");
    createMarkdown(el, { content: "[a](https://evil.com) [b](https://ok.com) [c](javascript:x)", isSafeUrl: (u) => !u.includes("evil") });
    expect(Array.from(el.querySelectorAll("a"), (a) => a.getAttribute("href"))).toEqual(["https://ok.com"]);
    expect(renderMarkdownToString("[a](https://evil.com)", { isSafeUrl: () => false })).toBe("<p>a</p>");
  });

  test("the string renderer escapes everything", () => {
    const s = renderMarkdownToString('[x"><script>](https://a.com/?q="><script>) `<b>` <i>');
    expect(s).not.toContain("<script>");
    expect(s).not.toContain("<b>");
    expect(s).not.toContain("<i>");
  });
});

describe("streaming", () => {
  test("close-open-marks for the open block", () => {
    const cases: [string, string][] = [
      ["**bo", "<p><strong>bo</strong></p>"],
      ["*it", "<p><em>it</em></p>"],
      ["~~st", "<p><del>st</del></p>"],
      ["`co", "<p><code>co</code></p>"],
      ["[te", "<p>te</p>"],
      ["[te](https://ex", "<p>te</p>"],
      ["a **b *c", "<p>a <strong>b <em>c</em></strong></p>"],
      ["hello *", "<p>hello </p>"],
      ["x _", "<p>x </p>"],
      ["#", ""],
      ["# ", ""],
      ["-", ""],
      ["- ", ""],
      ["1.", ""],
      ["--", ""],
      ["| a | b |", ""],
      ["| a | b |\n|--", ""],
      ["```py\nx = 1", '<pre><code class="language-py" data-lang="py">x = 1</code></pre>'],
      ["```", "<pre><code></code></pre>"],
      ["&am", ""],
      ["ok \\", "<p>ok </p>"],
      ["![al", ""],
      ["see <https://ex", "<p>see </p>"],
    ];
    for (const [src, html] of cases) expect([src, dom(src, true)]).toEqual([src, html]);
  });

  test("a table renders as soon as its delimiter row arrives, rows stream in", () => {
    expect(dom("| a | b |\n|---|---|", true)).toBe("<table><thead><tr><th>a</th><th>b</th></tr></thead></table>");
    expect(dom("| a | b |\n|---|---|\n| 1 | **tw", true)).toBe(
      "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td><strong>tw</strong></td></tr></tbody></table>",
    );
  });

  test("the open block renders in final form when the stream ends", () => {
    const el = document.createElement("div");
    const w = createMarkdown(el, { content: "**bo", streaming: true });
    expect(el.innerHTML).toBe("<p><strong>bo</strong></p>");
    w.update({ content: "**bo", streaming: false });
    expect(el.innerHTML).toBe("<p>**bo</p>");
  });

  test("completed blocks keep their DOM identity; the open block is patched in place", () => {
    const el = document.createElement("div");
    const w = createMarkdown(el, { content: "", streaming: true });
    const src = DOC;
    const firstPara = src.indexOf("## Highlights");
    let frozen: Element | null = null;
    let openP: Element | null = null;
    for (let i = 1; i <= src.length; i++) {
      w.update({ content: src.slice(0, i), streaming: true });
      if (i === firstPara + 3) {
        frozen = el.children[0]!; // the h1, frozen once "Revenue…" started
        openP = el.children[1]!;
      }
      if (frozen && i > firstPara + 3) expect(el.children[0]).toBe(frozen);
    }
    w.update({ content: src, streaming: false });
    expect(el.children[0]).toBe(frozen!);
    expect(el.children[1]).toBe(openP!); // the paragraph element was patched, never replaced
  });

  test("the open paragraph is patched with text updates, not rebuilt", () => {
    const el = document.createElement("div");
    const w = createMarkdown(el, { content: "Hello", streaming: true });
    const p = el.firstChild;
    const text = p!.firstChild;
    w.update({ content: "Hello wor", streaming: true });
    expect(el.firstChild).toBe(p);
    expect(p!.firstChild).toBe(text);
    expect(text!.nodeValue).toBe("Hello wor");
  });

  test("final output is chunk-invariant and equals a one-shot render", () => {
    const docs = [
      DOC,
      "Intro **bold\ncontinues** here\n\n- a\n\n- b\n\n  continued\nlazy\n\n1) x\n2) y\n\n> q\nlazy q\n\n| h |\n|---|\n| r |\ntext after table",
      "```\nunclosed fence\n\nwith blank lines",
      "a\n---\n* * *\n- - -\n+ plus\n\n# end #",
      "[link *em](https://a.com) **[bold link](/x)** `code [not link](/y)` ~~del *em*~~",
      "tail with trailing spaces   \nand \\\nbackslash break",
    ];
    for (const [d, doc] of docs.entries()) {
      const oneShot = dom(doc);
      expect(norm(renderMarkdownToString(doc))).toBe(oneShot);
      const rand = rng(1000 + d);
      for (let run = 0; run < 60; run++) expect(stream(doc, randomCuts(doc.length, rand)).html).toBe(oneShot);
      expect(stream(doc, Array.from({ length: doc.length }, (_, i) => i + 1)).html).toBe(oneShot);
    }
  });

  test("content that is not an extension re-renders from scratch", () => {
    const el = document.createElement("div");
    const w = createMarkdown(el, { content: "# A\n\nfirst", streaming: true });
    w.update({ content: "# B\n\nsecond", streaming: false });
    expect(el.innerHTML).toBe("<h1>B</h1><p>second</p>");
  });

  test("a 20 KB document streamed one character at a time stays fast", () => {
    let big = "";
    for (let i = 0; big.length < 20 * 1024; i++) big += `${DOC.replace("Quarterly", `Q${i}`)}\n\n`;
    const run = () => {
      const el = document.createElement("div");
      const w = createMarkdown(el, { content: "", streaming: true });
      const t0 = performance.now();
      for (let i = 1; i <= big.length; i++) w.update({ content: big.slice(0, i), streaming: true });
      w.update({ content: big, streaming: false });
      return { ms: performance.now() - t0, html: el.innerHTML };
    };
    run(); // warm up
    const { ms, html } = run();
    console.log(`20 KB markdown, 1-char updates: ${ms.toFixed(1)} ms (${big.length} updates)`);
    expect(html).toBe(dom(big));
    expect(ms).toBeLessThan(150 * Number(process.env.GISTUI_PERF_SLACK ?? 3));
  });

  test("destroy clears the element", () => {
    const el = document.createElement("div");
    const w = createMarkdown(el, { content: "# x" });
    w.destroy();
    expect(el.innerHTML).toBe("");
    expect(el.classList.contains("gistui-md")).toBe(false);
  });
});

describe("string renderer parity", () => {
  test("renderMarkdownToString matches the widget's DOM", () => {
    for (const src of [DOC, "plain", "", "- [x] a\n  ```\n  code\n  ```", "| a |\n|:-:|\n| <b> |"]) {
      expect(norm(renderMarkdownToString(src))).toBe(dom(src));
    }
  });

  test("the widget root has the gistui-md class", () => {
    const el = document.createElement("div");
    el.className = "host";
    createMarkdown(el, { content: "x" });
    expect(el.className).toBe("host gistui-md");
  });
});
