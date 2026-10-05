/* ============================================================================
 *  IntMap · a lunisolar date written as if it were Gregorian   (meiji-lunisolar-dates)
 * ----------------------------------------------------------------------------
 *  Japan kept the Tenpō lunisolar calendar (天保暦) until 明治5年12月2日; the next day was declared
 *  明治6年1月1日 = 1873-01-01 (太政官布告第337号, 明治5年11月9日). Every Japanese date before that is a
 *  lunisolar date, and its Gregorian day is a conversion, not a copy of the digits.
 *  OpenHistoricalMap holds 滋賀県 (relation 2796629) from `start_date=1872-09-28`. 犬上県 was merged into
 *  滋賀県 on 明治5年9月28日, which is 1872-10-30: the lunisolar month and day were written into an ISO
 *  date unchanged, and the map drew the merged prefecture a month early. Measured 2026-10-05 over the
 *  731 administrative relations of levels 3-7 inside Japan's extent: 73 state a day or a month before
 *  1873-01-01, 11 of them on Korean or Chinese ground; of the 63 statements on Japanese ground, 7 were
 *  lunisolar digits (滋賀県's start, 近江国's end, 琉球藩's start, and both edges of the two polder villages
 *  of 茶屋町 renamed in 明治3年11月) and 56 were already the Gregorian day (52 ends and 1 start on
 *  廃藩置県's 1871-08-29, and the 仙台県 / 宮城県 changes of 明治4-5年).
 *
 *  ══ WHAT IS DISCOVERED AND WHAT IS JUDGED ═════════════════════════════════════════════════════════
 *  The machine finds every statement that CAN carry the error: an upstream `start_date` / `end_date`
 *  stated to the day or the month, earlier than the day a calendar REGIME (below) adopted the Gregorian
 *  calendar, on a relation most of whose vertices lie on that regime's ground. It cannot tell which of
 *  them were converted — both forms are well-formed ISO dates (.agents/rules/historical-verification.md
 *  §1) — so each one is JUDGED in the ledger, beside the handover verdicts (data/hist-admin-edges.json,
 *  key `calendar`):
 *    · `reviewed` — the Japanese date the event carries (`wareki`), the Gregorian day it is (`at`), the
 *      source that states both (`source`: a ja.wikipedia revision by oldid), and the `history` sentence;
 *      applied to the shipped rows by `node scripts/build-hist-admin1.mjs --edges`, which records the
 *      correction beside upstream's own words (`dates[id].<edge>.corrected`) and never overwrites them,
 *      and to the vector-tile LINES of the same relation (the tier's `lines`, read by js/hist-scale.js
 *      `ohmFilter` / `inForce`) — the second reader of the same rule (historical-verification §2b);
 *    · `refuted`  — statements examined and left as upstream wrote them, because they already are the
 *      Gregorian day of the event (`wareki` names it, `source` states the pair).
 *  ⚠ A year-precision statement is not discovered: the year a lunisolar date falls in differs from its
 *  Gregorian year only in its last month or two (the lunisolar year begins in late January or February), and a statement that names only the year
 *  does not say whether it is one of those — converting it would write a day nobody stated (§2-3).
 *  ⚠ The conversion is CHECKED, not trusted: the Qing 時憲暦 and the Tenpō calendar both reckon true new
 *  moons and true solar terms (定気), at 120°E and Kyoto respectively, so their months begin on the same
 *  day or one day apart (among the dates here: 明治5年9月1日 = 1872-10-03 against the Chinese 10-02, fixed
 *  by 明治5年9月28日 = 1872-10-30 in the source and by Wikidata's 1872-10-16 for 明治5年9月14日). The gate asks the
 *  platform's Chinese calendar (ICU, `Intl` with `ca-chinese`) whether `at` is that `wareki` within
 *  one day; a typo in either is a month away. EXPIRES before 弘化元年 (1844-02-18), when Japan's
 *  calendar was 寛政暦 with mean solar terms — a statement before that has no check here and fails.
 * ==========================================================================*/

import { KNOW, scan } from '../../js/hist-knowledge.js';

