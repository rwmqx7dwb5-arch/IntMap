/* ============================================================================
 *  js/atlas-working-memory.js — a long job keeps its goal, conditions, results, figures and sources
 * ----------------------------------------------------------------------------
 *  Before: a long job kept 48 prose lines (a reply cut at 180 characters) and five scalar fields; when the
 *  budget ran out the oldest lines were dropped behind ONE «N messages left out», and a number a tool had
 *  returned was a clipped sentence or gone. These run the SHIPPED modules — the memory, and the turn loop
 *  with its composer — against a scripted model, and ask the question that matters: after the history has
 *  been compressed away, does the important thing still reach the model, from the ORIGINAL data?
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasWorkingMemory, wmTurnRecord, numericLeaves, atPath, MEMORY_REF } from '../js/atlas-working-memory.js';
import { makeAtlasAgent } from '../js/atlas-agent.js';

const AGENT = makeAtlasAgent();
const TOOLS = { stats_query: { name: 'stats_query', description: 'Query a statistic.', parameters: { type: 'object', required: ['metric'], properties: { metric: { type: 'string' } } } } };
const RESULT = { ok: true, summary: 'Population by country', rows: [{ country: 'Japan', population: 125416877, year: 2023 }, { country: 'Chile', population: 19629590, year: 2023 }], source: { name: 'UN WPP', url: 'https://population.un.org/wpp/' } };

function scripted(replies) { const seen = []; let i = 0; const fn = async (req) => { seen.push(req); const r = replies[Math.min(i, replies.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; }; fn.seen = seen; return fn; }
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };

async function runJobTurn(WM, turnId, question, calls, finalText) {
  WM.beginTurn(turnId, question);
  const model = scripted([{ text: '', toolCalls: calls }, { text: finalText, toolCalls: [] }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => JSON.parse(JSON.stringify(RESULT)), memory: WM, memoryTurn: turnId, messages: [{ role: 'user', content: question }] });
  WM.recordTurn(wmTurnRecord(turnId, question, out, { exclusions: ['Russia'], metrics: ['population'], year: 2023 }, null, null));
  return { out, model };
}

test('every answered call is kept whole by ref, before any trimming, with its numbers addressed', async () => {
  const WM = makeAtlasWorkingMemory({});
  await runJobTurn(WM, 1, 'Compare populations', [{ id: 'c1', name: 'stats_query', arguments: { metric: 'population' } }], 'Japan 125.4M.');
  assert.deepEqual(WM.refs(), ['t1.c1']);
  const whole = JSON.parse(WM.recall('t1.c1').text);
  assert.equal(whole.rows[0].population, 125416877, 'the original value is in the stored result');
  assert.equal(WM.recall('t1.c1', 'rows[1].population').text, 't1.c1 rows[1].population = 19629590');
  assert.ok(numericLeaves(RESULT).some((n) => n.path === 'rows[0].population' && n.value === 125416877));
  assert.equal(atPath(RESULT, 'source.url').value, 'https://population.un.org/wpp/');
});

test('AFTER the history is compressed away, the block still carries goal, decisions, results by ref, figures and sources', async () => {
  const WM = makeAtlasWorkingMemory({});
  await runJobTurn(WM, 1, 'Compare populations of Japan and Chile, excluding Russia', [{ id: 'c1', name: 'stats_query', arguments: { metric: 'population' } }], 'done');
  WM.pin('Japan population 2023', null, { ref: 't1.c1', path: 'rows[0].population', unit: 'people' });
  WM.addEvidence({ url: 'https://population.un.org/wpp/', title: 'World Population Prospects', publisher: 'UN', retrievedAt: '2026-11-20', ref: 't1.c1' });
  WM.open('chart of the two not yet drawn', 'owed', 1);
  const block = WM.block();
  for (const needle of ['MOST RECENT GOAL', 'Compare populations of Japan and Chile', 'STILL OPEN', 'chart of the two not yet drawn', 'SAVED FIGURES', 'Japan population 2023 = 125416877', '{t1.c1 @rows[0].population ✓}', 'SOURCES', 'https://population.un.org/wpp/', 'COMPLETED WORK', '{t1.c1}', 'read_result'])
    assert.ok(block.includes(needle), 'the block lost: ' + needle);
  /* a tiny budget: the history goes, the memory is fixed cost and arrives */
  const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(3000) }));
  const built = AGENT.composeInput({ history: long, memory: block, request: '[REQUEST]\nnext', transcript: [], budget: { total: 20000 } });
  assert.ok(built.trim.droppedHistory > 0, 'the history was not compressed');
  const text = JSON.stringify(built.input);
  assert.ok(text.includes('125416877'), 'the pinned number did not survive compression');
  assert.ok(text.includes('ATLAS WORKING MEMORY') && text.includes('is in [ATLAS WORKING MEMORY] below'), 'the dropped-history note does not point at the memory');
  assert.equal(built.recallable, true, 'read_result is not offered although the block names refs');
  const nothing = AGENT.composeInput({ history: [], request: '[REQUEST]\nq', transcript: [] });
  assert.equal(nothing.recallable, false);
});

