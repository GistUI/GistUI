/**
 * URLs from a program are untrusted. `safeUrl` returns a URL that is safe to put in `href` or `src`,
 * or undefined: `http:`, `https:`, `mailto:` and `tel:`, or a relative path. Everything else is
 * refused: `javascript:`, `data:`, `blob:`, `//host`, and anything written to look like a path
 * but resolve elsewhere (`/\host`).
 *
 * The check works on the URL the browser will actually see: browsers drop tabs, newlines and other
 * control characters before parsing, so `java\tscript:` is `javascript:`.
 */

const SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto", "tel"]);

export function safeUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  // What the browser's URL parser removes: C0 controls and DEL anywhere, spaces at the ends.
  const u = url.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  if (!u || u.includes("\\")) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1];
  if (scheme !== undefined) return SCHEMES.has(scheme.toLowerCase()) ? u : undefined;
  // No scheme: a relative reference. `//host` would go to another site.
  if (u.startsWith("//")) return undefined;
  // A colon before the first `/`, `?` or `#` would still be read as a scheme by a lenient parser.
  const head = u.split(/[/?#]/, 1)[0]!;
  return head.includes(":") ? undefined : u;
}

/** The host a safe URL points to; "" for a relative one (the page's own host), undefined when unsafe. */
export function urlHost(url: unknown): string | undefined {
  const u = safeUrl(url);
  if (u === undefined) return undefined;
  const m = /^https?:\/\/([^/?#]*)/i.exec(u);
  if (!m) return "";
  // Drop credentials and the port: `user:pass@host:8080` → `host`.
  return m[1]!.replace(/^.*@/, "").replace(/:\d*$/, "").toLowerCase();
}
