/* ============================================================================
 *  shell-panels-tools-checks — the tool panels — seismic, sims, picker, draw, flight, water, volume, screenshot
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r206-checks.test.mjs
 *  tests/r231-checks.test.mjs
 *  tests/r252-checks.test.mjs
 *  tests/r296-checks.test.mjs
 *  tests/r302-checks.test.mjs
 *  tests/r203-checks.test.mjs
 *  tests/r207-checks.test.mjs
 *  tests/r170-checks.test.mjs
 *  tests/r186-checks.test.mjs
 *  tests/r221-checks.test.mjs
 *  tests/r253-checks.test.mjs
 *  tests/r249-checks.test.mjs
 *  tests/r196-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { appShell } from './app-source.mjs';
import { dispatchName } from './helpers/dispatch-spelling.mjs';   /* (atlas-one-declaration) a spelling reaches its case through the registry */
import { codeOnly as code, codeOnly as noComments, codeOnly as stripComments } from '../scripts/code-only.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R206 · from r206-checks.test.mjs ═══════════════════════ */
/* (#R206 — the round's own account of why these checks exist heads its other half, in tests/shell-test-infra-checks.test.mjs) */
{
const rd = read;

/* ── ② 「震源地を設置ボタンがずっと選択中になっている」 ────────────────────────────
   The invariant is a RULE about the panel rather than a colour: the accent FILL means "this is on",
   so no control may wear it unless it has an on state to show.
   ⚠ (#R212) THE BUTTON THIS WAS ABOUT NO LONGER EXISTS. 「震源地を設置と震源地を移動と、二つのボタンに
   分ける意味が全く分からない。」 — the ◎ ACTION and the ◎ MODE were merged into one segment, so the
   argument #R206 was having (an action wearing a state's fill) cannot recur: every ◎ in this panel is
   now a mode, and a mode's fill IS its state. The claim is therefore re-stated as the thing that
   still has to be true, rather than pinned to a button that was removed. */
/* spelling kept: browser script (js/seismic.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R206 ② every accent-filled control in the seismic panel has an on state', () => {
  const s = rd('js/seismic.js');
  assert.ok(!/class="sq-pick"/.test(s), 'the separate ◎ action button is gone (#R212)');
  /* the only helper that paints the accent fill is the segmented one, and it is driven by a state */
  /* (#R237) SEG became SEGC and the accent moved from an inline declaration into `.sq-seg.on` in
     the panel's own sheet. The claim is unchanged and is the one that matters: the accent fill is
     produced BY THE PREDICATE, so a control with no on-state cannot wear it. */
  assert.match(s, /const SEGC=\(on\)=>'sq-seg'\+\(on\?' on':''\)/,
    'SEG paints the accent only when it is given true');
  /* the empty ones are the prose in the comments above the helper ("SEG()"), not calls */
  const segUses = [...s.matchAll(/SEGC\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(segUses.length >= 2, 'the panel still has a segmented control');
  /* (#R236) the panel has three segmented controls now — the click modes (`clickMode`), the rupture
     stroke (`_fDrawing`) and the earthquake picker's source (`evSrc`). The claim is unchanged and is
     the thing worth checking: the fill is READ OFF STATE, never written as a literal true/false. */
  for (const u of segUses) {
    assert.doesNotMatch(u, /^(?:true|false|1|0|!0|!1)$/,
      'a segment’s fill must come from the mode, not from a literal: ' + u);
    assert.match(u, /^(?:clickMode===|!!_fDrawing$|evSrc(?:===|!==))/,
      'a segment’s fill must be one of the panel’s modes: ' + u);
  }
  /* and every path that moves the pick flag redraws, or the panel comes back showing the old state */
  assert.match(s, /function setPicking\(v\)\{[^}]*if\(opened&&panel\) render\(\)/,
    'changing the pick state re-renders the panel');
  assert.ok(!/function endPick\(\)\{ picking=false;/.test(s),
    'endPick goes through the setter too (it is the path where the panel stays on screen)');
});
}

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* ── ⑫ the screenshot has ONE coordinate system ─────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R231 screenshot: both layers are drawn into the container box, and capture-mode always comes off', () => {
  /* ⚠ (#R493) THE PICTURE MOVED, THE PROPERTY DID NOT. js/screenshot.js held the capture until this
     round put it in js/atlas-view-capture.js so that Atlas's view.inspect and the shutter compose the
     SAME screen. Reading the old file now would only prove a second copy had been left behind — the
     duplication whose consequence THIS test is about. Both halves are asserted where they live. */
  const src = read('js/atlas-view-capture.js');
  assert.match(src, /const cw = Math\.max\(1, cont\.clientWidth\), ch = Math\.max\(1, cont\.clientHeight\);/, 'the box is the container');
  assert.match(src, /out\.width = Math\.round\(cw \* scale\); out\.height = Math\.round\(ch \* scale\);/, 'the output is that box at the renderer density');
  assert.match(src, /ctx\.drawImage\(mapCv, 0, 0, mapCv\.width, mapCv\.height, 0, 0, out\.width, out\.height\)/, 'the map is mapped onto it explicitly');
  /* the class comes off on every path, in BOTH files: the capture owns it when it set it, and the
     button owns it across the flash and the encode, which outlive the picture */
  assert.match(src, /\} finally \{[\s\S]{0,240}classList\.remove\(CAPTURE_CLASS\)/, 'the capture clears what it set');
  const shot = read('js/screenshot.js');
  assert.match(shot, /finally\{ if\(CAPTURE_CLASS\) document\.body\.classList\.remove\(CAPTURE_CLASS\);/, 'and the button clears its own on every path');
  assert.match(read('js/atlas-view-capture.js'), /const CAPTURE_CLASS = 'capture-mode';/, 'one spelling of the class, in one place');
  /* the phone's own controls are controls */
  const css = read('css/intmap.css');
  for (const sel of ['.bm-square', '.bm-pop', '.m-scrim']) {
    assert.ok(css.includes('body.capture-mode ' + sel), `capture mode hides ${sel}`);
  }
});
}

/* ═══════════════════════ #R252 · from r252-checks.test.mjs ═══════════════════════ */
/* (#R252 — the round's own account of why these checks exist heads its other half, in tests/shell-map-labels-checks.test.mjs) */
{

/* ── ① THE PROGRESS BAR IS NOT A GRID CELL ───────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('#R252 ① the WorldPop progress bar is inserted after the action ROW, not inside it', () => {
  const tp = code(read('js/tool-panel.js'));

  /* the anchor must be the container, with the button only as the fallback for panels that have none */
  assert.match(tp, /closest\('\.rad-actions'\)\s*\)\s*\|\|\s*pb2/,
    'the progress box is anchored to #tp-pop-btn again — .rad-actions is display:grid, so it becomes a cell');
  assert.doesNotMatch(tp, /pb2\.parentNode\.insertBefore\(box/,
    'the box is inserted into the button’s parent, which is the three-column grid');

  /* the shape that made it a cell is still true of the markup, so the property above is load-bearing */
  assert.match(tp, /<div class="rad-actions">.*id="tp-pop-btn"/s,
    '#tp-pop-btn is expected to live inside .rad-actions — if that changed, re-derive this check');
  assert.match(code(read('css/intmap.css'), { lang: 'css' }), /\.rad-actions\{[^}]*display:grid/,
    '.rad-actions is no longer a grid — the reason the anchor matters is gone, re-read this check');

  /* a reused box starts from zero rather than showing the previous run’s full bar */
  assert.match(tp, /f\.style\.width='0%'/, 'a re-shown progress box keeps the last run’s fill width');
});

