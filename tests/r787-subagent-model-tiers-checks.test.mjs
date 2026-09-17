/* ============================================================================
 *  #R787 · 役ごとに走るモデルを分ける — 宣言が実行されることを測る
 * ----------------------------------------------------------------------------
 *  WHAT OPENED THIS ROUND: every subagent inherited the parent's model, so a role whose whole
 *  output is `file:line` counts cost exactly what a role that decides costs. Three roles were
 *  given `claude.model: sonnet`.
 *
 *  ⚠ WHAT IS MEASURED IS NOT 「sonnet と書いてあるか」. A file saying `sonnet` is the answer this
 *  round reached, and asserting the answer would guard nothing —
 *  [[intmap-restate-the-defect-not-the-fix]]. The DEFECTS a model assignment can have are three,
 *  and every one of them is silent:
 *
 *    ① A NAME THE HARNESS DOES NOT KNOW. Claude Code reads the `model:` frontmatter and, given a
 *       spelling it does not recognise, falls back to the inherited model WITHOUT SAYING SO. The
 *       declaration survives in the file and a reader downstream believes it — the shape memory
 *       calls [[intmap-declared-capability-never-executed]]. So the vocabulary is read from the one
 *       place that writes it (`CLAUDE_MODELS` in scripts/agent-sync.mjs) rather than re-spelled here.
 *    ② A KEY WRITTEN WHERE NOBODY READS IT. Codex takes its agent file as a config layer whose
 *       model the account chooses; a `model` emitted into .codex/agents/*.toml would be a key with
 *       no reader — [[intmap-records-with-no-reader]]. The renderer must not emit one.
 *    ③ THE PROSE AND THE MACHINE DISAGREEING. The assignment is argued in a table an agent reads
 *       before it delegates. A table that has drifted from the role files is worse than no table,
 *       because both readers are confident — [[intmap-comment-contradicted-the-table-below-it]].
 *       So the table is PARSED and compared against .agents/roles/, in both directions.
 *
 *       ⚠ THAT TABLE IS NOT IN .agents/rules/. It was written there first and tests/r295-checks ⑥
 *       refused it: an always-on rule file has a 6144-byte ceiling because EVERY session pays for
 *       it, and execution-strategy.md sits 8 bytes under that ceiling — the check's own words are
 *       「Move detail into an agent or a skill」. So the table lives in the round skill, and the
 *       one line a caller needs is in the ROLE'S OWN description, which is what the Agent tool
 *       shows the caller ([[intmap-hist-names-rule-belongs-to-the-name]]: the rule belongs to the
 *       thing it governs). This file therefore reads BOTH homes, and neither path is hard-coded
 *       as the answer — what is asserted is that the caller-facing text and the role files agree.
 *
 *  ④ AND THE ESCALATION MUST SURVIVE. The saving is only sound because the one role whose verdict
 *     can cost more than it saves (`intmap-verifier`, judging environment-vs-regression — see
 *     .agents/rules/one-pass-or-a-reason.md §2 and #R736 / #R742 / #R768) carries a written
 *     condition for raising it per call. A later round that quietly deletes that paragraph while
 *     keeping the cheap default would turn a conditional saving into an unconditional one.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const ROLE_DIR = '.agents/roles';
/* where the assignment is argued — see the header: NOT .agents/rules/, which is full */
const SKILL = '.agents/skills/intmap-round/SKILL.md';
const roleFiles = readdirSync(join(ROOT, ROLE_DIR)).filter((f) => f.endsWith('.md')).sort();

/* the model each source role declares; undefined = inherit from the parent */
const declared = new Map(roleFiles.map((f) => {
  const fm = rd(`${ROLE_DIR}/${f}`).match(/^---\n([\s\S]*?)\n---\n/)[1];
  const lines = fm.split('\n');
  const at = lines.findIndex((l) => l === 'claude:');
  assert.ok(at !== -1, `${ROLE_DIR}/${f}: no claude: block`);
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => !/^ {2}/.test(l));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  const m = body.match(/^ {2}model: (.+)$/m);
  return [f.replace(/\.md$/, ''), m ? m[1].trim() : undefined];
}));

test('① 宣言されたモデル名は、それを書き出す当人が受け付ける綴りである', () => {
  /* The vocabulary is read from the renderer rather than repeated, so the two cannot drift.
     A name outside it is written into the frontmatter and then ignored without a word. */
  const src = rd('scripts/agent-sync.mjs');
  const m = src.match(/const CLAUDE_MODELS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'scripts/agent-sync.mjs no longer declares CLAUDE_MODELS — nothing validates the spelling that Claude Code silently ignores');
  const allowed = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  assert.ok(allowed.size >= 2, 'CLAUDE_MODELS collapsed to a single value — it would accept nothing worth checking');

  for (const [role, model] of declared) {
    if (model === undefined) continue;
    assert.ok(allowed.has(model), `${ROLE_DIR}/${role}.md declares claude.model «${model}», which ${[...allowed].join('/')} does not contain — the role would run on the inherited model and say nothing`);
  }
});

