/* ============================================================================
 *  histadmin/class-dates.mjs — a span for a unit upstream never dated  (#R721)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ WHAT THIS REPLACES WAS A FOSSIL CLOCK FLOOR, AND IT WAS ON THE MAP.
 *  build-hist-admin1.mjs used to give a relation with no `start_date` the start the PREVIOUS
 *  build had published for it (`preserved-display-bound`). That number came from a `--since` of
 *  -199 that the clock has not used since #R679 widened the floor, and nothing about it was ever
 *  a statement about the unit. Measured on the shipped bundles 2026-09-15: 68 rows carried it,
 *  and the reader saw
 *
 *      48 of the ritsuryō provinces and the circuits of the 五畿七道 drawn in 200 BC,
 *      壱岐国 · 安房国 · 東海道 · 山陰道 · 西海道 still drawn in 1900 and in the present day
 *      (廃藩置県 abolished the system on 1871-08-29),
 *      the Shanghai International Settlement (1863) and French Concession (1849) in 200 BC,
 *      and the Landkreis Dahme-Spreewald (1993) in every year the clock reaches.
 *
 *  Every gate was green over all of it, because a span that is well formed is not a span anyone
 *  stated. .agents/rules/historical-verification.md is the rule this file implements.
 *
 *  ── THE RULE ──────────────────────────────────────────────────────────────────────────────
 *  A unit that states no date is dated by THE SYSTEM IT BELONGS TO, and the system is not a list
 *  written here — it is discovered, from two things both upstreams already publish:
 *
 *      the unit's own CLASS      — Wikidata P31 through the relation's `wikidata` tag
 *      the day the system ENDED  — the end date the class's members in this record agree on
 *
 *  A group is (class × stated end): units of one kind that stopped on one day are one system.
 *  49 of the 50 units of «province of Japan» in the bundle state 1871-08-29, and six of those
 *  state the start 0701 — the 大宝律令. So 壱岐国, which states neither, is drawn 0701–1871-08-29,
 *  and so is every other province of the system. Nothing about Japan is written in this file;
 *  the same code dates any system either upstream describes, and stops dating one the day
 *  upstream stops agreeing.
 *
 *  ── AND THREE GUARDS, EACH OF WHICH CAUGHT A REAL ERROR WHEN IT WAS MEASURED ───────────────
 *   1. ONLY A UNIT WITH NEITHER BOUND may take a derived end. An absent end in OSM/OHM means
 *      «still in force», which IS a statement; a unit that states a start and no end is current
 *      and must be left alone. Without this, «Distrito Federal» (Brasília, 1960) took the end
 *      1871-08-29 from 畿内 — the only other member of «capital district or territory» in the
 *      bundle that states one.
 *   2. CONSENSUS, NOT A MAJORITY OF ONE: a derived end needs at least two members stating it and
 *      two thirds of the group's stated ends. 畿内 alone is not the class's testimony.
 *   3. THE RESULT MUST BE AN INTERVAL. A derived start at or after the end is refused outright,
 *      which is the second reason the Bogotá and Brasília rows survive untouched.
 *
 *  A unit no group can date keeps no manufactured span: the caller does not ship it into the
 *  timeline. That is the honest end of the road — CONSTITUTION「偽物・ハリボテ禁止」— and it is
 *  what happens to the eighteen rows that carry no `wikidata` tag at all.
 * ========================================================================== */

const WDQS = 'https://query.wikidata.org/sparql';
const UA = 'IntMap/1.0 (historical administrative spans; github.com/rwmqx7dwb5-arch/IntMap)';

async function sparql(query) {
  const r = await fetch(WDQS + '?format=json&query=' + encodeURIComponent(query), {
    headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
  });
  if (!r.ok) throw new Error('WDQS ' + r.status);
  return (await r.json()).results.bindings;
}
const qOf = (v) => v.value.split('/').pop();

/** P31 of the items named, as Map(qid -> [classQid]). Chunked: VALUES lists are cheap, one
 *  enormous one is a 504. */
export async function classesOf(qids, chunk = 400) {
  const out = new Map();
  const list = [...new Set(qids)].filter((q) => /^Q\d+$/.test(q));
  for (let i = 0; i < list.length; i += chunk) {
    const vals = list.slice(i, i + chunk).map((q) => 'wd:' + q).join(' ');
    for (const b of await sparql(`SELECT ?item ?cls WHERE { VALUES ?item { ${vals} } ?item wdt:P31 ?cls . }`)) {
      const q = qOf(b.item);
      if (!out.has(q)) out.set(q, []);
      out.get(q).push(qOf(b.cls));
    }
  }
  return out;
}

