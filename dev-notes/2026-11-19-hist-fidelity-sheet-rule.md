---
title: 歴史地図の計器が測る sheet を、ページが描く sheet に合わせた（規則を 1 か所に）
date: 2026-11-19
---

〈依頼〉歴史地図の調査で最優先に挙がった計器の修正。`check:histfidelity` が測る sheet が、ページが実際に描く sheet とずれていた。

## 0. 測った（修正前）

- gate（`politiesAt`）は「年以前で最新の sheet」、ページ（js/time-borders.js `nearest`）は「最も近い sheet」。
  -500 年: gate は sheet -699、ページは -499。-100 年: gate は -199、ページは -99。
- 計器は誰も見ていない地図を測っていた。

## 1. 直したもの

- 規則を `js/hist-sheet-pick.js`（`nearestSheet`）に取り出し、ページの `nearest` と gate の `politiesAt` の両方が同じ関数を呼ぶ。写しは置かない。
- 同じ規則の写しだった `scripts/histclio/coast-snap.mjs` の `nearestSheet` も同じ関数へ委ねた（CShapes より前の年だけ聞くので csMin は無限大）。
  それを「ページの `nearest` と一致するか」でソース抜き出しして測っていた tests/coast-snap-gaps-checks.test.mjs ④ は、ソース綴りに依存しない形へ。
- 回帰テスト tests/hist-fidelity-sheet-rule-checks.test.mjs: 3000 BCE〜1885 を 7 年刻みで、gate が測る sheet = ページの `_nearest`（評価して比較）。-500・-100 の固定例。gate が写しを持たないことも確認。

## 2. 実測（修正前→後・data/hist-fidelity.json）

| 年 | 描かれる政体のある陸地 | 一次区分を持つ割合 | 備考 |
|---|---|---|---|
| -500 | 87.78% → 73.19% | 0.03% → 0.0% | 空白の単位 111 → 153 |
| -100 | 83.87% → 67.63% | 0.81% → 0.95% | 空白 118 → 143 |
| 1689 | 73.61% → 73.28% | 13.03% → 13.09% | |
| 1850 | 86.45% → 80.15% | 31.45% → 42.43% | 1850 はフォールバック経路 |

門を緩めたのではなく、**ページが実際に描く sheet を測ったら被覆が低く出た**（隠れていた欠けが見えた）。
`node scripts/hist-fidelity.mjs --update` で台帳を記録し直した（手で混ぜていない）。-500・-100 の欠け自体は直していない。次の修正対象。

## 3. 残したもの

- scripts/year-pages.mjs の `nearestSheet(M, y)` は距離最小で同点の扱いが違う別の写し。年ページの文言用で計器ではないので今回は触らない。

## 4. 起動時の費用（perf 天井）

`js/hist-sheet-pick.js` は js/time-borders.js が静的に import する純関数 1 つ（22 行）なので、起動時に読み込まれるモジュールが 1 つ増える（eager.modules 907 → 908）。
規則を 2 か所に持たせない代わりの費用で、帯域は無視できる。`node scripts/perf-budget.mjs --update` で天井を上げた。
