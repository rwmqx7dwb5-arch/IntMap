/* ============================================================================
 *  #R783 · 数は出た。どこまで信頼できるかは、読み手に届いていなかった
 * ----------------------------------------------------------------------------
 *  js/gis-crs.js grew `certify()` this round — the envelope of an area and a length against WGS 84,
 *  measured over the reader's OWN data — and js/gis-ops.js was the module that had written, in prose
 *  above its surface vocabulary, that no such measurement exists. The invariants below are the
 *  defects, not the fixes ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *    ① The paragraph above SURFACES said 「許容誤差はここでは宣言しない／そのような測定は今日存在
 *       しない」. The second half became false the moment certify() landed, and a comment that
 *       contradicts the code below it is #R764's defect.
 *    ② `measure` called assess() and never certify(), so a column of Web-Mercator areas at 60°N
 *       travelled with its distortion scale and NOT with the envelope a reader with a requirement
 *       has to compare against.
 *    ③ A caller could not state a requirement at all, so every condition answered with a number
 *       (the shape #R783 removed one level down, in the kernel).
 *    ④ areaOnGround / lengthOnGround existed and were reachable only from the kernel: the one
 *       surface with no projection in it could not be asked for through an op.
 *
 *  ⚠ NO ERROR FIGURE IS WRITTEN IN THIS FILE. Every number compared here is asked of js/gis-crs.js
 *  through a door of its own, because a fixture that restated the envelope would be measuring the
 *  fixture ([[intmap-co-designed-reader-cannot-falsify]]).
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

async function boot() {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisCrs } = await import('../js/gis-crs.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const crs = makeGisCrs();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisCrs = crs; w.IntMapGisOps = ops;
  await geometry.ready();
  if (crs && typeof crs.ready === 'function') await crs.ready();
  return { w, data, geometry, crs, ops };
}

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
/* 60°N, where the plane below is at its worst and the ground is the only road */
const SQUARE = { type: 'Polygon', coordinates: [[[10, 59], [11, 59], [11, 61], [10, 61], [10, 59]]] };
const LINE = { type: 'LineString', coordinates: [[10, 59], [11, 60], [12, 61]] };

const areaBox = (data) => data.add({ title: 'box', features: [feat(SQUARE, { name: 'box' })] });
const lineBox = (data) => data.add({ title: 'line', features: [feat(LINE, { name: 'line' })] });
const featuresOf = (data, rec) => data.get(rec.id).features();
/* an op registers its answer as a dataset — a refusal registers nothing, which ③ measures */
const rows = (data, res) => data.get(res.dataset.id).features();

/* ══ ① 註が、そのすぐ下のコードと逆のことを述べていた ══════════════════════════════════════ */

test('R783 ① the paragraph above SURFACES no longer says the measurement does not exist', () => {
  const src = read('js/gis-ops.js');
  const at = src.indexOf('const SURFACES = [');
  assert.ok(at > 0, 'the surface vocabulary is gone from js/gis-ops.js');
  const para = src.slice(Math.max(0, at - 3000), at);

  /* THE DEFECT: the file stated, as a fact, that nothing had measured this. */
  assert.ok(!/IS NOT DECLARED HERE, and that is deliberate/.test(para),
    'the paragraph still declares that no tolerance is stated here');
  assert.ok(!/no\s+such measurement exists for these ops today/.test(para),
    'the paragraph still says the measurement does not exist — certify() exists');

  /* …and it says where the envelope comes from instead, by name. */
  assert.ok(/certify\(\)/.test(para), 'the paragraph does not name the measurement that now exists');
  assert.ok(/stats\.fit/.test(para), 'the paragraph does not say where a reader receives it');
  assert.ok(/tolerance/.test(para), 'the paragraph does not say what a caller may state');

  /* ⚠ AND THE VOCABULARY IS NOT A COPY. The ground's spelling belongs to js/gis-crs.js. */
  const line = src.slice(at, src.indexOf('\n', at));
  assert.ok(!/ellipsoid/.test(line),
    'the ground surface is typed into this file instead of being derived: ' + line);
});

