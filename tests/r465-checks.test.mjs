/* ============================================================================
 *  #R465 — 設定ダイアログは「開いたとき」にしか塗られていなかった
 * ----------------------------------------------------------------------------
 *  報告:「言語を fr / ko / zh に変えても『国別メディアのニュース』の16か国が英語のまま」。
 *
 *  ⚠⚠⚠ **訳は在った。** `js/locales/ui.fr.js` に `"United States": "États-Unis"` があり、
 *    読み手も `LNS.arr(f.name)` で正しく引く。欠けていたのは**書き直す契機**である。
 *    `renderCountries()` を呼ぶのは `#btn-open-settings` の処理**だけ**で、言語の `<select>` は
 *    その設定モーダルの中にある——だから選んでから読むまでの間に、そのダイアログが開き直される
 *    ことは構造上一度も無い。実測（本番 R450 のビルド／ローカル）: セッション内で fr に切り替えると
 *    16件すべて英語のまま、同じ言語でリロードすると全部フランス語。
 *
 *  ⚠⚠ **同じ形が設定の中に 7 つ、外に 3 つあった**（`node scripts/…` ではなく全数調査で数えた）。
 *    直したのは 2 つではなく 10 か所で、内訳は下の ① が名指しする。ダイアログ全体を
 *    「開き直しても 1 文字も変わらない」ことは tests/r465.spec.js が本物のブラウザで測る。
 *
 *  ⚠ (#R345 の形) この検査は自分の説明文を読んではならない——上の見出しは `intmap-lang` も
 *    `opt-tz-auto` もそのまま書いている。製品側のソースは `codeOnly()` で注記を剥がしてから見る。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/** Lift a `function name(...){…}` out of a file whose comments are already stripped. */
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

/* ── ① 設定を塗る側は全部、言語が変わったことを聞いている ────────────────────────
   ⚠ ファイル単位で数える。「どこかに 1 つ在る」では足りない理由が #R443 に書いてある——
     同じ語彙を面ごとに写すと、直るのは片方だけになる。 */
const OWNERS = [
  ['js/news-sources.js', '国別メディア／提供元の 2 つの選択欄'],
  ['js/app-body.js', '時刻帯コンボとエンジンの状態行'],
  ['js/i18n-late.js', 'ティッカーの項目選択欄'],
  ['js/ai-core.js', '設定の AI 欄'],
  ['js/satellite.js', '衛星画像の API キー欄'],
  ['js/layer-favs.js', 'レイヤーのお気に入りチップ'],
  ['js/compare.js', '比較ビューの入口ボタン'],
  ['js/dash-extended.js', '高度な分析の見出しと係争境界の注記'],
  ['js/atlas-controls.js', 'Atlas の命名掃引（aria-label）'],
];
test('R465 ① 設定ダイアログを塗る側は、言語が変わったことを聞いている', () => {
  for (const [file, what] of OWNERS) {
    assert.match(CODE(file), /addEventListener\(\s*'intmap-lang'/,
      `${file}（${what}）が言語の切替を聞いていない — 開き直すまで前の言語が残る`);
  }
});

/* ── ② 死んだ id は残していない ────────────────────────────────────────────────
   `updateI18n()` は `#opt-tz-auto` に 「Local (System Default)」 を書いていた。index.html は
   #R18 で native `<select>` をコンボボックスに替えたときからその id を持っていないので、この行は
   何も見つけないまま毎回走っていた。**当てが外れている行は、当てが外れていることを言わない。** */
test('R465 ② もう存在しない id を触る行が残っていない', () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(join(ROOT, d), { withFileTypes: true })) {
    const p = d + '/' + e.name;
    if (e.isDirectory()) { if (!/^(node_modules|dist|\.git)$/.test(e.name)) walk(p); }
    else if (/\.(js|mjs|html)$/.test(e.name)) files.push(p);
  } };
  walk('js'); walk('src');
  for (const f of fs.readdirSync(ROOT)) if (/\.html$/.test(f)) files.push(f);
  /* ⚠ 注記は剥がしてから見る。**その id を名指す記録は残す**——「なぜこの行が空振りしていたか」は
     消してよい事実ではない（#R440）。禁じているのは、それを**触るコード**である。 */
  const hits = files.filter((f) => /opt-tz-auto/.test(/\.html$/.test(f) ? R(f) : CODE(f)));
  assert.deepEqual(hits, [], '`opt-tz-auto` を触る行がまだある — index.html にその id は無い');
});

