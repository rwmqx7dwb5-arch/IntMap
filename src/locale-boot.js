/* ============================================================================
 *  IntMap · THE LOCALE DIRECTORY, AS THE LANGUAGE LIST   (#R232)
 * ----------------------------------------------------------------------------
 *  「今後IntMapの設定言語を追加するのが、1発で終わるように。それが完了したらフランス語と韓国語を追加。」
 *
 *  ══ WHAT A LANGUAGE COSTS AFTER THIS FILE ═══════════════════════════════════════════════════
 *  ONE FILE: `js/locales/ui.<code>.js`. (Plus `js/locales/pages.<code>.js` if the two reading pages
 *  should speak it too — same rule, same directory, no registration either.) There is no row to add,
 *  no import line to write, no picker to edit and no launch-screen table to remember: the glob below
 *  IS the list, js/lang-registry.js derives the label / tag / pill from the code, and
 *  tests/r232-checks.test.mjs fails if any of that stops being true.
 *
 *  ══ …AND IT MADE EVERY SESSION 422 kB LIGHTER ══════════════════════════════════════════════
 *  「デスクトップ・モバイルともに起動をより高速に。」「起動の遅さは初期JavaScript量が原因と断定できます。」
 *  src/main.js used to `import` all seven locale files eagerly. Six of them are dead weight in any
 *  one session, and two of them — ui.zh.js and ui.zh-hans.js — are 211 kB EACH, because a language
 *  past the fifth carries the full `inline` table (2,066 strings keyed by their English source).
 *  Measured in dist/: 4,325 kB of eager JS, of which 492 kB was locales.
 *
 *  ⚠ ENGLISH STAYS EAGER AND EVERYTHING ELSE IS FETCHED. English is not a translation here, it is
 *  the FALLBACK PROTOTYPE every other table chains onto (js/i18n.js), so it must be present before
 *  anything reads a key. The reader's own language is started HERE, at import time, and js/app-body.js
 *  waits for it on the same barrier it already uses for the renderer choice — so no screen is ever
 *  painted in English on its way to being painted in Japanese.
 *
 *  ⚠ IT LIVES IN src/, NOT js/, AND THAT IS NOT A FILING PREFERENCE. `import.meta.glob` is a BUNDLER
 *  form, and scripts/static-checks.mjs parses everything under js/ as a PLAIN SCRIPT — which is exactly
 *  what makes the split-scope guarantee checkable there. `import.meta` is not valid in a script, so the
 *  checker read `import` and `meta` as two free identifiers resolving to nothing. src/ is where this
 *  graph's bundler-aware entry points already live (main.js, the two worker clients, vendor.js).
 * ==========================================================================*/
(function () {
  'use strict';
  var LANG = window.IntMapLang;
  if (!LANG || !LANG.declare) return;

  /* ⚠ THE GLOB IS LAZY ON PURPOSE (no `{eager:true}`): Vite turns this into a map of
     `path → () => import(path)`, so each locale becomes its own chunk and NONE of them is in the
     boot bundle. With `eager:true` this file would be a more elegant way to ship the same 492 kB. */
  var mods = import.meta.glob('../js/locales/ui.*.js');
  var loaders = {}, codes = [];
  Object.keys(mods).forEach(function (p) {
    var m = /ui\.([A-Za-z0-9-]+)\.js$/.exec(p);
    if (!m) return;
    var c = m[1].toLowerCase();
    loaders[c] = mods[p];
    codes.push(c);
  });
  /* sorted so the picker's order is a property of the code, not of the bundler's directory walk.
     The five positional languages are already rows in the registry and are not re-ordered by this —
     `declare` only ever appends codes it does not already know. */
  codes.sort();
  LANG.declare(codes, loaders);

  /* the reader's saved language — the same key and the same shape js/app-body.js seeds `currentLang`
     from, and the same one index.html's launch screen reads for its one word. */
  var lang = LANG.FALLBACK;
  try {
    var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}');
    if (s && s.lang && LANG.has(s.lang)) lang = LANG.normalise(s.lang);
  } catch (e) {}

  /* ⚠ PUBLISHED AS A PROMISE, NOT AWAITED HERE. src/main.js is bundled to an IIFE, which cannot
     carry top-level `await`; and even if it could, this module's body runs BEFORE the rest of the
     graph, so blocking here would block js/geo-engine.js and the renderer with it. js/app-body.js
     resolves it on the DOMContentLoaded barrier instead — see `_imAppBoot`. */
  window.IntMapLocalePending = (lang === LANG.FALLBACK) ? Promise.resolve(null) : LANG.ensure(lang);
})();
