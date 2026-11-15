-- ============================================================================
--  community-maps — MAPS THAT TRAVEL BETWEEN READERS: a public directory of the collections owners chose to
--  list, the reuse each one has had, and the line from a map to the map it was started from
-- ----------------------------------------------------------------------------
--  THE GAP (2026-10-13). A reader can build a collection of places, maps, tours and Atlas answers and publish it
--  as a read-only link (20261003211500_collection_workspace.sql, 20261004120000_map_documents.sql); a visitor
--  can keep a copy. But a published collection travels ONLY as far as its owner hands the link: nobody who does
--  not already have the link can find it, the owner never learns whether anyone kept it, and a collection that
--  was started from somebody else's carries no trace of where it came from. A map made for one class could not
--  reach the next teacher who needs the same map.
--
--  THIS MIGRATION:
--    · LISTING. collection_shares gains the owner's EXPLICIT second decision: list this published collection in
--      «Community maps», under a name the owner types for the purpose (author_name — never the account's e-mail
--      or profile name) and a summary. Publishing alone still lists nothing: a link-only collection stays
--      exactly as discoverable as before (not at all). The only door is list_community_map(); unlisting is
--      unlist_community_map() and keeps the link working.
--    · THE DIRECTORY. community_maps() — anon may call it — returns the listed collections that are not held:
--      title, summary, the author name, counts of places / maps / tours, where on the globe it is (from the
--      places it holds, else its first map's camera), and two numbers that measure reuse without measuring a
--      person: how many OTHER accounts kept a copy (reused) and how many listed collections were started from
--      it (derived). Search by words, sort by newest / most reused / recently changed, or ask only for the
--      ones about an area. No id, account or e-mail; the token returned is the link the owner made public.
--      ⚠ ITS COST FOLLOWS THE PAGE, NOT THE DIRECTORY: every order is an index on collection_shares (listed_at;
--      reused_count; content_updated_at — the two counters are kept by triggers, not counted per read), the
--      contents of a collection are read through (user_id, collection) indexes on saved_places / saved_views,
--      and the read stops at the page plus one row (`has_more`, not a total — a total would read every listing).
--      What still reads past the page is what an index cannot answer: words inside a title (`%…%`) and the
--      area (a collection's box is its places', which change under it), each skipping the rows that do not
--      match until the page fills. Recorded in dev-notes/2026-10-13-wave4-community.md.
--    · REUSE. copy_shared_collection() now leaves a receipt — collection_copies (share, account, the collection
--      it was filed under). One row per (share, account): copying twice is still once. It is the copier's own
--      row (they read it, it is in their export and goes with their account); an owner sees only the count.
--    · LINEAGE. A collection listed by someone who filled it from a copy says so: list_community_map() sets
--      derived_from to the share the caller copied INTO that collection (most recent). The directory names the
--      original (title, author, link) ONLY while the original is itself listed and not held — an unlisted
--      original's link is never disclosed through somebody else's listing.
--    · REPORTS AND MODERATION — ON THE COLLECTION, NOT ON ITS SHARE ROW. A share row is the owner's to delete
--      (unpublishing, 20261003211500_collection_workspace.sql), and publishing again mints a new one: anything an
--      administrator decided or a reader reported that lived on the row would vanish with it. So both live on what
--      a share is OF — (account, collection):
--        · community_map_subjects — one row per reported (account, collection); NOT owned by the account (no
--          user_id, no foreign key: the reporters' rows point at it, and a reporter's export must not carry the
--          owner's account id). Written by report_community_map() only; read by nobody but the functions.
--        · community_map_reports — one per (subject, reporter), the reporter's own row (their export, their
--          account); reporting again updates it. Unpublishing does not remove it.
--        · community_map_holds — an administrator's decision to take (account, collection) out of Community maps,
--          with the reason the owner reads. Owned by the owner's account (they read it, it is in their export, it
--          goes with the account). list_community_map() refuses a held (account, collection) whichever share row
--          it is published under now; the directory, the lineage and the collection's own read leave it out.
--          Its link — the owner's own distribution, as before this migration — is not touched.
--          ⚠ A hold names the collection by its name. An owner who moves every item to another name and lists
--          that has made a new listing, which readers can report again; holding an account is not this mechanism.
--    · The owner reads their own reach — reused and derived per share — with my_collection_reach().
--
--  THE NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4):
--    · author_name 1-40 characters: a DECISION — the longest pen name a card holds on one line beside the counts
--      (the directory card is 340 px wide at most, js/community-maps.js). Expires if the card is redesigned.
--    · summary 500 characters: a DECISION — a paragraph a card shows in three lines and the sheet in full; the
--      note on a single place is 2,000 (saved_places), and a summary is about the whole. Raise when a real
--      summary meets it (list_community_map raises 23514 and the sheet names the refusal).
--    · community_maps p_limit at most 50, p_offset at most 10,000: one page of cards; the directory is read a page
--      at a time. ESTIMATE of a page a phone renders without stalling; expires when the sheet pages differently.
--    · report note 1,000 characters, reasons a closed vocabulary (spam, offensive, personal_info, copyright,
--      misleading, other): a DECISION, the categories the operator acts on differently.
--    · a settled report (dismissed / actioned) is deleted 730 days after it was sent: the operator's choice made
--      for the map corrections (20261003224500_map_corrections.sql — long enough to recognise the same report
--      coming back), reused, not re-estimated. Expires when the operator decides otherwise.
--  RETENTION: a copy receipt lives as long as the share and the copier's account; a report as long as the
--  reporter's account, an open report until it is settled and a settled one 730 days; a hold until an
--  administrator restores it or the owner deletes the account; a subject while a report or a hold names it and
--  its owner's account exists (purge_community_map_reports, daily). Stated in the account data catalogue below
--  and in the privacy policy (js/legal-text.js).
--
--  ⚠ NON-DESTRUCTIVE: six new columns (nullable or defaulted) on collection_shares, two new indexes on
--    saved_places / saved_views, four new tables, new functions and triggers, two functions REPLACED with their
--    old behaviour kept whole (shared_collection gains a `listing` key; copy_shared_collection gains the
--    receipt), four catalogue rows. No row changes. BLAST RADIUS of the replacements: opening and copying a
--    published collection — supabase/tests/24, 29 and 38 hold them.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. LISTING — the owner's second, explicit decision, on the share itself
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.collection_shares add column if not exists listed_at          timestamptz;
alter table public.collection_shares add column if not exists author_name        text;
alter table public.collection_shares add column if not exists summary            text not null default '';
alter table public.collection_shares add column if not exists derived_from       uuid references public.collection_shares(id) on delete set null;
-- two orders the directory keeps as columns so that a page is read through an index (§5): how many other
-- accounts kept it (collection_copies' trigger) and when its contents last changed (saved_places / saved_views' trigger)
alter table public.collection_shares add column if not exists reused_count       integer not null default 0 check (reused_count >= 0);
alter table public.collection_shares add column if not exists content_updated_at timestamptz not null default now();

