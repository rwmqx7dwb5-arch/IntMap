/* ============================================================================
 *  IntMap · ATLAS — THE TURN LOOP: ATLAS DECIDES, INTMAP EXECUTES  (#R406)
 * ----------------------------------------------------------------------------
 *  「AtlasをIntMap全体の主体的な知能・操作レイヤーへ戻すことである。」
 *
 *  WHAT THIS REPLACES. The old turn was one shot: a request profile derived from regular
 *  expressions decided whether the message was a question, whether the map was wanted and whether
 *  the subject was present or past; a capability selector turned that into a slice of a 61 kB
 *  catalogue; the model was forced to answer `{"say":string,"actions":[]}` — there was NO shape
 *  that meant "just answer" — and `say` was required to state what had been done at a moment when
 *  nothing had been done yet. Then `_validatePlan` rewrote the actions it disagreed with, and a
 *  repair pass asked again. Atlas never saw a single execution result before it had to commit.
 *
 *  ⚠ THE DEFECT THAT NAMED THIS ROUND IS ONE LINE OF THAT. `_requestProfile`'s `wantExpl` matched
 *  `[?？]` and a list of interrogatives, so 「セーヌ川の長さは？」 was a question and
 *  「セーヌ川の長さは・」 was not. Adding `・` to the character class is the fix this round is
 *  forbidden to make: the bug is not the punctuation, it is that a regular expression was deciding
 *  what a sentence meant. Nothing here asks that question at all.
 *
 *  THE SHAPE. Atlas is given the user's words, the conversation, a compact machine-readable
 *  snapshot of IntMap's state, and a set of TOOLS. Each step it chooses one of two things:
 *
 *      · a final answer — including on the very first step, with no tool call at all; or
 *      · one or more tool calls, whose MECHANICAL results come back to it.
 *
 *  It keeps choosing until it answers or the technical ceiling is reached. The final sentence is
 *  therefore always written by something that has already seen what happened.
 *
 *  ⚠ WHAT STAYS IN CODE IS EXACTLY WHAT A MODEL CANNOT BE TRUSTED TO DO TO ITSELF: does the tool
 *  exist, do the arguments type-check, are the required ones present, how many times may this loop
 *  go round. What LEAVES is every rule about meaning. A tool call that fails to type-check is not
 *  an error the reader is shown — it is a typed rejection handed straight back to Atlas, which
 *  fixes it. The reader sees one answer, once, at the end.
 *
 *  ⚠ NO DOM, NO NETWORK, NO GLOBALS. `model` and `execute` are injected, so tests/atlas-agent-loop-checks.test.mjs (#R406)
 *  drives THIS module — the one the browser runs — against a scripted model with no browser and no
 *  key. That is the js/atlas-answer-pipeline.js pattern and it is the reason the E2E matrix in this
 *  round is not a second architecture.
 * ==========================================================================*/

import { INPUT_LIMITS } from '../supabase/functions/_shared/atlas-input-limits.js';   /* (atlas-input-limits) this budget and ai-proxy's fence, from one object */
import { atPath } from './atlas-working-memory.js';   /* (atlas-working-memory) one value at an address in an original result */
import { makeRunLedger, runLine, makeRunHistory, peakConcurrency, lateCostSink, runMarkSink, proxyUsage } from './atlas-run-ledger.js';
import { makeAtlasTurnResults } from './atlas-turn-results.js';   /* (#R489) `callKey` — the identity of one tool call, in the same terms #R441 already uses for one action */

