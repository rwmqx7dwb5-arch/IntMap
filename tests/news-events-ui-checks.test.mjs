/* ============================================================================
 *  IntMap · the Event surface — list, detail, pins, and what an event says
 * ----------------------------------------------------------------------------
 *  js/news-events.js・js/news-claims.js・js/news-brief.js と、ニュースのピン（js/news-feed.js）。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import { LAZY_REGISTRY, LAZY_NAMES } from '../js/lazy-modules.js';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { buildCandidateIndex, candidateEvents, eventsAgree, eventPairCandidates, INDEX, pairScore, headlineReject, parseFeed } from '../supabase/functions/_shared/news-ingest.js';
import { DEFAULTS, pairVerdict, buildIdf } from '../supabase/functions/_shared/news-cluster.js';
import { makeNewsClaims } from '../js/news-claims.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { installGlobals } from './helpers/import-module.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* ════════ #R386 — from tests/r386-checks.test.mjs (8 of its 19 tests) ════════ */
{
/* ============================================================================
 *  R386 — 出来事を利用者に届ける（Phase C / D / E）
 * ----------------------------------------------------------------------------
 *  #R334 が表を敷き、#R351 がパイプラインを本番で回した。それでも **`news_events` は
 *  本番に 892 行あるのに、配信バンドルからそこへ到達する経路が 1 本も無かった**
 *  （#R351 追記の本番検証）。このラウンドが足したのは 3 つ:
 *
 *    C  recall（塊どうしを結ぶ `link` 段）と運用者の Merge/Split/Reassign/undo
 *    D  出来事の一覧・カテゴリ chips・詳細（媒体ごとの相違）・1 出来事 1 ピン・★
 *    E  Atlas の capability と state provider、そして既定の切り替え
 *
 *  ⚠ 実データで測って初めて分かったことが 3 つあり、この検査はそれを固定する:
 *    ① **この鍵は埋め込みモデルに届かない**（実測 2026-08-24: `/v1/models` が 1 件しか
 *       返さず、`text-embedding-3-small` は 403 `model_not_found`）。⇒ `link` 段は
 *       **埋め込みが 1 本も無くても動かなければならない**。
 *    ② **割合だけの推移の検算は、分母が小さいと 1 本の辺で満たされる。** 空撃ちで出た
 *       17 対を人が読むと 15 正 / 2 誤で、誤りはどちらも合致 1〜2 本だった。
 *    ③ **本番の `public.is_admin` は引数を取る。** リポジトリの baseline が宣言する
 *       引数なしの版は本番に存在しない ⇒ migration はそれを呼んではならない。
 * ========================================================================== */
   /* (#R394) 相違の規則は表示の層から出た */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

/* 記事 1 本ぶんの形。地点は `subject_*`、種類は `subject_type`（DB の列名と同じ）。 */
let _id = 0;
const art = (title, o = {}) => ({
  id: ++_id, title,
  title_fingerprint: o.fp || null,
  published_at: o.at || '2026-08-24T09:00:00Z',
  subject_lng: o.lng, subject_lat: o.lat, subject_type: o.kind,
  source_family: o.fam || ('fam' + _id),
  source_id: o.src || o.fam || ('src' + _id),
  description: o.desc || '',
});

/* ══ ⑥ 2 つのスイッチは別物である ═════════════════════════════════════════════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R386 ⑥ NEWS_EVENT_MODE と USE_SERVER_NEWS は別のスイッチで、後者は今も false', () => {
  const body = rd('js/app-body.js');
  assert.match(body, /const USE_SERVER_NEWS\s*=\s*false/,
    'the #R40 current_news path stays off — docs/NEWS-EVENTS.md §12 forbids “flip it and call it done”');
  const m = body.match(/const NEWS_EVENT_MODE\s*=\s*(true|false)/);
  assert.ok(m, 'the event switch must exist and be greppable — the privacy-policy gate reads it');
  /* 一覧が実際に何であるかは、旗ではなく中身に訊く。 */
  assert.match(body, /function newsSurfaceMode\(\)/);
  assert.match(codeOnly(body), /_event/, 'the surface predicate must look at the items, not at the flag');
});

