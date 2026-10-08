/* ============================================================================
 *  IntMap · THE THUMB ON THE CLOCK — move through time with the map in full view   (mobile-product)
 * ----------------------------------------------------------------------------
 *  On a phone the clock is the button at the right of the sheet's head (#m-clock). Pressed, it opens Chronos, which
 *  takes the sheet to `half` and covers the lower half of the globe. Dragged SIDEWAYS, it is now a rail of its own:
 *  the map stays in full view, the year moves under the thumb, and above the sheet a bubble says the instant and what
 *  the map states over the point at its centre at that instant — who held it (the polities of the era layer's own
 *  records) and the first-level unit — with a small ring on that centre. The thumb STOPS at the instants where that
 *  statement changes (a polity begins or ends there, is drawn under a new name, a unit begins or ends), and the phone
 *  ticks where it can (navigator.vibrate). The arrow keys on the same button step from one such instant to the next.
 *
 *  ══ NOTHING IS DECIDED HERE ═══════════════════════════════════════════════════════════════════════════════════════
 *    · rail position → year → write on the clock: js/chronos.js `writeRailPos` (the same rule the Chronos Year slider
 *      and its desktop peek use) over js/hist-scale.js `rail`;
 *    · who held the point, the instants it changes, the words for an edge: js/place-history.js (`placeHistory`,
 *      `changesOf`, `nowAt`, `changeText`) — the place card's «This place through time» and Atlas's `time.placeHistory`
 *      and `time.stepHere` read the same record;
 *    · the instant shown is the clock's own (`IntMapTime.when()` after the write), so the bubble names what the map
 *      draws, not what this file meant to write.
 *  ⚠ A RECORD THAT COULD NOT BE READ IS SAID (`unavailable`), the open sea is «no record draws a polity here», and a
 *    span no record covers is said as such — never left blank as if the ground had no history.
 *  Fetched at the first touch of the clock (js/mobile-ui.js); nothing here runs at start-up. Strings IntMap writes here
 *  are en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapTime, writeRailPos, histScale } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';

const HS = () => histScale();

/* ⚠ RAIL_SCREENS — how many screen widths the whole rail spans under the thumb. ESTIMATE, not measured on a device:
   at 3 a 390 px phone gives the recent band (1850–now, 45 % of the rail) about 530 px, ~3 px a year, and the whole
   of AD 1–1500 about 260 px; the Chronos slider fits the same rail into ~340 px. EXPIRES IF the rail's shares
   (js/hist-scale.js `breaks`) change or a device test finds one year too hard to hold — retune on a phone. */
export const RAIL_SCREENS = 3;
/* ⚠ SNAP_PX — where years are narrower than a pixel (`stopAt` below), how close (in thumb pixels) the thumb must come to
   an instant where the map changes for the thumb to stop on it. ESTIMATE: about a quarter of a 44 px finger, so a slow
   stroke stops and a fast one passes. Same expiry. */
export const SNAP_PX = 12;
/* ⚠ START_PX — the sideways travel that makes a press a scrub. The sheet's head starts its own drag at 7 px of mostly
   VERTICAL travel (js/mobile-ui.js `grabbable`); a scrub is mostly horizontal, so the two never claim one stroke. */
export const START_PX = 8;
/* how long the bubble stays after the thumb lifts (or after a key step) — long enough to read two short lines */
const LINGER_MS = 1600;

let S = null;           /* the stroke in progress */
let bound = null;       /* the clock the listeners are on */
let H = null;           /* the HOST (language) */
let hideT = 0, rafW = 0, pendingW = null;
const cache = new Map();   /* the record per centre — the same centre asked twice reads once */

