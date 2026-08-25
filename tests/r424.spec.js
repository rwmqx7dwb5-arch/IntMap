/* ============================================================================
 *  R424 — 1916年の一覧を、読者と同じやり方で読む
 * ----------------------------------------------------------------------------
 *  報告は**描かれた画面**についてのものだった——日本語・1916年で
 *  「大日本帝国 / East Asia / Tokyo」、同じ一覧の現代の行は「北アメリカ」。
 *  `tests/r424-checks.test.mjs` は表と解決器までしか言えない。**その解決器がこの行に
 *  効いているか**は、一覧を描いてから読むしかない（#R251 の spec と同じ立ち位置）。
 *
 *  ⚠ **歴史の行と現代の行を、同じ通過で、同じ選択子で読む。** 報告の中身は
 *  「片方だけ英語」であって「英語がある」ではないので、比べる相手が同じ画面に無いと
 *  この spec は欠陥の半分しか見ていないことになる。
 *
 *  ⚠ **国名（`.stat-name`）はここの主題ではない**——#R410 が直して、いま正しい。
 *  読むのは `.stat-sub`（サブ行）と、その行をダブルクリックして開くカードの Region 行だけ。
 *
 *  ⚠ **#R443 追記——その Region 行には二つの欄があった。** #R424 は `s.region` だけを解決し、
 *  隣の `s.subregion` を生のまま出し続けた（本番・日本語で「北アメリカ / Northern America」）。
 *  最後の段はそれを**現代の行**で読む。`tests/r424-checks ⑥〜⑩` は表と解決器までしか言えず、
 *  **カードがその解決器を通したか**は、ここでしか言えない。
 *
 *  ⚠ **首都は英語のままが正しい。** 現代の行は `CAPITAL[code]`（«Washington, D.C.»）、
 *  歴史の行は `_STINFO`（«Tokyo»）——どちらも地名で、#R251 がそう決めている。だから
 *  この spec は「region が変わり、**capital は 1 バイトも変わらない**」を言う。
 *
 *  ⚠ **九言語のうち画面で読むのは二つ**（英語と、報告された日本語）で、これは
 *  値切りではなく**支払い**である。gate の天井（scripts/test-budget.mjs）は秒単位でしか
 *  空いていない。残る七言語は `tests/r424-checks ④` が **app 自身の解決器を実行して**
 *  答えさせている——形の照合ではなく、`js/lang-registry.js` と四つの inline 表を
 *  読み込んで `pick()` に訊く。画面がその解決器を使っていることは、ここが言う。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const AT = '1916-07-01T12:00:00Z';
const HIST = 'JEM';        /* 大日本帝国 — region:'East Asia'（js/history.js の語彙）  */
const MODERN = 'USA';      /* 同じ一覧の現代の行 — region:'North America'（Natural Earth）*/

/* ⚠ `IntMapOS.exec('tab.stats')` を起動直後に撃つと、js/session-tabs.js がまだ登録して
   いなければ**無言の no-op** になる（#R410 の実測）。登録されるまで撃ち続ける。 */
const openCountries = (page) => page.waitForFunction(() => {
  try { window.IntMapOS.exec('tab.stats', { source: 'test' }); } catch (_) { }
  return !!(window._countriesActive && window._countriesActive());
}, null, { timeout: 30000, polling: 250 });

/* ⚠ 待つ述語は**答えを待たない**。「東アジア が出るまで」を待つと、欠陥のあるビルドは
   30秒の沈黙のあと述語の名前だけを残して落ちる。ここが待つのは
   ① 画面がその言語になった ② 一覧がその言語で**描き直された**（並び順ラベルは keyed
   なので registry に訊ける）③ 二つの行が在る——どれも壊れたビルドでも真になる。 */
const shown = (page, lang, rows) => page.waitForFunction(({ lang, hist, modern, rows }) => {
  const LG = window.IntMapLang;
  if (!LG || !LG.isLoaded(lang)) return false;
  if (document.documentElement.getAttribute('lang') !== LG.htmlTag(lang)) return false;
  const want = (LG.keyed(lang) || {}).sortAsc;
  const el = document.querySelector('.ssd-l-asc');
  if (!want || !el || el.textContent.trim() !== String(want).trim()) return false;
  if (!rows) return true;   /* 時計を動かす前は歴史の行がまだ無い — 言語だけを待つ */
  return !!document.querySelector(`.stat-row[data-ccn="${hist}"] .stat-sub`)
      && !!document.querySelector(`.stat-row[data-ccn="${modern}"] .stat-sub`);
}, { lang, hist: HIST, modern: MODERN, rows: !!rows }, { timeout: 40000, polling: 200 });

