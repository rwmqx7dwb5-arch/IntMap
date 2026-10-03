-- ============================================================================
--  my-places — PLACES THAT FOLLOW YOU: an account's own saved places, on every device
-- ----------------------------------------------------------------------------
--  THE PRODUCT. Everything a reader marks on the map today — a pin, a described Atlas pin, the place a
--  search found — lives in the page and is gone at the next reload. This is the first thing on the map
--  that belongs to the ACCOUNT: a named place with a note and an optional collection («Field trip»,
--  «Ports»), saved from the pin popup, from Account ▸ My places or by asking Atlas, and back on the
--  map on any device the reader signs in on.
--
--  ONE DOOR IN, ORDINARY DOORS OUT.
--    · Saving is public.save_place() only. It is where the account is decided (auth.uid(), never an
--      argument), where «the same place saved twice» is ONE row (identity is the position at ~1 m,
--      the same rule the session pins use — js/app-body.js addPin, toFixed(5)), and where the fence
--      on the number of rows is enforced. A second save of a saved place says so (`created = false`)
--      and updates what it was given — it never makes a duplicate (.agents/rules/one-pass-or-a-reason.md:
--      the same call twice is «already done», not a second object).
--    · Reading, renaming, re-noting, re-filing and deleting are plain RLS on the owner's own rows.
--  The table is owned through user_id → auth.users, so account deletion removes it and the account
--  export (20261003090000_account_data_center.sql) includes it with no edit anywhere — the catalogue
--  row below is the only thing that had to be written by hand, and its test says so.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE TABLE
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.saved_places (
  id          uuid             primary key default gen_random_uuid(),
  user_id     uuid             not null references auth.users(id) on delete cascade,
  name        text             not null check (char_length(btrim(name)) between 1 and 120),
  note        text             not null default '' check (char_length(note) <= 2000),
  collection  text             not null default '' check (char_length(collection) <= 60),
  lng         double precision not null check (lng between -180 and 180),
  lat         double precision not null check (lat between -90 and 90),
  zoom        real             check (zoom is null or zoom between 0 and 24),
  source      text             not null default 'reader' check (source in ('reader', 'pin', 'search', 'atlas')),
  -- ~1.1 m at the equator: the identity of a place, as in the session pins (js/app-body.js addPin).
  lng5        numeric          generated always as (round(lng::numeric, 5)) stored,
  lat5        numeric          generated always as (round(lat::numeric, 5)) stored,
  created_at  timestamptz      not null default now(),
  updated_at  timestamptz      not null default now(),
  unique (user_id, lng5, lat5)
);
create index if not exists saved_places_user_created on public.saved_places (user_id, created_at desc);

comment on table public.saved_places is
  '(my-places) An account''s saved places: name, note, collection, position, zoom. One row per position (~1 m) per account. Inserted only through public.save_place(); the owner reads, edits (name/note/collection/zoom/position) and deletes their own rows under RLS. Owned via user_id, so account deletion and the account export cover it.';

-- ─────────────────────────────────────────────────────────────────────────────
--  2. RLS + grants. ⚠ TRUNCATE ignores RLS — revoke everything, give back exactly what the
--     policies below are for. No INSERT grant: the RPC is the only way in.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.saved_places enable row level security;

revoke all on table public.saved_places from public, anon, authenticated, service_role;
grant select, delete on table public.saved_places to authenticated;
grant update (name, note, collection, lng, lat, zoom) on table public.saved_places to authenticated;
grant select, insert, update, delete on table public.saved_places to service_role;

drop policy if exists saved_places_owner_select on public.saved_places;
create policy saved_places_owner_select on public.saved_places
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists saved_places_owner_update on public.saved_places;
create policy saved_places_owner_update on public.saved_places
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists saved_places_owner_delete on public.saved_places;
create policy saved_places_owner_delete on public.saved_places
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- updated_at is the database's, never the client's.
create or replace function public.tg_saved_places_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists saved_places_touch on public.saved_places;
create trigger saved_places_touch before update on public.saved_places
  for each row execute function public.tg_saved_places_touch();

