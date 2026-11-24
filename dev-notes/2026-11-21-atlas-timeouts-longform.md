---
title: 長い報告書・長いコードを章ごとに書く——出力上限を上げず、保存しながら結合する(research.longform)
date: 2026-11-21
newsen: Atlas can now write a long report or a long piece of code chapter by chapter, keeping each chapter as it goes, instead of stopping where one answer runs out.
newsjp: Atlas が長い報告書や長いコードを章ごとに書き、書いた章を保存しながら最後に 1 つにまとめられるようになりました。1 回の答えの長さで止まりません。
---

〈依頼〉総合技術監査（2026-11-21）§9.6 と §10.3。

## §10.3 文書の時計
`docs/architecture/02-features.md` はツール呼び出し 45 秒・ターン 180 秒と書き、`js/atlas-agent.js` は #R452 から 240 秒・600 秒を持っていた。文書を直し、`scripts/doc-facts.mjs` に規則 `atlas-clocks` を足した——文書が「`toolTimeoutMs`（N 秒）」「`turnBudgetMs`（N 秒）」と述べた値を、コードの数値リテラルと照合し、述べた文が 1 件も無ければ落ちる（旧い 45/180 に戻すと赤になることを確認）。

**時計の部分は落とした。** main が後から #1390 でターンの時計そのものを外した（`turnBudgetMs: 0`・文書の行は「ターンの止まり方」に置き換わった）ので、この節の文書修正と規則 `atlas-clocks` は守る主張ごと消え、main を取り込むときに除いた。本 PR に残るのは下の長文（§9.6）だけ。

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

## perf (merged build, 2026-11-22)
Ceilings re-measured on the build of this branch merged with the latest origin/main (new capabilities from other PRs, atlas-orchestrate 82.4 to 96.1 kB, atlas-console, dist.assets) and raised with `perf-budget --update`; the research.longform capability is this PR's part of atlas-cap-runs.

## perf (CI measurement, 2026-11-23)
CI measured the async chunk atlas-cap-runs at 941.0 KiB against main's 931.1 KiB; the ceiling was raised to that measurement. The growth is research.longform (this PR) on top of the capabilities main gained.

## perf (main 取り込み後の再測定 2026-11-24)

main を取り込むと、main の bot が下げた天井が先に上げた値を上書きした。CI の実測は
`atlas-cap-runs` 949.6 KiB（972,390 B）・`dist.assets` 22045.6 KiB（22,574,694 B）。
前者は能力表の 262 行（本 PR の `research.longform` ほか main の追加分を含む）と main 側の
追加が運ぶ分、後者は main が足した配布資産を含む。実測値まで天井を上げた
（`atlas-cap-runs` 973,000・`dist.assets` 22,580,000）。縮められる根拠が無い——能力表の行は
利用者が得る能力そのもの。main の bot が merge 後に再び下げる。

## perf (main の先端を取り込んだ再測定)

`async.raw` 14569.8→14650.8 kB・`async.gzip` 4918.1→4947.0 kB・`atlas-cap-runs` 952.1→960.5 kB・
`gis-core` 697.3→701.2 kB を `perf-budget --update` で実測まで上げた。`gis-core` と合計の
増分は main が先に入れた GIS 側の追加で、本 PR の変更ではない。`atlas-cap-runs` は能力表の
行数（263 行）に比例する。いずれも利用者が得る能力そのもので、縮める根拠が無い。
main の bot が merge 後に再び下げる。

## perf (3 回目: main の能力追加後)

main が能力を足し、能力表は 268 行になった。`atlas-cap-runs` 981.3→990.3 kB（`atlas-console`
も CI で 1145.6 kB まで増えた）。能力表の行数に比例する増分で、利用者が得る能力そのもの。
`perf-budget --update` で実測まで上げた。main の bot が merge 後に再び下げる。

## perf (4 回目: 能力表 272 行)

`async.raw` 14680.9→14770.9 kB・`async.gzip` 4956.6→4991.8 kB・`atlas-cap-runs` 989.3→1004.1 kB・
`dist.assets` 22068.6→22217.5 kB を `perf-budget --update` で実測まで上げた。main が能力を足して
能力表が 272 行になった分で、利用者が得る能力そのもの。縮める根拠は無い。main の bot が
merge 後に再び下げる。

## perf (main 取り込み・273 能力)

main の取り込みで能力が 273 になり、`atlas-cap-runs` が 1010.1 kB、`atlas-console` が 1165.0 kB に増えた（実測）。増分は main が足した能力の登録行で、この PR の追加ではない。天井は `--update` で実測へ。失効条件: main の perf-ceiling が下げた値が正本。

## global-surface (window.IntMapLazy 196 → 197)

origin/main を取り込んだ木で `check:surface` が 1 読みを新規に検出した（js/ の `IntMapLazy` は main と同数の 200 箇所で、この PR は js/・src/ に `IntMapLazy` を足していない）。main 側が先に足した読みで、台帳が追いついていなかった。`--update` で台帳を実体へ。失効条件: 該当の読みを owner の import へ移した時点で下げる。

## perf (280 能力・main の research.search 取り込み後)

CI 実測で `atlas-cap-runs` が 1067.0 kB、`atlas-console` が 1185.3 kB に増えた。増分は main が足した能力（research.search ほか）の登録行で、この PR の追加は research.longform 1 本。天井を 1100000 / 1220000 byte へ。失効条件: main の perf-ceiling が下げた値が正本。

## perf (282 能力・main の siting 取り込み後)

CI 実測で `async.raw` 15341.9 kB・`async.gzip` 5215.2 kB・`atlas-cap-runs` 1080.3 kB が天井を超えた。増分は main が merge した能力（siting ほか）の登録行で、この PR の追加ではない。天井を 15800000 / 5400000 / 1125000 byte へ。失効条件: main の perf-ceiling が下げた値が正本。

## perf (291 能力・main 再取り込み後)

CI 実測で `async.gzip` 5292.1 kB・`atlas-cap-runs` 1137.2 kB が天井を超えた。増分は main が merge した能力の登録行で、この PR の追加ではない。天井を 5470000 / 1185000 byte へ。失効条件: main の perf-ceiling が下げた値が正本。
