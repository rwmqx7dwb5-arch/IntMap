/* ============================================================================
 *  IntMap · Atlas — THE PLAN   (atlas-plan-on-map → atlas-progress-one)
 *  window-less module: the ledger is driven by js/atlas-agent.js runTurn, the view is mounted by
 *  js/atlas-live.js into the work trace (js/atlas-progress.js), between its head and its rows
 * ----------------------------------------------------------------------------
 *  ══ WHAT WAS MISSING ══════════════════════════════════════════════════════════════════════
 *  A question like 「台湾海峡が封鎖されたら影響は」 is several pieces of work — the strait, the shipping
 *  that crosses it, the economies that depend on it, the answer. Atlas already does them one step at a
 *  time (js/atlas-agent.js), and since atlas-live-stream the map shows each OPERATION start and end.
 *  What nobody could see was the WORK: which piece of the question an operation served, which pieces
 *  are still ahead, and which one did not come off. The plan existed only inside the model, so a
 *  reader could not follow it and the next turn could not refer to it («さっきの手順 2 をやり直して»
 *  named nothing IntMap held).
 *
 *  ══ WHO DECIDES WHAT ═══════════════════════════════════════════════════════════════════════
 *  · THE PLAN IS ATLAS'S. Its goal, its steps, their wording and which step the next calls serve are
 *    declared by the model through the `plan` tool (PLAN_TOOL below). No code here writes a step,
 *    suggests one, or requires a plan at all — a request one call answers needs none, and Atlas decides
 *    that (CONSTITUTION.md §5).
 *  · THE STATE IS IntMap's OBSERVATION. A step's state is derived from the records of the calls made
 *    while it was current — the executor's verdict as js/atlas-toolsurface.js reports it — never from
 *    anything the model says about it. 「Unobserved」 stays 「unobserved」: an effect nobody saw is not
 *    shown as done (.agents/rules/one-pass-or-a-reason.md §5).
 *  · THE STATE GOES BACK TO ATLAS. promptBlock() is put in front of the model on every step and every
 *    later turn (one-pass-or-a-reason §2, the second cause: a result that is not carried back).
 *
 *  ⚠ NOTHING HERE IS A LIMIT. `plan` is one more tool Atlas may call or not; its calls touch no app
 *  state and run beside everything else; maxSteps and TURN_MAX_CALLS are not read or moved.
 *
 *  ⚠ NO DOM AND NO GLOBALS IN makeAtlasPlan — tests/atlas-plan-on-map-checks.test.mjs drives the ledger
 *  the browser runs, through the real runTurn, with no browser. makePlanView is the DOM half.
 * ==========================================================================*/

/* ── THE TOOL ATLAS DECLARES ITS PLAN WITH ─────────────────────────────────────────────────────
   Every field optional, because each call says only what changed: the first call names the goal and
   the steps, a later one only which step the next calls serve. What makes a call meaningless (no plan
   yet, and no steps) is answered by declare() as a typed note — the same way the loop answers any call
   that cannot be carried out. */
import { mergeGeo, gapsOf, geoReport, preflight, defaultProbe } from './atlas-geoplan.js';   /* (geo-task-planner) the structured spec of a geospatial analysis */
import { stable } from './atlas-job-core.js';

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: { capability: { type: 'string' }, args: { type: 'object' }, result: { type: 'object' }, mode: { type: 'string' } },
};

export const PLAN_TOOL = {
  name: 'plan',
  description: 'Declare your plan for a request that takes several pieces of work, and say which step the calls '
    + 'that follow serve. The reader sees the plan above your work, with each step\'s state as IntMap observes it. '
    + 'Start a separate request with {"action":"new","goal","steps":[short titles in the reader\'s language],"current":1}, in the same reply as its first calls. '
    + 'Use {"action":"continue","planId":id,"current":n} to select a step or retry work on the same request. '
    + 'Use {"action":"revise","planId":id,...changed fields} to change an existing plan. The current plan ID is in the tool result and the plan block. '
    + 'A request that one or two calls answer needs no plan. '
    + 'For reusable work set scope to the actual target, period and input IDs and versions. Supply the same scope only when all are unchanged. '
    + 'Use stepScopes:[{step,scope}] to reuse individual unaffected steps when the overall scope changes. '
    + 'Declare each required deliverable as {id,step,label,receipts:[{capability?,args?,result?,mode?}]}. '
    + 'Each receipt is an alternative: match the real tool arguments or structured result using exact values for identifying fields (target, measure, period); include mode such as "map" when the output must be observed. '
    + 'For example, args:{country:"DEU",metric:"population",year:2020} can cover one country, metric and year across sources. For a batch, match the row or item in the result for each requirement. '
    + 'Use target to label attempts. Coverage comes from matching receipts, including results produced under another step. '
    + 'For a GEOSPATIAL ANALYSIS add "geo", the analysis as IntMap can read it: {"question","region":{"name","bounds":[w,s,e,n]},"time":{"at"|"from","to"},'
    + '"conditions":[str],"needs":[{"id","what","source":{"kind":"layer|dataset|stac|ogc|overture|upload|url|inline|job-output|none","ref","format"?:str,"scope"?:"whole|window|query"},"completeness":"all|sample|any",'
    + '"resolution":{"value","unit":"m|km|deg"}}],"method":{"ops":[str],"strict"?:bool,"semantics"?:bool},"environment":"browser-gis|python|server|job","outputs":["map|table|chart|file|answer"],'
    + '"check":true}. Every member is optional and a later call states only what changed. The answer lists what the spec does not state (gaps); '
    + 'with "check":true IntMap asks the available sources and checks the chosen environment\'s accepted input formats, acquisition scopes and methods. '
    + 'Use source.scope for how the data must be acquired. Use region.bounds for the area to analyse. A supported route does not confirm that a particular source has answered.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['new', 'revise', 'continue'] },
      planId: { type: 'integer', minimum: 1 },
      goal: { type: 'string' },
      steps: { type: 'array', items: { type: 'string', minLength: 1 } },
      current: { type: 'integer', minimum: 1 },
      scope: { type: 'object' },
      stepScopes: { type: 'array', items: { type: 'object', properties: { step: { type: 'integer', minimum: 1 }, scope: { type: 'object' } }, required: ['step', 'scope'] } },
      requirements: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, step: { type: 'integer', minimum: 1 }, label: { type: 'string' }, receipts: { type: 'array', items: RECEIPT_SCHEMA } }, required: ['id', 'step', 'label'] } },
      target: { type: 'string' },
      geo: { type: 'object' },
    },
  },
};

