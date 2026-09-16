/* ============================================================================
 *  #R760 — a redraw of what is already on the map is not a failure, and a call
 *  that keeps answering the same way is not progress
 * ----------------------------------------------------------------------------
 *  Measured on production 2026-09-16 (build R758, signed in, 56 questions):
 *
 *    「Colour every country by population density and give me the legend.」
 *        map.choropleth ok → not_rendered → not_rendered → not_rendered, 50 s,
 *        and the reader was told «the answer above may be incomplete» about a
 *        turn whose FIRST call had painted every country and printed the legend.
 *
 *    「Measure the great-circle distance from Reykjavik to Cape Town and draw
 *      the line.」
 *        map.drawLine ×5 (two not_rendered), 430 s, working limit — and the
 *        distance the reader asked for never reached the prose at all.
 *
 *  Two independent defects meet in those turns:
 *
 *  (1) The painter did not say what it had painted. `paint.verify` can already
 *      call an identical redraw `already_there` (#R742) but only against a
 *      declaration, and neither `drawChoro` nor `drawLine` made one — while
 *      #R747 made the line redraw IDEMPOTENT, which guarantees the count cannot
 *      move. `_hlLines` entries had no identity at all when unlabelled, because
 *      identity was read off the caption; a line's identity is its course.
 *
 *  (2) The agent's repeat guard knew two of the three statuses. #R731 named the
 *      repeat of an ANSWERED call, #R741 the repeat of a REFUSED one; a call
 *      that comes back `partial` with the same code was named by neither, so
 *      such a turn ran to its working limit every time.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeEraHighlight } = await import('../js/atlas-era-highlight.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

const COURSE = '-21.94000,64.14000 18.42000,-33.92000';

/* every surface must be supplied, or the reading is `null` — «unreadable is not zero» */
function suppliers(over) {
  return Object.assign({ countries: () => new Set(), era: () => [], polys: () => [],
    lines: () => [], choro: () => ({}), metric: () => '' }, over || {});
}

/* ── ① a shape with no caption still has an identity, and it is its course ──
   The nameless used to be dropped (js/atlas-era-highlight.js `identities`), so an
   unlabelled line declared nothing and could never be found on the map again. */
test('R760 ① an unlabelled line is identified by its course, not dropped as nameless', () => {
  const ERA = makeEraHighlight({});
  const line = { geo: { type: 'LineString', coordinates: [[-21.94, 64.14], [18.42, -33.92]] }, key: COURSE, name: '' };
  const ids = ERA.paintState(suppliers({ lines: () => [line] })).now().ids;
  assert.deepEqual(ids.lines, [COURSE], 'the course is the identity when there is no caption');
  /* a caption, when there is one, still wins — a reader who named it gets the name back */
  const named = ERA.paintState(suppliers({ lines: () => [Object.assign({}, line, { name: 'Reykjavik to Cape Town' })] }));
  assert.deepEqual(named.now().ids.lines, ['Reykjavik to Cape Town']);
});

test('R760 ② redrawing the same course states the same identity (a redraw is not a change)', () => {
  const ERA = makeEraHighlight({});
  const first = ERA.paintState(suppliers({ lines: () => [{ key: COURSE, name: '' }] })).now().ids.lines;
  /* #R747's `_lnSame` restyles the existing entry rather than pushing a second one; a
     different colour and width must not read as a different line. */
  const second = ERA.paintState(suppliers({ lines: () => [{ key: COURSE, name: '', color: '#f00', w: 8 }] })).now().ids.lines;
  assert.deepEqual(second, first, 'a restyled redraw of the same course is the same line');
});

/* ── ② the verdict: nothing moved, but what was asked for is on the map ── */
function verdict(raw, after) {
  return CAPS.OBSERVERS.paint.verify({}, {}, JSON.parse(JSON.stringify(after)), after, raw);
}
function surfaceState(ids) {
  return { poly: 0, line: 0, pins: 0, poi: 0, compose: 0, shakemap: 0, factions: 0,
    visible: 3, objects: 0, atlas: { ids: ids } };
}

test('R760 ③ an identical repaint of a declared surface is `already_there`, never `not_rendered`', () => {
  const v = verdict({ ok: true, html: '<div>line</div>', meta: { painted: { lines: [COURSE] } } },
    surfaceState({ lines: [COURSE] }));
  assert.equal(v.status, 'completed', 'a state the reader asked for, held, is completed');
  assert.equal(v.code, 'already_there');
});

