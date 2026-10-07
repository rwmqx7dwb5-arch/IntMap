/* ============================================================================
 *  IntMap · js/where-when.js — «WHERE + WHEN» IN ONE FIELD   (where-when-search)
 * ----------------------------------------------------------------------------
 *  The search field and the command palette (Ctrl/⌘+K) used to find a PLACE or a FUNCTION. A reader of a
 *  map that reaches from today back to 123,000 BC also asks for an instant: 「京都 1600」, «Berlin May 1945»,
 *  「ローマ 紀元前44年」, «Constantinople 1453», 「1900年の上海」, 「江戸 1868-01」, 「慶長5年 京都」. This module is
 *  the ONE reading of such a line. Every door asks it — the search field (js/search-geocode.js, the phone's
 *  search sheet is the same field), the palette (js/command-palette.js) and Atlas (`time.whereWhen`,
 *  js/atlas-cap-time.js) — so the three cannot come to read 「紀元前44年」 differently.
 *
 *  ── THE DATE IS PARSED AS SYNTAX, NOT LOOKED UP (.agents/rules/no-ad-hoc-hardcoding.md) ─────────────────────
 *    · the era WORDS (BC · AD · 紀元前 · 西暦 · v. Chr. · 公元前 …) and the MONTH NAMES (May · Mai · mai …) are read
 *      from the platform's CLDR data through `Intl.DateTimeFormat`, for every language the registry declares
 *      (js/lang-registry.js) — the same source js/hist-scale.js `yearText` writes them with, so a year the map
 *      prints can be typed back. Nothing here spells a month or an era.
 *    · the JAPANESE ERA NAMES (和暦: 慶長, 明治, 令和 …) are ICU's japanese calendar (`ja-u-ca-japanese`), read
 *      back by sampling it (`japaneseEras`), 大化 (645) onward. ICU numbers an era's years against the
 *      Gregorian year it began in, so the conversion is to a YEAR. Before 明治6年 (1873-01-01, when Japan
 *      adopted the Gregorian calendar) a 和暦 month and day are lunisolar; no converter for them exists in
 *      this repository or the platform, so they are NOT converted — the year is used and the reader is told.
 *    · other calendars' era names (a Chinese reign title, a regnal year) are not converted, and the parse
 *      says so (`problem`) rather than reading the digits as a Common Era year.
 *    · the instant is the master clock's own arithmetic: astronomical years (1 BC = 0) through js/hist-scale.js
 *      `fromEra` / `utcAt`, proleptic Gregorian as `Date` counts. A date is taken as written — Julian dates are
 *      not converted (a 1453 date is read in the calendar the clock counts in).
 *  ── WHAT IS STILL WRITTEN HERE, AND WHY ────────────────────────────────────────────────────────────────────
 *    · CLDR's `alt="variant"` English era abbreviations BCE / CE (common/main/en.xml `eraAbbr`), which
 *      `Intl` does not expose. EXPIRES if `Intl` gains a way to request variant era names.
 *    · the connective words left between a place and its time (の・に・頃 / in · at · around · circa …) — the
 *      grammar's closed class of function words, not a list of places or dates.
 *    · a bare number is a year only at the END of the line (or as the whole line) and only with 3–4 digits
 *      not after today: a house number LEADS an address («1600 Pennsylvania Avenue»), a postcode has 4–5
 *      digits, and «Route 66» is not 66 AD. A year with an era word, a month or 年 is a year anywhere.
 *  ── THE PLACE ──────────────────────────────────────────────────────────────────────────────────────────────
 *  The place part goes to the readers that already exist — nothing new is fetched from a new upstream:
 *    · the device's gazetteer (the search's own `localFuzzyPlaces`, handed in by the caller);
 *    · the historical city names (data/hist-cities.json, js/hist-cities.js — 6,474 cities, every span's name
 *      in every language it carries, and the city's spellings of today);
 *    · Pleiades' dated settlement names (data/hist-places.json, js/hist-places.js).
 *  So 「Constantinople 1453」 finds Istanbul by the name it had, and 「京都 1600」 says what the record called
 *  the city that year when the record says it was called something else.
 *  ── ONE PASS WHEN THE READING IS ONE PLACE, A CHOICE ONLY WHEN IT IS NOT (.agents/rules/one-pass-or-a-reason.md) ──
 *  The interpretation is a row — «place · year» — visible while the line is typed. When it is ONE place (one
 *  candidate whose whole name is the place typed, the records' copies of one city counted once — `samePlace`) or
 *  an instant with no place, the first Enter (Atlas: the first call) goes there and sets the clock; only when
 *  several places answer are they offered to choose from. `applyWhen` is what a chosen reading does to the clock;
 *  a past instant on the clock IS the historical map (borders, subdivisions, city names and Pleiades all follow
 *  js/chronos.js).
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';

const HS = () => { try { return (typeof window !== 'undefined' && window.IntMapHistScale) || null; } catch (_) { return null; } };
/* js/hist-scale.js owns the two rules; the bodies below are its own, for a context in which it has not evaluated */
function utcAt(y, mo, d, h) {
  const S = HS(); if (S && S.utcAt) return S.utcAt(y, mo, d, h);
  const t = new Date(0); t.setUTCFullYear(Math.round(+y) || 0, mo || 0, d == null ? 1 : d); t.setUTCHours(h || 0, 0, 0, 0); return t;
}
function fromEra(n, bce) { const S = HS(); if (S && S.fromEra) return S.fromEra(n, bce); const v = Math.abs(Math.round(+n) || 0); return bce ? 1 - v : v; }

