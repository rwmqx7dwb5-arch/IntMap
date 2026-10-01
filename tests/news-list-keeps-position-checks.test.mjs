/* ============================================================================
 *  IntMap · a redraw of the News list the reader is reading is not a reset
 * ----------------------------------------------------------------------------
 *  MEASURED (2026-10-01): a reader 60 cards deep (the second lazy batch appended by the scroll
 *  handler) was put back to 30 cards by every auth event — js/auth-ui.js called startNews() and then
 *  renderUI(), whose News branch calls startNews() again, and startNews() always emptied the feed and
 *  drew the first NEWS_BATCH. The deep tier saw it ~3.3 s after opening the tab (the boot's own
 *  auth event); a genuine supabase-js SIGNED_OUT reproduces it on demand.
 *
 *  These checks EVALUATE js/news-feed.js's real startNews() against a small layout model of the
 *  feed (cards of a fixed height, a clamped scrollTop, getBoundingClientRect relative to the feed),
 *  so what is asserted is the behaviour, not the spelling. The browser half is tests/r169.spec.js
 *  (#3b), which drives the real appendNewsBatch and a real auth event.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { importModule } from './helpers/import-module.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const H = 100;          /* one card's height in the model */
const VIEW = 500;       /* the feed's visible height */

function makeFeed() {
  const feed = {
    children: [], hidden: false, _st: 0,
    get scrollTop() { return this._st; },
    set scrollTop(v) { const max = Math.max(0, this.children.length * H - VIEW); this._st = Math.max(0, Math.min(max, v)); },
    set innerHTML(v) { this.children = v ? [{ msg: v, getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }) }] : []; this.scrollTop = this._st; },
    appendChild(c) { this.children.push(c); },
    getBoundingClientRect() { return { top: 0 }; },
  };
  return feed;
}
function makeCard(feed, item) {
  return {
    item,
    getBoundingClientRect() {
      if (feed.hidden) return { top: 0, bottom: 0, height: 0 };
      const top = feed.children.indexOf(this) * H - feed.scrollTop;
      return { top, bottom: top + H, height: H };
    },
  };
}
const items = (from, n) => Array.from({ length: n }, (_, i) => ({ link: `https://example.invalid/${from + i}`, title: `t${from + i}` }));

/* (module-graph) js/news-feed.js is IMPORTED with the fake window/document as its browser; its renderer, language
   registry and tables are the real modules it imports (no renderer is attached, so the map half is a no-op, as
   it was when the vm context carried no engine) */
async function boot(list) {
  const feed = makeFeed();
  const HOST = {
    lang: 'en', NEWS_BATCH: 30, globalData: list, newsFiltered: [], renderedCount: 0, newsFeatures: [],
    list,
    computeFilteredNews() { return this.list.slice(); },
    appendNewsBatch() {
      const next = HOST.newsFiltered.slice(HOST.renderedCount, HOST.renderedCount + HOST.NEWS_BATCH);
      next.forEach((it) => { const c = makeCard(feed, it); it._cardEl = c; feed.appendChild(c); });
      HOST.renderedCount += next.length;
    },
    clearMarkers() {}, _spreadDupNewsPins() {}, setupIntelLayers() {}, updateOcclusion() {},
    scheduleNewsDeclutter() {}, _wsNewsHidden: () => false, canDraw: () => false, t: (k) => k,
  };
  const window = { IntMapMapTypography: { bandText: (s) => s } };
  const document = { getElementById: (id) => (id === 'live-news-feed' ? feed : null) };
  const M = await importModule('js/news-feed.js', { globals: { window, document } });
  const api = M.newsFeed(HOST);
  return { feed, HOST, api };
}
/* what the reader sees: the first card whose bottom is below the feed's top, and how far into it */
function firstVisible(feed) {
  const c = feed.children.find((x) => x.getBoundingClientRect().bottom > 0);
  return c ? { title: c.item.title, off: -c.getBoundingClientRect().top } : null;
}
/* the reader opens the tab, scrolls into the second batch, and stops 10 px into card 42 */
function readIntoSecondBatch(env) {
  env.api.startNews();
  assert.equal(env.HOST.renderedCount, 30);
  env.HOST.appendNewsBatch();                       /* what the scroll handler does at the bottom */
  env.feed.scrollTop = 41 * H + 10;
  assert.equal(env.HOST.renderedCount, 60);
  return firstVisible(env.feed);
}

