/* ============================================================================
 *  R247 — the five things this round changed, stated as contracts
 * ----------------------------------------------------------------------------
 *  ① the SDF atlas speaks the server `top` convention (the news band's real defect)
 *  ② the far intensity raster's edge is a SURFACE distance, and the box is the only ownership test
 *  ③ the field ends in a fade, through ONE function both rasters call
 *  ④ the aircraft ramp is the original stops at 1.25×, still stated once
 *  ⑤ the thirteenth translation shape — a helper ternary with ARRAY arms — is measured and gone
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* ⚠ comments are stripped before matching — this file's own prose quotes the instruction, and a
   negative check that reads its own comment is [[intmap-recurring-lessons]] E, eight rounds running. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const json = (script, ...args) => JSON.parse(execFileSync(process.execPath,
  [path.join(ROOT, 'scripts', script), '--json', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/* ── ① THE GLYPH ORIGIN ───────────────────────────────────────────────────────────────────────
   The reported defect was 「ニュースピンの帯から文字位置がずれてはみ出ている」 and the cause was one
   metric: a SERVER font's `top` is measured from an origin 27 units above the alphabetic baseline
   (MapLibre calls the same number `topAdjustment = 27.5` where it converts TinySDF glyphs into this
   convention), and this atlas was writing it from the baseline. Every Latin and Cyrillic glyph was
   drawn 1.125 em high — invisible on a bare place label, and unmissable inside a pill that is fitted
   to the metric-independent shaping box. */
test('r247 ① the glyph atlas writes `top` from the server origin, not from the baseline', () => {
  const c = code(read('scripts/build-glyphs.mjs'));
  assert.match(c, /const TOP_ORIGIN\s*=\s*27\b/, 'the origin is a named constant');
  assert.match(c, /top:\s*-y0\s*-\s*TOP_ORIGIN/, '…and `top` is measured from it');
});

/* ⚠ AND THE COMMITTED ATLAS AGREES WITH THE FONT IT REPLACES. `--check` re-derives every glyph from
   fonts/src/Inter.ttf, so a stale atlas (the metric fixed in the script and not in the files, which
   is exactly what shipping half this change would look like) fails here rather than in production. */
test('r247 ① the committed atlas is the one this builder produces', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-glyphs.mjs'), '--check'],
    { encoding: 'utf8', stdio: 'pipe' });
});

/* ── ② THE FAR RASTER'S LIMITS ────────────────────────────────────────────────────────────────
   `rEdge` comes off the profile's own radius grid, which is the distance `srcDistM()` PRODUCES;
   `buildFar` compares it with a SURFACE distance. The gap is the implied rupture radius, so it grows
   with magnitude (5 km at M6, 140 at M9.1, 213 at M9.5) and is zero whenever a rupture is drawn —
   which is why only a point source ever showed it. */
test('r247 ② the far field stops at a SURFACE radius, converted through srcDistM once', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /const rEdgeSurf=Math\.min\(MMI_MAX_KM,_cutEdge\+Math\.sqrt\(Math\.max\(0,rEdge\*rEdge-depthKm\*depthKm\)\)\)/,
    'the inverse of srcDistM, stated once');
  /* (#R248) …and buildFar is now also given the WINDOW it rasterises into — the same object the
     fine image's box was snapped onto, passed rather than recomputed so the seam stays exact. */
  assert.match(s, /await buildFar\(profAt,\{W,E,Ss,Nn\},rFine,rEdgeSurf,seq,farWin\)/, 'and it is what buildFar is given');
  assert.match(s, /const rFine=Math\.min\(rEdgeSurf,MMI_TERRAIN_KM\)/, 'the fine box is bounded by the same surface radius');
});

/* ⚠ …AND OWNERSHIP IS THE BOX, ONLY THE BOX. #R218's band solve also carved out a disc of radius
   rFine on the argument that the fine image owns it. It does not: the fine image is that disc's
   BOUNDING BOX, and along its east and west flanks the box edge is NEARER than rFine, so a cell
   there was dropped by both rasters. Measured on the geometry alone: 0 such cells at 45 N, 21 at
   50 N, 192 at 60 N, 2,734 at 70 N. */
test('r247 ② the far raster has no inner radius — the box test is the whole of ownership', () => {
  const s = code(read('js/seismic.js'));
  assert.doesNotMatch(s, /innerI/, 'the inner-radius column skip is gone');
  assert.doesNotMatch(s, /cosFine/, '…and so is the circle it was solved from');
  assert.match(s, /if\(km>rEdge\) continue;/, 'the only radial test left is the outer one');
  assert.match(s, /if\(lo>=box\.W&&lo<=box\.E&&la>=box\.Ss&&la<=box\.Nn\) continue;/,
    'and the fine image owns exactly its box');
});

/* ── ③ THE FADE ───────────────────────────────────────────────────────────────────────────────
   「いやJMA震度のほうだわ。直線状の崖」 — the lowest class was an ALPHA boundary: 震度1 at full
   opacity on one side and nothing on the other, so its isoline was drawn as a cliff. It is a ramp
   now, half a class wide, and BOTH rasters get their colour and their alpha from one function. */
