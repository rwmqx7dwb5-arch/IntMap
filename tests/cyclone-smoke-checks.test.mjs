/* ============================================================================
 *  IntMap · the production cyclone smoke — which two points it compares, and which point is the eye
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r458-checks.test.mjs and tests/r460-checks.test.mjs (the topic, not the
 *  round, is the unit now). Both files guard the same test in tests/prod-smoke.spec.js —
 *  「a calm eye inside a ring of strong wind」 — from the two ends: #R460 decides WHICH point is the
 *  eye (tests/helpers/cyclone-eye.js), #R458 decides whether the eye/eyewall PAIR can carry a
 *  comparison at all (tests/helpers/wind-ramp.js separablePair). Their original headers follow.
 * ==========================================================================*/
/*
 *  #R458 · A CLAIM THAT IS NOT ALWAYS A CLAIM ABOUT THE PICTURE
 * ----------------------------------------------------------------------------
 *  「a calm eye inside a ring of strong wind」 — tests/prod-smoke.spec.js has asked that of the
 *  deployed map since #R276, and #R382 moved the verdict out of RGB space into the field's own unit
 *  so that the ramp's colour geometry could not decide it. What #R382 did NOT do is ask whether the
 *  two POINTS it compares can carry the comparison at all.
 *
 *  They cannot always. Each pixel's verdict (#R287's `speedInFootprint`) says its colour stands for
 *  SOME speed inside the ±1.5 px patch of atmosphere under it, and the renderer picks which one. So
 *  when the two patches overlap as intervals of speed — eye.foot[1] >= ring.foot[0] — one and the
 *  same colour is a legal reading of BOTH points, and a comparison between them stops being a
 *  statement about the map.
 *
 *  MEASURED, the post-deploy smoke of run 32818517323 (#R455's deploy), all four attempts:
 *      the eye pixel read 15.5 m/s ; the eyewall's footprint was [15.045, 36.9]
 *  and the eye's own `speedInFootprint` PASSED on the same run — which is what proves the eye's
 *  footprint reached at least 15.5, i.e. above the eyewall footprint's floor. The map was right;
 *  the question was not answerable.
 *
 *  ⚠ THE FIX IS NOT A LOOSER BOUND — see ① below, which paints both points the same colour and
 *  watches #R287 accept it. The pair of points is chosen instead, and when no pair on the screen
 *  separates, the hour says so in m/s rather than being skipped or waved through.
 * ==========================================================================*/
/*
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
import { separablePair, readPixel } from './helpers/wind-ramp.js';
import { findEye, wallLevels, describeEye } from './helpers/cyclone-eye.js';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ a DELIBERATELY simple comment stripper, not scripts/code-only.mjs: ⑦/⑨ below find the cyclone
   test by its TITLE, which is a string literal — a stripper that blanks strings would hide it. */

/* ══════════════════════════ #R460 · which point is the eye ══════════════════════════ */
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
  /* spelling kept — same spec — that it hands the lattice to the evaluated helper instead of walking the box itself */
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

/* ══════════════════════════ #R458 · whether the pair can carry the claim ══════════════════════════ */
/* ── the incident, as data ────────────────────────────────────────────────────────────────────
   ⚠ EYE_FOOT_TOP IS A LOWER BOUND READ OFF THE RUN, NOT A NUMBER SOMEBODY CHOSE. The deploy log
   carried the eyewall's footprint and the eye's reading; it did not carry the eye's own bounds.
   What it did carry is that the eye's `speedInFootprint` passed, and that assertion is exactly
   「the entry the pixel reads as meets the footprint」 — so the eye's footprint reached 15.5 m/s or
   higher. Everything below therefore holds a fortiori: the real overlap was at least this wide. */
const EYE_READ_V = 15.5;
const EYE_FOOT_TOP = 15.5;
const EYE_FOOT = [EYE_FOOT_TOP - 0.955, EYE_FOOT_TOP];
const RING_FOOT = [15.045, 36.9];

