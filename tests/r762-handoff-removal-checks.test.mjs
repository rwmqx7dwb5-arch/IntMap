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
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });

/* Three files RECORD the withdrawal rather than instruct anybody to use the channel, and all three
   must keep naming it: the round records (a round record's job is to keep saying what used to be
   true), docs/TESTING.md (it describes what each test measures — it is a catalogue of tests, never
   a workflow an agent is told to run), and this file. Everything else — AGENTS.md, CLAUDE.md,
   .agents/, .claude/, .codex/, scripts/, package.json, docs/README.md, docs/AGENT-SETUP.md — is
   instruction surface and is measured. */
const RECORDS_THE_WITHDRAWAL =
  /^(DEV-NOTES\.md|DEV-NOTES-ARCHIVE\.md|docs\/TESTING\.md|tests\/r762-handoff-removal-checks\.test\.mjs)$/;

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
  const src = readFileSync(resolve(ROOT, 'scripts/codex-setup.mjs'), 'utf8');
  const block = src.match(/const OUTSIDE_ROOTS = \[([\s\S]*?)\];/);
  assert.ok(block, 'OUTSIDE_ROOTS is no longer a literal array — this check cannot see it');
  const entries = block[1].split(/\r?\n/).filter((l) => /path\.|MEMORY/.test(l));
  assert.equal(entries.length, 2,
    `OUTSIDE_ROOTS holds ${entries.length} entries; #R762 left the memory store and the worktree root`);
  assert.ok(!/four follow it/.test(src),
    'the header still says four directories follow the checkout — the handoff state was one of them');
});
