/**
 * AST → GistUI printer. `printProgram` produces the canonical printout used for edit turns: patches and
 * appends are folded in, and with `hoist` every inline component becomes its own `_cN` statement so
 * the model can address anything by id.
 */

import type { Arg, CompExpr, Expr, TableData } from "./ast";
import type { Program } from "./program";
import type { Library } from "./schema";

// The same test as `toNumber` in ./table, kept here so the printer (loaded on demand by autofix)
// does not pull in the table parser.
const isNumberCell = (cell: string): boolean => /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(cell.replace(/[\s,$€£¥%+]/g, ""));

const PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

const BARE = /^(?:[a-z_]\w*|\d+[a-zA-Z]\w*)$/;
const KEYWORDS = new Set(["true", "false", "null"]);

export function printExpr(e: Expr, prec = 0): string {
  switch (e.k) {
    case "str":
      return JSON.stringify(e.v);
    case "num":
      return Object.is(e.v, -0) ? "0" : String(e.v);
    case "bool":
      return String(e.v);
    case "null":
      return "null";
    case "ref":
      return e.name;
    case "state":
      return `$${e.name}`;
    case "enum":
      return BARE.test(e.v) && !KEYWORDS.has(e.v) ? e.v : JSON.stringify(e.v);
    case "flag":
      return e.name;
    case "comp":
      return `${e.name}(${printArgs(e.args)})`;
    case "builtin":
      return `@${e.name}(${printArgs(e.args)})`;
    case "arr":
      return `[${e.items.map((i) => printExpr(i)).join(", ")}]`;
    case "obj":
      return `{${e.entries.map(([k, v]) => `${/^[A-Za-z_]\w*$/.test(k) ? k : JSON.stringify(k)}:${printExpr(v)}`).join(", ")}}`;
    case "bin": {
      const p = PREC[e.op]!;
      const s = `${printExpr(e.l, p)} ${e.op} ${printExpr(e.r, p + 1)}`;
      return p < prec ? `(${s})` : s;
    }
    case "un": {
      const s = `${e.op}${printExpr(e.e, 7)}`;
      return prec > 7 ? `(${s})` : s;
    }
    case "cond": {
      const s = `${printExpr(e.c, 1)} ? ${printExpr(e.t)} : ${printExpr(e.f)}`;
      return prec > 0 ? `(${s})` : s;
    }
    case "member":
      return `${printExpr(e.o, 8)}.${e.name}`;
    case "index":
      return `${printExpr(e.o, 8)}[${printExpr(e.i)}]`;
    case "lambda": {
      const params = e.params.length === 1 ? e.params[0]! : `(${e.params.join(", ")})`;
      const s = `${params} => ${printExpr(e.body)}`;
      return prec > 0 ? `(${s})` : s;
    }
  }
}

function printArgs(args: readonly Arg[]): string {
  return args.map((a) => (a.name ? `${a.name}:${printExpr(a.value)}` : printExpr(a.value))).join(", ");
}

/** Prints a table as pipe rows, adding a type hint only where the first row would infer another type. */
export function printTable(t: TableData): string {
  const first = t.text[0];
  const header = t.columns.map((c, i) => {
    const inferred = first ? (isNumberCell(first[i] ?? "") ? "number" : "string") : "string";
    const name = escapeCell(c.name);
    return inferred === c.type ? name : `${name}:${c.type === "number" ? "n" : "s"}`;
  });
  const lines = [`|${header.join("|")}`];
  // A row of only empty cells is written `||`: a lone `|` would not be read back as a row.
  for (const row of t.text) lines.push(row.every((c) => c === "") ? `|${"|".repeat(Math.max(1, row.length))}` : `|${row.map(escapeCell).join("|")}`);
  return lines.join("\n");
}

const escapeCell = (s: string) => s.replace(/\|/g, "\\|");

export interface PrintOptions {
  /** Hoist every inline component into its own `_cN` statement (the edit-mode printout). */
  hoist?: boolean;
  /** Drop statements that are not reachable from `root`. */
  gc?: boolean;
}

/** Prints a program, folding in patches and appends. */
export function printProgram(program: Program, lib: Library, opts: PrintOptions = {}): string {
  let ids = program.statementIds();
  if (opts.gc) ids = reachable(program, ids);
  let seq = 0;
  for (const id of ids) {
    const m = /^_c(\d+)$/.exec(id);
    if (m) seq = Math.max(seq, Number(m[1]));
  }
  const taken = new Set(ids);
  const nextId = () => {
    let id: string;
    do id = `_c${++seq}`;
    while (taken.has(id));
    taken.add(id);
    return id;
  };

  const out: string[] = [];
  for (const id of ids) {
    const s = program.statement(id)!;
    if (s.table) {
      out.push(`${id} = ${printTable(s.table)}`);
      continue;
    }
    if (!s.expr) continue;
    if (s.kind === "state") {
      out.push(`${id} = ${printExpr(s.expr)}`);
      continue;
    }
    // References the program dropped (to statements deleted or never defined) are left out, as the
    // store leaves them out. A bare word that was read as an enum value or as text is not one of them.
    let expr = s.expr;
    if (expr.k === "comp") expr = prune(fold(expr, s.overrides, s.appends, lib, s.argOf), s.dropped);
    else if (expr.k === "arr") expr = prune(expr, s.dropped);
    if (!opts.hoist) {
      out.push(`${id} = ${printExpr(expr)}`);
      continue;
    }
    const extra: string[] = [];
    // A list statement's inline components are hoisted too (`items = [Card(…)]` → `items = [_c1]`).
    const hoisted = expr.k === "comp" ? hoistTop(expr, nextId, extra) : expr.k === "arr" || expr.k === "obj" ? hoist(expr, nextId, extra) : expr;
    out.push(`${id} = ${printExpr(hoisted)}`, ...extra);
  }
  return out.join("\n") + "\n";
}

