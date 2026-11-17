// @ts-check
/* ============================================================================
 *  IntMap · js/opening-hours.js — IS IT OPEN AT THIS INSTANT? (OpenStreetMap `opening_hours`, in the place's own zone)
 *  (geopolitics-layers)
 * ----------------------------------------------------------------------------
 *  The border-crossing layer (js/layer-pkg-geopolitics.js) says whether a crossing is open at the clock's instant. The
 *  schedule is the one OpenStreetMap states in `opening_hours` (https://wiki.openstreetmap.org/wiki/Key:opening_hours),
 *  written in the crossing's LOCAL time, and the zone is the one data/border-crossings.json states for that crossing.
 *
 *  ⚠ WHAT IT READS, AND WHAT IT REFUSES. The grammar is large; this reads the part border crossings use (measured
 *  2026-11-17 on all 1,019 crossings that state a schedule — the forms are counted in tests/geopolitics-layers-checks):
 *    rules separated by «;» (a later rule replaces an earlier one on the days it selects) or «, » before a new selector
 *    month ranges «Jan-Feb», «Nov-Apr» (wrapping), dates «Jun 01-Aug 31», «Apr 25», with or without a colon
 *    weekdays «Mo-Su», «Su-Sa» (wrapping), lists «Tu, Th, Sa-Su»; «PH» beside weekdays (public holidays are not
 *      known here, so a rule that ALSO names them is read for its weekdays and the answer says holidays were not read)
 *    times «08:00-20:00», several «09:00-13:00,14:00-18:00», past midnight «06:00-01:00», «24:00», «24/7»
 *    modifiers «off» «closed» «open» «unknown» and a quoted comment
 *  Anything else — sunrise/sunset, week numbers, the nth weekday «Su[-1]», «-1 day», «+» open ends, «||» fallbacks —
 *  is NOT guessed: `openAt` answers { state: 'unread' } with the token it could not read, and the card shows the
 *  schedule as OpenStreetMap wrote it. 「読めなかった」は「閉まっている」ではない (.agents/rules/one-pass-or-a-reason.md §5).
 *
 *  ⚠ PURE: no DOM, no window — Node imports it as it is (tests).
 * ==========================================================================*/

const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_RE = MON.join('|');

class Unread extends Error { constructor(/** @type {string} */ token) { super(token); this.token = token; } }

/** the wall-clock fields of an instant in an IANA zone → { y, mo (1–12), d, wd (0 = Su), min (minutes since midnight) } */
export function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  /** @type {Record<string, string>} */ const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, wd: WD.indexOf(String(p.weekday).slice(0, 2)), min: (+p.hour % 24) * 60 + +p.minute };
}

