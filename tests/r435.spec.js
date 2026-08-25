/* ============================================================================
 *  R435 — 出来事の詳細は「読む面」であって、一覧の残り物ではない
 * ----------------------------------------------------------------------------
 *  報告は 3 つで、原因は 1 つだった——`#news-reader-pane` は**1 つの読む面**なのに、
 *  出来事の詳細だけが**その面への入り方・出方を持っていなかった**。
 *
 *    ① 「左上に出る戻るボタンが見えない」
 *       → 帯は `.reader-bar`/`.btn-back` と書かれ、CSS は `.ev-detail .reader-bar` と
 *         `.ev-detail .btn-back`。帯は `.ev-detail` の**兄弟**なので当たらず、ボタンは
 *         ブラウザ既定の <button>（#f0f0f0・角丸 0・padding 0・2px outset・44×20）だった。
 *         しかも電話では、詳細がシートを full にしないので**画面の外に落ちた**
 *         （実測 390×780・peek: y=866）。
 *    ② 「デザインが浮いている」
 *       → 一覧の外皮（タブ列・検索欄・scope と カテゴリの chips）を伏せないので、
 *         読む面が「一覧の残した帯」に描かれていた。記事 reader は伏せている。
 *    ③ 「半分だけになる謎の状態に勝手になる」
 *       → `renderUI()` は読む面の存在を知らないので、再描画のたびに一覧を出し直し、
 *         `flex:1 1 auto` の兄弟 2 つがサイドバーの高さを**折半**した
 *         （実測 390×780: 一覧 85px @y=339 / 読む面 356px @y=424）。
 *
 *  ⚠⚠⚠ **ソースの形の検査（tests/r435-checks.test.mjs）はここを言えない。** 「CSS の規則が
 *    在る」ことと「その規則がこの要素に当たる」ことは別で、当たらない CSS は綴りとしては
 *    完全に健在である。①②③ はどれも**計算済みスタイルと配置**にしか現れない。
 *  ⚠ **1 テスト・1 起動・電話の視野。** 報告は電話のものなので視野は 390×780 で測り、
 *    worker 共有の page を汚さないよう最後に既定（1280×720）へ戻す。
 *
 *  ══ (#R451) 同じ面の、同じ起動で測れるもう 1 つの主張 ═════════════════════════════════
 *  #R435 が伏せた外皮には **タブ列そのもの**（`.control-panel`）が入っている。だから読んでいる
 *  間は News / Companies / Countries / **Atlas** が 0×0 で、通常のサイドバーには
 *  「読んでいるものについて Atlas に訊く」操作が 1 つも無かった——#R430 が架けた
 *  `window._imReader` の橋は、workspace mode でしか渡っていなかった（実測 本番 build R441）。
 *  ⚠ **新しい spec ファイルは作らない。** これは同じ面・同じ起動・同じ試料についての主張で、
 *    scripts/test-budget.mjs の言う「積み増しではなく統合」がそのまま当てはまる。④ を見よ。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const SOURCES = [
  { id: 'guardian', name: 'The Guardian', slug: 'guardian', source_type: 'newspaper', country: 'GB', hq_lng: -0.12, hq_lat: 51.53, source_family: 'guardian', homepage_url: 'https://theguardian.com' },
];
const EVENTS = [{
  id: 1, public_id: 'r435evt01', representative_article_id: 11,
  representative_title: 'Volcanic fissure reopens north of the capital, officials say',
  primary_category: 'disasters', secondary_categories: [], category_confidence: 0.8,
  category_evidence: { by: 'feed' }, location_confidence: 0.7, cluster_confidence: 0.6,
  manual_lock: false, status: 'active', merged_into: null,
  summary: null, summary_evidence: null, summary_version: null,
  rep_lng: -21.94, rep_lat: 64.15, rep_place_name_en: 'Reykjavik',
  first_published_at: '2026-08-24T01:00:00Z', last_article_at: '2026-08-24T02:00:00Z',
  materially_updated_at: '2026-08-24T02:00:00Z', article_count: 1, independent_source_count: 1,
  news_event_articles: [{
    relation: 'same_event', assignment_score: 0.6, assigned_by: 'deterministic',
    news_articles: {
      id: 11, title: 'Volcanic fissure reopens north of the capital, officials say',
      description: 'The ministry confirmed the figure on Monday afternoon.',
      canonical_url: 'https://example.org/a11', source_id: 'guardian',
      published_at: '2026-08-24T01:00:00Z', subject_name_en: 'Reykjavik', subject_type: 'city',
    },
  }],
}];

/* 一覧の外皮——読む面が開いている間、1 つも画面に残っていてはならず、閉じれば 3 つとも戻る。
   ⚠ **News タブで無条件に出るものだけを並べる。** `#ai-geocode-row` は「一覧に UI 言語以外の
     見出しが在るとき」だけ出るので（#R30）、この試料では最初から伏せている＝ここに入れると
     「戻ってきた」を主張できない条件付きの行になる。伏せる集合と戻す集合のずれは
     tests/r435-checks ④ が綴りの側で見張る。 */