alter table public.collection_shares drop constraint if exists collection_shares_author_check;
alter table public.collection_shares add constraint collection_shares_author_check
  check (author_name is null or (char_length(btrim(author_name)) between 1 and 40 and author_name !~ '[[:cntrl:]]'));
alter table public.collection_shares drop constraint if exists collection_shares_summary_check;
alter table public.collection_shares add constraint collection_shares_summary_check check (char_length(summary) <= 500);
-- a listed collection always has the name it is listed under
alter table public.collection_shares drop constraint if exists collection_shares_listed_has_author;
alter table public.collection_shares add constraint collection_shares_listed_has_author check (listed_at is null or author_name is not null);
alter table public.collection_shares drop constraint if exists collection_shares_not_own_origin;
alter table public.collection_shares add constraint collection_shares_not_own_origin check (derived_from is null or derived_from <> id);

-- one index per order the directory reads in (each ends in id: a total order, so a page boundary is stable)
create index if not exists collection_shares_listed_idx  on public.collection_shares (listed_at desc, id) where listed_at is not null;
create index if not exists collection_shares_reused_idx  on public.collection_shares (reused_count desc, listed_at desc, id) where listed_at is not null;
create index if not exists collection_shares_changed_idx on public.collection_shares (content_updated_at desc, id) where listed_at is not null;
create index if not exists collection_shares_derived_idx on public.collection_shares (derived_from) where derived_from is not null;
-- what a collection holds, read by (account, collection) — the directory's card, the read of one collection
create index if not exists saved_places_user_collection on public.saved_places (user_id, collection);
create index if not exists saved_views_user_collection  on public.saved_views  (user_id, collection);
-- ⚠ the column grant is unchanged: the owner may still UPDATE (title) only — listing, the author name, the
--   summary, the lineage and the two counters are written through the functions and triggers below.

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE COPY RECEIPT — who kept which published collection, filed where
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.collection_copies (
  share_id        uuid        not null references public.collection_shares(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  into_collection text        not null check (char_length(into_collection) <= 60),
  copied_at       timestamptz not null default now(),
  primary key (share_id, user_id)
);
create index if not exists collection_copies_user_into on public.collection_copies (user_id, into_collection);
comment on table public.collection_copies is
  '(community-maps) One row per (published collection, account that kept a copy of it): the collection the copy was filed under and when. Written only by copy_shared_collection(); the copier reads their own rows; a collection''s owner sees only the count (my_collection_reach, community_maps — collection_shares.reused_count, kept by a trigger on this table). Owned via user_id, so the export and account deletion cover it; it goes with the share.';

alter table public.collection_copies enable row level security;
revoke all on table public.collection_copies from public, anon, authenticated, service_role;
grant select on table public.collection_copies to authenticated;
grant select, insert, update, delete on table public.collection_copies to service_role;
drop policy if exists collection_copies_owner_select on public.collection_copies;
create policy collection_copies_owner_select on public.collection_copies
  for select to authenticated
  using (user_id = (select auth.uid()));

-- reused_count IS the number of receipts on the share — kept by the rows themselves, so a copy, a copier's deleted
-- account (cascade) and an unpublished share all move it, and nothing counts receipts on a read. (An upsert that
-- updates an existing receipt is an UPDATE: it does not count twice.)
create or replace function public.tg_collection_copies_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.collection_shares c set reused_count = c.reused_count + 1 where c.id = new.share_id;
  else
    update public.collection_shares c set reused_count = greatest(0, c.reused_count - 1) where c.id = old.share_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_collection_copies_count() from public, anon, authenticated;
drop trigger if exists collection_copies_count on public.collection_copies;
create trigger collection_copies_count after insert or delete on public.collection_copies
  for each row execute function public.tg_collection_copies_count();

-- content_updated_at: a place or map filed in, out of or within a LISTED collection of its owner moves it. Only the
-- owner's listed shares are touched (one indexed update per changed row).
create or replace function public.tg_collection_content_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid; v_old text; v_new text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_uid := old.user_id; v_old := old.collection; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_uid := new.user_id; v_new := new.collection; end if;
  update public.collection_shares s set content_updated_at = now()
   where s.user_id = v_uid and s.listed_at is not null
     and (s.collection is null or s.collection = v_old or s.collection = v_new);
  return null;
end;
$$;
revoke execute on function public.tg_collection_content_touch() from public, anon, authenticated;
drop trigger if exists saved_places_community_touch on public.saved_places;
create trigger saved_places_community_touch after insert or update or delete on public.saved_places
  for each row execute function public.tg_collection_content_touch();
drop trigger if exists saved_views_community_touch on public.saved_views;
create trigger saved_views_community_touch after insert or update or delete on public.saved_views
  for each row execute function public.tg_collection_content_touch();

-- ─────────────────────────────────────────────────────────────────────────────
--  3. REPORTS AND HOLDS — on (account, collection), not on the share row (the header says why)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.community_map_subjects (
  id          uuid        primary key default gen_random_uuid(),
  owner       uuid        not null,   -- the collection's account. ⚠ NO foreign key and not named user_id: see the header
  collection  text        check (collection is null or char_length(collection) <= 60),
  created_at  timestamptz not null default now(),
  constraint community_map_subjects_one unique nulls not distinct (owner, collection)
);
comment on table public.community_map_subjects is
  '(community-maps) What a report is about: one (account, collection) — not the share row, which its owner may delete and publish again. No foreign key to the account on purpose: reporters'' rows point here, and an export of the reporter''s data must not carry the owner''s account id. Written only by report_community_map(); read only by the functions. Purged when no report or hold names it, or when the owner''s account is gone (purge_community_map_reports).';
alter table public.community_map_subjects enable row level security;
revoke all on table public.community_map_subjects from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.community_map_subjects to service_role;

create table if not exists public.community_map_reports (
  subject_id  uuid        not null references public.community_map_subjects(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null check (char_length(title) <= 120),   -- the title the reader saw, kept if the share goes
  reason      text        not null check (reason in ('spam', 'offensive', 'personal_info', 'copyright', 'misleading', 'other')),
  note        text        not null default '' check (char_length(note) <= 1000),
  status      text        not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at  timestamptz not null default now(),
  primary key (subject_id, user_id)
);
create index if not exists community_map_reports_open_idx on public.community_map_reports (subject_id) where status = 'open';
comment on table public.community_map_reports is
  '(community-maps) A signed-in reader''s report that a collection listed in Community maps should not be there: why (a closed vocabulary), a note, and the title they saw. One per (collection, account) — reporting again updates it; unpublishing the collection does not remove it. Written only by report_community_map(); the reporter reads their own; an administrator reads the queue through community_map_reports_admin() and settles it through moderate_community_map(). The owner of the collection never sees who reported it. A settled report is deleted 730 days after it was sent (purge_community_map_reports).';
alter table public.community_map_reports enable row level security;
revoke all on table public.community_map_reports from public, anon, authenticated, service_role;
grant select on table public.community_map_reports to authenticated;
grant select, insert, update, delete on table public.community_map_reports to service_role;
drop policy if exists community_map_reports_read on public.community_map_reports;
create policy community_map_reports_read on public.community_map_reports
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create table if not exists public.community_map_holds (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  collection  text        check (collection is null or char_length(collection) <= 60),
  reason      text        not null check (char_length(btrim(reason)) between 1 and 300),
  hidden_at   timestamptz not null default now(),
  constraint community_map_holds_one unique nulls not distinct (user_id, collection)
);
comment on table public.community_map_holds is
  '(community-maps) An administrator''s decision to take one (account, collection) out of Community maps, with the reason its owner reads. Lives on the collection, not on the share row: unpublishing and publishing again does not lift it. Written only by moderate_community_map(); the owner reads their own (and it is in their export); restoring deletes it.';
alter table public.community_map_holds enable row level security;
revoke all on table public.community_map_holds from public, anon, authenticated, service_role;
grant select on table public.community_map_holds to authenticated;
grant select, insert, update, delete on table public.community_map_holds to service_role;
drop policy if exists community_map_holds_read on public.community_map_holds;
create policy community_map_holds_read on public.community_map_holds
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE READINGS EVERY DOOR SHARES — one rule each, not one copy per door. SECURITY INVOKER and not callable
--     by the clients: the definer functions below call them with their own rights. (Left without a pinned
--     search_path so the planner can inline them into the directory's scan; every name in them is qualified.)
-- ─────────────────────────────────────────────────────────────────────────────
-- is (account, collection) held by an administrator?
create or replace function public.community_map_held(p_user uuid, p_collection text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.community_map_holds h where h.user_id = p_user and h.collection is not distinct from p_collection)
$$;
revoke execute on function public.community_map_held(uuid, text) from public, anon, authenticated;
grant  execute on function public.community_map_held(uuid, text) to service_role;

-- what (account, collection) holds: counts, the places' box, when it last changed, and the first map's camera
-- (`v=lng,lat,…` — js/map-state.js writes the camera first), which locates a collection of maps only
create or replace function public.community_map_contents(p_user uuid, p_collection text)
returns table (n_places integer, n_maps integer, n_tours integer, w double precision, s double precision,
               e double precision, n double precision, changed timestamptz, cam_lng double precision, cam_lat double precision)
language sql
stable
as $$
  select pl.n, vw.n, vw.tours, pl.w, pl.s, pl.e, pl.nn, greatest(pl.upd, vw.upd), fv.cam_lng, fv.cam_lat
    from (select count(*)::integer as n, min(sp.lng) as w, min(sp.lat) as s, max(sp.lng) as e, max(sp.lat) as nn, max(sp.updated_at) as upd
            from public.saved_places sp
           where sp.user_id = p_user and (p_collection is null or sp.collection = p_collection)) pl,
         (select count(*)::integer as n,
                 count(*) filter (where sv.steps is not null and jsonb_array_length(sv.steps) > 1)::integer as tours,
                 max(sv.updated_at) as upd
            from public.saved_views sv
           where sv.user_id = p_user and (p_collection is null or sv.collection = p_collection)) vw
    left join lateral (
          select substring(f.state from '^v=(-?[0-9]+(?:\.[0-9]+)?),')::double precision as cam_lng,
                 substring(f.state from '^v=-?[0-9]+(?:\.[0-9]+)?,(-?[0-9]+(?:\.[0-9]+)?)')::double precision as cam_lat
            from public.saved_views f
           where f.user_id = p_user and (p_collection is null or f.collection = p_collection)
           order by f.created_at, f.id limit 1) fv on true
$$;
revoke execute on function public.community_map_contents(uuid, text) from public, anon, authenticated;
grant  execute on function public.community_map_contents(uuid, text) to service_role;

-- does a collection touch the box [west, south, east, north]? Its places' box when it has places, else its first
-- map's camera. A box whose west is east of its east crosses the antimeridian (two boxes).
create or replace function public.community_map_in_box(p_places integer, p_w double precision, p_s double precision, p_e double precision,
                                                        p_n double precision, p_lng double precision, p_lat double precision, p_box double precision[])
returns boolean
language sql
immutable
as $$
  select case
    when p_box is null or array_length(p_box, 1) <> 4 then true
    when p_places > 0 then
      p_n >= p_box[2] and p_s <= p_box[4]
      and (case when p_box[1] <= p_box[3] then p_e >= p_box[1] and p_w <= p_box[3] else p_e >= p_box[1] or p_w <= p_box[3] end)
    when p_lng is null or p_lat is null then false
    else p_lat between p_box[2] and p_box[4]
      and (case when p_box[1] <= p_box[3] then p_lng between p_box[1] and p_box[3] else p_lng >= p_box[1] or p_lng <= p_box[3] end)
  end
$$;
revoke execute on function public.community_map_in_box(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision[]) from public, anon, authenticated;
grant  execute on function public.community_map_in_box(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision[]) to service_role;

-- the listed collection a share was built on, as the public may see it: only while it is listed and not held
create or replace function public.community_map_origin(p_origin uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('title', o.title, 'author', o.author_name, 'token', o.token)
    from public.collection_shares o
   where o.id = p_origin and o.listed_at is not null and not public.community_map_held(o.user_id, o.collection)
$$;
revoke execute on function public.community_map_origin(uuid) from public, anon, authenticated;
grant  execute on function public.community_map_origin(uuid) to service_role;

-- how many listed, unheld collections were built on a share
create or replace function public.community_map_derived(p_share uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer from public.collection_shares d
   where d.derived_from = p_share and d.listed_at is not null and not public.community_map_held(d.user_id, d.collection)
$$;
revoke execute on function public.community_map_derived(uuid) from public, anon, authenticated;
grant  execute on function public.community_map_derived(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. LISTING AND UNLISTING — the owner's doors
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_community_map(
  p_collection text default null,
  p_author     text default null,
  p_summary    text default null,
  p_title      text default null
)
returns table (token text, listed boolean, derived_from_title text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_coll   text := case when p_collection is null then null else btrim(p_collection) end;
  v_author text := nullif(btrim(coalesce(p_author, '')), '');
  v_tok    text;
  sh       record;
  v_origin uuid;
begin
  if v_uid is null then
    raise exception 'list_community_map: sign-in required' using errcode = '42501';
  end if;
  -- THE HOLD IS ON THE COLLECTION: whichever share row it is published under now (a new one after unpublishing
  -- and publishing again), a held collection is not listed
  if public.community_map_held(v_uid, v_coll) then
    raise exception 'list_community_map: the operator has taken this collection out of Community maps' using errcode = '55000';
  end if;
  -- the collection is published first (the same door, the same «already published» answer); an empty one is
  -- refused there with 22023 — an empty card is not something to put in front of other readers
  select p.token into v_tok from public.publish_collection(v_coll, p_title) p;
  select c.id, c.listed_at, c.author_name, c.derived_from into sh
    from public.collection_shares c where c.token = v_tok and c.user_id = v_uid;
  v_author := coalesce(v_author, sh.author_name);
  if v_author is null then
    raise exception 'list_community_map: a name to show with the collection is required' using errcode = '22023';
  end if;
  -- LINEAGE: the most recent copy the caller filed into THIS collection (never for «everything», which is no one
  -- collection, and never the collection itself)
  v_origin := sh.derived_from;
  if v_origin is null and v_coll is not null then
    select k.share_id into v_origin from public.collection_copies k
     where k.user_id = v_uid and k.into_collection = v_coll and k.share_id <> sh.id
     order by k.copied_at desc limit 1;
  end if;

  update public.collection_shares c
     set listed_at          = coalesce(c.listed_at, now()),
         author_name        = v_author,
         summary            = coalesce(p_summary, c.summary),
         derived_from       = v_origin,
         content_updated_at = case when c.listed_at is null
                                   then coalesce((select b.changed from public.community_map_contents(v_uid, v_coll) b), now())
                                   else c.content_updated_at end
   where c.id = sh.id;

  token  := v_tok;
  listed := sh.listed_at is null;
  derived_from_title := (public.community_map_origin(v_origin)) ->> 'title';
  return next;
end;
$$;
comment on function public.list_community_map(text, text, text, text) is
  '(community-maps) Lists one collection (NULL = everything) of the signed-in caller in Community maps under p_author (required the first time; kept after) and p_summary, publishing it first through publish_collection() if it is not published (an empty collection is refused there, 22023). listed = false when it was already listed (the name and summary given are updated). Records the collection it was started from (the caller''s most recent copy filed into it). Refuses a collection an administrator holds (community_map_holds — on the collection, whichever share row it is published under; 55000). The only way a collection enters the directory.';
revoke execute on function public.list_community_map(text, text, text, text) from public, anon;
grant  execute on function public.list_community_map(text, text, text, text) to authenticated, service_role;

create or replace function public.unlist_community_map(p_collection text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_coll text := case when p_collection is null then null else btrim(p_collection) end;
  n      integer;
begin
  if v_uid is null then
    raise exception 'unlist_community_map: sign-in required' using errcode = '42501';
  end if;
  update public.collection_shares c set listed_at = null
   where c.user_id = v_uid and c.collection is not distinct from v_coll and c.listed_at is not null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
comment on function public.unlist_community_map(text) is
  '(community-maps) Takes one collection (NULL = everything) of the signed-in caller out of Community maps. The read-only link keeps working (stopping it is unpublishing — the owner''s DELETE). Returns false when it was not listed («already done», not an error).';
revoke execute on function public.unlist_community_map(text) from public, anon;
grant  execute on function public.unlist_community_map(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. THE DIRECTORY — the public read of the listed collections, a page at a time
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.community_maps(
  p_query  text    default null,
  p_sort   text    default 'new',
  p_limit  integer default 24,
  p_offset integer default 0,
  p_bbox   double precision[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q    text := nullif(btrim(coalesce(p_query, '')), '');
  v_pat  text;
  v_sort text := case when p_sort in ('new', 'reused', 'updated') then p_sort else 'new' end;
  v_lim  integer := least(50, greatest(1, coalesce(p_limit, 24)));
  v_off  integer := least(10000, greatest(0, coalesce(p_offset, 0)));
  v_box  double precision[] := case when p_bbox is not null and array_length(p_bbox, 1) = 4 then p_bbox else null end;
  v_ids  uuid[];
begin
  if v_q is not null then
    -- the reader's words are matched as words: %, _ and \ are escaped, not wildcards
    v_pat := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  -- ONE PAGE PLUS ONE ROW, in an indexed order (§1): the scan stops when the page is full. One branch per order,
  -- each ORDER BY exactly its index, so the planner can walk the index instead of sorting every listing.
  if v_sort = 'reused' then
    select array_agg(x.id order by x.ord) into v_ids from (
      select c.id, row_number() over () as ord from (
        select c.id from public.collection_shares c
         cross join lateral public.community_map_contents(c.user_id, c.collection) b
         where c.listed_at is not null and not public.community_map_held(c.user_id, c.collection)
           and (v_pat is null or c.title ilike v_pat or c.summary ilike v_pat or c.author_name ilike v_pat)
           and b.n_places + b.n_maps > 0
           and public.community_map_in_box(b.n_places, b.w, b.s, b.e, b.n, b.cam_lng, b.cam_lat, v_box)
         order by c.reused_count desc, c.listed_at desc, c.id
         limit v_lim + 1 offset v_off) c) x;
  elsif v_sort = 'updated' then
    select array_agg(x.id order by x.ord) into v_ids from (
      select c.id, row_number() over () as ord from (
        select c.id from public.collection_shares c
         cross join lateral public.community_map_contents(c.user_id, c.collection) b
         where c.listed_at is not null and not public.community_map_held(c.user_id, c.collection)
           and (v_pat is null or c.title ilike v_pat or c.summary ilike v_pat or c.author_name ilike v_pat)
           and b.n_places + b.n_maps > 0
           and public.community_map_in_box(b.n_places, b.w, b.s, b.e, b.n, b.cam_lng, b.cam_lat, v_box)
         order by c.content_updated_at desc, c.id
         limit v_lim + 1 offset v_off) c) x;
  else
    select array_agg(x.id order by x.ord) into v_ids from (
      select c.id, row_number() over () as ord from (
        select c.id from public.collection_shares c
         cross join lateral public.community_map_contents(c.user_id, c.collection) b
         where c.listed_at is not null and not public.community_map_held(c.user_id, c.collection)
           and (v_pat is null or c.title ilike v_pat or c.summary ilike v_pat or c.author_name ilike v_pat)
           and b.n_places + b.n_maps > 0
           and public.community_map_in_box(b.n_places, b.w, b.s, b.e, b.n, b.cam_lng, b.cam_lat, v_box)
         order by c.listed_at desc, c.id
         limit v_lim + 1 offset v_off) c) x;
  end if;

  return jsonb_build_object('ok', true, 'format', 'intmap-community-maps', 'version', 2,
    'sort', v_sort, 'offset', v_off, 'limit', v_lim,
    'has_more', coalesce(array_length(v_ids, 1), 0) > v_lim,
    -- the page's cards, shaped only for the rows on the page
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'token', c.token, 'title', c.title, 'summary', c.summary, 'author', c.author_name,
               'listed_at', c.listed_at, 'updated_at', b.changed,
               'places', b.n_places, 'maps', b.n_maps, 'tours', b.n_tours,
               'lng', case when b.n_places > 0 then (b.w + b.e) / 2 else b.cam_lng end,
               'lat', case when b.n_places > 0 then (b.s + b.n) / 2 else b.cam_lat end,
               'bbox', case when b.n_places > 0 then jsonb_build_array(b.w, b.s, b.e, b.n) else null end,
               'reused', c.reused_count, 'derived', public.community_map_derived(c.id),
               'based_on', public.community_map_origin(c.derived_from))
             order by p.ord)
        from unnest(v_ids[1:v_lim]) with ordinality p(id, ord)
        join public.collection_shares c on c.id = p.id
        cross join lateral public.community_map_contents(c.user_id, c.collection) b), '[]'::jsonb));
end;
$$;
comment on function public.community_maps(text, text, integer, integer, double precision[]) is
  '(community-maps) The directory, a page at a time: the collections their owners listed in Community maps and no administrator holds — title, summary, the author name the owner typed for the listing, counts of places / maps / tours, a centre and box on the globe, how many OTHER accounts kept a copy (reused), how many listed collections were built on it (derived), and the listed collection it was built on (based_on — only while that one is listed and not held). Matched by words (p_query, as words), sorted new | reused | updated (each an index), optionally only those touching p_bbox [west, south, east, north]; at most 50 a page and has_more instead of a total (the read stops at the page). Never an id, an account or an e-mail; the token is the link the owner published. ANON MAY CALL: it returns only what owners explicitly listed for everyone to find, and counts that name no person.';
revoke execute on function public.community_maps(text, text, integer, integer, double precision[]) from public;
grant  execute on function public.community_maps(text, text, integer, integer, double precision[]) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  6b. THE PUBLIC READ OF ONE COLLECTION — unchanged, plus `listing` when it is listed
-- ─────────────────────────────────────────────────────────────────────────────
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
  select c.id, c.user_id, c.collection, c.title, c.created_at, c.listed_at, c.author_name, c.summary, c.derived_from, c.reused_count into sh
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
                                          'state', v.state, 'kind', v.kind, 'steps', v.steps) order by v.created_at, v.id)
        from public.saved_views v
       where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)), '[]'::jsonb),
    'updated_at', greatest(
      (select max(s.updated_at) from public.saved_places s where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)),
      (select max(v.updated_at) from public.saved_views  v where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection))),
    -- (community-maps) what the directory says about it — only while it is listed and not held
    'listing', case when sh.listed_at is not null and not public.community_map_held(sh.user_id, sh.collection) then jsonb_build_object(
      'author',    sh.author_name,
      'summary',   sh.summary,
      'listed_at', sh.listed_at,
      'reused',    sh.reused_count,
      'derived',   public.community_map_derived(sh.id),
      'based_on',  public.community_map_origin(sh.derived_from))
      else null end
  );
