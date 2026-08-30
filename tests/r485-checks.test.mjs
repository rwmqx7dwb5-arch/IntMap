/* ============================================================================
 *  R485 — 「DOM に在って viewport の中」は「読者に見えている」ではない
 * ----------------------------------------------------------------------------
 *  #R479 は CARTO の規約が求める帰属表示を地図の上に出した。**出したつもりだった。**
 *  本番で実測すると、右下に絶対配置したその pill は
 *
 *      desktop 1280 / 1920 : #lst-root（レイヤーパネル・x 993–1268）の下
 *      phone   390         : 下部ツールバー（btn-news / btn-info / btn-stats）の下
 *
 *  で、`elementFromPoint` は自分自身の3点すべてで**別の要素**を返した。
 *
 *  ⚠⚠⚠ **#R479 の検査は弱い問いしかしていなかった。** `display !== 'none'`・
 *  `visibility === 'visible'`・`opacity > 0.5`・「viewport の中」は**全部通る**——
 *  上に不透明な板が乗っていても。#R477（海岸線が不透明ラスタの9層下）と #R455
 *  （レイヤーの箱が入っている≠地図に在る）と同じ形が、もう一段上で再発した。
 *  ⇒ **問うべきは「その要素が最前面か」であって「その要素が可視か」ではない。**
 *
 *  ⚠⚠ **そして、移せる角は無かった。** 座標読み取り（x 409–780。地図モードでも
 *  マウスが地図上にあれば出る）・国情報パネル（x 424–718・bottom 60–174）・展開した
 *  Chronos（x 630–970）・レイヤーパネル（x≥993）を全部立てた状態で、175×26 が収まる
 *  矩形を地図カラム全面に走査して**ゼロ**だった。浮かせる限り保証はできない。
 *
 *  ⇒ **帯はオーバーレイをやめてレイアウトの1行になった。** `.map-column` が縦 flex で、
 *  地図がその上を取り、帯が下の行になる。**どのオーバーレイの包含ブロックも届かない行は、
 *  覆われようがない。**（`.map-container` は `position:relative` のままなので、既存の
 *  HUD は座標を1つも変えていない——`tests/r252` が固定する 9/9 も無傷。）
 *
 *  ⚠ 地図が `position:fixed`／`absolute` で流れを離れる2つのモード（携帯・sidebar-glass）
 *  だけは行が存在しえないので pill のまま。携帯の位置は**実測で露出を確認した**
 *  シート連動オフセットで、座標読み取りと Chronos が既に使っているものと同じ。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── ① the credit is a SIBLING of the map, not a child of it ─────────────────────────────────── */
test('R485 ① the credit sits outside the map container, in the map column', () => {
  const html = read('index.html');
  const col = html.indexOf('<div class="map-column">');
  assert.ok(col > 0, 'the map column wrapper exists');

  const mcOpen = html.indexOf('<div class="map-container" id="map-container">');
  const credit = html.indexOf('<div id="map-credit" class="map-credit"></div>');
  assert.ok(mcOpen > col, 'the map container is inside the column');
  assert.ok(credit > mcOpen, 'the credit comes after the map container opens');

  /* the decisive property: the credit is NOT inside #map-container. Walk the tags between the
     container's opening tag and the credit and check the depth has returned to zero. */
  const between = html.slice(mcOpen + '<div class="map-container" id="map-container">'.length, credit);
  const opens = (between.match(/<div\b/g) || []).length;
  const closes = (between.match(/<\/div>/g) || []).length;
  assert.equal(closes - opens, 1,
    'the credit must be a SIBLING of #map-container — inside it, every map overlay can cover it (that was #R479)');
});