/* A ramp is only needed to turn speeds back into pixels, and #R382's whole lesson is that the
   PALETTE must not be what decides this — so a plain monotone one is used, one entry per 0.1 m/s,
   every entry a different colour. Against the shipped table a reader could not tell whether the
   verdict below came from the arithmetic or from windy.com's colour geometry. */
function makeRamp(lo, hi) {
  const breakpoints = [], colors = [];
  const n = Math.round((hi - lo) / 0.1);
  for (let i = 0; i <= n; i++) {
    breakpoints.push(Math.round((lo + i * 0.1) * 1000) / 1000);
    colors.push([i % 256, (i >> 8) % 256, 7]);
  }
  return { breakpoints, colors };
}
const RAMP = makeRamp(0, 60);
const pixelFor = (v) => {
  let i = 0;
  while (i + 1 < RAMP.breakpoints.length && RAMP.breakpoints[i + 1] <= v) i++;
  return RAMP.colors[i].slice();
};
const cand = (la, lo, v, f0, f1) => ({ la, lo, v, foot: [f0, f1], px: pixelFor(v) });

/* ── ① the hour the deploy failed on could not answer the question it was asked ───────────────*/
test('#R458 ① with the run-32818517323 footprints, a legal render fails the cross-claim', () => {
  assert.ok(RING_FOOT[0] <= EYE_FOOT_TOP,
    'the two footprints overlap as speed intervals — that is the whole defect');

  /* the render the deploy actually got: the eye painted at the top of its own footprint */
  const eyeAtTop = readPixel(RAMP, pixelFor(EYE_READ_V), EYE_FOOT[0], EYE_FOOT[1]);
  assert.equal(eyeAtTop.speedInFootprint, true,
    'the eye pixel stands for a speed the model really has under it — #R287 accepts it');
  assert.equal(eyeAtTop.nearest.v, EYE_READ_V, 'and that speed is the 15.5 m/s the deploy read');
  assert.ok(!(eyeAtTop.nearest.v < RING_FOOT[0]),
    'yet it is NOT below everything under the eyewall — this is the assertion that went red');

  /* and the mirror image: the eyewall painted at the bottom of ITS footprint is just as legal */
  const ringAtFloor = readPixel(RAMP, pixelFor(RING_FOOT[0]), RING_FOOT[0], RING_FOOT[1]);
  assert.equal(ringAtFloor.speedInFootprint, true, 'the eyewall pixel is accepted too');
  assert.ok(!(ringAtFloor.nearest.v > EYE_FOOT_TOP),
    'and it is not above everything under the eye either — both halves fail on legal renders');

  /* ⚠ AND NO TOLERANCE REPAIRS IT, because the overlap band is a legal reading of BOTH points:
     one single colour passes #R287 at the eye AND at the eyewall. Any comparison between two
     pixels that may legitimately be identical is comparing a value with itself, and a bound loose
     enough to admit that has stopped asserting 「you can see the eye」 at all. */
  const shared = pixelFor((RING_FOOT[0] + EYE_FOOT_TOP) / 2);
  const asEye = readPixel(RAMP, shared, EYE_FOOT[0], EYE_FOOT[1]);
  const asRing = readPixel(RAMP, shared, RING_FOOT[0], RING_FOOT[1]);
  assert.equal(asEye.speedInFootprint, true, 'this one colour is a legal reading of the eye');
  assert.equal(asRing.speedInFootprint, true, '…and of the eyewall, at the same time');
  assert.equal(asEye.nearest.v, asRing.nearest.v, 'so the two readings can be the same number');
});

/* ── ② the finder's own pair is kept whenever it separates ────────────────────────────────────
   MEASURED against the live site on 2026-08-25 (model run 00Z, valid 08:00Z): the typhoon south of
   Okinawa, eye footprint 15.39…15.64 and eyewall footprint 26.67…34.32. Nothing is re-picked at an
   hour like that, so the test goes on reading the two points the storm search itself chose. */
