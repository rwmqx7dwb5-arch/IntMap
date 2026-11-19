---
title: 世界オブジェクトの索引がページの寿命で消えていた——Supabase に永続グラフを置き、LNG ターミナル→運営・所有企業→取扱量の縦串を実データで通した
date: 2026-11-19
newsen: Atlas can now follow facilities, their operators and owners (with the dates each tie held) and stated capacity from a database that outlives the session — starting with the world's LNG terminals.
newsjp: Atlasが、ページを閉じても残る永続のグラフから、施設・運営企業・所有企業（いつからいつまでかも含む）・公表された処理能力をたどれるようになりました。最初の対象は世界のLNGターミナルです。
---

〈依頼〉 総合技術評価（2026-11-19）の P2。世界オブジェクト基盤（`dev-notes/2026-11-19-world-object-graph.md`）は識別子・型付きの辺・期間・出典まで入ったが、索引はセッション中にしか存在しない。

## 0. 測った（実データ・2026-11-19）

- 「港湾→所有企業→接続鉄道→貨物量推移→近隣施設」を実データで通せるか、Wikidata に直接訊いた。
  - **運営者（P137）**: Port of Hamburg → Hamburg Port Authority、Port of Rotterdam → Port of Rotterdam Authority は在る。港湾一般では、運営者か所有者を持つものは少数。
  - **取扱量（P2957 throughput）**: 運営者と取扱量の**両方**を持つ港湾（Q44782）は 9 件で、**全部が LNG ターミナル／LNG 基地**（LNG ターミナルの取扱量は 48 件）。**単位つきの能力（million tonnes per annum）で、観測の年を持たない**——「貨物量の推移」ではない。Hamburg・Rotterdam・Long Beach は 0 件。
  - **接続鉄道（P2789）**: 港湾と鉄道路線（Q728937）を結ぶ文は **0 件**（両方向）。
  - LNG ターミナル（Q15709854）: 59〜68 件が運営者・取扱量のどちらかを持つ。所有の交代を日付つきで述べるものがある（Risavika: 2021-11-01 に所有者が変わる）。
- 1 本の SPARQL に OPTIONAL を並べると行が掛け算になる（69 行／59 件）。関係ごとに 1 本ずつ問う。

## 1. 置き場の判断

**Supabase。** 既存の基盤で、非破壊の追加・新たな費用・外部サービスの変更は無い。全員が読む CC0／ODbL の抽出なので公開読み取り、書くのは service_role だけ（migration の seed・サーバ側の取り込み）。ブラウザ内の永続層（IndexedDB）は 1 台・1 人のものでしかなく、「世界規模で継続的に結ぶ」に足りない。専用のグラフ DB は入れない（探索は再帰 CTE で足りる規模。ノード数・深さを測ってから）。

## 2. 作ったもの

- `supabase/migrations/20261119150000_world_graph.sql`: `world_graph_nodes`（`ref`＝ページの `type:id`・`ids`＝外部識別子・存在期間）・`world_graph_edges`（述べた側 1 行・期間・確度・出典・同一の文は一意）・`world_graph_claims`（値＋単位＋期間＋出典・並べて持つ）。RPC `world_graph_subgraph`（辺をどちらの向きにも・`rels`・`depth`・`at_ms`）・`world_graph_find`（ref／識別子／完全一致の名前）・`world_graph_near`。
- `scripts/world-graph/build-lng.mjs` → `data/world-graph-lng.json`＋seed migration（`20261119150100_…`）。企業は IntMap の企業アトラスが同じ Wikidata id を持てば `company:<atlas id>` になる（4 社: ExxonMobil・Pemex・Shell・Petrobras）。結果: 対象 102（ターミナル 68・企業 34）・辺 49・取扱量 48。
- `js/world-graph-store.js`: 行 → `geo.worldObject` → 同じ索引。データベースが答えないことは `unavailable`／`failed` で返し、空のグラフと区別する。
- Atlas: **能力は増やしていない**。`research.object` は session に無い ref・`wikidata:Q…`・名前をこのグラフへ訊き（`via: "graph"`）、値を単位・期間・出典つきで答える。`research.related` は `rels`・`depth`・`at` を永続グラフにも向け、企業アトラスの拠点も同じ索引へ書いて「ターミナル→運営企業→その企業の他の拠点」を 1 回のたどりにし、近接の問いには `world_graph_near` を足す。dispatch の doc 文（SYS に出る説明）に永続グラフの存在と使い方を足した。