/* ── the parser: a schedule → rules [{ months?, wdays?, ph, spans:[[a,b]] | 'all', mode: 'open'|'closed'|'unknown', comment }] */
function parseTime(s) {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[2] > 59 || +m[1] > 48) throw new Unread(s);
  return +m[1] * 60 + +m[2];
}
function parseMonths(sel) {
  /* «Jan-Feb», «Nov-Apr», «Jun 01-Aug 31», «Apr 25», «Apr» — as month-day intervals [from, to] in mo*100+day */
  const out = [];
  for (const part of sel.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(new RegExp('^(' + MON_RE + ')(?:\\s+(\\d{1,2}))?(?:\\s*-\\s*(' + MON_RE + ')?(?:\\s*(\\d{1,2}))?)?$'));
    if (!m) throw new Unread(part);
    const m1 = MON.indexOf(m[1]) + 1, d1 = m[2] ? +m[2] : 1;
    let m2, d2;
    if (part.includes('-')) { m2 = m[3] ? MON.indexOf(m[3]) + 1 : m1; d2 = m[4] ? +m[4] : 31; if (!m[3] && !m[4]) throw new Unread(part); }
    else { m2 = m1; d2 = m[2] ? d1 : 31; }
    out.push([m1 * 100 + d1, m2 * 100 + d2]);
  }
  return out;
}
function parseWdays(sel) {
  const days = new Set();
  let ph = false;
  for (const part of sel.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (part === 'PH') { ph = true; continue; }
    const m = part.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) throw new Unread(part);
    const a = WD.indexOf(m[1]), b = m[2] ? WD.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) { days.add(i); if (i === b) break; }
  }
  if (!days.size && ph) throw new Unread('PH');   /* a rule for public holidays only: the days are not known here */
  return { days, ph };
}
function parseRule(text) {
  let s = text.trim();
  const rule = { months: null, wdays: null, ph: false, spans: /** @type {any} */ (null), mode: 'open', comment: '' };
  const cm = s.match(/"([^"]*)"\s*$/);
  if (cm) { rule.comment = cm[1]; s = s.slice(0, cm.index).trim(); }
  const mod = s.match(/(?:^|\s)(off|closed|open|unknown)$/);
  if (mod) { rule.mode = mod[1] === 'off' || mod[1] === 'closed' ? 'closed' : mod[1]; s = s.slice(0, mod.index).trim(); }
  if (s === '24/7') { rule.spans = 'all'; return rule; }
  /* a day number is one NOT followed by «:<digit>» — «Nov-Mar 07:00» is the months then a time, not «Mar 07»; «Aug 31: …»
     is a day and the selector's colon */
  const DAY = '\\d{1,2}(?!\\d|:\\d)';
  const monM = s.match(new RegExp('^((?:(?:' + MON_RE + ')(?:\\s+' + DAY + ')?(?:\\s*-\\s*(?:' + MON_RE + ')?(?:\\s*' + DAY + ')?)?\\s*,?\\s*)+):?\\s*'));
  if (monM && monM[1].trim()) { rule.months = parseMonths(monM[1].replace(/[,\s]+$/, '')); s = s.slice(monM[0].length); }
  const wdM = s.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)(?=\s|$)/);
  if (wdM) { const w = parseWdays(wdM[1].replace(/[,\s]+$/, '')); rule.wdays = w.days; rule.ph = w.ph; s = s.slice(wdM[0].length).trim(); }
  if (s === '24/7') { rule.spans = 'all'; return rule; }
  if (!s) { rule.spans = rule.mode === 'open' ? 'all' : []; return rule; }
  rule.spans = s.split(',').map((x) => x.trim()).filter(Boolean).map((span) => {
    const m = span.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) throw new Unread(span);
    const a = parseTime(m[1]); let b = parseTime(m[2]);
    if (b <= a) b += 24 * 60;   /* past midnight: «06:00-01:00» runs into the next day */
    return [a, b];
  });
  return rule;
}
/** a schedule → its rules, or throws Unread with the first token it cannot read */
export function parse(text) {
  const src = String(text || '').trim();
  if (!src) throw new Unread('');
  if (/\|\||sunrise|sunset|dawn|dusk|\[|\bweek\b|\bday\b|\+|@|\bSH\b|\beaster\b/i.test(src)) throw new Unread((src.match(/\|\||sunrise|sunset|dawn|dusk|\[[^\]]*\]|\bweek\b|-?\d* ?\bday\b|\+|@|\bSH\b|\beaster\b/i) || [src])[0]);
  /* «, » before a new month or weekday selector begins another rule; a comma between times or days does not */
  const parts = src.split(';').flatMap((r) => r.split(new RegExp(',\\s+(?=(?:' + MON_RE + ')\\b[^,]*:|(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\\s*,\\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*\\s+\\d)')));
  return parts.map((p) => p.trim()).filter(Boolean).map(parseRule);
}

const inMonths = (months, mo, d) => {
  if (!months) return true;
  const k = mo * 100 + d;
  return months.some(([a, b]) => (a <= b ? k >= a && k <= b : k >= a || k <= b));
};
/** the rule that decides a local day: the last one whose selectors take it (OSM: a later rule replaces earlier ones on its days) */
function ruleFor(rules, day) {
  let hit = null;
  for (const r of rules) if (inMonths(r.months, day.mo, day.d) && (!r.wdays || r.wdays.has(day.wd))) hit = r;
  return hit;
}

/**
 * openAt(text, ms, tz) → { state: 'open'|'closed'|'unknown'|'unread', token?, comment?, holidays? }
 *   open/closed/unknown — what the schedule states for that local instant (unknown = the schedule itself says «unknown»)
 *   unread              — a token outside what this reader reads; `token` names it. Not a statement about the crossing.
 */
export function openAt(text, ms, tz) {
  let rules;
  try { rules = parse(text); } catch (e) { if (e instanceof Unread) return { state: 'unread', token: e.token }; throw e; }
  const now = localParts(ms, tz);
  const prev = localParts(ms - 86400000, tz);
  const holidays = rules.some((r) => r.ph);
  const at = (r, min) => {
    if (!r) return null;
    if (r.spans === 'all') return r.mode;
    return r.spans.some(([a, b]) => min >= a && min < b) ? r.mode : null;
  };
  const today = ruleFor(rules, now);
  let state = at(today, now.min);
  /* yesterday's span that runs past midnight («22:00-02:00») still holds in the small hours */
  if (!state) { const y = ruleFor(rules, prev); if (y && y.spans !== 'all') state = y.spans.some(([a, b]) => b > 1440 && now.min < b - 1440) ? y.mode : null; }
  const decided = state || 'closed';
  const out = { state: decided };
  const comment = (today && today.comment) || '';
  if (comment) out.comment = comment;
  if (holidays) out.holidays = true;
  return out;
}
