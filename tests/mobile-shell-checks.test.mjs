/* ============================================================================
 *  IntMap · mobile-shell — the phone rebuilt as one sheet and one control group
 * ----------------------------------------------------------------------------
 *  MEASURED on production before (390 × 844, first visit): 45.2 % of the map under chrome, 14 of 21 tap
 *  targets under 44 px, two legend cards opened over the map by default and drawn ON TOP of the search
 *  results and of Chronos (all three at z 1100, legends appended last), and Layers / Tools / the base map /
 *  Chronos each a separate overlay.
 *
 *  What this file runs (the shipped module, imported as it is — js/mobile-sheet.js has no imports):
 *    ① the sheet's resting heights and where a released sheet goes
 *    ② the spring the sheet and the map's padding ride (one curve, two forms)
 *    ③ screens: an element is LENT to the sheet while its owner says it is open and handed back to the
 *       exact place it came from — nothing is rebuilt, so every id and handler is the same object
 *    ④ the legend tray counts what is switched on and opens nothing by itself
 *  and what it reads as text, because only the stylesheet can say it:
 *    ⑤ the phone's stacking order is three named rows of the one table, in the order legend < chrome < sheet
 *    ⑥ the legend set the tray hides is the set js/window-manager.js docks — one fact, two readers
 *  The laid-out page (coverage, tap targets, the tray, Chronos as a screen, the candidates) is measured in a
 *  browser by tests/ui-a11y-polish.spec.js ③.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import * as MS from '../js/mobile-sheet.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① detents ─────────────────────────────────────────────────────────────────────────────────── */
test('① four resting heights, lowest first, and the two lowest are measured from the head and the home indicator', () => {
  const h = MS.detentHeights({ H: 726, vh: 844, headH: 74, safeBottom: 34 });
  assert.deepEqual(MS.DETENTS, ['hidden', 'min', 'half', 'full']);
  assert.ok(h.hidden < h.min && h.min < h.half && h.half <= h.full, JSON.stringify(h));
  assert.equal(h.hidden, MS.GRIP_VISIBLE + 34, 'hidden leaves the grip and the home indicator, nothing else');
  assert.equal(h.min, 74 + 8 + 34, 'min is the search row, with the home indicator under it');
  assert.equal(h.half, Math.round(844 * MS.HALF_SHARE));
  assert.equal(h.full, 726);
  /* a tiny window cannot invert them */
  const t = MS.detentHeights({ H: 200, vh: 220, headH: 180, safeBottom: 0 });
  assert.ok(t.hidden <= t.min && t.min < t.half + 1 && t.half <= t.full, JSON.stringify(t));
});

test('① a flick goes ONE detent in its direction; a placement goes to the nearest', () => {
  const h = { hidden: 56, min: 116, half: 380, full: 726 };
  assert.equal(MS.settleDetent(116 + 150, -1.2, h), 'half', 'a flick up from between min and half goes to the next one above where it is');
  assert.equal(MS.settleDetent(380 + 20, -1.2, h), 'full', 'and from just above half, to full');
  assert.equal(MS.settleDetent(116, -1.2, h), 'half', 'a flick up from min is half, not full');
  assert.equal(MS.settleDetent(380, 1.2, h), 'min', 'a flick down from half is min');
  assert.equal(MS.settleDetent(116, 1.2, h), 'hidden', 'a flick down from min is hidden');
  assert.equal(MS.settleDetent(56, 1.2, h), 'hidden', 'and nothing is below hidden');
  assert.equal(MS.settleDetent(726, -2, h), 'full', 'and nothing is above full');
  assert.equal(MS.settleDetent(300, 0.1, h), 'half', 'a slow let-go is the nearest');
  assert.equal(MS.settleDetent(200, 0, h), 'min');
});

