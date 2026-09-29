/* ============================================================================
 *  THE WARNINGS LAYER — alerts-relay and the in-force map
 * ----------------------------------------------------------------------------
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The in-force map is drawn inside js/world-packs.js's
 *    closure, and alerts-relay's parsers are module-private in index.ts — only the Deno.serve handler
 *    is reachable, which the #R801 section below RUNS. The rest reads the source.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { assertUnreadNeverGreys } from './wash-tier.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r269-checks.test.mjs (the whole file) ═══
    IntMap · #R269 source checks — the warnings layer told the truth about Japan
    「全く警報レイヤーが機能していない。気象庁とは全く違うデタラメが表示される」

    Two independent defects produced that, and both were MEASURED before anything was changed:
      · the endpoint had been frozen since 2026-05-28 (measured on 2026-08-19) while answering 200
        with valid JSON of the expected shape;
      · the code table was written from memory and, from code 10 up, named the wrong hazard AND the
        wrong rank — 雷注意報 was drawn as a 洪水警報, over 900 areas at once.
    The assertions below are about the PROPERTIES that make each impossible again, not about the
    literals this round happened to write. */
{
/* ⚠ (#R267) count in CODE, not in comments — this file's own prose names the things it checks for */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));

/* the table, parsed out of the source so the test reads what the app reads */
function jmaCodes() {
  const s = WP();
  const m = /const JMA_CODE=\{([\s\S]*?)\};/.exec(s);
  assert.ok(m, 'the JMA code table must exist');
  const out = {};
  for (const e of m[1].matchAll(/'(\d{2})':\['([a-z_]+)',(\d+)\]/g)) out[e[1]] = [e[2], +e[3]];
  return out;
}

/* ── ① the endpoint ────────────────────────────────────────────────────────────────────────── */
test('R269 ① the JMA feed is the live one the JMA itself reads, and the frozen one is gone', () => {
  const s = WP();
  assert.match(s, /const JMA_R8='https:\/\/www\.jma\.go\.jp\/bosai\/warning\/data\/r8\/map\.json'/,
    'the live r8 bulletin list must be the source');
  assert.doesNotMatch(s, /bosai\/warning\/data\/warning\/map\.json/,
    'the endpoint that had been frozen for 83 days must not be read anywhere');
  assert.match(s, /fetch\(JMA_R8,\{cache:'no-store'\}\)/, '…and it is not served from the HTTP cache');
});

test('R269 ① the state is the newest bulletin per office, not the union of the file', () => {
  const s = WP();
  const i = s.indexOf('async function loadJMA()');
  const body = s.slice(i, s.indexOf('async function loadNWS()'));
  assert.match(body, /newest\[k\]\|\|t>String\(newest\[k\]\.reportDatetime\|\|''\)/, 'newest wins per office');
  assert.match(body, /jmaSuperseded=list\.length-kept\.length/, 'what was dropped must be counted');
  assert.match(body, /publishingOffice/, 'the grouping key is the issuing office');
  /* the r8 shape, not the old one */
  assert.match(body, /class10Items/, 'class10 items');
  assert.match(body, /class20Items/, 'class20 items');
  assert.doesNotMatch(body, /areaTypes/, 'the old shape must be gone');
});

test('R269 ① a feed whose newest bulletin is old is refused, not presented as «in force now»', () => {
  const s = WP();
  assert.match(s, /const JMA_MAX_AGE_H=(\d+)/, 'the age ceiling must exist');
  const h = +/const JMA_MAX_AGE_H=(\d+)/.exec(s)[1];
  assert.ok(h > 0 && h <= 24 * 7, `the ceiling is ${h} h — it must be a real bound`);
  const i = s.indexOf('async function loadJMA()');
  const body = s.slice(i, s.indexOf('async function loadNWS()'));
  assert.match(body, /if\(!\(jmaAgeH!=null&&jmaAgeH<JMA_MAX_AGE_H\)\)[\s\S]{0,140}throw/,
    'past the ceiling loadJMA must throw rather than return stale warnings');
});

/* ── ② the code table is the JMA's, and the rank comes from its level ──────────────────────── */
test('R269 ② the rank is a function of the JMA level and of nothing else', () => {
  const s = WP();
  /* ⚠ (#R273) the function was renamed when every agency gained one — `normOf(feed,lv)` is the ONE
     place a rank is normalised, and the JMA branch is still a function of the level and nothing
     else. What #R269 was about is that a rank may never come from a code RANGE. */
  assert.match(s, /if\(feed==='jma'\) return lv>=50\?4:lv>=40\?3:lv>=30\?2:1;/,
    'the JMA rank must come from the level');
  assert.match(s, /function normOf\(feed,lv\)/, 'and there must be exactly one normaliser');
  /* the old rule decided the rank from a CODE RANGE, which is what painted every 注意報 red */
  assert.doesNotMatch(s, /n>=19&&n<=27/, 'no rank may be inferred from a code range again');
  assert.doesNotMatch(s, /const JMA_KIND=/, 'the invented table must be gone');
});

test('R269 ② every code carries an element and one of the JMA’s four levels', () => {
  const codes = jmaCodes();
  const n = Object.keys(codes).length;
  assert.ok(n >= 30, `expected the JMA table, found ${n} codes`);
  const elems = new Set();
  for (const [c, [e, lvl]] of Object.entries(codes)) {
    assert.ok([20, 30, 40, 50].includes(lvl), `code ${c} has level ${lvl}, which the JMA does not use`);
    elems.add(e);
  }
  assert.ok(elems.size >= 16, `expected the JMA’s elements, found ${elems.size}`);
  /* every element that has more than one level must use a DIFFERENT code for each — the old table
     reused one hazard name across levels and lost the distinction */
  const byElem = {};
  for (const [c, [e, lvl]] of Object.entries(codes)) (byElem[e] = byElem[e] || []).push([c, lvl]);
  for (const [e, rows] of Object.entries(byElem)) {
    const lv = rows.map((r) => r[1]);
    assert.equal(new Set(lv).size, lv.length, `${e} has two codes at the same level: ${JSON.stringify(rows)}`);
  }
});

test('R269 ② the codes the JMA’s own headlines name are decoded the way it names them', () => {
  const codes = jmaCodes();
  /* MEASURED against the JMA's own `headlineText` on the live feed:
       稚内 「宗谷地方では、強風に注意してください。」   → 15
       札幌 「…落雷に注意してください。」                → 14
     and against the table published on the JMA's warning page for the rest. */
  const expect = {
    '10': ['rain', 20], '03': ['rain', 30], '33': ['rain', 50],
    '14': ['thunder', 20], '15': ['wind', 20], '05': ['wind', 30],
    '16': ['wave', 20], '07': ['wave', 30], '19': ['tide', 20], '08': ['tide', 30],
    '13': ['wind_snow', 20], '02': ['wind_snow', 30], '12': ['snow', 20], '06': ['snow', 30],
    '17': ['snow_melting', 20], '20': ['fog', 20], '21': ['dry', 20], '22': ['avalanche', 20],
    '25': ['ice_accretion', 20], '26': ['snow_accretion', 20], '09': ['landslide', 30],
  };
  for (const [c, want] of Object.entries(expect)) {
    assert.deepEqual(codes[c], want, `code ${c} must be ${want.join('/')}, found ${JSON.stringify(codes[c])}`);
  }
  /* the three codes the old table invented are not in the JMA's scheme */
  for (const c of ['04', '18', '27']) assert.equal(codes[c], undefined, `code ${c} is not a JMA warning code`);
});

test('R269 ② the flood-forecast codes are NOT in this table — they would collide', () => {
  const codes = jmaCodes();
  /* the JMA's 指定河川洪水予報 table uses 20/21/22 for 氾濫注意報 and 30/31/40/41/51/53 above it, and
     it is published in a different file. Mixing them relabels every fog advisory in Japan. */
  for (const c of ['30', '31', '40', '41', '51', '53']) {
    assert.equal(codes[c], undefined, `flood-forecast code ${c} must not be in the warning table`);
  }
  assert.deepEqual(codes['20'], ['fog', 20], '20 is 濃霧注意報 in the warning table, not 氾濫注意報');
  assert.deepEqual(codes['22'], ['avalanche', 20], '22 is なだれ注意報 in the warning table');
});

