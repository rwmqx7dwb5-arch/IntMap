/* ============================================================================
 *  atlas-turn-engine — the turn loop's four structural changes, EVALUATED (node --test)
 * ----------------------------------------------------------------------------
 *  Every check below drives js/atlas-agent.js runTurn — the function the browser runs — over the real
 *  registry (js/atlas-capabilities.js), the real schemas and the real tool surface, with a scripted
 *  model: a list of replies, one per step, so the turn is deterministic and nothing is asked of a
 *  provider. Measured before this round (dev-notes/2026-09-30-atlas-turn-engine.md):
 *    · 「確認できなかった」 was `partial` + `not_rendering`, and a partial call may be made again —
 *      so a call that had done its job on a page that was not compositing was re-run;
 *    · the calls of one reply ran one after another (`await runTool(call)` in a for loop);
 *    · 133 of 146 capabilities were two decisions away (find_capability → run_capability) and the
 *      eval's rail-tokyo-osaka spent find_capability EIGHT times and zero operations;
 *    · set_layer's live layer names were written into the tool declaration, so the tools — and
 *      ai-proxy's prompt-cache key, a hash of them — moved with the page.
 *  ①–⑤ are those four, plus ⑥: the budget sentence that said 「= 6」 while the server said 12.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { importModule, swappable } from './helpers/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
/* (module-graph) js/atlas-capabilities.js IMPORTS the engine — it no longer reads window.IntMapGeoEngine —
   so a case that needs a renderer seats its stub at that import edge; between cases the seat is empty. */
const engineSeat = swappable();
const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engineSeat.value } } });
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasResults } = await import('../js/atlas-results.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* One turn over the real surface. `act(action)` answers the dispatch (the executor's legacy shape);
   every action that reached it is recorded with the time it started and ended. */
async function turn(script, act, extra = {}) {
  const ran = [];
  const surface = makeAtlasToolSurface({
    capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => {
      const rec = { type: action.type, action, t0: performance.now(), t1: 0 };
      ran.push(rec);
      const out = await act(action);
      rec.t1 = performance.now();
      return out;
    },
  });
  const tools = surface.baseTools();
  const seen = [];
  let i = 0;
  const model = async (req) => {
    seen.push({ step: req.step, final: !!req.final, tools: req.tools.map((t) => ({ name: t.name, promoted: !!t.promoted })) });
    const r = script[Math.min(i, script.length - 1)];
    i++;
    return typeof r === 'function' ? r(req) : r;
  };
  const out = await AGENT.runTurn(Object.assign({
    model, tools, execute: surface.makeExecute(tools, AGENT),
    footprint: (c) => surface.footprintOf(c, tools), promote: surface.promotionsOf,
    system: 'sys', messages: [{ role: 'user', content: 'q' }],
  }, extra));
  return { out, ran, seen, surface, tools };
}
const calls = (...cs) => ({ text: '', turnState: 'continuing', toolCalls: cs.map((c, k) => ({ id: c.id || ('c' + k), name: c.name, arguments: c.args || {} })) });
const answer = (t) => ({ text: t, toolCalls: [] });
const ok = (html = '<div>done</div>') => ({ ok: true, html, meta: { status: 'completed', produced: ['map'] } });
const overlap = (a, b) => a.t0 < b.t1 && b.t0 < a.t1;

/* ── ① UNOBSERVED IS A STATUS, AND ITS REPEAT IS NOT RUN ─────────────────────────────────────── */

test('atlas-turn-engine ① `unobserved` is one of the statuses, and it is not a completion', () => {
  const R = makeAtlasResults({});
  assert.ok(R.STATUSES.includes('unobserved'));
  assert.ok(R.isTerminal('unobserved'), 'it ran and ended; nothing is still running');
  const r = R.unobserved({ capabilityId: 'view.flyTo', code: 'not_rendering' });
  assert.equal(r.status, 'unobserved');
  assert.equal(r.ok, false, 'an effect nobody observed is not claimed');
  const leg = R.toLegacy(r);
  assert.equal(leg.meta.status, 'unobserved', 'the status reaches the tool surface through the legacy bridge');
});

