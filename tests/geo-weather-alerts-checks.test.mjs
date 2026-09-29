/* ============================================================================
 *  WEATHER WARNINGS — 警報レイヤー（js/world-packs.js の alerts）
 * ----------------------------------------------------------------------------
 *  「発表なし」 as one collection, the grey only where nothing is in force, units that keep their names,
 *  one simplification, the refresh cadence, the JMA reduce per bulletin type, finer units on screen,
 *  the Danger-or-above list, and legend notes that fit one line in every language.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { assertUnreadNeverGreys } from './wash-tier.mjs';
import { isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R298 · one 「発表なし」, one simplification, the cadence   (was tests/r298-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  IntMap · #R298 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins a RELATION that a report named, not a number a round happened to pick.
 *
 *    · 「日本と日本以外で、発表無しポリゴンの色を変えるのを辞めろ」
 *      「発表無しポリゴンだけ不透明度選択の対象外なのを辞めろ」
 *      「発表無しポリゴンの上に発表ありポリゴンを重ねる形式を今すぐ辞めろ」
 *      — three reports, ONE structure. 「発表なし」 had two implementations: Japan's went through
 *      `quietFeature()` into `wp-alert` (colour `NONE_COL`, opacity = the reader's slider) and
 *      everyone else's went into a SECOND source `wp-alert-quiet-src` and a SECOND layer
 *      `wp-alert-quiet` (colour rgba(220,220,224,0.42), fill-opacity 1 — outside the slider),
 *      placed UNDER `wp-alert-fill` and carrying EVERY unit of the country, warned ones included.
 *      The two sources also had different `tolerance` (1.2 and 2.5), so the same administrative
 *      border was simplified two ways and the edges did not meet.
 *    · 「ズームレベルが遠いとポリゴンがガビガビになる。境界線解像度が低すぎる」 — one collection, one
 *      simplification (the renderer's default), and the bundled 0.01° world index is left one zoom
 *      earlier for the country's own published boundaries.
 *    · 「更新が遅すぎる。リアルタイムにと言っている」 (5回目) — tick 20 s → 10 s, the rotation floor
 *      25 s → 15 s, the relay's edge cache 30 s → 15 s. And the panel printed 「30秒ごと」 while
 *      `TICK_MS` was 20,000: a number written down beside a constant goes stale, so it is computed.
 * ==========================================================================*/
