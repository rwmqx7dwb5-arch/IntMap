/* ============================================================================
 *  R416 — 帯に文字が在ること、ピンが出来事へ降りること
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ **ソースの形の検査はこの 2 つを言えない。** `tests/r416-checks.test.mjs` は
 *    「`short: ''` が戻っていない」「click が `_openNewsFeature` を通る」までは言えるが、
 *    **画面に文字が出たか**は言えない——#R416 の欠陥はまさにそこにあった。帯の層は
 *    `icon-text-fit:'both'` なので、合わせる文字が 0 でも**層は在り・地物は在り・
 *    `queryRenderedFeatures` は 46 件を返す**。違うのは「ピルの中が空」ということだけで、
 *    それはレンダラにしか訊けない（#R402 の「1 クリックで降りてカードになる」と同じ位置）。
 *
 *  ⚠ 上流は route で差し替える（`tests/r405.spec.js` と同じ理由）。測りたいのは
 *    「この形の応答を地図にできるか」であって、今日の本番に何が入っているかではない。
 *  ⚠ 触るのは公開の入口だけ。内側に手を入れる検査は、ピンが壊れたあとも緑のままになる。
 *  ⚠ **1 テスト・1 起動。** 試験時間の予算は秒単位でしか余っていない（scripts/test-budget.mjs）。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const SOURCES = [
  { id: 'guardian', name: 'The Guardian', slug: 'guardian', source_type: 'newspaper', country: 'GB', hq_lng: -0.12, hq_lat: 51.53, source_family: 'guardian', homepage_url: 'https://theguardian.com' },
  { id: 'dw', name: 'DW', slug: 'dw', source_type: 'broadcaster', country: 'DE', hq_lng: 6.96, hq_lat: 50.94, source_family: 'dw', homepage_url: 'https://dw.com' },
];

const mem = (id, source_id, title, at) => ({
  relation: 'same_event', assignment_score: 0.6, assigned_by: 'deterministic',
  news_articles: {
    id, title, description: 'The ministry confirmed the figure on Monday afternoon.',
    canonical_url: 'https://example.org/a' + id,
    source_id, published_at: at, subject_name_en: 'Reykjavik', subject_type: 'city',
  },
});

const base = {
  representative_article_id: 0, secondary_categories: [], category_confidence: 0.8,
  category_evidence: { by: 'feed' }, location_confidence: 0.7, cluster_confidence: 0.6,
  manual_lock: false, status: 'active', merged_into: null,
  summary: null, summary_evidence: null, summary_version: null,
};

/* ⚠ 3 件とも**遠く離れた**地点に置く。近いと `_spreadDupNewsPins` と帯の間引き
   (`declutterNewsBands`) が絡んで、「帯が出ない」の理由が 2 つになる。 */
const EVENTS = [
  {
    ...base, id: 1, public_id: 'r416evt01',
    representative_title: 'Volcanic fissure reopens north of the capital, officials say',
    representative_article_id: 11, primary_category: 'disasters',
    rep_lng: -21.94, rep_lat: 64.15, rep_place_name_en: 'Reykjavik',
    first_published_at: '2026-08-24T01:00:00Z', last_article_at: '2026-08-24T02:00:00Z',
    materially_updated_at: '2026-08-24T02:00:00Z', article_count: 2, independent_source_count: 2,
    news_event_articles: [
      mem(11, 'guardian', 'Volcanic fissure reopens north of the capital, officials say', '2026-08-24T01:00:00Z'),
      mem(12, 'dw', 'Fissure reopens near Reykjavik', '2026-08-24T02:00:00Z'),
    ],
  },
  {
    ...base, id: 2, public_id: 'r416evt02',
    representative_title: 'Rail operator restores the cross-border timetable',
    representative_article_id: 21, primary_category: 'business',
    rep_lng: 151.2, rep_lat: -33.87, rep_place_name_en: 'Sydney',
    first_published_at: '2026-08-24T03:00:00Z', last_article_at: '2026-08-24T03:30:00Z',
    materially_updated_at: '2026-08-24T03:30:00Z', article_count: 1, independent_source_count: 1,
    news_event_articles: [mem(21, 'dw', 'Rail operator restores the cross-border timetable', '2026-08-24T03:00:00Z')],
  },
  {
    ...base, id: 3, public_id: 'r416evt03',
    representative_title: 'Court orders the ministry to publish the review',
    representative_article_id: 31, primary_category: 'politics',
    rep_lng: -58.38, rep_lat: -34.6, rep_place_name_en: 'Buenos Aires',
    first_published_at: '2026-08-24T04:00:00Z', last_article_at: '2026-08-24T04:20:00Z',
    materially_updated_at: '2026-08-24T04:20:00Z', article_count: 1, independent_source_count: 1,
    news_event_articles: [mem(31, 'guardian', 'Court orders the ministry to publish the review', '2026-08-24T04:00:00Z')],
  },
];

