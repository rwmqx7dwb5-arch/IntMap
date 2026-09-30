/* ============================================================================
 *  The ECMWF weather layers and the wind: colour ramps, isobars, legends, the forecast clock and the read path
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r439-checks.test.mjs, tests/r284-checks.test.mjs, tests/r297-checks.test.mjs, tests/r305-checks.test.mjs, tests/r307-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { makeAtlasCatalogText } from '../js/atlas-catalog-text.js';
import { makeAtlasSchemas } from '../js/atlas-schemas.js';
import { codeOnly, codeOnly as noComments } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r439-checks.test.mjs — 10 of its 11 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/weather.js は DOM に閉じたファクトリ、js/wx-ecmwf.js は読み込み時に Open-Meteo の SDK と fetch を要するため node では組み立てられない（アンカー表と rampFrom は切り出して実行している） */
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

const ECRAW = read('js/wx-ecmwf.js');
const EC = codeOnly(ECRAW);
const WX = codeOnly(read('js/weather.js'));
const DL = read('js/data-layers.js');
const AC = codeOnly((read('js/atlas-console.js') + '\n' + capsSource()));
const MU = codeOnly(read('js/map-ui.js'));
/* (consolidation) the capability table, the schemas and the planner's catalogue are ASKED — they
   are modules with factories, so what is checked is what they answer, not how a file spells it */
const CAP = makeAtlasCapabilities({});
const SCH = makeAtlasSchemas();
const CATD = makeAtlasCatalogText({}, {});
const CAT = CATD.text(CATD.idsCovered());
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
  assert.match(capabilityEntry('isobars').run, /\{ const want=/, 'Atlas can dispatch it');
  assert.match(AC, /window\._imWxIsobars\(want\)/, '…through the one published door');
  assert.match(AC, /isobars:\{ lbl:\(\)=>L\('Isobars'/, 'and a reply can carry the switch inline');
  assert.ok(SCH.schemaFor('layers.isobars'), 'the schema knows the action');
  assert.ok(CAP.resolve('layers.isobars'), 'and so does the capability table');
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
}

/* ══════════ from tests/r284-checks.test.mjs — 4 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/weather.js は DOM に閉じたファクトリ、js/wx-ecmwf.js は読み込み時に Open-Meteo の SDK と fetch を要するため node では組み立てられない（アンカー表と rampFrom は切り出して実行している） */
/* ============================================================================
 *  IntMap · #R284 source checks
 * ----------------------------------------------------------------------------
 *  「気象警報はまだ対応していない国は灰色斜線で、発令されていないだけの地域は灰色に。」
 *  「対応国まで斜線で塗るのを辞めろ。」「漏れが多すぎる。」「対応国も増やせ。」
 *  「「ここに水」ネーミングがダサすぎる。」
 *  「CAPE 不安定度（ECMWF）レイヤーの凡例名がECMWF気象になっている。また、凡例がない。その他の
 *    ECMWF系レイヤーも、凡例名がECMWF気象になっている。ECMWFレイヤーはなぜか凡例が連結してしまう。」
 *  「Wind(animated)は色味は段彩ではなくグラデーションに。…点滅してしまうバグが発生する。
 *    未来や過去に変えたとき、読み込みまでの速度が異常におそい。」
 *  「ECMWFの時間UIはボタンがくそ。…再生ボタンと次に行くボタンが同じアイコンというくそ仕様。」
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH. This round's own source comments QUOTE the strings
 *  it removed — the old player glyphs, 「ここに水」, 「ECMWF weather」 — so a check that read the raw
 *  file would fail on the sentence explaining the fix. That is the fifteenth time.
 *  ⚠ EVERY DELETION CHECK ALSO COUNTS WHAT MUST SURVIVE, so a fix that goes too far is red too.
 * ==========================================================================*/
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));

/* ── ⑥ one ECMWF legend per layer, under that layer's own name ───────────────────────────────
   Measured at 1280×800 with three ECMWF layers on: ONE box titled 「ECMWF weather」 holding three
   stacked `.ecl-item`s, 354 px tall.                                                            */
