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
 *  ⚠ NO DOM, NO NETWORK, NO GLOBALS. `model` and `execute` are injected, so tests/r406-agent.test.mjs
 *  drives THIS module — the one the browser runs — against a scripted model with no browser and no
 *  key. That is the js/atlas-answer-pipeline.js pattern and it is the reason the E2E matrix in this
 *  round is not a second architecture.
 * ==========================================================================*/

export function makeAtlasAgent() {
  return (function () {

    /* ── The technical ceilings. They bound the LOOP; they never decide what it should do. ──────
       ⚠ `maxSteps` COUNTS AGAINST A SERVER BUDGET IT DOES NOT OWN. supabase/functions/ai-proxy
       charges every call carrying one `x-intmap-turn` key against TURN_MAX_CALLS = 6, and a tool
       Atlas runs may itself ask the model (analyze → js/atlas-answer-pipeline.js spends one, and
       two if its audit repairs). Four leaves that room. Going to six here would mean the reader's
       LAST step — the sentence — is the one that 429s, which is the worst possible place to run
       out. `stopped:'transport'` below is the belt to this braces. */
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
       call is worse still, because `analyze` may spend up to MAX_MODEL_CALLS (2, in
       js/atlas-answer-pipeline.js) of those plus its 32 s evidence gather plus a 20 s pinning pass:
       roughly 200 s for ONE tool call that is working perfectly. Both first drafts would therefore
       have fired on turns that were about to succeed, replacing a good answer with a degraded one —
       which is precisely the 「制限を増やす方向」 this round was told not to take. The values below
       clear the measured worst case with room, and nothing else decides them. */
    const LIMITS = {
      maxSteps: 8,          /* model calls in one turn, the final answer included */
      maxToolCalls: 32,     /* (#R413) 16 → 32: the step count doubled above, so the same headroom per step */
      maxPerStep: 8,        /* tool calls accepted from a single model reply */
      maxMalformed: 3,      /* consecutive steps that produced nothing but rejected calls */
      toolTimeoutMs: 240000,  /* (#R452) ONE tool call — above the ~200 s a working `analyze` can cost. Past it Atlas is TOLD it did not finish, and chooses again */
      turnBudgetMs: 600000,   /* (#R452) …and the whole turn — three times the longest turn ever measured, so it only ever fires on one that was not going to end */
    };

    /* ── THE WIRE SHAPE OF ONE STEP ────────────────────────────────────────────────────────────
       Two fields, and either may be the whole reply. `final_text` alone ends the turn — the shape
       the old PLAN_SCHEMA had no way to express, which is why every ordinary question had to be
       dressed up as an `answer` action.
       ⚠ `arguments_json` IS A STRING ON PURPOSE. A tool's arguments differ per tool, so the field
       is a free-form object — and OpenAI's strict json_schema mode cannot express one: an object
       with no declared properties makes strictJsonSchema() return null, which drops the WHOLE
       schema to plain json_object mode and takes the enforcement of `name` down with it. Carrying
       the arguments as JSON text keeps every other field strictly checked, and is what native
       function calling does with them anyway. The caller accepts an object too, for a model that
       sends one regardless. */
    const TURN_SCHEMA = {
      type: 'object',
      required: ['final_text'],
      properties: {
        final_text: { type: 'string' },
        tool_calls: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'arguments_json'],
            properties: { name: { type: 'string' }, arguments_json: { type: 'string' } },
          },
        },
      },
    };

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
      try {
        validateAgainst(tool.parameters, call.arguments, name, errs);
      } catch (e) {
        errs.push('arguments could not be read: ' + ((e && e.message) || 'unknown'));
      }
      if (errs.length) {
        return {
          code: 'invalid_arguments',
          message: 'The call to "' + name + '" does not match its schema: ' + errs.slice(0, 6).join('; ')
            + '. Re-issue the SAME call with the arguments corrected.',
          schema: tool.parameters,
        };
      }
      return null;
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
     *   execute(call)   -> {ok, …}                                        — the mechanical executor
     *   system          the core instruction (short — js/atlas-policy.js)
     *   messages        [{role:'user'|'assistant', content}]              — the conversation so far
     *   limits          partial override of LIMITS (technical only)
     *   signal          AbortSignal for the Stop button
     *   onStep(info)    optional progress callback (stage dots); never decides anything
     */
    async function runTurn(opts) {
      opts = opts || {};
      const lim = Object.assign({}, LIMITS, opts.limits || {});
      const tools = opts.tools || {};
      const model = opts.model;
      const execute = opts.execute;
      if (typeof model !== 'function') throw new Error('runTurn: opts.model is required');

      const transcript = (opts.messages || []).slice();
      const trace = { steps: [], calls: 0, rejected: 0, executed: 0 };
      const results = [];
      let text = '';
      let malformedRun = 0;
      let stopped = '';

      /* (#R452) the turn's clock. `now()` is injected in the node checks, which have no wall time. */
      const now = (typeof opts.now === 'function') ? opts.now : (() => Date.now());
      const startedAt = now();
      const outOfTime = () => (lim.turnBudgetMs > 0) && ((now() - startedAt) >= lim.turnBudgetMs);
      /* ⚠ THE RESULT IS A TYPED NOTE TO ATLAS, NOT AN ABORT. A tool that overran its deadline is
         abandoned — the turn stops WAITING for it — and what goes into the transcript is the same
         mechanical record every other outcome gets, so the next step is chosen by Atlas knowing what
         happened rather than by this loop deciding on its behalf. */
      const runTool = (call) => {
        const p = Promise.resolve().then(() => execute(call));
        if (!(lim.toolTimeoutMs > 0)) return p;
        let tm = null;
        const clock = new Promise((res) => { tm = setTimeout(() => res({ ok: false, error: 'tool_timeout',
          message: '"' + String((call && call.name) || '') + '" did not finish within '
            + Math.round(lim.toolTimeoutMs / 1000) + ' s and was left running; nothing it was fetching '
            + 'arrived in time. Answer with what you have, or try a different approach.' }), lim.toolTimeoutMs); });
        return Promise.race([p, clock]).finally(() => { try { clearTimeout(tm); } catch (_) { /* already fired */ } });
      };

      for (let step = 0; step < lim.maxSteps; step++) {
        if (opts.signal && opts.signal.aborted) { stopped = 'aborted'; break; }
        if (outOfTime()) { stopped = 'time_budget'; break; }

        let reply = null;
        try {
          /* ⚠ A SNAPSHOT, NOT THE LIVE ARRAY. The loop keeps appending to `transcript`; handing the
             adapter the array itself means the request it was given changes underneath it while it
             is in flight, and a retry inside the transport would resend a different conversation
             from the one it was called with. */
          reply = await model({
            system: opts.system || '',
            messages: transcript.slice(),
            tools: Object.keys(tools).map((k) => tools[k]),
            step,
            signal: opts.signal,
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
          if (step === 0) throw e;
          stopped = 'transport';
          trace.transportError = (e && e.message) || 'model error';
          break;
        }

        const calls = (reply && Array.isArray(reply.toolCalls)) ? reply.toolCalls.slice(0, lim.maxPerStep) : [];
        if (reply && typeof reply.text === 'string' && reply.text.trim()) text = reply.text;

        /* ── ZERO TOOL CALLS IS A COMPLETE TURN. This is the branch the old planner had no shape
           for: 「セーヌ川の長さは」 is answered here, on step 0, having touched nothing. ────── */
        if (!calls.length) {
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
           transcript, reproduced in tests/r419-checks.test.mjs ①): two live question cards and a
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
        for (const call of calls) {
          if (ended) {
            stepResults.push({ id: call && call.id, name: call && call.name, ok: false,
              error: 'turn_ended',
              message: '"' + ended + '" put a question to the reader, which ends this turn. '
                + 'Their reply arrives as the next message; issue this call then.' });
            continue;
          }
          if (trace.calls >= lim.maxToolCalls) {
            stepResults.push({ id: call && call.id, name: call && call.name, ok: false,
              error: 'call_budget_exhausted',
              message: 'This turn has already run ' + lim.maxToolCalls + ' tools. Answer with what you have.' });
            continue;
          }
          /* (#R452) …and the same note when it is the clock rather than the count that ran out. */
          if (outOfTime()) {
            stepResults.push({ id: call && call.id, name: call && call.name, ok: false,
              error: 'time_budget_exhausted',
              message: 'This turn has been running for ' + Math.round(lim.turnBudgetMs / 1000)
                + ' s. Answer the reader now with what you have.' });
            continue;
          }
          trace.calls++;
          const bad = reject(call, tools);
          if (bad) {
            trace.rejected++;
            /* ⚠ THE READER NEVER SEES THIS. It is a typed note to Atlas, which corrects it on the
               next step. The old console printed 「何を分析しますか？」 for exactly this case. */
            stepResults.push({ id: call.id, name: call.name, ok: false, error: bad.code, message: bad.message, schema: bad.schema });
            continue;
          }
          let out = null;
          try {
            out = await runTool(call);   /* (#R452) …with a deadline. See `runTool` above. */
          } catch (e) {
            out = { ok: false, error: 'execution_failed', message: (e && e.message) || 'the tool threw' };
          }
          if (!out || typeof out !== 'object') out = { ok: false, error: 'no_result', message: 'the tool returned nothing' };
          executedHere++;
          trace.executed++;
          const rec = Object.assign({ id: call.id, name: call.name }, out);
          stepResults.push(rec);
          results.push(rec);
          /* the TOOL may declare it, or the RESULT may — the second is how a generic invoker
             (`run_capability`) reports that the capability it reached was a turn-ending one. */
          if (out.ok !== false && ((tools[call.name] && tools[call.name].endsTurn) || out.endsTurn === true)) ended = call.name;
        }

        malformedRun = executedHere ? 0 : (malformedRun + 1);
        trace.steps.push({ step, toolCalls: calls.length, executed: executedHere });
        transcript.push({ role: 'assistant', content: (reply && reply.text) || '', toolCalls: calls });
        transcript.push({ role: 'tool', content: stepResults });

        if (ended) {
          stopped = 'awaiting_user';
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
      if (!String(text || '').trim() && results.length && stopped !== 'aborted' && stopped !== 'transport'
          && stopped !== 'awaiting_user') {
        try {
          const last = await model({
            system: opts.system || '',
            messages: transcript.concat([{ role: 'user', content:
              '[WRITE THE ANSWER] The tool results above are what actually happened. Reply to the reader now, '
              + 'in their language, with no further tool calls.' }]),
            tools: [], step: lim.maxSteps, signal: opts.signal, final: true,
          });
          if (last && typeof last.text === 'string') text = last.text;
          trace.steps.push({ step: lim.maxSteps, final: true, forced: true });
        } catch (_) { /* keep whatever we have; the caller degrades */ }
      }

      return { text: String(text || ''), calls: trace.calls, results, trace, stopped };
    }

    /**
     * readReply(data, text, parseJSON) -> {text, toolCalls}
     * The one place the envelope is turned into a step. Kept here rather than in js/atlas-console.js
     * so tests/r406-agent.test.mjs checks the parsing the browser actually uses.
     */
    function readReply(data, text, parseJSON) {
      const d = (data && typeof data === 'object') ? data : null;
      const raw = (d && Array.isArray(d.tool_calls)) ? d.tool_calls : [];
      const calls = [];
      raw.forEach((c, i) => {
        if (!c || !c.name) return;
        let args = c.arguments;
        if (args === undefined && typeof c.arguments_json === 'string') {
          try { args = typeof parseJSON === 'function' ? parseJSON(c.arguments_json) : JSON.parse(c.arguments_json); } catch (_) { args = null; }
        }
        if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
        calls.push({ id: 't' + i, name: String(c.name), arguments: args });
      });
      return { text: String((d && d.final_text) || (d ? '' : (text || ''))), toolCalls: calls };
    }

    const API = { LIMITS, TURN_SCHEMA, runTurn, reject, readReply, validateAgainst };
    try { window.IntMapAtlasAgent = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
