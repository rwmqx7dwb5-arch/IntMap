---
title: Atlas の回答表示 5 欠陥——スクロールの所有権・完了時に組み直さない領域・内部記録の分離・描画記録・図形の出典
date: 2026-11-20
newsen: Atlas no longer pulls the chat back down while you read, answers no longer jump when they finish, internal Python details are hidden, every map change gets an on/off switch, and shapes Atlas drew are listed apart from the basemap credit.
newsjp: Atlas の回答を読んでいる最中に強制スクロールされなくなり、回答完了時の跳ねも無くなりました。Python の内部情報は表示せず、地図を変えた操作には必ずオン・オフスイッチが付き、Atlas が描いた図形の出典は背景地図のクレジットと分けて表示されます。
---

〈依頼〉外部監査が挙げた Atlas チャット UI の 5 欠陥を根本原因で直す。

- **スクロール**: 距離（最下部から 150px）で判断していたので、読むために上へ動かした利用者を引き戻した。`_chatFollow` という所有者の状態にし、ホイール・タッチ・スクロールバー・スクロールキーで解除、送信と「最新へ」で再開。
- **完了時の跳ね**: `_atlCompose` が `ai.innerHTML` で全体を置換していた。head / body / ops / srcs の 4 領域（`_patchRegions`）を持ち、HTML が変わった領域だけ書く。進捗トレースは元から別の兄弟要素。出典の委譲クリックは吹き出しごとに 1 回だけ結ぶ。
- **内部情報**: `compute.run` の表示 HTML から実行環境・パッケージ・データセット ID・次の手順の説明を外し、`meta.record` に移した。`atlas-toolsurface.js` が結果テキストの先頭に付けるのでモデルには届き続ける。**未対応で残る同形**: `js/gis-atlas.js` の結果カード（id と「次の処理に使えます」）。
- **スイッチ**: `chips` の宣言と kind の可視判定に頼っていた。レンダラが描画面を所有者付きで claim するので、操作の前後で `render.drawn()` を比べ `{kind, layerIds, visible}` を結果に付ける（`_drewSince`）。`chips` は併用。
- **出典**: `figure` 種別を追加。ツールが根拠を述べない図形は「Atlas が作図 — 出典は記録されていません」と正直に出し、背景地図のクレジットとは別のグループで並べる。

検査: `tests/atlas-chat-scroll-ownership-checks.test.mjs`。実ブラウザでの AI チャット実測は、ログインが要るため本記録の時点では未実施。
