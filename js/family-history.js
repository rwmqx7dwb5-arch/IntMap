/* ============================================================================
 *  IntMap · js/family-history.js — FAMILY HISTORY ACROSS BORDERS   (wave4-history)
 * ----------------------------------------------------------------------------
 *  A family historian holds dates and place names: «born 12 March 1905 in Lemberg». What they cannot easily know is
 *  what that ground WAS on that day — which state, which province — and how often the state over it changed while the
 *  person lived there. IntMap holds exactly that, by the day, for the whole world: the historical border records the era
 *  map draws (CShapes 2.0 by the day from 1886, OpenHistoricalMap from 1689, Cliopatria before) and the first-level
 *  divisions under them. «This place through time» (js/place-history.js) reads them for one point. This page reads them
 *  for a FAMILY:
 *    · every event of every person (typed in, or read from a GEDCOM file — js/gedcom.js) is read at its own day, in
 *      the calendar the file states: the polity and the first-level division the records draw over its place THEN,
 *      each with the record that says so — and when the date is only a year (or a month, or «between») and the records
 *      change inside it, the page says that, with the days;
 *    · for each person, «during this life»: what the map draws over each of their places from birth to death, and the
 *      changes inside that span (Lemberg 1880–1952 is Austria-Hungary, Austria, Poland, the Soviet Union — the page lists
 *      them with their days and records), and «Play this life» runs the clock through exactly those days on the map;
 *    · the events are dots on the map; «Go» moves the clock to the day and the map to the place.
 *
 *  ══ NOTHING ABOUT HISTORY IS DECIDED HERE ══════════════════════════════════════════════════════════════════════════
 *    What holds a point at an instant, how an edge is worded (a record's reach, a handover, a sheet) and which record
 *    says so are js/place-history.js's (`placeHistory`, `nowAt`, `changesOf`, `changeText`, `entryWords`, `unitWords`)
 *    — the same reading as the place card, so the two pages cannot disagree. This file adds the reader's dates and
 *    places, and one count: the instants inside a life at which the set of polities the map draws over the place differs
 *    (a change where every edge is a record's — a handover or a reach — is listed as a change of record, not counted).
 *  ══ A PLACE IS LOCATED ONLY WHEN ONE PLACE ANSWERS (.agents/rules/one-pass-or-a-reason.md) ════════════════════════
 *    A file's coordinates (PLAC.MAP) are used as written. A name is asked of the readers that already exist on the
 *    device — the gazetteer (`local`, the search's own `localFuzzyPlaces`) and the historical city names and Pleiades
 *    (js/where-when.js `histCandidates`, so «Lemberg» and «Königsberg» find their cities) — part by part from the
 *    smallest (a file writes «village, county, country»). Exactly one place that IS the name is applied, and the page
 *    says which part found it; several are offered to choose from; none leaves the event unlocated with «pick it on the
 *    map». A country is never a place: its centre is not where anyone was born.
 *  ══ PRIVATE BY CONSTRUCTION ═══════════════════════════════════════════════════════════════════════════════════════
 *    The people, the dates and the places stay in this browser (localStorage `intmap_family_v1`): no request carries
 *    them — the records and gazetteers are files the app already downloads, read on the device. Atlas sees none of it
 *    unless the reader types it to Atlas. The privacy policy says so (js/legal-text.js).
 *  Doors: the Chronos panel (js/news-timeline.js) and Atlas `time.lifeAtPlace` (js/atlas-cap-time.js → `atlasRun`).
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { parseDate, readDateInput, decode, parseGedcom, tagWords, kAdd, LIFE_OPENS, LIFE_CLOSES } from './gedcom.js';
import './safe-html.js';

const esc = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));
/* the two window-only owners this page uses (neither exports): js/hist-scale.js (the clock's proleptic arithmetic and
   its words for a year and a day) and js/map-pick.js (the one «tap the map» gesture) — read here, once each */
const HSc = () => { try { return window.IntMapHistScale || null; } catch (_) { return null; } };
const Pick = () => { try { return window.IntMapPick || null; } catch (_) { return null; } };
const GE = () => IntMapGeoEngine;
const STORE_KEY = 'intmap_family_v1';
const PH_ = () => import('./place-history.js');
const WW_ = () => import('./where-when.js');

/* ══ DAYS ════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const kParts = (k) => { const y = Math.floor(k / 10000), r = k - y * 10000, m = Math.floor(r / 100); return [y, m, r - m * 100]; };
/** the day a date is read at: its first day, or — when only its end is bounded (BEF, TO) — the last day before that end */
export function instantOf(d) {
  if (!d || d.problem) return null;
  return d.k0 != null ? d.k0 : (d.k1 != null ? kAdd(d.k1, -1) : null);
}
/** a date's own words, at the precision it was written (the record's calendar is said when it was not Gregorian) */
export function dateWords(d, lang) {
  const L = IntMapLang.pick(() => lang);
  if (!d) return '';
  if (d.problem) return d.raw ? d.raw + L(' (not a date IntMap can read)', '（IntMap が読めない日付）') : L('no date', '日付なし');
  const tag = (() => { try { return IntMapLang.htmlTag(lang) || 'en'; } catch (_) { return 'en'; } })();
  const HS = HSc();
  const yearT = (y) => { try { return HS.yearText(y, tag, lang === 'jp' ? '年' : null); } catch (_) { return y <= 0 ? (1 - y) + ' BC' : String(y); } };
  const one = (k, prec) => {
    const p = kParts(k);
    if (prec === 'year') return yearT(p[0]);
    /* a month in the platform's own order and words (1905年3月 / March 1905); before year 1 the era needs the year's own words */
    if (prec === 'month') { try { if (p[0] >= 1) { const mid = new Date(0); mid.setUTCFullYear(p[0], p[1] - 1, 15); return new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(mid); } return new Intl.DateTimeFormat(tag, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, p[1] - 1, 15))) + ' ' + yearT(p[0]); } catch (_) { return yearT(p[0]) + '-' + String(p[1]).padStart(2, '0'); } }
    try { return HS.dateText(p[0], p[1], p[2], tag); } catch (_) { return p.join('-'); }
  };
  /* the last day an exclusive end covers, at the date's precision */
  const lastOf = (k1, prec) => (prec === 'year' ? one(kAdd(k1, -1), 'year') : prec === 'month' ? one(kAdd(k1, -1), 'month') : one(kAdd(k1, -1), 'day'));
  let s;
  switch (d.qual) {
    case 'before': s = L('before ' + one(d.k1, d.prec), one(d.k1, d.prec) + ' より前'); break;
    case 'after': s = L('after ' + lastOf(d.k0, d.prec), lastOf(d.k0, d.prec) + ' より後'); break;
    case 'between': s = L('between ' + one(d.k0, d.prec) + ' and ' + lastOf(d.k1, d.prec), one(d.k0, d.prec) + '〜' + lastOf(d.k1, d.prec) + ' の間'); break;
    case 'period': s = d.k0 == null ? L('until ' + lastOf(d.k1, d.prec), lastOf(d.k1, d.prec) + ' まで') : d.k1 == null ? L('from ' + one(d.k0, d.prec), one(d.k0, d.prec) + ' から') : L(one(d.k0, d.prec) + ' to ' + lastOf(d.k1, d.prec), one(d.k0, d.prec) + '〜' + lastOf(d.k1, d.prec)); break;
    case 'about': s = L('about ' + one(d.k0, d.prec), one(d.k0, d.prec) + ' 頃'); break;
    case 'calculated': s = L('calculated ' + one(d.k0, d.prec), one(d.k0, d.prec) + '（計算）'); break;
    case 'estimated': s = L('estimated ' + one(d.k0, d.prec), one(d.k0, d.prec) + '（推定）'); break;
    default: s = one(d.k0, d.prec);
  }
  const calW = { julian: L('Julian calendar', 'ユリウス暦'), french: L('French Republican calendar', 'フランス革命暦'), hebrew: L('Hebrew calendar', 'ユダヤ暦') }[d.cal];
  const notes = [];
  if (calW) notes.push(L('written in the ' + calW + ': «' + d.raw + '»', calW + 'の記載「' + d.raw + '」'));
  if (d.dual) notes.push(L('dual year ' + d.dual + ' read as the later year', '二重年号 ' + d.dual + ' は後の年として読んだ'));
  if (d.phrase) notes.push('«' + d.phrase + '»');
  return notes.length ? s + ' (' + notes.join('; ') + ')' : s;
}

/* ══ READING THE RECORDS AT AN EVENT — pure over a place-history record (tests evaluate them in Node) ═════════════ */
/**
 * atEvent(rec, date, lang, PH) — what the records draw over the event's place on its day.
 *   → { status, at, polities:[{ name, records, realm, quiet, sheet }], units:[{ name, record }], gap, bound, within:[{ k, text }] }
 *   `bound` is 'before' / 'after' when the date only bounds the day (read at the bound); `within` lists the instants
 *   inside the date's span (a year, a month, «between») at which what the map draws over the place changes.
 */
function atEvent(rec, date, lang, PH) {
  const at = instantOf(date);
  const N = rec && rec.nation;
  const out = { status: (N && N.status) || 'unavailable', at, polities: [], units: [], gap: false, bound: null, within: [] };
  if (at == null) { out.status = 'undated'; return out; }
  if (date.k0 == null) out.bound = 'before'; else if (date.k1 == null) out.bound = 'after';
  const now = PH.nowAt(rec, at, lang);
  out.status = now.status;
  if (now.status !== 'ok') return out;
  const recs = N.records;
  out.polities = now.polities.map((p) => { const w = PH.entryWords(p.E, lang, recs, at); return { name: w.name, records: w.records, realm: p.realm, quiet: p.quiet, sheet: p.sheet }; });
  out.units = (now.unitEntries || []).map((E) => { const w = PH.unitWords(E, lang, recs); return { name: w.name, record: w.record }; });
  out.gap = now.gap;
  if (date.k0 != null && date.k1 != null && date.k1 - date.k0 > 1) {
    for (const c of PH.changesOf(rec, date.k1)) if (c.k > date.k0 && c.k < date.k1) out.within.push({ k: c.k, text: PH.changeText(c, lang, recs) });
  }
  return out;
}