test('#R458 ② a separating pair is returned unchanged, and says it was not re-picked', () => {
  const calm = [cand(25.5, 128.5, 13.51, 15.39, 15.64), cand(25.1, 128.6, 13.77, 13.73, 13.85)];
  const strong = [cand(27.0, 130.0, 30.99, 26.67, 34.32), cand(27.1, 130.0, 35.49, 34.14, 35.58)];
  const p = separablePair(calm, strong);
  assert.equal(p.separated, true);
  assert.equal(p.repicked, false, 'the finder\'s pair worked, so it is the pair that is used');
  assert.deepEqual([p.eye.la, p.eye.lo], [25.5, 128.5]);
  assert.deepEqual([p.ring.la, p.ring.lo], [27.0, 130.0]);
  assert.equal(Math.round(p.gap * 100) / 100, 11.03,
    'the gap is the eyewall floor minus the eye ceiling');
  assert.equal(p.gap, p.origGap, 'and it is the pair as found');
  assert.equal(p.why, '', 'nothing to explain');
});

/* ── ③ …and when it does not, the calmest and the strongest point on the screen are taken ─────
   The ranking key is the bound the claim itself names — the footprint's ceiling on the calm side
   and its floor on the strong side — so the pair chosen is the one that makes the question as
   answerable as this screen can make it. Nothing here is a tuned threshold. */
test('#R458 ③ an overlapping pair is replaced by the calmest and the strongest available', () => {
  const calm = [
    cand(25.5, 128.5, 15.4, 12.0, EYE_FOOT_TOP),         /* the finder's eye — overlaps */
    cand(25.1, 128.1, 13.7, 13.6, 13.89),
    cand(25.1, 128.6, 13.77, 13.73, 13.85),              /* the lowest ceiling on the screen */
  ];
  const strong = [
    cand(27.0, 130.0, 35.5, RING_FOOT[0], RING_FOOT[1]), /* the peak, on the eyewall's inner edge */
    cand(27.1, 130.0, 35.49, 34.14, 35.58),              /* the highest floor on the screen */
    cand(27.1, 130.1, 34.48, 32.33, 35.15),
  ];
  const p = separablePair(calm, strong);
  assert.equal(p.repicked, true, 'the pair as found overlapped, so it was replaced');
  assert.ok(p.origGap <= 0, 'and the report carries what the pair as found was worth');
  assert.equal(p.separated, true);
  assert.deepEqual([p.eye.la, p.eye.lo], [25.1, 128.6],
    'the calm point whose footprint tops out lowest');
  assert.deepEqual([p.ring.la, p.ring.lo], [27.1, 130.0],
    'and the strong point whose footprint bottoms out highest');
  assert.equal(Math.round(p.gap * 100) / 100, 20.29);
  assert.deepEqual(p.considered, { calm: 3, strong: 3 }, 'and how many points it ranked');
});

/* ── ④ if even that pair overlaps, the hour is reported as unable to carry the claim ──────────
   ⚠ IN m/s, AND NAMING THE OVERLAP. 「could not be measured」 with no number is the same silence a
   `test.skip` produces; the point of this branch is that a reader can tell an unanswerable hour
   from a broken map without opening the trace. */
test('#R458 ④ an unseparable screen returns separated:false and explains it in m/s', () => {
  const calm = [cand(25.5, 128.5, 15.4, 12.0, 15.5), cand(25.4, 128.4, 15.2, 12.5, 15.6)];
  const strong = [cand(27.0, 130.0, 35.5, 15.045, 36.9), cand(27.1, 130.0, 33.0, 14.8, 35.0)];
  const p = separablePair(calm, strong);
  assert.equal(p.separated, false, 'no pair on this screen can carry the comparison');
  assert.equal(p.repicked, true, 'it did look for one');
  assert.ok(p.eye && p.ring, 'and it still names the best pair it found, so ① and ② can be asked');
  assert.match(p.why, /overlap by 0\.4[56] m\/s/, 'the reason states the overlap: ' + p.why);
  assert.match(p.why, /reaching 15\.50 m\/s/, 'and the calm ceiling: ' + p.why);
  assert.match(p.why, /dropping to 15\.0[45] m\/s/, 'and the strong floor: ' + p.why);
  assert.match(p.why, /2 calm and 2 strong candidates were ranked/, 'and how hard it looked');
  assert.match(p.why, /only the comparison ACROSS the pair is withheld/,
    'and that the two single-pixel verdicts are unaffected');
});

