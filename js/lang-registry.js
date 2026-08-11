/* ============================================================================
 *  IntMap · THE LANGUAGE REGISTRY — window.IntMapLang   (#R221)
 * ----------------------------------------------------------------------------
 *  「今後、対応言語をさらに増やしていく方針です。容易に言語を追加できるように準備しておいて。」
 *
 *  ══ WHAT ACTUALLY STOOD IN THE WAY ══════════════════════════════════════════════════════════
 *  #R218 made the READING PAGES easy to translate (js/page-i18n.js: one file per language, one row
 *  in a list). The app itself was still two things that a sixth language could not be added to:
 *
 *    ① js/i18n.js — ONE object literal with five branches, so a new language meant editing a file
 *       every other language also lives in, and a key a young translation has not reached yet came
 *       back `undefined` rather than English.
 *    ② …and the real wall: **2,238 call sites of a FIVE-POSITIONAL-ARGUMENT helper**, declared 64
 *       times over as `const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:…`. Every panel, legend, hint
 *       and error in this app writes its five translations inline at the point of use. A sixth
 *       language under that scheme is a sixth argument at 2,238 places — which is not "difficult",
 *       it is not possible, and it is why this instruction has now been sent three rounds running.
 *
 *  ══ WHAT A LANGUAGE COSTS NOW ═══════════════════════════════════════════════════════════════
 *      1. one row in LANGS below;
 *      2. one file js/locales/ui.<code>.js  (copy ui.en.js, translate, and — optionally — fill the
 *         `inline` table, which `node scripts/i18n-report.mjs --template <code>` writes for you);
 *      3. one import line in src/main.js.
 *  Nothing else in the app has to know, and NOTHING has to be touched at a call site. A language
 *  with an empty `inline` table renders every inline string in English and every keyed string in
 *  its own language — a partial translation degrades per string, never per screen.
 *
 *  ══ HOW `L(…)` KEEPS WORKING WHILE BECOMING VARIADIC ════════════════════════════════════════
 *  `pick(getLang)` returns the same function the 64 hand-written ones were, with one addition:
 *
 *      · the current language's POSITIONAL INDEX in LANGS decides which argument to take, so
 *        L('Ocean currents','海流','Meeresströmungen','Морские течения','Corrientes marinas')
 *        is byte-for-byte the behaviour it always had for the first five languages;
 *      · a language whose index is past the arguments given (i.e. any NEW one) looks its answer up
 *        in that language's `inline` table, KEYED BY THE ENGLISH STRING — which is argument 0 and
 *        is therefore always present;
 *      · and failing both, English. Never `undefined`, which is what three of the 64 hand-written
 *        copies returned when a call site passed only two or three translations.
 *
 *  ⚠ THE KEY IS THE ENGLISH STRING ITSELF, not a made-up identifier. That is what lets the table be
 *  generated from the source by an AST pass instead of maintained by hand, and it means a call site
 *  can be edited without a symbol table going stale — an English string that changes simply falls
 *  back to English until the translation catches up, and the report says so.
 * ========================================================================== */