export const LEDGER = 'data/hist-admin-edges.json';
/* the OpenHistoricalMap tiers — the names build-hist-admin1.mjs `tiers()` writes */
const TIER_FILE = /^data\/hist-admin\d+\.js$/;

/** the calendar regimes: whose ground, until when, by what act — the only hand-written part, and it is a rule */
export const REGIMES = [{
  ground: 'JPN',                 /* the present-day country in data/admin1-world.json.gz whose land the regime is read on */
  until: '1873-01-01',           /* the first Gregorian day */
  calendar: 'Tenpō lunisolar calendar (天保暦)',
  basis: '太政官布告第337号 (明治5年11月9日): 明治5年12月3日 becomes 明治6年1月1日, 1873-01-01',
  checkFrom: '1844-02-18',       /* 弘化元年1月1日, the Tenpō calendar's first day — the ICU check holds from here */
}];

/* era → its first lunisolar year; a 年 is counted from the year the era began (元年 = that year) */
const ERAS = { 天保: 1830, 弘化: 1844, 嘉永: 1848, 安政: 1854, 万延: 1860, 文久: 1861, 元治: 1864, 慶応: 1865, 明治: 1868 };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/, ISO_MONTH = /^(\d{4})-(\d{2})$/;
export const precisionOf = (raw) => ISO_DAY.test(raw) ? 'day' : ISO_MONTH.test(raw) ? 'month' : null;

