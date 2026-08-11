/* ============================================================================
 *  IntMap · The reading pages' language machine — window.IntMapPageI18N   (#R218)
 * ----------------------------------------------------------------------------
 *  「五言語対応に。今後、対応言語をさらに増やしていく方針です。容易に言語を追加できるように
 *    準備しておいて。」
 *
 *  ══ WHY THE PAGES ARE NOW DATA AND NOT MARKUP ═══════════════════════════════════════════════
 *  sources.html and science.html used to carry BOTH languages inline, as sibling
 *  <span data-l="ja"> / <span data-l="en"> pairs, with CSS showing one and hiding the other.
 *  184 of those pairs between the two pages. At two languages that is merely verbose; at five
 *  it is 460 spans, and every edit to one sentence means finding its four siblings by eye. The
 *  cost of a NEW language under that scheme is a full pass over both HTML files — which is the
 *  exact thing the instruction asks not to be true.
 *
 *  So the prose left the markup. Each page is now a shell that renders one DOCUMENT object, and
 *  a document is one file per language:
 *
 *      js/locales/pages.en.js   →  IntMapPageI18N.define('en', { sources:{…}, science:{…} })
 *      js/locales/pages.ja.js   →  IntMapPageI18N.define('ja', …)
 *      js/locales/pages.de.js   ·  .ru.js  ·  .es.js
 *
 *  ⚠ ADDING A LANGUAGE IS TWO EDITS AND NEITHER OF THEM IS HTML:
 *      1. copy js/locales/pages.en.js to js/locales/pages.<code>.js and translate it;
 *      2. add one row to LANGS below.
 *  Nothing else in the app has to know. The loader fetches only the language being read (plus
 *  English, which is the fallback for any key a young translation has not reached yet), so the
 *  cost of the sixth language to a reader of the first five is zero bytes.
 *
 *  ⚠ AND THE FALLBACK IS PER KEY, NOT PER PAGE. A half-translated document must not drop the
 *  reader into an English page — it renders in their language and only the missing sentences
 *  come from English. `pick()` walks lang → en for every leaf.
 *
 *  ══ WHAT A DOCUMENT LOOKS LIKE ═══════════════════════════════════════════════════════════════
 *      { title, sub, footer:[…], sections:[ { id, nav, h, blocks:[ … ] } ] }
 *  and a block is one of:
 *      ['tagline', html]                 the grey line under a heading
 *      ['p',       html]                 a paragraph
 *      ['h3',      text]                 a sub-heading
 *      ['ul',      [html, …]]            a list
 *      ['eq',      html]                 a display equation (monospace, scrolls on its own)
 *      ['lim',     html]                 the ⚠ limitation callout
 *      ['note',    html]                 the quiet source/footnote rule
 *      ['table',   [head…], [[cell…]…]]  a table (scrolls inside its own box)
 *      ['slot',    id]                   a hole the page fills in itself (the registry list)
 *
 *  The strings carry inline HTML (<b>, <code>, <a>, <sup>) exactly as the old markup did. They
 *  are OUR OWN FILES, shipped with the app and served from our own origin — the same trust the
 *  markup they replaced had. Nothing here ever renders a string that came from a fetch.
 * ========================================================================== */
