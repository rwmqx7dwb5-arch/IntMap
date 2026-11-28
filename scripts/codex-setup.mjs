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
 *      and so does every round's worktree
 *      (`%LOCALAPPDATA%\Temp\intmap-worktrees`). Under `workspace-write` those are not writable
 *      unless they are named — which is why `.codex/config.toml` C-7 had to say «ask for
 *      approval when the sandbox refuses». Naming them removes the refusal instead.
 *
 *  ⚠ NOTHING HERE IS A LIST OF PATHS TYPED BY HAND (.agents/rules/no-ad-hoc-hardcoding.md). Every
 *  directory is asked of the thing that owns it: the master copy from `git rev-parse
 *  --git-common-dir`, the memory store from `agent-memory.mjs --path`, the worktree root from the
 *  same `os.tmpdir()` join `worktree.mjs` uses. Move the checkout and all three follow it.
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
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexConfigPath, codexToml } from './lib/codex-settings.mjs';
import { updateSettings } from './lib/local-settings.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const JSON_OUT = ARGS.includes('--json');

const run = (cmd, args, cwd = ROOT) => {
  try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};

/* ── where things are (all derived, never typed) ──────────────────────────────────────── */
const CONFIG = codexConfigPath();

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

const rows = [];
const add = (name, state, detail) => rows.push({ name, state, detail });
const backup = CONFIG + '.r704.bak';

if (!existsSync(CONFIG)) {
  add('codex', 'miss', `${CONFIG} が無い——Codex がこのマシンに入っていないか、まだ一度も起動していない`);
} else {
  try {
    const parse = await codexToml();
    const configure = before => {
      if (before == null) throw new Error('Codex configuration disappeared during setup');
      let doc = parse(before);
      const result = [];
      const report = (name, state, detail) => result.push({ name, state, detail });
      const edit = (key, value) => {
        doc = parse(doc.set(key, value));
        if (JSON.stringify(doc.get(key)) !== JSON.stringify(value)) throw new Error('Codex settings edit did not apply');
      };
      if (MASTER) {
        const key = ['projects', MASTER, 'trust_level'];
        const current = doc.get(key);
        if (current === 'trusted') report('project-trust', 'ok', `原本 ${MASTER} は信頼済み`);
        else if (APPLY && current === undefined) {
          edit(key, 'trusted');
          report('project-trust', 'fixed', `原本 ${MASTER} を信頼済みとして登録した`);
        } else report('project-trust', 'manual', `原本 ${MASTER} の信頼設定は ${current ?? '未設定'}`);
      }
      for (const s of SETTINGS) {
        const key = [s.key];
        const current = doc.get(key);
        if (current === s.value) report(s.key, 'ok', s.value);
        else if (s.appOwned) report(s.key, 'manual', `いまは ${current ?? '未設定'}。Codex のモデル選択 UI で選ぶこと。${s.why}`);
        else if (APPLY) {
          edit(key, s.value);
          report(s.key, 'fixed', `${current ?? '未設定'} → ${s.value}   ${s.why}`);
        } else report(s.key, 'manual', `いまは ${current ?? '未設定'}。要る値は ${s.value} — ${s.why}`);
      }
      const rootKey = ['sandbox_workspace_write', 'writable_roots'];
      const roots = doc.get(rootKey);
      const writable = [...new Set([...(Array.isArray(roots) ? roots : []), ...OUTSIDE_ROOTS])];
      for (const [name, value, label] of [
        ['network_access', true, 'サンドボックスからの通信（gh・supabase・npm・本番検証）'],
        ['writable_roots', writable, `workspace の外で書く先 ${writable.length} 件（メモリ・worktree）`],
      ]) {
        const key = ['sandbox_workspace_write', name];
        if (JSON.stringify(doc.get(key)) === JSON.stringify(value)) report('sandbox.' + name, 'ok', label);
        else if (APPLY) {
          edit(key, value);
          report('sandbox.' + name, 'fixed', label);
        } else report('sandbox.' + name, 'manual', `未設定または別の値 — ${label}`);
      }
      if (doc.text !== before) report('backup', 'ok', `変更前の設定の初回バックアップ: ${backup}`);
      const hooks = doc.get(['hooks', 'state']);
      report('hook-trust', hooks && Object.keys(hooks).length ? 'ok' : 'manual',
        hooks && Object.keys(hooks).length ? '[hooks.state] に信頼が記録されている'
          : '[hooks.state] に信頼が記録されていない。Codex の /hooks で SessionStart を信頼する。それまでは AGENTS.md §0 の代替コマンドを使う');
      return { text: doc.text, result };
    };
    const result = APPLY ? await updateSettings(CONFIG, configure, { backup })
      : configure(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(CONFIG))).result;
    rows.push(...result);
  } catch (e) {
    add('codex', 'miss', '設定を処理できませんでした: ' + e.message);
    if (APPLY) process.exitCode = 1;
  }
}

/* 5. what the startup context IS, derived from the one source both products render from — so a
      command added there shows up here without this file being edited. */
try {
  const src = JSON.parse(readFileSync(path.join(ROOT, '.agents/session-start.json'), 'utf8'));
  const forCodex = src.commands.filter((c) => !c.products || c.products.includes('codex'));
  add('startup-commands', 'ok', `hook が届かないときに自分で走らせるもの ${forCodex.length} 件:\n      ${forCodex.map((c) => c.command).join('\n      ')}`);
} catch (e) { add('startup-commands', 'miss', `.agents/session-start.json を読めない: ${e.message}`); }

if (JSON_OUT) { console.log(JSON.stringify({ config: CONFIG, master: MASTER, memory: MEMORY, rows }, null, 2)); process.exit(process.exitCode || 0); }

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
