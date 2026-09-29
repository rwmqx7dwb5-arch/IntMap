/* ============================================================================
 *  IntMap · the proxy ladder (js/proxy-fetch.js) and the relays it reaches first
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r446-checks and tests/r464-checks.
 *
 *  #R446 — 記事リーダーの Strategy 2 は、構造的に必ず失敗していた
 *  js/article-reader.js fetchReadable() has two strategies. The second one hands a news ARTICLE's
 *  URL to js/proxy-fetch.js and parses the answer as HTML — but that function's ONLY acceptance
 *  test was `isFeed` (「the body contains `<rss` or `<feed`」). An article page contains neither, so
 *  the branch could not succeed; it could only take twenty seconds to fail.
 *
 *  MEASURED from the live site (https://rwmqx7dwb5-arch.github.io, 2026-08-25), the two article
 *  URLs on the front page that day, through the shipped ladder:
 *
 *      corsproxy.io  200 · text/html · 217,509 B (dw.com)    → rejected «not feed»  3,362 ms
 *      corsproxy.io  200 · text/html · 198,238 B (aljazeera) → rejected «not feed»  1,087 ms
 *      corsfix 403 · allorigins aborted at 8 s · codetabs aborted at 8 s
 *      …then the bounded pass fetched the SAME page again (8 ms / 21 ms, from cache) and rejected
 *      it a second time.  TOTAL 20,313 ms / 20,355 ms → `null`, both times.
 *
 *  …and driving this module's own fetchReadable() end to end showed WHY nobody had noticed:
 *  Strategy 1 (r.jina.ai) answered 200 with 572 bytes whose 「Markdown Content:」 was DW's own error
 *  boundary — 「Something went wrong.」/「We have been notified and are looking into it.」 — which
 *  cleared both of its gates (572 > 200 bytes, 2 blocks) and was returned as ok:true. The reader
 *  would have drawn somebody else's error message as the article, and Strategy 2 never ran.
 *
 *  ⚠ THESE CHECKS DRIVE THE SHIPPED MODULE. js/proxy-fetch.js has one export, no DOM and no
 *  globals beyond a try/caught `window`, so the decision the browser makes is the decision made
 *  here: `fetch` is stubbed and the rungs answer with bodies measured from the real relays.
 *  (own-fetch-relay) The rungs are now the publisher itself and our fetch-relay's article rule; the bodies
 *  the public relays returned are kept, because what is refused is the SHAPE, whoever sends it.
 *  The two wiring checks read source through `codeOnly`, so this file's own prose — which
 *  necessarily spells out the defect — can never be what a check matches (#R345).
 *
 *  R464 — GDELT WAS UNREACHABLE, AND EVERY CLOCK POINTED AT IT WAS TOO SHORT TO NOTICE
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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { fetchViaProxy, ownRelayUrl } from '../js/proxy-fetch.js';
import { ARTICLE_MIN_BYTES } from '../supabase/functions/_shared/fetch-relay-policy.js';
import { liftFunction } from './helpers/lift-function.mjs';
import { makeAtlasSources } from '../js/atlas-sources.js';
import { ATLAS_BUDGETS } from '../js/atlas-deadlines.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ (#R345, fifteen rounds of it) A COMMENT THAT DESCRIBES THE DEFECT IS NOT THE DEFECT. Every file
   #R464 touched explains in prose what it used to do, so a raw-text check for 「the old number
   is gone」 would be satisfied by the note saying it is gone. */
const code = (p) => codeOnly(read(p));
/* ── the bodies, in the shapes the real relays returned ───────────────────────────────────────── */

/* a news article page: a doctype, paragraphs, an og:image — the 198–217 KB shape, in miniature but
   over the byte floor, because the floor is one of the things under test */
const ARTICLE = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
  + '<meta property="og:image" content="https://example.org/hero.jpg">'
  + '<meta property="og:description" content="Amnesty International alleges excessive force.">'
  + '</head><body><article>'
  + '<p>Amnesty International alleges that police in the capital used excessive force against protesters.</p>'
  + '<p>The organisation said it had documented the use of lethal weapons in at least two states.</p>'
  + '</article>'
  + '<!-- ' + 'x'.repeat(5000) + ' -->'
  + '</body></html>';

/* corsfix, measured: 403 + 314 bytes of JSON. Here it is served with 200, because a status the
   ladder already refuses cannot show whether the BODY is refused. */
const RELAY_JSON_ERROR = '{ "corsfix_error": "domain_not_registered", "message": '
  + '"This website domain hasn\'t been registered to use the proxy" }';

