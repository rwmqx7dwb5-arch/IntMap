/* ============================================================================
 *  IntMap · window.IntMapDevice — which LAYOUT this screen gets, and which DEVICE it is  (ui-layer-owner)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-09-30 (code only, comments excluded, before this file): the phone/desktop boundary
 *  was written out 63 times in 37 js/ files — `matchMedia('(max|min-width:76x px)')` 34 times in 23
 *  files, `@media(max|min-width:…)` inside the CSS strings 18 modules inject 24 times, and the
 *  viewport width compared with 768 five times — beside `MOBILE_MQ` in js/app-body.js, which the 79
 *  `isMobile()` calls go through. The stylesheet drew the SAME boundary two ways: its other blocks
 *  at `max-width:768px` / `min-width:769px`, and six at `max-width:767px` / `min-width:768px`
 *  (scripts/ui-owners.mjs measures all of it). So at a viewport exactly 768 px wide the
 *  script said «phone» and the route panel, the navigation card, the photo-search sheet and the
 *  playground's touch targets said «desktop» — the route panel opened as a sheet with no drag
 *  (js/routing-ui.js asked the script) inside a desktop-shaped box (the stylesheet).
 *
 *  ══ TWO QUESTIONS, ONE OWNER ════════════════════════════════════════════════════════════════
 *  ① LAYOUT — «does this viewport get the phone layout (bottom sheet, crosshair, FAB stack)?»
 *     A WIDTH question, and `compact()` is its only answer. The boundary is `COMPACT` below and the
 *     stylesheet states the same one (`max-width:768px`, and `min-width:769px` for the other side);
 *     tests/ui-layer-owner-checks.test.mjs refuses any other spelling of that boundary in css/ and
 *     any width literal for it in js/. Injected CSS asks `media()`, so the number is here only.
 *     ⚠ A PHONE HELD SIDEWAYS (844 px) STILL GETS THE DESKTOP LAYOUT. That is the behaviour this
 *       file found and it is kept on purpose: CONSTITUTION §4 asks that nothing on the main map
 *       vanish, the desktop layout is the one that shows every control at that width, and #R498
 *       kept LAYOUT a width question on purpose (see its note by `isMobile` in js/app-body.js:
 *       moving the sheet/crosshair to the device would leave a landscape phone with NO readout).
 *       tests/r668.spec.js now holds both halves on one iPhone: a phone budget AND the desktop
 *       layout in landscape, a phone budget AND the phone layout upright. What
 *       changed is that the device is now NAMED — `kind()` says `phone-landscape` and <body>
 *       carries `im-dev-phone-landscape` — so a rule that needs to treat it differently reads the
 *       class instead of inventing a third width.
 *  ② DEVICE — «what hardware is this?» `phoneBudget()` is #R232/#R499's cost predicate (formerly
 *     `_imPhoneClass` in js/app-body.js, which still publishes that name for js/mem-budget.js and the
 *     thirty-nine cost decisions): a coarse primary pointer and either no fine pointer at all or a
 *     screen whose SMALLER side is ≤ 500 px. It includes a touch-only tablet on purpose — it is a
 *     budget, not a shape. `kind()` is the SHAPE, for layout rules that need one:
 *        phone            coarse primary pointer, smaller screen side ≤ 500 px, portrait
 *        phone-landscape  the same device held sideways
 *        tablet           coarse primary pointer, larger screen
 *        desktop          anything whose primary pointer is fine (a mouse, a trackpad — and a
 *                         touchscreen laptop, whose PRIMARY pointer is still the trackpad)
 *     `touchPrimary()` is #R25's wording predicate («tap» or «click»), unchanged.
 *
 *  ══ <body> CARRIES THE ANSWER ═══════════════════════════════════════════════════════════════
 *  `im-compact` (the layout), `im-dev-<kind>`, and `im-portrait` / `im-landscape`, kept current
 *  from the media queries' own `change` events — so a stylesheet rule that needs the device or the
 *  orientation together with the layout reads one class set rather than composing its own query.
 *
 *  ⚠ 500 px — OBSERVED: #R499 (DEV-NOTES) chose it as the smaller screen side of every phone in the
 *    reports (412, 390, 375) and below every tablet (≥ 744, iPad mini). EXPIRES IF: a phone ships
 *    with a CSS-pixel short side above 500 (foldables unfolded already are tablets here, correctly).
 *    SOURCE OF TRUTH: this file; js/app-body.js reads it through `phoneBudget`.
 *  ⚠ 768 px — OBSERVED: the boundary css/intmap.css has used since #10 (the Bootstrap/Tailwind `md`
 *    step) and every phone layout rule in this app is written against. EXPIRES IF: the layout is
 *    redesigned around a different step. SOURCE OF TRUTH: `COMPACT` here and the `@media` blocks of
 *    css/intmap.css, which the regression holds to the same number.
 * ==========================================================================*/
