/* ============================================================================
 *  #R564 · 「歴史的地方区分境界のcoverageがまだ全然。もっと充実させろ。また、現在のものは海上に
 *            境界線がないのに、昔のはある。それにクリック時の挙動が違う。全部同じにしろ。」
 * ----------------------------------------------------------------------------
 *  Three claims, and each of them is measured here rather than spelled:
 *    ① the record is drawn to the DEPTH it actually has, on both sides of the clock, and the deeper
 *       tier is not paid for at a scale where it is not drawn;
 *    ② the era subdivision line is a BORDER line, not a polygon outline — the coastline copy that
 *       #R531 removed from the country line is gone from this one too;
 *    ③ an era label answers with the ERA polygon, so a 1900 click is not answered with a 2026 shape.
 *
 *  ⚠ WHY EVALUATION AND NOT SPELLING (#R505/#R488). Every one of these could be written as a regex
 *  over the source and every one of them would then pass on a file that had stopped doing the thing:
 *  a zoom gate that reads the wrong variable still MENTIONS the constant, a line layer pointed back
 *  at the polygon source still MENTIONS the line source, and a mark lookup keyed on the wrong set
 *  still MENTIONS the key. So the functions are lifted and RUN.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { buildWater } from '../scripts/bordercoast/water.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const bundle = (file, global) => { const w = {}; new Function('window', rd('data/' + file))(w); return w[global]; };

const TA = codeOnly(rd('js/time-admin1.js'));
const MU = codeOnly(rd('js/map-ui.js'));
const DL = codeOnly(rd('js/data-layers.js'));
const BCD = bundle('border-coast.js', '__IMBCOAST');
const A1 = bundle('hist-admin1.js', '__HISTADM1');
const A2 = bundle('hist-admin2.js', '__HISTADM2');

const closed = (r) => { const n = r.length; return (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) ? r : r.concat([r[0]]); };
const KM_PER_DEG = 110.574;
const edgeKm = (a, b) => { const kx = KM_PER_DEG * Math.cos((a[1] + b[1]) * 0.5 * Math.PI / 360);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * KM_PER_DEG); };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const liveAt = (d, y) => { const t = ymd(y, 6, 15); const out = [];
  d.feats.forEach((f, i) => { if (ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) >= t) out.push(i); }); return out; };

/* ── ① the deeper tier is a real record, in the shape the module reads ─────────────────────────── */
test('① data/hist-admin2.js is the same ring-pooled shape, at the levels it claims', () => {
  assert.ok(Array.isArray(A2.rings) && A2.rings.length > 1000, 'no ring pool');
  assert.ok(Array.isArray(A2.feats) && A2.feats.length > 5000, 'the deeper tier is smaller than the first one');
  assert.deepEqual(A2.levels, [5, 6], 'the deeper bundle does not declare which levels it holds');
  assert.deepEqual(A1.levels, [3, 4], 'the first tier does not declare which levels it holds');
  assert.equal(A2.since, A1.since, 'the two tiers start at different dates — one clock, one floor');
  let bad = 0;
  for (const f of A2.feats) {
    if (!(ymd(f[2], f[3], f[4]) <= ymd(f[5], f[6], f[7]))) bad++;
    for (const poly of f[8]) for (const ri of poly) if (!A2.rings[ri]) bad++;
  }
  assert.equal(bad, 0, bad + ' records have a backwards span or an unresolvable ring');
  /* the point of the tier: it is DEEPER, not wider. If it ever stops being several times the size of
     the first level, something has quietly turned it into a second copy of it. */
  assert.ok(liveAt(A2, 1900).length > 4 * liveAt(A1, 1900).length,
    'the deeper tier holds ' + liveAt(A2, 1900).length + ' units in 1900 against the first tier’s ' + liveAt(A1, 1900).length);
});

