import { describe, expect, test } from "bun:test";
import type { GistUINode } from "@gistui/core";
import { describeForm, toData, type FormField, type JsonSchema } from "../src/form-schema";
import { fieldPattern, isEmail, isUrl, validateAll, validateValue, type FieldRules, type FieldValue } from "../src/validate";

/** A Form node with one child node per field, as the program store would hold them. */
function form(fields: [type: string, props: Record<string, unknown>][]) {
  const nodes = new Map<string, GistUINode>();
  fields.forEach(([type, props], i) => nodes.set(`f${i}`, { id: `f${i}`, type, props, children: [], partial: false, stmt: "root" }));
  const root: GistUINode = { id: "root", type: "Form", props: { name: "t" }, children: [...nodes.keys()], partial: false, stmt: "root" };
  return describeForm(root, (id) => nodes.get(id));
}

/** The rules a renderer registers for a field (lists map `min`/`max` to item counts). */
function rulesOf(f: FormField): FieldRules {
  const list = f.type === "array" && f.component !== "DatePicker";
  return {
    label: f.label,
    required: f.required || undefined,
    type: f.component === "Input" ? f.input : undefined,
    min: f.rules.min,
    max: f.rules.max,
    minLength: list ? f.rules.minItems : f.rules.minLength,
    maxLength: list ? f.rules.maxItems : f.rules.maxLength,
    pattern: f.rules.pattern,
    match: f.rules.match,
    protocols: f.rules.protocols,
  };
}

const codePoints = (s: string) => Array.from(s).length;