window.IntMapPageI18N = (function () {
  'use strict';

  /* ── the languages. ONE row per language, and this is the only list. ────────────────────────
     `code` is the file suffix AND the <html lang>; `label` is the language's own name, because
     a language picker that names languages in a language you cannot read is not a picker. */
  var LANGS = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ru', label: 'Русский' },
    { code: 'es', label: 'Español' }
  ];
  var FALLBACK = 'en';
  var STORE = 'intmap_science_lang';   /* the key the two pages have used since #R211 */

  var docs = Object.create(null);      /* code → document, filled by define() */
  var pending = Object.create(null);   /* code → [resolve…] while its <script> is in flight */
  var current = null, mounted = null;

  function has(code) { return LANGS.some(function (l) { return l.code === code; }); }

  /* ── loading. One <script> per language, once, and never for a language we do not list. ──── */
  function load(code) {
    if (!has(code)) return Promise.resolve(null);
    if (docs[code]) return Promise.resolve(docs[code]);
    if (pending[code]) return new Promise(function (r) { pending[code].push(r); });
    pending[code] = [];
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = './js/locales/pages.' + code + '.js';
      s.async = true;
      s.onload = function () { done(); };
      /* ⚠ A MISSING TRANSLATION FILE IS NOT A BROKEN PAGE. It resolves to null and the caller
         falls back to English — which is the same behaviour a key-level miss already has. */
      s.onerror = function () { done(); };
      function done() {
        var d = docs[code] || null;
        (pending[code] || []).forEach(function (r) { try { r(d); } catch (e) {} });
        delete pending[code];
        res(d);
      }
      document.head.appendChild(s);
    });
  }

  /* the locale files call this */
  function define(code, doc) { if (code && doc) docs[code] = doc; }

  /* ── which language to open in ────────────────────────────────────────────────────────────
     Order: an explicit ?lang= (so a link can carry one) → what this reader last chose here →
     the app's own setting (its 'jp' is this page's 'ja') → the browser → English. */
  function detect() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q && has(normalise(q))) return normalise(q);
    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) {}
    if (saved && has(normalise(saved))) return normalise(saved);
    try {
      var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}');
      if (s && s.lang && has(normalise(s.lang))) return normalise(s.lang);
    } catch (e) {}
    var navs = [];
    try { navs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || '']; } catch (e) {}
    for (var i = 0; i < navs.length; i++) {
      var c = normalise(String(navs[i]).slice(0, 2).toLowerCase());
      if (has(c)) return c;
    }
    return FALLBACK;
  }
  /* the app writes Japanese as 'jp'; every page and every <html lang> writes it as 'ja' */
  function normalise(c) { c = String(c || '').toLowerCase(); return (c === 'jp') ? 'ja' : c; }

  /* ── the app's own theme, so this page opens in the mode the map was in ─────────────────── */
  function applyTheme() {
    try {
      var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}');
      var t = s && s.theme;
      if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
  }

  /* ── the per-key fallback ─────────────────────────────────────────────────────────────────
     `pick(path)` reads the current document and, for anything missing, the English one. It is
     used for the leaves the SHELL needs (title, sub, chrome); section bodies come from
     `sectionsOf()`, which does the same walk one level up. */
  function at(doc, path) {
    var v = doc;
    for (var i = 0; i < path.length && v != null; i++) v = v[path[i]];
    return v;
  }
  function pick(page, key) {
    var v = at(docs[current] || {}, [page, key]);
    if (v == null || v === '') v = at(docs[FALLBACK] || {}, [page, key]);
    return (v == null) ? '' : v;
  }
  /* sections merge by id: a translation that is missing §7 still shows §7, in English. */
  function sectionsOf(page) {
    var mine = at(docs[current] || {}, [page, 'sections']) || [];
    var base = at(docs[FALLBACK] || {}, [page, 'sections']) || [];
    if (!base.length) return mine;
    var byId = Object.create(null);
    mine.forEach(function (s) { if (s && s.id) byId[s.id] = s; });
    return base.map(function (s) { return (s && s.id && byId[s.id]) || s; });
  }

  /* ── rendering ────────────────────────────────────────────────────────────────────────────
     Blocks are built with the DOM rather than concatenated, so a malformed row in one locale
     file cannot swallow the rest of the page. Inline HTML inside a leaf is still innerHTML —
     see the header note on why that is the same trust the markup it replaced had. */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function renderBlock(b, host, slots) {
    if (!b || !b.length) return;
    var kind = b[0];
    if (kind === 'p') host.appendChild(el('p', null, b[1]));
    else if (kind === 'tagline') host.appendChild(el('p', 'pg-tagline', b[1]));
    else if (kind === 'h3') host.appendChild(el('h3', null, b[1]));
    else if (kind === 'eq') host.appendChild(el('p', 'pg-eq', b[1]));
    else if (kind === 'lim') host.appendChild(el('div', 'pg-lim', '<b>⚠</b> ' + b[1]));
    else if (kind === 'note') host.appendChild(el('p', 'pg-note', b[1]));
    else if (kind === 'ul') {
      var ul = document.createElement('ul');
      (b[1] || []).forEach(function (t) { ul.appendChild(el('li', null, t)); });
      host.appendChild(ul);
    } else if (kind === 'table') {
      var wrap = el('div', 'pg-tablewrap');
      var tb = document.createElement('table');
      if (b[1] && b[1].length) {
        var tr = document.createElement('tr');
        b[1].forEach(function (h) { tr.appendChild(el('th', null, h)); });
        tb.appendChild(tr);
      }
      (b[2] || []).forEach(function (row) {
        var r = document.createElement('tr');
        row.forEach(function (c) { r.appendChild(el('td', null, c)); });
        tb.appendChild(r);
      });
      wrap.appendChild(tb); host.appendChild(wrap);
    } else if (kind === 'slot') {
      var d = document.createElement('div');
      d.id = b[1];
      host.appendChild(d);
      if (slots) slots.push(b[1]);
    }
  }

  function renderInto(page, root) {
    var slots = [];
    root.innerHTML = '';

    /* hero */
    var hero = el('header', 'pg-hero');
    hero.appendChild(el('h1', null, pick(page, 'title')));
    hero.appendChild(el('p', 'pg-sub', pick(page, 'sub')));
    root.appendChild(hero);

    var secs = sectionsOf(page);

    /* contents */
    var toc = el('nav', 'pg-toc');
    toc.appendChild(el('h2', null, pick('common', 'contents')));
    var ol = document.createElement('ol');
    secs.forEach(function (s) {
      var li = document.createElement('li');
      var a = el('a', null, s.nav || s.h || s.id);
      a.href = '#' + s.id;
      li.appendChild(a); ol.appendChild(li);
    });
    toc.appendChild(ol);
    root.appendChild(toc);

    /* the sections */
    secs.forEach(function (s, i) {
      var sec = el('section', 'pg-sec');
      sec.id = s.id;
      var h = el('h2', null, (i + 1) + '. ' + (s.h || ''));
      if (s.count) { var c = el('span', 'pg-count'); c.id = s.count; h.appendChild(c); }
      sec.appendChild(h);
      (s.blocks || []).forEach(function (b) { renderBlock(b, sec, slots); });
      root.appendChild(sec);
    });

    /* footer */
    var foot = el('footer', 'pg-foot');
    (pick(page, 'footer') || []).forEach(function (t) { foot.appendChild(el('p', null, t)); });
    var back = el('p');
    var a2 = el('a', null, '← ' + pick('common', 'backToMap'));
    a2.href = './index.html';
    back.appendChild(a2); foot.appendChild(back);
    root.appendChild(foot);

    return slots;
  }

  function renderChrome(page) {
    var b = document.querySelector('.pg-back');
    if (b) {
      b.innerHTML = '← <span class="pg-back-t"></span>';
      b.querySelector('.pg-back-t').textContent = pick('common', 'backToMap');
    }
    var sib = document.querySelector('.pg-sibling');
    if (sib) {
      var other = (page === 'sources') ? 'science' : 'sources';
      sib.href = './' + other + '.html';
      sib.innerHTML = '<span class="pg-sibling-t"></span> →';
      sib.querySelector('.pg-sibling-t').textContent = pick('common', other === 'science' ? 'toScience' : 'toSources');
      sib.setAttribute('aria-label', pick('common', other === 'science' ? 'toScience' : 'toSources'));
    }
    var t = pick(page, 'title');
    if (t) document.title = 'IntMap — ' + String(t).replace(/<[^>]*>/g, '');
    var md = document.querySelector('meta[name="description"]');
    if (md && pick(page, 'meta')) md.setAttribute('content', pick(page, 'meta'));
    var sel = document.getElementById('pg-lang-select');
    if (sel) sel.value = current;
  }

  /* ── the public entry point ───────────────────────────────────────────────────────────────
     `mount({page, root, onRender})` loads English + the detected language, renders, and wires
     the picker. `onRender(slots)` is how a page fills a ['slot', id] block with something it
     generates itself — sources.html's registry list is the only one today. */
  function mount(opts) {
    opts = opts || {};
    mounted = opts;
    applyTheme();
    var root = (typeof opts.root === 'string') ? document.querySelector(opts.root) : opts.root;
    if (!root) return Promise.resolve(null);
    buildPicker(opts.page);
    return setLang(detect(), true);
  }

  function buildPicker(page) {
    var host = document.querySelector('.pg-lang');
    if (!host || host.__built) return;
    host.__built = true;
    var globe = el('span', 'pg-lang-globe', '\u{1F310}');
    var sel = document.createElement('select');
    sel.id = 'pg-lang-select';
    sel.setAttribute('aria-label', 'Language');
    LANGS.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l.code; o.textContent = l.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { setLang(sel.value, false); });
    var chev = el('span', 'pg-lang-chev', '▾');
    host.appendChild(globe); host.appendChild(sel); host.appendChild(chev);
  }

  function setLang(code, initial) {
    code = normalise(code);
    if (!has(code)) code = FALLBACK;
    current = code;
    document.documentElement.setAttribute('lang', code);
    try { localStorage.setItem(STORE, code); } catch (e) {}
    var need = (code === FALLBACK) ? [FALLBACK] : [FALLBACK, code];
    return Promise.all(need.map(load)).then(function () {
      if (!mounted) return null;
      var root = (typeof mounted.root === 'string') ? document.querySelector(mounted.root) : mounted.root;
      if (!root) return null;
      var slots = renderInto(mounted.page, root);
      renderChrome(mounted.page);
      if (typeof mounted.onRender === 'function') { try { mounted.onRender(slots, code); } catch (e) {} }
      /* an in-page anchor survives a language change: the ids are language-independent */
      if (initial && location.hash) {
        try { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); } catch (e) {}
      }
      return code;
    });
  }

  return {
    LANGS: LANGS, FALLBACK: FALLBACK,
    define: define, mount: mount, setLang: setLang,
    /* the whole document for a language, for a reader that is NOT one of these two pages — the app's
       own Sources dialog lazily loads js/locales/pages.<lang>.js for `sourceUse` (#R218). */
    doc: function (code) { return docs[normalise(code)] || null; },
    lang: function () { return current; },
    pick: pick, normalise: normalise, has: has
  };
})();
