/* ============================================================================
 *  IntMap · #R460 source checks — which point the cyclone smoke calls "the eye"
 * ----------------------------------------------------------------------------
 *  tests/prod-smoke.spec.js has looked for a cyclone since #R276 by sweeping the tropics for the
 *  strongest wind and then hunting a calm point inside a ±1.5° box around it. The hunt walked the
 *  box from its south-west corner on a 0.1° lattice and STOPPED at the first point at or below
 *  0.6 × peak. A median 48 % of that box is below the line — up to 93 % of it — so the first hit
 *  is the corner the walk starts at.
 *
 *  MEASURED against the deployed build (2026-08-25-R455) over all 145 forecast hours the ECMWF
 *  axis was serving on 2026-08-25, of which 101 pass #R276's 25 m/s gate:
 *
 *      the point it called the eye is exactly peak −1.5°, −1.5°   94 of 101 hours
 *      …and can be walked out of the box from without the
 *         wind rising at all (prominence 0)                      100 of 101 hours
 *      median distance from the strongest wind                     222 km  (min 93)
 *      median speed there                                        15.45 m/s  — trade wind
 *
 *  It was not the eye, so neither the test's name, nor the camera it flies, nor any failure
 *  message it has printed was about the storm.
 *
 *  ⚠⚠ THE OBVIOUS REPAIR — 「take the minimum of the box」 — IS ALSO NOT IT, and only measuring
 *  says so. It agrees with what shipped this round in 70 of the 101 hours and is a whole storm
 *  wrong in the rest: when the cyclone reaches land the calmest air in the box is INLAND behind
 *  the terrain. 31 of 101 hours put the box minimum more than 120 km from the peak, against 1 for
 *  the rule below. Both recorded boxes in tests/fixtures/r460-cyclone-boxes.json are hours where
 *  that difference is the whole answer.
 *
 *  What ships instead is the test's own title, carried out — 「a calm eye INSIDE A RING of strong
 *  wind」 — as topographic prominence over the box (see tests/helpers/cyclone-eye.js). This file
 *  puts that decision through the fields the live page cannot be made to show.
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SOURCE SEARCH: the note this round left in the spec quotes
 *  the rule it removed, so a check reading the raw file would find what it asserts has gone.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findEye, wallLevels, describeEye } from './helpers/cyclone-eye.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const FX = JSON.parse(read('tests/fixtures/r460-cyclone-boxes.json'));
const km = (peak, p) =>
  111 * Math.hypot(p.la - peak.la, (p.lo - peak.lo) * Math.cos(peak.la * Math.PI / 180));

/** The rule this round removed, restated so it can be run rather than described. */
function firstBelowTheLine(peak, box) {
  for (let i = 0; i < box.n; i++) {
    for (let j = 0; j < box.n; j++) {
      if (box.v[i][j] <= peak.sp * 0.6) {
        return { la: +(box.la0 + i * box.step).toFixed(2), lo: +(box.lo0 + j * box.step).toFixed(2), sp: box.v[i][j] };
      }
    }
  }
  return null;
}

/** …and the minimum of the box, the repair that looks right until it is measured. */
function minimumOfTheBox(box) {
  let best = null;
  for (let i = 0; i < box.n; i++) {
    for (let j = 0; j < box.n; j++) {
      if (best === null || box.v[i][j] < box.v[best[0]][best[1]]) best = [i, j];
    }
  }
  return { la: +(box.la0 + best[0] * box.step).toFixed(2), lo: +(box.lo0 + best[1] * box.step).toFixed(2), sp: box.v[best[0]][best[1]] };
}

/* ── ① the hour the whole round was measured on ──────────────────────────────────────────────
   Typhoon south of Kyushu, valid 2026-08-25T02:00Z off the 00Z run: peak 41.038 m/s at 26.5°N
   131.0°E. Read down the lattice and the eye is plainly there — the row at 26.1°N runs
   … 19.57, 14.69, 9.66, 6.66, 17.78, 30.89, 37.56 … — and the rule that shipped for 184 rounds
   answered with the corner of the box, 223 km away in ordinary trade wind. */