/* ── ⑧ THE SEISMIC PANEL OPENS CLEAR OF THE TWO THINGS THAT LIVE THERE ───────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('#R252 ⑧ the seismic panel’s default box clears the coord readout and the sidebar handle', () => {
  const sq = code(read('js/seismic.js'));
  assert.match(sq, /if\(window\.IntMapDevice\.compact\(\)\) return \{ left:16, top:80, cut:96 \};/,   /* (ui-layer-owner) the layout owner's answer, the same 768 px */
    'the phone default changed — nothing about the report is a phone (94vw + a shift right runs off the edge)');
  const d = /return \{ left, top:(\d+), cut:(\d+) \};/.exec(sq);
  assert.ok(d, 'the desktop default box is no longer a {left,top,cut} — re-derive this check');
  const [, dTop, dCap] = d.map(Number);
  assert.ok(dTop < 80, `the desktop default did not move UP (top=${dTop})`);
  /* bottom = top + (100dvh − cut) = 100dvh − (cut − top); the readout's top edge is 100dvh − 40 */
  assert.ok(dCap - dTop > 40 + 20,
    `the panel’s bottom edge lands ${dCap - dTop} px above the window foot — the readout occupies the last 40`);

  /* ⚠⚠ `left` IS MEASURED, NOT TYPED. Production verification caught the constant version clipping the
     OPEN sidebar's handle at 400–422 while clearing the collapsed one at 0–22 — one number cannot
     answer both, and `--sidebar-w` is user-resizable. */
  assert.match(sq, /const tg=document\.querySelector\('\.btn-toggle-sidebar'\), r=tg&&tg\.getBoundingClientRect\(\);/,
    'the default left is not read off the sidebar handle — a constant cannot clear both of its positions');
  assert.match(sq, /if\(r&&r\.width>0&&r\.right<60\) left=Math\.round\(r\.right\+30\);/,
    'the clearance rule changed — it must place the panel to the RIGHT of a handle that hugs the left edge');
  assert.match(sq, /if\(!panel\|\|panel\.hasAttribute\('data-dragged'\)\) return;/,
    'the default box would overwrite a position the reader dragged');
  assert.match(sq, /_applyDefBox\(\);\s*\n\s*panel\.style\.display='flex'/,
    'the default box is not re-applied on open — collapsing the sidebar later would bring the overlap back');

  /* the obstacles, as MEASURED at 1100×800 */
  const css = code(read('css/intmap.css'), { lang: 'css' });
  /* ⚠⚠ (#R488) THIS ASSERTION WAS GREEN WHILE THE RULE WAS DEAD. #R485 wrapped #map-container in
     `.map-column`, so `.sidebar.collapsed ~ .map-container` — a SIBLING combinator — stopped matching
     anything and the handle stayed 400 px out in the middle of the map with the sidebar shut. The
     byte-for-byte match below went on passing the whole time, because it reads the stylesheet and not
     the page. The NUMBER is still worth pinning here (the clearance above is derived from it); the
     claim that the rule REACHES the handle is now measured in a browser — tests/r159.spec.js R488. */
  assert.match(css, /:has\(> \.sidebar\.collapsed\) \.map-container \.btn-toggle-sidebar \{ left:0; \}/,
    'the collapsed sidebar handle no longer sits at x=0 — re-derive the clearance above');
  assert.match(css, /\.btn-toggle-sidebar\{[^}]*left:var\(--sidebar-w\)/,
    'the OPEN sidebar handle no longer sits at --sidebar-w — re-derive the clearance above');
  assert.match(css, /\.btn-toggle-sidebar\{[^}]*width:22px/, 'the sidebar handle is no longer 22 px wide');
  assert.match(css, /\.coord-readout\{[^}]*bottom:6px; left:6px/, 'the coord readout moved — re-derive the clearance above');
});
}

