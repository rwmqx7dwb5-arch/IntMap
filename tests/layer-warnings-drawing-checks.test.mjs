/* ============================================================================
 *  The warnings layer: where a warning is drawn — units, shapes, the country wash, the quiet grey and what is uploaded to the map
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r266-checks.test.mjs, tests/r268-checks.test.mjs, tests/r271-checks.test.mjs, tests/r277-checks.test.mjs, tests/r284-checks.test.mjs, tests/r297-checks.test.mjs, tests/r305-checks.test.mjs, tests/r306-checks.test.mjs, tests/r307-checks.test.mjs, tests/r344-checks.test.mjs, tests/r383-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import pc from 'polygon-clipping';
import { codeOnly } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';
import { assertUnreadNeverGreys, assertUnreadIsTheHatch } from './wash-tier.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r266-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R266) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */

test('R266 ⑦: a tap lists administrative units, not a flat run of municipalities', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /function grouped\(rows,cap\)/, 'there is no grouping renderer');
  /* every feed labels its rows with an admin-1 unit, or the grouping has nothing to group on */
  /* ⚠ (#R271) the JMA row is bucketed by its class10 region now (that is what stopped whole
     prefectures being painted), and the PREFECTURE survives as `adm` — which is what this test is
     about: the tap groups on the admin-1 unit. It is read off `pn` rather than inlined. */
  assert.match(s, /const pn=nameOf\(String\(pref\)/, 'the JMA prefecture name must still be resolved');
  assert.match(s, /adm:pn,/, 'JMA rows carry no prefecture');
  assert.match(s, /adm:st,unit:'zone'/, 'NWS rows carry no state');
  assert.match(s, /adm:p\.province\|\|''/, 'ECCC rows carry no province');
  assert.match(s, /adm:prov/, 'CMA rows carry no province');
  assert.match(s, /const CN_PROV=\{/, 'the Chinese division codes are gone, so China cannot be grouped');
  assert.ok(!/rows\.slice\(0,160\)\.map/.test(s), 'the old flat 160-row list is back');
});
}

/* ══════════ from tests/r268-checks.test.mjs — 1 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R268) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
/* ⚠ (#R267) COUNT IN CODE, NOT IN COMMENTS. This file's own prose names the strings it checks for,
   which is how an audit ends up catching itself (nine rounds and counting). Comments are stripped
   before any «does X still exist» question is asked. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('R268 ⑨ the tap folds three levels deep and never opens on a list of towns', () => {
  const s = codeOnly(read('js/world-packs.js'));
  const i = s.indexOf('function grouped(rows,cap)');
  const body = s.slice(i, i + 4200);
  assert.match(body, /subs:new Map\(\)/, 'the admin-1 bucket must hold sub-units');
  assert.match(body, /areas:new Map\(\)/, 'the sub-unit must hold its areas');
  assert.match(body, /'By area','地域ごと'/, 'the first fold is the sub-units');
  assert.match(body, /'Each municipality','市区町村ごと'/, 'the second fold is the municipalities');
  /* the JMA rows must know which region they are in, or the middle level is empty */
  assert.match(s, /const regionOf=\(code\)=>/, 'the class10 lookup must exist');
  /* ⚠ (#R269) THE PROPERTY, NOT THE VARIABLE NAME. #R269 rewrote `loadJMA` for the JMA's live r8
     bulletin list — the area identifier is `code` there rather than `a.code` — and pinning the old
     spelling made a rewrite that KEPT this behaviour look like a regression. What #R268 is about is
     that every JMA row carries the class10 region it belongs to, falling back to its own name. */
  assert.match(s, /sub:r10\?nameOf\(r10\):nameOf\([a-zA-Z.]+\)/, 'every JMA row must carry its region');
  assert.match(s, /const r10=regionOf\(/, '…looked up through the class10 walk');
});
}

/* ══════════ from tests/r271-checks.test.mjs — 5 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）。supabase/functions/<名前>/index.ts は Deno.serve の中で上流を読む Edge Function で、ここでは起動しない（起動して測る検査は tests/layer-ais-ships-checks の #R510 ⑨⑩⑪） */
/* ============================================================================
 *  IntMap · #R271 source checks
 * ----------------------------------------------------------------------------
 *  Seven reports, four of them the SECOND or THIRD time the same sentence has arrived. The
 *  assertions below are about the PROPERTIES that make each defect impossible again, never about
 *  the literals this round happened to write.
 *
 *    ① a warning is drawn at the unit the agency issues for — Japan at its class10 regions, and
 *       the country wash means «areas that could not be placed», not «the worst rank in force»
 *    ② two more services read directly, with their own polygons (DWD, MET Norway)
 *    ③ the colour key has one swatch per category — 89 languages, 89 colours
 *    ④ the clear ✕ is placed from the FIELD's box, not from the wrapper around it
 *    ⑤ the terrain & water panel has one column: one inset, one gap, one right edge
 *    ⑥ a new water source never rebuilds the grid while the basin can be extended to it
 *    ⑦ the layer taxonomy: twenty rows moved, and every id appears in exactly one group
 * ==========================================================================*/
/* ⚠ (#R267) read CODE, not comments — this file's own prose names the things it checks for, and a
   check that matches its own explanation is the failure this project has paid for eleven times. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① the issuing unit, and what a country wash is allowed to mean ─────────────────────────── */
test('R271 ① Japan is drawn at the JMA’s own issuing regions, not at the prefecture', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /geojson\/class10s\.json/,
    'the JMA publishes the geometry of the units it issues for; that is what the layer must draw');
  assert.match(s, /jmaClass10Geo/, 'the class10 geometry must have a loader of its own');
  /* the bucket is the class10 code, and the prefecture only survives as the row's admin-1 label */
  assert.match(s, /byC10/, 'warnings must be bucketed by the class10 area they were issued for');
  /* the coarse path is a FALLBACK, and it must say which one is on screen */
  assert.match(s, /jmaUnit\s*=\s*'(class10|pref)'/,
    'the panel has to be able to say which unit Japan is drawn at');
});

test('R271 ① a country is washed only for what could NOT be placed', () => {
  const s = codeOnly(read('js/world-packs.js'));
  /* the hand-written list of «countries that draw their own areas» is gone: it stops being true the
     day a feed starts publishing shapes, and four of them did this round */
  assert.ok(!/GEOM_FEEDS\s*=\s*\{/.test(s),
    'the set of countries drawn at their own units must be derived, not written down');
  assert.match(s, /drawnISO/, 'it is rebuilt from the features that actually reached the source');
  /* ⚠⚠⚠ (#R273) THE RULE GOT STRICTER, NOT LOOSER. #R271 washed a country for the areas it could
     not place even where its other units WERE drawn; with Japan at the municipality that tinted the
     whole country for eleven unplaced areas out of 1,490. A country is drawn at its units OR washed,
     never both — `drawsAreas` is inlined into `washTier` as `!drawnISO[c]`, which is the same
     measurement with no second name for it. */
  const wi = s.indexOf('function washTier(c){');
  assert.ok(wi > 0, 'washTier() must exist');
  const w = s.slice(wi, s.indexOf('function paintCountries', wi));
  assert.match(w, /UNPL\[c\]/, 'the wash rank must come from the areas that could not be placed');
  assert.match(w, /!drawnISO\[c\]/, '…and only where nothing at all could be drawn');
  assert.ok(!/cmaRec\.worst/.test(w) && !/bomRec\.worst/.test(w),
    'the worst rank anywhere in a country is not what a wash is allowed to say');
});

test('R271 ① what could not be placed is COUNTED and printed (#R185: no silent caps)', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /PLACED\[/, 'every resolver must record placed-of-total');
  assert.match(s, /function placedLine\(\)/, 'and the panel must print the shortfall');
  assert.match(s, /\+placedLine\(\)/, '…and actually call it');
  /* ⚠ (#R271 追記) …and a boundary set that could not be READ is «nothing could be placed», not
     «nothing is in force»: without this the country gets neither polygons nor a wash, and a CDN
     hiccup would take three hundred Chinese warnings off the map (#R212's rule). */
  assert.match(s, /if\(!idx\)\{ UNPL\[iso\]=worst\(\); return \[\]; \}/,
    'a failed boundary fetch must fall back to the country wash, not to silence');
});

/* ⚠ (#R271 追記) the panel must name the unit it is actually drawing — measured on production right
   after the deploy, it said 「115 prefectures」 while drawing 115 CLASS10 REGIONS (Japan has 47). */
test('R271 ① the panel names the unit Japan is drawn at, not a fixed word', () => {
  const s = codeOnly(read('js/world-packs.js'));
  /* (#R273) the word moved from the world overview to the country's own legend, where the reader is
     asking about Japan — but it is still READ OFF `jmaUnit`, which is set by whichever geometry
     actually loaded, rather than written out beside a count of something else. */
  const m = /function unitWord\(feed\)\{([\s\S]{0,700})/.exec(s);
  assert.ok(m, 'the unit word must be a function of the feed');
  assert.match(m[1], /jmaUnit==='muni'/, 'Japan’s word comes from the geometry that loaded');
  assert.match(m[1], /by municipality/, 'the municipality is what 「市町村単位で塗り分けろ」 asked for');
  assert.match(m[1], /by issuing region/, '…and the fallback geometry really is the issuing region');
  assert.match(s, /jmaUnit='muni'/, 'and the municipality path must set it');
});

test('R271 ② Europe’s regions get a shape from the feed’s own polygon or the region it names', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /gisco-services\.ec\.europa\.eu[\s\S]*?NUTS_RG/,
    'the NUTS regions are the published geometry for the names MeteoAlarm prints');
  assert.match(s, /function capPolygon/, 'a CAP <polygon> is lat,lon — it must be converted in ONE place');
  assert.match(s, /function lookupUnit/, 'a zone named «province + part» must still find its province');
  /* the relay has to carry the areas at all, or none of the above has anything to work with */
  const r = read('supabase/functions/alerts-relay/index.ts');
  assert.match(r, /areas/, 'the relay must project one row per region, not one joined string');
  assert.match(r, /EMMA_ID/, 'regions are deduplicated by the id the feed publishes them under');
});
}

