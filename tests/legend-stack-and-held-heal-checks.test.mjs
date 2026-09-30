/* ============================================================================
 *  legend-stack-and-held-heal — the two halves, EVALUATED
 * ----------------------------------------------------------------------------
 *  ① js/data-layers.js tileLegends() took its population from ONE spelling of the
 *     inline `display` (`'block'`, plus `'flex'` on phones only). The Köppen card is
 *     shown as `flex`, so on a desktop the stack was built as if it were not there:
 *     production at 1440×900, a first-time reader — Köppen y 74…559, the submarine
 *     cables y 546…737, 13 px on top of it; at 1280×720 wholly on its lower half.
 *     The function is lifted out of the shipped file and RUN on a fake DOM whose
 *     Köppen card sits where production measured it; the claim is about the boxes
 *     it leaves on screen, not about which words the source uses.
 *
 *  ② js/layer-rows.js holdUntilDrawable() re-sends a held `change` later — and
 *     re-sent it without the mark (`cb.__syn`) by which js/data-layers.js tells its
 *     own re-dispatches from the reader's. The reconciler's held «off» came back as
 *     the reader unticking, and the second half of its pulse stood down. The
 *     delivered change now carries the provenance of the change that set the state
 *     it carries (the latest one held). The gate is
 *     driven with fake boxes and a fake engine, and what the box's own listener sees
 *     DURING the delivered dispatch is recorded.
 *     (The other half of ② — the #R109 heal judging a box whose change had not been
 *     delivered — lives inside a closure that only a booted app builds; it is asked
 *     in tests/legend-stack-and-held-heal.spec.js, against the real app.)
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { sharedIds } from '../js/layer-manifest.js';
import { holdUntilDrawable } from '../js/layer-rows.js';
import { installDevice } from './helpers/ui-device.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DL = codeOnly(readLF(join(ROOT, 'js/data-layers.js')));
/* ⚠ with legendShown: the ONE answer to «is this legend on screen», which tileLegends and
   _minimizeOpenLegends both read (tests/cesium-koppen-and-boot-probe-checks.test.mjs ③) */
/* (legend-layout-frame) `tileLegends()` only asks for the next frame's placement; the placement is
   `placeLegends` and the population `discoverLegends`, lifted and evaluated at once */
const BODY = ['legendShown', 'discoverLegends', 'placeLegends'].map((n) => liftFunction(DL, n)).join('\n');

/* the identifiers the placer closes over in js/data-layers.js §legends */
const LGD = ['lgdHDI', 'lgdDem', 'lgdPop', 'lgdEEZ', 'lgdThermal', 'lgdRadar', 'lgdSST', 'lgdPopGrid',
  'lgdRelief', 'lgdSeaLevel', 'lgdGdppc', 'lgdTfr', 'lgdMil', 'lgdMilGDP', 'lgdSnow', 'lgdAod', 'lgdNightsat'];
const HELPERS = ['ensureLegendOpacity', 'ensureContourSwitch', 'ensureContourDensity', 'ensureLegendMinimize'];

/* ── the fixture DOM ─────────────────────────────────────────────────────────────────────────────
   A stacked legend's box is wherever the tiler WROTE it. A legend that keeps its own place is where
   its stylesheet holds it (`at`), and the tiler is expected not to write it at all. `css` is what a
   stylesheet makes of it: the computed display the page would report (default: the inline one, and
   `none` when there is none — .data-legend / .koppen-legend are `display:none` in their sheet). */
function makeLegend({ id, h, w = 200, display = 'block', css, own = false, at = null, generic = true }) {
  const el = {
    id, generic, natural: h, dataset: {}, classList: { contains: () => false }, style: { display }, css,
    get scrollHeight() { return el.natural; },
    getBoundingClientRect() {
      if (at) return { left: at.x, top: at.y, right: at.x + w, bottom: at.y + h, width: w, height: h };
      const cap = parseFloat(el.style.maxHeight);
      return { height: isFinite(cap) ? Math.min(el.natural, cap) : el.natural, width: w };
    },
  };
  if (own) el.dataset.ownPlace = '1';
  return el;
}

function run({ legends, mcH, mcW, mobile = false, ws = false }) {
  const byId = new Map(legends.map((el) => [el.id, el]));
  const container = { getBoundingClientRect: () => ({ left: 0, top: 0, height: mcH, width: mcW }) };
  const document = {
    getElementById: (id) => (id === 'map-container' ? container : byId.get(id) || null),
    getElementsByClassName: (c) => (c === 'data-legend generic-legend' ? legends.filter((el) => el.generic) : []),
    querySelector: () => null,
    body: { classList: { contains: (c) => (c === 'ws-mode' ? ws : false) } },
  };
  const window = { innerHeight: mcH, innerWidth: mcW, matchMedia: (q) => ({ matches: q === '(max-width:768px)' ? mobile : false }) };
  installDevice(window);   /* (ui-layer-owner) js/ asks window.IntMapDevice now — the real owner, wired to this fake */
  const getComputedStyle = (el) => ({
    display: el.css !== undefined ? el.css : (el.style.display || 'none'),
    getPropertyValue: () => '',
  });
  /* eslint-disable no-new-func */
  const make = new Function('document', 'window', 'getComputedStyle', ...LGD, ...HELPERS, BODY + '\nreturn placeLegends;');
  make(document, window, getComputedStyle, ...LGD.map(() => null), ...HELPERS.map(() => () => {}))();
}

