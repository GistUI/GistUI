// Checks the JSON Schemas in this folder and validates the conformance files against them.
// A small validator with no dependencies: it knows only the keywords these schemas use.
//   bun spec/schemas/check.mjs        (or: node spec/schemas/check.mjs)
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const KNOWN = new Set([
  "$schema", "$id", "$defs", "$ref", "$comment", "title", "description", "type", "enum", "const", "required", "properties",
  "additionalProperties", "propertyNames", "items", "pattern", "minLength", "minItems", "minimum", "anyOf", "oneOf", "allOf",
]);

const schemas = new Map();
for (const f of readdirSync(here).filter((f) => f.endsWith(".schema.json"))) {
  const s = read(join(here, f));
  if (s.$schema !== "https://json-schema.org/draft/2020-12/schema") throw new Error(`${f}: $schema is not draft 2020-12`);
  if (s.$id !== `https://gistui.com/schemas/1.0/${f}`) throw new Error(`${f}: unexpected $id ${s.$id}`);
  schemas.set(s.$id, s);
}

/** Every keyword must be one this validator implements, so nothing is silently skipped. */
function lint(s, where) {
  if (typeof s !== "object" || s === null) return;
  for (const [k, v] of Object.entries(s)) {
    if (!KNOWN.has(k)) throw new Error(`${where}: keyword "${k}" is not supported by check.mjs`);
    if (k === "properties" || k === "$defs") for (const [n, sub] of Object.entries(v)) lint(sub, `${where}/${k}/${n}`);
    else if (k === "items" || k === "additionalProperties" || k === "propertyNames") lint(v, `${where}/${k}`);
    else if (k === "anyOf" || k === "oneOf" || k === "allOf") v.forEach((sub, i) => lint(sub, `${where}/${k}/${i}`));
  }
}
for (const [id, s] of schemas) lint(s, id);

