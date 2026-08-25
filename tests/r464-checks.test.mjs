/* ============================================================================
 *  R464 — GDELT WAS UNREACHABLE, AND EVERY CLOCK POINTED AT IT WAS TOO SHORT TO NOTICE
 * ----------------------------------------------------------------------------
 *  #R452 gave Atlas's evidence gathering deadlines. Production verification then measured ONE
 *  `analyze` turn spending ~45 s on GDELT for ZERO BYTES, three times over — 8.0 s x3 of relay
 *  racing plus direct attempts of 6.1 / 7.0 / 6.7 s. The deadlines were working perfectly. What was
 *  wrong was the number in them, and the sentence that justified it:
 *
 *      js/atlas-deadlines.js  「the browser-visible CORS refusal … costs nothing, because it
 *                              rejects before a byte moves」
 *
 *  That is true of a rejected PRE-FLIGHT. GDELT's refusal is a real 429 that merely carries no
 *  ACAO, so the browser waits out the whole round trip first. MEASURED 2026-08-25 from the live
 *  origin, 18 direct attempts: 4 succeeded (22.2%), median success 17,454 ms, median refusal
 *  12,297 ms — and across 15 further samples from two different egress IPs the fastest response
 *  GDELT gave of ANY kind was 10.7 s. `DIRECT_TIMEOUT_MS = 6000` could not reach it once. The
 *  6.1 / 7.0 / 6.7 s in the report are that deadline firing, not anything GDELT did.
 *
 *  Three defects, and each check below drives the real thing rather than reading it:
 *
 *    1. the direct clock was shorter than the host's fastest possible answer          (② ⑤)
 *    2. `wLeft()` was COMPUTED before every GDELT call and never handed to one, so a
 *       「20 s」 web budget bought three sequential 14 s attempts = 42 s               (③ ④)
 *    3. there was nowhere for an answer to be REMEMBERED, so every reader paid the
 *       upstream cost of a host that refuses ~80% of requests                          (① ⑥ ⑦ ⑧)
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchViaProxy } from '../js/proxy-fetch.js';
import { makeAtlasSources } from '../js/atlas-sources.js';
import { ATLAS_BUDGETS } from '../js/atlas-deadlines.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ (#R345, fifteen rounds of it) A COMMENT THAT DESCRIBES THE DEFECT IS NOT THE DEFECT. Every file
   this round touches explains in prose what it used to do, so a raw-text check for 「the old number
   is gone」 would be satisfied by the note saying it is gone. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Japan%22&mode=artlist'
  + '&maxrecords=14&format=json&timespan=3d&sort=hybridrel';
const SUPA = 'https://vpekfwdpurzejrrmacac.supabase.co';
/* the fastest thing GDELT did across 33 measured attempts from two egress IPs, in ms */
const GDELT_FASTEST_OBSERVED_MS = 10700;

const orHang = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res('HUNG'), ms))]);

/* ── ① our relay is asked BEFORE the reader's own IP, and before the public ladder ─────────────── */
test('R464 ①: a GDELT fetch reaches gdelt-relay first, then the host, then the public relays', async () => {
  const realFetch = globalThis.fetch;
  const realWindow = globalThis.window;
  const seen = [];
  globalThis.window = { SUPABASE_URL: SUPA };
  /* every attempt refuses instantly, so the ladder walks the whole way and records its order */
  globalThis.fetch = async (u) => { seen.push(String(u)); throw new Error('refused'); };
  try {
    const out = await orHang(fetchViaProxy(GDELT, { as: 'json', direct: true, budgetMs: 4000 }), 12000);
    assert.notEqual(out, 'HUNG', 'the ladder must finish inside the budget it was given');
    assert.ok(seen.length >= 2, `the ladder must actually attempt something (saw ${seen.length})`);

    const ownAt = seen.findIndex((u) => u.includes('/functions/v1/gdelt-relay'));
    const directAt = seen.findIndex((u) => u.startsWith('https://api.gdeltproject.org/'));
    assert.notEqual(ownAt, -1, 'GDELT must be offered our own Edge Function at all');
    assert.notEqual(directAt, -1, "the reader's own IP must remain a fallback (DECISIONS.md)");
    assert.ok(ownAt < directAt,
      `our cache answers in ~0.6 s and the host succeeds 22% of the time after ~17 s, so ours goes `
      + `first (relay at ${ownAt}, direct at ${directAt})`);

    /* the upstream URL must be carried intact, or the relay's allow-list refuses it */
    const relayUrl = new URL(seen[ownAt]);
    assert.equal(relayUrl.searchParams.get('u'), GDELT, 'the relay is handed the exact upstream URL');
  } finally { globalThis.fetch = realFetch; globalThis.window = realWindow; }
});