/* ══ THE VOCABULARY, READ FROM THE PLATFORM ════════════════════════════════════════════════════════════════ */
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function tags() {
  const out = new Set(['en']);
  try { IntMapLang.list().forEach((l) => { if (l && l.html) out.add(l.html); }); } catch (_) { }
  return Array.from(out);
}
/* CLDR en.xml eraAbbr alt="variant" — see the header */
const CLDR_VARIANT_ERAS = { bce: ['BCE'], ce: ['CE'] };
let _vocab = null;
/** the era words and month names of every declared language, as regular-expression sources */
export function vocabulary() {
  if (_vocab) return _vocab;
  const bce = new Set(CLDR_VARIANT_ERAS.bce), ce = new Set(CLDR_VARIANT_ERAS.ce), months = new Map();
  const B = utcAt(-43, 5, 15, 12), C = utcAt(1600, 5, 15, 12);
  for (const tag of tags()) {
    for (const era of ['short', 'long', 'narrow']) {
      try {
        const f = new Intl.DateTimeFormat(tag, { era, year: 'numeric', timeZone: 'UTC' });
        const eb = (f.formatToParts(B).find((p) => p.type === 'era') || {}).value, ec = (f.formatToParts(C).find((p) => p.type === 'era') || {}).value;
        /* a one-letter era («B», «A») would match the initial of any word */
        if (eb && eb.replace(/[.\s]/g, '').length >= 2) bce.add(eb.trim());
        if (ec && ec.replace(/[.\s]/g, '').length >= 2) ce.add(ec.trim());
      } catch (_) { }
    }
    for (const style of ['long', 'short']) {
      try {
        const f = new Intl.DateTimeFormat(tag, { month: style, timeZone: 'UTC' });
        for (let m = 0; m < 12; m++) {
          const name = f.format(utcAt(2001, m, 15, 12)).trim();
          if (!name || /\d/.test(name)) continue;   /* 「5月」 is the CJK grammar below, not a name */
          const key = name.replace(/\.$/, '').toLocaleLowerCase();
          if (key.length >= 3 && !months.has(key)) months.set(key, m + 1);
        }
      } catch (_) { }
    }
  }
  /* a word is matched with its dots optional and its spaces flexible («B.C.», «v Chr», «BC») */
  const src = (w) => {
    const letters = w.replace(/\./g, '');
    const body = /^[A-Za-z]+$/.test(letters) && letters.length <= 4 && letters === letters.toUpperCase()
      ? letters.split('').map((c) => esc(c) + '\\.?').join('')
      : w.split('').map((c) => c === '.' ? '\\.?' : (/\s/.test(c) ? '\\s*' : esc(c))).join('');
    return /[A-Za-z]/.test(letters) ? '(?<![\\p{L}])' + body + '(?![\\p{L}])' : body;
  };
  const alt = (set) => Array.from(set).sort((a, b) => b.length - a.length).map(src).join('|');
  _vocab = { bce: alt(bce), ce: alt(ce), bceWords: Array.from(bce), ceWords: Array.from(ce),
    month: Array.from(months.keys()).sort((a, b) => b.length - a.length).map((k) => esc(k) + '\\.?').join('|'), months };
  return _vocab;
}

