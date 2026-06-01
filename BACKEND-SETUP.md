# IntMap バックエンド設定 / Backend setup

今回の高速化・コミュニティ強化に伴い、Supabase 側で **一度だけ** 行う設定があります。
（未設定でもアプリは動作します。フロントは自動でフォールバックするので壊れません。設定すると「爆速ニュース」と「拡張コミュニティ」が有効になります。）

> 匿名キー(`sb_publishable_…`)では DDL を実行できないため、SQL は SQL Editor への貼り付けが必要です（既存の `supabase_setup.sql` と同じ運用）。

---

## 1. ニュースのサーバーサイド化（爆速ロード）

起動時にブラウザで毎回行っていた「150 記事 × 130 社の総当たり地点解析」を、20 分ごとに走る Edge Function に移しました。ブラウザは `current_news` を **1 回 SELECT するだけ（数 ms）** になります。

### 手順

1. **テーブル作成** — Supabase ダッシュボード → SQL Editor で [`supabase_news_setup.sql`](supabase_news_setup.sql) の上部（テーブル＋RLS＋拡張）を実行。
2. **Edge Function をデプロイ**（ローカルに Supabase CLI が必要）:
   ```bash
   supabase functions deploy refresh-news --no-verify-jwt
   ```
3. **シークレット設定**（任意だが推奨）:
   ```bash
   supabase secrets set REFRESH_SECRET=<好きなランダム文字列>
   # 辞書で当たらない記事を LLM で地点解析したい場合（任意）:
   supabase secrets set OPENAI_API_KEY=sk-...
   # 既定モデルは gpt-4o-mini。変えるなら:  supabase secrets set OPENAI_MODEL=gpt-4o
   ```
   `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は自動注入されるので設定不要です。
4. **定期実行(cron)の登録 + 初回シード** — `supabase_news_setup.sql` 末尾の CRON ブロックの `<REFRESH_SECRET>` を実際の値に置き換えて SQL Editor で実行。続けて同ファイル内のコメントにある「Seed it now」の `net.http_post` を一度実行すると即座にデータが入ります。
5. **確認**:
   ```sql
   select lang, count(*), max(fetched_at) from public.current_news group by lang;
   ```
   行が入っていれば、リロード後にニュースが `current_news` から一発ロードされます（コンソールの `current_news unavailable` 警告が消えます）。
6. **(任意) ライブ更新** — 新バッチ到着時にクライアントへ自動反映:
   ```sql
   alter publication supabase_realtime add table public.current_news;
   ```

### 仕組み
- フロント `loadNewsFromSupabase()` がまず `current_news` を引く → あれば即描画して終了（クライアント解析ゼロ）。
- 無い／検索中／タイムトラベル中／多言語モード時は、従来の RSS ライブ取得＋クライアント解析に自動フォールバック。
- 辞書は Edge Function が `geo_pins` テーブルから読むので、地点辞書はフロントと **同一ソース**。

---

## 2. コミュニティ機能の強化

カテゴリ・スレッド返信・コメント投票・編集などのために列／テーブルを追加します。
**完全に追加のみ・冪等** なので既存データには影響しません。未実行でも新 UI は自動的に隠れるだけで壊れません（id が uuid / bigint いずれでも自動対応）。

### 手順
- SQL Editor で [`supabase_community_v2.sql`](supabase_community_v2.sql) を実行するだけ。

### これで有効になる機能
| 機能 | 必要な変更 |
| --- | --- |
| 投稿カテゴリ（チップ／絞り込み／ピン色） | `community_posts.category` |
| 投稿・コメントの編集（「編集済み」表示） | `*.edited_at` ＋ UPDATE ポリシー |
| スレッド返信 | `community_comments.parent_id` |
| コメントへの投票 | `community_comment_votes` テーブル |

クライアント側はこれら無しでも従来動作（投稿・コメント・投票・通報・並び替え）を維持します。

### サーバー設定不要で既に使える強化（クライアントのみ）
- 並び替えに **Hot（話題）** を追加（New / Top に加えて）
- 投稿の **テキスト検索**
- **「表示範囲」** フィルタ（地図に映っている投稿だけ表示・パンで追従）
- アバター（イニシャル）・相対時刻表示・URL 自動リンク・コメント折りたたみ

---

## 3. タイル高速化（追加設定不要）

衛星画像の高速化はフロントのみで完結（画質は不変）:
- `MAX_PARALLEL_IMAGE_REQUESTS=48` で HTTP/2・HTTP/3 多重化をフル活用
- **Service Worker (`sw.js`)** がタイルをディスクに永続キャッシュ → 再訪時はネットワークゼロ
- パン方向を予測して画面外タイルを **先読み（プリフェッチ）**

> `sw.js` は `index.html` と同じ階層に置いて配信してください（このリポジトリのルート）。Service Worker は **HTTPS か localhost** でのみ動作します（`file://` では無効、その場合も並列化・先読みは有効）。
