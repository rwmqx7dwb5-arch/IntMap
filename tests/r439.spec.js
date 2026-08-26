/* ============================================================================
 *  R439 — 凡例の中の4つが、ブラウザで実際にそうなっていること
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ **どれもソースの形では言えない。**
 *    ①「モデルの選択欄が凡例から突き出ている」は<b>幅の話</b>である。CSS を足したことは
 *      `tests/r439-checks` が読めるが、「はみ出していない」は**描かれた矩形にしか訊けない**
 *      ——`min-width:0` を書き忘れれば宣言は全部そこにあるのにはみ出したままになる。
 *      （実際それで `.ecl-when` の 4 px も見つかった。控えごとの検査なら通っていた。）
 *    ②「等圧線をトグルでオンオフ」は<b>凡例の中のチェックボックス</b>である。行を廃止した以上、
 *      「どこからも点けられない」という壊れ方が新しく可能になった。**押して**確かめる。
 *    ③ 気圧の帯は `legend('pressure_msl')` が**実際に返すもの**——Windy の 900…1080 hPa と
 *      標準大気の灰。表そのものは checks 側が持つので、ここは**生きた経路**だけを見る。
 *    ④ パーティクルの箱が**レイヤーごとに独立**であること、そして**描かれたパネルが
 *      `js/data-layers.js` の宣言どおりに行を並べている**こと。どちらも DOM の位置の話である。
 *      ⚠ (#R478) どの棚に載るかは**宣言から読む**——ここに綴らない。理由は ④ の中の注記。
 *
 *  ⚠ **1 テスト・1 ブート・固定 sleep なし。** これは #R405 / #R416 が同じ理由で取った形で、
 *    `scripts/test-budget.mjs` の core 天井（このラウンドの spec は `currentRoundSpec()` で
 *    必ず gate に入る）に対して払える値段はそれしかない。待つときは**その条件**を待つ。
 *
 *  ⚠ ネットワークに依存する主張はここに置かない。等圧線が**実際に何本描かれ、ラスタの上に
 *    載っているか**は `tests/prod-smoke.spec.js` の #R398 のテストが本番で測る（そちらも
 *    #R439 で入口を付け替え、スタック順の表明を足してある）。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
/* ⚠ (#R478) the layer taxonomy as a VALUE — see the note at ④. `js/data-layers.js` declares it;
   nothing here spells a shelf key a second time. */
import { where, BETA_KEY } from './helpers/layer-groups.mjs';