/** Every item Wikidata puts in this class. The group is «what the class holds», not «what this
 *  bundle happens to ship», so a member the bundle gained since the last build is already in it. */
export async function membersOf(classQid) {
  return new Set((await sparql(`SELECT ?item WHERE { ?item wdt:P31 wd:${classQid} . }`)).map((b) => qOf(b.item)));
}

/* ── the pure half, so the rule can be tested without a network ───────────────────────────── */

/**
 * @param units [{ id, name, qid, start, end }]  start/end are upstream's RAW strings or null
 * @param classOfQid Map(qid -> [classQid])
 * @returns Map(id -> { start, end, from })  only for units that gained a bound
 */
/** An upstream date string as one comparable number. Year, month and day are packed rather than
 *  parsed into a Date, because the years upstream states reach back past what Date can hold and
 *  `Date.UTC(701, …)` would answer with 2601 (the two-digit-year rule — see [[intmap-r602-lessons]]). */
function key(raw) {
  const m = /^(-?\d{1,6})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(raw).trim());
  if (!m) return NaN;
  const y = parseInt(m[1], 10);
  return y * 10000 + (m[2] ? parseInt(m[2], 10) : 1) * 100 + (m[3] ? parseInt(m[3], 10) : 1);
}

export function resolve(units, classOfQid) {
  const cls = (u) => (u.qid && classOfQid.get(u.qid)) || [];

  /* votes for a class's end date, and the starts stated inside each (class × end) group */
  const endVotes = new Map();          /* classQid -> Map(endRaw -> n) */
  const groupStarts = new Map();       /* classQid + '@' + endRaw -> [startRaw] */
  for (const u of units) {
    for (const c of cls(u)) {
      if (u.end) {
        if (!endVotes.has(c)) endVotes.set(c, new Map());
        const m = endVotes.get(c);
        m.set(u.end, (m.get(u.end) || 0) + 1);
      }
      if (u.start) {
        const k = c + '@' + (u.end || '');
        if (!groupStarts.has(k)) groupStarts.set(k, []);
        groupStarts.get(k).push(u.start);
      }
    }
  }
  /* guard 2 — a class's end is what its members agree on, and one voice is not agreement */
  const classEnd = new Map();
  for (const [c, m] of endVotes) {
    let best = null, total = 0;
    for (const [e, n] of m) { total += n; if (!best || n > best.n) best = { e, n }; }
    if (best && best.n >= 2 && best.n * 3 >= total * 2) classEnd.set(c, best);
  }

  const out = new Map();
  for (const u of units) {
    if (u.start) continue;                       /* upstream stated it — nothing to derive */
    let end = u.end, from = [];
    /* guard 1 — only a unit with NEITHER bound may take an end from its class */
    if (!end && !u.start) {
      const cand = cls(u).map((c) => classEnd.get(c)).filter(Boolean).sort((a, b) => b.n - a.n)[0];
      if (cand) { end = cand.e; from.push(`end from the class its ${cand.n} siblings state`); }
    }
    if (!end) continue;                          /* nothing anchors it — the caller drops the row */
    /* The system first: units of this class that stopped on the same day. A unit whose end is its
       own — the last of its kind, or one upstream dates a day apart from its siblings — has a group
       of one, so fall back to the earliest start the CLASS states anywhere. That is still a
       statement about this kind of unit, and guard 3 below refuses it when it does not fit. */
    let cand = cls(u).flatMap((c) => groupStarts.get(c + '@' + end) || []).sort((a, b) => key(a) - key(b));
    let how = `the earliest of ${cand.length} stated by units of the same class ending ${end}`;
    if (!cand.length) {
      cand = cls(u).flatMap((c) => [...groupStarts].filter(([k]) => k.startsWith(c + '@')).flatMap(([, v]) => v)).sort((a, b) => key(a) - key(b));
      how = `the earliest of ${cand.length} stated anywhere by units of the same class`;
    }
    if (!cand.length) continue;
    const start = cand[0];
    /* guard 3 — the result has to be an interval.
       ⚠ NOT A STRING COMPARISON. Upstream writes BCE years with a leading '-', and '-0400' sorts
       BEFORE '-0500' lexicographically, which would call an interval backwards exactly where the
       deep-time records live. The candidates are sorted and compared on a signed numeric key. */
    if (!(key(start) < key(end))) continue;
    from.push('start from ' + how);
    out.set(u.id, { start, end, from: from.join('; ') });
  }
  return out;
}
