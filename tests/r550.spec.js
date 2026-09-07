/* ============================================================================
 *  R550 — 夜間光レイヤーが Chronos の年に従い、実データ年を名乗る（ブラウザで実測）
 * ----------------------------------------------------------------------------
 *  「Chronosを動かすだけで夜間光の時代が変わる」「夜間光レイヤーがOFFなら、Chronosを動かしても
 *    夜間光データを取得しないこと」「同じepochへの不要な再取得をしない」「凡例の表示年が実データ
 *    epochと一致する」
 *
 *  ⚠⚠ **これは「どの年を取りに行ったか」を訊く検査で、フラグを読む検査ではない。** 今回の欠陥の
 *  形は「設定は正しく見えるのに、実際には別の年を描いている／取りに行っていない」だったので、
 *  読むのは **アプリが実際に発行した Black Marble のタイル要求の URL に入っている年**である。
 *  source の `tiles` 配列だけを読む検査なら、レンダラが古い年を描き続けていても緑になる。
 *
 *  ⚠⚠ **要求は横取りして即座に返す。NASA の応答を待たない。** 主張は「正しい年を asked for した
 *  か」であって「GIBS が速いか」ではない。実測: 応答を待つ版は本文 12.6 / 20.7 / 39.3 s と3倍
 *  ぶれ、連続実行では GIBS が 429 Too Many Requests を返してテストのほうが落ちた——測っていた
 *  のはこの製品ではなく遠くのサービスの機嫌である。横取りすると同じ主張が決定的になる。
 *  ⚠ 2012/2016 の**画素**が変わっていないことは tests/r550-checks.test.mjs ④ が URL を1バイト
 *  ずつ突き合わせて守っている（今回そこは1文字も動いていない）。
 *
 *  ⚠⚠ **6つの主張が1つのテストに入っているのは、値段が理由である**（#R530 と同じ作法）。
 *  OFF・ON・年またぎ・同一epoch内のスクラブ・記録の無い年・復帰は、どれも**同じ1回の起動**から
 *  読める。テストに割ると起動を6回払う。
 *  ⚠ 共有ページ（tests/helpers/app.js）を汚さないよう、必ず Now へ戻し、レイヤーを切り、
 *  横取りを解除する——失敗した回でも finally で行う。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* 東京。⚠⚠ **ズームは地球の夜側のランプの外でなければならない。** js/night-side.js は z4.6 以下で
   自分から Black Marble のモザイクを取りに行く——正しい挙動だが、それが走っているズームで
   「レイヤーOFF なら通信ゼロ」を測ると、測っているのは別の機能である。実測: z4.6 では OFF のまま
   7〜16 件の要求が出て①が落ちた。z6.2 は ZMAX+0.4 の外なので、①はこのレイヤーだけの主張になる。 */
const CAMERA = { center: [139.7, 35.7], zoom: 6.2 };

