/**
 * A form's shape, from the program itself (not the DOM): field metadata and a JSON Schema (draft
 * 2020-12, like `z.toJSONSchema`), so a host can validate and store submissions with any JSON Schema
 * tool, and generate types for known forms.
 *
 * - `formId` is stable: the Form's `id:` when the program sets one, otherwise a fingerprint of its
 *   fields (names, types, rules, options). The same form always gets the same id, so a host can
 *   route submissions of AI-generated (dynamic) forms too.
 * - `toData()` turns raw control values into typed data that matches the schema: numbers are
 *   numbers, checkboxes booleans, multi-value fields arrays; empty optional fields are left out.
 *
 * The schema and the client validation (./validate) describe the same rules: data from a submit that
 * passed validation always conforms to the schema emitted with it.
 */

import type { GistUINode } from "@gistui/core";
import { fieldPattern, urlProtocols } from "./validate";

export type JsonSchema = { [key: string]: unknown };

/** Components that hold a value, and how that value is typed. */
const FIELD_TYPES: Readonly<Record<string, "text" | "choice" | "list" | "bool">> = {
  Input: "text",
  TextArea: "text",
  Select: "choice",
  Combobox: "choice",
  RadioGroup: "choice",
  CheckboxGroup: "list",
  TagInput: "list",
  Checkbox: "bool",
  Switch: "bool",
  DatePicker: "text",
  TimePicker: "text",
  Slider: "text",
};

export interface FormField {
  name: string;
  label?: string;
  /** The component that renders it: Input, Select, CheckboxGroup… */
  component: string;
  /** JSON type of the value. */
  type: "string" | "number" | "boolean" | "array";
  /** The input's own type for Input (email, url, number, password, tel, date, text) and TagInput. */
  input?: string;
  required: boolean;
  multiple?: boolean;
  options?: string[];
  default?: unknown;
  placeholder?: string;
  hint?: string;
  /** Title of the Step it is on, in step forms. */
  step?: string;
  /** Validation rules as written in the program. */
  rules: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    minItems?: number;
    maxItems?: number;
    pattern?: string;
    match?: string;
    protocols?: string[];
    message?: string;
  };
}

export interface FormDescription {
  /** Stable id: the Form's `id:`, or `form_` + a fingerprint of its fields. */
  formId: string;
  /** The Form's name (first argument). */
  name: string;
  /** The program node that renders the form. */
  nodeId: string;
  /** Step titles, in order, for step forms. */
  steps?: string[];
  fields: FormField[];
  /** JSON Schema (draft 2020-12) for `data`. */
  schema: JsonSchema;
}

const s = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const n = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const list = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(String) : undefined);
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function fieldOf(node: GistUINode, step: string | undefined): FormField | null {
  const kind = FIELD_TYPES[node.type];
  const p = node.props;
  const name = s(p.name);
  if (!kind || !name) return null;
  const input =
    node.type === "Input"
      ? (s(p.type) ?? "text")
      : node.type === "TagInput"
        ? s(p.type)
        : node.type === "DatePicker"
          ? p.time === true
            ? "datetime"
            : "date"
          : node.type === "TimePicker"
            ? "time"
            : node.type === "Slider"
              ? "number"
              : undefined;
  const multiple = kind === "list" || ((node.type === "Select" || node.type === "Combobox") && p.multiple === true) || (node.type === "DatePicker" && p.range === true);
  const type = kind === "bool" ? "boolean" : multiple ? "array" : input === "number" ? "number" : "string";
  const rules: FormField["rules"] = clean({
    minLength: kind === "text" ? n(p.minLength) : undefined,
    maxLength: kind === "text" ? n(p.maxLength) : undefined,
    min: type === "number" ? n(p.min) : undefined,
    max: type === "number" ? n(p.max) : undefined,
    minItems: multiple ? n(p.min) : undefined,
    maxItems: multiple ? n(p.max) : undefined,
    pattern: s(p.pattern),
    match: s(p.match),
    protocols: input === "url" ? (list(p.protocols) ?? ["http", "https"]) : undefined,
    message: s(p.error),
  });
  const def = kind === "bool" ? p.checked === true : multiple ? list(p.value) : type === "number" ? n(p.value) : s(p.value);
  return clean({
    name,
    label: s(p.label),
    component: node.type,
    type,
    input,
    required: p.required === true,
    multiple: multiple || undefined,
    options: list(p.options),
    default: def,
    placeholder: s(p.placeholder),
    hint: s(p.hint),
    step,
    rules,
  }) as FormField;
}

const FORMATS: Readonly<Record<string, string>> = { email: "email", url: "uri", date: "date", time: "time" };

