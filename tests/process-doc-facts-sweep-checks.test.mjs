/* ============================================================================
 *  IntMap · the cross-document gate reaches the tree, and is not blind
 * ----------------------------------------------------------------------------
 *  scripts/doc-facts.mjs compares the facts written in more than one document with the repository
 *  and with each other. Held here: every rule reports on a green run, the sweep reaches every
 *  current-state document (discovered, not hand-listed), a real violation fails it, Architecture.md
 *  stays a specification rather than a changelog, and the three rules #R628 added (section-refs,
 *  gate-callers, languages) actually go red. ⚠ The mutations are made in a PRIVATE COPY of the
 *  checkout (tests/helpers/scratch-tree.mjs) and the gate is run from it — never in the tree, so no lock.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r274, r628
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { npmTestRunsScript } from './helpers/ci-reach.mjs';
import { scratchTree } from './helpers/scratch-tree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* the private copy every mutation below is made in — built on first use (tests/helpers/scratch-tree.mjs) */
const SCRATCH = scratchTree();
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;
/* a literal anchor that tolerates either line ending — the checkout's, not the author's (#R286/#R283) */
const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R274 — was tests/r274-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · the documents describe the repository that exists  (checks)
 * ----------------------------------------------------------------------------
 *  「現状の Architecture.md は『現行仕様の正本』として全面的には信用できません」
 *
 *  Two separate jobs here:
 *
 *   A. Architecture.md is a CURRENT-STATE specification again — 1,600 lines describing what
 *      the app is, with the round-by-round history removed to DEV-NOTES.md where it belongs.
 *      The mechanical property that keeps it that way is "no round references in the file".
 *
 *   B. The facts written down in MORE THAN ONE document are machine-compared, both with the
 *      repository and with each other (`scripts/doc-facts.mjs`). A fact in two places rots in
 *      one place at a time, and the reader who opens the stale copy is simply misled.
 *
 *  ⚠ AND THE GATE MUST NOT BE BLIND. The failure this repository keeps meeting is an
 *    instrument that is green because its population is empty. So the tests below check that
 *    every rule actually REPORTED, that the sweep reached the tree, and — with a throw-away
 *    document — that a violation really does fail the gate.
 * ==========================================================================*/

