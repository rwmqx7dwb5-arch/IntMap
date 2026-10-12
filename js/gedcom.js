/* ============================================================================
 *  IntMap · js/gedcom.js — READING A FAMILY-HISTORY FILE (GEDCOM 5.5.1 / 7.0)   (wave4-history)
 * ----------------------------------------------------------------------------
 *  The one reader of the file genealogy programs exchange (Gramps, RootsMagic, Family Tree Maker, MyHeritage,
 *  Ancestry, Geneanet and FamilySearch all write it). Its reader is js/family-history.js «Family history across
 *  borders»: each person's events, each with the day it happened (in the calendar the file states) and the place
 *  (the text the file writes, and the coordinates when the file carries them).
 *
 *  Pure: no DOM, no map, no network (the one import is the language registry, for the tag words) — the file is read in the reader's own browser and goes nowhere
 *  (tests/wave4-history-checks.test.mjs evaluates it in Node).
 *
 *  ── WHAT IS READ, AND HOW IT IS KNOWN (.agents/rules/no-ad-hoc-hardcoding.md) ──────────────────────────────
 *    · an EVENT is any level-1 structure of an INDI or FAM record that carries a DATE or a PLAC — the specification's
 *      own definition (every event and attribute structure holds an EVENT_DETAIL), so a tag no list here names
 *      (a vendor's _MILT, an EVEN with its TYPE) is still read. The tag words in TAG_WORDS are only how a few common
 *      tags are SAID to the reader; an unnamed tag is said as itself.
 *    · a FAM record's events belong to both spouses (each sees the other's name beside it).
 *    · the CHARACTER SET is the header's CHAR (or a byte-order mark). ANSEL — the 5.5.1 default — is read only when
 *      the file holds nothing outside ASCII (where the two coincide); a file with ANSEL's own bytes is refused with
 *      the reason, never decoded as if it were another code page (a wrong letter in a place name finds the wrong place).
 *  ── THE DATE IS THE FILE'S, IN THE CALENDAR THE FILE STATES ───────────────────────────────────────────────────
 *    The specification's grammar (5.5.1 §DATE_VALUE and 7.0 §DateValue): a calendar escape, a qualifier
 *    (ABT · CAL · EST · BEF · AFT · BET…AND · FROM…TO · INT), day, month and year, B.C. / BCE, a dual year (1731/32).
 *    Every date becomes the span of days it can stand for — [k0, k1) as YYYYMMDD integers, proleptic Gregorian with
 *    astronomical years, the encoding js/place-history.js reads — at the precision it was written:
 *      · JULIAN dates are converted through the Julian day number (the calendar's own arithmetic);
 *      · FRENCH REPUBLICAN dates through the Gregorian first day of each of the years it was in use (EQUINOX_DAYS);
 *      · HEBREW dates through the platform's own Hebrew calendar (Intl, `u-ca-hebrew`), searched day by day across
 *        the year; a platform without it refuses the date with the reason rather than reading it as Gregorian;
 *      · a DUAL YEAR (1731/32) is read as the later year — the year the date belongs to under a 1 January new year
 *        — in the calendar the file states, and the date says so (`dual`). No calendar is assumed for it.
 *    A date the grammar does not read is kept as the file wrote it, with no span — never guessed into one.
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';

/* ══ DAYS — YYYYMMDD integers through the Julian day number (proleptic Gregorian, astronomical years) ══════════════ */
const fl = Math.floor;
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
/** Julian day number of a proleptic Gregorian day */
function jdnGregorian(y, m, d) {
  const a = fl((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3;
  return d + fl((153 * m2 + 2) / 5) + 365 * y2 + fl(y2 / 4) - fl(y2 / 100) + fl(y2 / 400) - 32045;
}
/** Julian day number of a Julian-calendar day */
function jdnJulian(y, m, d) {
  const a = fl((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3;
  return d + fl((153 * m2 + 2) / 5) + 365 * y2 + fl(y2 / 4) - 32083;
}
/** the proleptic Gregorian day of a Julian day number, as YYYYMMDD */
function kOfJdn(J) {
  const a = J + 32044, b = fl((4 * a + 3) / 146097), c = a - fl(146097 * b / 4);
  const d = fl((4 * c + 3) / 1461), e = c - fl(1461 * d / 4), m = fl((5 * e + 2) / 153);
  return ymd(100 * b + d - 4800 + fl(m / 10), m + 3 - 12 * fl(m / 10), e - fl((153 * m + 2) / 5) + 1);
}
const kParts = (k) => { const y = fl(k / 10000), r = k - y * 10000, m = fl(r / 100); return [y, m, r - m * 100]; };
const jdnOfK = (k) => { const p = kParts(k); return jdnGregorian(p[0], p[1], p[2]); };
/** day k shifted by n days */
export function kAdd(k, n) { return kOfJdn(jdnOfK(k) + n); }
const monthLen = (cal, y, m) => {
  if (m === 2) { const leap = cal === 'julian' ? y % 4 === 0 : ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0); return leap ? 29 : 28; }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
};

/* ══ THE CALENDARS ═══════════════════════════════════════════════════════════════════════════════════════════════ */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const FRENCH_MONTHS = ['VEND', 'BRUM', 'FRIM', 'NIVO', 'PLUV', 'VENT', 'GERM', 'FLOR', 'PRAI', 'MESS', 'THER', 'FRUC', 'COMP'];
/* the Gregorian day each year of the French Republican calendar began (1 Vendémiaire), An I to An XIV — the calendar
   was abolished on 1 January 1806 (11 Nivôse XIV). The decree of 4 Frimaire An II set the first day of each year on the
   autumn equinox as observed at Paris; these are those days as the Republic's own annual calendars stated them
   (An IV, VIII, IX, X, XI, XIII, XIV began on 23 September, An XII on 24 September). Checked against two days every
   history states: 9 Thermidor An II = 27 July 1794, 18 Brumaire An VIII = 9 November 1799 (the checks evaluate both).
   EXPIRES: never — the calendar is closed. */
const FRENCH_ABOLISHED = 18060101;
const EQUINOX_DAYS = [17920922, 17930922, 17940922, 17950923, 17960922, 17970922, 17980922, 17990923, 18000923, 18010923, 18020923, 18030924, 18040923, 18050923];
/* GEDCOM's Hebrew month codes → the month as the platform's Hebrew calendar names it in English (CLDR). ADR is Adar in
   a common year and Adar I in a leap year; ADS is Adar II (Adar Sheni). */
const HEBREW_MONTHS = { TSH: ['Tishri'], CSH: ['Heshvan'], KSL: ['Kislev'], TVT: ['Tevet'], SHV: ['Shevat'], ADR: ['Adar', 'Adar I'], ADS: ['Adar II'], NSN: ['Nisan'], IYR: ['Iyar'], SVN: ['Sivan'], TMZ: ['Tamuz'], AAV: ['Av'], ELL: ['Elul'] };
const CAL_WORDS = { '@#DGREGORIAN@': 'gregorian', '@#DJULIAN@': 'julian', '@#DHEBREW@': 'hebrew', '@#DFRENCH R@': 'french', '@#DROMAN@': 'roman', '@#DUNKNOWN@': 'unknown', GREGORIAN: 'gregorian', JULIAN: 'julian', HEBREW: 'hebrew', FRENCH_R: 'french' };

let _hebFmt = null;
function hebrewFormat() {
  if (_hebFmt === null) {
    try {
      const f = new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      _hebFmt = f.resolvedOptions().calendar === 'hebrew' ? f : false;
    } catch (_) { _hebFmt = false; }
  }
  return _hebFmt;
}
/** the days [first, last] of a Hebrew year / month / day, found by asking the platform's Hebrew calendar for each day
    of the Gregorian stretch the Hebrew year falls in; null when the platform has no Hebrew calendar or nothing matches */
function hebrewSpan(y, mcode, d) {
  const f = hebrewFormat(); if (!f) return null;
  const names = mcode ? HEBREW_MONTHS[mcode] : null;
  if (mcode && !names) return null;
  /* Hebrew year Y begins (1 Tishri) between 5 September and 5 October of Gregorian year Y − 3761 */
  const J0 = jdnGregorian(y - 3761, 8, 1);
  let first = null, last = null;
  for (let J = J0; J < J0 + 450; J++) {
    const t = new Date((J - 2440588) * 86400000 + 43200000);
    const p = f.formatToParts(t), get = (k) => (p.find((x) => x.type === k) || {}).value;
    if (+get('year') !== y) { if (first != null) break; continue; }
    if (names && names.indexOf(get('month')) < 0) continue;
    if (d != null && +get('day') !== d) continue;
    if (first == null) first = J;
    last = J;
  }
  return first == null ? null : [first, last];
}

/** one date of the grammar ([day] [month] year[/yy] [B.C.]) in a calendar → { k0, k1, prec, dual? } or { problem } */
function oneDate(words, cal) {
  let w = words.slice(), bc = false;
  if (w.length && /^(B\.?C\.?|BCE)$/i.test(w[w.length - 1])) { bc = true; w.pop(); }
  if (!w.length || w.length > 3) return { problem: 'unreadable' };
  const yw = w.pop(), ym = /^(\d{1,5})(?:\/(\d{1,2}))?$/.exec(yw);
  if (!ym) return { problem: 'unreadable' };
  let y = +ym[1], dual = null;
  if (ym[2] != null) {
    /* 1731/32 → 1732: the later of the two years, whose last digits are written after the slash */
    const tail = ym[2], base = Math.floor(y / Math.pow(10, tail.length)) * Math.pow(10, tail.length);
    let later = base + (+tail); if (later <= y) later += Math.pow(10, tail.length);
    dual = ym[1] + '/' + ym[2]; y = later;
  }
  if (bc) { if (y < 1) return { problem: 'unreadable' }; y = 1 - y; }
  const mw = w.length ? w.pop().toUpperCase() : null, dw = w.length ? w.pop() : null;
  if (dw != null && !/^\d{1,2}$/.test(dw)) return { problem: 'unreadable' };
  const d = dw != null ? +dw : null;
  const out = (k0, k1, prec) => Object.assign({ k0, k1, prec }, dual ? { dual } : {});
  if (cal === 'gregorian' || cal === 'julian') {
    const m = mw ? MONTHS.indexOf(mw) + 1 : null;
    if (mw && !m) return { problem: 'unreadable' };
    if (d != null && (!m || d < 1 || d > monthLen(cal, y, m))) return { problem: 'unreadable' };
    const J = cal === 'julian' ? jdnJulian : jdnGregorian;
    if (d != null) { const j = J(y, m, d); return out(kOfJdn(j), kOfJdn(j + 1), 'day'); }
    if (m) return out(kOfJdn(J(y, m, 1)), kOfJdn(m === 12 ? J(y + 1, 1, 1) : J(y, m + 1, 1)), 'month');
    return out(kOfJdn(J(y, 1, 1)), kOfJdn(J(y + 1, 1, 1)), 'year');
  }
  if (cal === 'french') {
    if (bc || y < 1 || y > EQUINOX_DAYS.length) return { problem: 'calendar-range' };
    const m = mw ? FRENCH_MONTHS.indexOf(mw) + 1 : null;
    if (mw && !m) return { problem: 'unreadable' };
    /* the year ends where the next begins; An XIV ends where the calendar did (1 January 1806) */
    const J0 = jdnOfK(EQUINOX_DAYS[y - 1]), Jend = jdnOfK(y < EQUINOX_DAYS.length ? EQUINOX_DAYS[y] : FRENCH_ABOLISHED);
    const days = m === 13 ? (Jend - J0) - 360 : 30;
    if (d != null && (!m || d < 1 || d > days)) return { problem: 'unreadable' };
    let a = J0, b = Jend, prec = 'year';
    if (d != null) { a = J0 + (m - 1) * 30 + (d - 1); b = a + 1; prec = 'day'; }
    else if (m) { a = J0 + (m - 1) * 30; b = a + days; prec = 'month'; }
    if (a >= Jend) return { problem: 'calendar-range' };
    return out(kOfJdn(a), kOfJdn(Math.min(b, Jend)), prec);
  }
  if (cal === 'hebrew') {
    if (bc) return { problem: 'unreadable' };
    const sp = hebrewSpan(y, mw, d);
    if (!sp) return { problem: hebrewFormat() ? 'unreadable' : 'calendar-unavailable' };
    return out(kOfJdn(sp[0]), kOfJdn(sp[1] + 1), d != null ? 'day' : mw ? 'month' : 'year');
  }
  return { problem: 'calendar-unsupported' };
}

/* a calendar escape at the head of a date's words → [calendar, the rest] */
function calOf(words) {
  if (!words.length) return ['gregorian', words];
  if (words[0] === '@#DFRENCH' && words[1] === 'R@') return ['french', words.slice(2)];
  const c = CAL_WORDS[words[0].toUpperCase()];
  return c ? [c, words.slice(1)] : ['gregorian', words];
}
function dateOf(words) {
  const [cal, rest] = calOf(words);
  const r = oneDate(rest, cal);
  return Object.assign({ cal }, r);
}

/**
 * parseDate(text) — a GEDCOM date value → the span of days it stands for.
 *   → { raw, qual, cal, prec, k0, k1, dual?, phrase?, problem? }
 *     qual: 'exact' | 'about' | 'calculated' | 'estimated' | 'before' | 'after' | 'between' | 'period' | 'interpreted'
 *     [k0, k1): the days the date can stand for (k1 exclusive). For `before` k0 is null (no lower bound) and k1 is the
 *     first day of the date written; for `after` k0 is the day after it and k1 is null; FROM x alone and TO x alone the same.
 *   `problem` (and no span) when the grammar does not read it: 'empty' | 'phrase' | 'unreadable' | 'calendar-range' |
 *   'calendar-unavailable' | 'calendar-unsupported'.
 */
export function parseDate(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { raw, problem: 'empty' };
  let phrase = null, body = raw;
  const ph = /\(([^)]*)\)\s*$/.exec(body);
  if (ph) { phrase = ph[1].trim(); body = body.slice(0, ph.index).trim(); }
  if (!body) return { raw, phrase, problem: 'phrase' };
  const W = body.replace(/\s+/g, ' ').split(' ');
  const head = W[0].toUpperCase();
  const pair = (kw2, qual) => {
    const i = W.findIndex((x, j) => j > 0 && x.toUpperCase() === kw2);
    const a = dateOf(i > 0 ? W.slice(1, i) : W.slice(1)), b = i > 0 ? dateOf(W.slice(i + 1)) : null;
    if (a.problem) return Object.assign({ raw, qual, phrase }, { cal: a.cal, problem: a.problem });
    if (b && b.problem) return Object.assign({ raw, qual, phrase }, { cal: b.cal, problem: b.problem });
    if (b && b.k1 <= a.k0) return { raw, qual, phrase, cal: a.cal, problem: 'unreadable' };
    return Object.assign({ raw, qual, phrase, cal: a.cal, prec: a.prec, k0: a.k0, k1: b ? b.k1 : null }, a.dual || (b && b.dual) ? { dual: [a.dual, b && b.dual].filter(Boolean).join(', ') } : {});
  };
  if (head === 'BET') return pair('AND', 'between');
  if (head === 'FROM') return pair('TO', 'period');
  if (head === 'TO') { const b = dateOf(W.slice(1)); return b.problem ? { raw, qual: 'period', phrase, cal: b.cal, problem: b.problem } : Object.assign({ raw, qual: 'period', phrase, cal: b.cal, prec: b.prec, k0: null, k1: b.k1 }, b.dual ? { dual: b.dual } : {}); }
  const QUAL = { ABT: 'about', CAL: 'calculated', EST: 'estimated', BEF: 'before', AFT: 'after', INT: 'interpreted' };
  const qual = QUAL[head] || 'exact';
  const a = dateOf(qual === 'exact' ? W : W.slice(1));
  if (a.problem) return { raw, qual, phrase, cal: a.cal, problem: a.problem };
  const base = Object.assign({ raw, qual, phrase, cal: a.cal, prec: a.prec }, a.dual ? { dual: a.dual } : {});
  if (qual === 'before') return Object.assign(base, { k0: null, k1: a.k0 });
  if (qual === 'after') return Object.assign(base, { k0: a.k1, k1: null });
  return Object.assign(base, { k0: a.k0, k1: a.k1 });
}

/**
 * readDateInput(text) — what a reader types in the form → the same shape as parseDate. Accepts the GEDCOM grammar and,
 * beside it, the ISO day (1905-03-12, 1905-03, 1905), the Japanese 1905年3月12日, a leading «about / c. / ca. / 頃 / 約»,
 * «before / 以前» and «after / 以降». Years are Common Era; «BC» / «紀元前» mark the era before it.
 */
export function readDateInput(text) {
  let s = String(text == null ? '' : text).normalize('NFKC').trim();
  if (!s) return { raw: s, problem: 'empty' };
  let q = '';
  const lead = [[/^(about|abt\.?|c\.|ca\.?|circa|約)\s*/i, 'ABT '], [/^(before|bef\.?)\s+/i, 'BEF '], [/^(after|aft\.?)\s+/i, 'AFT ']];
  for (const [re, kw] of lead) if (re.test(s)) { q = kw; s = s.replace(re, ''); break; }
  const tail = [[/\s*(頃|ごろ)$/, 'ABT '], [/\s*以前$/, 'BEF '], [/\s*以降$/, 'AFT ']];
  for (const [re, kw] of tail) if (re.test(s)) { q = q || kw; s = s.replace(re, ''); }
  let bc = false;
  if (/^紀元前\s*/.test(s)) { bc = true; s = s.replace(/^紀元前\s*/, ''); }
  if (/\s*(BC|B\.C\.|BCE)$/i.test(s) && /^\d/.test(s)) { bc = true; s = s.replace(/\s*(BC|B\.C\.|BCE)$/i, ''); }
  let m = /^(\d{1,4})年(?:\s*(\d{1,2})月(?:\s*(\d{1,2})日)?)?$/.exec(s) || /^(\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(s);
  if (m) {
    const g = [m[3] ? String(+m[3]) : null, m[2] ? MONTHS[+m[2] - 1] : null, m[1]].filter((x) => x != null);
    if (m[2] && !MONTHS[+m[2] - 1]) return { raw: String(text), problem: 'unreadable' };
    const r = parseDate(q + g.join(' ') + (bc ? ' BCE' : ''));
    return Object.assign(r, { raw: String(text).trim() });
  }
  const r = parseDate(q + s.toUpperCase() + (bc ? ' BCE' : ''));
  return Object.assign(r, { raw: String(text).trim() });
}

/* ══ THE FILE ════════════════════════════════════════════════════════════════════════════════════════════════════ */
/**
 * decode(bytes) — the file's bytes → { text, charset } or { problem, charset }. The charset is the byte-order mark's, else
 * the header's CHAR line (read as ASCII, which every GEDCOM charset agrees with for the header's own words).
 */
export function decode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const td = (enc) => new TextDecoder(enc, { fatal: false });
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: td('utf-8').decode(b.subarray(3)), charset: 'UTF-8' };
  if (b[0] === 0xFF && b[1] === 0xFE) return { text: td('utf-16le').decode(b.subarray(2)), charset: 'UTF-16' };
  if (b[0] === 0xFE && b[1] === 0xFF) return { text: td('utf-16be').decode(b.subarray(2)), charset: 'UTF-16' };
  /* UTF-16 without a mark: the header's first bytes are ASCII with a zero beside each */
  if (b.length > 3 && b[0] === 0x30 && b[1] === 0) return { text: td('utf-16le').decode(b), charset: 'UTF-16' };
  if (b.length > 3 && b[0] === 0 && b[1] === 0x30) return { text: td('utf-16be').decode(b), charset: 'UTF-16' };
  let head = '';
  for (let i = 0; i < Math.min(b.length, 4096); i++) head += String.fromCharCode(b[i] < 0x80 ? b[i] : 0x3F);
  const cm = /\n\s*1\s+CHAR\s+([^\r\n]+)/i.exec('\n' + head);
  const charset = cm ? cm[1].trim().toUpperCase() : 'UTF-8';
  let high = false; for (let i = 0; i < b.length; i++) if (b[i] >= 0x80) { high = true; break; }
  if (charset === 'ANSEL' && high) return { problem: 'ansel', charset };
  if (charset === 'ANSI' || charset === 'WINDOWS-1252' || charset === 'CP1252') return { text: td('windows-1252').decode(b), charset };
  if (charset === 'IBMPC' || charset === 'IBM WINDOWS') return high ? { problem: 'charset', charset } : { text: td('utf-8').decode(b), charset };
  return { text: td('utf-8').decode(b), charset };
}

/* one line of the grammar: level, an optional cross-reference, the tag, an optional value */
const LINE = /^\s*(\d{1,2})\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?: (.*))?$/;
/** the lines → a tree of { tag, xref, value, kids } (CONT / CONC folded into their parent's value) */
function tree(text) {
  const roots = [], stack = [];
  let bad = 0;
  for (const line of String(text).split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const m = LINE.exec(line);
    if (!m) { bad++; continue; }
    const lv = +m[1], tag = m[3].toUpperCase(), value = m[4] != null ? m[4] : '';
    if (tag === 'CONT' || tag === 'CONC') { const p = stack[lv - 1]; if (p) p.value += (tag === 'CONT' ? '\n' : '') + value; continue; }
    const node = { tag, xref: m[2] || null, value, kids: [] };
    if (lv === 0) roots.push(node); else if (stack[lv - 1]) stack[lv - 1].kids.push(node); else { bad++; continue; }
    stack[lv] = node; stack.length = lv + 1;
  }
  return { roots, bad };
}
const kid = (n, tag) => (n.kids || []).find((x) => x.tag === tag) || null;
const kids = (n, tag) => (n.kids || []).filter((x) => x.tag === tag);
/** a coordinate as GEDCOM writes it (N50.45 / E30.52 / S… / W…, or a signed decimal) → a number, or null */
function coord(v, pos, neg, max) {
  const s = String(v || '').trim().toUpperCase();
  const m = /^([NSEW])?\s*([+-]?\d+(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  let x = +m[2];
  if (m[1] === neg) x = -Math.abs(x); else if (m[1] && m[1] !== pos) return null;
  return isFinite(x) && Math.abs(x) <= max ? x : null;
}
/** a name as written («John /Smith/ Jr.») → «John Smith Jr.» */
const cleanName = (v) => String(v || '').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();

/* an event structure → { tag, type?, date, place?, lng?, lat? } — the structure carries DATE or PLAC */
function eventOf(n) {
  const D = kid(n, 'DATE'), P = kid(n, 'PLAC');
  if (!D && !P) return null;
  const ev = { tag: n.tag };
  const T = kid(n, 'TYPE'); if (T && T.value) ev.type = T.value.trim();
  else if (n.tag === 'EVEN' && n.value) ev.type = n.value.trim();
  ev.date = parseDate(D ? D.value : '');
  if (P && P.value.trim()) {
    ev.place = P.value.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/^(, )+|(, )+$/g, '').trim();
    const M = kid(P, 'MAP');
    if (M) {
      const lat = coord((kid(M, 'LATI') || {}).value, 'N', 'S', 90), lng = coord((kid(M, 'LONG') || {}).value, 'E', 'W', 180);
      if (lat != null && lng != null) { ev.lat = lat; ev.lng = lng; }
    }
  }
  return ev;
}

/**
 * parseGedcom(text) → { version, charset, source, people:[{ id, name, sex, events:[ev], parents:[id], spouses:[id], children:[id] }],
 *                       counts:{ people, families, events, located, dated }, problems:[{line?, what}] }
 * `ev.with` names the spouse of a family's event. Records other than INDI and FAM are not read.
 */
export function parseGedcom(text) {
  const { roots, bad } = tree(text);
  const problems = [];
  if (bad) problems.push({ what: 'lines', n: bad });
  const H = roots.find((r) => r.tag === 'HEAD');
  if (!H || !roots.some((r) => r.tag === 'INDI')) return { version: null, people: [], counts: { people: 0, families: 0, events: 0, located: 0, dated: 0 }, problems: problems.concat([{ what: 'not-gedcom' }]) };
  const G = kid(H, 'GEDC'), version = G && kid(G, 'VERS') ? kid(G, 'VERS').value.trim() : null;
  const S = kid(H, 'SOUR'), source = S ? ((kid(S, 'NAME') || {}).value || S.value || '').trim() : '';
  const C = kid(H, 'CHAR'), charset = C ? C.value.trim() : null;
  const byId = new Map(), people = [];
  for (const r of roots) {
    if (r.tag !== 'INDI') continue;
    const N = kid(r, 'NAME');
    let name = N ? cleanName(N.value) : '';
    if (!name && N) name = cleanName([(kid(N, 'GIVN') || {}).value, (kid(N, 'SURN') || {}).value].filter(Boolean).join(' '));
    const sx = kid(r, 'SEX');
    const p = { id: r.xref || ('@I' + (people.length + 1) + '@'), name, sex: sx ? sx.value.trim().toUpperCase() : '', events: [], parents: [], spouses: [], children: [] };
    for (const k of r.kids) { if (k.tag === 'NAME' || k.tag === 'SEX') continue; const ev = eventOf(k); if (ev) p.events.push(ev); }
    people.push(p); byId.set(p.id, p);
  }
  let families = 0;
  for (const r of roots) {
    if (r.tag !== 'FAM') continue;
    families++;
    const spouses = kids(r, 'HUSB').concat(kids(r, 'WIFE')).map((x) => byId.get(x.value.trim())).filter(Boolean);
    const children = kids(r, 'CHIL').map((x) => byId.get(x.value.trim())).filter(Boolean);
    for (const a of spouses) {
      for (const b of spouses) if (a !== b && a.spouses.indexOf(b.id) < 0) a.spouses.push(b.id);
      for (const c of children) { if (a.children.indexOf(c.id) < 0) a.children.push(c.id); if (c.parents.indexOf(a.id) < 0) c.parents.push(a.id); }
    }
    for (const k of r.kids) {
      if (k.tag === 'HUSB' || k.tag === 'WIFE' || k.tag === 'CHIL') continue;
      const ev = eventOf(k); if (!ev) continue;
      for (const a of spouses) { const other = spouses.find((b) => b !== a); a.events.push(Object.assign({}, ev, other ? { with: other.id } : {})); }
    }
  }
  let events = 0, located = 0, dated = 0;
  for (const p of people) for (const e of p.events) { events++; if (e.lng != null) located++; if (e.date && !e.date.problem) dated++; }
  return { version, charset, source, people, counts: { people: people.length, families, events, located, dated }, problems };
}

/* ══ WORDS — how a tag and a date are said (the reader's language; en + jp) ═══════════════════════════════════════ */
/* the common event tags of the specification, as a reader says them; a tag not here is said as itself (header) */
const LA = IntMapLang.pickArgs();
const TAG_WORDS = {
  BIRT: LA('Birth', '誕生'), CHR: LA('Christening', '洗礼'), BAPM: LA('Baptism', '洗礼'), DEAT: LA('Death', '死亡'), BURI: LA('Burial', '埋葬'), CREM: LA('Cremation', '火葬'),
  MARR: LA('Marriage', '結婚'), DIV: LA('Divorce', '離婚'), ENGA: LA('Engagement', '婚約'), RESI: LA('Residence', '居住'), EMIG: LA('Emigration', '出国'), IMMI: LA('Immigration', '入国'),
  NATU: LA('Naturalisation', '帰化'), CENS: LA('Census', '国勢調査'), OCCU: LA('Occupation', '職業'), EDUC: LA('Education', '教育'), GRAD: LA('Graduation', '卒業'), RETI: LA('Retirement', '退職'),
  PROB: LA('Probate', '遺言検認'), WILL: LA('Will', '遺言'), CONF: LA('Confirmation', '堅信'), ADOP: LA('Adoption', '養子縁組'), EVEN: LA('Event', '出来事'),
};
/** an event's kind in words, in the reader's language */
export function tagWords(ev, lang) {
  const w = TAG_WORDS[ev && ev.tag];
  const base = w ? IntMapLang.pick(() => lang).arr(w) : String((ev && ev.tag) || '').replace(/^_/, '');
  return ev && ev.type && (ev.tag === 'EVEN' || !w) ? base + ': ' + ev.type : base;
}
/** the events that open and close a life: birth (else christening or baptism) and death (else burial or cremation) */
export const LIFE_OPENS = ['BIRT', 'CHR', 'BAPM'];
export const LIFE_CLOSES = ['DEAT', 'BURI', 'CREM'];
