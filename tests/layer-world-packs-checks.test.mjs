/* ============================================================================
 *  The world-data families (js/world-packs.js, js/industry-web.js): trade, energy mix, crops, tides and their panels
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r212-checks.test.mjs, tests/r215-checks.test.mjs, tests/r216-checks.test.mjs, tests/r254-checks.test.mjs, tests/r297-checks.test.mjs, tests/r499-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r212-checks.test.mjs — 4 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* R212 — source-level checks.
 *
 * Every assertion here is a RELATION, not a value (#R203's trap, six times over by #R211): "the
 * arrow layer reads its icon from the feature" rather than "the icon is called wp-arrow-X", "the
 * alpha IS the slider" rather than "the alpha is 0.45". The eclipse block is the exception and is
 * deliberately numeric — those numbers are the published catalogue, and matching them is the whole
 * claim. */

/* ── 1. the trade flow is an ARROW, and it points the way the goods move ───────────────────────── */
test('R212 ①: trade arcs carry direction — an icon layer along the line, and imports run partner→home', () => {
  const s = read('js/world-packs.js');
  /* ⚠⚠ (#R258) REPLACED, BY INSTRUCTION, NOT BY DRIFT. 「誰が線に複数矢印つけろって言ってんねん。」
     — #R212 read 「矢印にしろ」 as «put arrowheads on the line» and placed one every 110 px. The
     round that asked for it says that is not what it meant: the flow is ONE arrow. So the
     along-the-line repeater is gone and what this test pins is what makes the picture an arrow —
     a head at the destination, in the shaft's colour, with the shaft stopping at its base. */
  assert.doesNotMatch(s, /id:'wp-trade-arrow'/, 'the along-the-line repeater is back');
  /* ⚠ (#R261) the window was 400 chars and #R261's note about `icon-rotation-alignment:'viewport'`
     pushed `icon-anchor` past it. A character budget between two facts is a tripwire on COMMENTS,
     not on behaviour — it is the layer definition that has to be searched, so it is bounded by the
     next layer instead. */
  const tip = /id:'wp-trade-tip'[\s\S]*?\}\);/.exec(s);
  assert.ok(tip, 'the tip layer is defined');
  assert.match(tip[0], /'icon-anchor':'top'/,
    'the single head is anchored by its TIP, on the arc’s last vertex');
  assert.match(s, /'icon-image':\['get','ai'\]/, 'the icon comes from the feature, so both directions can coexist');
  /* the coordinate order IS the direction: exports leave home, imports arrive at it */
  assert.match(s, /dir==='X'\)\?greatCircle\(home,c,\d+\):greatCircle\(c,home,\d+\)/,
    'the arc is reversed for imports rather than the arrowheads being flipped separately');
});

/* ── 2. a panel closed is a layer off ─────────────────────────────────────────────────────────── */
test('R212 ②: every world-data panel drives its own layer row when it is closed', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /function makePanel\(id,title,cbId/, 'makePanel takes the row it belongs to');
  /* ⚠ (#R215) THE ✕ IS THE LEGEND'S OWN NOW. 「いや汎用の凡例の方に統合させろ。余計な例外作んなぼけ」 —
     the panel is no longer a window of this file's making, it IS `.data-legend.generic-legend`, whose
     ✕ was already wired to `dataset.cbId` in js/data-layers.js. The CLAIM is unchanged (closing the
     window turns the layer off); what changed is that there is one implementation of it instead of
     two, which is what the report asked for. So this asserts the binding, not the old markup. */
  assert.match(s, /_registerLayerOpacity\(LID,\s*names\(\),\s*layers\(\),\s*cbId\)/, 'the panel hands its row to the legend');
  assert.match(read('js/data-layers.js'), /el\.dataset\.cbId&&document\.getElementById\(el\.dataset\.cbId\)/,
    'and that legend’s ✕ unticks exactly that row');
  assert.match(s, /function uncheckRow\(cbId\)/, 'the row-unticking helper is still published for the families that need it');
  /* …and every panel actually passes one */
  const panels = [...s.matchAll(/makePanel\('([\w-]+)'\s*,[\s\S]{0,560}?\}\s*\)\s*;/g)].map((m) => m[0]);
  assert.ok(panels.length >= 5, 'all five families make a panel (found ' + panels.length + ')');
  for (const p of panels) assert.match(p, /'wp-dl-[a-z]+'/, 'this panel was created without a row id: ' + p.slice(0, 80));
});

