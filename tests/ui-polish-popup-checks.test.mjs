/* ============================================================================
 *  The place popup opens beside its pin on the side that covers least (js/popup-placement.js), and a Tools host that
 *  holds one section draws no heading (js/map-ui.js _fillTools).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { choosePlacement, collectObstacles, fitOverlay, optionsFor } from '../js/popup-placement.js';

const bounds = { left: 0, top: 0, right: 1200, bottom: 800 };
const size = { w: 200, h: 120 };
const R = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });

test('a stack can clear the existing UI by moving on both axes', () => {
  const frame = R(0, 0, 360, 280);
  const desired = R(20, 24, 140, 124);
  const obstacles = [R(0, 0, 170, 280), R(170, 0, 360, 108)];
  assert.deepEqual(fitOverlay(desired, frame, obstacles, 4), R(174, 112, 294, 212));
});

test('an anchored popup can slide when none of its four nominal sides fits', () => {
  const point = { x:180, y:140 };
  const p = choosePlacement({
    point, bounds:R(0, 0, 400, 300), size:{w:90,h:70}, pin:{w:18,h:24},
    obstacles:[R(170, 0, 190, 300), R(0, 90, 400, 165)],
  });
  assert.ok(p.rect.top >= 165 || p.rect.bottom <= 90);
  assert.ok(p.rect.left >= 190 || p.rect.right <= 170);
});

test('open ground: the popup opens on the right of the pin, centred on it', () => {
  const p = choosePlacement({ point: { x: 600, y: 400 }, size, bounds, obstacles: [] });
  assert.equal(p.side, 'right');
  assert.equal(p.anchor, 'left');
  assert.deepEqual(p.offset, [15 + 14, -19]);
  assert.ok(p.rect.left > 615, 'clear of the pin');
});

test('the right edge of the map pushes it to the left', () => {
  const p = choosePlacement({ point: { x: 1150, y: 400 }, size, bounds, obstacles: [] });
  assert.equal(p.side, 'left');
  assert.equal(p.anchor, 'right');
  assert.ok(p.offset[0] < 0);
});

test('a panel on the right pushes it to the left; panels on both sides push it above', () => {
  const right = R(640, 300, 900, 500), left = R(250, 300, 560, 500);
  assert.equal(choosePlacement({ point: { x: 600, y: 400 }, size, bounds, obstacles: [right] }).side, 'left');
  assert.equal(choosePlacement({ point: { x: 600, y: 400 }, size, bounds, obstacles: [right, left] }).side, 'above');
});

test('near the top edge and boxed in, it opens below', () => {
  const p = choosePlacement({ point: { x: 600, y: 60 }, size, bounds, obstacles: [R(640, 0, 900, 200), R(250, 0, 560, 200)] });
  assert.equal(p.side, 'below');
  assert.equal(p.anchor, 'top');
});

test('options and rectangle agree: the anchor edge sits where the rectangle says', () => {
  const pt = { x: 500, y: 300 }, pin = { w: 30, h: 38 };
  const r = choosePlacement({ point: pt, size, pin, bounds, obstacles: [] });
  assert.equal(r.side, 'right');
  assert.equal(r.rect.left, pt.x + r.offset[0]);
  assert.equal((r.rect.top + r.rect.bottom) / 2, pt.y + r.offset[1]);
  assert.deepEqual(r.offset, optionsFor('right', pin, 14).offset);
  const a = choosePlacement({ point: pt, size, pin, bounds, obstacles: [R(480, 290, 1200, 420), R(0, 290, 480, 420)] });
  assert.equal(a.side, 'above');
  assert.equal(a.rect.bottom, pt.y + a.offset[1]);
});

/* a tiny DOM: elements are plain objects; style/rect are injected */
function el(over, children = []) {
  const e = Object.assign({ children, text: '', control: false, pos: 'absolute', pe: 'auto', rect: R(0, 0, 0, 0) }, over);
  e.matches = () => e.control;
  e.querySelector = () => (function find(c) { for (const x of c) { if (x.control) return x; const f = find(x.children); if (f) return f; } return null; })(e.children);
  Object.defineProperty(e, 'textContent', { get: () => e.text + e.children.map((c) => c.textContent).join('') });
  return e;
}
const deps = {
  style: (e) => ({ display: 'block', visibility: 'visible', opacity: '1', position: e.pos, pointerEvents: e.pe }),
  rect: (e) => e.rect,
};

test('obstacle discovery: interactive/text overlays count; layers and pass-through wrappers are looked through', () => {
  const button = el({ control: true, rect: R(10, 10, 60, 60) });
  const credit = el({ text: 'credit', rect: R(500, 780, 700, 800) });
  const inert = el({ rect: R(300, 300, 360, 360) });                       /* positioned, no control, no text */
  const hidden = el({ control: true, rect: R(0, 0, 0, 0) });                /* not laid out */
  const wrapper = el({ pe: 'none', rect: R(0, 0, 200, 200) }, [el({ control: true, rect: R(100, 100, 150, 150) })]);
  const mapLayer = el({ rect: R(0, 0, 1200, 800) }, [el({ control: true, rect: R(900, 100, 1000, 140) })]);
  const pin = el({ control: true, rect: R(590, 360, 620, 400) });
  const root = { children: [button, credit, inert, hidden, wrapper, mapLayer, pin], ownerDocument: { body: { children: [] } } };
  const got = collectObstacles(root, bounds, [pin], deps);
  const keys = got.map((r) => r.left + ',' + r.top).sort();
  assert.deepEqual(keys, ['10,10', '100,100', '500,780', '900,100'].sort());
});

test('a non-positioned element is not an obstacle itself (its children are asked)', () => {
  const inner = el({ control: true, rect: R(5, 5, 25, 25) });
  const flow = el({ pos: 'static', rect: R(0, 0, 100, 100) }, [inner]);
  const got = collectObstacles({ children: [flow], ownerDocument: { body: { children: [] } } }, bounds, [], deps);
  assert.equal(got.length, 1);
});

test('a visible surface participates even when its content owns the pointer events', () => {
  const rect = R(200, 100, 520, 300);
  const surface = el({ pos: 'static', pe: 'none', rect });
  surface.hasAttribute = name => name === 'data-overlay-obstacle';
  const root = { children: [surface], ownerDocument: { body: { children: [] } } };
  assert.deepEqual(collectObstacles(root, bounds, [], deps), [rect]);
});

test('map-ui wires the placement and the pin; the tools host with one section draws no heading', () => {
  const src = readFileSync(new URL('../js/map-ui.js', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*\bchoosePlacement\b[^}]*\} from '\.\/geo-engine\.js'/);
  assert.match(src, /_standPin\(lngLat,name\)/);
  assert.match(src, /anchor:_pl\.anchor,offset:_pl\.offset/);
  assert.match(src, /bare=secs\.length===1/);
  assert.match(src, /const body=direct\?root:/);
});