test('R439 the pressure legend: a picker that fits, an isobar switch that works, Windy’s key, and the promoted rows', async ({ app }) => {
  const page = app.page;

  /* ── the two layers this round changed the legends of ─────────────────────────────────────── */
  await page.evaluate(() => {
    for (const id of ['dl-ec-slp', 'dl-ec-gust']) {
      const cb = document.getElementById(id);
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  });
  await page.waitForFunction(() => {
    const a = document.getElementById('data-legend-ec-slp'), b = document.getElementById('data-legend-ec-gust');
    return !!(a && b && a.querySelector('.ecl-modelpick select') && a.querySelector('.ec-isobars-box')
      && a.querySelector('.ec-wind-parts') && b.querySelector('.ec-wind-parts'));
  }, null, { timeout: 30000 });

  /* ── ① the picker, and the legend, as rectangles ──────────────────────────────────────────── */
  const m = await page.evaluate(() => {
    const box = document.getElementById('data-legend-ec-slp');
    const sel = box.querySelector('.ecl-modelpick select');
    const s = sel.getBoundingClientRect(), b = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    return { opts: sel.options.length,
      selL: s.left, selR: s.right,
      boxL: b.left + (parseFloat(cs.paddingLeft) || 0), boxR: b.right - (parseFloat(cs.paddingRight) || 0),
      scrollOver: box.scrollWidth - box.clientWidth };
  });
  expect(m.opts, 'the picker offers the surface models').toBeGreaterThan(1);
  /* ⚠ half a pixel of tolerance and no more — this is the reported defect, measured as a rectangle */
  expect(m.selR, `the select ends at ${m.selR} and the legend's content box at ${m.boxR}`)
    .toBeLessThanOrEqual(m.boxR + 0.5);
  expect(m.selL, 'and it starts inside it').toBeGreaterThanOrEqual(m.boxL - 0.5);
  /* …and nothing ELSE in the legend hangs out either: a box that scrolls horizontally is a box
     something is sticking out of, one indirection along. This is what found `.ecl-when`. */
  expect(m.scrollOver, 'nothing in the legend overflows it horizontally').toBeLessThanOrEqual(1);

  /* ── ③ the key the legend actually draws ──────────────────────────────────────────────────── */
  const lg = await page.evaluate(() => {
    const L = window.IntMapECMWF.legend('pressure_msl', true);
    if (!L) return null;
    let bi = 0, bd = Infinity;
    L.stops.forEach((s, j) => { const d = Math.abs(s.v - 1013.2); if (d < bd) { bd = d; bi = j; } });
    return { unit: L.unit, min: L.min, max: L.max, n: L.stops.length,
      first: L.stops[0].css, pivot: L.stops[bi].css, last: L.stops[L.stops.length - 1].css };
  });
  expect(lg, 'the key answers even before the 340 kB tile SDK is fetched').not.toBeNull();
  expect(lg.unit).toBe('hPa');
  expect(lg.min).toBe(900);
  expect(lg.max).toBe(1080);
  expect(lg.first, 'the deepest low is Windy’s near-black blue').toBe('rgb(8,16,48)');
  expect(lg.last, 'and the highest high its dark maroon').toBe('rgb(48,8,24)');
  expect(lg.pivot, '1013.2 hPa is the neutral grey the ramp pivots on').toBe('rgb(183,183,183)');
  /* a gradient, not the SDK's seventeen flat bands (#R284's rule, applied to this ramp) */
  expect(lg.n, 'the ramp is resampled, so no band edge survives').toBeGreaterThan(1000);

  /* ── ④ the two particle boxes are independent, and the retired row is gone ─────────────────── */
  const p = await page.evaluate(() => {
    const at = (id) => document.getElementById('data-legend-' + id).querySelector('.ec-wind-parts');
    const before = { gust: !!window._imWxParts('ec-gust'), slp: !!window._imWxParts('ec-slp') };
    window._imWxParts('ec-gust', true);
    return { isobarRow: !!document.getElementById('dl-ec-isobars'),
      gustFor: at('ec-gust').getAttribute('data-for'), slpFor: at('ec-slp').getAttribute('data-for'),
      before,
      after: { gust: !!window._imWxParts('ec-gust'), slp: !!window._imWxParts('ec-slp'),
        temp: !!window._imWxTempParts() } };
  });
  expect(p.isobarRow, 'there is no standalone 等圧線 checkbox any more').toBe(false);
  expect(p.gustFor, 'the gust legend’s box belongs to the gust layer').toBe('ec-gust');
  expect(p.slpFor, 'and the pressure legend’s to the pressure layer').toBe('ec-slp');
  expect(p.after.gust, 'setting one sets that one').toBe(true);
  expect(p.after.slp, '…and not its neighbour').toBe(p.before.slp);
  expect(p.after.temp, '…nor the temperature layer’s').toBe(false);

  /* ── ② the isobar switch, pressed ─────────────────────────────────────────────────────────── */
  const iso0 = await page.evaluate(() => {
    const cb = document.querySelector('#data-legend-ec-slp .ec-isobars-box');
    /* ⚠ the box never holds the answer — the legend body is replaced whole on every render, so
       what is asserted is that it REPORTS the module. Start from off whatever the profile says. */
    const reports = cb.checked === !!window._imWxIsobars();
    const label = cb.parentElement.textContent.trim();
    if (window._imWxIsobars()) document.querySelector('#data-legend-ec-slp .ec-isobars-box').click();
    return { reports, label };
  });
  expect(iso0.reports, 'the box reports the module rather than its own memory').toBe(true);
  expect(iso0.label, 'and it names the interval it draws at').toContain('4 hPa');
  await page.waitForFunction(() => !window._imWxIsobars(), null, { timeout: 5000 });

  await page.evaluate(() => { document.querySelector('#data-legend-ec-slp .ec-isobars-box').click(); });
  await page.waitForFunction(() => {
    const W = window.IntMapWeatherEC;
    return !!window._imWxIsobars() && !!(W && W._state['ec-isobars'] && W._state['ec-isobars'].on);
  }, null, { timeout: 8000 });

  /* ⚠ AND IT GOES OFF WITH ITS PARENT — contours over a field that is not on the map are the
     「レイヤーは可視・タイルは空」 shape of #R398 from the other side — WITHOUT forgetting that
     the reader asked for them. */
  await page.evaluate(() => {
    const cb = document.getElementById('dl-ec-slp');
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const W = window.IntMapWeatherEC;
    return !(W._state['ec-isobars'] && W._state['ec-isobars'].on);
  }, null, { timeout: 8000 });
  expect(await page.evaluate(() => !!window._imWxIsobars()),
    'the preference survives the layer going off').toBe(true);

  /* ── ⑤ where the four promoted rows sit ───────────────────────────────────────────────────── */
  const under = await page.evaluate(() => {
    const dd = document.getElementById('layer-dropdown');
    const out = {}; let head = '';
    for (const el of dd.children) {
      if (el.classList.contains('lyr-head')) { head = el.getAttribute('data-i18n') || el.textContent.trim(); continue; }
      const cb = el.querySelector && el.querySelector('input[type=checkbox]');
      if (cb && cb.id) out[cb.id] = head;
    }
    return out;
  });
  /* ⚠⚠ (#R478) どの棚に載るかは宣言から読む——ここに二度目の写しを綴らない。
     この4行と `ec-cape` の棚は、かつてここに棚のキーを**直接書いて**あった。#R469 が
     「ベータからはCAPE不安定度レイヤーを気象に昇格。」で `ec-cape` を気候・気象へ移したとき、
     同じ事実を述べる node 検査2本（`tests/r439-checks` ⑨・`tests/r469-checks` ⑥）は一緒に直った
     ——**毎 push 走るから**である。ここは nightly の deep tier で、写しだけが古い世界を主張した
     まま残り、次に deep が回るまで誰も気づかなかった（#R475 と同じ形：開いていないラウンドで
     動く判定は、そのラウンドでは測られていない）。
     ⚠ **この spec が主張すべきは「どの棚か」ではない。** 棚を決めるのは分類（`GROUPS`）で、
     それを動かせるのは読者の指示だけ（#R273）。ここが主張すべきなのは、**描かれたパネルが
     その宣言どおりに行を並べているか**である。`order.push` は要素を**移動**させるので、2つの
     リストに載った id は最後の1つでしか描かれず、どのリストにも載らない行は「その他 (beta)」へ
     掃き出される（#R271 の 🕒 タイムゾーンが実際にそこへ落ちた経路）。
     宣言を読む口は `tests/helpers/layer-groups.mjs` ——リテラルを**値として**評価するので、
     タプルの形が変わっても綴りを追いかけずに済む（#R469 が正規表現12本を一度に落としたのが
     その理由）。⚠ `BETA_KEY` は分類の写しではない——どの棚にも無い行がベータへ掃き
     出されるという `reorganizeLayerPanel` の1つの事実である。 */
  for (const id of ['ec-slp', 'ec-gust', 'ec-precip', 'ec-dew', 'ec-cape', 'ec-wind']) {
    expect(under['dl-' + id], id + ' renders under the head js/data-layers.js files it on')
      .toBe(where(id) || BETA_KEY);
  }
  /* ⚠ そして #R439 自身の主張——名指しされた4行が**ベータを出た**こと。どの棚へ行ったかは分類が
     決めるが、「昇格した」は棚の名前を綴らなくても言える。宣言の側は `tests/r439-checks` ⑨ が
     毎 push、id を名指しで見ている。 */
  for (const id of ['ec-slp', 'ec-gust', 'ec-precip', 'ec-dew']) {
    expect(under['dl-' + id], id + ' left 「その他 (beta)」 — that is what this round did')
      .not.toBe(BETA_KEY);
  }
  expect(under['dl-ec-isobars'], 'and the retired row is nowhere at all').toBeUndefined();
});
