/* ============================================================================
 *  #R446 — 記事リーダーの Strategy 2 は、構造的に必ず失敗していた
 * ----------------------------------------------------------------------------
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
 *  here: `fetch` is stubbed and the four relays answer with bodies measured from the real ones.
 *  The two wiring checks read source through `codeOnly`, so this file's own prose — which
 *  necessarily spells out the defect — can never be what a check matches (#R345).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { fetchViaProxy } from '../js/proxy-fetch.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

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
  return Promise.resolve(fn(calls)).finally(() => { globalThis.fetch = real; });
}

const LINK = 'https://dw.com/en/india-news-police-used-excessive-force/live-78480551';

/* ── ① the article the ladder was already receiving is now an answer ──────────────────────────── */
test('R446 ①: as:"html" accepts a news article page — the default still accepts only a feed', async () => {
  await withFetch({ 'corsproxy.io': ARTICLE }, async () => {
    const html = await fetchViaProxy(LINK, { as: 'html', budgetMs: 4000 });
    assert.equal(html, ARTICLE, 'the page the relay returned must come back to the caller');
  });
  /* …and the feed caller is untouched: the SAME body, asked for the old way, is still discarded.
     This is the whole of the pre-#R446 behaviour, stated as a property rather than assumed. */
  await withFetch({ 'corsproxy.io': ARTICLE }, async () => {
    assert.equal(await fetchViaProxy(LINK, { budgetMs: 500 }), null, 'an article is not a feed');
  });
  await withFetch({ 'corsproxy.io': FEED }, async () => {
    assert.equal(await fetchViaProxy(LINK, { budgetMs: 500 }), FEED, 'a feed still is one');
  });
});

/* ── ② …and a relay apologising is not an article ─────────────────────────────────────────────── */
test('R446 ②: as:"html" refuses a relay error envelope and a bot interstitial, at 200', async () => {
  for (const [what, body] of [['a JSON error envelope', RELAY_JSON_ERROR], ['an interstitial', INTERSTITIAL]]) {
    await withFetch({ 'corsproxy.io': body }, async () => {
      assert.equal(await fetchViaProxy(LINK, { as: 'html', budgetMs: 500 }), null,
        `${what} must not reach the reader as the article body`);
    });
  }
  /* a page with a doctype and nothing the caller can read is not an answer either */
  await withFetch({ 'corsproxy.io': '<!doctype html><html><body><div>' + 'z'.repeat(9000) + '</div></body></html>' }, async () => {
    assert.equal(await fetchViaProxy(LINK, { as: 'html', budgetMs: 500 }), null,
      'a document with no paragraph and no description cannot yield a block');
  });
  /* and one relay failing does not stop the next one from winning */
  await withFetch({ 'corsproxy.io': RELAY_JSON_ERROR, 'codetabs': ARTICLE }, async () => {
    assert.equal(await fetchViaProxy(LINK, { as: 'html', budgetMs: 4000 }), ARTICLE);
  });
});

/* ── ③ the ladder costs what the caller said it may cost ──────────────────────────────────────── */
test('R446 ③: opts.budgetMs bounds the whole ladder, race and fallback together', async () => {
  await withFetch({}, async (calls) => {        /* every relay hangs — the measured 20.3 s case */
    const t0 = Date.now();
    const got = await fetchViaProxy(LINK, { as: 'html', budgetMs: 600 });
    const ms = Date.now() - t0;
    assert.equal(got, null, 'nothing answered, so the answer is null');
    assert.ok(ms < 4000, `the ladder must end inside its budget, took ${ms} ms`);
    assert.ok(calls.length >= 4, 'all four relays are still raced — the budget is not a shortcut');
  });
  /* the constants that make that true, and the default for callers that name no budget */
  const pf = R('js/proxy-fetch.js');
  assert.match(pf, /const BUDGET_MS = \d+/, 'there must be a default end-to-end budget');
  /* ⚠ (#R452) THE PROPERTY IS 「THE BUDGET IS A CLOCK, NOT A FLAG」, and the exact expression was one
     way of holding it. `left()` now also reads zero the moment the CALLER's signal aborts, which is
     strictly more clock-like, not less — pinning the old spelling would have gone red on a change
     that only made the guarantee stronger. */
  assert.match(pf, /const left = \(\) => [^;]*budget - \(Date\.now\(\) - t0\)/, 'the budget is a clock, not a flag');
  assert.match(pf, /Math\.min\(PROXY_FALLBACK_MS, left\(\)\)/, 'the bounded pass is bounded by it too');
  assert.match(pf, /if \(left\(\) <= 0\) break;/, '…and stops entirely when the budget is gone');
});