/**
 * Folds `id.prop = v` patches and `id += child` appends into a component call. `argOf` says which
 * argument filled each prop when the program was built, so a patch replaces that argument.
 */
function fold(expr: CompExpr, overrides: ReadonlyMap<string, Expr>, appends: readonly Expr[], lib: Library, argOf: ReadonlyMap<string, number>): CompExpr {
  if (!overrides.size && !appends.length) return expr;
  const comp = lib.get(expr.name);
  const args = expr.args.slice();
  for (const [key, value] of overrides) {
    const name = comp?.propLookup.get(key.toLowerCase()) ?? key;
    const named = args.findIndex((a) => a.name && (comp?.propLookup.get(a.name.toLowerCase()) ?? a.name) === name);
    if (named >= 0) {
      args[named] = { name: args[named]!.name!, value };
      continue;
    }
    const at = argOf.get(name);
    const cur = at !== undefined ? args[at] : undefined;
    if (cur && !cur.name) {
      // A bare word (a flag, an enum value) stood for the prop: write it by name. A value in a
      // positional slot stays in its slot.
      const word = cur.value.k === "flag" ? cur.value.name : cur.value.k === "ref" ? cur.value.name : undefined;
      const bare = word !== undefined && (comp?.flags.has(word) || comp?.enumWords.get(word) === name) && !comp?.positional.includes(name);
      args[at!] = bare ? { name, value } : { value };
      continue;
    }
    args.push({ name, value });
  }
  // Appended children go after the existing positional args, before named ones.
  const lastPositional = args.reduce((n, a, i) => (a.name ? n : i), -1);
  args.splice(lastPositional + 1, 0, ...appends.map((value) => ({ value })));
  return { k: "comp", name: expr.name, args };
}

/** Removes refs to unknown statements from static positions (args, arrays, objects). */
function prune<E extends Expr>(e: E, dropped: ReadonlySet<string>): E {
  if (!dropped.size) return e;
  const gone = (x: Expr) => x.k === "ref" && dropped.has(x.name);
  if (e.k === "comp") {
    return { ...e, args: e.args.filter((a) => !gone(a.value)).map((a) => ({ ...a, value: prune(a.value, dropped) })) };
  }
  if (e.k === "arr") return { ...e, items: e.items.filter((i) => !gone(i)).map((i) => prune(i, dropped)) };
  if (e.k === "obj") return { ...e, entries: e.entries.filter(([, v]) => !gone(v)).map(([k, v]) => [k, prune(v, dropped)] as [string, Expr]) };
  return e;
}

/** Hoists inline components found in static positions of a top-level component call. */
function hoistTop(expr: Expr, nextId: () => string, out: string[]): Expr {
  if (expr.k !== "comp") return expr;
  return { k: "comp", name: expr.name, args: expr.args.map((a) => ({ ...a, value: hoist(a.value, nextId, out) })) };
}

function hoist(e: Expr, nextId: () => string, out: string[]): Expr {
  if (e.k === "comp") {
    const id = nextId();
    const inner: string[] = [];
    const body = hoistTop(e, nextId, inner);
    out.push(`${id} = ${printExpr(body)}`, ...inner);
    return { k: "ref", name: id };
  }
  if (e.k === "arr") return { k: "arr", items: e.items.map((i) => hoist(i, nextId, out)) };
  if (e.k === "obj") return { k: "obj", entries: e.entries.map(([k, v]) => [k, hoist(v, nextId, out)] as [string, Expr]) };
  return e;
}

function reachable(program: Program, ids: string[]): string[] {
  const seen = new Set<string>();
  const byId = new Set(ids);
  // Without a `root` statement the root is the first component (as the program itself chooses).
  const chosen = program.store.root;
  const start = byId.has("root") ? "root" : chosen && byId.has(chosen) ? chosen : ids[0];
  if (!start) return [];
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    const s = program.statement(id);
    if (!s) continue;
    const refs = new Set<string>();
    if (s.expr) collectRefs(s.expr, refs, new Set());
    for (const v of s.overrides.values()) collectRefs(v, refs, new Set());
    for (const v of s.appends) collectRefs(v, refs, new Set());
    for (const r of refs) stack.push(r);
  }
  return ids.filter((id) => seen.has(id));
}

function collectRefs(e: Expr, out: Set<string>, bound: Set<string>): void {
  switch (e.k) {
    case "ref":
      if (!bound.has(e.name)) out.add(e.name);
      return;
    case "state":
      out.add(`$${e.name}`);
      return;
    case "comp":
    case "builtin":
      for (const a of e.args) collectRefs(a.value, out, bound);
      return;
    case "arr":
      for (const i of e.items) collectRefs(i, out, bound);
      return;
    case "obj":
      for (const [, v] of e.entries) collectRefs(v, out, bound);
      return;
    case "bin":
      collectRefs(e.l, out, bound);
      collectRefs(e.r, out, bound);
      return;
    case "un":
      collectRefs(e.e, out, bound);
      return;
    case "cond":
      collectRefs(e.c, out, bound);
      collectRefs(e.t, out, bound);
      collectRefs(e.f, out, bound);
      return;
    case "member":
      collectRefs(e.o, out, bound);
      return;
    case "index":
      collectRefs(e.o, out, bound);
      collectRefs(e.i, out, bound);
      return;
    case "lambda": {
      const inner = new Set(bound);
      for (const p of e.params) inner.add(p);
      collectRefs(e.body, out, inner);
      return;
    }
  }
}