/* ═══════════════════════ #R296 · from r296-checks.test.mjs ═══════════════════════ */
/* (#R296 — the round's own account of why these checks exist heads its other half, in tests/shell-weather-packs-routing-checks.test.mjs) */
{
/* ═══ ⑨ THE RADIOACTIVE DISPERSION MODEL HAS THE PANEL #R264 MEASURED MISSING ════════════════
   「災害シミュレーターは4つのうち、放射性物質拡散シミュレーションを残し全削除。」 #R264 measured that the
   tools row calls `openPanel()` and that this module had never had one — so removing the wrapper that
   used to reach it would have left the whole feature behind a row that opens nothing. */
/* spelling kept: browser script (js/sims.js, js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R296 ⑨ the surviving simulator can be opened, and invents no numbers', () => {
  const sims = read('js/sims.js');
  assert.match(sims, /function openPanel\(ll\)\{/, 'the panel exists');
  assert.match(sims, /return \{ run, clear, isOpen, openPanel, closePanel,/, 'and is exported under the name the row presses');
  assert.match(read('js/map-ui.js'), /window\.IntMapRadiation&&window\.IntMapRadiation\.openPanel\(\)/, 'which is what the row presses');

  /* ⚠ NOTHING RUNS UNTIL THE READER PRESSES 実行, and every number is theirs. #R264's stated reason
     for NOT building this panel was that picking an isotope and a release rate on the reader's behalf
     is invented data — that argues against defaults that RUN, not against a panel. */
  const iGo = sims.indexOf("p.querySelector('.rad-go').onclick=");
  assert.ok(iGo > 0, 'the run button must be findable');
  const go = [null, sims.slice(iGo, iGo + 900)];
  assert.match(go[1], /if\(!site\) return;/, 'it refuses to run without a source the reader placed');
  assert.match(go[1], /source:uiSrc,isotope:uiIso,emitHours:uiEmit,hours:uiHours/, 'and passes only what the controls hold');
  assert.match(sims, /p\.querySelector\('\.rad-pick'\)\.onclick=\(\)=>startPick\(\);/, 'the source is placed on the map');
  /* the panel steps aside while the map is being tapped (#R196) */
  assert.match(sims, /const P=window\.IntMapPick;[\s\S]{0,400}P\.start\(\{ panel, hint,/, 'and uses the shared pick hand-off');
  /* it reports either kind of openness — a panel the reader opened, or a plume Atlas drew */
  assert.match(sims, /const isOpen=\(\)=>\{ if\(panelOpen\(\)\) return true;/, 'openness covers both');
});
}

/* ═══════════════════════ #R302 · from r302-checks.test.mjs ═══════════════════════ */
/* (#R302 — the round's own account of why these checks exist heads its other half, in tests/shell-weather-packs-routing-checks.test.mjs) */
{
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-four times; ask the question of the text that RUNS. */

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「地点を選ばないといけない系のツール、押したら勝手に地図中心を選択しているものとして結果を出すのを
 *   辞めろ。…普通の既存の赤メッセージ使ってください。…最初に地点選ぶ必要のないものまで全部最初に
 *   選ばせようとするな。」
 * ==========================================================================================*/

/* ── ⑫ the ask is the app's existing red toast, and nothing new was invented ─────────────────
   #R298 answered this sentence by inventing a pill on the shared bar; #R299 removed the pill and
   left the bar arming in silence. The reader then said which message they meant: the ordinary one,
   `.sat-toast` on `--info-mil` (#ff3b30) — the same red js/community.js has used since #R16 for
   「まず初めに場所を選ばせろ」. */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R302 ⑫ asking for a point uses the toast the app already has', () => {
  const ui = noComments(read('js/map-ui.js'));
  const ask = /function _askPoint\(run,id\)\{[\s\S]{0,2400}?\n    \}/.exec(ui);
  assert.ok(ask, '_askPoint must be findable');
  assert.match(ask[0], /\(HOST\.imToast\|\|HOST\.satToast\)\(ask\)/, 'the existing red toast carries the ask');
  /* ONE string for the bar and the toast, so nine languages cannot drift between them */
  assert.match(ask[0], /hint:ask/, 'the shared bar carries the very same sentence');
  assert.match(ask[0], /const ask=/, '…because there is only one of it');
  /* the pre-existing shared bar is still the mechanism, and no new chrome was added */
  assert.match(ask[0], /P\.start\(\{/, "#R196's shared picker is what arms");
  const css = read('css/intmap.css');
  assert.ok(!/im-pick-alt/.test(css) && !/im-pick-alt/.test(ui), 'the invented pill must not come back');
  assert.match(css, /\.sat-toast\{[^}]*--info-mil/, 'and the toast the ask uses is the red one');
});

/* ── ⑬ a panel with no point draws nothing rather than answering for the camera ──────────────
   `siteLL()` returned the camera's centre with a `mine:false` flag, and every reader of it printed
   the numbers anyway: sun elevation, azimuth, sunrise/noon/sunset, and real building shadows on the
   map, for a place nobody chose. */
/* spelling kept: browser script (js/sims.js, js/insolation.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R302 ⑬ the sun panel has no centre to fall back to', () => {
  const s = noComments(read('js/sims.js'));
  assert.match(s, /function siteLL\(\)\{ return hasSite\(\)\?\{ lng:\+site\.lng, lat:\+site\.lat \}:null; \}/,
    'no point means no point');
  assert.ok(!/siteLL[\s\S]{0,300}?getCenter\(\)/.test(s), 'the centre fallback must not come back');
  assert.match(s, /function askSite\(\)\{ endPick\(\);/, 'the panel can ask for one');
  assert.match(s, /if\(!hasSite\(\)\) askSite\(\);/, '…and does, when it is opened without one');
  /* …and the panel never asks the raster to draw without one */
  assert.match(s, /function drawShadows\(\)\{[\s\S]{0,300}?const c=siteLL\(\);[\s\S]{0,120}?if\(!c\)\{ updatePanel\(null\);/,
    'no site means no numbers AND no cast shadows — the polygons follow the sun at the observer');
  /* ⚠ (#R302) BUT THE VIEW-SCOPED RASTER KEEPS THE VIEW CENTRE, and that is not the same defect.
     `IntMapInsolation.shade()` / `dayShadow()` shade THE GRID THAT IS ON SCREEN; the sun moves less
     than that grid's angular resolution across one viewport, so the centre is 「the sun over the area
     you are looking at」. Taking it away forces a point on a product that does not need one — the
     other half of 「最初に地点選ぶ必要のないものまで全部最初に選ばせようとするな」 — and it breaks
     tests/r176 ⑥, which shades Mt Fuji from the view alone. */
  const ins = noComments(read('js/insolation.js'));
  assert.match(ins, /const _sunAt=\(o\)=>\{[\s\S]{0,200}?getCenter\(\)/,
    'the view-wide raster still reads the sun over the view');
  assert.match(ins, /if\(a&&isFinite\(a\.lng\)&&isFinite\(a\.lat\)\) return \{ lat:\+a\.lat, lng:\+a\.lng \};/,
    '…but a point it was GIVEN always wins over the view');
});
}

/* ═══════════════════════ #R203 · from r203-checks.test.mjs ═══════════════════════ */
/* (#R203 — the round's own account of why these checks exist heads its other half, in tests/shell-launch-defaults-checks.test.mjs) */
{
const rd = read;

/* ── ⑥ THE MESH ────────────────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/seismic.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R203 ⑥ the shaking mesh is finer than the round before, on both classes of device', () => {
  const s = rd('js/seismic.js');
  /* ⚠ (#R204) the fine grid is no longer one number: it is a cell size with a floor and a ceiling
     (see js/seismic.js). "Finer than the round before" is a claim about the FLOOR — the coarsest
     grid the code can pick — which is what #R203's single number was. */
  const fine = /const CELL_KM=[\d.]+, N_MIN=\(_mob\?(\d+):(\d+)\), N_MAX=\(_mob\?(\d+):(\d+)\);/.exec(s);
  /* (#R245) the far grid is declared once, beside the layer, because buildField now snaps its box
     onto it — same numbers, hoisted out of buildFar so two functions can agree on them.
     ⚠ (#R668) and it is the DEVICE that picks the arm now, not the window width: the numbers below
     are unchanged, so this matches the two branches (the fact) and only requires that whatever asks
     the question be the predicate js/mem-budget.js owns. */
  const far = /const FAR_N=\(\)=>\((?:_phoneDev\(\)|window\.IntMapMemBudget\.deviceIsPhone\([^()]*\))\?(\d+):(\d+)\);/.exec(s);
  assert.ok(fine, 'the fine grid is still declared where it was');
  assert.ok(far, 'the far grid is still a two-branch phone/desktop constant decided by the device');
  assert.ok(Number(fine[2]) >= 640, `desktop fine mesh floor is ${fine[2]}, #R203 shipped 640`);
  assert.ok(Number(fine[1]) >= 288, `mobile fine mesh floor is ${fine[1]}, #R203 shipped 288`);
  assert.ok(Number(fine[4]) >= Number(fine[2]), 'the desktop ceiling is at least the floor');
  assert.ok(Number(fine[3]) >= Number(fine[1]), 'the mobile ceiling is at least the floor');
  assert.ok(Number(far[2]) >= 1024, `desktop far mesh is ${far[2]}, #R202 shipped 768`);
  assert.ok(Number(far[1]) >= 512, `mobile far mesh is ${far[1]}, #R202 shipped 384`);
  /* ⚠ (#R668) "both classes of DEVICE" is only true while the `_mob` the fine grid reads is the
     device predicate — it was the width media query, which reads a phone in landscape as a desktop
     and hands it the 2,560² mesh the phone cannot hold. */
  assert.match(s, /_mob=_phoneDev\(\)/, 'the fine grid asks the device, not the window width');
});
}

/* ═══════════════════════ #R207 · from r207-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R207 source-level invariants
 * ----------------------------------------------------------------------------
 *  ⚠ #R205's lesson, applied: PIN THE INVARIANT, NOT THE SHAPE. Five of that round's pins broke
 *  because they were written as "this literal appears" rather than "this relationship holds", and a
 *  literal is exactly what the next round edits. Every assertion below is a RELATION between two
 *  things in the source — an order, a guard, a pairing — so that a rewrite that preserves the
 *  behaviour keeps passing and a rewrite that loses it fails.
 * ==========================================================================*/
{
/* ── ③ a pick makes the panel click-through rather than removing it ────────────────────────────── */
/* spelling kept: browser script (js/map-pick.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ③ IntMapPick ghosts the requesting panel instead of hiding it', () => {
  const s = read('js/map-pick.js');
  assert.ok(/pointerEvents='none'/.test(s), 'the panel stops taking the pointer');
  assert.ok(!/el\.style\.display='none'/.test(s), 'and it is no longer removed from the screen');
  /* the restore must put back exactly what it changed */
  assert.ok(/_unghost\(s\.panel,s\.prevStyle\)/.test(s), 'teardown restores the two properties it set');
});

/* ── ④ drawing owns the pointer while a rupture is being drawn ─────────────────────────────────── */
/* spelling kept: browser script (js/seismic.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ④ the seismic map-click yields while the free-draw is live', () => {
  const s = read('js/seismic.js');
  const m = /function onClick\(e\)\{ if\(([^)]*)\) return;/.exec(s);
  assert.ok(m, 'onClick opens with a guard');
  assert.ok(/_fDrawing/.test(m[1]), 'and the guard includes the drawing state');
  /* the capture is driven by the tool, so no button press is required */
  assert.ok(/onFinish:\(g\)=>\{ _fCapture\(g/.test(s), 'the drawn loop is captured from DrawTool.onFinish');
});

