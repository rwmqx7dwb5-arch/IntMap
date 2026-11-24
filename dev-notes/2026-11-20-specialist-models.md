---
title: 外部の専門モデルを Atlas が探し・入力を作り・実行し・前提と不確実性つきで返す経路（洪水 GloFAS・大気質 CAMS の 2 領域）
date: 2026-11-20
newsen: Atlas can now look up specialist models, and run a river-flood forecast (GloFAS) or an air-quality forecast (CAMS) for any place, stating what each model does not say and how far its ensemble or its two resolutions disagree.
newsjp: Atlasが専門モデルを探し、地点の河川洪水予報（GloFAS）や大気質予報（CAMS）を実行して、モデルが言わないことと、アンサンブルや解像度間の食い違いを添えて答えられるようになりました。
---

〈依頼〉 総合技術調査（2026-11-20）の結論——地震・津波・拡散・火山灰・感染・日照などの自前のシミュレーションは既にある。足りないのは作り直しではなく、既存の**外部の専門モデル**を Atlas が探し、入力を用意して実行し、前提・適用範囲・不確実性を添えて地図へ出す道。少なくとも 2 領域で実際に動かし、能力表と SYS 定義にも同時に入れる。

## 0. 構成

- `js/specialist-models.js`（純粋・ネットは注入）: 登録 `MODELS`（実行できるものは `run`、できないものは `status:'not-integrated'` と**理由**）、`discover`、入力準備、解析、`runFlood` / `runAir`。
- `js/atlas-cap-model.js`: 扉 2 つ。`model.find`（どのモデルが合うか・実行できるか・限界）と `model.run`（地点 → 入力 → 実行 → ピンと、前提・適用範囲・不確実性つきの回答）。能力表（`GENERATED ROWS`）とカタログの文（`spatial-analysis` ブロック）は同じ項目から導出。
- 一覧は登録 1 か所。モデルを足すと探索の語・扉の enum・テストが同時に動く（enum は登録から導かれることをテストが固定）。

## 1. 2 領域

**洪水 — GloFAS（Copernicus EMS / ECMWF、Open-Meteo Flood API・CC BY 4.0）**
- 入力準備: API は地点を最寄りの河川セルに寄せるが、それが支流であることが多い。地点の周り 3×3 セル（0.05° 刻み）を **1 リクエスト**で取り、最も平年流量の大きいセル（本流）で実行し、どのセルか・地点から何 km かを回答に書く。
- 出力は流量（m³/s）で、**浸水範囲・水深・再現期間ではない**。等級は「そのセル自身の直近 60 日の中央値に対するピークの比」（1.5 倍で elevated・3 倍で high。ラベルであって危険の閾値ではないと回答に書く。比の根拠は `specialist-models.js` の注記）。
- 不確実性: ピーク日のアンサンブル（min/p25/median/p75/max）と、**最小と最大のメンバーが同じ等級に入るか**。割れていれば「等級は定まっていない」と言う。
- 川ではない点（サハラ）は `NOT_A_RIVER` で拒否し、等級を付けない。サービスが答えないのは `UPSTREAM_UNREAD`（「洪水なし」ではない）。

**大気質 — CAMS（Copernicus Atmosphere Monitoring Service / ECMWF、Open-Meteo Air Quality API・CC BY 4.0）**
- 入力準備: 全球 0.4° と欧州 0.1° の 2 つの領域に同時に問い合わせ。欧州の外では欧州の領域は全部 null で返るので、**無いものは無いと言い、幅を作り話にしない**。
- 出力: 72 時間の US AQI（EPA の区分）、WHO 2021 指針値を最も超える物質。
- 不確実性: 両方が答える地点では**両者のピーク AQI の差と、区分が分かれるか**がモデル間の幅。

## 2. 実測（2026-11-20、実 API）

