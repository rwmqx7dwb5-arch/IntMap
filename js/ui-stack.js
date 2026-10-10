/* ============================================================================
 *  IntMap · window.IntMapStack — WHO IS IN FRONT, decided in one place  (ui-layer-owner)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-09-30 (static audit, before this file): «in front» had two owners that did not
 *  know about each other, and neither owned the numbers it used.
 *    · js/window-manager.js wrote an INLINE `z-index` counting up from 2200 and capped at 2599 onto
 *      every registered floating window on pointerdown (`WIN_Z_BASE`/`WIN_Z_CAP`, #R47/#R258);
 *    · js/map-ui.js moved the `.im-front` class (2650 !important in css/intmap.css) and toggled
 *      `body.im-float-front` on every pointerdown / wheel / focusin / keydown (#R253–#R258, #R508,
 *      front-mark-outer-context), and kept its own copy of 2650 as `_FRONT_Z`;
 *    · and outside both, js/ and the markup wrote 147 bare z-index numbers in 47 files — 72 distinct
 *      values from 1 to 2147483647 — while css/intmap.css had already moved to named layers.
 *  Two listeners on the same gesture, two copies of each number, and a stacking order nobody chose:
 *  #R258 was a window whose inline 4301 outlived the class that was meant to beat it, #R508 was the
 *  class sinking a dialog it was meant to raise, and #824 (front-mark-outer-context) was the class
 *  landing on an element whose parent's stacking context it could never leave.
 *
 *  ══ WHAT THIS FILE OWNS ═════════════════════════════════════════════════════════════════════
 *    z(name, step)   the CSS expression for a named layer of css/intmap.css (`var(--z-popup)`,
 *                    `calc(var(--z-popup) + 200)`) — for a style a module has to build at run time.
 *                    A literal string in a module's own CSS text says the same thing directly;
 *                    scripts/z-layers.mjs refuses a bare number and a layer name :root does not define.
 *    level(name)     the integer the stylesheet gives a layer, READ from the stylesheet.
 *    register(el) / order(el)   the order of the floating windows among themselves, inside the
 *                    `window` band and below `shell-front` (what `bringToFront` did in
 *                    js/window-manager.js, which still exports that name and now calls `order`).
 *    front(el) / back()   the ONE panel being used (`.im-front`, the `front` layer) and the
 *                    desktop sidebars' place above or below the windows (`body.im-float-front`).
 *    opened(el)      a surface an operation has just opened takes the mark from the panel the
 *                    operation was made in (else it opens under it — map-layer-system-chronos).
 *    wire()         the document listeners that call the two above on «some operation».
 *    panelOf(el)     the element that stands in the band for a gesture on `el`.
 *    clipOf(el)      the ancestor that CUTS `el` — the #823 shape (a result list under a pill whose
 *                    `overflow:hidden` clipped it), measured, so a regression can ask it.
 *
 *  ⚠ ONE LISTENER PER GESTURE. The window order used to be a pointerdown listener on each registered
 *    element and the front mark a document listener; both answered the same pointerdown. They are
 *    one capture-phase document listener now, which orders every registered window the gesture is
 *    inside (outermost first, so the innermost ends on top, as the per-element capture listeners
 *    did) and then moves the mark.
 *
 *  ⚠ NO NUMBER HERE. The band edges are read from css/intmap.css (`level`) and written back as
 *    `calc(var(--z-window) + n)`; the only integers this file produces are ranks.
 * ==========================================================================*/