/* 1×1 の透明 PNG。中身は主張の対象ではない——「どの URL を頼んだか」だけが対象。 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');

const READ = () => {
  const NL = window.IntMapNightLights, m = window.__imap;
  let srcTiles = null, vis = null;
  try { const s = m.getSource('src-nightsat'); srcTiles = s ? (s.tiles || [])[0] : null; } catch (_) { }
  try { vis = m.getLayer('lyr-nightsat') ? m.getLayoutProperty('lyr-nightsat', 'visibility') : null; } catch (_) { }
  const el = document.querySelector('#data-legend-nightsat .dl-nl-when');
  return {
    state: NL.state(), srcTiles, vis,
    legend: el ? (el.textContent || '') : '(no legend)',
    nightSideWant: (window.IntMapNightSide && window.IntMapNightSide.state().wantEpoch) || null
  };
};

const flip = (page, on) => page.evaluate((v) => {
  const b = document.getElementById('dl-nightsat'); b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true }));
}, on);

const goYear = (page, y) => page.evaluate((yy) => {
  if (yy == null) window.IntMapTime.setNow({ source: 'r542-spec' });
  else window.IntMapTime.setYear(yy, { source: 'r542-spec' });
}, y);

test('夜間光が Chronos に従う — OFF・2016・2013・同一epoch内・記録の無い年', async ({ app }) => {
  const page = app.page;
  /* 発行された要求。⚠ 応答ではなく REQUEST の時点で数える。 */
  let asked = [];
  const years = () => {
    const y = {};
    asked.forEach((u) => { const m = /\/default\/(\d{4})-/.exec(u); if (m) y[m[1]] = (y[m[1]] || 0) + 1; });
    return y;
  };
  const settle = () => page.waitForTimeout(500);

  await page.route(/VIIRS_Black_Marble/, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });

  try {
    await page.evaluate((c) => window.__imap.jumpTo(c), CAMERA);
    /* ⚠ 前提は仮定せず、作る。tests/helpers/app.js のページは **spec ファイルをまたいで共有** される
       （fixture の scope は worker）ので、この spec が並列プールの何番目に落ちるかで開始状態が違う。 */
    await flip(page, false);
    await settle();

    /* ── ① OFF のあいだは、時計をどれだけ動かしても 1 件も出ない ────────────────────── */
    asked = [];
    /* ⚠ 2 回で足りる。1回の `IntMapTime` 移動はアプリ全体の時間旅行を起こし、実測で約 1.5 s
       かかる——同じ主張を 3 回言うと、値段だけが増える。2013 は epoch をまたぎ、null は戻る。 */
    await goYear(page, 2013);
    await goYear(page, null);
    await settle();
    expect(asked.length, 'the layer is off: moving Chronos must ask for nothing').toBe(0);

    /* ── ② ON にすると、いまの時計（Now）の epoch を実際に取りに行く ──────────────── */
    await flip(page, true);
    await page.waitForFunction(() => {
      try { return window.__imap.getLayoutProperty('lyr-nightsat', 'visibility') === 'visible'; } catch (_) { return false; }
    }, null, { timeout: 30000, polling: 120 });
    await settle();
    const on = await page.evaluate(READ);
    /* ⚠⚠ 「ON にしたら要求が出る」は、この製品の性質ではない。共有ページがこの spec より前に同じ
       タイルを温めていれば、レンダラは 1 件も出さずに正しく描く——実測、並列プールの 58 番目に
       落ちた回だけこれが 0 になった（製品は正しかった）。**要求が出るかどうかはキャッシュの話で、
       この spec の主題ではない。** 主題は「どの年を指しているか」なので、要求について言えるのは
       「間違った年は 1 件も要求されていない」であり、「正しい年が実際に要求される」ほうは
       epoch をまたぐ③が——キャッシュに無い年なので——決定的に測る。 */
    expect(Object.keys(years()).filter((y) => y !== '2016'),
      'no year other than the newest epoch may be asked for').toEqual([]);
    expect(on.state.epoch, 'a live clock shows the most recent record').toBe('2016-01-01');
    expect(on.vis, 'and the layer is visible').toBe('visible');
    expect(on.srcTiles, 'the raster source points at that epoch').toContain('/default/2016-01-01/');
    expect(on.legend, 'the legend names the DATA year').toContain('2016');
    expect(on.legend, '…and the sensor').toContain('VIIRS');
    expect(on.nightSideWant, 'the globe wants the same epoch as the layer').toBe(on.state.epoch);

    /* ── ③ 2013 へ動かすと 2012 の epoch へ切り替わり、実際に 2012 を取りに行く ────── */
    asked = [];
    await goYear(page, 2013);
    await page.waitForFunction(() => {
      try { return (window.__imap.getSource('src-nightsat').tiles[0] || '').includes('/default/2012-01-01/'); }
      catch (_) { return false; }
    }, null, { timeout: 20000, polling: 100 });
    /* ⚠ 待つのは「主張する対象」であって固定の 500 ms ではない（#R399 の作法）。実測: 同じ位置で
       走った 2 回のうち 1 回だけ、切替から 500 ms 以内に要求が届かず 0 件だった——**製品は正しく、
       直前の `waitForFunction` が source は 2012 を指したと既に証明している**。測っていたのは
       「500 ms 以内にネットワークが動いたか」で、主張は「2012 を取りに行くか」だった。 */
    await expect.poll(() => years()['2012'] || 0,
      { timeout: 25000, message: 'crossing into the 2012 epoch must ask for 2012' }).toBeGreaterThan(0);
    const y2013 = await page.evaluate(READ);
    expect(y2013.state.epoch, '2013 resolves to the 2012 epoch').toBe('2012-01-01');
    expect(y2013.state.clockYear, 'the clock is where it was put').toBe(2013);
    expect(y2013.state.matches, 'and the two years are NOT the same, which the reader must be told').toBe(false);
    expect(y2013.srcTiles, 'the source followed').toContain('/default/2012-01-01/');
    /* 「Chronos年と、表示中データの年を混同しないこと」——凡例は両方を言う */
    expect(y2013.legend, 'the legend states the data year').toContain('2012');
    expect(y2013.legend, '…and the clock year beside it').toContain('2013');
    expect(y2013.nightSideWant, 'the globe moved with it').toBe('2012-01-01');

    /* ── ④ 同じ epoch の中を動かしても、1 件も取り直さない ────────────────────────── */
    await goYear(page, 2017);
    await page.waitForFunction(() => {
      try { return (window.__imap.getSource('src-nightsat').tiles[0] || '').includes('/default/2016-01-01/'); }
      catch (_) { return false; }
    }, null, { timeout: 20000, polling: 100 });
    await settle();
    /* 2013 → 2017 は epoch をまたぐので引き直してよい。ここから先の3回は引いてはならない——
       それが「同じepochへの不要な再取得をしない」の中身である。 */
    asked = [];
    await goYear(page, 2018);
    await goYear(page, 2020);
    /* ⚠ 否定の主張なので窓は広いほうが強い（狭くても偽の赤にはならないが、偽の緑になり得る）。 */
    await page.waitForTimeout(1500);
    const scrubbed = await page.evaluate(READ);
    expect(asked.length, 'two more years inside one epoch must ask for nothing').toBe(0);
    expect(scrubbed.state.epoch, '2017 / 2018 / 2020 are all the 2016 epoch').toBe('2016-01-01');
    expect(scrubbed.legend, 'the legend follows the clock inside one epoch').toContain('2020');
    expect(scrubbed.legend, '…while still naming the data year').toContain('2016');

    /* ── ⑤ 記録の無い年は「データなし」であって、取得失敗でも、暗い絵でもない ─────────── */
    asked = [];
    await goYear(page, 1900);
    await page.waitForFunction(() => {
      try { return window.IntMapNightLights.current() == null; } catch (_) { return false; }
    }, null, { timeout: 15000, polling: 100 });
    await settle();
    const old = await page.evaluate(READ);
    expect(old.state.epoch, 'before VIIRS there is no epoch').toBe(null);
    expect(asked.length, 'and nothing is asked for').toBe(0);
    expect(old.vis, 'nothing is drawn either — a 1900 map has no city lights').toBe('none');
    expect(old.legend, 'the legend says NO DATA and names the first year there is one').toMatch(/2012/);
    expect(old.legend, '…and it is not phrased as a failure').not.toMatch(/could not be loaded|取得できませんでした/);

    /* ── ⑥ 戻れる ───────────────────────────────────────────────────────────── */
    await goYear(page, null);
    await page.waitForFunction(() => {
      try { return window.__imap.getLayoutProperty('lyr-nightsat', 'visibility') === 'visible'; } catch (_) { return false; }
    }, null, { timeout: 20000, polling: 120 });
    const back = await page.evaluate(READ);
    expect(back.state.epoch, 'returning to Now restores the newest epoch').toBe('2016-01-01');
    expect(back.srcTiles, 'and the source with it').toContain('/default/2016-01-01/');
  } finally {
    /* 共有ページを元に戻す——失敗した回でも */
    await flip(page, false).catch(() => { });
    await goYear(page, null).catch(() => { });
    await page.unroute(/VIIRS_Black_Marble/).catch(() => { });
  }
});