test('the number is reachable from the ORIGINAL in a LATER turn: read_result answers an earlier turn ref and reaches the model', async () => {
  const WM = makeAtlasWorkingMemory({});
  await runJobTurn(WM, 1, 'Compare populations', [{ id: 'c1', name: 'stats_query', arguments: { metric: 'population' } }], 'ok');
  /* turn 2: the model, having only the block, reads the exact figure back */
  WM.beginTurn(2, 'what was Chile again?');
  const model = scripted([{ text: '', toolCalls: [{ id: 'r1', name: 'read_result', arguments: { call_id: 't1.c1', path: 'rows[1].population' } }, { id: 'r2', name: 'read_result', arguments: { call_id: 't1.c1', offset: 0 } }] }, { text: 'Chile: 19,629,590', toolCalls: [] }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => { throw new Error('no app call expected'); }, memory: WM, memoryTurn: 2, messages: [{ role: 'user', content: 'what was Chile again?' }] });
  assert.equal(out.text, 'Chile: 19,629,590');
  const back = model.seen[1].messages.filter((m) => m.role === 'tool').flatMap((m) => m.content);
  const one = back.find((r) => r.id === 'r1'), whole = back.find((r) => r.id === 'r2');
  assert.equal(one.ok, true); assert.match(one.text, /19629590/);
  assert.equal(whole.ok, true); assert.match(whole.text, /125416877/, 'the whole original result was not delivered');
  /* nothing new was kept for a read_result, and the app was never called again */
  assert.deepEqual(WM.refs(), ['t1.c1']);
  const miss = await AGENT.runTurn({ model: scripted([{ text: '', toolCalls: [{ id: 'z', name: 'read_result', arguments: { call_id: 't9.nope' } }] }, { text: 'x', toolCalls: [] }]), tools: TOOLS, execute: okNever, memory: WM, memoryTurn: 3, messages: [{ role: 'user', content: 'q' }] });
  assert.ok(miss);
});
const okNever = async () => ({ ok: true });

test('a pin cannot claim a value the data does not hold; a path into this turn\'s own result works too', () => {
  const WM = makeAtlasWorkingMemory({});
  WM.noteResult(1, 'c', 'stats_query', {}, RESULT);
  const p = WM.pin('Japan', 1, { ref: 't1.c', path: 'rows[0].population' });
  assert.equal(p.value, 125416877, 'the pin kept the claimed value instead of the original');
  assert.equal(p.verified, true);
  assert.equal(WM.recall('t1.c', 'rows[9].x').ok, false);
  assert.equal(WM.recall('t1.c', 'rows[9].x').error, 'no_such_path');
});

test('bodies are bounded, and an evicted body says so and keeps its digest and numbers (nothing is silently lost)', () => {
  const WM = makeAtlasWorkingMemory({ limits: { bodyChars: 800 } });
  WM.noteResult(1, 'a', 'stats_query', { metric: 'p' }, Object.assign({}, RESULT, { pad: 'p'.repeat(300) }));
  WM.noteResult(2, 'b', 'stats_query', { metric: 'q' }, Object.assign({}, RESULT, { pad: 'q'.repeat(300) }));
  const old = WM.recall('t1.a');
  assert.equal(old.ok, false); assert.equal(old.error, 'body_evicted');
  assert.match(old.message, /rows\[0\]\.population=125416877/, 'the numbers of an evicted body must stay readable');
  assert.match(old.message, /run stats_query again/);
  assert.equal(WM.recall('t2.b').ok, true, 'the newest body was evicted');
  assert.ok(WM.block().includes('{t1.a}'), 'the evicted result left the index');
});

