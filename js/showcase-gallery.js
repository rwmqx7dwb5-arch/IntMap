/* ============================================================================
 *  IntMap · THE GALLERY — the example maps and the classroom tours, inside the app   (js/showcase-gallery.js)
 * ----------------------------------------------------------------------------
 *  (showcase-gallery) The example maps (js/showcase.js) and the classroom tours (js/tours.js) could be
 *  reached only from about.html and teachers.html: the app itself had no door to them, and a first visit's
 *  only show of what IntMap can do was the automatic layer tour (js/onboarding.js). This file is the door,
 *  in two places a reader already goes — and NOTHING opens it by itself (the first-visit welcome card was
 *  withdrawn at the reader's request, #R104; a gallery that appeared unasked would be that card again):
 *    · the EMPTY state of the place search: focus the field with nothing typed and a row of cards is under
 *      it (`showInResults`) — on a phone that is the sheet, which the field has just raised;
 *    · (exploration-flows) above the examples there, «Explore» and «Pick up where you left off» — rows that
 *      press doors that already exist (the edition, the comparison, the place card, ★ Saved, the Library);
 *      see `drawStarters`;
 *    · «See all» there, any element marked `data-im-gallery`, and Atlas's `panel.gallery`, which open the
 *      whole gallery (`openGallery`): every example under its subject's heading, then the tours.
 *  A card is a picture, a title and one line, and ONE TAP opens it: an example through `openShowcase` —
 *  the share link's own restore, the path a pasted link takes (js/map-ui.js IntMapBookmark.restore) — and a
 *  tour through js/tour-player.js startTour, the classroom mode the teacher page's link opens.
 *
 *  ══ NOTHING HERE IS A LIST ═══════════════════════════════════════════════════════════════════════
 *  The cards are DERIVED (`galleryItems`): every example js/showcase.js shows that has a captured link and
 *  a thumbnail, grouped by its `topic` under js/showcase.js TOPICS, and every tour of js/tours.js with the
 *  thumbnail of its first example step. A new example or tour is in the gallery the day it is declared and
 *  captured; a withheld one is not (it would open differently from its picture).
 *
 *  ══ ONE OPENER ═══════════════════════════════════════════════════════════════════════════════════
 *  `openShowcase` is also what Atlas's `panel.showcase` runs (js/atlas-cap-panel.js), so a card and Atlas
 *  open an example the same way and read it back the same way: it is reported open only once the clock
 *  and the layer boxes say what the example declares.
 *
 *  ⚠ LOADED ON DEMAND: js/search-geocode.js imports this the first time the empty field is focused (or a
 *  `data-im-gallery` control is pressed); Atlas imports it inside its own lazy kernel. A start-up that
 *  never reaches for it downloads none of it, and the thumbnails are fetched only as their cards are drawn.
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7). No emoji: the marks are js/icons.js line icons.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { SHOWCASE, CAPTURED, TOPICS, showcaseById, showcaseLink } from './showcase.js';
import { TOURS, tourSteps } from './tours.js';
import { MapState } from './map-state.js';   /* the address bar's one door (js/map-state.js) */
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';   /* «an answer is on the map» — the phone's sheet comes down */
import * as bus from './bus.js';   /* the declared events (js/bus.js) — MAP_ANSWER_EVENT is raised through it */
import { icon } from './icons.js';
import { hostDoor } from './host-door.js';   /* (exploration-flows) the app host the starters' doors are opened with */
import { IntMapGeoEngine } from './geo-engine.js';   /* (exploration-flows) the map's centre and view — the renderer, through the contract */
import { readSeen } from './news-edition-core.js';   /* (exploration-flows) the last visit the «new since» count is asked for */
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the encoder every string below is written with */

/* the reader's language, as the app holds it (js/i18n.js) — the reading js/tour-player.js makes */
function lang() { try { return window.IntMapI18N.lang(); } catch (_) { return 'en'; } }
const t = IntMapLang.pick(() => lang());
const txt = (v) => (Array.isArray(v) ? IntMapLang.t(lang(), v[0], v[1]) : String(v == null ? '' : v));
const H = (s) => globalThis.IntMapSafe.html(s);

/* ══ WHAT IS IN IT — derived, never listed ═══════════════════════════════════════════════════════ */
/** → { sections: [{ topic, title, items }], tours: [item] }. An item is
 *  { kind: 'example'|'tour', id, title, blurb, thumb, steps? } (title / blurb are LA(en, jp) tuples). */
