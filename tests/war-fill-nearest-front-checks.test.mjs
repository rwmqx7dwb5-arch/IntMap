/* ============================================================================
 *  war-fill-nearest-front — the war layer's fill says what its own rule says, everywhere
 * ----------------------------------------------------------------------------
 *  js/war-geom.js's rule is «the nearest front decides, on the side it lies». Two ways the fill did not:
 *    ① at a CORNER of a line (the nearest point is a vertex) the side was whichever of the two segments was
 *       looked at first — on 1944-12-25 the whole of France beyond the tip of the Bulge was painted German
 *    ② a cell between the extended lines of TWO fronts was labelled from one point inside it, though the nearest
 *       front changes across it — 1942-02-01 Smolensk Soviet, 1948-06-11 Lod and Ramla Israeli
 *    ③ «nearest» was measured as the crow flies — across the Gulf of Finland the Finnish line was nearer to Estonia
 *       than the Eastern Front: it is measured over land, inside the cell, from the fronts that border it
 *    ④ a piece no line crosses (Corsica) took its side from one vertex and the line's prolongation
 *  and the place checks of scripts/build-wars.mjs could not see any of it, because they asked the point rule, not
 *  the fill. Now `factionAt` IS the fill; the checks below ask it, on synthetic shapes and on the record.
 *  dev-notes/2026-10-13-war-fill-nearest-front.md has the measurements.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WarGeom } from '../js/war-geom.js';
import { faction } from './helpers/war-faction.mjs';
import { PLACES } from '../scripts/wars/places.mjs';
import { PLACES_MIDEAST } from '../scripts/wars/places-mideast.mjs';

const at = (name) => { const p = PLACES[name] || PLACES_MIDEAST[name]; assert.ok(p, name); return [p[0], p[1]]; };
const square = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];

test('① beyond a corner the point is on the side the path turns away from, whichever segment is read first', () => {
  /* a spike pointing west, like the Bulge: down from the north, west to the tip, back east, then south */
  const path = [[10, 10], [10, 6], [5, 5], [10, 4], [10, 0]];
  const beyond = [2, 5];                       /* west of the tip: outside the spike */
  const inside = [8, 5];                       /* in the spike's mouth */
  assert.notEqual(WarGeom.nearestOnPath(beyond, path).sign, WarGeom.nearestOnPath(inside, path).sign);
  /* and reading the path backwards flips both — a property of the corner, not of segment order */
  const rev = path.slice().reverse();
  assert.equal(WarGeom.nearestOnPath(beyond, rev).sign, -WarGeom.nearestOnPath(beyond, path).sign);
  /* north-west and south-west of the tip the nearest point is the tip itself, and the two segments disagree there
     (the incoming one answers «inside» for the south-west point): both are outside, like a far point */
  const outside = WarGeom.nearestOnPath([-20, 5], path).sign;
  for (const p of [[2, 7], [2, 3], [4.9, 5]]) assert.equal(WarGeom.nearestOnPath(p, path).sign, outside, `at ${p}`);
  assert.notEqual(outside, WarGeom.nearestOnPath(inside, path).sign);
});

test('① on the record: France is Allied during the Battle of the Bulge, the Colmar pocket German', () => {
  assert.equal(faction('ww2', '1944-12-25', [2.35, 48.86]), 'ALLIED');     /* Paris */
  assert.equal(faction('ww2', '1944-12-25', [-2.76, 47.66]), 'ALLIED');    /* Vannes, Brittany */
  assert.equal(faction('ww2', '1944-12-25', [5.37, 43.30]), 'ALLIED');     /* Marseille */
  assert.equal(faction('ww2', '1944-12-25', [7.53, 48.05]), 'AXIS');       /* Neuf-Brisach, inside the Colmar pocket (Colmar itself anchors the line) */
});

