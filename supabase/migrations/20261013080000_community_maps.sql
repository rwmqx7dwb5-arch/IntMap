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
--    · THE DIRECTORY. community_maps() — anon may call it — returns the listed collections that are not hidden:
--      title, summary, the author name, counts of places / maps / tours, where on the globe it is (from the
--      places it holds, else its first map's camera), and two numbers that measure reuse without measuring a
--      person: how many OTHER accounts kept a copy (reused) and how many listed collections were started from
--      it (derived). Search by words, sort by newest / most reused / recently updated, or ask only for the
--      ones about an area. No id, account or e-mail; the token returned is the link the owner made public.
--    · REUSE. copy_shared_collection() now leaves a receipt — collection_copies (share, account, the collection
--      it was filed under). One row per (share, account): copying twice is still once. It is the copier's own
--      row (they read it, it is in their export and goes with their account); an owner sees only the count.
--    · LINEAGE. A collection listed by someone who filled it from a copy says so: list_community_map() sets
--      derived_from to the share the caller copied INTO that collection (most recent). The directory names the
--      original (title, author, link) ONLY while the original is itself listed and not hidden — an unlisted
--      original's link is never disclosed through somebody else's listing.
--    · REPORTS AND MODERATION. A signed-in reader reports a listed collection (community_map_reports, one per
--      account per collection, via report_community_map()); an administrator reads the queue
--      (community_map_reports_admin()) and hides, restores or dismisses (moderate_community_map()). A hidden
--      collection leaves the directory and cannot be listed again by its owner; its link — the owner's own
--      distribution, as before this migration — is not touched. The owner sees that it was hidden and why.
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
--  RETENTION: a report lives as long as the listing it is about (cascade from collection_shares) or the
--  reporter's account; a copy receipt as long as the share and the copier's account. Both are stated in the
--  account data catalogue below and in the privacy policy (js/legal-text.js).
--
--  ⚠ NON-DESTRUCTIVE: six new nullable / defaulted columns on collection_shares, two new tables, seven new
--    functions, two functions REPLACED with their old behaviour kept whole (shared_collection gains a `listing`
--    key; copy_shared_collection gains the receipt), three catalogue rows. No row changes. BLAST RADIUS of the
--    replacements: opening and copying a published collection — supabase/tests/24, 29 and 38 hold them.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. LISTING — the owner's second, explicit decision, on the share itself
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.collection_shares add column if not exists listed_at     timestamptz;
alter table public.collection_shares add column if not exists author_name   text;
alter table public.collection_shares add column if not exists summary       text not null default '';
alter table public.collection_shares add column if not exists derived_from  uuid references public.collection_shares(id) on delete set null;
alter table public.collection_shares add column if not exists hidden_at     timestamptz;
alter table public.collection_shares add column if not exists hidden_reason text;

alter table public.collection_shares drop constraint if exists collection_shares_author_check;
alter table public.collection_shares add constraint collection_shares_author_check
  check (author_name is null or (char_length(btrim(author_name)) between 1 and 40 and author_name !~ '[[:cntrl:]]'));
alter table public.collection_shares drop constraint if exists collection_shares_summary_check;
alter table public.collection_shares add constraint collection_shares_summary_check check (char_length(summary) <= 500);
alter table public.collection_shares drop constraint if exists collection_shares_hidden_reason_check;
alter table public.collection_shares add constraint collection_shares_hidden_reason_check
  check (hidden_reason is null or char_length(hidden_reason) <= 300);
-- a listed collection always has the name it is listed under
alter table public.collection_shares drop constraint if exists collection_shares_listed_has_author;
alter table public.collection_shares add constraint collection_shares_listed_has_author check (listed_at is null or author_name is not null);
alter table public.collection_shares drop constraint if exists collection_shares_not_own_origin;
alter table public.collection_shares add constraint collection_shares_not_own_origin check (derived_from is null or derived_from <> id);

create index if not exists collection_shares_listed_idx  on public.collection_shares (listed_at desc) where listed_at is not null and hidden_at is null;
create index if not exists collection_shares_derived_idx on public.collection_shares (derived_from) where derived_from is not null;
-- ⚠ the column grant is unchanged: the owner may still UPDATE (title) only — listing, the author name, the
--   summary, the lineage and the operator's hiding are written through the functions below.

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
  '(community-maps) One row per (published collection, account that kept a copy of it): the collection the copy was filed under and when. Written only by copy_shared_collection(); the copier reads their own rows; a collection''s owner sees only the count (my_collection_reach, community_maps). Owned via user_id, so the export and account deletion cover it; it goes with the share.';

alter table public.collection_copies enable row level security;
revoke all on table public.collection_copies from public, anon, authenticated, service_role;
grant select on table public.collection_copies to authenticated;
grant select, insert, update, delete on table public.collection_copies to service_role;
drop policy if exists collection_copies_owner_select on public.collection_copies;
create policy collection_copies_owner_select on public.collection_copies
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
--  3. REPORTS — a signed-in reader's word to the operator about a listed collection
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.community_map_reports (
  share_id    uuid        not null references public.collection_shares(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  reason      text        not null check (reason in ('spam', 'offensive', 'personal_info', 'copyright', 'misleading', 'other')),
  note        text        not null default '' check (char_length(note) <= 1000),
  status      text        not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at  timestamptz not null default now(),
  primary key (share_id, user_id)
);
create index if not exists community_map_reports_open_idx on public.community_map_reports (share_id) where status = 'open';
comment on table public.community_map_reports is
  '(community-maps) A signed-in reader''s report that a collection listed in Community maps should not be there: why (a closed vocabulary) and a note. One per (collection, account) — reporting again updates it. Written only by report_community_map(); the reporter reads their own; an administrator reads the queue through community_map_reports_admin() and settles it through moderate_community_map(). The owner of the collection never sees who reported it.';

alter table public.community_map_reports enable row level security;
revoke all on table public.community_map_reports from public, anon, authenticated, service_role;
grant select on table public.community_map_reports to authenticated;
grant select, insert, update, delete on table public.community_map_reports to service_role;
drop policy if exists community_map_reports_read on public.community_map_reports;
create policy community_map_reports_read on public.community_map_reports
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
--  4. LISTING AND UNLISTING — the owner's doors
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
  -- the collection is published first (the same door, the same «already published» answer); an empty one is
  -- refused there with 22023 — an empty card is not something to put in front of other readers
  select p.token into v_tok from public.publish_collection(v_coll, p_title) p;
  select c.id, c.listed_at, c.author_name, c.hidden_at, c.derived_from into sh
    from public.collection_shares c where c.token = v_tok and c.user_id = v_uid;
  if sh.hidden_at is not null then
    raise exception 'list_community_map: the operator has hidden this collection from Community maps' using errcode = '55000';
  end if;
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
     set listed_at    = coalesce(c.listed_at, now()),
         author_name  = v_author,
         summary      = coalesce(p_summary, c.summary),
         derived_from = v_origin
   where c.id = sh.id;

  token  := v_tok;
  listed := sh.listed_at is null;
  derived_from_title := (select o.title from public.collection_shares o where o.id = v_origin and o.listed_at is not null and o.hidden_at is null);
  return next;
end;
$$;
comment on function public.list_community_map(text, text, text, text) is
  '(community-maps) Lists one collection (NULL = everything) of the signed-in caller in Community maps under p_author (required the first time; kept after) and p_summary, publishing it first through publish_collection() if it is not published (an empty collection is refused there, 22023). listed = false when it was already listed (the name and summary given are updated). Records the collection it was started from (the caller''s most recent copy filed into it). Refuses a collection the operator hid (55000). The only way a collection enters the directory.';
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
--  5. THE DIRECTORY — the public read of the listed collections
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
  v_q     text := nullif(btrim(coalesce(p_query, '')), '');
  v_pat   text;
  v_sort  text := case when p_sort in ('new', 'reused', 'updated') then p_sort else 'new' end;
  v_lim   integer := least(50, greatest(1, coalesce(p_limit, 24)));
  v_off   integer := least(10000, greatest(0, coalesce(p_offset, 0)));
  v_bbox  boolean := p_bbox is not null and array_length(p_bbox, 1) = 4;
  v_total integer;
  v_items jsonb;
begin
  if v_q is not null then
    -- the reader's words are matched as words: %, _ and \ are escaped, not wildcards
    v_pat := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with listed as (
    select c.id, c.user_id, c.collection, c.token, c.title, c.summary, c.author_name, c.listed_at, c.derived_from
      from public.collection_shares c
     where c.listed_at is not null and c.hidden_at is null
       and (v_pat is null or c.title ilike v_pat or c.summary ilike v_pat or c.author_name ilike v_pat)
  ), shaped as (
    select l.*,
           pl.n  as n_places, pl.w, pl.s, pl.e, pl.nn, pl.upd as p_upd,
           vw.n  as n_maps, vw.tours as n_tours, vw.upd as v_upd, vw.cam_lng, vw.cam_lat,
           (select count(*) from public.collection_copies k where k.share_id = l.id and k.user_id <> l.user_id)::integer as reused,
           (select count(*) from public.collection_shares d where d.derived_from = l.id and d.listed_at is not null and d.hidden_at is null)::integer as derived
      from listed l
      cross join lateral (
        select count(*)::integer as n, min(sp.lng) as w, min(sp.lat) as s, max(sp.lng) as e, max(sp.lat) as nn, max(sp.updated_at) as upd
          from public.saved_places sp
         where sp.user_id = l.user_id and (l.collection is null or sp.collection = l.collection)) pl
      cross join lateral (
        select count(*)::integer as n,
               count(*) filter (where sv.steps is not null and jsonb_array_length(sv.steps) > 1)::integer as tours,
               max(sv.updated_at) as upd,
               -- the first map's camera (`v=lng,lat,…` — js/map-state.js writes the camera first) locates a
               -- collection that holds maps but no places
               (array_agg((substring(sv.state from '^v=(-?[0-9]+(?:\.[0-9]+)?),'))::double precision order by sv.created_at, sv.id))[1] as cam_lng,
               (array_agg((substring(sv.state from '^v=-?[0-9]+(?:\.[0-9]+)?,(-?[0-9]+(?:\.[0-9]+)?)'))::double precision order by sv.created_at, sv.id))[1] as cam_lat
          from public.saved_views sv
         where sv.user_id = l.user_id and (l.collection is null or sv.collection = l.collection)) vw
  ), located as (
    select sh.*,
           case when sh.n_places > 0 then (sh.w + sh.e) / 2 else sh.cam_lng end as c_lng,
           case when sh.n_places > 0 then (sh.s + sh.nn) / 2 else sh.cam_lat end as c_lat
      from shaped sh
     where sh.n_places + sh.n_maps > 0
  ), kept as (
    select * from located x
     where not v_bbox or (
       x.c_lat is not null and x.c_lng is not null
       and (case when x.n_places > 0 then x.nn >= p_bbox[2] and x.s <= p_bbox[4] else x.c_lat between p_bbox[2] and p_bbox[4] end)
       and (case
              -- a box that crosses the antimeridian (west > east) is two boxes
              when p_bbox[1] <= p_bbox[3] then
                (case when x.n_places > 0 then x.e >= p_bbox[1] and x.w <= p_bbox[3] else x.c_lng between p_bbox[1] and p_bbox[3] end)
              else
                (case when x.n_places > 0 then x.e >= p_bbox[1] or x.w <= p_bbox[3] else x.c_lng >= p_bbox[1] or x.c_lng <= p_bbox[3] end)
            end))
  )
  select (select count(*) from kept)::integer,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'token', k.token, 'title', k.title, 'summary', k.summary, 'author', k.author_name,
                    'listed_at', k.listed_at, 'updated_at', greatest(k.p_upd, k.v_upd),
                    'places', k.n_places, 'maps', k.n_maps, 'tours', k.n_tours,
                    'lng', k.c_lng, 'lat', k.c_lat,
                    'bbox', case when k.n_places > 0 then jsonb_build_array(k.w, k.s, k.e, k.nn) else null end,
                    'reused', k.reused, 'derived', k.derived,
                    'based_on', (select jsonb_build_object('title', o.title, 'author', o.author_name, 'token', o.token)
                                   from public.collection_shares o
                                  where o.id = k.derived_from and o.listed_at is not null and o.hidden_at is null))
                  order by
                    case when v_sort = 'reused'  then k.reused end desc nulls last,
                    case when v_sort = 'updated' then greatest(k.p_upd, k.v_upd) end desc nulls last,
                    k.listed_at desc, k.token)
             from (select * from kept
                    order by case when v_sort = 'reused'  then kept.reused end desc nulls last,
                             case when v_sort = 'updated' then greatest(kept.p_upd, kept.v_upd) end desc nulls last,
                             kept.listed_at desc, kept.token
                    limit v_lim offset v_off) k), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('ok', true, 'format', 'intmap-community-maps', 'version', 1,
                            'sort', v_sort, 'total', v_total, 'offset', v_off, 'limit', v_lim, 'items', v_items);
