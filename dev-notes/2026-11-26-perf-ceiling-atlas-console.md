---
title: main の check:perf を赤にしていた atlas-console チャンクの天井を、増えた分の出どころを確かめて改めた
date: 2026-11-26
internal: 利用者に見える変化は無い。ビルド費用の天井（tests/perf-baseline.json）を実測に合わせただけ
---

main（f60bc2d0）の CI で async チャンク `atlas-console` が 1452.9 kB、天井 1445.3 kB（帯 7.2 kB）で赤になり、deploy が止まっていた。測定は f60bc2d0 そのものを build して再現（1452.9 kB・他のチャンクは全て天井内）。

## 増えた分の出どころ（天井が最後に合わせられた 989b8c494 以降）
- 3cbfe1660（取得済み本文・出典を子 AI へ届け、回答単位の計測）: `atlas-turn-metrics.js` +102/-19 行、`atlas-job-core.js`・`atlas-console.js` ほか。
- f60bc2d04（個々の能力の入力の門をスキーマから導く・14 能力の観測・出典・標高断面・経路書き出し）: `atlas-capabilities.js`・`atlas-cap-*.js`・`atlas-executor.js`・`atlas-result-facts.js` など。

どちらも能力を足した正当な増分で、分かれた共有部品や重複の混入は無い（`atlas-console` 以外のチャンクは天井内のまま）。合算で帯を 0.3 kB 超えた。削れる重複は見つからなかったので天井を実測値（1452.9 kB）へ上げた。`--update` は 1 行だけ書いた（他の行は触っていない）。
