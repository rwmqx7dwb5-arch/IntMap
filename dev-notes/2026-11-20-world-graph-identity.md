---
title: 世界グラフの識別を外部データの更新に耐えさせる——不変の uid・同一と判断した根拠・変更履歴を足し、行政区域と原子力発電所を識別子でグラフへ結んだ
date: 2026-11-20
newsen: Atlas can now follow an object through its supplier's identifier re-issues and see what a refresh changed about it — and the graph now holds countries and nuclear power plants, tied to the LNG terminals by the country code each states.
newsjp: Atlasが、供給元が識別子を振り直しても同じ対象をたどれるようになり、更新で何が変わったかも見られます。グラフに国と原子力発電所が加わり、各々が述べる国コードでLNGターミナルと結ばれました。
---

〈依頼〉 総合技術監査（2026-11-20）の P1（5.5/6.10）。世界オブジェクトグラフを、外部データの更新に耐える識別へ。外部 ID・IntMap 側の安定 ID・同一と判断した根拠・有効期間・更新履歴を持たせ、Overture の版ごとの ID 入れ替わり（2026-11-18 版で施設系約 6.55%）や属性更新を差分として追えるようにする。港湾・LNG 以外を同じグラフへ結ぶ拡張点を作り、実データで 2 領域以上を接続する。

⚠ **土台は未 merge の 2 本**（#1290 Overture の `world_graph_id_history`／`adopt_id`、#1292 の `world_graph_ingest_*` と `feed`／`feed_run`）。本作業はその上に積む（両方を取り込んで作った）。2 本が先に merge されること。

## 0. 先に在ったもの・足りなかったもの

- #1290: 識別子の**履歴**（リリースごと・元レコードつき）と、書く前に「この id はどの対象か」を訊く `adopt_id`。足りない: IntMap 側の安定 id、**同一と判断した根拠**（stated か元レコードか属性か）、判断の**順序と拒否の規則**（コードに無く SQL の中だけ）、更新の**履歴**。
- #1292: 取り込みの begin／apply／finish（feed 所有・退役の保護・鮮度）。足りない: apply は行を**その場で上書き**し、述べられなくなった行を**消す**ので、「11 月に名前が変わった」「この id は入れ替わった」「この辺は終わった」が復元できない。

## 1. 作ったもの

- **`supabase/migrations/20261120135000_world_graph_identity.sql`**（追加のみ・書く側は 1 つも変えていない）
  - `world_graph_nodes.uid`（uuid・挿入時に 1 回・UPDATE で変えようとしても trigger が戻す）。`ref` はページの鍵のまま、`uid` は栞が持てる不変の把手。
  - `world_graph_id_history` に `basis`（stated / source_record / attribute / seed）・`evidence`・`confidence`。名前による一致は基盤の値に無い。
  - **`world_graph_changes`**（追記のみ・公開読み取り）。ノード・辺・主張の added／changed／retired と、変わった欄の before／after、feed と run。**trigger が埋める**ので seed・`ingest_apply`・Overture の SQL のどれが書いても入る（書き手の改修なし）。帳簿だけの更新（`feed_run`・`updated_at`）と同値の書き込みは記録しない（`UPDATE OF 列` ＋差分の有無）。記録は**この migration 以降**（それ以前の書き込みには「前」が無い）。
  - 読み: `world_graph_resolve(q)`（uid／ref／`scheme:value`＝**現在の id も、過去に持っていた id も**。`via` が `uid|ref|present_id|past_id` のどれで着いたかを述べる。名前では引かない。2 つの対象が同じ id を持ったことがあれば両方返す）・`world_graph_history(ref)`（id の期間＝どのリリースからどのリリースまで・基盤、と変更の一覧）・`world_graph_changes_between(from,to,feed)`（更新の件数と「id が入れ替わったノード数」）・view `world_graph_identifier_periods`。
