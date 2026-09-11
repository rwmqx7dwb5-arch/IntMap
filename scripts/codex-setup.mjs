#!/usr/bin/env node
/*  scripts/codex-setup.mjs — the machine-local half of «同じ使用感» (#R704)
 *
 *  「Codexにこれやってと送るだけで完璧にシームレスな環境でできるようにして。」
 *
 *  The REPOSITORY half was finished in #R503/#R696/#R699: one source under `.agents/`, rendered
 *  into `.claude/` and `.codex/`, gated by `npm run check:agents`. What that half CANNOT reach is
 *  `~/.codex/config.toml` — it is outside the repository, it is this machine's, and it holds the
 *  four facts that decide whether a Codex session behaves like a Claude Code session at all.
 *
 *  ⚠ MEASURED when this was written, and the reason it exists:
 *
 *   1. `[hooks.state]` held ZERO entries, so the SessionStart hook `.codex/hooks.json` declares
 *      had NEVER RUN. Every Codex session started without the branch/round line and — worse —
 *      without the accumulated memory that #R696 built the whole one-store design for. Searched
 *      all 200+ rollouts under `~/.codex/sessions` since 2026-09-01: the string
 *      «IntMap · 蓄積メモリの索引» appears ZERO times, and the one place the status line DOES
 *      appear is inside `[external_agent_tool_result]` — a Claude Code transcript imported into
 *      Codex, not a hook firing. The wiring was right and the switch was never thrown.
 *   2. `model_reasoning_effort = "low"`. AGENTS.md §3 asks for fixes at the level of the cause
 *      and §3.5 for nine languages; shallow reasoning fails those by walking the steps without
 *      making the judgement. Raising it spends the USER's money, so this script never raises it
 *      on its own — `--apply` does what the user asked for, and `--check` only reports.
 *   3. Neither `approval_policy` nor `sandbox_mode` was set, i.e. the app defaults decided
 *      whether AGENTS.md §5.1 («no extra approval for migration, deployment, commit, push, PR,
 *      merge») could be honoured at all.
 *   4. The one store of #R696 lives OUTSIDE any workspace (`~/.claude/projects/<key>/memory`),
 *      and so do the handoff cursors (`~/.intmap-handoff`) and every round's worktree
 *      (`%LOCALAPPDATA%\Temp\intmap-worktrees`). Under `workspace-write` those are not writable
 *      unless they are named — which is why `.codex/config.toml` C-7 had to say «ask for
 *      approval when the sandbox refuses». Naming them removes the refusal instead.
 *
 *  ⚠ NOTHING HERE IS A LIST OF PATHS TYPED BY HAND (.agents/rules/no-ad-hoc-hardcoding.md). Every
 *  directory is asked of the thing that owns it: the master copy from `git rev-parse
 *  --git-common-dir`, the memory store from `agent-memory.mjs --path`, the handoff state from the
 *  same expression `handoff.mjs` uses, the worktree root from the same `os.tmpdir()` join
 *  `worktree.mjs` uses. Move the checkout and all four follow it.
 *
 *  ⚠ IT EDITS, IT DOES NOT REWRITE. `~/.codex/config.toml` is the user's: plugins, MCP servers,
 *  marketplaces, and ~90 trusted project paths. Every change is a surgical line edit, a backup is
 *  written first, and re-running changes nothing (idempotent).
 *
 *      node scripts/codex-setup.mjs            # report the parity facts, change nothing
 *      node scripts/codex-setup.mjs --apply    # make them true (backs up config.toml first)
 *      node scripts/codex-setup.mjs --json     # the same report, machine-readable
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const JSON_OUT = ARGS.includes('--json');

const run = (cmd, args, cwd = ROOT) => {
  try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};

/* ── where things are (all derived, never typed) ──────────────────────────────────────── */
const CODEX_HOME = process.env.CODEX_HOME || path.join(homedir(), '.codex');
const CONFIG = path.join(CODEX_HOME, 'config.toml');

/* The master working directory — master-sync.mjs's derivation, so this agrees from any worktree. */
const MASTER = (() => {
  const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return common ? path.resolve(path.dirname(common)) : null;
})();

/* The one memory store (#R696). Asked of the script that owns it rather than reassembled here. */
const MEMORY = run(process.execPath, [path.join(ROOT, 'scripts/agent-memory.mjs'), '--path']);

/* Directories a round writes to that no workspace contains. The USB mirror is deliberately NOT
   here: its drive letter is discovered by volume label at backup time (backup-usb.ps1) and a
   letter captured today is a wrong answer tomorrow — that is the case `approval_policy` is set to
   escalate on, instead of being pinned to a stale constant. */