test('atlas-turn-engine ① the shipped camera verifier answers `unobserved` on a page that is not compositing', async () => {
  const fly = CAPS.resolve('view.flyTo');
  const CAM = { lng: -21.9, lat: 64.1, zoom: 5, bearing: 0, pitch: 0 };
  const stub = (mode) => ({
    hasRenderer: () => true,
    layers: { sourceData: () => ({ type: 'FeatureCollection', features: [] }) },
    scene: { getStyle: () => ({ layers: [] }) },
    camera: { getCenter: () => ({ lng: CAM.lng, lat: CAM.lat }), getZoom: () => CAM.zoom, getBearing: () => 0, getPitch: () => 0, getBounds: () => null },
    render: { triggerRepaint() {}, canvas: () => null, onNextFrame(ms, fn) { fn(mode === 'live'); }, ticking() { return Promise.resolve(mode === 'live'); } },
  });
  const had = engineSeat.get();
  try {
    engineSeat.set(stub('asleep'));
    await fly.observe();
    const asleep = fly.verify({}, { place: 'Iceland' }, CAM, CAM, { ok: true }, 'view.flyTo');
    assert.equal(asleep.status, 'unobserved');
    assert.equal(asleep.code, 'not_rendering', 'the code still says why');
    engineSeat.set(stub('live'));
    await fly.observe();
    const live = fly.verify({}, { place: 'Iceland' }, CAM, CAM, { ok: true }, 'view.flyTo');
    assert.equal(live.status, 'partial', 'a drawing page that did not move keeps its verdict — only 「could not see」 moved');
    assert.equal(live.code, 'no_change');
  } finally { engineSeat.set(had); }
});

test('atlas-turn-engine ① the second identical call after an UNOBSERVED result is answered, not run again', async () => {
  const { out, ran } = await turn([
    calls({ name: 'map_view', args: { place: 'Iceland' } }),
    calls({ name: 'map_view', args: { place: 'Iceland' } }),
    answer('Iceland is in the view.'),
  ], async () => ({ ok: false, html: '<div>flew</div>', meta: { status: 'unobserved', code: 'not_rendering', produced: [] } }));
  assert.equal(ran.length, 1, 'the dispatch ran ONCE — the repeat was answered from the first run');
  const first = out.results[0];
  assert.equal(first.status, 'unobserved');
  assert.equal(first.error, undefined, 'an unobserved call is not labelled a failure');
  assert.match(first.note, /RAN/, 'the model is told in the result itself that the call ran');
  assert.match(first.note, /not a failure/);
  assert.equal(out.results.length, 1, 'the reused answer does not join the reply a second time');
  assert.equal(out.trace.reused, 1);
  assert.equal(out.text, 'Iceland is in the view.');
});

test('atlas-turn-engine ① the reused answer says why it was not run again', async () => {
  let second = null;
  await turn([
    calls({ name: 'map_view', args: { place: 'Iceland' } }),
    calls({ name: 'map_view', args: { place: 'Iceland' } }),
    (req) => { second = req.messages[req.messages.length - 1].content[0]; return answer('ok'); },
  ], async () => ({ ok: false, html: '', meta: { status: 'unobserved', code: 'not_rendering', produced: [] } }));
  assert.equal(second.reusedFromEarlierCallThisTurn, true);
  assert.match(second.note, /ALREADY made this exact call, and it RAN/);
  assert.match(second.note, /not run a second time/);
});

test('atlas-turn-engine ① a PARTIAL is still made again — it owes something (#R551 unchanged)', async () => {
  const { ran } = await turn([
    calls({ name: 'highlight', args: { countries: ['France'] } }),
    calls({ name: 'highlight', args: { countries: ['France'] } }),
    answer('ok'),
  ], async () => ({ ok: true, html: '', meta: { status: 'partial', code: 'partially_resolved', produced: ['map'] } }));
  assert.equal(ran.length, 2, 'only the unobserved status is remembered as done; a partial may be retried');
});

/* ── ② THE CALLS OF ONE REPLY RUN TOGETHER UNLESS THEIR KEYS OVERLAP ─────────────────────────── */

test('atlas-turn-engine ② two calls whose conflict keys do not overlap run at the same time', async () => {
  const { out, ran } = await turn([
    calls({ name: 'highlight', args: { countries: ['France'] } },
      { name: 'run_capability', args: { id: 'map.drawLine', args: { places: ['Paris', 'Berlin'] } } }),
    answer('done'),
  ], async (a) => { await sleep(a.type === 'highlight' ? 120 : 60); return ok(); });
  assert.equal(ran.length, 2);
  assert.ok(overlap(ran[0], ran[1]), 'map.highlight and map.line share no key — the second started before the first ended');
  /* the order the MODEL reads is the order it called in, although the second finished first */
  assert.deepEqual(out.results.map((r) => r.name), ['highlight', 'run_capability']);
  assert.ok(ran[1].t1 < ran[0].t1, 'the precondition of the ordering check: the second call really did finish first');
  const t = out.trace.stepTiming[0];
  assert.equal(t.concurrent, 2);
  assert.ok(t.wallMs < t.serialMs, 'the step waited less than the calls took one after another');
});

