/* ============================================================================
 *  IntMap · the Edge Function count and the _shared/ roster, in every document that states them
 * ----------------------------------------------------------------------------
 *  #R399 widened the count rule from a hand-written pair of documents to every document and every
 *  occurrence; #R694 made the _shared/ roster and arch-files judge the FACT rather than a window,
 *  a line start or last year's spelling. Each hole is proved by making the fact wrong and watching
 *  the rule go red. ⚠ Tree mutations under tests/helpers/gate-lock.mjs.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r399, r694
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CHECKED, claims } from '../scripts/doc-claims.mjs';
import { readLF } from '../scripts/eol.mjs';
import { auditRoster, inventories, sharedRoster } from '../scripts/shared-roster.mjs';
import { declaredEdgeFunctions } from './helpers/edge-functions.mjs';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { runGate } from './helpers/gate-precondition.mjs';
const escapeRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;
/* a literal anchor that tolerates either line ending — the checkout's, not the author's (#R286/#R283) */
const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R399 — was tests/r399-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
/* (#R699) the test asks the real module which sentences state a count, instead of carrying a
   second copy of the needle — see ② and ④ below. */
const WORDS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };

/* ⚠ (#R286/#R283) 錨は LF で書いてあり、このチェックアウトはそうとは限らない。`.gitattributes`
   が LF に固定しているのは Linux が実行する拡張子だけで、`*.md` は `core.autocrlf` 任せ。
   照合は改行を緩めた正規表現で行い、**復元は元のバイト列**で行う（正規化して書き戻すと、
   テストを走らせた副作用として作業ツリーの改行が書き換わる）。 */

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
  const n = escapeRe(victim);
  const SEP = '[ \\t\\r\\n]*[/,・][ \\t\\r\\n]*';
  for (const re of [new RegExp(SEP + '`?' + n + '`?'), new RegExp('`?' + n + '`?' + SEP)]) {
    if (re.test(inv.text)) return body.replace(inv.text, () => inv.text.replace(re, () => ''));
  }
  return null;
};

/* 各ケース: 壊す対象・壊し方・報告が**名指すべき規則名**。成否にかかわらずバイト列を戻す。 */
/* (atlas-semantic-search) the stated count each edge-count case starts from is the DECLARED one
   (supabase/config.toml), not a number typed here — «17» was re-typed every time a function landed,
   and a correct addition turned this file red. Whether a document's number is right is doc-facts'
   business; the case only needs the sentence, and the mutation makes it wrong by one. */
