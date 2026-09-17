/* ============================================================================
 *  R783 · 帯が自分について述べたことが、dataset の扉で落ちていた
 * ----------------------------------------------------------------------------
 *  #R783 で js/gis-units.js が「量の意味」（kind / space / time / period）を表せるようにし、
 *  js/gis-raster.js の `total` 規則がそれを読んで **未申告なら拒む**ようになった。
 *  ⚠ ところが `js/gis-datasets.js` の `add()` は帯を `{name, unit, nodata}` で**作り直して**
 *  いたので、`quantity` を述べて到着した格子は、dataset を 1 つ通ると「未申告」になった。
 *  そして未申告は「合計してよい」ではない ⇒ 正しい答えが到達不能になる。
 *
 *  測るのは 2 つ: ① 述べた帯は述べたまま出てくる ② 述べていない帯は述べていないまま
 *  （欄を勝手に埋めない。[[intmap-data-must-not-claim-an-author-it-lacks]]）。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* 扉そのものを評価する: `bands.map(...)` の式をソースから取り出して走らせる。
   ⚠ 式を書き写さない——写した式は実装が戻っても緑のままになる（#R505）。 */
const SRC = readFileSync(new URL('../js/gis-datasets.js', import.meta.url), 'utf8');

function normaliseBands(bands) {
  const m = SRC.match(/bands: bands\.map\(\(b, i\) => \(\{[\s\S]*?\}\)\),/);
  assert.ok(m, 'js/gis-datasets.js no longer normalises bands where this test reads it');
  const fn = new Function('bands', 'return [' + m[0].replace(/^bands: /, '').replace(/,$/, '') + '][0];');
  return fn(bands);
}

test('R783 ① a band that declares its quantity still declares it after the dataset door', () => {
  const q = { kind: 'count', space: 'total', time: 'instant' };
  const out = normaliseBands([{ name: 'pop', unit: 'people', nodata: -9999, quantity: q }]);
  assert.deepEqual(out[0].quantity, q, 'the dataset door dropped what the band said about itself');
  assert.equal(out[0].unit, 'people', 'the unit did not survive');
  assert.equal(out[0].nodata, -9999, 'nodata did not survive');
});

test('R783 ② a band that says nothing still says nothing', () => {
  const out = normaliseBands([{ name: 'b1' }]);
  assert.equal(out[0].quantity, null, 'the door invented a quantity the band never declared');
  assert.equal(out[0].unit, null);
});

test('R783 ③ the declaration is carried verbatim — this file does not own the vocabulary', () => {
  /* 語彙の正本は js/gis-units.js の `quantity()`。ここで正規化すると同じ問いに 2 つ目の答えが
     できる（[[intmap-two-readers-one-field-list]]）。だから読めない申告も**そのまま**運ぶ。 */
  const odd = { kind: 'not-a-kind', space: 'sideways' };
  const out = normaliseBands([{ name: 'b', quantity: odd }]);
  assert.deepEqual(out[0].quantity, odd, 'the door judged the declaration instead of carrying it');
  assert.ok(!/normalis|vocabular|VOCAB/i.test(SRC.slice(SRC.indexOf('bands: bands.map'), SRC.indexOf('bands: bands.map') + 400))
    || /js\/gis-units\.js/.test(SRC.slice(Math.max(0, SRC.indexOf('bands: bands.map') - 1200), SRC.indexOf('bands: bands.map'))),
    'if this file now normalises quantities, it must say where the one vocabulary lives');
});

test('R783 ④ the documented shape of a band names the field', () => {
  assert.match(SRC, /bands:\[\{name,unit,nodata,quantity\}\]/,
    'the comment that documents a raster record still describes a band without its quantity');
});
