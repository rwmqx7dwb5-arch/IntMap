/* ============================================================================
 *  IntMap · THE PHONE'S ONE SHEET — detents, the spring, its screens, the legend tray  (mobile-shell)
 * ----------------------------------------------------------------------------
 *  「スマホのパフォーマンスと UI を改善して。任せる。」→「修正じゃなくて作り変えを要求してる。」
 *
 *  MEASURED on production before this (390 × 844, first visit): the chrome covered 45.2 % of the map —
 *  a 144 px sheet, two legend cards opened over the map by default (21 %), a right-hand column of four
 *  round buttons, a map thumbnail, a coordinate bar, a floating clock and a search circle — and the two
 *  legend cards sat ON TOP of the search results and of Chronos, because all three were z 1100 and the
 *  legends were appended later. Fourteen of the twenty-one tap targets on screen were under 44 px.
 *  The Layers, Tools and base-map choices each opened a separate overlay with its own scrim.
 *
 *  THE SHAPE THIS FILE GIVES IT — the iOS map-app pattern, one sheet and one control group:
 *    · the sheet has FOUR resting heights, `hidden` (the grip only) · `min` (the search row) ·
 *      `half` · `full`, and is let go on a SPRING whose initial velocity is the finger's;
 *    · Layers, Tools, the Map menu, Chronos and Settings are SCREENS INSIDE IT. Nothing is rebuilt:
 *      `makeScreens().adopt(el, …)` lends the sheet the element that already exists while its owner
 *      says it is open, and hands it back when its owner says it is shut — so every handler, every
 *      `[data-proxy]`, every id a test or Atlas reaches for is the same object it always was;
 *    · legends no longer open over the map by themselves. They are laid out by the same tiler as
 *      always (js/data-layers.js) and stay INVISIBLE until the reader opens the tray from the one chip
 *      that says how many there are (`makeLegendTray`).
 *
 *  ⚠ PURE WHERE IT CAN BE. `detentHeights`, `settleDetent` and `spring` take numbers and return
 *  numbers, so tests/mobile-shell-checks.test.mjs runs them as they are shipped; `detentFor` (where the sheet
 *  rests, from what the reader is doing) is run the same way by tests/mobile-shell-flow-checks.test.mjs.
 * ==========================================================================*/

/* ── the resting heights ─────────────────────────────────────────────────────────────────────── */

/** the order a flick walks through, lowest first */
export const DETENTS = Object.freeze(['hidden', 'min', 'half', 'full']);

/* What is still showing at `hidden`: the 5 px grip bar and the space around it that a finger lands
   on — the .sheet-grip box in css/intmap.css's phone shell block is this tall. If that box changes,
   this changes with it (the sheet would otherwise park its grip half off the screen). */
export const GRIP_VISIBLE = 22;
/* `half` as a share of the window, not of the sheet: the reader's question at half is «how much map
   is left», and that is a fraction of the screen. 0.45 leaves 55 % of an 844 px phone to the map —
   measured: the previous half (363 px) left 57 %, so the step is the same and the sheet holds one
   more row of the feed. */
export const HALF_SHARE = 0.45;

/**
 * The visible height of the sheet at each detent.
 * @param {{H:number, vh:number, headH:number, safeBottom:number}} m
 *   H — the sheet's full height (css `--sheet-h`), vh — window height, headH — bottom edge of the
 *   search row inside the sheet (grip + field), safeBottom — the home-indicator inset.
 */
export function detentHeights(m) {
  const H = Math.max(0, +m.H || 0), vh = Math.max(0, +m.vh || 0);
  const sb = Math.max(0, +m.safeBottom || 0);
  const min = Math.min(H, Math.round((+m.headH || 0) + 8 + sb));
  const hidden = Math.min(min, Math.round(GRIP_VISIBLE + sb));
  const half = Math.min(H, Math.max(min + 1, Math.round(vh * HALF_SHARE)));
  return { hidden, min, half, full: H };
}

