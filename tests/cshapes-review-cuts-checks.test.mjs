/* ============================================================================
 *  (cshapes-review-cuts) a PART of a CShapes outline moved to another owner for a span, along a line a cited record
 *  states — scripts/cshapes/review.json `cuts` + `regions`, applied by scripts/cshapes/cuts.mjs. The findings:
 *    Danzig annexed a year early · Bukovina drawn in Hungary · Uzhhorod and Carpatho-Ukraine not Hungarian 1938-44 ·
 *    Istria and the Julian March in Yugoslavia 1920-43 · the Memel Territory Russian in 1913 and Lithuanian in 1939 ·
 *    the Hlučín Region Austro-Hungarian in 1913 · Southern Sakhalin ending 11 km short of the fiftieth parallel ·
 *    (Lviv in «Austria» 1918-19: examined and kept, with the reason).
 *  Every assertion is asked of what runs: the committed bundle, the builder's own functions, the gate's measure
 *  (scripts/hist-fidelity.mjs politiesAt) and js/time-borders.js instantiated in node. ③ shows each cut is what makes
 *  the owner right: the land is handed back to the source and the ledger applied with and without the cut.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';
import { applyReview, reviewProblems, readReview, readRegions } from '../scripts/build-cshapes.mjs';
import { cutPolygon, regionProblems, inPoly, mpArea } from '../scripts/cshapes/cuts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = () => { const w = {}; new Function('window', readFileSync(join(ROOT, 'data', 'cshapes.js'), 'utf8'))(w); return w.__CSHAPES; };
const CS = bundle(), REVIEW = readReview(), PHOTO = readRegions();
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const inForce = (f, t) => ymd(f[2], f[3], f[4]) <= t && t <= ymd(f[5], f[6], f[7]);
const geomOf = (d, f) => f[8].map((p) => p.map((ri) => d.rings[ri]));
/* the CShapes rows in force on [y,m,d] whose outline holds the point */
const owners = (d, [x, y], [Y, M, D]) => d.feats.filter((f) => inForce(f, ymd(Y, M, D)) && geomOf(d, f).some((p) => inPoly(p, x, y))).map((f) => f[0]);
const P = {
  danzig: [18.65, 54.35], czernowitz: [25.94, 48.29], uzhhorod: [22.29, 48.62], khust: [23.29, 48.17], lviv: [24.03, 49.84],
  pula: [13.85, 44.87], rijeka: [14.44, 45.33], cres: [14.40, 44.95], memel: [21.13, 55.71], neman: [21.9, 55.08], hlucin: [18.19, 49.90],
  opava: [17.90, 49.94], band: [142.6, 49.95], kaunas: [23.90, 54.90], krk: [14.6, 45.07],
};
const cutById = (id) => REVIEW.cuts.find((c) => c.id === id);

test('① the committed bundle IS the ledger applied, and the photograph IS the ledger\'s regions', () => {
  assert.equal(JSON.stringify(applyReview(CS, REVIEW, PHOTO).data), JSON.stringify(CS), 'node scripts/build-cshapes.mjs --review');
  assert.deepEqual(reviewProblems(CS, REVIEW, PHOTO), []);
  assert.deepEqual(regionProblems(REVIEW, PHOTO), []);
  for (const [id, r] of Object.entries(PHOTO.regions)) {
    for (const s of r.sources) if (s.ohm) assert.ok(s.version > 0 && /^\d{4}-\d\d-\d\dT/.test(s.timestamp), id + ': an OpenHistoricalMap relation is pinned to its version');
    assert.ok(r.geometry.length && mpArea(r.geometry) > 0, id + ' has land');
  }
  /* every cut tells the reader, in en and jp, on the outline it changed */
  for (const c of REVIEW.cuts) assert.ok(REVIEW.notes.some((n) => n.about.includes(c.id) && n.en && n.jp), c.id + ' carries a note');
});

