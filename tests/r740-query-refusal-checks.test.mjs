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
import test from 'node:test';
import assert from 'node:assert/strict';

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

async function engine() {
  const pick = () => { const f = (...a) => a[0]; f.arr = (a) => (Array.isArray(a) ? a[0] : String(a)); return f; };
  globalThis.window = { IntMapLang: { pick, pickArgs: () => ((...a) => a) }, IntMapModules: {} };
  globalThis.document = { baseURI: 'http://localhost/' };
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
async function engineWithCountryMetrics() {
  const API = await engine();
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn,
    fetchJSON: async () => ({ features: FEED }),
    metricSpec: (k) => (METRICS[k] ? { key: METRICS[k], m: { label: [METRICS[k]] } } : null) });
  return API;
}

test('R740 ① a column is found by the names it names itself — "magnitude" reaches `mag`', async () => {
  const API = await engine();
  const res = await API.run({ from: 'earthquakes', where: [{ col: 'magnitude', op: '>=', value: 5 }] });
  assert.equal(res.ok, true, 'the condition resolves, so the query is answered');
  assert.deepEqual(res.rows.map((r) => r.id).sort(), ['a', 'b', 'e'],
    'only the M5+ rows may survive — this is exactly the filter production dropped');
  assert.ok(!(res.unapplied || []).length, 'nothing was left unapplied');
  /* and the reader's own word for it reaches the same column */
  const jp = await API.run({ from: 'earthquakes', where: [{ col: 'マグニチュード', op: '>=', value: 6 }] });
  assert.deepEqual(jp.rows.map((r) => r.id).sort(), ['a', 'e']);
});

test('R740 ② a column nothing declares refuses the query and says what the table has', async () => {
  const API = await engine();
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

test('R740 ③ `time` is a declared column, compared as a moment and not as text', async () => {
  const API = await engine();
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

test('R740 ④ the same refusal covers a joined table\'s own conditions', async () => {
  const API = await engine();
  const res = await API.run({ from: 'earthquakes', near: [{ of: 'cities', withinKm: 50, where: [{ col: 'wobble', op: '>', value: 1 }] }] });
  assert.equal(res.ok, false, 'a join condition that names no column used to be deleted and the join run anyway');
  assert.equal(res.error, 'unknown-column');
  assert.equal(res.table, 'cities', 'the refusal names the table the condition was about, not the table the query is FROM');
});

test('R740 ⑤ the result table scrolls instead of collapsing to one character per line', async () => {
  const API = await engine();
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

test('R740 ⑥ a city\'s OWN population beats the number looked up through its country', async () => {
  const API = await engineWithCountryMetrics();
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

test('R740 ⑦ a join whose target table does not resolve refuses instead of dropping the condition', async () => {
  const API = await engine();
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
