---
title: CI のどのジョブにも時間の上限が無く、1 つのハングが 6 時間（GitHub の上限）走っていた——全 workflow の全ジョブに実測の約 3 倍の上限
date: 2026-11-16
internal: CI の運び方だけで、読者に見える挙動は変わらない
---

#1105 の `Regression 3/3`（2026-10-13）は最後のテスト報告のあと無出力のまま 6 時間 0 分で打ち切られた。全 workflow を読むと `timeout-minutes` を宣言していないジョブが 26 本（`ci.yml` は全 15 本）。

直したこと: 全ジョブに上限（直近の実測の最長の約 3 倍・最低 15 分。数と測り方は `docs/TESTING.md`「Every job has a timeout」）。走ったことの無い `rollback.yml`・`perf-ceiling.yml` は `deploy.yml` の対応するジョブに揃えた。

検査: `tests/ci-job-timeouts-checks.test.mjs`（全 workflow の全ジョブが 360 未満の上限を宣言する）。
