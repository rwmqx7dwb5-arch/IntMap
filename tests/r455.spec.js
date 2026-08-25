/* ============================================================================
 *  R455 — ボタンの名前は「押すと何が起きるか」であること（ブラウザ実測）
 * ----------------------------------------------------------------------------
 *  「ニュースの詳細開くのに、○sourcesの部分をクリックするのはUIとして不自然。ボタンの名前を変えて。」
 *
 *  ⚠⚠⚠ **このボタンの<b>文言</b>を読んだ spec は、これまで1本も無かった。** `tests/r405` は
 *    `.ev-sources` が**在ること**と**押すと開くこと**を測り、`tests/r435` は押したあとの読む面の
 *    外皮を測る——どちらも綴りとふるまいで、テキストは一度も読んでいない。だから「3 sources」が
 *    ボタンの名前である状態は、全部緑のまま出荷され続けられた。ここがそれを読む。
 *
 *  ⚠ 上流は route で差し替える（`tests/r405.spec.js` と同じ理由）。測りたいのは「この形の応答を
 *    UI にできるか」であって、今日の本番に何が入っているかではない。
 *  ⚠ 固定の待ちを置かない（#R399）。待つのは**カードそのもの**——モジュールの状態が揃っただけでは
 *    まだ何も描かれていない。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const SOURCES = [
  { id: 'guardian', name: 'The Guardian', slug: 'guardian', source_type: 'newspaper', country: 'GB', hq_lng: -0.12, hq_lat: 51.53, source_family: 'guardian', homepage_url: 'https://theguardian.com' },
  { id: 'dw', name: 'DW', slug: 'dw', source_type: 'broadcaster', country: 'DE', hq_lng: 6.96, hq_lat: 50.94, source_family: 'dw', homepage_url: 'https://dw.com' },
  { id: 'reuters', name: 'Reuters', slug: 'reuters', source_type: 'wire', country: 'GB', hq_lng: -0.11, hq_lat: 51.51, source_family: 'reuters', homepage_url: 'https://reuters.com' },
];

const mem = (id, source_id, title, at) => ({
  relation: 'same_event', assignment_score: 0.6, assigned_by: 'deterministic',
  news_articles: {
    id, title, description: '', canonical_url: 'https://example.org/a' + id,
    source_id, published_at: at, subject_name_en: 'Conakry', subject_type: 'city',
  },
});

const base = {
  status: 'active', category: 'disaster', subject_lng: -13.7, subject_lat: 9.5,
  subject_name_en: 'Conakry', subject_type: 'city', first_seen_at: '2026-08-24T01:00:00Z',
};

/* ⚠ TWO EVENTS, AND THE COUNTS ARE 3 AND 1 ON PURPOSE — the singular half of the label has its own
   sentence in every language, and a spec that only ever sees a plural cannot see 「1 媒体s」. */
const EVENTS = [
  {
    ...base, id: 1, public_id: 'r455a', representative_title: 'Landslide at Conakry landfill kills 30',
    last_seen_at: '2026-08-24T06:00:00Z', materially_updated_at: '2026-08-24T06:00:00Z',
    article_count: 3, independent_source_count: 3,
    news_event_articles: [
      mem(11, 'guardian', 'Landslide at Conakry landfill kills 30', '2026-08-24T01:00:00Z'),
      mem(12, 'dw', 'Thirty dead in Conakry landslide', '2026-08-24T02:00:00Z'),
      mem(13, 'reuters', 'Guinea landslide toll rises', '2026-08-24T03:00:00Z'),
    ],
  },
  {
    ...base, id: 2, public_id: 'r455b', representative_title: 'A single outlet reports a rail deal',
    last_seen_at: '2026-08-24T05:00:00Z', materially_updated_at: '2026-08-24T05:00:00Z',
    article_count: 1, independent_source_count: 1,
    news_event_articles: [mem(21, 'dw', 'A single outlet reports a rail deal', '2026-08-24T04:00:00Z')],
  },
];

async function loadEvents(page) {
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
    /* ⚠ タブはトグルである。開いていなければ開く——無条件に押すと閉じる（#R402） */
    const nb = document.getElementById('btn-news');
    if (nb && !nb.classList.contains('active')) nb.click();
    const q = document.getElementById('search-input');
    if (q) q.value = '';
    document.getElementById('btn-search').click();
  });
  await page.waitForFunction(() => {
    try {
      const E = window.IntMapNewsEvents;
      return window.__IM_NEWS_SURFACE && window.__IM_NEWS_SURFACE() === 'events'
        && E && E.events().length === 2
        && document.querySelectorAll('.news-item.news-event .ev-sources').length === 2;
    } catch (_) { return false; }
  }, null, { timeout: 30000 });
}

