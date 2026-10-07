/* ============================================================================
 *  (cshapes-review-findings) three findings against CShapes 2.0, judged on the treaties that made the change
 *  and applied through scripts/cshapes/review.json — never as a branch in a reader:
 *    1. the northern Kurils (Shumshu to Simushir) are Japanese 1886 – 1945-08-14 (Treaty of Saint Petersburg,
 *       1875); CShapes carries Russia's present border back because it leaves out changes under 10,000 km²;
 *    2. Korea becomes Japanese on 1910-08-29, the day the annexation treaty took effect (Art. 8), not on the
 *       day after it was signed;
 *    3. the Nansei Islands are drawn as under United States administration from SCAPIN-677 (1946-01-29) to
 *       the reversion (1972-05-15), with the card saying Japan kept residual sovereignty.
 *  Every assertion is asked of what runs: the builder's own functions, the committed bundle, the gate's
 *  measure (scripts/hist-fidelity.mjs politiesAt) and js/time-borders.js instantiated in node.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { applyReview, reviewProblems, readReview, polyInside } from '../scripts/build-cshapes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = () => { const w = {}; new Function('window', readFileSync(join(ROOT, 'data', 'cshapes.js'), 'utf8'))(w); return w.__CSHAPES; };
const CS = bundle(), REVIEW = readReview();
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const inForce = (f, t) => ymd(f[2], f[3], f[4]) <= t && t <= ymd(f[5], f[6], f[7]);
const pin = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
/* the CShapes rows in force at `t` whose outline holds the point */
const owners = (d, pt, t) => d.feats.filter((f) => inForce(f, t) && f[8].some((p) => pin(pt, d.rings[p[0]]))).map((f) => f[0]);
const SHUMSHU = [156.25, 50.75], SIMUSHIR = [152.0, 46.95], SEOUL = [126.98, 37.56], OKINAWA = [127.8, 26.4], AMAMI = [129.5, 28.3], ISHIGAKI = [124.17, 24.4];

test('① the committed bundle IS the ledger applied — re-applying changes nothing, and the gate finds nothing', () => {
  const again = applyReview(CS, REVIEW).data;
  assert.equal(JSON.stringify(again), JSON.stringify(CS), 'data/cshapes.js is not scripts/cshapes/review.json applied — node scripts/build-cshapes.mjs --review');
  assert.deepEqual(reviewProblems(CS, REVIEW), []);
  /* the notes travel in the bundle, exactly as written in the ledger */
  assert.equal(CS.review.notes.length, REVIEW.notes.length);
  for (const n of CS.review.notes) assert.ok(n.en && n.jp, 'every note is en + jp');
});

test('② 1900: Shumshu and Simushir are Japan\'s, not Russia\'s — until 14 August 1945, and the Soviet Union\'s after', () => {
  for (const pt of [SHUMSHU, SIMUSHIR]) {
    for (const t of [ymd(1886, 1, 1), ymd(1900, 7, 1), ymd(1920, 6, 1), ymd(1945, 8, 14)]) assert.deepEqual(owners(CS, pt, t), ['Japan'], `${pt} on ${t}`);
    assert.deepEqual(owners(CS, pt, ymd(1945, 8, 15)), ['Russia (Soviet Union)']);
  }
  /* one copy of the islands for the whole span: the coarse 1920 Soviet copy does not redraw Japan twice */
  const japan = CS.feats.filter((f) => f[1] === 740 && ymd(f[5], f[6], f[7]) <= ymd(1945, 8, 14));
  assert.equal(japan.length, 1, 'Japan 1886–1945 is one row: ' + japan.map((f) => f.slice(2, 8).join('-')).join(', '));
  /* Kamchatka stays Russian — the selector does not reach across the First Kuril Strait */
  assert.deepEqual(owners(CS, [158.0, 54.5], ymd(1900, 7, 1)), ['Russia (Soviet Union)']);
  assert.deepEqual(owners(CS, [156.8, 51.2], ymd(1900, 7, 1)), ['Russia (Soviet Union)'], 'the Lopatka side of the strait');
});

