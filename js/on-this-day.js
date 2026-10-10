/* ============================================================================
 *  IntMap · ON THIS DAY — the dated events of one calendar day, every year the records cover   (js/on-this-day.js)
 * ----------------------------------------------------------------------------
 *  (marketing-next) A historical map has something new to say every day of the year, and IntMap already held
 *  every one of those days: the border record the map draws (CShapes 2.0) dates the day each polity appears, ends
 *  or is redrawn, and the war record (data/wars.json) dates its events. data/on-this-day.json is that, indexed by
 *  calendar day (scripts/build-on-this-day.mjs computes it with the map's own code and says what it leaves out and
 *  why). That file is THE index of dated events (js/time-index.js holds its records and cuts it); this file is the
 *  reader of its CALENDAR cut, for every door:
 *    · the place search's EMPTY state — a card above the example maps: today's headline, one tap opens it on the
 *      map (js/showcase-gallery.js asks for it);
 *    · the SHEET (`openOnThisDay`) — every event of a day, day by day with ‹ ›, each opening the map on its date,
 *      its place and (for a war) its layer;
 *    · Atlas — `time.onThisDay` (js/atlas-cap-time.js) reads the same events and opens the same links;
 *    · the generated day pages, their pictures and the post drafts (scripts/on-this-day-pages.mjs) — the pure half
 *      below is imported by Node, so a page and the app cannot describe a day differently.
 *
 *  ⚠ IT SAYS WHAT A RECORD SAYS (.agents/rules/historical-verification.md). A border event is «the map begins /
 *  stops drawing X», «new borders for X» — the record's statement about its own outlines, under the names the map
 *  writes — never a sentence about history the record does not make. A 1 January border day is marked as possibly a
 *  year (the same mark js/atlas-reasoning.js rankChanges gives one) and never becomes the headline.
 *  ⚠ LOADED ON DEMAND: nothing on the start-up path imports it; the index (≈90 kB compressed) is read the first time
 *  a door is opened. IntMap-authored text is en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { encode } from './map-state.js';
import { rankChanges } from './atlas-reasoning.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the escaper the doors below write with (js/year-book.js imports it the same way) */
/* ⚠ STATIC, NOT import(): these are already in the start-up bundle, and a dynamic import() of a module the start-up
   bundle holds makes the bundler split it into a chunk of its own — measured on the first build of this file: four more
   requests before the map draws (fetch-deadline, proxy-fetch, mobile-sheet, bus; eager.requests 9 → 13). Imported here they
   cost nothing, and they load in Node, so the page generator and the checks can still import this file. The index's
   own reader (fetch-deadline, proxy-fetch) is js/time-index.js's now, imported the same way. */
import { INDEX_PATH, onDay, loadIndex } from './time-index.js';   /* (time-index-unify) the one index, its calendar cut and its reader */
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';   /* «an answer is on the map» — the phone's sheet comes down */
import * as bus from './bus.js';

export { INDEX_PATH, loadIndex };

/* ══ THE PURE HALF — also what the generated pages and the drafts run (Node) ══════════════════════════ */
const pad = (n) => String(n).padStart(2, '0');
/** 'MM-DD' of a Date (the reader's calendar day) or of an ISO date / 'MM-DD' string; null when it is not a day */
export function mdOf(x) {
  if (x instanceof Date && !isNaN(x.getTime())) return pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  const s = String(x == null ? '' : x).trim();
  const m = /^(?:-?\d{1,6}-)?(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const mo = +m[1], d = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]) return null;
  return pad(mo) + '-' + pad(d);
}
/** every calendar day, 01-01 … 12-31 with 02-29 */
export function allDays() {
  const out = [];
  for (let mo = 1; mo <= 12; mo++) for (let d = 1; d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]; d++) out.push(pad(mo) + '-' + pad(d));
  return out;
}
/** the next / previous calendar day of 'MM-DD' (02-29 included) */
export function stepDay(md, by) { const A = allDays(); const i = A.indexOf(md); return i < 0 ? null : A[(i + by + A.length) % A.length]; }

/** the events of 'MM-DD', oldest first (the index's order) — the index's calendar cut (js/time-index.js onDay) */
export const eventsOn = onDay;