/* ══════════ from tests/r277-checks.test.mjs — 6 of its 12 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）。supabase/functions/<名前>/index.ts は Deno.serve の中で上流を読む Edge Function で、ここでは起動しない（起動して測る検査は tests/layer-ais-ships-checks の #R510 ⑨⑩⑪） */
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
/* (#R308 追記2) 5本が同じ1行を逐語で固定していたので、規則ごとに1つの読み手へ — tests/wash-tier.mjs */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const RELAY = () => codeOnly(read('supabase/functions/alerts-relay/index.ts'));

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
  assert.match(s, /\n\s+1,QUIET_COL,/, 'a feed and nothing in force → grey');   /* (#R293) one declaration */
  assert.match(s, /function readState\(c\)\{/, '…and 「read」 is a state that is checked, not assumed');
  /* ⚠ (#R284) …and loading / error / idle are no longer HATCHED either: the hatch means 「未対応」,
     so a wired country that has not answered draws nothing at all (`-1`). What #R277 asserted —
     only an answer earns the grey — is unchanged. */
  /* ⚠ (#R288) …and the reader has since said which appearance that unread state should have:
     「まだ対応していない、もしくはデータがまだ入っていないところは灰色斜線で」. #R277's rule is
     untouched — only a READ earns the grey — and this is the other half of it, written the way the
     reader asked for. */
  /* ⚠ (#R308 追記2) …AND IT PINNED THE LINE RATHER THAN THE RULE — see tests/wash-tier.mjs */
  assertUnreadNeverGreys(s);
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
  /* ⚠ (#R297) the ALIAS is asked before the fuzzy rungs inside `lookupUnit` can answer with
     something merely close — it is an explicit statement about one name (「Ahvenanmaa」 is
     Eurostat's 「Åland」 and no normalisation reaches it). The rung itself is unchanged. */
  assert.match(ma, /if\(idx\)\{ const al=aliasUnit\(idx,iso,a\.name\); if\(al\) return al\.geometry;/,
    '③ Eurostat NUTS, with the agency’s own word for a region first');
  assert.match(ma, /const f=lookupUnit\(idx,a\.name\); if\(f&&f\.geometry\) return f\.geometry; \}/,
    '③ …then the index itself');
  assert.match(ma, /if\(gb\)\{ const f=lookupUnit\(gb,a\.name\);/, '④ (#R284) a stable administrative index');
  assert.match(ma, /return wholeCountryShape\(iso,a\.name\);/, '⑤ the country, when the area IS the country');
  assert.match(ma, /if\(wa\)\{ const f=lookupUnit\(wa,a\.name\); if\(f&&f\.geometry\) return f\.geometry; \}/,
    '⑤ (#R290) the shipped world administrative index, last');
  assert.match(ma, /if\(missed\)\{ askSwicGeo\(iso\); askGB\(iso\); askWorldAdm1\(\); \}/,
    'and a shortfall is what asks for every library');
  /* the library is a NAME→SHAPE index and carries no warning of its own — 「ソースは一国一ソース」 */
  assert.match(s, /function askSwicGeo\(iso\)\{/, 'the library has one loader');
  const ask = s.slice(s.indexOf('function askSwicGeo(iso)'), s.indexOf('function gbIndex('));
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
  /* ⚠ (#R302) THE TITLE OF THIS TEST SAID 「not at the province」 AND THE ASSERTION PINNED THE LINE
     THAT FELL TO ONE. `p=d.slice(0,2)+'0000'` was the last rung of the ladder, so an id that matched
     neither its own district nor `slice(0,4)+'00'` painted a whole province: MEASURED,
     `500157 重慶市両江新区` → `500100` is absent from DataV → all 82,400 km² of 重慶市 coloured for a
     district-level 大风蓝色预警, about 69× the ground the CMA named. An id this map cannot place is
     counted instead, which is what the last assertion here has always been about. */
  assert.match(u, /const c=d\.slice\(0,4\)\+'00';/, 'district → prefecture-city, and there it stops');
  assert.ok(!/d\.slice\(0,2\)\+'0000'/.test(u), 'the province rung must not come back');
  assert.match(u, /if\(idx\[d\]&&idx\[d\]\.level!=='province'\) return \{code:d,rec:idx\[d\]\};/,
    '…in that order, and neither rung may resolve to a province');
  assert.match(u, /if\(idx\[c\]&&idx\[c\]\.level!=='province'\) return \{code:c,rec:idx\[c\]\};/,
    'the city rung refuses a province too — some province codes ARE city codes (the four 直轄市)');
  /* ⚠ (#R383) THE DENOMINATOR IS THE CMA'S OWN COUNT, NOT THE PAGES THIS MAP READ. `items` is what
     two pages of `findAlarm` carried; `cnTotal` is the number the service states it has in force.
     MEASURED 1,202 against a 2,000-row ceiling — not binding today, which is precisely the state a
     silent truncation hides in (#R320). What #R277 wrote is unchanged: an id this map cannot place
     is still counted as a shortfall. */
  assert.match(s, /PLACED\.CHN=\[items\.length-lost,Math\.max\(items\.length,cnTotal\)\];/,
    'and what could not be placed is counted');
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

/* ── ⑫ 追記2: CORS-open is not the same as readable FROM THE DEPLOYED ORIGIN ────────────────
   MEASURED the same second on the same url: `Referer: http://127.0.0.1:4277/` → 200 / 569 KB;
   `Referer: https://rwmqx7dwb5-arch.github.io/IntMap/` → **403**. DataV.GeoAtlas sends
   `Access-Control-Allow-Origin: *` AND guards against hotlinking, so China drew 223 units in the
   local preview and `PLACED.CHN = [0, 1217]` in production. A relay sends no Referer. */
test('R277 ⑫ the Chinese boundaries are read through the relay, not from the page', () => {
  const s = WP();
  assert.match(s, /const cnUrl=\(n\)=>relay\('cngeo='/, 'the relay is the route');
  /* (#R293) through `bndJSON`, which is `fetchJSON` plus Cache Storage — boundaries are not news,
     and re-downloading 1.90 MB of Chinese city polygons on every visit was part of 「重すぎる」 */
  assert.match(s, /Promise\.all\(\[bndJSON\(cnUrl\('100000_full_city'\)\),bndJSON\(cnUrl\('100000_full'\)\)\]/,
    '…for both files');
  assert.match(s, /async function bndJSON\(u\)\{ const hit=await bndCached\(u\); if\(hit\) return hit;/,
    '…and that route is the cached one');
  const r = RELAY();
  assert.match(r, /const cngeo = \(q\.get\("cngeo"\) \|\| ""\)\.trim\(\);/, 'the relay answers it');
  assert.match(r, /\^\[0-9\]\{6\}\(_full\(_city\)\?\)\?\$/, '…and the name is a shape, not a path');
  const blk = r.slice(r.indexOf('const cngeo ='), r.indexOf('`?ph=1`') > 0 ? r.indexOf('`?ph=1`') : r.length);
  assert.match(blk, /max-age=86400/, 'a boundary set is not this minute’s weather');
});
}

/* ══════════ from tests/r284-checks.test.mjs — 3 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R284) the round's header note is kept with its largest block, in tests/layer-weather-ecmwf-checks.test.mjs */
/* (#R308 追記2) 5本が同じ1行を逐語で固定していたので、規則ごとに1つの読み手へ — tests/wash-tier.mjs */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const WP = () => codeOnly(read('js/world-packs.js'));

/* ── ① the hatch is 「未対応」 and NOTHING else ─────────────────────────────────────────────────
   `washTier` decided the country's appearance, and it answered 0 — the hatch — for BOTH 「no feed」
   and 「wired but not read yet / could not be read」. Measured on the built page: 22 wired countries
   were hatched 45 s after the layer was switched on, and North Macedonia for ever.               */
test('#R284 ① a wired country never gets the 「未対応」 hatch', () => {
  const src = WP();
  const i = src.indexOf('function washTier(');
  assert.ok(i > 0, 'washTier must exist');
  const body = src.slice(i, src.indexOf('function paintCountries(', i));
  assert.match(body, /if\(!supported\(c\)\)\s*return\s*0;/, 'no feed is still the hatch');
  /* ⚠ (#R288) THE READER RESOLVED THIS THEMSELVES. #R284 read 「対応国まで斜線で塗るのを辞めろ」 as
     「draw nothing for a country that is wired but unread」; the next instruction said, in the same
     sentence as the rule, 「まだ対応していない、**もしくはデータがまだ入っていない**ところは灰色斜線で」.
     So the fourth state is gone and the hatch means 「この地図はここについて何も述べていない」.
     What #R284 measured is still the reason the hatch is harmless now: its own cold burst
     (`COLD_CALLS`) takes the unread set to nearly zero inside a minute — measured this round,
     29 → 3 in 80 s — so no country wears it for a whole sweep. */
  /* ⚠ (#R308 追記2) …asked of the RULE rather than of the line — see tests/wash-tier.mjs */
  assertUnreadIsTheHatch(WP());
  /* ⚠ (#R297) pin the RELATION rather than the number: what makes the hatch transient is that the
     burst is WIDER than the steady rotation. #R297 widened it after measuring that every country is
     READ inside 45 s and what keeps moving afterwards is shapes, not reads. */
  const cold = +(/const COLD_CALLS=(\d+);/.exec(WP()) || [])[1];
  const slots = +(/const MA_SLOTS=(\d+);/.exec(WP()) || [])[1];
  assert.ok(cold > slots, `the burst that makes the hatch transient survives (${cold} vs ${slots})`);
  /* and the two paint expressions still read the tier the way the four states assume */
  /* ⚠ (#R293) the condition moved into `hatchOp(v)` — the opacity slider used to write its scalar
     straight over the inline expression, so EVERY country was hatched at 38 % (measured). The
     claim is unchanged: tier 0, and nothing else, earns the pattern. */
  assert.match(src, /const hatchOp=\(v\)=>\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    'the hatch paints on tier 0 only');
  assert.match(src, /const choroOp=\(v\)=>\['case',\['>',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    'the country wash paints on tiers above 0 only');   /* (#R293) …in a builder — see above */
});

/* ── ③ the shape ladder has five rungs and the library accumulates ───────────────────────────
   `?swicgeo=` answers with the member's CURRENT areas, so the library empties whenever that
   service is quiet — measured: Portugal 0 shapes, Moldova 0, Hungary 0, and therefore Moldova
   placed 0 of 42 and Portugal 1 of 18.                                                          */
test('#R284 ③ the shape library accumulates, and there is a rung that does not depend on the weather', () => {
  const src = WP();
  const i = src.indexOf('function askSwicGeo(');
  const body = src.slice(i, src.indexOf('function gbIndex(', i));
  /* ⚠ (#R297) the merge moved into `_swicGeoApply`, which the network read AND the library kept
     between visits both go through — the same property, now covering one more caller. */
  const apply = src.slice(src.indexOf('function _swicGeoApply('), src.indexOf('function warmSwicGeo('));
  assert.match(apply, /const by=swicGeoBy\[iso\]\|\|Object\.create\(null\)/,
    'a later read MERGES into the library instead of replacing it');
  assert.match(body, /_swicGeoApply\(iso,d\.areas\)/, 'and the network read goes through it');
  assert.ok(!/const by=Object\.create\(null\); let n=0;[\s\S]{0,200}swicGeoBy\[iso\]=by; SHAPELIB\[iso\]=n;/.test(body),
    'the replace-wholesale version must be gone');
  assert.match(body, /SWIC_GEO_RETRY_MS/, 'a member that answered with nothing is asked again later');
  /* the stable administrative index, and the host that actually serves the bytes */
  assert.match(src, /media\.githubusercontent\.com\/media\/wmgeolab\/geoBoundaries/,
    'raw.githubusercontent returns the Git-LFS pointer; the media host serves the file, with CORS');
  /* (#R290) the ladder is `shapeOfRaw` now — `shapeOf` wraps it in a per-(country, name) memo,
     because it runs after every MeteoAlarm batch over all thirty-five countries and the rungs are
     not cheap (the edit-distance one added this round sweeps the whole index). The ORDER is the
     property this test owns, and a sixth rung joined it: the shipped world administrative index,
     LAST, because it measures worse than the closer indexes where those exist. */
  const sh = src.match(/const shapeOfRaw=\(a\)=>\{[\s\S]*?wholeCountryShape\(iso,a\.name\); \};/);
  assert.ok(sh, 'the MeteoAlarm ladder must exist');
  assert.match(src, /const shapeOf=\(a\)=>\{ if\(a\.poly\) return shapeOfRaw\(a\);/,
    'and it is consulted through a memo, once per name');
  const order = ['a.poly', 'lib', 'idx', 'aliasUnit', 'gb', 'wa', 'wholeCountryShape'];
  let at = -1;
  for (const step of order) {
    const k = sh[0].indexOf(step);
    assert.ok(k > at, step + ' comes after ' + (order[order.indexOf(step) - 1] || 'the start'));
    at = k;
  }
});

/* ── ⑩ green means «this ran», not «this file was read» ──────────────────────────────────────
   Every deletion check above is run once more against a synthetic source carrying the OLD shape,
   so a predicate that matches nothing anywhere cannot pass by accident (#R274 ③).               */
test('#R284 ⑩ the deletion checks would catch the old code', () => {
  /* ⚠ (#R288) the pair swapped round: what must not appear in the file now is #R284's own −1. */
  const oldWash = "function washTier(c){ if(!supported(c)) return 0; if(readState(c)!=='ok') return -1; return 1; }";
  assert.ok(/return\s*-1;/.test(oldWash),
    'the predicate that must not match the new file DOES match the old one');
  const oldPlayer = "'<button class=\"ecl-b\" data-act=\"next\">▶</button>'";
  assert.ok(oldPlayer.includes('▶'), 'and the old player really did carry the play glyph on next');
  const oldWind = "if(ev.type==='time'){ if(renderer) renderer.setField(null); load(); }";
  assert.ok(/renderer\.setField\(null\)/.test(oldWind), 'and the erase really was there');
});
}

/* ══════════ from tests/r297-checks.test.mjs — 9 of its 13 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* ============================================================================
 *  IntMap · #R297 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins something that was MEASURED on production before a line was written,
 *  and pins the RELATION rather than the number (#R199/#R203):
 *
 *    · 「警報レイヤーが重すぎる」 — with a control, on the deployed build, 60 s at z4 over Europe:
 *        nothing on   TBT 19.5 s · 36.5 fps
 *        warnings on  TBT 49.0 s · **3.4 fps**
 *        wind on      TBT 21.3 s · 17.7 fps
 *      and 62 whole-collection uploads in 78 s, up to 3,792 polygons each, 9,942 feature-state
 *      writes. ⚠ THE FIRST FOUR FIXES DID NOT MOVE THOSE NUMBERS, and that was the clue: the
 *      uploads were not coming through the publisher at all. MapLibre fires `styledata` for every
 *      style mutation — `setSourceData` included — and this file's basemap-swap recovery listened
 *      to it and re-uploaded unconditionally, so a publish fired the recovery, which re-uploaded,
 *      which fired the recovery. A publish did not settle; it oscillated (⑬). The other four are
 *      real work removed and are tested too: the agency's whole bulletin list was a STRING PROPERTY
 *      on every feature (①); every MeteoAlarm batch rebuilt all thirty-five countries (②); the
 *      upload was coalesced at 160 ms, which merges nothing (③); the abbreviation label layer ran
 *      symbol collision over four thousand features at a zoom where none could be read (④); and
 *      `countryAt` walked every ring of every hi-res country outline, 5,562 ms per 50 s.
 *    · 「風レイヤーが重すぎる」 — 14.5 s to the first particle at the opening view, 74.9 s zoomed in.
 *      `bandFor` returns null past 120° of latitude and the opening view is the globe, so the layer
 *      read the whole planet (13,199,360 samples, ~18 MB) before anything moved. Measured A/B: a
 *      global read is bandwidth-bound, so #R288's prefetch has nothing to collapse.
 *    · 「変えてから読み込まれるまでいったん地図が何もなくなる」 — `isSourceLoaded` is true for a raster
 *      source that has not been asked for a tile yet, so the new slot was uncovered and the old one
 *      removed while the new one had nothing to draw. #R290's rule, one source along.
 *    · 「風レイヤーのカラー凡例は、30m/sまでにして」 — the ramp runs to 104 m/s (Windy's own clamp).
 *    · 「データのある時間のみを選べる、離散的な感じに」 — every ECMWF clock steps over the model's own
 *      index already (#R290/#R293); the TIDE clock was a minute-resolution `datetime-local` over an
 *      HOURLY model, with a 6 h 12 m step that lands on :12.
 *    · 「塗漏れ、塗りすぎが多すぎる」 — measured: EVERY MeteoAlarm area carries an EMMA_ID and NOT ONE
 *      carries a polygon (ten countries, 850 areas), so those thirty-five countries are placed by
 *      NAME. Spain 99/153, Croatia 6/13, Finland 4/9 … The index that names their zones is the one
 *      the same service files with the WMO, and it started empty on every visit.
 *    · 「境界線解像度が低すぎる」 — Europe's regions were placed against Eurostat NUTS **20M**.
 *    · 「平面地図は自由スクロールに一本化」 — see tests/r223 ③, which now guards the removal.
 * ==========================================================================*/

/* ── ① the agency's rows do not travel in the collection the map re-tiles ─────────────────────── */
test('R297 ① the warning rows are a side table, not a property of every feature', () => {
  const s = read('js/world-packs.js');
  assert.ok(!/items:JSON\.stringify/.test(s), 'no bulletin list is serialised into a feature');
  assert.match(s, /const ROWS=Object\.create\(null\)/, 'the rows live beside the collection');
  assert.match(s, /const rowsOf=\(pr\)=>/, 'and one accessor reads them');
  assert.match(s, /ROWS\[rid\]=\(rows\|\|\[\]\)\.slice\(0,400\)/, 'the same cap as before, kept');
  /* every reader goes through the accessor — a JSON.parse of a feature property means one was missed */
  assert.ok(!/JSON\.parse\((?:pr|p|f\.properties)\.items/.test(s), 'nothing parses the old property');
  const uses = (s.match(/rowsOf\(/g) || []).length;
  assert.ok(uses >= 3, 'the tap card, the country key and the hot list all read through it, got ' + uses);
});

/* ── ② one country's batch rebuilds one country ───────────────────────────────────────────────── */
test('R297 ② maFeatures and swicFeatures are per-country, under a key that names every input', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /const _maFeat=Object\.create\(null\)/);
  assert.match(s, /const _swFeat=Object\.create\(null\)/);
  /* the key has to move when the DATA moves, when an INDEX arrives, and when the LANGUAGE changes —
     miss one and a late boundary set is ignored for ever */
  const ma = /const fkey=mkey\+'\\u0000'\+\(maAt\[iso\]\|\|0\)\+'\\u0000'\+_lang;/;
  assert.ok(ma.test(s), 'the MeteoAlarm key names the index set, the read time and the language');
  assert.match(s, /const fkey=\(swicAt\[iso\]\|\|0\)\+'\\u0000'\+\(SHAPELIB\[iso\]\|\|0\)\+'\\u0000'\+\(WORLD\?1:0\)\+'\\u0000'\+_lang;/);
  /* and the memo is USED, not merely written */
  assert.match(s, /if\(done&&done\.k===fkey\)\{ done\.f\.forEach/);
});

/* ── ③ the collection is uploaded once per burst, and the country sheet shares the window ─────── */
test('R297 ③ publish and paintCountries are throttled to one window, and force still runs at once', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /const PUBLISH_MS=\d+;/);
  const ms = +(/const PUBLISH_MS=(\d+);/.exec(s) || [])[1];
  assert.ok(ms >= 400, 'a window shorter than a few hundred ms merges nothing — it was 160 ms');
  assert.match(s, /const wait=Math\.max\(60,PUBLISH_MS-\(Date\.now\(\)-pubLast\)\);/);
  assert.match(s, /pubT=0; pubLast=Date\.now\(\);/, 'the throttle is measured from the last upload');
  assert.match(s, /if\(!force\)\{ if\(paintT\) return; paintT=setTimeout\([^\n]*PUBLISH_MS\);/,
    'the country sheet uses the same window');
  assert.match(s, /clearTimeout\(paintT\); paintT=0; _paintCountriesNow\(true\);/,
    'a forced repaint is not delayed');
});

/* ── ④ the abbreviation layer has a floor ─────────────────────────────────────────────────────── */
test('R297 ④ the hazard abbreviation is not collision-tested at a zoom nobody can read it', () => {
  const s = read('js/world-packs.js');
  const m = /id:'wp-alert-lbls',type:'symbol',source:SRC,\s*\n?\s*filter:\['>',\['get','norm'\],0\], minzoom:([\d.]+), maxzoom:5,/.exec(s.replace(/\r\n/g, '\n'));
  assert.ok(m, 'the abbreviation layer declares a minzoom');
  assert.ok(+m[1] > 0 && +m[1] < 5, 'and it is below the zoom where the full name takes over');
});

/* ── ⑨ a tap opens the country's own key ──────────────────────────────────────────────────────── */
test('R297 ⑨ clicking a country opens that country’s key, and a publish cannot overwrite it', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /function countryPanel\(iso\)\{/);
  assert.match(s, /openPointCard\(lng,lat,c\);[\s\S]{0,200}if\(c\) countryPanel\(c\);/);
  assert.match(s, /function showPanel\(\)\{ if\(!on\) return; if\(panelISO\) countryPanel\(panelISO\); else overview\(\); \}/);
  /* nothing may refresh the panel by calling overview() directly any more, or the country view
     would be replaced by the worldwide list on the next batch that lands */
  /* no DATA path may refresh the panel with overview() — the one place left is the tap card's own
     close button, which is deliberately taking the reader back to the worldwide view */
  const direct = (s.replace(/\r\n/g, '\n').match(/panel\.shown\(\)\) overview\(\)/g) || []).length;
  assert.equal(direct, 1, 'only closeTap() goes back to the worldwide view directly');
  assert.match(s, /const closeTap=\(\)=>\{ closePointCard\(\); if\(panelISO&&on\)\{ panelISO='';/,
    'closing the card returns the panel to the worldwide view');
});

/* ── ⑩ the shape library survives the session ─────────────────────────────────────────────────── */
test('R297 ⑩ the WMO shape library is cached, merged and applied before anything is asked for', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /const SWIC_GEO_CACHE='intmap-page-swicgeo-v1';/);
  assert.match(s, /async function swicGeoCached\(mid\)/);
  assert.match(s, /async function swicGeoStore\(mid,areas\)/);
  assert.match(s, /function warmSwicGeo\(iso\)/);
  assert.match(s, /Object\.keys\(MA\)\.forEach\(c=>\{ if\(swicMeta\.mid\[c\]\) warmSwicGeo\(c\); \}\);/,
    'the member table is the first moment the cache can be read');
  /* it must MERGE, never replace — the register only holds what is in force right now (#R284) */
  assert.match(s, /\(old\|\|\[\]\)\.concat\(d\.areas\|\|\[\]\)/, 'a stored library is merged, not overwritten');
  /* and only geometry is stored — never what is in force */
  assert.match(s, /keep\.push\(\{name:a\.name,geom:a\.geom\}\)/, 'name and shape, nothing else');
  /* a WMO member that could not place its own area builds a library too */
  assert.match(s, /if\(!a\.geom\)\{ anyMissed=true; missed=true; askSwicGeo\(iso\);/);
});

/* ── ⑪ Europe is not placed against a 1:20 million outline ────────────────────────────────────── */
test('R297 ⑪ Europe gets a finer boundary set when the reader is close enough to see it', () => {
  const s = read('js/world-packs.js');
  /* the floor stays coarse — it is what the whole of Europe is drawn from, and a finer floor makes
     every polygon in the ONE collection this layer re-tiles heavier for a picture nobody can tell
     apart. What a reader who has zoomed in gets is the FINE tier. Pin the relation, not a number. */
  const floor = /NUTS_RG_(\d+)M_\d+_4326_LEVL_3\.geojson'\)\]/.exec(s.replace(/\r\n/g, '\n'));
  assert.ok(floor, 'the floor is one generalisation, named once');
  assert.match(s, /NUTS_RG_03M_2021_4326_LEVL_3\.geojson/, 'and the finer tier exists');
  assert.ok(+floor[1] > 3, 'the fine tier really is finer than the floor');
  assert.match(s, /function askNutsFine\(\)/);
  assert.match(s, /askNutsFine\(\);/, 'the zoom that upgrades the units asks for it too');
  /* the memo has to notice — a finer index that arrives and is ignored is worse than none */
  assert.match(s, /\(idx\?\(nutsFineOn\?'N':'n'\):'-'\)/, 'mkey names the fine index');
  assert.match(s, /return maFeatures\(\)\.then\(\(\)=>\{ if\(on\) publish\(\); \}\);/);
});

/* ── ⑬ a data change is not a basemap swap ───────────────────────────────────────────────────── */
test('R297 ⑬ the style-swap recovery runs on a swap, not on every mutation it makes itself', () => {
  const s = read('js/world-packs.js').replace(/\r\n/g, '\n');
  /* MapLibre fires `styledata` for setSourceData too, so an unconditional re-upload in this
     handler re-fires itself. The dispatcher coalesces… */
  assert.match(s, /let _reT=0;/);
  assert.match(s, /GE\(\)\.events\.on\('styledata',\(\)=>\{ if\(_reT\) return;/,
    'a burst of mutations is one pass');
  /* …and the pack that owns four thousand polygons only recovers when it really was dropped.
     `ensureLayers()` clears the signature when it builds a fresh source (#R290), so that is the
     signal — not a flag somebody has to remember to set. */
  assert.match(s, /const fresh=\(featsSig===''\);/);
  assert.match(s, /if\(fresh\)\{ const shown=quietFeatures\(\)\.concat\(feats\);/);
  /* ⚠ (#R344) …through the one function that owns the upload — see tests/r290 ⑤② and r344. */
  assert.match(s, /uploadShown\(shown,featSig\(shown\)\);/);
  /* ⚠ (#R298) the quiet units ride in that one upload now, so what has to go with the recovery is
     the SET (`washTier` reads it) and the forced 258-country repaint — not a second upload. */
  assert.match(s, /refreshQuietLayer\(\);/);
  assert.match(s, /paintCountries\(fresh\);/);
  /* the recovery must still EXIST — #R72 recorded what happens when nothing puts the layers back */
  assert.match(s, /onRestyle\(\(\)=>\{ if\(!on\) return; whenDrawable\(\(\)=>\{\n\s*if\(!ensureLayers\(\)\) return;/);
});

/* ── ⑫ the coverage numbers are printed rather than claimed ───────────────────────────────────── */
test('R297 ⑫ the shape libraries this browser holds are counted, not assumed', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /shapeLib:Object\.assign\(\{\},SHAPELIB\)/);
  assert.match(s, /shapeLibTotal:Object\.keys\(SHAPELIB\)\.reduce/);
});
}

/* ══════════ from tests/r305-checks.test.mjs — 7 of its 17 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* ============================================================================
 *  IntMap · #R305 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins a RELATION a report named, not a number this round happened to pick.
 *
 *    · 「警報レイヤー、何も発令されていないのに、灰色に塗られていない場所がある。」
 *      MEASURED on the built page by sampling the rendered layers point by point — for each sample,
 *      which of `wp-alert-fill` (warned / quiet), `wp-alert-choro` (the country-wide sheet) and
 *      `wp-alert-hatch` actually covers it — with BOTH versions of the module put through the same
 *      camera, canvas and sample grid:
 *          z2, 7,154 samples · 3,404 of them on land under this layer
 *              before  **759 painted by NOTHING (22.3 %)** — Canada 386 · China 186 · USA 101 · Brazil 58
 *              after   **217 (6.4 %)**                      — Canada 206 · China   4 · USA   0 · Brazil  0
 *          z5 over central Europe, 3,213 samples → 73 (2.7 %), Switzerland 25 of them
 *      Two causes, and they are opposite ends of the same rule:
 *        ① `washTier` returned 2 (= 「the unit layer is painting this country」) for any country that
 *           was DRAWING something, and below `QUIET_UNIT_Z` the unit layer paints nothing at all.
 *        ② a warning SMALLER than one of this map's units threw that unit's grey away whole, so the
 *           part of the unit with nothing in force was painted by nobody.
 *      The residual is one country: the ECCC issues on its OWN forecast-region polygons, which nest
 *      inside no boundary set this map holds for Canada (13 provinces against 112 warnings).
 *      No new overlap of colour on grey is introduced by any of it.
 *
 *    · 「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」 (2回目)
 *      Both of the reads this module starts on its own went down the SAME FIFO queue as the read the
 *      reader was waiting for, and at world zoom both of them ask for the planet; the warm-up asked
 *      for the hour AHEAD whichever way the reader was going. Those are defects and they are fixed.
 *      ⚠⚠⚠ AND IT DID NOT MAKE THE STEP FASTER, MEASURED. The 7,050 / 7,942 / 8,270 → 1,501 / 684 /
 *      1,665 ms this round first recorded was the browser's HTTP CACHE: the same origin had already
 *      fetched those `.om` byte ranges. Re-run with hours never visited by either build:
 *          before  6,849 / 6,357 / 6,858 ms      after  6,699 / 6,779 / 6,784 ms
 *      A cold step is dominated by ~6.5 s of ranged reads and the queue order does not move it.
 *      So what is pinned below is the SHAPE of the read path, never a speed.
 *
 *    · 「地点を選ばないといけない系のツール…いや並行してどちらも出てくるとかあほか。」
 *      #R302 added the app's red toast and left #R298's shared bar armed, so one press of one row
 *      put the same sentence on screen twice at the same moment.
 * ==========================================================================*/
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-five times; ask the question of the text that RUNS. */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => noComments(read('js/world-packs.js'));
/* ══ ⚠⚠⚠ (#R307) A WINDOW COUNTED IN CHARACTERS IS A TIMER ON THE NEXT ROUND ═══════════════════
   Two of the checks below used `[\s\S]{0,600}` / `{0,1600}` to mean 「inside this function」, and both
   went red the moment #R307 added lines to `quietGeomFor` and `warnMeeting` — for changes that make
   the very thing they assert MORE true. It is #R306's own ⑥ (a {0,600} window whose body is 604
   bytes with LF and 615 with CRLF, so CI was green and Windows red) with a different trigger.
   → ask the FUNCTION BODY, brace-balanced. The claims are unchanged; what is gone is the distance. */
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「何も発令されていないのに、灰色に塗られていない場所がある。」
 * ==========================================================================================*/

/* ── ① the country sheet steps aside, and something must actually take its place ──────────────
   ⚠ THE FIX IS NOT IN `washTier`. `drawnISO[c]` takes the country-wide sheet away from a country
   that is drawing warnings (#R270 ⑧ / #R299 ②, and both are right); `quietSet[c]` is what puts the
   per-unit grey in its place. The defect was that below `QUIET_UNIT_Z` the second one was empty by
   design, so the first arm handed the ground to nobody. Both arms stay; ② is the fix. */
test('R305 ① the country sheet steps aside only where something replaces it', () => {
  const s = WP();
  assert.match(s, /return \(quietSet\[c\]\|\|drawnISO\[c\]\)\?2:1; \}/,
    'a country that is drawing is never washed whole, and one whose units are drawn is not either');
  /* and the wash for what could not be placed is still only for a country drawing nothing */
  assert.match(s, /if\(u&&!drawnISO\[c\]\) return 10\+Math\.min\(4,u\);/,
    "#R273's rule stands: the rank wash is for a country whose units are not on the map at all");
  /* the arm that has to take over is the unit layer, and ② is what makes it run at every zoom */
  assert.match(s, /function refreshQuietSet\(\)\{ quietList=quietISOs\(\);/,
    'quietSet is filled from quietISOs — the set ② removes the floor from');
});

/* ── ② …and what replaces it has no zoom floor for a country with something in force ─────────
   `QUIET_UNIT_Z` is a statement about DISTINCTIONS (a Landkreis is a fraction of a pixel at world
   zoom). It became a statement about whether the ground gets painted at all the moment ① made the
   country sheet stand down for a warned country. */
test('R305 ② a warned country is drawn by unit at every zoom', () => {
  const s = WP();
  assert.match(s, /function warnedISOs\(\)\{[\s\S]{0,320}?\(\+q\.norm\|\|0\)>0\) s\[q\.iso\]=1;/,
    'the set of countries with anything in force is read from `feats` itself');
  const qi = /function quietISOs\(\)\{[\s\S]{0,700}?return out\.sort\(\); \}/.exec(s);
  assert.ok(qi, 'quietISOs must be findable');
  assert.match(qi[0], /if\(!\(z>=QUIET_UNIT_Z\|\|warned\[iso\]\)\) return;/,
    'the floor applies to a quiet country and not to a warned one');
  assert.ok(!/if\(!\(z>=QUIET_UNIT_Z\)\) return out;/.test(qi[0]),
    'the whole function must not bail out below the floor any more');
  /* the units have to be ASKED for at that zoom too, or the set above is always empty */
  const ask = /function askUnitsInView\(\)\{[\s\S]{0,900}?upgradeUnitsInView\(\); \}/.exec(s);
  assert.ok(ask, 'askUnitsInView must be findable');
  assert.match(ask[0], /if\(lowZ&&!warned\[c\]\) return;/,
    'a warned country is asked for its units below the floor as well');
});

/* ── ③ the published set and the asked-for set are bounded by the SAME box ───────────────────
   `quietISOs` pads the view by half a screen; `askUnitsInView` used the bare bounds, so a country
   in that padding was published as quiet if its units happened to exist and never asked for them
   otherwise. */
test('R305 ③ one padded view box answers both questions', () => {
  const s = WP();
  assert.match(s, /function paddedView\(\)\{[\s\S]{0,320}?w\*0\.5[\s\S]{0,200}?h\*0\.5/,
    'the padded box is one function');
  assert.match(s, /function quietISOs\(\)\{[\s\S]{0,400}?const vb=paddedView\(\);/,
    'the published set uses it');
  assert.match(s, /function askUnitsInView\(\)\{[\s\S]{0,600}?const vb=paddedView\(\);/,
    '…and so does the set that is asked for');
});

/* ── ④ a warning smaller than a unit becomes a HOLE in that unit, not the end of it ──────────
   ⚠ THE TWO DIRECTIONS ARE DIFFERENT QUESTIONS. 「the unit's centre is inside a warning」 does not
   mean 「the warning covers the unit」 — measured, that is how Sichuan lost Aba and Ganzi, two
   prefectures the size of a small country, to a county-level warning inside them. */
test('R305 ④ the quiet grey is cut, not dropped, where the warning is the smaller shape', () => {
  const s = WP();
  assert.match(s, /function warnMeeting\(iso,g\)\{/, 'the two directions are answered together');
  assert.match(s, /if\(_bbInside\(ub,bb\)\)\{ covering=true; break; \}/,
    'only a warning at least as big as the unit COVERS it');
  assert.match(s, /function punchQuiet\(g,warns\)\{/, 'the smaller ones are punched out');
  const q = fnBody(s, 'quietGeomFor');
  assert.match(q, /if\(sameOutline\(iso,g\)\)\{ _qDropped\+\+; return null; \}/,
    'a unit that IS the warning is still dropped whole (#R299)');
  assert.match(q, /const cut=punchQuiet\(g,ins\);/, 'and a warning that fits inside a unit is punched out of it');
  assert.match(q, /_qNoPunch\+\+; _qDropped\+\+; return null; \}/,
    'a warning that will not fit inside the unit falls back to dropping it');
  /* ⚠ (#R307) …and that whole path is now the FALLBACK: the exact difference answers first, and it
     answers this case too. What this test protects — 「a warning smaller than a unit does not take
     the unit with it」 — is what got stronger, so it is asserted of the first answer as well. */
  assert.ok(q.indexOf('subtractWarnings(') < q.indexOf('punchQuiet('),
    'the exact difference is asked before the punch');
});

/* ── ⑤ MapLibre decides 「ring or hole」 by WINDING ──────────────────────────────────────────
   `classifyRings` starts a NEW polygon whenever a ring's signed area has the same sign as the first
   one's. A hole ring copied in with its source's own winding would therefore be FILLED — the double
   coat #R298 removed, in the one place it would be hardest to see. */
test('R305 ⑤ a punched ring is wound against its outer ring', () => {
  const s = WP();
  assert.match(s, /function ringArea2\(r\)\{/, 'the signed area of a ring is measured');
  assert.match(s, /const oA=ringArea2\(out\[put\]\[0\]\), hA=ringArea2\(ring\);/,
    'both rings are measured, not assumed');
  assert.match(s, /out\[put\]\.push\(\(\(oA>0\)===\(hA>0\)\)\?ring\.slice\(\)\.reverse\(\):ring\);/,
    'the hole is reversed when it agrees with the outer ring');
  /* and it may only be a hole in a polygon it is actually inside */
  assert.match(s, /if\(put<0\) return null;/, 'a ring that fits no polygon of the unit is not punched');
  assert.match(s, /function ringInside\(r,outer\)\{[\s\S]{0,300}?if\(!ptInRing\(r\[i\],outer\)\) return false;/,
    'containment is tested against the outer ring, with no tolerance');
});

/* ── ⑥ the two halves of 「no overlap, and no hole either」 are counted ────────────────────────
   A count that cannot report a shortfall is not a count (#R302 ⑰). */
test('R305 ⑥ the instrument says how many units were cut and how many were dropped', () => {
  const s = WP();
  assert.match(s, /quietPunched:/, 'how many units kept their grey with the warned part cut out');
  assert.match(s, /quietSuppressed:/, 'how many had to be dropped whole');
  assert.match(s, /quietNoPunch:/, '…and how many of those were dropped because the cut would not fit');
  assert.match(s, /quietUnitISOs:/, 'and which countries the unit grey is being drawn for');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  #R306 追記 — 「何も発令されていないのに、灰色に塗られていない場所がある。」(same report)
 *  MEASURED on production after #R305 shipped: 275 of 3,400 land samples were still painted by
 *  nothing, and **83 of them were in Russia** — a country whose warnings this map places on ITS OWN
 *  admin-1 units. Two features out of one index cannot overlap, so neither can be a hole in the
 *  other; what put them there was `geomCentre`, the average vertex of the largest ring, landing
 *  outside its own concave subject and inside a neighbour's.
 * ==========================================================================================*/
test('R306 ⑰ a neighbour is not something inside this unit', () => {
  const s = WP();
  assert.match(s, /function unitBoxes\(iso\)\{/, 'the outlines this country holds are indexed');
  assert.match(s, /_uBoxOf\[iso\]=\{of:u,set:set\};/,
    "…once per country per publish, keyed on the unit array's own identity");
  const wm = fnBody(s, 'warnMeeting');
  /* ⚠ (#R344) the key is remembered on the shape now (`geomKey`) — the same four decimals of the
     same box, spelled once instead of once per candidate per unit per publish. */
  assert.match(wm, /const isNeighbourUnit=\(wg\)=>\{ const k=geomKey\(wg\); return !!\(k&&k!==myKey&&boxes\[k\]\); \};/,
    'a warning whose outline IS one of this country’s units is that unit');
  assert.match(wm, /const add=\(wg\)=>\{ if\(wg!==g&&!isNeighbourUnit\(wg\)&&inside\.indexOf\(wg\)<0\) inside\.push\(wg\); \};/,
    '…so it is never collected as something inside this one');
  assert.match(wm, /if\(isNeighbourUnit\(bin\[i\]\)\) continue;/,
    '…and it can never COVER this one either, however big its bounding box is');
  /* ⚠ (#R307) the same exclusion has to reach the bbox candidate set, or the difference would
     subtract a neighbour from this unit — two features of one index never overlap, so it would be a
     no-op, but the cost is real and the intent should be one rule, not two. */
  assert.match(wm, /warnsNear\(rec,g,ub,isNeighbourUnit\)/, 'and the candidate set is filtered by it too');
  /* the unit that warning really belongs to is still dropped, by the test that was already there */
  assert.match(s, /function sameOutline\(iso,g\)\{/, 'the unit that IS the warning is still dropped');
});
}

/* ══════════ from tests/r306-checks.test.mjs — 4 of its 4 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）。④ は別の検査ファイルの窓の形そのものが対象 */
/* ============================================================================
 *  IntMap · #R306 — source-level checks
 * ----------------------------------------------------------------------------
 *  「警報レイヤー、何も発令されていないのに、灰色に塗られていない場所がある。」 — third pass.
 *
 *  MEASURED on production, z2, 3,400 land samples, after each of the two previous passes:
 *      after #R305          275 painted by nothing (8.09 %)   CAN 140 · RUS 83 · SAU 15 · DZA 13 · KAZ 13
 *      after #R305 追記     285 (8.38 %)                       CAN 146 · RUS 83 · SAU 23 · DZA 13 · KAZ  9
 *  Russia did not move, because the 追記 asked 「is this warning one of our own units?」 by OUTLINE,
 *  which can only fire where the warnings and the units come from the SAME index. Russia's do not:
 *  the tap card names the warned area 「Murmansk Region」 and the quiet units 「Kaliningrad」 — two
 *  separately published boundary sets.
 *
 *  THE CAUSE: `centroidOf` is the average vertex of the largest ring. It is cheap and it is NOT a
 *  point of the polygon — for anything concave, C-shaped or spread over islands it lands outside its
 *  own outline, very often inside a NEIGHBOUR. Both containment questions this file asks were asked
 *  with it, so both were answered about the wrong shape, and the answer is used to throw a quiet
 *  unit's grey away.
 * ==========================================================================*/
/* ⚠ comments are stripped first — this file's own notes quote the spellings it replaced */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => noComments(read('js/world-packs.js'));

/* ── ① a point that is really in the shape ───────────────────────────────────────────────────*/
test('R306 ① the containment tests ask with a point that is inside its own polygon', () => {
  const s = WP();
  assert.match(s, /function _ringInsidePoint\(ring\)\{/, 'the scan line exists');
  /* the middle of the ring's own latitude range, and the widest interior span across it */
  assert.match(s, /const y=\(s\+n\)\/2, xs=\[\];/, 'the line is the middle of the ring, not of the world');
  assert.match(s, /if\(\(a\[1\]>y\)!==\(b\[1\]>y\)\) xs\.push\(a\[0\]\+\(y-a\[1\]\)\*\(b\[0\]-a\[0\]\)\/\(b\[1\]-a\[1\]\)\);/,
    'every edge that crosses it contributes its crossing');
  assert.match(s, /for\(let i=0;i\+1<xs\.length;i\+=2\)\{ const d=xs\[i\+1\]-xs\[i\]; if\(d>w\)\{ w=d; x=\(xs\[i\]\+xs\[i\+1\]\)\/2; \} \}/,
    'and the answer is the midpoint of the widest INTERIOR span (pairs, not any two crossings)');
  /* ⚠ the line can cross a hole — the geometry has the last word */
  assert.match(s, /if\(pt&&!inGeom\(pt,g\)\) pt=null;/,
    'a point the geometry does not accept is thrown away');
  assert.match(s, /return _stash\(g,'__ip',pt\|\|geomCentre\(g\)\);/,
    '…and the old centroid is the fallback, never the first answer');
});

/* ── ② …and BOTH containment questions use it ────────────────────────────────────────────────*/
test('R306 ② the warning index and the unit test both moved to it', () => {
  const s = WP();
  assert.match(s, /const wc=geomInside\(f\.geometry\);/,
    'a warning is bucketed by a point that is really in the warning');
  assert.match(s, /const c=geomInside\(g\);/,
    '…and a unit is tested by a point that is really in the unit');
  /* the bucket lookup has to use the same point it was filed under */
  assert.match(s, /if\(wc\)\{ const k=Math\.floor\(wc\[0\]\)\+':'\+Math\.floor\(wc\[1\]\); \(rec\.pts\[k\]\|\|\(rec\.pts\[k\]=\[\]\)\)\.push\(\{c:wc,g:f\.geometry\}\); \}/,
    'the cell key is derived from that same point');
});

/* ── ③ the old centroid keeps the jobs it is right for ───────────────────────────────────────
   ⚠ NOT EVERY USE OF A CENTRE IS A CONTAINMENT TEST. `dedupeSameShape` and the tap card ask about
   IDENTITY and PROXIMITY, where the average vertex is the right cheap answer and 「is it inside」 is
   not the question. Replacing those too would have been a change nobody asked for. */
test('R306 ③ identity and proximity still use the cheap centroid', () => {
  const s = WP();
  assert.match(s, /function centroidOf\(g\)\{/, 'the average-vertex centroid still exists');
  assert.match(s, /function geomCentre\(g\)\{[\s\S]{0,200}?_stash\(g,'__ac',centroidOf\(g\)\)/,
    '…and is still what geomCentre caches');
});

/* ── ④ a window measured in CHARACTERS is measured in line endings too ───────────────────────
   `tests/r293 ⑥` pinned `/askUnitsInView[\s\S]{0,600}upgradeUnitsInView\(\);/`. That body is 604
   bytes with LF and **615 with CRLF**, so #R305 — which added two lines to it — turned the check
   red on every Windows checkout while CI stayed green. #R283 wrote this lesson for two other tests;
   this is the third. */
test('R306 ④ the view-pass check is asked of the function, not of a byte count', () => {
  const t = read('tests/weather-warnings-checks.test.mjs'); /* #R293 ⑥ lives there now */
  assert.match(t, /function askUnitsInView\\\(\\\)\\\{\[\\s\\S\]\{0,1200\}\?upgradeUnitsInView/,
    'the relation is pinned to the function body');
  assert.ok(!/askUnitsInView\[\\s\\S\]\{0,600\}upgradeUnitsInView/.test(t),
    'the raw 600-character window is gone');
  /* and the thing it is about is still true of the source */
  const s = WP();
  assert.match(s, /function askUnitsInView\(\)\{[\s\S]{0,1200}?upgradeUnitsInView\(\); \}/,
    'the view pass still ends by running the upgrade');
});
}

/* ══════════ from tests/r307-checks.test.mjs — 7 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）（多角形の差は polygon-clipping を実行して検査している） */
/* ============================================================================
 *  IntMap · #R307 — source-level checks
 * ----------------------------------------------------------------------------
 *  Three reports, all of them repeats:
 *    ①「何も発令されていないのに、灰色に塗られていない場所がある。五條市のように、同じ市町村でも
 *        発令単位では分かれている場合なども考慮して。」                                    (4回目)
 *    ②「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」    (3回目)
 *    ③「一回地点選んだらそのあとのやつも全部その地点で強制開始とかあほか。」               (4回目)
 *
 *  ⚠ THE ASSERTIONS BELOW ARE RELATIONS, NOT SPELLINGS. Twenty-four rounds running, this project has
 *  had legitimate changes turned red by a check that pinned a literal — #R306's own ⑥ pinned a
 *  {0,600} character window that CRLF pushed to 615 bytes, so CI was green and Windows was red. What
 *  each of these asks is 「does the call sit where the fix put it」, of the FUNCTION BODY, and where a
 *  number matters it is asked as an inequality against the thing it has to be big enough for.
 * ==========================================================================*/
/* the comments in this project carry the reasoning, and several of them QUOTE the spellings that
   were replaced — a check that greps them proves nothing */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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

/* ══ ① 灰色は「穴が開けられるか」ではなく「単位 − 警報」である ══════════════════════════════════ */
test('R307 ① the quiet unit is the DIFFERENCE, and the punch is only the fallback', () => {
  const s = code('js/world-packs.js');
  const body = fnBody(s, 'quietGeomFor');
  const iDiff = body.indexOf('subtractWarnings(');
  const iPunch = body.indexOf('punchQuiet(');
  assert.ok(iDiff > 0, 'quietGeomFor computes the difference');
  assert.ok(iPunch > 0, '…and #R305’s punch is still there');
  assert.ok(iDiff < iPunch, 'the difference is asked FIRST — the punch is what happens when it cannot answer');
  /* 「covering」 is a bbox-and-a-point approximation of the same question, so the exact answer
     outranks it (a warning whose box contains the unit does not necessarily cover the unit) */
  assert.ok(iDiff < body.indexOf('m.covering'), 'and it outranks the bbox approximation of the same question');
});

test('R307 ② the candidate set is every warning whose BOX meets the unit, not only the ones a point found', () => {
  const s = code('js/world-packs.js');
  const meet = fnBody(s, 'warnMeeting');
  assert.ok(/near:\s*warnsNear\(/.test(meet), 'warnMeeting carries the bbox candidate set');
  assert.equal((meet.match(/near:\s*warnsNear\(/g) || []).length, 2,
    '…on BOTH exits, so a unit the covering test matched still gets the exact answer');
  const near = fnBody(s, 'warnsNear');
  assert.ok(/bb\[2\]<ub\[0\]\|\|bb\[0\]>ub\[2\]\|\|bb\[3\]<ub\[1\]\|\|bb\[1\]>ub\[3\]/.test(near),
    'the filter is bbox overlap in both axes');
  assert.ok(near.includes('rec.all'), 'and a unit whose box is too big to walk the cell index falls back to the flat list');
  /* the flat list has to exist, or that fallback is a silent empty answer */
  assert.ok(/\(rec\.all\|\|\(rec\.all=\[\]\)\)\.push\(/.test(s), 'warnIndex builds it');
});

test('R307 ③ the clipper is lazy, declared, and never the only way to draw', () => {
  const s = code('js/world-packs.js');
  assert.ok(/import\('polygon-clipping'\)/.test(s), 'it arrives on its own chunk, not in the boot path');
  const sub = fnBody(s, 'subtractWarnings');
  assert.ok(/const pc=clipper\(\); if\(!pc\) return undefined;/.test(sub),
    'no clipper → no answer, which is what makes the punch below still run');
  const q = fnBody(s, 'quietGeomFor');
  assert.ok(/if\(d!==undefined\)/.test(q), 'and quietGeomFor distinguishes 「cannot answer」 from 「nothing left」');
  /* a transitive dependency is not a dependency — @turf/union happens to pull this in today */
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['polygon-clipping'], 'polygon-clipping is declared, not reached through turf');
});

test('R307 ④ the library really does cut a straddling warning, and winds holes the way MapLibre reads them', () => {
  /* #R305's ⚠: MapLibre's classifyRings starts a NEW polygon whenever a ring's signed area has the
     same sign as the first one's, so a hole copied in as-is is FILLED — the two-coat defect, in the
     one place it is hardest to see. This asks the library, not the source text. */
  const square = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]];
  const inside = [[[[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]]];
  const area2 = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };

  const holed = pc.difference(square, inside);
  assert.equal(holed.length, 1, 'a warning strictly inside a unit leaves one polygon');
  assert.equal(holed[0].length, 2, '…with a hole in it');
  assert.ok(Math.sign(area2(holed[0][0])) !== Math.sign(area2(holed[0][1])),
    'and the hole is wound OPPOSITE to its outer ring');

  /* the case the punch could never state, and the whole reason for this round */
  const straddle = [[[[8, 3], [14, 3], [14, 7], [8, 7], [8, 3]]]];
  const cut = pc.difference(square, straddle);
  assert.equal(cut.length, 1, 'a warning that leaves the unit still cuts it');
  assert.ok(Math.abs(Math.abs(area2(cut[0][0])) - 92) < 1e-6, '…by exactly the overlapping part');

  assert.deepEqual(pc.difference(square, [[[[-1, -1], [11, -1], [11, 11], [-1, 11], [-1, -1]]]]), [],
    'and a warning that covers the unit leaves nothing, which is 「drop it」');
});

/* ══ ⑤ 五條市 — 同じ市町村が複数の発令単位に分かれている ══════════════════════════════════════ */
test('R307 ⑤ a municipality split into several issuing units is drawn on the units, not on the municipality', () => {
  const s = code('js/world-packs.js');
  const split = fnBody(s, 'jpSplitCodes');
  /* derived from the JMA's own area.json, not a hand-written list of the forty */
  assert.ok(/slice\(0,\s*5\)/.test(split), 'the grouping key is the class20 code’s municipality prefix');
  assert.ok(/length>1/.test(split), '…and a prefix is 「split」 only when more than one unit shares it');
  assert.ok(!/292070|1410011/.test(split), 'no code is written into the rule itself');

  assert.ok(/geojson\/class20s\//.test(s), 'the JMA’s own per-unit outline is what it is drawn on');
  /* ⚠ and the municipality's quiet unit must survive it — `used` is what consumes the grey */
  assert.ok(/if\(g\) return \{ name:nameOf\(c\), geom:g, used:\[\] \};/.test(s),
    'a sub-municipal shape consumes NO municipality key, so the grey is cut rather than dropped');
  /* everything asked for is asked for: a cap that forgets the rest is how 五條市 stayed whole */
  const pump = fnBody(s, 'pumpJpSub');
  assert.ok(/jpSubQ\.shift\(\)/.test(pump) && /pumpJpSub\(\)/.test(pump),
    'the bounded concurrency is a queue that drains, not a cap that drops');
});

test('R307 ⑥ a coalesced refresh waits for the refresh to be free instead of being dropped', () => {
  const s = code('js/world-packs.js');
  /* `refresh()` opens with `if(busy) return;` — the two boundary upgrades schedule it, and a call
     made while a sweep is running used to vanish. Both re-arm. */
  assert.ok(/async function refresh\(\)\{ if\(busy\) return;/.test(s), 'refresh still drops a concurrent call');
  const arms = s.match(/if\(busy\)\{ (jpSubT|jpFineT)=setTimeout\(go,\d+\); return; \}/g) || [];
  assert.equal(arms.length, 2, 'both the sub-municipal outlines and the fine boundaries wait for it');
});

test('R307 ⑩ the layer still refuses to let grey and colour share a pixel', () => {
  const s = code('js/world-packs.js');
  /* the standing instruction 「発表無しポリゴンの上に発表ありポリゴンを重ねる形式を今すぐ辞めろ」 is
     what the difference makes STRONGER, not weaker: one fill layer, one grey, and the quiet geometry
     is the unit minus everything warned that touches it. */
  assert.equal((s.match(/id:'wp-alert-fill'/g) || []).length, 1, 'one fill layer carries both');
  const q = fnBody(s, 'quietGeomFor');
  assert.ok(/if\(d===null\)\{ _qCleared\+\+; _qDropped\+\+; return null; \}/.test(q),
    'a unit the difference empties is not drawn at all');
  assert.ok(/quietCut:/.test(s) && /quietCleared:/.test(s) && /quietClipper:/.test(s),
    'and the three are counted, so 「it worked」 is a number rather than a claim');
});
}

/* ══════════ from tests/r344-checks.test.mjs — 9 of its 9 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）・js/geo-engine.js・js/geo-command-log.js も描画エンジンに閉じている（geomBox は切り出して実行している） */
/* ============================================================================
 *  R344 — the warnings layer, audited: what it publishes, and what it re-publishes
 * ----------------------------------------------------------------------------
 *  ⚠ THE PROSE LIVES HERE ON PURPOSE. js/geo-engine.js is inside the shell budget
 *  (tests/r168 #8, ceiling 7,950 lines and it only ever goes down), so what this round
 *  MEASURED is written in this file and in DEV-NOTES.md, and the adapter carries three
 *  lines of it. This is the rule #R323 wrote after a 34-line note put the shell over.
 *
 *  ── ① 座標を1つも持たない図形は「図形」ではない ─────────────────────────────────
 *  MEASURED on the built page (world zoom, the layer on for 80 s): **27 features of the
 *  published collection had an empty geometry** — `{"type":"Polygon","coordinates":[]}`.
 *  All of them Taiwan. The 1982 township file this map indexes (g0v/twgeojson,
 *  legacy/twTown1982.json) ships **19 of its 378 features with no coordinates at all**:
 *
 *      台北市中正區 · 台南市中西區 · 台中市中區 · 基隆市仁愛區 · 高雄市鹽埕區 ·
 *      高雄市新興區 · 高雄市前金區 · 連江縣東引鄉 · 連江縣莒光鄉 · 澎湖縣七美鄉 · …
 *
 *  `twTownGeo()` asked whether `f.geometry` EXISTS, which those satisfy. So the names went
 *  into the index, `shapeOf` answered with them, and in the measured run **8 warnings in
 *  force — five of them 大雨 at rank 3 — became features that can never be drawn**.
 *
 *  Worse than invisible. `PLACED['TWN']` counted them as placed and `UNPL['TWN']` did not
 *  rise, so the country-wide wash that exists precisely to say 「something is in force here
 *  and this map cannot say where」 (#R271) was never asked for. And `dedupeSameShape`
 *  (#R298 追記) skipped them — `geomBox` returns null for such a shape — which is exactly
 *  why they survived the one pass that would otherwise have collapsed them.
 *
 *  The predicate already existed; nobody asked it. `geomBox` returns null when the walk
 *  finds no numbers at all (`if(!(w<=e&&s<=n)) return null`). So `shaped()` names it, and
 *  the three doors every shape enters through ask it: the boundary index, `setUnits`, and
 *  `unitFeature`. THE FIX IS THE PREDICATE, NOT THE COUNTRY — no future boundary set can
 *  repeat this for a different one.
 *
 *  ── ② 変わっていない地物まで、毎回まるごとシリアライズし直していた ───────────────
 *  MEASURED with a CPU profile of the built page, 70 s with the layer on:
 *
 *      MapLibre `serialize` (xs)            5,910 ms
 *      the `sendAsync` frame around it      5,594 ms
 *      ────────────────────────────────────────────
 *      main thread, for 26 uploads         11,504 ms   ← four times everything the
 *                                                        layer's own code does
 *
 *  and the payload at that moment was **13.3 MB · 5,163 features · 455,886 vertices**.
 *  `setData` has no way to say 「only these three moved」: one new warning re-walks the
 *  planet. #R290 and #R297 had already removed the uploads that said NOTHING (the content
 *  signature; the 1.5 s window). What was left were uploads that really did differ — by a
 *  handful of features out of five thousand.
 *
 *  MapLibre 5 has `GeoJSONSource.updateData({add,remove})`, which posts only the diff and
 *  re-tiles only the tiles the diff touches. It asks one thing of the caller: every feature
 *  must carry a unique id. So the contract added here is: a caller that can identify its
 *  features says `diffable` on the whole write and passes `diff` BESIDE the full collection
 *  afterwards. `data` is always the truth.
 *
 *  MEASURED, isolated (one synthetic source of 5,000 polygons / 88 vertices / 17.9 MB, no
 *  feeds, no other layer, 24 uploads each arm, interleaved in one process):
 *
 *      main-thread ms          whole      {add,remove}
 *      serialize + post        2,206          832
 *      xs alone                  711          239
 *      all of MapLibre         3,215        1,279
 *      garbage collector         623          173
 *
 *  and in the app itself, 90 s from cold at world zoom: **3 whole writes and 25 diffs**
 *  where there were 28 whole writes — 4,766 features each — i.e. about a tenth of the
 *  features handed to the serialiser. `STATE.alerts().upload` counts it, and the census
 *  counts which write the ADAPTER actually made (`diffed`), because a caller that thinks it
 *  is diffing while the adapter quietly falls back looks identical in every other number.
 *
 *  ⚠ AND THE FACADE USED TO DROP THE OPTIONS. `layers.setSourceData:(id,d)=>…(id,d)` — two
 *  arguments — so `opts.revision`, the contract #R322 added for a caller that reuses one
 *  object, could never reach the adapter from anywhere in the app. Nothing passes a
 *  revision today, which is why nobody noticed; it was unreachable, not unused.
 *
 *  ── ③ 「警報の顔ぶれが変わったか」を、配列の同一性で訊いていた ────────────────────
 *  `_qCache`, `warnIndex` and `warnedISOs` each remembered their answer under
 *  `_xxxOf===feats`. `feats` is rebuilt with `concat` on EVERY publish — a new array object
 *  every window, whatever the feeds said. So the three memos could hit WITHIN one publish
 *  and never across two, and `quietFeatures()` is called once per publish: its memo, the one
 *  standing in front of `warnMeeting` over four thousand units and every polygon difference
 *  behind it, had never once returned a cached answer.
 *
 *  ── ④ 一国の警報が1件変わると、地球上の全単位を作り直していた ────────────────────
 *  A unit's grey is `unit − ∪(the warnings of ITS OWN country that meet it)`: `warnIndex` is
 *  per country and `warnMeeting` never looks at another country's rows (#R298). One new
 *  German warning nevertheless re-ran `warnMeeting` over Japan's 1,490 municipalities.
 *  MEASURED after the per-country memo: **isoHit 1,102 / isoMiss 92** — 92 % of the country
 *  rebuilds are not done at all.
 *
 *  ── ⑤ 同じ図形の同じ鍵を、何度も綴り直していた ─────────────────────────────────
 *  `_bboxKey` is the identity this layer compares units and warnings by — `sameOutline`,
 *  `unitBoxes`, `warnMeeting`, `isNeighbourUnit`, `subtractWarnings`, the hatch cut — every
 *  unit against every candidate, every publish. MEASURED: **0.63 s of main thread in 70 s**,
 *  the busiest first-party function in the profile, four `toFixed(4)` at a time over shapes
 *  whose box `geomBox` had already remembered. After: it is not in the top thirty.
 *
 *  ── ⑥ 入力が変わったことは、出力が変わったことではない ──────────────────────────
 *  `rebuildHatchCut`'s key carries the whole collection's signature, so one warning landing
 *  anywhere re-runs it — and the CUT is the same nearly every time, because which countries
 *  are hatched changes far more slowly than the collection does. MEASURED: 18 to 40 uploads
 *  of that source in 70 s (19 features, 24,657 vertices) for a picture that had not moved.
 *
 *  ⚠ WHAT THIS ROUND DID NOT FIND. The layer's cost on this machine is dominated by
 *  `Commit` on the renderer main thread (24.6 s of a settled 30 s window, with the GPU
 *  process at 24.5 s) and hiding EVERY alert layer does not move it — so it is not the
 *  drawing, and it is not something this round could attribute in a headless browser.
 *  The numbers above are the ones that are the same in any browser: counts of what is
 *  built, and of what is handed to the renderer.
 * ==========================================================================*/
const read = (p) => readLF(join(ROOT, p));
const WP = () => read('js/world-packs.js');
const GE = () => read('js/geo-engine.js');
const CL = () => read('js/geo-command-log.js');

/* the source of one declaration, taken by its AST range — a window a regex cannot mis-cut
   (#R323) and a file's line endings cannot defeat (#R283/#R317) */
function declSource(src, name) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  let found = null;
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) found = found || src.slice(n.start, n.end);
    if (n.type === 'VariableDeclarator' && n.id && n.id.name === name && n.init) found = found || src.slice(n.start, n.end);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast);
  return found;
}

/* ── ① a geometry with no coordinates is not a shape ─────────────────────────────────── */
test('R344 ① 座標を1つも持たない図形は「図形」ではない — and the predicate is asked at every door', () => {
  const s = WP();

  /* the predicate exists and is spelled once */
  assert.match(s, /const shaped=\(g\)=>\(g&&geomBox\(g\)\)\?g:null;/,
    'shaped() is the one place that decides whether a geometry is a shape');

  /* …and every door asks it: the boundary index, the unit list, the feature builder */
  assert.match(s, /if\(!n\|\|!shaped\(f\.geometry\)\) return;/,
    'the Taiwan township index rejects a geometry with no coordinates');
  assert.match(s, /const g=\(geoms\|\|\[\]\)\.filter\(x=>!!shaped\(x\)\);/,
    'setUnits keeps only shapes — every country’s unit index goes through it');
  assert.match(s, /function unitFeature\(iso,feed,geometry,unit,name,rows,at,got\)\{\s*if\(!shaped\(geometry\)\) return null;/,
    'unitFeature refuses to publish a feature nothing can draw');

  /* THE PREDICATE, RUN. `geomBox` is taken out of the shipped file and executed, so this is a
     statement about the code that ships rather than about a regex over it (#R317). */
  const box = new Function('_stash', 'return ' + declSource(s, 'geomBox').replace(/^function /, 'function '))(
    (o, k, v) => { try { Object.defineProperty(o, k, { value: v, configurable: true }); } catch (_) { o[k] = v; } return v; });
  assert.equal(box({ type: 'Polygon', coordinates: [] }), null, 'an empty Polygon has no box');
  assert.equal(box({ type: 'MultiPolygon', coordinates: [] }), null, 'an empty MultiPolygon has no box');
  assert.equal(box({ type: 'Polygon', coordinates: [[]] }), null, 'a Polygon with an empty ring has no box');
  assert.deepEqual(box({ type: 'Polygon', coordinates: [[[1, 2], [3, 4], [1, 4], [1, 2]]] }), [1, 2, 3, 4],
    'a real polygon still boxes');
});

/* ── ② the collection is uploaded as a change, when it is one ────────────────────────── */
test('R344 ② the publish sends {add,remove}, and the whole collection is still the truth', () => {
  const s = WP();

  /* one function owns the upload — three callers used to keep `featsSig` in step by hand */
  assert.match(s, /function uploadShown\(shown,sig\)\{/);
  /* ⚠ `SRC` is a name five layer families in this file each bind to their own source, so the
     count is over the alerts payload rather than over the identifier. */
  assert.equal((s.match(/features:shown\}/g) || []).length, 2,
    'the warnings source is written from uploadShown and nowhere else (the whole write and the diff)');
  assert.match(s, /if\(sig!==featsSig\) uploadShown\(shown,sig\);/, 'the publish still guards on the signature');
  assert.match(s, /uploadShown\(shown,featSig\(shown\)\);/, 'and the relabel / style-swap paths go through it too');

  /* the identity is the one this layer already compares by — 答えか地面か + country + outline */
  assert.match(s, /const featId=\(f\)=>\(\(\(\+f\.properties\.norm\|\|0\)>0\)\?'w':'q'\)\+FID\+f\.properties\.iso\+FID\+geomKey\(f\.geometry\);/);
  /* a collision is given a suffix rather than silently dropping a feature */
  assert.match(s, /if\(next\.has\(id\)\)\{ let k=2; while\(next\.has\(id\+FID\+k\)\) k\+\+; id=id\+FID\+k; \}/);

  /* the two writes, and which options each carries */
  assert.match(s, /GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:shown\},\{diff:diff\}\);/);
  assert.match(s, /GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:shown\},\{diffable:ok\}\);/);

  /* a diff that would be most of the collection is not a diff, and it resyncs on a schedule */
  assert.match(s, /const RESYNC_EVERY=\d+, DIFF_MAX_FRAC=0\.\d+, DIFF_MIN_ROOM=\d+;/);
  assert.match(s, /if\(ok&&pubIds&&pubDiffRun<RESYNC_EVERY\)\{/);
  assert.match(s, /if\(add\.length\+remove\.length<=room\) diff=\{add:add,remove:remove\};/);

  /* a fresh source holds nothing to diff against */
  assert.match(s, /if\(!GE\(\)\.layers\.hasSource\(SRC\)\)\{ featsSig=''; pubIds=null;/);

  /* and it is counted, so 「差分で送っている」 is a reading rather than a belief */
  assert.match(s, /upload:\{ whole:pubWhole, diff:pubDiff, add:pubAdd, remove:pubRemove, ids:\(pubIds\?pubIds\.size:0\), ver:featsVer \},/);
});

/* ── ② the adapter side of the same contract ─────────────────────────────────────────── */
test('R344 ② the adapter diffs only a source that took a diffable whole write, and says so', () => {
  const g = GE();

  /* THE FACADE USED TO DROP THE THIRD ARGUMENT — see the header. `opts` could not reach the
     adapter from anywhere in the app, which made #R322's `revision` contract unreachable. */
  assert.match(g, /setSourceData:\(id,d,o\)=>A\(\)\.setSourceData\(id,d,o\)/,
    'the layers facade passes the options through');
  assert.ok(!/setSourceData:\(id,d\)=>A\(\)\.setSourceData\(id,d\)/.test(g),
    'and the two-argument spelling is gone');

  /* the diff is refused unless THIS source was last written whole from a diffable payload */
  assert.match(g, /const _d=\(opts&&opts\.diff&&_sd\.diff\[id\]&&s\.updateData/);
  /* an empty diff is not a diff */
  assert.match(g, /\(\(opts\.diff\.add\?opts\.diff\.add\.length:0\)\+\(opts\.diff\.remove\?opts\.diff\.remove\.length:0\)\)\)\?opts\.diff:null;/);
  /* a throw falls back to the complete write, and the permission survives it */
  assert.match(g, /if\(_d\)\{ const _td=t0\(\); try\{ s\.updateData\(_d\); _cmd\.diffed\('sourceData'\); t1\(_cmd,'sourceData',_td\); return; \}catch\(_\)\{\} \}/);
  assert.match(g, /_sd\.diff\[id\]=!!\(opts&&\(opts\.diffable\|\|opts\.diff\)\);/);
  /* the whole write is still there, unconditionally, after all of it */
  assert.match(g, /const _t=t0\(\); s\.setData\(data\); t1\(_cmd,'sourceData',_t\); \}, removeSource\(id\)\{/);

  /* …and the reader contract stays true: after a diff MapLibre keeps a MAP of features */
  assert.match(g, /if\(d&&d\.updateable&&typeof d\.updateable\.values==='function'\) d=\{type:'FeatureCollection',features:Array\.from\(d\.updateable\.values\(\)\)\};/);

  const c = CL();
  /* the permission is per source and is forgotten with the source */
  assert.match(c, /const mem = \{ sig: Object\.create\(null\), rev: Object\.create\(null\), hash: Object\.create\(null\), diff: Object\.create\(null\) \};/);
  assert.match(c, /mem\.forget = \(id\) => \{ delete mem\.sig\[id\]; delete mem\.rev\[id\]; delete mem\.hash\[id\]; delete mem\.diff\[id\]; \};/);
  /* and the census can tell the two writes apart with the instrument switched OFF */
  assert.match(c, /function diffed\(op\) \{ tot\[op\]\.diffed = \(tot\[op\]\.diffed \|\| 0\) \+ 1; \}/);
  assert.match(c, /return \{\s*note, time, diffed,/);
  assert.match(c, /t\.msCall = t\.msCmp = t\.diffed = 0;/, 'and reset() clears it with the rest');
});

/* ── ③ the memos are keyed on content, not on the identity of an array ───────────────── */
test('R344 ③ 「顔ぶれが変わったか」は内容で決める — the three memos can hit across publishes', () => {
  const s = WP();

  assert.match(s, /let featsVer=0, _featsWKey='';/);
  assert.match(s, /function stampFeats\(list\)\{/);
  /* it hashes the country and the OUTLINE of every warned shape — the two things the quiet
     geometry and the warn index depend on */
  assert.match(s, /if\(!q\|\|!q\.iso\|\|!\(\(\+q\.norm\|\|0\)>0\)\) continue; n\+\+; mix\(q\.iso\); mix\(geomKey\(f\.geometry\)\);/);
  assert.match(s, /if\(k!==_featsWKey\)\{ _featsWKey=k; featsVer\+\+; \}/);
  assert.match(s, /stampFeats\(feats\);/, 'and the publish stamps the collection it just built');

  /* the three memos read the version */
  assert.match(s, /if\(_warnIdxOf===featsVer&&_warnIdxSet===setSig&&_warnIdx\) return _warnIdx;/);
  assert.match(s, /function warnedISOs\(\)\{ if\(_wISOof===featsVer&&_wISO\) return _wISO;/);
  assert.match(s, /if\(_qCache&&_qCacheOf===featsVer&&_qCacheKey===key\) return _qCache;/);
  /* …and none of them compares the array itself any more */
  assert.ok(!/Of===feats&&/.test(s), 'no memo is keyed on the identity of `feats`');
});

/* ── ④ the quiet ground is remembered per country ────────────────────────────────────── */
test('R344 ④ a feed that lands rebuilds its own country and nobody else’s', () => {
  const s = WP();
  assert.match(s, /function quietFor\(iso\)\{/);
  /* the key is that country's own warned outlines, its unit index, and whether the clipper is in */
  assert.match(s, /const k=\(rec&&rec\.h\?rec\.h:0\)\+'\|'\+u\.length\+'\|'\+\(UNIT_VER\[iso\]\|\|0\)\+'\|'\+\(PC\?1:0\);/);
  /* the fingerprint is accumulated where the index already spells the keys */
  assert.match(s, /rec\.h=\(Math\.imul\(\(rec\.h\|\|2166136261\)\^_sh\(bk\),16777619\)>>>0\);/);
  /* a replaced index is a different index even at the same length */
  assert.match(s, /const UNIT_VER=Object\.create\(null\);/);
  assert.match(s, /UNIT_VER\[iso\]=\(UNIT_VER\[iso\]\|\|0\)\+1;/);
  /* the counters are per country and summed back, or they would describe only what was rebuilt */
  assert.match(s, /n:\{ p:_qPunched-p0, d:_qDropped-d0, n:_qNoPunch-n0, c:_qCut-c0, l:_qCleared-l0 \} \}\); \}/);
  assert.match(s, /_qPunched\+=r\.n\.p; _qDropped\+=r\.n\.d; _qNoPunch\+=r\.n\.n; _qCut\+=r\.n\.c; _qCleared\+=r\.n\.l;/);
  /* and it is counted */
  assert.match(s, /memo:\{ isoHit:_qIsoHit, isoMiss:_qIsoMiss, diffHit:_diffHit, diffMiss:_diffMiss, diffSize:_diff\.size, diffEvict:_diffEvict \},/);
});

/* ── ⑤ the key of a shape is remembered on the shape ─────────────────────────────────── */
test('R344 ⑤ 同じ図形の鍵を綴り直さない', () => {
  const s = WP();
  assert.match(s, /const geomKey=\(g\)=>\{ if\(!g\) return ''; if\(g\.__bk!==undefined\) return g\.__bk;/);
  assert.match(s, /return _stash\(g,'__bk',_bboxKey\(geomBox\(g\)\)\);/);
  /* and nobody spells it the long way any more — that composition is the thing being removed */
  const long = (s.match(/_bboxKey\(geomBox\(/g) || []).length;
  assert.equal(long, 1, '`_bboxKey(geomBox(…))` survives only inside geomKey itself; found ' + long);
  /* the six call sites that used it now ask the remembered one */
  for (const re of [
    /const bk=geomKey\(g\); return !!\(bk&&rec\.boxes\[bk\]\); \}/,          /* sameOutline */
    /for\(let i=0;i<u\.length;i\+\+\)\{ const k=geomKey\(u\[i\]\); if\(k\) set\[k\]=1; \}/, /* unitBoxes */
    /const myKey=geomKey\(g\), boxes=unitBoxes\(iso\);/,                     /* warnMeeting */
    /const isNeighbourUnit=\(wg\)=>\{ const k=geomKey\(wg\); return !!\(k&&k!==myKey&&boxes\[k\]\); \};/,
    /const k=geomKey\(warns\[i\]\); if\(!k\) continue;/,                     /* subtractWarnings */
    /const ck=near\.map\(g=>geomKey\(g\)\|\|'\?'\)\.sort\(\)\.join\(';'\);/,  /* the hatch cut */
    /const bk=geomKey\(f\.geometry\); if\(!bk\) return;/,                    /* dedupeSameShape */
  ]) assert.match(s, re);
});

/* ── ⑥ the tables in front of the expensive work ─────────────────────────────────────── */
test('R344 ⑥ a full table is not emptied, and a count is one pass', () => {
  const s = WP();
  /* the polygon-difference table evicts the OLDEST quarter rather than clearing itself: there are
     more distinct (unit, warnings) pairs on this planet than the cap, and `clear()` at the cap is
     a thrash that gets worse the more of the world is drawn */
  assert.match(s, /if\(_diff\.size>=DIFF_MAX\)\{ _diffEvict\+\+; let n=DIFF_MAX>>2;\s*for\(const k of _diff\.keys\(\)\)\{ _diff\.delete\(k\); if\(--n<=0\) break; \} \}/);
  assert.ok(!/_diff\.clear\(\)/.test(s), 'nothing empties it whole any more');

  /* how many a country draws is one pass over the collection, not one pass per country */
  assert.match(s, /function drawnCounts\(\)\{ if\(_cntOf===featsVer&&_cnt\) return _cnt;/);
  assert.match(s, /const drawnCount=\(iso\)=>drawnCounts\(\)\[iso\]\|\|0;/);
  assert.match(s, /const feedCount=\(feed\)=>\{ const c=drawnCounts\(\);/);
  assert.ok(!/const drawnCount=\(iso\)=>feats\.filter\(/.test(s), 'the per-country filter is gone');

  /* twenty-seven regular expressions over the same agency wording, once per wording */
  assert.match(s, /const _hkMemo=new Map\(\);/);
  assert.match(s, /const hit=_hkMemo\.get\(t\); if\(hit!==undefined\) return hit;/);
  assert.match(s, /if\(_hkMemo\.size>=\d+\) _hkMemo\.clear\(\);\s*_hkMemo\.set\(t,k\); return k; \}/);
});

/* ── ⑦ a rebuild is not a redraw ─────────────────────────────────────────────────────── */
test('R344 ⑦ the hatch cut is uploaded when the CUT changed, not when the input did', () => {
  const s = WP();
  assert.match(s, /let hatchCutOut='';/);
  assert.match(s, /const osig=isos\.join\(','\)\+'\|'\+out\.map\(f=>_vcount\(_polysOf\(f\.geometry\)\|\|\[\]\)\)\.join\(','\);/);
  assert.match(s, /if\(osig===hatchCutOut\) return false;\s*hatchCutOut=osig;\s*return true; \}/);
  /* a fresh source holds nothing, so the next rebuild must upload whatever it computes */
  assert.match(s, /if\(!GE\(\)\.layers\.hasSource\(HCUT_SRC\)\)\{ hatchCutOut='';/);
  /* and how often it really was drawn is a reading */
  assert.match(s, /let hatchCutDrew=0;[\s\S]{0,140}?function applyHatchCut\(\)\{ hatchCutDrew\+\+;/);
  assert.match(s, /more:hatchCutLeftOver, drew:hatchCutDrew,/);
});

/* ── ⑧ nothing in this round changed what the layer SAYS ─────────────────────────────── */
test('R344 ⑧ the standing shape of the layer is untouched', () => {
  const s = WP();
  /* #R298: one grey, one fill layer, one opacity slider */
  assert.ok(!/addSource\('wp-alert-quiet/.test(s) && !/hasSource\('wp-alert-quiet/.test(s),
    'there is still no second quiet source — the name survives only in the notes that record its removal');
  assert.match(s, /const ALL_LYR=\(\)=>LYR\.concat\(\[CHORO,HATCH,HCUT\]\);/, '#R288: one list, one call');
  /* #R305/#R307: the difference still answers all three cases, before the covering test */
  assert.match(s, /const d=subtractWarnings\(iso,g,near\);/);
  assert.match(s, /if\(m\.covering\)\{ _qDropped\+\+; return null; \}/);
  /* #R298 追記: one feature per (country, shape), worst rank surviving */
  assert.match(s, /function dedupeSameShape\(list\)\{/);
  /* #R297: the wording is computed once per (wording, feed, rank, language) */
  assert.match(s, /let _hzMemo=Object\.create\(null\), _hzLang='';/);
});
}

/* ══════════ from tests/r383-checks.test.mjs — 2 of its 6 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R383) the round's header note is kept with its largest block, in tests/layer-warnings-sources-checks.test.mjs */
const read = (p) => readLF(join(ROOT, p));
const WP = () => read('js/world-packs.js');

/* ── ② the NWS's zone-filed alerts are drawn ─────────────────────────────────────────── */
test('R383 ② the UGC zone codes are resolved against the NWS’s own reference layers', () => {
  const s = WP();
  const code = codeOnly(s);

  assert.match(code, /const NWS_REF='https:\/\/mapservices\.weather\.noaa\.gov\/static\/rest\/services\/nws_reference_maps\/nws_reference_map\/MapServer\/';/,
    'the index is NOAA’s own published reference service');
  /* the four rungs, in the order a leftover walks down them */
  assert.match(code, /nwsQuery\(9,_sIn\('state_zone',fire\.map\(nwsSZ\)\),'state_zone,name'\)/, 'fire weather zones');
  assert.match(code, /nwsQuery\(8,_sIn\('state_zone',zone\.map\(nwsSZ\)\),'state_zone,name'\)/, 'public forecast zones');
  assert.match(code, /nwsQuery\(5,_sIn\('id',zone\),'id,name'\)/, 'coastal marine zones');
  assert.match(code, /nwsQuery\(6,_sIn\('id',zone\),'id,name'\)/, 'offshore zones');
  assert.match(code, /nwsQuery\(2,where,'state,fips,countyname'\)/, 'county zones, by state + FIPS suffix');
  /* the fire layer is asked TWICE: first for the codes the bulletin declared as fire, and LAST for
     a plain zone code no other register holds (a bulletin with no `affectedZones` names its zones
     only as bare UGC, and that namespace does not say which register they are in) */
  assert.equal((code.match(/nwsQuery\(9,/g) || []).length, 2,
    'the fire-weather register is the declared rung AND the last rung');

  /* ⚠ THE KIND IS PART OF THE KEY — a fire zone and a public zone share the UGC namespace */
  assert.match(code, /const k=\(ugc\.charAt\(2\)==='C'\?'c':\(kind==='fire'\?'f':'z'\)\)\+':'\+ugc;/,
    'the lookup key carries which register layer answers for the code');

  /* the generalisation is stated rather than silent, and finer than this map’s own ADM1 index */
  const off = /const NWS_OFF=([0-9.]+);/.exec(code);
  assert.ok(off && Number(off[1]) > 0 && Number(off[1]) <= 0.005,
    'the server-side generalisation is declared and no coarser than ~550 m');

  /* the answers are kept, like every other boundary set in this file */
  assert.match(code, /const NWS_GEO_CACHE='intmap-page-nwszone-v1';/);
  assert.match(code, /await c\.put\('nwszone\/all',new Response\(JSON\.stringify\(\{at:Date\.now\(\),by:by\}\),/);
  assert.match(code, /await nwsGeoLoad\(\);/, 'the stored index is read before the feed is');

  /* one feature per ZONE, and the counting rule #R302 wrote survives */
  assert.match(code, /const ft=unitFeature\('USA','nws',rec\.g,'zone',rec\.n\|\|g\.ugc,g\.rows,g\.at\);/);
  assert.match(code, /PLACED\.USA=\[own\+placed,own\+placed\+noGeom\]; UNPL\.USA=noGeom\?worstNG:0;/,
    'a zone the register cannot answer for is still a shortfall and still says so');

  /* the UGC list may not re-claim ground `affectedZones` already named under another kind */
  assert.match(code, /if\(!ugcSeen\[String\(u\|\|''\)\.toUpperCase\(\)\]\) add\('',u\); \}\);/);

  /* a cold index sprints: the batches chain, and only a FAILED sweep waits (#R284's shape) */
  assert.match(code, /if\(rest\.length\) return run\(rest\); \}\);/);
  assert.match(code, /if\(Date\.now\(\)-nwsGeoFailAt<NWS_RETRY_MS\) return;/);

  /* the instrument, so 「drawn」 is a reading rather than a belief (#R344) */
  assert.match(code, /nwsZones:\{ want:nwsZoneWant, known:nwsZoneKnown,/);

  /* ⚠ A CHECK THAT CANNOT GO RED IS NOT A CHECK (#R347). The escaping in the WHERE clause is the
     one thing here a caller could get wrong invisibly, so it is EXECUTED. */
  const sq = new Function('return ' + /const _sq=\([^;]+;/.exec(code)[0].replace(/^const _sq=/, '').replace(/;$/, ''))();
  assert.equal(sq("AR074'); DROP--"), "'AR074DROP'", 'anything that is not alphanumeric is removed before it reaches the query');
  assert.equal(sq('AR074'), "'AR074'");
});

/* ── ⑥ no silent caps, and the reader is told what was read and not painted ──────────── */
test('R383 ⑥ the denominator is what the agency published, and the filtering is printed', () => {
  const code = codeOnly(WP());

  /* the three places a relay-capped list is counted — MeteoAlarm, the WMO register, the CAP feeds */
  assert.equal((code.match(/PLACED\[iso\]=\[placed,Math\.max\(\+d\.areaTotal\|\|0,\(d\.areas\|\|\[\]\)\.length\)\];/g) || []).length, 2,
    'MeteoAlarm and the WMO register both count what the service published');
  assert.match(code, /PLACED\[cfg\.iso\]=\[out\.length,Math\.max\(\+\(\(j&&j\.areaTotal\)\|\|0\),areas\.length\)\];/,
    'and so do the CAP services');
  assert.equal((code.match(/PLACED\[[a-z.]*iso[^\]]*\]=\[[a-z.]+,\(d\.areas\|\|\[\]\)\.length\]/g) || []).length, 0,
    'no country counts the truncated list as the whole of it');

  /* …and a PAGE is not a FEED either: two loaders read a bounded slice of an unbounded list */
  assert.match(code, /PLACED\.CAN=\[out\.length,Math\.max\(out\.length,caMatched-caEnded,\(j\.features\|\|\[\]\)\.length-caEnded\)\];/,
    'Canada counts what the collection says it matched, not what one page carried');
  assert.match(code, /PLACED\.CHN=\[items\.length-lost,Math\.max\(items\.length,cnTotal\)\];/,
    'and China counts the CMA’s own total, not the two pages this map read');

  /* the reader is told, per country, in words */
  assert.match(code, /function notInForceCounts\(iso3,feed\)\{/);
  assert.match(code, /h\+=notInForceLine\(iso3,feed\);/, 'the country legend prints it');
  assert.match(code, /notInForce:\(function\(\)\{ let ex=0,up=0;/, 'and the diagnostics count it');
});
}
