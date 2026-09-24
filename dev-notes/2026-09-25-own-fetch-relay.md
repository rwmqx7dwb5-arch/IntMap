---
title: 第三者の公開 CORS プロキシをやめ、自前の fetch-relay に集約した。公開の関数は全部 bucket から取り、relay と自分のクライアントの食い違いは門が評価で測る
date: 2026-09-25
---

〈#R801 §5 の「直さず残したもの」1 行目と、#R803 の形（relay の許可表と自分のクライアントが本番で初めて食い違った）〉

### 0. 実測

| 何 | 実測 |
|---|---|
| 公開プロキシの直書き | `corsproxy.io`・`api.allorigins.win`・`api.codetabs.com`・`proxy.corsfix.com` が `js/proxy-fetch.js` と 17 ファイルに手書き。関数形の段だけで **31 段・12 ファイル**（門 ② の⑴と同じ形の検出器を own-fetch-relay 前のツリーに走らせた数） |
| 本番での振る舞い | 401／403／503／522 か無応答（`docs/MONITORING.md` §1c）、Atlas の証拠 1 回に約 55 秒（`js/atlas-sources.js`） |
| 上流の ACAO（2026-09-25・Origin＝本番オリジン） | **返す**: deepstatemap.live・raw.githubusercontent.com・open.er-api.com・api.fxratesapi.com・api.gold-api.com・api.coingecko.com・valhalla1.openstreetmap.de。**返さない**: www.imf.org（NGDPD 157,531 B／9.98 s）・「511」13 サイト（最大 fl511.com 811,300 B）・api.opentopodata.org・www.submarinecablemap.com・Yahoo。drivenc.gov／nvroads.com は `www.` へ 302/301、511wi.gov は非ブラウザに 403、celestrak.org はこの端末から接続できず |
| 記事の発行元 | dw.com・www3.nhk.or.jp・edition.cnn.com は ACAO:*、aljazeera・bbc・guardian・lemonde は無し |
| 共有 bucket | verify_jwt=false の 15 本のうち `relay_take` を呼ぶのは routing-relay だけ |

### 1. 直したもの

- **`fetch-relay`**（新 Edge Function）＋ **`_shared/fetch-relay-policy.js`**（許可表の唯一の正本）。規則は上流ごとに
  ホスト完全一致・錨付きパス・クエリ鍵の完全集合と値の形・Content-Type・バイト上限・期限・キャッシュ寿命。
  `js/proxy-fetch.js` も同じファイルを import する。リダイレクトは**同じ規則**だけ（`redirectHosts` はホップ専用）、
  2xx 以外の本文は中継しない。`_shared/relay-guard.js` に `publicHostname()`（アドレス直書き・単一ラベル・
  localhost/.local/.internal/home.arpa を拒む）を足した——⚠ 依頼文にあった「_shared の私的 IP 拒否」は**無かった**ので新設。
- **`js/proxy-fetch.js`** から公開プロキシを撤去。段は自前の relay だけ（gdelt-relay 単独先行・news/quotes/cable-geo/
  sv-cov/fetch-relay の競争）。`ownRelayUrl()` を export（<img> と Cache API の呼び手用）。`as:'text'` を追加。
  予算を指定しない呼び手には relay の時計（規則の `timeoutMs`＋往復 3 秒）が収まる予算。
  ⚠ news-relay の行を `/rss/` 接頭辞から関数と同じ 2 形へ狭めた——`/rss/articles/…`（記事リンク）を relay に渡して 400 を得ていた。
- 呼び出し元 17 ファイル: ACAO を返す上流は**直接だけ**（beta-overlays・time-borders・map-tools・sims・ticker の FX/金/暗号資産）、
  返さない上流は自前 relay（stats-compare＝IMF・cameras＝511・map-readout＝GEBCO・satellites-live＝CelesTrak・
  map-ui＝Yahoo は quotes-relay・data-layers/layer-previews＝cable-geo・street-view＝sv-cov）。
  street-view と data-layers は relay の URL をモジュール評価時に 1 回組んでいた（#R216 の形）のを呼び出し時に。
  article-reader の第 2 段に `direct:true`、その後ろに fetch-relay の**記事規則**（下）。
- **共有 bucket を配った**: `_shared/rate-limit.js` に `callerGate()`（`<関数名>:ip`、容量＝`READER_PER_MIN`×`READERS_PER_ADDRESS`、
  **fail-open**、429＋Retry-After、`<NAME>_PER_IP_PER_MIN` で上書き）。alerts-relay 240・ais-feed 12・aviation-feed 30・
  cable-geo 6・fetch-relay 60・gdelt-relay 20・news-relay 30・quotes-relay 360・radiation-feed 60・sv-cov 120・
  volcano-feed 12・who-don（GET）12。⚠ どれも**クライアントのタイマーから読んだ推定**で、`READERS_PER_ADDRESS=10` も推定。
