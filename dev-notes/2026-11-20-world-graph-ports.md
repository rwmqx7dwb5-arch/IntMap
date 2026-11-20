---
title: 世界グラフの 2 つ目の領域=港湾——3 つの独立した典拠を識別子で結び、毎週の差分取り込みと鮮度の記録を持たせた
date: 2026-11-20
newsen: Atlas can now answer about ports from a database that refreshes itself every week — operators, owners, UN/LOCODE, the rail and road a port is stated to connect to, and cargo handled per year back to 1997, with the date the data was last confirmed.
newsjp: Atlasが港湾について、毎週自動で更新されるデータベースから答えられるようになりました。運営・所有企業、UN/LOCODE、接続が述べられた鉄道・道路、1997年からの年間貨物取扱量を、最終確認日つきで返します。
---

〈依頼〉 LNG の縦串（`dev-notes/2026-11-19-world-graph-persistent.md`）を LNG 以外へ広げ、継続更新できる取り込み基盤にする。1 つの典拠にだけ訊かない。

## 0. 典拠を実データで訊き直した（2026-11-20）

前回の結論（港湾は Wikidata に運営者・取扱量が乏しく、接続鉄道は 0 件、貨物量の推移が無い）は **Wikidata だけに訊いた結果**だった。3 つ以上に訊くと違った。

| 典拠 | 訊いたこと | 実測 |
|---|---|---|
| Wikidata（SPARQL・CC0） | 港湾（Q44782 とその下位）の件数と各述べの数 | 11,338 項目。**UN/LOCODE 947**・運営者 P137 1,232・所有者 P127 228・OSM relation P402 149・throughput P2957 50・P2789 118・P81 10。前回の「鉄道線への P2789 は 0」は**正しい**（P2789 の対象は水路が大半）。**P81 の対象が鉄道線／港の鉄道なのは 6 件**。 |
| UN/LOCODE（UNECE の一覧・datasets/un-locode の写し、2026-11-01 更新） | 港の地点に付く**機能の旗** | 公式の配布 URL（service.unece.org・unece.org）は自動取得に 403。GitHub の写しは最新。旗は 1=港 2=鉄道ターミナル 3=道路ターミナル 4=空港 …。**Wikidata の港 505 件に鉄道ターミナル、886 件に道路ターミナルの旗**。これは「その地点にある」という述べで、特定の路線への接続ではない。 |
| Eurostat `mar_go_aa`（港ごと・年ごとの総取扱貨物量・千トン） | 港の時系列 | **1997〜2025 の 29 年・約 1,750 の港コード・31,548 値**。コードは `NL_0NLRTM` の形で**中に UN/LOCODE が入っている**ので Wikidata の P1937 と識別子で結べる（Rotterdam 2025 = 390,170 千トン）。EU/EFTA/英国/トルコの港。 |
| OSM（Overpass） | 港と鉄道の取り方 | 公開 Overpass は 406（User-Agent なし）→ 502（満杯）で測れず。それより前に**方針で採らない**: 港の `landuse=port` と鉄道線の幾何の近さは述べではなく推定で、`CONSTITUTION` の推測禁止に反する。OSM は **P402（relation id）による識別子**としてだけ使う（`ids.osm`・63 港）。 |
| 米 BTS の港湾統計（data.bts.gov） | EU 外の取扱量 | Top 25 は **story 形式で表として読めない**（API が `non-tabular tables`）。表の `rd72-aq8r`（月次 TEU）は港名の列で、識別子が無く名前で結ぶことになる。採らない。 |
| 各港湾庁（Rotterdam・Hamburg の年報） | 年次の取扱量 | 機械可読の公開が無い（Eurostat が同じ数を既に持つ）。 |

**結論**: 運営・所有（Wikidata）・機能の旗（UN/LOCODE）・年次の貨物量（Eurostat）は、**識別子（P1937 ⇄ LOCODE ⇄ Eurostat の港コード）で結べる**。鉄道・道路への接続は、述べられた分（P81・P2789 で対象が鉄道線／道路）だけが辺で、残りは機能の旗という「地点の述べ」にとどめる。EU 外の貨物量の時系列は**まだ無い**（回答も「無い」と言い、推定しない）。

## 1. 作ったもの

- `supabase/functions/_shared/world-graph-ports.js`（純粋・Edge Function と node の検査が同じものを読む）: SPARQL 6 本（関係ごとに 1 本。OPTIONAL を並べると行が掛け算になる）・Eurostat の JSON-stat と UN/LOCODE csv の解析・識別子での結合。
  - 同じ LOCODE を持つ 2 つの Wikidata 項目は**統合しない**（数字は運営／所有を述べる側、無ければ Q の若い側へ。実測 6 組）。
  - Eurostat の港コードが LOCODE でないもの（Antwerp-Bruges `BE003`・「その他の港」`BE888`）は落とす。Wikidata に LOCODE で無い Eurostat 港は UN/LOCODE の記録から `facility:locode-XXXXX` の対象にする。
  - 国は Wikidata が alpha-3、UN/LOCODE が alpha-2。Eurostat だけの港の国は、同じ接頭辞を持つ Wikidata の港が**全員一致して述べる alpha-3** だけを使う（国の表は書かない）。
  - 実測（本番に未投入の dry run）: 対象 3,860（港 3,470・企業 386・鉄道線 3・道路 1）・辺 1,469（運営 1,225・所有 220・接続 4・部分 20）・値 30,694・貨物量の時系列を持つ港 1,609。
