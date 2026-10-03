/* ============================================================================
 *  atlas-reasoning — THE THREE ANSWERS THAT ARE A STRUCTURE (PRODUCT.md §4 items 8, 9, 10, 12)
 * ----------------------------------------------------------------------------
 *  research.scenario, time.changes and the panel.correlate report are decided in js/atlas-reasoning.js
 *  as pure functions of values, so this file EVALUATES them rather than reading their source:
 *
 *    ① a scenario with an empty field is refused, every empty field named at once; and a model that
 *       cannot represent an assumption or a baseline says so under «not considered» instead of
 *       dropping it — a bare year is never turned into a day
 *    ② the model table cannot drift from the capabilities it describes: its argument vocabulary IS
 *       each entry's schema, and a `sim.*` entry with a method section that is in neither the table
 *       nor the stated-reason ledger below fails (the universe is discovered, not listed here)
 *    ③ the four fields of a scenario are never empty, for every model, run or not
 *    ④ time.changes: the period is validated; a polity diff separates appeared / ended / reshaped by
 *       region; a statistic stated at one end only is never read as growth from zero; events are
 *       ordered by a printed count and an undated record stays undated
 *    ⑤ the correlation report: n against the universe, the missing counts, the intervals, the
 *       outliers — and the WORDS are decided by the sample (three countries cannot be «very strong»)
 *    ⑥ the three are reachable: the registry rows exist, and the panel draws the same report Atlas gets
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const R = await import('../js/atlas-reasoning.js');
const SIM = (await import('../js/atlas-cap-sim.js')).default;
const RESEARCH = (await import('../js/atlas-cap-research.js')).default;
const TIME = (await import('../js/atlas-cap-time.js')).default;
const PANEL = (await import('../js/atlas-cap-panel.js')).default;
const MODELS = R.scenarioModels(SIM);

const entry = (list, id) => list.find((e) => e.row[0] === id);
const scenarioFrame_ = (a, r) => R.scenarioFrame(a, r, MODELS);
const scenarioCall_ = (f) => R.scenarioCall(f, MODELS);
const scenarioReport_ = (f, c, run, ex) => R.scenarioReport(f, c, run, ex, MODELS);
const scenarioModelId_ = (n, r) => R.scenarioModelId(n, r, MODELS);
const isTwoLanguage = (t) => Array.isArray(t) && t.length === 2 && typeof t[0] === 'string' && t[0].length > 3 && typeof t[1] === 'string' && t[1].length > 1;   /* a sentence is the array [en, jp] */

/* the sim entries that state a method section and are NOT yet scenario models. MEASURED 2026-10-03: these were not given a
   data / not-considered / uncertainty statement this round. Delete a line by declaring a `scenario` on the entry. */
const NOT_YET = {
  'sim.lineOfSight': 'a viewshed from a point — not yet given its four statements',
  'sim.flightSim': 'a flight simulator (a camera), not a what-if over the world',
  'sim.rfCoverage': 'radio coverage — not yet given its four statements',
  'sim.sunPosition': 'the sun\'s position is an ephemeris, not an assumption-driven outcome',
  'sim.terrainWater': 'terrain editing and water flow — not yet given its four statements',
  'sim.earthquake': 'seismic waves — not yet given its four statements',
  'sim.sunHours': 'terrain shade hours — an ephemeris over terrain, not an assumption-driven outcome',
  'sim.nightSky': 'the sky from a place — an ephemeris',
  'sim.space': 'the solar system — an ephemeris',
  'sim.ballistic': 'ballistic trajectory — not yet given its four statements',
  'sim.flyAnimate': 'a camera path',
};

/* ═══ ① the frame ═══ */
test('① a scenario with empty fields is refused, every empty field named at once', () => {
  const f = scenarioFrame_({}, () => null);
  assert.equal(f.ok, false);
  assert.deepEqual(f.missing.slice().sort(), ['assumptions', 'baseline', 'model', 'subject']);
  const g = scenarioFrame_({ model: 'ashPlume', place: 'Aira', baseline: 'now', assumptions: [{ name: 'hKm', value: '' }] }, () => null);
  assert.equal(g.ok, false, 'an assumption with no value is not an assumption');
  assert.deepEqual(g.missing, ['assumptions']);
  const h = scenarioFrame_({ model: 'ashPlume', place: 'Aira', baseline: 2024, assumptions: [{ name: 'hKm', value: 12 }] }, () => null);
  assert.equal(h.ok, true);
  assert.equal(h.baseline, '2024', 'a numeric baseline is kept as the year it is');
});

