/* ============================================================================
 *  IntMap · a number the machine holds, copied into prose, is compared with the machine
 * ----------------------------------------------------------------------------
 *  #R500: the capability registry, the system-prompt table and the deep-tier size were each copied
 *  into prose and compared with nothing but other prose. #R699: which sentences are claims was
 *  decided by a hand-written separator set, so a sentence outside it was never seen. The claim
 *  walk lives in scripts/doc-claims.mjs (evaluated directly here, in milliseconds); the rules are
 *  proved red by mutation. ⚠ Mutations are made in a PRIVATE COPY of the checkout (tests/helpers/scratch-tree.mjs), never in the tree.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r500, r699
 * ==========================================================================*/
import { aiProxySource } from './helpers/ai-proxy-source.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { CHECKED, claims, headNoun, opensLine } from '../scripts/doc-claims.mjs';
import { readLF } from '../scripts/eol.mjs';
import { tierSpecs } from '../scripts/tiers.mjs';
import { declaredEdgeFunctions } from './helpers/edge-functions.mjs';
import { scratchTree } from './helpers/scratch-tree.mjs';
import { specFiles, specFileFor } from '../scripts/architecture-spec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;
/* the private copy every mutation below is made in — built on first use (tests/helpers/scratch-tree.mjs) */
const SCRATCH = scratchTree();
/* a literal anchor that tolerates either line ending — the checkout's, not the author's (#R286/#R283) */
const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R500 — was tests/r500-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R500 — 「同じ数を2か所に書いて、片方だけが古くなる」を、実際に赤くなる門にした回
 * ----------------------------------------------------------------------------
 *  外部の監査が 9 件の陳腐化を報告し、確かめたら全部本物だった。共通していたのは形である——
 *  **どれも「機械が持っている数」を散文が書き写した箇所で、比較する相手が他の散文しか
 *  いなかった。**
 *
 *    · 能力レジストリは 129（撤去済み 1 を除いて到達可能 128）なのに、5 つの文書が 126 と言い、
 *      `Architecture.md` は**同じファイルの中で 126 と 127 の両方**を言っていた。
 *    · system prompt は 22 本なのに `Architecture.md` は 20 本と言い、内訳の `news-ui` は
 *      3 ではなく 1 で、`atlas-gloss` と `news-ingest` の行が無かった。⚠ #R397 が
 *      **同じ文の同じ「20」**を一度直している。直した文が、また離れた。
 *    · deep tier の大きさは `scripts/tiers.mjs` が**導出する**のに、4 か所に手で書いてあり、
 *      3 か所が食い違っていた（package.json 86 / docs/TESTING.md 92 と 94 / worktree.mjs 82）。
 *      #R372 が**同じ 4 か所**を一度そろえている。
 *    · `ai-proxy` の冒頭コメントは free = 30/day と言い、20 行下の `PLAN_LIMITS` は 10。
 *      #R147 が 30→10 にしたときに、**コードだけが直った。**
 *
 *  よってここで検査するのは「今の文面が正しいこと」ではない（それは `check:docs` の仕事で、
 *  今この瞬間は緑である）。**新しい規則が、事実を壊したときに実際に赤くなること**である。
 *  緑を主張する検査は、規則が黙っていても緑になる。
 *
 *    ① `capability-count` が、文書の数字を動かすと落ちる。
 *    ② `prompt-count` が、総数を動かしても内訳の 1 行を動かしても落ちる。
 *    ③ `deep-tier-size` が、**文書でない 2 か所**（package.json・scripts/worktree.mjs）でも落ちる。
 *    ④ 三つとも、正本が**黙った**ときに落ちる（#R399 の形——数が消えるのは合格ではない）。
 *    ⑤ `ai-proxy` の散文が `PLAN_LIMITS` と一致する。⚠ これは変異ではなく直接の照合で、
 *       `.ts` は `doc-facts` の走査に入っていないのでここが唯一の門。
 *    ⑥ README が、UI が実際に名乗っている名前でその面を呼ぶ。
 *    ⑦ `Architecture.md` に、同じ段落が二度書かれていない。
 *
 *  ⚠ 実行コスト（#R407 が三度つまずいた場所）。①〜④ は `doc-facts` を何度も回すので、
 *    **`--rule=` で 1 変異だけを評価する**。変異はこのファイル専用の写し（tests/helpers/scratch-tree.mjs）
 *    に書くので、他のファイルを待たせる錠はもう無い（mutation-tests-off-tree）。
 * ==========================================================================*/

/* ⚠ (#R286/#R283) 錨は LF で書いてあり、このチェックアウトはそうとは限らない。照合は改行を
   緩めた正規表現で行い、復元は元のバイト列で行う。 */
/* ⚠ (#R511) THE ANCHORS BELOW CARRY THE REGISTRY SIZE, AND THAT SIZE IS READ FROM THE REGISTRY.
   They were written as the literal 129 / 128, so adding ONE capability (map.compose) turned this
   file red for a reason that had nothing to do with the rule it tests — the very shape #R500 was
   written against (a number copied where a machine holds it). The 正本 is js/atlas-capabilities.js. */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const _CAPS = makeAtlasCapabilities({});
const _REGISTRY = _CAPS.list();
const REG = _REGISTRY.length;
const REACH = REG - (_CAPS.withdrawn() || []).length;   /* the same two calls scripts/doc-facts.mjs makes */

