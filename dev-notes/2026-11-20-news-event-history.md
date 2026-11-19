---
title: ニュースを「直近の記事」から「年単位で検索できる出来事の履歴」へ
date: 2026-11-20
newsen: Atlas can now look back through a long record of news events — what was planned, built, opened, closed or bought at a facility — and says where the record starts. News sources grew from 18 to 49 outlets, including regional and official feeds.
newsjp: Atlas が長期の出来事の記録をさかのぼれるようになりました。施設の計画・着工・稼働・閉鎖・買収の経緯を引け、記録がどこから始まるかも答えます。ニュースの収集元は 18 媒体から 49 媒体に増え、地域媒体と公式発表を含みます。
---

〈依頼〉 外部監査（2026-11-20）の指摘: ニュース基盤を直近の記事から長期に検索できる出来事の履歴へ。埋め込み段の停止の原因、永続 ID・場所・関係施設・出典・更新履歴、同一施設の系列の区別、Atlas の能力、収集元の拡充。

## 実測（本番・2026-11-20）
- 埋め込み段: 最新 run `embed_error = openai embeddings 403`・`embed_available_models = {all:3, ids:[]}`・`embed_pending = 3216`・`embedded = 0`。
  `atlas_capability_vectors` も 0 行。**観測器の嘘ではなく、鍵が埋め込みモデルに届かない**（上流の 403 と一覧が同じことを言う）。
- 出来事 30 日窓 20,669 件・独立 2 家族以上 4,464 件・`news_event_entities` 1,090 行・`world_graph_nodes` 102 件・DB 124 MB。

## 直したもの
- `embed` 段: OpenAI の一覧に埋め込みモデルが無いとき、設定済みの `GEMINI_API_KEY` へ**一覧を訊いて**移る（`gemini-embedding-001` 想定・1536 次元へ切り詰めて正規化）。⚠ 本番でこの経路が実際に動くかは deploy 後の run で確かめる（鍵は Edge Function の内側にしか無く、手元では呼べない）。
- `news_event_history`（migration `20261120120000`）: 永続 ID・時刻・場所・world node・企業・出典・更新履歴・`thread_key`。公開読み取り・書き込みは service_role のみ。`news_history_search` が coverage を必ず返す。
- 書き写しは `prune` 段の先頭。失敗したら prune を止める。硬い上限 30 万行（`news_history_trim`）。
- `thread_key`: 述べられた施設 → `ref:`、無ければ企業 + 1 度セル → `co:`、無ければ出来事自身。類似度で結ばない。
- Atlas `news.history`（能力表・説明・プロンプトの規則つき）。記録の始まりを明言する。
- `toArticleRow`: `language` を媒体の言語から（以前は `'en'` 固定）。
- 収集元 31 本（`20261120130000`）。690 URL を実測。

## 測って採らなかった（次が探索をやり直さないために）
TSMC・Intel・Shell・TotalEnergies・ASML・Cheniere・QatarEnergy・METI は 403/404・古い・フィードでない。Nikkei Asia は項目に日付が無い。
Viet Nam News は UTF-16 のフィード（parseFeed が UTF-8 前提）。Intel investor は 7 日古い・STMicro 3.4 日・Qualcomm 15 日。
他 400 余りは 403/404・HTML・古い・日付なし（測定表は side-session-notes の news-feeds-measured.md）。

## 残っていること（隠さずに）
- 2010 年への遡及データは無い（記録は本番に流れた日から）。遡及するなら GDELT 等の別の出典が要り、別の判断。
- 非英語の記事は単独の出来事になりやすく、履歴の採用基準（独立 2 家族）を満たさない限り残らない。