test('#R460 ① on the recorded typhoon the eye is named, and the rule it replaced named the corner', () => {
  const { peak, box } = FX.typhoon;
  const got = findEye(peak, box);
  assert.ok(got.eye, 'this hour has an eye');
  assert.equal(got.eye.la, 26.1);
  assert.equal(got.eye.lo, 130.8);
  assert.equal(+got.eye.sp.toFixed(2), 6.66, 'and it is the calm centre, not the wall');
  assert.equal(+got.eye.wall.toFixed(2), 24.14, 'ringed by wind that reaches this in every direction');
  assert.equal(+got.eye.prominence.toFixed(2), 17.48);
  assert.ok(km(peak, got.eye) < 60, 'it is beside the storm: ' + km(peak, got.eye).toFixed(0) + ' km');

  const old = firstBelowTheLine(peak, box);
  assert.equal(old.la, 25, 'the rule this round removed answers with the south-west corner');
  assert.equal(old.lo, 129.5);
  assert.ok(km(peak, old) > 200, 'which is ' + km(peak, old).toFixed(0) + ' km away');
  assert.equal(got.belowCut, 668, '…because 668 of the 961 points in the box are below the line');
});

/* ── ② and 「the corner」 is the same statement as 「prominence 0」 ────────────────────────────
   A point on the edge of the box can be left without the wind rising at all. That is not a
   threshold anybody chose — it is the difference between being inside a ring and not, and it is
   why the old answer was never the eye: MEASURED, its prominence was 0 in 100 of the 101 hours. */
test('#R460 ② every point on the edge of the box has prominence 0 — the old answer was one', () => {
  const { peak, box } = FX.typhoon;
  const esc = wallLevels(box.v, box.n);
  for (let i = 0; i < box.n; i++) {
    for (let j = 0; j < box.n; j++) {
      if (i === 0 || j === 0 || i === box.n - 1 || j === box.n - 1) {
        assert.equal(esc[i][j], box.v[i][j], 'edge cell ' + i + ',' + j + ' is its own wall');
      }
    }
  }
  const old = firstBelowTheLine(peak, box);
  assert.equal(esc[0][0] - box.v[0][0], 0, 'so the corner it answered with has no ring around it');
  assert.equal(+old.sp.toFixed(2), 17.13, 'and reads 17.13 m/s, which is trade wind, not an eye');
});

/* ── ③ the landfall hour, where 「the minimum of the box」 stops being the eye ─────────────────
   Same storm 45 hours on, valid 2026-08-27T23:00Z: the centre has crossed the Zhejiang coast, the
   peak is 34.217 m/s at 27.5°N 121.0°E, and the calmest air in the box is 3.41 m/s at 26.0°N
   119.5°E — 223 km inland, behind the hills, ON THE EDGE OF THE BOX. The eye is still an eye. */
test('#R460 ③ calmer air inland does not win — the ring does', () => {
  const { peak, box } = FX.landfall;
  const got = findEye(peak, box);
  assert.ok(got.eye, 'the storm still has a centre after landfall');
  assert.equal(got.eye.la, 27.8);
  assert.equal(got.eye.lo, 121);
  assert.equal(+got.eye.sp.toFixed(2), 8.73);
  assert.ok(km(peak, got.eye) < 40, 'and it is ' + km(peak, got.eye).toFixed(0) + ' km from the peak');

  const low = minimumOfTheBox(box);
  assert.equal(+low.sp.toFixed(2), 3.41, 'the box minimum is calmer…');
  assert.ok(low.sp < got.eye.sp, '…than the eye, which is exactly why 「calmest」 is the wrong question');
  assert.ok(km(peak, low) > 200, '…and it is ' + km(peak, low).toFixed(0) + ' km away, over land');
  const esc = wallLevels(box.v, box.n);
  assert.equal(esc[0][0] - box.v[0][0], 0, 'with nothing ringing it at all');
});

/* ── ④ the alternative measuring killed, kept runnable so it stays killed ─────────────────────
   Before prominence this round tried the reading that sounds most like the test's title: the
   connected region of 「at or below 0.6 × peak」 that does not touch the edge of the box. On the
   typhoon hour 0.6 × peak is 24.62 m/s, the eyewall dips under that in one sector, the eye's calm
   LEAKS OUT to the edge through the gap — and the rule then picks a two-cell dimple INSIDE the
   wall and calls that the eye. A ring with a gap is still a ring you have to climb, which is what
   prominence measures and a threshold cannot. */