const EDGE_N = declaredEdgeFunctions(ROOT).length;
const EDGE_WORD = Object.keys(WORDS).find((w) => WORDS[w] === EDGE_N);
const CASES = [
  /* ① 手書き一覧に一度も入っていなかった文書。これがこの回の報告そのもの。 */
  { rule: 'edge-count', file: 'docs/FILES.md', why: 'the ledger that drifted was never in the list',
    from: 'Edge Function は全' + EDGE_N + '本をここに宣言する', to: 'Edge Function は全' + (EDGE_N - 1) + '本をここに宣言する' },

  /* ① 同じ文書の**2つ目**の出現。§6.2 の見出しは正しいまま残す——`.match()` が最初の1件で
     満足していた穴は、まさにこの形でしか再現しない。 */
  { rule: 'edge-count', file: 'Architecture.md', why: 'the second claim in a file whose first claim is right',
    from: '**Edge Functions を' + EDGE_N + '本デプロイする**', to: '**Edge Functions を' + (EDGE_N - 1) + '本デプロイする**' },

  /* ① 英単語で書かれた数。`SECURITY.md` は外部の報告者向けで、日本語の needle では読めない。 */
  { rule: 'edge-count', file: 'SECURITY.md', why: 'a count spelled as an English word',
    from: '**' + EDGE_WORD + '** Edge Functions', to: '**eight** Edge Functions' },

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
     real module now, so a correct rewrite cannot fail this and a narrowed sweep cannot pass it.
     (tests regrouped by subject) …and the last spelling went too. This still sliced rule 2a out of
     the source and demanded `eachDoc(` and the absence of the ['CLAUDE.md', 'Architecture.md'] pair.
     That fact is EVALUATED by ① above: it makes the count wrong in docs/FILES.md and in SECURITY.md —
     two documents that hand-written pair never held — and requires `edge-count` to go red on each. */
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R694 — was tests/r694-shared-roster-facts-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R694 — `_shared/` の名簿をめぐる3つの門が、綴りを測っていて事実を測っていなかった回
 * ----------------------------------------------------------------------------
 *  `supabase/functions/_shared/` は 11 本ある。`docs/FILES.md` §3.12 はそのうち 9 本しか
 *  挙げていなかった。3つの門がそれを見ており、3つとも別の理由で黙っていた——そして
 *  「黙っていた」の中身が3つとも**綴りを測っていた**ことだった。
 *
 *    · `scripts/doc-facts.mjs` の `edge-shared` は、mention から **260 文字の窓**を切って
 *      その中に閉じ括弧が要ると書いてあった。`docs/FILES.md` は名簿を3行に折り返しており、
 *      閉じは ~290 文字目。窓に入らないので group は null になり、**名簿ごと素通り**した。
 *      門は「_shared/ holds 11: …」と 11 本を**読み上げながら**、9 本しか書いていない文書を
 *      通した。同じ名簿を 8 本に削ると閉じが窓に戻ってきて即座に赤くなる——つまり
 *      **見逃す件数を決めていたのは、抜けの数ではなく本文の長さ**だった。
 *      さらに「3 本未満は目録ではない」という閾値があり、11 本から 9 本抜くのは捕まえるが
 *      10 本から 9 本抜くのは見逃した。件数は目録の条件ではなかった。
 *    · `scripts/arch-files-check.mjs` は §3.1 以下の**行頭の「名前.js」**を js/ のモジュール
 *      宣言と読み、そうでないものを手書きの控除表（src/・scripts/・`sw|admin|vite.config|
 *      playwright|_.*`）で引いていた。名簿を折り返して行頭を `radiation-sources.js` にした
 *      瞬間、**正しい文書の上で赤**になった。名簿は「たまたま js/ にも同名がある 5 つ」でしか
 *      改行できず、**体裁の制約が検査から漏れ出していた**。
 *    · `tests/r399-checks.test.mjs` ① は名簿の**綴りそのもの**を変異の錨にしていたので、
 *      名簿に 2 本足したら錨が消え、**正しい追記が CI を赤くした**（#R488／#R530 の形）。
 *
 *  よってここで測るのは「いま 11 本であること」ではない（それは check:docs の仕事）。
 *  **3つの門それぞれについて、綴りではなく事実を見るようになったこと**である。
 *
 *    ① `_shared/` の**どの1本**を**どの名簿**から落としても、edge-shared が名指して落ちる
 *    ② 名簿の**長さ**は判定に関与しない（窓が戻ってきたら鳴る）
 *    ③ 読めなかった括弧は**素通りではなく失敗**（「読めない」を「問題なし」で出さない）
 *    ④ ファイル1本への言及（`_shared/newsgeo.js`（…））は目録ではない／hedge は据え置き
 *    ⑤ arch-files は §3 の**構造**で js/ 宣言を見分ける——名簿は**どの名前でも改行できる**
 *    ⑥ arch-files は本物の欠陥では依然として赤い（緩めて通したのではない）
 *    ⑦ js/ のモジュールを supabase の段に書いても「記述した」ことにならない
 * ==========================================================================*/

const ROSTER = sharedRoster(ROOT);

/* 名簿を書いている文書は、名簿そのものから発見する——手で並べた一覧は、次に足された文書を
   黙って落とす（.agents/rules/no-ad-hoc-hardcoding.md §2.4） */
const DOCS = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.md') && !/^DEV-NOTES/.test(f) && f !== 'CLAUDE.local.md'),
  ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f),
];
const rosterDocs = DOCS.filter((f) => inventories(rd(f)).some((i) => i.names.some((n) => ROSTER.includes(n))));

