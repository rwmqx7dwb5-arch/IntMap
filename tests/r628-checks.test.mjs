/* ============================================================================
 *  #R628 — 恒久指示が、宛先の無い番地と、誰も呼ばないゲートと、見ていない文書を持っていた回
 * ----------------------------------------------------------------------------
 *  文書どうしの食い違いを見る仕組みは既に厚い（`scripts/doc-facts.mjs` の 30 余の規則）。
 *  それでも、**毎ラウンド従えと書いてある指示のほうが宛先を失っていた**:
 *
 *    · `AGENTS.md`「最終報告の末尾には、§11.8 のバックアップ状態を必ず記載する」— §11 は
 *      11.4 で終わる。**毎回の最終報告が指す番地が空だった。**
 *    · `docs/FILES.md` が 2 か所で `CLAUDE.md` §6 を指していた。#R503 が恒久指示を
 *      `AGENTS.md` へ移してから、その文書は §A-5 までしか持たない。
 *    · `check:bordercoast` は package.json にあり、両方の指示表に名があり、**ci.yml にも
 *      `npm test` にも呼び出し元が無かった**（18 本中これ 1 本）。自分のソースには
 *      「as `npm run check:bordercoast` does in CI」と書いてあった。
 *    · `fonts/README.md` は、恒久指示の引用と **OFL が要求するライセンス表示そのもの**を
 *      担う現状文書でありながら、索引にも、この検査の走査母集合にも入っていなかった——
 *      除外されていたのではなく、**母集合が手で 2 つのディレクトリを読んでいた**だけ。
 *
 *  よってここが検査するのは「今の文面が正しいこと」ではない（それは `check:docs` の仕事）。
 *  **新しい 3 規則と、広げた母集合が、実際に赤くなること**である。
 *
 *    ① `section-refs` — 存在しない節を指すと落ちる（見出しそのものの形）
 *    ② `section-refs` — 「§3 の 5 番」の項目参照は通り、**範囲外の項目番号は落ちる**
 *    ③ `gate-callers` — 宣言されたゲートの呼び出し元を外すと落ちる
 *    ④ 母集合 — `fonts/README.md` は実際に走査されている（索引の行を外すと落ちる）
 *    ⑤ `languages` — 9 言語の名簿を**別名の綴り**で書くと落ちる（#R588 の形）
 *    ⑥ 上の①〜⑤が使う `--rule=` の近道が、綴りを間違えたら黙って緑にならないこと
 *
 *  ⚠ 実行コスト（#R407 が二度つまずいた形をそのまま踏襲する）。変異は**木のロックを握った
 *  まま**回すので、素の `doc-facts`（11 秒・うち 10 秒は `i18n-pair-audit` の子プロセス）
 *  ではなく `--rule=`（約 1 秒）で回し、**取得は 1 回に畳む**。ロックは
 *  `node_modules/.intmap-tree-lock` にあり、`node_modules` は原本からの junction なので
 *  **このマシンの全 worktree が同じ錠を共有している**——握る時間を短く、取る回数を少なく、
 *  待つ時間を長く。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const LOCK_MS = 600_000;

const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

function docFacts(...extra) {
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check', ...extra],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}
const only = (rule) => docFacts('--rule=' + rule);

/** 壊す → 回す → **必ず**元のバイト列に戻す */
function withBroken(edits, fn) {
  const saved = edits.map((e) => [e.file, rd(e.file)]);
  try {
    for (const e of edits) {
      /* ⚠ `all` matters. The index writes a path TWICE — once as the link label and once as the
         href — so mutating the first occurrence left the second one satisfying a substring test,
         and the mutation proved nothing. */
      const re = e.all ? new RegExp(anchorRe(e.from).source, 'g') : anchorRe(e.from);
      assert.ok(anchorRe(e.from).test(readLF(join(ROOT, e.file))), `${e.file} no longer contains the anchor for «${e.why}»`);
      writeFileSync(join(ROOT, e.file), readLF(join(ROOT, e.file)).replace(re, () => e.to));
    }
    return fn();
  } finally {
    for (const [f, bytes] of saved) writeFileSync(join(ROOT, f), bytes);
  }
}

