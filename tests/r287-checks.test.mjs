/* ============================================================================
 *  IntMap · #R287 source checks — the wind pixel verdict
 * ----------------------------------------------------------------------------
 *  The post-deploy smoke has failed since #R284 on this one assertion:
 *
 *      expect(m.px.slice(0, 3)).toEqual(m.want.slice(0, 3).map(Math.round))
 *
 *  and the two numbers it printed were `[43,167,127]` expected against `[42,166,132]` received.
 *  ⚠⚠⚠ BOTH OF THOSE ARE ENTRIES OF THE APP'S OWN RESAMPLED TABLE — 6.7 m/s and 6.5 m/s. The
 *  assertion was never comparing the app's ramp against the SDK's raw seventeen colours;
 *  `IntMapECMWF.scale()` returns the 601-entry ramp and always did. What #R284 changed was the
 *  COLOUR RESOLUTION, and with it an accident the assertion had been resting on: a raster texel
 *  read through `raster-resampling: linear` answers for the patch of atmosphere under the pixel,
 *  `valueNow()` answers for the point at its centre, and under seventeen flat bands those two
 *  readings produced the SAME colour. At 0.1 m/s they are one to eight steps apart.
 *
 *  MEASURED against production (z3, 150°E 20°N, overlay layers hidden, 81 pixels):
 *      · 20 of 78 painted pixels are the entry for the POINT value            (26 % — a coin flip)
 *      · 78 of 78 are the entry for SOME speed the field takes within 1 px    (100 %)
 *      · a pixel dimmed to 0.36× — the #R276 defect — is 128 RGB units from the nearest entry.
 *
 *  ⚠⚠⚠ AND THE FIRST ATTEMPT AT THIS ROUND WAS STILL TOO STRONG, WHICH PRODUCTION SAID WITHIN
 *  MINUTES. It demanded that the pixel BE a table entry; 78 of 81 were, but that was a property of
 *  that hour's air, not of the renderer. The seventeen anchors are CORNERS — the ramp is linear
 *  between them and turns at them — so a patch that straddles an anchor is blended across the corner
 *  and lands on the chord, beside the curve: pixel [44,168,123] against [44,168,122] at 6.9 m/s,
 *  distance 1.0, footprint 6.69…8.69 m/s. So the colour claim is the ENVELOPE the table paints for
 *  the speeds that are really there — still no tuned number, and it collapses to exact equality
 *  wherever the air is uniform. The SPATIAL ambiguity is settled in space, which is the move
 *  #R276 追記3 already made for the eyewall pair. This file puts that verdict through the failures it
 *  has to catch, because a verdict that only ever runs in a browser against a healthy site is a
 *  verdict nobody has watched fail (#R274).
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SOURCE SEARCH — the sixteenth time. The comment above the
 *  new assertion QUOTES the old one, so a check reading the raw file would find what it is
 *  asserting has gone.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryIndexFor, colourFor, indicesPainted, speedsPainted, nearestEntry, readPixel, explain }
  from './helpers/wind-ramp.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── the shipped anchors, as DATA (no code is executed out of the source file) ────────────────
   ⚠ line-ending agnostic on purpose (#R283): the block is sliced by name, never by a literal
   newline, so this file is not one of the ones that is red on Windows and green in CI. */
function anchors() {
  const src = codeOnly(read('js/wx-ecmwf.js'));
  const a = src.indexOf('var WIND_ANCHORS'), b = src.indexOf('var WINDY_WIND');
  assert.ok(a > 0 && b > a, 'js/wx-ecmwf.js still declares WIND_ANCHORS before WINDY_WIND');
  const block = src.slice(a, b);
  const bp = JSON.parse(block.match(/breakpoints:\s*(\[[^\]]*\])/)[1]);
  const colors = [...block.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\]/g)]
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  return { breakpoints: bp, colors };
}

