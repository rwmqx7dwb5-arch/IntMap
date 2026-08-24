/* ============================================================================
 *  R394 — 監査が嘘をついていた／一度も発火していなかった門
 * ----------------------------------------------------------------------------
 *  #R386 が出来事を利用者に届けたあと、本番の表を読み直して分かったこと:
 *
 *   ⚠⚠⚠ ① **埋め込みを持つ記事は 0 行なのに、`assigned_by='embedding'` の辺が 23 本**
 *          あった。`news_event_merge_into` が機械の merge に無条件でその名前を書いて
 *          いたためで、`link` 段の候補は**語からしか出ていない**（この鍵は埋め込み
 *          モデルに届かない）。監査の列が情報ではなく**嘘**を持っていた。
 *   ⚠⚠⚠ ② **#R351 が書いた索引記事の門は、一度も発火していなかった。**
 *          `…the following (is|are)\b` の `\b` が**バックスペース文字 1 個**（0x08）に
 *          潰れていた。JavaScript としては妥当なので `node --check` も lint も黙る。
 *   ⚠⚠⚠ ③ **索引ページは 3 本ではなく 43 本あった**（Reuters の銘柄ページ 33・AP の
 *          話題ページ 10）。8 つの Event を汚し、#1221 は 3 本とも NBA の索引ページ。
 *   ⚠⚠  ④ **「値が違う」を「食い違っている」と読ませていた。** 香港の上場の塊で
 *          Shein の $1.8B/$27B と Alibaba の $10B/$10.2B が並び、「媒体が食い違って
 *          いる」と表示されていた——同じ数字についての相違ではない。
 *
 *  数字はすべて 2026-08-24 の本番データ（active 1,367〜1,377 本 / Event 1,069〜1,076）で
 *  測った値である。
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

import { headlineReject } from '../supabase/functions/_shared/news-ingest.js';
import { makeNewsClaims } from '../js/news-claims.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

const DESC = 'a long enough description with plenty of words in it so the short-title gate does not fire';

/* ══ ① 索引ページの門 — 実測した綴りで落ち、実測した本物は残る ═══════════════════ */
test('① 通信社の索引ページは落ち、署名記事は落ちない（実測した綴りだけで判定する）', () => {
  /* 本番に実在した索引ページ（Reuters 33 本・AP 10 本の代表）。 */
  for (const t of [
    '(IBX.N) | Stock Price & Latest News',
    '(CLEMO.ST) | Stock Price & Latest News',
    'Weather, Hurricanes and Storms | Latest News & Updates',
    'Australia News | Latest News in Australia',
    'Europe News | Breaking European News Today',
    'NBA Scores & Daily News | NBA Stats, Scores & News Today',
    'Volodymyr Zelenskiy News | Today’s Latest Stories',
  ]) assert.equal(headlineReject(t, DESC, 'https://x/y'), 'title_not_an_article', t);

  /* ⚠⚠ **`|` そのものを門にしてはならない。** The Guardian は署名記事をこの形で出す。
     実測: `|` を持つ見出し 47 本のうち、本物はこの 4 本だった。 */
  for (const t of [
    'Stores are selling Halloween stuff in August. Time has lost all meaning | Dave Schilling',
    'An AI ‘debt bomb’ crisis? No. This isn’t Enron 2.0 | Gene Marks',
    'Is this why close encounters with intelligent aliens have so far eluded us? | Letters',
    'Canada-U.S. Trade War Escalates as Talks Collapse',
  ]) assert.equal(headlineReject(t, DESC, 'https://x/y'), null, t);
});

test('①b NPR の «…. And, …» 型は 1 つの出来事についての報道ではない', () => {
  assert.equal(
    headlineReject('Trump declares economic warfare on Iran. And, SCOTUS to rule on White House ballroom', DESC, 'https://x/y'),
    'multi_event_digest');
  /* 普通の見出しの «and» は当たらない（コンマの無い and、文中の and）。 */
  for (const t of ['Canada and the US fall deeper into a trade war as talks collapse',
                   'Robot boxing, football and sprinting at World Humanoid Games'])
    assert.equal(headlineReject(t, DESC, 'https://x/y'), null, t);
});

/* ══ ② 一度も発火していなかった門 ═══════════════════════════════════════════════ */
test('② #R351 の索引記事の門が、いま実際に発火する', () => {
  /* ⚠ これは新しい規則ではない。#R351 が書いたものが、`\\b` の潰れで**死んでいた**。
     ここが赤くなるのは、また誰かが同じ潰し方をした日である。 */
  const yon = headlineReject(
    'Yonhap News Summary',
    'SEOUL, Aug. 22 (Yonhap) -- The following is the second summary of major stories moved by Yonhap News Agency on Friday.',
    'https://x/y');
  assert.equal(yon, 'multi_event_digest', "#R351's own rule is dead again");
});