- 洪水（8 地点）: ケルン 本流セル 平年 695 m³/s・11-23 に 2,528（3.64 倍・high・メンバー全員 high）／パリ 43 m³/s → 11-25 に 155（3.58 倍・メンバーは elevated〜high で**割れる**）／東京 72 → 176（2.44 倍）／名古屋 11.9 → 33.0（2.77 倍）／ニューオーリンズ 11,092 → 11,587（1.04 倍）／パトナ 10,708 → 3,333（0.31 倍）／デリー 0.55 倍／サハラ NOT_A_RIVER。
- 3×3 の探索の効果: ケルンは地点に最も近いセルだと平年 0.66 m³/s（小さな支流）で 12.9 倍・high と出ていた。本流のセルを選ぶと 695 m³/s・3.64 倍。同じ地点で答えが 3.5 倍違う——探索なしでは「ライン川が氾濫する」と誤って言える。
- 大気: デリー 最大 AQI 238（Very unhealthy・PM2.5 は WHO 指針の 15.3 倍・全球域のみで幅なし）／パリ 欧州域 60 と全球域 70（差 10・同じ Moderate）／東京 93（PM2.5 5.2 倍）／サハラ 52（PM10 が主。砂塵）。

## 3. 引き継いだもの・しなかったもの

- 未接続の領域（都市熱・電力網・農業収量・地震被害）は**登録に理由つきで載せ**、`model.find` が「実行できない・なぜか」を返す。実行できると偽らず、数字を作らない。地震の揺れ・津波・降灰・放射性・煙・感染は IntMap 自身の `sim.*` が実行する。
- 新しいホスト `flood-api.open-meteo.com` を `scripts/outbound-hosts.json` に登録（送るのは座標のみ）。
- 洪水・大気質の分類語は登録の `keywords` から導く（語の表を別に持たない）。

## 4. 限界（回答にも書く）

- 洪水: 5 km 格子で小河川・都市排水を解かない。堤防・ダムの運用は入っていない。流量は「その川の直近 60 日との比」であって浸水の予言ではない。
- 大気: 格子セルの平均で、道路沿い・発生源の近くは高い。排出インベントリは数年遅れ。US AQI は米国の指数。
- 網に依存する検査は CI に置かない（`tests/specialist-models-checks.test.mjs` は注入した fixture。実 API での数字は上の測定として残す）。

## 5. 配信サイズの天井を上げた理由

`atlas-cap-runs` +7.9 kB（`model.find` / `model.run` の実行本体と、回答に載せる限界・不確実性の文）・`atlas-console` +6.7 kB（登録 2 行とカタログの説明文 2 項目を能力表が運ぶ）・async 合計 gzip +26.5 kB のうち残りは同じ 2 つのチャンクに入る `specialist-models.js`（登録・解析・runner）。能力そのものの増分で、削れるものは無い。`perf-budget.mjs --update` で上がった行だけ上げた。

main を取り込み直した後の再測定（同じ 3 行、同じ理由）: `atlas-cap-runs` 915.8 kB・`atlas-console` 1073.4 kB・async.raw 14308.0 kB。増分の内訳は専門モデル 2 能力（実行本体・登録・限界の文）で、main 側で並行に増えた能力の分と合わせた現在値。`perf-budget.mjs --update` で上がった行だけ上げた。

3 度目の取り込み後の再測定: `atlas-cap-runs` 921.4 kB・async.gzip 4841.6 kB・dist.assets 21802.1 kB。main で並行に増えた能力・資産の分も入った現在値で、`perf-budget.mjs --update` が上げた行だけ。専門モデル側の増分は上と同じ（登録・実行本体・限界の文）。

4 度目（main の bot が天井を main の実測へ下げた後）の再測定で、上がった行は 3 つ: async.raw 14382.1 kB・`atlas-cap-runs` 921.4 kB・`atlas-orchestrate` 94.6 kB。前 2 つは専門モデル 2 能力の増分と、並行して main に入った能力の分。`atlas-orchestrate` は main の chunk 分割（`atlas-delegate` の新設）に伴って測り直した値で、この PR の差分は 2 つの能力ファイルのみ（`atlas-orchestrate` のコードには触れていない）。`dist.total` は CI だけが data 込みで測る値で、ローカルでは上げていない。