/** «明治5年9月28日» / «明治3年閏10月» / «明治元年11月» → {year (lunisolar), month, leap, day|null} */
export function parseWareki(s) {
  const m = /^(\S{2})(元|\d+)年(閏)?(\d+)月(?:(\d+)日)?$/.exec(String(s || '').trim());
  if (!m || !(m[1] in ERAS)) return null;
  const n = m[2] === '元' ? 1 : +m[2];
  return { year: ERAS[m[1]] + n - 1, month: +m[4], leap: !!m[3], day: m[5] ? +m[5] : null };
}

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
let _fmt = null;
/** the Chinese-calendar reading of a Gregorian day: {year, month, leap, day} */
export function chineseOf(t) {
  _fmt = _fmt || new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  const p = Object.fromEntries(_fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { year: +p.relatedYear, month: parseInt(p.month, 10), leap: /bis/.test(p.month), day: +p.day };
}
const same = (c, w) => c.year === w.year && c.month === w.month && c.leap === w.leap;

/**
 * Whether `at` (a day, or a month written «first/last») is the Gregorian form of `wareki`, within the one
 * day the two calendars can differ by. Returns null when it is, else the reason.
 */
export function conversionProblem(wareki, at, regime = REGIMES[0]) {
  const w = parseWareki(wareki);
  if (!w) return 'the Japanese date «' + wareki + '» is not «<era>N年[閏]M月[D日]» with a known era';
  if (w.day != null) {
    if (!ISO_DAY.test(at)) return 'a dated wareki needs a day, not ' + at;
    if (at < regime.checkFrom) return at + ' is before ' + regime.checkFrom + ', where this gate has no calendar to check against';
    const t = utc(at);
    const ok = [-1, 0, 1].some((k) => { const c = chineseOf(t + k * DAY); return same(c, w) && c.day === w.day; });
    const c = chineseOf(t);
    return ok ? null : at + ' is ' + c.year + '/' + (c.leap ? '閏' : '') + c.month + '/' + c.day + ' in the Chinese calendar, not within a day of ' + wareki;
  }
  const m = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(at);
  if (!m) return 'a wareki month needs its Gregorian span «first/last», not ' + at;
  if (m[1] < regime.checkFrom) return at + ' is before ' + regime.checkFrom + ', where this gate has no calendar to check against';
  const a = utc(m[1]), b = utc(m[2]), n = Math.round((b - a) / DAY) + 1;
  if (n !== 29 && n !== 30) return at + ' spans ' + n + ' days; a lunisolar month has 29 or 30';
  let inside = 0;
  for (let t = a; t <= b; t += DAY) if (same(chineseOf(t), w)) inside++;
  return inside >= n - 1 ? null : at + ': only ' + inside + ' of its ' + n + ' days are ' + wareki + ' in the Chinese calendar';
}

/* ── the day the shipped row stores for an edge — the builder's own convention (build-hist-admin1.mjs ymd):
   a start is its first day; an end is EXCLUSIVE, so a stated day is kept and a month ends on the first day
   after it. A corrected month is a span «first/last», so its exclusive end is the day after `last`. */
export function rowDay(at, edge) {
  if (ISO_DAY.test(at)) return at.split('-').map(Number);
  const [first, last] = at.split('/');
  return (edge === 'start' ? first : iso(utc(last) + DAY)).split('-').map(Number);
}

/* ── whose ground a relation is on. Every present-day country of data/admin1-world.json.gz inside the window is
   filled on the knowledge grid's fine cells (js/hist-knowledge.js KNOW.fineRes, 0.1°), and a sea cell next to land
   takes that land's country: a boundary relation's vertices ARE its coastline, and the outline is generalised —
   淡路国's 154 vertices against a 20-vertex island measured 0 inside it with a point-in-polygon test, 琉球藩 0 of
   2,167. A relation belongs to the country holding the most of its vertices that fall on any land (measured
   2026-10-05 over the 73 candidates on Japan's extent: every Japanese one ≥ 0.43 of all its vertices on Japan —
   琉球藩 is mostly sea — and every Korean, Jeju or Ming one 0). */
export function groundIndex(features, win0) {
  const R = KNOW.fineRes;
  const x0 = Math.floor(win0[0] / R) * R - 2 * R, y0 = Math.floor(win0[1] / R) * R - 2 * R;
  const win = { x0, y0, res: R, NX: Math.ceil((win0[2] - x0) / R) + 3, NY: Math.ceil((win0[3] - y0) / R) + 3 };
  const iso = [], cell = new Int16Array(win.NX * win.NY).fill(-1);
  for (const f of features) {
    let k = iso.indexOf(f.i); if (k < 0) { k = iso.length; iso.push(f.i); }
    const g = f.g;
    for (const p of (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)) scan(win, p, (j, i0, i1) => { for (let i = i0; i <= i1; i++) cell[j * win.NX + i] = k; });
  }
  const grown = cell.slice();
  for (let j = 0; j < win.NY; j++) for (let i = 0; i < win.NX; i++) {
    const k = cell[j * win.NX + i]; if (k < 0) continue;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const jj = j + dj, ii = i + di;
      if (jj >= 0 && jj < win.NY && ii >= 0 && ii < win.NX && grown[jj * win.NX + ii] < 0) grown[jj * win.NX + ii] = k;
    }
  }
  return (x, y) => { const i = Math.floor((x - x0) / R), j = Math.floor((y - y0) / R);
    if (i < 0 || i >= win.NX || j < 0 || j >= win.NY) return null; const k = grown[j * win.NX + i]; return k < 0 ? null : iso[k]; };
}
/** the country holding most of a relation's on-land vertices, and its share of all of them */
export function groundOf(points, countryAt) {
  const n = new Map();
  for (const [x, y] of points) { const c = countryAt(x, y); if (c) n.set(c, (n.get(c) || 0) + 1); }
  let best = null, k = 0; for (const [c, v] of n) if (v > k) { best = c; k = v; }
  return { iso: best, share: points.length ? k / points.length : 0 };
}

/**
 * Every statement that can carry the error, from upstream relations with their geometry.
 * @param rels [{id, tags, ways:[{id, pts:[[lon,lat]…]}]}] — levels the tiers hold, inside the ground's extent
 * @param countryAt (lon, lat) → present-day ISO3 or null (groundIndex); regime the calendar regime
 */
export function statements(rels, countryAt, regime = REGIMES[0]) {
  const found = [];
  for (const r of rels) {
    const t = r.tags || {};
    if (groundOf(r.ways.flatMap((w) => w.pts), countryAt).iso !== regime.ground) continue;   /* another regime's record */
    for (const edge of ['start', 'end']) {
      const raw = String(t[edge + '_date'] || '').trim();
      if (!precisionOf(raw) || raw >= regime.until) continue;
      found.push({ id: r.id, edge, raw, name: t['name:ja'] || t.name || '', level: +t.admin_level, ways: r.ways.map((w) => w.id).sort((a, b) => a - b) });
    }
  }
  return found.sort((a, b) => a.id - b.id || (a.edge < b.edge ? 1 : -1));
}

