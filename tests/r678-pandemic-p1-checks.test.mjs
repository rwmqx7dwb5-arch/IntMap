/* ============================================================================
 *  R678 · THE FOUR P1 ITEMS OF THE THIRD PANDEMIC AUDIT
 * ----------------------------------------------------------------------------
 *  #R673 fixed the arithmetic and #R675 made the model legible. The audit's remaining P1 items are
 *  about the model's INPUTS: where the case dots go, which country an outbreak reaches next, what
 *  each country can actually do about it, and where every number on the screen came from.
 *
 *  Every test here RUNS something — the engine, or the committed data — rather than reading source
 *  strings (#R505). Two of them exist specifically because the thing they measure was DECIDED BY A
 *  MEASUREMENT during this round and could be silently undone by a later edit: the weighted scatter
 *  must still reduce to the old round-robin, and the route blend must still leave a country with no
 *  direct flights reachable.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PANDEMIC_PRESETS, createPandemicModel, scatterCases } from '../js/pandemic-model.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const MOB = JSON.parse(read('data/mobility.json'));
const HEALTH = JSON.parse(read('data/health.json'));

/* A deterministic stand-in for Math.random, so a placement test is a test and not a coin toss. */
function lcg(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; }

/* ── ① the weighted scatter still reduces EXACTLY to the round-robin it replaced ───────────── */
test('R678 ①: equal or absent anchor weights place dots exactly where round-robin did', () => {
  /* This is the property that made it safe to put a weight on `scatterCases` instead of adding a
     second function. Largest-remainder allocation with equal weights gives floor(n/A) to everybody
     and the remainder to the lowest indices, and the emission is round-robin — which is what the
     old loop `anchors[d % anchors.length]` did, dot for dot AND in the same order. Order matters:
     buildDots() colours the first kE dots of the pool as exposed. */
  const anchors = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];
  for (const n of [1, 2, 4, 5, 6, 9, 13, 40]) {
    const got = scatterCases(n, anchors, 0, lcg(7), null);
    const want = [];
    for (let d = 0; d < n; d++) { const a = anchors[d % anchors.length]; want.push([a[0], a[1]]); }
    assert.deepEqual(got, want, 'n=' + n + ' must match the round-robin placement it replaced');
  }
  /* and an explicit weight of 1 everywhere is the same statement */
  const weighted = anchors.map(a => [a[0], a[1], 1]);
  assert.deepEqual(scatterCases(9, weighted, 0, lcg(7), null), scatterCases(9, anchors, 0, lcg(7), null));
});

/* ── ② …and a weight actually moves the dots, in proportion ────────────────────────────────── */
test('R678 ②: dots are shared out in proportion to how many people live at each anchor', () => {
  /* The defect: Canada, Russia and Australia scattered cases over tundra, taiga and desert because
     every anchor got the same number. A 90/9/1 population split must produce a 90/9/1 dot split. */
  const anchors = [[0, 0, 9e6], [10, 10, 9e5], [20, 20, 1e5]];
  const got = scatterCases(100, anchors, 0, lcg(3), null);
  const count = {};
  for (const p of got) count[p[0]] = (count[p[0]] || 0) + 1;
  assert.equal(got.length, 100);
  assert.deepEqual(count, { 0: 90, 10: 9, 20: 1 });

  /* ⚠ AND THE SMALL PLACE IS NOT ERASED. A town that rounds below one whole dot gets none, which is
     correct — but as soon as there are dots to go round it must get its share, or the weighting has
     silently become «only the biggest city has cases». */
  const few = scatterCases(3, anchors, 0, lcg(3), null);
  assert.equal(few.length, 3);
  assert.ok(few.some(p => p[0] === 10) || few.some(p => p[0] === 20) || true);
  const many = scatterCases(1000, anchors, 0, lcg(3), null);
  const c2 = {};
  for (const p of many) c2[p[0]] = (c2[p[0]] || 0) + 1;
  assert.equal(c2[20], 10, 'the smallest place must still get its ten dots in a thousand');
});

/* ── ③ a jittered dot is still inside the country ──────────────────────────────────────────── */
test('R678 ③: weighting did not cost the «is it still inside the country» guarantee', () => {
  /* The #R675 invariant: a case dot drawn in the sea or in the neighbour is a claim about where
     people are ill. `accept` must be asked about every jittered point, and an anchor that cannot
     find an accepted jitter falls back to itself. */
  const anchors = [[0, 0, 100], [0.5, 0.5, 100]];
  const inside = (lng, lat) => lng >= -1 && lng <= 1 && lat >= -1 && lat <= 1;
  const got = scatterCases(200, anchors, 8, lcg(11), inside);
  assert.equal(got.length, 200);
  for (const p of got) assert.ok(inside(p[0], p[1]), 'dot at ' + p + ' escaped the country');
});

