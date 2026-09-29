/* ============================================================================
 *  IntMap · the Atlas query engine (js/atlas-query.js) — what it may answer, and what it must refuse
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r740-query-refusal-checks.test.mjs (a condition the engine could not ask
 *  must not become an answer) and tests/r747-query-scope-and-years-checks.test.mjs (the store refused
 *  its own key; a year printed as a quantity). Both run the SHIPPED engine (#R505) with stubbed data.
 *
 *  ⚠ ISOLATION. The two files used to run in separate processes and each set up `window` its own
 *  way: #R740 builds a fresh window object per engine and re-imports the module, #R747 makes
 *  `window` the global object and loads js/lang-registry.js for real. In one process those two
 *  set-ups would leak into each other, so every test installs its window through useWindow(), and
 *  the previous globals are restored when that test ends. Original headers follow.
 * ==========================================================================*/
/* ══ R740 — a condition the engine could not ask must not become an answer ══════════════════════
 *
 *  Measured on production (logged in, 2026-09-15). The reader asked Atlas:
 *
 *    "Set the earthquake layer to the 30-day window, and tell me which region had the most M5+
 *     quakes in that window."
 *
 *  and got a table of 200 rows headed 「10,971 Earthquakes · showing 200」 whose first entries were
 *  M1.5 in New Mexico, M1.29 in California, M0.98 near Anza. Underneath, in small orange text:
 *
 *    Earthquakes · magnitude — no such column, so that condition was ignored
 *    Earthquakes · time — no such column, so that condition was ignored
 *
 *  Both of those are real things about a real row: the column is called `mag`, and `quakeRows` has
 *  put `time` on every row since the table was written without any column declaring it. So the
 *  engine dropped BOTH conditions and published the answer to a different question, correctly
 *  labelled and completely wrong.
 *
 *  ⚠ THE SAME FAMILY, MEASURED AGAIN THE SAME DAY. 「人口100万人以上の都市で、活火山から100km以内に
 *  あるものを挙げて」 answered with 「Nagoya · 126,264,931」 under a column headed Population — the
 *  city column's id is `pop`, so `population` missed it and the COUNTRY metric family answered
 *  instead («looked up through the country this row is in», said the method block). Every country
 *  passes 「100万以上」, so the filter did nothing while looking like it had. And at the foot of the
 *  same answer: 「Unknown join table: 」 — with an empty name — for 「活火山から100km以内」, the only
 *  spatial part of the question, dropped in silence.
 *
 *  These checks run the shipped engine (#R505) with a stubbed USGS response.
 * ============================================================================================ */
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
 *  injectable `D.loadData` (the app binds none and js/data-door.js answers), so the real table is built from a real GVP-shaped document and the
 *  real `run()` / `answer()` are asked the production question.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

/* install `window` / `document` for ONE test and put back whatever was there when it ends */
function useWindow(t, win, doc) {
  const had = { w: Object.prototype.hasOwnProperty.call(globalThis, 'window'), wv: globalThis.window,
    d: Object.prototype.hasOwnProperty.call(globalThis, 'document'), dv: globalThis.document };
  globalThis.window = win;
  globalThis.document = doc;
  t.after(() => {
    if (had.w) globalThis.window = had.wv; else delete globalThis.window;
    if (had.d) globalThis.document = had.dv; else delete globalThis.document;
  });
}

/* ══════════════════════════ #R740 · a condition it could not ask is refused ══════════════════════════ */

/* one quake per row, in the shape the USGS FDSN geojson has */
const Q = (id, place, mag, iso, depth) => ({ id, properties: { place, mag, time: Date.parse(iso), url: '' },
  geometry: { coordinates: [10, 50, depth == null ? 10 : depth] } });