/**
 * Where a released sheet goes: the finger's velocity decides when it is a flick (more than
 * 0.45 px/ms — the threshold this sheet has used since #R107), otherwise the nearest detent.
 * A flick goes ONE detent in its direction, never past the next one.
 * @param {number} vis visible height at release · @param {number} v px/ms, positive = downward
 */
export function settleDetent(vis, v, heights) {
  const order = DETENTS.map((n) => ({ n, h: heights[n] }));
  if (v > 0.45) { const below = order.filter((o) => o.h < vis - 2); return (below.length ? below[below.length - 1] : order[0]).n; }
  if (v < -0.45) { const above = order.find((o) => o.h > vis + 2); return (above || order[order.length - 1]).n; }
  return order.reduce((a, b) => (Math.abs(b.h - vis) < Math.abs(a.h - vis) ? b : a)).n;
}

/* ── what the reader is doing decides the detent ─────────────────────────────────────────────── */

/* ══ (mobile-shell-flow) ONE RULE FOR WHERE THE SHEET RESTS ══════════════════════════════════════════════
   MEASURED on production (0cb41ee, 390 × 844): a place picked from the search candidates left the sheet at
   `full` five seconds later — the map was the top 118 px, and the place card the pick had just put on the map
   was cut off above the screen. The field had raised the sheet for its candidates and nothing said the search
   was over: the decisions were scattered (a focus handler, a blur handler with its own conditions, a tab
   handler), and none of them heard «the answer is on the map now».
   So the detent is decided here, from what the reader is doing, and every signal in js/mobile-ui.js asks this:
     type     the search field has the caret — the candidates need the room            → full
     leave    the field let go with nothing chosen — back where the reader was           → `before`, never higher
     card     an answer is a card ON THE MAP (a place picked) and the sheet holds none
              of it — the map is the answer                                              → min, never higher
     move     the app moved the map to show something (a flight that no finger made) —
              the sheet must not hide where it went                                      → half, never higher
     tab      a tab of the sheet was chosen — its content is the answer (Atlas writes in
              it and draws on the map at once) — half, unless the reader had it higher
              themselves; a raise the FIELD made is not the reader's                     → half
   ⚠ «never higher»: an answer lowers the sheet; it never lifts a sheet the reader put lower. */
/* The one way a module says «I have put an answer on the map»: `detail.kind` is a row above ('card'). The
   module states what it did; it does not choose a detent (that is this table's job, and only on a phone). */
export const MAP_ANSWER_EVENT = 'intmap-map-answer';
const RANK_OF = Object.freeze({ hidden: 0, min: 1, half: 2, full: 3 });
const lower = (a, b) => (RANK_OF[a] <= RANK_OF[b] ? a : b);
/**
 * @param {'type'|'leave'|'card'|'move'|'tab'} activity
 * @param {{current:string, before?:string|null}} s  current — the detent now · before — where the sheet was
 *   when the search field raised it (null when the field has not raised it)
 * @returns {string} the detent to rest at
 */
export function detentFor(activity, s) {
  const cur = (s && s.current in RANK_OF) ? s.current : 'min';
  const before = s && s.before in RANK_OF ? s.before : null;
  switch (activity) {
    case 'type': return 'full';
    case 'leave': return before ? lower(cur, before) : cur;
    case 'card': return lower(cur, 'min');
    case 'move': return lower(cur, 'half');
    case 'tab': return (before || RANK_OF[cur] < RANK_OF.half) ? 'half' : cur;
    default: return cur;
  }
}

/* ── the spring ──────────────────────────────────────────────────────────────────────────────── */

