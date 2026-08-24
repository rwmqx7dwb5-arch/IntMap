/* ============================================================================
 *  IntMap · #R382 source checks — the cyclone pixel, and the moment it is read
 * ----------------------------------------------------------------------------
 *  The post-deploy smoke ("Deploy (production, Pages)") went red on 2026-08-24 and stayed red,
 *  identically, on four consecutive attempts:
 *
 *      and the eyewall nearer the entry for its own (49.6 m/s): ring [144,104,178]
 *      expect(received).toBeLessThan(expected)
 *      Expected: < 2954        // squared RGB distance to the EYE's entry
 *      Received:   18741       // squared RGB distance to its OWN entry
 *
 *  MEASURED against production this round, on the very hour the deploy ran on (run 2026-08-23
 *  18:00Z, valid 2026-08-24 01:00Z; typhoon peak 49.610327 m/s at 24.5°N 136.0°E, the eye the
 *  test picks 19.236341 m/s at 23.0°N 134.5°E):
 *
 *    · the eyewall pixel settles at 46.2 m/s once the z5 tiles land — and paints 42.1 m/s while
 *      the z3 ancestor is still stretched over the screen. The tiles land 1.2 s after the jump on
 *      a developer machine and **11.4 s** with the CPU throttled 10×, which is the range a shared
 *      two-core runner lives in. The test read at a flat 6 s and never asked.
 *    · what production read, 38.1 m/s, is coarser than either: an earlier state of that settling.
 *    · the picture itself was RIGHT. Read back through this ramp, the failure screenshot's own
 *      pixels reach 52 m/s in a pale core at the eyewall (bbox 924,346 … 940,351), with the
 *      38.1 m/s colour in a band around it.
 *    · the ±1.5 px patch under that pixel spans 45.20 … 50.72 m/s. `valueNow()` answers for the
 *      point at its centre — 49.61 — and the pixel answers for the patch. That is #R287's finding
 *      exactly, in the one place its fix had not been applied.
 *    · and RGB distance along this ramp DOES NOT ORDER SPEEDS: 195 of its 1,041 entries are nearer
 *      the eye's colour than the eyewall's while being nearer the eyewall in speed, because the
 *      ramp loops through colour space (35.9 → 46 m/s alone runs purple to near-white, 189 RGB
 *      units). The reading production took is one of those 195.
 *
 *  Both halves of the repair are checked here, because a verdict that only ever runs inside a
 *  browser against a healthy site is a verdict nobody has watched fail (#R274/#R287).
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SOURCE SEARCH. The note above the new assertions QUOTES the
 *  numbers of the old failure, so a check reading the raw file would find what it is asserting has
 *  gone — the seventeenth time this has had to be said.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colourFor, nearestEntry, readPixel, explain } from './helpers/wind-ramp.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── the shipped anchors, as DATA (no code is executed out of the source file) ────────────────
   ⚠ line-ending agnostic on purpose (#R283): sliced by name, never by a literal newline.
   ⚠ AND READ FROM THE SOURCE rather than pasted. Unlike #R287's recordings, every number in this
   file was measured on the palette that ships TODAY (#R293's, fitted to windy.com's own RGBA()),
   so if that palette is replaced these readings stop describing the map and this file must go red
   rather than keep agreeing with itself. */
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

/* the resampling stated independently of js/wx-ecmwf.js's `rampFrom` — same reason as #R287:
   a rewrite that changes the arithmetic is caught by the two of them disagreeing */
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
const RAMP = () => resample(anchors(), 0.1);
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/* ── THE INCIDENT, as data ───────────────────────────────────────────────────────────────────
   Every one of these was measured against the live site this round, at the hour the deploy ran
   on. `ANCESTOR` and `SETTLED` are the same pixel three seconds apart. */
