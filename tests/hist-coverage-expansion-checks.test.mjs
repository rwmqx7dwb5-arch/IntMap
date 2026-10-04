/* ============================================================================
 *  (hist-coverage-expansion) the world before 1886 as a COMPOSITION — OpenHistoricalMap, then
 *  Cliopatria, then the historical-basemaps sheet, each on the ground the ones above leave.
 *  scripts/build-hist-clio.mjs writes data/hist-clio.js and data/hist-eras-rest.js; js/time-borders.js
 *  `compositeAt` draws their union; scripts/hist-fidelity.mjs measures the same union.
 *  These are asked of the SHIPPED files and of the page's own module, run (tests/helpers is the
 *  scripts/histeras/time-borders.mjs harness), never of the source text.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { astro, UPSTREAM, CREDIT_ROW } from '../scripts/build-hist-clio.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel, g) => { const w = {}; new Function('window', readFileSync(join(ROOT, rel), 'utf8'))(w); return w[g]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const inForce = (f, t) => ymd(f[2], f[3], f[4]) <= t && t < ymd(f[5], f[6], f[7]);
const haveEras = existsSync(join(ROOT, 'data', 'hist-eras.js'));

test('① the committed composition passes its own gate (pinned release, neighbours by sha256, rings, credit)', () => {
  const r = spawnSync(process.execPath, ['scripts/build-hist-clio.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('② Cliopatria writes BC years as historical numbers; the record is astronomical', () => {
  assert.equal(astro(-202), -201);   /* Han, founded 202 BC */
  assert.equal(astro(-1), 0);
  assert.equal(astro(0), 0);
  assert.equal(astro(1206), 1206);
  const d = load('data/hist-clio.js', '__HISTCLIO');
  const han = d.feats.filter((f) => f[0].en === 'Han Dynasty').map((f) => f[2]);
  assert.ok(han.length, 'Han Dynasty is drawn');
  assert.equal(Math.min(...han), -201, 'the Han dynasty begins in 202 BC, astronomical −201');
});

