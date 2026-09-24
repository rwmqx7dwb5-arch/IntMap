/* ============================================================================
 *  IntMap · ATLAS EVALUATION — THE PART THAT JUDGES  (pure: no browser, no network, no clock)
 * ----------------------------------------------------------------------------
 *  #R742, #R747, #R760, #R775 and #R802 each put dozens of questions to the production Atlas BY HAND
 *  and each wrote 「⚠ 自動ハーネスはリポジトリに無い」. What they found — Japanese requests that reached
 *  no capability, 23 of 46 turns ending on 「作業の上限」, the same operation fired 7 and 17 times,
 *  「the Alps」 answered as a hamlet in Norway, a turn of 10 m 34 s — would come back with the next
 *  change and nobody would know, because the only instrument was a person.
 *
 *  scripts/atlas-eval.mjs drives the browser. THIS file decides what the driven turn MEANT, and it is
 *  separate so tests/atlas-eval-harness-checks.test.mjs can feed it R802's own measurements and
 *  prove it would have caught them (#R505: evaluate, do not read).
 *
 *  ⚠ NOTHING HERE IS A NEW DEFINITION. Each rule is handed in from the one place IntMap already keeps it:
 *      · 「was the turn cut short」   — js/atlas-agent.js `CUT_STOPS`   (the loop that sets `stopped`)
 *      · 「how long may a turn run」   — js/atlas-agent.js `LIMITS.turnBudgetMs`
 *      · 「is this the same call」     — js/atlas-turn-results.js `callKey` (the key the agent's own
 *                                       reuse ledger asks — .agents/rules/one-pass-or-a-reason.md §1)
 *    A second spelling of any of them here would be free to disagree with the product it measures.
 *
 *  ⚠ AND NOTHING HERE IS A CEILING ON ATLAS (CONSTITUTION.md §5, one-pass-or-a-reason.md §6). The
 *  number of operations a turn made is REPORTED, never judged. What is judged is 「the same operation a
 *  second time」 and what came before it — the rule's own measure — and the expectations a recorded
 *  round actually judged by.
 *
 *  ⚠ 「COULD NOT MEASURE」 IS NOT 「ZERO」 AND NOT 「FAILED」. A turn the harness could not run (no session,
 *  the daily allowance, the page never loaded Atlas) carries `measured:false` and a reason, and every
 *  aggregate below counts it apart. #R802 §0's lesson — a measuring artefact is not a product defect —
 *  is written into the data shape rather than left to whoever reads the numbers.
 * ==========================================================================*/

/** The one reason vocabulary for a turn that was not measured. The report prints these; nothing
 *  branches on their wording. */
export const UNMEASURED = Object.freeze({
  not_signed_in: 'not signed in — the turn cannot reach Atlas without a session (未ログインのため測れない)',
  gate_refused: 'the page refused the turn before Atlas ran (login gate or the daily allowance)',
  not_sendable: 'the recorded question text is incomplete, so it is not asked',
  harness_timeout: 'the harness stopped waiting (longer than Atlas\'s own turn and tool budgets together)',
  page_error: 'the page threw before the turn finished',
  no_observation: 'the page does not publish the Atlas records this harness reads',
  dry_run: 'dry run — no question is sent',
  not_reached: 'the harness stopped before this question (an earlier gate refusal applies to every later turn)',
});

const str = (v) => (v == null ? '' : String(v));
const re = (p) => new RegExp(p.pattern, p.flags == null ? 'i' : p.flags);

/** The result of one tool call as the model received it, as an object when it was one. */
function resultObj(c) {
  if (c && c.result && typeof c.result === 'object') return c.result;
  try { const o = JSON.parse(str(c && c.resultText)); return o && typeof o === 'object' ? o : null; } catch (_) { return null; }
}
function resultText(c) {
  if (c && typeof c.resultText === 'string') return c.resultText;
  try { return JSON.stringify(c && c.result); } catch (_) { return ''; }
}
/** The capability a tool call reached: `run_capability {id}` names it; a core tool is its own name. */
function capOfCall(c) {
  const a = (c && c.args) || {};
  if (c && c.name === 'run_capability' && a.id) return str(a.id);
  return str(c && c.name);
}

