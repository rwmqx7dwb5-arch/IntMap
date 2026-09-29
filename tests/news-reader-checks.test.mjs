/* ============================================================================
 *  IntMap · the reading surface — one bar, one entrance, one exit, and the route to Atlas
 * ----------------------------------------------------------------------------
 *  記事 reader と Event 詳細が共有する唯一の読む面（#news-reader-pane）と、そこから Atlas へ
 *  主題を運ぶ道。画面の側（計算済みスタイル・視野）は tests/r435.spec.js / r451.spec.js が持つ。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { readFileSync } from 'node:fs';

/* ════════ #R435 — from tests/r435-checks.test.mjs ════════ */
{
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
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));
/* ⚠ (#R345) この検査は自分の説明文を読んではならない——このファイルの見出しも、削除した規則の
   跡に残した CSS の注記も、直した綴りをそのまま書いている。実測: 最初の版は raw な CSS を読み、
   注記の中の `.reader-bar` を「規則が在る」と読んで、①が変異に対して緑のままだった。
   CSS の注釈は 1 形だけなので、JS 用の stripper ではなくこの 1 行を使う。 */
const CSS = () => codeOnly(R('css/intmap.css'), { lang: 'css' });

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
/* 綴りのまま: 主張が CSS / HTML の規則・markup の存在で、それが当たるか（計算済みスタイル）はブラウザにしか無い */
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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
  /* ⚠⚠⚠ (#R451) ONE BAR, NOT THREE COPIES OF ONE SPELLING. This round asserted the SPELLING — that
     all three surfaces wrote `class="nrp-bar"` — and that is exactly as far as a spelling check can
     see: the markup was still typed out three times, so the route to Atlas a reading surface needs
     (#R430's bridge had no caller in the normal sidebar) would have had to be typed three times to
     exist once. js/article-reader.js `readerBar()` builds it now; the other two ask for it. */
  const emitters = [reader, ui, events].filter((c) => /class="nrp-bar"/.test(c));
  assert.equal(emitters.length, 1, 'the reading surface bar is written out in more than one place again');
  assert.ok(reader.includes('class="nrp-bar"') && reader.includes('class="nrp-back"'),
    'js/article-reader.js is no longer the one that builds the reading surface bar');
  assert.ok(/HOST\.readerBar\(/.test(events), 'the Event detail no longer draws the reading surface bar');
  assert.ok(/HOST\.readerBar\(/.test(ui), 'the article reader stopped using the shared bar');
  /* 旧綴りは、CSS からもコードからも消えている。 */
  for (const [where, code] of [['js/news-events.js', events], ['css/intmap.css', css]]) {
    assert.ok(!/\breader-bar\b/.test(code), `the dead \`reader-bar\` spelling is back in ${where}`);
    assert.ok(!/\bbtn-back\b/.test(code), `the dead \`btn-back\` spelling is back in ${where}`);
  }
});

