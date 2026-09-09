/* ============================================================================
 *  R600 — 複合空間クエリを、実物のドアから、実物のデータで走らせる（ブラウザで実測）
 * ----------------------------------------------------------------------------
 *  報告された欠陥は「同じ34件が2つの表に出る」「Wuzhong CN CN」「PPLX が都市として並ぶ」
 *  「UEruemqi」、そして測っている途中で見つかった「東京・バグダッド・テヘランが母集合に無い」。
 *
 *  ⚠⚠ **ここは `window.IntMapConsole.dispatch()` を叩く。** それが Atlas の planner が通る
 *  のと同じ1つのドア（js/atlas-console.js の `query` case）で、依存の bind も、gazetteer の
 *  取得も、coastline の取得も、その向こうで実物が動く。`IntMapQuery.run()` を直に呼ぶ版も書けるが、
 *  それは **bind を自分でやってしまう** ので「出荷している配線が値を渡しているか」を原理的に
 *  測れない（#R552 の形）。ドアから入れば、渡していなければここで落ちる。
 *
 *  ⚠ **降水量の条件はここでは課さない。** `precipMm` は `window.IntMapPrecipAnnual` が
 *  居るときだけ答える列で、居なければエンジンは正直に「適用できなかった」と言う——それは
 *  正しい挙動であって、この spec の主張ではない。ここの主張は **母集合・表示名・国コード・
 *  1操作1ブロック** の4つで、どれも人口と海岸距離だけで到達できる。降水量の経路は
 *  tests/r600-checks.test.mjs ⑤ が列レジストリの側から測る。
 *
 *  ⚠ 起動は共有ページ（tests/helpers/app.js）。この spec は地図の状態を1つも変えない
 *  （`pin:false` 相当に、dispatch の戻り値だけを読む）。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* 報告された問いそのもの、ただし降水量を外したもの（上の注記）。
   人口100万人以上・外洋の海岸線から200km以上。 */
const WHERE = [
  { col: 'pop', op: '>=', value: 1000000 },
  { col: 'coastKm', op: '>=', value: 200 },
];

async function ask(page, spec) {
  return await page.evaluate(async (s) => {
    /* ⚠ Atlas の kernel 自体が lazy（js/atlas-loader.js）。`IntMapConsole` は need の後にしか居ない。 */
    await window.IntMapLazy.need('atlasConsole');
    await window.IntMapLazy.need('atlasQuery');
    const r = await window.IntMapConsole.dispatch(Object.assign({ type: 'query' }, s));
    return { ok: !!(r && r.ok), html: (r && r.html) || '', resultKey: (r && r.meta && r.meta.resultKey) || '' };
  }, spec);
}

test('R600: the cities table is a list of cities, named for a reader, and the country is printed once', async ({ app }) => {
  const page = app.page;
  test.setTimeout(120000);   /* the gazetteer (3.9 MB) and the coastline (249 kB) are fetched for real */

  const r = await ask(page, { from: 'cities', where: WHERE, show: ['pop', 'country', 'coastKm'], limit: 200 });
  expect(r.ok).toBe(true);
  expect(r.html).toContain('<table');

  /* ── ① 母集合 — 「地球上のすべての場所（ただし最重要の334件を除く）」ではない ────────────── */
  /* ⚠⚠⚠ 実測: これらは1件も返ってこなかった。build-gazetteer が「curated 表が名前を持つ行」を
     world から落としており、cityRows() は world だけを読んでいたから。どれも人口100万人以上・
     外洋から200km以上で、**問いの正解**である。 */
  for (const city of ['Baghdad', 'Tehran']) {
    expect(r.html, city + ' satisfies every condition and must be in the answer').toContain(city);
  }

  /* ── ② 都市の一部分は都市ではない ──────────────────────────────────────────────────── */
  /* 「Al Mawşil al Jadīdah」は PPLX（section of populated place）。同じ GeoNames の中に
     本物の Mosul が PPLA / 1,683,000 として別レコードで居る。 */
  expect(r.html).not.toContain('Mawsil');
  expect(r.html).not.toContain('Mawşil');
  expect(r.html).toContain('Mosul');

  /* ── ③ 表示名は GeoNames の ASCII 翻字ではない ────────────────────────────────────── */
  expect(r.html).not.toContain('UEruemqi');

  /* ── ④ 国コードを2回書かない ─────────────────────────────────────────────────────── */
  /* 国の列を出しているので、名前セルに ISO2 を貼らない。「Wuzhong CN | CN」がこの検査の由来。 */
  expect(r.html).not.toMatch(/Wuzhong\s*<span[^>]*>\s*CN\s*<\/span>/);
  /* …そして国の列は国を名乗る（コードではなく名前） */
  expect(r.html).toMatch(/China|中国/);

  /* ── ⑤ 判定方法は4つの数を別々に言う ───────────────────────────────────────────────── */
  expect(r.html).toMatch(/source records|件の元レコード/);
  expect(r.html).toMatch(/evaluated|件を評価/);
});

test('R600: two runs that resolved the same rows are ONE block in the reply', async ({ app }) => {
  const page = app.page;
  test.setTimeout(120000);

  /* 報告された画面そのもの: 片方は緯度経度つき、片方は無し、中身は同じ行。
     ⚠ ここの主張は「同じ問いを 2 回したときの identity」であって「何件返るか」ではないので、
     条件は **安い列だけ**にする。海岸距離を入れると同じ計測を 3 回払うが、それはこの
     検査が証明することを 1 つも増やさない（上の検査が既に実データで払っている）。 */
  const CHEAP = [{ col: 'pop', op: '>=', value: 15000000 }];
  const withLatLng = await ask(page, { from: 'cities', where: CHEAP, show: ['pop', 'lat', 'lng'], limit: 200 });
  const without = await ask(page, { from: 'cities', where: CHEAP, show: ['pop'], limit: 200 });

  expect(withLatLng.ok && without.ok).toBe(true);
  /* ⚠ 表示列が違うので HTML は当然ちがう——だから「完全一致の html を落とす」既存の番人は
     どちらも通した。identity は **何を解決したか** でなければならない。 */
  expect(withLatLng.html).not.toEqual(without.html);
  expect(withLatLng.resultKey, 'the dispatch must hand the engine-declared key to the turn').toBeTruthy();
  expect(withLatLng.resultKey).toEqual(without.resultKey);

  /* そのうえで、ターンの結果リストが実際に1本に畳むこと（出荷している keep を、出荷している
     形の結果に対して走らせる）。 */
  const kept = await page.evaluate(([a, b]) => {
    const TR = window.IntMapAtlasTurnResults;
    if (!TR) return { missing: true };
    const mk = (show, html, key) => ({ act: { type: 'query', from: 'cities', show },
      ok: true, html, meta: { resultKey: key, status: 'completed' } });
    const out = TR.keep([mk(['pop', 'lat', 'lng'], a.html, a.resultKey), mk(['pop'], b.html, b.resultKey)]);
    return { n: out.length, last: out[0] && out[0].html === b.html };
  }, [withLatLng, without]);
  expect(kept.missing).toBeFalsy();
  expect(kept.n, 'the reader must be shown one table, not two').toBe(1);
  expect(kept.last, 'and the one the app is still holding is the later run').toBe(true);

  /* ⚠ 畳みすぎない: 条件が違えば別の問いのまま。 */
  const other = await ask(page, { from: 'cities', where: [{ col: 'pop', op: '>=', value: 5000000 }], show: ['pop'], limit: 200 });
  expect(other.resultKey).not.toEqual(withLatLng.resultKey);
});
