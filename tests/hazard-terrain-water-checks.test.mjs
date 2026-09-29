/* ============================================================================
 *  THE TERRAIN & WATER TOOL — js/terrain-water.js and js/water-dynamics.js
 * ----------------------------------------------------------------------------
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/terrain-water.js is one DOM-bound factory closure
 *    (panel, sources, the lattice growth over the renderer); its internals are not exported, so these
 *    read the source, comments stripped.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs, { readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly as code, codeOnly } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #6, #7, #8 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{

/* ── 4 · water: the TDZ crash, the talweg, the ladder, the discharge, the honesty ────────────── */
test('R189 water: an exception is an ending, not a silence', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE TWO-MODEL ANSWER IS GONE, SO THE ASSERTIONS ABOUT ITS SECOND HALF ARE ═══
     「上流から下流まで全部同じモデル、描画にしろと言っている。」 — the third time that instruction has
     been given (#R211, #R255, #R267). The water beyond the working rectangle is now the SAME
     shallow-water field on the SAME lattice, so the walk, its resolution ladder, its per-window
     routing, its chain, its cross-sections and its escalation no longer exist to be pinned. What
     each round actually ESTABLISHED is kept and re-asserted against the model that replaced them.
     ⚠ This is the seventh consecutive round in which the previous rounds' tests made a correct
     change look like a regression ([[intmap-recurring-lessons]]): assert the property, not the text.
  */
  /* ⚠ (#R267) #R189's FIRST HALF WAS ABOUT A TDZ CRASH IN A 600 km WALK THAT NO LONGER EXISTS.
     What it established is the rule, and the rule is asserted here instead: a failure in the
     long-range answer must become something the reader can see, never a silent nothing. The DEM
     read that can fail now is the lattice growth, and it is counted and printed. */
  assert.match(src, /growBasin\(padW,padE,padN,padS\)\.catch\(\(\)=>\{ growFailed\+\+; \}\)/,
    'a growth that cannot read the elevation data is counted');
  assert.match(src, /result\.sim\.growFailed\)\?\('<br>/, '…and the panel says so');
  assert.match(src, /result\.sim&&result\.sim\.capped/, 'and so does a lattice that stopped growing');
});
test('R189 water: the course follows the ground, at one resolution, with a settable discharge', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠ (#R255) THE QUESTION CHANGED, AND THIS IS THE ASSERTION THAT SAID SO ═══════════════════
     #R189 was right that the flood's least-rise escape is not the river, and answered it with an MFD
     accumulation of UNIT contributions — drainage AREA. #R255 was told 「上流から下流まですべて同じ
     計算・描画方法にしろ。上流のものに合わせろ」 and made the downstream WINDOWS run the working
     grid's own `routeWater`. #R267 was told it a third time and removed the windows: the water
     downstream is the same field, on the same lattice, at the same cell size.
     What #R189 established survives in the strongest possible form — the course cannot follow
     anything but the ground, because there is no course, only water on ground. */
  assert.match(src, /B=\{ NX:G\.NX, NY:G\.NY, xW:G\.xW, yN:G\.yN, dx:G\.dx, dy:G\.dy, cellM:G\.cellM,/,
    'the basin starts as the working rectangle itself');
  assert.match(src, /areaM2:G\.areaM2, z:G\.z, offI:0, offJ:0 \}/, '…at its cell size and its DEM level');
  assert.ok(!/TRACE_Z_NEAR/.test(src), 'there is no resolution ladder, because there is one resolution');
  /* ⚠ (#R268) THE PROPERTY, NOT THE CALL SITE. This used to pin `demAt(bLng(i),bLat(j),B.z)` — the
     one line inside the old `bedAt()`. #R268 removed `bedAt` because the growth reads the new ground
     one DEM-TILE BLOCK at a time (the fixed 28-sample probe missed two tiles in three once a basin
     outgrew a few tens of kilometres), so the read now lives in `growBasin` and names the basin's
     own captured `z`. What #R189 is about is unchanged and is what is asserted: ONE level, the
     basin's, for every sample of new ground. */
  assert.match(src, /const dx=Bold\.dx, dy=Bold\.dy, z=Bold\.z;/, 'the growth captures the basin\'s own level');
  assert.match(src, /v=demAt\(nLng\(i\),nLat\(j\),z\)/, 'and new ground is read at that one level');
  assert.ok(!/demAt\([^)]*,\s*(?:B\.z\s*[-+]|z\s*[-+])/.test(src), 'never at a level derived from it');
  /* the discharge control (#R189 「水の水流は設定可能に」) is still here, and is now an INPUT */
  /* ⚠⚠ (#R277) THIS USED TO PIN THE VARIABLE (`let flowM3s=null;`) AND THE LINE THAT APPLIED IT.
     There were TWO states holding the same m³/s and two boxes writing them — which is the report
     this round is about (「1クリックの水量　注水量　流量の違いが判らない」) — so a check that
     names one of them makes the fix look like a regression. What #R189 asked for is asserted
     instead: the discharge is SETTABLE, and what it sets is what the model is fed, for every
     source. */
  assert.match(src, /function setRate\(v\)\{/, 'a settable discharge');
  assert.match(src, /pourRate=n; sources\.forEach\(x=>\{ x\.rate=pourRate; \}\);/,
    '…and it sets what the model is actually fed, for every source');
  assert.match(src, /const srcRate=\(x\)=>Math\.max\(1,\+\(\(x\|\|\{\}\)\.rate\)\|\|pourRate\);/,
    '…which is the rate the solver reads');
  assert.ok(/setFlow\(m3s\)\{[\s\S]{0,220}?setRate\(v\)/.test(src),
    'and Atlas reaches the same one setting');
});
test('R189 water/seismic: the panels are opaque', () => {
  for (const f of ['js/terrain-water.js', 'js/seismic.js']) {
    const src = read(f);
    assert.match(src, /background:var\(--card-bg,#1c1c1e\)/, `${f} uses the opaque card colour`);
    assert.ok(!/panel\.style\.cssText=[^\n]*var\(--popup-bg/.test(src),
      `${f} no longer builds its panel on the translucent popup colour`);
  }
});
}

/* ═══ from tests/r211-checks.test.mjs (tests #1, #2, #3, #4, #5 of 12) ═══
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
}

/* ═══ from tests/r255-checks.test.mjs (tests #7, #8, #9, #10, #11 of 13) ═══
    #R255 — source-level checks
    Each test pins the CAUSE this round measured, not the symptom, so the next
    round cannot re-introduce the same shape somewhere else and pass.

   (layer-manifest) which layers exist, and their facts */
{
/* comments carry the reasoning and quote the very strings under test — strip them first */

/* ── ⑦ terrain & water ───────────────────────────────────────────────────────────────────────── */
test('#R255 ⑦a the sculptor never flies the camera to the water', () => {
  const tw = code(read('js/terrain-water.js'));
  const m = /async function rebuildAround\(lng,lat\)\{([\s\S]*?)\n    \}/.exec(tw);
  assert.ok(m, 'rebuildAround is gone');
  assert.ok(!/easeTo|flyTo|jumpTo/.test(m[1]), 'placing water still moves the view');
  assert.match(tw, /async function build\(opt\)/, 'build() cannot be aimed without moving the camera');
});

test('#R255 ⑦b one routing, used by the working grid AND by every downstream window', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE TWO-MODEL ANSWER IS GONE, SO THE ASSERTIONS ABOUT ITS SECOND HALF ARE ═══
     「上流から下流まで全部同じモデル、描画にしろと言っている。」 — the third time that instruction has
     been given (#R211, #R255, #R267). The water beyond the working rectangle is now the SAME
     shallow-water field on the SAME lattice, so the walk, its resolution ladder, its per-window
     routing, its chain, its cross-sections and its escalation no longer exist to be pinned. What
     each round actually ESTABLISHED is kept and re-asserted against the model that replaced them.
     ⚠ This is the seventh consecutive round in which the previous rounds' tests made a correct
     change look like a regression ([[intmap-recurring-lessons]]): assert the property, not the text.
  */
  /* ⚠⚠⚠ WHAT THIS ROUND WAS ABOUT, RE-ASKED OF THE FIELD. 「直線で地形を完全無視するクソ区間が
     ある」 was reported six times. #R258 fixed the lake crossing, #R261 re-walked every coarse leg on
     the fine lattice, #R264 fixed the trigger that made the most common rung skip that re-walk, and
     #R265 found the DEM voids underneath all of it. Four real fixes, all still correct — and all
     four were about a POLYLINE, which is the object that can have a chord.

     The drawn water is a depth field. Fluxes only ever move water between face neighbours, so the
     same question — «did any water get somewhere without crossing the ground in between?» — has a
     provable answer, and `jumpCells()` is the instrument that reports it. That is what replaces
     every leg-length assertion these rounds accumulated. */
  assert.ok(!/refineCrossing/.test(src), 'there is no crossing to refine, because there is no chord');
  assert.ok(!/escalMult/.test(src), 'and no escalation ladder to be one rung short of');
  assert.match(read('js/water-dynamics.js'), /function jumpCells\(\)\{/,
    'the symptom is measured on the object that replaced the polyline');
  assert.match(src, /Object\.assign\(st,S\.jumpCells\(\),/,
    'and it is measured on every solve, not only behind a debug door');
  assert.match(src, /result\.sim&&result\.sim\.jumps/, '…and a non-zero reading is printed in the panel');
});

test('#R255 ⑦c deselecting 「ここに水」 does not stop or reset the clock', () => {
  const tw = code(read('js/terrain-water.js'));
  const m = /function setMode\(m\)\{([\s\S]*?)syncMode\(\);/.exec(tw);
  assert.ok(m, 'setMode is gone');
  assert.ok(!/pourStop\(\)/.test(m[1]), 'switching tools still stops the pour');
  /* ⚠ (#R265) The guard grew a condition — a ONE-SHOT volume also starts the clock now, and it must
     not reset a run that is already going. The property is the same one #R255 pinned: a source added
     to a simulation in progress joins it at the time it is at. */
  assert.match(tw, /if\(pourMode==='cont'&&!pourT\) pourSimS=0;/,
    'only a fresh continuous pour starts from zero — a second inlet joins the clock where it is');
});

test('#R255 ⑦d the panel has a scrolling body and a sticky footer, as SIBLINGS', () => {
  const tw = code(read('js/terrain-water.js'));
  assert.match(tw, /class="tw-body"[^>]*overflow-y:auto/, 'the panel body does not scroll');
  assert.match(tw, /class="tw-foot"[^>]*position:sticky/, 'the shared controls are not pinned');
  /* ⚠ (#R245) the footer must not be nested INSIDE the scroller — one stray </div> is the whole bug */
  const body = tw.indexOf(`class="tw-body"`), foot = tw.indexOf(`class="tw-foot"`);
  assert.ok(body > 0 && foot > body, 'the footer is not after the body');
  const between = tw.slice(body, foot);
  const opens = (between.match(/<div|<label|<details/g) || []).length;
  const closes = (between.match(/<\/div>|<\/label>|<\/details>/g) || []).length;
  assert.equal(opens, closes, 'the body block is not balanced — the sticky footer would be re-parented inside the scroller');
  /* the clock the reader asked to keep in view is written into .tw-stat, which lives in the footer */
  assert.ok(tw.indexOf('class="tw-stat"') > foot, 'the status line (which carries the elapsed clock) left the pinned footer');
});

test('#R255 ⑦e sculpting reaches the real elevation and the 3-D terrain', () => {
  const tw = code(read('js/terrain-water.js'));
  assert.match(tw, /window\.IntMapElevEdit=/, 'the elevation hook is not published');
  assert.match(tw, /function editDeltaAt\(lng,lat\)/, 'there is no geographic read of the sculpted delta');
  assert.match(tw, /addProtocol\(DEM_PROTO/, 'the sculpted DEM tiles are gone');
  /* ⚠ (#R258) the local was `id`; the source is created ONCE now and kept in `_demSrcId`, because a
     new source per edit re-attached the terrain and that is what reset the 3-D view on every brush
     stroke. What this test is about — the terrain really is pointed at the sculpted DEM — is
     unchanged; tests/r256 ④ pins the once-only part. */
  assert.match(tw, /GE\(\)\.scene\.setTerrain\(\{source:_demSrcId/, 'the 3-D terrain is never pointed at the sculpted DEM');
  /* every mutation marks it — hanging this off the UI handlers left Atlas's brush() out (measured) */
  assert.match(tw, /function editDirty\(\)\{ editStamp\+\+; terrainSoon\(\); \}/, 'the re-mesh is not driven from the one place the ground changes');
  /* and the readout family consults it through the single function they all call */
  const mr = code(read('js/map-readout.js'));
  assert.match(mr, /function _edited\(lng,lat,v\)/, 'js/map-readout.js does not consult the sculpted delta');
  assert.equal((mr.match(/_edited\(/g) || []).length, 3, 'one of demElevAt / demElevBilinear does not go through the hook');
});
}

/* ═══ from tests/r258-checks.test.mjs (tests #6, #7, #8, #9, #10 of 16) ═══
    #R258 — source-level checks
    Each test below pins ONE defect this round measured, in the form the
    measurement took. They are source assertions (no browser), which is what the
    `tests/r*-checks` family is for: the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ④ the 3-D relief is not rebuilt on every brush stroke ──────────────────────────────────────
   MEASURED: five strokes → `setTerrain` called ONCE, one source (`tw-dem-1`), tiles re-versioned to
   `?v=6`, zoom and pitch drift 0. Before this the module built `tw-dem-1`, `-2`, `-3`… and
   re-attached the terrain each time, which is the reset. */
test('R258 ④: the sculpted terrain source is created once and re-tiled in place', () => {
  const s = read('js/terrain-water.js');
  assert.match(s, /function demTiles\(\)\{ return \[DEM_PROTO\+':\/\/\{z\}\/\{x\}\/\{y\}\?v='\+editStamp\]; \}/,
    'the edit stamp is in the tile template, so a change is a new URL');
  assert.match(s, /GE\(\)\.layers\.setSourceTiles\(_demSrcId,demTiles\(\)\)/,
    'an edit re-tiles the SAME source');
  assert.doesNotMatch(s, /const id='tw-dem-'\+\(\+\+_demSrcN\);[\s\S]{0,400}?GE\(\)\.scene\.setTerrain\(\{source:id/,
    'a new source per edit must not come back');
});

/* ── ⑤ the water went through the dam ───────────────────────────────────────────────────────────
   Two independent faults: a parabolic cross-section that reached the typed crest only on the
   centreline, and a half-width floored at ONE cell, which an 8-connected flood walks round the
   corner of. MEASURED after the fix at 135.7 m cells: 8.00 m along the whole centreline and a
   flat-topped section 0/0/1.32/6.71/8/6.27/1.14/0/0. */
test('R258 ⑤: a levee has a flat crest and is wide enough for an 8-connected flood', () => {
  const s = read('js/terrain-water.js');
  assert.doesNotMatch(s, /const add=crest\*\(1-d\*d\);/, 'the parabola that never reached the crest is gone');
  assert.match(s, /const add=crest\*Math\.min\(1,Math\.max\(0,\(1-d\)\/\(1-FLAT\)\)\);/,
    'flat to FLAT of the half-width, then a shoulder');
  assert.match(s, /const MIN_HW=1\.5;/, 'the half-width floor is 1.5 cells, not 1');
  assert.match(s, /Math\.ceil\(Math\.hypot\(x1-x0,y1-y0\)\*3\)/,
    'the centreline is sampled finer than one cell, so a diagonal segment leaves no gap either');
});
test('R258 ⑤b: every door that changes the ground marks it dirty', () => {
  const s = read('js/terrain-water.js');
  /* MEASURED: `addLevee` then sampling IntMapElevEdit along the levee returned 0.00 m at every
     point — editField() is memoised on editStamp and only editDirty() bumps it. */
  assert.match(s, /addLevee\(pts,crest,width\)\{[\s\S]{0,300}?editDirty\(\); solve\(\);/,
    'the Atlas/API door bumps the stamp');
  assert.match(s, /editDirty\(\);\s+\/\* \(#R258\) a restored levee is a change to the ground/,
    'and so does a levee restored from a share link');
});

/* ── ⑥ the straight section that ignored the terrain ────────────────────────────────────────── */
test('R258 ⑥: crossing a lake draws the crossing, not a chord', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE TWO-MODEL ANSWER IS GONE, SO THE ASSERTIONS ABOUT ITS SECOND HALF ARE ═══
     「上流から下流まで全部同じモデル、描画にしろと言っている。」 — the third time that instruction has
     been given (#R211, #R255, #R267). The water beyond the working rectangle is now the SAME
     shallow-water field on the SAME lattice, so the walk, its resolution ladder, its per-window
     routing, its chain, its cross-sections and its escalation no longer exist to be pinned. What
     each round actually ESTABLISHED is kept and re-asserted against the model that replaced them.
     ⚠ This is the seventh consecutive round in which the previous rounds' tests made a correct
     change look like a regression ([[intmap-recurring-lessons]]): assert the property, not the text.
  */
  /* ⚠⚠⚠ WHAT THIS ROUND WAS ABOUT, RE-ASKED OF THE FIELD. 「直線で地形を完全無視するクソ区間が
     ある」 was reported six times. #R258 fixed the lake crossing, #R261 re-walked every coarse leg on
     the fine lattice, #R264 fixed the trigger that made the most common rung skip that re-walk, and
     #R265 found the DEM voids underneath all of it. Four real fixes, all still correct — and all
     four were about a POLYLINE, which is the object that can have a chord.

     The drawn water is a depth field. Fluxes only ever move water between face neighbours, so the
     same question — «did any water get somewhere without crossing the ground in between?» — has a
     provable answer, and `jumpCells()` is the instrument that reports it. That is what replaces
     every leg-length assertion these rounds accumulated. */
  assert.ok(!/refineCrossing/.test(src), 'there is no crossing to refine, because there is no chord');
  assert.ok(!/escalMult/.test(src), 'and no escalation ladder to be one rung short of');
  assert.match(read('js/water-dynamics.js'), /function jumpCells\(\)\{/,
    'the symptom is measured on the object that replaced the polyline');
  assert.match(src, /Object\.assign\(st,S\.jumpCells\(\),/,
    'and it is measured on every solve, not only behind a debug door');
  assert.match(src, /result\.sim&&result\.sim\.jumps/, '…and a non-zero reading is printed in the panel');
});

/* ── ⑦ the panel, and the clock in its footer ──────────────────────────────────────────────── */
test('R258 ⑦: the terrain panel is a grouped inset list with a pinned clock', () => {
  const s = read('js/terrain-water.js');
  assert.match(s, /if\(document\.getElementById\('tw-ios-css'\)\) return;/, 'the sheet is injected by the module');
  assert.match(s, /'\.tw-card\{/, 'cards');
  /* ⚠ (#R270) 40 → 44, AND THE ASSERTION IS THE PROPERTY RATHER THAN THE NUMBER. #R258 wrote 「a 40 px
     row」 and then let the contents decide: measured in 盛る mode the rows came out 40 / 44 / 45 / 49,
     because `min-height` plus padding takes whatever control is inside. What this test is actually
     about — «the panel is a grouped inset list with ONE row rhythm» — is now checked as that. */
  /* ⚠⚠ (#R275) THE ROW HEIGHT IS ONE DECLARATION NOW, AND IT IS NOT ONE NUMBER. 「他の凡例やポップ
     アップに比べて内部要素のサイズが大きすぎる」 — measured against the warnings legend, this panel ran
     12 px text on 44 px rows where every legend runs 10.5 px on 13–16. A desktop legend column and a
     thumb are different rule books, so `TW_ROW` is `_mob() ? '44px' : '30px'` and the rows read it.
     What this test is about — ONE rhythm, and a real hit target on a phone — is asserted as that. */
  /* ⚠ the rule is a run of CONCATENATED literals, so it is a WINDOW of source rather than one
     quoted string — `[^']*` stops at the quote before the first `+TOKEN+`. */
  const rowRule = /'\.tw-row\{[\s\S]{0,320}/.exec(s);
  assert.ok(rowRule, 'the row must be styled here');
  assert.match(rowRule[0], /min-height:'\+TW_ROW\+'/, 'the row height is the panel’s one declaration');
  const decl = /const TW_ROW=_mob\(\)\?'(\d+)px':'(\d+)px';/.exec(s);
  assert.ok(decl, 'TW_ROW must be declared for both device classes');
  assert.ok(+decl[1] >= 44, `a phone row is a touch target (${decl[1]} px)`);
  assert.ok(+decl[2] >= 28, `a desktop row is still a row (${decl[2]} px)`);
  assert.match(s, /'\.tw-val \.tw-segwrap\{/, 'a control inside a row must be sized to fit that row');
  assert.match(s, /class="tw-play tw-pp"/, 'the transport is in the footer…');
  assert.match(s, /panel\.querySelector\('\.tw-pp'\)\.onclick=/, '…and wired from render(), not from a tool');
  assert.match(s, /function syncFoot\(\)/, 'the clock repaints without rebuilding the panel');
  /* ⚠ (#R237) one `class` attribute per tag — the second is silently discarded */
  const dup = s.match(/<[a-z]+[^>]*\bclass="[^"]*"[^>]*\bclass="/g);
  assert.equal(dup, null, 'no tag carries two class attributes');
  /* #R255's rule: the footer is a SIBLING of the body */
  const body = s.indexOf('<div class="tw-body"');
  const foot = s.indexOf('<div class="tw-foot"');
  assert.ok(body > 0 && foot > body, 'the footer markup follows the body’s close, not its content');
});
}

/* ═══ from tests/r261-checks.test.mjs (tests #3, #4, #5, #6 of 13) ═══
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

/* ── ③ the water source knows whether it is a bucket or a tap ───────────────────────────────────
   「一回だけと継続の水の水源の区別をつけろ。」 `pourMode` was a panel setting and the interval fed
   `sources[sources.length-1]` only, so a second source silently stopped the first. */
test('R261 ③: continuous/one-shot is a property of each source, and every tap is fed', () => {
  const s = read('js/terrain-water.js');
  assert.doesNotMatch(s, /sources\[sources\.length-1\]\.m3\+=/,
    'the pour must not feed only the last-placed source');
  /* ⚠ (#R265) …and it fills by what the model ACTUALLY integrated, not by what the tick asked for.
     Paying the taps for time the water did not get is how the clock and the water come apart.
     ⚠⚠ (#R267 追記) AND IT IS PAID PER STEP NOW, because a discharge is a rate. Crediting a whole
     interval at once put the interval's water into ONE cell as a column — MEASURED IN PRODUCTION,
     60,000 m³/s advanced by half an hour reported 「max depth 21,290.1 m」, which is 1.08e8 m³ over
     a 71 m cell to the metre (21,424 m → 11.9 m after the fix, same 1.08e8 m³ delivered).
     What #R261 established is unchanged and is what is asserted: EVERY tap fills, at ITS OWN rate. */
  /* ⚠⚠⚠ (#R275) EVERY SOURCE, NOT EVERY CONTINUOUS SOURCE. 「一回きりと継続の差は、水が継続的に発生
     し続けるか否かしかないようにするべき」 — the one-shot half used to be delivered by `pool()` as a
     lake that already existed at t=0, which is why ↺ could not restart it (nothing was moving, so
     `canPour()` said no). One mechanism now: `feedTaps` feeds ALL of them at their own rate, and
     `owed()` — the remaining capacity — is the only thing the two kinds disagree about.
     What #R261 established is unchanged and is what is asserted: EVERY tap fills, at ITS OWN rate. */
  assert.match(s, /function feedTaps\(dt\)\{[\s\S]{0,400}sources\.forEach\(sc=>\{\n\s*const left=owed\(sc\);/,
    'every source is fed, not only the last one and not only the continuous ones');
  assert.match(s, /const give=Math\.min\(left,srcRate\(sc\)\*dt\);/,
    '…at its own rate, for the length of the step the solver is about to take, and never past what it owes');
  assert.match(s, /const srcCap=\(x\)=>\(x&&x\.cont\?Infinity:/,
    'the kind is a bound on the total, and nothing else');
  assert.match(s, /,feedTaps\);/, 'and the solver is what calls back for it');
  assert.match(s, /const contSources=\(\)=>sources\.filter\(x=>x\.cont\);/);
  assert.match(s, /sources\.push\(\{lng,lat,m3:0,cont,cap:cont\?Infinity:srcM3,/,
    'a placed source records the kind it was placed as');
  /* …and the map shows the difference */
  assert.match(s, /id:'tw-src-ring'[\s\S]{0,200}\['==',\['get','cont'\],1\]/,
    'a running tap is drawn with a ring the one-shot volume does not have');
  /* ▶ must not rewrite the tool's mode */
  assert.doesNotMatch(s, /if\(pourT\) pourStop\(\); else \{ pourMode='cont'; pourStart\(\); \}/,
    'pressing play must not switch 1回きり to 継続 behind the reader');
});

/* ── ④ a working-rectangle rebuild carries the sculpted ground ──────────────────────────────────
   「水源を追加しても地形はリセットするな。」 A water source outside the rectangle calls rebuildAround
   → build(), which did `sculpt = new Float32Array(...)`. MEASURED after the fix: a rebuild shifted
   a third of a rectangle east reported 132 carried cells where it used to report none. */
test('R261 ④: build() resamples the sculpt field and the undo stack instead of zeroing them', () => {
  const s = read('js/terrain-water.js');
  assert.doesNotMatch(s, /sculpt=new Float32Array\(NX\*NY\); undoStack=\[\]; editDirty\(\);/,
    'the rebuild must not wipe the brush strokes and the undo history');
  assert.match(s, /sculpt=regridField\(_oldSculpt,_oldG,G\);/);
  assert.match(s, /undoStack=_oldUndo\.map\(u=>Object\.assign\(\{\},u,\{ sculpt:regridField\(u\.sculpt,_oldG,G\) \}\)\);/,
    'a snapshot holds a sculpt sized for the OLD grid, so it is resampled too');
  assert.match(s, /function regridField\(src,oldG,newG\)\{/);
  assert.match(s, /G\.carriedEdits=/, 'how much came across is reported, not silent');
  /* the two explicit resets still reset.
     ⚠ (#R268) …THROUGH ONE FUNCTION NOW. The Atlas door used to inline the clear; the panel button
     inlined it too and forgot `editDirty()`, so pressing 「地形をリセット」 changed nothing anybody
     could see (the memoised `editField()` never went stale). Both doors call `resetTerrainNow()`,
     which is where the clear and the invalidation now live together — so this asserts the
     DELEGATION plus what the delegate does, rather than a copy of the body. */
  assert.match(s, /resetTerrain\(\)\{\s*return resetTerrainNow\(\);/, 'the Atlas door delegates');
  const rt = s.slice(s.indexOf('function resetTerrainNow'), s.indexOf('function resetTerrainNow') + 400);
  assert.match(rt, /sculpt=new Float32Array\(G\.NX\*G\.NY\)/, '…and the one reset clears the sculpt');
  assert.match(rt, /levees=\[\]/, '…and the levees');
  assert.match(rt, /editDirty\(\)/, '…and tells every reader the ground changed');
});

/* ── ⑤ the play button is a rounded square ─────────────────────────────────────────────────────
   「再生ボタンは四角にしろ。」 38 px box at `border-radius:19px` is a circle. */
test('R261 ⑤: the terrain/water transport is not a disc', () => {
  const s = read('js/terrain-water.js');
  /* ⚠ (#R275) a WINDOW, not one quoted string: the rule is concatenated around `+TW_CTL+` now */
  const m = s.match(/'\.tw-play\{[\s\S]{0,320}/);
  assert.ok(m, 'the .tw-play rule is there');
  assert.doesNotMatch(m[0], /border-radius:19px/, 'a 19 px radius on a 38 px box IS a circle');
  /* ⚠ (#R273) THE PROPERTY IS «ROUNDED SQUARE», NOT «38 px». That round's footer measured 38 / 35 /
     34 on three consecutive rows and the transport is 36 now, level with the speed strip and the
     buttons. Pinning the size made a fix to the ROW look like a regression of the SHAPE. */
  /* ⚠ (#R275) …AND THE BOX IS A TOKEN NOW, not a literal: the panel's control height is one
     declaration (`TW_CTL`) so the transport, the buttons and the speed strip cannot drift apart
     again. Square is asserted by the two sides being the SAME token, which is stronger. */
  assert.match(m[0], /width:'\+TW_CTL\+';height:'\+TW_CTL\+'/, 'the transport is square, from one token');
  const ctl = /const TW_CTL=_mob\(\)\?'(\d+)px':'(\d+)px';/.exec(s);
  assert.ok(ctl, 'TW_CTL must be declared for both device classes');
  const rad = +(/border-radius:(\d+)px/.exec(m[0]) || [])[1];
  assert.ok(rad > 0 && rad < +ctl[2] / 2, `radius ${rad} on a ${ctl[2]} px box must be a rounded square, not a disc`);
});

/* ── ⑥ a coarse rung's crossing is re-walked at the trace's own resolution ──────────────────────
   「たまに、直線で地形を完全無視するクソ区間がある。」 MEASURED with the leg instrument on five real
   traces: the longest single leg was 3,563 m (Lake Biwa) and 3,107 m (Pannonian) — 1.4 cells at the
   27× rung that produced them, and 150–160 cells of the sampling the course is DRAWN at. */
test('R261 ⑥: both escalation branches refine their crossing, and a decline is counted', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE TWO-MODEL ANSWER IS GONE, SO THE ASSERTIONS ABOUT ITS SECOND HALF ARE ═══
     「上流から下流まで全部同じモデル、描画にしろと言っている。」 — the third time that instruction has
     been given (#R211, #R255, #R267). The water beyond the working rectangle is now the SAME
     shallow-water field on the SAME lattice, so the walk, its resolution ladder, its per-window
     routing, its chain, its cross-sections and its escalation no longer exist to be pinned. What
     each round actually ESTABLISHED is kept and re-asserted against the model that replaced them.
     ⚠ This is the seventh consecutive round in which the previous rounds' tests made a correct
     change look like a regression ([[intmap-recurring-lessons]]): assert the property, not the text.
  */
  /* ⚠⚠⚠ WHAT THIS ROUND WAS ABOUT, RE-ASKED OF THE FIELD. 「直線で地形を完全無視するクソ区間が
     ある」 was reported six times. #R258 fixed the lake crossing, #R261 re-walked every coarse leg on
     the fine lattice, #R264 fixed the trigger that made the most common rung skip that re-walk, and
     #R265 found the DEM voids underneath all of it. Four real fixes, all still correct — and all
     four were about a POLYLINE, which is the object that can have a chord.

     The drawn water is a depth field. Fluxes only ever move water between face neighbours, so the
     same question — «did any water get somewhere without crossing the ground in between?» — has a
     provable answer, and `jumpCells()` is the instrument that reports it. That is what replaces
     every leg-length assertion these rounds accumulated. */
  assert.ok(!/refineCrossing/.test(src), 'there is no crossing to refine, because there is no chord');
  assert.ok(!/escalMult/.test(src), 'and no escalation ladder to be one rung short of');
  assert.match(read('js/water-dynamics.js'), /function jumpCells\(\)\{/,
    'the symptom is measured on the object that replaced the polyline');
  assert.match(src, /Object\.assign\(st,S\.jumpCells\(\),/,
    'and it is measured on every solve, not only behind a debug door');
  assert.match(src, /result\.sim&&result\.sim\.jumps/, '…and a non-zero reading is printed in the panel');
});
}

/* ═══ from tests/r264-checks.test.mjs (tests #1, #2 of 7) ═══
    #R264 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ① the refinement trigger is BELOW the ladder's first multiplier ────────────────────────────
   「地形編集・水流でたまに、直線で地形を完全無視するクソ区間がある。」 (4th report.) One coarse cell of
   the ×3 rung is exactly 3 fine cells, and the trigger was `L > 3 × spacing` — strictly greater than
   a length that equals it, so EVERY leg of the rung that fires most often was drawn unrefined.
   MEASURED before: Biwa 280 m and Death Valley 277 m legs at a 92–93 m fine rung (1.0 cells of their
   own rung, 12 of the trace's finest). The assertion is the RELATION, not the number: whatever the
   two constants become, the trigger has to sit under the smallest rung the escalation can take. */
test('R264 ①: the crossing refinement triggers below the escalation ladder’s first rung', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE TWO-MODEL ANSWER IS GONE, SO THE ASSERTIONS ABOUT ITS SECOND HALF ARE ═══
     「上流から下流まで全部同じモデル、描画にしろと言っている。」 — the third time that instruction has
     been given (#R211, #R255, #R267). The water beyond the working rectangle is now the SAME
     shallow-water field on the SAME lattice, so the walk, its resolution ladder, its per-window
     routing, its chain, its cross-sections and its escalation no longer exist to be pinned. What
     each round actually ESTABLISHED is kept and re-asserted against the model that replaced them.
     ⚠ This is the seventh consecutive round in which the previous rounds' tests made a correct
     change look like a regression ([[intmap-recurring-lessons]]): assert the property, not the text.
  */
  /* ⚠⚠⚠ WHAT THIS ROUND WAS ABOUT, RE-ASKED OF THE FIELD. 「直線で地形を完全無視するクソ区間が
     ある」 was reported six times. #R258 fixed the lake crossing, #R261 re-walked every coarse leg on
     the fine lattice, #R264 fixed the trigger that made the most common rung skip that re-walk, and
     #R265 found the DEM voids underneath all of it. Four real fixes, all still correct — and all
     four were about a POLYLINE, which is the object that can have a chord.

     The drawn water is a depth field. Fluxes only ever move water between face neighbours, so the
     same question — «did any water get somewhere without crossing the ground in between?» — has a
     provable answer, and `jumpCells()` is the instrument that reports it. That is what replaces
     every leg-length assertion these rounds accumulated. */
  assert.ok(!/refineCrossing/.test(src), 'there is no crossing to refine, because there is no chord');
  assert.ok(!/escalMult/.test(src), 'and no escalation ladder to be one rung short of');
  assert.match(read('js/water-dynamics.js'), /function jumpCells\(\)\{/,
    'the symptom is measured on the object that replaced the polyline');
  assert.match(src, /Object\.assign\(st,S\.jumpCells\(\),/,
    'and it is measured on every solve, not only behind a debug door');
  assert.match(src, /result\.sim&&result\.sim\.jumps/, '…and a non-zero reading is printed in the panel');
});

/* ── ② the counter cannot be defined by the code it is watching ─────────────────────────────────
   `coarseLegs` counted legs above the same constant the refiner declined on, so it read 0 on all
   four measured traces BY CONSTRUCTION. It is counted against the trace's own finest sampling now —
   what the eye compares (#R250) — which is a different question from «did the refiner take it». */
test('R264 ②: coarseLegs is counted against the trace’s finest sampling', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE TWO-MODEL ANSWER IS GONE, SO THE ASSERTIONS ABOUT ITS SECOND HALF ARE ═══
     「上流から下流まで全部同じモデル、描画にしろと言っている。」 — the third time that instruction has
     been given (#R211, #R255, #R267). The water beyond the working rectangle is now the SAME
     shallow-water field on the SAME lattice, so the walk, its resolution ladder, its per-window
     routing, its chain, its cross-sections and its escalation no longer exist to be pinned. What
     each round actually ESTABLISHED is kept and re-asserted against the model that replaced them.
     ⚠ This is the seventh consecutive round in which the previous rounds' tests made a correct
     change look like a regression ([[intmap-recurring-lessons]]): assert the property, not the text.
  */
  /* ⚠⚠⚠ WHAT THIS ROUND WAS ABOUT, RE-ASKED OF THE FIELD. 「直線で地形を完全無視するクソ区間が
     ある」 was reported six times. #R258 fixed the lake crossing, #R261 re-walked every coarse leg on
     the fine lattice, #R264 fixed the trigger that made the most common rung skip that re-walk, and
     #R265 found the DEM voids underneath all of it. Four real fixes, all still correct — and all
     four were about a POLYLINE, which is the object that can have a chord.

     The drawn water is a depth field. Fluxes only ever move water between face neighbours, so the
     same question — «did any water get somewhere without crossing the ground in between?» — has a
     provable answer, and `jumpCells()` is the instrument that reports it. That is what replaces
     every leg-length assertion these rounds accumulated. */
  assert.ok(!/refineCrossing/.test(src), 'there is no crossing to refine, because there is no chord');
  assert.ok(!/escalMult/.test(src), 'and no escalation ladder to be one rung short of');
  assert.match(read('js/water-dynamics.js'), /function jumpCells\(\)\{/,
    'the symptom is measured on the object that replaced the polyline');
  assert.match(src, /Object\.assign\(st,S\.jumpCells\(\),/,
    'and it is measured on every solve, not only behind a debug door');
  assert.match(src, /result\.sim&&result\.sim\.jumps/, '…and a non-zero reading is printed in the panel');
});
}

/* ═══ from tests/r273-checks.test.mjs (tests #12, #13, #14 of 16) ═══
    #R273 — source-level checks
    What this round was asked for, and what each test holds:

      ① 「GDACSを完全に撤廃しろ」「ソースは一国一ソース」「対応国も増やせ」
      ② 「日本では気象庁の塗分けに対応させろ。また、市町村単位で塗り分けろ」
      ③ 「まだ対応していない国は灰色斜線で、発令されていないだけの地域は灰色に」
      ④ 「各国の警報階級を同じ紫・赤・黄に押し込んでいる」→ 各国公式配色 / IntMap換算の切替
      ⑤ 「何の警報なのか地図から分からない」→ 種別を区域に文字で、重複は +N
      ⑥ 「更新時間31.1hと2minが同列」→ Fresh / Delayed / Stale / Error
      ⑦ 「一覧が取得先一覧になっている」→ パネルは「どこで何が」から始まる
      ⑧ 「これ長すぎ」→ 出典の一文
      ⑨ 「なにか形がおかしい×をやめろ」→ アプリ全体で1つの ×
      ⑩ 「セルビア語系言語は似た色味に」
      ⑪ 「水流シミュレーションの解像度が低すぎる」「一回きりの水源、再生できない」
      ⑫ 「大規模にレイヤーカテゴリ分類を再編しろ」→ 見出しの名前が中身と一致する

    ⚠ EVERY «X is gone» ASSERTION IS WRITTEN IN THE SYNTAX X WAS WRITTEN IN, and against the source
    with its comments stripped — the prose that RECORDS a removal is not evidence against it. That
    is #R266's own lesson, and it has cost this repo a round twice. */
{

/* ── ⑪ the water model: a resolution dial and a run you can repeat ─────────────────────────── */
test('R273 ⑪ the flow model has a resolution the reader chooses, and it is kept', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /const RES_D=\[384,512,768,1024\], RES_M=\[150,192,256,384\]/, 'the steps must be named');
  assert.match(s, /localStorage\.getItem\('im\.twRes'\)/, 'and the choice kept');
  assert.match(s, /const NX=resNX\(\);/, 'the grid must be built at the chosen step');
  /* the default went UP — 「解像度が低すぎる」
     ⚠ (#R668) …and which of the two defaults a device gets is a question about the DEVICE, not about
     the window's width: `_mob()` is the 768 px media query, which handed a phone in landscape the
     512² grid. The numbers are unchanged, so both branches are still pinned here. */
  assert.match(s, /return (?:_phoneDev\(\)|window\.IntMapMemBudget\.deviceIsPhone\([^()]*\))\?192:512;/,
    'the desktop default must be 512, not 384 (phone 192), and the device must be what picks');
  /* changing it must not move the working rectangle to wherever the camera happens to be */
  assert.match(s, /if\(opt&&opt\.keep&&G&&G\.bbox\)\{/, 'a resolution rebuild keeps the same rectangle');
  assert.match(s, /build\(\{keep:true\}\)/, '…and the control must use it');
  assert.match(s, /function syncRes\(\)/, 'and the cell it produces must be printed');
});

test('R273 ⑪ a run can be repeated without throwing the terrain or the sources away', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  const m = /function replay\(\)\{([\s\S]*?)\n    function resetSim/.exec(s);
  assert.ok(m, 'replay() must exist');
  assert.match(m[1], /pourSimS=0;/, 'the clock goes back to zero');
  /* ⚠⚠ (#R275) BOTH KINDS, ONE LINE. 「一回きりの水源、再生できない。ふざけるな。」 came back: the
     button was right and there was nothing for it to restart, because a one-shot volume was a still
     lake rather than a run. `m3` is what a source has DELIVERED — for both kinds now — so putting it
     back to zero IS the replay, and there is no second field to reset. */
  assert.match(m[1], /sources\.forEach\(x=>\{ x\.m3=0; \}\);/,
    'every source’s delivery goes back to zero — a source’s m3 is what it has DELIVERED');
  assert.ok(!/x\.cont/.test(m[1]), 'and the two kinds are replayed the same way');
  assert.match(m[1], /resetSim\(\);/, 'and the water with it');
  /* ⚠ the one door every mutation in that file has to pass — four rounds have found something
     that skipped it (#R255 brush, #R258 addLevee, #R268 reset, #R271 addSource) */
  assert.match(m[1], /editDirty\(\);/, 'replay must go through editDirty()');
  assert.ok(!/sculpt=new Float32Array/.test(m[1]), 'it must NOT throw the sculpted ground away');
  assert.ok(!/sources=\[\]/.test(m[1]), '…nor the sources');
  assert.match(s, /class="tw-play tw-replay"/, 'and there must be a control for it');
});

test('R273 ⑪ the panel has one control height and one gap', () => {
  const s = read('js/terrain-water.js');
  const rule = (sel) => { const i = s.indexOf("'" + sel + '{'); assert.ok(i > 0, sel + ' must be styled here');
    return s.slice(i, s.indexOf('}', i)).split("'+'").join(''); };
  const play = rule('.tw-play'), btn = rule('.tw-btn');
  const h = (r) => +(/(?:min-)?height:(\d+)px/.exec(r) || [])[1];
  assert.equal(h(play), h(btn), `the transport and the buttons must be the same height (${h(play)} vs ${h(btn)})`);
  assert.match(s, /#tw-panel \.tw-foot \.tw-segwrap\{height:'\+TW_CTL\+'/, '…and so must the speed strip');
  /* ⚠ (#R275) 36 was the number; ONE HEIGHT is the property. It is a declaration now because the
     panel was rescaled to the size every other legend uses (「内部要素のサイズが大きすぎる」), and the
     three controls have to move together or the footer goes back to having three heights. */
  assert.match(s, /const TW_CTL=_mob\(\)\?'(\d+)px':'(\d+)px';/, 'and that height is one declaration');
  /* two containers were touching: the tool picker ended exactly where the card below it began */
  assert.match(s, /#tw-panel \.tw-body > div > \* \+ \*\{margin-top:'\+TW_GAP\+';\}/, 'siblings in a section are spaced');
  /* (#R275) the pinned tool block is a second place a caption can be, so the rule names both */
  assert.match(s, /#tw-panel \.tw-body > div > \.tw-cap \+ \*[^{]*\{margin-top:0;\}/,
    '…except under a caption, which already carries its own gap');
});
}

/* ═══ from tests/r275-checks.test.mjs (tests #1, #2, #3, #4, #5 of 12) ═══
    IntMap · #R275 source checks
    「地形編集・水流で地形のポップアップのUI、他の凡例やポップアップに比べて内部要素のサイズが大きすぎる。
      また、ツールは上部にスティックしろ。」
    「地形編集・水流を開くと勝手にズームするのを辞めろ。」
    「気象警報はまだ対応していない国は、灰色斜線で、発令されていないだけの地域は灰色に。」
    「今発表されている警報欄は、一国一行までにしろ。」
    「水流シミュレーションの解像度が低すぎる。また、一回きりの水源、再生できない。ふざけるな。
      一回きりと継続の差は、水が継続的に発生し続けるか否かしかないようにするべき。ふざけるな。」
    「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。…対応国も増やせ。更新が遅すぎる。
      リアルタイムにと言っている。ソースは一国一ソース。…GDACSを完全に撤廃しろ。また、押した地点の
      警報情報が別ポップアップで出るようにしろ。」

    ⚠ EVERY ASSERTION HERE IS ABOUT A PROPERTY, NOT ABOUT A NUMBER OR A CALL SITE. Twelve consecutive
    rounds have had a previous round's test pin a literal and turn a correct change into a false
    regression — this round fixed nine of them. So: the panel's scale is checked as «one declaration
    used everywhere», not as «30 px»; the source model as «one delivery mechanism», not as one line.

   (#R308 追記2) 5本が同じ1行を逐語で固定していたので、規則ごとに1つの読み手へ — tests/wash-tier.mjs */
{
/* comments are prose about the code and must never satisfy an assertion ABOUT the code — the
   「自分の検査が自分のコメントに当たる」 shape this project has paid for thirteen times (#R274). */
const TW = () => codeOnly(read('js/terrain-water.js'));

/* ── ① opening a tool is not a request to move the map ──────────────────────────────────────────
   MEASURED before the fix: js/map-ui.js's tool row calls `open(_hereLL())` — the camera's own
   centre — and open() flew to it at `zoom: max(current, 11)`. From z6 that landed the reader at
   z11, a fivefold zoom onto the point they were already looking at. */
test('R275 ① the terrain tool does not zoom the camera onto a point that is already in view', () => {
  const s = TW();
  assert.ok(!/zoom:Math\.max\(GE\(\)\.camera\.getZoom\(\),\s*\d+\)/.test(s),
    'nothing may impose a minimum zoom when the tool opens');
  assert.match(s, /const b=GE\(\)\.camera\.getBounds\(\);\s*\n\s*seen=/,
    'whether the point is on screen is MEASURED against the current view');
  assert.match(s, /if\(!seen\)\{ try\{ GE\(\)\.camera\.flyTo\(\{center:ctr,duration:600\}\);/,
    'the camera moves only for a point the reader cannot see, and its zoom is left alone');
  assert.match(s, /build\(ctr\?\{center:ctr\}:undefined\)/,
    'the working rectangle is aimed at the point instead of the camera being flown to it');
});

/* ── ② the elevation level follows the working rectangle, not the camera ────────────────────────
   MEASURED at camera z6 over the Kōfu basin: rectangle 47.2 km, grid cell 92 m, DEM level z10 —
   a 124 m sample under an 89 m grid. From the rectangle the same call gives z13 = 15.5 m. */
test('R275 ② the DEM level is chosen for the rectangle the solver runs on', () => {
  const s = TW();
  assert.match(s, /const viewKm=Math\.max\(/, 'the camera span has its own name…');
  assert.match(s, /if\(viewKm>MAXKM\)\{/, '…and is what the cap is applied to');
  assert.match(s, /const spanKm=Math\.min\(viewKm,MAXKM\);/,
    'and the span everything downstream sizes itself by is the CAPPED one');
  const i = s.indexOf('const spanKm=Math.min(viewKm,MAXKM);');
  assert.ok(i > 0);
  const after = s.slice(i);
  assert.match(after, /_demZoomForSpan\(Math\.max\(1,spanKm\)\)/, 'the DEM level reads it');
  assert.match(after, /nn=spanKm\/tk\+1/, '…and so does the tile budget');
  /* the two must be the same quantity, or one of them is sizing itself to a different rectangle */
  assert.ok(!/_demZoomForSpan\(Math\.max\(1,viewKm\)\)/.test(s), 'neither may use the camera span');
});

/* ── ③ one source, one difference ───────────────────────────────────────────────────────────────
   「一回きりと継続の差は、水が継続的に発生し続けるか否かしかないようにするべき。」 MEASURED before the
   fix: a one-shot volume was placed by `pool()` as a still lake, so `simMoving()` was false the
   instant it existed, `canPour()` said no, and ↺ left the run frozen with ▶ disabled for ever. */
test('R275 ③ a one-shot source is a tap with a bottom, and nothing else differs', () => {
  const s = TW();
  assert.match(s, /const srcCap=\(x\)=>\(x&&x\.cont\?Infinity:/, 'the kind is a bound on the total');
  assert.match(s, /const owed=\(x\)=>Math\.max\(0,srcCap\(x\)-/, '…and what is left is the only gate');
  assert.match(s, /function canPour\(\)\{ return !!\(owedAny\(\)\|\|simMoving\(\)\); \}/,
    '▶ is live whenever a source still owes water — which is what made ↺ useless before');
  /* both kinds go in through ONE call, so the physics cannot differ */
  const taps = /function feedTaps\(dt\)\{([\s\S]*?)\n    \}/.exec(s);
  assert.ok(taps, 'feedTaps must exist');
  assert.ok(!/sc\.cont/.test(taps[1]), 'feedTaps must not branch on the kind of source');
  assert.match(taps[1], /S\.addVolume\(\[c\.j\*B\.NX\+c\.i\],give\);/, 'one delivery, one call');
  /* and the one that made a one-shot un-runnable is gone from the source path */
  const feed = /function feedSim\(\)\{([\s\S]*?)\n    \}/.exec(s);
  assert.ok(feed, 'feedSim must exist');
  assert.ok(!/S\.pool\(/.test(feed[1]), 'a placed volume is no longer poured in as a finished lake');
  assert.ok(!/sources\.forEach/.test(feed[1]), 'feedSim is rainfall and nothing else');
  /* ⏭ has to keep feeding, or the resting state is the state of half the water */
  assert.match(s, /onStep:feedTaps/, 'the settle run feeds the taps too');
  assert.match(codeOnly(read('js/water-dynamics.js')), /const onStep=\(typeof opt\.onStep==='function'\)\?opt\.onStep:null;/,
    '…and the solver accepts the hook');
});

/* ── ④ the panel is sized like the legends it sits beside ───────────────────────────────────────
   MEASURED against `#data-legend-wpalerts` on the built page: legend title 11 px / body 10.5 px /
   rows 13–16 px, this panel 13 / 12 / 44. */
test('R275 ④ the terrain panel’s scale is one declaration, and it is the legends’ scale', () => {
  const s = read('js/terrain-water.js');
  for (const k of ['TW_FS', 'TW_FS_S', 'TW_FS_H', 'TW_ROW', 'TW_CTL', 'TW_IN', 'TW_PAD', 'TW_GAP', 'TW_INSET'])
    assert.match(s, new RegExp('const ' + k + '=|,\\s*' + k + '='), `${k} must be declared once`);
  const px = (k) => {
    const m = new RegExp('const ' + k + "=_mob\\(\\)\\?'?(\\d+(?:\\.\\d+)?)px'?:'?(\\d+(?:\\.\\d+)?)px'?").exec(s);
    assert.ok(m, k + ' must state both device classes');
    return { mob: +m[1], desk: +m[2] };
  };
  const fs = px('TW_FS'), row = px('TW_ROW'), ctl = px('TW_CTL');
  /* the desktop scale is the legends' — 11 px text, and a row that is not three times theirs */
  assert.ok(fs.desk <= 11, `desktop body type is legend-sized (${fs.desk} px)`);
  assert.ok(row.desk <= 32, `a desktop row is legend-sized (${row.desk} px)`);
  /* …and a phone still gets a thumb-sized row, because that is a different rule book */
  assert.ok(row.mob >= 44, `a phone row is a touch target (${row.mob} px)`);
  assert.ok(ctl.mob >= 36 && ctl.desk >= 26, 'a control is still pressable on both');
  /* one gap and one inset, used by every box in the column */
  assert.ok((s.match(/'\+TW_INSET\+'px/g) || []).length >= 3, 'the inset is shared, not repeated as a number');
});

/* ── ⑤ 「ツールは上部にスティックしろ。」 ─────────────────────────────────────────────────────────
   #R245's lesson: a pinned pane is DOM parentage, not CSS — `position:sticky` inside the scroller
   is a no-op, and one unbalanced `</div>` is what broke the pinned footer that round. */
test('R275 ⑤ the tool picker is a pinned pane, a sibling of the scroller', () => {
  const s = read('js/terrain-water.js');
  assert.match(s, /<div class="tw-tools"/, 'the tool block has its own pane');
  const html = s.slice(s.indexOf('panel.innerHTML='), s.indexOf("panel.querySelector('.tw-close')"));
  const iTools = html.indexOf('class="tw-tools"');
  const iBody = html.indexOf('class="tw-body"');
  const iFoot = html.indexOf('class="tw-foot"');
  assert.ok(iTools > 0 && iBody > iTools && iFoot > iBody,
    'head · tools · body · foot, in that order');
  /* the picker is IN the pinned pane, not in the scroller */
  const tools = html.slice(iTools, iBody);
  assert.match(tools, /class="tw-segwrap tw-modes"/, 'the mode picker is inside the pinned pane');
  assert.ok(!/class="tw-segwrap tw-modes"/.test(html.slice(iBody)), '…and not also in the scroller');
  assert.match(tools, /flex:0 0 auto/, 'a pinned pane does not scroll');
  /* the measured scrollbar width has to reach it, or the column has two right edges (#R271) */
  assert.match(codeOnly(s), /\['\.tw-head','\.tw-tools','\.tw-foot'\]/,
    'the scrollbar width is given to every pane that does not scroll');
});
}
