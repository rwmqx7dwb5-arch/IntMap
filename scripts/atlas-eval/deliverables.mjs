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
 *    { kind:'result', capability, path?, min?, why }       a call of that capability observed completed, and
 *                                                          — when `path` is given — a value at it of at
 *                                                          least `min` (default 1; a list counts by length)
 *
 *  ⚠ NEVER TWO ANSWERS (.agents/rules/one-pass-or-a-reason.md §5). `present` / `absent` / `pending` /
 *    `cancelled` / `unobserved`. A record that did not carry the section (no tap, no snapshot), or a call
 *    whose effect its own observer could not see (status `unobserved`), is `unobserved` and is counted
 *    apart — never as absent, never as present. `present` is ONLY a postcondition that was observed
 *    (status `completed`, js/atlas-results.js). A call still going or waiting for the reader (`running` /
 *    `needs_input`) is `pending`; one the caller aborted is `cancelled`; `failed` / `partial` /
 *    `superseded` are `absent`. Pending, cancelled and absent are all OBSERVED not to exist when the turn
 *    ended, so the rate is over present + those three; they stay three words because they have three causes.
 *  ⚠ THE CLAIM IS READ FROM THE RECORD, NOT FROM THE REPLY'S WORDS (claimOf). `obs.completion` is what the
 *    turn's own trace said (`complete` / `partial` / `none`, js/atlas-agent.js). When the record carries no
 *    `completion` but does carry what that word is computed from — a non-empty `unmet`, or the stop
 *    `output_unmet` — the claim is derived by the agent's own rule and the row says so (`claimBasis`).
 *    With neither the claim is `unknown`: the turn is still counted for existence, and no false
 *    completion is reported for it (not observed is not 「declared nothing」).
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

/* an operation / result status (js/atlas-results.js STATUSES) → the deliverable's verdict. Only `completed` is
   an observed postcondition; a status the record does not carry is not read as one. */
const VERDICT_OF_STATUS = { completed: 'present', running: 'pending', needs_input: 'pending', cancelled: 'cancelled', unobserved: 'unobserved', failed: 'absent', partial: 'absent', superseded: 'absent' };
/* several calls of one capability: the verdict closest to existing. Present wins; a call still owed (pending) may
   yet produce it; one whose effect was not seen (unobserved) may hold it; an aborted one is the caller's; absent last. */
const VERDICT_RANK = ['present', 'pending', 'unobserved', 'cancelled', 'absent'];
const verdictOfStatus = (s) => VERDICT_OF_STATUS[str(s)] || 'unobserved';
const bestOf = (statuses) => { const vs = statuses.map(verdictOfStatus); return VERDICT_RANK.find((v) => vs.indexOf(v) >= 0) || 'unobserved'; };
/** the status a call's result names (`status`, else `ok`); '' when it names neither */
function callStatus(c) {
  const r = resultOf(c);
  if (!r) return '';
  return str(r.status) || (r.ok === false ? 'failed' : r.ok === true ? 'completed' : '');
}

/** one deliverable against one observed record → { verdict:'present'|'absent'|'pending'|'cancelled'|'unobserved', detail } */
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
    if (!d.path) {
      if (!ops) return { verdict: 'unobserved', detail: 'operations not recorded' };
      const statuses = ops.filter((o) => str(o.capabilityId) === cap).map((o) => str(o.status));
      if (!statuses.length) return { verdict: 'absent', detail: cap + ' was not run' };
      const v = bestOf(statuses);
      return { verdict: v, detail: cap + (v === 'present' ? ' completed' : ' ended ' + statuses.map((x) => x || '(no status)').join(', ')) };
    }
    if (!calls) return { verdict: 'unobserved', detail: 'call results not recorded' };
    const min = Number.isFinite(+d.min) ? +d.min : 1;
    const mine = calls.filter((c) => str(c && c.name) === cap || str(c && c.args && c.args.capability) === cap || str(c && c.args && c.args.id) === cap);
    if (!mine.length) return { verdict: 'absent', detail: cap + ' was not called' };
    const read = mine.map((c) => { const r = resultOf(c); return r ? { n: sizeOf(at(r, d.path)), status: callStatus(c) } : null; }).filter(Boolean);
    if (!read.length) return { verdict: 'unobserved', detail: 'result of ' + cap + ' not readable' };
    /* a value counts only from a result that names no state other than done — rows inside a `running` result are not the table */
    const done = read.filter((x) => x.status === '' || x.status === 'completed');
    if (!done.length) return { verdict: bestOf(read.map((x) => x.status)), detail: cap + ' ended ' + read.map((x) => x.status).join(', ') };
    const top = Math.max(...done.map((x) => x.n));
    return top >= min ? { verdict: 'present', detail: cap + '.' + d.path + ' = ' + top } : { verdict: 'absent', detail: cap + '.' + d.path + ' = ' + top + ' < ' + min };
  }
  return { verdict: 'unobserved', detail: 'unknown deliverable kind ' + str(d.kind) };
}

