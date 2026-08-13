/* ============================================================================
 *  IntMap · about.html — the homepage's one script
 * ----------------------------------------------------------------------------
 *  Seven small jobs, none of which is allowed to cost a scroll frame:
 *    ① language        — English is the markup; another language is one file, swapped in
 *    ② chrome          — the sticky header's glass, granted only once the page has moved
 *    ③ reveal          — one IntersectionObserver, one class, unobserve on first hit
 *    ④ motion          — ONE rAF-batched scroll reader writing four custom properties
 *    ⑤ hero rotation   — three real screenshots, cross-faded
 *    ⑥ Atlas line      — the typed example prompts
 *    ⑦ returning visit — offer the map to somebody who already has a session
 *
 *  ══ NO innerHTML, ANYWHERE ══════════════════════════════════════════════════════════════════
 *  Every string this file writes goes through `textContent` or `setAttribute('alt', …)`. That is
 *  not caution about our own locale files (they are ours, served from our origin, exactly as
 *  js/locales/pages.*.js are) — it is that a landing page reads `?lang=` from the URL, and a page
 *  with no HTML sink at all cannot be argued into having one later.
 *
 *  ══ WHY THE LANGUAGE LIST IS SHORT AND THE REGISTRY IS STILL CONSULTED ══════════════════════
 *  IntMap ships nine interface languages. This page ships two documents, because a landing page
 *  is prose written to persuade rather than UI strings, and a half-translated one reads worse than
 *  an English one. `HAVE` below is therefore the list of about-locale FILES — but the label each
 *  one is shown under comes from js/lang-registry.js, the app's one language list, so the picker
 *  here can never disagree with the picker in the app about what a language is called.
 *
 *  ⚠ ADDING A LANGUAGE IS TWO EDITS AND NEITHER OF THEM IS about.html:
 *      1. copy js/locales/about.en.js → js/locales/about.<bcp47>.js and translate it;
 *      2. add that tag to HAVE.
 * ==========================================================================*/
