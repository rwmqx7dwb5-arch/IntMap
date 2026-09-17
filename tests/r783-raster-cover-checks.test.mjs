/* ============================================================================
 *  #R783 · 画素の被覆は、標本ではなく証明で決まる (the pixel's cover, proved rather than sampled)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE SHORTCUT ASSERTED A PROOF IT DID NOT HAVE. js/gis-raster.js's `coverOf` read
 *
 *        if (inside === 4 && centreIn && !hasHole(geometry)) return 1;
 *
 *  — four corners and the centre in the zone, no hole anywhere ⇒ the pixel is WHOLLY inside. That is
 *  true of a convex zone and false of every concave one, because a slot can be cut in past all five
 *  probes. MEASURED before the fix, on a 1°×1° pixel against a zone with a slot 0.2° wide and 0.4°
 *  deep cut in from above (all four corners and the centre inside):
 *
 *        reported weight  1
 *        the sphere       0.9200038992201667      (= 1 − 0.2·(sin1° − sin0.6°) / (sin1° − sin0°))
 *        the clipper      0.9200038992201675
 *
 *  ⚠ AND MORE PROBES WOULD NOT HAVE HELPED: for any finite set of sample points a concave zone can be
 *  given a slot that misses every one of them. So the fix is not a denser sample — it is a question
 *  with a yes-or-no answer (「この画素の近くに区域の辺はあるか」) whose NO is a proof that the whole
 *  rectangle lies on one side of the zone's boundary, the centre then saying which side.
 *  What it cannot prove goes down the intersection road, which is exact.
 *
 *  ⚠ WHAT THE EXPECTED NUMBERS BELOW ARE. Every zone in this file is built out of axis-aligned boxes,
 *  and the ground of such a box on a sphere is proportional to Δλ·(sinφ₂ − sinφ₁) — so each expected
 *  weight is written here as that arithmetic and NOT copied out of a run of `coverOf`, nor asked of
 *  the clipper that `coverOf` itself asks. Two readers designed together cannot falsify each other
 *  ([[intmap-co-designed-reader-cannot-falsify]]).
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function boot(opts) {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisUnits } = await import('../js/gis-units.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), raster = makeGisRaster(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisRaster = raster; w.IntMapGisOps = ops;
  /* ⚠ 単位のカーネルは「在るとき」と「無いとき」の両方が測られる（⑫）——判断はあちらが持っている
     ので、無い build は 「してよい」 ではなく 「訊けなかった」 を答えなければならない。 */
  const units = (opts && opts.noUnits) ? null : makeGisUnits();
  if (units) w.IntMapGisUnits = units; else { try { delete w.IntMapGisUnits; } catch (_) { w.IntMapGisUnits = null; } }
  await geometry.ready();
  return { w, data, geometry, raster, ops, units };
}

/* ── the sphere, asked directly ────────────────────────────────────────────────────────────────
   The ground of the box [w,e]×[s,n] is R²·Δλ·(sinφ₂ − sinφ₁) up to the one constant that cancels in
   every ratio below, so `share` is that quantity without the constant. */
const SIN = (d) => Math.sin(d * Math.PI / 180);
const share = (w, s, e, n) => (e - w) * (SIN(n) - SIN(s));
const PIXEL = share(0, 0, 1, 1);                    /* the one pixel every zone below is measured on */

/* One pixel spanning lng 0→1, lat 0→1, so a weight IS a ratio of two boxes. `west` is a parameter
   because ⑧ writes the same pixel a whole turn away; `band` because ⑩–⑫ give the band a declared
   quantity and the weight tests give it none. */
function onePixel(value, west, band) {
  const cells = Float64Array.from([value]);
  return {
    kind: 'raster', title: 'g', width: 1, height: 1,
    grid: { west: (west == null) ? 0 : west, north: 1, pixelLng: 1, pixelLat: 1 },
    bands: [band || { name: 'v', unit: null, nodata: null }],
    read: () => cells,
  };
}

const boxRing = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
/* the same zone written `by` degrees east — used by ⑧ to put the two frames a whole turn apart */
const shift = (g, by) => ({
  type: g.type,
  coordinates: (g.type === 'Polygon')
    ? g.coordinates.map((r) => r.map((p) => [p[0] + by, p[1]]))
    : g.coordinates.map((part) => part.map((r) => r.map((p) => [p[0] + by, p[1]]))),
});

