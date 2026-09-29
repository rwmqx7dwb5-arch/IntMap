/* ============================================================================
 *  IntMap · the weather-warnings layer — hatch, quiet grey, units, and what it costs
 * ----------------------------------------------------------------------------
 *  js/world-packs.js の警報レイヤー（alerts pack）。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUnreadIsTheHatch } from './wash-tier.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { readLF } from '../scripts/eol.mjs';

/* ════════ #R288 — from tests/r288-checks.test.mjs (5 of its 13 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R288 source checks
 * ----------------------------------------------------------------------------
 *  「気象警報はまだ対応していない、もしくはデータがまだ入っていないところは灰色斜線で、
 *    発令されていないだけの地域は灰色に。個々の区別はちゃんとやれ。」
 *  「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。…あと、警報の塗漏れが多すぎる。
 *    また、対応国も増やせ。更新が遅すぎる。リアルタイムにと言っている。対応地域まで斜線で塗るのを辞めろ。」
 *  「ECMWF系レイヤーを開くと勝手にECMWFの時間ポップアップが出るのを辞めろ。わざわざ分けるな。」
 *  「Wind(animated)は…点滅してしまうバグが発生する。未来に変えたとき、風データを取得できませんでした
 *    となる。あと、重すぎるから、品質は一切落とさずに爆速にしろ。」
 *  「気温 2m（ECMWF）レイヤーも色を添付画像と同じ色＋グラデーションに。また、名前は単に気温に。
 *    気温（2m・再解析）レイヤーも統合し、一つのレイヤー、同じ色分け、グラフィックに。
 *    ソースだけ切り替えられる仕様に。」
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH (the sixteenth time this has mattered): this round's
 *  own comments quote the very strings it removed — `data-legend-ec-time`, `return -1`,
 *  `setVis(LYR` — so a check that read the raw file would fail on the sentence explaining the fix.
 *  ⚠ EVERY DELETION CHECK ALSO COUNTS WHAT MUST SURVIVE, so a fix that went too far is red too.
 *  ⚠ Nothing here matches a bare "\n": the working copy is CRLF on Windows and LF on CI (#R283).
 * ==========================================================================*/
