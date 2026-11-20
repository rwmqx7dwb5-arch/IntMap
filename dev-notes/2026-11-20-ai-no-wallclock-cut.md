---
title: 画像付きの依頼が 55 秒で「AI が一時的に使えません」になっていた——ai-proxy の固定の切断をやめ、プラットフォームの時計に従わせた
date: 2026-11-20
newsen: Atlas no longer gives up on a request that needs a long time to think, such as a screenshot you attach and ask it to match.
newsjp: スクリーンショットを添えて「この視点にして」と頼むような、考えるのに時間がかかる依頼を Atlas が途中で打ち切らなくなりました。
---

〈依頼〉本番で「これと同じアングル、ズームレベル、場所にして」に画像を添えると 57.7 秒で
「The AI service is temporarily unavailable」になる。「時間切れは要らない・将来の自律的な長い作業でも壁になる」。

## 0. 測った

本番（ログイン済み・2026-11-20）で同じ依頼を再現。ai-proxy の応答:

```
HTTP 503  57,458 ms
{"error":"provider_unavailable","message":"The AI provider timed out.","retryable":true,
 "meta":{"provider":"openai","model":"gpt-6.2-sol","task":"vision_read","timeout":true,"tooLarge":false}}
```

- 提供元は動いていた。`providerCall` が `PROVIDER_TIMEOUT_MS`（55 秒・当方が決めた数）で打ち切っていた。
- 直後の「おはようございます」は 9.0 秒で通った＝障害ではなく、その依頼が重かっただけ。
- クライアント（`js/ai-core.js`・`js/atlas-agent.js`）には時間の壁が無い。ターン全体の制限も無い（ステップごとに別の呼び出し）。

## 1. 直したもの

- `_shared/ai-provider.js` に **プラットフォームの時計** を 1 か所で持たせた（Supabase のドキュメント、2026-11-20 に確認:
  応答開始まで 150 秒・worker の寿命は有料で 400 秒。本プロジェクトは Pro）。`providerBudgetMs(streaming, startedAt, now)` が
  「そのリクエストがまだ使える ms」を返す。ストリームする呼び出しは 400 秒、しない呼び出しは 150 秒から、精算に要る余白 30 秒と
  使用済みの分を引く。**1 つの読者リクエストの全ての提供元呼び出しで共有**するので、梯子の次の段・検索の再試行は
  「残り」を得る（新しい窓は得ない）。
- `ai-proxy/provider-call.ts`: `ms` を指定しない呼び出しはこの予算を使う。`ask.ts` のメーターが `startedAt` を持つ。
- `providers/openai.ts` の `WEB_TIMEOUT`（90 秒）と再試行の 40 秒、`anthropic.ts`・`gemini.ts` の 55 秒を廃止（予算に一本化）。
- 残したもの: `models.ts` のモデル一覧取得の 15 秒（別の仕事）、他の関数（ニュース取り込み・埋め込み等）の既定 55 秒
  （読者を待たせない裏の仕事で、この変更の対象外）。

## 2. 引き継いだもの・まだ残るもの

- 暴走を止める役は、プラットフォームの上限と、`CONSTITUTION.md` §5 の手数・費用の天井が引き続き担う（動かしていない）。
- 窓を使い切った呼び出しは従来どおり 503 provider_unavailable（timeout:true）。ただし 55 秒ではなく約 6 分後。
- **未対応**: 「画像を読む処理が依頼に見合って重すぎないか」（`vision_read` の思考の深さ）は別の作業。
  この変更は、重くても通るようにしただけで、軽くはしていない。

## 3. 検査

`tests/ai-no-wallclock-cut-checks.test.mjs`: `providerBudgetMs` を評価／`providerCall`・`callOpenAI` を fetch と setTimeout を
差し替えて呼び、**中断タイマーに実際に渡る ms** が予算であることを読む／ai-proxy のソースに固定の数が戻らないこと。
