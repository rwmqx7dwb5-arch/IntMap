/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — REACH: can the question's own words find the capability it needs?   (ops-next)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-03: .github/workflows/atlas-eval.yml has run nine times and measured nothing — every
 *  run stops at its first step for want of two repository secrets (a session for the evaluation account,
 *  and a token to rotate it). The live half of the evaluation needs those: it asks the production Atlas,
 *  which answers only a signed-in reader. But two halves of what decides whether Atlas CAN answer are
 *  IntMap's own deterministic code and need no session at all:
 *
 *    · the REPLAY (replay.mjs / lab.mjs evaluateCassettes) — every recorded turn through the current loop,
 *      surface, schemas and registry; it already runs on every pull request;
 *    · the REACH (this file) — for every question of the verified answer key (answer-key.json) that names
 *      the capabilities a correct answer uses (`capabilities`), where each of them ranks when the
 *      registry's search is given the QUESTION'S OWN WORDS — the search find_capability runs
 *      (js/atlas-capabilities.js `search`, with the options js/atlas-toolsurface.js `find` passes).
 *      #R802 measured three production questions that ended with zero operations because the words a
 *      reader used reached nothing; this is that measurement, taken every night over the whole key.
 *
 *  ⚠ WHAT THIS IS NOT. It is not a measure of Atlas's answers: the model writes its own find_capability
 *  query, and the meaning half of the search (atlas-embed, a network call) is not consulted here, so a
 *  capability the words miss may still be found by meaning. The report says «by the words of the
 *  question, lexical search only» in every place it is shown, and a miss is reported as a miss of THAT
 *  search — never as «Atlas cannot answer». No rank threshold is invented: a capability is either in the
 *  ranking the model would be shown (with its rank) or not in it.
 * ==========================================================================*/

/** the options js/atlas-toolsurface.js `find` passes to the search. The surface keeps them inside a closure, so
    they are written here once and tests/ops-next-checks.test.mjs holds the two spellings equal. */
export const FIND_OPTS = Object.freeze({ want: 3, min: 1 });

/**
 * reachOf(questions, CAPS) → { measured, allFound, someMissed, byQuestion: [{ id, lang, expected: [{ id, rank|null }], ranked }] }
 * Pure over the registry handed in (makeAtlasCapabilities bound like the browser binds it).
 */
export function reachOf(questions, CAPS) {
  const byQuestion = [];
  for (const q of questions || []) {
    const want = Array.isArray(q.capabilities) ? q.capabilities.filter((c) => typeof c === 'string' && c) : [];
    if (!want.length || !q.text) continue;
    let ranked = [];
    try { const r = CAPS.search(String(q.text), FIND_OPTS); ranked = (r && r.ranked) || []; } catch (_) { ranked = []; }
    const rankOf = new Map(ranked.map((x) => [x.id, x.rank]));
    byQuestion.push({ id: q.id, lang: q.lang || null, ranked: ranked.length,
      expected: want.map((id) => ({ id, rank: rankOf.has(id) ? rankOf.get(id) : null })) });
  }
  const allFound = byQuestion.filter((b) => b.expected.every((e) => e.rank != null)).length;
  const missedCaps = {};
  for (const b of byQuestion) for (const e of b.expected) if (e.rank == null) missedCaps[e.id] = (missedCaps[e.id] || 0) + 1;
  return { basis: 'lexical search, the question\'s own words', measured: byQuestion.length, allFound,
    someMissed: byQuestion.length - allFound, missedCaps, byQuestion };
}

/** the registry as the browser binds it (the catalogue the lexical search reads), from productModules(...) */
export function boundRegistry(P) {
  const CAPS = P.makeAtlasCapabilities({});
  CAPS.bindRuntime({ docs: P.makeAtlasCatalogText({}, {}), schemas: P.makeAtlasSchemas() });
  return CAPS;
}

/** the reach as a markdown table for the run page */
export function renderReach(R) {
  const L = ['## Reach — can the question\'s own words find the capability it needs?', '',
    '*Lexical search only (the meaning search is a network call and is not consulted); the model writes its own queries, so this is not a measure of the answers.*', '',
    `${R.allFound} of ${R.measured} answer-key questions reach every capability a correct answer uses.`, '',
    '| question | lang | capability | rank of ' + 'the ranking |', '|---|---|---|---|'];
  for (const b of R.byQuestion) for (const e of b.expected) L.push(`| \`${b.id}\` | ${b.lang || ''} | \`${e.id}\` | ${e.rank == null ? '**not reached**' : e.rank + ' of ' + b.ranked} |`);
  return L.join('\n');
}
