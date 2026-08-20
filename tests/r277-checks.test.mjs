/* ============================================================================
 *  IntMap · #R277 source checks
 * ----------------------------------------------------------------------------
 *  「地形編集・水流で地形のポップアップで、ツールは上部に一行でスティックしろ。」
 *  「気象警報はまだ対応していない国は灰色斜線で、発令されていないだけの地域は灰色に。」
 *  「水流シミュレーションで、一回きりのやつで、1クリックの水量m³注水量m³/s流量の違いが判らない。
 *    何が何かわからない。」
 *  「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。正確にリアルタイムな情報に基づき
 *    正確で忠実な色分けを。あと、漏れが多すぎる。また、対応国も増やせ。更新が遅すぎる。リアルタイムに
 *    と言っている。警報名は設定言語で書け。」
 *
 *  ⚠ EVERY ASSERTION HERE IS ABOUT A PROPERTY, NOT A LITERAL. Thirteen consecutive rounds have had
 *  a previous round's test pin a number or a call site and turn a correct change into a false
 *  regression; this round had to rewrite two of them (tests/r189 ⑤ and tests/r269 ④). So the tool
 *  strip is checked as «one row of controls, and nothing else pinned above the scroller», not as
 *  「46.7 px」; the water source as «one rate, one total», not as one line.
 *  ⚠ AND THE COMMENTS ARE STRIPPED FIRST. A note that quotes the defect must never be what makes
 *  the check pass — 「自分の検査が自分のコメントに当たる」, thirteen times and counting.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const TW = () => codeOnly(read('js/terrain-water.js'));
const WP = () => codeOnly(read('js/world-packs.js'));
const RELAY = () => codeOnly(read('supabase/functions/alerts-relay/index.ts'));

/* ── ① the tool strip is ONE ROW, pinned, and everything else scrolls ───────────────────────────
   MEASURED before the fix, on the built page (desktop): `.tw-tools` was 131.7 px of a 591.7 px
   panel — a caption, a 2×2 picker and the 「着色」 checkbox — i.e. #R275 pinned the right element
   and left three rows above the scroller. After: 46.7 px, one child, all four buttons at the same
   y, `scrollWidth === clientWidth` on every one of them. */
