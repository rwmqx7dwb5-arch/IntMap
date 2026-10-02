/* ============================================================================
 *  IntMap · EMBED MODE — the read-only view another site puts in an <iframe>   (share-embed-distribution)
 * ----------------------------------------------------------------------------
 *  「他サイトへ埋め込む手段が無い。」 The share link (js/map-ui.js viewHash) already carries the whole
 *  state of a map — position, projection, base map, every shared layer, the clock, compare, the
 *  simulators' inputs. An embed is THAT SAME LINK with one switch in the query string:
 *
 *      https://…/IntMap/?embed=1#v=139.7000,35.6000,5.00,0,0,f&l=dl-nato
 *      https://…/IntMap/?embed=1&interactive=0#v=…      (a still picture: no pan, no zoom)
 *
 *  so there is no second encoding of the map to keep in step with the first, and the frame is
 *  restored by the same restorer a pasted link is.
 *
 *  ── WHO LOADS THIS FILE (none of them at a normal start-up) ─────────────────────────────────
 *    · an embed: index.html's first script reads the query and sets <html data-embed>, and
 *      src/main.js imports this file only when that attribute is there;
 *    · the share panel (js/map-ui.js `share`), when it opens — the Embed tab is built here;
 *    · the Atlas `share` capability (js/atlas-cap-panel.js), inside the lazy Atlas kernel.
 *  A session that is not an embed and never opens the share panel downloads none of it.
 *  ⚠ THE GRAMMAR HAS ONE WRITER AND ONE EARLY READER: `embedUrl` below writes `embed=1` /
 *  `interactive=0`, and index.html's head script reads them before any module exists (it has to:
 *  the attribute decides what the first frames show). `embedFlags` is the same reading as a
 *  function, and tests/share-embed-distribution-checks.test.mjs evaluates the head script's own
 *  text against it, so the two cannot disagree silently.
 *
 *  ── WHAT AN EMBED SHOWS (a list of what STAYS, not of what goes) ─────────────────────────────
 *  EMBED_CSS keeps, and only keeps: the map (#map, with the renderer's own credit line
 *  `.map-credit-view` inside it), the legends (`.data-legend` / `.koppen-legend` — the classes
 *  js/data-layers.js discoverLegends() treats as «a legend»), the app's credit bar (#map-credit), the
 *  launch screen while the map loads, and the bar this file adds (the clock's instant and 「IntMap
 *  で開く」). Everything else is hidden by being NOT on that list, so a panel added next year is
 *  hidden in an embed without anyone remembering to say so.
 *  ⚠ THE CREDITS ARE ON THE KEEP LIST ON PURPOSE AND MAY NOT BE TRIMMED. CARTO's terms, OSM's
 *  ODbL, CC BY sources and the rest require their credit to stay visible wherever the data is
 *  drawn (js/carto-basemap.js). An embed is «wherever». Both credit lines wrap in an embed instead
 *  of ending in «…», because a 480-px frame would otherwise cut the end of the list off.
 *
 *  ── WHAT AN EMBED DOES ─────────────────────────────────────────────────────────────────────
 *  Pan and zoom, unless the code says interactive=0. Nothing else: the reader's click, right-click,
 *  change, input and keys stop before the app's handlers (no popups, no context menu, no tools, no
 *  legend switches). The renderer's own controls (`.maplibregl-control-container`, where its
 *  attribution toggle lives) and links stay usable.
 *
 *  ── FRAMING (measured, and why there is nothing to «allow») ─────────────────────────────────
 *  GitHub Pages sends neither X-Frame-Options nor a frame-ancestors header, and cannot be told to:
 *  it has no per-site header configuration. index.html's policy is a <meta> CSP, and the CSP spec
 *  says `frame-ancestors` is IGNORED in a <meta> policy — index.html already says so beside its
 *  policy and leaves the directive out rather than write an inert one. So any page could frame
 *  IntMap before this file existed (measured 2026-10-01: the production response carries
 *  Server: GitHub.com and Access-Control-Allow-Origin: *, and no X-Frame-Options or
 *  Content-Security-Policy header). That is what makes an embed possible on this host at all, and
 *  it is not something this file introduced. What an embed adds is a page that, when framed, does
 *  nothing a reader could be tricked into: it is read-only (above) and shows no sign-in, no form and
 *  no button of the app. docs/SECURITY-ARCHITECTURE.md §6 records both halves.
 *
 *  ⚠ THIS FILE HAS NO `window` GLOBAL. Its readers import it by name. Node can evaluate it
 *  (tests/share-embed-distribution-checks.test.mjs): nothing at the top level touches the DOM unless
 *  the page is an embed.
 * ==========================================================================*/