/* #R216 measured Google's bot interstitial at 2,041 bytes of real HTML — with paragraphs in it.
   It is HTML, it is not an article, and it must not become one. */
const INTERSTITIAL = '<!doctype html><html><head><title>Sorry...</title></head><body>'
  + '<p>Our systems have detected unusual traffic from your computer network.</p>'
  + '<p>' + 'y'.repeat(1200) + '</p></body></html>';

const FEED = '<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>';

/* ── a stubbed relay set ──────────────────────────────────────────────────────────────────────── */

/* `plan` maps a substring of the proxy URL to what that relay does: a string body (200), an
   {status, body} pair, or 'hang' — which never settles until the deadline aborts it. */
function withFetch(plan, fn) {
  const real = globalThis.fetch;
  const realWindow = globalThis.window;
  globalThis.window = { SUPABASE_URL: 'https://sb.test' };
  const calls = [];
  globalThis.fetch = (u, init) => {
    const url = String(u);
    calls.push(url);
    const key = Object.keys(plan).find((k) => url.includes(k));
    const what = key ? plan[key] : 'hang';
    const signal = init && init.signal;
    if (what === 'hang') {
      return new Promise((_res, rej) => {
        const bail = () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (signal && signal.aborted) return bail();
        if (signal) signal.addEventListener('abort', bail);
      });
    }
    const status = (what && what.status) || 200;
    const body = (what && what.body !== undefined) ? what.body : what;
    return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });
  };
  return Promise.resolve(fn(calls)).finally(() => { globalThis.fetch = real; globalThis.window = realWindow; });
}

const LINK = 'https://dw.com/en/india-news-police-used-excessive-force/live-78480551';
/* (own-fetch-relay) the rung an article page now travels by: our own fetch-relay's article rule, not a public
   relay. Keys of `withFetch` plans are substrings of the requested URL. */
const ARTICLE_RELAY = 'functions/v1/fetch-relay?as=article';

/* ── ① the article the ladder was already receiving is now an answer ──────────────────────────── */
test('R446 ①: as:"html" accepts a news article page — the default still accepts only a feed', async () => {
  await withFetch({ [ARTICLE_RELAY]: ARTICLE }, async () => {
    const html = await fetchViaProxy(LINK, { as: 'html', budgetMs: 4000 });
    assert.equal(html, ARTICLE, 'the page the relay returned must come back to the caller');
  });
  /* …and the feed caller is untouched: the SAME body, asked for the old way, is still discarded.
     This is the whole of the pre-#R446 behaviour, stated as a property rather than assumed.
     (own-fetch-relay) Only an `as:'html'` call is offered the article relay, so the feed-shaped asks go to the
     host itself — the one rung a feed caller has for a URL no relay of ours lists. */
  await withFetch({ [LINK]: ARTICLE }, async () => {
    assert.equal(await fetchViaProxy(LINK, { direct: true, budgetMs: 500 }), null, 'an article is not a feed');
  });
  await withFetch({ [LINK]: FEED }, async () => {
    assert.equal(await fetchViaProxy(LINK, { direct: true, budgetMs: 500 }), FEED, 'a feed still is one');
  });
});

/* ── ② …and a relay apologising is not an article ─────────────────────────────────────────────── */
test('R446 ②: as:"html" refuses a relay error envelope and a bot interstitial, at 200', async () => {
  for (const [what, body] of [['a JSON error envelope', RELAY_JSON_ERROR], ['an interstitial', INTERSTITIAL]]) {
    await withFetch({ [ARTICLE_RELAY]: body }, async () => {
      assert.equal(await fetchViaProxy(LINK, { as: 'html', budgetMs: 500 }), null,
        `${what} must not reach the reader as the article body`);
    });
  }
  /* a page with a doctype and nothing the caller can read is not an answer either */
  await withFetch({ [ARTICLE_RELAY]: '<!doctype html><html><body><div>' + 'z'.repeat(9000) + '</div></body></html>' }, async () => {
    assert.equal(await fetchViaProxy(LINK, { as: 'html', budgetMs: 500 }), null,
      'a document with no paragraph and no description cannot yield a block');
  });
  /* and one rung failing does not stop the next one from winning (own-fetch-relay: the rungs are the
     publisher itself and our article relay) */
  await withFetch({ [LINK]: RELAY_JSON_ERROR, [ARTICLE_RELAY]: ARTICLE }, async () => {
    assert.equal(await fetchViaProxy(LINK, { as: 'html', direct: true, budgetMs: 4000 }), ARTICLE);
  });
});

