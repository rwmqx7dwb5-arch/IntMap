/* ============================================================================
 *  #R399 — 「Edge Function の本数」を、2文書1文から全文書全出現へ広げた回の回帰テスト
 * ----------------------------------------------------------------------------
 *  `docs/FILES.md` §3.12 は「全11本」「9本」と書いたまま12本の木の上に載っていた。数だけ直すの
 *  では次に同じことが起きる——`scripts/doc-facts.mjs` の規則2が**なぜ黙っていたか**が本題である。
 *  黙っていた理由は3つあり、3つとも「落ちなかった」のではなく「**見ていなかった**」:
 *
 *    · 走査する文書名が**手書きの2件**だった。`docs/FILES.md` は一度も入っていない。
 *    · 数の needle が**リテラルの `*` を必須**にしていた（`\*\*?` は「`*` 1個＋任意の2個目」）。
 *      `AGENTS.md` は `**Edge Functions は 12 本**` と書く——アスタリスクは名詞の**前**なので
 *      一致は常に null。AGENTS.md の数は一度も検査されていない。合っていたのは、下の
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
import { runGate } from './helpers/gate-precondition.mjs';
import { readLF } from '../scripts/eol.mjs';
/* (#R699) the test asks the real module which sentences state a count, instead of carrying a
   second copy of the needle — see ② and ④ below. */
import { claims, CHECKED } from '../scripts/doc-claims.mjs';
const WORDS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
import { sharedRoster, inventories } from '../scripts/shared-roster.mjs';

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

/* (#R694) 名簿の変異は**実体から導く**。`scripts/shared-roster.mjs` が「どの一節が `_shared/` の
   目録を名乗っているか」を持っている唯一の実装なので、検査もそれに訊く——規則を書き写すと
   規則が2つになる（.agents/rules/no-ad-hoc-hardcoding.md §2.3）。落とすのは**最後の1本**:
   窓で切っていた実装が最初に失うのが名簿の末尾だから（#R690 の形そのもの）。 */
const dropOneName = (body) => {
  const roster = sharedRoster(ROOT);
  const inv = inventories(body).find((i) => i.names.length && i.names.every((n) => roster.includes(n)));
  if (!inv) return null;
  const victim = inv.names[inv.names.length - 1];
  const n = victim.replace(/\./g, '\\.');
  const SEP = '[ \\t\\r\\n]*[/,・][ \\t\\r\\n]*';
  for (const re of [new RegExp(SEP + '`?' + n + '`?'), new RegExp('`?' + n + '`?' + SEP)]) {
    if (re.test(inv.text)) return body.replace(inv.text, () => inv.text.replace(re, () => ''));
  }
  return null;
};

/* 各ケース: 壊す対象・壊し方・報告が**名指すべき規則名**。成否にかかわらずバイト列を戻す。 */
const CASES = [
  /* ① 手書き一覧に一度も入っていなかった文書。これがこの回の報告そのもの。 */
  { rule: 'edge-count', file: 'docs/FILES.md', why: 'the ledger that drifted was never in the list',
    from: 'Edge Function は全17本をここに宣言する', to: 'Edge Function は全11本をここに宣言する' },

  /* ① 同じ文書の**2つ目**の出現。§6.2 の見出しは正しいまま残す——`.match()` が最初の1件で
     満足していた穴は、まさにこの形でしか再現しない。 */
  { rule: 'edge-count', file: 'Architecture.md', why: 'the second claim in a file whose first claim is right',
    from: '**Edge Functions を17本デプロイする**', to: '**Edge Functions を10本デプロイする**' },

  /* ① 英単語で書かれた数。`SECURITY.md` は外部の報告者向けで、日本語の needle では読めない。 */
  { rule: 'edge-count', file: 'SECURITY.md', why: 'a count spelled as an English word',
    from: '**seventeen** Edge Functions', to: '**eight** Edge Functions' },

  /* ② `_shared/` の一覧から1本抜く。`_shared` は関数ではないので①の分母には入らない。
     ⚠ (#R694) ここは長く**綴りを錨にしていた**——`'news-cluster.js / news-geo-prompt.js / …'`
     という当時の並びそのままである。名簿に2本足したら、その並びはもう文書に無い。
     `assert.ok(re.test(original))` が落ち、**正しい追記が CI を赤くした**（#R488／#R530 の形）。
     錨が測っていたのは「名簿が正しいか」ではなく「名簿が去年と同じ字で書いてあるか」だった。
     ⇒ **壊し方で書く**: 実際の `_shared/` を読み、その文書の名簿から**1本落とす**。
     何が並んでいるかは実体から来るので、正しい追記では錨が外れない。 */
  { rule: 'edge-shared', file: 'docs/FILES.md', why: 'a name dropped from the _shared roster',
    mutate: (body) => dropOneName(body) },

  /* ② 指示側の同じ一覧。⚠ (#R628) これは長く AGENTS.md にあったが、そのファイルの 32,768 バイトの
     天井と `edge-functions` 規則が引っぱり合っていたので、名簿の正本ごと docs/AGENT-SETUP.md §9 へ移した
     （AGENTS.md §12 が「天井に当たったら上げるのではなく正本を移す」と要求している形）。**変異の足場は
     正本について置く**——写しの側に置くと、正本が動いた次のラウンドで足場だけが残る。 */
  { rule: 'edge-shared', file: 'docs/AGENT-SETUP.md', why: 'the same roster in the setup document',
    mutate: (body) => dropOneName(body) },
];

