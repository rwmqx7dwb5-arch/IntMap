// @ts-check
/* ============================================================================
 *  IntMap · js/hist-urban.js — WHAT THE URBAN-POPULATION RECORD STATES FOR A YEAR  (pure)
 * ----------------------------------------------------------------------------
 *  The record is data/hist-urban.json (scripts/build-hist-urban.mjs): Reba, Reitsma & Seto (2016),
 *  the geocoded tables of Chandler and Modelski, 3700 BC – AD 2000, CC BY 4.0. Every reader of it —
 *  the map layer (js/layer-pkg-histurban.js), Atlas (js/atlas-cap-time.js), the tests — asks THIS
 *  file what a city's figure is in a year, so the map and the answer cannot disagree.
 *
 *  THE RULE (the bundle's `window` is its derivation — see scripts/build-hist-urban.mjs `windows`):
 *    at year T a city shows the figure(s) stated in the most recent year y ≤ T, and only while
 *    T < y + window[y]. Nothing is interpolated: the figure carries the year it was stated, and a city
 *    the next table omits stops being shown. Where both books state the same year, both figures are
 *    returned — neither is chosen over the other.
 *
 *  ⚠ PURE: no DOM, no `window`. Years are astronomical (0 = 1 BC), the clock's axis.
 * ==========================================================================*/

/** the comparison form of a name: no accents, no case, letters and digits only */
export const norm = (/** @type {any} */ s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** the names a city answers to: each table row's City cell (which may list several, comma-separated)
    and its OtherName list */
export function namesOf(/** @type {any} */ city) {
  const out = [];
  for (const r of city.r) for (const n of [...String(r.n).split(','), ...r.o]) { const t = n.trim(); if (t && out.indexOf(t) < 0) out.push(t); }
  return out;
}

/**
 * What the record states for one city at year T, or null.
 * @param {any} data the bundle   @param {any} city one of data.cities   @param {number} year astronomical
 * @returns {null | { year: number, until: number, figures: { population: number, table: string, label: string, certainty: number }[] }}
 */
export function stateAt(data, city, year) {
  let y = null;
  for (const f of city.f) { if (f[0] <= year) y = f[0]; else break; }
  if (y === null) return null;
  const w = data.window[y];
  const until = Number.isFinite(w) ? y + w : y + 1;   /* no window (never the case in the shipped record): the year itself only */
  if (year >= until) return null;
  const figures = city.f.filter((/** @type {any[]} */ f) => f[0] === y).map((/** @type {any[]} */ f) => {
    const row = city.r[f[2]], t = data.tables[row.t];
    return { population: f[1], table: t.key, label: t.label, certainty: row.q };
  });
  return { year: y, until, figures };
}

/** every city the record shows at year T, with its state — largest first (by the larger stated figure;
    the order is a listing order, not a choice between two books' figures) */
export function activeAt(/** @type {any} */ data, /** @type {number} */ year) {
  const out = [];
  for (const city of data.cities) { const s = stateAt(data, city, year); if (s) out.push({ city, state: s }); }
  const top = (/** @type {any} */ e) => Math.max(...e.state.figures.map((/** @type {any} */ f) => f.population));
  return out.sort((a, b) => top(b) - top(a) || a.city.n.localeCompare(b.city.n, 'en'));
}

/** every dated figure of a city, in year order, with its table — the population history */
export function historyOf(/** @type {any} */ data, /** @type {any} */ city) {
  return city.f.map((/** @type {any[]} */ f) => {
    const row = city.r[f[2]], t = data.tables[row.t];
    return { year: f[0], population: f[1], table: t.key, label: t.label, certainty: row.q, window: data.window[f[0]] };
  });
}

/** the cities answering to a name (exactly, after `norm`; else those whose name begins with it) */
export function findCity(/** @type {any} */ data, /** @type {string} */ name) {
  const q = norm(name);
  if (!q) return [];
  const exact = data.cities.filter((/** @type {any} */ c) => namesOf(c).some(n => norm(n) === q));
  return exact.length ? exact : data.cities.filter((/** @type {any} */ c) => namesOf(c).some(n => norm(n).startsWith(q)));
}

/* ── loading: one request per page, shared by the layer and Atlas ─────────────────────────────── */
let pending = null;
/** the bundle, fetched once on first need (never at boot). `base` is the document's base URL; `read` is
    { readWithin, clockFor } (js/fetch-deadline.js, js/proxy-fetch.js), handed in by the browser caller: the read runs
    under the clock the host is given, restarted on every chunk of the ~0.5 MB body — a stall ends it, a slow line that
    keeps delivering does not. ⚠ Handed in, not imported here: a static import would load browser code into the builder
    and the node tests, and a dynamic one split both modules out of the start-up bundle into two more start-up
    requests (check:perf, measured 2026-10-04: eager requests 9 → 11).
    A failed read is not cached, so a later need asks again (it is a new need, not a retry loop). */
export function loadRecord(/** @type {string} */ base, /** @type {any} */ read) {
  if (pending) return pending;
  const url = new URL('data/hist-urban.json', base).href;
  pending = read.readWithin(url, read.clockFor(url), undefined, { idle: true })
    .then(r => { if (!r.ok) throw new Error('Historical urban populations: HTTP ' + r.status); return JSON.parse(r.text); })
    .then(d => { if (d.v !== 1 || !Array.isArray(d.cities) || !d.window) throw new Error('Invalid historical urban population record'); return d; })
    .catch(e => { pending = null; throw e; });
  return pending;
}