test('atlas-turn-engine ② two reads run together too (research × 2)', async () => {
  const { ran } = await turn([
    calls({ name: 'research', args: { question: 'a' } }, { name: 'research', args: { question: 'b' } }),
    answer('done'),
  ], async () => { await sleep(60); return ok(); });
  assert.equal(ran.length, 2);
  assert.ok(overlap(ran[0], ran[1]));
});

test('atlas-turn-engine ② calls whose keys overlap run one after another, in the order made', async () => {
  const { ran } = await turn([
    calls({ name: 'highlight', args: { countries: ['France'] } },
      { name: 'run_capability', args: { id: 'map.clearHighlights', args: {} } }),
    answer('done'),
  ], async () => { await sleep(40); return ok(); });
  assert.equal(ran.length, 2);
  assert.ok(!overlap(ran[0], ran[1]), 'both write map.highlight');
  assert.equal(ran[0].type, 'highlight', 'the earlier call ran first');
});

test('atlas-turn-engine ② a whole-section write (time, camera) orders everything around it', async () => {
  const { ran } = await turn([
    calls({ name: 'set_time', args: { year: 1914 } }, { name: 'highlight', args: { countries: ['Serbia'] } }),
    answer('done'),
  ], async () => { await sleep(40); return ok(); });
  assert.equal(ran.length, 2);
  assert.ok(!overlap(ran[0], ran[1]), 'a highlight is read at the instant the clock is set to — it waits for the clock');
  assert.ok(ran[0].t1 <= ran[1].t0);
});

test('atlas-turn-engine ② a read after a write waits for it (look_at_map sees what was just drawn)', async () => {
  const { ran } = await turn([
    calls({ name: 'highlight', args: { countries: ['France'] } }, { name: 'look_at_map', args: {} }),
    answer('done'),
  ], async () => { await sleep(40); return ok(); });
  assert.equal(ran.length, 2);
  assert.ok(ran[0].t1 <= ran[1].t0);
});

test('atlas-turn-engine ② a question to the reader still ends the turn for every call after it', async () => {
  const { out, ran } = await turn([
    calls({ name: 'ask_user', args: { question: 'Which one?', options: ['A', 'B'] } }, { name: 'find_capability', args: { query: 'routing.route' } }),
    answer('never reached'),
  ], async () => ({ ok: true, html: '<div>?</div>', meta: { status: 'completed', produced: [] } }));
  assert.equal(ran.length, 1);
  assert.equal(out.stopped, 'awaiting_user');
  assert.equal(out.calls, 1, 'the call answered 「turn ended」 did not spend the budget, as before');
});

test('atlas-turn-engine ② without a footprint the loop keeps the old one-after-another order', async () => {
  const { ran } = await turn([
    calls({ name: 'research', args: { question: 'a' } }, { name: 'research', args: { question: 'b' } }),
    answer('done'),
  ], async () => { await sleep(30); return ok(); }, { footprint: undefined });
  assert.ok(!overlap(ran[0], ran[1]), 'a caller that states no footprints gets every call ordered');
});

test('atlas-turn-engine ② the overlap rule reads key segments, not spellings of one key', () => {
  assert.equal(AGENT.keysOverlap(['camera'], ['camera.follow']), true);
  assert.equal(AGENT.keysOverlap(['map.highlight'], ['map.highlightX']), false, 'a prefix of the characters is not a part of the key');
  assert.equal(AGENT.keysOverlap(['map.line'], ['map.highlight']), false);
  /* every key the registry writes is either a barrier or a dotted key the rule can read */
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS });
  const tools = surface.baseTools();
  for (const c of CAPS.all()) {
    const f = surface.footprintOf({ name: 'run_capability', arguments: { id: c.id } }, tools);
    if (f.barrier) continue;
    for (const k of f.writes) assert.ok(k.split('.').length >= 2, c.id + ' writes the whole section ' + k + ' and is not a barrier');
  }
});

/* ── ③ WHAT find_capability FOUND IS A TOOL FROM THE NEXT STEP ───────────────────────────────── */

