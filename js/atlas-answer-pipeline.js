/* ============================================================================
 *  IntMap · ATLAS — ONE ANSWER, ONE CALL, ONE AUDIT — AND THE AUDIT ONLY REPORTS  (#R472)
 * ----------------------------------------------------------------------------
 *  The order matters and it is fixed here so no call site can reorder it:
 *
 *    1. build the EVIDENCE REGISTRY from what IntMap actually has — the articles it fetched, the
 *       figures it holds — and mint the callId BEFORE the call, so the registry is bound to the
 *       call that is about to happen rather than to whichever call answers last;
 *    2. ask ONCE, with the schema, showing the model evidence IDS and no URLs;
 *    3. AUDIT the structure against the registry (js/atlas-answer-audit.js) and HAND THE FINDINGS
 *       TO ATLAS. Nothing here edits, deletes or re-asks the answer.
 *
 *  ══ ⚠⚠⚠ (#R472) WHAT THIS FILE STOPPED DOING, AND WHY THAT IS THE FIX ═══════════════════════════
 *  Reported: 「岐阜県で藤の名所は」 came back as Atlas answering from its own knowledge above the
 *  banner 「裏付けを確認できなかった記述は、この回答から取り除きました」 — over an empty document.
 *
 *  #R350 gave this file two powers over the model's answer: ask AGAIN when the audit found
 *  something (step 4), and, if that also failed, REBUILD the answer in code — keep the claims that
 *  passed, delete the rest (step 5, `degrade`). Both are gone.
 *
 *  ⚠ THEY WERE MEASURED ON THE LIVE SITE BEFORE THEY WERE REMOVED. For `analysis_structured`, the
 *  hosted web search runs (`webUsed:true`, 2 searches) and the provider returns **ZERO** citation
 *  annotations — because IntMap's own ANSWER CONTRACT tells the model never to write a URL, and the
 *  annotation is attached where the model writes one. Same question, same schema, same web mode,
 *  the only difference being the contract: **with it, 0 citations; without it, 2.** So a
 *  `hosted_web` record could never enter the registry on this path, every primary claim was
 *  `evidence.primary_unsupported`, the repair (shown the same evidence list) wrote
 *  「无法核实」, and `degrade` removed every claim — leaving `directAnswer.text` empty, which the
 *  call site then reported as 「分析没有回传结果」. **The tool returned nothing at all.**
 *
 *  ⚠ THE ANSWER WAS NOT WRONG. It named 赤坂スポーツ公園, its address and its bloom season, off two
 *  real searches. What it lacked was an ID LINKING A SENTENCE TO A PAGE — and IntMap is the reason
 *  that ID cannot exist. Deleting the sentence for it punished the model for IntMap's own rule.
 *
 *  ⚠ AND THE SECOND «ANSWER» IN THE REPORT WAS THE CORRECT CONSEQUENCE OF THE FIRST. Atlas is told
 *  when an answer came back gutted (#R419) and it did the right thing: it answered the reader
 *  itself. Two answers stacked in one reply is what «code deleted the tool's answer» looks like
 *  from the outside. One cause, not two.
 *
 *  WHAT REPLACES THEM: nothing. The audit still runs, every rule intact, and its findings go to the
 *  developer trace and to Atlas — which is an AI, reads them, and decides what to say. That is the
 *  same authority #R413 restored everywhere else in Atlas, arriving here.
 *
 *  ⚠ THE READER IS NOT LESS PROTECTED. The guarantee that named #R350 — «a URL the model invented
 *  never reaches the reader as a link» — lives in the RENDERER and the REGISTRY, not here: source
 *  cards are built only from records IntMap put in, and js/atlas-answer-render.js never linkifies
 *  prose. `degrade` was not enforcing that. It was only deleting text.
 *
 *  ⚠ NOTHING HERE TOUCHES THE DOM AND NOTHING HERE CALLS THE NETWORK DIRECTLY. `ask` is injected,
 *  so tests/r472-checks.test.mjs runs the whole pipeline against a scripted model with no browser
 *  and no key.
 * ==========================================================================*/

import { makeAtlasEvidence } from './atlas-evidence.js';
import { makeAtlasAnswerContract } from './atlas-answer-contract.js';
import { makeAtlasAnswerAudit } from './atlas-answer-audit.js';

