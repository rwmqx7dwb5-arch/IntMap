-- ============================================================================
--  watch-account-product — TODAY'S QUEST: what a reader scored on each day's set, so the streak follows them
-- ----------------------------------------------------------------------------
--  THE PRODUCT. Every calendar day has its own set of each learn quest (js/quest-engine.js «THE DAY'S SET»: the
--  seed d<YYYY>-<MM>-<DD>, five questions; the year quest opens on what the map's record dates on that day of the
--  year). The page keeps the reader's result per day in the browser; signed in, it is ALSO kept here, so the
--  number of days in a row is the same on every device (js/quest-daily.js).
--
--  WHAT THIS TABLE HOLDS AND WHAT IT DOES NOT.
--    · One row per (reader, calendar day, kind): the five per-question scores. Nothing else — not the answers,
--      not the questions (the seed is the day, so the questions are re-made from it), not a time finer than when
--      the row was written. The total is the sum of the scores and is not stored.
--    · No leaderboard, no other reader can read a row, nothing is published.
--
--  THE FIRST FINISH IS THE RESULT. There is no UPDATE grant: a day's set played again knows its answers, so the
--  second insert of the same (day, kind) is refused by the primary key (23505), which the page reports as
--  «already recorded» (.agents/rules/one-pass-or-a-reason.md — the same call twice is «already done»).
--
--  THE NUMBERS ARE THE ENGINE'S. Five scores (DAILY_N), each 0 … 1000 (QUEST_MAX), kinds 'where' and 'when'
--  (QUEST_KIND_IDS) — js/quest-engine.js is canonical; tests/watch-account-product-checks.test.mjs holds this
--  file to it. The first day is 2026-10-08, the day the day's sets began: an earlier day is not a day anyone
--  could have played one. A day more than one day after the database's own date is refused (the reader's calendar
--  day can be one ahead of UTC's; a later one is a wrong clock, not a result).
--
--  Owned via user_id → auth.users, so account deletion and the account export
--  (20261003130000_account_data_center.sql) cover it with no edit anywhere.
-- ============================================================================

create table if not exists public.quest_daily_results (
  user_id     uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  day         date        not null check (day >= date '2026-10-08'),
  kind        text        not null check (kind in ('where', 'when')),
  scores      smallint[]  not null check (
                cardinality(scores) = 5
                and array_position(scores, null) is null
                and 0 <= all (scores) and 1000 >= all (scores)),
  created_at  timestamptz not null default now(),
  primary key (user_id, day, kind)
);

comment on table public.quest_daily_results is
  '(watch-account-product) Today''s quest: one row per reader, calendar day and quest kind — the five per-question scores of that day''s set, the first finish only (no UPDATE). Read by the page to count the reader''s streak on every device. Owner-only under RLS; owned via user_id, so account deletion and the export cover it.';

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS + grants. ⚠ TRUNCATE ignores RLS — revoke everything, give back exactly what the policies are for.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.quest_daily_results enable row level security;

revoke all on table public.quest_daily_results from public, anon, authenticated, service_role;
grant select on table public.quest_daily_results to authenticated;
grant insert (day, kind, scores) on table public.quest_daily_results to authenticated;
grant select, insert, update, delete on table public.quest_daily_results to service_role;

drop policy if exists quest_daily_results_owner_select on public.quest_daily_results;
create policy quest_daily_results_owner_select on public.quest_daily_results
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists quest_daily_results_owner_insert on public.quest_daily_results;
create policy quest_daily_results_owner_insert on public.quest_daily_results
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- The owner and the time are the database's: on insert, user_id is the caller for every caller that is not the
-- service role, and created_at is now(). A day after tomorrow (UTC) is refused.
create or replace function public.tg_quest_daily_results_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'quest_daily_results: sign in to keep a result' using errcode = '42501';
    end if;
    new.user_id := auth.uid();
  end if;
  if new.day > (now() at time zone 'utc')::date + 1 then
    raise exception 'quest_daily_results: % is not a day that has begun anywhere', new.day using errcode = '22023';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke execute on function public.tg_quest_daily_results_own() from public, anon, authenticated;

drop trigger if exists quest_daily_results_own on public.quest_daily_results;
create trigger quest_daily_results_own before insert on public.quest_daily_results
  for each row execute function public.tg_quest_daily_results_own();

-- ─────────────────────────────────────────────────────────────────────────────
--  ITS SENTENCE IN THE ACCOUNT'S DATA CATALOGUE (20261003130000_account_data_center.sql).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('quest_daily_results', 'you',
   'Today''s quest results', '今日のクエストの記録',
   'For each day you finished that day''s learn quest, the quest kind and the score of each of its five questions — so your streak of days is the same on every device. The first finish of a day is kept; playing it again is practice and is not recorded.',
   '今日のクエストを解いた日ごとに、クエストの種類と 5 問それぞれの得点（どの端末でも同じ連続記録にするため）。その日の最初の結果だけを残し、2 回目以降は練習として記録しません。',
   'Kept until you delete your account.',
   'アカウントを削除するまで保持します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
