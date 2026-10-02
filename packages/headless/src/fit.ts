/**
 * Autofit for a slide or a page: the scale at which content that is too tall fits its page, like a
 * presentation app's autofit. Pure, so every renderer settles a dense slide at the same scale.
 */

const MIN_FIT = 0.4;
/** The search for a scale stops when it is known this closely. */
const FIT_STEP = 0.02;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** An autofit scale and how it was arrived at. */
export interface Fit {
  fit: number;
  /** While looking for the largest scale that fits: `lo` is known to fit, `hi` is known not to. */
  search: { lo: number | null; hi: number | null } | null;
  /** The measurements this scale was settled at: a later change of them is an outside change. */
  base: { avail: number; need: number } | null;
}

/** Where every page starts: full size, nothing measured yet. */
export const NO_FIT: Fit = { fit: 1, search: null, base: null };

/**
 * The next autofit scale. `avail` is the page's inner height; `need` is the content's layout height
 * as it is now, i.e. laid out `100 / fit` % wide and not yet scaled, so it shows `need × fit` tall.
 *
 * The height as shown is compared (comparing the unscaled height flips between two scales forever:
 * widened content fits, so the larger scale comes back), and:
 *
 * - Settled and it fits: nothing changes, however often it is measured. The scale grows again only
 *   when the page got taller or the content shorter than they were when it settled (an outside
 *   reason), never because of the widening the scale itself caused.
 * - Too tall, or room to grow: a search for the largest scale that fits. `avail / need` is a first
 *   guess that errs on the far side (widening only makes text shorter, narrowing only taller), so
 *   it brackets the answer with the current scale; the bracket is then halved until it is
 *   FIT_STEP wide (or the content fills the page), and the scale known to fit wins. Every step
 *   narrows the bracket, so it ends.
 */
export function refit(prev: Fit, avail: number, need: number): Fit {
  if (!(avail > 0) || !(need > 0)) return prev;
  const { fit } = prev;
  const tall = need * fit > avail + 1;
  const guess = Math.max(MIN_FIT, Math.min(1, Math.floor((avail / need) * 1000) / 1000));
  const settle = (): Fit => ({ fit, search: null, base: { avail, need } });
  let search = prev.search;
  if (!search) {
    if (tall) search = { lo: null, hi: null };
    else if (!prev.base) return settle();
    else if (fit < 1 && (avail > prev.base.avail + 1 || need < prev.base.need - 1)) search = { lo: null, hi: null };
    else return prev;
  }
  // It fits and fills the page: this is the scale.
  if (!tall && need * fit >= avail * (1 - FIT_STEP)) return settle();
  let { lo, hi } = search;
  if (tall) {
    hi = fit;
    if (lo !== null && lo >= hi) lo = null;
  } else {
    lo = fit;
    if (hi !== null && hi <= lo) hi = null;
  }
  // Nothing is known to fit yet: down to the guess (at the floor, too tall is as good as it gets).
  if (lo === null) return guess < fit - 0.002 ? { fit: guess, search: { lo, hi }, base: null } : settle();
  // Nothing is known not to fit: up to the guess (or it is as large as it can be).
  if (hi === null) return guess > fit + 0.002 ? { fit: guess, search: { lo, hi }, base: null } : settle();
  if (hi - lo > FIT_STEP) return { fit: round3((lo + hi) / 2), search: { lo, hi }, base: null };
  return fit === lo ? settle() : { fit: lo, search: { lo, hi }, base: null };
}
