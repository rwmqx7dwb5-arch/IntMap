/* ============================================================================
 *  IntMap · NAMED ACTIONS — what used to be inline event attributes  (csp-without-inline)
 * ----------------------------------------------------------------------------
 *  THE DEFECT THIS EXISTS FOR. index.html's Content-Security-Policy had to carry `'unsafe-inline'` in
 *  script-src because 42 places in js/ built markup with an event attribute inside it —
 *  `onclick="_coSfRemove(${i})"`, `onerror="this.style.display='none'"`. A CSP cannot admit an event
 *  attribute by hash (that needs `'unsafe-hashes'`, and a handler with `${i}` in it has no fixed hash),
 *  so as long as ONE such attribute existed, every injected `<img onerror=…>` an escaping slip let
 *  through would run too. The policy was guarding the app's own convenience, not the reader.
 *
 *  THE SHAPE NOW. Markup names an action instead of carrying code:
 *
 *      <button data-im-click="coFilterRemove" data-im-arg="3">×</button>
 *      <select data-im-change="statsFilterKey" data-im-arg="0">…</select>
 *      <img data-im-error="hideSelf" src="…">
 *
 *  and ONE listener per event type, on `window` in the CAPTURE phase, runs the action the attribute
 *  names. Capture at window is the earliest point an event can be seen, so an action runs before any
 *  ancestor's bubble handler — the same order the inline attribute had (it ran at the target, before
 *  the bubble) — and `error`, which does not bubble, is still seen (capture reaches the target whether
 *  or not the event bubbles).
 *
 *  ⚠ THE NAMES ARE DECLARED HERE AND NOWHERE ELSE. ACTIONS below is the whole vocabulary. An
 *  attribute naming something that is not in it is REFUSED and recorded (window.__imErrors — the ring
 *  the Bug Report tool attaches — and the console): nothing is looked up on `window` by the attribute's
 *  own text, which is what keeps an injected `data-im-click="anything"` inert. scripts/csp.mjs (a rule
 *  in `npm run check:static`) holds the two directions — every name written in served markup is
 *  declared here, every name declared here is written somewhere — and refuses an inline event
 *  attribute anywhere in the served code.
 *
 *  ⚠ A VALUE THE MARKUP CARRIES IS DATA, NOT CODE. `data-im-arg` is read as a string; an action that
 *  wants an index parses it and refuses anything that is not a non-negative integer. The functions the
 *  actions call are the same window functions the attributes called — nothing about what they do moved.
 * ==========================================================================*/

/** The window function an action calls, or a refusal on the record. */
function call(name, ...args) {
  const f = typeof window !== 'undefined' ? window[name] : undefined;
  if (typeof f !== 'function') { record('target-missing', name); return; }
  return f(...args);
}
/** `data-im-arg` as an index: a non-negative integer, or a refusal. */
function index(el) {
  const s = el.getAttribute('data-im-arg');
  if (s == null || !/^\d{1,6}$/.test(s)) { record('bad-index', String(s)); return null; }
  return Number(s);
}
/** `data-im-arg` as one of the words an action admits, or a refusal. */
function oneOf(el, words) {
  const s = el.getAttribute('data-im-arg');
  if (!words.includes(s)) { record('bad-word', String(s)); return null; }
  return s;
}
const ifIndex = (el, fn) => { const i = index(el); if (i != null) fn(i); };
const ifWord = (el, words, fn) => { const w = oneOf(el, words); if (w != null) fn(w); };

/* ── THE VOCABULARY ────────────────────────────────────────────────────────────────────────────
   `on` is the one event the action answers; `run(el, ev)` is what it does. Grouped by the screen
   that writes the markup. */
