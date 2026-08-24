/* ============================================================================
 *  #R407 — 「deep tier はマージのあとに走る」が、10ファイル13か所で嘘のまま残っていた回の回帰テスト
 * ----------------------------------------------------------------------------
 *  #R207 が `browser-deep` を `push` から外してから **200 ラウンド**、リポジトリの散文は
 *  「nightly と、毎マージのあと」と言い続けていた。実測 2026-08-24: `7d2e21e` の post-merge run
 *  (32708285103) は deep のシャードも `deep-alarm` も **`skipped`**。
 *
 *  ⚠ 門そのものは守られていた——`tests/r207-checks` ⑫ が `if:` に `push` が無いことを #R207 以来
 *  主張し、200 ラウンド緑だった。突き合わせていなかったのは**散文**である。**機械が読む半分は
 *  正しく、人が読む半分は間違っていて、行動するのは人のほうだけ。** しかもいちばん読まれる写しは
 *  `scripts/run-tests.mjs` が **`npm test` のたびに端末へ印字する 1 行**だった。
 *  「マージが 15 分後に捕まえてくれる」と信じたラウンドは PR の前に `npm run test:deep` を
 *  走らせない——#R400（6夜連続で赤）と #R372 追記（本番が最初の検出器）がその値段。
 *
 *  よってここで検査するのは「今の文面が正しいこと」ではない（それは `check:docs` の仕事）。
 *  **規則 `deep-tier-when` が、両方の向きに実際に赤くなること**である。
 *
 *    ⓪ ⚠ **CI の static job は `npm run check:docs` を走らせない**（実測: 走るのは
 *       check:static / engine / testbudget / i18n / test:checks / capabilities / build / perf /
 *       assets の 9 本）。`test:checks` は走るので、**このファイルが規則 22 を CI へ届ける
 *       唯一の経路**である。偶然そうなっているのではなく、そのために在る。
 *    ① 腕A（否定・木を走査）— 散文を昔の主張に戻すと落ちる。スクリプト・端末の行・workflow
 *       自身・**行をまたいで折り返した** spec の 4 形すべてで、報告が 4 つとも名指すこと。
 *       折り返しは実話である: 行単位の grep は `tests/r337.spec.js` を取り逃がし、規則のほうが
 *       見つけた。
 *    ② 腕B（肯定・正本）— **門のほうを変える**と落ちる。`if:` に `push` を足しても、`schedule`
 *       を抜いても、`docs/TESTING.md` が追随していなければ赤。散文だけを見る検査には出せない
 *       向きで、これが「散文が門から離れられない」の実体。
 *    ③ 正本が**黙る**のは合格ではない（#R399 の形）。
 *    ④ 走査が木に届いていること。**空の走査は全部を通す。**
 *    ⑤ ラウンドが「tier とは何か」を学びに読むファイル (`scripts/tiers.mjs`) が、実際の
 *       トリガ集合を名乗っていること。集合は **ci.yml から導出**して照合する（写しを作らない）。
 *    ⑥ 上の①〜④が使う `--rule=` という近道そのものが、**綴りを間違えたら黙って緑にならない**こと。
 *
 *  ⚠ 実行コスト——ここは2度つまずいた。①〜④は**木のロックを握ったまま**`doc-facts` を回す。
 *  素の 1 回は 11 秒で、その 10 秒は `i18n-pair-audit` の子プロセス。
 *    · 最初の版は素で 15 回回して**ロックを2分以上握り、同じロックを待っている
 *      `tests/r399-checks ①` と `tests/r274-checks ③` を 180 秒で殺した**（実測）。
 *      ⇒ 変異は `--rule=deep-tier-when`（1.3 秒）で回す。1 ファイル合計 26 秒。
 *    · 次の版は**待つ側で**落ちた——⓪ が読むだけの主張のためにロックを取り、
 *      `tests/r399-checks ①` が 182 秒握っている間に 180 秒で諦めた（実測）。
 *      ⇒ ⓪ はロックを取らない。取る側は `LOCK_MS` まで待つ（錠は全 worktree 共有・下記）。
 *    · 三度目に**取得の回数**を削った。①〜④ で 4 回取っていたのを **1 回**に畳む
 *      （subtest にした）。取得のたびに他ファイルの後ろへ並び直すので、回数はそのまま待ちに
 *      なる。実測: 握っている合計 **8 秒**、この回が他のファイルに足す圧はそれだけ。
 *  **握る時間を短く、取る回数を少なく、待つ時間を長く。** 逆にすると、自分の検査が他人の
 *  検査を落とす——このラウンドは実際に `tests/r399-checks` `tests/r274-checks`
 *  `tests/r280-checks` を落としてから、ここに辿り着いている。
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
const CI = '.github/workflows/ci.yml';
const RULE = 'deep-tier-when';
/* ⚠ (#R407) 既定の 180 秒では足りない。木のロックは `node_modules/.intmap-tree-lock` にあり、
   `scripts/worktree.mjs` が `node_modules` を原本から **junction** するので、**このマシンの
   全 worktree（実測40本）が同じ錠を共有している**。実測: `tests/r399-checks ①` が 182 秒
   握り、こちらの 1.3 秒の仕事が 180 秒で諦めて落ちた。⚠ 長くしたのは**待つ側**だけで、
   握る側は短くしてある（`--rule` で 1 変異 1.3 秒・このファイル全体で 26 秒）。 */
