/* ============================================================================
 *  WORLD DATA PACKS — trade, crops and tides (js/world-packs.js)
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/world-packs.js is one page closure over the
 *    renderer; these read the source, comments stripped.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r211-checks.test.mjs (tests #6, #7, #8 of 12) ═══
   R211 source-level regression checks.

   Everything here is written as a RELATION, never as a value (#R203's trap, hit five more times in
   #R210): "the gate does not grow with the ladder", "there is one palette and both halves use it",
   "the width is a square root of a ratio". A literal pinned here is a literal the next instruction
   breaks.

   (layer-manifest) which layers exist, and their facts */
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

/* ── 6 · the new world layers ─────────────────────────────────────────────────────────────────── */
test('R211 trade: the width is a square root of a ratio, and the value is never rescaled', () => {
  const src = read('js/world-packs.js');
  /* ⚠ the instruction is a RELATION: not linear. Assert the shape, not the two constants. */
  assert.match(src, /const w=[\d.]+\+[\d.]+\*Math\.sqrt\(Math\.max\(0,d\.v\)\/Math\.max\(1,vmax\)\);/,
    'line width follows the square root of the share');
  assert.ok(!/const w=[\d.]+\+[\d.]+\*\(Math\.max\(0,d\.v\)\/Math\.max\(1,vmax\)\)/.test(src),
    'and is not linear in it');
  /* both figures on hover — the compressed one to read and the exact one to trust */
  assert.match(src, /function usdShort\(v\)\{/, 'a short form for reading');
  assert.match(src, /function usdExact\(v\)\{ return '\$'\+Math\.round\(v\)\.toLocaleString\('en-US'\); \}/,
    'and the figure itself, grouped and unrounded beyond the dollar');
  assert.match(src, /esc\(p\.vShort\)[\s\S]{0,220}esc\(p\.vExact\)/, 'the hover shows both');
});

test('R211 world layers: nothing is shipped, every fetch is checked, and silence is never a claim', () => {
  const src = read('js/world-packs.js');
  /* ⚠⚠⚠ (#R301) DERIVED, NOT LISTED — AND IT FOUND ONE. #R183's rule is «an unchecked response is a
     silent 「—」». #R211 wrote it down as four throws named by their text (`'owid '`, `'oec '`,
     `'nws '`, `'marine '`); the tide fetch later moved behind window.IntMapWx.guardedJSON, which
     checks the status FOR it, so the named-throw assertion went red for a file that had got more
     careful rather than less — and, because nothing ran this file, it went red unread while a
     genuinely unchecked fetch was added to the crop layer and nobody heard about it (that one
     turned an ArcGIS error into 「no cultivation recorded in this cell」 — a server outage reported
     to the reader as a measured fact about the ground). Derived over every call site, this cannot
     go stale and cannot be satisfied by keeping a string. */
  /* ⚠ COMMENTS ARE STRIPPED FIRST, both ways round: a note that happens to contain `.ok` is not
     a status test, and a nine-line note BETWEEN a call and its guard is not a missing one. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const sites = [...code.matchAll(/\bfetch\(/g)].map((m) => m.index);
  assert.ok(sites.length >= 4, 'the pack fetches its data');
  assert.equal(sites.length, (src.match(/\bfetch\(/g) || []).length,
    'stripping the comments did not remove a call site — if it did, this scan is looking at the wrong text');
  const unchecked = sites
    .filter((i) => !/\.ok\b/.test(code.slice(i, i + 300)))
    .map((i) => code.slice(i, i + 64).replace(/\s+/g, ' '));
  assert.deepEqual(unchecked, [], `every response has its status looked at before it is read:\n  ${unchecked.join('\n  ')}`);
  /* the paths that do NOT call fetch themselves are guarded by the helper that does, and an empty
     answer from it is an error rather than a value */
  assert.match(src, /throw new Error\('marine'\)/, 'the tide model that comes back empty is an error, not a reading');
  /* the warnings layer must never let an empty map read as "nothing in force" */
  assert.match(src, /const FEEDS=\{[^}]*JPN:'jma'[^}]*\}/, 'the feeds that exist are named, Japan among them');
  assert.match(src, /const FEEDS=\{[^}]*USA:'nws'[^}]*\}/, '…and the United States');
  /* ⚠ ASSERTED AS A FLOOR, NOT A LITERAL. #R211 pinned the whole table — `{ JPN:'jma', USA:'nws' }` —
     and eleven rounds since have added a national agency to it. The invariant is that it only ever
     grows and that a country outside it is HATCHED rather than painted 「no warnings in force」. */
  const feeds = ((src.match(/const FEEDS=\{([\s\S]*?)\};/) || [, ''])[1].match(/[A-Z]{3}:'/g) || []).length;
  assert.ok(feeds >= 12, `the national feeds only ever grow (got ${feeds})`);
  assert.match(src, /const HATCH_ROW=\(\)=>/, 'a country with no feed reads as a country with no feed');
  assert.match(src, /Not covered, or not read yet/, '…and the legend says which of the two it is');
  /* Japan at the issuing unit: both area tiers are read and kept apart (#R299 re-spelled the pair) */
  assert.match(src, /\[\['class10Items','region'\],\['class20Items','muni'\]\]/, 'both JMA area tiers are read');
  assert.match(src, /if\(unit==='muni'\)/, '…and kept apart as region and municipality');
  /* the tide extremum is refined between samples rather than pinned to the hour */
  assert.match(src, /const off=\(Math\.abs\(den\)>1e-9\)\?\(0\.5\*\(a-c\)\/den\):0;/,
    'high and low water are refined by a parabola through the three samples');
  /* ⚠ #R211 asserted the crop layer said «No keyless crop-by-crop raster exists». One does now —
     FAO GAEZ v4, a 5-arcminute grid — so the layer states what it IS rather than what it is not. */
  assert.match(src, /FAO GAEZ v4/, 'the crop layer names the raster it is showing');
  assert.match(src, /reference years 2000 and 2010/, '…and the reference years it is showing it for');
});

