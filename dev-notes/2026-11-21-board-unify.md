---
title: ボードと宣言ビューの実装を #1338 の 1 本に統合する(#1293・#1301・#1327 を引き継いで close)
date: 2026-11-21
newsen: The answer-card views and the operable board are now one implementation, linked both ways to the real map and the Chronos clock, with metrics and real-world-object widgets and live partial results.
newsjp: 回答内の画面と操作できるボードの実装が 1 本になり、本体の地図・Chronos と双方向に連動します。見出しの数字・実世界のオブジェクトの部品と、長い仕事の途中成果の表示も使えます。
---

〈依頼〉ボード/宣言ビューの open PR 4 本(#1293・#1301・#1327・#1338)が同じ機能を別方向に書いていた。**正本を #1338 の 1 本にする**。

## 何が何を引き継いだか

| 元 | 行き先 |
|---|---|
| #1293(ボード)・#1301(ui.compose) | #1338 が祖先として取り込み済み。コードは #1338 のもの。close のみ |
| #1338 | **土台**。`board-link.js`(地図クリック→行選択・時間窓・複数窓・evidence)。`time` widget は年単位、地図連動は `attachMap` が `GE.fitBounds` を呼ぶ |
| #1327 固有で移したもの | `js/ui-text-rules.js`(URL/タグ拒否の唯一の写し。`atlas-ui-spec` と `board-spec` が共有)、`metrics` widget、`objects` widget、`IntMapBoard.feed`(途中成果・上限 `MAX_ROWS`・保存時は保持行)、`data.worldObjects`(`atlas-cap-board.js` の `objectRows`)、`data.timeField` の列実在検査 |
| #1327 のうち捨てたもの(二重実装) | `time` widget(ms 時計版。#1338 の年版が正本)、`IntMapGeoEngine.camera` 呼び出し(#1338 の `fitBounds` が同じ仕事)、`board-state` の時計表現(#1338 の `{year, mode}`)、`#board-panel` 単一板前提 |

`objects` widget を持つボードは地図連動を自動で付ける(場所を持つ行を並べる部品なので)。`metrics` は #1338 の `B.vis()`(年の時間窓込み)の上で計算する。

## 検証

- `tests/board-compose-checks.test.mjs`(共有拒否規則・metrics/objects の拒否・worldObjects→行)、`tests/board-compose.spec.js`(#1338 の DOM・`fitBounds` に合わせて書き直し。選択→地図、時計→数字、feed、ビューのカード→同じボード)。
- 旧 dev-notes `2026-11-20-board-ui-compose.md` は #1327 の設計(ms 時計・camera)の記録で、この統合後の実装を述べないため削除した。

## 予算
\`check:perf\` の天井を \`--update\` で引き上げた(async gzip 4771→4811 kB、atlas-cap-runs / atlas-console チャンク、dist.assets)。理由: metrics・objects・feed・worldObjects の移植(board.js と atlas-cap-board.js、ui-text-rules.js)と、#1338 を取り込んだ時点の main 側の増分。能力は削っていない。
\`origin/main\` を取り込み直したあとの再測定で天井をもう一度引き上げた(async raw 14221→14345 kB、gzip→4832 kB、atlas-cap-runs 914 kB、atlas-console 1075 kB)。増分のうち board 由来は metrics・objects・feed・worldObjects の移植分、残りは取り込んだ main 側の変更で、能力は削っていない。

## perf 天井（3 回目の main 取り込み後）
main 側の他 PR の増分と本統合の metrics/objects/feed が重なり、async.raw 14405 kB・atlas-cap-runs 920 kB・dist.assets 21840 kB へ上げた。本統合分は metrics/objects ウィジェットと worldObjects 変換のみで、重複していた時計・地図リンク・カメラ呼び出しは #1338 側へ畳んである。

## dist.total の天井（CI の実測に合わせて手で上げた）
CI の check:perf が dist.total 1550243.8 kB を測り、ローカルの測定（data の取得物が CI と一致しない）より大きかった。--update はローカル値でしか上げないため、CI が報告した値（1550243.8 kB × 1024 バイト）へ天井を直接合わせた。増分の大半は main 側の data 追加で、本統合が data を足したわけではない（足したのは js の metrics/objects/feed のみ）。

## perf 天井（統合知識層の取り込み後）
atlas-cap-runs が 929.5 kB（天井 918.5 kB）。main の統合知識層 (#1280) の能力 1 本が atlas-cap-runs に加わった分で、本統合の metrics/objects/worldObjects 変換と合わせて天井を上げた。

## #1293 が先に main へ入った件と perf 天井（最終）
#1293 の auto-merge を外す前に main へ入り、ボード実装が add/add で衝突した。js/board*.js と atlas-cap-board.js は #1338 側（本統合）を正本に解消し、#1293 のテスト（tests/atlas-workspace-ui-checks.test.mjs）は新実装でも 8 件通るので残した。能力表は 261（ui.compose を含む）。async.raw 14498 kB・async.gzip 4890 kB・atlas-console 1112 kB・dist.assets 21935 kB へ天井を上げた。増分は main 側の他 PR（GIS 網分析・統合知識層）と本統合の metrics/objects/worldObjects 変換の合計。
