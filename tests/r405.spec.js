/* ============================================================================
 *  R405 — 出来事の中身が、ブラウザで実際に描かれること
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ **ソースの形の検査は「描かれた」を言えない。** #R402 が実測したとおり、
 *    #R372 の最初の版は起動時の取得を正しく止めたうえで News タブを永久に「Loading」に
 *    していた——ソースの形を見る門はすべて緑だった。「1 クリックで降りてカードになる」は
 *    ブラウザにしか訊けない。ここがそれを訊く。
 *
 *  ⚠ 上流は route で差し替える（`tests/r386-detail.spec.js` と同じ理由）。測りたいのは
 *    「この形の応答を UI にできるか」であって、今日の本番に何が入っているかではない。
 *  ⚠ 触るのは公開の入口だけ。モジュールの内側に手を入れる検査は、ボタンが壊れたあとも
 *    緑のままになる。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const SOURCES = [
  { id: 'guardian', name: 'The Guardian', slug: 'guardian', source_type: 'newspaper', country: 'GB', hq_lng: -0.12, hq_lat: 51.53, source_family: 'guardian', homepage_url: 'https://theguardian.com' },
  { id: 'dw', name: 'DW', slug: 'dw', source_type: 'broadcaster', country: 'DE', hq_lng: 6.96, hq_lat: 50.94, source_family: 'dw', homepage_url: 'https://dw.com' },
  { id: 'skynews', name: 'Sky News', slug: 'skynews', source_type: 'broadcaster', country: 'GB', hq_lng: -0.31, hq_lat: 51.49, source_family: 'skynews', homepage_url: 'https://news.sky.com' },
  { id: 'reuters', name: 'Reuters', slug: 'reuters', source_type: 'wire', country: 'GB', hq_lng: -0.11, hq_lat: 51.51, source_family: 'reuters', homepage_url: 'https://reuters.com' },
  { id: 'bloomberg', name: 'Bloomberg', slug: 'bloomberg', source_type: 'wire', country: 'US', hq_lng: -73.97, hq_lat: 40.76, source_family: 'bloomberg', homepage_url: 'https://bloomberg.com' },
];

const mem = (id, source_id, title, at, description) => ({
  relation: 'same_event', assignment_score: 0.6, assigned_by: 'deterministic',
  news_articles: {
    id, title, description: description || '', canonical_url: 'https://example.org/a' + id,
    source_id, published_at: at, subject_name_en: 'Conakry', subject_type: 'city',
  },
});

const base = {
  representative_article_id: 0, secondary_categories: [], category_confidence: 0.8,
  category_evidence: { by: 'feed' }, location_confidence: 0.7, cluster_confidence: 0.6,
  manual_lock: false, status: 'active', merged_into: null,
  summary: null, summary_evidence: null, summary_version: null,
};

const EVENTS = [
  /* ① 3 系列が本文を持つ出来事。gist は 2 文以上・数量あり・4 時間後の続報あり。 */
  {
    ...base, id: 1, public_id: 'ebrief01', representative_title: 'Landslide at Conakry landfill kills 30, government says',
    representative_article_id: 11, primary_category: 'disasters',
    rep_lng: -13.68, rep_lat: 9.51, rep_place_name_en: 'Conakry',
    first_published_at: '2026-08-24T01:00:00Z', last_article_at: '2026-08-24T06:00:00Z',
    materially_updated_at: '2026-08-24T06:00:00Z', article_count: 3, independent_source_count: 3,
    news_event_articles: [
      mem(11, 'skynews', 'Landslide at waste site in Guinea kills 30', '2026-08-24T01:00:00Z',
        'A landslide at a waste site in Guinea has killed 30 people after a mound of rubbish collapsed on to nearby homes.'),
      mem(12, 'dw', 'Guinea landfill collapse buries homes', '2026-08-24T02:00:00Z',
        'A mound of waste collapsed at a landfill in Conakry after heavy overnight rains, engulfing several nearby homes.'),
      mem(13, 'guardian', 'Conakry dump collapse: minister had promised to move the site', '2026-08-24T06:00:00Z',
        'The government said 12 people missing in the collapse had not been found, and that the search would continue after nightfall. Continue reading...'),
    ],
  },
  /* ② 上流が本文を配っていない出来事（実測 48.7% の形）。正直に「無い」と言うこと。 */
  {
    ...base, id: 2, public_id: 'ebrief02', representative_title: 'GOP lawmaker urges the president to restore military drills',
    representative_article_id: 21, primary_category: 'politics',
    rep_lng: null, rep_lat: null, rep_place_name_en: null, location_confidence: null,
    first_published_at: '2026-08-24T03:00:00Z', last_article_at: '2026-08-24T03:30:00Z',
    materially_updated_at: '2026-08-24T03:30:00Z', article_count: 2, independent_source_count: 2,
    news_event_articles: [
      mem(21, 'reuters', 'GOP lawmaker urges the president to restore military drills', '2026-08-24T03:00:00Z', ''),
      mem(22, 'bloomberg', 'Lawmaker presses for a return of the drills', '2026-08-24T03:30:00Z', ''),
    ],
  },
  /* ③ サーバーが書いた統合文を持つ出来事。 */
  {
    ...base, id: 3, public_id: 'ebrief03', representative_title: 'Two outlets describe the same rail deal',
    representative_article_id: 31, primary_category: 'business',
    rep_lng: 105.8, rep_lat: 21.0, rep_place_name_en: 'Hanoi',
    first_published_at: '2026-08-24T04:00:00Z', last_article_at: '2026-08-24T04:40:00Z',
    materially_updated_at: '2026-08-24T04:40:00Z', article_count: 2, independent_source_count: 2,
    summary: 'The government approved an extra $3 billion for the rail link. Construction is due to start next year.',
    summary_version: 1,
    summary_evidence: {
      v: 1, fp: 'x', by: 'llm', provider: 'test', model: 'test',
      outlets: ['dw', 'guardian'],
      sentences: [
        { text: 'The government approved an extra $3 billion for the rail link.', outlet: 'dw', span: 'approved an extra $3 billion for the rail link' },
        { text: 'Construction is due to start next year.', outlet: 'guardian', span: 'construction is due to start next year' },
      ],
    },
    news_event_articles: [
      mem(31, 'dw', 'Cabinet clears more money for the rail link', '2026-08-24T04:00:00Z',
        'The cabinet approved an extra $3 billion for the rail link at a meeting on Monday morning.'),
      mem(32, 'guardian', 'Rail link gets fresh funding', '2026-08-24T04:40:00Z',
        'Construction is due to start next year, according to two officials briefed on the plan.'),
    ],
  },
  /* ④ 統合文は在るが、**引用元がいまの構成記事に居ない**。出してはならない。 */
  {
    ...base, id: 4, public_id: 'ebrief04', representative_title: 'A summary that cites an outlet no longer here',
    representative_article_id: 41, primary_category: 'world',
    rep_lng: 2.35, rep_lat: 48.86, rep_place_name_en: 'Paris',
    first_published_at: '2026-08-24T05:00:00Z', last_article_at: '2026-08-24T05:20:00Z',
    materially_updated_at: '2026-08-24T05:20:00Z', article_count: 1, independent_source_count: 1,
    summary: 'A stale sentence that should never be shown to anybody.',
    summary_version: 1,
    summary_evidence: {
      v: 1, fp: 'stale', by: 'llm', provider: 'test', model: 'test',
      outlets: ['skynews'],
      sentences: [{ text: 'A stale sentence that should never be shown to anybody.', outlet: 'skynews', span: 'stale sentence that should never be shown' }],
    },
    news_event_articles: [
      mem(41, 'dw', 'A summary that cites an outlet no longer here', '2026-08-24T05:00:00Z',
        'The ministry confirmed on Monday that the review would be published before the end of the year.'),
    ],
  },
];