/* The weight the kernel reports for the single pixel, as a ratio of its own ground. */
async function weightOf(zone, opts) {
  const { data, raster, ops } = (opts && opts.boot) || await boot();
  const g = data.add(onePixel(10, opts && opts.west));
  const r = await raster.zonal(g, 0, zone, { boundary: 'fractional', areaOf: ops.areaKm2 });
  assert.equal(r.ok, true, 'zonal が断った: ' + r.why);
  const whole = await raster.pixelAreaKm2(g, 0);
  return r.areaKm2 / whole.km2;
}

const CLOSE = 1e-9;
const near = (got, want, what) => assert.ok(Math.abs(got - want) < CLOSE,
  what + ': got ' + got + ', want ' + want + ' (差 ' + Math.abs(got - want) + ')');

/* ══ ① 細い切り込み — 出荷されていた欠陥そのもの ═══════════════════════════════════════════════
   A zone that overhangs the pixel on every side, with a slot 0.2° wide cut down from above to
   lat 0.6. All four corners (0,0) (1,0) (1,1) (0,1) and the centre (0.5,0.5) are inside it. */
const SLOT_ZONE = {
  type: 'Polygon',
  coordinates: [[[-0.5, -0.5], [1.5, -0.5], [1.5, 1.5], [0.6, 1.5], [0.6, 0.6], [0.4, 0.6], [0.4, 1.5], [-0.5, 1.5], [-0.5, -0.5]]],
};

test('① 上から入る細い切り込み — 四隅と中心が全部区域内でも、被覆は 1 ではない', async () => {
  const B = await boot();
  /* まず近道の前提が本当に成り立っていることを測る（成り立たないなら、この検査は別の話をしている） */
  for (const p of [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]) {
    assert.equal(B.geometry.pointInGeometry(p, SLOT_ZONE), true, '前提が崩れている: ' + JSON.stringify(p) + ' が区域外');
  }
  const want = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;     /* ≈ 0.9200038992201667 */
  near(await weightOf(SLOT_ZONE, { boot: B }), want, '切り込みの分が引かれていない');
});

test('① 切り込みの分は、面積・積分・面積加重平均のすべてに効く', async () => {
  const { data, raster, ops } = await boot();
  const g = data.add(onePixel(10));
  const r = await raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: ops.areaKm2, classes: true });
  const whole = await raster.pixelAreaKm2(g, 0);
  const want = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;
  near(r.areaKm2 / whole.km2, want, '区域の面積');
  near(r.sumTimesAreaKm2 / (10 * whole.km2), want, '面積積分');
  near(r.classAreasKm2['10'] / whole.km2, want, '土地被覆の面積');
  /* ⚠ count と sum は画素を 1 つとして数える（#R764 の判断は動かさない） */
  assert.equal(r.count, 1, '画素の数が重みで割られている');
  assert.equal(r.sum, 10, '観測値の合計が重みで割られている');
  near(r.mean, 10, '1 画素の面積加重平均は値そのもの');
});

/* ══ ② 湾状の凹部 ═══════════════════════════════════════════════════════════════════════════════
   Not a slit but a bay, entering from the west and 0.2° tall — again with every probe inside. */
test('② 横から入る湾状の凹部も引かれる', async () => {
  const bay = {
    type: 'Polygon',
    coordinates: [[[-0.5, -0.5], [1.5, -0.5], [1.5, 1.5], [-0.5, 1.5], [-0.5, 0.4], [0.3, 0.4], [0.3, 0.2], [-0.5, 0.2], [-0.5, -0.5]]],
  };
  const B = await boot();
  for (const p of [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]) {
    assert.equal(B.geometry.pointInGeometry(p, bay), true, '前提が崩れている: ' + JSON.stringify(p));
  }
  const want = 1 - share(0, 0.2, 0.3, 0.4) / PIXEL;
  near(await weightOf(bay, { boot: B }), want, '湾の分が引かれていない');
});

/* ══ ③ 狭い区域 ═════════════════════════════════════════════════════════════════════════════════
   Narrower than the pixel, and touching no corner — the case the corners never decided either. */
test('③ 画素より狭い区域が真ん中を通る — 隅に触れないが被覆は 0 ではない', async () => {
  near(await weightOf({ type: 'Polygon', coordinates: [boxRing(0.3, -1, 0.5, 2)] }), 0.2, '真ん中を通る帯');
});