function resolve(ref, root) {
  if (ref.startsWith("#/")) return [ref.slice(2).split("/").reduce((o, k) => o[k], root), root];
  const s = schemas.get(ref);
  if (!s) throw new Error(`unknown $ref ${ref}`);
  return [s, s];
}

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const isType = (v, t) => (t === "integer" ? Number.isInteger(v) : typeOf(v) === t);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Returns a list of problems (empty when `v` is valid). */
function validate(v, s, root, path) {
  if (s === true) return [];
  if (s === false) return [`${path}: not allowed`];
  const out = [];
  if (s.$ref) {
    const [target, r] = resolve(s.$ref, root);
    out.push(...validate(v, target, r, path));
  }
  if (s.type !== undefined && ![s.type].flat().some((t) => isType(v, t))) out.push(`${path}: expected ${[s.type].flat().join("|")}, got ${typeOf(v)}`);
  if (s.enum && !s.enum.some((e) => same(e, v))) out.push(`${path}: ${JSON.stringify(v)} is not one of ${s.enum.join(", ")}`);
  if ("const" in s && !same(s.const, v)) out.push(`${path}: expected ${JSON.stringify(s.const)}`);
  if (typeof v === "string") {
    if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${path}: "${v}" does not match ${s.pattern}`);
    if (s.minLength !== undefined && v.length < s.minLength) out.push(`${path}: shorter than ${s.minLength}`);
  }
  if (typeof v === "number" && s.minimum !== undefined && v < s.minimum) out.push(`${path}: less than ${s.minimum}`);
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) out.push(`${path}: fewer than ${s.minItems} items`);
    if (s.items) v.forEach((x, i) => out.push(...validate(x, s.items, root, `${path}/${i}`)));
  }
  if (typeOf(v) === "object") {
    for (const k of s.required ?? []) if (!(k in v)) out.push(`${path}: missing "${k}"`);
    for (const [k, x] of Object.entries(v)) {
      if (s.propertyNames) out.push(...validate(k, s.propertyNames, root, `${path}/{${k}}`));
      if (s.properties && k in s.properties) out.push(...validate(x, s.properties[k], root, `${path}/${k}`));
      else if (s.additionalProperties !== undefined) out.push(...validate(x, s.additionalProperties, root, `${path}/${k}`));
    }
  }
  for (const sub of s.allOf ?? []) out.push(...validate(v, sub, root, path));
  if (s.anyOf && !s.anyOf.some((sub) => validate(v, sub, root, path).length === 0)) out.push(`${path}: matches none of anyOf`);
  if (s.oneOf) {
    const n = s.oneOf.filter((sub) => validate(v, sub, root, path).length === 0).length;
    if (n !== 1) out.push(`${path}: matches ${n} of oneOf (expected 1)`);
  }
  return out;
}

function check(value, id, label) {
  const s = schemas.get(`https://gistui.com/schemas/1.0/${id}`);
  const problems = validate(value, s, s, "");
  if (problems.length) {
    console.error(`FAIL ${label}\n  ${problems.slice(0, 8).join("\n  ")}`);
    return 1;
  }
  return 0;
}

let failed = 0;
let checked = 0;
const conf = join(here, "../conformance");
failed += check(read(join(conf, "library.json")), "catalog.schema.json", "conformance/library.json");
checked++;
for (const f of readdirSync(conf).filter((f) => f.endsWith(".expected.json")).sort()) {
  failed += check(read(join(conf, f)), "expected.schema.json", `conformance/${f}`);
  checked++;
}

// The schemas must also refuse what is wrong: a few negative samples.
const refuse = (value, id, label) => {
  const s = schemas.get(`https://gistui.com/schemas/1.0/${id}`);
  checked++;
  if (validate(value, s, s, "").length === 0) {
    console.error(`FAIL ${label}: accepted`);
    failed++;
  }
};
const accept = (value, id, label) => {
  failed += check(value, id, label);
  checked++;
};
refuse({ type: "card" }, "tree.schema.json", "tree: lower-case type");
refuse({ type: "Card", extra: 1 }, "tree.schema.json", "tree: unknown field");
refuse({ code: "nope", severity: "error" }, "diagnostic.schema.json", "diagnostic: unknown code");
refuse({ code: "cycle", severity: "fatal" }, "diagnostic.schema.json", "diagnostic: unknown severity");
refuse({ gistui: "1.0", id: "x", version: "1.0.0", components: [{ name: "card", props: {} }] }, "catalog.schema.json", "catalog: lower-case component");
refuse({ gistui: "1.0", id: "x", version: "1.0.0", components: [{ name: "Card", props: { v: { type: "enum" } } }] }, "catalog.schema.json", "catalog: enum without values");
refuse({ components: [] }, "catalog.schema.json", "catalog: no id");
refuse({ type: "send", message: "hi" }, "action.schema.json", "action: send without nodeId");
refuse({ type: "error", code: "oops", message: "x" }, "action.schema.json", "action: unknown error code");
refuse({ type: "select", nodeId: "t", value: 1 }, "action.schema.json", "action: unknown type");
accept({ type: "send", nodeId: "ok", message: "Saved 105" }, "action.schema.json", "action: send");
accept({ type: "open", nodeId: "ok", url: "https://example.com" }, "action.schema.json", "action: open");
accept({ type: "emit", nodeId: "ok", event: "saved", payload: { goal: 105 } }, "action.schema.json", "action: emit");
accept({ type: "submit", nodeId: "f", form: "goal", values: { goal: 5 }, partial: false, message: "goal: 5" }, "action.schema.json", "action: submit");
accept({ type: "state", name: "range", value: "7d" }, "action.schema.json", "action: state");
accept({ type: "tool", kind: "query", name: "get_sales", args: { range: "7d" }, nodeId: "sales" }, "action.schema.json", "action: tool");
accept({ type: "error", code: "tool-failed", message: "nope", nodeId: "bad" }, "action.schema.json", "action: error");
accept(
  { gistui: "1.0", profiles: ["core", "interactive"], mode: "document", catalog: { id: "https://gistui.com/catalogs/conformance", version: "1.1.0" }, tools: [{ name: "get_sales", kind: "query" }] },
  "capabilities.schema.json",
  "capabilities",
);

console.log(`${schemas.size} schemas, ${checked} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
