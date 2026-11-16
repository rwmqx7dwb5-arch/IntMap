---
title: 政体の盛衰の入口ページ——地図が描く 2,112 の政体それぞれに、描き始め・描き終わり・描画面積の推移（アプリと同じグラフ）・最大の年とその地図のカードを持つ静的ページ（en / ja）を、data/polity-arcs.json からビルド時に生成する。年ページの名前の表は各政体のページへ結ぶ
date: 2026-10-13
newsen: Rise and fall pages: every one of the 2,112 polities the history map draws has its own page — when the map begins and stops drawing it, its drawn area year by year, the year it is largest with a picture of that map, and links into its years.
newsjp: 政体の盛衰のページ: 歴史地図が描く 2,112 の政体それぞれに専用のページができました。地図が描き始める年と描かなくなる年、描かれた面積の推移、最も大きい年とその地図の絵、その一生の年へのリンクを見られます。
---

〈依頼〉第 4 波・マーケティング（全権委任）。「検索・SNS から新しい読者が流入する、実データから自動生成され続ける資産を作る」。
外部への投稿・掲載申請はしない（下書きまで）。計測は自前の匿名集計だけ。

## 0. 何が無かったか（着手時に測った）

- 入口ページは地域 × 日付・この日・国・今週の地球・年ごとの世界がある。**どれも「1 つの政体を時間で追う」検索に答えない**。
  ところが歴史地図を探す人の最も多い言い方は政体名（「モンゴル帝国 地図」「Roman Empire at its height」「オスマン帝国 最大版図」）。
- 答えはもうアプリにあった: 「政体の盛衰」（`js/polity-arc.js`、`data/polity-arcs.json`）。日付を持つ記録が描く **2,112** の政体それぞれの、記録が変える
  瞬間ごとの描画面積。ただしアプリの `#` の奥にしかなく、検索エンジンにもリンクのプレビューにも届かない。
- ⇒ 作るものを 1 つに決めた: **政体ごとの入口ページ**（en / ja）と、その政体が最も大きい年の地図のカード（og:image）。既存の読み手と事実をそのまま使い、
  新しいデータ源は足さない。

## 1. 作ったもの

- `scripts/polity-pages.mjs`（文は `scripts/polity-pages-text.mjs`）→ ビルド時に `dist/history/polities/<slug>/`・`dist/ja/…`・一覧・`sitemap-polities.xml`
  （`sitemap-index.xml` が束ねる）。`vite.config.js` の `polityPagesPlugin`（子プロセス、年ページの後）。
- **ページの中身はアプリの読み手そのもの**: `js/polity-arc.js` の `describe`・`valueAt`・`related`・`chartSvg`・`largest` を export して読む（写さない）。
  グラフはアプリと同じ SVG（試験がバイト一致を確かめる）。色はアプリのシートの 3 色を `css/history-pages.css` が同じ値で持つ（試験が照合）。
- 1 ページ: 描き始め・描き終わり（記録の始まり・引き継ぎならそう書く。1689 年以降は「7 月 1 日に描き、前／次の年の 7 月 1 日には描いていない」）、
  **同じ名前が離れた期間に描かれるときは期間を並べて「同じ政体だとは述べていない」と書く**（§2）、最大の描画面積と年、形が変わる年の数、記録とライセンス、
  Wikidata、同じ項目の別名のページ、その一生のうち年ページのある年、国境の記録がその名前を描き始める・やめる・描き直す日（この日の歴史地図。1 月 1 日付けは
  年だけの可能性を書く）、地図を最大・最初・最後の年でその政体の枠で開くリンク（枠の合わせ方は「この日」の `viewOf`）。構造化データは `about.sameAs` に Wikidata。
- **カード** `scripts/lib/page-card.mjs` `drawPolityCard`: 最も大きい年の 7 月 1 日に地図が描く全輪郭の上に、その政体の形（`polity-pages.mjs` `shapesAt`＝索引が測った
  輪郭: 地図がその名前を書き、日付を持つ記録が描くもの）を塗り、年を数字で。小さすぎる形に印を付ける規則は国のカードと 1 つにした（`markIfSmall`）。
- **アドレス**は英語名を ASCII に畳む（NFKD＋分解されない文字の翻字）。空になる名前（ラオス文字の 1 件）と同じに畳まれる 2 組（Denmark–Norway／Denmark-Norway、
  Han／Hán）は Wikidata の項目か最初の年を付ける。索引の並びに依らない（試験）。
- **導線**: 年ページの名前の表の各名前 → その政体のページ（`scripts/year-pages.mjs`）、歴史地図のハブ → 一覧。計測は `history/` の下なので既存の入口 `history`
  （`shape.js` を変えていない＝Edge Function の再配備は要らない）。
- **投稿の下書き** `node scripts/polity-pages.mjs --queue [--only mongol-empire,…]`（X・Bluesky・Threads × en / ja、`utm_campaign=rise-and-fall`）。
  投稿・予約・送信はしない（`docs/marketing/README.md` A10）。X の 280 を超えるものは印を付けて人に渡す。

