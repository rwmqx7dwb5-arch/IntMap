---
title: 学ぶクエストの本番検証の残り 2 つ——読み上げの欄が答えの日付を述べていた／年のスライダーの aria-label が壊れていた
date: 2026-10-04
newsen: While you guess a year in Learn quests, the screen-reader narration no longer reads out the answer, and the year slider is labelled correctly.
newsjp: 学ぶクエストで年を当てる間、読み上げが答えの日付を述べなくなり、年のスライダーに正しい名前が付きました。
---

〈依頼〉 #978（`dev-notes/2026-10-04-quest-blind-everything.md`）の本番検証（ビルド印 `2026-10-04T10:04:23Z-881b31f`）で見つかった残り。

## 0. 測った（本番）

- 年代当ての問題中、`data-prints-map-time` を持つ 10 要素は全部 `visibility:hidden`、hash に `tt=` は無い——**それでも** `#map-narration`
  （`role=status`・`aria-live=polite`・`im-sr-only`。画面には見えず、スクリーンリーダーが読み上げる）が「Showing 1995-08-30」だった。正解は 1995。
- 年のスライダー `#qst-yr` が `aria-label="" year""=""` として出力されていた（引用符の閉じが値より先）。

## 1. 直したこと

- `js/map-narrator.js`: 読み上げの欄も地図の時刻を述べる要素なので、作る所で `data-prints-map-time` を付ける。`visibility:hidden` は
  支援技術の木からも外すので、問題の間は読み上げない（答えると戻る）。#978 の「印字する要素が自分で述べる」の 6 つ目——一覧に足したのではなく、
  作る側が事実を述べた。
- `js/quest-panel.js`: `aria-label="' + … + '"` に。

## 2. 検査

`tests/learn-quests-checks.test.mjs` ⑦ に 2 行: 読み上げの欄が属性を持つ・パネルの markup に「値より先に閉じた属性」（`=""' +`）が無い。
