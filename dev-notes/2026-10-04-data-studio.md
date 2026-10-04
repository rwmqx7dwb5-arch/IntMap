---
title: データスタジオ——自分の表（CSV・TSV・Excel・貼り付け）を国や都市に結び、塗り分け、分析に渡し、サーバを使わないリンクで公開する
date: 2026-10-04
newsen: Data studio — drop a spreadsheet (CSV, TSV, Excel or pasted) that names countries or cities, and IntMap finds the place column, colours the map by any column, hands it to analysis, and publishes it as a link that needs no account and stores nothing on a server.
newsjp: データスタジオ——国名・ISO コード・都市名の列を持つ表（CSV・TSV・Excel・貼り付け）を落とすと、場所の列を見分けて地図に結び、好きな列で塗り分け、分析に渡し、アカウント不要・サーバ保存なしのリンクで公開できます。
---

〈依頼〉 データスタジオ（data-studio）——自分の表を、地図・分析・公開まで 1 つの面で。既存の部品（取り込みの decoder・
データセット・join・属性による着色・GIS パネル・書き出し・絵葉書）は消さず写さず、1 つの流れに統合し、欠けている段だけを
足す。欠けていた段: ①座標の無い表を地図に結ぶ入口 ②xlsx が地図に出ない ③取り込んだデータの公開リンク。

## 0. 測った

- **国名の索引**（Node 24、full ICU、`data/ne-countries/ne_50m`）: `Intl.DisplayNames.supportedLocalesOf` に 2 文字の言語
  コード 676 個＋IntMap の言語の HTML タグを訊くと **142〜144 ロケール**。Natural Earth の 240 鍵 × 全ロケール＋NE の
  `NAME*` 列で **19,428 の正規化形**、構築 **約 360 ms**（1 回だけ、表を初めて受けたとき）。2 か国以上に当たる形は
  **20**（Saint Martin / Sint Maarten、Congo の 2 国、米領 / 英領ヴァージン諸島、「kata」＝カタールとチャド、
  「lusia」＝ロシアとセントルシアなど）——どれも `ambiguous` として候補つきで返し、選ばない。
- **都市の索引**（`data/gazetteer-phone.json.gz`、12,000 行）: **36,899 形**・約 220 ms。同名の実例: Hull（GB / CA）・
  Oran（DZ / AR）・León（MX / NI）・Georgetown（GY / MY）・St. John's（CA / AG）。⚠ **Springfield と London は phone 版
  では 1 件しか無い**（上位 12,000 都市に米国の他の Springfield・カナダの London が入っていない）ので、曖昧の検査には
  Hull を使った。
- 実例の解決: 「Korea, Rep.」「South Korea」「韓国」→ KOR、「United States of America」「USA」→ USA、「Россия」→ RUS、
  「中国」→ CHN、「Côte d’Ivoire」と「Cote d'Ivoire」→ CIV、「Kosovo」と「XK」→ KOS（ISO alpha-3 が無いので NE の
  ADM0_A3）。「DR Congo」は**見つからない**（どの典拠もこの綴りを持たない）——未解決として読者に並ぶ。

## 1. 何を足したか

- `js/table-bind.js`（純関数）——列の判定と行ごとの解決。国名は手で書かず Intl と NE の名前の列から発見し、ISO の対応は
  NE の `ISO_*_EH`。都市は GeoNames。**数量の列を鍵にしない**: 数字コードは規格の書き方（先頭ゼロを保った 3 桁）の
  セルが 1 つ以上あるときだけ候補（無ければ `numeric-not-evidenced`）。自動選択の閾値 `DETECT_MIN = 0.6` は推定値
  （由来と失効条件は定数の隣）。
- Excel: `js/atlas-attach.js` の xlsx 走査を `sheetWalk` 1 本にし、Atlas の文字化（`sheetRows`）とセルの表（`sheetTables`）
  が同じ走査を読む。`js/geo-import.js` は zip の中身で workbook を見分け、CSV と同じ `decodeRows` に渡す（区切りで割る
  段と、割った行を読む段を分けた）。Atlas の添付の文字はそのまま（`tests/atlas-attach-checks.test.mjs` と新しい検査 ⑧）。
- `js/data-studio.js`（どの入口も `import('./data-studio.js')`）——1 枚のパネルに データ → 場所に結ぶ → 塗り分け → 分析 → 公開。ファイルは
  地図のファイルの扉 `GeoJSONUpload.handle` を通し（`handleFiles` が 1 ファイルごとの結果を返すようにした）、国は NE 1:50m
  のデータセットへ `js/gis-ops.js` の `join`、都市は点、描画は `IntMapGis.draw`、塗りは `GeoJSONUpload.style`、書き出しは
  `js/gis-export.js` の `formats('vector')` 全部、絵葉書は `postcard()`。
- 公開: 地図の状態に `ds` 欄（`mm` の後ろに追加）。包み方は `js/link-pack.js`——`js/tours.js` が内に持っていた 'z' / 'j'
  の符号化を外へ出して共有（ツアーのリンクのバイトは不変）。fragment はサーバへ行かないので 8,192 の制限は掛からず、
  長さは `LINK_LIMIT_MEASURED`（Chromium 実測 2,097,152 文字。正本を `js/link-pack.js` に移し、
  `js/atlas-briefing-codec.js` は同じ名前で再 export）と比べる。受け手はリンクの**鍵**で場所を引き直す（セルから推測し
  直さないので、端末の ICU が違っても同じ国になる）。