/** claimOf(obs) → { claim, claimBasis } — what the turn declared about its own completion, read off the record.
 *  The derivation is js/atlas-agent.js's own rule (`completion = no text ? 'none' : unmet.length ? 'partial' : 'complete'`),
 *  applied only to the parts the record does carry: a non-empty `unmet` names an owed item; the stop `output_unmet` is the
 *  agent renaming `answered` because a declared output never appeared. Neither can prove `complete` — an absent `unmet` is
 *  not an empty one (js/atlas-console.js writes it only when it has items) — so `complete` is only ever recorded. */
export function claimOf(obs) {
  const o = obs || {};
  const recorded = str(o.completion);
  if (recorded) return { claim: recorded, claimBasis: 'recorded' };
  const wrote = !!str(o.reply).trim();
  if (Array.isArray(o.unmet) && o.unmet.length) return { claim: wrote ? 'partial' : 'none', claimBasis: 'derived: unmet (' + o.unmet.length + ' item(s)) without completion' };
  if (str(o.stopped) === 'output_unmet') return { claim: wrote ? 'partial' : 'none', claimBasis: 'derived: stopped output_unmet without completion' };
  return { claim: 'unknown', claimBasis: 'not recorded' };
}

/** one turn → what was asked for, what existed, and what the turn claimed; null when it asked for nothing countable */
export function deliverablesOfTurn(q, obs, ctx = {}) {
  /* a question that states the map it asks for (`mapState`) has that map as a deliverable — one statement, not a copy */
  const list = Array.isArray(q && q.deliverables) ? q.deliverables : (q && q.mapState ? [{ kind: 'map', mapState: q.mapState, why: 'the map the question asks for' }] : []);
  if (!list.length || !obs || obs.measured === false) return null;
  const rows = list.map((d) => ({ kind: d.kind, why: str(d.why), ...observeDeliverable(d, obs, ctx) }));
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  const present = n('present'), absent = n('absent'), pending = n('pending'), cancelled = n('cancelled');
  const missing = absent + pending + cancelled;   /* observed NOT to exist when the turn ended, for three different causes */
  const unobserved = rows.length - present - missing;
  const { claim, claimBasis } = claimOf(obs);
  return {
    id: q.id, rows, present, absent, pending, cancelled, unobserved,
    /* every deliverable present → true; any observed missing → false; otherwise (some unobserved, none missing) → null */
    finished: missing ? false : unobserved ? null : true,
    claim, claimBasis,
    falseCompletion: claim === 'complete' && missing > 0,
    honestIncomplete: claim !== 'complete' && claim !== 'unknown' && missing > 0,
  };
}

/** many turns → the rates, over the turns whose outcome is known; unobserved is counted apart */
export function completionRateOf(turns) {
  const t = turns.filter(Boolean);
  const known = t.filter((x) => x.finished !== null);
  const sum = (k) => t.reduce((s, x) => s + (+x[k] || 0), 0);
  const present = sum('present');
  /* observed = present + the three ways of observed not existing; unobserved stays out of the denominator */
  const seen = present + sum('absent') + sum('pending') + sum('cancelled');
  return {
    turns: t.length, observedTurns: known.length, unobservedTurns: t.length - known.length,
    finishedTurns: known.filter((x) => x.finished).length,
    turnRate: known.length ? known.filter((x) => x.finished).length / known.length : null,
    deliverables: seen, deliverablesPresent: present,
    deliverablesAbsent: sum('absent'), deliverablesPending: sum('pending'), deliverablesCancelled: sum('cancelled'), deliverablesUnobserved: sum('unobserved'),
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
