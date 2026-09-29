/* ============================================================================
 *  IntMap · both products see the same IntMap — the memory store and the Codex setup
 * ----------------------------------------------------------------------------
 *  scripts/agent-memory.mjs derives ONE memory store for every worktree and product, and measures
 *  the index against the ceiling the host silently truncates at; scripts/codex-setup.mjs is the
 *  road back to the same startup context when a hook is not trusted. Every case runs the real
 *  script against a throw-away HOME / CODEX_HOME — nothing here reads or writes the real ones.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r696, r703, r704
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INDEX_CEILING, INDEX_CEILING_KB, INDEX_CEILING_LINES, indexVerdict, lineCount } from '../scripts/agent-memory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R696 — was tests/r696-codex-parity-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/*  R696 · Codex と Claude Code が同じ IntMap を同じように見ているか
 *  ------------------------------------------------------------------------------------------
 *  測るのは「設定が書いてあるか」ではなく、**片方だけが知っている状態が作れないか**。
 *  実測 (#R696): Codex 側の memories には IntMap を含む行が 0 件で、Claude 側には 429 本あった。
 *  綴りではなく事実に付ける（.agents/rules/no-ad-hoc-hardcoding.md §3）。
 */

const SCRIPT = path.join(ROOT, 'scripts', 'agent-memory.mjs');
const run = (args, opts = {}) =>
  execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT, ...opts });

const readJSON = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

/* ① 場所は cwd から独立している。どの worktree から呼んでも同じ 1 か所を指すことが、
      「正本が 1 つ」の実体そのもの。 */
test('#R696 ① メモリの場所は呼び出した場所に依存しない', () => {
  const fromRoot = run(['--path']).trim();
  const fromSub = run(['--path'], { cwd: path.join(ROOT, 'tests') }).trim();
  assert.ok(fromRoot.length > 0, '--path が空を返した');
  assert.equal(fromSub, fromRoot);
  assert.ok(!fromRoot.includes(`${path.sep}tests`), `worktree/サブディレクトリを混ぜている: ${fromRoot}`);
});

