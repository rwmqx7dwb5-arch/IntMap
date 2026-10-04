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
export const PLAN_TOOL = {
  name: 'plan',
  description: 'Declare your plan for a request that takes several pieces of work, and say which step the calls '
    + 'that follow serve. The reader sees the plan above your work, with each step\'s state as IntMap observes it. '
    + 'First call: {"goal", "steps":[short titles in the reader\'s language], "current":1}, made in the SAME reply '
    + 'as the calls of step 1. Moving on: {"current":n} in the same reply as that step\'s calls. To replace the plan, '
    + 'send new steps. A request that one or two calls answer needs no plan. The plan stays in the conversation: '
    + 'a later request may name a step ("redo step 2") — set "current" to it and make its calls again.',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string' },
      steps: { type: 'array', items: { type: 'string', minLength: 1 } },
      current: { type: 'integer', minimum: 1 },
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

/**
 * makeAtlasPlan() -> ledger
 *
 * ONE ledger per conversation (js/atlas-console.js), handed to every runTurn as `opts.plan`. It holds
 * the latest plan Atlas declared and, per step, the calls made while that step was current.
 */
export function makeAtlasPlan() {
  let plan = null;            /* {id, goal, steps:[{title, ops:[], touched}], current (0-based), turn} */
  let seq = 0;
  let turnNo = 0;
  let live = false;           /* a turn is running */
  let activeThisTurn = false; /* Atlas said, in THIS turn, which step its calls serve */
  const inflight = Object.create(null);   /* callId → op */
  const subs = [];

  function emit(ev) { subs.slice().forEach((f) => { try { f(ev, snapshot()); } catch (_) { /* a viewer never breaks the turn */ } }); }

  function latestPerCapability(ops) {
    const by = Object.create(null), order = [];
    ops.forEach((o) => { if (!(o.cap in by)) order.push(o.cap); by[o.cap] = o; });
    return order.map((k) => by[k]);
  }
  function stepState(st, i) {
    if (st.ops.some((o) => o.inflight)) return 'running';
    const last = latestPerCapability(st.ops);
    if (last.length) {
      let worst = 'completed';
      last.forEach((o) => { if ((RANK[o.state] != null ? RANK[o.state] : 9) < RANK[worst]) worst = o.state; });
      return worst;
    }
    if (live && activeThisTurn && plan && plan.current === i) return 'running';
    return st.touched ? 'noop' : 'pending';
  }

  function snapshot() {
    if (!plan) return null;
    return {
      id: plan.id, goal: plan.goal, current: plan.current + 1, live, turn: plan.turn, thisTurn: plan.turn === turnNo,
      steps: plan.steps.map((st, i) => ({
        n: i + 1, title: st.title, state: stepState(st, i),
        ops: st.ops.map((o) => ({ callId: o.callId, capability: o.cap, state: o.state, code: o.code || undefined, turn: o.turn, draw: o.draw || null })),
      })),
    };
  }

  /* beginTurn() — js/atlas-agent.js runTurn, before its first step. Which step the calls serve is a
     statement about THIS turn: a call made in a later turn that never mentioned the plan is not filed
     under whatever step an earlier turn left current. */
  function beginTurn() { turnNo++; live = true; activeThisTurn = false; emit({ type: 'turn', phase: 'begin' }); }

  /* declare(args) -> the tool's record. Runs where the loop reads the reply, IN CALL ORDER, so a plan
     call earlier in a reply decides which step the calls after it serve. */
  function declare(args) {
    const a = (args && typeof args === 'object') ? args : {};
    const steps = Array.isArray(a.steps) ? a.steps.map((s) => String(s == null ? '' : s).trim()).filter(Boolean) : null;
    if (steps && steps.length) {
      /* a revision keeps what was observed for every step it did not rename — the same piece of work */
      const prev = plan ? plan.steps : [];
      plan = { id: ++seq, goal: String(a.goal == null ? (plan ? plan.goal : '') : a.goal).trim(), turn: turnNo, current: 0,
        steps: steps.map((t, i) => {
          const old = prev[i] && normTitle(prev[i].title) === normTitle(t) ? prev[i] : null;
          return { title: t, ops: old ? old.ops : [], touched: old ? old.touched : false };
        }) };
    } else if (!plan) {
      return { ok: false, error: 'no_plan',
        message: 'There is no plan to update yet. Declare one with "goal" and "steps" (and "current"), or make the calls without a plan.' };
    } else if (a.goal != null && String(a.goal).trim()) {
      plan.goal = String(a.goal).trim();
    }
    if (a.current != null) {
      const c = Math.floor(+a.current);
      if (!(c >= 1 && c <= plan.steps.length)) {
        return { ok: false, error: 'no_such_step',
          message: 'The plan has steps 1-' + plan.steps.length + '; there is no step ' + String(a.current) + '. Nothing was changed.' };
      }
      plan.current = c - 1;
    }
    plan.turn = turnNo;
    plan.steps[plan.current].touched = true;
    activeThisTurn = true;
    emit({ type: 'plan' });
    return { ok: true, plan: forModel(),
      note: 'Plan recorded and shown to the reader above your work. The calls you make from here serve step ' + (plan.current + 1)
        + ' until you set "current" again. Each step\'s state is what IntMap OBSERVES of those calls, never what you say.' };
  }

  /* the step the next call is filed under, or -1 — asked by the loop in call order */
  function attribute() { return (plan && activeThisTurn) ? plan.current : -1; }

  /* started / settled — the loop around ONE call that reaches the app (not the plan tool itself) */
  function started(callId, info) {
    if (!plan || !callId) return;
    const i = (info && info.step != null) ? info.step : -1;
    if (!(i >= 0 && i < plan.steps.length)) return;
    const op = { callId: String(callId), cap: String((info && info.capability) || (info && info.name) || ''), state: 'running', inflight: true, turn: turnNo, planId: plan.id };
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
    op.code = String(rec.code || rec.error || '') || undefined;
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
    return { goal: s.goal, current: s.current,
      steps: s.steps.map((st) => ({ n: st.n, title: st.title, state: st.state,
        operations: latestPerCapability(plan.steps[st.n - 1].ops).map((o) => o.cap + ' ' + o.state + (o.code ? ' (' + o.code + ')' : '')
          + (o.turn !== turnNo ? ' [earlier turn]' : '')) })) };
  }
  function promptBlock() {
    const m = forModel(); if (!m) return '';
    const lines = m.steps.map((st) => st.n + '. ' + st.title + ' — ' + st.state + (st.operations.length ? ': ' + st.operations.join('; ') : ''));
    return '[YOUR PLAN — declared by you' + (plan.turn === turnNo && live ? ' in this turn' : ' in an earlier turn')
      + '; each state is what IntMap OBSERVED of the calls made under that step]\nGoal: ' + (m.goal || '(none given)') + '\n'
      + lines.join('\n') + '\nCurrent step: ' + m.current + (activeThisTurn ? '' : ' (not set in this turn — calls are filed under a step only after you call plan with "current")')
      + '\n"unobserved" means the call ran and its effect could not be seen; "noop" means the step was current and nothing ran under it.\n\n';
  }

  function subscribe(fn) { if (typeof fn === 'function') subs.push(fn); return () => { const k = subs.indexOf(fn); if (k >= 0) subs.splice(k, 1); }; }

  return { TOOL: PLAN_TOOL, beginTurn, declare, attribute, started, settled, noteDrawing, endTurn,
    snapshot, forModel, promptBlock, subscribe };
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
  function render() {
    const slot = deps.slot ? deps.slot() : null;
    /* ONE PLACE: the plan stands in the latest turn's trace, and leaves the one it stood in before */
    if (lastSlot && lastSlot !== slot) { try { lastSlot.innerHTML = ''; } catch (_) { } }
    lastSlot = slot;
    if (!slot) return;
    const s = ledger.snapshot();
    if (!s) { slot.innerHTML = ''; return; }
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