const nameOf = (p, lang) => (lang === 'jp' && p.jp ? p.jp : p.en);
function names(list, lang) {
  const n = list.map((p) => nameOf(p, lang));
  const shown = n.slice(0, 3);
  const rest = n.length - shown.length;
  return lang === 'jp' ? shown.join('、') + (rest > 0 ? 'ほか' + rest : '') : shown.join(', ') + (rest > 0 ? ' and ' + rest + ' more' : '');
}
const yearOf = (ev) => +String(ev.d).slice(0, String(ev.d).lastIndexOf('-', String(ev.d).length - 4));

/** what an event says, in the reader's language: { year, text, record } — `record` names where it is from */
export function describe(ev, idx, lang) {
  const year = yearOf(ev);
  if (ev.src === 'wars') {
    const w = (idx && idx.wars && idx.wars[ev.war]) || null;
    return { year, text: (lang === 'jp' && ev.name.jp) || ev.name.en, war: w ? ((lang === 'jp' && w.jp) || w.en) : ev.war,
      record: IntMapLang.t(lang, 'IntMap’s war record', 'IntMap の戦争記録') };
  }
  const parts = [];
  if (ev.appeared) parts.push(IntMapLang.t(lang, 'the map begins drawing ' + names(ev.appeared, 'en'), names(ev.appeared, 'jp') + 'が地図に現れる'));
  if (ev.ended) parts.push(IntMapLang.t(lang, 'the map stops drawing ' + names(ev.ended, 'en'), names(ev.ended, 'jp') + 'が地図から消える'));
  if (ev.redrawn) parts.push(IntMapLang.t(lang, 'new borders for ' + names(ev.redrawn, 'en'), names(ev.redrawn, 'jp') + 'の国境が変わる'));
  let text = parts.join(IntMapLang.t(lang, '; ', '。'));
  if (lang !== 'jp') text = text.charAt(0).toUpperCase() + text.slice(1);
  return { year, text, record: IntMapLang.t(lang, 'the border record (CShapes 2.0)', '国境の記録（CShapes 2.0）'), maybeYearOnly: !!ev.maybeYearOnly };
}

/** The day's headline: the border day that changes the most polities (js/atlas-reasoning.js rankChanges — a COUNT of
 *  what the record changes, not a judgement of history), never a 1 January day the record may date only by its year;
 *  with no such day, the war record's first event of the day. null when the day has neither. */
export function headline(list) {
  const border = list.filter((e) => e.src !== 'wars' && !e.maybeYearOnly);
  if (border.length) {
    const ranked = rankChanges(border.map((e) => ({ date: e.d, appeared: e.appeared || [], ended: e.ended || [], reshaped: e.redrawn || [] })), [], null);
    const top = ranked[0];
    if (top) return border.find((e) => e.d === top.date) || border[0];
  }
  return list.find((e) => e.src === 'wars') || null;
}

/* the frame a link opens in: the window the example screenshots are taken at (scripts/showcase-capture.mjs VIEWPORT,
   the same frame scripts/history-pages.mjs fits its regions into) and MapLibre's 512-pixel tile */
const FRAME = { width: 1280, height: 800 }, TILE = 512;
/* the closest a link zooms to one polity — a small island state still opens with its neighbours in view */
const MAX_ZOOM = 6;
const RAD = Math.PI / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * RAD / 2));
const invMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
/** the camera that fits a lon/lat box into FRAME (flat projection); longitudes already unwrapped (w ≤ e) */
export function fitView(w, s, e, n, maxZoom) {
  const lonSpan = Math.max(1e-6, e - w), ySpan = Math.max(1e-6, mercY(n) - mercY(s));
  const zx = Math.log2(FRAME.width * 360 / (TILE * lonSpan)), zy = Math.log2(FRAME.height * 2 * Math.PI / (TILE * ySpan));
  let lng = (w + e) / 2; lng = ((lng + 540) % 360) - 180;
  const lat = invMercY((mercY(n) + mercY(s)) / 2);
  const zoom = Math.max(0, Math.min(maxZoom == null ? 22 : maxZoom, Math.floor(Math.min(zx, zy) * 100) / 100));
  return { lng: +lng.toFixed(4) + 0, lat: +lat.toFixed(4) + 0, zoom, bearing: 0, pitch: 0, proj: 'flat' };   /* `+ 0`: never −0 */
}
/** the box an event is about: the polities it begins and ends drawing, else the ones it redraws */
export function boxOf(ev) {
  if (ev.src === 'wars') return Array.isArray(ev.at) ? [ev.at[0], ev.at[1], ev.at[0], ev.at[1]] : null;
  const pick = [...(ev.appeared || []), ...(ev.ended || [])];
  const bbs = (pick.length ? pick : (ev.redrawn || [])).map((p) => p.bb).filter(Boolean);
  if (!bbs.length) return null;
  return [Math.min(...bbs.map((b) => b[0])), Math.min(...bbs.map((b) => b[1])), Math.max(...bbs.map((b) => b[2])), Math.max(...bbs.map((b) => b[3]))];
}
/* a war event opens on its place at the zoom the war layers' own legend flies to an operation (js/war-layer.js) */
const WAR_ZOOM = 5;
/** the war layer that draws an event: the manifest's row id for the war record's id (js/layer-manifest.js `dl-<war>`) */
export const warLayerOf = (ev) => (ev.src === 'wars' ? 'dl-' + ev.war : null);