/* ② hook が名指すスクリプトは実在する。綴りを固定するのではなく、名指した先を開く（#R488）。 */
test('#R696 ② .codex/hooks.json が名指す node スクリプトは全部実在する', () => {
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
test('#R696 ③ Codex のセッション開始は Claude のそれを下回らない', () => {
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
test('#R696 ④ AGENTS.md はメモリの場所をハードコードしない', () => {
  const agents = readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  /* ⚠ 狙うのは「メモリの場所」だけ。USB の台帳（§11.3）は別の事実で、そこに在ってよい。 */
  assert.ok(!/\.claude[\\/]projects[\\/][^\s`]*memory/.test(agents),
    'AGENTS.md がメモリディレクトリの絶対パスを持っている（scripts/agent-memory.mjs --path が正本）');
  assert.ok(agents.includes('agent-memory.mjs'), 'AGENTS.md §1 が場所の求め方を指していない');
});

/* ⑤ 「無い」ことは文になる。空の出力は「まだ空」と「壊れている」を区別できない（#R589）。 */
test('#R696 ⑤ メモリが無いマシンでも、無いと述べる', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'intmap-r696-empty-'));
  const out = run([], { env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.ok(out.trim().length > 0, '何も言わずに終わった');
  assert.ok(out.includes(home), `どこを見たのかを言っていない: ${out}`);
});

/* ⑥ 切るときは、落とした量と続きの読み方を言う（#R694: 窓は長さであって関連度ではない）。 */
test('#R696 ⑥ --budget は黙って切らない', async () => {
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R703 — was tests/r703-memory-index-ceiling-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/*  R703 · 索引を切るのは、この道具の budget ではなく、索引を自分で読み込む製品の上限
 *  ------------------------------------------------------------------------------------------
 *  実測 2026-09-11: MEMORY.md は 25,710 文字で、セッションは
 *  «MEMORY.md is 25.1KB (limit: 24.4KB) — Only part of it was loaded.» と告げられていた。
 *  25710/1024 = 25.10 なので、ホストは 1024 文字を 1KB として数え、24.4KB で止める。
 *
 *  ⚠ この索引が天井を越えたのは 3 度目（#R236・#R548・#R703）で、前の 2 回の処置はどちらも
 *  「詰め直す」だった。詰め直しは越えた事実を消すが、越えたことを**告げる機構**を作らない。
 *  だから測っているのは詰め方ではなく、**毎セッション実測が述べられるか**である。
 */

const SCRIPT = path.join(ROOT, 'scripts', 'agent-memory.mjs');
const readJSON = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

/* 索引を持つ偽の HOME を 1 つ作って、そこに N 文字ちょうどの索引を置く。
   ⚠ 場所はスクリプト自身に訊く——テストが鍵を組み立て直すと、導出ではなく写しを測る（#R696 ②）。 */
const withIndex = (chars) => {
  const home = mkdtempSync(path.join(tmpdir(), 'intmap-r703-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const dir = execFileSync(process.execPath, [SCRIPT, '--path'], { encoding: 'utf8', cwd: ROOT, env }).trim();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'MEMORY.md'), 'x'.repeat(chars));
  return { env, dir };
};
const check = (env) =>
  execFileSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8', cwd: ROOT, env });

/* ① 天井はホストが報告した対そのもの。#R703 を開かせた実測が、いまも超過と判定される。 */
test('#R703 ① 天井はホストが報告した 24.4KB × 1024 文字で、25,710 文字は超過', () => {
  assert.equal(INDEX_CEILING_KB, 24.4);
  assert.equal(INDEX_CEILING, Math.floor(24.4 * 1024));
  const observed = indexVerdict(25710);
  assert.equal(observed.over, true, '#R703 を開かせた実測が超過と判定されない');
  assert.equal(indexVerdict(INDEX_CEILING).over, false, '天井ちょうどを超過にしている');
  assert.equal(indexVerdict(INDEX_CEILING + 1).over, true);
});

/* ② 超えていないことと、一度も測っていないことを同じ出力にしない（#R699）。 */
test('#R703 ② 超えていなくても文字数を述べる', () => {
  const { env } = withIndex(1000);
  const out = check(env);
  assert.ok(out.trim().length > 0, '何も言わずに終わった');
  assert.match(out, /1,000/, `測った文字数を言っていない: ${out}`);
  assert.match(out, /24,985/, `比べた天井を言っていない: ${out}`);
  assert.ok(!/⚠/.test(out), `超えていないのに警告した: ${out}`);
});

/* ③ 超えたら、超過量・何が起きているか・どこを直すかを述べる。 */
test('#R703 ③ 超えたら、超過量と場所を述べる', () => {
  const over = INDEX_CEILING + 725;
  const { env, dir } = withIndex(over);
  const out = check(env);
  assert.match(out, /725/, `超過量を言っていない: ${out}`);
  assert.ok(out.includes(path.join(dir, 'MEMORY.md')), `どのファイルかを言っていない: ${out}`);
  assert.match(out, /⚠/, '超過なのに警告の印が無い');
  /* ⚠ 実体を消せとは言わない——落ちているのは索引の末尾であって、.md ではない。 */
  assert.match(out, /実体/, `「実体は消えていない」を言っていない: ${out}`);
});

/* ④ これは門ではなく観測である。非 0 で終えると「起動に失敗した」という別の意味になる。 */
test('#R703 ④ 超過していてもセッションの起動を失敗にしない', () => {
  const { env } = withIndex(INDEX_CEILING + 5000);
  const r = execFileSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8', cwd: ROOT, env });
  assert.ok(r.length > 0);   /* execFileSync は非 0 で throw するので、ここに来ること自体が exit 0 */
});

/* ⑤ 測定は**両方の製品**の SessionStart に配られている。綴りを固定せず、hook が名指した
      コマンドをそのまま実行して、測定行が出ることで確かめる（#R505: ソースを読む検査は
      評価順序を見ない）。 */
test('#R703 ⑤ Claude Code と Codex の両方が、起動時にこの測定を受け取る', () => {
  const claude = readJSON('.claude/settings.json').hooks.SessionStart.flatMap((g) => g.hooks).map((h) => h.command.trim());
  const codex = readJSON('.codex/hooks.json').hooks.SessionStart.flatMap((g) => g.hooks).map((h) => h.command.trim());
  const { env } = withIndex(1234);
  for (const [product, cmds] of [['claude', claude], ['codex', codex]]) {
    const measuring = cmds.filter((c) => c.includes('agent-memory.mjs'));
    const outs = measuring.map((c) => {
      const [, ...args] = c.split(/\s+/);
      return execFileSync(process.execPath, args.slice(1).length ? [path.join(ROOT, args[0]), ...args.slice(1)] : [path.join(ROOT, args[0])],
        { encoding: 'utf8', cwd: ROOT, env });
    });
    assert.ok(outs.some((o) => /1,234\s*\/\s*24,985/.test(o)),
      `${product} の SessionStart は索引を天井と比べていない（受け取るのは: ${measuring.join(' | ')}）`);
  }
});

/* ⑥ 数は 1 か所にしかない。文書はこのファイルを指す（#R500: 機械が持つ数を散文が写すと必ず離れる）。
      ⚠ 針は「その数字」ではなく「その主張」を探す。最初に書いた針は 24985 という**桁の並び**を
      探したので、data/hist-kuni.js の座標に当たった——数字は主張ではない（#R699 の形）。 */
test('#R703 ⑥ 天井の数を持っているのは scripts/agent-memory.mjs だけ', () => {
  const tracked = execFileSync('git', ['ls-files', '*.mjs', '*.js'], { encoding: 'utf8', cwd: ROOT })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => f !== 'scripts/agent-memory.mjs' && !f.startsWith('tests/'));
  const carriers = tracked.filter((f) => {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    return src.includes('INDEX_CEILING') || src.includes('24.4 * 1024');
  });
  assert.deepEqual(carriers, [], `天井の数を写しているファイル: ${carriers.join(', ')}`);
});

/* ⑦ (2026-09-25) 天井は 2 つある。実測: 203 行・約 17,000 文字の索引が
      «MEMORY.md is 203 lines (limit: 200). Only part of it was loaded: 3 of 203 lines were cut off»
      と告げられ、その間 --check は「文字数は天井の下」とだけ言っていた——文字しか数えていなかった。
      ⚠ 元の欠陥で書く: 「文字の天井の下で、行の天井を越えた索引が、緑と報告される」。 */
test('#R703 ⑦ 文字の天井の下でも、行の天井を越えたら超過と判定する（実測 203 行）', () => {
  assert.equal(INDEX_CEILING_LINES, 200);
  const observed = indexVerdict(17000, 203);
  assert.equal(observed.overChars, false, '前提: 文字数は天井の下');
  assert.equal(observed.over, true, '203 行が超過と判定されない——ホストは 3 行を落としている');
  assert.equal(indexVerdict(17000, INDEX_CEILING_LINES).over, false, '行の天井ちょうどを超過にしている');
  /* 行の数え方はホストに合わせる: 末尾の改行は 204 行目を作らない */
  assert.equal(lineCount('a\nb\nc\n'), 3);
  assert.equal(lineCount('a\r\nb\r\nc'), 3);
});

test('#R703 ⑧ 行で超えた索引に、--check が ⚠ と行数と場所を述べる', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'intmap-r703-lines-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const dir = execFileSync(process.execPath, [SCRIPT, '--path'], { encoding: 'utf8', cwd: ROOT, env }).trim();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'MEMORY.md'), Array.from({ length: INDEX_CEILING_LINES + 3 }, (_, i) => `- line ${i}`).join('\n') + '\n');
  const out = check(env);
  assert.match(out, /⚠/, `行で超えたのに警告しない: ${out}`);
  assert.match(out, new RegExp(`${INDEX_CEILING_LINES + 3} / ${INDEX_CEILING_LINES} 行`), `行数を言っていない: ${out}`);
  assert.match(out, /3 行の超過/, `超過量を言っていない: ${out}`);
  assert.ok(out.includes(path.join(dir, 'MEMORY.md')), `どのファイルかを言っていない: ${out}`);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R704 — was tests/r704-codex-parity-seamless-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/*  tests/r704-codex-parity-seamless-checks.test.mjs — «Codex でも同じ使用感» の、CI に証明できる半分
 *
 *  #R704 が直したものの大半は THIS MACHINE の `~/.codex/config.toml` にあり、CI runner には
 *  `~/.codex` が無い。だから「設定が正しいか」はここでは測れない——測れるのは、**設定を正しく
 *  できる仕組みが壊れていないか**のほうである。
 *
 *  ⚠ 中心は ② である。#R704 の欠陥は「hook が trust されていなかった」ことそのものではなく、
 *  **hook が届かないときに同じ中身へ戻る道が無かった**こと（実測: Codex のセッションは branch 行も
 *  #R696 の蓄積メモリも一度も受け取っていなかったのに、どのセッションもそれに気づけなかった）。
 *  その道は `.agents/session-start.json` という 1 つの正本から出ていなければ意味がない——
 *  片方にコマンドを足して他方が知らない形は、#R699 が配線から追い出した形そのものだから。
 */

const SCRIPT = path.join(ROOT, 'scripts/codex-setup.mjs');
const rd = (rel) => readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const runSetup = (args, codexHome) =>
  execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome },
  });

/* A config.toml with the shapes the real one has: bare keys, tables, and a long tail of the
   user's own entries that must survive untouched. */
const SAMPLE = [
  'model = "gpt-6-astra"',
  'model_reasoning_effort = "low"',
  '',
  '[marketplaces.openai-bundled]',
  'source_type = "local"',
  '',
  "[projects.'C:\\\\somewhere\\\\else']",
  'trust_level = "trusted"',
  '',
].join('\n');

const withHome = (fn, seed = SAMPLE) => {
  const home = mkdtempSync(path.join(tmpdir(), 'r704-codex-'));
  try { writeFileSync(path.join(home, 'config.toml'), seed); return fn(home, path.join(home, 'config.toml')); }
  finally { rmSync(home, { recursive: true, force: true }); }
};

/* ① 既定は読むだけ。1 バイトも書かない。 */
test('#R704 ① codex-setup は --apply 無しでは設定を書き換えない', () => {
  withHome((home, cfg) => {
    const before = readFileSync(cfg, 'utf8');
    const out = runSetup([], home);
    assert.equal(readFileSync(cfg, 'utf8'), before, '--apply を渡していないのに config.toml が変わった');
    assert.match(out, /--apply/, '何も書かなかったのなら、どうすれば書くのかを言うべき');
  });
});

/* ② 起動時の文脈は 1 つの正本から出ている（この回の本体）。
      `.agents/session-start.json` に codex 宛のコマンドを足したら、hook が届かないときの
      代替も同じものを言う——言わなければ、また片方だけが知っている状態に戻る。 */
test('#R704 ② hook が届かないときの代替は .agents/session-start.json から導出される', () => {
  const src = JSON.parse(rd('.agents/session-start.json'));
  const want = src.commands.filter((c) => !c.products || c.products.includes('codex')).map((c) => c.command);
  assert.ok(want.length > 0, 'Codex 宛の SessionStart コマンドが 1 件も無い');

  const report = withHome((home) => JSON.parse(runSetup(['--json'], home)));
  const row = report.rows.find((r) => r.name === 'startup-commands');
  assert.ok(row, 'codex-setup が起動時コマンドを報告していない');
  for (const cmd of want) {
    assert.ok(row.detail.includes(cmd),
      `.agents/session-start.json は «${cmd}» を Codex に渡すが、hook が届かないときの代替がそれを言っていない`);
  }
});

/* ③ その代替へ戻る道は、trust が要らない 2 つの経路の両方から名指しされている。
      AGENTS.md は無条件に読まれ、.codex/config.toml は信頼されたプロジェクトで読まれる——
      片方しか無いと、信頼されていない作業場（＝まさに hook も読まれない場所）で道が消える。 */
test('#R704 ③ AGENTS.md と .codex/config.toml の両方が代替の入口を名指ししている', () => {
  const needle = 'scripts/codex-setup.mjs';
  assert.ok(rd('AGENTS.md').includes(needle),
    `AGENTS.md が ${needle} を名指ししていない——信頼されていない場所では、ここだけが読まれる`);
  assert.ok(rd('.codex/config.toml').includes(needle),
    `.codex/config.toml が ${needle} を名指ししていない`);
});

/* ④ 冪等。2 回目が何も変えないことと、利用者の行を 1 行も失わないこと。
      これは体裁の話ではない: 実物の config.toml は 480 行あり、その大半が利用者の plugin と
      信頼したパスである。書き換えるのではなく編集する、という約束の検査。 */
test('#R704 ④ --apply は冪等で、利用者の行を 1 行も落とさない', () => {
  withHome((home, cfg) => {
    runSetup(['--apply'], home);
    const once = readFileSync(cfg, 'utf8');
    runSetup(['--apply'], home);
    assert.equal(readFileSync(cfg, 'utf8'), once, '2 回目の --apply が中身を変えた（冪等でない）');

    for (const line of SAMPLE.split('\n').filter((l) => l.trim())) {
      assert.ok(once.includes(line), `利用者の行が消えた: ${line}`);
    }
    assert.ok(once.includes('sandbox_mode = "workspace-write"'), '書くべき値が書かれていない');
    assert.ok(!once.includes('sandbox_mode = "workspace-write"\nsandbox_mode'), '同じ鍵を 2 度書いた');
  });
});

/* ⑥ アプリが所有している鍵には触らない。
      ⚠ 実測 #R704: `model_reasoning_effort` を `high` に書いた数分後、**起動中の Codex が
      `low` を書き戻した**——この鍵はアプリのモデル選択 UI の写しなので、ファイルへの書き込みは
      持続しない。**持続しない修正は、修正が無いことより悪い**（報告は「直した」と言い、値は
      戻っている）。だから書かずに、誰が所有しているかを言う。 */
test('#R704 ⑥ アプリが所有する鍵はファイルに書かず、所有者を報告する', () => {
  withHome((home, cfg) => {
    runSetup(['--apply'], home);
    const after = readFileSync(cfg, 'utf8');
    assert.ok(after.includes('model_reasoning_effort = "low"'),
      'アプリが所有する鍵を書き換えてしまった（起動中の Codex に書き戻されるので、報告が嘘になる）');

    const row = JSON.parse(runSetup(['--json'], home)).rows.find((r) => r.name === 'model_reasoning_effort');
    assert.equal(row.state, 'manual', '所有者がアプリである鍵を「揃った」と報告してはならない');
    assert.match(row.detail, /UI/, '誰がその値を持っているのかを言っていない');
  });
});

/* ⑤ Codex がこのマシンに無くても落ちない。CI がまさにその状態。 */
test('#R704 ⑤ ~/.codex が無い環境でも報告して終わる', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'r704-nocodex-'));
  try {
    const report = JSON.parse(runSetup(['--json'], home));
    assert.equal(report.rows.find((r) => r.name === 'codex')?.state, 'miss');
    assert.ok(report.rows.some((r) => r.name === 'startup-commands'),
      'Codex が無くても、起動時に何を走らせるかは答えられるべき');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
}
