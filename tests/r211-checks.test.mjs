// R211 source-level regression checks.
//
// Everything here is written as a RELATION, never as a value (#R203's trap, hit five more times in
// #R210): "the gate does not grow with the ladder", "there is one palette and both halves use it",
// "the width is a square root of a ratio". A literal pinned here is a literal the next instruction
// breaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  : readFileSync(join(ROOT, p), 'utf8'));

/* ── 1 · terrain & water: the two objects the round was told to remove, and the one that stays ── */
test('R211 water: the dashed rectangle and the pond pins are gone, the ending label is not', () => {
  const src = read('js/terrain-water.js');
  assert.ok(!/id:'tw-area'/.test(src), 'the working rectangle layer is gone');
  assert.ok(!/properties:\{kind:'area'\}/.test(src), 'and so is the feature that fed it');
  assert.ok(!/id:'tw-lake'/.test(src), 'the per-pond pins are gone');
  assert.match(src, /kind:'end'/, 'the ending label stays — the picture cannot carry it');
  /* the ponds themselves are still COLLECTED; only the second drawing of them went */
  assert.match(src, /collectPond\(/, 'ponds are still collected and drawn as water');
  assert.match(src, /trace\.lakes\.length/, '…and still counted in the panel');
  /* the red volume beside the breach arrow */
  assert.match(src, /label:'➤'/, 'the spill arrow stays');
  assert.ok(!/label:'➤ '\+fmtM3/.test(src), 'without a volume in red beside it');
});

/* ── 2 · the flat-crossing machinery ─────────────────────────────────────────────────────────── */
/* ⚠ THE REPORTED DEFECT (northern Shiga → Seta → Yodo) IS NOT FIXED. Four hypotheses were measured
   and all four missed — DEV-NOTES #R211 §1 has the four traces and what each one showed. What IS
   asserted here is the machinery that WAS measured to be an improvement on wandering 600 km and
   calling it "still flowing" from the middle of a lake. A test claiming the defect fixed would be
   the most expensive kind of green there is. */
test('R211 water: a flat is left by its spill, and a stall nobody can escape ends', () => {
  const src = read('js/terrain-water.js');
  /* ⚠ ANCHOR ON THE ESCALATION, NOT ON THE FIRST `mult` IN THE FILE. `pitEscape()` has a ladder of
     its own ([1,3]) and is dead code kept for the note it carries — matching it made this test pass
     on the wrong ladder while it was still failing. The one under test is the trace's, identified by
     the `escal` budget it checks on its first line. */
  const m = /for\(const mult of \[([0-9,\s]+)\]\)\{\s*[\r\n]+\s*if\(escaped\|\|escal>=\d+\) break;/.exec(src);
  assert.ok(m, 'the escalation is a ladder of multipliers, not one rung');
  const rungs = m[1].split(',').map((s) => +s.trim()).filter(Number.isFinite);
  assert.ok(rungs.length >= 3, `at least three rungs (got ${rungs.length})`);
  for (let i = 1; i < rungs.length; i++) {
    assert.ok(rungs[i] > rungs[i - 1], 'each rung is wider than the last');
  }
  /* ⚠ THE RELATION THAT MATTERS: the acceptance threshold must NOT be a function of the rung. A
     coarser window over-estimates the fill a place needs, so a fixed number gets STRICTER as the
     window widens — the safe direction. Multiplying it by `mult` would let a wide window escape a
     genuinely closed basin. */
  assert.match(src, /<=LAKE_STOP_M\*3\)/, 'the gate is a fixed multiple of the lake-stop depth');
  assert.ok(!/LAKE_STOP_M\*mult/.test(src), 'and it is NOT scaled by the rung');
  /* the widest rung must be able to hold a lake bigger than the fine window: 161 samples × 27 is
     well over 100 km at any DEM level the trace uses */
  assert.ok(Math.max(...rungs) >= 9, 'the widest rung spans more than a hundred kilometres');
  /* and the DEM level follows the window, or a 400 km look-ahead would be tens of thousands of tiles */
  assert.match(src, /const wantPx=spacing\*mult\/1\.5;/, 'the sampling asked for follows the window');
  assert.match(src, /const zc=Math\.max\(5,Math\.min\(z,Math\.round\(Math\.log2\(/, '…and the zoom is derived from it');

  /* ⚠ A FLAT IS LEFT BY ITS SPILL, NOT BY ITS DRAINAGE TREE. With no slope the flood's `parent`
     chain leads to whichever border the heap reached first — a direction only by accident, and
     measured, it sent the walk back and forth across Lake Biwa until the 600 km cap. */
  assert.match(src, /function flatOutlet\(W,k0,tolM\)\{/, 'the spill of a flat is its own question');
  assert.match(src, /else if\(e<bestE\)\{ bestE=e; best=nk; \}/, 'and it is the lowest cell TOUCHING the flat');
  /* the two 'no answer' cases stay apart: widen only when nothing lower was found either */
  assert.match(src, /if\(!usable&&fo&&fo\.touchedEdge\)\{ escalMult=mult; continue; \}/,
    'a flat wider than the window widens instead of letting the talweg guess a direction');
  /* the fall a wide jump must show is bigger than the data's own noise */
  assert.match(src, /const FLAT_DROP_M=/, 'a real fall is named');
  assert.match(src, /eExit<eHere-FLAT_DROP_M/, 'and the talweg gate uses it, not a sign test');
  assert.ok(!/eExit<=eHere\+0\.5/.test(src), "#R189's +0.5 m gate is gone — on a lake every direction passed it");
  /* and a stall nobody can escape ENDS, rather than spending the budget looking like flow */
  assert.match(src, /if\(stallRun>=4\)\{/, 'four windows with no fall is an ending');
  assert.match(src, /end='lake'; break;/, 'and it is named as the lake it is');
  assert.match(src, /_dbgTrace:\(\)=>\{/, 'the diagnostic that settled all four hypotheses is kept');
});

/* ── 3 · one water, one palette, one primitive ────────────────────────────────────────────────── */
test('R211 water: the near field and the far field share the ramp and the cell', () => {
  const src = read('js/terrain-water.js');
  assert.match(src, /function waterRGBA\(d\)\{/, 'there is one ramp function');
  /* the ramp's constants appear ONCE — inside it. Two copies is how the two halves diverged. */
  const ramps = src.match(/126-96\*s/g) || [];
  assert.equal(ramps.length, 1, 'the standing-water ramp is written exactly once');
  assert.ok(!/const shade=\(d\)=>\{ const t=/.test(src), 'the far field no longer has a ramp of its own');
  assert.match(src, /const c=waterRGBA\(d\);/, 'the raster uses the shared ramp');
  /* ⚠⚠⚠ (#R267) 「上流と下流でモデルと表示方法を変えず配置地点付近のもので統一」 — THIS ROUND'S
     INSTRUCTION IS THE SAME ONE, A THIRD TIME («上流から下流まで全部同じモデル、描画にしろと言って
     いる»), and #R211 and #R255 both answered it by making the two drawings agree about colour and
     primitive. They still WERE two drawings, of two different objects, on two different clocks.
     There is one now: one depth field, one lattice, one canvas, so «share the ramp» is no longer a
     thing that has to be arranged. Asserted as a count, which cannot be satisfied by agreement. */
  assert.equal((src.match(/paintImg\(IMG_WATER/g) || []).length, 1, 'exactly one call paints water');
  assert.ok(!/const stamp=\(lng,lat,nx,ny,wl,wr,dep,cellM\)=>\{/.test(src), 'nothing stamps a course any more');
  assert.ok(!/g\.lineTo\(PX\(bR\[0\]\)/.test(src), 'the smooth quad is gone');
});

/* ── 4 · undo is one OPERATION ────────────────────────────────────────────────────────────────── */
test('R211 water: undo takes back one operation, whatever kind it was', () => {
  const src = read('js/terrain-water.js');
  assert.match(src, /function snapState\(\)\{/, 'an undo entry is the whole editable state');
  for (const field of ['sculpt', 'levees', 'sources', 'rainMm']) {
    assert.ok(new RegExp(`snapState[\\s\\S]{0,400}${field}`).test(src), `${field} is part of an undo entry`);
  }
  /* every mutating entry point pushes exactly one entry BEFORE it mutates */
  const mustPush = [
    /function placeSource\(lng,lat\)\{ pushUndo\(\);/,
    /pushUndo\(\); levees\.push\(drafting\)/,
    /panel\.querySelector\('\.tw-rain'\)\.onchange=e=>\{ pushUndo\(\);/,
    /addSource\(lng,lat,m3\)\{ pushUndo\(\);/,
    /addLevee\(pts,crest,width\)\{[^}]*pushUndo\(\);/,
  ];
  for (const rx of mustPush) assert.match(src, rx, `an operation that changes the answer must push: ${rx}`);
});

/* ── 5 · the panel the round was asked for ────────────────────────────────────────────────────── */
test('R211 water panel: no pan button, re-click releases, three pen widths, details hidden', () => {
  const src = read('js/terrain-water.js');
  /* 'pan' is still the idle STATE (the drag lock keys off it) but is not offered as a tool */
  assert.ok(!/\['pan','✋/.test(src), 'the Pan button is gone from the tool row');
  assert.match(src, /mode=\(mode===m&&m!=='pan'\)\?'pan':m;/, 're-selecting the active tool releases it');
  assert.match(src, /const PEN=\[\[\d+,/, 'the pen has named widths');
  const pens = (src.match(/const PEN=\[([\s\S]*?)\];/) || [, ''])[1].match(/\[\d+,/g) || [];
  assert.equal(pens.length, 3, 'three of them');
  assert.match(src, /Show details/, 'the expert read-out is behind a disclosure');
  assert.match(src, /function setMore\(h\)\{/, '…and it has its own sink, separate from the headline');
  /* the headline must NOT lead with the ponded volume any more */
  assert.ok(!/setStat\('<b>'\+L\('Ponded'/.test(src), 'the headline is the answer, not the book-keeping');
  assert.match(src, /function setProg\(frac,label\)\{/, 'a computation that takes seconds says so');
  assert.match(src, /warmDEMTiles\(warm,z,25000,\(f\)=>setProg\(/, '…fed by the fetch’s own progress');
  assert.ok(!/tw-refit/.test(src), 'the fit-to-view button is gone');
  assert.match(src, /o&&o\.refit/, '…but open({refit:true}) still works — the tests and Atlas use it');
  assert.match(src, /resetTerrain\(\)\{/, 'terrain can be reset without losing the water');
  assert.match(src, /function pourStart\(\)\{/, 'and the pour can be left running');
});

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
  /* (#R183) an unchecked response is a silent 「—」 */
  const fetches = src.match(/await fetch\(/g) || [];
  assert.ok(fetches.length >= 4, 'the pack fetches its data');
  for (const rx of [/if\(!r\.ok\) throw new Error\('owid /, /if\(!r\.ok\) throw new Error\('oec /,
                    /if\(!r\.ok\) throw new Error\('nws /, /if\(!r\.ok\) throw new Error\('marine /]) {
    assert.match(src, rx, `every source checks its status: ${rx}`);
  }
  /* the warnings layer must never let an empty map read as "nothing in force" */
  assert.match(src, /const FEEDS=\{ JPN:'jma', USA:'nws' \};/, 'the feeds that exist are named');
  assert.match(src, /that is not the same as "no warnings in force"/, 'and a country without one says so');
  /* Japan at the issuing unit: both area tiers are read */
  assert.match(src, /\(o\.areaTypes\|\|\[\]\)\.forEach\(\(at,ti\)=>/, 'both JMA area tiers are read');
  assert.match(src, /unit:ti===0\?'pref':'muni'/, '…and kept apart as prefecture and municipality');
  /* the tide extremum is refined between samples rather than pinned to the hour */
  assert.match(src, /const off=\(Math\.abs\(den\)>1e-9\)\?\(0\.5\*\(a-c\)\/den\):0;/,
    'high and low water are refined by a parabola through the three samples');
  /* crops: the national statistic and the 10 m extent are kept apart, and said so */
  assert.match(src, /No keyless crop-by-crop raster exists/, 'the crop layer states what it is not');
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

/* ── 7 · the share link ───────────────────────────────────────────────────────────────────────── */
test('R211 share: the simulators register by their lazy-module name, and a pending value is kept', () => {
  const ui = read('js/map-ui.js');
  assert.match(ui, /window\.IntMapShareState=\{/, 'there is a registry rather than a list of field names');
  /* a module that has not been fetched cannot register in time — so the value waits for it */
  assert.match(ui, /if\(PENDING&&PENDING\[key\]!==undefined\)\{ try\{ io\.set\(PENDING\[key\]\); \}catch\(_\)\{\} \}/,
    'whatever registers later is handed its own entry');
  assert.match(ui, /window\.IntMapLazy&&window\.IntMapLazy\.need\(k\)/, 'and the module is asked for by that key');
  /* the two simulators that register must use the SAME key IntMapLazy knows them by */
  const lazy = read('js/lazy-modules.js');
  for (const key of ['terrainWater', 'seismic']) {
    assert.ok(new RegExp(`register\\('${key}'`).test(read(key === 'seismic' ? 'js/seismic.js' : 'js/terrain-water.js')),
      `${key} registers its inputs`);
    assert.ok(new RegExp(`case '${key}':`).test(lazy), `…under the name IntMapLazy fetches it by`);
  }
  /* the new layer rows travel in the link like every other data layer */
  assert.match(ui, /input\[id\^="wp-dl-"\]:checked/, 'the world-data rows are part of the shared layer set');
  /* a reload restores everything, with a way out of a crash loop */
  assert.match(ui, /intmap_restore_try/, 'the attempt is recorded before it runs');
  assert.match(ui, /firstLoad!==false \|\| !crashed/, 'a reload restores fully unless the last attempt did not survive');
});

/* ── 8 · the transparency page ────────────────────────────────────────────────────────────────── */
test('R211 science page: it exists, it ships, and Settings links to it in five languages', () => {
  assert.ok(existsSync(join(ROOT, 'science.html')), 'the page exists');
  const page = read('science.html');
  /* it must document METHOD, and it must be the one place that says what each model does NOT answer */
  for (const anchor of ['id="water"', 'id="seismic"', 'id="tsunami"', 'id="tides"', 'id="trade"', 'id="energy"', 'id="crops"', 'id="alerts"']) {
    assert.ok(page.includes(anchor), `the page covers ${anchor}`);
  }
  assert.ok(/steady-state routing model/.test(page), 'and states the limits of each model');
  /* it is copied by the build (it is markup, not a bundle entry) */
  assert.match(read('vite.config.js'), /'science\.html',/, 'the build copies it');
  /* the app links to it, and the label exists in all five languages */
  assert.match(read('index.html'), /id="link-science"[^>]*href="\.\/science\.html"/, 'Settings links to it');
  const late = read('js/i18n-late.js'), i18n = read('js/i18n.js');
  assert.equal((late.match(/viewScience:/g) || []).length, 2, 'en + jp');
  assert.equal((i18n.match(/viewScience:/g) || []).length, 3, 'de + ru + es');
});

/* ── 9 · POI labels ───────────────────────────────────────────────────────────────────────────── */
test('R211 POI: on by default, coloured by tier, industry named, and no all-at-once zoom', () => {
  const pl = read('js/place-labels.js');
  /* ⚠ the gate must not be a step — that is what made a whole tier appear at one zoom */
  /* ⚠ the right-hand side MUST be a `step` — MapLibre rejects an `interpolate` on zoom inside a
     filter and addLayer throws, which took the whole label stack down. What removes the
     all-at-once is (a) the per-feature offset and (b) a ladder that advances by less than a whole
     tier per zoom, so each step admits only part of a tier. */
  const gate = /const POI_GATE=\['<=',\['\+',POI_TIER,POI_JITTER\],\['step',\['zoom'\],([0-9.,\s]+)\]\];/.exec(pl);
  assert.ok(gate, 'the gate compares the jittered tier against a zoom STEP');
  const nums = gate[1].split(',').map(Number).filter(Number.isFinite);
  const thresholds = nums.filter((_, i) => i % 2 === 0);   // stop outputs: 1st, then every other
  let advance = 0, steps = 0;
  for (let i = 1; i < thresholds.length; i++) { advance += thresholds[i] - thresholds[i - 1]; steps++; }
  assert.ok(steps >= 4, `the ladder has at least four steps (got ${steps})`);
  assert.ok(advance / steps < 1, 'each step admits LESS than a whole tier — that is what spreads a tier over zooms');
  assert.match(pl, /const POI_JITTER=\['\*',0\.9,/, 'and each feature carries its own offset inside a tier');
  assert.ok(!/\['interpolate',\['linear'\],\['zoom'\],12,1,18,5\]/.test(pl), 'no interpolate-on-zoom in a filter');
  /* colour by tier, both themes */
  assert.match(pl, /const POI_COL_DARK=\['match',POI_TIER,/, 'dark theme colours by tier');
  assert.match(pl, /const POI_COL_LIGHT=\['match',POI_TIER,/, 'light theme too');
  assert.ok(!/setPaint\('ofm-poi','text-color', lightPoi\?'#ffd9a0':'#8a5300'\)/.test(pl),
    'the flat repaint that undid it is gone');
  /* factories and companies are named rather than falling through to the bottom tier */
  for (const cls of ['industrial', 'factory', 'works', 'office', 'warehouse']) {
    assert.ok(pl.includes(`'${cls}'`), `${cls} is a named class`);
  }
  /* ⚠⚠ AND EVERY CLASS APPEARS IN EXACTLY ONE BRANCH. A `match` with a repeated label fails
     MapLibre's style validation («Branch labels must be unique»), addLayer THROWS, and the entire
     label stack stops existing — the silent-loss shape this project keeps paying for. Adding
     'office' to tier 2 while it was still in tier 3 did precisely that; tests/smoke caught it.
     Derived from the source rather than listed, so a future addition cannot reintroduce it. */
  const tierBlock = pl.slice(pl.indexOf('const POI_TIER='), pl.indexOf('    4];'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = [...tierBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const seen = new Set();
  const dups = [...new Set(classes.filter((c) => (seen.has(c) ? true : (seen.add(c), false))))];
  assert.deepEqual(dups, [], `a class may appear in only one tier; repeated: ${dups.join(', ')}`);
  assert.ok(classes.length > 60, 'and the tiers are actually populated');
  /* ⚠ and the OSM schema's own British spellings are still intact — they are a data contract */
  assert.ok(pl.includes("'sports_centre'") && pl.includes("'community_centre'"),
    'the tile schema keeps its own spelling');
  /* default on */
  assert.match(read('js/app-body.js'), /poiOn=true;/, 'the shop/facility names are on from the start');
  assert.match(read('index.html'), /id="cb-poi" checked/, '…and the box shows it');
});

/* ── 10 · the British→US sweep did not touch a contract ───────────────────────────────────────── */
test('R211 spelling: the sweep left every data contract and every other language alone', () => {
  /* the four landmines, by name (#R210 §10 found three of them; the fourth is the tile schema) */
  assert.match(read('js/atlas-console.js'), /'grey':'#8e8e93'/, "the colour table keeps 'grey' as an accepted input");
  assert.match(read('js/atlas-console.js'), /'defence':'milb'/, "…and 'defence' as an accepted query");
  assert.match(read('js/routing.js'), /'cancelled'/, 'the routing status token is untouched');
  assert.match(read('js/place-labels.js'), /'sports_centre'/, 'the OpenMapTiles class value is untouched');
  assert.match(read('js/place-framing.js'), /'neighbourhood'/, 'the Nominatim place type is untouched');
  assert.match(read('js/newsgeo.js'), /Organisation for the Prohibition/, 'a proper name is not a spelling');
  assert.match(read('js/space.js'), /Modellma/, 'German is not British English');
  /* and the user-visible side really did move */
  for (const [file, rx] of [['js/compare.js', /Minimize/], ['js/satellite-detail.js', /Center the map on it/],
                            ['js/viewshed.js', /Gray = terrain/], ['js/satellites-live.js', /catalog shipped with the app/]]) {
    assert.match(read(file), rx, `${file} reads in US English`);
  }
});
