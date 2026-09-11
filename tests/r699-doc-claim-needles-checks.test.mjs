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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { claims, headNoun, opensLine, CHECKED } from '../scripts/doc-claims.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

const WORD = { one: 1, two: 2, three: 3, seventeen: 17 };
const EDGE = { noun: 'Edge Functions?', units: ['本', '函数'], words: WORD };
const kinds = (s) => claims(s, EDGE).items.filter((c) => c.kind !== 'other');
const only = (s) => { const k = kinds(s); assert.equal(k.length, 1, `expected one judged quantity in «${s}», got ${JSON.stringify(k)}`); return k[0]; };

/* ── ① the defect the old needle could not see ───────────────────────────────────────────── */
/* The sentence is the real one, quoted from `docs/README.md` as #R696 found it. Both needles
   are run over it here, so the test says something even after the old one is gone from the
   gate: it is what makes this a FIX rather than a restatement. */
const DEFECT = '**Edge Function の名簿（16 本の名前と `_shared/` の扱い）と `--use-api` の実測もここが正本**';

test('① the hand-written separator set is green on the #R696 defect; the chain walk is not', () => {
  const SEP = '(?:は|を|—|–|-|:|：|（|\\()';
  const OLD = new RegExp('Edge Functions?[ \\t]*\\**[ \\t]*' + SEP + '[ \\t]*\\**[ \\t]*(?:全|約)?[ \\t]*(\\d+)[ \\t]*(?:本|函数)', 'g');
  assert.equal([...DEFECT.matchAll(OLD)].length, 0,
    'the old needle is supposed to be BLIND here — if it now sees this, the premise of #R699 is wrong');

  const c = only(DEFECT);
  assert.equal(c.kind, 'inventory');
  assert.equal(c.n, 16, 'the walk must read the number the document actually states');
});

/* ── ② the set is gone from the gate ─────────────────────────────────────────────────────── */
test('② scripts/doc-facts.mjs no longer binds that number with a hand-written separator set', () => {
  const src = rd('scripts/doc-facts.mjs');
  const sep = /const SEP\s*=\s*'\(\?:[^']*\)'/.exec(src);
  assert.equal(sep, null, `a hand-written separator set is back in doc-facts.mjs: ${sep && sep[0]}`);
  assert.ok(src.includes("from './doc-claims.mjs'"), 'the gate no longer asks doc-claims.mjs what a number is a number of');
});

/* ── ③ the sweep: anything may sit between the noun and the number ───────────────────────── */
/* ⚠ This is the sweep #R694 said could not be written against the gate itself: one run of
   `doc-facts.mjs` is ~7.5 s, so a table of phrasings would cost minutes and hold the tree lock.
   Against the module it is milliseconds — which is why the module exists separately. */