/* ⚠⚠ `{ page }` は Playwright 既定の**まだどこへも行っていない**ページである。このファイルの
   最初の版はそれを使い、`btn-news` を 30 秒待って 3 本とも落ちた——アプリが起動していないのだから
   当然で、赤の原因は測っている対象と何の関係も無かった。起動済みのページは `app.page`
   （`tests/helpers/app.js`：worker ごとに 1 回だけ起動し、各テストの前に `app.reset()` が
   既定の視点へ戻す）。 */
/* ⚠⚠⚠ **3つの主張を 1 本にまとめてある。** 分けて書いた初版は実測 4.6 s（body）で、
   core の天井を 2 s 超えた。`scripts/test-budget.mjs` はそのとき「天井を上げるな、時間のほうを
   削れ」と言う——そしてこの 3 つは**同じ読み込み済みの状態**を見ているので、`loadEvents` を
   3 回走らせる理由が無い。覆いは 1 バイトも減っていない。 */
test('R455 出来事カードのボタンは、名前が動作で始まり、同じものを開き、はみ出さない', async ({ app }) => {
  const page = app.page;
  await loadEvents(page);

  /* ① 名前は動作で始まり、媒体数は括弧の中に残る（単数形も文になっている） */
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.news-item.news-event .ev-sources')].map((b) => b.textContent.trim()));
  expect(labels.length).toBe(2);
  /* 先頭が動作の名前であること。⚠ 「3 sources」で始まってはいけない——それがこのラウンドの報告 */
  for (const l of labels) expect(l).toMatch(/^(Details|詳細)/);
  /* 数は消えていない（CLAUDE.md §3.1 — 名前を直すことと情報を削ることは別の変更） */
  expect(labels.some((l) => /\(3 sources\)|（3媒体）/.test(l))).toBe(true);
  /* ⚠ 単数形。「1 sources」の形が出たらここで落ちる。
     ⚠⚠⚠ この `\b` は一度**生の 0x08（backspace）に潰れて出荷されかけた**——ファイルを
     heredoc で書き戻したときにバックスラッシュが食われた（#R435 で実測されている形）。
     ⚠ たちの悪いのは `JSON.stringify` すると "/\\b1 sources\\b/" と**正しく見える**こと、
     そして `.not.toMatch(…)` なので**どんな文字列にもマッチしない正規表現は恒真**になること。
     spec は緑のままで、この行だけが何も確かめていなかった。見つけたのは
     `tests/r394-checks ②b`（正規表現の中の生の制御文字を見張る門）。書き戻すなら .py/.mjs 経由で。 */
  expect(labels.some((l) => /\(1 source\)|（1媒体）/.test(l))).toBe(true);
  for (const l of labels) expect(l).not.toMatch(/\b1 sources\b/);

  /* ② 長くなった名前が下段からはみ出さない。
     ⚠ 幅は**測る**。`.news-foot` は flex で `.news-pub` が `min-width:0` で縮むので理屈の上では
     収まるが、#R438 の教訓どおり「収まるはず」は測定ではない。携帯幅でも見る。 */
  /* ⚠ 幅は 2 つだけ見るし、1 つ目は**今の幅のまま**測る——`setViewportSize` は毎回再レイアウトを
     起こすので、既定の幅へもう一度張り直すのは core の天井（`scripts/test-budget.mjs`）を
     実測で削るときに一番先に消せるコストである。 */
  for (const w of [null, 375]) {
    if (w) await page.setViewportSize({ width: w, height: 900 });
    const fit = await page.evaluate(() => {
      const b = document.querySelector('.news-item.news-event .ev-sources');
      const foot = b.parentElement;
      const fr = foot.getBoundingClientRect(), br = b.getBoundingClientRect();
      return { over: br.right - fr.right, hScroll: foot.scrollWidth - foot.clientWidth, btnW: br.width };
    });
    expect(fit.btnW, 'the button has a real width at ' + (w || 'default') + 'px').toBeGreaterThan(20);
    expect(fit.over, 'the button stays inside the foot row at ' + (w || 'default') + 'px').toBeLessThanOrEqual(1);
    expect(fit.hScroll, 'the foot row does not scroll sideways at ' + (w || 'default') + 'px').toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  /* ③ 名前を変えただけで、同じボタンが同じものを開く。
     ⚠ 綴り（`ev-sources`）は変えていないので、既存の spec と CSS 規則はそのまま当たる */
  const title = await page.evaluate(() =>
    document.querySelector('.news-item.news-event .ev-sources').title);
  expect(title.length, 'マウスオーバーの媒体名一覧は残っている').toBeGreaterThan(0);
  await page.evaluate(() => document.querySelector('.news-item.news-event .ev-sources').click());
  await page.waitForSelector('.ev-detail', { timeout: 15000 });
  expect(await page.locator('.ev-detail').count()).toBe(1);
  await page.evaluate(() => { const b = document.getElementById('ev-back'); if (b) b.click(); });
  await page.waitForSelector('.ev-detail', { state: 'detached', timeout: 10000 }).catch(() => {});
});
