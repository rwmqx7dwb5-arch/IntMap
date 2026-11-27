/* tests/codex-addendum-drift-checks.test.mjs — a hand-written list of a discovered set is judged against the set
 *
 *  MEASURED 2026-11-28: `.codex/config.toml` (the Codex addendum, hand-written) listed three of the five
 *  `.agents/rules/` files for two months. `check:agents` was green the whole time: the rendered copies are
 *  re-rendered from `.agents/`, and nothing compared the prose of the addendum to the directory. The gate
 *  `addendum-sets` (scripts/agent-sync.mjs) now does. EVALUATED, NOT READ: agent-sync.mjs runs over the tree
 *  its own location names, so the mutation runs on a copy of the agent context, never on this checkout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* the files agent-sync.mjs reads, copied as they are; node_modules is linked (js-yaml) */
const copyContext = () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-addendum-'));
  for (const p of ['AGENTS.md', 'CLAUDE.md', 'docs/AGENT-SETUP.md', '.agents', '.claude/agents', '.claude/skills', '.claude/settings.json', '.codex',
    'scripts/agent-sync.mjs', 'scripts/eol.mjs']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  return dir;
};
/* ⚠ the link goes first: a recursive delete must never get a chance to walk into the shared node_modules */
const cleanup = (dir) => { unlinkSync(join(dir, 'node_modules')); rmSync(dir, { recursive: true, force: true }); };
const run = (dir) => spawnSync(process.execPath, [join(dir, 'scripts/agent-sync.mjs')], { cwd: dir, encoding: 'utf8' });

test('a line that lists some of .agents/rules and not all of them fails check:agents', () => {
  const dir = copyContext();
  try {
    assert.equal(run(dir).status, 0, 'the copied agent context should pass before it is mutated');
    const rules = readdirSync(join(dir, '.agents/rules')).filter((f) => f.endsWith('.md')).sort();
    assert.ok(rules.length >= 3, 'the mutation needs at least three rule files to list a strict subset of two');
    const toml = join(dir, '.codex/config.toml');
    const partial = rules.slice(0, 2).map((r) => `\`${r}\``).join('・');
    writeFileSync(toml, readFileSync(toml, 'utf8').replace("developer_instructions = '''\n", `developer_instructions = '''\n規則は ${partial}。\n`));
    const res = run(dir);
    assert.notEqual(res.status, 0, 'a partial list of the rules passed check:agents');
    assert.match(res.stdout + res.stderr, /addendum-sets: \.codex\/config\.toml:\d+ lists 2 of the/);
  } finally {
    cleanup(dir);
  }
});

test('a single mention in passing is a reference, not a list', () => {
  const dir = copyContext();
  try {
    const rule = readdirSync(join(dir, '.agents/rules')).find((f) => f.endsWith('.md'));
    const toml = join(dir, '.codex/config.toml');
    writeFileSync(toml, readFileSync(toml, 'utf8').replace("developer_instructions = '''\n", `developer_instructions = '''\n詳しくは \`${rule}\` §1。\n`));
    assert.equal(run(dir).status, 0, 'one mention of one rule was judged as an incomplete list');
  } finally {
    cleanup(dir);
  }
});
