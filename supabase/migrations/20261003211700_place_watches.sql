-- ============================================================================
--  watch-places — WATCHED PLACES: a saved place that tells you when something happens near it
-- ----------------------------------------------------------------------------
--  THE PRODUCT. A place in My places (20261003140000_saved_places.sql) can be WATCHED: earthquakes,
--  official weather warnings, volcano alert levels and corroborated news events near it are read from
--  the feeds IntMap already draws; what is new since the reader last looked is said in the app and
--  gathered into a digest (js/place-watch.js; the rules in supabase/functions/_shared/place-watch.js).
--
--  WHAT THIS TABLE HOLDS AND WHAT IT DOES NOT.
--    · One row per watched place: the radius, one threshold per kind (NULL = that kind is not
--      watched), on/off, and what the reader has already SEEN (the item keys current when they last
--      looked, and when). The «seen» state is in the account so a warning read on the phone is not
--      announced again on the laptop.
--    · No run log, no evidence table, no report table, no cron, no AI. The withdrawn Area Monitors
--      (20260721090000_area_monitors.sql) kept all of those server-side; this product decides in the
--      page from public feeds, so there is nothing to forge and nothing to bill. A server evaluator
--      (Web Push) is designed but NOT approved — docs/AREA-MONITORS.md §«Watched places · push».
--
--  ONE ROW PER PLACE, AND THE PLACE MUST BE YOURS. `place_id` is the primary key (watching a watched
--  place again updates it — .agents/rules/one-pass-or-a-reason.md: the same call twice is «already
--  done», not a second row). The insert and update policies require the place to belong to the
--  caller; `user_id` is the database's (auth.uid()), and a trigger pins it for every caller that is
--  not the service role, so a row can never be handed to another account.
--  Owned via user_id → auth.users, so account deletion and the account export
--  (20261003130000_account_data_center.sql) cover it with no edit anywhere; deleting the saved place
--  deletes its watch (ON DELETE CASCADE).
-- ============================================================================

create table if not exists public.place_watches (
  place_id          uuid        primary key references public.saved_places(id) on delete cascade,
  user_id           uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  -- 1..1000 km. 1,000 is RADIUS_MAX_KM in supabase/functions/_shared/place-watch.js (canonical there;
  -- tests/watch-places-checks.test.mjs holds the two together).
  radius_km         real        not null default 300 check (radius_km > 0 and radius_km <= 1000),
  -- NULL = not watched. 2.5 is QUAKE_FLOOR_MAG (the feed read holds nothing below M2.5).
  quake_min_mag     real        default 4.5 check (quake_min_mag is null or quake_min_mag between 2.5 and 9.5),
  -- the warnings layer's normalised ladder: 1 advisory · 2 warning · 3 danger/extreme · 4 emergency
  alert_min_level   smallint    default 2   check (alert_min_level is null or alert_min_level between 1 and 4),
  -- the volcano status rank: 1 baseline … 4 the highest an agency says (js/volcano-intel.js RANK)
  volcano_min_rank  smallint    default 2   check (volcano_min_rank is null or volcano_min_rank between 1 and 4),
  -- independent outlets reporting one news event
  news_min_sources  smallint    default 2   check (news_min_sources is null or news_min_sources between 1 and 50),
  enabled           boolean     not null default true,
  -- what the reader has already seen: SEEN_MAX = 2,000 in _shared/place-watch.js
  seen_at           timestamptz,
  seen_keys         text[]      not null default '{}' check (cardinality(seen_keys) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists place_watches_user on public.place_watches (user_id);

comment on table public.place_watches is
  '(watch-places) Watched places: one row per saved place the reader watches — radius, a threshold per kind (quake magnitude, warning level, volcano rank, independent news sources; NULL = not watched), on/off, and the item keys already seen. Evaluated in the page from public feeds; no AI, no server run. Owner-only under RLS; owned via user_id, so account deletion and the export cover it.';

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS + grants. ⚠ TRUNCATE ignores RLS — revoke everything, give back exactly what the policies are for.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.place_watches enable row level security;

revoke all on table public.place_watches from public, anon, authenticated, service_role;
grant select, delete on table public.place_watches to authenticated;
grant insert (place_id, radius_km, quake_min_mag, alert_min_level, volcano_min_rank, news_min_sources, enabled, seen_at, seen_keys)
  on table public.place_watches to authenticated;
grant update (radius_km, quake_min_mag, alert_min_level, volcano_min_rank, news_min_sources, enabled, seen_at, seen_keys)
  on table public.place_watches to authenticated;
grant select, insert, update, delete on table public.place_watches to service_role;

drop policy if exists place_watches_owner_select on public.place_watches;
create policy place_watches_owner_select on public.place_watches
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists place_watches_owner_insert on public.place_watches;
create policy place_watches_owner_insert on public.place_watches
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.saved_places s where s.id = place_id and s.user_id = (select auth.uid()))
  );

drop policy if exists place_watches_owner_update on public.place_watches;
create policy place_watches_owner_update on public.place_watches
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists place_watches_owner_delete on public.place_watches;
create policy place_watches_owner_delete on public.place_watches
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- The owner is the database's: on insert, user_id is the caller (or, for the service role, the
-- place's own owner — a watch can never belong to someone other than the place's owner); updated_at
-- is always now().
create or replace function public.tg_place_watches_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select s.user_id into v_owner from public.saved_places s where s.id = new.place_id;
  if v_owner is null then
    raise exception 'place_watches: no such saved place' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' then
    new.user_id := v_owner;
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  -- the place's owner and the caller must agree for every caller that is not the service role
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     and auth.uid() is not null and auth.uid() <> v_owner then
    raise exception 'place_watches: that place is not yours' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.tg_place_watches_own() from public, anon, authenticated;

drop trigger if exists place_watches_own on public.place_watches;
create trigger place_watches_own before insert or update on public.place_watches
  for each row execute function public.tg_place_watches_own();

-- ─────────────────────────────────────────────────────────────────────────────
--  ITS SENTENCE IN THE ACCOUNT'S DATA CATALOGUE (20261003130000_account_data_center.sql).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('place_watches', 'you',
   'Watched places', '見守る場所',
   'Which of your saved places you watch, how far around them and how strong an earthquake, warning, volcano alert or news event must be to tell you — and which of those you have already seen, so the same one is not announced again on another device.',
   'マイプレイスのうち見守っている場所と、その範囲、知らせる地震・警報・火山・ニュースの強さの基準、そして既に見た出来事（別の端末で同じものを再び知らせないため）。',
   'Kept until you stop watching the place, delete the place, or delete your account.',
   '見守りを止めるか、場所またはアカウントを削除するまで保持します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
