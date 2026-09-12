import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';

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
test('obsolete climate decode cannot restore a released work canvas', async () => {
  const h = harness(), p = h.loadKoppenCanvas();
  h.reset();
  h.pending[0].resolve({ ok: true, blob: async () => ({}) });
  await p;
  assert.equal(h.window._koppenReady, false);
  assert.equal(h.window._koppenCanvas, null);
  assert.equal(h.canvases.length, 0, 'discard before allocating the work canvas');
});
test('obsolete highlight completion cannot schedule a new load after release', async () => {
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
test('a bitmap finishing after reset is closed without allocating a canvas', async () => {
  let finish, closed = 0;
  const h = harness({ bitmap: () => new Promise(r => { finish = r; }) }), p = h.loadKoppenCanvas();
  h.pending[0].resolve({ ok: true, blob: async () => ({}) });
  await new Promise(resolve => setImmediate(resolve)); h.reset();
  finish({ width: 2048, height: 2048, close() { closed++; } }); await p;
  assert.equal(closed, 1); assert.equal(h.canvases.length, 0);
});
test('desktop preserves its full resolution image until release, then rejects old image completions', async () => {
  const h = harness({ phone: false }), p = h.loadKoppenCanvas();
  h.images[0].onload(); await p;
  assert.equal(h.window._koppenImg, h.images[0]);
  assert.equal(h.window._koppenImg.width, 4096);
  h.reset(); assert.equal(h.images[0].src, '');
  const next = h.loadKoppenCanvas(); h.reset(); h.images[1].onload(); await next;
  assert.equal(h.window._koppenCanvas, null); assert.equal(h.images[1].src, '');
});
test('current bitmap failure still reaches the original image fallback', async () => {
  const h = harness(), p = h.loadKoppenCanvas();
  h.pending[0].reject(new Error('unsupported bitmap decode'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.images.length, 1); h.images[0].onload(); await p;
  assert.equal(h.window._koppenReady, true); assert.equal(h.window._koppenCanvas.width, 2048);
});
test('obsolete failed load cannot start a fallback for the new period', async () => {
  const h = harness(), p = h.loadKoppenCanvas();
  h.reset(); h.window._koppenPeriod = 'new';
  h.pending[0].reject(new Error('old request failed'));
  // An obsolete fallback Image never loads: flush microtasks instead of awaiting that leak.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.images.length, 0);
  await p;
});
test('release returns canvas backing immediately and new work still loads at the same resolution', async () => {
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
