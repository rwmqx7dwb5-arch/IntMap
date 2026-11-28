/* ============================================================================
 *  IntMap · ATLAS — WORKING MEMORY: WHAT A LONG JOB KEEPS, AS STRUCTURE       js/atlas-working-memory.js
 * ----------------------------------------------------------------------------
 *  MEASURED before this (2026-11-20, js/atlas-agent.js composeInput + js/atlas-console.js recordTurn):
 *  a long job kept exactly two things across turns — `_hist`, 48 lines of prose where a reply is cut at
 *  180 characters and what it DID at 260, and `_wctx`, five scalar fields. When the budget ran out the
 *  oldest history lines were dropped and ONE item said «N messages were left out». So after a long
 *  piece of work the numbers a tool had returned, the source a figure came from, the condition the reader
 *  set ten turns ago and the part still owed were each either a clipped sentence or gone, and the only
 *  recourse was to run the tool again — a DIFFERENT answer for anything live.
 *
 *  NOW each kind of thing is its own structure, written when it happens, never reconstructed from prose:
 *    goal       the request in hand, with the plan's steps; earlier goals and how each ended
 *    decisions  conditions fixed so far (exclusions, period, metric, recipe…), keyed, with the turn and who set them
 *    done       what ran — capability, exact args, status, a one-line headline, and a REF to the whole result
 *    saved      pinned figures {label, value, unit, ref, path}: the value AND the address of the original
 *    open       what is still owed or asked, until something resolves it
 *    evidence   sources a figure came from — url, publisher, date retrieved — with the ref of the data
 *    results    the ORIGINAL tool results, whole, by ref (bounded; an evicted body keeps its digest and numbers)
 *  and one door reaches the originals: js/atlas-agent.js `read_result` (the loop already owned it) now
 *  also answers a ref from an EARLIER turn, a `path` into it for ONE number, and `memory` for the whole
 *  record. Nothing in a summary line is the only copy of anything.
 *
 *  ⚠ THIS DECIDES NOTHING FOR ATLAS (CONSTITUTION.md §5). No tool is refused or limited; the block is
 *  context, the same standing as [WORKING CONTEXT]. What is kept is chosen by structure (a result is
 *  kept because it happened), never by guessing which words matter. The one budget is the block's own
 *  size, spent in a stated order, and every item left out is NAMED («+N older done: …») with the door that
 *  reads it — one-pass-or-a-reason §2: the result reaches the next step's model, or it says it did not.
 *
 *  ⚠ REUSES, DOES NOT REPLACE: `_wctx` stays the live working context (its decisions are mirrored here
 *  for the snapshot, and are NOT printed twice); the turn ledger (js/atlas-state.js) stays the machine
 *  record of operations — this reads it through `recordTurn`; the plan (js/atlas-plan.js) keeps the
 *  plan. What none of them held — the bodies, the numbers, the sources, the handoff — is held here.
 *
 *  Pure ES module: no DOM, no window, no network. Storage is passed in (`o.store`: getItem/setItem), so
 *  tests/atlas-working-memory-checks.test.mjs runs THIS module, the one the browser runs.
 * ==========================================================================*/

export const MEMORY_REF = 'memory';           /* the read_result call_id that reads the whole record */
const VERSION = 1;
const LIMITS = Object.freeze({
  bodyChars: 1500000,       /* all stored result bodies together — memory; the persisted copy has its own, smaller, cap below */
  persistChars: 900000,     /* what is written to the device store (localStorage holds ~5M characters per origin, shared) */
  numbersPerResult: 60,     /* numeric leaves indexed per result */
  pins: 200, done: 300, open: 60, evidence: 120, goals: 60, turns: 80,
  blockChars: 7000,         /* the reinjected block, per turn */
});

const s = (v, n) => String(v == null ? '' : v).slice(0, n);
const isNum = (v) => typeof v === 'number' && isFinite(v);
function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
function textOf(rec) { try { return JSON.stringify(rec); } catch (_) { return String((rec && rec.message) || ''); } }

