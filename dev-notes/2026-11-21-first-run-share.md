---
title: 共有リンクが地震など 75 レイヤーを落としていた／携帯のツールに共有の入口が無かった
date: 2026-11-21
newsen: Share links now include every active data layer (earthquakes and the World Bank indicators were missing), and the phone Tools sheet has a Share button.
newsjp: 共有リンクが、地震や世界銀行の指標を含むすべての表示中データレイヤーを運ぶようになり、携帯の「ツール」に共有ボタンを追加しました。
---

〈依頼〉初めて来た人が価値に着くまで・携帯での完遂・結果の共有を、本番の実測から直す。

## 0. 測った（本番・未ログイン・2026-11-21、プレビューペイン。秒は rAF 約 3fps で実機とは違う）
- 初回: PC・携帯ともコンソールエラー 0、案内なし。最初の Atlas 質問まで 4 操作（検索欄→入力→Enter→「Ask Atlas」行）。
- 携帯の代表依頼: 地震 4 タップ+入力、歴史地図 2 タップ（年 1881 に切替）、比較分析 1 タップ（行はスクロール外）。いずれも完遂可。ただし Atlas パネルが FAB 列・地図下端の帯に重なる。
- 共有: 地震をオンにしても `l=` が付かない（修正前）。携帯のツールシート 34 ボタン中、共有は 0（`#btn-share` は 0×0 で隠れ、`IntMapShare.open()` を JS で呼べばパネルは開く）。
- Atlas の `panel.share` は存在する（同じ `IntMapShare` 経路）。

## 1. 直したこと
- `sharedIds()`（js/layer-manifest.js）を「`share` が立つ行」から「全データレイヤー」へ。`share` は旧い id 接頭辞（dl-, gx-, eco-dl- …）の写しで、`bx-`（地震・世界銀行指標）・`fac-dl-osm*`・`ox-*` の 75/170 が漏れていた。パネルは「全レイヤーを含む」と述べていた。新しいレイヤーも自動で運ばれる。`catalog()` の `share` も同じ事実を言う。Atlas が読む経路も同じ。
- 携帯の Tools シートに Share タイル（`data-proxy="btn-share"`）。押すとシートを閉じて共有パネルを開く。
- 検査: 「share は置き換えた selector と同じ」と事故を固定していた `layer-manifest-checks` を「全データレイヤーを運ぶ」に置換。`layer-descriptor-checks` の 1 バイト一致は 4 つ目の意図した変更として `sharedIds`／`catalog.share` を両側から外す。新規 `first-run-share-checks`。

## 2. 引き継ぎ（今回触れていない）
- 宣言の `share` フラグ（データレイヤー側）は読まれなくなった。写真（fixture）の更新を伴うので別作業で消す。表示項目（`d=`）では引き続き有効。
- 地図エンジン（MapLibre/Cesium）は URL に載らない。携帯の Atlas パネルと FAB の重なり、「No results」の下に出る Ask Atlas 行は他セッション（地球表現・Atlas）の領域に近いので触っていない。