test('① the model is found by id, dispatch spelling or a registry alias — and nothing else is a model', () => {
  const alias = (s) => (s === 'volcanicAsh' ? { id: 'sim.ashPlume' } : null);
  assert.equal(scenarioModelId_('sim.ashPlume', alias), 'sim.ashPlume');
  assert.equal(scenarioModelId_('ashPlume', alias), 'sim.ashPlume');
  assert.equal(scenarioModelId_('volcanicAsh', alias), 'sim.ashPlume');
  assert.equal(scenarioModelId_('flightSim', () => ({ id: 'sim.flightSim' })), null);
  assert.equal(scenarioModelId_('', alias), null);
});

test('① an assumption the model has no input for, and a baseline it cannot take, are reported not dropped; a bare year is not a day', () => {
  const frame = (model, over) => scenarioFrame_(Object.assign({ model, place: 'X', baseline: '2011-03-11T05:46', assumptions: [{ name: 'depth', value: 20 }, { name: 'wind_turbine_count', value: 3 }] }, over), () => null);
  const tsu = scenarioCall_(frame('tsunami'));
  assert.equal(tsu.args.depth, 20);
  assert.ok(!('wind_turbine_count' in tsu.args), 'an argument the model does not have is not passed');
  assert.equal(tsu.assumptions.find((x) => x.name === 'wind_turbine_count').applied, false);
  assert.equal(tsu.baseline.applied, false, 'the tsunami model takes no instant');
  const ash = scenarioCall_(frame('ashPlume', { assumptions: [{ name: 'hKm', value: 15 }] }));
  assert.equal(ash.args.start, '2011-03-11T05:46');
  assert.equal(ash.baseline.applied, true);
  const year = scenarioCall_(frame('ashPlume', { baseline: '1991', assumptions: [{ name: 'hKm', value: 15 }] }));
  assert.ok(!('start' in year.args), 'IntMap does not choose the day for a bare year');
  assert.equal(year.baseline.applied, false);
  const clash = scenarioCall_(frame('ashPlume', { assumptions: [{ name: 'start', value: '2000-01-01' }] }));
  assert.equal(clash.args.start, '2011-03-11T05:46', 'the baseline wins over an assumption of the same argument');
  assert.equal(clash.assumptions[0].applied, false);
});

/* ═══ ② the models ARE the entries ═══ */
test('② the models are discovered from the entries that declare a `scenario`; their vocabulary is the schema', () => {
  const declared = SIM.filter((e) => e.scenario).map((e) => e.row[0]).sort();
  assert.deepEqual(Object.keys(MODELS).sort(), declared, 'no list but the entries');
  assert.ok(declared.length >= 4);
  for (const id of declared) {
    const M = MODELS[id], e = entry(SIM, id);
    assert.equal(M.dispatch, e.row[1], id + ': dispatch spelling is the row spelling');
    assert.equal(M.science, e.science, id + ': science section is the entry science');
    assert.deepEqual(M.args.slice().sort(), Object.keys(e.schema().properties).sort(), id + ': args are the schema properties');
    assert.ok(M.args.includes(M.subject), id + ': the subject argument is one of its arguments');
    if (M.baselineParam) assert.ok(M.args.includes(M.baselineParam), id + ': the baseline argument is one of its arguments');
    for (const k of ['data', 'excluded', 'uncertainty']) { assert.ok(M[k].length > 0, id + ' ' + k); M[k].forEach((t) => assert.ok(isTwoLanguage(t), id + ' ' + k + ' is en + jp')); }
  }
});

test('② a malformed `scenario` is refused by name when the entries are validated', async () => {
  const { capabilityEntries } = await import('../js/atlas-caps.js');
  const base = SIM.find((e) => e.scenario);
  const bad = (scenario) => () => capabilityEntries({ sim: [Object.assign({}, base, { scenario })] });
  assert.doesNotThrow(bad(base.scenario));
  assert.throws(bad(Object.assign({}, base.scenario, { subject: 'not_an_argument' })), /scenario\.subject/);
  assert.throws(bad(Object.assign({}, base.scenario, { data: [] })), /scenario\.data/);
  assert.throws(bad(Object.assign({}, base.scenario, { uncertainty: [['only english']] })), /scenario\.uncertainty/);
});

