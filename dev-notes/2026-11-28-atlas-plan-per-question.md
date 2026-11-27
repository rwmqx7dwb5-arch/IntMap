---
title: 前の質問の計画が次の質問の作業一覧に出ていた——計画を書いた手の欄に結び付ける
date: 2026-11-28
newsen: Atlas no longer shows the previous question's checklist under a new question that made no plan of its own.
newsjp: 計画を立てなかった新しい質問の下に、前の質問のチェックリストが出なくなりました。
---

本番（2026-11-28、PR #1488 の検証中）で、5 か国の GDP の質問が計画（2/2）を書いたあと、同じ会話の次の質問（G7 の一人あたり CO2 の表）——計画を書いていない——の作業一覧に GDP の計画が出た。原因は順序: `js/atlas-live.js` の `begin` が新しい吹き出しを開いた時点で計画の表示を描き直すが、それはループが台帳に新しい手を告げる（`beginTurn`）より前で、その瞬間の `declaredThisTurn` は前の手について真だった。描かれたものは消さない規則なので、そのまま残った。

直し方（`js/atlas-plan.js` `makePlanView`）: 計画は、それを書いた手（`declaredTurn`、スナップショットに足した）が最初に描かれた欄に結び付け、別の欄へは後の手が自分の計画を書いたときだけ描く。呼ぶ順序に依存しない。検査 `tests/atlas-plan-per-question-checks.test.mjs`（ページと同じ順序で再現。修正前は落ちることを確かめた）。
