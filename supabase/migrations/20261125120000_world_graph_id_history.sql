-- ============================================================================
--  IntMap · world graph — the HISTORY of an external identifier (Overture GERS first)
--  (docs/architecture/06-supabase.md · dev-notes/2026-11-20-overture-maps.md)
-- ----------------------------------------------------------------------------
--  WHY A TABLE. world_graph_nodes.ids holds ONE value per scheme — today's. Overture's GERS ids are
--  re-issued: its own figure for the 2026-11-18 release is ~6.5 % churn a month. An object that was
--  `gers = A` in October and `gers = B` in November is ONE object, and a node that only keeps the latest
--  id cannot be found by the id an old export, a bookmark or a saved view still holds. Each row here says:
--  «in release R, this object stood under this id, made from these source records» — what Overture
--  STATED on the row (sources[].dataset / record_id), never a successor guessed from a position or a name.
--
--    ref            the object (the page's own type:id) — it does NOT change when the identifier does
--    scheme         the identifier scheme (`gers`, …) — the same key as in world_graph_nodes.ids
--    ext_id         the identifier as it stood in `release`
--    release        the supplier's release / version label (`2026-11-18.0`)
--    status         present  — the release held this id for this object
--                   removed  — the supplier's changelog says the id left the release (the object may live on under another id)
--    source_records [{dataset, record_id}] the supplier stated this id was made from
--    observed       the day this row was read
--
--  ACCESS as the other world_graph tables: public read; only service_role writes.
--  world_graph_resolve_id(scheme, id) answers «which object was ever called this» — the CURRENT id first,
--  then every id of the history; it never matches by name or position.
-- ============================================================================

create table if not exists public.world_graph_id_history (
  id              bigint generated always as identity primary key,
  ref             text not null references public.world_graph_nodes(ref) on delete cascade,
  scheme          text not null check (scheme ~ '^[a-z][a-z0-9_]{1,30}$'),
  ext_id          text not null check (length(ext_id) between 1 and 200),
  release         text not null check (length(release) between 1 and 60),
  status          text not null default 'present' check (status in ('present', 'removed')),
  source_records  jsonb not null default '[]'::jsonb check (jsonb_typeof(source_records) = 'array'),
  observed        date
);
comment on table public.world_graph_id_history is
  '(world-graph) An external identifier of an object, per release: which id it stood under and which source records the supplier stated it was made from. Public read; written only by service_role.';

-- one statement per (object, scheme, id, release): the same release ingested twice is one row
create unique index if not exists world_graph_id_history_uq on public.world_graph_id_history (ref, scheme, ext_id, release);
create index if not exists world_graph_id_history_lookup_idx on public.world_graph_id_history (scheme, ext_id);

alter table public.world_graph_id_history enable row level security;
revoke all on public.world_graph_id_history from public, anon, authenticated;
grant select on public.world_graph_id_history to anon, authenticated;
grant all on public.world_graph_id_history to service_role;
drop policy if exists world_graph_id_history_read on public.world_graph_id_history;
create policy world_graph_id_history_read on public.world_graph_id_history for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
--  world_graph_resolve_id(scheme, id) — the objects that ever stood under this identifier.
--  `current` = true when it is the node's own present id (ids ->> scheme); false when only the history holds it.
--  An identifier two objects have each carried (re-issued to a different thing) returns BOTH rows: it is the caller's
--  to choose, and silently taking the newest would be exactly the guess this table exists to avoid.
-- ----------------------------------------------------------------------------
create or replace function public.world_graph_resolve_id(p_scheme text, p_id text)
returns table (ref text, is_current boolean, release text, status text)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select n.ref, true, null::text, null::text
  from public.world_graph_nodes n
  where length(coalesce(p_scheme, '')) between 2 and 31 and length(coalesce(p_id, '')) between 1 and 200
    and n.ids ->> lower(p_scheme) = p_id
  union all
  select h.ref, false, h.release, h.status
  from public.world_graph_id_history h
  where length(coalesce(p_scheme, '')) between 2 and 31 and length(coalesce(p_id, '')) between 1 and 200
    and h.scheme = lower(p_scheme) and h.ext_id = p_id
  order by 2 desc, 1, 3 desc nulls first;
$$;
comment on function public.world_graph_resolve_id(text, text) is
  '(world-graph) The objects that ever stood under an external identifier: the node whose present id it is, then every history row. Never matches by name or position. SECURITY INVOKER.';
grant execute on function public.world_graph_resolve_id(text, text) to anon, authenticated, service_role;
revoke execute on function public.world_graph_resolve_id(text, text) from public;

-- ----------------------------------------------------------------------------
--  world_graph_adopt_id(ref, scheme, id, release, source_records) — which object does a freshly read id belong to?
--  Used by the ingest (scripts/world-graph/ingest-overture.mjs) BEFORE it writes a node, so a re-issued identifier
--  lands on the object that already exists instead of making a second one. In order:
--    1. the id is already known (a node's present id, or any history row)        → that object, if exactly one
--    2. a source record the supplier states for it (dataset + record_id, equal to the character) is in the
--       history of exactly one object                                            → that object
--    3. otherwise                                                                → p_ref, the caller's own
--  «Exactly one» matters: two objects sharing a record is a conflict and is NOT resolved by picking one. Nothing
--  here compares a name, a position or a prefix — a record id that merely looks alike is a different record.
--  Writes nothing; callable only by service_role (it is the ingest's helper, not a reader's).
-- ----------------------------------------------------------------------------
create or replace function public.world_graph_adopt_id(
  p_ref text, p_scheme text, p_id text, p_release text, p_records jsonb default '[]'::jsonb)
returns text
language sql stable security invoker set search_path = public, pg_temp
as $$
  with known as (
    select n.ref from public.world_graph_nodes n where n.ids ->> lower(p_scheme) = p_id
    union
    select h.ref from public.world_graph_id_history h where h.scheme = lower(p_scheme) and h.ext_id = p_id
  ),
  by_record as (
    select distinct h.ref
    from public.world_graph_id_history h
    cross join lateral jsonb_array_elements(h.source_records) hr
    join lateral jsonb_array_elements(case when jsonb_typeof(p_records) = 'array' then p_records else '[]'::jsonb end) pr
      on pr ->> 'dataset' = hr ->> 'dataset' and pr ->> 'record_id' = hr ->> 'record_id'
    where h.scheme = lower(p_scheme) and pr ->> 'record_id' is not null
  )
  select case
    when (select count(*) from known) = 1 then (select ref from known)
    when (select count(*) from known) = 0 and (select count(*) from by_record) = 1 then (select ref from by_record)
    else p_ref
  end;
$$;
comment on function public.world_graph_adopt_id(text, text, text, text, jsonb) is
  '(world-graph) The ref an ingest should write a freshly read external id onto: the object that already holds the id, else the only object whose history states the same source record, else the caller''s own ref. Never matches a name or a position. service_role only.';
revoke execute on function public.world_graph_adopt_id(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.world_graph_adopt_id(text, text, text, text, jsonb) to service_role;
