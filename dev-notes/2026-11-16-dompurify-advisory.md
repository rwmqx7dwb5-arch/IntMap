---
title: DOMPurify の完全固定が天井になり、critical の勧告 3 件の下に 5 週間留まっていた——3.4.17 へ上げ、完全固定の override を拒む
date: 2026-11-16
internal: 依存の版と検査の規則だけで、読者に見える挙動は変わらない
---

〈依頼〉前回からの状態確認で、2026-10-23 以降どの PR も `Dependency advisories (npm audit)` が赤く、main が 2026-10-22（#1126）から動いていなかった。

## 0. 測った

- `npm audit`: `dompurify <=3.4.16` に critical 3 件（GHSA-cg2g-xh64-v4q7・GHSA-mrv2-3pqr-j5jr・GHSA-c6gr-qvv4-5v3f）。経路は `@cesium/engine`（`^3.4.14`）。修正版 3.4.17 は 2026-10-12 公開。
- `package.json` の `overrides` が `"dompurify": "3.4.16"` と**1 つの版に完全固定**していた（security-hardening で下限として書いたもの）。override は木の全コピーに効くので、Dependabot（#1134 も赤）も `npm audit fix` も越えられない。
- 毎週のデータ更新（衛星・選挙・企業）は `.github/actions/land-bot-pr` が「checks が 1 つでも赤なら merge しない」ので、audit が必須チェックでないにもかかわらず全部止まっていた。
- Dependabot alerts は今日もリポジトリで無効（`vulnerability-alerts` → 404、`automated-security-fixes` → `enabled:false`）。

## 1. 直したこと

- `dompurify` を 3.4.17 に（ロックは node_modules を持たない場所で `npm install --package-lock-only` を回して作り、`npm audit` 0 件を確認）。override は `^3.4.17`、同じ形の `nanoid` も `^3.3.18` に。
- 構造: `scripts/lock-ranges.mjs` に `exactOverrides` を足し、`check:static` の `lock-ranges` 規則が**完全固定の override を拒む**。既存の `overrideEdges` は「ロックが固定を満たすか」を訊き、これは「固定がいつか新しい版で満たされうるか」を訊く。

## 2. 検査

`tests/dompurify-advisory-checks.test.mjs`（実測した失敗の形を拒み、範囲の下限は通す）・`tests/security-hardening-checks.test.mjs`・`npm run check:static` 緑。
