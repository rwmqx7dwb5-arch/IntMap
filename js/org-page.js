/* ============================================================================
 *  IntMap · the organisation pages' one script   (sales-channels)
 * ----------------------------------------------------------------------------
 *  Loaded by every page scripts/org-pages.mjs writes (for-newsrooms / for-schools / for-research /
 *  contact / support, en and ja/), as a plain script from this origin — the pages carry no inline
 *  script, so their policy is script-src 'self' alone. It does four small things and holds no words of
 *  its own: every sentence it shows is in the page, in the page's language (data-msg-* attributes).
 *
 *    ① THE THEME — the app's own setting (localStorage intmap_settings.theme), copied onto
 *       <html data-theme> before the body paints, the attribute css/pages.css reads. Same as the landing
 *       pages, so a reader who chose dark in the map reads these in dark too.
 *    ② THE LANGUAGE CHOICE — a click on the language link stores intmap_lp_lang, the key the landing
 *       pages read, so the choice follows the reader to about.html / teachers.html.
 *       And the saved choice (that key, or the app's language) takes a reader to the page's twin on arrival.
 *    ③ THE CONTACT FORM — POSTs { kind:'inquiry', … } to the reader-reports Edge Function, which checks
 *       the origin, takes from the shared buckets and writes public.org_inquiries as the service role
 *       (supabase/functions/reader-reports/index.ts, _shared/inquiry-shape.js). «Sent» is said ONLY on
 *       201 — the function's word for «stored»; anything else says it was not sent and keeps the text.
 *    ④ THE SUPPORT PAGE — reads this month's AI use (public.operating_stats(), the same function the
 *       in-app support panel reads) and the listed supporters (public.supporters, anon may read the
 *       listed rows' name, month and note). A read that fails says so; it never shows zeros or an
 *       empty list in place of «could not be read».
 *
 *  The backend address and the publishable key are in the page's <meta> (the generator reads them from
 *  src/vendor.js, where the app's own client is made). The key is public by design; RLS decides.
 *  ⚠ Nothing a reader or the database wrote is inserted as markup: every value goes in as textContent.
 * ==========================================================================*/
