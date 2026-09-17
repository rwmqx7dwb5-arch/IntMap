/* ============================================================================
 *  #R774 · 日付変更線を跨ぐ面について、内外判定と面積が同じ形を意味する
 * ----------------------------------------------------------------------------
 *  ⚠ MEASURED ON THE SHIPPED BUILD (2026-09-17, commit 5d5f9312). One polygon, 179°E → 179°W,
 *  0°–1° — an undivided band two degrees wide across the antimeridian:
 *      ops.pointInPolygon([180, 0.5])  → true      （幅 2° の帯として読んだ）
 *      ops.pointInPolygon([0,   0.5])  → false
 *      ops.areaKm2(...)                → 4,426,211 km²   （経度差 358° として読んだ）
 *      同じ緯度の、継ぎ目にかからない幅 2° の帯 → 24,727 km²
 *  比は 179 倍。⚠ 二つの読み方がひとつの多角形にあり、読者はどちらにも出会えた。
 *  ⚠ js/gis-crs.js areaOn（`measure` が CRS を名指したときの平面路）は同じ環を
 *  `plane-seam-crossed` で拒んでいる。答えてしまっていたのは測地路だけだった。
 *
 *  ⚠⚠⚠ AND THE OTHER READING HAD TO SURVIVE. js/gis-ops.js の註が守っていたのは
 *  IntMapGeodesy.diskFillPolys の極の円盤で、89.9999° 線に沿って閉じる 360° の辺を持つ。
 *  各辺を「短い方」へ正規化するとその辺が消え、環は極を 1 周したものとして読まれ、
 *  面積は補集合になる（実測 89°N の 500 km buffer が 785,022 km² ではなく 509,280,824 km²）。
 *  ⇒ だから下の検査は「継ぎ目が直ったこと」と「極が動いていないこと」を同じ本数で測る。
 *  ⚠ 期待値は測る対象の外から取る: 極と赤道の円盤は同じ 500 km の円なので、
 *  互いが互いの参照になる（[[intmap-co-designed-reader-cannot-falsify]]）。
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const geometry = makeGisGeometry();
  w.IntMapGisGeometry = geometry;
  const ops = makeGisOps();
  w.IntMapGisOps = ops;
  await geometry.ready();
  return { w, ops, geometry };
}

const P = (rings) => ({ type: 'Polygon', coordinates: rings });
const band = (w, e, s, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
/* 継ぎ目を跨ぐ、分割されていない帯。GeoJSON はこれを書ける。 */
const SEAM_BAND = [[[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]];
/* 同じ緯度・同じ経度幅の、継ぎ目にかからない帯。 */
const PLAIN_BAND = [band(10, 12, 0, 1)];

const REL = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));

/* ══ ① 面積が、内外判定と同じ形を意味する ═══════════════════════════════════════════════════ */

test('① 継ぎ目を跨ぐ幅 2° の帯は、同じ緯度の幅 2° の帯と同じ面積', async () => {
  const { ops } = await boot();
  const seam = ops.areaKm2(P(SEAM_BAND));
  const plain = ops.areaKm2(P(PLAIN_BAND));
  assert.ok(REL(seam, plain) < 1e-9, '継ぎ目の帯が ' + seam.toFixed(1) + ' km²、同じ帯が ' + plain.toFixed(1) + ' km²');
  /* 出荷されていた値。これを踏まないことが、この検査の理由そのもの。 */
  assert.ok(seam < 1e5, '出荷時の 4,426,211 km² のままである: ' + seam);
});

test('① 面積が示す帯と、内外判定が示す帯が同じ（二つの読み方が残っていない）', async () => {
  const { ops } = await boot();
  assert.equal(ops.pointInPolygon([180, 0.5], P(SEAM_BAND)), true, '継ぎ目の上の点が外と判定された');
  assert.equal(ops.pointInPolygon([0, 0.5], P(SEAM_BAND)), false, '地球の反対側が内と判定された');
  /* 内外が「幅 2°」と言うなら、面積も 2° ぶんでなければならない。反対側まで含む読み方なら
     358/2 = 179 倍になる——出荷時はそれだった。 */
  const ratio = ops.areaKm2(P(SEAM_BAND)) / ops.areaKm2(P(PLAIN_BAND));
  assert.ok(ratio < 1.000001, '面積と内外が別の形を意味している（比 ' + ratio.toFixed(1) + '）');
});

test('① 穴も同じ規則で読まれる — 継ぎ目を跨ぐ穴が外側から引かれる', async () => {
  const { ops } = await boot();
  const outer = [[178, 0], [-178, 0], [-178, 4], [178, 4], [178, 0]];
  const hole = [[179, 1], [-179, 1], [-179, 2], [179, 2], [179, 1]];
  const withHole = ops.areaKm2(P([outer, hole]));
  const solid = ops.areaKm2(P([outer]));
  const holeAlone = ops.areaKm2(P([hole]));
  assert.ok(withHole < solid, '穴が引かれていない');
  assert.ok(REL(solid - holeAlone, withHole) < 1e-9, '穴の面積が外側と別の規則で読まれている');
  assert.ok(withHole < 2e5, '出荷時の 13,167,667 km² のままである: ' + withHole);
});

