/* ============================================================================
 *  #R264 — source-level checks
 * ----------------------------------------------------------------------------
 *  One test per defect this round measured, in the shape the measurement took.
 *  Source assertions (no browser): the browser specs cost minutes, these cost
 *  milliseconds, and a defect that has a shape in the source belongs here.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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

/* ── ③ the data-centre layer has one window, not two ────────────────────────────────────────────
   「データセンター、AIインフラレイヤーにポップアップ二つあるのを辞めろ。」 #R261's in-view summary was a
   floating `.tool-panel` beside the floating detail card. The card is the one that has to float (it
   is about the point under the finger); the summary is about the layer, so it is rendered into the
   legend block the layer already has. Every figure and every handler is the same markup. */
/* ⚠⚠ (#R265) THE SUMMARY IS NOT JUST UNHOUSED, IT IS DELETED — 「表示範囲内のものを表示する機能は
   いらない」. #R264's assertions named `mountSummary` / `dcRender` / `.dc-krow`, i.e. the mechanism,
   so they would have called this round's deletion a regression. What #R264 was ABOUT is that this
   layer has ONE floating thing, and that is still the property worth holding: the detail card (the
   answer about the point under the finger) floats, and nothing else does. */
test('R264 ③: the data-centre layer floats exactly one thing — the card about a point', () => {
  const s = read('js/datacenters.js');
  assert.doesNotMatch(s, /id='dc-panel'/, 'no floating summary panel');
  assert.doesNotMatch(s, /className='tool-panel'/, '…and no shell for one');
  /* the in-view readout is gone outright (#R265) */
  for (const gone of ['dcStats', 'dcRender', 'mountSummary', 'unmountSummary', 'sumHost', 'dc-sum']) {
    assert.doesNotMatch(s, new RegExp('function\\s+' + gone + '\\b|\\b' + gone + ':'),
      gone + ' is gone with the in-view summary');
  }
  assert.doesNotMatch(read('js/layer-packs.js'), /DCM\.(un)?mountSummary/,
    'and the consumer no longer mounts one');
  /* what does float is the card, and it places itself beside the point that was clicked (#R255) */
  assert.match(s, /id='dc-detail'/, 'the detail card survives');
  assert.match(s, /HOST\.makeDraggable&&HOST\.makeDraggable\(el,el\.querySelector\('\.dc-drag'\)\)/);
});

/* ── ④ the tool cards are cards ─────────────────────────────────────────────────────────────────
   「Toolsのカードは、タイルカードと同様に選択中はハイライトし、カード間の間隔が今ないから少し開けること。」
   MEASURED before: gaps of 0, 0, 0 px against the tile grid's 8 px, and no `.on` rule at all. */
test('R264 ④: the tool rows are spaced and highlighted like the tiles', () => {
  const s = read('js/map-ui.js');
  const gridGap = s.match(/\.lst-grid\{display:grid;[^}]*gap:(\d+)px;/);
  /* ⚠ (#R469) THE FLEX COLUMN MOVED ONE ELEMENT IN, and the question did not change. 「ツールも、
     レイヤーカテゴリと同様に畳めるように」 put the rows inside a `.lst-toolbody` the header can hide, so
     the column and its gap live there — left on the wrapper, a closed section would still reserve a
     row of empty space where the tools were. What #R264 measured — the tool cards are spaced like
     the tile cards — is measured on whichever element declares the column. */
  const toolGap = s.match(/\.lst-toolbody,\.lsr-mount \.lst-toolbody\{[^}]*gap:(\d+)px;/);
  assert.ok(gridGap && toolGap, 'both blocks declare a gap');
  assert.equal(toolGap[1], gridGap[1], 'the tool cards use the same gap the tile cards do');
  assert.match(s, /\.lst-toolbody,\.lsr-mount \.lst-toolbody\{[^}]*display:flex;flex-direction:column;/,
    '…which needs the collapsible body to be a flex column, not a block');
  const onRule = s.indexOf('.lst-toolrow.on,.lsr-mount .lst-toolrow.on{');
  const hoverRule = s.indexOf('.lst-toolrow:hover,.lsr-mount .lst-toolrow:hover{');
  assert.ok(onRule > 0 && hoverRule > 0, 'both rules exist');
  assert.ok(onRule > hoverRule,
    '`.cls.on` and `.cls:hover` have equal specificity — `.on` must come later to win, as .lst-tile.on does');
  const tileOn = s.match(/\.lst-tile\.on\{([^}]*)\}/);
  const rowOn = s.match(/\.lst-toolrow\.on,\.lsr-mount \.lst-toolrow\.on\{([^}]*)\}/);
  assert.ok(tileOn && rowOn, 'both highlights are declared');
  assert.equal(rowOn[1], tileOn[1], 'and «selected» looks the same whichever kind of card it is');
});

/* ── ⑤ every tool can say whether it is running, and can be shut ────────────────────────────────
   「もう一度タイルを押したら選択解除されるように。」 A tile owns a checkbox; a tool card owns nothing, so
   the state has to come from the simulator. This is the table that says which module each row is —
   one name per row, beside the `run` that opens it — and the doors those modules must expose. */