/* ══ ⑦ 能力表の lazy 列が実在する module を名指している（#R347 の 5 度目を防ぐ） ══ */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R386 ⑦ news.category が名指す lazy module は loader に実在する', async () => {
  const row = (capabilityEntry('news.category') || {}).row;   /* (atlas-capability-modules) the row is declared in its entry */
  assert.ok(row, 'the capability row must exist');
  /* 11 番目の引用符付きの語が lazy 列。(#R801) 最後の語ではない——任意の 12 番目 `ingests` が続く。 */
  const quoted = row.match(/'[^']*'/g) || [];
  const lazy = quoted.length > 10 ? quoted[10].replace(/'/g, '') : '';
  assert.equal(lazy, 'newsEvents');
  const loader = rd('js/lazy-modules.js');
  assert.equal(LAZY_REGISTRY["newsEvents"].publishes, 'IntMapNewsEvents', 'the registry must name what it publishes');   /* (#R798) */
  assert.ok(loader.includes("import('./news-events.js')"), 'the registry entry must have a LITERAL import');
  /* (module-graph) the factory registry is gone: mount is handed the namespace its own import() resolved to.
     So it is RUN — with a stand-in namespace, then the real one load() resolves — instead of read for a spelling. */
  const entry = LAZY_REGISTRY.newsEvents;
  const win = {};
  installGlobals({ window: win });
  const HOST = { lang: 'en' }, api = {};
  let got = null;
  entry.mount(HOST, { newsEvents: (h) => { got = h; return api; } });
  assert.ok(got === HOST && win.IntMapNewsEvents === api, 'mount must run the factory with the host and publish what it returns');
  assert.equal(typeof (await entry.load()).newsEvents, 'function', 'the module the registry loads must export the factory mount runs');
  /* research.events も同じ module に依存するようになった（サーバーの Event を読むため）。 */
  const ev = (capabilityEntry('research.events') || {}).row;
  assert.ok(ev && ev.includes("'newsEvents'"), 'research.events now needs the events module at execution');
});

/* ══ ⑧ 出来事の UI は起動経路に入らない ═══════════════════════════════════════════ */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R386 ⑧ js/news-events.js は遅延取得だけから到達される', () => {
  const main = rd('src/main.js');
  assert.ok(!/news-events\.js/.test(main), 'the entry must not import it');
  for (const f of ['js/app-body.js', 'js/news-feed.js', 'js/news-ui.js']) {
    assert.ok(!/from '\.\/news-events\.js'/.test(rd(f)) && !/import\('\.\/news-events\.js'\)/.test(rd(f)),
      f + ' must reach it through IntMapLazy, not by importing it');
  }
  assert.match(rd('js/news-feed.js'), /IntMapLazy\.need\('newsEvents'\)/);
});

/* ══ ⑨ 「同じ出来事か」を決める場所は 1 つのまま ═══════════════════════════════════ */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R386 ⑨ js/news-events.js に第二のクラスタリング実装は無い', () => {
  const code = codeOnly(rd('js/news-events.js'));
  for (const banned of ['pairVerdict', 'jaccard', 'transitivity', 'geoClass', 'clusterArticles', 'countIndependentSources']) {
    assert.ok(!code.includes(banned), 'the presentation layer must not re-implement ' + banned);
  }
  /* 束ねられた結果を**読む**だけであることが、列の指定に出ている。 */
  assert.ok(rd('js/news-events.js').includes('news_event_articles('));
});

/* ⚠ (tests-by-topic) '#R386 ⑩ Atlas の research.events は、出来事モードでは束ね直さない' is FOLDED into
   '#R340 ⑤ …' in tests/news-cluster-checks.test.mjs. It asserted, on the same `case 'events':` of
   js/atlas-console.js, exactly what #R340 ⑤ asserts in its (#R386) lines: the case branches on
   `_evMode`, the grouper call still exists, and the mode test comes BEFORE `groupNewsEvents(`. */

/* ══ ⑪ 運用コンソールは RPC しか呼ばない ═════════════════════════════════════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R386 ⑪ admin.html は Event の表を直接 UPDATE せず、4 つの RPC を通す', () => {
  const h = rd('admin.html');
  for (const fn of ['news_event_merge', 'news_event_reassign', 'news_event_update_meta', 'news_event_undo']) {
    assert.ok(h.includes("sb.rpc('" + fn + "'") || h.includes("nevRpc('" + fn + "'"), fn + ' must be called');
  }
  /* Event 側の表を直接書かない。⚠ 1 操作が 4 つの表に分かれるので、途中で失敗すると
     どの表も嘘をつく。 */
  const code = codeOnly(h);
  assert.ok(!/from\('news_events'\)[\s\S]{0,120}\.(update|insert|delete|upsert)\(/.test(code));
  assert.ok(!/from\('news_event_articles'\)[\s\S]{0,120}\.(update|insert|delete|upsert)\(/.test(code));
  assert.ok(!/from\('news_articles'\)[\s\S]{0,120}\.(update|insert|delete|upsert)\(/.test(code));
});

/* ══ ⑫ 4 つの非位置言語に、この画面の文字列が入っている ═══════════════════════════
   ⚠ `pick()` は 5 つ目までしか位置引数を見ない。9 個並べても fr/ko/zh/zh-hans は
     **英語のまま出荷される**（#R353 が測った形）。 */
test('#R386 ⑫ fr / ko / zh / zh-hans の inline 表に、出来事画面の文字列がある', () => {
  const probes = ['Where outlets differ', 'Coverage', 'How this event was assembled', '{n} sources', 'First reported'];
  for (const f of ['ui.fr.js', 'ui.ko.js', 'ui.zh.js', 'ui.zh-hans.js']) {
    const s = rd('js/locales/' + f);
    for (const p of probes) {
      assert.ok(s.includes("'" + p + "'"), f + ' has no entry for ' + JSON.stringify(p));
    }
  }
  /* そして英語のままの写しになっていない。 */
  const fr = rd('js/locales/ui.fr.js');
  const m = fr.match(/'Where outlets differ':\s*'([^']+)'/);
  assert.ok(m && m[1] !== 'Where outlets differ', 'fr must be a translation, not a copy of the English');
});