/** JSON Schema for one field. */
export function fieldSchema(f: FormField): JsonSchema {
  const meta = clean({ title: f.label, description: f.hint, default: f.default });
  if (f.type === "boolean") return clean({ type: "boolean", ...meta, const: f.required ? true : undefined });
  const item = clean({
    type: "string",
    enum: f.options,
    format: f.input ? FORMATS[f.input] : undefined,
  });
  if (f.type === "array") {
    // A date range is exactly [start, end].
    if (f.component === "DatePicker") return clean({ type: "array", ...meta, items: item, minItems: 2, maxItems: 2 });
    return clean({ type: "array", ...meta, items: item, uniqueItems: true, minItems: f.rules.minItems ?? (f.required ? 1 : undefined), maxItems: f.rules.maxItems });
  }
  if (f.type === "number") return clean({ type: "number", ...meta, minimum: f.rules.min, maximum: f.rules.max });
  // A pattern the validator ignores (invalid, or unsafe to run) or that is not a valid JSON Schema
  // (unicode) pattern is left out: the schema never demands more than the form checked.
  const pattern = fieldPattern(f.rules.pattern)?.schema ?? (f.rules.protocols ? `^(?:${urlProtocols(f.rules.protocols).map((p) => p.replace(/[+.]/g, "\\$&")).join("|")})://` : undefined);
  return clean({
    ...item,
    ...meta,
    // An enum already rules out "", so only free text needs minLength 1 when required.
    minLength: f.rules.minLength ?? (f.required && !f.options ? 1 : undefined),
    maxLength: f.rules.maxLength,
    pattern,
    writeOnly: f.input === "password" ? true : undefined,
  });
}

// FNV-1a, twice with different seeds: a 64-bit fingerprint as 16 hex digits.
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** Describes the Form `node`: its fields (in order, nested containers and steps included) and schema. */
export function describeForm(node: GistUINode, get: (id: string) => GistUINode | undefined): FormDescription {
  const fields: FormField[] = [];
  const steps: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, step: string | undefined) => {
    const child = get(id);
    if (!child || seen.has(id)) return;
    seen.add(id);
    if (child.type === "Form") return; // a nested form describes itself
    let here = step;
    if (child.type === "Step") {
      here = s(child.props.title) ?? `Step ${steps.length + 1}`;
      steps.push(here);
    }
    const f = fieldOf(child, here);
    // One entry per name (radio buttons, a repeated field): the first one describes it.
    if (f && !fields.some((x) => x.name === f.name)) fields.push(f);
    for (const c of child.children) walk(c, here);
  };
  seen.add(node.id);
  for (const c of node.children) walk(c, undefined);

  const name = s(node.props.name) ?? node.id;
  const shape = JSON.stringify([name, fields.map((f) => [f.name, f.component, f.type, f.input, f.required, f.options, f.rules])]);
  const formId = s(node.props.id) ?? `form_${fingerprint(shape)}`;
  const schema: JsonSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `gistui:form/${formId}`,
    title: name,
    type: "object",
    properties: Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)])),
    required: fields.filter((f) => f.required || f.type === "boolean").map((f) => f.name),
    additionalProperties: false,
  };
  return clean({ formId, name, nodeId: node.id, steps: steps.length ? steps : undefined, fields, schema });
}

// RFC 3986 characters with well-formed percent escapes and a lower-case scheme: what `format: uri`
// and the protocol pattern accept as written.
const URI_CHAR = "(?:[A-Za-z0-9\\-._~:/?@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*";
const URI = new RegExp(`^[a-z][a-z0-9+.-]*://${URI_CHAR}(?:#${URI_CHAR})?$`);
const escapeBut = (keep: string) => {
  const re = new RegExp(`%(?![0-9A-Fa-f]{2})|[^A-Za-z0-9\\-._~!$&'()*+,;=%${keep}]`, "gu");
  return (part: string) => part.replace(re, encodeURIComponent);
};
const escapeUri = escapeBut(":/?@"); // path, query and fragment
const escapeUser = escapeBut("");

/**
 * A URL the validator accepted, as a URI the schema accepts: the scheme in lower case
 * (`HTTPS://x.com` → `https://x.com`), and anything outside RFC 3986 percent-encoded
 * (`/wiki/München` → `/wiki/M%C3%BCnchen`). A URL that is already one is returned as written.
 */
function uri(v: string): string {
  const lower = v.replace(/^[A-Za-z][A-Za-z0-9+.-]*(?=:)/, (scheme) => scheme.toLowerCase());
  if (URI.test(lower)) return lower;
  try {
    const u = new URL(v);
    const auth = (u.username || u.password ? `${escapeUser(u.username)}${u.password ? `:${escapeUser(u.password)}` : ""}@` : "") + u.host;
    return `${u.protocol}//${auth}${escapeUri(u.pathname)}${u.search ? `?${escapeUri(u.search.slice(1))}` : ""}${u.hash ? `#${escapeUri(u.hash.slice(1))}` : ""}`;
  } catch {
    return lower;
  }
}

/**
 * Raw control values → typed data matching the schema. Text is trimmed (as it was validated) and
 * numbers are parsed, lists stay lists, checkboxes are booleans. Empty optional text/number/choice
 * fields are left out, and so is an empty list the schema could not accept as `[]` (one with a
 * minimum, or a date range).
 */
export function toData(fields: readonly FormField[], raw: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const text = (f: FormField, v: string) => (f.input === "url" ? uri(v) : v);
  for (const f of fields) {
    const v = raw[f.name];
    if (f.type === "boolean") out[f.name] = v === true;
    else if (f.type === "array") {
      const items = (Array.isArray(v) ? v.map(String) : typeof v === "string" && v !== "" ? [v] : []).map((item) => text(f, item.trim()));
      const needsItems = f.required || (f.rules.minItems ?? 0) >= 1 || f.component === "DatePicker";
      if (items.length || !needsItems) out[f.name] = items;
    } else if (typeof v === "string" && v.trim() !== "") out[f.name] = f.type === "number" ? Number(v) : text(f, v.trim());
  }
  return out;
}

/** A new random id for one submission (UUID v4). */
export function newSubmissionId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
