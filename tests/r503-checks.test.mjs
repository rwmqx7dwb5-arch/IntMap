/*  #R503 — the agent context is one source, read by two products.
 *
 *  The defect: everything that tells a session how to work on IntMap lived in files only
 *  Claude Code reads — CLAUDE.md, .claude/rules/, .claude/skills/, .claude/agents/. Opened with
 *  Codex, the same repository handed over NOTHING: no standing instructions, no execution
 *  strategy, no round procedure, no roles. The obvious repair — copy each file and rename the
 *  product inside it — was attempted first and produced a second 33 KB rulebook pointing at
 *  `~/.Codex/projects/…` and `.Codex/rules/…`, paths that do not exist, with every rule now
 *  written down twice and free to drift. AGENTS.md §9 has a word for that: 正本が2つある状態.
 *
 *  So the source is provider-neutral (`AGENTS.md`, `.agents/`) and the per-product files are
 *  RENDERED from it. These tests hold the three joints that can come apart silently:
 *
 *    ① the byte ceiling Codex truncates AGENTS.md at, WITHOUT SAYING SO (measured, below)
 *    ② the single `@AGENTS.md` line that is the only thing connecting Claude Code to the rules
 *    ③ TOML tables swallowing the keys written after them — measured while writing .codex/
 *
 *  ⚠ ① and ③ are both failures that LOOK LIKE SUCCESS. Codex loaded a 36 KB AGENTS.md and
 *    answered from its first row while denying its last one existed; and `developer_instructions`
 *    written after `[agents]` did not become a top-level setting, it became a custom agent role
 *    named "developer_instructions". Neither prints a warning anywhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => join(ROOT, p);
const read = (p) => readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n');   /* line-ending agnostic (#R283) */

/* ── ① the ceiling Codex truncates at ──────────────────────────────────────────────────────
   MEASURED #R503 with codex-cli 0.150.0-alpha.12.2: an AGENTS.md of 36,095 bytes was asked for a
   row written at the TOP (answered) and a row written at the BOTTOM (reported absent). The limit
   is `project_doc_max_bytes`, default 32,768. `.codex/config.toml` raises it — but that layer is
   read only in a TRUSTED project, and trust is recorded per PATH while AGENTS.md §6 gives every
   round a fresh worktree. The number that is always in force is therefore the DEFAULT. */
test('#R503 ① AGENTS.md fits inside the budget Codex always applies', () => {
  const bytes = statSync(at('AGENTS.md')).size;
  assert.ok(bytes < 32768,
    `AGENTS.md is ${bytes} bytes. Codex reads the first 32768 and drops the rest with no warning — `
    + 'move a section to docs/AGENT-SETUP.md, .agents/rules/ or the round skill instead of raising this.');
});

test('#R503 ① AGENTS.md is the standing instructions, not a stub', () => {
  const md = read('AGENTS.md');
  /* ⚠ CHARACTERS, not bytes — this file is mostly Japanese, so 32 KB of UTF-8 is about 16 K
     characters. The ceiling above is the byte figure; this is the floor, and confusing the two
     is how a threshold ends up asserting nothing. */
  assert.ok(md.length > 12000, `AGENTS.md is ${md.length} chars — it has been trimmed to a stub`);
  /* the sections a session actually acts on; §11 and §12 are the ones a truncation eats first */
  for (const needle of ['## 1. 着手前に必ず確認するもの', '## 5. ワークフロー', '## 11. 作業終了処理', '## 12. 本ファイル自体の保守']) {
    assert.ok(md.includes(needle), `AGENTS.md lost ${JSON.stringify(needle)}`);
  }
});

/* ── ② the one line that connects Claude Code to the rules ─────────────────────────────────
   Claude Code reads CLAUDE.md and never AGENTS.md. If the import goes, nothing errors: every
   session simply starts without standing instructions, which is indistinguishable from a session
   that has them until it does the wrong thing. ⚠ The needle must be BARE — Claude Code skips
   imports inside code spans and fenced blocks, so a backticked `@AGENTS.md` is exactly the
   spelling that does not load. */