/* The ramp, stated INDEPENDENTLY of `rampFrom` — 「同じ17色を 0.1 m/s へ再標本化、あいだは sRGB で
   線形」. js/wx-ecmwf.js holds the implementation and tests/r284-checks.test.mjs ⑧ guards the call
   site; this is the specification, so a rewrite that changes the arithmetic is caught by the two
   of them disagreeing rather than by nobody. */
function resample(a, step) {
  const bp = a.breakpoints, cols = a.colors;
  const lo = bp[0], hi = bp[bp.length - 1];
  const out = { breakpoints: [], colors: [] };
  const n = Math.round((hi - lo) / step);
  let seg = 0;
  for (let k = 0; k <= n; k++) {
    const v = lo + k * step;
    while (seg < bp.length - 2 && v >= bp[seg + 1]) seg++;
    const span = (bp[seg + 1] - bp[seg]) || 1;
    let f = (v - bp[seg]) / span; if (f < 0) f = 0; if (f > 1) f = 1;
    const c0 = cols[seg], c1 = cols[Math.min(seg + 1, cols.length - 1)];
    out.breakpoints.push(Math.round(v * 1000) / 1000);
    out.colors.push([Math.round(c0[0] + (c1[0] - c0[0]) * f),
      Math.round(c0[1] + (c1[1] - c0[1]) * f),
      Math.round(c0[2] + (c1[2] - c0[2]) * f)]);
  }
  return out;
}

/* a small hand-written scale — every entry visible, so the pure logic is checked on something
   whose right answer can be read off the page rather than computed */
const TOY = { breakpoints: [0, 1, 2, 3], colors: [[10, 10, 10], [20, 20, 20], [30, 30, 30], [40, 40, 40]] };

/* ── ① the bucket rule is the SDK's: entry i owns [bp[i], bp[i+1]) ───────────────────────────
   A table of this shape is a nearest-BUCKET lookup, not an interpolation — that is the whole
   reason #R284 had to resample rather than ask the SDK for a gradient. If this file read the
   table one index differently from the renderer, every verdict below would be measuring the
   wrong entry, so the semantics are pinned here and pinned AGAIN against the live SDK in
   tests/prod-smoke.spec.js (`colourFor(m.ramp, m.sp)` vs the SDK's own `getColor`).           */
test('#R287 ① a value is painted by the last entry at or below it', () => {
  assert.equal(entryIndexFor(TOY, 0), 0, 'exactly on the floor');
  assert.equal(entryIndexFor(TOY, 0.999), 0, 'just under the next breakpoint');
  assert.equal(entryIndexFor(TOY, 1), 1, 'exactly on a breakpoint takes the HIGHER entry');
  assert.equal(entryIndexFor(TOY, 2.5), 2, 'inside a bucket');
  assert.equal(entryIndexFor(TOY, 3), 3, 'exactly on the ceiling');
  assert.equal(entryIndexFor(TOY, 99), 3, 'above the ceiling stays on the last entry');
  assert.equal(entryIndexFor(TOY, -5), 0, 'below the floor stays on the first');
  assert.equal(entryIndexFor(TOY, NaN), 0, 'and a NaN cannot select a middle entry');
  assert.deepEqual(colourFor(TOY, 2.5), [30, 30, 30]);
});

/* ── ② the envelope is read off the FIELD, not chosen — and it is tight where the air is ──────
   This is the half that carries #R276: 「anything looser passes while half the planet is grey」.
   There is no tolerance to widen: the bound IS the set of colours the table paints for the speeds
   that are really there. Where the air under a pixel is uniform the envelope collapses to a single
   entry and the question is exact equality again — the strongest form, recovered for free.       */
test('#R287 ② a uniform footprint collapses the envelope to one entry', () => {
  const ramp = resample(anchors(), 0.1);
  const real = colourFor(ramp, 6.5);
  const v = readPixel(ramp, real, 6.5, 6.5);
  assert.equal(v.band.entries, 1, 'one speed, one entry, no width at all');
  assert.equal(v.inRange, true, 'the table’s own colour passes');
  for (const ch of [0, 1, 2]) for (const d of [-1, 1]) {
    const near = real.slice(); near[ch] += d;
    assert.equal(readPixel(ramp, near, 6.5, 6.5).inRange, false,
      JSON.stringify(near) + ' does not, because there is nothing to be inside of');
  }
});