test('compaction is stated: a block over budget names what it left out and the door that reads it', () => {
  const WM = makeAtlasWorkingMemory({});
  for (let i = 1; i <= 40; i++) WM.noteResult(i, 'c' + i, 'stats_query', { metric: 'm' + i }, Object.assign({}, RESULT, { summary: 'result number ' + i + ' ' + 'y'.repeat(200) }));
  const b = WM.block({ budget: 2500 });
  assert.ok(b.length <= 2500 + 200, 'the block ran far past its budget: ' + b.length);
  assert.match(b, /\+\d+ older completed not shown here — call_id "memory" lists them/);
  assert.ok(b.includes('{t40.c40}'), 'the newest result was dropped before the older ones');
  const all = WM.recall(MEMORY_REF).text;
  assert.ok(all.includes('{t1.c1}') && all.includes('{t40.c40}'), 'the whole record does not list everything the block left out');
});

test('open items survive an unrelated answer and close only on observed delivery for the resumed request', () => {
  const WM = makeAtlasWorkingMemory({});
  WM.beginTurn(1, 'draw the map and the chart');
  WM.recordTurn({ turnId: 1, question: 'draw the map and the chart', reply: 'map drawn', unmet: [{ kind: 'output', id: 'output:chart', mode: 'chart', code: 'not_produced' }] });
  assert.match(WM.block(), /output chart not produced/);
  WM.beginTurn(2, 'which units are these?');
  WM.recordTurn({ turnId: 2, question: 'which units are these?', reply: 'Kilometres.', unmet: [] });
  assert.match(WM.block(), /output chart not produced/);
  WM.beginTurn(3, 'now the chart');
  WM.recordTurn({ turnId: 3, question: 'now the chart', reply: 'chart drawn', unmet: [], resumedFrom: 1, acknowledged: ['output:chart'] });
  assert.ok(!/output chart not produced/.test(WM.block()), 'a met item stayed open');
  WM.beginTurn(4, 'plan my trip');
  WM.recordTurn({ turnId: 4, question: 'plan my trip', reply: 'Where to?', awaiting: true });
  assert.match(WM.block(), /asked the reader: Where to\?/);
});

test('decisions: conditions are keyed with the turn that set them, restating keeps the first turn, clearing removes them', () => {
  const WM = makeAtlasWorkingMemory({});
  const d1 = WM.decide('basis', 'per capita', 'user', 1);
  const d2 = WM.decide('basis', 'per capita', 'user', 5);
  assert.equal(d2.turnId, 1);
  WM.decide('region', 'Europe only', 'user', 2);
  assert.match(WM.block(), /basis: per capita \(turn 1, user\)/);
  WM.decide('region', '', 'user', 6);
  assert.ok(!/region/.test(WM.block()));
  assert.ok(d1);
});

test('handoff: snapshot -> restore (and the device copy) carries everything, bodies included; a bad snapshot is refused', async () => {
  const st = store();
  const WM = makeAtlasWorkingMemory({ store: st });
  await runJobTurn(WM, 1, 'Compare populations', [{ id: 'c1', name: 'stats_query', arguments: { metric: 'population' } }], 'ok');
  WM.pin('Chile', null, { ref: 't1.c1', path: 'rows[1].population' });
  WM.addEvidence({ url: 'https://population.un.org/wpp/', title: 'WPP', publisher: 'UN', retrievedAt: '2026-11-20' });
  await Promise.resolve();   /* the device copy is written once per tick */
  await Promise.resolve();
  const WM2 = makeAtlasWorkingMemory({ store: st });
  assert.equal(WM2.load(), true, 'nothing was written to the device copy');
  assert.equal(WM2.recall('t1.c1', 'rows[1].population').text, 't1.c1 rows[1].population = 19629590');
  assert.equal(WM2.stats().pins, 1); assert.equal(WM2.stats().evidence, 1);
  const hand = WM2.handoffText();
  for (const n of ['# Atlas working memory', 'Chile = 19629590', '{t1.c1 @rows[1].population}', 'https://population.un.org/wpp/']) assert.ok(hand.includes(n), 'handoff lost ' + n);
  assert.equal(makeAtlasWorkingMemory({}).restore({ v: 99 }), false);
  assert.equal(makeAtlasWorkingMemory({ store: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } }).load(), false, 'a blocked store must not throw');
});

