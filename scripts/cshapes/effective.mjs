/* ============================================================================
 *  scripts/cshapes/effective.mjs — the changes CShapes may have drawn on the wrong day   (hist-findings-sweep)
 * ----------------------------------------------------------------------------
 *  CShapes 2.0 codes every territorial change on the day its instrument was SIGNED (codebook §3: «we code the
 *  day on which for example a treaty was signed as the day a territorial change occurred»). Where a treaty took
 *  effect later, the map changes before the ground did — the Korean annexation was drawn from 23 August 1910,
 *  six days before the treaty was promulgated and took effect (cshapes-review-findings, the one case judged then).
 *
 *  THE MACHINE FINDS, scripts/cshapes/review.json JUDGES — the shape of scripts/histclio/review.json:
 *    · `changeDays(d)` lists every day the committed bundle changes a polity (a code's row that does not begin
 *      on the record's first day, and the day after a code's last row when it ends inside the record);
 *    · `--effective` (scripts/build-cshapes.mjs) asks Wikidata for every item with a day-precise point in time
 *      (P585, the signing day for a treaty) within NEAR days of one of those days and a day-precise effective
 *      date (P7588, or P580 on an item that is a treaty) LATER than it, and writes the photograph
 *      (scripts/cshapes/effective.json) with the CShapes changes each one meets;
 *    · `effectiveProblems` (the offline gate) fails on a candidate that review.json neither applies (an `edges`
 *      entry naming its `wd`) nor examines (an `examined` entry naming it in `wds`) — so a new one arrives counted.
 *  ⚠ NOTHING HERE DECIDES. A candidate is only «an instrument signed when CShapes changes something, which says
 *  it took effect later»: whether it is the instrument of that change, and whether the later day is the day the
 *  ground changed hands, is history's question and the ledger's answer (a bilateral investment treaty signed the
 *  same day moves no border; a ceded province already occupied was governed before the treaty took effect).
 *  NEAR (3 days): observed 2026-10-07 — CShapes starts colonial Korea on 23 August 1910 for a treaty signed on
 *  22 August, so the coded day is not always the signing day itself; expires if the photograph shows coded days
 *  further than this from their instrument's signing; canon: here.
 * ==========================================================================*/
export const NEAR = 3;
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const iso = (y, m, d) => String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const dayN = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const isoOfN = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
const shift = (s, n) => isoOfN(dayN(s) + n);

/** every day the bundle changes a polity: [{ day: 'YYYY-MM-DD', rows: [{ gw, name, kind: new|change|end }] }].
    ⚠ The days CShapes CODED, not the ones the committed bundle draws after the ledger moved them: an `edges` entry
    of `review` puts its `upstream` day back (kind 'upstream'), so a change already judged is still found, and the
    photograph does not change because it was acted on. */