/* ══ ② 包絡が、数と同じ答えの中で読み手に届く ═══════════════════════════════════════════════ */

test('R783 ② measure hands back the certificate the crs kernel measured, not a second opinion', async () => {
  const { data, crs, ops } = await boot();
  const rec = areaBox(data);
  const res = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', crs: 'EPSG:3857', unit: 'km' } });
  assert.equal(res.ok, true, 'measure refused: ' + JSON.stringify(res.why || res));

  const fit = res.stats.fit;
  assert.ok(fit, 'measure reports no fit at all');
  /* THE DEFECT: these three were undefined — the column said how much the plane distorts and not
     how far off the number can be. */
  assert.ok(fit.bound, 'the answer carries no envelope');
  assert.ok(fit.checked, 'the answer does not say what the reference actually came out as');
  assert.ok(fit.within, 'the answer does not say whether the check fell inside the envelope');

  const P = crs.projection('EPSG:3857');
  const cert = crs.certify(P, featuresOf(data, rec));
  assert.ok(cert, 'the kernel cannot certify the plane the op just measured on');
  const same = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(same(fit.bound), same(cert.bound), 'the op carries a different envelope than the kernel measured');
  assert.deepEqual(same(fit.checked), same(cert.checked), 'the op carries a different check than the kernel ran');
  assert.deepEqual(same(fit.within), same(cert.within), 'the op carries a different verdict than the kernel reached');
});

/* ══ ③ 述べた要求を満たせないとき、数を返さず、満たせる面を名指す ══════════════════════════ */

test('R783 ③ a stated tolerance the plane cannot meet returns no number and names the surfaces that can', async () => {
  const { data, ops } = await boot();
  const rec = areaBox(data);
  const res = await ops.run({
    op: 'measure', inputs: [rec.id],
    params: { what: 'area', crs: 'EPSG:3857', unit: 'km', tolerance: 0.001 },
  });
  assert.equal(res.ok, false, 'a plane that is hundreds of percent off met a 0.1% requirement');
  assert.equal(res.why, 'crs-accuracy-outside-tolerance');
  assert.equal(res.dataset, undefined, 'a refusal registered a dataset anyway — the numbers were returned');
  assert.equal(res.detail.tolerance, 0.001);
  assert.ok(res.detail.worst > 0.001, 'the refusal does not say how far off it is');

  const alts = res.detail.alternatives;
  assert.ok(Array.isArray(alts) && alts.length > 0,
    '「信頼できない」 was answered without saying where the reader CAN measure');

  /* ⚠ 辿れることを、信じずに測る ([[intmap-contract-is-not-implementation]]). */
  let ground = 0;
  for (const alt of alts) {
    assert.ok(alt.worst <= 0.001, alt.surface + ' is offered and declares ' + alt.worst);
    if (alt.surface !== 'ellipsoid') continue;
    ground++;
    const road = await ops.run({
      op: 'measure', inputs: [rec.id],
      params: { what: 'area', surface: 'ellipsoid', unit: 'km', tolerance: 0.001 },
    });
    assert.equal(road.ok, true, 'the road the refusal offered does not run from the op: ' + JSON.stringify(road.why || road));
    assert.ok(rows(data, road)[0].properties._areaKm2 > 0, 'the road ran and produced no number');
  }
  assert.equal(ground, 1, 'the one surface with no projection in it was not offered as a road');

  /* a requirement that is not a number is a mistake in the call, and is refused as one */
  for (const bad of ['x', 0, -1]) {
    const r = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', crs: 'EPSG:3857', tolerance: bad } });
    assert.equal(r.ok, false, 'tolerance ' + JSON.stringify(bad) + ' was accepted');
    assert.equal(r.why, 'bad-param');
    assert.equal(r.detail.param, 'tolerance');
  }
});

