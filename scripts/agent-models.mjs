#!/usr/bin/env node
/* IntMap · which model each subagent ACTUALLY ran on (Claude Code only).
 *
 *   node scripts/agent-models.mjs              # the last 14 days
 *   node scripts/agent-models.mjs --days 30
 *   node scripts/agent-models.mjs --json
 *
 * WHY THIS EXISTS. `.agents/roles/*.md` declares a cheap default per role, and the caller may
 * raise it with the Agent tool's `model`. The declaration is checked (`npm run check:agents`);
 * what the caller does is not. OBSERVED 2026-10-03: after the sonnet defaults landed, 92% of
 * 316 subagent runs were on Opus — the escalation clause had become the default, and nothing
 * in the repository could see it. The person paying for the subscription saw it first, in the
 * background-task list. A policy with no reader is not kept (one-pass-or-a-reason.md §6).
 *
 * WHAT IT READS. Claude Code writes each subagent's transcript as
 * ~/.claude/projects/<project key>/<session>/subagents/<id>.jsonl beside <id>.meta.json
 * (`agentType`). The model is the `message.model` of the first assistant record — the model
 * that answered, not the one that was asked for. Sessions are found under the master's project
 * key and under every key of a worktree made by `scripts/worktree.mjs` (`wt-<slug>`), because a
 * session started inside a worktree files its transcripts under that worktree's key.
 * ⚠ Codex is not counted: its model is chosen by the account (docs/AGENT-SETUP.md §6).
 */
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { projectKey } from './agent-memory.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const valueOf = (f) => { const i = ARGS.indexOf(f); return i < 0 ? null : ARGS[i + 1]; };
const days = Number(valueOf('--days') ?? 14);

const master = (() => {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return path.resolve(path.dirname(common));
  } catch { return process.cwd(); }
})();

/* the project keys whose sessions belong to this repository */
export const ownKeys = (keys, masterKey) =>
  keys.filter((k) => k === masterKey || /-intmap-worktrees-wt-/.test(k));

/* the first answering model in the head of a transcript (records are written in order) */
const HEAD = 400_000;
export const firstModel = (text) => {
  const m = text.match(/"model":"(claude-[^"]+)"/);
  return m ? m[1] : null;
};
/* claude-opus-5-5 → opus; anything unrecognised is reported as itself, never folded */
export const family = (model) => (model?.match(/^claude-([a-z]+)/)?.[1]) ?? 'unknown';

const root = path.join(homedir(), '.claude', 'projects');
const since = Date.now() - days * 86_400_000;
const tally = new Map();
const keys = existsSync(root) ? ownKeys(readdirSync(root), projectKey(master)) : [];

const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.jsonl') && path.basename(dir) === 'subagents') one(p);
  }
};
const one = (p) => {
  if (statSync(p).mtimeMs < since) return;
  const fd = openSync(p, 'r'); const buf = Buffer.alloc(HEAD);
  const n = readSync(fd, buf, 0, HEAD, 0); closeSync(fd);
  let role = 'unknown';
  const meta = p.replace(/\.jsonl$/, '.meta.json');
  if (existsSync(meta)) { try { role = JSON.parse(readFileSync(meta, 'utf8')).agentType || role; } catch { /* unreadable meta: counted as unknown */ } }
  const fam = family(firstModel(buf.toString('utf8', 0, n)));
  const row = tally.get(role) ?? {};
  row[fam] = (row[fam] ?? 0) + 1;
  tally.set(role, row);
};

const isCLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCLI) {
  for (const k of keys) walk(path.join(root, k));
  const rows = [...tally].sort((a, b) => sum(b[1]) - sum(a[1]));
  if (ARGS.includes('--json')) { console.log(JSON.stringify({ days, rows: Object.fromEntries(rows) }, null, 2)); process.exit(0); }
  const all = rows.reduce((s, [, r]) => s + sum(r), 0);
  console.log(`subagent の実際のモデル（直近 ${days} 日・${keys.length} プロジェクト・${all} 起動）`);
  for (const [role, r] of rows) {
    const parts = Object.entries(r).sort((a, b) => b[1] - a[1]).map(([f, c]) => `${f} ${c}`).join(' / ');
    console.log(`  ${role.padEnd(22)} ${String(sum(r)).padStart(4)}  ${parts}`);
  }
  const opus = rows.reduce((s, [, r]) => s + (r.opus ?? 0) + (r.fable ?? 0), 0);
  if (all) console.log(`  高いモデル（opus/fable）の割合: ${Math.round((100 * opus) / all)}%  ⚠ 既定と昇格条件は .agents/skills/intmap-round/ §2`);
}
function sum(r) { return Object.values(r).reduce((a, b) => a + b, 0); }
