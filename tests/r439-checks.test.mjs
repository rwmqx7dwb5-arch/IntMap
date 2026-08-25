/* ============================================================================
 *  R439 — Windy's own colours for three more fields, and the isobars become a switch
 * ----------------------------------------------------------------------------
 *  「気圧レイヤーのグラフィックの色は、Windyの実際のサイトを見てRGB単位でおなじ気圧と色の対応に。
 *    また、等圧線レイヤーを取り込み、トグルでオンオフできるように。
 *    また、モデルの選択欄が凡例から突き出ている。」
 *  「最大瞬間風速レイヤーにもパーティクルをつけて。…気圧レイヤー、最大瞬間風速レイヤーは気象レイヤーに昇格。
 *    また、気圧レイヤーもパーティクルつけて。」
 *  「あ、降水量、露点もWindyとグラフィックをRGBレベルで対応させる作業やってから、気候・気象レイヤーに。」
 *
 *  MEASURED on windy.com before the change, against `W.colors.<ident>.RGBA(v)` — the function its
 *  tiles are actually painted through, which is the ground truth #R288 and #R293 both established:
 *
 *      what IntMap drew                                    how far from Windy
 *      pressure       the SDK's 17-stop 940…1060 blue→red   a different palette entirely
 *      precipitation  the SDK's 15-stop 0.01…30 mm, α-ramp  a different palette entirely
 *      dew point      NO SCALE — `mQ` finds no `dew_point`  the TEMPERATURE ramp, on a 露点 legend
 *
 *  and the declared tables are NOT the painted function either — Windy's own
 *  `initialColorGradient`, linearly interpolated, is 2.4/255 away for pressure, **10** for rain and
 *  **25** for dew point. So each was sampled ONE POINT PER PRECOMPUTED BUCKET and fitted:
 *  16 / 17 / 24 stops, worst channel error 1.74 / 2.01 / 1.85 out of 255.
 *
 *  WHAT THIS FILE PINS — the relations, not the pictures:
 *      ① the three anchor tables are complete, paired, ordered, opaque and in the reader's unit
 *      ② they are registered under the keys the SDK's alias resolver actually looks up
 *      ③ they are built on FIRST USE, not at parse time (boot pays for nothing)
 *      ④ the isobar levels are declared once, in the field's unit, and the tile asks for them
 *      ⑤ the isobars are a sub-layer: no row, no legend box, and they follow their parent
 *      ⑥ every reader-facing entry point to the old row still resolves — share link, Atlas, alias
 *      ⑦ three layers can ask for the streaks, each with its own key, and ec-temp keeps its old one
 *      ⑧ the model picker is styled, and the styling is the one that actually contains a <select>
 *      ⑨ the four promoted rows are in 気候・気象 and in no other list
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ECRAW = read('js/wx-ecmwf.js');
const EC = codeOnly(ECRAW);
const WX = codeOnly(read('js/weather.js'));
const DL = read('js/data-layers.js');          /* the CSS lives in a template literal — keep comments out only where it matters */
const DLC = codeOnly(DL);
const AC = codeOnly(read('js/atlas-console.js'));
const MU = codeOnly(read('js/map-ui.js'));
const CAP = codeOnly(read('js/atlas-capabilities.js'));
const SCH = codeOnly(read('js/atlas-schemas.js'));
const CAT = read('js/atlas-catalog-text.js');
const LP = codeOnly(read('js/layer-previews.js'));

/* one anchor table, lifted out of the source and evaluated */
function anchors(name) {
  const i = EC.indexOf('var ' + name + ' = {');
  assert.ok(i > 0, name + ' is declared in js/wx-ecmwf.js');
  const j = EC.indexOf('\n  };', i);
  assert.ok(j > i, name + ' closes');
  /* eslint-disable no-eval */
  return eval('(' + EC.slice(i + ('var ' + name + ' = ').length, j + 4).replace(/;\s*$/, '') + ')');
}

/* ── ① THE TABLES THEMSELVES ─────────────────────────────────────────────────────────────────
   Not the colours — a later measurement may legitimately move those. What may never break is the
   SHAPE: as many colours as breakpoints, breakpoints ascending, alpha 1 everywhere (Windy's own
   tables are `opaque:true` and hand back 255 at every value, including zero), and a unit string
   that is the READER's, because `scale()`/`legend()` answer straight out of these. */
