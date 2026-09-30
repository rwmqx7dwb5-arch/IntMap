/* ============================================================================
 *  shell-map-input-checks — pointer, touch and click routing on the map — phones first
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r231-checks.test.mjs
 *  tests/r252-checks.test.mjs
 *  tests/r207-checks.test.mjs
 *  tests/r210-checks.test.mjs
 *  tests/r498-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';
import { installDevice } from './helpers/ui-device.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* ⚠⚠ A NEGATIVE CHECK MUST READ CODE, NOT PROSE — and this file proved it on its first run. Five of
   the assertions below failed against a correct tree because the thing they were looking for is
   quoted in the COMMENT that explains its removal: `#0a0a0c`, the magnifier, `monitors:'tab.monitors'`
   and `{timeout:2000}` are all named in the note that says they are gone. #R208 and #R229 hit exactly
   this ("a check whose regex matches its own comment"), so the rule is now a helper: strip comments,
   then match syntax. */
const noJs = (p) => codeOnly(read(p));
const noCss = (p) => codeOnly(read(p), { lang: 'css' });

/* ── ④ the bottom sheet's two behaviours ────────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R231 sheet: a full sheet swallows the map TAP and keeps the hover', () => {
  const src = read('js/mobile-ui.js');
  assert.match(src, /window\.addEventListener\('click',[\s\S]{0,400}?closest\('#map'\)[\s\S]{0,200}?setDetent\('half'\)/, 'a capture-phase click swallow lowers the sheet');
  assert.match(src, /window\.addEventListener\('contextmenu'/, 'and the long-press with it');
  /* ⚠ THE NEGATIVE IS THE POINT: neither CSS answer may appear, because both take the hover away. */
  const css = read('css/intmap.css');
  assert.ok(!/\.m-tap-guard\{/.test(noCss('css/intmap.css')) && !/m-tap-guard/.test(noJs('js/mobile-ui.js')), 'no transparent catcher over the map');
  assert.ok(!/body\.sheet-full\s+#map\{[^}]*pointer-events:none/.test(css), 'and #map keeps its pointer events');
});

