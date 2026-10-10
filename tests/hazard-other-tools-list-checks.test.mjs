/* ============================================================================
 *  THE TOOLS LIST — every non-layer simulation is a row that names a module
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The Tools list is built by js/map-ui.js in the page
 *    DOM; these read the source.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs, { readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as LM from '../js/layer-manifest.js';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r211-checks.test.mjs (tests #9 of 12) ═══
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
    assert.ok(!!LAZY_REGISTRY[key], `…under the name IntMapLazy fetches it by`);   /* (#R798) the registry */
  }
  /* the new layer rows travel in the link like every other data layer */
  /* (layer-manifest) the link carries the manifest's \`share\` rows (was a prefix selector in js/map-ui.js) */
  assert.ok(LM.LAYERS.filter((l) => /^wp-dl-/.test(l.id)).every((l) => l.share), 'the world-data rows are part of the shared layer set');
  assert.ok(/sharedIds\(\)/.test(ui), '…and the link is built from that set');
  /* a reload restores everything, with a way out of a crash loop */
  assert.match(ui, /intmap_restore_try/, 'the attempt is recorded before it runs');
  assert.match(ui, /firstLoad!==false \|\| !crashed/, 'a reload restores fully unless the last attempt did not survive');
});
}

/* ═══ from tests/r242-checks.test.mjs (tests #13 of 20) ═══
    IntMap · #R242 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, eight rounds running). */
{
/* strip block and line comments — a test must match CODE, never a note quoting the instruction */

/* ── ⑤ the seismic simulator is reachable from the panel of tools ──────────────────────────────────
   (tools-out-of-layers) The strip's own button (#btn-seismic-sim) is gone: it was a second door to the same command
   that #R766 had to hide on every rebuild. The door is the Tools panel's row, and it presses the OS action. */
test('R242 ⑤ the Tools panel opens the seismic simulator through the OS action, through one door', () => {
  assert.ok(/id:'sim\.seismic'/.test(code(read('js/map-ui.js'))), 'the Tools panel carries the row');
  assert.ok(!/btn-seismic-sim/.test(code(read('js/data-layers.js'))), 'and the strip no longer builds a second button for it');
  assert.ok(/IntMapOS\.register\('sim\.seismic'/.test(code(read('js/app-body.js'))),
    'one command, so the palette, Atlas and this row are one path');
});
}

/* ═══ from tests/r243-checks.test.mjs (tests #11 of 17) ═══
    IntMap · #R243 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, nine rounds running). */
{

/* ── ⑥ the simulator is reachable from the panel a reader actually opens ──────────────────────────
   (tools-out-of-layers) That panel is the Tools panel now — the desktop's 「ツール ▾」 and the phone's tools sheet —
   built by mountTools, and the tile browser holds no tool row (only a search draws matching ones). */
test('R243 ⑥ the Tools panel carries a row that runs the OS action', () => {
  const c = code(read('js/map-ui.js'));
  assert.ok(/function mountTools\(/.test(c) && /body\.appendChild\(_toolRow\(t,o\.onPick\)\)/.test(c),
    'the row must be built into the Tools panel — #layer-tools lives in #layer-dropdown, which is display:none on the default setting');
  assert.ok(/mountTools\(dd,/.test(c) && /getElementById\('measure-dropdown'\)/.test(c), "and that panel is the desktop toolbar's Tools menu");
  assert.ok(!/toolsBlock/.test(c), 'the tile browser no longer appends a tools block');
  assert.ok(/id:'sim\.seismic'/.test(c) && /OS\.exec\(t\.id/.test(c),
    'and it must go through IntMapOS, so the palette, the right-click menu and this row are one path');
});
}

/* ═══ from tests/r258-checks.test.mjs (tests #13, #14 of 16) ═══
    #R258 — source-level checks
    Each test below pins ONE defect this round measured, in the form the
    measurement took. They are source assertions (no browser), which is what the
    `tests/r*-checks` family is for: the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ⑨ the tools list, and the rename ──────────────────────────────────────────────────────── */
test('R258 ⑨: every non-layer simulation is a row in the tools list', () => {
  const s = read('js/map-ui.js');
  /* ⚠ (#R296) `sim.tsunami` left this list — 「津波シミュレータはボタンを設置しないように。（地震シミュ
     レータありきの機能なため、直接アクセスUIは不要。）」. The MODULE is untouched: the earthquake simulator
     opens it once a source has a magnitude and a depth, which is the only state in which it has
     anything to solve. What #R258 is FOR — a simulation that is not a layer must be reachable — is
     asserted for every row that remains, and the tsunami's reachability is asserted in R197 ②b. */
  ['sim.seismic', 'sim.terrainWater', 'sim.radiation',
    'sim.los', 'sim.reach', 'sim.sun', 'sim.nightSky'].forEach((id) => {
    assert.ok(s.includes("id:'" + id + "'"), id + ' is a row');
  });
  assert.ok(!s.includes("id:'sim.tsunami'"), 'and the tsunami has no row of its own');
  assert.match(s, /function registerSimTools\(\)/, 'each is an IntMapOS action…');
  assert.match(s, /function mountTools\(container,opts\)\{ if\(!container\) return null;\s*build\(\); registerSimTools\(\);/,
    '…registered when the Tools panel is built, not in the factory body (IntMapOS does not exist yet then)');
});
test('R258 ⑨b: 地震波シミュレーター is 地震シミュレーター in every language', () => {
  /* ⚠ the CODE, not the comments: js/map-ui.js quotes the instruction verbatim, and a round's
     record of what it was asked is not a label the app shows anybody. */
  const files = ['js/app-body.js', 'js/data-layers.js', 'js/map-ui.js', 'js/tool-panel.js', 'js/seismic.js'];
  files.forEach((f) => {
    const code = codeOnly(read(f));
    assert.ok(!/Seismic wave simulator|地震波シミュレータ/.test(code), f + ' no longer names the old title');
  });
  ['fr', 'ko', 'zh', 'zh-hans'].forEach((c) => {
    const s = read('js/locales/ui.' + c + '.js');
    assert.ok(s.includes('"Earthquake simulator"') || s.includes("'Earthquake simulator'"),
      'ui.' + c + '.js carries the new key');
    assert.ok(!s.includes('"Seismic wave simulator"'), 'ui.' + c + '.js drops the old key');
  });
});
}

/* ═══ from tests/r261-checks.test.mjs (tests #8, #9 of 13) ═══
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

/* ── ⑧ Line of sight can move its site from a button ────────────────────────────────────────────
   「Line of sightに地点を変えるボタンがない。」 The only way was a right-click on the map, described
   in prose in two places. */
test('R261 ⑧: the LOS panel has a Move-the-site control, armed like the link', () => {
  const s = read('js/viewshed.js');
  assert.match(s, /id="los-move"/, 'the button exists');
  assert.match(s, /function armMove\(on\)\{/);
  assert.match(s, /if\(moveArmed&&linkArmed\) armLink\(false\);/, 'one click cannot mean two things');
  assert.match(s, /if\(linkArmed&&moveArmed\) armMove\(false\);/, '…in both directions');
  assert.match(s, /moveTo, armMove, isMoveArmed:\(\)=>moveArmed,/, 'and the same door Atlas presses');
  /* moveTo must not re-open the panel — open() rewrites cssText and would undo a drag */
  const m = s.match(/function moveTo\(lngLat\)\{[\s\S]*?return run\(\); \}/);
  assert.ok(m, 'moveTo is there');
  assert.doesNotMatch(m[0], /\bopen\(/, 'moving the site must not reset the panel position');
  assert.doesNotMatch(m[0], /easeTo|flyTo/, 'and must not move the camera the reader did not ask to move');
});

/* ── ⑨ the simulations that had no UI door at all ───────────────────────────────────────────────
   MEASURED: IntMapDrone / IntMapDisaster / IntMapTransitReach / IntMapRF / IntMapEarthReplay were
   reachable ONLY from js/atlas-console.js — no button, no menu, not even a right-click. */
test('R261 ⑨: every non-layer simulation is a row in the Tools list', () => {
  const s = read('js/map-ui.js');
  for (const id of ['sim.seismic','sim.terrainWater','sim.radiation','sim.los','sim.reach',
                    'sim.sun','sim.nightSky','sim.drone']) {
    assert.match(s, new RegExp("id:'" + id.replace('.', '\\.') + "'"), id + ' is a tool row');
  }
  /* each one presses the module it names */
  assert.match(s, /window\.IntMapDrone&&window\.IntMapDrone\.open\(\)/);
  /* ⚠ (#R296) FOUR OF #R261's FIVE ROWS ARE GONE, AND NONE OF THEM LOST ITS FEATURE.
     `disaster` — 「4つのうち、放射性物質拡散シミュレーションを残し全削除」: what its fourth hazard opened
       is `sim.radiation`, which has a row above and, this round, a panel of its own.
     `transitReach` — 「到達圏と公共交通機関の到達圏に分離するのを辞めろ」: the transport of `sim.reach`.
     `rf` — 「電波・通信圏と見通し線解析を統合して」: a mode of `sim.los`.
     `earthReplay` — 「存在意義が不明だから全削除」: Chronos is that clock.
     #R261's finding was that five simulations had NO door; the invariant it left behind is that a
     simulation is reachable, not that it has a row. So the check follows each one to its new door. */
  assert.match(s, /id:'sim\.radiation'/, 'the radioactive dispersion model still has its row…');
  assert.match(read('js/sims.js'), /openPanel\(ll\)\{/, '…and, since #R296, a panel behind it');
  assert.match(read('js/map-tools.js'), /transit:'transit'/, 'transit reach is a transport of the reachable-area panel');
  assert.match(read('js/viewshed.js'), /setMode:\(m\)=>/, 'radio coverage is a mode of the viewshed panel');
  for (const dead of ['sim.disaster', 'sim.transitReach', 'sim.rf', 'sim.earthReplay'])
    assert.ok(!s.includes("id:'" + dead + "'"), dead + ' no longer has a row of its own');
});
}

/* ═══ from tests/r264-checks.test.mjs (tests #4, #5 of 7) ═══
    #R264 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

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
  /* (tools-out-of-layers) …and the body is the Tools panel's section body (.tlp-body) now. */
  const toolGap = s.match(/\.tlp-body\{[^}]*gap:(\d+)px;/);
  assert.ok(gridGap && toolGap, 'both blocks declare a gap');
  assert.equal(toolGap[1], gridGap[1], 'the tool cards use the same gap the tile cards do');
  assert.match(s, /\.tlp-body\{display:flex;flex-direction:column;/,
    '…which needs the collapsible body to be a flex column, not a block');
  const onRule = s.indexOf('.tlp-root .lst-toolrow.on,.lst-toolhits .lst-toolrow.on{');
  const hoverRule = s.indexOf('.tlp-root .lst-toolrow:hover,.lst-toolhits .lst-toolrow:hover{');
  assert.ok(onRule > 0 && hoverRule > 0, 'both rules exist');
  assert.ok(onRule > hoverRule,
    '`.cls.on` and `.cls:hover` have equal specificity — `.on` must come later to win, as .lst-tile.on does');
  const tileOn = s.match(/\.lst-tile\.on\{([^}]*)\}/);
  const rowOn = s.match(/\.lst-toolrow\.on,\.lst-toolhits \.lst-toolrow\.on\{([^}]*)\}/);
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
  assert.match(ui, /if\(_toolOn\(t\)\)\{ _toolOff\(t\); syncTools\(\); _pick\(pick\); return; \}/, 'a second press closes');
  assert.match(ui, /function syncTools\(\)/, 'and the rows re-read the modules rather than trusting their own class');
  /* ⚠ eight of the thirteen are lazy chunks: production verification measured the panel open with
     the row still unlit, because a fixed timeout cannot outwait a chunk download. The sync hangs off
     what `exec` returned — the promise of the tool's arrival — not off a guess. */
  assert.match(ui, /if\(p&&typeof p\.then==='function'\) p\.then\(syncTools,syncTools\);/,
    'the row is re-synced when the open actually resolves');
  /* the modules themselves — an isOpen() or a state().open, and a close() */
  /* ⚠ (#R670) THE EIGHT FILE NAMES THAT STOOD HERE WERE A HAND-WRITTEN LIST, and a hand-written list
     cannot notice the thing that was not added to it: `sim.pandemic` lives in js/playground.js, and
     this test failed on «IntMapPandemic is defined in one of the module files» while the module was
     defining it perfectly well one file over. That is the same shape as the defect tests/r670-checks
     ① exists to catch one level up. It reads js/ instead — strictly a superset of the eight, so
     nothing asserted here is weakened, and the next simulation is covered without an edit. */
  const src = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'))
    .map((f) => read('js/' + f)).join(String.fromCharCode(10));
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
}
