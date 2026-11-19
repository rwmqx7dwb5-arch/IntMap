-- ============================================================================
--  IntMap · world graph — the PERSISTENT index of real-world objects and their typed, dated ties
--  (docs/architecture/05-ai.md «世界オブジェクトの知識グラフ層» · dev-notes/2026-11-19-world-graph-persistent.md)
-- ----------------------------------------------------------------------------
--  WHY A TABLE. The world-object index (js/atlas-world-objects.js) lives for one page. «this terminal → who
--  operates it → what else that company runs» had to be rebuilt from scratch every session, and a thing a
--  source said once (an operator, an ownership change on a date) was forgotten at reload. These three tables
--  keep what a source STATED — never what was inferred — and world_graph_subgraph() walks it.
--
--  SHAPE (it mirrors the in-page shapes, so the page needs no second vocabulary):
--    world_graph_nodes   one row per object, keyed by its `ref` (type:id — the ref the page already uses);
--                        `ids` holds the external identifiers ({"wikidata":"Q…","osm":"way/1","company":"shell"})
--                        and is how two sources' records become ONE object — never the name.
--    world_graph_edges   a typed tie stated by `from_ref`, read backwards by the page through REL_INVERSE
--                        (js/atlas-geo-object.js). `from_ms`/`to_ms` = the period it held (NULL = not stated).
--    world_graph_claims  a number WITH its basis: value, unit, period, source. Rows are side by side, never
--                        overwritten — a second source's figure is a second row.
--  Times are epoch milliseconds (bigint): the unit the page uses, and it holds dates before 1970.
--
--  ACCESS. Public read (the data are CC0 / ODbL extracts and are shown to every reader); NOBODY but
--  service_role writes — rows arrive by migration seeds and by a server-side ingest, not from a browser.
--  `world_graph_subgraph` / `world_graph_find` / `world_graph_near` are SECURITY INVOKER, so they read
--  exactly what the caller could read through the tables.
-- ============================================================================

create table if not exists public.world_graph_nodes (
  ref           text primary key check (ref ~ '^[a-z_]+:.{1,200}$'),
  type          text not null,
  kind          text not null default '',
  name          text not null default '',
  country       text,
  lng           double precision check (lng between -180 and 180),
  lat           double precision check (lat between -90 and 90),
  provenance    text,                                   -- how the point is known (feed_coordinate, resolved_place_centroid …); NULL = not placed
  ids           jsonb not null default '{}'::jsonb,     -- external identifiers, one value per scheme
  valid_from_ms bigint,                                 -- when the object began to exist, when a source says
  valid_to_ms   bigint,
  facts         jsonb not null default '{}'::jsonb,
  sources       jsonb not null default '[]'::jsonb,     -- [{name,url,licence}]
  updated_at    timestamptz not null default now(),
  check ((lng is null) = (lat is null))
);
comment on table public.world_graph_nodes is
  '(world-graph) One real-world object per row, keyed by the page''s own ref (type:id). External identifiers in `ids` — not the name — are what joins two sources'' records. Public read; written only by service_role (migration seeds, server ingest).';

create table if not exists public.world_graph_edges (
  id          bigint generated always as identity primary key,
  from_ref    text not null references public.world_graph_nodes(ref) on delete cascade,
  rel         text not null check (rel ~ '^[a-z_]{2,40}$'),
  to_ref      text not null references public.world_graph_nodes(ref) on delete cascade,
  from_ms     bigint,                                   -- NULL = the source did not state when it began
  to_ms       bigint,                                   -- NULL = no end stated
  confidence  text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  source      text not null default '',
  retrieved   date,
  check (from_ref <> to_ref),
  check (from_ms is null or to_ms is null or from_ms <= to_ms)
);
comment on table public.world_graph_edges is
  '(world-graph) A typed tie stated by from_ref (operated_by, owned_by, part_of …), with the period it held. The page reads it backwards through REL_INVERSE. Rows are what a source stated, never inferred.';
