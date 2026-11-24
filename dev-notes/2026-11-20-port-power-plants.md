---
title: 「この港が止まったら」に発電所を足した——WRI の Global Power Plant Database を港へ結ぶ
date: 2026-11-20
newsen: Atlas now also names the coal, oil and gas power plants standing at a port that stops, with capacity, operator and commissioning year from the open Global Power Plant Database.
newsjp: 港が止まったときの答えに、その港にある石炭・石油・ガス火力発電所（容量・運営者・運転開始年）が加わりました。出典は公開の Global Power Plant Database です。
---

〈依頼〉 世界モデルを実データ（電力網など）へ広げ、「ある港が閉鎖されたら」の波及を実態に近づける。#1316 の上に積んだ第 1 歩は電力。

## 作ったもの
- `scripts/logistics/power.mjs` → `data/power-plants.json`（CC BY 4.0・約 174 kB）。WRI Global Power Plant Database 1.3.0（2021-06・34,936 基）のうち、船で運ばれる燃料（石炭・石油・ガス・石油コークス）8,660 基を、`data/logistics-network.json` の港 984 から **30 km 以内**にあるかで結ぶ。1,028 基が 490 港に結ばれた（ガス 601・石炭 219・石油 203・コークス 5）。各基に容量 MW・運転開始年・運営者（データベースの述べるまま）・近い順 3 港と km。
- `js/logistics-impact.js` の `impact()` が `power` を返す: 最寄りがその港の発電所の基数・MW（燃料別）・上位 8 基・他に港が無い基数。ファイルが読めないときは `{ok:false}` で、「無い」とは言わない。Atlas の `research.portImpact` のカードに 1 段足した。
- 出典: `WRI_GPPD`（cadence static。更新予定なしと 2026-11-20 に確認）を `upstream-cadence.mjs` に、`DATA_SOURCES` に CC BY の行。

## 実測と決めたこと
- 港までの距離別（燃料 4 種 8,660 基）: 5 km 303・15 km 687・30 km 1,028・60 km 1,583。30 km は「岸壁か短い接続で受けられる」距離として選んだもので、供給関係の観測ではない（コードの定数に失効条件つきで記載）。
- **近接であって供給ではない。** データベースは燃料の調達先を述べない。ガス火力はパイプラインかもしれない。答えが毎回そう述べる。
- **運営者は現在の述べ**で、過去の所有関係ではない。過去の年の所有者としては読ませない（世界グラフの時間軸への取り込みは未了・下記）。
- 他燃料（水力・風力・太陽光・原子力・地熱・バイオマス・廃棄物・蓄電）は、海上輸送燃料の負荷ではないので入れていない。

## 取り込めていないもの（理由と日付）
- **送電網（線・変電所・容量）**: 権利が明確で世界を覆う公開データを 2026-11-20 に見つけていない（OSM の power=line は ODbL で使えるが規模が大きく、別の設計が要る）。
- **貨物流量・海運航路・道路・航空路線**: #1316 の記録のとおり。航空路線は OpenFlights（2014 年）が既に `worldFlows` にある。
- **世界グラフ（Supabase）への発電所ノードの取り込み**: 週次の差分取り込みと不変 ID の枠組み（#1292・#1315）が merge された後で、同じ枠に乗せる。今回は静的ファイルを港の ref で結ぶまで。

## 検査
`tests/logistics-network-checks.test.mjs` に 3 件（CSV の引用符・燃料と距離の選別／同梱ファイルを 2 つの座標から再計算／港の答え＝最寄りがその港の基・読めないときは not read）。10 件緑。