/* The states a step can be in, worst first. A step is in the WORST state of its operations (the latest
   attempt of each capability — a retry that worked replaces the failure it retried). */
const STEP_STATES = ['running', 'failed', 'stopped', 'waiting', 'partial', 'unobserved', 'completed', 'noop', 'pending'];
const RANK = { running: 0, failed: 1, stopped: 2, waiting: 3, partial: 4, unobserved: 5, completed: 6 };

/** opState(rec) — what one call's record says happened, in the plan's words. Read off the record the
 *  executor's verdict produced (js/atlas-toolsurface.js mechanical); `ok` alone never makes a success
 *  out of an unobserved or partial status. */
export function opState(rec) {
  if (!rec || typeof rec !== 'object') return 'unobserved';
  const s = String(rec.status || '');
  if (s === 'unobserved') return 'unobserved';
  if (s === 'partial') return 'partial';
  if (s === 'needs_input') return 'waiting';
  if (s === 'running') return 'running';
  if (s === 'cancelled' || s === 'superseded') return 'stopped';
  if (rec.ok === false) return 'failed';
  return 'completed';
}

const normTitle = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/* An array of expected rows matches items anywhere in the returned rows. Each expected object must
   match one whole item so fields from two different rows cannot manufacture one observed target. */
function matches(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.every((x) => actual.some((y) => matches(y, x)));
  if (isRecord(expected)) return isRecord(actual) && Object.entries(expected).every(([k, v]) => Object.hasOwn(actual, k) && matches(actual[k], v));
  return actual === expected;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (isRecord(value)) return Object.values(value).some(hasValue);
  return value != null && value !== '';
}

function validReceipt(r) {
  return isRecord(r) && (r.capability == null || typeof r.capability === 'string') && (r.mode == null || typeof r.mode === 'string')
    && ['args', 'result'].every((k) => r[k] == null || (isRecord(r[k]) && hasValue(r[k])))
    && (hasValue(r.args) || hasValue(r.result));
}

function observes(op, receipt) {
  if (receipt.capability && op.cap !== receipt.capability) return false;
  if (receipt.args && !matches(op.args, receipt.args)) return false;
  if (receipt.mode && !(Array.isArray(op.receipt?.producedModes) && op.receipt.producedModes.includes(receipt.mode))) return false;
  if (receipt.result && !matches(op.receipt, receipt.result)) return false;
  return op.state === 'completed' || (op.state === 'partial' && !!receipt.result);
}

/**
 * makeAtlasPlan() -> ledger
 *
 * ONE ledger per conversation (js/atlas-console.js), handed to every runTurn as `opts.plan`. It holds
 * the latest plan Atlas declared and, per step, the calls made while that step was current.
 */