/* ── ③ 詳細は、読む面へ入る 1 本の入口を通り、1 本の出口から出る ───────────────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
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
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R435 ④ everything enterReaderPane() hides is put back by closeReaderPane() or renderUI()', () => {
  const enter = lift(CODE('js/article-reader.js'), 'function enterReaderPane()', 'js/article-reader.js');
  /* 一覧は「`getElementById` へ配られる配列」そのものから読む——そこに足された id は自動で対象になる。 */
  const arr = /\[([^\]]*)\]\s*\.forEach\(\s*id\s*=>[^;]*getElementById\(id\)/.exec(enter);
  assert.ok(arr, 'enterReaderPane() no longer hides its rows through one list — this check can no longer read it');
  const hidden = [...arr[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(hidden.length >= 6, `enterReaderPane() now hides only ${hidden.length} ids — the scan lost the list`);

  const close = lift(CODE('js/app-body.js'), 'function closeReaderPane(quiet,carryArticle)', 'js/app-body.js');   /* (#R451) the exit also decides whether Atlas keeps the subject */
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
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R435 ④b the "something is being read" switch is one class, set and cleared as a pair', () => {
  const enter = lift(CODE('js/article-reader.js'), 'function enterReaderPane()', 'js/article-reader.js');
  const close = lift(CODE('js/app-body.js'), 'function closeReaderPane(quiet,carryArticle)', 'js/app-body.js');   /* (#R451) */
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
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
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
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R435 ⑥ a tab or scope gesture leaves the reading surface', () => {
  const setMode = lift(CODE('js/app-body.js'), 'function setMode(mode,btnId)', 'js/app-body.js');
  /* ⚠ (#R451) `closeReaderPane(true, …)` — the second argument decides whether Atlas keeps the
     article the reader was on (tests/news-reader-checks.test.mjs #R451 ③ owns that rule). What ⑥ guards is unchanged: a
     tab or scope gesture LEAVES the surface, and does it quietly. */
  assert.ok(/closeReaderPane\(true[,)]/.test(setMode), 'setMode() no longer leaves the reading surface');
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
}

/* ════════ #R451 — from tests/r451-checks.test.mjs ════════ */
{
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
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));
/* ⚠ (#R345 の形・15 回目) この検査は自分の説明文も、製品側の注記も読んではならない——上の見出しは
   `window._imReader=null` も `OPEN NEWS ARTICLE` もそのまま書いているし、js/app-body.js の注記は
   運ぶ側と捨てる側の両方の綴りを持っている。CSS の注釈は 1 形なのでこの 1 行で剥がす。 */
const CSS = () => codeOnly(R('css/intmap.css'), { lang: 'css' });

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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R451 ① the reading surface bar is built in one place, and it carries the route to Atlas', () => {
  const reader = CODE('js/article-reader.js');
  const bar = lift(reader, 'function readerBar(o)', 'js/article-reader.js');
  /* ⚠ (tests-by-topic) EVALUATED: the shared bar is BUILT here, with the localiser and the escaper it
     reads off HOST, and the markup it returns is what is asked — not whether the function's text
     contains two class names. */
  const HOST = { lang: 'jp', escForReader: (s) => String(s).replace(/</g, '&lt;') };
  const win = { IntMapLang: { t: (lang, ...forms) => (lang === 'jp' ? forms[1] : forms[0]) } };
  const html = new Function('HOST', 'window', bar + '\nreturn readerBar;')(HOST, win)({ publisher: 'NHK <World>' });
  assert.match(html, /^<div class="nrp-bar">/, 'the shared bar is one nrp-bar');
  assert.match(html, /<button class="nrp-back" id="nrp-back-btn">‹ 戻る<\/button>/, 'the shared bar no longer draws the back button');
  assert.match(html, /<button class="nrp-atlas" type="button" title="Atlasに聞く">Atlasに聞く<\/button><\/div>$/,
    'the shared bar no longer draws the route to Atlas — at the trailing end, in the reader’s language');
  assert.ok(html.includes('NHK &lt;World>'), 'and what it prints goes through the reader’s escaper');

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
/* 綴りのまま: 主張が CSS / HTML の規則・markup の存在で、それが当たるか（計算済みスタイル）はブラウザにしか無い */
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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
}

/* ════════ #R776 — from tests/r776-reader-atlas-arrival-checks.test.mjs ════════ */
{
/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  R776 — 「Atlasに聞く」 from a reading surface arrives ON the thing being read
 *
 *  THE DEFECT, restated as the defect and not as the fix (memory: restate-the-defect-not-the-fix):
 *  the reading surface's «Ask Atlas» — the bar built once in js/article-reader.js `readerBar()` and
 *  worn by BOTH the article reader and the Event detail — called `IntMapAtlas.call('open')`. Pressing
 *  it switched the tab and nothing else: the console opened on its generic intro, and a reader who
 *  had a headline in front of them had to type that headline back in before Atlas could be asked
 *  anything. The subject was never missing — `window._imReader` has carried it since #R430 and
 *  `_selectionState()` reads it — so the console could already have answered 「この記事の背景は？」.
 *  What was missing was any sign, at the moment of arrival, that it could.
 *
 *  ⚠ The map's right-click «Ask Atlas» (`askHere`) has arrived on its subject since #R392. Two
 *    buttons with the same label behaved differently because the arrival was written inside one of
 *    them. These checks measure the four facts that keep them from drifting again.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* Pull one top-level `function <name>(` block out of a source file by matching braces. The checks
   below RUN it (#R505: a check that only reads source cannot see what the code decides). */
function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `${name}() not found`);
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, j + 1); }
  }
  throw new Error(`${name}() has no closing brace`);
}