const bareImports = (md) => md
  .replace(/```[\s\S]*?```/g, '')
  .replace(/`[^`\n]*`/g, '')
  .split('\n')
  .flatMap((l) => [...l.matchAll(/(?:^|\s)@([^\s]+)/g)].map((m) => m[1]));

test('#R503 ② CLAUDE.md imports AGENTS.md and every rule file, outside code spans', () => {
  const imports = bareImports(read('CLAUDE.md'));
  assert.ok(imports.includes('AGENTS.md'),
    `CLAUDE.md has no bare @AGENTS.md import (found: ${JSON.stringify(imports)}) — a Claude Code session would start with no standing instructions`);
  for (const f of readdirSync(at('.agents/rules')).filter((f) => f.endsWith('.md'))) {
    assert.ok(imports.includes(`.agents/rules/${f}`),
      `CLAUDE.md does not import .agents/rules/${f} — Claude Code would never load it (Codex reaches it through AGENTS.md §1)`);
  }
});

test('#R503 ② CLAUDE.md stays provider-specific — it does not become a second rulebook', () => {
  const md = read('CLAUDE.md');
  assert.ok(md.length < 6000,
    `CLAUDE.md is ${md.length} chars. It is the Claude-Code-only half; anything both products need belongs in AGENTS.md (§9 — 正本を2つ作らない)`);
});

/* ── ③ TOML tables swallow everything written after them ───────────────────────────────────
   MEASURED #R503: `.codex/config.toml` was written with `developer_instructions` AFTER `[agents]`.
   TOML put the key INSIDE that table, so Codex read it as a custom agent role named
   "developer_instructions" and refused to start:
       Error loading config.toml: invalid type: string "…", expected struct AgentRoleToml in `agents`
   The failure was loud there. It is not loud in general — a scalar landing in the wrong table is
   usually just a setting that silently does nothing. */
const keysBeforeFirstTable = (toml) => {
  const out = new Set();
  let inBlock = false;
  for (const line of toml.split('\n')) {
    const q = (line.match(/'''/g) || []).length;
    if (inBlock) { if (q % 2) inBlock = false; continue; }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (q % 2) { if (m) out.add(m[1]); inBlock = true; continue; }
    if (/^\s*\[/.test(line)) break;                    /* the first table opens — stop here */
    if (m) out.add(m[1]);
  }
  return out;
};

test('#R503 ③ every setting meant to be top-level is written before the first table', () => {
  /* ⚠ A key written AFTER a table header belongs to that table — correct TOML, and the reason
     this cannot be a blanket rule. These are the keys that must not be swallowed by one. */
  const top = keysBeforeFirstTable(read('.codex/config.toml'));
  for (const k of ['project_doc_max_bytes', 'developer_instructions']) {
    assert.ok(top.has(k),
      `.codex/config.toml writes ${k} after a [table] header, so TOML puts it inside that table. `
      + 'MEASURED #R503: developer_instructions written after [agents] was read as a custom agent '
      + 'role and Codex refused to start — «expected struct AgentRoleToml in `agents`».');
  }
  for (const f of readdirSync(at('.codex/agents')).filter((n) => n.endsWith('.toml'))) {
    const keys = keysBeforeFirstTable(read(`.codex/agents/${f}`));
    for (const k of ['name', 'description', 'developer_instructions']) {
      assert.ok(keys.has(k), `.codex/agents/${f} writes ${k} after a [table] header — Codex would not read it as a role field`);
    }
  }
});

test('#R503 ③ every Codex role file carries the three fields Codex requires', () => {
  const files = readdirSync(at('.codex/agents')).filter((f) => f.endsWith('.toml'));
  assert.ok(files.length >= 5, `only ${files.length} Codex role file(s) — the five roles are the whole point`);
  for (const f of files) {
    const body = read(`.codex/agents/${f}`);
    for (const key of ['name', 'description', 'developer_instructions']) {
      assert.match(body, new RegExp(`^${key}\\s*=`, 'm'), `.codex/agents/${f} has no ${key} — Codex requires all three`);
    }
    const name = body.match(/^name\s*=\s*'([^']*)'/m)?.[1];
    assert.equal(name, f.replace(/\.toml$/, ''),
      `.codex/agents/${f} declares name «${name}» — Codex identifies the agent by the field, so a mismatch is a role nobody can spawn by its filename`);
  }
});

/* ── ④ the two products end up with the same five roles and the same procedure ────────────── */
test('#R503 ④ the roles exist once as a source and once per product', () => {
  const src = readdirSync(at('.agents/roles')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
  assert.deepEqual(src, ['intmap-i18n', 'intmap-implementer', 'intmap-prod-verifier', 'intmap-scout', 'intmap-verifier']);
  const claude = readdirSync(at('.claude/agents')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
  const codex = readdirSync(at('.codex/agents')).filter((f) => f.endsWith('.toml')).map((f) => f.replace(/\.toml$/, '')).sort();
  assert.deepEqual(claude, src, 'Claude Code and the source disagree about which roles exist');
  assert.deepEqual(codex, src, 'Codex and the source disagree about which roles exist');
});

test('#R503 ④ the round procedure reaches both products from one file', () => {
  assert.ok(existsSync(at('.agents/skills/intmap-round/SKILL.md')), 'the source skill is gone');
  assert.ok(existsSync(at('.claude/skills/intmap-round/SKILL.md')), 'Claude Code reads only .claude/skills/ — the rendered copy is gone');
  assert.equal(read('.claude/skills/intmap-round/SKILL.md'), read('.agents/skills/intmap-round/SKILL.md'),
    'the rendered skill has drifted from its source — run `node scripts/agent-sync.mjs --write`');
});

/* ── ⑤ the renderer is the only thing allowed to write the copies ─────────────────────────── */
test('#R503 ⑤ check:agents is clean, and it is what CI runs', async () => {
  /* ⚠ THE LOCK. Four other files prove their gates by making a fact WRONG on disk, running the
     gate and putting it back — and two of those facts now live in `.agents/`, whose rendered
     copies this gate compares. Without the lock this test reads a tree mid-mutation and reports
     «stale» for a file nobody edited (measured while writing this round). */
  await withTreeLock(() => {
    execFileSync(process.execPath, [at('scripts/agent-sync.mjs')], { cwd: ROOT, stdio: 'pipe' });
  });
  assert.match(read('.github/workflows/ci.yml'), /npm run check:agents/,
    'ci.yml no longer runs check:agents — a gate only a developer types is not a gate');
});

test('#R503 ⑤ every rendered file says it is generated', () => {
  const rendered = [
    ...readdirSync(at('.claude/agents')).map((f) => `.claude/agents/${f}`),
    ...readdirSync(at('.codex/agents')).map((f) => `.codex/agents/${f}`),
  ];
  for (const f of rendered) {
    assert.match(read(f), /生成物。編集しない/,
      `${f} does not warn that it is generated — the next reader edits the copy and loses the edit`);
  }
});

/* ── ⑥ nothing secret travelled into the tracked half ─────────────────────────────────────── */
test('#R503 ⑥ the agent context carries no credential', () => {
  const files = ['AGENTS.md', 'CLAUDE.md', 'docs/AGENT-SETUP.md', '.codex/config.toml', '.codex/hooks.json',
    ...readdirSync(at('.agents/roles')).map((f) => `.agents/roles/${f}`),
    ...readdirSync(at('.agents/rules')).map((f) => `.agents/rules/${f}`)];
  /* the local file is where they live; naming it is correct, quoting it is not */
  for (const f of files) {
    const body = read(f);
    assert.ok(!/@gmail\.com/.test(body), `${f} contains an account address — CLAUDE.local.md is the only place for that (AGENTS.md §2)`);
    assert.ok(!/[Pp]assword\s*[:：]\s*\S/.test(body), `${f} contains a password field`);
  }
});

/* ── ⑦ the map between the two products is reachable ──────────────────────────────────────── */
test('#R503 ⑦ docs/AGENT-SETUP.md exists and is indexed', () => {
  assert.ok(existsSync(at('docs/AGENT-SETUP.md')), 'docs/AGENT-SETUP.md is gone — the wiring between the two products is undocumented');
  assert.match(read('docs/README.md'), /AGENT-SETUP\.md/, 'docs/README.md does not index docs/AGENT-SETUP.md');
  /* the manual steps are the part a reader cannot derive: say them out loud */
  const setup = read('docs/AGENT-SETUP.md');
  for (const needle of ['/hooks', 'model_reasoning_effort', 'trust']) {
    assert.ok(setup.includes(needle), `docs/AGENT-SETUP.md no longer mentions ${needle} — that is one of the steps that stayed manual`);
  }
});