export function makeAtlasPlan(opts) {
  const geoProbe = (opts && opts.geoProbe) || null;   /* tests inject the doors; the app reads them off window at call time (js/atlas-geoplan.js defaultProbe) */
  let plan = null;            /* {id, goal, steps:[{title, ops:[], touched}], current (0-based), turn} */
  let seq = 0;
  let turnNo = 0;
  let live = false;           /* a turn is running */
  let geoPending = false;     /* a `geo.check` was declared and has not been run */
  let activeThisTurn = false; /* Atlas said, in THIS turn, which step its calls serve */
  const inflight = Object.create(null);   /* callId → op */
  const subs = [];

  function emit(ev) { subs.slice().forEach((f) => { try { f(ev, snapshot()); } catch (_) { /* a viewer never breaks the turn */ } }); }

  /* ══ (atlas-child-loop-reuse) THE ATTEMPTS THAT ARE ONE PIECE OF WORK, NOT ONE CAPABILITY ═══════════════════════════════════════════════════════════
     A step's state was read off the LATEST call of each capability, so five `data.value` calls — five countries — were one row: registered
     4 failed then 1 ok, the step said 「completed」 and the model read `data.value completed`; 4 ok then 1 failed, it said 「failed」 (measured
     2026-11-27, external audit). The piece of work a call does is the call's own identity — what it asked (the capability and its arguments,
     js/atlas-turn-results.js callKey, which the loop hands in as `key`): a retry of Japan with the same arguments replaces Japan's failure;
     Germany's failure stays Germany's. A call that arrives without a key (an older caller) is its capability, as before. */
  function latestPerWork(ops) {
    const by = Object.create(null), order = [];
    ops.forEach((o) => { const k = JSON.stringify([o.target, o.key || ('cap:' + o.cap)]); if (!(k in by)) order.push(k); by[k] = o; });
    return order.map((k) => by[k]);
  }
  /* the operations of one step as the model reads them: one line per capability, and where a capability did several pieces of work, how many of
     them completed and which did not — «data.value: 1 of 5 completed; not completed: {country:DEU} failed (…)» */
  function operationLines(ops) {
    const works = latestPerWork(ops);
    const byCap = Object.create(null), caps = [];
    works.forEach((o) => { if (!(o.cap in byCap)) { byCap[o.cap] = []; caps.push(o.cap); } byCap[o.cap].push(o); });
    const earlier = (o) => (o.turn !== turnNo ? ' [earlier turn]' : '');
    return caps.map((c) => {
      const list = byCap[c];
      if (list.length === 1) { const o = list[0]; return o.cap + ' ' + o.state + (o.code ? ' (' + o.code + ')' : '') + earlier(o); }
      const done = list.filter((o) => o.state === 'completed');
      const rest = list.filter((o) => o.state !== 'completed');
      return c + ': ' + done.length + ' of ' + list.length + ' completed' + (rest.length ? '; not completed: ' + rest.map((o) => (o.work || '(no arguments)') + ' ' + o.state + (o.code ? ' (' + o.code + ')' : '') + earlier(o)).join('; ') : '');
    });
  }
  function stepState(st, i, states, last) {
    if (st.ops.some((o) => o.inflight)) return 'running';
    if (states.length) {
      if (states.every((r) => r.state === 'completed')) return 'completed';
      if (states.some((r) => r.state === 'completed')) return 'partial';
      return states.find((r) => r.state !== 'pending')?.state || 'pending';
    }
    if (last.length) {
      let worst = 'completed';
      last.forEach((o) => { if ((RANK[o.state] != null ? RANK[o.state] : 9) < RANK[worst]) worst = o.state; });
      /* (atlas-delegation-efficiency) A STEP WHERE SOMETHING WORKED IS NOT 「failed」. The state goes back to the model on every step (promptBlock) and to the
         reader as the checklist; 「failed」 over a step that also holds a completed call says nothing worked, which is false, and was read as «this step is
         still undone» — the next hops tried more addresses for what an earlier call had already brought (measured 2026-11-25: one step 失敗 while the route
         it served was drawn). The mix is 「partial」, which this vocabulary already has for exactly that, and the per-capability list beside it still names
         which call failed. A step whose every call failed stays 「failed」. */
      if (worst === 'failed' && last.some((o) => o.state === 'completed')) return 'partial';
      return worst;
    }
    if (live && activeThisTurn && plan && plan.current === i) return 'running';
    return st.touched ? 'noop' : 'pending';
  }

  function requirementStates(st, work) {
    return st.requirements.map((r) => {
      const observed = work.findLast((o) => r.receipts.some((receipt) => observes(o, receipt)));
      const attempt = observed || work.findLast((o) => o.target === r.id);
      const state = observed ? 'completed' : attempt?.state === 'completed' ? 'unobserved' : attempt?.state || 'pending';
      return { ...r, state, callId: attempt?.callId || null, artifact: observed?.artifact };
    });
  }

  function snapshot() {
    if (!plan) return null;
    const workByStep = plan.steps.map((st) => latestPerWork(st.ops));
    const work = workByStep.flat();
    const steps = plan.steps.map((st, i) => {
      const requirements = requirementStates(st, work);
      return { n: i + 1, title: st.title, state: stepState(st, i, requirements, workByStep[i]), requirements,
        ops: st.ops.map((o) => ({ callId: o.callId, capability: o.cap, state: o.state, code: o.code || undefined, turn: o.turn, draw: o.draw || null, work: o.work || undefined })),
        workItems: workByStep[i].map((o) => ({ callId: o.callId, capability: o.cap, work: o.work, state: o.state, code: o.code })) };
    });
    const requirements = steps.flatMap((st) => st.requirements);
    const missing = requirements.filter((r) => r.state !== 'completed').map((r) => r.id);
    return {
      geo: plan.geo ? { spec: plan.geo.spec, gaps: gapsOf(plan.geo.spec), check: plan.geo.check } : null,
      id: plan.id, goal: plan.goal, current: plan.current + 1, live, turn: plan.turn, thisTurn: plan.turn === turnNo,
      /* WHO WROTE THE LIST: `thisTurn` says the plan was touched in this turn (a call that only moved `current` counts); `declaredThisTurn` says this turn
         WROTE the steps. The checklist a reader sees is the second one — a question that merely continues an earlier plan did not make that list. */
      declaredThisTurn: plan.declaredTurn === turnNo,
      declaredTurn: plan.declaredTurn,   /* (atlas-plan-per-question) WHICH turn wrote the list — what a view binds the list to (makePlanView render) */
      steps, coverage: { completed: requirements.length - missing.length, total: requirements.length, missing },
    };
  }

  /* beginTurn() — js/atlas-agent.js runTurn, before its first step. Which step the calls serve is a
     statement about THIS turn: a call made in a later turn that never mentioned the plan is not filed
     under whatever step an earlier turn left current. */
  function beginTurn() { turnNo++; live = true; activeThisTurn = false; if (plan) plan.target = ''; emit({ type: 'turn', phase: 'begin' }); }

  /* declare(args) -> the tool's record. Runs where the loop reads the reply, IN CALL ORDER, so a plan
     call earlier in a reply decides which step the calls after it serve. */
  /* `facts.outside` (atlas-outside-mark): outside content was in front of the model when it wrote this call. The plan's
     words are put in front of the model on every later turn (promptBlock), so the mark stays with them: a plan keeps it
     while any of its text — the goal, a step title kept from the earlier plan — was written in a marked turn, and
     carriesOutside() is what js/atlas-console.js hands composeInput as `tailOutside`. */
  function declare(args, facts) {
    const a = (args && typeof args === 'object') ? args : {};
    const o = !!(facts && facts.outside === true);
    const before = plan;
    const steps = Array.isArray(a.steps) ? a.steps.map((s) => typeof s === 'string' ? s.trim() : '') : null;
    if (a.steps != null && (!steps?.length || steps.some((s) => !s))) return { ok: false, error: 'invalid_steps',
      message: 'Give at least one step, and give every step a title.' };
    if (!before && !steps?.length && !a.action) return { ok: false, error: 'no_plan',
      message: 'There is no plan to update yet. Declare one with "goal" and "steps" (and "current"), or make the calls without a plan.' };
    const edits = ['goal', 'steps', 'scope', 'stepScopes', 'requirements', 'geo'].some((k) => a[k] != null);
    const implicitNew = !before || (steps && a.planId == null && (before.turn !== turnNo ||
      (a.goal != null && normTitle(a.goal) !== normTitle(before.goal))));
    const action = a.action ?? (implicitNew ? 'new' : edits ? 'revise' : 'continue');
    if (!['new', 'revise', 'continue'].includes(action)) return { ok: false, error: 'invalid_plan_action',
      message: 'Use action "new", "revise" or "continue".' };
    const isNew = action === 'new';
    if (isNew ? a.planId != null : (!before || (a.planId != null ? a.planId !== before.id : a.action != null || before.turn !== turnNo))) {
      return { ok: false, error: 'plan_id_mismatch', message: isNew ? 'Start a new plan without planId.' : 'Use the current planId to revise or continue it.',
        planId: before?.id };
    }
    if (isNew && !steps) return { ok: false, error: 'missing_steps', message: 'A new plan needs steps.' };
    if (action === 'continue' && edits) return { ok: false, error: 'invalid_plan_update', message: 'Use action "revise" to change the plan.' };
    if ((a.scope != null && !isRecord(a.scope)) || (a.geo != null && !isRecord(a.geo)) ||
      (a.requirements != null && !Array.isArray(a.requirements)) || (a.stepScopes != null && !Array.isArray(a.stepScopes))) {
      return { ok: false, error: 'invalid_plan_fields', message: 'Use objects for scope and geo, and arrays for requirements and stepScopes.' };
    }
    const titles = steps || before.steps.map((st) => st.title);
    const current = a.current == null ? (steps ? 0 : before.current) : a.current - 1;
    if (a.current != null && !Number.isInteger(a.current)) return { ok: false, error: 'invalid_step', message: 'current must be a step number.' };
    if (!(current >= 0 && current < titles.length)) return { ok: false, error: 'no_such_step',
      message: 'The plan has steps 1-' + titles.length + '; there is no step ' + String(a.current) + '. Nothing was changed.' };
    const goal = String(a.goal ?? (isNew ? '' : before.goal)).trim();
    const scope = a.scope == null ? null : stable(a.scope);
    const sameScope = scope != null && scope !== '{}' && scope === before?.scope;
    const sameGoal = !isNew && normTitle(goal) === normTitle(before.goal);
    const keepWork = !isNew && (sameScope || (sameGoal && (scope == null || scope === before.scope)));
    const nextGeo = a.geo ? mergeGeo(keepWork ? before.geo : null, a.geo) : null;
    const changedGeo = !!nextGeo && stable(nextGeo.spec) !== stable(before?.geo?.spec);
    const stepScopes = new Map();
    for (const e of a.stepScopes || []) {
      if (!Number.isInteger(e?.step) || e.step < 1 || e.step > titles.length || !isRecord(e.scope) ||
        !Object.keys(e.scope).length || stepScopes.has(e.step)) return { ok: false, error: 'invalid_step_scope',
        message: 'Each step scope needs a distinct existing step and a nonempty scope object.' };
      stepScopes.set(e.step, stable(e.scope));
    }
    function reusable(i) {
      const candidate = isNew ? null : before.steps[i];
      const stepScope = stepScopes.get(i + 1);
      return candidate && normTitle(candidate.title) === normTitle(titles[i]) &&
        (stepScope != null ? stepScope === candidate.scope : keepWork && !changedGeo);
    }
    const oldRequirements = isNew ? [] : before.steps.flatMap((st, i) => reusable(i) ? st.requirements : []);
    const requirements = a.requirements ? a.requirements.map((r) => ({
      id: typeof r?.id === 'string' ? r.id.trim() : '', label: typeof r?.label === 'string' ? r.label.trim() : '', step: r?.step,
      receipts: r?.receipts == null ? [] : r.receipts,
    })) : oldRequirements;
    if (requirements.some((r) => !r.id || !r.label || !Number.isInteger(r.step) || r.step < 1 || r.step > titles.length ||
      !Array.isArray(r.receipts) || !r.receipts.every(validReceipt)) ||
        new Set(requirements.map((r) => r.id)).size !== requirements.length) return { ok: false, error: 'invalid_requirements',
      message: 'Every requirement needs a unique id, a label and an existing step. Receipts must match identifying arguments or result fields.' };
    const target = a.target == null ? (isNew || edits || a.current != null ? '' : before.target) : String(a.target).trim();
    if (target && !requirements.some((r) => r.id === target && r.step === current + 1)) return { ok: false, error: 'unknown_requirement',
      message: 'Set target to a declared requirement in the current step.' };
    const geo = nextGeo
      ? { ...nextGeo, check: changedGeo || a.geo.check === true ? null : before?.geo?.check ?? null }
      : keepWork ? before.geo : undefined;
    const geoRec = nextGeo ? geoReport(geo.spec, geo.unrecognised, geo.check) : null;
    const nextSteps = titles.map((title, i) => {
      const candidate = isNew ? null : before.steps[i];
      const stepScope = stepScopes.get(i + 1);
      const reuse = reusable(i);
      return { title, requirements: requirements.filter((r) => r.step === i + 1), scope: stepScope || (reuse ? candidate.scope : undefined),
        ops: reuse ? candidate.ops : [], touched: !!(reuse && candidate.touched), token: reuse ? candidate.token : {} };
    });
    plan = { id: isNew ? ++seq : before.id, goal, geo, scope: scope ?? (keepWork ? before.scope : null),
      current, target, steps: nextSteps, declaredTurn: steps ? turnNo : before.declaredTurn,
      outside: o || !!(!isNew && before.outside) };
    if (a.geo) geoPending = a.geo.check === true;
    else if (!geo) geoPending = false;
    plan.turn = turnNo;
    plan.steps[plan.current].touched = true;
    activeThisTurn = true;
    emit({ type: 'plan' });
    return Object.assign({ ok: true, plan: forModel(),
      note: 'Plan recorded and shown to the reader above your work. The calls you make from here serve step ' + (plan.current + 1)
        + ' until you set "current" again. Each step\'s state is what IntMap OBSERVES of those calls, never what you say.' }, geoRec ? { geo: geoRec } : {});
  }

  /* preflight() — the loop awaits it after a `geo.check` declaration (js/atlas-agent.js). It asks the sources; it
     blocks nothing, and what comes back is a statement for the model, kept on the plan for later turns. */
  function geoPendingNow() { return !!(geoPending && plan && plan.geo); }
  async function runPreflight() {
    if (!geoPendingNow()) return null;
    geoPending = false;
    const target = plan, spec = plan.geo.spec;
    let check;
    try { check = await preflight(spec, geoProbe || defaultProbe()); }
    catch (e) { check = { needs: [], environment: null, runnable: null, reasons: ['preflight failed: ' + ((e && e.message) || 'unknown')] }; }
    if (plan?.id === target.id && plan.geo && plan.geo.spec === spec) { plan.geo.check = check; emit({ type: 'geo' }); }
    return geoReport(spec, target.geo ? target.geo.unrecognised : [], check);
  }

  /* the step the next call is filed under, or -1 — asked by the loop in call order */
  function attribute() { return (plan && activeThisTurn) ? plan.current : -1; }
  function targetOfCall() { return activeThisTurn ? plan?.target || '' : ''; }
  function bindingOfCall() {
    return activeThisTurn && plan ? { planId: plan.id, stepToken: plan.steps[plan.current].token } : {};
  }

  /* started / settled — the loop around ONE call that reaches the app (not the plan tool itself) */
  function started(callId, info) {
    if (!plan || !callId) return;
    const i = (info && info.step != null) ? info.step : -1;
    if (!(i >= 0 && i < plan.steps.length) || (info?.planId != null && info.planId !== plan.id) ||
      (info?.stepToken && info.stepToken !== plan.steps[i].token)) return;
    const op = { callId: String(callId), cap: String((info && info.capability) || (info && info.name) || ''), state: 'running', inflight: true, turn: turnNo, planId: plan.id,
      target: info?.target || '', args: info?.args, key: info && info.key ? String(info.key) : '', work: info && info.work ? String(info.work).slice(0, 160) : '' };
    plan.steps[i].ops.push(op);
    inflight[op.callId] = op;
    emit({ type: 'op', phase: 'started', callId: op.callId, step: i + 1 });
  }
  /* A record that did not reach the app — a capability search, a cut result read on, a call answered
     before it ran — is not an operation of the step, and leaves it. */
  function settled(callId, rec) {
    const op = inflight[String(callId)]; if (!op) return;
    delete inflight[op.callId];
    op.inflight = false;
    const reached = !!(rec && rec.capability);
    if (!reached || !plan || plan.id !== op.planId) {
      if (plan) plan.steps.forEach((st) => { const k = st.ops.indexOf(op); if (k >= 0) st.ops.splice(k, 1); });
      emit({ type: 'op', phase: 'dropped', callId: op.callId });
      return;
    }
    op.cap = String(rec.capability);
    op.state = opState(rec);
    op.receipt = rec;
    op.code = String(rec.code || rec.error || '') || undefined;
    if (rec.resultKey) op.artifact = { id: String(rec.resultKey), version: rec.revision ?? null };
    emit({ type: 'op', phase: 'settled', callId: op.callId, state: op.state,
      produced: Array.isArray(rec.producedModes) ? rec.producedModes.slice() : [] });
  }
  /* what a call drew — attached by the view (it alone can look at the map) */
  function noteDrawing(callId, draw) {
    if (!plan || !draw) return;
    plan.steps.forEach((st) => st.ops.forEach((o) => { if (o.callId === String(callId)) o.draw = draw; }));
    emit({ type: 'draw', callId: String(callId) });
  }

  /* endTurn(how) — runTurn's `stopped`. A call still in flight did not settle where anyone could see:
     stopped by the reader, or not observed. A background operation that was still running when the turn
     ended was not seen to finish either. */
  function endTurn(how) {
    const stoppedByReader = how === 'aborted';
    Object.keys(inflight).forEach((id) => {
      const op = inflight[id]; delete inflight[id];
      op.inflight = false; op.state = stoppedByReader ? 'stopped' : 'unobserved'; op.code = 'not_settled';
    });
    if (plan) plan.steps.forEach((st) => st.ops.forEach((o) => {
      if (o.turn === turnNo && o.state === 'running') { o.state = 'unobserved'; o.code = o.code || 'still_running'; }
    }));
    live = false;
    emit({ type: 'turn', phase: 'end', how: String(how || '') });
  }

  /* the plan as the model reads it — in a tool result, and every step after (promptBlock) */
  function forModel() {
    const s = snapshot(); if (!s) return null;
    return { planId: s.id, goal: s.goal, current: s.current, coverage: s.coverage,
      steps: s.steps.map((st) => ({ n: st.n, title: st.title, state: st.state,
        requirements: st.requirements, operations: operationLines(plan.steps[st.n - 1].ops) })) };
  }
  function promptBlock() {
    const m = forModel(); if (!m) return '';
    const lines = m.steps.map((st) => st.n + '. ' + st.title + ' — ' + st.state + (st.operations.length ? ': ' + st.operations.join('; ') : '')
      + (st.requirements.length ? '\n' + st.requirements.map((r) => '  - ' + r.id + ' (' + r.label + '): ' + r.state).join('\n') : ''));
    const geoLine = plan.geo ? geoPromptLine(plan.geo) : '';
    return '[YOUR PLAN — declared by you' + (plan.turn === turnNo && live ? ' in this turn' : ' in an earlier turn')
      + '; each state is what IntMap OBSERVED of the calls made under that step]\nPlan ID: ' + m.planId + '\nGoal: ' + (m.goal || '(none given)') + '\n'
      + lines.join('\n') + geoLine + (m.coverage.total ? '\nRequired deliverables observed: ' + m.coverage.completed + '/' + m.coverage.total : '')
      + '\nCurrent step: ' + m.current + (activeThisTurn ? '' : ' (inactive this turn — start a new plan or continue this plan by ID to file calls under a step)')
      + '\n"unobserved" means the call ran and its effect could not be seen; "noop" means the step was current and nothing ran under it.\n\n';
  }

  function subscribe(fn) { if (typeof fn === 'function') subs.push(fn); return () => { const k = subs.indexOf(fn); if (k >= 0) subs.splice(k, 1); }; }

  /* whether the plan promptBlock() puts in front of the model holds words written in a marked turn — see declare() */
  function carriesOutside() { return !!(plan && plan.outside === true); }

  return { TOOL: PLAN_TOOL, beginTurn, declare, attribute, targetOfCall, bindingOfCall, started, settled, noteDrawing, endTurn,
    snapshot, forModel, promptBlock, carriesOutside, subscribe, geoPending: geoPendingNow, preflight: runPreflight };
}