const ATLAS = read('js/atlas-console.js');
/* ⚠ The arrival lives in its own module because the kernel is under a shrink-only line ceiling and
   was sitting ONE line below it — writing this inside js/atlas-console.js measured 4,964 lines and
   turned five checks red. The rule beside that ceiling is «a feature moves out, never the ceiling
   up», so the subject of ①②③ is this file. */
const READING = read('js/atlas-reading.js');

/* ── 1. The starters are DERIVED from the item, not a fixed trio ──────────────────────────────
   #R392 took fixed sentences out of askHere because the most subject-specific gesture there is was
   opening with the same question for Hormuz, Baikal and empty Gobi. The reading surface's arrival
   must not reintroduce them: an item with a place, an item without one, an event with a body and a
   bare article have different things they can usefully be asked about. */
function starters(rd, langIndex) {
  const L = (...a) => a[langIndex];
  // eslint-disable-next-line no-new-func
  const fn = new Function('L', extractFn(READING, 'readingStarters') + '; return readingStarters;')(L);
  return fn(rd);
}

test('R776 ① the reading starters differ with what the item actually has', () => {
  const bare = starters({ kind: 'article', title: 'T' }, 0);
  const placed = starters({ kind: 'article', title: 'T', place: 'Gaza' }, 0);
  const evented = starters({ kind: 'event', title: 'T', place: 'Gaza', body: 'x' }, 0);

  for (const s of [bare, placed, evented]) {
    assert.ok(Array.isArray(s) && s.length >= 2 && s.length <= 3, `expected 2–3 starters, got ${JSON.stringify(s)}`);
    for (const q of s) assert.ok(q && typeof q === 'string' && q.trim(), 'a starter is empty');
  }
  /* the three shapes must not be the same three sentences */
  assert.notDeepEqual(bare, placed, 'an item WITH a place gets the same starters as one without');
  assert.notDeepEqual(placed, evented, 'a clustered event with sources gets the same starters as a bare article');
  /* an item with no place must not be offered a question about one */
  assert.ok(!bare.some((q) => /\{p\}/.test(q)), 'an unsubstituted {p} placeholder reached a starter');
  assert.ok(placed.some((q) => q.includes('Gaza')), 'the place the item carries is never named in a starter');
  assert.ok(!bare.some((q) => q.includes('Gaza')), 'a place leaked into an item that has none');
});

test('R776 ② the substitution is done in every language, not only English', () => {
  /* ⚠ a `.replace('{p}', …)` applied to the English string only would leave 「{p} を地図で見せて」 on
     screen for eight of the nine languages — the failure shape of a translated sentence whose
     assembly is written once against one of its translations. */
  for (let lang = 0; lang < 5; lang++) {
    const s = starters({ kind: 'article', title: 'T', place: 'Gaza' }, lang);
    assert.ok(!s.some((q) => /\{p\}/.test(q)), `language index ${lang} kept an unsubstituted {p}: ${JSON.stringify(s)}`);
    assert.ok(s.some((q) => q.includes('Gaza')), `language index ${lang} dropped the place name`);
  }
  /* and the languages are actually different sentences, not the English one nine times */
  assert.notDeepEqual(starters({ kind: 'event', title: 'T', body: 'x' }, 0),
    starters({ kind: 'event', title: 'T', body: 'x' }, 1), 'jp starters are identical to en');
});

