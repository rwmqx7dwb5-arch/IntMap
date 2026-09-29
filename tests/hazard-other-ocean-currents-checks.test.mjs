/* ============================================================================
 *  OCEAN CURRENTS — the bundled, measured current layer (js/ocean-currents.js)
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The bundled dataset is read as data; the layer is a
 *    page closure over the renderer.
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

/* ═══ from tests/r218-checks.test.mjs (tests #19, #20 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => codeOnly(read(p));

/* ── ⑦ the ocean-current layer is a field now, and still fabricates nothing ─────────────── */
test('#R218 ⑦ the currents are the bundled, measured dataset (#R219 replaced the live streamlines)', () => {
  /* ══ ⚠ (#R219) INTENDED REPLACEMENT — THE LAYER IS NOW A BUNDLED DATASET ═══════════════════════
     「海流レイヤー、思ってたのと違う。ちゃんと**もとからデータが固定された**レイヤーとして地図上に
      描画してください。作り直せ。」（確認済：「同梱の固定データで常時描画」）
     #R216/#R218's invariant — «this file ships no current of its own, every number is fetched live»
     — was the right answer to the question those rounds were asked, and it is the OPPOSITE of the
     one this round was asked. The provenance rule is unchanged and is what these assertions now
     check ONE LEVEL OUT: the paths are still traced through a measured velocity field (NASA/JPL
     OSCAR), warm/cold is still derived rather than asserted, and nothing is a drawing — the tracing
     simply happens in scripts/build-ocean-currents.mjs instead of in the browser, and the answer
     ships as data/ocean-currents.json. See tests/r219-checks ④ and DEV-NOTES #R219 §3. */
  const s = read('js/ocean-currents.js');
  assert.match(s, /data\/ocean-currents\.json/, 'the layer must read the bundled dataset');
  assert.equal(/marine-api\.open-meteo/.test(s), false, 'a fixed dataset does not fetch a field per viewport');
  assert.equal(/wd:Q129558/.test(s), false, 'the names ship with the data now, in five languages');
  /* the provenance moved to the build script and to the file; both must still carry it */
  const b = read('scripts/build-ocean-currents.mjs');
  assert.match(b, /jplOscar/, 'the paths must still be traced through the measured OSCAR field');
  assert.match(b, /poleward/i, 'warm/cold must still be DERIVED from the flow, not asserted');
  const doc = JSON.parse(read('data/ocean-currents.json'));
  /* (#R221) the dataset was rebuilt: the velocity is NOAA CoastWatch blended altimetry (geostrophic)
     plus a Ralph & Niiler Ekman term, and the classification is NOAA OISST v2.1. The claim this
     assertion stands for — the file NAMES where its numbers came from — is unchanged. */
  assert.match(String(doc.source || ''), /NOAA/, 'the dataset must name its source');
  assert.ok(doc.named.length >= 20 && doc.named.every((c) => Array.isArray(c.path) && c.path.length >= 5),
    'every named current carries a traced path');
  /* the image is still registered on the object that has addImage (#R216 ③).
     ⚠ against the COMMENT-STRIPPED source: the file explains the trap in prose, and a scan of the
     prose is not a scan of the program. */
  const c = code('js/ocean-currents.js');
  assert.equal(/layers\.addImage/.test(c), false, 'addImage is on scene, not layers');
  assert.match(c, /GE\(\)\.scene\.addImage\(name,/);   /* (#R220) two glyphs, one helper */
});
test('#R218 ⑦ …and the marine model + Wikidata are still both declared', () => {
  const r = read('js/reference-data.js');
  assert.match(r, /Open-Meteo Marine/);
  /* (#R246) the prose moved to js/locales/pages.en.js `sourceUse`, keyed by the registry name */
  assert.match(read('js/locales/pages.en.js'), /ocean-current velocity and direction/);
  assert.match(read('js/locales/pages.en.js'), /ocean currents with their published coordinates/);
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #2, #3 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ② the ocean-current data layer has a legend, and the ramp has one owner ───────────────────── */
/* ⚠ (#R224) #R223 gave the SECOND ocean-current row a legend; #R224 deleted that row instead
   (「二つあるなんていうややこしいことするな」). The report #R223 answered — 「海流レイヤーに凡例がない」 —
   is answered better by there being one layer, and that layer has had a legend since #R219. What is
   pinned here now is that the removal is complete and the survivor still carries its legend. */
test('R223 ② the retired current row is gone and the survivor keeps its legend', () => {
  const s = read('js/data-layers.js');
  assert.ok(!/showOceanCurLegend/.test(s), 'the second legend went with the second layer');
  assert.ok(!/OC_WARM|OC_COLD|OC_ZONAL/.test(s), 'and so did its private colour constants');
  const oc = read('js/ocean-currents.js');
  assert.match(oc, /_speedRamp\(\)/, 'the surviving plate still builds its own legend ramp');
});
test('R223 ② the World-data speed ramp is derived from SPEED_COL, never written twice', () => {
  const s = read('js/ocean-currents.js');
  assert.match(s, /function _speedRamp\(\)/);
  assert.match(s, /background:'\+_speedRamp\(\)/, 'the swatch uses the derived ramp');
  /* the stale #R220 blue ramp must be gone */
  assert.ok(!/9fc6e8,#2f7fe0,#0a2f78/.test(s), 'the legend must not carry a gradient the map no longer draws');
});
}
