---
title: atlas-console の遅延チャンクの上限を 1410.3 → 1418.1 kB に上げる（今回の Atlas の機能追加による正味の増加）
date: 2026-11-26
internal: ビルドの費用上限の更新で、読者が画面で見る機能は変えていない
---

main の `check:perf` が `atlas-console` 1418.1 kB > 上限 1410.3 kB（幅 7.1 kB）で赤（run 45663755210）。上限を上げる前に、増えた 7.8 kB が**チャンクの割れではなく正味の増加**であることを測った。

- 同じビルドで、**他の行は 1 つも上限を超えていない**。起動時の `requests` 12・`modules` 927 は上限と同値（共有部品が別チャンクに割れると起動時リクエストと modules が動く）。
  行として超えたのは `atlas-console` ただ 1 つ（`perf-budget.mjs --update` が「他の行は書かない」と述べた）。
- 増分の中身: c4a2ba34 以降に `js/` を触った main の変更は、#1429（`atlas-catalog-text` / `atlas-caps` / `atlas-capabilities` / `atlas-toolsurface`: +56 −10 行）、
  #1430（委譲 `atlas-delegate` / `atlas-cap-research` / `atlas-job-core`: +196 −89 行）、#1428・#1431・#1435（数行）。いずれも `atlas-console` が読み込むモジュールで、新しいモジュールの追加は無い。
- 買ったもの: 検索結果の文書を当たった能力のぶんに絞る断片読み（#1429）と、遅い子が親を止めない委譲の実行（#1430）。

上限は増加を含む測定値（1418.1 kB）に合わせた。次に割れたら（requests / modules が動いたら）上限ではなく分割を直す。