/* ── ④ the reader asks for the thing it parses, and inside a budget ───────────────────────────── */
test('R446 ④: js/article-reader.js asks for HTML, with what is left of one reader budget', () => {
  const ar = codeOnly(R('js/article-reader.js'));
  assert.match(ar, /fetchViaProxy\(item\.link,\{as:'html',budgetMs:left\}\)/,
    'Strategy 2 must ask for the document shape it parses, and hand over a deadline');
  assert.match(ar, /const READER_BUDGET_MS=\d+/, 'one ceiling for both strategies');
  assert.match(ar, /const left=READER_BUDGET_MS-\(Date\.now\(\)-t0\)/, 'Strategy 2 gets what Strategy 1 left');
  assert.match(ar, /\(left>0\)\?/, '…and is skipped outright when nothing is left');
  assert.doesNotMatch(ar, /HOST\.fetchViaProxy\(item\.link\)\s*;/, 'the un-opted call must be gone');
});

/* ── ⑤ …and Strategy 1 no longer returns somebody else's error page as the article ────────────── */
test('R446 ⑤: an extract too short to be prose is not accepted as the body', () => {
  const ar = codeOnly(R('js/article-reader.js'));
  assert.match(ar, /const MIN_ARTICLE_CHARS=\d+/, 'there must be a floor on the extracted text');
  assert.match(ar, /parsed\.blocks\.length>=2&&blockChars\(parsed\.blocks\)>=MIN_ARTICLE_CHARS/,
    'the block COUNT alone let a two-line error page through — measured, 79 characters');
  /* the floor has to be above the measured error boundary and below any real lede */
  const floor = Number((R('js/article-reader.js').match(/const MIN_ARTICLE_CHARS=(\d+)/) || [])[1]);
  assert.ok(floor > 79, `«Something went wrong.» + «We have been notified…» is 79 chars; floor is ${floor}`);
  assert.ok(floor <= 400, 'a floor this high would start refusing short but real articles');

  /* the two floors are one rule, so the same reasoning is spelled out where the fetch happens */
  const pf = R('js/proxy-fetch.js');
  assert.match(pf, /const HTML_MIN_BYTES = \d+/, 'the HTML side needs its own floor');
  /* ⚠ (#R452) …and the table gained a third row (`json: isJSON`, for Atlas's evidence fetches).
     The claim is that every acceptor lives in ONE table rather than being scattered per call site;
     a new row satisfies that claim, so the check reads the table rather than counting it. */
  assert.match(pf, /const ACCEPT = \{[^}]*feed: isFeed[^}]*html: isHTML[^}]*\}/, 'and the predicates are one table');
});

/* ── ⑥ the note that said the caller discards article HTML is no longer true ──────────────────── */
test('R446 ⑥: news-relay no longer claims js/proxy-fetch.js discards an article page', () => {
  const relay = R('supabase/functions/news-relay/index.ts');
  assert.ok(!/returns only documents that\s*\n?\s*contain `<rss`\/`<feed`, so an article's HTML is discarded by the caller/.test(relay),
    'that parenthetical expired with #R446 — the reader now asks for exactly such a page');
  /* the guarantee it was decorating is untouched: the relay forwards two endpoints, not a directory */
  assert.match(relay, /const TOPIC_RE = \/\^\\\/rss\\\/headlines/, 'the headlines endpoint is still pinned');
  assert.match(relay, /"\/rss\/search"/, 'and so is the search endpoint');
});
