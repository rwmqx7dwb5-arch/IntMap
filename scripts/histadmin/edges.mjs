/* ============================================================================
 *  IntMap · one handover, two statements of its year   (hist-fidelity-sweep)
 * ----------------------------------------------------------------------------
 *  «Okinawa Prefecture» was drawn from 1880-01-01 and «Ryukyu Domain» until then. The Ryukyu
 *  Disposition is 1879: the order abolishing the domain was delivered at Shuri on 27 March and the
 *  prefecture proclaimed on 4 April. OpenHistoricalMap holds both relations (2890077 and 2890076) and
 *  ties them together itself: both carry the SAME event text, «Ryukyu Domain becomes Okinawa
 *  Prefecture», as `end_date:event` and `start_date:event`. And it writes that one instant twice, in
 *  two different years — `end_date=1879` on the domain, `start_date=1880` on the prefecture. The build
 *  reads a year-precision end as «until the end of that year», so the two meet at 1880-01-01, a date
 *  neither statement makes and history contradicts.
 *
 *  ══ WHAT IS DISCOVERED AND WHAT IS JUDGED ═════════════════════════════════════════════════════════
 *  The machine finds every SUCCESSION upstream ties by one event — the LAST row of one unit (its
 *  dissolution) and the FIRST row of another (its founding) naming the same `…:event` — whose two
 *  statements name different years. Those are the only places where the record itself says «these two
 *  edges are one instant» and then disagrees with itself about it. Measured over all three tiers on
 *  2026-10-02: 9 such successions, 1 disagreeing (this one). The machine cannot say which year is true
 *  (.agents/rules/historical-verification.md §2-2), so the finding is JUDGED in the ledger:
 *    · `reviewed` — the instant both edges are moved to, the Wikidata item and property that state
 *      that day, and the `history` sentence that agrees with it; applied to the shipped rows by
 *      `node scripts/build-hist-admin1.mjs --edges`, which records the correction beside the source's
 *      own words (`dates[id].<edge>.corrected`) and never overwrites them;
 *    · `refuted`  — a finding examined and left as upstream wrote it, with the reason.
 *  `found` and `facts` are the photographs the gate re-reads offline (refreshed by `--edges`).
 *  ⚠ The day a reviewed entry names must be one Wikidata states for one of the two units — the same
 *  discipline data/hist-era-spans.json follows: the map does not write a date nobody stated.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIKIDATA } from '../lib/upstream-cadence.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LEDGER = 'data/hist-admin-edges.json';

/* ⚠ (upstream-liveness) 出自は値である。`found` は OpenHistoricalMap のタグ、`facts` は Wikidata が述べる
   P571 / P576、`reviewed` / `refuted` はそれを史実と照合した審査（IntMap が書いたもの）。 */
export const GOVERNANCE = {
  'data/hist-admin-edges.json': {
    /* the corrected days are Wikidata's; which of them act on the map is IntMap's reviewed verdict */
    publisher: 'Wikidata',
    url: 'https://www.wikidata.org/',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: false,
    paidBy: 'Wikidata (CC0 1.0)',
    ...WIKIDATA,
    builtBy: 'scripts/build-hist-admin1.mjs',
  },
};

export function readEdges(root = ROOT) {
  return JSON.parse(readFileSync(join(root, LEDGER), 'utf8'));
}

const yearOf = (raw) => { const m = /^(-?\d+)/.exec(String(raw == null ? '' : raw).replace(/[~?%]/g, '').trim()); return m ? +m[1] : null; };
const stamp = (f, k) => f[k] * 10000 + f[k + 1] * 100 + f[k + 2];

/**
 * Every succession upstream ties by one event, and whether its two statements agree on the year.
 * @param units [{file, feats, tagsById}] — the shipped rows of each tier and their upstream tags
 * @returns {{pairs:number, found:object[]}} `found` holds only the pairs whose years disagree
 */
