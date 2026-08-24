/* ============================================================================
 *  #R399 — 「Edge Function の本数」を、2文書1文から全文書全出現へ広げた回の回帰テスト
 * ----------------------------------------------------------------------------
 *  `docs/FILES.md` §3.12 は「全11本」「9本」と書いたまま12本の木の上に載っていた。数だけ直すの
 *  では次に同じことが起きる——`scripts/doc-facts.mjs` の規則2が**なぜ黙っていたか**が本題である。
 *  黙っていた理由は3つあり、3つとも「落ちなかった」のではなく「**見ていなかった**」:
 *
 *    · 走査する文書名が**手書きの2件**だった。`docs/FILES.md` は一度も入っていない。
 *    · 数の needle が**リテラルの `*` を必須**にしていた（`\*\*?` は「`*` 1個＋任意の2個目」）。
 *      `CLAUDE.md` は `**Edge Functions は 12 本**` と書く——アスタリスクは名詞の**前**なので
 *      一致は常に null。CLAUDE.md の数は一度も検査されていない。合っていたのは、下の
 *      「全部の名前が出てくるか」の検査が別の理由で効いていたからで、**発火しない検査は
 *      通った検査と見分けがつかない**。
 *    · `.match()` は**最初の1件**しか返さない。`Architecture.md` は §6.2 の見出しで正しい数を
 *      名乗るので、§10.1 の2つ目の主張は永久に見えなかった。
 *
 *  よってここで検査するのは「今の数が12であること」ではない（それは `check:docs` の仕事）。
 *  **上の3つの穴それぞれについて、塞いだ側が実際に赤くなること**である。
 *
 *    ① 数の規則が、文書ごと・出現ごとに**落ちる**——手書き一覧に無かった文書でも、
 *       同じ文書の2つ目の出現でも、英単語で書かれた数でも。
 *    ② `_shared/` の一覧が**欠けたら**落ちる（`_shared` は関数ではないので①の分母に入らない）。
 *    ③ 正本（`Architecture.md` §6.2）が数を**名乗らなくなったら**落ちる。
 *       規則が黙って見なくなるのが、この回で塞いでいる当のものだから。
 *    ④ 逆向き——「Edge Function 1 本」（＝1本がこれをする）を在庫の主張と読まない。
 *       読んでしまう needle は、正しい文の上で赤を出す。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ⚠ (#R286/#R283) 錨は LF で書いてあり、このチェックアウトはそうとは限らない。`.gitattributes`
   が LF に固定しているのは Linux が実行する拡張子だけで、`*.md` は `core.autocrlf` 任せ。
   照合は改行を緩めた正規表現で行い、**復元は元のバイト列**で行う（正規化して書き戻すと、
   テストを走らせた副作用として作業ツリーの改行が書き換わる）。 */
const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