export function makeAtlasAgent() {
  return (function () {
    const RUN_HISTORY = makeRunHistory(50);   /* (job-cost-ledger) the last turns' cost/time/models/tools, newest last */

    /* ── The technical ceilings. They bound the LOOP; they never decide what it should do. ──────
       [HISTORY — superseded by (atlas-unbounded-execution) below: there is no count now.] `maxSteps` COUNTED AGAINST A SERVER BUDGET IT DID NOT OWN. supabase/functions/ai-proxy
       charges every call carrying one `x-intmap-turn` key against TURN_MAX_CALLS — THAT constant is
       the number, and it is not written here (it was, as 「= 6」, and stayed 6 in this sentence for as
       long as the server said 12: the copy the #R413 note below warns about). What this loop spends
       of it is `maxSteps` model calls plus the ONE forced answer after the loop (`writeAnswer`
       below), and a tool Atlas runs may itself ask the model (analyze → js/atlas-answer-pipeline.js
       spends ONE; the repair that used to make it two is gone with the audit's power, #R472). The
       difference between TURN_MAX_CALLS and maxSteps + 1 is that room; the reader's LAST call — the
       sentence — must never be the one that 429s. tests/atlas-turn-engine-checks.test.mjs reads the
       server's number and holds maxSteps + 1 below it. `stopped:'transport'` below is the belt to
       these braces. */
    /* ⚠ (#R413) `maxSteps` WAS 4, AND IT WAS THE CLIENT BEING STRICTER THAN THE SERVER. The comment
       above is the reasoning that produced it, and it is the reasoning this round is told not to
       repeat: rather than raise the budget it was written against, it lowered Atlas's. Four steps
       INCLUDING the sentence means a turn may look, act, check and speak — and no more, so
       「現在地から大阪駅まで」 (locate → find the router → route → answer) fits with nothing left over,
       and any repair at all runs the turn out. The budget it was rationing is TURN_MAX_CALLS in
       supabase/functions/ai-proxy, which this round raises to 12 in the same commit. Atlas gets the
       room; the ceiling stays only as the runaway-loop backstop it was meant to be.
       「制限を増やす方向、例外を増やす方向に持っていくな」 — CONSTITUTION.md §5. */
    /* ══ ⚠⚠⚠ (#R452) …AND THE ONE CEILING THAT WAS MISSING WAS THE CLOCK ══════════════════════════
       Every ceiling above counts something. None of them measured TIME, and `out = await execute(call)`
       below had no deadline of any kind — so a turn's length was the sum of whatever the network felt
       like doing, with no upper bound at all. Measured on the live site: an evidence fetch walked
       three CORS relays at 9 s each with the clock cleared at the headers, `analyze` made half a
       dozen of those, the calls in one step are awaited one after another, and a step may carry
       eight of them. 8 × 8 × (a relay having a bad afternoon) is not a number — it is 「ずっと
       Searching」, which is what was reported.
       ⚠ THIS TAKES NOTHING FROM ATLAS (CONSTITUTION.md §5), and it is deliberately NOT a smaller
       world: no source is dropped, no tool is withheld, no count is lowered. They exist so that the
       ONE thing the reader is owed — an answer, even if the answer is 「これは取れなかった」 —
       always arrives. A turn that never ends tells them nothing at all.

       ⚠⚠⚠ AND THE NUMBERS ARE MEASURED, NOT PICKED. The first draft of this round wrote 45 s and
       180 s, on the assumption that a healthy turn takes about ten seconds. Then the live site was
       measured: ONE ordinary turn about an open news article took **191 s**, spending FOUR ai-proxy
       calls of 8.1 / 51.2 / 48.9 / 17.2 s — and the slowest single call seen was **73.2 s**. A tool
       call is worse still, because `analyze` spends one of those (two, before #R472 removed the
       repair) plus its 32 s evidence gather plus a 20 s pinning pass: roughly 200 s for ONE tool
       call that is working perfectly. Both first drafts would therefore
       have fired on turns that were about to succeed, replacing a good answer with a degraded one —
       which is precisely the 「制限を増やす方向」 this round was told not to take. The values below
       clear the measured worst case with room, and nothing else decides them. */
    /* ══ ⚠⚠⚠ (atlas-unbounded-execution, 2026-11-24, the user's decision) NO FIXED COUNT DECIDES HOW LONG ATLAS WORKS ══
       Everything above is the history of the numbers that stood here — maxSteps 8, maxToolCalls 32, maxPerStep 8,
       maxOutputGate 2, turnBudgetMs 600 s — and of each being raised when it was found cutting off a turn that was
       about to succeed. They were budgets dressed as safety: measured on production 2026-11-21
       (dev-notes/2026-11-21-atlas-task-completion.md) the semiconductor-siting request spent ~3 minutes on a
       plan-only step and was then forced to write an answer by the call budget, with nothing fetched and nothing
       drawn. CONSTITUTION.md §5: 「何手まで考えてよいかを、コード側の定数で先に削らない」.
       WHAT NOW STOPS A TURN — each a FACT, not a count:
         · Atlas finishing (`answered`), asking the reader (`awaiting_user`), or the reader's Stop (`aborted`);
         · NO PROGRESS: the same already-answered call again (`repeated_calls`, maxRepeatSteps) or nothing but
           rejected calls (`malformed_limit`, maxMalformed). Those two numbers count consecutive steps in which
           nothing new happened — they say «the loop KNOWS nothing new is coming», never «enough work»;
         · MONEY: ai-proxy's per-request family fence and per-account day fence refuse a call (`budget`) —
           supabase/functions/ai-proxy/config.ts TURN_COST_CAP_USD and _shared/plans.js aiUsdPerDay are the
           canonical numbers, and they are not written here;
         · one tool call past `toolTimeoutMs` is told it did not finish (Atlas chooses again; the turn goes on).
       The count/clock keys below are still honoured when a CALLER passes them in `opts.limits` (the node checks
       drive scripted models with them); by default they are absent — Infinity / 0 — and bound nothing. */
    const LIMITS = {
      maxSteps: Infinity,      /* model calls in one turn — no count (a caller may pass one) */
      maxToolCalls: Infinity,  /* tool calls in one turn — no count */
      maxPerStep: Infinity,    /* tool calls accepted from a single model reply — every call the model made runs */
      maxMalformed: 3,      /* consecutive steps that produced nothing but rejected calls */
      /* consecutive steps in which EVERY call was the identical, already-answered call of this turn.
         Measured on production (2026-09-15, the configured model, 「ISSは今どこ？」): the model was handed the
         full result and the note 「this turn has ALREADY made this exact call — use this result」 and
         replied with the same call seven more times, never a final text; the step budget ran out and the
         reader got the results with no sentence. Two identical steps in a row is the earliest moment the
         loop can KNOW nothing new is coming — the turn then goes straight to the answer. ⚠ This takes
         nothing from Atlas (CONSTITUTION.md §5): a call that asks anything different is not counted. */
      maxRepeatSteps: 2,
      /* (#R511→#R543) how many times a final that DECLARED an output it has not produced is handed back. No count:
         a bounce is repeated only while something changed since the last one (a tool ran, or the reply's own text
         moved) — the same contradiction handed back to the same unchanged reply is no progress, and is accepted as it
         stands (see `lastBounce` in runTurn). */
      maxOutputGate: Infinity,
      toolTimeoutMs: 240000,  /* (#R452) ONE tool call — above the ~200 s a working `analyze` can cost. Past it Atlas is TOLD it did not finish, and chooses again */
      turnBudgetMs: 0,        /* (atlas-unbounded-execution) no turn clock: a turn that keeps finishing steps keeps working. Each step is bounded on its own — a tool by toolTimeoutMs, a model call by ai-proxy's provider budget (_shared/ai-provider.js providerBudgetMs) — so a turn cannot hang; a caller may still pass one */
      /* (atlas-turn-engine) how many functions one model call may DECLARE — the base tools, the ones
         promoted from find_capability this turn, and read_result on a step whose input was cut.
         OBSERVED: it is not this loop's number. supabase/functions/ai-proxy drops every function past
         MAX_FN_TOOLS (64) and counts it as `droppedTools`; a promotion past that line would be offered
         here and silently absent at the provider. CANONICAL: ai-proxy's MAX_FN_TOOLS —
         tests/atlas-turn-engine-checks.test.mjs holds the two equal. EXPIRES WHEN that constant moves.
         ⚠ NOTHING IS WITHHELD BY IT: a capability not promoted is still one run_capability away, and
         the result that found it says so. */
      maxOfferedTools: 64,
    };

    /* ── THE WIRE SHAPE OF ONE STEP ────────────────────────────────────────────────────────────
       A reply is the provider's own function calls plus what the model WRITES, and either may be the
       whole reply. `final_text` alone ends the turn — the shape the old PLAN_SCHEMA had no way to
       express, which is why every ordinary question had to be dressed up as an `answer` action.
       ⚠ (atlas-legacy-protocol-removal) THE CALLS ARE NOT IN WHAT THE MODEL WRITES. Until 2026-10-01
       a second transport existed — the calls written into the JSON as `tool_calls[].arguments_json`,
       for an ai-proxy that predated protocol 2 — and was reached only by observing such a proxy.
       Every deployed ai-proxy speaks protocol 2 on all three providers, so it was removed; a reply
       that still writes calls into its JSON is read by `readReply` as `callsInText` and handed back
       by the output gate in runTurn (nothing ran — said, not dropped). */
    /* ══ ⚠⚠⚠ (#R511) `answer_mode` — THE MAP AS AN OUTPUT MODALITY, DECLARED BY ATLAS ═════════════
       #R406 removed «do not finish a location-rich answer having mapped nothing» because a place
       NAME is not a reason to draw (「フランス革命はなぜ起きたのか」 names Paris and wants prose), and
       left whether to use the map to Atlas. Correct — and it left the other half empty: a turn that
       DECIDED the map carried part of its answer could still end with the map untouched, and the
       loop had no way to notice, because `final_text` says nothing about the map. Measured on the
       ordinary shape 「Xを地理的に説明して」: the model writes the paragraph in its head, returns it on
       step 0, and IntMap counts that as a complete turn. It was.
       `answer_mode` is Atlas SAYING which kind of answer this is — "text" (the map is untouched),
       "map" (the map IS the answer; the words frame it), or "mixed" (both carry it). The loop does
       not decide it, suggest it, or infer it from words. What it does is hold Atlas to its OWN
       declaration, exactly as `reject()` holds a call to its own tool's schema: a "map"/"mixed" reply
       arriving before anything this turn changed the map is handed back as a typed note
       (`map_not_drawn`), and Atlas chooses again — draw now, or answer as "text" and say why. That
       is a consistency check between two things the model said, not a rule about meaning. */
    /* ══ ⚠⚠ (#R543) THE MAP WAS THE FIRST OUTPUT, NOT THE ONLY ONE ═══════════════════════════════
       "chart" joins the vocabulary, and the gate below stops being about maps. The wrong way to add
       it would have been a second flag and a second bounce beside the first — CONSTITUTION.md §5
       calls that accumulation by its result, 「互いに矛盾する門が増え、どれが効いたのか誰にも言えなく
       なる」. So there is ONE gate over a set: a declaration names the outputs that would satisfy it,
       and a final is held to whichever it named. "mixed" means "the words are not the whole answer"
       and is satisfied by EITHER — a widening, so nothing it accepted before is refused now. */
    const ANSWER_MODES = ['text', 'map', 'chart', 'mixed'];
    const MODE_NEEDS = { map: ['map'], chart: ['chart'], mixed: ['map', 'chart'] };
    /* the typed note each unmet declaration comes back as. "map_not_drawn" is #R511's spelling and
       stays exactly that, because it is the one a reader of the transcript already knows. */
    const GATE_CODE = { map: 'map_not_drawn', chart: 'chart_not_drawn', mixed: 'output_not_produced' };
    /* ── (#R802) THE STOPS THAT MEAN «THE TURN RAN OUT», AS OPPOSED TO «ATLAS FINISHED». Every value
          here is one this loop sets when a ceiling closed the turn; 'answered' is Atlas deciding it
          is done, and 'aborted' / 'transport' / 'awaiting_user' each already carry their own meaning
          to the reader. ⚠ THIS IS THE SET js/atlas-console.js KEEPS ITS OWN COPY OF (`__atlCut`,
          which decides whether the working-limit note goes under the reply): it is exported below so
          that copy can be retired into a read of this one rather than drifting from it. */
    /* (atlas-unbounded-execution) `budget`: the server refused the next call for money — the request family's or the
       account's day fence (ai-proxy `turn_cost` / `day_cost`) or the project's day ceiling (`provider_quota`). The
       first three are reachable only when a caller passes the matching key in opts.limits. */
    const CUT_STOPS = { step_budget: 1, call_budget: 1, time_budget: 1, repeated_calls: 1, malformed_limit: 1, budget: 1 };
    const BUDGET_CODES = { turn_cost: 1, day_cost: 1, provider_quota: 1, spend_ceiling: 1, turn_calls: 1 };   /* turn_calls: only when an operator set a numeric call bound */
    /* ── WHAT ONE RESULT ACTUALLY PRODUCED. js/atlas-toolsurface.js stamps `producedModes` on a call
          whose capability completed, from its registry `produces` column — so the loop reads a fact,
          never a tool's name. ⚠ `changedMap` is #R511's name for the map member of exactly this set
          and is still honoured: it is what a caller driving runTurn with its own `execute` sets, and
          demoting it to "the old way" would break the contract those callers were given. ────────── */
    function producedBy(r) {
      /* (atlas-result-delivery) A PARTIAL IS `ok:false` ON THE REAL PATH (js/atlas-results.js toLegacy: ok = status==='completed') AND CAN
         STILL HAVE PUT THINGS ON THE MAP — js/atlas-toolsurface.js stamps `producedModes` on a partial the verifier saw something of, and
         never on a failure. `ok === false` alone therefore erased five markers that were really there and bounced the answer as map_not_drawn. */
      if (!r || (r.ok === false && r.status !== 'partial')) return [];
      const out = Array.isArray(r.producedModes) ? r.producedModes : [];
      return (r.changedMap === true && out.indexOf('map') < 0) ? out.concat(['map']) : out;
    }
    /* (atlas-result-delivery) the outputs a call that RAN BUT COULD NOT BE SEEN would have produced (js/atlas-toolsurface.js stamps them from the
       registry's `produces`). Not a claim that they appeared — `producedBy` never counts them — only the fact that the call was made, so the
       output gate does not send the model back to make the same call again, which the unobserved note tells it not to do. */
    function ranBy(r) { return (r && r.status === 'unobserved' && Array.isArray(r.unobservedModes)) ? r.unobservedModes : []; }
    /* ── (atlas-completion) WHAT A FAILURE SAID ABOUT ITSELF, KEPT. The transport (js/ai-core.js) puts
          the server's `code`, the HTTP `status` and whether the server called it `retryable` on the
          Error it throws; the message alone flattened all three into one sentence, so a turn that
          ended on a refusal and one that ended on a 503 read the same afterwards. Absent is null —
          never a guess at what the transport would have said. */
    function errorInfo(e) {
      const o = (e && typeof e === 'object') ? e : {};
      return { code: o.code != null ? String(o.code) : null, status: Number.isFinite(+o.status) && o.status != null ? +o.status : null,
        retryable: typeof o.retryable === 'boolean' ? o.retryable : null, message: String((o.message) || (e ? String(e) : '') || 'model error') };
    }
    /* ── (atlas-mainloop-reliability) WHAT TO SAY WHEN A LATER STEP'S MODEL CALL FAILED. A turn that already ran tools and then lost
          its next model call stops as 'transport' with no written answer; the screen said «No written answer this time», which names no
          cause and reads as Atlas choosing silence. trace.transportErrorInfo (errorInfo above) holds the cause — the sentence js/ai-core.js
          wrote for the server's code (rate limit, provider down, quota …), the code, and whether sending again can help — and nothing read
          it. `L` is the console's picker (en, jp). Returns '' for any other stop, so the caller's own sentence stands. */
    function transportSay(out, L) {
      if (!out || out.stopped !== 'transport') return '';
      const info = (out.trace && out.trace.transportErrorInfo) || {};
      const why = String(info.message || (out.trace && out.trace.transportError) || '').trim();
      const head = L('The AI request failed partway, so this answer stopped.', 'AI への問い合わせが途中で失敗したため、ここで回答が止まりました。');
      const tail = info.retryable === false ? '' : L(' Sending the question again usually works.', ' もう一度送ると通ることが多いです。');
      const have = out.results && out.results.length ? L(' What was gathered before it failed is below.', ' 失敗するまでに集めた結果は下にあります。') : '';
      return head + (why ? ' (' + why + ')' : '') + tail + have;
    }
    /* ── (atlas-completion) WHETHER THE TURN DELIVERED WHAT IT DECLARED. Two declarations, each held
          against the machine's record of the same thing — never against the prose:
          · `answer_mode` against `produced` — by the SAME rule the output gate uses (MODE_NEEDS read
            with `some`, so "mixed" is met by a map OR a chart, as it always was); a declaration the
            gate's bounces could not bring to life is listed rather than accepted as answered.
          · the plan Atlas declared or moved THIS turn against each step's observed state
            (js/atlas-plan.js stepState): a step is met only when it was observed completed, or was
            current and needed no call (noop). Every other state is a step the turn did not deliver.
          The list is the fact; `completion` is its one-word reading for a caller that wants one. */
    /* (atlas-goal-verifier) the last thing the reader said, as text — what the independent reader is asked about */
    function lastUserText(messages) {
      const ms = Array.isArray(messages) ? messages : [];
      for (let i = ms.length - 1; i >= 0; i--) { const m = ms[i]; if (m && m.role === 'user') return typeof m.content === 'string' ? m.content : ''; }
      return '';
    }
    function unmetOf(answerMode, produced, planSnap, ran, verified) {
      const out = [];
      const asked = MODE_NEEDS[answerMode] || null;
      /* ⚠ THE SAME RULE THE OUTPUT GATE USES (`made`, below): a call that RAN and could not be seen is a call that was made. The gate accepted it
         and this list then reported the map as «not done» over a drawing the reader was looking at (one-pass-or-a-reason §2 ①). */
      if (asked && !asked.some((m) => produced.indexOf(m) >= 0 || (ran || []).indexOf(m) >= 0)) {
        out.push({ kind: 'output', mode: answerMode, code: GATE_CODE[answerMode] || 'output_not_produced' });
      }
      if (planSnap && planSnap.thisTurn && Array.isArray(planSnap.steps)) {
        planSnap.steps.forEach((st) => {
          if (st && st.requirements?.length) {
            st.requirements.filter((r) => r.state !== 'completed').forEach((r) => {
              out.push({ kind: 'goal', id: r.id, need: r.label, state: r.state, callId: r.callId });
            });
            return;
          }
          /* ⚠ A STEP NOBODY FILED A CALL UNDER IS NOT AN OBSERVED FAILURE. 'pending' is «no operation was attributed to this step», and the ledger
             cannot tell «skipped» from «done under the step that was current» (a model that drew everything in step 1 and never moved
             `current` leaves steps 2..n pending while the map is complete). A reader was told 「完了していないもの: 計画の手順 2」 over a finished
             drawing. What IS observed — a call that failed, stayed partial, was not confirmed, is waiting or was stopped — is still listed. */
          /* 'unobserved' is «it ran and its effect could not be seen» — not a failure, and the output gate (`made`) counts a call that ran as made;
             the list used to say «not completed» over a step that had run (one-pass-or-a-reason §5: not observed is not failed) */
          if (!st || st.state === 'completed' || st.state === 'noop' || st.state === 'pending' || st.state === 'unobserved') return;
          if (verified) return; /* the independent reader observed the requested outputs, including work done under another step */
          const missing = (st.workItems || []).filter((o) => o.work && o.state !== 'completed' && o.state !== 'unobserved');
          if (missing.length) missing.forEach((o) => out.push({ kind: 'goal', need: st.title + ' · ' + o.work, state: o.state, why: o.code }));
          else out.push({ kind: 'step', n: st.n, title: st.title, state: st.state });
        });
      }
      return out;
    }
    /* ══ ⚠⚠⚠ (#R663) THE END OF A TURN WAS EXPRESSED BY OMISSION, AND THE ANSWER WAS WRITTEN FIRST ══
       Measured on the live site, logged in, with the request body read off the wire: 「東北沖でM9の
       地震が起きたときの津波の伝播をシミュレーションして見せて」 came back as ONE model call, ZERO tool
       calls, and the sentence 「まず、利用可能な津波シミュレーション機能の設定を確認します。」 — a reply
       that NAMES the capability it is about to reach and then ends the turn without reaching it.
       `window.IntMapTsunami` stayed undefined. #R582's capability index was in that prompt and was
       not the problem: the existence of the tool was recognised in the sentence itself.

       TWO THINGS IN THE WIRE SHAPE MADE THAT REPLY WELL FORMED.

       ① `final_text` was the FIRST property of the schema, and a strict json_schema is generated in
          property order — so every step wrote the reader's sentence BEFORE it reached `tool_calls`,
          and by then it had already committed to prose framed as a whole reply. The order below is
          now the order of the decision: what this reply IS, then what it DOES, then what it says.
          Nothing is forbidden by this; the same reply is still expressible. It is generated in the
          order it is decided in.
       ② There was no way to say 「これは答えではなく、途中である」. The turn ended when `tool_calls`
          came back empty — the CHEAPEST thing a model can emit — so "I am about to act" and "I am
          done" were the same wire state, and the only place left to put the intention was the
          sentence the reader gets. `turn` is Atlas SAYING which of the two this reply is. The loop
          neither infers it nor reads a word of the prose: it holds Atlas to its own declaration,
          exactly as `answer_mode` above is held to what the results actually produced, and by the
          SAME gate — a declared "continuing" that issued no calls comes back as a typed note.
       ⚠ IT IS NOT REQUIRED (see `required` below, unchanged). A model that never declares it behaves
          exactly as it did before, and no reply Atlas could make is refused — CONSTITUTION.md §5. */
    const TURN_STATES = ['final', 'continuing'];
    /* the effort words ai-proxy reads in `effortHint` (js/atlas-effort.js MODES without 'auto') */
    const NEXT_EFFORTS = ['low', 'medium', 'high', 'xhigh'];
    /* ══ ⚠⚠⚠ (atlas-native-tools) THE CALLS LEFT THE ENVELOPE; THE DECLARATIONS DID NOT ════════════════════════
       With native function calling the provider carries the calls as `function_call` items, each with
       its own id. What is left for the message itself is exactly what #R511 / #R663 / #R742 hold a
       final to — what this reply IS, what KIND of answer it is, and the words. In the order of ① above,
       the calls sit between the first and the last of these: they are the provider's items, decided
       before the words are written.
       ⚠ (atlas-legacy-protocol-removal) This was derived from a TURN_SCHEMA that also carried
       `tool_calls`, the shape of the one-string transport; with that transport gone, this is the one
       schema, and `turn`'s description names the function calls rather than a field that no longer
       exists — the sentence SYS() already said ("function calls") and the schema did not. */
    const FINAL_SCHEMA = {
      type: 'object',
      required: ['final_text'],
      properties: {
        turn: { type: 'string', enum: TURN_STATES,
          description: 'What THIS reply is. "final": final_text is the complete answer and the turn ends here. '
            + '"continuing": final_text is NOT the answer yet — the work continues in function calls, which must not be '
            + 'empty. A reply that says what you are about to do is "continuing", and the calls that do it belong in '
            + 'this same reply.' },
        answer_mode: { type: 'string', enum: ANSWER_MODES },
        /* (atlas-unbounded-execution) WHAT ATLAS'S NEXT REPLY NEEDS, DECLARED BY ATLAS. Effort was decided once, before the
           turn began (js/atlas-effort.js), and the output allowance was a per-task constant — so a turn that turned out to
           need a long synthesis, or a hard comparison after an easy lookup, had no way to say so. Both are optional; absent
           = the turn's own effort and the task's standard allowance, exactly as before. The server bounds the allowance by
           the model's documented maximum and the spend fence (supabase/functions/ai-proxy). */
        next_effort: { type: 'string', enum: NEXT_EFFORTS,
          description: 'Optional. How hard your NEXT reply should think: "low" for a mechanical step, "high"/"xhigh" for a hard '
            + 'synthesis, comparison or calculation. Omit to keep the current effort.' },
        next_output_tokens: { type: 'integer', minimum: 1,
          description: 'Optional. How many output tokens your NEXT reply needs, when it will write something long (a report, '
            + 'a long comparison, a document). Omit for an ordinary reply.' },
        /* (atlas-ui-parts) THE CHANNEL FOR TALKING TO INTMAP THAT IS NOT THE READER'S TEXT. IntMap's own checks (the goal reader,
           the output gate) end by inviting Atlas to «reply again with the answer as it stands and say why» — and the only
           place a reply had to say it was final_text, which is what the reader is shown. So the verifier's conversation
           surfaced as 「4つの区画が面として表示されているため、描き直しは不要です」 inside an answer about the Habsburg
           empire. The fix is structural: the reply now HAS a place for that sentence, and the notes name it. */
        note_to_intmap: { type: 'string',
          description: 'Optional. A message to IntMap itself, NEVER shown to the reader: why you are not redoing something a check '
            + 'note asked for, or any remark about the process of this turn. final_text is read by the reader alone and must read '
            + 'as the answer to their question, with no mention of checks, redrawing or what you verified.' },
        final_text: { type: 'string' },   /* LAST: the words are written after what the reply is and does is decided (#R663 ②) */
      },
    };

    /* ══ ⚠⚠⚠ (atlas-native-tools) THE INPUT IS ITEMS, AND NOTHING IS CUT WITHOUT SAYING SO ════════════════════
       MEASURED before this: js/atlas-console.js built ONE string per step — map state, pinned point,
       working context, place ledger, the last 48 lines of conversation, [REQUEST], then [THIS TURN SO
       FAR] with every call and every result as JSON — and supabase/functions/ai-proxy took
       `.slice(0, 24_000)` of it. The END is what went: this turn's own results, and on a long
       conversation the request itself. find_capability alone returns 10,441 characters at the median
       and 39,235 at the largest of 20 ordinary queries (measured with the real registry and the real
       catalogue text, 2026-09-25), so ONE search could push everything after it off the end, and
       nothing told the model or the reader. That is one-pass-or-a-reason §2's second cause — «the
       result was not carried back» — produced by the transport, not by Atlas.
       NOW: each piece of the input is an ITEM, and the budget is spent per item, in this order of
       what may be given up:
         1. the oldest conversation history, whole messages, replaced by ONE item that says how many
            and how large — never silently;
         2. this turn's OLDER tool results squeezed to `squeezed` characters each, oldest first, each
            saying so and how to read the rest;
         3. nothing else. The request and the latest step's results are never cut or dropped; if they
            alone exceed `total`, the input goes over and the proxy's own (larger) fence is the last
            line — and it, too, reports what it did.
       One result bigger than `item` is cut INSIDE its item, with its full size and the call that
       reads on (`read_result`) written after the fence, where the model reads it as IntMap speaking.
       OBSERVED: item 48,000 keeps every one of the 20 measured find_capability results whole (max
       39,235); total 240,000 is an ESTIMATE — six such results plus a full 48-line history plus the
       state blocks, inside a 400k-token context at ~1 character per token for CJK text.
       EXPIRES WHEN: find_capability's documentation grows past `item`, or the model's context window
       changes. CANONICAL: here; ai-proxy's MAX_INPUT_CHARS / MAX_ITEM_CHARS are set ABOVE these so a
       conforming client never reaches them (tests/atlas-native-tools-checks.test.mjs holds both). */
    /* (atlas-input-limits) the numbers live in supabase/functions/_shared/atlas-input-limits.js beside the proxy's, and the budget is now
       counted in ITEMS as well as characters (`items`): ④ and ⑤ below. */
    const INPUT_BUDGET = INPUT_LIMITS.CLIENT;
    /* The one tool the LOOP owns rather than the app: reading the rest of a result that was cut. It is
       offered only on a step whose input actually cut something (js/atlas-console.js adds it), so an
       ordinary turn's tool list — the part of the prompt a provider caches — is unchanged by it. */
    const READ_RESULT_TOOL = {
      name: 'read_result',
      description: 'Read a tool result back whole: one of THIS turn that was cut to fit (pass the call_id and the offset the cut note gives), or one kept in [ATLAS WORKING MEMORY] from an earlier turn (pass its ref, e.g. t3.call_2). Add path (e.g. rows[2].value) to read ONE value from it; call_id "memory" reads the whole working-memory record.',
      parameters: { type: 'object', required: ['call_id'],
        properties: { call_id: { type: 'string', minLength: 1 }, offset: { type: 'integer', minimum: 0 }, path: { type: 'string' } } },
    };
    /* The text one result is represented by — the SAME function the composer cuts and read_result
       reads from, so an offset in a cut note means the same character in both. */
    function resultText(rec) {
      if (rec && rec.readResult === true) {
        return 'read_result ' + rec.call_id + ': characters ' + rec.offset + '-' + (rec.offset + String(rec.text || '').length)
          + ' of ' + rec.total + (rec.next != null ? ' (continue with offset ' + rec.next + ')' : ' (this is the end)') + ':\n' + String(rec.text || '');
      }
      try { return JSON.stringify(rec); } catch (_) { return String(rec && rec.message || ''); }
    }
    function itemChars(it) {
      if (!it) return 0;
      if (it.type === 'function_call') return String(it.arguments || '').length + String(it.name || '').length;
      if (it.type === 'function_call_output') return String(it.output || '').length;
      if (it.type === 'message') return String(it.content || '').length;
      if (it.type === 'reasoning') return String(it.encrypted_content || '').length;
      return 0;
    }

    /**
     * composeInput(o) -> { input, requestIndex, tools, trim }
     *
     *   o.history     [{role:'user'|'assistant', content}] — earlier turns, oldest first
     *   o.request     the request item's text (the state blocks + [REQUEST] …), fixed for the turn
     *   o.transcript  runTurn's `messages` (its first user message IS the request and is skipped)
     *   o.tail        what changes step by step (the current state, the frames …) — last, so the
     *                 prefix a provider caches stays byte-identical from one step to the next
     *   o.fence       js/atlas-policy.js's turnMechanics.fence — who is speaking
     *   o.budget      INPUT_BUDGET by default
     *
     * PURE: no DOM, no network. tests/r809 evaluates it.
     */
    /* historyItems(hist) -> [{role, content, outside}] — js/atlas-console.js's rolling history ({t, s, o}: the turn, the
       line, and whether that turn had outside content in front of the model) as composeInput reads it. The line's own
       prefix says who wrote it ('User: ' / 'Atlas: '); `o` is set by the console from the turn record, never from the text.
       (atlas-outside-mark) moved here from the console so the node checks run the same mapping the browser does. */
    function historyItems(hist) {
      return (Array.isArray(hist) ? hist : []).map(function (x) {
        const s = String((x && x.s) || '');
        if (s.indexOf('User: ') === 0) return { role: 'user', content: s.slice(6), outside: !!(x && x.o) };
        return { role: 'assistant', content: s.indexOf('Atlas: ') === 0 ? s.slice(7) : s, outside: !!(x && x.o) };
      });
    }

    function composeInput(o) {
      o = o || {};
      const B = Object.assign({}, INPUT_BUDGET, o.budget || {});
      const wrap = (o.fence && typeof o.fence.wrap === 'function') ? o.fence.wrap : function (s) { return String(s); };
      const histIn = (Array.isArray(o.history) ? o.history : []).filter(function (h) { return h && String(h.content || '').trim(); });
      const hist = histIn.map(function (h) { return { type: 'message', role: h.role === 'user' ? 'user' : 'assistant', content: String(h.content) }; });
      /* (atlas-outside-mark) which history items were written while outside content was in front of the model — read below,
         after the budget, so an item that was left out to fit does not count */
      const histOutside = histIn.map(function (h) { return h.outside === true; });
      const tr = Array.isArray(o.transcript) ? o.transcript : [];
      const turnMsgs = tr.slice((tr.length && tr[0] && tr[0].role === 'user') ? 1 : 0);
      const turnItems = [];
      const turnStep = [];        /* (atlas-input-limits) the step each turn item belongs to (0 = a note before any step), parallel to turnItems */
      const outs = [];            /* {item, full, callId, stepNo} — the results, in order, for the budget below */
      const issued = Object.create(null);
      let stepNo = 0;
      turnMsgs.forEach(function (m) {
        if (!m) return;
        if (m.role === 'assistant') {
          stepNo++;
          if (Array.isArray(m.items) && m.items.length) {
            /* the provider's own items, replayed as it wrote them (reasoning included) */
            m.items.forEach(function (it) { if (it && it.type) { turnItems.push(it); turnStep.push(stepNo); if (it.type === 'function_call' && it.call_id) issued[it.call_id] = true; } });
          } else {
            if (String(m.content || '').trim()) { turnItems.push({ type: 'message', role: 'assistant', content: String(m.content) }); turnStep.push(stepNo); }
            (Array.isArray(m.toolCalls) ? m.toolCalls : []).forEach(function (c) {
              if (!c || !c.id) return;
              issued[c.id] = true;
              turnItems.push({ type: 'function_call', call_id: String(c.id), name: String(c.name || ''), arguments: JSON.stringify(c.arguments || {}) }); turnStep.push(stepNo);
            });
          }
        } else if (m.role === 'tool') {
          const orphans = [];
          (Array.isArray(m.content) ? m.content : []).forEach(function (r) {
            if (r && r.id && issued[r.id]) {
              const it = { type: 'function_call_output', call_id: String(r.id), output: '' };
              outs.push({ item: it, full: resultText(r), callId: String(r.id), stepNo: stepNo });
              turnItems.push(it); turnStep.push(stepNo);
            } else if (r) orphans.push(r);
          });
          /* a note that answers no call (the output gate's bounce) is IntMap's record of this turn, and
             travels fenced exactly as it did inside [THIS TURN SO FAR] */
          if (orphans.length) { turnItems.push({ type: 'message', role: 'user', content: 'IntMap observed: ' + wrap(resultText(orphans.length === 1 ? orphans[0] : orphans)) }); turnStep.push(stepNo); }
        } else if (String(m.content || '').trim()) {
          turnItems.push({ type: 'message', role: 'user', content: String(m.content) }); turnStep.push(stepNo);
        }
      });

      const trim = { droppedHistory: 0, droppedHistoryChars: 0, truncated: [], squeezed: [], foldedSteps: 0, foldedItems: 0 };
      /* ① one result bigger than an item is cut inside it, and says so after the fence */
      const cut = function (e, keep, list) {
        const full = e.full;
        if (full.length <= keep) { e.item.output = wrap(full); return; }
        e.item.output = wrap(full.slice(0, keep)) + '\n[CUT BY INTMAP TO FIT — this result is ' + full.length
          + ' characters and characters 0-' + keep + ' are above. Nothing was lost: call read_result with {"call_id":"'
          + e.callId + '","offset":' + keep + '} to read on.]';
        list.push({ call_id: e.callId, total: full.length, shown: keep });
      };
      outs.forEach(function (e) { cut(e, B.item, trim.truncated); });

      const reqItem = { type: 'message', role: 'user', content: String(o.request || '') };
      const tailItem = String(o.tail || '').trim() ? { type: 'message', role: 'user', content: String(o.tail) } : null;
      const sum = function (arr) { return arr.reduce(function (a, it) { return a + itemChars(it); }, 0); };
      /* (atlas-working-memory) the structured record of this job — goal, decisions, results by ref, figures, sources, what is open.
         It is NOT history: it is not trimmed with it, so it is counted in `fixed` and sits before the request. Built once per turn
         (js/atlas-working-memory.js block), so the prefix a provider caches stays the same bytes from step to step. */
      const memText = String(o.memory || '').trim();
      const memItem = memText ? { type: 'message', role: 'user', content: memText } : null;
      /* (atlas-mainloop-reliability) THE PART THAT DOES NOT CHANGE GOES FIRST. A provider's prompt cache is a PREFIX match. The request item
         starts with the map state, which differs every turn, and the layer names and the delegation policy — the same for the whole
         session — sat behind it, so nothing after the first byte of a turn could be reused by the next. They are one item now, before the
         history, so the cached prefix is instructions + functions + this block however far the history has slid. */
      const stableText = String(o.stable || '').trim();
      const stableItem = stableText ? { type: 'message', role: 'user', content: stableText } : null;
      const fixed = (stableItem ? itemChars(stableItem) : 0) + itemChars(reqItem) + sum(turnItems) + (tailItem ? itemChars(tailItem) : 0) + (memItem ? itemChars(memItem) : 0);
      /* ② the oldest history goes first, whole messages, and ONE item says what went */
      let kept = hist.slice();
      while (kept.length && (fixed + sum(kept)) > B.total) {
        const gone = kept.shift();
        trim.droppedHistory++; trim.droppedHistoryChars += itemChars(gone);
      }
      /* ③ still over: this turn's OLDER results are squeezed — the latest step's never are */
      if (fixed + sum(kept) > B.total) {
        let over = fixed + sum(kept) - B.total;
        for (let i = 0; i < outs.length && over > 0; i++) {
          const e = outs[i];
          if (e.stepNo === stepNo || e.full.length <= B.squeezed) continue;
          const before = itemChars(e.item);
          trim.truncated = trim.truncated.filter(function (t) { return t.call_id !== e.callId; });
          cut(e, B.squeezed, trim.squeezed);
          over -= (before - itemChars(e.item));
        }
      }
      /* ④ (atlas-input-limits) STILL OVER: THE LATEST STEP'S RESULTS ARE SQUEEZED TOO. They were exempt, so a reply of twelve 45,000-character
         answers composed to 540,700 characters with `cut:false` and the proxy refused the whole turn (`too_large`) — the reader got nothing and
         the model never saw any of them. A result squeezed here is cut the way every other one is: its first characters are in front of the
         model and the note after the fence gives the offset `read_result` reads on from, so nothing is lost, it is one call away. The
         largest goes first and each keeps at least `squeezed`; what is given up is said in trim.squeezed. */
      const fixedNow = function () { return (stableItem ? itemChars(stableItem) : 0) + itemChars(reqItem) + sum(turnItems) + (tailItem ? itemChars(tailItem) : 0) + (memItem ? itemChars(memItem) : 0); };   /* ③ changed what the turn's items weigh */
      if (fixedNow() + sum(kept) > B.total) {
        let over = fixedNow() + sum(kept) - B.total;
        const latest = outs.filter(function (e) { return e.stepNo === stepNo; }).sort(function (a, b) { return itemChars(b.item) - itemChars(a.item); });
        for (let i = 0; i < latest.length && over > 0; i++) {
          const e = latest[i];
          const before = itemChars(e.item);
          if (before <= B.squeezed) continue;
          const keep = Math.max(B.squeezed, Math.min(e.full.length, before) - over - 400);   /* 400: the cut note's own length */
          if (keep >= e.full.length) continue;
          trim.truncated = trim.truncated.filter(function (t) { return t.call_id !== e.callId; });
          trim.squeezed = trim.squeezed.filter(function (t) { return t.call_id !== e.callId; });
          cut(e, keep, trim.squeezed);
          over -= (before - itemChars(e.item));
        }
      }
      /* ⑤ (atlas-input-limits) THE ITEM COUNT. The proxy reads at most INPUT_LIMITS.SERVER.items items, and a long turn reaches that in items
         long before characters (4 calls × 75 steps = 604 items, ~19,000 characters). Whole EARLIER steps of this turn — oldest first, never the
         latest — are written as ONE text item: each call (id, name, arguments) beside its result as composed above, so a call is never parted
         from its answer and every result stays readable whole by its call_id (read_result). The provider's own opaque items of those steps
         (reasoning, server blocks) are not repeated, and the item says so. Then, if still over, the oldest conversation messages go, as in ②. */
      const fixedCount = (stableItem ? 1 : 0) + (memItem ? 1 : 0) + 3 + (tailItem ? 1 : 0);   /* + the two attachment markers and the request */
      const countNow = function () { return fixedCount + (trim.droppedHistory ? 1 : 0) + kept.length + turnItems.length; };
      if (countNow() > B.items) {
        let upTo = 0;   /* steps 1..upTo are folded */
        const foldable = function (k) { return k > 0 && k < stepNo; };
        const itemsOfSteps = function (k) { let n = 0; for (let j = 0; j < turnStep.length; j++) if (turnStep[j] >= 1 && turnStep[j] <= k) n++; return n; };
        while (foldable(upTo + 1) && (fixedCount + (trim.droppedHistory ? 1 : 0) + kept.length + turnItems.length - itemsOfSteps(upTo) + (upTo ? 1 : 0)) > B.items) upTo++;
        if (upTo) {
          const lines = [];
          let folded = 0;
          const keepItems = [], keepSteps = [];
          let at = -1;
          turnItems.forEach(function (it, j) {
            const k = turnStep[j];
            if (!(k >= 1 && k <= upTo)) { keepItems.push(it); keepSteps.push(k); return; }
            if (at < 0) at = keepItems.length;
            folded++;
            if (it.type === 'function_call') lines.push('step ' + k + ' call ' + it.call_id + ' ' + it.name + ' ' + it.arguments);
            else if (it.type === 'function_call_output') lines.push('step ' + k + ' result ' + it.call_id + ': ' + it.output);
            else if (it.type === 'message') lines.push('step ' + k + ' ' + (it.role === 'assistant' ? 'Atlas: ' : '') + it.content);
          });
          const foldItem = { type: 'message', role: 'user', content: '[EARLIER STEPS OF THIS TURN, WRITTEN AS TEXT TO FIT — steps 1-' + upTo + ' (' + folded
            + ' items) are shown here as text so the input stays within the number of items the server reads; each call stands beside its own result, '
            + 'and read_result {"call_id":"<id>"} reads any of those results whole. The provider\'s own reasoning of those steps is not repeated.]\n' + lines.join('\n') };
          keepItems.splice(at < 0 ? 0 : at, 0, foldItem); keepSteps.splice(at < 0 ? 0 : at, 0, 0);
          turnItems.length = 0; keepItems.forEach(function (x) { turnItems.push(x); });
          turnStep.length = 0; keepSteps.forEach(function (x) { turnStep.push(x); });
          trim.foldedSteps = upTo; trim.foldedItems = folded;
        }
        while (countNow() > B.items && kept.length) {
          const gone = kept.shift();
          trim.droppedHistory++; trim.droppedHistoryChars += itemChars(gone);
        }
      }
      const input = [];
      if (stableItem) input.push(stableItem);
      if (trim.droppedHistory) {
        input.push({ type: 'message', role: 'user', content: '[EARLIER CONVERSATION NOT SHOWN — the ' + trim.droppedHistory
          + ' oldest messages of this conversation (' + trim.droppedHistoryChars + ' characters) were left out to fit. '
          + (memItem ? 'What they settled — the goal, conditions, results, figures, sources and what is open — is in [ATLAS WORKING MEMORY] below, and each result there can be read back whole with read_result. '
            : '')
          + 'Their wording is not in front of you: if the request depends on it, say so rather than guess.]' });
      }
      kept.forEach(function (it) { input.push(it); });
      if (memItem) input.push(memItem);
      /* the reader's attachments sit at a FIXED place: documents and files before the request (the
         question is asked about material already handed over), the step's images at the very end.
         ai-proxy fills each marker with what the request carries, or drops it. */
      input.push({ type: 'attachments', channels: ['docs', 'files'] });
      const requestIndex = input.length;
      input.push(reqItem);
      turnItems.forEach(function (it) { input.push(it); });
      if (tailItem) input.push(tailItem);
      input.push({ type: 'attachments', channels: ['images'] });
      /* ══ (atlas-outside-mark) DOES WHAT THE MODEL IS ABOUT TO READ STILL CARRY OUTSIDE CONTENT? ══════════════
         SECURITY-ARCHITECTURE.md §8 item 16: the mark was a fact about ONE turn, so a later turn that read an
         injected instruction back out of Atlas's own summary (the history line, the plan it declared, the topic
         in the working context) carried no mark and an 'explicit' or outward call ran unasked. The question is
         asked HERE because this is the one place every carrier becomes model input: a history item written in
         a marked turn (`outside`, kept only if the budget kept it), the request block (`requestOutside` — the
         working context) and the tail (`tailOutside` — the plan). The answer rides the reply as
         `contextOutside`, which runTurn reads exactly as it reads `webUsed`. Nothing here reads a word. */
      const outside = histOutside.slice(trim.droppedHistory).some(Boolean) || o.requestOutside === true || o.tailOutside === true || !!(memItem && o.memoryOutside === true);
      return { input: input, requestIndex: requestIndex, trim: trim, outside: outside,
        cut: !!(trim.truncated.length || trim.squeezed.length || trim.foldedSteps),
        recallable: !!memItem };   /* (atlas-working-memory) the input names refs that read_result answers, so the tool is offered */
    }

    /* ── The mechanical verdict on ONE proposed call. No meaning, only shape. ──────────────────
       Returns null when the call is fine, or {code, message, …} when it is not. The message is
       written for the MODEL, not for the reader: it names the tool, the field and the expectation,
       because the next thing that happens is that Atlas reads it and tries again. */
    function reject(call, tools) {
      const name = call && call.name;
      if (!name || typeof name !== 'string') {
        return { code: 'malformed_call', message: 'A tool call arrived with no tool name.' };
      }
      const tool = tools && tools[name];
      if (!tool) {
        const known = Object.keys(tools || {}).slice(0, 40).join(', ');
        return {
          code: 'unknown_tool',
          message: 'There is no tool called "' + name + '". Available tools: ' + known
            + '. Use search_capabilities to find a capability that is not in this list.',
        };
      }
      const errs = [];
      /* (atlas-turn-engine) `check` is the tool's schema WITH its live values (the layer names on the page
         right now) — validated here, but never sent as the declaration, so the declaration a provider
         caches stays the same bytes while the page changes (js/atlas-toolsurface.js liveEnum). */
      const shape = tool.check || tool.parameters;
      try {
        validateAgainst(shape, call.arguments, name, errs);
      } catch (e) {
        errs.push('arguments could not be read: ' + ((e && e.message) || 'unknown'));
      }
      if (errs.length) {
        return {
          code: 'invalid_arguments',
          message: 'The call to "' + name + '" does not match its schema: ' + errs.slice(0, 6).join('; ')
            + '. Re-issue the SAME call with the arguments corrected.',
          schema: shape,
        };
      }
      return null;
    }

    /* ── (atlas-turn-engine) DOES A LATER CALL OF THE SAME REPLY HAVE TO WAIT FOR AN EARLIER ONE? ──────
       `a` is earlier than `b`. Read off each call's footprint (runTurn's `footprint`, documented there);
       no meaning, only overlap. A key overlaps another when it is the same key or one names a part of
       the other («map» / «map.highlight», «camera» / «camera.follow») — the segments the registry's
       keys are written in. */
    function keysOverlap(xs, ys) {
      return (xs || []).some((x) => (ys || []).some((y) => {
        const a = String(x), b = String(y);
        return a === b || b.indexOf(a + '.') === 0 || a.indexOf(b + '.') === 0;
      }));
    }
    function conflicts(a, b) {
      if (!a || !b || !a.live || !b.live) return false;       /* a call answered without running touches nothing */
      if (a.ends) return true;                                 /* a question to the reader ends the turn for everything after it */
      if (a.ckey && a.ckey === b.ckey) return true;            /* the same call twice: the second is answered from the first */
      const fa = a.fp || { barrier: true }, fb = b.fp || { barrier: true };
      if (fa.pure || fb.pure) return false;
      if (fa.barrier || fb.barrier) return true;
      const wa = fa.writes || [], wb = fb.writes || [];
      if (!wa.length && !wb.length) return false;              /* two readers */
      if (!wa.length) return fa.reads == null || keysOverlap(fa.reads, wb);   /* undeclared reads = the whole app */
      if (!wb.length) return fb.reads == null || keysOverlap(fb.reads, wa);
      return keysOverlap(wa, wb) || (fa.reads != null && keysOverlap(fa.reads, wb)) || (fb.reads != null && keysOverlap(fb.reads, wa));
    }

    /* A JSON-Schema subset check — the same subset js/atlas-executor.js validates operations with:
       type, required, enum, minimum/maximum, minLength, items, properties. It exists twice on
       purpose: the executor guards the KERNEL (every caller, including buttons) and this guards the
       MODEL (so a bad call never reaches the kernel and never reaches the reader). */
    function validateAgainst(schema, value, path, errors) {
      if (!schema || typeof schema !== 'object') return;
      const t = schema.type;
      if (value === undefined || value === null) {
        if (Array.isArray(schema.required) && schema.required.length) {
          errors.push(path + ' is required and was not given');
        }
        return;
      }
      if (t === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(path + ' must be an object');
          return;
        }
        /* ⚠ `anyOf` IS HOW "A PLACE OR A COORDINATE PAIR" IS SAID. view.flyTo accepts either, and
           a plain `required` list can only demand both. Each branch is a {required:[…]} and one of
           them has to hold — which is exactly what js/atlas-capabilities.js's hasTarget() has
           always meant by a target being present, now written down where a validator can read it. */
        if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
          const present = (k) => {
            const v = value[k];
            return v !== undefined && v !== null && !(typeof v === 'string' && !v.trim())
              && !(Array.isArray(v) && !v.length);
          };
          const ok = schema.anyOf.some((b) => (b && Array.isArray(b.required) ? b.required.every(present) : true));
          if (!ok) {
            errors.push(path + ' needs ' + schema.anyOf
              .map((b) => (b && Array.isArray(b.required) ? b.required.join('+') : '')).filter(Boolean).join(' or '));
          }
        }
        const req = Array.isArray(schema.required) ? schema.required : [];
        for (const k of req) {
          const v = value[k];
          if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
            errors.push('"' + k + '" is required' + (path ? ' by ' + path : '') + ' and is missing or empty');
          }
        }
        const props = schema.properties || {};
        for (const k of Object.keys(props)) {
          if (value[k] !== undefined) validateAgainst(props[k], value[k], (path ? path + '.' : '') + k, errors);
        }
        return;
      }
      if (t === 'array') {
        if (!Array.isArray(value)) { errors.push(path + ' must be an array'); return; }
        if (schema.minItems != null && value.length < schema.minItems) {
          errors.push(path + ' needs at least ' + schema.minItems + ' item(s)');
        }
        if (schema.items) value.forEach((v, i) => validateAgainst(schema.items, v, path + '[' + i + ']', errors));
        return;
      }
      if (t === 'string') {
        if (typeof value !== 'string') { errors.push(path + ' must be a string'); return; }
        if (schema.minLength != null && value.length < schema.minLength) {
          errors.push(path + ' must be at least ' + schema.minLength + ' character(s)');
        }
      } else if (t === 'number' || t === 'integer') {
        if (typeof value !== 'number' || !isFinite(value)) { errors.push(path + ' must be a number'); return; }
        if (t === 'integer' && Math.floor(value) !== value) errors.push(path + ' must be a whole number');
        if (schema.minimum != null && value < schema.minimum) errors.push(path + ' must be >= ' + schema.minimum);
        if (schema.maximum != null && value > schema.maximum) errors.push(path + ' must be <= ' + schema.maximum);
      } else if (t === 'boolean') {
        if (typeof value !== 'boolean') errors.push(path + ' must be true or false');
      }
      if (Array.isArray(schema.enum) && schema.enum.length && schema.enum.indexOf(value) < 0) {
        errors.push(path + ' must be one of: ' + schema.enum.join(', '));
      }
    }

    /**
     * runTurn(opts) -> { text, steps, calls, results, trace, stopped }
     *
     * opts:
     *   model(req)      -> {text, toolCalls:[{id,name,arguments}], raw}   — injected transport
     *   tools           { name: {name, description, parameters} }         — the surface for THIS turn
     *   execute(call, turn) -> {ok, …}                                    — the mechanical executor;
     *                   `turn` is this turn's own record of facts (below), never an argument
     *   system          the core instruction (short — js/atlas-policy.js)
     *   messages        [{role:'user'|'assistant', content}]              — the conversation so far
     *   limits          partial override of LIMITS (technical only)
     *   signal          AbortSignal for the Stop button
     *   onStep(info)    optional progress callback (stage dots); never decides anything
     *   externalContent true when the FIRST model input already carries content from outside the
     *                   conversation (an attachment's text, a document) — see `turn` below
     *   footprint(call) optional (atlas-turn-engine) — what one call may touch, from the registry:
     *                   {pure:true} (touches no app state) | {barrier:true} (order it against every
     *                   call) | {writes:[conflictKeys], reads:[…]|null}. Calls of one reply whose
     *                   footprints do not overlap run at the same time; absent = every call is a
     *                   barrier, which is the one-after-another loop this replaced.
     *   promote(result) optional (atlas-turn-engine) — tool definitions a result has made callable
     *                   by name from the next step (find_capability's matches). A definition may
     *                   carry `route(args) -> {name, arguments}`: the call it is executed as.
     */
    async function runTurn(opts) {
      opts = opts || {};
      const lim = Object.assign({}, LIMITS, opts.limits || {});
      const tools = opts.tools || {};
      const model = opts.model;
      const execute = opts.execute;
      if (typeof model !== 'function') throw new Error('runTurn: opts.model is required');

      const transcript = (opts.messages || []).slice();
      const trace = { steps: [], calls: 0, rejected: 0, executed: 0, reused: 0 };
      /* ══ ⚠⚠⚠ (#R489) THE SAME CALL, MADE TWICE IN ONE TURN, IS ANSWERED ONCE ══════════════════
         「1回の依頼に対して少なくとも4回の独立した『調査＋地図化』を連続実行しています。」 — and the
         evidence in the transcript is that the four DISAGREED: 「限界」「使用データ」「本文に登場したが
         未配置」 appeared again and again with different conclusions each time, because each pass ran
         its own web searches at its own moment over a window nobody had fixed.
         js/atlas-turn-results.js has de-duplicated this since #R441, but it does it at RENDER time —
         by then every pass has already been paid for, and the reader is shown the survivor of four
         answers rather than one answer. Asking the identity BEFORE the call is the same rule applied
         where it costs nothing.
         ⚠ THIS TAKES NOTHING FROM ATLAS (CONSTITUTION.md §5, and the standing 「制限を増やす方向に
         持っていくな」). There is no cap and no refusal: every call Atlas makes is still a call, the
         budget is untouched, no plan is rewritten, and the result handed back is the REAL result of
         the identical call — with a note saying so, so the model can see it is looking at its own
         earlier answer rather than a new one. Only SUCCESSFUL calls are reused; a failure is exactly
         the case where trying again is right. */
      const TR = makeAtlasTurnResults({});
      const doneCalls = Object.create(null);
      /* ══ (atlas-result-delivery) A REUSED ANSWER IS TRUE ONLY WHILE NOTHING IT DEPENDS ON HAS BEEN WRITTEN ═════
         `doneCalls` used to hold a call for the rest of the turn, so `flyTo A → flyTo B → flyTo A` (and a layer toggled on, off, on; a
         time travelled 1500, 1900, 1500) never ran its third call and was told, falsely, that the app had not changed. The registry already
         says what a call writes and reads (the footprint the loop orders a reply by): `writeLog` is every call of this turn that ran and
         wrote something, in order; `doneAt[key]` is how long the log was when that answer was kept. An answer is reused only if no LATER
         write overlaps what the call reads (undeclared reads = the whole app). A call that touches no app state is never invalidated. */
      const writeLog = [];
      const doneAt = Object.create(null);
      const noteWrite = (fp) => { if (fp && !fp.pure && (fp.barrier || (fp.writes && fp.writes.length))) writeLog.push(fp); };
      const remember = (key, rec) => { doneCalls[key] = rec; doneAt[key] = writeLog.length; };
      const stale = (key, fp) => {
        if (!fp || fp.pure) return false;
        for (let i = doneAt[key] || 0; i < writeLog.length; i++) {
          const w = writeLog[i];
          if (w.barrier || fp.barrier || fp.reads == null || keysOverlap(fp.reads, w.writes) || keysOverlap(fp.writes, w.writes)) return true;
        }
        return false;
      };
      const isDone = (key, fp) => !!(key && doneCalls[key] && !stale(key, fp));
      /* ⚠⚠⚠ (#R741) …AND THE IDENTICAL CALL THAT FAILED IS NOT PROGRESS EITHER. The paragraph above
         says 「a failure is exactly the case where trying again is right」, and for a DIFFERENT call
         it is. For the same call with the same arguments it is not: nothing in the app changed
         between the two, so the second run can only refuse for the same reason.
         MEASURED on production 2026-09-15, on the deployed #R740 fix: 「世界を平均寿命で色分けして」
         sent `mapMetric "life"` SEVEN times, was refused seven times WITH the list of valid keys in
         every refusal, and the turn died on its step budget having drawn nothing. #R663 and #R731
         each ended one shape of this; the failing repeat is the shape neither covered.
         ⚠ NOTHING IS TAKEN (CONSTITUTION.md §5): the call still RUNS — a network failure gets its
         retry — and nothing is refused. What changes is that the repeat is NAMED, so Atlas can see
         it is looking at its own refusal, and that a step made only of such repeats counts toward
         `maxRepeatSteps` exactly as a step made only of reused answers does. */
      const failedCalls = Object.create(null);
      /* ⚠⚠⚠ (#R760) THE THIRD STATUS. #R731 named the repeat of an answered call and #R741 the repeat
         of a refused one; a call that comes back `partial` with the SAME code was named by neither, and
         the comment at `doneCalls` above says why it must not be frozen — a partial still owes something.
         But «still owes something» and «said the same thing again» are different facts, and only the
         first is a reason to keep going. Measured on production 2026-09-16 (build R758):
           「Colour every country by population density」  map.choropleth ok → not_rendered ×3, working limit
           「Measure … Reykjavik to Cape Town and draw the line」  map.drawLine ×5, 430 s, working limit,
             and the distance the reader asked for never reached the prose.
         Both turns had ALREADY done the whole job on their first call. Nothing is frozen and nothing is
         refused here either: the call still runs, and a partial that comes back with a DIFFERENT code
         (more targets resolved, a different surface reached) resets the run, because that is progress. */
      const partialCalls = Object.create(null);
      const doneResults = Object.create(null);   /* (#732) what a successful call DID (its `resultKey`) → the call that did it first */
      const permanentFails = Object.create(null);   /* (#R760) refusals the capability declared to be about the KIND of request */
      const callById = Object.create(null);         /* (atlas-native-tools) every answered call of this turn, by id — what read_result reads */
      const localTools = Object.assign({}, tools, { read_result: READ_RESULT_TOOL });   /* validated like any tool; offered only when something was cut */
      /* ══ ⚠⚠⚠ (atlas-turn-engine) WHAT find_capability FOUND BECOMES A TOOL, FROM THE NEXT STEP ON ═══════
         146 capabilities, 13 of them typed tools; the other 133 were two decisions away — find, then
         run_capability with the id and the arguments nested one level down. MEASURED
         (scripts/atlas-eval/questions.json, rail-tokyo-osaka): find_capability EIGHT times, zero
         operations, `step_budget`. The capability had been found on the first call; what the model
         held afterwards was a generic envelope, not the tool.
         So a result that names capabilities (`opts.promote`) adds them to the tools the NEXT model call
         declares, typed with their own schema. ⚠ NOTHING IS TAKEN: find_capability and run_capability
         are still there and still reach all 146; a promoted tool is executed AS run_capability (its
         `route`), so it is the same path, the same second schema check, the same kernel.
         ⚠ THE ORDER IS THE CACHE. The base tools are a fixed prefix and promotions are APPENDED, in the
         order they happened, and never removed or reordered within the turn — a provider caches the
         declarations as a prefix, so what came before an addition is still the same bytes after it.
         Each promoted definition says `promoted:true`, which ai-proxy leaves out of the prompt-cache
         key, so the key (the routing of the cache) does not move with them either. */
      const promote = (typeof opts.promote === 'function') ? opts.promote : null;
      /* (atlas-working-memory) the conversation's working memory (js/atlas-working-memory.js), when the caller keeps one */
      const MEM = (opts.memory && typeof opts.memory.noteResult === 'function') ? opts.memory : null;
      const MEM_TURN = opts.memoryTurn != null ? opts.memoryTurn : 0;
      const footprint = (typeof opts.footprint === 'function') ? opts.footprint : null;
      const identify = (typeof opts.identify === 'function') ? opts.identify : null;
      const promoted = [];
      /* ══ (atlas-plan-on-map) ATLAS'S OWN PLAN, WHEN THE CALLER KEEPS ONE ════════════════════════════════
         `opts.plan` is the conversation's plan ledger (js/atlas-plan.js). Given one, the loop offers the
         `plan` tool — a FIXED declaration, placed after the base tools and before every promotion, so the
         prefix a provider caches is the same bytes on every step and every turn — answers its calls from
         the ledger (they touch no app state), and files every call that reaches the app under the step
         Atlas said it serves, with the executor's verdict as that step's state. ⚠ NOTHING IS DECIDED FOR
         ATLAS: whether to plan, the steps and their order are the model's; no call is refused or reordered
         for a plan's sake, and no ceiling here is read or moved (CONSTITUTION.md §5). */
      const PLAN = (opts.plan && typeof opts.plan.declare === 'function' && opts.plan.TOOL && !tools[opts.plan.TOOL.name]) ? opts.plan : null;
      if (PLAN) localTools[PLAN.TOOL.name] = PLAN.TOOL;
      const offered = () => Object.keys(tools).map((k) => tools[k]).concat(PLAN ? [PLAN.TOOL] : []).concat(promoted);
      const offeredCount = () => Object.keys(tools).length + (PLAN ? 1 : 0) + promoted.length + 1;   /* + read_result, which a cut step adds */
      /* the capability a call reaches, for the plan's record before its result names it */
      const capOfCall = (c) => (c && c.name === 'run_capability') ? String((c.arguments && c.arguments.id) || '')
        : String((c && localTools[c.name] && localTools[c.name].capabilityId) || (c && c.name) || '');
      /* ══ ⚠⚠⚠ (#R801) HAS THIS TURN'S MODEL INPUT CARRIED CONTENT FROM OUTSIDE THE CONVERSATION? ═══
         A fact about the turn, not a judgment about the request. It becomes true on any of three
         events, each a statement by the thing that knows: ① a tool result stamped `ingests:'external'`
         is put in the transcript — the registry's column 11 (js/atlas-capabilities.js), which says
         the result carries sentences a third party wrote, stamped on the result by
         js/atlas-toolsurface.js the way `endsTurn` is; ② the model's reply reports that the provider's
         hosted web search ran or was attached (`reply.webUsed`, from ai-proxy's meta.webUsed /
         webAttached — a page the reader never saw was in front of the model); ③ the request itself
         arrived with an attachment's text or a document (`opts.externalContent`). It travels to the
         executor as execution context (`execute(call, turn)`), never as an argument the model could
         write, and js/atlas-executor.js reads it for ONE thing: a capability whose registry row says
         confirmation 'explicit' is not run on the model's say-so alone once outside content has been
         in front of it — the reader is asked (`needs_confirm`). It decides nothing else.
         ⚠ NOT «any tool result». The first draft set it on every tool message, which made the second
         step of 「東京へ飛んで、見えるものを教えて」 (flyTo → inspect) a confirmation every time — a
         camera's completion is IntMap's own observation, not a third party's words, and gating on it
         would have bound Atlas (.agents/rules/one-pass-or-a-reason.md). The fence in the prompt still
         wraps EVERY tool message: a mark that says «this is data» is harmless on IntMap's own data. */
      const turn = { externalContentSeen: !!opts.externalContent };
      const observe = (content) => {
        transcript.push({ role: 'tool', content });
        if ((Array.isArray(content) ? content : []).some((r) => r && r.ingests === 'external')) turn.externalContentSeen = true;
      };
      const results = [];
      let text = '';
      /* ⚠⚠⚠ (#R742) A SENTENCE WRITTEN ON A STEP THAT THEN ISSUED CALLS IS NOT THE ANSWER EITHER.
         #R663 held back the text of a step that DECLARED itself mid-turn; the same sentence written
         without the declaration walked straight through. MEASURED on production 2026-09-15:
         「リスボンからケープタウンまでの距離」 came back as 「Measuring the straight-line distance … and
         drawing it on the map」 — with `measure:ok, drawLine:ok` in the same turn. The distance WAS
         computed; the turn then ran out of steps, and because that promise was sitting in `text`,
         the "write the answer" call below never ran and the number never reached the reader.
         A reply that issues tool calls is, mechanically, not the end of the turn — the loop is about
         to continue — so its prose is provisional, and this is where it waits. No word of it is read:
         what separates it from an answer is whether the same reply issued calls.
         ⚠ NOTHING IS LOST (CONSTITUTION.md §5): it is taken back below whenever no answer was
         written after it — which is exactly the turn that ends by asking the reader a question, where
         the sentence accompanying `ask_user` is all there is. */
      let midText = '';
      let malformedRun = 0;
      let stopped = '';
      let repeatRun = 0;   /* consecutive steps made only of reused calls — see maxRepeatSteps */
      let answerMode = '';       /* (#R511) the latest mode Atlas declared; '' until it says */
      let gateBounces = 0;       /* (#R511→#R543) how many finals came back having declared an output they had not produced */
      const lastBounce = new Map();   /* contradiction → last operation record that justified asking for a repair */
      let operationProgress = 0;
      let nextEffort, nextOutput;   /* (atlas-unbounded-execution) what the last reply declared its NEXT reply needs — FINAL_SCHEMA next_effort / next_output_tokens */
      /* (atlas-unbounded-execution) EVERY SENTENCE ATLAS WROTE ON THE WAY, KEPT. The reader saw these appear while the turn
         ran and lost them when it ended (the user, 2026-11-24): a provisional sentence is not the answer (#R663, #R742), but it is
         not nothing either. They are returned in order for the caller to keep on screen; nothing here decides how. */
      const interim = [];
      trace.outputGate = 0;
      let goalVerifiedAt = -1;   /* a re-read of an unchanged operation record is the same observation twice */
      let goalPrev = null;       /* …and what that read found ({met, unmet}), shown to the next read so it judges whether the work Atlas did since closed the gap */
      let goalRounds = 0;
      let goalAt = -1;           /* results.length when the finding was put to Atlas (-1: it was not) */
      let goalUnmet = [];        /* …and what it found, when the bounce was not taken or ran out: carried into `unmet` */
      /* (atlas-completion-verdict) EACH FINDING HAS AN IDENTITY, AND IS PUT TO ATLAS ONCE. A finding is named by an id the first time it is read
         (g1, g2 …); a later reading that finds the same need says so by that id ("prev", js/atlas-goal-verify.js) or by the same words. A finding
         already put to Atlas has had its answer — Atlas did the work, or answered as it stands — and is not sent back again: sending it back
         re-streams an answer and withdraws it each round with nothing new to act on. Measured before this: a reader that reworded one need each
         round («all prefectures» → «every prefecture») bounced the same finished turn twenty times (one-pass-or-a-reason §2 ③: the operation
         «put this finding to Atlas» was not idempotent). Only a need no reading has named before is put to Atlas. NOT A CAP: no count of rounds. */
      const goalIds = [];        /* [{ id, key }] every finding named so far this turn */
      const goalPut = Object.create(null);   /* id → true once that finding has been put to Atlas */
      const goalKey = (need) => String(need || '').toLowerCase().split(' ').filter(Boolean).join(' ');   /* no pattern: this loop reads no reply by regex (tests/atlas-agent-loop-checks R663 ⑥) */
      const goalIdOf = (u) => {
        const prev = String((u && u.prev) || '').trim();
        if (prev && goalIds.some((g) => g.id === prev)) return prev;
        const k = goalKey(u && u.need);
        const hit = goalIds.find((g) => g.key === k);
        if (hit) return hit.id;
        const id = 'g' + (goalIds.length + 1);
        goalIds.push({ id, key: k });
        return id;
      };
      trace.goalCheck = '';

      /* (#R452) the turn's clock. `now()` is injected in the node checks, which have no wall time. */
      const now = (typeof opts.now === 'function') ? opts.now : (() => Date.now());
      const startedAt = now();
      /* (job-cost-ledger) the record has its OWN wall clock: `now` is the turn's budget clock and an injected one advances on every read, so reading it for the record would spend the turn's budget */
      const wallNow = () => Date.now();
      const ledger = makeRunLedger({ now: wallNow });
      /* (atlas-autonomy) a worker that ends after the answer which left it running still belongs to THIS turn's cost: the record is the same object the caller holds, refreshed in place */
      runMarkSink.current = (name) => { try { ledger.mark(name); } catch (_) { /* a record never breaks the turn */ } };   /* (atlas-child-loop-reuse) the instants a delegation reports — see atlas-run-ledger.js runMarkSink */
      lateCostSink.current = (usd) => { try { ledger.late(usd); if (trace.run) Object.assign(trace.run, ledger.summary()); } catch (_) { /* a record never breaks the turn */ } };
      /* (atlas-orchestration-efficiency) THE CALLS MADE AROUND THE LOOP ARE THE TURN'S CALLS. The effort-sizing call before the first step and the independent reader after the answer are model
         calls the reader waits through. Sizing hands in its receipt and the verifier reports its receipt below. */
      (Array.isArray(opts.preCalls) ? opts.preCalls : []).forEach((c) => { try { ledger.model(c); } catch (_) { /* a ledger that cannot take a row is not the turn's problem */ } });
      if (PLAN) { try { PLAN.beginTurn(); } catch (_) { /* a ledger never breaks the turn */ } }
      const endPlan = (how) => { if (PLAN) { try { PLAN.endTurn(how); } catch (_) { /* as above */ } } };
      const outOfTime = () => (lim.turnBudgetMs > 0) && ((now() - startedAt) >= lim.turnBudgetMs);
      /* ⚠ (atlas-legacy-protocol-removal) THE NOTE FOR CALLS WRITTEN INTO THE MESSAGE. Nothing written there runs, and
         the model is TOLD so — one-pass-or-a-reason §2's second cause is a result that never reaches the
         next step, and a call dropped in silence is the same defect with no result at all. `alone`: the
         reply made no function call either, so the whole reply did nothing. */
      const inTextNote = (names, alone) => 'This reply wrote ' + names.length + (names.length === 1 ? ' call' : ' calls')
        + ' (' + names.join(', ') + ') into its JSON message. Nothing written there runs — IntMap runs only the calls '
        + 'you make as functions — so ' + (names.length === 1 ? 'it did' : 'none of them did') + ' not run'
        + (alone ? ' and nothing changed. Make them now as function calls in this reply; or, if the answer needs no tool, '
          + 'reply with final_text alone.'
          : '; the function calls you made did, and their results are above. If you still need '
          + (names.length === 1 ? 'it' : 'them') + ', make ' + (names.length === 1 ? 'it' : 'them') + ' as function calls.');
      /* ⚠ THE RESULT IS A TYPED NOTE TO ATLAS, NOT AN ABORT. A tool that overran its deadline is
         abandoned — the turn stops WAITING for it — and what goes into the transcript is the same
         mechanical record every other outcome gets, so the next step is chosen by Atlas knowing what
         happened rather than by this loop deciding on its behalf. */
      const runTool = (call, planStep, planTarget) => {
        /* (#R801) the turn's facts ride beside the call — see `turn` above. (atlas-completion) …together with the
           plan step this call is filed under (-1 when none), so the caller can name the goal it serves. A CHILD of
           `turn`, not a copy: externalContentSeen changes while the turn runs, and is read live through the prototype. */
        /* ⚠ (atlas-timeout-cancel) THE DEADLINE ENDS THE WORK, NOT ONLY THE WAITING. `callSignal` rides beside the call
           like the rest of the turn's facts; the executor links it to the operation it starts, so when the deadline
           passes the operation is CANCELLED — settled as 'cancelled' — instead of left to land on the map after Atlas
           was told it never arrived. A caller whose execute ignores it behaves exactly as before. */
        let callAbort = null;
        try { callAbort = new AbortController(); } catch (_) { /* no AbortController: the old, waiting-only deadline */ }
        let tm = null, timeout;
        const arm = () => {
          if (!(lim.toolTimeoutMs > 0) || (callAbort && callAbort.signal.aborted)) return;
          tm = setTimeout(() => {
            let cancelled = false;
            if (callAbort) { try { callAbort.abort(); cancelled = true; } catch (_) { /* could not signal */ } }
            timeout({ ok: false, error: 'tool_timeout',
              message: '"' + String((call && call.name) || '') + '" did not finish within '
                + Math.round(lim.toolTimeoutMs / 1000) + ' s and ' + (cancelled ? 'was cancelled' : 'was left running')
                + '; nothing it was fetching arrived in time. Answer with what you have, or try a different approach.' });
          }, lim.toolTimeoutMs);
        };
        const facts = Object.assign(Object.create(turn), { planStep: (typeof planStep === 'number') ? planStep : -1, planTarget,
          callSignal: callAbort ? callAbort.signal : undefined,
          // The reader's decision is input to this call. Time the execution on either side of it.
          async awaitInput(decision) {
            clearTimeout(tm);
            try { return await decision; } finally { arm(); }
          } });
        const p = Promise.resolve().then(() => execute(call, facts));
        if (!(lim.toolTimeoutMs > 0)) return p;
        const clock = new Promise((res) => { timeout = res; arm(); });
        return Promise.race([p, clock]).finally(() => { try { clearTimeout(tm); } catch (_) { /* already fired */ } });
      };

      for (let step = 0; step < lim.maxSteps; step++) {
        if (opts.signal && opts.signal.aborted) { stopped = 'aborted'; break; }
        if (outOfTime()) { stopped = 'time_budget'; break; }

        let reply = null;
        /* (atlas-early-results) THE MOMENT WHAT THE LAST STEP FOUND IS IN FRONT OF THE MODEL. A step's calls run together and the
           model is asked again when the LAST of them has settled; `firstDoneAt` → `usedAt` is how long the earliest result sat
           waiting for that. A record of the wait, never a reason to cut one short. */
        { const pt = trace.stepTiming && trace.stepTiming[trace.stepTiming.length - 1];
          if (pt && pt.usedAt == null) { pt.usedAt = now(); pt.firstResultHeldMs = pt.firstDoneAt != null ? Math.max(0, pt.usedAt - pt.firstDoneAt) : 0; } }
        const modelT0 = wallNow();
        try { if (ledger.marked('parentReceived') && !ledger.marked('nextAnalysisStart')) ledger.mark('nextAnalysisStart'); } catch (_) { /* a record never breaks the turn */ }
        try {
          /* ⚠ A SNAPSHOT, NOT THE LIVE ARRAY. The loop keeps appending to `transcript`; handing the
             adapter the array itself means the request it was given changes underneath it while it
             is in flight, and a retry inside the transport would resend a different conversation
             from the one it was called with. */
          reply = await model({
            system: opts.system || '',
            messages: transcript.slice(),
            tools: offered(),   /* (atlas-turn-engine) the base tools, then what this turn promoted — see `promoted` */
            step,
            signal: opts.signal,
            effort: nextEffort,      /* (atlas-unbounded-execution) undefined unless the previous reply declared it */
            maxOutput: nextOutput,
          });
        } catch (e) {
          /* A transport failure is the ONE thing the loop cannot hand back to Atlas — there is
             nothing left to hand it to.
             ⚠ BUT A FAILURE ON STEP 3 IS NOT THE SAME EVENT AS A FAILURE ON STEP 0. If earlier
             steps already ran tools and produced text, throwing here would discard a turn that
             largely succeeded and show the reader a bare error — including for the 429 the server
             raises when a turn has spent its call budget, which is a ceiling being reached rather
             than anything going wrong. Only a first step with nothing behind it is fatal. */
          trace.steps.push({ step, error: (e && e.message) || 'model error' });
          if (step === 0) { endPlan('error'); throw e; }
          /* (atlas-unbounded-execution) a refusal FOR MONEY is the fence doing its job, not the network failing — named apart,
             so the reader is told the request reached its spending limit rather than that something broke */
          stopped = (e && BUDGET_CODES[String(e.code || '')] === 1) ? 'budget' : 'transport';
          trace.transportError = (e && e.message) || 'model error';
          trace.transportErrorInfo = errorInfo(e);   /* (atlas-completion) the code / status / retryable the message flattened */
          break;
        }
        if (reply) { const u = reply.usage || {}; ledger.model({ model: u.model, costUsd: u.costUsd, priceKnown: u.priceKnown, ms: wallNow() - modelT0, web: reply.webUsed === true }); }
        /* (atlas-completion) A REPLY THE PROVIDER ITSELF CALLED INCOMPLETE (OpenAI `status:"incomplete"`,
           ran past its output length, or a content filter cut it) is still read as a step — what it
           holds is real — but it is not silently taken as finished: the trace says which step and why. */
        if (reply && reply.finish && reply.finish.status === 'incomplete') {
          (trace.incomplete = trace.incomplete || []).push({ step, reason: reply.finish.reason || null });
        }

        /* (#R801) event ② of `turn` above: the provider's own web search put a third party's page in front of the model */
        if (reply && reply.webUsed === true) turn.externalContentSeen = true;
        /* (atlas-outside-mark) event ④: the input this reply was written from still carried text an earlier marked turn
           wrote — composeInput's `outside`, set on the reply by the caller's model adapter (js/atlas-console.js). The
           mark lives as long as that text is in front of the model, not one turn. */
        if (reply && reply.contextOutside === true) turn.externalContentSeen = true;
        /* (atlas-native-tools) what the input to THIS reply gave up to fit, as the composer and the proxy each
           reported it — a record for the trace, never a reason to act */
        if (reply && (reply.inputTrim || reply.serverTrim)) {
          (trace.inputTrims = trace.inputTrims || []).push({ step, client: reply.inputTrim || null, server: reply.serverTrim || null });
        }
        /* ⚠ (atlas-native-tools) EVERY CALL THE MODEL MADE GETS AN ANSWER. `.slice(0, maxPerStep)` used to drop the
           ninth call and beyond without a word — harmless while calls were free text, fatal now: a
           native `function_call` with no `function_call_output` is a request the provider refuses.
           The excess is answered below as not run, which is also what the model deserved to be told.
           Call ids must be unique across the turn (they key the transcript and read_result); a
           provider's ids are, and a reply without its own items gets ones that are. */
        const allCalls = (reply && Array.isArray(reply.toolCalls)) ? reply.toolCalls.slice() : [];
        if (!(reply && Array.isArray(reply.items) && reply.items.length)) {
          allCalls.forEach(function (c, i) { if (c && (!c.id || callById[c.id])) c.id = 's' + step + 'c' + i; });
        }
        const calls = allCalls.slice(0, lim.maxPerStep);
        /* (#R663) what Atlas said THIS reply is — a fact about this step, so unlike `answerMode` it
           does not carry over to the next one. '' when it did not say. */
        const turnState = (reply && TURN_STATES.indexOf(reply.turnState) >= 0) ? reply.turnState : '';
        /* (atlas-legacy-protocol-removal) the calls this reply WROTE into its JSON rather than made — see readReply */
        const inText = (reply && Array.isArray(reply.callsInText)) ? reply.callsInText : [];
        if (inText.length) (trace.callsInText = trace.callsInText || []).push({ step, names: inText.slice() });
        /* ⚠ (#R663) A SENTENCE ATLAS MARKED AS NOT-THE-ANSWER IS NOT THE ANSWER. The reader was
           shown 「まず〜を確認します」 as the reply to their question partly because any non-empty text
           from any step became the turn's answer, so a note-to-self written on the way through
           survived to the bubble. Text from a step that declared itself mid-turn is kept out — and
           if such a step turns out to end the turn anyway (the gate below runs out of bounces), the
           accepting branch takes it back, so nothing can render an empty answer. */
        if (reply && typeof reply.text === 'string' && reply.text.trim() && turnState !== 'continuing') {
          /* (#R742) …and where it goes is decided by the reply's own record of what it did */
          if (calls.length) midText = reply.text; else text = reply.text;
        }
        /* (atlas-unbounded-execution) the provisional sentence of this step — one that issued calls, or that Atlas itself marked
           "continuing" — kept for the reader (see `interim`) */
        if (reply && typeof reply.text === 'string' && reply.text.trim() && (calls.length || turnState === 'continuing')) {
          if (!interim.length || interim[interim.length - 1].text !== reply.text) interim.push({ step, text: reply.text });
        }
        if (reply && reply.noteToIntMap) { (trace.machineNotes = trace.machineNotes || []).push({ step, note: reply.noteToIntMap }); }
        /* An objection is useful diagnostic context. Resolving confirmed missing work requires evidence covering it. */
        if (goalAt >= 0 && results.length === goalAt && !calls.length && goalUnmet.length && reply && reply.noteToIntMap) {
          trace.goalContested = { unmet: goalUnmet.map((u) => ({ need: u.need, why: u.why })), reason: reply.noteToIntMap };
        }
        nextEffort = (reply && NEXT_EFFORTS.indexOf(reply.nextEffort) >= 0) ? reply.nextEffort : undefined;
        nextOutput = (reply && Number.isInteger(reply.nextOutput) && reply.nextOutput > 0) ? reply.nextOutput : undefined;
        if (reply && ANSWER_MODES.indexOf(reply.answerMode) >= 0) answerMode = reply.answerMode;

        /* ── ZERO TOOL CALLS IS A COMPLETE TURN. This is the branch the old planner had no shape
           for: 「セーヌ川の長さは」 is answered here, on step 0, having touched nothing. ────── */
        if (!calls.length) {
          /* ══ (#R511) …UNLESS ATLAS SAID THIS ANSWER IS A MAP AND THE MAP IS UNTOUCHED. `changedMap`
             is a fact the tool surface stamps on a result whose capability produced the map and
             completed — the same kind of fact as `endsTurn`. The loop reads the flag, not the
             tool's name, so it still knows nothing about what any tool means. The bounce is a typed
             note in the transcript, never shown to the reader; it costs a step and is bounded. */
          const need = MODE_NEEDS[answerMode] || null;
          const made = !need || need.some((m) => results.some((r) => producedBy(r).indexOf(m) >= 0 || ranBy(r).indexOf(m) >= 0));
          /* ══ ⚠⚠ (#R663) …OR SAID THIS REPLY IS NOT THE ANSWER AND THEN ENDED THE TURN WITH IT ═══
             The second declaration a final can contradict is its own. `turnState` is Atlas saying
             this reply is mid-turn; an empty `tool_calls` is the machine's record that nothing is
             continuing it. That is the SAME disagreement the clause above catches — a declaration
             against the turn's record — so it is the same gate, with the same bounded budget and
             the same typed note, rather than a second mechanism beside it (CONSTITUTION.md §5:
             「互いに矛盾する門が増え、どれが効いたのか誰にも言えなくなる」). Nothing here reads a word
             of the prose: 「まず確認します」 and 「フランスの首都はパリです」 are the same bytes to this
             loop, and what separates them is which of the two Atlas said the reply was. */
          /* ══ ⚠⚠⚠ (#R742) …OR ENDED THE TURN WITHOUT ANSWERING AT ALL ══════════════════════════
             The two clauses above both compare a DECLARATION against the turn's record, so a reply
             that declares nothing was measured against nothing. MEASURED on production 2026-09-15,
             three times — 「Show me the Roman Empire at its greatest extent…」, 「Which countries have
             never been members of the United Nations?」, 「…the Amazon rainforest…」 — each ended on
             step 0, in 5–12 s, with `tool_calls:[]`, no `answer_mode`, no `turn`, and `final_text`
             empty, which `required:['final_text']` accepts because a string schema with no
             `minLength` accepts "". `stopped` said 'answered' and the reader got the shell's
             fallback word 「Done.」 as the whole reply to their question.
             The contradiction needs no declaration to be visible: the turn is over and the reader
             has nothing. It is held by the SAME gate — same bounded budget, same typed note — and
             the recovery is the only one that is not an invention: Atlas writes the answer, or makes
             the calls that produce it. ⚠ NOTHING IS PUT IN THE READER'S MOUTH HERE: this loop never
             composes a sentence: if the bounces run out with the answer still empty, the turn says
             so (`stopped` below), and what the reader sees stays the shell's decision. */
          const answerHere = (reply && typeof reply.text === 'string' && reply.text.trim()) ? reply.text : text;
          /* ⚠ (atlas-legacy-protocol-removal) …OR WROTE ITS CALLS INTO THE MESSAGE. A reply whose only calls are
             `tool_calls` in its JSON made no call — the transport that ran those is gone — so it is the
             same contradiction as `no_calls_issued` seen from the record: the reply meant work and
             nothing ran. First, because it is the most specific thing the record says. */
          const code = inText.length ? 'calls_in_text'
            : (need && !made) ? (GATE_CODE[answerMode] || 'output_not_produced')
            : ((turnState === 'continuing') ? 'no_calls_issued'
              : (!String(answerHere || '').trim() ? 'no_answer_written' : ''));
          /* ══ (atlas-goal-verifier) THE REQUEST, READ BY SOMETHING OTHER THAN THE ANSWERER ═════════════════════
             Every check above holds Atlas to what Atlas DECLARED (answer_mode, turn, its own plan). A turn that
             declares nothing, or declares "text" for a request that asked for a drawing, is measured against
             nothing and is "complete". `opts.verify` is an independent reader of the REQUEST and of the turn's
             RECORD — the caller supplies it (a separate model call; this loop reads no word of either), and it
             answers {unmet:[{need, why}]} or null. ⚠ A NOTE, NOT A REFUSAL, exactly like the gate it sits beside:
             it is put to Atlas once, as a typed note naming what was not met, and Atlas may answer that the
             request does not need it. ⚠ NOT OBSERVED IS NOT UNMET: null / a throw / a timeout accepts the turn and
             says only that it was not checked (`trace.goalCheck`). Only on a turn the gate above would accept. */
          let goalNote = '';
          if (!code && operationProgress > goalVerifiedAt && typeof opts.verify === 'function' && String(answerHere || '').trim() && !outOfTime()) {
            goalVerifiedAt = operationProgress; goalRounds++;
            let v = null;
            let usage;
            const verifyT0 = wallNow();
            try {
              v = await opts.verify({ request: lastUserText(opts.messages), text: answerHere, answerMode, produced: results.reduce((a, r) => { producedBy(r).forEach((m) => { if (a.indexOf(m) < 0) a.push(m); }); return a; }, []), results: results.slice(), previous: goalPrev, round: goalRounds,
                onUsage: (meta) => { usage = proxyUsage(meta); },
                plan: PLAN ? (() => { try { return PLAN.snapshot(); } catch (_) { return null; } })() : null });
            } catch (_) { v = null; }
            try { ledger.model({ ...usage, model: usage?.model || 'atlas_verify', ms: wallNow() - verifyT0 }); } catch (_) { /* see preCalls */ }
            const list = (v && Array.isArray(v.unmet)) ? v.unmet.filter((u) => u && String(u.need || '').trim()).map((u) => ({ kind: 'goal', id: goalIdOf(u), need: String(u.need).slice(0, 300), why: String(u.why || '').slice(0, 300) })) : null;
            /* what the reader said it could NOT SEE is not a finding about the turn (not observed is not unmet): kept for the evaluation, never bounced, never listed as «not done» */
            const unconfirmed = (v && Array.isArray(v.unconfirmed)) ? v.unconfirmed.filter((u) => u && String(u.need || '').trim()) : [];
            trace.goalUnconfirmed = unconfirmed.map((u) => ({ need: String(u.need).slice(0, 300), why: String(u.why || '').slice(0, 300) }));
            if (list && goalPrev) for (const old of goalPrev.unmet) {
              if (!list.some((u) => u.id === old.id) && unconfirmed.some((u) => u.prev === old.id || goalKey(u.need) === goalKey(old.need))) {
                list.push({ kind: 'goal', ...old });
              }
            }
            const metList = (v && Array.isArray(v.met)) ? v.met.filter((m) => m && String(m.need || '').trim()).map((m) => ({ need: String(m.need).slice(0, 300), how: String(m.how || '').slice(0, 300) })) : [];
            trace.goalCheck = list === null ? 'unobserved' : (list.length ? 'unmet' : 'met');
            /* the ledger of the LAST observed read: what the request asked, what the record covers, what it does not, and how many reads it took (observed-only: an unobserved read leaves the previous ledger) */
            if (list !== null) { goalPrev = { met: metList, unmet: list.map((u) => ({ id: u.id, need: u.need, why: u.why })) }; trace.goalLedger = { rounds: goalRounds, met: metList, unmet: goalPrev.unmet }; }
            /* ⚠ NOT OBSERVED IS NOT RESOLVED. A shortfall an earlier reading CONFIRMED («12 of the 20 rows are missing») is closed only by a reading that
               observed it closed, or by a record that it was met — never by the next reader failing to answer. This line used to be `list || []`: with
               the second check silent, the 12 missing rows were dropped, `unmet` came out empty and the turn was reported complete over 8 rows of 20
               (measured 2026-11-27). The held finding stays on the record, and goalAt returns to «not put to Atlas» so it is carried into `unmet`. */
            if (list === null && goalPrev && goalPrev.unmet.length) {
              goalUnmet = goalPrev.unmet.map((u) => ({ kind: 'goal', id: u.id, need: u.need, why: u.why }));
              goalAt = -1; trace.goalHeld = goalUnmet.length;
            } else goalUnmet = list || [];
            /* THE SAME FINDING TWICE IS THE LOOP LEARNING NOTHING (the same rule as the output gate's `moved`, below): the reader found these needs unmet,
               Atlas did something, and the reader found the SAME needs. Sending them back again re-streams an answer and withdraws it each round, with
               nothing new to act on. The finding stands on the record (it is still shown as it was); the turn is not bounced for it again. */
            /* …and the identity is the finding's id, not its spelling (see goalIds above): only the needs not yet put to Atlas are sent */
            const fresh = (list || []).filter((u) => !goalPut[u.id]);
            const repeated = !!(list && list.length && !fresh.length);
            if (repeated) trace.goalRepeated = (trace.goalRepeated || 0) + 1;
            /* a reading that is NOT put to Atlas was taken on the record as it now stands, so what it found is the turn's finding: `goalAt` returns to
               «not put» and the end of the turn carries it. (It used to keep the index of the EARLIER bounce, and the work Atlas did since made the
               end of the turn drop a finding the latest reading had just confirmed — the turn was called complete over it.) */
            if (list !== null && !fresh.length) goalAt = -1;
            if (fresh.length) {
              if ((step + 1) < lim.maxSteps && !outOfTime()) {
                fresh.forEach((u) => { goalPut[u.id] = true; });
                goalNote = 'An independent reader checked the request against what this turn produced and found these not met: '
                  + fresh.map((u) => '"' + u.need + '"' + (u.why ? ' (' + u.why + ')' : '')).join('; ')
                  + (metList.length ? '. Already covered: ' + metList.map((m) => '"' + m.need + '"').join('; ') : '')
                  + '. Do them now with function calls and then answer; or, if the request does not actually need them, '
                  + 'reply again with the answer as it stands, and put the reason in note_to_intmap (never shown) — final_text is read by the reader alone and must not mention this check.';
              }
            }
          }
          if (goalNote) {
            trace.steps.push({ step, toolCalls: 0, bounced: 'goal_unmet' });
            transcript.push({ role: 'assistant', content: (reply && reply.text) || '', toolCalls: [], items: (reply && reply.items) || undefined });
            observe([{ ok: false, error: 'goal_unmet', message: goalNote }]);
            goalAt = results.length;   /* put to Atlas: if it then makes no call, nothing was done about it and the finding stays on the record */
            continue;
          }
          /* Wording alone cannot advance a missing output. Another repair needs a changed operation record. */
          const moved = lastBounce.get(code) !== operationProgress;
          if (code && moved && gateBounces < lim.maxOutputGate && (step + 1) < lim.maxSteps && !outOfTime()) {
            lastBounce.set(code, operationProgress);
            gateBounces++; trace.outputGate++;
            /* (#R543) the note names the outputs the declaration asked for and the call that makes
               each one, so the recovery is the same shape whichever was declared: make it now, or
               answer as "text" and say why it could not be made. */
            const how = { map: 'draw it now — compose_map puts the places, their roles and the links between them on the map in ONE call (highlight / map_view are the smaller tools)',
              chart: 'draw it now — chart takes the points, bars or dated events and renders them into this reply (it needs a "source" naming where the numbers came from)',
              mixed: 'produce one of them now — compose_map for the map, chart for the numbers' }[answerMode];
            /* (#R663) …and the same shape again for the other declaration: do it now, or say this
               reply was the answer after all. Neither branch tells Atlas what to conclude. */
            /* (#R742) …and for the third: the turn is ending and final_text is empty. The note says
               what the machine recorded and what the two ways out are — it does not say what to write. */
            const msg = (code === 'calls_in_text') ? inTextNote(inText, true)
              : (code === 'no_answer_written')
              ? 'This reply ends the turn — it made no function calls — and final_text is empty too, so the reader '
                + 'asked a question and would be shown nothing at all. Answer them now in final_text, in their '
                + 'language; or, if the answer needs work first, make those calls in this reply (find_capability '
                + 'finds anything the core tools do not cover, and run_capability runs it) and answer after.'
              : (code === 'no_calls_issued')
              ? 'You marked this reply "continuing" — final_text is not the answer yet and the work goes on in '
                + 'function calls — but this reply made none, so nothing ran, and the reader would be left with a sentence '
                + 'about something that has not happened. Make those calls now, in this reply (find_capability finds '
                + 'anything the nine core tools do not cover, and run_capability runs it); or, if the answer is '
                + 'already complete as it stands, mark this reply "final".'
              : 'You declared answer_mode "' + answerMode + '", but nothing in this turn has produced '
                + (answerMode === 'mixed' ? 'a map or a chart' : (answerMode === 'map' ? 'anything on the map' : 'a chart'))
                + ', so the reader would get words about something that is not there. Either ' + how
                + ' and then answer; or, if it genuinely cannot carry this answer, reply with answer_mode "text" and say so.';
            trace.steps.push({ step, toolCalls: 0, bounced: code });
            transcript.push({ role: 'assistant', content: (reply && reply.text) || '', toolCalls: [], items: (reply && reply.items) || undefined });
            observe([{ ok: false, error: code, message: msg }]);   /* (#R801) fenced on the next call like every tool message, so the fact tracks the fence */
            continue;
          }
          /* (#R663) accepted as the end of the turn — so whatever it says IS the answer, including
             the text held back above when this reply called itself mid-turn and the bounces ran out. */
          if (reply && typeof reply.text === 'string' && reply.text.trim()) text = reply.text;
          trace.steps.push({ step, toolCalls: 0, final: true });
          stopped = stopped || 'answered';
          break;
        }

        if (typeof opts.onStep === 'function') {
          try { opts.onStep({ step, calls: calls.map((c) => c && c.name) }); } catch (_) { /* cosmetic */ }
        }

        const stepResults = [];
        let executedHere = 0;
        /* ══ ⚠⚠⚠ (#R419) A QUESTION TO THE READER IS THE END OF THE TURN ═══════════════════════
           `ask_user` was an ordinary tool: it rendered a picker into the reader's bubble, returned
           {ok:true}, and the loop went round again — so a turn could ask, ask a second time, and
           then go and do the work anyway. Measured on 「ここから大阪駅まで行きたい。」 (the reported
           transcript, reproduced in tests/atlas-turn-checks.test.mjs #R419 ①): two live question cards and a
           finished route, all in the same bubble, the questions already moot by the time they
           appeared. And because the card was live WHILE the turn was still running, answering one
           superseded that turn — three answers, three 「停止しました」, three turns thrown away.
           A question is a request for something the loop does not have. There is nothing to
           continue with until it comes back, so the turn ends here and the reader's reply opens the
           next one. ⚠ THIS TAKES NOTHING FROM ATLAS (CONSTITUTION.md §5): it does not decide
           whether to ask, when to ask, or what to ask — only that having asked, the turn is over.
           The flag lives on the TOOL, not on a name matched here, so the loop still knows nothing
           about what any particular tool means. */
        let ended = '';
        /* ══ ⚠⚠⚠ (atlas-turn-engine) THE CALLS OF ONE REPLY RUN AT THE SAME TIME WHEN NOTHING ORDERS THEM ══════
           This was `for (const call of calls) { … out = await runTool(call); … }` — every call of a reply
           waited for the one before it, whatever it was. MEASURED (#R723, production): a six-operation
           turn took 57.2 s, 13.6 s of it inside operations; a reply that asks find_capability three things
           or runs two research questions paid for them end to end. A model that puts several calls in ONE
           reply has said they belong to one moment; what can order them is the app, not the list.
           So each call waits only for the EARLIER calls of the same reply it conflicts with — the
           registry's own conflict keys (js/atlas-capabilities.js column 5, the keys js/atlas-executor.js
           already locks on), through `footprint` (js/atlas-toolsurface.js footprintOf):
             · the identical call twice waits for the first, so it is answered from it (#R489 below);
             · a call that touches no app state (find_capability, read_result) waits for nothing;
             · a BARRIER — a whole section at once (camera, time, map.all …), a turn-ending question, a
               capability the surface cannot place — waits for everything before it and holds everything
               after it, which is exactly the old order;
             · a call that writes nothing READS the app and waits for every earlier writer;
             · two writers wait for each other only when their keys overlap.
           ⚠ WHAT THE MODEL READS IS UNCHANGED IN ORDER: results are filed back by call position, and the
           turn's `results` receive them in the order the calls were made. ⚠ NOTHING IS TAKEN
           (CONSTITUTION.md §5): no call is dropped, merged or refused, and no ceiling moved — the
           budget below is even assigned in call order, before anything starts, exactly as the loop did. */
        const plans = calls.map((call, i) => {
          const p = { i, call, live: false, counted: false };
          if (trace.calls >= lim.maxToolCalls) return p;      /* answered as call_budget_exhausted when its turn comes */
          trace.calls++; p.counted = true;
          p.bad = reject(call, localTools);
          if (p.bad) return p;
          p.live = true;
          const tool = localTools[call.name];
          /* a promoted tool is executed as the call it stands for — the SAME identity (callKey), the
             same footprint and the same executor as run_capability with that id */
          let routed = call;
          if (tool && typeof tool.route === 'function') {
            try { const r0 = tool.route(call.arguments || {}); if (r0 && r0.name) routed = { id: call.id, name: String(r0.name), arguments: r0.arguments || {} }; } catch (_) { routed = call; }
          }
          p.routed = routed;
          /* (atlas-plan-on-map) a plan call is applied HERE, in call order, so the calls after it in the same
             reply are filed under the step it names — whatever order they then run in. Its answer is the
             ledger's; it has no identity to reuse and no footprint (it touches nothing in the app). */
          if (PLAN && call.name === PLAN.TOOL.name) {
            try { p.planRec = PLAN.declare(call.arguments || {}, { outside: turn.externalContentSeen === true }); }   /* (atlas-outside-mark) a plan written with outside content in front of the model carries the mark into later turns */ catch (e) { p.planRec = { ok: false, error: 'plan_failed', message: (e && e.message) || 'the plan could not be recorded' }; }
            p.fp = { pure: true };
            return p;
          }
          p.planStep = PLAN ? PLAN.attribute() : -1;
          p.planTarget = PLAN?.targetOfCall?.();
          /* (atlas-result-delivery) THE IDENTITY OF A CALL IS THE CAPABILITY IT REACHES AND ITS ARGUMENTS, NOT THE DOOR IT CAME IN BY. compose_map and
             run_capability{id:'map.compose'}, or an alias and its canonical id, are one call. `opts.identify` is the tool surface's
             (js/atlas-toolsurface.js identityOf); a caller without one keeps the tool name and the arguments as written. */
          let idn = null;
          if (identify) { try { idn = identify(routed); } catch (_) { idn = null; } }
          p.ckey = (idn && idn.id) ? TR.callKey('capability:' + idn.id, idn.args) : TR.callKey(routed.name, routed.arguments);
          /* (atlas-child-loop-reuse) the piece of work this call is, as the plan names it to the model: its arguments, written compactly */
          try { const wa = (idn && idn.id) ? idn.args : routed.arguments; p.work = (wa && typeof wa === 'object' && Object.keys(wa).length) ? JSON.stringify(wa).slice(0, 160) : ''; } catch (_) { p.work = ''; }
          let fp = null;
          if (call.name === 'read_result') fp = { pure: true };
          else if (footprint) { try { fp = footprint(routed); } catch (_) { fp = null; } }
          p.fp = (fp && typeof fp === 'object') ? fp : { barrier: true };
          /* a call that may END the turn orders everything after it, however little those touch (#R419 above) */
          p.ends = !!((tool && tool.endsTurn) || p.fp.endsTurn);
          return p;
        });
        /* (atlas-orchestration-efficiency) A CALL'S READING NEEDS NO TURN. A capability that can name what it will read from its arguments alone
           (js/atlas-prefetch.js) has that reading started NOW for every live call of the reply, so the calls that must take turns to WRITE
           (the conflict order below is unchanged) find their data already fetched or on its way. Nothing is dropped or reordered. */
        if (typeof opts.prefetch === 'function') plans.forEach((p) => { if (p.live && p.routed && !p.planRec && !isDone(p.ckey, p.fp)) { try { opts.prefetch(p.routed); } catch (_) { /* a reading that cannot start is read when its turn comes */ } } });
        const deps = plans.map((b, j) => plans.slice(0, j).filter((a) => conflicts(a, b)).map((a) => a.i));
        const toResults = [];                 /* by call position: the records that join `results` */
        const spans = [];                     /* [start, end] per call that ran — the step's own measurement */
        const runOne = async (p) => {
          const call = p.call;
          /* ⚠ THE SAME ORDER OF QUESTIONS AS THE LOOP THIS REPLACED: a turn that already ended says so
             first; then the count; then the clock; then the shape. A call answered before it ran gives
             its budget back, exactly as the old loop never took it. */
          if (ended) {
            if (p.counted) trace.calls--;
            return { id: call && call.id, name: call && call.name, ok: false,
              error: 'turn_ended',
              message: '"' + ended + '" put a question to the reader, which ends this turn. '
                + 'Their reply arrives as the next message; issue this call then.' };
          }
          if (!p.counted) {
            return { id: call && call.id, name: call && call.name, ok: false,
              error: 'call_budget_exhausted',
              message: 'This turn has already run ' + lim.maxToolCalls + ' tools. Answer with what you have.' };
          }
          /* (#R452) …and the same note when it is the clock rather than the count that ran out. */
          if (outOfTime()) {
            trace.calls--;
            return { id: call && call.id, name: call && call.name, ok: false,
              error: 'time_budget_exhausted',
              message: 'This turn has been running for ' + Math.round(lim.turnBudgetMs / 1000)
                + ' s. Answer the reader now with what you have.' };
          }
          if (p.bad) {
            trace.rejected++;
            if (p.bad.code === 'unknown_tool') trace.unknownTool = (trace.unknownTool || 0) + 1;   /* (atlas-verify-metrics) asked for a tool that does not exist — what «found the capability it needed» is measured from */
            /* ⚠ THE READER NEVER SEES THIS. It is a typed note to Atlas, which corrects it on the
               next step. The old console printed 「何を分析しますか？」 for exactly this case. */
            return { id: call.id, name: call.name, ok: false, error: p.bad.code, message: p.bad.message, schema: p.bad.schema };
          }
          /* (atlas-plan-on-map) the plan tool's answer, from the ledger — see `planRec` above */
          if (p.planRec) {
            const prec = Object.assign({ id: call.id, name: call.name }, p.planRec);
            /* (geo-task-planner) a `geo.check` asks the sources what exists; it blocks nothing and is answered with the plan's record */
            if (p.planRec.ok && PLAN.geoPending && PLAN.geoPending()) { try { const gr = await PLAN.preflight(); if (gr) prec.geo = gr; } catch (_) { /* the plan's answer stands without it */ } }
            /* (atlas-table-to-countries) A FACT, NOT A REFUSAL. MEASURED on production 2026-11-21, GPT 6.2 Sol, one request: of the first six model calls, three were replies made of `plan` calls alone (11.4 s, 14.7 s, 8.4 s) before any call that touches the map — each costs a whole model call and one of the turn's steps, and the plan tool's own text already said to make step 1's calls in the same reply. The plan result now says it when it is true of THIS reply; nothing is blocked and no ceiling moves. */
            if (PLAN && calls.length && calls.every((c) => c && c.name === PLAN.TOOL.name)) {
              prec.note = String(prec.note || '') + ' This reply contained only plan calls, so nothing has been done yet, and it used one of the turn steps. Make the calls of step ' + String((prec.plan && prec.plan.current) || 1) + ' next; set "current" in the same reply as the calls of a later step.';
            }
            callById[call.id] = prec;
            executedHere++; trace.executed++;
            return prec;
          }
          /* (#R489) …and the identity check, after `reject` has confirmed the call is well formed
             so a malformed repeat still gets its own schema note. See `doneCalls` above. */
          const ckey = p.ckey;
          if (isDone(ckey, p.fp)) {
            trace.reused++;
            const prior = doneCalls[ckey];
            /* (atlas-turn-engine) an UNOBSERVED call is answered the same way, and says why it is not run
               again: it did run, and the same call on the same page cannot be seen any better. */
            const rec0 = Object.assign({}, prior, { id: call.id, name: call.name, reusedFromEarlierCallThisTurn: true,
              note: prior.code === 'confirmation_declined'
                ? 'The reader declined this exact call. It has not run. Continue without it.'
                : prior.status === 'unobserved'
                ? 'This turn has ALREADY made this exact call, and it RAN — IntMap could not observe whether it took effect ('
                  + String(prior.code || 'unobserved') + '), and nothing has been written since. It was not run a second time. '
                  + 'Observation can come back (a hidden page that returns to the front can be seen), so this is not a statement that it '
                  + 'can never be confirmed: carry on, or tell the reader the effect could not be confirmed yet.'
                : 'This turn has ALREADY made this exact call. Above is what it returned — the app has not '
                  + 'changed since, so a second run would search the same sources over the same window and could only '
                  + 'disagree with itself. Use this result, or ask something different.' });
            /* ⚠ NOT pushed onto `results`: the original run is already there, and the reply is built
               from `results`. Counting as executed is deliberate — the step DID produce results, and
               `malformedRun` below is about a model emitting calls that go nowhere, which this is
               the opposite of. */
            executedHere++;
            /* (atlas-plan-on-map) the step this call serves holds what that earlier run returned */
            if (PLAN && p.planStep >= 0) { try { PLAN.started(call.id, { step: p.planStep, capability: capOfCall(p.routed), key: p.ckey, work: p.work, target: p.planTarget }); PLAN.settled(call.id, rec0); } catch (_) { } }
            return rec0;
          }
          /* (atlas-native-tools) the rest of a result the input had to cut. Answered HERE, from this turn's own
             record, through the same `resultText` the cut was made from — no app call, no network. It
             is not an app result, so it joins neither `results` nor the reply. */
          if (call.name === 'read_result') {
            const a = call.arguments || {};
            const src = callById[String(a.call_id || '')];
            let rr;
            /* (atlas-working-memory) not this turn's: a ref the working memory kept from an earlier turn, a path into it, or the whole record */
            const mem = (!src && opts.memory && typeof opts.memory.recall === 'function' && opts.memory.has(String(a.call_id || ''))) ? opts.memory.recall(String(a.call_id), a.path) : null;
            if (mem && mem.ok) {
              const full = String(mem.text), off = Math.max(0, Math.min(full.length, Math.floor(+a.offset || 0)));
              const piece = full.slice(off, off + INPUT_BUDGET.item - 1000);
              rr = { ok: true, readResult: true, call_id: String(a.call_id), offset: off, total: full.length, text: piece,
                next: (off + piece.length < full.length) ? off + piece.length : null };
            } else if (mem) {
              rr = { ok: false, error: mem.error, message: mem.message };
            } else if (src && a.path) {
              /* a path into a result of THIS turn: the one value, from the original record */
              const hit = atPath(src, a.path);
              rr = hit.found ? { ok: true, readResult: true, call_id: String(a.call_id), offset: 0, total: 0, text: String(a.path) + ' = ' + JSON.stringify(hit.value), next: null }
                : { ok: false, error: 'no_such_path', message: 'No value at "' + String(a.path) + '" in ' + String(a.call_id) + '.' };
            } else if (!src) {
              rr = { ok: false, error: 'unknown_call_id', message: 'No result of this turn has call_id "' + String(a.call_id || '')
                + '". The ids are: ' + Object.keys(callById).join(', ') + '.' };
            } else {
              const full = resultText(src), off = Math.max(0, Math.min(full.length, Math.floor(+a.offset || 0)));
              const piece = full.slice(off, off + INPUT_BUDGET.item - 1000);
              rr = { ok: true, readResult: true, call_id: String(a.call_id), offset: off, total: full.length, text: piece,
                next: (off + piece.length < full.length) ? off + piece.length : null };
            }
            const rrec = Object.assign({ id: call.id, name: call.name }, rr);
            if (ckey && rrec.ok) remember(ckey, rrec);
            callById[call.id] = rrec;
            executedHere++; trace.executed++;
            return rrec;
          }
          let out = null;
          const t0 = now();
          const toolW0 = wallNow();
          /* (atlas-plan-on-map) the step this call serves shows it running until its verdict arrives */
          if (PLAN && p.planStep >= 0) { try { PLAN.started(call.id, { step: p.planStep, capability: capOfCall(p.routed), key: p.ckey, work: p.work, target: p.planTarget }); } catch (_) { } }
          try {
            out = await runTool(p.routed, p.planStep, p.planTarget);   /* (#R452) …with a deadline. See `runTool` above. */
          } catch (e) {
            out = { ok: false, error: 'execution_failed', message: (e && e.message) || 'the tool threw' };
          }
          spans.push([t0, now()]);
          try { ledger.tool({ name: capOfCall(p.routed) || call.name, ms: wallNow() - toolW0, ok: !(out && out.ok === false), delegatedCostUsd: out && out.delegatedCostUsd, delegatedTasks: out && Array.isArray(out.delegated) ? out.delegated.length : undefined }); if (out && Array.isArray(out.delegated) && out.delegated.length) ledger.mark('parentReceived'); } catch (_) { /* a record never breaks the turn */ }
          if (!out || typeof out !== 'object') out = { ok: false, error: 'no_result', message: 'the tool returned nothing' };
          executedHere++;
          trace.executed++;
          const rec = Object.assign({ id: call.id, name: call.name }, out);
          noteWrite(p.fp);   /* (atlas-result-delivery) it ran: whatever it writes is now a reason to run an earlier identical call again */
          /* ⚠ ONLY A SUCCESS IS REMEMBERED. Freezing a failure would turn a transient network error
             into a permanent one for the rest of the turn, which is the opposite of the point.
             ⚠⚠⚠ (#R551) AND A PARTIAL IS NOT A SUCCESS. `ok` is derived from `status` (#R318), so a
             capability that placed five of sixteen and honestly said `partial` still reaches here
             with `ok !== false` — and freezing THAT is worse than freezing a failure: the turn is
             told 「この呼び出しは済んでいる」 for a call that has not finished its job, so re-asking the
             identical question returns the identical half-done answer and the only move left is to
             change the arguments, which is precisely how one request became two maps in the reply.
             A call that still owes something must be allowed to be made again. */
          if (ckey && rec.ok !== false && rec.status !== 'partial' && rec.status !== 'running' && rec.status !== 'needs_input') remember(ckey, rec);
          // An identical request in this turn must respect the reader's decision.
          if (ckey && rec.code === 'confirmation_declined') remember(ckey, rec);
          /* ══ ⚠⚠⚠ (atlas-turn-engine) …AND A CALL THAT RAN BUT COULD NOT BE SEEN IS DONE, NOT OWED ═══════════
             `unobserved` (js/atlas-results.js) used to arrive as `partial` + `not_rendering`, and a partial
             is exactly what the line above lets be made again — so a draw that had done its whole job on a
             page that was not compositing was run again, and again (one-pass-or-a-reason §4, the third
             question: the same call must be able to say 「もう済んでいる」). It is remembered as done, and
             the model is told in the result itself what it is looking at. `ok` stays false: an effect
             nobody observed is not claimed, and nothing downstream reads it as produced. */
          if (rec.status === 'unobserved') {
            if (!rec.note) {
              rec.note = 'This call RAN. IntMap could not observe whether it took effect (' + String(rec.code || 'unobserved')
                + ') — that is not a failure of the request. Making the same call again changes nothing until the page can be observed '
                + '(a hidden tab observes again once it is in front), and it is answered from this record if nothing is written in between. '
                + 'Carry on, or tell the reader the effect could not be confirmed yet.';
            }
            if (ckey) remember(ckey, rec);
          }
          /* (#R760) the same call, answering the same way, is not progress — whatever status it wears */
          if (ckey && rec.status === 'partial') {
            /* (atlas-early-results) `progressKey` is what a call that waits for the NEXT arrival states about where it stands (which pieces are
               still running): the same arguments asked again after another piece arrived is not the same verdict. */
            const verdict = String(rec.code || rec.error || '') + '|' + String(rec.status || '') + '|' + String(rec.progressKey || '');
            if (partialCalls[ckey] === verdict) {
              rec.repeatedPartialCallThisTurn = true;
              rec.note = 'This turn has ALREADY made this exact call and it came back with the same verdict ('
                + String(rec.code || 'partial') + '). Repeating it unchanged can only produce that verdict again. '
                + 'Read what the result says is missing and change the call, or tell the reader what you have.';
            }
            partialCalls[ckey] = verdict;
          }
          /* ⚠⚠⚠ (#R760) A REFUSAL ABOUT THE KIND OF REQUEST IS NOT ABOUT ITS SPELLING. #R741's
             ledger keys on the exact arguments, so five differently-worded names for a metric IntMap
             does not hold read as five different requests (measured: 「CO2 emissions per capita」,
             5 m 30 s, no map and no answer). When the capability DECLARES the refusal permanent, the
             class — this tool, this reason — is what has already been refused. Nothing is taken: the
             call still runs, and a capability that declares nothing is unaffected. */
          if (rec.permanentFailure && rec.ok === false && rec.status !== 'unobserved') {
            const cls = String(call.name || '') + '|' + String(rec.error || '');
            if (permanentFails[cls]) {
              rec.repeatedFailedCallThisTurn = true;
              rec.note = 'This turn has ALREADY been refused this KIND of request, for the reason above — it is not '
                + 'about how the request was worded, so rewording it cannot help. Use one of the values that reason '
                + 'names, ask for something else, or tell the reader plainly that IntMap does not hold this.';
            }
            permanentFails[cls] = true;
          }
          /* (#R741) the refusal that has already been given, named as such — see `failedCalls` above */
          if (ckey && rec.ok === false && rec.status !== 'unobserved') {
            if (failedCalls[ckey]) {
              rec.repeatedFailedCallThisTurn = true;
              rec.note = 'This turn has ALREADY made this exact call and it was refused for the reason above. '
                + 'Nothing in the app has changed since, so the identical call can only be refused again — '
                + 'read that reason and use one of the values it names, or ask something different.';
            }
            failedCalls[ckey] = true;
          }
          /* ⚠⚠⚠ (#732) THE SAME WORK UNDER DIFFERENT WORDS. `ckey` is the call's ARGUMENTS, so the identical
             line drawn four times under four captions was four different calls here, each run and each
             `ok`, and nothing ever told Atlas the map still held ONE line (measured on production
             2026-09-18, R802 §10 ⑥). The capability knows what it did and says so in `resultKey`
             (js/atlas-toolsurface.js carries it out); a later call that did the SAME thing is named as
             such, exactly as #R731 names a reused answer. ⚠ NOTHING IS TAKEN (CONSTITUTION.md §5): the
             call ran — a restyle is applied — and nothing is refused; a revision of an artefact states
             its revision and is a successor, never a repeat. Only a success is remembered, as above. */
          if (rec.resultKey && rec.ok !== false && rec.status !== 'partial' && rec.status !== 'running' && rec.status !== 'needs_input') {
            const rid = String(rec.resultKey) + (rec.revision != null ? '@' + rec.revision : '');
            if (doneResults[rid] && doneResults[rid] !== ckey) {
              rec.sameResultAsEarlierCallThisTurn = true;
              rec.note = 'An earlier call in this turn already did exactly this (' + String(rec.resultKey).slice(0, 120) + '). '
                + 'The app holds ONE of it, not two — whatever this call changed (a caption, a colour) was applied to that '
                + 'same one, and nothing new was produced. Use that result, or do something different.';
            } else if (!doneResults[rid]) doneResults[rid] = ckey || rid;
          }
          if (PLAN && p.planStep >= 0) { try { PLAN.settled(call.id, rec); } catch (_) { } }
          toResults[p.i] = rec;
          /* the TOOL may declare it, or the RESULT may — the second is how a generic invoker
             (`run_capability`) reports that the capability it reached was a turn-ending one. */
          if (out.ok !== false && ((localTools[call.name] && localTools[call.name].endsTurn) || out.endsTurn === true)) ended = call.name;
          return rec;
        };
        /* each call starts once every earlier call it conflicts with has settled; `runOne` never throws */
        const settled = [];
        plans.forEach((p, j) => {
          settled[j] = Promise.all(deps[j].map((i) => settled[i])).then(() => runOne(p))
            .then((rec) => { stepResults[j] = rec; }, (e) => {
              stepResults[j] = { id: p.call && p.call.id, name: p.call && p.call.name, ok: false, error: 'execution_failed', message: (e && e.message) || 'the tool threw' };
            });
        });
        await Promise.all(settled);
        operationProgress += toResults.filter((r) => r && !r.reusedFromEarlierCallThisTurn && !r.repeatedFailedCallThisTurn
          && !r.repeatedPartialCallThisTurn && !r.sameResultAsEarlierCallThisTurn).length;
        toResults.forEach((rec) => { if (rec) results.push(rec); });
        /* ── (atlas-turn-engine) PROMOTION: what this step found is a tool from the next step on — see
              `promoted` above. Only a result that RAN and succeeded promotes (a reused one already did). */
        if (promote) {
          toResults.forEach((rec) => {
            if (!rec || rec.ok === false) return;
            let defs = [];
            try { defs = promote(rec) || []; } catch (_) { defs = []; }
            if (!Array.isArray(defs) || !defs.length) return;
            const added = [], held = [], over = [];
            defs.forEach((d) => {
              if (!d || typeof d.name !== 'string' || !d.name) return;
              if (localTools[d.name]) { held.push(d.name); return; }   /* already a tool — a CORE one, or promoted earlier */
              if (offeredCount() >= lim.maxOfferedTools) { over.push(d.capabilityId || d.name); return; }
              const def = Object.assign({}, d, { promoted: true });
              promoted.push(def); localTools[def.name] = def; added.push(def.name);
            });
            if (!added.length && !held.length && !over.length) return;
            rec.promotedTools = added.concat(held);
            /* (atlas-prompt-weight) A SCHEMA IS SENT ONCE. A match found by find_capability carried its full argument schema in this
               result AND, from the next call on, the same schema in the tool definition it was just promoted to (or already had, if a core
               tool) — the same bytes twice, and this result is replayed on every later call of the turn. Measured on a wide query: 7,351 of the
               result's 9,359 characters were schemas that the 12,987 characters of promoted definitions repeat. A match that IS now a
               tool keeps its id, tool name and summary and says where its schema is; one that was NOT offered (over the function limit)
               keeps its schema, because run_capability is the only way to it. Nothing is withheld: the schema is in the definition. */
            if (Array.isArray(rec.matches)) {
              const now = new Set(rec.promotedTools);
              rec.matches = rec.matches.map((m) => (m && m.schema !== undefined && now.has(m.tool)) ? Object.assign({}, m, { schema: undefined, schemaIn: 'the definition of the tool «' + m.tool + '»' }) : m);
            }
            rec.promotionNote = (added.concat(held).length
              ? 'From your next reply these are tools you call DIRECTLY by name, with the arguments their schema declares: '
                + added.concat(held).join(', ') + ' (each is the same as run_capability with its id — use whichever).'
              : '')
              + (over.length ? (added.length || held.length ? ' ' : '') + 'Not offered as tools, because a call may declare at most '
                + lim.maxOfferedTools + ' functions: ' + over.join(', ') + ' — reach them with run_capability.' : '');
            if (!trace.promoted) trace.promoted = [];
            added.forEach((n) => trace.promoted.push({ step, tool: n }));
          });
        }
        /* the step's own measurement: how long the calls took one after another, and how long the step
           actually waited — the difference is what running them together saved. A record, never a reason. */
        const wall = spans.length ? (Math.max.apply(null, spans.map((s) => s[1])) - Math.min.apply(null, spans.map((s) => s[0]))) : 0;
        const serial = spans.reduce((a, s) => a + (s[1] - s[0]), 0);
        const peak = peakConcurrency(spans);   /* (atlas-autonomy) the most at ONE instant — the old count of overlaps with each span read A=[0,10] with B=[0,4] and C=[6,10] as 3 when never more than 2 ran */
        trace.stepTiming = trace.stepTiming || [];
        trace.stepTiming.push({ step, ran: spans.length, wallMs: wall, serialMs: serial, concurrent: peak, firstDoneAt: spans.length ? Math.min.apply(null, spans.map((s) => s[1])) : null, lastDoneAt: spans.length ? Math.max.apply(null, spans.map((s) => s[1])) : null });
        /* (atlas-native-tools) the calls past `maxPerStep` — answered as not run, see `allCalls` above */
        allCalls.slice(lim.maxPerStep).forEach(function (c) {
          stepResults.push({ id: c && c.id, name: c && c.name, ok: false, error: 'step_call_limit',
            message: 'This reply made more than ' + lim.maxPerStep + ' calls; this one was not run. Make it in your next reply if you still need it.' });
        });
        stepResults.forEach(function (r) { if (r && r.id && !callById[r.id]) callById[r.id] = r; });
        /* (atlas-working-memory) every answered call is kept WHOLE, by ref, before any trimming can touch it — so a number a
           tool returned is reachable from the original in a later step and a later turn (read_result), never only from a summary.
           Discovery (find_capability), the plan tool and the loop's own read_result are not app results and are not kept. */
        if (MEM) stepResults.forEach(function (r) {
          if (!r || !r.id || r.readResult === true || r.name === 'find_capability' || r.name === 'plan') return;
          const c = allCalls.find(function (x) { return x && x.id === r.id; });
          try { MEM.noteResult(MEM_TURN, r.id, r.name, c && c.arguments, r); } catch (_) { /* a memory fault never takes the turn down */ }
        });

        malformedRun = executedHere ? 0 : (malformedRun + 1);
        trace.steps.push({ step, toolCalls: calls.length, executed: executedHere });
        transcript.push({ role: 'assistant', content: (reply && reply.text) || '', toolCalls: allCalls, items: (reply && reply.items) || undefined });
        observe(stepResults);
        /* (atlas-legacy-protocol-removal) the function calls ran; the ones written into the message did not, and that is said */
        if (inText.length) observe([{ ok: false, error: 'calls_in_text', message: inTextNote(inText, false) }]);

        if (ended) {
          stopped = 'awaiting_user';
          break;
        }
        /* ⚠ (#R731) THE SAME CALL, MADE AGAIN AFTER ITS OWN ANSWER WAS HANDED BACK, IS NOT PROGRESS.
           ⚠ (#R741) …and neither is the same call made again after its own REFUSAL. */
        repeatRun = (stepResults.length && stepResults.every((r) => r && (r.reusedFromEarlierCallThisTurn || r.repeatedFailedCallThisTurn || r.repeatedPartialCallThisTurn || r.sameResultAsEarlierCallThisTurn))) ? (repeatRun + 1) : 0;   /* (#732) …or the same work under different words */
        if (repeatRun >= lim.maxRepeatSteps) {
          stopped = 'repeated_calls';
          break;
        }
        if (malformedRun >= lim.maxMalformed) {
          stopped = 'malformed_limit';
          break;
        }
        if (trace.calls >= lim.maxToolCalls) {
          /* Not an ending: Atlas still gets one more step to write the answer, with the budget
             note already in the transcript above. */
          if (step + 1 >= lim.maxSteps) stopped = 'call_budget';
        }
      }

      if (!stopped) stopped = 'step_budget';

      /* ⚠ ONE LAST CALL WHEN TOOLS RAN AND NOTHING WAS SAID. A turn that spent its steps operating
         IntMap and never wrote a sentence would render as silence; the reader asked a person, not a
         command line. It costs a step from the SAME turn key, so it is not a second daily use.
         ⚠ (#R419) NOT AFTER A QUESTION. A turn that ended by asking has already written its message
         — the question, in the reader's bubble, with its options. Spending a model call to add a
         sentence under it would answer nothing and would cost the reader a call from a turn whose
         whole point is that it is waiting. */
      /* ⚠⚠⚠ (#R742) …AND A TURN THAT RAN NOTHING AND SAID NOTHING RENDERS AS THE SAME SILENCE.
         `results.length` made this last hand-back unreachable for exactly the turns measured above,
         where the reader got 「Done.」: no tool ran, so there were no results to write about, so the
         one thing that asks for an answer was skipped. What the condition is about is the reader
         having nothing — that is `text`, and it is already in the line. The prompt names what the
         transcript actually contains, so nothing invites a claim about work that did not happen. */
      /* ⚠⚠⚠ (#R802) …AND A TURN THAT RAN OUT HAD ALREADY FILLED THE SLOT THIS ASKS ABOUT.
         MEASURED on production 2026-09-18 (build 2026-09-18-R783), ten questions: SIX turns showed
         the reader the working-limit note, and several of those had SUCCEEDED at the work. The two
         worst — 「…top 10 countries by GDP per capita … which of them are NOT in the top 10 by total
         GDP」, `repeated_calls`, 8 calls, both rankings fetched and the choropleth painted, and the
         whole reply was 「I'm comparing the two rankings now.」; and 「1914年のヨーロッパの国境…」,
         `step_budget`, 9 calls, 415 s, on 「…整理します。」 — ended with the answer in the transcript
         and a plan in the bubble. A sentence written on a step the output gate then BOUNCED lands in
         `text` (that reply issued no calls, so #R742's holding place does not take it), which is
         not an answer but is not empty either, so this hand-back — which asks only when NOTHING was
         written — was skipped for exactly the turns with the most to report.
         The `text` clause below is unchanged and still means what it meant. What joins it is the
         other way a turn ends with the reader holding nothing: it ran out of room, which the loop
         already records by name. ⚠ NO BUDGET MOVES (CONSTITUTION.md §5, one-pass-or-a-reason §3):
         the same single call, off the same turn key, at the same `lim.maxSteps` index the empty
         case uses — the ceilings above are untouched. */
      /* ⚠⚠⚠ (atlas-unbounded-execution, 2026-11-24) …AND A TURN THAT WAS STOPPED IS NOT MADE TO PRETEND IT FINISHED.
         The user: a turn stopped half-way was being forced to write an answer it obviously could not give — wasted work,
         and a reply that reads as an answer when it is not. With the counts gone, a turn now stops only for a reason the
         loop KNOWS: no progress (the same call again, or nothing but rejected calls) or money (the server refused the
         next call — there is no call left to make). In neither case does one more model call produce what the steps
         before it could not. So a stopped turn ends with what it HAS: the sentences Atlas wrote on the way (`interim`),
         the results on screen, and `stopped` naming why — the caller says so in one line and offers to continue.
         The empty-reply hand-back below is untouched: a turn that FINISHED (Atlas decided it was done) with nothing
         written still gets its one call, because there the answer is possible and simply was not written. */
      const cutShort = CUT_STOPS[stopped] === 1;
      let writeAnswer = false;
      if (!String(text || '').trim() && !cutShort && stopped !== 'aborted' && stopped !== 'transport'
          && stopped !== 'awaiting_user') writeAnswer = true;
      const finalStep = trace.steps.length;
      if (writeAnswer) {
        { const pt = trace.stepTiming && trace.stepTiming[trace.stepTiming.length - 1];
          if (pt && pt.usedAt == null) { pt.usedAt = now(); pt.firstResultHeldMs = pt.firstDoneAt != null ? Math.max(0, pt.usedAt - pt.firstDoneAt) : 0; } }
        try {
          const last = await model({
            system: opts.system || '',
            /* (#R742) the two prompts name what the transcript CONTAINS, so nothing invites a claim about work that did not
               happen. (#R802's third prompt — for a turn that ran out — is gone with the forced answer, see above.) */
            messages: transcript.concat([{ role: 'user', content: results.length
              ? '[WRITE THE ANSWER] The tool results above are what actually happened. Reply to the reader now, '
                + 'in their language, with no further tool calls.'
              : '[WRITE THE ANSWER] This turn has ended with nothing written for the reader, and no tool was run. '
                + 'Answer their question now, from what you know, in their language, with no further tool calls — '
                + 'and if it cannot be answered, say that and say why.' }]),
            /* (atlas-native-tools) the SAME tool list, with `final` telling the transport to allow no call
               (tool_choice "none"): an empty list would change the prefix the provider caches on
               the one call that re-sends the whole turn, and would leave the transcript naming
               functions the request no longer declares */
            tools: offered(), step: finalStep, signal: opts.signal, final: true,
          });
          /* ⚠ (#R802) AND A CALL THAT CAME BACK WITH NOTHING DOES NOT ERASE WHAT THE TURN HAD. On the
             empty-`text` path this is the same assignment it always was (「」 over 「」); on the new one
             there is something to lose, and losing it would trade a partial answer for silence. */
          if (last && typeof last.text === 'string' && last.text.trim()) text = last.text;
          if (last && last.finish && last.finish.status === 'incomplete') {
            (trace.incomplete = trace.incomplete || []).push({ step: finalStep, reason: last.finish.reason || null });
          }
          trace.steps.push({ step: finalStep, final: true, forced: true });
        } catch (e) {
          /* keep whatever we have; the caller degrades — (atlas-completion) and the failure is RECORDED,
             not swallowed: without it a turn whose last hand-back failed and one that was never asked
             for one are the same trace. */
          trace.finalError = errorInfo(e);
        }
      }
      /* (#R742) the provisional sentence, taken back when no answer was ever written over it — the
         turn that ended by asking the reader a question is the one this is for. */
      if (!cutShort && !String(text || '').trim() && String(midText || '').trim()) text = midText;   /* (atlas-unbounded-execution) not on a stopped turn: there the provisional sentence stays provisional (`interim`), and is not promoted into the answer's place */
      /* ⚠ (#R742) AND IF IT IS STILL EMPTY, THE TURN SAYS SO RATHER THAN REPORTING SUCCESS. 'answered'
         is Atlas having finished; a turn with no answer in it did not. Only that one value is
         replaced: every other stop already names what happened to it, and js/atlas-console.js reads
         those names to decide which note goes under the reply. */
      if (!String(text || '').trim() && stopped === 'answered') stopped = 'no_answer';

      /* (#R511)(#R543) `answerMode` is what Atlas DECLARED, reported as declared. `produced` is what
         the machine recorded — the whole set now, not one boolean per output, so a third modality
         needs no new field here. `mapDrawn` is that set's map member under #R511's name, kept
         because js/atlas-console.js's diagnostic line reads it. When declaration and record
         disagree after the bounces ran out, both are visible. */
      const produced = [];
      results.forEach((r) => producedBy(r).forEach((m) => { if (produced.indexOf(m) < 0) produced.push(m); }));
      /* ⚠⚠ (atlas-completion) A DECLARED OUTPUT THAT NEVER APPEARED IS NOT «ANSWERED». MEASURED in this
         loop with a model that declared answer_mode "map" three times and drew nothing:
         {"modelCalls":3,"stopped":"answered","mapDrawn":false,"outputGate":2} — the gate's two bounces
         ran out and the turn reported the same success as one that drew. The bounces are unchanged
         (one-pass-or-a-reason §3: the ceiling is not the fix); what changes is what the turn SAYS when
         they run out. Only 'answered' is renamed — every other stop already names what happened, and
         the sentence Atlas wrote is returned as it stands. */
      const ranModes = [];
      results.forEach((r) => ranBy(r).forEach((m) => { if (ranModes.indexOf(m) < 0) ranModes.push(m); }));
      const outputUnmet = unmetOf(answerMode, produced, null, ranModes).length > 0;
      if (outputUnmet && stopped === 'answered') stopped = 'output_unmet';
      endPlan(stopped);
      /* …and the plan, read AFTER endTurn has settled what was still in flight (unobserved / stopped) */
      let planSnap = null;
      if (PLAN) { try { planSnap = PLAN.snapshot(); } catch (_) { planSnap = null; } }
      const verified = trace.goalCheck === 'met' && goalPrev?.met.length > 0 && !trace.goalUnconfirmed?.length && goalVerifiedAt === operationProgress;
      const unmet = unmetOf(answerMode, produced, planSnap, ranModes, verified).concat(goalUnmet);
      const completion = !String(text || '').trim() ? 'none' : (unmet.length ? 'partial' : 'complete');
      /* (growth-loop) THE KIND OF ANSWER, ANNOUNCED — the one line this loop says to the outside. When the
         turn hands the reader an answer (Atlas finished, or a ceiling closed it after the answer was
         written — CUT_STOPS; not a cancelled turn, a transport failure, a question back to the reader or an
         empty reply), the mode Atlas DECLARED is broadcast on the kernel bus the console already announces
         the question on: {kernel:'atlas', phase:'answered', answerMode}. js/usage-counts.js counts it under
         the same consent as the question (Do Not Track / GPC / the Settings switch). Nothing of the question
         or the answer travels. ⚠ A broadcast, not a dependency: `opts.os` injects the bus (the node checks);
         otherwise the page's one bus, IntMapOS, if it exists — absent (node, a test) it is simply not said,
         and nothing about the turn depends on it either way. */
      if (String(text || '').trim() && (stopped === 'answered' || stopped === 'output_unmet' || CUT_STOPS[stopped]) && ANSWER_MODES.indexOf(answerMode) >= 0) {   /* (atlas-completion) 'output_unmet' is a turn that answered with what it had — counted as before */
        try {
          const bus = (opts.os !== undefined) ? opts.os : (typeof globalThis !== 'undefined' ? globalThis.IntMapOS : null);
          if (bus && typeof bus.emit === 'function') bus.emit({ kernel: 'atlas', phase: 'answered', answerMode });
        } catch (_) { /* counting never breaks the turn */ }
      }
      trace.run = ledger.summary();   /* (job-cost-ledger) */
      try { RUN_HISTORY.add(trace.run, opts.label); } catch (_) { /* a record never breaks the turn */ }
      return { text: String(text || ''), interim: interim.filter((x) => x.text !== String(text || '')), calls: trace.calls, results, trace, stopped, answerMode, run: trace.run,
        produced, mapDrawn: produced.indexOf('map') >= 0, externalContentSeen: turn.externalContentSeen,
        unmet, completion, outputIncomplete: !!(trace.incomplete && trace.incomplete.length),
        plan: PLAN ? planSnap : undefined };
    }

    /**
     * readReply(data, text, parseJSON, meta, output) -> {text, toolCalls, callsInText, …}
     * The one place a provider's answer is turned into a step. Kept here rather than in js/atlas-console.js
     * so tests/atlas-agent-loop-checks.test.mjs (#R406) checks the parsing the browser actually uses.
     */
    function readReply(data, text, parseJSON, meta, output) {
      const d = (data && typeof data === 'object') ? data : null;
      /* (#R801) whether the provider's hosted web search ran or was attached on THIS call — ai-proxy's
         meta.webUsed / meta.webAttached, read by the loop as `reply.webUsed` (see `turn` in runTurn) */
      const webUsed = !!(meta && (meta.webUsed || meta.webAttached));
      /* (atlas-native-tools) NATIVE CALLS: ai-proxy (meta.protocol 2) returns the provider's output items, and every
         `function_call` among them is a call with the provider's own id. They are also kept whole as
         `items`, so the next step replays exactly what the model produced (its reasoning included).
         ⚠ (atlas-legacy-protocol-removal) THEY ARE THE ONLY CALLS. `tool_calls` inside the written JSON was the
         one-string transport's, and is no longer read as a call: it has no provider id, so its output
         would answer a function_call the provider never issued. It is reported instead (`callsInText`). */
      const native = Array.isArray(output) ? output.filter((it) => it && typeof it === 'object' && it.type) : null;
      const calls = [];
      (native || []).forEach((it, i) => {
        if (it.type !== 'function_call' || !it.name) return;
        let args = it.arguments;
        if (typeof args === 'string') {
          try { args = typeof parseJSON === 'function' ? parseJSON(args) : JSON.parse(args); } catch (_) { args = null; }
        }
        /* an unparseable arguments string is an EMPTY argument set, which the schema check then rejects and hands back */
        if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
        calls.push({ id: it.call_id ? String(it.call_id) : 't' + i, name: String(it.name), arguments: args });
      });
      const callsInText = (d && Array.isArray(d.tool_calls))
        ? d.tool_calls.filter((c) => c && typeof c === 'object' && c.name).map((c) => String(c.name)) : [];
      /* (#R511) the declared kind of answer; anything outside the vocabulary is simply not a declaration */
      const am = d ? String(d.answer_mode || d.answerMode || '').toLowerCase() : '';
      /* (#R663) …and what this reply IS, read the same way: a word outside the vocabulary, or none
         at all, is no declaration — and no declaration is exactly the behaviour that shipped. */
      const ts = d ? String(d.turn || d.turnState || '').toLowerCase() : '';
      /* ⚠ A REPLY THAT IS MACHINE-SHAPED IS NOT PROSE. When the JSON could not be parsed — the model ran
         past its length, or wrote two objects back to back — `d` is null and the raw text used to be
         handed to the reader as the answer: measured on production (2026-09-15), the final bubble of an
         ISS question read «{"turn":"continuing","tool_calls":[{"name":"run_capability"…». Text that
         opens a JSON object and names the turn schema's own keys is refused as prose, so the caller's
         degrade path runs instead (the mechanical results stay on screen; nothing is invented). */
      const prose = d ? '' : String(text || '');
      /* no regular expression here — this loop matches no pattern against a reply (tests/atlas-agent-loop-checks.test.mjs #R663 ③); the
         shape is read with indexOf on the schema's own quoted keys */
      const opens = prose.trimStart().charAt(0) === '{';
      /* (atlas-legacy-protocol-removal) "tool_calls" / "arguments_json" are the retired envelope's keys, kept here: a model
         that still writes that shape, unparseably, is writing machine text all the same */
      const machine = opens && ['"tool_calls"', '"turn"', '"final_text"', '"answer_mode"', '"arguments_json"'].some(function (k) { return prose.indexOf(k) >= 0; });
      return { text: String((d && d.final_text) || (machine ? '' : prose)), toolCalls: calls, callsInText,
        answerMode: ANSWER_MODES.indexOf(am) >= 0 ? am : '',
        turnState: TURN_STATES.indexOf(ts) >= 0 ? ts : '', webUsed,
        /* (atlas-unbounded-execution) what this reply declared its NEXT reply needs; a value outside the vocabulary, or null
           (the strict dialect's «absent»), is no declaration */
        nextEffort: (d && NEXT_EFFORTS.indexOf(String(d.next_effort || '').toLowerCase()) >= 0) ? String(d.next_effort).toLowerCase() : '',
        noteToIntMap: (d && typeof d.note_to_intmap === 'string') ? d.note_to_intmap.slice(0, 600) : '',
        nextOutput: (d && Number.isInteger(d.next_output_tokens) && d.next_output_tokens > 0) ? d.next_output_tokens : 0,
        /* (job-cost-ledger) what the proxy said this ONE answer cost and which model served it — undefined when it did not say */
        usage: proxyUsage(meta),
        items: native && native.length ? native : undefined,
        /* (atlas-native-tools) what the proxy's own fence cut from THIS input, reported rather than done in silence */
        serverTrim: (meta && meta.inputTrimmed) || undefined,
        /* (atlas-completion) HOW THE PROVIDER SAID THIS REPLY ENDED. ai-proxy carries OpenAI's
           `status:"incomplete"` and `incomplete_details.reason` as meta.status / meta.incompleteReason,
           and other providers' stop reason as meta.finishReason. A reply is incomplete only when the
           proxy SAID so — no provider's stop words are interpreted here; the reason is carried verbatim. */
        finish: {
          status: (meta && (meta.status === 'incomplete' || meta.incompleteReason)) ? 'incomplete' : 'complete',
          reason: (meta && (meta.incompleteReason || meta.finishReason)) ? String(meta.incompleteReason || meta.finishReason) : null,
        } };
    }

    const API = { transportSay, LIMITS, FINAL_SCHEMA, ANSWER_MODES, TURN_STATES, CUT_STOPS, INPUT_BUDGET, READ_RESULT_TOOL, conflicts, keysOverlap,
      runTurn, runLine, runHistory: RUN_HISTORY, reject, readReply, validateAgainst, composeInput, historyItems, resultText };
    try { window.IntMapAtlasAgent = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
