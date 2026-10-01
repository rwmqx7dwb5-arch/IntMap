/* ============================================================================
 *  IntMap · THE output encoder — window.IntMapSafe  (#R138 → safe-output-single-module)
 * ----------------------------------------------------------------------------
 *  The single source of truth for neutralising UNTRUSTED text before it reaches the DOM. Every
 *  value that originates outside our own code (community posts/profiles, news RSS titles/publishers,
 *  OSM/Nominatim place names, OSM-editable webcam URLs, GeoJSON properties, AI output, external-API
 *  bodies, the URL hash) is HOSTILE and must pass through here.
 *
 *    IntMapSafe.html(s)             → escape & < > " '  → safe in HTML TEXT and single/double-quoted ATTRS
 *    IntMapSafe.url(s,{allowData})  → allow ONLY http(s)/mailto/tel (+ optional data:image, NEVER svg);
 *                                     javascript:/vbscript:/data:text/html/… → '' (or opts.fallback).
 *                                     url() also %-encodes " ' < > ` and blanks, so its result is inert
 *                                     in a quoted attr by itself.
 *    IntMapSafe.text(s)             → the TEXT of an HTML fragment (entities decoded, tags dropped),
 *                                     parsed in an INERT document. An element made by the LIVE document
 *                                     belongs to one with a browsing context: `d.innerHTML=<RSS
 *                                     description>` fetches <img src=x> and fires its onerror even though
 *                                     d is never attached. A document from createHTMLDocument has no
 *                                     browsing context, so nothing in it is fetched or run.
 *    IntMapSafe.esc                 → the same function as html (the name older call sites use).
 *
 *  ⚠ WHY THIS IS A FILE AND NOT index.html's FIRST <head> SCRIPT ANY MORE. It used to be defined
 *  inline there, which made it reachable only from a page that had parsed index.html: sources.html
 *  and admin.html kept escapers of their own, and every module a Node test evaluates (gis-atlas,
 *  atlas-query, time-borders, routing-cards …) had to keep a private copy too, because Node has no
 *  index.html. A copy is not wrong on the day it is written; it is wrong on the day the rule changes
 *  and the copy does not. Now there is one body and every reader loads THIS file:
 *    · the app          — src/main.js imports it right after the three pinned slots, before any
 *                         module that renders (none of those three, nor anything they import,
 *                         touches IntMapSafe — tests/safe-output-single-module-checks measures it);
 *    · sources.html / admin.html — a plain <script src>, before the script that renders;
 *    · an ES module     — `import './safe-html.js'` and read globalThis.IntMapSafe (Node included);
 *    · a Node test that evaluates a classic file with `new Function('window', …)` — hands that
 *                         window the object this file published (never a copy of it).
 *
 *  It is written as a classic script that publishes one global (the js/admin-literal.js shape)
 *  because two static pages load it without a bundler, and `export` is a syntax error there;
 *  importing it as a module publishes the same global. No dependencies, no DOM at load time.
 *  ⚠ scripts/safe-output.mjs counts every OTHER escaper in the tree against a ratchet ledger.
 * ==========================================================================*/