/* ── ② the spring ─────────────────────────────────────────────────────────────────────────────── */
test('② the spring starts at 0 with the finger\'s velocity, settles at 1, and its CSS form is the same curve', () => {
  for (const v0 of [0, 3, -2, 40]) {
    const s = MS.spring(v0);
    assert.equal(s.ease(0), 0); assert.equal(s.ease(1), 1);
    assert.ok(s.duration >= 0.24 && s.duration <= 1.1, `duration ${s.duration}`);
    const end = s.ease(0.98); assert.ok(Math.abs(end - 1) < 0.02, `not settled near the end (${end})`);
    /* the initial slope is the (clamped) velocity — a hard flick arrives sooner than a let-go */
    const dt = 1e-4, slope = s.ease(dt / s.duration) / dt, want = Math.max(-12, Math.min(12, v0));
    assert.ok(Math.abs(slope - want) < 0.05 * Math.max(1, Math.abs(want)) + 0.05, `initial velocity ${slope} for ${v0}`);
    assert.match(s.css, /^linear\(0, [-0-9., ]+, 1\)$/);
    const pts = s.css.slice(7, -1).split(',').map(Number);
    for (let i = 1; i < pts.length - 1; i++) {
      const at = s.ease(i / (pts.length - 1));
      assert.ok(Math.abs(pts[i] - at) < 1e-3, 'the CSS curve and the JS easing are not the same spring');
    }
  }
  assert.ok(MS.spring(6).ease(0.15) > MS.spring(0).ease(0.15), 'a flick is not faster than a let-go');
  const peak = Math.max(...Array.from({ length: 200 }, (_, i) => MS.spring(0).ease(i / 199)));
  assert.ok(peak < 1.02, `a let-go overshoots ${((peak - 1) * 100).toFixed(1)} % — that is a bounce, not a sheet`);
});

/* ── ③ screens ─────────────────────────────────────────────────────────────────────────────────── */
/* the smallest DOM the module touches: parentNode / insertBefore / appendChild / classList / comments */
function fakeDom() {
  class N {
    constructor(name) { this.name = name; this.parentNode = null; this.children = []; const cl = new Set(); this.classList = { add: (c) => cl.add(c), remove: (c) => cl.delete(c), contains: (c) => cl.has(c), toggle: (c, on) => { if (on === undefined ? !cl.has(c) : on) cl.add(c); else cl.delete(c); } }; }
    _detach() { if (this.parentNode) { const p = this.parentNode.children; p.splice(p.indexOf(this), 1); this.parentNode = null; } }
    appendChild(n) { n._detach(); this.children.push(n); n.parentNode = this; return n; }
    insertBefore(n, ref) { n._detach(); const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, n); n.parentNode = this; return n; }
  }
  globalThis.document = { createComment: (t) => new N('#' + t) };
  return N;
}

test('③ a screen is lent while its owner says open and handed back to the exact place it came from', () => {
  const N = fakeDom();
  const home = new N('home'), a = new N('a'), b = new N('b'), after = new N('after');
  home.appendChild(a); home.appendChild(b); home.appendChild(after);
  const host = new N('host'), sheet = new N('sheet');
  const state = { a: false, b: false }, log = [];
  const S = MS.makeScreens({ host, sheet, active: () => true, onChange: (top, how) => log.push([how, top && top.key]) });
  S.adopt(a, { key: 'a', isOpen: () => state.a, close: () => { state.a = false; S.syncAll(); } });
  S.adopt(b, { key: 'b', isOpen: () => state.b, close: () => { state.b = false; S.syncAll(); } });
  assert.equal(S.depth(), 0, 'nothing is lent while nothing is open');

  state.a = true; S.syncAll();
  assert.equal(a.parentNode, host); assert.ok(a.classList.contains('m-screen')); assert.ok(sheet.classList.contains('m-has-screen'));
  state.b = true; S.syncAll();
  assert.deepEqual(host.children.map((n) => n.name), ['a', 'b'], 'the newest screen is the last child (the only one drawn)');
  assert.equal(S.top().key, 'b');

  assert.ok(S.closeTop(), 'Back asks the top screen\'s owner to close it');
  assert.equal(S.top().key, 'a');
  assert.deepEqual(home.children.filter((n) => !n.name.startsWith('#')).map((n) => n.name), ['b', 'after'], 'b went back exactly where it was');
  state.a = false; S.syncAll();
  assert.deepEqual(home.children.filter((n) => !n.name.startsWith('#')).map((n) => n.name), ['a', 'b', 'after'], 'and so did a — the order of the home is unchanged');
  assert.ok(!sheet.classList.contains('m-has-screen')); assert.ok(!a.classList.contains('m-screen'));
  assert.deepEqual(log.map((x) => x[0]), ['open', 'open', 'close', 'close']);
  assert.equal(log[log.length - 1][1], null, 'the last close says nothing is on top');
});

