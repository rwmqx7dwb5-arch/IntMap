/* ============================================================================
 *  IntMap · Country figures — one value, its unit, its year and its source
 * ----------------------------------------------------------------------------
 *  A country row (`countryStats[code]`, built in js/countries-ui.js) carries numbers that arrive from
 *  several writers at different times: the bundled tables (js/tables.js), Natural Earth, the World
 *  Bank's latest values (js/wb-layers.js, js/app-body.js) and Maddison while the clock travels
 *  (js/time-countries.js). Each reader used to decide on its own what unit a field was in and what
 *  year to print beside it, and three of them decided wrongly:
 *    - the comparison printed GDP (PPP) — held in billions — as dollars («$6.8k» for Japan's $6.84T);
 *    - its gap-fill did the same with nominal GDP;
 *    - the country card printed «GDP (2023)» / «Population (2024)» as constant strings while the
 *      World Bank refresh replaced the value under them with another year's.
 *  THE YEAR AND THE SOURCE NOW TRAVEL WITH THE VALUE: a writer calls `setFigure`, a reader calls
 *  `figure`, and `figure` answers in the field's BASE unit (US dollars, people, …) together with the
 *  year and the source the writer stated. A field with no stated year answers `y:null` — the reader
 *  prints no year rather than a guessed one.
 *
 *  The metadata lives in a WeakMap keyed by the row, so rows stay plain records (nothing new is
 *  enumerated, serialised or compared by the many readers that walk them).
 * ==========================================================================*/

/* The unit each countryStats field is HELD in. `usd_bn` = billions of current US dollars, which is
   what the bundled tables and every `fmtMoney` reader use; `figure()` converts it to dollars. */
export const FIGURE_UNITS = Object.freeze({
  gdp: 'usd_bn', gdpPPP: 'usd_bn', milSpend: 'usd_bn',
  gdppc: 'usd', gdppcPPP: 'usd',
  pop: 'people', area: 'km2', density: 'people_km2',
  lifeExp: 'years', internet: 'pct', tfr: 'births',
  hdi: 'index', dem: 'index',
});
const TO_BASE = { usd_bn: 1e9 };

const META = new WeakMap();

/** Write `value` into `row[field]` and remember the year and source it is for. */
export function setFigure(row, field, value, y, src) {
  if (!row) return;
  row[field] = value;
  stampFigure(row, field, y, src);
}

/** Record the year and source of the value already in `row[field]`. */
export function stampFigure(row, field, y, src) {
  if (!row) return;
  let m = META.get(row);
  if (!m) { m = {}; META.set(row, m); }
  const yy = (y == null || y === '') ? null : (Number.isFinite(+y) ? +y : null);
  /* `src` is the publisher's name, or a citation `{ source, licence?, url?, code? }` (js/wb-indicators.js
     `wbCitation`, js/tables.js `STAT_SOURCES`) — what an answer's source list cites. */
  const cite = (src && typeof src === 'object') ? src : null;
  m[field] = { y: yy, src: (cite ? cite.source : src) || null, cite };
}

/**
 * The figure for `field` on `row`: `{ v, held, unit, y, src }` where `v` is in the base unit
 * (dollars, not billions), `held` is the stored number, `y` the year it is for (null when no writer
 * stated one). Null when the row has no finite value.
 */
export function figure(row, field) {
  if (!row) return null;
  const held = row[field];
  if (held == null || held === '' || !Number.isFinite(+held)) return null;
  const unit = FIGURE_UNITS[field] || null;
  const m = (META.get(row) || {})[field] || {};
  return { v: +held * (TO_BASE[unit] || 1), held: +held, unit, y: m.y == null ? null : m.y, src: m.src || null,
    licence: (m.cite && m.cite.licence) || '', url: (m.cite && m.cite.url) || '', code: (m.cite && m.cite.code) || '' };
}

/** The year the value in `row[field]` is for, or null. */
export function figureYear(row, field) {
  const f = figure(row, field);
  return f ? f.y : null;
}

/** A number HELD in `field`'s unit, in the base unit — for a reader that holds a copy of the row
 *  (the year travels only with the row itself; use `figure` when you have it). */
export function toBase(field, held) {
  if (held == null || !Number.isFinite(+held)) return null;
  return +held * (TO_BASE[FIGURE_UNITS[field]] || 1);
}