- 出典（en+jp）・プライバシー（en+jp、`LEGAL_DATE` 2026-09-25）・reference-data の行（公開リレーは「使っていない」と述べ、リンクは許可表へ）。
- CSP: `connect-src` は `'self' https: wss: data: blob:` で公開プロキシのホストを名指していなかった——**消すものが無かった**。

### 2. 門 — `tests/own-fetch-relay-checks.test.mjs`

- ① ページが relay に渡す URL を**ソースから発見**（`js/proxy-fetch.js` の export を入口に、仮引数を渡す関数を不動点まで、
  `/functions/v1/<fn>?` を組む関数は builder）し、acorn で部分評価（定数・配列の反復・局所関数の戻り値）、ページの経路で
  relay を決め、**その relay のハンドラを実行して**上流へ出るかを見る。変異確認: alerts-relay の CMA を http だけに戻すと
  `world-packs.js:3422` で赤（#R803 そのもの）。
- ② relay に頼る（`direct` の無い）呼び手が許可表に無い上流を名指せば赤／規則のホストに呼び手が無ければ赤／
  ページと関数が同じ URL に同じ答え／リダイレクトと誤型・2xx 以外／**URL を丸ごと他ホストのクエリに渡す形**
  （旧ツリーで 31 段）を名前を 1 つも書かずに検出。
- ③ verify_jwt=false の全関数を bucket 拒否で実行し、上流へ出たら赤。relay は自分のクライアントの URL で 429。

### 3. 同じ回で直した続き

- ⚠ **記事の第 2 段が縮小になっていた**（ACAO を返さない発行元＝aljazeera・bbc・guardian・lemonde が埋め込みへ落ちる）
  ⇒ fetch-relay に**ホスト一覧を持たない唯一の規則** `ARTICLE_RULE` を足した。狭め方: 呼び手が `as:'html'` のときだけ
  `&as=article`／https・既定ポート・`publicHostname()`／**名前を引いて A/AAAA が全部公開アドレス**（`resolvesPublic()`・
  `publicAddress()` を `relay-guard.js` に新設。解決器が無ければ拒否）・各ホップも同じ／`text/html`・3 MB・
  `looksLikeArticle()`（ページの `isHTML` を policy へ移して 1 つにした）／`fetch-relay-article:ip`（1 人 10/分）。
  `relay-guard.js` の `followRedirects` は `allowRedirect` を await する（DNS を要る判定のため）。プライバシー §4（en+jp）に記事 URL だけが中継へ渡ることを書いた。
- **既存検査を元の欠陥に付け替えた**: r190 ②（ボランティアのプロキシ頼み→`_cableNet` が直接→自前 relay だけ・ルータを評価）、
  r216 ①・r452 ④（段が自前の relay だけ・公開プロキシ無し）、r452 ①⑥（SUPABASE_URL を与えて段を実在させ、
  停滞・停止を自前 relay の段で測る——与えないと段 0 本で空振りしていた）、r446 ①〜⑤（記事は自前の記事規則で届く・
  エラー封筒は拒む・予算が段を縛る・述語は policy の 1 つ）、r464 ⑧（gdelt-relay は競争に入らない、をルータを評価して）。
- **監視**: `scripts/probe-relay-ladder.mjs` を自前 relay の探査へ向け直した。対象は policy の各規則の `probe` と
  専用 relay 5 本の URL、行き先はページのルータに訊く。段 0 本は `none`（exit 0・issue なし）、スクリプト故障は `error`（exit 2）。
  `tests/own-fetch-relay-checks` ⑤ が `--list` をオフラインで走らせ、ルータが使う relay に対象が欠けたら赤。2026-09-25 実測 `degraded 4/10`
  （fetch-relay は未 deploy の 404、gdelt-relay は上流 429）。uptime の issue 題と本文も自前 relay の語へ。
- `tests/r185.spec.js`: CelesTrak と、その第 2 経路になった fetch-relay への要求を落とし、**relay が試されたこと**も測る（緑）。

### 4. 残したもの（報告）

- r403 ③④⑥ は関数の本数「17」を固定しており赤のまま（#735 が `tests/helpers/edge-functions.mjs` で数える形に直すので触らない）。
  r175 ③・r207 ⑬ のビルド印も触らない。
- 記事規則: Supabase の実行環境に `Deno.resolveDns` があるかは本番で測る（無ければ記事規則は全部 400）。
  名前を引いた答えと接続が使う答えの食い違い（TTL 0 の rebinding）は閉じられない。`r.jina.ai`（第 1 段）は第三者のまま。
- celestrak.org の Content-Type と大きさはこの端末から実測できていない（規則に明記）。
- 残り 7 言語の出典・プライバシー文は凍結のまま「公開リレーを使う」と述べている。
- `Architecture.md` の deploy ループに radiation-feed が元から無い。

- 起動時に読むモジュールが 2 本増えた（`supabase/functions/_shared/fetch-relay-policy.js` をページと relay の両方が import する＝許可表の正本を 1 か所にした代価）。`tests/perf-baseline.json` の `eager.modules` を 2 本増やした（着地時 304→306）。容量は許容幅の内（raw +9.4 kB）。