## 2. 年と場所を名指して読んだ（historical-verification §2-1）

`hist-product` の照合（モンゴル帝国 1206–1293・最大 1279、ローマ帝国 最大 117、明 1368–1644・最大 1422、徳川幕府 1600–1867、ロシア帝国 1721–1917・最大 1881）は
ページが同じ読み手で述べるので一致する（試験 ②）。加えて読んだもの:

| 政体 | ページが述べること | 史実 | 判定 |
|---|---|---|---|
| オーストリア＝ハンガリー | 1867–1918 | 1867 アウスグライヒ、1918 解体 | 一致 |
| 東ドイツ | 1950–1990（7 月 1 日に読む。この日の歴史地図の 1990-10-03 へ結ぶ） | 1949-10-07〜1990-10-03 | 一致（端は「7 月 1 日の読みの間」と書く） |
| 大日本帝国 | 1886（CShapes の始まりと明記）–1946 | 1947-05-03 日本国憲法 | 一致 |
| オスマン帝国 | 1305–1923、この日の歴史地図 1923-10-14「地図から消える」 | 1922-11 スルタン制廃止・1923-10-29 共和国 | 記録の日付として述べる |
| サンマリノ | 1689（OHM の始まり）–1885（CShapes へ引き継ぎ） | 現存 | **記録の端**としてそう書く（CShapes はサンマリノを描かない） |
| **イタリア王国** | 887 から 1945 まで、ただし **6 つの離れた期間**（887–895…936–969、1805–1813、1861–1945） | 中世のイタリア王国と 1861–1946 の王国は別 | **最初の版は「887–1945」と 1 つの生涯のように書いていた**。期間を並べ、同じ政体とは述べないと書くように直した |

- 否定した案: 「名前が同じなら 1 つの政体」とページを分けること（どちらが正しい分け方かを決めるのは記録で、IntMap ではない）。期間を述べるに留めた。

## 3. 判断と実測

- **数（このコミットのデータで）**: 2,112 政体 × 2 言語＝4,224 ページ＋一覧 2＋カード 2,112＋sitemap 1＝6,339 ファイル。
  **dist への増分 約 134.6 MB**（カード 69.5 MB〔1 枚 平均 33 kB、最大 76 kB〕・ページ 約 63 MB〔1 枚 13〜20 kB、一覧 350〜390 kB〕・sitemap 1.8 MB）。
  起動経路の資産は変わらない（`js/polity-arc.js` の変更は export だけ）。
- **カード 1 枚の費用**（実測）: 0.2〜0.45 秒（陸の塗り ≈50 ms・輪郭 ≈50〜70 ms・縁 ≈30〜60 ms・縮小と PNG ≈150〜200 ms）、年の読み 1 回 0.04〜1.5 秒 × 567 年。
  最初の版（子プロセス最大 4、キャッシュなし）は生成器だけで 416 秒かかった。

## 3b. ビルド費用を構造で下げた（数と品質はそのまま）

- **カードは内容で鍵をつけて残す**——新しい仕組みは作らず、ビルドの他の重い派生物（時代タイル `hvt-cache`、`scripts/build-hist-tiles.mjs`）と同じ置き場と作法:
  データストア（`scripts/data-assets.mjs` `storeRoot`）の**隣**のカード置き場（`cardStoreOf`＝`<ストア>-cards`。手元は `%LOCALAPPDATA%\intmap-data-cards`）に、カードの画素が依存するもの全部のハッシュ
  ——描画コードの版（`scripts/lib/page-card.mjs` `drawerKey`＝page-card・world-svg・map-card と、map-card が読むフォントと陸のファイル〔`drawerFiles`。読む側が名前を持つ〕）・
  その日に描かれる全輪郭・政体の形・枠・数字——を名前にして置く。書いてから rename、使えないストア（OneDrive の中）はキャッシュなし。命中したファイルは mtime を更新し、
  **全ページを描いたビルドは、ビルド開始より古いカードを消す**（`pruneUnused`。手元も CI も同じ 1 関数。一部だけ描く検査や `--only` は何も消さない）。
  ストアの「中」ではなく「隣」にしたのは、データストアが data-assets の actions/cache の保存・復元するパスそのものだから（同じパスに 2 つのキャッシュを重ねると、互いのファイルを保存し合う）。
- **CI**: build の step は `INTMAP_DATA_STORE` を設定しない（変えていない）ので、カードの置き場は `~/.cache/intmap-data-cards`。それをカード専用の
  `actions/cache/restore`（鍵 `intmap-polity-cards-<run id>`、接頭辞で main の最新を読む）で戻し、main への push でだけ `actions/cache/save` する
  （ci.yml の所要時間の記録と同じ形）。data-assets のキャッシュ（`${runner.temp}/intmap-data`、鍵 `intmap-data-…`）とはパスも鍵の接頭辞も重ならない
  ——`tests/polity-pages-checks.test.mjs` ⑧ が ci.yml と action.yml を読んで確かめる。⚠ 最初の版はカードをデータストアの中に置き、build に `INTMAP_DATA_STORE` を
  渡していた。data-assets のキャッシュは鍵が外れた run の終わりにだけストア全体を保存するので、カード専用の保存と同じファイルを別の鍵で抱え、どちらが
  何を残すかが読めなかった（統括の指摘で直した）。
