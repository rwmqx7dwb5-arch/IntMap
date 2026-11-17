---
title: 世界銀行の CDN が CORS ヘッダー無しの写しを両方の綴りで配り、別アドレスでの訊き直しも塞がれていた——訊き直しを自前の中継（fetch-relay）にした
date: 2026-11-17
newsen: When the World Bank's servers hand your browser a copy it cannot read, country figures such as population now arrive through IntMap's own relay instead of staying blank.
newsjp: 世界銀行のサーバーがブラウザで読めない写しを返したときも、人口などの国の数値が IntMap の中継を通って届くようになりました（空欄のままになりません）。
---

〈依頼〉本番検証で見つかった World Bank の CORS エラーを、再現してから根本で直す。

## 0. 測った

- 本番（2026-11-16）で `api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL` への読み込みが CORS で塞がれ、引数の順が違う 2 本とも `net::ERR_FAILED`。
- curl でサイトの Origin を付けて同じ 2 アドレスを取ると、どちらも `200`・`CF-Cache-Status: HIT`・`Age: 863`・**`Access-Control-Allow-Origin` 無し**。同じ問いを別の範囲（`date=1960:…`）で訊くと `MISS` で `*` が付く。CDN の写しはアドレスだけを鍵にし、最初に訊いた者が Origin を付けていなければ、その写しは数時間ブラウザから読めない。
- wb-cors-cached-copy（2026-10-11）の対処「パラメータの順を逆にした別の綴りで 1 回訊き直す」は、写しをもう 1 つ増やしただけで、その写しも同じ状態になりうる——実際になっていた。

## 1. 直したこと

- `js/wb-indicators.js`: ネットワーク失敗（観測された失敗）のあとの訊き直しを、**同じアドレスを自前の中継で 1 回**にした（`via: 'relay'`）。中継はサーバー側で読むので、ヘッダーの無い写しも普通の答え。期限切れ・ホストの答え・中継が無いときは訊き直さない。別綴りの訊き直しは消した（中継が同じ役目を、塞がれない形で引き継ぐ）。
- `supabase/functions/_shared/fetch-relay-policy.js`: 規則 `world-bank-indicator`（ページが実際に書く形だけ: 路 `/v2/country/<code>/indicator/<code>`、`format=json`・`per_page` 必須、`source`・`date`・`mrnev` は任意）。規則に **`optional`**（無くてよい鍵）を足した——それまでは「名指した鍵は全部必須」だったので、任意の引数を持つ上流を 1 規則で書けなかった。probe も付けたので 6 時間ごとの監視に乗る。
- 読み手の住所の組み立てを 1 つの式にした（`own-fetch-relay` の発見が住所を読めるように。出来る文字列は以前と同じ＝CDN の鍵は変わらない）。
- プライバシーポリシー §4（en + jp）に、世界銀行が中継経由で読まれうることを書いた。宛先（Supabase）も送る中身（コード）も同じで、経路だけが新しい。

## 2. 検査

`tests/wb-cors-cached-copy-checks.test.mjs` を言い直した（中継で 1 回・同じアドレス・中継が無ければ訊き直さない・ページが書く全部の形を規則が通し、余計な鍵・別の路・別の形式は通さない）。`own-fetch-relay`・`proxy-fetch-relay`・`stalled-fetch-and-surface-gauge` と合わせて 47 件緑。