/* ── ③ the ladder costs what the caller said it may cost ──────────────────────────────────────── */
test('R446 ③: opts.budgetMs bounds the whole ladder — every racer, and there is no second pass', async () => {
  await withFetch({}, async (calls) => {        /* every relay hangs — the measured 20.3 s case */
    const t0 = Date.now();
    const got = await fetchViaProxy(LINK, { as: 'html', budgetMs: 600 });
    const ms = Date.now() - t0;
    assert.equal(got, null, 'nothing answered, so the answer is null');
    assert.ok(ms < 4000, `the ladder must end inside its budget, took ${ms} ms`);
    assert.ok(calls.some((c) => c.includes(ARTICLE_RELAY)), 'our relay is still asked — the budget is not a shortcut');
  });
  /* the constants that make that true, and the default for callers that name no budget */
  const pf = R('js/proxy-fetch.js');
  assert.match(pf, /const BUDGET_MS = \d+/, 'there must be a default end-to-end budget');
  /* ⚠ (#R452) THE PROPERTY IS 「THE BUDGET IS A CLOCK, NOT A FLAG」, and the exact expression was one
     way of holding it. `left()` now also reads zero the moment the CALLER's signal aborts, which is
     strictly more clock-like, not less — pinning the old spelling would have gone red on a change
     that only made the guarantee stronger. */
  assert.match(pf, /const left = \(\) => [^;]*budget - \(Date\.now\(\) - t0\)/, 'the budget is a clock, not a flag');
  /* (own-fetch-relay) a relay may carry its own attempt clock (`make.ms`); whichever clock it is, the
     budget's `left()` still caps every racer.
     (relay-no-data-one-pass) The "bounded pass" this line used to pin is gone — it re-sent the SAME
     request to the SAME relay (tests/relay-no-data-one-pass-checks ②), so there is no second pass for
     the budget to bound: every request the ladder makes is a racer, and every racer is capped here. */
  assert.match(pf, /Math\.min\((?:make\.ms \|\| )?PROXY_TIMEOUT_MS, left\(\)\)/, 'every racer is bounded by the budget');
  assert.doesNotMatch(pf, /PROXY_FALLBACK_MS/, 'and no second pass re-sends what the race already sent');
});

/* ── ④ the reader asks for the thing it parses, and inside a budget ───────────────────────────── */
/* EVALUATED: js/article-reader.js is a DOM factory, but its fetch path is not. The constants, the
   Markdown cleaner and fetchReadable() are lifted out of the comment-stripped source and run with a
   stub `fetch` (Strategy 1, r.jina.ai), a stub `HOST.fetchViaProxy` (Strategy 2) and a stub clock. */
function articleReader({ jinaMarkdown = null, proxy = async () => null, now = null } = {}) {
  const s = codeOnly(R('js/article-reader.js'));
  const fr = liftFunction(s, 'fetchReadable');
  const a = s.indexOf('const READER_NOISE');
  assert.ok(a > 0, 'the reader constants are no longer declared ahead of fetchReadable');
  const fetchImpl = async () => (jinaMarkdown == null ? { ok: false, text: async () => '' } : {
    ok: true,
    /* the r.jina.ai envelope: a header well over the 200-byte gate, then the article as Markdown */
    text: async () => 'Title: DW\nURL Source: https://dw.com/x\nPublished Time: 2026-08-25\n' + 'x'.repeat(150)
      + '\nMarkdown Content:\n' + jinaMarkdown,
  });
  return new Function('HOST', 'fetch', 'Date', s.slice(a, s.indexOf(fr) + fr.length) + '\nreturn fetchReadable;')(
    { fetchViaProxy: proxy }, fetchImpl, now ? { now } : Date);
}
/* measured: DW's error boundary, as r.jina.ai returned it — 79 characters of prose in two blocks */
const DW_ERROR_MD = 'Something went wrong.\n\nWe have been notified and are looking into it.\n';
/* a short but real lede: two paragraphs, 400 characters of prose between them — any floor above that
   would start refusing short but real articles */
const para = (t) => (t + ' ').repeat(10).slice(0, 199) + '.';
const REAL_LEDE_MD = para('Amnesty International alleges that police in the capital used excessive force against protesters')
  + '\n\n' + para('The organisation said it had documented the use of lethal weapons in at least two states') + '\n';
