/* ============================================================================
 *  IntMap · js/atlas-goal-verify.js — THE REQUEST, READ BY SOMETHING OTHER THAN THE ANSWERER
 * ----------------------------------------------------------------------------
 *  (atlas-goal-verifier) js/atlas-agent.js holds Atlas to what Atlas DECLARED (answer_mode, `turn`, its plan). A
 *  turn that declares nothing — or declares "text" for 「1914年の国境を地図に出して」 — is measured against
 *  nothing, and `completion` reads "complete". This builds the `verify` hook that loop accepts: ONE separate
 *  model call (task `atlas_verify`, supabase/functions/ai-proxy/tasks/atlas_verify.ts) that is shown the
 *  REQUEST and the turn's RECORD and says which parts of the request the record does not cover.
 *
 *  ⚠ IT DECIDES NOTHING FOR ATLAS (CONSTITUTION.md §5). Its answer returns to the loop, which puts it to Atlas
 *  once as a typed note; Atlas may do the work or answer that the request does not need it. No word of the
 *  request is read here: what the request asks for is the model's reading, not a pattern in this file.
 *  ⚠ NOT OBSERVED IS NOT UNMET. Any failure — transport, timeout, a malformed answer — returns null, which the
 *  loop records as "not checked" and accepts the turn exactly as it was.
 *  PURE: the model call is injected (`ask`), so tests drive it with scripted answers.
 * ==========================================================================*/

/* the two ENDS of a long text: a request's last condition and an answer's conclusion sit at the end, which a head-only cut dropped */
const clipEnds = (s, n) => { const t = String(s == null ? '' : s).replace(/s+/g, ' ').trim(); return t.length > 2 * n ? t.slice(0, n) + ' … [' + (t.length - 2 * n) + ' characters between are not shown] … ' + t.slice(-n) : t; };
const clip = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

/** one line per operation the turn ran: what ran, and whether it worked — the record the reader is shown */
export function recordOf(results) {
  const rows = [];
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || typeof r !== 'object') continue;
    const id = r.capability || r.name || '';
    if (!id) continue;
    /* ⚠ THE STATUS IS READ BEFORE `ok`. `ok` is false for every status but 'completed' (js/atlas-results.js toLegacy), so a call that RAN and
       could not be seen ('unobserved') or that placed some of what was asked ('partial') used to be written to the reader as FAILED — an
       observer's lie (one-pass-or-a-reason §2 ①): the independent reader then listed the request as unmet, Atlas redrew what was already on the
       map, was read again, and the turn ended on 「完了していないもの」 over a finished drawing. Each state is now said as what it is. */
    let state;
    if (r.status === 'unobserved') state = 'ran; whether it took effect could not be seen (NOT a failure, nothing says it did not work)' + (Array.isArray(r.unobservedModes) && r.unobservedModes.length ? ' [would have produced: ' + r.unobservedModes.join(', ') + ']' : '');
    else if (r.status === 'partial') state = 'partial' + (r.error ? ' (' + clip(r.error, 60) + ')' : '') + (Array.isArray(r.producedModes) && r.producedModes.length ? '' : ' [nothing observed]');
    else if (r.ok === false) state = 'FAILED' + (r.error ? ' (' + clip(r.error, 60) + ')' : '');
    else state = (r.status && r.status !== 'completed' ? String(r.status) : 'ok');
    rows.push(id + ' → ' + state
      + (Array.isArray(r.producedModes) && r.producedModes.length ? ' [produced: ' + r.producedModes.join(', ') + ']' : ''));
  }
  return rows;
}

/** the previous read of THIS turn, shown when the record has grown since: lets the reader judge whether the work done closed what it found (its own earlier finding, not a rule) */
function prevSection(p) {
  if (!p || !Array.isArray(p.unmet) || !p.unmet.length) return '';
  return '\n\nYOUR PREVIOUS READING OF THIS TURN found these not covered (the operations above include what was done since):\n'
    + p.unmet.map((u) => '- ' + clip(u.need, 200) + (u.why ? ' (' + clip(u.why, 150) + ')' : '')).join('\n');
}

/**
 * makeGoalVerify({ ask, system, timeoutMs, signal, turnId }) → async (ctx) → { unmet:[{need, why}] } | null
 *   ask(prompt, system, images, opts) → envelope { data }   (js/ai-core.js askAIJSONEnvelope, injected)
 *   ctx  the loop's: { request, text, answerMode, produced, results }
 */