test('② every sim entry with a method section is a model or has a stated reason (universe discovered from the entries)', () => {
  const sims = SIM.filter((e) => e.science).map((e) => e.row[0]);
  assert.ok(sims.length >= 10, 'the universe was discovered');
  const lost = sims.filter((id) => !MODELS[id] && !NOT_YET[id]);
  assert.deepEqual(lost, [], 'a sim with neither a model entry nor a stated reason');
  Object.keys(NOT_YET).forEach((id) => assert.ok(sims.includes(id) && !MODELS[id], id + ' is on the ledger but is gone or became a model — delete the line'));
});

/* ═══ ③ the four fields ═══ */
test('③ the four fields are never empty — for every model, ran or not', () => {
  for (const id of Object.keys(MODELS)) {
    const frame = scenarioFrame_({ model: id, place: 'X', baseline: 'now', assumptions: [{ name: 'zzz', value: 1 }] }, () => null);
    const call = scenarioCall_(frame);
    for (const run of [null, { ok: true, meta: {} }]) {
      const rep = scenarioReport_(frame, call, run, null);
      assert.equal(rep.complete, true, id);
      assert.ok(rep.assumptions.length && rep.dataUsed.length && rep.excluded.length && rep.uncertainty.length, id);
      assert.ok(rep.excluded.some((t) => t[0].includes('zzz')), id + ': the unrepresented assumption is under «not considered»');
    }
  }
});

test('③ the pandemic says whether it is one draw; a failed exposure analysis is named, not hidden', () => {
  const mk = (runs) => { const f = scenarioFrame_({ model: 'pandemicRun', place: 'Lagos', baseline: 'now', assumptions: [{ name: 'days', value: 60 }].concat(runs ? [{ name: 'runs', value: runs }] : []) }, () => null); return scenarioReport_(f, scenarioCall_(f), { ok: true, meta: {} }, null); };
  assert.ok(mk(0).uncertainty.some((t) => /single draw/.test(t[0])));
  assert.ok(mk(25).uncertainty.some((t) => /25 runs/.test(t[0])));
  const f = scenarioFrame_({ model: 'ashPlume', name: 'x', place: 'Aira', baseline: 'now', assumptions: [{ name: 'hKm', value: 9 }] }, () => null);
  const rep = scenarioReport_(f, scenarioCall_(f), { ok: true, meta: { ash: { peakDepositRelSE: 0.3 } } }, { asked: true, ok: false, why: 'Overpass busy' });
  assert.ok(rep.excluded.some((t) => /exposure analysis/.test(t[0]) && /Overpass busy/.test(t[0])));
  assert.ok(rep.uncertainty.some((t) => /±30%/.test(t[0])));
});

test('③ research.scenario run: refuses an empty scenario with every field, before calling any model', async () => {
  const e = entry(RESEARCH, 'research.scenario');
  let dispatched = 0;
  const K = { R: (ok, html, x) => Object.assign({ ok, html }, x), warn: (s) => s, L: (en) => en, note: (s) => s, esc: (s) => String(s), CAPS: { ofSpelling: () => null }, dispatch: async () => { dispatched++; return { ok: true, html: '' }; } };
  const res = await e.run({ model: 'ashPlume' }, {}, K);
  assert.equal(res.ok, false);
  assert.equal(res.meta.code, 'scenario-incomplete');
  assert.deepEqual(res.meta.missing.slice().sort(), ['assumptions', 'baseline', 'subject']);
  assert.equal(dispatched, 0);
  assert.ok(res.meta.models.includes('sim.ashPlume'), 'the refusal carries the vocabulary');
});

test('③ research.scenario run: one call to the model, the four fields in the answer, the model\'s meta kept', async () => {
  const e = entry(RESEARCH, 'research.scenario');
  const calls = [];
  const K = { R: (ok, html, x) => Object.assign({ ok, html }, x), warn: (s) => s, L: (en) => en, note: (s) => s, esc: (s) => String(s), CAPS: { ofSpelling: () => null },
    dispatch: async (a) => { calls.push(a); return a.type === 'impact' ? { ok: false, html: 'busy' } : { ok: true, html: '<div>RESULT</div>', meta: { ash: { lat: 31.6, lng: 130.6, peakDepositRelSE: 0.2 } } }; } };
  const res = await e.run({ model: 'sim.ashPlume', place: 'Aira', baseline: '2026-10-01T00:00Z', assumptions: [{ name: 'hKm', value: 12 }, { name: 'mood', value: 'bad' }], impact: { km: 100 } }, {}, K);
  assert.equal(res.ok, true);
  assert.equal(calls.length, 2, 'the model once, the exposure once — no repeat');
  assert.equal(calls[0].type, 'ashPlume');
  assert.equal(calls[0].hKm, 12);
  assert.equal(calls[0].start, '2026-10-01T00:00Z');
  assert.equal(calls[1].type, 'impact');
  assert.equal(calls[1].lat, 31.6, 'the exposure is around the vent the model resolved');
  for (const h of ['Assumptions', 'Data used', 'Not considered', 'Uncertainty']) assert.ok(res.html.includes(h), h);
  assert.ok(res.html.includes('RESULT'));
  assert.ok(res.html.includes('mood'));
  assert.equal(res.meta.scenario.complete, true);
  assert.equal(res.meta.ash.lat, 31.6);
});

