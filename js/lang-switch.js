/* ============================================================================
 *  IntMap · CHANGING THE LANGUAGE IS AN EVENT THAT CAN BE AWAITED   (#R233)
 * ----------------------------------------------------------------------------
 *  「言語設定を変えたはずなのに混在してしまっている。カオス。基本的なUIですら言語が混在。」
 *
 *  ══ WHAT WAS WRONG, MEASURED ════════════════════════════════════════════════════════════════
 *  #R232 made every locale but English a LAZY chunk (js/locale-boot.js) and taught the COLD boot to
 *  wait for the reader's saved language on js/app-body.js's boot barrier. What nobody taught to wait
 *  was the other door: `setLang()`, i.e. the header pills and the Settings dropdown. It repainted the
 *  whole UI the instant it was clicked, from a table whose own keys had not arrived yet.
 *
 *  Reproduced on the built site (127.0.0.1:4233, English boot → click 「JP」):
 *
 *      IntMapLang.isLoaded('jp')            false
 *      Object.keys(i18n.jp).length          168      ← only the EAGER inline blocks
 *      Object.keys(i18n.en).length          452
 *      i18n.jp.modalTitle                   "Settings"   (own key missing → English prototype)
 *
 *  So Settings kept its English title, section headings, Apply button and legal links, and the
 *  sidebar kept News / Companies / Countries, while every string js/app-body.js and js/i18n-late.js
 *  carry inline turned Japanese. That mixture IS the report, and it is not a translation gap:
 *  `ensure('jp')` afterwards puts the table at 452 keys with `modalTitle === "設定"`.
 *
 *  ══ AND THE SECOND HALF: A TABLE THAT ARRIVES LATE REPAINTS NOTHING ═════════════════════════
 *  Calling `IntMapLang.ensure('jp')` by hand filled the table and left the SCREEN untouched —
 *  `#modal-title` still read "Settings". js/i18n.js's `onDefine` hook merges the arriving keys in
 *  place (correctly, #R232), but merging a table is not painting a document. Anything that had
 *  already rendered stayed in whatever language was current a tick earlier.
 *
 *  ══ THE RULE THIS FILE INSTALLS ════════════════════════════════════════════════════════════
 *    1. A language switch does not start until that language's strings are here (`when`).
 *       No half-painted state exists, so there is nothing to be mixed.
 *    2. A locale that lands by any OTHER route — the cold-boot barrier, a second reader, a retry —
 *       repaints the document if it is the language being looked at (`onDefine`).
 *  Both go through ONE registered repaint, so the app has one answer to 「今の言語で描き直せ」
 *  rather than a list of callers to keep in step.
 *
 *  ⚠ IT NEVER REJECTS. A locale that fails to arrive must leave the reader with English (the
 *  designed per-key fallback), not with a pill that does nothing — so the failure path applies too.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { notify } from './notify.js';
(function () {
  'use strict';

  var _getLang = null;   /* live accessor, #R165's rule — the app reassigns its current language */
  var _repaint = null;   /* js/app-body.js's updateI18n */
  var _want = null;      /* the last language asked for; a newer click supersedes an older fetch */

  /* js/app-body.js registers both halves once, from inside its closure. */
  function bind(getLang, repaint) {
    if (typeof getLang === 'function') _getLang = getLang;
    if (typeof repaint === 'function') _repaint = repaint;
  }

  /* Run `apply` only once `code`'s strings can be read. Synchronous when they already can be —
     the five-language case and every repeat switch — so nothing about the common path changes. */
  function when(code, apply) {
    var LANG = IntMapLang;
    if (!LANG || !LANG.ensure) { apply(); return; }
    var c = LANG.normalise(code);
    if (LANG.isLoaded(c)) { _want = null; apply(); return; }
    _want = c;
    var go = function () { if (_want !== c) return; _want = null; try { apply(); } catch (e) {} };
    LANG.ensure(c).then(go, go);
  }

  /* True while a switch is waiting on its chunk — the pills use it to show the choice has landed
     even though the document has not been repainted yet. */
  function pending() { return _want; }

  /* ══ (locale-on-demand) …AND A FAILURE IS SAID, WITH ITS REASON ══════════════════════════════
     The rule above applies the switch even when the chunk never came (English underneath, by design),
     which left the reader looking at a language that did not change and told nothing. Measured cause
     on a static host: a tab opened before a deploy asks for a chunk whose hashed name the new deploy
     no longer has — «Failed to fetch dynamically imported module». The registry now keeps the reason
     and tells its `onFail` listeners; this is the one listener that tells the READER, through the
     app's one live region (js/notify.js), for the language asked for or on screen — the cold boot's
     saved language included, which is asked before any switch is bound. A second ask fetches again
     (the registry no longer caches the failure), which is what «reload to try again» falls back to. */
  function tellFailure(code, why) {
    var LANG = IntMapLang;
    try {
      if (!(_want === code || !_getLang || LANG.normalise(_getLang()) === code)) return;
      var name = code;
      try { (LANG.list() || []).forEach(function (r) { if (r.code === code) name = r.label; }); } catch (e) {}
      var head = IntMapLang.t(code, 'Could not load this language. Text without a translation is shown in English; reload the page to try again.',
        'この言語を読み込めませんでした。訳のない文字は英語で表示されます。ページを再読み込みして、もう一度お試しください。');
      notify.show(head + ' (' + name + (why ? ': ' + why : '') + ')');
    } catch (e) {}
  }
  try { if (IntMapLang.onFail) IntMapLang.onFail(tellFailure); } catch (e) {}

  try {
    IntMapLang.onDefine(function (code) {
      if (!_repaint || !_getLang) return;
      /* only the language actually on screen; a background prefetch must not repaint anything */
      try { if (IntMapLang.normalise(_getLang()) !== code) return; } catch (e) { return; }
      try { _repaint(); } catch (e) {}
    });
  } catch (e) {}

  window.IntMapLangSwitch = { bind: bind, when: when, pending: pending };
})();
