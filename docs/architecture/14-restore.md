# IntMap — 現状仕様書 §14 新しい環境で IntMap を復元する手順

> **現状仕様書の §14。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §14.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 14. 新しい環境で IntMap を復元する手順

1. **取得とインストール**
   ```bash
   git clone https://github.com/rwmqx7dwb5-arch/IntMap.git && cd IntMap
   npm ci && npx playwright install --with-deps chromium
   npm run data:pull     # git の外にあるデータ集合（data-assets.json）を Release から取得・検証して配置
   ```
2. **Supabase プロジェクト**を用意し、**接続先を2か所**差し替える：
   - `src/vendor.js` の `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`
   - `admin.html` の同じ2つ（このページはバンドラを通らない）
3. **DB を作る**——**SQL を手で流さない**。`supabase/migrations/` が唯一の設計図。
   ```bash
   supabase link --project-ref <PROJECT_REF>
   supabase db push                 # migrations を適用
   supabase db diff --schema public # drift がゼロであることを確認
   ```
   ローカル検証は `supabase start && supabase db reset`（migrations ＋ `supabase/seed.sql`）。
4. **Edge Functions を21本デプロイする**（`verify_jwt` は `supabase/config.toml` の宣言に従う）：
   ```bash
   for f in ai-proxy delete-account atlas-embed; do supabase functions deploy $f --project-ref <REF>; done
   for f in refresh-news monitor-run sv-cov alerts-relay cable-geo news-relay aviation-feed ais-feed news-ingest routing-relay volcano-feed gdelt-relay quotes-relay who-don client-errors fetch-relay reader-reports; do
     supabase functions deploy $f --no-verify-jwt --project-ref <REF>
   done
   ```
5. **Secrets を設定する**（§6.3）。最低限：
   ```bash
   supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... \
     REFRESH_SECRET=... MONITOR_SECRET=... NEWS_INGEST_SECRET=...
   ```
   ⚠ `REFRESH_SECRET` は**必須**（未設定だと `refresh-news` は全リクエストを拒否する）。
   `NEWS_INGEST_SECRET` も同じく必須（未設定だと `news-ingest` が全リクエストを拒否する）。
6. **cron**（pg_cron ＋ `net.http_post`。秘密は**ヘッダ**で送る）——job 定義は migration
   `20260925090000_cron_jobs_as_code.sql` が作る（URL は本番の project ref。別プロジェクトでは書き換える）。
   秘密は vault に `refresh_news_secret`・`monitor_run_secret`・`news_ingest_secret` として置く
   （`select vault.create_secret('<値>', '<名前>');`。無い job は何も POST しない）：
   - `refresh-news` を約20分ごと（`x-refresh-secret`）。初回は手動で1回叩いて `current_news` を埋める。
   - `monitor-run` を定期実行（`x-monitor-secret`）。SQL は `docs/AREA-MONITORS.md`。
   - `news-ingest` を約20分ごと（`x-news-ingest-secret`）。手順は
     [`docs/NEWS-EVENTS.md`](../NEWS-EVENTS.md) §12。
7. **静的ホスティング**——**配信するのは `dist/`**（リポジトリのソースツリーではない）。
   ```bash
   npm run build     # → dist/
   ```
   GitHub Pages で公開する場合は **Settings → Pages → Source = "GitHub Actions"** と
   **Variables `ENABLE_PAGES_DEPLOY = true`** を設定する（本リポジトリでは両方設定済み）。
   これで `main` への push ごとに `.github/workflows/ci.yml` が
   1 回だけビルド → そのビルドで全ゲート → 全部緑なら同じ `dist/` を公開 → 実 URL へのスモークを行う。
   詳細は `docs/RELEASE.md`。
8. **認証**：Supabase で Google / Apple / メールを設定（任意）。Redirect URL・漏えいパスワード保護・
   パスキーの RP 設定は `docs/SECURITY-ARCHITECTURE.md §9`。
9. **動作確認**
   ```bash
   npm test                                   # 静的検査＋hermetic ブラウザ試験
   npm run serve                              # http://127.0.0.1:4173/（Pages と同じ配信）
   PROD_URL=<公開URL> npx playwright test --config playwright.prod.config.js
   curl -s <公開URL>/build-info.json          # sha が git rev-parse origin/main と一致すること
   ```
   画面側は、(a) レイヤー行（`.lyr-row`）が100個以上、(b) コンソールエラー 0、
   (c) News タブでピンが即表示、(d) ログイン → AI 機能が動く、を確認する。
   (a) と (b) は `npm run test:smoke` が同じことを自動で確かめる。