test('atlas-turn-engine ③ one find, then the found capability called by name reaches the operation', async () => {
  const { out, ran, seen } = await turn([
    calls({ name: 'find_capability', args: { query: 'routing.route' } }),
    (req) => {
      const names = req.tools.map((t) => t.name);
      assert.ok(names.includes('routing_route'), 'the capability find_capability returned is offered as a tool');
      return calls({ name: 'routing_route', args: { from: 'Tokyo Station', to: 'Shin-Osaka', mode: 'transit' } });
    },
    answer('The route is on the map.'),
  ], async () => ok('<div>Tokyo → Shin-Osaka 2h30m</div>'));
  assert.equal(ran.length, 1, 'ONE operation, reached by the call right after the find');
  assert.equal(ran[0].type, CAPS.resolve('routing.route').legacy, 'executed as run_capability with that id — the same dispatch case');
  assert.equal(ran[0].action.from, 'Tokyo Station');
  assert.equal(out.results.find((r) => r.name === 'routing_route').capability, 'routing.route');
  /* the model calls: find (step 0), the operation (step 1), the answer (step 2) — no envelope step */
  assert.equal(seen.filter((s) => !s.final).length, 3);
  const found = out.results.find((r) => r.name === 'find_capability');
  assert.ok(found.promotedTools.includes('routing_route'), 'the result that found it says what became callable');
  assert.match(found.promotionNote, /DIRECTLY by name/);
});

test('atlas-turn-engine ③ promotions are appended: the base tools stay the same prefix, in the same order', async () => {
  const { seen } = await turn([
    calls({ name: 'find_capability', args: { query: 'routing.route' } }),
    answer('ok'),
  ], async () => ok());
  const s0 = seen[0].tools, s1 = seen[1].tools;
  assert.ok(s0.every((t) => !t.promoted), 'nothing is promoted before anything was found');
  assert.deepEqual(s1.slice(0, s0.length), s0, 'what the first step declared is still the start of the list');
  assert.ok(s1.length > s0.length);
  assert.ok(s1.slice(s0.length).every((t) => t.promoted), 'everything appended is marked, so ai-proxy leaves it out of the cache key');
  assert.deepEqual(seen[seen.length - 1].tools, s1, 'the forced answer (if any) declares the same list');
});

test('atlas-turn-engine ③ a promoted call and the same run_capability call are ONE call', async () => {
  const { ran, out } = await turn([
    calls({ name: 'find_capability', args: { query: 'routing.route' } }),
    calls({ name: 'routing_route', args: { from: 'Tokyo', to: 'Osaka' } }),
    calls({ name: 'run_capability', args: { id: 'routing.route', args: { from: 'Tokyo', to: 'Osaka' } } }),
    answer('ok'),
  ], async () => ok());
  assert.equal(ran.length, 1);
  assert.equal(out.trace.reused, 1);
});

test('atlas-turn-engine ③ a promoted tool is validated against its own schema before anything runs', async () => {
  let note = null;
  const { ran } = await turn([
    calls({ name: 'find_capability', args: { query: 'routing.route' } }),
    calls({ name: 'routing_route', args: { mode: 'transit' } }),
    (req) => { note = req.messages[req.messages.length - 1].content[0]; return answer('ok'); },
  ], async () => ok());
  assert.equal(ran.length, 0);
  assert.equal(note.error, 'invalid_arguments');
});

test('atlas-turn-engine ③ a capability already held as a CORE tool is named, not promoted twice', async () => {
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS });
  const r = await surface.find('view.flyTo');
  const m = r.matches.find((x) => x.id === 'view.flyTo');
  assert.equal(m.tool, 'map_view');
  assert.ok(!surface.promotionsOf(r).some((d) => d.capabilityId === 'view.flyTo'));
});

test('atlas-turn-engine ③ find_capability and run_capability are still there', () => {
  const tools = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS }).baseTools();
  assert.ok(tools.find_capability && tools.run_capability);
});

/* ── ④ A VALUE THE PAGE DECIDES IS NOT IN THE DECLARATION THE PROVIDER CACHES ────────────────── */

const PROXY = rd('supabase/functions/ai-proxy/index.ts');
function region(from, to) {
  const a = PROXY.indexOf(from), b = PROXY.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, 'ai-proxy: the region «' + from + '» … «' + to + '» moved');
  return PROXY.slice(a, b);
}
const SERVER = (() => {
  const src = region('const MAX_SCHEMA_BYTES', '/* ══ (#R397) THE SCHEMA REACHED GEMINI')
    + region('const MAX_INPUT_ITEMS', '/* ⚠ A TASK IS A KEY INTO FOUR CONFIGURATION TABLES')
    + '\nreturn { normalizeTurn, cacheBasis, MAX_FN_TOOLS };';
  return new Function(transformSync(src, { loader: 'ts' }).code)();
})();
const wire = (tools, extra = []) => Object.keys(tools).map((k) => tools[k]).concat(extra)
  .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters, promoted: t.promoted ? true : undefined }));
const basisOf = (wireTools) => {
  const t = SERVER.normalizeTurn({ protocol: 2, input: [{ type: 'message', role: 'user', content: 'q' }], tools: JSON.parse(JSON.stringify(wireTools)) });
  return SERVER.cacheBasis('SYS', t.tools);
};

