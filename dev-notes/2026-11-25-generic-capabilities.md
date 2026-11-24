---
title: 同梱データを「1 つの問いの答え」から「Atlas が問えるデータ」へ——宣言された表を data.query に、アプリの命令を system.command に。research.portImpact と siting.compare を外す
date: 2026-11-25
newsen: Atlas can now ask the whole power plant database (34,936 plants), the seaports, rail access to ports and Japan's prefecture indicators as tables, and run any of the app's own commands.
newsjp: Atlas が発電所データベース全件（34,936 件）・港湾・港への鉄道距離・日本の都道府県指標を表として問い合わせ、アプリの操作命令をどれでも実行できるようになりました。
---

〈依頼〉「なぜ個別のユースケースに特化した機能を際限なく実装しているのか。港湾停止時に周辺の火力発電所を抽出する機能など、
本来は汎用的なデータ取得・空間演算・推論の組み合わせで Atlas 自身が実現すべきもの。構造的な原因を究明し、開発体制を是正しろ。」

## 0. 原因

IntMap の開発が「Atlas にこの問いを答えさせる」を「この問いに答える機能を 1 つ作る」に変換してきた。#1316 → #1399 がその形そのもの:
港が止まったら、を答えるための能力（`research.portImpact`）を立て、次にその答えを厚くするために、WRI の発電所データベース
34,936 件を「港から 30 km 以内の石炭・石油・ガス・石油コークス火力 1,028 件、各々に最寄り 3 港」へ削って焼き込んだ。
`siting.compare` も同じ形で、都道府県の指標表をその能力からしか読めなかった。

答えの形に固めると、データはその問いからしか届かなくなる。測った（調査 4 本、2026-11-25）:

- `data.query` が引ける表は 5 つ（cities・countries・earthquakes・volcanoes・facilities）で固定。同梱データのほかの表は、
  それぞれを包む専用能力からしか読めなかった。
- アプリの操作はカーネルの命令（`IntMapOS.register`）として登録されているが、Atlas が実行できるのは能力表に名前のある
  ものだけ（registry の冒頭が「Atlas's reach is … CLOSED」と書いている）。
- 一方で Atlas は汎用の手段を既に持っていた: `data.gis` の `network`/`networkDisrupt`/`nearestJoin`、`compute.run`
  （Python と能力ブリッジ）、`web.browse`/`web.fetchFile`。`data.gis` の説明には海峡が閉じたときの港の影響を求める手順まで
  書かれていた。足りなかったのは、データと操作に届く入口だった。

## 1. 直したこと

- **データは自分で表を宣言する。** データファイルの最上位に `rowTables`（行の場所・列・型・単位・en/jp のラベル・別の配列を
  引く `via`）。`scripts/data-tables.mjs` が `data/` を歩いて宣言を見つけ、行と突き合わせ（無い列・名前の無い表・重複 id を拒む）、
  索引 `js/data-tables.js` を書く（`check:datagov` が照合、`.gitattributes` の regen）。`js/atlas-query.js` は索引の表をすべて
  `data.query` の表にする（where / near / spatial / order が同じように効き、結果は data.gis・compute.run へ渡せる）。
  `{"type":"query","list":true}` が全表を列・単位・出典・欠けているもの（`completeness`・`gaps`）つきで返す。
  能力の説明は表を列挙しない——一覧はそのつど登録簿から読む。
- **発電所はデータベース全件**（34,936 件・167 か国・全燃料・容量・他燃料・所有者・運転開始年・報告発電量 2019・推計発電量 2017）。
  港との結合は外した（近接は `near` / `spatial` で問える）。
- 宣言した表: `power-plants`・`ports`（984）・`rail-port-access`（5,068。鉄道で最寄りの港を 3 つ、鉄道距離つき——鉄道網を
  測った結果で、どの問いにも使える）・`jp-prefecture-indicators`（47。指標の列は `metrics` から導出）・`jp-industrial-land-prices`
  （948）・`jp-factory-location-rules`（2。条文）。
- **アプリの命令は全部届く。** `system.command`: id 無しでカーネルに登録された命令の一覧、id つきでボタンと同じ呼び方で実行し、
  命令が返したものを返す。
