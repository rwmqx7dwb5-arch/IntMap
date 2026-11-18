---
title: OGC API – Features のコレクションを Atlas から取り込めるようにした
date: 2026-11-19
newsen: Atlas can now pull features straight from an OGC API – Features collection on the web, page by page, and analyse them.
newsjp: Atlas が、Web 上の OGC API – Features のコレクションから地物を直接（ページ単位で）取り込んで分析できるようになりました。
---

〈依頼〉 外部評価の第 1 優先「COG や OGC API – Features など広く使われる形式の供給元」の、ベクタ側。

## 1. 変更

`js/gis-ogcapi.js`（新）と、`js/gis-atlas.js` の `ogc:` 入力。供給元は既存の取得の契約（`bounds`/`limit`/`cursor`・
`coverage`・`next`）にそのまま載せたので、ページ単位の取得は新しい仕組みを作らず既存のものを使っている。
`where`/`fields`/`time` はサーバが無視しうるため断る（`docs/GIS-CORE.md` §1.4d）。読者向けの拒否文を
`js/gis-panel.js` に足した（en+jp）。

## 2. 検査

`tests/ogc-features-source-checks.test.mjs`（4 本・サーバは検査内の偽物で 25 件を 10 件ずつ返す）: 上限なしは 1 ページ
＋カーソル・上限ありは届くまで・最後のページを切らない・bbox が送られる・別オリジンのカーソル/next・ループ・
http・地物でない本体・登録と `filter` の鎖・格子の枠と条件の拒否。⚠ カーソルで着いた最後のページを `all` と呼んだ
最初の実装を検査が落とした（`numberMatched` との比較が始点からの呼び出しにしか成り立たない）。

## 3. 未了

- 実在の OGC API サーバ（CORS・ページ形式の差）での実測は未実施。
- CQL2・`datetime` の送出（適合クラスを読んでから）。
- STAC 検索の入口（次）。
