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
 * ==========================================================================*/
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './helpers/app.js';

/* 配られたチャンクの名前はハッシュ付き。綴りを書き写さず、dist から引く。 */
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');
const CHUNK = readdirSync(DIST).find((f) => /^atlas-view-capture-.*\.js$/.test(f));

test('R493 撮ったフレームには地図が写っている（黒い矩形ではない）', async ({ app }) => {
  const page = app.page;
  expect(CHUNK, 'dist に atlas-view-capture のチャンクが無い（build していない）').toBeTruthy();

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

  const out = await page.evaluate(async (chunk) => {
    const m = await import('/assets/' + chunk);
    const GE = () => window.IntMapGeoEngine;
    /* ⚠ 台帳の機械値は **状態台帳**から来る。カーネルが載る前の `IntMapOS.snapshot()` は
       設計どおり常に null（js/atlas-capabilities.js のスタブ）なので、ここで本物を載せる——
       そうしないと「bbox が付かないこと」を「付いた」と読み違える。 */
    try { if (window.IntMapOS && window.IntMapOS.kernel) await window.IntMapOS.kernel(); } catch (_) { /* 下で null として現れる */ }
    const ledger = m.makeViewCapture({
      GE, L: (en) => en, esc: (x) => String(x),
      snapshot: () => (window.IntMapOS && window.IntMapOS.snapshot ? window.IntMapOS.snapshot() : null),
      waitIdle: async () => {},
    });
    const r = await ledger.captureFrame({ include: 'map', reason: 'spec' });
    if (!r.ok) return { ok: false, message: r.message };

    /* 撮った data URL を戻して復号し、画素を標本する——「絵が返った」ではなく「色がある」を測る */
    const url = ledger.urls()[0];
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set(); let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 397) { seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); sum += d[i] + d[i + 1] + d[i + 2]; n++; }
    return { ok: true, size: [img.width, img.height], sampled: n, distinct: seen.size,
             mean: sum / (n * 3), bytes: url.length, facts: r.facts,
             mime: url.slice(0, url.indexOf(';')) };
  }, CHUNK);

  expect(out.ok, `キャプチャが断られた: ${out.message}`).toBe(true);
  expect(out.mime).toBe('data:image/jpeg');
  expect(out.size[0]).toBeGreaterThan(200);
  expect(out.size[1]).toBeGreaterThan(150);
  /* ⚠ ここが主張の本体。作り物のレンダラでは決して立たない。 */
  expect(out.distinct, '全面が同じ色＝描画されていないバッファを読んでいる').toBeGreaterThan(8);
  expect(out.mean, '平均輝度 0 は真っ黒（#R493 の主要な失敗形）').toBeGreaterThan(4);
  expect(out.bytes, 'JPEG が数百バイト＝一様な絵').toBeGreaterThan(3000);

  /* 機械値は同じ瞬間のアプリから来る——画像を測って得たものではない */
  expect(out.facts.frame).toBe('view-frame-1');
  expect(out.facts.include).toBe('map');
  expect(Number.isFinite(out.facts.zoom)).toBe(true);
  expect(out.facts.bbox && Number.isFinite(out.facts.bbox.west)).toBe(true);
  expect(JSON.stringify(out.facts)).not.toMatch(/data:image/);
});