const OUTSIDE_ROOTS = [
  MEMORY ? path.dirname(MEMORY) : null,                                  /* memory + the USB ledger */
  process.env.INTMAP_HANDOFF_STATE_DIR || path.join(homedir(), '.intmap-handoff'),
  path.join(tmpdir(), 'intmap-worktrees'),                               /* every round's worktree */
].filter(Boolean);

/* ── the facts, each with what it is for ─────────────────────────────────────────────────
   The VALUES the user chose are here and nowhere else; the checks below read this table, so a
   changed answer is a one-line change and never a second copy. */
const SETTINGS = [
  { key: 'model_reasoning_effort', value: 'high', appOwned: true,
    why: 'AGENTS.md §3 asks for the cause, not the symptom; «low» walks the steps without the judgement. Costs the user money — set because the user asked for it (#R704), never raised on this script\'s own initiative. ⚠ MEASURED #R704: written to «high», the RUNNING Codex app wrote «low» back into config.toml within minutes — this key mirrors the app\'s own model picker, so a file write is not durable while the app is open. Set it in the picker; this script only reports the drift.' },
  { key: 'sandbox_mode', value: 'workspace-write',
    why: 'AGENTS.md §5.1 requires commit / push / PR / merge / deployment without extra approval; read-only cannot do any of them.' },
  { key: 'approval_policy', value: 'on-failure',
    why: 'Quietest policy that still has somewhere to go when the sandbox itself refuses — «never» would turn the USB mirror (§11.2, a drive outside every workspace) into a silent failure instead of one question.' },
];

/* ── a very small TOML surgeon ────────────────────────────────────────────────────────────
   Not a TOML library on purpose: the three shapes needed here are «a bare key before the first
   table», «one key inside one named table», and «a table exists at all». A parser that can only
   express those cannot silently reformat 480 lines of the user's plugins and trust entries. */
