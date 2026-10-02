/**
 * Form validation shared by every framework: field rules → an error message or null. Pure functions;
 * templates decide when to run them (on submit, blur or change) and where to show the message.
 */

export type FieldValue = string | string[] | boolean | null | undefined;

export interface FieldRules {
  /** Label used in messages ("Email is required"). */
  label?: string;
  required?: boolean;
  /** Input type: email and url get format checks; number gets numeric checks. */
  type?: string;
  /** Numbers: smallest and largest value. */
  min?: number;
  max?: number;
  /** Text: shortest and longest length. Lists (checkbox groups, tags): fewest and most items. */
  minLength?: number;
  maxLength?: number;
  /** A regular expression the whole value must match. */
  pattern?: string;
  /** Name of another field this one must equal (confirm password, confirm email). */
  match?: string;
  /** Allowed URL protocols, e.g. ["https"]. Defaults to http and https. */
  protocols?: readonly string[];
  /** A message that replaces the built-in one when a filled-in value is invalid. */
  message?: string;
  /** The message when a required field is empty (default: "Email is required"). */
  requiredMessage?: string;
}

// Practical email check: local@domain.tld, an ASCII dot-atom local part (what JSON Schema's
// `format: email` accepts), one @, a dot in the domain, a 2+ letter TLD.
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function isEmail(v: string): boolean {
  return v.length <= 254 && EMAIL.test(v) && !v.includes("..");
}

/** Protocol names as compared and emitted: lower case, no trailing colon, scheme characters only. */
export function urlProtocols(protocols: readonly string[] | undefined): string[] {
  const out = (protocols ?? []).map((p) => String(p).toLowerCase().replace(/:$/, "")).filter((p) => /^[a-z][a-z0-9+.-]*$/.test(p));
  return out.length ? out : ["http", "https"];
}

/**
 * A URL with one of the allowed protocols, written as `scheme://`, and a real host (a dot, or
 * localhost). `https:example.com` parses as a URL but is not what the message asks for, nor what the
 * form schema's pattern accepts.
 */
export function isUrl(v: string, protocols: readonly string[] = ["http", "https"]): boolean {
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(v)) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  const proto = u.protocol.replace(/:$/, "").toLowerCase();
  if (!urlProtocols(protocols).includes(proto)) return false;
  // Letters, digits, dots and hyphens only (an international name arrives here as punycode).
  if (!/^[a-z0-9.-]+$/i.test(u.hostname)) return false;
  return u.hostname === "localhost" || /\.[a-z]{2,}$/i.test(u.hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname);
}

// ─── Program patterns ───────────────────────────────────────────────────────
//
// A program's `pattern:` is a regular expression from untrusted text, run on what the user types.
// JavaScript's engine backtracks, so some patterns take exponential or polynomial time on some
// values. Before a pattern is used, a static pass over its source:
//   - refuses repetition whose passes are ambiguous (`(a+)+`, `(\w+\s?)*`, `(a|aa)+`): exponential;
//   - estimates what is left (unbounded quantifiers side by side, optional pieces, alternatives)
//     and derives the longest value the pattern is run on, so one test stays in the millisecond range.
// A refused pattern is ignored, like one that is not a valid regular expression.

/** A program's pattern is tested on at most this many characters of a value (its start). */
export const PATTERN_MAX_VALUE = 1000;
const PATTERN_MAX_SOURCE = 500;
/** log2 of the backtracking steps one test may take (about 16 million). */
const PATTERN_BUDGET = 24;
/** A pattern that can only be run on values shorter than this is not worth running. */
const PATTERN_MIN_VALUE = 16;

interface Quantifier {
  len: number;
  min: number;
  max: number;
}