test('R416 the band carries the headline, and a pin opens the event it stands for', async ({ app }) => {
  /* ⚠ `app.page` — the booted, worker-scoped page. The plain `page` fixture is a DIFFERENT, never
     navigated page: a test that takes it waits sixty seconds for an element that will never exist
     while the screenshot on failure shows a perfectly healthy app (measured, #R416). */
  const page = app.page;
  await page.route(/\/rest\/v1\/news_sources/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SOURCES) }));
  await page.route(/\/rest\/v1\/news_events/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EVENTS) }));

  await page.waitForFunction(
    () => !!document.getElementById('btn-news') && !!window.IntMapLazy && !!window.IntMapOS,
    null, { timeout: 30000 },
  );
  await page.evaluate(async () => {
    await window.IntMapLazy.need('newsEvents');
    /* ⚠ タブはトグル。既に開いていれば押さない（#R402）。 */
    const nb = document.getElementById('btn-news');
    if (nb && !nb.classList.contains('active')) nb.click();
    const q = document.getElementById('search-input');
    if (q) q.value = '';
    document.getElementById('btn-search').click();
  });
  await page.waitForFunction(() => {
    try {
      return window.__IM_NEWS_SURFACE && window.__IM_NEWS_SURFACE() === 'events'
        && document.querySelectorAll('.news-item.news-event').length === 3
        && window.IntMapGeoEngine.layers.hasSource('news-points');
    } catch (_) { return false; }
  }, null, { timeout: 30000 });

  /* ── ① 上の操作列は 1 行で、ピン位置トグルは無い ─────────────────────────── */
  expect(await page.locator('#news-pinmode-seg').count()).toBe(0);
  const rowKids = await page.evaluate(() => {
    const r = document.querySelector('.news-seg-row');
    if (!r) return null;
    return { scope: !!r.querySelector('#news-scope'), chips: !!r.querySelector('#news-cat-chips') };
  });
  expect(rowKids).toEqual({ scope: true, chips: true });

  /* ── ② 帯に文字が在る ───────────────────────────────────────────────────
     ⚠ **これが報告された欠陥である。** `short` が空だと層も地物も無事なまま、ピルだけが
       中身無しで描かれる。だから数えるのは層の有無ではなく **文字列の中身**。
     ⚠ 3 件は別々の大陸に置いてあるので、まず**広い視点**にする。前のテストが残したカメラに
       依存すると、この検査は「見えている帯の数」で落ちる——訊きたいのはそこではない。
     ⚠ **枚数は主張ではない。** 視野の端に何が入るかは投影と viewport で変わる（実測: この
       視点でシドニーは画面外）。主張は「**描かれた帯は 1 本残らず文字を持つ**」であって、
       枚数の下限は「パイプラインが動いた」ことを言うためだけの 2 である。 */
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [10, 20], zoom: 1.1, pitch: 0, bearing: 0 }));
  await page.waitForFunction(
    () => window.IntMapGeoEngine.coords.queryRenderedFeatures(null, { layers: ['news-labels'] }).length >= 2,
    null, { timeout: 20000 },
  );
  const bands = await page.evaluate(() => {
    const GE = window.IntMapGeoEngine;
    const q = GE.coords.queryRenderedFeatures(null, { layers: ['news-labels'] });
    return {
      n: q.length,
      empty: q.filter((f) => !String(f.properties.short || '').trim()).length,
      withId: q.filter((f) => f.properties.ev === '1' && f.properties.evId).length,
    };
  });
  expect(bands.n).toBeGreaterThanOrEqual(2);
  /* ⚠ 「1 本でも空」で赤。件数ではなく**中身**が主張である。 */
  expect(bands.empty).toBe(0);
  expect(bands.withId).toBe(bands.n);

  /* ── ③ ピンを押すと、そのピンの出来事が開く ──────────────────────────────
     ⚠ `project()` は**地図コンテナ基準**、`page.mouse` は**ページ基準**である。canvas の
       矩形を足さずに押すと、サイドバーの幅ぶんずれた別の要素を押す（#R416 で 3 回外した）。 */
  const target = await page.evaluate(() => {
    const GE = window.IntMapGeoEngine;
    const cv = document.querySelector('canvas.maplibregl-canvas');
    const r = cv.getBoundingClientRect();
    const q = GE.coords.queryRenderedFeatures(null, { layers: ['news-dots'] })
      .filter((f) => f.properties.ev === '1');
    for (const f of q) {
      const p = GE.coords.project(f.geometry.coordinates);
      const x = Math.round(p.x + r.left); const y = Math.round(p.y + r.top);
      const el = document.elementFromPoint(x, y);
      if (el && el.tagName === 'CANVAS') return { x, y, evId: f.properties.evId };
    }
    return null;
  });
  expect(target, 'at least one event pin must be clickable on the bare canvas').not.toBeNull();

  let opened = null;
  page.on('popup', (pp) => { opened = pp.url(); });
  await page.mouse.click(target.x, target.y);
  await page.waitForSelector('.ev-detail', { timeout: 15000 });
  /* 開いたのは**押したピンの**出来事か。別の出来事なら「詳細が開いた」だけでは足りない。 */
  expect(await page.evaluate(() => window.IntMapNewsEvents.selected())).toBe(target.evId);
  /* ⚠ 外部サイトへ飛ばないこと。これが #R416 で変えた挙動そのものである。 */
  expect(opened, 'a news pin must not open an outlet article').toBeNull();
});