end;
$$;
comment on function public.shared_collection(text) is
  '(collection-workspace, map-document-unify, community-maps) The public read of a published collection: its title and, as they are now, its places (name, note, collection, position, zoom) and maps (name, note, collection, share-link fragment, kind, and the steps of a tour or Atlas answer) — and, while it is listed in Community maps and not held, its listing (author name, summary, reused, derived, and the listed collection it was started from). Never an id, an account or an e-mail. {ok:false,error:not_found} for a token that is not published. ANON MAY CALL: a published collection is public by the owner''s explicit act (publish_collection), the 122-bit token is the access control, and the function returns only what the owner filed in that collection and chose to list.';
revoke execute on function public.shared_collection(text) from public;
grant  execute on function public.shared_collection(text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  7. COPYING — unchanged, plus the receipt (map_documents' version, whole)
-- ─────────────────────────────────────────────────────────────────────────────
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
  select c.id, c.user_id, c.collection, c.title into sh from public.collection_shares c where c.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_into := left(btrim(coalesce(nullif(btrim(coalesce(p_into, '')), ''), sh.title)), 60);

  -- the fences, counted on what would be NEW (a position / a document the reader does not hold yet)
  select count(*) into v_np from public.saved_places s
   where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)
     and not exists (select 1 from public.saved_places m where m.user_id = v_uid and m.lng5 = s.lng5 and m.lat5 = s.lat5);
  select count(*) into v_nv from public.saved_views v
   where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)
     and not exists (select 1 from public.saved_views m where m.user_id = v_uid and m.doc_md5 = v.doc_md5);
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

  insert into public.saved_views (user_id, name, note, collection, state, kind, steps)
  select v_uid, v.name, v.note, v_into, v.state, v.kind, v.steps
    from public.saved_views v
   where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)
  on conflict (user_id, doc_md5) do nothing;
  get diagnostics v_av = row_count;

  -- (community-maps) THE RECEIPT: this account kept this collection, filed under v_into. One row per (share,
  -- account) — a second copy moves the receipt to where it was filed last. The owner keeping their own is not reuse.
  if v_uid <> sh.user_id then
    insert into public.collection_copies (share_id, user_id, into_collection)
    values (sh.id, v_uid, v_into)
    on conflict (share_id, user_id) do update set into_collection = excluded.into_collection, copied_at = now();
  end if;

  select count(*) into v_hp from public.saved_places s where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection);
  select count(*) into v_hv from public.saved_views  v where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection);

  return jsonb_build_object('ok', true, 'collection', v_into,
    'places_added', v_ap, 'places_had', v_hp - v_ap,
    'views_added',  v_av, 'views_had',  v_hv - v_av);
