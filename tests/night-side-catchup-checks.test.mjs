/* ============================================================================
 *  night-side-catchup — the night side catches up with the master clock on a page that is never idle.
 *
 *  #963 (map-motion) sliced the 1024² night image so it is never one long task — and ran the slices on
 *  requestIdleCallback. A busy page has no idle time: CI (no GPU, two workers) still showed the OLD
 *  terminator 2.2 s after the clock moved (tests/r200 ③ read alpha 37 at midnight AND noon), and with
 *  the CPU throttled ×4 the repaint took 9.8 s on a desktop build. To the reader: on a slow device,
 *  moving the clock left day and night where they were.
 *
 *  These checks RUN js/night-side.js (evaluated as the module it is, the renderer and the clock replaced
 *  at their import edges) in a page whose idle callbacks never fire, and assert on what it does:
 *    ① asking for a repaint does not paint inside the call (#963's order claim, kept)
 *    ② the repaint still finishes — coarse picture first, then the exact one — with no idle time at all
 *    ③ it is sliced: more than one task, and none of them a long task (50 ms, the Long Tasks definition)
 *    ④ a clock that moves again abandons the running picture and paints the new instant
 *    ⑤ asking again for the picture already being drawn does not start it over
 *    ⑥ state().paint says which instant the canvas holds, and state().built waits for the exact picture
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from './helpers/import-module.mjs';

/* ── the browser, as much of it as the module touches ───────────────────────────────────────── */
class ImageData { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } }
const ctx2d = () => ({ last: null, imageSmoothingEnabled: false,
  clearRect() {}, putImageData(img) { this.last = { how: 'put', w: img.width }; },
  drawImage(src, x, y, w) { this.last = { how: 'stretch', w: src.width, to: w }; } });
const canvas = () => { const c = { width: 0, height: 0, _c: ctx2d(), getContext: () => c._c }; return c; };

/* a page that is NEVER idle: idle callbacks are only ever run when the test says so */
const idleQ = [];
const requestIdleCallback = (fn) => { idleQ.push(fn); return idleQ.length; };
const flushIdle = () => { while (idleQ.length) idleQ.shift()({ didTimeout: false, timeRemaining: () => 50 }); };

/* ordinary tasks, each one timed */
const tasks = [];
class MessageChannel {
  constructor() {
    const p1 = { onmessage: null };
    this.port1 = p1;
    this.port2 = { postMessage() { setImmediate(() => { const t = performance.now(); p1.onmessage({}); tasks.push(performance.now() - t); }); } };
  }
}

/* ── the clock and the renderer, replaced at the import edges the file declares ─────────────── */
let now = Date.parse('2026-06-21T03:00:00Z');
const subs = [];
const IntMapTime = { when: () => new Date(now), on: (f) => { subs.push(f); return () => {}; } };
const setClock = (iso) => { now = Date.parse(iso); subs.forEach((f) => f({})); };

const touches = [];
let img = null;
const layers = new Set(), sources = new Set();
const IntMapGeoEngine = {
  id: () => 'maplibre', hasRenderer: () => true, canDraw: () => true,
  camera: { get: () => ({ zoom: 1.2 }) },
  events: { on() {} },
  layers: {
    addDynamicImage(id, o) { img = { o, cv: canvas() }; img.cv.width = o.width; img.cv.height = o.height; o.draw(img.cv._c, o.width, o.height); return true; },
    hasDynamicImage: () => !!img,
    removeDynamicImage() { img = null; },
    touchDynamicImage() {
      img.o.draw(img.cv._c, img.cv.width, img.cv.height);
      touches.push(Object.assign({ drawn: img.cv._c.last }, NS().state().paint));
      return true;
    },
    has: (id) => layers.has(id), add: (l) => { layers.add(l.id); }, remove: (id) => layers.delete(id),
    hasSource: (id) => sources.has(id), addSource: (id) => { sources.add(id); }, removeSource: (id) => sources.delete(id),
    setSourceData() {}, getLayout: () => 'visible',
  },
};

