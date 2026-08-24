/* ============================================================================
 *  #R435 — 読む面は 1 つ。入口も出口も 1 本ずつ。
 * ----------------------------------------------------------------------------
 *  `#news-reader-pane` は IntMap の**唯一の読む面**である。記事 reader はそこに記事を描き、
 *  出来事の詳細（js/news-events.js `openDetail`）はそこに Event を描く。#R386 は「同じ面に描く」
 *  とだけ決めて、**同じ面に入る手順**を持たなかった——`pane.style.display=''` と
 *  `feed.style.display='none'` の 2 行が、記事 reader の入口 9 行の代わりだった。
 *  そこから 3 つの報告が同時に出ている:
 *
 *    ① 戻るボタンが見えない  — 帯を `.reader-bar`/`.btn-back` と綴り、CSS の規則は
 *       `.ev-detail .reader-bar` / `.ev-detail .btn-back`。**帯は `.ev-detail` の兄弟**なので
 *       その 3 規則は 1 度も当たらず、ボタンは素の <button>（#f0f0f0・角丸 0・padding 0・
 *       2px outset・44×20）で、帯の `position:sticky` も効かなかった（実測 `static`）。
 *       ⚠ **当たらない CSS は、綴りとしては完全に健在である。** 規則は在り、クラス名も在り、
 *         `grep` は両方を見つける。違うのは「その要素に当たったか」だけで、それは
 *         **計算済みスタイルにしか無い**。だから ① の証拠は tests/r435.spec.js が持つ。
 *    ② デザインが浮いている — 一覧の外皮（タブ列・検索欄・chips）を伏せないので、読む面が
 *       「一覧の残した帯」に描かれていた。
 *    ③ 半分だけになる — `renderUI()` が読む面を知らないので、再描画のたびに一覧を出し直し、
 *       `flex:1 1 auto` の兄弟 2 つが高さを折半した。
 *
 *  ここが持つのは**綴りで言えることだけ**——入口と出口が 1 本ずつであること、伏せたものが
 *  戻ること、`.ev-detail` の下に外皮の写しを作り直していないこと。画面の側は
 *  tests/r435.spec.js（core tier・電話の視野）が持つ。
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
/* ⚠ (#R345) この検査は自分の説明文を読んではならない——このファイルの見出しも、削除した規則の
   跡に残した CSS の注記も、直した綴りをそのまま書いている。実測: 最初の版は raw な CSS を読み、
   注記の中の `.reader-bar` を「規則が在る」と読んで、①が変異に対して緑のままだった。
   CSS の注釈は 1 形だけなので、JS 用の stripper ではなくこの 1 行を使う。 */
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

/* ── ① 単独のクラスは、必ず規則を持つ ────────────────────────────────────────────
   ⚠ **これが ① を捕まえる門である。** `class="reader-bar"` も `class="btn-back"` も、その要素の
     クラスは**それ 1 つだけ**だった。単独のクラスに規則が 1 つも無いということは、その要素を
     誰も装飾していないということで、ブラウザ既定の見た目で出荷されるということである。
   ⚠ 免除一覧を持たない（#R415）。複数クラスの要素（`class="ev-d-sec ev-figs"` のように、
     装飾は片方が持ち、もう片方は意味の目印）は主張の対象外——そこは「誰も装飾していない」が
     偽になりうるからで、単独クラスではそれが起こり得ない。
   ⚠ 走査は**読む面を描く 3 ファイル全部**。1 ファイルに向けた門が 1 ファイルしか守らないことは
     #R429 が 49 ラウンドぶんの実例で示している。 */