- **並列は worker_threads**: 数は `os.availableParallelism() − 1`、ただし年の数と空きメモリ（地図 1 つ ≈800 MB、実測）を超えない。固定の上限は書かない。
  各ワーカーが自分の地図を持ち、年を 1 つずつ取る（大きい年から）。
- **測った**（このマシン 22 論理 CPU・他セッションと同時、2026-10-13）:
  | | カード | 生成器（政体ページ） | ビルド全体 |
  |---|---|---|---|
  | キャッシュ空（単独、ワーカー 21） | 2,110 描画・2 命中 | 263 秒 | — |
  | キャッシュ満（単独、ワーカー 21） | 0 描画・2,112 命中 | 92 秒 | — |
  | キャッシュ空（`vite build`、空きメモリでワーカー 8） | 2,110 描画 | 238.5 秒 | 1,635 秒 |
  | キャッシュ満（`vite build`、ワーカー 10） | 0 描画・2,112 命中 | 32.3 秒 | 481 秒 |
  キャッシュ満でも残る時間は年の読み（567 回。鍵がその日の輪郭なので読む）とページの書き出し。ビルド全体の大半は `intmap-site-url`（175〜445 秒）と
  `intmap-csp-hashes`（6〜502 秒）で、dist の全ファイルを歩く既存のプラグイン——ページが 6,339 増えた分だけ伸びる（この 2 つは触っていない）。
  同じ組で 2 枚が最初から命中したのは、内容が同じカード（同じ年・同じ形・同じ枠）が 2 組あったため。
- **dist.total**（`npm run check:perf`、この木の build）: 1,532,160.8 kB、天井 1,391,034.0 kB に対し **+141,126.8 kB**（政体ページ・カード・sitemap 約 134.6 MB と、
  `dist/data` の +5,482.3 kB〔この変更の外。origin/main が 1 commit 先行〕）。天井は触っていない。起動経路の行は帯の内側（eager raw +16.0 kB——この変更は
  `js/polity-arc.js` の export だけで、起動の束に入らない）。
- ⚠ **vite の束ねる設定ローダが無言で何も書かずに終わった**（`npm run build` が exit 1、`vite build` 単独は exit 0 で出力なし。`--configLoader native` では通る）。
  原因は import の順序: vite.config.js が polity-pages.mjs を読むと、それが year-pages・on-this-day-pages を先に読み、生成器どうしの既存の循環の評価順が変わる。
  `scripts/year-choice.mjs` が記録している形と同じ。⇒ アドレス・一覧・sitemap の名前と Vite プラグインを、生成器を import しない `scripts/polity-choice.mjs` に出し
  （年の slug `slugOf` も循環しない year-choice へ移して history-pages が再 export）、history-pages・year-pages・vite.config.js はそちらを読む。
- 一覧は世紀（紀元前 1000 年より前は千年紀）ごとに、年ページの `eraOf`／`eraWords` をそのまま使う（export した）。

## 4. 検査

- `node --test tests/polity-pages-checks.test.mjs` 7/7（④ にキャッシュ: 空なら全部描き、満なら 1 枚も描かずに同じバイトを返し、鍵は画素の入力のどれが変わっても変わる。① アドレス ② 名指した政体・記録の端・離れた期間 ③ カード・地図リンクの復号・アプリと同じグラフ・年と日のリンク・
  構造化データ・リンク解決・スクリプト無し ④ カードの形の面積＝索引の最大面積（1 km² 未満の差）、モンゴルの内側が政体の色 ⑤ 一覧・sitemap・目次・ビルド順・計数器
  ⑥ 下書き ⑦ 文のキーと色）。機能を外して赤になることを確かめた（カードの塗りを外す → ④、目次から外す → ⑤）。
- 触った既存の検査: `marketing-engine-checks`（ハブのリンク先と sitemap 目次に政体を足した）、`history-year-pages-checks`（1914 年の「German Empire」が政体ページへ結ぶ）、
  `marketing-growth`・`country-pages`・`hist-product`・`marketing-next`・`weekly-earth` は無変更で緑。

## 5. 残したこと

- **統合時に決めること**: `check:perf` の `dist.total` は +141,126.8 kB（天井は main が上げる）。CI ではカードの置き場が main の最初の push で満ちるまで、各 run が全部描く。
- アプリの「政体の盛衰」シートからそのページへの共有リンクは足していない（シートは歴史地図の主題のファイル）。
- 承認待ち: 下書きの投稿（A10）。
