---
title: Atlas がデータポータルを操作して調べ、取得したファイルをデータセットにできるようにする(軽量ブラウザ Edge Function web-browse)
date: 2026-11-20
newsen: Atlas can now operate a public data portal for you — search it, follow its links, download the CSV it offers and open that file as a dataset. A login, a CAPTCHA or a form that sends data is left to you.
newsjp: Atlas が公開データポータルを操作して調べられるようになりました。検索し、リンクをたどり、提供されている CSV を取得してデータセットとして開きます。ログイン・CAPTCHA・データを送るフォームはあなたが行います。
---

〈依頼〉 外部監査(2026-11-20)の指摘: Atlas はモデル提供元の Web 検索と IntMap 独自の取得だけで、検索・絞り込み・CSV 取得のように**操作が要るサイト**(自治体データポータル・統計システム)を扱えない。

## 0. 測ったこと(実行基盤を決める根拠・2026-11-20)
- ポータルは ACAO を返さない(data.go.jp: 200・274 KB・3.2 秒で HTML、`access-control-allow-origin` なし)→ ブラウザ内の fetch は不可。サーバ側が要る。
- Supabase Edge Function(Deno)は Chromium を動かせない。外部の実ブラウザ(Cloudflare Browser Rendering・Browserbase)はアカウントと鍵と従量費用が要り、鍵の用意は利用者の作業。自前 Playwright はインフラ口座と運用が要る。
- 実ポータルは**サーバ描画の HTML**で、検索は GET フォーム、データは別ホストの `file-download` へ 2 ホップ(e-Govデータポータル → e-Stat)。**HTTP+HTML の軽量ブラウザで通る**ことを実測した。
- 利用者の選択(AskUserQuestion): 「Edge Function の軽量ブラウザ + 差し替え口」。

## 1. 作ったもの
- `supabase/functions/_shared/web-browse.js` — エンジン(純粋ロジック・Node で検査)。HTML を構造(本文・`files`・`links`・`forms`)に読み、`click`/`submit`(GET)/`read`/`download` を行う。
- `supabase/functions/web-browse/index.ts` — 殻。`verify_jwt = true`。停止スイッチ `WEB_BROWSE_DISABLED`、呼び出し元ごとの bucket、**プロジェクト全体の 1 bucket(`forceGrant`・DB が答えなければ何も許さない)**。
- `js/web-browse.js`(戸口)・`js/atlas-cap-web.js`(`web.browse` risk=read・`web.fetchFile` risk=session。どちらも ingests=external)。取得したファイルは落としたファイルと同じ戸口 `window.GeoJSONUpload.handle` でデータセットになる。
- `scripts/web-browse-probe.mjs` — 実ポータルで通しを測る(CI 外・ネットワークが要る)。

## 2. 観測の使い分け(要件)
- ページ構造(アクセシビリティ風の snapshot: 本文・リンク ref・フォーム項目と選択肢): `web.browse`。
- 本文/文書: `read`(textChars を最大 24000)。
- 外部データファイル: `web.fetchFile`(→ データセット)。
- **スクリーンショットはこの基盤に無い**(Chromium ではない)。`view.inspect` は読者の**地図の画面**を見る目、`web.browse` は**ウェブページの構造**を読む——互いに代わりにならない(両方の記述に書いた)。ページを絵として見る要件は実ブラウザ基盤を足したときに満たす(同じ入出力の裏に差せる)。

