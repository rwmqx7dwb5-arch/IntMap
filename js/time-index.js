/* ============================================================================
 *  IntMap · js/time-index.js — THE ONE INDEX OF DATED EVENTS, AND ITS TWO CUTS  (time-index-unify)
 * ----------------------------------------------------------------------------
 *  Three readers used to index the same dated events three times, each on its own axis:
 *    · «On this day» (js/on-this-day.js) read data/on-this-day.json — the border record's change days and the war
 *      record's dated events, by CALENDAR DAY;
 *    · the year book (js/year-book.js) read the border record and data/wars.json again, by YEAR, with its own rules;
 *    · the dashboard's «World events» (js/analysis-world-events.js) read a hand-written table of 132 rows — a year,
 *      a pin and a sentence each, none citing anything, and a year range of its own that ignored the map's clock.
 *  Now there is one index — data/on-this-day.json, written by scripts/build-on-this-day.mjs — and this file is the
 *  one place that knows its records, their sources and their precision, and cuts it:
 *    · BY CALENDAR DAY (`onDay`) — what «On this day», its pages and Atlas's `time.onThisDay` read;
 *    · BY YEAR (`inYear`) — what the year book and Atlas's `time.yearbook` read;
 *    · UP TO AN INSTANT (`upTo`) — what the «World events» view reads: what had happened by the clock's instant.
 *
 *  ══ A RECORD ════════════════════════════════════════════════════════════════════════════════════
 *    { d, src, … }  `d` is the date the record states, written to its precision: '1990-10-03' (a day), '1918-01' (a
 *    month), '1917' (a year). `src` names the record it comes from, and `sourceOf` says it in words with the date's
 *    precision — EVERY record answers both (tests/time-index-unify-checks.test.mjs holds that):
 *      cshapes   a day the border record (CShapes 2.0) begins / stops drawing or redraws a polity — `days` only;
 *                a 1 January day is `maybeYearOnly` (the record may state only the year);
 *      wars      an operation of IntMap's war record (data/wars.json), its own full date (`d2` where it lasts);
 *      wikidata  an event Wikidata states, cited by its item (`q`) and the property that dated it (`prop`), at the
 *                precision Wikidata gives (`prec`) — `events` only (scripts/fetch-world-events.mjs says which and why).
 *  ⚠ THE CALENDAR CUT IS THE MAP'S RECORDS ONLY. `days` holds what the border and war records date by the day — the
 *  promise the day pages make («what the records the map draws state on this day»). The Wikidata events are in the
 *  same index (`events`) and in the year and instant cuts, not in the calendar pages.
 *  ⚠ NODE-LOADABLE: the pure half below is imported by the index builder and the checks.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
/* ⚠ STATIC: both are in the start-up bundle (see the note in js/on-this-day.js on why a dynamic import of one would split it) */
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';

export const INDEX_PATH = 'data/on-this-day.json';

/* ══ THE RECORDS ═══════════════════════════════════════════════════════════════════════════════════ */
/** the war record's dated events as index records — the ONE reading of data/wars.json's events, used by the index
 *  builder (names narrowed to `langs`) and by the year book (every language the record writes). Only a full date is a
 *  day; an event without one is not a record here. */
export function warRecords(W, langs) {
  const out = [];
  const narrow = (n) => { if (!langs || !n) return n; const o = {}; for (const l of langs) if (n[l] != null) o[l] = n[l]; return o; };
  for (const w of (W && W.wars) || []) {
    for (const e of w.events || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.d || ''))) continue;
      const ev = { d: e.d, src: 'wars', war: w.id, kind: e.kind || '', name: narrow(e.name) };
      if (e.d2) ev.d2 = e.d2;
      if (Array.isArray(e.at)) ev.at = e.at.map((x) => Math.round(x * 1000) / 1000);
      if (e.wiki) ev.wiki = e.wiki;
      out.push(ev);
    }
  }
  return out;
}
/** every record of the index: the calendar cut's (days) and the dated events beside it */
export function records(idx) {
  return Object.values((idx && idx.days) || {}).flat().concat((idx && idx.events) || []);
}