test('atlas-turn-engine ④ the live layer names change neither the declaration nor the cache key', () => {
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS });
  const a = surface.baseTools(), b = surface.baseTools();
  const sa = surface.liveEnum(a, 'set_layer', 'name', ['Earthquakes', 'Precipitation']);
  const sb = surface.liveEnum(b, 'set_layer', 'name', ['Erdbeben', 'Niederschlag', 'Wind']);
  assert.equal(JSON.stringify(wire(a)), JSON.stringify(wire(b)), 'the functions sent are the same bytes whatever the page holds');
  assert.equal(basisOf(wire(a)), basisOf(wire(b)));
  assert.match(sa, /Earthquakes; Precipitation/, 'the values are put in front of the model as input instead');
  assert.match(sb, /Niederschlag/);
});

test('atlas-turn-engine ④ …and the values are still enforced — a wrong name comes back typed', () => {
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS });
  const tools = surface.baseTools();
  surface.liveEnum(tools, 'set_layer', 'name', ['Earthquakes', 'Precipitation']);
  const bad = AGENT.reject({ name: 'set_layer', arguments: { name: 'Rain' } }, tools);
  assert.equal(bad.code, 'invalid_arguments');
  assert.match(bad.message, /Earthquakes, Precipitation/);
  assert.equal(AGENT.reject({ name: 'set_layer', arguments: { name: 'Earthquakes', on: true } }, tools), null);
});

test('atlas-turn-engine ④ promoting a tool does not move the cache key; changing a fixed tool does', async () => {
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS });
  const tools = surface.baseTools();
  const found = await surface.find('routing.route');
  const promoted = surface.promotionsOf(found);
  assert.ok(promoted.length);
  const base = basisOf(wire(tools));
  assert.equal(basisOf(wire(tools, promoted)), base, 'the key is a hash of the fixed functions only');
  /* without a promotion the basis is byte-for-byte the string the key was hashed from before */
  assert.equal(base, 'SYS\n' + JSON.stringify(wire(tools).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))));
  const changed = wire(tools); changed[0] = Object.assign({}, changed[0], { description: changed[0].description + ' x' });
  assert.notEqual(basisOf(changed), base, 'a change to what every call declares is still a new key');
});

test('atlas-turn-engine ④ Anthropic gets a breakpoint at the end of the fixed functions when some were promoted', () => {
  assert.match(PROXY, /const lastFixed = turn\.tools\.map\(\(t\) => !t\.promoted\)\.lastIndexOf\(true\);/);
  assert.match(PROXY, /cacheKey = turnReq \? "atlas_turn:" \+ await sha256Hex\(cacheBasis\(system, turnReq\.tools\)\)/);
});

test('atlas-turn-engine ④ the ceiling on declared functions is the proxy\'s, and promotion stops below it', async () => {
  assert.equal(AGENT.LIMITS.maxOfferedTools, SERVER.MAX_FN_TOOLS, 'js/atlas-agent.js maxOfferedTools must equal ai-proxy MAX_FN_TOOLS');
  /* a ceiling of base + 1 (read_result) + 1 leaves room for exactly one promotion */
  const base = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS }).baseTools();
  const room = Object.keys(base).length + 2;
  let found = null;
  const { seen } = await turn([
    calls({ name: 'find_capability', args: { query: '東京から大阪までの鉄道経路' } }),
    (req) => { found = req.messages[req.messages.length - 1].content[0]; return answer('ok'); },
  ], async () => ok(), { limits: { maxOfferedTools: room } });
  assert.equal(seen[1].tools.filter((t) => t.promoted).length, 1);
  assert.match(found.promotionNote, /reach them with run_capability/, 'what was not offered is named, with the way to reach it');
});

/* ── ⑤ THE BUDGET SENTENCE READS THE SERVER'S NUMBER ─────────────────────────────────────────── */

test('atlas-turn-engine ⑤ the loop\'s model calls fit under the server\'s per-turn budget, with room for tools', () => {
  const m = PROXY.match(/const TURN_MAX_CALLS = (\d+);/);
  assert.ok(m, 'ai-proxy declares TURN_MAX_CALLS');
  const server = +m[1];
  assert.ok(AGENT.LIMITS.maxSteps + 1 < server, 'maxSteps + the forced answer must leave room for a tool that asks the model');
  const src = rd('js/atlas-agent.js');
  assert.ok(!/TURN_MAX_CALLS = \d/.test(src), 'the agent does not write the server\'s number down (it drifts: it said 6 while the server said 12)');
});