/* spelling kept: browser script (js/mobile-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R231 sheet: the scroll → drag hand-off is delegated, not a list of tab ids', () => {
  const src = read('js/mobile-ui.js');
  assert.ok(!/'live-news-feed','info-dashboard','monitors-feed','community-feed','news-reader-pane'/.test(noJs('js/mobile-ui.js')),
    'the five hard-coded feed ids are gone');
  assert.match(src, /function scrollerUnder\(/, 'the nearest scrollable ancestor is found at touchstart');
  assert.match(src, /sidebar\.addEventListener\('touchstart'/, 'one delegated listener on the sheet');
  assert.match(src, /sc\.scrollTop>0/, 'content that can still scroll keeps the gesture');
});
}

/* ═══════════════════════ #R252 · from r252-checks.test.mjs ═══════════════════════ */
/* (#R252 — the round's own account of why these checks exist heads its other half, in tests/shell-map-labels-checks.test.mjs) */
{

/* ── ⑥ THE PILL IS LAID OUT AGAINST A GEOMETRY THAT HAS STOPPED MOVING ───────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('#R252 ⑥ the search-pill watcher re-runs when the right panel has finished moving', () => {
  const mo = code(read('js/mobile-ui.js'));
  assert.match(mo, /\['transitionend','transitioncancel'\]\.forEach\(ev=>hud\.addEventListener\(ev,\(e\)=>\{ if\(!e\|\|e\.propertyName==='right'\) upd\(\); \}\)\)/,
    'the watcher does not re-run on the HUD’s own transition — the one recomputation it gets reads the pre-slide geometry');
  /* the early recomputation is KEPT: it is what moves the pill at the start of the animation */
  assert.match(mo, /window\.addEventListener\('intmap-sidebar-resize',upd\)/,
    'the immediate recomputation was removed — the pill would not move until the animation ended');

  /* the property this hangs on is the one the stylesheet animates */
  assert.match(code(read('css/intmap.css'), { lang: 'css' }), /\.map-controls-top[^{]*\{ *transition:right \.38s/,
    'the right-anchored HUD no longer transitions `right` — re-derive which event says «it has landed»');
  /* …and js/map-ui.js still fires the early one from BOTH doors of the right panel (the third
     dispatch in that file belongs to the panel's own drag-resizer, which resizes nothing else) */
  const mu = code(read('js/map-ui.js'));
  for (const fn of [/function open\(\)\{[\s\S]*?new Event\('intmap-sidebar-resize'\)/,
                    /function close\(\)\{[\s\S]*?new Event\('intmap-sidebar-resize'\)/]) {
    assert.match(mu, fn, 'the layer sidebar’s open() and close() must both announce the change');
  }
});
}

/* ═══════════════════════ #R207 · from r207-checks.test.mjs ═══════════════════════ */
/* (#R207 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ── ⑥ the engine records which layers are clickable ───────────────────────────────────────────── */
/* spelling kept: browser script (js/geo-engine.js, js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ⑥ click-wired layers are recorded by the contract and used to rank the label click', () => {
  const e = read('js/geo-engine.js');
  // Registration/ownership semantics are executed with the real engine and both readers in
  // r709-historical-click-coverage-checks. Pinning a three-argument implementation here hid
  // the distinction between a click listener and a listener that owns the click.
  assert.ok(/clickLayers:\(options\)=>_clickOwnership\.layers\(options\)/.test(e), 'the shared inventory remains exposed');
  const u = read('js/map-ui.js');
  assert.ok(/function _ownedByOther\(pt\)/.test(u), 'the label side asks the question');
  assert.ok(/\.filter\(id=>ALL_LBL\.indexOf\(id\)<0\)/.test(u),
    'and excludes the label layers themselves — otherwise no label would ever be clickable');
  /* all three routes into the popup must apply it */
  assert.equal((u.match(/_ownedByOther\(/g) || []).length >= 4, true,
    'the per-layer place handler, the geo-label handler and the padded fallback all consult it');
});
}

/* ═══════════════════════ #R210 · from r210-checks.test.mjs ═══════════════════════ */
/* (#R210 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const rd = read;

/* spelling kept: browser script (js/geo-engine.js, js/map-ui.js, js/data-layers.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R210 ③: a click can be claimed, and the label side asks after everyone else has run', () => {
  const eng = rd('js/geo-engine.js');
  assert.match(eng, /claimClick:\(e\)=>_claimClick\(e\), clickClaimed:\(e\)=>_clickClaimed\(e\)/,
    'the contract publishes both halves');
  assert.match(eng, /_claimedOE===oe/, 'the test is DOM-event identity, not a time window');
  assert.doesNotMatch(eng, /_claimedT|Date\.now\(\)-_claimed/, 'a timer here would swallow a later click');

  const ui = rd('js/map-ui.js');
  assert.match(ui, /function _deferLabel\(e,fn\)\{[\s\S]{0,400}?Promise\.resolve\(\)\.then\(/,
    'the label popup is deferred by a microtask — that is what "after every listener" means');
  /* all three routes into the same popup have to yield, or the defect survives on one of them */
  const routes = [...ui.matchAll(/_deferLabel\(/g)].length;
  assert.ok(routes >= 3, `all three label routes defer; found ${routes}`);

  /* and the owners actually claim */
  for (const [f, why] of [['js/data-layers.js', 'aircraft'], ['js/satellites-live.js', 'satellites'],
    ['js/seismic.js', 'the seismic panel'], ['js/tsunami.js', 'the tsunami read-out'],
    ['js/terrain-water.js', 'the terrain brush']]) {
    assert.match(rd(f), /claimClick&&[^;]{0,40}claimClick\(e\)/, `${why} claims the click it consumes`);
  }
});
}