test('R439 ① the three fitted tables are complete, ordered, opaque and in the reader’s unit', () => {
  const want = { PRESSURE_ANCHORS: ['hPa', 16], PRECIP_ANCHORS: ['mm', 17], DEW_ANCHORS: ['°C', 24] };
  for (const [name, [unit, n]] of Object.entries(want)) {
    const a = anchors(name);
    assert.equal(a.unit, unit, name + ' is stated in the unit the feed publishes');
    assert.equal(a.breakpoints.length, n, name + ' has the fitted number of stops');
    assert.equal(a.colors.length, a.breakpoints.length,
      name + ': every breakpoint has a colour — an unpaired table silently repeats the last one');
    for (let i = 1; i < a.breakpoints.length; i++) {
      assert.ok(a.breakpoints[i] > a.breakpoints[i - 1],
        name + ' ascends (' + a.breakpoints[i - 1] + ' → ' + a.breakpoints[i] + ')');
    }
    for (const c of a.colors) {
      assert.equal(c.length, 4, name + ': every colour is [r,g,b,a]');
      assert.equal(c[3], 1, name + ' is opaque throughout, as Windy’s own table is');
      for (const ch of c.slice(0, 3)) {
        assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255, name + ': ' + ch + ' is a byte');
      }
    }
  }
  /* the pressure table pivots on the standard atmosphere and covers Windy's whole domain */
  const P = anchors('PRESSURE_ANCHORS');
  assert.equal(P.breakpoints[0], 900); assert.equal(P.breakpoints[P.breakpoints.length - 1], 1080);
  assert.ok(P.breakpoints.includes(1013.2), 'the grey pivot is the standard atmosphere');
  const R = anchors('PRECIP_ANCHORS');
  assert.equal(R.breakpoints[0], 0, 'the rain table starts at zero — Windy paints dry ground, it does not fade it');
  const D = anchors('DEW_ANCHORS');
  assert.ok(D.breakpoints.some((b) => b > -1 && b < 1), 'the dew-point table keeps the freezing-point emphasis');
});

/* ── ①b EVERY ANCHOR LANDS ON ITS OWN COLOUR ──────────────────────────────────────────────────
   #R284's requirement, executed rather than read: `rampFrom` resamples onto a FIXED step, so a
   breakpoint that does not fall on a sample point is a colour the map never paints — 「色はそのまま」
   would be approximate. This builds each ramp from the file's own routine and checks the anchors
   come back byte-exact. (It is also what makes the step choice reviewable: the resampled length is
   the resolution the map is drawn at.) */
test('R439 ①b the resampled ramps land on their anchors exactly', () => {
  const i = EC.indexOf('function rampFrom(a, step)');
  assert.ok(i > 0, 'rampFrom is where it was');
  const body = EC.slice(i, EC.indexOf('var WINDY_WIND', i));
  const rampFrom = new Function(body + '; return rampFrom;')();
  /* the steps, read out of the source rather than written down again here */
  const src = EC.slice(EC.indexOf('var _WINDY_SRC = {'), EC.indexOf('function windyRamp'));
  const steps = Object.fromEntries([...src.matchAll(/(\w+): \[(\w+), ([0-9.]+)\]/g)].map((m) => [m[2], +m[3]]));
  assert.deepEqual(Object.keys(steps).sort(), ['DEW_ANCHORS', 'PRECIP_ANCHORS', 'PRESSURE_ANCHORS'],
    'all three ramps are declared with their own step');
  for (const [name, step] of Object.entries(steps)) {
    const a = anchors(name), r = rampFrom(a, step);
    assert.ok(r.breakpoints.length > 1000, name + ' resamples to a gradient, not a staircase');
    a.breakpoints.forEach((bp, k) => {
      let bi = 0, bd = Infinity;
      r.breakpoints.forEach((v, j) => { const d = Math.abs(v - bp); if (d < bd) { bd = d; bi = j; } });
      assert.ok(bd < step / 2 + 1e-9, name + ': breakpoint ' + bp + ' is on the resampling grid');
      assert.deepEqual(r.colors[bi].slice(0, 3), a.colors[k].slice(0, 3),
        name + ': the anchor at ' + bp + ' is painted with its own colour, unchanged');
    });
  }
});

/* ── ② REGISTERED UNDER THE KEYS THE SDK ACTUALLY LOOKS UP ────────────────────────────────────
   READ OUT OF THE SHIPPED BUNDLE: `mQ(D,A)` tries `A[D]`, then `A[I[0]+'_'+I[1]] ?? A[I[0]]`. So
   `pressure_msl` → `pressure`, `dew_point_2m` → `dew_point`, `precipitation` is exact. A table
   registered under the wrong key is a table nothing reads, and NOTHING WOULD SAY SO — which is
   precisely how the dew-point layer came to be painted with the temperature ramp. */
