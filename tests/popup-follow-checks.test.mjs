/* ============================================================================
 *  A card that belongs to a place follows that place  (js/popup-anchor.js)
 * ----------------------------------------------------------------------------
 *  「まだ場所を動かないポップアップ等がある」 — the helper is EVALUATED here with a fake projector and a
 *  fake camera, and the sites that used to place a card once are checked to go through it.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis.window || { addEventListener() {}, innerWidth: 1200, innerHeight: 800 };
globalThis.document = globalThis.document || { body: {}, documentElement: {}, getElementById: () => null };
const { anchorToLngLat } = await import('../js/popup-anchor.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* a world where the camera is a number: a point at lng L projects to x = L*10 + pan */
function world() {
  const w = { pan: 0, surface: true, subs: new Map(), computed: null };
  w.deps = {
    project: (ll) => ({ x: ll[0] * 10 + w.pan, y: 300 + ll[1] }),
    onSurface: () => w.surface,
    canvasRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    viewport: () => ({ w: 1200, h: 800 }),
    rightInset: () => 0,
    onCamera: (k, fn) => { w.subs.set(k, fn); return () => w.subs.delete(k); },
    computedLeft: (el) => (w.computed != null ? w.computed : parseFloat(el.style.left)),
  };
  w.move = (pan) => { w.pan = pan; for (const fn of [...w.subs.values()]) fn(); };
  return w;
}
function card(attrs) {
  const a = Object.assign({}, attrs);
  return { isConnected: true, offsetParent: null, offsetWidth: 300, offsetHeight: 200, style: { display: 'block' },
    getAttribute: (n) => (n in a ? a[n] : null), setAttr: (n, v) => { a[n] = v; } };
}

test('the card sits beside the place and follows it as the camera moves', () => {
  const w = world(), el = card();
  anchorToLngLat(el, [20, 0], { deps: w.deps });
  assert.equal(parseFloat(el.style.left), 200 + 18);
  w.move(100);
  assert.equal(parseFloat(el.style.left), 300 + 18, 'the card moved with the place');
  w.move(-50);
  assert.equal(parseFloat(el.style.left), 150 + 18);
  assert.equal(parseFloat(el.style.top), 300 - 24);
});

test('a function anchor is asked every time (the place may be learned late)', () => {
  const w = world(), el = card(); let ll = [10, 0];
  anchorToLngLat(el, () => ll, { deps: w.deps });
  assert.equal(parseFloat(el.style.left), 100 + 18);
  ll = [30, 0]; w.move(0);
  assert.equal(parseFloat(el.style.left), 300 + 18);
});

test('it hides while the place is behind the globe or off the canvas, and returns with it', () => {
  const w = world(), el = card();
  anchorToLngLat(el, [20, 0], { deps: w.deps });
  w.surface = false; w.move(0);
  assert.equal(el.style.visibility, 'hidden');
  w.surface = true; w.move(0);
  assert.equal(el.style.visibility, '');
  w.move(2000);
  assert.equal(el.style.visibility, 'hidden', 'off the canvas');
  w.move(0);
  assert.equal(el.style.visibility, '');
});

test('a card the stylesheet docks is not hidden when its place leaves', () => {
  const w = world(), el = card();
  anchorToLngLat(el, [20, 0], { deps: w.deps });
  w.computed = 16;               /* the stylesheet pinned left: it is not near the place */
  w.move(2000);
  assert.ok(!el.style.visibility, 'not hidden');
});

test('it stays inside the window however far the place is', () => {
  const w = world(), el = card();
  anchorToLngLat(el, [90, 0], { deps: w.deps });
  assert.ok(parseFloat(el.style.left) + el.offsetWidth <= 1200 - 12);
  w.move(-2000); w.move(0);
  assert.ok(parseFloat(el.style.left) >= 12);
});

test('it stops following once the reader drags the card, and lets go of the camera', () => {
  const w = world(), el = card();
  anchorToLngLat(el, [20, 0], { deps: w.deps });
  assert.equal(w.subs.size, 1);
  el.setAttr('data-dragged', '1');
  const before = el.style.left;
  w.move(100);
  assert.equal(el.style.left, before, 'the reader decided where it sits');
  assert.equal(w.subs.size, 0, 'unsubscribed');
});

test('it unsubscribes when the card leaves the document', () => {
  const w = world(), el = card();
  anchorToLngLat(el, [20, 0], { deps: w.deps });
  el.isConnected = false; w.move(5);
  assert.equal(w.subs.size, 0);
});

test('re-anchoring one element replaces the old anchor (a singleton card reopened elsewhere)', () => {
  const w = world(), el = card();
  anchorToLngLat(el, [20, 0], { deps: w.deps });
  anchorToLngLat(el, [40, 0], { deps: w.deps });
  assert.equal(w.subs.size, 1);
  assert.equal(parseFloat(el.style.left), 400 + 18);
});

test('a place that is not on screen when the card opens docks it, visible, and does not follow', () => {
  const w = world(), el = card();
  w.pan = 5000;
  anchorToLngLat(el, [20, 0], { deps: w.deps, dockedTop: 84 });
  assert.equal(el.style.visibility ?? '', '');
  assert.equal(parseFloat(el.style.top), 84);
  assert.equal(w.subs.size, 0);
});

test('every site that placed a place-anchored card once now goes through the helper', () => {
  for (const f of ['company-facilities', 'datacenters', 'osm-facilities', 'railways', 'company-panel', 'news-intel']) {
    const src = readFileSync(join(ROOT, 'js', f + '.js'), 'utf8');
    assert.match(src, /import \{ anchorToLngLat \} from '\.\/popup-anchor\.js'/, f);
    assert.match(src, /anchorToLngLat\(/, f);
    assert.doesNotMatch(src, /getBoundingClientRect\(\); return (r2?)\.left\+(p|q)\.x/, f + ' still projects once by hand');
  }
});