test('R435 ① every solo class the reading surface emits has a rule in the stylesheet', () => {
  const css = CSS();
  const declared = (t) => new RegExp('\\.' + t + '(?![\\w-])').test(css);
  const missing = [];
  let seen = 0;
  for (const f of ['js/news-events.js', 'js/news-ui.js', 'js/article-reader.js']) {
    for (const m of CODE(f).matchAll(/class="([^"'`]*)"/g)) {
      const toks = m[1].trim().split(/\s+/);
      if (toks.length !== 1 || !/^[a-z][\w-]*$/.test(toks[0])) continue;
      seen++;
      if (!declared(toks[0])) missing.push(f + ' → .' + toks[0]);
    }
  }
  assert.ok(seen > 40, `the scan found only ${seen} solo classes — it has stopped reading the files`);
  assert.deepEqual(missing, [], 'an element whose only class has no rule ships with the browser default');
});

/* ── ② 読む面の帯は 1 か所だけが持つ ─────────────────────────────────────────────
   規則を**書き写す**と、写しのほうが間違っていても誰も気づかない。`.ev-detail .reader-bar` と
   `.ev-detail .btn-back` は `.nrp-bar` / `.nrp-back` のバイト単位の写しで、当たらないまま
   49 ラウンド在った。⇒ 綴りは 1 組、規則も 1 組。 */
test('R435 ② the reading surface has ONE back bar, and both readers spell it the same way', () => {
  const css = CSS();
  const events = CODE('js/news-events.js');
  const reader = CODE('js/article-reader.js');
  const ui = CODE('js/news-ui.js');

  for (const cls of ['nrp-bar', 'nrp-back']) {
    const rules = css.split('\n').filter((l) => new RegExp('^\\s*[^{}]*\\.' + cls + '(?![\\w-])[^{}]*\\{').test(l));
    assert.ok(rules.length >= 1, `.${cls} has no rule at all`);
    /* 唯一の重複は `:hover` である。第 3 の規則は「どこかにもう 1 つの外皮がある」ことを意味する。 */
    const scoped = rules.filter((l) => /\.(ev-detail|news-item|content-area)\s+\.nrp-/.test(l));
    assert.deepEqual(scoped, [], `.${cls} has been copied under another surface's scope again`);
  }
  assert.ok(events.includes('class="nrp-bar"'), 'the Event detail no longer draws the reading surface bar');
  assert.ok(events.includes('class="nrp-back"'), 'the Event detail no longer draws the reading surface back button');
  assert.ok(reader.includes('class="nrp-bar"') && ui.includes('class="nrp-bar"'), 'the article reader stopped using its own bar');
  /* 旧綴りは、CSS からもコードからも消えている。 */
  for (const [where, code] of [['js/news-events.js', events], ['css/intmap.css', css]]) {
    assert.ok(!/\breader-bar\b/.test(code), `the dead \`reader-bar\` spelling is back in ${where}`);
    assert.ok(!/\bbtn-back\b/.test(code), `the dead \`btn-back\` spelling is back in ${where}`);
  }
});

/* ── ③ 詳細は、読む面へ入る 1 本の入口を通り、1 本の出口から出る ───────────────── */
test('R435 ③ the Event detail enters and leaves through the shared reading surface', () => {
  const events = CODE('js/news-events.js');
  const open = lift(events, 'function openDetail(item)', 'js/news-events.js');
  assert.ok(open.includes('HOST.enterReaderPane()'), 'openDetail no longer enters through the shared surface');
  assert.ok(open.includes('HOST.closeReaderPane('), 'the back button no longer leaves through the shared exit');
  /* ⚠ 自分で一覧を出し入れしない。それをすると、外皮を伏せたままの一覧に戻る。 */
  assert.ok(!events.includes("getElementById('live-news-feed')"),
    'js/news-events.js is reaching for the feed again — showing it back is renderUI()’s job, not this layer’s');
  assert.ok(!/pane\.style\.display\s*=/.test(events),
    'js/news-events.js is setting the pane’s display again — that belongs to enterReaderPane/closeReaderPane');
});

/* ── ④ 伏せたものは、必ず誰かが戻す ──────────────────────────────────────────────
   ⚠ **一覧を書き写さない。** 伏せる綴りは `enterReaderPane()` から**読み出して**、
     その 1 つ 1 つが `closeReaderPane()`（js/app-body.js）か `renderUI()`（js/news-ui.js）の
     どちらかに現れることを要求する。新しい行を入口に足して出口に足し忘れると赤になる。 */
test('R435 ④ everything enterReaderPane() hides is put back by closeReaderPane() or renderUI()', () => {
  const enter = lift(CODE('js/article-reader.js'), 'function enterReaderPane()', 'js/article-reader.js');
  /* 一覧は「`getElementById` へ配られる配列」そのものから読む——そこに足された id は自動で対象になる。 */
  const arr = /\[([^\]]*)\]\s*\.forEach\(\s*id\s*=>[^;]*getElementById\(id\)/.exec(enter);
  assert.ok(arr, 'enterReaderPane() no longer hides its rows through one list — this check can no longer read it');
  const hidden = [...arr[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(hidden.length >= 6, `enterReaderPane() now hides only ${hidden.length} ids — the scan lost the list`);

  const close = lift(CODE('js/app-body.js'), 'function closeReaderPane(quiet)', 'js/app-body.js');
  const render = lift(CODE('js/news-ui.js'), 'function renderUI()', 'js/news-ui.js');
  const orphans = hidden.filter((id) => !close.includes(id) && !render.includes(id));
  assert.deepEqual(orphans, [], 'these rows are hidden on the way in and nobody puts them back');

  /* `.control-panel` はクラスであって id ではなく、renderUI() は一度も触らない。出口が持つ。 */
  assert.ok(enter.includes(".querySelector('.control-panel')"), 'the tab row is no longer hidden for the reader');
  assert.ok(close.includes(".querySelector('.control-panel')"), 'the tab row is never restored');
});

/* ── ④b 「読んでいる」の合図は 1 つで、付ける側と外す側が対になっている ─────────────
   ⚠⚠ **inline の `display:none` では届かない場所がある。** workspace mode の layout CSS は
     News ウィンドウの一覧を `display:flex !important` で出す——サイドバーのタブ状態がそこへ
     手を伸ばせないようにするための規則で、それ自体は正しい。だが同じ `!important` が
     **読む面の伏せ方も上書きしていた**（実測 1280×800・ws の News ウィンドウ・詳細を開いた状態:
     `#live-news-feed` 35px @y=113 と `#news-reader-pane` 114px @y=148 が同時に出る＝
     サイドバーと同じ「半分だけ」）。⇒ 決定を 2 か所に写さず、**1 つのクラス**を読む。 */
test('R435 ④b the "something is being read" switch is one class, set and cleared as a pair', () => {
  const enter = lift(CODE('js/article-reader.js'), 'function enterReaderPane()', 'js/article-reader.js');
  const close = lift(CODE('js/app-body.js'), 'function closeReaderPane(quiet)', 'js/app-body.js');
  assert.ok(/classList\.add\('im-reading'\)/.test(enter), 'entering the reading surface no longer raises the flag');
  assert.ok(/classList\.remove\('im-reading'\)/.test(close), 'leaving it no longer lowers the flag');
  /* workspace mode reads the flag rather than keeping its own copy of the decision. */
  const ws = CODE('js/workspace.js');
  const rule = ws.split('\n').find((l) => l.includes('im-reading') && l.includes('display:none !important'));
  assert.ok(rule, 'workspace mode no longer hides the News window list while something is being read');
  for (const id of ['live-news-feed', 'sidebar-search-bar', 'news-filter-toggle', 'ai-geocode-row']) {
    assert.ok(rule.includes('#' + id), `the workspace rule no longer covers #${id}`);
  }
});

/* ── ⑤ 再描画は、読んでいる人の前に一覧を並べない ───────────────────────────────── */
test('R435 ⑤ renderUI() shows one surface: the reader, or the list — never both', () => {
  const render = lift(CODE('js/news-ui.js'), 'function renderUI()', 'js/news-ui.js');
  assert.ok(/readerUp/.test(render), 'renderUI() has stopped noticing the reading surface');
  /* News 以外へ移ったら閉じる——読む面が他のタブへ漏れない。 */
  assert.ok(/readerUp[\s\S]{0,120}HOST\.closeReaderPane\(true\)/.test(render),
    'renderUI() no longer closes the reading surface when the reader has navigated away');
  /* News の枝では、一覧と外皮は `!readerUp` の中でだけ出る。 */
  const branch = render.slice(render.indexOf("if(HOST.mode==='news'||HOST.mode==='saved'){"));
  const guard = branch.indexOf('if(!readerUp)');
  const show = branch.indexOf("feed.style.display='flex'");
  assert.ok(guard >= 0 && show > guard && show - guard < 40,
    'the News branch shows the feed without asking whether something is being read — that is the 半分だけ state');
  assert.ok(/gr\.style\.display=\(!readerUp/.test(branch), 'the Translate-titles row is no longer guarded');
});

/* ── ⑥ タブや scope の操作は、読む面を離れる ─────────────────────────────────────
   ⑤ は背景の再描画（auth の realtime・言語切替・設定の適用）を守る。こちらは**操作**を守る:
   `setMode()` は利用者の手からしか呼ばれないので、ここで閉じないと「★保存済み を押したのに
   さっきの詳細が出たまま」になる。 */
test('R435 ⑥ a tab or scope gesture leaves the reading surface', () => {
  const setMode = lift(CODE('js/app-body.js'), 'function setMode(mode,btnId)', 'js/app-body.js');
  assert.ok(setMode.includes('closeReaderPane(true)'), 'setMode() no longer leaves the reading surface');
  /* ⚠ 静かに閉じる。ここで renderUI() を走らせると 1 回の操作でタブを 2 度描く。 */
  assert.ok(!/closeReaderPane\(\s*\)/.test(setMode), 'setMode() is closing loudly — the tab would render twice per click');
});

/* ── ⑦ Atlas が名乗る「開いている出来事」は、観測した結果である ──────────────────
   ⚠ ここは**実際に走らせる**。閉じる経路は戻るボタンだけではない（タブの切り替え・背景の
     再描画・記事 reader を開くこと）ので、覚えている publicId は「最後に開いたもの」で
     あって「いま画面に出ているもの」ではない（#R340 の produces-observed）。 */
test('R435 ⑦ selectedEventId is what is on screen, not what was opened last', () => {
  const events = CODE('js/news-events.js');
  const fn = lift(events, 'function selectedShown()', 'js/news-events.js');
  assert.ok(/selectedEventId:\s*selectedShown\(\)/.test(events), 'state() went back to reporting the remembered id');

  const run = (pane) => new Function('document', 'selected', fn + '\nreturn selectedShown();')(
    { getElementById: () => pane }, 'r435evt01');
  const paneWith = (display, detail) => ({ style: { display }, querySelector: () => (detail ? {} : null) });
  assert.equal(run(paneWith('flex', true)), 'r435evt01', 'an Event detail that IS on screen must be reported');
  assert.equal(run(paneWith('none', true)), null, 'a hidden pane is not an open Event');
  assert.equal(run(paneWith('flex', false)), null, 'the article reader is not an open Event');
  assert.equal(run(null), null, 'no pane at all is not an open Event');
});
