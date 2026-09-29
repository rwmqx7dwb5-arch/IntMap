/* ============================================================================
 *  IntMap · the wind pixel verdict — a picture is judged by the field under it, in the reader's unit
 * ----------------------------------------------------------------------------
 *  本番 smoke の風ピクセル・台風の目の判定（#R287・#R382）と、「見て違う」の単位 ΔE00（#R487）。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coldWxModel, until } from './helpers/wx-ecmwf-page.mjs';
import { entryIndexFor, colourFor, indicesPainted, speedsPainted, nearestEntry, readPixel, explain } from './helpers/wind-ramp.js';
import { deltaE00, VISIBLE_AT_A_GLANCE, deltaE00Lab, labFromRgb } from './helpers/colour-difference.js';
import { codeOnly } from '../scripts/code-only.mjs';

/* (tests-by-topic) tests/helpers/wx-ecmwf-page.mjs `coldWxModel` installs a page as globalThis.window /
   document / fetch and leaves it there. When each round was its own file that ended with the process;
   here several rounds share one, so every test starts from the globals the file started with. */
const GLOBALS_AT_START = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
afterEach(() => {
  for (const [k, v] of Object.entries(GLOBALS_AT_START)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
});

/* ════════ #R287 — from tests/r287-checks.test.mjs ════════ */
{
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
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* ══ ⚠⚠⚠ (#R664) THE TICKET MOVED, SO THIS CHECK STOPPED READING THE SOURCE ═══════════════════════
   Until #R664 the supersession rule below was asserted as a SPELLING — `var mine = ++seq`, `if
   (seq === mine)`. That round found the defect those spellings hid: the ticket was taken IN THE
   CALL while the join was made later, in the `ready()` continuation, so a second call for the SAME
   read superseded the read it was about to join and both callers were answered null (production:
   the first switch-on of the first weather layer of a page failed, three times out of three). The
   fix issues the ticket where the read is IDENTIFIED, and every one of those spellings changed
   while the property this check was written for did not. A check that pins a spelling can only
   prove that an implementation is still the one it was written against (#R488), so the property is
   MEASURED against the shipped module from here on.
   ⚠ The page it is measured on is tests/helpers/wx-ecmwf-page.mjs — ONE page, shared by the six
   files that need it, because six copies of one judgement is the shape
   .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. The browser and the Open-Meteo SDK are
   stubbed there; nothing else is — the rule under test is the one that ships. */


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

/* ══ ⚠⚠⚠ (#R293) THE INCIDENTS BELOW ARE ABOUT A PARTICULAR PALETTE, SO THEY CARRY IT ═════════
   ④, ⑤ and ⑥ are three RECORDED PRODUCTION READINGS — [44,168,123], [43,167,127], [42,166,132] —
   and the whole value of this file is that the envelope logic has been watched failing against
   real numbers. Those numbers are entries of the table that was shipped when they were measured.
   「Windyと完全に同じ風速と色の対応にしてください」 replaced that table with windy.com's own
   (measured through `RGBA()`, 27 stops, worst error 3/255), so the recordings are no longer
   entries of the LIVE ramp — and re-pointing them at whatever ships today would quietly delete the
   failure this file exists to reproduce.
   → the incidents keep the palette they happened on, declared here as data; every structural claim
   (declared before WINDY_WIND, resampled at a fixed step, the bucket rule) still reads the SOURCE
   through `anchors()` above. */
const R284_ANCHORS = {
  breakpoints: [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 20, 23, 26, 30, 36, 45, 60],
  colors: [[98, 113, 184], [61, 99, 174], [40, 130, 180], [36, 160, 168], [44, 168, 120],
    [62, 175, 80], [110, 185, 60], [160, 195, 55], [214, 202, 60], [236, 170, 50], [240, 130, 46],
    [235, 92, 50], [224, 56, 60], [210, 40, 110], [200, 70, 175], [214, 140, 220], [240, 220, 245]],
};

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
  const ramp = resample(R284_ANCHORS, 0.1);   /* (#R293) the palette the reading was taken on */
  const PX = [44, 168, 123];
  assert.equal(indicesPainted(ramp, PX).length, 0, 'it is genuinely not a table entry…');
  assert.equal(nearestEntry(ramp, PX).distance, 1, '…it is one unit from [44,168,122] at 6.9 m/s');
  assert.ok(R284_ANCHORS.breakpoints.includes(7), 'and 7 m/s is one of the seventeen anchors');
  assert.ok(anchors().breakpoints.includes(7), 'and 7 m/s is still an anchor of the shipped table');
  const v = readPixel(ramp, PX, 6.69, 8.69);
  assert.equal(v.inRange, true, 'the chord is inside the envelope: ' + explain(PX, v));
  assert.equal(v.speedInFootprint, true, 'and 6.9 m/s is a speed that footprint contains');
});

/* ── ⑤ the deployment that failed, recorded as a test ────────────────────────────────────────
   R284's post-deploy smoke printed `- [43,167,127]` against `+ [42,166,132]` and failed all four
   retries. This is that failure, and the point of the test is that NEITHER number is wrong: they
   are the table's entries for 6.7 m/s and 6.5 m/s, two readings of the same air 0.2 m/s apart.  */
test('#R287 ⑤ both numbers the failed deployment printed are entries of the app\'s own table', () => {
  const ramp = resample(R284_ANCHORS, 0.1);   /* (#R293) the palette the deployment shipped */
  assert.equal(ramp.breakpoints.length, 601, 'the ramp is the resampled one');
  assert.equal(Math.round((ramp.breakpoints[1] - ramp.breakpoints[0]) * 1000) / 1000, 0.1, 'at 0.1 m/s');
  /* …and the SHIPPED table is resampled the same way, at the same step, over its own range */
  const live = resample(anchors(), 0.1);
  assert.equal(Math.round((live.breakpoints[1] - live.breakpoints[0]) * 1000) / 1000, 0.1);
  assert.ok(live.breakpoints.length > 600, 'the live ramp is a gradient, not a staircase');

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
  const ramp = resample(R284_ANCHORS, 0.1);   /* (#R293) as above — a recorded reading */
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
/* 綴りのまま: 対象は本番 smoke の Playwright spec そのもので、主張は「その spec が何を問うか」 */
test('#R287 ⑦ tests/prod-smoke.spec.js asserts both claims and drops the point-value equality', () => {
  const src = codeOnly(read('tests/prod-smoke.spec.js'));
  assert.match(src, /readPixel\(m\.ramp, m\.px\.slice\(0, 3\), m\.lo, m\.hi\)/, 'the verdict is taken');
  assert.match(src, /verdict\.inRange/, 'the colour claim is asserted');
  assert.match(src, /verdict\.speedInFootprint/, 'and the speed claim');
  assert.ok(!/toEqual\(m\.want\.slice\(0, 3\)\.map\(\(v\) => Math\.round\(v\)\)\);\s*\n\s*expect\(m\.px\[3\]/.test(src),
    'the old point-value equality is gone from the wind-pixel test');
  /* what must survive: the SDK is still the authority on how the table is read */
  assert.match(src, /colourFor\(m\.ramp, m\.sp\)/, 'the bucket rule is still pinned against the SDK');
  assert.match(src, /m\.ramp\.breakpoints\.length[\s\S]{0,160}\.toBeGreaterThan\(600\)/,
    'and the deployed build is still required to ship the resampled ramp');   /* (#R293) 1,041 now */
  /* ⚠⚠⚠ (#R382) THIS LINE USED TO PIN THE SIBLING'S OWN WORDING — 「the eye is painted nearer the
     entry for its own speed」 — so that #R287 could prove it had not damaged #R276 追記3's eyewall
     comparison in passing. That comparison is now GONE ON PURPOSE: it asked `getColor(valueNow())`,
     which is the point-value question THIS FILE exists to have replaced, and on 2026-08-24 it went
     red on a correct picture for four attempts running (the eyewall pixel read as 38.1 m/s, which
     is nearer the EYE's colour than its own because RGB distance does not order speeds along this
     ramp — 195 of its 1,041 entries invert it; see tests/weather-wind-pixel-checks.test.mjs #R382).
     A gate outlives its reason unless somebody moves it. So what is pinned here is what the sibling
     asserts NOW: the same verdict this file is about, taken over each pixel's own footprint. */
  /* ⚠ (#R458) …and the footprints it takes that verdict over are now the CHOSEN pair's rather
     than blindly the finder's two points: at the hours where those two overlap in speed, the
     comparison BETWEEN them is not a question about the picture at all. The spelling pinned here
     moved with the thing it pins, and the choice itself is pinned as well. */
  assert.match(src, /readPixel\(pic\.ramp, eyePx, eyeFoot\[0\]/, 'the eye pixel takes this verdict');
  assert.match(src, /readPixel\(pic\.ramp, ringPx, ringFoot\[0\]/, 'and so does the eyewall');
  assert.match(src, /separablePair\(pic\.eyeCands, pic\.ringCands\)/,
    'over a pair chosen to be one the cross-claim can be made about (#R458)');
  assert.ok(!/the eye is painted nearer the entry for its own speed/.test(src),
    'and the point-value distance comparison it used to make is gone');
  assert.equal((src.match(/gl\.readPixels\(/g) || []).length, 2,
    'both canvas reads survive — the wind pixel and the eye/eyewall pair');
});

/* ── ⑧ settling the time axis must not cancel the load of the hour it is announcing ──────────
   ⚠⚠⚠ THE SECOND FAILURE, WHICH THE FIRST ONE HAD BEEN HIDING. tests/prod-smoke.spec.js ran
   `test.describe.configure({ mode: 'serial' })` at the time, so when the wind-pixel test above
   failed the two after it were never RUN — they reported as skipped, and the deploy log showed one
   red test where there were two. Fixing the first unmasked this.
   ⚠ (#R458) THAT CONFIGURE LINE IS GONE. The same cascade blanked four checks again on the deploy
   of run 32818517323, and measuring showed serial was never what kept a dead site from reporting
   twenty confusing failures — `beforeAll` is, because it throws. The note stays, because the
   DEFECT ⑧ pins is unchanged; only the thing that kept it hidden for a round has been removed.

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
test('#R287 ⑧ the coalesced time event drops the frame without cancelling the current load', async () => {
  const src = codeOnly(read('js/wx-ecmwf.js'));
  const i = src.indexOf('function fireTime(');
  assert.ok(i > 0, 'fireTime still exists');
  const body = src.slice(i, src.indexOf('function setIndex(', i));

  assert.ok(!/\brelease\(\)/.test(body),
    'fireTime no longer calls release() unqualified — that is what cleared loadingKey');
  /* ⚠ (#R288) …AND THE DROP ITSELF IS GONE, for the same defect one step further out: a load
     overtaken by ANY later request — not only one that started inside the 140 ms window — still
     resolved null, because the handler returned the module slot instead of the frame it had just
     decoded (MEASURED on the deployed build: 8.3 s, data present, result null). `load()` returns
     its own frame now and a monotonic `seq` decides which one is installed, so nothing has to be
     cancelled at all — and the old frame stays until the new one lands, which is what keeps the
     point readout from blanking and the same hour from being decoded twice.
     What #R287 established is unchanged and is what is asserted: fireTime cancels nothing. */
  assert.ok(!/held = null/.test(body), 'and the stale frame is not dropped either — it is replaced');
  assert.ok(!/loadingKey/.test(body), 'fireTime touches no load state at all');
  /* ⚠⚠⚠ (#R664) THE LAST TWO ASSERTIONS HERE WERE SPELLINGS — `var mine = ++seq` and
     `if (seq === mine)` — and #R664 moved the ticket from the call to the read, so both changed
     while what they were for did not (see the header of tests/helpers/wx-ecmwf-page.mjs). The claim is that nothing has
     to be CANCELLED any more: a read that is superseded while it is in flight still answers its
     caller with the frame it decoded, and only declines to install itself. Measured against the
     shipped module, because the production symptom was a value, not a spelling — MEASURED on the
     deployed build: 8.3 s, data present, result null. */
  const { calls, ENG } = await coldWxModel({ sdkMs: 80, readMs: 300 });
  const M = ENG.model('ecmwf_wam025');
  const p = M.load('wave_height', null, null);
  /* ⚠ past `ready()`: the bytes are on their way — WAITED FOR, not timed (the header of
     tests/helpers/wx-ecmwf-page.mjs measures why a duration cannot establish this). */
  await until(() => calls.ensureData === 1, 'the read to reach the data', { observe: () => calls });
  assert.equal(calls.ensureData, 1, 'the read must be under way, or this proves nothing');
  M.release();                          /* the strongest supersession there is: an unqualified drop */
  const fr = await p;
  assert.ok(fr && fr.data && fr.data.values.length,
    'a read that SUCCEEDED was reported to its caller as a failure — the shape js/weather.js turns '
    + 'into 「データを取得できませんでした」');
  assert.equal(M._state().frames, 0,
    'which frame is current is explicit instead: the superseded read resolves, it does not install');

  /* what must survive elsewhere: release() is still there for the axis it was written for */
  assert.match(src, /function release\(variable\)/, 'release(variable) itself is untouched');
  assert.match(codeOnly(read('js/weather.js')), /EC\(\)\.release\(VAR\)/,
    'and a layer switching off still drops only its own frame (#R276 追記2)');
});
}

/* ════════ #R382 — from tests/r382-checks.test.mjs ════════ */
{
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
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

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
  /* (#R487) …and the reader's half in the reader's unit. This line was the same squared RGB
     distance the deployed test carried, and the same objection applies to it: sRGB distance does
     not order how different two colours look. MEASURED here — [232,216,213] against [169,78,139]
     is ΔE00 39.1, which is not a marginal call in either unit; what changed is that it is now
     asked in the one that means something. See tests/helpers/colour-difference.js. */
  assert.ok(deltaE00(SETTLED, EYE_PX) > VISIBLE_AT_A_GLANCE,
    'and they are visibly different colours — ΔE00 ' + deltaE00(SETTLED, EYE_PX).toFixed(1));
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
/* 綴りのまま: 対象は本番 smoke の Playwright spec そのもので、主張は「その spec が何を問うか」 */
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
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('#R382 ⑧ js/weather.js really alternates between two wind-field slots', () => {
  const w = codeOnly(read('js/weather.js'));
  const m = w.match(/SLOT\s*=\s*\[([\s\S]{0,240}?)\]/);
  assert.ok(m, 'js/weather.js declares the slot table');
  const ids = [...m[1].matchAll(/src:\s*'([^']+)'/g)].map((x) => x[1]);
  assert.equal(ids.length, 2, 'two slots: ' + ids.join(', '));
  for (const id of ids) assert.match(id, /^wind-field-/, id + ' is matched by the test\'s filter');
});
}

/* ════════ #R487 — from tests/r487-checks.test.mjs ════════ */
{
/* ============================================================================
 *  #R487 · A CLAIM ABOUT A READER, ASKED OF A NUMBER THAT IS NOT ABOUT READERS
 * ----------------------------------------------------------------------------
 *  tests/prod-smoke.spec.js has ended its cyclone verdict with 「the eye and its wall are visibly
 *  different colours」 since #R276. It is the one line in that test that is about a PERSON rather
 *  than about the field, and until this round it was put to the squared Euclidean distance between
 *  two sRGB triples, with the bound at 30 units (900 squared).
 *
 *  sRGB is a storage encoding. Distance in it does not order 「how different these look」, and on
 *  the shipped wind table it gets the order backwards by a factor of six and a half — ③ below
 *  re-measures that from js/wx-ecmwf.js rather than repeating it from here.
 *
 *  ⚠ WHAT IT COST. Run 33096001326, twice, on a deploy where every other assertion in that test
 *  was green:
 *      eye     [75,145,155]   the model runs  2.15 …  7.20 m/s under it
 *      eyewall [76,117,145]   the model runs 26.20 … 27.86 m/s under it   — 19.00 m/s apart
 *      RGB distance 29.75  →  885 < 900, red.        ΔE00 14.22  →  plainly visible.
 *  The eye was on the screen, in the right colour, with the right speeds under it. The ruler was
 *  the only thing that was wrong. This is the SAME defect the same test has now recorded three
 *  times: #R276 追記 (「red − blue is not monotone along this ramp」), #R382 (「distance-to-an-entry
 *  does not order speeds」), and this. Each time the answer was to stop inventing the quantity and
 *  read it out of the thing the claim is about — the field, in those two, and the observer, here.
 *
 *  ⚠ AND THE THRESHOLD IS NOT READ OFF THE RAMP — ⑤ shows why the tempting 「no constant」 form of
 *  this test is worthless.
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* the incident, as data */
const EYE_PX = [75, 145, 155];
const RING_PX = [76, 117, 145];
const EYE_FOOT = [2.15, 7.20];
const RING_FOOT = [26.20, 27.86];
const OLD_BOUND = 900;                       /* squared RGB distance, the bound that went red */
const rgbD2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/* ── the shipped wind table, re-derived from the source the tiles are painted from ────────────
   Same extraction #R284/#R293 use, so nothing about the ramp is written down twice here. */
function shippedRamp() {
  const src = read('js/wx-ecmwf.js');
  const a = src.indexOf('var WIND_ANCHORS'), b = src.indexOf('var WINDY_WIND');
  assert.ok(a > 0 && b > a, 'the wind anchors are still declared on their own');
  const block = src.slice(a, b);
  const bp = JSON.parse(block.match(/breakpoints:\s*(\[[^\]]*\])/)[1]);
  const cols = [...block.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*1\s*\]/g)]
    .map((m) => [+m[1], +m[2], +m[3]]);
  assert.equal(bp.length, cols.length, 'one colour per anchor');
  /* js/wx-ecmwf.js `rampFrom(WIND_ANCHORS, 0.1)`, restated */
  const lo = bp[0], hi = bp[bp.length - 1], n = Math.round((hi - lo) / 0.1);
  const breakpoints = [], colors = [];
  let seg = 0;
  for (let k = 0; k <= n; k++) {
    const v = lo + k * 0.1;
    while (seg < bp.length - 2 && v >= bp[seg + 1]) seg++;
    const span = (bp[seg + 1] - bp[seg]) || 1;
    let f = (v - bp[seg]) / span; if (f < 0) f = 0; if (f > 1) f = 1;
    const c0 = cols[seg], c1 = cols[Math.min(seg + 1, cols.length - 1)];
    breakpoints.push(Math.round(v * 1000) / 1000);
    colors.push([0, 1, 2].map((i) => Math.round(c0[i] + (c1[i] - c0[i]) * f)));
  }
  return { breakpoints, colors };
}
const entryAt = (ramp, v) => {
  let i = 0;
  while (i + 1 < ramp.breakpoints.length && ramp.breakpoints[i + 1] <= v) i++;
  return ramp.colors[i];
};
const maxAdjacent = (colors) => {
  let worst = 0;
  for (let i = 0; i + 1 < colors.length; i++) {
    const e = deltaE00(colors[i], colors[i + 1]);
    if (e > worst) worst = e;
  }
  return worst;
};

/* ── ① the formula is the standard's, checked against the standard's own data ─────────────────
   CIE 142-2001 as arranged by Sharma, Wu & Dalal (2005), whose paper ships these reference pairs
   because the three easy mistakes — the a* rescaling by G, the MEAN hue across the 0° wrap, and
   the sign of the rotation term — all yield a function that looks correct on ordinary colours and
   is wrong on the ones that decide a test. A hand-written ΔE00 nobody has put through this data is
   another invented quantity, which is the very thing this round exists to remove. */
const SHARMA = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
  [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0000],
  [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0000],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, -1, 2], [50, 0, 0], 2.3669],
  [[50, 2.4900, -0.0010], [50, -2.4900, 0.0009], 7.1792],
  [[50, 2.4900, -0.0010], [50, -2.4900, 0.0011], 7.2195],
  [[50, -0.0010, 2.4900], [50, 0.0009, -2.4900], 4.8045],
  [[50, -0.0010, 2.4900], [50, 0.0011, -2.4900], 4.7461],
  [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[50, 2.5, 0], [56, -27, -3], 31.9030],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
  [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0000],
  [[50, 2.5, 0], [50, 3.2972, 0], 1.0000],
  [[50, 2.5, 0], [50, 1.8634, 0.5757], 1.0000],
  [[50, 2.5, 0], [50, 3.2592, 0.3350], 1.0000],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.2480, -4.9620], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
  [[36.4612, 47.8580, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
];

test('#R487 ① ΔE00 reproduces the published CIEDE2000 reference pairs', () => {
  for (const [lab1, lab2, want] of SHARMA) {
    const got = deltaE00Lab(lab1, lab2);
    assert.ok(Math.abs(got - want) < 1e-4,
      JSON.stringify(lab1) + ' vs ' + JSON.stringify(lab2)
      + ': want ' + want.toFixed(4) + ', got ' + got.toFixed(4));
  }
  /* the pairs that break a careless implementation are in there, and this says so out loud:
     one hue on either side of 0°, and a pair of near-neutrals where Cp1*Cp2 is zero */
  assert.equal(SHARMA.filter(([a, b]) => a[1] * b[1] < 0).length > 0, true, 'hues that straddle 0°');
  assert.ok(SHARMA.some(([a]) => a[1] === 0 && a[2] === 0), 'and a neutral, which has no hue at all');

  /* …and the sRGB→Lab leg, against the two colours everyone knows the answer for */
  const white = labFromRgb([255, 255, 255]), black = labFromRgb([0, 0, 0]);
  /* ⚠ 1e-4, not equality: the sRGB→XYZ matrix is published to seven digits, so its D65 white
     lands a ten-thousandth off the illuminant. Demanding exactness here would be a claim about the
     rounding of a published constant rather than about the transform. */
  assert.ok(Math.abs(white[0] - 100) < 1e-4 && Math.abs(white[1]) < 1e-4 && Math.abs(white[2]) < 1e-4,
    'sRGB white is L*=100 with no chroma — got ' + JSON.stringify(white.map((x) => +x.toFixed(6))));
  assert.deepEqual(black.map((x) => +x.toFixed(6)), [0, 0, 0], 'and sRGB black is the origin');
  assert.equal(deltaE00([12, 34, 56], [12, 34, 56]), 0, 'a colour is not different from itself');
  assert.equal(deltaE00(EYE_PX, RING_PX), deltaE00(RING_PX, EYE_PX), 'and the order does not matter');
});

/* ── ② the hour that went red, in both units ──────────────────────────────────────────────────*/
test('#R487 ② the production failure was the ruler, not the picture', () => {
  assert.ok(RING_FOOT[0] - EYE_FOOT[1] > 15,
    'the two points really were far apart in the field — '
    + (RING_FOOT[0] - EYE_FOOT[1]).toFixed(2) + ' m/s of clear water between the footprints');

  const d2 = rgbD2(EYE_PX, RING_PX);
  assert.equal(d2, 885, 'the squared RGB distance the deploy printed');
  assert.ok(d2 < OLD_BOUND, 'which is what the old bound rejected the picture on');

  const dE = deltaE00(EYE_PX, RING_PX);
  assert.ok(Math.abs(dE - 14.22) < 0.01, 'and the same pair is ΔE00 ' + dE.toFixed(2));
  assert.ok(dE > VISIBLE_AT_A_GLANCE,
    'which is ' + (dE / VISIBLE_AT_A_GLANCE).toFixed(1) + ' times the bound that replaces it — so '
    + 'the bound is not one that was fitted to let this hour through');

  /* and the two pixels are the colours the shipped table paints for their own footprints, which
     is what makes this a real hour rather than a pair of numbers chosen to make a point */
  const ramp = shippedRamp();
  for (const [px, foot, name] of [[EYE_PX, EYE_FOOT, 'eye'], [RING_PX, RING_FOOT, 'eyewall']]) {
    const lo = entryAt(ramp, foot[0]), hi = entryAt(ramp, foot[1]);
    const within = [0, 1, 2].every((c) =>
      px[c] >= Math.min(lo[c], hi[c]) - 8 && px[c] <= Math.max(lo[c], hi[c]) + 8);
    assert.ok(within, 'the ' + name + ' pixel ' + JSON.stringify(px) + ' is the colour this table '
      + 'paints between ' + JSON.stringify(lo) + ' and ' + JSON.stringify(hi));
  }
});

/* ── ③ on the shipped table the two instruments disagree about which pair looks more alike ────
   Re-measured here from js/wx-ecmwf.js over all 1,041 × 1,040 / 2 pairs, so the counter-examples
   move if the table moves rather than being frozen prose. */
test('#R487 ③ squared RGB distance does not order how different two colours look', () => {
  const ramp = shippedRamp();
  const n = ramp.colors.length;
  assert.equal(n, 1041, 'the resampled table (#R284/#R293)');
  const labs = ramp.colors.map(labFromRgb);

  let worstCalledSame = null, mildestCalledFar = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d2 = rgbD2(ramp.colors[i], ramp.colors[j]);
      const e = deltaE00Lab(labs[i], labs[j]);
      if (d2 < OLD_BOUND) {
        if (!worstCalledSame || e > worstCalledSame.e) worstCalledSame = { i, j, d2, e };
      } else if (!mildestCalledFar || e < mildestCalledFar.e) mildestCalledFar = { i, j, d2, e };
    }
  }
  const show = (x) => ramp.breakpoints[x.i] + ' m/s ' + JSON.stringify(ramp.colors[x.i]) + ' vs '
    + ramp.breakpoints[x.j] + ' m/s ' + JSON.stringify(ramp.colors[x.j])
    + ' — RGB ' + Math.sqrt(x.d2).toFixed(1) + ', ΔE00 ' + x.e.toFixed(2);

  assert.ok(worstCalledSame.e > mildestCalledFar.e * 2,
    'the pair the old bound calls 「the same colour」 is more than twice as different, to a reader, '
    + 'as the pair it calls 「far apart」:\n      same: ' + show(worstCalledSame)
    + '\n      far:  ' + show(mildestCalledFar));
  /* the values that argument was written from, so a change in the table is visible as a change
     here rather than silently weakening the sentence above */
  assert.ok(worstCalledSame.e > 20 && mildestCalledFar.e < 4,
    'measured on the shipped table: ' + worstCalledSame.e.toFixed(2) + ' vs '
    + mildestCalledFar.e.toFixed(2));
  /* …and the pair that went red in production is an ordinary member of the first group */
  assert.ok(rgbD2(EYE_PX, RING_PX) < OLD_BOUND && deltaE00(EYE_PX, RING_PX) > mildestCalledFar.e,
    'the hour that failed is one of them');
});

/* ── ④ the claim still refuses the pictures it exists to refuse ───────────────────────────────
   ⚠ THE POINT OF ②/③ IS NOT THAT EVERYTHING PASSES. Changing the unit a claim is stated in is only
   honest if the claim still fails what it was written to fail. */
test('#R487 ④ a map that does not show the eye is still refused', () => {
  const ramp = shippedRamp();
  /* the eye painted with its wall's colour — the picture the sentence is about */
  assert.ok(!(deltaE00(RING_PX, RING_PX) > VISIBLE_AT_A_GLANCE), 'one colour for both is refused');
  /* a raster with no structure left in it at all */
  const flat = [128, 128, 128];
  assert.ok(!(deltaE00(flat, flat) > VISIBLE_AT_A_GLANCE), 'and so is a flat grey field');
  /* the eye a single 0.1 m/s step away from its wall — a legal colour, an illegible map */
  const near = entryAt(ramp, RING_FOOT[0]), next = entryAt(ramp, RING_FOOT[0] + 0.1);
  assert.ok(!(deltaE00(near, next) > VISIBLE_AT_A_GLANCE),
    'and two neighbouring speeds are not 「a calm eye inside a ring of strong wind」 — ΔE00 '
    + deltaE00(near, next).toFixed(2));
  /* #R276's original defect, for completeness: the night shading multiplied over the raster does
     move the colour, and it is #R287's `inRange` that refuses it — this claim is not that claim */
  const dimmed = RING_PX.map((v) => Math.round(v * 0.36));
  assert.ok(deltaE00(RING_PX, dimmed) > VISIBLE_AT_A_GLANCE,
    'a 0.36x dimmed pixel is a different colour, which is why ① of the deployed test catches it '
    + 'and this one is not asked to');
});

/* ── ⑤ why the bound is a constant, and not read off the table ────────────────────────────────
   ⚠ THE TEMPTING VERSION OF THIS TEST WRITES NO NUMBER DOWN: 「the eye and its wall are further
   apart than the table's own finest step」. It is read off the very object it judges, and that is
   exactly what is wrong with it — reduce the ramp's contrast and the step shrinks with it, so the
   bound follows the defect down and an unreadable map clears it. The observer does not shrink. */
test('#R487 ⑤ a bound read off the ramp collapses with the ramp; the observer\'s does not', () => {
  const ramp = shippedRamp();
  const shippedStep = maxAdjacent(ramp.colors);
  assert.ok(shippedStep > 0, 'the shipped table has a finest step of ΔE00 ' + shippedStep.toFixed(2));

  /* the same table with its contrast pulled down to 15 % about its own first colour: every speed
     from 0 to 104 m/s is now one shade of blue */
  const base = ramp.colors[0];
  const washed = ramp.colors.map((c) => [0, 1, 2].map((i) => Math.round(base[i] + (c[i] - base[i]) * 0.15)));
  const washedStep = maxAdjacent(washed);
  const eye = washed[ramp.breakpoints.indexOf(4.7)];
  const wall = washed[ramp.breakpoints.indexOf(27.6)];
  const seen = deltaE00(eye, wall);

  assert.ok(washedStep < shippedStep, 'the derived bound shrank with the table — '
    + shippedStep.toFixed(2) + ' → ' + washedStep.toFixed(2));
  assert.ok(seen > washedStep,
    'and on that unreadable map the eye/wall difference (ΔE00 ' + seen.toFixed(2) + ') still clears '
    + 'it (' + washedStep.toFixed(2) + ') — the derived bound would pass this picture');
  assert.ok(!(seen > VISIBLE_AT_A_GLANCE),
    'while the observer\'s bound refuses it: ' + JSON.stringify(eye) + ' vs ' + JSON.stringify(wall)
    + ' is ΔE00 ' + seen.toFixed(2));
  /* and the constant is one number, declared once, rather than a literal at each call site */
  const helper = read('tests/helpers/colour-difference.js');
  assert.match(helper, /export const VISIBLE_AT_A_GLANCE = 2;/, 'declared in one place');
  assert.equal(VISIBLE_AT_A_GLANCE, 2, 'and that is the value the tests import');
});

/* ── ⑥ every place that made this claim now makes it in ΔE00 ──────────────────────────────────
   ⚠ THERE WERE TWO COPIES OF IT AND A GATE PINNING THE SPELLING OF THE FIRST. Fixing one would
   have left the deployed test asking the right question while its own node twin asked the old one,
   which is #R429's shape (「一ファイルに向けた検査はそのファイルだけを守る」). */
/* 綴りのまま: 対象は本番 smoke の Playwright spec そのもので、主張は「その spec が何を問うか」 */
test('#R487 ⑥ the deployed test and its node twin both ask it in the perceptual unit', () => {
  const prod = read('tests/prod-smoke.spec.js');
  assert.match(prod, /import \{ deltaE00, VISIBLE_AT_A_GLANCE \} from '\.\/helpers\/colour-difference\.js';/,
    'the deployed smoke reads the perceptual difference from the shared helper');
  assert.match(prod, /const dE = deltaE00\(eyePx, ringPx\);/, 'and takes it of the pair it chose');
  assert.match(prod, /\.toBeGreaterThan\(VISIBLE_AT_A_GLANCE\);/, 'and asserts against the constant');
  assert.ok(!/toBeGreaterThan\(900\)/.test(prod), 'the squared-RGB bound is gone');
  assert.ok(!/const d2 = \(a, b\) =>/.test(prod), 'and so is the metric it was taken with');

  /* (tests-by-topic) the node twin is #R382's section of THIS file now — sliced out by its banner, so
     this test's own regular expressions (which spell the same words) are not what answers it */
  const self = read('tests/weather-wind-pixel-checks.test.mjs');
  const from382 = self.indexOf('/* ════════ #R382 — from ');
  const r382 = self.slice(from382, self.indexOf('/* ════════ #R', from382 + 10));
  assert.ok(from382 > 0 && r382.length > 1000, "#R382's section is where this check reads it");
  assert.match(r382, /deltaE00\(SETTLED, EYE_PX\) > VISIBLE_AT_A_GLANCE/,
    'the second copy of the claim asks the same question');
  assert.ok(!/d2\(SETTLED, EYE_PX\) > 900/.test(r382), 'and no longer the old one');
  /* ⚠ r382 keeps `d2` on purpose — ③ there uses it to PROVE that RGB distance inverts speed
     order, which is an argument about the metric rather than a claim made with it. */
  assert.match(r382, /d2\(ramp\.colors\[i\], cRing\) > d2\(ramp\.colors\[i\], cEye\)/,
    'while the place that uses RGB distance as the thing being refuted still does');

  /* (tests-by-topic) #R458's checks now live in tests/cyclone-smoke-checks.test.mjs */
  const r458 = read('tests/cyclone-smoke-checks.test.mjs');
  assert.match(r458, /toBeGreaterThan\\\(VISIBLE_AT_A_GLANCE\\\)/,
    'and the gate that pins the deployed spelling follows it instead of freezing it');
});
}
