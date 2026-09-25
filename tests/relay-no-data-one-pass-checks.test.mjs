/* ============================================================================
 *  relay-no-data-one-pass — an upstream's «there is nothing» is an answer, and nothing is asked twice
 * ----------------------------------------------------------------------------
 *  THE DEFECTS, as measured in production on 2026-09-26 (so the next variant fails here too):
 *
 *  ① Companies open, Chronos moved to 1850: the time machine asked quotes-relay for 1850 charts,
 *     Yahoo answered 400 「Data doesn't exist for startDate …」 — a precise «none» — and the relay
 *     turned it into 502 upstream_error. The page could not tell a true answer from a fault.
 *     ⇒ the relay answers the upstream's explicit «none» with 200 + `x-intmap-no-data: 1`
 *       (relay-guard.js noData), the page's ladder reports `reason:'no-data'` and stops, and the
 *       time machine does not ask a year it already knows has no price.
 *  ② js/proxy-fetch.js's "one bounded pass" sent THE SAME REQUEST TO THE SAME RELAY a second time
 *     whenever every racer had rejected (511wi twice, every pre-listing chart twice). A retry that does
 *     nothing different is forbidden (.agents/rules/one-pass-or-a-reason.md §5).
 *     ⇒ each rung is asked once, and the count is recorded (`note.attempts`).
 *  ③ fetch-relay's article rule returned Google News's 582,348-byte redirect shell (0 <p>, 0 <article>,
 *     the SITE's description meta) as an article, because the one shared predicate accepted any page
 *     with a description meta. ⇒ a page without a paragraph must declare itself an article.
 *
 *  Everything below EVALUATES the relay handlers, js/proxy-fetch.js and js/companies.js.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPA = 'https://sb.test';

/* a relay handler, run in a child with Deno.serve captured and the upstream stubbed */
function runEdge(fn, requests, routes) {
  const url = pathToFileURL(join(ROOT, 'supabase/functions', fn, 'index.ts')).href;
  const src = `
    globalThis.Deno = { env: { get: () => "" }, serve: (h) => { globalThis.__h = h; },
      resolveDns: async (h, t) => (t === "A" ? ["151.101.0.81"] : []) };
    const routes = ${JSON.stringify(routes)}.map(([re, r]) => [new RegExp(re), r]);
    globalThis.__calls = [];
    globalThis.fetch = async (u) => {
      const s = String(u && u.url ? u.url : u); globalThis.__calls.push(s);
      const hit = routes.find(([re]) => re.test(s)); const r = hit ? hit[1] : { status: 599, body: "" };
      return new Response(r.body, { status: r.status, headers: { "content-type": r.type || "application/json" } });
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = globalThis.__calls.length;
      const r = await globalThis.__h(new Request("http://relay.test/" + q));
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      out.push({ status: r.status, headers: h, body: await r.text(), calls: globalThis.__calls.length - before });
    }
    process.stdout.write(JSON.stringify(out)); process.exit(0);
  `;
  return JSON.parse(execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000, maxBuffer: 8 * 1024 * 1024 }));
}

/* the measured Yahoo answers */
const YAHOO_NO_RANGE = JSON.stringify({ chart: { result: null, error: { code: 'Bad Request', description: "Data doesn't exist for startDate = -3786825600, endDate = -3755376000" } } });
const YAHOO_NO_SYMBOL = JSON.stringify({ chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } });
const CHART_1850 = 'https://query1.finance.yahoo.com/v8/finance/chart/PG?period1=-3786825600&period2=-3755376000&interval=1mo';

