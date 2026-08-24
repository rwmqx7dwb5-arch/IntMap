/* ============================================================================
 *  R416 — 地図に「出来事」が出ていなかった。出ていたのは、中身の無い白い箱だった
 * ----------------------------------------------------------------------------
 *  #R386 以来、ニュースの地物は **1 Event = 1 地物**である（`globalData` が Event の項目に
 *  差し替わり、ピンを組む loop はその上を歩く）。にもかかわらず地物は**そうだと言って
 *  いなかった**——代表記事の見出しとリンクだけを積んでいたので、
 *
 *    · 帯（`news-labels`）が読む欄は `js/news-events.js` が `short: ''` で固定していた。
 *      その層は `icon-text-fit:'both'` なので、**合わせる文字が無いとピルの画像が素の
 *      大きさのまま描かれる**——実測 2026-08-24: 画面に出た帯 **46/46 が空**。利用者の
 *      報告「帯が見えない」は、消えていたのではなく**中身が無かった**である。
 *    · ピンを押すと Event 詳細ではなく**代表記事の外部サイト**が開いた。地図は
 *      出来事を一度も開いていない（`openDetail` の呼び出し元はカードの `.ev-sources` 1 つだけ）。
 *
 *  ⚠⚠⚠ **同じ loop が 2 つあった。** `js/news-feed.js`（生きている経路）と
 *    `js/news-ui.js` の `aiRefreshNewsPins()` が、9 つの property を 1 バイト違わず組んでいた。
 *    **だから欠けている身元も 2 か所で欠けていた。** ① はその写しが戻らないことを見張る。
 *
 *  ⚠⚠⚠ **`Subject location / Publisher` トグルは撤去した**（利用者の指示・2026-08-24）。
 *    Event は `pubLoc` を構造上必ず `null` にするので、既定の面でこれを押すと
 *    **200/200 の出来事が `hashLocFromString()` の擬似座標へ散った**（実測: NPR が
 *    東経 144.9/南緯 2.0＝パプアニューギニア沖、AP News が東経 163.8/北緯 23.4＝太平洋）。
 *    実在の場所を捏造した座標に置き換えるだけの操作は、モードではない。
 *
 *  ⚠ **この検査は自分の散文に当たってはならない。** 上の段落は `newsPinMode` や
 *    `pinmode-pub` という綴りを含む——[[intmap-recurring-lessons]] の「検査が自分の説明文に
 *    はいと答える」形である。だから④は**コード形の needle** だけを使う
 *    （`getElementById('pinmode-…')` / `newsPinMode=` / `id="pinmode-`）。
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, root), 'utf8');

const feed = rd('js/news-feed.js');
const ui = rd('js/news-ui.js');
const events = rd('js/news-events.js');
const typo = rd('js/map-typography.js');
const ctx = rd('js/news-context.js');
const body = rd('js/app-body.js');
const html = rd('index.html');
const css = rd('css/intmap.css');

/* ── ① ピンを組む場所は 1 つ ─────────────────────────────────────────────
   写しが 2 つあると、片方だけが古くなる。実際にそうなった（両方から Event の身元が
   欠けていた）。⚠ 数えるのは「地物リテラルを組んでいる場所」であって関数名ではない。 */