function quantifierAt(src: string, i: number): Quantifier | null {
  const c = src[i];
  let q: Quantifier | null = null;
  if (c === "*") q = { len: 1, min: 0, max: Infinity };
  else if (c === "+") q = { len: 1, min: 1, max: Infinity };
  else if (c === "?") q = { len: 1, min: 0, max: 1 };
  else if (c === "{") {
    const m = /^\{(\d{1,5})(?:(,)(\d{0,5}))?\}/.exec(src.slice(i, i + 16));
    if (!m) return null;
    const min = Number(m[1]);
    q = { len: m[0].length, min, max: m[2] ? (m[3] ? Number(m[3]) : Infinity) : min };
  }
  if (q && src[i + q.len] === "?") q.len++; // lazy
  return q;
}

/** Index after the character class that starts at `i`. */
function classEnd(src: string, i: number): number {
  let j = i + 1;
  if (src[j] === "^") j++;
  if (src[j] === "]") j++;
  for (; j < src.length; j++) {
    if (src[j] === "\\") j++;
    else if (src[j] === "]") return j + 1;
  }
  return src.length;
}

/** Index after the escape that starts at `i` (`\d`, `\.`, `\p{L}`, `\u{1F600}`, `\u00e9`, `\x41`, `\k<name>`). */
function escapeEnd(src: string, i: number): number {
  const c = src[i + 1];
  const close = (ch: string) => {
    const e = src.indexOf(ch, i + 2);
    return e < 0 ? src.length : e + 1;
  };
  if ((c === "p" || c === "P" || c === "u") && src[i + 2] === "{") return close("}");
  if (c === "k" && src[i + 2] === "<") return close(">");
  if (c === "u") return Math.min(src.length, i + 6);
  if (c === "x") return Math.min(src.length, i + 4);
  if (c === "c") return Math.min(src.length, i + 3);
  return Math.min(src.length, i + 2);
}

/** One element of a group's body: a character, an escape or a class, with its quantifier. */
interface PatternAtom {
  src: string;
  q: Quantifier | null;
  /** What its quantifier added to the cost (taken back when the next atom pins it down). */
  unbounded?: boolean;
  bits?: number;
}

/** The characters an atom matches, when they can be listed: a literal, or a class of plain characters. */
function atomChars(src: string): string[] | null {
  if (src.length === 1) return src === "." ? null : [src];
  if (src[0] === "\\") return src.length === 2 && /[^A-Za-z0-9]/.test(src[1]!) ? [src[1]!] : null;
  if (src[0] !== "[" || src[1] === "^") return null;
  const out: string[] = [];
  const body = src.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === "\\") {
      const next = body[++i];
      if (next === undefined || /[A-Za-z0-9]/.test(next)) return null; // \d, \w, \u…: a set, not a character
      out.push(next);
    } else if (c === "-" && i > 0 && i < body.length - 1) return null; // a range
    else out.push(c);
  }
  return out;
}

function atomMatcher(src: string): RegExp | null {
  try {
    return new RegExp(`^(?:${src})$`, "u");
  } catch {
    try {
      return new RegExp(`^(?:${src})$`);
    } catch {
      return null;
    }
  }
}

/** True when no character can be matched by both atoms, and that can be shown (one of them lists its characters). */
function disjoint(a: PatternAtom, b: PatternAtom): boolean {
  for (const [listed, other] of [[a, b], [b, a]] as const) {
    const chars = atomChars(listed.src);
    const re = chars && atomMatcher(other.src);
    if (chars && re) return chars.every((c) => !re.test(c));
  }
  return false;
}

/**
 * True when a repeated body can be read in only one way: after every atom that may vary (`+`, `*`,
 * `?`, `{1,3}`) comes, perhaps past other optional atoms, a required atom that shares no character
 * with it. `-[a-z0-9]+`, `\d{1,3}\.` and ` [A-Z][a-z]+` are; `\w+\s?` and `[a-z]+ ?` are not: their
 * letters can be split between one pass and the next in exponentially many ways.
 */