/* a clock that moves `step` ms every time the reader reads it */
const steppingClock = (step) => { let t = 1_000_000; return () => { const v = t; t += step; return v; }; };

test('R446 ④: js/article-reader.js asks for HTML, with what is left of one reader budget', async () => {
  const asked = [];
  await articleReader({ proxy: async (u, o) => { asked.push([u, o]); return null; } })({ link: LINK });
  assert.equal(asked.length, 1, 'Strategy 2 must run when Strategy 1 has nothing');
  const [u, o] = asked[0];
  assert.equal(u, LINK);
  assert.ok(o && o.as === 'html' && o.direct === true,
    'Strategy 2 must ask for the document shape it parses, and hand over a deadline: ' + JSON.stringify(o));
  assert.ok(Number.isFinite(o.budgetMs) && o.budgetMs > 0, 'the un-opted call must be gone — a budget is handed over');
  /* one ceiling for both strategies: Strategy 2 gets what Strategy 1 left, on the reader's own clock */
  const still = [], moving = [];
  await articleReader({ now: steppingClock(0), proxy: async (_u, o2) => { still.push(o2.budgetMs); return null; } })({ link: LINK });
  await articleReader({ now: steppingClock(7000), proxy: async (_u, o3) => { moving.push(o3.budgetMs); return null; } })({ link: LINK });
  assert.equal(still[0] - moving[0], 7000, 'Strategy 2 gets what Strategy 1 left, not a budget of its own');
  /* …and is skipped outright when nothing is left */
  const none = [];
  await articleReader({ now: steppingClock(10 * 60_000), proxy: async () => { none.push(1); return null; } })({ link: LINK });
  assert.equal(none.length, 0, 'with the whole reader budget spent, Strategy 2 must not start');
});

/* ── ⑤ …and Strategy 1 no longer returns somebody else's error page as the article ────────────── */
test('R446 ⑤: an extract too short to be prose is not accepted as the body', async () => {
  /* the block COUNT alone let a two-line error page through — measured, 79 characters */
  const err = await articleReader({ jinaMarkdown: DW_ERROR_MD })({ link: LINK });
  assert.equal(err.ok, false, 'DW\'s «Something went wrong.» must not be drawn as the article');
  const real = await articleReader({ jinaMarkdown: REAL_LEDE_MD })({ link: LINK });
  assert.equal(real.ok, true, 'a short but real two-paragraph lede must still be accepted — the floor is not a wall');
  assert.equal(real.blocks.length, 2);

  /* the two floors are one rule: the HTML side refuses exactly what the relay's policy refuses.
     (own-fetch-relay) the number lives in the policy file, because fetch-relay applies the same test
     before it hands an article page back; the page reads it from there — so it is asked of both. */
  assert.ok(Number.isInteger(ARTICLE_MIN_BYTES) && ARTICLE_MIN_BYTES > 0, '…stated once, in the policy');
  const pre = ARTICLE.slice(0, ARTICLE.indexOf('<!-- ') + 5), post = ' --></body></html>';
  const at = (n) => pre + 'x'.repeat(n - pre.length - post.length) + post;
  const short = at(ARTICLE_MIN_BYTES - 1), enough = at(ARTICLE_MIN_BYTES);
  assert.equal(short.length, ARTICLE_MIN_BYTES - 1);
  await withFetch({ [ARTICLE_RELAY]: short }, async () => {
    assert.equal(await fetchViaProxy(LINK, { as: 'html', budgetMs: 500 }), null, 'one byte under the policy floor is refused');
  });
  await withFetch({ [ARTICLE_RELAY]: enough }, async () => {
    assert.equal(await fetchViaProxy(LINK, { as: 'html', budgetMs: 4000 }), enough, 'the policy floor itself is accepted');
  });
  /* ⚠ READ, NOT RUN: the acceptor table is module-private in js/proxy-fetch.js; the claim is that every
     acceptor lives in ONE table rather than per call site. (#R452) a new row satisfies that claim. */
  assert.match(R('js/proxy-fetch.js'), /const ACCEPT = \{[^}]*feed: isFeed[^}]*html: isHTML[^}]*\}/, 'and the predicates are one table');
});