/* the numeric leaves of a result, with their addresses — MECHANICAL (shape, not meaning): `a.b[2].c` and the value */
export function numericLeaves(v, max) {
  const out = []; max = max || LIMITS.numbersPerResult;
  (function walk(x, path, depth) {
    if (out.length >= max || depth > 6) return;
    if (isNum(x)) { out.push({ path: path || '$', value: x }); return; }
    if (Array.isArray(x)) { for (let i = 0; i < x.length && i < 20 && out.length < max; i++) walk(x[i], path + '[' + i + ']', depth + 1); return; }
    if (x && typeof x === 'object') Object.keys(x).forEach((k) => { if (out.length < max && k !== 'id' && k !== 'call_id') walk(x[k], path ? path + '.' + k : k, depth + 1); });
  })(v, '', 0);
  return out;
}
/* the value at `path` ($, a.b, a[2].c) in the ORIGINAL data — the same addressing numericLeaves wrote */
export function atPath(root, path) {
  const p = String(path || '$').replace(/^\$\.?/, '');
  if (!p) return { found: true, value: root };
  const parts = p.match(/[^.[\]]+/g) || [];
  let cur = root;
  for (const k of parts) {
    if (cur == null || typeof cur !== 'object' || !Object.hasOwn(cur, k)) return { found: false };
    cur = cur[k];
  }
  return { found: true, value: cur };
}
/* one address however it is spelled — `$.a.b[2]`, `a.b.2` and `a.b[2]` are the same — split the way atPath reads it */
function pathKey(path) {
  const p = String(path || '$').replace(/^\$\.?/, '');
  return (p.match(/[^.[\]]+/g) || []).join('\u0000');
}

/* Retain tables independently of their surrounding text and diagnostics. */
function tableParts(rec) {
  const tables = {};
  function walk(value, path, depth = 0) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 6) return;
    if (Array.isArray(value.rows) && Array.isArray(value.columns)) {
      tables[path] = { rows: value.rows, columns: value.columns, sources: value.sources, provenance: value.provenance };
      return;
    }
    for (const [key, nested] of Object.entries(value)) walk(nested, path ? path + '.' + key : key, depth + 1);
  }
  walk(rec, '');
  return textOf(tables);
}
/* the shape of a result in one line: keys and the size of each array/object — what is in it, not what it means */
function shapeLine(rec) {
  if (!rec || typeof rec !== 'object') return typeof rec;
  return Object.keys(rec).filter((k) => k !== 'id' && k !== 'name').slice(0, 14).map((k) => {
    const v = rec[k];
    return k + (Array.isArray(v) ? '[' + v.length + ']' : (v && typeof v === 'object') ? '{' + Object.keys(v).length + '}' : '');
  }).join(',');
}
function headlineOf(rec) {
  if (!rec || typeof rec !== 'object') return '';
  const t = rec.summary || rec.message || rec.note || rec.text || '';
  return s(t, 160) || (rec.error ? 'error ' + s(rec.error, 60) : '') || s(rec.status || '', 40);
}

/* wmTurnRecord — the finished turn, as the memory files it: the console's facts in, structure out (no meaning is read) */
export function wmTurnRecord(turnId, question, out, wctx, planSnap, ledgerTurn) {
  out = out || {}; wctx = wctx || {};
  const dec = {};
  if (wctx.countries && wctx.countries.length) dec.countries = wctx.countries;
  if (wctx.topic) dec.topic = wctx.topic;
  if (wctx.metrics && wctx.metrics.length) dec.metrics = wctx.metrics;
  if (wctx.scoreComponents) dec.score_recipe = wctx.scoreComponents;
  if (wctx.period) dec.period = wctx.period;
  if (wctx.year != null) dec.year = wctx.year;
  if (wctx.exclusions && wctx.exclusions.length) dec.exclusions = wctx.exclusions;
  const stopped = String(out.stopped || '');
  return { turnId: turnId, question: question, reply: out.text || '', unmet: out.unmet, unresolved: ledgerTurn && ledgerTurn.unresolved,
    decisions: dec, outside: out.externalContentSeen === true,
    plan: planSnap?.thisTurn ? planSnap : undefined,
    steps: planSnap?.thisTurn ? planSnap.steps.map((x) => ({ title: x.title, state: x.state })) : undefined,
    resumedFrom: out.resumedFrom, acknowledged: out.acknowledged,
    awaiting: stopped === 'awaiting_user',
    outcome: stopped === 'awaiting_user' ? 'asked' : (String(out.completion || '') || (stopped ? 'stopped' : 'answered')) };
}

