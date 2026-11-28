/* atlas-goal-verifier (node --test): the request is read by something other than the answerer. Defect guarded: a turn that declared nothing was measured against nothing and reported complete. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

/* ── atlas-goal-verifier: the loop's hook — an independent reading of the request, put to Atlas as a note ─── */
const AGENT = (await imp('js/atlas-agent.js')).makeAtlasAgent();
const TOOLS = { zzz: { name: 'zzz', description: 'x', parameters: { type: 'object', properties: { x: { type: 'string' } } } } };
const USER = [{ role: 'user', content: '1914年のヨーロッパの国境を地図に出して' }];
const scripted = (replies) => { let i = 0; const m = async () => replies[Math.min(i++, replies.length - 1)]; m.count = () => i; return m; };

test('atlas-goal-verifier: a text answer to a request the reader finds unmet is put back once, and Atlas may still answer', async () => {
  const model = scripted([{ text: '国境は…です。', toolCalls: [] }, { text: '国境は…です（地図は不要と判断）。', toolCalls: [] }]);
  let asked = 0;
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: USER,
    verify: async (c) => { asked++; assert.equal(c.request, USER[0].content); return { unmet: [{ need: 'a 1914 map', why: 'nothing was drawn' }] }; } });
  assert.equal(asked, 1, 'asked once per turn, never again after the bounce');
  assert.equal(model.count(), 2, 'one bounce: Atlas is told, and answers again');
  assert.equal(out.trace.goalCheck, 'unmet');
  assert.equal(out.stopped, 'answered');
  assert.equal(out.completion, 'partial', 'what the reader found stays on the record');
  assert.equal(out.unmet[0].kind, 'goal');
  assert.equal(out.unmet[0].need, 'a 1914 map');
});

test('atlas-goal-verifier: met, not observed and a throw all accept the turn as it was — not observed is not unmet', async () => {
  for (const [name, verify, check] of [['met', async () => ({ unmet: [], met: [{ need: 'State the length', how: 'The answer gives 777 km' }] }), 'met'], ['null', async () => null, 'unobserved'], ['throw', async () => { throw new Error('timeout'); }, 'unobserved']]) {
    const model = scripted([{ text: 'La Seine fait 777 km.', toolCalls: [] }]);
    const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: USER, verify });
    assert.equal(model.count(), 1, name);
    assert.equal(out.completion, check === 'met' ? 'complete' : 'unobserved', name);
    assert.equal(out.trace.goalCheck, check, name);
  }
});

test('atlas-goal-verifier: without a verify hook the loop is exactly what it was', async () => {
  const out = await AGENT.runTurn({ model: scripted([{ text: 'ok', toolCalls: [] }]), tools: TOOLS, execute: async () => ({ ok: true }), messages: USER });
  assert.equal(out.completion, 'complete');
  assert.equal(out.trace.goalCheck, '');
});

const GV = await imp('js/atlas-goal-verify.js');
test('atlas-goal-verifier: the verify hook shows the request and the RECORD, returns null on any failure, and reads no word of the request', async () => {
  let sent = null;
  const ok = GV.makeGoalVerify({ ask: async (p, s, i, o) => { sent = { p, o }; return { data: { unmet: [{ need: 'a map', why: 'none drawn' }, { need: '  ' }] } }; }, turnId: 'T1' });
  const v = await ok({ request: '地図に出して', text: '説明', answerMode: 'text', produced: [], results: [{ capability: 'data.value', ok: true }, { capability: 'map.highlight', ok: false, error: 'not_found' }] });
  assert.deepEqual(v, { unmet: [{ need: 'a map', why: 'none drawn' }] }, 'blank needs are dropped');
  assert.match(sent.p, /地図に出して/);
  assert.match(sent.p, /map\.highlight → FAILED \(not_found\)/);
  assert.equal(sent.o.task, 'atlas_verify');
  assert.equal(sent.o.turnId, 'T1');
  assert.equal(await GV.makeGoalVerify({ ask: async () => { throw new Error('x'); } })({ request: 'q', results: [] }), null);
  assert.equal(await GV.makeGoalVerify({ ask: async () => ({ data: { nope: 1 } }) })({ request: 'q', results: [] }), null);
  assert.equal(await GV.makeGoalVerify({ ask: async () => ({ data: { unmet: [] } }) })({ request: '  ', results: [] }), null, 'no request, nothing to read');
});
