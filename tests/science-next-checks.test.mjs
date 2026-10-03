/* ============================================================================
 *  IntMap · science-next — what the plume model's 2011 miss is made of (the attribution ladder)
 * ----------------------------------------------------------------------------
 *  tests/radiation-hindcast-checks.test.mjs guards the preset: the simulator as a reader runs it, against
 *  the 2011 survey. This file guards the LADDER built on top of it (docs/RADIATION-MODEL.md §10b): the same
 *  comparison with one stated change per rung —
 *    jaea                       the accident's own release, hour by hour (data/fukushima-release.json)
 *    jaea-regional              + the regional wind nest (RAD.midPlan)
 *    jaea-regional-particulate  + caesium counted as wholly depositable
 *  Every rung is re-run here with the recorded seeds and goes RED if it got worse than its recorded value, or
 *  if the map a reader is shown for it is no longer what the model produces. Same slack as the preset's gate,
 *  for the same reason (another engine's Math.exp, not a margin for decline).
 *  The three rungs run in worker threads, in parallel: one rung is ~20 s of solving.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { RAD, C, FLOOR_BQ_M2, loadFixture, loadBundle, loadRelease, releaseSegments, buildField, areaKm2 } from '../scripts/radiation-hindcast-lib.mjs';
import { rungIds, rungOf, cellFeatures } from '../js/radiation-hindcast.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const B = loadBundle();
const REL = loadRelease();

/* one worker per rung; each re-runs that rung exactly as the builder did and sends back its measures and p50 */
const LIB = pathToFileURL(join(ROOT, 'scripts', 'radiation-hindcast-lib.mjs')).href;
const WORKER = `
  import { parentPort, workerData } from 'node:worker_threads';
  const L = await import(workerData.lib);
  const B = L.loadBundle(), obs = B.obs.cells, obsBq = obs.map((o) => o[2]), ar = L.areaKm2(obs, L.C.obsRes);
  const v = L.C.variants.find((x) => x.id === workerData.id);
  const E = L.ensembleVariant(L.loadFixture(), v, obs, L.C.obsRes, L.C.seeds);
  const m = L.H.compare(obsBq, E, ar, L.C.fmsBq);
  m.massRatioP50 = E.p50.reduce((a, x, i) => a + x * ar[i] * 1e6, 0) / 1e12 / B.survey.totalTBq;
  parentPort.postMessage({ m, p50: Array.from(E.p50), released: E.released, tableBq: E.tableBq });
`;
const runs = new Map();
function rerun(id) {
  if (!runs.has(id)) {
    runs.set(id, new Promise((resolve, reject) => {
      const w = new Worker(new URL('data:text/javascript,' + encodeURIComponent(WORKER)), { workerData: { lib: LIB, id } });
      w.once('message', (x) => { resolve(x); w.terminate(); });
      w.once('error', reject);
    }));
  }
  return runs.get(id);
}
/* start all three at once — the tests below await them */
for (const v of C.variants) rerun(v.id);

