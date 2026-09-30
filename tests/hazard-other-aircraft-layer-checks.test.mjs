/* ============================================================================
 *  LIVE AIRCRAFT — js/data-layers.js
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The aircraft layer lives inside js/data-layers.js's
 *    page closure against the renderer; these read the source, comments stripped.
 *
 *  ⚠ (remove-synthetic-planes) FOUR CHECKS HERE WERE ABOUT THE airplanes.live SWEEP AND ITS TWO
 *    MapLibre RENDERINGS, and went with them: #R191's lifted-mark colour compensation (`_feHex`,
 *    the `part:'rim'` ring) and its coverage notice (`planeCircles(false)`), and #R245's
 *    first-success publish inside the sweep loop. None of the three has a counterpart to point at —
 *    the GPU cloud has no fill-extrusion lighting to compensate, no partial coverage to announce and
 *    no sweep to publish from. What remains of #R244/#R246/#R247 is asked of where it lives now
 *    (js/plane-glyph.js, src/aviation-worker.js). The removal itself is measured in
 *    tests/remove-synthetic-planes-checks.test.mjs.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #1 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{

/* ── 1 · aircraft: a '1' stored under the default-TRUE era is not a choice ───────────────────── */
test('R189 aircraft: the planes3D storage key is generation-bumped', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /const PLANES3D_KEY='intmap_planes3d3';/, 'a NEW key, so the old value cannot override (#R190 bumped it with the default)');
  assert.match(src, /localStorage\.removeItem\('intmap_planes3d'\); localStorage\.removeItem\('intmap_planes3d2'\)/, 'and BOTH legacy keys are removed');
  assert.match(src, /localStorage\.setItem\(PLANES3D_KEY,planes3D\?'1':'0'\)/, 'the toggle writes the new key');
  /* the glyph itself is untouched — byte-identical to the first commit (#R187). (remove-synthetic-planes)
     Its one declaration is js/plane-glyph.js now; js/data-layers.js no longer draws it. */
  assert.match(read('js/plane-glyph.js'), /const OUTLINE = \[\[0, -19\]/, 'the original outline stays');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #8 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => codeOnly(read(p));

/* ⑧ 「Live aircraft trafficで航空機の色は以下に。民間機：シアン #00D9FF 軍用機：鮮赤 #FF3040
      両方とも：より太いアウトライン」 (#R246, superseding #R244's 山吹色) — and each is written ONCE.
   (remove-synthetic-planes) The constants PLANE_CIV / PLANE_MIL were the airplanes.live sweep's
   renderings' and went with them. The colours on the map are the ones src/aviation-worker.js packs
   for the GPU (its COL table, which carried the military red over verbatim), so that is where
   「written once」 is asked now. ⚠ The civil colour there is an ALTITUDE RAMP between two cyans
   (#R341), not the single #00D9FF of #R246 — recorded in dev-notes/2026-10-01-remove-synthetic-planes.md;
   this check does not pretend otherwise. */
test('r244 ⑧ the two aircraft colours each live in one constant', () => {
  const src = code('src/aviation-worker.js');
  assert.equal((src.match(/mil: \[0xFF, 0x30, 0x40\]/g) || []).length, 1, 'military is the vivid red, declared once');
  assert.equal((src.match(/\bconst COL = \{/g) || []).length, 1, 'one palette');
  assert.ok(!/#1e90ff/i.test(src) && !/#f8b500/i.test(src), 'no earlier civil colour left anywhere');
  const dl = code('js/data-layers.js');
  assert.ok(!/PLANE_CIV|PLANE_MIL/.test(dl), 'and js/data-layers.js keeps no second palette of its own');
});
}

/* ═══ from tests/r247-checks.test.mjs (tests #6 of 9) ═══
    R247 — the five things this round changed, stated as contracts
    ① the SDF atlas speaks the server `top` convention (the news band's real defect)
    ② the far intensity raster's edge is a SURFACE distance, and the box is the only ownership test
    ③ the field ends in a fade, through ONE function both rasters call
    ④ the aircraft ramp is the original stops at 1.25×, still stated once
    ⑤ the thirteenth translation shape — a helper ternary with ARRAY arms — is measured and gone */
{
/* ⚠ comments are stripped before matching — this file's own prose quotes the instruction, and a
   negative check that reads its own comment is [[intmap-recurring-lessons]] E, eight rounds running. */
const code = codeOnly;

/* ── ④ THE AIRCRAFT RAMP ──────────────────────────────────────────────────────────────────────
   「Live aircraft trafficで航空機の大きさを少し大きく。」 1.25× at every stop, so the SHAPE of the
   ramp is untouched; and it is still stated ONCE (js/plane-glyph.js since #R379), which is what the
   drawing reads instead of a second table. */
test('r247 ④ the aircraft size ramp is the original stops at 1.25x, still stated once', () => {
  const g = code(read('js/plane-glyph.js'));
  assert.match(g, /const SIZE = \[\[2, 0\.5\], \[5, 0\.725\], \[9, 0\.975\]\];/, 'the ramp, as data');
  assert.match(code(read('js/aviation-live.js')), /G\.boxPx\(9\)/, 'and the drawing evaluates it');
  /* one table, not two: the ramp may not be written a second time anywhere the aircraft are drawn */
  for (const f of ['js/data-layers.js', 'js/aviation-live.js', 'js/aircraft-points.js', 'js/cesium-engine.js']) {
    assert.equal((code(read(f)).match(/\[\[2, ?0\.5\], ?\[5, ?0\.725\], ?\[9, ?0\.975\]\]/g) || []).length, 0, `${f} keeps no copy`);
  }
});
}
