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
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

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
  /* the glyph itself is untouched — byte-identical to the first commit (#R187) */
  assert.match(src, /const _PLANE_ORIG=\[\[0,-19\]/, 'the original outline stays');
});
}

/* ═══ from tests/r191-checks.test.mjs (tests #1, #2 of 11) ═══
    R191 — source-level checks for the round's eight reports.
    Node's own test runner; no browser. The things that need a real renderer or
    live pixels are in tests/r191.spec.js. */
{

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readLF(join(ROOT, f))).join('\n')
  : readLF(join(ROOT, p)));

/* ── 1 · the aircraft mark: the glyph's colour AND the glyph's stroke, lifted ─────────────────── */
test('R191 aircraft: the lifted mark carries the glyph colour and the glyph stroke', () => {
  const src = read('js/data-layers.js');
  /* the compensation exists, is derived, and is applied through ONE helper */
  assert.match(src, /const _FE_AMBIENT=0\.03;/, 'the shader ambient is named');
  assert.match(src, /const _FE_DIR_GLOBE=0\.933, _FE_DIR_MERC=1\.0;/, 'both measured roof factors are named');
  assert.match(src, /function _feHex\(hex,dir\)/, 'one place turns a wanted colour into a declared one');
  assert.match(src, /const _feRamp=\(mk\)=>\['interpolate',\['linear'\],\['zoom'\],_FE_Z0,mk\(_FE_DIR_GLOBE\),_FE_Z1,mk\(_FE_DIR_MERC\)\]/,
    'and the zoom ramp is the OUTERMOST expression — MapLibre rejects a nested zoom expression');
  /* every plane colour goes through it — a raw hex on these layers is the bug this round fixed */
  const paint = src.slice(src.indexOf("id:PLANE3D_LYR"), src.indexOf("id:PLANE3D_LYR") + 1400);
  assert.match(paint, /'fill-extrusion-color':_feRamp\(/, 'the lifted body asks the ramp for its colours');
  assert.ok(!/(^|[^(])'#1e90ff'/.test(paint.replace(/_feHex\('#[0-9a-f]{6}'/g, '_feHex(X')),
    'and no colour on this layer is declared raw — every one goes through _feHex');
  /* ⚠ (#R244) the colour itself moved — 「Live aircraft trafficの民間機の色は山吹色に」 — and with it
     the point this line has always made: the lifted body must ask for THE SAME colour the flat glyph
     is drawn in. That is now a shared constant rather than a repeated literal (which is the stronger
     form of the same invariant: #R173's drift is impossible when there is one name), so this checks
     the name reaches the ramp and tests/r244 ⑧ checks what the name is worth. */
  assert.match(paint, /_feHex\(PLANE_CIV,d\)/, 'it asks for the colour that COMES OUT as the glyph colour');
  assert.match(paint, /\['==',\['get','part'\],'rim'\],_feHex\('#ffffff',d\)/, 'and the stroke is white');
  /* the stroke is the glyph's own 1.6-px stroke, mitred — not #R185's scaled plate */
  /* (#R246) …and it is DERIVED from that constant rather than typed again, so #R246's thicker
     outline widened the lifted mark's white band by exactly the same amount. */
  assert.match(src, /const _PLANE_STROKE=PLANE_STROKE\/2;/, 'half of ensurePlaneIcons’ line, derived');
  assert.match(src, /function _outsetRing\(pts,w\)/, 'a real offset, not a scale about the centre');
  assert.match(src, /const _PLANE_RIM=_outsetRing\(_PLANE_OUTLINE,_PLANE_STROKE\);/, 'outward half');
  assert.match(src, /const _PLANE_CORE=_outsetRing\(_PLANE_OUTLINE,-_PLANE_STROKE\);/, 'inward half');
  assert.ok(src.indexOf('const _PLANE_OUTLINE=') < src.indexOf('const _PLANE_RIM='),
    'the outline is declared before the two rings derived from it (#R167/#R183/#R189/#R190 TDZ)');
  /* the rim is pushed FIRST, and (#R192) it is a RING rather than a larger plate drawn 8 % lower:
     two coplanar surfaces 0.35 px apart are a tie the depth buffer cannot break, and disjoint
     geometry has no tie to break. See tests/r192-checks. */
  const rimAt = src.indexOf("part:'rim'"), bodyAt = src.indexOf("part:'body'");
  assert.ok(rimAt > 0 && bodyAt > rimAt, 'the stroke is emitted before the body');
  assert.match(src, /planeRingPts\(d\.lng,d\.lat,d\.heading,half,_PLANE_CORE\)\.slice\(\)\.reverse\(\)/,
    'and the body outline is the stroke ring’s hole');
  /* #R185's plate and halo stay gone */
  assert.doesNotMatch(src, /rgba\(255,255,255,0\.97\)/, 'the rim PLATE is still gone');
  assert.doesNotMatch(src, /_P_LEVELS|_PLANE_PLAN/, 'and so is the eight-part airliner');
});

/* ── 2 · the coverage hint answers about the view on screen ──────────────────────────────────── */
test('R191 aircraft: the coverage notice is about the current view, not the running sweep', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /function planeCircles\(commit\)/, 'the planner can plan without adopting');
  assert.match(src, /if\(commit!==false\) _planeCover=cover;/, 'and only commits when asked to');
  const hint = src.slice(src.indexOf('function updatePlanesZoomHint'), src.indexOf('function updatePlanesZoomHint') + 1400);
  assert.match(hint, /planeCircles\(false\)/, 'the hint re-plans for the viewport it is describing');
  assert.ok(!/_planeCover&&_planeCover\.clipped/.test(hint),
    'and never reads the running sweep’s answer, which can be minutes old');
  assert.match(src, /updatePlanesZoomHint\(\);\s*\/\* \(#R191\) a PAN changes/, 'a pan re-asks too, not just a zoom');
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
      両方とも：より太いアウトライン」 (#R246, superseding #R244's 山吹色) — and each is written ONCE:
   the flat glyph and the two extrusion cases drifted apart in #R173, which is why `_feHex` exists. */
test('r244 ⑧ the two aircraft colours each live in one constant', () => {
  const src = code('js/data-layers.js');
  assert.ok(/const PLANE_CIV='#00D9FF';/.test(src), 'civil is cyan, declared once');
  assert.ok(/const PLANE_MIL='#FF3040';/.test(src), 'military is the vivid red, declared once');
  assert.ok(!/#1e90ff/.test(src) && !/#f8b500/.test(src), 'no earlier civil colour left anywhere');
  assert.equal((src.match(/PLANE_CIV/g) || []).length, 4, 'the declaration plus the glyph and the two extrusion cases');
  assert.equal((src.match(/PLANE_MIL/g) || []).length, 4, '…and the same for the military colour');
});
}

/* ═══ from tests/r245-checks.test.mjs (tests #6 of 10) ═══
    IntMap · #R245 — source-level checks
    Seven instructions. Each test below is written against the ROOT CAUSE that was measured, not
    against the symptom, so it fails on the shipped code that produced the report.

    ⚠ Every test strips comments before matching (`code()`), because this file's own subject matter
    quotes the strings it forbids — [[intmap-recurring-lessons]] E, eight rounds running. */
{
/* comments out, string literals kept — the same helper every round since #R208 */
const code = (p) => codeOnly(read(p));

/* ── ⑥ the first aircraft answer is drawn when it arrives ───────────────────────────────────────
   「Live aircraft trafficで航空機が表示されるまでが遅い。」 `lastPub` starts at the sweep's start, so
   the in-loop publish could not fire before PLANE_PUBLISH_MS — the centre circle's aircraft sat in
   `byHex` for four seconds. The request PACE is not touched: that is the measured limit. */
test('r245 ⑥ a live-aircraft sweep publishes its first success immediately', () => {
  const src = code('js/data-layers.js');
  assert.ok(/if\(ok>0&&\(published===0 \? circles\.length>1 : Date\.now\(\)-lastPub>=PLANE_PUBLISH_MS\)\) publish\(false\);/.test(src),
    'the first success publishes; the 4 s cadence takes over after it');
  assert.ok(/const PLANE_GAP_MS=1200;/.test(src), 'the measured spacing between requests is unchanged');
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

/* ── ④ THE AIRCRAFT RAMP ──────────────────────────────────────────────────────────────────────
   「Live aircraft trafficで航空機の大きさを少し大きく。」 1.25× at every stop, so the SHAPE of the
   ramp is untouched; and it is still stated ONCE, which is what makes the flat glyph and the lifted
   3-D body grow by the same factor (#R192's reason for the table existing at all). */
test('r247 ④ the aircraft size ramp is the original stops at 1.25x, still read by both renderings', () => {
  const s = code(read('js/data-layers.js'));
  assert.match(s, /const _PLANE_SIZE=\[\[2,0\.5\],\[5,0\.725\],\[9,0\.975\]\];/, 'the ramp, as data');
  assert.match(s, /'icon-size':_planeIconSizeExpr\(\)/, 'the glyph builds its expression from it');
  assert.match(s, /19\*_planeIconSize\(GE\(\)\.camera\.getZoom\(\)\)/, 'and the lifted body evaluates the same table');
  /* one table, not two: the ramp may not be written a second time anywhere in the file */
  assert.equal((s.match(/\[\[2,0\.5\],\[5,0\.725\],\[9,0\.975\]\]/g) || []).length, 1, 'stated exactly once');
});
}