test('③ 中心を外れた狭い帯も、その幅ぶん数えられる', async () => {
  near(await weightOf({ type: 'Polygon', coordinates: [boxRing(0.05, -1, 0.15, 2)] }), 0.1, '中心を外れた帯');
});

test('③ 画素から完全に離れた区域は 0（近道が「証明できた」と言い出さない）', async () => {
  const r = await weightOf({ type: 'Polygon', coordinates: [boxRing(5, 5, 6, 6)] });
  assert.equal(r, 0, '離れた区域が数えられた: ' + r);
});

/* ══ ④ 穴 ═══════════════════════════════════════════════════════════════════════════════════════ */
test('④ 画素の中にまるごと入る穴は引かれる（どの標本点にも当たらない）', async () => {
  const zone = { type: 'Polygon', coordinates: [boxRing(-0.5, -0.5, 1.5, 1.5), boxRing(0.3, 0.3, 0.5, 0.6)] };
  const want = 1 - share(0.3, 0.3, 0.5, 0.6) / PIXEL;
  near(await weightOf(zone), want, '穴の分が引かれていない');
});

test('④ 遠くの穴は、この画素の被覆を減らさない — 穴があること自体は理由にならない', async () => {
  const zone = { type: 'Polygon', coordinates: [boxRing(-0.5, -0.5, 1.5, 1.5), boxRing(1.2, 1.2, 1.4, 1.4)] };
  const w = await weightOf(zone);
  assert.equal(w, 1, '穴が画素の外にあるのに削られた: ' + w);
});

/* ══ ⑤ 複数パート ═══════════════════════════════════════════════════════════════════════════════ */
test('⑤ 複数パートは足し合わされる（どのパートも画素を丸ごと覆っていない）', async () => {
  const zone = {
    type: 'MultiPolygon',
    coordinates: [[boxRing(-0.5, -0.5, 0.2, 1.5)], [boxRing(0.5, -0.5, 0.8, 1.5)]],
  };
  near(await weightOf(zone), 0.2 + 0.3, '2 つのパートの和になっていない');
});

test('⑤ 1 つのパートが画素を丸ごと覆い、もう 1 つが遠くにある場合は 1', async () => {
  const zone = {
    type: 'MultiPolygon',
    coordinates: [[boxRing(-0.5, -0.5, 1.5, 1.5)], [boxRing(40, 40, 41, 41)]],
  };
  const w = await weightOf(zone);
  assert.equal(w, 1, '丸ごと覆われているのに削られた: ' + w);
});

test('⑤ 切り込みのあるパートと、離れたパートが同居していても切り込みは引かれる', async () => {
  const slot = SLOT_ZONE.coordinates[0];
  const zone = { type: 'MultiPolygon', coordinates: [[slot], [boxRing(40, 40, 41, 41)]] };
  const want = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;
  near(await weightOf(zone), want, '複数パートだと切り込みが見えていない');
});

/* ══ ⑥ 回帰 — 凸な四角形は前と同じ数 ═══════════════════════════════════════════════════════════ */
test('⑥ 凸な四角形の被覆は変わらない（#R764 の 0.4 はそのまま）', async () => {
  near(await weightOf({ type: 'Polygon', coordinates: [boxRing(0, 0, 0.4, 1)] }), 0.4, '端の画素');
  near(await weightOf({ type: 'Polygon', coordinates: [boxRing(0, 0.25, 1, 0.75)] }),
    share(0, 0.25, 1, 0.75) / PIXEL, '緯度で切った画素');
});

test('⑥ 画素を丸ごと含む凸な区域は、ぴったり 1（内部の画素は削られない）', async () => {
  const w = await weightOf({ type: 'Polygon', coordinates: [boxRing(-1, -1, 2, 2)] });
  assert.equal(w, 1, '内部の画素が削られた: ' + w);
});

test('⑥ center と allTouched は #R764 のまま — この修正は fractional の数だけを直す', async () => {
  const { data, raster } = await boot();
  const g = data.add(onePixel(10));
  const half = { type: 'Polygon', coordinates: [boxRing(0, 0, 0.4, 1)] };
  const c = await raster.zonal(g, 0, half, {});                             /* 既定 */
  assert.deepEqual({ ok: c.ok, boundary: c.boundary, count: c.count, area: c.areaKm2 },
    { ok: true, boundary: 'center', count: 0, area: 0 }, '既定の center が動いた');
  const a = await raster.zonal(g, 0, SLOT_ZONE, { boundary: 'allTouched' });
  const whole = await raster.pixelAreaKm2(g, 0);
  assert.equal(a.count, 1, 'allTouched が触れた画素を落とした');
  near(a.areaKm2, whole.km2, 'allTouched は丸ごと数える規則のまま');
});

