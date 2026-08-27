/* ============================================================================
 *  R483 — カスタムの選択肢を縮める / お気に入りを棚にする / 送信メッセージをガラスにする
 * ----------------------------------------------------------------------------
 *  3つの依頼はどれも「見た目」に見えるが、壊れ方はどれも見た目では出ない。
 *
 *  ⚠⚠⚠ ① **共有された寸法を、片方の都合で縮めてはならない。**
 *    `.lst-sw`（42×26・20px のつまみ・16px の移動）は `js/map-ui.js` 自身のコメントが
 *    「ウィジェット群の `.wgt-sw` と**同じ1つの物**」と宣言しているスイッチである。
 *    「基本表示のカスタムの行を縮めて」に対して base の `.lst-sw` を縮めれば、依頼と無関係な
 *    ウィジェット側のスイッチが**黙って一緒に縮む**。だから縮むのは `.lst-basic` に限る。
 *
 *  ⚠⚠⚠ ② **同じレイヤーのタイルが2枚になった瞬間、「枚数で建て直しを決める門」が壊れる。**
 *    #R469 が書き残したとおり、`open()` / `mountInto()` は
 *    「描かれたタイル数 ≠ `rowsFromDropdown().length`」で全体を組み直す（#R72 の遅さの門）。
 *    お気に入りの棚は**同じレイヤーの2枚目**を作るので、その2枚目が数に入ると
 *    **両者は永久に一致せず、開くたびにパネル全体が建て直される**——見た目には何も起きない。
 *    だから4本の門はすべて `[data-fav="1"]` を引く。**4本のうち1本でも漏れたら同じ症状になる。**
 *
 *  ⚠⚠⚠ ③ **★を書き換える口は2つあり、片方だけが知らせれば片方の面が古いまま残る。**
 *    `js/map-ui.js` のタイルの★と `js/layer-favs.js` の classic 行の★は、どちらも
 *    `window.imLayerFavs` を直接触る。棚を建て直す合図（`intmap-layerfavs`）を撃つのが片方だけだと、
 *    もう片方から星を付けたときに棚が更新されない。
 *
 *  ⚠⚠⚠ ④ **白い文字は、下地が不透明でなくなった瞬間に読めなくなる。**
 *    吹き出しは `#fff` on `--atlas-grad`（実測 4.0:1）だった。ガラスにすると下地の実効輝度が上がり、
 *    白は消える。だから文字は `--text-main` へ移す。**同じ理由で、吹き出しの中で白を前提にしていた
 *    ファイルチップ（`rgba(255,255,255,0.16)` の地に `#fff`）も一緒に移さなければならない**——
 *    ここを忘れると「白地に白文字のチップ」だけが残る。
 *
 *  ⚠ **コメントは剥がして読む。** 上の説明はどれも、禁じている綴りそのものを含んでいる
 *    （`#fff`・`--atlas-grad`・`data-fav`・`.lst-sw`）。#R345 の `codeOnly` を通さない検査は、
 *    よく説明されたファイルほど大きな声で嘘をつく。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => codeOnly(read(p));

/** every CSS declaration block this source spells for `sel`, comments already stripped */
function rulesFor(src, sel) {
  const out = [];
  const needle = sel + '{';
  let i = 0;
  while ((i = src.indexOf(needle, i)) >= 0) {
    const end = src.indexOf('}', i);
    if (end < 0) break;
    out.push(src.slice(i + needle.length, end));
    i = end;
  }
  return out;
}
const px = (decls, prop) => {
  const m = new RegExp('(?:^|;)' + prop + ':([0-9.]+)px').exec(decls);
  return m ? parseFloat(m[1]) : null;
};

