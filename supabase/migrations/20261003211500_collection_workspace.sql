-- ============================================================================
--  collection-workspace — A COLLECTION IS A WORKSPACE: places AND maps, on every device, and a
--  read-only link the owner chooses to publish
-- ----------------------------------------------------------------------------
--  THE PRODUCT. «My places» (20261003140000_saved_places.sql) gave the account its first thing on the
--  map: named places, filed into collections («Field trip», 「京都旅行」). Two things a collection could
--  not hold yet, and this migration adds both:
--    · THE MAP ITSELF. A reader who has built a map — the layers, the clock, the base map, the camera,
--      a caption — had only the address bar to keep it in. `saved_views` keeps that map in the account,
--      in a collection beside its places, so «the 1914 map for Thursday's class» is on every device.
--      The map is kept as the share link's own fragment (js/map-state.js MapState.hash(), the codec
--      every share link, tour step and embed already uses) — opened, it is restored by the same restore
--      a pasted link takes. Nothing here interprets it.
--    · A WAY OUT. `collection_shares` is the owner's EXPLICIT decision to publish one collection (or all
--      of their places and maps) at an unguessable address. Whoever has the link sees the collection AS
--      IT IS NOW — read-only: its places as pins and its maps to open — and, when signed in, can copy
--      it into their own account. Unpublishing deletes the row; the link stops answering at once.
--
--  ONE DOOR IN, ORDINARY DOORS OUT (the saved_places shape):
--    · saving a map is public.save_view() only — the account is auth.uid(), never an argument; the same
--      map saved twice (the same fragment) is ONE row (`created = false`, .agents/rules/one-pass-or-a-reason.md);
--      the fence on the number of maps is enforced there.
--    · publishing is public.publish_collection() only — one share per (account, collection); publishing a
--      published collection answers with its existing link (`created = false`), never a second link.
--    · reading, renaming, re-filing and deleting are plain RLS on the owner's own rows; unpublishing is
--      the owner's DELETE on their share.
--    · THE PUBLIC READ IS ONE FUNCTION, public.shared_collection(token), SECURITY DEFINER and callable by
--      anon. It returns the words and positions the owner filed — never an id, an account, an e-mail or a
--      timestamp finer than the collection's own — and nothing at all for a token that is not published.
--      anon holds no privilege on any of the three tables.
--  All three tables are owned through user_id → auth.users, so account deletion removes them and the
--  account export (20261003130000_account_data_center.sql) carries them with no edit anywhere — the two
--  catalogue rows at the end are the only things written by hand, and their test says so.
--  ⚠ NON-DESTRUCTIVE: two new tables, new functions, and ONE widened CHECK (saved_places.source gains
--    'shared', the value a copied place carries). No row changes; every value the old check accepted
--    is still accepted.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. SAVED MAPS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.saved_views (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null check (char_length(btrim(name)) between 1 and 120),
  note        text        not null default '' check (char_length(note) <= 2000),
  collection  text        not null default '' check (char_length(collection) <= 60),
  -- The map: the share link's fragment without '#', as js/map-state.js encode() writes it. It always
  -- begins with the camera (`v=`); a string that does not is not a map and is refused here.
  -- 32,768 characters is A DECISION, NOT A MEASUREMENT: the longest fragment the codec writes is the camera,
  -- every active layer id, the display items, two instants and a packed simulator object — an ESTIMATED few
  -- kilobytes; no saved map existed to measure when this was written. It is the row-size fence (with the
  -- fence on the number of maps below, ~64 MB per account at worst). Raise it when a real map meets it —
  -- save_view refuses with 23514 and js/my-places.js names the refusal.
  state       text        not null check (char_length(state) between 3 and 32768 and state ~ '^v='),
  -- one map, one row: the identity is the fragment itself (an index on 32 kB of text is not what a b-tree is for)
  state_md5   text        generated always as (md5(state)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, state_md5)
);
create index if not exists saved_views_user_created on public.saved_views (user_id, created_at desc);

comment on table public.saved_views is
  '(collection-workspace) An account''s saved maps: a name, a note, a collection and the map itself (the share link''s fragment, js/map-state.js). One row per fragment per account. Inserted only through public.save_view(); the owner reads, renames, re-files and deletes their own rows under RLS. Owned via user_id, so account deletion and the account export cover it.';

alter table public.saved_views enable row level security;
-- ⚠ TRUNCATE ignores RLS — revoke everything, give back exactly what the policies below are for.
revoke all on table public.saved_views from public, anon, authenticated, service_role;
grant select, delete on table public.saved_views to authenticated;
grant update (name, note, collection) on table public.saved_views to authenticated;
grant select, insert, update, delete on table public.saved_views to service_role;