test('① quotes-relay: Yahoo\'s explicit «no data» comes back as an answer, not as 502', () => {
  const q = '?u=' + encodeURIComponent(CHART_1850);
  const cases = [
    [400, YAHOO_NO_RANGE, 'application/json;charset=utf-8', true, 'Bad Request'],
    [404, YAHOO_NO_SYMBOL, 'application/json;charset=utf-8', true, 'Not Found'],
    [429, 'Too Many Requests', 'text/html', false],
    [400, '<html>bad gateway page</html>', 'text/html', false],
  ];
  for (const [status, body, type, isNone, code] of cases) {
    const [o] = runEdge('quotes-relay', [q], [['finance\\.yahoo\\.com', { status, body, type }]]);
    assert.equal(o.calls, 1, 'the upstream is asked once');
    if (isNone) {
      assert.equal(o.status, 200, `${status} ${code} is the upstream answering the question: ${o.body}`);
      assert.equal(o.headers['x-intmap-no-data'], '1', 'and it says so where the page can read it');
      assert.match(o.headers['access-control-expose-headers'] || '', /x-intmap-no-data/, '…exposed to cross-origin script');
      const j = JSON.parse(o.body);
      assert.equal(j.noData, true);
      assert.equal(j.upstream.code, code);
      assert.doesNotMatch(o.body, /startDate|delisted/, 'the upstream\'s prose is not relayed, only its code');
      assert.match(o.headers['cache-control'] || '', /s-maxage=\d+/, 'a period with no data is not asked again for a while');
    } else {
      assert.equal(o.status, 502, `${status} without Yahoo's envelope is still a failure`);
      assert.ok(!o.headers['x-intmap-no-data']);
    }
  }
});

test('① fetch-relay: a 404/410 from the upstream is «not there», any other non-2xx is still a failure', () => {
  const imf = '?u=' + encodeURIComponent('https://www.imf.org/external/datamapper/api/v1/NGDPD');
  for (const [status, none] of [[404, true], [410, true], [500, false], [403, false]]) {
    const [o] = runEdge('fetch-relay', [imf], [['imf\\.org', { status, body: 'upstream says', type: 'text/html' }]]);
    if (none) { assert.equal(o.status, 200); assert.equal(o.headers['x-intmap-no-data'], '1'); assert.doesNotMatch(o.body, /upstream says/); }
    else { assert.equal(o.status, 502); assert.ok(!o.headers['x-intmap-no-data']); }
  }
});

/* ── the page's ladder, evaluated with fetch stubbed ─────────────────────────────────────────── */
globalThis.window = { SUPABASE_URL: SUPA };
const { fetchViaProxy } = await import(pathToFileURL(join(ROOT, 'js/proxy-fetch.js')).href);
async function withFetch(answer, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (u) => { calls.push(String(u)); return answer(String(u)); };
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}

test('① the ladder reports «no data», returns null, and does not ask again', async () => {
  await withFetch(() => new Response('{"noData":true,"upstream":{"status":400,"code":"Bad Request"}}',
    { status: 200, headers: { 'content-type': 'application/json', 'x-intmap-no-data': '1' } }), async (calls) => {
    const note = {};
    const got = await fetchViaProxy(CHART_1850, { as: 'json', budgetMs: 5000, note });
    assert.equal(got, null, 'the no-data envelope is not handed back as the quote');
    assert.equal(note.reason, 'no-data', 'and the caller is told it was an answer, not a refusal');
    assert.equal(calls.length, 1, 'asked once: ' + calls.join(' | '));
    assert.equal(note.attempts, 1, 'and the count is recorded');
  });
});

test('② a rung that failed is not asked the same question again', async () => {
  const cases = [
    ['https://511wi.gov/map/mapIcons/Cameras', /fetch-relay\?u=/],
    [CHART_1850, /quotes-relay\?u=/],
  ];
  for (const [u, relay] of cases) {
    for (const answer of [() => new Response('{"error":"upstream_status"}', { status: 502 }), () => Promise.reject(new TypeError('network'))]) {
      await withFetch(answer, async (calls) => {
        const note = {};
        const got = await fetchViaProxy(u, { as: 'json', budgetMs: 5000, note });
        assert.equal(got, null);
        assert.equal(note.reason, 'refused');
        assert.equal(calls.length, 1, `one request to our relay, not a second identical one: ${calls.join(' | ')}`);
        assert.match(calls[0], relay);
        assert.equal(note.attempts, 1);
      });
    }
  }
  /* …and when there IS something different to do — the host itself — both are tried, each once */
  await withFetch(() => new Response('', { status: 502 }), async (calls) => {
    const note = {};
    await fetchViaProxy(CHART_1850, { as: 'json', direct: true, budgetMs: 5000, note });
    assert.equal(calls.length, 2, calls.join(' | '));
    assert.equal(new Set(calls).size, 2, 'two DIFFERENT requests');
    assert.equal(note.attempts, 2);
  });
});

