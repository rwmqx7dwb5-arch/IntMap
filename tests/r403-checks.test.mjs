/* ============================================================================
 *  #R403 — 「Edge Function の本数」が、#R399 の監査の**次のラウンドから**また古かった回
 * ----------------------------------------------------------------------------
 *  `.claude/skills/intmap-round/SKILL.md` §6 は、毎セッションが読む deployment の手順として
 *  「9 本」と9つの名前を持っていた。実体は12本。#R399 はまさにこの事実を全文書で監査し
 *  `scripts/doc-facts.mjs` の規則を作り直したのに、この文書は**その走査対象に入っていなかった**。
 *
 *  黙っていた理由は2つあり、2つとも「落ちなかった」のではなく「**見ていなかった**」:
 *
 *    · 走査が**リポジトリ直下と `docs/` だけ**だった。指示文書（常設規則・ラウンド手順・
 *      subagent 定義）は一度も読まれていない。しかもそれらは、セッションが**行動する前に**
 *      読む文書である——9つの名前は deploy の指示で、従うと3本を黙って飛ばす。
 *    · **走査を広げても捕まらなかった。** 数の needle は名詞に直結した数しか読まない。
 *      この文は数を述語のあと（`…本番へ出す（9 本: …）`）に置いている。実測: 当該ファイルを
 *      走査に入れ、誤った数を残したまま `check:docs` は**緑のままだった**。
 *
 *  よってここで検査するのは「今が12本であること」ではない（それは `check:docs` の仕事）。
 *  **塞いだ側が実際に赤くなること**、そして**塞ぎ方が正しい文を巻き込まないこと**である。
 *
 *    ① 指示文書（`.claude/` の下）が本当に走査に入っている——そこに事実の食い違いを
 *       入れると落ちる。数とは無関係の2つの規則で確かめる（1つだと、その規則が
 *       たまたま効いているだけかもしれない）。
 *    ② 報告されたその欠陥そのものを書き戻すと `edge-roster` が落ち、
 *       **飛ばされる3本を名指す**。数だけの報告では「どの deploy を落とすか」が分からない。
 *    ③ 逆向き——正しく**部分的な**一覧を在庫の主張と読まない。木にある3つの実例で確かめる。
 *       ⚠ 文が消えたせいで緑、は同じ緑に見える（#R385 の形）ので、文の存在も確かめる。
 *    ④ 入れ子のチェックアウト（ハーネスの `.claude/worktrees/`）へ降りない。
 *       降りると、別のコミットに載った repository 全体を「この木の文書」として読む。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const SKILL = '.claude/skills/intmap-round/SKILL.md';

/* ⚠ (#R286/#R283) 錨は LF で書いてあり、このチェックアウトはそうとは限らない。照合は改行を
   緩めた正規表現で、**復元は元のバイト列**で行う（正規化して書き戻すと、テストを走らせた
   副作用として作業ツリーの改行が書き換わる）。 */
const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