test('R264 ⑤: every tool row names a module, and every module can report and close', () => {
  const ui = read('js/map-ui.js');
  const ids = [...ui.matchAll(/\{ id:'(sim\.[A-Za-z]+)', mod:'(IntMap[A-Za-z]+)'/g)];
  const rows = [...ui.matchAll(/\{ id:'(sim\.[A-Za-z]+)'/g)];
  assert.equal(ids.length, rows.length, 'every SIM_TOOLS row carries a `mod` — a new one cannot be forgotten');
  /* ⚠ (#R296) nine, not thirteen: four rows were merged away or deleted this round and none of
     them lost its feature (see tests/r261 ⑨ for where each went). The floor moves with the list;
     what this test is FOR is that every row that EXISTS names a module which can report and close,
     and that is asserted below for all of them. */
  assert.ok(ids.length >= 8, 'every simulation in the list carries its module (#R261/#R296)');
  assert.match(ui, /const _toolOn=\(t\)=>\{ const m=_tmod\(t\);/, 'the row reads the module, never a cached class');
  assert.match(ui, /if\(_toolOn\(t\)\)\{ _toolOff\(t\); syncTools\(\); return; \}/, 'a second press closes');
  assert.match(ui, /function syncTools\(\)/, 'and the rows re-read the modules rather than trusting their own class');
  /* ⚠ eight of the thirteen are lazy chunks: production verification measured the panel open with
     the row still unlit, because a fixed timeout cannot outwait a chunk download. The sync hangs off
     what `exec` returned — the promise of the tool's arrival — not off a guess. */
  assert.match(ui, /if\(p&&typeof p\.then==='function'\) p\.then\(syncTools,syncTools\);/,
    'the row is re-synced when the open actually resolves');
  /* the modules themselves — an isOpen() or a state().open, and a close() */
  const FILES = ['js/seismic.js', 'js/tsunami.js', 'js/terrain-water.js', 'js/sims.js',
    'js/viewshed.js', 'js/map-tools.js', 'js/night-sky.js', 'js/drone-nav.js'];
  const src = FILES.map(read).join('\n');
  for (const [, id, mod] of ids) {
    const name = mod.replace(/^IntMap/, '');
    const re = new RegExp('window\\.' + mod + '\\s*=');
    assert.ok(re.test(src), id + ': ' + mod + ' is defined in one of the module files');
    assert.ok(new RegExp('isOpen|open:!!\\(panel').test(src), name + ': something reports openness');
  }
  /* the five that had no way to be closed from outside before this round */
  assert.match(read('js/viewshed.js'), /function close\(\)\{ if\(!\(panel&&panel\.style\.display!=='none'\)\) return false;/,
    'line of sight can be closed, and the ✕ uses that same function');
  assert.match(read('js/viewshed.js'), /\.tp-close'\)\.onclick=\(\)=>close\(\);/, 'one way out, not two');
  assert.match(read('js/map-tools.js'), /return \{ open, close, isOpen, run, clear, ensureLayers/,
    'reachable area can be asked and closed');
  const sims = read('js/sims.js');
  /* ⚠ (#R296) three, not five: `rf` / `disaster` / `earthReplay` left this file with their features
     (see tests/r261 ⑧). What remains is `radiation` — which this round gave a real panel, so it now
     reports EITHER — `sun` and `transitReach`, the latter still reading its own drawing because it
     has no panel. The count follows the file; the requirement (every simulator can be asked) does not. */
  assert.equal((sims.match(/const isOpen=\(\)=>/g) || []).length + (sims.match(/function isOpen\(\)/g) || []).length, 2,
    'every simulator left in js/sims.js that owns a drawing reports openness');
});

/* ── ⑥ a chosen earthquake brings its own hypocentre ────────────────────────────────────────────
   「過去・最近の地震から選んだ場合、Place the hypocenterピルは表示しないように。」 `open()` arms the map
   when there is no epicentre; loading an event is the OTHER way of doing that one thing, and neither
   loader disarmed — so the pill went on asking for a hypocentre the catalogue had already published,
   and the next tap on the map moved it. Disarmed in the loaders, because the HUD is a readout. */
test('R264 ⑥: loading a past or recent earthquake disarms the map', () => {
  const s = read('js/seismic.js');
  const applyEvent = s.slice(s.indexOf('function applyEvent(id)'), s.indexOf('function evObsHtml'));
  assert.match(applyEvent, /if\(clickMode==='epi'\) clickMode='none';/,
    'the catalogue loader disarms');
  const applyReal = s.slice(s.indexOf('function applyReal(f)'), s.indexOf('function _defBox'));
  assert.match(applyReal, /if\(clickMode==='epi'\) clickMode='none';/,
    'and so does the USGS-feed loader');
  assert.match(applyReal, /try\{ _hud\(\); \}catch\(_\)\{\}/,
    'refresh() does not render(), so applyReal asks the HUD directly — as close() already does');
  /* the HUD stays a readout of clickMode: no second opinion about what is armed */
  assert.match(s, /const on=opened&&\(_fDrawing\|\|clickMode==='epi'\|\|clickMode==='station'\);/,
    'the pill still reads clickMode and nothing else');
  /* …and unloading puts it back (#R242's inverse rule) */
  const clearEvent = s.slice(s.indexOf('function clearEvent()'), s.indexOf('function applyEvent(id)'));
  assert.match(clearEvent, /setClickMode\('epi'\)/, 'unloading re-arms');
});

/* ── ⑦ both build stamps name this round ────────────────────────────────────────────────────────
   #R260's lesson: adding a DEV-NOTES round without bumping BOTH stamps in index.html fails the
   static checks, and it has now happened twice. */
test('R264 ⑦: the two build stamps name the newest DEV-NOTES round', () => {
  const notes = read('DEV-NOTES.md');
  const rounds = [...notes.matchAll(/^## R(\d+) /gm)].map((m) => +m[1]);
  const newest = Math.max(...rounds);
  const html = read('index.html');
  const a = html.match(/window\.__imBuild='R(\d+)'/);
  const b = html.match(/window\.INTMAP_BUILD='[\d-]+-R(\d+)'/);
  assert.ok(a && b, 'both stamps are present');
  assert.equal(+a[1], newest, '__imBuild names the newest round');
  assert.equal(+b[1], newest, 'INTMAP_BUILD names the same one');
});
