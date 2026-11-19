---
title: Cesium の地球では era 都市名の判定が常に偽で、現代の名前が 1916 年の地図にも残っていた
date: 2026-11-20
newsen: On the 3D globe, historical city names now follow the chosen year as they do on the flat map.
newsjp: 3D 地球でも、選んだ年に合わせて歴史上の都市名が表示されるようになりました（平面地図と同じ）。
---

〈依頼〉 外部監査: Cesium のスタイル解釈器が未実装と明示する演算子（`format`・`image`・`number-format`・`collator`・`distance`・`within` ほか）のうち、利用者に差が出るものを実装し、しないものは到達しない根拠を検査で表明する。

## 0. 測った
- `js/` 全体で `UNSUPPORTED` 8 演算子の式としての出現を掃いた（`['op', …]`）。**出現は `distance` のみ**（`js/hist-cities.js` の era 都市名。同じ綴りの別の都市を位置で区別するため、各候補を `<= distance` で守る）。
- Cesium では `distance` が `null` を返し、`<=` が偽になるので、**era 名の枝がひとつも当たらず**、基底（現代）の名前が残る。平面地図との差はこれ。
- 実 preview（両エンジンを並べた目視）は未実施。根拠は評価器の入出力（新しい検査）まで。

## 1. 直した
- `distance` を実装（点–点は大圏、点–線は局所平面、点が面の内側なら 0）。`ctxFor` が地物の幾何を渡す。`FEATURE_OPS` に追加（地物ごとに評価）。
- `UNSUPPORTED` から `distance` を外した。残りは「アプリが書かない」主張で、`tests/cesium-style-parity-checks.test.mjs` が掃く（検査自身が空振りしないよう、パターンの自己確認と掃引の対象数も見る）。
- 既存の検査と統合せず新設した理由: 既存の `engine-cesium-rendering-checks` は解釈器の値を測るだけで、「アプリが何を書くか」を測るものが無かった。