/* ── ⑤ DrawTool announces a finished stroke ────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/map-tools.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ⑤ DrawTool fires onFinish after the stroke is done, and clears it on exit', () => {
  const s = read('js/map-tools.js');
  const fin = s.slice(s.indexOf('function finish()'), s.indexOf('function finish()') + 1600);
  const doneAt = fin.indexOf("state='done'");
  const fireAt = fin.indexOf('_onFinish(');
  assert.ok(doneAt > 0 && fireAt > doneAt, 'the callback fires AFTER the state is done (so currentGeometry does not re-enter finish)');
  assert.ok(/exit\(\)\{[^}]*_onFinish=null/.test(s), 'exit() drops the subscriber');
});
}

/* ═══════════════════════ #R170 · from r170-checks.test.mjs ═══════════════════════ */
// R170 source-level regression checks.
//
// The round's centrepiece is a one-line conceptual fix with a very wide blast radius: the app had
// ~80 places asking "may I add a source/layer now?" and answering with map.isStyleLoaded(), which in
// MapLibre means "style parsed AND every source cache loaded". While a user pans, that is false most
// of the time (measured: 12 of 14 samples over a 12 s pan), so a freshly ticked layer waited for an
// idle frame — measured toggle-ON → painted at 4497 ms / 3171 ms when the map was busy vs 189 ms when
// it happened to be idle. Same click, wildly different latency: the reported
// 「レイヤーをオンオフしても、時間差で表示されたり表示されなかったりする」. After the fix: 95 / 71 / 107 ms.
//
// These checks pin the things that would silently regress:
//   · canDraw() exists, is a hoisted declaration, and never answers from isStyleLoaded() ALONE;
//   · no js/ module has drifted back to a raw isStyleLoaded() add-guard;
//   · every module that calls _imCanDraw() declares it inside the SAME factory (the trap #R163's
//     scope checker caught: these files hold several factories and one helper does not cover them);
//   · the defaults the user asked for are actually the defaults (ticker off, workspace opt-in,
//     airborne flight start);
//   · the 3-D volume tool is wired end to end — menu item, i18n in five languages, Atlas action AND
//     its SYS catalogue entry (an uncatalogued action does not exist to the planner — the #R115 rule);
//   · the Companies vintage constants exist and every displayed metric has an as-of branch.
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language (see js/lang-registry.js). Asking this
   reader for js/i18n.js therefore hands back the whole table, which is what these assertions mean. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const R = (f) => (String(f).endsWith('js/i18n.js')
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js — so INDEX
   is the concatenation. Pointed at the new index.html these assertions would pass vacuously.
   JS_FILES stays the MODULE list: js/app-body.js is the page's own program, not a module. */
const INDEX = appShell(new URL('../', import.meta.url));

/* strip /* … *\/ and // comments so "the code says X" is never satisfied by prose about X */

/* spelling kept: browser script (js/flight-sim.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 flight sim: airborne start is the default and the globe is forced', () => {
  const fs = R('js/flight-sim.js');
  assert.match(fs, /const state=\{ ac:selAc, loc:[^}]*mode:'air' \}/, 'the pre-flight screen must default to an airborne start');
  assert.match(fs, /<button class="fss-m on" data-m="air">/, 'the Airborne button must carry the selected class');
  assert.ok(!/<button class="fss-m on" data-m="ground">/.test(fs), 'the runway button must no longer be preselected');
  assert.match(fs, /IntMapOS\.exec\('view\.proj\.globe',\{source:'flightsim'\}\)/, 'start() must switch to the globe');
  /* (#R171) The restore is UNCONDITIONAL now, so the old `pv.proj!==HOST.proj` guard is gone on purpose:
     entry also sets a projection SPEC (the all-zoom globe) that no app state records, and the guard would
     skip the restore for a pilot who was already on the globe — leaving the normal map permanently changed.
     The claim this line makes ("stop() puts BOTH the flat and the globe view back") is unchanged and now
     stronger; tests/r171-checks.test.mjs asserts the guard's absence, and tests/r171.spec.js flies it. */
  assert.match(fs, /pv\.proj==='flat'\?'view\.proj\.flat':'view\.proj\.globe'/, 'stop() must restore the pre-flight projection in BOTH directions');
});

/* spelling kept: browser script (js/flight-sim.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 flight sim: "fly again" resumes from where the flight ended', () => {
  const fs = R('js/flight-sim.js');
  assert.match(fs, /lastEnd=\{ lng:\+st\.lng, lat:\+st\.lat, hdg:_fsHdg\(\)/, 'the end point + heading must be recorded');
  assert.match(fs, /localStorage\.setItem\('intmap_fs_last'/, 'and persisted so a later launch can offer it');
  assert.match(fs, /fromEnd:!!lastEnd/, '"Fly again" must pass the end point through to the pre-flight screen');
  assert.match(fs, /state\.loc==='__last'&&lastEnd/, 'the start-location select must honour the last end point');
});

/* ---------------------------------------------------------------- 3-D volume tool */

/* spelling kept: browser script (js/atlas-console.js, js/tool-panel.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 the 3-D volume tool is wired from menu to renderer', () => {
  /* (#R175) the tag became an import in the Vite entry (src/main.js), which appShell() includes.
     (#R311) …and then an ON-DEMAND import: the tool is 48 kB that only a session which opens
     Measure ▸ 3-D volume needs. appShell() includes js/lazy-modules.js, so both halves of the
     question this asks — is it loaded at all, is its factory instantiated exactly once — are still
     asked of the file that now answers them. ⚠ The literal single-quoted `./` form is not styling:
     scripts/static-checks.mjs sees no other shape (js/lazy-modules.js's header, gate 1). */
  assert.match(INDEX, /import\('\.\/volume3d\.js'\)/, 'the module must be loaded by the on-demand loader');
  assert.doesNotMatch(INDEX, /import '\.\.\/js\/volume3d\.js';/, 'and not ALSO by the Vite entry — it would be in the boot bundle regardless');
  /* (module-graph) the loader hands mount() the namespace its own import() resolved to — `m` */
  assert.match(INDEX, /window\.IntMapVolume3D=m\.volume3d\((IM_HOST)\)/, 'and instantiated exactly once');
  assert.match(INDEX, /id="btn-tool-volume"/, 'the Measure menu needs the entry');
  assert.match(INDEX, /setTool\('volume'\)/, 'which activates the tool');
  /* the two doors: the Measure-menu button (which the mobile tile and Atlas's clickId both reach
     through) and the Atlas `volume3d` action, which reads the global itself */
  assert.match(INDEX, /IntMapLazy\.need\('volume3d'\)\.then\(\(\)=>\{ setTool\('volume'\)/,
    'the Measure-menu button must fetch the tool before switching to it — the panel reads the global synchronously');
  assert.match(stripComments((R('js/atlas-console.js') + '\n' + capsSource())), /await window\.IntMapLazy\.need\('volume3d'\);/,
    'the Atlas volume3d action must fetch the tool before reading window.IntMapVolume3D');
  /* (#R171) release() = clear() plus handing the drag gesture back, now that the freehand / circle /
     rectangle shapes take the drag while they are armed. Closing the tool must do both. */
  assert.match(INDEX, /toolMode==='volume'&&window\.IntMapVolume3D\) window\.IntMapVolume3D\.release\(\)/, 'exitTool must drop the box');
  const tp = R('js/tool-panel.js');
  assert.match(tp, /HOST\.toolMode==='area'\|\|HOST\.toolMode==='volume'/, 'the footprint must preview like an area ring');
  assert.match(tp, /volume:icon\('cube'\)\+' '\+HOST\.t\('vol3dTool'\)/, 'the panel needs a localized title (its glyph is js/icons.js «cube» — icon-system)');
  assert.match(tp, /id="v3d-base"/); assert.match(tp, /id="v3d-top"/);
});

/* spelling kept: browser script (js/volume3d.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 the 3-D volume module talks only to IntMapGeoEngine, never to the raw map', () => {
  const src = stripComments(R('js/volume3d.js'));
  // `map` is the factory's first parameter; using it would couple the tool to MapLibre
  assert.ok(!/\bmap\.(add|get|set|query|on|off|remove)\w*\(/.test(src),
    'js/volume3d.js must not call the MapLibre map directly — that is the point of the engine facade');
  assert.match(src, /GE\(\)\.coords\.terrainElevation/, 'the ground read must go through the engine');
  assert.match(src, /E\.layers\.addExtrusion/); assert.match(src, /E\.layers\.setExtrusionRange/);
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('#R170 the engine contract declares real metric extrusion and the canDraw/ready split', () => {
  assert.match(INDEX, /extrusion3d:true/, 'MapLibre capabilities must advertise metric extrusion');
  assert.match(INDEX, /canDraw\(\)\{ if\(this\.styleReady\(\)\) return true; return this\.styleParsed\(\); \}/   /* (#R178) the engine answers it itself instead of bouncing off window.IntMapCanDraw */, 'the adapter must implement canDraw');
  /* (#R179) the facade is a FUNCTION of an adapter now (engineFacade(A)), so the bindings read
     `A().x()` rather than `_adapter.x()` — an additional view has to get the same object, and it
     cannot if the object closes over the engine's own adapter. The claim is unchanged. */
  assert.match(INDEX, /canDraw:\(\)=>A\(\)\.canDraw\(\)/, 'and the facade must expose it');
  assert.match(INDEX, /addExtrusion\(d,before\)/); assert.match(INDEX, /setExtrusionRange\(id,baseM,topM\)/);
  const cesium = INDEX.match(/const CESIUM_CONTRACT=[^;]+;/)[0];
  assert.match(cesium, /extrusion3d:true/, 'the Cesium contract must stay in sync with the capability list');
});