const FEED = [
  Q('a', '38 km NE of Tambo, Peru', 6.7, '2026-09-12T02:00:00Z', 99),
  Q('b', '5 km E of Ushiku, Japan', 5.8, '2026-09-10T04:00:00Z', 61),
  Q('c', '4 km WSW of Olancha, CA', 2.2, '2026-09-11T08:00:00Z', 5),
  Q('d', '6 km WNW of Cobb, CA', 0.69, '2026-08-20T23:00:00Z', 2),
  Q('e', 'Scotia Sea', 6.2, '2026-08-18T11:00:00Z', 10),
];

async function engine(t) {
  const pick = () => { const f = (...a) => a[0]; f.arr = (a) => (Array.isArray(a) ? a[0] : String(a)); return f; };
  useWindow(t, { IntMapLang: { pick, pickArgs: () => ((...a) => a) }, IntMapModules: {} }, { baseURI: 'http://localhost/' });
  const mod = await import('../js/atlas-query.js?' + Math.random());
  void mod;
  const API = globalThis.window.IntMapModules.atlasQuery({ lang: 'en', addPin: () => null });
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn,
    /* the only network this test allows: the quake feed, answered from FEED whatever is asked */
    fetchJSON: async () => ({ features: FEED }) });
  return API;
}

/* The Countries metric family, in the shape the host hands it over. `population` → `pop` is the
   REAL resolution (js/reference-data.js VMET), and it is the one that captured the city column. */
const METRICS = { population: 'pop', pop: 'pop', gdppc: 'gdppc' };
async function engineWithCountryMetrics(t) {
  const API = await engine(t);
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn,
    fetchJSON: async () => ({ features: FEED }),
    metricSpec: (k) => (METRICS[k] ? { key: METRICS[k], m: { label: [METRICS[k]] } } : null) });
  return API;
}

test('R740 ① a column is found by the names it names itself — "magnitude" reaches `mag`', async (t) => {
  const API = await engine(t);
  const res = await API.run({ from: 'earthquakes', where: [{ col: 'magnitude', op: '>=', value: 5 }] });
  assert.equal(res.ok, true, 'the condition resolves, so the query is answered');
  assert.deepEqual(res.rows.map((r) => r.id).sort(), ['a', 'b', 'e'],
    'only the M5+ rows may survive — this is exactly the filter production dropped');
  assert.ok(!(res.unapplied || []).length, 'nothing was left unapplied');
  /* and the reader's own word for it reaches the same column */
  const jp = await API.run({ from: 'earthquakes', where: [{ col: 'マグニチュード', op: '>=', value: 6 }] });
  assert.deepEqual(jp.rows.map((r) => r.id).sort(), ['a', 'e']);
});

test('R740 ② a column nothing declares refuses the query and says what the table has', async (t) => {
  const API = await engine(t);
  const res = await API.run({ from: 'earthquakes', where: [{ col: 'wobble', op: '>=', value: 1 }] });
  assert.equal(res.ok, false, 'an unanswerable condition must not produce an answer');
  assert.equal(res.error, 'unknown-column');
  assert.deepEqual(res.unknown, ['wobble']);
  assert.ok(Array.isArray(res.columns) && res.columns.includes('mag') && res.columns.includes('time'),
    `the refusal must carry the real column ids so the planner can retry once — got ${JSON.stringify(res.columns)}`);
  /* the rendered refusal names them too, or the advice never reaches the reader */
  const out = await API.answer({ from: 'earthquakes', where: [{ col: 'wobble', op: '>=', value: 1 }] }, {});
  assert.equal(out.ok, false);
  assert.ok(/wobble/.test(out.html) && /mag/.test(out.html), 'the refusal HTML names the column asked for and the ones that exist');
});