test('② a cell two fronts disagree on is split where the nearest front changes', () => {
  /* a square country; front A runs north–south near the west edge, front B east–west near the north edge.
     Extended, they make four cells; in the south-east cell A says «east = X» and B says «south = Y». */
  const polys = [square(0, 0, 10, 10)];
  const A = { pts: [[2, 12], [2, -2]], left: 'X', right: 'W' };     /* heading south: east is geometric left */
  const B = { pts: [[-2, 8], [12, 8]], left: 'N', right: 'Y' };     /* heading east: south is geometric right */
  const sA = WarGeom.nearestOnPath([3, 1], A.pts).sign, sB = WarGeom.nearestOnPath([9, 7], B.pts).sign;
  const fa = sA < 0 ? A.left : A.right, fb = sB < 0 ? B.left : B.right;
  assert.notEqual(fa, fb);
  const pieces = WarGeom.warPieces(polys, 'BASE', [A, B]);
  const side = (pt) => { for (const p of pieces) if (WarGeom.pointInPolys(pt, p.polys)) return p.faction; return null; };
  assert.equal(side([3, 1]), fa, 'near A, far from B: A decides');
  assert.equal(side([9, 7]), fb, 'near B, far from A: B decides');
  /* the split follows the bisector: points equidistant-ish sit on it, both sides of it are covered */
  const area = (ps) => ps.reduce((s, p) => { let a = 0; const r = p[0]; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s + Math.abs(a / 2); }, 0);
  const total = pieces.reduce((s, p) => s + area(p.polys), 0);
  assert.ok(Math.abs(total - 100) < 1e-6, `the pieces tile the country (got ${total})`);
  /* and the fill agrees with the rule at every sample point away from the boundaries */
  for (let x = 0.25; x < 10; x += 0.5) for (let y = 0.25; y < 10; y += 0.5) {
    const dA = WarGeom.nearestOnPath([x, y], A.pts).dist, dB = WarGeom.nearestOnPath([x, y], B.pts).dist;
    if (Math.abs(dA - dB) < 0.1 || Math.abs(x - 2) < 0.1 || Math.abs(y - 8) < 0.1) continue;
    const want = dA < dB ? (WarGeom.nearestOnPath([x, y], A.pts).sign < 0 ? A.left : A.right) : (WarGeom.nearestOnPath([x, y], B.pts).sign < 0 ? B.left : B.right);
    assert.equal(side([x, y]), want, `at ${x},${y}`);
  }
});

test('② on the record: the cities whose cell another front had labelled', () => {
  assert.equal(faction('ww2', '1942-02-01', at('Smolensk')), 'AXIS');
  assert.equal(faction('mideast', '1948-06-11', at('Lod')), 'ARAB');
  assert.equal(faction('mideast', '1948-06-11', at('Ramla')), 'ARAB');
});

test('③ nearest over land: Estonia and Ingria are behind the German line, not across the Gulf from the Finnish one', () => {
  for (const d of ['1942-02-01', '1942-11-19', '1943-07-04']) {
    assert.equal(faction('ww2', d, at('Tallinn')), 'AXIS', `Tallinn ${d}`);
    assert.equal(faction('ww2', d, at('Narva')), 'AXIS', `Narva ${d}`);
    assert.equal(faction('ww2', d, [29.0, 59.6]), 'AXIS', `Ingria ${d}`);
    assert.equal(faction('ww2', d, at('Leningrad')), 'ALLIED', `Leningrad ${d}`);
  }
});

test('④ a piece no line crosses is asked at the point, not read off one vertex: Corsica 1914–18, Sardinia 1944', () => {
  for (const d of ['1914-09-12', '1916-06-01', '1918-06-01']) assert.equal(faction('ww1', d, [9.1, 42.1]), 'ALLIED', `Corsica ${d}`);
  assert.equal(faction('ww2', '1944-06-10', [9.0, 40.1]), 'ALLIED');     /* Sardinia, evacuated by the Germans in September 1943 */
});

test('the corrected lines: Normandy, Kyiv, Warsaw 1915 and 1945, Ichi-Go', () => {
  assert.equal(faction('ww2', '1944-06-15', at('Bayeux')), 'ALLIED');
  assert.equal(faction('ww2', '1944-06-15', [-1.62, 49.64]), 'AXIS');      /* Cherbourg, until 26 June */
  assert.equal(faction('ww2', '1944-06-30', at('Bayeux')), 'ALLIED');
  assert.equal(faction('ww2', '1944-06-30', at('Caen')), 'AXIS');
  assert.equal(faction('ww2', '1945-01-20', at('Warsaw')), 'ALLIED');
  assert.equal(faction('ww2', '1945-01-20', at('Poznan')), 'AXIS');
  assert.equal(faction('ww2', '1945-01-01', at('Guilin')), 'AXIS');
  assert.equal(faction('ww2', '1945-01-01', [109.68, 27.44]), 'ALLIED');   /* Zhijiang, never taken */
  assert.equal(faction('ww2', '1945-01-01', [107.0, 22.2]), 'AXIS');      /* the corridor to Indochina, open since 10 December */
  assert.equal(faction('ww2', '1945-01-20', [22.2, 49.56]), 'ALLIED');    /* Sanok, Soviet since August 1944 */
  assert.equal(faction('ww2', '1945-01-20', [20.63, 50.87]), 'ALLIED');   /* Kielce, taken on 15 January */
  assert.equal(faction('ww2', '1943-12-01', at('Kyiv')), 'ALLIED');
  assert.equal(faction('ww1', '1915-03-01', at('Warsaw')), 'ALLIED');
});