/* ══ ⑬ 「相違」は媒体をまたいだときだけ ═══════════════════════════════════════════
   同じ媒体の速報 → 続報で数が変わるのは**更新**であって、媒体間の相違ではない。 */
test('#R386 ⑬ 同じ系列の中の数の変化は「相違」と呼ばない', () => {
  /* ⚠ (#R394) **規則はもう js/news-events.js の中には無い。** そこに置いた結果、
     ブラウザの外から誰も呼べず、歩留まりも精度も測れなかった——実測してみると
     本番で 2 件出ており、うち 1 件は誤りだった。いまは js/news-claims.js の 1 本で、
     この検査も**規則そのものを呼んで**確かめる（綴りを grep するのではなく）。 */
  const C = makeNewsClaims();
  const same = C.differences([
    { title: 'Landslide at a landfill kills 3, government says', description: '', source: 'WJLA', family: 'sinclair' },
    { title: 'Landslide at a landfill kills 5, officials say', description: '', source: 'KOMO', family: 'sinclair' },
  ]);
  assert.equal(same.length, 0, 'one voice updating its own figure is not a disagreement');
  /* (#R394 ③b, folded) the same rule on #R394's own fixture — the country named in both headlines */
  assert.equal(C.differences([
    { title: 'Landslide at Guinea landfill kills 3, government says', description: '', source: 'WJLA', family: 'sinclair' },
    { title: 'Landslide at Guinea landfill kills 5, officials say', description: '', source: 'KOMO', family: 'sinclair' },
  ]).length, 0, 'a change of figure inside one family is an update (#R394 ③b)');


  const cross = C.differences([
    { title: 'Landslide at a landfill kills 3, government says', description: '', source: 'BBC', family: 'bbc' },
    { title: 'Landslide at a landfill kills 5, officials say', description: '', source: 'AP News', family: 'apnews' },
  ]);
  assert.equal(cross.length, 1, 'two different owners stating two different values IS a disagreement');

  /* 数量の取り出しは「原文に書いてある形」だけ（推定しない）。 */
  const rule = rd('js/news-claims.js');
  assert.ok(rule.includes('const KINDS'));
  assert.ok(!/estimate|guess|infer/i.test(codeOnly(rule).replace(/[A-Za-z]*Info/g, '')),
    'the differences pass must not estimate anything');
  /* 表示の層は規則を持たない。 */
  assert.ok(!codeOnly(rd('js/news-events.js')).includes('famOfValue'),
    'the view grew its own copy of the rule again');
});
}

