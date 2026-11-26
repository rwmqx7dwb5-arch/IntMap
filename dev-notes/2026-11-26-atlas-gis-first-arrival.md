---
title: 地理データ検索を先着採用にし、画像添付ターンを通常の GIS・調査経路へ繋いだ
date: 2026-11-26
newsen: Atlas can start an analysis from the first elevation or imagery dataset that was actually read and checked, without waiting for slow catalogues, and an attached image can now lead into GIS and web research in the same turn.
newsjp: Atlas が、遅いカタログの応答を待たず、実際に読んで確認できた最初の標高・衛星データから分析を始められるようになり、画像を添付した依頼もそのまま GIS・Web 調査へ続けられるようになりました。
---

〈依頼〉Atlas の地理分析で、計算できるデータを揃えるまでの待ち（11/20 実測: 全カタログ横断 16.7 秒、NASA だけで 16.0 秒）と、画像起点の分析が GIS に繋がらない問題。

## 1. 先着採用（`js/gis-remote.js` `search`）
- `search` に `until:"ready"`（＋`bounds`・`width`・`height`）。カタログが答えるたびに、そこまでに届いた記録で検索をやり直し、**窓を覆うと述べ（解像度を問われたなら、述べた解像度が条件を外れていない）る STAC の候補を、`acquire` で実際に読み値を検査**する。`ready`（空でも全 nodata でもない）になった最初の 1 件を `early` として返す。
- 残りのカタログへの問い合わせは止めない。`follow:"<handle>"`（または `action:"follow"`）で完了後の一覧（後から届いたもの込み）を取れる。早く届いたものが最良とは限らないので、**どれを使うかは Atlas の判断**に残し、固定の選択規則は足していない（`early` は「使える 1 件」であって「採用された 1 件」ではない）。
- 試すのは 1 回の到着につき最大 2 件、同じ ref は 1 度だけ。`until` なしの挙動は変えていない。
- 判定は記録の文面でなく読んだ値。検査 B1: 窓を覆うと述べても全 nodata に読めた候補は早期に返さない。

## 2. 画像添付ターン（`js/atlas-image-continue.js`・`js/atlas-console.js`）
- 画像読解の返答に `continueWithTools`（任意）を足した。**依頼が画像の外（外部データ・Web・IntMap のレイヤーとの照合）に及ぶと読解モデル自身が判断したときだけ** true。質問文への文字列規則ではない（検査 D1: 文面に「標高」等があっても true にならない）。
- true のとき、読解の回答はこれまでどおり先に表示され（読み・検算・ピン留めの能力は変えていない）、`recordTurn` は二重に積まず、同じターンで通常のエージェント経路が続く。エージェントへは読解結果を「画像の読み。検証済みの事実ではない」と印を付けた文脈で渡し、元の画像は `_atlRecallImgs` 経由の画像チャネルで届く。false なら従来どおり読解で終わる。

## 3. 植生境界の切り分け実験
（本番での実測結果は下に追記）

## 4. 費用（perf 天井）
`gis-core` チャンクが +4.4 kB（705.3→709.7 kB）、その中の `gis-remote` が +2.1 kB（35.3→37.4 kB）。先着採用の実装（`js/gis-remote.js` の `search` の再構成と `follow`）の分で、削れる重複は無い。天井は CI が測った値へ上げた。
`atlas-console` チャンクは、main 側で #1445・#1446 の能力追加が合算して天井を超えており（main の測定 1452.9 kB）、天井は main 側で先に改められた。この変更の画像継続（`atlas-image-continue.js` の取り込みと分岐）の増分はごく小さく、main の天井に収まる。