/* the geospatial spec as the model reads it on every later step: what is stated, what is not, what the sources said */
function geoPromptLine(g) {
  const gaps = gapsOf(g.spec).map((x) => x.code);
  const c = g.check;
  const acquisition = g.spec.needs.filter((n) => n.source.format || n.source.scope)
    .map((n) => n.id + ' ' + [n.source.kind, n.source.format, n.source.scope].filter(Boolean).join('/'));
  return '\nGeo analysis: ' + (g.spec.question || '(no question stated)')
    + (g.spec.environment ? ' | execution: ' + g.spec.environment : '')
    + (acquisition.length ? ' | acquisition: ' + acquisition.join(', ') : '')
    + ' | not stated: ' + (gaps.length ? gaps.join(', ') : 'nothing')
    + (c ? ' | availability: runnable=' + String(c.runnable) + '; ' + c.needs.map((n) => n.id + '=' + n.state + (n.fullCoverage ? '(coverage ' + n.fullCoverage + ')' : '')).join(', ')
      + (c.reasons.length ? ' — ' + c.reasons.join('; ') : '') : ' | availability: not checked (send geo.check:true to ask the sources)');
}

/* ══ WHAT A STEP DREW, AND GOING BACK TO IT ══════════════════════════════════════════════════════
   Pure helpers first (the node checks evaluate them), then the DOM half. A drawing is found by
   LOOKING, the way js/atlas-state.js's undo looks: the surfaces painters claim with the renderer
   (js/geo-engine.js render.drawn) and the universal object list (js/map-tools.js IntMapObjects),
   fingerprinted when a call starts and again when it settles. What appeared or changed between the
   two is what that call drew. ⚠ Calls of one reply that run at the same time both see a change made
   in their common window; each claims it, and a step's link then shows both — what was drawn while
   it ran, never something drawn outside it. */