/* ── ② the direct clock is longer than the host's fastest possible answer ──────────────────────── */
test('R464 ②: the direct GDELT deadline outlives the fastest response GDELT was ever measured giving', () => {
  const src = code('js/proxy-fetch.js');
  const gd = /GDELT_DIRECT_MS\s*=\s*(\d+)/.exec(src);
  const generic = /DIRECT_TIMEOUT_MS\s*=\s*(\d+)/.exec(src);
  assert.ok(gd, 'js/proxy-fetch.js must give GDELT its own direct deadline');
  assert.ok(generic, 'the generic direct deadline must still exist for the hosts that answer quickly');
  assert.ok(Number(gd[1]) > GDELT_FASTEST_OBSERVED_MS,
    `a direct deadline of ${gd[1]} ms cannot reach a host whose fastest measured answer is `
    + `${GDELT_FASTEST_OBSERVED_MS} ms — that is the defect #R452 shipped, not a smaller version of it`);
  /* ⚠ the generic one must NOT have been raised to fix GDELT. 6 s is right for USGS, IMF and the
     Wikipedia REST API, and raising it for all of them would pay GDELT's tax on every other host. */
  assert.equal(Number(generic[1]), 6000,
    'the fix is a per-host deadline, not a bigger global one');
  assert.match(src, /directMsFor/, 'the per-host choice must be made in one place');
});

/* ── ③ the budget is HANDED to the fetch, not merely consulted before it ───────────────────────── */
test('R464 ③: _gdeltNews passes its budget down to the fetch that spends it', async () => {
  const budgets = [];
  const CTX = {
    _fetchJSON: async (_u, budgetMs) => { budgets.push(budgetMs); return null; },
    askAIJSON: async () => null,
    countryStats: {},
    nm: (s) => String(s || ''),
    EVIDENCE_BUDGET_MS: ATLAS_BUDGETS.EVIDENCE_BUDGET_MS,
    turnSignal: () => undefined,
  };
  const S = makeAtlasSources({ lang: 'en' }, CTX);
  await S._gdeltNews('"Japan"', [], null, 5000);
  assert.deepEqual(budgets, [5000],
    'the caller works out how much time is left before every GDELT attempt; if that number is not '
    + 'handed over, each attempt silently takes the full EVIDENCE_BUDGET_MS and three of them cost '
    + '42 s inside a 30 s budget — the exact 45 s production measured for zero bytes');
});

