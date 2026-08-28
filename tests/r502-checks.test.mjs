/* ============================================================================
 *  #R502 — 計測は同意も告知もなく動いていて、AI が書いた段落は AI と名乗っていなかった
 * ----------------------------------------------------------------------------
 *  ① GA (`G-57X5MX0ZPW`) と Microsoft Clarity (`x2colhytq7`) は、最初の 1 バイトの時点で
 *     起動していた。index.html:10 の静的な `<script async src=…googletagmanager…>` は
 *     パースされた瞬間にリクエストを出し、Clarity は #R193 の requestIdleCallback で少し遅れて
 *     入るだけで、どちらにも同意の門は無かった。
 *  ② そして **js/legal-text.js は、その 2 つをどこにも名指していなかった。** 9 言語の
 *     「4. 第三者 / Third parties」は Supabase から Open-Meteo まで数十社を列挙しているのに、
 *     実際に Cookie を置き DOM 再生を録っている 2 社だけが抜けていた。§5 Cookie は
 *     `Used for your session and preferences.` の 1 行で、分析についてひとことも言っていない。
 *     ⚠ **抜けていたのは実装ではなく、実装と文書の対応である。** だから直しかたも
 *     「タグを消す」ではない——**止めて、戻すときに名指しを強制する**。それが ⑤。
 *  ③ 別件だが同じ形。js/news-events.js の該当ブロックのコメントは
 *     「⚠⚠⚠ **AI が書いたことを隠さない**」と宣言していた。ところが画面に出る 9 言語の文字列は
 *     `IntMap combined what these outlets published` /「IntMap がまとめたものである」で、
 *     **`AI` という語が 1 言語にも入っていなかった。** サーバー側の取り込みが LLM に書かせて
 *     いる段落（`news_events.summary`）についての表示である以上、「隠すつもりが無い」ことは
 *     「隠れていない」ことの証拠にならない（[[intmap-r485-lessons]] と同じ形）。
 *
 *  ⚠ この検査は **綴りではなく経路**を見る。#R488 の教訓——「その綴りがファイルに在る」ことは
 *    「その規則が効いている」ことではない——なので、①②③ はどれも
 *    「フラグより後ろに在るか」「同じ 1 つのスイッチを見ているか」という**順序と結線**を訊く。
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const HTML = read('index.html');
const SWITCH = /window\.INTMAP_ANALYTICS\s*=\s*(true|false)\s*;/;

/* その行に並ぶシングルクォート文字列を順に取り出す（`L(…)` の位置引数を数えるため）。 */
function quoted(line) {
  return [...line.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
}

test('R502 ①: スイッチはちょうど 1 つ、真偽値リテラルで宣言されている', () => {
  const all = [...HTML.matchAll(/window\.INTMAP_ANALYTICS\s*=/g)];
  assert.equal(all.length, 1, `INTMAP_ANALYTICS への代入が ${all.length} 箇所ある——1 つでなければ「1 か所で戻せる」が嘘になる`);
  const m = HTML.match(SWITCH);
  assert.ok(m, 'INTMAP_ANALYTICS が `true` / `false` のリテラルで宣言されていない');
});

test('R502 ②: スイッチを通らずにタグを読み込む経路が 1 本も無い', () => {
  /* 静的な `<script src=…>` はパースされた時点で必ず飛ぶ——フラグでは止められない。
     ⚠ index.html だけを見ない。**配られる HTML はこれで全部**（実測: 計測タグを持つのは
     index.html だけだが、「今そうである」ことと「増えても捕まる」ことは別）。 */
  const PAGES = ['index.html', 'admin.html', 'privacy.html', 'terms.html', 'science.html', 'sources.html'];
  for (const page of PAGES) {
    const body = read(page);
    const statics = [...body.matchAll(/<script[^>]*\ssrc\s*=\s*["'][^"']*(googletagmanager|google-analytics|clarity\.ms)[^"']*["']/gi)];
    assert.equal(statics.length, 0,
      `${page} に静的な <script src> が ${statics.length} 本ある（${statics.map((s) => s[1]).join(', ')}）——フラグの手前で読み込まれてしまう`);
    if (page !== 'index.html') {
      /* 計測は index.html の 1 か所だけが持つ。増えたら、そのページにも門が要る。 */
      for (const id of ['G-57X5MX0ZPW', 'x2colhytq7']) {
        assert.ok(!body.includes(id), `${page} が «${id}» を持ち始めた——このページには門が無い`);
      }
    }
  }

  const iSwitch = HTML.search(SWITCH);
  const iGaGuard = HTML.indexOf('if(!window.INTMAP_ANALYTICS) return;');
  const iGaLoad = HTML.indexOf('googletagmanager.com/gtag/js?id=G-57X5MX0ZPW');
  const iClGuard = HTML.indexOf('if(!c.INTMAP_ANALYTICS) return;');
  const iClLoad = HTML.indexOf('clarity.ms/tag/');

  for (const [name, v] of [['switch', iSwitch], ['GA guard', iGaGuard], ['GA loader', iGaLoad], ['Clarity guard', iClGuard], ['Clarity tag', iClLoad]]) {
    assert.ok(v > 0, `${name} が index.html に無い`);
  }
  assert.ok(iSwitch < iGaGuard, 'GA の門がスイッチより前にある（宣言前に読まれる）');
  assert.ok(iGaGuard < iGaLoad, 'GA のローダが門の外にある');
  assert.ok(iSwitch < iClGuard, 'Clarity の門がスイッチより前にある');
  assert.ok(iClGuard < iClLoad, 'Clarity のタグ挿入が門の外にある');
});

test('R502 ③: 止めても、タグ本体と #R155/#R272 の防御は 1 つも消えていない', () => {
  /* 「一旦停止であって削除ではない」——戻す先が残っていることを、ここで固定する。 */
  /* ⚠ assert.match は失敗すると HTML 全体（85 KB）を吐いてログを埋める。ここは includes で訊く。 */
  const has = (needle, why) => assert.ok(HTML.includes(needle), why);
  has('G-57X5MX0ZPW', 'GA の measurement id が消えている');
  has('clarity.ms/tag/', 'Clarity のタグ本体が消えている');
  has('window.__imScrubAuthUrl=_scrub;', '#R155 の auth URL スクラブが消えている');
  /* ⚠ スクラブの定義は門の **外**（常に走る）。GA を止めても window.__imScrubAuthUrl は在る。 */
  assert.ok(HTML.indexOf('window.__imScrubAuthUrl=_scrub;') < HTML.indexOf('if(!window.INTMAP_ANALYTICS) return;'),
    'スクラブの定義が門の内側に入った——GA を止めると __imScrubAuthUrl が消える');
  has('function gtag(){dataLayer.push(arguments);}', 'gtag の queue shim が消えている（呼ぶ側が落ちる）');
  has('c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};', 'Clarity の queue shim が消えている');
});

test('R502 ④: 計測を戻すなら、プライバシー本文が両サービスを名指していること', () => {
  /* ⚠⚠⚠ **これがこのラウンドの本体である。** 止めたことではなく、
     「名前を書かないまま黙って戻す」経路を塞いだことが直しかた。
     スイッチが `true` になった瞬間、この検査が js/legal-text.js を要求する。 */
  const on = (HTML.match(SWITCH) || [])[1] === 'true';
  if (!on) return;                      /* 停止中は要求しない——収集していないものの告知は要らない */
  const legal = read('js/legal-text.js');
  for (const name of ['Google Analytics', 'Clarity']) {
    assert.ok(legal.includes(name),
      `INTMAP_ANALYTICS を true に戻したのに js/legal-text.js が «${name}» を名指していない`);
  }
});

/* ── AI が書いたことの表示 ──────────────────────────────────────────────────── */

const NEWS = read('js/news-events.js');
const NOTE_LINE = NEWS.split(/\r?\n/).find((l) => l.includes('ev-d-note ev-ai'));

test('R502 ⑤: 統合文の注記が 9 言語すべてで AI と名乗る', () => {
  assert.ok(NOTE_LINE, 'js/news-events.js に `ev-ai` の注記が無い');
  const args = quoted(NOTE_LINE);
  /* 0 番は `<p class=…>`、末尾は `</p>`。あいだの 5 つが L() の位置引数 en/ja/de/ru/es。 */
  const [en, ja, de, ru, es] = args.slice(1, 6);
  for (const [lang, text, marker] of [
    ['en', en, /\bAI\b/], ['ja', ja, /AI/], ['de', de, /\bKI\b/], ['ru', ru, /ИИ/], ['es', es, /\bIA\b/],
  ]) {
    assert.ok(text, `${lang} の位置引数が無い`);
    assert.match(text, marker, `${lang} の注記が AI を名乗っていない: «${text}»`);
  }

  /* 位置引数を持たない 4 言語は inline table のキーで引かれる。#R492 の教訓どおり、
     **キーは英語の原文そのもの**なので、英語を書き換えたらここも同じコミットで動く。 */
  for (const [file, marker] of [
    ['js/locales/ui.fr.js', /\bIA\b/], ['js/locales/ui.ko.js', /AI/],
    ['js/locales/ui.zh-hans.js', /AI/], ['js/locales/ui.zh.js', /AI/],
  ]) {
    const line = read(file).split(/\r?\n/).find((l) => l.includes(en));
    assert.ok(line, `${file} に英語キー «${en.slice(0, 40)}…» の行が無い（英語だけ書き換えられている）`);
    const v = quoted(line)[1];
    assert.ok(v, `${file} の訳文が読めない`);
    assert.match(v, marker, `${file} の訳文が AI を名乗っていない: «${v}»`);
  }
});

test('R502 ⑥: その注記は畳まれた <details> より前に出る', () => {
  /* 但し書きが「根拠の原文（n 件）」という畳まれた行の *下* に居ると、AI が書いた段落と
     表示のあいだに 1 行入る。要素は足していない——順番だけを固定する。 */
  const iNote = NEWS.indexOf(`html += '<p class="ev-d-note ev-ai">'`);
  const iDetails = NEWS.indexOf(`html += '<details class="ev-syn-ev"><summary>'`);
  assert.ok(iNote > 0 && iDetails > 0, '注記か <details> が見つからない');
  assert.ok(iNote < iDetails, 'AI の注記が <details> の後ろに戻っている');
});