-- one row per (tie, period): the same statement ingested twice is one row
create unique index if not exists world_graph_edges_stated_uq
  on public.world_graph_edges (from_ref, rel, to_ref, coalesce(from_ms, -9223372036854775807), coalesce(to_ms, 9223372036854775807));
create index if not exists world_graph_edges_to_idx on public.world_graph_edges (to_ref);

create table if not exists public.world_graph_claims (
  id        bigint generated always as identity primary key,
  ref       text not null references public.world_graph_nodes(ref) on delete cascade,
  key       text not null check (key ~ '^[a-zA-Z_]{2,40}$'),
  value     double precision not null,
  unit      text not null default '',
  from_ms   bigint,
  to_ms     bigint,
  source    text not null default '',
  retrieved date,
  check (from_ms is null or to_ms is null or from_ms <= to_ms)
);
comment on table public.world_graph_claims is
  '(world-graph) A number with its basis (key, value, unit, period, source). Several rows for one key stay side by side; which is right is for the reader.';
create unique index if not exists world_graph_claims_stated_uq
  on public.world_graph_claims (ref, key, value, unit, coalesce(from_ms, -9223372036854775807), coalesce(to_ms, 9223372036854775807), source);

-- name / identifier lookup and the position index the near-by query prunes with
create index if not exists world_graph_nodes_name_idx on public.world_graph_nodes (lower(name));
create index if not exists world_graph_nodes_ids_idx  on public.world_graph_nodes using gin (ids);
create index if not exists world_graph_nodes_pos_idx  on public.world_graph_nodes (lat, lng) where lat is not null;

alter table public.world_graph_nodes  enable row level security;
alter table public.world_graph_edges  enable row level security;
alter table public.world_graph_claims enable row level security;
revoke all on public.world_graph_nodes, public.world_graph_edges, public.world_graph_claims from public, anon, authenticated;
grant select on public.world_graph_nodes, public.world_graph_edges, public.world_graph_claims to anon, authenticated;
grant all    on public.world_graph_nodes, public.world_graph_edges, public.world_graph_claims to service_role;
drop policy if exists world_graph_nodes_read  on public.world_graph_nodes;
drop policy if exists world_graph_edges_read  on public.world_graph_edges;
drop policy if exists world_graph_claims_read on public.world_graph_claims;
create policy world_graph_nodes_read  on public.world_graph_nodes  for select to anon, authenticated using (true);
create policy world_graph_edges_read  on public.world_graph_edges  for select to anon, authenticated using (true);
create policy world_graph_claims_read on public.world_graph_claims for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
--  world_graph_subgraph(ref, rels, depth, at_ms) — everything within `depth` ties of `ref`
--    p_rels   the stored relation names to follow, in EITHER direction (the caller expands a name with its inverse);
--             NULL/empty = every relation. Proximity is never consulted: a tie is a statement.
--    p_at_ms  as of this moment: a tie, a claim or an object whose stated period excludes it is left out.
--    Returns {nodes:[…], edges:[…], claims:[…]} — the START node and every node reached, the ties walked, and their claims.
--    No row limit (CONSTITUTION §5): depth is the caller's, and it also bounds the walk, so a cycle cannot loop.
-- ----------------------------------------------------------------------------
create or replace function public.world_graph_subgraph(
  p_ref text, p_rels text[] default null, p_depth integer default 1, p_at_ms bigint default null)
