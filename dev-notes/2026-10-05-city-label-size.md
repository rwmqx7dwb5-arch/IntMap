---
title: 都市名が規模に関係なく同じ大きさだった——タイルの rank と首都の印で 4 段にし、衝突でも大きい都市を残す
date: 2026-10-05
newsen: City names are now sized by importance, like Google Earth — capitals and major cities larger, towns smaller — and the bigger city keeps its name where two would overlap.
newsjp: Google Earth のように、都市名の大きさを規模で変えるようにしました（首都・大都市は大きく、町は小さく）。名前が重なるときは大きい都市の名前が残ります。
---

〈依頼〉「Google earthみたいに、都市の規模に応じて、地名ラベルの大きさも変わる仕組みにして。実サイトを見たうえで分析して。」（実サイト＝Google Earth）。利用者の選択: 根拠は「ランク＋首都の印」（人口の突き合わせはしない）。

## 0. 測った
- **Google Earth（2026-10-05、日本付近）**: 800 km 視点で東京・大阪 ≈14 px、福岡 ≈13、函館 ≈10、平壌 ≈12。500 km 視点で東京・横浜 ≈16、静岡・京都 ≈15、長野 ≈13、福井 ≈11。都市には点、県名は点なしでさらに小さく淡い。3〜4 段の重要度で大きさを変えている。
- **IntMap（同日）**: `ofm-city` の `text-size` はズームだけ（`LS.place('city')`）。衝突順の `symbol-sort-key` も無く、タイルの並び順で決まっていた。
- **タイルの属性（OpenFreeMap `place`、日本・韓国を問い合わせ）**: `class`・`rank`・`capital` のみ（人口は無い）。東京 1・大阪/ソウル 2・平壌/広島 3・長崎 4・名古屋/京都/福岡/長野 5・横浜/神戸 6。`capital` は 2＝国の首都、4＝県庁など。横浜（約 370 万人）が 6 のように人口とずれる所があることは利用者に示して選んでもらった。

## 1. 直したもの
- `js/label-scale.js`: 段の倍率 `TIER_K` と `placeTiered(kind, tierExpr)` / `placeTierAt`。ズームが最外殻（#R73）で各 stop が `step`。最大 1.10 は「#R198 より前の都市の大きさを超えない」（z4 で 11 / 10.0）から決まる上限、幅 1.10/0.82 ≈ 1.34 は Google Earth の 14/10.4 から。
- `js/place-labels.js`: `CITY_TIER`（首都か rank ≤ 2 → 0、町 → 3、rank ≤ 4 → 1、rank ≤ 6 → 2、それ以下 → 3。rank 欠落は 6 とみなす——`to-number` は欠落を 0＝最重要にしてしまうので使わない）を `text-size` と `symbol-sort-key` の両方に。

## 2. 検査
- `tests/city-label-size-checks.test.mjs`: ① 全段が全ズームで地名の基準と #R198 以前の都市の大きさを超えず、段は厳密に減り、施設名の出るズームでは最小の段も施設名より大きい ② 式の形 ③ `CITY_TIER` を実測した地物の形で評価（東京・大阪・平壌・広島・福岡・神戸・rank 無し・低 rank・町）、層が同じ式を大きさと衝突順に使う。
- `tests/legend-reflow-and-label-writes-checks.test.mjs` の `IntMapLabelScale` の模型に `placeTiered` を足した。
