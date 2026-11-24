---
title: 網の分析を実データへ接続した——港・鉄道・都市・工場から「この港が止まったら」に答える（research.portImpact）
date: 2026-11-20
newsen: Atlas can now answer "which cities and factories depend on this port?" from real data - ports, OpenStreetMap rail, cities and company factory sites - and says what the answer rests on.
newsjp: Atlas が「この港が止まったら影響を受ける都市と工場は」に、実際の港・鉄道・都市・工場のデータで答えられるようになりました。答えが何に基づくかも毎回述べます。
---

〈依頼〉 監査 5.6——ネットワーク分析（#1289）が実データと接続されていない。海運航路・港湾・鉄道・道路・航空・電力・通信のうち、利用規約上使えるものを取り込み、容量・輸送時間・障害時条件を持つ網にして、Atlas が「ある港湾が停止した場合に影響を受ける工場と都市」に実データで答えられるようにする。

## 作ったもの
- `scripts/logistics/build.mjs` → `data/logistics-network.json`（ODbL・約 0.97 MB）。港（#1292 の取り込みと同じ 3 典拠: Wikidata・Eurostat `mar_go_aa`・UN/LOCODE）・OSM 鉄道（同梱の `data/railways/c`）・都市（GeoNames 人口 10 万以上 6,088）・工場系拠点（企業アトラスの factory / assembly_plant / refinery / smelter / brewery / shipyard / mine / power_plant 1,173）。
- `scripts/logistics/rail-graph.mjs`: 鉄道のグラフ化と「最寄り k 港」の探索（複数起点 Dijkstra）。`coast.mjs`: Natural Earth 海岸線までの距離。
- `js/logistics-impact.js` と Atlas 能力 `research.portImpact`: 港（名前・UN/LOCODE・Wikidata id）→ 最寄りがその港の都市・拠点、各々の次の港と鉄道距離の増分、次の港が無いもの、受け皿の港の述べられた取扱量。あいまいな名前は選ばず候補を返す。

## 実測（2026-11-20）
- 同梱の鉄道セルは 0.0012°（約 130 m）で簡略化され、分岐点の頂点が消えている。座標一致だけで結ぶと 66,213 成分・最大でも頂点の 3.4 %（ロッテルダムとベルリンがつながらない）。**チェーンの端が他のチェーンの線分から 200 m 以内なら分岐点**として線分上に節点を挿入すると、最大成分が 649,295 節点（全体の 60 %）になる。交差だけでは結ばない（検査で確認）。
- 港: Wikidata の港 3,470 → 座標あり 3,001 → 貨物の述べ・LOCODE・鉄道ターミナル旗のいずれかを持つ 1,921 → 非商業クラス（inland port・fishing port・marina・naval base ほか）94 と海岸から 120 km 超 63 を除外 → 鉄道から 10 km 以内の **984 港**。
- 都市・拠点 7,261 のうち、鉄道が許容距離内にあり港に到達できたのが 5,068。鉄道が無い 1,416・鉄道はあるが港に届かない 777 は**割り当てず数える**（ファイルの `coverage`）。

## 設計で決めたこと・否定した案
- **モデルは鉄道の到達可能性であって貨物の流量ではない。** 軌間・電化・線路容量・事業者・道路・河川は制約に入れていない。`model.kind` が毎回の答えに付く。パラメータ（接続距離・到達上限・保持港数・外洋港の距離）は各々、観測か選択かと失効条件をコードの定数に書いた。
- 輸送時間は**足していない**。OSM は最高速度を持つ線が少なく、貨物の平均速度は観測していない。時間を決め打ちの速度で出すと「データが述べた時間」に見える（`CONSTITUTION` の推測禁止）。距離（km）だけを持つ。
- 容量: 港の取扱量は Eurostat（EU・EFTA・英・トルコ）と Wikidata throughput の述べだけ。範囲外は `null` で、答えが「取扱量の記載なし」と言う。鉄道の線路容量は典拠が無い。
- 「Eurostat の貨物がある港」は外洋港の証拠にならない（実測: フランクフルト 1 kt、ベルリン 24 kt、ハーナウ 1 kt のような河川港が載る）。距離で外洋港を判定した。ライン川・ドナウ川の港（ミュンヘンの最寄りが Regensburg になる）は旅客・貨物の外洋航路に属さないので除く。この判定で Duisburg 級の内陸港も外れる。
- Eurostat を持たない地域の都市は、大きな港が貨物の述べも LOCODE の旗も持たない場合に、遠い小さな港が「最寄り」になる（例: シカゴ→ケベックの Sorel）。これは典拠の偏りで、`coverage` と答えの「収録」の行が述べる。偏りを埋める典拠（各国の港湾統計）は機械可読で識別子を持つものが見つからなかった（#1292 の記録と同じ）。