/** 読者と同じ入口で言語を変える——言語ピル。#R251: `window.setLanguage` は存在しない。
    ⚠ ピルは設定パネルの中にあるので画面には出ていない——Playwright の `click` は «hidden» の
    まま 20 秒待って落ちる（実測）。押すのは DOM の click で、これは #R251 の spec と同じ入口。
    ⚠ そして **書かれるのを待ってから**押す: 先頭の五つは index.html に在るが、残りは locale
    ディレクトリを読んだあとに `lang-registry.syncDocument()` が書く（#R249）。 */
async function switchTo(page, lang, rows) {
  const ok = await page.waitForFunction((l) => {
    const b = document.getElementById('lang-' + l);
    if (!b) return false;
    b.click();
    return true;
  }, lang, { timeout: 20000, polling: 200 }).catch(() => null);
  expect(ok, `#lang-${lang} の言語ピルが 20 秒たっても書かれない`).toBeTruthy();
  await shown(page, lang, rows);
}

/** サブ行を «region» と «capital» に割る。`.stat-sub` は `region / capital` (#R102)。 */
const READ = ({ hist, modern }) => {
  const sub = (code) => {
    const el = document.querySelector(`.stat-row[data-ccn="${code}"] .stat-sub`);
    if (!el) return null;
    const raw = el.textContent.trim();
    const i = raw.indexOf(' / ');
    return { raw, region: i < 0 ? raw : raw.slice(0, i), capital: i < 0 ? '' : raw.slice(i + 3) };
  };
  return { hist: sub(hist), modern: sub(modern) };
};

/** 開いているカードの Region 行——見出しは registry に訊く（表の写しを持たない） */
const READ_CARD = (lang) => {
  const label = String(((window.IntMapLang.keyed(lang) || {}).statRegion) || '');
  const rows = [...document.querySelectorAll('#country-popup .cm-row')];
  const row = rows.find((r) => ((r.querySelector('span') || {}).textContent || '').trim() === label);
  return { label, n: rows.length, value: row ? ((row.querySelector('b') || {}).textContent || '').trim() : null };
};

/** ⚠ (#R453) カードは**二度**描かれる——同期の一枚目と、enrich が解決したあとの二枚目。
    `openCard` が待つ `.cm-row` は一枚目で満たされるので、そこで読むと同梱データが届く前の
    HTML を読むことがある。待つのは**機構が止まったこと**であって主張そのものではない
    （#R399/#R435 の規則: 「Neighbours が出るまで」を待つと、壊れたビルドは 30 秒黙ってから
    述語の名前だけを残す）。`state` が idle でも loading でもなくなるのは、取得が成功しても
    失敗しても真になる。そのあと 2 フレーム待って再描画の microtask を流す。 */