returns jsonb
language sql stable security invoker set search_path = public, pg_temp
as $$
  with recursive
  ok_edge as (   -- the ties in force at p_at_ms and among the asked relations
    select e.* from public.world_graph_edges e
    where (nullif(p_rels, '{}'::text[]) is null or e.rel = any (p_rels))
      and (p_at_ms is null or ((e.from_ms is null or e.from_ms <= p_at_ms) and (e.to_ms is null or p_at_ms <= e.to_ms)))
  ),
  walk(ref, d) as (
    select n.ref, 0 from public.world_graph_nodes n where n.ref = p_ref
    union
    select case when e.from_ref = w.ref then e.to_ref else e.from_ref end, w.d + 1
    from walk w join ok_edge e on e.from_ref = w.ref or e.to_ref = w.ref
    where w.d < greatest(coalesce(p_depth, 1), 1)
  ),
  reach as (select ref, min(d) as d from walk group by ref)
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(to_jsonb(n) order by r.d, n.ref)
                       from reach r join public.world_graph_nodes n on n.ref = r.ref
                       where p_at_ms is null or ((n.valid_from_ms is null or n.valid_from_ms <= p_at_ms) and (n.valid_to_ms is null or p_at_ms <= n.valid_to_ms))), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from ok_edge e
                       where e.from_ref in (select ref from reach) and e.to_ref in (select ref from reach)), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.world_graph_claims c
                        where c.ref in (select ref from reach)
                          and (p_at_ms is null or ((c.from_ms is null or c.from_ms <= p_at_ms) and (c.to_ms is null or p_at_ms <= c.to_ms)))), '[]'::jsonb));
$$;
comment on function public.world_graph_subgraph(text, text[], integer, bigint) is
  '(world-graph) The nodes, typed ties and claims within p_depth ties of p_ref, following p_rels in either direction, as of p_at_ms. SECURITY INVOKER; no row limit.';

-- ----------------------------------------------------------------------------
--  world_graph_find(q) — a ref, an external identifier («wikidata:Q123»), or a name, in that order (exact name only:
--  a fuzzy match is a guess, and the page's own find() does the fuzzy step on what it holds).
-- ----------------------------------------------------------------------------
create or replace function public.world_graph_find(p_q text)
returns setof public.world_graph_nodes
language sql stable security invoker set search_path = public, pg_temp
as $$
  select n.* from public.world_graph_nodes n
  where length(coalesce(p_q, '')) between 1 and 200
    and ( n.ref = p_q
       or (p_q ~ '^[A-Za-z][A-Za-z0-9_]*:.+$' and n.ids ->> lower(split_part(p_q, ':', 1)) = substr(p_q, position(':' in p_q) + 1))
       or lower(n.name) = lower(p_q))
  order by (n.ref = p_q) desc, n.ref
  limit 20;
$$;

-- ----------------------------------------------------------------------------
--  world_graph_near(lng, lat, km) — the placed objects within km of a point (whole node rows), nearest first (great-circle, the page's rule:
--  haversine on a 6371 km sphere, js/…/great-circle.js). The latitude band prunes with the index before the exact test.
-- ----------------------------------------------------------------------------
create or replace function public.world_graph_near(p_lng double precision, p_lat double precision, p_km double precision)
returns table (node jsonb, km double precision)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select to_jsonb(q.n), q.d from (
    select n, 2 * 6371 * asin(sqrt(least(1, power(sin(radians(n.lat - p_lat) / 2), 2)
             + cos(radians(p_lat)) * cos(radians(n.lat)) * power(sin(radians(n.lng - p_lng) / 2), 2)))) as d
    from public.world_graph_nodes n
    where n.lat is not null and p_km >= 0 and n.lat between p_lat - degrees(p_km / 6371) and p_lat + degrees(p_km / 6371)
  ) q where q.d <= p_km order by q.d, (q.n).ref;
$$;

grant execute on function public.world_graph_subgraph(text, text[], integer, bigint) to anon, authenticated, service_role;
grant execute on function public.world_graph_find(text) to anon, authenticated, service_role;
grant execute on function public.world_graph_near(double precision, double precision, double precision) to anon, authenticated, service_role;
revoke execute on function public.world_graph_subgraph(text, text[], integer, bigint) from public;
revoke execute on function public.world_graph_find(text) from public;
revoke execute on function public.world_graph_near(double precision, double precision, double precision) from public;