/** the span of a life: birth (else christening/baptism) to death (else burial/cremation); without one end, the first
    or last dated event of the person — and the span says which (`basis`). null when fewer than two days are known. */
function lifeWindow(person) {
  const evs = ((person && person.events) || []).map((e) => Object.assign({}, e, { d: e.d || (e.typed ? readDateInput(e.date) : parseDate(e.date)) }));
  const dated = evs.filter((e) => instantOf(e.d) != null);
  const pick = (tags) => { for (const t of tags) { const e = dated.find((x) => x.tag === t); if (e) return e; } return null; };
  const open = pick(LIFE_OPENS), close = pick(LIFE_CLOSES);
  const first = dated.slice().sort((a, b) => instantOf(a.d) - instantOf(b.d))[0];
  const last = dated.slice().sort((a, b) => instantOf(b.d) - instantOf(a.d))[0];
  const from = open || first, to = close || last;
  if (!from || !to) return null;
  const k0 = instantOf(from.d), k1 = to.d.k1 != null ? to.d.k1 : kAdd(instantOf(to.d), 1);
  if (!(k1 > k0)) return null;
  return { k0, k1, from: { tag: from.tag, d: from.d }, to: { tag: to.tag, d: to.d }, basis: open && close ? 'life' : 'events' };
}

/* ══ ONE POLITY OR TWO — the identities a timeline entry carries (the records' own, never a judgement of history) ══
   An entry is the same polity as another when they share an identity the records give: a Wikidata item, a CShapes
   state code, or the name the record writes. OpenHistoricalMap writes a territorial VERSION of one polity into its name
   — «Empire of Japan (1868-1869)», «(1869-1879)», no Wikidata item — so a trailing year range that RESTATES THE ROW'S
   OWN YEARS (the row begins inside it) is the row's version label, and the name without it is the identity. A range
   that does not cover the row's start is part of a name and is kept. */
const VERSION_YEARS = /\s*\((-?\d{1,4})\s*[-–]\s*(-?\d{1,4})\)\s*$/;
/** the identities of a timeline entry: ['q:Q…', 'g:<gwcode>', 'n:<name>'] */
function identities(E) {
  const out = [];
  for (const x of E.ids || []) { const id = x.id || {}; if (id.qid) out.push('q:' + id.qid); if (id.gw != null) out.push('g:' + id.gw); }
  const n = nameKey(E);
  if (n) out.push('n:' + n);
  return out;
}
/** the name an entry is the same polity under: its name without a version label that restates the row's own years */
function nameKey(E) {
  const n = String(E.name || ''), m = VERSION_YEARS.exec(n), y = kParts(E.from.k)[0];
  return m && y >= +m[1] && y <= +m[2] + 1 ? n.slice(0, m.index) : n;
}
/* two Wikidata items are two polities even under one name (the Second Republic and the Third are both «French
   Republic»); a name or a state code joins rows only where one of them carries no item */
function samePolity(a, b) {
  const A = identities(a), B = identities(b);
  const qa = A.filter((x) => x.startsWith('q:')), qb = B.filter((x) => x.startsWith('q:'));
  if (qa.length && qb.length) return qa.some((x) => qb.indexOf(x) >= 0);
  return B.some((x) => A.indexOf(x) >= 0);
}

/**
 * lifeAt(rec, k0, k1, lang, PH) — what the map draws over one place during [k0, k1).
 *   → { status, entries:[{ name, from, to, records, realm, quiet, sheet }], shifts:[{ k, text, kind }], changes, units:[…] }
 * A shift is an instant inside the span at which what the map draws over the place changes (`changesOf`). `changes`
 * counts the ones that are a CHANGE OF POLITY — measured against the last polities drawn before it, so a span no record
 * covers is listed and stepped over, not counted as a polity:
 *   · 'polity'   — a polity the map drew is no longer drawn AND one it did not draw is (one of each, at least);
 *   · 'record'   — the same, but every edge involved is a record's (`reach`, `handover`): the records hand the ground
 *                  over, the world does not change (1886, where CShapes begins);
 *   · 'version'  — the polity drawn is the same one, under the same name, in another row of the record;
 *   · 'renamed'  — the same polity by the record's own identifier (a Wikidata item, a CShapes state code), under a new
 *                  name: the record says the state continued (Persia → Iran, Ottoman Empire → Turkey in CShapes);
 *   · 'overlap'  — a second claim begins or one of two ends (nothing is both gone and new);
 *   · 'gap'      — no record draws a polity from here; 'other' — a name, a subdivision, a sheet.
 * An entry both of whose edges are a handover is a coarser record covering a seam between two finer ones (Cliopatria's
 * «USSR» for the 25 days CShapes leaves between the Soviet Union and Ukraine in 1991): it is listed, and stepped over.
 */
function lifeAt(rec, k0, k1, lang, PH) {
  const N = rec && rec.nation;
  if (!N || N.status !== 'ok') return { status: (N && N.status) || 'unavailable', entries: [], shifts: [], changes: 0, units: [] };
  const recs = N.records;
  const over = (E) => E.from.k < k1 && E.to.k > k0;
  const entries = N.entries.filter(over).map((E) => Object.assign({ realm: !!E.realm, sheet: E.from.edge === 'sheet' }, PH.entryWords(E, lang, recs)));
  const fill = (E) => E.from.edge === 'handover' && E.to.edge === 'handover';
  const main = (E) => !E.realm && !E.unnamed && !E.withheld && E.from.edge !== 'sheet' && !fill(E);
  const heldAt = (k) => N.entries.filter((E) => main(E) && E.from.k <= k && k < E.to.k);
  const recordEdge = (x) => x.edge === 'handover' || x.edge === 'reach';
  const shifts = [];
  /* `base` is what the map drew at the last change of polity (or at the start): a claim that only BEGINS beside it does
     not move it, so a transfer drawn as an overlap (1871: the German Reich from 4 May, the French Republic until 9 May)
     is counted once, on the day the old claim ends */
  let base = heldAt(k0);
  for (const c of PH.changesOf(rec, k1)) {
    if (!(c.k > k0 && c.k < k1)) continue;
    const held = heldAt(c.k), text = PH.changeText(c, lang, recs);
    let kind = 'other';
    if (!held.length) kind = base.length ? 'gap' : 'other';
    else if (!base.length) base = held;
    else {
      const gone = base.filter((E) => !held.some((x) => x === E || samePolity(x, E)));
      const came = held.filter((E) => !base.some((x) => x === E || samePolity(x, E)));
      if (gone.length && came.length) { kind = gone.every((E) => recordEdge(E.to)) && came.every((E) => recordEdge(E.from)) ? 'record' : 'polity'; base = held; }
      else if (came.length) kind = 'overlap';
      else {
        const fresh = held.filter((E) => base.indexOf(E) < 0);
        /* a new row of a polity already drawn: under the same name it is another version of the row; under another name the
           record's identifier continues and the map writes a new name (CShapes' state code 640: «Ottoman Empire» to 14 Oct
           1923, «Turkey» after — the map's era-name table) */
        kind = gone.length ? 'overlap' : !fresh.length ? 'other' : fresh.every((E) => base.some((x) => nameKey(x) === nameKey(E))) ? 'version' : 'renamed';
        base = held;
      }
    }
    shifts.push({ k: c.k, text, kind });
  }
  const A = rec.admin;
  const units = (A && A.status === 'ok') ? A.entries.filter(over).map((E) => PH.unitWords(E, lang, recs)) : [];
  return { status: 'ok', entries, shifts, changes: shifts.filter((x) => x.kind === 'polity').length, units };
}

/* ══ LOCATING A PLACE NAME (see the header) ════════════════════════════════════════════════════════════════════ */
/* the kinds of gazetteer row that are a settlement (js/gazetteer.js writes city / town; a historical city record is
   'city'); a country and a contested area are not where an event happened */
const SETTLEMENT = new Set(['city', 'town', 'capital']);
/**
 * locate(text, deps) → { status:'one'|'several'|'none', part?, rows:[{ name, lng, lat, kind, source, note }] }
 * deps = { local?(q) → gazetteer rows, hist?(q) → historical rows, same?(a,b) → one place? }
 */
export function locate(text, deps) {
  const D = deps || {};
  const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rows = [];
    let local = []; try { local = (D.local ? D.local(part) : []) || []; } catch (_) { local = []; }
    for (const l of local) if (l && l.exact && l.kind !== 'country' && isFinite(+l.lng) && isFinite(+l.lat)) rows.push({ name: l.name, lng: +l.lng, lat: +l.lat, kind: l.kind || '', source: 'gazetteer', note: '', guard: 0 });
    let hist = []; try { hist = (D.hist ? D.hist(part) : []) || []; } catch (_) { hist = []; }
    for (const h of hist) {
      if (!(h && h.level >= 3) || !isFinite(+h.lng) || !isFinite(+h.lat)) continue;
      const twin = rows.find((r) => (D.same ? D.same(r, h) : false) || (r.source !== 'gazetteer' && Math.abs(r.lng - h.lng) < 1e-4 && Math.abs(r.lat - h.lat) < 1e-4));
      if (twin) { if (!twin.note) twin.note = h.note || ''; if (h.guard) twin.guard = h.guard; continue; }
      rows.push({ name: h.name, lng: +h.lng, lat: +h.lat, kind: h.kind || 'city', source: h.source, note: h.note || '', guard: h.guard || 0 });
    }
    /* a gazetteer row and a historical city row are one place when the city's own guard radius holds the gazetteer row */
    const merged = [];
    for (const r of rows) { const tw = merged.find((m) => D.same && D.same(m, r)); if (tw) { if (!tw.note && r.note) tw.note = r.note; continue; } merged.push(r); }
    if (!merged.length) continue;
    const towns = merged.filter((r) => SETTLEMENT.has(r.kind));
    if (towns.length === 1 && merged.length === 1) return { status: 'one', part, rows: merged };
    return { status: 'several', part, rows: merged.slice(0, 8) };
  }
  return { status: 'none', rows: [] };
}