export function successions(units) {
  const found = [];
  let pairs = 0;
  for (const u of units) {
    const T = u.tagsById, rows = u.feats.filter((f) => T.has(f[10]));
    /* one unit over time is the rows sharing a Wikidata item, or a name where the record names no item */
    const key = (f) => { const t = T.get(f[10]) || {}; return t.wikidata ? 'q:' + t.wikidata : 'n:' + f[0]; };
    const chain = new Map();
    for (const f of rows) { const k = key(f); if (!chain.has(k)) chain.set(k, []); chain.get(k).push(f); }
    const first = new Set(), last = new Set();
    for (const L of chain.values()) {
      first.add(L.reduce((a, c) => (stamp(c, 2) < stamp(a, 2) ? c : a))[10]);
      last.add(L.reduce((a, c) => (stamp(c, 5) > stamp(a, 5) ? c : a))[10]);
    }
    const ends = new Map(), starts = new Map();
    const push = (m, k, f) => { if (!m.has(k)) m.set(k, []); m.get(k).push(f); };
    for (const f of rows) {
      const t = T.get(f[10]);
      if (t['end_date:event'] && last.has(f[10])) push(ends, String(t['end_date:event']).trim(), f);
      if (t['start_date:event'] && first.has(f[10])) push(starts, String(t['start_date:event']).trim(), f);
    }
    for (const [ev, A] of ends) {
      const B = starts.get(ev); if (!B) continue;
      for (const a of A) for (const c of B) {
        if (key(a) === key(c)) continue;
        pairs++;
        const ea = T.get(a[10]).end_date, sb = T.get(c[10]).start_date;
        if (yearOf(ea) == null || yearOf(sb) == null || yearOf(ea) === yearOf(sb)) continue;
        found.push({ file: u.file, event: ev,
          end: { id: a[10], name: a[0], raw: String(ea) },
          start: { id: c[10], name: c[0], raw: String(sb) } });
      }
    }
  }
  found.sort((x, y) => (x.file + x.end.id < y.file + y.end.id ? -1 : 1));
  return { pairs, found };
}

/** the reviewed verdict for a finding, by the two relation ids */
export function verdictOf(f, ledger) {
  const r = (ledger.reviewed || []).find((x) => x.end === f.end.id && x.start === f.start.id);
  if (r) return { by: 'reviewed', r };
  const x = (ledger.refuted || []).find((y) => y.end === f.end.id && y.start === f.start.id);
  return x ? { by: 'refuted', x } : null;
}

/**
 * Move both edges of every reviewed succession to its day, in the shipped rows, keeping upstream's words.
 * @param bundles [{file, data}] — mutated in place
 * @returns {string[]} the files whose rows changed
 */
export function applyEdges(bundles, ledger) {
  const touched = new Set();
  const at = (s) => s.split('-').map(Number);
  for (const r of ledger.reviewed || []) {
    const [y, m, d] = at(r.at);
    for (const b of bundles) {
      const D = b.data, dates = D.dates || (D.dates = {});
      for (const f of D.feats) {
        if (f[10] === r.end) {
          if (f[5] !== y || f[6] !== m || f[7] !== d) { f[5] = y; f[6] = m; f[7] = d; touched.add(b.file); }
          const e = dates[f[10]] || (dates[f[10]] = {});
          const c = { at: r.at, q: r.q, p: r.p, by: LEDGER };
          if (JSON.stringify((e.end || {}).corrected) !== JSON.stringify(c)) { e.end = { ...(e.end || {}), corrected: c }; touched.add(b.file); }
        }
        if (f[10] === r.start) {
          if (f[2] !== y || f[3] !== m || f[4] !== d) { f[2] = y; f[3] = m; f[4] = d; touched.add(b.file); }
          const e = dates[f[10]] || (dates[f[10]] = {});
          const c = { at: r.at, q: r.q, p: r.p, by: LEDGER };
          if (JSON.stringify((e.start || {}).corrected) !== JSON.stringify(c)) { e.start = { ...(e.start || {}), corrected: c }; touched.add(b.file); }
        }
      }
    }
  }
  return [...touched];
}

/* ══ (hist-findings-sweep) A RELATION UPSTREAM DRAWS AS A SUBDIVISION THAT WAS NO UNIT OF GOVERNMENT: `withdrawn` ══════
   OpenHistoricalMap holds «US occupation of Greenland» (r2870662, admin_level 4, 1941-04-08 to 1945, wikidata=Q223)
   as a first-level unit of Denmark. The historical record says there was no such unit: the 1941 defence agreement
   recognised Danish sovereignty and the island stayed under its two Danish landsfogeder (the Inspectorates OHM itself
   holds, 1874-1951). Drawn, it is a label, a click and a counted unit that state an American administration.
   ⇒ `withdrawn` lists such relations with the `history` that refutes them; the row is taken out of the tier that
   ships it (its rings stay pooled when another row uses them — the gate counts orphans). The tiles' line is a
   separate reader (historical-verification.md §2b): an entry says what it found there (`tiles`), and an entry whose
   relation draws a line no other relation in force draws is refused here, because removing the bundle row would not
   remove that line. */
