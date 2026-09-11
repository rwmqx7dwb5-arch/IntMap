#!/usr/bin/env node
/*  scripts/agent-memory.mjs — ONE memory, two products.  (#R696)
 *
 *  「Codexでもシームレスで快適に、断絶感、他人感ゼロでできるようにして。」
 *
 *  MEASURED when that was asked: Codex's own store (`~/.codex/memories_1.sqlite`) held ZERO rows
 *  mentioning IntMap, while the Claude-side directory held 429 files and a 43 KB index. Every
 *  trap this repository has paid for — the geocoder that took the first hit unchecked (#R515),
 *  the CSS selector that a wrapper killed in silence (#R488), the gate that read its own comment
 *  (#R293) — was knowledge one product had and the other did not. That is not a settings
 *  difference the user can feel as «a different model»; it is the whole of it.
 *
 *  AGENTS.md §1 answered this with «write what you learn in BOTH stores». That is the shape §9
 *  of the same file forbids everywhere else: one fact, two copies, drifting. So there is one
 *  store, and this script is how the product that does not own it reads and writes it.
 *
 *  ⚠ THE PATH IS DERIVED, NEVER HARD-CODED (.agents/rules/no-ad-hoc-hardcoding.md). Claude Code
 *  keys its per-project state by the MASTER working directory with every non-alphanumeric byte
 *  turned into «-» — `C:\Users\gyuuk\OneDrive\IntMap` becomes `C--Users-gyuuk-OneDrive-IntMap`.
 *  The master is found the way master-sync.mjs finds it (`git rev-parse --git-common-dir`, whose
 *  parent IS the master), so this resolves to the SAME directory from every worktree, and it
 *  follows the checkout if it ever moves.
 *
 *  ⚠ IT NEVER CUTS IN SILENCE (#R694: a fixed window is a length, not a relevance). With
 *  --budget it prints how many characters it dropped and where the rest is, and the pointer to
 *  the file comes FIRST so that a host which truncates further still leaves a way back.
 *
 *      node scripts/agent-memory.mjs            # the pointer + the index (what SessionStart shows)
 *      node scripts/agent-memory.mjs --path     # the memory directory, nothing else
 *      node scripts/agent-memory.mjs --budget N # cut to N characters, saying what was cut
 *      node scripts/agent-memory.mjs --check    # is the index still short enough to be LOADED whole
 *
 *  ⚠ THE BINDING CEILING IS NOT THIS SCRIPT'S BUDGET (#R703). The product that owns the store
 *  reads MEMORY.md by itself, with its own limit, and when the index passes it the TAIL IS
 *  DROPPED with a warning only that session sees. The index has overflowed three times now
 *  (#R236, #R548, and the session that opened #R703), and each time the fix was to repack it —
 *  which is why it came back: nothing was measuring the index against the limit that actually
 *  cuts it. --check does, and SessionStart runs it in both products.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const valueOf = (f) => { const i = ARGS.indexOf(f); return i < 0 ? null : ARGS[i + 1]; };

/* The master working directory — the same derivation master-sync.mjs uses, for the same reason. */
const master = () => {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return common ? path.resolve(path.dirname(common)) : null;
  } catch { return null; }
};

/* Claude Code's project key: the absolute path with every non-alphanumeric byte replaced by «-». */
export const projectKey = (dir) => dir.replace(/[^A-Za-z0-9]/g, '-');

export const memoryDir = (dir = master()) =>
  dir ? path.join(homedir(), '.claude', 'projects', projectKey(dir), 'memory') : null;

/* ── how long the index may be before the host stops loading all of it ──────────────────────
   OBSERVED 2026-09-11: a Claude Code session opened with a 25,710-character MEMORY.md and was
   told «MEMORY.md is 25.1KB (limit: 24.4KB) — Only part of it was loaded.» 25710/1024 = 25.10,
   so the host counts CHARACTERS in units of 1024 and stops at 24.4 of them. The number kept
   here is therefore the host's own pair, not a guess at its internals.
   EXPIRES IF: the host changes that limit (the warning states it — if it ever disagrees with
   this constant, the warning is right and this is stale) or a second product starts
   auto-loading the index with a lower one.
   CANONICAL: here. Nothing else may carry the number — docs cite this file (#R500). */
export const INDEX_CEILING_KB = 24.4;
export const INDEX_CEILING = Math.floor(INDEX_CEILING_KB * 1024);