function docFacts() {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* 壊す → 走らせる → 必ずバイト列を戻す
   ⚠ 錠は**自分で**取る（単体でも安全であるように）。ただし `withTreeLock` は**再入可能**なので、
   test 本体が既に取っていれば、ここは数えるだけで実際の取得は起きない。
   ⚠⚠ **この回は「変異ごとに取る」も試して、実測で外した。** 錠は行列ではなく取り合いなので、
   **費用を決めるのは保持の長さではなく持ち替えの回数**だった——変異ごとに取り直した版は
   `npm test` 全体で 12 → 8 件落ち、test 単位で1回だけ取る版は落ちない。
   長い保持が危険だったのは**生存判定が時計だった**からで、それは pid に直したので消えている
   （`tests/helpers/gate-lock.mjs` の頭を読むこと）。 */
async function breaking(file, mutate, fn) {
  await withTreeLock(() => {
    const originalBytes = rd(file);
    const original = readLF(join(ROOT, file));
    const broken = mutate(original);
    assert.notEqual(broken, original, `the mutation did not change ${file} — its anchor is gone`);
    try {
      writeFileSync(join(ROOT, file), broken);
      fn(docFacts());
    } finally {
      writeFileSync(join(ROOT, file), originalBytes);
    }
    /* ⚠ THE RESTORE IS CHECKED BY BYTES, NOT BY RUNNING THE GATE AGAIN. Comparing the file says
       exactly what «restored» means — these bytes, this file — whereas a green gate only says no
       rule noticed, and it costs another whole gate run under the lock. #R403 measured that the
       cheaper check is also the stricter one. */
    assert.equal(rd(file), originalBytes, `${file} was not restored byte-for-byte after the mutation`);
  });
}

/* 木を読むだけでも、他のファイルの変異の最中に走らせれば他人の赤を自分の赤として読む。
   ⚠ **「ゲートが赤だった」だけの失敗は、読み手に何も渡さない。** この回はまさにその形で
   4件を追いかけた——どの規則が落ちたのかも、木が汚れていたのかも分からない主張だった。
   赤いときは**ゲートの言い分**と**そのとき木が汚れていたか**を一緒に出す（後者が答えを分ける:
   汚れていれば錠の破れ、汚れていなければゲート自身の問題）。 */
function green(msg) {
  return withTreeLock(() => {
    const r = docFacts();
    if (r.code === 0) return;
    let dirty = '(git status unavailable)';
    try {
      dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() || '(clean)';
    } catch { /* leave the placeholder */ }
    assert.fail(`${msg}\n--- check:docs said ---\n${r.out}\n--- working tree at that moment ---\n${dirty}`);
  });
}
const BEFORE = 'check:docs must be green before any of this means anything';

test('R403 ① the instruction documents are inside the sweep', async () => {
  await withTreeLock(async () => {
    await green(BEFORE);
    /* 数とは無関係の2つの規則で確かめる。`usb` は「頻度を書いてよいのは CLAUDE.md だけ」、
       `serving` は「本番を OneDrive から配信していると書いてはならない」。どちらも
       `eachDoc` で全文書を見る規則なので、`.claude/` が走査に入っていれば必ず落ちる。
       ⚠ 1規則だけだと、その規則が偶然効いているだけかもしれない。 */
    const CASES = [
      { rule: 'usb', why: 'a backup frequency stated outside CLAUDE.md',
        at: 'USB へ完全ミラー（毎回）', add: 'USB へ完全ミラー（1 日 1 回）' },
      { rule: 'serving', why: 'production described as served from OneDrive',
        at: '## 6. deployment と本番検証', add: '## 6. deployment と本番検証\n\n本番は OneDrive から配信している。' },
    ];
    for (const c of CASES) {
      const re = anchorRe(c.at);
      assert.ok(re.test(readLF(join(ROOT, SKILL))), `${SKILL} no longer contains the anchor for «${c.why}»`);
      await breaking(SKILL, (s) => s.replace(re, () => c.add), (r) => {
        assert.equal(r.code, 1, `check:docs stayed GREEN with ${SKILL} broken — ${c.why}`);
        assert.ok(r.out.includes(c.rule), `check:docs failed but never named ${c.rule} (${c.why}):\n` + r.out);
        assert.ok(r.out.includes('SKILL.md'), `the report never named the file it read (${c.why}):\n` + r.out);
      });
    }
  });
});

test('R403 ② the defect this round fixed goes RED, and names the deploys that would be skipped', async () => {
  await withTreeLock(async () => {
    /* 報告された文そのもの。数（9 本）を述語のあとに置き、9つの名前を並べる形。 */
    const DEFECT = 'Edge Function を変えたなら本番へ出す（9 本: ai-proxy / alerts-relay / cable-geo /\n'
      + 'delete-account / monitor-run / news-ingest / news-relay / refresh-news / sv-cov）:';
    const re = anchorRe('Edge Function を変えたなら本番へ出す:');
    assert.ok(re.test(readLF(join(ROOT, SKILL))), `${SKILL} §6 no longer has the deploy sentence this test rewrites`);

    await breaking(SKILL, (s) => s.replace(re, () => DEFECT), (r) => {
      assert.equal(r.code, 1, 'check:docs stayed GREEN with the nine-name deploy list back in the round procedure');
      assert.ok(r.out.includes('edge-roster'),
        'the failure must be reported by the rule that reads the LIST — the count needle was measured green on this exact text:\n' + r.out);
      /* ⚠ 「9 ≠ 12」だけでは、読者は**どの3本の deploy を落とすか**を知れない。 */
      for (const n of ['aviation-feed', 'routing-relay', 'volcano-feed']) {
        assert.ok(r.out.includes(n), `the report never named ${n}, which this list silently drops:\n` + r.out);
      }
    });
  });
});

test('R403 ③ a roster that is missing a name, and a count that is wrong, both go RED', async () => {
  await withTreeLock(async () => {
    /* 名前を1つ落とす */
    const drop = anchorRe('`routing-relay` / `sv-cov`');
    assert.ok(drop.test(readLF(join(ROOT, 'CLAUDE.md'))), 'CLAUDE.md §5.1 no longer writes the roster in the shape this test edits');
    await breaking('CLAUDE.md', (s) => s.replace(drop, () => '`sv-cov`'), (r) => {
      assert.equal(r.code, 1, 'check:docs stayed green with a function missing from the roster');
      assert.ok(r.out.includes('edge-roster') && r.out.includes('routing-relay'),
        'the roster rule did not name the dropped function:\n' + r.out);
    });

    /* 数だけを間違える（名前は12本のまま） */
    const num = anchorRe('**Edge Functions は 12 本**');
    assert.ok(num.test(readLF(join(ROOT, 'CLAUDE.md'))), 'CLAUDE.md §5.1 no longer states the count next to the roster');
    await breaking('CLAUDE.md', (s) => s.replace(num, () => '**Edge Functions は 9 本**'), (r) => {
      assert.equal(r.code, 1, 'check:docs stayed green with the count wrong beside a correct roster');
      assert.ok(r.out.includes('edge-count') || r.out.includes('edge-roster'),
        'neither count rule fired on a wrong number:\n' + r.out);
    });
  });
});

/* ⚠ ④ と ⑦ は木を**書き換えない**が、`docFacts()` を走らせるので**読む側でも錠が要る**。
   `node --test` はファイルを並列に走らせ、`tests/r274 ③` や下の ⑥ は錠を取って一時的に木を
   壊す——その最中にゲートを走らせれば、**他人の変異を自分の赤として読む**。実測: 錠なしで
   「partial lists are all correct なのに check:docs が赤」で落ちた（#R403 で1回）。
   環境要因の赤は本物の退行と見分けがつかないので、読むだけの検査でも錠を取る。 */
test('R403 ④ a legitimately PARTIAL list of functions is not read as the roster', async () => {
  await withTreeLock(async () => {
    /* 木にある3つの実例。これらを在庫の主張と読む規則は、正しい文の上で赤を出す——
       そして次のラウンドで緩められる。⚠ 文が消えたせいで緑、を排除するため存在も確かめる。
       ⚠ `assert.match` を巨大ファイルに使わない——落ちるとファイル全体が印字される
       （Architecture.md は 96 KB。#R390 で実測した形）。真偽と短い message で言う。 */
    const arch = rd('Architecture.md');
    assert.ok(/を共有するのは8本\*\*（`alerts-relay`/.test(arch),
      'the relay-guard list is gone from Architecture.md — case ④ is no longer proven by the tree');
    assert.ok(/for f in refresh-news monitor-run/.test(arch),
      'the split deploy loop is gone from Architecture.md — case ④ is no longer proven by the tree');
    assert.ok(/All twelve are declared there now/.test(rd('docs/SECURITY-ARCHITECTURE.md')),
      'the "four most recently added" sentence is gone from docs/SECURITY-ARCHITECTURE.md — case ④ is no longer proven by the tree');

    /* そのうえで木が緑であること。上の3文はいずれも3本以上の実名を並べている。 */
    await green('check:docs is red on a tree whose partial lists are all correct');
  });
});

test('R403 ⑤ the sweep does not descend into a nested checkout', async () => {
  await withTreeLock(async () => {
    /* ハーネスは `.claude/worktrees/` の下に repository 全体の写しを作る（実測 #R282: 2本・
       11,615ファイル）。そこへ降りると、別のコミットに載った文書を「この木の文書」として
       読む——そして規則は全部「文書が実体と食い違っていないか」なので、必ず赤くなる。
       止める目印はフォルダ名ではなく `.git` の有無（＝チェックアウトをチェックアウトたらしめるもの）。 */
    await withTreeLock(() => {
      const nest = join(ROOT, '.claude/__r403-nested-checkout');
      assert.ok(!existsSync(nest), 'the scratch directory this test creates already exists');
      try {
        mkdirSync(nest, { recursive: true });
        writeFileSync(join(nest, '.git'), 'gitdir: ../../.git/worktrees/whatever\n');
        writeFileSync(join(nest, 'CLAUDE.md'), '# a second checkout\n\n**Edge Functions は 3 本**（`ai-proxy` / `sv-cov` / `news-relay`）。\n');
        const r = docFacts();
        assert.equal(r.code, 0,
          'the sweep walked into a directory holding a .git entry and read another checkout\'s documents as this one\'s:\n' + r.out);
      } finally {
        rmSync(nest, { recursive: true, force: true });
      }
    });
    await green('the cleanup left the tree failing');
  });
});

/* ⑥ この回が新しく足した5規則。**1つずつ壊して赤を見るまで、書いただけの規則である。**
   規則名まで確かめるのは、「別の理由で赤かった」を緑と同じくらい無意味にしないため。 */
const NEW_RULES = [
  /* named-path — 開けと言われたファイルが無い */
  { rule: 'named-path', file: '.claude/agents/intmap-i18n.md', why: 'a document naming a file that is not there',
    from: '繁体の **`js/locales/ui.zh.js`** を編集して', to: '繁体の **`js/locales/ui.zh-hant.js`** を編集して' },

  /* gate-lists — 一覧が package.json に追いつかなくなる */
  { rule: 'gate-lists', file: '.claude/agents/intmap-verifier.md', why: 'a gate dropped from the list a session is sent to',
    from: '| `npm run check:wars` | 紛争データの生成物と定義の一致 |\n', to: '' },

  /* preview-port — 式が worktree.mjs と食い違う */
  { rule: 'preview-port', file: 'CLAUDE.md', why: 'the port convention drifting from the tool that assigns it',
    from: 'ポート `4000 + N`**（R403 なら', to: 'ポート `4200 + N`**（R403 なら' },

  /* backup-shell — このマシンに無い shell を指示する */
  { rule: 'backup-shell', file: '.claude/skills/intmap-round/SKILL.md', why: 'the round procedure naming a shell that is not installed',
    from: 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1', to: 'pwsh -File scripts/backup-usb.ps1' },

  /* relay-guard — 1つの文書の中で2つの文が違う数を言う */
  { rule: 'relay-guard', file: 'Architecture.md', why: 'a shared-module count that no longer matches the imports',
    from: '`_shared/relay-guard.js` を共有するのは8本', to: '`_shared/relay-guard.js` を共有するのは5本' },

  /* backup-shell — ⚠ **文書ではなくコードの側**。#R396 がこのラウンドと並行して着地し、同じ
     古い launcher を3か所で見つけた——うち2か所は `.md` ではない（スクリプト自身の USAGE と、
     `worktree.mjs` が毎ラウンドの最後に印字するヒント）。そこは**コマンドを打つ直前の人が
     読む場所**で、`.md` だけを掃く規則は「手順書は直った」と報告しながら一番うるさい写しを
     見逃す。 */
  { rule: 'backup-shell', file: 'scripts/worktree.mjs', why: 'the stale launcher in the hint printed at the end of every round',
    from: '→  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1', to: '→  pwsh -File scripts/backup-usb.ps1' },

  /* ci-gates — `npm test` が走らせる門を CI から外す（この回まで5件がこの状態だった） */
  { rule: 'ci-gates', file: '.github/workflows/ci.yml', why: 'a gate npm test runs that no CI step reaches',
    from: '      - name: Cross-document facts (the documents still agree with the repository)\n        run: npm run check:docs\n', to: '' },
];

test('R403 ⑥ every rule this round added goes RED when its fact is made wrong', async () => {
  await withTreeLock(async () => {
    for (const c of NEW_RULES) {
      const re = anchorRe(c.from);
      assert.ok(re.test(readLF(join(ROOT, c.file))), `${c.file} no longer contains the anchor for «${c.why}»`);
      await breaking(c.file, (s) => s.replace(re, () => c.to), (r) => {
        assert.equal(r.code, 1, `check:docs stayed GREEN with ${c.file} broken — ${c.why}`);
        assert.ok(r.out.includes(c.rule), `check:docs failed but never named ${c.rule} (${c.why}):\n` + r.out);
      });
    }
  });
});

test('R403 ⑦ naming a file AS GONE is not a stale reference', async () => {
  await withTreeLock(async () => {
    /* `docs/MAP-LAYERS.md` は撤去した再解析の module を「一緒に消えている」と書く。この文は
       **ファイルが無いからこそ正しい**。逃げ道の無い named-path 規則は、唯一正しく書けている
       文書の上で赤を出す——そして次のラウンドで緩められる。
       ⚠ 文が消えたせいで緑、を排除するため、文の存在と**ファイルが実際に無いこと**の両方を見る。 */
    assert.ok(/`js\/wx-reanalysis\.js`（`imwxre:\/\/`）は、それだけを養っていたので一緒に消えている/
      .test(rd('docs/MAP-LAYERS.md')),
    'the sentence this escape is about is gone from docs/MAP-LAYERS.md — the case is no longer proven');
    assert.ok(!existsSync(join(ROOT, 'js/wx-reanalysis.js')),
      'js/wx-reanalysis.js is back, so that sentence is now the stale one — the case no longer proves the escape');
    await green('check:docs is red on a document that correctly names an absent file');
  });
});

test('R403 ⑨ `--gate --todo <code>` actually asserts something', async () => {
  await withTreeLock(async () => {
    /* ⚠ `.claude/agents/intmap-i18n.md` prints these two commands under the heading 「唯一のゲート」,
       which reads as «add --gate and it will assert». It did not: the `--todo` branch ended in an
       unconditional `process.exit(0)` and the `--gate` branch below it was never reached, so the
       command returned 0 on every tree in every state. Same shape as #R399 — a check that never
       fires cannot be told apart from one that passes — sitting inside the section that names
       itself the gate.
       ⚠ SO THE SOURCE SHAPE IS NOT ENOUGH. It is pinned first, because that is the exact line that
       regressed, and then the behaviour is measured on a tree with a real hole in it. */
    const src = rd('scripts/i18n-audit.mjs');
    const todo = src.slice(src.indexOf("--todo"), src.indexOf("--gate", src.indexOf("--todo")));
    assert.ok(!/\n\s*process\.exit\(0\);?\s*\n\s*\}/.test(todo) || /includes\('--gate'\)/.test(src),
      'the --todo branch exits before anything reads --gate again — that is the defect #R403 fixed');

    const audit = (...args) => {
      try {
        execFileSync(process.execPath, [join(ROOT, 'scripts/i18n-audit.mjs'), ...args],
          { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, out: '' };
      } catch (e) { return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
    };

    /* ⚠ 錠は変異の周りだけ。前後の「緑であること」は別に取る（helper 参照——保持が長いほど
       stale とみなされて壊される側に近づく）。 */
    await withTreeLock(() => {
      assert.equal(audit('--gate', '--todo', 'fr').code, 0, 'the tree must be green before this means anything');
    });
    await withTreeLock(() => {
      /* a real hole: the reading pages for one language stop existing. Emptied rather than deleted
         so the restore is a write of the original bytes, like every other mutation in this file. */
      const P = 'js/locales/pages.fr.js';
      const originalBytes = rd(P);
      try {
        writeFileSync(join(ROOT, P), '');
        const withGate = audit('--gate', '--todo', 'fr');
        assert.equal(withGate.code, 1, '`--gate --todo fr` stayed GREEN on a tree with a hole in fr');
        assert.ok(/incomplete language\(s\)/.test(withGate.out), 'it failed but never said which language:\n' + withGate.out);
        /* …and `--todo` ALONE is still a listing, not a gate — that half must not have changed */
        assert.equal(audit('--todo', 'fr').code, 0, '`--todo fr` alone became a gate; it is a listing for a person to read');
      } finally {
        writeFileSync(join(ROOT, P), originalBytes);
      }
      assert.equal(rd(P), originalBytes, `${P} was not restored byte-for-byte after the mutation`);
    });
  });
});

test('R403 ⑧ the sweep and the roster rule keep their shape', () => {
  const src = rd('scripts/doc-facts.mjs');
  assert.match(src, /walkMd\('\.claude'\)/, 'the sweep no longer walks the instruction documents');
  assert.match(src, /\.claude\/skills\/intmap-round\/SKILL\.md/,
    'the sweep no longer asserts that it reached the round procedure — an empty walk passes everything');
  const rule = src.slice(src.indexOf('2c.'), src.indexOf('2a.'));
  assert.ok(rule.length > 200, 'rule 2c is no longer where this test expects it in scripts/doc-facts.mjs');
  assert.match(rule, /eachDoc\(/, 'the roster rule stopped sweeping every document');
  assert.doesNotMatch(rule, /\[\s*'CLAUDE\.md'\s*,\s*'Architecture\.md'\s*\]/,
    'the roster rule is reading a hand-written document list again — that is the defect #R399 removed');
});
