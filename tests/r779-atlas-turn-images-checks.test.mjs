/* ============================================================================
 *  R779 — 「空なら null」を返す関数の戻り値に、呼び手が直接メソッドを生やしていないか
 * ----------------------------------------------------------------------------
 *  ⚠ #R773 は `VFRAMES.urls().concat(_atlRecallImgs)` と書いた。`urls()` は**フレームが 1 枚も
 *  無いとき null を返す契約**なので、`inspect` を一度も通っていない**普通の初回送信**が毎回
 *  `null.concat` で死に、本番の Atlas は回答の代わりに例外の文字列を返していた
 *  （実測: ai-proxy への POST は 1 本も出ない・添付の有無に依らない）。
 *
 *  ⚠ これを browser spec では捕まえられなかった。未ログインのターンは**モデル呼び出しの手前**で
 *  返るので、その 1 行は評価されない——#R777 の spec が「送信は吹き出しを作る」まで測って緑の
 *  まま、その下流が壊れていた。だからここは 2 つを別々に測る:
 *    ① 契約そのもの — `urls()` は空のとき本当に null を返す（実物を評価する）
 *    ② 受け止め     — 呼び手はその null を受けても落ちない（実物の式を評価する）
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeViewCapture } from '../js/atlas-view-capture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('① urls() は空のとき null を返す（[] ではない — これは契約）', () => {
  const V = makeViewCapture({ GE: {}, L: (en) => en, esc: (s) => s, waitIdle: async () => {}, snapshot: () => null, overpass: async () => null });
  assert.equal(V.urls(), null, '空のとき [] を返すようになったら、呼び手の前提が全部変わる');
});

test('② 呼び手はその null を受けても落ちず、空なら null のまま渡す', () => {
  const src = read('js/atlas-console.js');
  /* 実物の式をソースから取り出して評価する。⚠ 綴りを読むのではなく**走らせる**
     （#R505: ソースを読む検査は評価順序も例外も見られない）。 */
  const m = /const _atlTurnImgs=(\([\s\S]*?\}\s*);/.exec(src);
  assert.ok(m, '_atlTurnImgs が見つからない — 名前を変えたなら、この検査も一緒に動かす');
  // eslint-disable-next-line no-new-func
  const fn = new Function('return ' + m[1])();
  assert.equal(fn(null, []), null, 'フレーム無し・取り寄せ無しは null（画像は無い）');
  assert.deepEqual(fn(null, ['data:image/png;base64,A']), ['data:image/png;base64,A'], '取り寄せた画像だけでも渡る');
  assert.deepEqual(fn(['a'], ['b']), ['a', 'b'], 'フレームと取り寄せは並ぶ');
  assert.equal(fn(null, null), null);
  assert.deepEqual(fn(['a'], null), ['a']);
});

test('③ ターンの画像はその 1 か所からしか組まれない', () => {
  const src = read('js/atlas-console.js');
  assert.equal((src.match(/VFRAMES\.urls\(\)\.concat/g) || []).length, 0,
    'null を返す関数の戻り値に直接メソッドを生やしている — それがこのラウンドの欠陥そのもの');
  assert.match(src, /_atlTurnImgs\(VFRAMES\.urls\(\),_atlRecallImgs\)/);
});
