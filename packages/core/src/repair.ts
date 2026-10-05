/**
 * Deterministic repair: turns a program with mistakes into a valid one, in code, with no model call.
 *
 * The program is printed in canonical form (every inline component becomes its own `_cN`
 * statement, so each call is addressable), then each error is fixed at the statement it points to,
 * and the result is parsed again, for a few rounds:
 *
 * | Error                          | Fix                                                             |
 * |--------------------------------|-----------------------------------------------------------------|
 * | unknown prop, extra argument   | removed                                                         |
 * | invalid value, optional prop   | removed (the prop's default applies)                            |
 * | invalid value, required prop   | closest allowed value, or the first; a name becomes its text   |
 * | missing required prop          | filled (a name from the call, the first enum value, 0, [] …);   |
 * |                                | a missing component or data prop removes the component         |
 * | reference to nothing           | removed from the call                                           |
 * | statement nothing uses         | a component is added to root's children, a data table is shown |
 * |                                | in a Table there; anything else removed                         |
 * | unknown component              | renamed when it is a typo, else a plain container               |
 * | cycle                          | the reference that closes the loop is removed                   |
 *
 * Before that, on the text as written (`prepare`), so the parser drops nothing it could have read:
 * a table written inside a call moves to its own statement, curly quotes become quotes, a statement
 * with an unreadable argument is cut back to what reads, a reference that misses a statement by case
 * or one letter points at it, and a bare component name is called. A program with no root and
 * several sections gets a root that holds them. Only code is changed: text in strings, table cells
 * and chat around a fenced program stays as written.
 *
 * Every change is listed, so a caller can log or show what was repaired.
 */

import type { Arg, CompExpr, Expr } from "./ast";
import type { GistUIError } from "./errors";
import type { parseStatement as ParseStatement } from "./parser";
import { printExpr, printProgram } from "./printer";
import type { Library, PropSpec } from "./schema";
import type { parse as Parse } from "./stream";

/**
 * The parser functions autofix uses, passed in: a renderer already has them loaded, so this module
 * (loaded on demand) shares nothing with the main bundle but the printer.
 */
export interface AutofixDeps {
  parse: typeof Parse;
  parseStatement: typeof ParseStatement;
  /** The error codes autofix repairs (`REPAIRABLE` in `@gistui/core`). */
  repairable: ReadonlySet<string>;
}
// Set for the duration of one (synchronous) autofix call.
let parse!: typeof Parse;
let parseStatement!: typeof ParseStatement;
let REPAIRABLE!: ReadonlySet<string>;

/** `autofix` bound to the given parser functions (see `@gistui/core`'s `autofix` for the API). */
export function createAutofix(deps: AutofixDeps): typeof autofix {
  return (text, lib, opts) => {
    parse = deps.parse;
    parseStatement = deps.parseStatement;
    REPAIRABLE = deps.repairable;
    return autofix(text, lib, opts);
  };
}

export interface AutofixResult {
  /** The repaired program (canonical form). */
  source: string;
  /** What was changed, one line each. */
  changes: string[];
  /** Errors left after repair. */
  errors: GistUIError[];
  valid: boolean;
}

const HEAD = /^(\$?[A-Za-z_]\w*)(\.[A-Za-z_]\w*)?\s*(\+?=)/;

/** Splits canonical source into statements (a table's rows stay with its head line). */
function statements(source: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const line of source.split("\n")) {
    const m = HEAD.exec(line);
    if (m && !line.startsWith("|")) out.push({ id: m[1]!, text: line });
    else if (out.length && line.trim()) out[out.length - 1]!.text += `\n${line}`;
  }
  return out;
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length]![b.length]!;
}