/** the verdict for one statement */
export function verdictOf(f, cal) {
  const r = (cal.reviewed || []).find((x) => x.id === f.id && x.edge === f.edge);
  if (r) return { by: 'reviewed', r };
  const x = (cal.refuted || []).find((y) => y.edge === f.edge && (y.ids || []).includes(f.id));
  return x ? { by: 'refuted', x } : null;
}

const mark = (r) => ({ at: r.at, wareki: r.wareki, source: r.source, by: LEDGER + ' calendar' });

/** what a tier's tile lines must carry: each reviewed day-precision statement of a level that tier draws */
export function linesFor(levels, cal) {
  const out = [];
  for (const r of cal.reviewed || []) {
    const f = (cal.found || []).find((x) => x.id === r.id && x.edge === r.edge);
    /* a month or a year reaches the tiles normalised to a day upstream never wrote, so only a stated
       day can be matched there by its own string; the month statements measured here draw no line of
       their own in the tiles (the polder villages' boundary runs 1707-1889 unbroken) */
    if (!f || precisionOf(f.raw) !== 'day' || !levels.includes(f.level)) continue;
    out.push({ id: r.id, edge: r.edge, raw: f.raw, at: r.at, ways: f.ways });
  }
  return out.sort((a, b) => a.id - b.id || (a.edge < b.edge ? 1 : -1));
}

/**
 * Apply every reviewed statement to the shipped rows and to each tier's tile lines.
 * @param bundles [{file, data}] — mutated in place
 * @returns {string[]} the files that changed
 */
export function applyCalendar(bundles, ledger) {
  const cal = ledger.calendar || {}, touched = new Set();
  for (const b of bundles) {
    const D = b.data, dates = D.dates || (D.dates = {});
    for (const r of cal.reviewed || []) {
      const [y, m, d] = rowDay(r.at, r.edge), k = r.edge === 'start' ? 2 : 5;
      for (const f of D.feats) {
        if (f[10] !== r.id) continue;
        if (f[k] !== y || f[k + 1] !== m || f[k + 2] !== d) { f[k] = y; f[k + 1] = m; f[k + 2] = d; touched.add(b.file); }
        const e = dates[f[10]] || (dates[f[10]] = {}), c = mark(r);
        if (JSON.stringify((e[r.edge] || {}).corrected) !== JSON.stringify(c)) { e[r.edge] = { ...(e[r.edge] || {}), corrected: c }; touched.add(b.file); }
      }
    }
    const want = linesFor(D.levels || [], cal);
    if (JSON.stringify(D.lines || []) !== JSON.stringify(want)) {
      if (want.length) D.lines = want; else delete D.lines;
      touched.add(b.file);
    }
  }
  return [...touched];
}

/**
 * The gate, offline: every statement judged, every verdict converted and sourced, every correction applied
 * to both readers.
 * @param bundles [{file, b}] — the shipped tiers as data
 * @param historyNames (text, year) → whether a sentence names that year (scripts/hist-fidelity.mjs)
 */