const EYE_V = 19.236341, RING_V = 49.610327;      /* what `valueNow()` answers at the two points */
const EYE_FOOT = [18.88, 19.43];                  /* the ±1.5 px patch under the eye's pixel */
const RING_FOOT = [45.20, 50.72];                 /* …and under the eyewall's */
const RING_FOOT_3PX = [40.62, 51.46];             /* ±3 px, for the note about how far 38.1 is */
const DEPLOYED = [144, 104, 178];                 /* what the failing deploy read */
const ANCESTOR = [191, 160, 197];                 /* the z3 ancestor, still on screen at 0.7 s */
const SETTLED = [232, 216, 213];                  /* the z5 tiles, from 1.2 s on */
const EYE_PX = [169, 78, 139];                    /* the eye, which settles immediately */

/* ── ① the pixel the deployment read is not a reading of the view it was taken in ────────────
   38.1 m/s is not merely low, it is outside the patch of atmosphere the pixel covers — and stays
   outside at twice the filter's support. So the ONLY honest description of that reading is 「this
   is a picture of somewhere else, at a coarser zoom」, which is what the wait now prevents. */
test('#R382 ① the eyewall pixel the failing deploy read is outside the field under it', () => {
  const ramp = RAMP();
  const n = nearestEntry(ramp, DEPLOYED);
  assert.equal(n.v, 38.1, 'it is the table\'s entry for 38.1 m/s');
  assert.ok(n.distance < 6, 'and it is on the table (distance ' + n.distance.toFixed(1) + ')');
  const v = readPixel(ramp, DEPLOYED, RING_FOOT[0], RING_FOOT[1]);
  assert.equal(v.speedInFootprint, false,
    '38.1 m/s is not a speed the model has under that pixel — ' + explain(DEPLOYED, v));
  assert.ok(n.v < RING_FOOT_3PX[0],
    'and it is still outside at ±3 px (' + RING_FOOT_3PX[0] + '…' + RING_FOOT_3PX[1] + ' m/s)');
});

/* ── ② …and this is the shape of the assertion that went red on it ───────────────────────────
   Reproduced to the integer, because the two numbers are the whole argument: the pixel was NEARER
   THE EYE'S COLOUR THAN ITS OWN, on a ramp where 「its own」 is eleven metres per second away. */
test('#R382 ② the old question — nearer its own entry than the other\'s — fails on it, 18741 vs 2954', () => {
  const ramp = RAMP();
  const ringWant = colourFor(ramp, RING_V), eyeWant = colourFor(ramp, EYE_V);
  assert.deepEqual(ringWant, [223, 214, 158], 'the entry for 49.61 m/s');
  assert.deepEqual(eyeWant, [171, 79, 138], 'and for 19.24 m/s');
  assert.equal(d2(DEPLOYED, ringWant), 18741, 'the distance the failure printed as Received');
  assert.equal(d2(DEPLOYED, eyeWant), 2954, 'and the one it printed as Expected');
  assert.ok(d2(DEPLOYED, ringWant) > d2(DEPLOYED, eyeWant), 'which is the failure, verbatim');
});

/* ── ③ WHY THE QUESTION HAD TO CHANGE, AND NOT THE NUMBERS ───────────────────────────────────
   ⚠⚠⚠ RGB DISTANCE ALONG THIS RAMP DOES NOT ORDER SPEEDS. That is the whole defect, and it is the
   same shape as #R276 追記's — 「red − blue is not monotone along this ramp」 — one layer up: the
   old assertion replaced a hand-rolled measure with distance-to-a-table-entry, which is read from
   the table and still is not monotone, because the ramp LOOPS through colour space (it climbs from
   blue through green and brown into magenta, doubles back through purple, and only then runs out
   to near-white and khaki).
   MEASURED on the shipped table: 195 of its 1,041 entries — the whole strong half, 34.5 m/s
   upward — are nearer the EYE's colour than the EYEWALL's while being nearer the EYEWALL in speed.
   The reading the failing deploy took is one of those 195. Nothing about that is a tolerance that
   could be widened; a question decided by it is not measuring the picture. */
