/* ============================================================================
 *  IntMap · radiation-hindcast — the plume model against what was measured at Fukushima (2011)
 * ----------------------------------------------------------------------------
 *  The model is only worth as much as its answer-check. This gate re-runs it on the 2011 wind, with the
 *  preset's own release conditions, compares the result cell by cell with the government aerial survey
 *  (data/radiation-hindcast.json), and goes RED if the model got WORSE than the value recorded in that
 *  bundle. It also goes red if the map readers are shown is no longer what the model produces.
 *
 *  ⚠ THE RECORDED NUMBERS ARE NOT GOOD, AND THAT IS WHAT IS RECORDED. The model's preset releases at a
 *  constant rate for 120 h; the accident did not. The gate guards against getting worse, and says so
 *  when the model gets better (re-run `node scripts/build-radiation-hindcast.mjs --offline` and the
 *  documents' numbers, which this file also reads, move with it).
 *  ⚠ NO TOLERANCE IS A VERDICT. The slack below (0.01 on every measure, 0.02 dex on the map) is room for a
 *  different JavaScript engine's Math.exp / Math.log in a seeded run, not a margin for decline: the seeds
 *  are fixed, so on one engine the same code gives the same numbers every time.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAD, H, C, FLOOR_BQ_M2, ratioBand, loadFixture, loadBundle, buildField, ensembleOnCells, areaKm2, decayToObs } from '../scripts/radiation-hindcast-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const B = loadBundle();
const obsCells = B.obs.cells, obsBq = obsCells.map((o) => o[2]);
const ar = areaKm2(obsCells, C.obsRes);

/* the one expensive step, shared by the tests that need it */
let _rerun = null;
function rerun() {
  if (_rerun) return _rerun;
  const F = buildField(loadFixture());
  const E = ensembleOnCells(F, obsCells, C.obsRes, C.seeds);
  const m = H.compare(obsBq, E, ar, C.fmsBq);
  const modelTBq = E.p50.reduce((a, v, i) => a + v * ar[i] * 1e6, 0) / 1e12;
  m.massRatioP50 = modelTBq / B.survey.totalTBq;
  return (_rerun = { E, m });
}