export function calendarProblems(bundles, ledger, historyNames) {
  const out = [], cal = ledger.calendar || {};
  const found = cal.found || [];
  const key = (f) => f.id + ' ' + f.edge;
  for (const f of found) if (!verdictOf(f, cal)) out.push(['calendar-unjudged', `«${f.name}» (${f.id}) ${f.edge} ${f.raw} is a date before ${REGIMES[0].until} on Japanese ground — say whether it is the Gregorian day or lunisolar digits, in ${LEDGER} calendar`]);
  const src = (s) => s && typeof s.title === 'string' && s.title && Number.isInteger(s.oldid) && s.oldid > 0;
  for (const r of cal.reviewed || []) {
    const tag = `${r.id} ${r.edge} → ${r.at}`;
    const f = found.find((x) => key(x) === key(r));
    if (!f) { out.push(['calendar-reviewed-dead', tag + ' is reviewed, but no statement raises it any more — the record changed; re-judge or remove it']); continue; }
    if (r.raw !== f.raw) out.push(['calendar-reviewed-stale', tag + ' reviewed upstream\'s «' + r.raw + '», and upstream now writes «' + f.raw + '»']);
    const w = parseWareki(r.wareki);
    if (w && (w.day != null) !== (precisionOf(f.raw) === 'day')) out.push(['calendar-precision', tag + ': upstream states a ' + precisionOf(f.raw) + ' and «' + r.wareki + '» a ' + (w.day != null ? 'day' : 'month')]);
    const cp = conversionProblem(r.wareki, r.at);
    if (cp) out.push(['calendar-conversion', tag + ': ' + cp]);
    if (r.at === f.raw) out.push(['calendar-not-a-correction', tag + ' is what upstream already writes — refute it instead']);
    if (!src(r.source)) out.push(['calendar-unsourced', tag + ': `source` needs the article `title` and its revision `oldid`']);
    const y = +String(r.at).slice(0, 4);
    if (!(r.history && String(r.history).includes(r.wareki) && historyNames(r.history, y))) out.push(['calendar-unreviewed', tag + ': the `history` sentence must name «' + r.wareki + '» and the year ' + y]);
  }
  for (const x of cal.refuted || []) {
    const tag = `${(x.ids || []).length} statement(s) ${x.edge} ${x.raw}`;
    if (x.why !== 'stated-gregorian') { out.push(['calendar-refuted-unexplained', tag + ': `why` must be «stated-gregorian» (the only reason a pre-1873 statement is right as written)']); continue; }
    const cp = conversionProblem(x.wareki, x.raw);
    if (cp) out.push(['calendar-refuted-wrong', tag + ' is refuted as the Gregorian form of «' + x.wareki + '», and it is not: ' + cp]);
    if (!src(x.source) || !x.note) out.push(['calendar-refuted-unexplained', tag + ': needs `source` (title, oldid) and a `note`']);
    for (const id of x.ids || []) {
      const f = found.find((z) => z.id === id && z.edge === x.edge);
      if (!f) out.push(['calendar-refuted-dead', `${id} ${x.edge} is refuted, but no statement raises it any more`]);
      else if (f.raw !== x.raw) out.push(['calendar-refuted-stale', `${id} ${x.edge}: refuted as «${x.raw}», upstream now writes «${f.raw}»`]);
    }
  }
  /* applied — to the rows that are shipped, and to the lines of every tier */
  for (const r of cal.reviewed || []) {
    const [y, m, d] = rowDay(r.at, r.edge), k = r.edge === 'start' ? 2 : 5;
    for (const { file, b } of bundles) for (const f of b.feats) {
      if (f[10] !== r.id) continue;
      if (f[k] !== y || f[k + 1] !== m || f[k + 2] !== d) out.push(['calendar-not-applied', `«${f[0]}» (${r.id}) in ${file} still has its ${r.edge} at ${[f[k], f[k + 1], f[k + 2]].join('-')}, not ${[y, m, d].join('-')}`]);
      const e = ((b.dates || {})[r.id] || {})[r.edge] || {};
      if (!(e.corrected && e.corrected.at === r.at && e.raw)) out.push(['calendar-unmarked', `«${f[0]}» (${r.id}) in ${file} does not carry the correction beside upstream's own ${r.edge} date`]);
    }
  }
  for (const { file, b } of bundles) {
    /* only the OpenHistoricalMap tiers sit under its tiles; a gap record draws its own lines */
    if (!TIER_FILE.test(file) || !Array.isArray(b.levels)) continue;
    const want = linesFor(b.levels, cal);
    if (JSON.stringify(b.lines || []) !== JSON.stringify(want)) out.push(['calendar-lines', `${file}: the tile lines it carries (${(b.lines || []).length}) are not the reviewed statements of its levels (${want.length}) — node scripts/build-hist-admin1.mjs --edges`]);
  }
  return out;
}
