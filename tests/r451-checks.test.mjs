/* ============================================================================
 *  #R451 — 読む面から Atlas へ行く道と、その道が運ぶもの
 * ----------------------------------------------------------------------------
 *  #R430 は「いま読んでいる出来事」を Atlas へ渡す橋を架けた——書き手（js/news-events.js）、
 *  読み手（js/atlas-console.js `_selectionState()`）、文（js/atlas-state.js の
 *  `OPEN NEWS ARTICLE` ブロック）の 3 つが揃っている。**通常のサイドバーでは、その橋を渡る
 *  人間の操作が 1 つも無かった。**
 *
 *    ① `enterReaderPane()` は `.control-panel` を伏せる。つまり読んでいる間、
 *       News / Companies / Countries / **Atlas** のタブ列は 0×0 になる
 *       （実測 本番 build R441・800×450 / 1280×720 / 1920×1080 / 375×812 の全部で
 *        `btn-community` の height=0）。残る操作は「‹ 戻る」だけ。
 *    ② 唯一の到達手段である `IntMapConsole.open()` は、通常モードでは `#btn-community` を
 *       押す＝`setMode()` を通る。`setMode()` は読む面を離れ、`closeReaderPane()` は
 *       `window._imReader=null` を書く。⇒ **Atlas へ行こうとすると、必ず文脈が消える。**
 *       実測（ローカル build・1280×800）: 詳細を開く→`_imReader` に title と body 235 字。
 *       Atlas を開く→`_imReader===null`、`IntMapConsole.state()` に `OPEN NEWS ARTICLE` 行なし。
 *    ③ 橋が渡っていたのは **workspace mode だけ**だった（Atlas が別ウィンドウなので
 *       `IntMapConsole.open()` が早期 return し、`setMode()` を通らない）。実測: ws では
 *       同じ操作で `OPEN NEWS ARTICLE` 行が出る。
 *
 *  ⚠⚠⚠ **「実装済みの橋がある」は「渡れる」ではない。** #R430 は書き手が居ないことを直したが、
 *    渡る道が無いことは測っていない——検査が読み手と書き手を別々に確かめ、**その 2 つを繋ぐ
 *    利用者の操作**を一度も走らせなかったからである。だから ④ はこのファイルの中で
 *    `setMode`→`closeReaderPane` を**実際に実行する**。
 *
 *  画面の側（ボタンが在って押せて視野に入る）は tests/r451.spec.js が本物のブラウザで測る。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));
/* ⚠ (#R345 の形・15 回目) この検査は自分の説明文も、製品側の注記も読んではならない——上の見出しは
   `window._imReader=null` も `OPEN NEWS ARTICLE` もそのまま書いているし、js/app-body.js の注記は
   運ぶ側と捨てる側の両方の綴りを持っている。CSS の注釈は 1 形なのでこの 1 行で剥がす。 */