(function () {
  'use strict';
  var d = document.documentElement;

  /* ① the theme, before the body exists */
  try {
    var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}') || {};
    if (s.theme === 'light' || s.theme === 'dark') d.setAttribute('data-theme', s.theme);
  } catch (_) { /* no storage: the system theme applies */ }

  /* ② (teachers-and-entrances) a reader who chose the other language — in the app's settings (intmap_settings.lang is
     'jp', the app's spelling) or with a page's language switch (intmap_lp_lang) — is taken to this page's twin, the one
     the page names in <link rel=alternate>. The same rule the landing pages carry (scripts/landing.mjs PAGE_SCRIPT), so
     the app's links to these pages need not know the reader's language. Never moves a reader with no saved choice, or
     one who asked for a language in the address (?lang=). */
  try {
    var here = (d.getAttribute('lang') || 'en').toLowerCase(), choice = null;
    try { choice = localStorage.getItem('intmap_lp_lang'); } catch (_) { /* no storage */ }
    if (!choice && s && s.lang === 'jp') choice = 'ja';
    var alt = document.querySelector('link[rel="alternate"][hreflang="' + (here === 'ja' ? 'en' : 'ja') + '"]');
    if (alt && choice && choice !== here && !/[?&]lang=/.test(location.search)) {
      var leaf = new URL(alt.getAttribute('href'), location.href).pathname.split('/').pop();
      var p = location.pathname, base = p.slice(0, p.lastIndexOf('/') + 1);
      if (here === 'ja') base = base.slice(0, -3);
      location.replace(base + (here === 'ja' ? '' : 'ja/') + leaf + location.hash);
    }
  } catch (_) { /* the page stays as it is */ }

  function meta(name) { var m = document.querySelector('meta[name="' + name + '"]'); return m ? m.getAttribute('content') || '' : ''; }

  /* How long a send may take before it counts as not sent. Derived, not measured: reader-reports' own
     bounds (Auth 5 s — not asked here, no token is sent — two limiter takes of 3 s, the insert 5 s) are
     11 s at worst, plus the round trip; js/feedback.js uses 20 s for the same function. Expires with
     those bounds. */
  var SEND_DEADLINE_MS = 20000;
  var READ_DEADLINE_MS = 10000;   /* a read of one small row set; the same order as the send, halved */
  function deadline(ms) { return (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined; }

  /* ③ the contact form */
  function wireContact() {
    var form = document.getElementById('og-form');
    if (!form) return;
    var status = document.getElementById('og-status');
    var send = form.querySelector('button[type="submit"]');
    var purpose = form.elements.purpose, audience = form.elements.audience;
    var supHint = document.getElementById('og-hint-sup');
    function say(key, kind) {
      status.textContent = form.getAttribute('data-msg-' + key) || '';
      status.className = 'og-status' + (kind ? ' is-' + kind : '');
    }
    function syncHint() { if (supHint) supHint.hidden = purpose.value !== 'supporter_listing'; }

    /* ?for=<audience>&about=<purpose> — the introduction pages link here with their reader preselected.
       Only a value the select already offers is taken; anything else leaves the default. */
    try {
      var q = new URLSearchParams(location.search);
      var pick = function (sel, v) { if (v && Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) sel.value = v; };
      pick(audience, q.get('for')); pick(purpose, q.get('about'));
    } catch (_) { /* an old browser: the defaults stand */ }
    syncHint();
    purpose.addEventListener('change', syncHint);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = false;
      Array.prototype.forEach.call(form.querySelectorAll('input,select,textarea'), function (el) {
        if (el.name === 'website_confirm') return;
        var ok = el.checkValidity() && !(el.required && el.type !== 'checkbox' && !String(el.value).trim());
        el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok) bad = true;
      });
      if (bad) { say('invalid', 'bad'); return; }
      var base = meta('intmap-backend').replace(/\/$/, '');
      if (!base) { say('failed', 'bad'); return; }
      var v = function (n) { var el = form.elements[n]; return el ? String(el.value || '').trim() : ''; };
      var body = {
        kind: 'inquiry', audience: v('audience'), purpose: v('purpose'), name: v('name'), email: v('email'),
        organization: v('organization') || null, role: v('role') || null, website: v('website') || null,
        country: v('country') || null, message: v('message'), consent: form.elements.consent.checked === true,
        page: location.pathname, lang: form.getAttribute('data-lang') || 'en',
      };
      body.website_confirm = v('website_confirm');
      send.disabled = true;
      say('sending');
      fetch(base + '/functions/v1/reader-reports', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify(body), signal: deadline(SEND_DEADLINE_MS),
      }).then(function (res) {
        if (res.status === 201) { form.reset(); syncHint(); say('sent', 'ok'); }
        else if (res.status === 429) say('limited', 'bad');
        else if (res.status === 400 || res.status === 413) say('invalid', 'bad');
        else say('failed', 'bad');
      }, function () { say('failed', 'bad'); })
        .then(function () { send.disabled = false; });
    });
  }

  /* ④ the support page */
  function rest(path) {
    var base = meta('intmap-backend').replace(/\/$/, ''), key = meta('intmap-anon-key');
    if (!base || !key) return Promise.reject(new Error('no backend'));
    return fetch(base + '/rest/v1/' + path, { headers: { apikey: key, accept: 'application/json' }, credentials: 'omit', signal: deadline(READ_DEADLINE_MS) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function locale(el) { return el.getAttribute('data-lang') === 'jp' ? 'ja-JP' : 'en-US'; }
  function monthName(iso, loc) {
    var m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    return new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleDateString(loc, { year: 'numeric', month: 'long', timeZone: 'UTC' });
  }
  function wireStats(el) {
    var loc = locale(el), n = function (x) { return (Number(x) || 0).toLocaleString(loc); };
    /* GET: PostgREST runs it read-only, as js/supporter.js asks for the same function */
    rest('rpc/operating_stats').then(function (s) {
      if (!s || typeof s !== 'object') throw new Error('empty');
      var month = monthName(s.month + '-01', loc);
      var calls = Number(s.provider_calls) || 0;
      el.textContent = calls > 0
        ? el.getAttribute('data-msg-line').replace('{month}', month).replace('{calls}', n(calls))
          .replace('{tin}', n(s.input_tokens)).replace('{tout}', n(s.output_tokens))
          .replace('{since}', s.metered_since ? new Date(s.metered_since + 'T00:00:00Z').toLocaleDateString(loc, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : month)
        : el.getAttribute('data-msg-none').replace('{month}', month);
    }).catch(function () { el.textContent = el.getAttribute('data-msg-failed'); });
  }
  function wireSupporters(list) {
    var loc = locale(list);
    rest('supporters?select=display_name,since_month,note&order=since_month.asc,display_name.asc').then(function (rows) {
      if (!Array.isArray(rows)) throw new Error('not a list');
      list.textContent = '';
      if (!rows.length) {
        var li0 = document.createElement('li'); li0.className = 'og-muted'; li0.textContent = list.getAttribute('data-msg-empty'); list.appendChild(li0);
        return;
      }
      rows.forEach(function (r) {
        var li = document.createElement('li');
        var nm = document.createElement('span'); nm.className = 'og-sup-name'; nm.textContent = String(r.display_name || ''); li.appendChild(nm);
        var wh = document.createElement('span'); wh.className = 'og-sup-when'; wh.textContent = monthName(r.since_month, loc); li.appendChild(wh);
        if (r.note) { var nt = document.createElement('span'); nt.className = 'og-sup-note'; nt.textContent = String(r.note); li.appendChild(nt); }
        list.appendChild(li);
      });
    }).catch(function () {
      list.textContent = '';
      var li = document.createElement('li'); li.className = 'og-muted'; li.textContent = list.getAttribute('data-msg-failed'); list.appendChild(li);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* ② the language choice */
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-lp-lang]') : null;
      if (a) { try { localStorage.setItem('intmap_lp_lang', a.getAttribute('data-lp-lang')); } catch (_) { /* no storage */ } }
    });
    wireContact();
    var stats = document.getElementById('og-stats');
    if (stats) wireStats(stats);
    var sup = document.getElementById('og-supporters');
    if (sup) wireSupporters(sup);
  });
})();
