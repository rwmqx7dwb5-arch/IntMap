---
title: 未結線だった GUI コマンド 45 件を能力行へ結び、結べない 5 件は理由を宣言する
date: 2026-11-19
internal: 宣言と監査だけで、読者に見える挙動は変わらない
---

〈依頼〉 GUI の IntMapOS コマンドと Atlas の能力を同じ定義に結ぶ（能力レジストリ系のみ）。

## 0. 測った
`command-declared` の未主張は 45 件（登録 56 のうち 11 を主張済み）。一覧は監査と同じ `registeredCommandIds()` から取った。

## 1. 変えたもの
- 40 コマンドを 28 の能力行の `commands:` に宣言（compare・workspace・settings・各 sim・routing・
  isolate・objects・outbreaks・layer.on/off・news 系・time.now/set/year・company 系・layers.data）。
  判断は「そのコマンドの body が呼ぶ module を、その能力の run も呼ぶか」。run を書き換えていないので挙動は同じ。
- 結べない 5 件（`atlas.open/close`・`ui.sidebar.open`・`wars.show/toggle`）は
  `scripts/atlas-command-unbridged.json` に**理由**を書く。数ではなく理由で、監査が「登録されている・
  まだ主張されていない・30 字以上の理由がある」を検査する。
- 実測: 未主張 45 → 0（主張 51・理由つき 5）。新しいコマンドが理由なしで増えると
  `tests/capability-command-bridge-checks.test.mjs` が落ちる。

## 2. 引き継ぎ
旧入口（GUI の `OS.exec`）は無変更で同じ登録コマンドに着く。GUI 呼び出しを `execute()` へ移す本体は未了
（#1255・#1258 が能力側を進行中）。
