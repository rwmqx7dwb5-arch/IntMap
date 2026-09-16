/* ============================================================================
 *  #R756 · どの面の上で計算した数なのか、読み手に届いているか
 * ----------------------------------------------------------------------------
 *  An outside review of R752 said the ops do not state, per op, which surface they compute on, what
 *  range they are valid over, and what error they tolerate. Two of those three were true and are
 *  fixed here; the third is refused on purpose and the refusal is measured below.
 *
 *  ⚠ THE INVARIANTS ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *    ⑥ 「面積」 by the spherical excess and 「面積」 on an unwrapped lng/lat plane are different
 *       numbers. A reader combining two ops had NO WAY TO SEE that they disagree, because the
 *       surface lived only inside whichever kernel the op happened to call.
 *    ⑦ js/gis-crs.js has measured 「その面の外にどれだけ出ているか」 since #R752 and `measure` never
 *       asked. A UTM zone measured two zones away answered with a number and no sign at all.
 *    ⑧ js/gis-layers.js records whether what arrived is all of it, a part, or a sample — and the
 *       Atlas catalogue row published only `origin`. A planner that cannot see the difference says
 *       「世界で最も◯◯な国」 about whatever the camera was pointed at.
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
const square = (lng, lat, d) => feat(
  { type: 'Polygon', coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]] },
  { name: 'sq' });

/* ══ ⑥ どの op も、自分が計算した面を述べる ═════════════════════════════════════════════ */

test('R756 ⑥ every op states the surface it computes on, from one closed vocabulary', async () => {
  const { ops } = await boot();
  const all = ops.ops();
  assert.ok(all.length >= 24, 'the catalogue shrank: ' + all.length);

  const vocab = ops.surfaces();
  assert.ok(Array.isArray(vocab) && vocab.length > 0, 'there is no vocabulary to draw from');

  for (const d of all) {
    /* ⚠ 欄が在ることと答えが在ることは別（[[intmap-data-must-not-claim-an-author-it-lacks]]）。
       An op with no geometry in it declares the EMPTY list — that is a statement, not a blank. */
    assert.ok(Array.isArray(d.surface),
      'op ' + d.id + ' does not say which surface it computes on');
    for (const s of d.surface) {
      assert.ok(vocab.indexOf(s) >= 0,
        'op ' + d.id + ' names a surface nothing implements: ' + JSON.stringify(s));
    }
  }

  /* ⚠ 「面を持たない op が 1 つも無い」も「全部が面を持つ」も、どちらも間違った宣言で通る。
     The two kinds must BOTH be present, or the declaration is decoration. */
  const withSurface = all.filter((d) => d.surface.length > 0).map((d) => d.id);
  const without = all.filter((d) => d.surface.length === 0).map((d) => d.id);
  assert.ok(withSurface.length > 0, 'no op computes on any surface — the declaration is not being filled in');
  assert.ok(without.length > 0, 'every op claims a surface, including the attribute-only ones');

  /* The two numbers the reader can accidentally combine: one op measures on the sphere, another
     computes topology on the unwrapped degree plane. Both must be findable by asking. */
  const byId = Object.fromEntries(all.map((d) => [d.id, d.surface]));
  assert.ok(byId.measure.indexOf('sphere') >= 0, 'measure no longer states its geodesic default');
  assert.ok(byId.union.indexOf('degree-plane') >= 0, 'union no longer states the plane its clipper works on');
  assert.deepEqual(byId.compute, [], 'an attribute expression is claiming a surface');
});

/* ══ ⑦ 面の外へ出たことを、読み手に述べる ══════════════════════════════════════════════ */