test('③ no row outlives CShapes\' last day, every row has calendar dates, relations are not drawn, realms are marked and unbracketed', () => {
  const d = load('data/hist-clio.js', '__HISTCLIO');
  assert.equal(d.upstream.sha256, UPSTREAM.sha256);
  const end = ymd(d.window[1] + 1, 1, 1);
  for (const f of d.feats) {
    assert.ok(ymd(f[5], f[6], f[7]) <= end, f[0].en + ' outlives the window');
    assert.ok(f[3] >= 1 && f[3] <= 12 && f[6] >= 1 && f[6] <= 12, f[0].en + ' has no calendar month (' + f.slice(2, 8).join(' ') + ')');
    assert.ok(!/^\(/.test(f[0].en), f[0].en + ' is drawn under a bracketed relation/aggregate name');
  }
  const realms = d.feats.filter((f) => f[9] && f[9].r);
  assert.ok(realms.some((f) => f[0].en === 'Holy Roman Empire'), 'the Holy Roman Empire is drawn as a realm over its members');
  assert.ok(d.feats.some((f) => f[9] && f[9].of === 'Holy Roman Empire'), 'members name their realm');
  assert.ok(readFileSync(join(ROOT, 'js', 'reference-data.js'), 'utf8').includes(CREDIT_ROW), 'CC BY 4.0 credit row');
});

test('④ historical verification: named years and places (historical-verification.md §2-1)', () => {
  const d = load('data/hist-clio.js', '__HISTCLIO');
  const names = (y) => new Set(d.feats.filter((f) => inForce(f, ymd(y, 6, 15))).map((f) => f[0].en));
  /* Temüjin proclaimed Genghis Khan 1206; the Mongol Empire is not drawn in 1200 and is in 1250 */
  assert.ok(!names(1200).has('Mongol Empire'), 'Mongol Empire drawn before 1206');
  assert.ok(names(1250).has('Mongol Empire'), 'Mongol Empire missing in 1250');
  /* Baghdad fell to the Mongols in February 1258: the Abbasid Caliphate of Baghdad is not drawn in 1260 */
  assert.ok(names(1250).has('Abbasid Caliphate'));
  assert.ok(!names(1260).has('Abbasid Caliphate'), 'Abbasid Caliphate drawn after 1258');
  /* Constantinople fell 29 May 1453 */
  assert.ok(names(1450).has('Byzantine Empire'));
  assert.ok(!names(1460).has('Byzantine Empire'), 'Byzantine Empire drawn after 1453');
  /* (clio-lifespan-review) judged findings of scripts/histclio/review.json, end side:
     Ayutthaya sacked Angkor 1431; Portugal took Malacca 1511; Georgia divided 1490 */
  assert.ok(names(1400).has('Khmer Empire'));
  assert.ok(!names(1500).has('Khmer Empire'), 'Khmer Empire drawn after 1431');
  assert.ok(names(1500).has('Sultanate of Malacca'));
  assert.ok(!names(1600).has('Sultanate of Malacca'), 'Sultanate of Malacca drawn after 1511');
  assert.ok(names(1450).has('Kingdom of Georgia'));
  assert.ok(!names(1750).has('Kingdom of Georgia'), 'Kingdom of Georgia drawn after 1490');
  /* start side: Otto I crowned 962; «Later Zhou» (951–960) is not the Eastern Zhou of 500 BC */
  assert.ok(!names(950).has('Holy Roman Empire'), 'Holy Roman Empire drawn before 962');
  assert.ok(names(1000).has('Holy Roman Empire'));
  assert.ok(!names(-499).has('Later Zhou'), 'Later Zhou drawn in 500 BC');
  /* refuted findings stay named: the Old Swiss Confederacy (1291) and the Piast realm before 1025 */
  assert.ok(names(1500).has('Swiss Confederation'), 'a refuted finding withheld the Swiss Confederation');
  assert.ok(names(1000).has('Kingdom of Poland'), 'a refuted finding withheld the Kingdom of Poland');
  /* the withheld shape says which name, which side and the year history gives (the card reads these) */
  const w = d.feats.filter((f) => f[9] && f[9].wn === 'Holy Roman Empire');
  assert.ok(w.length && w.every((f) => f[9].ws === 'start' && f[9].wy === 962 && f[9].wq === 'Q12548' && !f[0].en), 'the Holy Roman Empire rows before 962 are not withheld as «start 962»');
  const c = d.feats.filter((f) => f[9] && f[9].wn === 'Himyarite Kingdom');
  assert.ok(c.length && c.every((f) => f[9].ws === 'end' && f[9].wy === 570 && f[9].wc === 1), 'an approximate end is not carried as circa');
});

test('④b every finding is judged by name AND side, and each side is judged once', async () => {
  const { judgedSides } = await import('../scripts/build-hist-clio.mjs');
  const review = JSON.parse(readFileSync(join(ROOT, 'scripts', 'histclio', 'review.json'), 'utf8'));
  const seen = new Map();
  for (const r of [...review.rows, ...review.refuted]) for (const s of judgedSides(r)) {
    const k = r.name + '|' + s; assert.ok(!seen.has(k), k + ' is judged twice'); seen.set(k, r); }
  /* Kingdom of Poland: the start refuted as a title, the end as another item — two entries, one per side */
  assert.equal(seen.get('Kingdom of Poland|start').why, 'name-not-claim');
  assert.equal(seen.get('Kingdom of Poland|end').why, 'other-identity');
  for (const r of review.refuted) assert.ok(['date-disputed', 'other-identity', 'name-not-claim'].includes(r.why) && r.history.length > 20, r.name + ': a refutation needs a reason and a sentence of history');
});

test('⑤ the composed band: no Cliopatria row keeps a quarter of its ground where OHM states it', () => {
  const d = load('data/hist-clio.js', '__HISTCLIO'), hb = load('data/hist-borders.js', '__HISTB');
  /* the rows were cut on OHM's own dates, so in OHM's band every Cliopatria piece is the row less OHM —
     sampled on a grid of cell centres, a piece may share border ribbons with OHM but not ground */
  const G = 0.5, cellsOf = (polys) => {
    const out = new Set();
    for (const poly of polys) {
      let y0 = 90, y1 = -90; for (const p of poly[0]) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      for (let y = Math.ceil(y0 / G - 0.5) * G + G / 2; y <= y1; y += G) {
        const xs = []; for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
        xs.sort((a, b) => a - b);
        for (let q = 0; q + 1 < xs.length; q += 2) for (let x = Math.ceil(xs[q] / G - 0.5) * G + G / 2; x <= xs[q + 1]; x += G) out.add(Math.round(x * 4) + ',' + Math.round(y * 4));
      }
    }
    return out;
  };
  for (const y of [1700, 1800, 1850]) {
    const t = ymd(y, 6, 15), ohm = new Set();
    for (const f of hb.feats) if (inForce(f, t)) for (const c of cellsOf(f[8].map((p) => p.map((ri) => hb.rings[ri])))) ohm.add(c);
    for (const f of d.feats) {
      if (!inForce(f, t)) continue;
      const cs = cellsOf(f[8].map((p) => p.map((ri) => d.rings[ri]))); if (cs.size < 8) continue;
      let shared = 0; for (const c of cs) if (ohm.has(c)) shared++;
      assert.ok(shared / cs.size < 0.25, `${y}: ${f[0].en} keeps ${shared}/${cs.size} cells OHM states`);
    }
  }
});

test('⑥ the page composes: 1250 and 1750 answer «composite» with the records each year has, 1900 is CShapes first', { skip: !haveEras && 'data/hist-eras.js is not pulled (npm run data:pull)' }, async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const { repoFetch } = await import('../scripts/hist-fidelity.mjs');
  const { api } = await timeBorders({ lang: 'en', fetch: repoFetch });
  const at = (y) => { const d = new Date(0); d.setFullYear(y, 5, 15); d.setHours(12, 0, 0, 0); return d; };
  const r1250 = await api.collectionAt(at(1250));
  assert.equal(r1250.tier, 'composite');
  const f1250 = r1250.fc.features.map((f) => f.properties);
  assert.ok(f1250.some((p) => p.NAME === 'Mongol Empire' && p._rec === 'clio'), 'Cliopatria draws the Mongol Empire in 1250');
  assert.ok(f1250.some((p) => p._rec === 'sheet'), 'the sheet fills ground no record above states');
  const r1750 = await api.collectionAt(at(1750));
  assert.equal(r1750.tier, 'composite');
  const p1750 = r1750.fc.features.map((f) => f.properties);
  assert.ok(p1750.some((p) => !p._rec), 'OpenHistoricalMap answers inside its band');
  assert.ok(p1750.some((p) => p._rec === 'clio'), 'Cliopatria answers the ground OHM leaves');
  const rec = api.recordOf('composite');
  assert.ok(rec && rec.parts.some((x) => x.tier === 'clio' && /CC BY 4\.0/.test(x.src)), 'the composed world cites Cliopatria');
  /* from 1886 CShapes answers first and Cliopatria only where CShapes is silent (the Sahel sultanates of 1900) */
  const r1900 = await api.collectionAt(at(1900));
  assert.ok(r1900.tier === 'cshapes' || r1900.tier === 'composite', r1900.tier);
  const p1900 = r1900.fc.features.map((f) => f.properties);
  assert.ok(p1900.some((p) => p._gw != null), 'CShapes answers 1900');
  if (r1900.tier === 'composite') assert.ok(r1900.record.parts[0].tier === 'cshapes' && p1900.some((p) => p._rec === 'clio'), 'Cliopatria under CShapes');
  /* a Cliopatria-only edge is a YEAR, an OHM edge a DAY */
  const yearEdge = new Date(0); yearEdge.setFullYear(1206, 0, 1); yearEdge.setHours(0, 0, 0, 0);
  assert.equal(api.changePrecision(yearEdge), 'year');
});

test('⑦ the gate measures the same union: more of the world\'s land is inside a drawn polity than one record per band drew', { skip: !haveEras && 'data/hist-eras.js is not pulled (npm run data:pull)' }, async () => {
  const { polityLandAt } = await import('../scripts/hist-fidelity.mjs');
  /* the instants the band chose worst: OHM alone in 1689 and 1800, CShapes alone at its first year */
  for (const y of [1689, 1800, 1886]) {
    const band = polityLandAt(y, { band: true }), comp = polityLandAt(y);
    assert.ok(comp > band + 1, `${y}: the composition draws ${comp.toFixed(1)}% of the land, one record per band ${band.toFixed(1)}%`);
  }
  const obs = JSON.parse(readFileSync(join(ROOT, 'data', 'hist-fidelity.json'), 'utf8'));
  for (const r of obs.years) assert.ok(r.polityLand != null && r.unitLand != null, r.year + ' records both shares of the world\'s land');
});