/* ═══ ① 縮むのは「カスタムの選択肢」だけ ══════════════════════════════════════════════ */
test('R483 ① カスタムの11行は縦に縮み、共有スイッチの寸法は1バイトも動かない', () => {
  const ui = code('js/map-ui.js');

  /* 一般の行の寸法（3択のモード行とツール行が今も使う） */
  const rowRules = rulesFor(ui, '#layer-sidebar-r .lst-tile.lst-row,.lsr-mount .lst-tile.lst-row');
  assert.equal(rowRules.length, 1, 'the generic row keeps exactly one geometry rule');
  const rowH = px(rowRules[0], 'min-height');
  assert.equal(rowH, 46, 'the generic row is untouched at 46px — only the sub-options shrink');

  /* カスタムの選択肢の寸法 */
  const basicRules = rulesFor(ui, '#layer-sidebar-r .lst-tile.lst-row.lst-basic,.lsr-mount .lst-tile.lst-row.lst-basic');
  assert.equal(basicRules.length, 1, 'the 基本表示 sub-options carry their own geometry rule');
  const basicH = px(basicRules[0], 'min-height');
  assert.ok(basicH !== null && basicH < rowH, `the sub-option row (${basicH}px) is shorter than the generic row (${rowH}px)`);
  const genPad = /(?:^|;)padding:([0-9]+)px/.exec(rowRules[0]);
  const basPad = /(?:^|;)padding:([0-9]+)px/.exec(basicRules[0]);
  assert.ok(genPad && basPad && Number(basPad[1]) < Number(genPad[1]), 'and its vertical padding is tighter too');

  /* ⚠ 行間は grid の `gap` なので子ごとに変えられない。隣り合う選択肢の間だけを詰める規則が要る。 */
  assert.match(ui, /\.lst-tile\.lst-basic\+\.lst-tile\.lst-basic[^}]*margin-top:-/,
    'consecutive sub-options pull together — the flex gap alone cannot differ per child');

  /* ⚠⚠ 共有スイッチ: base の寸法は動いていない（`.wgt-sw` と同一の物であるという宣言） */
  const swRules = rulesFor(ui, '#layer-sidebar-r .lst-sw,.lsr-mount .lst-sw');
  assert.equal(swRules.length, 1, 'one base switch rule');
  assert.equal(px(swRules[0], 'width'), 42, 'the shared switch is still 42px wide');
  assert.equal(px(swRules[0], 'height'), 26, 'and 26px tall');
  const knob = rulesFor(ui, '#layer-sidebar-r .lst-sw i,.lsr-mount .lst-sw i');
  assert.equal(px(knob[0], 'width'), 20, 'the shared knob is still 20px');
  assert.match(ui, /#layer-sidebar-r \.lst-tile\.on \.lst-sw i,\.lsr-mount \.lst-tile\.on \.lst-sw i\{transform:translateX\(16px\)/,
    'and its throw is still 16px');

  /* 縮んだスイッチは、同じ 3px の余白を保った小さい実例であること（34-3-15-3 = 13） */
  const bSw = rulesFor(ui, '#layer-sidebar-r .lst-tile.lst-row.lst-basic .lst-sw,.lsr-mount .lst-tile.lst-row.lst-basic .lst-sw');
  const bKnob = rulesFor(ui, '#layer-sidebar-r .lst-tile.lst-row.lst-basic .lst-sw i,.lsr-mount .lst-tile.lst-row.lst-basic .lst-sw i');
  assert.equal(bSw.length, 1); assert.equal(bKnob.length, 1);
  const w = px(bSw[0], 'width'), h = px(bSw[0], 'height'), kw = px(bKnob[0], 'width');
  const thr = /\.lst-basic\.on \.lst-sw i[^}]*translateX\((\d+)px\)/.exec(ui);
  assert.ok(thr, 'the smaller switch declares its own throw');
  assert.equal(w - kw - 2 * 3, Number(thr[1]), 'the knob lands 3px from the far edge, as it does at full size');
  assert.equal(h, kw + 2 * 3, 'and sits 3px from top and bottom');
  assert.ok(w < 42 && h < 26, 'and it really is the smaller instance');
});