async function loadEvents(page) {
  await page.route(/\/rest\/v1\/news_sources/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SOURCES) }));
  await page.route(/\/rest\/v1\/news_events/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EVENTS) }));
  /* ⚠⚠⚠ **タブはトグルである。** `btn-news` を 1 回押すのは「News を開く」ではなく
     「News の開閉を切り替える」で、既に開いていれば閉じる（#R402 が spec の helper で
     実測した形）。`E.events()` だけを見る検査は、パネルが閉じたままでも緑になる
     ——`fetchData()` はタブに関係なく走るからである。⇒ **開いた状態になるまで押す。** */
  /* ⚠ セッション復元は起動より遅れて走り、**あとから News タブを開閉する**。固定の待ちで
     避けると 1 テストあたり数秒を捨てる（試験時間の予算は秒単位でしか余っていない）。
     ⇒ **条件で待つ**——復元が終わった印は「`#btn-news` が在り、アプリが起動している」。 */
  await page.waitForFunction(
    () => !!document.getElementById('btn-news') && !!window.IntMapLazy && !!window.IntMapOS,
    null, { timeout: 30000 },
  );
  await page.evaluate(async () => {
    await window.IntMapLazy.need('newsEvents');
    /* ⚠ セッション復元が News を先に開いていることがある。**開いていなければ開く**
       ——無条件に押すと閉じる（`.active` はアプリ自身が setMode で保つ印）。 */
    const nb = document.getElementById('btn-news');
    if (nb && !nb.classList.contains('active')) nb.click();
    const q = document.getElementById('search-input');
    if (q) q.value = '';
    document.getElementById('btn-search').click();
  });
  /* ⚠⚠⚠ **モジュールの状態が揃っただけでは、まだ何も描かれていない。** `E.events()` は
     `load()` が置く値で、カードを作るのは そのあとの `startNews()` → `appendNewsBatch()`
     である。ここで `events().length` だけを待つと、**DOM が空のまま**次へ進む
     （#R402 の「ソースの形の門は緑なのに News タブが永久に Loading」と同じ位置の穴）。
     ⇒ 待つのは**カードそのもの**。 */
  await page.waitForFunction(() => {
    try {
      const E = window.IntMapNewsEvents;
      return window.__IM_NEWS_SURFACE && window.__IM_NEWS_SURFACE() === 'events'
        && E && E.events().length === 4
        && document.querySelectorAll('.news-item.news-event').length === 4;
    } catch (_) { return false; }
  }, null, { timeout: 30000 });
}

