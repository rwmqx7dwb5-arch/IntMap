/* IntMap · subagent model tiers — the cheap default must survive the caller.
 *
 * OBSERVED 2026-10-03: after the sonnet defaults landed, 92% of 316 subagent runs were on Opus.
 * The declarations were right; the escalation clause («判定させるときは上げる», «迷ったら上げる»)
 * matched nearly every verifier request, and scout was raised with no clause at all. The defect
 * is not «a role says opus» but «the caller is told to raise on the first request». What is
 * measured here is that the clause every caller meets — the role description the Agent tool
 * lists, and the round skill — attaches escalation to a SECOND, judging request (verifier) or to
 * a stated condition (implementer), and that the meter which saw the 92% still counts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { family, firstModel, ownKeys } from '../scripts/agent-models.mjs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const desc = (role) => rd(`.agents/roles/${role}.md`).match(/^description: (.+)$/m)[1];
const model = (role) => rd(`.agents/roles/${role}.md`).match(/^ {2}model: (.+)$/m)?.[1]?.trim();

test('既定を下げた役は、呼び手に「いつ上げるか／上げないか」を description で述べる', () => {
  for (const role of ['intmap-scout', 'intmap-verifier', 'intmap-implementer', 'intmap-i18n']) {
    assert.equal(model(role), 'sonnet', `${role} should default to sonnet`);
  }
  assert.equal(model('intmap-prod-verifier'), undefined, 'prod-verifier judges production and inherits the parent');
  assert.match(desc('intmap-verifier'), /最初の依頼[^。]*上書きしない/, 'verifier: the first request must not be raised');
  assert.match(desc('intmap-verifier'), /2 問目だけ[^。]*model: "opus"/, 'verifier: only the judging follow-up is raised');
  assert.match(desc('intmap-implementer'), /model: "opus"/, 'implementer: the escalation condition reaches the caller');
  assert.match(desc('intmap-implementer'), /読んでから統合/, 'implementer: a cheap draft is read by the main session before integration');
  assert.match(desc('intmap-scout'), /上書きしない/, 'scout: no escalation');
});

test('手順書は「迷ったら上げる」を持たず、昇格を 2 問目に付ける', () => {
  const skill = rd('.agents/skills/intmap-round/SKILL.md');
  const sec = skill.slice(skill.indexOf('### どのモデルで走らせるか'), skill.indexOf('\n## 3.'));
  assert.ok(!/\*\*迷ったら上げる。\*\*/.test(sec), 'the clause that turned the exception into the default is back');
  assert.match(sec, /2 問目だけ/);
  assert.match(sec, /agent-models\.mjs|92%/);
});

test('計器: 答えたモデルを読み、この repo の project key だけを数える', () => {
  assert.equal(firstModel('{"x":1}\n{"message":{"model":"claude-sonnet-5-5"}}\n{"message":{"model":"claude-opus-5-5"}}'), 'claude-sonnet-5-5');
  assert.equal(firstModel('{"x":1}'), null);
  assert.equal(family('claude-opus-5-5'), 'opus');
  assert.equal(family('claude-haiku-4-5-20251001'), 'haiku');
  assert.equal(family(null), 'unknown');
  const m = 'C--Users-a-OneDrive-IntMap';
  assert.deepEqual(ownKeys([m, 'C--Users-a-AppData-Local-Temp-intmap-worktrees-wt-foo', 'C--Users-a-Other'], m),
    [m, 'C--Users-a-AppData-Local-Temp-intmap-worktrees-wt-foo']);
});
