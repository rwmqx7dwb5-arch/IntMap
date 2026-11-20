---
title: 公共交通の経路と到達圏を、商用可ライセンスの公表時刻表から自前で計算する（Transitous は既定オフ）
date: 2026-11-20
newsen: Public-transit trips and reachable areas now come from operators' own published timetables, transfers included, scheduled rather than live. Luxembourg is first, and it reaches across the border into France, Germany and Belgium.
newsjp: 公共交通の経路と到達圏を、事業者が公表した時刻表から乗換込みで計算するようにしました（定期運行であり、リアルタイムではありません）。第 1 弾はルクセンブルクで、フランス・ドイツ・ベルギーへの国境越えも含みます。
---

〈依頼〉GTFS 等の実在する公開フィードで、乗換を含む時刻表ベースの移動計画と到達圏を、定期運行とリアルタイムを区別して実装し、ライセンス確認と出典表記を同時に行う。

## 0. 測った（既にあったもの）
経路は OSRM・Valhalla・Transitous/MOTIS、国境通過の数え上げ（`routing-ops.js`）、Valhalla の徒歩・自転車の到達圏、国境検問所 9,582 件（`data/border-crossings.json`）があった。足りなかったのは **時刻表に基づく到達圏**（鉄道は OSM の速度見積り）と、**フィード別のライセンス確認**。

## 1. ライセンスの発見
Transitous の利用規約（<https://transitous.org/api/>、2026-11-20）は「商用利用は許されない」「非商用であること」「`/plan`・`/one-to-all` は 1 日 720 回超は事前相談」。IntMap は営利（利用者 2026-10-06）なので、**既存の公共交通経路もこの規約に抵触していた**。利用者に確認し「規約準拠を最優先」と決まった。

## 2. 作ったもの
- `js/transit-feeds.js` — 台帳。商用可の SPDX だけを通す（`licenceAllowsCommercial`）。各行に配布元のライセンスページを読んだ日（`verified`）。`TRANSITOUS_FALLBACK = false` が既定オフの 1 行。
- `scripts/build-transit-timetables.mjs` — GTFS を `data/transit/<id>.json`（14 日の窓・日別の運行マスク・分単位）へ。巨大な stop_times を流し読みする zip リーダー（`scripts/lib/zip-lines.mjs`・依存なし）。ルクセンブルクは zip 16 MB → 2.9 MB（gzip 250 kB）・11 秒。`autoRefresh`・3 日周期で既存の bot PR 機構に載る。
- `js/transit-raptor.js` — RAPTOR（回数ごとの最早到着）。徒歩・自転車は直線×迂回係数の**見積り**で `estimated: true`。窓外の日付は拒否。
- `js/transit-planner.js` — MOTIS 形の旅程へ変換（既存の経路カード・地図描画をそのまま使う）、到達圏の入れ子ポリゴン、国境通過＋最寄りの検問所の開庁時間。
- 配線: `routing.js` `_planItins` が自前を先に引く／Atlas の `isochrone`（transit）が時刻表の到達圏を描く（`departAt`・`access:"bike"`）／`sims.js` に描画。

## 3. 定期運行とリアルタイム
全結果が `basis: 'scheduled'`・`realtime: false`。バンドルが `realtime` を宣言した場合だけ `scheduled+realtime`（いまは無い）。返答文は「時刻表であり、遅延・運休は反映されない」と述べる。

## 4. 能力の変化（正直に）
Transitous を既定オフにしたので、**ルクセンブルク以外の公共交通経路は「利用許諾の得られた時刻表がまだありません」になる**（日本の都市間は既存の新幹線レジストリが答える）。feed の追加は台帳に 1 行＋ライセンスページの確認＋ビルド。Transitous が書面で許諾すれば `TRANSITOUS_FALLBACK = true` で戻る。providers 表（`routing-providers.js`）は凍結テストが motis を第 1 位と固定しているため触っていない。

## 5. 限界
徒歩の道路経路は持たない（直線推定）／`frequencies.txt` 非展開／形状なし（停留所を結ぶ折れ線）／リアルタイム feed は未接続。

## 6. 検査
`tests/transit-timetable-checks.test.mjs`（13 件）— 手作りの小網で乗換・乗り遅れ・日別運行・深夜越え・窓外拒否・徒歩/自転車の別・夏時間、ルクセンブルクの実バンドルで計画と越境到達。

## 7. 新しい結合（global-surface の台帳）
`window.IntMapTransitTimetable`（遅延取得の自己登録・`routing-traffic.js` と同じ形）を 1 つ足し、読み手は `routing.js` の `_planItins` と Atlas の `isochrone` の 2 か所。`IntMapLazy` の読みが 4、`IntMapTransitReach` が 1、`countryGeo` と `turf` が各 1 増える（描画と国の輪郭は既存の共有物）。台帳は `--update` で受けた。
