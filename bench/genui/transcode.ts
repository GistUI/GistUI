/**
 * OpenUI Lang → GistUI, statement by statement, for the same components (no composites, no pipe
 * tables, no restructuring): the conservative "same UI" comparison.
 *
 * - Positional args are mapped to props by the catalog's order.
 * - `null` padding is dropped; optional props become `key:value`; enum strings become bare words;
 *   `true` booleans become flags.
 * - A list of child components becomes variadic children: `Card([a, b], "sunk")` → `Card(a, b, variant:sunk)`.
 * - Anything the converter does not understand (unknown components, prose, state, builtins) is
 *   copied verbatim, so errors in the source stay errors in the output.
 *
 * With `idioms`, it also writes the screen the way GistUI's prompt asks for (same components, same
 * rendered tree):
 * - `tables`: a Table's Col columns become one pipe table: `Table(rows)` + `rows = |Name|Role\n|Ada|CTO`.
 * - `charts`: a chart's labels and Series become one pipe table: `BarChart(sales)`.
 * - `text`: a TextContent without options in a children list becomes a plain string child.
 * - `inline`: a leaf component (no references inside) used once is written where it is used.
 * - `enums`: enum values are bare words: `Tag("Live", success)` for `variant:success`.
 */

import { benchKit, childrenProp, type Kit } from "./catalog";

type Tok = { k: "str" | "num" | "id" | "p" | "ws"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out.push({ k: "str", v: src.slice(i, j + 1) });
      i = j + 1;
    } else if (/\s/.test(c)) {
      let j = i;
      while (j < src.length && /\s/.test(src[j]!)) j++;
      out.push({ k: "ws", v: src.slice(i, j) });
      i = j;
    } else if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(src[i + 1] ?? "") && !/[\w)\]]/.test(prevSig(out)))) {
      const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      out.push({ k: "num", v: m[0] });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c) || (/[$@]/.test(c) && /[A-Za-z_]/.test(src[i + 1] ?? ""))) {
      const m = /^[$@]?[A-Za-z_][\w]*/.exec(src.slice(i))!;
      out.push({ k: "id", v: m[0] });
      i += m[0].length;
    } else {
      out.push({ k: "p", v: c });
      i++;
    }
  }
  return out;
}

function prevSig(toks: Tok[]): string {
  for (let i = toks.length - 1; i >= 0; i--) if (toks[i]!.k !== "ws") return toks[i]!.v.slice(-1);
  return "";
}

/** A parsed expression, just enough structure to re-print calls. */
type Node =
  | { t: "call"; name: string; args: Arg[] }
  | { t: "arr"; items: Node[] }
  | { t: "raw"; text: string };
type Arg = { name?: string; value: Node };

class Reader {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek(): Tok | undefined {
    while (this.toks[this.i]?.k === "ws") this.i++;
    return this.toks[this.i];
  }
  next(): Tok | undefined {
    const t = this.peek();
    this.i++;
    return t;
  }
  /** Reads one expression up to a `,` `)` `]` `}` at this depth. */
  expr(): Node {
    const parts: Node[] = [];
    let text = "";
    const flush = () => {
      if (text.trim()) parts.push({ t: "raw", text: text.trim() });
      text = "";
    };
    for (;;) {
      const t = this.peek();
      if (!t || (t.k === "p" && ",)]}".includes(t.v))) break;
      if (t.k === "id" && /^[A-Z]/.test(t.v) && this.toks[this.i + 1]?.v === "(") {
        flush();
        this.next();
        this.next();
        parts.push({ t: "call", name: t.v, args: this.args(")") });
      } else if (t.k === "p" && t.v === "[") {
        flush();
        this.next();
        parts.push({ t: "arr", items: this.args("]").map((a) => a.value) });
      } else if (t.k === "p" && (t.v === "(" || t.v === "{")) {
        // Grouping or object literal: copied as text.
        this.next();
        const close = t.v === "(" ? ")" : "}";
        const inner = this.args(close);
        text += `${t.v}${inner.map((a) => (a.name ? `${a.name}: ` : "") + print(a.value)).join(", ")}${close}`;
      } else {
        this.next();
        text += (text && needsSpace(text, t.v) ? " " : "") + t.v;
      }
    }
    flush();
    if (parts.length === 1) return parts[0]!;
    return { t: "raw", text: parts.map(print).join(" ") };
  }
  args(close: string): Arg[] {
    const out: Arg[] = [];
    for (;;) {
      const t = this.peek();
      if (!t) return out;
      if (t.k === "p" && t.v === close) {
        this.next();
        return out;
      }
      if (t.k === "p" && t.v === ",") {
        this.next();
        continue;
      }
      // Named argument (`key: value` / `key=value`): not valid OpenUI, kept as written.
      const save = this.i;
      if (t.k === "id") {
        this.next();
        const sep = this.peek();
        if (sep?.k === "p" && (sep.v === ":" || sep.v === "=") && this.toks[this.i + 1]?.v !== "=") {
          this.next();
          out.push({ name: t.v, value: this.expr() });
          continue;
        }
        this.i = save;
      }
      const before = this.i;
      out.push({ value: this.expr() });
      if (this.i === before) this.next(); // never loop on an unexpected token
    }
  }
}