test('R439 ② the ramps are registered under the family names the resolver resolves to', () => {
  const i = EC.indexOf('var scales = Object.assign({}, sdk.COLOR_SCALES_WITH_ALIASES');
  assert.ok(i > 0, 'omSettings still builds the scales object');
  const decl = EC.slice(i, EC.indexOf(';', i));
  for (const k of ['wind:', 'temperature:', 'pressure:', 'precipitation:', 'dew_point:']) {
    assert.ok(decl.includes(k), 'the scales override carries ' + k);
  }
  assert.match(decl, /pressure: windyRamp\('pressure'\)/);
  assert.match(decl, /precipitation: windyRamp\('precipitation'\)/);
  assert.match(decl, /dew_point: windyRamp\('dew_point'\)/);
  /* …and the SDK-less path answers for the same three, so a legend drawn before the 340 kB bundle
     lands is not keyless (#R288's reason for OWN, applied to the new families) */
  assert.match(EC, /var OWN_LAZY = \{ pressure_msl: 'pressure', precipitation: 'precipitation', dew_point_2m: 'dew_point' \};/);
  assert.ok(!/return OWN\[variable\] \|\| null;/.test(EC),
    'scale() goes through own(), so the lazy families are reachable without the SDK too');
});

/* ── ③ BUILT ON FIRST USE ─────────────────────────────────────────────────────────────────────
   `rampFrom` resamples: these three are ~6,600 entries between them, on top of the 3,382 the wind
   and the temperature already cost at parse time. Nothing needs them until a weather legend is
   drawn or the protocol is configured, and boot is not the place to pay for that. */
