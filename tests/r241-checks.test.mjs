/* ============================================================================
 *  R241 — six reports, and the one that has now been sent five times
 * ----------------------------------------------------------------------------
 *  ① 「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において
 *     対応が完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかる
 *     ことは許されない。」
 *  ② 「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
 *     → 「いや破壊速度 Vr ≤ 波速 Vだから同心円でオッケーですってどんな理屈やねんアホ」
 *  ③ 「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
 *  ④ 「MapLibreで大気にもやがかかりすぎ。地図をちゃんと見せろ。それに、ある程度までズームしたら
 *     いきなりもやが消えるものさらに不自然。」＋「衛生写真ではあっても、標準マップでは大気はなし」
 *  ⑤ 「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」
 *     → 「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」
 *  ⑥ 「地震シミュレータの地点表が左右方向にスクロールできなくなっている。」
 *
 *  ⚠ Every assertion here is written against a MECHANISM, and comments are stripped before the
 *  source is matched (`code()`), because this file quotes the instructions it is testing —
 *  [[intmap-recurring-lessons]] E, eight rounds running.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ① TRANSLATION — the seventh shape, and the instrument that stops it returning ═════════════ */

test('R241 ① a tuple of translations is a CALL, so every existing instrument can read it', () => {
  const reg = code(R('js/lang-registry.js'));
  /* the tuple helper, and the ONE resolution rule */
  assert.match(reg, /function pickArgs\(\)/, 'the registry owns the array form');
  assert.match(reg, /pickArgs: pickArgs/, '…and exports it');
  assert.match(reg, /fn\.arr = function \(a\)/, 'and `L.arr` resolves a tuple');
  assert.match(reg, /return Array\.isArray\(a\) \? fn\.apply\(null, a\)/,
    '⚠ THROUGH pick() ITSELF — a second fallback rule is how the two drift apart');

  /* ⚠ AND THE EXISTING AUDITS MUST SEE IT. `pickArgs` is named so that both detectors — a substring
     test in i18n-report.mjs and a regex in i18n-positional-audit.mjs — match it. The regex is the
     fragile one: `pick\s*\(` does NOT match `pickArgs(`, and 218 sites were outside the positional
     universe until it was widened. Measured: 2,195 → 2,413 call sites. */
  assert.match(R('scripts/i18n-positional-audit.mjs'), /IntMapLang\\s\*\\\.\\s\*pick\(\?:Args\)\?\\s\*\\\(/,
    'the positional audit counts pickArgs sites too');

  /* the tuple helper is actually used, in every table that used to hold a bare array */
  for (const f of ['js/weather.js', 'js/layer-packs.js', 'js/data-layers.js',
    'js/analysis-panels.js', 'js/stats-compare.js', 'js/atlas-console.js',
    'js/world-packs.js', 'js/sims.js']) {
    assert.match(code(R(f)), /IntMapLang\.pickArgs\(\)/, `${f} declares the tuple helper`);
    assert.match(code(R(f)), /LA\('/, `${f} writes its tuples as calls`);
  }
});

test('R241 ① no language index and no private language-order map outside the registry', () => {
  /* ⚠ THE INSTRUMENT IS RUN, not re-implemented here. It is the thing that found four sites in
     js/world-packs.js that reading the code had missed — trade sections, GAEZ variables, supply
     regimes and the panel titles, every one of them English on fr/ko/zh. */
  const out = JSON.parse(execFileSync(process.execPath,
    [join(ROOT, 'scripts', 'i18n-positional-array-audit.mjs'), '--json'], { encoding: 'utf8' }));
  assert.equal(out.hits.length, 0,
    'a translation tuple must be written as LA(…), not as an array subscripted by language position:\n  '
    + out.hits.map((h) => `${h.file}:${h.line} ${h.text}`).join('\n  '));
});

test('R241 ① the seventh surface is a line in the ONE gate, not a seventh instrument', () => {
  const g = R('scripts/i18n-audit.mjs');
  assert.match(g, /run\('i18n-positional-array-audit\.mjs'\)/, 'the gate spawns it');
  assert.match(g, /translation tuples held as data instead of as a call/, 'and prints it in the matrix block');
  assert.match(g, /if \(arrays\.hits\.length\) problems\.push/, 'and --gate fails on it');
  /* #R239's rule: the bundler holds no parser of its own */
  assert.doesNotMatch(code(g), /acorn/, 'the gate still parses nothing itself');
});

test('R241 ① every language is complete on every surface, and the universe is the bigger one', () => {
  const out = JSON.parse(execFileSync(process.execPath,
    [join(ROOT, 'scripts', 'i18n-audit.mjs'), '--json'], { encoding: 'utf8' }));
  for (const r of out.rows) {
    assert.equal(r.keyed[0], r.keyed[1], `${r.code}: keyed table`);
    if (r.inline) assert.equal(r.inline[0], r.inline[1], `${r.code}: inline table`);
    if (r.positional) assert.equal(r.positional[0], r.positional[1], `${r.code}: positional arguments`);
    assert.equal(r.pages[0], r.pages[1], `${r.code}: reading pages`);
  }
  assert.equal(out.positionalArrays, 0, 'no tuple is held as data');
  /* ⚠ AND THE COUNTS MAY NOT SHRINK. A round that "fixes" a gap by making the instrument see less
     is the failure this file exists to prevent — the inline universe was 2,136 before this round
     and the positional one 2,195. */
  const inline = out.rows.find((r) => r.code === 'fr').inline[1];
  const positional = out.rows.find((r) => r.code === 'de').positional[1];
  assert.ok(inline >= 2324, `the inline universe is ${inline}; it was 2,324 when this was written`);
  assert.ok(positional >= 2413, `the positional universe is ${positional}; it was 2,413`);
});

/* ══ ② THE WAVEFRONT LEAVES THE RUPTURE ════════════════════════════════════════════════════════ */

test('R241 ② the front radiates from the broken fault, not from the hypocentre', () => {
  const s = code(R('js/seismic.js'));
  /* the elapsed time has ONE owner, and it is not the per-source-point delay any more */
  assert.match(s, /function _frontT\(k\)\{ return \(k&&k\.delay>tSec\)\?0:Math\.max\(0,tSec\); \}/,
    'the front runs for the whole elapsed time from every piece that has broken');
  /* both wave families ask the same two questions: has this piece broken, and how long has it run */
  assert.match(s, /if\(k&&k\.delay>tSec\) return null;\s+const d=frontDelta\(ph\.k,dep,_frontT\(k\)\)/,
    'body waves: unbroken pieces do not radiate');
  assert.match(s, /const rad=\(k,b\)=>\{ if\(k&&k\.delay>tSec\) return null;\s*\n?\s*const d=_pathDeg\(sw\.v\*_frontT\(k\),b\|\|0\)/,
    'surface waves: the same rule');
  /* ⚠ THE OLD FORM MUST BE GONE. `tSec - k.delay` is what collapses the envelope to the hypocentre's
     own circle for every Vr ≤ V — #R238's theorem — and three rounds shipped that circle. */
  assert.doesNotMatch(s, /tSec-\(\(k&&k\.delay\)\|\|0\)/, "the first-arrival form must not come back");

  /* ⚠ AND THE OUTLINE IS WALKED. A rupture rectangle is FOUR points, so «sample every
     ring.length/24-th vertex» sampled four corners and nothing along the 500 km edges: measured, the
     front at t = 30 s was byte-identical to a point source's. */
  assert.match(s, /function _walkRing\(R2,n\)/, 'the outline is densified before it is sampled');
  assert.match(s, /const R2=_walkRing\(fault\.ring,28\), step=1;/, 'the source points walk it');
  assert.match(s, /const R2=_walkRing\(fault\.ring,48\)/, 'and so does the broken-region outline');

  /* the panel has ONE distance, and it is the distance to the rupture — or the ring sweeps over a
     city while the table still prints a time measured from a point 500 km away */
  assert.match(s, /const km=distKmTo\(lng,lat\);\s*\n\s*const deg=km\/\(D\*RE\), kmEpi=km;/,
    'the table measures from the rupture, like the picture and like the ground-motion model');
});

/* ══ ③ THE MOBILE COLUMN GETS ITS RAIL BACK ════════════════════════════════════════════════════ */

test('R241 ③ the docked column on a phone has a scrollbar again', () => {
  /* ⚠ the stylesheet is committed with CRLF; normalise before slicing on a newline, or this test
     silently reads from index −1 (i.e. the WHOLE file) and passes on any rule anywhere. */
  const css = R('css/intmap.css').replace(/\r\n/g, '\n');
  const i = css.indexOf('@media(max-width:768px){\n  #docked-feed{');
  assert.ok(i > 0, 'the phone block for the dock was not found');
  const blk = css.slice(i);
  const head = blk.slice(0, 900);
  assert.match(head, /scrollbar-width:thin/, 'the rail is drawn');
  assert.doesNotMatch(head, /scrollbar-width:none/, '#R240 deleted it; it is back');
  assert.match(head, /#docked-feed::-webkit-scrollbar\{ width:10px; \}/, 'and it has a width');
  assert.match(head, /#docked-feed::-webkit-scrollbar-thumb\{ background:rgba\(140,142,150,0\.5\)/,
    '⚠ a phone has no hover, so the thumb cannot be the auto-hiding one');
  /* the half of #R240 that WAS asked for stays: the column still runs edge to edge */
  assert.match(head, /margin-left:-16px; margin-right:-16px/, 'the feed still cancels the sheet inset');
});

/* ══ ④ THE AIR ═════════════════════════════════════════════════════════════════════════════════ */

test('R241 ④ the map basemap has no air at all, from either owner', () => {
  const t = code(R('js/theme-sky.js'));
  const blend = /'atmosphere-blend':\(sat[\s\S]{0,200}?\)\}\);/.exec(t);
  assert.ok(blend, 'the atmosphere-blend expression was not found');
  assert.match(blend[0], /:0\)\}\);/, 'the non-satellite basemap gets exactly 0, not a weaker ramp');
  assert.doesNotMatch(t, /_mapIsLight\(\)/, 'and the light/dark map branch is gone with it');
  /* js/limb-layer.js is the OTHER owner — 「縁の帯も消す」 means it too */
  const owns = t.slice(t.indexOf('function _limbOwnsRim()'), t.indexOf('function _limbOwnsRim()') + 400);
  assert.match(owns, /if\(!_airOn\(\)\) return false;/, 'the app-drawn limb is off over a vector basemap');
  assert.match(t, /function _airOn\(\)\{ try\{ return HOST\.mapType==='sat'/, '«is there air» has one owner');
});

test('R241 ④ one zoom curve, and it is zero before maplibre cuts the globe', () => {
  const t = code(R('js/theme-sky.js'));
  /* ⚠ THE MECHANISM: maplibre 5.24's `case 'globe'` is
       ['interpolate',['linear'],['zoom'], 11,'vertical-perspective', 12,'mercator']
     and `atmosphere-blend` — and js/geo-engine.js's limb strength — are multiplied by that
     transition. Whatever the air is worth at z11, all of it goes in one zoom level. #R240 held the
     ramp FLAT to z11 and made the step bigger; the curve now reaches 0 AT z11. */
  const mlb = R('node_modules/maplibre-gl/dist/maplibre-gl-dev.js');
  assert.match(mlb, /11,\s*'vertical-perspective',\s*\n?\s*12,\s*'mercator'/,
    'the renderer still transitions across z11→z12 — if this moves, AIR_Z moves with it');

  const air = /const AIR_Z=\[([^\]]+)\]/.exec(t);
  assert.ok(air, 'AIR_Z is the one zoom curve');
  const a = air[1].split(',').map(Number);
  const stops = {}; for (let i = 0; i + 1 < a.length; i += 2) stops[a[i]] = a[i + 1];
  const zs = Object.keys(stops).map(Number).sort((x, y) => x - y);
  assert.equal(stops[zs[0]], 1, 'the curve is normalised — 1 at the wide end');
  assert.ok(zs[zs.length - 1] <= 11, `the curve ends at z${zs[zs.length - 1]}; the globe ends at z11→12`);
  assert.equal(stops[zs[zs.length - 1]], 0, 'and it ends at zero, so the transition has nothing to take');
  for (let i = 1; i < zs.length; i++) {
    assert.ok(stops[zs[i]] <= stops[zs[i - 1]], `the curve must not rise (z${zs[i]})`);
  }
  assert.ok(stops[9] != null && stops[9] <= 0.1, 'and it is nearly out by z9, so the last step is small');

  /* TWO readers, ONE table — [[intmap-recurring-lessons]] G */
  assert.match(t, /function _airRamp\(peak\)/, 'the sky block reads AIR_Z as a maplibre expression');
  assert.match(t, /function _airAtZoom\(z\)/, 'and the limb layer reads the same stops in JS');
  assert.match(t, /setLimb\(_LIMB_ID,\{on:true,strength:az,disc:_discStrength\(\)\*az\}\)/,
    'the follow re-pushes the limb strength — a pure zoom moves nothing else in its comparison');

  const peak = /_airRamp\(([0-9.]+)\)/.exec(t);
  assert.ok(peak, 'the satellite peak is a number this file owns');
  assert.ok(+peak[1] < 0.55, `the satellite peak is ${peak[1]} — 「もやがかかりすぎ」 asked for less than #R187's 0.55`);
  assert.ok(+peak[1] > 0.2, `the satellite peak is ${peak[1]} — 「衛生写真ではあっても」, so not zero`);
});

/* ══ ⑤⑥ THE TABLE ══════════════════════════════════════════════════════════════════════════════ */

test('R241 ⑤ the chip is as wide as the labels THIS table prints, and no wider', () => {
  const s = code(R('js/seismic.js'));
  assert.match(s, /function _chipW\(jma,labels\)/, 'the measurement takes the set as well as the scale');
  assert.match(s, /const set=\(labels&&labels\.length\)\?labels\.slice\(\)\.sort\(\):null;/,
    'the set decides the maximum');
  assert.match(s, /const key=\(jma\?'jma\|':'mmi\|'\)\+fs\+'\|'\+fam\+'\|'\+\(set\?set\.join\('\|'\):'\*'\);/,
    '…and the cache is keyed by it, or a second table gets the first one’s width');
  /* the width is resolved ONCE for the table, before any row is written */
  assert.match(s, /const CW=_chipW\(jp, seats\.map\(x=>iTxt\(x\.a\)\)\.filter\(Boolean\)\.map\(k=>k\.txt\)\);/,
    'one width per render, from the labels the rows will print');
  assert.match(s, /width:'\+cw\+'px/, 'and every chip is that width');
  /* the padding came down with it — 「テキストがとっている幅の割に」 */
  assert.match(s, /padding:3px 4px;/, 'the box hugs its text more closely than 6 px a side');
  /* ⚠ the fallback is still DERIVED from the class tables, so a new class needs no edit here */
  const fn = s.slice(s.indexOf('function _chipW'), s.indexOf('function _chipW') + 1400);
  assert.match(fn, /JMA_CLASSES\.forEach/, 'the JMA labels come from the class table');
  assert.match(fn, /ROMAN\[i\]/, 'and the MMI ones from the numeral table');
});

test('R241 ⑥ the places table scrolls sideways inside its own card', () => {
  const s = code(R('js/seismic.js'));
  /* ⚠ THE CARD CLIPS. `.sq-card{overflow:hidden}` (#R237) is what gives the grouped inset list its
     rounded corners, and it swallowed the overflow before `.sq-body` could scroll it — measured at
     a 260 px panel: the table wants 316 px, the box offers 224, and the whole intensity column sat
     beyond the card edge with nothing to scroll. */
  assert.match(R('js/seismic.js'), /'\.sq-card\{[^']*overflow:hidden;\}'/, 'the card still clips (it is the shape)');
  assert.match(s, /<div class="sq-tbl" style="[^"]*overflow-x:auto/, 'so the table has its own scroller');
  assert.match(s, /overscroll-behavior-x:contain/, 'and a flick in it does not drag the sheet away');
  /* auto layout takes the larger of the two: full width when the columns fit, natural width when
     they do not. `max-content` was measured first and parks the table short of a wide panel. */
  /* ⚠ (#R242) THE SCROLLER IS THE FALLBACK, NOT THE ANSWER. The report came back — 「各地の表が横
     スクロールできない」 — after this scroller shipped, and a reader looking at a table whose last
     column is sliced does not want to learn a gesture. The table is made to FIT (measured: 312 px of
     card, 312 px of table), so the width lives in `.sq-sites` and the place name is the one elastic
     column. The scroller above stays for a 260 px docked column. */
  assert.match(s, /'\.sq-sites\{border-collapse:collapse;width:100%/, 'the table is width:100%, not max-content');
  assert.match(s, /'\.sq-st-nm\{[^']*max-width:0/, 'and the place name is the only column that gives way');
  /* …and the numeric columns cannot wrap, or the overflow hides itself by breaking the reading */
  const rows = s.slice(s.indexOf('const rows=seats.map'), s.indexOf('const rows=seats.map') + 1400);
  assert.equal((rows.match(/white-space:nowrap/g) || []).length, 5,
    'every NUMERIC cell is nowrap (#R242: the place name wraps instead of being cut)');
});

/* ══ THE BUILD STAMPS — two of them, and they only ever fail after DEV-NOTES is written ════════ */

test('R241 the build stamps moved together', () => {
  /* ⚠ (#R242) THIS WAS TWO LITERALS AND IT ASKED THE WRONG QUESTION. Pinned to `R241`, it fails on
     the next round for a reason that is not a defect — and every previous round's copy of it would
     fail with it, so the only way to keep the suite green is to edit them all. What the round
     actually wants held is a RELATION: the two stamps name the same round, and that round is the
     newest one in DEV-NOTES (#R207 ⑬ and #R219 ⑪ state the second half; this states the first).
     Same rule as every other pin that broke on a change that kept its meaning (#R205, #R207). */
  const html = R('index.html');
  const boot = /__imBuild='(R\d+[a-z]?)'/.exec(html);
  const rel = /INTMAP_BUILD='\d{4}-\d{2}-\d{2}-(R\d+[a-z]?)'/.exec(html);
  assert.ok(boot, 'the boot stamp');
  assert.ok(rel, 'and the release stamp');
  assert.equal(boot[1], rel[1], 'both stamps name the same round');
});