test('R756 ⑦ measuring on a plane reports how far the data left that plane, instead of answering silently', async () => {
  const { data, ops } = await boot();

  /* UTM zone 54N covers 138°E–144°E. The fixture is in Portugal — about 140 degrees away, which is
     not a borderline case that a tolerance could argue about. */
  const far = data.add({ title: 'far', features: [square(-9, 38, 1)] });
  const res = await ops.run({
    op: 'measure', inputs: [far.id],
    params: { what: 'area', crs: 'EPSG:32654', unit: 'km' },
  });
  assert.equal(res.ok, true, 'measure refused: ' + JSON.stringify(res.why || res));

  /* ⚠ THE DEFECT: this was undefined — the op answered with a number and said nothing at all. */
  assert.ok(res.stats.fit, 'measure still does not report the fit of the plane it was given');
  assert.ok(res.stats.fit.outside > 0,
    'every position is 140° outside the zone and the fit reports ' + res.stats.fit.outside + ' outside');
  assert.equal(res.stats.fit.of, res.stats.total * 5, 'the fit did not walk the data it measured');
  assert.ok(res.stats.fit.beyond && res.stats.fit.beyond.west > 100,
    'the overshoot is reported as ' + JSON.stringify(res.stats.fit.beyond) + ' — it should be more than 100°');
  assert.ok(Array.isArray(res.stats.fit.sample), 'the first offending position is not shown');
  assert.equal(res.stats.surface, 'stated-plane', 'the surface of the answer is not stated');

  /* ⚠ AND THE OTHER DIRECTION. A check that only ever sees 「outside > 0」 passes over an
     implementation that reports every measurement as outside. */
  const near = data.add({ title: 'near', features: [square(139, 35, 1)] });
  const ok = await ops.run({
    op: 'measure', inputs: [near.id],
    params: { what: 'area', crs: 'EPSG:32654', unit: 'km' },
  });
  assert.equal(ok.ok, true, 'measure refused: ' + JSON.stringify(ok.why || ok));
  assert.equal(ok.stats.fit.outside, 0,
    'a square inside zone 54N is reported as ' + ok.stats.fit.outside + ' positions outside it');

  /* ⚠ IT IS REPORTED, NOT ENFORCED. The reader named the plane; refusing here would be a judgement
     this layer is not entitled to make, and a check that demanded a refusal would install one. */
  const col = Object.keys(res.dataset.features()[0].properties).find((k) => /^_area/.test(k));
  assert.ok(res.dataset.features()[0].properties[col] > 0,
    'the measurement was withheld — the plane being a poor fit is a caveat, not a refusal');

  /* No plane named: the geodesic answer, and no fit to report about a plane nobody chose. */
  const geo = await ops.run({ op: 'measure', inputs: [near.id], params: { what: 'area', unit: 'km' } });
  assert.equal(geo.ok, true, 'geodesic measure refused: ' + JSON.stringify(geo.why || geo));
  assert.equal(geo.stats.surface, 'sphere', 'the geodesic default no longer names its surface');
  assert.equal(geo.stats.fit, null, 'a fit is being reported for a plane the reader never named');
});

/* ══ ⑧ 「これは世界についての答えか」が planner に届く ═════════════════════════════════ */

test('R756 ⑧ the catalogue row carries the acquisition’s own completeness verdict, and invents none', async () => {
  const { data, ops } = await boot();
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const atlas = makeGisAtlas({ data: data, ops: ops, layers: null, draw: () => ({ ok: true }) });

  const partial = data.add({
    title: 'partial', features: [square(0, 0, 1)],
    provenance: { kind: 'layer', coverage: { completeness: 'partial', reason: 'indistinguishable-from-view', count: 12 } },
  });
  const plain = data.add({ title: 'plain', features: [square(2, 2, 1)] });

  const rows = atlas.catalogue ? atlas.catalogue() : null;
  const list = Array.isArray(rows) ? rows : (rows && rows.datasets) || null;
  assert.ok(Array.isArray(list), 'the catalogue no longer returns dataset rows: ' + JSON.stringify(rows).slice(0, 200));

  const rowOf = (id) => list.find((r) => r && r.id === id);
  const p = rowOf(partial.id);
  assert.ok(p, 'the dataset is not in the catalogue at all');
  /* ⚠ THE DEFECT: this row published only `origin`, so 「一部です」 never reached the planner. */
  assert.ok(p.coverage, 'the row does not carry the coverage the acquisition recorded');
  assert.equal(p.coverage.completeness, 'partial');
  /* `completeness` without `reason` folds 「訊けなかった」 and 「一部しか無い」 into one word. */
  assert.equal(p.coverage.reason, 'indistinguishable-from-view');

  /* ⚠ AND THE OTHER DIRECTION: a record that never measured its coverage must not acquire one here. */
  const q = rowOf(plain.id);
  assert.ok(q, 'the second dataset is not in the catalogue');
  assert.equal(q.coverage, undefined,
    'a row with no measured coverage is claiming one: ' + JSON.stringify(q.coverage));
});