export const ACTIONS = Object.freeze({
  /* shared — a link inside a clickable card opens itself and does not also open the card */
  stopPropagation: { on: 'click', run: (el, ev) => { ev.stopPropagation(); } },
  /* shared — an image whose source failed takes no space (favicons, news thumbnails) */
  hideSelf: { on: 'error', run: (el) => { el.style.display = 'none'; } },

  /* Dashboard — the Places / Events switch and the category chips (js/companies-ui.js,
     js/analysis-world-events.js) */
  dashView: { on: 'click', run: (el) => ifWord(el, ['places', 'events'], (v) => call('_setDashView', v)) },
  dashCategory: { on: 'click', run: (el) => ifWord(el, ['mil', 'tech', 'maritime', 'geo'], (c) => call('toggleDashCat', c)) },
  /* Dashboard › Events — the two year bounds */
  eventsYear: { on: 'change', run: (el) => ifWord(el, ['min', 'max'], (w) => call('_evYear', w, el.value)) },

  /* Countries — sort and the value filter (js/countries-ui.js) */
  statsSort: { on: 'change', run: (el) => call('setStatsSort', el.value) },
  statsSortDir: { on: 'click', run: () => call('toggleStatsSortDir') },
  statsFilterToggle: { on: 'click', run: () => call('_sfToggle') },
  statsFilterAdd: { on: 'click', run: () => call('_sfAdd') },
  statsFilterClear: { on: 'click', run: () => call('_sfClear') },
  statsFilterRemove: { on: 'click', run: (el) => ifIndex(el, (i) => call('_sfRemove', i)) },
  statsFilterKey: { on: 'change', run: (el) => ifIndex(el, (i) => call('_sfSetKey', i, el.value)) },
  statsFilterOp: { on: 'change', run: (el) => ifIndex(el, (i) => call('_sfSetOp', i, el.value)) },
  statsFilterValue: { on: 'change', run: (el) => ifIndex(el, (i) => call('_sfSetVal', i, el.value)) },

  /* Companies — the same controls for the company list (js/companies-ui.js) */
  coSort: { on: 'change', run: (el) => call('setCoSort', el.value) },
  coSortDir: { on: 'click', run: () => call('toggleCoSortDir') },
  coFilterToggle: { on: 'click', run: () => call('_coSfToggle') },
  coFilterAdd: { on: 'click', run: () => call('_coSfAdd') },
  coFilterClear: { on: 'click', run: () => call('_coSfClear') },
  coFilterRemove: { on: 'click', run: (el) => ifIndex(el, (i) => call('_coSfRemove', i)) },
  coFilterKey: { on: 'change', run: (el) => ifIndex(el, (i) => call('_coSfSetKey', i, el.value)) },
  coFilterOp: { on: 'change', run: (el) => ifIndex(el, (i) => call('_coSfSetOp', i, el.value)) },
  coFilterValue: { on: 'change', run: (el) => ifIndex(el, (i) => call('_coSfSetVal', i, el.value)) },

  /* the comparison tray, the news-area banner and the pin popup (js/app-body.js) */
  compareShow: { on: 'click', run: () => call('_showCompare') },
  compareClear: { on: 'click', run: () => call('_clearCompare') },
  newsAreaClear: { on: 'click', run: () => call('_clearNewsArea') },
  pinPopupClose: { on: 'click', run: () => call('_closePinPopup') },

  /* the radius tool's «clear all» (js/tool-panel.js) */
  radiusClearAll: { on: 'click', run: () => call('clearAllRadius') },

  /* a webcam whose stream failed: hide it and show the «offline» line beside it (js/cameras.js) */
  webcamOffline: {
    on: 'error',
    run: (el) => {
      el.style.display = 'none';
      const n = el.parentNode && el.parentNode.querySelector('.wc-off');
      if (n) n.style.display = 'block';
    },
  },
});

/** The event types the vocabulary answers, each with the attribute that names its action. */
export const EVENTS = Object.freeze([...new Set(Object.values(ACTIONS).map((a) => a.on))]);
const attrFor = (type) => 'data-im-' + type;

function record(kind, detail) {
  const msg = 'inline-actions: ' + kind + ' ' + detail;
  try {
    const ring = (typeof window !== 'undefined') && window.__imErrors;
    if (Array.isArray(ring)) { ring.push({ t: Date.now(), kind: 'inline-action', msg: msg.slice(0, 400), extra: '' }); if (ring.length > 25) ring.shift(); }
  } catch (_) { /* the ring is a convenience; the console line below is the record */ }
  try { console.warn('[IntMap] ' + msg); } catch (_) { /* no console */ }
}

/** Run the action(s) an event reaches, innermost first — the order nested inline attributes ran in. */
export function dispatch(ev) {
  const attr = attrFor(ev.type);
  const t = ev.target;
  if (!t || typeof t.closest !== 'function') return;
  /* click is delivered to the innermost element under the pointer and an attribute on any ancestor
     answered it (the inline handler of a <button> ran for a click on the <span> inside it); change
     and error are the target's own. */
  let el = ev.type === 'click' ? t.closest('[' + attr + ']') : (t.hasAttribute(attr) ? t : null);
  while (el) {
    const name = el.getAttribute(attr);
    const a = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : null;
    if (!a || a.on !== ev.type) record('unknown-action', ev.type + ':' + name);
    else {
      try { a.run(el, ev); } catch (e) { record('action-threw', name + ' ' + (e && e.message)); }
    }
    if (ev.type !== 'click' || ev.cancelBubble) break;
    el = el.parentElement ? el.parentElement.closest('[' + attr + ']') : null;
  }
}

/** One capture listener per event type, on the given window. Idempotent. */
function install(w) {
  if (!w || w.__imInlineActions) return;
  w.__imInlineActions = true;
  for (const type of EVENTS) w.addEventListener(type, dispatch, true);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') install(window);
