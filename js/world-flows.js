/* ============================================================================
 *  IntMap · js/world-flows.js — WORLD FLOWS: who a country is connected to, on the map and the clock   (wave4-mobility)
 * ----------------------------------------------------------------------------
 *  IntMap draws where aircraft and ships are now and where cables and railways run. What a reader asks next — «who is
 *  Japan connected to, and how strongly? how has that changed?» — had no answer on the map. This card answers it for one
 *  country, each flow from the record that states it (the facts and their rules are js/world-flows-core.js):
 *
 *    People   where the people born here live, or where the people living here were born (UN DESA migrant stock, 1990–2024)
 *    Data     which countries share a submarine cable system with it (the cable record IntMap already draws)
 *    Flights  which countries its airline routes reached in June 2014 (OpenFlights, the pandemic simulator's table)
 *    Goods    ⚠ NOT DRAWN HERE. The Trade flows layer (js/world-packs.js — CEPII BACI through the OEC, by HS section, every
 *             year 1995–2024) already answers «who does it trade with», with its own arcs and clock. The Goods chip opens
 *             THAT layer on the same country and direction (through the layer family's share-link door, IntMapShareState
 *             'world'), so goods are one implementation reached from two places, not two.
 *
 *  THE MAP AND THE CLOCK ARE ONE (js/chronos.js): arcs run from the country to its partners along the great circle,
 *  thick for the large and thin for the small, pointing the way the flow runs; each reading is the latest year its record
 *  states at or before the clock, so moving the clock — or playing a time-lapse — redraws the world's connections as the
 *  records state them. A bar of the chart moves the clock to that year. Tapping a partner (in the list or its circle on
 *  the map) makes it the country.
 *
 *  Doors: the Tools menu (js/map-ui.js `tool.worldFlows`), the place card's country row (js/place-dossier.js), a link
 *  `?wf=<ISO3>.<kind>.<dir>` (src/main.js → bootFromUrl), and Atlas `data.worldFlows` (js/atlas-cap-data.js → `atlas` below).
 *  ⚠ NOTHING IS ESTIMATED, AND «COULD NOT READ» IS NEVER «NO CONNECTIONS»: a failed read says it failed; a record that
 *  holds nothing for the instant says so with its reason.
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { MapState } from './map-state.js';
import { whenHost } from './host-door.js';
import * as bus from './bus.js';
import { clearOfCard } from './card-clearance.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the escaper below */
import { DIRECTED, basisOf, placeIndex, findPlace, searchPlaces, placeName, yearFor, migrationPartners,
  cablePartners, flightPartners, summarise, totalsSeries, totalAt, arcFeatures } from './world-flows-core.js';

/** the app's one escaper (js/safe-html.js) — read once, here */
const esc = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));
const GE = () => IntMapGeoEngine;

/* ══ THE RECORDS ═════════════════════════════════════════════════════════════════════════════════════════════════
   The one this feature added (scripts/build-world-flows.mjs: the places and the migrant stock) and the two it reads where
   they already live. Each is read once; a failed read is forgotten so the next asks again. */
const INDEX = 'data/world-flows.json';
/* the chips of the card, in order: the three flows this card reads, and Goods — the door to the Trade flows layer */
const CHIPS = ['migration', 'trade', 'cables', 'flights'];
const CABLES = 'data/subcables-meta.json';
const FLIGHTS = 'data/mobility.json';
const cache = new Map();
function load(path) {
  if (!cache.has(path)) cache.set(path, jsonWithin(path, clockFor(path)).catch((e) => { cache.delete(path); throw e; }));
  return cache.get(path);
}
let _P = null;
async function places() { const idx = await load(INDEX); if (!_P || _P.idx !== idx) _P = Object.assign(placeIndex(idx), { idx }); return _P; }

/* the year of a 2014 snapshot, as the table states it (`routesSnapshot`: '2014-06') */
const snapshotYear = (mob) => { const m = /^(\d{4})/.exec(String((mob && mob.routesSnapshot) || '')); return m ? +m[1] : null; };
/** the clock's year, or null while it is live */
const clockYear = () => { try { return IntMapTime.isLive() ? null : IntMapTime.year(); } catch (_) { return null; } };

/**
 * read(kind, i, dir, cy) — one reading at the clock's year `cy` (null = live).
 *   → { ok:true, kind, dir, year, yf, sum (js/world-flows-core.js summarise), series:[{y, v}], extra }
 *   | { ok:false, reason: 'before-record' (with `first`) | 'unavailable' }
 */
export async function read(kind, i, dir, cy) {
  const P = await places(), idx = P.idx;
  const d = DIRECTED[kind] ? (dir === 'in' ? 'in' : 'out') : 'link';
  if (kind === 'migration') {
    const yf = yearFor(idx.migration.years, cy);
    if (yf.year == null) return { ok: false, kind, dir: d, reason: yf.reason, first: yf.first };
    const partners = migrationPartners(idx.migration, i, d, yf.year);
    const sum = summarise(P, i, kind, d, yf.year, partners, { total: totalAt(idx, kind, i, d, yf.year) });
    return { ok: true, kind, dir: d, year: yf.year, yf, sum, series: totalsSeries(idx, kind, i, d) };
  }
  if (kind === 'cables') {
    const meta = await load(CABLES);
    const c = cablePartners(meta, P, i, cy);
    const sum = summarise(P, i, kind, d, cy, c.partners, { base: c.systems });
    /* the systems in service year by year, from the first ready-for-service year any of its cables states to the clock */
    const years = [];
    for (const id of Object.keys(meta.cables || {})) { const x = meta.cables[id]; if ((x.countryCodes || []).includes(P.rows[i] && P.rows[i].a2) && x.rfsYear != null) years.push(x.rfsYear); }
    const last = cy == null ? new Date().getUTCFullYear() : cy;
    const series = [];
    if (years.length) for (let y = Math.min(...years); y <= last; y++) series.push({ y, v: cablePartners(meta, P, i, y).systems });
    return { ok: true, kind, dir: d, year: cy, yf: { year: cy, live: cy == null }, sum, series, extra: { systems: c.systems, undated: c.undated, unresolved: c.unresolved } };
  }
  const mob = await load(FLIGHTS);
  const y0 = snapshotYear(mob);
  const yf = yearFor(y0 != null ? [y0] : [], cy);
  if (yf.year == null) return { ok: false, kind, dir: d, reason: yf.reason, first: yf.first };
  const partners = flightPartners(mob, P, i, d);
  return { ok: true, kind, dir: d, year: yf.year, yf, sum: summarise(P, i, kind, d, yf.year, partners), series: [] };
}

