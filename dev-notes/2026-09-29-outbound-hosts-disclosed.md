---
title: ブラウザが通信するホストをコードから発見し、プライバシー §4 と照合する——§4 は英日 16 KB の手書きの散文で、コードと一度も突き合わされておらず、記事の URL を受け取る r.jina.ai とパスワードのハッシュ前綴りを受け取る api.pwnedpasswords.com を含む多数の送信先を名指していなかった
date: 2026-09-29
---

〈依頼（監査・プライバシー）〉`js/legal-text.js` の Privacy §4 "Third parties" と、出典表 `js/reference-data.js`
の DATA_SOURCES は、**ブラウザが実際に通信するホストと一度も突き合わされていない**。監査の実測で、
fetch/src/import 文脈に絞った 65 ホストのうち 18 は登録ドメイン名もブランド名もどちらにも無かった。

## 0. 測った

- **母集合（今回の発見器）**: `js/`・`src/`・配信する `*.html`・`sw.js`・`css/` の**文字列とテンプレートの
  リテラル**（acorn。コメントは数えない）に現れる URL 703 件。文脈で「リンク」と決まらないホストが **178**、
  リンクにしか現れないホストが 144。監査の 65 より多いのは、fetch の引数に限らず**定数に置いてから使う形**・
  タイルの `tiles:[…]`・`<link rel=preconnect>` まで拾ったため（取りこぼさない側に倒した）。
- **§4 が名指していなかった送信先**（ブランド名も登録ドメインも en/jp の §4 に無かったもの）: 基図そのもの
  （OpenFreeMap・CARTO）、OpenRailwayMap・OpenSeaMap・OpenHistoricalMap・RainViewer・Terrascope・VLIZ・
  FAO GAEZ、利用者の鍵で読む Mapbox・Sentinel Hub、Google Fonts、unpkg、flagcdn、各国の気象警報
  （NWS・ECCC・BoM・香港天文台・INMET・DWD・気象庁・中国中央気象台〈fetch-relay 経由〉）と境界（NOAA・
  GISCO・Alibaba DataV）、火山（GVP・USGS HANS・気象庁・ArcGIS Online のハザード区域）、WHO DON、NOAA SWPC、
  TeleGeography、OurAirports、DeepStateMap、GitHub raw、Our World in Data、OEC、Frankfurter、Open Topo Data、
  Planespotters.net、airplanes.live、Nager.Date・Hacker News・wheretheiss.at・The Space Devs・mempool.space、
  そして利用者のデータを運ぶ 2 つ——
  - **`r.jina.ai`**（`js/article-reader.js:82`）: `fetch('https://r.jina.ai/'+item.link)`＝**記事の URL**。
    ⚠ しかも §4 は「まず報道機関から直接読む」と述べていたが、**実際の 1 段目は Jina AI**で、報道機関は 2 段目だった。
  - **`api.pwnedpasswords.com`**（`js/auth-ui.js:49`）: `SHA-1(pw)` を大文字 16 進にして**先頭 5 文字だけ**を
    `/range/` に送り、返った末尾の一覧とブラウザ内で照合する（k-匿名性）。新規登録とパスワード設定の 2 か所。
- **`www.googletagmanager.com` と `www.clarity.ms`** は `window.INTMAP_ANALYTICS=false` の後ろにあり、今日は 1 本も
  要求されない（`tests/r502-checks` が既に「true に戻すなら §4 が名指すこと」を結んでいる）。
- **CARTO のタイルホストは、リテラル単位で読むと存在しなかった。** `'https://' + (opts.host||'a') +
  '.basemaps.cartocdn.com/'` はホストを 2 つ目のリテラルに持ち、それ単独にはスキームが無い。`index.html` の
  preconnect でしか見えなかった。⇒ `+` の連鎖を 1 本の文として読む（非文字列の項は `{}`）。

## 1. 直した（構造）

