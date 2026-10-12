---
title: 「その年は現在か」を時計 1 か所に——12 か所の写しと、年の境で UTC とローカルが食い違っていた 1 か所
date: 2026-10-11
---

〈きっかけ〉`dev-notes/2026-10-10-one-geocode-one-clock.md` §3 が「数えて報告だけしたもの」として残した 6 か所。

## 0. 何が写されていたか

「年 y は現在か（＝ live／現代の表示に畳む）」を、呼び出し側が `new Date().getFullYear()` で各自導いていた。
数え直すと `>=`（現在か）と `<`（過去か）の両方の形で **12 か所**（`atlas-cap-layers`・`atlas-cap-time` ×3・`time-admin1`・
`time-borders`・`time-countries`・`time-lapse`・`atlas-examples` ×2・`map-state`・`companies-ui` ×2）。時計（`js/chronos.js`）自身も
`setYear` と `set()` の中で同じ判断を持っていた。
`js/time-lapse.js` だけが **`getUTCFullYear()`** で、日本時間の 1 月 1 日 0〜9 時は「今年」を去年と答え、他と食い違っていた。

## 1. 直し方

`IntMapTime.isPresentYear(y)` を時計に 1 つ置き（ローカル年。`year()`・`setYear` と同じ暦）、時計自身と 12 か所が訊く。
`time-lapse` は UTC からローカルに揃う（意図した変化）。値としての「今年」（範囲の上端・既定の窓）は判断ではないので
そのまま（`time-thumb.js` の `curY`、`companies*` の時系列の既定）。

テストの側: 時計の代役を手で書いていたテストが新しい述語を持たず落ちた。代役ごとに写さず、本物の述語を持った代役を作る
`tests/helpers/clock-stub.mjs` を足し、新しい述語に届く経路の 6 本と `scripts/histeras/time-borders.mjs`（地図を node で
評価する共通の土台）はそれを使う。

## 2. 確かめた

- 新規 `tests/one-present-year-checks.test.mjs`: ① js/ 全体で「現在の年」と比べる形（`>=` と `<`）が時計の外に無い
  （綴りの一覧でなく呼び出しを数える。`- 2` のような窓は除く）② 時計を評価し、今年・来年は true、去年は false、
  `setYear` が同じ述語で畳む。
- 時計に触れる node 検査 148 本（1,971 件）緑。check:static・types・engine・archfiles・perf。