/* ═══ ② お気に入りは「ほかと同じ棚」で、しかも枚数の門には数えられない ══════════════════ */
test('R483 ② お気に入りの棚は基本表示の直後に建ち、名前は既訳キーから来る', () => {
  const ui = code('js/map-ui.js');

  assert.match(ui, /className='lst-grid lst-favgrid'/, 'the favourites grid exists and is a .lst-grid like every other category');
  assert.match(ui, /className='lst-sech'\+\(closed\?' closed':''\)/, 'and it is introduced by the same section header shape');

  /* 「基本表示のあと」— 位置ではなく、3択の行を持つグリッドを目印にして挿す */
  assert.match(ui, /querySelectorAll\('\.lst-grid'\)\)\.find\(x=>x\.querySelector\('\.lst-mode'\)\)/,
    'the insertion point is FOUND (the grid holding the three mode rows), not assumed to be index 0');
  assert.match(ui, /insertAdjacentElement\('afterend'/, 'and the favourites grid goes after it');

  /* ⚠ 名前は新しいリテラルではなく、9言語すべてに既にあるキーから引く */
  assert.match(ui, /keyed\(HOST\.lang\)\['favLayers'\]/, 'the label reads the existing favLayers key');
  const locales = fs.readdirSync(path.join(ROOT, 'js/locales')).filter(f => /^ui\..*\.js$/.test(f));
  assert.ok(locales.length >= 9, `all nine locale files are present (found ${locales.length})`);
  for (const f of locales) {
    assert.match(read('js/locales/' + f), /["']?favLayers["']?\s*:/, `${f} already carries favLayers — no new string to translate`);
  }
});

test('R483 ② 複製されたタイルは、建て直しを決める4本の門のどれにも数えられない', () => {
  const ui = code('js/map-ui.js');
  const gates = ui.match(/\.lst-tile\[data-lid\][^']*/g) || [];
  assert.equal(gates.length, 4, 'the four rebuild guards #R469 named are still four');
  for (const g of gates) {
    assert.match(g, /:not\(\[data-fav="1"\]\)/,
      'every one of them subtracts the favourites copies — one that does not rebuilds the whole panel on every open');
  }
  assert.match(ui, /t2\.dataset\.fav='1'/, 'and the copies are what carry that mark');
});

test('R483 ② 同じレイヤーの2枚のタイルは、両方が地図の状態に追従する', () => {
  const ui = code('js/map-ui.js');
  /* ⚠ 単数形の querySelector は最初の1枚しか触らない＝2枚目が古いまま残る */
  assert.doesNotMatch(ui, /const tile=h\.querySelector\(sel\)/,
    'the live-sync listener no longer stops at the first matching tile');
  assert.match(ui, /h\.querySelectorAll\(sel\)\.forEach\(tile=>tile\.classList\.toggle\('on'/,
    'it toggles every tile standing for that checkbox');
});

/* ═══ ③ ★を書き換える口が2つある以上、合図も2つ要る ═══════════════════════════════════ */
test('R483 ③ タイルの★と classic 行の★は、どちらも棚に「動いた」と知らせる', () => {
  for (const f of ['js/map-ui.js', 'js/layer-favs.js']) {
    assert.match(code(f), /dispatchEvent\(new Event\('intmap-layerfavs'\)\)/,
      `${f} announces a change to window.imLayerFavs`);
  }
  assert.match(code('js/map-ui.js'), /addEventListener\('intmap-layerfavs'/,
    'and the tile browser listens for it');
  /* ⚠ 依存の向きは片方向: layer-favs.js は map-ui.js を import しない */
  assert.doesNotMatch(code('js/layer-favs.js'), /map-ui/, 'layer-favs.js does not learn about the tile browser');
});

/* ═══ ④ 吹き出しはガラスになり、白い文字はどこにも残っていない ═════════════════════════ */
test('R483 ④ ユーザー吹き出しは半透明・縁あり・blur ありで、文字はテーマ色', () => {
  const a = code('js/atlas-styles.js');
  const bubble = rulesFor(a, '#atlas-panel .atl-b.u');
  assert.equal(bubble.length, 1, 'one rule paints the user bubble');
  const b = bubble[0];

  assert.match(b, /background:var\(--atlas-glass\)/, 'it is filled with the frosted-glass token');
  assert.doesNotMatch(b, /--atlas-grad/, 'and no longer with the opaque gradient the Atlas tab shares');
  assert.match(b, /color:var\(--text-main\)/, 'the text is the theme colour');
  assert.doesNotMatch(b, /color:#fff/, 'white text cannot survive a translucent fill');
  assert.match(b, /border:1px solid var\(--atlas-glass-edge\)/, 'a hairline edge — half of what reads as glass');
  assert.match(b, /inset 0 1px 0 var\(--atlas-glass-sheen\)/, 'and the inset sheen — the other half');
  assert.match(b, /(?:^|;)backdrop-filter:saturate\(var\(--glass-sat/, 'it blurs through the app-wide glass tokens');
  assert.match(b, /-webkit-backdrop-filter:saturate\(var\(--glass-sat/, 'with the -webkit- twin every real blur in this app carries');

  /* ⚠ Atlas タブの塗りは分けたまま——依頼は吹き出しについてのものだった */
  const cssSrc = codeOnly(read('css/intmap.css'));
  assert.match(cssSrc, /--atlas-grad:linear-gradient/, 'the tab keeps its own opaque token');
});

test('R483 ④ ガラスのトークンは light と dark の両方で定義されている', () => {
  const css = codeOnly(read('css/intmap.css'));
  const root = /:root\{([\s\S]*?)\n\s*\}/.exec(css);
  assert.ok(root, 'the light :root block parses');
  const dark = /\[data-theme="dark"\]\{([\s\S]*?)\n\s*\}/.exec(css);
  assert.ok(dark, 'the dark block parses');
  for (const tok of ['--atlas-glass', '--atlas-glass-edge', '--atlas-glass-sheen', '--atlas-glass-shadow']) {
    assert.ok(root[1].includes(tok + ':'), `${tok} has a light value`);
    /* ⚠ 片方だけだと、そのテーマで var() が空になり、縁も影も黙って消える */
    assert.ok(dark[1].includes(tok + ':'), `${tok} has a dark value too — a token defined once is a surface that breaks in one theme`);
  }
});

test('R483 ④ 吹き出しの中で白を前提にしていたものが、白のまま取り残されていない', () => {
  const a = code('js/atlas-styles.js');

  /* 画像行: 塗りを剥がすなら、縁と blur も剥がす（さもなくば写真の周りにガラス板が残る） */
  const img = rulesFor(a, '#atlas-panel .atl-b.u.atl-imgrow');
  assert.equal(img.length, 1);
  assert.match(img[0], /border:none/, 'the picture row drops the glass edge');
  assert.match(img[0], /(?:^|;)backdrop-filter:none/, 'and the blur');
  assert.match(img[0], /-webkit-backdrop-filter:none/, 'in both spellings');

  /* ファイルチップ: 白地に白文字が残っていないこと */
  const chip = rulesFor(a, '#atlas-panel .atl-b.u .atl-fchip.atl-fchip-msg');
  assert.equal(chip.length, 1, 'the in-bubble file chip still has exactly one rule');
  assert.doesNotMatch(chip[0], /color:#fff/, 'its label is no longer white');
  assert.doesNotMatch(chip[0], /background:rgba\(255,255,255/, 'and its fill is no longer a white wash');
  assert.match(chip[0], /color:var\(--text-main\)/, 'it reads the theme colour, like the bubble around it');
});
