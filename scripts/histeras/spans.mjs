#!/usr/bin/env node
/* ============================================================================
 *  IntMap · when did the polity an era sheet names actually exist?   (hist-era-span-fidelity)
 * ----------------------------------------------------------------------------
 *  「Chronos を 1600 年にすると Songhai と Watassid Morocco が描かれる。」 — measured on production
 *  2026-10-01 (048e4ce). The Songhai Empire fell to the Saadian invasion in 1591 (Tondibi); the
 *  Wattasids lost Fez to the Saadians and ended in 1554.
 *
 *  ══ WHAT THE DEFECT WAS, MEASURED — AND THE SUSPECTED CAUSE THAT WAS NOT IT ═══════════════════
 *  The report guessed that an older snapshot was being stretched over the years up to the next one.
 *  That is NOT how these two reached 1600: the upstream file world_1600.geojson itself carries
 *  «Songhai» and «Watassid Morocco» (data/hist-eras.js, sheet 1600, both with BORDERPRECISION 1), and
 *  so does world_1700 for «Songhai». The upstream cartographer carried the names forward from the
 *  sheets before and the sheet states them for its own year. A gate that measures form cannot see
 *  this: the sheet is well formed, the year is the file's own, and every check was green.
 *  ⚠ THE STRETCH IS REAL TOO, AND IS A SECOND SOURCE OF THE SAME CLAIM. `nearest()` in
 *  js/time-borders.js answers every year of a gap with the closer sheet, so world_1600 is drawn from
 *  1566 to 1625: «Dutch Republic» (1581) is drawn in 1570 and «Songhai» in 1620 by that path alone.
 *  Both paths end in one statement on the map — «this polity, in this year» — and the year that
 *  matters is the year the READER is on, not the year printed on the sheet. So the rule is asked of
 *  the reader's year.
 *
 *  ══ WHY THE ANSWER IS A REVIEWED LEDGER AND NOT A WIKIDATA JOIN ══════════════════════════════
 *  The upstream carries no identifier (21 of 10,388 named features have a `wikipedia` link), so a
 *  polity's lifespan can only be reached through its NAME. #R686's matcher (scripts/histeras/
 *  match.mjs) already binds 773 era names to QIDs, and asking those QIDs for P571/P576 is the
 *  machine's half. It is not enough on its own, measured here 2026-10-01:
 *    · it MISSES the reported pair — «Songhai» has six label-equal candidates and none is the
 *      empire (Q202687 is labelled «Songhai Empire»); «Watassid Morocco» is a misspelling no label
 *      carries — so a purely mechanical join never finds the very defect that was reported;
 *    · and where it does bind, the binding is often a different unit: «Mali» → Q912 (the republic,
 *      1960), «Vijayanagara» → the town, «Shan states» → an item whose P576 1563 no history of the
 *      Shan states supports. Truncating by those dates would delete true names.
 *  (.agents/rules/historical-verification.md §2-2, §4-3: an upstream saying so is not history, and
 *  an identifier must be shown to be THAT unit's.) So the machine FINDS and the ledger JUDGES:
 *    · `rows`    — a name, the QID that is verified to be the unit the upstream draws, and the
 *                  bound (`s` and/or `e`, astronomical years) that BOTH Wikidata states AND the
 *                  historical record (the `history` sentence) agrees with. Only these act on the map.
 *    · `refuted` — a mechanical finding that was examined and does not hold, with the reason
 *                  (`other-identity`: the QID is not the unit drawn; `date-disputed`: the date is
 *                  not the historical one; `name-not-claim`: the string is a place, not a polity).
 *    · `facts`   — what Wikidata states for every QID either list or the matcher names, fetched by
 *                  `--fetch` so that the gate can re-find candidates OFFLINE.
 *  `npm run check:histfidelity` re-runs the finding against the shipped bundle and fails on any
 *  finding nobody judged — so the next upstream sheet, or the next matcher binding, arrives already
 *  counted rather than waiting for a reader to notice (.agents/rules/no-ad-hoc-hardcoding.md §6:
 *  the per-name rows are the part that cannot be derived, and the gate is what keeps them honest).
 *
 *      node scripts/histeras/spans.mjs --fetch       # refresh `facts` from Wikidata (network)
 *      node scripts/hist-fidelity.mjs --report       # every finding, judged or not (offline)
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WIKIDATA } from '../lib/upstream-cadence.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LEDGER = 'data/hist-era-spans.json';

/* ⚠ (upstream-liveness) 出自は値である。読むのは js/data-governance.js の read() と
   npm run check:datagov（scripts/data-governance.mjs）。`facts` は Wikidata が述べる P571 / P576、
   `rows` / `refuted` はそれを史実と照合した審査（IntMap が書いたもの）。 */
