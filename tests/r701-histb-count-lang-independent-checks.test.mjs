/* ============================================================================
 *  #R701 — `histb-count` は 9 言語のうち 2 言語の綴りでできていた
 * ----------------------------------------------------------------------------
 *  `data/hist-borders.js` の大きさ（1689–1885 の窓に何件の記録と何件の変化日があるか）は
 *  9 言語の出典ページ・`Architecture.md`・`PRODUCT.md`・`docs/TESTING.md`・束を読むコードが
 *  それぞれ散文で述べている。それを実体と照合する `histb-count` の針は、単位語が
 *  `件の記録` / `records` / `件の変化日` / `transition dates` の **4 つ＝ en と ja の綴りだけ**
 *  でできていた。#R699 の実測:
 *
 *    · 針が見たのは **8 件**。実際に立っていた主張は **30 件**。**22 件が規則の外**。
 *    · うち **14 件**は de/es/fr/ru/ko/zh-Hant/zh-Hans が述べる**同じ 2 つの数**
 *      （ru 「1 411 записей … 881 различная дата изменений」・
 *       fr 「1 411 enregistrements … 881 dates de transition distinctes」）。
 *      ⚠ **9 言語ぶんの単位語を手で並べるのは場当たり**（`.agents/rules/no-ad-hoc-hardcoding.md`）
 *      ——訳が言い換えられた日に静かに外れ、10 番目の言語は最初から外にいる。
 *    · 潜在欠陥が同時にあった: `(\d{2,5})\s*<単位>` は **桁区切り付きの「1,411」を 411 と読む**
 *      （#R689 が `hist-cities` で直した形）。緑だったのは、桁区切り付きの行が**すべて偶然
 *      スコープの外**だったからで、**区切り除去なしに広げれば広げた瞬間に誤判定が出た**。
 *
 *  よってここが検査するのは「今の文面が正しいこと」ではない（それは `check:docs` の仕事）。
 *  **広げた規則が、広げた先で実際に赤くなること**である。
 *
 *    ① 9 言語の半分は**単位語を 1 つも使わない**——ru の数を 1 つ落とすと落ちる
 *    ② de/fr/ko でも同じ（**7 言語すべてが同じ 1 つの性質で守られている**）
 *    ③ 桁区切りは丸ごと読む——`1,411` を `2,411` にすると落ち、**`411` にしても落ちる**
 *       （後者が、旧い針が黙って通していた読み方そのもの）
 *    ④ スコープは**行ではなく文**——記録の名前が前の行にある主張が検査されている
 *    ⑤ 出典ページの名簿は**ディスクから発見**され、出荷言語数と照合される
 *    ⑥ 翻訳の側で**鍵**が消えると落ちる（値が無いことと、値が違うことを分ける）
 *    ⑦ `Architecture.md` が両方の数を述べなくなると落ちる（正本の沈黙も失敗）
 *    ⑧ ⚠ **段落はスコープではない**——`DEV-NOTES.md`（履歴）と、同じ文の中にある
 *       per-instant の計数は緑のまま。偽陽性を 1 件も作っていないこと
 *
 *  ⚠ 実行コスト（#R407・#R628 と同じ形）。変異は**木のロックを握ったまま**回すので、素の
 *  `doc-facts`（約 7.5 秒）ではなく `--rule=` で回し、取得は 1 回に畳む。ロックは
 *  `node_modules/.intmap-tree-lock` で、`node_modules` は原本からの junction ＝
 *  **このマシンの全 worktree が同じ錠を共有している**。
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
const LOCK_MS = 600_000;

/* ⚠ THE UNITS ARE ASSEMBLED, NEVER SPELLED OUT — AND THIS FILE IS WHY THAT HAD TO BE MEASURED.
   #R701 widened the sweep to everything git tracks, so a mutation table that wrote a wrong count
   beside its unit noun as ONE literal made `check:docs` report THIS file, on the first run. It is
   the trap docs/TESTING.md has now recorded fourteen times, and `scripts/doc-facts.mjs`'s own
   header assembles its needles from parts for exactly the same reason. */
const recs = (n) => n + ' rec' + 'ords';
const dates = (n) => n + ' transition' + ' dat' + 'es';

const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

