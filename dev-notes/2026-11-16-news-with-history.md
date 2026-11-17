---
title: ニュースに歴史を付ける——出来事の詳細に「この土地の過去」（治めた政体・記録上の戦争・国政選挙）。読み手は地点カード・戦争の塗り・選挙レイヤーの既存のもので、出来事の位置が国の代表点なら年表を出さずに理由を述べる
date: 2026-11-16
newsen: News events have "This place's past": who held the event's ground, the recorded wars its state was in and the events there, and its district's national election. An event placed only on a country shows the country's wars and elections instead, and says why.
newsjp: ニュースの出来事に「この土地の過去」を追加。押すと、出来事の地点を治めた政体の年表、記録上の戦争でその国が置かれた陣営とそこで記録された出来事、その地点の選挙区の国政選挙の結果を出します。位置が国の代表点にすぎない出来事は、地点の年表の代わりに国の戦争と選挙を出し、理由を述べます。
---

〈依頼〉改善案「ニュースに歴史を付ける」: ニュースの出来事カードに、その土地の「この場所の歴史」・過去の紛争・国政選挙を添える。
同じ読み手・同じデータを使い写しを作らない／国単位か地点単位かで正直に分ける／記録の無い期間は空白のまま／Atlas からも／
カードの重さと起動時間を増やさない。

利用者の決定（質問で確認）: ①読み込みは**ボタンで**（開くだけでは読まない） ②**国単位の出来事は国の情報だけ**（代表点で年表を
出さない） ③地点単位の出来事は**その選挙区の結果まで**。

## 0. 測った

- 出来事には粒度の欄が無い。最も近いのは代表記事の `subject_type`（`news_articles`）で、束ね方（`_shared/news-cluster.js`）が
  既に `representativeKinds`＝国・第 1 級区分・組織を「代表点しか持たない解決」として持っていた → その表をそのまま読む。
- 出来事の地点（`rep_*`）は代表記事の対象とは限らない。本番の 200 件で「Sydney Airport」「Amman」「Kyiv」の出来事の代表記事が
  `country` 型だった（サーバーは構成記事の地点から最も具体的なものを選ぶ・`_shared/news-ingest.js`）。→ 粒度は代表記事の
  `subject_type` ではなく、**選ばれた地点を名指す構成記事が与える種類**（`placeKind`。食い違う・誰も名指さない＝運用者が動かした
  ときは「述べられていない」）。国単位の出来事の点は首都（Canada→Ottawa）で、国の代表点にすぎない。
- 戦争の記録（`data/wars.json`）は 6 戦争。`control` は交戦国を全部陣営に置く——フランスは朝鮮戦争の国連側。最初の版は
  「この土地に及んだ戦争」と書いていて、パリに朝鮮戦争が「及んだ」ことになった（回帰検査の最初の実行で発覚）。
  → 陣営は**交戦国であったこと**で戦場ではない、と画面と Atlas の説明が述べ、どこで何があったかは日付つきの出来事に言わせる。
  欄の名前も `reached` → `involved`。
- 選挙の polity の `home` を点の絞りに使うと選挙区を落とす: オーストラリアの 330,658 頂点のうち 4,233 が `home` の外。
  → 境界の版ごとの外接箱 `index.boxes` を build が導出し `--check` が照合する（読み手は絞りで偽陰性を出さない）。
- 実データでの答え（`tests/news-with-history-checks.test.mjs`）: パリは WW2 で 1940 年 6 月〜1944 年 8 月に枢軸側（前線の切り分け
  込み）、朝鮮戦争では国連側で出来事 0 件、東京（港区）は衆議院の最新の選挙の東京の小選挙区、大西洋の真ん中は「国が無いので
  戦争に問えない」、日本（国単位）は CShapes の gw 740。

## 1. 作ったもの

- `js/event-past.js`（新規・押下で動的 import）: 粒度の判定 `eventPlace`、3 つの読み手を同時に呼ぶ `readPast`、描画 `pastHtml`、
  Atlas 用 `forAtlas`、カードへの取り付け `mount`。何も新しく決めない。
- `js/war-layer.js` `atPoint`: 塗りの `baseFaction`・`activeFronts`・`cutsFor` を `makeWar` の中から層の範囲へ出して（写しでなく
  1 つの定義を共有）、点の陣営を記録が何かを述べる日だけで問う。扉は `js/war-fronts.js` `IntMapWarFronts.atPoint`。