- **`supabase/functions/_shared/world-graph-identity.js`**（純粋・DB もネットも無し）: 同一性の判定を**コードに出した**。証拠の順: ① 安定 id（wikidata・osm・iso・unlocode…）が一致し、持つ対象が 1 つ → same ② 振り直される id（gers）を、いま／過去に持つ対象 → same ③ 元レコード（dataset＋record_id が**文字まで**一致）→ same ④ 同種・同国・半径内（既定 100 m）＋矛盾する id なし → **candidate**（決めない。`candidate_match`）。**名前は証拠にしない**。安定 id が食い違う（別の Wikidata 項目）なら ③④ を打ち切る（座標は 2 つの id に勝てない）。2 つの対象が当てはまれば `ambiguous`（選ばない）。`reconcile(known, incoming)` が 1 回の更新を matched／added／gone／candidates／ambiguous に分け、matched ごとに差分（変わった属性・**入れ替わった id の from→to**・足された id）と、振り直し率を返す。
- **`js/world-graph-store.js`**: `resolvePersisted`（置き換わった id・uid から対象へ。`via` と `matchedId` を返す。2 対象なら `ambiguous`）・`historyPersisted`。`research.object` は、`findPersisted` が無かったときに `resolvePersisted` を試す（能力は増やしていない）。
- **拡張点 `scripts/world-graph/lib/domain.mjs`**: `defineDomain`（feed 名・型・`build()` を持つこと）・`nodeRef(type, scheme, value)`（**安定 id から**ref を作る。振り直される scheme は拒む）・`linkByIdentifier(from, to, {rel, key})`（一方が述べる識別子を、もう一方が持つ対象へ。**解けなければ引かず数える**・2 対象が持つ id はどちらにも解かない）・`toSqlRun`（1 回の取り込み run を SQL に）。領域は互いを知らず、識別子で出会う。出力は `world_graph_ingest_*` を通るので、feed 所有・退役の保護・鮮度・変更履歴を継ぐ。
- **実データで 3 領域を接続**（`scripts/world-graph/build-plants-admin.mjs` → `20261120140000_…_seed.sql`・ネットを使わず手元のデータだけ）:
  - `admin`: Natural Earth の行政区域 240（ISO 3166-1 の a2／a3・Wikidata・NE id）
  - `plants`: `data/npp.json` の原子力発電所 638（Wikidata id・位置・状態・基数と出力は主張・稼働の始まりと終わりは存在期間）
  - 辺 `located_in`（新語。逆は `location_of`・`js/atlas-geo-object.js`）: 発電所 631／638、既存の LNG ターミナル 65／68 が、**自分が述べる国コードを持つ行政区域**へ。コードが識別子で、名前も位置も使わない。結べなかった 7＋3 は「国コードを述べていない」で、引いていない。仏・米など 10 以上の国で「発電所と LNG ターミナルの両方を持つ」が 1 回のたどりになる。
  - ⚠ **運営者は結んでいない。** `npp.json` の operator は「EDF Energy」のような**ラベルで識別子が無い**。綴りで企業アトラスに当てるのは規則（名前綴りでなく識別子）に反するので、`facts.operator` に出典の言葉のまま置いた。出典が運営者の識別子を述べたとき辺にする。
  - 実測で見つけた型の欠陥: 最初、発電所の `ids` に ISO の国コードを入れた。国コードは**国の識別子であって発電所のものではない**ので、同じ国の発電所が互いに「同じ id を持つ」と見えて照合が全部 `ambiguous` になった。`ids` には**その対象自身の**識別子だけ、国コードは `facts`（結ぶ鍵は `facts.countryCodeA2`）。判定が `ambiguous` で止まったので、気づけた（黙って 1 つに決めていたら見えなかった）。

## 2. 検査

- `tests/world-graph-identity-checks.test.mjs`（7 件）: ①判定の順序と拒否（名前だけ違う→同一・別国・別の Wikidata 項目・2 候補・安定 id の重複）。②**実際の発電所 638**に、Overture が公表した 6.55% の振り直しと属性変更・消滅・新規を注入して更新（⚠ 注入は合成・対象は実物）: 新規 1・消滅 1・推測が要ったもの 0・振り直し率が注入値に一致・改名と位置の移動が id で見つかり差分になる・入れ替わった id が from→to。③3 領域の接続（全 638 が結ばれたか数えられたか・辺の行き先が国コードを持つ区域・両方の種別を持つ国・運営者が節点にならない）と拡張点の拒否。④seed が build と一致・migration が約束を含む。⑤ストアが置き換わった id を追って `via` を述べ、DB が答えないことを空と区別する。
- `supabase/tests/53_world_graph_identity_test.sql`（pgTAP・38 件）。**Docker が無いので PGlite で migration 一式（ingest・履歴を含む）を流し、pgTAP の関数を数行の代役にして同じファイルを実行し 38／38 通した**（pgTAP 自体の実行は CI）。`52_world_graph_id_history_test.sql` の列の一覧に 3 列を足した。
- 追加の実測（PGlite）: seed 一式を流すと admin 240・facility 638＋68・located_in 696 辺・`world_graph_subgraph('admin:iso-JPN', …)` が日本の発電所 41 件を返す。ingest の 2 回目の run（id 入れ替え・改名・出力の改訂・消滅）が変更履歴に added／changed／retired として残り、`world_graph_resolve('gers:旧')` が `past_id` で同じ対象に着く。

## 3. 判断と、していないこと

- **履歴は trigger で取る**（書き手を直さない）。代償は書き込みごとの行追加。claims の再確認（`feed_run` と `retrieved` だけの更新）は列指定の trigger で発火させず、変更のあった行だけが残る。大きな取り込み（3 万 claims）での増分は未測定。
- **属性による一致は `candidate` どまり**。2 つの実物が 30 m に立つことは実在する。採用するかは呼び出し側の方針（`CONSTITUTION` の推測禁止）。半径 100 m は暫定の既定で、Overture の places と OSM／Wikidata の同一施設の差を実測して決める（失効条件: その実測）。
- **Overture の changelog／ブリッジファイルを取り込む経路は無い**（#1290 の未了のまま）。`reconcile` は「リリースが述べた元レコード」を入力に取れる形にしてあり、取り込む側ができれば `gone` が「消えた」を述べる。
- 都市・工場・送電網・鉄道駅・災害・ニュース・統計・衛星画像は**未接続**。接続の仕組み（`linkByIdentifier`）は用意したが、各々に「出典が述べる識別子」が要る（実データで探した: 災害の火山は国名が文字列で、綴りで結ぶことになるので結ばなかった）。
- 港湾（#1292 の feed `ports`）の国は同じ `located_in` で結べるが、その feed が merge されてから ports の側の builder に足す。

- perf: dist.assets の天井を 22068.6 → 22283.7 kB へ上げた。世界グラフの識別(不変 uid・根拠・履歴)と行政区域・原子力発電所の接続で配る資産が増えたため。

- perf: async.raw 15123392→15331792 B・async.gzip 5110254→5214964 B・atlas-console 1186800→1192924 B・gis-core 718100→722270 B・dist.assets 22720068→22958184 B へ天井を上げた。不変 uid・同一判断の根拠・変更履歴の読み書き、行政区域と原子力発電所の識別子接続を足し、main の他の変更と合わさって測り直したため。