const lang = () => { try { return (H && H.lang) || 'en'; } catch (_) { return 'en'; } };
const L = (en, jp) => IntMapLang.t(lang(), en, jp);
const tag = () => { try { return IntMapLang.htmlTag(lang()) || 'en'; } catch (_) { return 'en'; } };
const POS = () => { try { const v = +HS().rail.POS; return v > 0 ? v : 1000; } catch (_) { return 1000; } };
const curY = () => new Date().getFullYear();
const toPos = (y) => { try { return HS().rail.toPos(y, IntMapTime.min, curY()); } catch (_) { return 0; } };
const clampPos = (p) => Math.max(0, Math.min(POS(), p));
const perPx = () => POS() / (RAIL_SCREENS * Math.max(1, window.innerWidth || 390));

/* ── the record at the map's centre (js/place-history.js, fetched with the first stroke that needs it) ── */
let PH = null;
/* the names are taken by name, so each one this file reads is a reader the module graph sees (scripts/export-readers.mjs) */
const ph = () => (PH ? Promise.resolve(PH) : import('./place-history.js').then(({ placeHistory, changesOf, nowAt, changeText, instantText, stepFrom, goToInstant, kOf }) =>
  (PH = { placeHistory, changesOf, nowAt, changeText, instantText, stepFrom, goToInstant, kOf })));
function centre() {
  try { const c = IntMapGeoEngine.camera.getCenter(); if (c && isFinite(c.lng) && isFinite(c.lat)) return { lng: +c.lng, lat: +c.lat }; } catch (_) { /* no renderer */ }
  return null;
}
function recordAt(pt) {
  const key = pt.lng.toFixed(4) + ',' + pt.lat.toFixed(4);
  if (!cache.has(key)) cache.set(key, ph().then((m) => m.placeHistory(pt)).then((rec) => ({ rec, changes: PH.changesOf(rec) }),
    (e) => ({ rec: { at: pt, nation: { status: 'unavailable', reason: String((e && e.message) || e || 'failed'), entries: [], gaps: [], records: [], missing: [] }, admin: { status: 'unavailable', entries: [] } }, changes: [] })));
  return cache.get(key);
}