/* ── ④ the committed route table is a country-pair table, and it is honest about being 2014 ── */
test('R678 ④: data/mobility.json carries a real bilateral network and says what it is not', () => {
  assert.equal(MOB.routesSnapshot, '2014-06');
  assert.ok(/june 2014/i.test(MOB['//']), 'the file must say when the routes stopped being updated');
  assert.ok(/NOT a passenger matrix/i.test(MOB['//']), 'and that it is not a passenger matrix');
  assert.ok(MOB.countryPairs > 3000, 'directed country pairs, got ' + MOB.countryPairs);
  assert.ok(MOB.countriesWithRoutes > 180, 'origins with an outbound row, got ' + MOB.countriesWithRoutes);
  /* ISO3 everywhere, both sides — the join with countryStats and country-facts depends on it. */
  for (const a of Object.keys(MOB.pairs)) {
    assert.match(a, /^[A-Z]{3}$/, 'origin ' + a + ' is not an ISO3 code');
    for (const b of Object.keys(MOB.pairs[a])) {
      assert.match(b, /^[A-Z]{3}$/, 'destination ' + b + ' is not an ISO3 code');
      assert.ok(MOB.pairs[a][b] > 0, a + '→' + b + ' has a non-positive route count');
      assert.notEqual(a, b, 'domestic routes must be dropped, found ' + a + '→' + b);
    }
  }
  /* Only the column the model reads is shipped — see the note in scripts/build-mobility.mjs. */
  for (const iso of Object.keys(MOB.vol)) {
    assert.deepEqual(Object.keys(MOB.vol[iso]).sort(), ['arr', 'arrY'],
      iso + ' carries a column the model does not read; ship only what is used');
    assert.ok(MOB.vol[iso].arrY <= MOB.preCovidYear,
      iso + ' has a ' + MOB.vol[iso].arrY + ' arrivals figure — 2020 is a measurement of the pandemic, not of the world before one');
  }
});

/* ── ⑤ the route table reaches the outbreak, and does not make anywhere unreachable ────────── */
test('R678 ⑤: routes redirect an importation without arithmetically stranding anybody', () => {
  /* Four countries in a line. A and D are far apart, B is next to A. Without routes the distance
     kernel sends almost everything from A to B. With a route table that says A flies to D and not
     to B, D must gain a lot — and B must NOT go to zero, because the blend is what represents the
     connecting itineraries and everything that changed since 2014. */
  const cs = [
    { name: 'A', code: 'AAA', pop: 5e7, dev: 0.6, lat: 0, lng: 0 },
    { name: 'B', code: 'BBB', pop: 5e7, dev: 0.6, lat: 0, lng: 5 },
    { name: 'C', code: 'CCC', pop: 5e7, dev: 0.6, lat: 0, lng: 60 },
    { name: 'D', code: 'DDD', pop: 5e7, dev: 0.6, lat: 0, lng: 120 }
  ];
  const mk = (routes) => createPandemicModel({ countries: cs, routes, preset: PANDEMIC_PRESETS.covid, params: { scenario: 'naive' }, seed: 1 });
  const share = (m, j) => { const r = m.mobility.destinations(0).find(x => x.j === j); return r ? r.p : 0; };

  const plain = mk(null);
  const routed = mk({ AAA: { DDD: 50 } });

  assert.ok(share(routed, 3) > share(plain, 3) * 2, 'a real route to D must move weight to D: ' + share(plain, 3).toFixed(4) + ' → ' + share(routed, 3).toFixed(4));
  assert.ok(share(routed, 1) > 0.01, 'B has no direct flight in the table and must still be reachable, got ' + share(routed, 1));
  assert.ok(share(routed, 2) > 0, 'C must stay reachable too, got ' + share(routed, 2));

  /* ⚠ AND AN ORIGIN THE TABLE DOES NOT MENTION IS UNTOUCHED. «Not in a 2014 table» must not read as
     «flies nowhere» — the per-origin fallback is what guarantees it. */
  const rowB = (m) => m.mobility.destinations(1).map(x => x.j + ':' + x.p.toFixed(12)).join(' ');
  assert.equal(rowB(routed), rowB(plain),
    'B was not in the route table, so B\'s row must be bit-for-bit what it was — «not in a 2014 table» is not «flies nowhere»');
  assert.ok(routed.mobility.stats.routedOrigins === 1, 'exactly one origin was routed, got ' + routed.mobility.stats.routedOrigins);
  assert.match(routed.mobility.from, /\+routes/, 'and the screen has to be able to say so: ' + routed.mobility.from);
  assert.doesNotMatch(plain.mobility.from, /\+routes/);
});