- `js/elections.js` `atPoint`: 各議院の最新の選挙で点を含む選挙区（`_imPipGeo`）と議席・候補者と得票。「誰が勝ったか」は
  層の吹き出しが持っていた規則を `rowResult` に出して両方が読む（吹き出しの HTML を別モジュールへ渡すと出力の検査
  `output-taint` が拒む——データで渡して出来事の節が `IntMapSafe.html` で描く）。
- `js/place-history.js` `historyAction`・`ensureHistoryCss`: 行の押下と CSS の注入が地点カード・Atlas に 2〜3 か所写されていた
  ので 1 つにし、地点カード・Atlas・出来事の節が同じものを呼ぶ（形式上の削除。役目は `historyAction` / `ensureHistoryCss` が
  引き継ぐ。`tests/hist-product-checks.test.mjs` ⑦ は扉の新しい場所を読むよう更新）。
- `js/news-events.js`: 詳細に節とボタン、Atlas 用に `itemByPublicId`。
- Atlas `news.eventPast`（`js/atlas-cap-news.js`、行は `atlas-caps --write` で生成）。

## 2. 検査

`tests/news-with-history-checks.test.mjs`（実データの CShapes・戦争・選挙ファイルを本物の読み手に通す 4 件）。
文書: `docs/NEWS-EVENTS.md` §18・`PRODUCT.md`・`docs/ELECTIONS.md` §2・`docs/architecture/07-map.md` §7.3f・`docs/FILES.md`。

## 3. 台帳を上げたもの（理由）

- `check:surface`（window 経由の読み）を 1 本ずつ上げた: `window.IntMapWarFronts`・`window.IntMapElections`（どちらも層の
  factory が window に出す扉で、import できる持ち主が無い。`js/event-past.js` で 1 つの accessor にまとめた）、
  `window.IntMapSafe`（`import './safe-html.js'` のあと globalThis から読む、他の module と同じ形）、`window.IntMapLazy`・
  `window.IntMapNewsEvents`（Atlas `news.eventPast` が出来事を引く。`news.story` と同じ経路）、`window._imPipGeo`
  （選挙区の点内判定。地点カードと同じ関数を写さずに使う）。
- `check:perf` の非同期チャンク `place-history`（`historyAction`・`ensureHistoryCss` が地点カードと Atlas から移ってきた分）と
  `war-layer`（`atPoint`）の天井を上げた。どちらも押されたとき・層を点けたときだけ読まれ、起動の集合は増えていない。

## 4. CI で止まっていた検査（この作業の変更とは無関係の、既存の欠陥）

`tests/wave4-atlas-checks.test.mjs` ⑥ が CI の回帰シャードで 1,190 秒止まって落ちた（この PR で 2 回、2026-11-16 に他の 4 本の
branch でも同じ）。原因: ③ と ⑦ が開く `scripts/territory-change.mjs` の harness は、time-borders の sandbox が
`setTimeout: () => 0` を globalThis に入れ、それがファイルの残りに残る（`scripts/lib/import-module.mjs` の globals は残る設計）。
⑥ はページ自身の経路を走らせ、1 段が 16 ms を超えたときだけ `setTimeout` で 1 フレーム譲る（`js/territory-change.js`
`yielder`）。速い機械では 1 度も譲らないので通り、負荷のある runner では譲った先の Promise が永久に解決しなかった。
再現: 読むたびに 20 ms 進む時計を preload すると毎回 ⑥ だけが止まる。直し: ⑥ はファイル冒頭（harness より前）に取っておいた
ページの `setTimeout` で走り、さらに毎回フレームを超える時計で走る（譲る経路を全機械で通る）。stub に戻すと ⑥ は毎回止まる
ことを確かめた。製品のコードは正しい（ブラウザでタイマーが stub されることはない）。
- 非同期の合計（`async.raw` / `async.gzip`）の天井も上げた。この作業が足した非同期チャンクは `event-past`（16.2 kB・ボタンを
  押したときだけ読む）と、上の 2 つのチャンクの増分。起動の集合は増えていない。合計の残りの差は、main 側で天井がまだ記録されて
  いない新しいチャンク（perf-budget が「main's CI records its ceiling after the merge」と述べるもの）の分。
