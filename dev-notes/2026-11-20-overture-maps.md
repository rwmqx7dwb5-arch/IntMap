---
title: Overture Maps を窓で読む——25 億件を取り込まず、言われた範囲のファイル・row group・列だけを読む
date: 2026-11-20
newsen: Atlas can now read Overture Maps (places, buildings, addresses, borders, roads) for a window you name, taking only the files, row groups and columns that window needs, with each row's own licence and the release it came from.
newsjp: Atlas が、指定した窓のぶんだけ Overture Maps（場所・建物・住所・境界・道路）を読めるようになりました。窓に要るファイル・row group・列だけを取り、各行が述べるライセンスと取得元のリリースを添えます。
---

〈依頼〉外部監査（2026-11-20）の指摘のうち「世界の標準データ（Overture）が供給源に無い」を、他セッションと触るファイルが重ならない 1 領域として実装する。

## 1. 何をしたか

- **`js/gis-overture.js`（新規・`window.IntMapGisOverture`）。** `release()`／`themes()`／`plan()`／`query()`／`acquire()`。
  結果は `window.IntMapData` のデータセットになり、次の手（`relate nearer-than` など）の入力になる。`js/gis-remote.js`
  には触れていない（remote-fetch セッションの担当）。公開 API の `publicUrl` だけを、あれば使う。
- **窓の読み方は 4 段**: ①STAC が述べるファイルの範囲 ②Parquet フッターの row group 統計（`bbox` の最小・最大）
  ③`bbox` と条件の列だけを走査して行番号を得る ④当たった row group の残りの列を読む。
- **Atlas の扉 `data.gisOverture`**（`js/atlas-cap-data.js`・`js/gis-atlas.js` の `overture()`）。
- **世界オブジェクト**: `worldNodes()` が `ids.gers` と、Overture が行に述べた元レコード（`sources[].dataset/record_id`）
  を持つ行を作り、`scripts/world-graph/ingest-overture.mjs` が冪等な SQL にする。新しい表
  `world_graph_id_history`（識別子の履歴）と、`world_graph_resolve_id()`（古い id からも同じ対象へ）、
  `world_graph_adopt_id()`（書く前に「この id はどの対象のものか」を訊く。位置・名前では決めない）。
- **出典・権利・プライバシー**: `scripts/outbound-hosts.json` に 3 ホスト、Privacy §4（en/jp）、DATA_SOURCES の 1 行と
  その説明（en/jp）、`data/connection-ledger.json`、セキュリティ／準備状況ページ（24 ページ再生成）。
  データ統治の語彙（`js/data-governance.js`）にはデータセットの `provenance` がそのまま読める形で記録する（その
  ファイル自身は「値を 1 つも書かない」規則なので、値は書き足していない）。

## 2. DuckDB-WASM か、サーバか、JS の Parquet 読みか——実測で決めた

| | 実測・確認 |
|---|---|
| 配信 | S3 バケットも STAC も `Access-Control-Allow-Origin: *`・Range 対応（`curl` で確認）。**サーバを挟む理由が無い** |
| DuckDB-WASM | 同じ Range 読みをするが、~30 MB の WASM と `wasm-unsafe-eval`（CSP）が要り、SQL の計画器まで抱える。仕事は「統計 2 つで絞る・2 列を読む・濾す」だけ |
| hyparquet（採用） | 0.5 MB の JS（+ zstd 0.2 MB）。動的 import で別チャンク。**アジアの places ファイル（566 万行）の東京湾 1°×1°（100 万行を走査）**: 行オブジェクトを作る読み方 46 s → 列チャンク＋8 並列 **8.4 s** |
| 費用 | 触ったファイルごとにフッター ~3 MB（3〜6 s）。メモリに 4 つまで保持 |

