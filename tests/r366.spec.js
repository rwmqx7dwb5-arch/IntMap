/* ============================================================================
 *  R366 — 出来事が本当に画面に出るか、本物のブラウザで
 * ----------------------------------------------------------------------------
 *  #R351 の本番検証はこう書いている——「配信バンドルを grep して `news_events*` への
 *  参照 0 件（表に 640 行あるのに、フロントにそこへ到達する経路が 1 本も無い）」。
 *  この spec はその逆を測る: **経路があり、通り、UI になる**こと。
 *
 *  ⚠ **上流は route で差し替える。** 本番の Supabase を叩く spec は、ネットワークが
 *    揺れた日に赤くなり、本番のデータが変わった日に意味が変わる。ここで測りたいのは
 *    「クライアントのコードが、この形の応答を UI にできるか」であって、今日の本番に
 *    何が入っているかではない（本番の中身は prod-verifier の仕事）。
 *  ⚠ 触るのは**公開の入口だけ**（`IntMapLazy.need` → `IntMapNewsEvents`）。モジュールの
 *    内側に手を入れる検査は、ボタンが壊れたあとも緑のままになる。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* ── 応答の型は本番の列と同じ。⚠ 形を変えたらここも変わる（それが検査の意味である）。 ── */
const SOURCES = [
  { id: 'bbc', name: 'BBC', slug: 'bbc', source_type: 'broadcaster', country: 'GB', hq_lng: -0.226, hq_lat: 51.518, source_family: 'bbc', homepage_url: 'https://www.bbc.com' },
  { id: 'apnews', name: 'AP', slug: 'ap', source_type: 'wire', country: 'US', hq_lng: -73.99, hq_lat: 40.75, source_family: 'apnews', homepage_url: 'https://apnews.com' },
  { id: 'aljazeera', name: 'Al Jazeera', slug: 'aljazeera', source_type: 'broadcaster', country: 'QA', hq_lng: 51.53, hq_lat: 25.28, source_family: 'aljazeera', homepage_url: 'https://aljazeera.com' },
  { id: 'sinclair1', name: 'WJLA', slug: 'wjla', source_type: 'broadcaster', country: 'US', hq_lng: -77.1, hq_lat: 38.9, source_family: 'sinclair', homepage_url: 'https://wjla.com' },
  { id: 'sinclair2', name: 'KOMO', slug: 'komo', source_type: 'broadcaster', country: 'US', hq_lng: -122.3, hq_lat: 47.6, source_family: 'sinclair', homepage_url: 'https://komonews.com' },
];

const mem = (id, source_id, title, at, description) => ({
  relation: 'same_event', assignment_score: 0.5, assigned_by: 'deterministic',
  news_articles: { id, title, description: description || '', canonical_url: 'https://example.org/a' + id,
                   source_id, published_at: at, subject_name_en: 'Reno', subject_type: 'city' },
});