test('R760 ④ a choropleth repaint of the same countries is `already_there`', () => {
  const codes = ['JPN', 'USA', 'DEU'];
  const v = verdict({ ok: true, html: '<div>legend</div>', meta: { painted: { choro: codes.slice() } } },
    surfaceState({ choro: codes.slice() }));
  assert.equal(v.code, 'already_there');
});

test('R760 ⑤ a declaration the map does NOT hold is still not_rendered', () => {
  /* the verdict is not weakened: this is what makes ③ and ④ a reading rather than a promise */
  const v = verdict({ ok: true, html: '', meta: { painted: { choro: ['JPN'] } } },
    surfaceState({ choro: [] }));
  assert.equal(v.status, 'partial');
  assert.equal(v.code, 'not_rendered');
});

/* ── ③ the painters declare. Read at the source, because the goal is that the
   DECLARATION exists beside the write — a live dispatch needs a map. ── */
test('R760 ⑥ the painters that hold a named surface declare what they painted', () => {
  const src = readLF(join(ROOT, 'js', 'atlas-console.js'));
  assert.ok(src.includes('meta:{painted:{choro:Object.keys(_choroState)}}'),
    'drawChoro states the countries it shaded');
  assert.ok(src.includes('meta:{painted:{lines:[_lnObj.name||_lnObj.key]}}'),
    'drawLine states the course it drew');
  assert.ok(src.includes('meta:{painted:{polys:[_pgObj.name||_pgObj.key]}}'),
    'drawPolygon states the ring it drew');
  /* and the course is put ON the object, or the declaration names something the reading cannot find */
  assert.ok(src.includes('_lnSame.key=_lnKey'), 'a restyled line keeps its course as its identity');
  assert.ok(src.includes('key:_lnKey'), 'a new line carries its course');
  assert.ok(src.includes('const _pgKey='), 'a polygon carries its ring');
  /* and the removers declare what is now EMPTY, which is the same contract pointed the other way
     (#R747). `reset` had it; `clearAll` did not, and clearing an already-clear map was
     `not_rendered` — measured on production 2026-09-16 in 「Actually, go back to the previous view」. */
  assert.ok(src.includes("_CLEARED('countries','polys','lines','choro','outline')"),
    'map.clearAll states every surface it empties');
  assert.ok(src.includes("_CLEARED('outline')"), 'clearing the outline says the outline is now empty');
});

test('R760 ⓰ an emptied surface a remover declared is verified as empty, not as nothing happening', () => {
  const v = verdict({ ok: true, html: '', meta: { painted: { choro: [], lines: [], outline: [] } } },
    surfaceState({ choro: [], lines: [], outline: [] }));
  assert.equal(v.status, 'completed');
  assert.equal(v.code, 'already_there', 'a clear of a clean map is the state the reader asked for');
});

test('R760 ⓪ the place outline is a surface that can be declared and read back', () => {
  const ERA = makeEraHighlight({});
  const ids = ERA.paintState(suppliers({ outline: () => 'Amazon Basin' })).now().ids;
  assert.deepEqual(ids.outline, ['Amazon Basin'], 'what IntMapOutline holds is readable as a painted surface');
  assert.deepEqual(ERA.paintState(suppliers({ outline: () => null })).now().ids.outline, [],
    'nothing outlined is an EMPTY surface, not a missing one — a clear can be verified against it');
  /* and outlining the same place twice, which moves no count anywhere, is the state the reader asked for */
  const v = verdict({ ok: true, html: '', meta: { painted: { outline: ['Amazon Basin'] } } },
    surfaceState({ outline: ['Amazon Basin'] }));
  assert.equal(v.code, 'already_there');
});

test('R760 ⓫ a remark from the answer audit is not a report that nothing happened', async () => {
  /* `unverified` is #R142's flag for a map that never changed, and score()/_visFailed/fromLegacy all
     read it as failure. The audit note says of itself that it is NOT a verdict, so it must not ride it. */
  const { makeAtlasAnswerPipeline } = await import('../js/atlas-answer-pipeline.js');
  const PL = makeAtlasAnswerPipeline();
  const meta = PL.auditMeta({ audit: { errors: [{ code: 'evidence.primary_unsupported' }] } });
  assert.deepEqual(meta.auditFindings, ['evidence.primary_unsupported']);
  assert.match(String(meta.auditNote), /rendered in full/, 'Atlas is still told what the audit noticed');
  assert.equal(meta.unverified, undefined, 'and it is not told that the answer did not happen');
  const { makeAtlasTurnResults } = await import('../js/atlas-turn-results.js');
  const TRES = makeAtlasTurnResults();
  const audited = { ok: true, act: { type: 'analyze', question: 'q' }, meta: meta };
  const silent = { ok: true, act: { type: 'analyze', question: 'q' }, meta: {} };
  assert.equal(TRES.score(audited), TRES.score(silent),
    'an answer the audit remarked on no longer ranks below one it had nothing to say about');
});

