# IntMap — 現状仕様書 §16 データ保護基盤 (migrations・RLS/権限テスト・バックアップ・復元)

> **現状仕様書の §16。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §16.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 16. データ保護基盤 (migrations・RLS/権限テスト・バックアップ・復元)

DB 構造を**コード化**し、RLS／権限を**自動テスト**し、バックアップ／隔離復元を用意し、本番 DB 変更を
安全化した設備。**手順の正本は [`docs/DATABASE.md`](../DATABASE.md)（表と RLS ＋ pgTAP 手順）・
[`docs/MIGRATIONS.md`](../MIGRATIONS.md)（本番適用）・
[`docs/BACKUP-RESTORE.md`](../BACKUP-RESTORE.md)（バックアップと隔離復元）。**

### 16.1 Supabase CLI 構成

- `supabase/config.toml` — ローカル／CI 用（**本番非接続**）。
  ⚠ **`db.major_version` は本番と一致していない**（宣言 15 / 本番 17.6）。ローカル再現の忠実度に関わるので、
  上げるときは `supabase db reset` の通過を確認してから行う。
- `supabase/migrations/*.sql` — **唯一の設計図**（48本）。冪等・非破壊
  （`if not exists` / `create or replace` / `drop policy if exists`）。
- `supabase/seed.sql` — **100% 合成**（`.test` ドメイン・プレースホルダ UUID）。
- `supabase/tests/*_test.sql` — pgTAP（構造 ＋ RLS/権限マトリクス ＋ 関数 ＋ Monitors ＋ 権限昇格 ＋ News Events ＋ 公開プロフィール表 ＋ 中継の共有レート制限 ＋ 監査の是正＝答えた turn は返金されない・全表の TRUNCATE 不可・search_path・報告の帰属・著者が編集できる列 ＋ エラー記録＝匿名は読めも書けもしない・admin は読むだけ・同じ fingerprint は回数を足す・30 日の保持 ＋ 能力ベクトル ＋ SECURITY DEFINER 関数を `anon` が呼べるのは `anon` に効く RLS が呼ぶものだけ ＋ 出自の固定＝SECURITY DEFINER の search_path に呼び手が CREATE できる schema が無い・公開バケットに一覧用の SELECT ポリシーが無い・コミュニティ投稿の著者名と投稿時刻は DB が書く・INSERT は列単位 grant ＋ 匿名の直接書き込みの全数＝`public` のどの表も `anon` の INSERT を受けない・報告の 2 表は service_role だけが書く ＋ AI の日次カウンタの符号＝`count` 列を持つ全表に下限の CHECK・所有者ロール（Studio）でも負の値を書けない・1 つのターンの返金は課金した 1 回ぶんだけ、課金した日へ ＋ アカウントのデータ＝所有される全表に説明の 1 行がある・目録と書き出しは呼び手のものだけ・書き出せる範囲は削除する範囲と表ごとに一致・マイプレイスの入口は `save_place()` だけで同じ位置は 1 件 ＋ 保存した地図と公開コレクション＝入口は `save_view()` と `publish_collection()` だけ・同じ地図は 1 件・1 コレクション 1 リンク・`anon` は `shared_collection(token)` でそのコレクションだけを id もアカウントも無しに読む・写しは 2 度でも 1 度と同じ・公開をやめるとリンクは死ぬ）。

### 16.2 RLS の3大保証（テストで実証）

1. **PII 非公開**: `profiles` の email / is_admin / plan は本人＋admin のみ。公開表示は `profiles_public`
   （id / display_name / bio / avatar_url の4列）。⚠ これは **view ではなく実テーブル**で、
   `profiles_public_sync` トリガが同期する——view は `security_invoker` を持たない限り所有者の権限で
   `profiles` を読んで RLS を迂回し、**後から足した列がその迂回を継承する**（Supabase advisor の
   `0010_security_definer_view`。詳細は `docs/SECURITY-ARCHITECTURE.md` §8 の 7）。
   feedback / bug_reports / donations / org_inquiries /
   community_reports / ai_usage は他人・anon から読めない。
   **組織からの相談 `org_inquiries`**（氏名・返信先・本文）は admin だけが読み、admin も**本人が書いた本文と
   アドレスは書き換えられない**（更新できる列は `status`・`admin_note`・`handled_at` だけ）。書くのは
   `reader-reports` だけで、受信から 730 日（spam は 30 日）で `purge_org_inquiries` が消す。
   **`supporters`** は本人が掲載を申し込んだ行だけで、anon が読めるのは掲載中の行の表示名・月・ひとことの 3 列
   （同意の時刻は読めない）。金額・決済情報・メールアドレスの列は無い（`supabase/tests/18_org_inquiries_test.sql`）。
   **地図の誤り報告 `map_corrections`** は表そのものを admin だけが読み、**メールアドレスの列は無い**。報告者が回答を
   読む鍵は端末だけが持つ受付番号で、表には `sha256` しか無い（`map_correction_status` は受付番号を持つ者に自分の行だけを
   返す）。公開記録 `public_map_corrections` は運営者が公開した行の運営者の文だけを返し、報告者・本文・受付番号を返さない。
   admin も読者の本文は書き換えられない（`supabase/tests/28_map_corrections_test.sql`）。
2. **昇格不可**: 本人は display_name / bio / avatar_url / login_count のみ更新可（列単位 grant）。
   ⚠ grant は本番の既定権限で無効化されうるので、**grant 非依存の BEFORE UPDATE トリガ**
   （`tg_profiles_guard_privcols`）が実防御になっている。
