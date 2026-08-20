/* ============================================================================
 *  IntMap · #R269 source checks — the warnings layer told the truth about Japan
 * ----------------------------------------------------------------------------
 *  「全く警報レイヤーが機能していない。気象庁とは全く違うデタラメが表示される」
 *
 *  Two independent defects produced that, and both were MEASURED before anything was changed:
 *    · the endpoint had been frozen since 2026-05-28 (measured on 2026-08-19) while answering 200
 *      with valid JSON of the expected shape;
 *    · the code table was written from memory and, from code 10 up, named the wrong hazard AND the
 *      wrong rank — 雷注意報 was drawn as a 洪水警報, over 900 areas at once.
 *  The assertions below are about the PROPERTIES that make each impossible again, not about the
 *  literals this round happened to write.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
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
  assert.match(s, /const jmaTier=\(lvl\)=>lvl>=40\?3:lvl>=30\?2:1;/, 'the rank must come from the level');
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
  for (const k of ['jma', 'nws', 'eccc', 'cma', 'bom', 'hko', 'inmet', 'gdacs', 'meteoalarm']) {
    assert.ok(new RegExp("seenAt\\('" + k + "'").test(s), `${k} records no timestamp of its own`);
  }
  /* ⚠ the CMA writes 2026/08/19 17:22 — slashes, which Date.parse answers NaN for, so the first
     version of this instrument left the one feed it exists for without a clock at all */
  const cma = /seenAt\('cma',[^;]*/.exec(s);
  assert.ok(cma, 'the CMA clock must be recorded');
  assert.ok(cma[0].includes(".split('/').join('-')"), 'the CMA slashes must be replaced: ' + cma[0]);
  assert.ok(cma[0].includes('+08:00'), 'and its zone stated: ' + cma[0]);
  assert.match(s, /const ageH=\(k\)=>/, 'the age must be derived from it');
  assert.match(s, /esc\(extra\)\+esc\(ageTxt\(k\)\)/, '…and printed beside the service');
});

test('R269 ③ «reachable» and «still running» are two different dots', () => {
  const s = WP();
  assert.match(s, /const STALE_H=(\d+)/, 'the staleness threshold must exist');
  const h = +/const STALE_H=(\d+)/.exec(s)[1];
  /* MEASURED live: INMET's newest item was 33.5 h old and HKO's 19.3 h while both were current, so
     a «recent» threshold would cry wolf. A week without a single bulletin is the real signal. */
  assert.ok(h >= 24 * 4, `the threshold is ${h} h — a live feed with a multi-day warning must not be flagged`);
  assert.match(s, /const dot=\(k\)=>/, 'the dot must be computed from the state AND the age');
});

/* ── ④ 追記: the relay-backed loaders, and what a «newest timestamp» may be ─────────────────── */
test('R269 ④ a timestamp in the future is refused as evidence of freshness', () => {
  const s = WP();
  assert.match(s, /if\(v>Date\.now\(\)\+60000\) return;/,
    'a validity window that ends tomorrow must not make a feed look newer than now');
  /* MeteoAlarm's rows carry onset/expires — a WINDOW — so its clock is the relay's own read time */
  assert.match(s, /seenAt\('meteoalarm',d\.fetchedAt\)/, 'MeteoAlarm uses the relay’s fetchedAt');
  assert.match(codeOnly(read('supabase/functions/alerts-relay/index.ts')), /fetchedAt: new Date\(\)\.toISOString\(\)/,
    '…which the relay must actually send');
});

test('R269 ④ the two relay-backed loaders run one call at a time', () => {
  const s = WP();
  assert.match(s, /let cmaBusy=false, maBusy=false;/, 'the in-flight flags must exist');
  assert.match(s, /if\(!cmaBusy\)\{ cmaBusy=true;/, 'CMA is guarded');
  assert.match(s, /if\(!maBusy\)\{ maBusy=true;/, 'MeteoAlarm is guarded');
  /* and each one must clear its flag on BOTH paths, or the feed stops for the session */
  const cma = s.slice(s.indexOf('if(!cmaBusy)'), s.indexOf('if(!maBusy)'));
  assert.match(cma, /\.then\(\(\)=>\{ cmaBusy=false; \}\)/, 'CMA clears its flag after success AND failure');
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
  assert.match(t, /for \(let i = 0; i < 2 && !r; i\+\+\)/, 'and one retry');
});

