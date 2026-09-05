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
 *  ⚠ 実行コスト（#R407 が三度つまずいた場所）。①〜④ は木のロックを握ったまま `doc-facts` を
 *    回すので、**`--rule=` で 1 変異だけを評価し、取得は 1 回に畳む**。⑤⑥⑦ は読むだけなので
 *    ロックを取らない。
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
/* ⚠ (#R286/#R283) 錨は LF で書いてあり、このチェックアウトはそうとは限らない。照合は改行を
   緩めた正規表現で行い、復元は元のバイト列で行う。 */
const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));
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
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check', '--rule=' + rule],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/** 壊す → 回す → **必ず**元のバイト列に戻す */
function withBroken(edits, fn) {
  const saved = edits.map((e) => [e.file, rd(e.file)]);
  try {
    for (const e of edits) {
      const re = anchorRe(e.from);
      assert.ok(re.test(readLF(join(ROOT, e.file))), `${e.file} no longer contains the anchor for «${e.why}»`);
      writeFileSync(join(ROOT, e.file), readLF(join(ROOT, e.file)).replace(re, () => e.to));
    }
    return fn();
  } finally {
    for (const [f, bytes] of saved) writeFileSync(join(ROOT, f), bytes);
  }
}

/* ── ①〜④ 変異で赤を見る。⚠ ロックの取得はこの1回だけ ─────────────────────────────── */
test('R500 ①〜④ the three new rules go red when the fact drifts, and when it goes silent', async (t) => {
  await withTreeLock(async () => {
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
      /* ⚠ 正本は同じ数を4つの形で言っているので、1つ消しても規則は「まだ言っている」と読む
         ——それは正しい。黙ったことを確かめるには**全部**消す必要がある。 */
      const a = withBroken([
        { file: 'Architecture.md', why: 'the registry size in the table row',
          from: '**' + REG + ' 能力**', to: '**能力の一覧**' },
        { file: 'Architecture.md', why: 'the schema count',
          from: '**' + REG + ' 能力ぶんの引数定義**', to: '**各能力ぶんの引数定義**' },
        { file: 'Architecture.md', why: 'the size in the tool-surface row',
          from: '（レジストリの全 ' + REG + ' を検索・返るのは撤去済み 1 を除く **' + REACH + '** から・**打ち切り無し**）',
          to: '（レジストリ全体を検索・**打ち切り無し**）' },
        { file: 'Architecture.md', why: 'the size in §5',
          from: '**レジストリの全 ' + REG + ' を検索**し（返るのは撤去済み 1 を除く **' + REACH + '** から）',
          to: '**レジストリ全体を検索**し' },
      ], () => docFacts('capability-count'));
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
  }, { timeoutMs: 600_000 });
});

/* ── ⑤ ai-proxy の散文が、20 行下の定数と一致する ─────────────────────────────────── */
test('R500 ⑤ ai-proxy says the free quota its own PLAN_LIMITS grants', () => {
  const src = rd('supabase/functions/ai-proxy/index.ts');
  const limits = src.match(/const PLAN_LIMITS[^=]*=\s*\{([^}]*)\}/);
  assert.ok(limits, 'ai-proxy no longer declares PLAN_LIMITS — that constant is the 正本 for every quota');
  const free = limits[1].match(/free:\s*([\d_]+)/);
  assert.ok(free, 'PLAN_LIMITS no longer names a `free` plan');
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
  const lines = readLF(join(ROOT, 'Architecture.md')).split('\n');
  const RUN = 5;
  const seen = new Map();
  for (let i = 0; i + RUN <= lines.length; i++) {
    const run = lines.slice(i, i + RUN);
    if (run.some((l) => !l.trim())) continue;
    const key = run.join('\n');
    if (seen.has(key)) {
      assert.fail(`Architecture.md repeats ${RUN} lines verbatim at line ${seen.get(key) + 1} and line ${i + 1}:\n  ${run[0].slice(0, 90)}`);
    }
    seen.set(key, i);
  }
});