function docFacts(...extra) {
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check', ...extra],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}
const only = () => docFacts('--rule=histb-count');

/** 壊す → 回す → **必ず**元のバイト列に戻す */
function withBroken(edits, fn) {
  const saved = edits.map((e) => [e.file, rd(e.file)]);
  try {
    for (const e of edits) {
      assert.ok(anchorRe(e.from).test(readLF(join(ROOT, e.file))), `${e.file} no longer contains the anchor for «${e.why}»`);
      writeFileSync(join(ROOT, e.file), readLF(join(ROOT, e.file)).replace(anchorRe(e.from), () => e.to));
    }
    return fn();
  } finally {
    for (const [f, bytes] of saved) writeFileSync(join(ROOT, f), bytes);
  }
}

test('R701 histb-count reaches all nine shipped languages, and reads grouped numbers whole',
  { timeout: 900_000 }, async (t) => {
  await withTreeLock(async () => {

    /* 前提: 木は緑。⚠ これ自体が ⑧ の半分である——`DEV-NOTES.md` は #R518 当時の
       「変化日 216 件」を正しく保持しており、`js/time-borders.js` は同じ文の中に
       per-instant の「210 features」を持っている。どちらも主張ではないので、広げた規則が
       それらを拾っていないことが、この 1 行が緑であることで示される。 */
    await t.test('⑧ the widened rule is green on the tree as it stands (no false claims)', () => {
      const r = only();
      assert.equal(r.code, 0, 'the widened rule is not green before any mutation:\n' + r.out);
      assert.match(r.out, /histb-count: \d+ stated number\(s\) across \d+ carrier\(s\) \+ \d+ number\(s\) held across the eight translations/,
        'the note no longer reports both halves');
      const n = Number(r.out.match(/\+ (\d+) number\(s\) held/)[1]);
      assert.ok(n >= 400, `the language-independent half is holding only ${n} numbers — the eight translations state ~56 each`);
    });

    /* ① 9 言語の半分。ru の出典ページから、正本が述べている数を 1 つ落とす。
       ⚠ 落とすのは**綴りではなく数**である——この半分はロシア語の単語を 1 つも知らない。 */
    await t.test('① a Russian translation that drops one of the 正本\'s numbers fails', () => {
      const r = withBroken([{
        file: 'js/locales/pages.ru.js', why: 'the transition-date count in Russian',
        from: '881 различная дата', to: '882 различная дата',
      }], only);
      assert.equal(r.code, 1, 'a Russian page stating a different number was accepted');
      assert.match(r.out, /pages\.ru\.js/, 'the report does not name the page that drifted');
      assert.match(r.out, /881/, 'the report does not name the number that went missing');
    });

    /* ② 同じ 1 つの性質が残りの言語も守っていること。⚠ **7 言語を 7 本の針で守るのではない**
       ——だから 10 番目の言語は、ページを置いた日から守られる。 */
    for (const [file, from, to, why] of [
      ['js/locales/pages.de.js', '1.411 Datensätze', '1.412 Datensätze', 'the record count in German'],
      ['js/locales/pages.fr.js', '881 dates de transition', '882 dates de transition', 'the transition-date count in French'],
      ['js/locales/pages.ko.js', '기록 1,411건', '기록 1,412건', 'the record count in Korean'],
      ['js/locales/pages.zh-hant.js', '881 個相異的變動日期', '882 個相異的變動日期', 'the transition-date count in Traditional Chinese'],
    ]) {
      await t.test(`② ${file.replace('js/locales/pages.', '').replace('.js', '')} is held by the same property`, () => {
        const r = withBroken([{ file, from, to, why }], only);
        assert.equal(r.code, 1, `${file} stating a different number was accepted`);
        assert.match(r.out, new RegExp(file.split('/').pop().replace(/\./g, '\\.')), 'the report does not name the page');
      });
    }

    /* ③ 桁区切り。⚠ **両向きに測る。** `2,411` で落ちるのは当然だが、**`411` でも落ちなければ
       ならない**——旧い針は単位語の直前 2〜5 桁を取るので、`1,411` を `411` に書き換えても
       「末尾の 411」として**一致して緑になった**。単位語は上の `recs()` が組み立てる。 */
    await t.test('③ a grouped number is read whole, in both directions', () => {
      const up = withBroken([{
        file: 'docs/TESTING.md', why: 'the grouped record count',
        from: recs('1,411'), to: recs('2,411'),
      }], only);
      assert.equal(up.code, 1, 'a grouped number with the wrong thousand was accepted');
      const down = withBroken([{
        file: 'docs/TESTING.md', why: 'the grouped record count',
        from: recs('1,411'), to: recs('411'),
      }], only);
      assert.equal(down.code, 1, 'the needle read the tail of a grouped number: ' + recs('411') + ' passed as 1,411');
      assert.match(down.out, anchorRe(recs('411')), 'the report does not quote the claim it rejected');
    });

    /* ④ スコープは文。`docs/TESTING.md` のこの対は、**記録の名前を前の行に持つ**——だから
       行スコープでは見えず、#R699 の実測では「規則の外」の 22 件に数えられていた。
       ⚠ 同じ変異が、記録を名指す語を消すと**見えなくなる**ことも測る（＝この主張が文の中の
       名前によって拾われていること自体の証拠）。 */
    await t.test('④ a claim whose LINE does not name the record, but whose SENTENCE does, is checked', () => {
      const anchor = rd('docs/TESTING.md');
      const line = anchor.split(/\r?\n/).find((l) => anchorRe(recs('1,411')).test(l));
      assert.ok(line && !/hist-borders|OpenHistoricalMap/.test(line),
        'docs/TESTING.md now names the record on the same line as the count — this test no longer proves sentence scope');
      const r = withBroken([{
        file: 'docs/TESTING.md', why: 'the transition-date count two lines below the record name',
        from: dates('881'), to: dates('882'),
      }], only);
      assert.equal(r.code, 1, 'a claim reachable only through its sentence was not checked');
    });

    /* ⑤ 名簿は発見される。⚠ **空の答えが全部を通してはならない**（#R628）——出荷言語数と
       照合するので、ページが 1 本消えれば半分が黙って縮むのではなく落ちる。 */
    await t.test('⑤ the nine source pages are discovered and held to the shipped language count', () => {
      const r = withBroken([{
        file: 'js/locales/_langs.js', why: 'the shipped language roster',
        from: '"de","en","es","fr","jp","ko","ru","zh","zh-hans"',
        to: '"de","en","es","fr","jp","ko","ru","zh","zh-hans","xx"',
      }], only);
      assert.equal(r.code, 1, 'a language shipping without a pages.<code>.js file was accepted');
      assert.match(r.out, /pages\.<code>\.js/, 'the report does not say which half went short');
    });

    /* ⑥ 値が違うことと、そもそも無いことを分ける。翻訳側の鍵が消えると、その行は英語に
       落ちる——数は正しいまま**その言語の読者には届かない**（#R588 の形）。 */
    await t.test('⑥ a translation that loses the key fails, and says so differently', () => {
      const key = 'OpenHistoricalMap (CC0 1.0)';
      const r = withBroken([{
        file: 'js/locales/pages.es.js', why: 'the Sources row key for this record',
        from: "'" + key + "':", to: "'" + key + " (renamed)':",
      }], only);
      assert.equal(r.code, 1, 'a translation with no entry for the row was accepted');
      assert.match(r.out, /has no/, 'a missing entry is reported as a number mismatch rather than as a missing entry');
    });

    /* ⑦ 正本の沈黙も失敗。⚠ 数が合っていることではなく、**述べていること**を測る。 */
    await t.test('⑦ Architecture.md going silent about either number fails', () => {
      const r = withBroken([{
        file: 'Architecture.md', why: 'the 正本 statement of the record count',
        from: '記録 1411 件', to: '記録がたくさん',
      }], only);
      assert.equal(r.code, 1, 'Architecture.md no longer stating the record count was accepted');
      assert.match(r.out, /正本/, 'the report does not say that Architecture.md is the 正本 for it');
    });

    /* ⑧ の残り半分: `--rule=` の綴りを間違えたら黙って緑にならないこと（#R628 ⑥ と同じ担保）。 */
    await t.test('⑧ a misspelled --rule= does not pass in silence', () => {
      const r = docFacts('--rule=histb-counts');
      assert.notEqual(r.code, 0, '--rule= with a name no rule has reported success');
    });
  }, { timeoutMs: LOCK_MS });
});