test('the release table is the paper\'s own supplement, whole and governed', () => {
  assert.equal(REL.licence, 'CC-BY-3.0', 'ACP publishes under CC BY 3.0 — the licence is what makes redistribution lawful');
  assert.match(REL.licenceUrl, /creativecommons\.org\/licenses\/by\/3\.0/);
  assert.equal(REL.url, 'https://doi.org/10.5194/acp-15-1029-2015', 'the upstream is the paper\'s DOI');
  assert.match(REL.file.zipMd5, /^[0-9a-f]{32}$/); assert.match(REL.file.csvMd5, /^[0-9a-f]{32}$/);
  assert.ok(/not an independent test/.test(REL.inferred), 'the table says it was itself inferred against measurements');
  assert.equal(REL.quality.rows, REL.segments.length);
  assert.equal(REL.quality.missing + REL.quality.outOfRange + REL.quality.duplicates, 0, 'nothing in the table was unreadable or out of range');
  const sum = REL.segments.reduce((a, g) => a + g[2] * (Date.parse(g[1]) - Date.parse(g[0])) / 3600e3, 0) / 1e15;
  assert.ok(Math.abs(sum - REL.totalPBq) < 0.01, 'the stated total is the sum of the intervals');
  assert.ok(Math.abs(sum - REL.statedTotalPBq) / REL.statedTotalPBq < 0.01, `the intervals (${sum.toFixed(2)} PBq) agree with the total the file itself states (${REL.statedTotalPBq})`);
  for (let i = 1; i < REL.segments.length; i++) assert.equal(REL.segments[i][0], REL.segments[i - 1][1], 'the intervals tile time — no gap, no overlap');
  for (const g of REL.segments) assert.ok(g[3] >= 0 && g[4] >= g[3] && g[4] <= 300, 'release heights are those the paper gives: 20 m, 120 m, 20–120 m, or the two explosion volumes');
  const st = RAD.sourceTerm('fukushima', 'cs137');
  assert.ok(REL.totalPBq * 1e15 >= st.lo && REL.totalPBq * 1e15 <= st.hi, 'the table\'s total lies inside UNSCEAR\'s reported range — the spread the ladder applies to its shape');
  assert.ok(read('js/reference-data.js').includes("n:'" + REL.paidBy + "'"), 'the DATA_SOURCES row that pays the CC BY credit exists');
  for (const f of ['js/locales/pages.en.js', 'js/locales/pages.ja.js']) assert.ok(read(f).includes('"' + REL.paidBy + '"'), f + ' describes that source');
});

test('a release that varies in time: activity is conserved, follows the mass, and is clipped out loud', () => {
  const segs = [{ t0: 0, t1: 2, bq: 3e15, zBot: 20, zTop: 20 }, { t0: 2, t1: 4, bq: 1e15, zBot: 0, zTop: 300 }, { t0: 8, t1: 12, bq: 2e15, zBot: 120, zTop: 120 }];
  const p = RAD.releasePlan(segs, 10, 4000);
  assert.ok(Math.abs(p.total - (3e15 + 1e15 + 1e15)) < 1, 'the last interval is half inside a 10 h window, so half of it is released');
  assert.ok(Math.abs(p.outside - 1e15) < 1, '…and the other half is reported as released outside, not folded in');
  let first = 0, high = 0;
  for (let i = 0; i < 4000; i++) { if (p.tEmit[i] < 2) first++; if (p.zt[i] === 300) high++; }
  assert.ok(Math.abs(first / 4000 - 0.6) < 0.001, 'particles carry equal activity, so the interval with 60 % of the release gets 60 % of them');
  assert.ok(Math.abs(high / 4000 - 0.2) < 0.001, 'and each particle leaves at its own interval\'s height');
  for (let i = 1; i < 4000; i++) assert.ok(p.tEmit[i] >= p.tEmit[i - 1], 'release instants are in order (the solver emits them as the clock passes)');
  assert.equal(RAD.releasePlan([{ t0: 20, t1: 30, bq: 1e15 }], 10, 100), null, 'a release entirely outside the window releases nothing');
  /* the converted table spans the window from the first release to beyond its end */
  const tbl = releaseSegments(REL);
  assert.ok(tbl[0].t0 > 0 && tbl[0].t0 < 24, 'the first release is some hours after the shutdown');
  assert.ok(tbl[tbl.length - 1].t1 > C.hours, 'the table runs past the 14-day window, which is why the bundle states what fell outside it');
});

