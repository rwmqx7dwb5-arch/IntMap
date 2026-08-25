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

  /* ══ ⚠⚠ (#R231) THIS WAS THE APP'S SECOND LANGUAGE REGISTRY, AND IT IS WHY THE READING PAGES
     HAD NO CHINESE AT ALL ══════════════════════════════════════════════════════════════════════
     「まだ簡体・繁体中文に不十分な箇所があるから詰めて。また、それと同時に今後IntMapの設定言語を
       追加するのが、1発で終わるようにさらに柔軟な言語システムに。」

     The five rows below were a LITERAL LIST, written here in #R218 — and js/lang-registry.js, added
     three rounds later, was written believing it was "the only one in the app". So when #R223 added
     繁體中文 and #R224 added 简体中文, both landed in that registry and neither reached this one: a
     reader who set the app to Chinese opened Data sources and got an English page whose picker did
     not even offer Chinese. Two lists is one list too many, and the second one is always the one
     nobody remembers.

     ⚠ THE SUFFIX IS THE BCP-47 TAG, WHICH IS WHAT THIS FILE ALREADY USED. A row's `html` is 'en',
     'ja', 'de', 'ru', 'es' for the five that ship — byte-identical to the list this replaces, so no
     locale file is renamed and no saved `intmap_science_lang` value stops resolving — and 'zh-Hant'
     / 'zh-Hans' for the two new ones, which is also the correct <html lang> for them.

     ⚠ AND IT STILL FALLS BACK TO A LITERAL. sources.html and science.html load js/lang-registry.js
     ahead of this file, but a page that failed to (or a future consumer that embeds only this one)
     must not lose its languages — so the five are kept as the answer of last resort. */
  var LANGS = (function () {
    try {
      var rows = window.IntMapLang && window.IntMapLang.list ? window.IntMapLang.list() : null;
      if (rows && rows.length) return rows.map(function (l) { return { code: String(l.html).toLowerCase(), label: l.label }; });
    } catch (e) {}
    return [
      { code: 'en', label: 'English' },
      { code: 'ja', label: '日本語' },
      { code: 'de', label: 'Deutsch' },
      { code: 'ru', label: 'Русский' },
      { code: 'es', label: 'Español' }
    ];
  })();
  var FALLBACK = 'en';
  var STORE = 'intmap_science_lang';   /* the key the two pages have used since #R211 */

  var docs = Object.create(null);      /* code → document, filled by define() */
  var pending = Object.create(null);   /* code → [resolve…] while its <script> is in flight */
  var current = null, mounted = null;

  function has(code) { return LANGS.some(function (l) { return l.code === code; }); }

  /* ── loading. One <script> per language, once, and never for a language we do not list. ──── */
  function load(code) {
    /* ⚠ THE URL IS BUILT FROM OUR OWN TABLE, NOT FROM THE ARGUMENT. `code` can originate in a
       `?lang=` query parameter, and although `has()` already restricts it to the five literals above,
       "a URL assembled from a parameter" is a shape worth not having at all — CodeQL flags it and it
       is right to: one future edit that moves the guard makes it a real injection. Taking the row and
       using ITS `code` means the string in the `src` provably comes from LANGS. */
    var row = null;
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) { row = LANGS[i]; break; }
    if (!row) return Promise.resolve(null);
    code = row.code;
    if (docs[code]) return Promise.resolve(docs[code]);
    if (pending[code]) return new Promise(function (r) { pending[code].push(r); });
    pending[code] = [];
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = './js/locales/pages.' + row.code + '.js';
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
  /* The app writes Japanese as 'jp'; every page and every <html lang> writes it as 'ja'.
     (#R231) …and the app writes Traditional/Simplified Chinese as 'zh' / 'zh-hans' while this file's
     suffixes are their BCP-47 tags, so the registry — which owns every alias either spelling has —
     does the mapping when it is present. The 'jp' special case stays as the answer of last resort,
     for the same reason LANGS keeps its literal fallback above. */
  function normalise(c) {
    c = String(c || '').toLowerCase();
    try {
      var LR = window.IntMapLang;
      if (LR && LR.has && LR.has(c)) return String(LR.htmlTag(c)).toLowerCase();
    } catch (e) {}
    return (c === 'jp') ? 'ja' : c;
  }

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
  /* Sections merge by id: a translation that is missing §7 still shows §7, in English.
     ⚠ (#R231) …AND NOW PER FIELD WITHIN A SECTION, WHICH IS WHAT THE HEADER ALWAYS CLAIMED.
     「AND THE FALLBACK IS PER KEY, NOT PER PAGE」 was true of `pick()` and false here: a translated
     section REPLACED the English one wholesale, so a locale file that gave §7 a heading and no
     `blocks` deleted seven paragraphs of prose rather than leaving them in English. That made a
     partial translation impossible to deliver — the only safe locale file was a complete one, which
     is exactly the wall 「1発で終わる」 is about, and the reason the two Chinese page files could not
     simply be started. Each field now falls back on its own: heading and nav from the translation,
     prose from English until the translation reaches it. */
  function sectionsOf(page) {
    var mine = at(docs[current] || {}, [page, 'sections']) || [];
    var base = at(docs[FALLBACK] || {}, [page, 'sections']) || [];
    if (!base.length) return mine;
    var byId = Object.create(null);
    mine.forEach(function (s) { if (s && s.id) byId[s.id] = s; });
    return base.map(function (s) {
      var t = (s && s.id) ? byId[s.id] : null;
      if (!t) return s;
      var out = {};
      Object.keys(s).forEach(function (k) { out[k] = s[k]; });
      Object.keys(t).forEach(function (k) {
        var v = t[k];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;   /* an empty field is not a translation */
        out[k] = v;
      });
      return out;
    });
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

  /* ── (#R221) KaTeX, loaded once and only if the document has an equation in it ─────────────────
     ⚠ THE PAGE IS NOT PART OF THE APP BUNDLE, so it cannot `import 'katex'`; vite.config.js copies
     katex/dist into dist/katex/ for exactly this. ⚠ AND IT IS NEVER FETCHED FOR A PAGE WITHOUT
     MATHEMATICS: sources.html has none, and pays nothing for this. */
  var needTex = false, katexP = null;
  function ensureKatex() {
    if (katexP) return katexP;
    katexP = new Promise(function (res) {
      try {
        var css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = './katex/katex.min.css';
        document.head.appendChild(css);
        var s = document.createElement('script');
        s.src = './katex/katex.min.js';
        s.async = true;
        s.onload = function () { res(window.katex || null); };
        s.onerror = function () { res(null); };     /* the pg-eq fallback stands */
        document.head.appendChild(s);
      } catch (e) { res(null); }
    });
    return katexP;
  }
  function typeset(root) {
    if (!needTex) return;
    ensureKatex().then(function (K) {
      if (!K || !K.render) return;                  /* leave the monospace source in place */
      var nodes = root.querySelectorAll('.pg-tex[data-tex]');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i], src = n.getAttribute('data-tex');
        try {
          n.textContent = '';
          K.render(src, n, { displayMode: true, throwOnError: false, output: 'html', strict: false });
          n.classList.add('pg-tex-on');
        } catch (e) { n.textContent = src; }        /* one bad formula must not blank the page */
      }
    });
  }
  function renderBlock(b, host, slots) {
    if (!b || !b.length) return;
    var kind = b[0];
    /* ══ (#R221) ['tex', latex] — A REAL EQUATION ═══════════════════════════════════════════════════
       「数式はそのままのテキストだから、もっとちゃんとした数式用のテキストに。」 `['eq', …]` is a
       monospace line carrying HTML entities: `&Delta;(z) = 40 075 017 &middot; cos(&phi;) / (2<sup>z</sup>…)`.
       That is a transcription of an equation, not an equation — fractions are slashes, integrals are
       the word, and nothing aligns. This block hands the LaTeX to KaTeX.
       ⚠ IT DEGRADES TO THE OLD LINE. The typeset node is built only after katex.min.js has actually
       arrived (see ensureKatex); until then, and for ever if it does not, the block IS a `pg-eq`
       with the source in it. A reader on a broken CDN-less network sees `\frac{a}{b}` rather than a
       blank space, which is the same trade every other fallback in this file makes. */
    if (kind === 'tex') {
      const p = el('p', 'pg-eq pg-tex');
      p.textContent = b[1];
      p.setAttribute('data-tex', b[1]);
      host.appendChild(p);
      needTex = true;
      return;
    }
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
    needTex = false;   /* (#R221) recomputed per render — a language switch re-walks the blocks */
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
    wireBack(a2);
    back.appendChild(a2); foot.appendChild(back);
    root.appendChild(foot);

    typeset(root);   /* (#R221) once, after the whole document is in the DOM */
    return slots;
  }

  /* ══ (#R231) "BACK TO THE MAP" MEANS THE MAP YOU LEFT, NOT A NEW ONE ═════════════════════════
     「データ出典ページやロジック解説ページからマップに戻るボタンを押したら、さっきのマップに戻る
       のではなく、新たなマップを起動してしまう。元のページに戻るようにして。」

     `href="./index.html"` is a fresh navigation: the app boots from zero and the reader loses the
     camera, the layers, the time slider and every panel they had open — which on a phone is a
     ten-second cold start to get back to a view they were already looking at.

     ⚠⚠ (#R232) …AND `history.back()` NEVER RAN, WHICH IS WHY THE INSTRUCTION CAME BACK. The app opens
     both pages with `target="_blank"`. A brand-new tab has ONE session-history entry, so the guard
     `history.length <= 1` below was true every single time and every click fell through to the href —
     booting a SECOND map in this tab, which is precisely the reported symptom. The map the reader left
     was never in this tab's history at all; it is in the tab that opened this one.

     ⚠ SO THE LADDER IS THREE RUNGS, WIDEST FIRST, AND THE HREF IS STILL THE FLOOR:
       ① this tab was opened BY the map (window.opener is a live same-origin window) → focus that tab
          and close this one. That is "元のページに戻る" exactly: the reader's camera, layers, time
          slider and open panels are all still sitting there, untouched, with nothing to re-boot.
          index.html hands us the opener on purpose (`rel="opener"` — see the note beside those links).
          ⚠ close() can be refused (an extension, a policy, a tab the user re-used); the fallback runs
          on a timer if we are still here, so a refusal degrades to the old behaviour instead of a
          dead button.
       ② otherwise, if we were navigated to IN this tab from a same-origin page → history.back().
       ③ otherwise (bookmark, search engine, a shared link) → the href, a fresh map, unchanged. A
          visitor who came from Google is NOT sent back to Google, which would be the same defect
          mirrored.
     Only an unmodified primary click is intercepted, so middle-click, ⌘/ctrl-click and "open in new
     tab" keep meaning what they mean. */
  function wireBack(a) {
    if (!a || a.__back) return; a.__back = true;
    a.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      /* ① the tab that opened us is the map */
      var op = null;
      try { op = (window.opener && !window.opener.closed) ? window.opener : null; } catch (_) { op = null; }
      if (op) {
        e.preventDefault();
        try { op.focus(); } catch (_) {}
        var href = a.href;
        setTimeout(function () { try { if (!window.closed) location.href = href; } catch (_) {} }, 350);
        try { window.close(); } catch (_) {}
        return;
      }
      /* ② we were navigated to inside this tab, from this site */
      var sameSite = false;
      try { sameSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (_) {}
      if (!sameSite || history.length <= 1) return;   /* ③ falls through to the href */
      e.preventDefault();
      history.back();
    });
  }

  function renderChrome(page) {
    var b = document.querySelector('.pg-back');
    if (b) {
      b.innerHTML = '← <span class="pg-back-t"></span>';
      b.querySelector('.pg-back-t').textContent = pick('common', 'backToMap');
      wireBack(b);                                  /* (#R231) the header arrow, same rule as the footer's */
    }
    var sib = document.querySelector('.pg-sibling');
    if (sib) {
      var other = (page === 'sources') ? 'science' : 'sources';
      sib.href = './' + other + '.html';
      sib.innerHTML = '<span class="pg-sibling-t"></span> →';
      sib.querySelector('.pg-sibling-t').textContent = pick('common', other === 'science' ? 'toScience' : 'toSources');
      sib.setAttribute('aria-label', pick('common', other === 'science' ? 'toScience' : 'toSources'));
    }
    /* ⚠ NO REGEX "SANITISER" HERE. This used to be `.replace(/<[^>]*>/g,'')`, which is the classic
       incomplete multi-character sanitisation — `<scr<script>ipt>` survives one pass of it — and it
       was not needed in the first place: `document.title` is a TEXT sink and never interprets markup.
       The titles carry HTML ENTITIES (they are also rendered with innerHTML in the hero), so the only
       thing to do here is turn those back into characters, from a fixed table. Nothing is stripped,
       because nothing has to be. */
    var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–' };
    var plain = function (v) {
      return String(v == null ? '' : v).replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, function (m, g) {
        if (g.charAt(0) === '#') {
          var n = (g.charAt(1) === 'x' || g.charAt(1) === 'X') ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
          return isFinite(n) ? String.fromCharCode(n) : m;
        }
        return Object.prototype.hasOwnProperty.call(ENT, g) ? ENT[g] : m;
      });
    };
    var t = pick(page, 'title');
    if (t) document.title = 'IntMap — ' + plain(t);
    var md = document.querySelector('meta[name="description"]');
    if (md && pick(page, 'meta')) md.setAttribute('content', pick(page, 'meta'));
    var sel = document.getElementById('pg-lang-select');
    if (sel) {
      sel.value = current;
      /* (#R459) …and its accessible name, which buildPicker() could only have written in English:
         it runs once, before the first setLang, so the language was not known there yet. */
      /* ⚠ (#R459) FROM `common` IN pages.*.js, NOT FROM `IntMapLang.t(…)`. MEASURED in the
         browser: sources.html loads pages.*.js and js/lang-registry.js and nothing else, so `t()`
         here resolves only the five POSITIONAL languages — the inline table fr / ko / zh need is
         in js/locales/ui.*.js, which no reading page loads. Russian came out 「Язык」 and French
         stayed 「Language」. `common` is the nine-language table these pages DO carry. */
      var name = pick('common', 'language');
      if (name) sel.setAttribute('aria-label', name);
    }
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