test('R399 ① every hole this round closed goes RED when its fact is made wrong', async () => {
  /* ⚠ 木は共有されている。tests/r274 ③ と tests/r280 ② が同じことを同じ理由でやっており、
     `node --test` は3ファイルを同時に走らせる——tests/helpers/gate-lock.mjs 参照。 */
  await withTreeLock(() => {
    /* ⚠ (#R623) この前提が落ちたとき、読み手の前には2つの別々の失敗がある——「ゲートが赤い」と
       「錠が破れて他人の変異を自分の赤として読んだ」。木ではなく**錠**に訊く: 書き手は全員錠を
       取るので、「他に誰か書けたか」の答えを持っているのは錠のほうである。
       判断は `tests/helpers/gate-precondition.mjs`。 */
    const pre = runGate(docFacts);
    assert.equal(pre.code, 0, 'check:docs must be green before any of this means anything:\n'
      + pre.out + '\n--- who to suspect ---\n' + pre.explain());

    for (const c of CASES) {
      const originalBytes = rd(c.file);
      const original = readLF(join(ROOT, c.file));
      let broken;
      if (c.mutate) {
        broken = c.mutate(original);
        assert.ok(broken, `${c.file}: could not derive the «${c.why}» breakage from the real roster`);
      } else {
        const re = anchorRe(c.from);
        assert.ok(re.test(original), `${c.file} no longer contains the anchor for «${c.why}»`);
        broken = original.replace(re, () => c.to);
      }
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
    /* ⚠ (#R699) THIS MUTATION USED TO NAME TWO SENTENCES BY HAND, AND THERE WERE THREE.
       Architecture.md §6.2 also opens 「⚠ **17本すべてを…宣言する」, which the old needle could
       not see (it attaches to no noun and leans on the heading above it) and which
       scripts/doc-claims.mjs does see. So the hand-written pair no longer silenced the 正本: one
       claim survived, the rule correctly still found a count, and this test failed — for the
       implementation having got BETTER. A mutation that lists the sentences it knows about
       measures the list, the way #R694's anchor measured last year's spelling.
       Ask the module which sentences state the count, and blank every one of them. */
    const SUBJECT = { noun: 'Edge Functions?', units: ['本', '函数'], words: { seventeen: 17 } };
    const stated = claims(original, SUBJECT).items.filter((c) => CHECKED.includes(c.kind))
      .sort((a, b) => b.index - a.index);
    assert.ok(stated.length >= 3, `Architecture.md states the count in ${stated.length} place(s) — this mutation expects the 正本 to carry it more than twice`);
    let silent = original;
    for (const c of stated) {
      /* replace the digits of that quantity with a word, in place, leaving everything else */
      const head = silent.slice(0, c.index), tail = silent.slice(c.index);
      silent = head + tail.replace(/\d[\d,]*/, 'すべて');
    }
    assert.notEqual(silent, original, 'Architecture.md no longer states the count anywhere');
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
    'the stale ordinal came back: news-ingest is one of fourteen, not "the 9th"');
});

test('R399 ④ the sweep reaches every current-state document, not a hand-written few', () => {
  /* 穴の根はここだった: 走査対象が2件の手書きだったこと。
     ⚠ (#R699) THIS USED TO PIN THE IMPLEMENTATION'S SPELLING — it required the literal
     `matchAll(` inside rule 2a and carried a VERBATIM COPY of the old separator needle to decide
     which documents counted as holders. Both broke the day the judgement moved into
     `scripts/doc-claims.mjs`, and neither was ever the thing worth protecting: the first measured
     how the rule is written, and the second was a second copy of the rule
     (.agents/rules/no-ad-hoc-hardcoding.md §2.3 — a rule written twice is two rules).
     What matters is the FACT: the rule reads every current-state document, and more than a
     couple of them state the count in a shape the gate can actually read. Both are asked of the
     real module now, so a correct rewrite cannot fail this and a narrowed sweep cannot pass it. */
  const src = rd('scripts/doc-facts.mjs');
  const rule = src.slice(src.indexOf('2a.'), src.indexOf('2b.'));
  assert.ok(rule.length > 200, 'rule 2a is no longer where this test expects it in scripts/doc-facts.mjs');
  assert.match(rule, /eachDoc\(/, 'the count rule stopped sweeping every document');
  assert.doesNotMatch(rule, /\[\s*'CLAUDE\.md'\s*,\s*'Architecture\.md'\s*\]/,
    'the count rule is reading a hand-written document list again — that is the defect this round removed');

  const SUBJECT = { noun: 'Edge Functions?', units: ['本', '函数'], words: WORDS };
  const docs = [
    ...readdirSync(ROOT).filter((f) => f.endsWith('.md') && !/^DEV-NOTES/.test(f) && f !== 'CLAUDE.local.md'),
    ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f),
  ];
  const holders = docs.filter((f) => claims(rd(f), SUBJECT).items.some((c) => CHECKED.includes(c.kind)));
  assert.ok(holders.length >= 5,
    `only ${holders.length} documents state the Edge Function count in a shape the gate can read: ${holders.join(', ')}`);

  /* …and the rule must pick up MORE THAN THE FIRST HIT in a document that states it twice —
     the first-hit-only `.match()` was half of what #R399 removed. */
  const twice = docs.find((f) => claims(rd(f), SUBJECT).items.filter((c) => CHECKED.includes(c.kind)).length > 1);
  assert.ok(twice, 'no current-state document states the count more than once — the first-hit-only guard cannot be proven');
});