/* ── ② every bundle that gets STROKED is marked ────────────────────────────────────────────────── */
test('② every set js/time-admin1.js strokes has marks in data/border-coast.js', () => {
  /* the set keys are read out of the module's own tier configuration rather than typed here, so a
     third tier added without marks fails this instead of shipping an unmeasured coastline copy. */
  const keys = [...TA.matchAll(/set:\s*'([a-z0-9]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 2, 'no tier declares a mark set — the module has stopped naming them');
  for (const k of keys) {
    assert.ok(BCD.sets[k], 'data/border-coast.js has no marks for the set ' + k);
  }
  assert.equal(BCD.sets.ha.rings, A1.rings.length, 'ha: the marks and the bundle disagree');
  assert.equal(BCD.sets.ha2.rings, A2.rings.length, 'ha2: the marks and the bundle disagree');
});

/* ── ③ the era subdivision line is not in the sea ──────────────────────────────────────────────── */
test('③ almost none of the drawn subdivision length lies over water', () => {
  /* the same question #R531 asked of the country line, asked of the province line — and the same
     answer shape, because a line over water is sometimes RIGHT (a boundary down a strait), so the
     claim is «under 1% of what is drawn», not «zero». */
  const W = buildWater(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'coastline.json.gz')))));
  const marks = BCD.sets.ha.draw;
  let total = 0, sea = 0;
  for (const ix of liveAt(A1, 1900)) {
    for (const poly of A1.feats[ix][8]) for (const ri of poly) {
      const V = closed(A1.rings[ri]), m = marks[ri];
      if (m === 0) continue;
      for (let i = 0; i < V.length - 1; i++) {
        if (m !== 1 && !(Array.isArray(m) && m.some(([a, b]) => i >= a && i < b))) continue;
        const km = edgeKm(V[i], V[i + 1]); total += km;
        const mid = [(V[i][0] + V[i + 1][0]) / 2, (V[i][1] + V[i + 1][1]) / 2];
        if (W.inlandKm(mid[0], mid[1], 5) < -2) sea += km;
      }
    }
  }
  assert.ok(total > 1e5, 'only ' + Math.round(total) + ' km of subdivision line is drawn at all — the marks have eaten the boundaries');
  const pct = 100 * sea / total;
  assert.ok(pct < 1, pct.toFixed(2) + '% of the drawn subdivision length is over water (' + Math.round(sea) + ' of ' + Math.round(total) + ' km)');
});

/* ── ④ the line layers stroke the LINE source ─────────────────────────────────────────────────── */
test('④ imta-line / imta2-line stroke the border runs, and the polygons stay for the label and the click', () => {
  const ensure = liftFunction(TA, 'ensure');
  assert.ok(ensure.includes("id: cfg.line, type: 'line', source: cfg.lnSrc"),
    'the line layer is reading the polygon source again — the coastline copy is back');
  assert.ok(ensure.includes('id: cfg.lbl, type: \'symbol\', source: cfg.src'),
    'the label has been moved off the polygon source, so it has nothing to anchor to');
  /* both sources are created, and both are credited: the reader sees a line, and the line has an
     author. (#R531 ⑤'s rule, for the subdivisions.) */
  for (const s of ['cfg.src', 'cfg.lnSrc']) assert.ok(ensure.includes('addSource(' + s), s + ' is never added');
  assert.ok((ensure.match(/attribution: 'OpenHistoricalMap \(CC0\)'/g) || []).length === 2,
    'one of the two sources the reader sees credits nobody');
});

/* ── ⑤ the deeper tier is not fetched at a scale where it is not drawn ─────────────────────────── */
test('⑤ _deep() asks the camera before it asks for 10 MB', () => {
  /* EVALUATED. A structural read of this function would pass on one that fetched unconditionally and
     merely mentioned the constant. */
  const src = liftFunction(TA, '_deep') + '\n' + liftFunction(TA, '_zoom');
  const calls = [];
  const mk = (z, act, when) => {
    const sandbox = {
      DEEP_Z: 6, active: act, lastWhen: when,
      T2: { go: (w) => calls.push(['go', z, w]), clear: () => calls.push(['clear', z]) },
      GE: () => ({ camera: { getZoom: () => z } }),
    };
    vm.createContext(sandbox);
    vm.runInContext(src + '\n_deep();', sandbox);
  };
  const D = new Date(1900, 5, 15);
  mk(3, true, D); mk(5, true, D); mk(6, true, D); mk(9, true, D); mk(8, false, null);
  const went = calls.filter((c) => c[0] === 'go').map((c) => c[1]);
  assert.deepEqual(went, [6, 9], 'the deeper tier was fetched at ' + JSON.stringify(went) + ' — it must be z6 and up, and only while travelling');
  assert.ok(calls.some((c) => c[0] === 'clear' && c[1] === 8), 'leaving the past does not clear the deeper tier');
});

test('⑤ the deeper bundle is not on the boot path and is not warmed', () => {
  assert.ok(!/hist-admin2\.js/.test(rd('index.html')), 'data/hist-admin2.js is on the boot path');
  assert.ok(!/hist-admin2\.js/.test(rd('src/main.js')), 'data/hist-admin2.js is imported by the shell');
  const warm = liftFunction(TA, 'warm');
  assert.ok(warm.includes('T1.load()') && !warm.includes('T2.load()'),
    'the idle warm-up fetches the deeper tier — 10 MB speculatively, for a tier that is not drawn yet');
});