/* ── ⑤ an empty screen is a diagnosis, not a crash ────────────────────────────────────────────*/
test('#R458 ⑤ no candidates at all is reported rather than thrown', () => {
  const cases = [[[], []], [[cand(1, 1, 5, 4, 6)], []], [[], [cand(1, 1, 30, 29, 31)]], [null, null]];
  for (const [c, s] of cases) {
    const p = separablePair(c, s);
    assert.equal(p.separated, false);
    assert.equal(p.eye, null);
    assert.equal(p.ring, null);
    assert.match(p.why, /no pair to compare/, p.why);
  }
});

/* ── ⑥ two runs of the same hour choose the same pair ─────────────────────────────────────────
   A test that picks a different point each time it runs reports a different number each time it
   fails, and 「the choice moved」 is then indistinguishable from 「the map moved」. */
test('#R458 ⑥ ties are broken by position, so the choice is deterministic', () => {
  /* index 0 on each side is the pair as found, and it overlaps — so the ranking really runs */
  const calm = [cand(30, 30, 25, 20, 30),
    cand(20, 10, 9, 8, 9.5), cand(19, 11, 9, 8, 9.5), cand(19, 9, 9, 8, 9.5)];
  const strong = [cand(31, 31, 30, 29, 31),
    cand(21, 10, 30, 29, 31), cand(22, 12, 30, 29, 31), cand(22, 11, 30, 29, 31)];
  const a = separablePair(calm, strong);
  assert.equal(a.repicked, true, 'the pair as found overlapped, so the ranking is what answered');
  /* ⚠ index 0 is NOT interchangeable — it is the pair as found, and swapping it in would be a
     different question. What must not depend on order is the RANKING, so only the rest moves. */
  const b = separablePair([calm[0], ...calm.slice(1).reverse()],
    [strong[0], ...strong.slice(1).reverse()]);
  assert.deepEqual([a.eye.la, a.eye.lo], [19, 9],
    'the tie goes to the lowest latitude, then the lowest longitude');
  assert.deepEqual([a.ring.la, a.ring.lo], [21, 10]);
  assert.deepEqual([b.eye.la, b.eye.lo], [a.eye.la, a.eye.lo],
    'and the order the candidates arrive in does not move the choice');
  assert.deepEqual([b.ring.la, b.ring.lo], [a.ring.la, a.ring.lo]);
});

