/* ============================================================================
 *  The warnings layer: which agency answers for which country, what is in force, how often it is read, and what the hazards are called
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r266-checks.test.mjs, tests/r268-checks.test.mjs, tests/r212-checks.test.mjs, tests/r271-checks.test.mjs, tests/r277-checks.test.mjs, tests/r284-checks.test.mjs, tests/r383-checks.test.mjs, tests/r499-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';
import { uiLocale } from './helpers/layer-locale-tables.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r266-checks.test.mjs — 2 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）。supabase/functions/<名前>/index.ts は Deno.serve の中で上流を読む Edge Function で、ここでは起動しない（起動して測る検査は tests/layer-ais-ships-checks の #R510 ⑨⑩⑪） */
/* (#R266) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
/* (#R273) the prose that records why something went is not evidence that it is still there */

test('R266 ⑥: the warnings layer covers the G7 and China with their own services', () => {
  const s = read('js/world-packs.js');
  /* ⚠ (#R268) THE MEMBERSHIP, NOT THE WHOLE LITERAL. #R266's four are still each on their own
     agency's feed; #R268 added Australia, Brazil and Hong Kong, and pinning the exact object made a
     LARGER table look like a regression. What this test is about is that these four countries are
     not on GDACS. */
  const feeds = /const FEEDS=\{([^}]*)\}/.exec(s);
  assert.ok(feeds, 'the national-feed table is gone');
  for (const [iso, feed] of [['JPN', 'jma'], ['USA', 'nws'], ['CAN', 'eccc'], ['CHN', 'cma']]) {
    assert.ok(feeds[1].includes(iso + ":'" + feed + "'"), iso + ' lost its own service');
  }
  const ma = /const MA=\{([\s\S]*?)\};/.exec(s);
  assert.ok(ma, 'the MeteoAlarm table is gone');
  /* ⚠ (#R271) GERMANY LEFT THIS TABLE BECAUSE IT GAINED SOMETHING BETTER. The DWD publishes its
     warnings WITH the district polygons (maps.dwd.de, ACAO *) while MeteoAlarm relays the same
     warnings with no geometry at all — measured, 16,272 German areas and 0 polygons — so Germany is
     read from its own service and must NOT also be pulled as ten megabytes from the relay. Norway
     left for the same reason. What #R266 was about is that every G7 member is covered by a national
     service, whichever one, and that is what is asserted. */
  const feedTable = feeds[1];
  const G7 = ['JPN', 'USA', 'CAN', 'DEU', 'FRA', 'ITA', 'GBR'];
  for (const iso of G7) assert.ok(feedTable.includes(iso + ":'") || ma[1].includes(iso + ':'),
    iso + ' is covered by no national service at all');
  assert.match(s, /const MA_DEFAULT=\[/, 'the European members fetched up front must still be named');
  assert.match(s, /async function loadECCC\(\)/);
  assert.match(s, /async function loadCMA\(\)/);
  assert.match(s, /async function loadMA\(list\)/);
  /* real time, and on the way back to the foreground.
     ⚠ (#R273) 「更新が遅すぎる。リアルタイムにと言っている。」 — the interval came down again, to 30 s,
     so what is asserted is the BOUND rather than the number: a warning is a safety claim with a
     clock on it and a minute was already the second answer to that sentence. */
  const ms = /const TICK_MS=(\d+)/.exec(s);
  assert.ok(ms, 'the refresh interval must be a named constant');
  assert.ok(+ms[1] > 0 && +ms[1] <= 60000, `the interval is ${ms[1]} ms — it must be a minute or better`);
  /* ⚠ (#R408) the timer moved onto js/runtime.js's one wheel — the register that had existed since
     #R234 with zero callers. The claim here is unchanged (the refresh timer runs at TICK_MS and not
     at some number written twice); only the spelling that carries it moved. */
  assert.match(s, /timer=everyTick\('world-packs:alerts-tick',TICK_MS,tick\)/, '…and the timer must use it');
  assert.match(s, /addEventListener\('visibilitychange'/, 'a backgrounded tab never catches up');
  /* the slow feeds must not hold the fast ones */
  assert.ok(!/loadMA\(maAsked\)[\s\S]{0,120}\]\)/.test(s), 'MeteoAlarm is awaited inside the Promise.all again');
  /* ⚠⚠ (#R273) 「GDACSを完全に撤廃しろ。」 — the global event feed is GONE, and with it the whole
     class of defect #R266 追記 was about (an event listed under a national agency's heading,
     because `mine` carried both). One country, one national service; there is no second kind of
     row in a country's list to attribute wrongly. */
  /* ⚠ 「Xは消えたか」はXが書かれていた構文で書け (#R266's own lesson) — and the question is about the
     CODE, so the prose that records why it went is not evidence against it. */
  const code = codeOnly(s);
  for (const form of ['loadGDACS', 'gdacsapi', 'GDACSCOL', 'GDACSWASH', "'gdacs'", 'gCountries']) {
    assert.ok(!code.includes(form), 'GDACS must be gone from the layer entirely: ' + form);
  }
  assert.match(s, /const FEEDS=\{/, 'the country → service table is what covers the world now');
});

