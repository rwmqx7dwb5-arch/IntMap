/* ============================================================================
 *  IntMap · the agent context — one source, rendered for every product that reads it
 * ----------------------------------------------------------------------------
 *  AGENTS.md and .agents/ are the provider-neutral source; .claude/ and .codex/ are rendered from
 *  them by scripts/agent-sync.mjs. What is held here: the byte ceiling Codex truncates at (and that
 *  it is measured the same on every checkout), the import line that is Claude Code's only link to
 *  the rules, the roles/skill/hook configuration and the always-on budget, the per-role model
 *  assignment, and that a withdrawn instruction channel (the GPT handoff) stays withdrawn.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r503, r718, r808, r295 (configuration half), r762
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lf, readLF } from '../scripts/eol.mjs';
import { ciRuns } from './helpers/ci-reach.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R503 — was tests/r503-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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

/* The largest file that may stand in for the standing instructions without BEING them is the
   provider-specific half: CLAUDE.md, held under this many characters by ② below. An AGENTS.md no
   longer than that has become a pointer file — a stub. (lean-standing-instructions, 2026-10-10: the
   floor was 12,000 chars, a figure taken from the file's size at the time rather than from what a
   stub is; a rewrite that kept every rule at 11,750 chars tripped it. The NEEDLES below and
   process-standing-rules ②③ are what prove the rules are there; this only catches the stub.) */
const PROVIDER_HALF_MAX = 6000;

