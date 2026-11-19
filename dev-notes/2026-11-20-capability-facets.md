---
title: 能力の性質を単一の risk 列でなく独立した属性(facets)で持つ——dialog.ask が子AIに「読み取り専用」と見えた欠陥
date: 2026-11-20
---

# capability-facets — 能力の性質を単一の risk 列でなく独立した属性で持つ

## 問題(外部監査 2026-11-20)
`dialog.ask` は row で risk=read・writes 空・confirm=none。`js/atlas-console.js` の `classifyCapability`(子AI・委任タスクの権限判定)は
その 3 列だけで「読み取り専用」と分類し、子AIがユーザーへ質問を出せた。データを書き換えないこととユーザーへ作用しないことは別。

## 直し方(構造)
- `js/atlas-capabilities.js` の `build()` が各能力に `facets` を持たせる(`facetsOf`)。
  `mutatesState`(risk が read でない・writes あり)/ `network`(ingests external・risk external)/ `asksUser` / `showsUI`
  (produces が map・panel・chart・camera・route・view・object・time)/ `savesFile`(produces に file)/ `delegates`。
  前の 4 つは row から導出(id の一覧は無い)。row では言えない 2 つ(`asksUser`・`delegates`)は entry の `policy` に宣言
  (`js/atlas-caps.js` POLICY_KEYS)→ `scripts/atlas-caps.mjs --write` が eager 側の `ASKS_USER`・`DELEGATES` に写す。宣言したのは
  `dialog.ask`(asksUser)と `research.delegate`(delegates。旧コードの `id!=='research.delegate'` のハードコードを置き換え)の 2 つだけ。
- `classifyCapability` は facets を読む: 状態変更・質問・画面表示・ファイル保存・委任のいずれも無く confirm=none のときだけ 'read'。
- `toJSON()`(監査 JSON)にも facets を出す。

## 影響(実測)
250 能力のうち子AI 'read' は 50 → 47。外れたのは `dialog.ask`(本件)、`chart.compose`(チャートを読者の画面に出す)、
`briefing.share`(パネルを出す)。後 2 つは画面に作用するので同じ理由で外れるのが正しい。
確認要否は PR #1270 の方針(行の列 8 と `effectOf`)を変えていない——facets は確認の基準を広げない。`network` は row が宣言した下限
(ingests/external)で、run が張る全通信の走査ではない。

## 検査
`tests/atlas-capability-facets-checks.test.mjs`: dialog.ask の再現、全 250 行が 6 属性を boolean で持つ、row との一致、
run が選択 UI(`atl-choice`)を組む entry は必ず asksUser を宣言(実装が証人)、子AI 'read' 全員が 5 属性とも false。
`atlas-delegation-wiring` ⑨ の期待式を facets に更新。