/* ════════ #R394 — from tests/r394-checks.test.mjs (5 of its 12 tests) ════════ */
{
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
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

const DESC = 'a long enough description with plenty of words in it so the short-title gate does not fire';

/* ══ ③ 「値が違う」は「食い違っている」ではない ═══════════════════════════════════ */
test('#R394 ③ 同じ量についての別々の説明だけを相違と呼ぶ（本番の 2 例をそのまま）', () => {
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

/* ⚠ (tests-by-topic) '#R394 ③b 同じ系列の中の数の変化は相違ではない（更新である）' is FOLDED into
   '#R386 ⑬ 同じ系列の中の数の変化は「相違」と呼ばない' above — the same rule called on the same shape
   (one ownership family, two figures). Its own fixture (the Guinea landfill, with the country named)
   is asserted there too, so nothing it checked is left unchecked. */

test('#R394 ③d 死者数は「動詞が先」の形も読む——そして年齢を死者数と読まない', () => {
  const C = makeNewsClaims();
  /* ⚠⚠⚠ 英語のニュースは死者数を「動詞が先」で書く。実測 (2026-08-24・本番の active 1,367 本):
     «kills 30» / «killed 16» / «kill at least 10» の形が 24 件、«30 killed» は 4 件。
     #R386 は後者だけを見ていたので、災害と紛争の数量をほとんど読めていなかった
     （実際に発火していたのは `money` だけだった）。 */
  const shape = (t) => C.quantities(t).map((q) => q.kind + ':' + q.value);
  assert.deepEqual(shape('Guinea rubbish landfill collapse kills 30'), ['dead:30']);
  assert.deepEqual(shape('Ukrainian drones kill at least 10, hit warehouse'), ['dead:10']);
  assert.deepEqual(shape('Bus crash killed 16 in Peru'), ['dead:16']);
  assert.deepEqual(shape('A moderate earthquake shakes Japan, injuring more than 30 people'), ['injured:30']);
  assert.deepEqual(shape('Explosion wounds 12 in market'), ['injured:12']);
  /* 名詞が先の形を落としていない（広げたのであって、差し替えたのではない）。 */
  assert.deepEqual(shape('37 injured as magnitude 5.9 earthquake strikes eastern Japan'), ['injured:37']);
  /* ⚠⚠ 年齢を死者数と読まない。«Girl, 17, killed» の 17 は年齢で、#R386 の綴りは
     これを死者数として取り出していた（当時の 4 件中 1 件）。 */
  assert.deepEqual(shape('Girl, 17, killed in Swedish sword attack, police say'), []);
  assert.deepEqual(shape('Israel kills 4-year-old child in strike'), []);
  /* そして、年齢と死者数が同じ見出しにいても、拾うのは死者数だけである。 */
  assert.deepEqual(shape('Israel kills 3 Palestinians, including four-year-old child'), ['dead:3']);
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R394 ③c 規則は 1 本で、UI も計測器も同じものを呼ぶ', () => {
  /* ⚠ #R386 はこの規則を js/news-events.js の factory の奥に書いた——**ブラウザの外から
     誰も呼べない**ので、歩留まりも精度も測れなかった（#R340 と同じ形）。 */
  const view = codeOnly(rd('js/news-events.js'));
  assert.match(view, /makeNewsClaims\(\)/, 'the view must call the shared rule');
  assert.ok(!/NUM_KINDS\s*=/.test(view), 'the view grew its own copy of the extractor again');
  assert.ok(!/sameQuantityRatio/.test(view), 'the view grew its own threshold');
  const evalr = rd('scripts/news-events-eval.mjs');
  assert.match(evalr, /from '\.\.\/js\/news-claims\.js'/, 'the instrument must measure the SAME rule');
});

/* ══ ⑤ 地点の無い出来事に、地点を持たせない ═══════════════════════════════════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R394 ⑤ 座標の無い Event はピンを持たない（記事モードは変えない）', () => {
  const src = rd('js/news-events.js');
  assert.match(src, /if \(!subjectLoc\) \{ analysis\.loc = null; analysis\.mapped = false; \}/,
    'an event with no resolved location is still being given a hashed coordinate');
  /* ⚠ 記事モードの `applyPinMode` は 1 ビットも変えていない——擬似座標はあちらの約束である。 */
  const body = codeOnly(rd('js/app-body.js'));
  assert.match(body, /hashLocFromString\('sub:'/, "the article path's behaviour was changed too");
});
}

/* ════════ #R405 — from tests/r405-checks.test.mjs (8 of its 16 tests) ════════ */
{
/* ============================================================================
 *  R405 — 本文は 4 つの綴りで届くのに、2 つしか読んでいなかった
 * ----------------------------------------------------------------------------
 *  #R351 の `parseFeed()` は `<description>` と `<summary>` だけを本文として読み、
 *  **RSS 2.0 で本文を運ぶ最大の口である `<content:encoded>` と Atom の `<content>` を
 *  リポジトリ全体で一度も解析していなかった**（実測 2026-08-24: どちらの綴りも 0 か所）。
 *  読めない綴りで届いた記事は「要約を持たない記事」として保存される——分類にも UI にも
 *  見出ししか残らないが、**フィードは 200 を返し、item も返っている**ので、どの計器も赤に
 *  ならない。
 *
 *  ⚠ 実測 2026-08-24（seed の 33 本 ＋ Bloomberg の直接 RSS 5 本＝38 本を実際に取得）:
 *    · `content:encoded` を今日出しているのは **NPR の 2 本だけ**（20 item 中 13 item で
 *      本文が伸びた）。The Guardian / BBC / NYT の 3 本は 1 つも出していない。
 *    · つまりこの検査が守るのは「今日の取りこぼし」ではなく、**明日どれかのフィードが
 *      綴りを変えた日に、本文が黙って消えないこと**である。
 *
 *  ⚠⚠ そして本文が 0 文字だった本当の理由は綴りではなく**経路**だった。Bloomberg は
 *    `google_news_site` 経由で集めており、Google はこの経路の `<description>` に
 *    **リンクの一覧**を入れる。実測: その URL は 100 item を返し、40 文字以上の本文を持つ
 *    item は **0 本**（本番の Bloomberg 記事 62 本がすべて本文 0 文字）。⇒ migration
 *    `20260824220000_r405_news_feeds.sql` が媒体自身の RSS 5 本へ移し、Google 経由を止める。
 *
 *  ⚠⚠ CNN の direct_rss は 200 と 29 item を返すが**最新の記事が 1,071 日前**である。
 *    これは「壊れている」とは違い、止めるかどうかは別の判断なので、**enabled は触らない**。
 *    ⑥ はその約束のほうを見張る——次のラウンドが「古いから落とす」を静かに足さないため。
 * ==========================================================================*/
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

const MIGRATION = 'supabase/migrations/20260824220000_r405_news_feeds.sql';

/* 記事として成立する最低限（parseFeed は link と title の無い item を落とす）。 */
const HEAD = '<title>Tariffs take effect as the two governments break off talks</title>' +
             '<link>https://x.test/a</link><pubDate>Mon, 24 Aug 2026 08:00:00 GMT</pubDate>';
const rss = (inner) => '<rss><channel><item>' + HEAD + inner + '</item></channel></rss>';

/* ─────────────────────────────────────────────────────────────────────────────
 *  migration を読む道具。⚠ `--` の除去は**文字列リテラルの中では止める**——
 *  除去する側が壊れると、以下の検査は「何も書いていない SQL」を見て静かに緑になる。
 * ────────────────────────────────────────────────────────────────────────── */
/* (test-code-only-one) the shared reader's SQL mode: `--` AND block comments, stopping at '…' —
   the scanner that stood here knew only `--`, and the cron.job check below had to strip the block
   comments a second time with the JS regex to stop answering its own explanation. */
const stripSqlComments = (sql) => codeOnly(sql, { lang: 'sql' });
function statements(sql) {
  const src = stripSqlComments(sql);
  const out = [];
  let cur = '', inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      cur += c;
      if (c === "'") { if (src[i + 1] === "'") cur += src[++i]; else inStr = false; }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** UPDATE の SET 句だけ（WHERE の述語を「書き換えている列」と読み違えないため）。 */
function setClause(stmt) {
  const m = stmt.match(/\bset\b([\s\S]*?)\bwhere\b/i);
  return m ? m[1] : stmt.replace(/^[\s\S]*?\bset\b/i, '');
}


/* ============================================================================
 *  R405 (続き) — 出来事の中身が、IntMap の中で読めること
 * ----------------------------------------------------------------------------
 *  #R386 が出荷した Event UI は、構成記事の `description` を**取ってきておきながら
 *  1 文字も出していなかった**（`desc: ''` が固定・読者は `differences()` ただ 1 人で
 *  本番 1,069 Event 中 2 件しか発火しない）。⇒ 外部記事を開かない限り、IntMap の中では
 *  何が起きたか分からない。
 *
 *  ⚠ 下の検査は「綴りが在るか」ではなく**規則が実際にそう振る舞うか**を見る。
 *    `js/news-brief.js` は純粋なモジュールなので、Node から本物の入力を食わせられる。
 * ==========================================================================*/

const { makeNewsClaims } = await import('../js/news-claims.js');
const { makeNewsBrief } = await import('../js/news-brief.js');
const B = makeNewsBrief(makeNewsClaims());

const m = (o) => ({
  id: o.id || 1, title: o.title || '', description: o.description || '', url: o.url || '',
  sourceId: o.sourceId || 'x', sourceName: o.sourceName || 'X', family: o.family || o.sourceId || 'x',
  publishedAt: o.publishedAt || '2026-08-24T00:00:00Z',
});

/* ── ⑦ 上流の定型を落とし、原文の文だけを残す ────────────────────────────── */
test('#R405 ⑦ the boilerplate measured in production is stripped, and truncated tails are dropped', () => {
  /* 実測 109 本: The Guardian の末尾。
     ⚠⚠⚠ **短い定型で試すな。** 最初に書いた fixture は «… review. Continue reading...» で、
       TAIL を丸ごと外しても緑のままだった——「Continue reading...」は 18 字なので
       `minSentence` の 40 字に届かず、**長さフィルタのほうが落としていた**。つまりこの検査は
       TAIL を一度も試していなかった（変異試験で実測）。⇒ 40 字を超える定型で試し、
       本数だけでなく**中身**も見る。 */
  const g = B.sentences('Ministers agreed the new limit on Tuesday after a two-year review. Continue reading our full coverage of the bill and what happens next in parliament.');
  assert.equal(g.length, 1, '末尾の配信の宣伝が文として残っている: ' + JSON.stringify(g));
  assert.ok(g.every((s) => !/Continue reading/.test(s)), '「Continue reading」を含む文を採っている');
  const post = B.sentences('The council approved the plan on Monday evening after four hours of debate. The post Council approves the riverside plan appeared first on Example News and was filed by our local government correspondent.');
  assert.ok(post.every((s) => !/appeared first/.test(s)), '「The post … appeared first」の定型を採っている: ' + JSON.stringify(post));

  /* 実測 85 本: Yonhap / AFP 型のデートライン。 */
  const y = B.sentences('SEOUL, Aug. 24 (Yonhap) -- The prime minister ordered a review of every open case.');
  assert.equal(y.length, 1);
  assert.ok(y[0].startsWith('The prime minister'), 'デートラインが剥がれていない: ' + y[0]);

  /* 実測 89 本: 末尾が切れているもの。完全な文だけを採る。 */
  const t = B.sentences('The court sentenced both defendants on Monday morning in Seoul. The judge said the pair had planned the attack for weeks in ad');
  assert.equal(t.length, 1, '切れている最後の断片を文として採っている');

  /* 略語で切らない。 */
  const a = B.sentences('The U.S. Treasury said the sanctions would take effect on Sept. 1 without further notice.');
  assert.equal(a.length, 1, 'U.S. / Sept. で文を割ってしまっている: ' + JSON.stringify(a));
});

/* ── ⑧ 1 系列 1 文 ────────────────────────────────────────────────────────
   同じ通信社の速報を 3 本並べると「3 媒体が報じた」に見える。 */
test('#R405 ⑧ one sentence per ownership group, two only when a single group is all there is', () => {
  const wire = [
    m({ id: 1, sourceId: 'a1', sourceName: 'A1', family: 'agency', description: 'The first bulletin said the bridge had collapsed at dawn on Tuesday. A second span fell an hour later according to the ministry.' }),
    m({ id: 2, sourceId: 'a2', sourceName: 'A2', family: 'agency', description: 'Rescue teams reached the eastern bank shortly before midday on Tuesday. Divers were still searching the channel after nightfall.' }),
  ];
  const solo = B.gist(wire);
  assert.equal(new Set(solo.map((s) => s.family)).size, 1);
  assert.equal(solo.length, 2, '単独系列のときは同じ記事から 2 文まで採るはず');

  const two = wire.concat([m({ id: 3, sourceId: 'b', sourceName: 'B', family: 'other', description: 'The regional governor declared a state of emergency across the whole province on Tuesday evening.' })]);
  const mixed = B.gist(two);
  const perFam = {};
  for (const s of mixed) perFam[s.family] = (perFam[s.family] || 0) + 1;
  assert.ok(Object.values(perFam).every((n) => n === 1), '複数系列あるのに 1 系列から 2 文採っている: ' + JSON.stringify(perFam));
});

/* ── ⑨ 同じ配信原稿を「2 媒体が報じた」に見せない ─────────────────────────
   ⚠ 実測 526 組のうち c>=0.9 は 1 組だけ。0.8 帯には**落としてはいけない**ものが並ぶ。 */
test('#R405 ⑨ syndicated copy is collapsed, and independent reporting at 0.8 is not', () => {
  /* 本物の重複（実測 c=0.957・違いは英米綴りと U+2060 だけ）。 */
  const dupe = [
    m({ id: 1, sourceId: 'g', sourceName: 'G', family: 'g', description: 'The bill would require social media platforms to take reasonable steps to verify users\u2019 ages, including by utilising existing account information and facial technology.' }),
    m({ id: 2, sourceId: 'j', sourceName: 'J', family: 'j', description: 'The bill would require social media platforms to take reasonable steps to verify users\u0027 ages, including by utilizing existing account information and facial technology.' }),
  ];
  const d = B.build(dupe);
  assert.equal(d.gist.length, 1, '同じ配信原稿が 2 文並んでいる');
  assert.equal(d.syndicated, 1, '落とした本数を数えていない');

  /* ⚠⚠⚠ **落としてはいけない側は「短い文 ⊂ 長い文」の形で来る。** 実測 526 組で c が
       0.8 を超えた 3 組は全部これだった（NPR 79 字「米が 50% の関税」⊂ France 24 133 字
       「カナダが報復関税」＝**別の事実**）。だから重複の条件は c だけでなく**長さの比 ≥ 0.6**
       を併せて要求している。
     ⚠ 最初に書いた fixture は包含 0.60 しか無く、その 0.8 帯を一度も踏んでいなかった
       ——`dupeLenRatio` を 0 にしても緑のままだった（変異試験で実測）。⇒ 包含が **1.0** に
       なる対で試し、長さの比だけが両者を分けている状態を作る。 */
  const shortText = 'The government imposed 50 percent tariffs on Canadian steel and aluminium exports.';
  const longText = 'Canada announced sweeping retaliatory measures against Washington on Tuesday evening after the government imposed 50 percent tariffs on Canadian steel and aluminium exports, the prime minister said.';
  const wordsOf = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1));
  const WA = wordsOf(shortText); const WB = wordsOf(longText);
  const contain = [...WA].filter((w) => WB.has(w)).length / Math.min(WA.size, WB.size);
  assert.ok(contain >= 0.9, 'fixture が意図した帯に無い（包含 ' + contain.toFixed(2) + '）— この検査は何も守っていない');
  const indep = [
    m({ id: 1, sourceId: 'n', sourceName: 'N', family: 'n', description: shortText }),
    m({ id: 2, sourceId: 'f', sourceName: 'F', family: 'f', description: longText }),
  ];
  const i = B.build(indep);
  assert.equal(i.gist.length, 2, '語がすべて重なっていても長さが倍違うものを同一配信として捨てている');
  assert.equal(i.syndicated, 0);
});

/* ── ⑩ 「読めない」を「読み込み失敗」に見せない ───────────────────────────
   実測 48.7% の Event が本文を 1 文字も持たない。 */
test('#R405 ⑩ status separates "no text" from "text but no sentences" from "figures only"', () => {
  const none = B.build([m({ id: 1, title: 'Rangers 1B leaves game with wrist contusion', description: '' })]);
  assert.equal(none.status, 'none');
  assert.equal(none.reason, 'no_text', '上流が配っていないのか、在るが使えないのかを区別していない');

  const unusable = B.build([m({ id: 1, title: 'Some headline', description: 'Read more' })]);
  assert.equal(unusable.reason, 'unusable_text');

  /* ⚠ 実測で見つけた不整合: 本文は無いが**見出しに数量がある**。ここで none を返すと、
     UI は「見出しだけです」と言った下に金額を出す。 */
  const facts = B.build([
    m({ id: 1, title: 'Vietnam approves additional $3 billion spending for China rail link', description: '', sourceId: 'r', family: 'r', sourceName: 'R' }),
    m({ id: 2, title: 'Vietnam clears $3 billion more for the China rail link', description: '', sourceId: 'b', family: 'b', sourceName: 'B' }),
  ]);
  assert.equal(facts.status, 'facts', '文が無くても数量が読めるときに none を返している');
  assert.ok(facts.figures.length >= 1);
  assert.equal(facts.agreements.length, 1, '別々の系列が同じ値を言っているのに一致として出していない');
});

/* ── ⑪ 「最新で更新された点」は「最後に届いた記事」ではない ───────────── */
test('#R405 ⑪ the update section needs a real gap and something actually new', () => {
  const base = { description: 'A landslide at a waste site in the capital buried several homes before dawn.', sourceId: 'a', family: 'a', sourceName: 'A' };
  /* 同じ分に届いた 2 本目は「更新」ではない。 */
  const same = B.build([
    m({ id: 1, ...base, publishedAt: '2026-08-24T01:00:00Z' }),
    m({ id: 2, ...base, sourceId: 'b', family: 'b', sourceName: 'B', publishedAt: '2026-08-24T01:05:00Z' }),
  ]);
  assert.equal(same.latest, null, '5 分後の転載を「更新」と呼んでいる');

  /* 1 時間以上あとに、初めて出た数量を持つ記事。 */
  const upd = B.build([
    m({ id: 1, ...base, publishedAt: '2026-08-24T01:00:00Z' }),
    m({ id: 2, sourceId: 'c', family: 'c', sourceName: 'C', publishedAt: '2026-08-24T05:00:00Z', description: 'The government said the collapse killed 30 people and that the search was continuing.' }),
  ]);
  assert.ok(upd.latest, '4 時間後の続報を「更新」として出していない');
  assert.equal(upd.latest.source, 'C');
  assert.ok(upd.latest.figures.some((f) => f.kind === 'dead' && f.value === 30), '続報で初めて出た数量を拾っていない');
});

/* ── ⑫ 数量は「食い違ったとき」だけでなく常に出す ─────────────────────────
   ⚠ #R386 の表示規則では本番 1,211 Event 中 2 件しか数字が出なかった。 */
test('#R405 ⑫ figures are surfaced even when the outlets agree', () => {
  const one = B.build([m({ id: 1, title: 'Blast kills 12 at market', description: 'The explosion killed 12 people and wounded 40 others in the market district on Sunday.' })]);
  assert.ok(one.figures.some((f) => f.kind === 'dead' && f.value === 12), '死者数を出していない');
  assert.ok(one.figures.some((f) => f.kind === 'injured' && f.value === 40), '負傷者数を出していない');
  assert.equal(one.differences.length, 0, '1 媒体しかないのに「相違」を主張している');
});

/* ── ⑬ 規則は表示の層に無く、ブラウザの外から測れる ─────────────────────── */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R405 ⑬ the rules live in a pure module and the measurement instrument calls the same one', () => {
  const brief = rd('js/news-brief.js');
  assert.doesNotMatch(brief, /\bdocument\b|\bwindow\b|HOST\./, 'js/news-brief.js が DOM か HOST に触っている（#R386 と同じ穴）');
  const ui = rd('js/news-events.js');
  assert.match(ui, /import \{ makeNewsBrief \} from '\.\/news-brief\.js'/, 'UI が規則を自前で持っている');
  const evalScript = rd('scripts/news-events-eval.mjs');
  assert.match(evalScript, /import \{ makeNewsBrief \} from '\.\.\/js\/news-brief\.js'/, '測定器が UI と別の実装を測っている');
  assert.match(evalScript, /--brief/, '--brief で測れると書いてあるのに実装が無い');
});