test('R266 ⑭: the alert relay is an allow-list, not an open proxy', () => {
  const s = read('supabase/functions/alerts-relay/index.ts');
  assert.match(s, /h === "feeds\.meteoalarm\.org"/);
  assert.match(s, /h === "www\.nmc\.cn"/);
  assert.match(s, /return null;\s*\n\}/, 'the allow-list falls through to something other than a refusal');
  /* ⚠ THE HEADER IS STILL SENT; IT IS DECLARED IN ONE PLACE NOW. The four keyless relays share
     _shared/relay-guard.js (allow-list bounds, deadline, byte ceiling, generic errors), and the CORS
     object came with them — a literal grep in this file could only ever find a copy. */
  assert.match(s, /corsFor\(/, 'the relay does not build its CORS headers from the shared guard');
  assert.match(read('supabase/functions/_shared/relay-guard.js'), /"Access-Control-Allow-Origin": "\*"/);
  /* ⚠ (#R297) the number moved (60 → 30 s, for 「更新が遅すぎる」) and the PROPERTY did not: a
     warning is cached for SECONDS, never minutes, and `tests/r288 ④` ties the app's rotation floor
     to whatever this is. */
  const smax = +(/s-maxage=(\d+)/.exec(s) || [])[1];
  assert.ok(smax > 0 && smax <= 60, `a warning must not be cached for minutes (s-maxage=${smax})`);
  /* Canada sends its own ACAO — a relay that is not needed is another thing to be down */
  assert.ok(!/api\.weather\.gc\.ca/.test(s.slice(s.indexOf('function allowed'), s.indexOf('Deno.serve'))),
    'Canada is being relayed even though it sends ACAO');
  assert.match(read('js/world-packs.js'), /fetch\('https:\/\/api\.weather\.gc\.ca/);
});
}

/* ══════════ from tests/r268-checks.test.mjs — 2 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R268) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
/* ⚠ (#R267) COUNT IN CODE, NOT IN COMMENTS. This file's own prose names the strings it checks for,
   which is how an audit ends up catching itself (nine rounds and counting). Comments are stripped
   before any «does X still exist» question is asked. */

/* ── ⑨ warnings: more services, grouped, and actually re-read ──────────────────────────────── */
test('R268 ⑨ three more national services are wired, and each is loaded and reported', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /AUS:'bom'/, 'Australia');
  assert.match(s, /BRA:'inmet'/, 'Brazil');
  assert.match(s, /HKG:'hko'/, 'Hong Kong');
  for (const fn of ['loadBOM', 'loadINMET', 'loadHKO']) assert.ok(s.includes('function ' + fn) || s.includes('async function ' + fn), fn + ' must exist');
  /* ⚠ (#R293) a good fetch is recorded through `feedOK(k)` now, because there are TWO clocks to
     write — the state AND when this browser read it (「IntMapがいつ取得した情報かも書け」) — and
     thirteen call sites each writing both by hand is twelve chances to write only one. */
  /* ⚠ (#R298) …and the panel's own 「Updated」 is the THIRD thing that setter writes. It was written
     in one place only (the base sweep), so every rotated feed landed without touching it — measured
     on production, the panel said 「Updated 0:56:52」 for seventeen and a half minutes across ninety
     successful reads. The property this line pins is 「one setter, every clock」, not the number of
     clocks, so it asks for the prefix and lets the setter grow. */
  assert.match(s, /const feedOK=\(k\)=>\{ FEED_STATE\[k\]='ok'; FEED_GOT\[k\]=Date\.now\(\);/,
    'one setter writes the state and every clock that goes with it');
  for (const k of ['bom', 'inmet', 'hko']) {
    assert.ok(new RegExp("feedOK\\('" + k + "'\\)").test(s), k + ' must record a good fetch');
    assert.ok(new RegExp("FEED_STATE\\." + k + "='error'").test(s), k + ' must record a failed fetch');
  }
});

test('R268 ⑨ every live warning fetch bypasses the HTTP cache', () => {
  const s = codeOnly(read('js/world-packs.js'));
  const start = s.indexOf('function alerts(');
  const end = s.indexOf('4 · TIDES') > 0 ? s.indexOf('STATE.alertsLegend') : s.length;
  const body = s.slice(start, end);
  const fetches = [...body.matchAll(/fetch\((?:'|")https?:[^)]*\)/g)].map((m) => m[0]);
  /* ⚠ ONLY THE WARNINGS. `area.json` is JMA's list of area CODES AND NAMES and the geoBoundaries
     files are prefecture OUTLINES — reference data that changes on a scale of years, and telling the
     browser not to cache them would cost a megabyte a minute for nothing. */
  const live = fetches.filter((f) => !/geoboundaries|media\.githubusercontent|const\/area\.json/.test(f));
  assert.ok(live.length >= 4, `expected the live warning fetches, found ${live.length}`);
  for (const f of live) assert.match(f, /cache:'no-store'/, 'a 60 s timer that re-reads a cached document changes nothing: ' + f.slice(0, 90));
});
}

/* ══════════ from tests/r212-checks.test.mjs — 1 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R212) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ── 4. the warnings layer never states a safety fact it does not have ─────────────────────────── */
test('R212 ④: "nothing in force" is only said when that feed actually answered', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /FEED_STATE/, 'each feed carries its own state');
  /* the sentence is gated on the state being ok — the GUARD is the property, not the exact
     wording of the sentence (#R273 rewrote the sentence and the branch shape stayed) */
  const okBranch = /st==='ok'\)[\s\S]{0,200}Nothing in force right now/.test(s);
  assert.ok(okBranch, 'the reassuring sentence is behind an ok check');
  /* ⚠⚠ (#R273) GDACS IS GONE — 「GDACSを完全に撤廃しろ」. What #R212 was about survives and is
     STRONGER: a country this app has no feed for must not look like a country with nothing in
     force. It used to be covered by an event feed presented beside national warnings; it is a
     HATCH and a sentence now, which is the same claim made honestly. */
  assert.ok(!/loadGDACS|gdacsapi/.test(s), 'GDACS must be gone, not re-added');
  assert.match(s, /No feed connected/, 'a country with no feed says so in words');
  assert.match(s, /wp-alert-hatch/, '…and is hatched on the map rather than left blank');
  /* ⚠ and Japan is drawn at the unit the JMA issues at. #R212's point was that a geometry which
     cannot be had is an ERROR rather than an empty map, and that is what is asserted. */
  assert.match(s, /japan-topography[\s\S]{0,200}N03/, 'the municipality geometry is the MLIT boundary set');
  assert.match(s, /throw new Error\('jma: no issuing-unit geometry could be read'\)/,
    'a geometry that cannot be had is an error, not an empty map');
});
}