const LOCK_MS = 600_000;

/* ⚠ (#R286/#R283) 錨は LF で書いてあり、このチェックアウトはそうとは限らない。照合は改行を
   緩めた正規表現で行い、**復元は元のバイト列**で行う。 */
const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

/* ⚠ 壊した文面（＝昔の嘘）を、このファイルの**ソースに連続した文字列として書かない**。
   規則 `deep-tier-when` は追跡下の全ファイルを走査するので、素直に書くと**このテストファイル
   自身が赤くなる**——`scripts/doc-facts.mjs` の冒頭が警告している自己命中そのもの。連結すると
   実行時にだけ組み上がり、走査が読むソースには現れない（`'` は連結子の文字集合に無い）。 */
const STALE_A = 'nightly and after every ' + 'merge';        /* 「毎晩と、毎マージのあと」 */
const STALE_B = 'nightly, after every ' + 'merge' + ', and on demand';

function docFacts(...extra) {
  try {
    /* ⚠ keep stdout on the GREEN path too — ⓪ has to see that the rule actually reported, and a
       helper that returns '' on success cannot tell «passed» from «never ran» (#R399). */
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check', ...extra],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}
/* 変異のたびに回すのはこちら（1.3 秒）。⑥ が、この近道が黙らないことを確かめている。 */
const onlyRule = () => docFacts('--rule=' + RULE);

/** その場で ci.yml から導出する——テストが答えの写しを持たないため */
function derivedTriggers() {
  const ci = rd(CI);
  const job = ci.match(/^ {2}browser-deep:\r?\n([\s\S]*?)^ {2}[A-Za-z]/m);
  assert.ok(job, `${CI} no longer has a browser-deep job`);
  const cond = job[1].split('\n').filter((l) => !/^\s*#/.test(l)).join('\n').match(/^ {4}if:\s*(.+)$/m);
  assert.ok(cond, 'browser-deep no longer carries an `if:` — the whole rule rests on it');
  return [...cond[1].matchAll(/github\.event_name\s*==\s*'([a-z_]+)'/g)].map((m) => m[1]);
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

/* ── ⓪ この行が、規則を CI へ届ける唯一の経路であること ───────────────────────────────── */
test('R407 ⓪ this file is how deep-tier-when reaches CI at all', () => {
  /* ⚠ CI の static job は `npm run check:docs` を**走らせない**（実測 #R407: 走るのは
     check:static / engine / testbudget / i18n / test:checks / capabilities / build / perf /
     assets の 9 本）。走る `test:checks` に居るのはこのファイルで、①が変異と復元のたびに
     `doc-facts` を回す——**それが、規則が merge の前に評価される唯一の経路**である。
     偶然そうなっているのではない。⚠ ロックも子プロセスも要らない主張なので**取らない**:
     最初の版はここで木のロックを取り、`tests/r399-checks` が 182 秒握っている間に
     180 秒で落ちた（実測）。読むだけの検査がロックを待つ理由は無い。 */
  const ci = rd(CI);
  const staticJob = ci.slice(ci.indexOf('  static:'), ci.indexOf('  browser:'));
  if (!/npm run check:docs/.test(staticJob)) {
    assert.match(rd('tests/r407-checks.test.mjs'), /assert\.equal\(onlyRule\(\)\.code, 0, 'the restore left the tree failing'\)/,
      'CI does not run check:docs, and this file no longer evaluates the rule either — it reaches no gate');
  }
});

/* ── ①〜④ 変異で赤を見る。⚠ ロックの取得は**この1回だけ** ───────────────────────────── */
/* 取得を4回に分けていた版は、そのたびに他ファイルの後ろへ並び直していた。錠は 40 worktree の
   共有物なので、並び直しはそのまま「他人が握っている時間ぶん待つ」を意味する。1回にまとめると
   待ちも1回で、**握っている合計は 8 秒ほど**——他のファイルから見て、この回の増分はそれだけ。 */
test('R407 ①〜④ deep-tier-when goes RED in both directions, and cannot pass on an empty sweep', async (t) => {
  /* ① 腕A: 散文を昔の主張に戻すと、4か所とも名指しで落ちる */
  const PROSE = [
    /* 依頼が名指したファイル。ラウンドが「tier とは何か」を学びに読む場所。 */
    { file: 'scripts/tiers.mjs', why: 'the header a round reads to learn what the tiers mean',
      from: 'Runs on the nightly `schedule`, on `workflow_dispatch` (the button,',
      to: 'Runs ' + STALE_A + ', and on demand (the button,' },

    /* いちばん読まれる写し——`npm test` のたびに端末へ出る1行。 */
    { file: 'scripts/run-tests.mjs', why: 'the line printed to the terminal on every `npm test`',
      from: 'the deep tier is NOT in this run, and the merge will NOT run it either',
      to: 'the deep tier runs ' + STALE_A },

    /* 門を持っている当の workflow の散文。ここが腐ると、読み手は `if:` の数行上で結論を出す。 */
    { file: CI, why: "the workflow's own prose, directly above the gate it contradicts",
      from: 'The job below: the nightly schedule and the dispatch button only',
      to: 'The job below: ' + STALE_B },

    /* ⚠ 行をまたいで折り返した主張。**行単位の grep はこれを取り逃がした**——このファイルは
       手作業の走査では見つからず、規則を書いて走らせた最初の実行が見つけた。 */
    { file: 'tests/r337.spec.js', why: 'a claim that WRAPS mid-sentence, which a line-based sweep misses',
      from: 'so they run on the nightly\n *       schedule and on the dispatch button (never on the merge, #R207)',
      to: 'so they run ' + 'nightly' + ' and after\n *       every ' + 'merge' },
  ];

  /* ② 腕B: 門のほうを動かすと、散文が追随していない限り落ちる */
  const IF = "    if: ${{ github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' }}";
  const GATES = [
    /* 門が `push` を得た: docs/TESTING.md はまだ「push では走らない」と言っている。 */
    { why: 'the gate gains `push`', says: /does NOT run on `push`/,
      to: IF.replace('}}', "|| github.event_name == 'push' }}") },
    /* 門が `schedule` を失った: docs/TESTING.md はまだ「schedule で走る」と言っている。 */
    { why: 'the gate loses `schedule`', says: /names `schedule` without saying the deep tier does NOT run on it/,
      to: "    if: ${{ github.event_name == 'workflow_dispatch' }}" },
  ];

  /* ③ 正本が黙るのは合格ではない */
  const T = 'docs/TESTING.md';
  const SILENT = [
    { why: 'the whole statement is gone', says: /no longer carries[^\n]*Where it runs/,
      from: '**Where it runs.**', to: '**How it is run.**' },
    /* workflow が発火するイベントを1つ言い落とす。「触れていない」を緑にすると、この回が
       塞いだ穴（誰も突き合わせていない事実）がそのまま戻る。 */
    { why: 'one event the workflow fires on is simply not mentioned', says: /does not say whether the deep tier runs on `pull_request`/,
      from: ', and **not** on `pull_request`', to: '' },
    /* ⚠ 2つ目の写しが在るのは「黙る」より悪い。**この規則の最初の版はこれで実際に外した**——
       本物の段落を潰したら、規則は下にあった2つ目の写しを黙って読み、別のことを報告した
       （`.indexOf` は #R399 の `.match()` と同じ「最初の1件で答える」欠陥）。 */
    { why: 'the 正本 has been duplicated, so the rule would read whichever comes first',
      says: /carries 2 [^\n]*paragraphs/,
      from: '**Where it runs.**', to: '**Where it runs.** **Where it runs.**' },
  ];

  const D = 'scripts/doc-facts.mjs';
  const NEEDLE = "'nightly|every night'";

  await withTreeLock(async () => {
    await t.test('① every place that states the triggers goes RED when it is made stale again', () => {
      /* 4つまとめて壊して1回で回す——規則は一致を**全部**報告するので、4つとも名指されることが
         各ケースの証明になる（1つでも見落とせば、その名前が報告に出ない）。 */
      const r = withBroken(PROSE, onlyRule);
      assert.equal(r.code, 1, 'the rule stayed GREEN with all four places stale:\n' + r.out);
      assert.ok(r.out.includes(RULE), `the report never named ${RULE}:\n` + r.out);
      for (const c of PROSE) {
        assert.ok(r.out.includes(c.file), `the report must name ${c.file} — ${c.why}:\n` + r.out);
      }
    });

    await t.test('② changing the GATE goes red until the 正本 follows it — both directions', () => {
      assert.ok(readLF(join(ROOT, CI)).includes(IF), 'the browser-deep gate is no longer written the way this test anchors on');
      for (const c of GATES) {
        const r = withBroken([{ file: CI, why: c.why, from: IF, to: c.to }], onlyRule);
        assert.equal(r.code, 1, `the rule stayed GREEN when ${c.why} and no document said so:\n` + r.out);
        assert.match(r.out, c.says, `the report must say WHICH way the prose and the gate disagree (${c.why}):\n` + r.out);
      }
    });

    await t.test('③ the 正本 going SILENT — or being duplicated — is a failure, not a pass', () => {
      for (const c of SILENT) {
        const r = withBroken([{ file: T, why: c.why, from: c.from, to: c.to }], onlyRule);
        assert.equal(r.code, 1, `the rule stayed green when ${c.why}:\n` + r.out);
        assert.match(r.out, c.says, `the report must name what went silent (${c.why}):\n` + r.out);
      }
    });

    await t.test('④ a sweep that reaches nothing FAILS instead of passing everything', () => {
      assert.ok(readLF(join(ROOT, D)).includes(NEEDLE), 'the tree sweep no longer greps for the nightly');
      const r = withBroken([{ file: D, why: 'the sweep matches nothing', from: NEEDLE, to: "'zz-no-such-word-zz'" }], onlyRule);
      assert.equal(r.code, 1, 'a sweep that matched no file at all reported success:\n' + r.out);
      assert.match(r.out, /the sweep is not reaching the tree/, 'the report must say the sweep found nothing:\n' + r.out);

      /* …and on the GREEN path it must actually be visiting a tree-sized number of files. */
      const green = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--rule=' + RULE],
        { cwd: ROOT, encoding: 'utf8' });
      const m = green.match(/deep-tier-when:[^\n]*?(\d+) file\(s\) mentioning the nightly/);
      assert.ok(m, 'the green report no longer says how many files the sweep visited:\n' + green);
      assert.ok(Number(m[1]) >= 20, `the sweep visited only ${m[1]} file(s) — it is no longer reaching the tree`);
    });

    /* ⚠ そして木が元に戻っていること。⓪ が「この行が規則を CI へ届ける」と指しているのはここ。 */
    assert.equal(onlyRule().code, 0, 'the restore left the tree failing');
  }, { timeoutMs: LOCK_MS });
});

/* ── ⑤ tier の意味を学びに読むファイルが、実際のトリガ集合を名乗る ─────────────────── */
test('R407 ⑤ scripts/tiers.mjs names the trigger set the workflow actually gates on', () => {
  const events = derivedTriggers();
  assert.ok(events.length, 'no `github.event_name ==` test in the browser-deep gate — nothing to compare against');
  const header = rd('scripts/tiers.mjs').slice(0, 4000);
  for (const e of events) {
    assert.ok(header.includes(e), `scripts/tiers.mjs never names \`${e}\`, which is one of the events ${CI} gates the deep tier on`);
  }
  /* そして「マージが捕まえてくれる」の否定が、読み手に届く場所に在ること。 */
  assert.match(header, /MERGE DOES NOT CATCH IT|NOT ON PUSH/,
    'scripts/tiers.mjs states when the deep tier runs but never says plainly that the merge does not catch it');
});

/* ── ⑥ 近道そのものが黙らないこと ────────────────────────────────────────────────────── */
test('R407 ⑥ the --rule shortcut the cases above rely on cannot silently match nothing', () => {
  /* ①〜④ は `--rule=deep-tier-when` で回している。綴りが1文字ずれた瞬間に「何も検査しないが
     exit 0」になるなら、4つの証明はまとめて無意味になる——#R399 の「発火しない検査は通った
     検査と見分けがつかない」を、この回が自分で入れた近道に当てる。 */
  const typo = docFacts('--rule=' + RULE + 'x');
  assert.equal(typo.code, 2, '--rule with a name that matches no rule must be an error, not a pass:\n' + typo.out);
  assert.match(typo.out, /matched no rule/, 'and it must say why:\n' + typo.out);
  /* …and the real name does match something. */
  assert.equal(docFacts('--rule=' + RULE).code, 0, `--rule=${RULE} does not match the rule it is named after`);
});