/* ── the time machine does not ask a year it already knows has no price ─────────────────────── */
function companies(fetchViaProxyStub) {
  const window = {};
  const ctx = vm.createContext({ window, console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Map, Set, URL, encodeURIComponent });
  vm.runInContext(readFileSync(join(ROOT, 'js/companies.js'), 'utf8'), ctx);
  return window.IntMapModules.companies({ fetchViaProxy: fetchViaProxyStub });
}
test('① Chronos at 1850: no chart is asked for a year before a name\'s known history, and a «no data» is remembered', async () => {
  const charts = [];
  const C = companies(async (u, o) => {
    if (/\/spark\?/.test(u)) {
      /* the range=max history: every name starts in 1972 except one the history does not cover */
      const syms = decodeURIComponent(/symbols=([^&]*)/.exec(u)[1]).split(',');
      const out = {};
      syms.filter((s) => s !== 'PG').forEach((s) => { out[s] = { symbol: s, timestamp: [Date.UTC(1972, 11, 1) / 1000], close: [10] }; });
      return JSON.stringify(out);
    }
    charts.push(u);
    if (o && o.note) o.note.reason = 'no-data';
    return null;
  });
  const founded = C.DATA.filter((c) => c.sh > 0 && c.fnd <= 1850).map((c) => c.tk);
  assert.ok(founded.length >= 2, 'there are live names founded before 1850 (the measured case): ' + founded.join(','));
  await C.setYear(1850);
  assert.deepEqual(charts.map((u) => /chart\/([^?]+)/.exec(u)[1]), ['PG'],
    'only the name whose history is unknown is asked; the others\' history starts in 1972, which already says 1850 has nothing');
  await C.setYear(null);
  charts.length = 0;
  await C.setYear(1850);
  assert.deepEqual(charts, [], 'Yahoo\'s «no data» for PG in 1850 is remembered, not asked a second time');
  /* a gap INSIDE a known history is still asked — that is what the fallback is for */
  await C.setYear(1980);
  assert.ok(charts.length > 0, 'a year inside the history that has no close is still looked up');
});

/* ── ③ the one predicate refuses a site's shell ─────────────────────────────────────────────── */
test('③ looksLikeArticle refuses Google News\'s redirect shell and keeps real articles', async () => {
  const { looksLikeArticle } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/fetch-relay-policy.js')).href);
  const pad = '<!-- ' + 'x'.repeat(6000) + ' -->';
  const shell = '<!doctype html><html><head><title>Google News</title>'
    + '<meta name="description" content="Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News.">'
    + '<meta property="og:description" content="Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News.">'
    + '<meta property="og:type" content="website"></head><body><c-wiz><div>' + pad + '</div></c-wiz></body></html>';
  assert.equal(looksLikeArticle(shell), false, 'a page with no paragraph whose description is the SITE\'s is not an article');
  const withParas = '<!doctype html><html><body><article><p>' + 'Prose. '.repeat(20) + '</p><p>More.</p></article>' + pad + '</body></html>';
  assert.equal(looksLikeArticle(withParas), true);
  const declared = '<!doctype html><html><head><meta property="og:type" content="article"><meta property="og:description" content="What happened."></head><body><div id="app"></div>' + pad + '</body></html>';
  assert.equal(looksLikeArticle(declared), true, 'a script-rendered page that declares itself an article keeps its description');
  const ld = declared.replace('<meta property="og:type" content="article">', '<script type="application/ld+json">{"@type": "NewsArticle"}</script>');
  assert.equal(looksLikeArticle(ld), true);

  /* …and fetch-relay applies the same predicate before it hands anything back */
  const q = '?as=article&u=' + encodeURIComponent('https://news.google.com/rss/articles/CBMiX');
  const [o] = runEdge('fetch-relay', [q], [['news\\.google\\.com', { status: 200, body: shell, type: 'text/html; charset=utf-8' }]]);
  assert.equal(o.status, 502, o.body);
  assert.match(o.body, /not_an_article/);
});