const humanize = (id: string) => id.replace(/_c\d+$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";

/** A value for a missing required prop, or null when none can be made up (a component, data). */
function filler(spec: PropSpec, name: string, call: CompExpr, stmtId: string, args: readonly string[] = []): Expr | null {
  const firstText = call.args.map((a) => a.value).find((v): v is { k: "str"; v: string } => v.k === "str")?.v;
  switch (spec.type) {
    case "string":
      if (/^(value|name|id|key)$/i.test(name)) {
        // A value that follows its label (`Stat(label, value)`) is shown: a neutral placeholder.
        // Otherwise it is an identifier (`Item(value, title)`): a slug of the call's text.
        const at = args.findIndex((a) => a.replace(/\?$/, "") === name);
        if (/^value$/i.test(name) && at > 0 && /label|title|name/i.test(args[at - 1] ?? "")) return { k: "str", v: "—" };
        return { k: "str", v: slug(firstText ?? humanize(stmtId)) };
      }
      return { k: "str", v: firstText && !/title|label|text/i.test(name) ? firstText : humanize(stmtId) };
    case "enum":
      return { k: "enum", v: (spec.default as string | undefined) ?? spec.values[0]! };
    case "number":
      return { k: "num", v: typeof spec.default === "number" ? spec.default : 0 };
    case "boolean":
      return { k: "bool", v: false };
    case "array":
      return { k: "arr", items: [] };
    case "object":
      return { k: "obj", entries: [] };
    default:
      return null;
  }
}

/** A component that shows a data table by itself (`Table(rows)`): it takes a pipe table, or one required data argument. */
function tableViewer(lib: Library): string | undefined {
  const fits = [...lib.components.values()].filter(
    (c) => c.spec.table || (c.requiredPositional === 1 && c.spec.props[(c.spec.args?.[0] ?? "").replace(/\?$/, "")]?.type === "data"),
  );
  return (fits.find((c) => c.spec.name === "Table") ?? fits[0])?.spec.name;
}

/** Every statement a value refers to. */
function refsOf(e: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(e)) for (const x of e) refsOf(x, out);
  else if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (o.k === "ref" && typeof o.name === "string") out.add(o.name);
    // A state variable is the statement `$name`.
    else if (o.k === "state" && typeof o.name === "string") out.add(o.name.startsWith("$") ? o.name : `$${o.name}`);
    for (const k in o) if (k !== "name") refsOf(o[k], out);
  }
  return out;
}

/** Replaces every use of `from` in a value with `to`. */
function replaceRef(e: Expr, from: string, to: Expr): Expr {
  if (e.k === "ref" && e.name === from) return to;
  if (e.k === "arr") return { ...e, items: e.items.map((x) => replaceRef(x, from, to)) };
  return e;
}
const renameRef = (e: Expr, from: string, to: string): Expr => replaceRef(e, from, { k: "ref", name: to } as Expr);

/** Removes every use of `name` from a value (a reference, or an item of a list). */
function dropRef(e: Expr, name: string): Expr | null {
  if (e.k === "ref" && e.name === name) return null;
  if (e.k === "arr") return { ...e, items: e.items.map((x) => dropRef(x, name)).filter((x): x is Expr => x !== null) };
  return e;
}

/**
 * `inline`: the text is chat with ```gistui fences. `shape: "original"` returns the repaired program
 * with inline components back inside their parents (as the model wrote them), so a renderer can
 * apply it in place; the default is the canonical form, with every component its own statement.
 */
