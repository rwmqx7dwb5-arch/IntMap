/* ============================================================================
 *  IntMap · js/year-book.js — THE WORLD IN ONE YEAR, READ OFF THE RECORDS THE MAP DRAWS  (map-layer-system)
 * ----------------------------------------------------------------------------
 *  Chronos moves the whole map to any year since 123000 BC, and what the reader got there was a picture: the
 *  borders of that day, renamed cities, a war's front. Every fact behind the picture was already in the
 *  bundle — which polities were in force, on which days the record changes, which wars it documents, what the
 *  Maddison Project counts — and none of it could be READ. To learn that 1920 holds fourteen border-change
 *  days the reader had to step through them one by one.
 *
 *  This is the year as a page: open it from the Chronos panel (or ask Atlas: `time.yearbook`) and it says,
 *  for the instant on the clock,
 *    · THE MAP OF THE YEAR — how many polities the border record draws, the largest by the area of the drawn
 *      shape, which record answers this instant and what it says about itself (its own `src`);
 *    · WHAT CHANGED — the days inside the year on which the record changes, and on each, who appears, who is
 *      gone and whose shape changed — (time-index-unify) the index's border days (js/time-index.js, the ones «On this
 *      day» states) for the record it carries by the day, the record's own states either side of the day otherwise;
 *    · DATED EVENTS — the events the index carries beside the map's records, as Wikidata states them;
 *    · CONFLICT — the wars data/wars.json documents in force, and its dated events inside the year;
 *    · PEOPLE AND OUTPUT — the Maddison Project's population and GDP per head for the year, where it states them;
 *    · WHAT THE MAP CAN DRAW — how many layers' sources state this instant (js/layer-time-kernel.js).
 *
 *  ⚠ IT SAYS ONLY WHAT A RECORD SAYS, AND WHICH RECORD (.agents/rules/historical-verification.md). The year
 *  book is a reader of the same three records the map draws (js/time-borders.js `collectionAt` — the very call
 *  `go()` draws from), not a fourth source:
 *    · a polity is listed because the border record draws it at this instant, under the record's name;
 *    · an area is the area OF THE DRAWN SHAPE on the sphere, labelled as such — not a statement about a realm;
 *    · a change is a day the record's state differs, read from the record either side of it; for the era
 *      sheets (before 1689) there are no change days, only the sheet years, and the page says so instead of
 *      inventing a day;
 *    · Maddison's figures are by the country codes the Maddison Project uses, which are not the polities on
 *      the map — the page says that too, and shows nothing for a year Maddison does not state.
 *  ⚠ NOTHING HERE IS FETCHED THAT THE MAP DOES NOT ALREADY FETCH, except data/wars.json (the war layers'
 *  own file), which is read only when a war of its record is in force — its spans come from js/layer-time-decl.js.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { TIME } from './layer-time-decl.js';
import { jsonWithin } from './fetch-deadline.js';   /* the app's one clock on a read */
import { clockFor } from './proxy-fetch.js';   /* the war rows' spans, as the time table states them (cited to data/wars.json) */
/* (time-index-unify) the one index of dated events — its records, its year cut, and the reader the page shares with «On this day» */
import { warRecords, records, inYear, loadIndex, eventName, eventDesc, dateWords } from './time-index.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the escaper esc() below reads, in Node as in the app */

const R_EARTH = 6378137;   /* WGS84 equatorial radius (m) — the sphere the ring area below is computed on */
const D2R = Math.PI / 180;
/* the area of one ring on that sphere (m²) — the spherical-excess sum turf.area uses (Chamberlain & Duquette 2007) */
function ringArea(r) {
  let s = 0; const n = r.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    s += (b[0] - a[0]) * D2R * (2 + Math.sin(a[1] * D2R) + Math.sin(b[1] * D2R));
  }
  return Math.abs(s * R_EARTH * R_EARTH / 2);
}
/** the area of a Polygon / MultiPolygon on the sphere, km² (holes subtract) */
export function areaKm2(g) {
  if (!g) return 0;
  const poly = (p) => p.reduce((acc, ring, i) => acc + (i ? -1 : 1) * ringArea(ring), 0);
  const m2 = g.type === 'Polygon' ? poly(g.coordinates) : g.type === 'MultiPolygon' ? g.coordinates.reduce((a, p) => a + poly(p), 0) : 0;
  return Math.max(0, m2 / 1e6);
}
const bboxOf = (g) => {
  let a = 180, b = 90, c = -180, d = -90;
  const walk = (cs) => { for (const x of cs) { if (typeof x[0] === 'number') { if (x[0] < a) a = x[0]; if (x[1] < b) b = x[1]; if (x[0] > c) c = x[0]; if (x[1] > d) d = x[1]; } else walk(x); } };
  try { walk(g.coordinates); } catch (_) { return null; }
  return a <= c ? [a, b, c, d] : null;
};
/** the app's one escaper (js/safe-html.js) */
const esc = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));

