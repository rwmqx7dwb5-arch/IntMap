/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — DID THE REQUESTED THING EXIST WHEN THE TURN ENDED?  (the deliverable axis)
 * ----------------------------------------------------------------------------
 *  「完了しました」 is a sentence the model writes. This counts the thing the request asked for — a layer
 *  that is on, shapes that are drawn, a table with rows, a file — read off the RECORD the harness keeps
 *  (scripts/atlas-eval.mjs: operations, calls, snapshot), never off the reply's words. #1377 measured
 *  that a turn can end with `completion:"complete"` and nothing drawn; this makes that measurable every
 *  time the evaluation runs, and keeps the measurements as a series (scripts/atlas-completion-rate.mjs).
 *
 *  A question (questions.json / answer-key.json) may carry `deliverables`, each ONE thing the request
 *  names. Two kinds; fields are graded only when written:
 *
 *    { kind:'map',    mapState:{…}, why }                  the same criteria as a question's `mapState`
 *                                                          (scripts/atlas-eval/map-state.mjs gradeMap)
 *    { kind:'result', capability, path?, min?, why }       a call of that capability that succeeded, and
 *                                                          — when `path` is given — a value at it of at
 *                                                          least `min` (default 1; a list counts by length)
 *
 *  ⚠ THREE ANSWERS, NEVER TWO (.agents/rules/one-pass-or-a-reason.md §5). `present` / `absent` /
 *    `unobserved`. A record that did not carry the section (no tap, no snapshot) is `unobserved` and is
 *    counted apart — never as absent, never as present. The rate is over the OBSERVED deliverables.
 *  ⚠ THE CLAIM IS READ FROM THE RECORD, NOT FROM THE REPLY'S WORDS. `obs.completion` is what the turn's
 *    own trace said (`complete` / `partial` / …). Without it the claim is `unknown`: the turn is still
 *    counted for existence, and no false completion is reported for it.
 *  ⚠ NOTHING HERE LIMITS ATLAS. It reads a finished record; it cannot refuse, retry or cap anything.
 * ==========================================================================*/
import { gradeMap, sectionsRead } from './map-state.mjs';
import { at } from './judge.mjs';

const str = (v) => (v == null ? '' : String(v));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function resultOf(c) {
  if (c && isObj(c.result)) return c.result;
  try { const o = JSON.parse(str(c && c.resultText)); return isObj(o) ? o : null; } catch (_) { return null; }
}
const sizeOf = (v) => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : v == null || v === false ? 0 : isObj(v) ? Object.keys(v).length : str(v) ? 1 : 0);

/** one deliverable against one observed record → { verdict:'present'|'absent'|'unobserved', detail } */
export function observeDeliverable(d, obs, ctx = {}) {
  if (!d || typeof d !== 'object') return { verdict: 'unobserved', detail: 'malformed deliverable' };
  if (d.kind === 'map') {
    const snap = obs && obs.snapshot;
    if (!isObj(snap)) return { verdict: 'unobserved', detail: 'no snapshot in the record' };
    const g = gradeMap(d.mapState || {}, snap, ctx);
    const v = g && g.verdict;
    return v === 'match' ? { verdict: 'present', detail: 'map matches' }
      : v === 'mismatch' ? { verdict: 'absent', detail: str(g.detail || g.reasons || 'map differs') }
        : { verdict: 'unobserved', detail: str(g && (g.detail || g.reasons)) || 'map not observed' };
  }
  if (d.kind === 'result') {
    const calls = obs && Array.isArray(obs.calls) ? obs.calls : null;
    const ops = obs && Array.isArray(obs.operations) ? obs.operations : null;
    if (!calls && !ops) return { verdict: 'unobserved', detail: 'no calls or operations in the record' };
    const cap = str(d.capability);
    const okOps = (ops || []).filter((o) => str(o.capabilityId) === cap && str(o.status) !== 'failed');
    if (!d.path) {
      if (okOps.length) return { verdict: 'present', detail: cap + ' ran' };
      return ops ? { verdict: 'absent', detail: cap + ' never ran successfully' } : { verdict: 'unobserved', detail: 'operations not recorded' };
    }
    if (!calls) return { verdict: 'unobserved', detail: 'call results not recorded' };
    const min = Number.isFinite(+d.min) ? +d.min : 1;
    const mine = calls.filter((c) => str(c && c.name) === cap || str(c && c.args && c.args.capability) === cap || str(c && c.args && c.args.id) === cap);
    const sizes = mine.map((c) => { const r = resultOf(c); return r ? sizeOf(at(r, d.path)) : null; }).filter((n) => n !== null);
    if (!sizes.length) return { verdict: mine.length ? 'unobserved' : 'absent', detail: mine.length ? 'result of ' + cap + ' not readable' : cap + ' was not called' };
    const top = Math.max(...sizes);
    return top >= min ? { verdict: 'present', detail: cap + '.' + d.path + ' = ' + top } : { verdict: 'absent', detail: cap + '.' + d.path + ' = ' + top + ' < ' + min };
  }
  return { verdict: 'unobserved', detail: 'unknown deliverable kind ' + str(d.kind) };
}

/** one turn → what was asked for, what existed, and what the turn claimed; null when it asked for nothing countable */
export function deliverablesOfTurn(q, obs, ctx = {}) {
  /* a question that states the map it asks for (`mapState`) has that map as a deliverable — one statement, not a copy */
  const list = Array.isArray(q && q.deliverables) ? q.deliverables : (q && q.mapState ? [{ kind: 'map', mapState: q.mapState, why: 'the map the question asks for' }] : []);
  if (!list.length || !obs || obs.measured === false) return null;
  const rows = list.map((d) => ({ kind: d.kind, why: str(d.why), ...observeDeliverable(d, obs, ctx) }));
  const present = rows.filter((r) => r.verdict === 'present').length;
  const absent = rows.filter((r) => r.verdict === 'absent').length;
  const unobserved = rows.length - present - absent;
  const claim = str(obs.completion) || 'unknown';
  return {
    id: q.id, rows, present, absent, unobserved,
    /* every deliverable present → true; any absent → false; otherwise (some unobserved, none absent) → null */
    finished: absent ? false : unobserved ? null : true,
    claim,
    falseCompletion: claim === 'complete' && absent > 0,
    honestIncomplete: claim !== 'complete' && claim !== 'unknown' && absent > 0,
  };
}

/** many turns → the rates, over the turns whose outcome is known; unobserved is counted apart */
export function completionRateOf(turns) {
  const t = turns.filter(Boolean);
  const known = t.filter((x) => x.finished !== null);
  const seen = t.reduce((s, x) => s + x.present + x.absent, 0);
  const present = t.reduce((s, x) => s + x.present, 0);
  return {
    turns: t.length, observedTurns: known.length, unobservedTurns: t.length - known.length,
    finishedTurns: known.filter((x) => x.finished).length,
    turnRate: known.length ? known.filter((x) => x.finished).length / known.length : null,
    deliverables: seen, deliverablesPresent: present,
    deliverableRate: seen ? present / seen : null,
    falseCompletion: t.filter((x) => x.falseCompletion).map((x) => x.id),
    honestIncomplete: t.filter((x) => x.honestIncomplete).map((x) => x.id),
  };
}

/** the snapshot sections the deliverables' map criteria read — so a harness captures them (scripts/atlas-eval/map-state.mjs sectionsRead) */
export function deliverableSectionsOf(questions) {
  const pseudo = [];
  for (const q of questions || []) for (const d of (q && q.deliverables) || []) if (d && d.kind === 'map') pseudo.push({ mapState: d.mapState });
  return sectionsRead(pseudo);
}