/** the camera an event opens on: a war event at its place, a border event fitted to the polities it is about, and
 *  the whole world for an event with no box. (learn-quests) js/quest-engine.js asks the same question for the map a
 *  «which year?» question is asked on, so the two cannot place one event differently. */
export function viewOf(ev) {
  const b = boxOf(ev);
  return ev.src === 'wars' && b ? { lng: b[0], lat: b[1], zoom: WAR_ZOOM, bearing: 0, pitch: 0, proj: 'flat' }
    : b ? fitView(b[0], b[1], b[2], b[3], MAX_ZOOM) : fitView(-180, -60, 180, 75);
}
/** the map state an event opens: its date, its place, its war layer, and its headline as the link's title */
function stateFor(ev, idx, lang) {
  const view = viewOf(ev);
  const D = describe(ev, idx, lang);
  const layer = warLayerOf(ev);
  return { view, layers: layer ? [layer] : [], time: { at: ev.d }, title: D.year + ' · ' + D.text };
}
/** the address that opens an event: 'index.html#v=…' */
export const linkFor = (ev, idx, lang) => 'index.html' + encode(stateFor(ev, idx, lang));

/* ══ OPENING AN EVENT ON THE MAP ═════════════════════════════════════════════════════════════════════ */
/** → { ok, timeOk, off, event } — the share link's own restore, read back by the gallery's opener (js/showcase-gallery.js openLink) */
export async function openEvent(ev, idx, lang) {
  const G = await import('./showcase-gallery.js');
  const st = stateFor(ev, idx, lang);
  const res = await G.openLink(linkFor(ev, idx, lang), { at: st.time.at, layers: st.layers });
  return Object.assign(res, { event: ev });
}

/* ══ THE APP'S DOORS ═════════════════════════════════════════════════════════════════════════════════ */
function lang() { try { return window.IntMapI18N.lang(); } catch (_) { return 'en'; } }
/* the reader's language, read at the call — the same wrapper js/showcase-gallery.js writes its words with */
const t = IntMapLang.pick(() => lang());
const H = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));
/** '3 October' / '10月3日' for 'MM-DD' */
export function dayWords(md, lg) {
  const [mo, d] = md.split('-').map(Number);
  const at = new Date(Date.UTC(2000, mo - 1, d, 12));
  return lg === 'jp' ? mo + '月' + d + '日' : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
/** the reader's calendar day today */
const today = () => mdOf(new Date());

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const st = document.createElement('style'); st.id = 'im-otd-css'; st.textContent = CSS; document.head.appendChild(st);
}

/** The card in the search's empty state: today's headline (one tap opens it on the map) and «All n» (the sheet).
 *  Draws into `slot`; draws nothing when the index cannot be read or today has no event — never a card with no news. */
