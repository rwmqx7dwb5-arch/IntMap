/* ============================================================================
 *  R747 — THE STORE REFUSED ITS OWN KEY, ONE READER OVER FROM #R742,
 *         AND PRINTED A YEAR AS A QUANTITY
 * ----------------------------------------------------------------------------
 *  Measured on https://rwmqx7dwb5-arch.github.io/IntMap/ (build R746), 2026-09-16, signed in.
 *  "List every active volcano in Indonesia with its last known eruption year" — ONE turn, four
 *  `data.query` calls, and the first two disagreed with each other about the same table:
 *
 *      data.query {from:'volcanoes', in:{countries:['ID']}}                -> 0 rows, code ok
 *      data.query {from:'volcanoes', where:[{country '==' 'Indonesia'}]}   -> 101 rows
 *
 *  The reader was shown a "0 Volcanoes - No row satisfies every condition" card, under a heading
 *  that said "Volcanoes 1,218 - source records -> 0 - evaluated", for a question the shipped table
 *  answers completely. The country scope compared the wanted codes against `r.iso2` and `r.iso3`
 *  only, and `volcanoRows` builds every row with `iso2: ''` and the GVP country NAME in `country`.
 *
 *  [[intmap-store-refused-its-own-key]] — the shape #R742 found in `highlight`, in the other
 *  reader. The mapping between a country's name and its codes is the SAME `countryStats` record
 *  `iso2to3` already reads here, so asking it is reading the store's own declaration, not guessing
 *  at a spelling.
 *
 *  And two failures are not one: a scope that matched nothing, and a scope that COULD NOT BE
 *  APPLIED because the table names no country at all, were the same empty answer. The second is
 *  now refused by name rather than published as a complete "0".
 *
 *  The same table shipped its years with thousands separators - "LAST KNOWN ERUPTION  2,022",
 *  "1,952" - because `lastEruptionYear` is `kind:'number'` with no formatter, and `fmt()` groups
 *  anything of magnitude 1000 or more. The kind stays `number` on purpose: ordering and every
 *  numeric predicate read it. Only the PRINTING changes.
 *
 *  ⚠ THIS TEST EVALUATES THE SHIPPED ENGINE (#R505). `volcanoRows` reads its data through the
 *  injectable `D.fetchJSON`, so the real table is built from a real GVP-shaped document and the
 *  real `run()` / `answer()` are asked the production question.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.document === 'undefined') globalThis.document = { baseURI: 'https://example.invalid/' };
await import('../js/lang-registry.js');
await import('../js/atlas-query.js');

/* data/volcanoes_gvp.json is written short: `n` name, `c` country, `e` elevation, `y` the year of
   the last known eruption. Three real rows are enough — two in one country, one in another. */
const GVP = {
  features: [
    { geometry: { coordinates: [115.508, -8.343] }, properties: { v: 1, n: 'Agung', c: 'Indonesia', e: 2997, y: 2022, t: 'Stratovolcano' } },
    { geometry: { coordinates: [112.58, -7.725] }, properties: { v: 2, n: 'Arjuno-Welirang', c: 'Indonesia', e: 3343, y: 1952, t: 'Stratovolcano' } },
    { geometry: { coordinates: [138.73, 35.361] }, properties: { v: 3, n: 'Fuji', c: 'Japan', e: 3776, y: 1708, t: 'Stratovolcano' } }
  ]
};
/* the Countries record, as js/atlas-query.js reads it: alpha-3 keys carrying `a2` and `nameEn` */
const COUNTRY_STATS = {
  IDN: { a2: 'ID', nameEn: 'Indonesia', sov: true },
  JPN: { a2: 'JP', nameEn: 'Japan', sov: true }
};

function engine() {
  const Q = window.IntMapModules.atlasQuery({ lang: 'en', base: 'https://example.invalid/' });
  Q.bind({ countryStats: () => COUNTRY_STATS, fetchJSON: async () => GVP, ensureData: async () => {} });
  return Q;
}

