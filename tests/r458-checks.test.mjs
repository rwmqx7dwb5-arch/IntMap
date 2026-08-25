/* ============================================================================
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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { separablePair, readPixel } from './helpers/wind-ramp.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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
  assert.match(guarded, /toBeGreaterThan\(900\)/, 'and so is 「visibly different colours」');

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