- 入口: Layers ▸ Tools（`tool.dataStudio`）・「地図データを読み込む」の隣のボタン・座標の無い表を地図に落としたとき
  （`handleFiles` → 遅延でスタジオの `receive`）・Atlas。
- Atlas `data.studio`（open / bind / style / link / status / clear、`attachment` で会話の添付を読み込む）。観測器
  `dataStudio` は呼んだ後にスタジオの状態と、描いたデータセットが取り込み一覧に在るか（`GeoJSONUpload.find`）を読む。
  同じ列での結び直しは `already_there`。結果は読者の表を運ぶので列 11 は `external`。能力は 208（生きているもの）に。
- プライバシー §1（en / jp）: 公開リンクは表の中身をリンクそのものに入れる——サーバに保存しない代わりに、リンクを
  渡した相手に中身が見える。`LEGAL_DATE` を 2026-10-04 に。

## 2. 判断したこと（と、しなかったこと）

- **表が来たら最初の数値列を分位で塗る。** 列を選ぶ前に地図が白いままだと「結べたのか」が見えないので。方式・列・
  階級数は読者が変える。
- **結合の列名衝突は前もって決める**（表の列が国の列と同名なら `table_` を前置）。`join-column-collision` を受けてから
  前置して再試行する形は `.agents/rules/one-pass-or-a-reason.md` が禁じる「繰り返しが当たり前」になる。
- **同じ国を指す行が複数ある表は塗らない**（`join` の `duplicates:'refuse'` をそのまま読者に述べる）。先頭を採るか
  合計するかは読者の主張で、黙って選ばない。
- **window に何も公開しない**（メインの方針・同じ回の learn-quests と同じ形）。最初は `js/lazy-modules.js` に登録して
  `window.IntMapDataStudio` を公開したが、それを外した: 入口（地図データの読み込みの隣のボタン・Layers ▸ Tools・表を落としたとき・
  Atlas の `data.studio`）は全部 `js/here-now.js` / `js/command-palette.js` と同じ字句の `import('./data-studio.js')` で読み、
  `studio(HOST)` が 1 つの制御器を返す。Atlas の観測器は同じ import の `studioState()` を呼んだ後に読む。地図の状態の `ds` は
  `lazy` を持たず、`js/map-ui.js` の viewHash が `MapState.onRestore` で `ds` を持つ復元を聞いて import する（持ち主の登録が
  保留値を受け取る）。Tools の行の `mod` は関数も受けるようにした（window 名の代わりに制御器を答える）。
  `tests/global-surface-baseline.json` に残る増分は既存の公開名の読み（GeoJSONUpload・IntMapAtlas・IntMapData・IntMapGis・
  IntMapGisOps・IntMapLazy・IntMapSafe・IntMapDataDoor）と IM_HOST の 2 メンバーだけ。
- **起動バンドルを太らせない**: スタジオが `js/ne-countries.js` を静的 import すると、build の実測で起動時のリクエストが
  **9 → 11**（`fetch-deadline` と `proxy-fetch` が main から分かれた。共有モジュールを main へ戻す merge が
  data-door → fetch-deadline → proxy-fetch の循環を拒む、`vite.config.js`「fetch-deadline-layer」と `js/star-catalogue.js` が
  記録した形）。動的 import にすると **12**（data-door も分かれた）。そこで NE の読み手は **IM_HOST の 2 メンバー**
  （`loadNECountries` / `neCountriesPath`、`js/app-body.js`）、地名帳は `window.IntMapDataDoor` から読む——9 に戻り
  `check:perf` は予算内。IM_HOST のメンバーが 280 → 282、`IntMapDataDoor` の読みが 1 増えた（baseline を `--update`）。
- `tests/map-next-checks.test.mjs` ③ の「`mm` が最後」は「`mm` はそれより古い欄の後ろに居て、後ろには後から足した欄
  だけが来る」に直した——意図（旧リンクのバイトが変わらない）は同じ検査のバイト比較が測っている。
- ⚠ **しなかった**: `js/atlas-briefing-codec.js` の `b` の包み方（'z' だけを書き 'j' を拒む、もう 1 つの写し）は
  `js/link-pack.js` に寄せていない。挙動の違う既存の写しを動かすのは今回の範囲外——次に触る人への記録。

## 3. 未了

- **ブラウザでの通し確認はしていない**（Playwright の spec は試験時間の余白が 0.3 分なので足さない指示）。Node の検査は
  実データで判定・解決・リンクの往復・Excel の読みを測るが、パネルの描画・`join` の実行・地図への描画は統合後の
  プレビュー／本番で確かめる必要がある。
- phone 版の地名帳（12,000 都市）にない小さな町は都市名で結べない。デスクトップ版（148,000 行）を使うかは未判断。

## 4. 検査

`tests/data-studio-checks.test.mjs`（8 件）: ISO2 / ISO3 / 数字 / 日本語・ドイツ語・フランス語の国名の判定と解決、
曖昧な都市を解決しない・国の列で絞ると解決する、数量の列を鍵にしない、リンクの往復（`ds` 経由・ツアーの包み方も同じ）と
信用しない読み・展開上限、長さ上限で断る、`ds` の無い旧リンクがバイト単位で同じ・`ds` があるときだけ遅延取得、
起動の静的 import 木に入らない、Excel の表読み（`tests/fixtures/data-studio-population.xlsx`）と文字の枠の読み戻し。
