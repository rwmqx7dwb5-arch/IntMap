---
title: 長い報告書・長いコードを章ごとに書く——出力上限を上げず、保存しながら結合する(research.longform)／文書の時計を実体から照合
date: 2026-11-21
newsen: Atlas can now write a long report or a long piece of code chapter by chapter, keeping each chapter as it goes, instead of stopping where one answer runs out.
newsjp: Atlas が長い報告書や長いコードを章ごとに書き、書いた章を保存しながら最後に 1 つにまとめられるようになりました。1 回の答えの長さで止まりません。
---

〈依頼〉総合技術監査（2026-11-21）§9.6 と §10.3。

## §10.3 文書の時計
`docs/architecture/02-features.md` はツール呼び出し 45 秒・ターン 180 秒と書き、`js/atlas-agent.js` は #R452 から 240 秒・600 秒を持っていた。文書を直し、`scripts/doc-facts.mjs` に規則 `atlas-clocks` を足した——文書が「`toolTimeoutMs`（N 秒）」「`turnBudgetMs`（N 秒）」と述べた値を、コードの数値リテラルと照合し、述べた文が 1 件も無ければ落ちる（旧い 45/180 に戻すと赤になることを確認）。

## §9.6 長文
上限を上げる案は採らなかった（新しい上限より長い文書は同じ壁、費用の柵が全タスクで弱くなる）。既存の仕組みを探した: 委譲（`research.delegate`）は子のターンが `maxChildren`＝2 に縛られ、子の返り値は JSON の所見で、章 10 本の文書には向かない。そこで `atlas_section`（散文・コードの 1 章・4,800 トークン）と `js/atlas-longform.js` を足した。章ごとに 1 リクエスト・書いた端から保存・切れた章は続きを書かせる・同じアウトラインは再実行しない・1 回の呼び出しは 150 秒で止まり `remaining` を述べる。能力 `research.longform` が結合した文書を読者へ直接見せる。

引き継いだもの: 「1 回の出力に収まらない」という制約は章分割と続き書きが運ぶ。絶対上限 5,000 は動かしていない。
未測: 本番での 1 章の所要時間（40〜70 秒と見積もり、`research.longform` の予算 150 秒はその前提）。

## 天井を上げた理由(perf)
`atlas-cap-runs`（896.4→912.5 kB）・async.gzip・dist.assets の天井を測定値へ上げた。`research.longform` の能力本体（カードの描画・説明文・スキーマ）が research の遅延チャンクに入った分。ほかに device-storage 台帳へ `intmap.longform.*` の 1 行（content）を足し、security.html の content の件数を 18→19 にした。

## perf (merge of main, 2026-11-21)
Origin/main moved (new async chunks from other PRs), so atlas-cap-runs and async.gzip ceilings were re-measured on the merged build and raised with `perf-budget --update`; the research.longform capability is the part this PR adds.

## dist.total
The CI build measured dist.total at 1,587,385,548 bytes, 13 kB above the ceiling main recorded; raised to that measurement (the data bundle and the PR-specific chunks are the growth).