test('r247 ③ one function writes the colour AND the alpha, for both rasters', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /function fieldPx\(I,out\)/, 'the shared painter exists');
  assert.match(s, /const rgb=fieldPx\(I,_farRGB\); if\(!rgb\) continue;/, 'the far annulus calls it');
  assert.match(s, /const c=fieldPx\(I,_fineRGB\); if\(!c\) continue;/, 'the fine field calls it');
  /* neither raster may write FIELD_ALPHA straight into the image any more — that IS the cliff */
  assert.doesNotMatch(s, /px\[o\+3\]=FIELD_ALPHA/, 'no raster writes the alpha itself');
  assert.match(s, /const FADE_I=0\.5;/, 'the fade is half a class of the active scale');
  /* …and the edge radius is solved for the FADE floor, or the fade is clipped at the radius it
     exists to soften — the cliff, one ramp later. */
  /* ⚠ AND THE RAMP RUNS INWARD, so nothing about the field's EXTENT moves. The obvious shape — carry
     the field half a class further out and vanish there — coarsens the CELL, because `rEdge` is what
     the fine image's box is built from and the 2,560 ceiling divides that box. Measured on
     tests/r226-seismic's own M6.4: outward cost span 2,700 → 2,892 km and cell 1.05 → 1.13 km,
     against a 1.0 km target three rounds (#R202 / #R203 / #R204) were spent reaching. */
  assert.match(s, /floor=jmaScale\?A0_FLOOR_JMA:PGV_FLOOR_MMI/, 'rEdge is still solved for the CLASS floor');
  assert.match(s, /if\(!\(I>=lo\)\) return null;/, 'and nothing is painted below it');
});

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

/* ── ⑤ THE THIRTEENTH SHAPE ───────────────────────────────────────────────────────────────────
   The ninth shape (`jp() ? '日本語' : 'English'`) written one container deeper — arms that are ARRAYS.
   It hid the bug-report category menu, the calendar's weekday initials and which Wikipedia two
   widgets read, in seven languages, from every instrument in the repository: the pair audit wants
   LITERAL arms, and the adjacent-pair audit needs the two languages NEXT TO each other, which they
   are not — they are in different arms. */
test('r247 ⑤ the helper-ternary audit counts container arms, and the count is zero', () => {
  const a = code(read('scripts/i18n-helper-ternary-audit.mjs'));
  assert.match(a, /ArrayExpression'\s*\|\|\s*n\.consequent\.type === 'ObjectExpression'/,
    'the instrument looks at the SHAPE of the arms, not only at literals');
  assert.match(a, /kind: 'container'/, 'and reports them as their own kind');
  const j = json('i18n-helper-ternary-audit.mjs');
  assert.equal(j.containers, 0, `${j.containers} container ternaries left (${j.containerStrings} strings)`);
  assert.equal(j.sites, 0, 'and no helper ternary of any kind is left');
  /* the ONE gate has to print it, or the next round cannot know it is being watched */
  assert.match(code(read('scripts/i18n-audit.mjs')), /whole container\(s\)/, 'the gate prints the container count');
});

/* ⚠ AND THE THREE PLACES IT WAS ARE FIXED AT THE ROOT, not translated in place: two of them were not
   UI text at all but DATA that has a per-language answer, and a table would have had to be extended
   by hand for every language ever added. */
test('r247 ⑤ the calendar and the Wikipedia widgets answer from the registry, not from a table', () => {
  const w = code(read('js/widgets.js'));
  assert.match(w, /new Intl\.DateTimeFormat\(window\.IntMapLang\.locale\(HOST\.lang\),\{weekday:'narrow'/,
    'the weekday initials come from CLDR');
  assert.match(w, /const wikiLangs=\(\)=>/, 'and the Wikipedia edition is derived from the reader\'s own tag');
  assert.match(w, /window\.IntMapLang\.htmlTag\(HOST\.lang\)/, '…from the registry, so a new language needs no edit here');
  assert.doesNotMatch(w, /jp\(\)\?\['ja','en'\]:\['en'\]/, 'the two-language list is gone');
});

/* ── ⑤b THE FEEDBACK TYPES ────────────────────────────────────────────────────────────────────
   「Feedbackの選べるtypeの種類が少なすぎる。」 Three choices sorted nothing. ⚠ And the reader of the
   list was on the wrong shape: #R243 turned these tuples into `LA(…)` CALLS, which return an ARRAY,
   and `submit()` still read `.en` off them — so every row since has been stored as 「[undefined]」. */
test('r247 ⑤b the feedback type list is the app\'s own subjects, and its English label is readable', () => {
  const f = code(read('js/feedback.js'));
  const ids = [...f.matchAll(/\[\s*'([a-z]+)'\s*,\s*LA\(/g)].map((m) => m[1]);
  assert.ok(ids.length >= 14, `only ${ids.length} feedback types — the reported defect was that there are too few`);
  for (const must of ['general', 'idea', 'bug', 'map', 'data', 'news', 'ai', 'sim', 'perf', 'lang', 'other']) {
    assert.ok(ids.includes(must), `the '${must}' type is missing`);
  }
  assert.match(f, /const catEN=\(CATS\.find\(x=>x\[0\]===cat\)\|\|\[,\['General'\]\]\)\[1\]\[0\];/,
    'the stored English label is read off the tuple as an ARRAY (LA returns one), not as an object');
  assert.doesNotMatch(f, /\)\[1\]\.en/, 'nothing reads `.en` off a pickArgs tuple any more');
});