test('R747 (4a): a country scope is answered by the name a row carries, not only by its codes', async () => {
  const Q = engine();
  const byA2 = await Q.run({ from: 'volcanoes', in: { countries: ['ID'] } });
  assert.equal(byA2.ok, true, 'the scope is applicable: these rows do say which country they are in');
  assert.deepEqual(byA2.rows.map((r) => r.name).sort(), ['Agung', 'Arjuno-Welirang'],
    'the production failure: this returned 0 of 101 Indonesian volcanoes and reported it as a complete answer');
  /* and the notation does not decide the answer - alpha-3 and the name itself read the same rows */
  const byA3 = await Q.run({ from: 'volcanoes', in: { countries: ['IDN'] } });
  assert.deepEqual(byA3.rows.map((r) => r.name).sort(), ['Agung', 'Arjuno-Welirang']);
});

test('R747 (4b): a scope that genuinely matches nothing is still an empty answer', async () => {
  const Q = engine();
  const none = await Q.run({ from: 'volcanoes', in: { countries: ['FR'] } });
  assert.equal(none.ok, true, 'France is a country this table simply has no row for');
  assert.equal(none.rows.length, 0, 'an empty result is an answer - that rule is not touched');
});

test('R747 (4c): the OTHER path still answers the same rows, so the two readers agree', async () => {
  const Q = engine();
  const byWhere = await Q.run({ from: 'volcanoes', where: [{ col: 'country', op: '==', value: 'Indonesia' }] });
  assert.deepEqual(byWhere.rows.map((r) => r.name).sort(), ['Agung', 'Arjuno-Welirang'],
    'this is the call that worked on production; both must now give the same answer');
});

test('R747 (4d): "nothing matched" and "this table cannot be asked that" are different answers', async () => {
  const Q = window.IntMapModules.atlasQuery({ lang: 'en', base: 'https://example.invalid/' });
  /* the same table with the country stripped from every row - a table that names no country at all */
  const NAMELESS = { features: GVP.features.map((f) => ({ geometry: f.geometry, properties: Object.assign({}, f.properties, { c: '' }) })) };
  Q.bind({ countryStats: () => COUNTRY_STATS, fetchJSON: async () => NAMELESS, ensureData: async () => {} });
  const r = await Q.run({ from: 'volcanoes', in: { countries: ['ID'] } });
  assert.equal(r.ok, false, 'an inapplicable scope published as a complete 0 is the defect, not the answer');
  assert.equal(r.error, 'scope-unavailable');
  assert.ok(/country/i.test(r.message || ''), 'and it says what is missing');
});

test('R747 (5): a calendar year prints as a year, and still sorts and compares as a number', async () => {
  const Q = engine();
  const out = await Q.answer({ from: 'volcanoes', in: { countries: ['ID'] },
    show: ['name', 'lastEruptionYear'], order: { col: 'lastEruptionYear', dir: 'desc' } }, {});
  assert.equal(out.ok, true);
  assert.ok(/2022/.test(out.html), 'the year must be in the table at all');
  assert.ok(!/2,022/.test(out.html),
    'the production failure: the reader was shown "LAST KNOWN ERUPTION  2,022"');
  assert.ok(!/1,952/.test(out.html), 'and "1,952"');
  /* ordering still reads the number, which is why the column keeps kind:"number" */
  const ordered = await Q.run({ from: 'volcanoes', in: { countries: ['ID'] },
    show: ['lastEruptionYear'], order: { col: 'lastEruptionYear', dir: 'desc' } });
  assert.deepEqual(ordered.rows.map((r) => r.name), ['Agung', 'Arjuno-Welirang'],
    '2022 sorts above 1952 - a formatter must not become a comparison');
  /* …and so does a predicate */
  const since2000 = await Q.run({ from: 'volcanoes', where: [{ col: 'lastEruptionYear', op: '>=', value: 2000 }] });
  assert.deepEqual(since2000.rows.map((r) => r.name), ['Agung']);
  /* ⚠ THE NEAR MISS, PINNED. `fmt()` returns the moment a column has its own formatter, so a
     formatter attached to the wrong column both un-groups a quantity AND drops its unit. The first
     draft of this round put `fmtYear` on `elevM` — 2,997 m became 2997 — and this line is what
     found it. A neighbouring column keeps its grouping and its unit. */
  const withElev = await Q.answer({ from: 'volcanoes', in: { countries: ['ID'] }, show: ['name', 'elevM'] }, {});
  assert.ok(/2,997 m/.test(withElev.html),
    'elevation is a quantity: it keeps its thousands separator and its unit');
});
