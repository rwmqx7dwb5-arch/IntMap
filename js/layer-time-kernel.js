// @ts-check
/* ============================================================================
 *  IntMap · js/layer-time-kernel.js — THE MAP AT INSTANT T, DRAWN ONLY WHERE A SOURCE STATES IT
 *  (world-at-time) — window.IntMapLayerTime
 * ----------------------------------------------------------------------------
 *  The rule is js/layer-time.js (pure); the declarations are js/layer-time-decl.js (one per layer of
 *  js/layer-manifest.js — a gate holds the two equal). This file is what the rule DOES on the page:
 *
 *   ① A BOX WHOSE LAYER STATES NOTHING ABOUT THE INSTANT IS NOT DELIVERED TO ITS MODULE. Its `change`
 *     is held (the shape js/layer-rows.js `holdUntilDrawable` already uses for an undrawable style), and
 *     a box that was already drawn when the clock moved is WITHDRAWN: its module is sent the map's own
 *     «off» (marked `__syn`, so the reconciler does not read it as the reader's) and the box is ticked
 *     again without an event — the reader's choice stays exactly as they left it, the share link and
 *     the session keep it, and nothing of the module's is drawn. When the clock reaches an instant the
 *     layer states, the box is delivered once, as the map's own «on», and the module draws as it always
 *     did. No list of renderer layer ids is needed: each module's own «off» path is the one that knows.
 *     ⚠ ONLY A MODULE THAT DOES NOT APPLY THE INSTANT ITSELF IS HELD. A `self` module (historical
 *     records, the satellites, the yearly series that follow the clock) draws per instant already;
 *     holding it would take away a picture that is right.
 *   ② THE READER IS TOLD WHY — on the row (js/layer-state.js `nodata`, the same pill the satellites
 *     use), and in one legend that lists, for the instant on the clock, every ticked layer that is not
 *     drawn and every layer showing another date than the clock's (en + jp).
 *   ③ ATLAS READS THE SAME ANSWERS — `layerStates` (the row records), the `time` section of its state
 *     (`layers`), and `coverage(when)`: what a map at any instant can and cannot draw, for every layer,
 *     without switching one on (js/atlas-cap-time.js `time.coverage`).
 *
 *  ⚠ THE DECLARATIONS ARE LOADED WHEN THEY CAN MATTER. On the live clock no held kind is unstated (a
 *  snapshot and a live feed state the present; js/layer-time.js), so nothing here has work to do until
 *  the clock leaves the present or someone asks — the table is fetched then, not at boot.
 * ==========================================================================*/
import { isLayer } from './layer-manifest.js';
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { layerState } from './layer-state.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';

/** @type {Record<string, any>|null} */
let DECL = null;
/* the rule (js/layer-time.js) — fetched with the declarations, since nothing here judges before they are in hand
   (scripts/perf-budget.mjs: one eager module for this subject, the door below; the rule and the table are async) */
/** @type {any} */
let R = null;
/** @type {Promise<Record<string, any>>|null} */
let loading = null;
/* bounds a module read at run time (a series' years, a catalogue's element span) — id → {from,to,asOf,by} */
const RT = new Map();
/* the boxes this file is holding back: id → the instant it was held for (diagnostics) */
const held = new Map();
/* the row records this file wrote (so it clears its own and never a module's — js/satellites-live.js writes its own) */
const mine = new Set();
let lastAt = null;
/* a bound reported for the layer itself, else for the group it declares (one model run answers for ten rows) */
const rtOf = (id) => { const d = DECL && DECL[id]; return RT.get(id) || (d && d.group ? RT.get('@' + d.group) : undefined); };

const W = () => (typeof window !== 'undefined' ? /** @type {any} */ (window) : null);
const D = () => (typeof document !== 'undefined' ? document : null);