test('③ Korea changes hands on 1910-08-29 (promulgation, Art. 8), not on the day after the signing', () => {
  const rows = CS.feats.filter((f) => f[1] === 730).map((f) => f.slice(2, 8).join('-'));
  assert.deepEqual(rows, ['1886-1-1-1910-8-28', '1910-8-29-1945-8-14']);
});

test('④ the Nansei Islands: US administration 1946-01-29..1972-05-14, Amami back on 1953-12-25, Proclamation No. 27\'s line', () => {
  const at = (pt, y, m, d) => owners(CS, pt, ymd(y, m, d));
  assert.deepEqual(at(OKINAWA, 1946, 1, 28), ['Japan']);
  assert.deepEqual(at(OKINAWA, 1946, 1, 29), ['Ryukyu Islands']);
  assert.deepEqual(at(AMAMI, 1953, 12, 24), ['Ryukyu Islands']);
  assert.deepEqual(at(AMAMI, 1953, 12, 25), ['Japan']);
  assert.deepEqual(at(ISHIGAKI, 1972, 5, 14), ['Ryukyu Islands']);
  assert.deepEqual(at(OKINAWA, 1972, 5, 15), ['Japan']);
  /* the code is IntMap's, declared, and never collides with a CShapes code */
  assert.ok(REVIEW.units['7401'] && /not a Gleditsch-Ward code/.test(REVIEW.units['7401'].basis));
  assert.ok(CS.feats.filter((f) => f[1] === 7401).every((f) => f[0] === 'Ryukyu Islands'));
});

test('⑤ the applier refuses what it cannot state: a selector that cuts land, an undeclared unit, a ground that is not one', () => {
  const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
  const d = { v: 2, rings: [sq(0, 0, 10), sq(20, 0, 1), sq(30, 0, 10)],
    feats: [['A', 1, 1900, 1, 1, 1950, 12, 31, [[0], [1]]], ['B', 2, 1900, 1, 1, 1950, 12, 31, [[2]]]] };
  const ground = (within, to = 2) => ({ units: {}, ground: [{ id: 'g', from: 1, to, s: [1910, 1, 1], e: [1920, 12, 31], within }], edges: [], notes: [] });
  /* a whole island moves for the span, and the source and receiver are split at its ends */
  const ok = applyReview(d, ground(sq(19, -1, 3))).data;
  assert.deepEqual(ok.feats.map((f) => f[0] + ' ' + f.slice(2, 8).join('-') + ' ' + f[8].length),
    ['A 1900-1-1-1909-12-31 2', 'A 1910-1-1-1920-12-31 1', 'A 1921-1-1-1950-12-31 2', 'B 1900-1-1-1909-12-31 1', 'B 1910-1-1-1920-12-31 2', 'B 1921-1-1-1950-12-31 1']);
  assert.equal(JSON.stringify(applyReview(ok, ground(sq(19, -1, 3))).data.feats), JSON.stringify(ok.feats), 'idempotent');
  assert.throws(() => applyReview(d, ground(sq(5, -1, 20))), /partly inside/, 'a selector across a polygon would cut land');
  assert.throws(() => applyReview(d, ground(sq(19, -1, 3), 99)), /not declared in `units`/);
  assert.equal(polyInside(d.rings, [1], sq(19, -1, 3)), 'all');
  /* the gate notices a bundle the ledger has not been applied to */
  const raw = { ...d, review: { src: 'x', notes: [] } };
  const led = { ...ground(sq(19, -1, 3)), ground: [{ ...ground(sq(19, -1, 3)).ground[0], history: 'x'.repeat(50), sources: [{ cite: 'a source cited here' }] }], notes: [{ about: ['g'], gw: 2, s: [1910, 1, 1], e: [1920, 12, 31], en: 'e'.repeat(50), jp: 'j'.repeat(30) }] };
  assert.ok(reviewProblems(raw, led).some((m) => /does not carry/.test(m)));
  assert.ok(reviewProblems(raw, led).some((m) => /still draws 1 polygon/.test(m)));
  assert.deepEqual(reviewProblems(applyReview(d, led).data, led), []);
  /* …and a verdict that tells the reader nothing */
  assert.ok(reviewProblems(applyReview(d, { ...led, notes: [] }).data, { ...led, notes: [] }).some((m) => /tells the reader nothing/.test(m)));
});