test('#R503 ① AGENTS.md is the standing instructions, not a stub', () => {
  const md = read('AGENTS.md');
  /* ⚠ CHARACTERS, not bytes — this file is mostly Japanese, so 32 KB of UTF-8 is about 16 K
     characters. The ceiling above is the byte figure; this is the floor, and confusing the two
     is how a threshold ends up asserting nothing. */
  assert.ok(md.length > PROVIDER_HALF_MAX, `AGENTS.md is ${md.length} chars — no larger than CLAUDE.md may be, so it has been trimmed to a stub`);
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
  assert.ok(md.length < PROVIDER_HALF_MAX,
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
  /* ⚠ THERE WAS A LOCK HERE. Four other files proved their gates by making a fact WRONG on disk,
     running the gate and putting it back — two of those facts live in `.agents/`, whose rendered
     copies this gate compares — and without the lock this test read a tree mid-mutation and
     reported «stale» for a file nobody edited (measured while writing #R503).
     (mutation-tests-off-tree) Those files break private copies of the checkout now
     (tests/helpers/scratch-tree.mjs) and check:static's `tree-writer` refuses a test that writes
     the tree, so there is no mid-mutation tree left to read and nothing to lock against. */
  execFileSync(process.execPath, [at('scripts/agent-sync.mjs')], { cwd: ROOT, stdio: 'pipe' });
  /* ⚠ (#R771) ASK WHAT CI RUNS, NOT HOW ci.yml SPELLS IT. The 28 declared gates stopped being one
     step each when they were split across three machines: scripts/ci-gates.mjs discovers them from
     package.json and runs the bin it planned. Grepping for the name reported this gate as unrun
     while it ran — the check was measuring the workflow's spelling.
     So the planner is EVALUATED, and the workflow is only trusted to reach it on a NON-COMMENT line
     (a sentence about the shard step looks exactly like the shard step — #R628). */
  assert.ok(ciRuns('check:agents'),
    'CI does not run check:agents — a gate only a developer types is not a gate');
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R718 — was tests/r718-agents-doc-size-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R718 — a gate whose verdict depended on which machine ran it
 * ----------------------------------------------------------------------------
 *  `check:agents`' `doc-size` asserts that AGENTS.md fits under the 32,768 bytes
 *  Codex reads before it drops the rest in silence. It measured the bytes of the
 *  file AS CHECKED OUT — and `.gitattributes` pins only the extensions executed
 *  or parsed on Linux to LF, so `*.md` is left to `core.autocrlf` and the same
 *  commit is two different sizes.
 *
 *  MEASURED 2026-09-14 on ea7664a1: 32,718 bytes with LF endings over 465 line
 *  breaks, 33,183 bytes as checked out on the development machine. CI passed with
 *  50 bytes of margin. The file Codex opened on that machine was 415 bytes OVER
 *  and had lost the tail of §12 (本ファイル自体の保守) — the section that tells
 *  every round what to do when this file gets too long. Neither verdict was wrong
 *  about its own runner; a green CI was hiding a truncated rulebook.
 *
 *  Two things are asserted here, and they pull in opposite directions on purpose:
 *
 *    · the measurement is the WORST CASE a conforming checkout can produce, so it
 *      is the same number on Linux and on Windows — and #R283's `lf()` is NOT
 *      applied, because here the carriage return is the subject rather than noise
 *      in front of it. A version of this «fixed» by normalising would be portable
 *      and about nothing anyone reads, so ② asserts the un-normalised direction.
 *    · the margin was regained by MOVING §11.3 out (AGENTS.md §12 says exactly
 *      that: move the 正本, do not raise the number), and a move is only a move
 *      while the clauses are still somewhere a session is sent. ⑥ asserts that
 *      AGENTS.md does not also keep a copy — one fact, one owner.
 * ==========================================================================*/

const at = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const read = (p) => readFileSync(at(p), 'utf8');

const { crlfBytes } = await import('../scripts/eol.mjs');

/* ── ① the same text measures the same on either checkout ───────────────────────────────────── */
test('#R718 ① crlfBytes is a property of the content, not of the checkout', () => {
  const lfText = 'alpha\nbravo\ncharlie\n';
  const crlfText = lfText.split('\n').join('\r\n');

  assert.equal(crlfBytes(lfText), crlfBytes(crlfText),
    'the LF and CRLF spellings of one text measure differently — the verdict still depends on the runner');
  assert.equal(crlfBytes(lfText), Buffer.byteLength(crlfText, 'utf8'),
    'the worst case is not the size of the CRLF checkout, which is the file Codex actually opens');
  assert.ok(crlfBytes(lfText) >= Buffer.byteLength(lfText, 'utf8'),
    'the worst case came out SMALLER than the LF checkout — a bound that is not a bound');

  /* multi-byte text: the carriage returns are counted on top of UTF-8 bytes, not of characters */
  const ja = '作業終了処理\nUSB バックアップ\n';
  assert.equal(crlfBytes(ja), Buffer.byteLength(ja.split('\n').join('\r\n'), 'utf8'),
    'the count is wrong for non-ASCII text — AGENTS.md is almost entirely non-ASCII');
});

/* ── ② it must NOT normalise, which is how this would be «fixed» wrongly ─────────────────────── */
test('#R718 ② the carriage return is counted, not normalised away', () => {
  /* ⚠ This is the assertion that stops the obvious wrong fix. scripts/eol.mjs exists because a
     check is about content and line endings belong to the checkout (#R283); applying `lf()` here
     WOULD make the verdict portable, and it would answer «would this fit if the file were stored
     differently?» while the reader on a CRLF machine still loses the tail. */
  const text = 'a\nb\nc\n';
  assert.notEqual(crlfBytes(text), Buffer.byteLength(text, 'utf8'),
    'crlfBytes returned the LF size — the measurement normalised the subject away');
  assert.equal(crlfBytes(text) - Buffer.byteLength(text, 'utf8'), 3,
    'one byte per line break is what a CRLF checkout adds; this counted a different number');

  /* a text with no line break at all has no carriage returns to gain */
  assert.equal(crlfBytes('no newline here'), 15);
});

/* ── ③ the file that shipped over the ceiling is now judged over it ─────────────────────────── */
test('#R718 ③ the measured ea7664a1 shape fails, though its LF size passed', () => {
  const CEILING = 32768;
  /* the exact shape measured 2026-09-14: 32,718 bytes of text over 465 line breaks */
  const lfBytes = 32718, breaks = 465;
  const doc = 'x'.repeat(lfBytes - breaks) + '\n'.repeat(breaks);
  assert.equal(Buffer.byteLength(doc, 'utf8'), lfBytes, 'the reconstruction is not the measured size');

  assert.ok(Buffer.byteLength(doc, 'utf8') < CEILING,
    'the LF size was UNDER the ceiling — that is why CI was green, and the premise of this round');
  assert.equal(crlfBytes(doc), 33183,
    'the worst case of the measured file is not the 33,183 bytes this machine holds');
  assert.ok(crlfBytes(doc) >= CEILING,
    'the file that had lost the tail of §12 on this machine would still pass — the gate learnt nothing');
});

/* ── ④ the gate is WIRED to it, asserted by running the gate ────────────────────────────────── */
test('#R718 ④ check:agents reports the worst case for the shipped AGENTS.md', async () => {
  /* ⚠⚠⚠ (#R766) THE TREE LOCK, AND WHY THIS TEST NEEDS IT TOO. This runs the WHOLE gate, and
     four other files prove their own gates by making a fact WRONG on disk, running the gate and
     putting it back — two of those facts live in `.agents/`, whose rendered copies this gate
     compares. tests/r503-checks.test.mjs ⑤ runs the same gate and already takes this lock, with
     the reason written beside it; this one did not, so it read the tree mid-mutation.
     MEASURED on CI run 35171903243: `stale: .claude/agents/intmap-verifier.md is not what
     .agents/ renders to` — for a file nobody had edited. The same commit, re-checked out with
     CI's own LF bytes, renders 13/13 matching copies, and `--write` has nothing to do. The
     verdict was a property of the RUNNER's concurrency, not of the tree
     ([[intmap-gate-verdict-must-not-depend-on-the-runner]]).
     ⚠ The lock wrapped the whole body rather than the `execFileSync` alone: the assertions below
     read AGENTS.md again, and a gate verdict compared against a file that moved in between is
     the same defect one line later.
     ⚠⚠ (mutation-tests-off-tree) AND NOW NOTHING MOVES IT. The mutation tests break private copies
     of the checkout (tests/helpers/scratch-tree.mjs), so this reads a tree no test writes. */
  {
  /* ⚠ EVALUATED, NOT READ. A test that greps agent-sync.mjs for the word `crlfBytes` passes on a
     file that imports it and never calls it (#R505). So run the gate and read the number out. */
  /* ⚠ AND ITS MUTATION IS A LINUX-SIDE ONE, WHICH IS THE POINT. On a CRLF checkout the bytes on
     disk and the worst case are the same number BY DEFINITION, so no assertion here can tell a
     gate that reads the file's own bytes from one that computes the bound. VERIFIED #R718 by
     re-punctuating AGENTS.md to LF (a Linux checkout) and running this file: intact → green,
     `bytes = disk` → red. The bug hid on the runner where it was green; the test catches it on
     the runner where it is visible, which is the same one. */
  const out = execFileSync(process.execPath, [at('scripts/agent-sync.mjs')], { encoding: 'utf8' });
  const m = out.match(/doc-size: AGENTS\.md (\d+)\/(\d+) bytes/);
  assert.ok(m, `check:agents printed no doc-size verdict:\n${out}`);

  const want = crlfBytes(read('AGENTS.md'));
  assert.equal(Number(m[1]), want,
    'the gate is reporting some other size than the worst case — on a CRLF runner this is the same'
    + ' number by coincidence, and on Linux it is the one that let a truncated file through');
  /* ⚠ AND STRICTLY MORE THAN THE LF SIZE, which is the half that discriminates on EITHER platform.
     Comparing against `want` alone cannot catch a gate that went back to reading the checkout's
     bytes while the checkout happens to be CRLF — and the Linux runner, where that bug was green,
     is exactly the one where the two numbers differ. This inequality is false for any
     implementation that measures LF bytes, on any machine. */
  const lfSize = Buffer.byteLength(read('AGENTS.md').split('\r\n').join('\n'), 'utf8');
  assert.ok(Number(m[1]) > lfSize,
    `the gate reported ${m[1]} bytes, which is the LF size (${lfSize}) — it is measuring a checkout`
    + ' that stores no carriage returns, and that is the verdict CI gave while §12 was truncated');

  assert.equal(Number(m[2]), 32768, 'the ceiling moved; Codex reads 32,768 bytes by default');
  assert.ok(want < 32768, `AGENTS.md is ${want} bytes on a CRLF checkout — Codex would drop the tail`);

  /* and the bound has to actually bound the file this checkout holds */
  assert.ok(readFileSync(at('AGENTS.md')).length <= want,
    'this checkout is LARGER than the "worst case" — the measurement is not an upper bound');
  }
});

/* ── ⑤ the margin was regained by moving, not by raising the number ─────────────────────────── */
test('#R718 ⑤ the ceiling is still 32,768 everywhere it is written down', () => {
  /* AGENTS.md §12 and docs/AGENT-SETUP.md both state the number; the fix for a full file is to
     move a section out, and a later round reading either document must not find a bigger one. */
  for (const f of ['AGENTS.md', 'docs/AGENT-SETUP.md', 'docs/TESTING.md']) {
    assert.match(read(f), /32,?768/,
      `${f} no longer states the byte ceiling — the number Codex enforces has no owner there`);
  }
  /* ⚠ (tests regrouped by subject) A source read, on purpose: the subject is the SENTENCE the gate
     prints when AGENTS.md is too big, and printing it takes an AGENTS.md over 32,768 bytes in the real
     tree — agent-sync.mjs reads the tree its own location names and exports nothing. */
  assert.match(read('scripts/agent-sync.mjs'), /do not raise this number/,
    'the failure message stopped telling the next round to move a section instead');
});

/* ── ⑥ §11.3 moved — it did not get copied, and it did not vanish ───────────────────────────── */
test('#R718 ⑥ the backup invariants have exactly one owner, and AGENTS.md reaches it', () => {
  const agents = read('AGENTS.md');
  const setup = read('docs/AGENT-SETUP.md');

  assert.match(setup, /^## 10\. USB バックアップのスクリプトが守っていること/m,
    'docs/AGENT-SETUP.md §10 is gone — the invariants moved out of AGENTS.md into nothing');
  assert.match(agents, /^### 11\.3 /m, 'AGENTS.md §11.3 disappeared entirely; §10 points at §11.x by number');

  /* the pointer has to be reachable prose, not a deleted section */
  const pointer = agents.slice(agents.indexOf('### 11.3 '), agents.indexOf('### 11.4 '));
  assert.ok(pointer.includes('docs/AGENT-SETUP.md'),
    'AGENTS.md §11.3 no longer names where the invariants went — a session reading it is sent nowhere');

  /* ⚠ AND NOT A SECOND COPY. The whole reason for the move is the byte ceiling; a round that
     "restores" a clause into AGENTS.md gets the bytes back AND a second 正本 to drift (§9). */
  for (const clause of ['SHA-256', 'ボリュームラベル', 'リポジトリに無いものは USB からも削除']) {
    assert.ok(setup.includes(clause), `docs/AGENT-SETUP.md §10 lost the clause 「${clause}」`);
    assert.ok(!pointer.includes(clause),
      `AGENTS.md §11.3 keeps a copy of 「${clause}」 — the fact now has two owners and the bytes are back`);
  }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R787 — was tests/r808-subagent-model-tiers-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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

test('#R787 ① 宣言されたモデル名は、それを書き出す当人が受け付ける綴りである', () => {
  /* The vocabulary is read from the renderer rather than repeated, so the two cannot drift.
     A name outside it is written into the frontmatter and then ignored without a word.
     (tests regrouped by subject) Read out of the source because that is the only place it exists:
     scripts/agent-sync.mjs runs at import over the tree its location names and exports nothing. */
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

test('#R787 ② Codex 側の生成物にモデルのキーが漏れていない（読み手が居ないキーを作らない）', () => {
  for (const role of declared.keys()) {
    const toml = rd(`.codex/agents/${role}.toml`);
    assert.equal(/^\s*model\s*=/m.test(toml), false, `.codex/agents/${role}.toml carries a model key — Codex reads this file as a config layer whose model the account chooses, so the key would have no reader`);
  }
});

test('#R787 ③ 生成された frontmatter が、正本と同じことを述べている', () => {
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

test('#R787 ④ 散文の割り当て表と、役ファイルが一致している（両方向）', () => {
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

test('#R787 ⑤ 安い既定を成立させている昇格条件が、呼び手に届く2か所にまだ在る', () => {
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R295 — was tests/r295-checks.test.mjs (part)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · #R295 source checks — the standing operating configuration
 * ----------------------------------------------------------------------------
 *  「今後、このIntMapリポジトリで新しいClaude Codeセッションを開始した場合、セッションに関係なく、
 *    私が普通に自然言語で開発要求を出すだけで、Claude自身が可能な限り高速・安全・高品質に作業を
 *    進める状態にしてください。」「私にworktree、subagent、agent設定などの手動管理を要求しない。」
 *
 *  #R295 put that state into the official mechanisms: ONE always-on rule
 *  (.agents/rules/execution-strategy.md), five subagents (.claude/agents/), one skill
 *  (.claude/skills/intmap-round/), a SessionStart hook, and scripts/worktree.mjs.
 *
 *  This file measures the configuration, because a configuration is a set of CLAIMS ABOUT THE
 *  REPOSITORY and every one of them can go stale silently (#R278: 規則を文章で書いたら、その規則を
 *  測る検査を同じラウンドで書く):
 *
 *    · a command named in a rule but deleted from scripts/ still READS correctly — §③/§④
 *    · an agent whose `name` stops matching its filename is simply never delegated to — §①
 *    · the always-on rule is context every session pays for, so it has a CEILING — §⑥
 *    · a checks file that is not in `test:checks` is green for ever (#R260 ⑥) — §⑧
 *    · a merge into settings.json that silently drops the pre-existing deny rule — §⑤
 *
 *  ⚠ CONTENT ASSERTIONS NORMALISE LINE ENDINGS (#R283). core.autocrlf=true locally, LF in CI.
 *  ⚠ COMMENTS ARE STRIPPED BEFORE SEARCHING EXECUTABLE FILES. This round's own prose quotes the
 *    things it forbids, and a check that reads its own explanation has now happened 19 times.
 * ==========================================================================*/

const read = (p) => readLF(resolve(ROOT, p));

const AGENT_DIR = resolve(ROOT, '.claude/agents');
const SKILL_DIR = resolve(ROOT, '.claude/skills');
const RULE = '.agents/rules/execution-strategy.md';

/** The YAML front matter of a markdown file, as a flat map. ⚠ takes TEXT, not a path. */
function frontmatter(text) {
  const m = lf(text).match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/* ── ① THE SUBAGENTS ARE ADDRESSABLE ────────────────────────────────────────────────────────────
   A subagent is selected by `name`, and the main session only ever sees `name` + `description`.
   A file whose name disagrees with its filename, or whose description is empty, is a definition
   that exists on disk and is never reachable — the #R291 shape (exported, called zero times). */
test('#R295 ① every .claude/agents/*.md is a well-formed, addressable subagent', () => {
  assert.ok(existsSync(AGENT_DIR), '.claude/agents/ is gone');
  const files = readdirSync(AGENT_DIR).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 5, `expected at least 5 subagents, found ${files.length}`);

  for (const f of files) {
    const fm = frontmatter(readFileSync(join(AGENT_DIR, f), 'utf8'));
    assert.ok(fm, `${f}: no YAML front matter`);
    assert.equal(fm.name, basename(f, '.md'), `${f}: front-matter name must equal the filename`);
    assert.ok((fm.description || '').length >= 40,
      `${f}: description is what the main session delegates on — it cannot be a label`);
    /* ⚠ NOT `isolation: worktree`. The harness puts those under <repo>/.claude/worktrees, which is
       INSIDE OneDrive — #R282 measured 611 MB / 11,615 files being synced from there. IntMap
       isolates through scripts/worktree.mjs, which builds outside OneDrive. */
    assert.notEqual(fm.isolation, 'worktree',
      `${f}: isolation:worktree builds inside OneDrive (#R282) — use scripts/worktree.mjs`);
  }

  /* The five roles the rule and the skill both name. A renamed file silently stops being used. */
  const have = new Set(files.map((f) => basename(f, '.md')));
  for (const n of ['intmap-scout', 'intmap-verifier', 'intmap-i18n', 'intmap-implementer', 'intmap-prod-verifier'])
    assert.ok(have.has(n), `.claude/agents/${n}.md is missing`);
});

/* ── ② THE SKILL IS INVOCABLE ──────────────────────────────────────────────────────────────────
   The command name comes from the DIRECTORY, and the body is loaded only when it is invoked —
   which is the whole reason the round procedure lives there instead of in AGENTS.md. */
test('#R295 ② .claude/skills/*/SKILL.md is well-formed', () => {
  assert.ok(existsSync(SKILL_DIR), '.claude/skills/ is gone');
  const dirs = readdirSync(SKILL_DIR).filter((d) => statSync(join(SKILL_DIR, d)).isDirectory());
  assert.ok(dirs.includes('intmap-round'), '.claude/skills/intmap-round/ is missing');

  for (const d of dirs) {
    const p = join(SKILL_DIR, d, 'SKILL.md');
    assert.ok(existsSync(p), `${d}/SKILL.md is missing (the file must be named SKILL.md)`);
    const fm = frontmatter(readFileSync(p, 'utf8'));
    assert.ok(fm, `${d}/SKILL.md: no YAML front matter`);
    assert.ok((fm.description || '').length >= 40, `${d}/SKILL.md: description drives auto-invocation`);
  }
});

/* ── ③ EVERY SCRIPT THE CONFIGURATION NAMES EXISTS ─────────────────────────────────────────────
   The rule, the skill and the agents are prose that tells a future session which commands to run.
   Prose does not break when the command is renamed; this does. */
test('#R295 ③ every `node scripts/…` named in the configuration exists', () => {
  const sources = [RULE, '.claude/skills/intmap-round/SKILL.md', 'AGENTS.md',
    ...readdirSync(AGENT_DIR).filter((f) => f.endsWith('.md')).map((f) => '.claude/agents/' + f)];
  let named = 0;
  for (const src of sources) {
    for (const m of read(src).matchAll(/node\s+(scripts\/[A-Za-z0-9._-]+\.mjs)/g)) {
      named++;
      assert.ok(existsSync(resolve(ROOT, m[1])), `${src} names ${m[1]}, which does not exist`);
    }
  }
  /* ⚠ COUNT THE POPULATION (#R272). A regex that matches nothing passes silently. */
  assert.ok(named >= 6, `only ${named} script references were found — the sweep is not reaching them`);
});

/* ── ④ EVERY `npm run …` NAMED IN THE CONFIGURATION EXISTS ─────────────────────────────────────
   ⚠ package.json is read AS JSON. Its `//check:*` notes are prose that names the same commands,
   so a raw-text search would find the note rather than the script (the #R282 ⑥ trap). */
test('#R295 ④ every `npm run …` named in the configuration is a real script', () => {
  const pkg = JSON.parse(read('package.json'));
  const sources = [RULE, '.claude/skills/intmap-round/SKILL.md',
    ...readdirSync(AGENT_DIR).filter((f) => f.endsWith('.md')).map((f) => '.claude/agents/' + f)];
  let named = 0;
  for (const src of sources) {
    const text = read(src);
    /* ⚠ THE PROSE CONTAINS PLACEHOLDERS, AND A PLACEHOLDER IS NOT A SCRIPT NAME. `npm run check:*`
       reads as the family of gates; taking it literally asked package.json for a script called
       `check`, which of course does not exist. Wildcards and `<…>` slots are skipped, and §④ then
       counts what is left so the skipping cannot quietly empty the population (#R272). */
    for (const m of text.matchAll(/npm run ([a-z0-9:._*<>-]+)/g)) {
      if (/[*<>]/.test(m[1])) continue;
      const name = m[1].replace(/[.:]+$/, '');
      named++;
      assert.ok(Object.hasOwn(pkg.scripts, name),
        `${src} says \`npm run ${name}\`, which package.json does not define`);
    }
    /* `npm test` has no name to look up, but it must still exist. */
    if (/\bnpm test\b/.test(text)) assert.ok(pkg.scripts.test, 'package.json has no `test` script');
  }
  assert.ok(named >= 8, `only ${named} npm-run references were found — the sweep is not reaching them`);
});

/* ── ⑤ settings.json WAS MERGED, NOT OVERWRITTEN ───────────────────────────────────────────────
   The defect: a round that rewrites this file to add hooks is exactly how permissions that
   predate it disappear without anybody noticing. Until #R762 the witness was the GPT-handoff deny
   rule; that protocol was withdrawn with the rest of the handoff bridge, so the witness is now the
   allow list itself — the IntMap gates that every round runs unprompted. Both halves of the file
   must survive a round that only meant to touch one of them. */
test('#R295 ⑤ .claude/settings.json keeps its pre-existing permissions and wires the hook', () => {
  const s = JSON.parse(read('.claude/settings.json'));
  const allow = s.permissions?.allow || [];
  assert.ok(allow.length >= 4, `permissions.allow holds ${allow.length} entries — a rewrite emptied it`);
  assert.ok(allow.some((a) => a.includes('scripts/worktree.mjs')),
    'the worktree.mjs allow rule was dropped — every round would start by asking for it');

  const entries = s.hooks?.SessionStart || [];
  const cmds = entries.flatMap((e) => (e.hooks || []).map((h) => h.command || ''));
  assert.ok(cmds.length, 'no SessionStart hook: a session no longer learns where it is');
  for (const c of cmds) {
    const m = c.match(/(scripts\/[A-Za-z0-9._-]+\.mjs)/);
    assert.ok(m, `SessionStart hook runs \`${c}\`, which names no script in scripts/`);
    assert.ok(existsSync(resolve(ROOT, m[1])), `SessionStart hook runs ${m[1]}, which does not exist`);
  }
});

/* ── ⑥ THE ALWAYS-ON RULE HAS A CEILING ────────────────────────────────────────────────────────
   .agents/rules/*.md is loaded into EVERY session, exactly like AGENTS.md — so moving text there
   does not make it cheaper, it only moves it. The instruction for this round was
   「AGENTS.mdを巨大化させないでください」, and the honest reading of that is a budget on the
   always-on set, not a budget on one file. Same mechanism as scripts/test-budget.mjs: a number
   that only ever goes DOWN. Lower it when a round makes the rule shorter; never raise it. */
test('#R295 ⑥ the always-on instruction set stays under its ceiling', () => {
  const CEILING = 6144;                       // bytes, per rule file
  const dir = resolve(ROOT, '.agents/rules');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const n = Buffer.byteLength(readLF(join(dir, f)), 'utf8');
    assert.ok(n <= CEILING,
      `.agents/rules/${f} is ${n} bytes — every session pays for it. Move detail into an agent or a skill.`);
  }
});

/* ── ⑨ THE STANDING INSTRUCTIONS POINT AT THE CONFIGURATION ────────────────────────────────────
   The rule, the agents and the skill are only reachable if AGENTS.md and the document index say
   they exist. ⚠ read as CONTENT (line endings normalised), and AGENTS.md is prose, so no comment
   stripping applies here — but the assertion is deliberately about the LINK, not about a sentence
   that could be reworded. */
test('#R295 ⑨ AGENTS.md and docs/README.md point at the operating configuration', () => {
  const claude = read('AGENTS.md');
  assert.ok(claude.includes(RULE), `AGENTS.md does not link ${RULE}`);
  assert.ok(/intmap-round/.test(claude), 'AGENTS.md does not name the /intmap-round skill');
  assert.ok(/scripts\/worktree\.mjs/.test(claude), 'AGENTS.md does not name scripts/worktree.mjs');

  /* (#R503) the index points at the SOURCES under `.agents/`, not at the per-product copies
     rendered from them — a reader sent to a generated file would edit the copy and lose it. */
  const idx = read('docs/README.md');
  for (const needle of [RULE, '.agents/skills/intmap-round/SKILL.md', '.agents/roles/'])
    assert.ok(idx.includes(needle), `docs/README.md does not list ${needle}`);
});

/* ── ⑩ THE ROUND PROCEDURE IS NOT COPIED INTO THE ALWAYS-ON SET ────────────────────────────────
   One fact, one owner (AGENTS.md §9). The step-by-step commands belong to the skill; the rule
   points at it. If the rule ever grows its own copy of the workflow the two will drift, and the
   always-on half is the one that will be read. */
test('#R295 ⑩ the always-on rule delegates the procedure rather than restating it', () => {
  const rule = read(RULE);
  assert.ok(/intmap-round/.test(rule), 'the rule must point at the skill that owns the procedure');
  for (const owned of ['gh pr create', 'gh pr merge', 'backup-usb.ps1', 'supabase functions deploy'])
    assert.ok(!rule.includes(owned),
      `${RULE} restates \`${owned}\`, which the /intmap-round skill owns — one fact, one owner`);
});

/* ── ⑮ ADDING A SIXTH SUBAGENT CANNOT SILENTLY STALE THE TWO ROSTERS ───────────────────────────
   `AGENTS.md` §2 and `docs/README.md` both spell the five roles out. `scripts/doc-facts.mjs`
   builds its DOCS list from the repository root and docs/ ONLY (see its readdirSync calls), so
   `.claude/**` is outside the sweep that enforces 「同じ事実を2か所に書くな」 — dropping a sixth
   file into .claude/agents/ would leave both rosters wrong with every gate still green. That is
   the #R280 shape: 一覧に無いものは、その一覧では落ちようがない.
   ⚠ MEASURED, NOT ASSUMED: the direction that goes stale is agents → prose, so the sweep is over
   the DIRECTORY and the documents are asked about each name found there. */
test('#R295 ⑮ every subagent on disk is named in both rosters', () => {
  const names = readdirSync(AGENT_DIR).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md'));
  assert.ok(names.length >= 5, 'the agent directory is empty — this check has no subject');
  const claude = read('AGENTS.md');
  const idx = read('docs/README.md');
  for (const n of names) {
    /* The rosters use the short role name (「scout（全数調査）」), not the file name. */
    const role = n.replace(/^intmap-/, '');
    assert.ok(claude.includes(role), `AGENTS.md's roster does not mention "${role}" (.claude/agents/${n}.md)`);
    assert.ok(idx.includes(role), `docs/README.md's roster does not mention "${role}" (.claude/agents/${n}.md)`);
  }
});

/* ── ⑯ THE VERIFICATION LADDER HAS EXACTLY ONE OWNER ───────────────────────────────────────────
   R295's first draft stated the stage table three times — in the rule, in intmap-verifier.md and
   in the skill — while the rule was declared the 正本 by AGENTS.md and docs/README.md. An audit
   of the round found it; this is the gate so the next round cannot re-introduce it.
   The signature of the table is a STAGE NUMBER BOUND TO A COMMAND (「段 3」 beside `npm test`,
   「段0」 beside `node --test`). One file may carry that; the others must link. */
test('#R295 ⑯ only one file binds a stage number to a command', () => {
  const candidates = [RULE, '.claude/skills/intmap-round/SKILL.md',
    ...readdirSync(AGENT_DIR).filter((f) => f.endsWith('.md')).map((f) => '.claude/agents/' + f)];
  const carriers = [];
  for (const f of candidates) {
    const text = read(f);
    /* Two shapes count as carrying the table, and the first draft of this check only had the
       second — so it matched NOTHING, not even the owner, because in the owner's markdown table
       the word 段 is a column HEADER and the numbers live in later rows. A signature that cannot
       match the thing it is protecting proves nothing (#R272). */
    const asTable = /\|\s*段\s*\|/.test(text);
    const asLine = /段\s*[0-9０-９][^\n]{0,80}(npm |node |npx )|(npm |node |npx )[^\n]{0,80}段\s*[0-9０-９]/.test(text);
    if (asTable || asLine) carriers.push(f);
  }
  assert.ok(carriers.length, 'no file carries the stage table at all — the signature matches nothing');
  assert.deepEqual(carriers, [RULE],
    `the stage→command table must live only in ${RULE}; these also bind stages to commands: ${carriers.join(', ')}`);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R762 — was tests/r762-handoff-removal-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* R762 — the GPT handoff bridge is withdrawn, and stays withdrawn.
 *
 *  What it was: ChatGPT wrote implementation intent into GitHub issue #225, `handoff-inbox.mjs`
 *  imported those events into a local `GPT-HANDOFF/HANDOFF.md`, `handoff.mjs` turned that file
 *  into the agent's to-do list at the start of every round, and a local button UI recorded the
 *  user's verification. The user asked for the whole path to be removed (2026-09-17).
 *
 *  Why a check and not just a deletion: a withdrawn mechanism comes back one reference at a time —
 *  a script that still runs `handoff.mjs`, a rule file that still tells the agent to read HANDOFF,
 *  an index row pointing at a file that no longer exists. The defect this guards is not "those
 *  seven files exist again" but "something in the repository still instructs an agent to take work
 *  from that channel". So it measures the instruction surface (what an agent is told to read and
 *  run), not a list of filenames — the tracked prose and code, minus the files that RECORD the
 *  withdrawal (see below), because a record of it MUST keep saying what used to be true.
 */

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });

/* Three files RECORD the withdrawal rather than instruct anybody to use the channel, and all three
   must keep naming it: the round records (a round record's job is to keep saying what used to be
   true), docs/TESTING.md (it describes what each test measures — it is a catalogue of tests, never
   a workflow an agent is told to run), and this file. Everything else — AGENTS.md, CLAUDE.md,
   .agents/, .claude/, .codex/, scripts/, package.json, docs/README.md, docs/AGENT-SETUP.md — is
   instruction surface and is measured. */
/* (2026-09-25) the round records are one file per entry under dev-notes/ now (scripts/dev-notes.mjs) */
/* (tests regrouped by subject) «this file» is read off import.meta.url rather than spelled, so the
   exemption follows the file through any rename. */
const SELF = relative(ROOT, fileURLToPath(import.meta.url)).split(sep).join('/');
const RECORDS_THE_WITHDRAWAL = new RegExp(
  '^(DEV-NOTES\\.md|DEV-NOTES-ARCHIVE\\.md|dev-notes/[^/]+\\.md|docs/TESTING\\.md|'
  + SELF.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')$');

/* The channel had four names. A revival would have to spell at least one of them. Kept as source
   text because git grep (fast, tracked-files-only, binary-skipping) and the JS engine in ③ must be
   given the SAME needle — two spellings of one rule is the defect .agents/rules forbids. */
const NEEDLE_SRC = 'GPT-HANDOFF|CHATGPT-HANDOFF|HANDOFF-REVIEW|handoff[-.](mjs|inbox|self-test)'
  + '|INTMAP_HANDOFF|intmap-handoff|INTMAP-HANDOFF-EVENT|gpt-handoff';

/** Every line in the tracked instruction surface (prose + code) that names the channel. */
function namesTheChannel() {
  let out = '';
  try {
    out = git('grep', '-nIE', NEEDLE_SRC, '--',
      '*.md', '*.mjs', '*.js', '*.json', '*.toml', '*.yml', '*.yaml', '*.cmd', '*.ps1');
  } catch (e) {
    if (e.status === 1) return [];            /* git grep exits 1 when nothing matches */
    throw e;
  }
  return out.split(/\r?\n/).filter(Boolean)
    .filter((l) => !RECORDS_THE_WITHDRAWAL.test(l.slice(0, l.indexOf(':'))))
    .map((l) => l.slice(0, 140));
}

test('#R762 ① the handoff bridge’s own files are gone', () => {
  for (const f of [
    'scripts/handoff.mjs',
    'scripts/handoff-inbox.mjs',
    '.agents/rules/gpt-handoff.md',
    'CHATGPT-HANDOFF.md',
    'HANDOFF-REVIEW.cmd',
    '.github/workflows/handoff-self-test.yml',
  ]) {
    assert.ok(!existsSync(resolve(ROOT, f)), `${f} is back — the withdrawn bridge has a file again`);
  }
});

test('#R762 ② nothing still tells an agent to take work from that channel', () => {
  const hits = namesTheChannel();
  assert.deepEqual(hits, [],
    `the GPT handoff channel is still named in the instruction surface:\n  ${hits.join('\n  ')}`);
});

test('#R762 ③ the needle would actually catch a revival', () => {
  /* ② passing means nothing unless the needle matches the text it is supposed to find. These are
     the exact lines this round deleted, quoted from the diff. */
  const NEEDLE = new RegExp(NEEDLE_SRC);
  for (const line of [
    '@.agents/rules/gpt-handoff.md',
    '- `node scripts/handoff.mjs init` → `node scripts/handoff-inbox.mjs pull`',
    '      "Edit(GPT-HANDOFF/HANDOFF.md)"',
    'GPT-HANDOFF/',
    "process.env.INTMAP_HANDOFF_STATE_DIR || path.join(homedir(), '.intmap-handoff'),",
    '<!-- INTMAP-HANDOFF-EVENT v=1 action=upsert task=IM-20260821-001 -->',
    '| [`../CHATGPT-HANDOFF.md`](../CHATGPT-HANDOFF.md) | ChatGPT 側の会話 |',
  ]) {
    assert.ok(NEEDLE.test(line), `the needle does not match a line this round removed: ${line}`);
  }
});

test('#R762 ④ codex-setup names only the directories that still exist outside a workspace', () => {
  /* The handoff cursor directory was one of three writable_roots. Dropping it must drop the count
     it is described by, or the prose and the code disagree the moment somebody reads either. */
  /* (tests regrouped by subject) EVALUATED, not read. This counted the lines of the OUTSIDE_ROOTS
     literal that mention `path.` or MEMORY — a spelling a reformat changes and a third entry spelled
     some other way passes. What the list is FOR is what `--apply` writes, so the real script is run
     against a throw-away CODEX_HOME / HOME and the written writable_roots is read back: exactly the
     memory store and the worktree root, nothing handoff-shaped, and the count its own report states. */
  const home = mkdtempSync(join(tmpdir(), 'r762-codex-'));
  try {
    writeFileSync(join(home, 'config.toml'), 'model = "x"\n');
    const env = { ...process.env, CODEX_HOME: home, HOME: home, USERPROFILE: home };
    const setup = (...a) => execFileSync(process.execPath, [resolve(ROOT, 'scripts/codex-setup.mjs'), ...a], { cwd: ROOT, encoding: 'utf8', env });
    setup('--apply');
    const toml = readFileSync(join(home, 'config.toml'), 'utf8');
    const m = /^\s*writable_roots\s*=\s*(\[[^\]]*\])/m.exec(toml);
    assert.ok(m, '--apply wrote no writable_roots — the list has no reader');
    const roots = JSON.parse(m[1]).map((p) => resolve(p).toLowerCase());
    const memory = execFileSync(process.execPath, [resolve(ROOT, 'scripts/agent-memory.mjs'), '--path'], { cwd: ROOT, encoding: 'utf8', env }).trim();
    assert.deepEqual(roots.sort(), [dirname(memory), join(tmpdir(), 'intmap-worktrees')].map((p) => resolve(p).toLowerCase()).sort(),
      `writable_roots is ${m[1]}; #R762 left the memory store and the worktree root`);
    assert.ok(!roots.some((p) => /handoff/.test(p)), 'a handoff directory is still a writable root');
    const row = JSON.parse(setup('--json')).rows.find((r) => r.name === 'sandbox.writable_roots');
    assert.ok(row && new RegExp(`${roots.length}\\s*件`).test(row.detail),
      `the report does not state the count it writes (${roots.length}): ${row && row.detail}`);
  } finally { rmSync(home, { recursive: true, force: true }); }
  /* ⚠ The header comment is prose, so it is read: it once said four directories follow the checkout. */
  const src = readFileSync(resolve(ROOT, 'scripts/codex-setup.mjs'), 'utf8');
  assert.ok(!/four follow it/.test(src),
    'the header still says four directories follow the checkout — the handoff state was one of them');
});
}