/* ═══ ④ time.changes ═══ */
test('④ the period: both ends, ordered, inside the clock; a bare year stays a year', () => {
  const now = Date.UTC(2026, 9, 3);
  assert.equal(R.changesPeriod({ from: 1900 }, -4000, now).code, 'needs-period');
  assert.equal(R.changesPeriod({ from: 1930, to: 1910 }, -4000, now).code, 'empty-period');
  assert.equal(R.changesPeriod({ from: 1930, to: 2090 }, -4000, now).code, 'in-future');
  assert.equal(R.changesPeriod({ from: -9000, to: 1910 }, -4000, now).code, 'before-clock');
  const p = R.changesPeriod({ from: '1910', to: '1930-06-01' }, -4000, now);
  assert.equal(p.ok, true);
  assert.equal(p.t0.iso, null, 'a bare year has no day');
  assert.equal(p.t1.iso, '1930-06-01');
  assert.equal(R.changesPeriod({ t0: '1990-01-01', t1: '1990-01-01' }, -4000, now).code, 'empty-period');
});

test('④ the polity diff: appeared / ended / reshaped, inside the region only', () => {
  const row = (en, km2, bbox) => ({ en, name: en, km2, bbox });
  const A = [row('Austria-Hungary', 600000, [9, 42, 27, 51]), row('Serbia', 48000, [18, 41, 23, 46]), row('Japan', 380000, [122, 24, 146, 46]), row('France', 540000, [-5, 41, 9, 51])];
  const B = [row('Austria', 83000, [9, 46, 17, 49]), row('Yugoslavia', 250000, [13, 40, 23, 47]), row('Japan', 450000, [122, 24, 146, 46]), row('France', 540000, [-5, 41, 9, 51])];
  const all = R.diffPolities(A, B, null);
  assert.deepEqual(all.appeared.map((p) => p.en).sort(), ['Austria', 'Yugoslavia']);
  assert.deepEqual(all.gone.map((p) => p.en).sort(), ['Austria-Hungary', 'Serbia']);
  assert.deepEqual(all.reshaped.map((p) => p.en), ['Japan'], 'France is the same area at both ends');
  const balkans = R.diffPolities(A, B, [13, 41, 24, 47]);
  assert.ok(!balkans.reshaped.some((p) => p.en === 'Japan'), 'Japan is outside the region');
  assert.ok(balkans.gone.some((p) => p.en === 'Serbia'));
});

test('④ a statistic stated at one end only is counted, never read as growth from zero', () => {
  const a = [{ code: 'AAA', name: 'A', pop: 10, gdppc: 100 }, { code: 'BBB', name: 'B', pop: 20, gdppc: null }];
  const b = [{ code: 'AAA', name: 'A', pop: 15, gdppc: 90 }, { code: 'BBB', name: 'B', pop: 40, gdppc: 500 }, { code: 'CCC', name: 'C', pop: 7, gdppc: 7 }];
  const d = R.diffEconomy(a, b);
  assert.deepEqual(d.population.map((r) => [r.code, Math.round(r.rel * 100)]), [['BBB', 100], ['AAA', 50]]);
  assert.deepEqual(d.gdppc.map((r) => r.code), ['AAA']);
  assert.equal(d.onlyOne, 2, 'B\'s gdp (one end) and C (one end) are counted aside');
});