const needsSpace = (a: string, b: string) => /[\w"'`]$/.test(a) && /^[\w"'`$@]/.test(b);

function print(n: Node): string {
  if (n.t === "raw") return n.text;
  if (n.t === "arr") return `[${n.items.map(print).join(", ")}]`;
  return printCall(n.name, n.args);
}

const BARE = /^[A-Za-z][\w-]*$/;
const isNull = (n: Node) => n.t === "raw" && n.text === "null";
/** An argument removed by an idiom (its value moved into a pipe table). */
const SKIP: Node = { t: "raw", text: "\u0000skip" };

export interface Idioms {
  tables?: boolean;
  charts?: boolean;
  text?: boolean;
  inline?: boolean;
  enums?: boolean;
  /** Experimental: also inline containers used once (only root's sections keep a statement). */
  deep?: boolean;
}
export const ALL_IDIOMS: Idioms = { tables: true, charts: true, text: true, inline: true, enums: true };

/** Printing options for the current program. */
let printing: { idioms: Idioms; ids: ReadonlySet<string>; kit: Kit } = { idioms: {}, ids: new Set(), kit: benchKit };

function printCall(name: string, args: Arg[]): string {
  const spec = printing.kit.catalog[name];
  if (!spec) return `${name}(${args.map((a) => (a.name ? `${a.name}: ` : "") + print(a.value)).join(", ")})`;
  const kids = childrenProp(spec.props);
  const slots = printing.kit.positionalsOf(name);
  const given = new Map<string, string>();
  const children: string[] = [];
  const named: string[] = [];
  const excess: string[] = [];
  let pos = 0;
  for (const a of args) {
    if (a.name) {
      named.push(`${a.name}:${print(a.value)}`);
      continue;
    }
    const entry = spec.props[pos++];
    if (!entry) {
      excess.push(print(a.value)); // excess argument: kept, so it stays an error
      continue;
    }
    const [prop, p] = entry;
    if (a.value === SKIP) continue;
    if (isNull(a.value) && !p.req) continue;
    if (prop === kids) {
      const items = a.value.t === "arr" ? a.value.items : [a.value];
      children.push(...items.map((n) => (printing.idioms.text && plainText(n)) || print(n)));
    } else if (slots.some((s) => s.prop === prop)) {
      // A required enum in its positional slot is a bare word too: `Callout(warning, "Title", "…")`.
      const word = p.enum && a.value.t === "raw" && /^"[^"\\]*"$/.test(a.value.text) ? a.value.text.slice(1, -1) : null;
      given.set(prop, printing.idioms.enums && word && BARE.test(word) && bareEnumOk(spec.props, prop, word) ? word : print(a.value));
    } else if (p.t === "boolean" && a.value.t === "raw" && a.value.text === "true") {
      named.push(prop);
    } else if (p.enum && a.value.t === "raw" && /^"[^"\\]*"$/.test(a.value.text) && BARE.test(a.value.text.slice(1, -1))) {
      const word = a.value.text.slice(1, -1);
      named.push(printing.idioms.enums && bareEnumOk(spec.props, prop, word) ? word : `${prop}:${word}`);
    } else {
      named.push(`${prop}:${print(a.value)}`);
    }
  }
  // Positionals in signature order; an optional one after a gap has to be named.
  const positional: string[] = [];
  let gap = false;
  for (const s of slots) {
    const v = given.get(s.prop);
    if (v === undefined) {
      gap = true;
      continue;
    }
    if (!gap || !s.optional) positional.push(v);
    else named.unshift(`${s.prop}:${v}`);
  }
  return `${name}(${[...positional, ...excess, ...children, ...named].join(", ")})`;
}