import { IntMapTime } from './chronos.js';
import { IntMapLang } from './lang-registry.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the one encoder iframeCode writes with */
import { iconNode } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */

/* ── THE PRESETS the share panel and Atlas offer. They are choices, not thresholds: 16:10 frames at
   three common content-column widths, plus one that fills its column. ⚠ The narrowest is the size
   tests/share-embed-distribution.spec.js checks the credits at (they wrap and stay wholly on screen
   at 480×320). A caller may also pass its own width/height; see `frameSize`. */
export const EMBED_SIZES = Object.freeze({
  small: Object.freeze({ w: 480, h: 320 }),
  medium: Object.freeze({ w: 640, h: 400 }),
  large: Object.freeze({ w: 960, h: 600 }),
  responsive: Object.freeze({ w: '100%', h: 450 }),
});
/* The bounds `frameSize` clamps explicit numbers to, and the Atlas schema bounds width/height with.
   ESTIMATE, not a measurement of a threshold: below about 200 px the credit bar, the instant and
   the 「open」 link no longer fit beside a usable map. The largest is the widest common desktop
   viewport (4K UHD, 3840) — a frame wider than any screen is a typo. Expires if the embed bar grows. */
export const EMBED_PX = Object.freeze({ min: 200, max: 3840 });

/* `?embed=1` (and `&interactive=0`) — the whole grammar, as a function. */
export function embedFlags(search) {
  let q;
  try { q = new URLSearchParams(String(search || '')); } catch (_) { return { on: false, interactive: false }; }
  const on = q.get('embed') === '1';
  return { on, interactive: on && q.get('interactive') !== '0' };
}

/* The state of THIS page, read once: an embed does not turn into the app (or back) without a load. */
export const EMBED = (function () {
  try { return Object.freeze(embedFlags(typeof location !== 'undefined' ? location.search : '')); }
  catch (_) { return Object.freeze({ on: false, interactive: false }); }
})();

/* The same address with the embed switches set / removed. Everything else in the query and the
   whole hash travel unchanged — the hash IS the map, and it is not this file's to rewrite. */
export function embedUrl(href, opts) {
  const u = new URL(String(href));
  u.searchParams.set('embed', '1');
  if (opts && opts.interactive === false) u.searchParams.set('interactive', '0');
  else u.searchParams.delete('interactive');
  return u.toString();
}
export function appUrl(href) {
  const u = new URL(String(href));
  u.searchParams.delete('embed');
  u.searchParams.delete('interactive');
  return u.toString();
}

/* A preset name, or explicit numbers. A WIDTH may also be a percentage of the host's column; a
   height may not (a percentage height is a fraction of a parent whose height the embedding page
   rarely sets, so the frame would collapse). → { w, h } */
export function frameSize(size, width, height) {
  const base = EMBED_SIZES[String(size || '')] || EMBED_SIZES.medium;
  const px = (v, d, pct) => {
    if (pct && typeof v === 'string' && /^\d{1,3}%$/.test(v.trim())) return v.trim();
    const n = Math.round(+v);
    return Number.isFinite(n) && n > 0 ? Math.min(EMBED_PX.max, Math.max(EMBED_PX.min, n)) : d;
  };
  return { w: px(width, base.w, true), h: px(height, base.h, false) };
}

