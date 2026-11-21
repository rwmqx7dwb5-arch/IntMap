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
- `scripts/build-transit-timetables.mjs` — GTFS を `data/transit-<id>.json`（14 日の窓・日別の運行マスク・分単位）へ。巨大な stop_times を流し読みする zip リーダー（`scripts/lib/zip-lines.mjs`・依存なし）。ルクセンブルクは zip 16 MB → 2.9 MB（gzip 250 kB）・11 秒。`autoRefresh`・3 日周期で既存の bot PR 機構に載る。
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

## 8. perf の天井を上げた理由
`async.raw` +約 94 kB（新しい遅延チャンク `transit-planner` 15.5 kB が 1 つ、残りは経路・Atlas の配線）、`dist.data` と `dist.total` が約 +7 MB（時刻表バンドル `data/transit-lu.json` 2.9 MB と台帳の帯幅）。起動時の取得は増えない（`transitTimetable` は経路を尋ねたときだけ取得する遅延モジュール・バンドルは該当地域でだけ読む）。

## 9. governance の台帳（data/transit-lu.json は 12 facet を宣言に持たない）
`scripts/build-transit-timetables.mjs → data/transit-lu.json` は `autoRefresh`（3 日周期の無人再ビルド）なので、取得日・生成日・件数をリテラルで宣言に書けない（再ビルドのたびに宣言が嘘になり、`agreeOrRefuse` が拒む形になる）。それらはバンドルの**中**に、測った本人（ビルド）が書く（`generatedAt`・`asOf`・`quality`）。宣言が述べる 7 facet（出自・ライセンス・出典・周期・ビルダー）以外は台帳に記録した。同じ形の既存の無人更新ビルダー（`build-who-don.mjs` など）と同じ扱い。

## 性能予算の引き上げ

- async.raw: 14304.0 kB から 14377.6 kB へ。- dist.assets: 21686.9 kB から 21813.3 kB へ。公開時刻表のカタログ（data/transit-feed-catalogue.json、約 2 750 件の判定つき）と交通計画の遅延チャンクが増えた分。 main 取り込み後の全体ビルドで測り直し、`perf-budget --update` が上げた行は下の通りで、他は書いていない。起動時に読まれる分ではなく、遅延して読まれる配布物。

- 性能予算 atlas-orchestrate: 82.4 kB から 96.1 kB（ceiling 98382 B）へ。main 側で増えた遅延チャンクで、台帳が古いまま残っていた分。全体ビルドで測った値（`perf-budget --update`）を、他の PR と同じ値で書いた。

- 性能予算の引き上げ（取り込み後の全体ビルドの実測）: 上の行のとおり。main 側で他の PR が足した遅延チャンクの分を含み、この PR の増加だけではない。起動時の読み込みではない。