test('R740 ③ `time` is a declared column, compared as a moment and not as text', async (t) => {
  const API = await engine(t);
  assert.ok(API.columnFor('earthquakes', 'time'), 'the value every row carries must be askable');
  const res = await API.run({ from: 'earthquakes', where: [{ col: 'time', op: '>=', value: '2026-09-10' }] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.rows.map((r) => r.id).sort(), ['a', 'b', 'c'],
    'a bare date is UTC midnight of that day; "2026-09-10T04:00:00Z" is after it. '
    + 'Compared as text the row\'s longer string would have sorted BEFORE the bound and been dropped for the whole day.');
  const win = await API.run({ from: 'earthquakes', where: [
    { col: 'magnitude', op: '>=', value: 5 }, { col: 'time', op: '>=', value: '2026-09-01' }] });
  assert.deepEqual(win.rows.map((r) => r.id).sort(), ['a', 'b'], 'both conditions applied, together');
});

test('R740 ④ the same refusal covers a joined table\'s own conditions', async (t) => {
  const API = await engine(t);
  const res = await API.run({ from: 'earthquakes', near: [{ of: 'cities', withinKm: 50, where: [{ col: 'wobble', op: '>', value: 1 }] }] });
  assert.equal(res.ok, false, 'a join condition that names no column used to be deleted and the join run anyway');
  assert.equal(res.error, 'unknown-column');
  assert.equal(res.table, 'cities', 'the refusal names the table the condition was about, not the table the query is FROM');
});

test('R740 ⑤ the result table scrolls instead of collapsing to one character per line', async (t) => {
  const API = await engine(t);
  const out = await API.answer({ from: 'earthquakes', where: [{ col: 'magnitude', op: '>=', value: 5 }], show: ['mag'] }, {});
  assert.equal(out.ok, true);
  const tbl = /<table style="([^"]*)"/.exec(out.html);
  assert.ok(tbl, 'the answer renders a table');
  assert.ok(!/(^|;)\s*width:100%/.test(tbl[1]) && /min-width:100%/.test(tbl[1]),
    `a table at width:100% inside overflow-x:auto never overflows — it compresses, and in the 365 px Atlas panel `
    + `the "NAME" header wrapped to one letter per line (measured: an 8,153 px tall table). Got: ${tbl[1]}`);
  const heads = out.html.match(/<th\s[^>]*>/g) || [];
  assert.ok(heads.length >= 2 && heads.slice(0, 2).every((h) => /white-space:nowrap/.test(h)),
    'the # and Name headers must not be allowed to wrap');
});

test('R740 ⑥ a city\'s OWN population beats the number looked up through its country', async (t) => {
  const API = await engineWithCountryMetrics(t);
  /* every word for it — the id it is not, the label it declares, the reader's own language */
  for (const k of ['population', 'Population', '人口']) {
    const c = API.columnFor('cities', k);
    assert.ok(c, `«${k}» must resolve to something`);
    assert.equal(c.id, 'pop', `«${k}» must be the CITY's population column, not the country's — `
      + 'production printed 126,264,931 as the population of Nagoya');
    assert.equal(c.origin, 'raw', 'it is a field of the city record, copied — not derived through a country code');
  }
  /* …and the explicit key still reaches the country, or 「その都市の国の人口」 becomes unaskable */
  const cc = API.columnFor('cities', 'country.population');
  assert.ok(cc, '`country.population` must stay answerable');
  assert.equal(cc.id, 'country.pop');
  assert.equal(cc.origin, 'derived');
  /* a metric the cities table does not have goes on reaching the Countries record, as before */
  const g = API.columnFor('cities', 'gdppc');
  assert.ok(g, '`gdppc` must still resolve');
  assert.equal(g.id, 'country.gdppc');
  assert.equal(g.origin, 'derived');
});

test('R740 ⑦ a join whose target table does not resolve refuses instead of dropping the condition', async (t) => {
  const API = await engine(t);
  /* production sent a join with no `of` at all and got 「Unknown join table: 」 printed under a
     complete-looking table — the spatial half of the question deleted in silence */
  const res = await API.run({ from: 'earthquakes', near: [{ withinKm: 100 }] });
  assert.equal(res.ok, false, 'a join that cannot name its target must not answer');
  assert.equal(res.error, 'unknown-table');
  assert.ok(Array.isArray(res.tables) && res.tables.includes('volcanoes'),
    `the refusal carries the tables that DO exist — got ${JSON.stringify(res.tables)}`);
  const out = await API.answer({ from: 'earthquakes', near: [{ of: 'vulcanoes', withinKm: 100 }] }, {});
  assert.equal(out.ok, false, 'a misspelled target table is refused, not ignored');
  assert.ok(/volcanoes/.test(out.html), 'and the reader is told what the tables are actually called');
});