describe('§ #R298 · one 「発表なし」, one simplification, the cadence', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const WP = () => read('js/world-packs.js');
  /* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
     This project has paid for that twenty-two times; the answer is to ask the question of the text
     that RUNS. String literals are kept, because a layer id IS a string literal. */
  const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  /* …and this module holds a dozen packs; the alerts one is the subject here. */
  const alertsModule = (src) => {
    const a = src.indexOf('(function alerts()'), b = src.indexOf('window.__wpAlerts=', a);
    if (!(a > 0 && b > a)) throw new Error('the alerts module could not be delimited');
    return src.slice(a, b);
  };

  /* ── ① 「発表なし」 has exactly one implementation ─────────────────────────────────────────── */
  test('R298 ① 「発表なし」 is one collection, one colour, one opacity — for every country', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const s = WP();
    const code = noComments(s);
    /* the second source and its two layers are gone, name and all */
    assert.ok(!/wp-alert-quiet/.test(code), 'no second quiet source or layer');
    assert.ok(!/\bQFILL\b|\bQLINE\b|\bQSRC\b/.test(code), 'and no leftover handles for them');
    /* the producer is not country-specific */
    assert.match(s, /function quietFeature\(iso,feed,geometry,unit,name\)\{/);
    assert.ok(!/quietFeature\('[A-Z]{3}'/.test(code),
      'no country has a quiet path of its own — a literal ISO here was why Japan looked different');
    assert.match(s, /colA:NONE_COL, colN:NONE_COL/, 'one grey, in both palettes');
    /* it rides in the SAME collection as the warnings, and the warnings come after it */
    assert.match(s, /quietFeatures\(\)\.concat\(feats\)/,
      'array order is draw order: quiet first, the answer after');
    /* …and therefore the opacity control reaches it, because it is the same layer */
    /* ⚠ (#R308) …asked as a RELATION rather than as that array's spelling: the point is that the
       control reaches the fill the quiet units are drawn by and their dividing outline, not that the
       list has exactly four members (it gained a fifth when the hatch got a second surface). */
    const pl = /legendId:'wpalerts', layers:\(\)=>\[([^\]]*)\]/.exec(s);
    assert.ok(pl, 'the panel declares the layers the opacity control owns');
    ["'wp-alert-fill'", "'wp-alert-line'", 'CHORO', 'HATCH'].forEach((k) =>
      assert.ok(pl[1].split(',').includes(k), k + ' is owned by the slider'));
    const at = s.indexOf("id:'wp-alert-fill'");
    assert.ok(at > 0);
    assert.match(s.slice(at, at + 260), /'fill-opacity':OPACITY_DEFAULT/,
      'and that fill has a plain opacity for the slider to write');
  });

  /* ── ② a warned unit does not also get a grey underneath it ──────────────────────────────── */
  test('R298 ② the grey is only where there is no warning', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const s = WP();
    /* ⚠⚠ (#R305) THE ANSWER GREW A THIRD VALUE. 「skip the warned unit」 and 「emit the quiet one」
       were the only two, so a warning SMALLER than the unit threw away the whole unit's grey — and
       with it the part of that unit where nothing is in force (measured: 20.3 % of Switzerland
       unpainted). The third answer is 「emit it with the warning cut out of it」. What #R298 pinned —
       grey and colour never share a pixel — is unchanged and is why the cut has to be exact. */
    /* ⚠ (#R344) `quietFor` builds one country at a time, so the skip is a `continue`. */
    assert.match(s, /const qg=quietGeomFor\(iso,g\);\s+if\(!qg\) continue;/,
      'the quiet emitter asks what is true of this unit, and skips it when nothing is');
    const i = s.indexOf('function warnMeeting(iso,g){');
    assert.ok(i > 0, 'warnMeeting must exist');
    const body = s.slice(i, i + 1400);
    /* the test is the unit's own centre, not object identity — an agency that files its own polygon
       (the DWD, the NWS, MET Norway, a CAP polygon) never touches the unit index, so === cannot see it */
    /* ⚠ (#R306) …and the point it asks WITH has to be a point OF the unit. `geomCentre` is the
       average vertex of the largest ring, which for a concave or many-part subject lands outside its
       own outline — measured, that is how Russia lost 83 land samples' worth of quiet units to
       warnings that were in the NEIGHBOUR. `geomInside` scans a line across the middle and takes the
       midpoint of the widest interior span, and it is verified against the geometry before use. */
    assert.match(body, /geomInside\(g\)/);
    assert.match(body, /inGeom\(c,bin\[i\]\)/);
    assert.match(s, /function inGeom\(pt,g\)\{/, 'point-in-polygon, holes included');
    assert.match(s, /for\(let i=1;i<rings\.length;i\+\+\) if\(ptInRing\(pt,rings\[i\]\)\) return false;/,
      'a hole is not the inside');
    /* and it is bounded: only the countries whose units are actually being drawn are indexed */
    const wi = s.slice(s.indexOf('function warnIndex(){'), s.indexOf('function sameOutline'));
    assert.match(wi, /if\(!quietSet\[q\.iso\]\) return;/,
      'a country nobody is drawing grey for costs nothing');
    assert.match(wi, /_warnIdxOf===featsVer&&_warnIdxSet===setSig/,
      'and the index is rebuilt when either the warnings or the drawn set changes');
  });

  /* ── ③ the unit's name travels with the unit's shape ─────────────────────────────────────── */
  test('R298 ③ a quiet unit can still say its own name', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const s = WP();
    assert.match(s, /function named\(g,nm\)\{/, 'the name is attached to the shape');
    assert.match(s, /_stash\(g,'__nm',String\(nm\)\)/);
    /* ⚠ (#R305) the GEOMETRY may now be the unit with the warned part cut out of it (`punchQuiet`),
       and the NAME still comes off the unit the cut was made from — which is the point of this test. */
    assert.match(s, /quietFeature\(iso,feed,qg,'unit',g\.__nm\|\|''\)/, 'and the feature carries it');
    /* every producer that HAS a name passes one — a shape with no name is a fact, not a bug */
    const ask = s.slice(s.indexOf('function askUnits(iso){'), s.indexOf('function askUnitsWorld(iso){'));
    ['jpMuniGeo', 'cnGeo', 'twTownGeo', 'nutsGeo', 'adm1Geo'].forEach(fn =>
      assert.ok(new RegExp(fn + '\\(\\)[\\s\\S]{0,600}named\\(').test(ask), fn + ' names its units'));
    /* the note must survive the worker boundary: it is NOT enumerable, so the structured clone
       the tiler receives does not carry it */
    assert.match(s, /Object\.defineProperty\(o,k,\{value:v,enumerable:false,configurable:true\}\)/,
      'the stash is invisible to the clone the tiler gets');
  });

  /* ── ④ one collection, one simplification ────────────────────────────────────────────────── */
  test('R298 ④ the warning source is simplified once, at the renderer default', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const s = WP();
    const m = s.match(/addSource\(SRC,\{type:'geojson',tolerance:([\d.]+),buffer:(\d+)/);
    assert.ok(m, 'the source declares its tolerance');
    assert.equal(m[1], '0.375', 'the renderer’s own default — about a twentieth of a pixel per zoom');
    /* ⚠ (#R308) THE RULE IS ABOUT THE WARNINGS AND THE 「発表なし」 UNITS, which must be ONE collection
       at ONE tolerance — that is what 「日本と日本以外で色を変えるな」 came down to. It was written as
       「exactly one geojson source in this module」, which is a different sentence, and #R308's hatch cut
       (a source that carries no warning and no quiet unit — only the ground the hatch may still claim)
       turned it red. Asked as the rule: every collection of alert FEATURES goes to that one source. */
    const code = alertsModule(noComments(s));
    const adds = (code.match(/addSource\(([A-Z_]+),\{type:'geojson'/g) || [])
      .map((x) => /addSource\(([A-Z_]+),/.exec(x)[1]);
    assert.ok(adds.includes('SRC'), 'the warnings and the quiet units have their source');
    const feeds = [...new Set((code.match(/setSourceData\(([A-Z_]+),\{type:'FeatureCollection'/g) || [])
      .map((x) => /setSourceData\(([A-Z_]+),/.exec(x)[1]))];
    assert.deepEqual(feeds, ['SRC'],
      'every collection of alert features goes to that one source, got ' + feeds.join(','));
  });

  /* ── ⑤ the boundaries a reader sees are the country's own, one zoom earlier ──────────────── */
  test('R298 ⑤ the bundled world index is left earlier', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const s = WP();
    const m = s.match(/const UNIT_HIRES_Z=(\d+);/);
    assert.ok(m, 'the constant exists');
    assert.ok(+m[1] <= 4, 'the upgrade happens at z4 or lower, got z' + m[1]);
    /* the floor it upgrades FROM is still the shipped index — the point is WHEN it is left, not that
       the file got finer (#R297 measured that a finer bundle only costs re-tiling) */
    assert.match(s, /const ADM1_URL='data\/admin1-world\.json\.gz';/);
  });

  /* ── ⑥ 「リアルタイム」 is the same number in three places, and it is computed once ────────── */
  test('R298 ⑥ the refresh cadence agrees with itself, top to bottom', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const s = WP();
    const tick = +(/const TICK_MS=(\d+);/.exec(s) || [])[1];
    const floor = +(/const MIN_AGE_MS=(\d+);/.exec(s) || [])[1];
    const relay = read('supabase/functions/alerts-relay/index.ts');
    const edge = +(/const CACHE = "public, max-age=(\d+), s-maxage=\1,/.exec(relay) || [])[1];
    assert.ok(tick > 0 && floor > 0 && edge > 0, 'all three are declared');
    assert.ok(tick <= 10000, 'the tick is at most ten seconds, got ' + tick);
    assert.ok(floor >= edge * 1000,
      'the rotation floor is not shorter than the edge cache (asking sooner returns the same bytes)');
    assert.ok(floor <= edge * 1500, 'and not needlessly longer than it, got ' + floor + ' vs ' + (edge * 1000));
    /* the panel PRINTS this, and printing a literal is how it came to say 30 s while TICK_MS was 20,000 */
    assert.ok(!/every 30 s/.test(noComments(s)), 'no hand-written interval is left in the panel');
    assert.match(s, /L\('every \{0\} s','\{0\}秒ごと'[\s\S]{0,160}\.replace\('\{0\}',String\(Math\.round\(TICK_MS\/1000\)\)\)/,
      'the number the reader sees is the constant');
  });

  /* ── ⑪ a retry that re-reads a cached body is not a retry ───────────────────────────────── */
  test('R298 ⑪ the shape library can actually grow between two asks', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const s = WP();
    /* 「警報の塗漏れが多すぎる」 — #R288 put a member that is STILL short of a full library on a
       three-minute interval and #R297 stored what it learns for seven days. Both were defeated by a
       missing argument: this read went through `fetchJSON(u)` with no cache option while the relay
       answered `max-age=3600`, so the browser served the same bytes for an hour and the three-minute
       retry could not have learned anything. The register only holds what is in force RIGHT NOW. */
    const i = s.indexOf('function askSwicGeo(iso){');
    assert.ok(i > 0, 'askSwicGeo must exist');
    const body = s.slice(i, i + 4200);
    assert.match(body, /fetchJSON\(u,\{cache:'no-store'\}\)/,
      'the library read bypasses the HTTP cache — it is asking again ON PURPOSE');
    /* …and because a re-ask is now a real request, it is bounded by the view — but only for a country
       that already HAS a library. One with none is asked wherever it is (#R284: Moldova 0 of 42). */
    assert.match(body, /if\(swicGeoAsked\[iso\]&&Object\.keys\(swicGeoBy\[iso\]\|\|\{\}\)\.length&&!inViewISO\(iso\)\) return;/);
    /* and the relay's own window is not longer than the interval the app retries on */
    const relay = read('supabase/functions/alerts-relay/index.ts');
    const geo = relay.slice(relay.indexOf('summariseSWICGeo(r.text(), m)'));
    const m = /max-age=(\d+), s-maxage=\1, stale-while-revalidate=(\d+)/.exec(geo);
    assert.ok(m, 'the shape route declares a cache window');
    const shortMs = +(/const SWIC_GEO_SHORT_MS=(\d+);/.exec(s) || [])[1];
    assert.ok(+m[1] * 1000 <= shortMs,
      `the edge window (${m[1]} s) must not outlast the retry interval (${shortMs / 1000} s)`);
    assert.ok(+m[2] >= 3600, 'stale-while-revalidate still protects the upstream');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R299 · the JMA reduce, finer units, the Danger list, short notes   (was tests/r299-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  IntMap · #R299 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins a RELATION that a report named, not a number a round happened to pick.
 *
 *    · 「発令されているのに、ごっそり都道府県単位でもれ落ちていたりする」 — r8/map.json holds exactly
 *      ONE row per (publishingOffice, dataTypeCode) and each dataTypeCode is a different hazard
 *      family. Keeping 「the newest bulletin per office」 kept one family and dropped the other four.
 *      MEASURED through this module's own reduce on the live file: 601 → 812 municipalities,
 *      211 recovered (26 %), and the loss was whole prefectures — 千葉県 54/54, 東京都 53/53,
 *      熊本県 46/46, 山梨県 27/27, 石川県 19/19.
 *    · 「発令されているのに、灰色になっている場所がある」 — the country-wide 「読んだ。何も出ていない」
 *      sheet was painted over countries that were drawing warnings, because `quietSet` is empty
 *      below `QUIET_UNIT_Z` and while a unit index is still landing.
 *    · 「ポリゴンの境界線の解像度が低すぎる場所が多々ある」 — Japan's floor is 17.6 vertices per
 *      municipality (千代田区 = 7 points). The same publisher's per-prefecture build is 10.9× finer.
 *    · 「『いま発表されている警報』は…『危険』以上のものがある国だけ出すこと／ふさわしい名称に改名」
 *    · 「文章が長すぎる。簡潔に。」 ×2
 * ==========================================================================*/
describe('§ #R299 · the JMA reduce, finer units, the Danger list, short notes', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const WP = () => read('js/world-packs.js');
  /* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
     This project has paid for that twenty-four times; ask the question of the text that RUNS. */
  const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  const alertsModule = (src) => {
    const a = src.indexOf('(function alerts()'), b = src.indexOf('window.__wpAlerts=', a);
    if (!(a > 0 && b > a)) throw new Error('the alerts module could not be delimited');
    return src.slice(a, b);
  };

  /* ── ① the JMA state is one bulletin per office PER BULLETIN TYPE ─────────────────────────── */
  test('R299 ① the JMA reduce keys on the bulletin TYPE as well as the office', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const code = noComments(alertsModule(WP()));
    const m = code.match(/const newest=Object\.create\(null\);[\s\S]{0,400}?const kept=Object\.values\(newest\);/);
    assert.ok(m, 'the r8 reduce is still one recognisable block');
    const reduce = m[0];
    assert.ok(/publishingOffice/.test(reduce), 'the office is still part of the key');
    /* ⚠ THE RELATION, not the separator: the key must ALSO name the bulletin type, because that is
       what distinguishes the five hazard families an office publishes. */
    assert.ok(/dataTypeCode/.test(reduce), 'the bulletin type is part of the key — one row per family');
    /* and the key is built from both in the same expression, not two competing keys */
    assert.ok(/publishingOffice[\s\S]{0,80}dataTypeCode/.test(reduce),
      'office and type are joined into one key');
  });

  test('R299 ① the age gate still asks 「is this feed alive」, not 「is every family fresh」', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const code = noComments(alertsModule(WP()));
    /* jmaAt is the newest row OF ALL — a quiet family that has not been re-issued for weeks is the
       current state of that family and must not fail the gate. */
    assert.ok(/jmaAt=kept\.reduce\(\(m,b\)=>\{[^}]*t>m\?t:m/.test(code.replace(/\s+/g, ' ').replace(/ /g, '')) ||
      /jmaAt=kept\.reduce/.test(code), 'the clock is still the newest bulletin of all');
    assert.ok(/JMA_MAX_AGE_H/.test(code), 'and the age gate is still there');
  });

  /* ── ② a country that is drawing warnings is never washed grey ────────────────────────────── */
  test('R299 ② the country-wide 「nothing in force」 sheet is not painted over a country that is drawing', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const code = noComments(alertsModule(WP()));
    const m = code.match(/return\s*\(?[^;]*quietSet\[c\][^;]*\?\s*2\s*:\s*1;/);
    assert.ok(m, 'washTier still ends in the quiet/wash decision');
    assert.ok(/drawnISO\[c\]/.test(m[0]),
      'a country with features on the map takes the transparent arm — 「発令されているのに灰色」');
    /* the grey itself is unchanged: it is still one colour and still means 「read, and quiet」 */
    /* ⚠ (#R308 追記2) …asked of the RULE rather than of the line — see tests/wash-tier.mjs */
    assertUnreadNeverGreys(code);
  });

  /* ── ③ Japan's units have a resolution ABOVE the nationwide floor ─────────────────────────── */
  test('R299 ③ Japan is upgraded from the nationwide s0001 floor when a prefecture is on screen', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const s = WP();
    const code = noComments(alertsModule(s));
    assert.ok(/s0001/.test(code), 'the nationwide file is still the floor (one request for the world view)');
    /* the finer per-prefecture build exists and is reached */
    assert.ok(/s0010/.test(code), 'the per-prefecture build is what the upgrade reads');
    assert.ok(/function askJpFine\(/.test(code), 'there is an upgrade pass for Japan');
    /* …and it is wired into the SAME view-bounded ladder every other country uses, not a private one */
    /* ⚠ take a WINDOW rather than trying to match a closing brace: this file is CRLF and the
       indentation of a closing brace is not a contract. */
    const body = (name, n) => { const i = code.indexOf('function ' + name + '()'); return i < 0 ? '' : code.slice(i, i + n); };
    const up = body('upgradeUnitsInView', 900);
    assert.ok(/askJpFine\(\)/.test(up),
      'askJpFine runs from upgradeUnitsInView, so it is bounded by zoom and by the view');
    /* the warnings are re-placed, not only the quiet units: jpShape reads the same index */
    const fine = body('askJpFine', 2200);
    assert.ok(/refresh\(\)/.test(fine),
      'a finer index re-runs the feed — otherwise fine grey meets coarse colour along every border');
    assert.ok(/JP_FINE_MAX/.test(fine), 'and it is bounded, like GB_MAX is');
    assert.ok(/getBounds\(\)/.test(fine), 'and by what is on screen');
  });

  /* ── ④ the country list is cut at the normalised Danger step ──────────────────────────────── */
  test('R299 ④ 「危険」以上の国だけ — one threshold, named once, used by the filter', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const code = noComments(alertsModule(WP()));
    assert.ok(/const HOT_MIN=3;/.test(code), 'the threshold is a named constant, not a literal in the filter');
    const m = code.match(/const list=\[\.\.\.by\.values\(\)\][^;]*;/);
    assert.ok(m, 'hotList still builds its list in one expression');
    assert.ok(/\.filter\(g=>g\.norm>=HOT_MIN\)/.test(m[0]), 'and it filters on the country worst rank');
    /* HOT_MIN has to BE the Danger step of NORM_NAME, or the heading and the rule drift apart */
    assert.ok(/n===3\?L\('Danger'/.test(code), 'norm 3 is still the step called Danger / 危険');
  });

  test('R299 ④ the heading names what the list is, and the empty line does not claim more than it knows', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const code = noComments(alertsModule(WP()));
    assert.ok(!/'What is in force now'/.test(code), 'the old caption is gone from the code that runs');
    assert.ok(/L\('Countries at Danger or above'/.test(code), 'the heading names the filter');
    /* ⚠ the empty state used to say 「nothing is in force anywhere」, which is FALSE once the list is
       filtered — lower ranks can be in force and drawn while this box is empty. */
    assert.ok(!/'Nothing in force in any connected service right now\.'/.test(code),
      'the old empty line would now be a false statement');
    assert.ok(/No country is at Danger or above right now\./.test(code), 'it says which question it answered');
  });

  /* ── ⑤ the two legend paragraphs are short ───────────────────────────────────────────────── */
  test('R299 ⑤ 「文章が長すぎる。簡潔に。」 — both legend notes are one line in every language', () => {
    /* 綴りのまま: 主張が L()／t() に渡す言語別の引数（翻訳の在否と長さ）そのもので、ソースの引数の並びが対象。 */
    const code = noComments(alertsModule(WP()));
    assert.ok(!/Each agency’s ranks are mapped onto these four by IntMap/.test(code), 'the long ① is gone');
    assert.ok(!/Japan’s are the JMA’s yellow \/ red \/ magenta \/ black/.test(code), 'the long ② is gone');
    /* the claims that had to survive */
    const one = code.match(/L\('IntMap’s own conversion[^)]*\)/);
    assert.ok(one, '① still says whose arithmetic it is');
    assert.ok(/same step is not the same danger/.test(one[0]), '…and still carries the warning that goes with it');
    const two = code.match(/L\('Each agency’s own colours[^)]*\)/);
    assert.ok(two, '② still says the colours are not IntMap’s');
    /* and 「簡潔に」 is measurable: every language of both notes fits on one line */
    for (const lit of [one[0], two[0]]) {
      for (const arg of lit.match(/'((?:[^'\\]|\\.)*)'/g) || []) {
        assert.ok(arg.length - 2 <= 130, 'a legend note is still one line: ' + arg.slice(0, 60));
      }
    }
  });

  /* ── ⑭ 「簡潔に」 is measured against the OTHER note, not against the old one ────────────────── */
  test('R299 追記 ⑭ the normalised legend note is no longer than the agency one', () => {
    /* 綴りのまま: 主張が L()／t() に渡す言語別の引数（翻訳の在否と長さ）そのもので、ソースの引数の並びが対象。 */
    const code = noComments(alertsModule(WP()));
    const one = code.match(/L\('IntMap’s own conversion[^)]*\)/);
    const two = code.match(/L\('Each agency’s own colours[^)]*\)/);
    assert.ok(one && two, 'both notes are still there');
    /* production, panel width 330 px: the agency note was 14 px (one line) and this one 29 px (two).
       The claims are what had to survive; the repeated 「tap a country」 hint is said in full below. */
    assert.ok(/same step is not the same danger/.test(one[0]), 'the caveat survives');
    assert.ok(/IntMap/.test(one[0]), 'and whose arithmetic it is');
    assert.ok(!/Tap a country/.test(one[0]), 'the hint the panel already gives in full is not repeated here');
    const longest = (lit) => Math.max(...(lit.match(/'((?:[^'\\]|\\.)*)'/g) || ["''"]).map((a) => a.length - 2));
    assert.ok(longest(one[0]) <= longest(two[0]) + 20,
      'and it is not materially longer than the note that measured one line');
  });

  /* ── ⑰ 「簡潔に」 is true in a LANGUAGE or it is not true ─────────────────────────────────────── */
  test('R299 追記3 ⑰ both legend notes fit one line in all NINE languages, not just English', () => {
    /* 綴りのまま: 主張が L()／t() に渡す言語別の引数（翻訳の在否と長さ）そのもので、ソースの引数の並びが対象。 */
    /* MEASURED on production at the panel's fixed 330 px content width: en and jp were one line while
       **de wrapped at 339 px, fr at 334 and ru at 414**. Shortening only the English is answering the
       instruction in the language it happened to be discussed in (AGENTS.md §3-5).
       The bound is a WIDTH MODEL, not a character count: a CJK ideograph, kana or Hangul syllable takes
       about two Latin advances at this size. Production's own numbers calibrate it — the German agency
       note is 66 units and measured 304 px, i.e. ≈4.6 px/unit, so the 330 px box holds ≈71 units. */
    const WIDE = /[ᄀ-ᅟ⺀-꓏ꥠ-꥿가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/;
    const units = (s) => [...s].reduce((n, ch) => n + (WIDE.test(ch) ? 2 : 1), 0);
    const LIMIT = 68;                       /* ≈313 px — one line with room, on the 330 px box */
    const wp = WP();
    const five = (head) => {
      const i = wp.indexOf("L('" + head);
      assert.ok(i > 0, 'the note beginning ' + head + ' is still one L() call');
      const seg = wp.slice(i, i + 900), out = [];
      for (const m of seg.matchAll(/'((?:[^'\\]|\\.)*)'/g)) { out.push(m[1]); if (out.length === 5) break; }
      assert.equal(out.length, 5, 'five positional arguments');
      return out;
    };
    const EXTRA = { fr: 'ui.fr.js', ko: 'ui.ko.js', zh: 'ui.zh.js', 'zh-hans': 'ui.zh-hans.js' };
    for (const head of ['IntMap’s own conversion', 'Each agency’s own colours']) {
      const args = five(head);
      const rows = [['en', args[0]], ['jp', args[1]], ['de', args[2]], ['ru', args[3]], ['es', args[4]]];
      const key = args[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const [code, f] of Object.entries(EXTRA)) {
        const m = read('js/locales/' + f).match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
        assert.ok(m, code + ' still translates: ' + args[0].slice(0, 40));
        rows.push([code, m[1]]);
      }
      for (const [code, s] of rows) {
        assert.ok(units(s) <= LIMIT,
          code + ' wraps this legend note (' + units(s) + ' > ' + LIMIT + '): ' + s.slice(0, 60));
      }
    }
  });

  /* ── ⑯ the fine NUTS tier covers BOTH levels, because MeteoAlarm issues at either ───────────── */
  test('R299 追記2 ⑯ the NUTS upgrade fetches LEVL_2 as well as LEVL_3', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（警報は js/world-packs.js の alerts パックで、地図・DOM・取得の closure の中）。 */
    const code = noComments(alertsModule(WP()));
    const i = code.indexOf('function askNutsFine(');
    assert.ok(i > 0, 'askNutsFine is still one function');
    const f = code.slice(i, i + 1200);
    /* MEASURED on production: Rome's centre sits inside Lazio's HOLE, and that hole is the Vatican
       inflated by the 20M generalisation from 0.44 km² to 73.93 km² — 323 grid points with nothing
       painted at all. Italy is the only country MeteoAlarm issues for at NUTS-2, so LEVL_3's fine
       tier never reached it. The relation: whatever level a country's units come from, the upgrade
       has to offer a finer build of it. */
    assert.ok(/03M_2021_4326_LEVL_3/.test(f), 'the fine tier still upgrades LEVL_3');
    assert.ok(/03M_2021_4326_LEVL_2/.test(f), '…and LEVL_2, which is where Italy lives');
    /* and the FLOOR is untouched — a finer floor is what #R297 measured and rejected */
    const g = code.indexOf('function nutsGeo(');
    const n = code.slice(g, g + 500);
    assert.ok(/20M_2021_4326_LEVL_2/.test(n) && /20M_2021_4326_LEVL_3/.test(n),
      'the floor is still 20M for both levels');
    assert.ok(!/03M/.test(n), 'and the floor does not quietly become the fine build');
  });

  ISOLATED.built();
});