const CHROME = ['.control-panel', '#sidebar-search-bar', '#news-filter-toggle'];

/** 画面の状態を 1 回の evaluate で読み出す（試験時間は秒単位でしか余っていない）。 */
const probe = (page, chrome) => page.evaluate((sels) => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left) }; };
  const one = (sel) => { const el = sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel); return el ? { disp: getComputedStyle(el).display, ...box(el) } : null; };
  const btn = document.getElementById('ev-back');
  const bar = document.querySelector('#news-reader-pane .nrp-bar');
  const cs = btn ? getComputedStyle(btn) : null;
  return {
    feed: one('#live-news-feed'), pane: one('#news-reader-pane'), countries: one('#countries-feed'),
    chromeShown: sels.filter((s) => { const el = one(s); return el && el.disp !== 'none'; }),
    barPos: bar ? getComputedStyle(bar).position : null,
    /* (#R451) タブ列は伏せられている＝Atlas へ行く既定の操作が無い。読む面が自分で道を持つ。 */
    tabsH: [...document.querySelectorAll('.control-panel .mode-btn')].map((b) => Math.round(b.getBoundingClientRect().height)),
    atlasBtn: (() => { const a = document.querySelector('#news-reader-pane .nrp-atlas'); if (!a) return null;
      const s = getComputedStyle(a); return { radius: parseFloat(s.borderTopLeftRadius), padTop: parseFloat(s.paddingTop), ...box(a) }; })(),
    reader: (() => { const r = window._imReader; return r ? { title: r.title, onScreen: r.onScreen } : null; })(),
    back: cs ? { radius: parseFloat(cs.borderTopLeftRadius), padTop: parseFloat(cs.paddingTop), ...box(btn) } : null,
    vh: window.innerHeight,
    atlasSelected: (() => { try { const s = window.IntMapNewsEvents.state(); return s ? s.selectedEventId : null; } catch (_) { return 'ERR'; } })(),
  };
}, chrome);