/* a box in container coordinates: the fixture's own place, or what the tiler wrote */
function box(el, mcH) {
  const r = el.getBoundingClientRect();
  if (r.left !== undefined) return { x: r.left, y: r.top, right: r.right, bottom: r.bottom };
  const px = (v) => (v === undefined || v === 'auto' || v === '' ? null : parseFloat(v));
  const top = px(el.style.top), bottom = px(el.style.bottom);
  assert.ok(top !== null || bottom !== null, `#${el.id} was never placed`);
  const y = top !== null ? top : mcH - bottom - r.height;
  return { x: px(el.style.left), y, right: px(el.style.left) + r.width, bottom: y + r.height };
}
function overlaps(legends, mcH) {
  const B = legends.map((el) => [el.id, box(el, mcH)]);
  const out = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const [ia, a] = B[i], [ib, b] = B[j];
    const w = Math.min(a.right, b.right) - Math.max(a.x, b.x), h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (w > 0 && h > 0) out.push(`${ia} × ${ib}: ${w}×${h}`);
  }
  return out;
}

/* production's first-time reader: the Köppen card where its stylesheet holds it (measured 295 × 485
   from y 74 at both window sizes), shown as `flex`, in the dock's own left column — production had
   both at x 424 (the frosted sidebar's width + 24), this rig has no sidebar so both are at 24 —
   and the cables card, 200 × 191. */
const KOPPEN = () => makeLegend({ id: 'koppen-legend', h: 485, w: 295, display: 'flex', own: true, at: { x: 24, y: 74 }, generic: false });
const CABLES = () => makeLegend({ id: 'data-legend-subcables', h: 191 });

test('① the first-time reader\'s pair at 1440×900 and 1280×720: no overlap, and the Köppen card is not moved', () => {
  for (const [mcW, mcH] of [[1440, 877], [1280, 697]]) {
    const K = KOPPEN(), C = CABLES();
    run({ legends: [K, C], mcW, mcH });
    assert.deepEqual(overlaps([K, C], mcH), [], `${mcW}×${mcH}`);
    assert.deepEqual(K.style, { display: 'flex' }, 'the card that keeps its own place was written to');
  }
});

test('① (cont.) a busy stack walks past the Köppen card column by column, never onto it', () => {
  const mcW = 1280, mcH = 697;
  const K = KOPPEN();
  const rest = [106, 252, 178, 163, 191].map((h, i) => makeLegend({ id: 'data-legend-g' + i, h }));
  run({ legends: [K, ...rest], mcW, mcH });
  assert.deepEqual(overlaps([K, ...rest], mcH), []);
  for (const el of rest) {
    const b = box(el, mcH);
    assert.ok(b.y >= 0 && b.bottom <= mcH && b.x >= 0 && b.right <= mcW, `#${el.id} left the container: ${JSON.stringify(b)}`);
  }
});

test('① (cont.) room under the Köppen card is still used — the card is an obstacle, not a whole column', () => {
  /* folded to its title bar, it holds 40 px at the top; a short legend below it stays in its column */
  const K = makeLegend({ id: 'koppen-legend', h: 40, w: 295, display: 'flex', own: true, at: { x: 24, y: 74 }, generic: false });
  const E = makeLegend({ id: 'data-legend-eq', h: 106 });
  run({ legends: [K, E], mcW: 1440, mcH: 877 });
  assert.equal(E.style.left, '24px', 'the short legend was pushed out of the first column for no reason');
  assert.deepEqual(overlaps([K, E], 877), []);
});

test('① (cont.) on a phone the same card is a dock member like any other (the phone stylesheet docks it)', () => {
  const K = makeLegend({ id: 'koppen-legend', h: 120, w: 250, display: 'flex', own: true, generic: false });
  const C = CABLES();
  run({ legends: [K, C], mcW: 375, mcH: 812, mobile: true });
  assert.notEqual(K.style.top, undefined, 'the phone dock did not place the Köppen card');
  assert.deepEqual(overlaps([K, C], 812), []);
});