/* ══ DATES AND THEIR PRECISION ═════════════════════════════════════════════════════════════════════ */
const parts = (s) => { const m = /^(-?\d+)(?:-(\d\d))?(?:-(\d\d))?$/.exec(String(s == null ? '' : s)); return m ? [+m[1], m[2] ? +m[2] : 0, m[3] ? +m[3] : 0] : null; };
/** the year a record's date names */
export const yearOf = (rec) => { const p = parts(rec && rec.d); return p ? p[0] : NaN; };
/** a record's span as comparable day keys (y·10⁴ + m·10² + d): a year runs 01-01 … 12-31, a month 01 … 31 */
export function spanOf(rec) {
  const a = parts(rec && rec.d), b = parts((rec && rec.d2) || (rec && rec.d));
  if (!a || !b) return null;
  return [a[0] * 10000 + (a[1] || 1) * 100 + (a[2] || 1), b[0] * 10000 + (b[1] || 12) * 100 + (b[2] || 31)];
}
/** the precision a record's date is stated to: 'day' | 'month' | 'year' | 'day-or-year' (a border record's 1 January) */
function precisionOf(rec) {
  if (rec && rec.prec) return rec.prec;
  return rec && rec.maybeYearOnly ? 'day-or-year' : 'day';
}
/** where a record comes from, in words, and its precision: { source, precision, cite } — `cite` is the reference a
 *  reader can follow (the Wikidata item and property; the war record's article) */
export function sourceOf(rec, idx) {
  const S = (idx && idx.src) || {};
  if (!rec) return null;
  if (rec.src === 'wikidata') return { source: S.wikidata || 'Wikidata', precision: precisionOf(rec), cite: { q: rec.q, prop: rec.prop, url: 'https://www.wikidata.org/wiki/' + rec.q } };
  if (rec.src === 'wars') return { source: S.wars || 'data/wars.json', precision: precisionOf(rec), cite: rec.wiki ? { wiki: rec.wiki } : null };
  if (rec.src === 'cshapes') return { source: S.cshapes || 'CShapes 2.0', precision: precisionOf(rec), cite: null };
  return null;
}

/* ══ THE CUTS ══════════════════════════════════════════════════════════════════════════════════════ */
/** the calendar cut: the records of 'MM-DD', oldest first (the index's order) */
export const onDay = (idx, md) => ((idx && idx.days && idx.days[md]) || []).slice();
/** the year cut: the records whose span meets `year`, oldest first */
export function inYear(list, year) {
  const y0 = year * 10000 + 101, y1 = year * 10000 + 1231;
  return (list || []).filter((r) => { const s = spanOf(r); return s && s[0] <= y1 && s[1] >= y0; })
    .sort((a, b) => spanOf(a)[0] - spanOf(b)[0]);
}
/** the instant cut: the records that had begun by `when` (a Date — its calendar day), newest first */
export function upTo(list, when) {
  const k = when.getFullYear() * 10000 + (when.getMonth() + 1) * 100 + when.getDate();
  return (list || []).filter((r) => { const s = spanOf(r); return s && s[0] <= k; })
    .sort((a, b) => spanOf(b)[0] - spanOf(a)[0]);
}

/* ══ WORDS FOR A WIKIDATA RECORD (IntMap's own words: en + jp — CONSTITUTION.md §7) ═════════════════ */
/* what the property that dated the record says happened on that date ('' for a point in time: the date says it) */
function propWord(prop, lang) {
  const T = IntMapLang.pick(() => lang);
  switch (prop) {
    case 'P580': return T('began', '開始');
    case 'P571': return T('founded', '成立');
    case 'P1619': return T('opened', '開通・開業');
    case 'P606': return T('first flight', '初飛行');
    case 'P619': return T('launched', '打ち上げ');
    case 'P575': return T('discovered', '発見');
    case 'P577': return T('published', '発表');
    default: return '';
  }
}
/** the record's name and description in the reader's language (as Wikidata writes them; English where it has none) */
export const eventName = (rec, lang) => (rec && rec.name && (rec.name[lang] || rec.name.en)) || '';
export const eventDesc = (rec, lang) => (rec && rec.desc && (rec.desc[lang] || rec.desc.en)) || '';
/** '1912-04-14' / '1918-01' / '1917', with what the date is (began / opened …) and its calendar when not the Gregorian */
export function dateWords(rec, lang) {
  const w = propWord(rec && rec.prop, lang);
  let s = String((rec && rec.d) || '');
  if (w) s = IntMapLang.t(lang, w + ' ' + s, s + ' ' + w);
  if (rec && rec.cal === 'julian') s += IntMapLang.t(lang, ' (Julian calendar)', '（ユリウス暦）');
  return s;
}

/* ══ THE INDEX, READ ONCE ═══════════════════════════════════════════════════════════════════════════ */
let _idx = null;
/** the index, through the app's one clocked reader (js/fetch-deadline.js) — read the first time a reader asks */
export async function loadIndex() {
  if (!_idx) _idx = jsonWithin(INDEX_PATH, clockFor(INDEX_PATH)).catch((e) => { _idx = null; throw e; });
  return _idx;
}
