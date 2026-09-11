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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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
test('① codex-setup は --apply 無しでは設定を書き換えない', () => {
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
test('② hook が届かないときの代替は .agents/session-start.json から導出される', () => {
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
test('③ AGENTS.md と .codex/config.toml の両方が代替の入口を名指ししている', () => {
  const needle = 'scripts/codex-setup.mjs';
  assert.ok(rd('AGENTS.md').includes(needle),
    `AGENTS.md が ${needle} を名指ししていない——信頼されていない場所では、ここだけが読まれる`);
  assert.ok(rd('.codex/config.toml').includes(needle),
    `.codex/config.toml が ${needle} を名指ししていない`);
});

/* ④ 冪等。2 回目が何も変えないことと、利用者の行を 1 行も失わないこと。
      これは体裁の話ではない: 実物の config.toml は 480 行あり、その大半が利用者の plugin と
      信頼したパスである。書き換えるのではなく編集する、という約束の検査。 */
test('④ --apply は冪等で、利用者の行を 1 行も落とさない', () => {
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
test('⑥ アプリが所有する鍵はファイルに書かず、所有者を報告する', () => {
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
test('⑤ ~/.codex が無い環境でも報告して終わる', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'r704-nocodex-'));
  try {
    const report = JSON.parse(runSetup(['--json'], home));
    assert.equal(report.rows.find((r) => r.name === 'codex')?.state, 'miss');
    assert.ok(report.rows.some((r) => r.name === 'startup-commands'),
      'Codex が無くても、起動時に何を走らせるかは答えられるべき');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