- **`scripts/outbound-hosts.mjs`**: ホストを**発見する**（手で並べない）。リンクは**出現の文脈**で機械的に決める——
  `<a href>`（連結で組み立てたものも。`'<a href="'+U(x||('https://…'))` の形）・XML 名前空間・`window.open` /
  `location` への代入・DATA_SOURCES の `u`・`SPELLINGS.licenceUrl` の値・**licence／attribution を同じ語彙で
  述べる記録の `url`**（`js/data-governance.js` の `SPELLINGS` を読む。写さない）・`<meta>`・要求しない `<link rel>`。
  それ以外は全部、台帳で説明されなければならない。
- **`scripts/outbound-hosts.json`**（178 行: 開示 113・リンク 62・休眠 2・撤去中 1）: ホストごとに `what`・`sends`
  （符号＋補足）と、`disclosure`（§4 の **en と jp の両方**に実在する語句）／`link`（理由）／`dormant`（スイッチ名）／
  `removedBy` のどれか 1 つ。
- **門**: `npm run check:datagov` に規則 `outbound-disclosed` を足した（新しい `check:*` は増やしていない）。
  ① 要求しうるホストが全部台帳にある ② 各 `disclosure` が §4 の en と jp に実在する——§4 は `js/legal-text.js` を
  **評価して**読者に出る文から読む ③ コードがもう要求しないホストの行は赤 ④ `dormant` のスイッチが `true` なら赤。
- **§4 を直した**（en + jp。他 7 言語は元から英語へフォールバックする法務文で、変えていない）: 記事リーダーの
  1 段目を Jina AI と正しく述べ、パスワード確認が送るもの・送らないものを述べ、タイルを「等」ではなく名指し、
  Overpass のミラーと OHM を名指し、上の送信先をそれぞれ「何を・何を送り・何を送らないか」の文体で足した。
  `LEGAL_DATE` を 2026-09-29 に上げ、法務文の変更記録（ファイル内コメント）に 1 項を足した。

## 2. 否定した見立て・迷ったもの

- **「fetch の引数だけ見ればよい」は否定。** 定数（`const WHO_API='https://…'`）・タイル配列・`img src` の文字列・
  `<link rel=preconnect>` はどれも要求になり、fetch の引数には現れない。取りこぼしの向きを避けて、
  **「リンクだと証明できないものは全部要求」**とした。代償はリンク行 62（うち 48 は `js/datacenters.js` の出典リンク）。
- **`r.jina.ai` は到達できないコードの中にある**（`openArticleInSidebar()` の呼び出し元は #R11 以来無い——
  ファイル冒頭の #R169 の記録）。それでも §4 は既にこの記事リーダーを述べていたので、**述べ方を正しくした**
  （到達するかどうかは述べない）。撤去するか配線し直すかは製品の判断で、ここでは行っていない。
- **`api.acleddata.com`**（`js/app-body.js:3953`）は到達不能で、並行する別の変更が撤去中。台帳には
  `removedBy: "dead-code-removal"` で置き、**§4 には書いていない**。着地したら規則 ③ がこの行を赤くする（消す合図）——実際に #813 の着地後に赤くなり、行を消した（規則 ③ が働くことの実測）。同じ着地で PMTiles の読み込み器も消えたので、§4 の unpkg の説明から「PMTiles の読み取りライブラリ」を外した。
- **ホスト全体が式のもの**（7 件: OSRM の `'https://'+prof[0]`、511 各州のカメラ、企業サイトへの `window.open` 等）
  は発見できない。門が毎回 note で場所を印字する。OSRM は §4 が既に名指している。

## 3. 検査

- `tests/outbound-hosts-disclosed-checks.test.mjs`: 規則を**作業ツリーを書き換えずに**評価する（ファイル・台帳・
  §4 の本文を差し替えて `check()` を呼ぶ）。① 現状は緑で母集合は空でない ② 台帳から 1 行消す→赤 ③ 開示の語句を
  片方の言語で壊す→その言語だけ赤 ④ js に新しいホストを足す→赤（`+` で組み立てても赤・コメントと `<a href>` は緑）
  ⑤ 要求されない行→赤 ⑥ 休眠のスイッチを true に→赤 ⑦ `check:datagov --rule=outbound-disclosed` が実際に走らせている。