test('the regional nest only refines: a field whose middle nest IS the outer one blows the same wind', () => {
  const fx = loadFixture();
  assert.ok(fx.mid && fx.mid.length === RAD.midPlan(0, 0).n ** 2, 'the fixture carries the regional nest at the plan\'s size');
  assert.deepEqual(fx.midPlan, RAD.midPlan(C.source.lng, C.source.lat), 'fetched for the plan the model states');
  const F = buildField(fx, false);
  assert.equal(F.mid, null, 'the preset rung runs on the two nests a reader\'s run fetches');
  const same = { ...F, mid: F.outer };
  for (const [lng, lat, h, z] of [[141.03, 37.42, 5, 50], [140.2, 36.8, 100, 300], [139.5, 37.9, 200, 20], [142.5, 38.5, 50, 800]]) {
    const a = RAD.windAt(F, lng, lat, h, z), b = RAD.windAt(same, lng, lat, h, z);
    assert.ok(Math.abs(a.u - b.u) < 1e-9 && Math.abs(a.v - b.v) < 1e-9, 'blending a nest with itself changes nothing');
    const ea = RAD.envAt(F, lng, lat, h), eb = RAD.envAt(same, lng, lat, h);
    assert.ok(Math.abs(ea.pr - eb.pr) < 1e-9, 'nor the rain');
  }
  const Fr = buildField(fx, true);
  const far = RAD.envAt(Fr, 139.9, 36.6, 230), coarse = RAD.envAt(F, 139.9, 36.6, 230);
  assert.ok(far && coarse, 'both fields cover the surveyed land 150 km from the plant');
});

for (const v of C.variants) {
  test('THE LADDER GATE — ' + v.id + ': not worse than recorded, and the map shown is what the model gives', async () => {
    const rec = B.variants.find((x) => x.id === v.id);
    assert.ok(rec, 'the bundle records rung ' + v.id);
    assert.equal(rec.conditions.regionalNest, v.regional);
    assert.equal(rec.conditions.release, C.releaseFile);
    const { m, p50, released, tableBq } = await rerun(v.id);
    const R = rec.metrics, slack = 0.01;
    const need = (name, got, r, higher) => assert.ok(higher ? got >= r - slack : got <= r + slack, `${v.id}: ${name} got worse: ${got.toFixed(4)} against a recorded ${r}`);
    need('Pearson r (log10)', m.pearsonLog, R.pearsonLog, true);
    need('Spearman', m.spearman, R.spearman, true);
    need('|bias|', Math.abs(m.biasLog10), Math.abs(R.biasLog10), false);
    need('mean |log10 error|', m.meanAbsLog10, R.meanAbsLog10, false);
    need('FAC2', m.fac2, R.fac2, true);
    need('FAC5', m.fac5, R.fac5, true);
    need('p10-p90 coverage', m.bandCoverage, R.bandCoverage, true);
    need('empty cells', m.modelBelowFloor, R.modelBelowFloor, false);
    for (const T of C.fmsBq) need('FMS ' + T, m.fms[T], R.fms[T], true);
    need('|log10 mass ratio|', Math.abs(Math.log10(m.massRatioP50)), Math.abs(Math.log10(R.massRatioP50)), false);
    for (const k of ['pearsonLog', 'spearman', 'biasLog10', 'fac2', 'bandCoverage']) {
      assert.ok(Math.abs(m[k] - R[k]) < 0.01, `${v.id} ${k}: recorded ${R[k]}, now ${m[k].toFixed(4)} — the record is stale (node scripts/build-radiation-hindcast.mjs --offline)`);
    }
    let worst = 0;
    for (let i = 0; i < p50.length; i++) {
      const s = rec.model.cells[i][1], r = p50[i];
      if (s < FLOOR_BQ_M2 && r < FLOOR_BQ_M2) continue;
      worst = Math.max(worst, Math.abs(Math.log10(Math.max(s, 1)) - Math.log10(Math.max(r, 1))));
    }
    assert.ok(worst < 0.02, `${v.id}: the shipped p50 differs from a re-run by up to ${worst.toFixed(3)} dex`);
    assert.ok(Math.abs(released.inWindowBq / 1e15 - rec.conditions.releasedInWindowPBq) < 0.01 && Math.abs(released.outsideBq / 1e15 - rec.conditions.releasedAfterWindowPBq) < 0.01, 'what was released inside and after the window is stated as run');
    assert.ok(Math.abs(tableBq / 1e15 - REL.totalPBq) < 0.01);
  });
}

