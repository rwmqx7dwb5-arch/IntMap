---
title: 発見したデータを「分析できる」とは見なさない——取得の段を状態で持ち、日付変更線・ログイン・応答しないカタログを正確に扱い、データセットを性質で横断検索する
date: 2026-11-20
newsen: Atlas can now see how far each discovered dataset got (found, readable, fetched, inspected, registered), read windows that cross the date line from two files, report data behind a login as blocked, and search datasets by content, place, period, resolution, cloud and licence.
newsjp: Atlas が、発見したデータが「見つかった・読める・取得できた・中身を確認した・登録した」のどこまで進んだかを見られるようになり、日付変更線をまたぐ範囲を 2 つのファイルから読み、ログインが要るデータを「取れない」と正確に報告し、内容・場所・期間・解像度・雲量・ライセンスでデータセットを横断検索できるようになりました。
---

〈依頼〉外部監査（2026-11-20）の P1（5.11 / 6.5）。#1286 で「発見はできるが取得できない」穴は塞いだが、**残り 3 つ**（日付変更線をまたぐ窓は片側が NaN／認証が要るデータ／応答しないカタログ）と、**「発見した＝分析できる」と読める構造**が残っていた。加えて、データセットを語・場所・期間だけでなく解像度・品質で探せなかった。
⚠ #1286 は本記録の作成時点で CI 待ち・未 merge。本変更はその上に積んである（`gis-fetch.js` と署名を前提にする）。

## 1. 構造

| 部品 | 何をするか |
|---|---|
| `js/gis-pipeline.js`（新） | 段の台帳 `discovered → access → fetched → inspected → dataset`。各段 `ok / partial / failed / blocked / unknown / pending`。**`analysis` は記録できず**、`verdict()` が段から導出する（`ready` / `ready-partial`＋欠けた所 / `not-ready`＋止まった段）。失敗は書くとき理由が要る。同じ段を読み直すと、その上に載っていた段は `pending` に戻る（古いバイトの検査を新しいバイトに付けない） |
| 同・`classify()` | 拒否コード＋応答の言葉 → **種類**（login・forbidden・needs-signing・cors・unresponsive・unreachable・upstream-error・rate-limited・budget・gone…）と `blocked / unknown / failed` と再試行可否。**観測できなかった（再試行可）／観測して無かった／あるが取る立場にない（迂回しない）**を混ぜない。読み手が宣言した拒否コードを全部歩く検査が、表に無いコードで落ちる |
| 同・検査 | `inspectRaster`（空・全 nodata・一部 nodata・述べられた値域の外）、`inspectFeatures`（空・幾何なし・窓の外）。空は「この窓では空」であって「世界に無い」ではない |
| `js/gis-atlas.js` | `fromUrl` / `fromOgc` が読みの前後で台帳に書く（`readFailed` / `readSucceeded`）。取得行に `acquisition:{analysis,blockedAt,say}` を載せる。⚠ **`remote()` は呼ぶたびに `makeGisRemote` を作り直していた**＝`add` で足したカタログが次の `discover` で消え、10 分のコレクション・キャッシュも一度も効いていなかった。1 セッション 1 インスタンスにした |
| `js/gis-remote.js` | `acquire(ref,{bbox,width,height})`（1 つの ref を全段に通して**状態**を返す）・`probeAsset`（ファイルの最初の 1 KiB を匿名で読めるか）・`items`（STAC `/search` で窓・期間のシーン）・`search`（下記） |
| `js/gis-catalog-search.js`（新・純関数） | 語（**置き場所で重み**: 題名>キーワード>id>説明）・場所・期間・**解像度 m**（`summaries.gsd` / `raster:bands` / `item_assets`。題名の数字からは読まない）・雲量・ライセンス有無・種別・出所を判定。**述べていない項目は「不明」で残し**（`strict` で落とす）、`stated`（記録が述べた事実の数）は**品質ではなく率直さ**。このセッションが持つデータセットも同じ一覧に入る。ファセット件数と落ちた件数を返す |
| Atlas | `data.gisRemote` に `search / items / acquire / status` を足した。説明に「`ready` でないものを分析の入力にしない」「blocked は迂回しない・unknown は『無い』と言わない」 |

## 2. 実測（2026-11-20・実在カタログ・Node の fetch から）