export function makeAtlasWorkingMemory(o) {
  o = o || {};
  const store = o.store && typeof o.store.getItem === 'function' ? o.store : null;
  const key = String(o.key || 'intmap.atlas.working-memory.v1');
  const L = Object.assign({}, LIMITS, o.limits || {});
  let st;
  function fresh() {
    return { v: VERSION, goal: null, goals: [], decisions: {}, done: [], open: [], evidence: {}, pins: {}, results: {}, turns: [], seq: 0, outside: false };
  }
  st = fresh();
  const bodyChars = () => Object.keys(st.results).reduce((a, k) => a + (st.results[k].text ? st.results[k].text.length : 0), 0);
  /* every change is written to the device copy, coalesced to once per tick — a result arriving mid-turn survives a reload, and ten pins cost one write */
  let queued = false;
  function later() { if (!store || queued) return; queued = true; Promise.resolve().then(() => { queued = false; save(); }); }
  const refOf = (turnId, callId) => 't' + turnId + '.' + callId;

  /* ── writing ─────────────────────────────────────────────────────────────────────────────── */
  function beginTurn(turnId, request, steps) {
    if (st.goal && st.goal.turnId !== turnId && !st.goal.closed) closeGoal('superseded');
    st.goal = { turnId: turnId, request: s(request, 4000), steps: [], at: Date.now(), closed: false };
    if (Array.isArray(steps)) setSteps(steps);
    return st.goal;
  }
  function setSteps(steps) { if (st.goal) st.goal.steps = (steps || []).slice(0, 20).map((x) => ({ title: s(x && x.title, 160), state: s(x && x.state, 24) })); }
  function closeGoal(outcome) {
    if (!st.goal || st.goal.closed) return;
    st.goal.closed = true;
    st.goals.push({ turnId: st.goal.turnId, request: s(st.goal.request, 400), outcome: s(outcome, 24), at: st.goal.at });
    if (st.goals.length > L.goals) st.goals.splice(0, st.goals.length - L.goals);
  }
  function decide(k, value, by, turnId) {
    k = s(k, 60); if (!k) return null;
    const cur = st.decisions[k];
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) { delete st.decisions[k]; return null; }
    const v = typeof value === 'string' ? s(value, 600) : clone(value);
    if (cur && JSON.stringify(cur.value) === JSON.stringify(v)) return cur;     /* the same condition restated keeps its first turn */
    return (st.decisions[k] = { key: k, value: v, by: s(by || 'atlas', 12), turnId: turnId == null ? (st.goal && st.goal.turnId) : turnId, at: Date.now() });
  }
  /* noteResult — ONE tool result, whole. Called by the loop for every answered call, before any trimming. */
  function noteResult(turnId, callId, name, args, rec) {
    if (!callId || !rec || rec.readResult === true) return null;
    const ref = refOf(turnId, callId);
    const text = textOf(rec);
    const numbers = numericLeaves(rec);
    st.results[ref] = { ref: ref, turnId: turnId, callId: String(callId), name: s(name, 80), args: s(textOf(args || {}), 300), size: text.length,
      shape: s(shapeLine(rec), 200), headline: headlineOf(rec), status: s(rec.status || (rec.ok === false ? 'failed' : 'ok'), 16), numbers: numbers, text: text, evicted: false };
    const tables = tableParts(rec);
    if (tables && tables !== '{}' && tables.length <= L.persistChars) st.results[ref].tables = tables;
    st.done.push({ turnId: turnId, callId: String(callId), name: s(name, 80), args: s(textOf(args || {}), 300), status: st.results[ref].status, ref: ref, headline: st.results[ref].headline });
    if (st.done.length > L.done) st.done.splice(0, st.done.length - L.done);
    evict(); later();
    return ref;
  }
  /* bodies are bounded; the oldest body goes first and what stays says so — digest, shape and numbers are never evicted */
  function evict() {
    let total = bodyChars();
    const refs = Object.keys(st.results).sort((a, b) => st.results[a].turnId - st.results[b].turnId);
    for (let i = 0; i < refs.length && total > L.bodyChars; i++) {
      const r = st.results[refs[i]];
      if (!r.text) continue;
      total -= r.text.length; r.text = ''; r.evicted = true;
    }
    let retained = 0;
    for (const ref of refs.reverse()) {
      const r = st.results[ref];
      if (!r.tables) continue;
      if (retained + r.tables.length <= L.persistChars) retained += r.tables.length;
      else delete r.tables;
    }
  }
  /* pin — a figure the job depends on, with the address of the original it came from. `ref`+`path` is checked
     against the stored body, so a pin cannot claim a value the data does not hold. */
  function pin(label, value, o2) {
    o2 = o2 || {};
    const id = 'p' + (++st.seq);
    let value2 = value, verified = false;
    const r = o2.ref ? st.results[o2.ref] : null;
    if (r && o2.path && r.text) {
      try { const hit = atPath(JSON.parse(r.text), o2.path); if (hit.found) { value2 = hit.value; verified = true; } } catch (_) { /* a body that is not JSON cannot be addressed */ }
    }
    st.pins[id] = { id: id, label: s(label, 120), value: value2, unit: s(o2.unit, 24), ref: o2.ref || null, path: o2.path || null, verified: verified, turnId: o2.turnId == null ? (st.goal && st.goal.turnId) : o2.turnId };
    const ids = Object.keys(st.pins); if (ids.length > L.pins) delete st.pins[ids[0]];
    later(); return st.pins[id];
  }
  function addEvidence(e) {
    if (!e || !(e.url || e.title)) return null;
    const id = s(e.id || e.url || e.title, 300);
    st.evidence[id] = { id: id, url: s(e.url, 500), title: s(e.title, 200), publisher: s(e.publisher || e.host, 90), retrievedAt: s(e.retrievedAt, 32), publishedAt: s(e.publishedAt, 32),
      ref: e.ref || null, facts: (Array.isArray(e.facts) ? e.facts : []).slice(0, 6).map((f) => s(typeof f === 'string' ? f : textOf(f), 200)), turnId: e.turnId == null ? (st.goal && st.goal.turnId) : e.turnId };
    const ids = Object.keys(st.evidence); if (ids.length > L.evidence) delete st.evidence[ids[0]];
    later(); return st.evidence[id];
  }
  function open(text, kind, turnId) {
    const t = s(text, 400); if (!t) return null;
    const type = s(kind || 'owed', 16);
    const turn = turnId ?? st.goal?.turnId;
    const dup = st.open.find((x) => x.text === t && x.kind === type && x.state === 'open' && (type === 'job' || x.turnId === turn));
    if (dup) return dup;
    const rec = { id: 'o' + (++st.seq), text: t, kind: type, turnId: turn, state: 'open' };
    st.open.push(rec); if (st.open.length > L.open) st.open.splice(0, st.open.length - L.open);
    return rec;
  }
  function resolve(idOrText) { st.open.forEach((x) => { if (x.state === 'open' && (x.id === idOrText || x.text === idOrText)) x.state = 'resolved'; }); }
  /* what the finished turn leaves: the question and reply whole, what is still owed, what it settled */
  function recordTurn(t) {
    t = t || {};
    const turnId = t.turnId;
    if (t.outside === true) st.outside = true;      /* a fact about the turn, as js/atlas-console.js records it: outside content was in front of the model */
    st.turns.push({ turnId: turnId, question: s(t.question, 20000), reply: s(t.reply, 20000), at: Date.now() });
    if (st.turns.length > L.turns) st.turns.splice(0, st.turns.length - L.turns);
    const plan = t.plan;
    if (plan?.requestKey) {
      const requirements = plan.cancelled ? [] : plan.steps.flatMap((step) => step.requirements || []);
      const byId = new Map(requirements.map((r) => [r.id, r]));
      for (const row of st.open) {
        if (row.state !== 'open' || row.requestKey !== plan.requestKey) continue;
        const observed = byId.get(row.deliverable);
        if (plan.cancelled) row.state = 'cancelled';
        else if (observed?.state === 'completed' && plan.version === row.requestVersion) row.state = 'resolved';
        else if (plan.version > row.requestVersion) row.state = 'superseded';
      }
      for (const r of requirements) {
        if (r.state === 'completed') continue;
        const current = st.open.find((row) => row.state === 'open' && row.requestKey === plan.requestKey && row.requestVersion === plan.version && row.deliverable === r.id);
        const fields = { requestKey: plan.requestKey, planId: plan.id, requestVersion: plan.version, deliverable: r.id,
          demand: { output: r.output, target: r.target, classification: r.classification, representation: r.representation, verification: r.verification },
          progress: r.state, reason: r.code, updatedTurnId: turnId };
        if (current) Object.assign(current, fields);
        else {
          st.open.push({ id: 'o' + (++st.seq), text: s(r.label, 400), kind: 'deliverable', turnId, state: 'open', ...fields });
          if (st.open.length > L.open) st.open.splice(0, st.open.length - L.open);
        }
      }
    }
    const unresolved = (Array.isArray(t.unmet) ? t.unmet : []).filter((u) => !u.planId);
    for (const row of st.open) {
      if (row.state === 'open' && row.turnId === t.resumedFrom && row.needId && t.acknowledged?.includes(row.needId)) row.state = 'resolved';
    }
    unresolved.forEach((u) => {
      const row = open(u?.kind === 'goal' ? s(u.need, 220)
      : u?.kind === 'step' ? 'step ' + u.n + ' "' + s(u.title, 80) + '" ' + u.state
        : 'output ' + s(u && u.mode, 40) + ' not produced (' + s(u && u.code, 40) + ')', 'unmet', t.resumedFrom ?? turnId);
      if (row && u.id) row.needId = u.id;
    });
    (Array.isArray(t.unresolved) ? t.unresolved : []).forEach((u) => open(typeof u === 'string' ? u : textOf(u), 'unresolved', turnId));
    if (t.question && /[?？]\s*$/.test(String(t.reply || '').trim()) && t.awaiting) open('asked the reader: ' + s(t.reply, 300), 'user', turnId);
    if (st.goal?.turnId === turnId) {
      Object.keys(t.decisions || {}).forEach((k) => decide(k, t.decisions[k], 'wctx', turnId));
      if (Array.isArray(t.steps)) setSteps(t.steps);
      closeGoal(t.outcome || 'answered');
    }
    (Array.isArray(t.evidence) ? t.evidence : []).forEach(addEvidence);
    save();
  }
  function dropFrom(turnId) {        /* a rewound conversation: what those turns settled goes with them */
    const keep = (x) => !(x && x.turnId != null && x.turnId >= turnId);
    st.done = st.done.filter(keep); st.open = st.open.filter(keep); st.turns = st.turns.filter(keep); st.goals = st.goals.filter(keep);
    Object.keys(st.results).forEach((k) => { if (!keep(st.results[k])) delete st.results[k]; });
    Object.keys(st.pins).forEach((k) => { if (!keep(st.pins[k])) delete st.pins[k]; });
    Object.keys(st.evidence).forEach((k) => { if (!keep(st.evidence[k])) delete st.evidence[k]; });
    Object.keys(st.decisions).forEach((k) => { if (!keep(st.decisions[k])) delete st.decisions[k]; });
    if (st.goal && !keep(st.goal)) st.goal = null;
    if (!st.turns.length) st.outside = false;
    save();
  }
  function clear() { st = fresh(); save(); }
  /* (atlas-outside-mark) the block carries words a turn with outside content wrote, until the rewind or clear that removes them */
  const carriesOutside = () => st.outside === true;

  /* ── reading: the door to the originals ──────────────────────────────────────────────────── */
  function has(ref) { return ref === MEMORY_REF || !!st.results[ref]; }
  function refs() { return Object.keys(st.results); }
  /* recall(ref, path) → { ok, text, … } — the whole stored result (or one value in it), as the text read_result pages */
  function recall(ref, path) {
    if (ref === MEMORY_REF) return { ok: true, text: handoffText() };
    const r = st.results[ref];
    if (!r) return { ok: false, error: 'unknown_ref', message: 'Working memory holds no result "' + s(ref, 80) + '".' };
    /* (atlas-child-loop-reuse) THE INDEX ANSWERS WHAT IT HOLDS. The body went to stay within memory, but the numbers were indexed by path
       precisely so they survive it — and a read of `figures[11]` answered `body_evicted` with no value while `figures[11]=1011` sat in the index
       (measured 2026-11-27, external audit). A path that is in the index EXACTLY (the same address, however it is spelled: a.b[3] = a.b.3) is
       answered from it; anything else still says the body is gone, and the message carries the indexed values, not only their paths. */
    if (!r.text && path) {
      const want = pathKey(path);
      if (r.tables) {
        for (const [root, table] of Object.entries(JSON.parse(r.tables))) {
          const prefix = pathKey(root);
          if (prefix && want !== prefix && !want.startsWith(prefix + '\u0000')) continue;
          const hit = atPath(table, want.slice(prefix.length).replace(/^\u0000/, '').replace(/\u0000/g, '.'));
          if (hit.found) return { ok: true, text: ref + ' ' + path + ' = ' + textOf(hit.value), fromTable: true };
        }
      }
      const hit = (r.numbers || []).find((n) => pathKey(n.path) === want);
      if (hit) return { ok: true, text: ref + ' ' + path + ' = ' + textOf(hit.value) + ' (from the index of numbers; the rest of the body was dropped to stay within memory)', fromIndex: true };
    }
    if (!r.text && !path && r.tables) return { ok: true, text: 'Retained tables from ' + ref + ' (outside the original result body): ' + r.tables, fromTable: true };
    if (!r.text) return { ok: false, error: 'body_evicted', message: 'The body of ' + ref + ' (' + r.name + ', ' + r.size + ' characters) was dropped to stay within memory. Its numbers are still here (read it with a path from: '
      + r.numbers.slice(0, 8).map((n) => n.path + '=' + n.value).join(', ') + '); to read the rest, run ' + r.name + ' again with ' + r.args + '.', numbers: r.numbers };
    if (path) {
      let hit; try { hit = atPath(JSON.parse(r.text), path); } catch (_) { hit = { found: false }; }
      if (!hit.found) return { ok: false, error: 'no_such_path', message: 'No value at "' + s(path, 80) + '" in ' + ref + '. Numbers indexed: ' + r.numbers.slice(0, 8).map((n) => n.path).join(', ') + '.' };
      return { ok: true, text: ref + ' ' + path + ' = ' + textOf(hit.value) };
    }
    return { ok: true, text: r.text };
  }

  /* ── reinjection: the block the next turn's model reads ──────────────────────────────────── */
  const fmtVal = (v) => (typeof v === 'string' ? v : textOf(v));
  function block(opts2) {
    opts2 = opts2 || {};
    const budget = opts2.budget || L.blockChars;
    const secs = [];
    const add = (title, lines, olderLabel) => { if (lines.length) secs.push({ title: title, lines: lines, older: olderLabel }); };
    if (st.goal) add('MOST RECENT GOAL (before this request)', [s(st.goal.request, 600)].concat(st.goal.steps.length ? ['steps: ' + st.goal.steps.map((x, i) => (i + 1) + '. ' + x.title + (x.state ? ' [' + x.state + ']' : '')).join(' / ')] : []));
    const openNow = st.open.filter((x) => x.state === 'open');
    add('STILL OPEN (owed or asked, not yet resolved)', openNow.map((x) => '- (' + x.kind + ', turn ' + x.turnId + ') ' + x.text
      + (x.deliverable ? ' [plan ' + x.planId + ' v' + x.requestVersion + '/' + x.deliverable + ': ' + x.progress + (x.reason ? ' (' + x.reason + ')' : '') + '] ' + JSON.stringify(x.demand) : '')), 'open');
    /* decisions the live [WORKING CONTEXT] already prints are mirrored in the snapshot but not repeated here */
    const dec = Object.keys(st.decisions).map((k) => st.decisions[k]).filter((d) => d.by !== 'wctx');
    add('DECIDED (conditions fixed so far — still in force unless the reader changes them)', dec.map((d) => '- ' + d.key + ': ' + s(fmtVal(d.value), 300) + ' (turn ' + d.turnId + ', ' + d.by + ')'), 'decisions');
    const pins = Object.keys(st.pins).map((k) => st.pins[k]);
    add('SAVED FIGURES (value + where the original is; read it with read_result {call_id, path})', pins.map((p) => '- ' + p.label + ' = ' + s(fmtVal(p.value), 80) + (p.unit ? ' ' + p.unit : '') + (p.ref ? '  {' + p.ref + (p.path ? ' @' + p.path : '') + (p.verified ? ' ✓' : '') + '}' : '')), 'figures');
    const ev = Object.keys(st.evidence).map((k) => st.evidence[k]);
    add('SOURCES (what the figures came from)', ev.map((e) => '- ' + (e.publisher ? e.publisher + ' — ' : '') + s(e.title, 90) + (e.url ? ' <' + e.url + '>' : '') + (e.retrievedAt ? ' retrieved ' + e.retrievedAt : '') + (e.ref ? ' {' + e.ref + '}' : '')), 'sources');
    add('COMPLETED WORK (each result is kept whole — read_result {call_id:"<ref>"})', st.done.map((d) => '- turn ' + d.turnId + ' ' + d.name + ' ' + d.status + ' {' + d.ref + '} ' + s(d.args, 90) + (d.headline ? ' → ' + s(d.headline, 100) : '')), 'completed');
    add('EARLIER GOALS', st.goals.map((g) => '- turn ' + g.turnId + ' [' + g.outcome + '] ' + s(g.request, 140)), 'goals');
    if (!secs.length) return '';
    const head = '[ATLAS WORKING MEMORY] (kept as structure: it survives trimming of the conversation, and every figure below can be read back from the original — read_result {call_id:"<ref>"} for a result, + path for one value, call_id "' + MEMORY_REF + '" for everything)\n';
    /* the budget: every section gets a fair share first (so one long section never starves the rest), newest items win inside a
       section, and what does not fit is NAMED with the door that reads it */
    const room = Math.max(400, budget - head.length);
    const share = Math.floor(room / secs.length);
    const outParts = [];
    secs.forEach((sec, i) => {
      const cap = share + (i === secs.length - 1 ? room - share * secs.length : 0);
      let lines = [], size = sec.title.length + 3, dropped = 0;
      const headKeep = sec.title.indexOf('MOST RECENT GOAL') === 0;          /* the goal is the one section read from its beginning */
      const order = headKeep ? sec.lines : sec.lines.slice().reverse();
      for (const ln of order) {
        if (size + ln.length + 1 > cap && lines.length) { dropped++; continue; }
        lines.push(ln.length + size > cap ? ln.slice(0, Math.max(60, cap - size)) : ln); size += ln.length + 1;
      }
      if (!headKeep) lines.reverse();
      if (dropped) lines.unshift('(+' + dropped + ' older ' + sec.older + ' not shown here — call_id "' + MEMORY_REF + '" lists them)');
      outParts.push(sec.title + ':\n' + lines.join('\n'));
    });
    return head + outParts.join('\n') + '\n\n';
  }

  /* ── handoff: the whole record, as a file a person or a later session can read ───────────── */
  function handoffText() {
    const o2 = [];
    o2.push('# Atlas working memory — handoff');
    if (st.goal) o2.push('\n## Goal in hand (turn ' + st.goal.turnId + ')\n' + st.goal.request + (st.goal.steps.length ? '\n' + st.goal.steps.map((x, i) => (i + 1) + '. ' + x.title + ' [' + x.state + ']').join('\n') : ''));
    o2.push('\n## Open\n' + (st.open.filter((x) => x.state === 'open').map((x) => '- (' + x.kind + ', turn ' + x.turnId + ') ' + x.text).join('\n') || '- nothing'));
    o2.push('\n## Decided\n' + (Object.keys(st.decisions).map((k) => '- ' + k + ': ' + fmtVal(st.decisions[k].value) + ' (turn ' + st.decisions[k].turnId + ', ' + st.decisions[k].by + ')').join('\n') || '- nothing'));
    o2.push('\n## Saved figures\n' + (Object.keys(st.pins).map((k) => { const p = st.pins[k]; return '- ' + p.label + ' = ' + fmtVal(p.value) + (p.unit ? ' ' + p.unit : '') + (p.ref ? ' {' + p.ref + (p.path ? ' @' + p.path : '') + '}' : ''); }).join('\n') || '- nothing'));
    o2.push('\n## Sources\n' + (Object.keys(st.evidence).map((k) => { const e = st.evidence[k]; return '- ' + (e.publisher ? e.publisher + ' — ' : '') + e.title + (e.url ? ' <' + e.url + '>' : '') + (e.retrievedAt ? ' retrieved ' + e.retrievedAt : '') + (e.ref ? ' {' + e.ref + '}' : ''); }).join('\n') || '- nothing'));
    o2.push('\n## Completed work\n' + (st.done.map((d) => '- turn ' + d.turnId + ' ' + d.name + ' ' + d.status + ' {' + d.ref + '} args ' + d.args + (d.headline ? ' → ' + d.headline : '')).join('\n') || '- nothing'));
    o2.push('\n## Stored results (ref · tool · size · numbers)\n' + (Object.keys(st.results).map((k) => { const r = st.results[k]; return '- {' + r.ref + '} ' + r.name + ' ' + r.size + ' chars' + (r.evicted ? ' (body evicted)' : '') + ' · ' + r.shape + ' · ' + r.numbers.slice(0, 6).map((n) => n.path + '=' + n.value).join(', '); }).join('\n') || '- nothing'));
    o2.push('\n## Earlier goals\n' + (st.goals.map((g) => '- turn ' + g.turnId + ' [' + g.outcome + '] ' + g.request).join('\n') || '- none'));
    return o2.join('\n');
  }
  function snapshot(opts2) {
    const keepBodies = !(opts2 && opts2.bodies === false);
    const c = clone(st) || fresh();
    if (!keepBodies) Object.keys(c.results).forEach((k) => { c.results[k].text = ''; c.results[k].evicted = true; });
    return c;
  }
  function restore(snap) {
    if (!snap || typeof snap !== 'object' || snap.v !== VERSION) return false;
    const base = fresh();
    st = Object.assign(base, clone(snap) || {});
    return true;
  }
  /* the device copy: newest bodies first until the persisted budget is spent; older bodies are marked evicted (numbers kept) */
  function save() {
    if (!store) return false;
    try {
      const c = snapshot();
      const refs2 = Object.keys(c.results).sort((a, b) => c.results[b].turnId - c.results[a].turnId);
      let total = 0;
      refs2.forEach((k) => { const r = c.results[k]; if (!r.tables) return; if (total + r.tables.length > L.persistChars) delete r.tables; else total += r.tables.length; });
      refs2.forEach((k) => { const r = c.results[k]; if (!r.text) return; if (total + r.text.length > L.persistChars) { r.text = ''; r.evicted = true; } else total += r.text.length; });
      store.setItem(key, JSON.stringify(c)); return true;
    } catch (_) { return false; }
  }
  function load() {
    if (!store) return false;
    try { const raw = store.getItem(key); return raw ? restore(JSON.parse(raw)) : false; } catch (_) { return false; }
  }
  function stats() {
    return { results: Object.keys(st.results).length, bodyChars: bodyChars(), done: st.done.length, pins: Object.keys(st.pins).length, open: st.open.filter((x) => x.state === 'open').length,
      evidence: Object.keys(st.evidence).length, decisions: Object.keys(st.decisions).length, goals: st.goals.length };
  }
  return { beginTurn, setSteps, decide, noteResult, pin, addEvidence, open, resolve, recordTurn, dropFrom, clear,
    has, refs, recall, block, handoffText, snapshot, restore, save, load, stats, closeGoal,
    carriesOutside, state: () => st };
}