/* ══ ⑦ 近道は「証明」であって「省略」ではない ═══════════════════════════════════════════════════
   The point of the boundary question is that the interior pixel still costs no clipper call. That is
   measured by counting the calls, because a shortcut that quietly stopped firing would leave every
   number in this file correct and the walk 10× slower. */
function counting(geometry) {
  const n = { intersection: 0 };
  const wrapped = Object.assign(Object.create(null), geometry, {
    attempt: Object.assign(Object.create(null), geometry.attempt, {
      intersection: (a, b) => { n.intersection++; return geometry.attempt.intersection(a, b); },
    }),
  });
  return { wrapped, n };
}

test('⑦ 丸ごと内部の画素は clipper を 1 度も呼ばない（近道は生きている）', async () => {
  const { w, data, geometry, raster, ops } = await boot();
  const { wrapped, n } = counting(geometry);
  w.IntMapGisGeometry = wrapped;
  const g = data.add(onePixel(10));
  const r = await raster.zonal(g, 0, { type: 'Polygon', coordinates: [boxRing(-1, -1, 2, 2)] },
    { boundary: 'fractional', areaOf: ops.areaKm2 });
  assert.equal(r.ok, true, r.why);
  assert.equal(n.intersection, 0, '内部の画素で交差計算が走った（近道が死んでいる）');
});

test('⑦ 切り込みのある画素は clipper を呼ぶ（証明できないものを証明したと言わない）', async () => {
  const { w, data, geometry, raster, ops } = await boot();
  const { wrapped, n } = counting(geometry);
  w.IntMapGisGeometry = wrapped;
  const g = data.add(onePixel(10));
  const r = await raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: ops.areaKm2 });
  assert.equal(r.ok, true, r.why);
  assert.ok(n.intersection >= 1, '切り込みのある画素が交差計算なしで決められた');
});

/* ══ ⑧ 経度の枠が 1 周ずれていても、証明は証明のままでなければならない ═════════════════════════
   A grid written 200…201 and the same zone written −160…−159 are the same ground. The geometry
   kernel shifts a part by whole turns before it tests a point, and a pixel's longitudes come from
   the grid exactly as the producer wrote them, so the boundary question has to be asked across every
   turn — otherwise 「辺は遠い」 would be answered about the wrong copy of the world and the #R783
   defect would come back through the seam.
   ⚠ MEASURED 2026-09-17, AND IT IS NOT THIS FILE'S KERNEL: for two geometries written a whole turn
   apart the boolean road comes back EMPTY — js/gis-geometry.js's `alignTo` is handed a MULTI by
   `boolOpR` while its `lonRange` reads that multi as a list of rings, so it computes no range and
   shifts nothing (`intersection(pixel@200…201, box@−161…−158)` → null; the same pair written in one
   frame → the expected box). So the notched zone's weight cannot be checked against the sphere here
   yet. What CAN be checked, and is what this fix owns, is that the notch is never reported as WHOLE:
   the shortcut must refuse to prove an interior it cannot prove, whichever frame the zone arrived
   in. This assertion stays true once the kernel aligns multis as well. */
test('⑧ 1 周ずれた枠でも、切り込みのある画素を「丸ごと」と言わない', async () => {
  const w = await weightOf(shift(SLOT_ZONE, -160), { west: 200 });
  assert.ok(w < 1, '1 周ずれた枠で切り込みが丸ごと扱いになった: ' + w);
  const want = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;
  assert.ok(w === 0 || Math.abs(w - want) < CLOSE,
    '0（上流が枠を揃えられない）でも ' + want + '（揃えられた）でもない値が出た: ' + w);
});

test('⑧ 1 周ずれた枠で画素を丸ごと覆う区域は 1 — 辺は「どの周でも」遠いので証明できる', async () => {
  const whole = await weightOf({ type: 'Polygon', coordinates: [boxRing(-161, -1, -158, 2)] }, { west: 200 });
  assert.equal(whole, 1, '1 周ずれた枠で内部の画素が削られた: ' + whole);
});