/* ═══════════════════════ #R498 · from r498-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R498 — 「スマホで地図が指に付いてこない」: the input path was measuring the DOM per finger event
 * ----------------------------------------------------------------------------
 *  Two hot paths, one shape, and a third fact that let both of them live for a very long time.
 *
 *  ① THE LONG-PRESS HANDLER read `canvas.getBoundingClientRect()` on EVERY `touchmove`, to compute
 *     `clientX − rect.left − (startClientX − rect.left)` — i.e. to subtract a number from itself.
 *     And it kept reading it after the press had already been abandoned, because the early-exit
 *     tested a variable `cancel()` never cleared. One touchstart + 100 touchmoves = 101 layout reads.
 *  ② THE CROSSHAIR TASK, registered in js/runtime.js's WRITE phase, wrote `display` on two elements
 *     and THEN read `getBoundingClientRect()` and `getComputedStyle()` — a forced synchronous
 *     layout, on the phone, on every camera frame, inside the one structure the whole runtime exists
 *     to prevent (its header: "READS BEFORE WRITES … so that the layout that used to be recomputed
 *     N times a frame is recomputed once").
 *  ③ AND NO INSTRUMENT IN THIS REPOSITORY COULD SEE EITHER OF THEM. scripts/mobile-trace.mjs drives
 *     「pan」 and 「zoom」 through `IntMapGeoEngine.camera` — #R352's correct fix for a synthesised
 *     MOUSE — which produces no touchstart, no touchmove and no pinch. Every mobile fps number this
 *     repo owns was taken with the app's touch handlers never once invoked.
 *
 *  ⚠ ① AND ② RUN THE SHIPPED CODE. js/mobile-map-input.js is EXECUTED — the real factory, from the
 *  real file — against a fake canvas, a fake container, a fake host and a fake camera register that
 *  COUNT the layout questions. A regex can tell you the call is gone from a line; only running it
 *  can tell you the handler still cancels the press, still fires the menu at 550 ms, and asks the
 *  DOM once. ④ does the same to js/geo-engine.js's hover hub. Everything read as text is read
 *  through `codeOnly`, so this file's own prose can never be what a check matches (#R345).
 *
 *  ⚠ THE SURFACE LEFT THE SHELL ON THE WAY. #R498's comments cost js/app-body.js 124 lines against
 *  a budget (tests/r168 #8, tests/r479 ⑧) that had ONE line of headroom, so the long-press, the
 *  crosshair, the centre readout and the "Add point" pill moved to js/mobile-map-input.js whole —
 *  the remedy #R311 used for the hover tooltip, and the one #R194's rule requires.
 * ==========================================================================*/
{
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/** run the REAL js/mobile-map-input.js in `g` and return the factory's API for `HOST` */
function mobileInput(g, HOST) {
  g.window = g;
  vm.createContext(g);
  vm.runInContext(R('js/mobile-map-input.js'), g, { filename: 'mobile-map-input.js' });
  assert.ok(g.window.IntMapModules && g.window.IntMapModules.mobileMapInput,
    'js/mobile-map-input.js no longer registers its factory on window.IntMapModules');
  return g.window.IntMapModules.mobileMapInput(HOST);
}

/** the source of the balanced `{…}` / `(…)` region that starts at `i` */
function balanced(src, i, open, close) {
  let d = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === open) d++;
    else if (c === close) { d--; if (!d) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced from ' + i);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ① THE LONG-PRESS HANDLER, RUN
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function longPressRig() {
  const counts = { rect: 0, menus: 0 };
  const listeners = {};
  const canvas = {
    getBoundingClientRect() { counts.rect++; return { left: 12, top: 34, width: 390, height: 700 }; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  let timerFn = null;
  const g = {
    setTimeout: (fn) => { timerFn = fn; return 7; },
    clearTimeout: () => { timerFn = null; },
    Math, console,
  };
  g.IntMapGeoEngine = { render: { canvas: () => canvas }, coords: { unproject: () => ({ lng: 1, lat: 2 }) } };
  const API = mobileInput(g, { toolMode: null, showContextMenu: () => { counts.menus++; } });
  API.longPress();
  assert.ok(listeners.touchmove && listeners.touchstart,
    'longPress() registered no touch listeners — the surface is mounted but inert');

  const fire = (type, touches, cancelable = true) => {
    for (const fn of listeners[type] || []) fn({ touches, cancelable, preventDefault() {} });
  };
  return { counts, fire, fireTimer: () => { const f = timerFn; timerFn = null; if (f) f(); }, timer: () => timerFn };
}

test('R498 ① a finger drag asks the canvas for its box ONCE, not once per touchmove', () => {
  const rig = longPressRig();
  rig.fire('touchstart', [{ clientX: 200, clientY: 300 }]);
  assert.equal(rig.counts.rect, 1, 'touchstart takes the one measurement it needs');

  /* a hundred finger events, well past the 12 px threshold */
  for (let i = 1; i <= 100; i++) rig.fire('touchmove', [{ clientX: 200 + i * 2, clientY: 300 + i }]);

  assert.equal(rig.counts.rect, 1,
    `the canvas box was measured ${rig.counts.rect} times across one touchstart and 100 touchmoves — `
    + 'a forced layout per finger event is back on the drag path');
  assert.equal(rig.timer(), null, 'moving past the threshold must still cancel the long-press timer');
});

test('R498 ① the press still fires at rest, and a 12 px move still cancels it', () => {
  /* held still → the menu opens, at the CANVAS-relative point (unproject wants that, not client) */
  const a = longPressRig();
  a.fire('touchstart', [{ clientX: 200, clientY: 300 }]);
  a.fire('touchmove', [{ clientX: 205, clientY: 303 }]);          /* 5.8 px — under the threshold */
  assert.ok(a.timer(), 'a small wobble must not cancel the press');
  a.fireTimer();
  assert.equal(a.counts.menus, 1, 'the long-press menu no longer opens');

  /* and the threshold itself is unchanged: 12 px cancels, 11.9 px does not */
  const b = longPressRig();
  b.fire('touchstart', [{ clientX: 0, clientY: 0 }]);
  b.fire('touchmove', [{ clientX: 11, clientY: 4 }]);             /* 11.70 px */
  assert.ok(b.timer(), '11.7 px cancelled the press — the threshold moved');
  b.fire('touchmove', [{ clientX: 12, clientY: 5 }]);             /* 13.00 px */
  assert.equal(b.timer(), null, '13 px did not cancel the press — the threshold moved');

  /* two touches are not a long press, and must not arm anything */
  const c = longPressRig();
  c.fire('touchstart', [{ clientX: 1, clientY: 1 }, { clientX: 9, clientY: 9 }]);
  assert.equal(c.counts.rect, 0, 'a two-finger start measured the canvas for a press it will not arm');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ② THE CROSSHAIR TASK, RUN
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function crosshairRig({ mobile = true } = {}) {
  const counts = { rect: 0, style: 0, display: 0, readout: 0 };
  const el = (id) => {
    const e = {
      id, _style: {}, children: [],
      style: {
        setProperty() {}, getPropertyValue() { return ''; },
        set display(v) { counts.display++; e._style.display = v; },
        get display() { return e._style.display; },
      },
      getBoundingClientRect() { counts.rect++; return { left: 0, top: 0, width: 390, height: 844 }; },
      appendChild(c) { e.children.push(c); return c; },
      addEventListener() {}, removeEventListener() {},
    };
    return e;
  };
  const mc = el('map-container');
  const tasks = [];
  const g = {
    document: {
      getElementById: (id) => (id === 'map-container' ? mc : null),
      createElement: (t) => el(t),
      head: { appendChild() {} },
      body: { className: '', appendChild() {} },
    },
    getComputedStyle: () => { counts.style++; return { getPropertyValue: () => '120px' }; },
    ResizeObserver: function RO(cb) { this.cb = cb; this.observe = () => {}; this.disconnect = () => {}; },
    setTimeout: () => 0,
    Math, console,
  };
  g.IntMapGeoEngine = { hasRenderer: () => true, coords: { unproject: () => ({ lng: 5, lat: 6 }) }, events: { on() {} } };
  g.IntMapRuntime = { onCamera: (key, fn, opts) => tasks.push({ key, fn, phase: (opts && opts.phase) || 'write' }) };
  g.IntMapLang = { t: (l, en) => en };
  g.addEventListener = () => {};
  g.matchMedia = () => ({ matches: mobile });
  installDevice(g);   /* (ui-layer-owner) js/ asks window.IntMapDevice now — the real owner, wired to this fake */
  const HOST = {
    isMobile: () => mobile,
    toolMode: null, lang: 'en', lastElev: '',
    renderCoordReadout: () => { counts.readout++; },
    demElevAt: () => null,
    elevText: () => '',
    updateLayerReadout: () => {},
    handleMapClick: () => {},
    showContextMenu: () => {},
  };
  mobileInput(g, HOST).crosshair();

  const frame = () => {
    for (const t of tasks) if (t.phase === 'read') t.fn();
    for (const t of tasks) if (t.phase !== 'read') t.fn();
  };
  return { counts, tasks, frame, g, mc };
}

test('R498 ② the crosshair samples in the READ phase and writes in the WRITE phase', () => {
  const rig = crosshairRig();
  const read = rig.tasks.filter((t) => t.phase === 'read');
  const write = rig.tasks.filter((t) => t.phase !== 'read');
  assert.equal(read.length, 1, 'the crosshair registered no read-phase sampler');
  assert.equal(write.length, 1, 'the crosshair registered no write-phase applier');
  assert.ok(read[0].key.startsWith('shell.crosshair'), 'the read half is not the crosshair');
});

test('R498 ② a camera frame costs ZERO forced layout reads once the box is known', () => {
  const rig = crosshairRig();
  rig.frame();
  const after1 = { rect: rig.counts.rect, style: rig.counts.style };
  assert.ok(after1.rect <= 1, `the first frame measured the container ${after1.rect} times`);

  for (let i = 0; i < 60; i++) rig.frame();
  assert.equal(rig.counts.rect, after1.rect,
    `sixty camera frames measured the container ${rig.counts.rect - after1.rect} extra times — `
    + 'getBoundingClientRect is back on the per-frame path');
  assert.equal(rig.counts.style, after1.style,
    `sixty camera frames asked getComputedStyle ${rig.counts.style - after1.style} extra times — `
    + 'a style recalculation per frame is back on the phone');
  assert.ok(rig.counts.readout >= 61, 'the readout stopped being written — the work was dropped, not moved');
});

test('R498 ② an unchanged display value is not re-assigned', () => {
  const rig = crosshairRig();
  rig.frame();
  const d = rig.counts.display;
  for (let i = 0; i < 30; i++) rig.frame();
  assert.equal(rig.counts.display, d,
    `thirty frames wrote style.display ${rig.counts.display - d} times with nothing changing — `
    + 'an identical assignment still invalidates layout (#R311)');
});

test('R498 ② the sheet cover is re-read when the sheet actually moves', () => {
  const rig = crosshairRig();
  rig.frame();
  const s0 = rig.counts.style;
  rig.frame();
  assert.equal(rig.counts.style, s0, 'a still sheet must not be re-measured');
  /* the inline declaration js/mobile-ui.js writes is what changes while the sheet is dragged */
  rig.mc.style.getPropertyValue = () => '240px';
  rig.frame();
  assert.ok(rig.counts.style > s0,
    'the crosshair kept a stale --sheet-cover after the sheet moved — the cache has no invalidation');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ③ THE DEVICE QUESTION IS ASKED WITH ONE PREDICATE — AND THE CAPABILITY IS NOT TOUCHED
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* spelling kept: browser script (js/app-body.js, src/main.js, js/map-readout.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R498 ③ every phone-COST gate asks the device; the phone-CAPABILITY gate still asks the width', () => {
  const b = CODE('js/app-body.js');
  assert.match(b, /const _imPhoneClass=\(\)=>/, 'the one device predicate is gone');
  assert.doesNotMatch(b, /_imPhoneGPU/, 'the old narrower name survives — two owners for one question');

  /* #R232's three, under the new name */
  assert.match(b, /antialias:!_imPhoneClass\(\)/, 'MSAA follows the device');
  assert.match(b, /pixelRatio:\(_imPhoneClass\(\)\?Math\.min\(2,window\.devicePixelRatio/, 'so does the DPR cap');
  /* ⚠ (#R671) THIS USED TO FIX THE SPELLING OF THE CALL, and it went red when the budget became a
     named function — a correct implementation reported as a defect (#R488 / #R429's shape). The
     claim is that the resident-tile budget is decided BY THE DEVICE, so resolve whatever is passed
     and ask what decides inside it. Writing `_tileCacheMax()` into the pattern instead would stay
     green if that function went back to asking the width. */
  const mtc = /maxTileCacheSize:([^,]+),/.exec(b);
  assert.ok(mtc, 'the map options must still set a resident-tile budget');
  const fn = /^\s*([A-Za-z_$][\w$]*)\(\)\s*$/.exec(mtc[1]);
  const decides = fn
    ? b.slice(b.indexOf('function ' + fn[1] + '()')).split(/\r?\n/)[0]
    : mtc[1];
  assert.ok(decides && /_imPhoneClass\(\)/.test(decides), 'the resident-tile budget must ask the device');
  assert.doesNotMatch(decides, /isMobile\(\)|matchMedia\('\(max-width/,
    'the resident-tile budget must not ask the width — landscape is the same phone');
  /* …and #R498's five, which a phone held sideways was paying in full */
  assert.match(b, /if\(_imPhoneClass\(\)\) return false;/, 'the @2x tile decision follows the device');
  assert.match(b, /if\(_imPhoneClass\(\)\) return \[4096,4096\]/, 'so does the canvas RAM guard');
  assert.match(b, /const _DEM_CACHE_MAX=_imPhoneClass\(\)\?140:560/, 'so does the DEM cache cap');
  assert.match(b, /hasRenderer\(\)\|\|_imPhoneClass\(\)\) return;/, 'so does the DEM viewport prefetch');
  assert.match(b, /if\(_imPhoneClass\(\)\) return; \}catch\(_\)\{ \} RT\(\)\.frame\('shell\.occlusion'/,
    'so does the per-frame marker occlusion');

  /* ⚠ and the one that is a CAPABILITY stays where it was, deliberately — see the note beside it */
  assert.match(b, /maxZoom:\(isMobile\(\)\?18:19\)/,
    'the zoom ceiling was quietly moved onto the device test — that TAKES a level away from a '
    + 'landscape phone, which is a capability change and was answered "leave it at 19"');
  /* ⚠ (#R498) …and the surface that gained those comments is OUT OF THE SHELL, not squeezed into it.
     tests/r479 ⑧ budgets index.html + src/main.js + src/vendor.js + js/app-body.js + js/geo-engine.js
     + js/lazy-modules.js at < 8,050 lines and origin/main stood at 8,049 — one line. A round that
     "pays" a budget like that by trimming the explanation of the defect it just fixed has removed
     the only durable part of the fix. */
  assert.doesNotMatch(b, /Long-press → context menu on touch devices/,
    'the long-press block is back in the shell');
  assert.match(b, /IM_MOBIN\.longPress\(\);/, 'and it is mounted from the position it occupied');
  assert.match(b, /IM_MOBIN\.crosshair\(\);/, 'so is the crosshair half');
  assert.match(CODE('src/main.js'), /import '\.\.\/js\/mobile-map-input\.js';/,
    'the module is not loaded, so both mounts would throw before the app finished starting');

  /* layout is still layout */
  assert.match(CODE('js/map-readout.js'), /function updateCoord\(lng,lat\)\{ if\(HOST\.isMobile\(\)\) return;/,
    'the desktop readout must keep asking the WIDTH — the crosshair readout is what replaces it, '
    + 'and it is width-gated too, so moving one without the other leaves a phone with neither');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ④ THE HOVER HUB, RUN
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function hubRig(nLayers = 30, { raf = true } = {}) {
  const GEO = R('js/geo-engine.js');
  const i = GEO.indexOf('_hoverHub(){');
  assert.ok(i > 0, 'the hover hub is no longer where this test slices it');
  const body = balanced(GEO, GEO.indexOf('{', i + 11), '{', '}');

  const counts = { getLayer: 0, layout: 0, query: 0, raf: 0 };
  const rafs = [], timers = [];
  const map = {
    getLayer: (id) => { counts.getLayer++; return { id }; },
    getLayoutProperty: () => { counts.layout++; return 'visible'; },
    queryRenderedFeatures: () => { counts.query++; return []; },
    on: () => {},
  };
  const g = {
    _m: () => map,
    /* ⚠ a HIDDEN document stops requestAnimationFrame — this project's headless preview is exactly
       that — so `raf:false` is not a hypothetical, it is the environment tests/*.spec.js run in. */
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    Map, Set, console,
  };
  if (raf) g.requestAnimationFrame = (fn) => { counts.raf++; rafs.push(fn); return rafs.length; };
  g.window = g;
  vm.createContext(g);
  const hub = vm.runInContext('(function(){ const o={ _hoverHub()' + body + ' }; return o._hoverHub(); })()',
    g, { filename: 'geo-engine.js#hoverHub' });

  for (let n = 0; n < nLayers; n++) { hub.regs.push({ type: 'mousemove', layer: 'lyr-' + n, cb: () => {} }); hub.dirty(); }
  return {
    hub, counts,
    drainRAF: () => { const q = rafs.splice(0); for (const f of q) f(); },
    drainTimers: () => { const q = timers.splice(0); for (const f of q) f(); },
  };
}

test('R498 ④ the hover hub asks the style for its layer list once, not once per pointer move', () => {
  const { hub, counts, drainRAF } = hubRig(30);
  hub.move({ point: { x: 1, y: 1 } });
  const l0 = counts.layout;
  assert.equal(l0, 30, 'the first move must build the list from the style');

  for (let i = 0; i < 50; i++) { hub.move({ point: { x: i, y: i } }); drainRAF(); }
  assert.equal(counts.layout, l0,
    `fifty pointer moves asked getLayoutProperty ${counts.layout - l0} extra times — the visible-layer `
    + 'list is being rebuilt on the pointer path again');
  assert.equal(counts.query, 51, 'the single query per move is unchanged (#R195)');

  /* …and a style change still moves it */
  hub.dirty();
  hub.move({ point: { x: 2, y: 2 } });
  assert.equal(counts.layout, l0 + 30, 'a style change did not invalidate the cached list');
});

test('R498 ④ the first move of a frame is still synchronous; only the extras coalesce', () => {
  const { hub, counts, drainRAF } = hubRig(3);
  hub.onMove({ point: { x: 1, y: 1 } });
  assert.equal(counts.query, 1, 'the first move must be delivered on the event that caused it (#R182)');

  /* three more inside the same frame → one delivery, of the LAST one, on the next frame */
  hub.onMove({ point: { x: 2, y: 2 } });
  hub.onMove({ point: { x: 3, y: 3 } });
  hub.onMove({ point: { x: 4, y: 4 } });
  assert.equal(counts.query, 1, 'a burst inside one frame ran the hit test more than once');
  drainRAF();
  assert.equal(counts.query, 2, 'the newest move in the burst was never delivered');

  /* the frame after that is quiet, so the queue disarms and the next move is synchronous again */
  drainRAF();
  hub.onMove({ point: { x: 5, y: 5 } });
  assert.equal(counts.query, 3, 'after a quiet frame the hub must go back to synchronous delivery');
});

test('R498 ④ a document whose rAF never fires must not swallow every later pointer move', () => {
  /* ⚠ this is the failure the coalescing could have introduced, and it is not hypothetical: a hidden
     document stops requestAnimationFrame, so a queue that only drains on a frame stays armed for
     ever and every move after the first is dropped — silently, which is the worst shape. */
  const { hub, counts, drainTimers } = hubRig(3, { raf: false });
  hub.onMove({ point: { x: 1, y: 1 } });
  assert.equal(counts.query, 1, 'the first move is synchronous with or without a frame loop');
  hub.onMove({ point: { x: 2, y: 2 } });
  drainTimers();
  assert.equal(counts.query, 2, 'the coalesced move was never delivered — the hub is wedged armed');
  drainTimers();
  hub.onMove({ point: { x: 3, y: 3 } });
  assert.equal(counts.query, 3, 'the hub never disarmed, so every later move is now swallowed');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ EVERY MAP-TOOLTIP MARKUP WRITE GOES THROUGH THE SETTER #R311 ADDED FOR IT
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* spelling kept: browser script (js/community-board.js, js/data-layers.js, js/layer-packs.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R498 ⑤ no hover handler assigns the map tooltip\'s innerHTML directly', () => {
  const FILES = ['js/community-board.js', 'js/data-layers.js', 'js/layer-packs.js', 'js/news-ui.js',
    'js/satellites-live.js', 'js/wb-layers.js', 'js/world-packs.js'];
  const offenders = [];
  for (const f of FILES) {
    const src = CODE(f);
    /* every place the tooltip element is obtained, and what happens in the 700 chars after it */
    /* the NAME bound to the tooltip element, then that name's own innerHTML — not any element's.
       js/layer-packs.js has a legend builder writing `d.innerHTML` 300 characters after a
       `mouseleave` handler that touches the tooltip, and a window-only scan calls that an offender. */
    const bind = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*ensureMapTooltip\b/g;
    for (let b; (b = bind.exec(src));) {
      const win = src.slice(b.index, b.index + 700);
      if (new RegExp('(^|[^\\w$.])' + b[1] + '\\.innerHTML\\s*=').test(win)) offenders.push(f + ' → ' + b[1] + '.innerHTML=');
    }
  }
  assert.deepEqual(offenders, [],
    'these rebuild the tooltip subtree on every mousemove even when the markup is identical, which '
    + 'is what makes positionTooltip\'s offsetWidth read a forced reflow — route them through '
    + `window.setMapTooltipHTML(el, html): ${offenders.join(' · ')}`);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ THE INSTRUMENT CAN SEE A FINGER
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* spelling kept: the claim is about the text of scripts/mobile-trace.mjs itself. */
test('R498 ⑦ the mobile trace drives at least one phase with real touch events', () => {
  const m = CODE('scripts/mobile-trace.mjs');
  assert.match(m, /Input\.dispatchTouchEvent/,
    'every phase is still camera-driven — the app\'s touch handlers are never invoked, so no number '
    + 'this instrument produces can contain them');
  for (const type of ['touchStart', 'touchMove', 'touchEnd']) {
    assert.ok(m.includes(`'${type}'`), `the gesture never sends ${type}`);
  }
  assert.match(m, /\{ x: cx - r, y: cy, id: 0 \}, \{ x: cx \+ r, y: cy, id: 1 \}/,
    'there is no two-finger gesture — a pinch is a pair of touch points, not a zoom command');
  assert.match(m, /await touched\('pan-touch'/, 'the warm pan is not driven by a finger');
  assert.match(m, /await touched\('pinch-touch'/, 'there is no pinch phase');
  assert.match(m, /await touched\('pan-alerts-city'/,
    'the alerts layer is still only measured with a whole-world pan');

  /* the counters are the point: fps cannot distinguish a forced layout from any other millisecond */
  assert.match(m, /Element\.prototype\.getBoundingClientRect = function/, 'forced-layout reads are not counted');
  assert.match(m, /window\.getComputedStyle = function/, 'style recalculations are not counted');
  assert.match(m, /rectPerMove/, 'the count is not normalised per finger event, so it cannot be compared');
  assert.match(m, /latP95/, 'the event-to-frame delay — the whole of 「指に付いてこない」 — is not reported');
});
}