/* ══════════ from tests/r271-checks.test.mjs — 2 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）。supabase/functions/<名前>/index.ts は Deno.serve の中で上流を読む Edge Function で、ここでは起動しない（起動して測る検査は tests/layer-ais-ships-checks の #R510 ⑨⑩⑪） */
/* (#R271) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* ⚠ (#R267) read CODE, not comments — this file's own prose names the things it checks for, and a
   check that matches its own explanation is the failure this project has paid for eleven times. */

/* ── ② the two services that answer a browser directly, with geometry ───────────────────────── */
test('R271 ② Germany and Norway are read from their own service', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /maps\.dwd\.de/, 'the DWD publishes its warning polygons on its own GeoServer');
  assert.match(s, /api\.met\.no\/weatherapi\/metalerts/, 'MET Norway publishes its alerts as GeoJSON');
  assert.match(s, /DEU:'dwd'/, 'Germany must be routed to the DWD, not to the MeteoAlarm relay');
  assert.match(s, /NOR:'metno'/, 'Norway must be routed to MET Norway');
  /* …and the MeteoAlarm table must no longer carry them, or the relay would fetch 10 MB for a
     country whose own service is already wired */
  const ma = /const MA=\{([\s\S]*?)\};/.exec(s);
  assert.ok(ma, 'the MeteoAlarm table must exist');
  assert.ok(!/\bDEU:/.test(ma[1]), 'Germany must not also be fetched from MeteoAlarm');
  assert.ok(!/\bNOR:/.test(ma[1]), 'Norway must not also be fetched from MeteoAlarm');
});

/* ⚠ (#R271 追記2) 「対応国も増やせ」 — the Philippines, a country that was on GDACS only. #R268 and
   #R271 both stopped at PAGASA's Tropical Cyclone Alert, whose only <area> is the whole Philippine
   Area of Responsibility (a box over the open sea). The flood advisories in the SAME feed carry one
   <area> per PROVINCE with a real <polygon> — measured through the relay: 20 provinces. */
test('R271 ② the Philippines is read from PAGASA, at its provinces', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /PHL:'pagasa'/, 'the Philippines must be routed to its own service');
  /* (#R273) …through the ONE reader every CAP-index service now shares (Taiwan and New Zealand
     joined it), because the cost of adding a country has to be one table entry */
  assert.match(s, /pagasa:\{q:'ph=1',iso:'PHL',unit:'province'/, 'and have a loader');
  assert.match(s, /async function loadCAP\(feed\)/, '…which is one function, not one per country');
  assert.match(s, /SIDE\.phl/, '…whose features reach the one publisher');
  assert.match(s, /feats=baseFeats\.concat\([^)]*SIDE\.phl/, '…and are actually published');
  const r = read('supabase/functions/alerts-relay/index.ts');
  assert.match(r, /publicalert\.pagasa\.dost\.gov\.ph/, 'the relay must reach PAGASA');
  assert.match(r, /PH_PAR/, 'the area-of-responsibility box must be dropped by name, not drawn');
  /* (#R383) …and the test moved into the one predicate every summariser in that file now shares.
     It answers more than 「expired」 — a bulletin whose window has not OPENED is not in force either
     — and it fails open when a feed publishes no clock at all (see tests/r383-checks ①). */
  assert.match(r, /const fs = forceState\(\{ expires, onset: xmlOne\(cap, "onset"\)/,
    'an expired bulletin is not in force');
  assert.match(r, /if \(Number\.isFinite\(exp\) && exp < now\) return "expired";/,
    '…and that is what the predicate tests');
});
}