function autofix(text: string, lib: Library, opts: { inline?: boolean; rounds?: number; shape?: "canonical" | "original" } = {}): AutofixResult {
  const changes: string[] = [];
  const inline = opts.inline ?? false;
  let source = addRoot(printProgram(parse(prepare(text, lib, inline, changes), lib, { inline }).program, lib, { hoist: true }), lib, changes);
  let errors: GistUIError[] = [];
  for (let round = 0; round < (opts.rounds ?? 6); round++) {
    const r = parse(source, lib);
    errors = r.errors.filter((e) => REPAIRABLE.has(e.code));
    if (!errors.length) break;
    const stmts = statements(source);
    const byId = new Map(stmts.map((s) => [s.id, s]));
    const drop = new Set<string>();
    const toRoot: Expr[] = [];
    const shifted = new Set<string>();
    const edits = new Map<string, { call: CompExpr; remove: Set<number>; add: Arg[]; replace: Map<number, Expr> }>();
    const edit = (id: string) => {
      const cur = edits.get(id);
      if (cur) return cur;
      const s = byId.get(id);
      const p = s ? parseStatement(s.text, lib) : null;
      const v = p?.stmt && p.stmt.kind === "assign" ? p.stmt.value : null;
      if (!v || v.k !== "comp") return null;
      const e = { call: v, remove: new Set<number>(), add: [] as Arg[], replace: new Map<number, Expr>() };
      edits.set(id, e);
      return e;
    };
    const argIndex = (call: CompExpr, arg: string | undefined) => (arg === undefined ? -1 : /^\d+$/.test(arg) ? Number(arg) : call.args.findIndex((a) => a.name === arg));

    const unused = errors.filter((x) => x.code === "unreachable" && x.stmtId).map((x) => x.stmtId!);
    // Unused statements often use each other (a section and its table). Only the top of each group
    // is placed; the rest comes along with it. Found from real references, so a name inside a string
    // or a table header does not count, and a group that uses itself in a loop still gets placed.
    const parsed = new Map<string, Expr | null>();
    const valueOf = (id: string): Expr | null => {
      if (parsed.has(id)) return parsed.get(id)!;
      const s = byId.get(id);
      const p = s ? parseStatement(s.text, lib).stmt : null;
      const v = p?.kind === "assign" ? p.value : null;
      parsed.set(id, v);
      return v;
    };
    const unusedSet = new Set(unused);
    const uses = new Map(unused.map((u) => [u, [...refsOf(valueOf(u))].filter((r) => r !== u && unusedSet.has(r))]));
    const isCompStmt = (u: string) => valueOf(u)?.k === "comp";
    const comesAlong = new Set<string>();
    const carry = (u: string) => {
      for (const r of uses.get(u) ?? []) if (!comesAlong.has(r)) (comesAlong.add(r), carry(r));
    };
    const tops = unused.filter((u) => !unused.some((p) => p !== u && isCompStmt(p) && uses.get(p)!.includes(u)));
    for (const t of tops) if (isCompStmt(t)) carry(t);
    for (const u of unused) {
      if (comesAlong.has(u) || tops.includes(u)) continue;
      tops.push(u);
      if (isCompStmt(u)) carry(u);
    }
    for (const err of errors) {
      const id = err.stmtId;
      if (!id) continue;
      const e = edit(id);
      const comp = e ? lib.get(e.call.name) : undefined;
      switch (err.code) {
        case "unknown-prop":
        case "excess-args": {
          const i = e ? argIndex(e.call, err.arg) : -1;
          if (e && i >= 0) {
            e.remove.add(i);
            changes.push(`${id}: removed ${err.code === "unknown-prop" ? `unknown prop "${err.arg}"` : "an extra argument"}`);
          }
          break;
        }
        case "invalid-enum":
        case "invalid-prop": {
          const i = e ? argIndex(e.call, err.arg) : -1;
          const spec = err.prop && comp ? comp.spec.props[err.prop] : undefined;
          if (!e || i < 0 || !spec) break;
          const given = e.call.args[i]!.value;
          // The parser already chose a value (a close typo, `lnie` → line): use the same one.
          if (err.use && spec.type === "enum") {
            e.replace.set(i, { k: "enum", v: err.use });
            changes.push(`${id}: ${err.prop} → ${err.use}`);
          } else if (!spec.required) {
            e.remove.add(i);
            changes.push(`${id}: dropped invalid ${err.prop}`);
          } else if (spec.type === "enum" && given.k === "str" && /^\d+$/.test(err.arg!) && !spec.values.some((x) => editDistance(given.v.toLowerCase(), x.toLowerCase()) <= 2)) {
            // Free text in a required enum's positional slot (`Callout("Title", "Text")`): the text was
            // meant for the next slots. Give the enum by name so the text shifts into place.
            const v = (spec.default as string | undefined) ?? spec.values[0]!;
            e.add.push({ name: err.prop!, value: { k: "enum", v } });
            shifted.add(id);
            changes.push(`${id}: added missing ${err.prop} ${v} (the text moves to the next slot)`);
          } else if (spec.type === "enum") {
            const word = given.k === "str" || given.k === "enum" ? given.v : given.k === "ref" ? given.name : "";
            const best = [...spec.values].sort((a, b) => editDistance(word.toLowerCase(), a.toLowerCase()) - editDistance(word.toLowerCase(), b.toLowerCase()))[0]!;
            e.replace.set(i, { k: "enum", v: best });
            changes.push(`${id}: ${err.prop} "${word}" → ${best}`);
          } else if (spec.type === "string" && given.k === "ref") {
            e.replace.set(i, { k: "str", v: given.name });
            changes.push(`${id}: ${err.prop} uses the text "${given.name}"`);
          } else {
            const f = filler(spec, err.prop!, e.call, id, comp?.spec.args);
            if (f) {
              e.replace.set(i, f);
              changes.push(`${id}: replaced invalid ${err.prop}`);
            } else {
              drop.add(id);
              changes.push(`${id}: removed (invalid ${err.prop})`);
            }
          }
          break;
        }
        case "missing-required": {
          const spec = err.prop && comp ? comp.spec.props[err.prop] : undefined;
          // After a shift, the slots are filled differently: check again next round.
          if (!e || !spec || shifted.has(id) || e.add.some((a) => a.name === err.prop)) break;
          const f = filler(spec, err.prop!, e.call, id, comp?.spec.args);
          if (f) {
            e.add.push({ name: err.prop!, value: f });
            changes.push(`${id}: filled missing ${err.prop} with ${printExpr(f)}`);
          } else {
            drop.add(id);
            changes.push(`${id}: removed (missing ${err.prop})`);
          }
          break;
        }
        case "unresolved-ref": {
          if (!err.ref) break;
          if (!e) {
            // Not a component call (`cols = [a, missing]`, `x = Missing`): the statement goes; what
            // refers to it is cleaned up in the next round.
            drop.add(id);
            changes.push(`${id}: removed (it refers to undefined "${err.ref}")`);
            break;
          }
          e.call.args.forEach((a, i) => {
            const v = dropRef(a.value, err.ref!);
            if (v === null) e.remove.add(i);
            else if (v !== a.value) e.replace.set(i, v);
          });
          changes.push(`${id}: removed reference to undefined "${err.ref}"`);
          break;
        }
        case "unreachable": {
          const s = byId.get(id);
          const v = s ? parseStatement(s.text, lib).stmt : null;
          const isComp = v?.kind === "assign" && v.value.k === "comp";
          // Data the model wrote but never showed (`riskRows = |Learner|Score …`) is shown as a table.
          const viewer = v?.kind === "table" ? tableViewer(lib) : undefined;
          // Part of another unused statement (its child): it comes along with that one.
          if (comesAlong.has(id) && !tops.includes(id)) break;
          if ((isComp || viewer) && byId.has("root") && lib.get(edit("root")?.call.name ?? "")?.hasChildren) {
            toRoot.push(viewer ? ({ k: "comp", name: viewer, args: [{ value: { k: "ref", name: id } }] } as CompExpr) : ({ k: "ref", name: id } as Expr));
            changes.push(viewer ? `${id}: shown in a ${viewer} on root (it was defined but not used)` : `${id}: added to root (it was defined but not used)`);
          } else {
            drop.add(id);
            changes.push(`${id}: removed (defined but not used)`);
          }
          break;
        }
        case "unknown-component": {
          if (!e) {
            drop.add(id);
            changes.push(`${id}: removed (unknown component)`);
            break;
          }
          // A near-certain typo (`Txt`, `Buton`) is renamed; anything else (`Row` in a catalog
          // without one) becomes a plain container that keeps its contents.
          const name = e.call.name;
          const close = (err.use && lib.get(err.use) ? err.use : undefined) ?? [...lib.components.keys()].find((k) => k.toLowerCase() === name.toLowerCase() || editDistance(k.toLowerCase(), name.toLowerCase()) <= (name.length >= 6 ? 2 : 1));
          const box = close ?? [...lib.components.values()].find((c) => c.hasChildren && c.requiredPositional === 0)?.spec.name;
          if (!box) {
            drop.add(id);
            changes.push(`${id}: removed (unknown component ${name})`);
            break;
          }
          e.call = { ...e.call, name: box, args: close ? e.call.args : e.call.args.filter((a) => !a.name) };
          changes.push(`${id}: unknown ${name} → ${box}`);
          break;
        }
        case "cycle": {
          // Only the reference that closes the loop goes; the rest of the statement stays.
          if (e && err.ref) {
            let cut = false;
            e.call.args.forEach((a, i) => {
              const v = dropRef(a.value, err.ref!);
              if (v === null) {
                e.remove.add(i);
                cut = true;
              } else if (v !== a.value) {
                e.replace.set(i, v);
                cut = true;
              }
            });
            if (cut) {
              changes.push(`${id}: removed the reference to "${err.ref}" (it contained itself)`);
              break;
            }
          }
          drop.add(id);
          changes.push(`${id}: removed (it contained itself)`);
          break;
        }
      }
    }
    if (toRoot.length) edit("root")!.add.push(...toRoot.map((value): Arg => ({ value })));

    const before = source;
    source = stmts
      .filter((s) => !drop.has(s.id))
      .map((s) => {
        const e = edits.get(s.id);
        if (!e) return s.text;
        const args = e.call.args.map((a, i) => (e.replace.has(i) ? { ...a, value: e.replace.get(i)! } : a)).filter((_, i) => !e.remove.has(i));
        return `${s.id} = ${printExpr({ ...e.call, args: [...args, ...e.add] })}`;
      })
      .join("\n")
      .concat("\n");
    if (source === before) break;
  }
  errors = parse(source, lib).errors.filter((e) => REPAIRABLE.has(e.code));
  return { source: opts.shape === "original" ? inlineHoisted(source, lib) : source, changes, errors, valid: errors.length === 0 };
}