/* ══════════════════════════ #R747 · the store answers by its own key; a year is a year ══════════════════════════ */
/* #R747's set-up, per test: `window` IS the global object (as it was in its own file), and the
   language registry and the engine are loaded for real into it. */
async function load747(t) {
  useWindow(t, globalThis, { baseURI: 'https://example.invalid/' });
  const nonce = '?r747=' + Math.random().toString(36).slice(2);
  await import('../js/lang-registry.js' + nonce);
  await import('../js/atlas-query.js' + nonce);
}
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

function engine747() {
  const Q = window.IntMapModules.atlasQuery({ lang: 'en', base: 'https://example.invalid/' });
  Q.bind({ countryStats: () => COUNTRY_STATS, loadData: async () => GVP, ensureData: async () => {} });   /* (data-one-door) the engine's injection point for data/ reads */
  return Q;
}

test('R747 (4a): a country scope is answered by the name a row carries, not only by its codes', async (t) => {
  await load747(t);
  const Q = engine747();
  const byA2 = await Q.run({ from: 'volcanoes', in: { countries: ['ID'] } });
  assert.equal(byA2.ok, true, 'the scope is applicable: these rows do say which country they are in');
  assert.deepEqual(byA2.rows.map((r) => r.name).sort(), ['Agung', 'Arjuno-Welirang'],
    'the production failure: this returned 0 of 101 Indonesian volcanoes and reported it as a complete answer');
  /* and the notation does not decide the answer - alpha-3 and the name itself read the same rows */
  const byA3 = await Q.run({ from: 'volcanoes', in: { countries: ['IDN'] } });
  assert.deepEqual(byA3.rows.map((r) => r.name).sort(), ['Agung', 'Arjuno-Welirang']);
});

test('R747 (4b): a scope that genuinely matches nothing is still an empty answer', async (t) => {
  await load747(t);
  const Q = engine747();
  const none = await Q.run({ from: 'volcanoes', in: { countries: ['FR'] } });
  assert.equal(none.ok, true, 'France is a country this table simply has no row for');
  assert.equal(none.rows.length, 0, 'an empty result is an answer - that rule is not touched');
});

test('R747 (4c): the OTHER path still answers the same rows, so the two readers agree', async (t) => {
  await load747(t);
  const Q = engine747();
  const byWhere = await Q.run({ from: 'volcanoes', where: [{ col: 'country', op: '==', value: 'Indonesia' }] });
  assert.deepEqual(byWhere.rows.map((r) => r.name).sort(), ['Agung', 'Arjuno-Welirang'],
    'this is the call that worked on production; both must now give the same answer');
});

test('R747 (4d): "nothing matched" and "this table cannot be asked that" are different answers', async (t) => {
  await load747(t);
  const Q = window.IntMapModules.atlasQuery({ lang: 'en', base: 'https://example.invalid/' });
  /* the same table with the country stripped from every row - a table that names no country at all */
  const NAMELESS = { features: GVP.features.map((f) => ({ geometry: f.geometry, properties: Object.assign({}, f.properties, { c: '' }) })) };
  Q.bind({ countryStats: () => COUNTRY_STATS, loadData: async () => NAMELESS, ensureData: async () => {} });
  const r = await Q.run({ from: 'volcanoes', in: { countries: ['ID'] } });
  assert.equal(r.ok, false, 'an inapplicable scope published as a complete 0 is the defect, not the answer');
  assert.equal(r.error, 'scope-unavailable');
  assert.ok(/country/i.test(r.message || ''), 'and it says what is missing');
});

test('R747 (5): a calendar year prints as a year, and still sorts and compares as a number', async (t) => {
  await load747(t);
  const Q = engine747();
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