-- ─────────────────────────────────────────────────────────────────────────────
--  3. THE FENCE — the most places one account may hold.
--     ⚠ A FENCE AGAINST A RUNAWAY LOOP, NOT A QUOTA. Observation: none — no account has saved a place
--     yet; 10,000 is an estimate ~100× a heavy hand-made collection. The worst row is ~2.3 kB (name 120
--     + note 2,000 + collection 60), so the fence bounds one account at ~23 MB. It expires the day a
--     reader who is not looping is measured to reach it (save_place raises 54000 and says which fence).
--     THE ONE COPY OF THE NUMBER: the UI and Atlas read it from here (saved_places_limit()).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.saved_places_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10000 $$;

comment on function public.saved_places_limit() is
  '(my-places) The most saved places one account may hold — a fence against a runaway loop, not a quota. save_place() enforces it; the UI reads it from here.';

revoke execute on function public.saved_places_limit() from public, anon;
grant  execute on function public.saved_places_limit() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. save_place() — the one door in.
--     Arguments left NULL keep what a saved place already has; on a new place they take the defaults.
--     Returns the place's id, whether this call created it, and how many places the account holds.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.save_place(
  p_name       text,
  p_lng        double precision,
  p_lat        double precision,
  p_note       text    default null,
  p_collection text    default null,
  p_zoom       real    default null,
  p_source     text    default null
)
returns table (place_id uuid, created boolean, place_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_id    uuid;
  v_n     integer;
begin
  if v_uid is null then
    raise exception 'save_place: sign-in required' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'save_place: a place needs a name' using errcode = '22023';
  end if;
  if p_lng is null or p_lat is null then
    raise exception 'save_place: a place needs a position' using errcode = '22023';
  end if;

  -- The same position again is the same place: update what was given, say it was not created.
  update public.saved_places s
     set name       = v_name,
         note       = coalesce(p_note, s.note),
         collection = coalesce(btrim(p_collection), s.collection),
         zoom       = coalesce(p_zoom, s.zoom)
   where s.user_id = v_uid
     and s.lng5 = round(p_lng::numeric, 5)
     and s.lat5 = round(p_lat::numeric, 5)
  returning s.id into v_id;

  if v_id is not null then
    created := false;
  else
    select count(*) into v_n from public.saved_places s where s.user_id = v_uid;
    if v_n >= public.saved_places_limit() then
      raise exception 'save_place: this account already holds % places (the saved_places_limit fence)', v_n
        using errcode = '54000';
    end if;
    -- ⚠ ON CONFLICT: two tabs saving the same place at the same instant both reach this insert;
    -- the loser becomes the update the first branch would have made, not a unique-violation error.
    insert into public.saved_places as s (user_id, name, note, collection, lng, lat, zoom, source)
    values (v_uid, v_name, coalesce(p_note, ''), coalesce(btrim(p_collection), ''), p_lng, p_lat, p_zoom,
            coalesce(nullif(btrim(p_source), ''), 'reader'))
    on conflict (user_id, lng5, lat5) do update
       set name = excluded.name,
           note = case when p_note is null then s.note else excluded.note end,
           collection = case when p_collection is null then s.collection else excluded.collection end,
           zoom = coalesce(excluded.zoom, s.zoom)
    returning s.id, (s.xmax = 0) into v_id, created;
  end if;

  place_id    := v_id;
  place_count := (select count(*) from public.saved_places s where s.user_id = v_uid);
  return next;
end;
$$;

comment on function public.save_place(text, double precision, double precision, text, text, real, text) is
  '(my-places) Saves a place for the signed-in caller (auth.uid(), never an argument). One row per position (~1 m): saving a saved place updates the fields given and returns created = false. Enforces saved_places_limit() (54000). The only way a row enters public.saved_places.';

revoke execute on function public.save_place(text, double precision, double precision, text, text, real, text) from public, anon;
grant  execute on function public.save_place(text, double precision, double precision, text, text, real, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. ITS SENTENCE IN THE ACCOUNT'S DATA CATALOGUE (20261003090000_account_data_center.sql).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('saved_places', 'you',
   'My places', 'マイプレイス',
   'The places you saved: name, note, collection, position and zoom — kept so they are on the map on every device you sign in on.',
   '保存した場所（名前・メモ・コレクション・位置・ズーム）。ログインしたどの端末の地図にも出せるよう保存します。',
   'Kept until you delete the place or your account.',
   '場所かアカウントを削除するまで保持します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