export const GOVERNANCE = {
  'data/hist-era-spans.json': {
    /* the dates are Wikidata's; which of them act on the map is IntMap's reviewed verdict */
    publisher: 'Wikidata',
    url: 'https://www.wikidata.org/',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    /* CC0: crediting is a courtesy, not a condition — the row is paid anyway */
    attribution: false,
    paidBy: 'Wikidata (CC0 1.0)',
    ...WIKIDATA,
    builtBy: 'scripts/histeras/spans.mjs',
  },
};
const API = 'https://www.wikidata.org/w/api.php';
const BATCH = 10;   /* entities per wbgetentities request — see fetchFacts */
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap; intmapofficial@gmail.com)';

/** The ledger at `root`. */
export function readLedger(root = ROOT) {
  return JSON.parse(readFileSync(join(root, LEDGER), 'utf8'));
}

/* ── a Wikidata time → the clock's astronomical year ─────────────────────────
   ⚠ THE SAME OFF-BY-ONE COUNTRY scripts/build-hist-eras.mjs `astroYear` documents. Wikidata writes
   a year before the common era with a minus sign and NO year zero («-0550» is 550 BCE), while the
   clock and the bundle count astronomically (550 BCE is −549). scripts/histeras/match.mjs `wdYear`
   negates the number as written — fine for its slack arithmetic, wrong for a bound that a year is
   compared against, so this one converts. */
export function wdAstro(t) {
  const m = /^([+-])0*(\d+)-/.exec(String(t || ''));
  if (!m) return null;
  const n = +m[2];
  return m[1] === '-' ? 1 - n : n;
}

/** The identity a drawn name is judged under: a reviewed row wins, else #R686's matcher binding. */
export function identityOf(name, ledger, histnames) {
  const row = (ledger.rows || []).find((r) => r.name === name);
  if (row) return { q: row.q, from: 'reviewed', row };
  const e = histnames && histnames.byName && histnames.byName.eras && histnames.byName.eras[name];
  return e && e.q ? { q: e.q, from: 'matcher', row: null } : null;
}

/* ── the years each sheet is actually drawn for ────────────────────────────────
   ⚠ ASKED OF THE PAGE'S OWN `nearest`, NEVER RE-DERIVED. A gate that assumed «a sheet answers the
   years after it» (as scripts/hist-fidelity.mjs `politiesAt` still does for coverage) would miss
   exactly the years the reader sees: world_1600 is drawn from 1566. `nearest` is monotone in the
   year, so each boundary is found by bisection between two neighbouring sheets. The band ends where
   the day-exact record begins (`below`), because above it the sheets are only a fallback. */
export function displayRanges(years, nearest, below) {
  const ys = years.slice().sort((a, b) => a - b), out = new Map();
  const firstOf = (p, n) => { let lo = p, hi = n; while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (nearest(m, ys) === n) hi = m; else lo = m; } return hi; };
  for (let i = 0; i < ys.length; i++) {
    const lo = i === 0 ? -Infinity : firstOf(ys[i - 1], ys[i]);
    const hi = i === ys.length - 1 ? Infinity : firstOf(ys[i], ys[i + 1]) - 1;
    if (lo >= below) continue;
    out.set(ys[i], [lo, Math.min(hi, below - 1)]);
  }
  return out;
}

/** Every (name, QID, side) whose stated lifespan the map's drawn years cross. Offline. */
export function candidates({ bundle, ledger, histnames, ranges }) {
  const facts = ledger.facts || {}, found = new Map();
  for (const s of bundle.snaps) {
    const rg = ranges.get(s.y); if (!rg) continue;
    for (const f of s.feats) {
      const name = f[0] && f[0].en; if (!name) continue;
      const id = identityOf(name, ledger, histnames); if (!id) continue;
      const fa = facts[id.q]; if (!fa) continue;
      /* the most generous span Wikidata states — several dates for one bound (Inca: 1533 and 1572)
         are several opinions, and a candidate is raised only when even the latest end / earliest
         start leaves the drawn years outside */
      const E = fa.e && fa.e.length ? Math.max(...fa.e) : null;
      const B = fa.s && fa.s.length ? Math.min(...fa.s) : null;
      const add = (side, year) => {
        const k = name + '\t' + id.q + '\t' + side;
        const c = found.get(k) || { name, q: id.q, from: id.from, side, year, label: fa.en || null, sheets: [] };
        c.sheets.push({ sheet: s.y, drawn: rg }); found.set(k, c);
      };
      if (E != null && rg[1] > E) add('end', E);
      if (B != null && rg[0] < B) add('start', B);
    }
  }
  return [...found.values()];
}

