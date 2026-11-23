-- ============================================================================
--  IntMap · news_event_history — the LONG-LIVED, searchable record of what happened
--  (docs/NEWS-EVENTS.md «19. 出来事の履歴» · dev-notes/2026-11-20-news-event-history.md)
-- ----------------------------------------------------------------------------
--  WHY A SECOND TABLE. news_events keeps an event 30 days with its articles (72 h). A question such as
--  «what was built, closed or bought in Southeast-Asian semiconductor between 2010 and now» needs rows that
--  outlive both. news_event_history is a COMPACT copy of the events worth keeping, written by the news-ingest
--  `prune` stage BEFORE the event or its articles are deleted:
--    · the permanent id        event_public_id = news_events.public_id (merge redirects resolve to it)
--    · when / where            occurred_at, place_name, lng/lat
--    · who / what              world_refs = world_graph_nodes.ref the headline STATES (no proximity guess),
--                              company_ids = the atlas company ids, kind = what the headline reports
--    · the sources             [{name,url,title,at}] — the articles are gone after 72 h, so the links are kept here
--    · the update log          every later change of title / place / source count, with when
--    · thread_key              what makes «a series of changes to ONE facility» (plan -> construction -> operation)
--                              different from «another event in the same region»
--
--  WHAT IS KEPT (the cost ceiling, measured 2026-11-20 on production):
--    20,669 events in the 30-day window, 4,464 of them reported by >= 2 independent source families
--    (~150 / day). Only events that are (a) reported by >= 2 independent families, (b) tied to a world-graph
--    object or a company, or (c) starred by a reader are archived: ~55,000 rows a year at ~1.2 KB = ~65 MB / year
--    with indexes — inside the plan's included database size (the whole database is 124 MB today). The hard cap
--    is news_history_trim(max_rows); the function deletes the OLDEST rows that carry no world ref and fewer than
--    three sources FIRST, and never touches a row a reader starred or the graph references.
--
--  ACCESS. Public read (the events are public already); only service_role writes. No FK to auth.users
--  (delete_account_data must not delete a public record), and NO FK to news_events: the row must outlive it.
-- ============================================================================

create table if not exists public.news_event_history (
  event_public_id  text primary key,
  event_id         bigint,
  merged_into      text,                                   -- canonical public_id when this event was merged
  thread_key       text not null,
  title            text not null,
  summary          text,
  category         text not null default 'world',
  kind             text not null default 'other'
                     check (kind in ('plan','construction_start','operational','expansion','closure','acquisition','other')),
  occurred_at      timestamptz not null,
  last_reported_at timestamptz,
  place_name       text,
  lng              double precision check (lng between -180 and 180),
  lat              double precision check (lat between -90 and 90),
  world_refs       text[] not null default '{}',
  company_ids      text[] not null default '{}',
  source_count     integer not null default 0,
  sources          jsonb   not null default '[]'::jsonb,
  updates          jsonb   not null default '[]'::jsonb,
  starred          boolean not null default false,
  archived_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((lng is null) = (lat is null))
);
comment on table public.news_event_history is
  '(news-event-history) The compact long-lived copy of the events worth keeping: permanent id, time, place, the world_graph_nodes refs the headline states, sources and an update log. Public read; written only by news-ingest (service_role).';

create index if not exists news_event_history_when_idx   on public.news_event_history (occurred_at desc);
create index if not exists news_event_history_thread_idx on public.news_event_history (thread_key, occurred_at);
create index if not exists news_event_history_refs_idx   on public.news_event_history using gin (world_refs);
create index if not exists news_event_history_co_idx     on public.news_event_history using gin (company_ids);
create index if not exists news_event_history_pos_idx    on public.news_event_history (lat, lng) where lat is not null;