/**
 * A damped spring from 0 to 1, started at velocity `v0` (in «whole distances per second», positive
 * toward the target) — the motion UIKit gives a released sheet. Returns the easing as a function of
 * normalised time, its duration, and the same curve as a CSS `linear()` string, so the sheet (CSS)
 * and the map's padding (js easing) ride ONE curve and cannot settle out of phase (#R139/#R140).
 *   x(t) = 1 − e^(−ζωt) · (cos ω_d t + ((ζω − v0)/ω_d) · sin ω_d t)      x(0)=0, x'(0)=v0
 * response 0.42 s and ζ 0.86 are UIKit's sheet defaults to the eye (≤ 1.5 % overshoot at rest).
 */
export function spring(v0, opt) {
  const response = (opt && opt.response) || 0.42, zeta = (opt && opt.damping) || 0.86;
  const w = 2 * Math.PI / response, wd = w * Math.sqrt(1 - zeta * zeta);
  const v = Math.max(-12, Math.min(12, +v0 || 0));            /* a wild sample cannot launch it off the screen */
  const B = (zeta * w - v) / wd;
  const x = (t) => 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + B * Math.sin(wd * t));
  /* settled when the envelope is under a thousandth of the distance */
  const dur = Math.min(1.1, Math.max(0.24, Math.log(Math.sqrt(1 + B * B) / 1e-3) / (zeta * w)));
  const N = 40, pts = [];
  for (let i = 0; i <= N; i++) pts.push(i === N ? 1 : +x(i / N * dur).toFixed(4));
  return {
    duration: dur,
    ease: (p) => (p <= 0 ? 0 : p >= 1 ? 1 : x(p * dur)),
    css: 'linear(' + pts.join(', ') + ')',
  };
}

/* ── screens: the sheet borrows elements that already exist ────────────────────────────────────── */

/**
 * @param {{host:HTMLElement, sheet:HTMLElement, active:()=>boolean, onChange:(top:object|null, how:'open'|'close')=>void}} o
 *   host — where a screen is shown (inside the sheet) · active — is the phone layout on
 */
export function makeScreens(o) {
  const host = o.host, sheet = o.sheet;
  const entries = [], stack = [];
  let mo = null;
  const homeOf = new WeakMap();
  function lend(e) {
    const el = e.el;
    if (!homeOf.has(el) && el.parentNode) { const ph = document.createComment('screen-home'); el.parentNode.insertBefore(ph, el); homeOf.set(el, ph); }
    host.appendChild(el);
    el.classList.add('m-screen');
    stack.push(e);
    sheet.classList.add('m-has-screen');
  }
  function giveBack(e) {
    const el = e.el, ph = homeOf.get(el);
    el.classList.remove('m-screen');
    if (ph && ph.parentNode) ph.parentNode.insertBefore(el, ph);
    const i = stack.indexOf(e); if (i >= 0) stack.splice(i, 1);
    /* the one that is now on top is shown again — re-append it so it is the last child (the CSS shows
       only the last screen) */
    const top = stack[stack.length - 1]; if (top) host.appendChild(top.el);
    if (!stack.length) sheet.classList.remove('m-has-screen');
  }
  function sync(e) {
    let open = false;
    try { open = !!(o.active() && e.isOpen()); } catch (_) { open = false; }
    const lent = stack.indexOf(e) >= 0;
    if (open && !lent) { lend(e); try { o.onChange(e, 'open'); } catch (_) { } }
    else if (!open && lent) { giveBack(e); try { o.onChange(stack[stack.length - 1] || null, 'close'); } catch (_) { } }
  }
  /* ⚠ THE OWNER'S OWN STATE IS THE SWITCH — a class or an inline display it already writes — so
     there is no second «is this open» to keep in step. One observer, attribute records only, on the
     adopted elements themselves (never a subtree: the map container's would fire on every tile). */
  function adopt(el, spec) {
    if (!el) return null;
    const e = Object.assign({ el, key: spec.key || el.id }, spec);
    entries.push(e);
    if (!mo && typeof MutationObserver === 'function') mo = new MutationObserver((recs) => {
      for (const r of recs) { const x = entries.find((k) => k.el === r.target); if (x) sync(x); }
    });
    if (mo) mo.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    sync(e);
    return e;
  }
  return {
    adopt,
    /* the width crossed the phone line: lend or give back everything to match */
    syncAll: () => entries.forEach(sync),
    top: () => stack[stack.length - 1] || null,
    depth: () => stack.length,
    /* Back / swipe-down on a screen: ask its OWNER to close it, which is what gives it back. */
    closeTop: () => { const t = stack[stack.length - 1]; if (t) { try { t.close(); } catch (_) { } } return !!t; },
  };
}