end;
$$;
comment on function public.copy_shared_collection(text, text) is
  '(collection-workspace, map-document-unify, community-maps) Copies a published collection into the signed-in caller''s own places and maps (tours and Atlas answers with their steps), filed under p_into (default: the collection''s title), and leaves the copy receipt (collection_copies — one per collection and account; not for the owner''s own). What the caller already holds (same position / same document) is left as it is and counted as had — copying twice equals copying once. Enforces saved_places_limit() and saved_views_limit() on what is new (54000).';
revoke execute on function public.copy_shared_collection(text, text) from public, anon;
grant  execute on function public.copy_shared_collection(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
--  8. THE OWNER'S REACH — per own share, how many others kept it and how many were started from it
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.my_collection_reach()
returns table (share_id uuid, reused integer, derived integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.reused_count, public.community_map_derived(c.id)
    from public.collection_shares c
   where c.user_id = (select auth.uid())
$$;
comment on function public.my_collection_reach() is
  '(community-maps) For each collection the signed-in caller published: how many other accounts kept a copy (reused — collection_shares.reused_count, kept by the receipts'' trigger) and how many listed collections were started from it (derived). Counts only — never who.';
revoke execute on function public.my_collection_reach() from public, anon;
grant  execute on function public.my_collection_reach() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  9. REPORTING AND MODERATION — on (account, collection)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.report_community_map(p_token text, p_reason text, p_note text default null)
returns table (created boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  sh    record;
  v_sub uuid;
begin
  if v_uid is null then
    raise exception 'report_community_map: sign-in required' using errcode = '42501';
  end if;
  select c.user_id, c.collection, c.title into sh from public.collection_shares c
   where c.token = p_token and c.listed_at is not null;
  if not found then
    -- only what is in the directory is reported here; a link-only collection is its owner's own distribution
    raise exception 'report_community_map: that collection is not listed in Community maps' using errcode = 'P0002';
  end if;
  if sh.user_id = v_uid then
    raise exception 'report_community_map: this is your own collection' using errcode = '22023';
  end if;
  insert into public.community_map_subjects as s (owner, collection) values (sh.user_id, sh.collection)
  on conflict on constraint community_map_subjects_one do update set owner = s.owner
  returning s.id into v_sub;
  insert into public.community_map_reports as r (subject_id, user_id, title, reason, note)
  values (v_sub, v_uid, left(sh.title, 120), p_reason, left(coalesce(p_note, ''), 1000))
  on conflict (subject_id, user_id) do update set title = excluded.title, reason = excluded.reason, note = excluded.note, created_at = now(),
     status = case when r.status = 'dismissed' then 'open' else r.status end
  returning (r.xmax = 0) into created;
  return next;
end;
$$;
comment on function public.report_community_map(text, text, text) is
  '(community-maps) A signed-in reader reports a collection listed in Community maps: a reason (spam | offensive | personal_info | copyright | misleading | other — the CHECK refuses others, 23514) and a note. The report is on the collection (community_map_subjects), not its share row, so unpublishing does not remove it. One report per collection and account; reporting again updates it (created = false) and reopens a dismissed one. Not one''s own (22023); only listed collections (P0002). The only way a row enters public.community_map_reports or public.community_map_subjects.';
revoke execute on function public.report_community_map(text, text, text) from public, anon;
grant  execute on function public.report_community_map(text, text, text) to authenticated, service_role;

-- the queue: every reported or held (account, collection), with what it is now (the share it is published under,
-- if any) and every report on it — never who sent one. `ref` is what moderate_community_map() takes.
create or replace function public.community_map_reports_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'community_map_reports_admin: administrators only' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(q order by q->>'last_at' desc)
      from (
        select jsonb_build_object(
                 'ref', s.id,
                 'title', coalesce(c.title, (select r.title from public.community_map_reports r where r.subject_id = s.id order by r.created_at desc limit 1)),
                 'author', c.author_name, 'summary', c.summary,
                 'published', c.id is not null, 'listed', c.listed_at is not null,
                 'hidden_at', h.hidden_at, 'hidden_reason', h.reason,
                 'open',  (select count(*) from public.community_map_reports r where r.subject_id = s.id and r.status = 'open'),
                 'total', (select count(*) from public.community_map_reports r where r.subject_id = s.id),
                 'reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
                                        from public.community_map_reports r where r.subject_id = s.id), '[]'::jsonb),
                 'last_at', greatest(h.hidden_at, (select max(r.created_at) from public.community_map_reports r where r.subject_id = s.id))) as q
          from public.community_map_subjects s
          left join public.collection_shares c on c.user_id = s.owner and c.collection is not distinct from s.collection
          left join public.community_map_holds h on h.user_id = s.owner and h.collection is not distinct from s.collection
         where h.user_id is not null or exists (select 1 from public.community_map_reports r where r.subject_id = s.id)) x), '[]'::jsonb);