test('the device copy is bounded: older bodies are marked evicted there, newest kept, numbers kept', () => {
  const st = store();
  const WM = makeAtlasWorkingMemory({ store: st, limits: { persistChars: 700 } });
  WM.noteResult(1, 'a', 'stats_query', {}, Object.assign({}, RESULT, { pad: 'a'.repeat(400) }));
  WM.noteResult(2, 'b', 'stats_query', {}, Object.assign({}, RESULT, { pad: 'b'.repeat(400) }));
  WM.save();
  const WM2 = makeAtlasWorkingMemory({ store: st }); WM2.load();
  assert.equal(WM2.recall('t2.b').ok, true);
  assert.equal(WM2.recall('t1.a').error, 'body_evicted');
});

test('a rewound conversation takes its results, figures, sources and decisions with it', () => {
  const WM = makeAtlasWorkingMemory({});
  WM.noteResult(1, 'a', 'stats_query', {}, RESULT); WM.noteResult(2, 'b', 'stats_query', {}, RESULT);
  WM.pin('p2', 1, { turnId: 2 }); WM.addEvidence({ url: 'https://e.example/', title: 't', turnId: 2 }); WM.decide('k', 'v', 'user', 2);
  WM.dropFrom(2);
  assert.deepEqual(WM.refs(), ['t1.a']);
  assert.deepEqual(WM.stats(), Object.assign(WM.stats(), { pins: 0, evidence: 0, decisions: 0, done: 1 }));
});

test('outside content: the block marks the turn context as carrying it until the rewind that removes it', () => {
  const WM = makeAtlasWorkingMemory({});
  WM.recordTurn({ turnId: 1, question: 'q', reply: 'r', outside: true });
  assert.equal(WM.carriesOutside(), true);
  const blk = WM.block();
  WM.noteResult(1, 'a', 'stats_query', {}, RESULT);
  const b = AGENT.composeInput({ memory: WM.block(), memoryOutside: true, request: '[REQUEST]\nq', transcript: [] });
  assert.equal(b.outside, true, 'the memory carried outside words with no mark');
  assert.equal(AGENT.composeInput({ memory: WM.block(), memoryOutside: false, request: '[REQUEST]\nq', transcript: [] }).outside, false);
  WM.dropFrom(1);
  assert.equal(WM.carriesOutside(), false);
  assert.ok(blk !== undefined);
});

test('a turn does not lose results when the model\'s input is cut: the squeezed result is still whole in memory', async () => {
  const WM = makeAtlasWorkingMemory({});
  const big = Object.assign({}, RESULT, { pad: 'z'.repeat(60000) });
  WM.beginTurn(1, 'big');
  const model = scripted([{ text: '', toolCalls: [{ id: 'c1', name: 'stats_query', arguments: { metric: 'm' } }] }, { text: 'ok', toolCalls: [] }]);
  await AGENT.runTurn({ model, tools: TOOLS, execute: async () => big, memory: WM, memoryTurn: 1, messages: [{ role: 'user', content: 'big' }] });
  const built = AGENT.composeInput({ request: '[REQUEST]\nbig', memory: WM.block(), transcript: [{ role: 'user', content: 'big' }, { role: 'assistant', toolCalls: [{ id: 'c1', name: 'stats_query', arguments: {} }] }, { role: 'tool', content: [Object.assign({ id: 'c1', name: 'stats_query' }, big)] }] });
  assert.equal(built.cut, true, 'the input was not cut');
  assert.equal(JSON.parse(WM.recall('t1.c1').text).rows[0].population, 125416877, 'the cut input took the original with it');
});
