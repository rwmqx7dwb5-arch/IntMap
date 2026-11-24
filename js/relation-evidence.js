/* ============================================================================
 *  IntMap · js/relation-evidence.js — A RELATION IS CONFIRMED, INFERRED, OR UNCONFIRMED, AND SAYS WHAT BACKS IT
 * ----------------------------------------------------------------------------
 *  The world graph (supabase world_graph_*, js/atlas-geo-object.js `links`) holds ties between real-world
 *  objects — «operated_by», «located_in», «part_of». Three different things can stand behind a tie an
 *  answer might state, and an answer that blurs them is how a relation nobody ever recorded gets
 *  «completed» by a model that knows how such things usually go:
 *
 *    confirmed    a SOURCE STATED this tie, and the record names the source (a feed, an identifier
 *                 join, an evidence record). `evidence` carries it: who said it, how sure they were, for
 *                 what period.
 *    inferred     NOBODY STATED IT. IntMap (or a model) derived it by a RULE from facts that are stated —
 *                 two objects within 40 km, a shared article, the same country code. The rule and its
 *                 inputs are the evidence, and the word «inferred» travels with it. An inference is
 *                 useful and is never reported as a fact about the world.
 *    unconfirmed  asked about, and THE GRAPH HAS NO RECORD — or only a look-alike, a disagreement, or a
 *                 tie that names no source. ⚠ «no record» is not «no relation»: the graph is what its feeds
 *                 hold, never the world (worldCompleteness is unproven, always). It is reported as that,
 *                 and the answer is «not recorded», never a guess in either direction.
 *
 *  ⚠ NOTHING IS PROMOTED. A tie moves from inferred to confirmed only by a source stating it (a new
 *  record), never because it is plausible, frequent, or asked about twice. A tie with `basis:'inferred'`
 *  and no `rule` is not even inferred — a derivation that cannot say how it was made is unconfirmed.
 *
 *  Pure, no DOM, no network: imported by js/atlas-geo-object.js (the link record keeps `basis`/`rule`),
 *  js/atlas-world-objects.js (every related object carries its state) and the tests.
 * ==========================================================================*/

export const STATES = Object.freeze(['confirmed', 'inferred', 'unconfirmed']);

/* ties whose NAME says «not an assertion that the two are related as described»: a look-alike held apart
   (candidate_match) and a disagreement between identifiers (conflicting_identity) are records of doubt */
const DOUBT_RELS = Object.freeze(['candidate_match', 'conflicting_identity']);

/**
 * The state of ONE tie (a link record: {rel, ref, source?, evidenceIds?, confidence?, basis?, rule?, inputs?}).
 *   → { state, basis, evidence: {source, evidenceIds, confidence, fromMs, toMs}|null, rule, why }
 */
export function linkState(link) {
  const l = (link && typeof link === 'object') ? link : {};
  const doubt = DOUBT_RELS.indexOf(l.rel) >= 0;
  const source = typeof l.source === 'string' ? l.source.trim() : '';
  const evidenceIds = Array.isArray(l.evidenceIds) ? l.evidenceIds.filter(Boolean) : [];
  const evidence = (source || evidenceIds.length)
    ? { source: source || null, evidenceIds, confidence: l.confidence || null, fromMs: l.fromMs == null ? null : l.fromMs, toMs: l.toMs == null ? null : l.toMs }
    : null;
  if (doubt) return { state: 'unconfirmed', basis: 'doubt', evidence, rule: null, why: l.rel === 'candidate_match' ? 'a look-alike held apart, not an asserted tie' : 'identifiers disagree; not resolved' };
  if (l.basis === 'inferred') {
    const rule = typeof l.rule === 'string' ? l.rule.trim() : '';
    if (!rule) return { state: 'unconfirmed', basis: 'inferred', evidence, rule: null, why: 'marked inferred but states no rule — a derivation that cannot say how it was made' };
    return { state: 'inferred', basis: 'inferred', evidence, rule, why: 'derived by a rule from stated facts; no source states this tie' };
  }
  if (evidence) return { state: 'confirmed', basis: 'stated', evidence, rule: null, why: 'a source states this tie' };
  return { state: 'unconfirmed', basis: 'stated', evidence: null, rule: null, why: 'the record names no source and no evidence' };
}