/* ══ THE FAMILY, KEPT IN THIS BROWSER ═════════════════════════════════════════════════════════════════════════ */
let store = null;
function emptyStore() { return { v: 1, people: [], file: null }; }
function load() {
  if (store) return store;
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); store = s && s.v === 1 && Array.isArray(s.people) ? s : emptyStore(); } catch (_) { store = emptyStore(); }
  for (const p of store.people) for (const e of p.events || []) e.d = e.typed ? readDateInput(e.date) : parseDate(e.date);
  return store;
}
let saveFailed = false;
function save() {
  const plain = { v: 1, file: store.file, people: store.people.map((p) => Object.assign({}, p, { events: p.events.map((e) => { const o = Object.assign({}, e); delete o.d; return o; }) })) };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(plain)); saveFailed = false; } catch (_) { saveFailed = true; }
}
let seq = 0;
const newId = (k) => k + Date.now().toString(36) + (seq++).toString(36);
/** a parsed GEDCOM file → the people as kept (dates as the file wrote them, re-read on every load) */
function fromGedcom(g, fileName) {
  return {
    v: 1, file: { name: fileName || '', source: g.source || '', version: g.version || '', read: new Date().toISOString().slice(0, 10) },
    people: g.people.map((p) => ({ id: p.id, name: p.name, sex: p.sex, parents: p.parents, spouses: p.spouses, children: p.children,
      events: p.events.map((e) => Object.assign({ id: newId('e'), tag: e.tag, date: e.date ? e.date.raw : '', d: e.date }, e.type ? { type: e.type } : {}, e.place ? { place: e.place } : {},
        e.lng != null ? { lng: e.lng, lat: e.lat, how: 'file' } : {}, e.with ? { with: e.with } : {})) })),
  };
}

/* ══ THE RECORD OF A PLACE — read once per point, one at a time (each read is a few Range requests) ══════════════ */
const recs = new Map();
let queue = Promise.resolve();
function recordAt(lng, lat) {
  const key = (+lng).toFixed(5) + ',' + (+lat).toFixed(5);
  if (!recs.has(key)) {
    const p = queue.then(() => PH_()).then((PH) => PH.placeHistory({ lng: +lng, lat: +lat }));
    queue = p.catch(() => null);
    recs.set(key, p.catch((e) => { recs.delete(key); throw e; }));
  }
  return recs.get(key);
}

/* ══ THE SHEET ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
const CSS = `.fh-panel{ position:fixed; z-index:var(--z-sheet); top:72px; right:12px; width:min(400px, calc(100vw - 24px)); max-height:calc(100vh - 160px); display:flex; flex-direction:column; border-radius:16px; background:var(--popup-bg); -webkit-backdrop-filter:blur(22px) saturate(1.6); backdrop-filter:blur(22px) saturate(1.6); border:1px solid var(--glass-border,rgba(128,128,128,0.2)); box-shadow:var(--shadow); color:var(--text-main); overflow:hidden; }
.fh-panel[hidden]{ display:none; }
.fh-head{ display:flex; align-items:center; gap:6px; padding:10px 10px 8px; border-bottom:1px solid rgba(128,128,128,0.16); }
.fh-title{ flex:1; margin:0; font-size:15px; font-weight:700; text-align:center; }
.fh-x,.fh-back{ flex:none; width:32px; height:32px; border-radius:50%; border:0; background:var(--input-bg); color:var(--text-main); font-size:18px; line-height:1; cursor:pointer; }
.fh-back[hidden]{ visibility:hidden; display:block; }
.fh-body{ overflow-y:auto; overscroll-behavior:contain; padding:8px 12px 12px; }
.fh-lead{ font-size:12.5px; line-height:1.45; margin:2px 0 8px; }
.fh-note{ font-size:11px; color:var(--text-muted); line-height:1.45; margin:6px 0 0; }
.fh-warn{ font-size:11.5px; line-height:1.45; margin:6px 0 0; color:#ff9f0a; }
.fh-in{ width:100%; box-sizing:border-box; padding:9px 12px; border-radius:10px; border:1px solid var(--glass-border,rgba(128,128,128,0.25)); background:var(--input-bg); color:var(--text-main); font:inherit; font-size:14px; }
.fh-lbl{ display:block; font-size:11px; color:var(--text-muted); margin:8px 0 3px; }
.fh-sec{ margin-top:12px; }
.fh-sec h4{ margin:0 0 5px; font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--text-muted); }
.fh-list{ list-style:none; margin:0; padding:0; border-radius:10px; overflow:hidden; background:var(--input-bg); }
.fh-list > li{ border-bottom:1px solid rgba(128,128,128,0.14); }
.fh-list > li:last-child{ border-bottom:0; }
.fh-row{ display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 8px; width:100%; padding:8px 10px; border:0; background:transparent; color:var(--text-main); text-align:left; font:inherit; cursor:pointer; min-height:44px; box-sizing:border-box; }
.fh-n{ font-size:13px; font-weight:600; flex:1 1 auto; }
.fh-v{ font-size:11px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
.fh-s{ flex-basis:100%; font-size:11px; color:var(--text-muted); line-height:1.35; }
.fh-ev{ padding:8px 10px; }
.fh-evh{ display:flex; gap:8px; align-items:baseline; font-size:13px; }
.fh-evh b{ font-weight:650; }
.fh-evd{ font-size:11.5px; color:var(--text-muted); margin-top:1px; }
.fh-jur{ margin-top:5px; font-size:12px; line-height:1.45; }
.fh-jur .fh-p{ font-weight:650; }
.fh-src{ font-size:10.5px; color:var(--text-muted); }
.fh-chg{ margin:4px 0 0; padding:6px 8px; border-radius:8px; background:rgba(255,159,10,0.12); font-size:11.5px; line-height:1.4; }
.fh-acts{ display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.fh-act{ flex:0 1 auto; min-height:32px; padding:6px 10px; border-radius:9px; border:1px solid var(--glass-border,rgba(128,128,128,0.25)); background:var(--popup-bg); color:var(--text-main); font:inherit; font-size:12px; font-weight:600; cursor:pointer; }
.fh-act.fh-primary{ background:var(--primary-fill,#0a84ff); color:#fff; border-color:transparent; }
.fh-big{ display:flex; gap:6px; flex-wrap:wrap; margin:6px 0 4px; }
.fh-big .fh-act{ flex:1 1 auto; min-height:40px; font-size:12.5px; }
.fh-big .fh-act.fh-danger{ color:#ff453a; }
.fh-life{ margin-top:6px; padding:8px 10px; border-radius:10px; background:var(--input-bg); }
.fh-lifeh{ font-size:12.5px; font-weight:650; }
.fh-count{ font-size:22px; font-weight:750; font-variant-numeric:tabular-nums; margin-right:6px; }
.fh-seq{ margin:6px 0 0; padding:0 0 0 16px; font-size:12px; line-height:1.5; }
.fh-seq li.fh-rec{ color:var(--text-muted); }
.fh-cands{ margin-top:6px; }
.fh-rel{ display:flex; flex-wrap:wrap; gap:6px; }
.fh-grid{ display:grid; grid-template-columns:1fr 1fr; gap:0 8px; }
@media (max-width:700px){
  .fh-panel{ top:auto; right:0; left:0; bottom:0; width:100%; max-height:82vh; border-radius:16px 16px 0 0; padding-bottom:var(--safe-bottom); }
  .fh-x,.fh-back{ width:40px; height:40px; }
  .fh-act{ min-height:44px; }
}`;
function ensureStyle() { if (typeof document === 'undefined' || document.getElementById('family-history-css')) return; const st = document.createElement('style'); st.id = 'family-history-css'; st.textContent = CSS; document.head.appendChild(st); }

let sheet = null, langOf = () => 'en', localOf = null;
const lang = () => { try { return langOf() || 'en'; } catch (_) { return 'en'; } };
/* the reader's language, bound once: every sentence of the sheet is a call of this (the i18n instruments read it as one) */
const t = IntMapLang.pick(() => lang());
const ui = { view: 'list', pid: null, q: '', draft: null, arm: null, busy: null, cands: null, picking: null };