/* spelling kept: browser script (js/volume3d.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 the volume tool compensates for 3-D terrain instead of trusting the raw numbers', () => {
  const src = R('js/volume3d.js');
  assert.match(src, /const off=\(has3DTerrain\(\)&&groundM!=null\)\?groundM:0;/,
    'with terrain on, the DEM height must be subtracted so the band stays ABOVE SEA LEVEL');
  assert.match(src, /function chaseGround\(\)/, 'the DEM answers 0 before its tiles land — the reading must be chased');
  assert.match(src, /function wire\(n\)/, 'the engine listeners must be wired lazily (the engine does not exist at construction time)');
});

/* spelling kept: browser script (js/atlas-console.js, js/atlas-catalog-text.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 Atlas can drive the 3-D volume, and the action is in the SYS catalogue', () => {
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const atlas = (R('js/atlas-console.js') + '\n' + capsSource()) + '\n' + R('js/atlas-catalog-text.js');
  assert.ok(capabilityEntry('volume3d'), 'the dispatch action must exist');
  assert.equal(dispatchName('volume'), 'volume3d', '…and `volume` reaches it through its row (atlas-one-declaration)');
  assert.match(atlas, /\{"type":"volume3d","place":str/, 'and be catalogued — an uncatalogued action does not exist to the planner (#R115)');
  assert.match(atlas, /"name":"measure"\|"radius"\|"draw"\|"volume"/, 'the tool action must accept the volume tool too');
});

/* spelling kept: browser script (js/locales/_langs.js, js/i18n.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 the 3-D volume tool is localized in every registered language', () => {
  /* ⚠ (#R223) EVERY REGISTERED LANGUAGE, not the number five — a sixth (zh) landed and these
     assertions were about coverage, never about the count. `LANGS` is the one list (js/lang-registry.js). */
  const NL = (R('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"[a-z-]+"/g) || []).length;   /* (#R232) the GENERATED language list — the registry's rows stopped being the list when a language became one file */
  const i18n = R('js/i18n.js');
  for (const key of ['vol3dBtn', 'vol3dTool']) {
    const n = (i18n.match(new RegExp(key + ':', 'g')) || []).length;
    assert.equal(n, NL, `${key} must be defined in every language (found ${n} of ${NL})`);
  }
});
}

/* ═══════════════════════ #R186 · from r186-checks.test.mjs ═══════════════════════ */
/* (#R186 — the round's own account of why these checks exist heads its other half, in tests/shell-sky-space-checks.test.mjs) */
{
/* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  : fs.readFileSync(path.join(ROOT, p), 'utf8'));

/* spelling kept: browser script (js/terrain-water.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R186 water: the solver states its model, and the tracer states its endings', () => {
  const src = read('js/terrain-water.js');
  assert.match(src, /MFD_P\s*=\s*1\.1/, 'Freeman multiple-flow-direction exponent');
  /* ══ ⚠⚠⚠ (#R267) THE TWO-MODEL ANSWER IS GONE, SO THE ASSERTIONS ABOUT ITS SECOND HALF ARE ═══
     「上流から下流まで全部同じモデル、描画にしろと言っている。」 — the third time that instruction has
     been given (#R211, #R255, #R267). The water beyond the working rectangle is now the SAME
     shallow-water field on the SAME lattice, so the walk, its resolution ladder, its per-window
     routing, its chain, its cross-sections and its escalation no longer exist to be pinned. What
     each round actually ESTABLISHED is kept and re-asserted against the model that replaced them.
     ⚠ This is the seventh consecutive round in which the previous rounds' tests made a correct
     change look like a regression ([[intmap-recurring-lessons]]): assert the property, not the text.
  */
  /* ⚠ (#R267) ONE MODEL, SO ONE NAME — and the result still declares what produced it, which is
     what this assertion is for. #R265 made it a ternary between the integration and the routing;
     there is nothing to choose between now. */
  assert.match(src, /model:'local-inertial shallow water \(Bates 2010; q-centred de Almeida 2012; Manning n='/,
    'the result names the model that produced it');
  assert.ok(!/model:steady\?/.test(src), 'and there is no second model to switch to');
  /* the sea test cannot be an elevation test — Death Valley proved that */
  assert.match(src, /function seaCheck/);
  assert.match(src, /fraction/, 'the sea test needs the area fraction as well as edge contact');
  /* ⚠ THE ENDINGS ARE THE WATER'S NOW. 「水は流れなくなる地点または海に到達した地点まで」 names two,
     and the model answers both by doing them: it reaches the sea, or it stops advancing. The
     book-keeping endings of the walk (a window budget, a tile budget, a step cap) went with the
     walk; what replaced them is the lattice budget, which is reported in the same place. */
  for (const end of ['sea', 'still', 'extent', 'running']) {
    assert.ok(src.includes(`case '${end}'`) || src.includes(`end='${end}'`), `the ending '${end}' must be reachable and labelled`);
  }
});

/* spelling kept: browser script (js/terrain-water.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R186 water: DEM roughness is not a pond', () => {
  /* Raising the grid 256 → 384 made every one-cell dip qualify as a depression; tests/r176 measured
     a 1-cell "basin" of 993 m³ and 0.43 m on ground that is flat. A pond is WIDE or DEEP. */
  assert.match(read('js/terrain-water.js'),
    /if\(cells\.length<3&&\(spill-surf\[cells\[0\]\]\)<1\.0\)\{ cells\.forEach\(c=>\{ depId\[c\]=-1; \}\); continue; \}/);
});
}

/* ═══════════════════════ #R221 · from r221-checks.test.mjs ═══════════════════════ */
/* (#R221 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
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

/* ── ② THE INTENSITY FIELD MUST NOT EVICT ITS OWN DEM TILES ───────────────────────────────────
   The concentric-circle report. One field asks for up to 520 tiles (1,600 since #R216) and the
   shared cache holds 140 on a phone, so without a pin the picture throws away what it just
   fetched and every cell falls back to one site class = rings. */
/* spelling kept: browser script (js/map-readout.js, js/seismic.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ② the DEM cache exempts pinned tiles, and the field pins + releases them', () => {
  const ro = read('js/map-readout.js');
  assert.ok(/_demHold/.test(ro), 'map-readout must have a hold set');
  assert.ok(/_demHold\.has\(k\)/.test(ro), 'the trim must skip pinned tiles');
  assert.ok(/function releaseDEMHold/.test(ro), 'a pin with no release is a leak');
  assert.ok(/demTilePoints/.test(ro), 'the warm-up must be able to ask for one point per TILE');

  const se = read('js/seismic.js');
  /* (#R223) …and the same grid, minus the tiles whose whole footprint the bundled land mask says is
     sea — the field never paints the ocean, so it must not wait for it either. */
  assert.ok(/demTilePoints\(W,Ss,E,Nn,z,_keepTile\)/.test(se), 'the field must warm the tile grid, not a fixed lattice');
  /* (#R671) THE PIN IS A LEASE NOW, so this stopped being a question about the literal `true` and
     became a question about whether the warm-up asks for a pin AT ALL. Asking it of every call —
     rather than of one spelling — is also what catches a fourth warm-up added without one. */
  const warms = se.match(/warmDEMTiles\(/g) || [];
  const held = (se.match(/warmDEMTiles\([^;]*?,\s*(true|fldLease\|\|true)\)/g) || []).length;
  assert.ok(warms.length >= 3, 'the field warms the far window, the main field and its retry passes');
  assert.ok(held >= 3, 'the field must warm with a hold — a pin, not a bare fetch');
  assert.ok(/releaseDEMHold/.test(se), 'the field must release the pin');
  /* …and the release must be in the `finally`, or an aborted build pins tiles for ever */
  const fin = se.indexOf('} finally {');
  assert.ok(fin > 0 && se.slice(fin, fin + 200).includes('releaseDEMHold'),
    'releaseDEMHold must be in the finally block — an aborted build must not leave tiles pinned');
});