/* ══ WORDS ═══════════════════════════════════════════════════════════════════════════════════════════════════════ */
const LOC = (lg) => { try { return IntMapLang.locale(lg); } catch (_) { return 'en'; } };
/** a value in the reading's unit, compact (12.3M people · 3 cables · 12 routes) */
function valueWords(kind, v, lg) {
  if (v == null) return '—';
  const t = IntMapLang.pick(() => lg);
  const compact = (x, o) => { try { return new Intl.NumberFormat(LOC(lg), Object.assign({ notation: 'compact', maximumFractionDigits: 1 }, o)).format(x); } catch (_) { return String(x); } };
  if (kind === 'migration') return t(compact(v) + ' people', compact(v) + '人');
  if (kind === 'cables') return t(v + (v === 1 ? ' cable' : ' cables'), v + ' 本');
  return t(v + (v === 1 ? ' route' : ' routes'), v + ' 路線');
}
const pct = (s) => (s == null ? '' : (s < 0.001 ? '<0.1' : (Math.round(s * 1000) / 10).toFixed(1)) + '%');
const KIND_COLOUR = { migration: '#ff9f0a', trade: '#0a84ff', cables: '#bf5af2', flights: '#30b0c7' };
function kindLabel(kind, lg) {
  const t = IntMapLang.pick(() => lg);
  return ({ migration: t('People', '人'), trade: t('Goods', 'モノ'), cables: t('Data', 'データ'), flights: t('Flights', '航空路') })[kind];
}
function dirLabel(kind, dir, lg) {
  const t = IntMapLang.pick(() => lg);
  if (kind === 'migration') return dir === 'in' ? t('Living here, born abroad', 'この国に住む外国出身者') : t('Born here, living abroad', '国外に住むこの国の出身者');
  if (kind === 'trade') return dir === 'in' ? t('Imports', '輸入') : t('Exports', '輸出');
  if (kind === 'flights') return dir === 'in' ? t('Routes arriving', '到着する路線') : t('Routes departing', '出発する路線');
  return '';
}
/** the one sentence the reading says (the headline of the card and the first line Atlas gets) */
export function headline(r, name, lg) {
  const t = IntMapLang.pick(() => lg), s = r.sum, v = valueWords(r.kind, s.total, lg), n = s.count;
  if (r.kind === 'migration') return r.dir === 'in'
    ? t(v + ' born in other countries lived in ' + name + ' at mid-' + r.year + ', from ' + n + ' countries and areas the record names.', r.year + '年央、' + name + 'には外国生まれの' + v + 'が住んでいました（記録が名指す出身国・地域は' + n + '）。')
    : t(v + ' born in ' + name + ' lived in other countries at mid-' + r.year + ', in ' + n + ' countries and areas the record names.', r.year + '年央、' + name + '生まれの' + v + 'が国外に住んでいました（記録が名指す居住国・地域は' + n + '）。');
  if (r.kind === 'cables') {
    const when = r.year == null ? t('today', '今日') : t('in ' + r.year, r.year + '年');
    return t('The cable record lists ' + s.total + (s.total === 1 ? ' system' : ' systems') + ' landing in ' + name + ' in service ' + when + ', reaching ' + n + ' other countries and areas.',
      '海底ケーブルの記録には、' + when + '運用中で' + name + 'に陸揚げされる系統が' + s.total + 'あり、' + n + 'の国・地域とつながっています。');
  }
  return r.dir === 'in'
    ? t('The June ' + r.year + ' route table lists ' + s.listed + ' airline routes into ' + name + ' from ' + n + ' countries.', r.year + '年6月の路線表には、' + n + 'か国から' + name + 'への航空路線が' + s.listed + 'あります。')
    : t('The June ' + r.year + ' route table lists ' + s.listed + ' airline routes from ' + name + ' to ' + n + ' countries.', r.year + '年6月の路線表には、' + name + 'から' + n + 'か国への航空路線が' + s.listed + 'あります。');
}
/** what the number is — and is not (said under every reading) */
function caveat(r, lg) {
  const t = IntMapLang.pick(() => lg);
  if (r.kind === 'migration') return t('A stock, not a number of moves: people living in a country other than the one they were born in, at mid-year, as UN DESA estimates it (census, register and survey based). The record states 1990, 1995 … 2020 and 2024; the card reads the latest estimate at or before the clock.',
    'ある年の年央に、生まれた国以外に住んでいる人の数（ストック）で、その年に移動した人数ではありません。国連経済社会局の推計（国勢調査・登録・調査に基づく）。記録は 1990・1995 … 2020・2024 年で、時計の年以前で最も新しい推計を表示します。');
  if (r.kind === 'cables') return t('A count of cable systems landing in both countries, not of capacity or traffic. A system is counted from the ready-for-service year the record states; cables retired before today are not in the record, so earlier years count fewer than were in service then.',
    '両国に陸揚げされているケーブル系統の数で、容量や通信量ではありません。記録が述べる運用開始年から数えます。現在までに退役したケーブルは記録に無いため、過去の年は当時の実数より少なく数えます。');
  return t('Which airline routes existed in June 2014 (OpenFlights, no longer updated) — not seats, flights per week or passengers. A country with no direct route can still be reached with a connection.',
    '2014 年 6 月に存在した航空路線（OpenFlights、更新終了）で、座席数・便数・旅客数ではありません。直行路線の無い国へも乗り継ぎで行けます。');
}
/** the source line of a reading, from the record's own statement (the bundle's `gov` for the one built here) */
function sourceLine(kind, idx, lg) {
  const t = IntMapLang.pick(() => lg);
  const up = (p) => ((idx && idx.gov && idx.gov.upstreams) || []).find((u) => p.test(u.publisher || '')) || null;
  if (kind === 'migration') { const u = up(/Population Division/); return t('Record: ', '記録: ') + (u ? u.paidBy : 'UN DESA'); }
  if (kind === 'cables') return t('Record: TeleGeography Submarine Cable Map (CC BY-SA 4.0), as IntMap’s submarine cable layer reads it', '記録: TeleGeography Submarine Cable Map（CC BY-SA 4.0）——IntMap の海底ケーブルレイヤーと同じ記録');
  return t('Record: OpenFlights route database (ODbL 1.0), June 2014 snapshot; airports to countries by OurAirports (public domain)', '記録: OpenFlights 路線データベース（ODbL 1.0、2014 年 6 月時点）・空港と国の対応は OurAirports（パブリックドメイン）');
}
/* ══ GOODS — the Trade flows layer, opened on the same country ═══════════════════════════════════════════════════
   The layer row's own change (the way every door switches a layer) and the layer family's share-link door for the choice
   (js/world-packs-rows.js registers 'world' with IntMapShareState: { t: { i: ISO3, d: 'X' | 'M' } }) — the same two steps a
   shared link takes, so the layer opens exactly as a link to it would. → { ok, reason? } */