export function galleryItems() {
  const examples = SHOWCASE.filter((s) => { const c = CAPTURED[s.id]; return !!(c && c.thumb && showcaseLink(s.id)); })
    .map((s) => ({ kind: 'example', id: s.id, topic: s.topic, title: s.title, blurb: s.blurb, thumb: CAPTURED[s.id].thumb }));
  const sections = Object.keys(TOPICS).map((topic) => ({ topic, title: TOPICS[topic], items: examples.filter((x) => x.topic === topic) }))
    .filter((sec) => sec.items.length);
  const tours = TOURS.map((tour) => {
    const steps = tourSteps(tour);
    const first = steps.find((st) => st.example && CAPTURED[st.example] && CAPTURED[st.example].thumb);
    return first ? { kind: 'tour', id: tour.id, title: tour.title, blurb: tour.blurb, thumb: CAPTURED[first.example].thumb, steps: steps.length } : null;
  }).filter(Boolean);
  return { sections, tours };
}

/* ══ OPENING ONE ═════════════════════════════════════════════════════════════════════════════════ */
/** Put the map into an example through the share link's own restore, and read it back.
 *  → { ok, timeOk, off, reason?, example } — ok only when the clock and every declared layer say so. */
export async function openShowcase(id) {
  const s = showcaseById(id);
  if (!s) return { ok: false, reason: 'unknown-example', timeOk: false, off: [], example: null };
  const href = showcaseLink(s.id);
  if (!href) return { ok: false, reason: 'no-link', timeOk: false, off: s.layers.slice(), example: s };
  return Object.assign(await openLink(href, { at: s.at, layers: s.layers }), { example: s });
}

/** (marketing-next) THE OPENER ITSELF, for any link the app wrote: put the map into `href`'s state through the share
 *  link's own restore and read it back — the clock at `want.at` (null = «now») and every layer of `want.layers` ticked.
 *  An example and an «on this day» event (js/on-this-day.js) open through this one function, so both are reported
 *  open by the same reading. → { ok, timeOk, off, reason? } */
export async function openLink(href, want) {
  const s = { at: want && want.at != null ? want.at : null, layers: (want && want.layers) || [] };
  const BM = window.IntMapBookmark;
  if (!BM) return { ok: false, reason: 'no-map', timeOk: false, off: s.layers.slice() };
  try {
    MapState.address(null, href.slice(href.indexOf('#')));
    BM.restore({ shared: true });
    /* a link with no `tt` leaves the clock where it is (restore() sets it only when the link names one), so a
       «now» example returns the clock to now itself — the example's intent is the present */
    if (s.at == null) IntMapTime.setNow({ source: 'ui' });
  } catch (e) { return { ok: false, reason: String((e && e.message) || e), timeOk: false, off: s.layers.slice() }; }
  /* the restore applies the clock at +900 ms and the layer boxes at +700 / +1800 / +3200 ms (js/map-ui.js
     restore()); 6 s is its last pass plus room for a busy page. It returns the moment both agree — the wait is
     a bound, not a sleep — and a changed restore schedule is what invalidates the number. */
  const met = () => {
    try {
      const st = IntMapTime.state();
      const timeOk = s.at == null ? !!st.isLive : (!st.isLive && st.iso === s.at);
      const off = s.layers.filter((lid) => { const cb = /** @type {HTMLInputElement|null} */ (document.getElementById(lid)); return !(cb && cb.checked); });
      return { timeOk, off };
    } catch (_) { return { timeOk: false, off: s.layers.slice() }; }
  };
  let m = met(); const t0 = Date.now();
  while (!(m.timeOk && !m.off.length) && Date.now() - t0 < 6000) { await new Promise((r) => setTimeout(r, 250)); m = met(); }
  return { ok: m.timeOk && !m.off.length, timeOk: m.timeOk, off: m.off };
}

/** start a classroom tour at its first step (js/tour-player.js — loaded when it is reached for) */
export async function startTour(id) {
  const P = await import('./tour-player.js');
  return P.startTour(id, 1);
}

/* a card was chosen: the search is over (its list closes, the phone's keyboard goes, the sheet comes down —
   the map is the answer, MAP_ANSWER_EVENT 'card'), the gallery closes, and the one thing is opened */
function choose(kind, id) {
  try { const res = document.getElementById('ms-results'); if (showingIn(res)) { res.style.display = 'none'; res.innerHTML = ''; } } catch (_) { }
  try { const inp = document.getElementById('ms-input'); if (inp && document.activeElement === inp) inp.blur(); } catch (_) { }
  closeGallery();
  if (kind === 'tour') return startTour(id);
  try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { }
  return openShowcase(id);
}