/* ── ⑥ the two lists of layer ids agree ───────────────────────────────────────────────────────── */
test('⑥ every layer the province row paints is in the layer audit’s list', () => {
  const line = (DL.match(/'cb-admin1':\s*\[([^\]]*)\]/) || [])[1];
  assert.ok(line, 'js/data-layers.js no longer lists the province row’s layers');
  const listed = [...line.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
  /* the module's own ids, read from its tier configuration and its modern-tier layer */
  const own = [...TA.matchAll(/line:\s*'([a-z0-9-]+)'/g)].map((m) => m[1])
    .concat([...TA.matchAll(/id:\s*'(ref-admin\d)'/g)].map((m) => m[1]))
    .concat(TA.includes("has('ref-admin1')") ? ['ref-admin1'] : []);
  for (const id of [...new Set(own)].sort()) {
    assert.ok(listed.includes(id), id + ' is painted by the province row but the layer audit does not know about it — a travelling map reads as «checked but blank»');
  }
});

/* ── ⑦ the click is answered with the era polygon ─────────────────────────────────────────────── */
test('⑦ _eraGeom answers for the era labels and for nothing else', () => {
  const src = liftFunction(MU, '_eraGeom');
  const asked = [];
  const sandbox = { window: { IntMapTimeAdmin1: { geomAt: (p) => { asked.push(p); return { type: 'Polygon', coordinates: [] }; } } } };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nvar EG=_eraGeom;', sandbox);
  const f = (id, props) => ({ layer: { id }, properties: props });
  assert.equal(sandbox.EG(f('ofm-admin1', { name: 'x' })), null, 'the present-day label must keep asking IntMapOutline by name');
  assert.equal(sandbox.EG(f('ofm-city', { name: 'x' })), null, 'a city label is not a subdivision');
  assert.ok(sandbox.EG(f('imta-lbl', { _ix: 3, _tier: 'a1' })), 'the era label is answered with nothing');
  assert.ok(sandbox.EG(f('imta2-lbl', { _ix: 3, _tier: 'a2' })), 'the deeper era label is answered with nothing');
  assert.deepEqual(asked.map((p) => p._tier), ['a1', 'a2'], 'the tier the feature came from is not passed on');
});

test('⑦ the popup is handed that polygon, on the per-layer click AND on the padded tap', () => {
  /* two doors into the same popup (#R210): a fix applied to one of them is half a fix. */
  assert.ok(MU.includes('const eg=_eraGeom(f);'), 'the per-layer click no longer asks for the era polygon');
  assert.ok(MU.includes('const peg=_eraGeom(near[0]);'), 'the padded tap no longer asks for the era polygon');
  /* ⚠ (#R668) …AND WHAT THEY HAND OVER, WHICH IS THE HALF THIS TEST NEARLY MISSED. _eraGeom now
     returns { geo, refine } — the coarse shape to draw at once and the promise of upstream's own
     geometry — and the per-layer door was updated while the padded one went on passing the WRAPPER as
     `geojson`. Measured: IntMapOutline's `/Polygon/.test(type)` is then false, so a tap near an era
     label fell back to today's namesake, which is the exact defect #R564 exists to remove, alive again
     on one of the two doors. Pinning the old spelling could not see it (it failed for the spelling, not
     for the defect), so both doors are asked the same question: do you pass the SHAPE, and the refine? */
  for (const [door, expr] of [['per-layer click', 'geojson:eg.geo,refine:eg.refine'],
                              ['padded tap', 'geojson:peg.geo,refine:peg.refine']]) {
    assert.ok(MU.includes(expr), 'the ' + door + ' does not hand the era polygon (and its refinement) to the popup');
  }
  assert.ok(/return\s*\{\s*geo,\s*refine:/.test(MU), '_eraGeom must return both halves for either door to pass them');
  /* and the era label is a place label in every list, at both tiers */
  const lbls = (MU.match(/const PLACE_LBL=\[([^\]]*)\]/) || [])[1] || '';
  for (const id of ['imta-lbl', 'imta2-lbl']) assert.ok(lbls.includes(id), id + ' is not a place label — a tap on it does nothing');
});

/* ── ⑧ the tiers do not share the memos that are keyed by feature index ────────────────────────── */
test('⑧ the per-bundle memos live inside the tier, not beside it', () => {
  /* index 12 is a different province in each bundle. A module-level `_geom` keyed by index would
     hand the first tier's polygon to the second one — visible as a province drawn in the wrong
     place, and invisible to every check that reads spelling. */
  const mk = liftFunction(TA, 'makeTier');
  for (const decl of ['const _geom = new Map()', 'let _bnd = null', 'const cache = new Map()']) {
    assert.ok(mk.includes(decl), decl + ' is not inside makeTier — the two tiers would share it');
  }
  const outside = TA.slice(0, TA.indexOf('function makeTier'));
  for (const decl of ['const _geom', 'let _bnd']) {
    assert.ok(!outside.includes(decl), decl + ' also exists at module scope — one of the two is dead or both tiers share it');
  }
});
