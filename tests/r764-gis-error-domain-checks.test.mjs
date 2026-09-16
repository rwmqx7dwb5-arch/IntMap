/* ============================================================================
 *  #R764 · 球面近似は、どこまでなら安心して使えるのか — 推測ではなく実測で
 * ----------------------------------------------------------------------------
 *  ⚠ THIS FILE DOES NOT CLAIM THE NUMBERS ARE WRONG. `js/gis-geometry.js` measures on a sphere of
 *  6371.0088 km and says so — docs/GIS-CORE.md §2.4 names the surface for every op, and nothing here
 *  is hidden. What was missing is the SIZE of the difference: 「どの緯度で、どの距離で、何 % ずれるのか」
 *  was never measured, so a reader deciding whether IntMap's 500 km buffer is good enough for their
 *  purpose had nothing to decide with, and neither did the next round deciding whether to pay for an
 *  ellipsoid.
 *
 *  ⚠⚠ THE REFERENCE SITS OUTSIDE THE THING MEASURED. Vincenty's inverse solution on WGS-84 is
 *  implemented here, in this file, from the published formulation — not imported from the kernel and
 *  not derived from it. A reference computed by the code under test measures nothing
 *  ([[intmap-prefilter-erred-inward-under-a-comment-saying-outward]]: the comparison has to be able
 *  to disagree). ⚠ AND THE TWO ARE ASKED THE SAME QUESTION: both answer 「この 2 点の間の最短距離」,
 *  so a difference between them is the figure of the Earth and nothing else.
 *
 *  ⚠ WHAT THE ENVELOPE IS FOR. The bound below is not a target anybody optimised towards — it is the
 *  observed spread of the sphere against the ellipsoid, which is a property of the two figures and
 *  not of this app. It is asserted so that a future change which quietly swaps the radius, the
 *  formula or the units is caught, and so that the range is written down where a reader can find it
 *  (docs/GIS-CORE.md §2.4).
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
  const geometry = makeGisGeometry();
  w.IntMapGisGeometry = geometry;
  await geometry.ready();
  return { w, geometry };
}

/* ── the reference: Vincenty inverse on WGS-84, written here from the published formulation ──────
   a = 6378137, f = 1/298.257223563. Returns km, or null where the iteration does not converge
   (near-antipodal pairs — a known limitation of this formulation, and the reason the cases below
   stop short of antipodal rather than the reason a result is accepted). */
const WGS84_A = 6378137, WGS84_F = 1 / 298.257223563;
function vincentyKm(a, b) {
  const f = WGS84_F, A = WGS84_A, B = A * (1 - f);
  const L = (b[0] - a[0]) * Math.PI / 180;
  const U1 = Math.atan((1 - f) * Math.tan(a[1] * Math.PI / 180));
  const U2 = Math.atan((1 - f) * Math.tan(b[1] * Math.PI / 180));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, lamP, it = 0, sLam, cLam, sSig, cSig, sig, sAl, c2Al, c2SigM, C;
  do {
    sLam = Math.sin(lam); cLam = Math.cos(lam);
    const t1 = cU2 * sLam, t2 = cU1 * sU2 - sU1 * cU2 * cLam;
    sSig = Math.sqrt(t1 * t1 + t2 * t2);
    if (sSig === 0) return 0;
    cSig = sU1 * sU2 + cU1 * cU2 * cLam;
    sig = Math.atan2(sSig, cSig);
    sAl = cU1 * cU2 * sLam / sSig;
    c2Al = 1 - sAl * sAl;
    c2SigM = c2Al === 0 ? 0 : cSig - 2 * sU1 * sU2 / c2Al;
    C = f / 16 * c2Al * (4 + f * (4 - 3 * c2Al));
    lamP = lam;
    lam = L + (1 - C) * f * sAl * (sig + C * sSig * (c2SigM + C * cSig * (-1 + 2 * c2SigM * c2SigM)));
  } while (Math.abs(lam - lamP) > 1e-12 && ++it < 200);
  if (it >= 200) return null;
  const u2 = c2Al * (A * A - B * B) / (B * B);
  const Acoef = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const Bcoef = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dSig = Bcoef * sSig * (c2SigM + Bcoef / 4 * (cSig * (-1 + 2 * c2SigM * c2SigM)
    - Bcoef / 6 * c2SigM * (-3 + 4 * sSig * sSig) * (-3 + 4 * c2SigM * c2SigM)));
  return B * Acoef * (sig - dSig) / 1000;
}