/* ── ④ …and no chain of SEQUENTIAL GDELT calls pays its budget twice ───────────────────────────── */
test('R464 ④: every sequential run of GDELT calls shares one shrinking budget', () => {
  const src = code('js/atlas-console.js');
  /* Sites that `await` one GDELT call and then `await` another are the ones that can multiply the
     budget. Written out, both of them are on a single line, so a line carrying two awaited calls
     must also carry the countdown that binds them together. ⚠ THIS TEST FOUND THE SECOND SITE:
     the brief's 「quoted phrase, then unquoted fallback」 pair had no shared budget at all, so it
     cost two full GDELT budgets while the 「20 s」 web budget appeared to bound it. */
  const seqLines = src.split('\n').filter((l) => (l.match(/await _gdeltNews\(/g) || []).length >= 2);
  assert.ok(seqLines.length >= 2,
    `the analyze gather and the brief each chain GDELT calls (found ${seqLines.length})`);
  seqLines.forEach((l) => {
    assert.match(l, /(wLeft|bLeft)\(\)/,
      `a line that awaits two GDELT calls must hand each one the time that is LEFT: «${l.trim().slice(0, 110)}»`);
  });
  /* …and the analyze gather's countdown must be handed over, not merely consulted */
  const gather = seqLines.find((l) => l.includes('regionQ'));
  assert.ok(gather, 'the analyze gather must still be one of them');
  assert.match(gather, /_gdeltNews\(regionQ,srcSink,null,wLeft\(\)\)/,
    'a wLeft() that is only CONSULTED gates whether to START another attempt and never bounds one — '
    + 'which is how three 14 s attempts cost 42 s inside a 20 s budget');
});

/* ── ④b …and a caller that names no budget still gets a GDELT-sized one ────────────────────────── */
test('R464 ④b: the default GDELT budget can pay for a cold read, at the sites that name none', async () => {
  const budgets = [];
  const CTX = {
    _fetchJSON: async (_u, budgetMs) => { budgets.push(budgetMs); return null; },
    askAIJSON: async () => null,
    countryStats: {},
    nm: (s) => String(s || ''),
    EVIDENCE_BUDGET_MS: ATLAS_BUDGETS.EVIDENCE_BUDGET_MS,
    WEB_BUDGET_MS: ATLAS_BUDGETS.WEB_BUDGET_MS,
    turnSignal: () => undefined,
  };
  const S = makeAtlasSources({ lang: 'en' }, CTX);
  await S._gdeltNews('"Japan"', []);                       /* no budget named — the research map, the brief, events */
  const own = Number(/OWN_RELAY_TIMEOUT_MS\s*=\s*(\d+)/.exec(code('js/proxy-fetch.js'))[1]);
  assert.equal(budgets.length, 1);
  assert.ok(budgets[0] >= own,
    `a GDELT call that names no budget got ${budgets[0]} ms, which cannot pay for a cold read through `
    + `gdelt-relay (${own} ms). Falling through to EVIDENCE_BUDGET_MS `
    + `(${ATLAS_BUDGETS.EVIDENCE_BUDGET_MS}) aborts exactly the upstream read that fills the shared `
    + 'cache, so every site keeps paying full price while merely looking unlucky');
  /* the console must actually supply it, or the default above is a number nobody receives */
  assert.match(code('js/atlas-console.js'), /WEB_BUDGET_MS,\s*turnSignal/,
    'js/atlas-console.js must hand WEB_BUDGET_MS to makeAtlasSources');
});

/* ── ⑤ the web budget can actually pay for one cold read through our relay ─────────────────────── */
test('R464 ⑤: WEB_BUDGET_MS covers one cold gdelt-relay read, or the cache could never warm', () => {
  const own = /OWN_RELAY_TIMEOUT_MS\s*=\s*(\d+)/.exec(code('js/proxy-fetch.js'));
  assert.ok(own, 'our own relay needs a clock of its own');
  assert.ok(ATLAS_BUDGETS.WEB_BUDGET_MS >= Number(own[1]),
    `WEB_BUDGET_MS (${ATLAS_BUDGETS.WEB_BUDGET_MS}) must be able to pay for one cold relay read `
    + `(${own[1]}) — a budget shorter than that aborts precisely the upstream read that FILLS the `
    + 'cache, so every reader would pay full price forever');
  /* a cold read must also fit inside the gather it belongs to, or settleWithin gives up on it */
  assert.ok(ATLAS_BUDGETS.GATHER_BUDGET_MS >= ATLAS_BUDGETS.WEB_BUDGET_MS,
    'the whole gather must outlast the GDELT ladder inside it');
});

/* ── ⑥ the relay's allow-list, executed ────────────────────────────────────────────────────────── */
const RELAY = read('supabase/functions/gdelt-relay/index.ts');
/* the guard and the key derivation are plain JavaScript in a .ts file (scripts/static-checks.mjs
   parses every committed .ts with acorn), so the real functions can simply be run. */
const relayFns = new Function(
  RELAY.slice(RELAY.indexOf('const ALLOWED_PARAMS'), RELAY.indexOf('async function cacheKey'))
  + ' return { allowed, canonical };',
)();

test('R464 ⑥: the relay forwards the one endpoint the app builds, and refuses everything else', () => {
  assert.equal(relayFns.allowed(GDELT), true, 'the URL js/atlas-sources.js composes must be relayed');

  const refused = [
    ['http://api.gdeltproject.org/api/v2/doc/doc?query=x', 'plain http'],
    ['https://evil.example.com/api/v2/doc/doc?query=x', 'another host'],
    ['https://api.gdeltproject.org.evil.com/api/v2/doc/doc?query=x', 'a look-alike host'],
    ['https://api.gdeltproject.org/api/v2/geo/geo?query=x', 'another GDELT endpoint'],
    ['https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist', 'no query at all'],
    ['https://api.gdeltproject.org/api/v2/doc/doc?query=x&callback=alert', 'an unlisted parameter'],
    ['https://api.gdeltproject.org/api/v2/doc/doc?query=x#f', 'a fragment'],
    [`https://api.gdeltproject.org/api/v2/doc/doc?query=${'x'.repeat(600)}`, 'an oversized query'],
  ];
  refused.forEach(([u, why]) => {
    assert.equal(relayFns.allowed(u), false, `${why} must be refused: ${u.slice(0, 80)}`);
  });
});

test('R464 ⑦: the cache key is the QUESTION, so parameter order cannot halve the hit rate', () => {
  const a = 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Japan%22&mode=artlist&format=json';
  const b = 'https://api.gdeltproject.org/api/v2/doc/doc?format=json&mode=artlist&query=%22Japan%22';
  assert.equal(relayFns.canonical(a), relayFns.canonical(b),
    'the same question asked with the parameters in a different order is the same question');
  const c = 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Kenya%22&mode=artlist&format=json';
  assert.notEqual(relayFns.canonical(a), relayFns.canonical(c),
    '…and a different question must not share a cache entry with it');
});

/* ── ⑧ the relay must not be folded into the public race ───────────────────────────────────────── */
test('R464 ⑧: gdelt-relay is not one of the raced proxies', () => {
  const src = code('js/proxy-fetch.js');
  const race = /const PUBLIC_PROXIES = \[([\s\S]*?)\];/.exec(src);
  assert.ok(race, 'the public relay list must still exist');
  assert.ok(!race[1].includes('gdelt-relay'),
    'a racer is aborted at PROXY_TIMEOUT_MS (8 s). Our relay is waiting on a host whose fastest '
    + 'measured answer is 10.7 s, so racing it would abort every cold miss — i.e. exactly the reads '
    + 'that fill the cache, which would then never warm');
  const proxiesFor = /const proxiesFor = \(u\) => \{([\s\S]*?)\n  \};/.exec(src);
  assert.ok(proxiesFor, 'proxiesFor must still exist');
  assert.ok(!proxiesFor[1].includes('gdelt-relay'),
    'gdelt-relay must be tried on its own clock, ahead of the ladder, not inside it');
  /* …and news-relay must still be in there: Google News answers in ~700 ms and racing it is right */
  assert.match(src, /news-relay\?u=/, 'news-relay stays inside the race it has always been in');
});

/* ── ⑨ the relay only remembers what GDELT actually answered ───────────────────────────────────── */
test('R464 ⑨: nothing is written to the shared cache unless GDELT returned a real article list', () => {
  const src = RELAY.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const refresh = /async function refresh\([\s\S]*?\n\}/.exec(src);
  assert.ok(refresh, 'the upstream read must live in one function');
  assert.match(refresh[0], /if\s*\(!r\.ok\)\s*return null/,
    'a 429 — measured as 4 responses in 5 — must never become a cache entry');
  assert.match(refresh[0], /Array\.isArray\(j\.articles\)/,
    'a 200 that is not the artlist JSON must not be cached as though it were (news-relay applies '
    + "the same rule to Google's interstitial)");
  const writeAt = refresh[0].indexOf('writeCache');
  const guardAt = refresh[0].indexOf('Array.isArray(j.articles)');
  assert.ok(guardAt !== -1 && writeAt > guardAt,
    'the write happens AFTER the shape is verified — which is also what bounds how many objects a '
    + "stranger can create, since GDELT's own throttle caps successes");
});