| 問い | 結果 |
|---|---|
| **日付変更線**（Copernicus DEM を Earth Search 経由・`[179.6,-16.8,-179.6,-16.2]`） | **解決**。東側＝`…S17_E179` タイル、西側＝`…S17_W180` タイルを**別々に**読み、2 データセット・各側 `ready`・6.1〜6.8 s。#1286 では東半分だけ（`partial`）だった。⚠ 初版は両側に同じ `W180` を選んで同じキーが衝突した——**サーバは縁に触れるだけの隣のタイルも返す**ので、アイテム自身の bbox が窓の側を覆うものだけを候補にした |
| 通常の窓（Copernicus DEM・ベトナム北部） | `ready`・8.3 s。Planetary Computer `sentinel-2-l2a`（署名経路）`ready`・10.3 s、`sentinel-1-rtc` `ready`・7.5 s |
| **認証が要るデータ**（USGS landsatlook を `add` して `acquire`） | `access: blocked:login`・「ホストは匿名の読み手をサインイン画面（`https://ers.cr.usgs.gov/login`）へ送る」・**読み手は呼ばれない**・再試行不可。#1286 では `http-status` 200 として報告されていた |
| **応答しないカタログ**（自前の時計を 3 s にして NASA CMR-STAC LPCLOUD・793 コレクション） | `answered:false`・`why:timeout`・`kind_of_silence:unresponsive`・3020 ms。同時に問うた Earth Search は 592 ms で答え、検索は続く。実際の全件取得は **16.0 s**（9 ページ）——台帳が `unanswered` を数える。⚠ 遅いカタログがあると `search` 全体が最も遅いものを待つ（既知・下記） |
| `search q=elevation bbox=ベトナム北部 maxGsd=40`（5 カタログ全部） | 16.7 s・80 件・ファセット {catalog: nasa 73 / PC 6 / earth-search 1}・{resolution: unstated 73 / ≤100 m 5 / ≤10 m 2}・落とした: 語 997・場所 12・解像度 2。上位 8 は ASTER/GEDI（解像度は**述べていない**ので不明のまま）と ALOS 30 m・Copernicus 30 m（述べている・`5/5`） |
| `search q=sentinel maxGsd=10 maxCloud=20 licensed items time=2024` | 22 件→上位 4。**シーン**: Earth Search `sentinel-2-l1c` 一致 1969 件・先頭 `S2B_48QWJ_20241228_0_L1C`・雲量 16.4%。コレクションの `eo:cloud_cover` は述べていないので `cloud:unstated` と注記 |

## 3. 検査

`tests/gis-data-acquisition-checks.test.mjs`（27 件・偽の STAC/資産サーバ＋台帳）: A 台帳（`analysis` を書けない／理由なしの失敗を書けない／導出／unknown と failed と blocked／読み手が宣言した拒否コードを**読み手のソースから歩いて**全部分類／読み直しで下の段を無効化／`combine`）、C 中身の検査と日付変更線の分割、D 検索（解像度の読み取り元・語の重み・unstated の扱い・場所と期間・held の合流・応答しないカタログの種類・発見は発見までしか記録しない・順序の再現性）、E `acquire`（全段 ready／ログインは blocked で読まない／403・500・全 nodata／日付変更線は各側の bbox が覆うアイテム／片側が無ければ親は `ready-partial` でその側を名指す／窓と解像度を推測しない）、F 扉・供給元名がコードに無い・扉が `analysis` を書かない。

## 4. 残したもの・限界

- **2 ファイルは 2 データセット**（モザイクにしない）。1 枚に縫うのは同一ファイル内（#1286）だけ。縫う演算が要るなら別の判断。
- 遅いカタログがあると `search` はそれを待つ（NASA は 16 s）。カタログごとの期限で先に返す形は未実装（`kind_of_silence` と所要 ms は返す）。
- 認証が要るデータは**読めない**。迂回しない（資格情報を預からない）。USGS Landsat が要るなら Planetary Computer の `landsat-c2-l2`。
- 台帳はメモリ（1 セッション）。永続しない。
- 検索のサーバ側押し下げ（STAC collection-search / free-text 拡張）は使っていない: 実在カタログで対応がまちまちで、結果は常にクライアント側の判定が正本。件数が数千のカタログが出たら別途。
- OGC API – Records は未対応（Features と STAC のみ）。
- 全 nodata の格子は、レジストリには**入りうる**（従来の挙動を変えていない）。台帳が `dataset: failed` と述べ、取得行の `acquisition.analysis` が `not-ready` になる。
