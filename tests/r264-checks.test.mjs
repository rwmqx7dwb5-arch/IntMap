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
  const s = read('js/terrain-water.js');
  const trig = s.match(/const REFINE_MIN_CELLS=([\d.]+);/);
  assert.ok(trig, 'REFINE_MIN_CELLS is still the refinement trigger');
  /* the ladder that MATTERS is the one whose legs are handed to refineCrossing — js/terrain-water.js
     has a second, unrelated `mult` loop in pitEscape(), which draws nothing. Anchor on the call. */
  const call = s.indexOf('refineCrossing(pv,');
  assert.ok(call > 0, 'the escalation still refines its legs');
  const ladder = s.lastIndexOf('for(const mult of [', call);
  assert.ok(ladder > 0, '…and it still walks a ladder of multipliers');
  const rungs = s.slice(ladder).match(/^for\(const mult of \[([\d,\s]+)\]\)/);
  assert.ok(rungs, 'the escalation ladder is still a list of multipliers');
  const first = Math.min(...rungs[1].split(',').map((x) => +x.trim()).filter((x) => x > 0));
  assert.ok(+trig[1] < first,
    `the trigger (${trig[1]}) must be under the smallest rung (${first}); equal means that rung is never refined`);
  assert.match(s, /if\(!\(L>REFINE_MIN_CELLS\*spacingM\)\) return null;/,
    'and it is still measured against the FINE spacing the leg is drawn into');
});

/* ── ② the counter cannot be defined by the code it is watching ─────────────────────────────────
   `coarseLegs` counted legs above the same constant the refiner declined on, so it read 0 on all
   four measured traces BY CONSTRUCTION. It is counted against the trace's own finest sampling now —
   what the eye compares (#R250) — which is a different question from «did the refiner take it». */
test('R264 ②: coarseLegs is counted against the trace’s finest sampling', () => {
  const s = read('js/terrain-water.js');
  assert.match(s, /const COARSE_REPORT_CELLS=\d+;/, 'the report threshold is its own constant');
  const sites = s.match(/coarseLegs\+\+/g) || [];
  assert.equal(sites.length, 2, 'both fallback branches still count');
  for (const m of s.matchAll(/if\(gcM\([^)]*\)>([A-Z_]+)\*\(?([A-Za-z|]+)/g)) {
    assert.equal(m[1], 'COARSE_REPORT_CELLS', 'the counter uses the report threshold');
    assert.match(m[2], /minSpacingM/, 'against the finest sampling, not the leg’s own rung');
  }
  assert.match(s, /straight,\s*\/\* \(#R264\)/,
    'and the reported symptom — a RUN of collinear legs — is measured too');
});

/* ── ③ the data-centre layer has one window, not two ────────────────────────────────────────────
   「データセンター、AIインフラレイヤーにポップアップ二つあるのを辞めろ。」 #R261's in-view summary was a
   floating `.tool-panel` beside the floating detail card. The card is the one that has to float (it
   is about the point under the finger); the summary is about the layer, so it is rendered into the
   legend block the layer already has. Every figure and every handler is the same markup. */
test('R264 ③: the data-centre summary has no window of its own', () => {
  const s = read('js/datacenters.js');
  assert.doesNotMatch(s, /id='dc-panel'/, 'the floating summary panel is gone');
  assert.doesNotMatch(s, /className='tool-panel'/, '…and so is its shell');
  assert.match(s, /function mountSummary\(el\)\{ sumHost=el\|\|null;/,
    'the host is handed in by the consumer that builds it');
  assert.match(s, /function dcRender\(\)\{ const p=dcSumEl\(\); if\(!p\) return;/,
    'and with no host there is nothing to draw into');
  /* nothing was dropped: the denominator, the class switches and the largest-in-view list */
  assert.match(s, /class="dc-krow"/, 'the class rows (which are also the filter) survive');
  assert.match(s, /class="dc-top"/, 'the largest-in-view list survives');
  assert.match(s, /st\.withMw/, 'and so does the «N of M publish a capacity» denominator');
  const c = read('js/layer-packs.js');
  assert.match(c, /if\(el&&DCM\.mountSummary\) DCM\.mountSummary\(el\)/,
    'the consumer mounts it on every toggle-on, so a rebuilt row keeps the summary');
  assert.match(c, /if\(DCM\.unmountSummary\) DCM\.unmountSummary\(\)/, 'and takes it away with the layer');
});

/* ── ④ the tool cards are cards ─────────────────────────────────────────────────────────────────
   「Toolsのカードは、タイルカードと同様に選択中はハイライトし、カード間の間隔が今ないから少し開けること。」
   MEASURED before: gaps of 0, 0, 0 px against the tile grid's 8 px, and no `.on` rule at all. */
test('R264 ④: the tool rows are spaced and highlighted like the tiles', () => {
  const s = read('js/map-ui.js');
  const gridGap = s.match(/\.lst-grid\{display:grid;[^}]*gap:(\d+)px;/);
  const toolGap = s.match(/\.lst-tools,\.lsr-mount \.lst-tools\{[^}]*gap:(\d+)px;/);
  assert.ok(gridGap && toolGap, 'both blocks declare a gap');
  assert.equal(toolGap[1], gridGap[1], 'the tool cards use the same gap the tile cards do');
  assert.match(s, /\.lst-tools,\.lsr-mount \.lst-tools\{[^}]*display:flex;flex-direction:column;/,
    '…which needs the wrapper to be a flex column, not a block');
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
  assert.ok(ids.length >= 13, 'all thirteen simulations are in the list (#R261)');
  assert.match(ui, /const _toolOn=\(t\)=>\{ const m=_tmod\(t\);/, 'the row reads the module, never a cached class');
  assert.match(ui, /if\(_toolOn\(t\)\)\{ _toolOff\(t\); syncTools\(\); return; \}/, 'a second press closes');
  assert.match(ui, /function syncTools\(\)/, 'and the rows re-read the modules rather than trusting their own class');
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
  for (const k of ['rf', 'transit', 'disaster', 'replay', 'radiation']) void k;
  assert.equal((sims.match(/const isOpen=\(\)=>/g) || []).length + (sims.match(/function isOpen\(\)/g) || []).length, 5,
    'the five simulators in js/sims.js all report openness (two of them off what they DREW, having no panel)');
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