test('#R460 ④ a connected region below the line leaks through the gap in the eyewall', () => {
  const { peak, box } = FX.typhoon;
  const cut = peak.sp * 0.6, n = box.n, lab = [];
  for (let i = 0; i < n; i++) { lab.push([]); for (let j = 0; j < n; j++) lab[i].push(-1); }
  const comps = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (lab[i][j] >= 0 || !(box.v[i][j] <= cut)) continue;
      const id = comps.length, stack = [[i, j]];
      lab[i][j] = id;
      let touches = false, best = [i, j], size = 0;
      while (stack.length) {
        const [a, b] = stack.pop();
        size++;
        if (a === 0 || b === 0 || a === n - 1 || b === n - 1) touches = true;
        if (box.v[a][b] < box.v[best[0]][best[1]]) best = [a, b];
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = a + da, y = b + db;
          if (x < 0 || y < 0 || x >= n || y >= n || lab[x][y] >= 0 || !(box.v[x][y] <= cut)) continue;
          lab[x][y] = id;
          stack.push([x, y]);
        }
      }
      comps.push({ touches, best, size });
    }
  }
  const eye = findEye(peak, box).eye;
  const i0 = Math.round((eye.la - box.la0) / box.step), j0 = Math.round((eye.lo - box.lo0) / box.step);
  assert.ok(comps[lab[i0][j0]].touches,
    'the region holding the real eye reaches the edge of the box — the ring has a gap at this hour');

  const inner = comps.filter((c) => !c.touches).sort((a, b) => box.v[a.best[0]][a.best[1]] - box.v[b.best[0]][b.best[1]]);
  assert.ok(inner.length > 0, 'and the rule would not go empty-handed, which is the trap');
  const pick = { la: +(box.la0 + inner[0].best[0] * box.step).toFixed(2), lo: +(box.lo0 + inner[0].best[1] * box.step).toFixed(2), sp: box.v[inner[0].best[0]][inner[0].best[1]] };
  assert.equal(+pick.sp.toFixed(2), 24.21, 'it picks a dimple inside the wall, at 24.21 m/s');
  assert.equal(inner[0].size, 2, 'two cells wide');
  assert.ok(pick.sp > 3 * eye.sp, 'i.e. more than three times the wind the eye actually has');
});

/* ── ⑤ two runs of the same hour name the same point ─────────────────────────────────────────
   Otherwise 「the selection moved」 and 「the map moved」 are the same observation (#R458). Ties are
   broken south first, then west — stated here as a field with two identical basins. */
test('#R460 ⑤ ties are broken by position, south first then west', () => {
  const n = 21, v = [];
  for (let i = 0; i < n; i++) { v.push([]); for (let j = 0; j < n; j++) v[i].push(30); }
  const dig = (ci, cj) => { for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) v[i][j] = 5; };
  dig(5, 5); dig(5, 15); dig(15, 5);            /* three basins, identical in every way but place */
  const peak = { sp: 30, la: 10, lo: 100 };
  const box = { la0: 9, lo0: 99, step: 0.1, n, v };
  const a = findEye(peak, box), b = findEye(peak, box);
  assert.deepEqual(a.eye, b.eye, 'the same lattice gives the same answer twice');
  assert.equal(a.eye.la, +(9 + 4 * 0.1).toFixed(2), 'the southernmost of the tied basins');
  assert.equal(a.eye.lo, +(99 + 4 * 0.1).toFixed(2), 'and the westernmost of those');
});

/* ── ⑥ a box with no ring in it names no point, and says which of the two reasons it is ───────
   #R276's gate — 「is anything here at or below 0.6 × peak」 — is unchanged and still answers
   first. What is new is the second reason: calm that is all on the edge of the box is a band of
   wind rather than a storm with a centre, and that has to read differently in the skip line. */
test('#R460 ⑥ no calm at all, and calm that is all on the edge, are different answers', () => {
  const n = 11;
  const flat = (x) => { const v = []; for (let i = 0; i < n; i++) { v.push([]); for (let j = 0; j < n; j++) v[i].push(x); } return v; };

  const strong = { la0: 0, lo0: 0, step: 0.1, n, v: flat(30) };
  const a = findEye({ sp: 40, la: 0.5, lo: 0.5 }, strong);
  assert.equal(a.eye, null, 'nothing at or below 24 m/s here');
  assert.equal(a.belowCut, 0);
  assert.match(a.why, /is at or below the 24\.0 m\/s calm line/);

  /* a straight band: calm in the south, strong in the north, so the calm runs off both sides */
  const v = flat(30);
  for (let i = 0; i < 4; i++) for (let j = 0; j < n; j++) v[i][j] = 5;
  const band = findEye({ sp: 40, la: 0.5, lo: 0.5 }, { la0: 0, lo0: 0, step: 0.1, n, v });
  assert.equal(band.eye, null, 'a band of wind has no eye, however calm one side of it is');
  assert.ok(band.belowCut > 0, 'and this time it is not for want of calm: ' + band.belowCut + ' points');
  assert.match(band.why, /without the wind rising at all/);
  assert.equal(describeEye({ sp: 40, la: 0.5, lo: 0.5 }, band), band.why, 'the skip line says so');

  /* …and the same band with one cell of calm walled off inside it does have one */
  v[7][5] = 5;
  const walled = findEye({ sp: 40, la: 0.5, lo: 0.5 }, { la0: 0, lo0: 0, step: 0.1, n, v });
  assert.ok(walled.eye, 'one enclosed cell is a ring');
  assert.equal(walled.eye.prominence, 25);
});