/**
 * The state of a RELATED object, as js/atlas-world-objects.js related() reaches it. `edges` are the typed ties between the two
 * ([{rel, link}]); `why` is the list of grounds ('linked' | 'near' | 'concurrent'); `shared` says whether the link came from a shared
 * article / evidence id rather than a typed tie. The strongest ground wins, and the grounds are all named.
 *   → { state, grounds:[{kind, state, rule|evidence}] }
 */
export function relatedState(edges, why, extra) {
  const x = extra || {};
  const grounds = [];
  (edges || []).forEach((e) => { const s = linkState(Object.assign({ rel: e.rel }, e.link, { rel: e.rel })); grounds.push({ kind: 'tie', rel: e.rel, state: s.state, evidence: s.evidence, rule: s.rule, why: s.why }); });
  if ((why || []).indexOf('linked') >= 0 && !(edges || []).length && x.sharedRecord) grounds.push({ kind: 'shared-record', state: 'inferred', rule: 'both are named by the same article or evidence record — a co-mention, not a stated tie' });
  if ((why || []).indexOf('near') >= 0) grounds.push({ kind: 'near', state: 'inferred', rule: 'within ' + (x.km != null ? x.km + ' km' : 'the search radius') + ' of each other (great-circle distance)' });
  if ((why || []).indexOf('concurrent') >= 0) grounds.push({ kind: 'concurrent', state: 'inferred', rule: 'within ' + (x.hours != null ? x.hours + ' h' : 'the search window') + ' of each other in time' });
  const rank = { confirmed: 3, inferred: 2, unconfirmed: 1 };
  const best = grounds.reduce((b, g) => (rank[g.state] > rank[b] ? g.state : b), 'unconfirmed');
  return { state: best, grounds };
}

/**
 * Ask the graph: is THIS tie recorded? `claims` is a list of {rel, ref} an answer is about to state about `subject`
 * (a link list: the subject's own links and the links other objects hold to it, `reverse` read through `inverse`).
 * Each claim comes back with the state of the best record, or `unconfirmed` + `recorded:false`. Nothing is added.
 */
export function checkClaims(subjectRef, ownLinks, incoming, claims, inverse, canon) {
  const c = canon || ((r) => String(r));
  const inv = inverse || ((r) => '~' + r);
  const mine = (ownLinks || []).map((l) => ({ rel: l.rel, ref: c(l.ref), link: l }));
  const theirs = (incoming || []).map((x) => ({ rel: inv(x.link.rel), ref: c(x.from), link: x.link }));
  const rank = { confirmed: 3, inferred: 2, unconfirmed: 1 };
  return (claims || []).map((q) => {
    const rel = String(q && q.rel || ''), ref = c(q && q.ref || '');
    const hits = mine.concat(theirs).filter((e) => e.rel === rel && e.ref === ref);
    if (!hits.length) return { rel, ref: q && q.ref, recorded: false, state: 'unconfirmed', why: 'the graph holds no such record — that is not evidence the tie does not exist' };
    const states = hits.map((h) => Object.assign({ link: h.link }, linkState(h.link))).sort((a, b) => rank[b.state] - rank[a.state]);
    const top = states[0];
    return { rel, ref: q.ref, recorded: true, state: top.state, basis: top.basis, evidence: top.evidence, rule: top.rule, why: top.why, records: hits.length };
  });
}

/** the short label of a state — what a row says beside the name */
export function stateLabel(state, L) {
  if (state === 'confirmed') return L('confirmed', '確認済み');
  if (state === 'inferred') return L('inferred', '推論');
  return L('unconfirmed', '未確認');
}