test('news-list-keeps-position: the same list redrawn keeps the depth and the card the reader was on', async () => {
  const env = await boot(items(1, 75));
  const before = readIntoSecondBatch(env);
  env.api.startNews();                              /* the auth event's redraw */
  assert.equal(env.HOST.renderedCount, 60, 'the second batch is still there');
  assert.equal(env.feed.children.length, 60, 'the DOM and renderedCount agree (no duplicates)');
  assert.deepEqual(firstVisible(env.feed), before, 'the reader is on the same card, at the same offset');
  const cardsAfterFirst = env.feed.children.slice();
  env.api.startNews();                              /* a second event with nothing changed */
  assert.equal(env.HOST.renderedCount, 60);
  assert.deepEqual(firstVisible(env.feed), before, 'idempotent: a second redraw changes nothing the reader sees');
  assert.notEqual(env.feed.children[0], cardsAfterFirst[0], 'the cards are rebuilt (their text can depend on settings), not frozen');
});

test('news-list-keeps-position: the same items as NEW objects (a refetch that brought nothing new) still keep the place', async () => {
  const env = await boot(items(1, 75));
  const before = readIntoSecondBatch(env);
  env.HOST.list = items(1, 75);                     /* equal identity (link), different objects */
  env.HOST.globalData = env.HOST.list;
  env.api.startNews();
  assert.equal(env.HOST.renderedCount, 60);
  assert.deepEqual(firstVisible(env.feed), before);
});

test('news-list-keeps-position: a list whose head changed starts from the top, as before', async () => {
  const env = await boot(items(1, 75));
  readIntoSecondBatch(env);
  env.HOST.list = items(0, 76);                     /* a fresh article at the top */
  env.api.startNews();
  assert.equal(env.HOST.renderedCount, 30);
  assert.equal(env.feed.scrollTop, 0);
  assert.equal(firstVisible(env.feed).title, 't0');
});

test('news-list-keeps-position: a narrower list (a new query / category) starts from the top', async () => {
  const env = await boot(items(1, 75));
  readIntoSecondBatch(env);
  env.HOST.list = items(1, 40);                     /* shorter than the depth read so far */
  env.api.startNews();
  assert.equal(env.HOST.renderedCount, 30);
  assert.equal(env.feed.scrollTop, 0);
});

test('news-list-keeps-position: a counter reset underneath the cards is not mistaken for the same list (no duplicate cards)', async () => {
  const env = await boot(items(1, 75));
  readIntoSecondBatch(env);
  env.HOST.renderedCount = 0;                       /* what the outlet-filter save path in js/app-body.js does */
  env.api.startNews();
  assert.equal(env.HOST.renderedCount, 30);
  assert.equal(env.feed.children.length, env.HOST.renderedCount);
});

test('news-list-keeps-position: a hidden list (reader pane open over it) keeps its depth even though nothing can be measured', async () => {
  const env = await boot(items(1, 75));
  readIntoSecondBatch(env);
  env.feed.hidden = true;
  env.api.startNews();
  assert.equal(env.HOST.renderedCount, 60);
  assert.equal(env.feed.children.length, 60);
});

test('news-list-keeps-position: the auth listener redraws the list once — through renderUI(), not also directly', () => {
  /* 綴りのまま: the listener is inside bootSupabase(), which needs the Supabase client to run;
     the fact checked is that the deferred enrich no longer names startNews next to renderUI. */
  const auth = codeOnly(readLF(resolve(ROOT, 'js/auth-ui.js')));
  const i = auth.indexOf('onAuthStateChange(');
  assert.ok(i > 0);
  const body = auth.slice(i, auth.indexOf('await refreshCurrentUser();', i));
  assert.ok(/HOST\.renderUI\(\)/.test(body), 'the listener re-renders the active tab');
  assert.ok(!/startNews\(/.test(body), 'and does not also call startNews() (renderUI\'s News branch does)');
  const ui = codeOnly(readLF(resolve(ROOT, 'js/news-ui.js')));
  const r = ui.slice(ui.indexOf('function renderUI('), ui.indexOf('function appendNewsBatch('));
  assert.ok(/HOST\.mode==='news'\|\|HOST\.mode==='saved'\)\{[\s\S]*HOST\.startNews\(\); return;/.test(r), 'renderUI\'s News/Saved branch redraws the list');
});
