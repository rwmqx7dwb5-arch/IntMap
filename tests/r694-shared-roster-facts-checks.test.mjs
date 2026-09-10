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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { sharedRoster, inventories, auditRoster } from '../scripts/shared-roster.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
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
      const n = victim.replace(/\./g, '\\.');
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
        const re = new RegExp('[ \\t\\r\\n]*/[ \\t\\r\\n]*(`?' + name.replace(/\./g, '\\.') + '`?)');
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
      const line = new RegExp('^[ \\t]*' + victim.replace(/\./g, '\\.') + '\\b[^\\r\\n]*\\r?\\n', 'm');
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
      const line = new RegExp('^[ \\t]*' + victim.replace(/\./g, '\\.') + '\\b[^\\r\\n]*\\r?\\n', 'm');
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