/* (#R308 追記2) 5本が同じ1行を逐語で固定していたので、規則ごとに1つの読み手へ — tests/wash-tier.mjs */


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
/* (#R293) js/wx-reanalysis.js is gone — see ⑩ and ⑪ */
const DL = () => codeOnly(read('js/data-layers.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));

/* (tests-by-topic) #R288 の読み取りの節（#R664 の注記つき）は tests/weather-ecmwf-reads-checks.test.mjs にある。 */


/* ── ① 未対応 もしくは データがまだ入っていない → 灰色斜線 ──────────────────────────────────────
   #R284 answered 「対応国まで斜線で塗るのを辞めろ」 by drawing NOTHING for a wired-but-unread
   country (`washTier` = −1). The reader has now said which of the two silences they meant, in the
   same sentence as the rule, so both of them are the hatch again — and the three claims that DO
   exist have to survive the change.                                                              */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('#R288 ① the hatch covers both silences, and the other three states survive', () => {
  const src = WP();
  const i = src.indexOf('function washTier(');
  assert.ok(i > 0, 'washTier must exist');
  const body = src.slice(i, src.indexOf('function paintCountries(', i));
  assert.match(body, /if\(!supported\(c\)\)\s*return\s*0;/, 'no feed at all → hatched');
  /* ⚠ (#R308 追記2) …asked of the RULE rather than of the line — see tests/wash-tier.mjs */
  assertUnreadIsTheHatch(src);
  /* …and the claims that are NOT the hatch are still made */
  assert.match(body, /if\(u&&!drawnISO\[c\]\)\s*return\s*10\+Math\.min\(4,u\);/, 'the unplaced-rank wash survives');
  /* (#R290) …and «this map holds its units» became «the unit layer is drawing it right now», because
     the quiet collection is bounded by the view and by the zoom — a country whose units are cached
     but off-screen has to keep the country-wide sheet or nothing would paint it. */
  assert.match(body, /return\s*\(?[^;]*quietSet\[c\][^;]*\?\s*2\s*:\s*1;/, '「read and quiet」 is still its own tier');
  /* the paint expressions still read the tier the way those states assume */
  /* ⚠ (#R293) the condition moved into `hatchOp(v)` — see tests/weather-warnings-checks.test.mjs #R293 ⑯ for what was writing over it */
  assert.match(src, /const hatchOp=\(v\)=>\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    'the hatch paints on tier 0 only');
  assert.match(src, /const choroOp=\(v\)=>\['case',\['>',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    'the wash paints on a positive tier only');   /* (#R293) …in a builder — see tests/weather-warnings-checks.test.mjs #R293 ⑯ */
  /* ══ ⚠⚠⚠ (#R290) AND THE HATCH TILE MUST NOT BE A GREY SHEET WITH LINES ON IT ════════════════
     「灰色塗と灰色斜線が両方ある地域があるが、どうなっとんねんごら。」 The tile opened with a
     `fillRect` in rgba(158,162,170,0.26) and stroked the diagonals over it, so 「未対応 / 未取得」
     was drawn as grey fill PLUS lines while 「発令なし」 is grey fill alone — every hatched country
     wearing the quiet country's appearance underneath its own. The two claims have to be visually
     exclusive, so the tile is lines on transparent and nothing else. */
  /* ⚠ (#R293) the tile is BUILT in `hatchCanvas()` now, because the legend swatch is a picture of
     the same tile (「斜線塗がなんなのか分かるように、凡例に追加しろ」) and two hand-written patterns
     that have to agree is the #R270 defect waiting to happen. The property is unchanged and is
     asserted where the drawing now lives. */
  const h = src.indexOf('function hatchCanvas(');
  const hb = src.slice(h, src.indexOf('const HAZ', h) > h ? src.indexOf('const HAZ', h) : h + 1200);
  assert.ok(!/fillRect\(0,0,S,S\)/.test(hb), 'the hatch tile paints no backing sheet');
  assert.match(hb, /g\.clearRect\(0,0,S,S\);/, '…it starts transparent');
  assert.match(hb, /g\.strokeStyle=/, '…and the diagonals are the whole signal');
});

/* ── ② 「発令なし」 is decided at the administrative unit ────────────────────────────────────── */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('#R288 ② the quiet grey is a unit layer, under the warnings, in the same grey', () => {
  const src = WP();
  /* ⚠ (#R298) THIS CHECK USED TO NAME THE STRUCTURE, AND THE STRUCTURE WAS THE DEFECT.
     It required a SECOND source and a SECOND pair of layers for the quiet grey — which is exactly
     what made Japan's 「発表なし」 a different colour, at a different opacity, in a different layer
     from everyone else's, and what put a grey sheet UNDER every warned unit. The invariant this
     test exists for is 「発表なし is drawn per unit, in one grey, and never under the answer」, and
     that is the question it asks now. */
  assert.ok(!/wp-alert-quiet/.test(src),
    'there is no second quiet source or layer — one collection, one fill, one grey');
  /* ⚠ (#R293) the VALUE moved (「灰色塗の色味は少しだけ白に近づけろ」) and the PROPERTY did not: one
     declaration, and the country-wide sheet paints from that same constant rather than a copy of
     its literal — which is now enforced by construction instead of by two matching regexes. */
  assert.match(src, /const QUIET_COL='rgba\(\d+,\d+,\d+,0\.42\)';/,
    'the unit grey is declared once — a second shade would be a second meaning');
  assert.match(src, /\n\s+1,QUIET_COL,/, '…and the country-wide sheet paints from that declaration');
  /* the unit grey is produced in ONE place, and that place is not country-specific */
  assert.match(src, /function quietFeature\(iso,feed,geometry,unit,name\)\{/);
  assert.match(src, /colA:NONE_COL, colN:NONE_COL/, 'one grey for every country');
  assert.ok(!/quietFeature\('JPN'/.test(src),
    'no country gets a quiet path of its own — that was why Japan looked different');
  /* it rides in the SAME collection as the warnings, ahead of them (array order is draw order) */
  assert.match(src, /quietFeatures\(\)\.concat\(feats\)/,
    'quiet first, warnings after — one source, one fill layer');
  /* and a unit a warning is drawn on does not ALSO get a grey underneath it
     ⚠ (#R305) …and a unit a warning is drawn INSIDE gets its grey with that warning cut out of it,
     rather than losing all of it. Either way the two never share a pixel, which is what this line
     is for; `quietGeomFor` is where the three answers are decided. */
  /* ⚠ (#R344) the emitter is per country now (`quietFor`), so the skip is a `continue` rather than
     a `return` out of a forEach. The claim is the same one: a unit a warning is drawn on gets no
     grey of its own, and the two never share a pixel. */
  assert.match(src, /const qg=quietGeomFor\(iso,g\);\s+if\(!qg\) continue;/);
  assert.match(src, /function quietGeomFor\(iso,g\)\{/);
  assert.match(src, /function punchQuiet\(g,warns\)\{/, 'and the cut is a hole in the unit, not an overlap');
  /* the division is still half the answer: the outline tells norm-0 units apart from each other */
  assert.match(src, /'line-color':\['case',\['>',\['get','norm'\],0\],\['get',colField\(\)\],'rgba\(/);
  /* a country the unit layer is drawing must not ALSO get the country-wide sheet */
  assert.match(src, /return\s*\(?[^;]*quietSet\[c\][^;]*\?\s*2\s*:\s*1;/);
  /* the unit sets are the ones the placement ladder already builds */
  const u = src.indexOf('function askUnits(');
  const ub = src.slice(u, src.indexOf('function askUnitsWorld(', u));
  ['jpMuniGeo()', 'cnGeo()', 'twTownGeo()', 'nutsGeo()', 'adm1Geo()'].forEach(fn =>
    assert.ok(ub.includes(fn), 'askUnits must read ' + fn));
  assert.match(src, /const GB_MAX=2;/, 'geoBoundaries is asked for at most two countries at a time');
  assert.match(src, /function askUnitsInView\(/, 'and only for countries the reader can see');
  /* ══ ⚠⚠ (#R290) …AND THERE IS A WORLD INDEX BEFORE THAT LAST RESORT ═══════════════════════
     MEASURED on production before this round: 95 countries were still one sheet of country-wide
     grey and only 50 were drawn at the unit, because everything outside the five closer indexes
     fell to geoBoundaries one country at a time. `data/admin1-world.json.gz` is 4,515 units across
     247 countries in 2.38 MB, fetched once. */
  assert.match(src, /const ADM1_URL='data\/admin1-world\.json\.gz';/, 'the world index is a shipped file');
  assert.match(src, /function askUnitsWorld\(iso\)\{/, 'and askUnits falls to it before geoBoundaries');
  assert.match(src, /DecompressionStream\('gzip'\)/, 'it is read the way the gazetteer is read');
  assert.ok(existsSync(resolve(ROOT, 'data/admin1-world.json.gz')), 'and the file is in the repository');
});

/* ── ③ 対応国も増やせ — learned from the geometry, not written down ─────────────────────────── */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('#R288 ③ coverage is learned from a drawn polygon, adds only, and is not persisted', () => {
  const src = WP();
  const i = src.indexOf('function learnCoverage(');
  assert.ok(i > 0, 'learnCoverage must exist');
  const body = src.slice(i, src.indexOf('function centroidOf(', i));
  assert.match(body, /centroidOf\(f\.geometry\)/, 'the CENTROID, not any vertex');
  /* ⚠ (#R297) the same question, asked only of the countries whose answer would be USED. The
     unqualified walk cost 5,562 ms of point-in-polygon per 50 s (it walks every ring of every
     hi-res country outline); the predicate IS the old three-way test, moved into the search. */
  assert.match(body, /countryAtWhere\(c\[0\],c\[1\],\(iso\)=>iso!==q\.iso&&!FEEDS\[iso\]&&!LEARNED\[iso\]\)/,
    'a country with its own feed is never re-assigned — 「ソースは一国一ソース」');
  assert.match(src, /function countryAtWhere\(lng,lat,pred\)\{/, 'and that search has a name of its own');
  assert.match(src, /const supported=\(c\)=>!!\(FEEDS\[c\]\|\|LEARNED\[c\]\);/);
  assert.match(src, /learnCoverage\(feats\);/, 'publish() is where the evidence is read');
  /* the hand-written list #R284 measured is still there — this ADDS to it, it does not replace it */
  assert.match(src, /const ALSO=\{ nws:\['PRI','VIR','GUM','MNP','ASM','PLW','FSM','MHL'\] \};/);
});

/* ── ④ 更新が遅すぎる — the rotation reads what the reader is looking at first ───────────────── */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('#R288 ④ the rotation is view-first, and the shape library retries sooner while short', () => {
  const src = WP();
  assert.match(src, /function viewFirst\(list\)\{/);
  assert.match(src, /const byAge=viewFirst\(fresh\.sort/, 'MeteoAlarm rotates view-first');
  assert.match(src, /const byAge=viewFirst\(hot\.filter\(k=>swicData\[k\]\)/, 'the WMO register too');
  assert.match(src, /const SWIC_GEO_SHORT_MS=180000;/);
  assert.match(src, /const wait=short\?SWIC_GEO_SHORT_MS:SWIC_GEO_RETRY_MS;/);
  /* …and the floor the transport imposes is still respected (#R284) */
  /* ⚠ (#R297) pin the RELATION, not the numbers. The floor exists because asking a country again
     inside the relay's own edge cache returns THE SAME BYTES — so the invariant is 「the floor is at
     or under the cache」, and #R297 shortened both together for 「更新が遅すぎる」. */
  const floor = +(/const MIN_AGE_MS=(\d+);/.exec(src) || [])[1];
  const smax = +(/s-maxage=(\d+)/.exec(read('supabase/functions/alerts-relay/index.ts')) || [])[1] * 1000;
  assert.ok(floor > 0 && floor <= smax,
    `the relay's own edge cache is still the floor (${floor} ms against ${smax} ms)`);
  assert.match(src, /const COLD_CALLS=\d+;/, 'the cold burst survives');
});

/* ── ⑤ one call decides whether the layer is showing ────────────────────────────────────────── */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('#R288 ⑤ alert visibility is one list, one call, re-asserted', () => {
  const src = WP();
  /* ⚠ (#R308) THE INVARIANT IS 「one list」, NOT 「this list」. This pinned the members verbatim, so
     the round that added a second hatch surface (the cut one) turned it red for doing exactly what
     this test exists to require — putting the new layer in the ONE list. Asked as a relation: every
     country-scale layer this module owns is in it, and nothing sets a partial list. */
  const all = /const ALL_LYR=\(\)=>LYR\.concat\(\[([^\]]*)\]\);/.exec(src);
  assert.ok(all, 'ALL_LYR is LYR plus the country-scale layers');
  ['CHORO', 'HATCH'].forEach((h) => assert.ok(all[1].split(',').includes(h), h + ' is in the one list'));
  (src.match(/const HCUT\s*=\s*'[^']+'/) ? ['HCUT'] : []).forEach(
    (h) => assert.ok(all[1].split(',').includes(h), h + ' is in the one list'));
  assert.match(src, /function applyAlertVis\(\)\{ setVis\(ALL_LYR\(\),on\); \}/);
  assert.match(src, /GE\(\)\.events\.on\('idle',\(\)=>\{ if\(on\) applyAlertVis\(\); \}\)/, 're-asserted when the map settles');
  assert.match(src, /function tick\(\)\{ if\(on\) applyAlertVis\(\);/, '…and when it does not');
  const a = src.indexOf('(function alerts()');
  const b = src.indexOf('window.__wpAlerts=', a);
  assert.ok(a > 0 && b > a);
  assert.ok(!/setVis\(LYR,/.test(src.slice(a, b)), 'no partial list is set anywhere in the alerts module');
});
}

/* ════════ #R290 — from tests/r290-checks.test.mjs (7 of its 16 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R290 source checks — the two silences, the weight, and the clocks
 * ----------------------------------------------------------------------------
 *  Fifteen instructions arrived in one message. The ones with a shape a source-level check can
 *  hold are here; the rest were measured in a real browser while the round was being written and
 *  the numbers are recorded in DEV-NOTES.md.
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs — line endings belong to the CHECKOUT, not to the
 *  file (#R283). A check that spelt a line break literally would be red on one platform and green
 *  on the other, for a reason that is not its subject.
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY «X IS GONE» SEARCH. This round's own notes quote the exact
 *  shapes it removed — `openClock`, `unitsOf(c)?2:1`, `fillRect(0,0,S,S)`, `C.on(_followClock)` —
 *  so a check reading the raw file would fail on the sentence explaining the fix. That mistake has
 *  been made sixteen times in this project ([[intmap-recurring-lessons]]).
 * ==========================================================================*/
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(resolve(ROOT, p));
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));

/* ── ① 「灰色塗と灰色斜線が両方ある地域がある」 — THE TWO APPEARANCES WERE BOTH BEING DRAWN ────
   The hatch tile opened with a `fillRect` in rgba(158,162,170,0.26) and stroked its diagonals over
   that, so 「未対応 / データがまだ入っていない」 rendered as grey fill PLUS lines while 「発令なし」
   renders as grey fill alone. Every hatched country was wearing the quiet country's appearance
   underneath its own — which is the state the reader described, and exactly the confusion
   「ここの区別はちゃんとやれ。混同するな。」 forbids. The two claims have to be visually exclusive. */
/* ⚠ (tests-by-topic) 'R290 ① the hatch is lines on transparent, and grey means one thing' is FOLDED
   into 'R293 ② …' below: the tile half («no backing sheet, starts transparent, the diagonals carry the
   whole signal») is now asserted there on the tile hatchCanvas() actually draws, and the grey half is
   'R293 ①' (QUIET_COL declared once, its literal once) and '#R288 ②' (the country-wide sheet paints
   `1,QUIET_COL,`). Nothing #R290 ① asserted is left unasserted. */

/* ── ② 「日本以外でも区分単位、発令単位ごとに色分けしろ」 — ONE WORLD INDEX, SHIPPED ────────────
   MEASURED on production before this round: 95 countries were a single sheet of country-wide grey
   and only 50 were drawn at the unit. Nothing on the open web serves a world ADM1 set a browser
   can afford (Natural Earth 50 m: 9 countries; Natural Earth 10 m: 40.7 MB; geoBoundaries CGAZ:
   360 MB; gbOpen: one 0.3–2 MB download PER COUNTRY, which is also the 「重すぎる」 half of the
   same report). So it is simplified once at build time and shipped. */
test('R290 ② the world administrative index is a shipped, decodable file', () => {
  const p = resolve(ROOT, 'data/admin1-world.json.gz');
  assert.ok(existsSync(p), 'data/admin1-world.json.gz is in the repository');
  const bytes = statSync(p).size;
  assert.ok(bytes > 1e6 && bytes < 6e6, `it is a few megabytes, not tens (measured ${bytes})`);
  const j = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
  assert.ok(Array.isArray(j.f) && j.f.length >= 4000, `at least 4,000 units (${(j.f || []).length})`);
  const isos = new Set(j.f.map((f) => f.i));
  assert.ok(isos.size >= 200, `covering at least 200 countries (${isos.size})`);
  for (const need of ['SVK', 'ESP', 'IND', 'MEX', 'TUR', 'KAZ', 'NGA', 'ARG', 'THA', 'VNM'])
    assert.ok(isos.has(need), `${need} — one of the countries the 50 m set does not have`);
  /* every unit carries a geometry AND the names a met service might use for it */
  for (const f of j.f.slice(0, 200)) {
    assert.ok(f.g && (f.g.type === 'Polygon' || f.g.type === 'MultiPolygon'), 'a unit is a polygon');
    assert.ok(typeof f.n === 'string' && f.n.length, 'and it carries at least one name');
  }
  assert.ok(existsSync(resolve(ROOT, 'scripts/build-admin1.mjs')), 'and the builder is in the repository');
  /* it is declared where every other bundled dataset is declared */
  assert.match(read('js/reference-data.js'), /admin1-world\.json\.gz/, 'the source list names it');
});

/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R290 ③ the index is the LAST naming rung, and the unit ladder falls to it', () => {
  const src = WP();
  assert.match(src, /const ADM1_URL='data\/admin1-world\.json\.gz';/);
  assert.match(src, /DecompressionStream\('gzip'\)/, 'read the way data/gazetteer-world.json.gz is read');
  /* the placement ladder: its own polygon, the service's own shapes, NUTS, geoBoundaries, THEN this */
  const sh = src.match(/const shapeOfRaw=\(a\)=>\{[\s\S]*?wholeCountryShape\(iso,a\.name\); \};/);
  assert.ok(sh, 'the MeteoAlarm ladder must exist');
  const order = ['a.poly', 'lib', 'idx', 'gb', 'wa', 'wholeCountryShape'];
  let at = -1;
  for (const step of order) {
    const k = sh[0].indexOf(step);
    assert.ok(k > at, `${step} comes after ${order[order.indexOf(step) - 1] || 'the start'}`);
    at = k;
  }
  /* the QUIET-unit ladder ends there too, before the per-country geoBoundaries download */
  const u = src.indexOf('function askUnits(');
  const ub = src.slice(u, src.indexOf('function askUnitsGB(', u));
  assert.ok(ub.indexOf('askUnitsWorld(iso)') > 0, 'askUnits falls to the world index…');
  assert.ok(ub.indexOf('askUnitsWorld(iso)') < ub.length, '…before the last resort');
  assert.match(src, /function askUnitsWorld\(iso\)\{[\s\S]{0,400}?askUnitsGB\(iso\)/,
    'and geoBoundaries is only reached when the world index has nothing for that country');
  /* ⚠ a dozen countries reach the loader inside one tick; every one of them must be answered, or
     they sit marked 「asked」 with no units and nothing to re-ask them */
  assert.match(src, /const worldWaiting=\[\];/);
  assert.match(src, /worldWaiting\.splice\(0\)\.forEach\(f=>\{ try\{ f\(w\); \}catch\(_\)\{\} \}\);/,
    'the queue is drained with the frame…');
  assert.match(src, /worldWaiting\.splice\(0\)\.forEach\(f=>\{ try\{ f\(null\); \}catch\(_\)\{\} \}\);/,
    '…and with null when the file does not come, so each falls to its own last resort');
});

/* ── ④ 「警報の塗漏れが多すぎる」 — TWO RUNGS, BOTH MEASURED ────────────────────────────────────
   MEASURED against the live feeds: Slovakia 0 of 48. SHMÚ warns by okres, geoBoundaries holds all
   79 of them, and its `shapeName` field has every non-ASCII letter mangled — 「District of Trebi ov」
   for Trebišov, 「District of Ronnava」 for Rožňava, 「District of Piertany」 for Piešťany. Two things
   were missing: the English generic prefix, and any tolerance for a name spelt wrong.
   0 → 25 (the prefix list) → 39 of 48 (the edit distance). Moldova 28 → 32; Greece 0 → 3. */
test('R290 ④ a generic prefix is not part of a name, and a damaged name still resolves', () => {
  const src = WP();
  const lead = /const _LEAD=(\/\^\([\s\S]*?\)\\s\+\/i);/.exec(src);
  assert.ok(lead, '_LEAD must be one regular expression');
  const re = new Function(`return ${lead[1]};`)();
  for (const s of ['District of Bardejov', 'Region of Košice', 'Province of X', 'Governorate of Y',
    'State of Z', 'County of W', 'Prefecture of V', 'Municipality of U', 'Republic of T'])
    assert.ok(re.test(s), `${s} — the leading administrative word must be strippable`);
  assert.ok(!re.test('District'), 'a bare word that IS the name is not a prefix');
  /* the edit-distance rung answers only when exactly one key is within the bound.
     ⚠ (tests-by-topic) EVALUATED: this read the source for `const cap=(k.length>=9)?2:1;`,
     `q.charCodeAt(0)!==k.charCodeAt(0)` and `if(n===1) return hit;`. The shipped `lookupUnit` — with
     the `_norm`, `_keysOf` and `_lev` it closes over, lifted as one region — is now asked the three
     questions those spellings stood for, on the names that were measured broken. */
  const from = src.indexOf('const _norm=');
  const to = src.indexOf('const _LEAD=', from);
  assert.ok(from > 0 && to > from, 'the unit-name matcher is one region of js/world-packs.js');
  const U = new Function(src.slice(from, to) + '\nreturn { lookupUnit, _lev, _norm };')();
  const at = (names) => Object.fromEntries(names.map((n) => [U._norm(n), { name: n }]));
  const idx = at(['Trebišov', 'Rožňava', 'Michalovce', 'Bardejov']);
  /* geoBoundaries' mangled 「Trebi ov」 lost the š: one deletion from the index key */
  assert.equal((U.lookupUnit(idx, 'Trebiov') || {}).name, 'Trebišov', 'a damaged name within the bound resolves');
  /* the first letter must agree — the same one-letter distance with a different initial is refused */
  assert.equal(U.lookupUnit(idx, 'Xrebišov'), null, 'the first letter must agree');
  /* the bound scales with the name’s length: two edits are allowed from nine letters on, and not below */
  assert.equal((U.lookupUnit(idx, 'Mihcalovce') || {}).name, 'Michalovce', 'two edits in a ten-letter name resolve');
  assert.equal(U.lookupUnit(idx, 'Bxrdejxv'), null, 'two edits in an eight-letter name do not');
  /* and it answers ONLY when the candidate is unique */
  const twins = at(['Dolnikovo', 'Dolnikova']);
  assert.equal(U.lookupUnit(twins, 'Dolnikovx'), null, 'two keys within the bound is no answer at all');
  assert.equal((U.lookupUnit(at(['Dolnikovo']), 'Dolnikovx') || {}).name, 'Dolnikovo', '…while one is');
  /* the distance itself is a real bounded Levenshtein, not a prefix test wearing its name */
  const lev = U._lev;
  assert.equal(lev('trebisov', 'trebiov', 2), 1, 'one deletion');
  assert.equal(lev('roznava', 'ronnava', 2), 1, 'one substitution');
  assert.equal(lev('michalovce', 'poprad', 2), 3, 'and it gives up past the bound');
  assert.equal(lev('abc', 'abc', 1), 0);
});

/* ── ⑤ 「警報レイヤーが重すぎる。品質保ったまま爆速にしろ。」 ──────────────────────────────────
   MEASURED on production, 75 s with the layer on: 190 whole-collection uploads (64 of the warning
   source, up to 10.3 MB each; 126 of the quiet source, up to 18.5 MB each), 25,713 setFeatureState
   calls, a longest main-thread task of 8,245 ms and a median frame of 166.7 ms.
   Nothing is sampled or simplified away — four things stopped being done more than once. */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R290 ⑤ the publish path does each piece of work once', () => {
  const src = WP();
  /* ① the publish is coalesced, and the immediate one is still reachable for the toggle */
  /* ⚠ (#R297) the window is a NAMED constant now and it is longer, because 160 ms merges only two
     batches that land in the same frame — and #R297 found the uploads were not coming through this
     path at all (see ⑬ in tests/r297). The property #R290 pinned is unchanged: the publish is
     coalesced, trailing, and the immediate one stays reachable for the toggle. */
  assert.match(src, /const PUBLISH_MS=\d+;/);
  assert.match(src, /function publish\(\)\{ if\(pubT\) return;[\s\S]{0,200}?publishNow\(\); \},wait\); \}/);
  assert.match(src, /function publishNow\(\)\{/, 'the real work has a name of its own');
  /* ② a collection identical to the one on the map is not uploaded again */
  assert.match(src, /function featSig\(list\)\{/, 'the warning collection has a content signature');
  /* ⚠ (#R344) the guard is unchanged; what it guards is now ONE function, because three callers
     (the publish, the relabel and the style-swap recovery) all had to keep the signature in step by
     hand and only one of them can also carry the {add,remove} diff. `uploadShown` sets `featsSig`. */
  assert.match(src, /if\(sig!==featsSig\) uploadShown\(shown,sig\);/);
  assert.match(src, /function uploadShown\(shown,sig\)\{[\s\S]{0,40}?featsSig=sig;/);
  assert.match(src, /GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:shown\},\{diff:diff\}\);/);
  assert.match(src, /GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:shown\},\{diffable:ok\}\);/);
  /* ⚠ (#R298) the quiet units are IN that collection now, so its signature covers them too —
     there is no second signature to keep in step, which is one fewer thing that can disagree. */
  assert.match(src, /const shown=quietFeatures\(\)\.concat\(feats\);/);
  assert.match(src, /const sig=featSig\(shown\);/);
  /* ⚠ …and a fresh source resets both signatures, or a style reload would leave an empty map */
  assert.match(src, /if\(!GE\(\)\.layers\.hasSource\(SRC\)\)\{ featsSig=''; pubIds=null;/);
  assert.ok(!/quietSig/.test(src), 'and there is no second signature left to reset');
  /* ③ a feature state is written only where the tier changed */
  assert.match(src, /const t=washTier\(c\); if\(tierWritten\[c\]===t\) return; tierWritten\[c\]=t;/);
  assert.match(src, /if\(force\)\{ tierWritten=Object\.create\(null\); _cFeat=Object\.create\(null\); \}/,
    'and a countries-source swap forces a full write (setSourceData clears feature state)');
  /* ④ a unit is asked which country contains it once, not once per publish */
  assert.match(src, /const _learnSeen=Object\.create\(null\);/);
  assert.match(src, /if\(_learnSeen\[id\]\) return;/);
  /* ⑤ the placement ladder is walked once per (country, area name) */
  assert.match(src, /const _shapeMemo=Object\.create\(null\);/);
  assert.match(src, /if\(k in memo\.m\) return memo\.m\[k\];/);
  assert.match(src, /if\(!memo\|\|memo\.k!==mkey\)/, 'and a new index invalidates that country’s memo');
});

/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R290 ⑥ the quiet units are bounded by the view and by the zoom, and the sheet agrees', () => {
  const src = WP();
  assert.match(src, /const QUIET_UNIT_Z=3;/);
  /* ⚠⚠ (#R305) THE FLOOR IS ABOUT DISTINCTIONS, NOT ABOUT WHETHER THE GROUND IS PAINTED. What
     #R290 measured — a Landkreis is a fraction of a pixel at world zoom, so 500 unit sheets and one
     country sheet are the same picture for seven times the bytes — is true of a country with
     NOTHING in force, which keeps the country sheet. It is not true of a country that is DRAWING,
     because `washTier` takes the country sheet away from that one (#R270 ⑧ / #R299 ②) and then
     nobody painted its quiet ground: measured at z2, 20.5 % of every land sample was painted by
     nothing. So the floor now has one exception, and it is exactly that country. */
  assert.match(src, /if\(!\(z>=QUIET_UNIT_Z\|\|warned\[iso\]\)\) return;/,
    'below that zoom no unit of a QUIET country is published…');
  assert.match(src, /if\(lowZ&&!warned\[c\]\) return;/,
    '…and none is even asked for');
  assert.match(src, /if\(bb\[2\]<vb\[0\]\|\|bb\[0\]>vb\[2\]\|\|bb\[3\]<vb\[1\]\|\|bb\[1\]>vb\[3\]\) return;/,
    'and only what the reader can see is in the collection');
  /* ⚠ THE COUNTRY-WIDE SHEET HAS TO KNOW. Tier 2 means 「the unit layer is drawing this country」;
     if it meant 「its shapes are cached」, a country whose units are off-screen would be painted by
     nobody at all. */
  assert.match(src, /return\s*\(?[^;]*quietSet\[c\][^;]*\?\s*2\s*:\s*1;/);
  assert.ok(!/return unitsOf\(c\)\?2:1;/.test(src), 'the cache-based test must be gone');
  assert.match(src, /function refreshQuietSet\(\)\{/, 'the set is computed in one place…');
  assert.match(src, /if\(!_imCanDraw\(\)\)\{ quietSet=Object\.create\(null\); quietList=\[\]; return false; \}/,
    'and the set empties when nothing can be drawn, so the sheet is never off where the units are not');
  /* a pan republishes it, because the view is what decides its contents */
  assert.match(src, /GE\(\)\.events\.on\('moveend',\(\)=>\{ if\(!on\) return; askUnitsInView\(\);/);
});

/* ── ⑦ 「海などをクリックするとここには国がありませんと出てくる…わざわざポップアップを出すな」 ── */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R290 ⑦ a tap with nothing to say opens nothing, and the click falls through', () => {
  const src = WP();
  assert.match(src, /if\(!c&&!alertsAt\(lng,lat\)\.length\)\{ closePointCard\(\); return false; \}/,
    'no country AND no warning → no card, and the click is not claimed');
  /* ⚠ 「no country」 alone is NOT the condition: a marine warning is issued over water and carries
     its own polygon, so the card still opens where something IS in force. */
  assert.match(src, /esc\(L\('No country here\.'/, 'the sentence survives for the case that still shows it');
});
}

/* ════════ #R293 — from tests/r293-checks.test.mjs (7 of its 16 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R293 — source-level checks
 * ----------------------------------------------------------------------------
 *  The round's report, in one paragraph, so a reader of this file knows what it is guarding:
 *
 *    Six of the sentences this round answers had been answered before, and every one of them
 *    turned out to be a DIFFERENT SURFACE of the same complaint — the shape [[intmap-recurring-
 *    lessons]] calls 「再送は『自分の診断が違った』から始めろ」. So nothing here was written from the
 *    text of the request; every test below pins something that was MEASURED on production first:
 *
 *      · 「警報レイヤーが重すぎる」 — the steady state was already 60 fps (frame p50 16.7 ms, the same
 *        as with the layer off). The page froze for 7,597 ms while it parsed boundary sets it was
 *        downloading TWICE: 23.07 MB of per-country geoBoundaries beside the 2.27 MB world index
 *        #R290 shipped to make those unnecessary. → ADM2 only after ADM1 leaves something unplaced,
 *        one concurrency gate, and Cache Storage. Longest task 1,240 ms; second visit pays nothing.
 *      · 「Chronosポップアップの『過去表示中』」 — #R290 taught the COLLAPSED button to read the
 *        instant. The badge INSIDE the panel is a different element and still said 「過去」 for a
 *        future instant. Measured: both in the same frame, disagreeing.
 *      · 「地図中心の標準時、機能していない」 — third round, third cause. The accessor works; the only
 *        caller of `ensure()` was the <select>'s change handler, so a preference RESTORED from
 *        localStorage never fetched the data and fell silently to the device clock.
 *      · 「透明度100%は全然100%ではない」 — measured, both weather layers ARE fully opaque at 100 %
 *        (identical pixels over a light and a dark basemap). What was false was the WORD: the same
 *        control is 「Opacity」 in en/de/es/fr/ko/zh and was 「透明度」 / 「Прозрачность」 — the
 *        opposite quantity — in ja and ru.
 *      · 「Windyと完全に同じ風速と色の対応に」 — the shipped table borrowed Windy's breakpoints and
 *        invented the colours; measured divergence up to 133/255. And windy.com's own `RGBA()` does
 *        not equal a linear interpolation of its declared gradient (#R288's finding, again).
 *      · 「日本の特別警報の凡例だけ図形の形が違う」 — nothing chose a different shape. Every swatch
 *        carried a border, and a border's contrast is against the FILL: the JMA's #0c000c is the
 *        only chip darker than that grey, so it alone read as a ring. (And the panel held three
 *        swatch sizes for one idea.)
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ comments are stripped before every claim about code — this project has now written a test
   that matched its own explanation nineteen times (see #R288 ⑪ this round for the twentieth). */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const MT = () => codeOnly(read('js/map-tools.js'));

/* ── ① 「IntMap独自階級は、灰色、黄色、赤色、紫色、黒にしろ」 ─────────────────────────────────
   Five names for the five rows this key has always had: the four ranks plus 「発令なし」. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R293 ① the normalised ladder is grey · yellow · red · purple · black', () => {
  const s = WP();
  const m = /const PAL_NORM=\{([^}]*)\};/.exec(s);
  assert.ok(m, 'PAL_NORM must be one literal');
  const pal = {};
  for (const e of m[1].matchAll(/(\d+):'([^']*)'/g)) pal[e[1]] = e[2];
  assert.deepEqual(Object.keys(pal).sort(), ['1', '2', '3', '4'], 'four ranks, as before');

  /* the NAMES are the claim, so they are computed rather than trusted: hue and lightness decide
     whether a colour is yellow, red, purple or black, not the constant it is stored in */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hsl = (c) => {
    const [r, g, b] = c.map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    return { h, s: mx ? d / mx : 0, l: (mx + mn) / 2 };
  };
  const y = hsl(hex(pal['1'])), r = hsl(hex(pal['2'])), p = hsl(hex(pal['3'])), k = hsl(hex(pal['4']));
  assert.ok(y.h >= 40 && y.h <= 70 && y.s > 0.7, `rank 1 must be YELLOW — ${pal['1']} is hue ${y.h.toFixed(0)}`);
  assert.ok((r.h <= 20 || r.h >= 345) && r.s > 0.7, `rank 2 must be RED — ${pal['2']} is hue ${r.h.toFixed(0)}`);
  assert.ok(p.h >= 265 && p.h <= 320 && p.s > 0.4, `rank 3 must be PURPLE — ${pal['3']} is hue ${p.h.toFixed(0)}`);
  assert.ok(k.l < 0.12, `rank 4 must be BLACK — ${pal['4']} has lightness ${k.l.toFixed(2)}`);
  /* …and the fifth row is the one that was already there: grey, meaning 「読んだ。何も出ていない」 */
  const none = /const NONE_COL='(#[0-9a-f]{6})';/.exec(s);
  assert.ok(none, 'the 「発令なし」 grey is declared once');
  const g = hsl(hex(none[1]));
  assert.ok(g.s < 0.12 && g.l > 0.6, `「発令なし」 must be a light GREY — ${none[1]}`);
  /* 「灰色塗の色味は少しだけ白に近づけろ」 — measurably lighter than the JMA's #c8c8cb it replaces */
  assert.ok(hex(none[1])[0] > 0xc8, 'and lighter than the #c8c8cb it replaces');
  assert.match(s, /const QUIET_COL='rgba\(\d+,\d+,\d+,0\.42\)';/, 'the unit grey is declared once');
  assert.equal((s.match(/rgba\(\d+,\d+,\d+,0\.42\)/g) || []).length, 1,
    'and the country-wide sheet names that declaration rather than copying its literal');
});

/* ── ② 「斜線塗をもっと見やすい感じに」「斜線塗がなんなのか分かるように、凡例に追加しろ」 ────── */
test('R293 ② the hatch is a haloed line, and the legend swatch is the same tile', () => {
  const s = WP();
  /* ⚠ (tests-by-topic) EVALUATED, NOT READ. This used to ask the source for the spellings
     `g.clearRect(0,0,S,S);` and `strokeStyle=HATCH_HALO; … strokeStyle=HATCH_LINE;` — which a correct
     rewrite of the drawing (a loop over two passes, a helper) would fail and a broken one that kept
     the words would pass. The shipped declarations — the three numbers, the two colours, the DPR,
     `hatchCanvas` and `hatchSwatch` — are lifted out of js/world-packs.js as ONE region and run
     against a canvas that records what is drawn on it, so the claims are about the TILE.
     #R290 ① («the hatch is lines on transparent, and grey means one thing») is folded in here: its
     tile half is asserted below on the drawn tile, and its grey half is #R293 ① (one declaration,
     one literal) and #R288 ② (the country-wide sheet paints from that declaration). */
  const from = s.indexOf('const HATCH_S=');
  const to = s.indexOf('let _hatchOn=', from);
  assert.ok(from > 0 && to > from, 'the hatch declarations are one region of js/world-packs.js');
  const ops = [];
  const ctx = new Proxy({}, {
    set(t, k, v) { ops.push(['set', k, v]); t[k] = v; return true; },
    get(t, k) { if (k in t) return t[k]; return (...a) => { ops.push([k, ...a]); }; },
  });
  let made = 0;
  const canvas = () => { made++; return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,TILE' }; };
  const doc = { createElement: (tag) => { assert.equal(tag, 'canvas'); return canvas(); } };
  const H = new Function('document', s.slice(from, to)
    + '\nreturn { S: HATCH_S, HW: HATCH_HW, LW: HATCH_LW, HALO: HATCH_HALO, LINE: HATCH_LINE, D: HATCH_DPR, hatchCanvas, hatchSwatch };')(doc);
  const cv = H.hatchCanvas();
  assert.equal(cv.width, H.S * H.D, 'the tile is drawn at its declared density');
  assert.equal(H.hatchCanvas(), cv, 'and built once — the map tile and the legend read the same canvas');

  /* ① it starts transparent and nothing ever FILLS it (#R290's defect was a grey backing sheet) */
  const draws = ops.filter((o) => o[0] !== 'set');
  const firstPaint = draws.findIndex((o) => /^(clearRect|fillRect|stroke|fill)$/.test(o[0]));
  assert.deepEqual(draws[firstPaint], ['clearRect', 0, 0, H.S, H.S], 'the tile starts transparent (#R290)');
  assert.ok(!draws.some((o) => o[0] === 'fillRect' || o[0] === 'fill'), 'and nothing fills it — that was #R290’s defect');

  /* ② two strokes: the halo UNDER the line, along the same path, and wider than it */
  const strokes = [];
  let style = null, width = null, path = [];
  for (const o of ops) {
    if (o[0] === 'set' && o[1] === 'strokeStyle') style = o[2];
    else if (o[0] === 'set' && o[1] === 'lineWidth') width = o[2];
    else if (o[0] === 'beginPath') path = [];
    else if (o[0] === 'moveTo' || o[0] === 'lineTo') path.push(o.join(','));
    else if (o[0] === 'stroke') strokes.push({ style, width, path: path.join(' ') });
  }
  assert.equal(strokes.length, 2, 'one halo pass and one line pass');
  assert.deepEqual([strokes[0].style, strokes[1].style], [H.HALO, H.LINE],
    'the halo is drawn UNDER the line, so the diagonal reads on any basemap');
  assert.equal(strokes[0].path, strokes[1].path, 'and along the very same diagonals');
  assert.ok(strokes[0].width > strokes[1].width, 'the halo is wider than the line');
  /* …and the GAPS survive: the covered fraction of the tile is well under half of it, which is
     what keeps 「未対応」 from wearing 「発令なし」’s appearance underneath (#R290) */
  const period = H.S / Math.SQRT2;
  assert.ok(strokes[0].width / period < 0.45, `the diagonals cover ${(100 * strokes[0].width / period).toFixed(0)} % of the tile`);

  /* ONE declaration, two surfaces — the legend swatch is a picture of the tile the map draws */
  const sw = H.hatchSwatch(12);
  assert.ok(sw.includes('url(' + cv.toDataURL() + ')'), 'the swatch is rendered from the same canvas');
  assert.equal(made, 1, 'and the swatch did not build a second tile');
  /* 綴りのまま: 「手書きの模様が他に無い」「凡例に行がある」は、ソースに何が無い／何回あるかという構造の主張 */
  assert.ok(!/repeating-linear-gradient/.test(s),
    'and there is no hand-written pattern beside it to drift (there were two)');
  /* 「凡例に追加しろ」 — the hatch is a ROW of the world key, in both palette modes */
  assert.match(s, /const HATCH_ROW=\(\)=>\[HATCH_KEY,L\('Not covered, or not read yet/,
    'the hatch is named in the key');
  assert.equal((s.match(/HATCH_ROW\(\)/g) || []).length, 2,
    'and it appears in BOTH modes — the agency key and the IntMap key');
});
/* ── ③ 「日本の特別警報の凡例だけ、図形の形が違うのを辞めろ」 ───────────────────────────────
   The delimiter is OUTSIDE the chip, so its contrast is against the panel (the same for every row)
   rather than against the fill (which is what singled out the only chip darker than it). */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R293 ③ every severity swatch is one shape, one size, one delimiter', () => {
  const s = WP();
  assert.match(s, /const SW_PX=12;/, 'one size for every colour key');
  assert.match(s, /const swatchStyle=\(col,px\)=>[\s\S]{0,200}box-shadow:0 0 0 1px/,
    'the delimiter is a spread shadow OUTSIDE the chip');
  assert.ok(!/border:1px solid rgba\(128,128,128,0\.35\);"><\/span>/.test(s),
    'no swatch is outlined with a border any more');
  /* every swatch in the layer goes through the one builder — hard-coded width/height are gone */
  assert.ok(!/<span style="width:10px;height:10px;border-radius:3px/.test(s), 'no 10 px chip');
  assert.ok(!/<span style="width:14px;height:14px;border-radius:3px/.test(s), 'no 14 px chip');
  assert.ok(!/<span style="width:12px;height:12px;border-radius:3px/.test(s), 'no inline 12 px chip');
});

/* ── ④ 「ポップアップがでかすぎるからコンパクトに」「いつ発表の情報か、IntMapがいつ取得したかも」 ── */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R293 ④ the point card is compact and prints both clocks', () => {
  const s = WP();
  /* the biggest single thing in the card was the agency's full rank key, repeated from the legend */
  const i = s.indexOf('function pointBody(');
  const body = s.slice(i, s.indexOf('function openPointCard(', i));
  assert.ok(!/agencyKey\(feed\)/.test(body), 'the rank key is no longer repeated inside the card');
  assert.match(body, /hits\.slice\(0,6\)/, 'six warnings, not twelve');
  /* one padding, not two: `.country-popup` already has 18/22 px of its own */
  assert.match(s, /el\.style\.width='min\(316px,92vw\)'; el\.style\.padding='0';/,
    'the shell’s own padding is cleared and the width narrowed');

  /* TWO clocks, and they are different questions — #R269 is the round that paid for confusing them */
  assert.match(s, /const FEED_GOT=\{\};/, 'when THIS browser read the feed');
  /* ⚠ (#R298) …and the PANEL's 「Updated」 is written by the same setter now. It used to be written
     in one place only — the base sweep — so every rotated feed (MeteoAlarm, the WMO register, the
     CMA, the CAP providers) landed without touching it. MEASURED on production: 「Updated 0:56:52」
     at 01:05 and still 「Updated 0:56:52」 at 01:14, across ninety successful reads. */
  assert.match(s, /const feedOK=\(k\)=>\{ FEED_STATE\[k\]='ok'; FEED_GOT\[k\]=Date\.now\(\); lastAt=FEED_GOT\[k\]; \};/,
    'one setter writes the state, the read time and the panel’s own clock together');
  assert.ok(!/FEED_STATE\.[a-z]+='ok'/.test(s), 'no loader writes only half of it');
  assert.match(s, /function stampLine\(pr\)\{/, 'the card has one line for both');
  assert.match(s, /L\('issued','発表'/, '…the agency’s own issue time');
  assert.match(s, /L\('IntMap read','IntMap取得'/, '…and IntMap’s');
  assert.match(s, /const issued=stampAt\(pr\.at\)\|\|stampAt\(FEED_AT\[pr\.feed\]\);/,
    'the issue time falls back to the feed’s own clock, never to the fetch time');
  assert.match(s, /\(issued\|\|'—'\)/, 'and an unknown time prints a dash rather than a lie');

  /* the feature carries both, and the relay supplies the issue time it never used to send */
  assert.match(s, /function unitFeature\(iso,feed,geometry,unit,name,rows,at,got\)\{/);
  assert.match(s, /at:String\(at\|\|''\), got:String\(got\|\|''\),/);
  const r = read('supabase/functions/alerts-relay/index.ts');
  assert.match(r, /const st = String\(\(w\?\.alert\?\.sent\) \|\| pick\.onset \|\| pick\.effective \|\| ""\);/,
    'MeteoAlarm areas now carry the CAP bulletin’s own `sent`');
  /* two CAP services gained it this round; the WMO register already tracked its own `sent`, which
     is why the count is taken over the ones this round added rather than over every occurrence */
  assert.equal((r.match(/if \(sent > b\.sent\) b\.sent = sent; +\/\* \(#R293\)/g) || []).length, 2,
    '…and so do both CAP services');
  assert.equal((r.match(/if \(sent > b\.sent\) b\.sent = sent;/g) || []).length, 3,
    '…and the WMO register still does');
});

/* ── ⑤ 「警報レイヤーが重すぎる。品質保ったまま爆速にしろ」 ──────────────────────────────────
   MEASURED (production R292 → this build, same instrument, 75–80 s):
     longest main-thread task  7,597 ms → 1,240 ms
     geoBoundaries, cold        23.07 MB / 30 requests → 18.03 MB / 22
     geoBoundaries, second visit                       → 0.00 MB / 1
   The quality is preserved BY CONSTRUCTION: the only download that is skipped is one whose input
   condition is 「there was nothing left for it to place」.                                        */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R293 ⑤ boundary sets are cached, gated, and ADM2 is earned rather than assumed', () => {
  const s = WP();
  /* ① ADM2 waits for ADM1 to have been tried AND to have left something unplaced */
  assert.match(s, /function stillMissing\(iso\)\{ const p=PLACED\[iso\]; return p\?Math\.max\(0,p\[1\]-p\[0\]\):1; \}/);
  const i = s.indexOf('function askGB(iso)');
  const gb = s.slice(i, s.indexOf('const MA_ALIAS', i));
  assert.match(gb, /gbIndex\(iso,'ADM1'\)/, 'ADM1 first');
  assert.match(gb, /if\(!stillMissing\(iso\)\) return null;[\s\S]{0,120}gbIndex\(iso,'ADM2'\)/,
    'and ADM2 only when ADM1 left something unplaced');
  /* ② one concurrency gate for every geoBoundaries request, not one per caller */
  assert.match(gb, /if\(gbInflight>=GB_MAX\) return;/, 'the placement loader is gated');
  assert.match(s, /const GB_MAX=2;/, 'and the gate is one number');
  assert.equal((s.match(/gbInflight\+\+/g) || []).length, 2, 'both callers take from the same budget');
  /* ③ boundaries are cached — they are not news */
  assert.match(s, /const BND_CACHE='intmap-page-bnd-v1';/);
  assert.match(s, /async function bndJSON\(u\)\{ const hit=await bndCached\(u\); if\(hit\) return hit;/);
  /* ⚠ (#R297) the Eurostat urls are built from a base constant now (a finer generalisation was
     added for 「境界線解像度が低すぎる」, and two literals would have been two places to change), so
     the needle is that constant. Everything else is unchanged. */
  for (const u of ['class10s.json', 'JP_MUNI_URL', 'ne_50m_admin_1', 'NUTS_BASE+', 'cnUrl'])
    assert.ok(new RegExp('bndJSON\\((?:\'[^\']*)?' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(s),
      u + ' is fetched through the cache');
  assert.match(s, /const NUTS_BASE='https:\/\/gisco-services\.ec\.europa\.eu[^']*';/,
    'and that base is the Eurostat distribution');
  assert.match(s, /NUTS_RG_20M_2021_4326_LEVL_3\.geojson/, '…still holding the floor generalisation');
  /* ⚠ a WARNING is never cached — only the shapes it is drawn on */
  assert.ok(!/bndJSON\(relay\(/.test(s), 'no live warning feed goes through the boundary cache');
  assert.ok(!/bndJSON\([^)]*swic/.test(s), '…including the register’s own shapes, which are today’s');
});

/* ── ⑥ 「境界線解像度が低すぎる」 ────────────────────────────────────────────────────────────
   The bundled world index (#R290) is Douglas–Peucker 0.01° — invisible at the zoom it exists for
   and exactly what a reader sees when they zoom to a coastline. It cannot be made finer without
   making the overview unaffordable, so it is a FLOOR: above UNIT_HIRES_Z a country that is on
   screen and still drawn from it is upgraded to its own published boundary set.                  */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R293 ⑥ the bundled world index is a floor, upgraded per country when it can be seen', () => {
  const s = WP();
  assert.match(s, /const UNIT_SRC=Object\.create\(null\);/, 'which index a country came from is recorded');
  /* ⚠ (#R298) the VALUE moved (5 → 4, 「境界線解像度が低すぎる」) and the PROPERTY did not: there is
     one zoom at which a country stops being drawn from the bundled index, and the upgrade pass
     reads that same constant. Pinning the number again would only pin the number. */
  assert.match(s, /const UNIT_HIRES_Z=\d+;/);
  assert.match(s, /if\(!\(z>=UNIT_HIRES_Z\)\) return;/, 'and the upgrade pass reads it');
  assert.match(s, /const COARSE=\/\^\(world\|ne50\)\$\/;/, 'and which of them are the coarse ones');
  /* every producer labels what it produced, or the upgrade cannot know what to upgrade */
  for (const src of ['jp', 'cn', 'tw', 'nuts', 'ne50', 'world', 'gb'])
    assert.ok(new RegExp("setUnits\\([^;]*,'" + src + "'\\)").test(s), src + ' labels its units');
  assert.match(s, /function upgradeUnitsInView\(\)\{[\s\S]{0,400}COARSE\.test\(UNIT_SRC\[c\]\|\|''\)/);
  assert.match(s, /if\(!inView\(f\)\) return;[\s\S]{0,80}askUnitsGB\(c\);/,
    'only for a country the reader is actually looking at');
  /* ⚠ (#R306) THIS WAS A CHARACTER COUNT, AND A CHARACTER COUNT IS LINE-ENDING DEPENDENT.
     The window was 600 and the body is 604 bytes with LF and **615 with CRLF** — so #R305, which
     added two lines to `askUnitsInView`, made this red on every Windows checkout and green on CI.
     That is #R283's trap exactly. The relation is 「the view pass ENDS by running the upgrade」, so
     it is asked of the function's own body, from its declaration to the call that closes it. */
  assert.match(s, /function askUnitsInView\(\)\{[\s\S]{0,1200}?upgradeUnitsInView\(\); \}/,
    'and it runs on the same view pass the loader already had');
});

/* ── ⑯ 「塗りすぎ」 — A SLIDER THAT WRITES A SCALAR ERASES AN EXPRESSION ──────────────────────
   MEASURED on the built app with the warnings layer on:
     getPaint('wp-alert-hatch','fill-opacity')  →  0.38          ← a plain number
   That layer is declared with `['case', ['==', feature-state, 0], 0.9, 0]`, i.e. the EXPRESSION IS
   WHAT DECIDES WHICH COUNTRIES ARE HATCHED. `_applyGenericOpacity` wrote the slider's value over
   it, so every country on Earth — the ones with warnings in force included — was hatched at 38 %.
   #R273 met the same mechanism one property along (`line-opacity` on the outline) and answered it
   with a per-layer EXEMPTION. An exemption is the wrong shape here: the reader does want the hatch
   to follow the slider; what they do not want is the slider deciding WHO is hatched.               */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('R293 ⑯ the opacity slider dims the country layers without deciding who they paint', () => {
  const d = DL();
  assert.match(d, /window\._opacityExpr=window\._opacityExpr\|\|\{\};/, 'a layer may register a builder');
  assert.match(d, /const build=window\._opacityExpr\[lid\];\s*if\(build\)\{ GE\(\)\.layers\.setPaint\(lid,p,build\(v\)\); return; \}/,
    'and the builder is asked BEFORE the scalar is written');
  /* …and it is asked before the scalar, not after — a `return` rather than an overwrite */
  const i = d.indexOf('function _applyGenericOpacity');
  const body = d.slice(i, d.indexOf('window._applyGenericOpacity=', i));
  assert.ok(body.indexOf('window._opacityExpr[lid]') < body.lastIndexOf('setPaint(lid,p,'),
    'the builder path comes first');

  const s = WP();
  /* both country-wide layers keep a CONDITION, and the slider multiplies inside it */
  assert.match(s, /const hatchOp=\(v\)=>\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    'the hatch still asks whether this country is state 0');
  assert.match(s, /const choroOp=\(v\)=>\['case',\['>',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    '…and the wash whether it is above 0');
  assert.match(s, /OE\[HATCH\]=hatchOp; OE\[CHORO\]=choroOp;/, 'both are registered');
  assert.match(s, /'fill-opacity':hatchOp\(OPACITY_DEFAULT\)/, 'and they are what the layer is built with');
  assert.match(s, /'fill-opacity':choroOp\(OPACITY_DEFAULT\)/);
  /* the raw conditionals must not be written anywhere else, or one copy drifts */
  assert.equal((s.match(/\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\]/g) || []).length, 1,
    'the hatch condition exists exactly once');
});
}

/* ════════ #R308 — from tests/r308-checks.test.mjs (6 of its 10 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R308 — source-level checks
 * ----------------------------------------------------------------------------
 *  Two reports:
 *    ①「警報レイヤー、発令されている・されてない地域にまで斜線かけるな。」
 *       ——「情報あるのに、そこに斜線が上塗りされてるところ」。斜線は「この地図はここについて何も
 *       述べていない」という主張なので、この層が何かを述べている地面の上に描かれてはならない。
 *    ②「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」   (4回目)
 *
 *  ⚠ THE ASSERTIONS BELOW ARE RELATIONS, NOT SPELLINGS. Twenty-five rounds running, this project has
 *  had legitimate changes turned red by a check that pinned a literal — a byte count, a build stamp,
 *  a sentence that the next round was told to rewrite. Every question here is asked of a FUNCTION
 *  BODY (brace-matched, so a comment or a line ending cannot move the window) and every number is
 *  asked as an INEQUALITY against the thing it has to be big or small enough for.
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* the body of a named function declaration, by brace matching — #R306's lesson: a window written in
   characters is a window that CRLF moves. */
function fnBody(src, name, from) {
  const start = src.indexOf('function ' + name + '(', from || 0);
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
/* the value of a `var`/`const`/`let` declaration of a plain number or string, wherever it is written */
function numConst(src, name) {
  const m = new RegExp('(?:var|const|let)\\s+[^;]*?\\b' + name + '\\s*=\\s*([0-9][0-9*\\s]*)').exec(src);
  assert.ok(m, name + ' is declared');
  // eslint-disable-next-line no-new-func
  return Function('return (' + m[1] + ')')();
}

const WX = read('js/wx-ecmwf.js');
const WP = read('js/world-packs.js');
/* ⚠ `world-packs.js` holds every world pack, and more than one of them has an `ensureChoro`.
   Everything below is asked of the ALERTS pack, so the search starts where it declares its layers. */
const ALERTS = (() => { const i = WP.indexOf("const CHORO='wp-alert-choro'");
  assert.notEqual(i, -1, 'the alerts pack declares its country-wide layers'); return i; })();

/* ── ⑤ 警報: the hatch has a second surface, and it is NOT the shared country index ───────────────
   The overlap the reader reported is between two DIFFERENT indexes: `countries` carries enclaves and
   disputed areas as their own polygons, and the unit indexes (NUTS, admin-1, an agency's own forecast
   districts) do not carve them out. A hatch drawn only from the shared vector source can therefore
   never be cut. */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('r308 ⑤ the hatch has a cut surface of its own, on a source this layer owns', () => {
  assert.match(WP, /HCUT\s*=\s*'[^']+'\s*,\s*HCUT_SRC\s*=\s*'[^']+'/, 'the cut layer and its source are named');
  const body = fnBody(WP, 'ensureChoro', ALERTS);
  assert.match(body, /addSource\(HCUT_SRC/, 'the cut source is created with the rest of the family');
  assert.match(body, /id:HCUT[\s\S]{0,200}source:HCUT_SRC/, 'the cut layer draws from that source, not from `countries`');
  const hatchAdd = /id:HATCH[\s\S]{0,200}?'fill-pattern':'([^']+)'/.exec(body);
  const cutAdd = /id:HCUT[\s\S]{0,200}?'fill-pattern':'([^']+)'/.exec(body);
  assert.ok(hatchAdd && cutAdd, 'both hatch layers declare a pattern');
  assert.equal(cutAdd[1], hatchAdd[1], 'the two hatch layers are the same picture — one appearance, two geometries');
});

/* ── ⑥ 警報: no ground is ever hatched twice ─────────────────────────────────────────────────────
   The cut source carries the countries whose hatch was re-cut; the country hatch must therefore stop
   drawing exactly those countries. If the filter and the source were not built from the same list,
   the two layers would overlap and the pattern would double. */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('r308 ⑥ the country hatch is filtered by the very list the cut source carries', () => {
  const body = fnBody(WP, 'applyHatchCut');
  assert.match(body, /setSourceData\(HCUT_SRC\s*,\s*hatchCutFC/, 'the cut source is fed the cut collection');
  assert.match(body, /setFilter\(HATCH[\s\S]{0,200}hatchCutISO/, 'the country hatch is filtered by the same list');
});

/* ── ⑦ 警報: one subtraction, not two ────────────────────────────────────────────────────────────
   #R307 already owns 「geometry minus the geometry that answers for it」 (`subtractWarnings`, with its
   cache, its vertex ceiling and its winding fix). A second implementation beside it is how two
   answers to one question start disagreeing. */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('r308 ⑦ the hatch cut reuses #R307 subtraction rather than clipping a second way', () => {
  const one = fnBody(WP, '_cutOne');
  assert.match(one, /subtractWarnings\(/, 'the cut asks the existing subtraction');
  assert.doesNotMatch(one, /\.difference\(/, 'and does not reach for the clipper itself');
  const reb = fnBody(WP, 'rebuildHatchCut');
  assert.doesNotMatch(reb, /\.difference\(/, 'nor does the rebuild');
});

/* ── ⑧ 警報: the hatch family is still ONE visibility list (#R288) ───────────────────────────────
   #R288 measured a layer left half-hidden because visibility was set in four places over three
   lists. A new member of the family that is not in that list is the same defect waiting. */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('r308 ⑧ the cut layer is in the one list that decides whether this layer is showing', () => {
  const m = /const ALL_LYR\s*=\s*\(\)\s*=>\s*([^;]+);/.exec(WP);
  assert.ok(m, 'ALL_LYR is the one list');
  assert.match(m[1], /\bHCUT\b/, 'the cut layer is in it');
});

/* ── ⑨ 警報: the clipper arrives late, and what it could not answer is asked again ────────────────
   `polygon-clipping` is a lazy, optional chunk (#R307). Everything computed before it lands is
   computed WITHOUT it; if the memo of that work were not invalidated when it arrives, the cut would
   never happen for a reader who switched the layer on quickly. */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('r308 ⑨ the late clipper invalidates the cut, so it is recomputed once it can be', () => {
  const body = fnBody(WP, 'clipper');
  assert.match(body, /hatchCutKey\s*=\s*''/, 'the arriving clipper drops the cut memo');
  assert.match(body, /publish\(\)/, 'and republishes');
});

/* ── ⑩ 警報: the cut is BOUNDED, and it converges ────────────────────────────────────────────────
   MEASURED while this round was written: the straightforward version of this cost 19,588 ms in one
   `rebuildHatchCut` and the interior-point version 16,263 ms — the same way this layer paid in #R290
   and #R297. What makes it affordable is a budget per publish plus a memo per country, and a budget
   that is spent must leave the work to be finished rather than dropped. */
/* 綴りのまま: 対象は js/world-packs.js の警報パックの closure（地図の source・feature-state・DOM）の中で、ブラウザの外では走らない */
test('r308 ⑩ the cut has a per-publish budget and finishes what it could not do', () => {
  const ms = numConst(WP, 'CUT_BUDGET_MS');
  assert.ok(ms > 0 && ms <= 60, 'the budget is ' + ms + ' ms — a slice of a frame, not a frame');
  const body = fnBody(WP, 'rebuildHatchCut');
  assert.match(body, /CUT_BUDGET_MS/, 'the rebuild watches the budget');
  assert.match(body, /hatchCutKey\s*=\s*spent\s*\?\s*''/, 'a spent budget leaves the signature unfinished');
  assert.match(body, /cutMemo/, 'and what was computed is remembered per country');
  const pub = fnBody(WP, 'publishNow');
  assert.match(pub, /hatchCutLeftOver/, 'the publisher comes back for what was left');
});
}
