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
 *  ══ WHAT A LANGUAGE COSTS NOW (#R232) ═══════════════════════════════════════════════════════
 *      ONE FILE: js/locales/ui.<code>.js  (copy ui.en.js, translate, and fill the `inline` table, which
 *      `node scripts/i18n-report.mjs --template <code>` writes for you). Optionally a second,
 *      js/locales/pages.<code>.js, if the two reading pages should speak it too.
 *  THAT IS THE WHOLE COST. There is no row to add here, no import line in src/main.js, no picker to edit
 *  and no launch-screen table to remember: js/locale-boot.js globs the directory, so the set of languages
 *  IS the set of files, and `derive()` below works out the label, the BCP-47 tag and the pill from the
 *  code. Nothing else in the app has to know, and NOTHING has to be touched at a call site. A language
 *  with an empty `inline` table renders every inline string in English and every keyed string in
 *  its own language — a partial translation degrades per string, never per screen.
 *
 *  ⚠ (#R231) AND THAT LIST IS NOW TRUE, WHICH IT WAS NOT. Three other places had to be edited by
 *  hand for a new language and none of them was documented here, so #R223's 繁體中文 and #R224's
 *  简体中文 shipped with all three unfilled:
 *      · 281 hand-written `lang==='jp'?…:'…'` chains in js/ — see `t()` below;
 *      · js/page-i18n.js kept a SECOND five-row LANGS list of its own, so the reading pages had no
 *        Chinese at all — it now reads this one;
 *      · index.html's launch-screen word list, which still cannot import (it runs before any module)
 *        but is now VERIFIED against this list by tests/r231-checks.test.mjs instead of remembered.
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
  /* ⚠ (#R232) THE LOCAL IS `LANG_ROWS`, THE EXPORTED KEY IS STILL `LANGS`. js/tables.js also has a
     table called LANGS, and tests/r167 #3 forbids mutating a name that names a table there — a rule
     worth keeping, since a pure-data table that someone pushes onto is no longer pure data. This array
     is a different thing that happened to share the name, and `declare()` appends to it. */
  var LANG_ROWS = [
    { code: 'en', label: 'English',  html: 'en' },
    { code: 'jp', label: '日本語',    html: 'ja', alias: ['ja'] },
    { code: 'de', label: 'Deutsch',  html: 'de' },
    { code: 'ru', label: 'Русский',  html: 'ru' },
    { code: 'es', label: 'Español',  html: 'es' },
    /* ══ (#R223) THE SIXTH LANGUAGE — THE FIRST ONE THIS REGISTRY WAS BUILT FOR ═════════════════
       「繁体を追加して。(beta)」 Traditional Chinese is the first language added since #R221 made
       adding one possible, and it cost exactly what that round promised: this row, one locale file
       (js/locales/ui.zh.js — 284 keyed strings and all 1,816 inline ones), and one import line in
       src/main.js. NOT ONE CALL SITE WAS TOUCHED: index 5 is past every L(…) call's arguments, so
       every one of them answers from the `inline` table, keyed by its English string.
       ⚠ `label` carries the (beta) mark because the reader asked for it that way — the picker is
       where a reader learns how finished a translation is.
       ⚠ THE ALIASES ARE THE SCRIPT TAGS, NOT 'zh'. zh-Hant / zh-TW / zh-HK / zh-MO are Traditional;
       a bare 'zh' or 'zh-CN' is usually Simplified, and handing a Simplified reader Traditional
       because the first two letters match is a guess this file should not make. `normalise` still
       maps a bare 'zh' here (it falls back to the two-letter prefix), which is what the picker and
       the share link need; nothing auto-detects the app's language from the browser (js/app-body.js
       reads the saved setting only), so no one is switched into it without asking. */
    /* ⚠⚠ (#R232) THIS LIST STOPS GROWING HERE — A NEW LANGUAGE IS ONE FILE AND NOTHING ELSE.
       「今後IntMapの設定言語を追加するのが、1発で終わるように。」 (re-sent from #R231, which got the
       cost down to «one row here, one locale file, one page file, one import line» — four edits in
       four files, which is not one shot; and #R231 then found three MORE places that had to be edited
       by hand and had not been, which is the real argument: a list a human must remember to update is
       a list that will be wrong.)
       ⚠ THE FILENAME IS THE DECLARATION. js/locale-boot.js globs js/locales/ui.*.js, so the set of
       languages IS the set of files on disk. `declare()` appends every code this list does not already
       name, and `derive()` works out the three facts a row needs:
         · html  — the BCP-47 tag: the code itself, unless META below says otherwise;
         · label — the language's OWN name, via Intl.DisplayNames (a picker that names languages in a
                   language you cannot read is not a picker), unless META says otherwise;
         · pill  — the code's first two letters, unless META says otherwise.
       ⚠ THE ROWS BELOW STAY LITERAL BECAUSE THEY CARRY FACTS A FILENAME CANNOT. The two Chinese rows
       need script-specific aliases, single-character pills, a (beta) mark and — critically — an ORDER,
       because `normalise` resolves a bare 'zh' to whichever row comes first. Anything with that kind
       of fact goes in META; everything else needs no entry anywhere.
       ⚠ AND THE FIRST FIVE STAY IN THIS ORDER FOREVER — it is the ARGUMENT ORDER of every L(…) /
       t(…) call site in the app (see pick() below). Discovery only ever APPENDS. */
    /* ⚠ (#R239) THE TWO EXPLICIT (beta) MARKS ARE GONE, and the reason they existed is the reason
       they are gone: scripts/i18n-langs.mjs computes the mark from coverage and would have dropped
       it long ago, but an explicit label wins, and #R232 kept one here because 「their reading pages
       are still partial even though the app is at 100%」. As of this round pages.zh-hant.js is
       287/287 (`node scripts/i18n-pages-audit.mjs`), so the sentence that justified the mark is no
       longer true and the mark would be telling a reader something false. */
    { code: 'zh', label: '繁體中文', html: 'zh-Hant', pill: '繁', alias: ['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo'] },
    /* ══ (#R224) THE SEVENTH — 「簡体を追加して。(beta)」 ═══════════════════════════════════════════
       ⚠ IT IS A DERIVED FILE, NOT A SECOND TRANSLATION. js/locales/ui.zh-hans.js is generated from
       ui.zh.js by scripts/zh-hans.mjs — the Taiwan→mainland WORD table first (網路→网络, 資訊→信息,
       螢幕→屏幕, 檔案→文件, 預設→默认, 選單→菜单, 使用者→用户, 解析度→分辨率, 座標→坐标 …), then
       the character map. Simplified Chinese is not a different translation of these 2,100 strings and
       a hand-kept second copy would drift; tests/r224-checks re-runs the generator and fails if the
       committed file is stale. Confirmed with the reader as 「字体変換＋大陸語彙の置換」.
       ⚠ THE ALIASES ARE THE SIMPLIFIED TAGS ONLY. A bare 'zh' still resolves to Traditional (it is
       the earlier row and `normalise` falls back to the two-letter prefix) — #R223's argument, which
       is that handing one script's reader the other because the first two letters match is a guess.
       zh-CN / zh-SG / zh-MY / zh-Hans land here, zh-TW / zh-HK / zh-MO stay above. */
    { code: 'zh-hans', label: '简体中文', html: 'zh-Hans', pill: '简',
      alias: ['zh-hans', 'zh-cn', 'zh-sg', 'zh-my', 'hans'] }
  ];
  var FALLBACK = 'en';

  /* (#R232) facts a filename cannot carry, for codes that are NOT rows above. Empty today — every
     language added from here on is expected to need nothing — and this is where the exception goes
     when one does (a script variant, a non-obvious tag, a pill that is not the first two letters). */
  var META = Object.create(null);
  /* (#R232) …and the tag, when the app's code and the BCP-47 tag disagree. 'jp' is the historical one
     and it is a row above; anything else that disagrees belongs here rather than in a call site. */
  var TAGS = { jp: 'ja' };

  var idx = Object.create(null);          /* code (and alias) → positional index */
  var byCode = Object.create(null);
  function reindex() {
    idx = Object.create(null); byCode = Object.create(null);
    for (var i = 0; i < LANG_ROWS.length; i++) {
      var l = LANG_ROWS[i];
      idx[l.code] = i; byCode[l.code] = l;
      (l.alias || []).forEach(function (a) { idx[a] = i; byCode[a] = l; });
    }
  }
  reindex();

  var ui = Object.create(null);           /* code → the KEYED table (window.IntMapI18N[code]) */
  var inline = Object.create(null);       /* code → { English source string → translation } */

  /* the locale files call this. `ui` is the keyed dictionary; `inline` is optional and only a NEW
     language (index ≥ 5) ever needs it. */
  var defineHooks = [];
  function onDefine(fn) { if (typeof fn === 'function') defineHooks.push(fn); }
  function define(code, tables) {
    if (!code || !tables) return;
    if (tables.ui) ui[code] = tables.ui;
    if (tables.inline) inline[code] = tables.inline;
    /* ⚠ (#R232) A LOCALE CAN NOW ARRIVE AFTER THE TABLES WERE ASSEMBLED. js/i18n.js used to run
       strictly after all seven locale files, because src/main.js imported them all eagerly — 422 kB
       of translations on every load, of which a session reads at most one. They are dynamic imports
       now, so the active one lands a tick or two later and whoever built a table from it has to be
       told. js/i18n.js is the one listener; the hook exists so it does not have to poll. */
    for (var h = 0; h < defineHooks.length; h++) { try { defineHooks[h](code); } catch (e) {} }
  }

  /* ══ (#R232) DISCOVERY — the language list is the LOCALE DIRECTORY ═══════════════════════════
     `declare` is called twice, from two places that know the directory in two different ways, and
     both are idempotent:
       · js/locale-boot.js, in the app, from `import.meta.glob` — authoritative, and it also hands
         over the per-language LOADERS, which is what makes a locale lazy;
       · window.IntMapLangCodes (js/locales/_langs.js, generated by scripts/i18n-langs.mjs), for the
         two reading pages, which are plain <script src> shells with no bundler and therefore no glob.
     Neither can add a language the other does not have without the test in tests/r232-checks noticing. */
  function derive(code) {
    var m = META[code] || {};
    var tag = m.html || TAGS[code] || code;
    var label = m.label;
    if (!label) {
      try {
        var dn = new Intl.DisplayNames([tag], { type: 'language' });
        var got = dn.of(tag);
        if (got && got.toLowerCase() !== tag.toLowerCase()) label = got.charAt(0).toUpperCase() + got.slice(1);
      } catch (e) {}
    }
    if (!label) label = code.toUpperCase();
    /* (#R232) …and the (beta) mark, MEASURED rather than typed. scripts/i18n-langs.mjs computes it
       from the locale file's own inline coverage, so it appears when a language is young and goes
       away on its own when the table is filled — 「完了と判断されたものは(beta)表記を撤去してよい」
       without anyone having to notice. An explicit META/row label always wins.
       ⚠ In the app the list arrives with the codes (src/locale-boot.js imports js/locales/_langs.js);
       on the two reading pages the same file is a <script src>. Absent, nothing is marked. */
    if (!m.label) { try { if ((window.IntMapLangBeta || []).indexOf(code) >= 0) label += ' (beta)'; } catch (e) {} }
    return { code: code, label: label, html: tag,
             pill: m.pill || code.slice(0, 2).toUpperCase(),
             alias: (m.alias || []).slice() };
  }
  var loaders = Object.create(null);
  var pendingLoad = Object.create(null);
  function declare(codes, load) {
    var added = false;
    (codes || []).forEach(function (raw) {
      var c = String(raw == null ? '' : raw).toLowerCase().trim();
      if (!c) return;
      if (load && load[c]) loaders[c] = load[c];
      if (idx[c] != null) return;
      LANG_ROWS.push(derive(c)); added = true;
    });
    if (added) reindex();
    return LANG_ROWS.length;
  }
  /* Load one language's strings. Idempotent and cached; resolves (with null) rather than rejecting,
     because a locale that fails to arrive must leave the reader with English, not with no app. */
  function ensure(code) {
    var c = normalise(code);
    if (pendingLoad[c]) return pendingLoad[c];
    var f = loaders[c];
    pendingLoad[c] = f
      ? Promise.resolve().then(f).catch(function (e) { try { console.warn('[IntMap] locale ' + c + ' failed to load', e); } catch (_) {} return null; })
      : Promise.resolve(null);
    return pendingLoad[c];
  }
  function isLoaded(code) { return !!ui[normalise(code)]; }

  /* 'ja' → 'jp', 'EN-gb' → 'en'; anything unknown is returned lower-cased so `has()` can reject it */
  function normalise(c) {
    c = String(c == null ? '' : c).toLowerCase();
    if (idx[c] != null) return LANG_ROWS[idx[c]].code;
    var two = c.slice(0, 2);
    return (idx[two] != null) ? LANG_ROWS[idx[two]].code : c;
  }
  function has(c) { return idx[normalise(c)] != null; }
  function index(c) { var i = idx[normalise(c)]; return (i == null) ? -1 : i; }

  /* ⚠ `getLang` IS A FUNCTION, NOT A VALUE (#R165's rule). Every module that used to write its own
     helper closed over `HOST.lang` / `currentLang` through a live accessor for exactly this reason:
     the app reassigns the current language at runtime and a captured value never changes. */
  function pick(getLang) {
    var fn = function () {
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
    /* (#R241) the same resolution for a tuple held as data — see `pickArgs` below. ⚠ ONE rule: this
       IS `fn`, applied, so the positional slots and the inline-table fallback cannot drift apart. */
    fn.arr = function (a) { return Array.isArray(a) ? fn.apply(null, a) : (a == null ? '' : String(a)); };
    return fn;
  }

  /* ══ ⚠⚠⚠ (#R241) `pickArgs()` — THE SAME TRANSLATIONS, HELD AS DATA ═════════════════════════════
     「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において対応が
       完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかることは
       許されない。」 — and #R240 §8 had already named where the next gap was: a SEVENTH shape.

     Half a dozen tables in js/ hold their translations as a plain array and index it by the
     language's position:

         {id:'ec-temp', label:['Temperature 2 m (ECMWF)','気温 2m（ECMWF）','Temperatur 2 m …','…']}
         const ecLbl=(l)=>l.label[IntMapLang.index(HOST.lang)]||l.label[0];

     Every one of those is a `L(…)` call that has been written as data so it can be resolved LATER
     (the language changes while the table stays), and that is legitimate — but it costs three
     things, all of them measured:
       ① `arr[i]||arr[0]` has NO inline-table fallback, so a language past the arguments given gets
          index 0 — English — for ever, whatever its ui.<code>.js says;
       ② most of those arrays are FOUR long (en/jp/de/ru) or TWO (en/jp), so even Spanish, which is
          positional, fell to English;
       ③ and none of it is visible to any instrument: an array literal is not a call, so the inline
          report, the positional audit and the two-branch audit all count zero of it and print 100 %.
     That is [[intmap-recurring-lessons]] B for the sixth time, and #R239's rule says the answer is
     not a seventh instrument — it is to stop the seventh SHAPE existing.

     ⚠ SO THE ARRAY IS WRITTEN AS A CALL. `LA('Temperature 2 m (ECMWF)','気温 2m（ECMWF）',…)`
     returns exactly the array it was given, so nothing about the data changes; what changes is that
     the file now contains a CallExpression whose callee is bound to `IntMapLang.pick…`, which is the
     one thing scripts/i18n-report.mjs and scripts/i18n-positional-audit.mjs look for. Both of them
     pick these up with no edit at all — the gate's universe grew by ~120 strings the moment the
     first table was converted, and it grew LOUDLY (they were all short).
     ⚠ AND RESOLUTION GOES THROUGH `pick()` ITSELF — `L.arr(x.label)` below — so a language past the
     arguments gets the inline table keyed by the English string, exactly like every other call site.
     There is no second fallback rule to keep in step. */
  function pickArgs() {
    return function () { return Array.prototype.slice.call(arguments); };
  }

  /* ══ (#R231) `t(lang, …)` — pick(), FOR THE 281 PLACES THAT NEVER HAD A HELPER ════════════════
     「まだ簡体・繁体中文に不十分な箇所があるから詰めて。また、それと同時に今後IntMapの設定言語を
       追加するのが、1発で終わるようにさらに柔軟な言語システムに。」

     #R221 made `L(…)` variadic and the coverage report said 100 % — and Chinese was still wrong on
     screen, because 281 call sites in js/ never went through `L(…)` at all. They are hand-written
     conditional chains:

         HOST.lang==='jp'?'データなし':HOST.lang==='de'?'Keine Daten':…:'No data'

     A chain like that does not degrade to English for a NEW language — it degrades to English for
     every language past the five it names, which is the same thing said in a way that hides it: the
     report cannot see these, so seven rounds of "100 % translated" were measuring the wrong body of
     text. And a chain is not extensible: a language added to LANGS above still has to be typed into
     281 expressions by hand, which is exactly what "1発で終わる" says must stop being true.

     ⚠ WHY `t(lang, …)` AND NOT A LOCAL `L`. Converting them needed a rewrite that is purely LOCAL —
     the chains live in factory closures, in template literals, in object literals and inside other
     conditionals, and inserting a `const L = …` per file would have needed scope analysis, a name
     that collides with nothing (js/data-layers.js already binds `L` four times to other things), and
     a decision about WHICH `lang` accessor each closure can see. Taking the language as the first
     argument removes all three questions: the chain's own `HOST.lang` expression is carried straight
     across, so scripts/lang-ternary-codemod.mjs rewrites an expression into an expression and
     touches nothing else. Behaviour is `pick()`'s, exactly — positional for the first five, the
     `inline` table for the rest, English underneath both. */
  function t(lang) {
    var n = arguments.length;
    if (n < 2) return '';
    var code; try { code = normalise(typeof lang === 'function' ? lang() : lang); } catch (e) { code = FALLBACK; }
    var i = idx[code];
    if (i == null) return arguments[1];
    if (i > 0 && i + 1 < n) { var v = arguments[i + 1]; if (v != null && v !== '') return v; }
    if (i !== 0) { var tb = inline[code]; if (tb) { var s = tb[arguments[1]]; if (s != null && s !== '') return s; } }
    return arguments[1];
  }

  /* ══ (#R231) THE BCP-47 TAG FOR `Intl`, FROM THE SAME ONE LIST ════════════════════════════════
     `toLocaleDateString(HOST.lang==='jp'?'ja-JP':…:'en-US')` appears at 18 call sites, and it is the
     same defect one level down: a Chinese reader got US-formatted dates inside an otherwise Chinese
     panel. The registry already carries each language's real tag (`html`), so nothing new has to be
     maintained — `locale()` is that tag, with a region where one is conventional for dates.

     ⚠ `enTag` EXISTS SO THIS CHANGES NOTHING FOR A READER OF ENGLISH. Half of those sites wrote
     'en-GB' and half 'en-US' — 24-hour vs 12-hour clocks, D MMM vs MMM D — and which one each panel
     chose is a decision this round was not asked to revisit. The call site keeps its own answer by
     passing it; only the languages that were falling through to it are affected. */
  /* ⚠ (#R315) THE OTHER FOUR ARE HERE NOW. `locale()` fell through to the bare BCP-47 tag for them,
     which is a legal tag but a poor one for the two callers that want a REGION: speech recognition
     (a bare 'zh' leaves the engine to guess Traditional or Simplified) and Intl formatting. These
     are facts a filename cannot carry, which is exactly the reason #R232 kept this table literal. */
  var REGION = { en: 'en-US', jp: 'ja-JP', de: 'de-DE', ru: 'ru-RU', es: 'es-ES',
                 zh: 'zh-TW', 'zh-hans': 'zh-CN', fr: 'fr-FR', ko: 'ko-KR' };
  function locale(code, enTag) {
    var c = normalise(code);
    if (c === FALLBACK) return enTag || REGION.en;
    if (REGION[c]) return REGION[c];
    var l = byCode[c];
    return l ? l.html : (enTag || REGION.en);
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

  /* ══ ⚠⚠⚠ (#R249) THE FIFTEENTH SURFACE — THE DOCUMENT'S OWN METADATA ═══════════════════════════
     「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。」

     Every i18n mechanism in this app walks ELEMENTS — `data-i18n`, `data-i18n-title`,
     `data-i18n-aria`, and the tables behind them. `<title>` and `<meta name="description">` are
     neither: they are the DOCUMENT's own metadata, nobody's innerText and nobody's attribute-key.
     In index.html both were literals in the markup, so the browser tab, the window list, the
     bookmark and every shared link read 「IntMap — Explore the world. Ask the map.」 in all nine
     languages — while every row of scripts/i18n-audit.mjs's matrix printed 100 %, because no
     instrument was looking at the document. Measured before the fix: switching the app to jp and
     then to zh left `document.title` byte-identical.

     ⚠ THE MECHANISM ALREADY EXISTED. js/page-i18n.js has localised exactly these two fields for
     sources.html and science.html since #R239. Only the application page never used it — which is
     [[intmap-recurring-lessons]] G (one behaviour, two implementations, the gap in the uninstrumented
     one) rather than a missing translation.

     ⚠ IT LIVES HERE, beside `syncChrome`, for the reason that function already gives: js/app-body.js
     has a line ceiling whose whole point is that a new subject goes to its own file (#R199/#R200,
     and [[intmap-recurring-lessons]] K — the ceiling comes DOWN, never up), and «make the document
     reflect the language» is the language subject. It is also where `htmlTag` and the keyed table
     already are, so the three things the document has to be told are told from one place.
     ⚠ `og:` / `twitter:` ARE DELIBERATELY NOT TOUCHED — a social-card crawler does not run this
     script, so writing them here changes nothing a crawler sees and only makes the markup disagree
     with itself. That is a BUILD-time question. scripts/i18n-doc-audit.mjs records the decision. */
  function syncDocument(code) {
    try {
      var c = normalise(code == null
        ? ((window.IntMapI18N && window.IntMapI18N.lang) ? window.IntMapI18N.lang() : FALLBACK)
        : code);
      document.documentElement.setAttribute('lang', htmlTag(c));
      var d = keyed(c);
      if (d && d.docTitle) document.title = d.docTitle;
      var md = document.querySelector('meta[name="description"]');
      if (md && d && d.docDesc) md.setAttribute('content', d.docDesc);
    } catch (e) {}
  }

  /* used by the settings picker and by anything that has to enumerate languages */
  function list() { return LANG_ROWS.map(function (l) { return { code: l.code, label: l.label, html: l.html, pill: l.pill || l.code.toUpperCase() }; }); }
  function htmlTag(code) { var l = byCode[normalise(code)]; return l ? l.html : 'en'; }

  /* ── THE CHROME, BUILT FROM THIS LIST ────────────────────────────────────────────────────────
     The header pills and the Settings dropdown were five literals in index.html, so a sixth language
     would have been invisible however completely it was translated. This ADDS whatever the page does
     not already have: the five that ship keep their exact markup and their `lang-<code>` ids (which
     the browser tests click), and a new row in LANGS appears in both places with no HTML edit.
     ⚠ It lives here rather than in js/app-body.js because that file has a line ceiling whose whole
     point is that new subjects go to their own file (#R199/#R200), and this is the language subject. */
  function syncChrome(onPick) {
    /* ⚠ (#R232) …AND THE DOCUMENT'S OWN LANGUAGE, which never followed a SAVED one. js/app-body.js
       sets it in setLang(), and setLang() returns early when the language is already current — which it
       always is on a cold load, because currentLang is seeded from the saved settings before any of this
       runs. So every DE/RU/ES/中文 reader has been served `<html lang="en"`: the wrong hyphenation and
       line-breaking rules, the wrong voice in a screen reader, the wrong `:lang()` matching, and English
       labels in js/night-sky.js, which falls back to this attribute. Here because this file is the one
       that knows the tag, and syncChrome is already the boot-time «build the chrome from the list» pass. */
    /* (#R249) …and the document's TITLE and DESCRIPTION with it — one function tells the document
       everything it has to know about the language. See syncDocument for why they were English. */
    syncDocument(null);
    try {
      var bar = document.querySelector('.lang-toggle');
      var sel = document.getElementById('setting-lang');
      LANG_ROWS.forEach(function (l) {
        if (bar && !document.getElementById('lang-' + l.code)) {
          var b = document.createElement('button');
          b.className = 'lang-btn'; b.id = 'lang-' + l.code;
          /* ⚠ (#R224) `pill` EXISTS BECAUSE A CODE IS NOT ALWAYS A LABEL. The bar is a row of
             two-letter pills; 'ZH-HANS'.toUpperCase() is seven characters and would wrap the row on
             a phone. A language may therefore name its own pill — the two Chinese rows use 繁 / 简,
             which is what a reader of either script actually looks for — and the full name stays in
             the tooltip. Everything else keeps the code, so the five shipped pills are unchanged. */
          b.textContent = l.pill || l.code.toUpperCase(); b.title = l.label;
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
  function codes() { return LANG_ROWS.map(function (l) { return l.code; }); }

  /* (#R232) the reading pages have no bundler, so their language list arrives as a plain global that
     scripts/i18n-langs.mjs regenerates from the locale directory on every build. In the app this is
     absent and js/locale-boot.js does the same job from the real module graph. */
  try { if (typeof window !== 'undefined' && window.IntMapLangCodes) declare(window.IntMapLangCodes); } catch (e) {}

  /* ══ (#R315) WHAT THIS LANGUAGE IS CALLED **IN ENGLISH** ═══════════════════════════════════════
     Not for a reader — for a MODEL. Four prompts tell the model which language to answer in, and
     they were doing it with `t(lang,'English','Japanese','German','Russian','Spanish')`. `t()` is
     positional for five languages and falls back to the locale's inline table for the rest, and
     js/locales/ui.zh.js quite correctly translates the string 'English' as 英文 — so a Traditional
     Chinese reader's prompt read «Write your ENTIRE response in 英文 only», i.e. it told the model
     to answer in ENGLISH, in Chinese. French and Korean have no such entry and fell through to the
     English key, which said the same thing outright. Three of the nine languages could not get an
     answer in their own language, and nothing was broken enough to notice.
     The name is DERIVED (Intl.DisplayNames in the 'en' locale), so a tenth language is still one
     file: the table below is only the offline fallback, and `derive()` keeps this honest by never
     letting a code answer with itself. */
  var EN_NAME = { en: 'English', jp: 'Japanese', de: 'German', ru: 'Russian', es: 'Spanish',
                  zh: 'Traditional Chinese', 'zh-hans': 'Simplified Chinese', fr: 'French', ko: 'Korean' };
  function englishName(code) {
    var c = normalise(code);
    try {
      var n = new Intl.DisplayNames(['en'], { type: 'language' }).of(htmlTag(c));
      /* Intl answers with the TAG itself when it does not know one; a prompt saying «answer in
         zh-Hant» is not an instruction a model can follow, so that answer is refused here. */
      if (n && !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(n)) return n;
    } catch (e) { /* no Intl.DisplayNames → the table below */ }
    return EN_NAME[c] || EN_NAME[FALLBACK];
  }
  /* The inverse: a language NAME the model or a detector produced → this app's internal code.
     Built from englishName() so the two can never disagree, plus the names a language detector
     may return for languages IntMap does not have (they resolve to nothing, not to Japanese). */
  function codeForEnglishName(name) {
    var want = String(name == null ? '' : name).trim().toLowerCase();
    if (!want) return '';
    for (var i = 0; i < LANG_ROWS.length; i++) {
      var c = LANG_ROWS[i].code;
      if (englishName(c).toLowerCase() === want) return c;
    }
    if (want === 'chinese') return 'zh';
    return '';
  }
  return { LANGS: LANG_ROWS, FALLBACK: FALLBACK, list: list, codes: codes, syncChrome: syncChrome,
           define: define, pick: pick, pickArgs: pickArgs, keyed: keyed, t: t, locale: locale,
           normalise: normalise, has: has, index: index, htmlTag: htmlTag, syncDocument: syncDocument,
           englishName: englishName, codeForEnglishName: codeForEnglishName,
           /* (#R232) discovery + lazy loading */
           declare: declare, ensure: ensure, isLoaded: isLoaded, onDefine: onDefine,
           /* for the coverage report and the tests */
           _ui: ui, _inline: inline, _derive: derive };
})();