/** open the sheet: want = { lang?, local?, draft?:{ name, place, lng, lat, birth, death } } */
export async function openFamily(want) {
  ensureStyle();
  const w = want || {};
  if (typeof w.lang === 'function') langOf = w.lang;
  if (typeof w.local === 'function') localOf = w.local;
  load();
  if (!sheet) {
    sheet = document.createElement('section');
    sheet.id = 'fh-sheet'; sheet.className = 'fh-panel'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'false');
    sheet.addEventListener('click', onClick);
    sheet.addEventListener('input', onInput);
    sheet.addEventListener('change', onChange);
    document.body.appendChild(sheet);
  }
  sheet.hidden = false;
  try { globalThis.IntMapStack.opened(sheet); } catch (_) { /* no stack owner (Node) */ }
  if (w.draft) { ui.view = 'add'; ui.draft = Object.assign({ name: '', place: '', birth: '', death: '' }, w.draft); }
  else if (w.person) { ui.view = 'person'; ui.pid = w.person; }
  paint();
  draw();
  return { ok: true, people: store.people.length };
}
function closeFamily() {
  if (sheet) sheet.hidden = true;
  try { const P = Pick(); if (ui.picking && P) P.cancel(); } catch (_) { /* no pick live */ }
  ui.picking = null;
  undraw();
}
function head(back) {
  return '<header class="fh-head"><button type="button" class="fh-back" data-act="list" aria-label="' + esc(t('All people', '人物の一覧')) + '"' + (back ? '' : ' hidden') + '>‹</button>'
    + '<h3 class="fh-title">' + esc(t('Family history across borders', '家族史と国境')) + '</h3>'
    + '<button type="button" class="fh-x" data-act="close" aria-label="' + esc(t('Close', '閉じる')) + '">×</button></header>';
}
function paint() {
  if (!sheet || sheet.hidden) return;
  const body = sheet.querySelector('.fh-body'), scroll = body ? body.scrollTop : 0;
  const v = ui.view;
  sheet.innerHTML = head(v !== 'list') + '<div class="fh-body">' + (v === 'person' ? personHtml() : v === 'add' ? addHtml() : listHtml()) + '</div>';
  const nb = sheet.querySelector('.fh-body'); if (nb && v === ui.lastView) nb.scrollTop = scroll;
  ui.lastView = v;
  if (v === 'person') readPerson();
  if (v === 'add' && ui.draft && ui.draft.lng != null) readDraft();
}
const personById = (id) => store.people.find((p) => p.id === id) || null;
const lifeText = (p) => { const W = lifeWindow(p); if (!W) return ''; return yearOf(W.k0) + '–' + yearOf(kAdd(W.k1, -1)); };
const yearOf = (k) => { const y = kParts(k)[0]; return y <= 0 ? t((1 - y) + ' BC', '紀元前' + (1 - y)) : String(y); };

function listHtml() {
  const P = store.people;
  let h = '<p class="fh-lead">' + esc(t('Add the people of your family — or import the GEDCOM file your genealogy program exports. For every birth, marriage and death, IntMap shows the state and the province its historical records draw over that place on that day, and how often they changed while each person lived.',
    '家族の人物を加えるか、家系図ソフトが書き出す GEDCOM ファイルを読み込みます。誕生・結婚・死亡のそれぞれについて、その日にその場所を IntMap の歴史の記録がどの国・どの州として描いているか、そして生涯のうちに何度変わったかを示します。')) + '</p>';
  h += '<div class="fh-big"><button type="button" class="fh-act fh-primary" data-act="add">' + esc(t('Add a person', '人物を加える')) + '</button>'
    + '<button type="button" class="fh-act" data-act="import">' + esc(t('Import a GEDCOM file', 'GEDCOM ファイルを読み込む')) + '</button>'
    + '<input type="file" class="fh-file" accept=".ged,.gedcom,text/plain" hidden></div>';
  if (ui.arm === 'import') h += '<p class="fh-warn">' + esc(t('Importing replaces the ' + P.length + ' people kept here.', '読み込むと、ここに保存している ' + P.length + ' 人は置き換わります。')) + '</p><div class="fh-big"><button type="button" class="fh-act fh-danger" data-act="import-go">' + esc(t('Choose the file and replace', 'ファイルを選んで置き換える')) + '</button><button type="button" class="fh-act" data-act="disarm">' + esc(t('Cancel', 'キャンセル')) + '</button></div>';
  if (ui.busy) h += '<p class="fh-note" aria-live="polite">' + esc(ui.busy) + '</p>';
  if (ui.report) h += '<p class="fh-note">' + esc(ui.report) + '</p>';
  if (P.length) {
    const q = ui.q.trim().toLowerCase();
    const hits = q ? P.filter((p) => (p.name || '').toLowerCase().includes(q)) : P;
    h += '<div class="fh-sec"><input type="search" class="fh-in fh-q" enterkeyhint="search" autocomplete="off" aria-label="' + esc(t('Find a person', '人物を探す')) + '" placeholder="' + esc(t('Find a person', '人物を探す')) + '" value="' + esc(ui.q) + '"></div>';
    const shown = hits.slice(0, 100);
    h += '<div class="fh-sec"><h4>' + esc(t('People', '人物') + ' · ' + (q ? hits.length + ' / ' : '') + P.length) + '</h4><ol class="fh-list fh-people">' + shown.map((p) => {
      const ev = p.events.filter((e) => e.lng != null).length;
      return '<li><button type="button" class="fh-row" data-person="' + esc(p.id) + '"><span class="fh-n">' + esc(p.name || t('(no name)', '（名前なし）')) + '</span><span class="fh-v">' + esc(lifeText(p)) + '</span>'
        + '<span class="fh-s">' + esc(t(p.events.length + ' events · ' + ev + ' placed on the map', '出来事 ' + p.events.length + ' 件 · 地図上 ' + ev + ' 件')) + '</span></button></li>';
    }).join('') + '</ol>' + (hits.length > shown.length ? '<p class="fh-note">' + esc(t((hits.length - shown.length) + ' more — narrow the search', 'ほか ' + (hits.length - shown.length) + ' 人（検索で絞り込めます）')) + '</p>' : '') + '</div>';
    if (store.file && store.file.name) h += '<p class="fh-note">' + esc(t('From ' + store.file.name + (store.file.source ? ' (' + store.file.source + ')' : '') + ', read ' + store.file.read, store.file.name + (store.file.source ? '（' + store.file.source + '）' : '') + ' から読み込み（' + store.file.read + '）')) + '</p>';
    h += ui.arm === 'wipe' ? '<p class="fh-warn">' + esc(t('Delete all ' + P.length + ' people from this browser?', 'このブラウザから ' + P.length + ' 人をすべて削除しますか？')) + '</p><div class="fh-big"><button type="button" class="fh-act fh-danger" data-act="wipe-go">' + esc(t('Delete everything', 'すべて削除')) + '</button><button type="button" class="fh-act" data-act="disarm">' + esc(t('Cancel', 'キャンセル')) + '</button></div>'
      : '<div class="fh-big"><button type="button" class="fh-act fh-danger" data-act="wipe">' + esc(t('Delete everything kept here', 'ここに保存した内容をすべて削除')) + '</button></div>';
  }
  h += privacyHtml();
  return h;
}
function privacyHtml() {
  return (saveFailed ? '<p class="fh-warn">' + esc(t('This browser could not keep the family (its storage is full); it is shown until the page is closed.', 'このブラウザの保存領域が足りず、家族を保存できませんでした。ページを閉じるまでは表示されます。')) + '</p>' : '')
    + '<p class="fh-note">' + esc(t('Kept only in this browser. Names, dates and places are never sent anywhere: place names are found on this device, and the historical records are fetched in the parts those places need, as the map fetches them.',
      'このブラウザの中だけに保存します。名前・日付・場所はどこにも送信しません。地名はこの端末上で特定し、歴史の記録は地図と同じく、その場所に必要な部分だけを読み込みます。')) + '</p>'
    + '<p class="fh-note">' + esc(t('The states and provinces are what IntMap\'s historical records draw (CShapes 2.0 from 1886, OpenHistoricalMap from 1689, Cliopatria before) — legal sovereignty as those records date it, not who held the ground in every war.',
      '国と州は IntMap の歴史の記録（1886 年以降は CShapes 2.0、1689 年以降は OpenHistoricalMap、それ以前は Cliopatria）が描くものです。各記録が日付を与えた法的な帰属であり、戦争中に実際に支配していた勢力とは限りません。')) + '</p>';
}