/* the files a declaration's bound points into (data/gibs-range.json …), read once with the table */
const FILES = {};
function load() {
  if (DECL) return Promise.resolve(DECL);
  /* ⚠ THE TABLE DOES NOT WAIT FOR THE FILES ITS BOUNDS POINT INTO. Those bounds stay unread («range not yet read»,
     never «stated») until a file arrives; then they are resolved and the instant is judged again. MEASURED: on the
     share link carrying every layer, the table arrived ~40 s after the clock left the present while it waited
     behind a busy page's requests for data/gibs-range.json — 40 s of today's layers on a 1991 map. */
  if (!loading) loading = Promise.all([import('./layer-time-decl.js'), import('./layer-time.js')]).then(([m, rule]) => {
    R = rule;
    const T = m.TIME;
    const files = Array.from(new Set(Object.keys(T).flatMap((id) => R.pointerFiles(T[id]))));
    const build = () => { const out = {}; for (const id of Object.keys(T)) out[id] = R.resolve(T[id], FILES); return out; };
    DECL = build();
    files.forEach((f) => {
      let u = f; try { u = new URL(f, D().baseURI).toString(); } catch (_) { /* relative */ }
      jsonWithin(u, clockFor(u)).then((j) => { if (j) { FILES[f] = j; DECL = build(); settleSoon(); } }, () => {});
    });
    return DECL;
  });
  return loading;
}
function lang() {
  try { return IntMapLang.normalise(D().documentElement.lang || 'en'); } catch (_) { return 'en'; }
}
const tr = (en, jp) => { try { return IntMapLang.t(lang(), en, jp); } catch (_) { return en; } };
const pickText = (o) => (o ? tr(o.en, o.jp) : '');

/** the instant a clock is at — { when, live, now }. (time-compare-lapse) A map has its own clock
    (js/chronos.js `makeClock`): the main map's is the default, and the comparison window hands its own. */
function clockAt(clock) {
  const T = clock || IntMapTime;
  const now = Date.now();
  if (!T) return { when: now, live: true, now };
  return { when: T.when().getTime(), live: !!T.isLive(), now };
}
/** is this a clock (js/chronos.js) rather than an instant? */
const isClock = (v) => !!v && typeof v === 'object' && !(v instanceof Date) && typeof v.when === 'function' && typeof v.isLive === 'function';
/** a caller's instant: a year (number), an ISO date, a Date, a clock, or nothing (the main map's clock) */
function atOf(when) {
  if (when == null) return clockAt();
  if (isClock(when)) return clockAt(when);
  if (!R) return null;
  const now = Date.now();
  const ms = (typeof when === 'number' && Math.abs(when) < 1e7) ? R.toMs(Math.round(when)) + 165 * 86400000 + 43200000 : R.toMs(when);
  if (ms == null) return null;
  return { when: ms, live: ms >= now, now };
}

function label(id) {
  const d = D(); const cb = d && d.getElementById(id);
  const row = cb && cb.closest ? (cb.closest('label') || cb.closest('.lyr-row')) : null;
  if (!row) return id;
  const sp = row.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label, .bx-name');
  /* the row's own words only — not the state pill (js/layer-state.js) or a favourite star written beside them */
  let s = '';
  if (sp) s = sp.textContent || '';
  else { const c = /** @type {any} */ (row.cloneNode(true)); c.querySelectorAll('.lyr-state, button, .lyr-fav, [aria-hidden="true"]').forEach((n) => n.remove()); s = c.textContent || ''; }
  s = String(s).replace(/\s+/g, ' ').replace(/[★☆]/g, '').trim();
  return s || id;
}

/** verdictOf(id, at, drawnBy?) → { status, reason, … , message:{en,jp}, self } (decl must be loaded).
    `drawnBy` — who draws the layer on the map asking (js/layer-time.js `onMap`); absent → the main map's module. */