/* ══ ⑨ 画素が何枚もある区域 — 歩き全体が直った重みを運ぶ ═══════════════════════════════════════
   Four pixels in one row (so one row's ground answers for all four), with a slot cut into the
   second one only. The expected total is the four weights computed from the sphere above. */
test('⑨ 複数画素の走査でも、切り込みのある画素だけが減る', async () => {
  const { data, raster, ops } = await boot();
  const cells = Float64Array.from([1, 1, 1, 1]);
  const g = data.add({
    kind: 'raster', title: 'g', width: 4, height: 1,
    grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v', unit: null, nodata: null }], read: () => cells,
  });
  /* 区域は 4 画素すべてを覆い、2 枚目（lng 1→2）にだけ幅 0.2°・奥行き 0.4° の切り込みを持つ */
  const zone = {
    type: 'Polygon',
    coordinates: [[[-0.5, -0.5], [4.5, -0.5], [4.5, 1.5], [1.6, 1.5], [1.6, 0.6], [1.4, 0.6], [1.4, 1.5], [-0.5, 1.5], [-0.5, -0.5]]],
  };
  const r = await raster.zonal(g, 0, zone, { boundary: 'fractional', areaOf: ops.areaKm2 });
  assert.equal(r.ok, true, r.why);
  const whole = await raster.pixelAreaKm2(g, 0);
  const want = 4 - share(1.4, 0.6, 1.6, 1) / PIXEL;      /* 3 枚は 1、1 枚だけ切り込みぶん欠ける */
  near(r.areaKm2 / whole.km2, want, '4 画素の合計');
  assert.equal(r.count, 4, '画素の数が重みで割られている');
});

/* ============================================================================
 *  ⑩⑪⑫ · 「合計」は 3 つある — どれを出したのかは量の意味が決める（監査 §4.2 / §9）
 * ----------------------------------------------------------------------------
 *  One field called 「合計」 over a grid of unknown meaning is three different numbers wearing one
 *  name: Σ value（観測値の合計）, Σ value·km²（密度の面積積分）, Σ value·cover（画素総量の区域内
 *  配分）. They agree only when every pixel is whole and every cell has the same ground, which is
 *  true of no real zone on a sphere.
 *
 *  ⚠ WHAT IS MEASURED HERE IS NOT A NEW MEANING FOR AN OLD FIELD. `sum`, `sumTimesAreaKm2`, `mean`
 *  and the rest answer exactly what they answered before, and ⑫ measures that a caller who chooses
 *  nothing cannot even tell the choice exists. What is added is the ASKING — and the answer to it
 *  carries the unit kernel's verdict, because the judgement 「その集計をしてよいか」 belongs to
 *  js/gis-units.js and a second copy of it here would be a second rule.
 *
 *  ⚠⚠⚠ AND AN UNDECLARED QUANTITY IS NOT A PERMISSION. 「誰も述べていない」 must come back as a
 *  named refusal with NO number — never as a complete-looking total nobody vouched for.
 * ==========================================================================*/

const DENSITY = { kind: 'density', unit: '1/km2' };          /* space は kind から perArea */
const AMOUNT = { kind: 'amount', space: 'total', unit: 'kg' };
const AMOUNT_NO_SPACE = { kind: 'amount', unit: 'kg' };      /* 読めるが、空間の意味は未申告 */
const RATIO = { kind: 'ratio' };

/* the same notched zone as ①, so the cover weight in play is the one the sphere gives */
const NOTCH_WEIGHT = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;

async function totalOf(rule, quantity, opts) {
  const B = (opts && opts.boot) || await boot();
  const band = { name: 'v', unit: 'kg', nodata: null };
  if (opts && opts.onBand) band.quantity = quantity;
  const g = B.data.add(onePixel(10, null, band));
  const r = await B.raster.zonal(g, 0, SLOT_ZONE, {
    boundary: (opts && opts.boundary) || 'fractional', areaOf: B.ops.areaKm2,
    total: rule, quantity: (opts && opts.onBand) ? null : quantity,
  });
  assert.equal(r.ok, true, 'zonal が断った: ' + r.why);
  const whole = await B.raster.pixelAreaKm2(g, 0);
  return { r: r, total: r.total, pixelKm2: whole.km2 };
}

/* ══ ⑩ 密度 — 足せるのは面積を掛けたあと ═══════════════════════════════════════════════════════ */