/* ── ⑥ the note that said the caller discards article HTML is no longer true ──────────────────── */
test('R446 ⑥: news-relay no longer claims js/proxy-fetch.js discards an article page', () => {
  /* ⚠ READ, NOT RUN: the claim is about a sentence in supabase/functions/news-relay/index.ts (a Deno function), and the two endpoint patterns it pins are module-private. */
  const relay = R('supabase/functions/news-relay/index.ts');
  assert.ok(!/returns only documents that\s*\n?\s*contain `<rss`\/`<feed`, so an article's HTML is discarded by the caller/.test(relay),
    'that parenthetical expired with #R446 — the reader now asks for exactly such a page');
  /* the guarantee it was decorating is untouched: the relay forwards two endpoints, not a directory */
  assert.match(relay, /const TOPIC_RE = \/\^\\\/rss\\\/headlines/, 'the headlines endpoint is still pinned');
  assert.match(relay, /"\/rss\/search"/, 'and so is the search endpoint');
});

/* ══════════════════ #R464 — GDELT, and every clock pointed at it ══════════════════ */
const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Japan%22&mode=artlist'
  + '&maxrecords=14&format=json&timespan=3d&sort=hybridrel';
const SUPA = 'https://vpekfwdpurzejrrmacac.supabase.co';
/* the fastest thing GDELT did across 33 measured attempts from two egress IPs, in ms */
const GDELT_FASTEST_OBSERVED_MS = 10700;

const orHang = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res('HUNG'), ms))]);