/* ── ② the column is a flex column and the map yields the strip's height ─────────────────────── */
test('R485 ② the map column is a flex column and the map gives up the row', () => {
  const css = codeOnly(read('css/intmap.css'));
  assert.match(css, /\.map-column\{[^}]*display:flex[^}]*\}/, 'the column is a flex container');
  assert.match(css, /\.map-column\{[^}]*flex-direction:column[^}]*\}/, 'stacked vertically');
  assert.match(css, /\.map-column > \.map-container\{[^}]*flex:1 1 auto[^}]*\}/,
    'the map takes the space above the strip');
  assert.match(css, /\.map-column > \.map-container\{[^}]*height:auto[^}]*\}/,
    'height:100% would make the map overflow the column by exactly the strip height');
});

/* ── ③ the strip is a row, not an overlay ───────────────────────────────────────────────────── */
test('R485 ③ the base .map-credit rule is layout, not position', () => {
  const css = codeOnly(read('css/intmap.css'));
  const base = /\n\s*\.map-credit\{([^}]*)\}/.exec(css);
  assert.ok(base, 'the base rule exists');
  assert.ok(!/position:absolute|position:fixed/.test(base[1]),
    'the base rule must not position the credit — a positioned credit is a credit something can cover');
  assert.match(base[1], /flex:0 0 auto/, 'it is a fixed-height row of the column');
  assert.ok(!/display:none/.test(base[1]), 'and it is not shipped hidden');

  /* ⚠ GLASS MODE STAYS A ROW. The map goes position:absolute;inset:0 there, so instead of turning
     the credit into a differently-shaped pill, the MAP stops one strip-height short — one number,
     named once, so the two can never disagree. */
  assert.match(css, /\.map-column\{[^}]*--credit-h:\d+px/, 'the strip height has a name');
  assert.match(css, /\.map-credit\{[^}]*height:var\(--credit-h\)/, 'and the strip uses it');
  assert.match(css, /body\.sidebar-glass \.map-column > \.map-container\{[^}]*bottom:var\(--credit-h\)/,
    'glass mode pulls the map up by exactly the strip height rather than re-styling the credit');
  assert.ok(!/body\.sidebar-glass \.map-credit\{/.test(css),
    'glass mode must not need its own credit styling — that would be a second shape to keep in step');

  /* ⚠ THE PHONE IS THE ONE PLACE A PILL IS RIGHT: the map is fixed over the whole viewport and the
     bottom of it belongs to the sheet and the toolbar (MEASURED: every offset below ~150px is
     covered). The offset used is the one the coord readout and Chronos already share. */
  assert.match(css, /@media\(max-width:768px\)[\s\S]*?\.map-credit\{[^}]*position:fixed[^}]*bottom:calc\(var\(--sheet-cover, var\(--peek-h\)\) \+ 12px\)/,
    'the phone keeps the MEASURED sheet-aware offset — the same var the coord readout and Chronos use');
});

/* ── ④ capture mode still does not take the attribution away ─────────────────────────────────── */
test('R485 ④ the attribution survives capture mode', () => {
  const css = codeOnly(read('css/intmap.css'));
  assert.ok(!/body\.capture-mode[^{]*\.map-credit/.test(css),
    'a screenshot of the map is exactly the artefact the attribution has to travel with');
});

/* ── ⑤ the transient HUD did NOT move ────────────────────────────────────────────────────────── */
test('R485 ⑤ nothing else in the map column was moved to make room', () => {
  const css = codeOnly(read('css/intmap.css'));
  /* (#R504) moved 9 → 6 on request; the POINT of the assertion is unchanged — this round's strip
     did not move it, and tests/r252 ⑥ still pins the same pair of numbers. */
  assert.match(css, /\.coord-readout\{[^}]*bottom:6px; left:6px/,
    'the coord readout keeps the coordinates tests/r252 pins — the strip made room by shortening the MAP');
  assert.match(css, /\.news-timeline\{[^}]*right:14px; bottom:54px/, 'and Chronos keeps its own');
  assert.match(css, /\.country-info\{[^}]*bottom:60px; left:24px/, 'and so does the country panel');
});
