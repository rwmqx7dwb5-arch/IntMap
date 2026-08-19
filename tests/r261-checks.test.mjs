/* ============================================================================
 *  #R261 — source-level checks
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

/* ── ② the detail card's × is the app's rounded square, not a disc ──────────────────────────────
   「詳細のポップアップは×を丸にするな。」 Two files built a private `border-radius:50%` button on a
   shell that already has `.country-popup-close` (8 px, transparent, 32 px on a phone, in the drag
   exclusion list). */
test('R261 ②: no detail card builds its own circular close button', () => {
  for (const f of ['js/datacenters.js', 'js/osm-facilities.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /class="cp-close"[^>]*border-radius:50%/,
      f + ': the round × is gone');
    assert.match(s, /class="country-popup-close cp-close"/,
      f + ': it uses the shell’s own close button');
  }
  /* the class has to keep carrying the phone size and the drag exclusion */
  assert.match(read('js/data-layers.js'), /\.country-popup-close, #cp-close\{ width:32px !important/);
  assert.match(read('js/window-manager.js'), /\.country-popup-close/);
});

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
  assert.match(s, /sources\.forEach\(sc=>\{ if\(!sc\.cont\) return;/,
    'every continuous source is fed, not only the last one');
  assert.match(s, /const give=Math\.max\(0,\+sc\.rate\|\|pourRate\)\*dt;/,
    '…at its own rate, for the length of the step the solver is about to take');
  assert.match(s, /,feedTaps\);/, 'and the solver is what calls back for it');
  assert.match(s, /const contSources=\(\)=>sources\.filter\(x=>x\.cont\);/);
  assert.match(s, /sources\.push\(\{lng,lat,m3:cont\?0:srcM3,cont,rate:cont\?pourRate:0\}\);/,
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
  /* the two explicit resets still reset */
  assert.match(s, /resetTerrain\(\)\{[\s\S]{0,120}sculpt=new Float32Array\(G\.NX\*G\.NY\)/);
});

/* ── ⑤ the play button is a rounded square ─────────────────────────────────────────────────────
   「再生ボタンは四角にしろ。」 38 px box at `border-radius:19px` is a circle. */
test('R261 ⑤: the terrain/water transport is not a disc', () => {
  const s = read('js/terrain-water.js');
  const m = s.match(/'\.tw-play\{[^']*'/);
  assert.ok(m, 'the .tw-play rule is there');
  assert.doesNotMatch(m[0], /border-radius:19px/, 'a 19 px radius on a 38 px box IS a circle');
  assert.match(m[0], /width:38px;height:38px;flex:0 0 auto;border-radius:11px/);
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

/* ── ⑦ the reachable-area panel is opaque by default and still follows the setting ──────────────
   「Reachable areaのポップアップはデフォルト透過するな。」 It was the only floating panel with a
   translucent fill and NO backdrop-filter, and it was named in neither frosted-mode list. */
test('R261 ⑦: #iso-panel is opaque by default and joins the two frosted-mode lists', () => {
  const js = read('js/map-tools.js');
  assert.match(js, /id='iso-panel'[\s\S]{0,1600}background:var\(--card-bg,#1c1c1e\)/,
    'the default fill is the opaque card background');
  assert.doesNotMatch(js, /panel\.style\.cssText='position:fixed;left:20px;top:80px;[^']*var\(--popup-bg/,
    'the translucent token is gone from the inline style');
  const css = read('css/intmap.css');
  assert.match(css, /body\.sidebar-translucent #iso-panel, body\.sidebar-glass2 #iso-panel\{/,
    'it follows 「フロストガラス」/「より透明」 like every other floating surface');
});

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
  for (const id of ['sim.seismic','sim.tsunami','sim.terrainWater','sim.radiation','sim.los','sim.reach',
                    'sim.sun','sim.nightSky','sim.drone','sim.disaster','sim.transitReach','sim.rf','sim.earthReplay']) {
    assert.match(s, new RegExp("id:'" + id.replace('.', '\\.') + "'"), id + ' is a tool row');
  }
  /* each one presses the module it names */
  assert.match(s, /window\.IntMapDrone&&window\.IntMapDrone\.open\(\)/);
  assert.match(s, /window\.IntMapDisaster&&window\.IntMapDisaster\.open\(_hereLL\(\)\)/);
  assert.match(s, /window\.IntMapTransitReach&&window\.IntMapTransitReach\.open\(_hereLL\(\)\)/);
  assert.match(s, /window\.IntMapRF&&window\.IntMapRF\.open\(_hereLL\(\)\)/);
  assert.match(s, /window\.IntMapEarthReplay&&window\.IntMapEarthReplay\.open\(\)/);
});

/* ── ⑩ the four new shelves, and what did NOT move ──────────────────────────────────────────────
   「Others, Betaも含め既存レイヤーの再編…」 — the authorisation #R255 and #R258 both said they did
   not have. What they refused to move on their own is still exactly where the reader put it. */
test('R261 ⑩: Others is emptied into named families and the demoted rows stay demoted', () => {
  const s = read('js/data-layers.js');
  for (const k of ['lyrGrpEconomy','lyrGrpSociety','lyrGrpTransport','lyrGrpAgri'])
    assert.match(s, new RegExp("\\['" + k + "',\\["), k + ' is a group');
  assert.match(s, /\['lyrGrpOthersReal',\[\]\]/, 'the Others shelf is empty, and kept (the lyrGrpGeoPol precedent)');
  /* #R233's seven and #R254's energy-mix promotion are untouched */
  assert.match(s, /\['lyrGrpDemo',\['popgrid','gdppc','tfr','hdi','dem','cpi','lifeexp','energy'\]\]/);
  /* the rows #R40 demoted BY INSTRUCTION are not promoted */
  const groups = s.slice(s.indexOf('const GROUPS=['), s.indexOf('/* Explicit order for the Others'));
  /* ⚠ (#R266) THE GIBS HALF OF THIS LIST IS GONE, AND NOT BECAUSE IT WAS PROMOTED. #R40 demoted
     seven GIBS rasters to Beta by instruction; #R266 DELETED eight of them by instruction (「以下の
     レイヤーは削除」), so «is gxtruecolor still in Beta» no longer has a subject. The three EC
     weather rows are the demotions that still exist, and #R266 ① asserts the deletions separately —
     between them nothing about #R40's decision goes unchecked. */
  for (const id of ['ec-temp','ec-precip','ec-wind'])
    assert.ok(!groups.includes("'" + id + "'"), id + ' stays in Beta — it was demoted per request');
  for (const id of ['gxtruecolor','gxlst','gxcloud'])
    assert.ok(!s.includes("'" + id + "'"), id + ' was deleted in #R266 and must not come back');
  /* every id in a GROUP has to be resolvable, which is what the `ox-` prefix gap broke */
  assert.match(s, /document\.getElementById\('ox-'\+id\)/,
    'rowFor knows the ox- prefix, or oxrail/oxsea silently stay in Beta');
  /* the nine locales carry the four new headings */
  for (const f of ['en','jp','de','ru','es','fr','ko','zh','zh-hans']) {
    const t = read('js/locales/ui.' + f + '.js');
    for (const k of ['lyrGrpEconomy','lyrGrpSociety','lyrGrpTransport','lyrGrpAgri'])
      assert.ok(t.includes(k), f + ' declares ' + k);
  }
});

/* ── ⑪ six new surveyed-object layers, on the shelves that had nothing to click ─────────────────
   「新レイヤー（国単位で塗るだけのやつじゃなくて、モノホンのやつ。）」 */
test('R261 ⑪: the six new facility sets exist, are filed, and invent nothing', () => {
  const s = read('js/osm-facilities.js');
  const ids = ['osmair','osmport','osmwater','osmedu','osmemg','osmspace'];
  for (const id of ids) {
    assert.match(s, new RegExp("id:'" + id + "', row:'fac-dl-" + id + "'"), id + ' is a set');
    assert.match(s, new RegExp("SW=\\{[\\s\\S]{0,400}"), 'the swatch table is there');
  }
  /* each one queries OpenStreetMap for real objects — no synthetic geometry anywhere in this file */
  assert.doesNotMatch(s, /Math\.random\(\)/, 'nothing here is generated');
  /* and every one of them is on a shelf */
  const dl = read('js/data-layers.js');
  for (const id of ids) assert.ok(dl.includes("'" + id + "'"), id + ' is filed into a group');
});

/* ── ⑫ the data-centre layer can be asked a question ────────────────────────────────────────────
   「データセンター、AIインフラレイヤーを爆発的に強化。」 It had a colour key and nothing else. */
/* ⚠⚠ (#R264) THIS PINNED THE SUMMARY'S HOST AND WOULD HAVE CALLED ITS MOVE A REGRESSION. The three
   assertions below used to name `id='dc-panel'` and `openPanel:dcOpenPanel, closePanel:dcClosePanel`
   — i.e. «the answer lives in a floating window of its own», which is exactly what 「ポップアップ
   二つあるのを辞めろ」 asked to stop. What #R261 was ABOUT is that the layer can be asked a question
   at all, and that it never states a capacity without its denominator; that is what is asserted now,
   and where the answer is drawn is #R264's ③ to decide. (Same lesson as ⑬ below, one round later.) */
/* ⚠⚠⚠ (#R265) …AND THE IN-VIEW SUMMARY ITSELF IS GONE — 「表示範囲内のものを表示する機能はいらない」.
   That is the FOURTH round in a row in which this test's subject moved (#R261 built it, #R264 moved
   its host, #R265 deleted it), and the third time the assertions had frozen the implementation
   rather than the property. What survives of #R261 is real and is what is asserted now: the layer
   can be filtered by class from its legend, and the two kinds of switch share ONE filter expression
   on ONE layer — two sets would be two filters and the last one written would silently win. */
test('R261 ⑫: the data-centre layer is filterable, through a single expression', () => {
  const s = read('js/datacenters.js');
  /* the classes and the operator rows are both understood, and both end up in one filter */
  assert.match(s, /const CLASS_KEYS=\['ai','cloud','colo','hpc','other'\];/);
  assert.match(s, /if\(outKinds\.length\) clauses\.push\(\['!',\['in',\['get','k'\],\['literal',outKinds\]\]\]\);/);
  assert.match(s, /if\(outOps\.length\) clauses\.push\(\['!',\['in',\['get','op'\],\['literal',outOps\]\]\]\);/);
  const setFilter = s.match(/GE\(\)\.layers\.setFilter\(/g) || [];
  assert.equal(setFilter.length, 1, 'exactly one place writes the filter');
  /* and the door the legend rows drive it through is still there */
  assert.match(s, /toggleKey\(k\)\{ if\(hidden\.has\(k\)\) hidden\.delete\(k\); else hidden\.add\(k\);/);
});

/* ── ⑬ the build stamps ─────────────────────────────────────────────────────────────────────────
   ⚠⚠ (#R262) THIS PINNED THE LITERAL 'R261' AND BROKE THE VERY NEXT ROUND. #R262 bumped the stamp,
   as every round must, and this test went red for doing the right thing — the sixth time in two
   rounds that a per-round check froze a literal instead of the property it meant (r202 ③c, r212 ①,
   r246 ③, r254 ⑦, r258 ⑩, and now this one, which was MINE).
   What a round can honestly assert about the stamps is that they AGREE and that they never go
   backwards past the round that wrote them; tests/r169-checks already owns the format and the
   monotonicity, so this keeps only the part that is about #R261: the two markers name one round,
   and it is not older than #R261. */
test('R261 ⑬: both build markers name one round, and it is not older than R261', () => {
  const s = read('index.html');
  const a = s.match(/window\.__imBuild='R(\d+)'/);
  const b = s.match(/window\.INTMAP_BUILD='\d{4}-\d{2}-\d{2}-R(\d+)'/);
  assert.ok(a && b, 'both build markers are present');
  assert.equal(a[1], b[1], 'the two markers name the same round');
  assert.ok(Number(a[1]) >= 261, `the build stamp went back to R${a[1]}`);
});
