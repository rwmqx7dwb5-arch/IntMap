-- ============================================================================
--  IntMap · the operated-browser session — the JOURNAL: one row per step Atlas takes in a real browser session
--  (supabase/functions/_shared/web-session.js; docs/architecture/06-supabase.md «web-browse»)
-- ----------------------------------------------------------------------------
--  WHY A TABLE. A reader who lets Atlas operate a site is owed an answer to «what did it do there?». The session
--  itself lives at the browser provider and is gone in minutes; this is the record that outlives it.
--  WHAT IT HOLDS: who (account), what verb, which host and path (never the query string), whether it worked and
--  with which typed code, how long it took, and how many writes the transport wall refused. NEVER the typed text,
--  the page, the screenshot or a credential — the writer is handed none of them (web-session.js builds the entry).
--  Written only by the web-browse function (service_role), best-effort: a journal write that fails never fails the
--  step it describes. Read by its owner. Retention 30 days (the delegation journal's window and mechanism:
--  20261119120000_delegation_journal.sql); expires when docs/MONITORING.md needs longer — change the daily job's
--  argument and purge_web_session_journal's default together.
-- ============================================================================

create table if not exists public.web_session_journal (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  action      text        not null check (action in ('grant', 'open', 'observe', 'click', 'type', 'select', 'press', 'scroll', 'back', 'wait', 'live', 'close', 'invalid')),
  host        text        not null default '',
  path        text        not null default '',          -- the path only: a query string can carry what the reader typed
  ok          boolean     not null,
  code        text        not null default '',          -- '' when ok; else the typed code the step ended in
  ms          integer     not null default 0,
  blocked     integer     not null default 0,           -- writes the transport wall refused during the step
  created_at  timestamptz not null default now()
);
comment on table public.web_session_journal is
  '(browser-session) One row per step Atlas takes in an operated real-browser session: verb, host, path (no query), outcome, timing, writes refused. No typed text, no page, no credential. Written only by web-browse (service_role), kept 30 days.';

create index if not exists web_session_journal_created_idx on public.web_session_journal (created_at);
create index if not exists web_session_journal_user_idx    on public.web_session_journal (user_id, created_at);

alter table public.web_session_journal enable row level security;
revoke all on public.web_session_journal from public, anon, authenticated;
grant select on public.web_session_journal to authenticated;
grant all    on public.web_session_journal to service_role;

drop policy if exists web_session_journal_owner_select on public.web_session_journal;
create policy web_session_journal_owner_select on public.web_session_journal
  for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.log_web_session(
  p_user    uuid,
  p_action  text,
  p_host    text,
  p_path    text,
  p_ok      boolean,
  p_code    text,
  p_ms      integer,
  p_blocked integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.web_session_journal (user_id, action, host, path, ok, code, ms, blocked)
  values (p_user, p_action, left(coalesce(p_host, ''), 253), left(coalesce(split_part(p_path, '?', 1), ''), 200),
          coalesce(p_ok, false), left(coalesce(p_code, ''), 64), greatest(0, coalesce(p_ms, 0)), greatest(0, coalesce(p_blocked, 0)));
  return true;
end;
$$;
comment on function public.log_web_session(uuid, text, text, text, boolean, text, integer, integer) is
  '(browser-session) Append one journal row for an operated-browser step. Written only by web-browse, best-effort. The query string of the path is dropped here as well as by the caller.';
revoke execute on function public.log_web_session(uuid, text, text, text, boolean, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.log_web_session(uuid, text, text, text, boolean, text, integer, integer) to service_role;

create or replace function public.purge_web_session_journal(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.web_session_journal j
   where j.created_at < now() - make_interval(days => greatest(1, coalesce(p_days, 30)));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.purge_web_session_journal(integer) is
  '(browser-session) Delete journal rows older than p_days (default 30). Scheduled daily as pg_cron job web-session-journal-purge.';
revoke execute on function public.purge_web_session_journal(integer) from public, anon, authenticated;
grant  execute on function public.purge_web_session_journal(integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the web-session-journal-purge schedule';
    return;
  end if;
  perform cron.schedule('web-session-journal-purge', '41 3 * * *', 'select public.purge_web_session_journal(30)');
end $$;

-- ── the account's data inventory states the new table (supabase/tests/23_account_data_center_test.sql) ──
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('web_session_journal', 'intmap',
   'Atlas browser-session log', 'Atlasのブラウザ操作の記録',
   'One row per step Atlas takes when you let it operate a website for you: what kind of step, which site and page, whether it worked, how long it took, and how many sends the browser refused. It holds nothing you typed, no page content and no password. It lets you and IntMap see what was done on a site on your behalf.',
   'Atlasがあなたの許可のもとでウェブサイトを操作した1手ごとに1行の記録。どんな操作か、どのサイトのどのページか、成功したか、かかった時間、ブラウザが止めた送信の数を持ちます。入力した内容・ページの中身・パスワードは持ちません。あなたの代わりにサイトで何が行われたかを、あなた自身とIntMapが確かめられるようにします。',
   'Deleted automatically after 30 days, and when you delete your account.',
   '30日後に自動で削除されます。アカウントを削除したときも消えます。')
on conflict (tbl) do update set
  written_by = excluded.written_by, label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