/* The code a reader pastes into their own page. `title` is what a screen reader announces for the
   frame (WCAG 4.1.2 — a frame needs an accessible name). No `allow=` features: an embed asks for
   none (no geolocation, no fullscreen, no clipboard). */
export function iframeCode(src, size, title) {
  const H = globalThis.IntMapSafe;   /* url() refuses any scheme but http(s) */
  const s = (size && typeof size === 'object') ? size : frameSize(size);
  return '<iframe src="' + H.url(src) + '" width="' + H.html(s.w) + '" height="' + H.html(s.h) + '"'
    + ' style="border:0;max-width:100%;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"'
    + ' title="' + H.html(title || 'IntMap') + '"></iframe>';
}

/* ══ THE EMBED VIEW'S STYLESHEET ═════════════════════════════════════════════════════════════
   It lives here and not in css/intmap.css so that a normal start-up does not parse it. It is in
   place long before the launch screen lifts: this file is imported by src/main.js as the page's
   modules are evaluated, and the screen covers the page until the app has booted. At each level of
   the page only the boxes an embed shows are exempt (see the header). */
export const EMBED_CSS = [
  'html[data-embed] body > *:not(.operation-room):not(#boot-splash):not(#im-embed-bar){display:none !important;}',
  'html[data-embed] .operation-room > *:not(.map-column){display:none !important;}',
  'html[data-embed] .map-column > *:not(.map-container):not(#map-credit){display:none !important;}',
  'html[data-embed] .map-container > *:not(#map):not(.data-legend):not(.koppen-legend){display:none !important;}',
  'html[data-embed]{--peek-h:0px;--sheet-cover:0px;}',
  /* the phone layout pins the map to the whole screen (position:fixed) because its bottom sheet floats
     over it; an embed has no sheet, so the map and the credit bar stack the way they do on a desktop —
     the credit under the map, never over it */
  'html[data-embed] .operation-room,html[data-embed] .map-column{height:100dvh !important;}',
  'html[data-embed] .map-column{width:100% !important;margin:0 !important;display:flex !important;flex-direction:column !important;}',
  'html[data-embed] .map-column > .map-container{position:relative !important;inset:auto !important;width:100% !important;height:auto !important;flex:1 1 auto !important;min-height:0 !important;}',
  'html[data-embed] .map-credit{position:static !important;height:auto !important;min-height:var(--credit-h,23px);line-height:1.5 !important;white-space:normal !important;overflow:visible !important;padding:3px 10px !important;border-radius:0 !important;box-shadow:none !important;max-width:none !important;}',
  'html[data-embed] .map-credit-view{white-space:normal !important;text-overflow:clip !important;}',
  /* a legend is information in an embed, not a switchboard (the events are stopped too); its links still open */
  'html[data-embed] :is(.data-legend,.koppen-legend) :is(button,select,input,textarea,label,[role="button"]){pointer-events:none !important;}',
  /* a still picture: the renderer takes no gesture, but its attribution toggle and every link stay usable */
  'html[data-embed="static"] #map{pointer-events:none;}',
  'html[data-embed="static"] #map .maplibregl-control-container,html[data-embed="static"] #map a{pointer-events:auto;}',
  /* the bar: above the map's overlays, below anything modal (the --z-* layers of css/intmap.css) */
  'html[data-embed] #im-embed-bar{position:fixed;top:8px;right:8px;z-index:var(--z-controls);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 16px);padding:5px 6px 5px 11px;border-radius:12px;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);font-size:12px;line-height:1.3;}',
  'html[data-embed] #im-embed-bar .im-embed-when{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}',
  'html[data-embed] #im-embed-bar .im-embed-when:empty{display:none;}',
  'html[data-embed] #im-embed-bar .im-embed-open{flex:0 0 auto;padding:4px 10px;border-radius:9px;background:var(--primary-fill);color:#fff;font-weight:600;text-decoration:none;white-space:nowrap;}',
  'html[data-embed] #im-embed-bar .im-embed-open:hover{filter:brightness(1.06);}',
  'html[data-embed] #im-embed-bar .im-embed-open:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
].join('\n');

