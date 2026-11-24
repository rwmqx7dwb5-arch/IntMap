---
title: i18n-audit の子 14 本を並列に走らせ、doc-facts の変異テスト 2 本を 1 規則だけに絞った
date: 2026-11-20
internal: 検査の実行時間だけを縮めた。測る内容・判定・出力は同じ
---

〈依頼〉CI を品質に影響しない範囲で速くしろ。

## 0. 測った

- Regression の `checks-cost.json` 上位は `process-doc-facts-*` 系で、全体 3091 秒の約半分。`doc-facts` は `i18n-pair-audit` を子として呼び、`i18n-audit.mjs` は 14 本の子を直列に待つ（92 秒のうち 95 % が `spawnSync`）。
- 子の実測: i18n-report 18 s・dead-key 29 s・pair 19 s・key-collision 12 s・positional 10 s・attr 9 s ほか。合計約 118 s。

## 1. 変えたもの

- `scripts/i18n-audit.mjs`: 子を同時に最大 min(4, コア数) 本で走らせ、結果は従来と同じ順に読む。子の一覧は手で持たず、`= await run('<script>.mjs')` の呼び出しから導く。判定・メッセージ・exit code は同じ（元の版と `--gate` の出力を突き合わせて一致を確認）。92 s → 41 s（この機械）。
- `tests/process-doc-facts-edge-counts-checks.test.mjs`・`tests/process-doc-facts-instruction-docs-checks.test.mjs`: 変異ごとの `doc-facts --check` を、その case が見る規則だけの `--rule=` に絞った（`--rule` の存在理由は scripts/doc-facts.mjs 冒頭）。前提の緑・復元の緑は全件のまま。edge-counts は 194 s → 111 s。

## 2. 否定された見立て

instruction-docs の 393 s は `--rule` では縮まなかった（`⑨` が `i18n-audit` を 3 回走らせる 235 s が主）。縮むのは上の並列化のほう。