/* ══ THE CARDS ═══════════════════════════════════════════════════════════════════════════════════ */
function cardHTML(it) {
  const badge = it.kind === 'tour'
    ? '<span class="sg-badge">' + icon('graduation', { size: 12 }) + ' ' + H(t('Tour · ' + it.steps + ' steps', 'ツアー · ' + it.steps + 'ステップ')) + '</span>' : '';
  return '<button type="button" class="sg-card" data-sg-kind="' + H(it.kind) + '" data-sg-id="' + H(it.id) + '">'
    + '<span class="sg-pic"><img src="' + globalThis.IntMapSafe.url(new URL(it.thumb, location.href).href) + '" alt="" width="480" height="252" loading="lazy" decoding="async">' + badge + '</span>'
    + '<span class="sg-t">' + H(txt(it.title)) + '</span>'
    + '<span class="sg-b">' + H(txt(it.blurb)) + '</span></button>';
}
function wireCards(root) {
  root.querySelectorAll('button.sg-card').forEach((b) => b.addEventListener('click', () => { choose(b.getAttribute('data-sg-kind'), b.getAttribute('data-sg-id')); }));
}

/* ══ THE SEARCH FIELD'S EMPTY STATE ══════════════════════════════════════════════════════════════
   Drawn into the search's own result list (#ms-results), which the field already shows and hides, and which
   on a phone fills the sheet the field has raised (css/intmap.css #m-search-slot). It is drawn only while the
   field is EMPTY and focused — js/search-geocode.js asks for it then, and the first letter typed replaces it
   with the place candidates. One row, examples then tours, scrolled sideways; «See all» opens the gallery. */
/** `onLeave` — what «See all» ends where the strip is drawn. Absent: the search's list closes (as it always did);
 *  the phone sheet's home (js/start-home.js) passes its own, so its strip stays — the shape of js/here-entry.js entryRow. */
export function showInResults(res, onLeave) {
  if (!res) return false;
  style();
  const g = galleryItems();
  const items = g.sections.flatMap((sec) => sec.items).concat(g.tours);
  if (!items.length) return false;
  /* (marketing-next) above the examples, the day's own map: js/on-this-day.js fills the slot once its index is read and
     leaves it empty when today has no event — the strip below does not wait for it */
  res.innerHTML = '<div class="otd-slot"></div><div class="sg-resume" hidden></div><div class="sg-explore"></div><div class="sg-strip" role="group" aria-label="' + H(t('Example maps and tours', '作例とツアー')) + '">'
    + '<div class="sg-strip-h"><span>' + H(t('Example maps', '作例')) + '</span>'
    + '<button type="button" class="sg-all">' + H(t('See all', 'すべて見る')) + '</button></div>'
    + '<div class="sg-row">' + items.map(cardHTML).join('') + '</div></div>';
  wireCards(res);
  import('./on-this-day.js').then((m) => m.fillSlot(res.querySelector('.otd-slot'))).catch(() => { /* no card: the strip stands alone */ });
  const all = res.querySelector('.sg-all');
  const leave = typeof onLeave === 'function' ? onLeave : () => { res.style.display = 'none'; res.innerHTML = ''; };
  if (all) all.addEventListener('click', () => { leave(); openGallery(); });
  /* (exploration-flows) the three walks and what there is to resume — drawn by `drawStarters` below, ended like «See all» */
  drawStarters(res, leave);
  res.style.display = 'block';
  return true;
}
/** the empty state is showing in this list */
const showingIn = (res) => !!(res && res.querySelector('.sg-strip'));

/* ══ (exploration-flows) «EXPLORE» AND «PICK UP WHERE YOU LEFT OFF» — EXISTING DOORS, NAMED BY WHAT THEY DO ══════════
   MEASURED: three walks the app already supports — a news event → the place's background, countries side by side at one
   year, one place through time — had no start a reader who knows no feature name could find: the edition's entry sits
   inside the News tab, the comparison inside Countries, and the place card's «through time» opens only from a point
   the reader already chose. Nothing opens unasked (the field's empty state and the phone sheet's home are both places
   the reader went to), and each row PRESSES THE DOOR THAT EXISTS — it reimplements nothing:
     · today   the command `newsedition.open` (js/news-pulse.js — the News entry's own door), with the ONE «new since
               your last visit» count (js/news-edition-core.js makeSinceCounter, asked through js/news-events.js
               API.sinceLastVisit) when that module is already here; it is not fetched for a count (#R372: nothing of
               News comes down for a reader who has not asked for News), so no module → no number;
     · compare js/stats-compare.js open() with the countries the VIEW holds, measured by the rule Atlas's chips use
               (js/atlas-view-subject.js landInView — 36 samples, the sliver rule, ordered by share). Two or more → the
               comparison is exactly those; one → it is added to what is compared (open()'s own rule for a code); none
               (open sea) → open() with nothing, which is the comparison's own default and its own picker;
     · change  the place card (js/place-dossier.js openPlaceDossier) at the map's centre: its «This place through time»
               section, a year from it, then «Compare two times here».
   «Pick up where you left off» is drawn ONLY when something real is there: the ★ events (the count the News ★ Saved chip
   says) and the account's places (js/my-places.js listPlaces). An unknown count is not 0 and not a number: a row with
   no figure, or no row. ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * exploreRows(doors, since, fmt) — the Explore rows whose door exists, in the order of the three walks.
 * @param {{today?:boolean, compare?:boolean, change?:boolean}} doors  which doors this page has
 * @param {number|null} since  events new since the last visit (null = not counted)
 * @param {(n:number)=>string} [fmt]  the reader's number format
 * @returns {{key:string, icon:string, title:string, sub:string}[]}
 */
