// @ts-check
/* ============================================================================
 *  IntMap · js/layer-time.js — WHAT A LAYER CAN STATE ABOUT AN INSTANT  (world-at-time)
 * ----------------------------------------------------------------------------
 *  MEASURED (2026-10-01): the live-satellite layer drew 5,234 objects on a 1914 map — 2026 orbital
 *  elements propagated 112 years back, a position no source states. #852 gave that ONE layer a span.
 *  The same shape was spread across the map in a different implementation per layer: the historical
 *  bundles carry `span`, OpenHistoricalMap lines are filtered by `inForce`, a bundle's freshness is a
 *  value in js/data-governance.js, a live feed has an observation time, a yearly series has years —
 *  and every layer that had none of these drew TODAY's data on whatever date the clock showed.
 *
 *  THIS FILE IS THE RULE, ONCE. Every layer declares (js/layer-time-decl.js) WHAT KIND of statement
 *  about time its source makes and WHAT STATES the range; `verdict(decl, at)` answers, for one
 *  instant, one of three things:
 *
 *      stated    the source states this instant — draw it
 *      carried   the source states ANOTHER instant and the layer shows that one, SAYING WHICH
 *                (a series past its last year, a dated snapshot on a later day) — draw it, and say so
 *      unstated  nothing the layer holds states this instant — do not draw it, and say why
 *
 *  ⚠ PURE: no DOM, no `window`. Node imports it as it is (scripts/world-at-time.mjs, the tests);
 *  the runtime half — holding a box, the legend, Atlas — is js/layer-time-kernel.js.
 *
 *  ══ THE KINDS (a closed vocabulary; `validate` rejects any other) ════════════════════════════
 *    instant     computed from the instant itself (where the Sun is) — every instant is stated
 *    convention  not a statement about the world at all (a graticule) — no instant is claimed
 *    enduring    a measured physical subject that does not change at the layer's resolution
 *                over the clock's range — `why` must say so in numbers
 *    record      dated features or a dated archive; the module draws the instant on the clock
 *                (`follows`). Stated inside the record's [from, to]; after `to` the newest is carried
 *                when the layer says so (`carry: 'last'`) and names its date; otherwise unstated
 *    series      values on a time axis the module follows with the clock (`follows`): the same rule
 *    snapshot    the world as of one date `asOf`. An edition speaks for the period since the one
 *                before it (`period` — the upstream's own cadence): stated in [asOf − period, asOf];
 *                carried after asOf; unstated before. With no stated asOf it states only the present
 *    live        observations of now. Stated on the live clock and, only for a module that filters
 *                by time itself (`follows`), back `lookback` from now; any other instant is unstated
 *    forecast    a model run's valid times [from, to] (runtime) — the module follows the clock
 *
 *  ══ WHO APPLIES THE INSTANT ════════════════════════════════════════════════════════════════════
 *    follows  «<file> <symbol>» — where the module draws the clock's instant inside its range.
 *    self     «<file> <symbol>» — where the module ALSO says, outside its range, that it has nothing
 *             (and draws nothing). The kernel never holds a `self` layer back.
 *    entry    «<file> <symbol>» — a READER'S tick moves the clock into the record (a war layer opens
 *             on its first day): the tick is let through; the hold applies when the clock leaves.
 *    A layer with none of the three is drawn as it was fetched, whatever the clock says — exactly the
 *    layers the kernel holds back when they state nothing about the instant.
 *
 *  ══ A BOUND MAY POINT AT THE FILE THAT STATES IT ═══════════════════════════════════════════════
 *    'data/gibs-range.json#layers.gxndvi.from' — the measured archive extent, read from that file (by
 *    the kernel at run time, by scripts/world-at-time.mjs from disk). The file is the author.
 *
 *  ⚠ A BOUND IS A VALUE SOMEBODY STATED. Every literal `from` / `to` / `asOf` carries `by` — the file
 *  that holds it or the upstream page that states it — and a bound read at run time is `'runtime'`,
 *  reported by the module that read it (`range(id, …)` in the kernel). A bound with no author is the
 *  claim this repository keeps removing ([[intmap-data-must-not-claim-an-author-it-lacks]]);
 *  `validate` refuses it, and npm run check is red while it is there.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';   /* the translation helper, by import (#860) — the same in node: pickArgs() returns the array it is handed */

