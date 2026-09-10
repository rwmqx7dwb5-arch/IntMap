/* ============================================================================
 *  IntMap · does this Wikidata item name that shape, in that century?        (#R686)
 * ----------------------------------------------------------------------------
 *  ⚠ THE SPELLING IS THE QUESTION, NOT THE ANSWER. #R515: `geocode()` asked for one result and
 *  used it, so "the port" was whichever port the ranker liked, and no amount of adding names to
 *  a list would have fixed the next one. The rule there was a MEASURE — agree, or be refused —
 *  and this file is that rule for polity names: a candidate has to agree with WHERE the map draws
 *  the shape and WHEN it draws it, and when nothing distinguishes the candidates the answer is
 *  no answer.
 *
 *  Everything here is pure — census row in, verdict out, no network, no clock, no globals — so
 *  tests/r686-histeras-names-checks.test.mjs EVALUATES it rather than reading it (#R505).
 * ==========================================================================*/
import { rowDistance } from './census.mjs';

/* ── the app's nine languages, in Wikidata's terms ───────────────────────────
   ⚠ THE BARE `zh` IS SIMPLIFIED. IntMap's `zh` is Traditional (js/lang-registry.js gives it the
   BCP-47 tag zh-Hant) and its `zh-hans` is Simplified, while Wikidata's own bare `zh` follows the
   other convention. The same crossing is already written down once for the city names
   (scripts/histcities/upstream.mjs), and this table says the same thing for the same reason: get
   it backwards and every Chinese reader is served the other script with no error anywhere. */
export const LANG_SOURCES = {
  en: ['en'],
  jp: ['ja'],
  de: ['de'],
  ru: ['ru'],
  es: ['es'],
  fr: ['fr'],
  ko: ['ko'],
  zh: ['zh-hant', 'zh-tw', 'zh-hk'],           /* Traditional */
  'zh-hans': ['zh-hans', 'zh-cn', 'zh-sg', 'zh'], /* Simplified — bare zh belongs HERE */
};

export const REJECT = {
  INTERNAL: 'not-a-place',          /* a disambiguation page, or a LANGUAGE named after the people */
  SPACE: 'elsewhere',               /* the item sits outside every shape the map draws for the name */
  TIME: 'other-era',                /* the item's lifespan misses every snapshot the name is on */
  BARE: 'string-only',              /* nothing but the spelling — that is #R515's mistake */
  TIE: 'no-clear-winner',           /* two candidates are equally good: refuse, do not pick */
};

/* ── how far is too far, and how long ago is too long ago ────────────────────
   ⚠ SPACE HAS NO TOLERANCE BAND, AND TIME'S IS READ FROM THE RECORD. Both of those are corrections
   to what this file did first, and both were made because the first version was measured:
     · Space started with a flat 20°, then with a slack derived from the row's own size. The
       derived one is worse where it matters: a row whose shape is a fifth of a continent gets a
       slack that reaches the next ocean, and «Montana» duly took Q22060885 — MONTANA, NEW JERSEY.
       So the question is not «how near» but «in it or not». If Wikidata states a coordinate, that
       coordinate has to fall inside a shape this map draws for the name.
     · Time cannot work that way, because the record's resolution is not constant: around 1492 the
       snapshots are 1400 · 1492 · 1500 · 1530, decades apart, and before the common era they are
       123000 BC · 10000 BC, a hundred and thirteen THOUSAND years apart. A flat 400 years was
       absurdly tight in the second place and absurdly loose in the first, and the loose end did
       damage: «Cheyenne» at 1492 took Q39042 — CHEYENNE, WYOMING, founded 1867, 375 years adrift —
       and Erie, Tonkawa and Ponca went the same way. Each of them is a modern American town named
       AFTER the people whose territory the map is drawing and standing INSIDE it, so no spatial
       test can separate them; only the clock can, and only if it is asked at the record's own
       resolution. `timeSlack` is that resolution: the gap to the neighbouring snapshots.
   ⚠ WHAT NEITHER OF THEM CATCHES, STATED RATHER THAN GLOSSED: a modern settlement named after the
   people, standing inside their range, with no inception date on Wikidata. Nothing in the record
   distinguishes it. Measured on the built table, the residue is small and mostly harmless in
   effect — a transliteration of the same name — but «Nazca» does come through as 「ナスカ市」, the
   CITY. That is the honest ceiling of a join made on a string. */