/* ── one person ─────────────────────────────────────────────────────────────────────────────────────────────── */
const ordered = (p) => p.events.slice().sort((a, b) => { const x = instantOf(a.d), y = instantOf(b.d); return (x == null) - (y == null) || (x || 0) - (y || 0); });
function personHtml() {
  const p = personById(ui.pid); if (!p) { ui.view = 'list'; return listHtml(); }
  const lg = lang();
  let h = '<p class="fh-lead"><span class="fh-count" style="font-size:20px">' + esc(p.name || t('(no name)', '（名前なし）')) + '</span> <span class="fh-v">' + esc(lifeText(p)) + '</span></p>';
  const rel = [['parents', t('Parents', '親')], ['spouses', t('Spouses', '配偶者')], ['children', t('Children', '子')]].map(([k, w]) => {
    const xs = (p[k] || []).map(personById).filter(Boolean); if (!xs.length) return '';
    return '<div class="fh-lbl">' + esc(w) + '</div><div class="fh-rel">' + xs.map((x) => '<button type="button" class="fh-act" data-person="' + esc(x.id) + '">' + esc(x.name || '?') + '</button>').join('') + '</div>';
  }).join('');
  if (rel) h += rel;
  /* the life */
  const W = lifeWindow(p);
  h += '<div class="fh-sec"><h4>' + esc(t('During this life', '生涯のあいだ')) + '</h4>';
  if (!W) h += '<p class="fh-note">' + esc(t('Two dated events are needed to read a life (a birth and a death, or a first and a last event).', '生涯を読むには日付のある出来事が 2 つ必要です（誕生と死亡、または最初と最後の出来事）。')) + '</p>';
  else {
    const basis = W.basis === 'life' ? t(tagWords(W.from, 'en') + ' to ' + tagWords(W.to, 'en').toLowerCase(), tagWords(W.from, 'jp') + 'から' + tagWords(W.to, 'jp') + 'まで')
      : t('between the first and the last dated event (no birth or death is dated)', '最初と最後の日付のある出来事の間（誕生か死亡の日付がありません）');
    h += '<p class="fh-note">' + esc(dateWords(W.from.d, lg) + ' – ' + dateWords(W.to.d, lg) + ' · ' + basis) + '</p>';
    const places = placesOf(p);
    if (!places.length) h += '<p class="fh-note">' + esc(t('No event of this person is placed on the map yet.', 'この人物の出来事はまだ地図上に置かれていません。')) + '</p>';
    places.forEach((pl, i) => { h += '<div class="fh-life" data-life="' + i + '"><div class="fh-lifeh">' + esc(pl.place || coordText(pl)) + '</div><div class="fh-note">' + esc(t('Reading the historical records…', '歴史の記録を読み込み中…')) + '</div></div>'; });
  }
  h += '</div>';
  /* the events */
  h += '<div class="fh-sec"><h4>' + esc(t('Life events', '出来事')) + '</h4><ol class="fh-list">' + ordered(p).map((e) => eventHtml(p, e)).join('') + '</ol></div>';
  h += addEventHtml();
  h += '<div class="fh-big"><button type="button" class="fh-act fh-danger" data-act="del-person">' + esc(ui.arm === 'del:' + p.id ? t('Press again to delete ' + (p.name || 'this person'), 'もう一度押すと ' + (p.name || 'この人物') + ' を削除') : t('Delete this person', 'この人物を削除')) + '</button></div>';
  h += privacyHtml();
  return h;
}
const coordText = (e) => (+e.lat).toFixed(4) + ', ' + (+e.lng).toFixed(4);
/** the distinct places of a person's events that are on the map, in the order of their first event */
function placesOf(p) {
  const out = [];
  for (const e of ordered(p)) {
    if (e.lng == null) continue;
    if (out.some((x) => Math.abs(x.lng - e.lng) < 1e-5 && Math.abs(x.lat - e.lat) < 1e-5)) continue;
    out.push({ lng: e.lng, lat: e.lat, place: e.place || '' });
  }
  return out;
}
function eventHtml(p, e) {
  const lg = lang();
  const withP = e.with ? personById(e.with) : null;
  let h = '<li class="fh-ev" data-ev="' + esc(e.id) + '"><div class="fh-evh"><b>' + esc(tagWords(e, lg)) + '</b>' + (withP ? '<span class="fh-v">' + esc(t('with ' + (withP.name || '?'), (withP.name || '?') + 'と')) + '</span>' : '') + '</div>'
    + '<div class="fh-evd">' + esc(dateWords(e.d, lg)) + (e.place ? ' · ' + esc(e.place) : '') + '</div>';
  if (e.lng != null) {
    const how = e.how === 'file' ? t('coordinates from the file', 'ファイルの座標') : e.how === 'picked' ? t('placed on the map', '地図上で指定') : e.how === 'name' ? t('found by «' + (e.by || e.place) + '»', '「' + (e.by || e.place) + '」で特定') : '';
    h += '<div class="fh-jur" data-jur="' + esc(e.id) + '">' + esc(t('Reading the historical records…', '歴史の記録を読み込み中…')) + '</div>'
      + '<div class="fh-src">' + esc(coordText(e) + (how ? ' · ' + how : '')) + '</div>';
  } else if (ui.cands && ui.cands.ev === e.id) {
    h += candHtml(ui.cands.res, 'ev:' + e.id);
  } else if (e.place) {
    h += '<div class="fh-src">' + esc(e.unfound ? t('No place IntMap holds answers to this name — pick it on the map.', 'IntMap が持つ地名に該当がありません。地図上で指定してください。') : t('Not placed on the map yet.', 'まだ地図上に置かれていません。')) + '</div>';
  }
  const acts = [];
  if (e.lng != null && instantOf(e.d) != null) acts.push('<button type="button" class="fh-act fh-primary" data-go="' + esc(e.id) + '">' + esc(t('Go to that day', 'その日へ')) + '</button>');
  if (e.lng == null && e.place) acts.push('<button type="button" class="fh-act" data-locate="' + esc(e.id) + '">' + esc(t('Find this place', '場所を探す')) + '</button>');
  acts.push('<button type="button" class="fh-act" data-pick="' + esc(e.id) + '">' + esc(e.lng == null ? t('Pick on the map', '地図上で指定') : t('Move on the map', '地図上で指定し直す')) + '</button>');
  acts.push('<button type="button" class="fh-act" data-delev="' + esc(e.id) + '">' + esc(t('Delete', '削除')) + '</button>');
  return h + '<div class="fh-acts">' + acts.join('') + '</div></li>';
}
function candHtml(res, target) {
  if (!res || res.status === 'none') return '<div class="fh-src">' + esc(t('No place IntMap holds answers to this name — pick it on the map.', 'IntMap が持つ地名に該当がありません。地図上で指定してください。')) + '</div>';
  return '<div class="fh-cands"><div class="fh-lbl">' + esc(t('Places named «' + res.part + '» — choose one', '「' + res.part + '」という名前の場所 — 1 つ選んでください')) + '</div><ol class="fh-list">'
    + res.rows.map((r, i) => '<li><button type="button" class="fh-row" data-cand="' + esc(target + '|' + i) + '"><span class="fh-n">' + esc(r.name) + '</span><span class="fh-v">' + esc(coordText(r)) + '</span>' + (r.note ? '<span class="fh-s">' + esc(r.note) + '</span>' : '') + '</button></li>').join('') + '</ol></div>';
}
const KINDS = ['BIRT', 'BAPM', 'MARR', 'RESI', 'EMIG', 'IMMI', 'CENS', 'DEAT', 'BURI'];
function addEventHtml() {
  return '<div class="fh-sec"><h4>' + esc(t('Add an event', '出来事を加える')) + '</h4><div class="fh-grid"><div><label class="fh-lbl" for="fh-ek">' + esc(t('Kind', '種別')) + '</label><select id="fh-ek" class="fh-in">'
    + KINDS.map((k) => '<option value="' + k + '">' + esc(tagWords({ tag: k }, lang())) + '</option>').join('') + '</select></div>'
    + '<div><label class="fh-lbl" for="fh-ed">' + esc(t('Date', '日付')) + '</label><input id="fh-ed" class="fh-in" placeholder="' + esc(t('1905-03-12 · about 1850', '1905-03-12 · 1850頃')) + '"></div></div>'
    + '<label class="fh-lbl" for="fh-ep">' + esc(t('Place', '場所')) + '</label><input id="fh-ep" class="fh-in" placeholder="' + esc(t('Lviv · Königsberg · Kyoto', 'リヴィウ · ケーニヒスベルク · 京都')) + '">'
    + '<div class="fh-big"><button type="button" class="fh-act fh-primary" data-act="add-ev">' + esc(t('Add', '追加')) + '</button></div></div>';
}

/* ── the form for a new person ──────────────────────────────────────────────────────────────────────────────── */
function addHtml() {
  const d = ui.draft || (ui.draft = { name: '', place: '', birth: '', death: '' });
  const bd = d.birth ? readDateInput(d.birth) : null, dd = d.death ? readDateInput(d.death) : null;
  let h = '<label class="fh-lbl" for="fh-n">' + esc(t('Name', '名前')) + '</label><input id="fh-n" class="fh-in" data-draft="name" value="' + esc(d.name) + '" autocomplete="off">'
    + '<div class="fh-grid"><div><label class="fh-lbl" for="fh-b">' + esc(t('Born', '生年月日')) + '</label><input id="fh-b" class="fh-in" data-draft="birth" value="' + esc(d.birth) + '" placeholder="' + esc(t('1905-03-12 · 1905', '1905-03-12 · 1905')) + '"></div>'
    + '<div><label class="fh-lbl" for="fh-d">' + esc(t('Died', '没年月日')) + '</label><input id="fh-d" class="fh-in" data-draft="death" value="' + esc(d.death) + '" placeholder="' + esc(t('1987 · leave empty if living', '1987 · 存命なら空欄')) + '"></div></div>';
  const dn = (x) => (x ? '<div class="fh-src">' + esc(dateWords(x, lang())) + '</div>' : '');
  h += dn(bd) + dn(dd);
  h += '<label class="fh-lbl" for="fh-p">' + esc(t('Where they lived', '暮らした場所')) + '</label><input id="fh-p" class="fh-in" data-draft="place" value="' + esc(d.place) + '" placeholder="' + esc(t('Lviv · Königsberg · Kyoto', 'リヴィウ · ケーニヒスベルク · 京都')) + '">';
  if (d.lng != null) h += '<div class="fh-src">' + esc(coordText(d) + (d.by ? ' · ' + t('found by «' + d.by + '»', '「' + d.by + '」で特定') : ' · ' + t('placed on the map', '地図上で指定'))) + '</div>';
  else if (ui.cands && ui.cands.ev === 'draft') h += candHtml(ui.cands.res, 'draft');
  h += '<div class="fh-acts"><button type="button" class="fh-act" data-act="draft-locate">' + esc(t('Find this place', '場所を探す')) + '</button><button type="button" class="fh-act" data-act="draft-pick">' + esc(t('Pick on the map', '地図上で指定')) + '</button></div>';
  if (d.lng != null && bd && !bd.problem) h += '<div class="fh-life" data-draftlife><div class="fh-note">' + esc(t('Reading the historical records…', '歴史の記録を読み込み中…')) + '</div></div>';
  h += '<div class="fh-big"><button type="button" class="fh-act fh-primary" data-act="draft-save">' + esc(t('Keep this person', 'この人物を保存')) + '</button></div>';
  h += privacyHtml();
  return h;
}
function draftPerson(d) {
  const ev = [];
  const place = d.lng != null ? { lng: d.lng, lat: d.lat, how: d.by ? 'name' : 'picked', by: d.by || undefined } : {};
  if (d.birth) ev.push(Object.assign({ id: newId('e'), tag: 'BIRT', date: d.birth, typed: true, d: readDateInput(d.birth) }, d.place ? { place: d.place } : {}, place));
  if (d.death) ev.push(Object.assign({ id: newId('e'), tag: 'DEAT', date: d.death, typed: true, d: readDateInput(d.death) }, d.place ? { place: d.place } : {}, place));
  return { id: newId('@P'), name: (d.name || '').trim(), sex: '', parents: [], spouses: [], children: [], events: ev };
}