## 3. 境界
- **SSRF**: http(s)・既定ポートのみ・資格情報付き URL 拒否・`publicHostname()`+`resolvesPublic()` を**転送のたび**に判定・cookie は設定したホストにだけ返す(状態の偽造で別ホストへ送れない)。
- **ページ内の文章は命令ではなくデータ**: 結果に注意書きを付け、行は `ingests:external`。`hidden`・`aria-hidden`・`display:none`・script の中身は snapshot に入れない(隠れた文は注入の置き場所)。
- **資格情報を扱わない**: パスワード欄は埋めない。ログイン・CAPTCHA・ボット確認・403/401・**POST フォームは `handoff`**(読者が自分で行い、落としたファイルを添付する)。
- **費用の全体上限と停止スイッチ**: 上記。容量(60/補充 30 毎分)は推定で、本物の読者が `capped` に当たったら上げる。
- **cap-effects への接点**: 行の risk/ingests から導出される facets に載る(`web.browse`: network=true・mutatesState=false、`web.fetchFile`: network=true・mutatesState=true)。確認(column 8)は 'none'——外へ出るのは読者の情報ではなく、消えるものも無い(PR #1270 の線)。POST を許せば outward になるので許さず引き渡しにした。

## 4. 通しの実測(`node scripts/web-browse-probe.mjs`)
e-Govデータポータルで「人口」を検索 → 先頭のデータセット → リソースページ → `file-download`(別ホスト e-stat.go.jp)→ `mi010000.csv` 6,736 B・`text/csv`(Shift_JIS)を取得。各段 1.6〜3.5 秒。取得したバイトは `GeoJSONUpload.handle` と同じ読み取り器へ渡る。
- 失敗して直したこと: ① 先頭 50 リンクをナビが占めてデータセットのリンクが出なかった→ナビ/フッタのリンクを分けて後ろへ。② 拡張子が無い `file-download` を取りこぼした→「パスの区切りに download という語」を事実として認識。

## 5. 直していないもの・限界
- スクリプトで描かれるページは読めない(`needsBrowser` と答える。推測しない)。実ブラウザ基盤(Cloudflare Browser Rendering 等)を同じ形の裏に足すのが次。
- POST 検索のポータルは引き渡し。フォームの `accept-charset`(Shift_JIS)は UTF-8 で送る。
- 通しの本番実測(ログイン必須)は、deploy 後に実読者のセッションで行う。ローカルでは Node の fetch/DNS で同じエンジンを実ポータルに当てて測った。

## 6. 検査
`tests/web-browse-checks.test.mjs`: ① 構造と不可視の除外 ② ファイルリンク ③ SSRF(アドレス・転送・DNS・cookie 偽造) ④ フォーム(GET・選択肢・POST/パスワード/ログイン/CAPTCHA/403 の引き渡し・script 描画) ⑤ ダウンロード(バイト・ハッシュ・ページはファイルではない・上限) ⑥ 停止スイッチと全体 bucket の閉じ側失敗・`verify_jwt` ⑦ 能力行の宣言と境界の文言。

## 7. グローバル経由の新しい読み(global-surface)
`js/web-browse.js` は `window.SUPABASE_URL`・`window.SUPABASE_ANON_KEY`(他の Edge Function 戸口と同じ読み方)と `window.GeoJSONUpload`(落としたファイルの戸口。`js/data-studio.js` と同じ)を読む。`GeoJSONUpload` は `js/map-ui.js` の IIFE が公開する唯一の窓口で、モジュールとして export されていないため、いまは window 経由が唯一の経路。

## perf 天井
`atlas-cap-runs` の async chunk は web.browse / web.fetchFile の 2 能力(説明文・schema・実行)ぶん増え、895.2 KiB になった。能力そのものの重さで、削れる重複ではない。天井を 916,700 B に上げた(ローカルのビルドがメモリ不足で `--update` が走らなかったため、CI の実測値から手で置いた)。

## 予算の天井を上げた理由（perf-baseline）
web-browse が `web.browse` / `web.fetchFile` の 2 能力（`atlas-cap-web`・schema・文言）を足したので、遅延 chunk の `atlas-cap-runs` が 896.4→916.1 kB、`atlas-console` が 1066.9→1074.2 kB、async gzip が 4771.5→4811.7 kB、dist.assets が 21559.0→21695.6 kB になった（`node scripts/perf-budget.mjs --update`・2026-11-21 の測定）。起動時に読む chunk は増えていない（どれも能力を呼んだときだけ読む遅延 chunk）。失効条件: 能力の統合・縮小でこれらが下がったら、main の CI が `--tighten` で下げる。