test('② each finding, on the days around its change: who the bundle draws there', () => {
  const at = (pt, ...d) => owners(CS, P[pt], d);
  /* Danzig: the Free City until the annexation of 1 September 1939 (CShapes: ended 1938-08-31, nobody, then Germany) */
  assert.deepEqual(at('danzig', 1938, 9, 15), ['Danzig']);
  assert.deepEqual(at('danzig', 1939, 8, 31), ['Danzig']);
  assert.deepEqual(at('danzig', 1939, 9, 1), ['Germany (Prussia)']);
  /* Bukovina: never Hungarian — Austria 3-10 November 1918, Romania from the 11th */
  assert.deepEqual(at('czernowitz', 1918, 11, 5), ['Austria']);
  assert.deepEqual(at('czernowitz', 1918, 11, 11), ['Rumania']);
  assert.deepEqual(at('czernowitz', 1919, 6, 1), ['Rumania']);
  /* Subcarpathian Ruthenia: the Vienna Award part from 2 November 1938, the rest from 16 March 1939, to October 1944 */
  assert.deepEqual(at('uzhhorod', 1938, 11, 1), ['Czechoslovakia']);
  assert.deepEqual(at('uzhhorod', 1938, 11, 2), ['Hungary']);
  assert.deepEqual(at('khust', 1939, 3, 15), ['Czechoslovakia']);
  assert.deepEqual(at('khust', 1939, 3, 16), ['Hungary']);
  assert.deepEqual(at('uzhhorod', 1944, 10, 27), ['Hungary']);
  assert.deepEqual(at('uzhhorod', 1944, 10, 28), ['Czechoslovakia']);
  /* the Julian March: Italian from the Treaty of Rapallo, Fiume from 22 February 1924, to the armistice of 8 September 1943 */
  assert.deepEqual(at('pula', 1920, 11, 11), ['Yugoslavia']);
  assert.deepEqual(at('pula', 1930, 6, 1), ['Italy/Sardinia']);
  assert.deepEqual(at('cres', 1930, 6, 1), ['Italy/Sardinia']);
  assert.deepEqual(at('rijeka', 1922, 6, 1), ['Yugoslavia'], 'the Free State of Fiume is examined, not drawn in Italy');
  assert.deepEqual(at('rijeka', 1925, 6, 1), ['Italy/Sardinia']);
  assert.deepEqual(at('pula', 1943, 9, 9), ['Yugoslavia']);
  assert.deepEqual(at('krk', 1930, 6, 1), ['Yugoslavia'], 'Krk stayed Yugoslav');
  /* the Memel Territory: German to 14 February 1920, the Allies' to 18 February 1923, Lithuanian, German from 23 March 1939 */
  assert.deepEqual(at('memel', 1913, 6, 1), ['Germany (Prussia)']);
  assert.deepEqual(at('memel', 1920, 2, 14), ['Germany (Prussia)']);
  assert.deepEqual(at('memel', 1920, 2, 15), ['Memel Territory']);
  assert.deepEqual(at('memel', 1923, 2, 19), ['Lithuania']);
  assert.deepEqual(at('memel', 1939, 6, 1), ['Germany (Prussia)']);
  assert.deepEqual(at('memel', 1945, 1, 28), ['Russia (Soviet Union)']);
  assert.deepEqual(at('kaunas', 1939, 6, 1), ['Lithuania'], 'the rest of Lithuania stays Lithuanian');
  /* the Hlučín Region: German to 3 February 1920 — and on the days CShapes draws nobody in the Czech lands */
  assert.deepEqual(at('hlucin', 1913, 6, 1), ['Germany (Prussia)']);
  assert.deepEqual(at('hlucin', 1918, 11, 5), ['Germany (Prussia)']);
  assert.deepEqual(at('hlucin', 1920, 2, 4), ['Czechoslovakia']);
  assert.deepEqual(at('opava', 1913, 6, 1), ['Austria-Hungary'], 'Opava, across the old border, stays Austrian');
  /* Southern Sakhalin reaches the fiftieth parallel */
  assert.deepEqual(at('band', 1930, 1, 1), ['Southern Sakhalin Island']);
  assert.deepEqual(at('band', 1945, 8, 15), ['Russia (Soviet Union)']);
  const ks = CS.feats.find((f) => f[1] === 7351);
  assert.equal(Math.max(...geomOf(CS, ks).flatMap((p) => p[0].map((q) => q[1]))), 50, 'the outline\'s northern edge is the parallel');
  /* Lviv: examined and kept, with the reason */
  assert.deepEqual(at('lviv', 1919, 6, 1), ['Austria']);
  assert.ok(REVIEW.examined.some((x) => x.id === 'galicia-1918-1919' && /West Ukrainian People's Republic/.test(x.why)));
});

/* the land a cut moved, handed back to the source on a one-row-each bundle — the bundle as CShapes drew it there */
function uncut(c, t) {
  const R = PHOTO.regions[c.region].geometry, froms = [].concat(c.from);
  /* the source the ledger names first that has a row that day (Lithuania before the Soviet Union in 1939) */
  const src = froms.map((gw) => CS.feats.find((f) => f[1] === gw && inForce(f, t))).find(Boolean);
  const dst = CS.feats.find((f) => f[1] === c.to && inForce(f, t));
  const back = pc.intersection(geomOf(CS, dst), R);
  const rings = [], feats = [];
  const add = (name, gw, mp) => feats.push([name, gw, ...c.s, ...c.e, mp.map((p) => p.map((r) => (rings.push(r), rings.length - 1)))]);
  add(src[0], src[1], pc.union(geomOf(CS, src), back));
  const rest = pc.difference(geomOf(CS, dst), R);
  if (!REVIEW.units[String(c.to)]) add(dst[0], dst[1], rest.length ? rest : [[[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]]]);
  return { v: 2, src: CS.src, rings, feats };
}
test('③ each cut is what makes the owner right: hand its land back, apply the ledger with and without it', () => {
  const cases = [
    ['danzig-1938-1939', 'danzig', [1939, 6, 1], 'Danzig', 'Germany (Prussia)'],
    ['bukovina-romania-1918', 'czernowitz', [1919, 6, 1], 'Rumania', 'Hungary'],
    ['ruthenia-vienna-1938', 'uzhhorod', [1940, 6, 1], 'Hungary', 'Czechoslovakia'],
    ['carpatho-ukraine-1939', 'khust', [1940, 6, 1], 'Hungary', 'Czechoslovakia'],
    ['julian-march-1924', 'pula', [1930, 6, 1], 'Italy/Sardinia', 'Yugoslavia'],
    ['memel-german-1886-1920', 'memel', [1913, 6, 1], 'Germany (Prussia)', 'Russia (Soviet Union)'],
    ['memel-allied-1920-1923', 'memel', [1921, 6, 1], 'Memel Territory', 'Lithuania'],
    ['memel-german-1939-1945', 'memel', [1939, 6, 1], 'Germany (Prussia)', 'Lithuania'],
    ['hlucin-german-1886-1920', 'hlucin', [1913, 6, 1], 'Germany (Prussia)', 'Austria-Hungary'],
    ['karafuto-50n', 'band', [1930, 1, 1], 'Southern Sakhalin Island', 'Russia (Soviet Union)'],
  ];
  for (const [id, pt, day, right, wrong] of cases) {
    const c = cutById(id), d = uncut(c, ymd(...day));
    assert.deepEqual(owners(d, P[pt], day), [wrong], id + ': the land handed back is the source\'s');
    const led = { units: REVIEW.units, regions: REVIEW.regions, cuts: [c], notes: [] };
    const withCut = applyReview(d, led, PHOTO).data, without = applyReview(d, { ...led, cuts: [] }, PHOTO).data;
    assert.deepEqual(owners(withCut, P[pt], day), [right], id + ': the cut gives it to the owner history names');
    assert.deepEqual(owners(without, P[pt], day), [wrong], id + ': without the cut the wrong owner stays');
    assert.ok(reviewProblems(without, led, PHOTO).some((m) => /still draws/.test(m)), id + ': the gate sees a bundle the cut was not applied to');
  }
  /* the Neman strips — the same river digitised twice — go with the Memel Territory, not stay Lithuanian slivers */
  assert.deepEqual(owners(CS, P.neman, [1939, 6, 1]), ['Germany (Prussia)']);
});

test('④ the applier: a part moves along the line, slivers of another record\'s line go with it, and it refuses what it cannot state', () => {
  const sq = (x, y, w, h = w) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  /* A is 0..10; the region is its east half drawn by another record whose line falls 0.02 short of A's eastern edge
     and so leaves a strip of A outside it, cut off from the rest */
  const d = { v: 2, rings: [sq(0, 0, 10), sq(10, 0, 5)], feats: [['A', 1, 1900, 1, 1, 1950, 12, 31, [[0]]], ['B', 2, 1900, 1, 1, 1950, 12, 31, [[1]]]] };
  const region = [[[[5, -1], [9.98, -1], [9.98, 11], [5, 11], [5, -1]]]];
  const photo = (lines) => ({ regions: { r: { of: { ohm: 1 }, lines, sources: [], geometry: region } } });
  const led = (extra = {}) => ({ units: {}, regions: { r: { of: { ohm: 1 }, is: 'x'.repeat(50) } }, cuts: [{ id: 'c', from: 1, to: 2, s: [1910, 1, 1], e: [1920, 12, 31], region: 'r', keeps: [[1, 5]], ...extra }], notes: [] });
  const out = applyReview(d, led(), photo('ohm')).data;
  const A = out.feats.find((f) => f[1] === 1 && f[2] === 1910), B = out.feats.find((f) => f[1] === 2 && f[2] === 1910);
  assert.ok(Math.abs(mpArea(geomOf(out, A)) - 50) < 1e-6, 'A keeps its west half, nothing more');
  assert.ok(Math.abs(mpArea(geomOf(out, B)) - 75) < 1e-6, 'B (25) takes the east half and the strip (50), as one polygon');
  assert.equal(B[8].length, 1);
  assert.deepEqual(out.feats.map((f) => f[0] + ' ' + f.slice(2, 5).join('-')), ['A 1900-1-1', 'A 1910-1-1', 'A 1921-1-1', 'B 1900-1-1', 'B 1910-1-1', 'B 1921-1-1']);
  assert.equal(JSON.stringify(applyReview(out, led(), photo('ohm')).data.feats), JSON.stringify(out.feats), 'idempotent');
  /* where the line is the bundle's own, a part the line separates is land, and stays */
  const own = applyReview(d, led(), photo('cshapes')).data;
  assert.ok(Math.abs(mpArea(geomOf(own, own.feats.find((f) => f[1] === 1 && f[2] === 1910))) - 50.2) < 1e-6, 'the strip stays with A');
  /* a recipient with no row must be declared; a polygon that holds no kept place and would give away less than it keeps throws */
  assert.throws(() => applyReview(d, { ...led(), cuts: [{ ...led().cuts[0], to: 99 }] }, photo('ohm')), /not declared in `units`/);
  assert.throws(() => cutPolygon([sq(0, 0, 10)], [[sq(9, -1, 2, 12)]], [9, -1, 11, 11], { lines: 'ohm', keeps: [[50, 50]], minArea: 1e-4, label: 't' }), /say which land stays/);
  /* the gate holds an `ohm` cut to name what the source keeps */
  const noKeeps = led(); delete noKeeps.cuts[0].keeps;
  assert.ok(reviewProblems(out, { ...noKeeps, cuts: noKeeps.cuts.map((c) => ({ ...c, history: 'h'.repeat(50), sources: [{ cite: 'a cited source' }] })) }, photo('ohm')).some((m) => /must name the places the source keeps/.test(m)));
});

test('⑤ the gate\'s measure agrees (scripts/hist-fidelity.mjs politiesAt, 1 July)', async () => {
  const { politiesAt } = await import('../scripts/hist-fidelity.mjs');
  const memo = new Map(), drawnBy = (y, pt) => { if (!memo.has(y)) memo.set(y, politiesAt(y)); return memo.get(y).filter((p) => p.polys.some((poly) => inPoly(poly, ...P[pt]))).map((p) => p.rec + ':' + p.nm); };
  assert.deepEqual(drawnBy(1913, 'memel'), ['cshapes:Germany (Prussia)']);
  assert.deepEqual(drawnBy(1913, 'hlucin'), ['cshapes:Germany (Prussia)']);
  assert.deepEqual(drawnBy(1921, 'memel'), ['cshapes:Memel Territory']);
  assert.deepEqual(drawnBy(1930, 'pula'), ['cshapes:Italy/Sardinia']);
  assert.deepEqual(drawnBy(1930, 'band'), ['cshapes:Southern Sakhalin Island']);
  assert.deepEqual(drawnBy(1939, 'danzig'), ['cshapes:Danzig']);
  assert.deepEqual(drawnBy(1939, 'memel'), ['cshapes:Germany (Prussia)']);
  assert.deepEqual(drawnBy(1940, 'uzhhorod'), ['cshapes:Hungary']);
  assert.deepEqual(drawnBy(1940, 'khust'), ['cshapes:Hungary']);
});

test('⑥ the page draws it and the card says why — the Memel Territory\'s name, and the notes in en and jp', async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const { repoFetch } = await import('../scripts/hist-fidelity.mjs');
  const at = (y, m, d) => { const w = new Date(0); w.setFullYear(y, m - 1, d); w.setHours(12, 0, 0, 0); return w; };
  const inG = (g, [x, y]) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((p) => inPoly(p, x, y));
  for (const lang of ['en', 'jp']) {
    const { api } = await timeBorders({ lang, fetch: repoFetch });
    const one = async (y, m, d, pt) => (await api.collectionAt(at(y, m, d))).fc.features.filter((f) => f.properties._gw != null && inG(f.geometry, P[pt]));
    const memel = await one(1921, 6, 1, 'memel');
    assert.deepEqual(memel.map((f) => f.properties.NAME), ['Memel Territory (Allies)']);
    const danzig = (await one(1939, 6, 1, 'danzig'))[0], hungary = (await one(1940, 6, 1, 'khust'))[0];
    if (lang === 'en') {
      assert.match(api.typeNote(memel[0]), /High Commissioner of the Allied Powers/);
      assert.match(api.typeNote(danzig), /annexed to Germany on 1 September 1939/);
      assert.match(api.typeNote(hungary), /First Vienna Award/);
    } else {
      assert.equal(api.eraLocName('Memel Territory (Allies)'), 'メーメル地方（連合国）');
      assert.match(api.typeNote(memel[0]), /連合国の高等弁務官/);
      assert.match(api.typeNote(danzig), /1939 年 9 月 1 日/);
      assert.match(api.typeNote(hungary), /第一次ウィーン裁定/);
    }
  }
});