test('⑩ 密度の面積積分は許される（値は Σ value·km²、球面から独立に確かめられる）', async () => {
  const { total, pixelKm2 } = await totalOf('areaIntegral', DENSITY);
  assert.equal(total.rule, 'areaIntegral');
  assert.equal(total.verdict, 'allowed', '断られた: ' + total.why + ' ' + JSON.stringify(total.units));
  assert.equal(total.timesAreaKm2, true, '面積を掛けたことが答えに残っていない');
  near(total.value / (10 * pixelKm2), NOTCH_WEIGHT, '積分が切り込みぶんを含んでいる／欠いている');
  /* 判断は単位カーネルのもの——その語がそのまま運ばれていること */
  assert.equal(total.units.remedy, 'multiply-by-area-then-sum', '単位カーネルの処方が運ばれていない');
});

test('⑩ 密度をそのまま足すことは断られ、代わりに何が効くかが名前で返る', async () => {
  for (const rule of ['observations', 'apportioned']) {
    const { total } = await totalOf(rule, DENSITY);
    assert.equal(total.verdict, 'refused', rule + ' が通った');
    assert.equal(total.value, null, rule + ' が数を出した（断りに数が付いている）');
    assert.deepEqual(total.fits, ['areaIntegral'], rule + ' の代替が名前で返っていない: ' + JSON.stringify(total.fits));
    assert.equal(total.why, 'total-rule-does-not-fit-the-quantity');
  }
});

/* ══ ⑪ 画素ごとの総量 — 観測値の合計と、区域内への配分 ═══════════════════════════════════════ */

test('⑪ 観測値の合計は Σ value（画素は 1 つとして数えられる）', async () => {
  const { total, r } = await totalOf('observations', AMOUNT);
  assert.equal(total.verdict, 'allowed', total.why);
  assert.equal(total.value, 10, '観測値の合計が重みで割られた');
  assert.equal(total.value, r.sum, '既存の sum と別の数になった');
  assert.equal(total.timesAreaKm2, false);
});

test('⑪ 区域内配分は Σ value·被覆 — 境界の画素の総量が両隣に丸ごと渡らない', async () => {
  const { total } = await totalOf('apportioned', AMOUNT);
  assert.equal(total.verdict, 'allowed', total.why);
  near(total.value, 10 * NOTCH_WEIGHT, '配分が被覆を取っていない');
});

test('⑪ center では画素が割られないので、配分は観測値の合計と一致する', async () => {
  const a = await totalOf('apportioned', AMOUNT, { boundary: 'center' });
  const b = await totalOf('observations', AMOUNT, { boundary: 'center' });
  assert.equal(a.total.value, b.total.value, 'center で 2 つの規則が違う数を出した');
  assert.equal(a.total.value, 10);
});

test('⑪ 画素ごとの総量に面積を掛けて足すことは断られる（面積を二重に数えている）', async () => {
  const { total } = await totalOf('areaIntegral', AMOUNT);
  assert.equal(total.verdict, 'refused');
  assert.equal(total.value, null);
  assert.deepEqual(total.fits.slice().sort(), ['apportioned', 'observations'], '代替が名前で返っていない: ' + JSON.stringify(total.fits));
});

test('⑪ どの規則も意味を持たない量（割合）は、3 つとも断られる', async () => {
  for (const rule of ['observations', 'areaIntegral', 'apportioned']) {
    const { total } = await totalOf(rule, RATIO);
    assert.equal(total.verdict, 'refused', rule + ' が割合を合計した');
    assert.equal(total.value, null);
    assert.deepEqual(total.fits, [], rule + ': 合う規則が無いのに候補が返った');
    assert.equal(total.units.remedy, 'weightedMean', '単位カーネルの処方（分母で重み付け）が運ばれていない');
  }
});

/* ══ ⑫ 未申告は許可ではない／既存の答えは 1 ビットも動かない ═════════════════════════════════ */

test('⑫ 量が未申告なら、規則の名前だけが返り数は返らない', async () => {
  for (const spec of [null, AMOUNT_NO_SPACE]) {
    for (const rule of ['observations', 'areaIntegral', 'apportioned']) {
      const { total } = await totalOf(rule, spec);
      assert.equal(total.verdict, 'undeclared', rule + ': 未申告が「してよい」と読み替えられた');
      assert.equal(total.value, null, rule + ': 未申告の量に数が出た');
      assert.equal(total.rule, rule, '何を頼まれたのかが答えに残っていない');
      assert.ok(total.why === 'quantity-undeclared' || total.why === 'quantity-space-undeclared',
        '未申告の理由が名前になっていない: ' + total.why);
    }
  }
});

