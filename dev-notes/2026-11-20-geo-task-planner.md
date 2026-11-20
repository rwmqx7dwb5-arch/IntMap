---
title: 地理空間分析の計画が自由文だった——データが無い分析と実行できる分析を、実行前に区別できる構造にした
date: 2026-11-20
newsen: Atlas now keeps a geospatial analysis as a structured plan — region, time, data needed, how complete it must be, method, where it runs, what it delivers — says what the plan leaves out, and can check whether the data exists before running anything.
newsjp: Atlas が地理空間分析を、対象地域・時点・必要データ・完全性・演算・実行環境・成果物の構造として持ち、書かれていない項目を示し、実行する前にデータが存在するかを確かめられるようになりました。
---

〈依頼〉 技術監査(2026-11-20)P0 6.1: Atlas の作業計画を地理空間分析に特化させる Geospatial Task Planner。

## 0. 測った

- `plan` 道具(`js/atlas-plan.js`)は目標・手順名・いまの手順だけで、分析の中身(地域・時点・必要データ・完全性)は散文のモデルの頭の中にしか無かった。
- 存在を問う扉は既にあった: `IntMapGis.atlas.describe`(IntMap のレイヤー・データセット)、`remote({action:'discover'})`(STAC/OGC カタログ。場所と期間を述べた collection と licence を返す)、能力登録簿 `has()`。足りないのは、それを**計画に結び付ける構造**。
- Skills(#1282)は未 merge(open)。依存しない: 計画の構造は Skills と独立で、重ならない。

## 1. 足したもの(新しい能力・新しい道具は足していない)

- `js/atlas-geoplan.js`(純モジュール): `plan` の `geo` 引数を正規化(`normalizeGeo`/`mergeGeo`)。未記載は既定値で埋めず `gapsOf` が列挙、未知の語は値にせず返す。`preflight` が必要データごとに `available`/`partial`/`unavailable`/`unknown` を、環境ごとに能力の有無を述べ、全体を `runnable` true/false/null で返す。
- `plan.declare` が `geo` を保持し、答えに gaps を載せ、`geo.check:true` のときだけループ(`runOne`)が `preflight` を await して同じ答えに載せる。`promptBlock()` が以後の手に spec の未記載と可用性を載せる。後の呼び出しは変えた部分だけ、spec が変われば古い check は捨てる、手順を改訂しても spec は残る。

## 2. 判断の根拠(縛らない・偽らない)

- 何も拒否せず、手数・天井に触れない。`geo` は任意で、モデルが決める。コードの仕事は構造の観測と欠落の可視化だけ(`CONSTITUTION.md` §5)。
- 「答えなかった」は `unknown`、「全部のカタログが完全に答えて 0 件」だけが `unavailable`(`one-pass-or-a-reason.md` §5)。カタログは全域を持つと述べられないので `completeness:"all"` の必要は `unproven` のまま `runnable:null`(true にしない)。
- Overture は IntMap のどのカタログにも問えない: `unknown`(`unavailable` と偽らない)。upload も同様。
- 環境の対応表(`ENVIRONMENT_CAPABILITY`): browser-gis=`data.gis`、python=`compute.run`、server/job=無し。無い環境は「無い」と述べる。能力が足されたらこの表に足す(テストが登録簿の id と突き合わせる)。

## 3. 残したもの・否定した見立て

- 自動で check を走らせない(カタログへの通信を毎回の plan に課さない)。`check:true` はモデルの選択。
- 解像度・時点が実際に合うかまでは見ていない(カタログが述べる範囲は extent と time のみ)。合致の判定は `inspect` 後の `gis` の `coverage` が正本。
- server/job の実行基盤は存在しない。足すのは別の仕事(監査の他項目)。
- 検証: `tests/geo-task-planner-checks.test.mjs`(14 件・実ループ経由を含む)、既存 plan 系 3 本は緑。本番での Atlas 実測は夜間評価が停止中(secret 欠落)のため未実施。
