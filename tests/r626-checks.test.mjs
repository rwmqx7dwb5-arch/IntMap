/* ============================================================================
 *  IntMap · #R626 — the frame a polity is shown in must contain that polity
 * ----------------------------------------------------------------------------
 *  #R588's production verification measured this: choosing France took the camera to 2.99 °W /
 *  18.53 °N at z3 — the Atlantic off West Africa, with not one constituency on screen. The entry
 *  in js/layer-home.js framed the EXTENT OF WHAT IS DRAWN, and France's 559 constituencies include
 *  Réunion (55 °E) and Guyane (53 °W), so that extent is most of the planet and its centre is sea.
 *
 *  ⚠ THE CHECK IS NOT «France is framed correctly». It is «for EVERY polity in the shipped pack,
 *  the box the reader is taken to actually holds most of that polity's districts» — a property of
 *  the data, swept over all of it, so the next pack cannot introduce the same defect silently.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data', 'elections');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const index = existsSync(join(DATA, 'index.json')) ? JSON.parse(rd('data/elections/index.json')) : null;

/** the centre of one ring of a feature, good enough to ask «is this district inside the frame» */
function points(fc) {
  const out = [];
  for (const f of fc.features) {
    const g = f.geometry; if (!g) continue;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
    let best = null;
    for (const ring of rings) {
      let w = 180, s = 90, e = -180, n = -90;
      for (const c of ring) { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
      const area = (e - w) * (n - s);
      if (!best || area > best.a) best = { a: area, p: [(w + e) / 2, (s + n) / 2] };
    }
    if (best) out.push(best.p);
  }
  return out;
}

test('R626 ① the camera goes to the box the PACK states, not to the extent of what is drawn', () => {
  const src = rd('js/layer-home.js');
  const body = src.slice(src.indexOf("HOMES['dl-elect']"), src.indexOf("HOMES['beta-dl-ukrfront']"));
  assert.ok(body.length > 200, 'the dl-elect entry was found');
  /* the recorded box is consulted FIRST — the drawn extent is the fallback, not the answer */
  const home = body.indexOf('homeBox()');
  const drawn = body.indexOf('bboxOfFC(');
  assert.ok(home > 0 && drawn > 0, 'the entry still knows both answers');
  assert.ok(home < drawn, 'the pack’s own box is asked before the extent of what is drawn');
});

test('R626 ② every polity’s frame holds that polity’s districts', () => {
  if (!index) return assert.fail('data/elections/index.json is missing');
  const bad = [];
  for (const p of index.polities) {
    /* the most recent election of this polity is the one the selector lands on */
    const es = index.elections.filter((e) => e.polity === p.id && e.geo);
    if (!es.length) continue;
    const e = es[es.length - 1];
    const fc = JSON.parse(readFileSync(join(DATA, e.geo), 'utf8'));
    const pts = points(fc);
    const [w, s] = p.home[0], [east, n] = p.home[1];
    const inside = pts.filter((c) => c[0] >= w && c[0] <= east && c[1] >= s && c[1] <= n).length;
    /* ⚠ NOT «all of them». A frame that held every overseas constituency would be the planet again,
       which is the defect. What the reader needs is that the frame is ABOUT this polity: most of
       its districts are in it. France's 11 overseas départements sit outside its frame on purpose. */
    const share = inside / pts.length;
    if (share < 0.8) bad.push(p.id + ': ' + inside + '/' + pts.length + ' districts inside its own frame');
  }
  assert.deepEqual(bad, [], 'a polity is framed somewhere its districts are not');
});

test('R626 ③ …and the frame is not the whole planet', () => {
  if (!index) return assert.fail('data/elections/index.json is missing');
  /* the failure #R588 shipped: a box spanning most of the globe, whose centre is open sea */
  const huge = index.polities
    .map((p) => ({ id: p.id, w: p.home[1][0] - p.home[0][0], h: p.home[1][1] - p.home[0][1] }))
    .filter((x) => x.w > 180 || x.h > 120)
    .map((x) => x.id + ' spans ' + x.w.toFixed(0) + '° × ' + x.h.toFixed(0) + '°');
  assert.deepEqual(huge, [], 'a polity states a frame the size of the planet');
});