const win = { IntMapNightLights: { current: () => null, on() {} }, requestIdleCallback };
await importModule('js/night-side.js', {
  globals: { window: win, document: { createElement: canvas }, ImageData, MessageChannel, requestIdleCallback,
             localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { userAgent: 'node' } },
  mocks: {
    'js/runtime.js': { everyTick() {}, stopTick() {} },
    'js/night-lights.js': {},
    'js/chronos.js': { IntMapTime },
    'js/geo-engine.js': { IntMapGeoEngine },
  },
});
const NS = () => win.IntMapNightSide;
/* wait for the module's own tasks — a bounded number of turns of the event loop, never an idle period */
const settle = async (pred, turns = 20000) => { for (let i = 0; i < turns && !pred(); i++) await new Promise((r) => setImmediate(r)); return pred(); };
const fullAt = (iso) => () => { const p = NS().state().paint; return p.full && p.at === Date.parse(iso) && p.pending == null; };

test('build: the first exact picture is what state().built waits for', async () => {
  NS().apply();
  flushIdle();                                   /* the BUILD waits for the first idle after the camera settles — unchanged */
  assert.equal(NS().state().built, false, 'nothing is reported built before a full-size picture is on the canvas');
  assert.ok(await settle(fullAt('2026-06-21T03:00:00Z')), 'the first picture is painted without any further idle time');
  assert.equal(NS().state().built, true);
});

test('① ② ③ ⑥ moving the clock repaints on a page that is never idle — coarse first, then exact, sliced', async () => {
  const N = NS().state().imgSize;
  touches.length = 0; tasks.length = 0; idleQ.length = 0;
  setClock('2026-06-21T15:00:00Z');
  /* ① */
  assert.equal(NS().state().paint.at, Date.parse('2026-06-21T03:00:00Z'), 'the call that moved the clock returned before any repaint');
  assert.equal(touches.length, 0, 'and the canvas was not touched inside it');
  assert.equal(NS().state().paint.pending, Date.parse('2026-06-21T15:00:00Z'), 'the instant being drawn is published');
  /* ② — no idle callback is ever run from here on */
  assert.ok(await settle(fullAt('2026-06-21T15:00:00Z')), 'the repaint finished with no idle time at all');
  assert.equal(idleQ.length, 0, 'and it never asked for any');
  assert.equal(touches.length, 2, 'two pictures reached the canvas');
  assert.deepEqual([touches[0].full, touches[0].drawn.how, touches[0].drawn.w], [false, 'stretch', N >> 2], 'first a coarse one, stretched');
  assert.deepEqual([touches[1].full, touches[1].drawn.how, touches[1].drawn.w], [true, 'put', N], 'then the exact one, put as it is');
  for (const t of touches) assert.equal(t.at, Date.parse('2026-06-21T15:00:00Z'), 'both of the instant the clock was moved to');
  /* ③ */
  assert.ok(tasks.length > 2, `the paint is sliced (${tasks.length} tasks)`);
  const longest = Math.max(...tasks);
  assert.ok(longest < 50, `no slice is a long task: longest ${longest.toFixed(1)} ms`);
  assert.ok(NS().state().paint.lastMs >= 0, 'and how long the last full paint took is published');
});

test('④ a clock that moves again abandons the running picture and paints the new instant', async () => {
  touches.length = 0;
  setClock('2026-06-21T09:00:00Z');
  await new Promise((r) => setImmediate(r));       /* one slice of the first job */
  setClock('2026-06-21T21:00:00Z');
  assert.ok(await settle(fullAt('2026-06-21T21:00:00Z')), 'the newest instant is painted');
  assert.ok(!touches.some((t) => t.full && t.at === Date.parse('2026-06-21T09:00:00Z')),
    'no exact picture of the abandoned instant was finished');
  assert.equal(touches[touches.length - 1].at, Date.parse('2026-06-21T21:00:00Z'));
});

test('⑤ asking again for the picture already being drawn does not start it over', async () => {
  touches.length = 0;
  setClock('2026-06-21T12:00:00Z');
  NS().refresh(); NS().refresh();
  assert.ok(await settle(fullAt('2026-06-21T12:00:00Z')));
  assert.equal(touches.filter((t) => !t.full).length, 1, 'one coarse picture — the job was not restarted');
  assert.equal(touches.length, 2);
  NS().refresh();                                   /* …and once it is on the canvas, asking again is a no-op */
  await settle(() => false, 50);
  assert.equal(touches.length, 2, 'the same instant is not repainted');
});