test('④ events are ordered by a printed count; an undated record stays undated; 1 January is flagged', () => {
  const items = R.rankChanges(
    [{ date: '1991-06-25', appeared: ['Slovenia', 'Croatia'], ended: ['Yugoslavia'], reshaped: [] }, { date: '1992-01-01', appeared: ['X'], ended: [], reshaped: ['Y', 'Z'] }, { date: '1990-05-05', appeared: [], ended: [], reshaped: [] }],
    [{ name: 'Yugoslav Wars', from: '1991-06-25', to: '2001-08-13', events: [{ date: '1991-06-27', name: 'a' }, { date: '1992-04-06', name: 'b' }] }, { name: 'Undated war', from: null, to: null, events: [{ date: '1991-02-02', name: 'c' }, { date: '1991-02-03', name: 'd' }, { date: '1991-02-04', name: 'e' }] }]);
  assert.equal(items.length, 4, 'a day on which nothing changed is not an event');
  assert.deepEqual(items.map((i) => i.score), [3, 3, 2, 2]);
  const war = items.find((i) => i.name === 'Undated war');
  assert.equal(war.date, null, 'no date is substituted');
  assert.ok(items.indexOf(items.find((i) => i.name === 'Yugoslav Wars')) < items.indexOf(war) || war.score >= 3);
  assert.equal(items.find((i) => i.date === '1992-01-01').maybeYearOnly, true);
  assert.equal(items.find((i) => i.date === '1991-06-25').maybeYearOnly, false);
  items.forEach((i) => assert.ok(isTwoLanguage(i.basis), 'the count says what it counted, en + jp'));
});

test('④ the layers a source states at one end and not the other', () => {
  const cov = (...n) => ({ stated: n.map((name) => ({ name })) });
  assert.deepEqual(R.diffLayers(cov('a', 'b'), cov('b', 'c')), { gained: ['c'], lost: ['a'], both: 1 });
});