/* ── ③ the #R276 defect — a pixel with the night shading multiplied over it ──────────────────
   MEASURED in production when it was real: the table asked for rgb(40,130,180) and the screen
   carried rgb(15,43,64), 0.36×. The verdict must refuse it OUTRIGHT, on the colour claim, before
   any question about speed is reached.                                                          */
test('#R287 ③ a pixel dimmed by the night shading is refused, and by a wide margin', () => {
  const ramp = resample(anchors(), 0.1);
  const honest = colourFor(ramp, 6.5);
  const dimmed = honest.map((v) => Math.round(v * 0.36));
  const v = readPixel(ramp, dimmed, 6.4, 6.9);
  assert.equal(v.inRange, false, 'the dimmed pixel is outside the band the table paints there');
  assert.equal(v.speedInFootprint, false, 'and the speed it reads as is not one the field takes');
  assert.ok(v.nearest.distance > 100,
    'it is nowhere near — measured ' + v.nearest.distance.toFixed(1) + ' RGB units');
  /* ⚠ AND IT LEAVES THE ENVELOPE ON THE FIRST CHANNEL IT IS CHECKED ON — an attenuation of only
     10 % is refused too, which is what 「anything looser passes while half the planet is grey」 asked
     for. The envelope is narrow because the air under a pixel is nearly uniform; where it is not,
     the envelope widens and the test is honestly weaker — by exactly the amount the field is. */
  for (const k of [0.36, 0.5, 0.75, 0.9]) {
    const d = honest.map((x) => Math.round(x * k));
    assert.equal(readPixel(ramp, d, 6.4, 6.9).inRange, false,
      'attenuation to ' + k + '× is refused: ' + JSON.stringify(d));
  }
  assert.equal(readPixel(ramp, honest, 6.4, 6.9).inRange, true, 'while 1.0× passes');
  /* the historical pair, verbatim */
  const was = readPixel(ramp, [15, 43, 64], 2, 4);
  assert.equal(was.inRange, false, 'and so is the rgb(15,43,64) the #R276 round actually saw');
});

/* ── ④ a blend ACROSS AN ANCHOR is off the table, and must still be accepted ─────────────────
   ⚠⚠⚠ THIS IS THE ONE THE FIRST ATTEMPT AT THIS ROUND GOT WRONG, AND PRODUCTION SAID SO WITHIN
   MINUTES OF THE DEPLOY. The first version demanded that the pixel BE a table entry. The seventeen
   anchors are corners — the ramp is linear between them and turns at them — so when the patch under
   one pixel straddles an anchor, `raster-resampling: linear` blends colours from either side of the
   corner and lands on the CHORD, beside the curve. MEASURED on the live site: pixel [44,168,123],
   nearest entry [44,168,122] at 6.9 m/s, distance 1.0, footprint 6.69…8.69 m/s — which crosses the
   7 m/s anchor. A correct render, refused by a claim that was too strong.                        */
test('#R287 ④ the production pixel that crossed the 7 m/s anchor is accepted', () => {
  const ramp = resample(anchors(), 0.1);
  const PX = [44, 168, 123];
  assert.equal(indicesPainted(ramp, PX).length, 0, 'it is genuinely not a table entry…');
  assert.equal(nearestEntry(ramp, PX).distance, 1, '…it is one unit from [44,168,122] at 6.9 m/s');
  assert.ok(anchors().breakpoints.includes(7), 'and 7 m/s is one of the seventeen anchors');
  const v = readPixel(ramp, PX, 6.69, 8.69);
  assert.equal(v.inRange, true, 'the chord is inside the envelope: ' + explain(PX, v));
  assert.equal(v.speedInFootprint, true, 'and 6.9 m/s is a speed that footprint contains');
});