end;
$$;
comment on function public.community_map_reports_admin() is
  '(community-maps) The moderation queue: every reported or held collection (account, collection — whether or not it is published right now) with its current title, author name and summary, whether it is published, listed or held (and why), how many reports are open, and each report''s reason, note, status and time (never who sent it). `ref` is what moderate_community_map() takes. Administrators only (42501 for anyone else).';
revoke execute on function public.community_map_reports_admin() from public, anon;
grant  execute on function public.community_map_reports_admin() to authenticated, service_role;

-- p_ref: a queue entry's `ref`, or the token of the share the collection is published under now
create or replace function public.moderate_community_map(p_ref text, p_action text, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid; v_coll text; v_sub uuid; v_found boolean := false;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'moderate_community_map: administrators only' using errcode = '42501';
  end if;
  if p_action not in ('hide', 'restore', 'dismiss') then
    raise exception 'moderate_community_map: the action is hide, restore or dismiss' using errcode = '22023';
  end if;
  if p_ref ~ '^[0-9a-f]{32}$' then
    select c.user_id, c.collection, true into v_owner, v_coll, v_found from public.collection_shares c where c.token = p_ref;
  elsif p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select s.owner, s.collection, true into v_owner, v_coll, v_found from public.community_map_subjects s where s.id = p_ref::uuid;
  end if;
  if not coalesce(v_found, false) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select s.id into v_sub from public.community_map_subjects s where s.owner = v_owner and s.collection is not distinct from v_coll;
  if p_action = 'hide' and v_sub is null then
    -- held without a report (named by its token): the queue lists subjects, so the held collection gets one
    insert into public.community_map_subjects as s (owner, collection) values (v_owner, v_coll)
    on conflict on constraint community_map_subjects_one do update set owner = s.owner
    returning s.id into v_sub;
  end if;
  if p_action = 'hide' then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      -- the owner is told why: a hide without a reason is not something to tell them
      raise exception 'moderate_community_map: hiding needs a reason the owner will read' using errcode = '22023';
    end if;
    insert into public.community_map_holds as h (user_id, collection, reason) values (v_owner, v_coll, left(btrim(p_reason), 300))
    on conflict on constraint community_map_holds_one do update set reason = excluded.reason;
    update public.community_map_reports r set status = 'actioned' where r.subject_id = v_sub and r.status = 'open';
  elsif p_action = 'restore' then
    delete from public.community_map_holds h where h.user_id = v_owner and h.collection is not distinct from v_coll;
  else
    update public.community_map_reports r set status = 'dismissed' where r.subject_id = v_sub and r.status = 'open';
  end if;
  return jsonb_build_object('ok', true, 'action', p_action);
end;
$$;
comment on function public.moderate_community_map(text, text, text) is
  '(community-maps) An administrator settles a reported collection, named by a queue entry''s ref or by the token it is published under: hide (a hold on the collection — out of Community maps whichever share row it is published under, and the owner cannot list it again; needs a reason the owner reads; open reports become actioned), restore (the hold is lifted), or dismiss (open reports become dismissed). The link is not touched. Administrators only (42501).';
revoke execute on function public.moderate_community_map(text, text, text) from public, anon;
grant  execute on function public.moderate_community_map(text, text, text) to authenticated, service_role;

-- RETENTION (daily): a settled report 730 days after it was sent (the header says why that number); a subject
-- nothing names any more, or whose owner's account is gone (its holds went with the account).
create or replace function public.purge_community_map_reports(p_settled_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer; m integer;
begin
  delete from public.community_map_reports r
   where r.status <> 'open' and r.created_at < now() - make_interval(days => greatest(1, coalesce(p_settled_days, 730)));
  get diagnostics n = row_count;
  delete from public.community_map_subjects s
   where not exists (select 1 from auth.users u where u.id = s.owner)
      or (not exists (select 1 from public.community_map_reports r where r.subject_id = s.id)
          and not exists (select 1 from public.community_map_holds h where h.user_id = s.owner and h.collection is not distinct from s.collection));
  get diagnostics m = row_count;
  return n + m;
end;
$$;
comment on function public.purge_community_map_reports(integer) is
  '(community-maps) Deletes settled Community maps reports p_settled_days (730) after they were sent, and subjects no report or hold names or whose owner''s account is gone (their reports go with them). Open reports and holds are kept. service_role only (pg_cron).';
revoke execute on function public.purge_community_map_reports(integer) from public, anon, authenticated;
grant  execute on function public.purge_community_map_reports(integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the community-map-reports-purge schedule';
    return;
  end if;
  perform cron.schedule('community-map-reports-purge', '53 3 * * *', 'select public.purge_community_map_reports(730)');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  10. THEIR SENTENCES IN THE ACCOUNT'S DATA CATALOGUE (community_map_subjects is not owned by an account — header)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('collection_copies', 'you',
   'Collections you kept a copy of', '写したコレクション',
   'Which published collections you copied into your Library, and the collection you filed each copy under. Its owner sees only how many accounts kept a copy, never which; it is how a collection you list from a copy names the one it was started from.',
   'ライブラリに写した公開コレクションと、写した先のコレクション名。持ち主には写したアカウントの数だけが見え、誰かは見えません。写したものから掲載したコレクションに「元にした地図」を示すために使います。',
   'Kept until the collection stops being published or you delete your account.',
   'そのコレクションの公開が終わるか、アカウントを削除するまで保持します。'),
  ('community_map_reports', 'you',
   'Community map reports', 'みんなの地図への報告',
   'The collections in Community maps you reported, with the title you saw, the reason and note you gave. Read only by IntMap''s administrators; the collection''s owner never sees who reported it.',
   'みんなの地図で報告したコレクションと、そのとき見た題・理由・メモ。IntMap の管理者だけが読み、コレクションの持ち主には誰が報告したかは見えません。',
   'Kept until you delete your account; once an administrator has settled it, deleted 730 days after you sent it.',
   'アカウントを削除するまで保持します。管理者が対応を終えた報告は、送信から 730 日後に削除します。'),
  ('community_map_holds', 'intmap',
   'Collections taken out of Community maps', 'みんなの地図から外されたコレクション',
   'A collection of yours that IntMap''s administrators took out of Community maps, with the reason they gave. It cannot be listed again while this stands; its link keeps working.',
   'IntMap の管理者がみんなの地図から外したあなたのコレクションと、その理由。これがある間は再び掲載できません。リンクは引き続き使えます。',
   'Kept until an administrator lifts it or you delete your account.',
   '管理者が解除するか、アカウントを削除するまで保持します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;

update public.account_data_catalog set
  purpose_en = 'The collections you published as a read-only link (which collection, its title, the link) and, for those you listed in Community maps, the name you chose to show, the summary and the collection it was started from. Anyone with the link sees its places and maps as they are now, never your account or e-mail; a listed one can be found by anyone.',
  purpose_jp = '閲覧専用リンクとして公開したコレクション（どれか・題・リンク）と、みんなの地図に掲載したものの表示名・紹介文・元にしたコレクション。リンクを知っている人は誰でも、その場所と地図を今の内容で見られます（アカウントやメールアドレスは見えません）。掲載したものは誰でも見つけられます。',
  retention_en = 'Kept until you stop publishing the collection or delete your account; the link stops working at once. Taking it out of Community maps keeps the link.',
  retention_jp = '公開をやめるかアカウントを削除するまで保持します。やめた時点でリンクは開けなくなります。みんなの地図から外してもリンクは残ります。'
where tbl = 'collection_shares';
