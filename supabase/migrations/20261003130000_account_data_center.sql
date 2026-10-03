-- ============================================================================
--  account-data-center — WHAT INTMAP HOLDS ABOUT YOU, IN YOUR HANDS
-- ----------------------------------------------------------------------------
--  THE PRODUCT. A signed-in reader can ask the database itself, at any time and without writing to
--  anyone: «what do you hold about me, why, for how long — and give me all of it». Until this
--  migration the only self-service door was the last one (delete-account); access was «contact us»
--  (privacy policy §7), and nobody — not the reader, not the operator — could have listed the
--  account's rows without hand-writing a query per table.
--
--  THE STRUCTURE THAT MAKES IT TRUE. Three questions are now answered by ONE discovery:
--      what deletion removes      public.delete_account_data()   (20260820120000_delete_account_txn.sql)
--      what the inventory counts  public.account_data_inventory()                 (this file)
--      what the export contains   public.export_account_data()                    (this file)
--  All three walk public._owned_by_user_cols() — every column in `public` that references auth.users,
--  plus any uuid `user_id` whose FK has drifted away. So a table added next year is exported, counted
--  and deleted the moment its foreign key exists, and «what you can download» can never be smaller
--  than «what we delete» (supabase/tests/23_account_data_center_test.sql compares the two, row for
--  row, for the same account in the same transaction).
--
--  ⚠ A DISCOVERED SET STILL OWES THE READER A SENTENCE. A table name is not an explanation, so every
--  owned table carries a row in public.account_data_catalog: what it is, why IntMap keeps it, how
--  long, and whether the reader wrote it or IntMap recorded it — in en and jp (CONSTITUTION.md §7).
--  The catalogue is NOT a filter: an owned table with no row is still counted and still exported
--  (`described = false`), and the pgTAP test fails until the sentence is written. Joining the set is
--  automatic; being explained costs a row, in the same migration as the table.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE CATALOGUE — one sentence per owned table, public by declaration
--     (the privacy inventory a signed-out reader may read too: it holds no one's data).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.account_data_catalog (
  tbl          text primary key check (tbl ~ '^[a-z_][a-z0-9_]{0,62}$'),
  written_by   text not null check (written_by in ('you', 'intmap')),
  label_en     text not null check (char_length(label_en)     between 1 and 80),
  label_jp     text not null check (char_length(label_jp)     between 1 and 80),
  purpose_en   text not null check (char_length(purpose_en)   between 1 and 400),
  purpose_jp   text not null check (char_length(purpose_jp)   between 1 and 400),
  retention_en text not null check (char_length(retention_en) between 1 and 300),
  retention_jp text not null check (char_length(retention_jp) between 1 and 300)
);
comment on table public.account_data_catalog is
  '(account-data-center) One row per table in public that holds rows owned by an account (public._owned_by_user_cols): what it is, why it is kept, how long, and who wrote it (you = the reader typed or chose it; intmap = recorded about the reader''s use). Readable by everyone; written only by migrations. supabase/tests/23_account_data_center_test.sql fails while an owned table has no row here.';

alter table public.account_data_catalog enable row level security;
revoke all on table public.account_data_catalog from public, anon, authenticated, service_role;
grant select on table public.account_data_catalog to anon, authenticated, service_role;

drop policy if exists account_data_catalog_read on public.account_data_catalog;
create policy account_data_catalog_read on public.account_data_catalog
  for select to anon, authenticated
  using (true);

insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('profiles', 'you',
   'Your profile', 'プロフィール',
   'Your email address, display name, icon, and the account flags IntMap needs to run the account (administrator, plan, sign-in count).',
   'メールアドレス・表示名・アイコンと、アカウントの運用に必要な属性（管理者・プラン・ログイン回数）。',
   'Kept until you delete your account. The public card on the community board is a copy of the name and icon and goes with it.',
   'アカウントを削除するまで保持します。コミュニティに出る公開カードは名前とアイコンの写しで、一緒に消えます。'),
  ('user_prefs', 'you',
   'Synced settings', '同期された設定',
   'The settings, widgets and preferences you chose, kept so they follow you to every device you sign in on.',
   'あなたが選んだ設定・ウィジェット・好みを、ログインしたどの端末でも同じになるよう保存したもの。',
   'Kept until you change them or delete your account.',
   '変更するか、アカウントを削除するまで保持します。'),
  ('favorites', 'you',
   'Saved articles', '保存した記事',
   'The links and titles of news articles you starred.',
   '★を付けたニュース記事のリンクと見出し。',
   'Kept until you remove the star or delete your account.',
   '★を外すか、アカウントを削除するまで保持します。'),
  ('saved_news_events', 'you',
   'Saved news events', '保存した出来事',
   'The news events you starred, by event id.',
   '★を付けたニュースの出来事（出来事の ID）。',
   'Kept until you remove the star or delete your account; a starred event itself is kept for as long as you keep the star.',
   '★を外すか、アカウントを削除するまで保持します。★の付いた出来事そのものも、★がある限り保持されます。'),
  ('community_posts', 'you',
   'Community posts', 'コミュニティ投稿',
   'The posts you published on the community board: title, text, optional picture, place and category.',
   'コミュニティに公開した投稿（タイトル・本文・任意の画像・場所・カテゴリ）。',
   'Public until you delete the post or your account.',
   '投稿かアカウントを削除するまで公開されます。'),
  ('community_comments', 'you',
   'Community comments', 'コミュニティのコメント',
   'The comments and replies you wrote on community posts.',
   'コミュニティの投稿に書いたコメントと返信。',
   'Public until you delete the comment or your account.',
   'コメントかアカウントを削除するまで公開されます。'),
  ('community_votes', 'you',
   'Upvotes on posts', '投稿への投票',
   'Which community posts you upvoted. Others see only the total.',
   'どの投稿に投票したか。他の人には合計数だけが見えます。',
   'Kept until you withdraw the vote or delete your account.',
   '投票を取り消すか、アカウントを削除するまで保持します。'),
  ('community_comment_votes', 'you',
   'Upvotes on comments', 'コメントへの投票',
   'Which comments you upvoted. Others see only the total.',
   'どのコメントに投票したか。他の人には合計数だけが見えます。',
   'Kept until you withdraw the vote or delete your account.',
   '投票を取り消すか、アカウントを削除するまで保持します。'),
  ('community_reports', 'you',
   'Reports you filed', '通報',
   'Community posts you reported to the moderators, and the reason you gave. Only moderators can read them.',
   'モデレーターに通報した投稿と、その理由。読めるのはモデレーターだけです。',
   'Kept until you delete your account.',
   'アカウントを削除するまで保持します。'),
  ('feedback', 'you',
   'Feedback you sent', '送ったフィードバック',
   'The ratings and comments you sent through the feedback form, with the email address of the account that sent them.',
   'フィードバック欄から送った評価とコメント、および送信したアカウントのメールアドレス。',
   'Kept until you delete your account.',
   'アカウントを削除するまで保持します。'),
  ('bug_reports', 'you',
   'Bug reports you sent', '送った不具合報告',
   'The bug reports you sent, with the diagnostic details your browser attached and the email address of the account.',
   '送った不具合報告と、ブラウザが添えた診断情報、およびアカウントのメールアドレス。',
   'Kept until you delete your account.',
   'アカウントを削除するまで保持します。'),
  ('donations', 'you',
   'Donation notes', '寄付の記録',
   'The donation intent you recorded (amount and email). Payment itself is handled by Stripe and is not stored here.',
   '記録した寄付の意思（金額とメールアドレス）。支払いそのものは Stripe が扱い、ここには保存されません。',
   'Kept until you delete your account.',
   'アカウントを削除するまで保持します。'),
  ('ai_usage', 'intmap',
   'AI usage per day', '日ごとのAI利用',
   'How many AI questions the account used each day (UTC), and what those answers cost in tokens — the free daily limit is counted here.',
   'アカウントが日ごと（UTC）に使ったAIの質問数と、その回答にかかったトークン量。1日の無料枠はここで数えます。',
   'One row per day; kept until you delete your account.',
   '1日1行。アカウントを削除するまで保持します。'),
  ('ai_gloss_usage', 'intmap',
   'Term look-ups per day', '日ごとの用語解説',
   'How many terms you looked up inside Atlas answers each day — counted apart from your questions so a look-up never spends one.',
   'Atlas の回答の中で用語を引いた回数（日ごと）。質問とは別に数えるので、用語解説で質問の枠は減りません。',
   'One row per day; kept until you delete your account.',
   '1日1行。アカウントを削除するまで保持します。'),
  ('ai_turns', 'intmap',
   'AI question bookkeeping', 'AIの質問の記帳',
   'One short-lived row per AI question, so that the several calls one question makes are charged once and an answered question is never refunded.',
   'AIの質問1つにつき1行の短命な記録。1つの質問が行う複数の呼び出しを1回分として数え、回答済みの質問が払い戻されないようにします。',
   'Replaced when the question''s key expires; a row older than a day may be swept at any time.',
   '質問の鍵が失効すると置き換わり、1日より古い行はいつでも掃除されます。'),
  ('ai_turn_answers', 'intmap',
   'Atlas answers held for re-delivery', '再送のために預かった回答',
   'The text of an Atlas answer, held so that an answer cut off by a dropped connection is delivered again instead of being generated again.',
   '接続が切れて届かなかった回答を、作り直さずにもう一度届けるために預かる Atlas の回答本文。',
   'At most about 30 minutes: the turn''s 15-minute lifetime plus the 15-minute cleanup cycle.',
   '最長でおよそ30分（質問の有効期間15分＋15分ごとの掃除）。'),
  ('area_monitors', 'you',
   'Area monitors', 'エリア監視',
   'Areas you asked IntMap to watch while the area-monitor feature was offered (it has since been withdrawn and no longer runs).',
   'エリア監視機能が提供されていた間に、見張るよう設定した範囲（機能は撤去済みで、もう実行されません）。',
   'Kept until you delete your account.',
   'アカウントを削除するまで保持します。'),
  ('monitor_runs', 'intmap',
   'Area-monitor runs', 'エリア監視の実行記録',
   'Each time one of your area monitors ran: when, and what it found.',
   'エリア監視が実行されるたびの記録（いつ、何が見つかったか）。',
   'Kept until you delete the monitor or your account.',
   '監視かアカウントを削除するまで保持します。'),
  ('monitor_evidence', 'intmap',
   'Area-monitor evidence', 'エリア監視の根拠',
   'The items (articles, events, readings) a monitor run gathered as evidence.',
   '監視の実行が根拠として集めた項目（記事・出来事・観測値）。',
   'Kept until you delete the monitor or your account.',
   '監視かアカウントを削除するまで保持します。'),
  ('monitor_reports', 'intmap',
   'Area-monitor reports', 'エリア監視のレポート',
   'The report each monitor run wrote for you, and whether you have read it.',
   '監視の実行ごとに書かれたレポートと、既読かどうか。',
   'Kept until you delete the monitor or your account.',
   '監視かアカウントを削除するまで保持します。'),
  ('monitor_seen_items', 'intmap',
   'Area-monitor history', 'エリア監視の履歴',
   'Which items a monitor has already seen, so that it reports only what is new.',
   '監視がすでに見た項目。新しいものだけを報告するために使います。',
   'Kept until you delete the monitor or your account.',
   '監視かアカウントを削除するまで保持します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. account_data_inventory() — how many rows of each kind the CALLER's account holds.
--
--     ⚠ NO ARGUMENT, ON PURPOSE. The account is auth.uid() — the verified JWT — and nothing the
--     caller can type. A function taking a uuid would be a door into every other account
--     (delete_account_data takes one and is therefore service-role only).
--     SECURITY DEFINER because several owned tables are not readable by their own author through
--     RLS (feedback, bug_reports, donations, community_reports are admin-read) — and those are
--     precisely the rows a reader has the right to see.
--     A table owned through two columns (none today) counts a row once: the condition is an OR.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.account_data_inventory()
returns table (
  tbl          text,
  row_count    bigint,
  described    boolean,
  written_by   text,
  label_en     text,
  label_jp     text,
  purpose_en   text,
  purpose_jp   text,
  retention_en text,
  retention_jp text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_t    record;
  v_n    bigint;
  v_c    record;
begin
  if v_uid is null then
    raise exception 'account_data_inventory: sign-in required' using errcode = '42501';
  end if;
  for v_t in
    select o.tbl as t, string_agg(format('%I = $1', o.col), ' or ' order by o.col) as cond
      from public._owned_by_user_cols() o
     group by o.tbl
     order by o.tbl
  loop
    execute format('select count(*) from public.%I where %s', v_t.t, v_t.cond) into v_n using v_uid;
    select * into v_c from public.account_data_catalog c where c.tbl = v_t.t;
    tbl          := v_t.t;
    row_count    := v_n;
    described    := found;
    written_by   := v_c.written_by;
    label_en     := v_c.label_en;
    label_jp     := v_c.label_jp;
    purpose_en   := v_c.purpose_en;
    purpose_jp   := v_c.purpose_jp;
    retention_en := v_c.retention_en;
    retention_jp := v_c.retention_jp;
    return next;
  end loop;
end;
$$;

comment on function public.account_data_inventory() is
  '(account-data-center) For the signed-in caller (auth.uid(), never an argument): one row per owned table — discovered by public._owned_by_user_cols(), the same walk account deletion uses — with the number of rows the account holds there and the catalogue''s sentence about it. An undescribed table is still listed (described = false). Raises 42501 when nobody is signed in.';

revoke execute on function public.account_data_inventory() from public, anon;
grant  execute on function public.account_data_inventory() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. export_account_data() — every row the caller's account owns, as one JSON document.
--
--     The document explains itself: `catalog` carries the sentence for each table, `counts` the
--     number of rows, `account` what the sign-in system holds (auth.users / auth.identities — the
--     email, when the account was created and last signed in, and through which providers). Rows are
--     the tables' own rows (to_jsonb), every column, nothing summarised: an export that left a column
--     out would be the inventory, not a copy.
--
--     ⚠ A FENCE, NOT A QUOTA. One export reads the whole account; the shared token bucket
--     (relay_take, 20260918100000_r801_relay_rate_limit.sql) allows 6 per account and refills 6 per
--     hour. Observation: none — no export existed to measure; it is an estimate of «a reader who
--     downloads, checks the file and downloads again» with room to spare. It fails closed toward the
--     database (a refused export returns {ok:false, error:'rate_limited'} and reads nothing) and
--     expires the day an export is measured to be refused for a reader who was not looping.
--     The bucket is the only copy of the number: the UI and Atlas read the answer, not the limit.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.export_account_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_allowed  boolean;
  v_t        record;
  v_rows     jsonb;
  v_tables   jsonb := '{}'::jsonb;
  v_counts   jsonb := '{}'::jsonb;
  v_catalog  jsonb;
  v_account  jsonb;
  v_ids      jsonb;
begin
  if v_uid is null then
    raise exception 'export_account_data: sign-in required' using errcode = '42501';
  end if;

  select r.allowed into v_allowed
    from public.relay_take('account-export', v_uid::text, 6, 6.0 / 3600, 1) r;
  if not coalesce(v_allowed, false) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  for v_t in
    select o.tbl as t, string_agg(format('%I = $1', o.col), ' or ' order by o.col) as cond
      from public._owned_by_user_cols() o
     group by o.tbl
     order by o.tbl
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where %s', v_t.t, v_t.cond)
      into v_rows using v_uid;
    v_tables := v_tables || jsonb_build_object(v_t.t, v_rows);
    v_counts := v_counts || jsonb_build_object(v_t.t, jsonb_array_length(v_rows));
  end loop;

  select coalesce(jsonb_object_agg(c.tbl, to_jsonb(c) - 'tbl'), '{}'::jsonb)
    into v_catalog
    from public.account_data_catalog c
   where v_tables ? c.tbl;

  select coalesce(jsonb_agg(jsonb_build_object(
           'provider', i.provider, 'created_at', i.created_at, 'last_sign_in_at', i.last_sign_in_at)
           order by i.created_at), '[]'::jsonb)
    into v_ids
    from auth.identities i
   where i.user_id = v_uid;

  select jsonb_build_object(
           'id', u.id,
           'email', u.email,
           'created_at', u.created_at,
           'email_confirmed_at', u.email_confirmed_at,
           'last_sign_in_at', u.last_sign_in_at,
           'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
           'from_sign_in_provider', coalesce(u.raw_user_meta_data, '{}'::jsonb),
           'identities', v_ids)
    into v_account
    from auth.users u
   where u.id = v_uid;

  return jsonb_build_object(
    'ok',          true,
    'format',      'intmap-account-export',
    'version',     1,
    'exported_at', now(),
    'account',     coalesce(v_account, jsonb_build_object('id', v_uid)),
    'catalog',     v_catalog,
    'counts',      v_counts,
    'tables',      v_tables);
end;
$$;

comment on function public.export_account_data() is
  '(account-data-center) Every row the signed-in caller''s account owns (auth.uid(), never an argument), across every table public._owned_by_user_cols() discovers — the same set account deletion removes — plus what the sign-in system holds and the catalogue''s sentence per table. Rate-limited per account through relay_take(''account-export'') — a refusal returns {ok:false,error:''rate_limited''}. Raises 42501 when nobody is signed in.';

revoke execute on function public.export_account_data() from public, anon;
grant  execute on function public.export_account_data() to authenticated, service_role;
