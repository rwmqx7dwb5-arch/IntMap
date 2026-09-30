---
title: 1 つの欄が「文字」と「HTML」の 2 つの意味を運んでいた——出力の安全の回で歴史国家の国旗が文字として表示された回帰を、読み手を 1 つにして直す
date: 2026-09-30
---

〈依頼〉構造監査の続き。本番検証（#827〜#840）で見つかった回帰。

## 0. 測った（本番、2026-09-30）

Chronos を 1900 年にすると、国一覧 211 行中 **13 行**で国旗の欄に `<img class="hist-flag" alt="" src="data:image/svg+xml,…` が**文字として**出た（Russian Empire・Qing Empire・British Raj ほか）。Now に戻すと 0 行。

## 1. 原因

`countryStats[*].flag` は現代の国では絵文字（**文字**）、歴史国家では `js/history.js` / `js/time-borders.js` が組む inline-SVG の `<img>`（**markup**）。1 つの欄に 2 つの意味があった。出力の安全の回（output-taint-gate）は国カード・一覧・ポップアップの 4 か所でこれを `escC()` に通し、歴史国家の画像を文字にした。他の読み手（ツールチップ 3・比較 5・Atlas の国カード・地名ポップアップ・比較チップ）は生で差し込んでいた——値がすべて自前だから安全だっただけ。Atlas の国カードは `esc(flag + name)` で同じ二重エスケープだった。

## 2. 直したこと

- `window.IntMapSafe.flag(value, fallback)`（`js/safe-html.js`）が**唯一の読み手**。組み手が作るのと同じ形の画像だけを認め、**percent-encoded の中身だけを取り出して scheme はコードに書いて組み直す**。それ以外は文字としてエスケープ。
- 国旗を描く読み手 14 か所をすべてこれへ（countries-ui 4・data-layers 3・stats-compare 4・app-body 1・atlas-cap-data 1・map-ui 1）。
- `scripts/output-taint.mjs` は `IntMapSafe.flag` をエスケープと認める（台帳 435 → 432）。
- 回帰 `tests/flag-value-owner-checks.test.mjs`: 2 つの組み手の実際の式で作った画像が画像のまま通る／似せた悪意の値 5 種は文字になる／読み手が escape も生差し込みもしていない。

## 3. 実測（build 済み dist、headless Chromium、1900 年）

国一覧 211 行・画像の国旗 13・文字として出た行 0・ページエラー 0。

## 4. 形の教訓

エスケープを足す修正は「その値が文字か」を問わずに足すと、markup を運ぶ正当な値を壊す。**1 つの欄が 2 つの意味を持つなら、その判別を 1 か所に置いてから sink を締める。**
