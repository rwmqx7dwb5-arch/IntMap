/* ============================================================================
 *  R428 — 本番検証が見つけた 2 件：読めない帯が場所を取っていた／1 行の半分だけが英語のまま
 * ----------------------------------------------------------------------------
 *  #R416 の本番検証（2026-08-24）で、依頼の症状が**別の経路でもう一度**出ていた。
 *
 *  ① **帯が地図の被せものの下に入る。** 右上の Map/Satellite ＋ Flat/Globe/3D の卓の下に
 *     レイキャビクの帯が潜り、角丸の箱の切れ端だけが読者に届いた——#R416 が直した「空の
 *     `text-field`」とは別の原因で、**絵は同じ**である。
 *     ⚠⚠ しかも**読めない帯が場所を確保していた**。`declutterNewsBands` は他の帯としか
 *     ぶつからないので、卓の下の帯が勝ち、読めたはずの帯がそれに負ける。⇒ 被せものを
 *     ブラウザ自身に訊く（`elementFromPoint`）。**一覧は持たない**——手書きの一覧が
 *     欠陥そのものだったのが #R399 である。
 *
 *  ② **言語を切り替えると、カテゴリ chip だけが 5.9〜6.7 秒 英語のまま残る**（本番実測 3 回）。
 *     `setLang()` は `intmap-lang` を投げるのに `js/news-events.js` が聞いていなかった。
 *     chip の語は**描画時**に評価されるので、次の描画（＝`news_events` の再取得のあと）まで
 *     前の言語が残る。#R416 が scope とカテゴリを**同じ 1 行**に並べたので、その 6 秒は
 *     「すべて / ★ 保存済み / All topics / World …」という半分英語の行になる。
 *     ⚠ **再描画ではなく貼り替え**である。`renderChips()` は件数を `HOST.globalData` から
 *     読むが、言語切替はそれを空にした直後なので、ここで再描画すると「全カテゴリ 0」だけの
 *     行になる（0 件のカテゴリは出さない規則）——翻訳する代わりに**行を消してしまう**。
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, root), 'utf8');

const typo = rd('js/map-typography.js');
const events = rd('js/news-events.js');
const body = rd('js/app-body.js');

/* ── ① 読めない帯は場所を取らない ───────────────────────────────────────── */
test('R428 ① a band that the chrome covers neither shows nor claims space', () => {
  assert.match(typo, /const covered = \(r\) => \{/, 'the declutter must have an occlusion test');
  assert.match(typo, /document\.elementFromPoint\(/,
    'it must ask the browser what is on top, not consult a list of panel ids');
  /* ⚠ 判定は**場所を取る前**に入っていること。あとから隠すだけでは、読めたはずの帯が
     すでに負けている（これがこのラウンドの欠陥そのもの）。 */
  assert.match(typo, /if \(!hit\(r\) && !covered\(r\)\) \{ claimed\.push\(r\); win\.add\(it\.fid\); \}/,
    'the occlusion test must gate the claim, not just the display');
  /* 手書きの被せもの一覧を作らないこと。 */
  assert.ok(!/getElementById\('(map-controls|layers-panel|basemap)/.test(typo),
    'the occluders must not be named one by one');
});

/* ── ② 言語を変えたら、その行は全部その言語になる ───────────────────────── */
test('R428 ② the category chips relabel on the language event, without re-rendering', () => {
  assert.match(body, /window\.dispatchEvent\(new Event\('intmap-lang'\)\)/,
    'the app still announces a language change');
  assert.match(events, /addEventListener\('intmap-lang', relabelChips\)/,
    'the chips must listen to it — they were the one control on the row that did not');
  const fn = events.match(/function relabelChips\(\)[\s\S]*?\n  \}/);
  assert.ok(fn, 'relabelChips must be findable');
  /* ⚠ 貼り替えであって再描画ではない。`renderChips()` を呼ぶと件数が 0 になり行が消える。 */
  assert.ok(!/renderChips\(\)/.test(fn[0]),
    'relabelChips must not re-render: the counts come from globalData, which the switch just emptied');
  assert.match(fn[0], /querySelectorAll\('\.news-cat-chip'\)/, 'it rewrites the chips in place');
  assert.match(fn[0], /if \(n\) b\.appendChild\(n\)/, 'and it puts the count node back');
});
