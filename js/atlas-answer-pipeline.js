/* ============================================================================
 *  IntMap · ATLAS — ONE ANSWER, ONE CALL, ONE AUDIT, AT MOST ONE REPAIR  (#R348)
 * ----------------------------------------------------------------------------
 *  The order matters and it is fixed here so no call site can reorder it:
 *
 *    1. build the EVIDENCE REGISTRY from what IntMap actually has — the articles it fetched, the
 *       figures it holds — and mint the callId BEFORE the call, so the registry is bound to the
 *       call that is about to happen rather than to whichever call answers last;
 *    2. ask ONCE, with the schema, showing the model evidence IDS and no URLs;
 *    3. AUDIT the structure against the registry (js/atlas-answer-audit.js);
 *    4. if it failed, ask ONCE more — with the finding CODES, not the previous prose — under the
 *       same turnId, so the repair does not cost the reader a second daily use (#R318);
 *    5. if it failed again, DEGRADE in code: keep what passed, drop what did not, and say so.
 *
 *  ⚠ THE VALID PATH IS STILL ONE MODEL CALL. #R318 made one question cost one use; this round does
 *  not spend a second one to buy its own correctness. The repair happens only when the audit has
 *  something concrete to point at, and it is capped at one — a loop that keeps asking until the
 *  model agrees with itself is the self-check this file exists to replace.
 *
 *  ⚠ NOTHING HERE TOUCHES THE DOM AND NOTHING HERE CALLS THE NETWORK DIRECTLY. `ask` is injected,
 *  so tests/r334-checks.test.mjs runs the whole pipeline — including the repair and the degrade —
 *  against a scripted model with no browser and no key.
 * ==========================================================================*/

import { makeAtlasEvidence } from './atlas-evidence.js';
import { makeAtlasAnswerContract } from './atlas-answer-contract.js';
import { makeAtlasAnswerAudit } from './atlas-answer-audit.js';

export function makeAtlasAnswerPipeline() {
  return (function () {
  const { makeEvidenceRegistry } = makeAtlasEvidence();
  const { normalizeAnswer, answerContractRules } = makeAtlasAnswerContract();
  const { auditAnswer, repairBrief, degrade } = makeAtlasAnswerAudit();

  const MAX_MODEL_CALLS = 2;   /* the answer, and at most one repair. Not a setting. */

  let _seq = 0;
  function newCallId(prefix) {
    _seq++;
    let t = 0; try { t = Date.now(); } catch (_) { t = 0; }
    return String(prefix || 'ans') + '-' + t.toString(36) + '-' + _seq;
  }

  /**
   * runStructuredAnswer(opts) -> {env, registry, audit, trace}
   *
   * opts:
   *   question          the user's text
   *   dataBlock         the DATA blocks IntMap assembled (time context, coverage, layer values …)
   *   systemPrompt      the analysis system prompt WITHOUT any source/trailer instructions
   *   language          the answer language, as a name ("Japanese")
   *   temporalMode      'current' | 'historical' | 'mixed' | 'unspecified'
   *   requestedOutputs  from the request profile
   *   turnId            the #R318 turn key — the repair rides on the SAME one
   *   webMode           'off' | 'auto' | 'required'
   *   clientSources     the srcSink IntMap gathered  [{url,title,src,date,dateType,origin}]
   *   appFacts          measured values IntMap holds [{title,publisher,validTime,supportFacts:[…]}]
   *   retrievedAt       ISO stamp for this turn
   *   ask(prompt, system, opts) -> {text, meta, citations, callId}
   *   parseJSON(text)   -> object | null
   */
  async function runStructuredAnswer(opts) {
    const ask = opts.ask, parseJSON = opts.parseJSON;
    const callId = newCallId('ans');
    const registry = makeEvidenceRegistry({ callId, turnId: opts.turnId || '', retrievedAt: opts.retrievedAt || '' });
    registry.addClientSources(opts.clientSources || []);
    (opts.appFacts || []).forEach((f) => registry.addAppData(f));

    const contract = answerContractRules({ language: opts.language || 'the user\'s language' });
    const system = String(opts.systemPrompt || '') + '\n\n[ANSWER CONTRACT]\n' + contract;
    const evBlock = registry.promptBlock();
    const prompt = '[QUESTION]\n' + String(opts.question || '') + '\n\n'
      + String(opts.dataBlock || '')
      + (evBlock ? ('[EVIDENCE RECORDS — cite these ids in evidenceIds. Use ONLY these ids. They are the only sources that exist for this answer, and there are no URLs for you to write.]\n' + evBlock + '\n\n') : '');

    const trace = { callId, calls: [], evidence: registry.size() };
    const ctx = { webUsed: false, temporalMode: opts.temporalMode || 'unspecified' };

    /* ── 2) the one call ─────────────────────────────────────────────────────────────────────── */
    const first = await ask(prompt, system, {
      task: 'analysis_structured', webMode: opts.webMode || 'auto',
      callId, turnId: opts.turnId || '',
    });
    ctx.webUsed = !!(first && first.meta && first.meta.webUsed);
    registry.addProviderCitations((first && first.citations) || [], { callId: (first && first.callId) || callId, webUsed: ctx.webUsed });

    let env = normalizeAnswer(parseJSON((first && first.text) || ''), {
      turnId: opts.turnId || '', callId, text: opts.question || '', language: opts.language || '',
      temporalMode: ctx.temporalMode, requestedOutputs: opts.requestedOutputs || [],
      answerGoal: opts.answerGoal || '',
    });
    let audit = auditAnswer(env, registry, ctx);
    trace.calls.push({ callId, task: 'analysis_structured', errors: audit.errors.length, warnings: audit.warnings.length });

    /* ── 4) at most one repair, aimed at the CODES ───────────────────────────────────────────── */
    if (audit.errors.length) {
      const repairId = newCallId('rep');
      registry.allowCall(repairId);
      let second = null;
      try {
        second = await ask(prompt + '\n\n' + repairBrief(audit), system, {
          task: 'analysis_structured', webMode: 'off',
          callId: repairId, turnId: opts.turnId || '',
        });
      } catch (_) { second = null; }
      if (second && second.text) {
        registry.addProviderCitations(second.citations || [], { callId: second.callId || repairId, webUsed: !!(second.meta && second.meta.webUsed) });
        const env2 = normalizeAnswer(parseJSON(second.text), {
          turnId: opts.turnId || '', callId: repairId, text: opts.question || '', language: opts.language || '',
          temporalMode: ctx.temporalMode, requestedOutputs: opts.requestedOutputs || [],
          answerGoal: opts.answerGoal || '',
        });
        const audit2 = auditAnswer(env2, registry, ctx);
        trace.calls.push({ callId: repairId, task: 'analysis_structured', repair: true, errors: audit2.errors.length, warnings: audit2.warnings.length });
        /* ⚠ THE REPAIR IS ACCEPTED ONLY IF IT IS BETTER. A second answer with MORE findings than the
           first is not a repair; keeping it because it is newer is how a fix becomes a regression. */
        if (audit2.errors.length <= audit.errors.length) { env = env2; audit = audit2; }
      }
    }

    /* ── 5) degrade rather than show prose the audit rejected ────────────────────────────────── */
    if (audit.errors.length) {
      env = degrade(env, audit);
      trace.degraded = true;
    } else {
      env.audit = { status: 'passed', errors: [], warnings: audit.warnings };
    }
    trace.status = env.audit.status;
    return { env, registry, audit, trace, webUsed: ctx.webUsed };
  }

    const API = { MAX_MODEL_CALLS, runStructuredAnswer };
    try { window.IntMapAnswerPipeline = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}