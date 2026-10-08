/* ============================================================================
 *  R493 — Atlas が撮る絵は、本当に地図が写っているか（ブラウザ実測）
 * ----------------------------------------------------------------------------
 *  `view.inspect` の値打ちは**画素**にある。台帳の論理は node の検査が端から端まで駆動している
 *  （tests/r493-checks.test.mjs）が、そこで動く「レンダラ」は作り物で、**WebGL の読み出しだけは
 *  作り物では確かめられない**。ここはその1点だけを、本物の合成が起きるブラウザで測る。
 *
 *  ⚠⚠⚠ **黒い矩形は「失敗」ではなく「自信のある誤答」になる。** `preserveDrawingBuffer` は
 *  意図的に OFF なので、描画されていないバッファを読むと**全面 (0,0,0)** が返る——実測: プレビュー
 *  ペイン（`document.hidden`）で requestAnimationFrame は 700 ms に 0 回、'render' イベントは 0 回、
 *  標本 628 画素すべてが真っ黒だった。それを Vision に渡せば「地図が暗い」と説明されてしまう。
 *  だから実装は **render tick から来たフレームだけを受け取り**、来なければ理由を言って断る。
 *  この spec は**受け取ったほうの絵に本当に色があること**を主張する（断るほうは node の ②f）。
 *
 *  ⚠ 起動は1回だけ（`app` fixture）。固定の待ちは置かない（#R399）——待つのは
 *  「レンダラが在ること」と「1 フレーム描かれたこと」そのもの。
 *
 *  ⚠⚠ (deep-tier-reds) 撮るのは**アプリが Atlas に渡している台帳そのもの**で、配られたチャンクを名前で
 *  import しない。以前はここが `dist/assets/atlas-view-capture-*.js` を import して export 名
 *  `makeViewCapture` を呼んでいた。#998 で js/map-recorder.js も同じモジュールを import するようになると、
 *  それは 2 つの遅延チャンクが共有するチャンクになり、バンドラは export 名を縮めた（チャンク末尾
 *  `export{t}`）——nightly deep tier は 2026-10-05 から 3 晩 `m.makeViewCapture is not a function` で赤かった。
 *  **export 名が契約として残るのは `import()` の的になる入口のチャンクだけ**で、このモジュールはその的では
 *  ない（tests/deep-tier-reds-checks.test.mjs が、dist のチャンクを名前で import する全 spec についてそれを測る）。
 *  だから R493 の主張は Atlas が実際に呼ぶ道——`IntMapConsole.dispatch({type:'inspect'})` →
 *  js/atlas-cap-view.js → js/atlas-console.js が束ねた VFRAMES——で測る。作り物の依存を注入していた頃より、
 *  測っているものが製品に近い。画素は応答の `<img>` から取る（captureFrame は台帳と同じ data URL をそこに置く）。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test('R493 撮ったフレームには地図が写っている（黒い矩形ではない）', async ({ app }) => {
  const page = app.page;

  /* レンダラが立ち、実際に1フレーム描かれるまで待つ */
  await page.waitForFunction(() => {
    const GE = window.IntMapGeoEngine;
    return !!(GE && GE.hasRenderer && GE.hasRenderer());
  }, null, { timeout: 60000 });
  await page.waitForFunction(() => new Promise((res) => {
    let n = 0;
    const tick = () => { n++; if (n >= 3) res(true); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => res(false), 3000);
  }), null, { timeout: 30000 });

  /* Atlas のカーネルは要求時に読まれる（#R224）——利用者の最初のクリックと同じく、求めて載せる。
     ⚠ 台帳の機械値は**状態台帳**から来る。カーネルが載る前の `IntMapOS.snapshot()` は設計どおり常に null
     （js/atlas-capabilities.js のスタブ）——dispatch はカーネルが束ねた VFRAMES を通るので、本物が答える。 */
  await page.waitForFunction(() => !!window.IntMapAtlas, null, { timeout: 60000 });
  await page.evaluate(() => window.IntMapAtlas.ensure());
  await page.waitForFunction(() => !!(window.IntMapConsole && typeof window.IntMapConsole.dispatch === 'function'), null, { timeout: 60000 });

  const out = await page.evaluate(async () => {
    const r = await window.IntMapConsole.dispatch({ type: 'inspect', include: 'map', reason: 'spec' });
    if (!r || !r.ok) return { ok: false, message: r ? r.html : 'no result' };

    /* 撮った data URL を応答の <img> から戻して復号し、画素を標本する——「絵が返った」ではなく「色がある」を測る */
    const t = document.createElement('template'); t.innerHTML = r.html;
    const shown = t.content.querySelector('img');
    const url = shown ? shown.getAttribute('src') : '';
    if (!url) return { ok: false, message: 'the answer carries no picture: ' + r.html.slice(0, 200) };
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set(); let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 397) { seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); sum += d[i] + d[i + 1] + d[i + 2]; n++; }
    return { ok: true, size: [img.width, img.height], sampled: n, distinct: seen.size,
             mean: sum / (n * 3), bytes: url.length, facts: r.exec,
             mime: url.slice(0, url.indexOf(';')) };
  });

  expect(out.ok, `キャプチャが断られた: ${out.message}`).toBe(true);
  expect(out.mime).toBe('data:image/jpeg');
  expect(out.size[0]).toBeGreaterThan(200);
  expect(out.size[1]).toBeGreaterThan(150);
  /* ⚠ ここが主張の本体。作り物のレンダラでは決して立たない。 */
  expect(out.distinct, '全面が同じ色＝描画されていないバッファを読んでいる').toBeGreaterThan(8);
  expect(out.mean, '平均輝度 0 は真っ黒（#R493 の主要な失敗形）').toBeGreaterThan(4);
  expect(out.bytes, 'JPEG が数百バイト＝一様な絵').toBeGreaterThan(3000);

  /* 機械値は同じ瞬間のアプリから来る——画像を測って得たものではない。
     台帳はこのページの Atlas のもの：同じ worker の先の検査が撮っていれば番号は進んでいる */
  expect(out.facts.frame).toMatch(/^view-frame-[1-9]\d*$/);
  expect(out.facts.include).toBe('map');
  expect(Number.isFinite(out.facts.zoom)).toBe(true);
  expect(out.facts.bbox && Number.isFinite(out.facts.bbox.west)).toBe(true);
  expect(JSON.stringify(out.facts)).not.toMatch(/data:image/);
});