export function applyWithdrawn(bundles, ledger) {
  const ids = new Set((ledger.withdrawn || []).map((x) => x.id)), touched = new Set();
  for (const b of bundles) {
    const D = b.data, keep = D.feats.filter((f) => !ids.has(f[10]));
    if (keep.length === D.feats.length) continue;
    /* the accounting scripts/build-hist-admin1.mjs `--dates` keeps for a removed row: the topology ledger states the
       removal (`removedAfterRun`, never a guessed bucket) and the precision ledger gives the row back */
    const gone = D.feats.length - keep.length;
    if (D.topology) D.topology.removedAfterRun = (D.topology.removedAfterRun || 0) + gone;
    if (D.precision) { let owed = gone; for (const k of ['refined', 'retained']) { if (!owed) break; const t = Math.min(D.precision[k] || 0, owed); D.precision[k] -= t; owed -= t; }
      if (owed) throw new Error(b.file + ': precision accounting cannot absorb ' + gone + ' withdrawn row(s)'); }
    D.feats = keep; if (b.unit) b.unit.feats = keep;
    for (const id of ids) if (D.dates && D.dates[id]) delete D.dates[id];
    touched.add(b.file);
  }
  return [...touched];
}

/**
 * The gate, offline: every finding judged, every verdict stated by Wikidata, reviewed by history and
 * applied to the shipped rows.
 * @param bundles [{file, b}] — the shipped tiers as data
 * @param historyNames (text, year) → whether a sentence names that year (scripts/hist-fidelity.mjs)
 */
export function edgeProblems(bundles, ledger, historyNames) {
  const out = [];
  for (const f of ledger.found || []) {
    if (!verdictOf(f, ledger)) out.push(['edge-unjudged', `«${f.end.name}» ends ${f.end.raw} and «${f.start.name}» begins ${f.start.raw}, and upstream names one event for both («${f.event}») — judge the year against the historical record in ${LEDGER}`]);
  }
  const rowOf = (id) => { for (const { file, b } of bundles) { const f = b.feats.find((x) => x[10] === id); if (f) return { file, f, d: (b.dates || {})[id] || {} }; } return null; };
  for (const r of ledger.reviewed || []) {
    const tag = `${r.end} → ${r.start} at ${r.at}`;
    if (!(ledger.found || []).some((f) => f.end.id === r.end && f.start.id === r.start)) out.push(['edge-reviewed-dead', tag + ' is reviewed, but no finding raises it any more — the record changed; re-judge or remove it']);
    const fa = (ledger.facts || {})[r.q] || {};
    if (!(fa[r.p] || []).includes(r.at)) out.push(['edge-unstated', tag + ': Wikidata ' + r.q + ' ' + r.p + ' does not state ' + r.at + ' (it states ' + JSON.stringify(fa[r.p] || []) + ')']);
    if (!(r.history && historyNames(r.history, +r.at.slice(0, r.at.indexOf('-', 1))))) out.push(['edge-unreviewed', tag + ': the `history` sentence does not name the year']);
    const [y, m, d] = r.at.split('-').map(Number);
    const e = rowOf(r.end), s = rowOf(r.start);
    if (!e || !s) { out.push(['edge-row-missing', tag + ': a row it corrects is not shipped']); continue; }
    if (e.f[5] !== y || e.f[6] !== m || e.f[7] !== d) out.push(['edge-not-applied', tag + ': «' + e.f[0] + '» still ends ' + [e.f[5], e.f[6], e.f[7]].join('-')]);
    if (s.f[2] !== y || s.f[3] !== m || s.f[4] !== d) out.push(['edge-not-applied', tag + ': «' + s.f[0] + '» still begins ' + [s.f[2], s.f[3], s.f[4]].join('-')]);
    if (!(e.d.end && e.d.end.corrected && e.d.end.corrected.at === r.at && e.d.end.raw)) out.push(['edge-unmarked', tag + ': the end row does not carry the correction beside upstream\'s own date']);
    if (!(s.d.start && s.d.start.corrected && s.d.start.corrected.at === r.at && s.d.start.raw)) out.push(['edge-unmarked', tag + ': the start row does not carry the correction beside upstream\'s own date']);
  }
  for (const x of ledger.refuted || []) if (!(x.why && x.note)) out.push(['edge-refuted-unexplained', x.end + ' → ' + x.start + ' is refuted without a reason']);
  for (const x of ledger.withdrawn || []) {
    const tag = 'r' + x.id + ' «' + x.name + '»';
    if (!(Number.isInteger(x.id) && x.name && typeof x.history === 'string' && x.history.length > 60)) out.push(['unit-withdrawn-unexplained', tag + ' is withdrawn without the history that refutes it']);
    if (!(typeof x.tiles === 'string' && x.tiles.length > 30)) out.push(['unit-withdrawn-tiles', tag + ': say what the OpenHistoricalMap tiles draw for it (historical-verification.md §2b)']);
    if (rowOf(x.id)) out.push(['unit-withdrawn-shipped', tag + ' is withdrawn and still shipped — node scripts/build-hist-admin1.mjs --withdrawn']);
  }
  return out;
}