/* ── the bubble and the centre ring ── */
const CSS = [
  '.tt-bubble{position:fixed;left:50%;z-index:var(--z-m-chrome,1150);transform:translate(-50%,6px);opacity:0;pointer-events:none;max-width:min(88vw,360px);',
  '  padding:10px 16px 11px;border-radius:18px;background:var(--panel-bg,rgba(255,255,255,0.86));color:var(--text-main,#111);',
  '  -webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);box-shadow:0 8px 28px rgba(0,0,0,0.22);',
  '  text-align:center;transition:opacity .18s ease,transform .18s ease;}',
  '.tt-bubble.on{opacity:1;transform:translate(-50%,0);}',
  '.tt-when{white-space:nowrap;font-size:26px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1.15;}',
  '.tt-where{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#666);margin-top:4px;}',
  '.tt-who{font-size:15px;font-weight:600;line-height:1.3;margin-top:1px;overflow-wrap:anywhere;}',
  '.tt-who.quiet,.tt-unit{color:var(--text-muted,#666);}',
  '.tt-unit{font-size:12.5px;line-height:1.3;margin-top:1px;overflow-wrap:anywhere;}',
  '.tt-stop{font-size:11.5px;line-height:1.3;margin-top:5px;color:var(--primary-color,#0a64d8);overflow-wrap:anywhere;}',
  '.tt-ring{position:fixed;z-index:var(--z-m-chrome,1150);box-sizing:border-box;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;pointer-events:none;',
  '  border:2.5px solid var(--primary-fill,#0a64d8);box-shadow:0 0 0 2px rgba(255,255,255,0.85),0 1px 6px rgba(0,0,0,0.3);opacity:0;transition:opacity .18s ease;}',
  '.tt-ring.on{opacity:1;}',
  '@media (prefers-reduced-motion:reduce){.tt-bubble,.tt-ring{transition:none;}}',
].join('\n');
let bubble = null, ring = null, live = null;
function ensureDom() {
  if (bubble) return;
  if (!document.getElementById('im-time-thumb-css')) { const st = document.createElement('style'); st.id = 'im-time-thumb-css'; st.textContent = CSS; document.head.appendChild(st); }
  bubble = document.createElement('div'); bubble.className = 'tt-bubble'; bubble.id = 'tt-bubble'; bubble.setAttribute('aria-hidden', 'true');
  bubble.setAttribute('data-prints-map-time', '');   /* it names the map's instant (js/quest-panel.js hides what says so) */
  ring = document.createElement('div'); ring.className = 'tt-ring'; ring.id = 'tt-ring'; ring.setAttribute('aria-hidden', 'true');
  /* the screen reader hears the settled instant once, not every frame of the stroke */
  live = document.createElement('div'); live.className = 'sr-only'; live.id = 'tt-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  live.setAttribute('data-prints-map-time', '');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
  document.body.append(bubble, ring, live);
}
function place() {
  /* above the sheet's top, wherever the sheet stands */
  const sb = document.getElementById('sidebar'), top = sb ? sb.getBoundingClientRect().top : window.innerHeight;
  bubble.style.bottom = Math.max(12, Math.round(window.innerHeight - top + 14)) + 'px';
  const c = S && S.pt;
  let shown = false;
  if (c) {
    try {
      const p = IntMapGeoEngine.coords.project([c.lng, c.lat]), mc = document.getElementById('map-container'), r = mc ? mc.getBoundingClientRect() : { left: 0, top: 0 };
      if (p && isFinite(p.x) && isFinite(p.y)) { ring.style.left = Math.round(r.left + p.x) + 'px'; ring.style.top = Math.round(r.top + p.y) + 'px'; shown = true; }
    } catch (_) { /* no renderer: no ring */ }
  }
  ring.classList.toggle('on', shown);
}
function show() { clearTimeout(hideT); ensureDom(); place(); bubble.classList.add('on'); }
function linger() { clearTimeout(hideT); hideT = setTimeout(() => { if (S && S.on) return; if (bubble) bubble.classList.remove('on'); if (ring) ring.classList.remove('on'); }, LINGER_MS); }

/* what the bubble says for the clock's instant now — its time, then what the map states over the centre then */
function paint(stop) {
  if (!bubble) return;
  const e = IntMapTime.state(), k = PH ? PH.kOf(e.when) : null;
  const yT = (y) => { try { return HS().yearText(y, tag(), lang() === 'jp' ? '年' : null); } catch (_) { return String(y); } };
  const when = e.isLive ? L('Now', '現在') : stop && PH ? PH.instantText(stop.k, stop.tier, lang()) : yT(e.year);
  const R = S && S.data;
  const rows = [['tt-when', when]];
  if (!R) rows.push(['tt-where', L('Map centre', '地図の中心')], ['tt-who quiet', L('Reading the historical records…', '歴史の記録を読み込み中…')]);
  else if (e.isLive) rows.push(['tt-where', L('Map centre', '地図の中心')], ['tt-who quiet', L('The map of today', '今日の地図')]);
  else {
    const now = PH.nowAt(R.rec, k, lang());
    rows.push(['tt-where', L('Map centre', '地図の中心')]);
    if (now.status === 'unavailable') rows.push(['tt-who quiet', L('The historical border records could not be read', '歴史国境の記録を読み込めませんでした')]);
    else if (now.status === 'none') rows.push(['tt-who quiet', L('No historical record draws a polity here', 'この地点に政体を描く歴史の記録はありません')]);
    else if (now.gap) rows.push(['tt-who quiet', L('No record draws a polity here at this time', 'この時期、ここに政体を描く記録はない')]);
    else for (const p of now.polities.slice(0, 2)) rows.push([p.quiet ? 'tt-who quiet' : 'tt-who', p.text]);
    if (now.units.length) rows.push(['tt-unit', now.units.slice(0, 2).join(' · ')]);
    if (stop) rows.push(['tt-stop', PH.changeText(stop.c, lang(), R.rec.nation && R.rec.nation.records)]);
  }
  bubble.replaceChildren(...rows.map(([cls, t]) => { const d = document.createElement('div'); d.className = cls; d.textContent = t; return d; }));
  return rows.map((r) => r[1]).join('. ');
}