/** `TextContent("…")` with no options → the string itself (a string child is a TextContent). */
function plainText(n: Node): string | null {
  if (n.t !== "call" || n.name !== "TextContent" || n.args.length !== 1 || n.args[0]!.name) return null;
  const v = n.args[0]!.value;
  return v.t === "raw" && /^"(?:[^"\\]|\\.)*"$/.test(v.text) ? v.text : null;
}

/** A bare enum word is unambiguous when no other enum or flag of the component and no id uses it. */
function bareEnumOk(props: readonly [string, { t: string; enum?: string[] }][], prop: string, word: string): boolean {
  if (printing.ids.has(word)) return false;
  for (const [k, p] of props) {
    if (k === prop) continue;
    if (p.enum?.includes(word)) return false;
    if (p.t === "boolean" && k === word) return false;
  }
  return true;
}

const STATEMENT = /^\s*(\$?[A-Za-z_][\w]*)\s*=(?!=)\s*/;

type Item = { kind: "line"; text: string } | { kind: "stmt"; id: string; value: Node; rest: string };

/** Converts an OpenUI Lang program (or a model reply containing one) to GistUI. */
export function transcode(openui: string, idioms: Idioms = {}, kit: Kit = benchKit): string {
  // Statements can span lines inside brackets: group lines until brackets balance.
  const lines = openui.split("\n");
  const items: Item[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = STATEMENT.exec(lines[i]!);
    if (!m) {
      items.push({ kind: "line", text: lines[i]! });
      continue;
    }
    let text = lines[i]!;
    let depth = balance(text);
    while (depth > 0 && i + 1 < lines.length) {
      text += "\n" + lines[++i];
      depth = balance(text);
    }
    const body = text.slice(m[0].length);
    const toks = tokenize(body);
    const r = new Reader(toks);
    const value = r.expr();
    // Text after the expression (rare): copied after it.
    const rest = r.peek() ? body.slice(toks.slice(0, r.i).reduce((s, t) => s + t.v.length, 0)) : "";
    items.push({ kind: "stmt", id: m[1]!, value, rest: rest.trim() });
  }
  printing = { idioms, ids: new Set(), kit };
  const tables = applyIdioms(items, idioms);
  printing = { idioms, ids: new Set(items.flatMap((it) => (it.kind === "stmt" ? [it.id] : []))), kit };
  const out = items.map((it) => (it.kind === "line" ? it.text : `${it.id} = ${print(it.value)}${it.rest ? ` ${it.rest}` : ""}`));
  printing = { idioms: {}, ids: new Set(), kit: benchKit };
  // Data tables last, as the GistUI prompt asks.
  while (out.length && !out[out.length - 1]!.trim()) out.pop();
  return [...out, ...tables].join("\n");
}

// Idioms ------------------------------------------------------------------------------------------

const ID = /^[A-Za-z_]\w*$/;
const SERIES_CHARTS = new Set(["BarChart", "LineChart", "AreaChart", "HorizontalBarChart", "RadarChart"]);
const VALUE_CHARTS = new Set(["PieChart", "RadialChart", "SingleStackedBarChart"]);

function walk(n: Node, fn: (n: Node) => void): void {
  fn(n);
  if (n.t === "call") n.args.forEach((a) => walk(a.value, fn));
  else if (n.t === "arr") n.items.forEach((x) => walk(x, fn));
}