/* ── ① our relay is asked BEFORE the reader's own IP, and before the public ladder ─────────────── */
test('R464 ①: a GDELT fetch reaches gdelt-relay first, then the host (no public relay follows since own-fetch-relay)', async () => {
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
  /* ⚠ READ, NOT RUN: the per-host deadlines are module-private to js/proxy-fetch.js, and exercising a >10.7 s deadline would cost that long per run. */
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
  /* ⚠ READ, NOT RUN: the chained calls live in js/atlas-console.js's turn code, which needs the whole Atlas kernel and a map to run. */
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
  /* ⚠ (#R769) THE ARITY IS NOT THE INVARIANT. This read `/_gdeltNews\(regionQ,srcSink,null,wLeft\(\)\)/`
     — the call as it was spelled in #R464 — so adding a fifth argument failed it while the budget was
     still being handed over exactly as before. The defect this guards is 「wLeft() is consulted but
     never passed」, so it is measured on the 4th argument of EVERY call on that line, whatever comes
     after it (.agents/rules/no-ad-hoc-hardcoding.md section 5: a check that fixes a spelling stops
     measuring the fact). */
  /* ⚠ A REGEX CANNOT SPLIT THESE ARGUMENTS. `wLeft()` and `nn()` contain the very parentheses the
     pattern would have to balance, and the first attempt at this check matched
     «_gdeltNews(regionQ,srcSink,null,wLeft(» — i.e. it read the 4th argument as truncated and failed
     a call that was correct. Scanned with a depth counter instead. */
  const argsOf = (line, at) => {
    let d = 0; const out = []; let cur = '';
    for (let i = at; i < line.length; i++) {
      const ch = line[i];
      if (ch === '(') { d++; if (d === 1) continue; }
      if (ch === ')') { d--; if (d === 0) { out.push(cur); return out; } }
      if (ch === ',' && d === 1) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    return null;
  };
  let found = 0;
  for (let i = gather.indexOf('_gdeltNews('); i >= 0; i = gather.indexOf('_gdeltNews(', i + 1)) {
    const args = argsOf(gather, i + '_gdeltNews'.length);
    assert.ok(args, `a _gdeltNews call on the gather line must have balanced parentheses: «${gather.slice(i, i + 80)}»`);
    assert.equal((args[3] || '').trim(), 'wLeft()',
      'a wLeft() that is only CONSULTED gates whether to START another attempt and never bounds one — '
      + `which is how three 14 s attempts cost 42 s inside a 20 s budget: «${gather.slice(i, i + 80)}»`);
    found++;
  }
  assert.ok(found >= 2, `the gather must still chain its GDELT calls (found ${found})`);
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
  /* (own-fetch-relay) there is no public relay list any more (nothing public is raced at all); what the check
     guards is unchanged — gdelt-relay is not a racer, because a racer is aborted at PROXY_TIMEOUT_MS
     (8 s), our relay is waiting on a host whose fastest measured answer is 10.7 s, and racing it
     would abort every cold miss, i.e. exactly the reads that fill the cache. The race is built by
     proxiesFor, below; that it never offers gdelt-relay is EVALUATED as well as read. */
  const realWindow = globalThis.window;
  globalThis.window = { SUPABASE_URL: SUPA };
  try {
    const gd = 'https://api.gdeltproject.org/api/v2/doc/doc?query=x&mode=artlist&format=json';
    for (const as of [undefined, 'json', 'html']) {
      /* ownRelayUrl answers gdelt-relay (the path that is tried first, alone) — never a raced relay */
      assert.match(ownRelayUrl(gd, as), /\/functions\/v1\/gdelt-relay\?u=/, 'GDELT goes to its own relay, on its own clock');
    }
  } finally { globalThis.window = realWindow; }
  const proxiesFor = /const proxiesFor = \(u(?:, as)?\) => \{([\s\S]*?)\n  \};/.exec(src);
  assert.ok(proxiesFor, 'proxiesFor must still exist');
  assert.ok(!proxiesFor[1].includes('gdelt-relay'),
    'gdelt-relay must be tried on its own clock, ahead of the ladder, not inside it');
  /* …and news-relay must still be in there: Google News answers in ~700 ms and racing it is right.
     ⚠ (#R533) THIS LINE USED TO BE `assert.match(src, /news-relay\?u=/)`, WHICH IS A SPELLING.
     `proxiesFor` now builds every one of our relays from an OWN_RELAYS table — the generalisation
     the Companies tab's share prices forced — so the literal became `${base}/functions/v1/${r.fn}`
     and this went red while the guarantee stood untouched. Third time in this round (see
     tests/r216-checks ① and tests/r452-checks ④), so it is worth saying plainly: what belongs in
     an assertion is the fact, and the fact here is that a Google News URL is offered to a relay of
     ours inside the raced list. */
  const tbl = /const OWN_RELAYS = \[([\s\S]*?)\n {2}\];/.exec(src);
  assert.ok(tbl, 'proxy-fetch must publish the table of our own relays');
  const rows = [...tbl[1].matchAll(/fn: '([a-z-]+)',\s*test: \(u\) => (\/[^\n]*?\/)\.test\(u\)/g)]
    .map(([, fn, re]) => ({ fn, re: new RegExp(re.slice(1, -1)) }));
  const news = rows.find((r) => r.fn === 'news-relay');
  assert.ok(news, 'news-relay stays inside the race it has always been in');
  assert.ok(news.re.test('https://news.google.com/rss/search?q=x'),
    'and it is still the relay offered for Google News feed URLs');
  /* gdelt-relay is NOT in that table — it is tried ahead of the ladder on its own longer clock */
  assert.ok(!rows.some((r) => r.fn === 'gdelt-relay'),
    'gdelt-relay must not be in the raced table; it has its own path above');
});

/* ── ⑨ the relay only remembers what GDELT actually answered ───────────────────────────────────── */
test('R464 ⑨: nothing is written to the shared cache unless GDELT returned a real article list', () => {
  /* ⚠ READ, NOT RUN: refresh() is a Deno Edge Function body that reads GDELT and Supabase storage; its guard order is asked of the statement. */
  const src = codeOnly(RELAY);
  const refresh = /async function refresh\([\s\S]*?\n\}/.exec(src);
  assert.ok(refresh, 'the upstream read must live in one function');
  /* ⚠ (#R769) THIS READ `/if \(!r\.ok\) return null/` — the 2026-08 spelling of 「give up」. #R769 made
     the upstream read a bounded ladder, so giving up became `continue`, and this failed while a 429
     was as far from the cache as it had ever been. What must be true is not a keyword: it is that
     NO path from a non-2xx reaches writeCache. Measured on the statement instead of the word. */
  const notOk = /if\s*\(!r\.ok\)\s*\{?([^}\n]*)\}?/.exec(refresh[0]);
  assert.ok(notOk, 'the upstream read must still test r.ok before doing anything with the body');
  assert.ok(!/writeCache/.test(notOk[1] || ''),
    'a 429 — measured as 4 responses in 5 — must never become a cache entry');
  assert.match(notOk[1] || '', /continue|return|break/,
    'a non-2xx must LEAVE this iteration; falling through would read the body of a refusal');
  assert.match(refresh[0], /Array\.isArray\(j\.articles\)/,
    'a 200 that is not the artlist JSON must not be cached as though it were (news-relay applies '
    + "the same rule to Google's interstitial)");
  const writeAt = refresh[0].indexOf('writeCache');
  const guardAt = refresh[0].indexOf('Array.isArray(j.articles)');
  assert.ok(guardAt !== -1 && writeAt > guardAt,
    'the write happens AFTER the shape is verified — which is also what bounds how many objects a '
    + "stranger can create, since GDELT's own throttle caps successes");
});