/* the stylesheet, injected the first time the module draws — not on the start-up path (css/intmap.css is) */
const CSS = `.yb-sheet{ position:fixed; z-index:var(--z-sheet); top:72px; right:12px; width:min(380px, calc(100vw - 24px)); max-height:calc(100vh - 160px); display:flex; flex-direction:column; border-radius:16px; background:var(--popup-bg); -webkit-backdrop-filter:blur(22px) saturate(1.6); backdrop-filter:blur(22px) saturate(1.6); border:1px solid var(--glass-border,rgba(128,128,128,0.2)); box-shadow:var(--shadow); color:var(--text-main); overflow:hidden; }
.yb-sheet[hidden]{ display:none; }
.yb-head{ display:flex; align-items:center; gap:6px; padding:10px 10px 8px; border-bottom:1px solid rgba(128,128,128,0.16); }
.yb-title{ flex:1; margin:0; font-size:15px; font-weight:700; text-align:center; font-variant-numeric:tabular-nums; }
.yb-step,.yb-x{ flex:none; width:32px; height:32px; border-radius:50%; border:0; background:var(--input-bg); color:var(--text-main); font-size:18px; line-height:1; cursor:pointer; }
.yb-body{ overflow-y:auto; overscroll-behavior:contain; padding:4px 12px 12px; }
.yb-wait{ padding:16px 4px; font-size:12px; color:var(--text-muted); }
.yb-sec{ margin-top:10px; }
.yb-sec h4{ margin:0 0 5px; font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--text-muted); }
.yb-lede{ margin:0 0 6px; font-size:13px; font-weight:600; }
.yb-note{ margin:5px 0 0; font-size:10.5px; color:var(--text-muted); line-height:1.45; }
.yb-list{ list-style:none; margin:0; padding:0; border-radius:10px; overflow:hidden; background:var(--input-bg); }
.yb-row{ display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 8px; width:100%; padding:7px 10px; border:0; border-bottom:1px solid rgba(128,128,128,0.14); background:transparent; color:var(--text-main); text-align:left; font:inherit; cursor:pointer; }
.yb-list li:last-child .yb-row{ border-bottom:0; }
.yb-n{ font-size:12.5px; font-weight:600; flex:1 1 auto; }
.yb-v{ font-size:11px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
.yb-s{ flex-basis:100%; font-size:11px; color:var(--text-muted); line-height:1.35; }
.yb-tab{ width:100%; border-collapse:collapse; font-size:11.5px; margin-top:6px; font-variant-numeric:tabular-nums; }
.yb-tab th{ text-align:left; font-weight:600; color:var(--text-muted); font-size:10.5px; padding:3px 0; }
.yb-tab th:last-child,.yb-tab td:last-child{ text-align:right; }
.yb-tab td{ padding:3px 0; border-top:1px solid rgba(128,128,128,0.12); }
.yb-src{ margin-top:12px; font-size:10px; color:var(--text-muted); line-height:1.4; }
@media (max-width:700px){
  .yb-sheet{ top:auto; right:0; left:0; bottom:0; width:100%; max-height:75vh; border-radius:16px 16px 0 0; padding-bottom:var(--safe-bottom); }
  .yb-row{ min-height:44px; }
  .yb-step,.yb-x{ width:40px; height:40px; }
}`;
function ensureStyle() { if (typeof document === 'undefined' || !document.head || document.getElementById('year-book-css')) return; const st = document.createElement('style'); st.id = 'year-book-css'; st.textContent = CSS; document.head.appendChild(st); }
const isoDay = (d) => { const y = d.getFullYear(); return (y < 0 ? '-' + String(-y).padStart(6, '0') : String(y).padStart(4, '0')) + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/** the name a feature of the record carries, in the reader's language when the record's names table has it */
export const nameIn = (p, lang) => { if (!p) return ''; const i = p._i18n; return String((i && (i[lang] || (lang === 'jp' && i.ja))) || p.NAME || p.name || '').trim(); };

/**
 * Read one instant. `deps` are the readers the page already has (each optional — a missing one is a section
 * that says it could not be read, never an invented one):
 *   borders  js/time-borders.js (window.IntMapTimeBorders)   maddison  window.IntMapMaddison
 *   wars     () => the data/wars.json object                  layerTime window.IntMapLayerTime
 *   lang     () => the reader's language                      countryName (code) => a name
 *   index    () => the index of dated events (js/time-index.js loadIndex) — the change days of a record it carries by
 *            the day, and the dated events beside the map's records
 * @param {Date} when @param {any} deps @param {{ top?: number, maxDays?: number }} [opts]
 */
export async function readYear(when, deps, opts) {
  const o = opts || {}, top = o.top || 12, maxDays = o.maxDays || 31;
  const lang = (deps.lang && deps.lang()) || 'en';
  const year = when.getFullYear();
  const out = { at: { iso: isoDay(when), year }, borders: null, changes: null, conflicts: null, economy: null, layers: null, sources: [] };

  /* ── the map of the year ── */
  const TB = deps.borders;
  if (TB && TB.collectionAt) {
    try {
      const c = await TB.collectionAt(when);
      if (c && c.modern) out.borders = { modern: true };
      else if (c && c.fc) {
        const feats = c.fc.features.filter((f) => nameIn(f.properties, 'en'));
        const rows = feats.map((f) => ({ name: nameIn(f.properties, lang), en: nameIn(f.properties, 'en'), km2: Math.round(areaKm2(f.geometry)), bbox: bboxOf(f.geometry),
          subjectTo: (f.properties && (f.properties.SUBJECTO || f.properties.PARTOF)) || null }));
        /* one polity drawn as several features (an empire and its exclaves) is one line, its areas summed */
        const by = new Map();
        for (const r of rows) { const k = r.en; const was = by.get(k); if (!was) by.set(k, Object.assign({ parts: 1 }, r)); else { was.km2 += r.km2; was.parts++; if (r.bbox && was.bbox) was.bbox = [Math.min(was.bbox[0], r.bbox[0]), Math.min(was.bbox[1], r.bbox[1]), Math.max(was.bbox[2], r.bbox[2]), Math.max(was.bbox[3], r.bbox[3])]; } }
        const list = [...by.values()].sort((a, b) => b.km2 - a.km2);
        /* (hist-coverage-expansion) a realm (Cliopatria's «(Holy Roman Empire)») is the union of polities also listed — its area is not counted twice */
        const realms = new Set(feats.filter((f) => f.properties && f.properties._realm).map((f) => nameIn(f.properties, 'en')));
        const total = list.reduce((s, r) => s + (realms.has(r.en) ? 0 : r.km2), 0);
        /* (hist-coverage-expansion) a composed answer names its own records; the tier alone cannot say which */
        const rec = c.record || (TB.recordOf ? TB.recordOf(c.tier) : null);
        out.borders = { modern: false, tier: c.tier, count: list.length, unnamed: c.fc.features.length - feats.length, totalKm2: total, largest: list.slice(0, top), record: rec };
        if (rec && rec.src) out.sources.push(rec.src);
      }
    } catch (_) { out.borders = { failed: true }; }
  }

  /* ── the index of dated events (js/time-index.js) — read once, for the change days and the dated events below ── */
  let IX = null;
  if (deps.index) { try { IX = await deps.index(); } catch (_) { IX = null; } }

  /* ── what changed inside the year ──
     (time-index-unify) For a record the index carries BY THE DAY (its `dayRecords`: CShapes), the change days ARE the
     index's records of the year — the one rule «On this day» states them by (scripts/build-on-this-day.mjs: a polity
     the record itself has an edge for, a redrawing of at least 1 km², the 1 January days marked), so the year book and
     the calendar cannot disagree about which days and which polities. The names are the ones the map WRITES on the
     outlines that day (the index's, en and jp): the record's own row names are often today's — CShapes calls British
     East Africa «Kenya» in 1919, so reading them made 1920-07-23 «Kenya ends, Kenya begins». In another language, the
     drawn feature's own name for the same state-system code (the day itself for what begins or is redrawn, the day
     before for what ends). For a record the index
     does not carry by the day (OpenHistoricalMap, 1689–1885: its dates are written as days but it does not vouch for
     them — the index's header gives the measurement), the days are read off the record as before and marked `stated:
     false`, and the page says to read them as the year. */
  if (TB && TB.changeDates && out.borders && !out.borders.modern && !out.borders.failed) {
    const P0 = out.borders.tier === 'composite' && out.borders.record && out.borders.record.parts && out.borders.record.parts[0];
    const dayTier = P0 ? P0.tier : out.borders.tier;
    try {
      if (out.borders.tier === 'snapshot') out.changes = { kind: 'sheets', days: [], note: 'sheet' };
      /* (hist-coverage-expansion) a composed answer's days are its FIRST record's — CShapes under which Cliopatria fills
         the ground CShapes leaves; Cliopatria's own edges state years, which this per-day list does not claim */
      else if (IX && Array.isArray(IX.dayRecords) && IX.dayRecords.includes(dayTier)) {
        const recs = inYear(records(IX), year).filter((r) => r.src === dayTier);
        const days = [];
        const gwNames = (fc, m) => { for (const f of (fc && fc.features) || []) { const p = f.properties || {}; if (p._gw != null && !m.has(+p._gw)) { const n = nameIn(p, lang); if (n) m.set(+p._gw, n); } } return m; };
        for (const r of recs.slice(0, maxDays)) {
          const [y, mo, d] = r.d.split('-').map(Number);
          const at = new Date(0); at.setUTCFullYear(y, mo - 1, d); at.setUTCHours(12, 0, 0, 0);   /* the instant js/time-borders.js changeDates gives a day */
          /* a state-system code can name two rows either side of the day (British East Africa → Kenya), so what begins or is
             redrawn is named by the day itself and what ends by the day before */
          const onDay = new Map(), dayBefore = new Map();
          if (lang !== 'en' && lang !== 'jp' && TB.collectionAt) { gwNames((await TB.collectionAt(at) || {}).fc, onDay); gwNames((await TB.collectionAt(new Date(at.getTime() - 86400000)) || {}).fc, dayBefore); }
          const nm = (m) => (p) => (lang === 'jp' ? p.jp || p.en : lang === 'en' ? p.en : ((p.gw || []).map((g) => m.get(g)).find(Boolean)) || p.en);
          days.push({ date: r.d, ms: at.getTime(), appeared: (r.appeared || []).map(nm(onDay)), ended: (r.ended || []).map(nm(dayBefore)), reshaped: (r.redrawn || []).map(nm(onDay)), maybeYearOnly: !!r.maybeYearOnly });
        }
        out.changes = { kind: 'days', days, more: Math.max(0, recs.length - maxDays), stated: true };
      } else {
        const all = await TB.changeDates();
        const ofYear = all.filter((d) => d instanceof Date && d.getFullYear() === year);
        const days = [];
        const nameSet = (fc) => { const m = new Map(); for (const f of (fc && fc.features) || []) { const n = nameIn(f.properties, 'en'); if (n && !m.has(n)) m.set(n, { geom: f.geometry, local: nameIn(f.properties, lang) }); } return m; };
        for (const d of ofYear.slice(0, maxDays)) {
          const before = await TB.collectionAt(new Date(d.getTime() - 86400000)), after = await TB.collectionAt(d);
          if (!before || !after || !before.fc || !after.fc) continue;
          const A = nameSet(before.fc), B = nameSet(after.fc);
          const appeared = [...B.keys()].filter((k) => !A.has(k)).map((k) => B.get(k).local);
          const ended = [...A.keys()].filter((k) => !B.has(k)).map((k) => A.get(k).local);
          const reshaped = [...B.keys()].filter((k) => A.has(k) && A.get(k).geom !== B.get(k).geom).map((k) => B.get(k).local);
          /* (hist-coverage-expansion) a change the record dates to the year alone is printed as the year */
          const prec = TB.changePrecision ? TB.changePrecision(d) : 'day';
          days.push({ date: prec === 'year' ? isoDay(d).replace(/-01-01$/, '') : isoDay(d), prec, ms: d.getTime(), appeared, ended, reshaped });
        }
        out.changes = { kind: 'days', days, more: Math.max(0, ofYear.length - maxDays), stated: false };
      }
    } catch (_) { out.changes = { failed: true }; }
  }

  /* ── (time-index-unify) the dated events the index carries beside the map's records — as Wikidata states them, each
        with the property that dated it and its precision. Not every event of the year: the ones the index holds. ── */
  if (IX && Array.isArray(IX.events)) {
    const ev = inYear(IX.events, year);
    out.dated = { events: ev.map((r) => ({ date: r.d, words: dateWords(r, lang), name: eventName(r, lang), desc: eventDesc(r, lang), at: r.at || null, kind: r.kind || '', q: r.q, prop: r.prop, prec: r.prec, cal: r.cal || null })) };
    if (ev.length && IX.src && IX.src.wikidata) out.sources.push(IX.src.wikidata);
  }

  /* ── conflict: the wars the record documents ── */
  if (deps.wars) {
    try {
      const W = await deps.wars(year);
      if (W && Array.isArray(W.wars)) {
        const y0 = year * 10000 + 101, y1 = year * 10000 + 1231;
        const num = (s) => +String(s || '').replace(/-/g, '');
        const wars = W.wars.filter((w) => num(w.from) <= y1 && num(w.to) >= y0);
        /* (time-index-unify) the war record's events are the index's war records (js/time-index.js warRecords — the
           reading the index builder makes of this same file), cut by year; here in every language the record writes */
        const inForce = new Map(wars.map((w) => [w.id, w]));
        const events = inYear(warRecords({ wars }), year).filter((r) => inForce.has(r.war)).map((r) => {
          const w = inForce.get(r.war);
          return { date: r.d, to: r.d2 || null, name: (r.name && (r.name[lang] || r.name.en)) || '', kind: r.kind || '', at: r.at || null, war: (w.name && (w.name[lang] || w.name.en)) || w.id };
        });
        out.conflicts = { wars: wars.map((w) => ({ id: w.id, name: (w.name && (w.name[lang] || w.name.en)) || w.id, from: w.from, to: w.to })), events };
        if (wars.length && W.src) out.sources.push(W.src);
      }
    } catch (_) { out.conflicts = { failed: true }; }
  }

  /* ── people and output: the Maddison Project, where it states the year ── */
  const M = deps.maddison;
  if (M && M.load) {
    try {
      const data = await M.load();
      const codes = Object.keys(data || {});
      const rows = [];
      for (const c of codes) { const pop = M.popN(c, year), pc = M.gdppc(c, year); if (pop != null || pc != null) rows.push({ code: c, name: deps.countryName ? deps.countryName(c) : c, pop, gdppc: pc }); }
      if (rows.length) {
        const withPop = rows.filter((r) => r.pop != null).sort((a, b) => b.pop - a.pop);
        const withPc = rows.filter((r) => r.gdppc != null).sort((a, b) => b.gdppc - a.gdppc);
        out.economy = { year, countries: rows.length, popStated: withPop.length, popSum: withPop.reduce((s, r) => s + r.pop, 0), byPop: withPop.slice(0, 8), byGdppc: withPc.slice(0, 8), gdppcStated: withPc.length };
        out.sources.push('Maddison Project Database 2020 (Bolt & van Zanden 2020)');
      } else out.economy = { year, countries: 0, floor: M.minYear, ceil: M.maxYear };
    } catch (_) { out.economy = { failed: true }; }
  }

  /* ── what the map at this instant can draw ── */
  const LT = deps.layerTime;
  if (LT && LT.coverage) {
    try {
      const c = await LT.coverage(isoDay(when));
      if (c) out.layers = { stated: c.stated.length, carried: c.carried.length, unstated: c.unstated.length, unknown: c.unknown.length, statedNames: c.stated.map((r) => r.name) };
    } catch (_) { out.layers = { failed: true }; }
  }
  return out;
}

/* ══ THE PAGE ═════════════════════════════════════════════════════════════════════════════════ */
let sheet = null, seq = 0, unsub = null, hostRef = null, timer = 0;

/** open the year book for the clock's instant; it follows the clock until it is closed
    @param {any} host { lang, time (the master clock), deps () => readYear's deps, escape, flyTo(bbox|[lng,lat]) } */
function openYearBook(host) {
  hostRef = host;
  ensureStyle();
  if (!sheet) {
    sheet = document.createElement('section');
    sheet.id = 'yb-sheet'; sheet.className = 'yb-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'false');
    sheet.addEventListener('click', onClick);
    document.body.appendChild(sheet);
  }
  sheet.hidden = false;
  if (!unsub && host.time && host.time.on) unsub = host.time.on(() => { clearTimeout(timer); timer = setTimeout(paint, 250); });
  paint();
  return { close: closeYearBook };
}
function closeYearBook() {
  if (sheet) sheet.hidden = true;
  if (unsub) { try { unsub(); } catch (_) { /* already gone */ } unsub = null; }
}

async function paint() {
  if (!sheet || sheet.hidden || !hostRef) return;
  const H = hostRef, my = ++seq;
  const t = (en, jp) => IntMapLang.t(H.lang(), en, jp);
  const when = H.time.when();
  const yl = yearLabel(when.getFullYear(), t);
  sheet.innerHTML = head(H, t, yl) + '<div class="yb-body"><div class="yb-wait">' + esc(t('Reading the records for ' + yl + '…', yl + ' の記録を読んでいます…')) + '</div></div>';
  const r = await readYear(when, H.deps());
  if (my !== seq || !sheet || sheet.hidden) return;
  sheet.innerHTML = head(H, t, yl) + '<div class="yb-body">' + body(r, H, t) + '</div>';
}
const yearLabel = (y, t) => (y <= 0 ? t((1 - y) + ' BC', '紀元前' + (1 - y) + '年') : t(String(y), y + '年'));
function head(H, t, yl) {
  const e = esc;
  return '<header class="yb-head"><button type="button" class="yb-step" data-step="-1" aria-label="' + e(t('Previous year', '前の年')) + '">‹</button>'
    + '<h3 class="yb-title">' + e(t('The world in ' + yl, yl + 'の世界')) + '</h3>'
    + '<button type="button" class="yb-step" data-step="1" aria-label="' + e(t('Next year', '次の年')) + '">›</button>'
    + '<button type="button" class="yb-x" data-act="close" aria-label="' + e(t('Close', '閉じる')) + '">×</button></header>';
}
const fmtInt = (n) => Math.round(n).toLocaleString();
function body(r, H, t) {
  const e = esc; let h = '';
  const sec = (title, inner) => '<section class="yb-sec"><h4>' + e(title) + '</h4>' + inner + '</section>';
  /* the map */
  const B = r.borders;
  if (!B) h += sec(t('The map', '地図'), '<p class="yb-note">' + e(t('The border record could not be asked.', '国境の記録に問い合わせできませんでした。')) + '</p>');
  else if (B.failed) h += sec(t('The map', '地図'), '<p class="yb-note">' + e(t('The border record did not answer for this instant.', 'この時点について国境の記録が答えませんでした。')) + '</p>');
  else if (B.modern) h += sec(t('The map', '地図'), '<p class="yb-note">' + e(t('This instant is drawn with today’s borders — the historical records end before it.', 'この時点は現在の国境で描かれます（歴史的な記録はこれより前で終わります）。')) + '</p>');
  else {
    const tierW = B.tier === 'cshapes' ? t('day by day', '日単位') : B.tier === 'ohm' ? t('day by day', '日単位')
      : B.tier === 'composite' ? t('several records composed, the more precise first, each where the ones before it are silent', '複数の記録を精度の順に重ね、前の記録が述べない土地にだけ次を描く')
      : t('one sheet for the period', 'その時期の1枚');
    h += sec(t('The map', '地図'), '<p class="yb-lede">' + e(t(B.count + ' polities are drawn', B.count + ' の政体が描かれています')) + (B.unnamed ? e(t(' · ' + B.unnamed + ' shapes the record leaves unnamed', '・名前のない形 ' + B.unnamed)) : '') + '</p>'
      + '<ol class="yb-list">' + B.largest.map((p) => '<li><button type="button" class="yb-row" data-bbox="' + e(JSON.stringify(p.bbox || null)) + '"><span class="yb-n">' + e(p.name) + '</span><span class="yb-v">' + e(fmtInt(p.km2)) + ' km²</span>'
        + (p.subjectTo ? '<span class="yb-s">' + e(t('under ', '従属先: ') + p.subjectTo) + '</span>' : '') + '</button></li>').join('') + '</ol>'
      + '<p class="yb-note">' + e(t('Largest by the area of the shape drawn (computed on the sphere). The record answering this instant (' + tierW + '): ', '描かれた形の面積（球面で計算）の大きい順。この時点に答えている記録（' + tierW + '）: ')) + e((B.record && B.record.src) || B.tier) + '</p>');
  }
  /* the changes */
  const C = r.changes;
  if (C && C.kind === 'days') {
    h += sec(t('What changed on the map', '地図の変化'), C.days.length
      ? '<ol class="yb-list">' + C.days.map((d) => '<li><button type="button" class="yb-row yb-day" data-ms="' + e(d.ms) + '"><span class="yb-n">' + e(d.date) + '</span>'
        + (d.appeared.length ? '<span class="yb-s">' + e(t('appears: ', '現れる: ') + d.appeared.join(t(', ', '、'))) + '</span>' : '')
        + (d.ended.length ? '<span class="yb-s">' + e(t('gone: ', '消える: ') + d.ended.join(t(', ', '、'))) + '</span>' : '')
        + (d.reshaped.length ? '<span class="yb-s">' + e(t('new borders: ', '国境が変わる: ') + d.reshaped.join(t(', ', '、'))) + '</span>' : '') + '</button></li>').join('') + '</ol>'
        + (C.more ? '<p class="yb-note">' + e(t('and ' + C.more + ' more days', 'ほか ' + C.more + ' 日')) + '</p>' : '')
        + '<p class="yb-note">' + e(t('Days on which the border record’s state differs from the day before. Tap a day to go there.', '国境の記録の状態が前日と異なる日。日付を押すとその日へ移動します。')) + '</p>'
        + (C.stated === false ? '<p class="yb-note">' + e(t('This record writes its dates as days but does not vouch for them as days — many fall on the 1st of a month — so read them as the year.', 'この記録は日付を日単位で書いていますが、日単位であることを保証していません（多くが月の1日です）。年として読んでください。')) + '</p>' : '')
        + (C.days.some((d) => d.maybeYearOnly) ? '<p class="yb-note">' + e(t('A 1 January day may be a year the record states as its first day.', '1月1日の日付は、記録が年だけを述べている場合があります。')) + '</p>' : '')
      : '<p class="yb-note">' + e(t('The border record does not change during this year.', 'この年の間、国境の記録は変わりません。')) + '</p>');
  } else if (C && C.kind === 'sheets') {
    h += sec(t('What changed on the map', '地図の変化'), '<p class="yb-note">' + e(t('Before 1689 the record is a series of sheets, one per period — it states no day on which a border moved, so none is given here.', '1689 年より前の記録は時期ごとの 1 枚で、国境が動いた日を述べていません。そのためここでも日付は示しません。')) + '</p>');
  }
  /* conflict */
  const W = r.conflicts;
  if (W && W.wars && W.wars.length) {
    h += sec(t('Wars in the record', '記録にある戦争'), '<p class="yb-lede">' + e(W.wars.map((w) => w.name + ' (' + w.from + ' – ' + w.to + ')').join(' · ')) + '</p>'
      + (W.events.length ? '<ol class="yb-list">' + W.events.slice(0, 40).map((ev) => '<li><button type="button" class="yb-row" data-at="' + e(JSON.stringify(ev.at || null)) + '"><span class="yb-n">' + e(ev.date + (ev.to ? ' – ' + ev.to : '')) + '</span><span class="yb-s">' + e(ev.name) + '</span></button></li>').join('') + '</ol>'
        + (W.events.length > 40 ? '<p class="yb-note">' + e(t('and ' + (W.events.length - 40) + ' more events', 'ほか ' + (W.events.length - 40) + ' 件')) + '</p>' : '') : '')
      + '<p class="yb-note">' + e(t('Only the wars IntMap’s war record documents day by day — not every conflict of the year.', 'IntMap の戦争記録が日単位で扱う戦争だけです（この年のすべての紛争ではありません）。')) + '</p>');
  }
  /* (time-index-unify) the dated events the index carries beside the map's records */
  const DV = r.dated;
  if (DV && DV.events && DV.events.length) {
    h += sec(t('Dated events', '日付のある出来事'), '<ol class="yb-list">' + DV.events.map((ev) => '<li><button type="button" class="yb-row" data-at="' + e(JSON.stringify(ev.at || null)) + '"><span class="yb-n">' + e(ev.name) + '</span><span class="yb-v">' + e(ev.words) + '</span>'
      + (ev.desc ? '<span class="yb-s">' + e(ev.desc) + '</span>' : '') + '</button></li>').join('') + '</ol>'
      + '<p class="yb-note">' + e(t('As Wikidata states them — the date to the precision it gives, and the place where it gives one. Only the events IntMap’s index carries, not every event of the year.', 'Wikidata の記述どおり（日付は Wikidata が示す精度で、場所は示されている場合のみ）。IntMap の索引にある出来事だけで、この年のすべての出来事ではありません。')) + '</p>');
  }
  /* economy */
  const E = r.economy;
  if (E && E.countries) {
    h += sec(t('People and output', '人口と経済'), '<p class="yb-lede">' + e(t('Population stated for ' + E.popStated + ' countries, together ' + fmtInt(E.popSum / 1e6) + ' million', E.popStated + ' か国の人口が示され、合計 ' + fmtInt(E.popSum / 1e6) + ' 百万人')) + '</p>'
      + '<table class="yb-tab"><thead><tr><th>' + e(t('Most populous', '人口の多い国')) + '</th><th>' + e(t('million', '百万人')) + '</th></tr></thead><tbody>'
      + E.byPop.map((x) => '<tr><td>' + e(x.name) + '</td><td>' + e((x.pop / 1e6).toFixed(1)) + '</td></tr>').join('') + '</tbody></table>'
      + (E.byGdppc.length ? '<table class="yb-tab"><thead><tr><th>' + e(t('Highest GDP per head', '1人当たりGDPの高い国')) + '</th><th>2011 int$</th></tr></thead><tbody>'
        + E.byGdppc.map((x) => '<tr><td>' + e(x.name) + '</td><td>' + e(fmtInt(x.gdppc)) + '</td></tr>').join('') + '</tbody></table>' : '')
      + '<p class="yb-note">' + e(t('Maddison Project Database 2020. Its figures are kept by country code, not by the polities drawn on the map, and the total is the sum of the countries it states — not a world population.', 'Maddison Project Database 2020。数値は国コードごとで、地図に描かれた政体ごとではありません。合計は示されている国の和であり、世界人口ではありません。')) + '</p>');
  } else if (E && E.countries === 0) {
    h += sec(t('People and output', '人口と経済'), '<p class="yb-note">' + e(t('The Maddison Project figures shipped with IntMap cover ' + E.floor + '–' + E.ceil + '; this year is outside them.', 'IntMap に同梱の Maddison Project の数値は ' + E.floor + '〜' + E.ceil + ' 年で、この年は範囲外です。')) + '</p>');
  }
  /* layers */
  const L = r.layers;
  if (L && !L.failed) {
    const n = L.stated + L.carried + L.unstated + L.unknown;
    h += sec(t('What the map can draw', '地図に描けるもの'), '<p class="yb-lede">' + e(t(L.stated + ' of ' + n + ' layers have a source that states this instant', n + ' 件中 ' + L.stated + ' 件のレイヤーは、この時点を述べる典拠があります')) + (L.carried ? e(t(' · ' + L.carried + ' show another date', '・' + L.carried + ' 件は別の時点を表示')) : '') + '</p>'
      + '<p class="yb-note">' + e(L.statedNames.slice(0, 30).join(t(', ', '、'))) + (L.statedNames.length > 30 ? e(t(' …', ' …')) : '') + '</p>');
  }
  if (r.sources.length) h += '<footer class="yb-src">' + e(t('Sources: ', '出典: ')) + e([...new Set(r.sources)].join(' · ')) + '</footer>';
  return h;
}
function onClick(ev) {
  const b = ev.target && ev.target.closest && ev.target.closest('button'); if (!b || !hostRef) return;
  const H = hostRef;
  if (b.dataset.act === 'close') { closeYearBook(); return; }
  if (b.dataset.step) { const y = H.time.year() + (+b.dataset.step); try { H.time.setYear(y, { source: 'ui' }); } catch (_) { /* outside the clock */ } return; }
  if (b.dataset.ms) { try { H.time.set(new Date(+b.dataset.ms), { source: 'ui' }); } catch (_) { /* outside the clock */ } return; }
  try {
    const bb = b.dataset.bbox ? JSON.parse(b.dataset.bbox) : null, at = b.dataset.at ? JSON.parse(b.dataset.at) : null;
    if (bb || at) H.flyTo(bb || at);
  } catch (_) { /* nothing to fly to */ }
}

/* ══ THE DOOR FROM THE CHRONOS PANEL AND FROM ATLAS — the readers the page already has, handed over ══════════════ */
/* the years the war record covers, from the rows that cite it (js/layer-time-decl.js `war(…)` — the gate holds each
   span to the file), so data/wars.json (954 kB) is read only for a year inside one of them */
const WAR_SPANS = Object.values(TIME).filter((d) => d && d.cite && String(d.cite.from || '').startsWith('data/wars.json'))
  .map((d) => [+String(d.from).slice(0, 4), +String(d.to).slice(0, 4)]);
let _wars = null;
function warsFor(year) {
  if (!WAR_SPANS.some(([a, b]) => year >= a - 1 && year <= b)) return Promise.resolve(null);   /* a war's record opens on events dated the year before its first day */
  if (!_wars) _wars = jsonWithin('data/wars.json', clockFor('data/wars.json')).catch(() => { _wars = null; return null; });
  return _wars;
}
/** the deps readYear takes, from the page */
export function pageDeps(h) {
  return {
    borders: window.IntMapTimeBorders, maddison: window.IntMapMaddison, layerTime: window.IntMapLayerTime, lang: h.lang, wars: warsFor, index: loadIndex,
    countryName: (code) => { try { const s = h.countryStats && h.countryStats()[code]; if (s) return (h.lang() === 'jp' ? (s.nameJp || s.nameEn) : s.nameEn) || code; } catch (_) { /* below */ } return code; },
  };
}
const flyTo = (x) => {
  try {
    if (Array.isArray(x) && x.length === 4) IntMapGeoEngine.camera.fitBounds([[x[0], x[1]], [x[2], x[3]]], { padding: 40, duration: 900, maxZoom: 6 });
    else if (Array.isArray(x) && x.length === 2) IntMapGeoEngine.camera.flyTo({ center: x, zoom: Math.max(5, IntMapGeoEngine.camera.getZoom()), duration: 900 });
  } catch (_) { /* no renderer */ }
};
/** open the year book from a panel button or Atlas. `h` = { lang, countryStats, escape } */
export function openFromPage(h) {
  return openYearBook({ lang: h.lang, time: IntMapTime, escape: h.escape, flyTo, deps: () => pageDeps(h) });
}

/** the year as Atlas's answer — the same reading, in sentences (js/atlas-cap-time.js `time.yearbook`). Here, beside the page,
    so the two say the same things and Atlas's chunk does not carry them. `lang` is the reader's language; `note` is Atlas's own mark. */
export function atlasHtml(r, when, show, lang, note) {
  const t = (en, jp) => IntMapLang.t(lang, en, jp);
  const yl = when.getFullYear() <= 0 ? t((1 - when.getFullYear()) + ' BC', '紀元前' + (1 - when.getFullYear()) + '年') : String(when.getFullYear());
  let out = note('✓ ' + t('The world in ' + yl, yl + '年の世界')) + (show ? ' — ' + esc(t('opened in the Chronos panel', 'Chronos パネルに表示しました')) : '');
  const B = r.borders;
  if (B && B.modern) out += '<div>' + esc(t('Drawn with today’s borders (the historical records end before this instant).', '現在の国境で描かれます（歴史的な記録はこれより前で終わります）。')) + '</div>';
  else if (B && !B.failed) out += '<div>' + esc(t('Border record: ', '国境の記録: ')) + esc((B.record && B.record.src) || B.tier) + ' · ' + B.count + esc(t(' polities drawn. Largest by drawn area: ', ' の政体。描かれた面積の大きい順: '))
    + B.largest.slice(0, 10).map((p) => esc(p.name) + ' ' + Math.round(p.km2).toLocaleString() + ' km²' + (p.subjectTo ? ' (' + esc(t('under ', '従属先 ') + p.subjectTo) + ')' : '')).join(' · ') + '</div>';
  const C = r.changes;
  if (C && C.kind === 'days') out += '<div>' + esc(t('Days the border record changes in this year: ', 'この年に国境の記録が変わる日: ')) + (C.days.length ? C.days.map((d) => esc(d.date) + (d.appeared.length ? ' +' + esc(d.appeared.join(', ')) : '') + (d.ended.length ? ' −' + esc(d.ended.join(', ')) : '') + (d.reshaped.length ? ' ~' + esc(d.reshaped.join(', ')) : '')).join(' | ') : esc(t('none', 'なし'))) + (C.more ? esc(t(' (and ' + C.more + ' more)', '（ほか ' + C.more + ' 日）')) : '') + (C.stated === false ? esc(t(' (this record does not vouch for these as days; read them as the year)', '（この記録は日単位であることを保証していません。年として読んでください）')) : '') + '</div>';
  else if (C && C.kind === 'sheets') out += '<div>' + esc(t('Before 1689 the border record is one sheet per period and states no change days.', '1689 年より前の国境の記録は時期ごとの 1 枚で、変化の日を述べていません。')) + '</div>';
  const W = r.conflicts;
  if (W && W.wars && W.wars.length) out += '<div>' + esc(t('Wars in IntMap’s war record: ', 'IntMap の戦争記録にある戦争: ')) + W.wars.map((w) => esc(w.name)).join(' · ') + ' — ' + W.events.slice(0, 25).map((e) => esc(e.date + ' ' + e.name)).join(' | ') + (W.events.length > 25 ? esc(t(' …', ' …')) : '') + '</div>';
  const DV = r.dated;
  if (DV && DV.events && DV.events.length) out += '<div>' + esc(t('Dated events (Wikidata): ', '日付のある出来事（Wikidata）: ')) + DV.events.slice(0, 25).map((x) => esc(x.words + ' ' + x.name)).join(' | ') + (DV.events.length > 25 ? esc(t(' …', ' …')) : '') + '</div>';
  const E = r.economy;
  if (E && E.countries) out += '<div>' + esc(t('Maddison Project (by country code, not polity): population stated for ' + E.popStated + ' countries, ', 'Maddison Project（国コード別・政体別ではない）: ' + E.popStated + ' か国の人口、')) + E.byPop.slice(0, 6).map((x) => esc(x.name) + ' ' + (x.pop / 1e6).toFixed(1) + 'M').join(' · ') + '</div>';
  const Ly = r.layers;
  if (Ly && !Ly.failed) out += '<div>' + esc(t(Ly.stated + ' layers have a source stating this instant', Ly.stated + ' のレイヤーにこの時点を述べる典拠があります')) + '</div>';
  return out;
}