/* A destination on the sphere, used only to BUILD the cases — the pairs have to be at a known
   separation and bearing, and building them with the same haversine that is being measured would
   make the case set a function of the answer. Great-circle direct formula, plain trigonometry. */
function destOnSphere(lng, lat, bearingDeg, km) {
  const R = 6371.0088, d = km / R;
  const br = bearingDeg * Math.PI / 180, la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [((lo2 * 180 / Math.PI + 540) % 360) - 180, la2 * 180 / Math.PI];
}

const LATS = [0, 15, 30, 45, 60, 75, 85];
const SPANS = [1, 10, 100, 500, 1000, 5000];
const BEARINGS = [0, 45, 90, 135];

function sweep(distanceKm) {
  const rows = [];
  for (const lat of LATS) {
    for (const span of SPANS) {
      let worst = 0, worstCase = null;
      for (const br of BEARINGS) {
        const a = [0, lat], b = destOnSphere(0, lat, br, span);
        if (Math.abs(b[1]) > 89.5) continue;          /* the pole is its own subject; §2.4 refuses world-wrapping rings */
        const ref = vincentyKm(a, b);
        if (ref == null || !(ref > 0)) continue;
        const got = distanceKm(a, b);
        assert.ok(typeof got === 'number' && isFinite(got), 'kernel returned no distance at lat ' + lat);
        const relPct = Math.abs(got - ref) / ref * 100;
        if (relPct > worst) { worst = relPct; worstCase = { lat, span, br, got, ref }; }
      }
      if (worstCase) rows.push({ lat, span, worstPct: worst, c: worstCase });
    }
  }
  return rows;
}

/* ══ ① どれだけずれるのか ═══════════════════════════════════════════════════════════════════ */

test('① 球面の距離と楕円体の距離の差は、緯度と距離を通して 0.6 % を超えない', async () => {
  const { geometry } = await boot();
  const rows = sweep((a, b) => geometry.distanceKm({ type: 'Point', coordinates: a }, { type: 'Point', coordinates: b }));
  assert.ok(rows.length >= 30, '掃引が組み立てられていない: ' + rows.length);
  let worst = rows[0];
  for (const r of rows) if (r.worstPct > worst.worstPct) worst = r;
  /* ⚠ 0.6 % は誰かが目標にした数ではない。球と WGS-84 楕円体の形の差そのもので、
     このアプリの実装を変えても（半径・式・単位を取り違えない限り）動かない。 */
  assert.ok(worst.worstPct < 0.6,
    '球面近似の誤差が想定の範囲を超えた（半径・式・単位のどれかが動いた可能性）: '
    + worst.worstPct.toFixed(4) + ' % at lat ' + worst.c.lat + ', ' + worst.c.span + ' km');
  /* そして「ゼロではない」ことも測る——誤差ゼロが出たなら、参照が実装と同じものになっている */
  assert.ok(worst.worstPct > 0.01,
    '参照が実装と同じものになっている疑い（差が小さすぎる）: ' + worst.worstPct);
});

/* ⚠⚠ THIS TEST SAYS THE OPPOSITE OF WHAT IT SAID WHEN IT WAS FIRST WRITTEN, and the measurement is
   why. The guess was 「相対誤差は距離に依らない」. Swept, it is not: at the equator the worst case
   runs 0.561 % at 1 km and 0.378 % at 5,000 km, because a 5,000 km path AVERAGES over latitudes it
   passes through instead of staying where it started. What IS constant is the error at a given
   latitude AND BEARING for spans up to about 1,000 km — the sphere's error is set by WHERE you are
   and WHICH WAY you go, and only long paths smear it. The claim was corrected to the data rather
   than the envelope widened until the claim survived. */