/* ── ⑤ the deployment that failed, recorded as a test ────────────────────────────────────────
   R284's post-deploy smoke printed `- [43,167,127]` against `+ [42,166,132]` and failed all four
   retries. This is that failure, and the point of the test is that NEITHER number is wrong: they
   are the table's entries for 6.7 m/s and 6.5 m/s, two readings of the same air 0.2 m/s apart.  */
test('#R287 ⑤ both numbers the failed deployment printed are entries of the app\'s own table', () => {
  const ramp = resample(anchors(), 0.1);
  assert.equal(ramp.breakpoints.length, 601, 'the ramp is the resampled one');
  assert.equal(Math.round((ramp.breakpoints[1] - ramp.breakpoints[0]) * 1000) / 1000, 0.1, 'at 0.1 m/s');

  const WANT = [43, 167, 127];    /* what getColor(scale, valueNow) returned */
  const PAINTED = [42, 166, 132]; /* what the canvas actually carried        */
  assert.deepEqual(speedsPainted(ramp, WANT), [6.7], 'the expected colour is the entry for 6.7 m/s');
  assert.deepEqual(speedsPainted(ramp, PAINTED), [6.5], 'the painted colour is the entry for 6.5 m/s');
  assert.equal(nearestEntry(ramp, PAINTED).distance, 0, 'the painted pixel was exactly on the table');

  /* the OLD form: false, because the two readings are 0.2 m/s apart */
  assert.notDeepEqual(PAINTED, WANT, 'which is why the old assertion failed');
  /* the NEW form: true, because 6.5 m/s is a speed the field takes under that pixel */
  const v = readPixel(ramp, PAINTED, 6.42, 6.79);
  assert.equal(v.inRange, true);
  assert.equal(v.speedInFootprint, true, explain(PAINTED, v));

  /* ⚠ and it is NOT true for just any footprint — the claim still has teeth */
  const far = readPixel(ramp, PAINTED, 12, 14);
  assert.equal(far.speedInFootprint, false,
    'a pixel painted for 6.5 m/s over air blowing at 12–14 m/s is still a failure');
  assert.equal(far.inRange, false, 'and it is not inside that band either');
});

/* ── ⑥ the half-open interval is honoured at the top end ─────────────────────────────────────
   An entry stands for [bp, bp+0.1), so a footprint of 6.74…6.84 m/s legitimately paints the 6.7
   entry even though 6.7 is BELOW the whole footprint. Getting this wrong would reintroduce the
   very failure being fixed, one step down — MEASURED at the map centre: point value 6.788,
   footprint 6.74…6.84, painted colour the 6.7 entry.                                            */
test('#R287 ⑥ an entry covers the speeds up to the next one, not just its own number', () => {
  const ramp = resample(anchors(), 0.1);
  const px = colourFor(ramp, 6.75);
  assert.deepEqual(px, [43, 167, 127], 'ie. the 6.7 entry, exactly as production paints it');
  assert.equal(readPixel(ramp, px, 6.74, 6.84).speedInFootprint, true,
    'a footprint entirely above 6.7 still accepts the entry that owns 6.7…6.8');
  assert.equal(readPixel(ramp, px, 6.81, 6.9).speedInFootprint, false,
    'but a footprint entirely above 6.8 does not — the interval is half-open, not unbounded');
  assert.equal(indicesPainted(ramp, px).length, 1, 'and this colour belongs to exactly one entry');
});

/* ── ⑦ the production smoke really asks the new question, and no longer the old one ──────────
   ⚠ THE DELETION CHECK COUNTS WHAT MUST SURVIVE TOO, so a fix that went too far is red as well.  */