test('R760 ⓱ a simulator whose deliverable is a window says so, and is not called not_rendered', () => {
  /* `sim` observes paintNow(), which counts map sources and knows nothing about windows. Measured on
     production 2026-09-16, 「Fly me through the Grand Canyon in the flight simulator」: seven
     `not_rendered` verdicts in 87 s while the chooser was on screen. */
  const still = surfaceState({});
  const v = CAPS.OBSERVERS.sim.verify({}, {}, JSON.parse(JSON.stringify(still)), still,
    { ok: true, html: '<div>pick your aircraft</div>', meta: { opened: 'flightSim' } });
  assert.equal(v.status, 'completed');
  assert.equal(v.observed.opened, 'flightSim', 'what it opened rides the verdict, so Atlas can name it');
  /* and a simulator that declares nothing, with nothing on the map, is still not_rendered */
  const v2 = CAPS.OBSERVERS.sim.verify({}, {}, JSON.parse(JSON.stringify(still)), still, { ok: true, html: '' });
  assert.equal(v2.code, 'not_rendered', 'the verdict is not weakened for anything that stays silent');
});

test('R760 ⓲ the flight simulator declares the window it opened', () => {
  const src = readLF(join(ROOT, 'js', 'atlas-console.js'));
  assert.ok(src.includes("ok?{meta:{opened:'flightSim'}}:null"), 'the opener states what it opened');
});

/* ── ④ the agent stops a partial treadmill ── */
function drawCall() {
  return { text: 'drawing.', turnState: 'continuing',
    toolCalls: [{ id: 'a', name: 'run_capability',
      arguments: { id: 'map.drawLine', args: { points: [[-21.94, 64.14], [18.42, -33.92]] } } }] };
}

test('R760 ⑦ a call that keeps coming back partial with the same code stops the turn', async () => {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const execute = async (call) => { ran.push(call); return { ok: true, status: 'partial', code: 'not_rendered', html: '<div>line</div>' }; };
  const out = await AGENT.runTurn({ model: async () => drawCall(), tools,
    execute: execute, system: 'sys',
    messages: [{ role: 'user', content: 'draw the line' }] });
  assert.equal(out.stopped, 'repeated_calls',
    'the turn names the treadmill instead of running to its working limit');
  assert.ok(ran.length <= 4, 'the same unchanged call is not made five times — ran ' + ran.length);
  const marked = (out.results || []).filter((r) => r && r.repeatedPartialCallThisTurn);
  assert.ok(marked.length >= 1, 'the repeat is NAMED in the result Atlas reads, not silently counted');
  assert.match(String(marked[0].note || ''), /same verdict/,
    'and the note says what is actually true of it');
});

test('R760 ⑧ a partial that comes back with a DIFFERENT code is progress and is not counted', async () => {
  /* nothing is taken (CONSTITUTION.md §5): a call that is getting somewhere keeps its steps */
  let n = 0;
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const execute = async () => { n++; return { ok: true, status: 'partial', code: 'code-' + n, html: '<div>x</div>' }; };
  const out = await AGENT.runTurn({ model: async () => drawCall(), tools,
    execute: execute, system: 'sys',
    messages: [{ role: 'user', content: 'draw' }] });
  assert.notEqual(out.stopped, 'repeated_calls', 'a changing verdict is progress');
  assert.ok(n > 4, 'and the turn was allowed to keep working — ran ' + n);
});

test('R760 ⓬ the tool result says WHY it was partial, not only that it was', async () => {
  /* `error` carried `meta.code` for failures and nothing carried it otherwise, so a partial
     reached Atlas as the bare word «partial» — `not_rendered` and `already_there` looked alike. */
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS,
    runAction: async () => ({ ok: true, html: '<div>x</div>',
      meta: { status: 'partial', code: 'partially_resolved', produced: ['map'] } }) });
  const tools = surface.baseTools();
  const out = await surface.makeExecute(tools, AGENT)({ name: 'run_capability',
    arguments: { id: 'map.highlight', args: { countries: ['JPN'] } } });
  assert.equal(out.status, 'partial');
  assert.equal(out.code, 'partially_resolved', 'the verdict already knew the word; the result must say it');
});