end;
$$;
comment on function public.community_maps(text, text, integer, integer, double precision[]) is
  '(community-maps) The directory: the collections their owners listed in Community maps and the operator has not hidden — title, summary, the author name the owner typed for the listing, counts of places / maps / tours, a centre and box on the globe, how many OTHER accounts kept a copy (reused), how many listed collections were started from it (derived), and the listed collection it was started from (based_on — only while that one is listed itself). Matched by words (p_query, as words), sorted new | reused | updated, optionally only those touching p_bbox [west, south, east, north]; at most 50 a page. Never an id, an account or an e-mail; the token is the link the owner published. ANON MAY CALL: it returns only what owners explicitly listed for everyone to find, and counts that name no person.';
revoke execute on function public.community_maps(text, text, integer, integer, double precision[]) from public;
grant  execute on function public.community_maps(text, text, integer, integer, double precision[]) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. THE PUBLIC READ OF ONE COLLECTION — unchanged, plus `listing` when it is listed
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
  select c.id, c.user_id, c.collection, c.title, c.created_at, c.listed_at, c.hidden_at, c.author_name, c.summary, c.derived_from into sh
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
    -- (community-maps) what the directory says about it — only while it is listed and not hidden
    'listing', case when sh.listed_at is not null and sh.hidden_at is null then jsonb_build_object(
      'author',    sh.author_name,
      'summary',   sh.summary,
      'listed_at', sh.listed_at,
      'reused',    (select count(*) from public.collection_copies k where k.share_id = sh.id and k.user_id <> sh.user_id),
      'derived',   (select count(*) from public.collection_shares d where d.derived_from = sh.id and d.listed_at is not null and d.hidden_at is null),
      'based_on',  (select jsonb_build_object('title', o.title, 'author', o.author_name, 'token', o.token)
                      from public.collection_shares o
                     where o.id = sh.derived_from and o.listed_at is not null and o.hidden_at is null))
      else null end
  );