test('⑫ 単位カーネルが無い build は「訊けなかった」と答える（「してよい」ではない）', async () => {
  const B = await boot({ noUnits: true });
  const g = B.data.add(onePixel(10));
  const r = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2, total: 'observations', quantity: AMOUNT });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.total.verdict, 'unavailable', '単位カーネル無しで合計が許された: ' + JSON.stringify(r.total));
  assert.equal(r.total.value, null);
  assert.equal(r.total.why, 'units-unavailable');
});

/* ⚠ MEASURED 2026-09-17: a record built by js/gis-datasets.js `add()` rebuilds each band as exactly
   {name, unit, nodata}, so a quantity declared ON THE BAND does not survive that door yet — for a
   dataset-backed grid only the CALLER can declare one today. That is a gap in the supply side and not
   in this rule, so the band road is measured here on a raster object that carries its own bands (the
   shape `zonal` validates and accepts), and the gap is stated rather than asserted: this test must
   not turn green-into-red the day the datasets kernel starts carrying the declaration. */
test('⑫ 量の申告は帯からも呼び手からも読まれ、どちらが述べたかが答えに残る', async () => {
  const B0 = await boot();
  const declaring = {
    kind: 'raster', title: 'g', width: 1, height: 1,
    grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v', unit: 'kg', nodata: null, quantity: AMOUNT }],
    read: () => Float64Array.from([10]),
  };
  const onBand = await B0.raster.zonal(declaring, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B0.ops.areaKm2, total: 'observations' });
  assert.equal(onBand.ok, true, onBand.why);
  assert.equal(onBand.total.quantityFrom, 'band', '帯の申告が読まれていない');
  assert.equal(onBand.total.verdict, 'allowed', onBand.total.why);
  const byCaller = await totalOf('observations', AMOUNT);
  assert.equal(byCaller.total.quantityFrom, 'caller', '呼び手の申告が読まれていない');
  /* 呼び手が述べたものが帯の申告より強い（この呼び出しについて述べているのは呼び手） */
  const B = await boot();
  const g = B.data.add(onePixel(10, null, { name: 'v', unit: 'kg', nodata: null, quantity: DENSITY }));
  const r = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2, total: 'observations', quantity: AMOUNT });
  assert.equal(r.total.quantityFrom, 'caller');
  assert.equal(r.total.verdict, 'allowed', '呼び手の申告が帯の申告に負けた: ' + r.total.why);
});

test('⑫ 知らない規則は語彙を添えて断られる（黙って合計しない）', async () => {
  const B = await boot();
  const g = B.data.add(onePixel(10));
  const r = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2, total: 'grandTotal' });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'total-rule-unknown');
  assert.deepEqual(r.detail.rules.slice().sort(), ['apportioned', 'areaIntegral', 'observations']);
});

test('⑫ 規則を選ばなかった呼び出しの答えは、1 ビットも動かず total の欄も生えない', async () => {
  const B = await boot();
  const g = B.data.add(onePixel(10, null, { name: 'v', unit: 'kg', nodata: null, quantity: AMOUNT }));
  const bare = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2 });
  const asked = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2, total: 'apportioned' });
  assert.equal(Object.prototype.hasOwnProperty.call(bare, 'total'), false, '頼んでいない欄が生えた');
  for (const k of ['ok', 'boundary', 'count', 'nodataCount', 'sum', 'sumTimesAreaKm2', 'mean', 'min', 'max', 'areaKm2', 'valueAreaKm2']) {
    assert.deepEqual(bare[k], asked[k], k + ' が規則を頼んだだけで変わった');
  }
  assert.deepEqual(Object.keys(asked).filter((k) => !Object.prototype.hasOwnProperty.call(bare, k)), ['total'],
    '増えた欄が total だけではない');
  /* そして既存の 2 つの欄は #R764 の意味のまま — 一方は画素ごと、他方は面積積分 */
  assert.equal(bare.sum, 10, 'sum の意味が動いた');
  near(bare.sumTimesAreaKm2, 10 * (await B.raster.pixelAreaKm2(g, 0)).km2 * NOTCH_WEIGHT, 'sumTimesAreaKm2 の意味が動いた');
});
