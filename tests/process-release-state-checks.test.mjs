/* ============================================================================
 *  IntMap · the deployed-combination tool, as far as CI can prove it
 * ----------------------------------------------------------------------------
 *  scripts/release-state.mjs needs production and credentials, so CI proves the verdicts (pure
 *  functions) and that nothing it compares is hand-written.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r745
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commentsOnly, compareTrees, edgeRoster, edgeState, pagesUrlFromRemote, parseMigrationTable, supabaseRefFrom } from '../scripts/release-state.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R745 — was tests/r745-arch-review-followup-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · 配備された組み合わせを測る道具について、CI が証明できること  (#R745)
 * ----------------------------------------------------------------------------
 *  `scripts/release-state.mjs` 自身は本番とネットワークと資格情報を必要とするので CI では
 *  走れない。走れないものについて CI が言えることは 2 つある——**判定の仕方**（純関数として
 *  取り出してある）と、**名前を手で書いていないこと**。ここはその 2 つだけを測る。
 *
 *  ⚠ このファイルが最後まで走り切ること自体が 1 つの検査である。道具は import されたときに
 *  何も実行してはならない（実行すれば本番へ 17 回の取得が始まる）。`await main()` に付いている
 *  argv の番人が外れたら、このテストはネットワークを叩いて止まる。
 * ==========================================================================*/

const TOOL = 'scripts/release-state.mjs';
const SOURCE = readFileSync(path.join(ROOT, TOOL), 'utf8');

test('#R745 ① Pages の URL は remote から導かれる（どの綴りの remote でも）', () => {
  assert.equal(pagesUrlFromRemote('https://github.com/Owner/Repo.git'), 'https://owner.github.io/Repo/');
  assert.equal(pagesUrlFromRemote('git@github.com:Owner/Repo.git'), 'https://owner.github.io/Repo/');
  assert.equal(pagesUrlFromRemote('https://github.com/Owner/Repo'), 'https://owner.github.io/Repo/');
  assert.equal(pagesUrlFromRemote('https://example.invalid/x.git'), null, 'GitHub でない remote に URL を作ってはならない');
  assert.equal(pagesUrlFromRemote(''), null);
});

test('#R745 ② Supabase の project ref は、出荷しているコードが叩いている URL から読む', () => {
  const vendor = readFileSync(path.join(ROOT, 'src/vendor.js'), 'utf8');
  const ref = supabaseRefFrom(vendor);
  assert.ok(ref && ref.length > 10, `src/vendor.js から project ref を読めなかった: ${ref}`);
  assert.equal(supabaseRefFrom('何も無い'), null, '読めないときは null——当てずっぽうを返さない');
  /* (tests regrouped by subject) 導出であることを評価で確かめる: 本物と違う ref を書いた入力を渡せば、
     その ref が返る。定数を返す実装はここで落ちる。 */
  assert.equal(supabaseRefFrom("createClient('https://zzzzqqqqwwwweeeerrrr.supabase.co', key)"), 'zzzzqqqqwwwweeeerrrr',
    'supabaseRefFrom は渡されたソースから読んでいない');
  /* ⚠ 導出であることの証拠: 同じ文字列が道具の中に写されていない。
     ⚠ これだけは綴りの検査のまま残す: 道具が ref を使う場所（本番への取得）は資格情報とネットワークが
     要り、CI で評価できない。その経路が関数を迂回して写しを持っていないことは、ソースを読むしかない。 */
  assert.ok(!SOURCE.includes(ref), `${TOOL} が project ref を手で持っている（導出をやめている）`);
});

test('#R745 ③ Edge Function の名簿はディレクトリの実体で、道具の中に手書きされていない', () => {
  const roster = edgeRoster(ROOT);
  assert.ok(roster.length >= 10, `名簿が短すぎる: ${roster.length}`);
  assert.ok(!roster.includes('_shared'), '_shared/ はライブラリであって関数ではない');
  /* (tests regrouped by subject) ディレクトリの実体であることを評価で確かめる: 本物に無い名前だけの木を
     渡せば、その名前だけが返る。手書きの一覧を返す実装はここで落ちる。 */
  const fake = mkdtempSync(path.join(tmpdir(), 'r745-roster-'));
  try {
    for (const d of ['zz-new-fn', 'aa-other-fn', '_shared']) mkdirSync(path.join(fake, 'supabase/functions', d), { recursive: true });
    assert.deepEqual(edgeRoster(fake), ['aa-other-fn', 'zz-new-fn'], 'edgeRoster が渡された木のディレクトリを数えていない');
  } finally { rmSync(fake, { recursive: true, force: true }); }
  /* ⚠ 下は綴りの検査のまま残す: 名簿を使う経路（配備済みの関数の取り寄せ）は本番と資格情報が要り、
     CI では評価できない。その経路が関数を迂回して名前を持っていないことは、ソースを読むしかない。 */
  for (const name of roster) {
    assert.ok(!SOURCE.includes(`'${name}'`) && !SOURCE.includes(`"${name}"`),
      `${TOOL} が「${name}」を綴りで持っている。手で並べた一覧は、次に足された関数を黙って落とす`);
  }
});