/** 詳細を閉じて一覧へ戻る。⚠ `.ev-detail` は 1 面しかないので、閉じ切ってから次を開く。 */
async function backToList(page) {
  await page.evaluate(() => { const b = document.getElementById('ev-back'); if (b) b.click(); });
  await page.waitForSelector('.ev-detail', { state: 'detached', timeout: 10000 }).catch(() => { });
}

async function openDetail(page, publicId) {
  await page.evaluate((pid) => {
    const cards = [...document.querySelectorAll('.news-item')];
    for (const c of cards) {
      const b = c.querySelector('.ev-sources');
      if (!b) continue;
      const item = (window.IntMapNewsEvents.events() || []).find((e) => e.publicId === pid);
      if (!item) continue;
      /* カードと Event の対応は見出しで取る（DOM の並びに依存しない）。 */
      const t = c.querySelector('.news-title');
      if (t && t.textContent.includes(item.title.slice(0, 30))) { b.click(); return; }
    }
  }, publicId);
  await page.waitForSelector('.ev-detail', { timeout: 15000 });
}

test('R405 出来事の中身が、カードと詳細でブラウザに実際に描かれる', async ({ app }) => {
  const page = app.page;
  await loadEvents(page);

  const out = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.news-item')];
    const withGist = cards.filter((c) => c.querySelector('.ev-gist'));
    const g = withGist[0] && withGist[0].querySelector('.ev-gist');
    return {
      cards: cards.length,
      withGist: withGist.length,
      gistText: g ? g.textContent : '',
      gistSrc: g && g.querySelector('.ev-gist-src') ? g.querySelector('.ev-gist-src').textContent : '',
      /* ⚠ Event のカードから「記事を読む」が外れていること。 */
      readButtons: cards.filter((c) => c.querySelector('.btn-read')).length,
      sourcesButtons: cards.filter((c) => c.querySelector('.ev-sources')).length,
    };
  });
  expect(out.cards).toBe(4);
  /* 本文を持つのは ①③④ の 3 件。② は上流が配っていないので要点も出ない。 */
  expect(out.withGist).toBe(3);
  expect(out.gistText).toContain('killed 30 people');
  expect(out.gistSrc).toContain('Sky News');
  /* ⚠⚠⚠ **出典は文より前に出ていること。** 末尾に置くと 2 行クランプで切り落とされ、
     カードから出典が消える（実測: 本番データのスクリーンショットで全カードが無出典だった）。 */
  expect(out.gistText.indexOf('Sky News')).toBeLessThan(out.gistText.indexOf('killed 30 people'));
  /* ⚠⚠ ここが 0 でなければ「二次導線に下げた」が嘘になる。 */
  expect(out.readButtons).toBe(0);
  expect(out.sourcesButtons).toBe(4);

  /* ── ここから先は詳細。⚠ アプリの起動は 1 回だけ——試験時間の予算は秒単位でしか
     余っていない（#R204「re-tier するな、速くしろ」）。主張は 1 つも減らしていない。 */
  /* ⚠ 元は 3 本（②③④）だった。畳んだのは**アプリの起動回数**だけで、主張は 1 つも
     減っていない——`scripts/test-budget.mjs` の core の余裕は分ではなく秒しか無く、
     #R204 が「re-tier するな、速くしろ」と書いている。 */

  /* ── (a) 3 系列が本文を持つ出来事 ── */
  await openDetail(page, 'ebrief01');

  const rich = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const all = (s) => [...document.querySelectorAll(s)];
    return {
      lines: all('.ev-brief .ev-line').map((n) => n.textContent),
      srcs: all('.ev-brief .ev-line .ev-src').map((n) => n.textContent.replace(/^—\s*/, '')),
      figs: all('.ev-figs .ev-fig').map((n) => n.textContent),
      hasUpdate: !!q('.ev-upd'),
      updText: q('.ev-upd') ? q('.ev-upd').textContent : '',
      covReads: all('.ev-cov-read').length,
      covHrefs: all('.ev-cov-read').map((a) => a.getAttribute('href')),
      hasShort: !!q('.ev-short'),
      /* 上流の定型が画面に出ていないこと。 */
      boilerplate: document.querySelector('.ev-detail').textContent.includes('Continue reading'),
    };
  });

  /* 3 系列が本文を持つので 2 文以上・**1 系列 1 文**。 */
  expect(rich.lines.length).toBeGreaterThanOrEqual(2);
  expect(new Set(rich.srcs).size).toBe(rich.srcs.length);
  expect(rich.srcs).toContain('Sky News');
  /* ⚠ 1 行ごとに出典が付いていること——これがこの機能の約束である。 */
  expect(rich.srcs.length).toBe(rich.lines.length);
  /* 数量（死者 30・行方不明 12）が出ること。#R386 は食い違ったときしか出していなかった。
     ⚠ fixture は «12 people missing» と書いてある。«12 people **remain** missing» は
       js/news-claims.js の綴りに当たらない——実測 (2026-08-24・active 1,000 本) で
       その語形を広げても当たる記事は **2 → 2 で 1 本も増えなかった**ので、効果ゼロの
       規則変更はしていない。取りこぼしが実際に出る corpus になったら、そのときに測って直す。 */
  expect(rich.figs.join(' ')).toContain('30');
  expect(rich.figs.join(' ')).toContain('12');
  /* 5 時間後の続報は「更新」。 */
  expect(rich.hasUpdate).toBe(true);
  expect(rich.updText).toContain('The Guardian');
  /* 「記事を読む」の行き先——**媒体ごとに**在ること。 */
  expect(rich.covReads).toBe(3);
  expect(rich.covHrefs.every((h) => /^https:\/\/example\.org\/a1/.test(h))).toBe(true);
  /* 読めているので「足りない」とは書かない。 */
  expect(rich.hasShort).toBe(false);
  /* 上流の定型は剥がれている。 */
  expect(rich.boilerplate).toBe(false);

  /* ── (b) 上流が本文を配っていない出来事（実測 48.7% の形） ── */
  await backToList(page);
  await openDetail(page, 'ebrief02');

  const thin = await page.evaluate(() => ({
    lines: document.querySelectorAll('.ev-brief .ev-line').length,
    short: document.querySelector('.ev-short') ? document.querySelector('.ev-short').textContent : '',
    hasBriefSection: !!document.querySelector('.ev-brief'),
    covReads: document.querySelectorAll('.ev-cov-read').length,
  }));
  expect(thin.hasBriefSection).toBe(true);
  expect(thin.lines).toBe(0);
  /* ⚠⚠ 空欄でも「エラー」でもなく、**なぜ手元に無いのか**が書いてあること。 */
  expect(thin.short.length).toBeGreaterThan(20);
  /* 読むところが無いわけではない——発信元へは行ける。 */
  expect(thin.covReads).toBe(2);

  /* ── (c) サーバーが書いた統合文と、引用元が居なくなった統合文 ── */
  await backToList(page);

  await openDetail(page, 'ebrief03');
  const good = await page.evaluate(() => {
    const all = (s) => [...document.querySelectorAll(s)];
    return {
      syn: !!document.querySelector('.ev-syn'),
      synLines: all('.ev-syn .ev-line').map((n) => n.textContent),
      synSrcs: all('.ev-syn .ev-line .ev-src').map((n) => n.textContent.replace(/^—\s*/, '')),
      spans: all('.ev-syn-ev .ev-diff-ctx').map((n) => n.textContent),
      /* 統合文があるとき、原文の引用には見出しが付く。 */
      sub: !!document.querySelector('.ev-sub'),
    };
  });
  expect(good.syn).toBe(true);
  expect(good.synLines.length).toBe(2);
  expect(good.synSrcs).toEqual(['DW', 'The Guardian']);
  /* ⚠ 根拠の断片が読める形で添えてあること（AI が書いたことを隠さない）。 */
  expect(good.spans.length).toBe(2);
  expect(good.spans.join(' ')).toContain('$3 billion');
  expect(good.sub).toBe(true);

  /* ⚠⚠⚠ 引用元がいまの構成記事に居ない統合文は出さない。 */
  await page.evaluate(() => { const b = document.getElementById('ev-back'); if (b) b.click(); });
  await page.waitForSelector('.ev-detail', { state: 'detached', timeout: 10000 }).catch(() => { });
  await openDetail(page, 'ebrief04');
  const stale = await page.evaluate(() => ({
    syn: !!document.querySelector('.ev-syn'),
    text: document.querySelector('.ev-detail').textContent,
  }));
  expect(stale.syn).toBe(false);
  expect(stale.text).not.toContain('stale sentence');
  /* それでも決定論の抽出は出ている。 */
  expect(stale.text).toContain('The ministry confirmed on Monday');
});