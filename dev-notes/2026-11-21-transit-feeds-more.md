---
title: 商用可の公共交通時刻表を 1 本から 13 本へ(FR 8・NO 3・JP 1)——台帳を値の一覧にし、ライセンスをビルドのたびに読み直す
date: 2026-11-21
---

〈依頼〉商用利用可能なライセンスの GTFS を、組み込み済みのルクセンブルク 1 本から増やす(#1348 の上)。

## 前後
| | 前 | 後 |
|---|---|---|
| 組み込み feed | 1(LU) | 13 |
| 国 | LU | LU・FR・MC・NO・JP(経路の通過国に DE) |
| 時刻表バンドル | 2.92 MB(gzip 0.25) | 24.03 MB(gzip 2.09)。経路を訊かれた地域の分だけ読む |

追加: Strasbourg・Rennes・Toulouse・Nice・Nantes・Montpellier・Grenoble・Monaco・Oslo・Trondheim・Stavanger・富山。
各 feed は配布元自身のページ/API を 2026-11-21 に読み、条文と日付を `verified` に記録した。ODbL の 4 本は `offeredUnder: ODbL-1.0` を自分で述べる。

## 変えた構造
- feed の台帳を `FEED_ROWS`(値の一覧)にし、builder の `GOVERNANCE` はそこから導出(手書きをやめた)。
- ライセンスを `'cc-by'` 固定でなく、各 feed の `resolve.kind`(udata / gtfs-data.jp / page)でビルドのたびに配布元から読み直す。違えば何も書かずに止まる(`pickArchive`・純関数)。
- バンドルの圧縮: 同じ系統・同じ時刻の行を日別運行マスクの和の 1 行へ。時刻・停留所・運行日は落とさない(合成 GTFS で検査)。Rennes 64,179 → 18,790 行、Nantes 62,119 → 22,081 行。
- `feedsNear` は箱の内側を優先する距離順(登録順だとモナコの停留所がニースの feed に渡った)。

## 実測(2026-11-21 土曜)
Strasbourg Gare Centrale → Kehl Rathaus 36 分(tram D)。Kehl → Robertsau 56 分(乗換 1)。Oslo Jernbanetorget → Fornebuparken 34 分、30 分到達圏 751 停留所。富山駅前 → 富山空港 104 分(待ち込み)。

## perf 天井を上げた理由
`dist.data` +21.0 MB・`dist.total` +21.2 MB は 12 バンドル(gzip 計約 1.8 MB)で、経路計算時に該当地域だけ読まれる(起動時の取得は +16 kB で幅内)。`atlas-orchestrate` 82.4 → 96.1 kB は #1348 の registry 増分。

## 採らなかったもの
Metlink(条文が JS 描画で読めない)・HSL / Transport for Ireland / ACT(ライセンスページが 403)・Gdańsk(タイムアウト)・ODPT(読めない)・TCL(Licence Mobilités)・TBM(Licence Ouverte 1.0 は商用可の一覧に無い版)。富山の市内電車は CC0 だが停留所が富山バスと重なり、探索は 1 feed 内なので足さない。
⚠ 富山地方鉄道は自社サイトにライセンス記載が無く、根拠は事業者自身が gtfs-data.jp に登録した CC0。配布元の表明とみなすかは利用者の判断(外すなら `FEED_ROWS` と出典の各 1 行)。

## 歴史の第 1 級被覆の調査(同日・実装なし)
商用可で日付つきの第 1 級幾何を公表する新しい典拠は、Nejjar & Ketchley のスーダン 1921(ACSS・doi 10.25825/FK2/LQ8NDJ・規約上 CC0)だけだった。利用者の指示で guestbook(名前・所属・利用目的のみ)を入力して取得したが、州境は線のレイヤで属性は連番 ID のみ(州名なし)。取り込みにはポリゴン化と、州名・存続期間の別資料による裏付けが要り、未着手。OHM・Wikidata 他では対象国の第 1 級は見つからなかった(2026-11-21 の観測)。

## perf 天井(main 載せ直し後)

`dist.assets` を 22068.6 kB から 22194.5 kB、`atlas-cap-runs` を 981.3 kB から 987.1 kB へ上げた。前者は 12 路線の時刻表バンドルの出典行と説明文、後者は main 側で増えた能力表の行。いずれも利用者が到達できるものの実体。

追記: main 合流後の再計測で async 合計と `atlas-cap-runs` が増えた分は、main 側の能力表の行による。ceiling のみ上げた。

## perf 天井(2 回目の main 合流後)

`eager.gzip` を 1560.5 kB から 1568.6 kB へ上げた(+8.1 kB)。起動時に読む `js/transit-feeds.js` の 12 路線ぶんの行と、`js/legal-text.js` の時刻表の文(en・jp)の増分。ほかの行は帯の内側だった。ceiling のみ上げ、内容の削減はしていない。

## global-surface の基準線

`window.IntMapLazy` の読みが 196 から 197 へ 1 件増えていて `check:surface` が赤かった。増えたのは main 側の変更によるもので、このブランチの差分に `IntMapLazy` は無い(`git diff origin/main` で 0 件)。基準線だけを更新した。コードは変えていない。