/* ⚠ Reports the measurement whether or not it is over (#R699: a needle that matches nothing
   prints green, and «no overflow» must not be the same output as «never looked»). */
export const indexVerdict = (chars) => ({
  chars,
  ceiling: INDEX_CEILING,
  over: chars > INDEX_CEILING,
  margin: INDEX_CEILING - chars,
});

/* ⚠ Importable: the rules above are what the gate measures, so the CLI must not run on import. */
const isCLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCLI) {
  const DIR = memoryDir();
  if (has('--path')) { console.log(DIR ?? ''); process.exit(DIR ? 0 : 1); }

  if (!DIR) { console.log('agent-memory: not inside a git repository — no memory directory to resolve.'); process.exit(0); }

  const INDEX = path.join(DIR, 'MEMORY.md');

  /* ⚠ Not finding it is a SENTENCE, not an empty output (#R589). «Nothing was printed» cannot tell
     a session apart from «this machine has no memory yet», and the second one is normal. */
  if (!existsSync(INDEX)) {
    console.log(`IntMap · 蓄積メモリ: ${DIR} に MEMORY.md が無い（このマシンではまだ空か、別の場所にある）。`);
    console.log('新しく学んだことは、そのディレクトリを作って 1 事実 1 ファイルで書く（AGENTS.md §1）。');
    process.exit(0);
  }

  /* ⚠ --check は「超えているか」ではなく「何文字か」を毎回述べる。超えていないことと、
     一度も測っていないことを、同じ出力にしない（#R699）。 */
  if (has('--check')) {
    /* 正規化しない——ホストが読み込むのはファイルそのもので、実測 25,710 文字が 25.1KB と
       報告された（1KB = 1024 文字）。ここで改行を畳むと、報告された数と別のものを測る。 */
    const v = indexVerdict(readFileSync(INDEX, 'utf8').length);
    const n = (x) => x.toLocaleString('en-US');
    if (v.over) {
      console.log(`IntMap · 蓄積メモリの索引 ${n(v.chars)} / ${n(v.ceiling)} 文字  ⚠ ${n(-v.margin)} 文字の超過`);
      console.log(`  この超過ぶんは読み込まれない——索引の末尾から無言で落ちる（実体の .md は 1 本も消えていない）。`);
      console.log(`  直し方: 古い側の行を「思い出す鍵」だけに詰める。実体は消さない。  ${INDEX}`);
    } else if (v.margin < 1000) {
      console.log(`IntMap · 蓄積メモリの索引 ${n(v.chars)} / ${n(v.ceiling)} 文字（余白 ${n(v.margin)}）  ⚠ まもなく末尾が落ち始める`);
    } else {
      console.log(`IntMap · 蓄積メモリの索引 ${n(v.chars)} / ${n(v.ceiling)} 文字（余白 ${n(v.margin)}）`);
    }
    /* ⚠ 0 で終える。これは門ではなく、セッションが起動時に受け取る観測であって、
       ここで非 0 を返すと「起動に失敗した」という別の意味になる（npm test 側が門を持つ）。 */
    process.exit(0);
  }

  const files = readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md');
  const body = readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

  /* The pointer goes first, so that whatever a host does to the length, the way back survives. */
  const head = [
    `IntMap · 蓄積メモリ（Claude Code と共有・正本は 1 つ）`,
    `  索引  ${INDEX}`,
    `  実体  ${files.length} 本（${DIR}）`,
    `  ⚠ 索引は「思い出す鍵」であって全文ではない。鍵が当たったら、その .md を開いて読む。`,
    `  ⚠ 学んだことは同じ場所に同じ形式で書き、MEMORY.md に 1 行足す（AGENTS.md §1）。`,
    `     ラウンド番号でファイル名を作らない——主題で名づける（.agents/skills/intmap-round/ §4）。`,
    '',
  ].join('\n');

  const budget = Number(valueOf('--budget') || 0);
  if (budget > 0 && head.length + body.length > budget) {
    const room = Math.max(0, budget - head.length - 120);
    const kept = body.slice(0, room);
    const dropped = body.length - kept.length;
    process.stdout.write(`${head}${kept}\n\n⚠ 索引はここで切れている（あと ${dropped} 文字）。続きは ${INDEX} を直接読む。\n`);
  } else {
    process.stdout.write(head + body + (body.endsWith('\n') ? '' : '\n'));
  }
}