/* ══════════ from tests/r277-checks.test.mjs — 4 of its 12 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）。supabase/functions/<名前>/index.ts は Deno.serve の中で上流を読む Edge Function で、ここでは起動しない（起動して測る検査は tests/layer-ais-ships-checks の #R510 ⑨⑩⑪） */
/* (#R277) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
const WP = () => codeOnly(read('js/world-packs.js'));

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
  /* (#R284) `MA_SLOTS` is the SUSTAINED number of slots; a rotation that still has unread countries
     runs at `COLD_CALLS` instead. The floor this test is about is the sustained one. */
  const calls = +(/const MA_SLOTS=(\d+);/.exec(s) || [])[1];
  const tick = +(/const TICK_MS=(\d+);/.exec(s) || [])[1];
  const cache = +(/max-age=(\d+), s-maxage=/.exec(read('supabase/functions/alerts-relay/index.ts')) || [])[1];
  const countries = (read('js/world-packs.js').match(/^\s{6}const MA=\{[\s\S]*?\};/m) || [''])[0]
    .split(':').length - 1;
  assert.ok(countries > 30, `the MeteoAlarm table has ${countries} countries`);
  const cycleS = Math.ceil(countries / (per * calls)) * (tick / 1000);
  assert.ok(cycleS <= cache, `a full cycle is ${cycleS}s against a ${cache}s edge cache`);
  /* …and the same is true of the WMO register's rotation */
  const sper = +(/const SWIC_PER_TICK=(\d+), SWIC_SLOTS=(\d+);/.exec(s) || [])[1];
  const scalls = +(/const SWIC_PER_TICK=\d+, SWIC_SLOTS=(\d+);/.exec(s) || [])[1];
  /* …and a COLD rotation is faster than the sustained one, never slower (#R284) */
  const cold = +(/const COLD_CALLS=(\d+);/.exec(s) || [])[1];
  assert.ok(cold >= calls && cold >= scalls, `the warm-up burst (${cold}) is at least the steady rate`);
  assert.ok(sper * scalls >= per * calls, 'the register rotates at least as fast');
  /* the AGE is what the panel prints — a rotation that stops has to be visible (#R275) */
  assert.match(s, /maOldestS:\(function\(\)\{/, 'the oldest country’s age is measured');
  assert.match(s, /oldestS:\(function\(\)\{/, '…for both rotations');
});

/* ── ⑩ 追記: two call sites may not claim one English key with different translations ────────────
   The inline tables for every language past the five positional arguments are keyed BY THE ENGLISH
   STRING, so an English word used at two call sites can only be right at ONE of them.
   MEASURED on production, this round: the new 雹 hazard was written L('Hail','雹',…) — and
   js/time-borders.js already had LA('Hail','ハーイル',…), the Saudi city حائل. The four tables were
   filled for the CITY: fr «Haïl», ko «하일», 中文 «哈伊勒». Nothing was missing, nothing was
   untranslated, and the map would have printed a city name as the hazard in three languages.
   ⚠ THE CHECK IS THE GENERAL RULE, not that one word: one English key, one meaning. */
test('R277 ⑩ no hazard name is an English key another call site already means something else by', () => {
  const src = read('js/world-packs.js');
  const blk = src.slice(src.indexOf('const HAZ=['), src.indexOf('const HAZI={};'));
  const haz = new Map([...blk.matchAll(/\(\)=>L\('([^']+)','([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.ok(haz.size >= 20, `expected the hazard names, found ${haz.size}`);
  const files = readdirSync(resolve(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  const clashes = [];
  for (const f of files) {
    const t = read(`js/${f}`);
    for (const m of t.matchAll(/\bLA?\('((?:[^'\\]|\\.)+)','((?:[^'\\]|\\.)*)'/g)) {
      const [, en, ja] = m;
      if (!haz.has(en)) continue;
      if (ja !== haz.get(en)) clashes.push(`${f}: L('${en}','${ja}') vs the hazard's '${haz.get(en)}'`);
    }
  }
  assert.deepEqual(clashes, [], 'an English key may only mean one thing');
  /* …and every hazard must actually HAVE an entry in the tables that are keyed by that string */
  /* (consolidation) EVALUATED: the English-keyed inline table each language hands to IntMapLang.define */
  for (const c of ['fr', 'ko', 'zh']) {
    const inl = uiLocale(c).inline;
    for (const en of haz.keys()) {
      assert.ok(typeof inl[en] === 'string' && inl[en].length > 0,
        `«${en}» has no entry in ui.${c}.js — it would read English`);
    }
  }
});

/* ── ⑪ 追記: the words production surfaced that the table had not learned ────────────────────────
   MEASURED on the live site right after the deploy: 121 distinct agency words were on the map and
   13 of them resolved to nothing. Three were real gaps; one («Yellow Warning») is correct. */
test('R277 ⑪ hail, 山洪, a bare “Fire” and the awareness_type codes all resolve', () => {
  const blk0 = codeOnly(read('js/world-packs.js'));
  const blk = blk0.slice(blk0.indexOf('const HAZ=['), blk0.indexOf('const HAZI={};'));
  assert.match(blk, /\['hail',/, '冰雹 has a hazard of its own');
  assert.match(blk, /山洪/, '山洪 is a flash flood, not an unnamed word');
  /* ⚠ «\bfire\b» does NOT match «Wildfire» — there is no boundary before «fire» inside the word */
  assert.match(blk, /\['wildfire', *\/fire\\b\|/, 'a bare “Fire” in a warning is a wildfire');
  const want = { wind: 1, snow: 2, thunderstorm: 3, fog: 4, heat: 5, cold: 6, coastal: 7,
    wildfire: 8, avalanche: 9, rain: 10, flashflood: 12, hail: 13 };
  for (const [key, code] of Object.entries(want)) {
    const i = blk.search(new RegExp("\\['" + key + "',"));
    assert.ok(i >= 0, `${key} must be in the table`);
    const seg = blk.slice(i, blk.indexOf('/i,', i));
    assert.ok(seg.includes('awareness_?type ?= ?' + code + '\\b'),
      `awareness_type=${code} must resolve to ${key}`);
  }
  /* …and nowhere else. `['wind',` also occurs in the JMA CODE TABLE far earlier in the file, and
     resolving the insert point against THAT put awareness_type=1 on the tsunami pattern. */
  const tsu = blk.slice(blk.indexOf("['tsunami',"), blk.indexOf("['volcano',"));
  assert.ok(!/awareness_/.test(tsu), 'no awareness_type code may sit on the tsunami pattern');
});
}

/* ══════════ from tests/r284-checks.test.mjs — 2 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している） */
/* (#R284) the round's header note is kept with its largest block, in tests/layer-weather-ecmwf-checks.test.mjs */

const WP = () => codeOnly(read('js/world-packs.js'));

/* ── ② the services that issue beyond their own border ───────────────────────────────────────
   Measured against api.weather.gov: the NWS's active-alert feed carries UGC zones in GU, MP, PW
   and FM as well as the states. Those warnings were being drawn while the country layer hatched
   「未対応」 over the same islands.                                                                */
test('#R284 ② a service’s territories are wired to that service', () => {
  const src = WP();
  const m = src.match(/const ALSO=\{[\s\S]*?\};/);
  assert.ok(m, 'the territory table must exist');
  for (const iso of ['PRI', 'VIR', 'GUM', 'MNP', 'ASM', 'PLW', 'FSM', 'MHL'])
    assert.ok(m[0].includes("'" + iso + "'"), iso + ' is an NWS area of responsibility');
  assert.match(src, /Object\.keys\(ALSO\)\.forEach\(f=>\{ ALSO\[f\]\.forEach\(c=>\{ if\(!FEEDS\[c\]\) FEEDS\[c\]=f; \}\); \}\);/,
    'and it may never overwrite a country that already has its own feed (一国一ソース)');
  /* the twelve national feeds are still there — this is an addition, not a rewrite */
  const feeds = src.match(/const FEEDS=\{[\s\S]*?\};/);
  for (const iso of ['JPN', 'USA', 'CAN', 'CHN', 'AUS', 'BRA', 'HKG', 'DEU', 'NOR', 'PHL', 'TWN', 'NZL'])
    assert.ok(feeds[0].includes(iso + ':'), iso + ' keeps its own feed');
});

/* ── ④ the words on the map ──────────────────────────────────────────────────────────────────
   Measured across every MeteoAlarm country and the WMO register: 163 distinct event strings, of
   which the classifier could not name seven. Two of those are deliberate (a row whose whole text
   is 「Yellow Warning」 carries no hazard, and 「Other dangers」 names none); five were real gaps.  */
test('#R284 ④ the five hazard names the table had not learned', () => {
  const src = WP();
  const rows = src.match(/const HAZ=\[[\s\S]*?\]\];/);
  assert.ok(rows, 'the hazard table must exist');
  const has = (key, needle) => {
    const line = rows[0].split('\n').find(l => l.includes("['" + key + "'"));
    assert.ok(line, key + ' row exists');
    assert.ok(line.includes(needle), key + ' now matches ' + needle);
  };
  has('wildfire', 'red flag');                  /* the NWS's own name for fire weather */
  has('landslide', 'geological');               /* the CMA's 「geological disaster」 */
  has('thunderstorm', 'strong convection');     /* the CMA's 「strong convection」 */
  has('tsunami', 'rissaga');                    /* the Balearic meteotsunami */
  has('marine', 'small craft');                 /* the NWS's 「Small Craft Advisory」 */
  /* …and the twenty-odd hazards that were already there are still there */
  for (const k of ['cyclone', 'tornado', 'flood', 'snow', 'heat', 'cold', 'wind', 'rain', 'fog', 'hail'])
    assert.ok(rows[0].includes("['" + k + "'"), k + ' survives');
});
}

/* ══════════ from tests/r383-checks.test.mjs — 4 of its 6 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-packs.js は DOM・MapLibre・各機関への fetch に閉じた 1 つのファクトリで node では組み立てられない（切り出して実行できる関数は実行している）。supabase/functions/<名前>/index.ts は Deno.serve の中で上流を読む Edge Function で、ここでは起動しない（起動して測る検査は tests/layer-ais-ships-checks の #R510 ⑨⑩⑪）（forceState と _sq は切り出して実行している） */
/* ============================================================================
 *  R383 — the warnings layer, audited against WHAT THE AGENCIES ACTUALLY HAVE IN FORCE
 * ----------------------------------------------------------------------------
 *  ⚠ THE PROSE LIVES HERE AND IN DEV-NOTES.md on purpose — js/world-packs.js already carries
 *  the notes that belong beside the code, and this file is where the MEASUREMENTS are.
 *
 *  ── ① EUROPE WAS PAINTED WITH WARNINGS NOBODY WAS UNDER ─────────────────────────────
 *  MEASURED against feeds.meteoalarm.org, all 34 reachable members, one minute:
 *
 *      non-green bulletins                       2,990
 *          already EXPIRED                       2,546
 *          not yet STARTED                         327
 *          IN FORCE                                117
 *
 *      regions the relay offered                 1,158
 *          under something in force                183      ← 84.2 % over-paint
 *
 *  Austria 116 → 0 (every one a thunderstorm warning that expired on 2026-08-18, five days
 *  before it was measured), Poland 319 → 1, Switzerland 107 → 0, Czechia 25 → 0, Greece 16 → 0,
 *  Israel 33 → 2, Latvia 43 → 12, France 96 → 15, Spain 147 → 37.
 *
 *  MEASURED on production the same minute (`IntMapWorld.alerts()`): the layer drew **1,015 of
 *  those areas out of 1,811 units it was painting anywhere in the world** — i.e. 56 % of every
 *  warning on this map was a European region whose warning had been lifted or had not begun.
 *
 *  `feeds-<country>` is a ROLLING LOG of what a member has ISSUED. Every other summariser in
 *  supabase/functions/alerts-relay already knew that and tested the same field: `summariseCAP`,
 *  `summarisePAGASA` and `summariseSWIC` all drop `expires < now`. `summariseMeteoAlarm` never
 *  looked — so the part of this map with the most feeds behind it had the least truth in it.
 *
 *  ── ② 96.9 % OF THE NWS'S ALERTS WERE NEVER DRAWN ───────────────────────────────────
 *  MEASURED on `api.weather.gov/alerts/active` this round: **127 alerts in force, FOUR with a
 *  geometry.** The other 123 are filed against UGC zone codes with `geometry: null` — 6 Extreme
 *  Heat Warnings, 14 Heat Advisories, 11 Gale Warnings, 9 Air Quality Alerts, 68 Small Craft
 *  Advisories, 3 Fire Weather Watches, a Red Flag Warning. MEASURED on production the same
 *  minute: `PLACED.USA = [11, 135]`.
 *
 *  #R302 measured this at 201 of 281 (71.5 %) and wrote 「THIS DOES NOT DRAW THEM. Turning a UGC
 *  code into a shape needs the NWS zone index」, so the counter stopped lying and the map stayed
 *  blank. The share has since gone from 71.5 % to 96.9 %.
 *
 *  → the shapes come from NOAA's OWN published reference service (`nws_reference_map`): layer 8
 *  public forecast zones, 9 fire weather zones, 5 coastal marine, 6 offshore, 2 counties. It is
 *  an INDEX, exactly as Eurostat NUTS, 国土数値情報 and DataV are — what is in force, its rank and
 *  its wording still come from api.weather.gov and nowhere else.
 *  MEASURED end to end by running the SHIPPED resolver against the live services (x/nws-live.mjs
 *  in this round's worktree): 339 distinct zone codes in force, **339 of 339 resolved in 4.0 s**,
 *  572,659 B of geometry / 32,078 vertices. 116 zones at `maxAllowableOffset=0.004` weigh
 *  **80,503 B against 1,099,442 B raw**.
 *
 *  ⚠ THE KIND IS PART OF THE KEY. Fire zones and public zones share the UGC namespace — both
 *  answer to `state_zone='AK317'` — so a lookup that ignored `/zones/fire/` vs `/zones/forecast/`
 *  would hand a Red Flag Warning the public zone's outline.
 *  ⚠ AND THE BARE `geocode.UGC` LIST IS A FALLBACK, NOT A SECOND ENTRY. A fire-weather bulletin
 *  names its zones BOTH ways, so adding the UGC unconditionally produced a `z:` key beside the
 *  `f:` one — the same ground claimed twice, once as a zone the register cannot answer for.
 *  MEASURED before that line: 10 phantom keys out of 110, every one a declared fire zone.
 *
 *  ── ③ THE FRESHNESS INSTRUMENT WAS READING THE RELAY'S OWN CLOCK ────────────────────
 *  #R269 built `FEED_AT` because 「A FEED THAT STOPPED IS NOT A FEED THAT FAILED」 — a JMA endpoint
 *  frozen for eighty-three days answered 200 with valid JSON the whole time. MeteoAlarm and the
 *  WMO register were fed `fetchedAt`, which is when the RELAY read them, i.e. always now.
 *  MEASURED on production: `feedAgeH.meteoalarm = 0` while Luxembourg had published nothing for
 *  104 h, Belgium 94 h, the United Kingdom 82 h, Cyprus 78 h, Ireland 66 h.
 *
 *  ── ④ A SECOND REQUEST PER REFRESH WHOSE ANSWER COULD NEVER BE READ ─────────────────
 *  `loadDWD` fetched `dwd.de/DWD/warnungen/warnapp/json/warnings.json` alongside the WFS to get
 *  each district's Bundesland, and looked it up as `st[p.WARNCELLID]`. MEASURED against the live
 *  WFS: the property is **`GC_WARNCELLID`**, and no feature carries a bare `WARNCELLID` — so the
 *  lookup was `st['undefined']` on every row for as long as it has existed, the Bundesland never
 *  resolved, and the tap card printed the district name twice. The same response already carries
 *  **`GC_STATE`**. One request per ten-second tick, for nothing.
 *
 *  ── ⑤ TAIWAN: FOUR AGENCIES UNDER ONE NAME, AND ONE SEVERITY FOR FOUR BANDS ─────────
 *  MEASURED through the relay: the feed labelled 「CWA (Taiwan), via NCDR」 carried bulletins
 *  written by 農業部農村發展及水土保持署 ×31, 中央氣象署 ×17, 交通部公路局 ×10 and 高雄市政府 ×1.
 *  Road closures were painted at 「Extreme」 and a 「temporary car parks opened」 notice contributed
 *  45 「areas」 whose names were primary schools.
 *  And `xmlOne(cap,'event')` is the FIRST `<event>` in a file while `xmlAll(cap,'area')` is EVERY
 *  `<area>` in it, so every band of a multi-`<info>` bulletin was painted at the first band's rank:
 *  MEASURED, 降雨 came back as **286 areas all at 紅色/Extreme**; read per `<info>` it is
 *  **125 紅色 · 108 橙色 · 53 黃色**, which is what the CWA published.
 *  MEASURED after: `notHazard 15` (CAP category `Transport`), `ungraded 1` (CAP severity
 *  `Unknown`), `areaTotal 694 → 386`, and every row names the agency that wrote it.
 *
 *  ── ⑥ SILENT CAPS ──────────────────────────────────────────────────────────────────
 *  `AREA_CAP` truncates the relay's area list at 400 and the app counted `areas.length` as the
 *  denominator — so a truncated list looked like a complete one (#R320). MEASURED: Taiwan
 *  `areaTotal` 694 against `areas` 400, printed to the reader as 「286 / 400」.
 * ==========================================================================*/
const read = (p) => readLF(join(ROOT, p));
const WP = () => read('js/world-packs.js');
const RELAY = () => read('supabase/functions/alerts-relay/index.ts');

/* ── ① issued ≠ in force, and every summariser in the relay asks ────────────────────── */
test('R383 ① MeteoAlarm is filtered to what is IN FORCE, and the predicate is one function', () => {
  const s = RELAY();
  const code = codeOnly(s);

  assert.match(code, /function forceState\(info, sent, now\) \{/,
    'one predicate decides whether a CAP bulletin is in force');

  /* THE PREDICATE, RUN — this is a statement about the code that ships, not about a regex
     over it (#R317). It is lifted out of the file and executed. */
  const src = code.slice(code.indexOf('function forceState('));
  const body = src.slice(0, src.indexOf('\n}\n') + 3);
  const forceState = new Function('return ' + body)();
  const NOW = Date.parse('2026-08-23T18:00:00Z');
  const iso = (h) => new Date(NOW + h * 3600e3).toISOString();

  assert.equal(forceState({ expires: iso(-1) }, iso(-2), NOW), 'expired', 'a closed window is not in force');
  assert.equal(forceState({ expires: iso(+1), onset: iso(-1) }, iso(-1), NOW), 'live', 'an open window is');
  assert.equal(forceState({ expires: iso(+8), onset: iso(+4) }, iso(-1), NOW), 'upcoming', 'a window that has not opened is not');
  /* ⚠ IT FAILS OPEN, both ways — a feed that stops publishing its clock must not empty the map.
     MEASURED the same minute: `noExpires = 0` across all 34 members, so this is a guard. */
  assert.equal(forceState({}, '', NOW), 'live', 'no clock at all is not a reason to drop a warning');
  assert.equal(forceState({ expires: 'not a date' }, 'nor this', NOW), 'live', 'an unparseable clock is not a closed one');
  assert.equal(forceState({ onset: iso(-3) }, iso(-3), NOW), 'live', 'no expiry means still in force');

  /* …and it is what every summariser here uses, so the inconsistency this round found cannot
     come back one function at a time. FOUR call sites: MeteoAlarm, PAGASA, the CAP reader —
     and SWIC keeps its own `expires` test because its rows are not CAP `<info>` blocks. */
  assert.equal((code.match(/forceState\(/g) || []).length, 4,
    'the predicate is declared once and called from every summariser that reads a validity window');
  assert.match(code, /const fs = forceState\(pick, asent, now\);/, 'MeteoAlarm asks it');
  assert.match(code, /if \(Number\.isFinite\(exp\) && exp < now\) \{ expired\+\+; continue; \}/,
    'the WMO register still drops an expired bulletin');

  /* nothing is dropped silently — the counts travel with the summary (#R320) */
  assert.match(code, /expired, upcoming, noExpires, upcomingAreas: \[\.\.\.upMap\.values\(\)\]\.slice\(0, AREA_CAP\), newest \};/);
  /* a region is only 「upcoming」 when nothing is in force there NOW */
  assert.match(code, /for \(const k of areaMap\.keys\(\)\) upMap\.delete\(k\);/);
});

/* ── ③ the freshness instrument reads the AGENCY’s clock ─────────────────────────────── */
test('R383 ③ FEED_AT is never the relay’s own clock', () => {
  const code = codeOnly(WP());

  assert.match(code, /seenAt\('meteoalarm',d\.newest\); \} \}\);/, 'MeteoAlarm reports the newest CAP `sent` in the member’s feed');
  assert.match(code, /seenAt\('swic',d\.newest\); \} \}\);/, 'the WMO register’s per-member read does too');
  assert.match(code, /seenAt\('swic',j&&j\.newest\);/, '…and so does its scan');
  assert.match(code, /seenAt\(feed,j&&j\.newest\);/, '…and the CAP services');

  /* the defect, spelled: no feed may pass `fetchedAt` to the instrument */
  assert.equal((code.match(/seenAt\([^)]*fetchedAt/g) || []).length, 0,
    'nothing feeds the relay’s own read time to the agency-age instrument');

  /* and the relay has to supply it */
  const r = codeOnly(RELAY());
  assert.match(r, /if \(asent > newest\) newest = asent;/);
  assert.match(r, /if \(String\(pr\.sent \|\| ""\) > newestSent\) newestSent = String\(pr\.sent \|\| ""\);/);
  assert.match(r, /if \(sent > newestSent\) newestSent = sent;/);
});

/* ── ④ Germany: one response, one truth, one request ─────────────────────────────────── */
test('R383 ④ the DWD’s Bundesland comes out of the WFS that already answered', () => {
  const s = WP();
  const code = codeOnly(s);

  assert.match(code, /const adm=String\(p\.GC_STATE\|\|''\)\|\|areaN;/,
    'the state is read from the field the WFS actually publishes');
  assert.equal((code.match(/WARNCELLID/g) || []).length, 0,
    'the property that never existed is gone from the code');
  assert.equal((code.match(/dwdStates/g) || []).length, 0,
    'and so is the second request it was fetched for');
  assert.equal((code.match(/warnapp\/json\/warnings\.json/g) || []).length, 0,
    'the DWD is one request per refresh');
  /* the note that says why survives in the prose, which is where a removed thing belongs */
  assert.match(s, /GC_WARNCELLID/, 'the measurement that explains the removal is still written down');
});

/* ── ⑤ Taiwan: per <info>, per agency, and only hazard warnings ──────────────────────── */
test('R383 ⑤ a CAP bulletin is read per <info>, and a road closure is not a weather warning', () => {
  const r = RELAY();
  const code = codeOnly(r);

  assert.match(code, /function capInfos\(cap\) \{/, 'the unit of work is the <info> block');
  assert.match(code, /for \(const info of capInfos\(cap\)\) \{/);
  /* every field that varies per band is read from the band, not from the file */
  for (const f of ['event', 'severity', 'expires', 'onset', 'effective', 'headline', 'category']) {
    assert.match(code, new RegExp('xmlOne\\(info, "' + f + '"\\)'), f + ' is read from the <info> block');
  }
  assert.match(code, /for \(const a of xmlAll\(info, "area"\)\)/, 'and so are its areas');
  /* the file-level fields stay file-level */
  assert.match(code, /const sender = unesc\(xmlOne\(cap, "senderName"\)\) \|\| unesc\(xmlOne\(cap, "sender"\)\);/);

  /* what counts as a hazard is CAP's own vocabulary, not a list of Taiwanese bodies */
  assert.match(code, /const CAP_HAZARD = \/\^\(Met\|Geo\|Fire\|Env\|Health\)\$\/i;/);
  assert.match(code, /if \(cat && !CAP_HAZARD\.test\(cat\)\) \{ drop\.category\+\+; continue; \}/);
  assert.match(code, /if \(\/\^unknown\$\/i\.test\(severity\)\) \{ drop\.ungraded\+\+; continue; \}/);
  /* both are counted, so neither filter is silent */
  assert.match(code, /notHazard: drop\.category, ungraded: drop\.ungraded, indexTotal,/);
  assert.match(code, /senders: \[\.\.\.senders\.entries\(\)\]/, 'and every distinct author is reported');

  /* the label names the aggregator rather than one of the four bodies in it (#R352) */
  assert.match(code, /source: "NCDR \(Taiwan\) — CWA and the Soil & Water Conservation Agency"/);
  /* …and the app prefers the label the data carries over its own constant */
  assert.match(codeOnly(WP()), /if\(CAPFEED\[feed\]&&capRec\[feed\]&&capRec\[feed\]\.source\) return String\(capRec\[feed\]\.source\);/);
  assert.match(codeOnly(WP()), /adm:String\(e\.by\|\|\(a\.by&&a\.by\[0\]\)\|\|''\)\|\|String\(a\.name\|\|''\),/);
});
}

/* ══════════ from tests/r499-checks.test.mjs — 3 of its 20 test(s) ══════════ */
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
   ⑩ js/world-packs.js — the warning rotation, RUN against a feed that answers nothing
   ══════════════════════════════════════════════════════════════════════════════════════════════
   WHAT --attribute FOUND ONE FRAME DEEPER. The 6,090 calls of ⑨ arrived through `panel.open()`,
   3,045 times in eight seconds, and the reason is here: both rotations order by a clock that only
   a SUCCESSFUL read writes, and the batch's own finaliser calls the pump again. A feed that fails
   therefore never advances anything, the next `maNext()` returns the same countries, and the loop
   turns at microtask speed — with a full panel re-render on every turn, because each `.catch` ends
   with `showPanel()`. This is what a phone in a tunnel does. */
/* ⚠ `failFor` is a HARD CAP, not a scenario knob. Against the pre-#R499 source this rig's feed
   never stops failing and the pump never stops re-firing, so an unbounded fake would hang the test
   runner instead of failing it — and a counter-proof you cannot run is not a counter-proof (#R498).
   After the cap the feed answers, which terminates the old loop and leaves the count as the finding. */
function pumpRig({ nCountries = 30, failFor = 400 } = {}) {
  const src = CODE('js/world-packs.js');
  const cut = (marker, kind) => {
    const i = src.indexOf(marker);
    assert.ok(i > 0, `js/world-packs.js no longer contains ${JSON.stringify(marker)}`);
    return marker.startsWith('function')
      ? src.slice(i, src.indexOf('{', i)) + balanced(src, src.indexOf('{', i), '{', '}')
      : kind;
  };
  const r0 = src.indexOf('const RETRY_MS=');
  const r1 = src.indexOf('let swicMetaBusy', r0);
  assert.ok(r0 > 0 && r1 > r0, 'the #R499 back-off block is no longer where this check cuts it out');
  const backoff = src.slice(r0, r1);

  const calls = [];
  let clock = 1_000_000;
  const g = { Math, console: { warn() { } }, Object, Array, Date: { now: () => clock }, String, Number, isFinite };
  g.window = g;
  vm.createContext(g);
  const ISO = Array.from({ length: nCountries }, (_, i) => 'C' + i);
  vm.runInContext(`
    const MA = {}; ${JSON.stringify(ISO)}.forEach(k => { MA[k] = 1; });
    const maData = {}, maAt = {}, maAsked = [];
    const maPend = Object.create(null), swicPend = Object.create(null);
    const MIN_AGE_MS = 15000, MA_PER_TICK = 6, MA_SLOTS = 6, COLD_CALLS = 10;
    const FEED_STATE = {};
    let on = true, maBusy = 0;
    function inViewISO(){ return false; }
    function viewFirst(list){ const a=[],b=[]; list.forEach(k=>{ (inViewISO(k)?a:b).push(k); }); return a.concat(b); }
    function feedOK(){} function publish(){} function showPanel(){ globalThis.__renders++; }
    const panel = { shown: () => true };
    const maCold = () => Object.keys(MA).some(k => !maData[k]);
    function loadMA(b){
      globalThis.__calls.push(b.slice());
      if (globalThis.__calls.length > globalThis.__failFor || globalThis.__warm) {
        b.forEach(k => { maData[k] = 1; maAt[k] = Date.now(); });
        return Promise.resolve();
      }
      /* ⚠ A FAILING RE-READ LEAVES THE DATA WHERE IT WAS. That is the shape 'does it hold data'
         got wrong: a country read successfully a minute ago still holds data when today's read
         fails, so only its SUCCESS CLOCK can say whether this read arrived. */
      return Promise.reject(new Error('offline'));
    }
    ${backoff}
    ${cut('function maNext(n){')}
    ${cut('function pumpMA(){')}
    globalThis.__pump = pumpMA;
    globalThis.__tick = (ms) => { globalThis.__clock(ms); };
    globalThis.__state = () => ({ busy: maBusy, tries: Object.keys(maTry).length });
  `, g, { filename: 'world-packs-pump.js' });
  g.__calls = calls; g.__failFor = failFor; g.__renders = 0; g.__warm = false;
  g.__clock = (ms) => { clock += ms; };
  return { g, calls, advance: (ms) => { clock += ms; }, renders: () => g.__renders, warm: (v) => { g.__warm = v; } };
}
const drain = async (n = 3000) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

test('R499 ⑩ a warning feed that answers nothing costs ONE round of attempts, not a hot loop', async () => {
  const rig = pumpRig({ nCountries: 30 });
  rig.g.__pump();
  await drain();
  assert.equal(rig.calls.length, 5,
    `the rotation issued ${rig.calls.length} batches for 30 countries that all failed — 5 batches of 6 is one `
    + 'pass; anything more is the pump re-firing from its own finaliser on countries whose clock never moved');
  assert.ok(rig.renders() <= 5, `the panel was re-rendered ${rig.renders()} times by one failed pass`);

  /* nothing more happens while the back-off holds … */
  rig.g.__pump(); await drain();
  assert.equal(rig.calls.length, 5, 'a pump inside the back-off window asked again anyway');
  /* … and the country IS asked again once it expires — a back-off is not a give-up */
  rig.advance(2500);
  rig.g.__pump(); await drain();
  assert.ok(rig.calls.length > 5, 'the rotation never retried after the back-off expired');
});

test('R499 ⑩ a country that answered YESTERDAY and fails TODAY does not spin either', async () => {
  const rig = pumpRig({ nCountries: 12 });
  /* every country warm and read once */
  rig.warm(true);
  rig.g.__pump(); await drain();
  const warmCalls = rig.calls.length;
  assert.ok(warmCalls >= 2, 'the warm pass must have read them');

  /* the feed goes away. `maData` still holds yesterday's answer for all twelve, and the MIN_AGE_MS
     gate has expired — so "does it hold data" would clear every back-off and re-enter the loop. */
  rig.warm(false);
  rig.advance(60_000);
  rig.g.__pump(); await drain();
  const n = rig.calls.length - warmCalls;
  assert.ok(n > 0 && n <= 2, `${n} batches for 12 warm countries whose re-read failed — the loop is back`);
});

test('R499 ⑩ …and a feed that recovers goes straight back to the normal rotation', async () => {
  const rig = pumpRig({ nCountries: 12, failFor: 1 });   /* the first batch fails, the rest answer */
  rig.g.__pump();
  await drain();
  /* 12 countries, 6 per batch: batch 1 fails, batch 2 succeeds; the failed six come back after the
     first back-off step and succeed then. Nothing spins in between. */
  assert.ok(rig.calls.length >= 2 && rig.calls.length <= 4,
    `${rig.calls.length} batches for 12 countries with one failure`);
  rig.advance(2500);
  rig.g.__pump(); await drain();
  const flat = rig.calls.flat();
  assert.equal(new Set(flat).size, 12, 'not every country was read once the feed came back');
});
}