/** Whether the quote at `i` opens a string: `"` always, `'` only where a value can start (`O'Brien` is text). */
function opensString(s: string, i: number): boolean {
  if (s[i] === '"') return true;
  if (s[i] !== "'") return false;
  let j = i - 1;
  while (j >= 0 && (s[j] === " " || s[j] === "\t")) j--;
  return j < 0 || !/[\w)\]}"']/.test(s[j]!);
}

/** The index just after the string literal that opens at `i`; a string ends with its line. */
function skipString(s: string, i: number): number {
  const quote = s[i];
  let j = i + 1;
  while (j < s.length && s[j] !== quote && s[j] !== "\n") j += s[j] === "\\" ? 2 : 1;
  return Math.min(s.length, j + 1);
}

/** A statement whose value is a pipe table (`rows = |A|B`): its cells are data, not code. */
const TABLE_HEAD = /^\s*\$?[A-Za-z_]\w*\s*=\s*(?=\|)/;

/** Maps each line of code. In chat text (`inline`), only the lines inside ``` fences are code. */
function codeLines(text: string, inline: boolean, fn: (line: string) => string[]): string {
  let fenced = false;
  return text
    .split("\n")
    .flatMap((line) => {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        return [line];
      }
      return inline && !fenced ? [line] : fn(line);
    })
    .join("\n");
}