test('① MultiPolygon の各面が独立に読まれる', async () => {
  const { ops } = await boot();
  const multi = { type: 'MultiPolygon', coordinates: [SEAM_BAND, PLAIN_BAND] };
  const sum = ops.areaKm2(P(SEAM_BAND)) + ops.areaKm2(P(PLAIN_BAND));
  assert.ok(REL(ops.areaKm2(multi), sum) < 1e-12);
});

/* ══ ② 極は動いていない — 註が守っていた読み方はそのまま ═══════════════════════════════════ */

test('② 極の円盤は、赤道の同じ円盤と同じ面積のまま（補集合になっていない）', async () => {
  const { w, ops } = await boot();
  const G = w.IntMapGeodesy;
  const areaOfDisk = (centre) => G.diskFillPolys(centre, 500, 96).reduce((a, poly) => a + ops.areaKm2(P(poly)), 0);
  const polar = areaOfDisk([0, 89]);
  const equator = areaOfDisk([139.7, 35.7]);
  /* 同じ半径の円なので、片方がもう片方の参照になる。球面上の 500 km 円は π r² に近い。 */
  assert.ok(REL(polar, equator) < 0.01, '極の円盤 ' + polar.toFixed(0) + ' km² と平地の円盤 ' + equator.toFixed(0) + ' km² が一致しない');
  assert.ok(REL(polar, Math.PI * 500 * 500) < 0.02, '極の円盤が 785,000 km² 付近にない: ' + polar);
  /* 出荷前に一度測られている壊れ方（補集合）。 */
  assert.ok(polar < 1e7, '極の円盤が補集合として読まれた: ' + polar);
});

test('② 継ぎ目の上の円盤も、平地の円盤と同じ面積のまま', async () => {
  const { w, ops } = await boot();
  const G = w.IntMapGeodesy;
  const areaOfDisk = (centre) => G.diskFillPolys(centre, 500, 96).reduce((a, poly) => a + ops.areaKm2(P(poly)), 0);
  assert.ok(REL(areaOfDisk([179.8, 0]), areaOfDisk([0, 0])) < 1e-9, '分割済みの継ぎ目の円盤が動いた');
});

/* ══ ③ 規則が、どの辺が何であるかに付いている ═══════════════════════════════════════════════ */

test('③ 継ぎ目にかからない環は 1 バイトも触られない（正規化は跨いだ環だけに効く）', async () => {
  const { ops } = await boot();
  /* 経度幅が 180° を超える、しかし継ぎ目を跨がない環（どの辺も 180° 未満）。 */
  const wide = [[-170, 0], [-60, 0], [60, 0], [170, 0], [170, 5], [60, 5], [-60, 5], [-170, 5], [-170, 0]];
  const a = ops.areaKm2(P([wide]));
  assert.ok(a > 1e7, '幅 340° の帯が小さく読まれた: ' + a);
  /* 同じ帯を 2 つに割ったものと一致する（分割は答えを変えない）。 */
  const halves = ops.areaKm2(P([band(-170, 0, 0, 5)])) + ops.areaKm2(P([band(0, 170, 0, 5)]));
  assert.ok(REL(a, halves) < 1e-9, '分割したかどうかで答えが変わる: ' + a + ' / ' + halves);
});

test('③ 幾何カーネルが載っていなければ、跨いだ環は null — 持っていない巻き直しで測ったとは言わない', async () => {
  const { w, ops } = await boot();
  delete w.IntMapGisGeometry;
  assert.equal(ops.areaKm2(P(SEAM_BAND)), null, '巻き直しが無いのに数を返した');
  assert.ok(ops.areaKm2(P(PLAIN_BAND)) > 0, '跨いでいない環まで測れなくなった');
});

/* ══ ④ 巻き直しの正本はひとつ ════════════════════════════════════════════════════════════════ */

test('④ 面積は js/gis-geometry.js の unwrapRing を呼ぶ — 2 つ目の巻き直しを持たない', async () => {
  const src = read('js/gis-ops.js');
  assert.ok(/unwrapRing/.test(src), 'js/gis-ops.js が幾何カーネルの巻き直しを呼んでいない');
  /* 自前の 360 巻き直しループ（while (… > 180) … ± 360）がこのファイルに生えていないこと。
     生えた瞬間に、内外判定と面積はまた別々の規則を持つ。 */
  assert.equal(/while\s*\([^)]*>\s*180\s*\)/.test(src), false, 'js/gis-ops.js に 2 つ目の巻き直しが書かれている');
});