/**
 * repeatsOf(calls, callKey) — every tool call that repeated an earlier call of the same turn, keyed
 * the way the agent keys it, with WHAT THE EARLIER ONE RETURNED: that is the cause the rule asks for.
 *     after 'failed'                → a retry after an observed failure (the rule's §5 case)
 *     after 'partial' / not_rendered → the observer said 「did not happen」 (the rule's §2-1 cause)
 *     after 'completed'             → the agent's reuse ledger did not answer it (§2-2 / §2-3)
 */
export function repeatsOf(calls, callKey) {
  const seen = new Map(), out = [];
  for (const c of Array.isArray(calls) ? calls : []) {
    const k = callKey(c && c.name, (c && c.args) || {});
    if (!k) continue;
    if (seen.has(k)) {
      const prev = seen.get(k);
      out.push({ key: k, capability: capOfCall(c), n: prev.n + 1, after: prev.status, afterCode: prev.code });
    }
    const r = resultObj(c) || {};
    const status = str(r.status) || (r.ok === false ? 'failed' : (r.ok === true ? 'completed' : ''));
    seen.set(k, { n: (seen.has(k) ? seen.get(k).n : 0) + 1, status, code: str(r.code || r.error) });
  }
  return out;
}

/** The value at a dotted path (`atlas.pins.n`), or undefined. */
export function at(obj, path) {
  let v = obj;
  for (const k of String(path).split('.')) { if (v == null || typeof v !== 'object') return undefined; v = v[k]; }
  return v;
}

/**
 * judgeTurn(q, obs, ctx) — one question, one turn, judged.
 *   q    a row of scripts/atlas-eval/questions.json
 *   obs  what the harness observed (see scripts/atlas-eval.mjs `observeTurn`):
 *        { measured, unmeasured, ms, stopped, operations:[{capabilityId,args,status,code,ms}],
 *          calls:[{name,args,resultText,ms}] | null, steps:[{step,calls:[name]}], reply, snapshot }
 *        `calls` is null when the tool-surface tap could not be installed — the checks that need it
 *        then say 「not observed」 instead of passing.
 *   ctx  { cutStops, turnBudgetMs, callKey } — handed in from js/atlas-agent.js / js/atlas-turn-results.js
 */