/** Applies `fn` to the code between string literals; strings, table cells and chat text stay as written. */
function outsideStrings(text: string, inline: boolean, fn: (code: string) => string): string {
  return codeLines(text, inline, (line) => {
    if (line.startsWith("|")) return [line];
    const head = TABLE_HEAD.exec(line);
    if (head) return [fn(head[0]) + line.slice(head[0].length)];
    let out = "";
    let code = "";
    for (let i = 0; i < line.length; ) {
      if (opensString(line, i)) {
        const j = skipString(line, i);
        out += fn(code) + line.slice(i, j);
        code = "";
        i = j;
      } else code += line[i++];
    }
    return [out + fn(code)];
  });
}

/** How many brackets a line of code leaves open (negative: it closes more than it opens). */
function depthOf(line: string): number {
  if (line.startsWith("|") || TABLE_HEAD.test(line)) return 0;
  let depth = 0;
  for (let i = 0; i < line.length; ) {
    if (opensString(line, i)) {
      i = skipString(line, i);
      continue;
    }
    const c = line[i++]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
  }
  return depth;
}

/** The index of the bracket that closes the one at `open`, or -1 when it is never closed. */
function closing(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; ) {
    if (opensString(s, i)) {
      i = skipString(s, i);
      continue;
    }
    const c = s[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if ((c === ")" || c === "]" || c === "}") && --depth === 0) return i;
    i++;
  }
  return -1;
}

/** Splits an argument list at its top-level commas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; ) {
    if (opensString(s, i)) {
      i = skipString(s, i);
      continue;
    }
    const c = s[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
    i++;
  }
  out.push(s.slice(from));
  return out.filter((a) => a.trim());
}

/** Whether the parser reads a statement with nothing left over (`"a" + new Date()` reads, with a leftover). */
function readsCleanly(stmt: string, lib: Library): boolean {
  const p = parseStatement(stmt, lib);
  return p.stmt !== null && !p.problems.some((x) => !x.soft);
}

/**
 * The readable part of an expression the parser rejects, so one bad token does not cost a whole
 * statement: inside a call or a list, each argument is kept if it reads, repaired the same way if it
 * is itself a call, cut back to its text if it starts with a string (`"Today is " + new Date()`,
 * `"count: 0"?`), and dropped otherwise. Null when nothing readable is left.
 */