test('R694 ① every name, dropped from every roster, is named by edge-shared', () => {
  assert.ok(ROSTER.length >= 10, `_shared/ holds only ${ROSTER.length} — this sweep assumes a real roster`);
  assert.ok(rosterDocs.length >= 3,
    `only ${rosterDocs.length} document(s) enumerate _shared/: ${rosterDocs.join(', ')} — the sweep has nothing to sweep`);

  for (const f of rosterDocs) {
    const body = rd(f);
    /* 現状は完全であること。ここが偽なら以下の「落とすと鳴る」は意味を持たない */
    assert.deepEqual(auditRoster(body, ROSTER), [], `${f} does not list all of _shared/ right now`);

    const inv = inventories(body).find((i) => i.names.some((n) => ROSTER.includes(n)));
    for (const victim of ROSTER) {
      /* その名前だけを名簿から消す。区切りは文書ごとに違う（`/`・`・`・`,`）ので、
         綴りではなく「名前と、その隣の区切り1つ」を落とす */
      const n = escapeRe(victim);
      const SEP = '[ \\t\\r\\n]*[/,・][ \\t\\r\\n]*';
      const cut = [new RegExp(SEP + '`?' + n + '`?'), new RegExp('`?' + n + '`?' + SEP)]
        .find((re) => re.test(inv.text));
      assert.ok(cut, `${f}: ${victim} is not in the roster passage in a shape this test can cut`);
      const brokenInv = inv.text.replace(cut, () => '');

      const problems = auditRoster(body.replace(inv.text, () => brokenInv), ROSTER);
      const omits = problems.find((p) => p.kind === 'omits');
      assert.ok(omits, `${f}: dropping ${victim} left edge-shared silent`);
      assert.deepEqual(omits.names, [victim], `${f}: dropping ${victim} was reported as ${omits.names.join(', ')}`);
    }
  }
});

test('R694 ② the LENGTH of the roster is not part of the judgement', () => {
  /* ⚠ これがこの回の当のバグである。窓で切る実装は、名簿が長いほど**見なくなる**。
     同じ抜けを、閉じ括弧が 260 文字の内側にある短い名簿と、はるか外側にある長い名簿の
     両方で作り、**どちらも同じように鳴る**ことを確かめる。 */
  const missing = ROSTER[ROSTER.length - 1];
  const kept = ROSTER.filter((n) => n !== missing);

  const short = `\`_shared/\` は（${kept.join('・')}）。`;
  const padded = `\`_shared/\` は（${kept.join('・')}・${'x'.repeat(400)}.js）。`;

  const a = auditRoster(short, ROSTER).find((p) => p.kind === 'omits');
  assert.ok(a && a.names.includes(missing), 'the short roster was not audited at all');

  const closeAt = padded.indexOf('）');
  assert.ok(closeAt > 260, `this case only means something if the close is past the old 260-char window (it is at ${closeAt})`);
  const b = auditRoster(padded, ROSTER).find((p) => p.kind === 'omits');
  assert.ok(b && b.names.includes(missing),
    'a roster whose closing bracket sits past 260 characters was skipped — the window is back');
});

test('R694 ③ a parenthesis that cannot be read is a failure, not a pass', () => {
  const open = `\`_shared/\` は（${ROSTER.join('・')}`;   /* 閉じない */
  const problems = auditRoster(open, ROSTER);
  assert.ok(problems.some((p) => p.kind === 'unreadable'),
    '«I could not read the inventory» left as green — that is how the 260-char window shipped');
});

test('R694 ④ one file is not an inventory, and a hedge is still honestly partial', () => {
  /* `_shared/newsgeo.js`（＝ブラウザの `js/newsgeo.js` と1バイト同一）は Architecture.md の
     実在の文で、**1本について真**である。目録と読むと「他の10本が抜けている」と報告する。 */
  const one = '`_shared/newsgeo.js`（＝ブラウザの `js/newsgeo.js` と1バイト同一）が曖昧性解消をする。';
  assert.deepEqual(auditRoster(one, ROSTER), [],
    'a sentence about ONE file in _shared/ is being read as a roster of the directory');

  const hedged = `\`_shared/\` は（${ROSTER.slice(0, 3).join('・')} などを置く）ディレクトリ。`;
  assert.deepEqual(auditRoster(hedged, ROSTER), [],
    'a list that says «など» is honestly partial and must be left alone');

  /* そして、hedge を外したら同じ文が鳴ること——「hedge があるから緑」と
     「そもそも見ていないから緑」は同じ緑に見える（#R385 の形） */
  const unhedged = `\`_shared/\` は（${ROSTER.slice(0, 3).join('・')} を置く）ディレクトリ。`;
  assert.ok(auditRoster(unhedged, ROSTER).some((p) => p.kind === 'omits'),
    'the same list without the hedge stayed green — the hedge is not what made it pass');
});

/* ───────────────────────── arch-files: §3 の構造で js/ を見分ける ───────────────────────── */

const archGate = () => {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/arch-files-check.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: '' };
  } catch (e) { return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
};