3. **quota 改ざん不可**: `ai_usage` の書込は SECURITY DEFINER RPC 経由のみ、RPC の execute は
   service_role のみ。⚠ **grant が縛るのはブラウザのロールだけで、表の所有者（Studio の表エディタ・
   SQL エディタ）は縛らない**——本番で所有者が `count` に負の値を書き、その日の上限が外れていた。
   よって **`count >= 0` は列の CHECK**（`ai_usage`・`ai_gloss_usage`）で、どのロールにも効く。
4. **コミュニティの出自は DB が述べる**: `community_posts` / `community_comments` の INSERT は
   クライアントが送る列だけの列単位 grant（`created_at` / `edited_at` / `id` は拒否）で、
   BEFORE INSERT トリガ `tg_community_stamp_provenance` が `author_name` を著者の `profiles_public` から、
   `created_at` を `now()` から書く（リクエストの値は読まない。grant 非依存）。
   公開バケット（aviation / gdelt / ais）は URL で読まれるので SELECT ポリシーを持たない
   （持つと一覧 API だけが開く）。

5. **自分のデータは自分で開ける（account-data-center）**: アカウントが保持するものの目録
   （`account_data_inventory()`）と完全な書き出し（`export_account_data()`）を、利用者が問い合わせなしで使える。
   どちらも引数を取らず `auth.uid()` で口座を決め、`_owned_by_user_cols()`——アカウント削除と**同じ発見**——を
   歩くので、**書き出しは削除より小さくなれない**。表ごとの「何か・なぜ・いつまで・誰が書いたか」は
   `account_data_catalog`（説明であって絞り込みではない）。画面は「アカウント ▸ あなたのデータ」、Atlas は
   `account.data` / `account.export`。

6. **公開は持ち主の明示的な行為で、読めるのはそのコレクションだけ（collection-workspace）**: コレクション（場所と
   保存した地図）を閲覧専用リンクで公開できるのは持ち主が「閲覧専用リンクを作成」を押したとき（または Atlas に
   頼み、外の内容を見たターンなら読者が確認したとき）だけ。リンクのトークンが鍵で、`anon` が読めるのは
   `shared_collection(token)` が返す**そのコレクションの名前・メモ・位置と地図**だけ（アカウント・メール・行 id は
   返さない。表そのものは `anon` から読めないので、公開中のリンクを列挙することもできない）。公開をやめるのは
   所有者の DELETE で、その瞬間からリンクは何も返さない。アカウントを削除すれば公開したリンクも全部消える。

### 16.3 CI・バックアップ

- `.github/workflows/db.yml` — PR では**常に発火して常に結果を返す**（GitHub Ruleset の必須チェックにするため。
  path フィルタのままだと DB を触らない PR が永久に待つ）。job の先頭で base との差分から DB 関連パス
  （一覧は scope step の 1 か所だけ）に変更があるかを判定し、無ければ重い step を飛ばして緑で終える。
  変更があればローカル Supabase で `db reset` → **drift gate**（`db diff` が空であること。⚠ `db diff` 自身が
  失敗したら失敗——「測れなかった」と「0 を測った」は別の答え）→ pgTAP → **backup/restore ラウンドトリップ**
  （合成データ）。**本番非接続・秘密不要・fail-closed。**
- `.github/workflows/db-backup.yml` — 毎日 `pg_dump` → GPG → 7 日保持の artifact。`SUPABASE_DB_URL` ＋
  `BACKUP_GPG_PASSPHRASE` のどちらかが無ければ **run は赤**で、`status:backup-failing` の Issue が
  「どの secret が無いか」を述べる（揃えば次の緑で閉じる）。⚠ **secret が無いのに緑で skip する形を、
  全ワークフローについて禁じている**——`tests/backup-and-deploy-as-code-checks.test.mjs` が
  `.github/workflows/` を発見し、secret を読む job の関門を **secret 空で実行して**非ゼロ終了を確かめ、
  `if:` で secret / 変数を読む skip は理由を宣言したもの（Pages の停止スイッチ `ENABLE_PAGES_DEPLOY`）だけを通す。
  方針 ＝ **Managed backups 優先**＋その pg_dump を予備とする。
- `.github/workflows/supabase-deploy.yml` — Edge Functions と migration の配備、および nightly のドリフト検査（§15.4）。
- **pg_cron の job 定義**は migration `20260925090000_cron_jobs_as_code.sql` にある（4 本・名前で
  `cron.schedule` するので冪等）。秘密は vault（`refresh_news_secret`・`monitor_run_secret`・`news_ingest_secret`）
  から読み、**secret が vault に無い DB では何も POST しない**（URL は本番のもの）。pg_cron の無い
  ローカル／CI の再構築では何もしない。

### 16.4 実行

```bash
supabase start && supabase db reset          # migrations + seed（要Docker）
psql "$LOCAL_DB_URL" -c 'create extension if not exists pgtap with schema extensions;'
supabase test db                             # RLS/権限 pgTAP
supabase db diff --schema public             # driftゼロ確認
```

⚠ **本番はマイグレーションファイルと乖離しうる。** ベースライン（最初の1本）ほか数本が本番へ「適用済み」として
記録されておらず、逆に本番にしか無い履歴もある。だから CI の `db push` は `--dry-run` の結果が
「その push が足したものと一致する」ときだけ走り、履歴が揃うまでは赤で止まる。手での適用は
`supabase db query --file … --linked` ＋ `supabase migration repair --status applied <version>`
（正本は `docs/MIGRATIONS.md`）。監査は `supabase db query --linked` で `pg_policies` /
`role_table_grants` / `pg_proc` を**本番から読んで**行う。
