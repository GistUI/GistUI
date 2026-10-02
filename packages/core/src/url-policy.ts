/**
 * Which hosts a program may load from without a click (images, video, backgrounds). The program is
 * untrusted model output: a URL it assembles from data (`"https://x.example/?d=" + orders.total`)
 * would hand that data to another server the moment the UI renders.
 *
 * - With `allowedHosts`, every such URL must point to one of them (or be relative to the page).
 * - Without it, a URL written out in the program, or read whole from data, loads; a URL the program
 *   built from pieces does not.
 *
 * Links and `@open` need a click and are not covered here (they have their own scheme check).
 */

/** A public service that returns a site's icon; what `favicons: true` uses in the renderers. */
export const FAVICON_SERVICE = "https://www.google.com/s2/favicons?domain={host}&sz=64";

export interface UrlPolicy {
  /**
   * Hosts that may be loaded from: `"images.example.com"`, or `"*.example.com"` for its subdomains.
   * Relative URLs and the page's own host are always allowed.
   */
  allowedHosts?: readonly string[] | undefined;
}

/** Characters browsers drop or treat as space inside a URL (`ht\ttps://…`), removed before a check. */
const IGNORED = /[\u0000- \u007f]/g;

/**
 * The host an absolute (`https://host/…`) or protocol-relative (`//host/…`) URL points to, in lower
 * case without credentials and port; null for anything else (a relative path, `data:`, `#anchor`).
 */
export function hostOf(url: string): string | null {
  const m = /^(?:[a-z][a-z0-9+.-]*:)?[/\\]{2}([^/\\?#]*)/i.exec(url.replace(IGNORED, ""));
  if (!m) return null;
  return m[1]!.replace(/^.*@/, "").replace(/:\d*$/, "").toLowerCase();
}

export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  for (const a of allowed) {
    const rule = a.toLowerCase();
    if (rule === host) return true;
    if (rule.startsWith("*.") && host.endsWith(rule.slice(1)) && host.length > rule.length - 1) return true;
  }
  return false;
}

const ownHost = (): string | null => (typeof location === "object" && location && typeof location.hostname === "string" ? location.hostname.toLowerCase() : null);

/** May this URL be loaded without a click? `built`: the program assembled it from pieces. */
export function mayLoad(url: string, policy: UrlPolicy | undefined, built: boolean): boolean {
  const host = hostOf(url);
  if (host === null || host === ownHost()) return true;
  const allowed = policy?.allowedHosts;
  if (allowed) return hostAllowed(host, allowed);
  return !built;
}
