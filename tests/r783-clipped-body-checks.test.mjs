/* ============================================================================
 *  R783 · 切られた本文は、切られたと述べる (a clip that says so)
 * ----------------------------------------------------------------------------
 *  #R783 が `askReading()` に「読む面そのものを読む」をさせた結果、長い出来事の本文
 *  （synthesis ＋ 各媒体の見出し ＋ Coverage 一覧）は `RENDER_LIMITS.maxBody` = 2,600 を
 *  実際に超える。上限そのものは #R413 の判断どおり残す——外から来る 200 kB の記事が
 *  プロンプト全体になるのを止めるためのもので、Atlas への制限ではない。
 *
 *  ⚠ 誤っていたのは上限ではなく、**黙って切っていたこと**（#R320 が名づけた無言の打ち切り）。
 *  Atlas は上だけを渡され、残りが在ることを誰からも聞いていなかった。
 *
 *  測るのは 3 つ: ① 上限内の本文は註を持たない ② 超えた本文は「切った・全体で何字か」を
 *  述べる ③ 渡される中身は上限どおりで、読者が見る順の先頭である。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* js/atlas-state.js は DOM も globals も要る面なので、測るのは renderPrompt() が本文について
   emit する 1 行の組み立てだけ——その式をソースから取り出して評価する（#R779 と同じ手）。
   ⚠ 式を書き写さない: 書き写した式は、実装が変わっても緑のままになる。 */
const SRC = readFileSync(new URL('../js/atlas-state.js', import.meta.url), 'utf8');

function bodyLineOf(body, maxBody) {
  const m = SRC.match(/if \(ar\.body\) \{([\s\S]*?)\n        \}/);
  assert.ok(m, 'js/atlas-state.js no longer has the `if (ar.body)` block this test measures');
  const lines = [];
  const fn = new Function('ar', 'lim', 'lines', 'str', m[1] + '\n return lines;');
  fn({ body }, { maxBody }, lines, String);
  assert.equal(lines.length, 1, 'the body block no longer emits exactly one line');
  return lines[0];
}

const LIMIT = (() => {
  const m = SRC.match(/RENDER_LIMITS = \{[^}]*maxBody:\s*(\d+)/);
  assert.ok(m, 'RENDER_LIMITS.maxBody is not where this test reads it');
  return Number(m[1]);
})();

test('R783 ① a body inside the cap carries no note about being cut', () => {
  const body = 'x'.repeat(LIMIT - 1);
  const line = bodyLineOf(body, LIMIT);
  assert.ok(!/CLIPPED/.test(line), 'an uncut body claims to have been cut');
  assert.ok(line.includes(body), 'the whole body did not reach the prompt');
});

test('R783 ② a body over the cap says it was cut, and by how much', () => {
  const body = 'y'.repeat(LIMIT + 4321);
  const line = bodyLineOf(body, LIMIT);
  assert.match(line, /CLIPPED/, 'the clip is silent — Atlas is handed the top with nothing saying the rest exists');
  assert.ok(line.includes(String(LIMIT)), 'the note does not say how much was shown');
  assert.ok(line.includes(String(body.length)), 'the note does not say how long the whole body is');
  assert.match(line, /you have NOT been shown it|the rest is below the cut/,
    'the note does not tell Atlas that the remainder was withheld from it');
});

test('R783 ③ what is handed over is the cap, and it is the reader\'s own order', () => {
  const head = 'HEADLINE-FIRST ';
  const body = head + 'z'.repeat(LIMIT * 2);
  const line = bodyLineOf(body, LIMIT);
  const quoted = line.slice(line.indexOf('"""') + 3, line.lastIndexOf('"""'));
  assert.equal(quoted.trim().length, LIMIT, 'the quoted body is not exactly the cap');
  assert.ok(quoted.trim().startsWith(head), 'the cut took something other than the top of what the reader sees');
});

test('R783 ④ the cap itself was not raised or lowered by this round', () => {
  /* #R413 の判断（外から来る本文にだけ残った 2 つの上限）を、この回が黙って動かしていないこと。
     ⚠ これは方針の検査であって天井の番人ではない——上限を変えるなら #R413 の段落と一緒に変える。 */
  assert.equal(LIMIT, 2600, 'maxBody moved; if that is intended, the #R413 paragraph above it must say why');
  assert.match(SRC, /maxTitle: 140/, 'maxTitle moved');
});
