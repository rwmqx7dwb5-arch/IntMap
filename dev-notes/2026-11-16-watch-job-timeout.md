---
title: main が赤——時間上限の検査（#1139）と同時に着地した新しいジョブ（#1138 の security watch）に上限が無かった
date: 2026-11-16
internal: CI の設定だけで、読者に見える挙動は変わらない
---

#1139 は「全 workflow の全ジョブが `timeout-minutes` を持つ」検査を足し、ほぼ同時に別セッションの #1138 が `security.yml` に `watch` ジョブを足した。どちらも自分の木では緑で、合わさった main で `tests/ci-job-timeouts-checks.test.mjs` が赤になった（並行着地の形。必須チェックが strict でないため）。`watch` はまだ一度も走っていないので、上限は床の 15 分。
