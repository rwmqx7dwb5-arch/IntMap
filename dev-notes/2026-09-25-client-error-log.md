---
title: エラー監視は一度も動いていなかった——Sentry をやめ、外部アカウント不要の自前記録（client_errors）に置き換えた
date: 2026-09-25
---

〈利用者の決定:「Sentry をやめ、外部アカウント不要の自前記録に置き換える」〉

### 0. 実測（元の欠陥）

| 何 | 実測 |
|---|---|
| `index.html` の Sentry ローダー（#R133） | DSN は `window.INTMAP_SENTRY_DSN` / `<meta name="intmap-sentry-dsn">` から読む。**どちらもリポジトリのどこにも設定されたことが無い**ので、全訪問で `if(!dsn) return;` |
| 本番の監視 | 6 時間ごとの uptime（ページが**配信されているか**）と手動検証だけ。「**動いているか**」を訊くものは無かった |
| 利用者のブラウザの例外 | `window.__imErrors`（25 件のリングバッファ）にしか残らず、Bug Report を送った人の分しか外へ出ない |

### 1. 置き換えたもの

```
window 'error' / 'unhandledrejection'
  → js/client-error-report.js          洗う・fingerprint・同じ欠陥は 1 ページ読み込みで 1 回・最大 10 件・本番オリジンからだけ・sendBeacon
  → supabase/functions/client-errors   POST・Origin 許可表・64 KiB・1 本 10 件・もう一度洗う・fingerprint はサーバーが計算・token bucket 2 つ
  → public.record_client_error         新しい欠陥は insert、既知は count+1（行数上限 10,000）
  → public.client_errors               admin だけ読める・30 日（最後の発生から）で pg_cron が消す
  → admin.html → Errors                読み取り専用
```

- **洗い方の正本は 1 つ**: `supabase/functions/_shared/client-error-shape.js`。**ブラウザもこのファイルを直接 import する**
  （aviation / newsgeo / persona のような写し＋sync スクリプトを作らない。依存の無い素の ESM なので Vite がそのまま束ねる）。
  サーバーはクライアントの洗浄を信用せず、同じ関数でもう一度洗う。
- **個人を持たない設計**: 表に IP・利用者・セッション・クエリ・生の UA の列が**無い**（pgTAP `10_client_errors_test.sql` が
  `information_schema` で測る）。呼び手ごとの rate-limit bucket も**アドレスではなく service key による HMAC** を鍵にする
  ——`relay_rate_buckets.key` は平文で、sweep は cron に載っていない（下の 4）。
- 消したもの: Sentry ローダー一式・CSP の `https://browser.sentry-cdn.com`（script-src の CDN は 8 → 7）・MONITORING.md の Sentry 設定手順。
  BENIGN の分類表は `shapeReport()` へ移した（同じ列＋「Script error.」「拡張機能のフレーム」）。
- プライバシーポリシー §1（記録するもの・しないもの）と §6（30 日）を en / jp で足した（`LEGAL_DATE` 2026-09-25）。

### 2. 検査

- `tests/client-error-log-checks.test.mjs` — **元の欠陥の形で書いた**:「本番のページで投げられた例外が client-errors に届く」
  を、reporter を偽の window で**評価**して listener に ErrorEvent を渡し、送られた本文を読んで確かめる。127.0.0.1 / localhost /
  pages.dev からは 1 本も送られない。Edge Function は Deno と fetch を差し替えて `handle()` を呼ぶ——拒否の形、bucket が書き込みより
  **前**、fingerprint は本文のものを無視してサーバーが計算、**呼び手の IP がどの RPC 本文にも無い**、limiter 不在は 503 で書かない。
- `supabase/tests/10_client_errors_test.sql` — RLS・anon/非 admin は読めず書けない・admin は読むだけ・同じ fingerprint は count を足す・
  満杯でも既知は数える・31 日前の行だけ消える。`00_structure_test.sql` の 2 つの一覧に `client_errors`（plan 92 → 94）。
- ⚠ **`tests/r399` と `tests/r403` は Edge Function の本数を錨に手書きしていた**（「全17本」「**seventeen**」「は 17 本」）。
  18 本目を足した瞬間に錨が外れ、規則を 1 つも試す前に落ちる——#R694 がこの 2 ファイルで `_shared` 名簿について直した形と同じ。
  錨の数を `supabase/functions/` から**発見する**ようにした。`tests/r280` の錨（`db-tables`・`csp`）は内容ごと動かした。

### 2b. 起動費用（`check:perf`）

`eager.modules` 298 → **300**（reporter と共有の shape の 2 本。完全一致の項目なので必ず赤になる）。バイトは**自分の分だけ**天井を上げた:
2 本を esbuild で minify して実測 raw **5,550 B**・gzip **2,849 B**・brotli **2,508 B** を `tests/perf-baseline.json` の eager 3 項目に足した。
`--update` は使っていない（全項目を書き戻し、他の回が残したずれ——この木で eager.brotli は自分の分を除いても約 +3.9 kB、
未記録の async chunk `atlas-geo-resolve`——まで黙って追認するので）。

### 3. 本番でやること（この回はしていない）

```bash
supabase db push                     # 20260925110000_client_errors.sql（pg_cron があれば client-errors-purge を冪等に登録）
supabase functions deploy client-errors --project-ref vpekfwdpurzejrrmacac --use-api --no-verify-jwt
```

### 4. 残したもの（直していない）

- **利用者ごとの無効化の設定は無い。** IntMap に計測の同意設定が存在しない（`INTMAP_ANALYTICS` はサイト全体の第三者アナリティクスの
  スイッチ）。送るものは利用者を識別しないので、そのスイッチの後ろには置かず、何を送るかをポリシーに書いた。
- `public.sweep_relay_rate_buckets` は定義されているが **cron に載っていない**（#R801 から）。routing-relay の bucket はアドレスを平文の
  鍵に持ったまま残る。この回の bucket は HMAC なので影響しないが、別の回で扱う。
- index.html の起動前（inline script）の例外はリングバッファにだけ残る——reporter は `src/main.js` から読み込まれるので、それより前は拾えない。