end;
$$;
comment on function public.shared_collection(text) is
  '(collection-workspace, map-document-unify, community-maps) The public read of a published collection: its title and, as they are now, its places (name, note, collection, position, zoom) and maps (name, note, collection, share-link fragment, kind, and the steps of a tour or Atlas answer) — and, while it is listed in Community maps and not hidden, its listing (author name, summary, reused, derived, and the listed collection it was started from). Never an id, an account or an e-mail. {ok:false,error:not_found} for a token that is not published. ANON MAY CALL: a published collection is public by the owner''s explicit act (publish_collection), the 122-bit token is the access control, and the function returns only what the owner filed in that collection and chose to list.';
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
--  8. THE OWNER'S REACH — per own share, how many others kept it and how many were started from it
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.my_collection_reach()
returns table (share_id uuid, reused integer, derived integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         (select count(*) from public.collection_copies k where k.share_id = c.id and k.user_id <> c.user_id)::integer,
         (select count(*) from public.collection_shares d where d.derived_from = c.id and d.listed_at is not null and d.hidden_at is null)::integer
    from public.collection_shares c
   where c.user_id = (select auth.uid())
$$;
comment on function public.my_collection_reach() is
  '(community-maps) For each collection the signed-in caller published: how many other accounts kept a copy (reused) and how many listed collections were started from it (derived). Counts only — never who. SECURITY DEFINER because the copy receipts are their copiers'' rows.';
revoke execute on function public.my_collection_reach() from public, anon;
grant  execute on function public.my_collection_reach() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  9. REPORTING AND MODERATION
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
begin
  if v_uid is null then
    raise exception 'report_community_map: sign-in required' using errcode = '42501';
  end if;
  select c.id, c.user_id into sh from public.collection_shares c
   where c.token = p_token and c.listed_at is not null;
  if not found then
    -- only what is in the directory is reported here; a link-only collection is its owner's own distribution
    raise exception 'report_community_map: that collection is not listed in Community maps' using errcode = 'P0002';
  end if;
  if sh.user_id = v_uid then
    raise exception 'report_community_map: this is your own collection' using errcode = '22023';
  end if;
  insert into public.community_map_reports as r (share_id, user_id, reason, note)
  values (sh.id, v_uid, p_reason, left(coalesce(p_note, ''), 1000))
  on conflict (share_id, user_id) do update set reason = excluded.reason, note = excluded.note, created_at = now(),
     status = case when r.status = 'dismissed' then 'open' else r.status end
  returning (r.xmax = 0) into created;
  return next;
end;
$$;
comment on function public.report_community_map(text, text, text) is
  '(community-maps) A signed-in reader reports a collection listed in Community maps: a reason (spam | offensive | personal_info | copyright | misleading | other — the CHECK refuses others, 23514) and a note. One report per collection and account; reporting again updates it (created = false) and reopens a dismissed one. Not one''s own (22023); only listed collections (P0002). The only way a row enters public.community_map_reports.';
revoke execute on function public.report_community_map(text, text, text) from public, anon;
grant  execute on function public.report_community_map(text, text, text) to authenticated, service_role;

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
    select jsonb_agg(q order by q->>'last_report_at' desc)
      from (
        select jsonb_build_object(
                 'token', c.token, 'title', c.title, 'author', c.author_name, 'summary', c.summary,
                 'listed', c.listed_at is not null, 'hidden_at', c.hidden_at, 'hidden_reason', c.hidden_reason,
                 'open', count(*) filter (where r.status = 'open'),
                 'total', count(*),
                 'reasons', jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note, 'status', r.status, 'at', r.created_at) order by r.created_at desc),
                 'last_report_at', max(r.created_at)) as q
          from public.collection_shares c
          join public.community_map_reports r on r.share_id = c.id
         group by c.id) x), '[]'::jsonb);
