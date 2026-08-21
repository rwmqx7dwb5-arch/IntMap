/* ============================================================================
 *  IntMap · #R295 source checks — the standing operating configuration
 * ----------------------------------------------------------------------------
 *  「今後、このIntMapリポジトリで新しいClaude Codeセッションを開始した場合、セッションに関係なく、
 *    私が普通に自然言語で開発要求を出すだけで、Claude自身が可能な限り高速・安全・高品質に作業を
 *    進める状態にしてください。」「私にworktree、subagent、agent設定などの手動管理を要求しない。」
 *
 *  #R295 put that state into the official mechanisms: ONE always-on rule
 *  (.claude/rules/execution-strategy.md), five subagents (.claude/agents/), one skill
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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readLF, lf } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const AGENT_DIR = resolve(ROOT, '.claude/agents');
const SKILL_DIR = resolve(ROOT, '.claude/skills');
const RULE = '.claude/rules/execution-strategy.md';

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
   which is the whole reason the round procedure lives there instead of in CLAUDE.md. */
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
  const sources = [RULE, '.claude/skills/intmap-round/SKILL.md', 'CLAUDE.md',
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
   The deny rule predates this round and belongs to the GPT handoff protocol: Claude must never
   edit GPT-HANDOFF/HANDOFF.md. A round that rewrites this file to add hooks is exactly how a rule
   like that disappears without anybody noticing. */
test('#R295 ⑤ .claude/settings.json keeps the pre-existing deny rule and wires the hook', () => {
  const s = JSON.parse(read('.claude/settings.json'));
  assert.ok(s.permissions?.deny?.includes('Edit(GPT-HANDOFF/HANDOFF.md)'),
    'the GPT-handoff deny rule was dropped — .claude/rules/gpt-handoff.md depends on it');

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
   .claude/rules/*.md is loaded into EVERY session, exactly like CLAUDE.md — so moving text there
   does not make it cheaper, it only moves it. The instruction for this round was
   「CLAUDE.mdを巨大化させないでください」, and the honest reading of that is a budget on the
   always-on set, not a budget on one file. Same mechanism as scripts/test-budget.mjs: a number
   that only ever goes DOWN. Lower it when a round makes the rule shorter; never raise it. */
test('#R295 ⑥ the always-on instruction set stays under its ceiling', () => {
  const CEILING = 6144;                       // bytes, per rule file
  const dir = resolve(ROOT, '.claude/rules');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const n = Buffer.byteLength(readLF(join(dir, f)), 'utf8');
    assert.ok(n <= CEILING,
      `.claude/rules/${f} is ${n} bytes — every session pays for it. Move detail into an agent or a skill.`);
  }
});

/* ── ⑦ THE FREE ROUND NUMBER LOOKS AT THE BRANCHES, NOT ONLY AT THE NOTES ──────────────────────
   The round number was taken three times (#R288, #R289 and once before), each costing a rebase and
   30+ renumbered references, and every one of those collisions had the same cause: the number was
   chosen by reading DEV-NOTES.md — which says what has MERGED — while another session already held
   `feat/r<N>-…`. So the property under test is not «it prints a number», it is «the number it
   prints is larger than everything anyone has claimed anywhere». */
test('#R295 ⑦ scripts/worktree.mjs offers a round number nobody has claimed', () => {
  const out = execFileSync(process.execPath, [resolve(ROOT, 'scripts/worktree.mjs'), 'status'],
    { cwd: ROOT, encoding: 'utf8' });
  const offered = +(out.match(/空きラウンド番号\s+R(\d+)/) || [])[1];
  assert.ok(Number.isFinite(offered), 'status did not print a free round number');

  const claimed = new Set();
  for (const m of read('DEV-NOTES.md').matchAll(/#R(\d{2,4})\b/g)) claimed.add(+m[1]);
  assert.ok(claimed.size, 'DEV-NOTES.md yielded no round numbers — the sweep is not reaching it');
  try {
    const branches = execFileSync('git', ['branch', '-a', '--format=%(refname:short)'],
      { cwd: ROOT, encoding: 'utf8' });
    for (const m of branches.matchAll(/\br(\d{2,4})-/gi) ) claimed.add(+m[1]);
  } catch { /* a checkout without refs still has the notes to answer from */ }

  const highest = Math.max(...claimed);
  assert.ok(offered > highest,
    `worktree.mjs offers R${offered} but R${highest} is already claimed somewhere`);
});

/* ── ⑧ THIS FILE IS ACTUALLY RUN ───────────────────────────────────────────────────────────────
   #R260 ⑥ found this the hard way: a per-round checks file that nobody added to `test:checks` is
   green for ever, because it never runs. */
test('#R295 ⑧ tests/r295-checks.test.mjs is in the test:checks list', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['test:checks'], /tests\/r295-checks\.test\.mjs/);
});

/* ── ⑨ THE STANDING INSTRUCTIONS POINT AT THE CONFIGURATION ────────────────────────────────────
   The rule, the agents and the skill are only reachable if CLAUDE.md and the document index say
   they exist. ⚠ read as CONTENT (line endings normalised), and CLAUDE.md is prose, so no comment
   stripping applies here — but the assertion is deliberately about the LINK, not about a sentence
   that could be reworded. */
test('#R295 ⑨ CLAUDE.md and docs/README.md point at the operating configuration', () => {
  const claude = read('CLAUDE.md');
  assert.ok(claude.includes(RULE), `CLAUDE.md does not link ${RULE}`);
  assert.ok(/intmap-round/.test(claude), 'CLAUDE.md does not name the /intmap-round skill');
  assert.ok(/scripts\/worktree\.mjs/.test(claude), 'CLAUDE.md does not name scripts/worktree.mjs');

  const idx = read('docs/README.md');
  for (const needle of [RULE, '.claude/skills/intmap-round/SKILL.md', '.claude/agents/'])
    assert.ok(idx.includes(needle), `docs/README.md does not list ${needle}`);
});

/* ── ⑩ THE ROUND PROCEDURE IS NOT COPIED INTO THE ALWAYS-ON SET ────────────────────────────────
   One fact, one owner (CLAUDE.md §9). The step-by-step commands belong to the skill; the rule
   points at it. If the rule ever grows its own copy of the workflow the two will drift, and the
   always-on half is the one that will be read. */
test('#R295 ⑩ the always-on rule delegates the procedure rather than restating it', () => {
  const rule = read(RULE);
  assert.ok(/intmap-round/.test(rule), 'the rule must point at the skill that owns the procedure');
  for (const owned of ['gh pr create', 'gh pr merge', 'backup-usb.ps1', 'supabase functions deploy'])
    assert.ok(!rule.includes(owned),
      `${RULE} restates \`${owned}\`, which the /intmap-round skill owns — one fact, one owner`);
});

/* ── ⑪ worktree.mjs BUILDS OUTSIDE OneDrive ────────────────────────────────────────────────────
   The whole point of the script is CLAUDE.md §6: the master is «main, at origin/main», and work
   happens elsewhere. ⚠ comments stripped first — the banner above the code quotes OneDrive by
   name while explaining why the code must not. */
test('#R295 ⑪ scripts/worktree.mjs derives the master and builds outside it', () => {
  const src = codeOnly(read('scripts/worktree.mjs'));
  assert.match(src, /rev-parse['"\s,\]]*.*--git-common-dir/s,
    'the master must be DERIVED (git rev-parse --git-common-dir), never hard-coded (#R282)');
  assert.ok(!/OneDrive/.test(src), 'scripts/worktree.mjs hard-codes OneDrive in executable code');
  assert.match(src, /tmpdir\(\)/, 'worktrees must be created outside OneDrive (CLAUDE.md §6)');
  /* ⚠ `-D` IS PERMITTED, BUT ONLY BEHIND THE TREE COMPARISON. The first draft of this check simply
     banned `-D`, and it was right until CLAUDE.md §5's squash merge made `-d` refuse every finished
     round (see §⑭). The honest assertion is not «never force-delete» but «never force-delete
     something main does not already contain», so what is measured is the GUARD, not the verb. */
  const forced = src.indexOf("'branch', '-D'");
  if (forced > 0) {
    const guard = src.indexOf('sameTree');
    assert.ok(guard > 0 && guard < forced,
      "`git branch -D` is not guarded by the origin/main tree comparison — it could discard work");
    assert.match(src, /'diff',\s*'--quiet',\s*'origin\/main'/,
      'the guard must compare against origin/main, not against a local ref that may be stale');
  }
  assert.match(src, /'branch',\s*'-d'/, 'the safe delete is gone — every removal would be forced');
});

/* ── ⑫ `done` FINISHES THE JOB EVEN WHEN `git worktree remove` PARTIALLY FAILS ─────────────────
   Measured on this machine while writing #R295: `git worktree remove` deletes the checkout and
   drops the entry from `worktree list`, but cannot delete the bookkeeping directory under the
   master's .git/worktrees/ — the master's .git is in OneDrive, which holds those files open
   («Permission denied»; there are ~95 orphaned admin directories there already). The first
   version treated that error as total failure and exited before deleting the branch, so the run
   left BOTH an orphaned admin directory and a live branch.

   ⚠ WHAT THIS PROVES, EXACTLY: the happy path — worktree gone, branch gone, exit 0 — against a
   REAL repository, not a mock. It does NOT prove the partial-failure recovery: the fixture lives
   on the temp disk, where `git worktree remove` succeeds outright, so the recovery branch is never
   entered. That was measured, not assumed — reinstating the bug here left this test green, which
   is precisely the shape #R274 ③ warns about. §⑬ is the one that fails when the bug comes back. */
test('#R295 ⑫ worktree.mjs done removes the worktree and its branch, and exits 0', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-r295-'));
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = join(tmp, 'origin');
    mkdirSync(origin);
    g(['init', '-q', '-b', 'main'], origin);
    g(['config', 'user.email', 'r295@test'], origin);
    g(['config', 'user.name', 'r295'], origin);
    mkdirSync(join(origin, 'scripts'));
    cpSync(resolve(ROOT, 'scripts/worktree.mjs'), join(origin, 'scripts/worktree.mjs'));
    writeFileSync(join(origin, 'DEV-NOTES.md'), '- **#R100** seed\n');
    g(['add', '-A'], origin);
    g(['commit', '-qm', 'seed'], origin);

    const wt = join(tmp, 'wt-r101-x');
    g(['worktree', 'add', '-q', '-b', 'feat/r101-x', wt, 'main'], origin);
    assert.match(g(['worktree', 'list'], origin), /wt-r101-x/, 'fixture worktree was not created');

    const r = execFileSync(process.execPath, [join(wt, 'scripts/worktree.mjs'), 'done'],
      { cwd: tmp, encoding: 'utf8' });
    assert.match(r, /worktree を削除/);
    assert.ok(!/wt-r101-x/.test(g(['worktree', 'list'], origin)), 'the worktree is still listed');
    assert.ok(!/feat\/r101-x/.test(g(['branch', '--list', 'feat/r101-x'], origin)),
      'the branch survived — the #R295 partial-failure bug is back');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

/* ── ⑬ THE VERDICT ON REMOVAL COMES FROM THE LIST, NOT FROM THE ERROR ──────────────────────────
   The bug §⑫ cannot reach: on this machine `git worktree remove` deletes the checkout and drops
   the entry from `worktree list`, then fails to delete the bookkeeping directory under the
   master's .git/worktrees/ because OneDrive holds it open. Treating that error as the verdict
   aborts the run with the worktree already gone and the branch still alive.

   So the invariant is structural and can be read: after the remove attempt the script must PRUNE
   and then ASK THE LIST, and the only `process.exit(1)` on that path must be guarded by the
   list's answer. ⚠ comments stripped first — the explanation above quotes what the code must not
   do (「自分の検査が自分のコメントに当たる」, 19 times). */
test('#R295 ⑬ `done` decides by re-reading the worktree list, not by the remove error', () => {
  const src = codeOnly(read('scripts/worktree.mjs'));
  const from = src.indexOf("'worktree', 'remove'");
  assert.ok(from > 0, 'the removal call is gone — this check no longer has a subject');
  const after = src.slice(from);

  assert.match(after, /'worktree',\s*'prune'/,
    'nothing prunes the orphaned admin directory after a partial removal');
  assert.match(after, /'worktree',\s*'list'/,
    'the script never re-reads the list, so it cannot tell a partial failure from a real one');

  /* The catch around the removal must record the error, not end the run. */
  const catchBlock = (after.match(/catch\s*\([^)]*\)\s*\{[\s\S]{0,200}?\}/) || [''])[0];
  assert.ok(!/process\.exit/.test(catchBlock),
    'the catch around `worktree remove` exits — a partial failure would strand the branch (#R295)');

  /* …and the exit that does exist must be downstream of the list's answer. */
  const guard = after.indexOf('stillListed');
  const exit = after.indexOf('process.exit(1)');
  assert.ok(guard > 0 && exit > guard, 'the failure exit is not guarded by the list re-read');
});

/* ── ⑭ A SQUASH-MERGED BRANCH IS CLEANED UP; A DIVERGENT ONE IS NOT ────────────────────────────
   CLAUDE.md §5 merges every round with `--squash`, so the branch's commits never become ancestors
   of main and `git branch -d` calls EVERY finished round «unmerged». A cleanup step that refuses
   in the normal case is a cleanup step nobody uses, and the branches accumulate.
   The replacement asks whether the branch still carries anything main lacks, by comparing trees.
   ⚠ BOTH DIRECTIONS ARE PROVED HERE, because a comparison that answers «identical» to everything
   is exactly how this would be «fixed» by weakening it (#R283's rule). */
test('#R295 ⑭ done deletes a squash-merged branch but keeps one that still has work', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-r295s-'));
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = join(tmp, 'origin');
    mkdirSync(origin);
    g(['init', '-q', '-b', 'main'], origin);
    g(['config', 'user.email', 'r295@test'], origin);
    g(['config', 'user.name', 'r295'], origin);
    mkdirSync(join(origin, 'scripts'));
    cpSync(resolve(ROOT, 'scripts/worktree.mjs'), join(origin, 'scripts/worktree.mjs'));
    writeFileSync(join(origin, 'DEV-NOTES.md'), '- **#R100** seed\n');
    g(['add', '-A'], origin); g(['commit', '-qm', 'seed'], origin);

    /* A branch with a real commit, then main gets the SAME content as one squashed commit —
       which is what `gh pr merge --squash` leaves behind. */
    g(['worktree', 'add', '-q', '-b', 'feat/r101-squashed', join(tmp, 'wt-a'), 'main'], origin);
    writeFileSync(join(tmp, 'wt-a', 'feature.txt'), 'work\n');
    g(['add', '-A'], join(tmp, 'wt-a')); g(['commit', '-qm', 'work'], join(tmp, 'wt-a'));
    writeFileSync(join(origin, 'feature.txt'), 'work\n');
    g(['add', '-A'], origin); g(['commit', '-qm', 'squashed (#1)'], origin);
    /* `done` compares against origin/main, so the fixture needs that ref to exist. */
    g(['update-ref', 'refs/remotes/origin/main', 'main'], origin);

    const outA = execFileSync(process.execPath, [join(tmp, 'wt-a', 'scripts/worktree.mjs'), 'done'],
      { cwd: tmp, encoding: 'utf8' });
    assert.match(outA, /squash merge 済み/, 'the squash-merged branch was not recognised');
    assert.equal(g(['branch', '--list', 'feat/r101-squashed'], origin).trim(), '',
      'a squash-merged branch was left behind — every round would leave one');

    /* …and one that still carries work main does not have must SURVIVE. */
    g(['worktree', 'add', '-q', '-b', 'feat/r102-live', join(tmp, 'wt-b'), 'main'], origin);
    writeFileSync(join(tmp, 'wt-b', 'unmerged.txt'), 'not in main\n');
    g(['add', '-A'], join(tmp, 'wt-b')); g(['commit', '-qm', 'later work'], join(tmp, 'wt-b'));

    const outB = execFileSync(process.execPath, [join(tmp, 'wt-b', 'scripts/worktree.mjs'), 'done'],
      { cwd: tmp, encoding: 'utf8' });
    assert.match(outB, /残した/, 'a branch with unmerged work was not reported as kept');
    assert.match(g(['branch', '--list', 'feat/r102-live'], origin), /feat\/r102-live/,
      'unmerged work was deleted — the safety rule is gone');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

/* ── ⑮ ADDING A SIXTH SUBAGENT CANNOT SILENTLY STALE THE TWO ROSTERS ───────────────────────────
   `CLAUDE.md` §2 and `docs/README.md` both spell the five roles out. `scripts/doc-facts.mjs`
   builds its DOCS list from the repository root and docs/ ONLY (see its readdirSync calls), so
   `.claude/**` is outside the sweep that enforces 「同じ事実を2か所に書くな」 — dropping a sixth
   file into .claude/agents/ would leave both rosters wrong with every gate still green. That is
   the #R280 shape: 一覧に無いものは、その一覧では落ちようがない.
   ⚠ MEASURED, NOT ASSUMED: the direction that goes stale is agents → prose, so the sweep is over
   the DIRECTORY and the documents are asked about each name found there. */
test('#R295 ⑮ every subagent on disk is named in both rosters', () => {
  const names = readdirSync(AGENT_DIR).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md'));
  assert.ok(names.length >= 5, 'the agent directory is empty — this check has no subject');
  const claude = read('CLAUDE.md');
  const idx = read('docs/README.md');
  for (const n of names) {
    /* The rosters use the short role name (「scout（全数調査）」), not the file name. */
    const role = n.replace(/^intmap-/, '');
    assert.ok(claude.includes(role), `CLAUDE.md's roster does not mention "${role}" (.claude/agents/${n}.md)`);
    assert.ok(idx.includes(role), `docs/README.md's roster does not mention "${role}" (.claude/agents/${n}.md)`);
  }
});

/* ── ⑯ THE VERIFICATION LADDER HAS EXACTLY ONE OWNER ───────────────────────────────────────────
   R295's first draft stated the stage table three times — in the rule, in intmap-verifier.md and
   in the skill — while the rule was declared the 正本 by CLAUDE.md and docs/README.md. An audit
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