/* ── ⑮ クライアントは、いま画面に無い媒体を引用した統合文を出さない ─────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R405 ⑮ a stored summary whose cited outlet is no longer a member is not shown', () => {
  const ui = rd('js/news-events.js');
  assert.match(ui, /if \(!s \|\| typeof s\.text !== 'string' \|\| !here\.has\(s\.outlet\)\) return null;/,
    '引用元がいまの構成記事に在るかを確かめずに統合文を出している');
  /* 日本語訳の読み出しは外れている。 */
  assert.doesNotMatch(ui, /from\('news_event_i18n'\)/, 'ニュースは英語と決めたのに ja の読み出しが残っている');
  /* カードの「記事を読む」は Event 側だけで外す（記事モードは触らない）。 */
  assert.match(ui, /const read = foot\.querySelector\('\.btn-read'\);/, 'Event カードから「記事を読む」を外していない');
  const list = rd('js/news-ui.js');
  assert.match(list, /btn-read/, '記事モードのカードからも「記事を読む」が消えている');
  /* ⚠⚠⚠ **実測で踏んだ罠（2026-08-24）。** `decorate()` はカードの配線より**前**に走るので、
     そこで外した要素を後段が無防備に触ると **null に代入して TypeError** になり、
     `appendNewsBatch` の forEach ごと落ちて **News が丸ごと記事フィードへ落ちる**。画面には
     記事が 30 件並び、コンソールに 1 行出るだけで、**ソースの形を見る門は全部緑**だった
     （この直上の assert も緑のまま）——「外す行が在る」は「外したあとも動く」ではない。
     ⚠ ブラウザ側の証拠は `tests/r405.spec.js` ①。ここはその静的な裏取りである。 */
  assert.doesNotMatch(list, /card\.querySelector\('\.btn-read'\)\.onclick/,
    'decorate() が外しうる要素に、取れた確認なしで onclick を代入している');
});
}

