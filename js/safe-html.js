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
  root.IntMapSafe = { html: html, esc: html, url: url, text: text };
})(typeof globalThis !== 'undefined' ? globalThis : this);