const factsSettled = async (page) => {
  await page.waitForFunction(() => {
    const F = window.IntMapCountryFacts;
    return !!F && F.state !== 'idle' && F.state !== 'loading';
  }, null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

/** カードの行を丸ごと読む——#R453 は行の**有無**を見るので、見出しを鍵にした表を返す。 */
const READ_ROWS = () => {
  const out = {}; const rows = [...document.querySelectorAll('#country-popup .cm-row')];
  for (const r of rows) { const k = ((r.querySelector('span') || {}).textContent || '').trim();
    out[k] = ((r.querySelector('b') || {}).textContent || '').trim(); }
  return { n: rows.length, rows: out };
};

async function openCard(page, lang, code = HIST) {
  await page.evaluate(() => { const b = document.getElementById('cp-close'), p = document.getElementById('country-popup'); if (b && p && p.style.display === 'block') b.click(); });
  await page.dblclick(`.stat-row[data-ccn="${code}"]`);
  await page.waitForFunction(() => {
    const p = document.getElementById('country-popup');
    return !!(p && p.style.display === 'block' && p.querySelectorAll('.cm-row').length);
  }, null, { timeout: 30000, polling: 100 });
  return page.evaluate(READ_CARD, lang);
}

test('R424 1916年の一覧で、歴史の行のサブ行が現代の行と同じように訳される（カードの Region も）', async ({ app }) => {
  const page = app.page;
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message)));

  await openCountries(page);
  await switchTo(page, 'en');            /* 既定は英語だが、共有 page なので言い切らない */
  await page.evaluate((at) => window.IntMapTime.set(new Date(at), { source: 'test' }), AT);
  await shown(page, 'en', true);         /* ⚠ 歴史の行は時計が動いたあとに生える */

  /* ── 英語で、まず「何が書いてあるか」を確定させる ─────────────────────────────── */
  const en = await page.evaluate(READ, { hist: HIST, modern: MODERN });
  expect(en.hist, `1916 の一覧に ${HIST} の行が無い — この spec の前提が崩れている`).toBeTruthy();
  expect(en.modern, `同じ一覧に ${MODERN} の行が無い — 比べる相手が居ない`).toBeTruthy();
  expect(en.hist.region, '歴史の行の region は js/history.js の語彙から来る').toBe('East Asia');
  expect(en.modern.region, '現代の行の region は Natural Earth の CONTINENT から来る').toBe('North America');
  expect(en.hist.capital, '歴史の行の首都は _STINFO の値').toBe('Tokyo');
  expect(en.modern.capital, '現代の行の首都は CAPITAL[code] の値').toBe('Washington, D.C.');

  const enCard = await openCard(page, 'en');
  expect(enCard.n, 'カードが本文を描いている').toBeGreaterThan(0);
  expect(enCard.value, 'カードの Region 行は同じ欄を出している').toBe('East Asia');

  /* ── そして報告された画面——日本語・1916年 ────────────────────────────────────── */
  await switchTo(page, 'jp', true);
  const jp = await page.evaluate(READ, { hist: HIST, modern: MODERN });

  expect(jp.hist.region,
    `歴史の行のサブ行が英語のまま: 「${jp.hist.raw}」 — 同じ一覧の現代の行は「${jp.modern.raw}」`)
    .not.toBe(en.hist.region);
  expect(jp.modern.region, '現代の行は #R251 から訳されている（退行していないこと）')
    .not.toBe(en.modern.region);
  expect(jp.hist.region, '報告された画面が読むべきだったもの').toBe('東アジア');
  expect(jp.modern.region, '同じ一覧の、同じ位置').toBe('北アメリカ');

  /* ⚠ 首都は地名なので訳さない（#R251）。region だけが変わったことを、ここで言う。 */
  expect(jp.hist.capital, '首都は地名として据え置き — 歴史の行').toBe(en.hist.capital);
  expect(jp.modern.capital, '首都は地名として据え置き — 現代の行').toBe(en.modern.capital);

  const jpCard = await openCard(page, 'jp');
  expect(jpCard.label, 'カードの見出し自体は #R240 から訳されている').not.toBe(enCard.label);
  expect(jpCard.value, `カードの Region 行が英語のまま: 「${jpCard.value}」`).not.toBe(enCard.value);
  expect(jpCard.value, 'カードは一覧の行と同じ語を言う').toBe(jp.hist.region);

  /* ══ (#R443) 同じカードの、同じ行の、残り半分 ═════════════════════════════════════════════
     報告は**現代の行**についてのものだった——本番・日本語で USA のカードが
     「北アメリカ / Northern America」、ドイツが「ヨーロッパ / Western Europe」。
     時計を現在へ戻し、同じ入口（行をダブルクリック）で同じ行を読む。

     ⚠ **USA と DEU で、二つの経路が両方言える。** USA は CONTINENT が «North America»・
     SUBREGION が «Northern America» ——英語では**別の語**、他の八言語では**同じ語**なので、
     英語は 2 つ出し（畳まない）、日本語は 1 つに畳む。DEU は九言語すべてで別の語なので
     どちらの言語でも 2 つ出る。⇒「畳んだ」と「訳した」を取り違えられない。 */
  await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
  await page.waitForFunction(() => !!document.querySelector('.stat-row[data-ccn="DEU"] .stat-sub')
    && !!document.querySelector('.stat-row[data-ccn="USA"] .stat-sub'),
  null, { timeout: 40000, polling: 200 });

  const jpUsa = await openCard(page, 'jp', 'USA');
  const jpDeu = await openCard(page, 'jp', 'DEU');
  expect(jpUsa.value, `カードの subregion が英語のまま: 「${jpUsa.value}」`).toBe('北アメリカ');
  expect(jpDeu.value, `カードの subregion が英語のまま: 「${jpDeu.value}」`).toBe('ヨーロッパ / 西ヨーロッパ');

  await switchTo(page, 'en');
  const enUsa = await openCard(page, 'en', 'USA');
  const enDeu = await openCard(page, 'en', 'DEU');
  expect(enUsa.value, '英語では大陸と小地域が別の語なので、畳まない').toBe('North America / Northern America');
  expect(enDeu.value, '英語の対照——ここは九言語すべてで二語').toBe('Europe / Western Europe');

  /* ══ (#R453) 同じカードの、衛星から届かなくなっていた行 ══════════════════════
     本番実測 2026-08-25（R443）: `enrichCountry()` が投げる restcountries.com への要求が
     **5か国 5件とも**失敗し、`catch(e){}` がそれを飲んでいた——USA のカードは **16行**で、
     Neighbours 行も Timezones 行も**無いまま完全に見えていた**。API は廃止されており
     （/v3.1 も /v5 も 261 バイトの廃止通知へ 301）、中継すべき上流が存在しないので、
     6つの事実は data/country-facts.json として**同梱**されるようになった。

     ⚠ tests/r453-checks.test.mjs は出荷される module を Node で実行して同じ 3 行を見ているが、
     **ブラウザがそのファイルを実際に取れるか**はここでしか言えない（同一 origin の fetch は
     ビルドと配備の問題であって、ソースの問題ではない）。すでに開いているカードを読むだけなので、
     gate の天井（scripts/test-budget.mjs）に足すのは assert 分だけである——新しい spec ファイルを
     1 本立てると、同じカードをもう一度開くためだけに分単位の時間を買うことになる。 */
  await factsSettled(page);
  const deuRows = await page.evaluate(READ_ROWS);   /* 直前の openCard で DEU が開いている */
  expect(deuRows.rows['Neighbours'], 'DEU のカードに Neighbours 行が無い——同梱データが届いていない').toBeTruthy();
  expect(deuRows.rows['Neighbours']).toContain('POL');
  expect(deuRows.rows['Timezones'], 'DEU のカードに Timezones 行が無い').toMatch(/^UTC[+-]\d\d:\d\d/);
  expect(deuRows.rows['UN member'], 'UN member 行').toBe('Yes');

  /* 同じことを USA でも——報告に名指されたカードであり、隣国が 2 か国しか無いので
     「行が出ている」と「値が正しい」を一つの assert で分けられる。 */
  await openCard(page, 'en', 'USA');
  await factsSettled(page);
  const usa2 = await page.evaluate(READ_ROWS);
  expect(usa2.rows['Neighbours'], 'USA の隣国').toBe('CAN, MEX');
  expect(usa2.rows['Timezones'], 'USA の時間帯').toMatch(/^UTC[+-]\d\d:\d\d/);
  expect(usa2.rows['UN member']).toBe('Yes');

  /* ⚠ 同梱にした理由そのもの——取得の**結果が値として残っている**ことを画面側でも見る。
     'failed' なら 3 行は出ていないはずで、上の assert が先に落ちる。 */
  const facts = await page.evaluate(() => {
    const F = window.IntMapCountryFacts;
    return F ? { state: F.state, codes: F.codes, url: F.url, error: F.error } : null;
  });
  expect(facts, 'window.IntMapCountryFacts が無い').toBeTruthy();
  expect(facts.state, '国データの取得が ready でない: ' + facts.error).toBe('ready');
  expect(facts.codes, '同梱されたコード数').toBeGreaterThan(200);

  expect(errors, '言語と年を動かす間、page error は出ない: ' + errors.join(' | ')).toEqual([]);

  /* ⚠ この page は worker 内で共有される（tests/helpers/app.js）。`resetPage` は言語も
     時計も戻さないので、ここで戻すのはこの spec の責任である。
     ⚠ 戻す側は `shown()` を使わない——次のテストが待つのは「英語になっていること」であって
     「Countries 一覧が英語で描き直されたこと」ではない。ここで一覧まで待つと 1.5 秒を
     gate の天井に足すだけになる（実測）。 */
  await page.evaluate(() => {
    const b = document.getElementById('cp-close'), p = document.getElementById('country-popup');
    if (b && p && p.style.display === 'block') b.click();
    const en = document.getElementById('lang-en'); if (en) en.click();
    window.IntMapTime.setNow({ source: 'test' });
  });
  await page.waitForFunction(() => document.documentElement.getAttribute('lang') === 'en',
    null, { timeout: 20000, polling: 100 });
});