/** The JSON Schema keywords the form schema uses, checked the way a validator (ajv, unicode patterns) would. */
function conforms(schema: JsonSchema, data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const props = schema.properties as Record<string, JsonSchema>;
  for (const name of schema.required as string[]) if (!(name in data)) errors.push(`${name}: required`);
  for (const [name, v] of Object.entries(data)) {
    const s = props[name];
    if (!s) {
      errors.push(`${name}: additional`);
      continue;
    }
    const check = (s: JsonSchema, v: unknown, at: string) => {
      const type = Array.isArray(v) ? "array" : typeof v;
      if (type !== s.type) return void errors.push(`${at}: type ${type}`);
      if (typeof v === "string") {
        if (typeof s.minLength === "number" && codePoints(v) < s.minLength) errors.push(`${at}: minLength`);
        if (typeof s.maxLength === "number" && codePoints(v) > s.maxLength) errors.push(`${at}: maxLength`);
        if (typeof s.pattern === "string" && !new RegExp(s.pattern, "u").test(v)) errors.push(`${at}: pattern`);
        if (Array.isArray(s.enum) && !s.enum.includes(v)) errors.push(`${at}: enum`);
        if (s.format === "email" && !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(v)) errors.push(`${at}: format email`);
        // RFC 3986 characters only, with well-formed percent escapes (what `format: uri` demands).
        if (s.format === "uri" && !/^[a-z][a-z0-9+.-]*:(?:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*$/i.test(v)) errors.push(`${at}: format uri`);
      }
      if (Array.isArray(v)) {
        if (typeof s.minItems === "number" && v.length < s.minItems) errors.push(`${at}: minItems`);
        if (typeof s.maxItems === "number" && v.length > s.maxItems) errors.push(`${at}: maxItems`);
        v.forEach((item, i) => check(s.items as JsonSchema, item, `${at}[${i}]`));
      }
    };
    check(s, v, name);
  }
  return errors;
}

/** Client validation, then typed data, then the schema: what a submit does. */
function submit(fields: [string, Record<string, unknown>][], raw: Record<string, unknown>) {
  const d = form(fields);
  const rules = Object.fromEntries(d.fields.map((f) => [f.name, rulesOf(f)]));
  const errors = validateAll(rules, raw as Record<string, FieldValue>);
  const data = toData(d.fields, raw);
  return { errors, data, schemaErrors: conforms(d.schema, data), schema: d.schema };
}

describe("a submit that passes validation conforms to its schema (W7)", () => {
  test("text is emitted trimmed, as it was validated", () => {
    const r = submit([["Input", { name: "email", type: "email", required: true }], ["Input", { name: "code", maxLength: 3 }]], { email: "  ada@example.com ", code: " abc " });
    expect(r.errors).toEqual({});
    expect(r.data).toEqual({ email: "ada@example.com", code: "abc" });
    expect(r.schemaErrors).toEqual([]);
  });

  test("a URL with an upper-case scheme", () => {
    const r = submit([["Input", { name: "site", type: "url" }]], { site: "HTTPS://Example.com" });
    expect(r.errors).toEqual({});
    expect(r.schemaErrors).toEqual([]);
    expect(String(r.data.site)).toMatch(/^https:\/\/Example\.com/);
    // Protocols as the program wrote them (`HTTPS`, `https:`) validate and emit alike.
    const p = submit([["Input", { name: "site", type: "url", protocols: ["HTTPS:", "ftp"] }]], { site: "https://example.com/x" });
    expect(p.errors).toEqual({});
    expect(p.schemaErrors).toEqual([]);
    expect(submit([["Input", { name: "site", type: "url", protocols: ["https"] }]], { site: "http://example.com" }).errors).toHaveProperty("site");
  });

  test("a URL the validator accepts is emitted as a valid URI; what it cannot emit, it rejects", () => {
    for (const site of ["https://de.wikipedia.org/wiki/München", "https://example.com/a b?q=x y#f g", "https://example.com/?q=a|b{c}^`", "https://münchen.de", "http://example.com/100%"]) {
      const r = submit([["Input", { name: "site", type: "url" }]], { site });
      expect([site, r.errors, r.schemaErrors]).toEqual([site, {}, []]);
    }
    // `https:example.com` parses as a URL, but the schema's pattern wants `https://`.
    for (const bad of ["https:example.com", "https:/example.com", "https:\\\\example.com"]) expect([bad, isUrl(bad)]).toEqual([bad, false]);
    expect(isUrl("HTTPS://Example.com")).toBe(true);
  });

  test("an email the validator accepts passes `format: email`", () => {
    for (const bad of ["josé@example.com", ".a@b.co", "a.@b.co", "a..b@c.co"]) expect([bad, isEmail(bad)]).toEqual([bad, false]);
    for (const ok of ["a@b.co", "first.last+tag@sub.example.org", "x_y@ex-ample.io", "o'neil@example.com"]) expect([ok, isEmail(ok)]).toEqual([ok, true]);
  });

  test("an optional list with a minimum, left empty, is omitted", () => {
    const r = submit([["CheckboxGroup", { name: "topics", options: ["a", "b", "c"], min: 2 }]], { topics: [] });
    expect(r.errors).toEqual({});
    expect(r.data).toEqual({});
    expect(r.schemaErrors).toEqual([]);
    // An optional list without a minimum still emits `[]`, as before.
    const t = submit([["TagInput", { name: "cc" }]], { cc: [] });
    expect(t.data).toEqual({ cc: [] });
    expect(t.schemaErrors).toEqual([]);
  });

  test("an optional, empty date range is omitted", () => {
    const r = submit([["DatePicker", { name: "when", range: true }]], { when: [] });
    expect(r.errors).toEqual({});
    expect(r.data).toEqual({});
    expect(r.schemaErrors).toEqual([]);
    const full = submit([["DatePicker", { name: "when", range: true }]], { when: ["2026-01-01", "2026-01-31"] });
    expect(full.data).toEqual({ when: ["2026-01-01", "2026-01-31"] });
    expect(full.schemaErrors).toEqual([]);
  });

  test("an invalid `pattern` is ignored by the validator and left out of the schema", () => {
    const r = submit([["Input", { name: "n", pattern: "[0-9" }]], { n: "abc" });
    expect(r.errors).toEqual({});
    expect((r.schema.properties as Record<string, JsonSchema>).n).not.toHaveProperty("pattern");
    expect(r.schemaErrors).toEqual([]);
    // A valid one is emitted, anchored, and compiles as a JSON Schema (unicode) pattern.
    const ok = form([["Input", { name: "n", pattern: "[0-9]{3}" }]]);
    expect((ok.schema.properties as Record<string, JsonSchema>).n!.pattern).toBe("^(?:[0-9]{3})$");
    // Valid for the validator but not as a unicode pattern (ajv would throw): validated, not emitted.
    const loose = submit([["Input", { name: "n", pattern: "\\d{3}\\-\\d{4}" }]], { n: "555-1234" });
    expect(loose.errors).toEqual({});
    expect((loose.schema.properties as Record<string, JsonSchema>).n).not.toHaveProperty("pattern");
    expect(validateValue({ pattern: "\\d{3}\\-\\d{4}" }, "5551234")).toContain("right format");
  });

  test("lengths count characters the way JSON Schema does (code points)", () => {
    const r = submit([["Input", { name: "n", minLength: 3 }]], { n: "😀😀" });
    expect(r.errors).toHaveProperty("n");
    expect(submit([["Input", { name: "n", maxLength: 3 }]], { n: "😀😀😀" }).errors).toEqual({});
  });

  test("every schema value the validator lets through, across awkward inputs", () => {
    const fields: [string, Record<string, unknown>][] = [
      ["Input", { name: "email", type: "email" }],
      ["Input", { name: "site", type: "url" }],
      ["Input", { name: "name", minLength: 2, maxLength: 5 }],
      ["Input", { name: "zip", pattern: "\\d{5}" }],
      ["Input", { name: "age", type: "number", min: 1, max: 9 }],
      ["CheckboxGroup", { name: "picks", options: ["a", "b", "c"], min: 2, max: 2 }],
      ["DatePicker", { name: "range", range: true }],
    ];
    const samples: Record<string, unknown[]> = {
      email: ["", " a@b.co ", "A@B.CO", "josé@example.com", "a@b", ".a@b.co"],
      site: ["", " https://a.co ", "HTTP://A.CO/x y", "https:a.co", "ftp://a.co", "https://ü.de/ä"],
      name: ["", " ab ", "  a  ", "abcdef", "😀😀", " 😀 "],
      zip: ["", "12345", " 12345 ", "1234", "12345\n"],
      age: ["", " 5 ", "0", "10", "x", "1e0"],
      picks: [[], ["a"], ["a", "b"], ["a", "b", "c"]],
      range: [[], ["2026-01-01", "2026-01-02"]],
    };
    let checked = 0;
    for (const [name, values] of Object.entries(samples)) {
      for (const v of values) {
        const r = submit(fields, { [name]: v });
        if (Object.keys(r.errors).length) continue;
        checked++;
        expect([name, v, r.schemaErrors]).toEqual([name, v, []]);
      }
    }
    expect(checked).toBeGreaterThan(12);
  });
});

describe("match (W17)", () => {
  test("an empty confirm field does not match a filled-in one", () => {
    expect(validateAll({ password: {}, confirm: { match: "password" } }, { password: "hunter2", confirm: "" })).toEqual({ confirm: "Does not match" });
    expect(validateValue({ match: "password" }, undefined, { password: "hunter2" })).toBe("Does not match");
    // Both empty: nothing to compare. A required empty field still says it is required.
    expect(validateValue({ match: "password" }, "", { password: "" })).toBeNull();
    expect(validateValue({ match: "password" }, "", {})).toBeNull();
    expect(validateValue({ match: "password", required: true, label: "Confirm" }, "", { password: "hunter2" })).toBe("Confirm is required");
    expect(validateValue({ match: "password" }, "hunter2", { password: "hunter2" })).toBeNull();
  });
});

describe("list minimum (K8)", () => {
  test("`min` applies as soon as something is picked, required or not; an empty optional list is valid", () => {
    expect(validateValue({ minLength: 2 }, ["a"])).toBe("Choose at least 2");
    expect(validateValue({ minLength: 2 }, [])).toBeNull();
    expect(validateValue({ minLength: 2 }, ["a", "b"])).toBeNull();
    expect(validateValue({ minLength: 2, required: true, label: "Topics" }, [])).toBe("Please choose topics");
    expect(validateValue({ maxLength: 1 }, ["a", "b"])).toBe("Choose at most 1");
  });
});

describe("program patterns cannot hang the page (S12)", () => {
  const timed = (f: () => unknown) => {
    const t0 = performance.now();
    const out = f();
    return { out, ms: performance.now() - t0 };
  };

  test("a pattern with nested quantifiers is ignored, like an invalid one", () => {
    for (const pattern of ["(a+)+b", "(a*)*b", "(\\w+\\s?)+$", "((ab)+)+c", "(a|b+)*c", "(.*a){12}", "(?:a+){2,}b", "^(\\w+([.-]?\\w+)*)+@x$"]) {
      const { out, ms } = timed(() => validateValue({ pattern }, "a".repeat(40) + "!"));
      expect([pattern, out]).toEqual([pattern, null]);
      expect(ms).toBeLessThan(50);
      const s = form([["Input", { name: "n", pattern }]]);
      expect((s.schema.properties as Record<string, JsonSchema>).n).not.toHaveProperty("pattern");
    }
  });

  test("patterns that backtrack without nesting are bounded too", () => {
    // Polynomial: several unbounded quantifiers that can share the same characters. Such a pattern is
    // only run on values short enough to stay fast (here: 2.6 s and 3 s before).
    for (const pattern of [".*a.*a.*a.*a.*!", "\\w*a\\w*a\\w*a\\w*a\\w*!"]) {
      const { out, ms } = timed(() => validateValue({ pattern }, "a".repeat(200)));
      expect([pattern, out]).toEqual([pattern, null]);
      expect(ms).toBeLessThan(50);
      expect(validateValue({ pattern }, "a".repeat(40))).toContain("right format");
      expect(validateValue({ pattern }, "xaxaxaxa!")).toBeNull();
    }
    expect(timed(() => validateValue({ pattern: ".*a.*a.*a.*a.*!" }, "a".repeat(1000))).ms).toBeLessThan(50);
    // Exponential: a repeated group whose alternatives can match the same text.
    for (const pattern of ["(a|aa)+", "(\\d|\\d\\d)+x", "(a|b|ab)*c"]) {
      const { out, ms } = timed(() => validateValue({ pattern }, "a".repeat(36) + "b"));
      expect([pattern, out]).toEqual([pattern, null]);
      expect(ms).toBeLessThan(50);
      expect((form([["Input", { name: "n", pattern }]]).schema.properties as Record<string, JsonSchema>).n).not.toHaveProperty("pattern");
    }
    // Many optional pieces in a row: 2^40 ways to fail.
    expect(timed(() => validateValue({ pattern: "(?:a|a)".repeat(40) + "b" }, "a".repeat(40))).ms).toBeLessThan(50);
    expect(timed(() => validateValue({ pattern: "a?".repeat(40) + "a{40}" }, "a".repeat(39))).ms).toBeLessThan(50);
  });

  test("patterns people really write keep working, on values of ordinary length", () => {
    const states = "(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)";
    const cases: [string, string, boolean][] = [
      ["[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", "first.last@sub.example.org", true],
      ["[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", "not-an-email", false],
      ["(\\w+\\.)*\\w+@(\\w+\\.)+\\w+", "john.smith@mail.example.com", true],
      ["(\\w+\\.)*\\w+@(\\w+\\.)+\\w+", "john.smith@example", false],
      ["(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{8,64}", "Str0ng!Passphrase with spaces", true],
      ["(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{8,64}", "weakpassword", false],
      ["\\+?1?[-. ]?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}", "+1 (555) 123-4567", true],
      ["\\+?1?[-. ]?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}", "555-12-34567", false],
      [states, "NY", true],
      [states, "XX", false],
      [`${states}(,${states})*`, "NY,CA,TX", true],
      ["(?:[a-z0-9]+-)*[a-z0-9]+(?:\\.[a-z0-9]+)*\\.[a-z]{2,}", "my-shop.example.co", true],
      ["(?:[a-z0-9]+-)*[a-z0-9]+(?:\\.[a-z0-9]+)*\\.[a-z]{2,}", "my_shop", false],
      ["[A-Z][a-z]+( [A-Z][a-z]+)*", "Ada King Lovelace", true],
      ["[A-Z][a-z]+( [A-Z][a-z]+)*", "ada lovelace", false],
      ["\\d{1,2}/\\d{1,2}/\\d{2,4}", "12/31/2026", true],
      ["(\\d{3}-?){2}\\d{4}", "555-5551234", true],
      ["\\p{L}+(?:[ '-]\\p{L}+)*", "Zoë O'Neil-Çelik", true],
      ["\\p{L}+(?:[ '-]\\p{L}+)*", "R2-D2", false],
      ["\\u{1F600}+|ok", "ok", true],
      ["[^<>]*", "no angle brackets here", true],
      ["[^<>]*", "a <b> c", false],
    ];
    for (const [pattern, value, ok] of cases) expect([pattern, value, validateValue({ pattern }, value) === null]).toEqual([pattern, value, ok]);
  });

  test("everyday patterns still validate", () => {
    const cases: [string, string, boolean][] = [
      ["[A-Z]{3}", "ABC", true],
      ["[A-Z]{3}", "abc", false],
      ["\\d{3}-\\d{4}", "555-1234", true],
      ["(?=.*[A-Z])(?=.*\\d).{8,}", "Passw0rdX", true],
      ["(?=.*[A-Z])(?=.*\\d).{8,}", "password", false],
      ["[a-z0-9]+(?:-[a-z0-9]+)*", "my-slug-1", true],
      ["[a-z0-9]+(?:-[a-z0-9]+)*", "my--slug", false],
      ["\\d+(\\.\\d+)?", "3.14", true],
      ["(\\d{1,3}\\.){3}\\d{1,3}", "192.168.0.1", true],
      ["(\\d{1,3}\\.){3}\\d{1,3}", "192.168.0", false],
      ["(\\d{3}-){2}\\d{4}", "555-555-1234", true],
      ["(?:\\+\\d{1,3})?\\d{10}", "+15551234567", true],
      ["(red|green|blue)", "green", true],
    ];
    for (const [pattern, value, ok] of cases) expect([pattern, value, validateValue({ pattern }, value) === null]).toEqual([pattern, value, ok]);
  });

  test("a slug-shaped pattern stays linear on a long near-miss", () => {
    const { out, ms } = timed(() => validateValue({ pattern: "[a-z0-9]+(?:-[a-z0-9]+)*" }, "a-".repeat(200) + "!"));
    expect(out).toContain("right format");
    expect(ms).toBeLessThan(50);
  });

  test("at most the first 1,000 characters of a value are tested", () => {
    // Quadratic on purpose: on the whole value this takes well over a second.
    const { out, ms } = timed(() => validateValue({ pattern: ".*a.*[0-9]" }, "a".repeat(60_000)));
    expect(out).toContain("right format");
    expect(ms).toBeLessThan(100);
    // A long value is judged by its first 1,000 characters.
    expect(validateValue({ pattern: "[a-z ]+" }, "long text ".repeat(500))).toBeNull();
    expect(validateValue({ pattern: "[a-z ]+" }, "long text ".repeat(50) + "!" + "x".repeat(2000))).toContain("right format");
    expect(validateValue({ pattern: "[a-z]+" }, "a".repeat(1000))).toBeNull();
  });

  test("the more ways a pattern can backtrack, the shorter the values it is run on", () => {
    const limit = (pattern: string) => fieldPattern(pattern)?.limit ?? 0;
    expect(limit("[A-Z]{3}")).toBe(1000);
    expect(limit("[a-z]+")).toBe(1000);
    expect(limit("(?=.*[A-Z])(?=.*\\d)(?=.*[a-z]).{8,}")).toBe(1000); // each lookahead on its own
    expect(limit("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}")).toBe(1000); // `+@` can match in one way only
    expect(limit("\\w+@\\w+\\.\\w+")).toBe(1000);
    expect(limit(".*@.*\\..*")).toBeGreaterThan(300);
    expect(limit(".*@.*\\..*")).toBeLessThan(1000);
    expect(limit(".*a.*a.*a.*a.*!")).toBeLessThan(120);
    expect(limit(".*a".repeat(12))).toBe(0);
    expect(limit("(a+)+")).toBe(0);
    expect(limit("[0-9")).toBe(0);
    // Beyond its limit a value is not judged by the pattern (the host's validation has the last word).
    expect(validateValue({ pattern: ".*@.*\\..*" }, "x".repeat(900))).toBeNull();
    expect(validateValue({ pattern: ".*@.*\\..*" }, "x".repeat(200))).toContain("right format");
  });
});