test('the ladder is read from the bundle, drawn by the shared module, and states its numbers in the documents', () => {
  const ids = rungIds(B);
  assert.deepEqual(ids, ['preset'].concat(C.variants.map((v) => v.id)), 'the rungs a reader can choose are the builder\'s, in its order');
  assert.equal(rungOf(B, 'no-such-rung'), null, 'an unknown rung is nothing, not the preset in disguise');
  const bands = RAD.PLAIN_ZONES.bands;
  for (const id of ids) {
    const rb = rungOf(B, id);
    assert.equal(rb.model.cells.length, B.obs.cells.length, id + ': one model triple per measured cell');
    assert.equal(cellFeatures(rb, 'ratio', bands).length, B.obs.cells.length, id + ': the ratio map draws every cell');
  }
  assert.equal(B.release.hourlyBqPerH.length, C.hours, 'the panel\'s timeline covers the model window hour by hour');
  const sumH = B.release.hourlyBqPerH.reduce((a, x) => a + x, 0) / 1e15;
  const inWin = B.variants[0].conditions.releasedInWindowPBq;
  assert.ok(Math.abs(sumH - inWin) / inWin < 0.02, `the timeline (${sumH.toFixed(2)} PBq) is the release the model was given inside the window (${inWin})`);
  /* documents: §10b of the model document states every rung's recorded r, FAC2 and median-cell factor */
  const doc = read('docs/RADIATION-MODEL.md'), at = doc.indexOf('### 10b.'), end = doc.indexOf('\n## ', at);
  const sec = at < 0 ? '' : doc.slice(at, end < 0 ? undefined : end);
  assert.ok(sec.length > 500, 'docs/RADIATION-MODEL.md has §10b for the ladder');
  for (const v of B.variants) {
    for (const t of ['`' + v.id + '`', 'r = ' + v.metrics.pearsonLog.toFixed(2), (v.metrics.fac2 * 100).toFixed(1) + ' %']) assert.ok(sec.includes(t), `§10b must state «${t}» for ${v.id}`);
  }
  for (const f of ['js/locales/pages.en.js', 'js/locales/pages.ja.js']) {
    const t = read(f), i = t.indexOf("id: 'radiation'"), s2 = t.slice(i, t.indexOf("id: '", i + 20));
    const best = B.variants[B.variants.length - 1].metrics;
    assert.ok(s2.includes('r = ' + B.variants[0].metrics.pearsonLog.toFixed(2)) && s2.includes((best.fac2 * 100).toFixed(1) + ' %'), f + ': the science page states the ladder\'s numbers');
  }
});

test('the reader\'s door and Atlas\'s door reach every rung', () => {
  const sims = read('js/sims.js'), cap = read('js/atlas-cap-sim.js');
  assert.ok(/import \{[^}]*rungIds, rungOf[^}]*\} from '\.\/radiation-hindcast\.js'/.test(sims), 'the panel reads the rungs from the bundle through the shared module');
  assert.ok(/async function hindcast\(view,rung\)/.test(sims), 'IntMapRadiation.hindcast takes a rung');
  assert.ok(/rung: str\(\)/.test(cap) && /IntMapRadiation\.hindcast\(view, /.test(cap), 'Atlas passes the rung through the same door');
  for (const id of rungIds(B)) assert.ok(cap.includes('"' + id + '"'), 'Atlas\'s catalogue text names rung ' + id + ' (the bundle has it)');
  assert.ok(/hr\.reason === 'rung'/.test(cap), 'an unknown rung is answered with the list of rungs, so the next call can be right');
});
