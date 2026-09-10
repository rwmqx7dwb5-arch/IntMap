/*  R696 · Codex と Claude Code が同じ IntMap を同じように見ているか
 *  ------------------------------------------------------------------------------------------
 *  測るのは「設定が書いてあるか」ではなく、**片方だけが知っている状態が作れないか**。
 *  実測 (#R696): Codex 側の memories には IntMap を含む行が 0 件で、Claude 側には 429 本あった。
 *  綴りではなく事実に付ける（.agents/rules/no-ad-hoc-hardcoding.md §3）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'agent-memory.mjs');
const run = (args, opts = {}) =>
  execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT, ...opts });

const readJSON = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

/* ① 場所は cwd から独立している。どの worktree から呼んでも同じ 1 か所を指すことが、
      「正本が 1 つ」の実体そのもの。 */
test('① メモリの場所は呼び出した場所に依存しない', () => {
  const fromRoot = run(['--path']).trim();
  const fromSub = run(['--path'], { cwd: path.join(ROOT, 'tests') }).trim();
  assert.ok(fromRoot.length > 0, '--path が空を返した');
  assert.equal(fromSub, fromRoot);
  assert.ok(!fromRoot.includes(`${path.sep}tests`), `worktree/サブディレクトリを混ぜている: ${fromRoot}`);
});

/* ② hook が名指すスクリプトは実在する。綴りを固定するのではなく、名指した先を開く（#R488）。 */
test('② .codex/hooks.json が名指す node スクリプトは全部実在する', () => {
  const hooks = readJSON('.codex/hooks.json');
  const cmds = hooks.hooks.SessionStart.flatMap((g) => g.hooks).map((h) => h.command);
  assert.ok(cmds.length >= 2, `SessionStart の command が ${cmds.length} 本しかない`);
  for (const cmd of cmds) {
    const m = /^node\s+(\S+)/.exec(cmd);
    assert.ok(m, `node で始まらない command: ${cmd}`);
    assert.ok(existsSync(path.join(ROOT, m[1])), `hook が存在しないスクリプトを名指している: ${m[1]}`);
  }
});

/* ③ Codex の SessionStart は Claude の SessionStart を包含する。
      Claude だけが自動で読むもの（メモリ）があるので逆向きの一致は要求しない——
      要求するのは「Codex が知らないことが増えない」ほう。 */
test('③ Codex のセッション開始は Claude のそれを下回らない', () => {
  const claude = readJSON('.claude/settings.json').hooks.SessionStart
    .flatMap((g) => g.hooks).map((h) => h.command.trim());
  const codex = readJSON('.codex/hooks.json').hooks.SessionStart
    .flatMap((g) => g.hooks).map((h) => h.command.trim());
  for (const cmd of claude) {
    assert.ok(codex.includes(cmd), `Codex 側に無い: ${cmd}`);
  }
  assert.ok(
    codex.some((c) => c.includes('agent-memory.mjs')),
    'Codex は蓄積メモリを読んでいない（Claude は自動で読むので、ここが抜けると片方だけが知る）',
  );
});

/* ④ 恒久指示にマシン固有のメモリ絶対パスを書き戻さない。導出に移したのがこのラウンド。 */
test('④ AGENTS.md はメモリの場所をハードコードしない', () => {
  const agents = readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  /* ⚠ 狙うのは「メモリの場所」だけ。USB の台帳（§11.3）は別の事実で、そこに在ってよい。 */
  assert.ok(!/\.claude[\\/]projects[\\/][^\s`]*memory/.test(agents),
    'AGENTS.md がメモリディレクトリの絶対パスを持っている（scripts/agent-memory.mjs --path が正本）');
  assert.ok(agents.includes('agent-memory.mjs'), 'AGENTS.md §1 が場所の求め方を指していない');
});

/* ⑤ 「無い」ことは文になる。空の出力は「まだ空」と「壊れている」を区別できない（#R589）。 */
test('⑤ メモリが無いマシンでも、無いと述べる', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'intmap-r696-empty-'));
  const out = run([], { env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.ok(out.trim().length > 0, '何も言わずに終わった');
  assert.ok(out.includes(home), `どこを見たのかを言っていない: ${out}`);
});

/* ⑥ 切るときは、落とした量と続きの読み方を言う（#R694: 窓は長さであって関連度ではない）。 */
test('⑥ --budget は黙って切らない', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'intmap-r696-full-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  /* ⚠ 場所はスクリプト自身に訊く。テストが鍵を組み立て直すと、導出ではなく写しを測ることになる。 */
  const dir = run(['--path'], { env }).trim();
  assert.ok(dir.startsWith(home), `--path が HOME の外を指した: ${dir}`);
  mkdirSync(dir, { recursive: true });
  const filler = 'x'.repeat(5000);
  writeFileSync(path.join(dir, 'MEMORY.md'), `# index\n${filler}\n`);
  writeFileSync(path.join(dir, 'intmap-some-subject.md'), 'one fact\n');

  const full = run([], { env });
  assert.ok(full.includes(filler), '全文を渡していない');
  assert.ok(full.includes('1 本'), `実体の本数を言っていない: ${full.slice(0, 300)}`);

  const cut = run(['--budget', '900'], { env });
  assert.ok(!cut.includes(filler), 'budget を与えたのに切っていない');
  assert.match(cut, /あと\s*\d+\s*文字/, `落とした量を言っていない: ${cut.slice(-200)}`);
  assert.ok(cut.includes(path.join(dir, 'MEMORY.md')), '続きの読み方を言っていない');
});