function salvage(expr: string, lib: Library, lost: string[], depth = 0): string | null {
  const text = expr.trim();
  if (!text) return null;
  const reads = (e: string) => readsCleanly(`_x = ${e}`, lib);
  if (reads(text)) return text;
  const call = /^((?:[A-Z]\w*|@\w+)\s*)?[([]/.exec(text);
  if (call && depth < 32) {
    const open = call[0].length - 1;
    const close = closing(text, open);
    // Something unreadable after the closing bracket (`Tags([…])?no`): the call itself is kept.
    if (close !== -1 && text.slice(close + 1).trim()) {
      lost.push(text.slice(close + 1).trim());
      return salvage(text.slice(0, close + 1), lib, lost, depth + 1);
    }
    const args = splitArgs(text.slice(open + 1, close === -1 ? text.length : close)).map((arg) => {
      const named = /^\s*([A-Za-z_]\w*)\s*[:=](?!=)\s*/.exec(arg);
      const value = salvage(named ? arg.slice(named[0].length) : arg, lib, lost, depth + 1);
      return value === null ? null : named ? `${named[1]}:${value}` : value;
    });
    const kept = `${call[1]?.trim() ?? ""}${text[open]}${args.filter((a) => a !== null).join(", ")}${text[open] === "(" ? ")" : "]"}`;
    if (reads(kept)) return kept;
  } else if (opensString(text, 0)) {
    const end = skipString(text, 0);
    const str = text.slice(0, end);
    if (reads(str)) {
      lost.push(text.slice(end).trim());
      return str;
    }
  }
  lost.push(text);
  return null;
}

/** A statement without its `#` and `//` comments (the lexer drops them before the parser sees it). */
function stripComments(stmt: string): string {
  return stmt
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; ) {
        if (opensString(line, i)) i = skipString(line, i);
        else if (line[i] === "#" || (line[i] === "/" && line[i + 1] === "/")) return line.slice(0, i);
        else i++;
      }
      return line;
    })
    .join("\n");
}

/** A line that starts a statement at column 0: `id =`, `$id =`, `id.prop =`, `id +=`. */
const NEXT_HEAD = /^\$?[A-Za-z_]\w*(\.[A-Za-z_]\w*)?[ \t]*\+?=(?![=>])/;

/**
 * Statements the parser could not read (`failed`: the lines its errors point at) are cut back to
 * their readable parts (see `salvage`).
 */
