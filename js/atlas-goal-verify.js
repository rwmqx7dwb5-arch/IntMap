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

const clip = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

/** one line per operation the turn ran: what ran, and whether it worked — the record the reader is shown */
export function recordOf(results) {
  const rows = [];
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || typeof r !== 'object') continue;
    const id = r.capability || r.name || '';
    if (!id) continue;
    rows.push(id + ' → ' + (r.ok === false ? 'FAILED' + (r.error ? ' (' + clip(r.error, 60) + ')' : '') : (r.status && r.status !== 'completed' ? String(r.status) : 'ok'))
      + (Array.isArray(r.producedModes) && r.producedModes.length ? ' [produced: ' + r.producedModes.join(', ') + ']' : ''));
  }
  return rows;
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
      const prompt = 'REQUEST (the reader\'s own words):\n' + clip(ctx.request, 1500)
        + '\n\nRECORD OF THIS TURN\nAnswer mode declared: ' + (ctx.answerMode || '(none)')
        + '\nOutputs actually produced on the map or in the reply: ' + ((ctx.produced && ctx.produced.length) ? ctx.produced.join(', ') : 'none')
        + '\nOperations run:\n' + (rec.length ? rec.map((x) => '- ' + x).join('\n') : '- none')
        + '\n\nANSWER WRITTEN:\n' + clip(ctx.text, 1500);
      const env = await d.ask(prompt, d.system || '', null, { task: 'atlas_verify', webMode: 'off', turnId: d.turnId || undefined, signal: ctl ? ctl.signal : (d.signal || undefined) });
      const data = env && env.data;
      if (!data || !Array.isArray(data.unmet)) return null;
      return { unmet: data.unmet.filter((u) => u && typeof u === 'object' && String(u.need || '').trim()).map((u) => ({ need: String(u.need), why: String(u.why || '') })) };
    } catch (_) { return null; } finally { if (timer) clearTimeout(timer); }
  };
}

/** the task rules the system prompt adds beside the persona (the persona itself is js/atlas-persona.js's, never written here) */
export const GOAL_VERIFY_RULES = 'You are given a REQUEST and the RECORD of what a turn did about it. List each part of the request that the '
  + 'record does NOT cover — something the reader asked to be shown, drawn, compared, computed or stated that no produced output, '
  + 'completed operation or written answer provides. Return STRICT JSON ONLY: {"unmet":[{"need":"<the part of the request, in the reader\'s words>","why":"<what the record shows or lacks>"}]}. '
  + 'An answer that is a plain statement of fact to a plain question is complete; do not ask for a drawing the request did not ask for. '
  + 'A part covered by the written answer itself is met. Return {"unmet":[]} when everything is covered. Judge only the record you are given.';