export async function fillSlot(slot) {
  if (!slot) return false;
  let idx;
  try { idx = await loadIndex(); } catch (_) { return false; }
  if (!slot.isConnected) return false;
  const lg = lang(), md = today(), list = eventsOn(idx, md);
  const top = headline(list);
  if (!top) return false;
  style();
  const D = describe(top, idx, lg);
  slot.innerHTML = '<div class="otd-card" role="group" aria-label="' + H(t('On this day', 'この日の歴史地図')) + '">'
    + '<div class="otd-h"><span class="otd-k">' + H(t('On this day', 'この日の歴史地図')) + ' · ' + H(dayWords(md, lg)) + '</span>'
    + '<button type="button" class="otd-all">' + H(t('All ' + list.length, 'すべて（' + list.length + '件）')) + '</button></div>'
    + '<button type="button" class="otd-top"><span class="otd-y">' + H(D.year) + '</span><span class="otd-t">' + H(D.text) + '</span>'
    + '<span class="otd-s">' + H(D.war ? D.war : D.record) + '</span></button></div>';
  slot.querySelector('.otd-top').addEventListener('click', () => { leaveSearch(); mapAnswers(); openEvent(top, idx, lg); });
  slot.querySelector('.otd-all').addEventListener('click', () => { leaveSearch(); openOnThisDay({ md }); });
  return true;
}
/* the map is the answer: on a phone the sheet comes down — the event the gallery's cards raise (js/showcase-gallery.js choose) */
function mapAnswers() { try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { /* no sheet */ } }
/* a choice in the search's list ends the search: the list closes and the field lets go (js/showcase-gallery.js does the same) */
function leaveSearch() {
  try { const res = document.getElementById('ms-results'); if (res) { res.style.display = 'none'; res.innerHTML = ''; } } catch (_) { /* no list */ }
  try { const inp = document.getElementById('ms-input'); if (inp && document.activeElement === inp) inp.blur(); } catch (_) { /* no field */ }
}

/** one event of the sheet, as a button: its year, its words and the record they come from — every value escaped here */
function rowHTML(ev, i, idx, lg) {
  const D = describe(ev, idx, lg);
  return '<li><button type="button" class="otd-row" data-i="' + H(i) + '"><span class="otd-y">' + H(D.year) + '</span>'
    + '<span class="otd-t">' + H(D.text) + '</span><span class="otd-s">' + H(D.war ? D.war + ' · ' + D.record : D.record) + '</span></button></li>';
}

let dlg = null;
function closeSheet() { if (dlg) { const h = dlg; dlg = null; try { h.close('api'); } catch (_) { /* gone */ } } const el = document.getElementById('im-otd'); if (el) el.remove(); }

/** The sheet: every event of a day. `opts.md` = 'MM-DD' (default: today). → { ok, md, events } */
export async function openOnThisDay(opts) {
  style(); closeSheet();
  const idx = await loadIndex();
  let md = (opts && mdOf(opts.md)) || today();
  const lg = lang();
  const box = document.createElement('div'); box.id = 'im-otd';
  box.innerHTML = '<div class="otd-scrim" aria-hidden="true"></div><div class="otd-box" role="document"></div>';
  const panel = /** @type {HTMLElement} */ (box.querySelector('.otd-box'));
  const paint = () => {
    const list = eventsOn(idx, md);
    const dated = list.map((e, i) => [e, i]).filter(([e]) => !e.maybeYearOnly), yearOnly = list.map((e, i) => [e, i]).filter(([e]) => e.maybeYearOnly);
    panel.innerHTML = '<div class="otd-head"><button type="button" class="otd-step" data-step="-1" aria-label="' + H(t('Previous day', '前の日')) + '">‹</button>'
      + '<h2 id="otd-title">' + H(t('On this day', 'この日の歴史地図')) + '<span>' + H(dayWords(md, lg)) + '</span></h2>'
      + '<button type="button" class="otd-step" data-step="1" aria-label="' + H(t('Next day', '次の日')) + '">›</button>'
      + '<button type="button" class="otd-x" aria-label="' + H(t('Close', '閉じる')) + '">×</button></div>'
      + (list.length ? '<ol class="otd-list">' + dated.map(([e, i]) => rowHTML(e, i, idx, lg)).join('') + '</ol>'
        + (yearOnly.length ? '<p class="otd-note">' + H(t('Dated 1 January — the record may state only the year:', '1月1日付け（記録が年だけを述べている場合があります）:')) + '</p><ol class="otd-list">' + yearOnly.map(([e, i]) => rowHTML(e, i, idx, lg)).join('') + '</ol>' : '')
        : '<p class="otd-note">' + H(t('The records the map draws state no event on this day.', '地図が描く記録には、この日の出来事がありません。')) + '</p>')
      + '<p class="otd-note">' + H(t('Tap an event to open the map on that day. Border events are what the border record states about its own outlines, under the names the map writes; the war record covers only the wars IntMap documents day by day.',
        '出来事を押すと、その日の地図が開きます。国境の出来事は、国境の記録が自分の輪郭について述べていることを、地図が書く名前で示したものです。戦争の記録は IntMap が日単位で扱う戦争だけです。')) + '</p>'
      + '<p class="otd-src">' + H(t('Sources: ', '出典: ')) + H(idx.src.cshapes) + ' · ' + H(idx.src.wars) + '</p>';
    panel.querySelectorAll('.otd-row').forEach((b) => b.addEventListener('click', () => {
      const ev = list[+b.getAttribute('data-i')];
      if (dlg) dlg.close('button'); else closeSheet();
      mapAnswers();
      openEvent(ev, idx, lg);
    }));
    panel.querySelectorAll('.otd-step').forEach((b) => b.addEventListener('click', () => { md = stepDay(md, +b.getAttribute('data-step')) || md; paint(); }));
    panel.querySelector('.otd-x').addEventListener('click', () => { if (dlg) dlg.close('button'); else closeSheet(); });
  };
  paint();
  const close = () => { dlg = null; try { box.remove(); } catch (_) { /* gone */ } };
  const D = window.IntMapDialog;
  if (D && D.open) dlg = D.open(box, { panel, labelledby: 'otd-title', backdrop: box.querySelector('.otd-scrim'), close });
  else {
    document.body.appendChild(box);
    box.querySelector('.otd-scrim').addEventListener('click', close);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  }
  try { /** @type {HTMLElement} */ (panel.querySelector('.otd-row, .otd-x')).focus(); } catch (_) { /* nothing to focus */ }
  return { ok: !!box.isConnected, md, events: eventsOn(idx, md).length };
}