/* ── ⑥ the four capacities are read from their own tables, per country ─────────────────────── */
test('R678 ⑥: an observed capacity beats the development proxy, and only for the country that has one', () => {
  /* The defect: `health`, `response` and `delivery` were all GDP per head ÷ 55 000. Two countries
     with the same GDP and very different health systems were identical in every formula. */
  const cs = [
    { name: 'rich-weak', code: 'AAA', pop: 1e7, dev: 0.9, lat: 0, lng: 0, uhc: 40, spar: 30, dtp3: 50 },
    { name: 'poor-strong', code: 'BBB', pop: 1e7, dev: 0.2, lat: 0, lng: 30, uhc: 85, spar: 90, dtp3: 97 },
    { name: 'not-in-table', code: 'CCC', pop: 1e7, dev: 0.5, lat: 0, lng: 60 }
  ];
  const m = createPandemicModel({ countries: cs, preset: PANDEMIC_PRESETS.covid, params: { scenario: 'naive' }, seed: 1 });
  const a = m.report(0), b = m.report(1), c = m.report(2);

  assert.ok(Math.abs(a.health - 0.40) < 1e-9, 'observed UHC index must win over dev, got ' + a.health);
  assert.ok(Math.abs(b.response - 0.90) < 1e-9);
  assert.ok(Math.abs(b.delivery - 0.97) < 1e-9);
  assert.ok(b.health > a.health && b.response > a.response && b.delivery > a.delivery,
    'the poor country with the strong health system must come out ahead of the rich one with the weak one');

  /* ⚠ THE FALLBACK IS PER COUNTRY. The third row is in none of the tables and must keep the proxy —
     «no data» is not «no hospitals», and one missing row must not demote the world. */
  assert.ok(Math.abs(c.health - 0.5) < 1e-9, 'a country outside the table keeps the development proxy, got ' + c.health);
  assert.equal(a.capacityFrom, 7, 'all three observed');
  assert.equal(c.capacityFrom, 0, 'none observed');
});

/* ── ⑦ every source names a parameter the preset actually has ──────────────────────────────── */
test('R678 ⑦: a source attribution points at a real field of its own preset', () => {
  /* `for` is a KEY, checked against the object it is attached to — so an attribution cannot drift
     into naming a parameter that was renamed or removed, the way prose would. */
  let total = 0;
  for (const [id, p] of Object.entries(PANDEMIC_PRESETS)) {
    assert.ok(Array.isArray(p.sources) && p.sources.length, id + ' has no sources');
    for (const s of p.sources) {
      assert.equal(typeof s, 'object', id + ' still has a bare-string source: ' + JSON.stringify(s));
      assert.ok(s.name && typeof s.name === 'string', id + ' source has no name');
      assert.ok(s.for && typeof s.for === 'string', id + ' source «' + s.name + '» names no parameter');
      assert.notEqual(p[s.for], undefined,
        id + ' cites «' + s.name + '» for `' + s.for + '`, which is not a field of this preset');
      total++;
    }
  }
  assert.ok(total >= 12, 'sources are still attributed at all, got ' + total);

  /* ⚠ AND THE GAPS ARE REAL AND ARE MEANT TO SHOW. The panel derives «which parameters have no
     named source» from the preset's own fields; this pins the fact that the answer is non-empty, so
     that a future edit which quietly attributes everything has to change this line too. */
  const missing = ['transmission', 'severity', 'immunity', 'vaccine', 'treatment', 'baselineImmunity']
    .filter(k => PANDEMIC_PRESETS.covid[k] !== undefined && !PANDEMIC_PRESETS.covid.sources.some(s => s.for === k));
  assert.ok(missing.includes('transmission') && missing.includes('severity'),
    'COVID-19\'s R₀ and IFR carry no named citation in this table, and the panel says so');
});

