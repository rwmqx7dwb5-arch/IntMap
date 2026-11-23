---
title: 軽量ブラウザの上に実ブラウザ層(web.render)を足す——スクリプト描画ページとページの画像認識だけ切り替える
date: 2026-11-20
newsen: Atlas can now open pages that are drawn by script and look at a page as a picture, through a real-browser tier behind the light browser. It only loads and reports — it cannot click, type or send anything. It stays off until the site is connected to a browser service.
newsjp: Atlas が、スクリプトで描かれるページを開き、ページを画像として見られるようになりました(軽量ブラウザの裏の実ブラウザ層)。開いて報告するだけで、クリック・入力・送信はできません。ブラウザのサービスにつなぐまでは停止したままです。
---

〈依頼〉 総合技術監査 P1(3.6): #1296 の軽量 HTML ブラウザを残し、JS 描画ページ・視覚的操作・スクリーンショット認識が要るときだけ実ブラウザへ切り替える層。基盤の実現性調査から。

## 0. 基盤の調査(2026-11-20)
- **Supabase Edge は不可**: Deno の隔離ワーカーで Chromium は動かせない。
- **リポジトリに既存契約は無い**: Cloudflare / Browserless / Browserbase / puppeteer の設定・秘密は 0 件(`gh secret list` は `BACKUP_GPG_PASSPHRASE`・`SUPABASE_ACCESS_TOKEN` のみ)。配信は AWS で、Cloudflare は配信先としては不採用(DECISIONS.md)だが、これはブラウザ描画の話ではない。
- **選択肢**: ① Cloudflare Browser Rendering(REST・有料プラン+従量)② Browserless 等(外部契約)③ GitHub Actions の Playwright(公開リポジトリ=ログ・成果物が公開で、遅く、読者の URL が漏れる。不採用)④ 自前(口座と運用が要る)。
- **利用者の選択(AskUserQuestion)**: 「アダプタ実装のみ・契約は後」。契約・料金の発生は 0。秘密が無い間は `render_unconfigured` と正直に答える。

## 1. 作ったもの
- `supabase/functions/_shared/web-render.js` — エンジン兼アダプタ(純粋ロジック・Node で検査)。提供元は `PROVIDERS` の 1 項目(いまは Cloudflare の `/browser-rendering/snapshot`)。足すのは項目を 1 つ。
- `supabase/functions/web-browse/index.ts` — `?tier=render` の分岐 `renderTier`。**新しい関数は足していない**(名簿・JWT 門・config をそのまま使う)。順序: 停止スイッチ `WEB_RENDER_DISABLED` → 未設定なら bucket を使う前に `render_unconfigured` → 専用の呼び出し元 bucket → 専用のプロジェクト全体 bucket(閉じ側失敗)→ 本体。軽量層の bucket と費用を食い合わない。
- `js/web-browse.js` に `render`、`js/atlas-cap-web.js` に `web.render`(risk=read・ingests=external・確認 none)。`web.browse` の `needsBrowser` は `web.render` へ誘導する。
- `js/atlas-view-capture.js` に `addWebImage`: スクリーンショットは地図のフレームと同じ視覚経路に載り、`promptBlock` で「ウェブページの画像・地図ではない・第三者のデータ」と名指しされる。

## 2. 切り替えの規則(Atlas が決める・コードは縛らない)
軽量層で足りるうちは軽量層(速く、費用が無い)。`needsBrowser`・レイアウトに意味があるページ・「どう見えるか」を訊かれたときだけ `web.render`。記述にそう書き、同一ターンの二重描画を避けるよう促す。答えは軽量層と同じ page 形(描画後の DOM を同じパーサで読む)で、状態も同じなので `render` → `web.browse click` / `web.fetchFile` が続く。

## 3. 安全(構造で守る)
- **読み取り専用**: 提供元へ送るのは URL と見方(viewport・待ち方・JPEG 品質)だけ。クリック・入力・フォーム送信・cookie・独自ヘッダ・こちらのスクリプトを運ぶ欄が**リクエストの組み立てに存在しない**(入力に混ぜても落ちることを検査)。送信・購入は構造上発行できない。
- **資格情報**: 送らない・埋めない。描画後の DOM にパスワード欄・CAPTCHA・ボット確認があれば `handoff`。
- **SSRF**: アドレスはこちらで判定(http(s)・既定ポート・資格情報なし・公開ホスト・公開アドレスにのみ解決)。取得は提供元の網で、IntMap 内部のホストへは届かない。**残る穴(明記)**: 提供元が辿る転送先はこちらから見えない。cookie を持たせず読み取り専用なので、被害は第三者の公開ページを読むことに限られる。
- **費用**: 1 回ごとに課金される。既定は小さく(容量 10・毎分 6・読者ごと毎分 4)、値は推定で実測は無い。最初の請求書か最初の `capped` で見直す。
- **ページの中身はデータ**: 注意書き・`ingests:external`・不可視要素の除去は軽量層と同じ。

## 4. 直していないもの・限界(隠さない)
- **提供元の API は実機で一度も叩いていない**(契約が無いため)。`snapshot` の応答(`{success,result:{content,screenshot}}`)とパラメタは公開仕様の記憶に基づき、応答は防御的に読む。契約後の最初の作業は実機での通し(`scripts/web-browse-probe.mjs` の render 版)で、ここが外れていれば `PROVIDERS.cloudflare` の 1 項目だけを直す。
- **視覚的な操作(座標クリック・入力)は持たない**: ステートレスな描画 API は状態を持てない。要るなら**セッション型エンジン+人の確認の方針**を先に決める必要があり、これは別の判断(契約・料金・「外へ出る操作」の線)。
- 有効化の手順(利用者の作業): Cloudflare の Workers 有料プランで Browser Rendering を有効にし、`supabase secrets set CF_BROWSER_ACCOUNT_ID=… CF_BROWSER_API_TOKEN=… --project-ref vpekfwdpurzejrrmacac`。deploy は不要(次の呼び出しから有効)。

## 5. 検査
`tests/real-browser-checks.test.mjs`: ① 未設定は何も出ない ② リクエストの形(敵対的な入力が提供元へ届かない) ③ SSRF ④ 答えの形・refs が軽量層と合成する・画像の上限 ⑤ 引き渡し ⑥ 提供元の失敗の名づけ ⑦ 関数の順序・専用 bucket・閉じ側失敗 ⑧ 能力行の facets・視覚経路での名指し。

## 6. グローバル経由の新しい読み
`js/atlas-cap-web.js` の `web.render` の引き渡し表示が `window.IntMapSafe.url`(`web.browse` と同じ読み方・リンクの安全化)を 1 件読む(global-surface 170→171)。`IntMapSafe` はモジュールとして export されておらず、いまは window 経由が唯一の経路。