test('③ off the phone layout nothing is lent, and crossing the line hands everything back', () => {
  const N = fakeDom();
  const home = new N('home'), a = new N('a'), host = new N('host'), sheet = new N('sheet');
  home.appendChild(a);
  let phone = true; const S = MS.makeScreens({ host, sheet, active: () => phone, onChange: () => {} });
  S.adopt(a, { key: 'a', isOpen: () => true, close: () => {} });
  assert.equal(a.parentNode, host);
  phone = false; S.syncAll();
  assert.equal(a.parentNode, home, 'widening the window gave it back');
});

/* ── ④ the legend tray ─────────────────────────────────────────────────────────────────────────── */
test('④ the chip counts the legends that are switched on, is hidden at none, and opens nothing by itself', () => {
  const kids = [];
  const mk = (cls, display) => ({ className: cls, style: { display }, hidden: false, isConnected: true, matches: (sel) => sel === MS.LEGEND_SEL && /legend/.test(cls) });
  const mc = { children: kids };
  const attrs = {}; const chip = { hidden: false, setAttribute: (k, v) => { attrs[k] = v; }, addEventListener: () => {} };
  const count = { textContent: '' };
  const body = new Set();
  globalThis.document = { body: { classList: { toggle: (c, on) => { if (on) body.add(c); else body.delete(c); }, contains: (c) => body.has(c) } } };
  globalThis.getComputedStyle = (el) => ({ display: el.style.display === 'none' ? 'none' : 'block' });
  const T = MS.makeLegendTray({ container: mc, chip, count, frame: (k, fn) => fn() });
  assert.equal(chip.hidden, true, 'no legend switched on — no chip');
  kids.push(mk('koppen-legend', 'flex'), mk('data-legend', 'none'), mk('sat-controller', 'block'), mk('data-legend', 'flex'));
  T.recount();
  assert.equal(T.count(), 2, 'two legends are on (a switched-off legend and a non-legend do not count)');
  assert.equal(chip.hidden, false); assert.equal(count.textContent, '2');
  assert.equal(T.isOpen(), false, 'switching a layer on does not open the tray over the map');
  T.open(); assert.equal(T.isOpen(), true); assert.equal(attrs['aria-expanded'], 'true');
  kids.forEach((k) => { k.style.display = 'none'; }); T.recount();
  assert.equal(chip.hidden, true); assert.equal(T.isOpen(), false, 'the last legend switched off closes the tray with it');
  delete globalThis.getComputedStyle;
});

/* ── ⑤ ⑥ what only the stylesheet can say ────────────────────────────────────────────────────── */
test('⑤ the phone\'s stacking order is three rows of the one table: legend < chrome < sheet, and each surface reads its row', () => {
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  const root = /:root\{ --z-inset:0;[^}]*\}/.exec(css); assert.ok(root, 'the stacking table is where it was');
  const z = (n) => +new RegExp('--z-' + n + ':(\\d+)').exec(root[0])[1];
  assert.ok(z('controls') < z('m-legend') && z('m-legend') < z('m-chrome') && z('m-chrome') < z('m-sheet') && z('m-sheet') < z('dropdown'),
    'the phone rows are out of order — a legend could cover a control again');
  assert.match(css, /\.m-fab-stack\{[^}]*z-index:var\(--z-m-chrome\)/);
  assert.match(css, /\.m-legend-chip\{[^}]*z-index:var\(--z-m-chrome\)/);
  assert.match(css, /#map-container > \[class\*="legend"\], #map-container > \[id\*="legend"\]\{ z-index:var\(--z-m-legend\) !important; \}/);
  assert.match(css, /z-index:var\(--z-m-sheet\)/, 'the sheet reads its row');
});

test('⑥ the legends the tray hides are the legends the dock moves — the same fact, read by both', () => {
  const wm = codeOnly(read('js/window-manager.js'));
  const dock = /const DOCK_SEL='([^']+)'/.exec(read('js/window-manager.js'));
  assert.ok(dock && wm.includes('DOCK_SEL'), 'js/window-manager.js no longer names its legend set');
  assert.equal(dock[1].replace(/:scope > /g, ''), MS.LEGEND_SEL, 'the tray and the dock disagree about what a legend is');
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  const hide = MS.LEGEND_SEL.split(', ').map((s) => 'body:not(.m-leg-open) #map-container > ' + s).join(', ');
  assert.ok(css.includes(hide + '{ visibility:hidden !important;'), 'the stylesheet hides a different set than the tray counts');
});