test('R416 ① the news pin is built in exactly one place', () => {
  const jsDir = new URL('js/', root);
  const hits = [];
  for (const f of fs.readdirSync(jsDir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(new URL(f, jsDir), 'utf8');
    /* 地物リテラル ＝ `type:'Feature'` と `news-points` 用の `mapped:` を同じ式で持つもの */
    const re = /type:\s*'Feature'[^;]{0,400}?mapped:/g;
    let m;
    while ((m = re.exec(src))) hits.push(f);
  }
  assert.deepEqual(hits, ['news-feed.js'],
    `the news-pin feature literal must exist only in js/news-feed.js (newsFeatureOf); found in ${hits.join(', ')}`);
  assert.match(feed, /function newsFeatureOf\(/, 'newsFeatureOf must be the builder');
  /* (#R430) this clause used to read `assert.match(ui, /HOST\.newsFeatureOf\(item\)/)` — i.e. it
     named aiRefreshNewsPins() in js/news-ui.js as a caller of the shared builder. That function
     existed only to repaint pins WHILE the client-side AI locator ran, and both went out with it
     (CONSTITUTION §5: the browser never calls the AI to place a headline). js/news-ui.js now
     builds no pins at all, which satisfies #R416's "exactly one place" contract more strictly
     than calling the shared builder did — so the clause is re-aimed rather than dropped. */
  assert.ok(!/newsFeatures\.push\(/.test(ui),
    'js/news-ui.js must not build news pins — the one builder is newsFeatureOf() in js/news-feed.js');
});

/* ── ② 帯の文字の規則は 1 本で、両方の経路が同じものを呼ぶ ───────────────── */
test('R416 ② one band-text rule, and both news paths call it', () => {
  assert.match(typo, /function bandText\(/, 'js/map-typography.js owns the band text rule');
  assert.match(typo, /bandBox,\s*bandText,/, 'bandText must be exported beside bandBox');
  assert.match(ctx, /IntMapMapTypography\.bandText\(/,
    'analyzeContext (article path) must read the shared rule');
  assert.match(feed, /IntMapMapTypography\.bandText\(item\.title\)/,
    'the pin builder (event path) must read the shared rule');
  /* ⚠ 中身の無い帯を二度と作らない。`short` を空文字で固定する行が戻ったら赤。 */
  assert.ok(!/short:\s*''/.test(events),
    "js/news-events.js must not pin `short` to '' — that is what drew 46 empty white pills");
});

/* ── ③ ピンは自分が何の出来事かを言う ───────────────────────────────────── */
test('R416 ③ an event pin carries the event identity', () => {
  const m = feed.match(/function newsFeatureOf\([\s\S]*?\n  \}/);
  assert.ok(m, 'newsFeatureOf must be findable');
  const b = m[0];
  for (const k of ['ev:', 'evId:', 'evSources:', 'evArticles:', 'evCat:']) {
    assert.ok(b.includes(k), `newsFeatureOf must put ${k} on the feature`);
  }
  /* ⚠ 文字列であること。`false` は MapLibre の `match` で「欠けている」と区別できない。 */
  assert.match(b, /ev:\s*ev\s*\?\s*'1'\s*:\s*''/,
    "`ev` must be the string '1'/'' — a boolean is indistinguishable from a missing property in a style expression");
});

/* ── ④ ピンの行き先は出来事の詳細 ────────────────────────────────────────── */
test('R416 ④ clicking a news pin opens the event, not one outlet article', () => {
  assert.match(events, /function openByPublicId\(/, 'news-events must expose a lookup by public id');
  assert.match(events, /openDetail,\s*openByPublicId,/, 'openByPublicId must be exported');
  assert.match(ui, /function _openNewsFeature\(/, 'news-ui must have one opener');
  assert.match(ui, /NE\.openByPublicId\(p\.evId\)/, 'the opener must try the event first');
  /* 両方の層が同じ opener を通ること。片方だけだと「点は出来事へ、帯は記事へ」になる。 */
  const dots = ui.match(/onLayer\('click','news-dots'[\s\S]{0,400}?\}\);/);
  const labels = ui.match(/onLayer\('click','news-labels'[\s\S]{0,400}?\}\);/);
  assert.ok(dots && labels, 'both click handlers must be findable');
  assert.ok(dots[0].includes('_openNewsFeature('), 'the dot must go through the opener');
  assert.ok(labels[0].includes('_openNewsFeature('), 'the band must go through the opener');
  /* ⚠ タブはトグル。開いている News を setMode で叩くと、詳細を描く面ごと閉じる (#R402)。 */
  assert.match(ui, /HOST\.mode!=='news'&&HOST\.mode!=='saved'\s*\)\s*HOST\.setMode\('news'/,
    'the opener must only switch tabs when News is not already open');
});

/* ── ⑤ 発信元ピンのモードは残っていない ──────────────────────────────────
   ⚠ needle はコード形だけ。この節の散文にも `newsPinMode` と書いてあるので、
     語そのものを禁止すると自分の説明文で落ちる（[[intmap-recurring-lessons]]）。 */
test('R416 ⑤ the Subject/Publisher pin mode is gone, in code and in markup', () => {
  const codeNeedles = [
    /getElementById\('pinmode-/,
    /newsPinMode\s*=/,
    /newsPinMode\s*===/,
    /HOST\.newsPinMode/,
    /clickId\('pinmode-/,
    /cfg\.by\s*===\s*'publisher'/,
  ];
  const files = { 'js/app-body.js': body, 'js/news-ui.js': ui, 'js/atlas-console.js': rd('js/atlas-console.js'), 'js/widget-defs-map.js': rd('js/widget-defs-map.js') };
  for (const [name, src] of Object.entries(files)) {
    for (const re of codeNeedles) {
      assert.ok(!re.test(src), `${name} still wires the removed pin mode: ${re}`);
    }
  }
  assert.ok(!/id="pinmode-/.test(html), 'index.html must not carry the pin-mode buttons');
  assert.ok(!/news-pinmode-seg/.test(html), 'index.html must not carry the pin-mode segment');
});

/* ── ⑥ 上の行は 1 本で、「All」は 1 つの意味しか持たない ─────────────────── */
test('R416 ⑥ one control row, and no two chips called the same thing', () => {
  /* 走査は 1 行に畳んでから当てる——折り返した markup を行単位の needle は落とす (#R407)。 */
  const flat = html.replace(/\r?\n/g, ' ');
  const row = flat.match(/<div class="news-seg-row">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(row, '.news-seg-row must exist');
  assert.ok(/id="news-scope"/.test(row[1]), 'the scope pair lives in the row');
  assert.ok(/id="news-cat-chips"/.test(row[1]),
    'the category chips must share that row — they used to be a second row below it');
  /* カテゴリの先頭 chip は scope の「All」と同じ語であってはならない。 */
  assert.ok(!/ALL_TOPICS = \(\) => L\('All',/.test(events),
    "the category chip must not be called 'All' — the scope chip beside it already is");
  assert.match(events, /ALL_TOPICS = \(\) => L\('All topics',/, 'the category chip says what axis it is about');
  /* ⚠ (#R428) one spelling, two readers: the renderer and the relabeller must not drift apart. */
  assert.match(events, /mk\('all', ALL_TOPICS\(\)/, 'renderChips reads the shared spelling');
  assert.match(events, /\(key === 'all'\) \? ALL_TOPICS\(\) : catLabel\(key\)/, 'relabelChips reads the same one');
  /* 見た目でも 2 つの軸が区別できること（両方が同じ塗りだと 1 つの操作に見える）。 */
  assert.match(css, /\.news-scope-chip\.active\{[^}]*background:var\(--card-bg\)/,
    'the active scope chip must not use the same fill as an active category chip');
});