function applyIdioms(items: Item[], idioms: Idioms): string[] {
  if (!Object.values(idioms).some(Boolean)) return [];
  const stmts = new Map<string, Item & { kind: "stmt" }>();
  for (const it of items) if (it.kind === "stmt") stmts.set(it.id, it);
  // How often each id is mentioned anywhere (exact references and inside expressions).
  const mentions = new Map<string, number>();
  const countIn = (text: string) => {
    for (const w of text.match(/[A-Za-z_]\w*/g) ?? []) if (stmts.has(w)) mentions.set(w, (mentions.get(w) ?? 0) + 1);
  };
  for (const st of stmts.values()) walk(st.value, (n) => n.t === "raw" && !n.text.startsWith('"') && countIn(n.text));
  const once = (n: Node): (Item & { kind: "stmt" }) | null =>
    n.t === "raw" && ID.test(n.text) && mentions.get(n.text) === 1 && n.text !== "root" ? (stmts.get(n.text) ?? null) : null;
  const removed = new Set<string>();
  /** Shared arrays moved into tables: dropped once nothing refers to them any more. */
  const consumed = new Set<string>();
  const tables: string[] = [];
  const taken = new Set(stmts.keys());
  const newId = (base: string) => {
    let id = `${base}Rows`;
    for (let i = 2; taken.has(id); i++) id = `${base}Rows${i}`;
    taken.add(id);
    return id;
  };
  /** A call, directly or through a statement used only here (which is then removed). */
  const callOf = (n: Node, name: string, take: (Item & { kind: "stmt" })[]): (Node & { t: "call" }) | null => {
    if (n.t === "call") return n.name === name ? n : null;
    const st = once(n);
    if (st && st.value.t === "call" && st.value.name === name) {
      take.push(st);
      return st.value;
    }
    return null;
  };
  /** A literal array, directly or through a statement (removed only if used just here). */
  const arrOf = (n: Node, take: (Item & { kind: "stmt" })[]): Node[] | null => {
    if (n.t === "arr") return n.items;
    if (n.t === "raw" && ID.test(n.text)) {
      const st = stmts.get(n.text);
      if (st && st.value.t === "arr") {
        if (mentions.get(n.text) === 1) take.push(st);
        else consumed.add(st.id);
        return st.value.items;
      }
    }
    return null;
  };
  const cell = (n: Node): string | null => {
    if (n.t !== "raw") return null;
    if (/^-?\d+(\.\d+)?$/.test(n.text)) return n.text;
    if (n.text === "null") return "";
    if (!/^"(?:[^"\\]|\\.)*"$/.test(n.text)) return null;
    let v: string;
    try {
      v = JSON.parse(n.text);
    } catch {
      return null;
    }
    // Numbers written as text stay text; a table cell cannot hold a newline.
    if (v.includes("\n")) return null;
    return v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").trim();
  };
  const str = (n: Node | undefined): string | null => (n && n.t === "raw" && /^"(?:[^"\\]|\\.)*"$/.test(n.text) ? (JSON.parse(n.text) as string) : null);
  const table = (header: string[], cols: string[][]) => {
    const rows = cols[0]!.map((_, r) => `|${cols.map((c) => c[r]).join("|")}`);
    return [`|${header.join("|")}`, ...rows].join("\n");
  };
  const header = (s: string) => s.replace(/\|/g, "\\|").replace(/:([ns])$/, ": $1");

  const tryTable = (call: Node & { t: "call" }, owner: string) => {
    const colsArg = call.args[0];
    if (!colsArg || colsArg.name || call.args.length !== 1) return;
    const take: (Item & { kind: "stmt" })[] = [];
    const colNodes = colsArg.value.t === "arr" ? colsArg.value.items : [colsArg.value];
    const labels: string[] = [];
    const data: string[][] = [];
    for (const c of colNodes) {
      const col = callOf(c, "Col", take);
      if (!col || col.args.some((a) => a.name) || col.args.length < 2 || col.args.length > 3) return;
      const label = str(col.args[0]!.value);
      const values = arrOf(col.args[1]!.value, take);
      const type = col.args[2] ? str(col.args[2].value) : null;
      if (label === null || !values || (col.args[2] && type !== "number" && type !== "string")) return;
      const cells = values.map(cell);
      if (cells.some((x) => x === null)) return;
      labels.push(header(label) + (type === "number" ? ":n" : type === "string" ? ":s" : ""));
      data.push(cells as string[]);
    }
    if (!data.length || data.some((d) => d.length !== data[0]!.length) || !data[0]!.length) return;
    const id = newId(owner);
    tables.push(`${id} = ${table(labels, data)}`);
    call.args = [{ value: { t: "raw", text: id } }];
    for (const st of take) removed.add(st.id);
  };

  const tryChart = (call: Node & { t: "call" }, owner: string) => {
    const [a0, a1] = call.args;
    if (!a0 || !a1 || a0.name || a1.name) return;
    const take: (Item & { kind: "stmt" })[] = [];
    const labels = arrOf(a0.value, take);
    if (!labels) return;
    const labelCells = labels.map(cell);
    if (labelCells.some((x) => x === null)) return;
    const heads: string[] = [];
    const cols: string[][] = [labelCells as string[]];
    if (SERIES_CHARTS.has(call.name)) {
      const seriesNodes = a1.value.t === "arr" ? a1.value.items : [a1.value];
      for (const sn of seriesNodes) {
        const s = callOf(sn, "Series", take);
        if (!s || s.args.length !== 2 || s.args.some((a) => a.name)) return;
        const cat = str(s.args[0]!.value);
        const vals = arrOf(s.args[1]!.value, take);
        if (cat === null || !vals || vals.some((v) => v.t !== "raw" || !/^-?\d+(\.\d+)?$/.test(v.text))) return;
        heads.push(header(cat));
        cols.push(vals.map((v) => (v as { text: string }).text));
      }
    } else {
      const vals = arrOf(a1.value, take);
      if (!vals || vals.some((v) => v.t !== "raw" || !/^-?\d+(\.\d+)?$/.test(v.text))) return;
      heads.push("Value");
      cols.push(vals.map((v) => (v as { text: string }).text));
    }
    if (cols.length < 2 || cols.some((c) => c.length !== cols[0]!.length) || !cols[0]!.length) return;
    const x = SERIES_CHARTS.has(call.name) && call.name !== "RadarChart" ? str(call.args[3]?.value) : null;
    const id = newId(owner);
    tables.push(`${id} = ${table([header(x ?? "Label"), ...heads], cols)}`);
    call.args = [{ value: { t: "raw", text: id } }, { value: SKIP }, ...call.args.slice(2)];
    for (const st of take) removed.add(st.id);
  };

  for (const st of stmts.values()) {
    walk(st.value, (n) => {
      if (n.t !== "call") return;
      if (idioms.tables && n.name === "Table") tryTable(n, st.id);
      if (idioms.charts && (SERIES_CHARTS.has(n.name) || VALUE_CHARTS.has(n.name))) tryChart(n, st.id);
    });
  }

  // Plain text: a TextContent statement used once, in a children list, becomes the string.
  // Inline leaves: a component statement with no references inside, used once, moves to its use.
  if (idioms.text || idioms.inline) {
    const refsInside = (n: Node) => {
      let has = false;
      walk(n, (x) => {
        if (x.t === "raw" && !x.text.startsWith('"')) for (const w of x.text.match(/[A-Za-z_]\w*/g) ?? []) if (stmts.has(w) && !removed.has(w)) has = true;
      });
      return has;
    };
    const leaf = new Set<string>();
    const rootRefs = new Set<string>();
    const rootSt = stmts.get("root");
    if (rootSt) walk(rootSt.value, (n) => n.t === "raw" && ID.test(n.text) && rootRefs.add(n.text));
    for (const st of stmts.values()) {
      if (removed.has(st.id) || st.id === "root" || mentions.get(st.id) !== 1 || st.value.t !== "call") continue;
      if (idioms.deep ? rootRefs.has(st.id) : refsInside(st.value)) continue;
      if (idioms.inline || (idioms.text && plainText(st.value))) leaf.add(st.id);
    }
    const replace = (n: Node): Node => {
      if (n.t === "raw" && leaf.has(n.text)) {
        removed.add(n.text);
        return stmts.get(n.text)!.value;
      }
      if (n.t === "call") n.args = n.args.map((a) => ({ ...a, value: replace(a.value) }));
      else if (n.t === "arr") n.items = n.items.map(replace);
      return n;
    };
    if (idioms.deep) {
      // Nested single-use statements: inline into each other first, then into the kept ones.
      for (const id of leaf) stmts.get(id)!.value = replace(stmts.get(id)!.value);
    }
    for (const st of stmts.values()) if (!leaf.has(st.id)) st.value = replace(st.value);
  }

  if (consumed.size) {
    const still = new Set<string>();
    for (const st of stmts.values()) {
      if (removed.has(st.id)) continue;
      walk(st.value, (n) => {
        if (n.t === "raw" && !n.text.startsWith('"')) for (const w of n.text.match(/[A-Za-z_]\w*/g) ?? []) if (consumed.has(w) && w !== st.id) still.add(w);
      });
    }
    for (const id of consumed) if (!still.has(id)) removed.add(id);
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.kind === "stmt" && removed.has(it.id)) items.splice(i, 1);
  }
  return tables;
}

function balance(s: string): number {
  let d = 0;
  for (const t of tokenize(s)) {
    if (t.k !== "p") continue;
    if ("([{".includes(t.v)) d++;
    else if (")]}".includes(t.v)) d--;
  }
  return d;
}
