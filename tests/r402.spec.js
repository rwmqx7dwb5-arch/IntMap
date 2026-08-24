/* ============================================================================
 *  R402 — News 面は「開いたとき」に来る: 本物のブラウザで、両方の半分を測る
 * ----------------------------------------------------------------------------
 *  #R372 が起動時のニュース取得をやめ（`fetchData({background:true})` が
 *  「まだ誰も訊いていない・News 面も出ていない」なら何もせずに戻る）、#R372 追記2/3 が
 *  「**開くことがそのジェスチャである**」を \`startNews()\` の \`_asked\` 掛け金で足した。
 *  `tests/r372-checks.test.mjs` ⑬⑮ がその両方を**ソースの形**として押さえている。
 *
 *  ⚠⚠⚠ **この検査が足すのは、ソースの形では押さえられない半分である。**
 *  #R372 の最初の版は「起動時に取らない」を正しく実装し、そのうえで
 *  **News タブが永久に「Loading articles...」のままになった**——`setMode()` は
 *  `renderUI()` しか呼ばず、タブは「起動時の取得が globalData を埋めていた」ことに
 *  寄生していただけだったからである。追記2/3 の言葉では、**本番で**「クリック後に
 *  news_events / news_sources / relay へのリクエスト 0 件、`IntMapNewsEvents` は undefined」。
 *  ⚠ **本番が最初の検出器だった。** この spec はその検出器をゲートへ移す。
 *
 *  ⚠⚠ **半分だけでは足りない。** `tests/r209.spec.js ①`（deep tier）は「ジェスチャ無しに
 *  何が降りてきたか」を数えるので、`newsEvents` を**永久に壊しても緑**になる——「取りに
 *  行かない」と「機能が無い」を見分けられない。だから ① と ② を**同じページで続けて**測る:
 *  ① 起動時は 1 バイトも降ってこない／② 1 回のクリックで降りてきて、一覧が出来事になる。
 *  片方だけの検査は #R162/#R200/#R205/#R208 の「機能が静かに存在しなくなる」形を作る機械である。
 *
 *  ⚠⚠ **② は `IntMapLazy.need()` を自分で呼ばない。** `tests/r386.spec.js` の helper は呼ぶので、
 *  「開く → 取りに行く」の配線が切れてもあちらは緑のままになる。ここで測るのは
 *  **アプリ自身が求めたか**であって、モジュールが動くかではない。
 *
 *  ⚠ 上流は route で差し替える（#R386 と同じ理由）。本番の Supabase を叩く検査は、ネットワークが
 *  揺れた日に赤くなり、本番のデータが変わった日に意味が変わる。本番の中身は prod-verifier の仕事。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

/* ── 応答の型は本番の列と同じ（tests/r386.spec.js と同型・件数だけ絞った） ───────────────── */
const SOURCES = [
  { id: 'bbc', name: 'BBC', slug: 'bbc', source_type: 'broadcaster', country: 'GB', hq_lng: -0.226, hq_lat: 51.518, source_family: 'bbc', homepage_url: 'https://www.bbc.com' },
  { id: 'apnews', name: 'AP', slug: 'ap', source_type: 'wire', country: 'US', hq_lng: -73.99, hq_lat: 40.75, source_family: 'apnews', homepage_url: 'https://apnews.com' },
];

const mem = (id, source_id, title, at) => ({
  relation: 'same_event', assignment_score: 0.5, assigned_by: 'deterministic',
  news_articles: { id, title, description: '', canonical_url: 'https://example.org/a' + id,
                   source_id, published_at: at, subject_name_en: 'Reno', subject_type: 'city' },
});

const EVENTS = [
  { id: 1, public_id: 'e402a', representative_title: 'Wildfire approaches Reno, Nevada',
    representative_article_id: 11, primary_category: 'disasters', secondary_categories: [],
    category_confidence: 0.8, category_evidence: { by: 'classifier' },
    rep_lng: -119.81, rep_lat: 39.53, rep_place_name_en: 'Reno', location_confidence: 0.7,
    first_published_at: '2026-08-24T06:00:00Z', last_article_at: '2026-08-24T11:00:00Z',
    materially_updated_at: '2026-08-24T11:00:00Z', article_count: 2, independent_source_count: 2,
    cluster_confidence: 0.62, manual_lock: false, status: 'active', merged_into: null,
    news_event_articles: [
      mem(11, 'bbc', 'Fast-moving Reno wildfire forces thousands to flee', '2026-08-24T06:00:00Z'),
      mem(12, 'apnews', 'Human-started wildfire nears Reno, Nevada', '2026-08-24T07:30:00Z'),
    ] },
  { id: 2, public_id: 'e402b', representative_title: 'Canada says it will match new US tariffs',
    representative_article_id: 21, primary_category: 'business', secondary_categories: [],
    category_confidence: 1, category_evidence: { by: 'feed' },
    rep_lng: -106.3, rep_lat: 56.1, rep_place_name_en: 'Canada', location_confidence: 0.4,
    first_published_at: '2026-08-24T04:00:00Z', last_article_at: '2026-08-24T05:00:00Z',
    materially_updated_at: '2026-08-24T05:00:00Z', article_count: 1, independent_source_count: 1,
    cluster_confidence: 0.71, manual_lock: false, status: 'active', merged_into: null,
    news_event_articles: [
      mem(21, 'apnews', 'Canada to match US tariffs dollar for dollar', '2026-08-24T04:00:00Z'),
    ] },
];