## 6. 能力の id を `model.discover` から `model.find` へ（`subject-findable` が data.gisRemote を無言と判定した原因）

原因: カタログの 1 つの chunk（`spatial-analysis`）はレジストリ内で改行の継ぎ目で 3 つの断片に分けられ、各断片が chunk 全体の id 一覧を持つ。ある能力の入口 `{"type":"…"}` がその断片に無いとき、レジストリは能力 id の最後の語（`discover`）を引用符つきの裸の語として探す。`data.gisRemote` の引数列挙 `"action":"discover"|…` がそれに当たり、`model.discover` の入口と読まれて gisRemote の本文が 29 文字で打ち切られた（その結果、gisRemote の主題語が全て 0 点＝無言）。能力そのものの欠陥ではなく、id の最後の語が他の能力の引数名と同じだったことの副作用。直し方: id の最後の語を、カタログ内のどこにも引用符つきで現れない語（`find`）にした。呼び名（`modelDiscover` の type・利用者の語）は変えていないので、到達できる能力と回答は同じ。レジストリ側の「断片をまたぐ裸の語の誤認」は別の構造の問題で、この PR では触らない（記録のみ）。

5 度目の再測定（id 改名後・main の最新取り込み後）: async.raw 14489.5 kB・`atlas-cap-runs` 937.3 kB・`atlas-console` 1115.0 kB・`atlas-orchestrate` 108.2 kB・dist.assets 21926.2 kB。いずれも CI が測った超過値（14488.1 / 937.3 / 1113.6 / 108.2 / 21924.1）と一致し、main で並行に増えた能力・資産を含む。この PR 由来は専門モデル 2 能力（上の §5）で、`atlas-orchestrate` のコードには触れていない。`perf-budget.mjs --update` が上げた行だけ。`dist.total` は CI だけが data 込みで測る値のため、ここでは触れていない。

6 度目（main の取り込み後）: `atlas-cap-runs` 944.3 kB のみ超過（main の増分を含む現在値）。`perf-budget.mjs --update` が上げた 1 行だけ。専門モデル側の増分は §5 のとおり。あわせて `flood-api.open-meteo.com` の出口台帳は、別 PR の格子取得（広い範囲）と本 PR の点＋近傍 8 セルの 2 用途を 1 行に統合した。

7 度目（main の再取り込み後）: `async.gzip` 4918.1→4944.4 kB・`atlas-cap-runs` 938.6→953.4 kB・`atlas-console` 1129.9→1139.2 kB・`gis-core` 697.3→701.2 kB・dist.assets 21923.7→22075.9 kB を `perf-budget.mjs --update` が上げた。`gis-core` と `atlas-console` は本 PR が触っておらず、main が足した増分を取り込んだ現在値。専門モデル側の増分は §5 のとおり。

8 度目（main の再取り込み後・CI が測った超過）: `async.raw` 14569.8→14667.9 kB・`atlas-cap-runs` 952.1→963.8 kB・`atlas-console` 1139.2→1145.5 kB を `perf-budget.mjs --update` が上げた（ローカル再測定が CI の値と一致）。増分の大半は main が足した能力と画面で、専門モデル側は §5 のとおり。

9 度目（main の再取り込み後）: `async.raw` 14680.9→14788.0 kB・`async.gzip` 4956.6→4999.3 kB・`atlas-cap-runs` 989.3→1007.5 kB・dist.assets 22068.6→22234.8 kB を `perf-budget.mjs --update` が上げた。増分の大半は main が足した能力（能力表が 273 行）で、専門モデル側は §5 のとおり。

10 度目（CI が測った超過）: `atlas-cap-runs` 1001.0→1013.4 kB・`atlas-console` 1159.0→1166.7 kB を `perf-budget.mjs --update` が上げた（ローカル再測定が CI の値と一致）。増分は main が足した能力と画面。専門モデル側は §5 のとおり。