## 3. 検査

- `tests/world-graph-persistent-checks.test.mjs`（5 件・実データ）: seed がスナップショットと同数／行→対象／「その日の所有者」が日付で変わる・逆向き・2 段／アトラスの企業が同一の対象／能力の実行とデータベース不通の明記。DB は 3 つの RPC を JS で模した**通信の代役**で、SQL 自体は下で検査する。
- `supabase/tests/51_world_graph_test.sql`（pgTAP）: 制約・一意・RLS／権限・「その日」・両方向・深さ・完全一致・近傍・seed。**Docker が無かったので PGlite（Postgres の WASM）で migration と seed を流し、同じ期待値を手で確かめた**（pgTAP 自体の実行は CI）。

## 4. 未着手・否定した見立て

- **接続鉄道**: データ側に港湾と鉄道を結ぶ出典が無い（P2789 が 0 件）。辺の型（`connected_to`・`serves`）は用意済み。OSM の鉄道と港湾の `landuse=port` の幾何で結ぶ案は、近接を事実にしない規則（`CONSTITUTION` の推測禁止）に反するので採らない。出典（鉄道事業者の貨物ターミナル表など）を決めてから。
- **貨物量の推移**: Wikidata は LNG の能力を年なしで 1 値だけ持つ。年次の取扱量は各港湾庁の統計（Rotterdam・Hamburg の年報など）で、出典・利用条件を決めて `world_graph_claims`（期間つき）へ入れる。表は期間を持てるので変更は要らない。
- **港湾そのもの**: 港湾（Q44782）は運営・所有の文が少ない。OSM の `harbour`/`landuse=port` との識別子での結合（`ids.osm`）は、OSM 側の ref と Wikidata の P402 が揃う港から。
- **継続取り込み**: いまは migration の seed（手で build を回す）。夜間の取り込み（Edge Function か CI）と鮮度の表示は次。
- 世界規模のノード数・探索深度の実測は、LNG 以外が入ってから（`world_graph_nodes_pos_idx` は緯度の帯で絞る単純な索引で、これ以上の索引は測ってから）。
- `supabase/tests/00_structure_test.sql` の表一覧には足していない（一覧に無い表は落ちない・51 が表と列を固定）。

## 5. 起動費用の天井を上げた理由

永続グラフの読み出し（`js/world-graph-store.js`）と `research.object` / `research.related` の拡張を Atlas の能力チャンクへ足したので、遅延チャンクが増えた: `atlas-cap-runs` +4.5 kB（872.9→877.4）・`atlas-delegate` +2.2 kB（59.8→62.0）。いずれも利用者が Atlas を開いたときにだけ読まれる遅延チャンクで、起動時（eager）の費用は変わらない。呼び出しの名前は `findPersisted`／`nearPersisted`／`rpcWorldGraph`——`find`／`call`／`near` だと呼び出し網の照合が配列の `find` と取り違え、無関係な押下を「データベース書き込みに届く」と数えた（`check:static` の data-effect が落ちた）。

## 6. データ統治の台帳が増えた件

スナップショット（`data/world-graph-lng.json`）と builder の宣言が出自・鮮度・形の項目を述べていなかったので、台帳の「未宣言」が 205→207 件・2581→2602 項目に増え `check:datagov` が落ちた（台帳は減る向きにしか動かせない）。builder の `GOVERNANCE` に `retrievedAt`・`generatedAt`・`asOf`・`schema`・`quality`（nodes を測った値）を literal で足し、書き出し時に `scripts/lib/gov-stamp.mjs` が実測と食い違えば拒む。同じ宣言を束の先頭にも持たせた。builder は import しても Wikidata を呼ばない（`main()` を実行ガードの中へ）。データ自体は不変（seed も同一）。