alter table public.news_event_history enable row level security;
revoke all on public.news_event_history from public, anon, authenticated;
grant select on public.news_event_history to anon, authenticated;
grant all    on public.news_event_history to service_role;
drop policy if exists news_event_history_read on public.news_event_history;
create policy news_event_history_read on public.news_event_history for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
--  news_history_upsert(rows) — insert or refresh archived events. The update log is written HERE, in one
--  statement, so «what changed, and when» cannot be lost between a read and a write: a change of title,
--  place, kind or source count appends {at, field, from, to} (last 20 kept). SECURITY DEFINER because the
--  writer is the edge function; execute is granted to service_role only.
-- ----------------------------------------------------------------------------
create or replace function public.news_history_upsert(p jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer := 0; r jsonb; old public.news_event_history%rowtype; log jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    select * into old from public.news_event_history where event_public_id = r->>'event_public_id';
    if not found then
      insert into public.news_event_history (event_public_id, event_id, merged_into, thread_key, title, summary, category, kind,
        occurred_at, last_reported_at, place_name, lng, lat, world_refs, company_ids, source_count, sources, starred)
      values (r->>'event_public_id', nullif(r->>'event_id','')::bigint, nullif(r->>'merged_into',''), r->>'thread_key', r->>'title',
        nullif(r->>'summary',''), coalesce(r->>'category','world'), coalesce(r->>'kind','other'),
        (r->>'occurred_at')::timestamptz, nullif(r->>'last_reported_at','')::timestamptz, nullif(r->>'place_name',''),
        nullif(r->>'lng','')::double precision, nullif(r->>'lat','')::double precision,
        coalesce(array(select jsonb_array_elements_text(r->'world_refs')), '{}'),
        coalesce(array(select jsonb_array_elements_text(r->'company_ids')), '{}'),
        coalesce((r->>'source_count')::integer, 0), coalesce(r->'sources', '[]'::jsonb), coalesce((r->>'starred')::boolean, false));
    else
      log := old.updates;
      if old.title is distinct from (r->>'title') then
        log := log || jsonb_build_array(jsonb_build_object('at', now(), 'field', 'title', 'from', old.title, 'to', r->>'title')); end if;
      if old.kind is distinct from coalesce(r->>'kind','other') then
        log := log || jsonb_build_array(jsonb_build_object('at', now(), 'field', 'kind', 'from', old.kind, 'to', coalesce(r->>'kind','other'))); end if;
      if old.place_name is distinct from nullif(r->>'place_name','') then
        log := log || jsonb_build_array(jsonb_build_object('at', now(), 'field', 'place', 'from', old.place_name, 'to', nullif(r->>'place_name',''))); end if;
      if old.source_count is distinct from coalesce((r->>'source_count')::integer, 0) then
        log := log || jsonb_build_array(jsonb_build_object('at', now(), 'field', 'source_count', 'from', old.source_count, 'to', coalesce((r->>'source_count')::integer, 0))); end if;
      if jsonb_array_length(log) > 20 then
        log := (select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) from jsonb_array_elements(log) with ordinality t(x, ord) where ord > jsonb_array_length(log) - 20);
      end if;
      update public.news_event_history set
        event_id = coalesce(nullif(r->>'event_id','')::bigint, event_id),
        merged_into = nullif(r->>'merged_into',''),
        thread_key = r->>'thread_key', title = r->>'title', summary = coalesce(nullif(r->>'summary',''), summary),
        category = coalesce(r->>'category', category), kind = coalesce(r->>'kind', kind),
        last_reported_at = coalesce(nullif(r->>'last_reported_at','')::timestamptz, last_reported_at),
        place_name = nullif(r->>'place_name',''),
        lng = nullif(r->>'lng','')::double precision, lat = nullif(r->>'lat','')::double precision,
        world_refs = coalesce(array(select jsonb_array_elements_text(r->'world_refs')), '{}'),
        company_ids = coalesce(array(select jsonb_array_elements_text(r->'company_ids')), '{}'),
        source_count = coalesce((r->>'source_count')::integer, source_count),
        -- the sources of an archived event only GROW: an article older than 72 h has left news_articles
        sources = (select coalesce(jsonb_agg(distinct_s), '[]'::jsonb) from (
                     select distinct on (s->>'url') s as distinct_s from jsonb_array_elements(old.sources || coalesce(r->'sources', '[]'::jsonb)) s
                     order by s->>'url', s->>'at') q),
        updates = log, starred = old.starred or coalesce((r->>'starred')::boolean, false), updated_at = now()
      where event_public_id = old.event_public_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.news_history_upsert(jsonb) from public, anon, authenticated;