## 取り込めなかったもの（理由と日付）
- **海運航路（線）**: 公開の航路網は Oak Ridge の Global Shipping Lane Network（2000）とそれを元にした Eurostat SeaRoute の marnet。GeoCommons の複製には**利用条件の記載がなく**（2026-11-20 に metadata を確認）、marnet は EUPL-1.2 のリポジトリの中にあるが元データの権利は述べない。営利利用が確かめられない典拠は採らない（`intmap-commercial-service-licences`）。IntMap の海路エンジン（`js/map-tools.js` seaRoute）は陸地マスクから計算した最短航路で、観測された航路ではない。
- **IMF PortWatch（港・チョークポイントの通過量）**: 2026-10-13 に営利再利用は IMF への許諾が要ると判断済み（`dev-notes/2026-10-13-wave4-mobility.md`）。今日も変わらない。
- **道路・航空・電力・通信**: OSM の道路網は規模が鉄道の数十倍で、同じ方法のまま都市・拠点を割り当てるには別の設計（階層・探索の打ち切り）が要る。航空は `data/airports.json` に空港はあるが路線の公開データは未確認。電力網・通信網は容量・接続の述べを持つ公開データが見つからなかった。いずれも今回は取り込んでいない。
- 海底ケーブル網は #1289 の `network` op が既に扱う（データも同梱）。

## 検査
`tests/logistics-network-checks.test.mjs`（7 件）: 分岐点の結合と交差の非結合／探索を総当たり Dijkstra と照合（乱数グラフ 5 本）／実在の 5° セルで「最寄りの港を塞いで再計算した結果 = 第 2 ラベル」／同梱ファイルの不変条件（外洋港・昇順・添字・ヘッダ）／答えがファイルの読み戻しであること／未知・曖昧・読めない場合。

## 予算・台帳
- `check:archfiles`: `js/logistics-impact.js` を `docs/FILES.md` に追記。`check:capabilities` / `check:catalog`: `research.portImpact` を能力表に生成。

## 未了
- #1289・#1292 が merge されるまでこの PR はそれらの上に積んでいる。
- 港の取扱量の範囲外（米・日・中・シンガポール）、海運航路、道路は上記のとおり。

## CI で赤になったものと直し方（2026-11-20）
- `check:perf`: 非同期チャンク合計が 14136.4 kB → 14225.4 kB、`gis-core` が 622.7 → 648.4 kB。増えたのは #1289 の `network` / `networkDisrupt` の算術（`js/gis-network.js` と `js/gis-ops.js` の 112 行）で、この PR はその上に積んでいるため。天井は CI の実測値に引き上げた（`tests/perf-baseline.json`・async.raw 14,567,000 B・gis-core 664,100 B）。港のデータ（0.97 MB）は初回表示に入らず、能力が呼ばれたときだけ `jsonWithin` で読む。
- `check:static` fetch-deadline: `js/logistics-impact.js` の読み込みを `jsonWithin`（30 秒の無通信で打ち切り）に変更。
- `check:datagov`: 新しい束の `paidBy` が無かったので `js/reference-data.js` の DATA_SOURCES に行を足し、`GOVERNANCE.paidBy` で結んだ（鉄道の ODbL が条件になる）。
- R749 ⑨: `js/gis-ops.js` の版ハッシュを main と合わせて記録し直した（版は上げない。応答を変える編集ではない）。

## 予算の天井を上げた理由(2026-11-21・main 取り込み後に再測定)
- `check:perf`: 非同期 gzip 4771.5 → 4804.3 kB、`atlas-cap-runs` 896.4 → 903.1 kB、`atlas-console` 1061.2 → 1069.1 kB、`dist.assets` 21559.0 → 21670.9 kB。増えたのは網の分析（`research.portImpact` と `js/logistics-impact.js`、能力表の行）で、Atlas の新しい能力 1 つ分。main の最新を取り込んだ木で完全な build を作って測り直した（CI が測る木と同じ）。
- 引き継ぐもの: 起動時の同期 JS は増えていない（増えたのは遅延チャンクだけ）。

- `scripts/gis-kernel-versions.mjs`: `js/gis-ops.js` の版ハッシュを main の最新と合わせて記録し直した（ops-14 のまま。既存の答えは変わらない）。

- perf: atlas-cap-runs 987.8→993.5 kB・dist.assets 22068.6→22189.9 kB へ天井を上げた。港・鉄道・都市・工場の網と「この港が止まったら」の能力を足したため。

- perf: atlas-cap-runs 1025588→1031599 B・atlas-console 1186800→1192904 B へ天井を上げた。港・鉄道・都市・工場の網の能力を足し、main の他の変更と合わせて測り直したため。
