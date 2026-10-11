---
title: World Bank の CDN が CORS ヘッダーの無い写しを配り、1 人当たり GDP（PPP）が空だった——同じ問いを別の綴りで 1 回だけ訊き直す
date: 2026-10-11
---

〈きっかけ〉#1065 の本番検証（2026-10-11）で、`NY.GDP.PCAP.PP.CD`（1 人当たり GDP・PPP）への取得が
読み込みのたびに CORS で止められていた。`js/app-body.js` の `loadGdpPPP` は失敗を空として扱うので画面は壊れないが、
その間この値は誰にも出ない。

## 0. 測った（curl・サイトの Origin を付けて）

| アドレス | Access-Control-Allow-Origin | Age |
|---|---|---|
| `…/indicator/NY.GDP.PCAP.PP.CD?format=json&mrnev=1&per_page=400`（アプリが使う綴り） | **無し** | 76,945 s（約 21 時間） |
| `…/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=400` | `*` | 76,065 s |
| `…/indicator/NY.GDP.MKTP.PP.CD?…`（同じ形の別系列） | `*` | 76,950 s |
| `…/indicator/NY.GDP.PCAP.PP.CD?per_page=400&format=json&mrnev=1`（順を変えただけ） | `*` | 新規 |

API は正常で、**1 つのアドレスの写しだけ**がヘッダー無しで CDN に残っている。CDN は問いではなく
書かれたアドレスを鍵にしている。最初にその写しを作った要求は分からない（リポジトリの `scripts/` と
workflow でこのアドレスを訊くものは無い）。ブラウザからはネットワーク失敗としか見えない。

## 1. 直し方

World Bank への要求は全部 `js/wb-indicators.js` の 1 つの読み手を通る（`js/` を数えて確かめた）。そこで、
**ネットワーク失敗（観測された失敗）のあとだけ**、同じパラメータを逆の順に書いたアドレスで 1 回だけ訊き直し、
答えに `via: 'second-address'` を残す。期限切れ（観測できなかった）と、ホストが返した答え（http・parse）の
あとでは訊き直さない（`.agents/rules/one-pass-or-a-reason.md` §5）。1 回目のアドレスは従来と同一。
全系列に効く——次にどの系列の写しが汚れても同じ道で読める。

失効条件: World Bank の CDN が Origin で写しを分けるようになれば、この訊き直しは起きなくなる（害は無い）。

## 2. 検査

`tests/wb-cors-cached-copy-checks.test.mjs`（新規・読み手を評価）: ネットワーク失敗のあと 1 回だけ別の綴りで訊き、
2 つは同じ問い（パス＋パラメータの集合が同じ）であること、両方失敗なら unavailable、timeout / http / parse は訊き直さない。
修正を外すと落ちる。既存の `country-analysis-unify-checks`・`unobserved-is-not-refused-checks` は緑。