/* IntMap's own words are held as the translation call the instruments read (`pickArgs()` returns the array it
   is handed — so headless, the same data is the bare array): a sentence is [en, jp] (CONSTITUTION.md §7) */
const LA = /** @type {(...a: string[]) => string[]} */ (IntMapLang.pickArgs());
const isPair = (a) => Array.isArray(a) && typeof a[0] === 'string' && !!a[0] && typeof a[1] === 'string' && !!a[1];

export const KINDS = Object.freeze(['instant', 'convention', 'enduring', 'record', 'series', 'snapshot', 'live', 'forecast']);
/* the kinds drawn per instant — their module must say where it applies the clock (`follows` or `self`) */
const FOLLOW_REQUIRED = new Set(['record', 'series', 'forecast']);
/** a bound that names the file that states it: 'data/<file>.json#a.b.c' */
export const isPointer = (v) => typeof v === 'string' && /^data\/[A-Za-z0-9_./-]+\.json#[A-Za-z0-9_.$=\[\]()-]+$/.test(v);
/** one step of a pointer path: a key, `$last` (an array's last element), or `name[key=value]` (the
    element of the array `name` whose `key` is `value` — a row found by its identity, not its position) */
function step(v, part) {
  if (v == null || typeof v !== 'object') return undefined;
  if (part === '$last') return Array.isArray(v) && v.length ? v[v.length - 1] : undefined;
  /* `$min(field)` / `$max(field)` — the earliest / latest value of a field over an array (a record's span
     when its rows are not in date order) */
  const mm = part.match(/^\$(min|max)\(([A-Za-z0-9_]+)\)$/);
  if (mm) {
    if (!Array.isArray(v)) return undefined;
    const xs = v.map((x) => x && x[mm[2]]).filter((x) => typeof x === 'string' || typeof x === 'number').sort((a, b) => (toMs(a) || 0) - (toMs(b) || 0));
    return xs.length ? (mm[1] === 'min' ? xs[0] : xs[xs.length - 1]) : undefined;
  }
  const m = part.match(/^([^[]+)\[([^=\]]+)=([^\]]+)\]$/);
  if (m) { const arr = v[m[1]]; return Array.isArray(arr) ? arr.find((x) => x && String(x[m[2]]) === m[3]) : undefined; }
  return v[part];
}
/** resolve a declaration's pointers against loaded files — files: { 'data/x.json': parsed } → a copy.
    A pointer whose file has not been read, or whose path holds no date, stays unread ('runtime'). */
export function resolve(decl, files) {
  if (!decl) return decl;
  const out = Object.assign({}, decl);
  for (const k of ['from', 'to', 'asOf']) {
    if (!isPointer(decl[k])) continue;
    const [file, p] = decl[k].split('#');
    /** @type {any} */ let v = files && files[file];
    for (const part of p.split('.')) v = step(v, part);
    out[k] = (typeof v === 'string' || typeof v === 'number') ? v : 'runtime';
  }
  return out;
}
/** the files a declaration's pointers name */
export const pointerFiles = (decl) => ['from', 'to', 'asOf'].filter((k) => isPointer(decl && decl[k])).map((k) => decl[k].split('#')[0]);

const DAY = 86400000;

/** an instant from a bound: a year (number, astronomical — 0 is 1 BC), an ISO date string (a signed
    year is allowed: '-0200-01-01'), a Date, or ms. Built with setUTCFullYear, never Date.UTC — which
    reads a year below 100 as 1900+y (js/hist-scale.js `utcAt`, #R604). → ms, or null */