export function judgeTurn(q, obs, ctx) {
  const base = { id: q.id, lang: q.lang, text: q.text, knownOpen: q.knownOpen || null };
  if (!q.sendable) return { ...base, measured: false, unmeasured: 'not_sendable', failures: [], metrics: null };
  if (!obs || obs.measured === false) {
    return { ...base, measured: false, unmeasured: (obs && obs.unmeasured) || 'no_observation', detail: (obs && obs.detail) || '', failures: [], metrics: null };
  }
  const ops = Array.isArray(obs.operations) ? obs.operations : [];
  const calls = Array.isArray(obs.calls) ? obs.calls : null;
  const stopped = str(obs.stopped);
  const reply = str(obs.reply);
  const exp = q.expect || {};
  const failures = [];
  const fail = (kind, detail) => failures.push({ kind, detail });

  /* ── the metrics every turn gets, whatever its expectations ───────────────────────────────── */
  const byCap = {};
  for (const o of ops) { const k = str(o.capabilityId); byCap[k] = (byCap[k] || 0) + 1; }
  const maxSame = Object.entries(byCap).sort((a, b) => b[1] - a[1])[0] || null;
  const repeats = calls ? repeatsOf(calls, ctx.callKey) : null;
  const issued = {};   /* what the MODEL asked for, including calls the agent answered from its reuse ledger */
  for (const s of Array.isArray(obs.steps) ? obs.steps : []) for (const n of (s && s.calls) || []) issued[n] = (issued[n] || 0) + 1;
  const executed = {};
  for (const c of calls || []) executed[c.name] = (executed[c.name] || 0) + 1;
  const reused = calls ? Object.keys(issued).reduce((s, n) => s + Math.max(0, issued[n] - (executed[n] || 0)), 0) : null;
  /* (#R802 §3) a result that says it rendered AND says it did not — the observer contradicting itself,
     which is what Atlas retried against seven times */
  const contradictions = (calls || []).filter((c) => { const r = resultObj(c); return r && r.rendered === true && str(r.code) === 'not_rendered'; }).length;
  /* (#R802 §5) a named place answered about the map centre */
  const centre = (calls || []).filter((c) => {
    const a = (c && c.args) || {}; const inner = (a.args && typeof a.args === 'object') ? a.args : a;
    return str(inner.place).trim() && /map cent(?:er|re)|地図の中心/i.test(resultText(c));
  }).length;

  const metrics = {
    ms: Number.isFinite(+obs.ms) ? +obs.ms : null,
    operations: ops.length,
    zeroOps: ops.length === 0,
    stopped,
    cut: ctx.cutStops[stopped] === 1,
    noReply: !reply.trim(),
    overBudget: Number.isFinite(+obs.ms) && ctx.turnBudgetMs > 0 && +obs.ms > ctx.turnBudgetMs,
    findCapability: calls ? calls.filter((c) => c.name === 'find_capability').length : null,
    secondOfSameOp: repeats ? repeats.length : null,
    repeats,
    reusedByAgent: reused,
    maxSameCapability: maxSame ? { capability: maxSame[0], n: maxSame[1] } : null,
    observerContradictions: calls ? contradictions : null,
    answeredAboutCentre: calls ? centre : null,
  };

  /* ── the expectations the recorded round judged by ────────────────────────────────────────── */
  let reached = null;
  if (Array.isArray(exp.reach) && exp.reach.length) {
    reached = ops.some((o) => exp.reach.indexOf(str(o.capabilityId)) >= 0);
    if (!reached) fail('reach', 'none of ' + exp.reach.join(' / ') + ' was reached (operations: ' + (Object.keys(byCap).join(', ') || 'none') + ')');
  }
  metrics.reached = reached;
  if (exp.minOperations != null && ops.length < exp.minOperations) fail('operations', ops.length + ' operation(s); at least ' + exp.minOperations + ' expected');
  if (exp.requireReply && metrics.noReply) fail('reply', 'the turn wrote no answer text');
  for (const p of exp.replyMustNotMatch || []) if (re(p).test(reply)) fail('reply', 'the reply matches /' + p.pattern + '/ — ' + p.why);
  for (const p of exp.replyMustMatch || []) if (!re(p).test(reply)) fail('reply', 'the reply does not match /' + p.pattern + '/ — ' + p.why);
  for (const cap of exp.notAllFailed || []) {
    const mine = ops.filter((o) => str(o.capabilityId) === cap);
    if (mine.length && mine.every((o) => str(o.status) === 'failed')) fail('capability', cap + ' was called ' + mine.length + ' time(s) and failed every time');
  }
  for (const p of exp.codeMustNotOccur || []) {
    const hit = ops.filter((o) => (!p.capability || str(o.capabilityId) === p.capability) && str(o.code) === p.code);
    if (hit.length) fail('code', (p.capability || 'an operation') + ' returned ' + p.code + ' ×' + hit.length + ' — ' + p.why);
  }
  for (const p of exp.resultMustNotMatch || []) {
    if (!calls) { fail('unobserved', 'resultMustNotMatch /' + p.pattern + '/ needs the tool-call tap, which was not installed'); continue; }
    const hit = calls.filter((c) => (!p.capability || capOfCall(c) === p.capability) && re(p).test(resultText(c)));
    if (hit.length) fail('result', (p.capability || 'a tool') + ' returned /' + p.pattern + '/ ×' + hit.length + ' — ' + p.why);
  }
  for (const m of exp.map || []) {
    const v = at(obj(obs.snapshot), m.path);
    const n = (v == null || v === false) ? 0 : (typeof v === 'object' ? +(v.n || 0) : +v);
    if (!(n >= m.min)) fail('map', m.path + ' = ' + (v === undefined ? '(absent)' : JSON.stringify(v)) + ' on the final map; ≥ ' + m.min + ' expected — ' + m.why);
  }
  /* the generic observations that ARE defects wherever they occur (R802 §3 / §5) */
  if (stopped === 'error') fail('error', 'the turn threw: ' + reply.slice(0, 200));
  if (contradictions) fail('observer', contradictions + ' result(s) said rendered:true and code:not_rendered at once (R802 §3)');
  if (centre) fail('resolution', centre + ' call(s) named a place and were answered about the map centre (R802 §5)');

  return { ...base, measured: true, failures, metrics };
}
function obj(v) { return v && typeof v === 'object' ? v : {}; }