const TRADE_ROW = 'wp-dl-trade';
function openTrade(code, dir) {
  const cb = typeof document !== 'undefined' ? document.getElementById(TRADE_ROW) : null;
  const share = globalThis.IntMapShareState;
  if (!cb || !share) return { ok: false, reason: 'no-trade-layer' };
  if (!/^[A-Z]{3}$/.test(String(code || ''))) return { ok: false, reason: 'no-iso3' };
  if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  share.apply({ world: { t: { i: code, d: dir === 'in' ? 'M' : 'X' } } });
  return { ok: true };
}
function tradeHtml(me, lg) {
  const t = S(lg), name = placeName(me, lg), ok = /^[A-Z]{3}$/.test(me.c);
  return '<div class="wf-head">' + esc(t('Goods trade by partner — exports and imports, by product section, every year 1995–2024 — is drawn by the Trade flows layer (CEPII BACI through the OEC). Open it on ' + name + ':', '相手国別の財の貿易（輸出入・品目区分別・1995〜2024 年の各年）は「貿易フロー」レイヤーが描きます（CEPII BACI、OEC 経由）。' + name + 'で開く:')) + '</div>'
    + (ok ? '<div class="nst-share"><button type="button" class="nst-all" data-wf-trade="out">' + esc(t('Exports of ' + name, name + 'の輸出')) + '</button> <button type="button" class="nst-all" data-wf-trade="in">' + esc(t('Imports of ' + name, name + 'の輸入')) + '</button></div>'
      : '<div class="nint-empty">' + esc(t('The Trade flows layer names countries by ISO code, and this place has none.', '貿易フローは国を ISO コードで指定しますが、この場所にはありません。')) + '</div>')
    + '<div class="nint-foot nint-cov">' + esc(t('The layer reads the OEC when you open it — it sends the country code and the year, nothing about you.', 'このレイヤーは開いたときに OEC から読み込みます（送るのは国コードと年だけです）。')) + '</div>';
}
/** what UN DESA's estimate for a destination stands on, in IntMap's words (the codes are DESA's, defined in its notes sheet) */
function basisWords(b, lg) {
  const t = S(lg);
  if (!b) return '';
  const W = { B: t('from data on people born abroad', '外国生まれの人口のデータから'), C: t('from data on foreign citizens', '外国籍の人口のデータから'),
    R: t('with refugees and asylum seekers reported by UNHCR / UNRWA added', 'UNHCR・UNRWA が報告する難民・庇護希望者などを加算'),
    I: t('imputed — UN DESA had no data on migrants here', '補完推計（移民のデータが無く国連が補った値）') };
  const parts = b.type.map((k) => W[k]).filter(Boolean);
  return (parts.length ? t('UN DESA’s estimate here: ', 'この国の国連の推計: ') + parts.join(t('; ', '・')) + t('.', '。') : '') + (b.noteText ? ' ' + t('Note: ', '注: ') + b.noteText : '');
}
function failureWords(r, lg) {
  const t = IntMapLang.pick(() => lg);
  if (r.reason === 'before-record') return t('The record begins in ' + r.first + ' — it says nothing about the clock’s year. Move the clock to ' + r.first + ' or later.', 'この記録は ' + r.first + ' 年から始まり、時計の年については何も述べていません。時計を ' + r.first + ' 年以降へ動かしてください。');
  return t('This record could not be read. That is a failure to read it, not an absence of connections.', 'この記録を読み込めませんでした。読み込みの失敗であって、つながりが無いという意味ではありません。');
}

/* ══ THE CARD ═════════════════════════════════════════════════════════════════════════════════════════════════
   The app's card shell (.country-popup / .nint-popup and the story card's chips and tiles, css/intmap.css); what is only
   this card's arrives with this chunk, not on the boot path (the eager stylesheet has a start-up budget). */
const CSS = [
  '.wf-popup .wf-q{ width:100%; box-sizing:border-box; padding:8px 12px; border-radius:10px; border:1px solid var(--glass-border,rgba(128,128,128,0.25)); background:var(--input-bg); color:var(--text-main); font:inherit; font-size:14px; }',
  '.wf-popup .wf-sugg{ list-style:none; margin:4px 0 0; padding:0; border-radius:10px; overflow:hidden; background:var(--input-bg); }',
  '.wf-popup .wf-sugg button{ width:100%; min-height:40px; padding:6px 12px; border:0; border-bottom:1px solid rgba(128,128,128,0.14); background:transparent; color:var(--text-main); font:inherit; font-size:13px; text-align:left; cursor:pointer; }',
  '.wf-popup .nst-chips{ margin:8px 0 0; }',
  '.wf-popup .wf-dot{ width:8px; height:8px; border-radius:50%; display:inline-block; }',
  '.wf-popup .wf-head{ margin:10px 0 8px; font-size:13px; line-height:1.45; }',
  '.wf-popup .wf-chart{ width:100%; height:auto; display:block; margin:2px 0 2px; cursor:pointer; }',
  '.wf-popup .wf-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }',
  '.wf-popup .wf-row{ position:relative; overflow:hidden; display:grid; grid-template-columns:22px 1fr auto; align-items:baseline; gap:2px 8px; width:100%; min-height:44px; padding:7px 10px; border:0; border-radius:10px; background:var(--input-bg); color:var(--text-main); font:inherit; text-align:left; cursor:pointer; }',
  '.wf-popup .wf-row i{ position:absolute; left:0; bottom:0; height:3px; border-radius:0 2px 2px 0; opacity:.85; }',
  '.wf-popup .wf-rk{ font-size:11px; color:var(--text-muted); font-variant-numeric:tabular-nums; }',
  '.wf-popup .wf-n{ font-size:13px; font-weight:600; }',
  '.wf-popup .wf-v{ font-size:12px; font-variant-numeric:tabular-nums; text-align:right; }',
  '.wf-popup .wf-s{ grid-column:2 / 4; font-size:11px; color:var(--text-muted); }',
  '.wf-popup .wf-more{ margin-top:6px; }',
].join(' ');
/* how many partners the list shows, and the map draws, before «show all»: the same rows on both, so a rank on the map is a
   rank in the list. A display choice, not a filter on the record — «show all» lifts it, on the list and the map alike.
   ESTIMATE, not measured: fifteen arcs from one country stay legible on a world view (the numbered circles do not pile up
   outside the densest region), and fifteen 44 px rows are about one card's height. Revisit if a reader asks for more or
   fewer by default, or if the circles overlap in a measured screenshot. */
const SHOW = 15;

let pop = null, host = null, langOf = () => 'en';
const lang = () => { try { return (host && host.lang) || langOf() || 'en'; } catch (_) { return 'en'; } };
const st = { open: false, i: -1, kind: 'migration', dir: 'out', all: false, q: '', seq: 0, r: null, err: null, painted: 0 };