(function (root) {
  'use strict';
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function html(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAP[c]; }); }
  function inert(s) { return s.replace(/[\t\n\r]/g, '').replace(/["'<>`\x00-\x20\x7f]/g, function (c) { return '%' + ('0' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-2); }); }
  function url(s, opt) {
    opt = opt || {}; s = String(s == null ? '' : s).trim();
    /* strip whitespace/control chars before the scheme test so "java\tscript:" or a leading \x01 can't sneak a scheme through */
    var probe = s.replace(/[\x00-\x20\xa0]+/g, '').toLowerCase();
    if (/^(?:https?:|mailto:|tel:)/.test(probe)) return inert(s);
    if (opt.allowData && /^data:image\/(?!svg\b)[a-z0-9.+-]+[;,]/.test(probe)) return inert(s);
    return (opt.fallback != null ? opt.fallback : '');
  }
  /* one inert document, made on first use and reused (it is never attached and never navigated) */
  var inertDoc = null;
  function text(s) {
    if (s == null || s === '') return '';
    var doc = inertDoc || (inertDoc = root.document.implementation.createHTMLDocument(''));
    var d = doc.createElement('div');
    d.innerHTML = String(s);
    return d.textContent || '';
  }
  /* ══ A FLAG VALUE CARRIES ONE OF TWO THINGS, AND THIS IS THE ONE PLACE THAT TELLS THEM APART ══════
     `countryStats[*].flag` is an emoji (a modern country, TEXT) for most rows and, for a former state,
     the inline-SVG image js/history.js / js/time-borders.js draw (MARKUP). One field with two meanings:
     readers either inserted it raw (safe only because every value happened to be ours) or escaped it
     (MEASURED 2026-09-30 in production: 13 of 211 rows of the 1900 country list printed
     `<img class="hist-flag" …` as text). This recognises only the exact image those builders make — a
     data: URI of percent-encoded SVG, which an <img> renders without running anything — and REBUILDS it
     from the parsed source; anything else is text and is escaped. */
  var HIST_FLAG = /^<img class="hist-flag" alt="" src="data:image\/svg\+xml,([A-Za-z0-9%\-_.!~*'()]+)">$/;
  function flag(v, fallback) {
    var s = String(v == null ? '' : v);
    if (!s) return fallback == null ? '' : html(fallback);
    var m = HIST_FLAG.exec(s);
    /* the scheme is written HERE, not carried over from the value: only the percent-encoded payload is */
    return m ? '<img class="hist-flag" alt="" src="data:image/svg+xml,' + m[1] + '">' : html(s);
  }
  /* ══ MARKUP BUILT FROM A TEMPLATE — the escaping is decided by WHERE a value lands, not by the caller ══
     `IntMapSafe.markup` is a template tag (files alias it `html`). An interpolated value is never markup
     unless it is a MARKUP OBJECT — the result of this tag or of `trusted(x)` — so a value nobody escaped
     is escaped by default instead of reaching the DOM raw. Where it lands is read from the static text
     (one plan per template, cached on the template's strings array, which the engine keeps per site):
       text / <title> / <textarea>         escaped (& < > " ')          markup object → inserted as is
       a quoted attribute value            escaped                      markup object → only ' " encoded
       the START of a quoted href/src/…    url(v, {allowData:true})     (the start decides the scheme)
       between attributes (`<option${s}>`) bare attribute names only, or '' / null / undefined / false
     and REFUSED (a TypeError, at the first use of the template — the plan is a pure function of the
     static text, so scripts/output-taint.mjs runs the same plan on every tagged template in the tree):
     a tag or attribute NAME, an unquoted value, an on* handler (the browser decodes entities before it
     runs the code, so escaping does not protect it), srcdoc (decoded, then parsed as a document), an SVG
     animation's to/from/values/by, inside <script>/<style>/a comment, and a template that ends inside a tag. null / undefined → ''; an array → its items, each placed the same way.
     ⚠ `trusted(x)` is the one way to put markup that is not a markup object in: it vouches for x, and
     the gate holds every call of it to the ledger by what x is (scripts/output-taint.mjs).
     ⚠ A markup object becomes a plain STRING the moment it is concatenated with `+` or turned into
     String() — and a string interpolated into another template is escaped again. Build the whole of
     what a sink receives in templates; finalise only at the sink (innerHTML / insertAdjacentHTML call
     String() themselves). */
  function SafeMarkup(s) { this.s = s; }
  SafeMarkup.prototype.toString = SafeMarkup.prototype.valueOf = function () { return this.s; };
  var isMarkup = function (v) { return v instanceof SafeMarkup; };
  var made = function (s) { var m = new SafeMarkup(s); return Object.freeze ? Object.freeze(m) : m; };
  function trusted(x) { return isMarkup(x) ? x : made(x == null ? '' : String(Array.isArray(x) ? x.join('') : x)); }
  var URL_ATTR = /^(?:href|src|action|formaction|poster|cite|background|xlink:href|data|codebase|manifest)$/;
  var RAW = /^(?:script|style|xmp|iframe|noembed|noframes|noscript|plaintext)$/;
  var RCDATA = /^(?:title|textarea)$/;
  var NAME_CH = /[^\s"'>\/=]/;
  var BARE_NAMES = /^\s*(?:[A-Za-z_:][-A-Za-z0-9_:.]*(?:\s+|$))*$/;
  var PLANS = typeof WeakMap === 'function' ? new WeakMap() : null;
  /* the static parts → where each interpolation lands: { at: 'text'|'attr'|'url'|'names' } or throws */
  function plan(strings) {
    var cached = PLANS && PLANS.get(strings); if (cached) return cached;
    var st = 'text', tag = '', attr = '', q = '', empty = true, out = [];
    var fail = function (i, why) {
      throw new TypeError('IntMapSafe.markup: ' + why + ' — after «' + String(strings[i]).slice(-40) + '»');
    };
    var open = function () { var t = tag.toLowerCase(); st = RAW.test(t) ? 'raw' : (RCDATA.test(t) ? 'rcdata' : 'text'); };
    for (var i = 0; i < strings.length; i++) {
      var s = strings[i] == null ? '' : String(strings[i]);
      var last = i === strings.length - 1;
      for (var j = 0; j < s.length; j++) {
        var c = s.charAt(j);
        switch (st) {
          case 'text': case 'rcdata': case 'raw':
            if (st === 'text' && s.substr(j, 4) === '<!--') { st = 'comment'; j += 3; break; }
            if (c !== '<') break;
            if (st !== 'text') {
              if (s.substr(j + 1, tag.length + 1).toLowerCase() === '/' + tag.toLowerCase()) { st = 'end'; j += tag.length + 1; }
              break;
            }
            if (j === s.length - 1 && !last) { st = 'tagname'; tag = ''; break; }   /* `<${x}` names a tag */
            if (/[A-Za-z]/.test(s.charAt(j + 1))) { st = 'tagname'; tag = ''; }
            else if (s.charAt(j + 1) === '/' || s.charAt(j + 1) === '!' || s.charAt(j + 1) === '?') st = 'end';
            break;
          case 'comment': if (s.substr(j, 3) === '-->') { st = 'text'; j += 2; } break;
          case 'end': if (c === '>') st = 'text'; break;
          case 'tagname':
            if (/\s/.test(c) || c === '/') st = 'tag';
            else if (c === '>') open();
            else tag += c;
            break;
          case 'tag': case 'afterattr':
            if (c === '>') open();
            else if (c === '=' && st === 'afterattr') st = 'beforeval';
            else if (NAME_CH.test(c)) { st = 'attrname'; attr = c; }
            break;
          case 'attrname':
            if (c === '=') st = 'beforeval';
            else if (c === '>') open();
            else if (/\s/.test(c)) st = 'afterattr';
            else if (c === '/') st = 'tag';
            else attr += c;
            break;
          case 'beforeval':
            if (c === '"' || c === "'") { st = 'quoted'; q = c; empty = true; }
            else if (c === '>') open();
            else if (!/\s/.test(c)) st = 'unquoted';
            break;
          case 'quoted': if (c === q) st = 'tag'; else empty = false; break;
          case 'unquoted': if (/\s/.test(c)) st = 'tag'; else if (c === '>') open(); break;
        }
      }
      if (last) {
        if (st !== 'text' && st !== 'end' && st !== 'comment') fail(i, 'the template ends inside a tag or a raw-text element');
        break;
      }
      var name = attr.toLowerCase();
      if (st === 'text' || st === 'rcdata') out.push({ at: 'text' });
      else if (st === 'quoted') {
        if (/^on/.test(name)) fail(i, 'a value in an on* handler attribute runs as code');
        /* srcdoc is parsed as a document AFTER the attribute is decoded, so an escaped value is markup there;
           an SVG animation's to/from/values/by can rewrite an href to javascript: */
        if (name === 'srcdoc') fail(i, 'a value in srcdoc is parsed as a document');
        if (/^(?:to|from|values|by)$/.test(name) && /^(?:animate|set|animatemotion|animatetransform)$/i.test(tag)) fail(i, 'a value in an SVG animation can rewrite an attribute');
        out.push({ at: URL_ATTR.test(name) && empty ? 'url' : 'attr', q: q });
        empty = false;
      } else if (st === 'tag' || st === 'afterattr') out.push({ at: 'names', sp: /\s$/.test(s) });
      else if (st === 'raw') fail(i, 'a value inside <' + tag + '> is not escaped by HTML rules');
      else if (st === 'comment') fail(i, 'a value inside a comment');
      else if (st === 'beforeval' || st === 'unquoted') fail(i, 'an unquoted attribute value — quote it');
      else fail(i, 'a value in a tag or attribute NAME');
    }
    if (PLANS) PLANS.set(strings, out);
    return out;
  }
  function place(v, p) {
    if (v == null) return '';
    if (Array.isArray(v)) {
      if (p.at === 'url') return place(v.map(function (x) { return x == null ? '' : String(x); }).join(''), p);
      var acc = ''; for (var k = 0; k < v.length; k++) acc += place(v[k], p); return acc;
    }
    var m = isMarkup(v);
    if (p.at === 'text') return m ? v.s : html(v);
    if (p.at === 'url') return html(url(m ? v.s : v, { allowData: true }));
    if (p.at === 'attr') return m ? v.s.replace(/["']/g, function (c) { return MAP[c]; }) : html(v);
    /* names */
    if (v === false) return '';
    var n = m ? v.s : String(v);
    if (!BARE_NAMES.test(n)) throw new TypeError('IntMapSafe.markup: only bare attribute names may be placed between attributes, got «' + n.slice(0, 40) + '»');
    n = n.trim(); return n ? (p.sp ? n : ' ' + n) : '';   /* one blank before the names, whoever writes it */
  }
  function markup(strings) {
    var p = plan(strings);
    var raw = strings.raw || strings;
    var out = strings[0] != null ? strings[0] : raw[0];
    for (var i = 1; i < strings.length; i++) out += place(arguments[i], p[i - 1]) + (strings[i] != null ? strings[i] : raw[i]);
    return made(out);
  }
  markup.plan = plan;
  root.IntMapSafe = { html: html, esc: html, url: url, text: text, flag: flag, markup: markup, trusted: trusted, isMarkup: isMarkup };
})(typeof globalThis !== 'undefined' ? globalThis : this);
