/* ============================================================================
 *  clio-great-britain-name — a name history places in 1707–1800 is not drawn on British-held land in 1942,
 *  and a row whose name is withheld keeps its coast
 * ----------------------------------------------------------------------------
 *  Cliopatria names British-held pieces the other records do not cover «Kingdom of Great Britain» through the
 *  twentieth century; the map labelled Kuwait so in November 1942 (seen in the war layer's example picture,
 *  dev-notes/2026-10-11-ww2-tour.md §5). scripts/histclio/review.json now withholds the name after 1800. Withholding
 *  first took 37 coast pieces off the map with the label — the coast match treated a withheld name as a blank — so the
 *  identity of a withheld row is its withheld name (scripts/histclio/coast-snap.mjs loadRows).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapName } from '../scripts/histclio/coast-snap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (rel) => { const t = readFileSync(join(ROOT, rel), 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const inForce = (f, t) => ymd(f[2], f[3], f[4]) <= t && t < ymd(f[5], f[6], f[7]);
const T1942 = ymd(1942, 11, 1);

test('① the map does not label Kuwait «Kingdom of Great Britain» in 1942 — the piece stays, without the name, in the British Empire', async () => {
  const { mapReader } = await import('../scripts/history-pages.mjs');
  const R = await mapReader();
  const r = await R.labelsAt(new Date(1942, 10, 1, 12));
  const kuwait = [47.9, 29.3];
  const inside = (g) => { let hit = false; const rings = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of rings) { const ring = poly[0]; let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > kuwait[1]) !== (yj > kuwait[1]) && kuwait[0] < (xj - xi) * (kuwait[1] - yi) / (yj - yi) + xi) c = !c; } if (c) hit = true; } return hit; };
  const at = r.fc.features.map((f, i) => [f, r.labels.en[i]]).filter(([f]) => f.geometry && inside(f.geometry));
  assert.ok(at.length, 'a shape is drawn at Kuwait in 1942');
  assert.ok(at.some(([f]) => f.properties._wName === 'Kingdom of Great Britain'), 'the withheld row is the one drawn there, and its card can say why');
  for (const [f, label] of at) {
    assert.notEqual(label, 'Kingdom of Great Britain', 'the 1707–1800 name is not the label');
    if (f.properties._rec === 'clio') assert.ok(f.properties._of === 'British Empire' || f.properties.NAME === 'British Empire', 'the piece is still drawn as part of the British Empire (a member of the realm, or the realm itself)');
  }
});

test('② no shipped row carries the name after 1800, and the review says why', () => {
  const clio = bundle('data/hist-clio.js');
  const late = clio.feats.filter((f) => f[0].en === 'Kingdom of Great Britain' && f[5] - 1 > 1800);
  assert.deepEqual(late.map((f) => f[2]), []);
  const withheld = clio.feats.filter((f) => f[9] && f[9].wn === 'Kingdom of Great Britain');
  assert.ok(withheld.length > 0 && withheld.every((f) => f[9].ws === 'end' && f[9].wy === 1800), 'the withheld rows say the end history places');
  const review = JSON.parse(readFileSync(join(ROOT, 'scripts/histclio/review.json'), 'utf8'));
  const row = review.rows.find((r) => r.name === 'Kingdom of Great Britain');
  assert.ok(row && row.e === 1800 && row.wd === 'Q161885' && /Acts of Union 1800/.test(row.history));
});

test('③ a withheld name is not a blank: the row keeps its coast pieces', () => {
  const snap = bundle('data/hist-coast-snap.js');
  const gb = snap.feats.filter((f) => snapName(f) === 'Kingdom of Great Britain' && inForce(f, T1942));
  assert.ok(gb.length > 0, 'the coast pieces of the withheld row are drawn in 1942 (MEASURED before: 0 once the name was withheld)');
  const anyWithheld = snap.feats.filter((f) => f[9] && f[9].m && f[9].m.wn);
  assert.ok(anyWithheld.length >= gb.length, 'and every withheld row is matched to the coast the same way');
});