/** Years of slack for a row: the record's own resolution where that row is drawn. */
export function timeSlack(row, years) {
  const ys = years.slice().sort((a, b) => a - b);
  let before = null, after = null;
  for (const y of ys) { if (y < row.y0) before = y; if (y > row.y1 && after === null) after = y; }
  const gaps = [];
  if (before !== null) gaps.push(row.y0 - before);
  if (after !== null) gaps.push(after - row.y1);
  if (!gaps.length) gaps.push(Math.max(1, row.y1 - row.y0));
  return Math.max(...gaps);
}

/* ── what is still a fixed number, and why ───────────────────────────────────
   These are not measurements of the world; they are the shape of the verdict itself:
     · NEAR — half the time slack, the band where a candidate is beside the century rather than in
       it. Agreement inside counts two points, agreement in the band counts one.
     · FLOOR 4 — an exact English label is 2, and one real agreement (space or time) is 2. So the
       floor says: the spelling alone is never enough, which is the whole lesson of #R515.
     · MARGIN 1 — two candidates within one point of each other have not been told apart. */
export const NEAR = 0.5;
export const FLOOR = 4;
export const MARGIN = 1;

/* ⚠ A LABEL WITH A QUALIFIER IN BRACKETS IS WIKIDATA SAYING THE BARE NAME BELONGS TO SOMETHING
   ELSE, and a map label has no room to carry the disambiguation: «Montana (新澤西州)»,
   «Blackfoot (Montana)», «아이누 (동음이의)». Such a string is dropped — the row keeps whatever
   other languages wrote a plain name, and where none did the upstream English stands. The brackets
   are the CJK full-width pair as well as the ASCII one, because that is what the labels use. */
export function plainLabel(v) {
  return !/[([（【][^)\]）】]*[)\]）】]\s*$/.test(String(v || '').trim());
}

/** The year in a Wikidata time literal ("+1512-00-00T00:00:00Z", "-000600-01-01T00:00:00Z"). */
export function wdYear(t) {
  const m = /^([+-])0*(\d+)-/.exec(String(t || ''));
  if (!m) return null;
  const n = +m[2];
  return m[1] === '-' ? -n : n;
}

/** How far apart two closed year intervals are (0 when they touch or overlap). */
export function yearGap(a0, a1, b0, b1) {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
}

/**
 * Score one candidate against one census row.
 * @param row     census row {name, y0, y1, boxes}
 * @param cand    {qid, exact, coord, starts, ends, p31, geo}
 * @param internal Set of Wikimedia-internal class QIDs
 * @returns {{points:number|null, why:string|null, space:number|null, time:number|null}}
 */