end;
$$;
comment on function public.community_map_reports_admin() is
  '(community-maps) The moderation queue: every collection with a report — its title, author name, summary, whether it is listed or hidden (and why), how many reports are open, and each report''s reason, note, status and time (never who sent it). Administrators only (42501 for anyone else).';
revoke execute on function public.community_map_reports_admin() from public, anon;
grant  execute on function public.community_map_reports_admin() to authenticated, service_role;

create or replace function public.moderate_community_map(p_token text, p_action text, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'moderate_community_map: administrators only' using errcode = '42501';
  end if;
  if p_action not in ('hide', 'restore', 'dismiss') then
    raise exception 'moderate_community_map: the action is hide, restore or dismiss' using errcode = '22023';
  end if;
  select c.id into v_id from public.collection_shares c where c.token = p_token;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_action = 'hide' then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      -- the owner is told why: a hide without a reason is not something to tell them
      raise exception 'moderate_community_map: hiding needs a reason the owner will read' using errcode = '22023';
    end if;
    update public.collection_shares c set hidden_at = coalesce(c.hidden_at, now()), hidden_reason = left(btrim(p_reason), 300) where c.id = v_id;
    update public.community_map_reports r set status = 'actioned' where r.share_id = v_id and r.status = 'open';
  elsif p_action = 'restore' then
    update public.collection_shares c set hidden_at = null, hidden_reason = null where c.id = v_id;
  else
    update public.community_map_reports r set status = 'dismissed' where r.share_id = v_id and r.status = 'open';
  end if;
  return jsonb_build_object('ok', true, 'action', p_action);
end;
$$;
comment on function public.moderate_community_map(text, text, text) is
  '(community-maps) An administrator settles a reported collection: hide (out of Community maps, and the owner cannot list it again; needs a reason the owner reads; open reports become actioned), restore (back to the owner''s choice), or dismiss (open reports become dismissed). The link is not touched. Administrators only (42501).';
revoke execute on function public.moderate_community_map(text, text, text) from public, anon;
grant  execute on function public.moderate_community_map(text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  10. THEIR SENTENCES IN THE ACCOUNT'S DATA CATALOGUE
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
   'The collections in Community maps you reported, with the reason and note you gave. Read only by IntMap''s administrators; the collection''s owner never sees who reported it.',
   'みんなの地図で報告したコレクションと、そのときの理由とメモ。IntMap の管理者だけが読み、コレクションの持ち主には誰が報告したかは見えません。',
   'Kept until the collection is no longer published or you delete your account.',
   'そのコレクションの公開が終わるか、アカウントを削除するまで保持します。')
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