export function makeAtlasAnswerPipeline() {
  return (function () {
  const { makeEvidenceRegistry } = makeAtlasEvidence();
  const { normalizeAnswer, answerContractRules } = makeAtlasAnswerContract();
  const { auditAnswer } = makeAtlasAnswerAudit();

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
   *   turnId            the #R318 turn key
   *   webMode           'off' | 'auto' | 'required'
   *   clientSources     the srcSink IntMap gathered  [{url,title,src,date,dateType,origin}]
   *   appFacts          measured values IntMap holds [{title,publisher,validTime,supportFacts:[…]}]
   *   retrievedAt       ISO stamp for this turn
   *   ask(prompt, system, opts) -> {data?, text, meta, citations, callId}
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

    /* ⚠ (#R472) AND THE PROMPT STOPPED SAYING SOMETHING THAT WAS NOT TRUE. It used to declare the
       list below «the only sources that exist for this answer» — to a call that was about to run a
       web search, and, for any question IntMap holds no article about, of an EMPTY list. That was a
       lie the model obeyed. It is not replaced by a longer instruction: the false clause is kept
       only where it is true (no search running), and where a search IS about to run the model is
       told plainly that a page it opens has no id here and that the sentence is still worth
       writing. */
    const evBlock = registry.promptBlock();
    const searching = (opts.webMode || 'auto') !== 'off';
    const evidenceSection = evBlock
      ? ('[EVIDENCE RECORDS — cite these ids in evidenceIds. There are no URLs for you to write, and an id that is '
        + 'not listed here is a fabrication.'
        + (searching
          ? ' A page your web search opens during this call has no id here yet; cite what you can and write the rest plainly.'
          : ' They are the only sources that exist for this answer.')
        + ']\n' + evBlock + '\n\n')
      : (searching
        ? '[EVIDENCE RECORDS — none. IntMap holds no source of its own for this question. Answer from your web search '
          + 'and your own knowledge; never write a URL and never invent an id.]\n\n'
        : '');
    const prompt = '[QUESTION]\n' + String(opts.question || '') + '\n\n'
      + String(opts.dataBlock || '') + evidenceSection;

    const trace = { callId, calls: [] };
    const ctx = { webUsed: false, temporalMode: opts.temporalMode || 'unspecified' };

    /* ── 2) the one call ─────────────────────────────────────────────────────────────────────── */
    const first = await ask(prompt, system, {
      task: 'analysis_structured', webMode: opts.webMode || 'auto',
      callId, turnId: opts.turnId || '',
    });
    ctx.webUsed = !!(first && first.meta && first.meta.webUsed);
    registry.addProviderCitations((first && first.citations) || [], { callId: (first && first.callId) || callId, webUsed: ctx.webUsed });

    /* ⚠ `data` FIRST. The transport is askAIJSONEnvelope, which has already parsed this call's
       JSON; parsing `text` a second time would be a second chance to disagree with it. */
    const body = (o) => (o && o.data != null) ? o.data : parseJSON((o && o.text) || '');
    const env = normalizeAnswer(body(first), {
      turnId: opts.turnId || '', callId, text: opts.question || '', language: opts.language || '',
      temporalMode: ctx.temporalMode, requestedOutputs: opts.requestedOutputs || [],
      answerGoal: opts.answerGoal || '',
    });

    /* ── 3) audit, and REPORT ────────────────────────────────────────────────────────────────── */
    const audit = auditAnswer(env, registry, ctx);
    trace.calls.push({ callId, task: 'analysis_structured', errors: audit.errors.length, warnings: audit.warnings.length });
    env.audit = { status: audit.errors.length ? 'findings' : 'passed', errors: audit.errors, warnings: audit.warnings };
    trace.status = env.audit.status;
    trace.evidence = registry.size();
    return { env, registry, audit, trace, webUsed: ctx.webUsed };
  }

  /**
   * auditMeta(env) -> meta | null   — what the CALLER passes to Atlas when the audit found something.
   *
   * ══ ⚠ (#R419, KEPT; #R472, NARROWED) ═══════════════════════════════════════════════════════════
   * #R419's finding stands and is the reason this function exists: a tool result that hides what
   * happened leaves Atlas describing a document that is not on the screen. What changed is the fact
   * being reported. It used to be 「this answer was GUTTED — n claims removed」, because code had
   * just removed them. Nothing is removed now, so what Atlas is told is what the audit NOTICED
   * about an answer that is on the screen in full.
   *
   * ⚠ IT CARRIES CODES, NOT A VERDICT. Atlas is the reader of this, and Atlas is an AI: it can tell
   * `contradiction.superlative_beaten` (the answer argues with itself — say so) from
   * `evidence.primary_unsupported` (IntMap had no record to link — often nothing to say at all)
   * better than a severity column in this repository can.
   */
  function auditMeta(env) {
    const a = env && env.audit;
    if (!a || !a.errors || !a.errors.length) return null;
    const codes = [];
    a.errors.forEach((e) => { if (e && e.code && codes.indexOf(e.code) < 0) codes.push(e.code); });
    return { auditFindings: codes,
      unverified: 'The answer is rendered in full, as written. IntMap\'s answer audit noticed these things '
        + 'about it: ' + codes.join(', ') + '. Judge them yourself — `evidence.*` usually means IntMap held no '
        + 'record to link a sentence to, which is not a claim that the sentence is wrong; `contradiction.*`, '
        + '`series.*` and `metric.*` mean the answer disagrees with itself or with a figure IntMap holds, which '
        + 'is worth telling the reader. Do not rewrite the rendered answer; frame it.' };
  }

    const API = { runStructuredAnswer, auditMeta };
    try { window.IntMapAnswerPipeline = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