/* ── ⑦ a hole in the field is not somewhere the wind is light ────────────────────────────────
   The sampler answers NaN where the model has nothing. Treating that as calm would let a walk
   escape through it, and would let the hole itself be named as the eye. */
test('#R460 ⑦ NaN is impassable, not calm', () => {
  const n = 9, v = [];
  for (let i = 0; i < n; i++) { v.push([]); for (let j = 0; j < n; j++) v[i].push(30); }
  v[4][4] = 5;
  v[4][3] = NaN; v[3][4] = NaN;                 /* holes in the wall around the calm cell */
  const got = findEye({ sp: 40, la: 0.5, lo: 0.5 }, { la0: 0, lo0: 0, step: 0.1, n, v });
  assert.ok(got.eye, 'the calm cell is still ringed — a hole is not a door');
  assert.equal(got.eye.sp, 5);
  assert.equal(got.eye.prominence, 25, 'and the wall is the wind, not the hole');
  assert.equal(got.calmest.sp, 5, 'nor is a hole the calmest point in the box');
});

/* ── ⑧ the wall really is the lowest pass, not the lowest neighbour ──────────────────────────
   A ring of 30 with one notch of 12 must read 12 from inside: the wind you have to cross to
   leave is the lowest point of the ring, wherever on it that is. */
test('#R460 ⑧ the wall is the lowest pass out of the box', () => {
  const n = 7, v = [];
  for (let i = 0; i < n; i++) { v.push([]); for (let j = 0; j < n; j++) v[i].push(i === 0 || j === 0 || i === n - 1 || j === n - 1 ? 3 : 30); }
  for (let i = 2; i <= 4; i++) for (let j = 2; j <= 4; j++) v[i][j] = 4;
  v[1][3] = 12;                                  /* the one notch through the wall of 30 */
  const esc = wallLevels(v, n);
  assert.equal(esc[3][3], 12, 'from the middle you leave over the notch');
  const far = wallLevels(v.map((r, i) => r.map((x, j) => (i === 1 && j === 3 ? 30 : x))), n);
  assert.equal(far[3][3], 30, 'and with the notch filled in you have to climb the wall itself');
});

/* ── ⑨ …and the shipped spec really asks this question ───────────────────────────────────────
   A rule written in a helper nothing calls is not a rule (CONSTITUTION.md). What must stand in
   tests/prod-smoke.spec.js: the page GATHERS the lattice, Node CHOOSES, the camera flies to what
   Node chose, and the walk that stopped at the first point below the line is gone. */
test('#R460 ⑨ the cyclone smoke gathers the box and lets tests/helpers/cyclone-eye.js choose', () => {
  const src = codeOnly(read('tests/prod-smoke.spec.js'));
  const a = src.indexOf('prod shows a real cyclone');
  assert.ok(a > 0, 'the cyclone test is still there');
  const b = src.indexOf('test(', src.indexOf('map.triggerRepaint()', a));
  const body = src.slice(a, b > a ? b : src.length);

  assert.match(src, /from '\.\/helpers\/cyclone-eye\.js'/, 'the decision is imported, not inlined');
  assert.match(body, /box = \{ la0, lo0, step, n, v \}/, 'the page returns the lattice it read');
  assert.match(body, /findEye\(found\.peak, found\.box\)/, 'and Node takes the decision on it');
  assert.match(body, /test\.skip\(!storm\.eye/, 'an hour with no eye is skipped with the measured reason');
  assert.match(body, /center: \[e\.eye\.lo, e\.eye\.la\]/, 'the camera flies to the point that was chosen');
  assert.ok(!/\{ eye = \{ sp: v, la:/.test(body),
    'and the walk that stopped at the first point below the line is gone');
  assert.ok(!/for \(let dla = -1\.5; dla <= 1\.5 && !eye/.test(body),
    'including the loop that made the answer a fact about iteration order');
});