test('R439 ③ the new ramps are memoised and built lazily, not at parse time', () => {
  assert.match(EC, /var _windyRamps = Object\.create\(null\);/);
  assert.match(EC, /function windyRamp\(family\) \{[\s\S]{0,400}?_windyRamps\[family\] = rampFrom\(/,
    'the builder memoises');
  for (const n of ['PRESSURE_ANCHORS', 'PRECIP_ANCHORS', 'DEW_ANCHORS']) {
    assert.ok(!new RegExp('rampFrom\\(' + n).test(EC),
      n + ' is not resampled at module scope — that is what `windyRamp` is for');
  }
});

/* ── ④ THE ISOBAR LEVELS ARE A DECLARATION, NOT A NUMBER IN A URL ─────────────────────────────
   The two halves of this round meet here. With no `intervals` the SDK contours at the ramp's
   breakpoints; the new pressure ramp has 1,801 of them. So the levels must be given, they must be
   in the FIELD's unit (pascals), and the number of hPa between them must be written down once. */
test('R439 ④ the contour interval is declared once and converted through FIELD_UNITS', () => {
  assert.match(EC, /var ISOBAR_STEP_HPA = 4;/, 'the interval is a named declaration');
  assert.equal((EC.match(/ISOBAR_STEP_HPA = /g) || []).length, 1, '…declared exactly once');
  assert.match(EC, /isobarIntervals: function \(\) \{ return String\(ISOBAR_STEP_HPA \* fieldPer\('pressure_msl'\)\); \}/,
    'and it is published already converted, so no caller has to know the unit');
  assert.match(WX, /cfg\.type==='isobars'\?\('&contours=true&intervals='\+EC\(cfg\)\.isobarIntervals\(\)\)/,
    'the isobar tile asks for contours AND for the levels');
  assert.ok(!/intervals=400/.test(WX) && !/intervals=4\b/.test(WX),
    'nobody writes the number into a url');
});

/* ── ⑤ THE ISOBARS ARE A SUB-LAYER ────────────────────────────────────────────────────────────
   「等圧線レイヤーを取り込み、トグルでオンオフできるように」 — absorbed, with the standalone row
   retired. What must hold: it keeps every MAP mechanism (it is still in LAYERS, so the two-slot
   swap, applyTime, commit and the share hook all still see it) and loses every READER-FACING one. */
test('R439 ⑤ ec-isobars has no row and no legend box, and follows ec-slp', () => {
  assert.match(WX, /\{id:'ec-isobars',[^}]*sub:'ec-slp'/, 'the row declares its parent');
  assert.match(WX, /function legendLayers\(\)\{ return activeLayers\(\)\.filter\(l=>!l\.sub\); \}/,
    'the reader’s list is not the map’s list');
  assert.match(WX, /function renderOne\(cfg\)\{\s*if\(cfg\.sub\) return;/, 'a sub-layer draws no box');
  /* ⚠ `codeOnly` strips comments, so this anchors on the CODE around the guard, not on the note
     beside it — a test that matches a comment is a test that a rewording breaks. */
  assert.match(WX, /LAYERS\.forEach\(l=>\{\s*if\(l\.sub\) return;\s*if\(document\.getElementById\('lyrrow-'\+l\.id\)\) return;/,
    'and mounts no row');
  /* the two conditions that decide whether contours are on the map, in ONE predicate */
  assert.match(WX, /function subWant\(l\)\{ if\(l\.id==='ec-isobars'\) return !!\(isoOn&&state\['ec-slp'\]&&state\['ec-slp'\]\.on\); return false; \}/);
  /* and every path that can change either half calls the reconciler */
  for (const site of [/function toggle\(id,on\)\{[\s\S]{0,260}?if\(!cfg\.sub\) syncSubs\(\);/,
    /wireModel\(inst\);[\s\S]{0,60}?syncSubs\(\);/,
    /function setIsobars\(v\)\{[\s\S]{0,200}?syncSubs\(\);/]) {
    assert.match(WX, site, 'syncSubs is called from every path that can change the pair');
  }
  /* the sub-layer takes its parent's model, so contours are never drawn over another model's field */
  assert.match(WX, /if\(p&&st\.model!==p\.model\)\{ st\.model=p\.model;/);
  /* the preview that was keyed by the retired checkbox is gone with it — an unreachable painter
     that still looks like a feature is what CONSTITUTION forbids */
  assert.ok(!/dl-ec-isobars/.test(LP), 'js/layer-previews.js no longer keys anything to the retired id');
  assert.ok(!/omIsobars/.test(LP), '…and the painter it was the only caller of is gone too');
});

/* ── ⑤b THE CONTOURS ARE ABOVE THE FIELD THEY ARE CONTOURS OF ─────────────────────────────────
   ⚠ THIS IS THE ONE A SCREENSHOT FOUND. Every ECMWF layer is placed at the SAME anchor, so between
   two of them the order is 「who was added last」 — and `lift` cannot decide it, because it declines
   to move anything already above the night shading (#R299). MEASURED on the built page:
   `ec-isobars-0, ec-isobars-0-lbl, ec-slp-0` — 3,299 contour features fetched, parsed and drawn
   under an opaque raster. The tiles, the levels and the labels were all correct.
   The ORDER is asserted where the layers actually exist (tests/prod-smoke.spec.js #R398). What is
   pinned here is that the mechanism is still called from every path that can (re)build a parent —
   which is the way it goes quiet again. */
test('R439 ⑤b the sub-layers are raised over their parent from every path that rebuilds one', () => {
  assert.match(EC, /function toTop\(layerId\) \{[\s\S]{0,300}?layers\.move\(layerId, before\(\)\);/,
    'the engine publishes an UNCONDITIONAL move — `lift` refuses when a layer is already lifted');
  assert.match(EC, /toTop: toTop,/, '…and exports it');
  assert.match(WX, /function raiseSubs\(parentId\)\{/, 'js/weather.js has the one raiser');
  assert.match(WX, /curIds\(l\)\.forEach\(id=>\{ try\{ EC\(l\)\.toTop\(id\); \}catch\(_\)\{\} \}\)/,
    '…and it moves the sub-layer’s own ids, in their own order');
  /* the four moments at which a parent's slot can be built or rebuilt */
  assert.match(WX, /setOp\(cfg,state\[id\]\.op\); raiseSubs\(id\);/, 'switching the parent on raises them');
  assert.match(WX, /dropSlot\(cfg,old\);[\s\S]{0,240}?raiseSubs\(cfg\.id\);/, 'a time or model step raises them');
  assert.match(WX, /if\(put\) raiseSubs\(\);/, 'a style swap raises them');
  /* ⚠ AND THE IDLE PATH IS GUARDED. Moving a layer makes the map draw, a draw ends in another
     `idle`, so an unconditional raise there is a loop at two moveLayer calls a frame. */
  assert.match(WX, /if\(EC\(cfg\)\.lift\(l\)\) moved=true;[\s\S]{0,120}?if\(moved\) raiseSubs\(\);/,
    'the idle path raises only when a lift actually moved something');
});

/* ── ⑥ EVERY OLD DOOR STILL OPENS ─────────────────────────────────────────────────────────────
   Retiring a control is not a reason to break the links people already sent each other (#R409's
   rule for `dl-wars`), nor to leave Atlas pointing at an id that resolves to nothing. */
test('R439 ⑥ the retired isobar id still resolves — share link, alias and a verb of its own', () => {
  /* the shared-link redirect, in the same block #R409 wrote for the same reason */
  assert.match(MU, /if\(wantSet\.has\('dl-ec-isobars'\)\)\{ wantSet\.delete\('dl-ec-isobars'\);/);
  assert.match(MU, /wantSet\.add\('dl-ec-slp'\)/, 'an old link opens the row the switch now lives in');
  assert.match(MU, /window\._imWxIsobars&&window\._imWxIsobars\(true\)/, '…and flips the switch');
  /* the alias no longer points at a checkbox that does not exist */
  assert.ok(!/'dl-ec-isobars'/.test(AC), 'Atlas names no retired checkbox id');
  assert.match(AC, /'等圧線':'dl-ec-slp'/, '「等圧線」 resolves to the row the contours live in');
  /* a switch needs a verb — dispatch, schema, capability row and SYS sentence, in one change */
  assert.match(AC, /case 'isobars': \{ const want=/, 'Atlas can dispatch it');
  assert.match(AC, /window\._imWxIsobars\(want\)/, '…through the one published door');
  assert.match(AC, /isobars:\{ lbl:\(\)=>L\('Isobars'/, 'and a reply can carry the switch inline');
  assert.match(SCH, /'layers\.isobars':/, 'the schema knows the action');
  assert.match(CAP, /\['layers\.isobars',/, 'and so does the capability table');
  assert.match(CAT, /"type":"isobars","on":bool/, 'and the planner is told the capability exists');
  /* the model picker no longer offers a layer that has no picker of its own */
  assert.ok(!/"ec-isobars"/.test(CAT), 'wxModel no longer names the sub-layer — it reads its parent’s model');
});

/* ── ⑦ THREE LAYERS ASK FOR THE STREAKS ───────────────────────────────────────────────────────
   「最大瞬間風速レイヤーにもパーティクルをつけて」「気圧レイヤーもパーティクルつけて」. One boolean
   cannot answer three questions; what crosses to the wind module is still one, because that module
   draws one set of streaks. ⚠ And ec-temp keeps its ORIGINAL key or every reader who ticked that
   box before this round is silently unticked. */
test('R439 ⑦ the particle preference is per layer, and ec-temp keeps its old key', () => {
  /* ⚠ (#R455) A FOURTH LAYER ASKS (`ec-precip`), and three of the four now DEFAULT ON. This
     assertion is still an exact match on the table, because that table is the one place that can
     be wrong about which layers can ask — what changed is its contents, not its job. */
  assert.match(WX, /const PARTS_KEYS=\{'ec-temp':'intmap_wx_temp_parts','ec-gust':'intmap_wx_gust_parts','ec-slp':'intmap_wx_slp_parts','ec-precip':'intmap_wx_precip_parts'\};/);
  assert.match(WX, /W\.setSolo\(PARTS_IDS\.some\(id=>parts\[id\]&&state\[id\]&&state\[id\]\.on\)\)/,
    'the effective answer is the OR over every asking layer');
  assert.match(WX, /function windPartsRow\(cfg\)\{\s*if\(!\(cfg\.id in PARTS_KEYS\)\) return '';/,
    'the box appears on exactly the layers that have a key');
  /* the doors: one general, and #R337's name kept for the callers that already use it */
  assert.match(WX, /window\._imWxParts=\(id,v\)=>/);
  assert.match(WX, /window\._imWxTempParts=\(v\)=>\{ if\(v==null\) return partsOn\('ec-temp'\); setParts\('ec-temp',v\); return partsOn\('ec-temp'\); \};/,
    '#R337’s door still exists and is the same state');
  /* Atlas resolves `over` to WHICH layer rather than to a boolean */
  assert.match(AC, /\['ec-gust',\/gust\|突風/, 'Atlas understands 「突風の上に」');
  assert.match(AC, /\['ec-slp',\/press\|気圧/, 'and 「気圧の上に」');
  assert.match(AC, /window\._imWxParts\(hit\[0\],want\)/, '…and writes through the one door');
  for (const k of ['gustWindParticles:', 'slpWindParticles:', 'precipWindParticles:']) {
    assert.ok(AC.includes(k), 'a reply can carry ' + k + ' inline');
  }
  /* the two switches that are no longer checkboxes travel in the share link, or a shared picture
     silently loses them (`l=` carries dl-* ids and neither is one any more) */
  assert.match(WX, /if\(isoOn&&state\['ec-slp'\]&&state\['ec-slp'\]\.on\) o\.iso=1;/);
  assert.match(WX, /if\(pr\.length\) o\.wp=pr\.join\(','\);/);
  assert.match(WX, /if\(v\.iso!=null\) setIsobars\(!!\(\+v\.iso\)\);/);
  assert.match(WX, /if\(v\.wp!=null\) String\(v\.wp\)\.split\(','\)\.forEach/);
});

/* ── ⑧ THE MODEL PICKER IS STYLED, AND STYLED SO IT CANNOT OVERFLOW ───────────────────────────
   「モデルの選択欄が凡例から突き出ている。」 MEASURED: `.ecl-modelpick` occurred exactly once in the
   whole repository — in the string that builds it. A bare `<select>` sizes to its widest option,
   and the options carry a model name plus a refusal reason, in a 178 px box.
   ⚠ `min-width:0` is the load-bearing line: a flex item's automatic minimum size is its MIN-CONTENT
   width, which for a `<select>` is the widest option again — `width:100%` alone does not contain it. */
test('R439 ⑧ the legend’s model picker is contained by the legend', () => {
  const i = DL.indexOf('.data-legend .ecl-modelpick select{');
  assert.ok(i > 0, 'the select inside the model picker is styled');
  const rule = DL.slice(i, DL.indexOf('}', i));
  for (const need of ['width:100%', 'max-width:100%', 'min-width:0', 'box-sizing:border-box']) {
    assert.ok(rule.includes(need), 'the rule sets ' + need);
  }
  assert.match(DL, /\.data-legend \.ecl-modelpick label\{[^}]*min-width:0/,
    'and its flex parent does too — a min-width:0 on the child alone is undone by the parent');
  /* ⚠ THE CSS IS INSIDE A TEMPLATE LITERAL. One backtick in this block ends the string and blanks
     the site; the comment that explains the fix therefore uses «» and this asserts it stays so. */
  const blk = DL.slice(DL.indexOf('(#R439) THE MODEL PICKER'), i);
  assert.ok(!blk.includes('`'), 'no backtick in a comment that lives inside a template literal');
});

/* ── ⑨ THE FOUR PROMOTED ROWS ─────────────────────────────────────────────────────────────────
   「気圧レイヤー、最大瞬間風速レイヤーは気象レイヤーに昇格」＋「降水量、露点も…気候・気象レイヤーに」.
   A row placed in a GROUP must leave the beta list, because `order.push` MOVES the element and an
   id in two lists renders only in the last one. */
test('R439 ⑨ the promoted rows are in 気候・気象 and in no other list', () => {
  const g = DLC.slice(DLC.indexOf("['lyrGrpClimate',["), DLC.indexOf(']]', DLC.indexOf("['lyrGrpClimate',[")));
  for (const id of ['ec-slp', 'ec-gust', 'ec-precip', 'ec-dew']) {
    assert.ok(g.includes("'" + id + "'"), id + ' is on the 気候・気象 shelf');
  }
  const others = DLC.slice(DLC.indexOf('const OTHERS_IDS=['), DLC.indexOf('];', DLC.indexOf('const OTHERS_IDS=[')));
  for (const id of ['ec-slp', 'ec-gust', 'ec-precip', 'ec-dew', 'ec-isobars']) {
    assert.ok(!others.includes("'" + id + "'"), id + ' is not also in the beta list');
  }
  /* the two rows the instruction did NOT name stay where they were — 再編 is not a licence (#R273) */
  /* ⚠⚠ (#R468) 「ベータからはCAPE不安定度レイヤーを気象に昇格。」 #R439 asserted that `ec-wind` and
     `ec-cape` stay in Beta because the reader had not NAMED them — the #R273 rule that a
     reorganisation is not a licence to overturn a beta judgement of the reader's. That rule is
     untouched; its PREMISE changed, because `ec-cape` has now been named. `ec-wind` still has not,
     and is still asserted to be where it was. */
  assert.ok(others.includes("'ec-wind'"),
    'the row nobody asked to promote is untouched — ec-wind was not named, then or now');
  /* and no group anywhere still names the retired id */
  assert.ok(!/'ec-isobars'/.test(DLC), 'the Layers panel knows nothing about the retired row');
});