test('R211 world layers: a refused layer add is retried, and a style swap puts them back', () => {
  const src = read('js/world-packs.js');
  assert.match(src, /function whenDrawable\(fn,tries\)\{/, 'adds retry rather than being tried once');
  assert.match(src, /GE\(\)\.events\.on\('styledata'/, 'and a basemap swap re-applies them');
  const hooks = src.match(/onRestyle\(\(\)=>/g) || [];
  assert.ok(hooks.length >= 3, `every geojson family re-applies (got ${hooks.length})`);
  /* the country hit-test is a map-level owner, so it must claim and must ask (#R210) */
  assert.match(src, /GE\(\)\.events\.clickClaimed&&GE\(\)\.events\.clickClaimed\(e\)/, 'it asks before consuming');
  assert.match(src, /GE\(\)\.events\.claimClick&&GE\(\)\.events\.claimClick\(e\)/, '…and claims when it does');
  /* ⚠ and it never re-broadcasts countryGeo as a second source (#R166's MapLibre worker overflow) */
  assert.ok(!/addSource\('wp-countries'/.test(src), 'the country polygons are not handed to the renderer twice');
  assert.match(src, /setFeatureState\(\{source:'countries'/, 'choropleths go through the existing source');
});
}

/* ═══ from tests/r218-checks.test.mjs (tests #21, #22, #23 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '');

/* ── ⑧ the smaller wirings: trade, tides, crops, seismic click mode, flight sim, rivers ─── */
test('#R218 ⑧ the trade direction segment re-lights when it is pressed', () => {
  const s = code('js/world-packs.js');
  assert.match(s, /\.wp-x'\)\.onclick=\(\)=>\{ dir='X'; render\(\); load\(iso,true\); \}/);
  assert.match(s, /\.wp-m'\)\.onclick=\(\)=>\{ dir='M'; render\(\); load\(iso,true\); \}/);
});
test('#R218 ⑧ the tide shading is painted from the scan, before anything is tapped', () => {
  const s = code('js/world-packs.js');
  assert.match(s, /function paintFloodFromStations\(\)/);
  assert.match(s, /drawStations\(\); paintFloodFromStations\(\);/, 'the scan does not shade');
  assert.match(s, /const at=\(typeof level==='function'\)\?level:\(\)=>level;/, 'paintFlood still takes only one level');
});
test('#R218 ⑧ the crop raster is fetched per quadtree cell and kept', () => {
  const s = code('js/world-packs.js');
  /* ══ ⚠⚠ (#R255) THE CELL WAS THE FIX FOR ONE DEFECT AND THE CAUSE OF THE NEXT ═════════════════
     #R218 stopped the layer re-fetching a picture of the viewport on every pan by snapping the
     request to a quadtree cell and keeping the answer — and that is why 「移動やズームですぐに描画が
     ずれたり地図が黒におかしくなる」: between the move and the new picture, the OLD one is still on
     screen, geographically correct and at the wrong SCALE. Magnified from a world cell to a city,
     one source pixel covers the screen; at the dark end of the ramp the screen is black (measured:
     mean luminance 8.3). The layer is a raster TILE source now, so the renderer asks for the tiles
     that cover the view at the zoom it is at and never stretches one across another.
     What #R218 was really asserting — that panning does not re-fetch what is already held — is
     asserted here against the tile cache that now holds it (measured: 98 requests for 11 tiles
     before it, 8 after; a pan back costs none). */
  assert.match(s, /const _tiles=new Map\(\), _inflight=new Map\(\)/, 'the crop tiles are not kept');
  assert.match(s, /function _tileGet\(k\)/, 'nothing is cached');
  assert.match(s, /if\(out\) _tilePut\(ck,out\);/, 'a fetched tile is not put in the cache');
  assert.match(s, /function tileBox\(z,x,y\)/, 'the request box is not taken from the tile itself');
});
}

/* ═══ from tests/r255-checks.test.mjs (tests #1, #2 of 13) ═══
    #R255 — source-level checks
    Each test pins the CAUSE this round measured, not the symptom, so the next
    round cannot re-introduce the same shape somewhere else and pass.

   (layer-manifest) which layers exist, and their facts */
{
/* comments carry the reasoning and quote the very strings under test — strip them first */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/* ── ① the trade arrowhead is sized FROM the shaft, and there is a terminal head ─────────────── */
test('#R255 ① trade arrows: the head is derived from the line width and every arc ends in one', () => {
  const wp = code(read('js/world-packs.js'));
  /* the whole defect was a head sized independently of the line it sits on.
     ⚠ (#R258) renamed `arrowSize` → `headBasePx`/`headSize`, because the head's BASE is now the
     number that matters (the shaft is trimmed by its length). Still a function of `w`. */
  assert.match(wp, /const headBasePx=\(w\)=>Math\.max\(10,2\.8\*w\);/, 'the arrowhead size is no longer a function of the line width');
  assert.ok(!/asz:Math\.max\(0\.34,Math\.min\(0\.92,0\.30\+0\.62\*Math\.sqrt/.test(wp),
    'the old independent icon-size formula is back — a 10 px head on a 13 px line of the same colour is invisible');
  assert.match(wp, /kind:'tip'/, 'the terminal arrowhead feature is gone');
  assert.match(wp, /'wp-trade-tip'/, 'the terminal arrowhead layer is gone');
  /* it must follow the arrows toggle, not the layer */
  assert.match(wp, /function applyVis\(\)\{ setVis\(LYR,on&&arrows\); \}/,
    'the terminal head does not follow the 「矢印の有無」 toggle');
  /* ⚠⚠ (#R258) THE OUTLINE IS DELIBERATELY GONE. #R255 added it so a head could be told apart from a
     stroke of its own colour it was lying ON TOP OF. The round that followed says the head must not
     look pasted on — so the shaft now STOPS at the head's base (trimEnd) and there is nothing to
     separate it from: one colour, one opacity, one object. An outline would put the seam back. */
  assert.doesNotMatch(wp, /strokeStyle='rgba\(4,10,22,0\.85\)'/, 'the outline is back, and with it the pasted-on look');
  assert.match(wp, /'line-cap':'butt'/, 'the shaft no longer ends flat against the head');
});

/* ── ② the crop layer is a TILE source, not one stretched image ──────────────────────────────── */
test('#R255 ② crops: a raster tile source bounded by the data, not a per-view image', () => {
  const wp = code(read('js/world-packs.js'));
  assert.match(wp, /addProtocol\(CROP_PROTO/, 'the crop tile protocol is gone');
  assert.match(wp, /type:'raster',tiles,tileSize:TILE_N/, 'the crop layer is not a raster tile source any more');
  /* the shapes that produced the black screen must not come back */
  /* ⚠ scoped to the crops IIFE: the TIDES layer legitimately paints its flood as an image source of
     its own, with an `IMG` constant of its own, and an unscoped test would fail on that. */
  const crops = wp.slice(wp.indexOf('(function crops()'));
  assert.ok(crops.length > 1000, 'the crops block could not be located');
  assert.ok(!/updateImage\(IMG/.test(crops), 'the crop layer is back to a single image source');
  assert.ok(!/function _cellBox\(/.test(wp), 'the per-view quadtree cell is back — that is what got stretched');
  /* maxzoom is set by the 5-arcminute grid, and the tile cache is what keeps FAO cheap */
  assert.match(wp, /TILE_N=512, TILE_MAXZ=4/, 'the tile size / maxzoom pair changed without a note');
  assert.match(wp, /_inflight=new Map\(\)/, 'concurrent asks for the same tile are no longer coalesced (measured: 98 requests for 11 tiles)');
});
}

/* ═══ from tests/r258-checks.test.mjs (tests #1, #2, #3, #4 of 16) ═══
    #R258 — source-level checks
    Each test below pins ONE defect this round measured, in the form the
    measurement took. They are source assertions (no browser), which is what the
    `tests/r*-checks` family is for: the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ① the crop layer restyled itself at ~9 Hz ──────────────────────────────────────────────────
   MEASURED on the shipped build: 88 remove/addSource/add cycles in 10 s with the camera still, and
   `styledata` 28 times in 3 s with the layer on against 0 with it off. `paint(true)` removes and
   re-adds the source, the renderer fires `styledata`, `onRestyle` cleared `drawKey` and called
   `paint(true)` again. The handler must not rebuild a layer that is still standing. */
test('R258 ①: the crop layer only rebuilds when its layer is actually gone', () => {
  const s = read('js/world-packs.js');
  /* ⚠ (#R297) NAME THE HANDLER. This matched the FIRST `onRestyle(()=>{ if(!on) return;` in the
     file, and #R297 gave the warnings layer one that opens the same way — so the test silently
     began asserting about a different family. The crop one is the one after the crop layer's ids.
     (#R297 found the same loop in the warnings layer, from the other end: `styledata` fires for
     `setSourceData` too, so an unconditional rebuild in this handler re-fires itself.) */
  const crop = s.slice(s.indexOf("LYR='wp-crop"));
  assert.ok(crop.length > 1000, 'the crop family was not found');
  const m = crop.match(/onRestyle\(\(\)=>\{ if\(!on\) return;[\s\S]{0,400}?\}\);/);
  assert.ok(m, 'the crop onRestyle handler is written as an early-return guard');
  assert.match(m[0], /GE\(\)\.layers\.has\(LYR\)&&GE\(\)\.layers\.hasSource\(IMG\)\)\s*return;/,
    'it returns without touching the style when the layer and its source are both present');
  assert.doesNotMatch(s, /onRestyle\(\(\)=>\{ if\(on\)\{ drawKey=''; whenDrawable\(\(\)=>paint\(true\)\); \} \}\);/,
    'the unconditional rebuild must not come back — it is the loop');
});

/* ── ② the trade flow is an arrow, not a line with arrows on it ─────────────────────────────────
   「誰が線に複数矢印つけろって言ってんねん。それに矢印だけオンオフしてどないすんねん線もやろがい。」 */
test('R258 ②: the along-the-shaft arrowhead repeater is gone, and removed from a live style', () => {
  const s = read('js/world-packs.js');
  assert.doesNotMatch(s, /layers\.add\(\{id:'wp-trade-arrow'/,
    'no symbol layer places heads along the line any more');
  assert.match(s, /if\(GE\(\)\.layers\.has\('wp-trade-arrow'\)\) GE\(\)\.layers\.remove\('wp-trade-arrow'\)/,
    '…and a session that still carries it loses it, the way #R212 retired tw-breach');
  assert.doesNotMatch(s, /'symbol-placement':'line','symbol-spacing':110/, 'the repeater is not merely renamed');
});
test('R258 ②b: the switch takes the whole arrow, and the head is not pasted on', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /function applyVis\(\)\{ setVis\(LYR,on&&arrows\); \}/,
    'one visibility rule over shaft + head + label — not the heads alone');
  assert.match(s, /const SRC='wp-trade', LYR=\['wp-trade-arc','wp-trade-tip','wp-trade-lbl'\]/,
    'LYR is exactly the three the arrow is made of');
  assert.match(s, /'line-cap':'butt'/, 'the shaft ends flat, against the head’s base');
  assert.match(s, /'line-opacity':1/, 'shaft and head share one opacity — 0.78 vs 0.98 is what read as two objects');
  assert.match(s, /'icon-anchor':'top'/, 'the head’s TIP sits on the arc’s last vertex');
  assert.doesNotMatch(s, /strokeStyle='rgba\(4,10,22,0\.85\)'/, 'no dark outline round the head');
});
test('R258 ②c: the shaft is trimmed in the renderer’s own projection', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /GE\(\)\.coords&&GE\(\)\.coords\.project/,
    'trimEnd projects the vertices — Mercator metres are only right at the map centre (measured: '
    + '10.1 px of gap for a 45.5 px head at z4 in globe projection)');
  assert.match(s, /GE\(\)\.events\.on\('moveend',\(\)=>\{ if\(!\(on&&rows&&iso\)\) return;/,
    '…and the geometry is rebuilt when the camera moves, because the cut is a number of pixels');
});
}

/* ═══ from tests/r261-checks.test.mjs (tests #1 of 13) ═══
    #R261 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here.

    ⚠ (#R283) EVERY ASSERTION BELOW IS ABOUT THE CONTENT OF A FILE, SO IT READS THE
    CONTENT. This file used to read the bytes the checkout produced, and ③ demands a
    line break at a named place — which on a CRLF working copy has a carriage return
    in front of it, so ③ has been red on Windows and green in CI ever since #R275 gave
    it that shape. See scripts/eol.mjs: the line break ③ requires is still required,
    and nothing else moved.

   (layer-manifest) which layers exist, and their facts */
{

/* ── ① the trade arrowhead is aimed in SCREEN space ─────────────────────────────────────────────
   「貿易レイヤーは、矢印と線が分離している。」 MEASURED in globe projection, head angle vs the true
   screen direction of the shaft's last leg: 26.3° apart at z2.2 (USA) and 130.5° at z1.4 — a 45 px
   head standing clear of the 13 px line it terminates. The cut was computed in projected pixels and
   the angle in geographic degrees; they are one space now. After: ≤ 0.02°. */
test('R261 ①: the trade arrowhead is rotated in viewport space, from the projected neck', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /'icon-rotate':\['get','brg'\],'icon-rotation-alignment':'viewport'/,
    "`brg` is a screen angle, so the tip layer must be aligned to the viewport");
  assert.doesNotMatch(s, /'icon-rotation-alignment':'map'/,
    "'map' means «from the map's north», which on a globe is not the screen direction");
  assert.match(s, /const neckP=\[bP\[0\]\+\(aP\[0\]-bP\[0\]\)\*f, bP\[1\]\+\(aP\[1\]-bP\[1\]\)\*f\];/,
    'the neck is interpolated in the PROJECTED space the cut was measured in');
  assert.match(s, /return \{ shaft:\(shaft\.length>=2\?shaft:null\), brg:ang\(neckP,tipP\) \};/,
    'and the angle is read there, not from bearingOf()');
});
}
