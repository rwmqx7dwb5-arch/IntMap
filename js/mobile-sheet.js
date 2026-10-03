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
     read     the answer is a card IN THE SHEET that the reader must read to the end (Atlas's
              sample card before login: its last lines are the plan and the login button) —
              MEASURED at half: the card is 459 px, the Atlas panel's window 170 px, and the
              button sat 234 px below the screen                                          → full
   ⚠ «never higher»: an answer lowers the sheet; it never lifts a sheet the reader put lower. */
/* The one way a module says «I have put an answer on the map»: `detail.kind` is a row above ('card'). The
   module states what it did; it does not choose a detent (that is this table's job, and only on a phone). */
export const MAP_ANSWER_EVENT = 'intmap-map-answer';   /* detail.kind: 'card' (on the map) · 'read' (a card in the sheet that needs the room) */
const RANK_OF = Object.freeze({ hidden: 0, min: 1, half: 2, full: 3 });
const lower = (a, b) => (RANK_OF[a] <= RANK_OF[b] ? a : b);
/**
 * @param {'type'|'leave'|'card'|'move'|'tab'|'read'} activity
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
    case 'read': return 'full';
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

/* ── everything else that floats over the map ────────────────────────────────────────────────── */

/* ⚠ (mobile-panels-reach) A FLOATING PANEL IS FOUND BY WHAT IT IS, NOT BY WHAT IT IS CALLED. #936 held one family
   (`#map-container > .country-popup`) above the sheet and the data credit by naming it in the stylesheet; production then
   showed the same defect in the ash panel — a panel the map holds, drawn UNDER the sheet because #map-container is a
   stacking context below it, whose «Run on the live upper-air wind» sat at y 740 under the sheet's grip. Naming the next
   panel would be the same fix again. A floater is any direct child of <body>, the map or its column that is positioned
   (fixed / absolute), drawn, takes a finger, holds a control, and is neither the sheet's own screens, the credit (the
   bound itself), a box that covers the screen (the map, a modal) nor a MODAL BOTTOM SHEET — a box shaped like the sheet
   (edge to edge, on the bottom edge) that is painted OVER the sheet, as the country card is, which replaces the sheet
   instead of floating above it. A panel the reader dragged (`data-dragged`) is where the reader put it. */
const FLOAT_GAP = 20;     /* the gap above the data credit — the same 20 px css/intmap.css `#map-container > .country-popup` keeps (#936) */
const FLOAT_FLOOR = 6;    /* the top a panel too tall for the room is held to when the page states no chrome row (o.floor) — else the row's bottom */
const FLOAT_ATTR = 'data-m-fit';   /* tokens: `cap` (max-height) · `dy` (translate) · `scroll` (overflow-y) · `out` (a lone control with no room: not drawn, not hit) — css/intmap.css reads them */
const FLOAT_CONTROL = 'button, a[href], input, select, textarea, [role="button"]';

/** the lowest y a floating panel may reach: above the sheet's current top, above the data credit, and the gap */
function floatBound(vh, cover, creditH) { return vh - cover - creditH - FLOAT_GAP; }

/** the vertical shift (px, + down) that puts a box of this top/bottom inside [floor, bound]; 0 when it already is.
    Called on a box already held to `bound - floor` tall, so the two moves cannot ask for opposite things. */
function floatShift(top, bottom, floor, bound) {
  if (bottom > bound) return bound - bottom;
  if (top < 0) return Math.min(floor - top, bound - bottom);
  return 0;
}

/**
 * @param {{hosts:HTMLElement[], sheet:HTMLElement, credit?:HTMLElement|null, active:()=>boolean,

 *   cover:()=>number, creditH:()=>number, floor?:()=>number, frame:(key:string, fn:Function)=>void}} o
 *   hosts — the elements whose DIRECT children are searched · cover/creditH/floor — the numbers js/mobile-ui.js already keeps
 *   (floor: where the top chrome ends, `--m-legend-top`; a panel held at the screen's top edge would sit under the map switcher)
 */