window.IntMapAbout = (function () {
  'use strict';

  var HAVE = ['en', 'ja'];          /* one entry per js/locales/about.<code>.js */
  var FALLBACK = 'en';
  var STORE = 'intmap_about_lang';

  var docs = Object.create(null);   /* code → document, filled by define() */
  var pending = Object.create(null);
  var current = FALLBACK;

  var root = document.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* the heavy motion (3-D tilt, parallax) is a DESKTOP affordance. A phone gets the reveal and
     the cross-fade and nothing that reads the scroll position every frame — see css/about.css. */
  var fx = false;
  try {
    fx = !reduce && window.innerWidth >= 900 && window.matchMedia('(pointer: fine)').matches;
  } catch (e) { fx = false; }

  /* ══ ① LANGUAGE ═══════════════════════════════════════════════════════════════════════════ */

  /* label + tag for a code, from the app's registry when it is present (about.html loads it) */
  function rows() {
    var out = [];
    var reg = null;
    try { reg = (window.IntMapLang && window.IntMapLang.list) ? window.IntMapLang.list() : null; } catch (e) {}
    HAVE.forEach(function (tag) {
      var label = tag;
      if (reg) {
        for (var i = 0; i < reg.length; i++) {
          if (String(reg[i].html).toLowerCase() === tag) { label = reg[i].label; break; }
        }
      }
      if (label === tag) label = (tag === 'ja') ? '日本語' : 'English';   /* registry absent → the two literals */
      out.push({ code: tag, label: label });
    });
    return out;
  }

  function has(c) { return HAVE.indexOf(c) >= 0; }

  /* The app writes Japanese as 'jp'; every page and every <html lang> writes it as 'ja'. The
     registry owns every alias either spelling has, and the 'jp' case stays as the last resort —
     the same ladder js/page-i18n.js uses. */
  function normalise(c) {
    c = String(c || '').toLowerCase();
    try {
      var LR = window.IntMapLang;
      if (LR && LR.has && LR.has(c)) return String(LR.htmlTag(c)).toLowerCase();
    } catch (e) {}
    if (c === 'jp') return 'ja';
    return c.split('-')[0];
  }

  /* ⚠ THE URL IS BUILT FROM OUR OWN TABLE, NOT FROM THE ARGUMENT — `code` can originate in
     `?lang=`, and although has() already restricts it to HAVE, "a src assembled from a query
     parameter" is a shape worth not having at all. Same reasoning as js/page-i18n.js. */
  function load(code) {
    var tag = null;
    for (var i = 0; i < HAVE.length; i++) if (HAVE[i] === code) { tag = HAVE[i]; break; }
    if (!tag || tag === FALLBACK) return Promise.resolve(null);   /* English IS the markup */
    if (docs[tag]) return Promise.resolve(docs[tag]);
    if (pending[tag]) return new Promise(function (r) { pending[tag].push(r); });
    pending[tag] = [];
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = './js/locales/about.' + tag + '.js';
      s.async = true;
      /* ⚠ A MISSING TRANSLATION FILE IS NOT A BROKEN PAGE — it resolves to null and the English
         markup, which was never removed, simply stays. */
      s.onload = s.onerror = function () {
        var d = docs[tag] || null;
        (pending[tag] || []).forEach(function (r) { try { r(d); } catch (e) {} });
        delete pending[tag];
        res(d);
      };
      document.head.appendChild(s);
    });
  }

  function define(code, doc) { if (code && doc) docs[String(code).toLowerCase()] = doc; }

  /* Order: an explicit ?lang= (so a link can carry one) → what this reader last chose here →
     the app's own setting → the browser → English. */
  function detect() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q && has(normalise(q))) return normalise(q);
    try {
      var saved = localStorage.getItem(STORE);
      if (saved && has(normalise(saved))) return normalise(saved);
    } catch (e) {}
    try {
      var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}');
      if (s && s.lang && has(normalise(s.lang))) return normalise(s.lang);
    } catch (e) {}
    var navs = [];
    try { navs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || '']; } catch (e) {}
    for (var i = 0; i < navs.length; i++) {
      var c = normalise(navs[i]);
      if (has(c)) return c;
    }
    return FALLBACK;
  }

  /* The English original of every key, captured once before anything is overwritten — so
     switching back to English is a restore rather than a second document to keep in step. */
  var EN = null;
  function captureEnglish() {
    if (EN) return;
    EN = { text: Object.create(null), alt: Object.create(null), title: document.title, desc: '' };
    var md = document.querySelector('meta[name="description"]');
    if (md) EN.desc = md.getAttribute('content') || '';

    /* ⚠ THE <template> IS READ TOO, AND IT HAS TO BE. The two deferred hero frames are not in the
       document at boot, so a walk of `document` alone would never record their English alt text —
       and then a reader who switched to Japanese and back would be left with Japanese alts on the
       two frames that had been cloned in meanwhile. Template contents are queryable without being
       adopted, so this costs nothing and no fetch. */
    var roots = [document];
    var tpl = document.getElementById('hp-frames-rest');
    if (tpl && tpl.content) roots.push(tpl.content);

    for (var r = 0; r < roots.length; r++) {
      var n = roots[r].querySelectorAll('[data-i]');
      for (var i = 0; i < n.length; i++) {
        var k = n[i].getAttribute('data-i');
        if (!(k in EN.text)) EN.text[k] = n[i].textContent;
      }
      var a = roots[r].querySelectorAll('[data-i-alt]');
      for (var j = 0; j < a.length; j++) {
        var ka = a[j].getAttribute('data-i-alt');
        if (!(ka in EN.alt)) EN.alt[ka] = a[j].getAttribute('alt') || '';
      }
    }
  }

  function applyLang(code) {
    var doc = (code === FALLBACK) ? null : docs[code];
    var keys = (doc && doc.keys) || EN.text;
    var alts = (doc && doc.alt) || EN.alt;

    var n = document.querySelectorAll('[data-i]');
    for (var i = 0; i < n.length; i++) {
      var k = n[i].getAttribute('data-i');
      /* ⚠ THE FALLBACK IS PER KEY. A young translation shows its own language wherever it has
         one and English only where it does not — a missing key must never blank a heading. */
      var v = keys[k];
      if (v == null || v === '') v = EN.text[k];
      if (v != null) n[i].textContent = v;
    }
    var a = document.querySelectorAll('[data-i-alt]');
    for (var j = 0; j < a.length; j++) {
      var ka = a[j].getAttribute('data-i-alt');
      var va = alts[ka];
      if (va == null || va === '') va = EN.alt[ka];
      if (va != null) a[j].setAttribute('alt', va);
    }

    document.title = (doc && doc.meta && doc.meta.title) || EN.title;
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', (doc && doc.meta && doc.meta.description) || EN.desc);
    root.setAttribute('lang', code);

    typer.retext((doc && doc.prompts) || null);
  }

  function setLang(code, initial) {
    code = normalise(code);
    if (!has(code)) code = FALLBACK;
    current = code;
    try { localStorage.setItem(STORE, code); } catch (e) {}
    /* the URL carries the choice, so the page a reader shares opens in the language they read it
       in — and so ?lang= and the hreflang alternates in the <head> describe the same thing. */
    if (!initial) {
      try {
        var u = new URL(location.href);
        if (code === FALLBACK) u.searchParams.delete('lang'); else u.searchParams.set('lang', code);
        history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
      } catch (e) {}
    }
    var sel = document.getElementById('hp-lang-select');
    if (sel && sel.value !== code) sel.value = code;
    return load(code).then(function () { applyLang(current); return current; });
  }

  function buildPicker() {
    var host = document.getElementById('hp-lang');
    if (!host || host.__built) return;
    host.__built = true;
    var globe = document.createElement('span');
    globe.className = 'hp-lang-globe';
    globe.textContent = '\u{1F310}';
    var sel = document.createElement('select');
    sel.id = 'hp-lang-select';
    sel.setAttribute('aria-label', 'Language');
    rows().forEach(function (l) {
      var o = document.createElement('option');
      o.value = l.code; o.textContent = l.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { setLang(sel.value, false); });
    var chev = document.createElement('span');
    chev.className = 'hp-lang-chev';
    chev.textContent = '▾';
    host.appendChild(globe); host.appendChild(sel); host.appendChild(chev);
  }

  /* ══ ② CHROME + ④ MOTION — one reader, one frame ══════════════════════════════════════════
     Everything that depends on the scroll position is computed HERE, once per animation frame,
     and written out as custom properties. Nothing else in this file listens to `scroll`, and
     nothing reads layout outside this function — which is what keeps a 12-section page at one
     style recalculation per frame instead of one per effect. */
  var nav = null, stage = null, space = null;
  var ticking = false, px = 0, py = 0;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }

  function frame() {
    ticking = false;
    var y = window.pageYOffset || root.scrollTop || 0;
    var vh = window.innerHeight || 800;

    if (nav) {
      var on = y > 6;
      if (on !== nav.__on) { nav.__on = on; nav.classList.toggle('hp-nav-on', on); }
    }

    /* 0 at the top, 1 once the hero has left — drives the grid drift and the plate's settle */
    var p = Math.max(0, Math.min(1, y / (vh * 0.85)));
    root.style.setProperty('--hp-scroll', p.toFixed(4));

    if (fx && stage) {
      /* the plate starts tilted back and stands up as it is scrolled to, plus whatever the
         pointer is asking for. Both are one rotate pair, so it stays a single composited layer. */
      root.style.setProperty('--hp-rx', (7 * (1 - p) + py).toFixed(2) + 'deg');
      root.style.setProperty('--hp-ry', px.toFixed(2) + 'deg');
    }

    if (space) {
      var r = space.getBoundingClientRect();
      /* −1 … 1 as the section crosses the viewport; the three starfield sheets scale off it */
      var q = (vh - r.top) / (vh + r.height);
      root.style.setProperty('--hp-space', Math.max(-1, Math.min(1, q * 2 - 1)).toFixed(4));
    }
  }

  function wirePointer() {
    if (!fx || !stage) return;
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      px = ((e.clientX - r.left) / r.width - 0.5) * 5.0;    /* ±2.5° */
      py = -((e.clientY - r.top) / r.height - 0.5) * 3.0;   /* ±1.5° */
      onScroll();
    }, { passive: true });
    stage.addEventListener('pointerleave', function () { px = 0; py = 0; onScroll(); }, { passive: true });
  }

  /* ══ ③ REVEAL ═════════════════════════════════════════════════════════════════════════════
     ⚠ The hiding is done by CSS behind `html.hp-js`, which about.html sets in <head>. If this
     script never runs, nothing was hidden in the first place — see the note in css/about.css. */
  function wireReveal() {
    var items = document.querySelectorAll('.hp-rv');
    if (!('IntersectionObserver' in window) || reduce) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('hp-in');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('hp-in');
        io.unobserve(en.target);          /* granted once; an observer that keeps watching is a leak */
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    for (var j = 0; j < items.length; j++) io.observe(items[j]);
  }

  /* ══ ⑤ HERO ROTATION ══════════════════════════════════════════════════════════════════════
     Three real screenshots, cross-faded. Not a video: a 6-second clip of a map is 2–4 MB and a
     decoder on the main thread, and it says nothing three stills do not. Paused when the tab is
     hidden and never started at all under prefers-reduced-motion. */
  function wireFrames() {
    var host = document.getElementById('hp-frames');
    var dots = document.getElementById('hp-dots');
    if (!host) return;

    /* ⚠ FRAMES 2 AND 3 ARE CLONED IN AFTER THE LOAD EVENT, NOT PARSED WITH THE PAGE.
       `loading="lazy"` does not defer an image inside the hero, so all three used to arrive on the
       first connection — measured 649 KB before a scroll, 367 KB of it two pictures nothing shows
       for 5.6 s. They sit in a <template>, whose contents belong to an inert document and are
       therefore never fetched, and this clones them in once the load event has passed.

       ⚠ IT IS A TEMPLATE AND NOT `data-src` BECAUSE COPYING AN ATTRIBUTE INTO `src` IS A DOM
       STRING BECOMING A URL. CodeQL failed the pull request that first shipped this
       (js/xss-through-dom, high) and it was right to: the value is our own literal today, and the
       SHAPE is the thing worth not having — the same ruling js/page-i18n.js records about building
       a script src from `?lang=`. `cloneNode` moves nodes, not strings, so there is no sink left
       to reason about. */
    var tpl = document.getElementById('hp-frames-rest');
    var rest = (tpl && tpl.content) ? tpl.content.querySelectorAll('picture').length : 0;
    var total = host.querySelectorAll('picture').length + rest;
    if (total < 2) return;

    var imgs = host.querySelectorAll('img');
    if (!imgs.length) return;
    var at = 0, timer = 0;
    imgs[0].classList.add('hp-fr-on');

    var promoted = false;
    function promote() {
      if (promoted || !tpl || !tpl.content) return;
      promoted = true;
      host.appendChild(tpl.content.cloneNode(true));
      imgs = host.querySelectorAll('img');
      /* the frames that just arrived carry English alt text; if the reader is in another
         language they have to be re-labelled, and captureEnglish() already read them out of
         the template so switching back to English restores the original. */
      applyLang(current);
    }
    function schedulePromote() {
      var run = function () {
        if (window.requestIdleCallback) window.requestIdleCallback(promote, { timeout: 2500 });
        else setTimeout(promote, 600);
      };
      if (document.readyState === 'complete') run();
      else window.addEventListener('load', run, { once: true });
    }
    schedulePromote();

    var btns = [];
    if (dots) {
      for (var i = 0; i < total; i++) {
        (function (n) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-label', 'View ' + (n + 1));
          b.setAttribute('aria-current', n === 0 ? 'true' : 'false');
          b.addEventListener('click', function () { show(n); restart(); });
          dots.appendChild(b);
          btns.push(b);
        })(i);
      }
    }

    function show(n) {
      if (n === at) return;
      promote();                          /* a dot clicked before the idle callback still works */
      if (n >= imgs.length) return;       /* …and if the clone failed, the frame simply does not change */
      imgs[at].classList.remove('hp-fr-on');
      at = n;
      imgs[at].classList.add('hp-fr-on');
      btns.forEach(function (b, i) { b.setAttribute('aria-current', i === at ? 'true' : 'false'); });
    }
    function tick() { show((at + 1) % total); }
    function restart() { stop(); if (!reduce) timer = setInterval(tick, 5600); }
    function stop() { if (timer) { clearInterval(timer); timer = 0; } }

    if (!reduce) {
      restart();
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else restart();
      });
    }
  }

  /* ══ ⑥ THE ATLAS LINE ═════════════════════════════════════════════════════════════════════
     Typed, because what Atlas is FOR is typing at it. Under reduced motion the first prompt is
     simply printed and left there. */
  var typer = (function () {
    var EN_PROMPTS = [
      'Show railways and population density in Japan.',
      'Take me to the Strait of Hormuz.',
      'Show Europe in 1945.',
      'Compare Germany, France, and Italy.',
      'Find nuclear sites near major rivers.',
      'Turn on earthquakes and volcanoes.'
    ];
    var list = EN_PROMPTS, el = null, i = 0, j = 0, del = false, t = 0, live = false;

    function stop() { if (t) { clearTimeout(t); t = 0; } }

    function step() {
      if (!el) return;
      var s = list[i % list.length];
      j += del ? -1 : 1;
      if (j < 0) j = 0;
      if (j > s.length) j = s.length;
      el.textContent = s.slice(0, j);
      var wait = del ? 26 : 42;
      if (!del && j >= s.length) { del = true; wait = 1900; }
      else if (del && j <= 0) { del = false; i++; wait = 320; }
      t = setTimeout(step, wait);
    }

    return {
      start: function () {
        el = document.getElementById('hp-type');
        if (!el) return;
        if (reduce) { el.textContent = list[0]; return; }
        live = true;
        step();
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) stop();
          else if (live && !t) step();
        });
      },
      /* a language change swaps the prompt list without restarting the animation from nothing */
      retext: function (next) {
        list = (next && next.length) ? next : EN_PROMPTS;
        if (!el) return;
        if (reduce || !live) { el.textContent = list[0]; return; }
        i = 0; j = 0; del = false;
        stop(); step();
      }
    };
  })();

  /* ══ ⑦ THE RETURNING VISITOR ══════════════════════════════════════════════════════════════
     「ログイン済みユーザーの扱い: 直接IntMapへ」.
     ⚠ AND THAT IS AN OFFER, NOT A REDIRECT. `/` already IS IntMap; this page is reached only on
     purpose — from a search result, a shared link, the README. Bouncing somebody out of a page
     they deliberately opened would break the back button, break sharing, and make the homepage
     unreadable to the very people most likely to link to it. So a reader who already has a
     session gets the shortest possible path offered at the top of the page and the primary
     button relabelled, and keeps the page if they want it.
     ⚠ NOTHING IS DECODED. supabase-js stores its session under `sb-<ref>-auth-token`; the only
     question asked here is whether such a key EXISTS. The token is never read, never parsed and
     never leaves localStorage. */
  function wireWelcome() {
    var seen = false;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) { seen = true; break; }
      }
    } catch (e) { return; }              /* private mode / storage blocked — behave like a new visitor */
    if (!seen) return;
    var bar = document.getElementById('hp-welcome');
    if (bar) bar.classList.add('hp-on');
  }

  /* ══ BOOT ═════════════════════════════════════════════════════════════════════════════════ */
  function boot() {
    nav = document.getElementById('hp-nav');
    stage = document.getElementById('hp-shot');
    space = document.getElementById('space');

    captureEnglish();
    buildPicker();
    setLang(detect(), true);

    wireReveal();
    wireFrames();
    wireWelcome();
    typer.start();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    wirePointer();
    frame();                              /* set the properties once for the first paint */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { define: define, setLang: setLang, lang: function () { return current; }, HAVE: HAVE };
})();
