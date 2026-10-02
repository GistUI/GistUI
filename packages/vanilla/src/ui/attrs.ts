/**
 * Attribute values as `@gistui/react` writes them. React renders `data-x={true}` as
 * `data-x="true"` (and leaves the attribute out for `undefined`); the stylesheet only tests for
 * presence, but the markup of the two renderers is compared attribute by attribute.
 */

/** `"true"` or no attribute: React's `data-x={cond || undefined}`. */
export const flag = (on: unknown): "true" | undefined => (on ? "true" : undefined);

/** `""` or no attribute: React's `data-x={cond ? "" : undefined}`. */
export const mark = (on: unknown): "" | undefined => (on ? "" : undefined);