/* ══ READING — the record of each place, written into the rows as it arrives ════════════════════════════════════ */
let readToken = 0;
async function readPerson() {
  const token = ++readToken, p = personById(ui.pid); if (!p) return;
  const PH = await PH_();
  const lg = lang();
  for (const e of ordered(p)) {
    if (e.lng == null) continue;
    let rec = null, err = null;
    try { rec = await recordAt(e.lng, e.lat); } catch (x) { err = x; }
    if (token !== readToken || !sheet) return;
    const el = sheet.querySelector('[data-jur="' + cssId(e.id) + '"]');
    if (el) el.innerHTML = rec ? jurHtml(atEvent(rec, e.d, lg, PH)) : esc(t('The historical records could not be read here.', 'ここでは歴史の記録を読めませんでした。') + (err && err.message ? ' (' + err.message + ')' : ''));
  }
  const W = lifeWindow(p); if (!W) return;
  const places = placesOf(p);
  for (let i = 0; i < places.length; i++) {
    let rec = null; try { rec = await recordAt(places[i].lng, places[i].lat); } catch (_) { rec = null; }
    if (token !== readToken || !sheet) return;
    const el = sheet.querySelector('[data-life="' + i + '"]');
    if (el) el.innerHTML = '<div class="fh-lifeh">' + esc(places[i].place || coordText(places[i])) + '</div>' + (rec ? lifeHtml(lifeAt(rec, W.k0, W.k1, lg, PH), 'life:' + i) : '<div class="fh-note">' + esc(t('The historical records could not be read here.', 'ここでは歴史の記録を読めませんでした。')) + '</div>');
  }
}
async function readDraft() {
  const d = ui.draft, token = ++readToken;
  const bd = readDateInput(d.birth), dd = d.death ? readDateInput(d.death) : null;
  if (bd.problem || d.lng == null) return;
  const PH = await PH_();
  let rec = null; try { rec = await recordAt(d.lng, d.lat); } catch (_) { rec = null; }
  if (token !== readToken || !sheet) return;
  const el = sheet.querySelector('[data-draftlife]'); if (!el) return;
  const k0 = instantOf(bd), k1 = dd && !dd.problem ? (dd.k1 != null ? dd.k1 : kAdd(instantOf(dd), 1)) : null;
  if (!rec) { el.innerHTML = '<div class="fh-note">' + esc(t('The historical records could not be read here.', 'ここでは歴史の記録を読めませんでした。')) + '</div>'; return; }
  const born = atEvent(rec, bd, lang(), PH);
  el.innerHTML = '<div class="fh-lifeh">' + esc(t('At birth', '誕生のとき')) + '</div>' + jurHtml(born) + (k1 != null && k1 > k0 ? lifeHtml(lifeAt(rec, k0, k1, lang(), PH), 'draft') : '');
}
const cssId = (s) => String(s).replace(/["\\]/g, '\\$&');
function jurHtml(J) {
  if (J.status === 'undated') return esc(t('No date IntMap can read — the records cannot be asked about a day.', 'IntMap が読める日付がないため、記録に日を問えません。'));
  if (J.status === 'unavailable') return esc(t('The historical records could not be read here.', 'ここでは歴史の記録を読めませんでした。'));
  if (J.status === 'none') return esc(t('No historical record draws a polity over this place.', 'この場所に政体を描く歴史の記録はありません。'));
  let h = '';
  if (J.bound) h += '<div class="fh-src">' + esc(J.bound === 'before' ? t('The date is only «before»: read on the last day before it.', '日付は「より前」だけなので、その直前の日で読んでいます。') : t('The date is only «after»: read on the first day after it.', '日付は「より後」だけなので、その直後の日で読んでいます。')) + '</div>';
  if (J.gap) h += '<div>' + esc(t('No record draws a polity over this place on this day.', 'この日、この場所に政体を描く記録はありません。')) + '</div>';
  for (const p of J.polities) h += '<div><span class="fh-p">' + esc(p.name) + '</span>' + (p.realm ? ' <span class="fh-src">' + esc(t('(the realm, drawn over its members)', '（構成国の上に描く上位の政体）')) + '</span>' : '') + ' <span class="fh-src">' + esc(p.records.join(' + ')) + '</span></div>';
  for (const u of J.units) h += '<div>' + esc(u.name) + ' <span class="fh-src">' + esc(u.record) + '</span></div>';
  if (J.within.length) h += '<div class="fh-chg">' + esc(t('The records change during this date\'s span — the day decides:', 'この日付の幅の中で記録が変わります。日によって答えが違います:')) + '<br>' + J.within.map((c) => esc(c.text)).join('<br>') + '</div>';
  return h;
}
/* why a listed change is not counted, in words */
function shiftWhy(kind) {
  switch (kind) {
    case 'record': return t(' — the records hand over; not counted', ' — 記録の切り替わり（数えない）');
    case 'version': return t(' — the same polity in another row of the record; not counted', ' — 記録の別の行の同じ政体（数えない）');
    case 'renamed': return t(' — the record\'s identifier continues: the same state under a new name; not counted', ' — 記録の識別子は続いている（同じ国家の名前の変更。数えない）');
    case 'overlap': return t(' — two claims overlap here; not counted', ' — 2 つの主張の重なり（数えない）');
    case 'gap': return t(' — no record draws a polity from here; not counted', ' — ここから政体を描く記録がない（数えない）');
    case 'polity': return '';
    default: return t(' — not a change of polity', ' — 政体の変化ではない');
  }
}
function lifeHtml(R, target) {
  if (R.status !== 'ok') return '<div class="fh-note">' + esc(R.status === 'none' ? t('No historical record draws a polity over this place.', 'この場所に政体を描く歴史の記録はありません。') : t('The historical records could not be read here.', 'ここでは歴史の記録を読めませんでした。')) + '</div>';
  let h = '<div><span class="fh-count">' + esc(R.changes) + '</span><span class="fh-note">' + esc(R.changes === 1 ? t('change in the polity the map draws here during this life', '回、この生涯のあいだに地図がここに描く政体が変わる') : t('changes in the polity the map draws here during this life', '回、この生涯のあいだに地図がここに描く政体が変わる')) + '</span></div>';
  h += '<ol class="fh-seq">' + R.entries.map((E) => '<li>' + esc(E.name) + ' <span class="fh-src">' + esc(E.from + ' – ' + E.to + ' · ' + E.records.join(' + ')) + (E.realm ? esc(t(' · the realm over its members', ' · 構成国の上位の政体')) : '') + '</span></li>').join('') + '</ol>';
  const said = R.shifts.filter((x) => x.kind !== 'other');
  if (said.length) h += '<ol class="fh-seq">' + said.map((s) => '<li' + (s.kind === 'polity' ? '' : ' class="fh-rec"') + '>' + esc(s.text) + esc(shiftWhy(s.kind)) + '</li>').join('') + '</ol>';
  if (R.units.length) h += '<div class="fh-lbl">' + esc(t('First-level divisions here during this life', 'この生涯のあいだのここの第1級区分')) + '</div><ol class="fh-seq">' + R.units.map((u) => '<li>' + esc(u.name) + ' <span class="fh-src">' + esc(u.from + ' – ' + u.to + ' · ' + u.record) + '</span></li>').join('') + '</ol>';
  h += '<div class="fh-acts"><button type="button" class="fh-act fh-primary" data-play="' + esc(target) + '">' + esc(t('Play this life on the map', 'この生涯を地図で再生')) + '</button></div>';
  return h;
}

/* ══ ACTIONS ═════════════════════════════════════════════════════════════════════════════════════════════════════ */
/** move the clock to day k (the place card's own move — js/place-history.js goToInstant) and the map to the place */
async function goTo(k, lng, lat) {
  const PH = await PH_();
  const took = PH.goToInstant(k, 'family-history');
  try { const E = GE(); E.camera.flyTo({ center: [lng, lat], zoom: Math.max(7, Math.min(E.camera.getZoom(), 9)), duration: 1000 }); } catch (_) { /* no renderer */ }
  return took;
}
/** the instants a life is played through: its first day, every change inside it at the place, and its last day */
function lifeInstants(rec, k0, k1, PH) {
  const ks = [k0];
  for (const c of PH.changesOf(rec, k1)) if (c.k > k0 && c.k < k1) ks.push(c.k);
  ks.push(kAdd(k1, -1));
  const HS = HSc();
  return [...new Set(ks)].map((k) => { const p = kParts(k); return HS.utcAt(p[0], p[1] - 1, p[2], 12).getTime(); }).filter((ms) => isFinite(ms));
}
async function play(lng, lat, k0, k1) {
  const [PH, L] = await Promise.all([PH_(), import('./time-lapse.js')]);
  const rec = await recordAt(lng, lat);
  const minMs = (() => { try { return HSc().utcAt(IntMapTime.min, 0, 1, 0).getTime(); } catch (_) { return -Infinity; } })();
  const instants = lifeInstants(rec, k0, k1, PH).filter((ms) => ms >= minMs);
  try { const E = GE(); E.camera.flyTo({ center: [lng, lat], zoom: 6, duration: 900 }); } catch (_) { /* no renderer */ }
  return L.startLapse({ instants, owner: 'family-history', loop: false });
}
function locateDeps() {
  return WW_().then((WW) => WW.ensureHist().then(() => ({
    local: (q) => { try { return localOf ? localOf(q) || [] : []; } catch (_) { return []; } },
    hist: (q) => WW.histCandidates(q, null, lang()),
    same: (a, b) => WW.samePlace(a, b),
  })));
}
function setPlace(e, row, part) { e.lng = +row.lng; e.lat = +row.lat; e.how = part ? 'name' : 'picked'; if (part) e.by = part; else delete e.by; delete e.unfound; }
function pick(onPick) {
  const P = Pick(); if (!P) return;
  ui.picking = true;
  P.start({ panel: sheet, hint: t('Tap the map where it happened.', '出来事のあった場所を地図上でタップしてください。'), onPick: (ll) => { ui.picking = null; onPick(ll); }, onCancel: () => { ui.picking = null; } });
}
/** after a file is read: every event with a place name and no coordinates is asked of the readers once (a slice of
    the list per frame, so the page keeps answering — the time, not a count, bounds each slice) */
async function locateAll() {
  const deps = await locateDeps();
  const byText = new Map();
  for (const p of store.people) for (const e of p.events) if (e.lng == null && e.place) { if (!byText.has(e.place)) byText.set(e.place, []); byText.get(e.place).push(e); }
  const texts = [...byText.keys()];
  let one = 0, several = 0, none = 0, i = 0;
  while (i < texts.length) {
    const t0 = performance.now();
    while (i < texts.length && performance.now() - t0 < 12) {
      const res = locate(texts[i], deps), evs = byText.get(texts[i]); i++;
      if (res.status === 'one') { one++; for (const e of evs) setPlace(e, res.rows[0], res.part); }
      else if (res.status === 'several') several++;
      else { none++; for (const e of evs) e.unfound = true; }
    }
    ui.busy = t('Finding places: ' + i + ' / ' + texts.length, '場所を探しています: ' + i + ' / ' + texts.length);
    if (ui.view === 'list') paint();
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  ui.busy = null;
  return { places: texts.length, one, several, none };
}
async function importFile(file) {
  ui.busy = t('Reading ' + file.name + '…', file.name + ' を読み込み中…'); ui.report = null; paint();
  let res;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dec = decode(bytes);
    if (dec.problem) { ui.busy = null; ui.report = dec.problem === 'ansel' ? t('This file is in the ANSEL character set, which IntMap does not read. Export it again as UTF-8 from your genealogy program.', 'このファイルの文字コードは ANSEL で、IntMap は読めません。家系図ソフトから UTF-8 で書き出し直してください。') : t('This file\'s character set (' + dec.charset + ') is not one IntMap reads. Export it again as UTF-8.', 'このファイルの文字コード（' + dec.charset + '）は IntMap が読めません。UTF-8 で書き出し直してください。'); paint(); return; }
    const g = parseGedcom(dec.text);
    if (!g.people.length) { ui.busy = null; ui.report = t('No people were found in this file — is it a GEDCOM file?', 'このファイルに人物が見つかりませんでした。GEDCOM ファイルですか？'); paint(); return; }
    store = fromGedcom(g, file.name);
    ui.view = 'list'; ui.q = '';
    res = await locateAll();
    save();
    const c = g.counts;
    ui.report = t(c.people + ' people, ' + c.events + ' events (' + c.dated + ' with a date IntMap reads). Places: ' + c.located + ' events had coordinates in the file; of ' + res.places + ' place names, ' + res.one + ' were found, ' + res.several + ' name several places (choose in each person), ' + res.none + ' are not held — pick those on the map.',
      c.people + ' 人・出来事 ' + c.events + ' 件（IntMap が読める日付 ' + c.dated + ' 件）。場所: ファイルに座標があった出来事 ' + c.located + ' 件、地名 ' + res.places + ' 件のうち ' + res.one + ' 件を特定、' + res.several + ' 件は複数の場所に該当（各人物で選べます）、' + res.none + ' 件は該当なし（地図上で指定してください）。');
  } catch (e) { ui.busy = null; ui.report = t('The file could not be read: ', 'ファイルを読み込めませんでした: ') + (e && e.message ? e.message : String(e)); }
  paint(); draw();
}
function onInput(ev) {
  const el = ev.target; if (!el) return;
  if (el.classList.contains('fh-q')) { ui.q = el.value; const at = el.selectionStart; paint(); const n = sheet.querySelector('.fh-q'); if (n) { n.focus(); try { n.setSelectionRange(at, at); } catch (_) { /* search inputs */ } } }
}
function onChange(ev) {
  const el = ev.target; if (!el) return;
  if (el.classList.contains('fh-file') && el.files && el.files[0]) importFile(el.files[0]);
  else if (el.dataset && el.dataset.draft && ui.draft) {
    const k = el.dataset.draft; ui.draft[k] = el.value;
    if (k === 'place') { delete ui.draft.lng; delete ui.draft.lat; delete ui.draft.by; ui.cands = null; }
    paint();
  }
}
async function onClick(ev) {
  const b = ev.target && ev.target.closest ? ev.target.closest('button') : null; if (!b) return;
  const act = b.dataset.act;
  if (act === 'close') { closeFamily(); return; }
  if (act === 'list') { ui.view = 'list'; ui.arm = null; ui.cands = null; paint(); draw(); return; }
  if (act === 'add') { ui.view = 'add'; ui.draft = { name: '', place: '', birth: '', death: '' }; ui.cands = null; paint(); return; }
  if (act === 'disarm') { ui.arm = null; paint(); return; }
  if (act === 'import') { if (store.people.length) { ui.arm = 'import'; paint(); return; } const f = sheet.querySelector('.fh-file'); if (f) f.click(); return; }
  if (act === 'import-go') { ui.arm = null; const f = sheet.querySelector('.fh-file'); if (f) f.click(); return; }
  if (act === 'wipe') { ui.arm = 'wipe'; paint(); return; }
  if (act === 'wipe-go') { store = emptyStore(); try { localStorage.removeItem(STORE_KEY); } catch (_) { /* nothing kept */ } ui.arm = null; ui.report = null; recs.clear(); paint(); draw(); return; }
  if (b.dataset.person) { ui.view = 'person'; ui.pid = b.dataset.person; ui.arm = null; ui.cands = null; paint(); draw(); fitPerson(); return; }
  const p = ui.view === 'person' ? personById(ui.pid) : null;
  const evOf = (id) => (p ? p.events.find((e) => e.id === id) : null);
  if (b.dataset.go) { const e = evOf(b.dataset.go); if (e && !(await goTo(instantOf(e.d), e.lng, e.lat))) b.textContent = t('Before the clock\'s reach', '時計の範囲より前です'); return; }
  if (b.dataset.delev) { if (p) { p.events = p.events.filter((e) => e.id !== b.dataset.delev); save(); paint(); draw(); } return; }
  if (b.dataset.locate) {
    const e = evOf(b.dataset.locate); if (!e) return;
    const res = locate(e.place, await locateDeps());
    if (res.status === 'one') { setPlace(e, res.rows[0], res.part); save(); ui.cands = null; }
    else { ui.cands = { ev: e.id, res }; if (res.status === 'none') e.unfound = true; }
    paint(); draw(); return;
  }
  if (b.dataset.pick) { const e = evOf(b.dataset.pick); if (!e) return; pick((ll) => { setPlace(e, ll, null); save(); paint(); draw(); }); return; }
  if (b.dataset.cand) {
    const [target, i] = b.dataset.cand.split('|'); const row = ui.cands && ui.cands.res.rows[+i]; if (!row) return;
    if (target === 'draft') { Object.assign(ui.draft, { lng: row.lng, lat: row.lat, by: ui.cands.res.part }); }
    else { const e = evOf(target.slice(3)); if (e) { setPlace(e, row, ui.cands.res.part); save(); } }
    ui.cands = null; paint(); draw(); return;
  }
  if (b.dataset.play) {
    const tg = b.dataset.play;
    let lng, lat, k0, k1;
    if (tg === 'draft') { const d = ui.draft, bd = readDateInput(d.birth), dd = readDateInput(d.death); lng = d.lng; lat = d.lat; k0 = instantOf(bd); k1 = dd.k1 != null ? dd.k1 : kAdd(instantOf(dd), 1); }
    else if (p) { const W = lifeWindow(p), pl = placesOf(p)[+tg.slice(5)]; if (!W || !pl) return; lng = pl.lng; lat = pl.lat; k0 = W.k0; k1 = W.k1; }
    if (lng == null || k0 == null || k1 == null) return;
    try { const s = await play(lng, lat, k0, k1); if (s && s.error) { b.textContent = t('This life is before the clock\'s reach', 'この生涯は時計の範囲より前です'); } } catch (_) { /* the player could not be loaded; the clock is unchanged */ }
    return;
  }
  if (act === 'del-person' && p) {
    if (ui.arm !== 'del:' + p.id) { ui.arm = 'del:' + p.id; paint(); return; }
    store.people = store.people.filter((x) => x !== p);
    for (const x of store.people) for (const k of ['parents', 'spouses', 'children']) x[k] = (x[k] || []).filter((id) => id !== p.id);
    save(); ui.arm = null; ui.view = 'list'; paint(); draw(); return;
  }
  if (act === 'add-ev' && p) {
    const kind = (sheet.querySelector('#fh-ek') || {}).value || 'RESI', date = ((sheet.querySelector('#fh-ed') || {}).value || '').trim(), place = ((sheet.querySelector('#fh-ep') || {}).value || '').trim();
    if (!date && !place) return;
    const e = Object.assign({ id: newId('e'), tag: kind, date, typed: true, d: readDateInput(date) }, place ? { place } : {});
    p.events.push(e);
    if (place) { const res = locate(place, await locateDeps()); if (res.status === 'one') setPlace(e, res.rows[0], res.part); else { ui.cands = { ev: e.id, res }; if (res.status === 'none') e.unfound = true; } }
    save(); paint(); draw(); return;
  }
  if (act === 'draft-locate' && ui.draft) {
    const res = locate(ui.draft.place, await locateDeps());
    if (res.status === 'one') { Object.assign(ui.draft, { lng: res.rows[0].lng, lat: res.rows[0].lat, by: res.part }); ui.cands = null; } else ui.cands = { ev: 'draft', res };
    paint(); return;
  }
  if (act === 'draft-pick' && ui.draft) { pick((ll) => { Object.assign(ui.draft, { lng: ll.lng, lat: ll.lat }); delete ui.draft.by; paint(); }); return; }
  if (act === 'draft-save' && ui.draft) {
    const d = ui.draft;
    if (!d.name.trim() && !d.birth) return;
    const np = draftPerson(d);
    store.people.push(np); save();
    ui.view = 'person'; ui.pid = np.id; ui.draft = null; paint(); draw(); fitPerson();
  }
}

/* ══ THE MAP — every placed event as a dot while the sheet is open; the open person's larger ═════════════════════ */
const SRC = 'fh-src', LYR = 'fh-dots';
let clickBound = false;
function fc() {
  const f = [];
  for (const p of (store && store.people) || []) for (const e of p.events) {
    if (e.lng == null) continue;
    const kind = LIFE_OPENS.indexOf(e.tag) >= 0 ? 'b' : LIFE_CLOSES.indexOf(e.tag) >= 0 ? 'd' : 'o';
    f.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { p: p.id, k: kind, me: p.id === ui.pid && ui.view === 'person' ? 1 : 0 } });
  }
  return { type: 'FeatureCollection', features: f };
}
function draw() {
  try {
    const E = GE(); if (!E || !E.hasRenderer()) return;
    const data = fc();
    if (E.layers.hasSource(SRC)) { E.layers.setSourceData(SRC, data); return; }
    if (!data.features.length) return;
    E.layers.addSource(SRC, { type: 'geojson', data });
    E.layers.add({ id: LYR, type: 'circle', source: SRC, paint: {
      'circle-radius': ['case', ['==', ['get', 'me'], 1], 7, 4.5],
      'circle-color': ['match', ['get', 'k'], 'b', '#30d158', 'd', '#8e8e93', '#0a84ff'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': ['case', ['==', ['get', 'me'], 1], 2, 1], 'circle-opacity': 0.9 } });
    if (!clickBound) {
      clickBound = true;
      E.events.onLayer('click', LYR, (e) => {
        const f = e && e.features && e.features[0]; if (!f || !sheet || sheet.hidden) return;
        try { E.events.claimClick(e); } catch (_) { /* the dot still opens */ }
        ui.view = 'person'; ui.pid = f.properties.p; ui.cands = null; paint(); draw();
      });
    }
  } catch (_) { /* the sheet is the answer; the dots are an aid */ }
}
function undraw() {
  try { const E = GE(); if (E && E.layers.hasSource(SRC)) E.layers.setSourceData(SRC, { type: 'FeatureCollection', features: [] }); } catch (_) { /* nothing drawn */ }
}
function fitPerson() {
  const p = personById(ui.pid); if (!p) return;
  const pts = placesOf(p); if (!pts.length) return;
  try {
    const E = GE();
    if (pts.length === 1) { E.camera.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 6, duration: 900 }); return; }
    const xs = pts.map((x) => x.lng), ys = pts.map((x) => x.lat);
    E.camera.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 64, duration: 900, maxZoom: 7 });
  } catch (_) { /* no renderer */ }
}