/* ══ THE LOOK — iOS-like, on the app's own variables (css/intmap.css), injected when first drawn ══════════ */
const CSS = [
  '.otd-card{margin:10px 10px 0;padding:10px 12px 12px;border-radius:14px;background:var(--input-bg);border:1px solid rgba(128,128,128,0.18);}',
  '.otd-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;}',
  '.otd-k{font-size:12px;font-weight:600;color:var(--text-muted);letter-spacing:0.01em;}',
  '.otd-all{min-height:32px;padding:0 10px;border:none;border-radius:999px;background:transparent;color:var(--primary-color);font:inherit;font-size:12px;font-weight:600;cursor:pointer;}',
  '.otd-top,.otd-row{display:grid;grid-template-columns:auto 1fr;column-gap:10px;row-gap:2px;width:100%;padding:6px 4px;border:none;border-radius:10px;background:transparent;color:var(--text-main);font:inherit;text-align:left;cursor:pointer;}',
  '.otd-top:hover,.otd-row:hover{background:rgba(128,128,128,0.10);}',
  '.otd-top:focus-visible,.otd-row:focus-visible{outline:2px solid var(--primary-color);outline-offset:1px;}',
  '.otd-y{grid-row:span 2;align-self:start;min-width:3.2em;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--primary-color);}',
  '.otd-t{font-size:13.5px;font-weight:600;line-height:1.35;}',
  '.otd-s{font-size:11.5px;color:var(--text-muted);}',
  '#im-otd{position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;}',
  '#im-otd .otd-scrim{position:absolute;inset:0;background:rgba(0,0,0,0.35);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}',
  '#im-otd .otd-box{position:relative;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:12px 18px 20px;border-radius:22px;background:var(--card-bg);color:var(--text-main);box-shadow:var(--shadow);}',
  '#im-otd .otd-head{position:sticky;top:-12px;z-index:calc(var(--z-inset) + 1);display:flex;align-items:center;gap:6px;margin:-12px -18px 4px;padding:12px 14px 8px;background:var(--card-bg);}',
  '#im-otd h2{flex:1;margin:0;text-align:center;font-size:17px;font-weight:700;}',
  '#im-otd h2 span{display:block;font-size:13px;font-weight:600;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
  '#im-otd .otd-step,#im-otd .otd-x{flex:none;width:44px;height:44px;border:none;border-radius:50%;background:var(--input-bg);color:var(--text-main);font-size:20px;line-height:1;cursor:pointer;}',
  '#im-otd .otd-list{list-style:none;margin:0;padding:0;}',
  '#im-otd .otd-note{margin:10px 2px 4px;font-size:12px;line-height:1.45;color:var(--text-muted);}',
  '#im-otd .otd-src{margin:8px 2px 0;font-size:11px;line-height:1.4;color:var(--text-muted);}',
  '@media (max-width:640px){#im-otd{align-items:flex-end;}#im-otd .otd-box{width:100vw;max-height:92dvh;border-radius:20px 20px 0 0;padding-bottom:calc(20px + var(--safe-bottom));}}',
].join('\n');