/* ── 2. One arrival builder, not two ──────────────────────────────────────────────────────────
   The defect existed because «arrive naming the subject» lived INSIDE askHere. If a second copy of
   the chip markup appears, the two entries can disagree again — and the next surface to want an
   arrival will copy one of them rather than call it. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R776 ③ the arrival bubble is built in exactly one place', () => {
  /* across BOTH files: a copy left behind in the kernel would be just as much a second copy */
  const chipMarkup = (ATLAS + READING).split('class="atl-here-q"').length - 1;
  assert.equal(chipMarkup, 1, `the starter-chip markup appears ${chipMarkup} times; it is built once, by _arrive()`);
  const wiring = (ATLAS + READING).split(".querySelectorAll('.atl-here-q')").length - 1;
  assert.equal(wiring, 1, 'the chip click wiring has more than one copy');
  for (const caller of ['function arrive(', 'function askReading(']) assert.ok(READING.includes(caller), `${caller} is gone`);
  assert.ok(ATLAS.includes('function askHere'), 'askHere is gone');
  assert.ok(ATLAS.includes('makeAtlasReading('), 'the kernel no longer builds the arrival module');
  /* askHere must be a CALLER of the shared builder, not its own copy again */
  const here = extractFn(ATLAS, 'askHere');
  assert.ok(here.includes('.arrive('), 'askHere stopped using the shared arrival');
  assert.ok(!here.includes('class="atl-here-q"'), 'askHere grew its own chip markup back');
});

/* ── 3. The route from the reading surface carries the subject ─────────────────────────────────
   ⚠ `askReading` opens the console itself and returns false when nothing is being read, so the
   reading surface has no second plan to keep in step. That is the point of checking BOTH ends: a
   kernel method nobody calls, and a caller naming a method the kernel does not export, look the same
   from either side alone (memory: contract-reached-only-from-one-side). */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R776 ④ the reading surface asks for the reading arrival, and the kernel exports it', () => {
  const reader = read('js/article-reader.js');
  const fn = extractFn(reader, 'askAtlasAboutReading');
  assert.ok(fn.includes("call('askReading')"), 'the reading surface no longer asks Atlas for the reading arrival');
  assert.ok(!fn.includes("call('open')"), "the reading surface is back to `call('open')` — a tab switch and nothing else");
  /* the kernel's public API object actually offers it */
  const api = ATLAS.slice(ATLAS.lastIndexOf('return { open, toggle,'));
  /* ⚠ the kernel must also still be able to REACH it — an export naming a method the module does not
     define, and a module method nobody exports, look the same from either side alone. */
  assert.ok(READING.includes('return { arrive, askReading'), 'js/atlas-reading.js stopped exporting the arrival');
  assert.ok(/\baskReading\b/.test(api.slice(0, api.indexOf('};'))), 'askReading is not on the console\'s public API');
  /* and the fallback for a press with nothing open still exists */
  assert.ok(fn.includes('IntMapConsole'), 'the no-kernel fallback route is gone');
});

/* ── 4. Every writer of the bridge carries `kind` ──────────────────────────────────────────────
   ⚠ memory: object-built-twice — a field written by only one of an object's builders evaporates for
   the others. The writers are DISCOVERED here, not listed: a fourth surface that starts feeding the
   bridge is measured the day it is added, which a hand-written list of three would not be. */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R776 ⑤ every window._imReader writer declares what kind of thing is being read', () => {
  const files = ['js/article-reader.js', 'js/news-ui.js', 'js/news-events.js'];
  let found = 0;
  for (const f of files) {
    const src = read(f);
    const re = /window\._imReader\s*=\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
      found++;
      /* the literal runs to the matching brace */
      let depth = 0, end = -1;
      for (let j = src.indexOf('{', m.index); j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      const lit = src.slice(m.index, end + 1);
      assert.ok(/\bkind\s*:/.test(lit), `a window._imReader literal in ${f} has no kind: ${lit.slice(0, 120)}`);
      assert.ok(/'(article|event)'/.test(lit), `a window._imReader literal in ${f} declares a kind that is neither article nor event`);
    }
  }
  assert.ok(found >= 3, `expected at least the three known bridge writers, found ${found}`);
  /* and the state the model reads passes it on — a field the writers fill and the reader drops is
     the same defect one level down */
  assert.ok(/o\.article=\{\s*kind:/.test(ATLAS), '_selectionState() builds o.article without kind');
});
}