/* ── ①〜⑤ 変異。取得は 1 回だけ ─────────────────────────────────────────────────────────── */
test('R628 the three new document rules actually go red', { timeout: 900_000 }, async (t) => {
  await withTreeLock(async () => {

    /* ① 存在しない節を指す。壊すのは**この検査が実在を確かめている当の形**——文書の名前を
       挙げたうえでの §番号。`AGENTS.md` §11 は 11.4 で終わるので §11.9 は宛先が無い。 */
    await t.test('① a §-reference into a section that does not exist fails', () => {
      const r = withBroken([{
        file: 'docs/TESTING.md', why: 'a cross-document §-reference',
        from: '`AGENTS.md` §11.2', to: '`AGENTS.md` §11.9',
      }], () => only('section-refs'));
      assert.equal(r.code, 1, 'a §-reference with no such section was accepted');
      assert.match(r.out, /AGENTS\.md §11\.9/, 'the report does not name the dead address');
    });

    /* ② 「§3 の 5 番」の形。`AGENTS.md` §3 は 9 項の番号付き箇条書きなので §3.2 は本物の番地
       だが、§3.99 はそうではない。⚠ **これが静かにずれる向き**である——§3 に 1 項挿入すると
       それより下を指す参照が全部ずれるのに、見出しではないのでどの検査も気づかない。 */
    await t.test('② an item reference is resolved, and an out-of-range item fails', () => {
      assert.equal(only('section-refs').code, 0, 'the tree is not green before the mutation');
      const r = withBroken([{
        file: 'docs/COMPANIES.md', why: 'the 「§3 の 2 番」 item form',
        from: '`AGENTS.md` §3.2', to: '`AGENTS.md` §3.99',
      }], () => only('section-refs'));
      assert.equal(r.code, 1, 'an item number past the end of the list was accepted');
      assert.match(r.out, /§3\.99/, 'the report does not name the out-of-range item');
    });

    /* ③ 宣言されたゲートの呼び出し元を外す。母集合は package.json——**ゲートは、自分が宣言
       されている一覧からは隠れられない**。手で書いた表からは隠れられる。 */
    await t.test('③ a declared check:* gate with no caller fails', () => {
      const r = withBroken([{
        file: '.github/workflows/ci.yml', why: 'the bordercoast gate step',
        from: 'run: npm run check:bordercoast', to: 'run: echo skipped',
      }], () => only('gate-callers'));
      assert.equal(r.code, 1, 'a gate nobody runs was accepted');
      assert.match(r.out, /check:bordercoast/, 'the report does not name the orphan gate');
    });

    /* ④ 母集合が、根と `docs/` の外へ届いていること。`fonts/README.md` は OFL の表示義務を
       担う現状文書で、#R628 まで**どの走査にも入っていなかった**。索引の行を外して落ちれば、
       それは母集合に入っている証拠。⚠ 「除外されていない」ことと「見られている」ことは別。 */
    await t.test('④ the prose universe reaches outside the root and docs/', () => {
      assert.match(only('doc-index').out, /all \d+ prose documents/, 'doc-index did not report');
      const r = withBroken([{
        file: 'docs/README.md', why: 'the index row for fonts/README.md', all: true,
        from: 'fonts/README', to: 'fonts/READ-ME',
      }], () => only('doc-index'));
      assert.equal(r.code, 1, 'a document outside root and docs/ is still invisible to the index rule');
      assert.match(r.out, /fonts\/README\.md/, 'the report does not name the unindexed document');
    });

    /* ⑤ #R588 の形。数は 9 のままで、綴りだけを `lang-registry.js` が別名として受理するほうへ
       倒す。**計器は落ちない**（fallback が実在する文字列だから）というのが実測された欠陥で、
       それを落とすのがこの規則。 */
    await t.test('⑤ a nine-language roster written in the alias spellings fails', () => {
      const codes = rd('js/locales/_langs.js');
      assert.match(codes, /"jp"/, 'this project no longer keys Japanese on jp — rewrite this test');
      const r = withBroken([{
        file: 'PRODUCT.md', why: 'the nine-language roster',
        from: 'jp', to: 'ja',
      }], () => only('languages'));
      assert.equal(r.code, 1, 'a roster in the alias spelling was accepted');
      assert.match(r.out, /alias/, 'the report does not say the spelling is an alias');
    });

    /* ⑤b 変異していない木では、この回が足した規則が緑であること。
       ⚠ **この主張はロックの中でしか成り立たない。** 最初はロックを取らない ⑥ に置いていて、
       全件並列で赤くなった——`tests/r274-checks` ③ は**ロックを取ったうえで未追跡の文書を
       `docs/` に書き下ろす**負の証拠で、#R628 が母集合に未追跡分を足したことで、その 334 秒の
       あいだ `doc-index` は正しく赤い。**木の状態についての主張は、木を止めてから訊く。** */
    await t.test('⑤b the rules this round added are green on the unmutated tree', () => {
      for (const rule of ['section-refs', 'gate-callers', 'bordercoast-rings', 'doc-index', 'languages']) {
        assert.equal(only(rule).code, 0, `${rule} is not green on the unmutated tree`);
      }
    });
  });
});

/* ── ⑥ 近道そのものが黙らないこと ────────────────────────────────────────────────────────
   ⚠ ロックを**取らない**。読むだけの検査がロックを待つ理由は無い（#R407 実測: そこで取った版は、
   他ファイルが 182 秒握っている間に 180 秒で落ちた）。
   ⚠ **だからここで木の状態を訊いてはならない。** 綴りを間違えた `--rule` は、どの規則が緑かに
   関係なく exit 2 でなければならない——それが「近道が黙らない」という主張のすべてで、
   木が緑かどうかは別の主張（⑤b）である。両方をここに置いた最初の版は、`tests/r274-checks` ③ が
   未追跡の負の証拠を置いている 334 秒のあいだ、正しく赤い `doc-index` を自分の失敗として読んだ。 */
test('R628 ⑥ --rule= with a name that matches nothing is an error, not a pass', () => {
  const r = docFacts('--rule=section-ref');            /* 本物は section-refs */
  assert.equal(r.code, 2, 'a misspelt --rule exited as though the rule had passed');
  assert.match(r.out, /matched no rule/, 'the report does not say the name matched nothing');
});
