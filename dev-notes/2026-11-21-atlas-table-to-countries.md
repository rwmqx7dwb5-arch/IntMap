---
title: W杯の結果別色分けが描かれなかった——highlight は「カテゴリ別の一括塗り」を名乗っておらず、plan だけの返信が手数を食っていた
date: 2026-11-21
newsen: Atlas now knows that one highlight call can colour many countries by category, and is told when a reply of plan calls alone did no work.
newsjp: Atlas が「表から読んだ結果を、国ごとにカテゴリ別の色で 1 回の呼び出しで塗れる」ことを把握し、plan だけの返信は何も実行していないと伝えられるようになりました。
---

〈依頼〉「2026年W杯の最終順位(FIFA公式)をもとに出場48か国を結果別に色分けして」が本番で描かれなかった原因を再現して特定し、構造で直す。

## 0. 測った（本番・ログイン済み・GPT 6.2 Sol、同じ依頼を 3 回）
- 1 回目: 2m37s・10 ステップ・`step_budget`。実行された操作は `time.travel 2026-07-20` の 1 件だけ。色は 0。
- 2 回目以降は ai-proxy の fetch を記録。最初の 6 回のモデル呼び出し: 4.5 s(effort) / 0.4 s / **plan のみ 7.0 s / plan のみ 14.7 s / plan のみ 8.4 s** / find_capability 13.8 s / plan のみ 33.1 s / set_time 23.1 s。地図に触る呼び出しは 8 本目まで 1 本も出ていない。
- 各呼び出しの中でプロバイダ側の web 検索が走り(`webSearches` 1→3→3→4)、state は ok。つまり検索の失敗ではない。
- モデルの思考断片: 「highlight の groups を使えるか」「England と Scotland を同じ groups に入れられるか」を探していた。

## 1. 原因（観測した 2 つ）
1. `highlight` ツールの説明は「Colour named countries or regions」の 1 行で、`groups` は中身の無い array だった。カテゴリ別の一括塗りが可能と読めず、モデルが見つけるために find_capability と plan で手数を使った(find_capability は無関係な 26 本を昇格させた)。
2. `plan` だけの返信(説明は「最初の呼び出しと同じ返信で」と既に書いてあった)が 8 手のうち半分を占めた。

## 2. 直したこと
- `js/atlas-cap-map.js`: `groups` を `{label, interpretation, targets, iso3, codes}` の項目を持つ array に。リーダーが読む綴りだけで、新しい受理形は足していない。
- `js/atlas-toolsurface.js`: `highlight` の説明に「多数の国をカテゴリ別に塗るときは groups・国ごとに ISO3・名前→コードの対応は自分で・IntMap が境界で検証して未解決を返す」を追加。
- `js/atlas-agent.js`: plan だけの返信の結果に「何も実行されていない・手数を 1 つ使った」と事実を添える。拒否も上限変更もなし(one-pass-or-a-reason §1)。

## 3. 検証・未了
- `tests/atlas-table-to-countries-checks.test.mjs`(3 本)。
- 未了: 修正後の本番再実行(デプロイ後に W杯 + 他 3 件で共存確認)。完了判定(`step_budget` で止まった turn の completion が complete と記録された件)は原因の特定まで至らず、PR #1333 の領域として別途。per-group の色指定(金・銀)は未対応で、色は自動パレット。
