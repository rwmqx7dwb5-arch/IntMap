/* ============================================================================
 *  hist-sheet-pick.js — WHICH SHEET THE PAGE DRAWS FOR A YEAR  (one owner)
 * ----------------------------------------------------------------------------
 *  The era record is a series of dated sheets. The sheet the reader sees for a year is the CLOSEST
 *  one (not the latest at or before it), and a forward jump is taken across a modest gap only.
 *  This is the page's rule (js/time-borders.js `nearest` calls it) AND the gate's
 *  (scripts/hist-fidelity.mjs `politiesAt` calls it): the gate used to pick «latest at or before»,
 *  so it measured sheet -599 where the page drew -499 (and -199 where the page drew -99) — a
 *  measure of a map nobody saw. Same decision in two places drifts; it now lives here.
 *
 *  Pure: no DOM, no clock, no data. `years` is the list of sheet years; `csMin` is where CShapes
 *  begins (below it the forward jump is always taken — see time-borders.js on MAXGAP).
 * ========================================================================== */
export const MAXGAP = 20;
export function nearestSheet(y, years, csMin) {
  let prev = null, next = null;
  for (const yy of years) { if (yy <= y) { if (prev === null || yy > prev) prev = yy; } else if (next === null || yy < next) next = yy; }
  if (prev === null) return next != null ? next : years[0];
  if (next === null) return prev;
  if ((next - y) >= (y - prev)) return prev;
  return (y < csMin || (next - prev) <= MAXGAP) ? next : prev;
}
