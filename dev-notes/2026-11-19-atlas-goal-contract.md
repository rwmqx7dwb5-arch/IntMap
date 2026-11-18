---
title: 外部監査への対応 — 期限切れの操作を取り消す・形状の対象を名前で照合する
date: 2026-11-19
internal: Atlas の内部（期限切れ操作の取り消し）と評価器の採点だけが変わり、読者に見える画面は変わらない
---

〈依頼〉外部監査レポート（2026-11-19 時点の main）の指摘にできるだけ対応する。

## 0. 指摘の検証

- 「計画も answer_mode も無い普通の文章回答は `complete`」は事実。`tests/atlas-completion-agent-checks.test.mjs` が仕様として固定している。
- ただし監査の P0「要求から独立した Goal Contract をコードが作る」は、`CONSTITUTION.md` §5（コードが Atlas の代わりに決めない・条件文や除外を足して塞がない）と衝突する。要求文を機構が解釈して必須成果物を決める設計は行わず、**利用者の判断を仰ぐ**。
- 本番の夜間評価は認証シークレット 2 件が未設定で止まっている（利用者にしか設定できない）。絶対成功率はこの回では測れない。

## 1. 期限切れの操作を取り消す

`runTool` の期限（`Promise.race`）は待つのをやめるだけで、操作は走り続けて後から地図に載りえた。呼び出しごとに `callSignal` を作り、期限で abort する。`js/atlas-console.js` が turn の signal と束ねて executor へ渡すので、操作は `cancelled` に確定する。Atlas に返す文も「取り消した」と述べる（signal を無視する execute は従来どおり）。

## 2. 形状は「種類」ではなく「対象」で照合する

`atlas.shapes.line:real >= 1` は別の川の実形状でも通った。`tallyShapes` が `names`（形状が解決された名前）を持ち、評価器の `drawn` 基準に `named` を足した。名前が読めない地図は `unobserved`（通さない）。信濃川とナイルの問いに適用。

## 3. 検査

`tests/atlas-goal-contract-checks.test.mjs`、`tests/atlas-deadlines-checks.test.mjs`（追加 1 件）、`tests/eval-shape-grading-checks.test.mjs`。cassette `river-traced-on-its-course` を再録。