/* spelling kept: browser script (js/map-readout.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ② a failed elevation tile expires instead of poisoning the session', () => {
  const ro = read('js/map-readout.js');
  const i = ro.indexOf('img.onerror');
  assert.ok(i > 0);
  assert.ok(ro.slice(i, i + 260).includes('_demCache.delete(key)'),
    'a null (failed) tile must be cleared later so the next field can ask again');
});

/* ── ⑦ THE FLIGHT SIMULATOR ON A PHONE ───────────────────────────────────────────────────── */
/* spelling kept: browser script (js/flight-sim.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ⑦ the rotate gate has nothing to confirm and pauses while it is up', () => {
  const fs = read('js/flight-sim.js');
  assert.ok(/#fs-gate/.test(fs), 'the gate must exist');
  const i = fs.indexOf('function _syncRotate()');
  assert.ok(i > 0);
  const body = fs.slice(i, i + 2000);
  assert.ok(/_portrait\(\)/.test(body), 'it must only appear in portrait');
  assert.ok(/paused\s*=\s*true/.test(body) || /_gatePaused\s*=\s*true/.test(body),
    'the aircraft must not fly unseen behind the gate');
  assert.ok(/_gatePaused/.test(body), 'the reader\'s OWN pause must be remembered, not overwritten');
  /* the escape hatch: a phone with rotation locked must not be a dead end */
  assert.ok(/fs-gate-x/.test(fs) && /_gateOff/.test(fs), 'there must be a way to continue upright');
});

/* spelling kept: browser script (js/flight-sim.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ⑦ the landscape deck does not cross the middle of the screen', () => {
  const fs = read('js/flight-sim.js');
  assert.ok(!/grid-template-columns:repeat\(8,50px\)/.test(fs),
    'an 8-wide row at 50 px is 435 px through the centre of a 844 px screen — that was the report');
  const i = fs.indexOf("@media(hover:none) and (orientation:landscape)");
  assert.ok(i > 0);
  const body = fs.slice(i, i + 2600);
  assert.ok(/grid-template-columns:repeat\(2,54px\)/.test(body), 'the deck must be a 2-column block on the left');
  assert.ok(/fs-acbadge\{left:calc\(186px/.test(body), 'the badge must be clamped and off the centre line');
});
}

/* ═══════════════════════ #R253 · from r253-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R253 source checks
 * ----------------------------------------------------------------------------
 *  Seven reports. Each check is written as «the defect cannot come back», not «the fix is still
 *  typed here», wherever the difference is expressible in the source.
 *
 *  ① the indeterminate progress sweep is declared with LONGHANDS, so `!important` cannot outrank
 *     the animation that moves it;
 *  ② a small place label's boundary is looked up inside the click before it is looked up on the
 *     planet;
 *  ③ the place popup's copy button says WHAT it copies, in every language the app ships;
 *  ④ an open sidebar out-ranks the floating map panels, and something moves that rank on a pointer;
 *  ⑤ the intensity column sits beside the distance, and a place name has a floor to be legible on
 *     one line;
 *  ⑥ loading an earthquake starts its clock at zero, and the unload button is not a circle;
 *  ⑦ the CJK face is chosen per LABEL and the renderer is actually told — the stack a symbol layer
 *     asks for is the family list MapLibre rasterises it with.
 *
 *  ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
 *  [[intmap-recurring-lessons]] E has caught ten rounds writing a check that trips on its own
 *  explanation of the defect. (This file's own prose names `border-radius:50%` and `Noto Sans
 *  Regular`, and #R252's own notes are still in the files being read.)
 * ==========================================================================*/
{

/* ── ① THE SWEEP ────────────────────────────────────────────────────────────────────────────────
   ⚠ (#R254) THIS CHECK GUARDED A MODE THAT NO LONGER EXISTS. #R253 measured that the indeterminate
   band was frozen because `background: … !important` outranks a CSS animation, and asserted the
   longhands that unfroze it. The NEXT report was 「勝手にほかの進捗バーと違うUIにするな」 — a bar
   nothing else in the app looks like is the defect whether it moves or not — so #R254 removed the
   mode outright (js/sims.js tiles every WorldPop sum, which gives the bar a real fraction for every
   area). The property worth keeping is therefore the OPPOSITE one, and it is asserted in
   tests/r254-checks.test.mjs ①: no `.indet` rule, no sweep keyframes, no `.indet` class from the
   controller. Nothing about #R253's finding is lost — the cascade rule it discovered is written
   down where the rule used to be. */

/* ── ② THE SMALL PLACE IS ASKED FOR WHERE IT IS ──────────────────────────────────────────────── */
/* spelling kept: browser script (js/map-tools.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R253 ② the boundary lookup asks the neighbourhood before it asks the planet', () => {
  const mt = code(read('js/map-tools.js'));

  assert.match(mt, /bounded=1/,
    'the tight pass is gone: an unbounded viewbox is a HINT, so a 丁目 or a Kiez loses its ten result '
    + 'slots to bigger namesakes and its own polygon is never in the answer to be chosen from');
  /* the tight pass must come FIRST — a fallback that runs after the wide one changes nothing */
  const tight = mt.indexOf('bounded=1'), wide = mt.search(/const d=8,\s*vb=/);
  assert.ok(tight > -1 && wide > -1 && tight < wide, 'the bounded pass no longer runs before the wide one');
  /* #R59's rule survives: no polygon means nothing is drawn, never a box around a point */
  assert.match(mt, /if\(!polys\.length\) return null;/, 'the «no rectangle fallback» guard is gone');
  assert.doesNotMatch(mt, /boundingbox.*=>.*geojson\s*=\s*\{type:'Polygon'/, 'a bbox rectangle is being synthesised');
});