function verdictOf(id, at, drawnBy) {
  const decl = (R && drawnBy) ? R.onMap(DECL && DECL[id], drawnBy) : (DECL && DECL[id]);
  if (!decl) return { id, status: 'unknown', reason: DECL ? 'undeclared' : 'not-loaded', message: null, self: false };
  const v = R.verdict(decl, at, rtOf(id));
  return Object.assign({ id, kind: decl.kind, self: !!decl.self, message: R.explain(decl, v, at) }, v);
}

/* ══ ① HOLD AND WITHDRAW ══════════════════════════════════════════════════════════════════════ */
function shouldHold(id, at) {
  if (!DECL) return false;
  const decl = DECL[id]; if (!decl) return false;
  return R.withholds(decl, R.verdict(decl, at, rtOf(id)));
}
function mark(id, at) {
  const v = verdictOf(id, at);
  const rec = layerState.get(id);
  if (rec && rec.state === 'nodata' && !mine.has(id)) return;   /* the module said it in its own words */
  layerState.report(id, 'nodata', { reason: 'out-of-time', message: pickText(v.message) });
  mine.add(id);
}
function unmark(id) {
  if (!mine.has(id)) return;
  mine.delete(id);
  const rec = layerState.get(id);
  if (rec && rec.state === 'nodata') layerState.set(id, null);
}
/* the faces that show a box as ticked — the module's own «off» untoggled them, and the box is ticked */
function faceOn(cb, wasRowOn) {
  try { const row = cb.closest && cb.closest('.lyr-row'); if (row && wasRowOn) row.classList.add('on'); } catch (_) { /* no row */ }
  try {
    const q = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(cb.id) : cb.id;
    D().querySelectorAll('.lst-tile[data-lid="' + q + '"]').forEach((t) => {
      t.classList.add('on'); if (t.getAttribute('role') === 'switch') t.setAttribute('aria-checked', 'true');
    });
  } catch (_) { /* no tiles */ }
}
function withdraw(cb, at) {
  let wasRowOn = false;
  try { const row = cb.closest && cb.closest('.lyr-row'); wasRowOn = !!(row && row.classList.contains('on')); } catch (_) { /* no row */ }
  held.set(cb.id, at.when);
  cb.__imTimeWithdraw = 1;
  try { cb.__syn = (cb.__syn || 0) + 1; } catch (_) { /* not ours */ }
  try { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { /* the box stays held */ }
  finally { try { cb.__syn = Math.max(0, (cb.__syn || 1) - 1); } catch (_) { /* nothing */ } cb.__imTimeWithdraw = 0; }
  cb.checked = true;
  faceOn(cb, wasRowOn);
  mark(cb.id, at);
}
function deliver(cb) {
  held.delete(cb.id);
  unmark(cb.id);
  if (!cb.checked) return;
  try { cb.__syn = (cb.__syn || 0) + 1; } catch (_) { /* nothing */ }
  try { cb.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { /* the module answers on its next change */ }
  finally { try { cb.__syn = Math.max(0, (cb.__syn || 1) - 1); } catch (_) { /* nothing */ } }
}

/** the capture-phase gate: a tick on a box whose layer states nothing about the instant does not reach
    the module. An untick always passes (a module's «off» is idempotent) and ends the hold. */
function gate(e) {
  const cb = /** @type {any} */ (e.target);
  if (!cb || cb.type !== 'checkbox' || !cb.id || !isLayer(cb.id)) return;
  if (cb.__imTimeWithdraw) return;
  if (!cb.checked) { if (held.has(cb.id)) { held.delete(cb.id); unmark(cb.id); } return; }
  const at = clockAt();
  if (!shouldHold(cb.id, at)) { if (held.has(cb.id)) { held.delete(cb.id); unmark(cb.id); } return; }
  /* the reader's own tick on a layer that opens on its record's first day (a war): let it move the clock.
     ⚠ (restore-clock-and-elam) A RESTORE'S TICK IS NOT THE READER'S. js/map-ui.js and js/session-tabs.js tick
     the boxes they restore with the same `change` a finger produces and mark each one `__imRestored` (the
     mark js/layer-home.js already spends instead of flying); the restore states the instant itself, so its
     tick is held like any other until the clock it sets reaches the record. Telling the two apart only by
     `__syn` let a restored war row through as the reader's, and the war then moved the clock off the
     instant the link named. */
  if (!cb.__syn && !cb.__imRestored && R.entersOnTick(DECL && DECL[cb.id])) { held.delete(cb.id); unmark(cb.id); return; }
  e.stopPropagation();
  held.set(cb.id, at.when);
  /* after the other capture listeners on the document (js/layer-state.js clears a record on every change) */
  Promise.resolve().then(() => mark(cb.id, at));
}

/** settle(): the clock moved (or the table arrived) — withdraw what became unstated, deliver what became stated */
let waitingDraw = false;
function settle() {
  const d = D(); if (!d) return;
  /* ⚠ NOT WHILE THE STYLE CANNOT TAKE LAYERS. js/layer-rows.js holds every `change` then and delivers the box's
     state LATER — the «off» sent below would be delivered as the «on» the box is ticked back to, after the
     gate below had already passed it, and the module would draw. MEASURED (166 boxes ticked at once, clock to
     −200): the webcams stayed drawn with their box held. So the whole settle waits for the style. */
  try {
    const E = W() && W().IntMapGeoEngine;
    if (E && E.hasRenderer() && !E.canDraw()) {
      if (!waitingDraw) { waitingDraw = true; E.whenCanDraw().then(() => { waitingDraw = false; settleSoon(); }, () => { waitingDraw = false; }); }
      return;
    }
  } catch (_) { /* no engine — nothing is held for it */ }
  const at = clockAt();
  lastAt = at;
  const boxes = Array.from(d.querySelectorAll('#layer-dropdown input[type=checkbox]')).filter((cb) => /** @type {any} */ (cb).checked && isLayer(cb.id));
  for (const cb of /** @type {any[]} */ (boxes)) {
    const hold = shouldHold(cb.id, at);
    if (hold && !held.has(cb.id)) withdraw(cb, at);
    else if (!hold && held.has(cb.id)) deliver(cb);
    else if (hold) mark(cb.id, at);   /* still held — the sentence names the new instant */
  }
  /* a `self` module draws per instant; say on its row when it has nothing for this one (never over its own words) */
  if (DECL) {
    for (const cb of /** @type {any[]} */ (boxes)) {
      const decl = DECL[cb.id]; if (!decl || !decl.self) continue;
      const v = R.verdict(decl, at, rtOf(cb.id));
      if (v.status === 'unstated') mark(cb.id, at); else unmark(cb.id);
    }
  } else { for (const id of Array.from(mine)) if (!held.has(id)) unmark(id); }
  for (const id of Array.from(held.keys())) { const cb = /** @type {any} */ (d.getElementById(id)); if (!cb || !cb.checked) { held.delete(id); unmark(id); } }
  paintLegend(at);
}
let settleQueued = false;
function settleSoon() {
  if (settleQueued) return; settleQueued = true;
  const run = () => { settleQueued = false; settle(); };
  const T = IntMapTime;
  /* off the present the table is fetched; ON the present it is waited for if it is already on its way — a
     clock that went back and returned while the table loaded still has rows to hold (a war's record ended) */
  if (!DECL && ((T && !T.isLive()) || loading)) { load().then(run, run); return; }
  Promise.resolve().then(run);
}

/* ══ ② THE LEGEND — one card for the instant, while something ticked is not drawn or shows another date ══ */
let legendDismissedAt = null;
function paintLegend(at) {
  const d = D(); if (!d) return;
  let el = d.getElementById('data-legend-worldtime');
  const rows = [];
  if (DECL) {
    d.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach((cb) => {
      const c = /** @type {any} */ (cb);
      if (!c.checked || !isLayer(c.id)) return;
      const v = verdictOf(c.id, at);
      /* on the live clock «drawn from another date» is every series' ordinary state (Köppen's last period, a
         survey's last year) and its own legend names the year — the card is for what is NOT drawn */
      if (v.status === 'unstated' || (v.status === 'carried' && !at.live)) rows.push({ id: c.id, v });
    });
  }
  if (!rows.length || legendDismissedAt === at.when) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = d.createElement('div'); el.className = 'data-legend generic-legend'; el.id = 'data-legend-worldtime';
    (d.getElementById('map-container') || d.body).appendChild(el);
    try { W()._wireLegendDrag && W()._wireLegendDrag(el); } catch (_) { /* not draggable */ }
  }
  /* built as nodes with textContent — the names and sentences are data, never markup */
  const day = (IntMapTime && IntMapTime.iso) ? IntMapTime.iso() : '';
  const not = rows.filter((r) => r.v.status === 'unstated'), other = rows.filter((r) => r.v.status === 'carried');
  const node = (tag, cls, text) => { const n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const list = (rs) => { const ul = node('ul', 'lt-list'); rs.forEach((r) => { const li = node('li'); li.dataset.lid = r.id; li.appendChild(node('b', '', label(r.id))); li.appendChild(d.createTextNode(' — ' + pickText(r.v.message))); ul.appendChild(li); }); return ul; };
  const close = node('button', 'layer-popup-x', '×'); close.title = tr('Close', '閉じる');
  el.replaceChildren(close, node('h4', '', tr('The map at ' + day, day + ' の地図')));
  if (not.length) el.append(node('div', 'lt-sec', tr('Not drawn — no source states this date', '描いていません——この日時を述べる典拠がありません')), list(not));
  if (other.length) el.append(node('div', 'lt-sec', tr('Drawn from another date', '別の時点の記録を表示')), list(other));
  const x = el.querySelector('.layer-popup-x');
  if (x) /** @type {any} */ (x).onclick = () => { legendDismissedAt = at.when; el.style.display = 'none'; try { W()._tileLegends && W()._tileLegends(); } catch (_) { /* placed next frame */ } };
  el.style.display = 'block';
  try { W()._tileLegends && W()._tileLegends(); } catch (_) { /* placed next frame */ }
}

/* ══ ③ THE READERS' DOOR ══════════════════════════════════════════════════════════════════════ */
const API = {
  /** the declarations, loaded — every other answer is synchronous once this has resolved */
  ready: () => load().then(() => { settle(); return true; }),
  loaded: () => !!DECL,
  /** is this box being held back for the instant on the clock? (js/data-layers.js's reconciler asks) */
  held: (id) => held.has(id),
  /** draws(id) — should this box's layer be on the map: ticked AND not held for the instant. A module that re-reads its
      box later (a retry, a tile reload) asks this, not `checked` — the box stays ticked for the reader while held.
      MEASURED: the roads reappeared on a 1900 map when the base tiles reloaded (js/app-body.js `_wireRef`). */
  draws: (id) => { const d = D(); const cb = /** @type {any} */ (d && d.getElementById(id)); return !!(cb && cb.checked) && !held.has(id); },
  heldIds: () => Array.from(held.keys()),
  /** verdict(id, when?, drawnBy?) — when: a year, an ISO date, a Date, or a map's clock (js/chronos.js
      `makeClock`); omitted → the main map's clock. `drawnBy` — who draws the layer on that map (see `onMap`). */
  verdict: (id, when, drawnBy) => { const at = atOf(when); return at && DECL ? verdictOf(id, at, drawnBy) : null; },
  /** judge(decl, when?) — a declaration that belongs to no layer of the manifest (a layer only the comparison
      window draws, js/compare.js), in the same vocabulary and by the same rule. A declaration the rule cannot
      read is `unknown`, never «stated» (`validate`, as the gate runs it). Needs the rule loaded (`ready()`). */
  judge: (decl, when) => {
    const at = atOf(when); if (!at || !R) return null;
    const bad = R.validate('(declared)', decl);
    if (bad.length) return { status: 'unknown', reason: 'undeclared', problems: bad, message: null, self: false };
    const v = R.verdict(decl, at);
    return Object.assign({ kind: decl.kind, self: !!decl.self, message: R.explain(decl, v, at) }, v);
  },
  /** a module reports a bound it read at run time — { from?, to?, asOf?, by } */
  range: (id, r) => { if (!id || !r) return; RT.set(id, Object.assign({}, rtOf(id) || {}, r)); settleSoon(); },
  /** coverage(when, { ids, on }) → { at, stated:[…], carried:[…], unstated:[…], unknown:[…] } for every
      declared layer (or `ids`, or the ticked ones with `on`) — nothing is switched on to answer it */
  coverage: async (when, opts) => {
    await load();
    const at = atOf(when); if (!at) return null;
    const o = opts || {}; const d = D();
    let ids = Array.isArray(o.ids) && o.ids.length ? o.ids : Object.keys(DECL);
    if (o.on && d) ids = ids.filter((id) => { const cb = /** @type {any} */ (d.getElementById(id)); return !!(cb && cb.checked); });
    const out = { at: { date: new Date(at.when).toISOString(), live: at.live }, stated: [], carried: [], unstated: [], unknown: [] };
    const L = lang();
    for (const id of ids) {
      const v = verdictOf(id, at);
      const row = { id, name: label(id), kind: v.kind || null, reason: v.reason, from: v.from, to: v.to };
      if (v.message) row.why = L === 'jp' ? v.message.jp : v.message.en;
      if (v.shows != null) row.shows = v.shows;
      (out[v.status] || out.unknown).push(row);
    }
    return out;
  },
  /** what the ticked layers do at the instant on the clock (Atlas's `time` section) */
  active: () => {
    if (!DECL) return null;
    const at = clockAt(), d = D(); if (!d) return null;
    const out = [];
    d.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach((cb) => {
      const c = /** @type {any} */ (cb); if (!c.checked || !isLayer(c.id)) return;
      const v = verdictOf(c.id, at);
      out.push({ id: c.id, status: v.status, reason: v.reason, held: held.has(c.id), why: v.message ? pickText(v.message) : null });
    });
    return out;
  },
  /** the rule's own problems with the declarations (the gate runs the same `validate`) */
  problems: async () => { await load(); return Object.keys(DECL).flatMap((id) => R.validate(id, DECL[id])); },
  /** diagnostics: the instant the last settle used */
  lastSettled: () => (lastAt ? { when: new Date(lastAt.when).toISOString(), live: lastAt.live } : null),
};

try {
  const d = D(), w = W();
  if (d && w) {
    d.addEventListener('change', gate, true);
    /* a held box's row says why it is not drawn, whatever else reaches it: a request its module started before the
       hold, or a module reporting on its own feed, describes a layer that is no longer asked to draw. MEASURED: the
       aircraft row read «couldn't load» on a 1960 map. Re-marked after the writer's turn, and only while still held
       (the reader's untick ends the hold first). */
    layerState.on((id, rec) => {
      if (!held.has(id) || (rec && rec.state === 'nodata')) return;
      Promise.resolve().then(() => { if (held.has(id) && lastAt) { mine.delete(id); mark(id, lastAt); } });
    });
    w.IntMapLayerTime = API;
    const hook = () => {
      const T = IntMapTime; if (!T || typeof T.on !== 'function') return false;
      T.on(() => settleSoon());
      if (!T.isLive()) settleSoon();
      return true;
    };
    if (!hook()) d.addEventListener('DOMContentLoaded', hook, { once: true });
    w.addEventListener('intmap-lang', () => { if (DECL) settle(); });
  }
} catch (_) { /* headless */ }