**実データ（`node scripts/overture-probe.mjs`）**: 北九州〜熊本の窓 `[129.8,32.3,131.1,34.0]`、リリース
`2026-11-18.0`。「半導体」を名前に持つ場所 5 行（17.5 s・12 MB・30 要求）、`marina` で名前に「港」を持つ場所 14 行
（17.4 s・20 MB）。**既存の `relate nearer-than maxKm:100` に通して 5 組・80 ms**。
⚠ **Overture の places に「seaport」「semiconductor」という分類は無い**（実測: 北九州の `taxonomy.primary` は
`marina` と `airport` だけ。半導体は名前での照合）。港湾に近いものは base テーマの infrastructure（`ferry_terminal`・
`pier`）にある。この探りは名前による照合であって、港湾や半導体工場の**悉皆ではない**。

**負けた設計（残してある理由）**: row group ごとに 1 範囲で読むと列チャンクを範囲ごとに取り直した
（14 group で 97 要求・95 MB）。範囲読みの重複はバイト範囲のキャッシュで解いた。**重いのは `sources` 列**
（1 row group 16 k 行で 2.9 s。他の列は 0.5 s 未満）＝ライセンスと元レコードを運ぶ列で、削れない。

## 3. 完全性の 3 つの主張（混ぜない）

①このリリースが窓について持つ行は全部読んだ（`coverage`＝`js/gis-sources.js` の `coverageOf`。`limit` で切れば `sample`）
②行の箱が窓に掛かる（`windowTest:'bbox-intersects'`。点は厳密、面は「幾何が掛かる」の上位集合）
③世界の全部である（`worldCompleteness:'unproven'`・常に）。

## 4. ライセンスは行が述べる値

places は CDLA-Permissive-2.0、建物・道路・境界・base は ODbL-1.0（OSM・Google・Microsoft 由来）、住所は国ごとの
CC-BY-4.0（実測 2026-11-20）。データセットの `licence` は**窓の中の行が述べた値の集合をそのまま**。1 行も述べて
いなければ**欄ごと無い**（沈黙は許諾ではない）。`attribution` は真偽値（どの条件も表示を求める）で、表示する文は
`attribution()` が publisher と licence から導く。

## 5. GERS は振り直される

Overture の公表値で月 ~6.5%。バケットは**リリースを 60 日で消す**（全オブジェクトの `x-amz-expiration`）ので、
URL をコードに書かず、リリースは STAC の `latest` から読む。ブリッジファイル（id と元レコードの対応）と
changelog（`added`/`removed`/`data_changed`/`unchanged` を `bbox` つきで、リリースごとに）も実在を確認した。
対象の同一性は**位置でも名前でもなく、Overture が行に述べた元レコードの一致**でのみ決める
（`world_graph_adopt_id`。「ほぼ同じ record_id」「別データセットの同じ record_id」は別物。2 つの対象が同じ record を
持つなら選ばない）。

## 6. 安全

STAC の `href` は**データ**。https・認証情報なし・私的でないに加え、**Privacy §4 が名指すホスト以外は取らない**
（`host-not-disclosed`。開示が契約で、カタログではない）。

## 7. 未了・正直に

- **Worker に載せていない。** 取得はメインスレッドで復号するので、`sources` 列の 1 チャンク（0.5〜3 s）の間ページが
  止まる。待ちごとに yield するが、復号の最中は譲れない。Worker 化（バンドラ経由のモジュール Worker）は別の仕事。
- **changelog の取り込みはまだ無い。** 履歴表は `status:'removed'` を持てるが、それを書くのは今は誰もいない
  （`present` だけが書かれる）。「この id は今のリリースから消えた」を機械的に書く経路は未実装。
- 建物（512 ファイル・25 億行）・道路の**大きな窓での計測はしていない**（places の 2 窓と infrastructure の小窓のみ）。
- OSM 由来の `record_id` は版（`w123@2`）を含み、版が上がると**一致しない**（ので鎖が切れる）。正規化は「推測」
  なので入れていない。
- 同じ窓を 2 回読むと 2 回走査する（フッターは覚えているが、走査結果は覚えていない）。
- パフォーマンスの天井（`tests/perf-baseline.json`）は PR の CI が決める。
