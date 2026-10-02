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
 * | statement nothing uses         | a component is added to root's children; anything else removed |
 * | unknown component, cycle       | the statement is removed                                        |
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
  let source = printProgram(parse(text, lib, { inline: opts.inline ?? false }).program, lib, { hoist: true });
  let errors: GistUIError[] = [];
  for (let round = 0; round < (opts.rounds ?? 6); round++) {
    const r = parse(source, lib);
    errors = r.errors.filter((e) => REPAIRABLE.has(e.code));
    if (!errors.length) break;
    const stmts = statements(source);
    const byId = new Map(stmts.map((s) => [s.id, s]));
    const drop = new Set<string>();
    const toRoot: string[] = [];
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
          // Part of another unused statement (its child): it comes along with that one.
          if (unused.some((u) => u !== id && new RegExp(`\\b${id}\\b`).test(byId.get(u)?.text.replace(HEAD, "") ?? ""))) break;
          if (isComp && byId.has("root") && lib.get(edit("root")?.call.name ?? "")?.hasChildren) {
            toRoot.push(id);
            changes.push(`${id}: added to root (it was defined but not used)`);
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
    if (toRoot.length) edit("root")!.add.push(...toRoot.map((n): Arg => ({ value: { k: "ref", name: n } })));

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