grant execute on function public.news_history_upsert(jsonb) to service_role;

-- ----------------------------------------------------------------------------
--  news_history_trim(max_rows) — the hard cap. Deletes the oldest rows that no reader starred and that carry
--  neither a world ref nor three sources, until max_rows remain. Returns the number deleted.
-- ----------------------------------------------------------------------------
create or replace function public.news_history_trim(p_max integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare over_by integer; gone integer := 0;
begin
  select count(*) - greatest(p_max, 1000) into over_by from public.news_event_history;
  if over_by <= 0 then return 0; end if;
  with v as (select event_public_id from public.news_event_history
             where not starred and cardinality(world_refs) = 0 and source_count < 3
             order by occurred_at asc limit over_by)
  delete from public.news_event_history h using v where h.event_public_id = v.event_public_id;
  get diagnostics gone = row_count;
  return gone;
end $$;
revoke all on function public.news_history_trim(integer) from public, anon, authenticated;
grant execute on function public.news_history_trim(integer) to service_role;

-- ----------------------------------------------------------------------------
--  news_history_search — what Atlas asks. Every filter is optional; the answer says what the archive covers
--  (coverage_from / coverage_to) so an empty answer for 2012 is read as «the archive starts later», not as
--  «nothing happened». SECURITY INVOKER: it reads exactly what the caller can read.
--    p_q       words; EVERY word must appear in the title, summary or place (case-insensitive)
--    p_bbox    [west, south, east, north]; events without a place are not matched by a box
--    p_kinds   plan | construction_start | operational | expansion | closure | acquisition | other
--    p_world_ref / p_company   a world_graph_nodes.ref / an atlas company id
--    p_thread  one facility's series
--  Rows are newest first; `total` counts every match, not only the rows returned.
-- ----------------------------------------------------------------------------
create or replace function public.news_history_search(
  p_q text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_bbox double precision[] default null, p_kinds text[] default null,
  p_world_ref text default null, p_company text default null, p_thread text default null,
  p_limit integer default 100)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with terms as (
    select lower(t) as t from regexp_split_to_table(coalesce(trim(p_q), ''), '\s+') t where length(t) > 0
  ),
  hit as (
    select h.* from public.news_event_history h
    where (p_from is null or h.occurred_at >= p_from)
      and (p_to   is null or h.occurred_at <= p_to)
      and (p_kinds is null or h.kind = any (p_kinds))
      and (p_world_ref is null or p_world_ref = any (h.world_refs))
      and (p_company is null or p_company = any (h.company_ids))
      and (p_thread is null or h.thread_key = p_thread)
      and (p_bbox is null or (cardinality(p_bbox) = 4 and h.lat is not null
             and h.lat between p_bbox[2] and p_bbox[4]
             and (case when p_bbox[1] <= p_bbox[3] then h.lng between p_bbox[1] and p_bbox[3]
                       else (h.lng >= p_bbox[1] or h.lng <= p_bbox[3]) end)))
      and not exists (select 1 from terms x
            where position(x.t in lower(h.title || ' ' || coalesce(h.summary, '') || ' ' || coalesce(h.place_name, ''))) = 0)
  )
  select jsonb_build_object(
    'coverage_from', (select min(occurred_at) from public.news_event_history),
    'coverage_to',   (select max(occurred_at) from public.news_event_history),
    'archived',      (select count(*) from public.news_event_history),
    'total',         (select count(*) from hit),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.occurred_at desc) from (
        select event_public_id, thread_key, title, summary, category, kind, occurred_at, last_reported_at, place_name, lng, lat,
               world_refs, company_ids, source_count, sources, updates, merged_into
        from hit order by occurred_at desc limit greatest(coalesce(p_limit, 100), 1)) r), '[]'::jsonb));
$$;
revoke all on function public.news_history_search(text, timestamptz, timestamptz, double precision[], text[], text, text, text, integer) from public;
grant execute on function public.news_history_search(text, timestamptz, timestamptz, double precision[], text[], text, text, text, integer) to anon, authenticated, service_role;