window.IntMapLang = (function () {
  'use strict';

  /* ── THE LIST. One row per language, and this is the only one in the app. ───────────────────
     `code`  the app's own code, and the key in window.IntMapI18N. (Japanese is 'jp' here for
             historical reasons; `html`/`alias` carry the ISO 'ja' that every page and <html lang>
             uses, so both spellings resolve.)
     `label` the language's own name — a picker that names languages in a language you cannot read
             is not a picker.
     `html`  the BCP-47 tag for <html lang> and for the reading pages.
     ⚠ ORDER IS LOAD-BEARING for the first five: it is the argument order of every L(…) call site
     in the app. Append new languages at the END; never reorder. */
  var LANGS = [
    { code: 'en', label: 'English',  html: 'en' },
    { code: 'jp', label: '日本語',    html: 'ja', alias: ['ja'] },
    { code: 'de', label: 'Deutsch',  html: 'de' },
    { code: 'ru', label: 'Русский',  html: 'ru' },
    { code: 'es', label: 'Español',  html: 'es' }
  ];
  var FALLBACK = 'en';

  var idx = Object.create(null);          /* code (and alias) → positional index */
  var byCode = Object.create(null);
  function reindex() {
    idx = Object.create(null); byCode = Object.create(null);
    for (var i = 0; i < LANGS.length; i++) {
      var l = LANGS[i];
      idx[l.code] = i; byCode[l.code] = l;
      (l.alias || []).forEach(function (a) { idx[a] = i; byCode[a] = l; });
    }
  }
  reindex();

  var ui = Object.create(null);           /* code → the KEYED table (window.IntMapI18N[code]) */
  var inline = Object.create(null);       /* code → { English source string → translation } */

  /* the locale files call this. `ui` is the keyed dictionary; `inline` is optional and only a NEW
     language (index ≥ 5) ever needs it. */
  function define(code, tables) {
    if (!code || !tables) return;
    if (tables.ui) ui[code] = tables.ui;
    if (tables.inline) inline[code] = tables.inline;
  }

  /* 'ja' → 'jp', 'EN-gb' → 'en'; anything unknown is returned lower-cased so `has()` can reject it */
  function normalise(c) {
    c = String(c == null ? '' : c).toLowerCase();
    if (idx[c] != null) return LANGS[idx[c]].code;
    var two = c.slice(0, 2);
    return (idx[two] != null) ? LANGS[idx[two]].code : c;
  }
  function has(c) { return idx[normalise(c)] != null; }
  function index(c) { var i = idx[normalise(c)]; return (i == null) ? -1 : i; }

  /* ⚠ `getLang` IS A FUNCTION, NOT A VALUE (#R165's rule). Every module that used to write its own
     helper closed over `HOST.lang` / `currentLang` through a live accessor for exactly this reason:
     the app reassigns the current language at runtime and a captured value never changes. */
  function pick(getLang) {
    return function () {
      var n = arguments.length;
      if (!n) return '';
      var code;
      try { code = normalise(getLang()); } catch (e) { code = FALLBACK; }
      var i = idx[code];
      if (i == null) return arguments[0];
      if (i > 0 && i < n) {
        var v = arguments[i];
        if (v != null && v !== '') return v;
      }
      if (i !== 0) {
        var t = inline[code];
        if (t) { var s = t[arguments[0]]; if (s != null && s !== '') return s; }
      }
      return arguments[0];
    };
  }

  /* the keyed table for one language, with English underneath it PER KEY. `Object.create` rather
     than `Object.assign` so a key added to English later (js/i18n-late.js does this a dozen times)
     is immediately available in every language without a second merge. */
  function keyed(code) {
    code = normalise(code);
    var base = ui[FALLBACK] || {};
    if (code === FALLBACK) return base;
    var own = ui[code] || {};
    var o = Object.create(base);
    for (var k in own) if (Object.prototype.hasOwnProperty.call(own, k)) o[k] = own[k];
    return o;
  }

  /* used by the settings picker and by anything that has to enumerate languages */
  function list() { return LANGS.map(function (l) { return { code: l.code, label: l.label, html: l.html }; }); }
  function htmlTag(code) { var l = byCode[normalise(code)]; return l ? l.html : 'en'; }

  /* ── THE CHROME, BUILT FROM THIS LIST ────────────────────────────────────────────────────────
     The header pills and the Settings dropdown were five literals in index.html, so a sixth language
     would have been invisible however completely it was translated. This ADDS whatever the page does
     not already have: the five that ship keep their exact markup and their `lang-<code>` ids (which
     the browser tests click), and a new row in LANGS appears in both places with no HTML edit.
     ⚠ It lives here rather than in js/app-body.js because that file has a line ceiling whose whole
     point is that new subjects go to their own file (#R199/#R200), and this is the language subject. */
  function syncChrome(onPick) {
    try {
      var bar = document.querySelector('.lang-toggle');
      var sel = document.getElementById('setting-lang');
      LANGS.forEach(function (l) {
        if (bar && !document.getElementById('lang-' + l.code)) {
          var b = document.createElement('button');
          b.className = 'lang-btn'; b.id = 'lang-' + l.code;
          b.textContent = l.code.toUpperCase(); b.title = l.label;
          b.addEventListener('click', function () { try { onPick(l.code); } catch (e) {} });
          bar.appendChild(b);
        }
        if (sel && !sel.querySelector('option[value="' + l.code + '"]')) {
          var o = document.createElement('option');
          o.value = l.code; o.textContent = l.label; sel.appendChild(o);
        }
      });
    } catch (e) {}
  }
  function codes() { return LANGS.map(function (l) { return l.code; }); }

  return { LANGS: LANGS, FALLBACK: FALLBACK, list: list, codes: codes, syncChrome: syncChrome,
           define: define, pick: pick, keyed: keyed,
           normalise: normalise, has: has, index: index, htmlTag: htmlTag,
           /* for the coverage report and the tests */
           _ui: ui, _inline: inline };
})();
