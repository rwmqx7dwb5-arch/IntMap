# 公共交通の時刻表プランナー（自前・商用可の時刻表だけ）

> 正本: `js/transit-feeds.js`（どの時刻表をどの条件で使うか）・`scripts/build-transit-timetables.mjs`（GTFS→バンドル）・
> `js/transit-raptor.js`（探索）・`js/transit-planner.js`（ブラウザ側）。検査 `tests/transit-timetable-checks.test.mjs`。

## なぜ自前か
IntMap は営利である。Transitous（`api.transitous.org`）の利用規約（<https://transitous.org/api/>、2026-11-20 に読んだ）は
「商用利用は許されない」「非商用であること」「`/plan`・`/one-to-all` は 1 日 720 回超なら事前相談」と述べる。
IntMap はどれも満たさないので、**Transitous は既定で使わない**（`TRANSITOUS_FALLBACK = false`・1 行）。代わりに、
**配布元自身が商用可のライセンスで公開している GTFS** を `data/transit/<id>.json` に取り込み、ブラウザで探索する。
経路を尋ねても第三者へは何も送られない。Transitous が書面で許諾すれば、フラグ 1 つで戻せる。

## 何が正確で、何が見積りか
| | |
|---|---|
| 正確 | 乗り物の区間（停留所・便・時刻。分単位）。窓内の**日付ごとの運行日**で厳密 |
| 見積り | 徒歩／自転車の区間（出発地→停留所・停留所間の乗換・停留所→目的地）。**直線距離×迂回係数÷速度**であって道路経路ではない。各区間に `estimated: true` |
| 定期運行 | `basis: 'scheduled'`。結果の既定。**リアルタイムの値は持たず、遅延・運休を主張しない** |
| リアルタイム | バンドルが `realtime` を宣言したときだけ `scheduled+realtime`。いま宣言する feed は無い |
| 窓の外 | 14 日の窓の外の日付は**拒否**（`date-outside-window`）。近い日の「典型日」で答えない |

## 国境
区間の停留所列を国の輪郭（`window.countryGeo`）で歩き、国が変わるたびに通過として数え、`data/border-crossings.json`
（OpenStreetMap `barrier=border_control`）から最寄りの検問所と、述べられている開庁時間・通行条件を添える。到達圏は、
時刻表が国境をまたぐなら**線で切らずに**面を延ばし、到達した国の一覧を返す。

## 取り込み済みの feed
`node scripts/build-transit-timetables.mjs --list`。**追加の手順**: ① 配布元自身のライセンスページを読む（Transitous や
mobilitydatabase の一覧は手がかりであって確認ではない）② `js/transit-feeds.js` の `FEEDS` に `verified`（ページと日付）付きで足す
③ `GOVERNANCE` に同じ内容を足し `js/reference-data.js` の `DATA_SOURCES` に出典行を足す ④ ビルドして
`tests/transit-timetable-checks.test.mjs` を通す。商用不可（NC 系）は `licenceAllowsCommercial` が拒む。

## 更新
窓は 14 日なので 3 日周期（`cadence: P3D`・`autoRefresh`）。`.github/workflows/tle-refresh.yml` →
`scripts/data-refresh.mjs` が名簿から拾って bot PR で着地させる。ビルダーは引数なしで全 feed を回す。

## 限界（隠さない）
- 徒歩・自転車は直線推定。道路網での精密な到達は Valhalla の `isochrone`（既存）。
- `frequencies.txt` の便は展開しない（`stats.skipped.frequencyTrips` に件数）。
- 線は停留所を結んだ折れ線（形状ファイルを持たない）。
- 世界の被覆は取り込んだ feed の範囲。範囲外の公共交通は「利用許諾の得られた時刻表がまだありません」と答え、日本の都市間は既存の新幹線レジストリ（運行会社の公表時刻表からの概算・そう表示）が答える。