/* ════════ #R416 — from tests/r416-checks.test.mjs ════════ */
{
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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
  /* ⚠ (tests-by-topic) EVALUATED: the shipped builder is run on an Event item and on a plain article,
     and the feature it RETURNS is asked for the identity — instead of the function's text being
     searched for `ev:`, `evId:` … and the ternary's spelling. */
  const win = { IntMapMapTypography: { bandText: (t) => 'band:' + t } };
  const newsFeatureOf = new Function('window', m[0] + '\nreturn newsFeatureOf;')(win);
  const analysis = { loc: [139.7, 35.7], mapped: true, ptype: 'city', name: 'Tokyo' };
  const ev = newsFeatureOf({ title: 'Quake felt in Tokyo', analysis, publisher: 'NHK', link: 'https://x.test/a', pubDate: 'd',
    _event: { publicId: 'r416evt', sourceCount: 4, articleCount: 7, category: 'disasters' } });
  const p = ev.properties;
  assert.deepEqual([p.ev, p.evId, p.evSources, p.evArticles, p.evCat], ['1', 'r416evt', 4, 7, 'disasters'],
    'newsFeatureOf must put the event identity on the feature');
  assert.equal(p.short, 'band:Quake felt in Tokyo', 'and the band text comes from the one shared rule (②)');
  const plain = newsFeatureOf({ title: 'An article', analysis, publisher: 'NHK', link: 'https://x.test/b', pubDate: 'd' }).properties;
  /* ⚠ 文字列であること。`false` は MapLibre の `match` で「欠けている」と区別できない。 */
  assert.equal(plain.ev, '', "`ev` must be the string '1'/'' — a boolean is indistinguishable from a missing property in a style expression");
  assert.equal(typeof p.ev, 'string');
  assert.equal(newsFeatureOf({ title: 'x', analysis: {} }), null, 'an item with no location is no pin at all');
});

