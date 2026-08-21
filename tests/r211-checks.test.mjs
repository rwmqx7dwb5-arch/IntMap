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
/* ⚠⚠⚠ (#R301) THIS FILE WAS NEVER RUN. tests/r211-checks.test.mjs was left out of the `test:checks`
   list in package.json, so from #R211 until #R301 it was never once executed — the mirror image of
   the hazard tests/r260-checks.test.mjs ⑥ guards against («green for ever»), and just as invisible,
   because nothing ran it either way. When #R301 finally did, five of its twelve tests failed on
   `main`. They did not all fail at once: each went red as the later instruction that deleted what
   it pinned landed, the first of them at #R212 — and nothing printed any of it.
   What #R211 was asked for has not changed. What HAD changed is that several assertions pinned a
   SPELLING, and later rounds were instructed to delete the thing that was spelled that way — the
   exact trap this file's own header warns about («a literal pinned here is a literal the next
   instruction breaks»), left to rot because nobody ever saw it break. Each one is rewritten below
   as the relation it was standing in for, with the instruction that moved it named. */
test('R211 water: the working rectangle, the pond pins and the red arrows are gone; the ending label is not', () => {
  const src = read('js/terrain-water.js');
  assert.ok(!/id:'tw-area'/.test(src), 'the working rectangle layer is gone');
  assert.ok(!/properties:\{kind:'area'\}/.test(src), 'and so is the feature that fed it');
  assert.ok(!/id:'tw-lake'/.test(src), 'the per-pond pins are gone');
  assert.match(src, /kind:'end'/, 'the ending label stays — the picture cannot carry it');
  /* ⚠ WAS `collectPond(` + `trace.lakes.length`. #R211 kept a second pass that collected the ponds
     the trace crossed so they could be drawn as water and counted; #R267 made standing water the
     FIELD's own (a cell is deep and still because the integration made it so), so there is no list
     of ponds left to collect, to draw or to count. The relation those two assertions were standing
     in for survives that intact: ponded water is drawn ONCE, and is still reported in words. */
  const kinds = [...new Set([...src.matchAll(/kind:'([a-z]+)'/g)].map((m) => m[1]))];
  for (const gone of ['lake', 'pond', 'area']) {
    assert.ok(!kinds.includes(gone), `no vector feature re-draws water the field already draws (kinds: ${kinds.join(',')})`);
  }
  assert.match(src, /setMore\('<b>'\+L\('Ponded'/, 'the ponded water is still reported in the panel');
  assert.match(src, /result\.storedM3/, '…read off the one field, not off a list of ponds');
  /* ⚠ WAS `label:'➤'` («the spill arrow stays»). #R212's instruction was 「また、赤い矢印はいらない。
     一切不要。」 and it removed the layer rather than emptying it, so a session that had the arrows
     drawn loses them too. A test pinning the arrow is a test that fails the NEXT instruction — which
     is precisely what this one did, silently, for ninety rounds. The relation that has to hold is
     that the spill points are still COMPUTED and still SAID, because silence would be a claim. */
  assert.ok(!/label:'➤/.test(src), 'no spill arrow is drawn any more (#R212)');
  assert.match(src, /GE\(\)\.layers\.remove\('tw-breach'\)/, '…and the layer is removed, not emptied');
  assert.match(src, /result\.breaches\.length/, 'the overtopping is still counted and still reported');
  assert.ok(!/label:'➤ '\+fmtM3/.test(src), 'and no volume is printed in red beside it');
});

/* ── 2 · where the water ends up ──────────────────────────────────────────────────────────────── */
/* ⚠⚠⚠ (#R301) THE MACHINE THIS TEST DESCRIBED WAS DELETED ON PURPOSE, AND THE TEST NEVER SAID SO.
   #R211 asserted the escalation ladder for wide flats, `flatOutlet()`, `FLAT_DROP_M`, the stall
   counter and the DEM level derived from the window — all of it the downstream WALK that #R186
   built: 600 km of polyline computed the moment the water was placed. #R267 was told
   「上流から下流まで全部同じモデル、描画にしろ」 and deleted the walk rather than porting it, saying so
   in the file: «Everything else the walk carried — the escalation ladder for wide flats, the
   corridor refinement, the cross-section solve, the kinematic-wave arrival — is deleted rather than
   ported. Each existed to make a POLYLINE behave like water; there is no polyline.»
   The REQUIREMENT is unchanged and is still #R186's:
   「水は流れなくなる地点または海に到達した地点まで高精度に実データに忠実に描画すること。」
   So this test now asserts that requirement against the machine that answers it, which is the one
   model — and it asserts the deletion too, because a resurrected second calculation is the defect
   #R267 removed. ⚠ IT STILL DOES NOT CLAIM THE #R211 DEFECT (northern Shiga → Seta → Yodo) IS
   FIXED; DEV-NOTES #R211 §1 has the four traces that all missed. A test claiming that would be the
   most expensive kind of green there is. */
test('R211 water: the two endings are read off the field, not computed beside it', () => {
  const src = read('js/terrain-water.js');
  /* the answer is DERIVED — one `trace`, filled in from the running field, never a second walk */
  assert.match(src, /let trace=null;/, 'there is one answer object');
  assert.match(src, /function frontCell\(\)\{/, 'and it is read off the leading wet cell of the field');
  assert.match(src, /async function courseCheck\(\)\{/, '…on the clock, not at the moment water is placed');
  /* ⚠ THE TWO ENDINGS THE INSTRUCTION NAMES, each measured rather than ruled */
  assert.match(src, /async function seaCheck\(lng,lat\)\{/, '「海に到達した地点」 is a question about the DEM');
  assert.match(src, /if\(v&&v\.sea\) end='sea';/, '…and only a connected answer names the sea');
  assert.match(src, /const STILL_S=\d+;\s+\/\* simulated seconds/, '「流れなくなる地点」 is a stretch of SIMULATED time');
  assert.match(src, /let end=stalled\?'still':'running'/, '…measured on this run rather than ruled about basins');
  assert.match(src, /!contSources\(\)\.length/, 'and a tap that is still running has not stopped, however still the front is');
  /* the honest third and fourth answers: still going, and gone off the edge of what is modelled */
  const cases = [...src.matchAll(/case '([a-z]+)': return/g)].map((m) => m[1]);
  for (const c of ['sea', 'still', 'extent', 'running']) {
    assert.ok(cases.includes(c), `the label has an answer for '${c}' (has: ${cases.join(',')})`);
  }
  assert.match(src, /if\(basinCapped&&end==='running'\) end='extent';/,
    'running out of modelled area is not the same as arriving anywhere');
  /* ⚠ AND THE WALK STAYS DELETED. Every one of these was the polyline pretending to be water; each
     is asserted absent by NAME, so re-introducing one fails here instead of quietly restoring the
     two-models-two-answers shape #R267 removed. */
  for (const [rx, what] of [[/for\(const mult of \[/, 'the escalation ladder'],
                            [/function flatOutlet\(/, 'the flat-spill solve'],
                            [/const FLAT_DROP_M=/, 'the talweg fall gate'],
                            [/if\(stallRun>=/, 'the stall counter'],
                            [/const wantPx=spacing\*mult/, 'the window-derived DEM level']]) {
    assert.ok(!rx.test(src), `${what} is not back — the field answers this now (#R267)`);
  }
  /* the diagnostic that settled #R211's four hypotheses is kept, because the defect is not closed */
  assert.match(src, /_dbgTrace:\(\)=>\{/, 'the diagnostic stays');
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
  /* ⚠ (#R301) THE RELATION IS «PUSH BEFORE MUTATE», NOT A SIGNATURE. #R211 wrote each entry point
     out literally — `addSource(lng,lat,m3){ pushUndo();` — and #R271 gave that one an options
     argument, made it async, and put the three await'ed reaches-the-point steps AHEAD of the push,
     all of which is correct: an undo entry taken before a rebuild that returns null is an entry for
     nothing. Spelled as a signature the assertion failed a change that made the code better and
     said 「an operation that changes the answer must push」 while it still did. Spelled as an ORDER
     it passes that change and still fails the thing that actually breaks undo. */
  const pushesFirst = (label, entry, mutation) => {
    const i = src.search(entry);
    assert.ok(i >= 0, `${label}: no entry point matches ${entry}`);
    const body = src.slice(i, i + 3000);
    const p = body.indexOf('pushUndo()');
    const m = body.search(mutation);
    assert.ok(p >= 0, `${label} must take an undo entry`);
    assert.ok(m >= 0, `${label} must actually mutate something, or this asserts nothing`);
    assert.ok(p < m, `${label} takes its undo entry BEFORE it mutates (push at +${p}, mutation at +${m})`);
  };
  pushesFirst('placeSource', /function placeSource\(/, /sources\.push\(/);
  pushesFirst('the levee commit', /\n\s+if\(p\.length>=2\)\{/, /levees\.push\(/);
  pushesFirst('the rain field', /\.tw-rain'\)\.onchange=/, /rainMm=[^=]/);
  /* the same four operations through Atlas, which is the other door into every one of them */
  pushesFirst('Atlas addSource', /\n\s+(?:async\s+)?addSource\(/, /sources\.push\(/);
  pushesFirst('Atlas addLevee', /\n\s+(?:async\s+)?addLevee\(/, /levees\.push\(/);
  pushesFirst('Atlas brush', /\n\s+(?:async\s+)?brush\(/, /paintBrush\(/);
  pushesFirst('Atlas setRain', /\n\s+(?:async\s+)?setRain\(/, /rainMm=[^=]/);
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
/* ⚠ (#R301) #R218 TURNED THIS PAGE INTO A SHELL and #R221 split the UI table into one file per
   language, so the two things #R211 asserted — anchors written as `id="water"` in the markup, and
   the Settings label counted as «2 in i18n-late + 3 in i18n.js» — are both spellings of a structure
   that no longer exists. The requirement has not changed: the page has to exist, ship, cover every
   model, state each model's limits, and be reachable in every language the app has. Written against
   the language REGISTRY instead of a count of five, adding a tenth language cannot make it stale. */
test('R211 science page: it exists, it ships, and Settings links to it in every language', () => {
  assert.ok(existsSync(join(ROOT, 'science.html')), 'the page exists');
  const shell = read('science.html');
  assert.match(shell, /IntMapPageI18N\.mount\(\{ page: 'science'/, 'and it mounts the science page (#R218)');
  /* it must document METHOD, and it must be the one place that says what each model does NOT answer */
  const en = read('js/locales/pages.en.js');
  for (const anchor of ['water', 'seismic', 'tsunami', 'tides', 'trade', 'energy', 'crops', 'alerts']) {
    assert.match(en, new RegExp(`id:\\s*'${anchor}'`), `the page covers ${anchor}`);
  }
  assert.match(en, /steady-state routing model/, 'and states the limits of each model');
  /* it is copied by the build (it is markup, not a bundle entry) */
  assert.match(read('vite.config.js'), /'science\.html',/, 'the build copies it');
  /* the app links to it, and the label exists in every language the app ships — DERIVED from the
     locale files, so a new language is caught here the same way it is caught by check:i18n */
  assert.match(read('index.html'), /id="link-science"[^>]*href="\.\/science\.html"/, 'Settings links to it');
  const uiFiles = readdirSync(new URL('../js/locales/', import.meta.url)).filter((f) => /^ui\.[a-z-]+\.js$/.test(f));
  const pgFiles = readdirSync(new URL('../js/locales/', import.meta.url)).filter((f) => /^pages\.[a-z-]+\.js$/.test(f));
  assert.ok(uiFiles.length >= 9, `the app ships at least nine languages (got ${uiFiles.length})`);
  assert.deepEqual(uiFiles.filter((f) => !/viewScience/.test(read('js/locales/' + f))), [],
    'the Settings label exists in every language');
  assert.equal(pgFiles.length, uiFiles.length, 'and the page itself is written in every one of them');
  assert.deepEqual(pgFiles.filter((f) => !/id:\s*'water'/.test(read('js/locales/' + f))), [],
    '…including the sections, not only the chrome');
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