test('#R284 ⑥ every ECMWF layer has its own legend box and its own title', () => {
  const src = WX();
  assert.match(src, /function renderOne\(cfg\)\{[\s\S]*?<h4>'\+ecLbl\(cfg\)\+'<\/h4>/,
    "a layer's box is titled with that layer's own name");
  assert.match(src, /el\.id='data-legend-'\+id;/, 'each box gets its own DOM id');
  assert.ok(!/id='data-legend-ecmwf'/.test(src) && !/data-legend-ecmwf/.test(src),
    'the one shared box is gone');
  /* the forecast axis is a control, so it is its own box — and it still exists */
  /* ⚠ (#R288) THE SHARED PLAYER HAS NO BOX AT ALL ANY MORE — it is the app's own time control
     (「わざわざ分けるな」). What #R284 asserted here is still true: the forecast axis is not crammed
     into a layer's legend under a family name. Each legend states WHICH INSTANT its own picture is
     of, and that line opens the one shared control. */
  /* ⚠ (#R290) …AND THE CONTROL IS BACK IN THE LEGEND — 「個別の時間選択UIを使え」. The floating box
     that opened by itself stays gone (that is what #R288 was asked for, and it is still asserted).
     What changed is where the hour is CHOSEN: in the layer's own legend, from the shared builder,
     with an option per published valid time; `.ecl-when` is now the READING of which instant the
     picture is of rather than a button that opens somebody else's control. */
  assert.ok(!/L\('ECMWF forecast time','ECMWF 予報時刻'/.test(src), 'the separate clock box is gone');
  assert.match(src, /class="ecl-when"/, '…and each legend says which instant its picture is of');
  assert.ok(!/function openClock\(\)/.test(src), 'and nothing opens Chronos on the layer’s behalf');
  assert.match(src, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(cfg\),L\)/,
    '…and the hour is chosen in this box, from the one shared builder');
  assert.match(src, /class="dl-op-row"/,
    '…as is the opacity, which css/intmap.css hides in the Layers panel (#R16)');
  /* the tiler has to be able to see them, or a legend sits on top of the one below it (#R276) */
  /* EVALUATED (#R505): the shipped discovery is run against a document holding boxes built the way
     js/weather.js `newBox` builds them — class `data-legend`, id `data-legend-<layer id>` — under ids
     no list in js/data-layers.js names, so only an id-PREFIX match can find them */
  const DL = codeOnly(read('js/data-layers.js'));
  const boxes = ['ec-slp', 'ec-t2m-later-added'].map((id) => ({ id: 'data-legend-' + id }));
  const other = { id: 'data-legend-nightsat' };
  const doc = { getElementById: () => null,
    getElementsByClassName: (c) => (c === 'data-legend' ? [other, ...boxes] : []) };
  const lgd = (liftFunction(DL, 'discoverLegends').match(/\blgd[A-Z]\w*/g) || []);
  /* eslint-disable no-new-func */
  const discover = new Function('document', ...new Set(lgd), liftFunction(DL, 'discoverLegends') + '\nreturn discoverLegends;')(doc);
  const found = discover().filter(Boolean);
  assert.deepEqual(found.filter((el) => boxes.includes(el)), boxes,
    'the tiler does not see every ECMWF box by id prefix — a box it cannot see sits on top of the one below it (#R276/#R284)');
  assert.ok(!found.includes(other), 'a .data-legend that is neither an ECMWF box nor a generic one was taken as one');
});

/* ── ⑦ the player's five buttons are five different pictures ─────────────────────────────────
   Measured: `⏮ ◀ ▶ ▶ ⦿` — play and next were the same character.                                */
test('#R284 ⑦ no two forecast-player buttons look the same', () => {
  const src = WX();
  const ic = src.match(/const IC=\{[\s\S]*?\n    \};/);
  assert.ok(ic, 'the icon set must exist');
  const paths = [...ic[0].matchAll(/_svg\('([^']*)'\)/g)].map(m => m[1]);
  assert.equal(paths.length, 5, 'five drawn icons');
  assert.equal(new Set(paths).size, 5, 'and no two of them are the same drawing');
  for (const g of ['⏮', '⦿'])
    assert.ok(!src.includes("'" + g + "'"), 'the old glyph ' + g + ' is gone');
  /* both players — the ECMWF box and the wind legend — use the ONE declaration */
  /* ⚠ (#R288) the second player moved OUT of this file and into the app's own time control, so the
     count here is one — and the property #R284 wrote this for (ONE declaration, read by every view,
     so two views cannot disagree about which button is 「再生」) is asserted across both files. */
  assert.equal((src.match(/const IC=\{/g) || []).length, 1, 'there is exactly ONE declaration of them');
  assert.equal((src.match(/IC\.play/g) || []).length, 1, 'the wind legend reads it');
  const tl = codeOnly(read('js/news-timeline.js'));
  assert.match(tl, /P\.IC\.play/, '…and so does the time machine');
  assert.match(tl, /P\.IC\.next/, '…for every button');
  assert.match(tl, /const P=window\.IntMapWxPlayer;/, '…from the same declaration');
});

/* ── ⑧ the wind ramp is continuous, and its anchors are the same colours ─────────────────────
   The SDK has two colour-scale types and NEITHER interpolates: a 17-entry table paints 17 flat
   bands. Measured on the built page: 601 stops, largest adjacent channel step 4/255, and the
   scanline over the Atlantic carried 46 of 51 colours the 17-band table could not produce.      */
test('#R284 ⑧ the wind colour table is resampled, not rewritten', () => {
  const src = EC();
  assert.match(src, /var WIND_ANCHORS = \{/, 'the anchors are declared on their own');
  assert.match(src, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/, 'and resampled at 0.1 m/s');
  const a = src.match(/var WIND_ANCHORS = \{[\s\S]*?\n  \};/)[0];
  /* (#R293) windy.com's own colours now — the two that changed are the ones that were furthest
     from Windy's (「高風速帯でも同じになるように」): 25 m/s was red and is slate blue, and the top of
     the scale was near-white and is grey. The first entry is unchanged because it always matched. */
  for (const c of ['[98, 113, 184, 1]', '[129, 129, 129, 1]', '[91, 101, 158, 1]'])
    assert.ok(a.includes(c), 'the colour ' + c + ' is unchanged');
  assert.ok(a.includes('[0, 1.1, 3, 5, 7, 9, 10, 10.5, 11, 13, 15, 17, 19, 19.7, 21, 24, 25.3, 27, 29,'),   /* (#R293) windy.com's own, measured */
    'and so are the seventeen speeds they sit at');
  /* a 601-stop table must not become a 601-stop CSS gradient in the legend */
  assert.match(src, /if \(draw\.length > 64\)/, 'the legend thins the gradient it draws');
  assert.match(src, /return \{ unit: s\.unit \|\| '', min: min, max: max, stops: stops,/,
    'while `stops` — the numbers a caller reads — stays complete');
});

/* ── ⑨ the axis moves once per gesture, and the particles are never erased ───────────────────
   Measured: a twelve-step drag produced 12 `index` events and ONE `time` event (it had produced
   twelve full field loads and twelve layer rebuilds), and the particle renderer drew on every one
   of 22 sampled frames, minimum 1,513 segments.                                                 */
test('#R284 ⑨ a slider drag is one forecast step, and it does not blank the animation', () => {
  const ec = EC();
  assert.match(ec, /timeT = setTimeout\(fireTime, COALESCE_MS\);/, 'the expensive event is coalesced');
  assert.match(ec, /emit\('index', \{ index: idx, validTime: meta\.validTimes\[idx\] \}\);/,
    'and a cheap one fires immediately so the clock follows the finger');
  assert.match(ec, /function step\(n\) \{[^}]*setIndex\(\(\(idx \+ n\) % c \+ c\) % c, \{ now: true \}\)/,
    'a click is a decision, not a sweep — it fires at once');
  const wx = WX();
  assert.ok(!/renderer\.setField\(null\)/.test(wx),
    'a time change must not erase the field the particles are reading');
  assert.match(wx, /if\(ev\.type==='index'\)\{ touchWindTime\(\); return; \}/,
    'the wind legend follows the cheap event');
  assert.match(wx, /if\(ev\.type==='index'\)\{ touchTime\(mine\); return; \}/,
    'and so does the ECMWF box');
  /* the forecast step builds the new hour beside the old one instead of removing it first */
  assert.match(wx, /function applyTime\(only\)\{[\s\S]*?dropSlot\(cfg,nu\);[\s\S]*?setOpSlot\(cfg,nu,0\);[\s\S]*?dropSlot\(cfg,old\);/,
    'two slots: the old picture stays up until the new one has painted');
});
}

/* ══════════ from tests/r297-checks.test.mjs — 3 of its 13 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/weather.js は DOM に閉じたファクトリ、js/wx-ecmwf.js は読み込み時に Open-Meteo の SDK と fetch を要するため node では組み立てられない（アンカー表と rampFrom は切り出して実行している） */
/* (#R297) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */

/* ── ⑤ the wind reads what is on screen first ─────────────────────────────────────────────────── */
test('R297 ⑤ the wind starts on the band around the view and widens behind it', () => {
  const s = read('js/weather.js');
  assert.match(s, /function nearBand\(\)/, 'the narrow band exists');
  assert.match(s, /EC\(\)\.bandNear\(b\.getSouth\(\),b\.getNorth\(\)\)/);
  assert.match(s, /if\(!EC\(\)\.bandCovers\(EC\(\)\.heldBand\(VAR\),b\)\) b=nearBand\(\)\|\|b;/,
    'a frame that already covers the view is not narrowed');
  assert.match(s, /function widen\(\)/, 'and the wide read follows');
  assert.match(s, /setTimeout\(widen,0\);/, 'it is started as soon as the first frame is in hand');
  /* the wide read must not be skipped, or the top and bottom of the screen never get a field */
  /* ⚠ (#R305) the rung carries a fourth argument — 「this module started it」, so it yields its
     place in the queue to a read the reader is waiting for. The relation is unchanged: the wide
     read still happens, and it still follows the narrow one. */
  assert.match(s, /EC\(\)\.load\(VAR,null,want,true\)\.then\(f=>\{ widening=false;/);
});

/* ── ⑥ a slot is uncovered only when it has painted ───────────────────────────────────────────── */
test('R297 ⑥ the new hour is revealed on a TILE, not on an empty source calling itself loaded', () => {
  const s = read('js/weather.js');
  assert.match(s, /const h=\(e\)=>\{ if\(e&&e\.sourceId===sid&&e\.tile&&e\.isSourceLoaded\) fin\(\); \};/,
    'a tile has to have landed');
  /* and the fallback is still there — an off-screen source never gets a tile event */
  assert.match(s, /setTimeout\(fin,maxMs\|\|12000\);/);
});

/* ── ⑦ the wind key reads to 30 m/s, and says that the ramp continues ─────────────────────────── */
test('R297 ⑦ the wind legend is capped at 30 m/s and the top tick carries a +', () => {
  const e = read('js/wx-ecmwf.js');
  assert.match(e, /var LEGEND_MAX = \{ wind: 30 \};/);
  assert.match(e, /function legendMax\(variable\)/);
  assert.match(e, /if \(cap != null && cap > min && cap < max\) max = cap;/);
  assert.match(e, /if \(bp\[i\] > max\) break;/, 'the stops stop where the key stops');
  assert.match(e, /capped: \(cap != null/, 'and the caller is told the ramp continues');
  /* the colour table itself is untouched — #R293 fitted it to Windy's own RGBA() */
  assert.match(e, /breakpoints: \[0, 1\.1, 3, 5, 7, 9, 10, 10\.5, 11, 13, 15, 17, 19, 19\.7, 21, 24, 25\.3, 27, 29,/,
    'the 27 measured stops are unchanged');
  const w = read('js/weather.js');
  const plus = (w.match(/lg\.capped\)\?'\+':''/g) || []).length;
  assert.ok(plus >= 2, 'both the wind box and the ECMWF boxes mark it, got ' + plus);
});
}

/* ══════════ from tests/r305-checks.test.mjs — 6 of its 17 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/weather.js は DOM に閉じたファクトリ、js/wx-ecmwf.js は読み込み時に Open-Meteo の SDK と fetch を要するため node では組み立てられない（アンカー表と rampFrom は切り出して実行している）。index.html の dns-prefetch は 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である */
/* (#R305) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-five times; ask the question of the text that RUNS. */
const WX = () => noComments(read('js/weather.js'));
const EC = () => noComments(read('js/wx-ecmwf.js'));

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」
 * ==========================================================================================*/

/* ── ⑦ one reader, one at a time — and the reader's own request goes first ───────────────────
   The single chain was right about the SDK's shared `omFileReader` and silently also FIFO. Two
   background readers (the widening staircase, the warm-up of the next hour) shared it with the read
   a person was waiting for. */
test('R305 ⑦ the read queue has a lane for the reader and a lane for this module', () => {
  const s = EC();
  assert.match(s, /var qHi = \[\], qLo = \[\], runHi = 0, runLo = 0;/, 'two lanes, one pump');
  assert.match(s, /function serial\(fn, bg\) \{[\s\S]{0,240}?\(bg \? qLo : qHi\)\.push/,
    'a background read goes in the low lane');
  assert.match(s, /while \(runHi < HI_MAX && qHi\.length\)/,
    'and the foreground lane is drained first');
  /* ⚠⚠⚠ (#R310) THE HALF THIS ROUND COULD NOT FIX WAS THAT A RUNNING JOB CANNOT BE TAKEN BACK. It
     wrote that down itself — 「a background read already running still has to finish (the SDK cannot
     be interrupted)」 — and measured the consequence: a step at 2,393 ms and the next one at
     7,343 ms. That was true of ONE reader. #R310 gives every file its own reader, so a foreground
     read no longer WAITS for a background one; it starts beside it. The lane ORDER is what stays,
     and it is now about bandwidth rather than corruption: a background read does not START while
     the reader is waiting for one. */
  assert.match(s, /while \(runLo < LO_MAX && !qHi\.length && runHi === 0 && qLo\.length\)/,
    'a background read starts only when nothing the reader is waiting for is running');
  assert.match(s, /var HI_MAX = 1, LO_MAX = 1;/,
    "and neither lane runs two of its own at once, which would halve each read's share");
  assert.ok(!/var chain = Promise\.resolve\(\);/.test(s), 'the single FIFO chain is gone');
});

/* ── ⑧ …and the two reads this module starts on its own are IN that lane ─────────────────────*/
test('R305 ⑧ the warm-up and the widening rung are background reads', () => {
  const s = EC();
  /* (#R310) …and a second one beside it: `ahead`, for a read of an hour nobody is looking at yet. */
  assert.match(s, /function load\(variable, i, bounds, bg(, ahead)?\) \{/, 'load carries the flag');
  /* (#R310) the queued half is assigned rather than chained straight into `.catch`, so the job
     handle can travel with the promise a joiner receives (see `promote`). The relation — the flag
     reaches the queue, and a failed read answers null rather than throwing — is unchanged. */
  assert.match(s, /\}, !!bg\);/, '…and passes it to the queue');
  assert.match(s, /\.catch\(function \(\) \{ return null; \}\)/, '…and a failed read answers null');
  assert.match(s, /function readAhead\(variable, i, bounds\)/, '(#R310) …and the ahead read is one named door');
  assert.match(s, /\}, true\)\.catch\(function \(\) \{ delete warmed\[mark\]; \}\);/,
    'the next-hour warm-up is background');
  const wx = WX();
  assert.match(wx, /EC\(\)\.load\(VAR,null,want,true\)\.then\(f=>\{ widening=false;/,
    'a widening rung is background');
  /* the read the reader is waiting for is NOT */
  assert.match(wx, /return EC\(\)\.load\(VAR,null,b\);/, "…and the step's own read is not");
});

/* ── ⑨ the hour that is warmed is warmed at the band the step will actually read ─────────────
   #R290 追記2 wrote the rule and spelled it `band()`, which is `bandFor` — and `bandFor` answers
   NULL (「the planet」) for the view this app opens on. */
test('R305 ⑨ the warm-up asks for the band, not the planet', () => {
  const s = WX();
  /* ⚠ (#R310) the call is `readAhead` now (it keeps the frame instead of only the bytes) and it
     names the variable the layer draws rather than the pair the derivation rule expands it to. The
     relation is the BAND: `nearBand()||band()`, which is what a future hour will actually be read
     at — `band()` alone is the planet at world zoom, and that is what #R305 measured and removed. */
  assert.match(s, /EC\(\)\.(readAhead\(VAR|prefetch\(\['wind_u_component_10m','wind_v_component_10m'\]),nx,nearBand\(\)\|\|band\(\)\)/,
    'the warm-up band is the one a future hour will be read at');
  assert.ok(!/prefetch\(\['wind_u_component_10m','wind_v_component_10m'\],Math\.min\(EC\(\)\.count\(\)-1,EC\(\)\.index\(\)\+1\),band\(\)\)/.test(s),
    'and never `band()` alone, which is the planet at world zoom');
});

/* ── ⑩ the hour that is warmed is the one the reader is heading TOWARDS ──────────────────────*/
test('R305 ⑩ the warm-up follows the direction of travel', () => {
  const s = WX();
  assert.match(s, /let _lastIdx=-1, _stepDir=1;/, 'the axis has two directions and one default');
  assert.match(s, /if\(_lastIdx>=0&&i!==_lastIdx\) _stepDir=\(i>_lastIdx\)\?1:-1;/,
    'the direction is measured from the axis, not assumed');
  assert.match(s, /const n=EC\(\)\.count\(\), nx=Math\.max\(0,Math\.min\(n-1,EC\(\)\.index\(\)\+_stepDir\)\);/,
    'the warmed hour is the neighbour in that direction, inside the axis');
  assert.match(s, /if\(nx!==EC\(\)\.index\(\)\)/, 'and the end of the axis warms nothing');
});

/* ── ⑪ 「still」 includes the arrival, and the planet costs a longer wait than a band ─────────
   A read that takes 2.4 s had already been 「still」 for 1.5 s by the time it answered, so the
   staircase started its next rung the instant the reader could see the picture they asked for. */
test('R305 ⑪ the quiet window restarts when the field lands', () => {
  const s = WX();
  assert.match(s, /const STILL_MS=900, BIG_STILL_MS=2500;/, 'two windows, one for a rung that reads the planet');
  /* ⚠ the comment that says so is stripped before this runs — ask the code. `stir` stamps the same
     clock, so the line is identified by what it follows: the read that has just succeeded. */
  assert.match(s, /failN=0; if\(retryT\)\{ clearTimeout\(retryT\); retryT=0; \}\s*\n\s*stillAt=Date\.now\(\);/,
    'a landed field restarts the window');
  assert.match(s, /const need=\(want===null\)\?BIG_STILL_MS:STILL_MS;/,
    'a rung that is the planet waits the longer window');
  assert.match(s, /const rest=moving\?need:\(need-\(Date\.now\(\)-stillAt\)\);/,
    '…and the wait is measured against the same clock as before');
  /* the rung is chosen BEFORE the wait, or its size could not choose the window */
  assert.match(s, /const want=wideStep\(have,full\);\s*\n\s*const need=/,
    'the rung is decided first and the window follows from it');
});

/* ── ⑫ the hosts the wind layer needs are resolved before it is switched on ──────────────────*/
test('R305 ⑫ the tile SDK and the archive get a name resolution hint', () => {
  const h = read('index.html');
  assert.match(h, /<link rel="dns-prefetch" href="https:\/\/unpkg\.com">/, 'the SDK host');
  /* ⚠ (#R514) THE ARCHIVE HOST IS READ FROM THE REGISTRY, NOT SPELLED HERE. This line used to pin
     map-tiles.open-meteo.com — and that name was retired upstream, so the hint it required was a
     lookup that could only fail. A prefetch is a claim about the host the code will read from;
     the only place that host is spelled is js/wx-models.js, so that is what the hint is compared
     against, and a host that moves moves the expectation with it. */
  const win = {};
  new Function('window', read('js/wx-models.js')).call(win, win);
  const archive = new URL(win.IntMapWxModels.HOST).origin;
  assert.ok(h.includes('<link rel="dns-prefetch" href="' + archive + '">'), 'the archive host (' + archive + ')');
  /* ⚠ a HINT, not a preload — the first view uses neither, which is the rule the block states */
  assert.ok(!/rel="preload"[^>]*unpkg\.com/.test(h), 'nothing is downloaded for a layer nobody switched on');
});
}

/* ══════════ from tests/r307-checks.test.mjs — 2 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/weather.js は DOM に閉じたファクトリ、js/wx-ecmwf.js は読み込み時に Open-Meteo の SDK と fetch を要するため node では組み立てられない（アンカー表と rampFrom は切り出して実行している）（ブロックの大きさの算術は評価している） */
/* (#R307) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* the comments in this project carry the reasoning, and several of them QUOTE the spellings that
   were replaced — a check that greps them proves nothing */
const code = (p) => codeOnly(read(p));

/* the body of a named function declaration, brace-balanced (the #R228 helper, and the answer to
   #R306's ⚠ about character-counted windows: ask the BODY, not a byte range around a name) */
function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
/* a `var NAME = <arithmetic>` initialiser, evaluated — `constFrom` only reads plain literals and
   these are written as `64 * 1024` so the relation between them stays readable */
function numFrom(src, name) {
  const m = new RegExp('\\b' + name + '\\s*=\\s*([0-9*+ ]+)').exec(src);
  assert.ok(m, name + ' is declared as arithmetic on numbers');
  return Function('return (' + m[1] + ')')();
}

/* ══ ⑦⑧ 風 ═══════════════════════════════════════════════════════════════════════════════════ */
test('R307 ⑦ the block cache is given room for a whole read without making the requests bigger', () => {
  const s = code('js/wx-ecmwf.js');
  const bytes = numFrom(s, 'BLOCK_BYTES');
  const max = numFrom(s, 'BLOCK_MAX');
  /* `blockSize()` IS the HTTP request size: raising it over-fetches at both ends of every span and
     punishes the raster tiles, which share this reader. Measured: 512 kB blocks turned 6.31 MB of
     wanted bytes into 9.00 MB. */
  assert.ok(bytes <= 64 * 1024, 'the block — and therefore the request — is not bigger than the SDK default');
  /* the ceiling is what was wrong: 128 × 64 kB is 8 MB against an 8.63 MB working set, so the read
     evicted its own blocks and re-downloaded 3.5 MB. A whole-globe read of u+v is ~16 MB. */
  assert.ok(bytes * max >= 16 * 1024 * 1024,
    'and the cache holds a whole-globe read, so nothing a read is still using is evicted');
  assert.ok(/fileReaderConfig: Object\.assign\(\{\}, base\.fileReaderConfig, \{ cache: blockCache\(BLOCK_BYTES, BLOCK_MAX\) \}\)/.test(s),
    'the reader is actually given it');
});

/* ⚠⚠ (#R308) THIS TEST PINNED FOUR SPELLINGS AND #R308 WAS TOLD TO CHANGE THREE OF THEM. It required
   the stage-in to be `bytes=-' + TOUCH_BYTES`, to be EXACTLY `BLOCK_BYTES`, and it wrote both call
   sites out character by character. #R308 measured that the four seconds is the REQUEST and not its
   size (a one-byte suffix range stages the object identically), which makes 「it is exactly the first
   block the SDK will ask for」 a claim about a trade that is no longer worth making — 20 ms of CDN hit
   against a quarter of a megabyte per hour. What #R307 actually established, and what survives, is
   below, asked of the function bodies rather than of their spelling. */
test('R307 ⑧ the forecast file is staged before it is read, and the window is a reader’s', () => {
  const s = code('js/wx-ecmwf.js');
  const t = fnBody(s, 'touch');
  assert.ok(/Range/.test(t), 'the stage-in is a ranged request');
  const rng = /Range:\s*([A-Za-z_$][\w$]*)/.exec(t);
  const where = rng ? s.slice(0, s.indexOf('function touch(')) + t : t;
  assert.match(where, /bytes=-/,
    'and what it asks for is a suffix range against the END of the file');
  assert.ok(/touched\[f\]/.test(t), 'once per file, ever');
  assert.ok(!/omFileReader|serial\(/.test(t), 'and outside the one reader’s queue');

  /* the axis moves on every clock tick whether or not a weather layer is on (`_followClock`), and
     `sdk` is only ever loaded by `ready()`, i.e. by something that is about to read. ⚠ #R308 stages
     the OPENING hour from `fetchMeta` for every session — one request of one byte — but the WINDOW
     around it still belongs to a reader who is actually reading. */
  const si = fnBody(s, 'setIndex');
  assert.ok(/if \(sdk[\s\S]{0,80}?touchAround\(/.test(si),
    'the window is only staged for a session that has loaded the reader');
  const rd = fnBody(s, 'ready');
  assert.ok(/touchAround\(idx/.test(rd),
    'and a consumer stages it the moment the axis lands, in parallel with the SDK download');
  /* both directions, and further ahead than behind — #R305 measured that one-ahead-on-stillness is
     outrun by a reader who steps every second */
  const ta = fnBody(s, 'touchAround');
  assert.ok(/_touchDir/.test(ta), 'the window follows the direction the reader is going');
  assert.ok(/\+ j \* _touchDir|\+ _touchDir/.test(ta) && /- .*_touchDir/.test(ta),
    'and it reaches both ahead of the reader and behind them');
});
}