/* ══ THE JAPANESE ERAS, READ BACK FROM ICU ═════════════════════════════════════════════════════════════════
   An era's year n is the Gregorian year (start + n − 1) in ICU's japanese calendar, so ONE sample of an era is
   enough to know where it begins. The calendar is sampled on 1 January and 31 December of every year from 645
   (大化, the first era ICU carries) to today, and twice a month inside every year whose two ends disagree — an
   era shorter than a year (暦仁: 74 days) lies wholly inside such a year. Measured: ~4,000 formats, a few ms. */
let _eras = null;
export function japaneseEras() {
  if (_eras) return _eras;
  const map = new Map();
  let ja = null, en = null;
  try {
    ja = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric', timeZone: 'UTC' });
    en = new Intl.DateTimeFormat('en-u-ca-japanese', { era: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch (_) { _eras = map; return map; }
  const read = (f, d) => { const ps = f.formatToParts(d); const e = ps.find((p) => p.type === 'era'), y = ps.find((p) => p.type === 'year');
    if (!e || !y) return null; const n = y.value === '元' ? 1 : parseInt(y.value, 10); return Number.isFinite(n) ? { era: e.value, n } : null; };
  const note = (d, gy) => {
    const a = read(ja, d); if (!a || a.n < 1) return null;
    if (!map.has(a.era)) {
      const b = read(en, d);
      map.set(a.era, { name: a.era, en: b ? b.era.replace(/\s*\(.*\)\s*$/, '') : '', start: gy - a.n + 1 });
    }
    return a.era;
  };
  const yNow = new Date().getUTCFullYear();
  for (let y = 645; y <= yNow; y++) {
    const a = note(utcAt(y, 0, 1, 12), y), b = note(utcAt(y, 11, 31, 12), y);
    if (a !== b) for (let m = 0; m < 12; m++) { note(utcAt(y, m, 1, 12), y); note(utcAt(y, m, 15, 12), y); }
  }
  _eras = map;
  return map;
}

/* ══ THE PARSE ═════════════════════════════════════════════════════════════════════════════════════════════ */
const JP_PARTICLES = '(?:の|に|で|頃|ごろ|ころ|時代)';
const LATIN_LINKS = '(?:in|at|on|of|around|circa|c\\.|ca\\.|during|year)';
function tidyPlace(s) {
  let t = String(s || '').replace(/\s+/g, ' ');
  const edge = new RegExp('^(?:[\\s,、。・·\\-–—/()（）]+|' + JP_PARTICLES + '(?=\\S)|' + LATIN_LINKS + '(?=\\s))+|(?:[\\s,、。・·\\-–—/()（）]+|' + JP_PARTICLES + '|(?<=\\s)' + LATIN_LINKS + ')+$', 'iu');
  for (let i = 0; i < 4; i++) { const n = t.replace(edge, '').trim(); if (n === t) break; t = n; }
  return t.trim();
}
const num = (s) => parseInt(s, 10);
const validMD = (m, d) => (m == null || (m >= 1 && m <= 12)) && (d == null || (d >= 1 && d <= 31));

/**
 * Read a line for a place and an instant.
 * @param {string} text
 * @param {{min?:number, now?:Date}} [opts]  the clock's floor (astronomical year) and today
 * @returns {{input:string, place:string, when:null|{y:number,m:number|null,d:number|null,precision:'year'|'month'|'day',
 *   calendar:'gregorian'|'japanese', form:string, matched:string, era?:{name:string,n:number}, dropped?:string},
 *   problem:null|{code:string, text?:string, min?:number}}}
 */
export function parse(text, opts) {
  const o = opts || {};
  const input = String(text == null ? '' : text);
  const s = input.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const out = { input, place: s, when: null, problem: null };
  if (!s || !/\d|元\s*年/.test(s)) return out;
  const V = vocabulary();
  const now = o.now || new Date();
  const yNow = now.getUTCFullYear();
  let hit = null;   /* { start, end, y, m, d, calendar, form, era?, dropped? } */

  /* ① ISO: 1868-01 · 1945-05-08 · -0043-03-15 (astronomical, as ECMA writes it) */
  if (!hit) {
    const re = /(?<![\p{L}\p{N}])(-?\d{1,6})-(\d{1,2})(?:-(\d{1,2}))?(?![\p{N}-])/u, m = re.exec(s);
    if (m && validMD(num(m[2]), m[3] ? num(m[3]) : null)) hit = { start: m.index, end: m.index + m[0].length, y: num(m[1]), m: num(m[2]), d: m[3] ? num(m[3]) : null, calendar: 'gregorian', form: 'iso' };
  }
  /* ② 和暦: <era>(n|元)年[m月[d日]] — the era name is the longest suffix of the Han run before the number that ICU knows */
  if (!hit) {
    const re = /(\d{1,3}|元)\s*年(?:\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?)?/gu; let m;
    while ((m = re.exec(s))) {
      const before = s.slice(0, m.index).replace(/\s+$/, ''), run = (before.match(/[\p{Script=Han}]{1,8}$/u) || [''])[0];
      if (!run) { if (m[1] === '元') { out.problem = { code: 'unknown-era', text: '元年' }; return out; } continue; }
      if (new RegExp('(?:' + V.bce + '|' + V.ce + ')$', 'iu').test(before)) continue;   /* 紀元前44年 is ③ */
      const E = japaneseEras(); let era = null;
      for (let k = Math.min(4, run.length); k >= 2 && !era; k--) { const cand = run.slice(run.length - k); if (E.has(cand)) era = E.get(cand); }
      if (!era) {
        /* a Han word attached to 「元年」 can only be an era name — one ICU does not carry is not converted */
        if (m[1] === '元') { out.problem = { code: 'unknown-era', text: run + '元年' }; return out; }
        /* …and so can a Han word written AGAINST a one- or two-digit year (「康熙5年」, 「乾隆30年」): a reign counts its
           years from one, and a place typed against a year of the first century is not a form anyone writes. A
           four-digit year against a place (「京都1600年」) is the place and ③'s year. */
        if (before === s.slice(0, m.index) && run.length >= 2 && run.length <= 4 && m[1].length <= 2) { out.problem = { code: 'unknown-era', text: run + m[1] + '年' }; return out; }
        continue;
      }
      const n = m[1] === '元' ? 1 : num(m[1]); if (n < 1) continue;
      const y = era.start + n - 1;
      let mo = m[2] ? num(m[2]) : null, d = m[3] ? num(m[3]) : null, dropped;
      if (!validMD(mo, d)) continue;
      if (mo != null && y < 1873) { dropped = 'lunisolar'; mo = null; d = null; }
      const start = before.length - era.name.length;
      hit = { start, end: m.index + m[0].length, y, m: mo, d, calendar: 'japanese', form: 'wareki', era: { name: era.name, n }, dropped };
      break;
    }
  }
  /* ③ CJK Gregorian: [紀元前|西暦]n年[m月[d日]] */
  if (!hit) {
    const re = new RegExp('(?:(' + V.bce + ')|(' + V.ce + '))?\\s*(\\d{1,6})\\s*年(?:\\s*(\\d{1,2})\\s*月(?:\\s*(\\d{1,2})\\s*日)?)?', 'iu'), m = re.exec(s);
    if (m && num(m[3]) >= 1 && validMD(m[4] ? num(m[4]) : null, m[5] ? num(m[5]) : null))
      hit = { start: m.index, end: m.index + m[0].length, y: fromEra(num(m[3]), !!m[1]), m: m[4] ? num(m[4]) : null, d: m[5] ? num(m[5]) : null, calendar: 'gregorian', form: m[1] ? 'era' : 'cjk' };
  }
  /* ④ a month name: [d] Month [d,] [era] year [era] — «May 1945», «8 May 1945», «May 8, 1945», «15 March 44 BC» */
  if (!hit && V.month) {
    const ORD = '(?:st|nd|rd|th)?';
    const re = new RegExp('(?<![\\p{L}\\p{N}])(?:(\\d{1,2})' + ORD + '\\.?\\s+)?(' + V.month + ')(?![\\p{L}])(?:\\s+(\\d{1,2})' + ORD + ',?)?\\s+(?:(' + V.bce + ')|(' + V.ce + '))?\\s*(\\d{1,6})(?:\\s*(?:(' + V.bce + ')|(' + V.ce + ')))?(?![\\p{L}\\p{N}])', 'iu');
    const m = re.exec(s);
    if (m) {
      const mo = V.months.get(m[2].replace(/\.$/, '').toLocaleLowerCase()), d = m[1] ? num(m[1]) : (m[3] ? num(m[3]) : null);
      const bce = !!(m[4] || m[7]), n = num(m[6]);
      if (mo && n >= 1 && validMD(mo, d)) hit = { start: m.index, end: m.index + m[0].length, y: fromEra(n, bce), m: mo, d, calendar: 'gregorian', form: 'month' };
    }
  }
  /* ⑤ a year with an era word: 44 BC · AD 800 · 323 v. Chr. */
  if (!hit) {
    const re = new RegExp('(?:(?:(' + V.bce + ')|(' + V.ce + '))\\s*(\\d{1,6})(?![\\p{N}]))|(?:(?<![\\p{L}\\p{N}])(\\d{1,6})\\s*(?:(' + V.bce + ')|(' + V.ce + ')))', 'iu'), m = re.exec(s);
    if (m) { const n = num(m[3] || m[4]), bce = !!(m[1] || m[5]);
      if (n >= 1) hit = { start: m.index, end: m.index + m[0].length, y: fromEra(n, bce), m: null, d: null, calendar: 'gregorian', form: 'era' }; }
  }
  /* ⑥ a bare year: 3–4 digits, the last token of the line (or the whole line), not after today — see the header */
  if (!hit) {
    const m = /(?:^|[\s,、])(\d{3,4})$/u.exec(s);
    if (m && num(m[1]) <= yNow) hit = { start: m.index + m[0].length - m[1].length, end: s.length, y: num(m[1]), m: null, d: null, calendar: 'gregorian', form: 'bare' };
  }
  if (!hit) return out;
  const when = { y: hit.y, m: hit.m, d: hit.d, precision: hit.d != null ? 'day' : (hit.m != null ? 'month' : 'year'),
    calendar: hit.calendar, form: hit.form, matched: s.slice(hit.start, hit.end).trim() };
  if (hit.era) when.era = hit.era;
  if (hit.dropped) when.dropped = hit.dropped;
  out.place = tidyPlace(s.slice(0, hit.start) + ' ' + s.slice(hit.end));
  out.when = when;
  const min = Number.isFinite(o.min) ? o.min : clockMin();
  if (when.y < min) out.problem = { code: 'before-floor', min };
  else if (when.y > yNow || (when.precision !== 'year' && instantOf(when).getTime() > now.getTime())) out.problem = { code: 'future' };
  return out;
}
function clockMin() { try { const v = IntMapTime.min; return Number.isFinite(v) ? v : 1; } catch (_) { return 1; } }

/** the instant the clock is set to for a reading — a year is mid-June noon UTC (js/chronos.js `setYear`), a month its 15th */
function instantOf(when) {
  if (!when) return null;
  if (when.precision === 'day') return utcAt(when.y, when.m - 1, when.d, 12);
  if (when.precision === 'month') return utcAt(when.y, when.m - 1, 15, 12);
  return utcAt(when.y, 5, 15, 12);
}
/** the clock's YYYYMMDD integer for an instant — the encoding data/hist-cities.json writes its spans in */
function dnum(d) { return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }

/* ══ THE READING, IN THE READER'S WORDS ════════════════════════════════════════════════════════════════════ */
/** «1600», 「1600年（慶長5年）」, «44 BC», «May 1945», 「1945年5月8日」 */
export function whenText(when, lang) {
  if (!when) return '';
  const tag = IntMapLang.htmlTag(lang), jp = IntMapLang.normalise(lang) === 'jp', S = HS();
  let t;
  if (when.precision === 'day') t = (S && S.dateText) ? S.dateText(when.y, when.m, when.d, tag) : when.y + '-' + when.m + '-' + when.d;
  else if (when.precision === 'month') {
    const opt = { year: 'numeric', month: 'long', timeZone: 'UTC' }; if (when.y < 1) opt.era = 'short';
    try { t = new Intl.DateTimeFormat(tag, opt).format(instantOf(when)); } catch (_) { t = when.y + '-' + when.m; }
  } else t = (S && S.yearText) ? S.yearText(when.y, tag, jp ? '年' : undefined) : (when.y >= 1 ? String(when.y) : (1 - when.y) + ' BCE');
  if (when.era) t += jp ? '（' + when.era.name + (when.era.n === 1 ? '元' : when.era.n) + '年）' : ' (' + (japaneseEras().get(when.era.name) || {}).en + ' ' + when.era.n + ')';
  return t;
}
/** what the parse could not do, in words — null when there is nothing to say */
export function problemText(parsed, lang) {
  const L = (en, jp) => IntMapLang.t(lang, en, jp);
  const out = [];
  const p = parsed && parsed.problem, w = parsed && parsed.when;
  if (p && p.code === 'unknown-era') out.push(L('«' + p.text + '» is not an era this search can convert. It reads Common Era years, years before the Common Era and Japanese era names.', '「' + p.text + '」は変換できる元号ではありません。西暦・紀元前・和暦に対応しています。'));
  if (p && p.code === 'before-floor') out.push(L('Chronos reaches back to ' + whenText({ y: p.min, precision: 'year' }, lang) + '.', 'Chronos は ' + whenText({ y: p.min, precision: 'year' }, lang) + 'まで遡れます。'));
  if (p && p.code === 'future') out.push(L('That instant is in the future — the clock goes no further than today.', 'その時刻は未来です。時計は今日より先へは進みません。'));
  if (w && w.dropped === 'lunisolar') out.push(L('A Japanese month and day before 1873 are lunisolar and are not converted here — the year is used.', '1873年より前の和暦の月日は太陰太陽暦で、ここでは変換しません。年だけを使います。'));
  return out.length ? out.join(' ') : null;
}

/* ══ THE CLOCK ═════════════════════════════════════════════════════════════════════════════════════════════ */
/** set a clock to a reading. A past instant on the master clock is the historical map (js/chronos.js). */
export function applyWhen(when, opts) {
  const o = opts || {}, clock = o.clock || IntMapTime, source = o.source || 'search';
  if (!when || !clock) return { ok: false };
  if (when.y < clock.min) return { ok: false, code: 'before-floor' };
  if (when.precision === 'year') clock.setYear(when.y, { source });
  else clock.set(instantOf(when), { source });
  return { ok: true, iso: clock.iso(), live: clock.isLive() };
}

/* ══ THE PLACE, FROM THE HISTORICAL READERS ════════════════════════════════════════════════════════════════ */
/* the fold the place rules use (js/atlas-geo-resolve.js `nkey`) when they are loaded; else the same compatibility,
   case and Latin-accent fold the palette compares with */
function fold(s) {
  try { const R = window.IntMapPlaceRules; if (R && R.nkey) return R.nkey(String(s == null ? '' : s)); } catch (_) { }
  return String(s == null ? '' : s).normalize('NFKC').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').trim();
}
/** load both historical name records (each reader's own ensure — the same fetch the clock makes when it travels) */
export function ensureHist() {
  const ps = [];
  try { const H = window.IntMapHistCities; if (H && H.ensure) ps.push(H.ensure()); } catch (_) { }
  try { const P = window.IntMapHistPlaces; if (P && P.ensure) ps.push(P.ensure()); } catch (_) { }
  return Promise.allSettled(ps).then(() => true);
}
/* one index per record object, of folded name → entries; built the first time a name is asked */
const _idx = new WeakMap();
function nameIndexFor(records, namesOf) {
  let ix = _idx.get(records);
  if (!ix) { ix = new Map(); records.forEach((r, i) => namesOf(r).forEach((nm) => { const k = fold(nm.name); if (!k) return; let a = ix.get(k); if (!a) ix.set(k, a = []); a.push({ i, nm }); })); _idx.set(records, ix); }
  return ix;
}
/* the names a hist-cities record answers to: its spellings of today, and every span's name in every language */
function cityNames(c) {
  const out = (c.k || []).map((k) => ({ name: k, span: null }));
  (c.e || []).forEach((e) => Object.keys(e.n || {}).forEach((l) => out.push({ name: e.n[l], span: e })));
  return out;
}
/* Pleiades: the record's title, each attested form and each comma-separated romanization */
function pleiadesNames(p) {
  const out = [{ name: p.title.replace(/\?/g, '').trim(), n: null }];
  (p.names || []).forEach((n) => { if (n.a) out.push({ name: n.a, n }); String(n.r || '').split(',').forEach((r) => { if (r.trim()) out.push({ name: r.trim(), n }); }); });
  return out;
}
function lookup(ix, q) {
  const k = fold(q); if (!k) return [];
  const exact = ix.get(k) || [], hits = exact.map((h) => Object.assign({ level: 3 }, h));
  if (k.length >= 3) ix.forEach((list, key) => { if (key !== k && key.startsWith(k)) list.forEach((h) => hits.push(Object.assign({ level: 2 }, h))); });
  return hits;
}
const say = (n, lang) => (n && (n[lang] || n.en)) || '';
/* the name a hist-cities span gives at an instant; an open start is missing evidence and keeps its mark (js/hist-cities.js `displayName`) */
function spanAt(c, d) { for (const e of (c.e || [])) if ((!e.f || d >= e.f) && (!e.t || d <= e.t)) return e; return null; }
function todayName(c, lang) { const k = c.k || []; if (IntMapLang.normalise(lang) === 'jp') { const j = k.find((x) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(x)); if (j) return j; } return k[0] || ''; }

/**
 * The historical records' candidates for the place part, for the instant read.
 * @returns {{name:string, lng:number, lat:number, kind:string, level:number, source:'histCities'|'pleiades', note:string, guard?:number}[]}
 */
export function histCandidates(place, when, lang) {
  const out = [], L =(en, jp) => IntMapLang.t(lang, en, jp);
  const d = when ? dnum(instantOf(when)) : null, y = when ? when.y : null;
  try {
    const H = window.IntMapHistCities, recs = H && H.records && H.records();
    if (recs && recs.length) {
      const seen = new Map();
      for (const h of lookup(nameIndexFor(recs, cityNames), place)) {
        const c = recs[h.i], prev = seen.get(h.i);
        if (prev && prev.level >= h.level) continue;
        const at = d != null ? spanAt(c, d) : null, today = todayName(c, lang);
        const bare = at ? say(at.n, IntMapLang.normalise(lang)) : '', named = bare ? bare + (at.f ? '' : ' [?]') : '';
        const bits = [L('Historical city name', '歴史都市名')];
        if (h.nm.span && today && fold(today) !== fold(h.nm.name)) bits.push(L('today ' + today, '今日の ' + today));
        if (bare && fold(bare) !== fold(h.nm.name) && !(h.nm.span && h.nm.span === at)) bits.push(L('named ' + named + ' then', 'この年の名: ' + named));
        const row = { name: h.nm.name, lng: c.lon, lat: c.lat, kind: 'city', level: h.level, source: 'histCities', note: bits.join(' · '), guard: c.g || 0, id: c.id };
        if (prev) out[out.indexOf(prev)] = row; else out.push(row);
        seen.set(h.i, row);
      }
    }
  } catch (_) { }
  try {
    const P = window.IntMapHistPlaces, recs = P && P.records && P.records();
    if (recs && recs.length) {
      const seen = new Set();
      const astro = (raw) => fromEra(Math.abs(raw), raw < 0);   /* Pleiades writes 1000 BC as −1000 (js/hist-places.js) */
      for (const h of lookup(nameIndexFor(recs, pleiadesNames), place)) {
        if (seen.has(h.i)) continue; seen.add(h.i);
        const p = recs[h.i];
        const attested = y == null || (p.names || []).some((n) => astro(n.s) <= y && astro(n.e) >= y);
        const bits = [L('Ancient place (Pleiades)', '古代の地名（Pleiades）')];
        if (!attested) bits.push(L('no name of it is attested in this year', 'この年の名称の記録なし'));
        out.push({ name: p.title, lng: p.lon, lat: p.lat, kind: 'city', level: h.level - (attested ? 0 : 0.5), source: 'pleiades', note: bits.join(' · '), id: p.id });
      }
    }
  } catch (_) { }
  return out.sort((a, b) => b.level - a.level).slice(0, 12);
}

/* great-circle metres (the hist-cities guard is in metres — js/hist-cities.js `metres`) */
function metres(aLon, aLat, bLon, bLat) {
  const R = Math.PI / 180, dLat = (bLat - aLat) * R, dLon = (bLon - aLon) * R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
/** are two candidates ONE place? — the historical city record's own identity test: within its guard radius (the
    radius js/hist-cities.js renames a tile label in). Rows with no guard are one place only when the caller's own
    fold already merged them, so this answers false for them. */
export function samePlace(a, b) {
  const g = Math.max(+(a && a.guard) || 0, +(b && b.guard) || 0);
  return g > 0 && metres(+a.lng, +a.lat, +b.lng, +b.lat) <= g;
}
/** what the historical city record called the settlement at this point at this instant, when that differs from `name` —
    the record's own identity test (its guard radius, js/hist-cities.js `near`) */
export function eraNameAt(lng, lat, when, lang, name) {
  try {
    const H = window.IntMapHistCities; if (!H || !H.near || !when) return null;
    const near = H.near(lng, lat, IntMapLang.normalise(lang)); if (!near.length) return null;
    const d = dnum(instantOf(when));
    for (const s of near[0].spans) if ((!s.f || d >= s.f) && (!s.t || d <= s.t)) {
      const nm = s.name + (s.f ? '' : ' [?]');
      return (s.name && fold(s.name) !== fold(name || '')) ? nm : null;
    }
  } catch (_) { }
  return null;
}

/* ══ ONE CALL FOR THE DOORS THAT HAVE NO ROW MACHINERY OF THEIR OWN (the palette, Atlas) ══════════════════════
   The search field has its card — three geocoders, its ranking, its fold of duplicates — and asks `parse`,
   `histCandidates` and `eraNameAt` directly. The palette and Atlas ask this: the device's gazetteer rows (the caller's
   `local`, the search's own `localFuzzyPlaces`) and the historical records' rows, one place one row. */
/**
 * @param {string} text
 * @param {{local?:(q:string)=>any[], lang?:string, min?:number}} deps
 * @returns {Promise<{parsed:ReturnType<typeof parse>, rows:{key:string,title:string,sub:string,name?:string,lng?:number,lat?:number,kind?:string,bbox?:any,level?:number,source:string,timeOnly?:boolean}[], note:string|null}>}
 */
export async function interpret(text, deps) {
  const D = deps || {}, lang = D.lang || 'en', L = (en, jp) => IntMapLang.t(lang, en, jp);
  const parsed = parse(text, { min: D.min });
  const note = problemText(parsed, lang);
  if (!parsed.when) return { parsed, rows: [], note };
  const wt = whenText(parsed.when, lang), rows = [];
  if (parsed.problem && parsed.problem.code !== 'unknown-era') return { parsed, rows, note };
  if (!parsed.place) {
    rows.push({ key: 'when:' + parsed.when.matched, title: L('Go to ' + wt, wt + ' へ移動'), sub: L('Time only · the map stays where it is', '時刻だけ · 場所はそのまま'), source: 'time', timeOnly: true });
    return { parsed, rows, note };
  }
  await ensureHist();
  let local = [];
  try { local = (D.local ? D.local(parsed.place) : []) || []; } catch (_) { local = []; }
  const hist = histCandidates(parsed.place, parsed.when, lang);
  const all = [];
  local.forEach((l) => all.push({ name: l.name, lng: +l.lng, lat: +l.lat, kind: l.kind || '', bbox: l.bbox || null, level: +l.level || 0, source: 'gazetteer',
    note: (() => { const e = eraNameAt(+l.lng, +l.lat, parsed.when, lang, l.name); return e ? L('named ' + e + ' then', 'この年の名: ' + e) : ''; })() }));
  /* one place one row: a historical city whose own guard holds a gazetteer row IS that row (the record's identity test) */
  hist.forEach((h) => {
    const twin = all.find((r) => r.source === 'gazetteer' && samePlace(r, h));
    if (twin) { if (h.level > twin.level) { twin.level = h.level; } if (fold(h.name) !== fold(twin.name)) twin.note = [h.note, twin.note].filter(Boolean).join(' · '); return; }
    all.push(h);
  });
  all.sort((a, b) => b.level - a.level);
  all.slice(0, 8).forEach((r, i) => rows.push(Object.assign({ key: 'when:' + r.source + ':' + r.name + '@' + r.lng.toFixed(3) + ',' + r.lat.toFixed(3) + '|' + parsed.when.matched,
    title: r.name + ' · ' + wt, sub: [L('Place and time', '場所と時刻'), r.note].filter(Boolean).join(' · ') }, r, { rank: i })));
  return { parsed, rows, note };
}