export function toMs(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (Math.abs(v) < 1e7) { const d = new Date(0); d.setUTCFullYear(Math.trunc(v), 0, 1); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }
    return v;
  }
  /* a full timestamp ('2026-10-01T06:00:00Z' — a model's valid time) keeps its hour */
  if (/^\d{4}-\d{2}-\d{2}T\d/.test(String(v).trim())) { const p = Date.parse(String(v).trim()); return isNaN(p) ? null : p; }
  const m = String(v).trim().match(/^([+-]?\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if (!m) return null;
  const d = new Date(0); d.setUTCFullYear(+m[1], m[2] ? +m[2] - 1 : 0, m[3] ? +m[3] : 1); d.setUTCHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d.getTime();
}
/** the end of a bound: a bare year means the WHOLE year (to 31 Dec), a year-month the whole month —
    `to: 2022` states 2022 itself ([[intmap-declared-axis-must-be-verified]]: 裸の年はその年1年) */
export function toEndMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Math.abs(v) < 1e7) { const d = new Date(0); d.setUTCFullYear(Math.trunc(v) + 1, 0, 1); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 1; }
  if (typeof v === 'string') {
    if (/T\d/.test(v)) return toMs(v);
    const m = v.trim().match(/^([+-]?\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (m && !m[2]) return toEndMs(+m[1]);
    if (m && m[2] && !m[3]) { const d = new Date(0); d.setUTCFullYear(+m[1], +m[2], 1); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 1; }
    const s = toMs(v); return s == null ? null : s + DAY - 1;
  }
  return toMs(v);
}
/** an ISO day for a message — signed past 0…9999, as js/hist-scale.js `ymd` writes it */
export function isoDay(ms) {
  if (ms == null) return '';
  const d = new Date(ms), y = d.getUTCFullYear(), p = (n) => String(n).padStart(2, '0');
  const ys = (y >= 0 && y <= 9999) ? String(y).padStart(4, '0') : (y < 0 ? '-' : '+') + String(Math.abs(y)).padStart(6, '0');
  return ys + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}
/** the bound as the reader should see it: a declared bare year stays a year */
function boundText(v, ms) {
  if (typeof v === 'number' && Math.abs(v) < 1e7) return v <= 0 ? (1 - v) + ' BC' : String(v);
  if (typeof v === 'string' && /^[+-]?\d{1,6}$/.test(v.trim())) return boundText(+v.trim(), ms);
  return isoDay(ms);
}
const BC = (s) => s.replace(/(\d+) BC/, '紀元前$1年');

/** the period of a cadence string ('P1D', 'P7D', 'P1M', 'P1Y', 'PT1H') → ms, or null. The vocabulary is
    js/data-governance.js's (`cadence`), which the bundles already declare. */
export function periodMs(c) {
  if (c == null) return null;
  if (typeof c === 'number') return c;
  const m = String(c).trim().match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) return null;
  const [, y, mo, w, d, h, mi] = m.map((x) => (x == null ? 0 : +x));
  const ms = y * 365.2425 * DAY + mo * 30.436875 * DAY + w * 7 * DAY + d * DAY + h * 3600000 + mi * 60000;
  return ms > 0 ? ms : null;
}

/** validate(id, decl) → [] or a list of problems. The gate's rule, and the kernel's: a declaration the
    rule cannot read is not silently treated as «stated». */
export function validate(id, decl) {
  const bad = [];
  const say = (s) => bad.push(id + ': ' + s);
  if (!decl || typeof decl !== 'object') { say('no time declaration'); return bad; }
  if (KINDS.indexOf(decl.kind) < 0) say('kind «' + decl.kind + '» is not one of ' + KINDS.join(' / '));
  if (decl.kind === 'forecast' && !decl.follows && !decl.self) say('a forecast is drawn per valid time — `follows` names where its module applies the clock');
  if (FOLLOW_REQUIRED.has(decl.kind) && !decl.follows && !decl.self && !decl.ownDate) say('kind ' + decl.kind + ' with no `follows` keeps a date of its own — `ownDate` names where (file + symbol)');
  for (const k of ['self', 'follows', 'entry', 'reports', 'ownDate'])if (decl[k] != null && typeof decl[k] !== 'string') say('`' + k + '` names a place (file + symbol), not a flag');
  if (decl.carry != null && decl.carry !== 'last') say("carry is 'last' or absent");
  if (decl.cite != null) for (const k of Object.keys(decl.cite)) { if (['from', 'to', 'asOf'].indexOf(k) < 0 || !isPointer(decl.cite[k])) say('cite.' + k + ' points into the file that states that bound (data/<file>.json#path)'); }
  const authored = (k) => {
    const v = decl[k];
    if (v == null || v === 'runtime' || v === 'fetch' || isPointer(v)) return;
    if (toMs(v) == null) { say(k + ' «' + v + '» is not a date'); return; }
    if (!decl.by) say(k + ' ' + v + ' has no author — `by` names the file or upstream page that states it');
  };
  ['from', 'to', 'asOf'].forEach(authored);
  if ((decl.from === 'runtime' || decl.to === 'runtime' || decl.asOf === 'runtime') && !decl.reports) say('a bound read at run time names the module that reports it (`reports`)');
  if (decl.kind === 'snapshot' && decl.asOf == null && decl.period == null) say('a snapshot states its date (`asOf`) or that it is fetched as the present (`asOf: \'fetch\'` / `period`)');
  if (decl.period != null && decl.period !== 'fetch' && periodMs(decl.period) == null) say('period «' + decl.period + '» is not a cadence (P1D, P1M, P1Y …)');
  if (decl.kind === 'live' && decl.lookback != null && !decl.follows && !decl.self) say('a lookback is only stated by a module that filters by time (`follows`)');
  if (decl.lookback != null && periodMs(decl.lookback) == null) say('lookback «' + decl.lookback + '» is not a duration');
  const lit = (v) => (v == null || v === 'runtime' || v === 'fetch' || isPointer(v)) ? null : v;
  const s = toMs(lit(decl.from)), e = toEndMs(lit(decl.to));
  if (s != null && e != null && s > e) say('from ' + decl.from + ' is after to ' + decl.to);
  if (decl.kind === 'enduring' && !isPair(decl.why)) say('an enduring subject says why its measurement speaks for the whole clock (`why` en + jp)');
  if (decl.rangeUnstated != null && !isPair(decl.rangeUnstated)) say('`rangeUnstated` is the sentence saying who has not stated the range, en + jp');
  if (!isPair(decl.says)) say('`says` — what states the range, in en + jp (CONSTITUTION.md §7)');
  return bad;
}