- `supabase/migrations/20261120120000_world_graph_ingest.sql`（**加算のみ**）: 3 表に `feed`／`feed_run`（NULL=feed 導入前の seed。どのフィードも触らない）・`world_graph_ingest_runs`・RPC `world_graph_ingest_begin／apply／finish／fail`（service_role のみ）・`world_graph_freshness()`（全員）・`world_graph_find` が `facts.names`（英・日の名前・LOCODE の名）にも完全一致。毎週月曜 03:37 UTC の pg_cron（vault に秘密があるときだけ POST）。
- `supabase/functions/world-graph-ingest`（23 本目）: 3 つの上流を取り、`apply` を 4,000 値ずつ呼び、`finish`。上流のどれかに届かなければ **failed として記録して終わる**（薄い絵を反映しない）。
- `js/world-graph-store.js` に `freshness()`、`research.object` が答えの末尾へ「最終確認・Eurostat の更新日」（直近が失敗なら失敗と）を出し、長い時系列は**新しい 5 期間＋全期間の幅**で出す（モデルへ渡す `W.brief` は全行のまま）。UN/LOCODE の旗も 1 行目に出る。dispatch の doc（SYS）へ港湾の使い方を足した。

## 2. 設計の判断

- **所有（`feed`）は行ごと。** 2 つのフィードが同じ会社ノード（`company:shell`）を述べても、先に書いた側のもので、後からは書き換えない。退役はその feed の行だけ。会社や対象は、他の何かが結ぶ限り消さない。
- **退役には柵がある。** 上流が薄く返したことと上流が取り下げたことは別なので、フィードの 40% 超を退役する実行は `refused`（何も消さない）。実測（PGlite・35,821 行）で 100 行だけの返答は 35,721 行の退役を拒んだ。
- **改訂は同じ行を更新する。** Eurostat は過去値を改訂する。`(対象, key, 期間, 出典)` を 1 行とする部分一意索引を足し、値が違えば更新。seed や別フィードが同じ数を同じ出典で述べているなら、その行の持ち物のまま。
- **鮮度は記録として持つ。** 各行の `retrieved` は「最後に確かめた日」になり（変わらない行も）、実行そのものが上流の申告（Eurostat `updated`）と件数と共に残る。`world_graph_freshness()` は最後の ok と**直近の試行の状態を別々に**返し、失敗や拒否が古さに隠れない。
- **facts は純粋なスカラのみ**（`js/atlas-geo-object.js`）なので、機能の旗は `"port, rail, road"` の文字列で持つ（配列にすると世界オブジェクトへ入るとき黙って落ちた。実測で検査が捕まえた）。`names` の配列は DB の検索専用。

## 3. 検査

- `tests/world-graph-ports-checks.test.mjs`（5 件）: 実データ（上の 3 つの上流の実応答を数港に切った `tests/fixtures/world-graph-ports/upstream-sample.json`）。Eurostat の値は公開セルと一致・LOCODE でない港コードは出ない・同じ LOCODE の 2 項目は統合されない・述べられていない日付は欠けたまま・接続は鉄道線か道路だけ・Atlas が日本語名と `unlocode:` で港を見つけ、系列を圧縮して出し、鮮度を述べ、失敗した更新を言う。
- `supabase/tests/52_world_graph_ingest_test.sql`（pgTAP 33 件）と `51`／`00_structure` の更新。**pgTAP 自体の実行は CI。** ここでは PGlite（Postgres の WASM）に 3 つの migration を流し、同じ主張を最小の pgTAP 代用品で通した（全件通過）。service_role は実環境では BYPASSRLS を持つので、代用品側でも同じにした。
- 実データの全量（31,548 + 30,694 件）を PGlite へ流して、初回 7 s・同じ入力の 2 回目は全部「同一」・改訂 1 件は 1 行更新・取り下げは退役・薄い返答は拒否を確認。

## 4. 否定した見立て・未着手

- 「港湾から鉄道線へ辺が無い」は**半分だけ正しかった**（辺は 4 本・述べは地点の旗として 505 港に）。OSM の幾何で辺を作る案は採らない（推測）。鉄道事業者の貨物ターミナル表など、述べのある典拠を決めてから。
- EU 外の年次貨物量（米・日・中・シンガポール）: 機械可読で識別子つきの公開が見つからなかった（上表）。各国統計を足すときは同じ `claims`（期間つき）へ入れる——表は変更不要。
- TEU・旅客・貨種別（Eurostat の別データセット `mar_mg_aa_*`）は未取り込み。同じ結合で足せる。
- Wikidata の港は運営・所有の述べを持つものが少数（Hamburg Port Authority 等は在る）。拡張は上流が述べるまで増えない。
- 本番での初回取り込みは、関数を deploy して秘密を置いて 1 回呼ぶ手順（`AGENT-SETUP` の名簿・下の本番検証）。Edge の実行時間が 150 s を超えるかは本番で測る（ローカルの取得だけで約 60 s）。

## 5. 予算の引き上げ(理由)

- 非同期チャンク `atlas-cap-runs` が 884.2 → 889.2 kB: `research.object` に鮮度の行・系列の圧縮表示・港湾の dispatch 説明を足した分(起動経路ではない遅延チャンク)。`dist.assets` の増分はこの 5 kB と、`origin/main` 側で同時に入った別の資産(`gis-packed` など)。
- `check:static` の週次 cron の数え方: `runsPerDay` は日・月・曜日が `*` でない予定を拒んでいた。曜日の列だけを数える(週次=列挙した曜日数/7)。日付指定・範囲は引き続き拒否(推測しない)。