test('① (cont.) "on screen" is the page\'s answer, not a spelling of `display`', () => {
  /* a card shown as anything but `block` is stacked like the others … */
  const A = makeLegend({ id: 'data-legend-a', h: 150, display: 'grid' });
  const B = makeLegend({ id: 'data-legend-b', h: 150 });
  run({ legends: [A, B], mcW: 1440, mcH: 877 });
  assert.ok(A.style.bottom && B.style.bottom, 'a legend shown as `grid` was left out of the stack');
  assert.deepEqual(overlaps([A, B], 877), []);
  /* … a card whose stylesheet suppresses it (a flight, the route planner) is not stacked, and the
     reader's order is not forgotten for it — its OWNER has not closed it … */
  const S = makeLegend({ id: 'data-legend-s', h: 150, css: 'none' });
  S.dataset.legSeen = '12345'; S.dataset.legPinOpen = '1';
  const T = makeLegend({ id: 'data-legend-t', h: 150 });
  run({ legends: [S, T], mcW: 1440, mcH: 877 });
  assert.equal(S.style.bottom, undefined, 'a legend the page does not render was placed');
  assert.equal(T.style.bottom, '140px', 'an invisible card took a slot');
  assert.deepEqual([S.dataset.legSeen, S.dataset.legPinOpen], ['12345', '1'], 'a suppressed card lost the reader\'s choices');
  /* … and one its owner closed is forgotten, as before */
  const X = makeLegend({ id: 'data-legend-x', h: 150, display: 'none' });
  X.dataset.legSeen = '1'; X.dataset.legPinOpen = '1';
  run({ legends: [X], mcW: 1440, mcH: 877 });
  assert.equal(X.dataset.legSeen, undefined);
  /* `hidden` is the page's answer too */
  const Hd = makeLegend({ id: 'data-legend-h', h: 150 }); Hd.hidden = true;
  run({ legends: [Hd], mcW: 1440, mcH: 877 });
  assert.equal(Hd.style.bottom, undefined);
});

/* ── ② the gate keeps who made the change ──────────────────────────────────────────────────── */
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function engine() {
  const st = { can: false, wait: [] };
  const E = {
    hasRenderer: () => true, canDraw: () => st.can,
    whenCanDraw: () => (st.can ? Promise.resolve() : new Promise((r) => st.wait.push(r))),
  };
  st.release = () => { st.can = true; st.wait.splice(0).forEach((r) => r()); };
  return { E, st };
}
function gate(E) {
  const doc = { addEventListener(type, fn) { this.fn = fn; } };
  holdUntilDrawable(doc, () => E);
  /* a change dispatched the way data-layers.js's `fireSyn` does it: the mark is up only while it runs */
  return (b, syn) => {
    if (syn) b.__syn = (b.__syn || 0) + 1;
    try { const ev = { target: b, stopped: false, stopPropagation() { this.stopped = true; } }; doc.fn(ev); return ev.stopped; }
    finally { if (syn) b.__syn = Math.max(0, (b.__syn || 1) - 1); }
  };
}
function cbox(id, checked) {
  const b = Object.assign(new EventTarget(), { id, type: 'checkbox', checked });
  b.seen = [];
  /* what the reconciler's «was this the reader?» listener would read, at the moment it runs */
  b.addEventListener('change', () => b.seen.push({ checked: b.checked, own: !!b.__syn }));
  return b;
}
const [ID] = sharedIds();

test('② a held change that was the map\'s own is delivered as the map\'s own', async () => {
  const { E, st } = engine();
  const send = gate(E);
  const b = cbox(ID, true);
  /* the heal's pulse: off (its own), and the style comes back before its «on» */
  b.checked = false;
  assert.equal(send(b, true), true, 'held');
  st.release(); await flush();
  assert.deepEqual(b.seen, [{ checked: false, own: true }], 'the delivered «off» was read as the reader unticking');
  assert.equal(b.__syn, 0, 'the mark outlived the delivery');
});

test('② (cont.) the delivered change is WHOEVER SET THE STATE it carries — the latest held change', async () => {
  /* production's order: the reader ticks (held), then the heal's «off» is held behind it and the style
     comes back before the heal's «on». The state delivered is the heal's «off», so it is the heal's.
     ⚠ «the reader's if any held change was» delivered this as the reader unticking — measured, the
     box still ended unticked in the browser, 2 runs of 2. */
  {
    const { E, st } = engine();
    const send = gate(E);
    const b = cbox(ID, true);
    send(b, false);                        /* the reader ticks it */
    b.checked = false; send(b, true);      /* the map's own «off», held behind it */
    st.release(); await flush();
    assert.deepEqual(b.seen, [{ checked: false, own: true }]);
  }
  /* the other way round: the map's pulse, then the reader's own tick — the reader's */
  {
    const { E, st } = engine();
    const send = gate(E);
    const b = cbox(ID, false);
    send(b, true);                         /* the map's own «off» */
    b.checked = true; send(b, false);      /* the reader ticks it again */
    st.release(); await flush();
    assert.deepEqual(b.seen, [{ checked: true, own: false }]);
    assert.equal(b.__syn || 0, 0);
  }
  /* a reader's change alone stays the reader's (as before this change) */
  {
    const { E, st } = engine();
    const send = gate(E);
    const b = cbox(ID, true);
    send(b, false); st.release(); await flush();
    assert.deepEqual(b.seen, [{ checked: true, own: false }]);
  }
});
