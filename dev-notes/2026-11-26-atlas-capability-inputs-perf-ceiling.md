---
title: 起動予算: 遅延チャンク atlas-console の天井を 1445.3 → 1452.9 kB に
date: 2026-11-26
internal: 開発用の予算台帳だけの変更で、読者に見える挙動は変わらない
---

PR 1446（Atlas の能力の入力・観測・出典）が main で `check:perf` を赤にした。CI が測るのは main へ merge した木で、PR の木で測った `atlas-cap-runs` の天井（+8.8 kB）では足りず、同じ増分が `atlas-console` の側に出た（チャンクの切れ目の移動。2 つの能力の run と共有のファイルカード、`layers.toggle` の読み替えを足した分の合計 +7.6 kB）。起動時のリクエスト数・モジュール数は増えていない。買ったもの: `map.elevationProfile`・`routing.export` と `shown` 観測器。