/* ── one write per frame: a stroke keeps only its latest position ── */
function queue(w) {
  pendingW = w; if (rafW) return;
  rafW = requestAnimationFrame(() => { rafW = 0; const q = pendingW; pendingW = null; if (!q) return;
    try { if (q.stop) PH.goToInstant(q.stop.k, 'ui'); else writeRailPos(q.pos); } catch (_) { /* the clock refused it; the bubble says what it shows */ }
    paint(q.stop); });
}
function tick() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) { /* no haptics here */ } }

/* the instants where the map changes over the centre, as rail positions — the thumb's stops. `yearPx` is how wide one
   year is under the thumb there: the rail is not linear (js/hist-scale.js `rail`), so the same 12 px is a few years
   in the 20th century and millennia below year 1. */
export function stopsOf(changes, pxPerPos) {
  const per = pxPerPos || (1 / perPx());
  return changes.map((c) => {
    const y = Math.floor(c.k / 10000);
    const tier = (c.begins[0] && c.begins[0].from.tier) || (c.ends[0] && c.ends[0].to.tier) || 'ohm';
    const p = toPos(y);
    return { c, k: c.k, y, tier, p, yearPx: Math.abs(toPos(y + 1) - p) * per };
  });
}
/* ⚠ A STOP MUST NOT TAKE A YEAR THE THUMB COULD OTHERWISE NAME. Where a year is at least a pixel wide the thumb can
   land on every year, so it stops on a change only inside that change's own year (and then on its day, not mid-June);
   where years are narrower than a pixel the thumb cannot name one year anyway, and it stops within SNAP_PX of a change.
   Computed for the first version (one 12 px radius everywhere, a 375 px phone): 12 px is ±4 years in 1850–now, and at
   Kyoto the nine changes from 1868 to 1886 would have left no year from 1864 to 1890 reachable by the thumb. */
export function stopAt(stops, pos, per) {
  if (!stops || !stops.length) return null;
  let y = null; try { y = HS().rail.toYear(pos, IntMapTime.min, curY()); } catch (_) { y = null; }
  const own = stops.find((s) => s.yearPx >= 1 && s.y === y);
  if (own) return own;
  const r = SNAP_PX * per;
  let best = null;
  for (const s of stops) { if (s.yearPx >= 1) continue; const d = Math.abs(s.p - pos); if (d <= r && (!best || d < best.d)) best = { s, d }; }
  return best ? best.s : null;
}
function nearestStop(pos) { return S && S.stops ? stopAt(S.stops, pos, perPx()) : null; }