/* ── 3. electricity and primary energy are ONE layer with a switch ─────────────────────────────── */
test('R212 ③: the energy mix is one row, and its legend is built from the paint ramp', () => {
  const s = read('js/world-packs.js');
  assert.ok(!/'wp-dl-elec'|'wp-dl-prim'/.test(s), 'the two separate rows are gone');
  assert.match(s, /\['energy','#[0-9a-f]{6}',v=>window\.__wpEnergy\.toggle\(v\)\]/, 'one row drives one toggle');
  /* the legend and the paint expression must come from the SAME array — one ramp, not two copies */
  assert.match(s, /const ENERGY_RAMP=\{/, 'the ramp is data at the factory top level (#R211)');
  assert.match(s, /ramp=\['interpolate',\['linear'\],\['to-number',\['feature-state',key\],-1\]\]\s*\n?\s*\.concat\(ENERGY_RAMP\[k\]/,
    'the paint expression is built FROM the ramp');
  assert.match(s, /rampLegend\(ENERGY_RAMP\[k\]\.map/, 'and so is the legend');
});

/* ── 5. crops are a crop raster, not a country choropleth ──────────────────────────────────────── */
test('R212 ⑤: the crop layer draws FAO GAEZ cells, and its scale does not move when you pan', () => {
  const s = read('js/world-packs.js');
  assert.ok(!/wpCrop'|'wp-crop-fill'/.test(s), 'the per-country fill is gone');
  assert.match(s, /gaez-services\.fao\.org\/server\/rest\/services\/res06\/ImageServer/, 'GAEZ res06');
  assert.match(s, /computeStatisticsHistograms/, 'the stretch uses the raster’s own measured range');
  assert.match(s, /DRA:false/, 'and NOT a per-view dynamic range — the same colour must mean the same number');
  assert.match(s, /\/identify\?/, 'a tap asks the server for the value in that cell');
});
}

/* ══════════ from tests/r215-checks.test.mjs — 7 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）・js/industry-web.js も同じ */
/* ============================================================================
 *  R215 — Node checks: one window per layer, the coast at the field's own grain,
 *         great-circle solids, the Wikidata split, and a ★ card that cannot throw
 * ----------------------------------------------------------------------------
 *  ⚠ #R203's trap, restated: DO NOT pin the previous round's VALUES. Each check below is either an
 *  IDENTITY (true for every input) or a CLAIM the code makes about itself — never a constant that a
 *  later round could legitimately change while keeping every promise.
 * ==========================================================================*/

/* ═══ ① ONE WINDOW PER LAYER — THE WORLD-DATA FAMILIES RENDER INTO THE GENERIC LEGEND ═════════
   「いや汎油の凡例の方に統合させろ。余計な例外作んなぼけ」 — the failure this guards is a SECOND
   floating box appearing beside the app's own legend, which is what the report was about. */
test('R215 ①a: the world-data panel is the generic legend, not a window of its own', () => {
  const wp = read('js/world-packs.js');
  /* it must go through the app's own legend machinery… */
  assert.match(wp, /_registerLayerOpacity/, 'the panel registers through the standard legend/opacity path');
  assert.match(wp, /_hideGenericLegend/, 'closing the layer hides that same legend');
  /* …and must NOT build its own positioned container any more */
  assert.equal(/position:fixed;left:16px;top:96px/.test(wp), false,
    'no hand-positioned floating panel is created — the legend owns its own position (tileLegends)');
  assert.match(wp, /className='wp-body'/, 'the family renders into a .wp-body inside the legend');
  assert.match(read('css/intmap.css'), /\.data-legend \.wp-body/, '…and that body is styled as part of the legend');
});

test('R215 ①b: every world-data family names the legend it renders into', () => {
  const wp = read('js/world-packs.js');
  const iw = read('js/industry-web.js');
  const ids = [...(wp + iw).matchAll(/legendId:\s*'([a-z0-9]+)'/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'two families sharing one legend id would overwrite each other');
  assert.ok(ids.length >= 6, `all six families declare a legend id (found ${ids.length}: ${ids})`);
  /* and each declares the layers that legend's opacity slider drives, or the slider drives nothing */
  const layerThunks = [...(wp + iw).matchAll(/layers:\s*\(\)\s*=>/g)].length;
  assert.equal(layerThunks, ids.length, 'every legendId comes with the layer ids it owns');
});

test('R215 ①c: the crop panel does not offer the 10 m land cover', () => {
  const wp = read('js/world-packs.js');
  assert.equal(/wp-c-lc/.test(wp), false, '「いやなんでここに10m被覆載せるんだよ。別物やろが」');
  assert.equal(/eco-dl-worldcover/.test(wp), false, 'and it does not reach for that checkbox either');
});

/* ═══ ④ THE INDUSTRY WEB'S QUERIES ═══════════════════════════════════════════════════════════
   「Wikidata に接続できませんでした：クエリが25秒を超えました。何も描いていません。…←は？」 */
test('R215 ④a: the node query carries no ownership join, and the edges are VALUES-bound', () => {
  const iw = read('js/industry-web.js');
  const nodes = iw.slice(iw.indexOf('function sparqlNodes'), iw.indexOf('    /* `prop` runs owner'));
  assert.equal(/P749|P127|P355|GROUP_CONCAT/.test(nodes), false,
    'the ownership OPTIONAL is what made the node query a coin toss — it is not in it');
  const owners = iw.slice(iw.indexOf('function sparqlOwners'), iw.indexOf('const EDGE_PROPS'));
  assert.match(owners, /VALUES \?c/, 'the edges are bound by ids already known — the same lesson as the money queries');
  assert.equal(/UNION/.test(owners), false, 'one property per query, never a UNION (#R213 measured 65.6 s for that)');
});

test('R215 ④b: the secondary queries are rate-limited and each failure is its own sentence', () => {
  const iw = read('js/industry-web.js');
  assert.match(iw, /lane\(moneyJobs\.concat\(edgeJobs\),\s*2\)/, 'they run two at a time, not six at once');
  assert.match(iw, /edgeErr/, 'a refused ownership query is reported as a failure, not as "owns nobody"');
  assert.match(iw, /moneyErr/, '…and so is a refused money query (#R213)');
  /* the deadline must be a genuine "something is wrong" bound, not one the normal case has to beat */
  const to = /}, (\d+)\);\s*$/m.exec(iw.slice(iw.indexOf('const to = setTimeout'), iw.indexOf('const to = setTimeout') + 200));
  assert.ok(to && +to[1] >= 30000, `the deadline is above the measured worst case (got ${to && to[1]})`);
});

/* ═══ ⑧ THE TIDE LAYER IS A LAYER ════════════════════════════════════════════════════════════
   「（追記：いやさぼってんじゃねーよ。指示通り作れ）」 */
test('R215 ⑧: switching tides on opens its window and awaits the mask it samples', () => {
  const wp = read('js/world-packs.js');
  const scan = wp.slice(wp.indexOf('function scanCoast()'), wp.indexOf('function overview(failed)'));
  assert.match(scan, /LM\.warm\(\)\s*:\s*null/, 'the land mask is AWAITED — firing warm() and reading ready() is the bug');
  assert.match(scan, /\.then\(\(\)=>scanNow/, '…and the sampling happens after it resolves');
  assert.match(scan, /rearm/, 'a scan that answered nothing does not latch the view against a retry');
  /* ⚠ matched with a regex rather than by slicing between two literal strings: this working copy is
     checked out with CRLF on Windows and committed with LF, so a search key containing "\n" finds
     nothing after a branch switch and the slice silently becomes the whole file. Same class of trap
     as #R203's pinned literals — the assertion has to survive things that are not the subject. */
  const toggle = /function toggle\(v\)\{ on=v;[\s\S]{0,600}?clearFlood\(\);[\s\S]{0,600}?whenDrawable\(/.exec(wp);
  assert.ok(toggle, 'the tide toggle is where this test expects it');
  assert.match(toggle[0], /overview\(\)/, 'the window opens with the layer rather than on a tap');
  assert.match(toggle[0], /scanning=true/, '…and says it is scanning until the mask has answered');
});

/* ═══ ⑨ THE TRADE LAYER PAINTS THE COUNTRIES ═════════════════════════════════════════════════
   「貿易レイヤーは該当国がぬられるように」 */
test('R215 ⑨: trade shades the countries on the app’s own country source', () => {
  const wp = read('js/world-packs.js');
  const i = wp.indexOf("const CHORO='wp-trade-fill'");
  assert.ok(i > 0, 'there is a trade choropleth');
  const blk = wp.slice(i, i + 1400);
  assert.match(blk, /source:'countries'/, 'on the SAME country geometry every other layer uses (「いつもの国境線」)');
  assert.match(blk, /feature-state','wpTrade'/, 'driven by feature-state, so it repaints without rebuilding geometry');
  assert.match(blk, /wpTradeH/, 'and the selected country reads as itself, not as its own partner');
  /* (#R216) …and it now hands over a REPAINT: the flush clears feature state, so a flush that
     succeeds after the colours are on would blank the choropleth it just improved. */
  assert.match(wp, /hiResCountries\((?:\)|\(\)=>)/, 'and it asks for the 10 m outline rather than drawing the 110 m boot copy');
});
}

/* ══════════ from tests/r216-checks.test.mjs — 6 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）・js/industry-web.js も同じ */
/* ============================================================================
 *  #R216 — source-level checks
 * ----------------------------------------------------------------------------
 *  The same shape as tests/r215-checks: these assert IDENTITIES and SELF-DECLARATIONS,
 *  not pixel values. Each one is the invariant a defect this round fixed would break,
 *  written so a future edit that reintroduces the defect fails here rather than in a
 *  report six rounds later.
 *
 *  ⚠ REGEXES, NOT LITERAL SUBSTRINGS WITH NEWLINES IN THEM — #R215 recorded that Windows
 *  checks the tree out with CRLF, so a literal '…\n  if(' silently stops matching the
 *  moment a branch is switched.
 * ==========================================================================*/

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
/* ⚠ a comment that DESCRIBES a defect is not the defect. Two checks below assert that a string does
   NOT appear in a file, and both files explain in prose why it must not — so they are read with the
   block comments taken out, or the note about the bug would trip the test for the bug. */
const code = (p) => codeOnly(read(p));

/* ── ② closing a world-data legend must stay closed ──────────────────────────────────── */
test('#R216 ② makePanel.claim() cannot re-open a panel the user closed', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /let\s+_want\s*=\s*false/, 'the panel has no idea whether it should be shown');
  /* hide() records the intent and claim() restores it — _registerLayerOpacity ends with
     display='block', which is what made the trade window come back a moment after every close */
  assert.match(s, /hide\(\)\s*\{\s*_want\s*=\s*false/, 'hide() does not record the intent');
  assert.match(s, /claim\(\)\s*\{[\s\S]{0,220}if\(!_want\)/, 'claim() does not respect it');
});

/* ── ③ the industry picker must reach the map ────────────────────────────────────────── */
test('#R216 ③ industry-web uses the engine contract name for source data', () => {
  const s = code('js/industry-web.js');
  assert.equal(/layers\.setData\s*\(/.test(s), false,
    'layers.setData is not on the renderer contract — it is setSourceData (js/geo-engine.js)');
  assert.match(s, /layers\.setSourceData\(\s*SRC_EDGE/, 'the edge source is never updated');
  assert.match(s, /layers\.setSourceData\(\s*SRC_NODE/, 'the node source is never updated');
});
test('#R216 ③ …and nothing else in js/ calls the non-existent name either', () => {
  /* the contract is one word; a second caller of the wrong one would fail the same silent way */
  const files = ['js/industry-web.js', 'js/world-packs.js', 'js/ocean-currents.js'];
  for (const f of files) assert.equal(/\.layers\.setData\s*\(/.test(code(f)), false, f + ' calls layers.setData');
});

/* ── ④ the choropleths get the 10 m outline ──────────────────────────────────────────── */
test('#R216 ④ the country-geometry flush can be forced by a layer that is about to draw', () => {
  const a = read('js/app-body.js');
  assert.match(a, /_imFlushCountryGeo\s*=\s*function\(force\)/, 'the flush takes no force flag');
  assert.match(a, /force\s*===\s*true\s*\|\|\s*countryInfoOn/, 'the Countries-info gate is still the only way in');
  const w = read('js/world-packs.js');
  assert.match(w, /_imFlushCountryGeo\(true\)/, 'the world-data families do not ask for it');
  /* setSourceData clears feature state, so a flush that lands after the paint must repaint */
  assert.match(w, /function hiResCountries\(after\)/, 'the retry cannot repaint');
  assert.match(w, /hiResCountries\(\(\)=>\{\s*if\(on\)\s*paint\(\);\s*\}\)/, 'energy does not repaint after a late flush');
});

/* ── ⑤ the crop raster is opaque where it has data ───────────────────────────────────── */
test('#R216 ⑤ crops bake no alpha ramp — opacity belongs to the slider', () => {
  const s = read('js/world-packs.js');
  assert.equal(/0\.30\s*\+\s*0\.70\s*\*\s*\(g\s*\/\s*255\)/.test(s), false,
    'the value is being written into the PNG alpha again, so 100 % can never be 100 %');
  assert.match(s, /px\[i\s*\+\s*3\]\s*=\s*255|px\[i\+3\]=255/, 'a data cell is not opaque');
});

/* ── ⑥ the tide panel drives the ONE clock ──────────────────────────────────────────── */
test('#R216 ⑥ tides get a date field and playback, and no clock of their own', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /class="wp-t-when"\s+type="datetime-local"/, 'no date/time field');
  assert.match(s, /class="wp-t-play"/, 'no play button');
  /* ⚠ (#R297) the instant is SNAPPED to the marine model's own hour on the way in — 「データのある
     時間のみを選べる、離散的な感じに」. What #R216 pinned is unchanged and is what is asserted here:
     the tide layer writes the ONE master clock and keeps no clock of its own. */
  assert.match(s, /window\.IntMapTime\.set\(new Date\(snapHour\(ms\)\),\{allowFuture:true,source:'tides'\}\)/,
    'playback does not go through the master clock');
  assert.match(s, /const snapHour=\(ms\)=>Math\.round\(ms\/TIDE_STEP_MS\)\*TIDE_STEP_MS;/,
    'and nothing reaches that clock on an hour the model does not publish');
  /* and a step inside the cached window must not be a request */
  assert.match(s, /function covered\(t0\)/, 'there is no cached-window test');
  assert.match(s, /function restatAll\(t0\)/, 'there is no recompute-from-cache path');
});
}

/* ══════════ from tests/r254-checks.test.mjs — 2 of its 11 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R254) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */

/* ── ⑤ THE TRADE LAYER ───────────────────────────────────────────────────────────────────────── */
test('#R254 ⑤ the trade arrowheads exist, the pins do not, and the arrows have a switch', () => {
  const wp = code(read('js/world-packs.js'));
  /* the sprite atlas is `scene`, not `layers` — `layers.hasImage` is undefined and throws into a catch */
  assert.doesNotMatch(wp, /layers\.(has|add)Image\(/,
    'the arrow images are registered through layers.* again; that method does not exist, so the icons are never added');
  const ea = /function ensureArrows\(\)\{([\s\S]*?)\n      \}/.exec(wp);
  assert.ok(ea, 'ensureArrows is gone — re-derive this check against whatever registers the icons now');
  assert.match(ea[1], /scene\.hasImage\(/, 'the arrowheads are not asked of the scene');
  assert.match(ea[1], /scene\.addImage\(/, 'the arrowheads are not registered on the scene');

  assert.doesNotMatch(wp, /id:'wp-trade-pt'/, 'the country pins are back');
  assert.doesNotMatch(wp, /LYR=\[[^\]]*wp-trade-pt/, 'the pin layer is back in the visibility list');
  /* the name labels stay — the reader asked for the markers to go, not the names */
  assert.match(wp, /id:'wp-trade-lbl'/, 'the partner name labels were removed too; the instruction was about the pins');

  assert.match(wp, /class="wp-arr"/, 'the arrow switch is gone from the panel');
  assert.match(wp, /function applyVis\(\)/, 'nothing separates the arrow visibility from the rest of the layer');
  /* ⚠ (#R255) …AND SO DOES THE TERMINAL HEAD. #R254's arrowheads really were registered and really
     were drawn, and were still invisible — measured this round: a ≤10 px head in the LINE'S OWN
     COLOUR on a line up to 13 px wide. So the head is sized from the shaft now and every arc ends in
     one big head at its destination. Both symbol layers must follow the 「矢印の有無」 switch, which
     is what this assertion has always been for. */
  /* ⚠ (#R258) 「矢印だけオンオフしてどないすんねん線もやろがい。」 — the switch took the heads off and
     left the shafts standing, which is a picture of flows with no direction in it. It is over the
     WHOLE arrow now (shaft, head and the partner's name), which is what this assertion is for. */
  assert.match(wp, /function applyVis\(\)\{ setVis\(LYR,on&&arrows\); \}/, 'the arrow layers no longer follow the switch');
});

/* ── ⑥ THE CROP RASTER ───────────────────────────────────────────────────────────────────────── */
test('#R254 ⑥ a move during a crop fetch is not lost, the encode is a blob, and there is no emoji', () => {
  const wp = code(read('js/world-packs.js'));
  /* ══ ⚠⚠ (#R255) THE DEFECT THIS PINNED IS GONE WITH THE MECHANISM THAT COULD HAVE IT ═════════════
     #R254 measured a view-change dropped during a fetch and made the layer REMEMBER it (`_dirty`).
     That was the right fix for a layer that re-fetches ONE IMAGE PER VIEW. This round the reader
     reported the same layer going black and drawing at the wrong scale on every pan, and the cause
     was that shape itself: a single image source stretched over whichever cell was last fetched
     (measured — mean luminance 8.3 immediately after a wheel-zoom, correct only ~10 s later). It is
     a raster TILE source now, so there is no per-view fetch for a move to be lost during, and
     asserting `_dirty` still exists would pin the compensation and forbid the cure.
     What must not come back is the per-view image, and that is asserted directly — here, and in
     tests/r255-checks ②. */
  const cropsBlock = wp.slice(wp.indexOf('(function crops()'));
  assert.ok(cropsBlock.length > 1000, 'the crops block could not be located');
  assert.ok(!/type:'image',url/.test(cropsBlock),
    'the crop layer is a single stretched image again — see #R255 ② for what that looked like');

  assert.match(wp, /cv\.toBlob\(|_toBlob=/, 'the recolour encodes a data: URL on the main thread again (measured at 654,722 chars)');

  /* the emoji: the crop panel title and its legend name */
  const cropBlock = wp.slice(wp.indexOf("makePanel('wp-crop-panel'"), wp.indexOf("makePanel('wp-crop-panel'") + 400);
  assert.doesNotMatch(cropBlock, /🌾/, 'the crop panel has an emoji in its title again');
  assert.doesNotMatch(read('js/world-packs.js').slice(
    read('js/world-packs.js').indexOf("makePanel('wp-crop-panel'"),
    read('js/world-packs.js').indexOf("makePanel('wp-crop-panel'") + 700), /🌾\s*Crop cultivation/,
    'the crop legend name has an emoji again');
});
}

/* ══════════ from tests/r297-checks.test.mjs — 1 of its 13 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R297) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */

/* ── ⑧ every weather clock lands on a published instant ───────────────────────────────────────── */
test('R297 ⑧ the tide clock steps over the marine model’s own hours', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /const TIDE_STEP_MS=3600e3;/);
  assert.match(s, /const snapHour=\(ms\)=>Math\.round\(ms\/TIDE_STEP_MS\)\*TIDE_STEP_MS;/);
  assert.match(s, /function setWhen\(ms\)\{ try\{ window\.IntMapTime\.set\(new Date\(snapHour\(ms\)\)/,
    'nothing reaches the clock unsnapped');
  assert.match(s, /type="datetime-local" step="3600"/, 'and the field cannot offer a minute');
  assert.ok(!/data-d="-?6\.2"/.test(s), 'the 6 h 12 m step, which lands on :12, is gone');
  /* the ECMWF clocks were already discrete — this is the rule they set (#R293) */
  const w = read('js/weather.js');
  assert.match(w, /class="ecl-timerange" id="'\+id\+'-r" min="0" max="'\+Math\.max\(0,n-1\)\+'" step="1"/);
});
}

/* ══════════ from tests/r499-checks.test.mjs — 2 of its 20 test(s) ══════════ */
{
/* (#R499) the round's header note is kept with its largest block, in tests/layer-pointer-performance-checks.test.mjs */
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/** the source of the balanced region that starts at `i` (#R498's cutter, reused) */
function balanced(src, i, open, close) {
  let d = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === open) d++;
    else if (c === close) { d--; if (!d) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced from ' + i);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑪ js/world-packs.js makePanel().open() — the guard skips the layout, never the body
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function panelRig() {
  const src = CODE('js/world-packs.js');
  const i = src.indexOf('function panelNames(');
  const j = src.indexOf('function makePanel(');
  assert.ok(i > 0 && j > i, 'panelNames / makePanel are no longer where this check cuts them out');
  const fns = src.slice(i, src.indexOf('{', j)) + balanced(src, src.indexOf('{', j), '{', '}');

  const counts = { register: 0, tile: 0, html: 0, minimize: 0 };
  const body = { className: 'wp-body', style: {}, set innerHTML(v) { counts.html++; this._h = v; }, get innerHTML() { return this._h; } };
  const el = {
    id: 'data-legend-x', style: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } },
    querySelector: (q) => (q === '.wp-body' ? (el._hasBody ? body : null) : null),
    appendChild() { el._hasBody = true; }, insertBefore() { el._hasBody = true; },
    _hasBody: false,
  };
  const g = { Math, console, Object, Array, String };
  g.window = g;
  g.document = { getElementById: (id) => (id === 'data-legend-x' ? el : null), createElement: () => body };
  g.window._registerLayerOpacity = () => { counts.register++; el.style.display = 'block'; return el; };
  g.window._tileLegends = () => { counts.tile++; };
  g.window._ensureLegendMinimize = () => { counts.minimize++; };
  vm.createContext(g);
  vm.runInContext(`${fns}
    globalThis.__panel = makePanel('x', () => 'X', 'cb-x', { legendId:'x', layers:() => ['a','b'] });`,
  g, { filename: 'world-packs-panel.js' });
  return { P: g.__panel, counts, el, body };
}

test('R499 ⑪ re-rendering the same panel stops moving the legend column', () => {
  const rig = panelRig();
  rig.P.open('<i>one warning in force</i>');
  assert.equal(rig.counts.tile, 1, 'the first open must place the legend');
  assert.equal(rig.counts.register, 1);

  for (let i = 0; i < 200; i++) rig.P.open('<i>one warning in force</i>');
  assert.equal(rig.counts.tile, 1,
    `the legend column was re-laid-out ${rig.counts.tile} times for 201 identical renders — and each one of `
    + 'those is a getBoundingClientRect per legend on the map');
  assert.equal(rig.counts.register, 1, 'identical opacity targets were re-registered');

  /* ⚠ AND THE BODY IS STILL REWRITTEN EVERY TIME. `wireControls` attaches with addEventListener and
     has never leaked only because innerHTML replaced the buttons; handing the same nodes back would
     stack a listener per automatic re-render. */
  assert.equal(rig.counts.html, 201, `the body was written ${rig.counts.html} times for 201 renders`);

  /* a body that really changed still re-places the column */
  rig.P.open('<i>two warnings in force</i>');
  assert.equal(rig.counts.tile, 2, 'new markup did not re-place the legends — a taller box would overlap');
});

test('R499 ⑪ …and closing it forgets that it was showing this', () => {
  const rig = panelRig();
  rig.P.open('<b>x</b>');
  rig.P.hide();
  rig.P.open('<b>x</b>');
  assert.equal(rig.counts.tile, 2, 'a panel re-opened after being closed was treated as already showing');
  assert.equal(rig.counts.register, 2);
});
}
