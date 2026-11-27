/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — REPLAY A RECORDED TURN WITHOUT A MODEL  (node; no browser, no network)
 * ----------------------------------------------------------------------------
 *  The nightly evaluation (scripts/atlas-eval.mjs) needs the production site, a session and real model
 *  calls, so it can only ever run at night and only once its secrets exist — and on 2026-09-30 it had
 *  never run once. Everything BETWEEN the model and the map, though, is IntMap's own deterministic code:
 *  the tool surface that turns a call into an action (js/atlas-toolsurface.js), the schemas that reject a
 *  malformed one (js/atlas-schemas.js), the registry and its search (js/atlas-capabilities.js), the loop
 *  that runs calls together, answers a repeat from its ledger, cuts a turn short and forces the answer
 *  (js/atlas-agent.js), and the result statuses the observers report through (js/atlas-results.js).
 *  A change to any of them can turn a turn that answered into one that does not, and no PR could see it.
 *
 *  A CASSETTE (scripts/atlas-eval/cassettes/*.json) is one turn as it happened, both sides of it:
 *    · `model`  — what the model said at each step, in the shape js/atlas-agent.js readReply hands the
 *                 loop ({text, toolCalls, turnState, answerMode}). This is the SCRIPT: replayed in order,
 *                 whatever the code under test does.
 *    · `world`  — what the browser said back: every action the dispatch ran and what it returned
 *                 ({ok, html, meta} — the executor's shape, observers' verdicts included), the
 *                 find_capability answers that came from the meaning search (a network call, so it is
 *                 replayed rather than recomputed), and the final map.
 *    · `golden` — what the turn produced: the calls in order with their status, the stop, the reply.
 *
 *  The replay drives the REAL runTurn over the REAL surface, registry, schemas and catalogue with the
 *  script as the model and the world as the dispatch. Everything node can compute is recomputed; only
 *  what came from outside the process is replayed. It then reports two different things:
 *
 *    divergences — the code under test no longer does what it did when the cassette was recorded: it
 *                  turned a call into a different action (nothing in the world answers it), rejected a
 *                  call that ran, ran one it rejected, ended the turn at a different stop, or wrote a
 *                  different answer. Whether that is a regression or an intended change is the author's
 *                  call; the replay's job is that it cannot happen unseen. Re-record or edit the
 *                  cassette's `golden` in the same PR when it is intended.
 *    judgement   — the same scripts/atlas-eval/judge.mjs verdict the nightly gives a live turn, and when
 *                  the question has a verified answer, the scripts/atlas-eval/grade.mjs grade of the
 *                  reply. A cassette of a recorded DEFECT declares the failures the judge must find
 *                  (`expect.failures`) — that is how the judge itself is held to catching them.
 *
 *  ⚠⚠ (atlas-capability-single-source) A CASSETTE HOLDS WHAT CAME FROM OUTSIDE, NOT WHAT THE CODE WILL SAY AGAIN.
 *    A find_capability answer used to be recorded whole — each match's summary and schema and the catalogue
 *    documentation of all of them, 200 kB in one cassette — so every PR that touched one capability's
 *    description made the scripted cassettes stale and had to re-record them. None of that text came from
 *    outside: it is the declarations, which the replay has. A find answer is now recorded as its RANKING
 *    (compactFind: the ids in order, the callable names and the basis) and:
 *      · a lexical answer is recomputed, and the ranking compared — as before;
 *      · a meaning-search answer (a network call) is REPLAYED as its recorded ranking, DESCRIBED by the current
 *        declarations (js/atlas-toolsurface.js describe) — so the loop sees what the model would be shown today
 *        for the answer the world gave then. Each match carries `v`, the version of what the model was shown
 *        about it (declVersion), and a match whose declaration has changed since is REPORTED in `notes` — not a
 *        divergence: what the turn did is unchanged, what it would be told is newer.
 *    An older cassette that holds the whole answer replays the same way (the extra text is ignored).
 *
 *  ⚠ WHAT A REPLAY CANNOT SEE. The dispatch is replayed, so an observer's verdict inside it (the camera
 *    verifier, the not_rendered check) is the RECORDED verdict: the replay tests what the loop and the
 *    surface do with it, not whether the observer is right — that is tests/atlas-turn-engine-checks and
 *    the observers' own checks. And a find_capability answer that used the meaning search is replayed
 *    as recorded, so a change to the embedding side is not seen here.
 * ==========================================================================*/

import { AsyncLocalStorage } from 'node:async_hooks';

const str = (v) => (v == null ? '' : String(v));

/** canon(v) — a stable text of a value: keys sorted, `__` keys (the console's per-turn stamps, never
 *  part of what was asked) dropped. Two actions are the same action when their canon is equal. */
export function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter((k) => !k.startsWith('__') && v[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

function resultObj(r) {
  if (r && typeof r === 'object') return r;
  try { return JSON.parse(str(r)); } catch (_) { return null; }
}
/** the status a tool result reports, in the words the judge reads */
function statusOf(r) {
  const o = resultObj(r) || {};
  return str(o.status) || (o.ok === false ? 'failed' : (o.ok === true ? 'completed' : ''));
}
function codeOf(r) { const o = resultObj(r) || {}; return str(o.code || o.error); }

/* FNV-1a, 32 bits, hex — a version label, not a security property */
function fnv(t) { let h = 0x811c9dc5; const s = str(t); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }

/** declVersion(surface, id) — the version of what the model is shown about one capability: what find_capability
 *  says of it alone (callable name, summary, schema, confirmation and its documentation), hashed. It changes when
 *  the capability's declaration changes in any way the model can read, and only then. */
export function declVersion(surface, id) {
  try { const d = surface.describe('', [id], 'lexical'); return fnv(JSON.stringify([d.matches, d.documentation || ''])); } catch (_) { return ''; }
}

/** compactFind(result, surface?) — a find_capability answer as a cassette records it: the ranking and what came
 *  with it, without the prose the declarations will produce again. A meaning-search answer's matches carry `v`
 *  (declVersion) when a surface is given, so its replay can say which descriptions have changed since. */
export function compactFind(result, surface) {
  const r = result && typeof result === 'object' ? result : {};
  const sem = r.basis === 'lexical+semantic';
  const out = { ok: r.ok, query: r.query, basis: r.basis,
    matches: (r.matches || []).map((m) => {
      const o = { id: m.id, tool: m.tool };
      if (m.needsConfirmation) o.needsConfirmation = m.needsConfirmation;
      if (sem && surface) o.v = declVersion(surface, m.id);
      return o;
    }) };
  if (r.semantic !== undefined) out.semantic = r.semantic;
  return out;
}

/**
 * productModules(importer) — the modules a replay drives, imported the way the harness imports them.
 * `importer(path)` resolves a repository path (so the caller decides relative-to-what).
 */
export async function productModules(importer) {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const [ag, ts, ca, sc, tr, ct] = await Promise.all([
    importer('js/atlas-agent.js'), importer('js/atlas-toolsurface.js'), importer('js/atlas-capabilities.js'),
    importer('js/atlas-schemas.js'), importer('js/atlas-turn-results.js'), importer('js/atlas-catalog-text.js'),
  ]);
  return {
    makeAtlasAgent: ag.makeAtlasAgent, makeAtlasToolSurface: ts.makeAtlasToolSurface,
    makeAtlasCapabilities: ca.makeAtlasCapabilities, makeAtlasSchemas: sc.makeAtlasSchemas,
    makeAtlasTurnResults: tr.makeAtlasTurnResults, makeAtlasCatalogText: ct.makeAtlasCatalogText,
  };
}

/**
 * replayCassette(cas, P) → { obs, divergences, calls, stopped, text }
 *   cas  a cassette (above)
 *   P    productModules(...)
 * `obs` is in the shape scripts/atlas-eval.mjs observeTurn hands judgeTurn, so a replayed turn is
 * judged by exactly the rules a live one is.
 *
 * (atlas-completion-verdict) A CONVERSATION. A cassette of a question with `earlier` turns carries one side per earlier
 * turn (`cas.earlier[i]` = { text, model, world, golden }), replayed first and in order, each with the conversation so
 * far as its messages. The last earlier turn's map is the final turn's `obs.before` — what a `restyle` criterion is
 * graded against — and every earlier turn's own record is `obs.earlier`. A divergence in an earlier turn is reported
 * under its index; the map it would have left is then not this run's, so `before` is withheld (unobserved).
 */
export async function replayCassette(cas, P) {
  const history = [], earlier = [], divergences = [];
  let dispatched = 0;
  for (const [i, e] of (Array.isArray(cas.earlier) ? cas.earlier : []).entries()) {
    const r = await replayOne(e, P, history);
    for (const d of r.divergences) divergences.push({ kind: d.kind, detail: 'earlier[' + i + ']: ' + d.detail });
    earlier.push(r.obs);
    dispatched += r.dispatched;
    history.push({ role: 'user', content: str(e.text) }, { role: 'assistant', content: str(r.text) });
  }
  const r = await replayOne(cas, P, history);
  if (!earlier.length) return r;
  const last = earlier[earlier.length - 1];
  r.obs.earlier = earlier;
  r.obs.before = divergences.length ? null : last.snapshot;
  r.divergences = divergences.concat(r.divergences);
  r.dispatched += dispatched;
  return r;
}

/** replayOne(turn, P, history) — one turn of a cassette (the whole of a single-turn one) after `history` (the conversation so far) */
export async function replayOne(cas, P, history = []) {
  const divergences = [];
  const diverge = (kind, detail) => divergences.push({ kind, detail });
  const world = cas.world || {};

  /* the registry as the browser binds it: the catalogue (the lexical search reads its blocks), the
     schemas, and — instead of the atlas-embed network call — the recorded answer or none */
  const CAPS = P.makeAtlasCapabilities({});
  const SCHEMAS = P.makeAtlasSchemas();
  CAPS.bindRuntime({ docs: P.makeAtlasCatalogText({}, {}), schemas: SCHEMAS,
    semantic: async () => ({ state: 'replay', reason: 'the meaning search is a network call; a replay does not make it' }) });

  /* the dispatch: each recorded action answers the FIRST action of equal canon not yet used. Calls of
     one reply may run together (js/atlas-agent.js footprints), so order is not the key — identity is. */
  const pool = (world.dispatch || []).map((d) => ({ key: canon(d.action), out: d.out, ms: Number.isFinite(+d.ms) && d.ms !== null ? +d.ms : null, used: false }));
  const dispatched = [];
  /* (atlas-delegation-eval) a dispatch entry may carry `ms` — how long the world took to answer it, the way the
     live harness's tap times a call. Calls of one reply run together, so the reading is handed back to the call
     that made the action through its own async context, not through a variable the calls would share. */
  const timing = new AsyncLocalStorage();
  const runAction = async (action) => {
    const key = canon(action);
    const hit = pool.find((p) => !p.used && p.key === key);
    dispatched.push(action);
    const slot = timing.getStore();
    if (hit && slot && hit.ms != null) slot.ms = hit.ms;
    if (!hit) {
      diverge('unrecorded_action', 'the surface built an action the world never answered: ' + key.slice(0, 400));
      return { ok: false, html: '', meta: { status: 'failed', code: 'replay_divergence' } };
    }
    hit.used = true;
    return hit.out;
  };
  const surface = P.makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction });
  const AGENT = P.makeAtlasAgent();
  const tools = surface.baseTools();
  const execBase = surface.makeExecute(tools, AGENT);

  /* the meaning-search answers are the world's; a lexical one is recomputed (that is the code under test) */
  const findRec = new Map((world.find || []).map((f) => [str(f.query), f.result]));
  const calls = [], notes = [];
  const execute = async (call, turn) => {
    const rec = { name: str(call && call.name), args: JSON.parse(JSON.stringify((call && call.arguments) || {})) };
    calls.push(rec);
    let r;
    const recorded = rec.name === 'find_capability' ? findRec.get(str(rec.args.query)) : undefined;
    if (recorded && recorded.basis === 'lexical+semantic') {
      /* the world's ranking, described by the declarations as they are now (see the header) */
      const ids = (recorded.matches || []).map((mm) => mm && mm.id).filter(Boolean);
      r = surface.describe(recorded.query != null ? recorded.query : rec.args.query, ids, recorded.basis, recorded.semantic);
      rec.replayed = true;
      for (const mm of recorded.matches || []) {
        if (mm && mm.v && mm.v !== declVersion(surface, mm.id)) notes.push({ kind: 'declaration_changed', detail: mm.id + ' — the model would now be told something different about it than when «' + str(rec.args.query) + '» was recorded' });
      }
    }
    else {
      const slot = {};
      r = await timing.run(slot, () => execBase(call, turn));
      if (slot.ms != null) rec.ms = slot.ms;
      /* a lexical answer is recomputed — and if the registry now ranks differently than when the turn was
         recorded, that is said even when the next step happens to survive it (#R802: eight
         find_capability calls, each answered with the wrong eight ids, was a RANKING defect) */
      if (recorded) {
        const ids = (x) => ((x && x.matches) || []).map((mm) => mm && mm.id).join(', ');
        if (ids(r) !== ids(recorded)) diverge('find_ranking', 'find_capability «' + str(rec.args.query) + '» now answers [' + ids(r) + ']; recorded [' + ids(recorded) + ']');
      }
    }
    rec.resultText = JSON.stringify(r);
    return r;
  };

  /* the script: one recorded reply per model call, in order */
  const script = Array.isArray(cas.model) ? cas.model : [];
  let k = 0;
  const steps = [];
  const model = async (req) => {
    const r = script[k];
    k++;
    if (!r) { diverge('model_exhausted', 'the loop asked the model a ' + k + 'th time; the script has ' + script.length + ' replies'); return { text: '', toolCalls: [] }; }
    if (!!r.final !== !!(req && req.final)) diverge('step_kind', 'model call ' + k + ' was ' + (req && req.final ? 'the forced final answer' : 'a working step') + '; the recorded one was ' + (r.final ? 'the forced final answer' : 'a working step'));
    return {
      text: str(r.text), turnState: r.turnState || '', answerMode: r.answerMode || '', webUsed: !!r.webUsed,
      toolCalls: (r.toolCalls || []).map((c, i) => ({ id: c.id || ('r' + k + '-' + i), name: c.name, arguments: c.arguments || {} })),
    };
  };

  const out = await AGENT.runTurn({
    model, tools, execute, footprint: (c) => surface.footprintOf(c, tools), promote: surface.promotionsOf,
    system: 'replay', messages: history.concat([{ role: 'user', content: str(cas.text) }]), limits: cas.limits || undefined,
    onStep: (s) => steps.push({ step: s.step, calls: s.calls || [] }),
  });

  if (k < script.length) diverge('model_unused', (script.length - k) + ' recorded model repl(ies) were never asked for — the turn ended earlier than it did');
  for (const p of pool) if (!p.used) diverge('recorded_action_not_made', 'the world answered an action this replay never made: ' + p.key.slice(0, 400));

  /* the operations, as the page's turn record lists them: a call that reached the dispatch */
  const operations = calls.filter((c) => { const o = resultObj(c.resultText); return o && o.capability; })
    .map((c) => { const o = resultObj(c.resultText); return { capabilityId: o.capability, args: c.args, status: statusOf(o), code: codeOf(o) || undefined }; });

  /* against the golden record */
  const g = cas.golden || {};
  if (g.stopped != null && g.stopped !== out.stopped) diverge('stopped', 'the turn stopped `' + out.stopped + '`; recorded `' + g.stopped + '`');
  if (Array.isArray(g.calls)) {
    const now = calls.map((c) => ({ name: c.name === 'run_capability' ? 'run_capability:' + str(c.args.id) : c.name, status: statusOf(c.resultText), code: codeOf(c.resultText) }));
    const was = g.calls.map((c) => ({ name: c.name, status: str(c.status), code: str(c.code) }));
    const n = Math.max(now.length, was.length);
    for (let i = 0; i < n; i++) {
      const a = now[i], b = was[i];
      if (!a || !b || a.name !== b.name || a.status !== b.status || (b.code && a.code !== b.code)) {
        diverge('calls', 'call ' + (i + 1) + ' is ' + (a ? a.name + ' → ' + (a.status || '?') + (a.code ? '/' + a.code : '') : '(not made)')
          + '; recorded ' + (b ? b.name + ' → ' + (b.status || '?') + (b.code ? '/' + b.code : '') : '(not made)'));
        break;   /* everything after the first difference differs because of it */
      }
    }
  }
  if (g.text != null && str(g.text) !== str(out.text)) diverge('reply', 'the reply is «' + str(out.text).slice(0, 160) + '»; recorded «' + str(g.text).slice(0, 160) + '»');

  const obs = {
    measured: true, replayed: true,
    ms: Number.isFinite(+cas.recordedMs) ? +cas.recordedMs : null,
    stopped: str(out.stopped), reply: str(out.text), operations, calls, steps,
    completion: out.completion || null, unmet: Array.isArray(out.unmet) ? out.unmet : null,   /* (atlas-completion-verdict) the turn's own declaration, as a live turn's record carries it */
    snapshot: divergences.length ? {} : (world.snapshot || {}),   /* the recorded map is only the map of THIS run while nothing diverged */
  };
  return { obs, divergences, notes, calls, stopped: out.stopped, text: out.text, reused: (out.trace && out.trace.reused) || 0, dispatched: dispatched.length };
}

/**
 * goldenOf(result) — the `golden` block a replay would write for itself: what a cassette records when
 * it is made, and what `--update` writes when a divergence is the intended change.
 */
export function goldenOf(result) {
  return {
    stopped: result.stopped,
    calls: result.calls.map((c) => ({ name: c.name === 'run_capability' ? 'run_capability:' + str(c.args.id) : c.name, status: statusOf(c.resultText), code: codeOf(c.resultText) || undefined })),
    text: str(result.text),
  };
}

/** validateCassette(cas) → [problem…] — the shape the replay relies on. */
export function validateCassette(cas) {
  const bad = [];
  const id = (cas && cas.id) || '(no id)';
  if (!cas || !cas.id) bad.push('a cassette needs an id');
  if (!str(cas && cas.text).trim()) bad.push(id + ': no question text');
  if (!cas || (cas.lang !== 'en' && cas.lang !== 'jp')) bad.push(id + ': lang must be en or jp');
  if (!cas || !cas.origin || !str(cas.origin.kind) || !str(cas.origin.from)) bad.push(id + ': origin {kind, from} — where this turn came from');
  if (cas && cas.origin && cas.origin.kind !== 'recorded' && cas.origin.kind !== 'scripted') bad.push(id + ': origin.kind is recorded or scripted');
  if (!Array.isArray(cas && cas.model) || !cas.model.length) bad.push(id + ': no model script');
  for (const [i, r] of ((cas && cas.model) || []).entries()) {
    for (const c of (r && r.toolCalls) || []) if (!c.name) bad.push(id + ': model reply ' + (i + 1) + ' has a call with no name');
  }
  if (!cas || !cas.golden || cas.golden.stopped == null) bad.push(id + ': golden.stopped — what the turn ended on');
  if (!cas || !cas.expect || (cas.expect.verdict !== 'pass' && cas.expect.verdict !== 'fail')) bad.push(id + ': expect.verdict is pass or fail');
  if (cas && cas.expect && cas.expect.verdict === 'fail' && !(Array.isArray(cas.expect.failures) && cas.expect.failures.length)) bad.push(id + ': a defect cassette names the failure kinds the judge must find');
  if (cas && cas.arm != null && cas.arm !== 'delegate' && cas.arm !== 'direct') bad.push(id + ': arm is delegate or direct (the two sides of scripts/atlas-delegation-bench.mjs)');
  if (cas && cas.question && !(cas.question.set === 'answers' || cas.question.set === 'records')) bad.push(id + ': question.set is answers or records');
  /* (atlas-completion-verdict) the earlier turns of a conversation: each a side of its own */
  if (cas && cas.earlier != null) {
    if (!Array.isArray(cas.earlier) || !cas.earlier.length) bad.push(id + ': earlier is a non-empty list of { text, model, world, golden }');
    for (const [i, e] of (Array.isArray(cas.earlier) ? cas.earlier : []).entries()) {
      if (!str(e && e.text).trim()) bad.push(id + ': earlier[' + i + '] has no question text');
      if (!Array.isArray(e && e.model) || !e.model.length) bad.push(id + ': earlier[' + i + '] has no model script');
      if (!e || !e.golden || e.golden.stopped == null) bad.push(id + ': earlier[' + i + '].golden.stopped — what that turn ended on');
    }
  }
  /* (atlas-eval-map-state) the map axis's verdict, when the cassette declares one */
  if (cas && cas.expect && cas.expect.map != null && ['match', 'mismatch', 'unobserved'].indexOf(cas.expect.map) < 0) bad.push(id + ': expect.map is match, mismatch or unobserved');
  return bad;
}

/* A find_capability answer carries how long the meaning search took (`semantic.ms`) — a clock reading,
   not part of the answer. A scripted cassette is rebuilt and compared byte for byte, so it is dropped. */
function stable(r) {
  if (r && r.semantic && typeof r.semantic === 'object') { const s = Object.assign({}, r.semantic); delete s.ms; return Object.assign({}, r, { semantic: s }); }
  return r;
}

/**
 * recordScripted(scn, P) → cassette — a SCRIPTED cassette: the model's replies are written by hand
 * (a scenario reconstructed from a recorded round, or a representative turn), and the world answers
 * each action through `scn.respond(action)`. The turn is run once through the real loop and surface,
 * and what it did becomes the world and the golden record. Used by scripts/atlas-eval/scripted-cassettes.mjs;
 * a cassette recorded in production comes from scripts/atlas-eval.mjs --record instead.
 */
export async function recordScripted(scn, P) {
  /* (atlas-completion-verdict) the earlier turns of a conversation are recorded first, each through its own respond(), and the
     final turn runs after them with the conversation as its messages — the same order replayCassette replays them in */
  const history = [], earlier = [];
  for (const [i, e] of (Array.isArray(scn.earlier) ? scn.earlier : []).entries()) {
    const side = await recordSide(Object.assign({ id: scn.id + ' earlier[' + i + ']', lang: scn.lang, limits: scn.limits }, e), P, history);
    earlier.push({ text: e.text, model: e.model, world: side.world, golden: side.golden });
    history.push({ role: 'user', content: str(e.text) }, { role: 'assistant', content: str(side.text) });
  }
  const side = await recordSide(scn, P, history);
  return {
    id: scn.id, text: scn.text, lang: scn.lang, origin: scn.origin, question: scn.question || undefined, arm: scn.arm || undefined,
    limits: scn.limits || undefined, recordedMs: scn.recordedMs, earlier: earlier.length ? earlier : undefined, model: scn.model, world: side.world,
    golden: side.golden, expect: scn.expect,
  };
}

/** recordSide(scn, P, history) → { world, golden, text } — one scripted turn run once through the real loop */
async function recordSide(scn, P, history) {
  const world = { dispatch: [], find: [], snapshot: scn.snapshot || {} };
  const probe = { id: scn.id, text: scn.text, lang: scn.lang, model: scn.model, limits: scn.limits, world: { dispatch: [] }, golden: {} };
  /* run once with a world that answers through respond(), recording what it was asked */
  let surface = null;
  const P2 = Object.assign({}, P, {
    makeAtlasToolSurface: (deps) => surface = P.makeAtlasToolSurface(Object.assign({}, deps, {
      runAction: async (action) => {
        const out = await scn.respond(action);
        const ms = scn.msOf ? scn.msOf(action) : undefined;
        world.dispatch.push(Object.assign({ action: JSON.parse(JSON.stringify(action, (k, v) => (k.startsWith('__') ? undefined : v))), out }, ms != null ? { ms } : {}));
        return out;
      },
    })),
  });
  const r = await replayOne(probe, P2, history);
  /* a script that does not fit its own turn (too few replies, a final where a step was) is a broken
     scenario, not a recording — refuse it rather than freeze the mismatch into the golden record */
  if (r.divergences.length) throw new Error(scn.id + ': the script does not fit the turn — ' + r.divergences.map((d) => d.kind + ': ' + d.detail).join(' | '));
  for (const c of r.calls) if (c.name === 'find_capability') { try { world.find.push({ query: String(c.args.query || ''), result: compactFind(stable(JSON.parse(c.resultText)), surface) }); } catch (_) { } }
  return { world, golden: goldenOf(r), text: r.text };
}