/* ── ⑤ THE TABLE ─────────────────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/seismic.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R253 ⑤ the intensity column follows the distance, and the place name has a floor', () => {
  const sq = code(read('js/seismic.js'));

  /* header order: Place, Δ km, intensity, then the arrivals */
  const head = /<thead><tr[^>]*>([\s\S]*?)<\/tr><\/thead>/.exec(sq);
  assert.ok(head, 'the per-place table head is gone — re-derive this check');
  const cols = head[1].split('<th').slice(1);
  assert.ok(/Δ /.test(cols[1]), 'the second column is no longer the distance');
  assert.ok(/Shindo|MMI/.test(cols[2]), 'the intensity column is not third — 「MMI/JMAをΔ kmの右に」');
  assert.ok(/>P</.test(cols[3]), 'the P arrival should follow the intensity');

  /* body order matches the head — a reorder of one alone is a silently wrong table */
  const row = /return '<tr><td class="sq-st-nm"[\s\S]*?<\/tr>'/.exec(sq);
  assert.ok(row, 'the per-place row is gone — re-derive this check');
  const cells = row[0].split('<td').slice(1);
  assert.ok(/a\.km/.test(cells[1]), 'the second cell is no longer the distance');
  assert.ok(/iCell\(/.test(cells[2]), 'the intensity chip is not in the third cell — head and body disagree');

  /* the name is one line, and it has room to be one. The declaration is written across a string
     concatenation, so the whole run up to the closing brace is what has to be read. */
  const nm = /\.sq-st-nm\{([\s\S]*?)\}/.exec(sq);
  assert.ok(nm, 'the .sq-st-nm rule is gone');
  const decl = nm[1].replace(/['"+\s]+/g, '');
  assert.match(decl, /white-space:nowrap/, 'the place name can wrap again');
  assert.match(decl, /text-overflow:ellipsis/, 'a name too long for the column would be cut with no sign of it');
  const min = /min-width:(\d+)px/.exec(decl);
  assert.ok(min && +min[1] >= 70,
    'the name column has no floor: `width:100%;max-width:0` makes it the only compressible column, so it '
    + 'absorbs the whole deficit and every row becomes an ellipsis (measured 35 px before the floor)');
});

/* ── ⑥ THE CLOCK AND THE BUTTON ─────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/seismic.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R253 ⑥ a newly loaded earthquake starts at t = 0, and its unload button is square', () => {
  const sq = code(read('js/seismic.js'));

  const fn = /function applyEvent\(id\)\{[\s\S]*?\n    \}/.exec(sq);
  assert.ok(fn, 'applyEvent is gone — re-derive this check');
  assert.match(fn[0], /tSec=0/, 'loading an earthquake leaves the clock where the previous one was scrubbed to');
  /* the two routes that already did it must not have lost it */
  assert.match(/function clearEvent\(\)\{[\s\S]*?\n    \}/.exec(sq)[0], /tSec=0/, 'clearEvent no longer resets the clock');
  assert.match(/function applyReal\(f\)\{[\s\S]*?\n    \}/.exec(sq)[0], /tSec=0/, 'applyReal no longer resets the clock');

  const x = /'\.sq-ev-x\{([^']*)'/.exec(sq);
  assert.ok(x, 'the .sq-ev-x rule is gone');
  const r = /border-radius:(\d+)(px|%)/.exec(x[1]);
  assert.ok(r && r[2] === 'px' && +r[1] <= 12, `the unload button is ${r ? r[0] : 'unset'} — 「丸ではなく四角に」`);
});
}

/* ═══════════════════════ #R249 · from r249-checks.test.mjs ═══════════════════════ */
/* (#R249 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-audits-checks.test.mjs) */
{

/* ── ① ONE PICTURE, ONE CELL ────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/seismic.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R249 ① the far seismic raster is handed the fine field\'s cell, and the ceiling is a cell count', () => {
  const s = code(read('js/seismic.js'));

  /* the fine grid must be SOLVED BEFORE the far window, or the far window cannot copy it */
  const iGrid = s.indexOf('const CELL_KM=1.0, N_MIN=');
  const iFar = s.indexOf('farWindow(C0,rEdgeSurf+rupMaxKm');
  assert.ok(iGrid > 0, 'the fine grid rule is still declared in one place');
  assert.ok(iFar > 0, 'buildField still builds the far window');
  assert.ok(iGrid < iFar,
    'the fine grid must be solved BEFORE farWindow — otherwise the far raster cannot be handed the cell it has to match');

  /* …and it is actually handed it, rather than the two being tuned to look alike */
  assert.match(s, /farWindow\(C0,\s*rEdgeSurf\+rupMaxKm\s*,\s*spanKm0\/N\)/,
    'buildField no longer passes the fine cell to farWindow — the seam step goes back to being a coincidence');
  assert.match(s, /function farWindow\(C0,\s*rKm,\s*wantCellKm\)/, 'farWindow no longer accepts a target cell');

  /* the target is honoured, never coarser than #R248's budget, and bounded by a CELL COUNT
     (the transient RGBA canvas) rather than by a taste */
  assert.match(s, /Math\.min\(Math\.sqrt\(sx\*sy\)\/NF,\s*cellWant\)/,
    'the far cell is no longer min(budget, wanted) — it must never be coarser than #R248 already achieved');
  assert.match(s, /FAR_MAX_CELLS\s*=\s*\(\)\s*=>/, 'the ceiling is not declared as a cell count');
  assert.match(s, /if\(sx\*sy\/\(cell\*cell\)>maxCells\)/, 'the ceiling is not applied');

  /* the achieved ratio is REPORTED — a ceiling that is silently exceeded is how this report
     ([[intmap-recurring-lessons]] F) comes back a fourth time */
  assert.match(s, /step:\(wantCellKm>0\)\?\+\(cellKm\/wantCellKm\)\.toFixed\(2\):null/,
    'farWindow no longer reports the ratio it actually achieved');
  assert.match(s, /farStep:farWin\.step/, 'the field stats no longer carry the seam ratio');
  assert.match(s, /fineCellKm:fldFar\.fineCellKm,\s*step:fldFar\.step/,
    'state().far no longer carries the seam ratio');

  /* #R245's tiling depends on the fine box being snapped to the far grid — that must still be true */
  assert.match(s, /snapLngFar=\(v,out\)=>/, 'the fine box is no longer snapped onto the far grid (#R245)');
  assert.match(s, /'raster-resampling':'nearest'/, 'the far layer stopped drawing each cell as the value it is (#R245)');
});
}