/* ══ THE SHARE PANEL'S EMBED TAB ═════════════════════════════════════════════════════════════
   js/map-ui.js `share` owns the panel and the Link tab, and hands this its own `link()` (the
   address-bar encoder, IntMapBookmark.link()), its translator and its copy button — so both tabs
   read ONE address and cannot describe two different maps. The frame's options (size, pan/zoom)
   are remembered for the session, so Atlas and the panel answer from the same choice. */
const TAB_CSS = [
  '#share-panel .sh-opts{flex-wrap:wrap;align-items:center;gap:12px;font-size:12px;}',
  '#share-panel .sh-lbl{display:flex;align-items:center;gap:6px;color:var(--text-main);}',
  '#share-panel .sh-size{height:30px;padding:0 8px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font-size:12px;}',
  '#share-panel .sh-code{flex:1;min-width:0;padding:8px 10px;border-radius:11px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:vertical;box-sizing:border-box;}',
  '#share-panel .sh-pv{margin-top:10px;width:100%;overflow:hidden;border-radius:11px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);}',
  '#share-panel .sh-pv[hidden]{display:none;}',
].join('\n');
let tabStyled = false;

export function createEmbedTab(ctx) {
  const t = ctx.t;
  let size = 'medium', interactive = true, width = null, height = null, pane = null;
  /* → { url, size, interactive, code } for the CURRENT map and the given (or remembered) options.
     Explicit numbers win; naming a preset clears numbers chosen earlier. */
  function embed(o) {
    o = o || {};
    if (o.size && EMBED_SIZES[o.size]) size = o.size;
    if (typeof o.interactive === 'boolean') interactive = o.interactive;
    if (o.width != null || o.height != null) { width = o.width != null ? o.width : null; height = o.height != null ? o.height : null; }
    else if (o.size) { width = null; height = null; }
    const url = embedUrl(ctx.link(), { interactive });
    const s = frameSize(size, width, height);
    return { url, size: s, interactive, code: iframeCode(url, s, t('embedFrameTitle')) };
  }
  function stopPreview() {
    if (!pane) return;
    try {
      const f = pane.querySelector('.sh-pv iframe'); if (f) { f.src = 'about:blank'; f.remove(); }
      const pv = pane.querySelector('.sh-pv'); if (pv) { pv.hidden = true; pv.style.height = ''; }
      const pb = pane.querySelector('.sh-pvbtn'); if (pb) pb.textContent = t('embedPreview');
    } catch (_) { }
  }
  /* (re)builds the tab inside `host` from the current options */
  function render(host) {
    if (!tabStyled) { tabStyled = true; const st = document.createElement('style'); st.textContent = TAB_CSS; document.head.appendChild(st); }
    stopPreview();
    pane = host;
    const H = globalThis.IntMapSafe.html;
    host.innerHTML = '<div style="font-size:11.5px;color:var(--text-muted);">' + H(t('embedDesc')) + '</div>'
      + '<div class="sh-row sh-opts"><label class="sh-lbl">' + H(t('embedSize')) + ' <select class="sh-size"></select></label>'
      + '<label class="sh-lbl"><input type="checkbox" class="sh-inter"> ' + H(t('embedInteractive')) + '</label></div>'
      + '<div class="sh-row"><textarea class="sh-code" readonly rows="3" spellcheck="false" aria-label="' + H(t('embedCodeLabel')) + '"></textarea></div>'
      + '<div class="sh-row"><button class="sh-btn sh-ecopy" type="button" style="flex:1;"></button><button class="sh-btn sec sh-pvbtn" type="button"></button></div>'
      + '<div class="sh-pv" hidden></div>'
      + '<div class="sh-inc">' + H(t('embedInc')) + '</div>';
    const sizeEl = host.querySelector('.sh-size'), interEl = host.querySelector('.sh-inter');
    const codeEl = host.querySelector('.sh-code'), ec = host.querySelector('.sh-ecopy');
    const pb = host.querySelector('.sh-pvbtn'), pv = host.querySelector('.sh-pv');
    /* the size choices are the presets' own numbers — nothing to translate, nothing to keep in step */
    Object.keys(EMBED_SIZES).forEach((k) => { const z = EMBED_SIZES[k]; sizeEl.appendChild(new Option(z.w + ' × ' + z.h, k, k === size, k === size)); });
    interEl.checked = interactive;
    const copyLabel = () => t('embedCopy');   /* the words; copy() draws the clipboard glyph beside them */
    ec.replaceChildren(iconNode('clipboard'), ' ' + copyLabel());
    pb.textContent = t('embedPreview');
    /* the code is rebuilt from the CURRENT map on every change and on every copy, so it never
       describes a view the reader has since moved away from while the panel was open */
    const refresh = () => { codeEl.value = embed({ size: sizeEl.value, interactive: interEl.checked }).code; stopPreview(); };
    codeEl.value = embed().code;
    sizeEl.onchange = refresh; interEl.onchange = refresh;
    ec.onclick = ctx.copy(ec, () => { codeEl.value = embed().code; return codeEl.value; }, codeEl, copyLabel);
    /* the preview IS the embed: the code's own address in a real frame, drawn at its real size and
       scaled into the panel (a percentage width is previewed at the medium width). It boots a second
       copy of the map, so it is made only when asked for and torn down when the panel closes. */
    pb.onclick = () => {
      if (!pv.hidden) { stopPreview(); return; }
      const e = embed(); codeEl.value = e.code; pv.hidden = false; pb.textContent = t('embedPreviewHide');
      const fw = typeof e.size.w === 'number' ? e.size.w : EMBED_SIZES.medium.w, fh = e.size.h;
      const k = Math.min(1, Math.max(1, pv.clientWidth) / fw);
      pv.style.height = Math.round(fh * k) + 'px';
      const f = document.createElement('iframe'); f.title = t('embedFrameTitle');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      f.style.cssText = 'border:0;width:' + fw + 'px;height:' + fh + 'px;transform:scale(' + k + ');transform-origin:0 0;';
      f.src = e.url; pv.appendChild(f);
    };
    /* the map may have moved since the tab was built */
    return { refresh: () => { codeEl.value = embed().code; } };
  }
  return { embed, render, stopPreview };
}