test('②b 正規表現の中に生の制御文字が 1 つも無い（潰れたエスケープを門が見張る）', () => {
  /* 走らせるのは `scripts/static-checks.mjs` の規則そのもの——検査が第二の実装を持たない。 */
  /* execFileSync は非ゼロ終了で throw する。だから「落ちない」ことと「この規則の名前が
     出ない」ことの両方を見る。 */
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/static-checks.mjs')], { encoding: 'utf8' });
  assert.ok(!out.includes('[regex-control-char]'),
    'a regular expression carries a raw control character:' + out.slice(-1200));
  /* ⚠ 門が本当に落ちることを、この検査自身が持つ材料で確かめる。 */
  const CTRL = String.fromCharCode(8);
  const line = '  const re = /the following (is|are)' + CTRL + '/i;';
  let flagged = false;
  for (let k = 0; k < line.length; k++) {
    const c = line.charCodeAt(k);
    if (!((c < 32 && c !== 9) || c === 127)) continue;
    if (line.lastIndexOf('/', k) >= 0 && line.indexOf('/', k + 1) >= 0) flagged = true;
  }
  assert.equal(flagged, true, 'the rule the gate uses would not catch the very shape it exists for');
});

/* ══ ③ 「値が違う」は「食い違っている」ではない ═══════════════════════════════════ */
test('③ 同じ量についての別々の説明だけを相違と呼ぶ（本番の 2 例をそのまま）', () => {
  const C = makeNewsClaims();
  /* 本番 #854。Reuters が正確な額、AP が丸めた額——**同じ制裁金についての 2 通りの言い方**。 */
  const uber = C.differences([
    { title: 'EXCLUSIVE: Dutch regulator fines Uber $966 million for automating driver suspensions', description: '', source: 'Reuters', family: 'reuters' },
    { title: 'Uber fined nearly $1 billion by Dutch regulators over automated suspensions', description: '', source: 'AP News', family: 'apnews' },
  ]);
  assert.equal(uber.length, 1);
  assert.deepEqual(uber[0].claims.map((c) => c.value), [966e6, 1e9]);

  /* 本番 #1230。Shein の IPO（$1.8B / $27B）と Alibaba の売出（$10B / $10.2B）が同じ塊に
     いる。⚠ **相違として出してよいのは $10B vs $10.2B だけ**で、他は別々の事実である。 */
  const hk = C.differences([
    { title: 'Alibaba launches $10 billion Hong Kong share placement to fund AI spending', description: '', source: 'Reuters', family: 'reuters' },
    { title: 'Alibaba plunges after announcing $10.2 billion share placement to fund AI push', description: '', source: 'CNBC', family: 'cnbc' },
    { title: 'Shein Seeks Up to $1.8 Billion in Long-Awaited Hong Kong IPO', description: '', source: 'Bloomberg', family: 'bloomberg' },
    { title: 'Fast fashion giant Shein valued at up to $27 billion in Hong Kong IPO', description: '', source: 'Reuters', family: 'reuters' },
  ]);
  assert.equal(hk.length, 1, 'more than one disagreement means the groups are not by quantity');
  assert.deepEqual(hk[0].claims.map((c) => c.value), [10e9, 10.2e9]);
  assert.deepEqual(hk[0].claims.map((c) => c.source), ['Reuters', 'CNBC']);

  /* 門を外すと、まさに #R386 が本番で出していた誤った並びに戻る＝この検査は門を測っている。 */
  const loose = C.differences([
    { title: 'Alibaba launches $10 billion Hong Kong share placement', description: '', source: 'Reuters', family: 'reuters' },
    { title: 'Shein Seeks Up to $1.8 Billion in Long-Awaited Hong Kong IPO', description: '', source: 'Bloomberg', family: 'bloomberg' },
  ], { sameQuantityRatio: 0 });
  assert.equal(loose.length, 1);
  assert.deepEqual(loose[0].claims.map((c) => c.value), [1.8e9, 10e9]);
});

test('③b 同じ系列の中の数の変化は相違ではない（更新である）', () => {
  const C = makeNewsClaims();
  const same = C.differences([
    { title: 'Landslide at Guinea landfill kills 3, government says', description: '', source: 'WJLA', family: 'sinclair' },
    { title: 'Landslide at Guinea landfill kills 5, officials say', description: '', source: 'KOMO', family: 'sinclair' },
  ]);
  assert.equal(same.length, 0);
});