/* ══ ATLAS — `time.lifeAtPlace` (js/atlas-cap-time.js) ═══════════════════════════════════════════════════════════
   a = { from, to?, name?, play?, open? }; pt = the point (js/atlas-cap-time.js `pointOf`); K = the kernel's internals */
export async function atlasRun(a, K, pt) {
  const R = K.R, warn = K.warn, note = K.note, L = K.L, lg = (K.HOST && K.HOST.lang) || 'en';
  /* a bare number is an astronomical year (0 is 1 BC — the clock's numbering, as every time.* capability reads a year) */
  const asDate = (v) => {
    if (v == null || String(v).trim() === '') return null;
    const s = String(v).trim();
    if (/^-?\d{1,6}$/.test(s)) { const y = +s; return readDateInput(y <= 0 ? (1 - y) + ' BC' : String(y)); }
    return readDateInput(s);
  };
  const fd = asDate(a.from), td = asDate(a.to);
  if (!fd || fd.problem) return R(false, warn(esc(L('"from" is the first day of the life: a date (YYYY-MM-DD), a year, or a GEDCOM date such as "ABT 1905".', '「from」は生涯の最初の日です。日付（YYYY-MM-DD）・年・GEDCOM の日付（例 "ABT 1905"）で指定してください。'))), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
  if (td && td.problem) return R(false, warn(esc(L('"to" is not a date IntMap can read: ', '「to」は IntMap が読める日付ではありません: ') + td.raw)), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
  const k0 = instantOf(fd);
  const PH = await PH_();
  const today = PH.kOf(new Date());
  const k1 = td ? (td.k1 != null ? td.k1 : kAdd(instantOf(td), 1)) : kAdd(today, 1);
  if (!(k1 > k0)) return R(false, warn(esc(L('"to" is before "from".', '「to」が「from」より前です。'))), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
  let rec;
  try { rec = await recordAt(pt.lng, pt.lat); } catch (e) { rec = null; }
  if (!rec || (rec.nation && rec.nation.status === 'unavailable')) return R(false, warn(esc(L('The historical border records could not be read.', '歴史国境の記録を読み込めませんでした。'))), { meta: { code: 'UNAVAILABLE', category: 'transient', retryable: true, produced: [], userGoalSatisfied: false } });
  const born = atEvent(rec, fd, lg, PH), died = td ? atEvent(rec, td, lg, PH) : null, life = lifeAt(rec, k0, k1, lg, PH);
  const ttl = pt.name || (pt.lat.toFixed(4) + ', ' + pt.lng.toFixed(4));
  const facts = {
    at: { lng: pt.lng, lat: pt.lat, name: pt.name || null }, from: PH.isoOfK(k0), to: PH.isoOfK(k1), toIsFirstDayAfter: true, toIsToday: !td,
    datesAre: 'astronomical YYYY-MM-DD',
    atStart: { polities: born.polities.map((p) => p.name), subdivisions: born.units.map((u) => u.name), changesWithinTheDate: born.within.map((c) => ({ date: PH.isoOfK(c.k), change: c.text })) },
    atEnd: died ? { polities: died.polities.map((p) => p.name), subdivisions: died.units.map((u) => u.name), changesWithinTheDate: died.within.map((c) => ({ date: PH.isoOfK(c.k), change: c.text })) } : null,
    changesCounted: life.changes,
    changes: life.shifts.map((s) => ({ date: PH.isoOfK(s.k), change: s.text, kind: s.kind })),
    polities: life.entries.map((E) => ({ name: E.name, from: E.from, to: E.to, records: E.records, realm: E.realm || undefined })),
    subdivisions: life.units.map((u) => ({ name: u.name, from: u.from, to: u.to, record: u.record })),
    records: ((rec.nation && rec.nation.records) || []).map((r) => r.src).filter(Boolean),
  };
  const did = [];
  if (a.play) { try { const s = await play(pt.lng, pt.lat, k0, k1); if (s && s.playing) did.push(L('playing the life on the map (' + s.total + ' instants)', '生涯を地図で再生中（' + s.total + ' 時点）')); } catch (_) { /* below: not playing */ } }
  if (a.open) { await openFamily({ lang: () => lg, local: (q) => { try { return K.HOST.localFuzzyPlaces(q) || []; } catch (_) { return []; } }, draft: { name: a.name ? String(a.name) : '', place: pt.name || '', lng: pt.lng, lat: pt.lat, birth: fd.raw, death: td ? td.raw : '' } }); did.push(L('opened Family history across borders with this life (not kept until the reader presses «Keep»)', '「家族史と国境」をこの生涯で開いた（読者が「保存」を押すまでは保存しない）')); }
  const lines = [
    L('From ', '始まり ') + dateWords(fd, lg) + ': ' + (born.polities.map((p) => p.name).join(' / ') || L('no record draws a polity', '政体を描く記録なし')) + (born.units.length ? ' · ' + born.units.map((u) => u.name).join(' / ') : ''),
    died ? L('To ', '終わり ') + dateWords(td, lg) + ': ' + (died.polities.map((p) => p.name).join(' / ') || L('no record draws a polity', '政体を描く記録なし')) + (died.units.length ? ' · ' + died.units.map((u) => u.name).join(' / ') : '') : L('To today', '今日まで'),
    L('Changes in the polity the map draws here: ', 'ここで地図が描く政体の変化: ') + life.changes,
  ].concat(life.shifts.map((s) => '· ' + s.text + shiftWhy(s.kind)));
  const html = note('✓ ' + esc(L('A life at ', '生涯と国境 — ') + ttl)) + (did.length ? ' — ' + esc(did.join(' · ')) : '')
    + '<div>' + lines.map(esc).join('<br>') + '</div><div style="font-size:12px;color:var(--text-muted);">' + esc(L('What IntMap\'s historical records draw over this point (legal sovereignty as they date it, not wartime control).', 'IntMap の歴史の記録がこの地点に描くもの（各記録が日付を与えた法的な帰属で、戦時の実効支配ではありません）。')) + '</div>';
  if (a.play && !did.length) return R(false, warn(esc(L('The life could not be played', '再生を開始できませんでした'))) + html, { meta: { code: 'LAPSE_NOT_STARTED', category: 'transient', retryable: true, produced: ['explanation'], userGoalSatisfied: false }, exec: { lifeAtPlace: facts } });
  return R(true, html, { exec: { lifeAtPlace: facts } });
}