/* ══ THE EMBED VIEW — only when this page IS an embed ════════════════════════════════════════ */
function tr(key, fallback) {
  try {
    const I = window.IntMapI18N, c = (I && I.lang && I.lang()) || 'en';
    const v = (I && I[c] && I[c][key]) || (I && I.en && I.en[key]);
    return v || fallback;
  } catch (_) { return fallback; }
}
function langTag() {
  try { const I = window.IntMapI18N, c = (I && I.lang && I.lang()) || 'en'; return IntMapLang.htmlTag(c); }
  catch (_) { return 'en'; }
}

/* What the clock is showing, in the reader's language: 「Live」 or the date (with its era below
   year 1 — js/hist-scale.js dateText is the one owner of that rule). */
function instantText() {
  try {
    if (IntMapTime.isLive()) return tr('embedLive', 'Live');
    const d = IntMapTime.get(); if (!d) return tr('embedLive', 'Live');
    const HS = window.IntMapHistScale;
    if (HS && HS.dateText) return HS.dateText(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), langTag());
    return IntMapTime.iso();
  } catch (_) { return ''; }
}

function bootEmbed() {
  /* ── read-only: the reader's click, right-click, double-click, changed field and key stop before
     the app's handlers. Capture phase on the document runs before every listener the app attached
     anywhere below it, so this does not depend on knowing who listens — the map's popups and tools,
     a legend's switches (its ×, its mode buttons, its year: each would change what the frame shows).
     Exempt: the renderer's own controls (its attribution toggle), links (a source's page, 「Open in
     IntMap」) and this file's bar. ── */
  const exempt = (t) => !!(t && t.closest && t.closest('.maplibregl-control-container, a, #im-embed-bar'));
  const inMap = (t) => !!(t && t.closest && t.closest('#map'));
  ['click', 'contextmenu', 'dblclick', 'auxclick', 'change', 'input'].forEach((type) => {
    document.addEventListener(type, (e) => {
      /* ⚠ ONLY THE READER'S OWN EVENTS. The share-link restore turns layers on by dispatching `change`
         and switches projection / base map with `button.click()` — both untrusted, and stopping them
         would leave an embed showing none of the map it was given. */
      if (!e.isTrusted || exempt(e.target)) return;
      /* a double-click zoom is a zoom — the one map gesture besides pan an interactive embed keeps */
      if (type === 'dblclick' && EMBED.interactive && inMap(e.target)) return;
      if (type === 'contextmenu') e.preventDefault();
      e.stopPropagation();
    }, true);
  });
  /* no key reaches the app's document-level shortcuts; a key pressed while the map has focus still
     reaches the renderer (its keyboard pan/zoom), unless the embed is a still picture */
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    if (EMBED.interactive && inMap(e.target)) return;
    if (exempt(e.target)) return;
    e.stopPropagation();
  }, true);
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.addEventListener('keydown', (e) => { e.stopPropagation(); });
  /* …and a legend control cannot be reached by Tab either, for the same reason */
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.data-legend, .koppen-legend') && !exempt(t)) { try { t.blur(); } catch (_) { } }
  }, true);

  /* ── the bar: the instant on the clock + 「Open in IntMap」 ── */
  const bar = document.createElement('div');
  bar.id = 'im-embed-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'IntMap');
  const when = document.createElement('span');
  when.className = 'im-embed-when';
  const open = document.createElement('a');
  open.className = 'im-embed-open';
  open.target = '_blank';
  open.rel = 'noopener';
  bar.appendChild(when);
  bar.appendChild(open);
  document.body.appendChild(bar);
  /* the address is read at the moment it is used: the share link's own writer keeps this frame's
     address bar on the map it shows (js/map-ui.js viewHash save(), after the boot restore has read
     it), so the link opens what the frame shows NOW */
  const href = () => appUrl(location.href);
  const paint = () => {
    try {
      when.textContent = instantText();
      open.textContent = tr('embedOpen', 'Open in IntMap') + ' ↗';
      open.title = tr('embedOpenTitle', 'Open this map in IntMap (new tab)');
      open.href = href();
    } catch (_) { }
  };
  open.addEventListener('pointerdown', () => { try { open.href = href(); } catch (_) { } });
  open.addEventListener('focus', () => { try { open.href = href(); } catch (_) { } });
  paint();
  try { IntMapTime.on(paint); } catch (_) { }
  /* the language settles during the boot; repaint once it has had its turn */
  [1500, 5000].forEach((ms) => setTimeout(paint, ms));
}

if (EMBED.on && typeof document !== 'undefined') {
  /* the attribute is index.html's (set before the first frame); restating it here is harmless and
     keeps the view correct if this file is ever reached by another route */
  try {
    document.documentElement.setAttribute('data-embed', EMBED.interactive ? '1' : 'static');
    const st = document.createElement('style'); st.id = 'im-embed-css'; st.textContent = EMBED_CSS;
    document.head.appendChild(st);
  } catch (_) { }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootEmbed, { once: true });
  else bootEmbed();
}
