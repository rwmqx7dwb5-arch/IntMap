---
title: Gemini の埋め込みモデルを見落としていた——一覧の判定を「どちらかの埋め込み方式」に直し、能力検索とニュースの埋め込みを動かす
date: 2026-11-25
---

〈経緯〉#1406 の後も本番の能力検索は `model_unavailable` で、`atlas_capability_vectors` は 0 行、ニュース記事の埋め込みも 0 件。
#1411 で足した診断を本番で 1 回読んだ（2026-11-25）:

```
openai: 一覧 3 件・埋め込みモデル 0
gemini: 一覧 65 件・埋め込みモデル 0   ← 判定が batchEmbedContents だけを見ていた
```

## 原因

Gemini の一覧で「埋め込みモデル」とみなす条件が `supportedGenerationMethods` に `batchEmbedContents` を含むことだけだった
（`_shared/embedding-provider.js` と、ニュース取り込みが持っていた同じ判定の写し）。鍵が見える 65 件のどれもそれを挙げて
いないので、能力検索もニュースも「埋め込めるモデルが無い」と判断し続けていた。

## 直したこと

- `_shared/embedding-provider.js`: `batchEmbedContents` か `embedContent` のどちらかを挙げるモデルを埋め込みモデルとし、
  どちらを挙げたかを覚える。`embedContent` だけのモデルは入力 1 件ずつの呼び出しを同時に送る（同じ答えの形・1 件でも
  失敗なら全体を失敗とする）。一覧が `embed` を名に持つモデルの方式を `named` として返し、atlas-embed の診断に出す。
- `news-ingest`: 判定と呼び出しの写しをやめ、共通の部品を使う（形式上の削除: 引き継ぐのは共通の部品）。
- 検査: `atlas-embed-gemini` ⑤（`embedContent` だけのモデルが選ばれ、1 件ずつ呼ばれ、batch は呼ばれない）。
  `news-event-history` の綴りの検査を新しい呼び出しの綴りへ。

## 本番で確かめること

能力検索を 1 回走らせ、`atlas_capability_vectors` に行ができること。外れていれば `diag.lists[].named` が各モデルの方式を述べる。