test('#R382 ③ distance along this ramp does not order speeds — 195 of 1,041 entries invert it', () => {
  const a = anchors(), ramp = RAMP();
  const cEye = colourFor(ramp, EYE_V), cRing = colourFor(ramp, RING_V);
  const inverted = ramp.breakpoints.filter((v, i) =>
    Math.abs(v - RING_V) < Math.abs(v - EYE_V) && d2(ramp.colors[i], cRing) > d2(ramp.colors[i], cEye));
  assert.equal(ramp.breakpoints.length, 1041, 'the resampled table');
  assert.equal(inverted.length, 195, 'entries nearer the eyewall in speed, nearer the eye in colour');
  assert.ok(inverted.includes(38.1), 'and 38.1 m/s — what the deploy read — is one of them');
  assert.equal(inverted[0], 34.5, 'they begin at 34.5 m/s and run to the top of the ramp');
  /* the segment the eyewall sits in is where the ramp turns hardest: purple to near-white */
  assert.ok(a.breakpoints.includes(35.9) && a.breakpoints.includes(46),
    'both are still anchors of the shipped table');
  const gap = Math.sqrt(d2(colourFor(ramp, 35.9), colourFor(ramp, 46)));
  assert.ok(gap > 180, 'which spans ' + gap.toFixed(0) + ' RGB units over 10.1 m/s');
});

/* ── ④ the settled pixel — the one the map actually shows — is accepted, exactly ──────────────
   No tolerance is introduced anywhere: 46.2 m/s is inside 45.20 … 50.72, which is the field's own
   range under that pixel. `valueNow` says 49.61 and the pixel says 46.2; both are true of the same
   air, and only one of them is a claim about a picture. */
test('#R382 ④ the settled eyewall pixel passes the verdict that replaced it', () => {
  const ramp = RAMP();
  const v = readPixel(ramp, SETTLED, RING_FOOT[0], RING_FOOT[1]);
  assert.equal(nearestEntry(ramp, SETTLED).v, 46.2, 'the settled pixel reads as 46.2 m/s');
  assert.equal(v.inRange, true, 'inside the band the table paints there — ' + explain(SETTLED, v));
  assert.equal(v.speedInFootprint, true, 'and 46.2 m/s is a speed the model really has there');
  const e = readPixel(ramp, EYE_PX, EYE_FOOT[0], EYE_FOOT[1]);
  assert.equal(e.inRange, true, 'the eye likewise — ' + explain(EYE_PX, e));
  assert.equal(e.speedInFootprint, true, 'and its colour stands for a speed the model has there');
});

/* ── ⑤ 「you can see the eye」, in m/s ──────────────────────────────────────────────────────────
   The replacement for the RGB comparison. Both bounds are read off the field — the eye's patch
   and the eyewall's — so there is no number here that anyone chose. */
test('#R382 ⑤ the two pixels sit on opposite sides of the gap between the two patches', () => {
  const ramp = RAMP();
  const ring = nearestEntry(ramp, SETTLED).v, eye = nearestEntry(ramp, EYE_PX).v;
  assert.ok(ring > EYE_FOOT[1],
    'the eyewall pixel (' + ring + ') is above everything under the eye (' + EYE_FOOT[1] + ')');
  assert.ok(eye < RING_FOOT[0],
    'and the eye pixel (' + eye + ') below everything under the eyewall (' + RING_FOOT[0] + ')');
  assert.ok(d2(SETTLED, EYE_PX) > 900, 'and they are visibly different colours');
});

/* ── ⑥ the verdict still refuses what it exists to refuse ────────────────────────────────────
   ⚠ THE POINT OF ④/⑤ IS NOT THAT EVERYTHING PASSES. Two failures the round before last would have
   shipped are put through the same code: the night shading multiplied over the raster (#R276), and
   a plausible colour from the wrong part of the storm. Both are refused on the same footprint that
   accepts the real pixel. */