const CSS = () => R('css/intmap.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** Lift a top-level `function name(...){…}` out of a file whose comments are already stripped. */
function lift(code, sig, where) {
  const i = code.indexOf(sig);
  assert.ok(i >= 0, `${sig} is gone from ${where}`);
  let depth = 0;
  for (let k = code.indexOf('{', i); k < code.length; k++) {
    if (code[k] === '{') depth++;
    else if (code[k] === '}' && !--depth) return code.slice(i, k + 1);
  }
  assert.fail(`${sig} never closes in ${where}`);
}

/* ── ① 読む面には Atlas への道がある——3 つの面すべてに、1 か所から ────────────────
   ⚠ **面ごとに書き写させない。** #R435 は帯の *綴り* を 1 組にしたが、*markup* は 3 か所に
     残ったままだった。#R443 の教訓（同じ語彙を面ごとに写すと直るのは片方だけ）がそのまま
     当てはまる——だから帯は関数になり、ここはその関数が Atlas の道を持つことを要求する。 */
test('R451 ① the reading surface bar is built in one place, and it carries the route to Atlas', () => {
  const reader = CODE('js/article-reader.js');
  const bar = lift(reader, 'function readerBar(o)', 'js/article-reader.js');
  assert.ok(/class="nrp-back"/.test(bar), 'the shared bar no longer draws the back button');
  assert.ok(/class="nrp-atlas"/.test(bar), 'the shared bar no longer draws the route to Atlas');

  /* 帯を書き出すのは 1 ファイルだけ。他は呼ぶ。 */
  const emitters = ['js/article-reader.js', 'js/news-ui.js', 'js/news-events.js']
    .filter((f) => /class="nrp-bar"/.test(CODE(f)));
  assert.deepEqual(emitters, ['js/article-reader.js'],
    'the reading surface bar is being written out somewhere else again — a route added here would be missing there');
  for (const f of ['js/news-ui.js', 'js/news-events.js']) {
    assert.ok(/HOST\.readerBar\(/.test(CODE(f)), `${f} no longer asks for the shared reading surface bar`);
  }
});

/* ── ② その道は、押せる見た目を持ち、押されたら Atlas を開く ─────────────────────
   ⚠ **当たらない CSS は綴りとしては健在である**（#R435 ①）。`.nrp-atlas` は要素の唯一の
     クラスなので、規則が 1 つも無ければ OS 既定の <button> で出荷される。
   ⚠ **`IntMapAtlas` が先で、`IntMapConsole` が後**。カーネルは遅延読み込み（js/atlas-loader.js）
     で、実測 375×812 の初回では `window.IntMapConsole` が undefined・`window.IntMapAtlas` は在る。
     順序を逆にすると「デスクトップでは通り、電話では落ちる道」になる。 */
test('R451 ② the Atlas route is styled, and reaches Atlas through the lazy kernel first', () => {
  const css = CSS();
  assert.ok(/\.nrp-atlas(?![\w-])/.test(css), '.nrp-atlas has no rule at all — it would ship as a bare <button>');
  /* 帯の反対端に置く（`margin-left:auto`）——戻ると並べると、どちらが「出口」か読めない。 */
  const rule = css.split('\n').find((l) => /^\s*\.nrp-atlas\s*\{/.test(l));
  assert.ok(rule && /margin-left:auto/.test(rule), '.nrp-atlas no longer sits at the trailing edge of the bar');

  const reader = CODE('js/article-reader.js');
  const go = lift(reader, 'function askAtlasAboutReading()', 'js/article-reader.js');
  const iAtlas = go.indexOf('IntMapAtlas');
  const iConsole = go.indexOf('IntMapConsole');
  assert.ok(iAtlas >= 0, 'the route no longer goes through the lazy Atlas kernel');
  assert.ok(iConsole < 0 || iAtlas < iConsole,
    'the route reaches for IntMapConsole before IntMapAtlas — that is undefined on a phone until the kernel lands');

  /* 押した先は「入口」であって、面の中で押し直させない。入口は pane に委譲で 1 本だけ張る。 */
  const enter = lift(reader, 'function enterReaderPane()', 'js/article-reader.js');
  assert.ok(/addEventListener\('click'/.test(enter) && /nrp-atlas/.test(enter),
    'the Atlas route is no longer wired from the one entrance — every surface replaces the pane HTML after entering');
  assert.ok(/dataset\.atlasRoute/.test(enter), 'the delegated listener is no longer guarded — re-entering would stack handlers');
});

/* ── ③ 面を離れることと、Atlas の主題を捨てることは、別の 2 つである ───────────────
   ⚠⚠⚠ **これが欠陥の根である。** 通常モードで Atlas へ行く道はすべて `setMode()` を通り、
     `setMode()` は読む面を離れる。離れることが主題を捨てることと同じ 1 行だったので、
     **「いま読んでいるものについて Atlas に訊く」という操作そのものが、訊く対象を消していた。** */
test('R451 ③ leaving the reading surface and dropping Atlas’s subject are separate decisions', () => {
  const app = CODE('js/app-body.js');
  const close = lift(app, 'function closeReaderPane(quiet,carryArticle)', 'js/app-body.js');
  assert.ok(/carryArticle===true/.test(close), 'closeReaderPane() no longer distinguishes a hand-off from a dismissal');
  assert.ok(/window\._imReader=null/.test(close), 'closeReaderPane() no longer clears the bridge when the reader really left');
  assert.ok(/onScreen=false/.test(close), 'a carried article is no longer marked as off screen — Atlas would claim it is being read');

  /* 運ぶのは「Atlas へ **入る**」ときだけ。Atlas に居るときに Atlas タブを押すのは離脱であって、
     そこでは主題を捨てる。⇒ `mode==='atlas'` だけでは足りず、`currentMode` を見る。 */
  const setMode = lift(app, 'function setMode(mode,btnId)', 'js/app-body.js');
  const call = /closeReaderPane\(true\s*,([^)]*)\)/.exec(setMode);
  assert.ok(call, 'setMode() no longer tells the exit whether this gesture is a hand-off to Atlas');
  assert.ok(/mode===['"]atlas['"]/.test(call[1]), 'setMode() carries the article for gestures that are not Atlas');
  assert.ok(/currentMode!==mode/.test(call[1]),
    'setMode() carries the article when DESELECTING Atlas too — the subject would outlive the conversation');

  /* 運ぶ判断を持つ呼び出し元は 1 つだけ。ここが増えると寿命の規則が読めなくなる。 */
  const carriers = app.split('\n').filter((l) => /closeReaderPane\(\s*true\s*,/.test(l));
  assert.equal(carriers.length, 1, 'more than one caller now decides to carry the article — the lifetime rule is no longer readable');
});

/* ── ④ そして実際に走らせる: 詳細 → Atlas は主題を運び、次の操作が捨てる ────────────
   ⚠⚠⚠ **綴りでは足りない。** #R430 の検査は読み手と書き手を別々に確かめて緑だったが、
     その 2 つを繋ぐ操作を 1 度も走らせなかったので、橋に道が無いことに 15 ラウンド気付かなかった。
     ここは `setMode` と `closeReaderPane` を**本物として実行**し、`window._imReader` の寿命を測る。 */
test('R451 ④ run it: opening Atlas carries the article, and the next gesture drops it', () => {
  const app = CODE('js/app-body.js');
  const close = lift(app, 'function closeReaderPane(quiet,carryArticle)', 'js/app-body.js');
  const setMode = lift(app, 'function setMode(mode,btnId)', 'js/app-body.js');

  /* 2 つの関数だけを、最小限の DOM とともに動かす。renderUI / countryDataLoaded などは無害な stub。 */
  const harness = `
    let currentMode='news', readerOpen=true, readerCurrent={};
    let rendered=0; const renderUI=()=>{ rendered++; };
    const loadCountryData=()=>{}; let countryDataLoaded=true;
    ${close}
    ${setMode}
    return { setMode, closeReaderPane, mode:()=>currentMode, renders:()=>rendered };`;
  const doc = {
    body: { classList: { remove(){}, add(){} } },
    getElementById: () => ({ style: {}, classList: { add(){}, remove(){} } }),
    querySelector: () => ({ style: {} }),
    querySelectorAll: () => [],
  };
  const win = {};
  const api = new Function('window', 'document', harness)(win, doc);

  const article = () => ({ open: true, title: 'r451 subject', body: 'body text' });

  /* 詳細を開いている → Atlas へ: 主題は生きていて、画面には無いと名乗る。 */
  win._imReader = article();
  api.setMode('atlas', 'btn-community');
  assert.ok(win._imReader, 'opening Atlas still erases the article the reader was on');
  assert.equal(win._imReader.onScreen, false, 'a carried article is not marked as off screen');
  assert.equal(api.mode(), 'atlas');

  /* Atlas から他のタブへ: 会話が終わったので主題も終わる。 */
  api.setMode('stats', 'btn-stats');
  assert.equal(win._imReader, null, 'the carried article outlived the Atlas conversation');

  /* Atlas に居るまま Atlas タブを押す（＝解除）のも離脱である。 */
  win._imReader = article();
  api.setMode('atlas', 'btn-community');          /* stats → atlas : 運ぶ */
  assert.equal(win._imReader.onScreen, false);
  api.setMode('atlas', 'btn-community');          /* atlas → 解除 : 捨てる */
  assert.equal(win._imReader, null, 'deselecting Atlas kept the subject alive');

  /* 戻るボタン（引数なし）は今までどおり捨てる。 */
  win._imReader = article();
  api.closeReaderPane();
  assert.equal(win._imReader, null, 'the back button no longer clears the bridge');
});

/* ── ⑤ Atlas は運ばれた記事を「読んでいる」とは言わない ────────────────────────────
   ⚠ #R340 の produces-observed。workspace mode では記事窓と Atlas 窓が同時に在るので
     「いま読んでいる」は本当だが、通常のサイドバーでは Atlas が読む面を**置き換える**ので、
     同じ文はモデルに観測されていないことを言わせることになる。2 つの事実、2 つの文。 */
test('R451 ⑤ Atlas words a carried article differently from one that is on screen', () => {
  const state = CODE('js/atlas-state.js');
  assert.ok(/ar\.onScreen === false/.test(state), 'js/atlas-state.js no longer distinguishes a carried article');
  assert.ok(/OPEN NEWS ARTICLE \(the user is reading this right now\)/.test(state),
    'the on-screen sentence is gone — workspace mode really is reading it');
  assert.ok(/BROUGHT TO ATLAS/.test(state), 'the carried-article sentence is gone');

  /* 読み手が旗を運ばなければ、文は決して切り替わらない。 */
  const consoleSrc = CODE('js/atlas-console.js');
  const sel = lift(consoleSrc, 'function _selectionState()', 'js/atlas-console.js');
  assert.ok(/onScreen:rd\.onScreen!==false/.test(sel),
    '_selectionState() no longer reports whether the article is still on screen');

  /* 両方の文が同じ代名詞を束ねる——運ばれた記事でも「この記事 / この出来事 / それ」は効く。 */
  const block = state.slice(state.indexOf('BROUGHT TO ATLAS'), state.indexOf('BROUGHT TO ATLAS') + 1800);
  assert.ok(/この記事/.test(block) && /この出来事/.test(block),
    'the pronoun mapping is no longer shared by both sentences');
});