/* ═══════════════════════ #R196 · from r196-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R196 — the source-level and browser-free guards for this round.
 *
 *  The things a real renderer has to answer live in tests/r196.spec.js. What is
 *  here is what can be proved without one: that the two splits are byte-for-byte
 *  moves, that the geometry they carried still behaves at the antimeridian and
 *  over the poles, and that the four numbers this round changed are the numbers
 *  it says it changed.
 * ==========================================================================*/
{
const rd = read;

/* ── ② THE GEOMETRY STILL WORKS — IN NODE, WITHOUT A BROWSER ───────────────────────────────────
   This is the point of moving it: the block is a pure function of coordinates, so its two hardest
   cases (a circle that crosses ±180°, and one that swallows a pole) can be asserted here rather
   than only through a rendered map. */
test('R196 ② the pole-safe geometry: a seam-crossing disk splits, a pole-swallowing one caps', async () => {
  const src = rd('js/geodesy.js');
  /* evaluate the module body with a `window` of our own — it publishes onto it and nothing else */
  const box = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(box.window);
  const G = box.window.IntMapGeodesy;
  assert.ok(G && typeof G.diskFillPolys === 'function', 'the module publishes window.IntMapGeodesy');

  /* a 500 km disk sitting ON the antimeridian must come back as pieces that each stay in range */
  const seam = G.diskFillPolys([179.8, 0], 500, 96);
  assert.ok(seam.length >= 2, `a disk over ±180° must be split into pieces; got ${seam.length}`);
  for (const poly of seam) for (const ring of poly) for (const [lng] of ring)
    assert.ok(lng >= -180.001 && lng <= 180.001, `every vertex stays inside [-180,180]; saw ${lng}`);

  /* a disk big enough to contain the north pole must still be drawable — and must reach it */
  const cap = G.diskFillPolys([0, 85], 1500, 96);
  assert.ok(cap.length >= 1, 'a pole-swallowing disk still produces geometry');
  let maxLat = -90;
  for (const poly of cap) for (const ring of poly) for (const [, lat] of ring) if (lat > maxLat) maxLat = lat;
  assert.ok(maxLat > 89, `the polar cap must reach the pole; the highest vertex was ${maxLat}`);

  /* and the ordinary case is unchanged: a small disk is one piece, closed, at the right radius */
  const plain = G.diskFillPolys([139.7, 35.7], 100, 64);
  assert.equal(plain.length, 1, 'a small disk is one polygon');
  const ring0 = plain[0][0];
  assert.deepEqual(ring0[0], ring0[ring0.length - 1], 'the ring is closed');
});

/* ── ③ THE FOUR NUMBERS THIS ROUND CHANGED ─────────────────────────────────────────────────────
   Each one is a fact a future round would otherwise have to re-derive from a screenshot. */
/* spelling kept: browser script (js/flight-sim.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ③a the flight simulator sets NO distance fog', () => {
  const fs = rd('js/flight-sim.js');
  const m = /setSky\(\{'sky-color':'#3f78c2'[^}]*\}\)/.exec(fs);
  assert.ok(m, 'the cockpit sky block is still set in one place');
  assert.match(m[0], /'horizon-fog-blend':0\b/, "horizon-fog-blend 0 = the horizon band is the horizon colour");
  assert.match(m[0], /'fog-ground-blend':1\b/, 'fog-ground-blend 1 = fog only exactly at the horizon');
  assert.match(m[0], /'sky-color':'#3f78c2'/, 'the SKY half of the #R99 spec is untouched');
});

/* ── ⑤ THE PICK GESTURE ────────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/map-pick.js, js/seismic.js, js/sims.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ⑤ every "place this on the map" button steps its panel aside', () => {
  const p = rd('js/map-pick.js');
  /* ⚠ (#R207) THE INVARIANT IS "THE PANEL STOPS COVERING THE MAP", NOT "THE PANEL IS HIDDEN".
     #R196 measured the real defect — the seismic panel covers 82 % of a 390 × 844 map, so the app
     asked for a tap on a surface it was standing on — and removed the panel to fix it. 「震源地を
     設置ボタンを押すとポップアップが消えるのは不要」: #R207 keeps the panel on screen and takes it
     out of HIT-TESTING instead (`pointer-events:none`), which satisfies the same measurement —
     coverage stops mattering once the cover is transparent to input — without the disappearance.
     So this asserts that the panel is stepped aside SOMEHOW, and that the step is undone afterwards. */
  assert.match(p, /pointerEvents='none'|_hide\(panel\)/, 'the requesting panel stops covering the map for the duration');
  assert.match(p, /_unghost\(s\.panel,s\.prevStyle\)|_show\(s\.panel,s\.prevDisplay\)/,
    '…and teardown puts it back exactly as it was');
  assert.match(p, /GE\(\)\.events\.once\('click',s\.h\)/, 'the delivery mechanism is unchanged');
  assert.match(p, /e\.key==='Escape'/, 'Esc cancels');
  /* the four callers, each still keeping its old path as a fallback */
  const seismic = rd('js/seismic.js');
  assert.match(seismic, /const P=window\.IntMapPick;\s*\n\s*if\(P&&P\.start\)\{/, 'the seismic epicentre uses it');
  /* ⚠ (#R206) THIS ASSERTED A LITERAL AND SO IT BROKE ON A CHANGE THAT KEPT ITS MEANING.
     It read `picking=false; epi=[ll.lng,ll.lat]` byte for byte; #R206 routes the flag through
     setPicking() so the ◎ button can stop looking permanently selected, and the pin went red while
     the behaviour it names — "a pick leaves pick mode and sets the epicentre to what was picked" —
     was untouched. That behaviour is what is asserted now (the same lesson #R205 wrote down after
     five pins broke the same way). */
  const onPick = /onPick:\(ll\)=>\{([^}]*)\}/.exec(seismic);
  assert.ok(onPick, 'the pick has an onPick handler');
  assert.match(onPick[1], /picking\s*=\s*false|setPicking\(\s*false\s*\)/, 'a completed pick leaves pick mode');
  /* WARN (#R210) the same lesson one more time: setEpi() now owns the assignment, because moving
     the epicentre must also clear the observation points. The BEHAVIOUR asserted is unchanged. */
  assert.match(onPick[1], /(?:epi\s*=|setEpi\(\s*)\[\s*ll\.lng\s*,\s*ll\.lat\s*\]/, 'and sets the epicenter from the pick');
  const sims = rd('js/sims.js');
  /* ⚠ (#R296) two pickers, not three: the RF one left with `IntMapRF` (「電波・通信圏と見通し線解析を
     統合して」) and the disaster one with `IntMapDisaster`, while the radioactive-dispersion panel this
     round BUILT brought one of its own. The count is 2 × 2 (`abort` + `start`), and counting is still
     the point — a picker that forgets `IntMapPick` is a panel that covers the map it asks you to tap. */
  /* ⚠ (#R302) …AND THE COUNT WAS THE LITERAL ALL OVER AGAIN. It was `=== 4`, so ADDING a picker —
     which is exactly what 「まずは地点を選ばせろ」 asks for — read as a regression. The thing being
     counted is a proxy for a relation: every panel that asks the reader to tap the map must go
     through `IntMapPick`, because that is what steps the panel out of the way, and every one that
     starts a pick must be able to abort one. So the relation is asserted directly. */
  const starts = [...sims.matchAll(/P\.start\(\{/g)].map(m => sims.slice(m.index, m.index + 260));
  assert.ok(starts.length >= 3, `js/sims.js must drive the shared picker (${starts.length} start sites)`);
  /* THE TITLE OF THIS TEST IS THE INVARIANT: passing `panel` is what steps it out of the way, so a
     new picker that forgets it is a panel covering the map it just asked you to tap. */
  for (const b of starts) assert.match(b, /\bpanel\b/, 'every pick hands the picker its panel');
  /* …and no panel may start a pick without first cancelling one already in flight */
  assert.ok(/P&&P\.active\(\)\) P\.abort\(\)/.test(sims), 'a pick in flight is aborted before a new one');
  /* ⚠ (#R302) NO RegExp BUILT OUT OF A STRING. The first draft escaped `(` and `)` in the name and
     fed it to `new RegExp` — CodeQL is right that a half-escape is not an escape (a backslash in the
     input goes straight through), and the question does not need a regex at all: find the function
     and read the first line of it. */
  for (const fn of ['function startPick()', 'function askSite()', 'function pickPoint()']) {
    const i = sims.indexOf(fn);
    assert.ok(i > 0, `${fn} must exist`);
    assert.match(sims.slice(i, i + 140), /_?[eE]ndPick\(\)/, `${fn} clears the pick in flight first`);
  }
});

/* ── ⑥ THE TSUNAMI FOLLOWS THE EARTHQUAKE ──────────────────────────────────────────────────── */
/* spelling kept: browser script (js/tsunami.js, js/seismic.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ⑥ the propagation model follows the seismic panel, debounced', () => {
  const t = rd('js/tsunami.js');
  assert.match(t, /function follow\(o\)\{/, 'there is a follow()');
  assert.match(t, /if\(!opened\|\|o\.lng==null/, 'it does nothing unless the panel is open');
  assert.match(t, /setTimeout\(\(\)=>\{ srcPending=false; if\(!opened\) return; ranKey=srcKey\(\); build\(\); \},900\)/,
    'it debounces — a magnitude spinner must not start a solve per keystroke');
  /* ⚠ (#R214) THE CLAIM IS «follow IS EXPORTED», NOT «the export literal starts with these bytes».
     This pinned the whole `return { … }` line, so #R214 naming that object `API` (to register its
     share state after it exists) failed a test about the seismic panel's debounce. That is exactly
     #R203's trap. The claim is now derived from the object however it is spelled.
     ⚠ (#R322) …and it was only half-fixed: the object's NAME stopped being pinned but its first
     four MEMBERS did not, so when the lifecycle round routed `open`/`close` through the runtime
     register (`open:openPublic`) a test about the seismic panel's debounce failed again, for the
     third time, over a spelling it does not care about. Ask the actual question: is `follow` a
     member of the object this file publishes? */
  /* ⚠ every `return {` in the file matches the shape, so ask whether ANY published object carries
     `follow` rather than betting on which one comes first in the source. */
  const objects = [...t.matchAll(/(?:return|const\s+\w+\s*=)\s*\{([\s\S]{0,900})/g)].map((m) => m[1]);
  assert.ok(objects.length, 'js/tsunami.js still publishes an object');
  assert.ok(objects.some((o) => /(^|[{,\s])follow\s*[,:}]/.test(o)),
    'follow is on the public API object, whatever that object is called and whatever else is on it');
  const s = rd('js/seismic.js');
  assert.match(s, /function syncTsunamiSource\(\)\{/);
  assert.match(s, /function refresh\(\)\{ draw\(\); warmEpi\(\); schedField\(\); syncTsunamiSource\(\); \}/);
  assert.match(s, /function touch\(\)\{ draw\(\); warmEpi\(\); markStale\(\); syncTsunamiSource\(\); \}/);
});
}
