/* ============================================================================
 *  #R228 — source-level checks
 *  ① the night side is TORN DOWN above its ramp, not merely declined
 *  ② …and that teardown is provably invisible, because the ramp is already 0 there
 *  ③ the limb march is refused on a touch device, asked of the POINTER (#R225's rule)
 *  ④ …and `?limb=1` still forces it, so the phone measurement can still be taken
 *
 *  WHY THESE EXIST: #R201 wrote 「reaching 0 at ZMAX where nothing is built」 in a comment and
 *  implemented only half of it. The guard stopped the layers being BUILT above the ramp and never
 *  removed ones that already existed — and the app opens at z1.7, INSIDE the ramp, so on every cold
 *  load with the satellite basemap they were built and then never taken down. Six rounds of
 *  「モバイル版がまだ劇的に遅い」 went past it because nothing here asked the question.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* comments in this project carry the reasoning, so a check that greps them proves nothing */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* the body of a named function declaration, brace-balanced — so these checks are about WHERE a call
   sits, not about the file containing the word somewhere */
function fnBody(src, name) {
  const start = src.indexOf('function ' + name);
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

test('R228 ① the night side is destroyed above the ramp, not merely left unbuilt', () => {
  const ns = code('js/night-side.js');
  const consider = fnBody(ns, 'consider');

  /* the zoom guard and the teardown have to be the SAME branch. Asserting only that the file
     contains `destroy()` would have passed against the defect: the `!satelliteUp()` branch above it
     already called it. */
  const guard = consider.match(/if\s*\(\s*zoomNow\(\)\s*>\s*ZMAX[^)]*\)\s*\{[^}]*\}/);
  assert.ok(guard, 'consider() still guards on the zoom being above the ramp');
  assert.match(guard[0], /destroy\(\)/,
    'the above-the-ramp branch TEARS DOWN what is already built — a bare `return` here is the ' +
    '#R201 defect: the layers survive every zoom the reader actually works at, drawing a ' +
    'full-screen raster and a full-screen fill at opacity 0 on every frame');

  /* and the other direction still holds: leaving the satellite basemap removes them too */
  assert.match(consider, /if\s*\(\s*!satelliteUp\(\)\s*\)\s*\{\s*if\s*\(\s*built\s*\)\s*destroy\(\)/,
    'leaving the satellite basemap still removes them (#R220)');
});

test('R228 ② the teardown is invisible by construction — the ramp is already zero there', () => {
  const ns = code('js/night-side.js');

  const stops = ns.match(/RAMP_STOPS\s*=\s*(\[[\s\S]*?\]\s*\])/);
  assert.ok(stops, 'RAMP_STOPS is still the one place the ramp is written down');
  const parsed = JSON.parse(stops[1].replace(/\s+/g, ''));
  const zmax = Number((ns.match(/ZMAX\s*=\s*([0-9.]+)/) || [])[1]);
  assert.ok(Number.isFinite(zmax), 'ZMAX is a number');

  /* RELATIONSHIP, NOT VALUE (#R198): whatever the ramp's numbers become, the last stop must be the
     zoom the teardown triggers at and it must be zero. That is what makes removing the layers there
     a no-op the reader cannot see, rather than a quality decision. */
  const last = parsed[parsed.length - 1];
  assert.equal(last[0], zmax, 'the ramp\'s last stop IS ZMAX');
  assert.equal(last[1], 0, 'and the ramp is 0 there, so nothing removed above it was being seen');
  for (const [z, v] of parsed) {
    assert.ok(z <= zmax, 'no stop lies above ZMAX');
    assert.ok(v >= 0 && v <= 1, 'every stop is a fraction');
  }
});

test('R228 ③ the limb march is refused on a touch device (pointer, not width)', () => {
  const eng = code('js/geo-engine.js');
  const start = eng.indexOf('addLimb(');
  assert.notEqual(start, -1, 'addLimb is still part of the engine contract');
  const body = eng.slice(start, eng.indexOf('setLimb(', start));

  /* #R225's rule: «does this device pay for this GPU work» is a question about the GPU, so it is
     asked of the pointer — true for a phone or tablet in EITHER orientation, false for a touchscreen
     laptop. A `max-width` test here would switch the rim off in a narrow desktop window and back on
     when it is widened, which is the #R225 defect in the other direction. */
  assert.match(body, /pointer:\s*coarse/,
    'the refusal is asked of the pointer, not of the viewport width');
  assert.match(body, /hover:\s*none/, 'and paired with hover:none, so a stylus laptop is not a phone');
  assert.match(body, /iPhone\|iPad\|iPod\|Android\|Mobi/,
    'with a UA test beside it, because iPadOS reports itself as a desktop');
  assert.match(body, /maxTouchPoints/, 'which is what the iPadOS case turns on');

  /* ⚠ AND SOMETHING ACTS ON THE ANSWER. Computing `phone` and never branching on it would leave the
     march running on every iPhone while this file went green — checked by deleting the branch and
     watching the first version of this test still pass. */
  assert.match(body, /if\s*\(\s*phone\s*\)\s*return\s+false/,
    'the touch-device answer actually refuses the layer, rather than only being computed');

  /* the software-rasteriser refusal #R227 measured must still be there — this round adds a reason to
     refuse, it does not replace one */
  assert.match(body, /swiftshader\|llvmpipe\|software/, '#R227\'s CPU-rasteriser refusal is intact');
});

test('R228 ④ `?limb=1` still forces the layer on, so a phone can still be measured', () => {
  const eng = code('js/geo-engine.js');
  const start = eng.indexOf('addLimb(');
  const body = eng.slice(start, eng.indexOf('setLimb(', start));

  assert.match(body, /limb=1/, 'the override still exists');
  /* it has to be read BEFORE the refusals and consulted BY them, or forcing it on would be a flag
     that does nothing — which is how #R227 could measure the band at all */
  const forcedAt = body.indexOf('forced=');
  const phoneAt = body.search(/pointer:\s*coarse/);
  assert.ok(forcedAt !== -1 && forcedAt < phoneAt,
    'the override is resolved before the touch-device refusal consults it');
  assert.match(body.slice(forcedAt, phoneAt + 200), /if\s*\(\s*!forced\s*\)/,
    'and the refusal is skipped when it is set');
});
