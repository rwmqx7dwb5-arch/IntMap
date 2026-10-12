/* ============================================================================
 *  war-faction — «what will a reader see» on a war layer at a point on a day
 * ----------------------------------------------------------------------------
 *  The country under the point (CShapes 2.0, the record the layer colours), its base side on that day
 *  (data/wars.json `control`), and the fronts that cut it, read the way js/war-fronts.js reads them —
 *  then the layer's own geometry decides which side of a line the point is on (js/war-geom.js
 *  `factionAt`). One reading for every test that asks it (history-wars, ww2-tour).
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WarGeom } from '../../js/war-geom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = (p) => readFileSync(join(ROOT, p), 'utf8');

export const wars = JSON.parse(raw('data/wars.json'));
const csText = raw('data/cshapes.js');
export const CS = JSON.parse(csText.slice(csText.indexOf('=') + 1).replace(/;\s*$/, ''));
export const dnum = (d) => { const p = String(d).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
export const polysOf = (f) => f[8].map((poly) => poly.map((ri) => CS.rings[ri]));
export const war = (id) => wars.wars.find((w) => w.id === id);

/* the fronts that cut one CShapes polity on one day, read the way js/war-fronts.js reads them */
export const cutsFor = (w, gw, d) => {
  const out = [];
  for (const F of w.fronts) {
    if (F.until && d >= F.until) continue;
    let cur = null;
    for (const D of F.dates) { if (D.d <= d) cur = D; }
    if (!cur || cur.cuts.indexOf(gw) < 0) continue;
    out.push({ pts: cur.pts, left: cur.left || F.left, right: cur.right || F.right });
  }
  return out;
};

/* the CShapes row in force on day `d` that contains `pt` (null when none does) */
export function countryAt(d, pt) {
  const t = dnum(d);
  for (const f of CS.feats) {
    if (f[2] * 10000 + f[3] * 100 + f[4] > t || f[5] * 10000 + f[6] * 100 + f[7] < t) continue;
    if (WarGeom.pointInPolys(pt, polysOf(f))) return f;
  }
  return null;
}

/* the side a reader sees at `pt` on day `d` of war `id`: the piece of the fill that contains the point — js/war-geom.js
   `factionAt`, which looks the point up in the pieces `warPieces` draws (war-fill-nearest-front). */
export function faction(id, d, pt) {
  const w = war(id);
  const hit = countryAt(d, pt);
  assert.ok(hit, `${d}: no country contains ${pt}`);
  let base = 'NEUTRAL';
  const tl = w.control[hit[1]];
  if (tl) for (const [dd, k] of tl) { if (dd <= d) base = k; }
  return WarGeom.factionAt(pt, polysOf(hit), base, cutsFor(w, hit[1], d));
}
