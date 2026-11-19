---
title: OGC Features に datetime と CQL2 filter（供給元が述べたときだけ）・STAC に POST 検索を足した
date: 2026-11-19
newsen: Data acquisition from OGC API feature services can now filter by time, and STAC searches can use POST for larger queries.
newsjp: OGC API の地物サービスからの取得で時間による絞り込みができ、STAC 検索は大きな問い合わせのために POST も使えるようになりました。
---

〈依頼〉外部の技術評価が「OGC API Features は属性条件・日時を供給元に実行させられない／STAC は GET のみ」と指摘。実体照合で正しいと確認（`js/gis-ogcapi.js` 冒頭が自ら「未対応」と明記していた）。

## 0. 直したこと
- `/items` へ `datetime` を送る（Part 1 の Core）。`data.gis` の `time` が OGC コレクションにも通る。
- `filter`（CQL2 テキスト）は `readItems` の欄。API ルートの `/conformance` が Features の filter クラスと `cql2-text` を**両方**述べたときだけ送り、述べなければ `ogc-filter-not-declared`。無視される条件で完全に見える答えを返さない。
- STAC `method:'POST'`: 本文に bbox/datetime/limit/collections/ids/intersects/query/filter。POST の next（`body`・`merge`）は呼び出し内でたどる。URL カーソルにならないので、途中で止まれば `post-next-not-resumable`・`next:null`。

## 1. やっていないこと（名指し）
- 署名付き資産: 提供元の鍵が要り、この層は保持しない。
- `data.gis` の `where` と CQL2 の結線: `where` は構造化条件で、翻訳は別の仕事。
- 実在サーバでの接続検証: 検査は本ファイルの偽サーバのみ。

## 2. 検査
`tests/ogc-filter-post-search-checks.test.mjs`（新規 6）。旧契約（OGC は time を断る）を assert していた 2 行を `tests/stac-search-source-checks.test.mjs` で更新——断ることが欠陥だったため。

## 3. 天井を上げた理由
`gis-ogcapi` の async チャンクの天井（`tests/perf-baseline.json`）を、実測の増分まで上げた。増えたのは POST 本文の組み立て・/conformance の判定・next リンクの POST 追従で、どれも利用者が使う能力であり、遅延チャンクなので起動時の転送量は増えない。
`gis-core` も 592799→596030 に上がった。これは本 PR の差分ではなく、rebase で入った main 側の変更による増分（本 PR は gis-core を触っていない）。同じ実測で ceiling が超えられていたため合わせた。