/** verdict(decl, at, rt) → { status, reason, from?, to?, shows? }
      at  { when: ms|Date, live: bool, now?: ms }   — the instant asked about
      rt  { from?, to?, asOf? }                      — bounds the module reported at run time
    `reason` is a word from a closed set the messages and the instrument both read. */
export function verdict(decl, at, rt) {
  const r = rt || {};
  const now = at.now != null ? toMs(at.now) : Date.now();
  const live = !!at.live;
  const t = live ? now : toMs(at.when);
  const pick = (k) => ((decl[k] === 'runtime' || isPointer(decl[k])) ? r[k] : decl[k]);
  const fromV = pick('from'), toV = pick('to');
  const from = toMs(fromV), to = toEndMs(toV);
  const base = { from: fromV == null ? null : fromV, to: toV == null ? null : toV };
  const out = (status, reason, more) => Object.assign({ status, reason }, base, more || {});
  if (!decl || KINDS.indexOf(decl.kind) < 0) return out('unknown', 'undeclared');
  if (t == null) return out('unknown', 'no-instant');
  /* nobody states this layer's reach in time — not drawn as «stated», not held as «unstated»: an open
     question the instrument lists (scripts/world-at-time.mjs) until a source answers it */
  if (decl.rangeUnstated && !live) return out('unknown', 'range-unstated');
  switch (decl.kind) {
    case 'instant': case 'convention': case 'enduring':
      if (from != null && t < from) return out('unstated', 'before-record');
      return out('stated', decl.kind);
    case 'record': case 'series': case 'forecast': {
      const unread = (k, v) => (decl[k] === 'runtime' || isPointer(decl[k])) && v == null;
      const w = decl.kind === 'series' ? 'series' : 'record';
      /* a bound that is known decides on its own side even while the other is unread: a series fetched
         from 1990 says nothing about 1914 before its last year has arrived */
      if (from != null && t < from) return out('unstated', 'before-' + w);
      if (to != null && t > to) return decl.carry === 'last' ? out('carried', 'after-' + w, { shows: toV }) : out('unstated', 'after-' + w);
      if (unread('from', from) || unread('to', to)) return out('unknown', 'range-not-yet-read');
      /* inside the range, a module that keeps its OWN date (a year picker of its own) shows that date, not
         the clock's — drawn, and said: its legend names the date it shows */
      if (!decl.follows && !decl.self) return out('carried', 'own-date');
      return out('stated', 'in-' + w);
    }
    case 'snapshot': {
      const fetched = decl.asOf === 'fetch' || decl.asOf == null;
      const asOfV = fetched ? null : pick('asOf');
      const asOf = asOfV == null ? (fetched ? now : null) : toEndMs(asOfV);
      if (asOf == null) return live ? out('stated', 'present') : out('unknown', 'range-not-yet-read');
      const per = decl.period === 'fetch' ? 0 : (periodMs(decl.period) || 0);
      const more = { asOf: fetched ? 'fetch' : asOfV };
      if (live) return out(fetched || now - asOf <= per ? 'stated' : 'carried', fetched ? 'present' : 'as-of', more);
      if (t > asOf) return out('carried', 'as-of', Object.assign({ shows: asOfV }, more));
      if (t >= asOf - per - (fetched ? 0 : DAY)) return out('stated', 'edition', more);
      return out('unstated', fetched ? 'present-only' : 'before-edition', more);
    }
    case 'live': {
      if (live) return out('stated', 'present');
      const lb = decl.lookback != null ? periodMs(decl.lookback) : 0;
      if (lb && t >= now - lb) return out('stated', 'lookback', { lookback: decl.lookback });
      return out('unstated', 'present-only', decl.lookback != null ? { lookback: decl.lookback } : {});
    }
    default: return out('unknown', 'undeclared');
  }
}