test('R783 ③b the sphere is held to a stated tolerance too, and says where to go instead', async () => {
  const { data, ops } = await boot();
  const rec = areaBox(data);
  /* tighter than any surface here but the ground */
  const hard = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', unit: 'km', tolerance: 1e-9 } });
  assert.equal(hard.ok, false, 'the sphere met a 1e-9 requirement');
  assert.equal(hard.why, 'crs-accuracy-outside-tolerance');
  assert.equal(hard.detail.surface, 'sphere');
  const named = (hard.detail.alternatives || []).map((a) => a.surface);
  assert.ok(named.indexOf('ellipsoid') >= 0, 'the ground was not named: ' + JSON.stringify(named));

  /* and a requirement it CAN meet is answered with the number it always gave */
  const bare = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', unit: 'km' } });
  const loose = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', unit: 'km', tolerance: 0.5 } });
  assert.equal(loose.ok, true, 'a generous tolerance refused anyway: ' + JSON.stringify(loose.why || loose));
  assert.equal(rows(data, loose)[0].properties._areaKm2, rows(data, bare)[0].properties._areaKm2,
    'stating a tolerance moved the value');
});

/* ══ ④ 述べなければ、1 ビットも変わらない ══════════════════════════════════════════════════ */

test('R783 ④ a call that states no tolerance and no surface is unchanged, to the bit', async () => {
  const { data, crs, ops } = await boot();
  const rec = areaBox(data);

  /* the default: the geodesic answer this layer has always given, which is its OWN arithmetic */
  const bare = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', unit: 'km' } });
  assert.equal(bare.ok, true, 'the default measure refused: ' + JSON.stringify(bare.why || bare));
  assert.equal(rows(data, bare)[0].properties._areaKm2, ops.areaKm2(SQUARE), 'the geodesic default moved');
  assert.equal(bare.stats.surface, 'sphere');
  assert.equal(bare.stats.plane, 'geodesic');
  assert.equal(bare.stats.fit, null, 'a fit was invented for a run with no plane in it');
  assert.deepEqual(Object.keys(rows(data, bare)[0].properties), ['name', '_areaKm2'],
    'a column appeared for a caller who asked for nothing');

  /* on a plane: the value is the kernel's own, untouched, and no certificate is attached to the row */
  const P = crs.projection('EPSG:3857');
  const onPlane = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', crs: 'EPSG:3857', unit: 'km' } });
  assert.equal(rows(data, onPlane)[0].properties._areaKm2, crs.areaOn(P, SQUARE, { unit: 'km2' }).value,
    'the plane measurement moved');
  assert.deepEqual(Object.keys(rows(data, onPlane)[0].properties), ['name', '_areaKm2', '_areaKm2ScaleMin', '_areaKm2ScaleMax'],
    'the row gained a column that was not asked for');
  /* the fit's existing fields are still the ones assess() measured */
  const a = crs.assess(P, featuresOf(data, rec));
  assert.equal(onPlane.stats.fit.outside, a.outside);
  assert.equal(onPlane.stats.fit.of, a.total);
  assert.deepEqual(onPlane.stats.fit.areaScale, a.areaScale);
  assert.equal(onPlane.stats.tolerance, undefined, 'a tolerance was reported for a caller who stated none');
});

/* ══ ⑤ 面そのものを選べる — 地面が op から届く ═════════════════════════════════════════════ */

