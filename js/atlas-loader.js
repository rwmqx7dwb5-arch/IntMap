/* ============================================================================
 *  IntMap · REACHING FOR ATLAS FETCHES ATLAS — window.IntMapAtlas   (#R224)
 * ----------------------------------------------------------------------------
 *  「モバイル版がまだ劇的に遅い。もっと爆速に。快適な使用が困難なレベル。ブラウザが落ちることもある。」
 *  (iPhone / iOS Safari, confirmed with the reader.)
 *
 *  ══ WHY THIS FILE EXISTS ════════════════════════════════════════════════════════════════════════
 *  js/atlas-console.js is the single largest file in the boot bundle — 658 kB of a 3.67 MB main chunk
 *  (#R218's measurement) — and js/app-body.js mounted it eagerly on every session, including the many
 *  that never open the panel. It is the ninth on-demand module now (js/lazy-modules.js).
 *
 *  ⚠ THE DANGER WAS NEVER THE DOWNLOAD, IT IS THE ELEVEN OTHER FILES THAT CALL `window.IntMapConsole`.
 *  Atlas is this app's control plane (STANDING: 全機能はAtlasから操作できること), so the Countries
 *  panel's AI brief, the map's right-click «Ask Atlas», the Tools panel, ⌘K, the keyboard 'a', the
 *  sidebar tab, the workspace window and the `atlas.*` OS commands all reach for it — and every one of
 *  them was written as `window.IntMapConsole && …`, which against a lazy kernel means "silently do
 *  nothing" rather than "open Atlas". So they do not test for the global any more: they come through
 *  here, and this fetches the kernel and then makes the call.
 *
 *  ⚠ A `close`-SHAPED CALL MUST NOT FETCH. The flight simulator closes Atlas when it takes over, and
 *  downloading 658 kB in order to close a panel that was never opened is the same defect pointed the
 *  other way — those call sites keep their plain `window.IntMapConsole &&` guard, deliberately.
 *  ⚠ `hint()` is for a hover or a press: it starts the fetch before the click resolves, so the panel
 *  opens as immediately as it did when it was in the bundle.
 *
 *  ⚠ IT IS ITS OWN FILE BECAUSE js/app-body.js HAS A LINE CEILING (tests/r200-checks ⑤, 4,400) whose
 *  whole point is that a new subject goes to a new file (#R199/#R200). This is a new subject.
 * ==========================================================================*/
window.IntMapAtlas = (function () {
  'use strict';
  function need() {
    try { return window.IntMapLazy.need('atlasConsole').then(function () { return window.IntMapConsole || null; }); }
    catch (_) { return Promise.resolve(window.IntMapConsole || null); }
  }
  return {
    /* has the kernel already arrived? For callers that only want to know, and must not cause a fetch. */
    loaded: function () { return !!window.IntMapConsole; },
    ensure: need,
    hint: function () { try { if (!window.IntMapConsole) window.IntMapLazy.hint('atlasConsole'); } catch (_) { } },
    /* call a method on the kernel, fetching it first. Resolves to the method's return value, or null
       when the kernel could not be had — the same "nothing happened" the old guards gave, except that
       now it only happens when the download genuinely failed. */
    call: function (fn) {
      const a = Array.prototype.slice.call(arguments, 1);
      return need().then(function (C) {
        try { return (C && typeof C[fn] === 'function') ? C[fn].apply(C, a) : null; } catch (_) { return null; }
      });
    },
    /* The entry points js/app-body.js used to wire inline, moved here with the subject. Called once,
       from the same point in the boot the kernel used to be mounted at.
       ⚠ THE TAB IS PREFETCHED ON `pointerdown`, NOT ON `click`. A tap resolves its click a good
       100–200 ms after the finger lands, and on a phone that head start is the difference between
       "Atlas opens" and "Atlas opens after a pause" — the download that used to happen at boot now
       happens during the gesture that asks for it. */
    wire: function () {
      const A = window.IntMapAtlas;
      try {
        const ab = document.getElementById('btn-atlas');
        if (ab) { ab.onclick = function () { A.call('toggle'); };
          ab.addEventListener('pointerenter', A.hint, { passive: true }); }
      } catch (_) { }
      /* (#R42) Ctrl/⌘+K opens Atlas (skip when typing in a field). */
      window.addEventListener('keydown', function (e) {
        if (!((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) return;
        const ae = document.activeElement;
        if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
        e.preventDefault(); A.call('toggle');
      });
      try {
        const cb = document.getElementById('btn-community');
        if (cb) { cb.addEventListener('pointerdown', A.hint, { passive: true });
          cb.addEventListener('pointerenter', A.hint, { passive: true }); }
      } catch (_) { }
      /* ══ ⚠ AND ON A DESKTOP IT IS WARMED LONG AFTER BOOT, ON PURPOSE ══════════════════════════
         The instruction this round answers is about a PHONE (「モバイル版がまだ劇的に遅い…ブラウザが
         落ちることもある」, iPhone / iOS Safari), and a phone is where 658 kB of parse and the heap it
         leaves behind actually cost something — iOS Safari kills a tab on memory, not on bytes. A
         desktop was never the complaint, Atlas is the most-used panel there, and making the first
         ⌘K wait for a download would be trading one regression for another. So: phones and
         Save-Data sessions download it only when the reader reaches for it; a desktop warms it once
         the app is fully interactive and the browser says it is idle.
         ⚠ The boot path is clear on EVERY device either way — this cannot run before `idle`. */
      try {
        /* ⚠ THE UA, NOT THE WIDTH — Architecture.md §9's own rule, and this round is why it is worth
           restating: "how much RAM does this device have" is a UA question, "how wide is the layout"
           is a width question, and a warm-up is about RAM. Measured while writing this: a hidden
           browser pane reports `innerWidth: 0`, which a width test calls a phone. A narrow desktop
           window is not a phone either — the RAM is the same RAM. */
        const phone = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
        let save = false;
        try { const c = navigator.connection; save = !!(c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || ''))); } catch (_) { }
        if (!phone && !save) {
          /* ⚠ A PLAIN TIMER, NOT `requestIdleCallback`. An idle callback on a page whose main thread
             never goes quiet fires only at its timeout, and stacking that on top of the map's own
             `idle` made the warm-up arrive tens of seconds late (measured: three browser specs timed
             out at 45 s waiting for a global that was still queued). What the boot path needs is that
             this cannot run BEFORE first paint; four seconds after the modules land is long past it,
             and the map's own idle brings it forward when the map settles sooner. */
          try { window.IntMapGeoEngine.events.once('idle', () => setTimeout(A.hint, 1200)); } catch (_) { }
          setTimeout(A.hint, 4000);
        }
      } catch (_) { }
    },
  };
})();