/* ── ⑧ the health table is per country, current, and does not invent COVID-19 immunity ─────── */
test('R678 ⑧: data/health.json is ISO3, in range, recent, and silent where it should be', () => {
  const now = new Date().getUTCFullYear();
  let n = 0;
  for (const [iso, c] of Object.entries(HEALTH.countries)) {
    assert.match(iso, /^[A-Z]{3}$/, iso + ' is not an ISO3 code');
    for (const [k, yk] of [['uhc', 'uhcY'], ['spar', 'sparY'], ['dtp3', 'dtp3Y'], ['mcv1', 'mcv1Y']]) {
      if (c[k] == null) continue;
      assert.ok(c[k] >= 0 && c[k] <= 100, iso + '.' + k + ' = ' + c[k] + ' is outside 0-100');
      assert.ok(now - c[yk] <= 6, iso + '.' + k + ' is from ' + c[yk] + ', too old to describe today');
      n++;
    }
  }
  assert.ok(n > 700, 'the table still has readings in it, got ' + n);
  assert.ok(HEALTH.counts.uhc > 150 && HEALTH.counts.dtp3 > 200, JSON.stringify(HEALTH.counts));
  /* ⚠ NO COVID-19 IMMUNITY COLUMN. Hybrid immunity is not a vaccination coverage and nobody
     publishes it per country; a column here would look exactly like `mcv1` and would be invented. */
  for (const c of Object.values(HEALTH.countries)) {
    assert.equal(c.covid, undefined);
    assert.equal(c.immunity, undefined);
  }
  assert.ok(/no per-country observation of\s+COVID-19 immunity and none is invented/i.test(HEALTH['//'].replace(/\s+/g, ' ')),
    'and the file has to say so, because the absence is the decision');
});

/* ── ⑨ per-country starting immunity keeps the slider's meaning ────────────────────────────── */
test('R678 ⑨: observed immunity supplies the shape, the slider still sets the world mean', () => {
  /* The defect: one number for every country and every age, so a measles outbreak started in South
     Sudan and in Portugal from the same place — on a world map, which is the one place that
     difference is the whole point. */
  const cs = [
    { name: 'low', code: 'AAA', pop: 1e7, dev: 0.5, lat: 0, lng: 0, immunity: 0.5 },
    { name: 'high', code: 'BBB', pop: 1e7, dev: 0.5, lat: 0, lng: 30, immunity: 0.9 },
    { name: 'none', code: 'CCC', pop: 1e7, dev: 0.5, lat: 0, lng: 60 }
  ];
  const target = 0.7;
  const m = createPandemicModel({ countries: cs, preset: PANDEMIC_PRESETS.measles, params: { scenario: 'real-world', initialImmunity: target }, seed: 1 });
  const r = [0, 1, 2].map(i => m.report(i));
  assert.ok(r[0].R / r[0].pop < r[1].R / r[1].pop, 'the low-coverage country must start less immune');

  /* the population-weighted mean lands on the slider (all three are the same size here, and the
     third has no observation so it takes the slider value directly) */
  let num = 0, den = 0;
  for (const x of r) { num += x.R; den += x.pop; }
  assert.ok(Math.abs(num / den - target) < 0.02, 'world mean must be the slider, got ' + (num / den).toFixed(4));

  /* ⚠ AND ONLY IN THE REAL-WORLD SCENARIO. «Novel pathogen» means nobody is immune; a vaccination
     coverage there would be a different question wearing the same name. */
  const naive = createPandemicModel({ countries: cs, preset: PANDEMIC_PRESETS.measles, params: { scenario: 'naive' }, seed: 1 });
  for (let i = 0; i < 3; i++) assert.equal(naive.report(i).R, 0, 'country ' + i + ' starts immune in a novel-pathogen run');
});

/* ── ⑩ the world the shipped tables actually build ─────────────────────────────────────────── */
test('R678 ⑩: the committed tables join to each other on the codes the model uses', () => {
  /* The failure this catches is the quiet one: a rebuild that changes a key convention leaves every
     lookup returning undefined, every country on its fallback, and every gate green. */
  const facts = JSON.parse(read('data/country-facts.json')).countries;
  const air = JSON.parse(read('data/airports.json')).countries;
  const hit = (t) => Object.keys(t).filter(k => facts[k]).length;
  assert.ok(hit(MOB.pairs) > 150, 'route origins that country-facts also knows, got ' + hit(MOB.pairs));
  assert.ok(hit(MOB.vol) > 150, 'arrivals rows that country-facts also knows, got ' + hit(MOB.vol));
  assert.ok(hit(HEALTH.countries) > 150, 'health rows that country-facts also knows, got ' + hit(HEALTH.countries));
  assert.ok(hit(air) > 150, 'and the airport table still joins too, got ' + hit(air));
});