export function changeDays(d, review) {
  let lo = Infinity, hi = -Infinity;
  for (const f of d.feats) { lo = Math.min(lo, ymd(f[2], f[3], f[4])); hi = Math.max(hi, ymd(f[5], f[6], f[7])); }
  const by = new Map(), out = new Map();
  for (const f of d.feats) { if (!by.has(f[1])) by.set(f[1], []); by.get(f[1]).push(f); }
  const add = (day, row) => { if (!out.has(day)) out.set(day, []); const a = out.get(day); if (!a.some((x) => x.gw === row.gw && x.kind === row.kind)) a.push(row); };
  for (const [gw, rows] of by) {
    rows.sort((a, b) => ymd(a[2], a[3], a[4]) - ymd(b[2], b[3], b[4]));
    rows.forEach((f, i) => { if (ymd(f[2], f[3], f[4]) !== lo) add(iso(f[2], f[3], f[4]), { gw, name: f[0], kind: i ? 'change' : 'new' }); });
    const L = rows[rows.length - 1];
    if (ymd(L[5], L[6], L[7]) < hi) add(shift(iso(L[5], L[6], L[7]), 1), { gw, name: L[0], kind: 'end' });
  }
  for (const e of (review && review.edges) || []) { const rows = by.get(e.gw); if (rows) add(iso(...e.upstream), { gw: e.gw, name: rows[0][0], kind: 'upstream' }); }
  return [...out].map(([day, rows]) => ({ day, rows: rows.sort((a, b) => a.gw - b.gw) })).sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** the SPARQL for one batch of days: items signed (P585, day precision) on one of them, with a later
    day-precise effective date (P7588; or P580 where the item is a treaty) */
export function effectiveQuery(days) {
  const vals = days.map((s) => '"' + s + 'T00:00:00Z"^^xsd:dateTime').join(' ');
  return 'SELECT ?item ?itemLabel ?sig ?eff WHERE { VALUES ?sig { ' + vals + ' } '
    + '?item p:P585/psv:P585 [ wikibase:timeValue ?sig ; wikibase:timePrecision 11 ] . '
    + '{ ?item p:P7588/psv:P7588 [ wikibase:timeValue ?eff ; wikibase:timePrecision 11 ] } UNION '
    + '{ ?item wdt:P31/wdt:P279* wd:Q131569 . ?item p:P580/psv:P580 [ wikibase:timeValue ?eff ; wikibase:timePrecision 11 ] } '
    + 'FILTER(?eff > ?sig) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
}

/** the candidates from the query's rows: one per item, with the CShapes changes within NEAR days of its signing */
export function candidatesOf(bindings, days) {
  const at = new Map(days.map((x) => [x.day, x.rows]));
  const by = new Map();
  for (const b of bindings) {
    const wd = b.item.value.replace(/^.*\//, ''), signed = b.sig.value.slice(0, 10), effective = b.eff.value.slice(0, 10);
    const c = by.get(wd) || { wd, label: b.itemLabel ? b.itemLabel.value : wd, signed, effective, changes: [] };
    if (effective > c.effective) c.effective = effective;
    by.set(wd, c);
  }
  for (const c of by.values()) {
    for (let k = -NEAR; k <= NEAR; k++) { const day = shift(c.signed, k), rows = at.get(day); if (rows) c.changes.push({ day, rows }); }
    c.days = dayN(c.effective) - dayN(c.signed);
  }
  return [...by.values()].filter((c) => c.changes.length).sort((a, b) => (a.signed < b.signed ? -1 : a.signed > b.signed ? 1 : a.wd < b.wd ? -1 : 1));
}

/** the days a query must ask: every change day ± NEAR, deduplicated */
export function askedDays(days) {
  const s = new Set();
  for (const x of days) for (let k = -NEAR; k <= NEAR; k++) s.add(shift(x.day, k));
  return [...s].sort();
}

/** the offline gate: every candidate in the photograph is applied (review.edges[].wd) or examined (review.examined[].wds) */
export function effectiveProblems(photo, review) {
  const out = [];
  if (!photo || !Array.isArray(photo.candidates)) return ['scripts/cshapes/effective.json is missing or has no candidates — node scripts/build-cshapes.mjs --effective'];
  const judged = new Set();
  for (const e of review.edges || []) if (e.wd) judged.add(e.wd);
  for (const x of review.examined || []) for (const q of x.wds || []) judged.add(q);
  for (const c of photo.candidates) if (!judged.has(c.wd)) out.push(`«${c.label}» (${c.wd}) was signed ${c.signed} and took effect ${c.effective}, when CShapes changes ${c.changes.map((x) => x.rows.map((r) => r.name).join('/') + ' ' + x.day).join(', ')} — judge it in scripts/cshapes/review.json (edges with wd, or examined with wds)`);
  const inPhoto = new Set(photo.candidates.map((c) => c.wd));
  for (const x of review.examined || []) for (const q of x.wds || []) if (!inPhoto.has(q)) out.push(`examined ${x.id} names ${q}, which the photograph (scripts/cshapes/effective.json) no longer raises — re-judge or remove it`);
  return out;
}