test('③ every phrasing whose chain reaches the subject is a claim', () => {
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
test('④ partitive and bare juxtaposition are excluded, and say which they are', () => {
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
test('⑤ a quantity counting some other noun is not a claim about the subject', () => {
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
test('⑥ the heading is a subject, but only for a quantity standing at the head of its line', () => {
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
test('⑦ check:docs fails when docs/README.md says 16 again', async () => {
  await withTreeLock(() => {
    const rel = 'docs/README.md';
    const original = readFileSync(join(ROOT, rel));
    const text = original.toString('utf8');
    const NEEDLE = 'Edge Function の名簿（17 本';
    assert.ok(text.includes(NEEDLE), `${rel} no longer carries the sentence this test mutates`);
    try {
      writeFileSync(join(ROOT, rel), text.replace(NEEDLE, 'Edge Function の名簿（16 本'));
      let code = 0, out = '';
      try {
        out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check', '--rule=edge-count'],
          { cwd: ROOT, encoding: 'utf8' });
      } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
      assert.equal(code, 1, 'the gate stayed green on the #R696 defect:\n' + out);
      assert.match(out, /edge-count[\s\S]*docs\/README\.md/, out);
    } finally {
      writeFileSync(join(ROOT, rel), original);
    }
  });
});

/* ── ⑧ the roster of rules cannot lose a member to a one-sided derivation ────────────────── */
/* `tests/r274-checks` ① asserts that every rule actually ran, and derives the roster from this
   file's `ok('…')` calls — #R403 replaced a hand-typed list of twelve with that, for the right
   reason. But a rule that can only FAIL never appears in it: `scan` and `sql-path` were outside
   that test entirely. Deriving a universe from one of its two sides is the same shape as the
   separator set above — the answer is bounded by where you looked. */
test('⑧ every rule that can fail also reports itself on a green run', () => {
  const src = rd('scripts/doc-facts.mjs');
  const ids = (fn) => new Set([...src.matchAll(new RegExp('\\b' + fn + "\\('([a-z-]+)'", 'g'))].map((m) => m[1]));
  const fails = ids('fail'), oks = ids('ok');
  assert.ok(fails.size >= 20, `only ${fails.size} rule ids were read out of the gate — the derivation is not reaching it`);
  const silent = [...fails].filter((r) => !oks.has(r)).sort();
  assert.deepEqual(silent, [],
    `these rules can fail but never say they ran, so tests/r274-checks ① cannot see them: ${silent.join(', ')}`);
});

/* ── ⑨ the same shape in the sibling rules, and the four claims that were wrong ──────────── */
/* MEASURED (#R699) across the same 44 documents: `capability-count` was pinned to three
   decorated shapes and missed three claims — all three WRONG at the time — and
   `deep-tier-size` counted 「spec files」 in English and missed the same fact stated in
   Japanese, also wrong. `check:docs` was green through all four. Each is mutated back here. */
const DEFECTS = [
  ['capability-count', 'PRODUCT.md', '138 の能力', '130 の能力', 'の between the number and the counter'],
  ['capability-count', 'PRODUCT.md', '138 能力', '130 能力', 'no asterisks around it'],
  ['capability-count', 'docs/FILES.md', '138 能力 ×', '125 能力 ×', 'a counter followed by ×'],
  ['deep-tier-size', 'docs/FILES.md', 'core 7 本 / deep 105 本', 'core 6 本 / deep 59 本', 'the same fact in Japanese'],
  ['alerts', 'PRODUCT.md', '自前 13 フィード', '自前 12 フィード', 'a feed count outside the one owning sentence'],
  ['alerts', 'README.md', 'countries over thirteen feeds', 'countries over twelve feeds', 'the capture group that was never compared'],
];

for (const [rule, file, good, bad, why] of DEFECTS) {
  test(`⑨ ${rule} goes red when ${file} states it as «${bad}» (${why})`, async () => {
    await withTreeLock(() => {
      const original = readFileSync(join(ROOT, file));
      const text = original.toString('utf8');
      assert.ok(text.includes(good), `${file} no longer carries «${good}» — this mutation has lost its subject`);
      try {
        writeFileSync(join(ROOT, file), text.replace(good, bad));
        let code = 0, out = '';
        try {
          out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check', '--rule=' + rule],
            { cwd: ROOT, encoding: 'utf8' });
        } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
        assert.equal(code, 1, `${rule} stayed green on «${bad}» in ${file}:\n` + out);
      } finally {
        writeFileSync(join(ROOT, file), original);
      }
    });
  });
}

/* ── ⑩ a counter only names the subject when nothing else is measured in it ──────────────── */
/* ⚠ THE GENERAL FIX IS NOT «BIND TO THE COUNTER». 「能力」「都市」「リング」 belong to one subject
   each, so binding to them is exact. 「か国」 and 「フィード」 do not: MEASURED, sweeping every one
   of those turned FIFTY-NINE true sentences into failures in one run — the radiation layer's
   countries, the internet-health layer's countries, the news layer's feeds, none of them about
   severe-weather alerts. That is why `alerts` binds the phrase that names the subject instead,
   and why the residual is written down rather than swept in. */
test('⑩ the alerts rule does not claim every countries-and-feeds number in the documents', () => {
  const src = rd('scripts/doc-facts.mjs');
  const block = src.slice(src.indexOf("let alertClaims = 0;"), src.indexOf("ok('alerts'"));
  assert.ok(block.length > 0, 'the alerts sweep moved — this test is pointing at nothing');
  for (const m of block.matchAll(/matchAll\(\/([^/]+)\//g)) {
    assert.match(m[1], /自前|MeteoAlarm|countries over/,
      `an alerts needle counts a bare counter with no subject in it: /${m[1]}/ — measured, that reads 59 true sentences as failures`);
  }
});

/* ── ⑪ a captured number that is never compared ──────────────────────────────────────────── */
test('⑪ every capture group the alerts rule takes is compared against the code', () => {
  const src = rd('scripts/doc-facts.mjs');
  const block = src.slice(src.indexOf('let alertClaims = 0;'), src.indexOf("ok('alerts'"));
  assert.ok(block.length > 0, 'the alerts sweep moved — this test is pointing at nothing');
  let loops = 0;
  /* each 「for (const m of body.matchAll(/…/g)) { … }」: read the pattern, then the loop body */
  for (const m of block.matchAll(/body\.matchAll\(\/((?:\\.|\[(?:\\.|[^\]])*\]|[^/\\])+)\/[gimsuy]*\)\)\s*\{/g)) {
    loops++;
    const groups = (m[1].match(/\((?!\?)/g) || []).length;
    const body = block.slice(m.index + m[0].length, block.indexOf('\n      }', m.index));
    const read = new Set([...body.matchAll(/m\[(\d+)\]/g)].map((x) => Number(x[1])));
    for (let g = 1; g <= groups; g++) {
      assert.ok(read.has(g),
        `capture group ${g} of /${m[1]}/ is taken and never read — the old README needle did`
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
test('⑫ capability-count goes red on the sentence that was shipped for nine rounds', async () => {
  await withTreeLock(() => {
    const rel = 'DECISIONS.md';
    const original = readFileSync(join(ROOT, rel));
    const text = original.toString('utf8');
    const good = '（138 のうち撤去済み 1 を除く 137）';
    assert.ok(text.includes(good), `${rel} no longer carries «${good}»`);
    try {
      writeFileSync(join(ROOT, rel), text.split(good).join('（130 のうち撤去済み 137 を除く 136）'));
      let code = 0, out = '';
      try {
        out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check', '--rule=capability-count'],
          { cwd: ROOT, encoding: 'utf8' });
      } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
      assert.equal(code, 1, 'the withdrawn/reachable claim went unchecked again:\n' + out);
      assert.match(out, /withdrawn count holds 1/, out);
      assert.match(out, /reachable half holds 137/, out);
    } finally {
      writeFileSync(join(ROOT, rel), original);
    }
  });
});

test('⑫ no capability needle carries one of the two counts as a literal', () => {
  const src = rd('scripts/doc-facts.mjs');
  const block = src.slice(src.indexOf('const CLAIMS = ['), src.indexOf('];', src.indexOf('const CLAIMS = [')));
  assert.ok(block.length > 0, 'the CLAIMS table moved — this test is pointing at nothing');
  assert.doesNotMatch(block, /撤去済み\\s\*\d/,
    'the withdrawn count is back inside the pattern — it goes silent the next time the prose is reworded');
});

/* ── ⑬ a needle that matches nothing reports green ───────────────────────────────────────── */
/* MEASURED (#R699): `languages` required 「対応 UI 言語は」 with half-width spaces around 「UI」,
   and `Architecture.md` §2 writes it without them — ZERO matches across all 44 documents, and
   `if (archN && …)` stepped over it, so the rule holding the language count to `js/locales/` was
   checking nothing at all. Both halves are tested: a wrong number, and a 正本 that stops saying it. */
for (const [what, from, to, expect] of [
  ['states the wrong number', '**対応UI言語は9つ**', '**対応UI言語は8つ**', /8 UI languages/],
  ['stops stating it at all', '**対応UI言語は9つ**', '**対応している UI の言語**', /no longer states how many UI languages/],
]) {
  test(`⑬ languages goes red when Architecture.md §2 ${what}`, async () => {
    await withTreeLock(() => {
      const original = readFileSync(join(ROOT, 'Architecture.md'));
      const text = original.toString('utf8');
      assert.ok(text.includes(from), `Architecture.md no longer carries «${from}»`);
      try {
        writeFileSync(join(ROOT, 'Architecture.md'), text.replace(from, to));
        let code = 0, out = '';
        try {
          out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check', '--rule=languages'],
            { cwd: ROOT, encoding: 'utf8' });
        } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
        assert.equal(code, 1, 'the languages rule stayed green:\n' + out);
        assert.match(out, expect, out);
      } finally {
        writeFileSync(join(ROOT, 'Architecture.md'), original);
      }
    });
  });
}

/* ── ⑭ «nothing disagreed» and «nothing was audited» are not the same green line ──────────── */
/* #R694 took the 260-character window out of `edge-shared`, but the sentence it criticised — a
   gate naming all eleven files while proving nothing about any document — could still be printed
   by a sweep that audited nothing, because the `ok()` was unconditional. */
test('⑭ edge-shared says how many document inventories it audited', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--rule=edge-shared'],
    { cwd: ROOT, encoding: 'utf8' });
  const line = out.split('\n').find((l) => l.includes('edge-shared:'));
  assert.ok(line, 'edge-shared did not report at all:\n' + out);
  const n = Number((line.match(/(\d+) document inventor/) || [])[1]);
  assert.ok(n >= 3, `edge-shared audited ${n} document inventory(ies); three documents enumerate _shared/\n` + line);
});