/* ── ⑦ the deployed-site test really gathers the candidates and really guards the claim ───────*/
test('#R458 ⑦ tests/prod-smoke.spec.js chooses its pair and withholds the claim it cannot make', () => {
  /* spelling kept — tests/prod-smoke.spec.js runs against the DEPLOYED site in a browser; what is pinned is that its claim is guarded by the decision ①–⑥ evaluate */
  const src = codeOnly(read('tests/prod-smoke.spec.js'));
  const a = src.indexOf('prod shows a real cyclone');
  const b = src.indexOf('prod offers the whole forecast');
  assert.ok(a > 0 && b > a, 'the cyclone test is still there, and still before the forecast one');
  const body = src.slice(a, b);

  /* the candidate scan: the finder's own line, the finder's own box, the finder's own lattice */
  assert.match(body, /const cut = e\.peak\.sp \* 0\.6;/,
    'calm and strong are split on the finder\'s own line');
  assert.match(body, /dla <= 1\.5[\s\S]{0,120}dlo <= 1\.5/, 'over the same box the storm was found in');
  assert.match(body, /dla \+= 0\.1[\s\S]{0,160}dlo \+= 0\.1/, 'on the same 0.1 degree lattice');
  assert.match(body, /add\(e\.eye\.la, e\.eye\.lo\)[\s\S]{0,240}add\(e\.peak\.la, e\.peak\.lo\)/,
    'with the finder\'s own pair first, so 「keep it when it works」 is expressible');
  assert.match(body, /eyeCands: calm, ringCands: strong/, 'and both lists are carried out of the page');

  /* the decision is taken OUT of the browser, and the claim is conditional on it */
  assert.match(body, /separablePair\(pic\.eyeCands, pic\.ringCands\)/, 'the pair is chosen in node');
  assert.match(body, /if \(pair\.separated\) \{/,
    'and the cross-claim is asked only when it is a question about the picture');
  const guard = body.indexOf('if (pair.separated) {');
  const guarded = body.slice(guard);
  assert.match(guarded, /toBeGreaterThan\(eyeFoot\[1\]\)/, 'the eyewall half is inside the guard');
  assert.match(guarded, /toBeLessThan\(ringFoot\[0\]\)/, 'and so is the eye half');
  /* (#R487) the bound moved out of squared RGB distance and into ΔE00; what this gate is for
     is that the claim stays INSIDE the guard, so the spelling is followed rather than frozen. */
  assert.match(guarded, /toBeGreaterThan\(VISIBLE_AT_A_GLANCE\)/,
    'and so is 「visibly different colours」');

  /* the two per-pixel verdicts are NOT inside it — they are answerable at every hour */
  const before = body.slice(0, guard);
  assert.match(before, /eyeRead\.inRange/, '#R287\'s colour claim is asked at every hour');
  assert.match(before, /ringRead\.speedInFootprint/, 'and so is the speed claim');

  /* ⚠ and the branch that cannot measure says so instead of disappearing */
  assert.ok(!/test\.skip/.test(guarded), 'an unmeasurable hour is not turned into a skip');
  assert.match(guarded, /console\.log\('\[R458\] ⚠ ' \+ note\)/, 'it is printed');
  assert.match(guarded, /annotations\.push\(\{ type: 'not measurable'/, 'and attached to the report');
  assert.match(guarded, /expect\(pic\.particles/, 'and the rest of the test still runs');
});

/* ── ⑧ …and one red no longer blanks the four tests underneath it ─────────────────────────────
   MEASURED on run 32818517323: this single assertion failed and the four below reported 「did not
   run」, so a deploy shipped with the forecast axis, both #R398 checks and #R333's CORS contract
   unasked. Serial mode was not protecting anything — a production outage never reaches a test at
   all, because `beforeAll` throws — so all it suppressed was four independent verdicts. */
test('#R458 ⑧ the production smoke does not cascade its skips', () => {
  /* spelling kept — same spec — the absence of serial mode and the order of its tests are facts about its text */
  const raw = read('tests/prod-smoke.spec.js');
  const src = codeOnly(raw);
  assert.ok(!/describe\.configure/.test(src),
    'tests/prod-smoke.spec.js no longer configures a serial group');
  assert.match(raw, /#R458\)[\s\S]{0,600}mode: 'serial'/,
    'and the reason it does not is written where the line used to be');

  /* the four verdicts the cascade was throwing away are still there, and still after the cyclone */
  const at = (needle) => {
    const i = src.indexOf(needle);
    assert.ok(i > 0, 'tests/prod-smoke.spec.js still asks: ' + needle);
    return i;
  };
  const cyclone = at('prod shows a real cyclone');
  for (const t of ['prod offers the whole forecast',
    'every ECMWF raster reports its value in the unit its own key names',
    'the isobars draw, at levels in the field unit',
    'prod deployed the CORS contract this commit declares']) {
    assert.ok(at(t) > cyclone,
      '「' + t + '」 is downstream of the cyclone test, which is why it was blanked');
  }

  /* the CORS one does not even open a page — it was being skipped for a browser it never used */
  const tail = src.slice(at('prod deployed the CORS contract this commit declares'));
  assert.match(tail, /async \(\{ request \}\)/, 'it runs on the request fixture alone');
  assert.ok(!/\bpage\b/.test(tail), 'and never touches the shared page');
});