/** Is this finding judged — applied by a row, or refuted for that QID and side? */
export function judged(c, ledger) {
  const row = (ledger.rows || []).find((r) => r.name === c.name && r.q === c.q);
  if (row && (c.side === 'end' ? row.e != null : row.s != null)) return { by: 'row', row };
  const ref = (ledger.refuted || []).find((r) => r.name === c.name && r.q === c.q && r.side === c.side);
  return ref ? { by: 'refuted', ref } : null;
}

/* ── --fetch ──────────────────────────────────────────────────────────────── */
async function api(params) {
  let last;
  /* retried only after an OBSERVED failure — a thrown error or a non-2xx — and the next attempt
     waits longer (.agents/rules/one-pass-or-a-reason.md §5) */
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(API + '?format=json&' + params, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (r.ok) return await r.json();
      last = new Error('HTTP ' + r.status);
    } catch (e) { last = e; }
    console.error('  wbgetentities attempt ' + (a + 1) + ' failed: ' + last.message);
    await new Promise((s) => setTimeout(s, 2000 * (a + 1)));
  }
  throw last;
}
async function fetchFacts(root = ROOT) {
  const ledger = readLedger(root);
  const hn = JSON.parse(readFileSync(join(root, 'data', 'histnames.json'), 'utf8'));
  const qs = new Set();
  for (const e of Object.values(hn.byName.eras || {})) if (e && e.q) qs.add(e.q);
  for (const r of ledger.rows || []) qs.add(r.q);
  for (const r of ledger.refuted || []) qs.add(r.q);
  const ids = [...qs].sort(), facts = {};
  /* ⚠ BATCH IS SMALL ON PURPOSE: measured 2026-10-01, a batch of 50 whole entities (a country
     carries thousands of claims) was cut off mid-body («terminated») and nothing was written. */
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    process.stderr.write('  ' + (i + batch.length) + '/' + ids.length + ' QIDs\n');
    const j = await api('action=wbgetentities&props=labels%7Cclaims&languages=en&ids=' + batch.join('%7C'));
    for (const q of batch) {
      const en = j.entities && j.entities[q]; if (!en || en.missing !== undefined) continue;
      const t = (p) => [...new Set(((en.claims || {})[p] || [])
        .map((x) => x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value && x.mainsnak.datavalue.value.time)
        .map(wdAstro).filter((v) => v != null))].sort((a, b) => a - b);
      const s = t('P571'), e = t('P576');
      /* only what bears on a lifespan is kept: a QID with neither bound can raise no finding */
      if (s.length || e.length || (ledger.rows || []).some((r) => r.q === q)) {
        facts[q] = { en: (en.labels && en.labels.en && en.labels.en.value) || null, s, e };
      }
    }
  }
  ledger.facts = facts;
  delete ledger.fetched;
  /* the provenance travels IN the file as values (js/data-governance.js recordOf reads `gov`), taken
     from the one declaration above rather than typed twice */
  ledger.gov = { ...GOVERNANCE[LEDGER], retrievedAt: new Date().toISOString().slice(0, 10) };
  writeFileSync(join(root, LEDGER), serialize(ledger));
  console.log('facts for ' + Object.keys(facts).length + ' of ' + ids.length + ' QID(s) → ' + LEDGER);
}

/* ⚠ the ledger is written ONE ENTRY PER LINE, so a diff shows which verdict or which date moved */
export function serialize(ledger) {
  const { rows = [], refuted = [], facts = {}, ...head } = ledger;
  const list = (a) => (a.length ? '[\n' + a.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n ]' : '[]');
  const fk = Object.keys(facts).sort((a, b) => +a.slice(1) - +b.slice(1));
  return '{\n' + Object.entries(head).map(([k, v]) => ' ' + JSON.stringify(k) + ': ' + JSON.stringify(v) + ',\n').join('') +
    ' "rows": ' + list(rows) + ',\n "refuted": ' + list(refuted) + ',\n "facts": {\n' +
    fk.map((q) => '  ' + JSON.stringify(q) + ': ' + JSON.stringify(facts[q])).join(',\n') + '\n }\n}\n';
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--fetch')) await fetchFacts();
  else if (process.argv.includes('--format')) { writeFileSync(join(ROOT, LEDGER), serialize(readLedger(ROOT))); console.log('rewrote ' + LEDGER); }
  else console.log('usage: --fetch | --format');
}