export function makeGoalVerify(deps) {
  const d = deps || {};
  /* observation: the verifier is one low-effort JSON call and the turn it rides on is bounded at 600 s
     (js/atlas-agent.js LIMITS), so this bounds WAITING, not Atlas. Expires with: a measured p95 of atlas_verify. */
  const timeoutMs = d.timeoutMs > 0 ? d.timeoutMs : 12000;
  return async function verify(ctx) {
    if (typeof d.ask !== 'function' || !ctx || !String(ctx.request || '').trim()) return null;
    let timer = null, ctl = null;
    try { ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (_) { ctl = null; }
    if (ctl) timer = setTimeout(() => { try { ctl.abort(); } catch (_) { /* already settled */ } }, timeoutMs);
    if (ctl && d.signal && typeof d.signal.addEventListener === 'function') {
      try { d.signal.addEventListener('abort', () => { try { ctl.abort(); } catch (_) { /* settled */ } }); } catch (_) { /* no signal */ }
    }
    try {
      const rec = recordOf(ctx.results);
      /* (evidence-graph) WHAT THE ARTEFACTS HOLD, observed by code (js/evidence-graph-deliver.js): rows and how many carry each value,
         which origins stand behind each figure. Facts only — the reader of them is this verifier, which also sees the request.
         A throw is «not observed»: the record goes out without the section. */
      let held = [];
      if (typeof d.observe === 'function') { try { const o = d.observe(ctx); if (Array.isArray(o)) held = o.map(String).filter(Boolean); } catch (_) { held = []; } }
      const prompt = 'REQUEST (the reader\'s own words):\n' + clipEnds(ctx.request, 1500)
        + '\n\nRECORD OF THIS TURN\nAnswer mode declared: ' + (ctx.answerMode || '(none)')
        + '\nOutputs actually produced on the map or in the reply: ' + ((ctx.produced && ctx.produced.length) ? ctx.produced.join(', ') : 'none')
        + '\nOperations run:\n' + (rec.length ? rec.map((x) => '- ' + x).join('\n') : '- none')
        + (held.length ? '\n\nWHAT THE OUTPUTS ACTUALLY HOLD (counted by IntMap, not by the model):\n' + held.map((x) => '- ' + x).join('\n') : '')
        + prevSection(ctx.previous)
        + '\n\nANSWER WRITTEN:\n' + clipEnds(ctx.text, 1500);
      const env = await d.ask(prompt, d.system || '', null, { task: 'atlas_verify', webMode: 'off', turnId: d.turnId || undefined, signal: ctl ? ctl.signal : (d.signal || undefined) });
      const data = env && env.data;
      if (!data || !Array.isArray(data.unmet)) return null;
      const met = Array.isArray(data.met) ? data.met.filter((m) => m && typeof m === 'object' && String(m.need || '').trim()).map((m) => ({ need: String(m.need), how: String(m.how || '') })) : [];
      return { ...(met.length ? { met } : {}), unmet: data.unmet.filter((u) => u && typeof u === 'object' && String(u.need || '').trim()).map((u) => ({ need: String(u.need), why: String(u.why || '') })) };
    } catch (_) { return null; } finally { if (timer) clearTimeout(timer); }
  };
}

/** the task rules the system prompt adds beside the persona (the persona itself is js/atlas-persona.js's, never written here) */
export const GOAL_VERIFY_RULES = 'You are given a REQUEST and the RECORD of what a turn did about it. List each part of the request that the '
  + 'record does NOT cover — something the reader asked to be shown, drawn, compared, computed or stated that no produced output, '
  + 'completed operation or written answer provides. Return STRICT JSON ONLY: {"met":[{"need":"<a part of the request the record covers>","how":"<which output, figure or written answer covers it>"}],"unmet":[{"need":"<the part of the request, in the reader\'s words>","why":"<what the record shows or lacks>"}]}. '
  + 'Read the request for what it fixes — the set of things it covers (every item it names or implies, not a sample), the sources or data it requires, the conditions or period of the analysis, and the form of the deliverable — and compare each with the record: a set asked for in full but covered in part, a source required but not used, a condition not applied, or a deliverable of a different form is NOT met. These are what to look for, not a list to fill: name only what this request actually asks. '
  + 'An answer that is a plain statement of fact to a plain question is complete; do not ask for a drawing the request did not ask for. '
  + 'An operation that returned ok is not a part met: when WHAT THE OUTPUTS ACTUALLY HOLD shows a table or figure that does not hold what the request asked for (e.g. values present for 8 of the 20 rows asked, a figure no record states, several citations that are one origin), that part is NOT met — say what is missing. '
  + 'A part covered by the written answer itself is met. Return {"unmet":[]} when everything is covered. Judge only the record you are given.';