/** the sentence, in en and jp (CONSTITUTION.md §7) — what the row's title, the legend and Atlas say.
    `name` is the layer's display name or null; `at` the instant asked about. */
export function explain(decl, v, at) {
  const live = !at || at.live;
  const day = live ? '' : isoDay(toMs(at.when));
  /* the instant as the sentence names it — «the present» on the live clock */
  const dayEn = live ? 'the present' : day, dayJp = live ? '現在' : day;
  const said = (decl && isPair(decl.says)) ? decl.says : LA('the source', '出典');
  const says = { en: said[0], jp: said[1] };
  const unsaid = (decl && isPair(decl.rangeUnstated)) ? decl.rangeUnstated : null;
  const f = v.from != null ? boundText(v.from, toMs(v.from)) : null;
  const t = v.to != null ? boundText(v.to, toEndMs(v.to)) : null;
  const range = { en: f && t ? f + '–' + t : f ? 'from ' + f : t ? 'until ' + t : '', jp: f && t ? BC(f) + '〜' + BC(t) : f ? BC(f) + '以降' : t ? BC(t) + 'まで' : '' };
  const asOf = v.asOf && v.asOf !== 'fetch' ? boundText(v.asOf, toMs(v.asOf)) : null;
  switch (v.reason) {
    case 'before-record': case 'after-record': case 'before-series': case 'after-series':
      if (v.status === 'carried') return { en: says.en + ' ends in ' + t + '; showing ' + t + ' for ' + dayEn, jp: says.jp + 'は' + BC(t) + 'までなので、' + dayJp + ' には ' + BC(t) + ' を表示しています' };
      return { en: says.en + ' states ' + range.en + ' — nothing states ' + dayEn, jp: says.jp + 'が述べるのは' + range.jp + 'で、' + dayJp + ' を述べる典拠はありません' };
    case 'present-only':
      return { en: says.en + ' states the present only — nothing states ' + dayEn, jp: says.jp + 'が述べるのは現在だけで、' + dayJp + ' を述べる典拠はありません' };
    case 'before-edition':
      return { en: says.en + ' is as of ' + asOf + ' — it does not state ' + dayEn, jp: says.jp + 'は ' + BC(asOf || '') + ' 時点のもので、' + dayJp + ' は述べていません' };
    case 'as-of':
      return { en: says.en + ' as of ' + asOf, jp: says.jp + '（' + BC(asOf || '') + ' 時点）' };
    case 'own-date':
      return { en: says.en + ' — shows the date chosen in its own legend, not the clock’s', jp: says.jp + '——時計ではなく、凡例で選んだ日付を表示しています' };
    case 'range-unstated':
      return { en: unsaid ? unsaid[0] : says.en, jp: unsaid ? unsaid[1] : says.jp };
    case 'range-not-yet-read':
      return { en: says.en + ': its range is read when the layer loads', jp: says.jp + '：範囲はレイヤーの読み込み時に読みます' };
    default:
      return { en: says.en, jp: says.jp };
  }
}

/** the kernel withholds a layer only when it is unstated AND its module does not apply the instant
    itself — a `self` module draws per instant and says so on its own (js/satellites-live.js). */
export const withholds = (decl, v) => !!decl && v.status === 'unstated' && !decl.self;
/** a READER'S tick on a layer whose module moves the clock into its record is let through (`entry`) */
export const entersOnTick = (decl) => !!(decl && decl.entry);