/* ── ③ 命名掃引は「自分が書いた名前」だけを取り返す ──────────────────────────────
   `_uiNameSweep()` は `:not([aria-label])` にしか名前を付けない＝**その要素が最初に現れた言語**が、
   セッションが終わるまでその読み上げ名の言語になる。取り返す側が、他所が意図して書いた
   `aria-label` まで消してしまうと、それは直しではなく別の欠陥になる。 */
test('R465 ③ 命名掃引は自分の書いた aria-label に印を付け、それだけを取り返す', () => {
  const ctl = CODE('js/atlas-controls.js');
  const sweep = lift(ctl, 'function _uiNameSweep()', 'js/atlas-controls.js');
  assert.ok(!/setAttribute\('aria-label'/.test(sweep),
    '掃引の中に印を付けない aria-label の書き込みが戻っている — その 1 件だけ言語が固まる');
  assert.match(sweep, /_name\(/, '掃引が名前を書かなくなっている');
  const name = lift(ctl, 'function _name(el,txt)', 'js/atlas-controls.js');
  assert.match(name, /setAttribute\('aria-label',txt\)/, '_name() が名前を書いていない');
  assert.match(name, /data-imname/, '_name() が印を付けていない — 取り返す側が対象を選べない');
  assert.match(ctl, /\[data-imname\][\s\S]{0,220}removeAttribute\('aria-label'\)/,
    '言語が変わっても掃引が自分の名前を取り返していない');
});

/* ── ④ 届かない引き金に繋がったままの relabel が無い ────────────────────────────
   `js/dash-extended.js` の relabel はヘッダの言語ピルの click を聞いていた。#R11 が
   `.lang-toggle` を `display:none !important` にして以来、そのボタンは押しようがない。 */
test('R465 ④ 恒久的に隠されたヘッダの言語ピルを、relabel の引き金にしていない', () => {
  const css = R('css/intmap.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.lang-toggle\s*\{[^}]*display:\s*none\s*!important/,
    'ヘッダの言語ピルが隠されなくなった — この検査の前提が変わっている');
  const dash = CODE('js/dash-extended.js');
  assert.ok(!/'lang-jp'/.test(dash),
    'ヘッダの言語ピルにまだ relabel を繋いでいる — 押せないボタンは引き金にならない');
  assert.match(dash, /addEventListener\(\s*'intmap-lang'/, 'dash-extended が言語の切替を聞いていない');
});

/* ── ⑤ 打ちかけの入力を消す形の「直し」になっていない ──────────────────────────
   衛星の鍵欄は `value=` を**保存済みの鍵**から書き出す（Apply が `satSaveKeyInputs`）。言語切替で
   それを丸ごと作り直すと、打ってまだ Apply していない鍵が黙って消える。 */
test('R465 ⑤ 衛星の鍵欄は、言語切替では貼り替えるだけで作り直さない', () => {
  const sat = CODE('js/satellite.js');
  const rel = lift(sat, 'function satRelabelKeyInputs()', 'js/satellite.js');
  const body = rel.replace(/if\(!HOST\.imIsPro\(\)\)\{[^}]*\}/, '');   /* 施錠側は入力を持たないので作り直してよい */
  assert.ok(!/innerHTML/.test(body),
    'Pro 側の鍵欄を作り直している — 打ってまだ Apply していない鍵が消える');
  assert.match(rel, /sat-key-name/, '提供者名を貼り替えていない');
  assert.match(rel, /sat-key-status/, '●／○ の状態語を貼り替えていない');
});

/* ── ⑥ そして実際に走らせる: 貼り替えは「チェックの側」から要約を作る ──────────────
   ⚠⚠⚠ **綴りでは足りない。** `renderCountries()` を言語切替から呼べば国名は直る——そして
     チェックは `imNewsCountries`（＝**確定済み**の選択）から書き戻されるので、まだ Apply して
     いないチェックが黙って消える。だから「貼り替えであって再描画ではない」ことを、本物の
     `relabel()` を動かして測る。 */
test('R465 ⑥ run it: 貼り替えは国名を表から書き直し、要約はチェックの側から作る', () => {
  const src = CODE('js/news-sources.js');
  const harness = `
    let lang='en';
    const NEWS_COUNTRY_FEEDS={ us:{flag:'US',name:['United States','米国']}, jp:{flag:'JP',name:['Japan','日本']} };
    const LNS={ arr:(a)=>lang==='jp'?a[1]:a[0] };
    const noneLabel=()=>lang==='jp'?'未選択':'None';
    const allLabel=()=>lang==='jp'?'すべての提供元':'All outlets';
    const emptyLabel=()=>lang==='jp'?'まだ読み込まれていません。':'No headlines have loaded yet.';
    ${lift(src, 'function countryLabelOf(codes)', 'js/news-sources.js')}
    function countryLabel(){ return countryLabelOf(window.imNewsCountries||[]); }
    ${lift(src, 'function relabel()', 'js/news-sources.js')}
    return { relabel, setLang:(l)=>{ lang=l; } };`;

  const ncx = [{ code: 'us', textContent: 'United States' }, { code: 'jp', textContent: 'Japan' }];
  ncx.forEach((s) => { s.getAttribute = () => s.code; });
  const ticks = [{ value: 'jp' }];                       /* 画面で入っているチェック */
  const cw = { dataset: { built: '1' }, querySelectorAll: (sel) => (sel === '.ncx' ? ncx : ticks) };
  const ddC = { textContent: 'Japan' };
  const emptyRow = { textContent: 'No headlines have loaded yet.' };
  const sw = { dataset: { built: '1' }, querySelector: () => emptyRow, querySelectorAll: () => [] };
  const ddS = { textContent: 'All outlets' };
  const byId = { 'newscountry-multi': cw, 'newscountry-dd-label': ddC, 'newssource-multi': sw, 'newssource-dd-label': ddS };
  const doc = { getElementById: (id) => byId[id] || null };
  const win = { imNewsCountries: ['us'], imNewsSources: [], addEventListener() {} };   /* ⚠ 確定済みは us、画面のチェックは jp */

  const api = new Function('window', 'document', harness)(win, doc);
  api.setLang('jp');
  api.relabel();

  assert.equal(ncx[0].textContent, '米国', '国名が表から書き直されていない');
  assert.equal(ncx[1].textContent, '日本', '国名が表から書き直されていない');
  assert.equal(ddC.textContent, 'JP 日本',
    'ボタンの要約が確定済みの選択に戻っている — まだ Apply していないチェックを捨てる形になっている');
  assert.equal(emptyRow.textContent, 'まだ読み込まれていません。', '提供元の空欄の文が貼り替わっていない');
  assert.equal(ddS.textContent, 'すべての提供元', '提供元の要約が貼り替わっていない');
});

/* ── ⑦ ⑥ の理由が実在することを、同じソースから確かめる ────────────────────────
   「再描画してはいけない」は、`renderCountries()` が確定済みの選択からチェックを書き戻す限りに
   おいて真である。そこが変わったらこの設計の根拠が消えるので、一緒に見張る。 */
test('R465 ⑦ renderCountries() は今も確定済みの選択からチェックを書き戻す', () => {
  const src = CODE('js/news-sources.js');
  const render = lift(src, 'function renderCountries()', 'js/news-sources.js');
  assert.match(render, /cb\.checked=\(window\.imNewsCountries\|\|\[\]\)\.includes\(cb\.value\)/,
    'renderCountries() の書き戻しが変わった — ⑥ の「貼り替えであって再描画ではない」根拠を見直すこと');
  const rel = lift(src, 'function relabel()', 'js/news-sources.js');
  assert.ok(!/renderCountries\(|(^|[^a-zA-Z])render\(/.test(rel),
    '貼り替えが再描画を呼ぶようになった — Apply していないチェックが言語切替で消える');
});