test('① 1,000 km までなら、相対誤差は距離ではなく「どこで・どちら向きに」で決まる', async () => {
  const { geometry } = await boot();
  const d = (a, b) => geometry.distanceKm({ type: 'Point', coordinates: a }, { type: 'Point', coordinates: b });
  let worstSpread = 0, worstAt = null;
  for (const lat of LATS) {
    for (const br of BEARINGS) {
      const pcts = [];
      for (const span of [1, 10, 100, 500, 1000]) {
        const a = [0, lat], b = destOnSphere(0, lat, br, span);
        if (Math.abs(b[1]) > 89.5) continue;
        const ref = vincentyKm(a, b);
        if (ref == null || !(ref > 0)) continue;
        pcts.push(Math.abs(d(a, b) - ref) / ref * 100);
      }
      if (pcts.length < 2) continue;
      const spread = Math.max.apply(null, pcts) - Math.min.apply(null, pcts);
      if (spread > worstSpread) { worstSpread = spread; worstAt = { lat, br }; }
    }
  }
  /* 実測の最大の広がりは 0.1 ポイント未満（緯度 60 の北向きで約 0.06）。 */
  assert.ok(worstSpread < 0.1,
    '同じ緯度・同じ向きで、距離によって相対誤差が動いている: ' + worstSpread.toFixed(4)
    + ' ポイント at lat ' + (worstAt && worstAt.lat) + ', bearing ' + (worstAt && worstAt.br));
});

test('① 5,000 km の経路では、その一定性が崩れる — 測ったことだけを述べる', async () => {
  const { geometry } = await boot();
  const d = (a, b) => geometry.distanceKm({ type: 'Point', coordinates: a }, { type: 'Point', coordinates: b });
  /* 赤道を北へ: 1 km で 0.561 %、5,000 km で 0.378 %。長い経路は通過する緯度を平均するので、
     「その場所の誤差」ではなくなる。⚠ これは近似が悪化したのではなく、別の量になったということ。 */
  const near = (span) => {
    const a = [0, 0], b = destOnSphere(0, 0, 0, span);
    const ref = vincentyKm(a, b);
    return Math.abs(d(a, b) - ref) / ref * 100;
  };
  const short = near(1), long = near(5000);
  assert.ok(short > 0.5 && short < 0.6, '赤道・北向き 1 km の実測が動いた: ' + short.toFixed(4));
  assert.ok(long < short - 0.1,
    '長い経路で誤差が平均されていない（この性質が失われたなら、測り直して文書を直すこと）: '
    + short.toFixed(4) + ' → ' + long.toFixed(4));
});

test('① 都市の規模（10 km）では、ずれは 100 m を下回る', async () => {
  const { geometry } = await boot();
  let worstM = 0;
  for (const lat of LATS) {
    for (const br of BEARINGS) {
      const a = [0, lat], b = destOnSphere(0, lat, br, 10);
      const ref = vincentyKm(a, b);
      if (ref == null) continue;
      const got = geometry.distanceKm({ type: 'Point', coordinates: a }, { type: 'Point', coordinates: b });
      worstM = Math.max(worstM, Math.abs(got - ref) * 1000);
    }
  }
  /* 「この距離で使ってよいか」に、読者が答えられる形の数 */
  assert.ok(worstM < 100, '10 km で ' + worstM.toFixed(1) + ' m ずれている');
});

/* ══ ② 述べていることと、していることが合っているか ═══════════════════════════════════════ */

test('② 距離は 1 つの半径から出ている — 2 つ目の地球を持たない', async () => {
  const { w } = await boot();
  const R = w.IntMapGeodesy && w.IntMapGeodesy._R_EARTH_KM;
  assert.equal(typeof R, 'number');
  /* 実装が持つ半径はこの 1 つで、上の掃引の参照（WGS-84 の a と f）とは別物であること。
     同じ数だったなら、この file は何も測っていない。 */
  assert.notEqual(R * 1000, WGS84_A);
  const src = read('js/gis-geometry.js');
  assert.ok(!/6371/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    'js/gis-geometry.js が半径を自分で書いている（js/geodesy.js の 1 か所から来るはず）');
});

test('② 文書が、測った範囲をそのまま述べている', () => {
  const doc = read('docs/GIS-CORE.md');
  assert.ok(/0\.6\s*%/.test(doc), 'docs/GIS-CORE.md に実測した誤差の範囲が書かれていない');
  assert.ok(/Vincenty/i.test(doc), '何と比べて測ったのかが文書に無い');
});
