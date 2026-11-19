---
title: 技術監査の主張を実コードで検証し、dispatch の「先に成功を記録する」を直す
date: 2026-11-19
internal: 内部の記録の正確さだけで、読者に見える挙動は変わらない
---

〈依頼〉 外部の技術監査（Atlas-centered 構造）への対応。まず主張を実コードで測った。

## 0. 測った（監査の主張 vs 実体）
- 「`OS.exec` が成功を先に記録する」— **誤り**。#R318 で thenable は pending→確定に直済み。
- 「`OS.dispatch` が成功を先に記録する」— **正しかった**（action 枝だけ）。ただし `IntMapOS.dispatch(` の
  実呼び出しは js/ に 0 件（Atlas は closure を `_setDispatch` に渡す）。直して exec と同じ規則にした。
- 「GUI も Atlas も同じ execute()」— **未達**。GUI の `OS.exec` 呼び出しは 36 行・19 ファイル、
  `IntMapOS.execute` を呼ぶ GUI ボタンは 0 件（undo の 1 件のみ）。`atlas-capabilities.js` のコメントが
  「UI ボタンが execute を呼ぶ」と書いていたのは偽だったので直した。
- 夜間評価: secret 2 本（`ATLAS_EVAL_REFRESH_TOKEN`・`ATLAS_EVAL_SECRET_WRITER`）が未設定で 30 回停止。
  本人のログインと PAT が要るため人が設定する（`docs/TESTING.md` 1396-1403）。

## 1. 直したもの
- `js/app-body.js` `OS.dispatch`: 記録をディスパッチャの応答後に書き、thenable は確定させる。
- `js/atlas-capabilities.js`: 偽のコメントを事実に。
- `tests/exec-path-unify-checks.test.mjs`: 核の IIFE を評価して 4 件。

## 2. 未了（判断が要る）
GUI の 36 箇所を `execute()` へ移す本体。コマンド表（`OS.register`）と能力表の対応が揃っていないものは
事後条件を持てないため、能力化と同時に段階移行する設計が要る。