(function (G) {
  'use strict';
  if (G.IntMapStack) return;
  const D = () => G.document;
  const cs = (n) => { try { return G.getComputedStyle(n); } catch (_) { return null; } };

  /* ── the named layers ─────────────────────────────────────────────────────────────────────── */
  function z(name, step) {
    const v = 'var(--z-' + name + ')';
    const s = Math.round(+step || 0);
    return s ? 'calc(' + v + (s > 0 ? ' + ' : ' - ') + Math.abs(s) + ')' : v;
  }
  function level(name) {
    try {
      const n = parseInt(G.getComputedStyle(D().documentElement).getPropertyValue('--z-' + name), 10);
      return Number.isFinite(n) ? n : NaN;
    } catch (_) { return NaN; }
  }

  /* ── the floating windows, ordered among themselves ───────────────────────────────────────── */
  const _win = new Set();
  let _order = [];   /* touched windows, oldest first */
  function register(el) {
    if (!el || _win.has(el)) return false;
    _win.add(el);
    wire();
    return true;
  }
  function isWindow(el) { return _win.has(el); }
  function order(el) {
    if (!el) return;
    try {
      _order = _order.filter((w) => w !== el && w.isConnected);
      _order.push(el);
      /* the room between the window band and the open sidebar — read, so the ceiling moves with
         the stylesheet (#R258: a window above `shell-front` can never be covered by a sidebar) */
      const room = level('shell-front') - level('window') - 1;
      _order.forEach((w, i) => {
        const k = Number.isFinite(room) && room > 0 ? Math.min(i + 1, room) : i + 1;
        w.style.zIndex = z('window', k);
      });
    } catch (_) { }
  }

  /* ── the front mark ─────────────────────────────────────────────────────────────────────────
     (ui-layer-owner) MOVED from js/map-ui.js with its reasoning, which follows verbatim — the
     rounds it records are why each line of the code below exists. */
  /* ══ ⚠ (#R253) FRONT-MOST FOLLOWS THE POINTER, NOT THE STYLESHEET ═══════════════════════════════
     「サイドバーをあけたときに、ポップアップ等がサイドバーの後ろに隠れるように。ポップアップ内で
       なんらかの操作したら、ポップアップが前部に来るように。サイドバー内をクリックした場合はまた
       サイドバーを前部に。」 The z-index band itself is in css/intmap.css beside the other
       `body.lsr-open` rules; this is the one bit of state it reads.
     ⚠ «A FLOATING PANEL» IS ASKED OF THE LAYOUT, NOT OF A LIST OF SELECTORS. Walking up for the
     first positioned ancestor catches every panel this app has and every one a later module adds —
     a hand-written list would be one more place to forget, which is the shape this project keeps
     paying for. The map's own canvas container is positioned too and is explicitly NOT a panel:
     clicking the map is what OPENS a popup, and the report says a fresh popup belongs BEHIND the
     sidebar. Capture phase, so a handler that stops propagation cannot hide the gesture. */
  /* ══ ⚠⚠ (#R254) …AND A MAP POPUP COULD NEVER COME TO THE FRONT, BECAUSE IT HAS NO z-index ═══════
     「ポップアップ内でなんらかの操作したら、ポップアップが前部に来るように。サイドバー内をクリック
       した場合はまたサイドバーを前部に。」 — reported again, and the half above is why. MEASURED on
     the shipped build: `getComputedStyle('.maplibregl-popup').zIndex` is **auto**, its parent is
     `#map`, and #map / #map-container / .operation-room are all `z-index:auto`, so a popup takes
     part in the ROOT stacking context at level 0. `body.im-float-front` drops the sidebar from
     2600 to its base **1000** — which is still above 0. So the demotion worked exactly as #R253
     measured it for the panels that carry an explicit z-index (legends 1100, popovers 1300-1500,
     cards 2200), and could not possibly work for a MapLibre popup.
     ⚠ DEMOTING THE SIDEBAR IS NOT ENOUGH; THE THING BEING USED HAS TO BE NAMED. The panel under
     the pointer is now marked `.im-front` and rises above the whole band on its own, whatever its
     own z-index was (or wasn't). One element carries the mark at a time — it moves with the
     pointer, and a pointerdown in a sidebar or on the map takes it away, which is the other two
     sentences of the instruction. */
  /* ══ ⚠ (#R255) THE SHELL IS NOT A PANEL, AND «SOME OPERATION» IS NOT ONLY A POINTERDOWN ═════════
     「ポップアップ内でなんらかの操作したら、ポップアップが前部に来るように。」— reported a third
     time. #R253 built the demotion and #R254 named the raised element; MEASURED on this build both
     do exactly what they say (a `.data-legend` goes 1100 → 2650 and the sidebar 2600 → 1000; a
     MapLibre popup goes `auto` → 2650 and back). Two holes were left, and both are «operations»:

     ① A WHEEL SCROLL AND A KEYSTROKE ARE NOT POINTERDOWNS. Reading a long card by scrolling it, or
        typing into a field inside it, are the plainest cases of 「なんらかの操作」 there are, and
        neither raised anything. `wheel` and `focusin` now count.
     ② `#map-container` AND `.operation-room` ARE `position:relative` (css/intmap.css), so they are
        positioned ancestors — and `panelOf` returns the FIRST one it finds. Anything inside the map
        shell that is not itself positioned and not under the canvas therefore resolved to the SHELL,
        and marking that `.im-front` puts the whole map (and every sidebar inside `.operation-room`)
        into one 2650 box. The walk now refuses the shell by name as well as the canvas. */
  /* ══ ⚠ (#R258) …AND A PANEL THAT SITS ABOVE THE BAND CAN NEVER BE COVERED BY THE SIDEBAR ════════
     「ポップアップ内でなんらかの操作したら、ポップアップが前部に来るように。左サイドバー内をクリック
       した場合はまた左サイドバーを前部に。」— a FOURTH time. MEASURED on this build, the mechanism
     #R254/#R255 built does work end to end: a pointerdown inside `#country-popup` takes it
     `auto → .im-front → 2650` with the sidebar at 1000; a pointerdown in the left sidebar puts it
     back (`popup 2200 / sidebar 2600`, and `elementFromPoint` over the overlap returns the
     sidebar's row); a wheel inside the popup raises it again. What it cannot do is cover a panel
     whose own z-index is ABOVE the band, and there was one: **`#compare-window` at 4000** — a
     draggable, resizable window, i.e. exactly the kind of thing one «reaches into», sitting
     permanently in front of both sidebars. It is in the card band (2200) now, so the sidebar
     covers it and `.im-front` raises it, like every other panel. See js/compare.js.
     Two more holes closed here:
     ① `keydown` counts as an operation. `focusin` fires once; a panel re-rendered under the
        caret (the trade / crop panels rebuild their body on every change) leaves the reader
        typing into something that never announced itself.
     ② A panel positioned `relative`/`sticky` WITH A Z-INDEX OF ITS OWN is a panel. `panelOf`
        only accepted `absolute`/`fixed`, so a pointerdown inside such a panel found nothing and
        took the DEMOTE branch — it pushed the panel being used behind the sidebar. A plain flow
        element has `z-index:auto` and is still skipped, which is what keeps this narrow.
        ⚠ Both sidebars are `relative` + `z-index:2600`, so they are named in `NOT_PANEL` as
        well as in `SHELL_SIDE`: they are the shell this band is measured against, never a
        panel inside it. */
  /* == (#R508) <FRONT-MOST> IS A RAISE. IT MUST NEVER LOWER ANYTHING ==========================
     「Terms of Service ・ Privacy Policy をクリックして読もうとしても、設定に邪魔されて読めない。」
     MEASURED on the shipped build: opening Terms from the Settings footer is correct (both
     overlays are `.modal-overlay` z-index 9999 and the legal one is later in the DOM, so it
     paints on top) — and ONE wheel notch inside the terms text sinks it behind Settings:

         afterOpen   legal 9999            / settings 9999
         afterWheel  legal 2650 .im-front  / settings 9999

     `#legal-modal` is `position:fixed`, so `panelOf` accepts it as «a floating panel» and marks
     it. `.im-front` is `z-index:2650 !important`, and !important beats the class's own 9999 —
     the mark that exists to bring a panel FORWARD pushed this one nine thousand levels BACK,
     under a dialog nobody had touched. EVERY dialog in this app is at 9999 and every one of them
     is marked the moment the reader scrolls, clicks or types inside it; it only becomes VISIBLE
     when two of them are stacked, which is exactly the Settings → Terms path the report names.
     ⚠ #R258 met the same shape from the other side (`#compare-window` at 4000 could never be
     COVERED by the sidebar) and answered it by moving that window down INTO the band. A modal
     cannot be moved into the band — it is above the band on purpose — so the invariant is stated
     here instead: a layer already above `.im-front`'s own level is not a member of this band, and
     the machinery neither raises nor demotes on account of it. Asked of the LAYOUT (#R253) rather
     than of a list of dialog ids, so every later overlay inherits the answer for free. */
  /* ⚠ (ui-layer-owner) the front level is READ from css/intmap.css (`--z-front`, which `.im-front`
     applies) — js/map-ui.js kept it as `_FRONT_Z=2650` beside the stylesheet's own, and
     tests/shell-css-surface-checks.test.mjs (#R508) existed to catch the two drifting apart. One
     number now, in the stylesheet. */
  const SHELL_SIDE = '.sidebar,#layer-sidebar-r,.btn-toggle-sidebar,#lsr-toggle';
  const NOT_PANEL = '#map,#map-container,.operation-room,.maplibregl-map,.maplibregl-canvas-container,'
    + '.maplibregl-control-container,canvas,.sidebar,#sidebar,#layer-sidebar-r';
  /* strictly ABOVE the band: a panel that currently carries the mark computes to exactly the front
     level and must stay demotable, so its own mark is skipped by class as well as by number. */
  function aboveBand(el) {
    const F = level('front');
    if (!Number.isFinite(F)) return false;
    for (let n = el; n && n !== D().body; n = n.parentElement) {
      if (n.classList && n.classList.contains('im-front')) continue;
      const c = cs(n); const zz = c && c.zIndex;
      if (zz && zz !== 'auto' && +zz > F) return true;
    }
    return false;
  }
  /* the floating panel an event landed in — the first positioned ancestor, asked of the LAYOUT
     rather than of a list of selectors (#R253). The map's own canvas is explicitly not one. */
  /* ⚠ (front-mark-outer-context) THE MARK GOES WHERE ITS z-index COMPETES. The first positioned
     ancestor is the panel only when nothing above it traps its z-index. A dropdown inside a pill
     that is itself a stacking context (`#ms-results` inside the fixed, z-indexed `#map-search`)
     got the mark and could not leave its parent's context: measured in production 2026-09-30, the
     pointerdown on a search result set im-float-front, the Köppen legend (1100) rose over the pill
     (1002), the pointerup landed on the legend and the result was never chosen. So after the
     innermost positioned element, the walk keeps climbing and moves the mark to every ancestor
     that FORMS A STACKING CONTEXT and can take a z-index (positioned: fixed/sticky always, abs/rel
     with a z-index or a transform/filter/opacity) — the outermost one is the element that stands
     in the band. It still stops at the map and the shell (NOT_PANEL), keeping what it found. */
  function trapsZ(c) {
    const p = c.position;
    if (p === 'fixed' || p === 'sticky') return true;
    if (p !== 'absolute' && p !== 'relative') return false;
    return (c.zIndex && c.zIndex !== 'auto') || c.transform !== 'none' || c.filter !== 'none' || +c.opacity < 1;
  }
  function panelOf(el) {
    let found = null;
    for (let n = el; n && n !== D().body; n = n.parentElement) {
      if (n.matches && n.matches(NOT_PANEL)) return found;
      const c = cs(n);
      if (!c) continue;
      const p = c.position, zz = c.zIndex;
      if (!found) {
        if (p === 'absolute' || p === 'fixed') found = n;
        else if ((p === 'relative' || p === 'sticky') && zz && zz !== 'auto') found = n;
      } else if (trapsZ(c)) found = n;
    }
    return found;
  }
  function mark(el) {
    try { D().querySelectorAll('.im-front').forEach((n) => { if (n !== el) n.classList.remove('im-front'); }); } catch (_) { }
    if (el) el.classList.add('im-front');
  }
  /** the panel being used: above the open sidebar, one at a time */
  function front(el) { D().body.classList.add('im-float-front'); mark(el); }
  /** nothing is being used: an open sidebar is in front of every window again */
  function back() { D().body.classList.remove('im-float-front'); mark(null); }
  /* ══ ⚠ (map-layer-system-chronos) WHAT AN OPERATION OPENS IS WHAT IS BEING USED ═══════════════
     The mark follows the gesture, and the gesture that OPENS a panel lands in the panel it was made
     in — so that panel is raised to `front` and the one it opened appears BENEATH it. MEASURED
     2026-10-10 on the built app at 1280×720: «Read this year» in the Chronos panel marked
     `#news-timeline` (`.im-front`, 2650); the year book it opened (`#yb-sheet`, `--z-sheet` 1650,
     top:72 right:12) lay under it — `elementFromPoint` at the sheet's «next year» button returned
     `#ntl-zone`, and the sheet's whole body (x ≥ 934) was covered; only a 48 px strip showed. The
     panel had covered the body since the sheet existed; #1034 made the panel 59 px taller (the
     «Then & now» row), which carried the cover over the header's buttons too, and the nightly's
     click on «next year» could no longer land. The polity-arc sheet, opened from the same panel at
     the same place and level, opened under it the same way.
     So an opener says that it opened something, and the mark moves there — the same rule as a
     gesture inside it (`panelOf`, so a surface inside a trapped context marks the context that
     competes), and never onto a layer already above the band (#R508: the mark would sink it). */
  function opened(el) {
    if (!el || aboveBand(el)) return false;
    front(panelOf(el) || el);
    return true;
  }

  function act(t, mayDemote) {
    if (!t || !t.closest) return;
    if (aboveBand(t)) return;   /* (#R508) a dialog is above this band — raising it would sink it */
    if (t.closest(SHELL_SIDE)) { back(); return; }
    const p = panelOf(t);
    /* a wheel over the map must not clear a panel the reader is using — only a POINTERDOWN on the
       map means «I have moved on». So the passive signals raise, and never demote. */
    if (!p) { if (!mayDemote) return; back(); return; }
    front(p);
  }
  /* every registered window the gesture is inside, outermost first — the order the per-element
     capture listeners of #R47 fired in, so a window nested in another still ends up on top */
  function orderAround(t) {
    const hit = [];
    for (let n = t; n; n = n.parentElement) if (_win.has(n)) hit.push(n);
    for (let i = hit.length - 1; i >= 0; i--) order(hit[i]);
  }

  let _wired = false;
  function wire() {
    if (_wired) return; _wired = true;
    const d = D(); if (!d || !d.addEventListener) return;
    d.addEventListener('pointerdown', (e) => { try { orderAround(e.target); } catch (_) { } try { act(e.target, true); } catch (_) { } }, true);
    d.addEventListener('wheel', (e) => { try { act(e.target, false); } catch (_) { } }, { capture: true, passive: true });
    d.addEventListener('focusin', (e) => { try { act(e.target, false); } catch (_) { } }, true);
    d.addEventListener('keydown', (e) => { try { act(e.target, false); } catch (_) { } }, true);   /* (#R258) typing is an operation */
  }

  /* ── the #823 shape, measured ─────────────────────────────────────────────────────────────────
     `overflow` cuts a descendant only through its CONTAINING-BLOCK chain: an absolutely positioned
     list escapes every static ancestor between it and its positioned one, and a fixed one escapes
     all of them unless a transform or filter re-anchors it. So the walk follows that chain rather
     than the DOM, and reports the first ancestor whose clipping axis the element's box crosses. */
  const CLIPS = (v) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
  function clipOf(el) {
    try {
      const r = el.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) return null;
      const c0 = cs(el); if (!c0) return null;
      let pos = c0.position;
      for (let n = el.parentElement; n && n !== D().body && n !== D().documentElement; n = n.parentElement) {
        const c = cs(n); if (!c) continue;
        const anchors = c.transform !== 'none' || c.filter !== 'none';
        if (pos === 'fixed' && !anchors) continue;
        if (pos === 'absolute' && c.position === 'static' && !anchors) continue;
        const cx = CLIPS(c.overflowX), cy = CLIPS(c.overflowY);
        if (cx || cy) {
          const b = n.getBoundingClientRect();
          if (cx && (r.left < b.left - 0.5 || r.right > b.right + 0.5)) return { el: n, axis: 'x' };
          if (cy && (r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5)) return { el: n, axis: 'y' };
        }
        pos = c.position === 'fixed' || c.position === 'absolute' ? c.position : 'static';
      }
    } catch (_) { }
    return null;
  }

  G.IntMapStack = { z, level, register, isWindow, order, front, back, opened, wire, wired: () => _wired, panelOf, aboveBand, clipOf, SHELL_SIDE, NOT_PANEL };
})(typeof window !== 'undefined' ? window : globalThis);