test('R694 ⑤ the _shared roster may be line-wrapped at ANY of its names', async () => {
  /* ⚠ これが報告された欠陥そのもの。行頭の綴りで js/ 宣言を見分けていたので、名簿は
     「たまたま js/ にも同名がある 5 つ」でしか改行できなかった。11 本すべてについて、
     その名前から始まる行を作っても門は緑でなければならない。 */
  await withTreeLock(() => {
    const P = 'docs/FILES.md';
    const originalBytes = rd(P);
    assert.equal(archGate().code, 0, 'check:archfiles must be green before this means anything');
    const nl = /\r\n/.test(originalBytes) ? '\r\n' : '\n';
    try {
      for (const name of ROSTER) {
        /* 名簿の中の `name` の直前で改行する（先頭の1本は元から行頭なので飛ばす） */
        const inv = inventories(originalBytes).find((i) => i.names.some((n) => ROSTER.includes(n)));
        const re = new RegExp('[ \\t\\r\\n]*/[ \\t\\r\\n]*(`?' + escapeRe(name) + '`?)');
        if (!re.test(inv.text)) continue;
        const wrapped = inv.text.replace(re, (_m, g1) => ' /' + nl + g1);
        writeFileSync(join(ROOT, P), originalBytes.replace(inv.text, () => wrapped));
        const r = archGate();
        assert.equal(r.code, 0,
          `check:archfiles went RED because the _shared roster wrapped onto a line starting «${name}» — `
          + 'a formatting constraint leaking out of a checker:\n' + r.out);
      }
    } finally {
      writeFileSync(join(ROOT, P), originalBytes);
    }
    assert.equal(archGate().code, 0, 'the restore left the tree failing');
  });
});

test('R694 ⑥ arch-files is still RED for the defects it exists to catch', async () => {
  await withTreeLock(() => {
    const P = 'docs/FILES.md';
    const originalBytes = rd(P);
    assert.equal(archGate().code, 0, 'check:archfiles must be green before this means anything');
    try {
      /* (a) js/ の段から実在のモジュールの記述を消す → 「§3 が説明していない」 */
      const victim = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).sort()[0];
      const line = new RegExp('^[ \\t]*' + escapeRe(victim) + '\\b[^\\r\\n]*\\r?\\n', 'm');
      assert.ok(line.test(originalBytes), `${victim} is not described on a line of its own — pick another victim`);
      writeFileSync(join(ROOT, P), originalBytes.replace(line, () => ''));
      let r = archGate();
      assert.equal(r.code, 1, `check:archfiles stayed GREEN after ${victim} lost its entry`);
      assert.ok(r.out.includes(victim), `the report never named ${victim}:\n` + r.out);

      /* (b) js/ の段に、存在しない名前を足す → 「§3 が説明する名前が無い」 */
      const ghost = 'r692-no-such-module.js';
      writeFileSync(join(ROOT, P), originalBytes.replace(line, (m) => m + ghost + '      存在しない\n'));
      r = archGate();
      assert.equal(r.code, 1, 'check:archfiles stayed GREEN with a name that does not exist');
      assert.ok(r.out.includes(ghost), `the report never named ${ghost}:\n` + r.out);
    } finally {
      writeFileSync(join(ROOT, P), originalBytes);
    }
    assert.equal(archGate().code, 0, 'the restore left the tree failing');
  });
});

test('R694 ⑦ describing a js/ module in the supabase block does not count as describing it', async () => {
  /* 旧実装は §3.1 以下のどこにある綴りでも「記述した」と読んだ。§3 の見出しは
     「この段はどのディレクトリの話か」を宣言しており、それが答えを持っている。 */
  await withTreeLock(() => {
    const P = 'docs/FILES.md';
    const originalBytes = rd(P);
    assert.equal(archGate().code, 0, 'check:archfiles must be green before this means anything');
    try {
      const victim = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).sort()[0];
      const line = new RegExp('^[ \\t]*' + escapeRe(victim) + '\\b[^\\r\\n]*\\r?\\n', 'm');
      /* js/ の段から消し、supabase の段（§3.12）へ移す */
      const moved = originalBytes.replace(line, () => '')
        .replace(/^(  seed\.sql[^\r\n]*\r?\n)/m, (m) => m + victim + '      よそへ移した記述\n');
      assert.notEqual(moved, originalBytes, 'could not move the entry into §3.12 — the anchor moved');
      writeFileSync(join(ROOT, P), moved);
      const r = archGate();
      assert.equal(r.code, 1,
        `check:archfiles counted a §3.12 (supabase/) line as a description of the js/ module ${victim}`);
      assert.ok(r.out.includes(victim), `the report never named ${victim}:\n` + r.out);
    } finally {
      writeFileSync(join(ROOT, P), originalBytes);
    }
    assert.equal(archGate().code, 0, 'the restore left the tree failing');
  });
});
}