test('⑥ the gate\'s measure agrees: politiesAt(1900) puts Shumshu in Japan, politiesAt(1960) Okinawa in the Ryukyu Islands', async () => {
  const { politiesAt } = await import('../scripts/hist-fidelity.mjs');
  const drawnBy = (y, pt) => politiesAt(y).filter((p) => p.polys.some((poly) => pin(pt, poly[0]))).map((p) => p.rec + ':' + p.nm);
  assert.deepEqual(drawnBy(1900, SHUMSHU), ['cshapes:Japan']);
  assert.deepEqual(drawnBy(1960, OKINAWA), ['cshapes:Ryukyu Islands']);
});

test('⑦ the page draws it and the card says why — names, notes in en and jp, and a cache that does not leak a note across days', async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const { repoFetch } = await import('../scripts/hist-fidelity.mjs');
  const at = (y, m, d) => { const w = new Date(0); w.setFullYear(y, m - 1, d); w.setHours(12, 0, 0, 0); return w; };
  const inG = (g, pt) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((p) => pin(pt, p[0]));
  for (const lang of ['en', 'jp']) {
    const { api } = await timeBorders({ lang, fetch: repoFetch });
    const at1 = async (y, m, d, pt) => (await api.collectionAt(at(y, m, d))).fc.features.filter((f) => f.properties._gw != null && inG(f.geometry, pt));
    /* asked on the 1st first: the collection cached there must not carry the 23–28 August note, nor lose it after */
    const aug1 = await at1(1910, 8, 1, SEOUL), aug25 = await at1(1910, 8, 25, SEOUL), aug29 = await at1(1910, 8, 29, SEOUL);
    assert.deepEqual([aug1, aug25, aug29].map((x) => x.map((f) => f.properties.NAME)), [['Korean Empire'], ['Korean Empire'], ['Korea (Japan)']]);
    assert.equal(api.typeNote(aug1[0]), '', 'no note before the days IntMap differs from CShapes');
    const n25 = api.typeNote(aug25[0]), n29 = api.typeNote(aug29[0]);
    const kuril = api.typeNote((await at1(1900, 7, 1, SHUMSHU))[0]), ryukyu = (await at1(1960, 7, 1, OKINAWA))[0];
    assert.equal(ryukyu.properties.NAME, 'Ryukyu Islands (USA)');
    const rn = api.typeNote(ryukyu);
    if (lang === 'en') {
      assert.match(n25, /took effect only when it was promulgated on 29 August/);
      assert.match(n29, /from 29 August 1910/);
      assert.match(kuril, /Treaty of Saint Petersburg \(1875\)/);
      assert.match(rn, /residual sovereignty/);
    } else {
      assert.match(n25, /8 月 29 日の公布で初めて施行/);
      assert.match(kuril, /樺太・千島交換条約/);
      assert.match(rn, /潜在主権/);
      assert.equal(api.eraLocName('Ryukyu Islands (USA)'), '琉球諸島（アメリカ）');
    }
    assert.equal(api.typeNote((await at1(1973, 7, 1, OKINAWA))[0]), '', 'after the reversion Japan carries no note');
  }
});

test('⑧ the notes ride in the head js/hist-bundles.js hands the page (the tiled path builds the same head)', async () => {
  const w = {};
  vm.runInNewContext(readFileSync(join(ROOT, 'js', 'hist-bundles.js'), 'utf8'), { window: w, TextDecoder, Map, Set, WeakMap, Uint8Array, Promise, Error, JSON });
  const S = {};
  const h = await w.IntMapHistBundles.histJob(S, { op: 'open', global: '__CSHAPES', bytes: new Uint8Array(readFileSync(join(ROOT, 'data', 'cshapes.js'))), gaps: [] }, () => {});
  assert.equal(JSON.stringify(h.review), JSON.stringify(CS.review));
});