/** nameAgrees(asked, got) — does the top name agree with the asked one? Either contains the other,
 *  after the article and punctuation are removed. (Pacific ⊂ Pacifica passes — that is why the probe
 *  also carries the recorded wrong answer.) */
export function nameAgrees(asked, got) {
  const k = (s) => str(s).toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const a = k(asked), g = k(got);
  return !!a && !!g && (g.indexOf(a) >= 0 || a.indexOf(g) >= 0);
}

/**
 * judgeProbe(row, obs) — one R802 §6 place probe.
 *   obs { measured, unmeasured, top:{name,country,admin,kind,source}, error }
 */
export function judgeProbe(row, obs) {
  const base = { asked: row.asked, knownOpen: row.knownOpen || null };
  if (!obs || obs.measured === false) return { ...base, measured: false, unmeasured: (obs && obs.unmeasured) || 'no_observation', detail: (obs && obs.detail) || '', failures: [] };
  const failures = [];
  const top = obs.top || null;
  if (!top) {
    /* 「provider_unavailable」 is the geocoder saying no source answered — not 「no such place」 */
    if (obs.error) return { ...base, measured: false, unmeasured: 'page_error', detail: 'geocoder: ' + obs.error, failures: [] };
    /* R802's repair is 「say it is not there rather than return the wrong KIND of place」, so an empty
       answer is a failure only where R802 recorded that the name DOES resolve */
    if (row.mustResolve) failures.push({ kind: 'resolution', detail: 'nothing was returned for 「' + row.asked + '」, which R802 recorded as resolving' });
  } else {
    if (row.agree && !nameAgrees(row.asked, top.name)) failures.push({ kind: 'resolution', detail: '「' + row.asked + '」 resolved to 「' + top.name + '」, a name that does not agree with it' });
    for (const m of row.mustNot || []) {
      if (re(m).test(str(top[m.field]))) failures.push({ kind: 'resolution', detail: '「' + row.asked + '」 resolved to the recorded wrong answer again — ' + m.recorded });
    }
  }
  return { ...base, measured: true, top, failures };
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

/** metricsOf(turns, probes) — the aggregate the report leads with. Unmeasured turns are counted
 *  APART, never folded into zero. */
export function metricsOf(turns, probes) {
  const m = turns.filter((t) => t.measured);
  const un = {};
  for (const t of turns) if (!t.measured) un[t.unmeasured] = (un[t.unmeasured] || 0) + 1;
  const withReach = m.filter((t) => t.metrics.reached !== null);
  const ms = m.map((t) => t.metrics.ms).filter((v) => v != null).sort((a, b) => a - b);
  const cutBy = {};
  for (const t of m) if (t.metrics.cut) cutBy[t.metrics.stopped] = (cutBy[t.metrics.stopped] || 0) + 1;
  const pm = (probes || []).filter((p) => p.measured);
  const counted = (t) => !t.knownOpen;
  return {
    questions: turns.length,
    measured: m.length,
    unmeasured: un,
    reach: { reached: withReach.filter((t) => t.metrics.reached).length, of: withReach.length },
    zeroOpTurns: m.filter((t) => t.metrics.zeroOps).map((t) => t.id),
    cutTurns: { n: m.filter((t) => t.metrics.cut).length, by: cutBy },
    noReplyTurns: m.filter((t) => t.metrics.noReply).map((t) => t.id),
    secondOfSameOp: {
      total: m.reduce((s, t) => s + (t.metrics.secondOfSameOp || 0), 0),
      turns: m.filter((t) => t.metrics.secondOfSameOp).map((t) => t.id),
      unobserved: m.filter((t) => t.metrics.secondOfSameOp === null).map((t) => t.id),
    },
    durationMs: { n: ms.length, p50: quantile(ms, 0.5), p90: quantile(ms, 0.9), max: ms.length ? ms[ms.length - 1] : null },
    overBudgetTurns: m.filter((t) => t.metrics.overBudget).map((t) => t.id),
    misresolution: {
      probes: pm.filter((p) => p.failures.length).map((p) => p.asked),
      probesMeasured: pm.length,
      answeredAboutCentre: m.reduce((s, t) => s + (t.metrics.answeredAboutCentre || 0), 0),
    },
    expectationFailures: {
      alarming: m.filter((t) => counted(t) && t.failures.length).length + pm.filter((p) => counted(p) && p.failures.length).length,
      knownOpen: m.filter((t) => !counted(t) && t.failures.length).length + pm.filter((p) => !counted(p) && p.failures.length).length,
    },
  };
}

/**
 * badnessOf(turns, probes) — every measured fact as a number where HIGHER IS WORSE, keyed
 * `<question id>:<fact>`. Unmeasured things produce no key, so they can neither regress nor recover.
 */
export function badnessOf(turns, probes) {
  const b = {};
  for (const t of turns) {
    if (!t.measured) continue;
    const x = t.metrics, id = t.id;
    if (x.reached !== null) b[id + ':unreached'] = x.reached ? 0 : 1;
    b[id + ':zeroOps'] = x.zeroOps ? 1 : 0;
    b[id + ':cut'] = x.cut ? 1 : 0;
    b[id + ':noReply'] = x.noReply ? 1 : 0;
    b[id + ':overBudget'] = x.overBudget ? 1 : 0;
    if (x.secondOfSameOp !== null) b[id + ':secondOfSameOp'] = x.secondOfSameOp;
    b[id + ':expectationFailures'] = t.failures.length;
  }
  for (const p of probes || []) if (p.measured) b['probe:' + p.asked + ':wrong'] = p.failures.length ? 1 : 0;
  return b;
}

/**
 * advance(prevReference, badness) — the regression rule.
 *
 * The reference is 「the last value that was not a regression」. A fact that got worse is a regression
 * and the reference does NOT move, so it stays a regression on every later night until it recovers
 * (comparing only with last night would call a persistent breakage fixed after one run — the one
 * issue would open and close on alternate nights). A fact that held or improved moves the reference.
 * A fact seen for the first time is adopted without judgement: there is nothing to compare it with.
 */
export function advance(prevReference, badness) {
  const ref = Object.assign({}, prevReference || {});
  const regressions = [], improvements = [];
  for (const k of Object.keys(badness).sort()) {
    const now = badness[k];
    if (!(k in ref)) { ref[k] = now; continue; }
    if (now > ref[k]) { regressions.push({ key: k, was: ref[k], now }); continue; }
    if (now < ref[k]) improvements.push({ key: k, was: ref[k], now });
    ref[k] = now;
  }
  return { reference: ref, regressions, improvements };
}

/**
 * verdictOf({dryRun, turns, probes, regressions}) — one word for the workflow and the issue.
 *   dry-run      nothing was sent by design
 *   unmeasured   questions were meant to be asked and not one was measured (red: a dormant
 *                evaluation must not be green)
 *   regressed    a fact got worse, or a recorded defect is back (an expectation outside knownOpen failed)
 *   ok
 */
export function verdictOf({ dryRun, turns, probes, regressions }) {
  if (dryRun) return 'dry-run';
  const sent = turns.filter((t) => t.unmeasured !== 'not_sendable');
  if (sent.length && !sent.some((t) => t.measured)) return 'unmeasured';
  const back = turns.some((t) => t.measured && !t.knownOpen && t.failures.length)
    || (probes || []).some((p) => p.measured && !p.knownOpen && p.failures.length);
  if ((regressions && regressions.length) || back) return 'regressed';
  return 'ok';
}

/** validateQuestionSet(set, capabilityExists) — the problem set's own schema. Returns a list of
 *  problems; empty means well formed. A capability named by an expectation that does not exist in
 *  the registry would never be reached and never fail — the check reports it instead. */
export function validateQuestionSet(set, capabilityExists) {
  const bad = [];
  const ids = new Set();
  const KNOWN = new Set(['reach', 'minOperations', 'requireReply', 'replyMustNotMatch', 'replyMustMatch', 'notAllFailed', 'codeMustNotOccur', 'resultMustNotMatch', 'map']);
  for (const q of (set && set.questions) || []) {
    if (!q.id || ids.has(q.id)) bad.push('duplicate or missing id: ' + q.id); ids.add(q.id);
    if (q.lang !== 'en' && q.lang !== 'jp') bad.push(q.id + ': lang must be en or jp (the codes the product uses)');
    if (!str(q.text).trim()) bad.push(q.id + ': no text');
    if (!q.source || !q.source.round || !q.source.where) bad.push(q.id + ': no source — a question must come from a record');
    if (q.sendable === false && !str(q.whyNotSendable).trim()) bad.push(q.id + ': not sendable without a reason');
    if (!q.expect || typeof q.expect !== 'object') bad.push(q.id + ': no expect object');
    if (!q.unset || typeof q.unset !== 'object') bad.push(q.id + ': no unset object (write {} when every criterion is set)');
    for (const k of Object.keys(q.expect || {})) if (!KNOWN.has(k)) bad.push(q.id + ': unknown expectation «' + k + '» — judge.mjs would ignore it');
    for (const [k, why] of Object.entries(q.unset || {})) if (!str(why).trim()) bad.push(q.id + ': unset «' + k + '» carries no reason');
    const caps = [...(q.expect && q.expect.reach) || [], ...(q.expect && q.expect.notAllFailed) || [],
      ...((q.expect && q.expect.codeMustNotOccur) || []).map((p) => p.capability),
      ...((q.expect && q.expect.resultMustNotMatch) || []).map((p) => p.capability)].filter(Boolean);
    for (const c of caps) if (capabilityExists && !capabilityExists(c)) bad.push(q.id + ': names capability «' + c + '», which the registry does not have');
    for (const p of [...(q.expect && q.expect.replyMustNotMatch) || [], ...(q.expect && q.expect.replyMustMatch) || [], ...(q.expect && q.expect.resultMustNotMatch) || [], ...(q.expect && q.expect.codeMustNotOccur) || [], ...(q.expect && q.expect.map) || []]) {
      if (!str(p.why).trim()) bad.push(q.id + ': an expectation without «why» — every criterion must say which record it came from');
      if (p.pattern != null) { try { re(p); } catch (e) { bad.push(q.id + ': bad pattern ' + p.pattern); } }
    }
  }
  for (const r of (set && set.placeProbes && set.placeProbes.rows) || []) {
    for (const m of r.mustNot || []) { if (!m.recorded) bad.push('probe ' + r.asked + ': mustNot without the recorded answer'); try { re(m); } catch (e) { bad.push('probe ' + r.asked + ': bad pattern'); } }
  }
  return bad;
}

const secs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + ' s');