export function drawnDiff(before, after) {
  const b = before || { surfaces: {}, objects: [] }, a = after || { surfaces: {}, objects: [] };
  const surfaces = Object.keys(a.surfaces || {}).filter((id) => !b.surfaces || b.surfaces[id] !== a.surfaces[id]);
  const had = Object.create(null); (b.objects || []).forEach((id) => { had[id] = 1; });
  const objects = (a.objects || []).filter((id) => !had[id]);
  return { surfaces, objects };
}
/** bboxOf(features) -> [[w,s],[e,n]] | null — every coordinate of every geometry */
export function bboxOf(features) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const eat = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      if (isFinite(c[0]) && isFinite(c[1])) { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
      return;
    }
    c.forEach(eat);
  };
  (features || []).forEach((f) => {
    const g = f && f.geometry; if (!g) return;
    if (g.type === 'GeometryCollection') (g.geometries || []).forEach((x) => eat(x && x.coordinates));
    else eat(g.coordinates);
  });
  return (w <= e && s <= n) ? [[w, s], [e, n]] : null;
}

/**
 * makePlanView(ledger, deps) — the plan in the work trace.
 *   deps.L(en, jp)   the console's language picker
 *   deps.GE()        the renderer (js/geo-engine.js IntMapGeoEngine)
 *   deps.objects()   js/map-tools.js IntMapObjects, or null
 *   deps.slot()      the element to render into (the latest turn's `.atl-trace-plan`), or null
 *   deps.mark(s)     the trace's own mark element for a trace state (js/atlas-progress.js markEl)
 *
 * ⚠ (atlas-progress-one) IT WAS A CARD ON THE MAP, WITH A FOLD AND A CLOSE BUTTON OF ITS OWN. The reader
 * counted four progress indicators for one turn (this card, two HUD pills and the trace) and asked for one.
 * The plan is now part of the trace: it folds with the trace's head, and there is nothing to close.
 */
