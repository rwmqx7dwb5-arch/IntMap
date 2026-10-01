---
title: deep tier の手動実行が main の公開を取り消していた——workflow_dispatch を push と別の並行グループに
date: 2026-10-01
---

〈依頼〉構造監査の続き（全面委任）。

## 0. 測った

2026-09-30〜10-01、deep tier を確かめるために main で `workflow_dispatch` を 3 回押した。CI の並行グループは `schedule` だけを別にし、それ以外は `github.ref` だったので、**手動実行は同じ ref の push の run を取り消した**——c3990ff と 281e584 の push の run が cancelled になり、本番（公開は push の run だけが行う）は 1a66ec7 のまま 3 つの merge（#850・#851・#852）が届かなかった。本番の衛星が 1914 年に 5,091 機を描いていたのは、#852 がまだ出ていなかったから。

## 1. 直したこと

`workflow_dispatch` を ref ごとの別グループ（`dispatch-<ref>`）に。branch の上で押した手動実行が同じ branch の前の手動実行を取り消す性質（#R205/#R207）は保ち、push・PR の run とはもう競わない。push の run を再実行して 281e584 を公開し、本番で衛星の 1914 年＝0 機・nodata を確かめた。

## 2. 同じ回に直した検査

#851 で足した `tests/r169.spec.js` #3b が main の CI で赤（詳細は `dev-notes/2026-10-01-news-list-keeps-position.md` §5）。製品ではなく spec が smooth スクロールの途中の位置を読んでいた。