const HEAD = (text) => { const i = text.search(/^\s*\[/m); return i < 0 ? text.length : i; };

function setBareKey(text, key, value) {
  const head = text.slice(0, HEAD(text));
  const re = new RegExp(`^${key}\\s*=.*$`, 'm');
  const line = `${key} = ${JSON.stringify(value)}`;
  if (re.test(head)) {
    const cur = head.match(re)[0];
    if (cur.trim() === line) return { text, changed: false, was: cur.trim() };
    return { text: text.slice(0, HEAD(text)).replace(re, line) + text.slice(HEAD(text)), changed: true, was: cur.trim() };
  }
  return { text: `${line}\n${text}`, changed: true, was: null };
}

function setTableKey(text, table, key, valueLiteral) {
  /* ⚠ escape EVERY regex metacharacter, «\» included — a partial sanitiser is the one CodeQL
     calls js/incomplete-sanitization, and «escapes the characters I happen to use today» is the
     same shape as a hand-written list of cases (.agents/rules/no-ad-hoc-hardcoding.md). */
  const head = new RegExp(`^\\[${table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*$`, 'm');
  const line = `${key} = ${valueLiteral}`;
  if (!head.test(text)) return { text: `${text.replace(/\s*$/, '')}\n\n[${table}]\n${line}\n`, changed: true, was: null };
  const start = text.search(head);
  const after = text.indexOf('\n', start) + 1;
  const nextTable = text.slice(after).search(/^\s*\[/m);
  const body = nextTable < 0 ? text.slice(after) : text.slice(after, after + nextTable);
  const re = new RegExp(`^${key}\\s*=.*$`, 'm');
  if (re.test(body)) {
    const cur = body.match(re)[0];
    if (cur.trim() === line) return { text, changed: false, was: cur.trim() };
    return { text: text.slice(0, after) + body.replace(re, line) + text.slice(after + body.length), changed: true, was: cur.trim() };
  }
  return { text: text.slice(0, after) + line + '\n' + body + text.slice(after + body.length), changed: true, was: null };
}

const tomlPathArray = (dirs) => `[${dirs.map((d) => JSON.stringify(d)).join(', ')}]`;

/* ── report ───────────────────────────────────────────────────────────────────────────── */
const rows = [];
const add = (name, state, detail) => rows.push({ name, state, detail });   /* state: ok | fixed | manual | miss */

if (!existsSync(CONFIG)) {
  add('codex', 'miss', `${CONFIG} が無い——Codex がこのマシンに入っていないか、まだ一度も起動していない`);
} else {
  let text = readFileSync(CONFIG, 'utf8');
  const before = text;

  /* 1. the master copy must be a trusted project, or `.codex/` is not read at all */
  if (MASTER) {
    const trusted = new RegExp(`^\\[projects\\.(?:'|")${MASTER.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')}(?:'|")\\]`, 'm').test(text);
    if (trusted) add('project-trust', 'ok', `原本 ${MASTER} は信頼済み（.codex/config.toml・agents・hooks が読まれる）`);
    else if (APPLY) {
      text += `\n# (#R704) IntMap master copy — scripts/codex-setup.mjs\n[projects.'${MASTER}']\ntrust_level = "trusted"\n`;
      add('project-trust', 'fixed', `原本 ${MASTER} を信頼済みとして登録した`);
    } else add('project-trust', 'manual', `原本 ${MASTER} が信頼されていない——--apply で登録する`);
  }

  /* 2. the three scalar settings */
  for (const s of SETTINGS) {
    const r = setBareKey(text, s.key, s.value);
    if (!r.changed) add(s.key, 'ok', `${s.value}`);
    else if (s.appOwned) {
      /* Writing it would "work" and then be undone by the app — a fix that does not hold is worse
         than no fix, because the report would say ✎ while the value went back. Say who owns it. */
      add(s.key, 'manual', `いまは ${r.was ?? '未設定'}。要る値は ${s.value}。⚠ **この鍵はアプリが所有している**——Codex の起動中にファイルへ書いても書き戻される（実測 #R704）。Codex のモデル選択 UI で選ぶこと。${s.why}`);
    } else if (APPLY) { text = r.text; add(s.key, 'fixed', `${r.was ?? '（未設定）'} → ${s.value}   ${s.why}`); }
    else add(s.key, 'manual', `いまは ${r.was ?? '未設定'}。要る値は ${s.value} — ${s.why}`);
  }

  /* 3. network, and the roots a round writes to that no workspace contains */
  for (const [key, literal, label] of [
    ['network_access', 'true', 'サンドボックスからの通信（gh・supabase・npm・本番検証）'],
    ['writable_roots', tomlPathArray(OUTSIDE_ROOTS), `workspace の外で書く先 ${OUTSIDE_ROOTS.length} 件（メモリ・handoff・worktree)`],
  ]) {
    const r = setTableKey(text, 'sandbox_workspace_write', key, literal);
    if (!r.changed) add(`sandbox.${key}`, 'ok', label);
    else if (APPLY) { text = r.text; add(`sandbox.${key}`, 'fixed', label); }
    else add(`sandbox.${key}`, 'manual', `未設定または別の値 — ${label}`);
  }

  if (APPLY && text !== before) {
    const backup = `${CONFIG}.r704.bak`;
    if (!existsSync(backup)) copyFileSync(CONFIG, backup);
    writeFileSync(CONFIG, text);
    rows.push({ name: 'backup', state: 'ok', detail: `変更前の config.toml を ${backup} に残した` });
  }

  /* 4. hook trust — the one thing a file cannot grant (docs/AGENT-SETUP.md §7) */
  const hookTrusted = /^\[hooks\.state(?:\.|\])/m.test(text);
  add('hook-trust', hookTrusted ? 'ok' : 'manual',
    hookTrusted
      ? '[hooks.state] に信頼が記録されている'
      : '⚠ [hooks.state] が空——SessionStart hook は一度も走っていない。Codex を開いて /hooks で SessionStart を trust する（hash に対して記録されるので .codex/hooks.json を変えるたびに 1 回要る）。それまでは AGENTS.md §0 の代替コマンドが同じ中身を運ぶ');
}

/* 5. what the startup context IS, derived from the one source both products render from — so a
      command added there shows up here without this file being edited. */
try {
  const src = JSON.parse(readFileSync(path.join(ROOT, '.agents/session-start.json'), 'utf8'));
  const forCodex = src.commands.filter((c) => !c.products || c.products.includes('codex'));
  add('startup-commands', 'ok', `hook が届かないときに自分で走らせるもの ${forCodex.length} 件:\n      ${forCodex.map((c) => c.command).join('\n      ')}`);
} catch (e) { add('startup-commands', 'miss', `.agents/session-start.json を読めない: ${e.message}`); }

if (JSON_OUT) { console.log(JSON.stringify({ config: CONFIG, master: MASTER, memory: MEMORY, rows }, null, 2)); process.exit(0); }

const MARK = { ok: '✓', fixed: '✎', manual: '⚠', miss: '✖' };
console.log(`\nIntMap · Codex をこのマシンで Claude Code と同じ使用感にする${APPLY ? '' : '（--apply で実際に書く）'}\n`);
console.log(`  設定ファイル  ${CONFIG}`);
if (MEMORY) console.log(`  メモリの正本  ${MEMORY}`);
console.log('');
for (const r of rows) console.log(`  ${MARK[r.state]} ${r.name.padEnd(22)} ${r.detail}`);
const manual = rows.filter((r) => r.state === 'manual');
console.log(manual.length
  ? `\n  残りの手作業 ${manual.length} 件: ${manual.map((r) => r.name).join(', ')}\n`
  : '\n  手作業は残っていない。\n');