test('R760 ⓭ a refusal the capability calls permanent is refused for its KIND, not its wording', async () => {
  /* five differently-worded names for a metric IntMap does not hold read as five different
     requests, because the repeat ledger keys on the exact arguments. */
  const asked = [];
  const names = ['CO2 emissions per capita', 'co2_per_capita', 'carbon per person', 'CO2 intensity', 'emissions/cap'];
  let i = 0;
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const execute = async (call) => { asked.push(call); return { ok: false, error: 'unknown_metric', permanentFailure: true }; };
  const model = async () => ({ text: 'trying.', turnState: 'continuing',
    toolCalls: [{ id: 'a', name: 'run_capability',
      arguments: { id: 'data.ratio', args: { metricA: names[Math.min(i++, names.length - 1)], metricB: 'pop' } } }] });
  const out = await AGENT.runTurn({ model, tools, execute, system: 'sys',
    messages: [{ role: 'user', content: 'CO2 per capita choropleth' }] });
  assert.equal(out.stopped, 'repeated_calls', 'the turn stops instead of rewording an impossible request');
  assert.ok(asked.length <= 4, 'it is not asked five times — asked ' + asked.length);
  const marked = (out.results || []).filter((r) => r && r.repeatedFailedCallThisTurn);
  assert.ok(marked.length >= 1);
  assert.match(String(marked[0].note || ''), /not about how the request was worded/);
});

test('R760 ⓮ a capability that declares nothing keeps every one of its attempts', async () => {
  /* nothing is taken (CONSTITUTION.md §5): the class rule applies only where a capability opted in. */
  let n = 0;
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const execute = async () => { n++; return { ok: false, error: 'geocode_failed' }; };
  const model = async () => ({ text: 'trying.', turnState: 'continuing',
    toolCalls: [{ id: 'a', name: 'run_capability',
      arguments: { id: 'view.flyTo', args: { place: 'place-' + n } } }] });
  const out = await AGENT.runTurn({ model, tools, execute, system: 'sys',
    messages: [{ role: 'user', content: 'fly somewhere' }] });
  assert.notEqual(out.stopped, 'repeated_calls', 'an undeclared refusal is still worth another try');
  assert.ok(n > 4, 'and the turn kept working — ran ' + n);
});

test('R760 ⓯ the metric refusal declares itself permanent and still names the whole valid set', async () => {
  const { makeAtlasMetrics } = await import('../js/atlas-metrics.js');
  const M = makeAtlasMetrics({}, { LA: () => 'en', lx: (v) => v, L: (en) => en,
    esc: (s) => String(s), warn: (s) => String(s), R: (ok, html, extra) => Object.assign({ ok: ok, html: html }, extra || null) });
  const r = M.unknownMetric('CO2 emissions per capita');
  assert.equal(r.ok, false);
  assert.equal(r.meta.permanent, true, 'the comment above it has said since #R740 that this refusal cannot be retried');
  assert.equal(r.meta.code, 'unknown_metric');
  M.metKeys().forEach((k) => assert.ok(String(r.html).includes(k), 'the valid set is still named in full: ' + k));
});

/* ── ⑥ the turn ledger is closed ── */
test('R760 ⑨ every turn boundary closes the ledger entry it opened', () => {
  const src = readLF(join(ROOT, 'js', 'atlas-console.js'));
  const calls = (src.match(/ASTATE\.endTurn\(turn,/g) || []).length;
  assert.ok(calls >= 4, 'success, error, and both cancellation paths close the turn — found ' + calls);
  assert.ok(src.includes("ASTATE.endTurn(turn,{status:'cancelled'})"), 'a superseded turn says so');
  assert.ok(src.includes("ASTATE.endTurn(turn,{status:'error'"), 'a thrown turn says so');
});

test('R760 ⑩ endTurn actually writes what it is handed', async () => {
  const { makeAtlasState } = await import('../js/atlas-state.js');
  const S = makeAtlasState({});
  S.beginTurn(1, 'q');
  assert.equal(S.lastTurn().status, 'running', 'the entry starts open');
  assert.equal(S.lastTurn().reply, '');
  S.endTurn(1, { reply: 'the answer', status: 'answered', aiCalls: 3 });
  assert.equal(S.lastTurn().status, 'answered');
  assert.equal(S.lastTurn().reply, 'the answer');
  assert.equal(S.lastTurn().aiCalls, 3);
});