function docFacts() {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* 各ケース: 壊す対象・壊し方・報告が**名指すべき規則名**。成否にかかわらずバイト列を戻す。 */
const CASES = [
  /* ① 手書き一覧に一度も入っていなかった文書。これがこの回の報告そのもの。 */
  { rule: 'edge-count', file: 'docs/FILES.md', why: 'the ledger that drifted was never in the list',
    from: 'Edge Function は全12本をここに宣言する', to: 'Edge Function は全11本をここに宣言する' },

  /* ① 同じ文書の**2つ目**の出現。§6.2 の見出しは正しいまま残す——`.match()` が最初の1件で
     満足していた穴は、まさにこの形でしか再現しない。 */
  { rule: 'edge-count', file: 'Architecture.md', why: 'the second claim in a file whose first claim is right',
    from: '**Edge Functions を12本デプロイする**', to: '**Edge Functions を10本デプロイする**' },

  /* ① 英単語で書かれた数。`SECURITY.md` は外部の報告者向けで、日本語の needle では読めない。 */
  { rule: 'edge-count', file: 'SECURITY.md', why: 'a count spelled as an English word',
    from: '**twelve** Edge Functions', to: '**eight** Edge Functions' },

  /* ② `_shared/` の一覧から1本抜く。`_shared` は関数ではないので①の分母には入らない。 */
  { rule: 'edge-shared', file: 'docs/FILES.md', why: 'a name dropped from the _shared roster',
    from: 'news-cluster.js / news-geo-prompt.js / news-ingest.js / volcano-parse.js）', to: 'news-cluster.js / news-ingest.js）' },

  /* ② CLAUDE.md 側の同じ一覧。括弧の形に直したのは、この検査が読める形にするため。 */
  { rule: 'edge-shared', file: 'CLAUDE.md', why: 'the same roster in the standing instructions',
    from: '`atlas-persona.js`・`aviation-codec.js`', to: '`aviation-codec.js`' },
];

test('R399 ① every hole this round closed goes RED when its fact is made wrong', async () => {
  /* ⚠ 木は共有されている。tests/r274 ③ と tests/r280 ② が同じことを同じ理由でやっており、
     `node --test` は3ファイルを同時に走らせる——tests/helpers/gate-lock.mjs 参照。 */
  await withTreeLock(() => {
    assert.equal(docFacts().code, 0, 'check:docs must be green before any of this means anything');

    for (const c of CASES) {
      const originalBytes = rd(c.file);
      const original = readLF(join(ROOT, c.file));
      const re = anchorRe(c.from);
      assert.ok(re.test(original), `${c.file} no longer contains the anchor for «${c.why}»`);
      const broken = original.replace(re, () => c.to);
      assert.notEqual(broken, original, `the «${c.why}» case did not change ${c.file}`);
      try {
        writeFileSync(join(ROOT, c.file), broken);
        const r = docFacts();
        assert.equal(r.code, 1, `check:docs stayed GREEN with ${c.file} broken — ${c.why}`);
        assert.ok(r.out.includes(c.rule), `check:docs failed but never named ${c.rule} (${c.why}):\n` + r.out);
      } finally {
        writeFileSync(join(ROOT, c.file), originalBytes);
      }
    }
    assert.equal(docFacts().code, 0, 'the restore left the tree failing');
  });
});

test('R399 ② the 正本 going SILENT is a failure, not a pass', async () => {
  /* Architecture.md §6.2 は本数の正本（docs/README.md）。数を名乗らない形に書き換えると、
     needle は何も拾わない——そこで「拾わなかった」を緑にすると、この回が塞いだ穴が
     そのまま戻る。両方の主張を消してから、報告が正本を名指すことを確かめる。 */
  await withTreeLock(() => {
    const originalBytes = rd('Architecture.md');
    const original = readLF(join(ROOT, 'Architecture.md'));
    const silent = original
      .replace(anchorRe('### 6.2 Edge Functions — **12本**'), () => '### 6.2 Edge Functions')
      .replace(anchorRe('**Edge Functions を12本デプロイする**'), () => '**Edge Functions をすべてデプロイする**');
    assert.notEqual(silent, original, 'Architecture.md no longer states the count in either place');
    try {
      writeFileSync(join(ROOT, 'Architecture.md'), silent);
      const r = docFacts();
      assert.equal(r.code, 1, 'check:docs stayed green when the 正本 stopped stating the number');
      assert.match(r.out, /edge-count[^\n]*Architecture\.md no longer states/,
        'the report must say the 正本 went silent, not merely that some count is wrong:\n' + r.out);
      /* ⚠ そして「### 6.2 Edge Functions」の `6.2` を数と読んではならない。読むと正本が
         「2本ある」と主張していることになり、上の錨ではなく別の理由で赤くなる。 */
      assert.doesNotMatch(r.out, /says «[^»]*2 Edge Functions»/,
        'the §6.2 section number is being read as a count — that is an address, not an inventory:\n' + r.out);
    } finally {
      writeFileSync(join(ROOT, 'Architecture.md'), originalBytes);
    }
    assert.equal(docFacts().code, 0, 'the restore left the tree failing');
  });
});

test('R399 ③ a bare "Edge Function 1 本" is not read as an inventory claim', () => {
  /* docs/NEWS-EVENTS.md §12.1 は「**Edge Function 1 本**（…）」＝「1本がこれをする」であって
     「1本しか無い」ではない。緑なのがこの文が**在るまま**であることによると確かめる——
     文が消えたせいで緑、は同じ緑に見える（#R385 の形）。 */
  const news = rd('docs/NEWS-EVENTS.md');
  assert.match(news, /\*\*Edge Function 1 本\*\*/,
    'the sentence this guard is about is gone from docs/NEWS-EVENTS.md — the case is no longer proven');
  assert.doesNotMatch(news, /9 本目/,
    'the stale ordinal came back: news-ingest is one of twelve, not "the 9th"');
});

test('R399 ④ the sweep reaches every current-state document, not a hand-written few', () => {
  /* 穴の根はここだった: 走査対象が2件の手書きだったこと。`scripts/doc-facts.mjs` が
     `eachDoc`（＝全現行文書）で数を見ていることを、ソースの形として固定する。 */
  const src = rd('scripts/doc-facts.mjs');
  const rule = src.slice(src.indexOf('2a.'), src.indexOf('2b.'));
  assert.ok(rule.length > 200, 'rule 2a is no longer where this test expects it in scripts/doc-facts.mjs');
  assert.match(rule, /eachDoc\(/, 'the count rule stopped sweeping every document');
  assert.match(rule, /matchAll\(/, 'the count rule went back to a first-hit-only match');
  assert.doesNotMatch(rule, /\[\s*'CLAUDE\.md'\s*,\s*'Architecture\.md'\s*\]/,
    'the count rule is reading a hand-written document list again — that is the defect this round removed');

  /* そして実際に、数を名乗る文書が2件より多く held されていること */
  const docs = [
    ...readdirSync(ROOT).filter((f) => f.endsWith('.md') && !/^DEV-NOTES/.test(f) && f !== 'CLAUDE.local.md'),
    ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f),
  ];
  const holders = docs.filter((f) => /Edge Functions?[ \t]*\**[ \t]*(?:は|を|—|–|-|:|：|（|\()[ \t]*\**[ \t]*(?:全|約)?[ \t]*\d+[ \t]*(?:本|函数)/.test(rd(f))
    || /(?<![\d.§#])\**\b(?:twelve|12)\b\**[ \t]+Edge Functions?\b/.test(rd(f)));
  assert.ok(holders.length >= 5,
    `only ${holders.length} documents state the Edge Function count in a shape the gate can read: ${holders.join(', ')}`);
});