test('#R382 ⑥ a dimmed pixel and a plausible-but-wrong colour are both still refused', () => {
  const ramp = RAMP();
  const dimmed = SETTLED.map((v) => Math.round(v * 0.36));
  const dv = readPixel(ramp, dimmed, RING_FOOT[0], RING_FOOT[1]);
  assert.equal(dv.inRange, false, '#R276\'s 0.36× grey leaves the envelope: ' + JSON.stringify(dimmed));
  assert.equal(dv.speedInFootprint, false, 'and stands for no speed the field has there');
  /* the eye's own colour, painted at the eyewall — on the table, plausible, and wrong */
  const wrong = colourFor(ramp, 30);
  const wv = readPixel(ramp, wrong, RING_FOOT[0], RING_FOOT[1]);
  assert.equal(wv.speedInFootprint, false,
    '30 m/s is not in 45.20…50.72 — ' + explain(wrong, wv));
  /* …and the ANCESTOR reading is refused too, which is what makes the wait load-bearing */
  const av = readPixel(ramp, ANCESTOR, RING_FOOT[0], RING_FOOT[1]);
  assert.equal(nearestEntry(ramp, ANCESTOR).v, 42.1, 'the z3 ancestor reads as 42.1 m/s');
  assert.equal(av.speedInFootprint, false, 'which the field does not have under that pixel either');
});

/* ── ⑦ the wait is in the shipped test, and it is a wait on the PICTURE ──────────────────────
   ⚠ A rule written in a comment is not a rule (CONSTITUTION.md). The failing deploy read after a
   flat `setTimeout(…, 6000)`; what stands there now must ask the map whether the raster of the
   current view has landed, and must find the source id in the live style rather than naming one of
   the two slots js/weather.js alternates between. */
test('#R382 ⑦ the cyclone smoke waits for the wind raster of the new view, not for a clock', () => {
  const src = read('tests/prod-smoke.spec.js');
  const a = src.indexOf('prod shows a real cyclone');
  assert.ok(a > 0, 'the cyclone test is still there');
  const b = src.indexOf('test(', src.indexOf('map.triggerRepaint()', a));
  const body = codeOnly(src.slice(a, b > a ? b : src.length));
  assert.ok(/isSourceLoaded/.test(body), 'it asks the map whether the raster source has loaded');
  assert.ok(/getStyle\(\)[\s\S]{0,120}wind-field-/.test(body),
    'and finds the source id in the live style rather than naming a slot');
  assert.ok(/settled/.test(body), 'the outcome of that wait is carried out to an assertion');
  assert.ok(!/setTimeout\([^)]*6000\)/.test(body),
    'and the flat six-second sleep it used to read after is gone');
  /* ⚠⚠ MEASURED while writing this round: asked immediately after `jumpTo`, `isSourceLoaded`
     answers TRUE — the source cache still holds the previous viewport — and the wait reported
     「settled in 0.0 s」, reading the very frame it exists to avoid. So the look must come after a
     render, and two consecutive looks must agree. With both in place the same run reports 1.5 s,
     which is what the standalone measurement of that jump gives (1.24 s). */
  assert.ok(/once\('render'[\s\S]{0,200}triggerRepaint/.test(body),
    'each look at that answer is taken after a frame has actually been drawn');
  assert.ok(/agree\s*>=\s*2|agree\s*>\s*1/.test(body),
    'and two consecutive looks must agree before the picture counts as settled');
  assert.ok(/readPixel\(/.test(body) && /Foot\[0\]/.test(body),
    'the verdict is #R287\'s, taken over the footprint of each pixel');
});

/* ── ⑧ …and the two slots it must not name are really there ──────────────────────────────────
   The reason ⑦ forbids naming one: js/weather.js builds the new hour in the free slot and reveals
   it, so whichever id was written down here would be the one NOT on screen half the time — and
   `isSourceLoaded('a source that does not exist')` answers undefined, which reads as 「loaded」 to
   anything that does not compare it strictly. */
test('#R382 ⑧ js/weather.js really alternates between two wind-field slots', () => {
  const w = codeOnly(read('js/weather.js'));
  const m = w.match(/SLOT\s*=\s*\[([\s\S]{0,240}?)\]/);
  assert.ok(m, 'js/weather.js declares the slot table');
  const ids = [...m[1].matchAll(/src:\s*'([^']+)'/g)].map((x) => x[1]);
  assert.equal(ids.length, 2, 'two slots: ' + ids.join(', '));
  for (const id of ids) assert.match(id, /^wind-field-/, id + ' is matched by the test\'s filter');
});