test('③c 規則は 1 本で、UI も計測器も同じものを呼ぶ', () => {
  /* ⚠ #R386 はこの規則を js/news-events.js の factory の奥に書いた——**ブラウザの外から
     誰も呼べない**ので、歩留まりも精度も測れなかった（#R340 と同じ形）。 */
  const view = codeOnly(rd('js/news-events.js'));
  assert.match(view, /makeNewsClaims\(\)/, 'the view must call the shared rule');
  assert.ok(!/NUM_KINDS\s*=/.test(view), 'the view grew its own copy of the extractor again');
  assert.ok(!/sameQuantityRatio/.test(view), 'the view grew its own threshold');
  const evalr = rd('scripts/news-events-eval.mjs');
  assert.match(evalr, /from '\.\.\/js\/news-claims\.js'/, 'the instrument must measure the SAME rule');
});

/* ══ ④ 機械の merge は、実際に決めたものの名前を書く ═══════════════════════════════ */
test('④ link 段は「何が決めたか」を渡し、無かった cos を 0 と書かない', () => {
  const fn = codeOnly(rd('supabase/functions/news-ingest/index.ts'));
  assert.match(fn, /p_decided_by: decidedBy/, 'the merge call must pass what decided it');
  assert.match(fn, /verdict\.top && verdict\.top\.code === "embedding"/, 'and derive it from the verdict');
  /* ⚠ `Number(null).toFixed(3)` は "0.000"。無かったものを 0 と書くのは、無かったと
     書くことではない——本番の監査に「cos 0.000」が 11 行残っていた。 */
  assert.ok(!/Number\(p2\.similarity\)\.toFixed/.test(fn), 'a missing cosine is being printed as 0.000 again');
  assert.match(fn, /no embedding \(candidate came from shared rare words\)/, 'the note must say there was no cosine');

  const sql = rd('supabase/migrations/20260824190000_news_event_decided_by.sql');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.match(code, /p_decided_by text default 'deterministic'/, 'the mechanism must take it as an argument');
  assert.ok(!/else 'embedding' end/.test(code), 'the machine still hardcodes a mechanism name');
  /* 呼び出し側が嘘をつけないよう、値そのものを確かめている。 */
  assert.match(code, /p_decided_by not in \('deterministic','embedding','llm'\)/);
  /* ⚠ 4 引数の古い形が残ると、知らない呼び出し側がそちらに解決して直した経路が迂回される。 */
  assert.match(code, /drop function if exists public\.news_event_merge_into\(bigint, bigint, uuid, text\);/);
});

test('④b 直すのは「名札」だけで、判定には触れない', () => {
  const sql = rd('supabase/migrations/20260824190000_news_event_decided_by.sql');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  /* 名札を直す UPDATE は、**その機構の入力が存在しないことが証明できる行だけ**を見る。 */
  const i = code.indexOf("set assigned_by = 'deterministic'");
  assert.ok(i > 0, 'the relabel is gone');
  const stmt = code.slice(i, code.indexOf(';', i));
  assert.match(stmt, /l\.assigned_by = 'embedding'/);
  assert.match(stmt, /a\.embedding is null/, 'it must only touch links whose article provably has no embedding');
  /* ⚠ **名札を直す文が、どの Event に属するかを動かしていない**ことを、その文だけを見て
     確かめる。migration の他の場所（merge の機構）は当然 `event_id` を動かす——そこまで
     禁じる検査は、直したい対象ではなく仕組みそのものを禁じてしまう。 */
  assert.ok(!stmt.includes('event_id'), 'the relabel statement is moving articles between events');
  assert.ok(!stmt.includes('status'), 'the relabel statement is changing an article status');
});

/* ══ ⑤ 地点の無い出来事に、地点を持たせない ═══════════════════════════════════════ */
test('⑤ 座標の無い Event はピンを持たない（記事モードは変えない）', () => {
  const src = rd('js/news-events.js');
  assert.match(src, /if \(!subjectLoc\) \{ analysis\.loc = null; analysis\.mapped = false; \}/,
    'an event with no resolved location is still being given a hashed coordinate');
  /* ⚠ 記事モードの `applyPinMode` は 1 ビットも変えていない——擬似座標はあちらの約束である。 */
  const body = codeOnly(rd('js/app-body.js'));
  assert.match(body, /hashLocFromString\('sub:'/, "the article path's behaviour was changed too");
});

/* ══ ⑥ 計器が本番を測れる ═══════════════════════════════════════════════════════ */
test('⑥ 計測器は「走っていない機構を名乗る辺」を数える', () => {
  const s = rd('scripts/news-events-eval.mjs');
  assert.match(s, /走っていない機構を名乗る辺/, 'the integrity line is gone');
  assert.match(s, /embedding_model/, 'it must read whether an embedding actually exists');
  assert.match(s, /--diffs/, 'the differences mode is gone');
  /* ⚠ 計器が UI と違うものを測らない: 要約まで読む（見出しだけだと歩留まりが半分になる）。 */
  assert.match(s, /news_articles\?select=id,source_id,title,description,embedding_model/,
    'the instrument is not fetching the descriptions the UI reads');
});
