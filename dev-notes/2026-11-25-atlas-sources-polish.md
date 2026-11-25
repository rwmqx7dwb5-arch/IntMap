---
title: 出典カードがフローティングの Atlas ウィンドウの下に隠れる／成果物ボタンに生の能力 ID が出る
date: 2026-11-25
newsen: The source card now stays above a floating Atlas window, and artifact buttons no longer show an internal name.
newsjp: フローティングの Atlas ウィンドウで出典カードが隠れる不具合と、成果物ボタンに内部名が出る表示を直しました。
---

本番検証（PR #1423 の後）で実測。フローティングでは `.atl-scard`（z-index 2000）が前面のウィンドウ（2650）の下に入り、
カード中心の `elementFromPoint` がウィンドウだった。z-index を `--z-toast`（3000）にした。
成果物ボタンのラベルが描画元の能力 ID（`map.compose`）になっていたので、名前も題も無いときは「図形 N」とした。
回帰は `tests/atlas-answer-sources-checks.test.mjs` ⑥。