drop policy if exists saved_views_owner_select on public.saved_views;
create policy saved_views_owner_select on public.saved_views
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists saved_views_owner_update on public.saved_views;
create policy saved_views_owner_update on public.saved_views
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists saved_views_owner_delete on public.saved_views;
create policy saved_views_owner_delete on public.saved_views
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- updated_at is the database's (the saved_places trigger function does exactly this; it is reused).
drop trigger if exists saved_views_touch on public.saved_views;
create trigger saved_views_touch before update on public.saved_views
  for each row execute function public.tg_saved_places_touch();

-- THE FENCE — the most maps one account may hold.
-- ⚠ A FENCE AGAINST A RUNAWAY LOOP, NOT A QUOTA. Observation: none — no account has saved a map yet.
-- 2,000 is an estimate: a teacher who saves one map per lesson for every lesson of a school year
-- (~200) ten times over. With the 32,768-character row it bounds one account at ~64 MB. It expires the
-- day a reader who is not looping is measured to reach it (save_view raises 54000 and says which fence).
-- THE ONE COPY OF THE NUMBER: the UI and Atlas read it from here.
create or replace function public.saved_views_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2000 $$;
comment on function public.saved_views_limit() is
  '(collection-workspace) The most saved maps one account may hold — a fence against a runaway loop, not a quota. save_view() enforces it; the UI reads it from here.';
revoke execute on function public.saved_views_limit() from public, anon;
grant  execute on function public.saved_views_limit() to authenticated, service_role;

