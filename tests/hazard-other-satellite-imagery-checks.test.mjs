/* ============================================================================
 *  SATELLITE IMAGERY — js/sat-proto.js and the satellite worker
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/sat-proto.js is a MapLibre protocol handler over
 *    OffscreenCanvas; these read the source.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #10 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{

/* ── 6 · satellite: the deepest zoom is no longer the one half-resolution view ───────────────── */
test('R189 satellite: the @2x stitch reaches the map maximum zoom', () => {
  const src = read('js/sat-proto.js');   /* (#R195) the protocol moved out of the shell, byte for byte */
  assert.match(src, /if\(!_satHiDPI\|\|z>=20\) return null;/,
    'z19 — the max-zoom view — now stitches from real z20 children where Esri has them');
});
}

/* ═══ from tests/r191-checks.test.mjs (tests #9, #10 of 11) ═══
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

/* ── 6 · the satellite path ──────────────────────────────────────────────────────────────────── */
test('R191 satellite: the cropped tile is no longer transcoded twice', () => {
  const a = read('js/sat-proto.js');   /* (#R195) the protocol moved out of the shell, byte for byte */
  const crop = a.slice(a.indexOf('async function _satCrop'), a.indexOf('async function _satResolve'));
  assert.ok(!/convertToBlob|toBlob/.test(crop), 'no JPEG re-encode');
  assert.match(crop, /return c\.transferToImageBitmap\?c\.transferToImageBitmap\(\):await createImageBitmap\(c\);/,
    'the bitmap MapLibre already accepts goes straight back');
  assert.match(a, /return \{data:bmp, mode:'cropped'\};/, 'and the cropped result is not held as bytes');
  /* the byte paths still copy, because MapLibre transfers what it is handed */
  assert.match(a, /return \{data:\(res\.data&&res\.data\.byteLength!==undefined\)\?res\.data\.slice\(0\):res\.data\};/,
    'a cached ArrayBuffer is copied; a bitmap is not');
});

test('R191 satellite: a phone gets phone-sized caches, and tiles arrive instead of appearing', () => {
  const a = read('js/sat-proto.js') + read('js/app-body.js');   /* (#R195) protocol + the shell's own tile budgets */
  assert.match(a, /const _satMob=\/Mobi\|Android\|iPhone\|iPad\/\.test\(navigator\.userAgent\);/, 'one device test');
  assert.match(a, /_SAT_CACHE_MAX=\(_satMob\?200:800\)/, 'the resolved-tile cache is quartered on a phone');
  assert.match(a, /_SAT_RAW_MAX=\(_satMob\?300:1200\)/, 'and so is the raw-fetch cache');
  assert.match(a, /id:'layer-sat',type:'raster',source:'satellite',layout:\{visibility:'none'\},paint:\{'raster-fade-duration':180\}/,
    'the satellite raster cross-fades instead of swapping');
  assert.match(read('js/world-base.js'), /'raster-fade-duration':180/, 'and the floor it fades from matches');
});
}

/* ═══ from tests/r193-checks.test.mjs (tests #7 of 9) ═══
    R193 — source contracts. The parts that can be proved without a renderer. */
{
const R = path.resolve(import.meta.dirname, '..');

test('R193 ⑦ the ancestor walk starts from what the depth memo already knows', () => {
  const w = read('src/sat-worker.js'), a = read('js/sat-proto.js');   /* (#R195) protocol split out */
  assert.match(w, /const hint = knownStop\(z, x, y\);/, 'the worker consults the memo');
  assert.match(a, /const _hint=_satKnownStop\(z,x,y\);/, 'and so does the main-thread fallback');
  /* a stale hint must not be trusted blindly: the walk resumes from there */
  assert.match(w, /else if \(got\) \{ az = hint;/, 'the worker falls back when the hint is stale');
  assert.match(a, /else if\(got\)\{ az=_hint;/, 'and so does the fallback path');
});
}