test('#R745 ④ migration の表は、片側にしか無いものを分けて読む', () => {
  const table = [
    '  Local          | Remote         | Time (UTC)          ',
    '  ----------------|----------------|---------------------',
    '   20260718090000 |                | 2026-07-18 09:00:00 ',
    '   20260720120000 | 20260720120000 | 2026-07-20 12:00:00 ',
    '                  | 20260722000000 | 2026-07-22 00:00:00 ',
    '',
    'A new version of Supabase CLI is available: v2.117.0',
  ].join('\n');
  const t = parseMigrationTable(table);
  assert.deepEqual(t.both, ['20260720120000']);
  assert.deepEqual(t.localOnly, ['20260718090000']);
  assert.deepEqual(t.remoteOnly, ['20260722000000']);
  assert.deepEqual(parseMigrationTable(''), { both: [], localOnly: [], remoteOnly: [] });
});

/* ⚠⚠⚠ これが #R745 の欠陥そのものの回帰。道具の最初の版は `git diff --numstat` の出力が
   空かどうかで一致を決めていた。呼び出し側は失敗時に空文字列を返す作りだったので、
   **中身が違う 17 本すべてが「一致」として報告された**。判定はバイトに付いていなければならない。 */
test('#R745 ⑤ git が何も答えられなくても、中身が違えば違うと報告する', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'r745-'));
  try {
    const deployed = path.join(dir, 'deployed', 'fn');
    const repo = path.join(dir, 'repo', 'fn');
    mkdirSync(deployed, { recursive: true });
    mkdirSync(repo, { recursive: true });
    writeFileSync(path.join(deployed, 'index.ts'), 'export const a = 1;\n');
    writeFileSync(path.join(repo, 'index.ts'), 'export const a = 2;\n');
    writeFileSync(path.join(deployed, 'same.js'), 'x\n');
    writeFileSync(path.join(repo, 'same.js'), 'x\n');

    const mute = () => '';                       /* 「何も言えない git」 */
    const cmp = compareTrees(path.join(dir, 'deployed'), path.join(dir, 'repo'), mute);
    assert.equal(cmp.files, 2);
    assert.deepEqual(cmp.same, ['fn/same.js']);
    assert.equal(cmp.differs.length, 1, '違っているファイルが「一致」に落ちた');
    assert.equal(cmp.differs[0].file, 'fn/index.ts');

    /* リポジトリに無いファイルは「配備だけが持っている」——黙って一致にしない */
    writeFileSync(path.join(deployed, 'gone.js'), 'y\n');
    assert.deepEqual(compareTrees(path.join(dir, 'deployed'), path.join(dir, 'repo'), mute).missingInRepo, ['fn/gone.js']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('#R745 ⑥ 1 ファイルも取り寄せられなかったものは「一致」ではなく「測れなかった」', () => {
  assert.equal(edgeState({ files: 0, same: [], differs: [], missingInRepo: [] }), 'unknown');
  assert.equal(edgeState(null), 'unknown');
  assert.equal(edgeState({ files: 3, same: ['a'], differs: [], missingInRepo: [] }), 'identical');
  assert.equal(edgeState({ files: 3, same: [], differs: [{ file: 'a' }], missingInRepo: [] }), 'differs');
  assert.equal(edgeState({ files: 3, same: [], differs: [], missingInRepo: ['a'] }), 'differs');
});

test('#R745 ⑦「註だけの差」の判定は安全な側にだけ間違える', () => {
  assert.equal(commentsOnly('--- a\n+++ b\n@@\n-// old\n+// new\n'), true);
  assert.equal(commentsOnly('--- a\n+++ b\n@@\n-const a = 1;\n+const a = 2;\n'), false);
  /* コードが 1 行でも混ざれば「註だけ」ではない */
  assert.equal(commentsOnly('--- a\n+++ b\n@@\n-// old\n+// new\n-const a = 1;\n+const a = 2;\n'), false);
  assert.equal(commentsOnly(''), false, '差が無いことを「註だけ」と呼ばない');
});

test('#R745 ⑧ 道具は文書から辿れて、CI のゲートにはなっていない', () => {
  const release = readFileSync(path.join(ROOT, 'docs/RELEASE.md'), 'utf8');
  assert.ok(release.includes(TOOL), `docs/RELEASE.md が ${TOOL} を案内していない`);
  const files = readFileSync(path.join(ROOT, 'docs/FILES.md'), 'utf8');
  assert.ok(files.includes(path.basename(TOOL)), `docs/FILES.md の台帳に ${path.basename(TOOL)} が無い`);

  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const runners = Object.entries(pkg.scripts).filter(([, v]) => String(v).includes('release-state'));
  assert.ok(runners.length, 'package.json から呼べる名前が無い');
  for (const [name] of runners) assert.ok(!name.startsWith('check:'), `${name} は check:* に見える。この道具は CI では走れない（本番と資格情報が要る）`);
  const testScript = String(pkg.scripts.test || '');
  assert.ok(!testScript.includes('release-state'), 'npm test に入れてはならない（CI のチェックアウトは detached な PR ref）');
});

test('#R745 ⑨ 道具そのものが構文として正しく、実行しても import しても壊れない', () => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, TOOL)], { stdio: 'ignore' });
  assert.ok(existsSync(path.join(ROOT, TOOL)));
});
}