export function makePlanView(ledger, deps) {
  deps = deps || {};
  const L = deps.L || ((en) => en);
  const GE = deps.GE || (() => null);
  const OBJ = deps.objects || (() => null);
  const before = Object.create(null);    /* callId → fingerprint at start */

  const WORDS = {
    pending: () => L('Not started', '未着手'), running: () => L('Running', '実行中'), completed: () => L('Done', '完了'),
    partial: () => L('Partly done', '一部のみ'), failed: () => L('Failed', '失敗'), unobserved: () => L('Not observed', '観測できず'),
    waiting: () => L('Waiting for you', '入力待ち'), noop: () => L('No operation', '操作なし'), stopped: () => L('Stopped', '停止しました'),
  };

  /* ── looking at the map ── */
  function fingerprint() {
    const out = { surfaces: {}, objects: [] };
    try {
      const E = GE(); const R = E && E.render;
      const r = R && typeof R.drawn === 'function' ? R.drawn({}) : null;
      if (r && r.observable) r.drawn.forEach((id) => {
        let first = ''; try { const d = E.layers.sourceData(id); first = (d && d.features && d.features[0]) ? JSON.stringify(d.features[0]).slice(0, 400) : ''; } catch (_) { first = ''; }
        out.surfaces[id] = String((r.surfaces[id] && r.surfaces[id].features) || 0) + '|' + first;
      });
    } catch (_) { /* could not look: nothing is claimed */ }
    try { const OB = OBJ(); if (OB && typeof OB.list === 'function') out.objects = (OB.list() || []).map((o) => String(o && o.id)); } catch (_) { }
    return out;
  }
  function camera() {
    try {
      const cam = GE() && GE().camera; if (!cam) return null;
      const c = cam.getCenter(), z = +cam.getZoom();
      if (!c || !isFinite(+c.lng) || !isFinite(+c.lat) || !isFinite(z)) return null;
      return { lng: +c.lng, lat: +c.lat, zoom: z, bearing: +cam.getBearing() || 0, pitch: +cam.getPitch() || 0 };
    } catch (_) { return null; }
  }
  ledger.subscribe((ev) => {
    if (ev.type === 'op' && ev.phase === 'started') before[ev.callId] = fingerprint();
    if (ev.type === 'op' && ev.phase === 'settled') {
      const b = before[ev.callId]; delete before[ev.callId];
      const d = drawnDiff(b, fingerprint());
      /* the camera the call left the map in: the way back to a move (it drew nothing), and the fallback
         when what it drew is no longer on the map. Only for a call whose verdict says it produced the map. */
      const cam = (d.surfaces.length || d.objects.length || (ev.produced || []).indexOf('map') >= 0) ? camera() : null;
      if (d.surfaces.length || d.objects.length || cam) {
        ledger.noteDrawing(ev.callId, { surfaces: d.surfaces, objects: d.objects, camera: cam });
        return;   /* noteDrawing re-renders */
      }
    }
    render();
  });

  /* ── going back to what a step drew ── */
  function targetOf(step) {
    const t = { surfaces: [], objects: [], camera: null };
    (step.ops || []).forEach((o) => {
      const d = o.draw; if (!d) return;
      (d.surfaces || []).forEach((s) => { if (t.surfaces.indexOf(s) < 0) t.surfaces.push(s); });
      (d.objects || []).forEach((s) => { if (t.objects.indexOf(s) < 0) t.objects.push(s); });
      if (d.camera) t.camera = d.camera;
    });
    return (t.surfaces.length || t.objects.length || t.camera) ? t : null;
  }
  function focus(step) {
    const t = targetOf(step); if (!t) return false;
    const E = GE(); if (!E || !E.camera) return false;
    /* what is still on the map, framed; then an object the list can still focus; then the camera it was drawn in */
    let feats = [];
    t.surfaces.forEach((id) => { try { const d = E.layers.sourceData(id); if (d && Array.isArray(d.features)) feats = feats.concat(d.features); } catch (_) { } });
    const bb = bboxOf(feats);
    try {
      if (bb) {
        if (bb[0][0] === bb[1][0] && bb[0][1] === bb[1][1]) E.camera.flyTo({ center: bb[0], zoom: Math.max(E.camera.getZoom(), 10), duration: 800 });
        else E.camera.fitBounds(bb, { padding: 70, maxZoom: 12, duration: 800 });
        return true;
      }
      const OB = OBJ(); const live = (OB && typeof OB.list === 'function') ? (OB.list() || []).map((o) => String(o && o.id)) : [];
      const oid = t.objects.find((id) => live.indexOf(id) >= 0);
      if (oid && OB && typeof OB.focus === 'function') { OB.focus(oid); return true; }
      if (t.camera) { E.camera.flyTo({ center: [t.camera.lng, t.camera.lat], zoom: t.camera.zoom, bearing: t.camera.bearing, pitch: t.camera.pitch, duration: 800 }); return true; }
    } catch (_) { }
    return false;
  }

  /* ── the plan, in the work trace ── built with the DOM, so nothing the model wrote is ever parsed as
     markup. ⚠ (atlas-progress-one) THE STEPS WEAR THE TRACE'S OWN MARKS: a step is a row of the trace
     (`.atl-trace-row`) in the trace state its observed state maps to, so a tick, a ring and a cross
     mean the same thing on a step as on an operation. The state's WORD is written only where the mark
     alone cannot say which state it is (a ring is partial, unobserved or waiting) — a tick that also
     said 「Done」 would be the same fact twice. */
  const TRACE_STATE = { completed: 'ok', partial: 'warn', unobserved: 'warn', waiting: 'warn', failed: 'fail', stopped: 'skip',
    running: 'run', pending: 'pending', noop: 'noop' };
  const SAYS_ITSELF = { completed: 1, running: 1, pending: 1 };
  let lastSlot = null;
  const boundSlot = Object.create(null);   /* (atlas-plan-per-question) declaredTurn → the trace slot that list belongs to */
  function render() {
    const slot = deps.slot ? deps.slot() : null;
    /* ⚠ A PLAN BELONGS TO THE TURN THAT DECLARED IT. The ledger is one per conversation and keeps the last plan, and this
       view used to draw that plan into EVERY new turn's trace the moment the turn began (js/atlas-live.js begin) — so the
       reader who sent an unrelated question saw the previous question's checklist above the new work, before Atlas had said
       anything about a plan. The record is now drawn into a trace only once THIS turn has declared or revised it
       (`thisTurn`, which declare() stamps); the trace of an earlier turn keeps the plan it showed — it is the record of
       that turn — and is no longer emptied when a later turn starts. */
    lastSlot = slot;
    if (!slot) return;
    const s = ledger.snapshot();
    if (!s || !s.declaredThisTurn) return;   /* nothing is drawn, and nothing already drawn is erased: a slot holds the plan of the turn it belongs to */
    /* ⚠ (atlas-plan-per-question) …AND «THIS TURN» IS THE TURN THE LIST WAS WRITTEN IN, NOT THE TURN THE LEDGER IS ON AT THIS INSTANT. The view is asked to
       draw the moment a new reply opens (js/atlas-live.js begin), which is BEFORE the loop has told the ledger a new turn began (runTurn beginTurn) —
       so for that one call `declaredThisTurn` still described the previous turn, and the previous question's checklist was drawn into the new
       question's trace, where it stayed (measured on production 2026-11-28: the G7 CO2 answer carried the five-country GDP plan, 2/2). The list is
       bound to the first slot it is drawn into; another slot gets it only when a later turn writes a list of its own. */
    const bound = boundSlot[s.declaredTurn];
    if (bound && bound !== slot) return;
    boundSlot[s.declaredTurn] = slot;
    const done = s.steps.filter((x) => x.state === 'completed').length;
    const bad = s.steps.some((x) => x.state === 'failed' || x.state === 'stopped');
    const warn = s.steps.some((x) => x.state === 'partial' || x.state === 'unobserved' || x.state === 'waiting');
    let card = slot.querySelector('.atl-plan');
    if (!card) {
      slot.innerHTML = '<div class="atl-plan"><div class="atl-plan-head"><span class="atl-plan-goal"></span>'
        + '<span class="atl-plan-count"></span></div><ol class="atl-plan-steps"></ol></div>';
      card = slot.querySelector('.atl-plan');
      const ol0 = card.querySelector('.atl-plan-steps');
      if (ol0 && ol0.addEventListener) ol0.addEventListener('click', (e) => {
        const li = e.target && e.target.closest ? e.target.closest('.atl-plan-step.can') : null; if (!li) return;
        const c = ledger.snapshot(); const st = c && c.steps[+li.dataset.n - 1]; if (st) focus(st);
      });
    }
    card.classList.toggle('bad', bad); card.classList.toggle('warn', !bad && warn);
    card.querySelector('.atl-plan-goal').textContent = s.goal || L('Plan', '計画');
    card.querySelector('.atl-plan-count').textContent = done + '/' + s.steps.length;
    const ol = card.querySelector('.atl-plan-steps');
    while (ol.firstChild) ol.removeChild(ol.firstChild);
    s.steps.forEach((st) => {
      const can = !!targetOf(st);
      const ts = TRACE_STATE[st.state] || 'warn';
      const word = (WORDS[st.state] || (() => st.state))();
      const li = document.createElement('li');
      li.className = 'atl-trace-row atl-plan-step ' + ts + ' s-' + st.state + (can ? ' can' : '') + (s.live && s.thisTurn && st.n === s.current ? ' cur' : '');
      li.dataset.n = String(st.n);
      li.setAttribute('aria-label', st.n + '. ' + st.title + ' — ' + word);
      let m = null; try { m = deps.mark ? deps.mark(ts) : null; } catch (_) { m = null; }
      if (!m) { m = document.createElement('span'); m.className = 'atl-trace-mark'; }
      li.appendChild(m);
      const t = document.createElement('span'); t.className = 'atl-trace-word'; t.textContent = st.n + '. ' + st.title; li.appendChild(t);
      const w = document.createElement('span'); w.className = 'atl-trace-det'; w.textContent = SAYS_ITSELF[st.state] ? '' : word; li.appendChild(w);
      li.setAttribute('title', can ? word + ' — ' + L('Show what this step drew', 'この手順が描いたものへ移動') : word);
      if (can) {
        li.setAttribute('role', 'button'); li.tabIndex = 0;
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focus(st); } });
      }
      ol.appendChild(li);
    });
  }

  return { render, focus, targetOf, fingerprint };
}
