/* ============================================================================
 *  The Köppen climate layer: image lifecycle and memory
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r217-checks.test.mjs, tests/r708-koppen-lifecycle-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r217-checks.test.mjs — 3 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない（画像の解放と再読み込みの挙動は #R708 のブロックで関数を切り出して実行している） */
/* (#R217) the round's header note is kept with its largest block, in tests/layer-place-labels-rivers-checks.test.mjs */
const rd = read;

/* ═══ ⑤ THE KÖPPEN IMAGE IS NOT KEPT WHERE ITS EXTRA PIXELS CANNOT BE USED ═════════════════════ */

test('R217 ⑤a: the decoded source image is released once the work canvas covers the cap', () => {
  const d = rd('js/data-layers.js');
  assert.match(d, /if\(_koppenFullCap\(\)<=c\.width&&_koppenFullCap\(\)<=c\.height\)\{ window\._koppenImg=null; try\{ im\.src=''; \}catch\(_\)\{ \} \}/,
    'a phone caps the full-res highlight at 2048 and the work canvas IS 2048, so the 67 MB bitmap is unreachable');
  assert.match(d, /else window\._koppenImg=im;/, 'where the cap is higher than the work canvas (desktop) it is kept');
});

test('R217 ⑤b: …and the highlight then rasterises from the work canvas instead', () => {
  const d = rd('js/data-layers.js');
  assert.match(d, /const im=window\._koppenImg\|\|window\._koppenCanvas; if\(!im\) return null;/,
    'ensureKoppenFull must not return null just because the image was released');
});

test('R217 ⑤c: the phone cap and the work-canvas cap are still the same number', () => {
  const d = rd('js/data-layers.js');
  const work = /const KWORK_CAP=(\d+);/.exec(d);
  /* ⚠ (#R668) the phone cap is read out of _koppenFullCap's FIRST branch, and that branch asks the
     DEVICE now: `isMobile()` is a 768 px media query, so an iPhone in landscape (844 px) fell to the
     desktop arm and was authorised a 4096² output canvas — 67 MB instead of 16 MB — on the phone
     this cap exists to keep alive. The number did not move; the question it answers did. */
  const mob = /function _koppenFullCap\(\)\{[\s\S]{0,120}if\((?:_phoneDev\(\)|window\.IntMapMemBudget\.deviceIsPhone\([^()]*\))\) return (\d+);/.exec(d);
  assert.ok(work && mob, 'both caps are declared where this test can read them, and the phone arm of '
    + '_koppenFullCap() is decided by the device (_phoneDev()/IntMapMemBudget.deviceIsPhone)');
  assert.equal(Number(mob[1]), Number(work[1]),
    'releasing the image is only lossless while the phone\'s highlight cap equals the work canvas — '
    + 'if one of these moves, the other has to move with it or the claim in ⑤a stops being true');
});
}