export function makeFloatFit(o) {
  const hosts = o.hosts.filter(Boolean), sheet = o.sheet;
  const live = new Set(), fitted = new Set(), watched = new WeakSet();
  let mo = null, ro = null, scanQ = false, fitQ = false;

  const drawn = (el, cs) => (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : cs.display !== 'none');
  /* a modal bottom sheet: sheet-shaped and painted over the sheet where they meet (the country card). Read from the
     paint order at a point they share, never from a z-index number — #map-container's children can carry 2212 and still
     be under the sheet. */
  function overlaysSheet(el, r) {
    if (r.left > 1 || r.right < innerWidth - 1 || r.bottom < innerHeight - 1) return false;
    const sr = sheet.getBoundingClientRect(), y = Math.max(r.top, sr.top) + 3;
    if (y >= Math.min(r.bottom, sr.bottom)) return false;
    for (const n of document.elementsFromPoint(r.left + r.width / 2, y)) { if (el.contains(n)) return true; if (sheet.contains(n)) return false; }
    return false;
  }
  function isFloater(el) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return false;
    if (el === sheet || el.contains(sheet) || el === o.credit || el.contains(o.credit) || el.matches('.m-sheet, .m-scrim')) return false;
    if (el.hasAttribute('data-dragged')) return false;
    /* a sheet of its own — it carries its own drag handle and its own resting heights (the route planner's .rtp-grip,
       tests/smoke.spec.js R291 ⑧): capping it to the room above the app's sheet collapsed its mid and full detents into one
       height. It places itself; holding it is its job, not this one's. */
    if (el.querySelector(':scope > [class*="grip"]')) return false;
    let cs; try { cs = getComputedStyle(el); } catch (_) { return false; }
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    /* a control this function stepped back (`out`) is hidden by this function's own token, not by its owner: it is still a
       floater, so the next fit can bring it back when the sheet comes down (its owner hiding it is `display:none`) */
    const heldOut = (el.getAttribute(FLOAT_ATTR) || '').split(' ').includes('out');
    if (heldOut ? cs.display === 'none' : (cs.pointerEvents === 'none' || !drawn(el, cs))) return false;
    const r = el.getBoundingClientRect();
    if (r.width * r.height >= 0.9 * innerWidth * innerHeight) return false;
    /* ⚠ (mobile-next) A LONE CONTROL IS A FLOATER TOO. The rule asked only for a control INSIDE the element, so a button that
       floats by itself — the object-list pill #iol-fab (js/map-tools.js, `bottom:104px` written inline) — was never found:
       measured on production f01c607 at 375 × 812, with the sheet at half it sat at y 670 across the layer screen's search
       field (input.lsr-q), and the overlap's taps went to the pill. What it is (positioned, drawn, takes a finger, IS a
       control) is what a panel is; it is held by the same bound. */
    return el.matches(FLOAT_CONTROL) || !!el.querySelector(FLOAT_CONTROL);
  }

  function unfit(el) { el.removeAttribute(FLOAT_ATTR); el.style.removeProperty('--m-fit-h'); el.style.removeProperty('--m-fit-dy'); fitted.delete(el); }
  function fitOne(el, floor) {
    /* measuring un-holds the panel for a moment, and a panel with no cap is tall enough to need no scroll — the browser clamps
       its scrollTop to 0 as it is laid out. A finger that had scrolled it was put back at the top by the next fit; so the reader's
       place is kept across the measurement and put back once the hold is re-applied. */
    const kept = [el, ...el.querySelectorAll('*')].filter((n) => n.scrollTop > 0).map((n) => [n, n.scrollTop]);   /* the panel itself, or the inner box that takes the cap */
    el.removeAttribute(FLOAT_ATTR);                      /* measure the panel as it draws itself, not as it was last held */
    let r = el.getBoundingClientRect();
    const restore = () => { for (const [n, y] of kept) if (n.scrollTop !== y) n.scrollTop = y; };
    const bound = floatBound(innerHeight, o.cover(), o.creditH());
    if (r.bottom <= bound + 0.5 && r.top >= -0.5) { fitted.delete(el); return; }
    if (overlaysSheet(el, r)) { fitted.delete(el); return; }
    const tok = [], room = bound - floor;
    if (room < 80) {                                      /* no map above the sheet to hold it in (the sheet is at full) */
      /* a panel is left as it draws itself (it is read, and the sheet at full is the reader's choice); a LONE control has
         nothing to read, and over a full sheet it can only take the finger meant for the sheet — it steps back the way the
         control group does at full (`out`), and comes back on the next fit when the sheet comes down */
      if (el.matches(FLOAT_CONTROL)) { el.setAttribute(FLOAT_ATTR, 'out'); fitted.add(el); return; }
      fitted.delete(el); return;
    }
    if (r.height > room) { el.style.setProperty('--m-fit-h', room + 'px'); tok.push('cap'); el.setAttribute(FLOAT_ATTR, 'cap'); r = el.getBoundingClientRect(); }
    const dy = floatShift(r.top, r.bottom, floor, bound);
    if (dy) { el.style.setProperty('--m-fit-dy', dy + 'px'); tok.push('dy'); }
    el.setAttribute(FLOAT_ATTR, tok.join(' '));
    /* a panel with no scroll box of its own (its inner body does not absorb the cap): what was cut off must still be reachable */
    try { if (tok.includes('cap') && el.scrollHeight > el.clientHeight + 1 && !/auto|scroll/.test(getComputedStyle(el).overflowY)) { tok.push('scroll'); el.setAttribute(FLOAT_ATTR, tok.join(' ')); } } catch (_) { }
    restore();
    fitted.add(el);
  }
  function fit() {
    fitQ = false;
    if (!o.active()) { fitted.forEach(unfit); return; }
    const floor = Math.max(FLOAT_FLOOR, (o.floor && o.floor()) || 0);
    live.forEach((el) => fitOne(el, floor));
    if (mo) mo.takeRecords();                            /* those writes are this function's own, not a change to answer */
  }
  function scan() {
    scanQ = false;
    live.clear();
    if (o.active()) for (const h of hosts) for (const el of h.children) { watch(el); if (isFloater(el)) live.add(el); }
    for (const el of Array.from(fitted)) if (!live.has(el)) unfit(el);
    fit();
  }
  function watch(el) {
    if (watched.has(el)) return; watched.add(el);
    if (mo) mo.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'data-dragged'] });
    if (ro) ro.observe(el);
  }
  const askScan = () => { if (scanQ) return; scanQ = true; o.frame('mobile.float-scan', scan); };
  const askFit = () => { if (fitQ || scanQ || !live.size && !fitted.size) return; fitQ = true; o.frame('mobile.float-fit', fit); };

  /* what this function writes is dropped by takeRecords() in fit(); every other record is news */
  if (typeof MutationObserver === 'function') { mo = new MutationObserver(askScan); hosts.forEach((h) => mo.observe(h, { childList: true })); }
  if (typeof ResizeObserver === 'function') ro = new ResizeObserver(askFit);
  hosts.forEach((h) => Array.prototype.forEach.call(h.children, watch));
  askScan();
  return { ask: askFit, scan: askScan, fitted: () => Array.from(fitted) };
}
