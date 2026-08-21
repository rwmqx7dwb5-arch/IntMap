/* ============================================================================
 *  #R258 — source-level checks
 * ----------------------------------------------------------------------------
 *  Each test below pins ONE defect this round measured, in the form the
 *  measurement took. They are source assertions (no browser), which is what the
 *  `tests/r*-checks` family is for: the browser specs cost minutes, these cost
 *  milliseconds, and a defect that has a shape in the source belongs here.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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

/* ── ③ Night sky opens standing ─────────────────────────────────────────────────────────────── */
test('R258 ③: the night sky opens in the standing view', () => {
  const s = read('js/night-sky.js');
  assert.match(s, /let mode = 'stand';/, "the default mode is 'stand'");
  assert.ok(s.includes("first-person|firstPerson|ground)$/i.test(asked)) mode = 'stand'"),
    'an explicit request still overrides it, in both directions');
});

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

/* ── ⑧ who is in front ─────────────────────────────────────────────────────────────────────── */
test('R258 ⑧: the front-most band covers every panel, including the compare window', () => {
  const cmp = read('js/compare.js');
  assert.match(cmp, /#compare-window\{position:fixed;[^}]*z-index:2200;/,
    'the compare window is in the card band, not above the sidebars at 4000');
  const ui = read('js/map-ui.js');
  assert.match(ui, /document\.addEventListener\('keydown',\(e\)=>\{ try\{ act\(e\.target,false\); \}catch\(_\)\{\} \},true\);/,
    'typing counts as an operation');
  assert.match(ui, /if\(\(p==='relative'\|\|p==='sticky'\)&&z&&z!=='auto'\) return n;/,
    'a panel positioned relative WITH a z-index is a panel, not a reason to demote');
  assert.ok(ui.includes(".sidebar,#sidebar,#layer-sidebar-r'"),
    'the two sidebars are the shell this band is measured against, never a panel inside it');
});
/* ⚠⚠⚠ the one that actually defeated three rounds of the `.im-front` machinery: #R47's window
   manager wrote an INLINE z-index from 4300 up onto EVERY managed floating window on pointerdown.
   `.im-front` (!important) beat it while it was set, and the moment the reader clicked the sidebar
   the class came off and the inline 4301 put the window back in front — permanently. MEASURED:
   `#compare-window` computed 4301 against the sidebar's 2600 after a pointerdown on the sidebar;
   after this change it computes 2201/2202 there and 2650 while it is the panel in use. */
test('R258 ⑧b: click-to-front orders the windows inside the band, not above it', () => {
  const wm = read('js/window-manager.js');
  assert.match(wm, /const WIN_Z_BASE=2200, WIN_Z_CAP=2599;/,
    'the window stack starts in the card band and stops below the sidebar');
  assert.doesNotMatch(wm, /let __winZ=4300;/, 'the 4300 base is back — it sits above both sidebars');
  assert.match(wm, /__winZ=Math\.min\(WIN_Z_CAP,Math\.max\(__winZ,mx\)\+1\)/,
    'the counter is capped by the band, not by 5999');
});

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
  assert.match(s, /function toolsBlock\(\)\{ registerSimTools\(\);/,
    '…registered when the browser is built, not in the factory body (IntMapOS does not exist yet then)');
});
test('R258 ⑨b: 地震波シミュレーター is 地震シミュレーター in every language', () => {
  /* ⚠ the CODE, not the comments: js/map-ui.js quotes the instruction verbatim, and a round's
     record of what it was asked is not a label the app shows anybody. */
  const files = ['js/app-body.js', 'js/data-layers.js', 'js/map-ui.js', 'js/tool-panel.js', 'js/seismic.js'];
  files.forEach((f) => {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/Seismic wave simulator|地震波シミュレータ/.test(code), f + ' no longer names the old title');
  });
  ['fr', 'ko', 'zh', 'zh-hans'].forEach((c) => {
    const s = read('js/locales/ui.' + c + '.js');
    assert.ok(s.includes('"Earthquake simulator"') || s.includes("'Earthquake simulator'"),
      'ui.' + c + '.js carries the new key');
    assert.ok(!s.includes('"Seismic wave simulator"'), 'ui.' + c + '.js drops the old key');
  });
});

/* ── ⑩ the new category, and the layers in it ──────────────────────────────────────────────── */
test('R258 ⑩: Energy & resources is a category with two surveyed layers in it', () => {
  const dl = read('js/data-layers.js');
  /* ⚠ (#R261) THIS PINNED THE LITERAL LIST, AND THE NEXT INSTRUCTION MADE IT RED. 「Others, Betaも
     含め既存レイヤーの再編」 moved the five World-Bank energy indicators and the dams row onto this
     shelf, which is what the shelf is for. What #R258 was actually asserting is that the category
     exists and that its two SURVEYED layers are on it — a list literal also asserts «and nothing
     else will ever be», which is not something this round knew. (#R244's lesson, third time.) */
  const eg = /\['lyrGrpEnergy',\[([^\]]*)\]\]/.exec(dl);
  assert.ok(eg, 'the Energy & resources group is there');
  ['osmpower', 'osmextract'].forEach(k => assert.ok(eg[1].includes("'" + k + "'"),
    k + ' is on the Energy & resources shelf'));
  const fac = read('js/osm-facilities.js');
  assert.match(fac, /id:'osmpower', row:'fac-dl-osmpower'/, 'the power layer exists');
  assert.match(fac, /id:'osmextract', row:'fac-dl-osmextract'/, 'the extraction layer exists');
  assert.match(fac, /nwr\["power"="plant"\]/, '…and asks OpenStreetMap for real objects');
  ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans'].forEach((c) => {
    assert.ok(read('js/locales/ui.' + c + '.js').includes('lyrGrpEnergy'),
      'ui.' + c + '.js names the new group');
  });
});

/* ── ⑪ the data-centre layer ───────────────────────────────────────────────────────────────── */
test('R258 ⑪: the curated table grew, and a size on the map means a published number', () => {
  const s = read('js/datacenters.js');
  const rows = (s.slice(s.indexOf('const DC=['), s.indexOf('\n  ];', s.indexOf('const DC=['))).match(/^\s*\[-?[0-9]/gm) || []).length;
  assert.ok(rows >= 310, 'the curated table holds ' + rows + ' entries (it was 260 before #R258)');
  assert.match(s, /const rFor=\(k,mw\)=>\{ const base=R_OF\[k\]\|\|5;/,
    'the radius is a function of the PUBLISHED capacity…');
  assert.match(s, /return \(mw>0\)\?Math\.min\(base\*2\.4, base\*\(1\+0\.055\*Math\.sqrt\(mw\)\)\):base;/,
    '…√MW, and the class’s own size where nothing is published');
  assert.match(s, /toggleKey\(k\)\{/, 'the legend key is a filter');
  /* the six coordinates that were the nearest big city rather than the published site */
  assert.match(s, /\[135\.47,34\.57,'SoftBank/, 'SoftBank Sakai is in Sakai');
  assert.match(s, /\[54\.37,24\.47,'G42/, 'G42 is in Abu Dhabi, not Dubai');
});