test('#R287 ⑦ tests/prod-smoke.spec.js asserts both claims and drops the point-value equality', () => {
  const src = codeOnly(read('tests/prod-smoke.spec.js'));
  assert.match(src, /readPixel\(m\.ramp, m\.px\.slice\(0, 3\), m\.lo, m\.hi\)/, 'the verdict is taken');
  assert.match(src, /verdict\.inRange/, 'the colour claim is asserted');
  assert.match(src, /verdict\.speedInFootprint/, 'and the speed claim');
  assert.ok(!/toEqual\(m\.want\.slice\(0, 3\)\.map\(\(v\) => Math\.round\(v\)\)\);\s*\n\s*expect\(m\.px\[3\]/.test(src),
    'the old point-value equality is gone from the wind-pixel test');
  /* what must survive: the SDK is still the authority on how the table is read */
  assert.match(src, /colourFor\(m\.ramp, m\.sp\)/, 'the bucket rule is still pinned against the SDK');
  assert.match(src, /m\.ramp\.breakpoints\.length[\s\S]{0,120}\.toBe\(601\)/,
    'and the deployed build is still required to ship the resampled ramp');
  /* the sibling test keeps ITS form — #R276 追記3's comparison is not collateral damage */
  assert.match(src, /the eye is painted nearer the entry for its own speed/, 'the eyewall pair is untouched');
  assert.equal((src.match(/gl\.readPixels\(/g) || []).length, 2,
    'both canvas reads survive — the wind pixel and the eye/eyewall pair');
});

/* ── ⑧ settling the time axis must not cancel the load of the hour it is announcing ──────────
   ⚠⚠⚠ THE SECOND FAILURE, WHICH THE FIRST ONE HAD BEEN HIDING. tests/prod-smoke.spec.js runs
   `test.describe.configure({ mode: 'serial' })`, so when the wind-pixel test above failed the two
   after it were never RUN — they reported as skipped, and the deploy log showed one red test where
   there were two. Fixing the first unmasked this.

   `fireTime()` — the coalesced 「the axis has settled」 event #R284 introduced — dropped the stale
   frame with an unqualified `release()`, and `release()` clears `loadingKey` as well as `held`. In
   #R276 that same line lived in `setIndex` and ran SYNCHRONOUSLY, so nothing could be in flight yet;
   deferred by COALESCE_MS it lands 140 ms later, in the middle of any load started in that window.
   The load then resolves, finds `loadingKey` no longer equal to its own key, declines to install
   itself and returns null — after decoding 27 MB.

   ⚠ That is #R276 追記2's defect one axis over: there, one VARIABLE's teardown cancelled another
   variable's read; here the TIME axis cancels a read of the hour it is itself announcing.
   MEASURED: the deployed build failed `typeof r.b.v === 'number'` on all four attempts, in
   isolation as well as in sequence, and a retry 1.5 s later returned 25.27 °C. Against a local
   build of the same tree the test failed unfixed and passed fixed — the same environment both
   times, so the fix is what moved it.                                                            */
test('#R287 ⑧ the coalesced time event drops the frame without cancelling the current load', () => {
  const src = codeOnly(read('js/wx-ecmwf.js'));
  const i = src.indexOf('function fireTime(');
  assert.ok(i > 0, 'fireTime still exists');
  const body = src.slice(i, src.indexOf('function setIndex(', i));

  assert.ok(!/\brelease\(\)/.test(body),
    'fireTime no longer calls release() unqualified — that is what cleared loadingKey');
  assert.match(body, /held = null/, 'but the stale frame is still dropped (the 27 MB still goes)');
  assert.match(body, /fileUrl\(idx\)/, 'and the survivor is identified by the CURRENT hour\'s file');
  assert.match(body, /loadingKey[\s\S]{0,80}indexOf\(here\) !== 0[\s\S]{0,40}loadingKey = ''/,
    'a load for some OTHER hour is still abandoned, exactly as before');

  /* what must survive elsewhere: release() is still there for the axis it was written for */
  assert.match(src, /function release\(variable\)/, 'release(variable) itself is untouched');
  assert.match(codeOnly(read('js/weather.js')), /EC\(\)\.release\(VAR\)/,
    'and a layer switching off still drops only its own frame (#R276 追記2)');
});
