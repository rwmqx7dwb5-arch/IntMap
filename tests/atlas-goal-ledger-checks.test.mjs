/* atlas-goal-ledger (node --test): the independent read is repeated only when the record has grown, and shows Atlas what is covered. Defect guarded: a finding Atlas acted on was never checked again, so a half-done fix read as complete. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const AGENT = (await imp('js/atlas-agent.js')).makeAtlasAgent();
const GV = await imp('js/atlas-goal-verify.js');
const TOOLS = { zzz: { name: 'zzz', description: 'x', parameters: { type: 'object', properties: { x: { type: 'string' } } } } };
const USER = [{ role: 'user', content: '世界の主要港20か所の取扱量を比較して' }];
const scripted = (replies) => { let i = 0; const m = async () => replies[Math.min(i++, replies.length - 1)]; m.count = () => i; return m; };

test('goal-ledger: work done after a finding is read again; unchanged record is never read twice', async () => {
  const model = scripted([
    { text: '10港を見つけました。', toolCalls: [] },
    { text: '', toolCalls: [{ id: 'c1', name: 'zzz', args: { x: '残り10港' } }] },
    { text: '20港を比較しました。', toolCalls: [] },
  ]);
  const seen = [];
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: USER,
    verify: async (c) => {
      seen.push({ round: c.round, prev: c.previous });
      return seen.length === 1 ? { met: [{ need: '10 ports', how: 'listed' }], unmet: [{ need: '残り10港', why: 'only 10 of 20' }] } : { unmet: [] };
    } });
  assert.equal(seen.length, 2, 'read once, Atlas worked, read once more');
  assert.equal(seen[0].prev, null);
  assert.equal(seen[1].round, 2);
  assert.equal(seen[1].prev.unmet[0].need, '残り10港', 'the second read is shown the first finding');
  assert.equal(out.trace.goalCheck, 'met');
  assert.equal(out.trace.goalLedger.rounds, 2);
  assert.equal(out.completion, 'complete');
});

test('goal-ledger: the note carries what is already covered, so Atlas sees where it stands', async () => {
  const model = scripted([{ text: 'a', toolCalls: [] }, { text: 'a, as it stands', toolCalls: [] }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: USER,
    verify: async () => ({ met: [{ need: 'top ports named', how: 'answer text' }], unmet: [{ need: 'volumes for all 20', why: '8 of 20' }] }) });
  assert.equal(out.trace.goalLedger.met[0].need, 'top ports named');
  assert.equal(out.trace.goalLedger.unmet[0].need, 'volumes for all 20');
  assert.equal(out.completion, 'partial');
});

test('goal-ledger: the reader returns met only when it says something, and shows the previous finding', async () => {
  let sent = '';
  const v = GV.makeGoalVerify({ ask: async (p) => { sent = p; return { data: { met: [{ need: 'x', how: 'y' }, { need: ' ' }], unmet: [] } }; } });
  const r = await v({ request: 'q', text: 't', results: [], previous: { unmet: [{ need: 'volumes', why: '8/20' }] } });
  assert.deepEqual(r, { met: [{ need: 'x', how: 'y' }], unmet: [] });
  assert.match(sent, /PREVIOUS READING[\s\S]*volumes/);
});