/* ── the centre readout: asked for, not always drawn ────────────────────────────────────────────── */

/* (#R15) the crosshair and its readout (coordinates · elevation · the layer value at the centre) were
   drawn over the map at all times — the coordinate bar was 4,240 px² of the 45 % measured. On the phone
   they are now shown while a measuring tool needs them, and whenever the reader keeps the switch on in
   the Map screen (js/basemap-switch.js). The choice is the reader's and survives a reload. */
const XH_KEY = 'intmap_m_xhair';
export function crosshairWanted() { try { return localStorage.getItem(XH_KEY) === '1'; } catch (_) { return false; } }
export function setCrosshairWanted(on) {
  try { localStorage.setItem(XH_KEY, on ? '1' : '0'); } catch (_) { }
  try { window.dispatchEvent(new CustomEvent('intmap-m-xhair', { detail: { on: !!on } })); } catch (_) { }
}

/* ── the legend tray ─────────────────────────────────────────────────────────────────────────── */

/* A legend that floats over the map is a DIRECT child of the map container whose class or id says
   `legend` — js/data-layers.js appends every one of them there (`mc.appendChild(legend)`), and
   js/window-manager.js's dock reads the same fact with the same selector (DOCK_SEL, #R238: a
   descendant match would take the layer rows' swatches with it). The phone stylesheet hides exactly
   this set until the tray is open (`body:not(.m-leg-open) #map-container > [class*="legend"]…`). */
export const LEGEND_SEL = '[class*="legend"], [id*="legend"]';

/** is this legend switched on — its owner writes `display` inline (34 sites in js/data-layers.js) */
function legendOn(el) {
  if (!el || el.hidden || !el.isConnected) return false;
  if (el.style && el.style.display === 'none') return false;
  try { return getComputedStyle(el).display !== 'none'; } catch (_) { return true; }
}

/**
 * @param {{container:HTMLElement, chip:HTMLElement, count:HTMLElement, frame:(key:string, fn:Function)=>void, onOpen?:()=>void}} o
 */
export function makeLegendTray(o) {
  const mc = o.container, chip = o.chip;
  let n = -1, watched = new WeakSet(), mo = null, queued = false;
  const legends = () => Array.prototype.filter.call(mc.children, (el) => el.matches && el.matches(LEGEND_SEL));
  function recount() {
    queued = false;
    const all = legends();
    all.forEach(watch);                      /* an OFF legend is watched too — switching it on is the change */
    const on = all.filter(legendOn);
    if (on.length !== n) {
      n = on.length;
      if (o.count) o.count.textContent = n ? String(n) : '';
      chip.hidden = !n;
      if (!n) setOpen(false);
    }
  }
  function ask() { if (queued) return; queued = true; o.frame('mobile.legend-tray', recount); }
  function watch(el) { if (!mo || watched.has(el)) return; watched.add(el); mo.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }); }
  function setOpen(v) {
    document.body.classList.toggle('m-leg-open', !!v);
    chip.setAttribute('aria-expanded', v ? 'true' : 'false');
    if (v) { try { o.onOpen && o.onOpen(); } catch (_) { } }
  }
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(ask);
    mo.observe(mc, { childList: true });
    legends().forEach(watch);
  }
  chip.addEventListener('click', () => setOpen(!document.body.classList.contains('m-leg-open')));
  recount();
  return { recount, open: () => setOpen(true), close: () => setOpen(false), count: () => Math.max(0, n), isOpen: () => document.body.classList.contains('m-leg-open') };
}
