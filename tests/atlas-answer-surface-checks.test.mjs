/* ============================================================================
 *  Atlas の回答の下に、ツールの文が二度目に出ない
 *  (js/atlas-turn-results.js `forReader` / `unfinished` / `proseMark` / `proseSplit`)
 * ----------------------------------------------------------------------------
 *  報告: 地震シミュレーションの回答の下に「到達時刻には地点が必要です…」「移動先: 東京都千代田区」「完了しなかった
 *  操作: earthquake」が並んだ。Atlas はツールの結果を文字として読んで回答を書く（atlas-toolsurface.js `mechanical`）ので、
 *  ツールが読者のために書いた文は、Atlas の言葉とツールの原文の二度、読者に届いていた。
 *
 *  これは 1 つのツールの欠陥ではない。直したのは「どのツールの文でも」効く 1 か所で、ここはその振る舞いを測る:
 *    ① 文（note / warn の印）だけでできた成功結果は、回答が書かれたあと画面に出ない
 *    ② 文と成果物（カード・リンク・図）が混ざった結果は、成果物だけが残る
 *    ③ 部分的・未確認・未観測の結果と、Atlas に渡りきらなかった長い結果は触らない（読者に負っている事実）
 *    ④ 失敗は内部名ではなく、そのツールが読者に向けて書いた文で名指される
 *    ⑤ 壊れた印は何も落とさない
 *    ⑥ 印は note と warn の 2 つの定義の両方に付いている（付いていない文は ① の外に残るので、写しを許さない）
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeAtlasTurnResults, proseMark, proseSplit, plainText } from '../js/atlas-turn-results.js';

const TRES = makeAtlasTurnResults({});
const note = (s) => proseMark('<div class="n">' + s + '</div>');
const warn = (s) => proseMark('<div class="w">⚠ ' + s + '</div>');
const LIMIT = 2000;

test('① 文だけでできた成功結果は、回答のあとは何も出さない（地震の報告の形）', () => {
  const quake = { ok: true, html: note('地震波 — P波・S波・表面波の波面をIASP91地球モデルでレイトレーシングし…') + warn('到達時刻には地点が必要です。') };
  const moved = { ok: true, html: note('移動先: 東京都千代田区') };
  assert.equal(TRES.forReader(quake, LIMIT), '');
  assert.equal(TRES.forReader(moved, LIMIT), '');
});

test('② 文と成果物が混ざった結果は成果物だけが残る', () => {
  const link = { ok: true, html: note('✓ この地図のリンク') + '<div class="u"><a href="https://example.org/x">https://example.org/x</a></div>' };
  const out = TRES.forReader(link, LIMIT);
  assert.match(out, /<a href="https:\/\/example\.org\/x">/);
  assert.doesNotMatch(out, /この地図のリンク/);
  const chart = { ok: true, html: note('グラフを描きました') + '<svg viewBox="0 0 10 10"></svg>' };
  assert.match(TRES.forReader(chart, LIMIT), /<svg/);
});

test('③ 部分的・未確認・未観測・長すぎる結果は触らない', () => {
  const h = note('地図は変わりませんでした');
  for (const meta of [{ partial: true }, { unverified: true }, { status: 'unobserved' }, { status: 'partial' }]) {
    assert.equal(TRES.forReader({ ok: true, html: h, meta }, LIMIT), h, JSON.stringify(meta));
  }
  const long = note('あ'.repeat(LIMIT + 1));
  assert.equal(TRES.forReader({ ok: true, html: long }, LIMIT), long, 'Atlas が最後まで読めなかった文は読者から奪わない');
  assert.equal(TRES.forReader({ ok: true, html: h, meta: { status: 'completed' } }, LIMIT), '');
});

test('④ 失敗は触らず、名指しは内部名ではなくツールが書いた文', () => {
  const failed = { ok: false, act: { type: 'earthquake' }, html: warn('震源はどこですか（地名または経緯度）') };
  assert.equal(TRES.forReader(failed, LIMIT), failed.html);
  const lines = TRES.unfinished(failed);
  assert.deepEqual(lines, ['⚠ 震源はどこですか（地名または経緯度）']);
  assert.ok(!lines.join('').includes('earthquake'), '内部の操作名を画面に出さない');
  // 印のない失敗の html も、その文字がそのまま読者の言葉になる
  assert.deepEqual(TRES.unfinished({ ok: false, html: '<div>取得できませんでした</div>' }), ['取得できませんでした']);
  assert.deepEqual(TRES.unfinished({ ok: false, html: '' }), []);
});

test('⑤ 壊れた印・入れ子の印は何も落とさない', () => {
  const open = '<!--atl:p-->閉じ忘れ';
  const s = proseSplit('前' + open);
  assert.equal(s.rest, '前' + open);
  assert.deepEqual(s.prose, []);
  const nested = proseSplit('a' + proseMark('x' + proseMark('y') + 'z') + 'b');
  assert.equal(nested.rest, 'ab');
  assert.equal(nested.prose.length, 1);
  assert.equal(plainText(nested.prose[0]), 'x y z', '印は取り除かれて空白になり、隣の文字を連結しない（連結すると印が組み上がりうる）');
  assert.equal(plainText('<b>a&amp;b</b> &lt;c&gt;'), 'a&b <c>');
});

test('⑥ 文を作る 2 つの定義（note / warn）の両方に印が付いていて、compose が使っている', () => {
  const src = fs.readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
  assert.match(src, /const note=s=>proseMark\(/);
  assert.match(src, /const warn=s=>proseMark\(/);
  assert.match(src, /TRES\.forReader\(res,TOOLS\.RESULT_TEXT_MAX\)/);
  assert.doesNotMatch(src, /actLabel\(r\.act\)\)\.filter\(Boolean\);\s*\n?\s*let _ih/, '画面の失敗行が内部名（actLabel）を使っている');
});

test('⑦ 「回答が書かれた」の判定は、js/atlas-agent.js が実際に述べる completion の値で動く（本番の返信で不活性だったと判明した形）', () => {
  /* 最初の版は `completion === 'answered'` を読んでいた。'answered' は `stopped` の値で `completion` には無いので、判定は一度も真にならず、
     検査は部品（forReader）だけを測っていて緑だった。判定の入力を、それを作る側の宣言から取る。 */
  const agent = fs.readFileSync(new URL('../js/atlas-agent.js', import.meta.url), 'utf8');
  const decl = agent.match(/const completion = [^;]*;/);
  assert.ok(decl, 'js/atlas-agent.js が completion を宣言している');
  const values = [...new Set([...decl[0].matchAll(/'([a-z]+)'/g)].map((m) => m[1]))];
  assert.deepEqual(values.sort(), ['complete', 'none', 'partial', 'unobserved'], 'completion の値の集合が変わった——written() の読み方を見直す');
  for (const v of values) assert.equal(TRES.written('回答です', v), v !== 'none', 'completion=' + v);
  assert.equal(TRES.written('回答です', ''), false, '実行前に書かれた say（completion がまだ無い）では文を外さない');
  assert.equal(TRES.written('回答です', undefined), false);
  assert.equal(TRES.written('', 'complete'), false, '本文が空なら外さない');
  const src = fs.readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
  assert.match(src, /const _done=TRES\.written\(say,ai\.__atlCompletion\)/);
  assert.doesNotMatch(src, /__atlCompletion==='answered'/, "'answered' は stopped の値であって completion の値ではない");
});