export function exploreRows(doors, since, fmt) {
  const d = doors || {}, f = typeof fmt === 'function' ? fmt : String, out = [];
  if (d.today) out.push({ key: 'today', icon: 'news', title: t('Today\'s most-reported news, on the map', '今日もっとも報じられたニュースを地図で'),
    sub: (typeof since === 'number' && since > 0) ? t('{n} new since your last visit', '前回から新しく {n} 件').replace('{n}', f(since))
      : t('The most-reported events of the last 24 hours', '直近 24 時間に最も多く報じられた出来事') });
  if (d.compare) out.push({ key: 'compare', icon: 'chart', title: t('Compare countries in one year', 'ある年の国々を比べる'),
    sub: t('The countries in view, side by side, at the year you choose', '地図に見えている国々を、選んだ年で並べて') });
  if (d.change) out.push({ key: 'change', icon: 'clock', title: t('How has this place changed?', 'この場所はどう変わった？'),
    sub: t('The place at the centre of the map, through time', '地図の中心の場所を、時代を追って') });
  return out;
}

/**
 * resumeRows(held, fmt) — «Pick up where you left off»: a row for each thing that is really there. `held.x` is
 * { n, exact } or null; n > 0 draws the row, and the figure is shown only when `exact` (an account may hold more
 * than this device knows). [] → the group is not drawn.
 * @returns {{key:string, icon:string, title:string, count:string}[]}
 */
export function resumeRows(held, fmt) {
  const h = held || {}, f = typeof fmt === 'function' ? fmt : String, out = [];
  const has = (v) => !!(v && typeof v.n === 'number' && isFinite(v.n) && v.n > 0);
  const fig = (v) => (v.exact ? f(v.n) : '');
  if (has(h.savedEvents)) out.push({ key: 'saved', icon: 'star', title: t('Saved news events', '保存したニュースの出来事'), count: fig(h.savedEvents) });
  if (has(h.places)) out.push({ key: 'places', icon: 'pin', title: t('Your saved places', '保存した場所'), count: fig(h.places) });
  return out;
}

/**
 * savedEventsHeld(api, list, signedIn) — how many events carry a ★. The News module's own count when it is here (what
 * its ★ Saved chip says); otherwise this device's list, which is where that module starts from. Signed in, the account
 * may hold stars this device has not read yet, so the device's list then says «some», not «how many».
 * → { n, exact } | null
 */
export function savedEventsHeld(api, list, signedIn) {
  try { const st = api && typeof api.state === 'function' ? api.state() : null; if (st && isFinite(+st.savedCount)) return { n: +st.savedCount, exact: true }; } catch (_) { /* below */ }
  const n = Array.isArray(list) ? list.length : 0;
  return n > 0 ? { n, exact: !signedIn } : null;
}

/** compareInit(codes) — what js/stats-compare.js open() is handed for the countries in view: the list (≥ 2: the
    comparison is these — open() applies its own cap), the one code (added to what is compared), or nothing */
export function compareInit(codes) {
  const c = Array.isArray(codes) ? codes.filter((x) => typeof x === 'string' && x) : [];
  if (c.length >= 2) return c.slice();
  return c.length === 1 ? c[0] : undefined;
}

/* ⚠ THE DEVICE'S ★ LIST IS js/news-events.js's (its SAVE_KEY, not exported). Read here only while that module is not
   loaded — it is not fetched for a count (#R372). The key is the one thing copied; if it moves, this reads nothing
   and the row is simply not drawn until News has been opened. */