-- save_view() — the one door in. Arguments left NULL keep what a saved map already has.
create or replace function public.save_view(
  p_name       text,
  p_state      text,
  p_note       text default null,
  p_collection text default null
)
returns table (view_id uuid, created boolean, view_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_state text := regexp_replace(coalesce(p_state, ''), '^#', '');
  v_id    uuid;
  v_n     integer;
begin
  if v_uid is null then
    raise exception 'save_view: sign-in required' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'save_view: a map needs a name' using errcode = '22023';
  end if;
  if v_state !~ '^v=' then
    raise exception 'save_view: that is not a map link (it names no view)' using errcode = '22023';
  end if;

  update public.saved_views s
     set name       = v_name,
         note       = coalesce(p_note, s.note),
         collection = coalesce(btrim(p_collection), s.collection)
   where s.user_id = v_uid
     and s.state_md5 = md5(v_state)
  returning s.id into v_id;

  if v_id is not null then
    created := false;
  else
    select count(*) into v_n from public.saved_views s where s.user_id = v_uid;
    if v_n >= public.saved_views_limit() then
      raise exception 'save_view: this account already holds % maps (the saved_views_limit fence)', v_n
        using errcode = '54000';
    end if;
    -- ⚠ ON CONFLICT: two tabs saving the same map at the same instant are one row, not a unique-violation error.
    insert into public.saved_views as s (user_id, name, note, collection, state)
    values (v_uid, v_name, coalesce(p_note, ''), coalesce(btrim(p_collection), ''), v_state)
    on conflict (user_id, state_md5) do update
       set name = excluded.name,
           note = case when p_note is null then s.note else excluded.note end,
           collection = case when p_collection is null then s.collection else excluded.collection end
    returning s.id, (s.xmax = 0) into v_id, created;
  end if;

  view_id    := v_id;
  view_count := (select count(*) from public.saved_views s where s.user_id = v_uid);
  return next;
end;
$$;
comment on function public.save_view(text, text, text, text) is
  '(collection-workspace) Saves the map (a share-link fragment) for the signed-in caller (auth.uid(), never an argument). One row per fragment: saving a saved map updates the fields given and returns created = false. Enforces saved_views_limit() (54000). The only way a row enters public.saved_views.';
revoke execute on function public.save_view(text, text, text, text) from public, anon;
grant  execute on function public.save_view(text, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. PUBLISHED COLLECTIONS
--     `collection` NULL = everything the account holds; '' = the unfiled places and maps; otherwise the
--     collection of that name. ONE share per (account, collection) — NULLS NOT DISTINCT, so «everything»
--     is one share too.
--     The token is 32 hex characters of gen_random_uuid() (122 random bits): unguessable, so the link is
--     the whole of the access control for a reader without an account, and it carries nothing about the
--     owner. It is never reused: unpublishing deletes the row, publishing again mints a new token.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.collection_shares (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  collection  text        check (collection is null or char_length(collection) <= 60),
  token       text        not null unique default replace(gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{32}$'),
  title       text        not null check (char_length(btrim(title)) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint collection_shares_one_per_collection unique nulls not distinct (user_id, collection)
);
comment on table public.collection_shares is
  '(collection-workspace) The collections an account chose to publish read-only: which collection (NULL = everything), its title and the unguessable token of its link. Inserted only through public.publish_collection(); the owner reads, retitles and deletes (= unpublishes) their own rows under RLS; the public reads a published collection only through public.shared_collection(token).';

alter table public.collection_shares enable row level security;
revoke all on table public.collection_shares from public, anon, authenticated, service_role;
grant select, delete on table public.collection_shares to authenticated;
grant update (title) on table public.collection_shares to authenticated;
grant select, insert, update, delete on table public.collection_shares to service_role;

drop policy if exists collection_shares_owner_select on public.collection_shares;
create policy collection_shares_owner_select on public.collection_shares
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists collection_shares_owner_update on public.collection_shares;
create policy collection_shares_owner_update on public.collection_shares
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists collection_shares_owner_delete on public.collection_shares;
create policy collection_shares_owner_delete on public.collection_shares
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists collection_shares_touch on public.collection_shares;
create trigger collection_shares_touch before update on public.collection_shares
  for each row execute function public.tg_saved_places_touch();

-- publish_collection() — the one door in. Publishing what is already published answers with its link.
create or replace function public.publish_collection(
  p_collection text default null,
  p_title      text default null
)
returns table (token text, created boolean, place_count integer, view_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_coll  text := case when p_collection is null then null else btrim(p_collection) end;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_np    integer;
  v_nv    integer;
  v_tok   text;
begin
  if v_uid is null then
    raise exception 'publish_collection: sign-in required' using errcode = '42501';
  end if;
  select count(*) into v_np from public.saved_places s where s.user_id = v_uid and (v_coll is null or s.collection = v_coll);
  select count(*) into v_nv from public.saved_views  s where s.user_id = v_uid and (v_coll is null or s.collection = v_coll);
  if v_np + v_nv = 0 then
    -- an empty link is not something to hand to a class: say so, publish nothing
    raise exception 'publish_collection: nothing is filed in that collection' using errcode = '22023';
  end if;

  update public.collection_shares c
     set title = coalesce(v_title, c.title)
   where c.user_id = v_uid and c.collection is not distinct from v_coll
  returning c.token into v_tok;

  if v_tok is not null then
    created := false;
  else
    insert into public.collection_shares as c (user_id, collection, title)
    values (v_uid, v_coll, left(coalesce(v_title, nullif(v_coll, ''), 'IntMap'), 120))
    on conflict on constraint collection_shares_one_per_collection do update
       set title = coalesce(v_title, c.title)
    returning c.token, (c.xmax = 0) into v_tok, created;
  end if;

  token       := v_tok;
  place_count := v_np;
  view_count  := v_nv;
  return next;
end;
$$;
comment on function public.publish_collection(text, text) is
  '(collection-workspace) Publishes one collection (NULL = everything) of the signed-in caller read-only and returns its link token. One share per collection: publishing a published collection returns the same token with created = false. Refuses an empty collection (22023). The only way a row enters public.collection_shares.';
revoke execute on function public.publish_collection(text, text) from public, anon;
grant  execute on function public.publish_collection(text, text) to authenticated, service_role;

-- shared_collection() — THE PUBLIC READ. What a published collection holds NOW, by its token.
create or replace function public.shared_collection(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sh record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select c.user_id, c.collection, c.title, c.created_at into sh
    from public.collection_shares c where c.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object(
    'ok',           true,
    'format',       'intmap-collection',
    'version',      1,
    'title',        sh.title,
    'collection',   sh.collection,
    'published_at', sh.created_at,
    'places', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'note', s.note, 'collection', s.collection,
                                          'lng', s.lng, 'lat', s.lat, 'zoom', s.zoom) order by s.created_at, s.id)
        from public.saved_places s
       where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)), '[]'::jsonb),
    'views', coalesce((
      select jsonb_agg(jsonb_build_object('name', v.name, 'note', v.note, 'collection', v.collection,
                                          'state', v.state) order by v.created_at, v.id)
        from public.saved_views v
       where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)), '[]'::jsonb),
    'updated_at', greatest(
      (select max(s.updated_at) from public.saved_places s where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)),
      (select max(v.updated_at) from public.saved_views  v where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)))
  );
end;
$$;
comment on function public.shared_collection(text) is
  '(collection-workspace) The public read of a published collection: its title and, as they are now, its places (name, note, collection, position, zoom) and maps (name, note, collection, share-link fragment). Never an id, an account or an e-mail. {ok:false,error:not_found} for a token that is not published. ANON MAY CALL: a published collection is public by the owner''s explicit act (publish_collection), the 122-bit token is the access control, and the function returns only what the owner filed in that collection.';
revoke execute on function public.shared_collection(text) from public;
grant  execute on function public.shared_collection(text) to anon, authenticated, service_role;