function begin(ev) {
  const e = IntMapTime.state();
  S.on = true; S.pos0 = e.isLive ? POS() : toPos(e.year); S.pos = S.pos0;
  /* a touch is captured by its target already; asking again would drop and retake it (a lostpointercapture mid-stroke) */
  try { if (!bound.hasPointerCapture(S.id)) bound.setPointerCapture(S.id); } catch (_) { /* capture is a nicety */ }
  bound.classList.add('scrub');
  S.pt = centre();
  show(); paint(null);
  if (S.pt) {
    const mine = S;
    /* the record arrives while the thumb is already down: the position it holds is judged again against the stops, so a
       thumb resting near a change lands on it without having to move again */
    recordAt(S.pt).then((d) => { if (S !== mine) return; S.data = d; S.stops = stopsOf(d.changes);
      if (!S.on) { paint(S.stop || null); return; }
      const stop = nearestStop(S.pos); if (stop) tick(); S.stop = stop; queue(stop ? { stop } : { pos: S.pos }); });
  }
}
function onMove(ev) {
  if (!S || ev.pointerId !== S.id) return;
  if (!S.on) {
    const dx = ev.clientX - S.x0, dy = ev.clientY - S.y0;
    if (Math.abs(dx) < START_PX || Math.abs(dx) <= Math.abs(dy)) return;
    begin(ev);
  }
  ev.stopPropagation(); ev.preventDefault();
  const pos = clampPos(S.pos0 + (ev.clientX - S.x0) * perPx());
  S.pos = pos;
  const stop = nearestStop(pos);
  if (stop && (!S.stop || S.stop.k !== stop.k)) tick();
  S.stop = stop;
  queue(stop ? { stop } : { pos });
}
function onUp(ev) {
  if (!S || ev.pointerId !== S.id) return;
  const was = S; S = null;
  if (!was.on) return;          /* a tap: the button's click opens Chronos */
  bound.classList.remove('scrub');
  /* the click that ends a stroke is not a press on the button */
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
  window.addEventListener('click', swallow, true); setTimeout(() => window.removeEventListener('click', swallow, true), 60);
  /* the last paint reads the stroke's record once more (after the frame's write has landed); a new press in between
     owns `S` and is left alone */
  was.on = false; S = was;
  requestAnimationFrame(() => { const said = paint(was.stop || null); if (live && said) live.textContent = said; if (S === was) S = null; linger(); });
}
function install(clock) {
  if (bound === clock) return;
  bound = clock;
  /* for the browser checks: the rail's span under the thumb, on the element itself (no window global) — with js/hist-scale.js
     `rail.POS` and the screen width it gives how far the rail moves per thumb pixel; it also says the thumb is installed */
  clock.dataset.railScreens = String(RAIL_SCREENS);
  clock.addEventListener('pointermove', onMove);
  clock.addEventListener('pointerup', onUp);
  clock.addEventListener('pointercancel', onUp);
  /* ⚠ NOT lostpointercapture: measured with a CDP finger, Chromium fires it when the implicit touch capture is handed to an
     explicit one, which ended every stroke at its first move. The stroke ends on pointerup / pointercancel. */
}

/** press(clock, first, HOST) — js/mobile-ui.js hands over a press on the clock: `first` is the pointerdown as it was
    ({id, x, y, up}). `up` is set when the finger lifted before this module arrived — that press was a tap. */
export function press(clock, first, host) {
  H = host || H;
  install(clock);
  if (!first || first.up) return;
  S = { id: first.id, x0: first.x, y0: first.y, on: false, pos0: 0, pos: 0, pt: null, data: null, stops: null, stop: null };
}

/** step(clock, dir, HOST) → the change it moved to (or null): the arrow keys on the clock, one instant where the map
    changes over its centre at a time (the same instants the thumb stops at). */
export async function step(clock, dir, host) {
  H = host || H;
  install(clock);
  const pt = centre();
  ensureDom();
  S = { id: -1, on: false, pt, data: null, stops: null, stop: null };
  const mine = S;
  show(); paint(null);
  if (!pt) { linger(); return null; }
  await ph();
  const d = await recordAt(pt);
  if (S !== mine) return null;
  S.data = d;
  const k = PH.kOf(IntMapTime.when());
  const c = PH.stepFrom(d.changes, k, dir < 0 ? -1 : 1);
  let said = '';
  if (c) {
    PH.goToInstant(c.k, 'ui');
    const stop = stopsOf([c])[0];
    said = paint(stop);
  } else {
    said = paint(null);
    const n = document.createElement('div'); n.className = 'tt-stop';
    n.textContent = dir < 0 ? L('No earlier change is recorded at the centre', '中心でこれより前の変化は記録されていません') : L('No later change is recorded at the centre', '中心でこれより後の変化は記録されていません');
    bubble.appendChild(n); said += '. ' + n.textContent;
  }
  if (live) live.textContent = said;
  S = null; linger();
  return c;
}