function ensureCss() { if (typeof document === 'undefined' || document.getElementById('wf-css')) return; const c = document.createElement('style'); c.id = 'wf-css'; c.textContent = CSS; document.head.appendChild(c); }
function ensurePop() {
  if (pop && document.body.contains(pop)) return pop;
  ensureCss();
  pop = document.createElement('div');
  pop.className = 'country-popup nint-popup wf-popup'; pop.id = 'wf-popup';
  pop.setAttribute('data-panel', 'world-flows'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-labelledby', 'wf-title');
  /* (data-effect) reading and choosing change nothing outside the card; a chart bar moves the clock and says so on its title */
  pop.setAttribute('data-effect', 'none');
  pop.innerHTML = '<button class="country-popup-close" type="button" data-wf="close"></button><div class="country-popup-header" id="wf-headbox"></div><div id="wf-ctl"></div><div id="wf-body" aria-live="polite"></div>';
  (document.getElementById('map-container') || document.body).appendChild(pop);
  try { host.makeDraggable(pop, pop.querySelector('#wf-headbox')); } catch (_) { /* a fixed card still reads */ }
  pop.addEventListener('mousedown', () => { try { host.bringToFront(pop); } catch (_) { /* order is cosmetic */ } });
  pop.addEventListener('click', onClick);
  pop.addEventListener('input', (e) => { if (e.target && e.target.classList.contains('wf-q')) { st.q = e.target.value; paintSuggestions(); } });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.classList.contains('wf-q')) { const b = pop.querySelector('.wf-sugg button'); if (b) b.click(); } });
  return pop;
}
function show() {
  const e = ensurePop(); e.style.display = 'block';
  try { host.bringToFront(e); } catch (_) { /* order is cosmetic */ }
  if (e.getAttribute('data-dragged') !== '1') {
    try {
      const mc = e.offsetParent || document.getElementById('map-container') || document.documentElement;
      const mr = mc.getBoundingClientRect(), w = e.offsetWidth || 380;
      e.style.left = Math.round(Math.max(12, mr.width - w - 24)) + 'px'; e.style.top = '84px';
    } catch (_) { e.style.left = '16px'; e.style.top = '84px'; }
  }
}

/**
 * openFlows(want) — open the card. `want` = { country?: ISO3 | ISO2 | name, kind?, dir?, link?: '<ISO3>.<kind>.<dir>' }.
 * Resolves to the summary Atlas reads (`summary()`).
 */
export async function openFlows(want) {
  const w = Object.assign({}, want || {});
  host = host || await whenHost();
  if (typeof w.lang === 'function') langOf = w.lang;
  if (w.link) Object.assign(w, decodeLink(w.link));
  if (CHIPS.includes(w.kind)) st.kind = w.kind;
  if (w.dir === 'in' || w.dir === 'out') st.dir = w.dir;
  st.open = true; st.all = false; st.q = '';
  show(); draw(null);
  let P;
  try { P = await places(); } catch (_) { st.err = 'unavailable'; draw(null); return summary(); }
  st.err = null;
  if (w.country != null) { const i = findPlace(P, w.country); if (i >= 0) st.i = i; }
  if (st.i < 0) { draw(null); return summary(); }
  await refresh();
  fit();
  return summary();
}
function closeFlows() {
  st.open = false; st.seq++;
  if (pop) pop.style.display = 'none';
  paint();
}
/** read the current choice at the clock's year, then draw the card and the map */
async function refresh() {
  const my = ++st.seq;
  if (st.i < 0) { st.r = null; draw(null); paint(); return; }   /* no country yet: nothing to read */
  draw('loading');
  let r;
  if (st.kind === 'trade') r = { ok: true, kind: 'trade', door: true };
  else { try { r = await read(st.kind, st.i, st.dir, clockYear()); } catch (_) { r = { ok: false, kind: st.kind, reason: 'unavailable' }; } }
  if (my !== st.seq) return;
  st.r = r;
  draw(null); paint();
}