/* ══════════ from tests/r708-koppen-lifecycle-checks.test.mjs — 7 of its 7 test(s) ══════════ */
{
/* (#R708) the original file carried no header note */

const source = readFileSync(new URL('../js/data-layers.js', import.meta.url), 'utf8');
const functions = new Map();
let refresh;
simple(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), {
  FunctionDeclaration(n) { functions.set(n.id.name, source.slice(n.start, n.end)); },
  AssignmentExpression(n) {
    if (source.slice(n.left.start, n.left.end) === 'window._refreshKoppenImage') refresh = source.slice(n.start, n.end);
  },
});
function harness({ phone = true, bitmap, draw = () => {} } = {}) {
  const window = { _koppenPeriod: 'old' }, canvases = [], images = [], pending = [];
  const timers = new Map(); let timerId = 0;
  const document = { createElement() {
    const c = { width: 0, height: 0, getContext: () => ({ drawImage: draw }) };
    canvases.push(c); return c;
  } };
  class Image { constructor() { images.push(this); this.width = this.height = 4096; } }
  const names = ['_mkKoppenWork', '_koppenBitmapWork', '_loadKoppenCanvasImg', 'loadKoppenCanvas', '_resetKoppenWork'];
  const api = new Function('window', 'document', 'Image', 'fetch', 'createImageBitmap', 'phone', 'setTimeout', 'clearTimeout',
    "const KWORK_CAP=2048, KURL_FALLBACK='fallback'; let _koppenWorkGen=0; const koppenPhone=()=>phone, _koppenFullCap=()=>phone?2048:4096, koppenWorkURL=p=>p;\n" +
    names.map(n => functions.get(n) || '').join('\n') +
    '\nconst GE=()=>({layers:{hasSource:()=>true,updateImage(){}}});' + refresh + ';' +
    '\nreturn {loadKoppenCanvas, reset: typeof _resetKoppenWork === "function" ? _resetKoppenWork : ()=>{window._koppenCanvas=null;window._koppenReady=false;}};')(
    window, document, Image,
    () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    bitmap || (async () => ({ width: 2048, height: 2048, close() {} })), phone,
    fn => { timers.set(++timerId, fn); return timerId; }, id => timers.delete(id),
  );
  return { window, canvases, images, pending, timers, ...api };
}
test('#R708 obsolete climate decode cannot restore a released work canvas', async () => {
  const h = harness(), p = h.loadKoppenCanvas();
  h.reset();
  h.pending[0].resolve({ ok: true, blob: async () => ({}) });
  await p;
  assert.equal(h.window._koppenReady, false);
  assert.equal(h.window._koppenCanvas, null);
  assert.equal(h.canvases.length, 0, 'discard before allocating the work canvas');
});
test('#R708 obsolete highlight completion cannot schedule a new load after release', async () => {
  const h = harness(); h.window.kSelected = new Set(['Af']);
  h.window._refreshKoppenImage();
  const task = [...h.timers.values()][0]; h.timers.clear(); task();
  assert.equal(h.pending.length, 1); h.reset();
  h.pending[0].resolve({ ok: true, blob: async () => ({}) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.timers.size, 0); assert.equal(h.window._koppenCanvas, null);
  h.window._refreshKoppenImage(); assert.equal(h.timers.size, 1);
  h.reset(); assert.equal(h.timers.size, 0, 'a queued highlight is cancelled too');
});
test('#R708 a bitmap finishing after reset is closed without allocating a canvas', async () => {
  let finish, closed = 0;
  const h = harness({ bitmap: () => new Promise(r => { finish = r; }) }), p = h.loadKoppenCanvas();
  h.pending[0].resolve({ ok: true, blob: async () => ({}) });
  await new Promise(resolve => setImmediate(resolve)); h.reset();
  finish({ width: 2048, height: 2048, close() { closed++; } }); await p;
  assert.equal(closed, 1); assert.equal(h.canvases.length, 0);
});
test('#R708 desktop preserves its full resolution image until release, then rejects old image completions', async () => {
  const h = harness({ phone: false }), p = h.loadKoppenCanvas();
  h.images[0].onload(); await p;
  assert.equal(h.window._koppenImg, h.images[0]);
  assert.equal(h.window._koppenImg.width, 4096);
  h.reset(); assert.equal(h.images[0].src, '');
  const next = h.loadKoppenCanvas(); h.reset(); h.images[1].onload(); await next;
  assert.equal(h.window._koppenCanvas, null); assert.equal(h.images[1].src, '');
});
test('#R708 current bitmap failure still reaches the original image fallback', async () => {
  const h = harness(), p = h.loadKoppenCanvas();
  h.pending[0].reject(new Error('unsupported bitmap decode'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.images.length, 1); h.images[0].onload(); await p;
  assert.equal(h.window._koppenReady, true); assert.equal(h.window._koppenCanvas.width, 2048);
});
test('#R708 obsolete failed load cannot start a fallback for the new period', async () => {
  const h = harness(), p = h.loadKoppenCanvas();
  h.reset(); h.window._koppenPeriod = 'new';
  h.pending[0].reject(new Error('old request failed'));
  // An obsolete fallback Image never loads: flush microtasks instead of awaiting that leak.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.images.length, 0);
  await p;
});
test('#R708 release returns canvas backing immediately and new work still loads at the same resolution', async () => {
  const h = harness(), p = h.loadKoppenCanvas();
  h.pending[0].resolve({ ok: true, blob: async () => ({}) }); await p;
  const c = h.window._koppenCanvas;
  assert.equal(c.width, 2048); assert.equal(c.height, 2048);
  h.reset();
  assert.equal(c.width * c.height * 4, 0, 'old 16 MiB backing is released synchronously');
  const next = h.loadKoppenCanvas();
  h.pending[1].resolve({ ok: true, blob: async () => ({}) }); await next;
  assert.equal(h.window._koppenCanvas.width, 2048);
  assert.equal(h.window._koppenReady, true);
});
}