test('④ time.changes is registered, bilingual in its answer, and never moves the clock or draws', () => {
  const e = entry(TIME, 'time.changes');
  assert.ok(e && e.row[7] === 'session' && e.row[5] === '');
  const src = read('js/atlas-cap-time.js');
  const body = src.slice(src.indexOf('async function changes('), src.indexOf('const isoOf'));
  assert.ok(!/T\.set\(|setNow\(|setDaysAgo\(/.test(body), 'reading a period does not move the clock');
  assert.ok(/Date\.now\(\) - w1\.getTime\(\) < 168/.test(body), 'the live news is asked only where the feed reaches');
});

/* ═══ ⑤ the correlation report ═══ */
const rowsOf = (pairs) => pairs.map((p, i) => ({ id: 'C' + i, name: 'C' + i, x: p[0], y: p[1] }));
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('⑤ three countries cannot be «very strong»: n < 4 asserts nothing', () => {
  const rep = R.correlationReport(rowsOf([[1, 1], [2, 2], [3, 3]]), { universe: 190, xLabel: 'GDP', yLabel: 'life' });
  assert.equal(rep.n, 3);
  assert.equal(rep.assertion, 'none');
  assert.ok(/Nothing confirmed/.test(rep.confirmed[0][0]));
  assert.ok(!/strong|weak|moderate|positive|negative/.test(rep.confirmed.map((t) => t[0]).join(' ')));
  assert.equal(rep.explanations.length, 0, 'no explanation is offered for a relationship not found');
  assert.equal(rep.missing.universe, 190);
});

test('⑤ a small noisy sample whose interval reaches 0 asserts nothing, however large its r looks', () => {
  const rep = R.correlationReport(rowsOf([[1, 2], [2, 1], [3, 5], [4, 3], [5, 6], [6, 4]]), {});
  assert.ok(rep.pearson > 0.5, 'r looks big (' + rep.pearson.toFixed(2) + ')');
  assert.ok(rep.ci.pearson[0] < 0, 'but its interval reaches below 0');
  assert.equal(rep.assertion, 'none');
});

test('⑤ a large clean sample is stated; a mid one is tentative; direction and band follow r', () => {
  const rnd = lcg(7);
  const big = rowsOf(Array.from({ length: 150 }, () => { const x = rnd() * 10; return [x, 2 * x + (rnd() - 0.5) * 4]; }));
  const rep = R.correlationReport(big, { xLabel: 'x', yLabel: 'y' });
  assert.equal(rep.assertion, 'stated');
  assert.equal(rep.direction, 1);
  assert.ok(rep.band >= 3, 'a tight positive line is strong');
  assert.ok(rep.explanations.length >= 3 && rep.explanations.every((t) => /Candidate|clearly/.test(t[0])));
  assert.ok(/positive relationship/.test(rep.confirmed[0][0]));
  const rnd2 = lcg(11);
  const mid = rowsOf(Array.from({ length: 14 }, () => { const x = rnd2() * 10; return [x, -x + (rnd2() - 0.5) * 6]; }));
  const m = R.correlationReport(mid, {});
  assert.notEqual(m.assertion, 'stated', 'n = 14 cannot pin the band down');
  if (m.assertion === 'tentative') assert.ok(/suggest/.test(m.confirmed[0][0]));
});

test('⑤ a perfect line has a degenerate interval, not a missing one', () => {
  const rep = R.correlationReport(rowsOf(Array.from({ length: 30 }, (_, i) => [i, 3 * i + 1])), {});
  assert.deepEqual(rep.ci.pearson, [1, 1]);
  assert.equal(rep.assertion, 'stated');
});

test('⑤ missing values are counted against the universe; log-excluded ones are named', () => {
  const rows = rowsOf(Array.from({ length: 20 }, (_, i) => [i, i * 2 + (i % 3)]));
  rows.push({ id: 'M1', name: 'M1', x: null, y: 5 }, { id: 'M2', name: 'M2', x: 3, y: null }, { id: 'M3', name: 'M3', x: null, y: null });
  const rep = R.correlationReport(rows, { universe: 25, nonPositiveLog: 2, xLabel: 'a', yLabel: 'b' });
  assert.deepEqual([rep.n, rep.missing.x, rep.missing.y, rep.missing.either, rep.missing.universe, rep.missing.nonPositiveLog], [20, 2, 2, 3, 25, 2]);
  const limits = rep.limits.map((t) => t[0]).join(' ');
  assert.ok(/20 of 25/.test(limits) && /a for 2, b for 2 \(either: 3\)/.test(limits) && /of which 2 are zero or negative/.test(limits));
});

test('⑤ outliers are listed, and r without them is reported against r with them', () => {
  const rnd = lcg(3);
  const pts = Array.from({ length: 60 }, () => { const x = rnd() * 10; return [x, x + (rnd() - 0.5)]; });
  pts.push([5, 40]);
  const rep = R.correlationReport(rowsOf(pts), {});
  assert.ok(rep.outliers.length >= 1 && rep.outliers[0].id === 'C60');
  assert.ok(rep.withoutOutliers && rep.withoutOutliers.pearson > rep.pearson, 'the one wild point was dragging r down');
  assert.ok(rep.counter.some((t) => /Without them/.test(t[0])));
  const clean = R.correlationReport(rowsOf(Array.from({ length: 40 }, (_, i) => [i, i + ((i * 7) % 5) / 10])), {});
  assert.equal(clean.outliers.length, 0);
  assert.ok(/No case sits/.test(clean.counter[0][0]));
});

test('⑤ every sentence of the report is en + jp', () => {
  const rnd = lcg(5);
  const rep = R.correlationReport(rowsOf(Array.from({ length: 40 }, () => { const x = rnd(); return [x, x + rnd() * 0.3]; })), { universe: 50, xLabel: 'x', yLabel: 'y' });
  for (const k of ['confirmed', 'explanations', 'counter', 'limits']) { assert.ok(rep[k].length, k); rep[k].forEach((t) => assert.ok(isTwoLanguage(t), k)); }
});

/* ═══ ⑥ reachable ═══ */
test('⑥ the three are reachable: rows, a doc fragment that names its subject, and the panel draws the report Atlas gets', () => {
  for (const [list, id] of [[RESEARCH, 'research.scenario'], [TIME, 'time.changes'], [PANEL, 'panel.correlate']]) {
    const e = entry(list, id);
    assert.ok(e, id);
    assert.ok(e.doc && e.doc.some((d) => typeof d.text === 'string' && /[぀-ヿ㐀-鿿]/.test(d.text) && /[a-z]{4}/.test(d.text)), id + ' is documented in en and jp');
    assert.equal(typeof e.schema(), 'object');
  }
  assert.ok(entry(PANEL, 'panel.correlate').row[6].includes('explanation'), 'the row says it now answers');
  const panel = read('js/analysis-correlate.js');
  assert.ok(/import \{ correlationReport \} from '\.\/atlas-reasoning\.js'/.test(panel), 'the panel reads the one report');
  assert.ok(/paintReport\(rep\)/.test(panel) && /rep\.assertion==='none'/.test(panel), 'its sentence is gated by the sample');
  const cap = read('js/atlas-cap-panel.js');
  assert.ok(/C\.open\(asked\)/.test(cap) && /res\.report/.test(cap), 'Atlas takes the panel\'s own report');
  assert.ok(/open\(o\)\{ return _impl\(\)/.test(read('js/analysis-panels.js')), 'the facade hands the report back');
});