(function (G) {
  'use strict';
  if (G.IntMapDevice) return;

  const COMPACT = '(max-width:768px)';
  const WIDE = '(min-width:769px)';
  const PHONE_SHORT_SIDE = 500;

  const _mqs = Object.create(null);
  function mq(q) {
    if (_mqs[q] !== undefined) return _mqs[q];
    let m = null;
    try { m = (G.matchMedia && G.matchMedia(q)) || null; } catch (_) { m = null; }
    _mqs[q] = m;
    return m;
  }
  const is = (q) => { const m = mq(q); return !!(m && m.matches); };

  /* ① the layout */
  function compact() { return is(COMPACT); }
  /* the injected stylesheets' half of the same boundary */
  function media(css, wide) { return '@media' + (wide ? WIDE : COMPACT) + '{' + css + '}'; }

  /* ② the device */
  function coarse() { return is('(pointer:coarse)'); }
  function shortSide() {
    try { const s = G.screen || {}; return Math.min(+s.width || 0, +s.height || 0); } catch (_) { return 0; }
  }
  function phoneBudget() {
    try {
      if (!coarse()) return false;
      if (!is('(any-pointer:fine)')) return true;
      const m = shortSide();
      return m > 0 && m <= PHONE_SHORT_SIDE;
    } catch (_) { return compact(); }
  }
  function touchPrimary() {
    try { return coarse() && !is('(any-pointer:fine)'); } catch (_) { return compact(); }
  }
  function landscape() { return is('(orientation:landscape)'); }
  function kind() {
    if (!coarse()) return 'desktop';
    const m = shortSide();
    if (m > 0 && m <= PHONE_SHORT_SIDE) return landscape() ? 'phone-landscape' : 'phone';
    return 'tablet';
  }

  /* ③ (share-embed-distribution) THE PRESENTATION — «is this page a read-only EMBED in another site's
     frame (`?embed=1`)?» The third question about the screen, and like the other two it has ONE
     answer: <html data-embed>, which index.html's first script sets from the query before any module
     exists (js/embed-mode.js writes the grammar). Every start-up path that prepares something an
     embed cannot show — the default sidebar tab, the session written back, the account and data
     boot, the widget board, the layer-panel thumbnails, the Atlas warm-up, the phone sheet's camera
     padding — asks THIS, instead of each reading the query (or the attribute) its own way. */
  function embedded() {
    try { const d = G.document; return !!(d && d.documentElement && d.documentElement.hasAttribute('data-embed')); }
    catch (_) { return false; }
  }

  const KINDS = ['phone', 'phone-landscape', 'tablet', 'desktop'];
  const _subs = new Set();
  function state() { return { compact: compact(), kind: kind(), landscape: landscape() }; }
  function paint() {
    const b = G.document && G.document.body;
    if (!b || !b.classList) return;
    const s = state();
    b.classList.toggle('im-compact', s.compact);
    for (const k of KINDS) b.classList.toggle('im-dev-' + k, s.kind === k);
    b.classList.toggle('im-landscape', s.landscape);
    b.classList.toggle('im-portrait', !s.landscape);
  }
  function changed() {
    try { paint(); } catch (_) { }
    const s = state();
    _subs.forEach((fn) => { try { fn(s); } catch (_) { } });
  }
  /** fn(state) on every change of layout, device kind or orientation; returns an unsubscribe */
  function on(fn) { if (typeof fn === 'function') _subs.add(fn); return () => _subs.delete(fn); }

  let _wired = false;
  function wire() {
    if (_wired) return; _wired = true;
    for (const q of [COMPACT, '(pointer:coarse)', '(any-pointer:fine)', '(orientation:landscape)']) {
      const m = mq(q);
      if (!m) continue;
      try { m.addEventListener('change', changed); } catch (_) { try { m.addListener(changed); } catch (__) { } }
    }
    const d = G.document;
    if (d && d.body) paint();
    else if (d && d.addEventListener) d.addEventListener('DOMContentLoaded', paint, { once: true });
  }

  G.IntMapDevice = { COMPACT, WIDE, compact, media, phoneBudget, touchPrimary, landscape, kind, state, on, paint, embedded };
  wire();
})(typeof window !== 'undefined' ? window : globalThis);