const S = (lg) => IntMapLang.pick(() => lg);
function draw(phase) {
  if (!pop) return;
  const lg = lang(), t = S(lg), P = _P;
  const me = P && st.i >= 0 ? P.rows[st.i] : null;
  const x = pop.querySelector('[data-wf="close"]'); x.textContent = '×'; x.title = t('Close', '閉じる'); x.setAttribute('aria-label', t('Close', '閉じる'));
  pop.querySelector('#wf-headbox').innerHTML = '<div class="nint-h-title" id="wf-title">' + esc(t('World flows', '世界とのつながり')) + '</div><div class="nint-h-sub">'
    + esc(me ? placeName(me, lg) + (st.r && st.r.ok && !st.r.door ? ' · ' + yearWords(st.r, lg) : '') : t('People, goods, data and flights between countries', '国と国を結ぶ人・モノ・データ・航空路')) + '</div>';
  const kinds = '<div class="nst-chips" role="group" aria-label="' + esc(t('Flow', '流れ')) + '">' + CHIPS.map((k) => chip('data-wf-k', k, k === st.kind, '<span class="wf-dot" style="background:' + KIND_COLOUR[k] + '"></span>' + esc(kindLabel(k, lg)))).join('') + '</div>';
  const dirs = DIRECTED[st.kind] && st.kind !== 'trade' ? '<div class="nst-chips" role="group" aria-label="' + esc(t('Direction', '向き')) + '">' + ['out', 'in'].map((d) => chip('data-wf-d', d, d === st.dir, esc(dirLabel(st.kind, d, lg)))).join('') + '</div>' : '';
  const had = pop.querySelector('.wf-q');
  if (!had) pop.querySelector('#wf-ctl').innerHTML = '<input type="search" class="wf-q" enterkeyhint="search" autocomplete="off" aria-label="' + esc(t('Choose a country', '国を選ぶ')) + '"><ul class="wf-sugg" hidden></ul><div class="wf-chips"></div>';
  const q = pop.querySelector('.wf-q');
  q.setAttribute('aria-label', t('Choose a country', '国を選ぶ')); q.placeholder = me ? t('Another country…', '別の国…') : t('Choose a country — e.g. Japan', '国を選ぶ（例: 日本）');
  pop.querySelector('.wf-chips').innerHTML = kinds + dirs;
  const body = pop.querySelector('#wf-body');
  const msg = (s) => { body.innerHTML = '<div class="nint-empty">' + esc(s) + '</div>'; };
  if (st.err === 'unavailable' && !P) return msg(t('The record of world flows could not be read. That is a failure to read it, not an absence of connections.', '世界とのつながりの記録を読み込めませんでした。読み込みの失敗であって、つながりが無いという意味ではありません。'));
  if (!P || phase === 'loading' && !st.r) return msg(t('Reading the records…', '記録を読んでいます…'));
  if (!me) return msg(t('Choose a country to see who it is connected to — by people, goods, submarine cables and airline routes.', '国を選ぶと、人・モノ・海底ケーブル・航空路でどの国とつながっているかを表示します。'));
  const r = st.r;
  if (!r || r.kind !== st.kind) return msg(t('Reading the records…', '記録を読んでいます…'));
  if (r.door) { body.innerHTML = tradeHtml(me, lg); return; }
  if (!r.ok) { body.innerHTML = '<div class="nint-empty">' + esc(failureWords(r, lg)) + '</div>' + (r.reason === 'before-record' ? '<div class="nst-share"><button type="button" class="nst-all" data-wf-year="' + esc(r.first) + '" data-time-intent="1">' + esc(t('Go to ' + r.first, r.first + ' 年へ')) + '</button></div>' : ''); return; }
  const s = r.sum, rows = st.all ? s.partners : s.partners.slice(0, SHOW);
  const top = s.partners[0];
  let h = '<div class="nst-spread"><div><b>' + esc(valueWords(r.kind, r.kind === 'flights' ? s.listed : s.total, lg)) + '</b><span>' + esc(r.kind === 'cables' ? t('systems in service', '運用中の系統') : t('in total', '合計')) + '</span></div>'
    + '<div><b>' + esc(String(s.count)) + '</b><span>' + esc(t('countries and areas', '国・地域')) + '</span></div>'
    + '<div><b>' + esc(top ? pct(top.share) : '—') + '</b><span>' + esc(top ? t('to the largest, ', '最大の相手 ') + placeName(P.rows[top.p], lg) : t('no partner', '相手なし')) + '</span></div></div>';
  h += '<div class="wf-head">' + esc(headline(r, placeName(me, lg), lg)) + '</div>';
  if (r.kind === 'migration' && r.dir === 'in') { const bw = basisWords(basisOf(P.idx.migration, st.i), lg); if (bw) h += '<div class="nint-foot nint-cov">' + esc(bw) + '</div>'; }
  if (r.series && r.series.length > 1) h += chartSvg(r, lg);
  h += '<div class="nint-sec">' + esc(t('Largest partners', '大きい相手')) + '</div><ol class="wf-list">' + rows.map((x, k) => rowHtml(r, x, k, lg)).join('') + '</ol>';
  if (!s.partners.length) h += '<div class="nint-empty">' + esc(t('The record lists no partner for this choice and year.', 'この選択と年について、記録に相手はありません。')) + '</div>';
  if (s.partners.length > SHOW) h += '<div class="nst-share wf-more"><button type="button" class="nst-all" data-wf="all">' + esc(st.all ? t('Show the largest ' + SHOW, '上位 ' + SHOW + ' 件だけ表示') : t('Show all ' + s.partners.length, 'すべて表示（' + s.partners.length + ' 件）')) + '</button></div>';
  if (s.offMap > 0) h += '<div class="nint-foot nint-cov">' + esc(t('Not on the map (no anchor in the map’s country shapes): ', '地図に描けない相手（地図の国の形に位置が無いもの）: ') + valueWords(r.kind, s.offMap, lg) + (s.total ? ' (' + pct(s.offMap / s.total) + ')' : '')) + '</div>';
  if (r.kind === 'migration') { const named = s.listed, rest = s.total - named; if (rest > 0) h += '<div class="nint-foot nint-cov">' + esc(t('Not attributed to a country by the record (unknown or other): ', '記録が国を特定していない分（不明・その他）: ') + valueWords(r.kind, rest, lg)) + '</div>'; }
  if (r.kind === 'cables' && r.extra && r.extra.undated) h += '<div class="nint-foot nint-cov">' + esc(t(r.extra.undated + ' of these systems state no ready-for-service year; they are counted only today.', 'このうち ' + r.extra.undated + ' 系統は運用開始年の記載が無く、現在の数にだけ含めています。')) + '</div>';
  h += '<div class="nint-foot nint-cov">' + esc(caveat(r, lg)) + '</div>';
  h += '<div class="nint-foot nint-cov">' + esc(sourceLine(r.kind, P.idx, lg)) + '</div>';
  h += '<div class="nst-share"><button type="button" class="nst-link" data-wf="link">' + esc(t('Copy link to this view', 'この表示へのリンクをコピー')) + '</button>'
    + (IntMapTime.isLive() ? '' : ' <button type="button" class="nst-all" data-wf="now">' + esc(t('Back to now', 'いまに戻す')) + '</button>') + '</div>';
  body.innerHTML = h;
}
function chip(attr, v, on, inner) { return '<button type="button" class="nst-chip' + (on ? ' on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' + attr + '="' + esc(v) + '">' + inner + '</button>'; }
function yearWords(r, lg) {
  const t = S(lg);
  if (r.kind === 'cables') return r.year == null ? t('today', '今日') : String(r.year);
  if (r.kind === 'migration') return t('mid-' + r.year, r.year + ' 年央');
  if (r.kind === 'flights') return t('June ' + r.year, r.year + ' 年 6 月');
  return String(r.year);
}
function rowHtml(r, x, k, lg) {
  const t = S(lg), p = _P.rows[x.p];
  const imp = r.kind === 'migration' && r.dir === 'out' && (basisOf(_P.idx.migration, x.p) || {}).imputed;
  const sub = [x.share != null ? pct(x.share) : null, x.onMap ? null : t('not on the map', '地図に出ていません'), imp ? t('imputed by UN DESA', '国連の補完推計') : null, x.names && x.names.length ? x.names.slice(0, 3).join(', ') + (x.names.length > 3 ? ' …' : '') : null].filter(Boolean).join(' · ');
  const w = Math.max(2, Math.round(((r.sum.partners[0] && r.sum.partners[0].v) ? x.v / r.sum.partners[0].v : 0) * 100));
  return '<li><button type="button" class="wf-row" data-wf-p="' + esc(x.p) + '"><span class="wf-rk">' + esc(k + 1) + '</span><span class="wf-n">' + esc(placeName(p, lg)) + '</span><span class="wf-v">' + esc(valueWords(r.kind, x.v, lg)) + '</span>'
    + (sub ? '<span class="wf-s">' + esc(sub) + '</span>' : '') + '<i style="width:' + w + '%;background:' + KIND_COLOUR[r.kind] + '"></i></button></li>';
}
/* the stated total year by year — one bar per year the record states; the bar of the year being read is the app's «now»
   colour; a tap moves the clock to that year */
function chartSvg(r, lg) {
  const t = S(lg), ser = r.series.filter((p) => p.v != null);
  if (ser.length < 2) return '';
  const W = 320, H = 64, max = Math.max(1, ...ser.map((p) => p.v)), bw = W / ser.length;
  let g = '';
  ser.forEach((p, k) => {
    const hgt = p.v ? Math.max(2, Math.round(p.v / max * (H - 4))) : 0;
    const cur = p.y === r.year || (r.year == null && k === ser.length - 1);
    g += '<rect data-wf-year="' + esc(p.y) + '" data-time-intent="1" x="' + (k * bw + 0.5).toFixed(1) + '" y="' + (H - hgt) + '" width="' + Math.max(1, bw - 1.5).toFixed(1) + '" height="' + hgt + '" class="' + (cur ? 'nst-bar-now' : 'nst-bar-past') + '"><title>'
      + esc(p.y + ': ' + valueWords(r.kind, p.v, lg) + ' — ' + t('tap to move the clock here', 'タップで時計をこの年へ')) + '</title></rect>';
  });
  return '<svg class="nst-time wf-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(t('Total by year', '年ごとの合計')) + '">' + g + '</svg>'
    + '<div class="nint-spark-lbl"><span>' + esc(ser[0].y) + '</span><span>' + esc(ser[ser.length - 1].y) + '</span></div>';
}
function paintSuggestions() {
  const ul = pop && pop.querySelector('.wf-sugg'); if (!ul || !_P) return;
  const lg = lang(), hits = searchPlaces(_P, st.q, 8);
  ul.hidden = !hits.length;
  ul.innerHTML = hits.map((i) => '<li><button type="button" data-wf-p="' + esc(i) + '">' + esc(placeName(_P.rows[i], lg) + (lg === 'jp' && _P.rows[i].ja ? ' · ' + _P.rows[i].en : '')) + '</button></li>').join('');
}
function onClick(ev) {
  const el = ev.target && ev.target.closest ? ev.target : null; if (!el) return;
  if (el.closest('[data-wf="close"]')) { closeFlows(); return; }
  const k = el.closest('[data-wf-k]'); if (k) { st.kind = k.getAttribute('data-wf-k'); st.all = false; refresh(); return; }
  const d = el.closest('[data-wf-d]'); if (d) { st.dir = d.getAttribute('data-wf-d'); st.all = false; refresh(); return; }
  const p = el.closest('[data-wf-p]'); if (p) { focus(+p.getAttribute('data-wf-p')); return; }
  const tr = el.closest('[data-wf-trade]'); if (tr && _P && st.i >= 0) { const res = openTrade(_P.rows[st.i].c, tr.getAttribute('data-wf-trade')); if (!res.ok) { try { host.imToast(IntMapLang.t(lang(), 'The Trade flows layer could not be opened', '貿易フローを開けませんでした')); } catch (_) { /* nothing to say it with */ } } return; }
  const y = el.closest('[data-wf-year]'); if (y) { try { IntMapTime.setYear(+y.getAttribute('data-wf-year'), { source: 'world-flows' }); } catch (_) { /* the clock refuses a year it cannot reach */ } return; }
  if (el.closest('[data-wf="all"]')) { st.all = !st.all; draw(null); paint(); return; }
  if (el.closest('[data-wf="now"]')) { try { IntMapTime.setNow({ source: 'world-flows' }); } catch (_) { /* no clock */ } return; }
  if (el.closest('[data-wf="link"]')) copyLink();
}
/** make place `i` the country — from the list, the search, a circle on the map */
function focus(i) {
  if (!_P || !_P.rows[i]) return;
  st.i = i; st.q = ''; st.all = false;
  const q = pop && pop.querySelector('.wf-q'); if (q) q.value = '';
  const ul = pop && pop.querySelector('.wf-sugg'); if (ul) { ul.hidden = true; ul.innerHTML = ''; }
  refresh().then(fit);
}

/* ══ THE LINK — ?wf=<ISO3>.<kind>.<dir> (the map itself rides in the fragment, as every share link) ════════════ */
export function encodeLink(code, kind, dir) { return 'wf=' + encodeURIComponent(code) + '.' + kind + '.' + (DIRECTED[kind] ? dir : 'link'); }
export function decodeLink(s) {
  const raw = String(s || '').replace(/^\?/, '');
  const v = raw.indexOf('=') >= 0 ? new URLSearchParams(raw).get('wf') : raw;
  const m = /^([A-Za-z0-9:]{2,8})\.([a-z]+)\.(in|out|link)$/.exec(decodeURIComponent(v || ''));
  if (!m || !CHIPS.includes(m[2])) return {};
  return { country: m[1], kind: m[2], dir: m[3] === 'link' ? 'out' : m[3] };
}
function link() {
  const me = _P && st.i >= 0 ? _P.rows[st.i] : null; if (!me) return '';
  let h = ''; try { h = MapState.hash(); } catch (_) { h = ''; }
  const q = '?' + encodeLink(me.c, st.kind, st.dir);
  return MapState.pageLink(q, h) || q;
}
async function copyLink() {
  const u = link(); if (!u) return;
  const t = S(lang());
  try { await navigator.clipboard.writeText(u); host.imToast(t('Link to this view copied', 'この表示へのリンクをコピーしました')); }
  catch (_) { try { host.imToast(u); } catch (_) { /* nothing to say it with */ } }
}
/** src/main.js: a page opened with `?wf=…` opens the card once the map can draw; the query is spent */
export async function bootFromUrl() {
  const want = decodeLink(location.search);
  try { const q = new URLSearchParams(location.search); q.delete('wf'); MapState.address(q.toString()); } catch (_) { /* cosmetic */ }
  if (!want.country) return { ok: false, reason: 'bad-link' };
  try { await GE().whenCanDraw(); } catch (_) { /* the card reads without a map */ }
  return openFlows(want);
}

/* ══ THE MAP ═════════════════════════════════════════════════════════════════════════════════════════════════════ */
const SRC = 'wf-src', ARC = 'wf-arc', ARROW = 'wf-arrow', END = 'wf-end', RANK = 'wf-rank', HOME = 'wf-home';
const LAYERS = [ARC, ARROW, END, RANK, HOME];
/* credit the map source carries, so the postcard and the attribution control name the record that drew the arcs */
const CREDIT = { migration: 'UN DESA International Migrant Stock 2024 (CC BY 3.0 IGO)', cables: 'TeleGeography Submarine Cable Map (CC BY-SA 4.0)', flights: 'OpenFlights (ODbL 1.0), June 2014' };
let wired = false, drawnKind = null;
function features() {
  const r = st.r;
  if (!st.open || !r || !r.ok || r.door || !_P) return [];
  const rows = st.all ? r.sum.partners : r.sum.partners.slice(0, SHOW);
  return arcFeatures(_P, Object.assign({}, r.sum, { partners: rows }));
}
function paint() {
  const data = { type: 'FeatureCollection', features: features() };
  const colour = KIND_COLOUR[(st.r && st.r.kind) || st.kind];
  const go = () => {
    try {
      const L = GE().layers;
      const kind = (st.r && st.r.kind) || st.kind;
      /* a source's attribution is fixed when it is added: another flow re-makes it, so the credit names the record that drew the arcs */
      if (L.hasSource(SRC) && drawnKind !== kind) { for (const id of LAYERS) if (L.has(id)) L.remove(id); L.removeSource(SRC); }
      drawnKind = kind;
      if (L.hasSource(SRC)) L.setSourceData(SRC, data);
      else {
        L.addSource(SRC, { type: 'geojson', data, attribution: CREDIT[kind] });
        /* at the top of the stack, under the reader's own pins (js/atlas-map-compose.js measured the need) */
        const before = ['user-pin-shadow', 'user-pin-dot'].find((id) => { try { return !!L.has(id); } catch (_) { return false; } });
        const font = ['literal', ['Noto Sans Regular']];
        L.add({ id: ARC, type: 'line', source: SRC, filter: ['==', ['get', 'k'], 'arc'], layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': colour, 'line-width': ['interpolate', ['linear'], ['get', 'w'], 0, 1, 1, 7], 'line-opacity': ['interpolate', ['linear'], ['get', 'w'], 0, 0.45, 1, 0.9] } }, before);
        L.add({ id: ARROW, type: 'symbol', source: SRC, filter: ['==', ['get', 'k'], 'arc'],
          layout: { 'symbol-placement': 'line', 'symbol-spacing': 140, 'text-field': '›', 'text-font': font, 'text-size': 16, 'text-keep-upright': false, 'text-rotation-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true },
          paint: { 'text-color': colour, 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.1 } }, before);
        L.add({ id: END, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'end'],
          paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'w'], 0, 6, 1, 11], 'circle-color': colour, 'circle-opacity': 0.95, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } }, before);
        L.add({ id: RANK, type: 'symbol', source: SRC, filter: ['==', ['get', 'k'], 'end'],
          layout: { 'text-field': ['to-string', ['get', 'rank']], 'text-font': font, 'text-size': 10.5, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#ffffff' } }, before);
        L.add({ id: HOME, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'home'],
          paint: { 'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-color': colour, 'circle-stroke-width': 4 } }, before);
        wire();
      }
      for (const id of [ARC, ARROW, END, HOME]) if (L.has(id)) { const p = id === ARC ? 'line-color' : id === ARROW ? 'text-color' : id === END ? 'circle-color' : 'circle-stroke-color'; L.setPaint(id, p, colour); }
      for (const id of LAYERS) if (L.has(id)) L.setLayout(id, 'visibility', st.open ? 'visible' : 'none');
      /* ⚠ counted from the map, not from the intention */
      st.painted = L.has(ARC) && st.open ? data.features.filter((f) => f.properties.k === 'arc').length : 0;
    } catch (_) { st.painted = 0; }
  };
  try { if (GE().hasRenderer()) GE().whenCanDraw().then(go); } catch (_) { /* no renderer (Node) */ }
}
function wire() {
  if (wired) return; wired = true;
  try {
    GE().events.onLayer('mouseenter', END, () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { /* cosmetic */ } });
    GE().events.onLayer('mouseleave', END, () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { /* cosmetic */ } });
    GE().events.onLayer('click', END, (ev) => {
      const f = ev && ev.features && ev.features[0]; const code = f && f.properties && f.properties.code;
      if (!code || !_P || !_P.byCode.has(code)) return;
      try { GE().events.claimClick(ev); } catch (_) { /* the tap is the partner's, not the country fill's beneath it */ }
      focus(_P.byCode.get(code));
    });
  } catch (_) { /* no renderer */ }
}
/** frame the country and the partners the map draws (longitudes unwrapped around the country, as the arcs are) */
function fit() {
  const f = features(); if (!f.length) return;
  let w = Infinity, s = 90, e = -Infinity, n = -90;
  for (const x of f) {
    const cs = x.geometry.type === 'Point' ? [x.geometry.coordinates] : x.geometry.coordinates;
    for (const c of cs) { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
  }
  /* Web Mercator ends at ±85.0511° (atan(sinh(π))): a box past it has no camera */
  const LAT = 85.0511;
  const box = [[w, Math.max(-LAT, s)], [e, Math.min(LAT, n)]];
  try {
    const cam = GE().camera, rect = GE().render.canvas().getBoundingClientRect(), pad = clearOfCard(pop, rect);
    /* ⚠ ON A SPHERE, A BOX WIDER THAN THE VISIBLE HEMISPHERE FRAMES A GLOBE SMALLER THAN THE MAP. Measured 2026-10-13 in the
       built app (1440×900, globe): Mexico's partners span 115° of longitude and fitBounds left a globe 300 px across, half
       behind the card. So the camera never goes further out than the globe filling the part of the map the card leaves
       free: MapLibre's world is 512·2^z px around (its tile size), the globe's radius that over 2π, so the zoom at which
       the globe's diameter is D px is log2(π·D / 512). It centres on the country, offset (not padded — `padding` on easeTo
       would stay on the map for every later camera move) into the free part. */
    if (cam.globeness() > 0.5) {
      const D = Math.min(rect.width - pad.left - pad.right, rect.height - pad.top - pad.bottom);
      const zFill = Math.log2(Math.PI * Math.max(1, D) / 512);
      const want = cam.forBounds(box, { padding: pad });
      if (!want || !(want.zoom >= zFill)) {
        const home = f.find((x) => x.properties.k === 'home');
        cam.easeTo({ center: home.geometry.coordinates, zoom: zFill, offset: [(pad.left - pad.right) / 2, (pad.top - pad.bottom) / 2], duration: 900 });
        return;
      }
    }
    cam.fitBounds(box, { padding: pad, duration: 900 });
  } catch (_) { /* no renderer */ }
}
/* the clock moves the readings (one read per settle — a time-lapse frame is a year); a basemap swap drops the layers; a
   language change rewords the card */
let tick = 0;
try { IntMapTime.on(() => { if (!st.open || st.i < 0) return; clearTimeout(tick); tick = setTimeout(() => { if (st.open) refresh(); }, 120); }); } catch (_) { /* no clock */ }
try { GE().events.on('styledata', () => { if (st.open && !GE().layers.hasSource(SRC)) { drawnKind = null; paint(); } }); } catch (_) { /* no renderer */ }
try { bus.on('intmap-lang', () => setTimeout(() => { if (st.open) draw(null); }, 30)); } catch (_) { /* no window */ }

/** summary() — what Atlas and the tests are handed: the choice, the reading and what the map drew */
export function summary() {
  const me = _P && st.i >= 0 ? _P.rows[st.i] : null, r = st.r;
  return { open: st.open, country: me ? me.c : null, kind: st.kind, dir: DIRECTED[st.kind] ? st.dir : 'link', ok: !!(r && r.ok), reason: r && !r.ok ? r.reason : null,
    year: r && r.ok && !r.door ? r.year : null, total: r && r.ok && !r.door ? r.sum.total : null, partners: r && r.ok && !r.door ? r.sum.count : 0, painted: st.painted, link: link() || null };
}

/* ══ ATLAS — `data.worldFlows` (js/atlas-cap-data.js) — the same readings, in sentences, and the same card ═══════════ */
/** `a` = { country, kind?, direction?: 'out'|'in', year?, top?, show? }; K = the Atlas kernel's internals (R, L, warn, note, HOST) */
export async function atlas(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, lg = (K.HOST && K.HOST.lang) || 'en';
  let P;
  try { P = await places(); } catch (_) { return R(false, warn(esc(L('The record of world flows could not be read', '世界とのつながりの記録を読み込めませんでした'))), { meta: { code: 'UNAVAILABLE', category: 'transient', retryable: true, produced: [], userGoalSatisfied: false } }); }
  const i = findPlace(P, a.country);
  if (i < 0) {
    const cands = searchPlaces(P, a.country, 8).map((j) => ({ code: P.rows[j].c, name: placeName(P.rows[j], lg) }));
    return R(false, warn(esc(L('No country in the record by that name', 'その名前の国は記録にありません') + ': ' + (a.country || ''))) + (cands.length ? '<div>' + esc(L('Did you mean: ', '候補: ') + cands.map((c) => c.name + ' (' + c.code + ')').join(', ')) + '</div>' : ''),
      { meta: { code: cands.length ? 'AMBIGUOUS' : 'NOT_FOUND', category: 'input', retryable: false, produced: [], userGoalSatisfied: false, candidates: cands } });
  }
  const kinds = a.kind && CHIPS.includes(a.kind) ? [a.kind] : CHIPS;
  const dir = a.direction === 'in' ? 'in' : 'out';
  const cy = a.year != null && isFinite(+a.year) ? (IntMapTime.isPresentYear(+a.year) ? null : Math.round(+a.year)) : clockYear();
  const top = Math.max(1, Math.min(250, Math.round(+a.top || 10)));
  const name = placeName(P.rows[i], lg);
  const readings = [];
  let html = note('✓ ' + esc(L('World flows — ', '世界とのつながり — ') + name));
  for (const k of kinds) {
    if (k === 'trade') {
      /* goods are the Trade flows layer's: opened on the country when asked to show, and said so either way */
      const opened = a.show && a.kind === 'trade' ? openTrade(P.rows[i].c, dir) : null;
      readings.push({ kind: k, ok: !!(opened && opened.ok), door: 'wp-dl-trade', opened: opened ? opened.ok : false, reason: opened && !opened.ok ? opened.reason : null });
      html += '<div style="margin-top:6px;"><b>' + esc(kindLabel(k, lg)) + '</b> — ' + esc(opened && opened.ok
        ? L('opened the Trade flows layer on ' + name + ' (' + (dir === 'in' ? 'imports' : 'exports') + '); its partners and amounts are read from the OEC (CEPII BACI) as the layer draws them.', name + 'の「貿易フロー」レイヤーを開きました（' + (dir === 'in' ? '輸入' : '輸出') + '）。相手国と金額はレイヤーが OEC（CEPII BACI）から読み込んで描きます。')
        : L('goods trade by partner is the Trade flows layer (wp-dl-trade) — call again with "show":true to open it on ' + name + '.', '相手国別の財の貿易は「貿易フロー」レイヤー（wp-dl-trade）が描きます。"show":true で' + name + 'について開きます。')) + '</div>';
      continue;
    }
    let r;
    try { r = await read(k, i, dir, cy); } catch (_) { r = { ok: false, kind: k, reason: 'unavailable' }; }
    if (!r.ok) { readings.push({ kind: k, ok: false, reason: r.reason, first: r.first || null }); html += '<div><b>' + esc(kindLabel(k, lg)) + '</b>: ' + esc(failureWords(r, lg)) + '</div>'; continue; }
    const s = r.sum;
    const partners = s.partners.slice(0, top).map((x) => Object.assign({ code: x.code, name: placeName(P.rows[x.p], lg), value: x.v, share: x.share != null ? +x.share.toFixed(4) : null, onMap: x.onMap },
      k === 'migration' && r.dir === 'out' ? { imputed: !!(basisOf(P.idx.migration, x.p) || {}).imputed } : {}));
    const basis = k === 'migration' && r.dir === 'in' ? basisOf(P.idx.migration, i) : null;
    readings.push({ kind: k, ok: true, direction: r.dir, year: r.year, unit: ({ migration: 'people', cables: 'cable systems', flights: 'airline routes' })[k], total: k === 'flights' ? s.listed : s.total, partnerCount: s.count, partners,
      notOnMap: s.offMap, basis, caveat: caveat(r, lg), source: sourceLine(k, P.idx, lg) });
    html += '<div style="margin-top:6px;"><b>' + esc(kindLabel(k, lg) + (DIRECTED[k] ? ' · ' + dirLabel(k, r.dir, lg) : '')) + '</b> — ' + esc(headline(r, name, lg)) + '</div>'
      + '<ol style="margin:2px 0 2px 18px;padding:0;">' + partners.slice(0, Math.min(top, 10)).map((x) => '<li>' + esc(x.name + ' — ' + valueWords(k, x.value, lg) + (x.share != null ? ' (' + pct(x.share) + ')' : '')) + '</li>').join('') + '</ol>'
      + '<div style="font-size:12px;color:var(--text-muted);">' + esc(caveat(r, lg) + ' ' + sourceLine(k, P.idx, lg)) + '</div>';
  }
  const did = [];
  if (a.show) {
    if (a.year != null && cy !== clockYear()) { try { if (cy == null) IntMapTime.setNow({ source: 'atlas' }); else IntMapTime.setYear(cy, { source: 'atlas' }); did.push(L('clock at ' + (cy == null ? 'now' : cy), '時計を' + (cy == null ? '現在' : cy + ' 年') + 'へ')); } catch (_) { /* the clock refuses a year it cannot reach */ } }
    const sm = await openFlows({ country: P.rows[i].c, kind: a.kind && CHIPS.includes(a.kind) ? a.kind : kinds[0], dir, lang: () => lg });
    did.push(L('opened World flows (' + sm.painted + ' arcs on the map)', '「世界とのつながり」を表示（地図に ' + sm.painted + ' 本の弧）'));
  }
  const facts = { country: { code: P.rows[i].c, name }, clockYear: cy, readings };
  return R(true, html + (did.length ? '<div>' + esc(did.join(' · ')) + '</div>' : ''), { meta: { worldFlows: facts, resultKey: 'data.worldFlows:' + P.rows[i].c + ':' + kinds.join(',') + ':' + dir + ':' + (cy == null ? 'now' : cy) + (a.show ? ':show' : '') } });
}