export function score(row, cand, internal, years) {
  for (const c of cand.p31 || []) if (internal.has(c)) return { points: null, why: REJECT.INTERNAL, space: null, time: null, corroborated: false };

  let points = cand.exact ? 2 : 0;
  let space = null, time = null, corroborated = false;

  /* ⚠ IF WIKIDATA SAYS WHERE IT IS, IT HAS TO BE WHERE THE MAP DRAWS IT — no tolerance band at
     all. The band was tried and it is what let «Montana» take Q22060885, MONTANA, NEW JERSEY:
     the row's own shape is a fifth of a continent, so a slack derived from its size reached
     across to the Atlantic coast. Being INSIDE the drawn shape is a statement; being some
     fraction of a continent away from it is not. A candidate that carries no coordinate is a
     different case and is judged on the clock and on being unambiguous. */
  if (cand.coord) {
    space = rowDistance(row, cand.coord[0], cand.coord[1]);
    if (space > 0) return { points: null, why: REJECT.SPACE, space, time: null, corroborated: false };
    points += 2; corroborated = true;
  }

  const st = (cand.starts || []).map(wdYear).filter((v) => v != null);
  const en = (cand.ends || []).map(wdYear).filter((v) => v != null);
  if (st.length || en.length) {
    const slack = timeSlack(row, years || [row.y0, row.y1]);
    const s = st.length ? Math.min(...st) : -Infinity;
    const e = en.length ? Math.max(...en) : Infinity;
    time = yearGap(s, e, row.y0, row.y1);
    if (time > slack) return { points: null, why: REJECT.TIME, space, time, corroborated: false };
    if (time === 0) { points += 2; corroborated = true; }
    else if (time <= slack * NEAR) { points += 1; corroborated = true; }
  }

  /* ⚠ (#R695) «IS THIS THE KIND OF THING THE MAP DRAWS» — `subject`. #R686 asked it as `geo`,
     which is really «does Wikidata say where this is», and for a PEOPLE Wikidata says no such
     thing, so the deep snapshots' commonest subject scored nothing at all. `subject` is `geo` OR
     membership of a kind this map draws, discovered from named roots by `wdt:P279*`
     (scripts/histeras/harvest.mjs `ACCEPT_ROOTS`). It buys the SAME one point `geo` bought — the
     agreement tests above are untouched — and a candidate with no `subject` field falls back to
     `geo` so nothing that reads this file without one changes behaviour. */
  if (isSubject(cand)) points += 1;
  return { points, why: null, space, time, corroborated };
}

/** Whether the candidate is a kind of thing this map draws. Falls back to #R686's `geo`. */
export function isSubject(cand) {
  return (cand && cand.subject !== undefined) ? !!cand.subject : !!(cand && cand.geo);
}

/**
 * Choose at most one item for a census row.
 *
 * ⚠ WHAT KILLED #R515 WAS PLURALITY, NOT ABSENCE OF PROOF. `geocode()` asked for one hit where
 * several places answered to the name, and the ranker's order decided which port the map showed.
 * The measurable form of that danger is here: how many items carry this English string at all.
 *   · Several candidates → one of them has to WIN on agreement with the map's geometry and clock,
 *     by a margin. No margin, no answer.
 *   · Exactly one candidate, and it is a kind of thing this map draws (#R695 `isSubject`: a
 *     geographic or political entity, OR a people, a historical region, an archaeological
 *     culture) → the string is not ambiguous on Wikidata, and there is nothing for a ranker to
 *     get wrong. Taken.
 *   · Exactly one candidate with no geographic or political identity at all → refused; a name is
 *     shared with films, ships and people, and «the only item called X» is not «a polity».
 * @returns {{qid:string, points:number}|{qid:null, why:string}}
 */
export function decide(row, cands, internal, years) {
  const kept = [];
  let why = null;
  for (const c of cands) {
    const v = score(row, c, internal, years);
    if (v.why) { why = why || v.why; continue; }
    kept.push({ qid: c.qid, points: v.points, corroborated: v.corroborated, geo: isSubject(c), exact: !!c.exact });
  }
  if (!kept.length) return { qid: null, why: why || REJECT.BARE };
  kept.sort((a, b) => b.points - a.points || (a.qid < b.qid ? -1 : 1));
  if (kept.length === 1) {
    const only = kept[0];
    if (only.corroborated && only.points >= FLOOR) return { qid: only.qid, points: only.points };
    if (only.geo && only.exact) return { qid: only.qid, points: only.points };
    return { qid: null, why: REJECT.BARE };
  }
  /* ⚠ A WINNER BY NO MARGIN IS NOT A WINNER. Sorting always yields a first row, and taking it
     because it sorted first is the same act as taking a ranker's first hit. */
  if (kept[0].points - kept[1].points < MARGIN) return { qid: null, why: REJECT.TIE };
  if (!kept[0].corroborated || kept[0].points < FLOOR) return { qid: null, why: REJECT.BARE };
  return kept[0];
}

/** app-language code → the label to ship, or undefined when no source wrote one. */
export function labelsFor(entity) {
  const out = {};
  for (const [code, srcs] of Object.entries(LANG_SOURCES)) {
    for (const s of srcs) { const v = entity.labels && entity.labels[s]; if (v) { out[code] = v; break; } }
  }
  return out;
}