-- copy_shared_collection() — a signed-in reader keeps a published collection in their OWN account.
-- Places and maps the reader already holds (the same position / the same map) are left as they are and
-- counted as «had»: copying twice is the same as copying once.
create or replace function public.copy_shared_collection(p_token text, p_into text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  sh     record;
  v_into text;
  v_np   integer; v_nv integer;
  v_ap   integer; v_av integer;
  v_hp   integer; v_hv integer;
begin
  if v_uid is null then
    raise exception 'copy_shared_collection: sign-in required' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select c.user_id, c.collection, c.title into sh from public.collection_shares c where c.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_into := left(btrim(coalesce(nullif(btrim(coalesce(p_into, '')), ''), sh.title)), 60);

  -- the fences, counted on what would be NEW (a position / a map the reader does not hold yet)
  select count(*) into v_np from public.saved_places s
   where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)
     and not exists (select 1 from public.saved_places m where m.user_id = v_uid and m.lng5 = s.lng5 and m.lat5 = s.lat5);
  select count(*) into v_nv from public.saved_views v
   where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)
     and not exists (select 1 from public.saved_views m where m.user_id = v_uid and m.state_md5 = v.state_md5);
  if (select count(*) from public.saved_places m where m.user_id = v_uid) + v_np > public.saved_places_limit() then
    raise exception 'copy_shared_collection: this account would hold more than % places (the saved_places_limit fence)', public.saved_places_limit()
      using errcode = '54000';
  end if;
  if (select count(*) from public.saved_views m where m.user_id = v_uid) + v_nv > public.saved_views_limit() then
    raise exception 'copy_shared_collection: this account would hold more than % maps (the saved_views_limit fence)', public.saved_views_limit()
      using errcode = '54000';
  end if;

  insert into public.saved_places (user_id, name, note, collection, lng, lat, zoom, source)
  select v_uid, s.name, s.note, v_into, s.lng, s.lat, s.zoom, 'shared'
    from public.saved_places s
   where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)
  on conflict (user_id, lng5, lat5) do nothing;
  get diagnostics v_ap = row_count;

  insert into public.saved_views (user_id, name, note, collection, state)
  select v_uid, v.name, v.note, v_into, v.state
    from public.saved_views v
   where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)
  on conflict (user_id, state_md5) do nothing;
  get diagnostics v_av = row_count;

  select count(*) into v_hp from public.saved_places s where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection);
  select count(*) into v_hv from public.saved_views  v where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection);

  return jsonb_build_object('ok', true, 'collection', v_into,
    'places_added', v_ap, 'places_had', v_hp - v_ap,
    'views_added',  v_av, 'views_had',  v_hv - v_av);
end;
$$;
comment on function public.copy_shared_collection(text, text) is
  '(collection-workspace) Copies a published collection into the signed-in caller''s own places and maps, filed under p_into (default: the collection''s title). What the caller already holds (same position / same map) is left as it is and counted as had — copying twice equals copying once. Enforces saved_places_limit() and saved_views_limit() on what is new (54000).';
revoke execute on function public.copy_shared_collection(text, text) from public, anon;
grant  execute on function public.copy_shared_collection(text, text) to authenticated, service_role;

-- A copied place says where it came from. WIDENED, not replaced: every value the old check accepted is accepted.
alter table public.saved_places drop constraint if exists saved_places_source_check;
alter table public.saved_places add constraint saved_places_source_check
  check (source in ('reader', 'pin', 'search', 'atlas', 'shared'));

-- ─────────────────────────────────────────────────────────────────────────────
--  3. THEIR SENTENCES IN THE ACCOUNT'S DATA CATALOGUE (20261003130000_account_data_center.sql).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('saved_views', 'you',
   'Saved maps', '保存した地図',
   'The maps you saved (the layers, the date, the base map, the view and the caption, as a share link holds them) with their name, note and collection — kept so they open on every device you sign in on.',
   '保存した地図（共有リンクと同じ形で、レイヤー・日付・背景地図・視点・題を持つもの）と、その名前・メモ・コレクション。ログインしたどの端末でも開けるよう保存します。',
   'Kept until you delete the map or your account.',
   '地図かアカウントを削除するまで保持します。'),
  ('collection_shares', 'you',
   'Published collections', '公開したコレクション',
   'The collections you chose to publish as a read-only link: which collection, its title and the link. Anyone with the link sees that collection''s places and maps as they are now (names, notes and positions — never your account or e-mail).',
   '閲覧専用のリンクとして公開したコレクション（どのコレクションか・題・リンク）。リンクを知っている人は誰でも、そのコレクションの場所と地図を今の内容で見られます（名前・メモ・位置。アカウントやメールアドレスは見えません）。',
   'Kept until you stop publishing the collection or delete your account; the link stops working at once.',
   '公開をやめるかアカウントを削除するまで保持します。やめた時点でリンクは開けなくなります。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
