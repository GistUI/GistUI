/**
 * Splits an assistant reply into chat text and ```gistui blocks, in order, while it streams: an
 * unclosed last fence is `open` (its UI is still streaming).
 *
 * Fences follow CommonMark: three or more backticks or tildes, any case of the `gistui` (or `gist`)
 * tag, an optional info string after it, and a closer of the same character that is at least as
 * long. A ```gistui example inside another code block (```markdown …) is text, not UI.
 *
 * All UI blocks of one reply are one program (a later block amends the first: the last definition
 * of a statement wins), so render them together: `replyProgram(parts)`.
 */

export type ReplyPart = { kind: "text"; text: string } | { kind: "ui"; source: string; open: boolean };

export interface SplitOptions {
  /**
   * The text is still growing. A trailing unfinished line that may yet become a fence (`` ` ``,
   * ```` ``` ````, ```` ```gis ````) is then held back instead of flashing as text or code.
   */
  streaming?: boolean;
}

/** A line that opens a fence: the fence, then its info string. */
const OPEN = /^(`{3,}|~{3,})(.*)$/;
const UI_TAG = /^\s*(gistui|gist)\b/i;
/** A line made only of fence characters (it closes a fence of the same character when long enough). */
const BARE = /^(`+|~+)$/;
/** An unfinished last line that can still become a gistui fence. */
const MAY_OPEN = /^(?:`{1,2}|~{1,2}|(?:`{3,}|~{3,})\s*(?:g(?:i(?:s(?:t(?:u(?:i)?)?)?)?)?)?)$/i;

export function splitReply(text: string, opts: SplitOptions = {}): ReplyPart[] {
  const parts: ReplyPart[] = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  /** The open fence: a UI block, or some other code block (kept as text). */
  let fence: { ch: string; len: number; ui: boolean } | null = null;
  const flushText = () => {
    const t = buf.join("\n");
    if (t.trim()) parts.push({ kind: "text", text: t.trim() });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trim();
    // The last line has no line break yet: while streaming it may still change.
    const growing = opts.streaming === true && i === lines.length - 1;
    if (fence) {
      const bare = BARE.test(t) && t[0] === fence.ch;
      if (bare && t.length >= fence.len) {
        if (fence.ui) {
          parts.push({ kind: "ui", source: buf.join("\n") + "\n", open: false });
          buf = [];
        } else buf.push(line);
        fence = null;
        continue;
      }
      // What may be the start of the closer (its indentation, its first characters) is left out for
      // now, so the source of a UI block only ever grows.
      buf.push(fence.ui && growing && (bare || t === "") ? "" : line);
      continue;
    }
    const m = OPEN.exec(t);
    // A backtick fence has no backticks in its info string (that is inline code).
    const opens = m !== null && !(m[1]![0] === "`" && m[2]!.includes("`"));
    if (opens && UI_TAG.test(m![2]!)) {
      flushText();
      fence = { ch: m![1]![0]!, len: m![1]!.length, ui: true };
      continue;
    }
    if (growing && MAY_OPEN.test(t)) continue;
    if (opens) fence = { ch: m![1]![0]!, len: m![1]!.length, ui: false };
    buf.push(line);
  }
  if (fence?.ui) parts.push({ kind: "ui", source: buf.join("\n"), open: true });
  else flushText();
  return parts;
}

/** The one program of a reply: the sources of all its UI blocks, in order. */
export function replyProgram(parts: readonly ReplyPart[]): string {
  let source = "";
  for (const p of parts) if (p.kind === "ui") source += p.source;
  return source;
}