- **外したもの**（形式上の削除）: `research.portImpact`・`js/logistics-impact.js`、`siting.compare`・`js/atlas-cap-siting.js`・
  `js/siting.js`。引き継ぎ: 港の後背地は `rail-port-access` を `port1Locode` で絞り、`port2`・`port2RailKm` が次の港と距離
  （`tests/generic-capabilities-checks.test.mjs` ④）。港の周りの発電所は `power-plants` に `near:[{of:"ports",…}]`。立地の比較は
  `jp-prefecture-indicators` の order と、Atlas がその問いで述べる重み。条文は `jp-factory-location-rules`。
- **恒久指示**: `CONSTITUTION.md` §5 の冒頭に「IntMap の開発とは、Atlas に答え方を教え込むことではなく、Atlas が自ら問題を
  解決できる環境を進化させること」と、問うべき物差し（次世代モデルに替えたとき知能の向上を享受できる作りか。機能数・規則数・
  ツール数は指標ではない。専用の道具は精度・速度・費用を大きく良くするなら作ってよい。作ってはならないのは特定の問いへの答えに
  合わせた設計）。`AGENTS.md` §3 の 3 の「dispatch・catalog・SYS に同時に組み込む」——機能ごとに能力を足す流れを作っていた一文——を、
  「データ・操作・計算そのものを Atlas から届かせる」に改めた。

## 2. 否定した見立て（この会話で私が実際に出したもの）

- 「能力の説明から例文を全部消す」: 2 体に走らせ、途中で止めて全部戻した。悪いのは例文があることではなく、特定の問いの答えに
  合わせて設計すること。例文の禁止は、利用者の言葉を禁止リストに写す同じ癖だった。
- 「Atlas が自分では作れないものだけ残す」: 極端。精度・速度・費用を大きく良くする道具は環境の改善。
- 「規則と門を足して再発を防ぐ」: 理解の代わりに規則で囲うのは、問いの代わりに能力を足すのと同じ形。足した門は
  索引と宣言の照合 1 つ（宣言されたデータを Atlas が読めることを保つもの）だけ。

## 3. 残っていること（このラウンドではやっていない）

- 同じ形の候補: `research.impact`（地震 × 原発 × 都市の固定の組み合わせ。`data.query` の earthquakes / facilities で問える）、
  `on-this-day.json`・`polity-arcs.json`・`weekly-earth.json`（問いの形の索引。元データは別に残る）、重複の入口
  （`map.clear` / `clearAll` / `clearHighlights`、`time.compare` / `thenNow` ほか）。どれも、置き換え先が同じだけ働くことを
  確かめてから外す。
- 他の同梱データ（空港・制裁・国境の検問所・世界遺産・選挙…）は、まだ `rowTables` を宣言していない。宣言すれば同じ日から表になる。
- 評価: 夜間の Atlas 評価は一度も走っていない（秘密が無い）。問いの集まりは過去の問いで、未知の問いへの対応は測っていない。
- カーネルの命令は引数の宣言を持たない（`meta` は label / group だけ）。`system.command` から実行はできるが、引数を知るには
  命令ごとの説明が要る。

## 4. 上げた天井（`node scripts/perf-budget.mjs --update`・origin/main に rebase した木で測定）

- `async chunk "atlas-query"` 47.4 → 51.8 kB: 宣言された表を読む `shippedRows`・一覧 `tableListing`・列の解決。表の索引そのもの
  （ラベルと列 14.5 kB）は `js/data-tables.js` の別チャンクに出し、最初の問い合わせで 1 回だけ import する（同梱すると +19 kB だった）。
- `dist.data` 1,216,701.6 → 1,225,994.2 kB、`dist.total` 同じ幅: この変更の寄与は `data/power-plants.json` 175,008 → 3,885,478 B
  （データベース全件）と、`logistics-network.json` +4,474 B・`siting-jp.json` +5,521 B（表の宣言）。ファイルは `data.query` が
  その表を最初に名指したときだけ読まれ、起動の経路には乗らない。天井との差の残り（約 5.6 MB）はこの変更のファイルではなく、
  どのファイルかは測っていない（main の CI が merge 後に天井を測り直す）。