function recoverStatements(text: string, lib: Library, inline: boolean, failed: ReadonlySet<number>, changes: string[]): string {
  const out: string[] = [];
  let open: string[] | null = null;
  let first = 0;
  let depth = 0;
  const close = () => {
    if (!open) return;
    const lines = open;
    const raw = lines.join("\n");
    open = null;
    if (!lines.some((_, i) => failed.has(first + i))) return void out.push(raw);
    const stmt = stripComments(raw);
    const head = HEAD.exec(stmt);
    if (!head || head[2] || head[3] !== "=" || readsCleanly(stmt, lib)) return void out.push(raw);
    const lost: string[] = [];
    const value = salvage(stmt.slice(head[0].length), lib, lost);
    if (value === null) return void out.push(raw);
    out.push(`${head[1]} = ${value}`);
    changes.push(`${head[1]}: removed what could not be read (${lost.map((l) => (l.length > 28 ? `${l.slice(0, 28)}…` : l)).join("; ")})`);
  };
  let fenced = false;
  text.split("\n").forEach((line, at) => {
    const fence = /^\s*```/.test(line);
    if (fence) fenced = !fenced;
    if (fence || (inline && !fenced)) {
      close();
      out.push(line);
    } else if (open && depth > 0 && !(NEXT_HEAD.test(line) && !/[,([{+\-*/:?|&=]\s*$/.test(open[open.length - 1]!))) {
      // A statement ends at the first line break outside brackets, or, as in the lexer, where a line
      // starts a new statement (`id =` at column 0, after a complete value): a forgotten `)` ends there.
      open.push(line);
      depth += depthOf(line);
    } else {
      close();
      if (HEAD.test(line) && !line.startsWith("|")) {
        open = [line];
        first = at + 1;
        depth = depthOf(line);
      } else out.push(line);
    }
  });
  close();
  return out.join("\n");
}

/**
 * A table written inside a call (`Table(|Ticket|Subject|, |T1|Login|)`, `Card(|MRR|$12k|ARR|$140k)`)
 * moves to its own statement, `<id>Rows`, and the call refers to it. A row ends at a comma that is
 * followed by the next row's `|`, or at a literal `\n`; the table ends where the next argument starts.
 */
function liftInlineTables(line: string, taken: Set<string>, changes: string[]): string[] {
  const head = HEAD.exec(line);
  if (!head || line.startsWith("|") || TABLE_HEAD.test(line) || !line.includes("|")) return [line];
  const extra: string[] = [];
  let out = "";
  let i = 0;
  let depth = 0;
  let prev = "";
  while (i < line.length) {
    const c = line[i]!;
    if (opensString(line, i)) {
      const j = skipString(line, i);
      out += line.slice(i, j);
      prev = '"';
      i = j;
      continue;
    }
    if (c === "|" && depth > 0 && /[(,[]/.test(prev)) {
      const rows: string[] = [];
      let row = "";
      let inner = 0;
      let j = i;
      for (; j < line.length; j++) {
        const d = line[j]!;
        if (d === "(" || d === "[") inner++;
        else if ((d === ")" || d === "]") && inner > 0) inner--;
        else if (d === ")" || d === "]") break;
        else if (d === "\\" && line[j + 1] === "n" && line[j + 2] === "|") {
          rows.push(row), (row = ""), j++;
          continue;
        } else if (d === "," && inner === 0) {
          const rest = line.slice(j + 1);
          if (/^\s*\|/.test(rest)) {
            rows.push(row), (row = "");
            j += rest.length - rest.trimStart().length;
            continue;
          }
          // The row is closed (`…|,`), or what follows is the next argument and not more of this
          // cell: the table ends here. A cell may hold commas (`|Tags|red, green, blue|`).
          if (/\|\s*$/.test(row) || !continuesCell(rest)) break;
        }
        row += d;
      }
      if (row.trim()) rows.push(row);
      const table = rows.map((r) => r.trim()).filter((r) => r.startsWith("|") && r.length > 1);
      if (table.length) {
        let name = `${head[1]}Rows`;
        for (let n = 2; taken.has(name); n++) name = `${head[1]}Rows${n}`;
        taken.add(name);
        extra.push(`${name} = ${table.join("\n")}`);
        out += name;
        changes.push(`${head[1]}: moved an inline table to "${name}"`);
        i = j;
        prev = "x";
        continue;
      }
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (!/\s/.test(c)) prev = c;
    out += c;
    i++;
  }
  return [out, ...extra];
}

/**
 * After a comma inside an open table cell: whether the text goes on as the same cell. It does when a
 * `|` follows before the call closes, with only plain words in between; a call, a string or a
 * `key:value` there is the next argument.
 */
function continuesCell(rest: string): boolean {
  const bar = rest.search(/[|)\]]/);
  if (bar < 0 || rest[bar] !== "|") return false;
  const between = rest.slice(0, bar);
  return !/[("]/.test(between) && !/^\s*[A-Za-z_]\w*[:=]\S/.test(between);
}

/**
 * Fixes before parsing, on the text as the model wrote it, so nothing is lost when the parser drops
 * a statement it cannot read or a reference it cannot resolve:
 * curly quotes used as string quotes, tables written inside a call, statements with an unreadable
 * part, references that miss an existing statement by case or one letter (`MetricsRow`,
 * `incidentsTable` for `incidentTable`), and a component named without parentheses (`Card(Separator)`).
 * Only code is touched: text in strings, table cells and (with `inline`) chat stays as written.
 */
function prepare(text: string, lib: Library, inline: boolean, changes: string[]): string {
  let t = outsideStrings(text, inline, (code) => code.replace(/[“”]/g, '"'));
  if (t !== text) changes.push("curly quotes → straight quotes");
  const taken = new Set([...t.matchAll(/^\$?([A-Za-z_]\w*)\s*=/gm)].map((m) => m[1]!));
  t = codeLines(t, inline, (line) => liftInlineTables(line, taken, changes));
  let r = parse(t, lib, { inline });
  const failed = new Set(r.errors.filter((e) => e.code === "parse-failed" && e.line).map((e) => e.line!));
  if (failed.size) {
    const recovered = recoverStatements(t, lib, inline, failed, changes);
    if (recovered !== t) r = parse((t = recovered), lib, { inline });
  }
  const unused = new Set(r.errors.filter((e) => e.code === "unreachable" && e.stmtId).map((e) => e.stmtId!));
  const rename = new Map<string, string>();
  for (const e of r.errors) {
    if (e.code !== "unresolved-ref" || !e.ref || rename.has(e.ref)) continue;
    const low = e.ref.toLowerCase();
    const sameName = [...taken].find((k) => k !== e.ref && k.toLowerCase() === low);
    // One letter off: only an unused statement, and each one answers a single reference.
    const oneOff = sameName || e.ref.length < 6 ? undefined : [...unused].find((k) => editDistance(k.toLowerCase(), low) === 1);
    if (oneOff) unused.delete(oneOff);
    const meant = sameName ?? oneOff;
    if (meant) rename.set(e.ref, meant);
    else if (lib.get(e.ref)?.requiredPositional === 0) rename.set(e.ref, `${e.ref}()`);
  }
  if (!rename.size) return t;
  for (const [from, to] of rename) changes.push(`"${from}" → "${to}"`);
  return outsideStrings(t, inline, (code) =>
    code.replace(/\b[A-Za-z_]\w*\b(?!\s*\()/g, (w, at: number, all: string) => (rename.has(w) && !/[\w.$]$/.test(all.slice(0, at)) && !/^\s*[:=]/.test(all.slice(at + w.length)) ? rename.get(w)! : w)),
  );
}

/**
 * A program with no `root` statement and several sections nobody refers to: a root is added that
 * holds them all. (Without it the first one stands in as the root and the others are unused.)
 */
function addRoot(source: string, lib: Library, changes: string[]): string {
  const stmts = statements(source);
  if (stmts.some((s) => s.id === "root")) return source;
  const box = [...lib.components.values()].find((c) => c.hasChildren && c.requiredPositional === 0)?.spec.name;
  if (!box) return source;
  const values = stmts.map((s) => {
    const stmt = HOISTED.test(s.id) || s.id.startsWith("$") ? null : parseStatement(s.text, lib).stmt;
    return { id: s.id, value: stmt?.kind === "assign" ? stmt.value : null };
  });
  const used = new Set(stmts.flatMap((s) => [...refsOf(parseStatement(s.text, lib).stmt)].filter((r) => r !== s.id)));
  const tops = values.filter((v) => v.value?.k === "comp" && !used.has(v.id)).map((v) => v.id);
  if (tops.length < 2) return source;
  changes.push(`root: added, holding ${tops.join(", ")} (the program had no root)`);
  return `root = ${box}(${tops.join(", ")})\n${source}`;
}

const HOISTED = /^_c\d+$/;

/**
 * The canonical form with each `_cN` statement put back where it is used: the program's original
 * shape, so its nodes keep the ids they had while streaming (`root/0`, not `_c3`).
 */
function inlineHoisted(source: string, lib: Library): string {
  const stmts = statements(source);
  const hoisted = new Map<string, Expr>();
  for (const s of stmts) {
    if (!HOISTED.test(s.id)) continue;
    const p = parseStatement(s.text, lib);
    if (p?.stmt?.kind === "assign") hoisted.set(s.id, p.stmt.value);
  }
  if (!hoisted.size) return source;
  const put = (e: unknown, depth: number): unknown => {
    if (Array.isArray(e)) return e.map((x) => put(x, depth));
    if (!e || typeof e !== "object") return e;
    const o = e as Record<string, unknown>;
    if (o.k === "ref" && typeof o.name === "string" && hoisted.has(o.name) && depth < 64) return put(hoisted.get(o.name), depth + 1);
    const out: Record<string, unknown> = {};
    for (const k in o) out[k] = put(o[k], depth);
    return out;
  };
  const REF = /\b_c\d+\b/g;
  const out: string[] = [];
  // Statements that cannot be reprinted keep their references, so those hoisted statements stay.
  const needed = new Set<string>();
  for (const s of stmts) {
    if (HOISTED.test(s.id)) continue;
    if (!s.text.match(REF)) {
      out.push(s.text);
      continue;
    }
    const p = parseStatement(s.text, lib);
    if (p?.stmt?.kind === "assign" && s.text.startsWith(`${s.id} =`)) out.push(`${s.id} = ${printExpr(put(p.stmt.value, 0) as Expr)}`);
    else {
      out.push(s.text);
      for (const r of s.text.match(REF) ?? []) needed.add(r);
    }
  }
  for (const id of needed) {
    const v = hoisted.get(id);
    if (v) out.push(`${id} = ${printExpr(put(v, 0) as Expr)}`);
  }
  return out.join("\n") + "\n";
}