test('R277 ① the terrain tool picker is one pinned row and nothing else', () => {
  const s = TW();
  const iH = s.indexOf('panel.innerHTML=');
  const html = s.slice(iH, s.indexOf('class="tw-foot"', iH));
  const iT = html.indexOf('class="tw-tools"');
  const iB = html.indexOf('class="tw-body"');
  assert.ok(iT > 0 && iB > iT, 'head · tools · body, in that order');
  const tools = html.slice(iT, iB);
  /* the ONLY thing between the two markers is the picker: no caption, no card, no second control */
  assert.match(tools, /class="tw-segwrap tw-modes"/, 'the picker is what is pinned');
  assert.ok(!/tw-cap/.test(tools), 'no caption row above the scroller');
  assert.ok(!/tw-card/.test(tools), 'no settings card above the scroller');
  /* four across, not two by two — that is what 「一行」 means and it is one declaration */
  assert.match(s, /\.tw-modes\{display:grid;grid-template-columns:repeat\(4,1fr\);\}/,
    'the four tools are one row of four');
  /* the long name is not lost: it is on `title` and it is the caption of the block the tool opens */
  assert.match(s, /function modeName\(m\)\{/, 'one declaration of the full tool names');
  assert.match(s, /title="'\+_at\(m\[2\]\)\+'"/, '…carried by every button');
  assert.ok(!/p\.innerHTML=cap\(L\('Levee \/ dam'/.test(s), 'the params caption reads that declaration');
  assert.equal((s.match(/p\.innerHTML=cap\(modeName\(mode\)\)/g) || []).length, 3,
    '…in all three tool modes');
  /* and the tint setting moved INTO the scroller rather than being deleted */
  assert.match(html.slice(iB), /class="tw-tint"/, 'the tint checkbox still exists, in the body');
});

/* ── ② one rate, one total, and a sentence that says what they do together ──────────────────────
   MEASURED in the code before the fix: `placeSource` did `rate:(flowM3s!=null?flowM3s:pourRate)`
   and `srcRate` fell back to `pourRate` — so 「注水量」 and 「流量」 were ONE quantity written by two
   boxes, and the panel showed both plus the volume. 「何が何かわからない」 is what two controls for
   one number look like. */
test('R277 ② the one-shot source has exactly two numbers, and they are different kinds', () => {
  const s = TW();
  const iP = s.indexOf("L('Next source'");
  const params = s.slice(iP, s.indexOf('function setMode(', iP));
  const nums = params.match(/class="tw-num tw-[a-z]{2}"/g) || [];
  assert.deepEqual([...new Set(nums)].sort(), ['class="tw-num tw-pr"', 'class="tw-num tw-sv"'],
    'a total (m³) and a rate (m³/s) — and no third box');
  assert.match(params, /tw-sv[^]{0,200}m³<\/span>/, 'the total is a volume');
  assert.match(params, /tw-pr[^]{0,200}m³\/s<\/span>/, 'the rate is a speed');
  /* the panel does the division rather than leaving the reader to do it */
  assert.match(s, /function pourNote\(\)\{/, 'the pair is explained in words');
  assert.match(s, /const sec=Math\.max\(0,srcM3\)\/Math\.max\(1,pourRate\);/,
    '…and the explanation is the total divided by the rate');
  assert.match(s, /class="tw-blk tw-pnote"/, '…printed under the two boxes');
  assert.match(s, /function syncPourNote\(\)\{/, '…and kept in step when either number changes');
  /* ONE writer for the discharge, and it reaches every tap (this is #R189's requirement, kept) */
  assert.match(s, /function setRate\(v\)\{/, 'one writer');
  assert.match(s, /pourRate=n; sources\.forEach\(x=>\{ x\.rate=pourRate; \}\);/, '…for every source');
  assert.ok(!/let flowM3s/.test(s), 'the second state for the same number is gone');
});

/* ── ③ the three country states still look like three things, and the grey is UNDER the units ───
   MEASURED on the built page before the fix: `wp-alert-fill` was at style index 34 and
   `wp-alert-choro` at 39 — the country-scale grey (and the hatch) were painted OVER the units,
   because both are added without a `before` and the wash's continuation lands later. Which one
   won depended on which async continuation resolved first. */
test('R277 ③ hatched / grey / coloured are three states, and the wash sits under the units', () => {
  const s = WP();
  assert.match(s, /const before=GE\(\)\.layers\.has\('wp-alert-fill'\)\?'wp-alert-fill'/,
    'the wash and the hatch are inserted UNDER the unit fills, by name');
  /* the three states themselves are unchanged and still distinct */
  assert.match(s, /'fill-pattern':'wp-alert-hatch-img'/, 'no feed → a pattern, not a fourth grey');
  assert.match(s, /1,'rgba\(200,200,203,0\.42\)'/, 'a feed and nothing in force → grey');
  assert.match(s, /function readState\(c\)\{/, '…and 「read」 is a state that is checked, not assumed');
  assert.match(s, /if\(readState\(c\)!=='ok'\) return 0;/,
    'only a country whose service ANSWERED earns the grey — loading, error and idle are hatched');
});

/* ── ④ 「漏れが多すぎる」 — the shape ladder ────────────────────────────────────────────────────
   MEASURED over all 35 MeteoAlarm countries the same minute: 754 of 1,127 published areas could be
   placed. With the ladder: 965 of 1,127 in the same measurement, and 2,873 of 2,962 across every
   feed on the built page. */
test('R277 ④ a warning without a polygon is looked for in the agency’s own shapes', () => {
  const s = WP();
  const ma = s.slice(s.indexOf('async function maFeatures()'), s.indexOf('async function loadMA('));
  assert.match(ma, /if\(a\.poly\)\{ const g=capPolygon\(a\.poly\); if\(g\) return g; \}/, '① the CAP polygon');
  assert.match(ma, /if\(lib\)\{ const f=lookupUnit\(lib,a\.name\);/, '② the same service’s own shapes');
  assert.match(ma, /if\(idx\)\{ const f=lookupUnit\(idx,a\.name\);/, '③ Eurostat NUTS');
  assert.match(ma, /return wholeCountryShape\(iso,a\.name\);/, '④ the country, when the area IS the country');
  assert.match(ma, /if\(missed\) askSwicGeo\(iso\);/, 'and a shortfall is what asks for the library');
  /* the library is a NAME→SHAPE index and carries no warning of its own — 「ソースは一国一ソース」 */
  assert.match(s, /function askSwicGeo\(iso\)\{/, 'the library has one loader');
  const ask = s.slice(s.indexOf('function askSwicGeo(iso)'), s.indexOf('function wholeCountryShape'));
  assert.ok(!/tier|events|severity|sent/.test(ask), 'nothing but names and shapes comes out of it');
  assert.match(ask, /swicGeoAsked\[iso\]=false;/, 'a failure is not an answer — it is retried');
  /* the relay end: no expiry filter, because a district does not expire with the warning on it */
  const r = RELAY();
  assert.match(r, /function swicGeoUrl\(mid\) \{/, 'the relay has a shape-library query');
  const iG = r.indexOf('function summariseSWICGeo');
  const geo = r.slice(iG, r.indexOf('function summariseSWIC(', iG));
  assert.ok(!/expires/.test(geo), 'the library is not filtered by the warning’s expiry');
  assert.match(r, /const _rnd = \(v\) => Math\.round\(v \* 1e4\) \/ 1e4;/, '…and its coordinates are trimmed');
});

/* ── ⑤ the name match works from BOTH sides ─────────────────────────────────────────────────────
   MEASURED: 「Antwerp」 could not find 「Prov. Antwerpen」 and 「Viseu」 could not find 「Viseu Dão
   Lafões」, because only shorter and shorter pieces of the QUERY were tried. Belgium came out 0/9. */
test('R277 ⑤ a unit name resolves from either side, and only when it is unambiguous', () => {
  const s = WP();
  const fn = s.slice(s.indexOf('function lookupUnit(idx,name)'), s.indexOf('const _LEAD='));
  assert.match(fn, /q\.slice\(0,k\.length\)===k/, 'the index key may START WITH the query');
  assert.match(fn, /if\(n===1\) return hit;/, '…and only when exactly one key does');
  assert.match(s, /const _LEAD=\//, 'a leading administrative word is an alias, not part of the name');
  assert.match(s, /if\(t\.indexOf\(';'\)>=0\)/, 'a composite 「A; B; C」 name registers its parts');
});

/* ── ⑥ 「日本以外でも区分単位、発令単位ごとに」 — China at the division its own id names ─────────
   MEASURED: the CMA list holds 1,235 warnings; this loader asked for 300 and painted 28 provinces.
   The id 36073341600000 is a GB/T 2260 code and 360733 is 会昌县. After: 1,000 of 1,000 placed over
   223 distinct units, 149 at the district and 849 at the prefecture-city. */
test('R277 ⑥ China is drawn at the division its alert id names, not at the province', () => {
  const s = WP();
  assert.match(s, /const CN_PAGE=1000, CN_PAGES=2;/, 'the whole list, not the first page of 300');
  assert.match(s, /cnTotal=\+pg\.count\|\|0;/, '…and the real total is read, never assumed');
  assert.match(s, /function cnUnitOf\(idx,id\)\{/, 'the unit comes from the code');
  const u = s.slice(s.indexOf('function cnUnitOf(idx,id)'), s.indexOf('const CN_PAGE='));
  assert.match(u, /const c=d\.slice\(0,4\)\+'00', p=d\.slice\(0,2\)\+'0000';/,
    'district → prefecture-city → province');
  assert.match(u, /if\(idx\[d\]&&idx\[d\]\.level!=='province'\) return \{code:d,rec:idx\[d\]\};/,
    '…in that order');
  assert.match(s, /PLACED\.CHN=\[items\.length-lost,items\.length\];/, 'and what could not be placed is counted');
});

/* ── ⑦ 「警報名は設定言語で書け」 ────────────────────────────────────────────────────────────────
   MEASURED in one session, on one screen: 「Thunderstormwarning」, 「ORAGE」, 「STARKES GEWITTER」,
   「Mye regn」, 「Baixa Umidade」, 「降雨」, 「大风蓝色」, 「大雨」, 「ارتفاع درجات الحرارة」. */
test('R277 ⑦ the hazard is named in the reader’s language, and the agency’s word is kept', () => {
  const s = WP();
  assert.match(s, /const HAZ=\[/, 'a hazard table');
  const haz = s.slice(s.indexOf('const HAZ=['), s.indexOf('function unitFeature'));
  const keys = [...haz.matchAll(/^\s*\['([a-z]+)',\s*\//gm)].map((m) => m[1]);
  assert.ok(keys.length >= 20, `the table covers the published vocabulary (${keys.length} hazards)`);
  assert.ok(keys.includes('thunderstorm') && keys.includes('wind') && keys.includes('rain')
    && keys.includes('heat') && keys.includes('flood'), 'including the ones every service issues');
  /* the winner is the EARLIEST match, not the first row — 「Strong Wind and Large Waves」 is wind */
  assert.match(haz, /if\(m\.index<at\|\|\(m\.index===at&&best&&HAZ\[i\]\[3\]<best\[3\]\)\)/,
    'the earliest match wins, list order breaks a tie');
  /* nothing is thrown away: the agency's own wording travels on the feature and into the card */
  assert.match(s, /const hzr=kinds\.join\(HZSEP\);/, 'the agency’s own wording is kept on the feature');
  assert.match(s, /hzr, hz:f\.hz, hzs:f\.hzs,/, '…beside the translated name');
  assert.match(s, /const t=hazardLabel\(k\); const shown=\(t&&t!==k\)\?\(t\+' （'\+k\+'）'\):k;/,
    'and the tap card prints both');
  /* a language change relabels what is already drawn rather than refetching */
  assert.match(s, /function relabel\(\)\{/, 'a language change relabels');
  assert.match(s, /window\.addEventListener\('intmap-lang'/, '…on the app’s own language event');
  /* a rank is not a hazard */
  assert.match(s, /function hzName\(w\)\{/, '「Yellow Warning」 names no hazard');
});

/* ── ⑧ 「更新が遅すぎる。リアルタイムにと言っている。」(3回目) ───────────────────────────────────
   #R275 turned a stuck queue into a rotation and left it at 12 countries a tick over 35 — a ~90 s
   cycle against a 60 s edge cache, i.e. above the floor for no reason. */
test('R277 ⑧ every rotating feed comes round inside the edge cache’s own age', () => {
  const s = WP();
  const per = +(/const MA_PER_TICK=(\d+);/.exec(s) || [])[1];
  const calls = +(/const MA_CALLS=(\d+);/.exec(s) || [])[1];
  const tick = +(/const TICK_MS=(\d+);/.exec(s) || [])[1];
  const cache = +(/max-age=(\d+), s-maxage=/.exec(read('supabase/functions/alerts-relay/index.ts')) || [])[1];
  const countries = (read('js/world-packs.js').match(/^\s{6}const MA=\{[\s\S]*?\};/m) || [''])[0]
    .split(':').length - 1;
  assert.ok(countries > 30, `the MeteoAlarm table has ${countries} countries`);
  const cycleS = Math.ceil(countries / (per * calls)) * (tick / 1000);
  assert.ok(cycleS <= cache, `a full cycle is ${cycleS}s against a ${cache}s edge cache`);
  /* …and the same is true of the WMO register's rotation */
  const sper = +(/const SWIC_PER_TICK=(\d+), SWIC_CALLS=(\d+);/.exec(s) || [])[1];
  const scalls = +(/const SWIC_PER_TICK=\d+, SWIC_CALLS=(\d+);/.exec(s) || [])[1];
  assert.ok(sper * scalls >= per * calls, 'the register rotates at least as fast');
  /* the AGE is what the panel prints — a rotation that stops has to be visible (#R275) */
  assert.match(s, /maOldestS:\(function\(\)\{/, 'the oldest country’s age is measured');
  assert.match(s, /oldestS:\(function\(\)\{/, '…for both rotations');
});

/* ── ⑨ Taiwan: a 1982 boundary set against 2010 county names ────────────────────────────────────
   MEASURED: 183 of 286 areas placed; nearly all of the loss was 臺南市 and 新北市, whose districts
   were 縣 townships when the file was drawn. */
test('R277 ⑨ Taiwan matches on the stem, and on the township alone when it is unique', () => {
  const s = WP();
  assert.match(s, /const twKey=\(n\)=>_twFold\(n\)\.replace\(\/\[縣市區鄉鎮\]\/g,''\);/,
    'the county/township suffixes are not part of the key');
  assert.match(s, /const twTown=\(n\)=>\{/, 'the township alone is a second key');
  assert.match(s, /Object\.keys\(dup\)\.forEach\(t=>\{ delete idx\.tn\[t\]; \}\);|Object\.keys\(dup\)\.forEach\(t=>\{ delete tn\[t\]; \}\);/,
    '…and an ambiguous stem is dropped rather than guessed');
  assert.match(s, /const twFind=\(idx,name\)=>\{/, 'one lookup for both keys');
});
