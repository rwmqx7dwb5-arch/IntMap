---
title: 能力行が、自分が駆動する GUI コマンドを宣言する（定義の一元化の第一歩）
date: 2026-11-19
internal: 開発側の宣言と監査だけで、読者に見える挙動は変わらない
---

〈依頼〉 GUI と Atlas の定義を一元化する（技術監査の追補）。能力行を正本に、GUI コマンドを「その実装」として結ぶ。

## 0. 決めたこと
- コマンドを能力へ自動昇格する案は採らない。`view.base.map/sat` は `view.basemap` と同じ機能の別形式で、
  自動登録すると重複を生み、引数スキーマ・確認要否も表せない。
- 正本は `atlas-cap-*.js` の行。行に `commands: [...]` を宣言し、監査がそれを registry と run 本体に照らす。
- `OS.list()` 相当の走査は登録の自動化ではなく**未対応の発見**に使う。

## 1. 変えたもの
- `js/atlas-caps.js`: 行の欄に `commands` を許可。
- `view.projection`・`view.basemap`・`panel.tab` に宣言（計 9 コマンド）。
- `scripts/atlas-capability-audit.mjs`: `command-declared`。宣言したコマンドが登録されている／1 つのコマンドを 2 能力が
  主張しない／run 本体が使う登録済みコマンドは宣言されている、を検査。未主張は 47 件と数えて出す（落とさない）。
- `registeredCommandIds()` を ⑧ と共有に切り出した。
- `tests/capability-command-bridge-checks.test.mjs`。

## 2. 次
未主張 47 件を能力行へ寄せる。GUI の呼び出しを宣言から生成する接続は、同期の操作感を保つ橋の設計が要る。
