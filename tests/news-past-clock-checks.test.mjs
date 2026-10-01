/* ============================================================================
 *  IntMap · a past clock with no articles says so — it does not say 「Loading」 for ever
 * ----------------------------------------------------------------------------
 *  MEASURED (production 2026-10-01): with the master clock at 1900-06-15 the News panel said
 *  「Loading articles...」 for more than 50 s and never resolved; IntMapTime.setNow() brought 30
 *  items within 15 s. The fetch HAD finished: Google News ignores after:/before: outside its recent
 *  window and answered with today's headlines, buildItems() rightly kept none of them, globalData
 *  became [] — and startNews() reads an empty list as «not loaded yet», with the one-shot latch
 *  (correctly) stopping it from asking again. Reproduced locally the same way (a stubbed feed of
 *  today-dated items, clock at 1900): one request, then 「Loading articles...」 indefinitely.
 *
 *  These checks EVALUATE js/news-feed.js's real fetchData()/startNews() with a feed model, so what
 *  is asserted is what the panel ends up saying, not the spelling of the code.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readLF(resolve(ROOT, 'js/news-feed.js'));

/* just enough of DOMParser for the RSS ingest: <item> elements and their first child tags */
class FakeDOMParser {
  parseFromString(txt) {
    const items = [...String(txt).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    const el = (body) => ({
      querySelector(sel) {
        for (const tag of sel.split(',').map((s) => s.trim())) {
          const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
          if (m) return { textContent: m[1], getAttribute: () => null };
        }
        return null;
      },
    });
    return { querySelectorAll: () => items.map(el) };
  }
}
const rss = (dates) => `<rss><channel>${dates.map((d, i) =>
  `<item><title>Headline ${i} - Pub</title><link>https://example.invalid/${i}</link><pubDate>${d.toUTCString()}</pubDate><description>x</description></item>`).join('')}</channel></rss>`;

const T = { loading: 'LOADING', noMatch: 'NO_MATCH', networkError: 'NETWORK_ERROR', noNewsForDate: 'NONE {date} ±{days}' };

function boot({ newsDate, answer }) {
  const feed = { _html: '', set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }, children: [], getBoundingClientRect: () => ({ top: 0 }) };
  const calls = [];
  const HOST = {
    lang: 'en', mode: 'news', NEWS_BATCH: 30, globalData: [], newsFiltered: [], renderedCount: 0, newsFeatures: [],
    newsDate, activeSearchQuery: '', newsLangMode: 'single', NEWS_EVENT_MODE: false, USE_SERVER_NEWS: false,
    t: (k) => T[k],
    ymdISO: (d) => d.toISOString().slice(0, 10),
    parseDate: (s) => Date.parse(s),
    analyzeContext: () => ({}),
    computeFilteredNews() { return this.globalData.slice(); },
    appendNewsBatch() { HOST.renderedCount = HOST.newsFiltered.length; feed._html = `CARDS:${HOST.newsFiltered.length}`; },
    fetchViaProxy: async (u) => { calls.push(u); return answer(u); },
    clearMarkers() {}, _spreadDupNewsPins() {}, setupIntelLayers() {}, updateOcclusion() {},
    scheduleNewsDeclutter() {}, _wsNewsHidden: () => false, canDraw: () => false,
  };
  const window = {
    IntMapModules: {}, IntMapTables: { NEWS_EDITIONS_MULTI: [], NEWS_COUNTRY_EDITIONS: {} },
    IntMapMapTypography: { bandText: (s) => s }, IntMapSafe: { text: (s) => s, html: (s) => String(s).replace(/</g, "&lt;") }, IntMapLang: { t: (l, en) => en },
  };
  const document = { getElementById: (id) => (id === 'live-news-feed' ? feed : null) };
  const localStorage = { getItem: () => null, setItem() {} };
  vm.runInNewContext(SRC, { window, document, console: { warn() {} }, setTimeout, clearTimeout, DOMParser: FakeDOMParser, localStorage });
  return { feed, HOST, calls, api: window.IntMapModules.newsFeed(HOST) };
}

const PAST = new Date('1900-06-15T00:00:00Z');

test('news-past-clock: a past instant whose sources answered with nothing dated then says so, once, with the date', async () => {
  const env = boot({ newsDate: PAST, answer: () => rss([new Date(), new Date()]) });   /* what Google sent for 1900 */
  await env.api.fetchData();
  assert.equal(env.HOST.globalData.length, 0, 'nothing dated near 1900 is kept (#R107 — never latest-as-past)');
  assert.ok(!env.feed.innerHTML.includes('LOADING'), `the panel must not stay on the loading line: ${env.feed.innerHTML}`);
  assert.ok(env.feed.innerHTML.includes('NONE 1900-06-15 ±8'), `it names the instant and the window it searched: ${env.feed.innerHTML}`);
  assert.equal(env.calls.length, 1, 'one request — the answer is not re-asked');
  env.api.startNews();                                  /* any later redraw (auth event, language switch) */
  assert.ok(env.feed.innerHTML.includes('NONE 1900-06-15'), 'a redraw keeps saying it');
  assert.equal(env.calls.length, 1, 'and does not fetch again');
});

test('news-past-clock: the «nothing for this date» answer belongs to that instant only', async () => {
  const env = boot({ newsDate: PAST, answer: () => rss([new Date()]) });
  await env.api.fetchData();
  env.HOST.newsDate = new Date('1950-01-01T00:00:00Z');  /* the clock moved; its fetch has not answered yet */
  env.api.startNews();
  assert.ok(env.feed.innerHTML.includes('LOADING'), 'a different instant is not claimed to be empty before it is asked');
});

test('news-past-clock: no source answering is still a network error, not «no articles»', async () => {
  const env = boot({ newsDate: PAST, answer: () => null });
  await env.api.fetchData();
  assert.ok(env.feed.innerHTML.includes('NETWORK_ERROR'), env.feed.innerHTML);
});

test('news-past-clock: a past instant with articles dated near it shows them', async () => {
  const near = new Date('2024-03-10T00:00:00Z');
  const env = boot({ newsDate: near, answer: () => rss([new Date('2024-03-09T12:00:00Z'), new Date()]) });
  await env.api.fetchData();
  assert.equal(env.HOST.globalData.length, 1, 'only the article dated near the instant');
  assert.equal(env.feed.innerHTML, 'CARDS:1');
});

test('news-past-clock: the live clock is unchanged — articles are drawn', async () => {
  const env = boot({ newsDate: null, answer: () => rss([new Date(), new Date()]) });
  await env.api.fetchData();
  assert.equal(env.feed.innerHTML, 'CARDS:2');
});
