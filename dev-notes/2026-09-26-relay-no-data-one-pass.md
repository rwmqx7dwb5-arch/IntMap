---
title: 上流の「無い」を relay が 502 に潰し、ページが同じ要求を同じ relay へもう一度送っていた——「無い」は答えとして返し、各段は 1 回だけ訊く
date: 2026-09-26
---

own-fetch-relay の本番検証で見つけた 3 件。どれも「失敗ではないものを失敗と報告した」か「前回と違わない再試行」で、
`.agents/rules/one-pass-or-a-reason.md` の §2-1（観測器が嘘をつく）と §5（再試行は違うことをするときだけ）の形。

## 0. 実測（2026-09-26・本番）

| 何 | 実測 |
|---|---|
| Companies を開いて Chronos を 1850 年へ | `js/companies.js` の setYear の予備取得が `quotes-relay?u=…/chart/<銘柄>?period1=-3786825600…` を送り、Yahoo は **400 `{"chart":{"result":null,"error":{"code":"Bad Request","description":"Data doesn't exist for startDate…"}}}`**（＝その期間は**無い**）。relay は `!r.ok` を 502 `upstream_error` にし、8 銘柄 × 2 回＝**16 件の 502** |
| 2 回目の正体 | `js/proxy-fetch.js` の `race()` の「one bounded pass」が、段が 1 本の URL で**同一の要求を同じ relay へ再送**していた（511wi のカメラ一覧も 2 回） |
| Google News の記事リンク | `news.google.com/rss/articles/…` を `?as=article` で渡すと **200・582,348 B**。中身は Google の中継ページで `<p>` 0・`<article>` 0・`og:type=website`、あるのは**サイトの**説明文の meta だけ。`looksLikeArticle` は description meta だけで記事と認めていた |
| 比較 | The Guardian の記事＝`<p>` 19・`og:type=article`・JSON-LD NewsArticle。aljazeera／bbc の頁＝`<p>` 17／33 |

## 1. 直したもの

- **「無い」は答え**: `_shared/relay-guard.js` に `noData()`——**200＋`x-intmap-no-data: 1`**、本文は上流の status とコードだけ
  （上流の文は中継しない）、共有キャッシュ可。このヘッダは、それを出す relay（quotes-relay・fetch-relay）が自分の CORS の `Access-Control-Expose-Headers` に載せる。
  - quotes-relay: 400/404 **かつ** Yahoo の v8 エラー封筒 → `noData`。429・401/403・封筒の無い 4xx は従来どおり 502。
  - fetch-relay: 404/410 → `noData`（一覧の規則も記事規則も）。それ以外の非 2xx は 502 のまま。
  - 他の relay を確かめた結果: news-relay は検索結果 0 件でも 200 の空フィードを返すので潰していない。cable-geo の 2 URL の
    404 は設定の破綻で「無い」ではないので 502 のまま。sv-cov は元から被覆無しを透明 PNG で答えている。gdelt-relay の `{}` は
    別の判断（開発記録 R769: 上流の不調）で、今回は触っていない。alerts-relay はページのルータを通らない。
- **ページは「無い」を失敗にしない**: `js/proxy-fetch.js` がヘッダを読み、`reason:'no-data'` を述べて `null` を返す（再試行しない）。
- **各段は 1 回だけ**: `race()` の「one bounded pass」と `PROXY_FALLBACK_MS` を撤去した。違うことをする段（`direct`＝ホストそのもの、
  競争の各 relay）は既に 1 回ずつ訊いてあり、同じ relay への同じ要求は違うことをしない。`note.attempts` が要求の数を記録する。
- **上場前の年を訊かない**: `js/companies.js` setYear の予備取得は、`range=max` の履歴が始まる年より**前**と、一度 `no-data` と
  答えられた「銘柄×年」（`_noPrice`）を訊かない。履歴の**内側の穴**と、履歴が無い銘柄だけを訊く。
- **中継ページは記事ではない**: `looksLikeArticle`（policy の 1 つの述語、ページと relay の両方が使う）は、`<p>` の無い頁を
  「`og:type=article` か JSON-LD の Article 型を**自分で名乗る**」ときだけ認める。

## 2. 門 — `tests/relay-no-data-one-pass-checks.test.mjs`

relay のハンドラ・`js/proxy-fetch.js`・`js/companies.js` を**評価**して測る: Yahoo の 400/404 封筒は 200＋no-data（上流の文は出ない）、
429 と封筒の無い 400 は 502／fetch-relay の 404・410 と 500・403／梯子は no-data で 1 回だけ・`attempts=1`、502 でも通信断でも同じ relay へ
2 回目を送らない、`direct` があるときは**違う** 2 要求／1850 年で履歴の無い 1 銘柄だけを訊き、2 度目は訊かない／Google の殻を拒み、
記事は通す（relay 経由でも `not_an_article`）。
既存検査の付け替え: `own-fetch-relay-checks` ②（404 の本文は中継しない→500 で、404 は no-data で本文を出さない）、r446 ③（第 2 周が無いこと・
全 racer が予算に縛られること）。

## 3. deploy する関数

`quotes-relay`・`fetch-relay`（どちらも `_shared/relay-guard.js` と、fetch-relay は `_shared/fetch-relay-policy.js` を含む）。
`corsFor()` は変えていない——`x-intmap-no-data` を公開するのは、それを出す 2 本が自分の CORS で行う（r468 ③: 共有の既定は何も公開しない）。