async function stub(page) {
  await page.route(/\/rest\/v1\/news_sources/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SOURCES) }));
  await page.route(/\/rest\/v1\/news_events/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EVENTS) }));
  await page.route(/\/rest\/v1\/news_event_i18n/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

/* ⚠ **何も訊かれていないページが要る。** worker 共有の `app.page` は同じ worker の他の spec が
   すでに News を開いているかもしれず、「まだ降りてきていない」という前提が成り立たない
   （#R304 が `tests/r209.spec.js` で実測した形）。①が 1 つ作り、②がそれを受け継ぐ——
   その順序こそがこのファイルの主張なので、`mode:'serial'` は装飾ではない。 */
let VIRGIN = null;
const untouched = async (app) => (VIRGIN || (VIRGIN = await app.freshPage()));

test('R402 ①: 起動は、誰も開いていない News 面のために 1 バイトも払わない', async ({ app }) => {
  const page = await untouched(app);
  const s = await page.evaluate(() => ({
    registered: window.IntMapLazy ? window.IntMapLazy.names().indexOf('newsEvents') >= 0 : null,
    pending: window.IntMapLazy ? window.IntMapLazy.pending().slice() : null,
    published: typeof window.IntMapNewsEvents,
    eventModeOn: window.__IM_NEWS_EVENT_MODE === true,
    surface: (typeof window.__IM_NEWS_SURFACE === 'function') ? window.__IM_NEWS_SURFACE() : null,
    newsTabActive: !!document.getElementById('btn-news')
      && document.getElementById('btn-news').classList.contains('active'),
  }));

  /* まず前提——**機能は生きている。** 旗が立っていて、ローダーは名前を知っている。
     この 2 つが偽なら、下の「降りてきていない」は「消した」の別名になる。 */
  expect(s.eventModeOn, 'NEWS_EVENT_MODE は true のまま（docs/NEWS-EVENTS.md §12）').toBe(true);
  expect(s.registered, 'ローダーは newsEvents を知っている（js/lazy-modules.js の PUBLISHES 表）').toBe(true);
  expect(s.newsTabActive, 'News は既定タブではない（#R11・docs/NEWS-EVENTS.md §9）').toBe(false);

  /* そのうえで——**開いていない面のためには何も取りに行かない**（#R372）。 */
  expect(s.pending, 'News を開くまで newsEvents は要求すらされない（js/lazy-modules.js の登録行）')
    .not.toContain('newsEvents');
  expect(s.published, 'window.IntMapNewsEvents は起動時には存在しない').toBe('undefined');
  expect(s.surface, '起動直後の一覧は記事モード（出来事は面と一緒に来る）').toBe('articles');
});

test('R402 ②: News タブを開くのがそのジェスチャ — モジュールが降り、一覧が出来事になり、カードが出る', async ({ app }) => {
  const page = await untouched(app);
  await stub(page);

  /* ⚠ 押すのはタブ 1 つだけ。`need()` も `fetchData()` も検査からは呼ばない——
     #R372 追記2/3 が本番で見つけたのは「押しても何も起きない」であって、
     「押したあと手で取りに行けば動く」ではない。 */
  await page.evaluate(() => { document.getElementById('btn-news').click(); });

  await page.waitForFunction(() => {
    try {
      const E = window.IntMapNewsEvents;
      return !!E && typeof window.__IM_NEWS_SURFACE === 'function'
        && window.__IM_NEWS_SURFACE() === 'events' && E.events().length === 2;
    } catch (_) { return false; }
  }, null, { timeout: 30000 });

  const after = await page.evaluate(() => ({
    pending: window.IntMapLazy.pending().slice(),
    published: typeof window.IntMapNewsEvents,
    surface: window.__IM_NEWS_SURFACE(),
    events: window.IntMapNewsEvents.events().length,
    cards: document.querySelectorAll('#live-news-feed .news-item').length,
    loading: (document.querySelector('#live-news-feed .empty-msg') || {}).textContent || '',
  }));

  expect(after.pending, 'タブを開いたことでローダーが newsEvents を求めた').toContain('newsEvents');
  expect(after.published, 'モジュールは本当に届いて公開された').toBe('object');
  expect(after.surface, '一覧は出来事になった（#R386 の Phase D）').toBe('events');
  expect(after.events, '差し替えた 2 件がそのまま出来事になっている').toBe(2);
  /* ⚠ ここが #R372 追記2/3 の本番の症状そのもの——「Loading articles...」で止まらないこと。 */
  expect(after.cards, '出来事はカードとして描かれている（降りてきただけで終わっていない）')
    .toBeGreaterThan(0);
  expect(after.loading, '「読み込み中」の空メッセージは残っていない').toBe('');
});