function unambiguous(atoms: readonly PatternAtom[]): boolean {
  const n = atoms.length;
  for (let i = 0; i < n; i++) {
    const a = atoms[i]!;
    if (!a.q || a.q.max === a.q.min) continue;
    let pinned = false;
    for (let step = 1; step <= n && !pinned; step++) {
      const b = atoms[(i + step) % n]!;
      if (b === a || !disjoint(a, b)) return false;
      pinned = !b.q || b.q.min >= 1;
    }
    if (!pinned) return false;
  }
  return true;
}

/** Alternatives that are plain text and of which none starts another: at most one can match at a position. */
function plainAlternatives(body: string): boolean {
  if (!/^[^()[\]\\*+?{}.^$]+$/.test(body)) return false;
  const alts = body.split("|");
  return alts.every((a, i) => a !== "" && alts.every((b, j) => i === j || !b.startsWith(a)));
}

/** What one sequence of a pattern can cost: unbounded quantifiers, and log2 of its other choices. */
interface PatternCost {
  unbounded: number;
  bits: number;
}

interface PatternGroup {
  /** Where the body starts in the source. */
  body: number;
  /** A lookahead or lookbehind: matched on its own, so it has its own cost. */
  look: boolean;
  cost: PatternCost;
  /** The body as a flat list of atoms; null when it holds a group. */
  atoms: PatternAtom[] | null;
  /** The atom just before the current position, if the last thing was an atom. */
  last: PatternAtom | null;
  pipes: number;
  /** Holds a quantifier that can vary; the widest one's range; log2 of the bounded ones' choices. */
  variable: boolean;
  widest: number;
  bits: number;
  /** Holds alternatives that may match the same text, or a lookaround. */
  loose: boolean;
  hasLook: boolean;
}

/**
 * The longest value a pattern may be run on, or 0 when it must not be run at all (see the note above).
 */