test('R435 the event detail opens as the reading surface, and nothing renders beside it', async ({ app }) => {
  const page = app.page;
  await page.route(/\/rest\/v1\/news_sources/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SOURCES) }));
  await page.route(/\/rest\/v1\/news_events/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EVENTS) }));
  await page.waitForFunction(
    () => !!document.getElementById('btn-news') && !!window.IntMapLazy && !!window.IntMapOS,
    null, { timeout: 30000 },
  );
  await page.evaluate(async () => {
    await window.IntMapLazy.need('newsEvents');
    const nb = document.getElementById('btn-news');
    if (nb && !nb.classList.contains('active')) nb.click();   /* タブはトグル。開いていれば押さない（#R402） */
    const q = document.getElementById('search-input'); if (q) q.value = '';
    document.getElementById('btn-search').click();
  });
  await page.waitForFunction(() => document.querySelectorAll('.news-item.news-event').length === 1, null, { timeout: 30000 });

  /* ⚠ 報告は電話のもの。シートの detent は既定の peek のままにする——詳細が自分で full に
     しなければ、戻るボタンは画面の下に落ちる。それが ① の半分である。 */
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForFunction(() => window.matchMedia('(max-width:768px)').matches
    && getComputedStyle(document.querySelector('.sheet-grip')).display !== 'none', null, { timeout: 15000 });
  await page.evaluate(() => document.querySelector('.news-item.news-event .ev-sources').click());
  await page.waitForFunction(() => !!document.getElementById('ev-back'), null, { timeout: 15000 });
  /* ⚠ **待つのは「シートが止まったこと」であって、主張そのものではない。** 戻るボタンが画面に
     入ったかを待ってから同じことを assert すると、その assert は二度と赤にならない（#R399）。
     シートは 460 ms の transform 遷移なので、位置が 2 フレーム続けて動かないことだけを待つ。 */
  await page.waitForFunction(() => new Promise((ok) => {
    const el = document.getElementById('sidebar');
    const a = el.getBoundingClientRect().top;
    requestAnimationFrame(() => requestAnimationFrame(() => ok(Math.abs(el.getBoundingClientRect().top - a) < 0.5)));
  }), null, { timeout: 15000, polling: 'raf' });

  const open = await probe(page, CHROME);

  /* ── ① 戻るボタンは画面の中に在り、素の <button> ではない ─────────────────────
     ⚠ 「角丸が 0 でない」は装飾の話ではない。ブラウザ既定の <button> は角丸 0・padding 0 で、
       それが出るということは**このボタンに当たっている規則が 1 つも無い**ということである。 */
  expect(open.back, 'the detail must have a back button').not.toBeNull();
  expect(open.back.top, 'the back button must be on screen, not below the fold').toBeGreaterThanOrEqual(0);
  expect(open.back.bottom).toBeLessThanOrEqual(open.vh);
  expect(open.back.radius, 'a UA-default button means no rule matched it').toBeGreaterThan(8);
  expect(open.back.padTop).toBeGreaterThan(0);
  /* 帯は面の上端に留まる。`.ev-detail .reader-bar` は当たらなかったので `static` だった。 */
  expect(open.barPos).toBe('sticky');

  /* ── ② 一覧の外皮は 1 つも残っていない（＝読む面であって、残り物の帯ではない）── */
  expect(open.chromeShown, 'the list chrome must be off while the reading surface is up').toEqual([]);
  expect(open.feed.disp).toBe('none');
  expect(open.pane.disp).not.toBe('none');
  expect(open.atlasSelected).toBe('r435evt01');

  /* ── ③-a 背景の再描画は、読んでいる人に見えない ───────────────────────────────
     設定の適用は `renderUI()` を呼ぶ——auth の realtime 購読・言語切替と同じ経路である。
     ⚠ ここで一覧が戻ると、サイドバーの flex 列が高さを折半する＝報告の「半分だけ」。 */
  await page.evaluate(() => document.getElementById('btn-close-settings').click());
  const after = await probe(page, CHROME);
  expect(after.feed.disp, 'a background re-render must not put the list back beside the reader').toBe('none');
  expect(after.pane.disp).not.toBe('none');
  expect(after.chromeShown).toEqual([]);

  /* ── ③-b タブを離れれば読む面は閉じ、他のタブへ漏れない ─────────────────────── */
  await page.evaluate(() => document.getElementById('btn-stats').click());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('countries-feed')).display !== 'none', null, { timeout: 15000 });
  const away = await probe(page, CHROME);
  expect(away.pane.disp, 'the reading surface belongs to News — it must not survive onto another tab').toBe('none');
  expect(away.countries.disp).not.toBe('none');
  expect(away.atlasSelected, 'Atlas must not report an event that is not on screen').toBeNull();

  /* ── ③-c 戻れば一覧だけが出て、外皮も戻る ──────────────────────────────────── */
  await page.evaluate(() => document.getElementById('btn-news').click());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('live-news-feed')).display !== 'none', null, { timeout: 15000 });
  const back = await probe(page, CHROME);
  expect(back.pane.disp).toBe('none');
  expect(back.feed.disp).not.toBe('none');
  expect(back.chromeShown.sort()).toEqual(CHROME.slice().sort());

  /* ══ ④ (#R451) 読む面から Atlas へ行く道が在り、行っても主題が消えない ═══════════════
     ⚠⚠⚠ **ソースの検査（tests/r451-checks.test.mjs）はここを言えない。** 「タブ列が伏せられて
       いる」は計算済みの高さにしか無く、「その代わりの道が押せる位置に在る」は配置にしか無い。
       そして #R430 の橋が 15 ラウンド渡らなかったのは、読み手と書き手を別々に確かめる検査が
       **その 2 つを繋ぐ利用者の操作**を一度も走らせなかったからである。ここは走らせる。 */
  await page.evaluate(() => document.querySelector('.news-item.news-event .ev-sources').click());
  await page.waitForFunction(() => !!document.querySelector('#news-reader-pane .nrp-atlas'), null, { timeout: 15000 });
  const reading = await probe(page, CHROME);

  /* 道が要る理由: タブ列は 1 つ残らず 0×0。Atlas も含まれる。 */
  expect(reading.tabsH.length, 'the tab row is gone from the markup — this claim can no longer be read').toBeGreaterThan(3);
  expect(reading.tabsH.filter((h) => h > 0), 'the reading surface is no longer the only surface — recheck why the route exists').toEqual([]);
  /* その代わりの道は、画面の中に在り、素の <button> ではない（当たらない CSS は綴りとしては健在・#R435 ①）。 */
  expect(reading.atlasBtn, 'the reading surface has no route to Atlas').not.toBeNull();
  expect(reading.atlasBtn.top).toBeGreaterThanOrEqual(0);
  expect(reading.atlasBtn.bottom).toBeLessThanOrEqual(reading.vh);
  expect(reading.atlasBtn.radius, 'a UA-default button means no rule matched it').toBeGreaterThan(8);
  expect(reading.atlasBtn.padTop).toBeGreaterThan(0);
  /* 戻ると重ならず、帯の反対端に立つ。 */
  expect(reading.atlasBtn.left).toBeGreaterThan(reading.back.left + 20);
  expect(reading.reader, 'the Event detail no longer hands its subject to the bridge').not.toBeNull();

  /* 押す → Atlas タブに着き、読んでいた記事は「画面には無いが主題である」として残る。 */
  await page.evaluate(() => document.querySelector('#news-reader-pane .nrp-atlas').click());
  await page.waitForFunction(() => document.getElementById('btn-community').classList.contains('active'), null, { timeout: 20000 });
  const asked = await page.evaluate(() => ({
    reader: (() => { const r = window._imReader; return r ? { title: r.title, onScreen: r.onScreen } : null; })(),
    paneDisp: getComputedStyle(document.getElementById('news-reader-pane')).display,
  }));
  expect(asked.reader, 'going to Atlas still erases the article the reader was on').not.toBeNull();
  expect(asked.reader.title).toBe(reading.reader.title);
  expect(asked.reader.onScreen, 'a carried article must say it is no longer on screen').toBe(false);
  expect(asked.paneDisp, 'Atlas replaces the reading surface in the normal sidebar').toBe('none');

  /* そして Atlas 自身がそれを読める——橋の向こう側まで、1 回の操作で。 */
  await page.waitForFunction(() => !!(window.IntMapConsole && window.IntMapConsole.state), null, { timeout: 30000 });
  const line = await page.evaluate(async () => {
    const s = String(await window.IntMapConsole.state());
    return (s.match(/^.*NEWS ARTICLE.*$/m) || [null])[0];
  });
  expect(line, 'Atlas cannot see the article the reader brought it').toBeTruthy();
  expect(line).toContain('BROUGHT TO ATLAS');
  expect(line).toContain(reading.reader.title);

  /* 会話を離れれば主題も終わる。 */
  await page.evaluate(() => document.getElementById('btn-stats').click());
  await page.waitForFunction(() => window._imReader == null, null, { timeout: 15000 });

  await page.setViewportSize({ width: 1280, height: 720 });   /* worker 共有の page を既定へ戻す */
});