/** renderMarkdown(report) — the human half of the report (the artifact and the issue body). */
export function renderMarkdown(r) {
  const L = [];
  const M = r.metrics;
  L.push('# Atlas evaluation — ' + r.verdict);
  L.push('');
  L.push('* target: ' + r.url + (r.build ? ' (build ' + r.build + ')' : ''));
  L.push('* when: ' + r.when + (r.runUrl ? ' · run: ' + r.runUrl : ''));
  L.push('* problem set: `scripts/atlas-eval/questions.json` — ' + M.questions + ' question(s), ' + M.measured + ' measured');
  if (r.dryRun) L.push('* ⚠ DRY RUN — no question was sent. Every turn below is 「not measured」, which is not 「0 operations」 and not 「failed」.');
  if (r.session) L.push('* session: ' + r.session);
  L.push('');
  L.push('## Metrics');
  L.push('');
  L.push('| metric | value |');
  L.push('|---|---|');
  L.push('| reach rate (turns whose recorded capability was reached) | ' + (M.reach.of ? M.reach.reached + ' / ' + M.reach.of : '— (none measured)') + ' |');
  L.push('| turns with zero operations | ' + M.zeroOpTurns.length + (M.zeroOpTurns.length ? ' — ' + M.zeroOpTurns.join(', ') : '') + ' |');
  L.push('| turns cut short (`CUT_STOPS`) | ' + M.cutTurns.n + (M.cutTurns.n ? ' — ' + Object.entries(M.cutTurns.by).map(([k, v]) => k + ' ×' + v).join(', ') : '') + ' |');
  L.push('| turns with no answer text | ' + M.noReplyTurns.length + ' |');
  L.push('| the same operation a second time (`callKey`) | ' + M.secondOfSameOp.total + (M.secondOfSameOp.turns.length ? ' in ' + M.secondOfSameOp.turns.join(', ') : '') + (M.secondOfSameOp.unobserved.length ? ' · not observed in ' + M.secondOfSameOp.unobserved.length : '') + ' |');
  L.push('| duration p50 / p90 / max | ' + secs(M.durationMs.p50) + ' / ' + secs(M.durationMs.p90) + ' / ' + secs(M.durationMs.max) + ' |');
  L.push('| turns over Atlas\'s own turn budget | ' + M.overBudgetTurns.length + (M.overBudgetTurns.length ? ' — ' + M.overBudgetTurns.join(', ') : '') + ' |');
  L.push('| misresolved place probes | ' + M.misresolution.probes.length + ' / ' + M.misresolution.probesMeasured + (M.misresolution.probes.length ? ' — ' + M.misresolution.probes.join(', ') : '') + ' |');
  L.push('| named places answered about the map centre | ' + M.misresolution.answeredAboutCentre + ' |');
  L.push('| failed expectations (alarming / known open) | ' + M.expectationFailures.alarming + ' / ' + M.expectationFailures.knownOpen + ' |');
  const un = Object.entries(M.unmeasured);
  if (un.length) {
    L.push('');
    L.push('### Not measured');
    L.push('');
    for (const [k, n] of un) L.push('* ' + n + ' × `' + k + '` — ' + (UNMEASURED[k] || k));
  }
  L.push('');
  L.push('## Against the previous report');
  L.push('');
  if (!r.previous) L.push('No previous report — every fact measured tonight becomes the reference.');
  else {
    L.push('Previous: ' + r.previous.when + (r.previous.runUrl ? ' (' + r.previous.runUrl + ')' : ''));
    L.push('');
    if (r.regressions.length) { L.push('### ' + r.regressions.length + ' regression(s)'); L.push(''); for (const x of r.regressions) L.push('* `' + x.key + '` ' + x.was + ' → **' + x.now + '**'); }
    else L.push('No regression.');
    if (r.improvements.length) { L.push(''); L.push('### Improved'); L.push(''); for (const x of r.improvements) L.push('* `' + x.key + '` ' + x.was + ' → ' + x.now); }
  }
  L.push('');
  L.push('## Turns');
  L.push('');
  for (const t of r.turns) {
    const head = '### `' + t.id + '` (' + t.lang + ')' + (t.knownOpen ? ' — known open' : '');
    L.push(head);
    L.push('');
    L.push('> ' + t.text);
    L.push('');
    if (!t.measured) { L.push('Not measured: ' + (UNMEASURED[t.unmeasured] || t.unmeasured) + (t.detail ? ' — ' + t.detail : '')); L.push(''); continue; }
    const x = t.metrics;
    L.push('* ' + secs(x.ms) + ' · ' + x.operations + ' operation(s) · stopped `' + (x.stopped || '?') + '`' + (x.cut ? ' (cut short)' : '')
      + (x.findCapability != null ? ' · find_capability ×' + x.findCapability : '')
      + (x.secondOfSameOp ? ' · same call again ×' + x.secondOfSameOp : '')
      + (x.reusedByAgent ? ' · answered from the reuse ledger ×' + x.reusedByAgent : ''));
    if (x.repeats && x.repeats.length) for (const p of x.repeats) L.push('  * again: `' + p.capability + '` (#' + p.n + ') after ' + (p.after || '?') + (p.afterCode ? '/' + p.afterCode : ''));
    for (const f of t.failures) L.push('* ✗ ' + f.kind + ': ' + f.detail);
    if (!t.failures.length) L.push('* every recorded expectation held');
    L.push('');
  }
  L.push('## Place probes (no model call)');
  L.push('');
  for (const p of r.probes) {
    if (!p.measured) { L.push('* 「' + p.asked + '」 — not measured: ' + (UNMEASURED[p.unmeasured] || p.unmeasured) + (p.detail ? ' — ' + p.detail : '')); continue; }
    const top = p.top ? p.top.name + (p.top.country ? ', ' + p.top.country : '') + (p.top.kind ? ' [' + p.top.kind + ']' : '') : '(nothing)';
    L.push('* 「' + p.asked + '」 → ' + top + (p.failures.length ? ' ✗ ' + p.failures.map((f) => f.detail).join('; ') : ' ✓') + (p.knownOpen ? ' (known open)' : ''));
  }
  L.push('');
  L.push('---');
  L.push('Generated by `scripts/atlas-eval.mjs`. The rules it applies are in `scripts/atlas-eval/judge.mjs`; the problem set and where each criterion came from are in `scripts/atlas-eval/questions.json`.');
  return L.join('\n');
}