const SAVED_EVENTS_KEY = 'intmap_saved_events';
function deviceStars() { try { const a = JSON.parse(localStorage.getItem(SAVED_EVENTS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
const fmtN = (n) => { try { return Number(n).toLocaleString(IntMapLang.locale(lang())); } catch (_) { return String(n); } };

/* writes the group into `box` (the sink sees every value pass through H) and wires each row's own button — no click
   receiver on a container, so every press is a <button> the keyboard reaches */
function paintList(box, head, rows, trail, onPress) {
  const id = 'sg-h-' + head.key;
  box.innerHTML = '<div class="sg-strip-h" id="' + H(id) + '"><span>' + H(head.title) + '</span></div>'
    + '<div class="sg-list" role="group" aria-labelledby="' + H(id) + '">'
    + rows.map((r) => '<button type="button" class="sg-li" data-sg-go="' + H(r.key) + '"><span class="sg-li-i">' + icon(r.icon, { size: 18 }) + '</span>'
      + '<span class="sg-li-t"><b>' + H(r.title) + '</b>' + (r.sub ? '<small>' + H(r.sub) + '</small>' : '') + '</span>'
      + (trail(r) ? '<span class="sg-li-n">' + H(trail(r)) + '</span>' : '') + '<span class="sg-li-c" aria-hidden="true">' + icon('chevronR', { size: 14 }) + '</span></button>').join('')
    + '</div>';
  box.querySelectorAll('button.sg-li[data-sg-go]').forEach((b) => b.addEventListener('click', () => onPress(b.getAttribute('data-sg-go') || '')));
}

/* the two published doors the rows go through — the command registry (js/app-body.js) and the lazy loader (js/lazy-modules.js) */
const osDoor = () => window.IntMapOS;
const lazyDoor = () => window.IntMapLazy;
/** the doors this page has (a door that is not here is not offered) */
function doorsHere() {
  let today = false, compare = false, change = false;
  try { const OS = osDoor(); today = !!(OS && OS.has && OS.has('newsedition.open')); } catch (_) { today = false; }
  try { const LZ = lazyDoor(); compare = !!(LZ && typeof LZ.need === 'function'); } catch (_) { compare = false; }
  try { change = !!IntMapGeoEngine.hasRenderer(); } catch (_) { change = false; }
  return { today, compare, change };
}

function drawExplore(box, since, onPress) {
  const rows = exploreRows(doorsHere(), since, fmtN);
  if (!rows.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  paintList(box, { key: 'explore', title: t('Explore', '探索') }, rows, () => '', onPress);
}
function drawResume(box, held, onPress) {
  const rows = resumeRows(held, fmtN);
  if (!rows.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  paintList(box, { key: 'resume', title: t('Pick up where you left off', '前回の続きから') }, rows, (r) => r.count, onPress);
}

/* the countries the view holds — the measurement Atlas's chips make (js/atlas-view-subject.js), over the country polygons
   the app holds (HOST.countryGeo, loaded by the Countries tab's own loader when it has not been yet) */
async function countriesInView(HOST) {
  try { if (typeof HOST.loadCountryData === 'function') await HOST.loadCountryData(); } catch (_) { /* no polygons: no codes */ }
  try {
    const { makeAtlasViewSubject } = await import('./atlas-view-subject.js');
    const V = makeAtlasViewSubject({ GE: () => IntMapGeoEngine, geo: () => HOST.countryGeo, countryStats: HOST.countryStats, cName: HOST.cName });
    /* THE COUNTRIES WHOSE LABEL POINT IS ON SCREEN (countryStats.latlng — where the map writes the country's name), nearest
       the centre first, ten kept (the comparison's limit). ⚠ Not Atlas's «subject of the view» (landInView: a sliver is not a
       subject): measured 2026-11-18 over central Europe, a sampling grid wide enough for the whole view gave Germany, Belgium,
       Switzerland one sample or none, and the list was Russia, Iran, Algeria… The view box is the module's own (viewBox —
       on the globe, the screen taken back to the ground). */
    const box = V.viewBox(); if (!box) return [];
    const stats = HOST.countryStats || {};
    const inBox = (ll) => ll && isFinite(ll[0]) && isFinite(ll[1]) && ll[0] >= box.s && ll[0] <= box.n && ll[1] >= box.w && ll[1] <= box.e;
    const codes = Object.keys(stats).filter((cd) => stats[cd] && stats[cd].sov !== false && inBox(stats[cd].latlng));
    return nearestFirst(codes, box, stats).slice(0, 10);
  } catch (_) { return []; }
}

/** the codes ordered by the great-circle-free planar distance of each country's label point to the view's centre (a code with
    no label point keeps its place after the others) — exported for the check */
export function nearestFirst(codes, box, stats) {
  const c = box && isFinite(box.lng) && isFinite(box.lat) ? box : null;
  if (!c) return codes.slice();
  const d = (cd) => { const ll = stats && stats[cd] && stats[cd].latlng; if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return Infinity;
    const dx = (ll[1] - c.lng) * Math.cos(c.lat * Math.PI / 180), dy = ll[0] - c.lat; return dx * dx + dy * dy; };
  return codes.map((cd, i) => ({ cd, i, k: d(cd) })).sort((a, b) => (a.k - b.k) || (a.i - b.i)).map((x) => x.cd);
}

/** a row was pressed: the place's ending (the search closes its list; the home keeps itself), then the door */
async function go(key, leave) {
  const HOST = hostDoor.host;
  try { leave(); } catch (_) { /* the place's own ending */ }
  try { const inp = document.getElementById('ms-input'); if (inp && document.activeElement === inp) inp.blur(); } catch (_) { }
  if (key === 'today') {
    /* the edition is an answer on the map — the phone's sheet comes down onto it, as an example card's does */
    try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { }
    try { return await osDoor().exec('newsedition.open', { source: 'ui', params: {} }); } catch (_) { return null; }
  }
  if (!HOST) return null;
  if (key === 'compare') {
    try { await lazyDoor().need('statsCompare'); } catch (_) { return null; }
    const codes = await countriesInView(HOST);
    const C = window.IntMapStatsCompare;
    if (C && C.open) C.open(compareInit(codes));
    return C && C.state ? C.state() : null;
  }
  if (key === 'change') {
    let c = null; try { c = IntMapGeoEngine.camera.getCenter(); } catch (_) { c = null; }
    if (!c || !isFinite(c.lng) || !isFinite(c.lat)) return null;
    return import('./place-dossier.js').then((m) => m.openPlaceDossier(HOST, { lng: c.lng, lat: c.lat })).catch(() => null);
  }
  if (key === 'saved') { try { HOST.setMode('saved', 'btn-news'); } catch (_) { } return null; }   /* the ★ Saved scope chip's own call (js/session-tabs.js) */
  if (key === 'places') return import('./my-places.js').then((M) => M.openMyPlaces(HOST)).catch(() => null);
  return null;
}

/** the two groups into the empty state `res`, above the example strip; `leave` is what a press ends there */
function drawStarters(res, leave) {
  const ex = /** @type {HTMLElement|null} */ (res.querySelector('.sg-explore'));
  const rs = /** @type {HTMLElement|null} */ (res.querySelector('.sg-resume'));
  if (!ex || !rs) return;
  const press = (key) => { go(key, leave); };
  drawExplore(ex, null, press);
  /* the «new since» figure — only while the clock is at now (the mark is «the news read up to then») and only from the
     News module already here */
  let live = true; try { live = IntMapTime.isLive(); } catch (_) { live = true; }
  let seen = null; try { seen = readSeen(window.localStorage); } catch (_) { seen = null; }
  const NE = window.IntMapNewsEvents;
  if (live && seen != null && NE && typeof NE.sinceLastVisit === 'function') {
    Promise.resolve(NE.sinceLastVisit(seen)).then((n) => { if (ex.isConnected && typeof n === 'number') drawExplore(ex, n, press); }, () => { });
  }
  const HOST = hostDoor.host, signedIn = !!(HOST && HOST.user);
  const held = { savedEvents: savedEventsHeld(NE, deviceStars(), signedIn), places: null };
  drawResume(rs, held, press);
  if (signedIn && HOST.DB) {
    import('./my-places.js').then((M) => M.listPlaces(HOST.DB)).then((r) => {
      if (!rs.isConnected || !r || !r.ok) return;
      held.places = { n: (r.places || []).length, exact: true }; drawResume(rs, held, press);
    }).catch(() => { /* not read: no row */ });
  }
}

/* ══ THE WHOLE GALLERY ═══════════════════════════════════════════════════════════════════════════
   A dialog of the app's one contract (js/dialog.js IntMapDialog.open — a name, Esc, the Tab trap, focus
   returned), centred on a large screen and a sheet from the foot on a phone. */
let dlg = null;
function closeGallery() { if (dlg) { const h = dlg; dlg = null; try { h.close('api'); } catch (_) { } } const el = document.getElementById('im-gallery'); if (el) el.remove(); }
/** open the gallery; `section: 'tours'` scrolls to the tours. → { ok, examples, tours } */
export function openGallery(opts) {
  style(); closeGallery();
  const g = galleryItems();
  const n = g.sections.reduce((a, sec) => a + sec.items.length, 0);
  const box = document.createElement('div'); box.id = 'im-gallery';
  box.innerHTML = '<div class="sg-scrim" aria-hidden="true"></div>'
    + '<div class="sg-box"><div class="sg-head"><h2 id="sg-title">' + H(t('Example maps', '作例')) + '</h2>'
    + '<button type="button" class="sg-x" aria-label="' + H(t('Close', '閉じる')) + '">' + icon('close', { size: 18 }) + '</button></div>'
    + '<p class="sg-sub">' + H(t('Each picture is a screenshot of IntMap. One tap opens the same view, date and layers.', '写真はすべて IntMap の画面です。タップすると、同じ視点・日付・レイヤーで地図が開きます。')) + '</p>'
    + g.sections.map((sec) => '<section class="sg-sec" data-sg-topic="' + H(sec.topic) + '"><h3>' + H(txt(sec.title)) + '</h3><div class="sg-grid">' + sec.items.map(cardHTML).join('') + '</div></section>').join('')
    + (g.tours.length ? '<section class="sg-sec" id="sg-tours" data-sg-topic="tours"><h3>' + H(t('Classroom tours', '授業ツアー')) + '</h3>'
      + '<p class="sg-sub">' + H(t('A lesson as a sequence of maps, full screen for a projector, with words to read out and a question for the class.', '地図を順にたどる授業の進行表。プロジェクター向けの全画面で、読み上げる文と生徒への問いが付きます。')) + '</p>'
      + '<div class="sg-grid">' + g.tours.map(cardHTML).join('') + '</div></section>' : '')
    /* (community-maps) after IntMap's own examples, the maps readers made and listed for everyone (js/community-maps.js) */
    + '<section class="sg-sec" id="sg-community" data-sg-topic="community"><h3>' + H(t('Community maps', 'みんなの地図')) + '</h3>'
    + '<p class="sg-sub">' + H(t('Collections of places, maps and tours that readers made and listed for everyone — open one, or keep a copy and build on it.', '読者が作り、みんなに向けて掲載した場所・地図・ツアーのコレクション。開いて見ることも、保存して自分の地図の元にすることもできます。')) + '</p>'
    + '<button type="button" class="sg-all" id="sg-community-open" data-effect="none">' + H(t('Browse Community maps', 'みんなの地図を見る')) + '</button></section>'
    + '</div>';
  wireCards(box);
  /* the sheet needs the app host (the database client, the reader's language and account) — js/auth-ui.js holds it */
  box.querySelector('#sg-community-open').addEventListener('click', () => { if (dlg) dlg.close('button'); else { try { box.remove(); } catch (_) { } } bus.emit('intmap-open-community'); });
  const panel = /** @type {HTMLElement} */ (box.querySelector('.sg-box'));
  const close = () => { dlg = null; try { box.remove(); } catch (_) { } };
  box.querySelector('.sg-x').addEventListener('click', () => { if (dlg) dlg.close('button'); else close(); });
  const D = window.IntMapDialog;
  if (D && D.open) dlg = D.open(box, { panel, labelledby: 'sg-title', backdrop: box.querySelector('.sg-scrim'), close });
  else {
    document.body.appendChild(box);
    box.querySelector('.sg-scrim').addEventListener('click', close);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  }
  try {
    if (opts && opts.section === 'tours') { const tt = box.querySelector('#sg-tours'); if (tt) tt.scrollIntoView({ block: 'start' }); }
    /** @type {HTMLElement} */ (box.querySelector('.sg-card')).focus({ preventScroll: !!(opts && opts.section) });
  } catch (_) { }
  return { ok: !!box.isConnected, examples: n, tours: g.tours.length };
}

/* ══ THE LOOK — iOS-like cards on the app's own variables (css/intmap.css), injected when first drawn ══ */
let styled = false;
function style() {
  if (styled) return; styled = true;
  const st = document.createElement('style'); st.id = 'im-gallery-css'; st.textContent = GALLERY_CSS; document.head.appendChild(st);
}
const GALLERY_CSS = [
  /* the card, shared by the strip and the gallery */
  '.sg-card{display:flex;flex-direction:column;gap:3px;min-width:0;padding:0 0 10px;border:1px solid rgba(128,128,128,0.18);border-radius:14px;overflow:hidden;background:var(--input-bg);color:var(--text-main);font:inherit;text-align:left;cursor:pointer;transition:transform .12s ease,border-color .12s ease;}',
  '.sg-card:hover{border-color:var(--primary-color);}',
  '.sg-card:active{transform:scale(0.98);}',
  '.sg-card:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
  '.sg-pic{position:relative;display:block;aspect-ratio:480/252;background:rgba(128,128,128,0.12);}',
  '.sg-pic img{display:block;width:100%;height:100%;object-fit:cover;}',
  '.sg-badge{position:absolute;left:8px;bottom:8px;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,0.62);color:#fff;font-size:11px;font-weight:600;line-height:1.3;}',
  '.sg-t{display:block;padding:6px 10px 0;font-size:13.5px;font-weight:600;line-height:1.3;}',
  '.sg-b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding:0 10px;font-size:12px;line-height:1.35;color:var(--text-muted);}',
  /* the empty state of the search */
  '.sg-strip{padding:10px 10px 12px;}',
  '.sg-strip-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 8px;font-size:12px;font-weight:600;color:var(--text-muted);letter-spacing:0.01em;}',
  '.sg-all{min-height:32px;padding:0 10px;border:none;border-radius:999px;background:transparent;color:var(--primary-color);font:inherit;font-weight:600;cursor:pointer;}',
  '.sg-row{display:flex;gap:10px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding-bottom:4px;-webkit-overflow-scrolling:touch;}',
  '.sg-row .sg-card{flex:0 0 172px;scroll-snap-align:start;}',
  /* (exploration-flows) «Pick up where you left off» and «Explore» — an iOS inset grouped list, one hairline between rows */
  '.sg-explore,.sg-resume{padding:10px 10px 2px;}',
  '.sg-explore[hidden],.sg-resume[hidden]{display:none;}',
  '.sg-list{display:flex;flex-direction:column;border:1px solid rgba(128,128,128,0.18);border-radius:14px;background:var(--input-bg);overflow:hidden;}',
  '.sg-li{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:8px 10px 8px 12px;border:none;background:transparent;color:var(--text-main);font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
  '.sg-li + .sg-li{border-top:1px solid rgba(128,128,128,0.14);}',
  '.sg-li:hover{background:rgba(128,128,128,0.06);}',
  '.sg-li:active{background:rgba(128,128,128,0.12);}',
  '.sg-li:focus-visible{outline:2px solid var(--primary-color);outline-offset:-2px;}',
  '.sg-li-i{flex:0 0 auto;display:inline-flex;color:var(--primary-color);}',
  '.sg-li-t{flex:1 1 auto;min-width:0;}',
  '.sg-li-t b{display:block;font-size:13.5px;font-weight:600;line-height:1.25;}',
  '.sg-li-t small{display:block;margin-top:2px;font-size:11.5px;line-height:1.3;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.sg-li-n{flex:0 0 auto;font-size:13px;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
  '.sg-li-c{flex:0 0 auto;display:inline-flex;color:var(--text-muted);opacity:0.7;}',
  /* the whole gallery */
  '#im-gallery{position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;}',
  '#im-gallery .sg-scrim{position:absolute;inset:0;background:rgba(0,0,0,0.35);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}',
  '#im-gallery .sg-box{position:relative;width:min(980px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:20px 22px 24px;border-radius:22px;background:var(--card-bg);color:var(--text-main);box-shadow:var(--shadow);}',
  '#im-gallery .sg-head{position:sticky;top:-20px;z-index:calc(var(--z-inset) + 1);display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-20px -22px 0;padding:16px 22px 8px;background:var(--card-bg);}',
  '#im-gallery h2{margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em;}',
  '#im-gallery .sg-x{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:none;border-radius:50%;background:var(--input-bg);color:var(--text-main);cursor:pointer;}',
  '#im-gallery .sg-sub{margin:4px 0 14px;font-size:13px;color:var(--text-muted);}',
  '#im-gallery .sg-sec{margin-top:18px;}',
  '#im-gallery .sg-sec h3{margin:0 0 10px;font-size:16px;font-weight:700;}',
  '#im-gallery .sg-sec .sg-sub{margin-top:-4px;}',
  '#im-gallery .sg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;}',
  /* a phone: a sheet from the foot of the screen, two cards to a row */
  '@media (max-width:640px){'
    + '#im-gallery{align-items:flex-end;}'
    + '#im-gallery .sg-box{width:100vw;max-height:92dvh;border-radius:20px 20px 0 0;padding:18px 14px calc(18px + var(--safe-bottom));}'
    + '#im-gallery .sg-head{margin:-18px -14px 0;padding:14px 14px 8px;top:-18px;}'
    + '#im-gallery .sg-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}'
    + '.sg-row .sg-card{flex-basis:150px;}'
    + '}',
  '@media (prefers-reduced-motion:reduce){.sg-card{transition:none;}.sg-card:active{transform:none;}}',
].join('\n');
