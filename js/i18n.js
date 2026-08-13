/* ============================================================================
 *  IntMap · window.IntMapI18N — the keyed UI table, ASSEMBLED   (#R221, was #R162)
 * ----------------------------------------------------------------------------
 *  「今後、対応言語をさらに増やしていく方針です。容易に言語を追加できるように準備しておいて。」
 *
 *  This file used to BE the table: one object literal with five branches, 248 lines, edited by
 *  every language at once. It is now the two lines that assemble it out of js/locales/ui.*.js —
 *  one file per language — and the place where the per-key fallback to English is installed.
 *
 *  ⚠ THE FALLBACK IS A PROTOTYPE, NOT A COPY. `Object.create(en)` means:
 *      · i18n.de.someKey  →  German if this translation has it, English if it does not, per key.
 *        (Before, it was `undefined`, and half the call sites in the app print `undefined` for
 *        that: measured on the Spanish build, which is why #R40 had to fill 184 keys by hand.)
 *      · a key ADDED TO ENGLISH LATER — js/i18n-late.js does exactly that a dozen times, and every
 *        round since #R37 has added more — is instantly visible in every language, with no second
 *        merge and no ordering rule to remember.
 *    `Object.assign(i18n.de, …)` still works and still writes own properties, so the `try{}` blocks
 *    in js/i18n-late.js are untouched.
 *
 *  ⚠ AND `jp` HAS ALWAYS MEANT `ja`. The app writes Japanese as 'jp'; every page, every <html lang>
 *  and every ISO consumer writes it as 'ja'. Both now resolve — `IntMapI18N.ja === IntMapI18N.jp` —
 *  so a reader (or a new locale file) can use either spelling without a special case.
 *
 *  Adding a language: see the header of js/lang-registry.js. It is three edits, none of them here.
 * ========================================================================== */
(function () {
  'use strict';
  var LANG = window.IntMapLang;
  var out = {};
  if (!LANG) { window.IntMapI18N = { en: {} }; return; }

  LANG.LANGS.forEach(function (l) {
    var table = LANG.keyed(l.code);
    out[l.code] = table;
    (l.alias || []).forEach(function (a) { out[a] = table; });
  });

  /* the two things the rest of the app asks this object for, beyond the tables themselves */
  Object.defineProperty(out, 'lang', { value: function () {
    try {
      var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}');
      if (s && s.lang && LANG.has(s.lang)) return LANG.normalise(s.lang);
    } catch (e) {}
    return LANG.FALLBACK;
  }, enumerable: false });
  Object.defineProperty(out, 'list', { value: LANG.list, enumerable: false });

  /* ══ ⚠ (#R232) A LOCALE CAN NOW ARRIVE AFTER THIS RAN ═════════════════════════════════════════
     Until this round src/main.js imported all seven locale files EAGERLY, so by the time this file
     evaluated every table was complete and `keyed()` could be read once. They are dynamic imports
     now (js/locale-boot.js — 492 kB of the boot bundle for six languages the session never reads),
     which means the reader's own language lands a tick or two later.

     ⚠ MERGE IN PLACE, NEVER REPLACE. `i18n.de` and friends are captured by reference all over the
     app — js/app-body.js keeps its own `i18n` alias, js/i18n-late.js does `Object.assign(i18n.de,…)`
     a dozen times — so swapping the object would leave every one of those holders pointing at the
     empty table this file created. Copying the fresh table's OWN properties onto the existing object
     keeps identity, keeps the English prototype underneath, and (because js/i18n-late.js runs inside
     app-body's boot, i.e. after the barrier that waits for this) cannot clobber a late key. */
  LANG.onDefine(function (code) {
    try {
      var fresh = LANG.keyed(code);
      var row = null;
      for (var i = 0; i < LANG.LANGS.length; i++) if (LANG.LANGS[i].code === code) { row = LANG.LANGS[i]; break; }
      if (!out[code]) {
        out[code] = fresh;
        if (row) (row.alias || []).forEach(function (a) { out[a] = fresh; });
        return;
      }
      var dst = out[code];
      for (var k in fresh) if (Object.prototype.hasOwnProperty.call(fresh, k)) dst[k] = fresh[k];
    } catch (e) {}
  });

  window.IntMapI18N = out;
})();