test('R783 ⑤ the ellipsoid can be named from the op, and its answer IS areaOnGround / lengthOnGround', async () => {
  const { data, crs, ops } = await boot();
  const aRec = areaBox(data), lRec = lineBox(data);

  const area = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', surface: 'ellipsoid', unit: 'km' } });
  assert.equal(area.ok, true, 'the ground cannot be asked for: ' + JSON.stringify(area.why || area));
  assert.equal(area.stats.surface, 'ellipsoid');
  assert.equal(rows(data, area)[0].properties._areaKm2, crs.areaOnGround(SQUARE, { unit: 'km2' }).value,
    'the op walked its own arithmetic instead of the kernel ground door');
  /* …and it is a DIFFERENT number from the sphere, or the choice would be decoration */
  const sph = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', unit: 'km' } });
  assert.notEqual(rows(data, area)[0].properties._areaKm2, rows(data, sph)[0].properties._areaKm2,
    'the ellipsoid and the sphere answered identically — one of them is not being used');

  const len = await ops.run({ op: 'measure', inputs: [lRec.id], params: { what: 'length', surface: 'ellipsoid', unit: 'km' } });
  assert.equal(len.ok, true, 'a length on the ground was refused: ' + JSON.stringify(len.why || len));
  assert.equal(rows(data, len)[0].properties._lengthKm, crs.lengthOnGround(LINE, { unit: 'km' }).value);

  /* the ground has no plane in it, so naming both is a mistake in the call rather than a silent choice */
  const both = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', surface: 'ellipsoid', crs: 'EPSG:3857' } });
  assert.equal(both.ok, false, 'a plane was accepted beside a surface that has none');
  assert.equal(both.why, 'bad-param');

  /* and 'stated-plane' without a plane is the same kind of mistake, named on the parameter that is missing */
  const noPlane = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', surface: 'stated-plane' } });
  assert.equal(noPlane.ok, false, 'a plane surface was measured with no plane');
  assert.equal(noPlane.detail.param, 'crs');

  const unknown = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', surface: 'degree-grid' } });
  assert.equal(unknown.ok, false, 'measure accepted a surface it does not measure on');
  assert.equal(unknown.detail.param, 'surface');
  assert.ok(unknown.detail.values.indexOf('ellipsoid') >= 0, 'the refusal does not say what CAN be named');
});

/* ══ ⑥ 語彙は導出されている — 写しではない ════════════════════════════════════════════════ */

test('R783 ⑥ the surface vocabulary is the crs kernel names unioned with this layer own four', async () => {
  const { crs, ops } = await boot();
  const vocab = ops.surfaces();
  const measurable = crs.surfaces()
    .filter((s) => s.measures.indexOf('area') >= 0 && s.measures.indexOf('length') >= 0)
    .map((s) => s.name);
  assert.ok(measurable.length >= 3, 'the kernel publishes fewer surfaces than it measures on');
  for (const n of measurable) {
    assert.ok(vocab.indexOf(n) >= 0, 'a surface the kernel can measure on is missing from the vocabulary: ' + n);
  }
  const decl = ops.op('measure').surface;
  for (const n of measurable) {
    assert.ok(decl.indexOf(n) >= 0, 'measure does not declare the surface it can compute on: ' + n);
  }
  assert.deepEqual(ops.ops().find((d) => d.id === 'measure').surface, decl,
    'the catalogue and the single declaration disagree about the surfaces');
  const p = ops.op('measure').params.find((x) => x.name === 'surface');
  assert.ok(p, 'the surface cannot be stated at all');
  assert.equal(p.required, false, 'the surface became required — every old recipe would refuse');

  /* ⚠ 答えが変わるなら版が上がる（scripts/gis-kernel-versions.mjs が読み手）: a recipe that states a
     tolerance replays to a refusal where ops-7 produced a number. */
  /* ⚠ (#R819) THE VERSION IS READ FROM THE LEDGER, NOT WRITTEN HERE. This line held the literal
     'ops-8' and failed the first time a later round raised the kernel for its own honest reason —
     a test that copies a number becomes a second owner of it, and the copy is always the one that
     is wrong. scripts/gis-kernel-versions.mjs is the READER of these versions and the keeper of the
     hash beside them, so it is what this asks. The fact being measured is unchanged: the kernel and
     the ledger agree about which engine computed an answer. */
  const { KERNELS } = await import(new URL('../scripts/gis-kernel-versions.mjs', import.meta.url));
  assert.equal(ops.version(), KERNELS['js/gis-ops.js'].version,
    'the ops kernel and scripts/gis-kernel-versions.mjs disagree about which version computed an answer');
});