const EVENTS = [
  { id: 1, public_id: 'etest001', representative_title: 'Wildfire approaches Reno, Nevada, forcing thousands to evacuate',
    representative_article_id: 11, primary_category: 'disasters', secondary_categories: [],
    category_confidence: 0.8, category_evidence: { by: 'classifier' },
    rep_lng: -119.81, rep_lat: 39.53, rep_place_name_en: 'Reno', location_confidence: 0.7,
    first_published_at: '2026-08-24T06:00:00Z', last_article_at: '2026-08-24T11:00:00Z',
    materially_updated_at: '2026-08-24T11:00:00Z', article_count: 4, independent_source_count: 3,
    cluster_confidence: 0.62, manual_lock: false, status: 'active', merged_into: null,
    news_event_articles: [
      /* ⚠ 数量が媒体間で食い違っている: BBC は 3 人、AP は 5 人。 */
      mem(11, 'bbc', 'Fast-moving Reno wildfire forces thousands to flee', '2026-08-24T06:00:00Z', 'At least 3 people injured as the fire crossed the ridge.'),
      mem(12, 'apnews', 'Human-started wildfire nears Reno, Nevada', '2026-08-24T07:30:00Z', 'Officials said at least 5 people injured overnight.'),
      /* ⚠ 同じ系列（Sinclair）の 2 本。独立媒体としては 1 票にしかならず、詳細では
         「同系列」と印が付く。数量は BBC と同じなので、相違の値は 3 と 5 の 2 つ。 */
      mem(13, 'sinclair1', 'Reno wildfire prompts evacuations', '2026-08-24T09:00:00Z', 'At least 3 people injured.'),
      mem(14, 'sinclair2', 'Reno wildfire prompts evacuations', '2026-08-24T11:00:00Z', 'At least 3 people injured.'),
    ] },
  { id: 2, public_id: 'etest002', representative_title: 'Canada says it will match new US tariffs dollar for dollar',
    representative_article_id: 21, primary_category: 'business', secondary_categories: [],
    category_confidence: 1, category_evidence: { by: 'feed' },
    rep_lng: -106.3, rep_lat: 56.1, rep_place_name_en: 'Canada', location_confidence: 0.4,
    first_published_at: '2026-08-24T04:00:00Z', last_article_at: '2026-08-24T05:00:00Z',
    materially_updated_at: '2026-08-24T05:00:00Z', article_count: 2, independent_source_count: 2,
    cluster_confidence: 0.71, manual_lock: false, status: 'active', merged_into: null,
    news_event_articles: [
      mem(21, 'apnews', 'Canada to match US tariffs dollar for dollar', '2026-08-24T04:00:00Z', ''),
      mem(22, 'aljazeera', 'Canada vows dollar-for-dollar response to US tariffs', '2026-08-24T05:00:00Z', ''),
    ] },
  /* ⚠⚠ **同じ系列だけが数を変えた出来事。** 速報 3 人 → 続報 6 人は 1 つの声の**更新**で
     あって、媒体間の相違ではない。⇒ ここは相違 0 件でなければならない。地点も無い。 */
  { id: 3, public_id: 'etest003', representative_title: 'A one-voice story with no location at all',
    representative_article_id: 31, primary_category: 'world', secondary_categories: [],
    category_confidence: 0.5, category_evidence: { by: 'feed' },
    rep_lng: null, rep_lat: null, rep_place_name_en: null, location_confidence: null,
    first_published_at: '2026-08-24T03:00:00Z', last_article_at: '2026-08-24T05:00:00Z',
    materially_updated_at: '2026-08-24T05:00:00Z', article_count: 2, independent_source_count: 1,
    cluster_confidence: null, manual_lock: false, status: 'active', merged_into: null,
    news_event_articles: [
      mem(31, 'sinclair1', 'A one-voice story with no location at all', '2026-08-24T03:00:00Z', 'At least 3 people injured.'),
      mem(32, 'sinclair2', 'A one-voice story with no location at all', '2026-08-24T05:00:00Z', 'At least 6 people injured.'),
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

test('R366 ① 出来事が読み込まれ、記事ではなく出来事が一覧の項目になる', async ({ app }) => {
  const page = app.page;
  const seen = [];
  page.on('request', (r) => { if (/\/rest\/v1\//.test(r.url())) seen.push(r.url().slice(0, 120)); });
  await stub(page);

  const out = await page.evaluate(async () => {
    const okLazy = await window.IntMapLazy.need('newsEvents');
    if (!okLazy) return { fail: 'the lazy module did not arrive: ' + JSON.stringify(window.IntMapLazy.check()) };
    const loaded = await window.IntMapNewsEvents.load();
    const evs = window.IntMapNewsEvents.events();
    return { loaded, n: evs.length, first: evs[0], surface: window.__IM_NEWS_SURFACE && window.__IM_NEWS_SURFACE() };
  });
  expect(out.fail, out.fail || '').toBeFalsy();
  /* ⚠ 起動時にアプリ自身が本物の `news_events` / `news_sources` を読んでいる（＝経路は
     本当に通っている）。この検査の 3 件は route で差し替えたものなので、**知らない媒体が
     混ざったときに登録簿を取り直す**規則が効いていないと、ここは本番の名前を出す。 */
  expect(seen.some((u) => /news_sources/.test(u)), 'the registry must be re-read when an unknown outlet appears: ' + JSON.stringify(seen)).toBe(true);
  expect(out.loaded).toBe(true);
  expect(out.n).toBe(3);
  /* ⚠ 一覧が「出来事である」ことは旗ではなく**中身**に訊く。 */
  expect(out.surface).toBe('events');
  /* 独立媒体は資本系列で数える。Sinclair の 2 本は 1 票なので 4 記事 / 3 媒体。 */
  expect(out.first.articleCount).toBe(4);
  expect(out.first.sourceCount).toBe(3);
  expect(out.first.outlets).toEqual(['BBC', 'AP', 'WJLA']);
});

test('R366 ② カテゴリは一覧と地図の両方に効く（述語が 1 本しかないので）', async ({ app }) => {
  const page = app.page;
  await stub(page);

  const out = await page.evaluate(async () => {
    await window.IntMapLazy.need('newsEvents');
    const E = window.IntMapNewsEvents;
    await E.load();
    const all = E.events().length;
    E.setCategory('business');
    const afterList = E.state().visibleEventCount;
    const afterCats = Object.keys(E.state().categories);
    /* 一覧のフィルタと同じ述語を、項目そのものに当てて確かめる（地図のピンは
       startNews() が同じ `computeFilteredNews()` を通すので、答えは 1 つしかない）。 */
    E.setCategory('all');
    const back = E.state().visibleEventCount;
    return { all, afterList, afterCats, back, chipCount: document.querySelectorAll('#news-cat-chips .news-cat-chip').length };
  });
  expect(out.all).toBe(3);
  expect(out.afterList).toBe(1);
  expect(out.afterCats).toEqual(['business']);
  expect(out.back).toBe(3);
  /* chips は実データから作られ、0 件のカテゴリは出さない: All ＋ 3 カテゴリ。 */
  expect(out.chipCount).toBe(4);
});

test('R366 ③ 媒体ごとの相違は、別々の系列が違う数を言ったときだけ出る', async ({ app }) => {
  const page = app.page;
  await stub(page);

  const out = await page.evaluate(async () => {
    await window.IntMapLazy.need('newsEvents');
    const E = window.IntMapNewsEvents;
    await E.load();
    const evs = E.events();
    const fire = evs.find((e) => e.publicId === 'etest001');
    const tariff = evs.find((e) => e.publicId === 'etest002');
    const oneVoice = evs.find((e) => e.publicId === 'etest003');
    return {
      fire: E.differences(fire).map((d) => ({ kind: d.kind, values: d.claims.map((c) => c.value), srcs: d.claims.map((c) => c.source) })),
      tariff: E.differences(tariff).length,
      oneVoice: E.differences(oneVoice).length,
      quantities: E.quantities('At least 5 people injured overnight.').map((q) => [q.kind, q.value]),
    };
  });
  /* BBC「3 injured」と AP「5 injured」は別の系列 ⇒ 相違。 */
  expect(out.fire).toHaveLength(1);
  expect(out.fire[0].kind).toBe('injured');
  expect(out.fire[0].values).toEqual([3, 5]);
  expect(out.fire[0].srcs).toEqual(['BBC', 'AP']);
  /* ⚠⚠ **同じ系列だけが 3 → 6 と変えた出来事は、相違 0 件。** 1 つの声の更新であって、
     媒体間の食い違いではない——ここが 1 になったら、続報のたびに「媒体が対立している」と
     読者に見せることになる。 */
  expect(out.oneVoice).toBe(0);
  /* 数量が 1 つも無い出来事に、相違をでっち上げない。 */
  expect(out.tariff).toBe(0);
  expect(out.quantities).toEqual([['injured', 5]]);
});

test('R366 ④ 詳細は、誰がいつ報じたか・同系列・初報・組み立て方を出す', async ({ app }) => {
  const page = app.page;
  await stub(page);

  const detail = await page.evaluate(async () => {
    await window.IntMapLazy.need('newsEvents');
    const E = window.IntMapNewsEvents;
    await E.load();
    const evs = E.events();
    const fire = evs.find((e) => e.publicId === 'etest001');
    /* openDetail は一覧の項目を受け取るので、同じ形を組み立てて渡す
       （`analysis.loc` が無くても詳細は開ける——地図へ寄るのは任意の副作用）。 */
    E.openDetail({ _event: fire, analysis: { loc: [fire ? -119.81 : 0, 39.53] } });
    const pane = document.getElementById('news-reader-pane');
    const cov = pane.querySelectorAll('.ev-cov');
    return {
      open: pane.style.display !== 'none',
      coverage: cov.length,
      first: pane.querySelectorAll('.ev-badge.first').length,
      dup: pane.querySelectorAll('.ev-cov.dup').length,
      diffRows: pane.querySelectorAll('.ev-diff-row').length,
      why: pane.querySelectorAll('.ev-why li').length,
      html: pane.innerHTML.length,
    };
  });
  expect(detail.open).toBe(true);
  expect(detail.coverage).toBe(4);            /* 記事 4 本すべてを出す */
  expect(detail.first).toBe(1);               /* 初報の印は 1 つだけ */
  expect(detail.dup).toBe(1);                 /* Sinclair の 2 本目が「同系列」 */
  expect(detail.diffRows).toBe(1);            /* injured の食い違い */
  expect(detail.why).toBeGreaterThanOrEqual(3);
  /* 戻れる。 */
  const closed = await page.evaluate(() => {
    document.getElementById('ev-back').click();
    return document.getElementById('news-reader-pane').style.display === 'none';
  });
  expect(closed).toBe(true);
});

test('R366 ⑤ Atlas は News について観測した事実を持つ（state provider）', async ({ app }) => {
  const page = app.page;
  await stub(page);

  const snap = await page.evaluate(async () => {
    await window.IntMapLazy.need('newsEvents');
    await window.IntMapNewsEvents.load();
    window.IntMapNewsEvents.setCategory('all');
    const s = window.IntMapAtlasState.snapshot({ only: ['news'] });
    return s.news;
  });
  expect(snap).toBeTruthy();
  expect(snap.mode).toBe('events');
  expect(snap.loadedEventCount).toBe(3);
  /* ⚠ 「地点が無い」を隠さない（docs/NEWS-EVENTS.md §9「正直に出すもの」）。 */
  expect(snap.unplacedCount).toBe(1);
  expect(snap.multiSourceCount).toBe(2);
  expect(snap.selectedCategory).toBe('all');
});