/* ── ④ ピンの行き先は出来事の詳細 ────────────────────────────────────────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
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
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R416 ⑤ the Subject/Publisher pin mode is gone, in code and in markup', () => {
  const codeNeedles = [
    /getElementById\('pinmode-/,
    /newsPinMode\s*=/,
    /newsPinMode\s*===/,
    /HOST\.newsPinMode/,
    /clickId\('pinmode-/,
    /cfg\.by\s*===\s*'publisher'/,
  ];
  const files = { 'js/app-body.js': body, 'js/news-ui.js': ui, 'js/atlas-console.js': (rd('js/atlas-console.js') + '\n' + capsSource()), 'js/widget-defs-map.js': rd('js/widget-defs-map.js') };
  for (const [name, src] of Object.entries(files)) {
    for (const re of codeNeedles) {
      assert.ok(!re.test(src), `${name} still wires the removed pin mode: ${re}`);
    }
  }
  assert.ok(!/id="pinmode-/.test(html), 'index.html must not carry the pin-mode buttons');
  assert.ok(!/news-pinmode-seg/.test(html), 'index.html must not carry the pin-mode segment');
});

/* ── ⑥ 上の行は 1 本で、「All」は 1 つの意味しか持たない ─────────────────── */
/* 綴りのまま: 主張が CSS / HTML の規則・markup の存在で、それが当たるか（計算済みスタイル）はブラウザにしか無い */
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
}