test('② Codex 側の生成物にモデルのキーが漏れていない（読み手が居ないキーを作らない）', () => {
  for (const role of declared.keys()) {
    const toml = rd(`.codex/agents/${role}.toml`);
    assert.equal(/^\s*model\s*=/m.test(toml), false, `.codex/agents/${role}.toml carries a model key — Codex reads this file as a config layer whose model the account chooses, so the key would have no reader`);
  }
});

test('③ 生成された frontmatter が、正本と同じことを述べている', () => {
  for (const [role, model] of declared) {
    const fm = rd(`.claude/agents/${role}.md`).match(/^---\n([\s\S]*?)\n---\n/)[1];
    const got = fm.match(/^model: (.+)$/m);
    if (model === undefined) {
      assert.equal(got, null, `.claude/agents/${role}.md names a model that ${ROLE_DIR}/${role}.md does not declare — the rendered copy is not a copy`);
    } else {
      assert.ok(got, `${ROLE_DIR}/${role}.md declares claude.model «${model}» but the rendered .claude/agents/${role}.md carries no model: line — the declaration never reaches the reader`);
      assert.equal(got[1].trim(), model, `.claude/agents/${role}.md says «${got[1].trim()}» where the source says «${model}»`);
    }
  }
});

test('④ 散文の割り当て表と、役ファイルが一致している（両方向）', () => {
  const rule = rd(SKILL);
  const rows = [...rule.matchAll(/^\| `(intmap-[a-z0-9-]+)` \| ([^|]+?) \|/gm)]
    .map(([, role, model]) => [role, model.trim()]);
  assert.ok(rows.length >= declared.size, `${SKILL}'s model table lists ${rows.length} role(s) but ${ROLE_DIR} holds ${declared.size} — a role missing from the table is one an agent delegates to without knowing what it costs`);

  const inTable = new Map();
  for (const [role, cell] of rows) {
    /* the table states either a bare model name in backticks, or 継承 for "same as the parent" */
    const named = cell.match(/^`([a-z]+)`$/);
    inTable.set(role, named ? named[1] : (cell.startsWith('継承') ? undefined : cell));
  }

  for (const [role, model] of declared) {
    assert.ok(inTable.has(role), `${ROLE_DIR}/${role}.md exists but the model table does not list it`);
    assert.equal(inTable.get(role), model, `the model table says ${role} runs on «${inTable.get(role) ?? '継承'}» while ${ROLE_DIR}/${role}.md declares «${model ?? '継承'}» — the table an agent reads and the file the harness reads disagree`);
  }
  for (const role of inTable.keys()) {
    assert.ok(declared.has(role), `the model table names ${role}, which is not a role in ${ROLE_DIR}`);
  }
});

test('⑤ 安い既定を成立させている昇格条件が、呼び手に届く2か所にまだ在る', () => {
  /* The cheap default was made conditional on the caller raising the model for a JUDGING call.
     That condition has to survive in both places a caller actually meets it: the procedure it
     follows, and the role listing the Agent tool puts in front of it. Deleting either one while
     keeping `model: sonnet` turns a conditional saving into an unconditional one. */
  const skill = rd(SKILL);
  assert.ok(/intmap-verifier/.test(skill) && /model: "opus"/.test(skill),
    `${SKILL} no longer tells the caller to raise intmap-verifier for a judging call — the cheap default was made conditional on that escalation, and without it the saving is unconditional`);
  assert.ok(/one-pass-or-a-reason/.test(skill),
    `${SKILL} no longer names the rule the escalation exists for — a later reader would take it for an optional nicety rather than the condition the default depends on`);

  /* the ONE line that reaches a caller who never opened the skill */
  const fm = rd(`${ROLE_DIR}/intmap-verifier.md`).match(/^---\n([\s\S]*?)\n---\n/)[1];
  const desc = fm.match(/^description: (.+)$/m);
  assert.ok(desc, `${ROLE_DIR}/intmap-verifier.md has no description — the Agent tool would list the role with nothing to steer the caller`);
  assert.ok(/model: "opus"/.test(desc[1]),
    '.agents/roles/intmap-verifier.md\'s description no longer carries the escalation — a caller who has not opened the round skill sees a sonnet default and no reason to raise it, which is exactly the observer-lied failure (#R736 / #R742 / #R768) the default is priced against');
});