test('the measured side is a whole, governed record, not a number that was typed', () => {
  assert.equal(B.licence, 'CC-BY-4.0', 'redistributable only because the licence says so — CC BY 4.0, stated as a value');
  assert.match(B.licenceUrl, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(B.url, /^https:\/\/doi\.org\/10\.5281\/zenodo\.7016491$/, 'the upstream is a DOI, not a mirror');
  assert.match(B.survey.md5, /^[0-9a-f]{32}$/, 'the md5 of the file that was fetched is kept');
  assert.equal(B.survey.cells, obsCells.length, 'the stated cell count is the shipped one');
  assert.equal(B.survey.measurements, obsCells.reduce((a, o) => a + o[3], 0), 'and the stated number of aerial measurements');
  assert.equal(B.survey.minBqM2, Math.min(...obsBq));
  assert.equal(B.survey.maxBqM2, Math.max(...obsBq));
  const tot = obsCells.reduce((a, o, i) => a + o[2] * ar[i] * 1e6, 0) / 1e12;
  assert.ok(Math.abs(tot - B.survey.totalTBq) < 0.1, `the stated total (${B.survey.totalTBq} TBq) is the sum over the cells (${tot.toFixed(1)})`);
  assert.equal(B.asOf, C.obsAsOf, 'the date the deposit is stated for is the date the model is decayed to');
  assert.ok(B.asOfNote && /does not state/.test(B.asOfNote), 'a date that was INFERRED says so');
  assert.ok(FLOOR_BQ_M2 <= B.survey.minBqM2 * 2.5, 'the log floor is of the survey\'s own order, not a number that hides the low cells');
  for (const [lng, lat, bq] of obsCells) { assert.ok(bq > 0 && lng > 137 && lng < 143 && lat > 34 && lat < 41, 'every cell is a positive deposit near Fukushima'); }
});

test('the model side was run under the simulator\'s own preset, on the wind that blew', () => {
  const st = RAD.sourceTerm(C.source_term, C.isotope);
  assert.equal(B.conditions.releaseBqCentral, st.bq, 'the release is the preset\'s, not tuned');
  assert.deepEqual(B.conditions.releaseBqRange, [st.lo, st.hi], 'and the range is UNSCEAR\'s');
  assert.equal(B.conditions.emitHours, st.emitHours);
  assert.equal(B.conditions.releaseHeightM, st.rise);
  assert.deepEqual(B.conditions.source, { lng: RAD.SOURCE_TERMS.fukushima.ll[0], lat: RAD.SOURCE_TERMS.fukushima.ll[1] }, 'at the plant, where the preset puts it');
  const fx = loadFixture();
  assert.deepEqual(fx.levels, [10, 100], 'ERA5 serves 10 and 100 m — the levels the live archive path uses');
  const t = fx.inner[0].hourly.time;
  assert.ok(t[0].startsWith(C.startDate) && t.length >= C.hours + 2, 'the fixture covers the window from the shutdown hour');
  assert.ok(fx.inner.length === 49 && fx.outer.length >= 81, 'both nests are whole');
  const sp = fx.inner[24].hourly.wind_speed_10m;
  assert.ok(sp.every((x) => x != null && isFinite(x)), 'no hour of the 2011 wind is a null standing in for a calm');
  assert.equal(B.model.cells.length, obsCells.length, 'one model triple per measured cell');
  for (const [a, b, c] of B.model.cells) assert.ok(a <= b && b <= c, 'p10 <= p50 <= p90');
  assert.ok(decayToObs() < 1 && decayToObs() > 0.95, 'the model is decayed from the window\'s end to the survey date, by Cs-137\'s own half-life');
});

test('the comparison arithmetic: a perfect model scores perfectly, a tenfold error scores as one', () => {
  const o = [1e4, 1e5, 1e6, 3e4, 2e5];
  const perfect = { p10: o.map((x) => x * 0.8), p50: o, p90: o.map((x) => x * 1.2) };
  const a = [1, 1, 1, 1, 1];
  const m = H.compare(o, perfect, a, [1e5]);
  assert.ok(Math.abs(m.pearsonLog - 1) < 1e-12 && Math.abs(m.spearman - 1) < 1e-12 && m.biasLog10 === 0 && m.fac2 === 1 && m.bandCoverage === 1 && m.fms[1e5] === 1);
  const tenx = { p10: o.map((x) => x * 8), p50: o.map((x) => x * 10), p90: o.map((x) => x * 12) };
  const t = H.compare(o, tenx, a, []);
  assert.ok(Math.abs(t.biasLog10 - 1) < 1e-12, 'ten times too high is +1 in log10');
  assert.equal(t.fac2, 0); assert.equal(t.fac5, 0); assert.equal(t.bandCoverage, 0);
  assert.ok(Math.abs(t.pearsonLog - 1) < 1e-12, 'a pure scale error keeps the correlation — which is why bias is reported beside it');
  const zero = H.compare(o, { p10: o.map(() => 0), p50: o.map(() => 0), p90: o.map(() => 0) }, a, []);
  assert.equal(zero.modelBelowFloor, 1, 'a model that put nothing there is counted as nothing, not as a near miss');
});

test('regridding spreads MASS over the observation cell\'s own area', () => {
  /* one model cell of 1e9 Bq at the centre of an observation cell of 0.05 deg */
  const dr = 0.01, ix = 14048, iy = 3787;
  const res = { depRes: dr, keys: [ix * 100000 + iy], bq: [1e9] };
  const g = H.regrid(res, [[ix * dr, iy * dr, 1, 1]], 0.05);
  const area = 0.05 * 111320 * Math.cos(iy * dr * Math.PI / 180) * 0.05 * 111320;
  assert.ok(Math.abs(g[0] - 1e9 / area) / (1e9 / area) < 1e-12, 'density = mass / the observation cell\'s area');
  const edge = H.regrid({ depRes: dr, keys: [(ix + 3) * 100000 + iy], bq: [1e9] }, [[ix * dr, iy * dr, 1, 1]], 0.05);
  assert.equal(edge[0], 0, 'a model cell outside the observation cell contributes nothing');
});

test('THE GATE: the model is not worse than the recorded answer-check', () => {
  const { m } = rerun(), R = B.metrics, slack = 0.01;
  const need = (name, got, rec, higherIsBetter) => {
    const ok = higherIsBetter ? got >= rec - slack : got <= rec + slack;
    assert.ok(ok, `${name} got worse: ${got.toFixed(4)} against a recorded ${rec} — the plume model now disagrees with the 2011 survey MORE than it did`);
  };
  need('Pearson r (log10)', m.pearsonLog, R.pearsonLog, true);
  need('Spearman rank correlation', m.spearman, R.spearman, true);
  need('|bias| (log10 of model/measured)', Math.abs(m.biasLog10), Math.abs(R.biasLog10), false);
  need('mean |log10 error|', m.meanAbsLog10, R.meanAbsLog10, false);
  need('FAC2', m.fac2, R.fac2, true);
  need('FAC5', m.fac5, R.fac5, true);
  need('share of cells inside the p10-p90 band', m.bandCoverage, R.bandCoverage, true);
  need('share of cells the model left empty', m.modelBelowFloor, R.modelBelowFloor, false);
  for (const T of C.fmsBq) need('figure of merit in space at ' + T + ' Bq/m2', m.fms[T], R.fms[T], true);
  need('mass in the surveyed cells, as a fraction of the measured (|log10|)', Math.abs(Math.log10(m.massRatioP50)), Math.abs(Math.log10(R.massRatioP50)), false);
});

test('the map readers are shown is what the model produces now', () => {
  const { E } = rerun();
  let worst = 0;
  for (let i = 0; i < obsCells.length; i++) {
    const s = B.model.cells[i][1], r = E.p50[i];
    if (s < FLOOR_BQ_M2 && r < FLOOR_BQ_M2) continue;
    worst = Math.max(worst, Math.abs(Math.log10(Math.max(s, 1)) - Math.log10(Math.max(r, 1))));
  }
  assert.ok(worst < 0.02, `the shipped p50 differs from a re-run by up to ${worst.toFixed(3)} dex — rebuild it: node scripts/build-radiation-hindcast.mjs --offline`);
  const { m } = rerun();
  for (const k of ['pearsonLog', 'spearman', 'biasLog10', 'fac2', 'bandCoverage']) {
    assert.ok(Math.abs(m[k] - B.metrics[k]) < 0.01, `${k}: recorded ${B.metrics[k]}, now ${m[k].toFixed(4)} — a change in either direction means the record is stale`);
  }
});

test('the documents state the numbers the bundle records', () => {
  const R = B.metrics, f2 = (x) => x.toFixed(2);
  const docs = read('docs/RADIATION-MODEL.md');
  const sec = docs.slice(docs.indexOf('## 10.'));
  assert.ok(sec.length > 500, 'RADIATION-MODEL.md has a section 10 for the hindcast');
  for (const s of [`r = ${f2(R.pearsonLog)}`, `FAC2 = ${(R.fac2 * 100).toFixed(1)} %`, `FAC5 = ${(R.fac5 * 100).toFixed(1)} %`,
    `${(R.bandCoverage * 100).toFixed(1)} %`, B.asOf, B.survey.md5, 'CC BY 4.0', '10.5281/zenodo.7016491']) {
    assert.ok(sec.includes(s), `docs/RADIATION-MODEL.md §10 must state «${s}»`);
  }
  /* science.html is a shell; its radioactive-plume section lives in the page-locale tables (en and jp are the languages IntMap writes) */
  for (const [f, date] of [['js/locales/pages.en.js', '28 June 2012'], ['js/locales/pages.ja.js', '2012 年 6 月 28 日']]) {
    const t = read(f), i = t.indexOf("id: 'radiation'"), sec2 = t.slice(i, t.indexOf("id: '", i + 20));
    assert.ok(sec2.includes(`r = ${f2(R.pearsonLog)}`), f + ': the radioactive-plume section states the recorded correlation');
    assert.ok(sec2.includes(`${(R.bandCoverage * 100).toFixed(1)} %`) && sec2.includes(`${(R.fac2 * 100).toFixed(1)} %`), f + ': ...and the band coverage and FAC2');
    assert.ok(sec2.includes(date), f + ': ...and the date the survey is stated for');
  }
  /* the survey is credited where credits live, under the name the bundle says pays for it */
  assert.ok(read('js/reference-data.js').includes("n:'" + B.paidBy + "'"), 'the DATA_SOURCES row the bundle names in paidBy exists');
  for (const f of ['js/locales/pages.en.js', 'js/locales/pages.ja.js']) assert.ok(read(f).includes('"' + B.paidBy + '"'), f + ' describes that source');
});

test('the three maps the panel draws are the same cells, on the ladder the simulator already uses', () => {
  const bands = RAD.PLAIN_ZONES.bands;
  const obsF = H.cellFeatures(B, 'obs', bands), modF = H.cellFeatures(B, 'model', bands), ratF = H.cellFeatures(B, 'ratio', bands);
  assert.equal(ratF.length, obsCells.length, 'the ratio map draws every cell — an empty model cell over a measured one is the loudest miss');
  assert.equal(obsF.length, obsCells.filter((o) => o[2] / 1000 >= bands[bands.length - 1].min).length, 'measured and model maps skip only what is below the ladder');
  assert.ok(modF.length < obsF.length, 'the model leaves cells empty that were measured (the recorded fact, drawn)');
  for (const f of obsF.concat(modF)) assert.ok(bands.some((b) => b.c === f.properties.c), 'every colour is one of the simulator\'s own');
  const lr = ratF.map((f) => f.properties.log10Ratio);
  const hits = ratF.filter((f) => f.properties.k === 'r-ok').length / ratF.length;
  assert.ok(hits > 0.05 && hits < 0.5, 'the neutral colour is the FAC2 criterion, so its share is of the order of the recorded FAC2 (' + hits.toFixed(3) + ' vs ' + B.metrics.fac2 + ')');
  assert.ok(Math.min(...lr) < -1, 'the largest under-predictions are over a decade');
  const edge = (x) => ratioBand(x).k;
  assert.equal(edge(0), 'r-ok'); assert.equal(edge(0.31), 'r-hi0'); assert.equal(edge(-0.31), 'r-lo0'); assert.equal(edge(-2.5), 'r-lo2'); assert.equal(edge(5), 'r-hi2');
});

test('the reader\'s door and Atlas\'s door both reach it', () => {
  const sims = read('js/sims.js'), cap = read('js/atlas-cap-sim.js');
  assert.ok(/import \{ cellFeatures, RATIO_LADDER \} from '\.\/radiation-hindcast\.js'/.test(sims), 'the panel draws with the shared module');
  assert.ok(/return \{ run, clear, isOpen, openPanel, closePanel, hindcast,/.test(sims), 'IntMapRadiation.hindcast is a published door');
  assert.ok(/jsonWithin\('data\/radiation-hindcast\.json'/.test(sims), 'and the data it draws is the bundle, fetched on demand');
  assert.ok(/hindcast: one\('obs', 'model', 'ratio'\)/.test(cap) && /required: \['hindcast'\]/.test(cap), 'Atlas\'s radiation capability takes hindcast without a place');
  assert.ok(/IntMapRadiation\.hindcast\(view\)/.test(cap), 'and runs the same door the panel does');
});