function docFacts(rule) {
  try {
    const out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--check', '--rule=' + rule],
      { cwd: SCRATCH.root, encoding: 'utf8' });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/** 壊す → 回す → **必ず**元のバイト列に戻す */
function withBroken(edits, fn) {
  /* «Architecture.md» names the spec — the sentence is in whichever chapter carries it now */
  edits = edits.map((e) => ({ ...e, file: specFileFor(ROOT, e.file, anchorRe(e.from)) }));
  const saved = edits.map((e) => [e.file, rd(e.file)]);
  try {
    for (const e of edits) {
      const re = anchorRe(e.from);
      assert.ok(re.test(readLF(join(ROOT, e.file))), `${e.file} no longer contains the anchor for «${e.why}»`);
      SCRATCH.write(e.file, readLF(join(ROOT, e.file)).replace(re, () => e.to));
    }
    return fn();
  } finally {
    for (const [f, bytes] of saved) SCRATCH.write(f, bytes);
  }
}

/* ── ①〜④ 変異で赤を見る。⚠ 写しの中で ─────────────────────────────────────── */
test('R500 ①〜④ the three new rules go red when the fact drifts, and when it goes silent', async (t) => {
  {
    const green = (rule) => assert.equal(docFacts(rule).code, 0, `the tree is not green for ${rule} before the mutations`);
    for (const r of ['capability-count', 'prompt-count', 'deep-tier-size']) green(r);

    /* ① 能力レジストリの大きさ。⚠ 壊した数字をこのファイルのソースに連続して書かない——
       規則は文書しか走査しないので今は当たらないが、走査が広がった日に自己命中する。 */
    await t.test('① capability-count catches a document that misstates the registry', () => {
      const STALE = String(12) + String(6);
      const r = withBroken([{ file: 'Architecture.md', why: 'the registry size in §5',
        from: 'レジストリの全 ' + REG + ' を検索', to: 'レジストリの全 ' + STALE + ' を検索' }],
        () => docFacts('capability-count'));
      assert.equal(r.code, 1, 'a document may state the wrong registry size and stay green');
      assert.match(r.out, /capability-count/, 'the report does not name the rule that failed');
    });

    /* ②a 総数だけを動かす */
    await t.test('②a prompt-count catches a wrong total', () => {
      const r = withBroken([{ file: 'Architecture.md', why: 'the stated number of system prompts',
        from: '**22 本すべての system prompt', to: '**' + String(2) + String(0) + ' 本すべての system prompt' }],
        () => docFacts('prompt-count'));
      assert.equal(r.code, 1, 'the stated total may disagree with EXPECTED_CALLS and stay green');
      assert.match(r.out, /EXPECTED_CALLS sums to 22/, 'the report does not say what the table actually sums to');
    });

    /* ②b 総数は正しいまま、内訳の1行だけを動かす——#R500 の実物はこの形だった
       （20 が間違っていただけでなく、`news-ui` が 3 と書いてあった） */
    await t.test('②b prompt-count catches a wrong row even when the total is right', () => {
      const r = withBroken([{ file: 'Architecture.md', why: "one file's own number inside the breakdown",
        from: '`news-ui` 1', to: '`news-ui` ' + String(3) }],
        () => docFacts('prompt-count'));
      assert.equal(r.code, 1, 'a single wrong row inside the breakdown stays green');
      assert.match(r.out, /news-ui/, 'the report does not name the row that disagrees');
    });

    /* ③ 文書でない2か所。⚠ ここが規則の要点である——`eachDoc` はこの2つを見ない。
       ⚠ (#R510) THE ANCHOR CARRIES THE NUMBER THE FILE ACTUALLY STATES, NOT A NUMBER THIS TEST WROTE
       DOWN. It said «95» — so the day a round added one nightly spec and correctly updated both
       files to «96», the rule stayed green and THIS test went red for not finding its own anchor:
       the check that polices four hand-written copies of a derived number was the fifth copy. */
    const deepNow = (() => { const m = /the deep tier is (\d+) spec files/.exec(readLF(join(ROOT, 'package.json'))); return m ? m[1] : '95'; })();
    for (const [file, from, to, why] of [
      ['package.json', 'the deep tier is ' + deepNow + ' spec files', 'the deep tier is ' + String(86) + ' spec files', 'the npm script commentary'],
      ['scripts/worktree.mjs', 'The deep tier (' + deepNow + ' spec files', 'The deep tier (' + String(82) + ' spec files', 'the banner printed at the start of every session'],
    ]) {
      await t.test(`③ deep-tier-size catches ${file} — ${why}`, () => {
        const r = withBroken([{ file, why, from, to }], () => docFacts('deep-tier-size'));
        assert.equal(r.code, 1, `${file} may state the wrong deep-tier size and stay green`);
        assert.match(r.out, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `the report does not name ${file}`);
      });
    }

    /* ④ 黙るのは合格ではない（#R399 の形）。数を消したら、規則は「正本が言わなくなった」で落ちる。 */
    await t.test('④ a 正本 that stops stating the number is a failure, not a pass', () => {
      /* ⚠ 正本は同じ数を**いくつもの形**で言っているので、1つ消しても規則は「まだ言っている」と読む
         ——それは正しい。黙ったことを確かめるには**全部**消す必要がある。
         ⚠⚠ (#R588) その「全部」は、ここに手で並べた4か所ではない。#R500 が書いた時点では 4 で足りて
         いたが、能力数を述べる箇所は 12 から 17 に増え、4 つ消しても Architecture.md はまだ別の形で
         数を述べていた——すると規則は緑のままで、**この検査は「黙っても落ちる」ことを一度も測れなく
         なった**（実測: clean な origin/main でも同じように落ちる）。手で並べた一覧が次に足された
         ものを黙って落とす、`.agents/rules/no-ad-hoc-hardcoding.md` §2.4 の形そのもの。
         ⇒ 消す場所は **規則自身の CLAIM 表から発見する**。scripts/doc-facts.mjs が「これは能力数の
         主張である」と認める形を全部読み、Architecture.md のその全一致から数字を抜く。規則が形を
         1 つ足せば、この変異も自動でそれを追う。 */
      const claims = [...rd('scripts/doc-facts.mjs')
        .slice(rd('scripts/doc-facts.mjs').indexOf('const CLAIMS = ['))
        .split('];')[0]
        .matchAll(/\{\s*src:\s*'((?:[^'\\]|\\.)*)'/g)]
        .map((m) => m[1].replace(/\\\\/g, '\\'));
      assert.ok(claims.length >= 4, 'the CLAIM shapes were read out of scripts/doc-facts.mjs (' + claims.length + ')');
      /* the spec is the map plus its chapters — silence the size in every file of it */
      let hits = 0;
      const silenced = specFiles(ROOT).map((f) => {
        let silent = readLF(join(ROOT, f));
        for (const src of claims) {
          silent = silent.replace(new RegExp(src, 'g'), (m) => { hits++; return m.replace(/\d+/g, 'N'); });
        }
        return [f, silent];
      });
      assert.ok(hits >= 4, 'the spec states the size in ' + hits + ' place(s) — the mutation found them');
      const a = (() => {
        const saved = silenced.map(([f]) => [f, readFileSync(join(ROOT, f))]);
        try { for (const [f, s] of silenced) SCRATCH.write(f, s); return docFacts('capability-count'); }
        finally { for (const [f, b] of saved) SCRATCH.write(f, b); }
      })();
      assert.equal(a.code, 1, 'Architecture.md may drop the registry size in silence');

      const b = withBroken([{ file: 'Architecture.md', why: 'the prompt total disappears',
        from: '**22 本すべての system prompt', to: '**すべての system prompt' }],
        () => docFacts('prompt-count'));
      assert.equal(b.code, 1, 'Architecture.md may drop the prompt total in silence');
    });

    /* 復元が効いたことを、次のファイルに渡す前に確かめる */
    for (const r of ['capability-count', 'prompt-count', 'deep-tier-size']) {
      assert.equal(docFacts(r).code, 0, `the restore left the tree failing for ${r}`);
    }
  }
});

/* ── ⑤ ai-proxy の散文が、20 行下の定数と一致する ─────────────────────────────────── */
test('R500 ⑤ ai-proxy says the free quota its own PLAN_LIMITS grants', () => {
  const src = aiProxySource();
  /* (ai-one-ledger) PLAN_LIMITS moved to _shared/ai-ledger.js when monitor-run began charging the same
     allowance; the prose in ai-proxy's header is still held to it */
  /* (supporter-funnel) …and PLAN_LIMITS is now the `aiTurnsPerDay` column of the plan table in
     _shared/plans.js, so the free number is read from there: one row per plan, in an object literal */
  const free = rd('supabase/functions/_shared/plans.js').match(/^\s*free:\s*Object\.freeze\(\{[^}]*aiTurnsPerDay:\s*([\d_]+)/m);
  assert.ok(free, '_shared/plans.js no longer gives the `free` plan an aiTurnsPerDay — that table is the 正本 for every quota');
  const n = Number(free[1].replace(/_/g, ''));

  /* every stated free quota in the file's own commentary — the header said 30 for the whole time
     #R147 had already moved the constant to 10, because nothing compared the two */
  const stated = [...src.matchAll(/free\s*=\s*(\d+)\s*\/\s*day/g)];
  assert.ok(stated.length, 'the header no longer states the free quota at all — a number that stopped being written down cannot be checked against the code, and the reader meets the header first');
  for (const m of stated) {
    assert.equal(Number(m[1]), n, `ai-proxy's commentary says «${m[0]}» while PLAN_LIMITS grants free ${n}`);
  }
});

/* ── ⑥ README が、UI が名乗っている名前で面を呼ぶ ─────────────────────────────────── */
test('R500 ⑥ README calls the clock what index.html calls it', () => {
  const html = rd('index.html');
  const readme = rd('README.md');
  /* the name is not translated (#R289), so it is a literal in the markup and a literal in the prose */
  assert.match(html, /id="ntl-title"[^>]*>Chronos</, 'index.html no longer labels the panel Chronos — this test is anchored to the wrong element');
  assert.match(readme, /^## Chronos$/m, 'README does not give the clock the name the UI shows');
  const OLD = 'Time' + ' Machine';
  assert.ok(!readme.includes(OLD), `README still calls it «${OLD}», which #R289 renamed`);
});

/* ── ⑦ Architecture.md に、同じ段落が二度書かれていない ───────────────────────────── */
test('R500 ⑦ Architecture.md does not carry the same block twice', () => {
  /* the routing section carried thirteen identical lines twice in a row — invisible to every
     existing check, because each copy was individually correct. A run of five non-empty lines is
     long enough that a repeat is a paste, not a coincidence: measured, the whole document has no
     legitimate one. */
  /* (architecture-split) across the whole spec — the map and every chapter — so a paste that lands
     in two chapters is the same repeat it was when they were one file */
  const RUN = 5;
  const seen = new Map();
  for (const f of specFiles(ROOT)) {
    const lines = readLF(join(ROOT, f)).split('\n');
    for (let i = 0; i + RUN <= lines.length; i++) {
      const run = lines.slice(i, i + RUN);
      if (run.some((l) => !l.trim())) continue;
      const key = run.join('\n');
      if (seen.has(key)) {
        assert.fail(`the spec repeats ${RUN} lines verbatim at ${seen.get(key)} and ${f}:${i + 1}:\n  ${run[0].slice(0, 90)}`);
      }
      seen.set(key, `${f}:${i + 1}`);
    }
  }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R699 — was tests/r699-doc-claim-needles-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R699 — 散文の中の数の主張を「手書きの区切り集合」で拾っていた回
 * ----------------------------------------------------------------------------
 *  `scripts/doc-facts.mjs` の `edge-count` は、文書が述べる Edge Function の本数を
 *
 *      Edge Functions?  ·  「は を — – - : ： （ (」のどれか  ·  数  ·  「本」
 *
 *  で拾っていた。**その区切りの集合が、規則の見える範囲を決めていた。**
 *  #R696 の実測: `docs/README.md` が「Edge Function の名簿（**16 本**の名前…）」と書いて
 *  いたのに実体は 17 本で、門は緑だった。名詞と数のあいだにあるのは「の名簿（」で、
 *  **「の」は集合から意図的に外されていた**（「… の 1 本」が部分を指す言い方だから）。
 *  集合の外にある文は「誤り」とも「正しい」とも判定されず、**そもそも見られなかった**。
 *  そして報告は、たまたま集合に合った文だけについて「7 件すべて 17」と言っていた。
 *
 *  これは #R694 が `_shared/` の門から取り出した形と同じである。あちらは **260 文字の窓**が
 *  「いくつ抜けを見逃すか」を決めていた＝**本文の長さ**が検査の中身を決めていた。こちらは
 *  **区切り文字の一覧**が決めている。どちらも**針の性質が規則の被覆に漏れ出している**。
 *
 *  よってここで測るのは「いま 17 本であること」ではない（それは check:docs の仕事）。
 *  **拾い方が、針の形ではなく文の構造を見るようになったこと**である。
 *
 *    ① 旧い針は #R696 の実在した欠陥の上で緑のまま——新しい歩きは赤（直したことの証明）
 *    ② `scripts/doc-facts.mjs` に手書きの区切り集合が残っていない
 *    ③ 名詞修飾連鎖の掃引: 主題と数のあいだに何が挟まっても、連鎖が繋がっていれば主張
 *    ④ 旧い集合が守ろうとしていた 2 つの罠は、いまも除外される——ただし**分類されて**
 *    ⑤ 連鎖が別の名詞に着いたら、それは主題についての主張ではない
 *    ⑥ 見出しが話すのは、自分の名詞を持たず行頭に立つ数量だけ
 *    ⑦ 門は本物の欠陥（docs/README.md を 16 に戻す）で実際に赤くなる
 *    ⑧ `fail(` できる規則は必ず `ok(` もする——規則の名簿が片側からの導出で欠けない
 *    ⑨ 同じ形は他の規則にもあり、**4 件は実測でいま嘘だった**——その 4 件で門が赤くなる
 *    ⑩ 助数詞が主題を名指すとき（能力）は助数詞に結ぶ／名指さないとき（か国）は結べない
 *    ⑪ 捕まえた数を比較しない捕獲群を残さない
 *    ⑫ 事実の値を針のリテラルに埋めない——埋めた瞬間に、その値は誰も検査していない
 *    ⑬ 1 件も当たらない針は緑を出す——正本が黙ったら赤くなること
 *    ⑭ 目録を 0 件監査した実行と 3 件監査した実行が、同じ緑の行を出さない
 * ==========================================================================*/

/* ⚠ (#R743) THE SAME DERIVATION scripts/doc-facts.mjs MAKES, FOR THE SAME REASON THE deep-tier SEED
   BELOW IS DERIVED. These three seeds held the literal 139 and 138, so the round that registered two
   capabilities made four mutations 「lose their subject」 — which reads as a broken test rather than
   as a moved number, and the defects these rows exist to catch stop being watched until somebody
   retypes them. Only the WRONGNESS is written down. */
const CAPS = makeAtlasCapabilities({});
const CAP_TOTAL = CAPS.list().length;
const CAP_LIVE = CAP_TOTAL - (CAPS.withdrawn() || []).length;

const WORD = { one: 1, two: 2, three: 3, seventeen: 17 };
const EDGE = { noun: 'Edge Functions?', units: ['本', '函数'], words: WORD };
const kinds = (s) => claims(s, EDGE).items.filter((c) => c.kind !== 'other');
const only = (s) => { const k = kinds(s); assert.equal(k.length, 1, `expected one judged quantity in «${s}», got ${JSON.stringify(k)}`); return k[0]; };

/* ── ① the defect the old needle could not see ───────────────────────────────────────────── */
/* The sentence is the real one, quoted from `docs/README.md` as #R696 found it. Both needles
   are run over it here, so the test says something even after the old one is gone from the
   gate: it is what makes this a FIX rather than a restatement. */
const DEFECT = '**Edge Function の名簿（16 本の名前と `_shared/` の扱い）と `--use-api` の実測もここが正本**';

test('#R699 ① the hand-written separator set is green on the #R696 defect; the chain walk is not', () => {
  const SEP = '(?:は|を|—|–|-|:|：|（|\\()';
  const OLD = new RegExp('Edge Functions?[ \\t]*\\**[ \\t]*' + SEP + '[ \\t]*\\**[ \\t]*(?:全|約)?[ \\t]*(\\d+)[ \\t]*(?:本|函数)', 'g');
  assert.equal([...DEFECT.matchAll(OLD)].length, 0,
    'the old needle is supposed to be BLIND here — if it now sees this, the premise of #R699 is wrong');

  const c = only(DEFECT);
  assert.equal(c.kind, 'inventory');
  assert.equal(c.n, 16, 'the walk must read the number the document actually states');
});

/* ── ② the set is gone from the gate ─────────────────────────────────────────────────────── */
test('#R699 ② scripts/doc-facts.mjs no longer binds that number with a hand-written separator set', () => {
  /* (tests regrouped by subject) The first half of this used to grep for `const SEP = '(?:…)'`. That
     is EVALUATED by ⑦ below: it puts back the very sentence the separator set could not see and
     requires `edge-count` to go red — which no gate binding by that set can do, however it is spelled.
     ⚠ The second half stays a source pin, and has to: «the gate asks doc-claims.mjs, rather than
     carrying a second copy of the walk» is a claim about WHERE the judgement lives (one rule, one
     place — .agents/rules/no-ad-hoc-hardcoding.md §2.3). A second copy behaves identically on every
     input, so no evaluation can tell it from the first; only the import can. */
  const src = rd('scripts/doc-facts.mjs');
  assert.ok(src.includes("from './doc-claims.mjs'"), 'the gate no longer asks doc-claims.mjs what a number is a number of');
});

/* ── ③ the sweep: anything may sit between the noun and the number ───────────────────────── */
/* ⚠ This is the sweep #R694 said could not be written against the gate itself: one run of
   `doc-facts.mjs` is ~7.5 s, so a table of phrasings would cost minutes and hold the tree lock.
   Against the module it is milliseconds — which is why the module exists separately. */
test('#R699 ③ every phrasing whose chain reaches the subject is a claim', () => {
  const YES = [
    ['Edge Functions は 17 本', 'the shape the old set was built for'],
    ['**Edge Functions — 17本**', 'an em dash'],
    ['Edge Functions を17本デプロイする', 'を, no spaces'],
    ['Edge Functions（17本）', 'a parenthesis'],
    ['Edge Function は全17本', 'a 全 prefix'],
    ['Edge Function の名簿（17 本の名前', 'の + one noun in between — the #R696 defect'],
    ['Edge Function の一覧の中身（17 本', 'の + two nouns in between'],
    ['Edge Functions が 17 本', 'が, which the old set also left out'],
    ['Edge Functions · 17本', 'a connector the walk does not know — visible, not silent'],
    ['| Edge Functions | 17本 |', 'a table row'],
    ['Edge Functions：17 本', 'a fullwidth colon'],
    ['Edge Functions の数は 17 本', 'の + は together'],
    ['**seventeen** Edge Functions', 'English, the numeral before the noun'],
  ];
  for (const [s, why] of YES) {
    const c = only(s);
    assert.ok(CHECKED.includes(c.kind), `«${s}» (${why}) was classified ${c.kind}, which no rule checks`);
    assert.equal(c.n, 17, `«${s}» (${why}) read the wrong number`);
  }
});

/* ── ④ the two traps the old set existed to avoid — still excluded, now BY NAME ──────────── */
test('#R699 ④ partitive and bare juxtaposition are excluded, and say which they are', () => {
  const p = only('Edge Function の 1 本が `_shared/` を持たない');
  assert.equal(p.kind, 'partitive', 'の with no noun in between means ONE OF them, not that there is one');

  /* the real sentence from docs/NEWS-EVENTS.md §12.1 */
  const i = only('## 12.1 運用 — `news-ingest` (#R351) **Edge Function 1 本**（cron で回す）');
  assert.equal(i.kind, 'instance', 'bare juxtaposition says that many of them do this');

  /* ⚠ and the classes are COUNTED, which is the half the old rule did not have: it could not
     tell「nothing disagreed」from「nothing was looked at」. */
  const { tally } = claims('Edge Function の 1 本。Edge Function 1 本（…）。Edge Functions は 17 本', EDGE);
  assert.deepEqual({ partitive: tally.partitive, instance: tally.instance, inventory: tally.inventory },
    { partitive: 1, instance: 1, inventory: 1 });
});

/* ── ⑤ a chain that reaches a different noun has already found its subject ───────────────── */
test('#R699 ⑤ a quantity counting some other noun is not a claim about the subject', () => {
  /* the real sentence from Architecture.md §2 */
  assert.deepEqual(kinds('自前の Edge Function を先頭に、公開 relay 4 本を競争させ'), [],
    '「公開 relay 4 本」 counts relays; the Edge Function earlier in the clause is not its noun');
  assert.deepEqual(kinds('Edge Functions の話のあと、`css/`（3本）'), []);

  /* ⚠ THE LATIN SPACE IS WHY. 「Edge Function」 is one noun and 「公開 relay」 is two; a walk
     that swallowed the space would run past `relay` and hand the 4 to whatever came before. */
  const at = (s, tok) => s.indexOf(tok);
  assert.equal(headNoun('公開 relay 4 本', at('公開 relay 4 本', '4'), /Edge Functions?$/).hops[0], 'relay');
  assert.equal(headNoun('Edge Function 4 本', at('Edge Function 4 本', '4'), /Edge Functions?$/).noun, 'Edge Function');
});

/* ── ⑥ a heading speaks only for a quantity that has no noun of its own ──────────────────── */
test('#R699 ⑥ the heading is a subject, but only for a quantity standing at the head of its line', () => {
  const body = '### 6.2 Edge Functions — **17本**\n\n> ⚠ **17本すべてを** `supabase/config.toml` に宣言する。\n';
  const cs = kinds(body);
  assert.equal(cs.length, 2, JSON.stringify(cs));
  assert.ok(cs.every((c) => c.kind === 'inventory' && c.n === 17));

  /* ⚠ MEASURED: letting the heading speak for EVERY chain that failed turned eleven quantities
     inside Architecture.md §6.2 — 「socket は同時に1本だけ」「残り4本」「共有するのは13本」 —
     into claims that there are 1, 4 and 13 Edge Functions. Those have nouns of their own. */
  const noisy = '### 6.2 Edge Functions\n\n⚠ **socket は同時に1本だけ**（鍵1本あたり3接続で、4本）。\n';
  assert.deepEqual(kinds(noisy), [], 'a quantity with a noun of its own is not spoken for by the heading');

  /* …nor is one that merely follows a sentence break on the same line */
  const head = '> ⚠ **17本', mid = '…を書かない）。1 本';
  assert.equal(opensLine(head, head.indexOf('17')), true);
  assert.equal(opensLine(mid, mid.indexOf('1 本')), false);
});

/* ── ⑦ the gate itself goes red on the real defect ───────────────────────────────────────── */
/* ⚠ A gate is worth nothing until it has been seen to fail on the thing it exists to catch.
   This puts `docs/README.md` back to what #R696 found and runs the real rule over the real tree. */
test('#R699 ⑦ check:docs fails when docs/README.md is one short again', async () => {
  {
    const rel = 'docs/README.md';
    const original = readFileSync(join(ROOT, rel));
    const text = original.toString('utf8');
    /* (atlas-semantic-search) the count is the declaration's, not a number typed here — see tests/helpers/edge-functions.mjs */
    const N = declaredEdgeFunctions(ROOT).length;
    const NEEDLE = 'Edge Function の名簿（' + N + ' 本';
    assert.ok(text.includes(NEEDLE), `${rel} no longer carries the sentence this test mutates`);
    try {
      SCRATCH.write(rel, text.replace(NEEDLE, 'Edge Function の名簿（' + (N - 1) + ' 本'));
      let code = 0, out = '';
      try {
        out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--check', '--rule=edge-count'],
          { cwd: SCRATCH.root, encoding: 'utf8' });
      } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
      assert.equal(code, 1, 'the gate stayed green on the #R696 defect:\n' + out);
      assert.match(out, /edge-count[\s\S]*docs\/README\.md/, out);
    } finally {
      SCRATCH.write(rel, original);
    }
  }
});

/* ── ⑧ the roster of rules cannot lose a member to a one-sided derivation ────────────────── */
/* `tests/r274-checks` ① asserts that every rule actually ran, and derives the roster from this
   file's `ok('…')` calls — #R403 replaced a hand-typed list of twelve with that, for the right
   reason. But a rule that can only FAIL never appears in it: `scan` and `sql-path` were outside
   that test entirely. Deriving a universe from one of its two sides is the same shape as the
   separator set above — the answer is bounded by where you looked. */
/* ⚠ (tests regrouped by subject) ⑧, ⑩ and ⑪ READ scripts/doc-facts.mjs, and have to: they are claims
   about the gate's own needles and rule ids — which ids can `fail(`, which capture groups a needle
   takes — and the gate runs every rule at import over the whole tree and exports none of them, so the
   only place those facts exist is the source. The rules' BEHAVIOUR is evaluated by the mutations
   (⑦ ⑨ ⑫ ⑬) and by #R274 ① (every `ok(` id is reported on a green run). */
test('#R699 ⑧ every rule that can fail also reports itself on a green run', () => {
  const src = rd('scripts/doc-facts.mjs');
  const ids = (fn) => new Set([...src.matchAll(new RegExp('\\b' + fn + "\\('([a-z-]+)'", 'g'))].map((m) => m[1]));
  const fails = ids('fail'), oks = ids('ok');
  assert.ok(fails.size >= 20, `only ${fails.size} rule ids were read out of the gate — the derivation is not reaching it`);
  const silent = [...fails].filter((r) => !oks.has(r)).sort();
  assert.deepEqual(silent, [],
    `these rules can fail but never say they ran, so #R274 ① (tests/process-doc-facts-sweep-checks.test.mjs) cannot see them: ${silent.join(', ')}`);
});

/* ── ⑨ the same shape in the sibling rules, and the four claims that were wrong ──────────── */
/* MEASURED (#R699) across the same 44 documents: `capability-count` was pinned to three
   decorated shapes and missed three claims — all three WRONG at the time — and
   `deep-tier-size` counted 「spec files」 in English and missed the same fact stated in
   Japanese, also wrong. `check:docs` was green through all four. Each is mutated back here. */
const DEFECTS = [
  ['capability-count', 'PRODUCT.md', `${CAP_TOTAL} の能力`, '130 の能力', 'の between the number and the counter'],
  ['capability-count', 'PRODUCT.md', `${CAP_TOTAL} 能力`, '130 能力', 'no asterisks around it'],
  ['capability-count', 'docs/FILES.md', `${CAP_TOTAL} 能力 ×`, '125 能力 ×', 'a counter followed by ×'],
  /* ⚠ (#R736) THIS SEED IS DERIVED, BECAUSE THE FACT IT MUTATES MOVES. It was written as the literal
     「core 7 本 / deep 105 本」, and the round that added one spec file made the guard below fire — the
     mutation «has lost its subject», which reads as a broken test rather than as a moved number, and
     the defect this row exists to catch stops being watched until somebody retypes it. The numbers
     come from scripts/tiers.mjs, which is where deep-tier-size itself gets them; only the WRONGNESS
     is written down (memory: 「数を持つ変異テストの種は数が動くと全部落ちる」). */
  ['deep-tier-size', 'docs/FILES.md',
    `core ${tierSpecs('core', { fixed: true }).length} 本 / deep ${tierSpecs('deep').length} 本`,
    `core ${tierSpecs('core', { fixed: true }).length - 1} 本 / deep ${tierSpecs('deep').length - 46} 本`,
    'the same fact in Japanese'],
  /* ⚠ (#R743) THE THIRD NUMBER IN THE SENTENCE ⑫ MUTATES. 「N のうち撤去済み 1 を除く M」 had its
     withdrawn count and its reachable half compared and its REGISTRY TOTAL read by nothing — so
     raising the registry left DECISIONS.md ×2 saying 「139 のうち撤去済み 1 を除く 140」, which does
     not hold against itself (139 − 1 = 138), with check:docs green over it. Derived, like the rest. */
  ['capability-count', 'DECISIONS.md', `${CAP_TOTAL} のうち撤去済み`, '130 のうち撤去済み', 'the registry total in that same sentence'],
  ['alerts', 'PRODUCT.md', '自前 13 フィード', '自前 12 フィード', 'a feed count outside the one owning sentence'],
  ['alerts', 'README.md', 'countries over thirteen feeds', 'countries over twelve feeds', 'the capture group that was never compared'],
];

for (const [rule, file, good, bad, why] of DEFECTS) {
  test(`#R699 ⑨ ${rule} goes red when ${file} states it as «${bad}» (${why})`, async () => {
    {
      const original = readFileSync(join(ROOT, file));
      const text = original.toString('utf8');
      assert.ok(text.includes(good), `${file} no longer carries «${good}» — this mutation has lost its subject`);
      try {
        SCRATCH.write(file, text.replace(good, bad));
        let code = 0, out = '';
        try {
          out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--check', '--rule=' + rule],
            { cwd: SCRATCH.root, encoding: 'utf8' });
        } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
        assert.equal(code, 1, `${rule} stayed green on «${bad}» in ${file}:\n` + out);
      } finally {
        SCRATCH.write(file, original);
      }
    }
  });
}

/* ── ⑩ a counter only names the subject when nothing else is measured in it ──────────────── */
/* ⚠ THE GENERAL FIX IS NOT «BIND TO THE COUNTER». 「能力」「都市」「リング」 belong to one subject
   each, so binding to them is exact. 「か国」 and 「フィード」 do not: MEASURED, sweeping every one
   of those turned FIFTY-NINE true sentences into failures in one run — the radiation layer's
   countries, the internet-health layer's countries, the news layer's feeds, none of them about
   severe-weather alerts. That is why `alerts` binds the phrase that names the subject instead,
   and why the residual is written down rather than swept in. */
test('#R699 ⑩ the alerts rule does not claim every countries-and-feeds number in the documents', () => {
  const src = rd('scripts/doc-facts.mjs');
  const block = src.slice(src.indexOf("let alertClaims = 0;"), src.indexOf("ok('alerts'"));
  assert.ok(block.length > 0, 'the alerts sweep moved — this test is pointing at nothing');
  for (const m of block.matchAll(/matchAll\(\/([^/]+)\//g)) {
    assert.match(m[1], /自前|MeteoAlarm|countries over/,
      `an alerts needle counts a bare counter with no subject in it: /${m[1]}/ — measured, that reads 59 true sentences as failures`);
  }
});

/* ── ⑪ a captured number that is never compared ──────────────────────────────────────────── */
test('#R699 ⑪ every capture group the alerts rule takes is compared against the code', () => {
  const src = rd('scripts/doc-facts.mjs');
  const block = src.slice(src.indexOf('let alertClaims = 0;'), src.indexOf("ok('alerts'"));
  assert.ok(block.length > 0, 'the alerts sweep moved — this test is pointing at nothing');
  /* ⚠ Read each regex literal with a LINEAR SCAN, not with a regex.
     The first version of this matched 「/…/」 with a nested alternation
     (an escape, or a character class, or an ordinary character — repeated), and CodeQL was right
     to call it: that shape backtracks catastrophically on input it cannot finish matching, and
     the input here is a source file that will be edited by people who have never read this test.
     A scanner that walks the characters once cannot do that, and it is easier to read besides. */
  const literals = [];
  const OPEN = 'body.matchAll(/';
  for (let at = block.indexOf(OPEN); at >= 0; at = block.indexOf(OPEN, at + 1)) {
    let i = at + OPEN.length, inClass = false, end = -1;
    for (; i < block.length; i++) {
      const c = block[i];
      if (c === '\\') { i++; continue; }            /* an escape covers the next character */
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { end = i; break; }
      else if (c === '\n') break;                    /* a literal does not span lines */
    }
    if (end > 0) literals.push({ src: block.slice(at + OPEN.length, end), after: end });
  }
  const loops = literals.length;
  for (const lit of literals) {
    const groups = (lit.src.match(/\((?!\?)/g) || []).length;
    const body = block.slice(lit.after, block.indexOf('\n      }', lit.after));
    const read = new Set([...body.matchAll(/m\[(\d+)\]/g)].map((x) => Number(x[1])));
    for (let g = 1; g <= groups; g++) {
      assert.ok(read.has(g),
        `capture group ${g} of /${lit.src}/ is taken and never read — the old README needle did`
        + ' exactly this with the feed count, so any number of feeds would have passed');
    }
  }
  assert.ok(loops >= 3, `only ${loops} alerts sweep(s) were parsed — the derivation is not reaching them`);
});

/* ── ⑫ a fact written into a pattern is a fact nobody is checking ────────────────────────── */
/* MEASURED (#R699): `capability-count`'s sixth needle was 「撤去済み **1** を除く (\\d+)」 — the
   withdrawn count baked into the pattern instead of compared to the registry. #R590 raised the
   registry and reworded the sentence to 「撤去済み 137 を除く 136」 in the same commit; the needle
   stopped matching, and four claims went unchecked from that moment — `Architecture.md` twice and
   `DECISIONS.md` twice, each saying 137 capabilities are withdrawn when exactly one is, while
   `docs/FILES.md` said 「到達可能 137」 two files away. The rule printed 「10 stated size(s)」 and
   none of the four was among them. This is ⑪ one step earlier: there a captured number was never
   read; here it was never captured. */
test('#R699 ⑫ capability-count goes red on the sentence that was shipped for nine rounds', async () => {
  {
    const rel = 'DECISIONS.md';
    const original = readFileSync(join(ROOT, rel));
    const text = original.toString('utf8');
    const good = `（${CAP_TOTAL} のうち撤去済み 1 を除く ${CAP_LIVE}）`;
    assert.ok(text.includes(good), `${rel} no longer carries «${good}»`);
    try {
      SCRATCH.write(rel, text.split(good).join('（130 のうち撤去済み 137 を除く 136）'));
      let code = 0, out = '';
      try {
        out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--check', '--rule=capability-count'],
          { cwd: SCRATCH.root, encoding: 'utf8' });
      } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
      assert.equal(code, 1, 'the withdrawn/reachable claim went unchecked again:\n' + out);
      assert.match(out, /withdrawn count holds 1/, out);
      /* ⚠ (#R743) DERIVED FOR THE SAME REASON THE SEED ABOVE IS. This line held the literal 138 —
         the very number the rule exists to stop anybody writing down — so the round that registered
         two capabilities turned a working guard into a red test about nothing. */
      assert.match(out, new RegExp('reachable half holds ' + CAP_LIVE), out);
    } finally {
      SCRATCH.write(rel, original);
    }
  }
});

/* (tests regrouped by subject) «⑫ no capability needle carries one of the two counts as a literal»
   was a second test here that grepped the CLAIMS table for 「撤去済み\s*<digit>」. It is folded into the
   ⑫ above, which EVALUATES the same fact: it rewords the sentence to 「撤去済み 137」 and requires
   `capability-count` to read it and go red on it — a needle with the count baked in cannot match
   that sentence at all, which is precisely the silence the grep was looking for. */

/* ── ⑬ a needle that matches nothing reports green ───────────────────────────────────────── */
/* MEASURED (#R699): `languages` required 「対応 UI 言語は」 with half-width spaces around 「UI」,
   and `Architecture.md` §2 writes it without them — ZERO matches across all 44 documents, and
   `if (archN && …)` stepped over it, so the rule holding the language count to `js/locales/` was
   checking nothing at all. Both halves are tested: a wrong number, and a 正本 that stops saying it. */
for (const [what, from, to, expect] of [
  ['states the wrong number', '**対応UI言語は9つ**', '**対応UI言語は8つ**', /8 UI languages/],
  ['stops stating it at all', '**対応UI言語は9つ**', '**対応している UI の言語**', /no longer states how many UI languages/],
]) {
  test(`#R699 ⑬ languages goes red when Architecture.md §2 ${what}`, async () => {
    {
      const file = specFileFor(ROOT, 'Architecture.md', from);
      const original = readFileSync(join(ROOT, file));
      const text = original.toString('utf8');
      assert.ok(text.includes(from), `the spec no longer carries «${from}»`);
      try {
        SCRATCH.write(file, text.replace(from, to));
        let code = 0, out = '';
        try {
          out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--check', '--rule=languages'],
            { cwd: SCRATCH.root, encoding: 'utf8' });
        } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
        assert.equal(code, 1, 'the languages rule stayed green:\n' + out);
        assert.match(out, expect, out);
      } finally {
        SCRATCH.write(file, original);
      }
    }
  });
}

/* ── ⑭ «nothing disagreed» and «nothing was audited» are not the same green line ──────────── */
/* #R694 took the 260-character window out of `edge-shared`, but the sentence it criticised — a
   gate naming all eleven files while proving nothing about any document — could still be printed
   by a sweep that audited nothing, because the `ok()` was unconditional. */
test('#R699 ⑭ edge-shared says how many document inventories it audited', () => {
  const out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--rule=edge-shared'],
    { cwd: SCRATCH.root, encoding: 'utf8' });
  const line = out.split('\n').find((l) => l.includes('edge-shared:'));
  assert.ok(line, 'edge-shared did not report at all:\n' + out);
  const n = Number((line.match(/(\d+) document inventor/) || [])[1]);
  assert.ok(n >= 3, `edge-shared audited ${n} document inventory(ies); three documents enumerate _shared/\n` + line);
});
}