function patternLimit(src: string): number {
  const costs: PatternCost[] = [{ unbounded: 0, bits: 0 }];
  const group = (body: number, look: boolean, cost: PatternCost): PatternGroup => ({ body, look, cost, atoms: [], last: null, pipes: 0, variable: false, widest: 0, bits: 0, loose: false, hasLook: false });
  const stack: PatternGroup[] = [group(0, false, costs[0]!)];
  /** Counts a quantifier that can vary toward the sequence of `g` (and notes it on its atom). */
  const count = (g: PatternGroup, q: Quantifier, atom?: PatternAtom) => {
    const range = q.max - q.min;
    if (range <= 0) return;
    g.variable = true;
    g.widest = Math.max(g.widest, range);
    if (range > 64) {
      g.cost.unbounded++;
      if (atom) atom.unbounded = true;
    } else {
      const bits = Math.log2(range + 1);
      g.cost.bits += bits;
      g.bits += bits;
      if (atom) atom.bits = bits;
    }
  };
  /**
   * An atom that may vary, directly followed by a required atom that shares no character with it,
   * has only one way to match (as far as it can go): `[\w.]+@`, `\d{1,3}\.`. It costs nothing.
   */
  const pin = (g: PatternGroup, next: PatternAtom) => {
    const a = g.last;
    if (!a || (!a.unbounded && !a.bits) || (next.q && next.q.min < 1) || !disjoint(a, next)) return;
    if (a.unbounded) g.cost.unbounded--;
    else {
      g.cost.bits -= a.bits!;
      g.bits -= a.bits!;
    }
  };
  for (let i = 0; i < src.length; ) {
    const top = stack[stack.length - 1]!;
    const c = src[i]!;
    if (c === "(") {
      // The group prefix: (?: (?= (?! (?<= (?<! (?<name>
      const m = /^\((?:\?(?:[:=!]|<[=!]|<[^>]*>))?/.exec(src.slice(i, i + 64))!;
      const look = /^\(\?<?[=!]/.test(m[0]);
      i += m[0].length;
      top.atoms = null;
      top.last = null;
      const cost = look ? { unbounded: 0, bits: 0 } : top.cost;
      if (look) costs.push(cost);
      stack.push(group(i, look, cost));
      continue;
    }
    if (c === ")") {
      const g = stack.pop()!;
      const parent = stack[stack.length - 1];
      if (!parent) return 0;
      const q = quantifierAt(src, i + 1);
      if (g.pipes) {
        const choice = Math.log2(g.pipes + 1);
        g.cost.bits += choice;
        g.bits += choice;
        if (!plainAlternatives(src.slice(g.body, i))) g.loose = true;
      }
      if (q && q.max > 1 && !g.look) {
        // A group that repeats: every pass must be readable in one way only.
        if (g.loose || g.hasLook) return 0;
        if (g.variable && !(g.atoms && !g.pipes && unambiguous(g.atoms))) {
          // Or be small enough to try every way: `(a?b?){3}`.
          if (q.max > 3 || g.widest > 3) return 0;
          g.cost.bits += g.bits * (q.max - 1);
          g.bits *= q.max;
        }
      }
      if (q) count(parent, q);
      parent.variable ||= g.variable;
      parent.widest = Math.max(parent.widest, g.widest);
      parent.loose ||= g.loose;
      parent.hasLook ||= g.look || g.hasLook;
      if (!g.look) parent.bits += g.bits;
      i += 1 + (q?.len ?? 0);
      continue;
    }
    if (c === "|") {
      top.pipes++;
      top.atoms = null;
      top.last = null;
      i++;
      continue;
    }
    const end = c === "\\" ? escapeEnd(src, i) : c === "[" ? classEnd(src, i) : i + 1;
    const q = quantifierAt(src, end);
    const atom: PatternAtom = { src: src.slice(i, end), q };
    // Anchors and boundaries match no character: they neither pin nor separate.
    if (!/^(?:[\^$]|\\[bB])$/.test(atom.src)) {
      pin(top, atom);
      top.atoms?.push(atom);
      top.last = atom;
      if (q) count(top, q, atom);
    }
    i = end + (q?.len ?? 0);
  }
  if (stack.length !== 1) return 0;
  const root = stack[0]!;
  if (root.pipes) root.cost.bits += Math.log2(root.pipes + 1);
  let limit = PATTERN_MAX_VALUE;
  for (const { unbounded: u, bits } of costs) {
    if (bits > PATTERN_BUDGET) return 0;
    if (!u) continue;
    // `u` unbounded quantifiers can share n characters in C(n + u, u) ways, at most (n + u)^u / u!. Solve for n.
    let factorial = 0;
    for (let k = 2; k <= u; k++) factorial += Math.log2(k);
    limit = Math.min(limit, Math.floor(2 ** ((PATTERN_BUDGET - bits + factorial) / u)) - u);
  }
  return limit < PATTERN_MIN_VALUE ? 0 : limit;
}

export interface FieldPattern {
  /** Matches the whole value. */
  re: RegExp;
  /** The anchored source, when it also compiles as a JSON Schema (unicode) pattern; else null. */
  schema: string | null;
  /** The longest value the pattern is run on (see `PATTERN_MAX_VALUE`). */
  limit: number;
}

const patterns = new Map<string, FieldPattern | null>();

/**
 * Compiles a program's `pattern:` for use on what the user types. Null (the pattern is ignored)
 * when it is not a valid regular expression, is very long, or cannot be run safely. The same answer
 * decides whether the form's JSON Schema carries the pattern.
 */
export function fieldPattern(pattern: string | undefined): FieldPattern | null {
  if (!pattern) return null;
  const hit = patterns.get(pattern);
  if (hit !== undefined) return hit;
  let out: FieldPattern | null = null;
  if (pattern.length <= PATTERN_MAX_SOURCE) {
    const source = `^(?:${pattern})$`;
    let re: RegExp | null = null;
    let schema: string | null = source;
    try {
      re = new RegExp(source, "u");
    } catch {
      try {
        // Valid only without the `u` flag (`\-` outside a class): validated here, not emitted.
        re = new RegExp(source);
        schema = null;
      } catch {
        re = null;
      }
    }
    const limit = re ? patternLimit(pattern) : 0;
    if (re && limit) out = { re, schema, limit };
  }
  if (patterns.size >= 200) patterns.clear();
  patterns.set(pattern, out);
  return out;
}

/**
 * Runs a field's pattern on a value. A value longer than the pattern can be run on is judged by its
 * first `PATTERN_MAX_VALUE` characters when the pattern allows that many, and is not judged at all
 * (it passes) when the pattern is too costly for its length: the host's own validation has the last word.
 */
function matchesPattern(p: FieldPattern, v: string): boolean {
  if (v.length <= p.limit) return p.re.test(v);
  return p.limit < PATTERN_MAX_VALUE || p.re.test(v.slice(0, PATTERN_MAX_VALUE));
}

const empty = (v: FieldValue) => v === null || v === undefined || v === false || (typeof v === "string" ? v.trim() === "" : Array.isArray(v) && v.length === 0);

/** Validates one value; `values` holds every field (for `match`). Returns a message or null. */
export function validateValue(rules: FieldRules, value: FieldValue, values: Readonly<Record<string, FieldValue>> = {}): string | null {
  const name = rules.label || "This field";
  const fail = (msg: string) => rules.message ?? msg;
  if (empty(value)) {
    if (rules.required) return rules.requiredMessage ?? (Array.isArray(value) || value === false ? `Please choose ${name.toLowerCase()}` : `${name} is required`);
    // An empty confirm field does not match a filled-in password.
    const other = rules.match !== undefined ? values[rules.match] : undefined;
    return typeof other === "string" && other !== "" ? fail(`Does not match`) : null;
  }

  if (Array.isArray(value)) {
    if (rules.minLength !== undefined && value.length < rules.minLength) return fail(`Choose at least ${rules.minLength}`);
    if (rules.maxLength !== undefined && value.length > rules.maxLength) return fail(`Choose at most ${rules.maxLength}`);
    return null;
  }
  if (typeof value !== "string") return null;
  const v = value.trim();

  switch (rules.type) {
    case "email":
      if (!isEmail(v)) return fail("Enter a valid email address, like name@example.com");
      break;
    case "url": {
      const protocols = urlProtocols(rules.protocols);
      if (!isUrl(v, protocols)) return fail(`Enter a valid URL starting with ${protocols.map((p) => `${p}://`).join(" or ")}`);
      break;
    }
    case "number": {
      const n = Number(v);
      if (!Number.isFinite(n)) return fail("Enter a number");
      if (rules.min !== undefined && n < rules.min) return fail(`Must be at least ${rules.min}`);
      if (rules.max !== undefined && n > rules.max) return fail(`Must be at most ${rules.max}`);
      break;
    }
    case "tel":
      if (!/^\+?[\d\s().-]{7,20}$/.test(v)) return fail("Enter a valid phone number");
      break;
  }
  // Characters, not UTF-16 units: the count JSON Schema's minLength/maxLength use.
  const length = rules.minLength !== undefined || rules.maxLength !== undefined ? Array.from(v).length : 0;
  if (rules.minLength !== undefined && length < rules.minLength) return fail(`Use at least ${rules.minLength} characters`);
  if (rules.maxLength !== undefined && length > rules.maxLength) return fail(`Use at most ${rules.maxLength} characters`);
  const pattern = fieldPattern(rules.pattern);
  if (pattern && !matchesPattern(pattern, v)) return fail(`${name} is not in the right format`);
  if (rules.match !== undefined) {
    const other = values[rules.match];
    if (typeof other === "string" && other !== value) return fail(`Does not match`);
  }
  return null;
}

/** Validates many fields at once: name → message, only for fields that fail. */
export function validateAll(rules: Readonly<Record<string, FieldRules>>, values: Readonly<Record<string, FieldValue>>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, r] of Object.entries(rules)) {
    const msg = validateValue(r, values[name], values);
    if (msg) errors[name] = msg;
  }
  return errors;
}