function runGate(args = []) {
  try {
    const out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), ...args],
      { cwd: SCRATCH.root, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/* ── ① the gate passes, and it reports EVERY rule ────────────────────────────────────────── */
/* ⚠ (#R403) THIS LIST USED TO BE TWELVE NAMES TYPED OUT HERE, AND THE GATE HAD TWENTY-NINE.
   Seventeen rules were outside the one test whose whole point is «a rule that does not run cannot
   fail» — including every rule added after this file was written. It is now derived from the gate's
   own source: a rule reports `✓ name:` on a green run exactly when it calls `ok('name')`, so that
   is what is read. #R403's subject was a hand-written list of documents; this is the same shape one
   level up, in the test that was supposed to be watching. */
const RULES = [...new Set([...readFileSync(join(ROOT, 'scripts/doc-facts.mjs'), 'utf8')
  .matchAll(/\bok\('([a-z-]+)'/g)].map((m) => m[1]))].sort();

test('#R274 ① the cross-document gate passes, and every rule actually ran', async () => {
  /* an empty derivation would pass the loop below without asserting anything — the exact failure
     this file's header is about */
  assert.ok(RULES.length >= 12, `only ${RULES.length} rules were read out of scripts/doc-facts.mjs — the derivation is not reaching it`);
  /* in the private copy: the mutation checks in tests/process-doc-facts-claims-checks.test.mjs used to
     write broken values into tracked documents, and a run of the real tree read them (PR #819 CI). They
     break their own copies now; this asks the copy this file's mutations run in. */
  const { code, out } = runGate(['--check']);
  assert.equal(code, 0, 'scripts/doc-facts.mjs --check failed:\n' + out);
  for (const r of RULES) {
    assert.ok(out.includes('✓ ' + r + ':'), `the gate never reported the rule "${r}" — a rule that does not run cannot fail\n` + out);
  }
});

test('#R274 ② the sweep reaches the whole tree of current-state documents', () => {
  const { out } = runGate();
  /* (#R403) the sweep has two halves now — the prose documents and the instruction documents
     under `.claude/` — and it prints them separately, so both can be checked rather than a total
     that two errors could cancel out of */
  const m = out.match(/(\d+) current-state documents scanned \((\d+) prose \+ (\d+) instruction\)/);
  assert.ok(m, 'the gate no longer reports how many documents it scanned, split by kind:\n' + out);
  const [total, prose, instruction] = m.slice(1).map(Number);

  /* ⚠ (#R628) COUNTED THE WAY THE GATE DISCOVERS THEM, NOT THE WAY IT USED TO BE WRITTEN. This
     used to add up two readdirSync calls — the root and `docs/` — which is exactly the hand-drawn
     universe #R628 replaced: `fonts/README.md` carries a standing instruction and the OFL notice
     and was in neither. A test that re-states the old shape would hold the gate to the blind spot
     it was widened out of, so it asks git for the same two halves (tracked, and present-but-not-
     yet-tracked — the document being written this round) and applies the same written exclusions. */
  const EXCL = [/^DEV-NOTES/, /^dev-notes\//, /^\.agents\//, /^\.(claude|codex)\//, /^CLAUDE\.local\.md$/];
  const gitMd = (...a) => execFileSync('git', ['ls-files', '-z', ...a, '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const expectedProse = [...new Set([...gitMd(), ...gitMd('--others', '--exclude-standard')])]
    .filter((f) => !EXCL.some((re) => re.test(f)) && existsSync(join(ROOT, f))).length;
  assert.equal(prose, expectedProse, 'the gate did not read every prose document it should');

  /* ⚠ COUNTED WITH THE SAME RULE THE GATE USES — stop at any directory holding a `.git` entry.
     A naive walk of `.claude/` is machine-dependent, not merely imprecise: the master working copy
     carries the harness's worktrees, each a complete second checkout. MEASURED there, a naive
     enumeration finds 1,029 markdown files against the gate's 8, so a test that counted that way
     would pass in a temp worktree and fail in the one place the documents actually live. */
  const walkMd = (rel, acc = []) => {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) return acc;
    const ents = readdirSync(abs, { withFileTypes: true });
    if (ents.some((e) => e.name === '.git')) return acc;
    for (const e of ents) {
      if (e.isDirectory()) walkMd(rel + '/' + e.name, acc);
      else if (e.name.endsWith('.md')) acc.push(rel + '/' + e.name);
    }
    return acc;
  };
  /* (#R503) the instruction documents moved to the provider-neutral `.agents/`, so Codex reads
     them too. What is left under `.claude/` is RENDERED from them by scripts/agent-sync.mjs, and
     scanning a copy beside its source would report every finding twice while proving nothing. */
  const expectedInstruction = walkMd('.agents').length;
  assert.equal(instruction, expectedInstruction, 'the gate did not read every instruction document under .agents/');
  assert.equal(total, prose + instruction, 'the two halves do not add up to the total the gate printed');
  assert.ok(instruction >= 3, `only ${instruction} instruction document(s) scanned — the .claude/ half is not reaching the tree`);
  assert.ok(total >= 15, `only ${total} documents scanned — the sweep is not reaching the tree`);
});

/* ── ③ …and it is NOT blind: a real violation fails it ───────────────────────────────────── */
/* ⚠ (#R280) THIS TEST USED TO WRITE TO THE TREE, AND SO DID tests/r280 ②. `node --test` runs files in
   parallel, so one file's probe was on disk while the other asserted the tree was clean — measured:
   this test passed alone and failed inside `npm test`. (mutation-tests-off-tree) The probe is planted
   in this file's private copy of the checkout now, where no other file can see it. */
test('#R274 ③ a violating document really does fail the gate', () => {
  const probe = 'docs/_doc-facts-negative-probe.md';
  /* assembled, so this test file is not itself a violation of the rule it is proving */
  const badStamp = '`/' + '-' + 'build-info.json`';
  const { code, out } = SCRATCH.mutate(
    [{ file: probe, text: '# probe\n\nCheck ' + badStamp + ' to see which build is live.\n' }],
    () => runGate(['--check']));
  assert.equal(code, 1, 'a document spelling the build stamp wrongly did NOT fail the gate:\n' + out);
  assert.match(out, /build-info —/, 'the gate failed, but not for the reason under test:\n' + out);
  assert.equal(SCRATCH.exists(probe), false, 'the probe outlived the run');
  const after = runGate(['--check']);
  assert.equal(after.code, 0, 'the probe was not cleaned up — the copy is left failing');
});

/* ── ④ the gate is wired into the run, so it cannot quietly stop running ─────────────────── */
test('#R274 ④ the gate runs as part of `npm test`', () => {
  /* (gate-parity-and-shards) asked of `npm test`'s evaluated plan (tests/helpers/ci-reach.mjs), not of
     scripts/test-parallel.mjs's text: that file discovers its gates from package.json and names none. */
  assert.ok(npmTestRunsScript('doc-facts'),
    'scripts/doc-facts.mjs is not in the source-level chain — it would never run');
  assert.ok(npmTestRunsScript('arch-files-check'),
    'scripts/arch-files-check.mjs is not in the source-level chain — §3 could drift silently');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:docs'], 'node scripts/doc-facts.mjs --check');
});

/* ── ⑤ Architecture.md is a specification, not a changelog ───────────────────────────────── */
test('#R274 ⑤ Architecture.md carries no round references', () => {
  const md = read('Architecture.md');
  const hits = [];
  md.split('\n').forEach((l, i) => {
    if (/(?:#R\d{1,3}|(?:^|[^A-Za-z0-9_/])R\d{1,3}(?![\d)A-Za-z]))/.test(l)) hits.push(i + 1 + ': ' + l.trim().slice(0, 70));
  });
  assert.deepEqual(hits, [], 'the history is creeping back into the specification:\n' + hits.join('\n'));
});

test('#R274 ⑥ Architecture.md still has §1–§18, in order', () => {
  const md = read('Architecture.md');
  const nums = [...md.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums, Array.from({ length: 18 }, (_, i) => i + 1),
    'a top-level section was lost or reordered — this file is the map other documents point at');
  assert.ok(!/^## 19\. /m.test(md), 'a §19 appendix is back; per-round appendices belong in DEV-NOTES.md');
});

test('#R274 ⑦ Architecture.md says what the reader most needs to be told correctly', () => {
  const md = read('Architecture.md');
  /* the three facts whose staleness was actively dangerous: what is served, where the DB schema
     lives, and how many Edge Functions there are. Relations, not literals — the numbers are the
     gate's job (rule app-size / edge-functions), this is about the sentences existing at all. */
  assert.match(md, /`dist\/`/, 'Architecture.md no longer says that dist/ is what is served');
  assert.match(md, /supabase\/migrations\//, 'Architecture.md no longer points the restore procedure at the migrations');
  assert.match(md, /`src\/vendor\.js`/, 'Architecture.md no longer says where the Supabase connection lives');
});

/* ── ⑧ single-owner facts stay single-owner ──────────────────────────────────────────────── */
test('#R274 ⑧ each shared fact still has exactly one owner', () => {
  assert.match(read('AGENTS.md'), /USB/, 'AGENTS.md §11 is the owner of the backup procedure and no longer mentions it');
  assert.match(read('docs/RELEASE.md'), /ENABLE_PAGES_DEPLOY/, 'docs/RELEASE.md is the owner of the release procedure');
  assert.match(read('docs/SECURITY-ARCHITECTURE.md'), /## 6\. Browser security/,
    'docs/SECURITY-ARCHITECTURE.md is the owner of the browser-security posture');
  /* Architecture.md points at those owners rather than restating them */
  const md = read('Architecture.md');
  for (const owner of ['docs/RELEASE.md', 'docs/SECURITY-ARCHITECTURE.md', 'AGENTS.md']) {
    assert.ok(md.includes(owner), `Architecture.md no longer points at ${owner}`);
  }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R628 — was tests/r628-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
 *  ⚠ 実行コスト（#R407 が二度つまずいた形をそのまま踏襲する）。変異は何度も回すので、素の
 *  `doc-facts`（11 秒・うち 10 秒は `i18n-pair-audit` の子プロセス）ではなく `--rule=`（約 1 秒）
 *  で回す。変異はこのファイル専用の写し（tests/helpers/scratch-tree.mjs）に書くので、錠は無い
 *  （mutation-tests-off-tree。錠があった頃は全 worktree が同じ錠を取り合っていた）。
 * ==========================================================================*/


function docFacts(...extra) {
  try {
    const out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--check', ...extra],
      { cwd: SCRATCH.root, encoding: 'utf8' });
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
      SCRATCH.write(e.file, readLF(join(ROOT, e.file)).replace(re, () => e.to));
    }
    return fn();
  } finally {
    for (const [f, bytes] of saved) SCRATCH.write(f, bytes);
  }
}

/* ── ①〜⑤ 変異。取得は 1 回だけ ─────────────────────────────────────────────────────────── */
test('R628 the three new document rules actually go red', { timeout: 900_000 }, async (t) => {
  {

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
      /* ⚠ (#R771) THE MUTATION MOVED WITH THE CALLER. It used to blank one gate's own step; since
         the gates run through scripts/ci-gates.mjs the caller IS the shard invocation, so that is
         what gets blanked. The claim is unchanged — remove what runs a declared gate and the rule
         must name it — and it is now a stronger mutation: it orphans every gate at once, so a rule
         that had quietly stopped looking could not survive it. */
      const r = withBroken([{
        file: '.github/workflows/ci.yml', why: 'the step that runs a shard of the declared gates',
        from: 'run: node scripts/ci-gates.mjs --shard', to: 'run: echo skipped --shard',
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
  }
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
}
