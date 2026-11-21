---
title: GIS に「つながり」の分析を足した——中心性・最大フロー／最小カット・代替経路・障害時の影響範囲（network / networkDisrupt）
date: 2026-11-20
newsen: Atlas can now analyse networks as connections, not distances - which node matters most, where the bottleneck is, what the next-best routes are, and what is cut off when a zone goes down - for any line dataset such as submarine cables, rail or shipping routes.
newsjp: Atlas が網を距離ではなくつながりとして分析できるようになりました。重要な結節点、ボトルネック、次善の経路、ある区域が止まったときに切り離されるものを、海底ケーブル・鉄道・航路などの線データから求めます。
---

〈依頼〉 外部監査(2026-11-20)の指摘——既存のルーティングは経路探索中心で、港湾・鉄道・電力網・海底ケーブル・
サプライチェーンを「距離でなくつながり」として扱えない。中心性・最小カット・代替経路・容量つきフロー・障害時の
連結性を、`gis-core.js` の演算契約（単位・時間・出典の継承）に従って足す。

## 何を足したか
- `js/gis-network.js`（新規・純粋カーネル・`window.IntMapGisNetwork`・`network-1`）: 線→グラフ（端点／頂点・
  3 次元格子での `snapKm` 併合）、Brandes 媒介、調和近接、Dinic 最大フロー＋最小カット、Yen の k 経路、
  無傷と障害の同一標本での比較。全ての反復は `tick` で時間に譲る。
- op `network`（`analysis`: centrality / maxflow / alternatives）と `networkDisrupt`（網 ＋ 区域）。
  `js/gis-ops.js` には宣言・配線・薄い runner（`runNetwork`）だけ——算術と行の組み立てはカーネル側。
  `vectorOutTime` に `rule:'none'` を 1 行（行がノードの答えは行ごとの時間軸を継がない）。
- Atlas: `atlas-cap-data.js` に断片 1 つ（`data.gis` の `op` として呼べる）。panel に拒否 2 つの文
  （`endpoint-not-found`・`no-route`）。文書 `docs/GIS-CORE.md` §2.1 の表と新設 §2.11。

## 測った
- 検証は総当たり: 媒介＝全最短路の数え上げ、最大フロー＝辺の部分集合の列挙で見つけた最小カット（返したカットは
  両端を切り容量の和が流量）、代替経路＝全単純路の列挙、障害の損失＝壊れた網の Floyd–Warshall。13 本。
- 実データ（海底ケーブル 3,491 本）: `snapKm:1` で 2,926 ノード／3,444 辺・261 成分、`snapKm:5` で 2,698／3,317・
  226 成分。台湾海峡（118–120.2E・22.8–25.6N）で 10 本が切れ、到達不能な対は 0.001〜0.002 %（台湾は東側にも
  陸揚げがある）、最も荷重の大きかった取り除かれた辺は 1 本で媒介 18,000〜37,000。障害全体が約 1〜2 秒。
- この網は**ケーブルごとに端点を共有しない**ので成分が多い——データの性質であり `componentsBefore` が述べる。

## 設計で決めたこと（否定した案を含む）
- 名指した費用が欠けた辺は**長さで代用せず除外して数える**（時間の列に km が混ざるため）。容量が欠けたら 0。
- 標本は黙らない: 起点が `maxSources`（既定 512・時間の予算）を超えたら `exact:false`・`sourcesUsed`。
- 区域の判定が決められなかった辺は「触れていない」にせず `zoneUndecided` と台帳へ（記録は partial）。
- `flow-unbounded` という拒否は作らない（容量は有限。`from`/`to` の重なりは `bad-param`）。

## まだやっていないこと
- **船舶の航路と港のデータセットはこの層に無い。** 「台湾海峡の海運が止まったら」を海運そのもので答えるには、
  航路（線）と港（ノード）の実データセットを取り込む別の仕事（出典・利用規約・`data-governance` を伴う）が要る。
  いまは同じ op が海底ケーブル・鉄道・LNG ターミナル網で動く。
- ノード容量（港の取扱量）を使うフローは未対応（辺容量のみ）。

## 予算と台帳（CI が求めたもの）
- `check:surface`: 大域名 `window.IntMapGisNetwork` を 1 つ足した（`--update`）。他の GIS カーネルと同じく、`gis-ops.js` が呼び出し時に名前で読む唯一の形（`IntMapGisVoronoi` と同じ契約）。読みは 1 本。
- `check:perf`: `gis-core` チャンクが約 26 kB 増えた（新しい純粋カーネル `gis-network.js` ＋ `atlas-cap-runs` に能力の断片 1 つ）。増えた理由はこの機能そのもので、天井を `perf-budget --update` で上げた。
- `atlas-console` チャンクの天井も上げた（約 5.6 kB）。Atlas の能力表に `network` / `networkDisrupt` の断片を足したぶん。

## 予算の天井を上げた理由(2026-11-21・main 取り込み後に再測定)
- `check:perf`: 非同期 gzip 合計 4771.5 → 4799.1 kB（+27.6 kB）。`network` / `networkDisrupt` の算術（`js/gis-network.js`）と能力表の行が遅延チャンクに入った分で、起動時に同期で読む JS は増えていない。main の最新を取り込んだ木で完全な build を作って測った（CI が測る木と同じ）。

- `scripts/gis-kernel-versions.mjs`: `js/gis-ops.js` の版ハッシュを main の最新と合わせて記録し直した（ops-14 のまま。既存の答えは変わらない）。

## 性能予算の引き上げ

async.raw を 14304.0 kB から 14384.5 kB へ引き上げた。網の分析（js/gis-network 系）が遅延チャンクとして増えた分で、起動時に読まれる分ではない。main の取り込み後に全体ビルドを測り直して `perf-budget --update` が上げた行はこの 1 行だけ。
