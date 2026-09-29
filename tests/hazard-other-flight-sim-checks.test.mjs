/* ============================================================================
 *  THE FLIGHT SIMULATOR — js/flight-sim.js
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/flight-sim.js is a full-screen renderer loop; these
 *    read the source.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #9 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{

/* ── 5 · flight sim: the framing is the third fact ───────────────────────────────────────────── */
test('R189 flight sim: the seed carries the eye and the look distance, and the intro flies them in', () => {
  const src = read('js/flight-sim.js');
  assert.match(src, /o\.viewCam\.eye=\{ lng:eye\.lng, lat:eye\.lat, alt:eye\.alt \};/, 'the map eye is captured');
  assert.match(src, /o\.viewCam\.dist=Math\.max\(200,Math\.hypot\(dx,dy,eye\.alt\)\);/, 'with its eye→centre distance');
  assert.match(src, /eye:_se, dist:\(isFinite\(vc\.dist\)&&vc\.dist>0\)\?\+vc\.dist:null,/, 'stored on the seed');
  assert.match(src, /let cEyeLng=eLng, cEyeLat=eLat, cEyeAlt=camAlt, _Darm=_D_LOOK;/,
    'steady state = the #R158 camera exactly');
  assert.match(src, /if\(_intro>0&&st\._camSeed&&st\._camSeed\.eye\)\{/, 'blended only while the seed lives');
  assert.match(src, /if\(okCam&&st\._camPrev&&_intro<=0\)\{/,
    'the one-frame-jump guard stands aside during the intro flight (the centre is MEANT to move fast)');
});
}

/* ═══ from tests/r218-checks.test.mjs (tests #25 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '');
test('#R218 ⑧ the flight sim starts without asking, and its phone deck drops the duplicate instruments', () => {
  const s = code('js/flight-sim.js');
  assert.equal(/fs-rot-x/.test(s), false, 'the blocking "turn your phone" screen is still there');
  assert.match(s, /#fs-rotate\{position:fixed;left:50%/, 'the rotate hint is not a chip');
  assert.match(s, /#fs-hud \.fs-sixpack,#fs-hud \.fs-pfd,#fs-hud \.fs-boost,#fs-hud \.fs-hint\{display:none !important;\}/,
    'the phone still draws four readouts of the same four numbers');
  /* the lock is still attempted — the hint replaced the GATE, not the landscape request */
  assert.match(s, /o\.lock\('landscape'\)/);
});
}