/* ── ③ every feed carries its own clock ────────────────────────────────────────────────────── */
test('R269 ③ every warning feed records the newest timestamp in its own payload', () => {
  const s = WP();
  assert.match(s, /const FEED_AT=\{\}/, 'the per-feed clock must exist');
  assert.match(s, /const seenAt=\(k,t\)=>/, '…and one way to write to it');
  /* (#R273) gdacs left the list with the feed itself; cwa / metservice joined it */
  for (const k of ['jma', 'nws', 'eccc', 'cma', 'bom', 'hko', 'inmet', 'meteoalarm']) {
    assert.ok(new RegExp("seenAt\\('" + k + "'").test(s), `${k} records no timestamp of its own`);
  }
  /* ⚠ the CMA writes 2026/08/19 17:22 — slashes, which Date.parse answers NaN for, so the first
     version of this instrument left the one feed it exists for without a clock at all */
  const cma = /seenAt\('cma',[^;]*/.exec(s);
  assert.ok(cma, 'the CMA clock must be recorded');
  assert.ok(cma[0].includes(".split('/').join('-')"), 'the CMA slashes must be replaced: ' + cma[0]);
  assert.ok(cma[0].includes('+08:00'), 'and its zone stated: ' + cma[0]);
  assert.match(s, /const ageH=\(k\)=>/, 'the age must be derived from it');
  assert.match(s, /ageTxt\(k\)/, '…and printed beside the service');
});

test('R269 ③ «reachable» and «still running» are two different dots', () => {
  const s = WP();
  /* ⚠⚠ (#R273) ONE DOT BECAME FOUR GRADES — 「更新時間31.1hと2minが同列」. #R269 asked for «reachable»
     and «still running» to be different; the reader then pointed out that 31 h and 2 min were still
     the same green. Fresh / Delayed / Stale / Error, and the thresholds are named constants. */
  assert.match(s, /const FRESH_H=(\d+), DELAY_H=(\d+)/, 'the freshness thresholds must exist');
  const th = /const FRESH_H=(\d+), DELAY_H=(\d+)/.exec(s);
  assert.ok(+th[1] > 0 && +th[1] < +th[2], `fresh ${th[1]} h must be inside delayed ${th[2]} h`);
  /* MEASURED live: INMET's newest item was 33.5 h old while it was current, so a feed at that age
     is 「Delayed」 — a word about the FEED — and never an error about the warnings. */
  assert.ok(+th[2] >= 24, `the delayed band ends at ${th[2]} h — a multi-day warning must not read as broken`);
  assert.match(s, /function grade\(k\)/, 'the grade must be computed from the state AND the age');
  assert.match(s, /const GRADE_COL=\{/, '…and each grade must have its own colour');
});

/* ── ④ 追記: the relay-backed loaders, and what a «newest timestamp» may be ─────────────────── */
test('R269 ④ a timestamp in the future is refused as evidence of freshness', () => {
  const s = WP();
  assert.match(s, /if\(v>Date\.now\(\)\+60000\) return;/,
    'a validity window that ends tomorrow must not make a feed look newer than now');
  /* ⚠⚠⚠ (#R383) THE RELAY'S OWN READ TIME IS NOT A CLOCK THIS INSTRUMENT CAN USE.
     This round asserted `seenAt('meteoalarm', d.fetchedAt)`, on the reasoning that MeteoAlarm's rows
     carry `onset`/`expires` — a validity WINDOW, normally in the future — so the only timestamp the
     relay could vouch for was its own. The reasoning about the window is right; the conclusion made
     `FEED_AT.meteoalarm` equal to `Date.now()` on every read, which is exactly the blind spot #R269
     exists for (「A FEED THAT STOPPED IS NOT A FEED THAT FAILED」). MEASURED on production:
     `feedAgeH.meteoalarm = 0` while Luxembourg had published nothing for 104 h, Belgium 94 h, the
     United Kingdom 82 h, Cyprus 78 h and Ireland 66 h.
     There IS a third timestamp and it is neither of those two: the CAP bulletin's own `sent`, which
     is what every other feed here reports. The relay now folds it to `newest` per member. */
  assert.match(s, /seenAt\('meteoalarm',d\.newest\)/, 'MeteoAlarm reports the agency’s own issue time');
  assert.match(s, /seenAt\('swic',d\.newest\)/, '…and so does the WMO register');
  assert.equal((codeOnly(s).match(/seenAt\([^)]*fetchedAt/g) || []).length, 0,
    'and nothing feeds the relay’s read time to the agency-age instrument');
  assert.match(codeOnly(read('supabase/functions/alerts-relay/index.ts')), /if \(asent > newest\) newest = asent;/,
    '…which the relay must actually send');
  /* `fetchedAt` is still shipped — it answers a different question (「IntMap はいつ取得したか」, #R293)
     and the tap card prints both. What changed is which one the freshness grade reads. */
  assert.match(codeOnly(read('supabase/functions/alerts-relay/index.ts')), /fetchedAt: new Date\(\)\.toISOString\(\)/,
    'and the relay still states when IT read the service');
});

test('R269 ④ the two relay-backed loaders run one call at a time', () => {
  const s = WP();
  /* (#R273) …and the CAP-index services joined them, so the flags are a set rather than two names */
  /* ⚠ (#R275) the set grew again (the WMO register), so the assertion names the FLAGS rather than
     the declaration line — a new feed with its own guard must not read as a regression. */
  /* ⚠⚠ (#R277) THE TWO ROTATING FEEDS COUNT INSTEAD OF LATCHING, AND THIS CHECK PINNED THE LATCH.
     A boolean over a `Promise.all` of every batch means the SLOWEST country decides when the next
     batch may start — MEASURED, the oldest MeteoAlarm country reached 108 s under three batches
     held that way, WORSE than the two it replaced. `maBusy`/`swicBusy` are the NUMBER of batches in
     flight now, bounded by MA_CALLS / SWIC_CALLS, and a country one batch holds cannot be claimed
     by another (`maPend`/`swicPend`). What #R269 is about — a bound on concurrent relay calls per
     feed, released on BOTH paths — is asserted on the form that delivers it. */
  for (const flag of ['cmaBusy', 'phlBusy'])
    assert.match(s, new RegExp('let [^\\n]*\\b' + flag + '=false'), `${flag} must exist`);
  for (const flag of ['maBusy', 'swicBusy'])
    assert.match(s, new RegExp('let [^\\n]*\\b' + flag + '=0'), `${flag} must be a count`);
  assert.match(s, /capBusy=\{\}/, 'the CAP-index services share one keyed flag');
  assert.match(s, /if\(!cmaBusy\)\{ cmaBusy=true;/, 'CMA is guarded');
  assert.match(s, /function pumpMA\(\)\{ if\(!on\) return;/, 'MeteoAlarm has one dispatcher');
  assert.match(s, /while\(maBusy<MA_CALLS\)\{/, '…bounded by its own slot count');
  assert.match(s, /function pumpSWIC\(\)\{ if\(!on\|\|!swicMeta\.at\) return;/, 'the register has one too');
  assert.match(s, /while\(swicBusy<SWIC_CALLS\)\{/, '…bounded the same way');
  assert.match(s, /if\(capBusy\[k\]\) return; capBusy\[k\]=true;/, 'every CAP-index service is guarded');
  assert.match(s, /\.then\(\(\)=>\{ capBusy\[k\]=false; \}\)/, '…and clears its flag on both paths');
  /* and each one must release on BOTH paths, or the feed stops for the session */
  const iC = s.indexOf('if(!cmaBusy)');
  const cma = s.slice(iC, s.indexOf('if(!maMetaBusy)', iC) > 0 ? s.indexOf('if(!maMetaBusy)', iC) : s.indexOf('pumpMA();', iC));
  assert.match(cma, /\.then\(\(\)=>\{ cmaBusy=false; \}\)/, 'CMA clears its flag after success AND failure');
  assert.match(s, /maBusy--; b\.forEach\(k=>\{ delete maPend\[k\]; \}\);/,
    'a MeteoAlarm batch releases its slot and its countries on both paths');
  assert.match(s, /swicBusy--; b\.forEach\(k=>\{ delete swicPend\[k\]; \}\);/, '…and so does the register');
  assert.match(s, /!maPend\[k\]/, 'a country in flight is not claimed twice');
  assert.match(s, /!swicPend\[k\]/, '…in either rotation');
  /* …and a country read more recently than the relay's own cache is not asked again: the same
     bytes would come back, so it is cost with no answer in it. */
  assert.match(s, /const MIN_AGE_MS=(\d+);/, 'there is a floor on how often one country is asked');
  const floor = +(/const MIN_AGE_MS=(\d+);/.exec(s) || [])[1];
  const cacheS = +(/max-age=(\d+), s-maxage=/.exec(read('supabase/functions/alerts-relay/index.ts')) || [])[1];
  assert.ok(floor > 0 && floor <= cacheS * 1000, `the floor is ${floor} ms against a ${cacheS}s edge cache`);
  assert.match(s, /now-maAt\[k\]>=MIN_AGE_MS/, '…and the rotation obeys it');
  assert.match(s, /now-swicAt\[k\]>=MIN_AGE_MS/, '…in both rotations');
});

test('R269 ④ the relay gives a slow upstream a real budget and one retry', () => {
  const t = codeOnly(read('supabase/functions/alerts-relay/index.ts'));
  /* ⚠ «STATES A BUDGET» IS THE PROPERTY, and the call that enforces it is shared now: both fetches go
     through _shared/relay-guard.js's fetchGuarded(), which takes the budget as `timeoutMs`. Grepping
     for `AbortSignal.timeout(<number>)` was grepping for one implementation of it. */
  const budgets = [...t.matchAll(/TIMEOUT_MS = (\d+)/g)].map((x) => +x[1]);
  assert.ok(budgets.length >= 2, 'both upstream fetches must state a budget');
  assert.match(t, /timeoutMs: MA_TIMEOUT_MS/, 'the MeteoAlarm fetch does not use its budget');
  assert.match(t, /timeoutMs: U_TIMEOUT_MS/, 'the ?u= fetch does not use its budget');
  assert.match(read('supabase/functions/_shared/relay-guard.js'), /AbortSignal\.timeout\(timeoutMs\)/,
    'the shared guard does not actually abort');
  /* MEASURED: the CMA list returned 502 after exactly 20,140 ms from the edge while the same URL
     answered in 1.0 s from a laptop — a budget shorter than the upstream's bad days turns an
     available feed into 「取得不可」 at random. */
  assert.ok(Math.min(...budgets) >= 40000, `the smallest budget is ${Math.min(...budgets)} ms`);
  /* ⚠ (#R277) THE LOOP CONDITION HAD TO CHANGE, AND THIS CHECK PINNED THE OLD ONE. `!r` ends the
     loop as soon as `fetchGuarded` RESOLVES — which it does for an upstream 5xx, with `ok:false`
     — so a failed status was never retried and the CMA disappeared from the map on a hiccup
     (MEASURED: 「cma 502」 in the console, the same url answering 200 a second later). What #R269
     is about — a real budget and one retry — is asserted on the condition that delivers it. */
  assert.match(t, /for \(let i = 0; i < 2 && !\(r && r\.ok\); i\+\+\)/, 'and one retry, on a failed STATUS too');
});
}

/* ═══ from tests/r273-checks.test.mjs (tests #1, #2, #3, #4, #5, #6, #7, #8, #9, #16 of 16) ═══
    #R273 — source-level checks
    What this round was asked for, and what each test holds:

      ① 「GDACSを完全に撤廃しろ」「ソースは一国一ソース」「対応国も増やせ」
      ② 「日本では気象庁の塗分けに対応させろ。また、市町村単位で塗り分けろ」
      ③ 「まだ対応していない国は灰色斜線で、発令されていないだけの地域は灰色に」
      ④ 「各国の警報階級を同じ紫・赤・黄に押し込んでいる」→ 各国公式配色 / IntMap換算の切替
      ⑤ 「何の警報なのか地図から分からない」→ 種別を区域に文字で、重複は +N
      ⑥ 「更新時間31.1hと2minが同列」→ Fresh / Delayed / Stale / Error
      ⑦ 「一覧が取得先一覧になっている」→ パネルは「どこで何が」から始まる
      ⑧ 「これ長すぎ」→ 出典の一文
      ⑨ 「なにか形がおかしい×をやめろ」→ アプリ全体で1つの ×
      ⑩ 「セルビア語系言語は似た色味に」
      ⑪ 「水流シミュレーションの解像度が低すぎる」「一回きりの水源、再生できない」
      ⑫ 「大規模にレイヤーカテゴリ分類を再編しろ」→ 見出しの名前が中身と一致する

    ⚠ EVERY «X is gone» ASSERTION IS WRITTEN IN THE SYNTAX X WAS WRITTEN IN, and against the source
    with its comments stripped — the prose that RECORDS a removal is not evidence against it. That
    is #R266's own lesson, and it has cost this repo a round twice. */
{
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));

/* ── ① one country, one national service, and no global event feed ─────────────────────────── */
test('R273 ① GDACS is gone, and every country the layer speaks about has its own agency', () => {
  const s = WP();
  for (const form of ['loadGDACS', 'gdacsapi', 'GDACSCOL', 'GDACSWASH', 'GDACS_TIER', 'gCountries', "'gdacs'"]) {
    assert.ok(!s.includes(form), 'GDACS must be gone: ' + form);
  }
  const feeds = /const FEEDS=\{([\s\S]*?)\};/.exec(s);
  assert.ok(feeds, 'the country → service table must exist');
  /* one country appears once: a second entry would silently win and fetch twice */
  const isos = [...feeds[1].matchAll(/([A-Z]{3}):'/g)].map((m) => m[1]);
  assert.equal(new Set(isos).size, isos.length, 'a country may be routed to exactly one service');
  const ma = /const MA=\{([\s\S]*?)\};/.exec(s);
  assert.ok(ma, 'the MeteoAlarm table must exist');
  for (const iso of isos) assert.ok(!new RegExp('\\b' + iso + ':').test(ma[1]),
    iso + ' has its own service and must not ALSO be pulled from the relay');
  /* 「対応国も増やせ」 — the two added this round, each through the one CAP-index reader */
  assert.ok(isos.includes('TWN') && isos.includes('NZL'), 'Taiwan and New Zealand must be wired');
  assert.match(s, /const CAPFEED=\{/, 'the CAP-index services must share one table');
  assert.match(s, /async function loadCAP\(feed\)/, '…and one loader, so a country costs one entry');
  const relay = codeOnly(read('supabase/functions/alerts-relay/index.ts'));
  assert.match(relay, /const CAPSRC\s*=\s*\{/, 'and the relay must hold the index URLs in one table');
  assert.match(relay, /alerts\.ncdr\.nat\.gov\.tw/, 'Taiwan’s CAP aggregator');
  assert.match(relay, /alerts\.metservice\.com/, 'New Zealand’s CAP index');
});

/* ── ② Japan, at the unit the JMA issues at ────────────────────────────────────────────────── */
test('R273 ② Japan is drawn at the municipality, from the JMA’s own codes', () => {
  const s = WP();
  assert.match(s, /const JP_MUNI_URL=/, 'the municipal boundary set must be named once');
  assert.match(s, /N03_007/, '…and keyed on the JIS code the file publishes');
  assert.match(s, /function jpShape\(idx,code\)\{ const jis=String\(code\)\.slice\(0,5\);/,
    'a class20 code’s first five digits ARE the JIS code');
  /* ⚠ (#R302) THIS FIXED THE ARITHMETIC, NOT THE INVARIANT. It read
       `if(/00$/.test(jis))` — 「a designated city files as PP100 and its wards as PP101…PP199」 —
     which is true of the FIRST designated city in a prefecture and of no other, so 横浜市's shape
     took in 川崎市 and 相模原市 and those cities' own warnings could never be placed at all.
     The invariant it was reaching for is what is asserted now: a designated city resolves to the
     union of ITS OWN wards, the grouping is READ out of the boundary file rather than guessed from
     the digits, and the resolver says which ward codes it consumed. */
  assert.match(s, /function jpWards\(idx\)\{/, 'the ward grouping must be its own, named thing');
  assert.match(s, /idx\[jis\]&&idx\[jis\]\.city/, '…built from the city each row says it belongs to');
  assert.match(s, /\/市\$\/\.test\(String\(p\.N03_003\)\)/,
    '…and a row is a ward because its N03_003 is a 市, not because of its code');
  assert.ok(!/if\(\/00\$\/\.test\(jis\)\)/.test(s),
    'the PP100+1…PP100+99 range scan must not come back — it swallowed the next city');
  assert.match(s, /geom:multi\(parts\),used\}/, '…and must say WHICH ward codes it consumed');
  /* ⚠ or every consumed ward is emitted again as a «nothing in force» grey, LATER in the same
     array, i.e. painted over the warning it was just given */
  assert.match(s, /\(s\.used\|\|\[\]\)\.forEach\(k=>\{ drawn\[k\]=1; \}\)/, 'the consumed codes mark the shape drawn');
  assert.match(s, /hot\.forEach\(f=>out\.push\(f\)\)/, 'the grey goes in FIRST and the warned units on top');
  assert.match(s, /jmaUnit='muni'/, 'and the panel must be able to say which unit is on screen');
});

test('R273 ② the JMA’s own colours, read from the JMA’s own page', () => {
  const s = WP();
  const m = /jma:\{([^}]*)\}/.exec(s);
  assert.ok(m, 'the JMA palette must exist');
  const pal = {};
  for (const e of m[1].matchAll(/(\d+):'([^']*)'/g)) pal[e[1]] = e[2];
  assert.deepEqual(pal, { 20: '#f2e700', 30: '#ff2800', 40: '#aa00aa', 50: '#0c000c' },
    'these are `.contents-levelNN` on jma.go.jp/bosai/warning — not a palette chosen here');
  /* ⚠ (#R293) 「灰色塗の色味は少しだけ白に近づけろ」 — the grey is no longer the JMA's own #c8c8cb.
     What #R273 was pinning is that 「発表なし」 has ONE colour and it is declared once; the value is
     the reader's to choose, so this asserts the declaration rather than the hex. */
  assert.match(s, /const NONE_COL='#[0-9a-f]{6}';/, '…and 「発表なし」 is one declared colour');
  assert.equal((s.match(/const NONE_COL=/g) || []).length, 1, '…declared exactly once');
  assert.ok(!/'#c8c8cb'/.test(s), 'and it is no longer the JMA\'s own grey (#R293)');
});

/* ── ③ 「警報なし」と「データなし」 are different states and look different ─────────────────── */
test('R273 ③ a country with no feed is hatched, a quiet one is grey, and they are not the same', () => {
  const s = WP();
  /* ⚠ (#R288) …and it is not only the feed table any more: a service whose own polygon lands in a
     country with no feed of its own covers that country, learned from the geometry rather than
     written down (`LEARNED`). Still not a hand-written list, which is what #R273 was asserting. */
  assert.match(s, /const supported=\(c\)=>!!\(FEEDS\[c\]\|\|LEARNED\[c\]\);/, 'support is derived, not a hand-written list');
  assert.match(s, /function learnCoverage\(list\)\{/, '…and the derivation has a name');
  const wi = s.indexOf('function washTier(c){');
  const w = s.slice(wi, s.indexOf('function paintCountries', wi));
  assert.match(w, /if\(!supported\(c\)\) return 0;/, 'no feed → state 0');
  /* ⚠ (#R290) …and the question is 「is the unit layer drawing this country RIGHT NOW」 rather than
     「are its shapes in the cache」: the quiet collection is bounded by the view and by the zoom
     (see quietISOs), so a country whose units are held but off-screen must keep the country-wide
     sheet or nothing would paint it at all. */
  assert.match(w, /return\s*\(?[^;]*quietSet\[c\][^;]*\?\s*2\s*:\s*1;/, 'a feed and nothing in force → grey (#R288: per unit where this map holds them)');
  assert.match(s, /function ensureHatch\(\)/, 'the hatch must be drawn, once');
  assert.match(s, /GE\(\)\.scene\.addImage\(HATCH_IMG/, '…through the image API the engine actually has');
  assert.match(s, /'fill-pattern':'wp-alert-hatch-img'/, '…and used as a pattern');
  /* the two states must not be one expression away from each other */
  assert.match(s, /\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\]/, 'the hatch is state 0 only');
});

/* ── ④ two palettes, and the normalisation says it is IntMap’s ─────────────────────────────── */
test('R273 ④ the map paints in the agency’s own colours or in IntMap’s, and says which', () => {
  const s = WP();
  assert.match(s, /let mode=\(function\(\)\{ try\{ return localStorage\.getItem\('im\.alertPal'\)/,
    'the choice is a reading preference and is kept');
  assert.match(s, /const colField=\(\)=>\(mode==='agency'\?'colA':'colN'\)/, 'one field name, two properties');
  assert.match(s, /colA:agCol\(feed,lv\), colN:PAL_NORM\[norm\]/,
    'every feature carries BOTH, so a mode change is a paint swap and not a re-fetch');
  assert.match(s, /function repaintMode\(\)/, '…and there is one place that swaps it');
  /* the normalisation is stated, not hidden inside a colour */
  assert.match(s, /function normOf\(feed,lv\)/, 'one normaliser');
  /* ⚠ (#R299) THIS PINNED THE SENTENCE AND THE SENTENCE WAS THE THING THE READER ASKED TO CHANGE
     (「文章が長すぎる。簡潔に。」). What #R273 was protecting is not the wording — it is that the
     normalised legend makes TWO claims: that the conversion is IntMap's own, and that the same step
     is not the same danger. So the claims are what is checked, in whatever words carry them. */
  const wk = s.slice(s.indexOf('function worldKey()'), s.indexOf('function worldKey()') + 1500);
  const note = wk.match(/esc\(L\('((?:[^'\\]|\\.)*)'/);
  assert.ok(note, 'the normalised legend still carries a note under the swatches');
  assert.match(note[1], /IntMap/, 'and the panel must say the conversion is IntMap’s own');
  assert.match(note[1], /not the same|do NOT|does not|differ/,
    '…and that the same step does not mean the same danger');
});

/* ── ⑤ the hazard is on the map ────────────────────────────────────────────────────────────── */
test('R273 ⑤ the area carries the hazard’s own name, and says when more than one is in force', () => {
  const s = WP();
  assert.match(s, /hz:hz\+\(extra\?\(' \+'\+extra\):''\)/, 'a second warning in the same unit must not vanish');
  assert.match(s, /'text-field':\['get','hzs'\]/, 'the small form is a property, not an expression on zoom');
  assert.match(s, /'text-field':\['get','hz'\]/, '…and so is the full one');
  /* ⚠ two LAYERS with minzoom/maxzoom, because `['step',['zoom'],['get',…]]` in `text-field` is a
     style-time error in MapLibre — measured, it took the whole page down */
  assert.match(s, /id:'wp-alert-lbls'[\s\S]{0,120}maxzoom:5/, 'the abbreviation is a layer below z5');
  assert.match(s, /id:'wp-alert-lbl'[\s\S]{0,120}minzoom:5/, '…and the full name a layer above it');
  /* an acronym is not a short name: 「MTW+4」 is a code the reader has no key to */
  assert.match(s, /const HZ_DROP=/, 'the short form drops the RANK words, which the colour already says');
  assert.ok(!/map\(x=>x\.charAt\(0\)\.toUpperCase\(\)\)\.join\(''\)/.test(s), 'no initials');
  /* ⚠⚠ (#R273 追記) …and the answer must survive the opacity slider. MEASURED on production:
     `line-opacity` on `wp-alert-line` was **0.38**, because `_applyGenericOpacity` dims every layer
     the checkbox declares — including the outline that was given the rank to carry. The fill and
     the country wash follow the slider; the outline and the label do not. */
  const reg = /legendId:'wpalerts', layers:\(\)=>\[([^\]]*)\]/.exec(s);
  assert.ok(reg, 'the opacity targets must be declared');
  assert.ok(reg[1].includes("'wp-alert-fill'"), 'the fill follows the slider');
  /* ⚠ (#R298) THE RULE IS ABOUT THE RANK, NOT ABOUT THE LAYER. The outline layer draws two
     different things: the outline of a WARNED unit, which carries the rank and must survive a fill
     you can see through, and the outline of a `norm` 0 unit, which is the DIVISION between two
     greys and is part of the wash. MEASURED on production: with the slider at 0 the quiet units and
     their outlines were still painted at full strength — 「発表無しポリゴンだけ不透明度選択の対象外
     なのを辞めろ」. So the layer IS a target and its opacity is an EXPRESSION: 0.95 where the rank
     is, the slider where it is not — the same shape `hatchOp`/`choroOp` already use, and ⑯ below is
     what stops the slider flattening it back to a scalar. */
  assert.ok(reg[1].includes("'wp-alert-line'"), 'the outline is a target…');
  assert.match(s, /const lineOp=\(v\)=>\['case',\['>',\['get','norm'\],0\],0\.95,/,
    '…but the rank keeps its own opacity, and only the quiet division follows the slider');
  assert.match(s, /OE\['wp-alert-line'\]=lineOp;/, 'and the builder is registered, so the scalar never lands');
  assert.ok(!reg[1].includes('wp-alert-lbl'), 'the hazard name does not follow the slider');
});

/* ── ⑥ four grades, not one green dot ──────────────────────────────────────────────────────── */
test('R273 ⑥ Fresh / Delayed / Stale / Error are four states with four colours', () => {
  const s = WP();
  const g = /const GRADE_COL=\{([^}]*)\}/.exec(s);
  assert.ok(g, 'the grade palette must exist');
  for (const k of ['fresh', 'delayed', 'stale', 'error', 'loading']) {
    assert.ok(g[1].includes(k + ':'), k + ' has no colour of its own');
  }
  const cols = [...g[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((m) => m[1]);
  assert.ok(new Set(cols).size >= 4, `the grades must be distinguishable, got ${cols}`);
  assert.match(s, /function grade\(k\)/, 'and one function that decides which');
});

/* ── ⑦ the panel answers 「どこで何が」 before it answers 「どのAPIから」 ─────────────────────── */
test('R273 ⑦ the panel leads with what is in force and folds the source list away', () => {
  const s = WP();
  assert.match(s, /function hotList\(\)/, 'the first thing must be what is in force');
  assert.match(s, /function sourceList\(\)/, '…and the sources must still be complete');
  const o = s.slice(s.indexOf('function overview()'), s.indexOf('function tick()'));
  assert.ok(o.indexOf('hotList()') < o.indexOf('sourceList()'), 'the sources come after, not first');
  assert.match(o, /<details[\s\S]{0,400}sourceList\(\)/, '…and behind a disclosure');
  assert.match(o, /<details[\s\S]{0,900}placedLine\(\)/, 'the placement diagnostics one level below that');
  /* 「左の数字が比較不能」 — every source line counts the SAME thing */
  assert.match(s, /const drawnCount=\(iso\)=>/, 'one unit for every source');
  assert.match(s, /n\+' '\s*\n?\s*\+esc\(L\('areas'/, '…and it is labelled as areas');
});

/* ── ⑧ 「これ長すぎ」 ───────────────────────────────────────────────────────────────────────── */
test('R273 ⑧ the attribution under the panel is one sentence', () => {
  const s = WP();
  const m = /Each country is drawn from its own agency, at the unit that agency issues for\. [^']*/.exec(s);
  assert.ok(m, 'the attribution must exist');
  assert.ok(m[0].length < 200, `the attribution is ${m[0].length} characters — it must stay a sentence`);
  /* the paragraph it replaces named eighteen countries and three failure modes */
  assert.ok(!/were probed this round and none of them has a public feed/.test(s),
    'the eighteen-country paragraph must be gone');
});

/* ── the refresh is real time, and every feed is on it ─────────────────────────────────────── */
test('R273 the refresh interval is a named bound and every feed is graded against it', () => {
  const s = WP();
  const ms = +/const TICK_MS=(\d+)/.exec(s)[1];
  assert.ok(ms > 0 && ms <= 30000, `the interval is ${ms} ms — 「リアルタイムにと言っている」`);
  const keys = /const FEED_KEYS=\[([^\]]*)\]/.exec(s);
  assert.ok(keys, 'the feed list must be one array');
  const list = [...keys[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  const feeds = /const FEEDS=\{([\s\S]*?)\};/.exec(s)[1];
  const used = new Set([...feeds.matchAll(/:'([a-z]+)'/g)].map((m) => m[1]));
  for (const f of used) assert.ok(list.includes(f), f + ' is routed to but never graded');
});
}

/* ═══ from tests/r275-checks.test.mjs (tests #6, #7, #8, #9, #10, #11 of 12) ═══
    IntMap · #R275 source checks
    「地形編集・水流で地形のポップアップのUI、他の凡例やポップアップに比べて内部要素のサイズが大きすぎる。
      また、ツールは上部にスティックしろ。」
    「地形編集・水流を開くと勝手にズームするのを辞めろ。」
    「気象警報はまだ対応していない国は、灰色斜線で、発令されていないだけの地域は灰色に。」
    「今発表されている警報欄は、一国一行までにしろ。」
    「水流シミュレーションの解像度が低すぎる。また、一回きりの水源、再生できない。ふざけるな。
      一回きりと継続の差は、水が継続的に発生し続けるか否かしかないようにするべき。ふざけるな。」
    「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。…対応国も増やせ。更新が遅すぎる。
      リアルタイムにと言っている。ソースは一国一ソース。…GDACSを完全に撤廃しろ。また、押した地点の
      警報情報が別ポップアップで出るようにしろ。」

    ⚠ EVERY ASSERTION HERE IS ABOUT A PROPERTY, NOT ABOUT A NUMBER OR A CALL SITE. Twelve consecutive
    rounds have had a previous round's test pin a literal and turn a correct change into a false
    regression — this round fixed nine of them. So: the panel's scale is checked as «one declaration
    used everywhere», not as «30 px»; the source model as «one delivery mechanism», not as one line.

   (#R308 追記2) 5本が同じ1行を逐語で固定していたので、規則ごとに1つの読み手へ — tests/wash-tier.mjs */
{
/* comments are prose about the code and must never satisfy an assertion ABOUT the code — the
   「自分の検査が自分のコメントに当たる」 shape this project has paid for thirteen times (#R274). */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const RELAY = () => codeOnly(read('supabase/functions/alerts-relay/index.ts'));

/* ── ⑥ 「今発表されている警報欄は、一国一行までにしろ。」 ──────────────────────────────────────────
   MEASURED before the fix, fourteen visible rows: five were China, four Italy, two Australia. */
test('R275 ⑥ the what-is-in-force list is one row per country', () => {
  const s = WP();
  const fn = /function hotList\(\)\{([\s\S]*?)\n      function sourceList/.exec(s);
  assert.ok(fn, 'hotList must exist');
  assert.match(fn[1], /by\.set\(p\.iso,g\)/, 'the key is the country and nothing else');
  assert.ok(!/const key=p\.iso/.test(fn[1]), 'no composite key may reintroduce a row per hazard');
  assert.match(fn[1], /kinds:new Map\(\)/, 'the hazards are collected onto that one row');
  /* the rank printed on the row must be the rank OF the row — the old list captioned a CMA yellow
     「Red (I)」 because it took the whole country's worst level and put it beside one hazard */
  assert.match(fn[1], /if\(p\.norm>g\.norm\)\{ g\.norm=p\.norm; g\.lv=p\.lv; \}/,
    'the row carries the country’s own worst rank');
  assert.match(fn[1], /ks\.slice\(0,KN\)/, 'and the hazards that do not fit are counted, not dropped');
});

/* ── ⑦ 「押した地点の警報情報が別ポップアップで出るようにしろ。」 ───────────────────────────────── */
test('R275 ⑦ a tap answers about the point, in a card of its own', () => {
  const s = WP();
  assert.match(s, /function ptInGeom\(lng,lat,g\)\{/, 'the hit test is geometric');
  assert.match(s, /function alertsAt\(lng,lat\)\{/, '…over the features that are actually drawn');
  assert.match(s, /el\.className='country-popup'; el\.id='wpa-point';/,
    'the card is the app’s own detail shell, not a bespoke box');
  assert.match(s, /class="country-popup-close wpa-x"/, '…and its own close button (#R261)');
  /* #R255: that shell is position:absolute with no left/top — an unplaced one lands off-page */
  assert.match(s, /el\.style\.left=Math\.round\(Math\.max\(12,left\)\)\+'px';/, 'it is placed explicitly');
  /* the legend must keep the overview a tap used to destroy */
  /* ⚠ FIVE FAMILIES IN THIS FILE INSTALL A `mapClick` HANDLER, so the pattern has to name the one
     under test rather than the first one in the file — the alerts handler is the one that opens the
     point card, and asserting against the trade layer's handler would be an assertion about
     nothing. (This test caught exactly that on its own first run.) */
  const iC = s.indexOf('openPointCard(lng,lat,c)');
  assert.ok(iC > 0, 'the alerts tap must open the point card');
  const iH = s.lastIndexOf('mapClick(', iC);
  assert.ok(iH > 0 && iC - iH < 900, 'and it must be the mapClick handler that does it');
  const click = [null, s.slice(iH, s.indexOf('return true; });', iC) + 16)];
  assert.match(click[1], /openPointCard\(lng,lat,c\)/, 'the tap opens the point card');
  /* ⚠ THE PROPERTY IS «A TAP DOES NOT TAKE THE OVERVIEW AWAY», not «legendFor is never named here»:
     the card carries a button that opens the country list, and re-rendering the card after a late
     fetch has to re-wire it. So every `panel.open` inside the handler must belong to that button. */
  /* ⚠ (#R297) THE READER ASKED FOR THE OPPOSITE HALF OF THIS: 「クリックした国の凡例が表示される
     ように」. So a tap now opens the country's own key IN THE PANEL as well — and #R275's property
     survives, restated: the panel must never be left showing a view nothing chose. It knows which
     of the two it is showing (`panelISO`), a publish re-renders THAT one rather than replacing it
     with the worldwide list, and closing the card returns it to the overview. */
  assert.match(click[1], /if\(c\) countryPanel\(c\);/, 'a tap opens the country’s own key');
  for (const m of click[1].matchAll(/panel\.open\(/g))
    assert.fail('the handler must go through countryPanel(), which is the one place that remembers');
  assert.match(s, /function showPanel\(\)\{ if\(!on\) return; if\(panelISO\) countryPanel\(panelISO\); else overview\(\); \}/,
    'and every refresh renders whichever view is up');
  assert.match(s, /const closeTap=\(\)=>\{ closePointCard\(\); if\(panelISO&&on\)\{ panelISO='';/,
    'closing the card gives the overview back');
  /* …and the country list is still reachable from the card itself */
  assert.match(s, /if\(mb\) mb\.onclick=\(\)=>\{ countryPanel\(iso\); \};/,
    'the country legend is one button away');
  assert.match(s, /at:\(lng,lat\)=>alertsAt\(/, 'and the same answer is a call, for Atlas and for a test');
});

/* ── ⑧ a green MeteoAlarm row is not a warning ─────────────────────────────────────────────────
   MEASURED live: Italy publishes 474 warnings, 201 of them 「Green Thunderstorm Warning」 (awareness
   level 1 = nothing required), and Belgium's ENTIRE feed is green — ten regions this map was
   painting as warned. Austria puts no colour in its event text at all, so the event string is not
   a substitute for the parameter. */
test('R275 ⑧ the relay reads MeteoAlarm’s awareness level, and level 1 is not in force', () => {
  const t = RELAY();
  assert.match(t, /function awarenessOf\(info\)\s*\{/, 'the level is read from the parameter');
  assert.match(t, /String\(\(x && x\.valueName\) \|\| ""\)\.toLowerCase\(\) === "awareness_level"/,
    '…by its published name, not by parsing the event text');
  assert.match(t, /if \(aw === 1\) \{ green\+\+; continue; \}/, 'green is dropped');
  assert.match(t, /const tier = aw \? Math\.max\(1, aw - 1\) : \(SEV\[String\(pick\.severity\)\] \|\| 1\)/,
    'and 2–4 become the CAP ladder, with severity as the fallback for a feed without the parameter');
  assert.match(t, /areaTotal: areaMap\.size, green,/, 'what was dropped is reported, never silent');
  /* ⚠ (#R383) …and 「what was dropped」 grew: green is not the only thing this summary now declines
     to paint. A bulletin whose validity window has closed or has not opened is dropped here too,
     and it is counted for exactly the reason green is (see tests/r383-checks ①). */
  assert.match(t, /expired, upcoming, noExpires, upcomingAreas: /,
    'and so is everything the validity window dropped');
});

/* ── ⑨ 「対応国も増やせ。ソースは一国一ソース。」 ─────────────────────────────────────────────────
   MEASURED: 206 countries hatched before, 112 after — the WMO's register wires ninety-three more,
   each from its own national service. */
test('R275 ⑨ the WMO register is wired, one source per country, and it is not GDACS', () => {
  const s = WP(), t = RELAY();
  assert.match(t, /h === "severeweather\.wmo\.int"/, 'the host is allow-listed structurally');
  assert.match(t, /function summariseSWIC\(raw, mid\)\s*\{/, 'each member is summarised like the others');
  assert.match(t, /encodeURIComponent\("event,areadesc,sent,mem,s,expires,capurl,wkb_geometry"\)/,
    'the geometry column is NAMED — leaving it out returns every feature with a null shape');
  assert.match(t, /function summariseSWICScan\(raw\)\s*\{/, 'and one geometry-free call finds who has anything');
  /* one source per country: a member is only asked for if nothing else covers it */
  assert.match(s, /Object\.keys\(swicMeta\.mid\)\.forEach\(c=>\{ if\(!FEEDS\[c\]&&swicMeta\.status\[c\]===1\) FEEDS\[c\]='swic'; \}\);/,
    'a member with another feed is never given this one');
  assert.match(s, /const swicISO=\(\)=>Object\.keys\(swicMeta\.mid\)\.filter\(c=>FEEDS\[c\]==='swic'\);/,
    '…and only the members the WMO records as CAP-Completed are claimed as covered');
  /* the reader is told whose warning it is */
  assert.match(s, /function agencyFor\(feed,iso3\)\{/, 'the author is named per country');
  assert.match(s, /swicMeta\.dept\[iso3\]/, '…from the member’s own service name');
  /* GDACS stays gone (#R273) */
  assert.ok(!/gdacs/i.test(s), 'GDACS is not back');
});

/* ── ⑩ 「更新が遅すぎる。リアルタイムにと言っている。」 ────────────────────────────────────────────
   MEASURED before the fix, layer on, refresh() driven 80 times over eight minutes: MeteoAlarm made
   THREE requests in total and then none at all. `maAsked.filter(k=>!maData[k]).concat(maNext())`
   excludes a country the moment it arrives, in BOTH halves — it was a first-load queue, and nothing
   ever turned it into a refresh cycle. */
test('R275 ⑩ every feed is on a rotation, and none of them is a first-load queue', () => {
  const s = WP();
  const fn = /function maNext\(n\)\{([\s\S]*?)\n        return take; \}/.exec(s);
  assert.ok(fn, 'maNext must exist');
  /* ⚠ (#R288) the same ordering, with the countries the reader can SEE taken first — the cycle was
     already at the transport's floor, and what was slow was the visible country's place in it. The
     age order #R275 established is still the order; `viewFirst` only partitions it. */
  assert.match(fn[1], /const byAge=viewFirst\(fresh\.sort\(\(a,b\)=>\(maAt\[a\]\|\|0\)-\(maAt\[b\]\|\|0\)\)\);/,
    'the next batch is the countries read longest ago, in view first');
  assert.match(s, /function viewFirst\(list\)\{/, '…and that partition has a name');
  assert.match(fn[1], /const cold=all\.filter\(k=>!maData\[k\]\)/, '…with the never-read ones first');
  assert.ok(!/maAsked\.filter\(k=>!maData\[k\]\)\.concat\(maNext\(\)\)/.test(s),
    'the queue that excluded a country the moment it arrived is gone');
  assert.match(s, /maAt\[k\]=Date\.now\(\)/, 'and every read stamps its own clock');
  assert.match(s, /function swicNext\(n\)\{/, 'the register rotates the same way');
  /* the number that proves it: the age of the country read longest ago is reported */
  assert.match(s, /maOldestS:\(function\(\)\{/, 'the oldest country’s age is an instrument, not an assumption');
  assert.match(s, /oldestS:\(function\(\)\{/, '…and the register has one too');
});

/* ── ⑪ grey is a statement, so it has to have been checked ──────────────────────────────────── */
test('R275 ⑪ a country is only painted «nothing in force» once its service has been read', () => {
  const s = WP();
  assert.match(s, /function readState\(c\)\{ const f=FEEDS\[c\]\|\|LEARNED\[c\];/,
    'what is known per country has a name (#R288: including a country a service was learned to cover)');
  /* ⚠ (#R277) THE RULE GOT STRICTER AND THIS CHECK PINNED THE OLD ONE. `loading` was not the only
     state that has not READ anything: `error` and `idle` were painting the 「発表なし」 grey too, and
     MEASURED this round China came out grey with 1,235 warnings in force because www.nmc.cn was
     briefly unreachable from the edge. What #R275 is about is asserted, on the whole rule. */
  /* ⚠ (#R284) THE RULE GOT STRICTER AGAIN AND THIS CHECK PINNED THE LITERAL. Not painting the grey
     was right; painting the HATCH instead was not, because the hatch means 「未対応」 — measured, 22
     wired countries wore it 45 s after the layer went on. The property this test is about — a
     service that has not answered does not earn the 「発表なし」 grey — is what is asserted. */
  /* ⚠ (#R288) …and the reader has since chosen the appearance for that state:
     「まだ対応していない、もしくはデータがまだ入っていないところは灰色斜線で」. The property #R275
     is about is unchanged and is what is asserted — a service that has not answered does not
     earn the 「発表なし」 grey. What it earns instead is the hatch, which claims nothing. */
  /* ⚠ (#R308 追記2) …AND IT PINNED THE LINE RATHER THAN THE RULE. 「取得できていない国は「発表なし」の
     灰色をもらわない」 is what this asserts, and it is unchanged; what moved is the OTHER arm of that
     same line. A country whose service failed but whose own units are STILL ON THE MAP is not a
     silence — 本番実測、カシミール z6 の上塗り 525 点のうち **276 点が `CHN OVER CHN/W`**、中国の斜線が
     中国自身の発令中の区域の上に乗っていた——so it takes 2 (transparent). Asked as the rule: whatever
     that line returns, it is never the grey (1) and never a wash rank (11–14). */
  assertUnreadNeverGreys(s);
  /* the three states are still three appearances (#R273) */
  /* (#R293) the wash reads the ONE declared grey rather than repeating its literal — see r290 ① */
  assert.match(s, /\n\s+1,QUIET_COL,/, 'read and quiet is grey');
  assert.match(s, /'fill-pattern':'wp-alert-hatch-img'/, 'and nothing-to-say is hatched');
  /* the hatch now covers two different reasons, and the tap says which */
  assert.match(s, /L\('Not read yet','未取得'/, 'the tap distinguishes them in words');
  assert.match(s, /unread:\(function\(\)\{/, 'and the count is an instrument that must reach zero');
});
}

/* ═══ from tests/r801-relay-input-checks.test.mjs (tests #4, #5, #6, #7 of 11) ═══
    R801 — 公開リレーの入力は「形式が合っている」ではなく「呼び出し元が実際に送るもの」で受ける
    外部監査が挙げた欠陥を、**関数を実際に評価して**測る（ソースを読んで綴りを探さない。#R505）。
    Edge Function は子プロセスで評価し、`Deno.serve` に渡された handler を本物の Request で叩く。
    上流は fetch / WebSocket のスタブで、何が・何本同時に・どのホストへ訊かれたかを記録する。

      ① `?bbox=` は座標である（aviation-feed: span 1e9 が `Invalid array length` を投げていた）
      ② _shared/read-budget.js の算術（#R504 の bucket をそのまま運んだこと）
      ③ alerts-relay: 索引の href は索引と同じ origin だけ／CAP の取得は上限付きの並列
      ④ alerts-relay: `?u=` は未知のクエリ鍵・ポート・違う scheme を拒み、自分の swicUrl は通す
      ⑤ alerts-relay: `?ma=` は MA_PARALLEL 本ずつ
      ⑥ quotes-relay: 不正な `%` は 400 であって 500 ではない／ポート付きは 400
      ⑦ radiation-sources: us-epa の series は登録局にしか URL を作らない（`..` は path にならない）
      ⑧ ais-feed: `?refresh=1` は bucket が許した回数しか上流へ行かない／公開 meta と note に秘密の形状も
         上流の文も無い／bbox は共有の規則で読む */
{
const rd = read;

/* ── the runner: one child per Edge Function, the handler captured, upstreams stubbed ─────────
   `routes` is [[regexSource, { status, body, type, delayMs }], …]; anything unmatched answers 404.
   The child reports every fetch call, the highest number in flight at once, and each answer. */
function runEdge(fn, opts) {
  const url = pathToFileURL(join(ROOT, 'supabase/functions', fn, 'index.ts')).href;
  const src = `
    globalThis.__calls = []; globalThis.__inflight = 0; globalThis.__maxInflight = 0;
    globalThis.Deno = { env: { get: (k) => (${JSON.stringify(opts.env || {})})[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    const routes = ${JSON.stringify(opts.routes || [])}.map(([re, r]) => [new RegExp(re), r]);
    globalThis.fetch = async (u, init) => {
      const s = String(u);
      globalThis.__calls.push((init && init.method || "GET") + " " + s);
      const hit = routes.find(([re]) => re.test(s));
      if (!hit) return new Response("unexpected " + s, { status: 404, headers: { "content-type": "text/plain" } });
      const r = hit[1];
      globalThis.__inflight++; globalThis.__maxInflight = Math.max(globalThis.__maxInflight, globalThis.__inflight);
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
      globalThis.__inflight--;
      return new Response(r.body == null ? "" : r.body, { status: r.status || 200, headers: { "content-type": r.type || "application/json" } });
    };
    globalThis.WebSocket = class {
      constructor(u) { this.readyState = 1; globalThis.__calls.push("WS " + u);
        setTimeout(() => { this.onopen && this.onopen();
          for (const m of ${JSON.stringify(opts.wsMsgs || [])}) this.onmessage && this.onmessage({ data: JSON.stringify(m) });
          this.onclose && this.onclose({ code: 1000, reason: "upstream said: bye" }); }, 5); }
      send() {} close() {}
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(opts.requests)}) {
      const t0 = Date.now();
      const r = await globalThis.__h(new Request("http://relay.test/" + q));
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      out.push({ status: r.status, headers: h, body: await r.text(), ms: Date.now() - t0 });
    }
    process.stdout.write(JSON.stringify({ out, calls: globalThis.__calls, maxInflight: globalThis.__maxInflight }));
  `;
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(raw);
}
const entry = (href, i) =>
  `<entry><title>中央氣象署 ${i}</title><updated>2026-09-18T0${i % 10}:00:00Z</updated><link href="${href}"/></entry>`;
const CAP_OK =
  '<alert><status>Actual</status><msgType>Alert</msgType><sent>2026-09-18T00:00:00+08:00</sent>' +
  '<senderName>中央氣象署</senderName><info><category>Met</category><event>大雨</event><severity>Severe</severity>' +
  '<expires>2999-01-01T00:00:00+08:00</expires><area><areaDesc>臺北市</areaDesc></area></info></alert>';

test('R801 ③ alerts-relay follows a CAP index link only on the index\'s own origin, and counts what it refused', () => {
  const links = [
    'https://alerts.ncdr.nat.gov.tw/Capstorage/CWA/a.cap',
    'https://evil.example/steal.cap',                      /* another host */
    'http://alerts.ncdr.nat.gov.tw/Capstorage/CWA/b.cap',   /* the right host on the wrong scheme */
    'https://alerts.ncdr.nat.gov.tw:8443/Capstorage/c.cap', /* the right host on another port */
    'https://user:pw@alerts.ncdr.nat.gov.tw/Capstorage/d.cap',
    'https://alerts.ncdr.nat.gov.tw/Capstorage/CWA/e.cap',
  ];
  const feed = '<feed>' + links.map(entry).join('') + '</feed>';
  const r = runEdge('alerts-relay', {
    routes: [
      ['RssAtomFeed\\.ashx', { body: feed, type: 'application/xml; charset=utf-8' }],
      ['\\.cap$', { body: CAP_OK, type: 'application/xml' }],
    ],
    requests: ['?cap=tw'],
  });
  assert.equal(r.out[0].status, 200, r.out[0].body);
  const j = JSON.parse(r.out[0].body);
  const fetched = r.calls.filter((c) => /\.cap$/.test(c)).map((c) => c.replace(/^GET /, ''));
  assert.deepEqual(fetched.sort(), [links[0], links[5]].sort(), 'only the index\'s own https origin is fetched');
  assert.ok(!r.calls.some((c) => /evil\.example/.test(c)), 'no byte was asked of the other host');
  assert.equal(j.offHost, 4, 'the refused links are counted in the answer, not lost');
  assert.equal(j.indexTotal, 2);
  assert.equal(j.count, 2, 'the two bulletins on the right origin were read');
});

test('R801 ③ CAP files are fetched at most CAP_PARALLEL at a time, each under a byte ceiling and a content-type rule', () => {
  const src = rd('supabase/functions/alerts-relay/index.ts');
  const PAR = +(/const CAP_PARALLEL = (\d+);/.exec(src) || [])[1];
  assert.ok(PAR >= 2, 'CAP_PARALLEL is declared');
  const n = 18;
  const feed = '<feed>' + Array.from({ length: n }, (_, i) => entry('https://alerts.ncdr.nat.gov.tw/cap/' + i + '.cap', i)).join('') + '</feed>';
  const r = runEdge('alerts-relay', {
    routes: [
      ['RssAtomFeed\\.ashx', { body: feed, type: 'application/xml' }],
      ['/cap/1\\.cap$', { body: '<html>login</html>', type: 'text/html' }],
      ['\\.cap$', { body: CAP_OK, type: 'application/xml', delayMs: 40 }],
    ],
    requests: ['?cap=tw'],
  });
  const j = JSON.parse(r.out[0].body);
  assert.equal(r.calls.filter((c) => /\.cap$/.test(c)).length, n, 'every link on the right origin was asked');
  assert.ok(r.maxInflight <= PAR, `at most ${PAR} in flight, measured ${r.maxInflight}`);
  assert.ok(r.maxInflight >= 2, 'and it is a pool, not a serial walk (' + r.maxInflight + ')');
  assert.equal(j.count, n - 1, 'the HTML answer was refused by the content-type rule and did not become a bulletin');
  assert.equal(j.unread, 1, 'and that refusal is counted');
  /* the guard is the shared one: a byte ceiling is declared for both the index and the files */
  assert.match(src, /maxBytes: CAP_INDEX_MAX_BYTES/);
  assert.match(src, /maxBytes: CAP_FILE_MAX_BYTES/);
  assert.ok(!/await fetch\(/.test(src), 'no upstream read in alerts-relay bypasses fetchGuarded');
});

test('R801 ④ ?u= refuses query keys nobody sends, ports, userinfo and the wrong scheme — and admits its own swicUrl', () => {
  const CN = 'https://www.nmc.cn/rest/findAlarm';
  const r = runEdge('alerts-relay', {
    routes: [
      ['nmc\\.cn', { body: '{"data":{"page":{"list":[]}}}' }],
      ['severeweather\\.wmo\\.int', { body: '{"type":"FeatureCollection","features":[]}' }],
    ],
    requests: [
      '?u=' + encodeURIComponent('http://www.nmc.cn/rest/findAlarm?pageNo=1&pageSize=300&signaltype=&signallevel=&province='),
      '?u=' + encodeURIComponent('http://www.nmc.cn/rest/findAlarm?pageNo=1&evil=1'),
      '?u=' + encodeURIComponent(CN + '?pageNo=1'),
      '?u=' + encodeURIComponent('https://feeds.meteoalarm.org:8443/api/v1/warnings/feeds-germany'),
      '?u=' + encodeURIComponent('https://feeds.meteoalarm.org/api/v1/warnings/feeds-germany?x=1'),
      '?u=' + encodeURIComponent('https://user:pw@www.nmc.cn/rest/findAlarm'),
      '?u=' + encodeURIComponent('https://severeweather.wmo.int/f/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=other:layer&outputFormat=application/json'),
      '?u=' + encodeURIComponent('https://severeweather.wmo.int/f/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=local_postgis:postgis_geojsons&outputFormat=text/csv'),
      '?u=' + encodeURIComponent("https://severeweather.wmo.int/f/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=local_postgis:postgis_geojsons&outputFormat=application/json&cql_filter=1=1"),
      '?swic=070',
    ],
  });
  const [cnOk, cnKey, cnScheme, maPort, maKey, cnUser, wfsType, wfsFmt, wfsCql, swic] = r.out;
  assert.equal(cnOk.status, 200, 'what js/world-packs.js sends for the CMA list is relayed: ' + cnOk.body);
  assert.equal(cnKey.status, 400, 'an unknown query key is refused');
  assert.equal(cnScheme.status, 200, '(#R803) https is what js/world-packs.js actually sends for the CMA list, and the upstream answers it — refusing it blanked China on production');
  assert.equal(maPort.status, 400, 'a port is another origin');
  assert.equal(maKey.status, 400, 'the MeteoAlarm feed takes no query');
  assert.equal(cnUser.status, 400, 'userinfo is refused');
  assert.equal(wfsType.status, 400, 'another GeoServer layer is not relayed');
  assert.equal(wfsFmt.status, 400, 'nor another output format');
  assert.equal(wfsCql.status, 400, 'nor an arbitrary cql_filter');
  /* the rule admits what this function itself composes: take the URL ?swic= actually fetched
     and offer it back through ?u= */
  assert.equal(swic.status, 200, swic.body);
  const composed = r.calls.map((c) => c.replace(/^GET /, '')).find((c) => /severeweather\.wmo\.int\/f\/wfs/.test(c));
  assert.ok(composed, 'the swic path fetched its WFS url');
  const again = runEdge('alerts-relay', {
    routes: [['severeweather\\.wmo\\.int', { body: '{"type":"FeatureCollection","features":[]}' }]],
    requests: ['?u=' + encodeURIComponent(composed)],
  });
  assert.equal(again.out[0].status, 200, 'the allow-list admits the function\'s own WFS request: ' + again.out[0].body);
  /* no request above reached an upstream it should not have */
  assert.ok(!r.calls.some((c) => /evil=1|:8443|x=1|other:layer|text\/csv|1=1/.test(c)), 'a refused URL was fetched anyway: ' + r.calls.join(' '));
});

test('R801 ⑤ ?ma= fetches MA_PARALLEL countries at a time, not all six at once', () => {
  const src = rd('supabase/functions/alerts-relay/index.ts');
  const PAR = +(/const MA_PARALLEL = (\d+);/.exec(src) || [])[1];
  assert.ok(PAR >= 1 && PAR < 6, 'MA_PARALLEL is declared and smaller than the country cap');
  const r = runEdge('alerts-relay', {
    routes: [['feeds\\.meteoalarm\\.org', { body: '{"warnings":[]}', delayMs: 40 }]],
    requests: ['?ma=germany,france,italy,spain,austria,poland'],
  });
  assert.equal(r.out[0].status, 200, r.out[0].body);
  assert.equal(r.calls.filter((c) => /feeds-/.test(c)).length, 6, 'all six countries were asked');
  assert.ok(r.maxInflight <= PAR, `at most ${PAR} in flight, measured ${r.maxInflight}`);
  assert.equal(Object.keys(JSON.parse(r.out[0].body).countries).length, 6);
});
}
