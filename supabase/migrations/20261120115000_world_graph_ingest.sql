-- ============================================================================
--  IntMap · world graph — INGEST: how a feed keeps its slice of the graph current, and says how fresh it is
--  (docs/architecture/05-ai.md «永続の世界グラフ» · dev-notes/2026-11-20-world-graph-ports.md)
-- ----------------------------------------------------------------------------
--  WHY. The LNG slice (20261119150100) was a one-off seed: a statement a source later retired, or a figure it
--  revised, stayed in the table as if still stated, and nothing said when any of it was last confirmed. A FEED is a
--  named upstream slice (`ports`); this migration gives every feed the same four steps, all service_role-only:
--     world_graph_ingest_begin(feed)                    → run id   (a run is a row in world_graph_ingest_runs)
--     world_graph_ingest_apply(run, nodes, edges, claims)           upsert what the upstream states NOW, counting what is
--                                                       new / changed / unchanged; every row it confirms carries the run
--     world_graph_ingest_finish(run, upstream, counts)  retire what the upstream no longer states, record the run
--  and one public read, world_graph_freshness(), that the page shows beside an answer.
--
--  ADDITIVE ONLY. New nullable columns `feed` / `feed_run` on the three tables (NULL = a seed written before feeds
--  existed — never touched by a feed), one new table, new functions; the three read RPCs keep their signatures
--  (world_graph_find also matches `facts.names`, the labels a source gave the object).
--
--  OWNERSHIP. A feed only changes and retires rows whose `feed` is its own. A node two feeds mention (a company both
--  the LNG slice and the ports slice name) belongs to whoever wrote it first and is left as it is by the other.
--  RETIRING IS GUARDED: a run that would retire more than `p_max_retire` of the feed's rows (default 40 %) is
--  `refused` and deletes nothing — an upstream that answered thin is not the same as an upstream that withdrew.
--  An edge whose end is not a node is skipped and counted, never invented.
-- ============================================================================

alter table public.world_graph_nodes  add column if not exists feed text, add column if not exists feed_run bigint;
alter table public.world_graph_edges  add column if not exists feed text, add column if not exists feed_run bigint;
alter table public.world_graph_claims add column if not exists feed text, add column if not exists feed_run bigint;
create index if not exists world_graph_nodes_feed_idx  on public.world_graph_nodes  (feed) where feed is not null;
create index if not exists world_graph_edges_feed_idx  on public.world_graph_edges  (feed) where feed is not null;
create index if not exists world_graph_claims_feed_idx on public.world_graph_claims (feed) where feed is not null;
-- a feed's number about one (object, key, period, source) is ONE row whose value a revision updates in place
create unique index if not exists world_graph_claims_feed_uq
  on public.world_graph_claims (ref, key, coalesce(from_ms, -9223372036854775807), coalesce(to_ms, 9223372036854775807), source) where feed is not null;

create table if not exists public.world_graph_ingest_runs (
  id          bigint generated always as identity primary key,
  feed        text not null check (feed ~ '^[a-z_]{2,40}$'),
  started_at  timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'ok', 'refused', 'failed')),
  upstream    jsonb not null default '{}'::jsonb,   -- what each source answered with and when it says it was updated: {name:{updated,rows,url}}
  counts      jsonb not null default '{}'::jsonb,   -- {nodes:{added,changed,same}, edges:{…,skipped}, claims:{…}, retired:{…}}
  note        text not null default ''
);
comment on table public.world_graph_ingest_runs is
  '(world-graph) One row per ingest run of a feed: when, how it ended, what the upstreams said about their own freshness, and what changed. Public read (it is the freshness shown beside an answer); service_role writes.';
create index if not exists world_graph_ingest_runs_feed_idx on public.world_graph_ingest_runs (feed, started_at desc);
alter table public.world_graph_ingest_runs enable row level security;
revoke all on public.world_graph_ingest_runs from public, anon, authenticated;
grant select on public.world_graph_ingest_runs to anon, authenticated;
grant all on public.world_graph_ingest_runs to service_role;
drop policy if exists world_graph_ingest_runs_read on public.world_graph_ingest_runs;
create policy world_graph_ingest_runs_read on public.world_graph_ingest_runs for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
create or replace function public.world_graph_ingest_begin(p_feed text)
returns bigint language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v bigint;
begin
  if p_feed is null or p_feed !~ '^[a-z_]{2,40}$' then raise exception 'bad feed name'; end if;
  -- a run that began long ago and never finished is a dead run, not a running one
  update public.world_graph_ingest_runs set status = 'failed', finished_at = clock_timestamp(), note = 'superseded: never finished'
   where feed = p_feed and status = 'running' and started_at < now() - interval '2 hours';
  if exists (select 1 from public.world_graph_ingest_runs where feed = p_feed and status = 'running') then
    raise exception 'an ingest run of % is already running', p_feed;
  end if;
  insert into public.world_graph_ingest_runs (feed) values (p_feed) returning id into v;
  return v;
end $$;

create or replace function public.world_graph_ingest_apply(
  p_run bigint, p_nodes jsonb default '[]'::jsonb, p_edges jsonb default '[]'::jsonb, p_claims jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_feed text;
  nn jsonb := '{"added":0,"changed":0,"same":0}'; ne jsonb := '{"added":0,"changed":0,"same":0,"skipped":0}'; nc jsonb := '{"added":0,"changed":0,"same":0}';
  a int; c int; t int;
begin
  select feed into v_feed from public.world_graph_ingest_runs where id = p_run and status = 'running';
  if v_feed is null then raise exception 'no running ingest run %', p_run; end if;

  -- ① nodes: insert; update only a row this feed owns and only when something it states differs
  with inc as (
    select * from jsonb_to_recordset(coalesce(p_nodes, '[]'::jsonb)) as x(ref text, type text, kind text, name text, country text, lng double precision, lat double precision,
      provenance text, ids jsonb, valid_from_ms bigint, valid_to_ms bigint, facts jsonb, sources jsonb)),
  up as (
    insert into public.world_graph_nodes as n (ref, type, kind, name, country, lng, lat, provenance, ids, valid_from_ms, valid_to_ms, facts, sources, feed, feed_run)
    select ref, type, coalesce(kind, ''), coalesce(name, ''), country, lng, lat, provenance, coalesce(ids, '{}'::jsonb), valid_from_ms, valid_to_ms, coalesce(facts, '{}'::jsonb), coalesce(sources, '[]'::jsonb), v_feed, p_run from inc
    on conflict (ref) do update set type = excluded.type, kind = excluded.kind, name = excluded.name, country = excluded.country, lng = excluded.lng, lat = excluded.lat,
      provenance = excluded.provenance, ids = excluded.ids, valid_from_ms = excluded.valid_from_ms, valid_to_ms = excluded.valid_to_ms, facts = excluded.facts, sources = excluded.sources,
      feed_run = p_run, updated_at = now()
    where n.feed = v_feed and (n.type, n.kind, n.name, n.country, n.lng, n.lat, n.provenance, n.ids, n.valid_from_ms, n.valid_to_ms, n.facts, n.sources)
      is distinct from (excluded.type, excluded.kind, excluded.name, excluded.country, excluded.lng, excluded.lat, excluded.provenance, excluded.ids, excluded.valid_from_ms, excluded.valid_to_ms, excluded.facts, excluded.sources)
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into a, c from up;
  update public.world_graph_nodes n set feed_run = p_run
    from (select ref from jsonb_to_recordset(coalesce(p_nodes, '[]'::jsonb)) as x(ref text)) i
   where n.ref = i.ref and n.feed = v_feed and n.feed_run is distinct from p_run;
  get diagnostics t = row_count;
  nn := jsonb_build_object('added', a, 'changed', c, 'same', t);

  -- ② edges: both ends must be nodes; a tie another feed (or a seed) already states is left to its owner
  with inc as (
    select x.* from jsonb_to_recordset(coalesce(p_edges, '[]'::jsonb)) as x(from_ref text, rel text, to_ref text, from_ms bigint, to_ms bigint, confidence text, source text, retrieved date)),
  ok as (select i.* from inc i where exists (select 1 from public.world_graph_nodes where ref = i.from_ref) and exists (select 1 from public.world_graph_nodes where ref = i.to_ref) and i.from_ref <> i.to_ref),
  up as (
    insert into public.world_graph_edges as e (from_ref, rel, to_ref, from_ms, to_ms, confidence, source, retrieved, feed, feed_run)
    select from_ref, rel, to_ref, from_ms, to_ms, coalesce(confidence, 'medium'), coalesce(source, ''), retrieved, v_feed, p_run from ok
    on conflict (from_ref, rel, to_ref, coalesce(from_ms, -9223372036854775807), coalesce(to_ms, 9223372036854775807)) do update
      set confidence = excluded.confidence, source = excluded.source, retrieved = excluded.retrieved, feed_run = p_run
    where e.feed = v_feed
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into a, c from up;
  select count(*) into t from jsonb_to_recordset(coalesce(p_edges, '[]'::jsonb)) as x(from_ref text, to_ref text)
   where not (exists (select 1 from public.world_graph_nodes where ref = x.from_ref) and exists (select 1 from public.world_graph_nodes where ref = x.to_ref));
  ne := jsonb_build_object('added', a, 'changed', 0, 'same', c, 'skipped', t);

  -- ③ claims: a revised figure for the same (object, key, period, source) updates the row; every confirmed row carries this run and today
  with inc as (
    select x.* from jsonb_to_recordset(coalesce(p_claims, '[]'::jsonb)) as x(ref text, key text, value double precision, unit text, from_ms bigint, to_ms bigint, source text, retrieved date)),
  -- a figure a seed (or another feed) already states, identically, stays that row's own
  ok as (select i.* from inc i where exists (select 1 from public.world_graph_nodes where ref = i.ref)
           and not exists (select 1 from public.world_graph_claims o where o.feed is distinct from v_feed and o.ref = i.ref and o.key = i.key and o.value = i.value
                             and o.unit = coalesce(i.unit, '') and o.from_ms is not distinct from i.from_ms and o.to_ms is not distinct from i.to_ms and o.source = coalesce(i.source, ''))),
  up as (
    insert into public.world_graph_claims as k (ref, key, value, unit, from_ms, to_ms, source, retrieved, feed, feed_run)
    select ref, key, value, coalesce(unit, ''), from_ms, to_ms, coalesce(source, ''), retrieved, v_feed, p_run from ok
    on conflict (ref, key, coalesce(from_ms, -9223372036854775807), coalesce(to_ms, 9223372036854775807), source) where feed is not null do update
      set value = excluded.value, unit = excluded.unit, retrieved = excluded.retrieved, feed_run = p_run
    where k.feed = v_feed and (k.value, k.unit) is distinct from (excluded.value, excluded.unit)
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into a, c from up;
  update public.world_graph_claims k set feed_run = p_run, retrieved = x.retrieved
    from jsonb_to_recordset(coalesce(p_claims, '[]'::jsonb)) as x(ref text, key text, from_ms bigint, to_ms bigint, source text, retrieved date)
   where k.feed = v_feed and k.ref = x.ref and k.key = x.key and k.source = coalesce(x.source, '')
     and k.from_ms is not distinct from x.from_ms and k.to_ms is not distinct from x.to_ms and k.feed_run is distinct from p_run;
  get diagnostics t = row_count;
  nc := jsonb_build_object('added', a, 'changed', c, 'same', t);

  return jsonb_build_object('nodes', nn, 'edges', ne, 'claims', nc);
end $$;

create or replace function public.world_graph_ingest_finish(
  p_run bigint, p_upstream jsonb default '{}'::jsonb, p_counts jsonb default '{}'::jsonb, p_max_retire numeric default 0.4)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_feed text; tn int; te int; tc int; sn int; se int; sc int; ret jsonb; v_status text := 'ok'; v_note text := '';
begin
  select feed into v_feed from public.world_graph_ingest_runs where id = p_run and status = 'running';
  if v_feed is null then raise exception 'no running ingest run %', p_run; end if;
  select count(*), count(*) filter (where feed_run is distinct from p_run) into tn, sn from public.world_graph_nodes  where feed = v_feed;
  select count(*), count(*) filter (where feed_run is distinct from p_run) into te, se from public.world_graph_edges  where feed = v_feed;
  select count(*), count(*) filter (where feed_run is distinct from p_run) into tc, sc from public.world_graph_claims where feed = v_feed;
  if (tn + te + tc) >= 50 and (sn + se + sc) > p_max_retire * (tn + te + tc) then
    v_status := 'refused'; v_note := 'would retire ' || (sn + se + sc) || ' of ' || (tn + te + tc) || ' rows — an upstream that answered thin is not a withdrawal; nothing was deleted';
    ret := jsonb_build_object('nodes', 0, 'edges', 0, 'claims', 0, 'wouldRetire', jsonb_build_object('nodes', sn, 'edges', se, 'claims', sc));
  else
    delete from public.world_graph_claims where feed = v_feed and feed_run is distinct from p_run;
    delete from public.world_graph_edges  where feed = v_feed and feed_run is distinct from p_run;
    -- a node leaves only when nothing (of any feed) still ties to it or states a number about it
    delete from public.world_graph_nodes n where n.feed = v_feed and n.feed_run is distinct from p_run
      and not exists (select 1 from public.world_graph_edges e where e.from_ref = n.ref or e.to_ref = n.ref)
      and not exists (select 1 from public.world_graph_claims k where k.ref = n.ref);
    ret := jsonb_build_object('nodes', sn, 'edges', se, 'claims', sc);
  end if;
  update public.world_graph_ingest_runs set status = v_status, finished_at = clock_timestamp(), upstream = coalesce(p_upstream, '{}'::jsonb),
    counts = coalesce(p_counts, '{}'::jsonb) || jsonb_build_object('retired', ret), note = v_note where id = p_run;
  return jsonb_build_object('status', v_status, 'retired', ret, 'note', v_note);
end $$;

create or replace function public.world_graph_ingest_fail(p_run bigint, p_note text default '')
returns void language sql security invoker set search_path = public, pg_temp
as $$ update public.world_graph_ingest_runs set status = 'failed', finished_at = clock_timestamp(), note = left(coalesce(p_note, ''), 500) where id = p_run and status = 'running'; $$;

-- ----------------------------------------------------------------------------
--  world_graph_freshness() — per feed: the last run that ended `ok` (when, what the upstreams said, what changed)
--  and the status of the latest attempt, so a stale or failing feed is visible and not silently old.
-- ----------------------------------------------------------------------------
create or replace function public.world_graph_freshness()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('feed', f.feed, 'finishedAt', f.ok_at, 'upstream', f.upstream, 'counts', f.counts, 'latestStatus', f.latest_status, 'latestNote', f.latest_note) order by f.feed), '[]'::jsonb)
  from (
    select feeds.feed,
      (select r.finished_at from public.world_graph_ingest_runs r where r.feed = feeds.feed and r.status = 'ok' order by r.finished_at desc limit 1) as ok_at,
      (select r.upstream    from public.world_graph_ingest_runs r where r.feed = feeds.feed and r.status = 'ok' order by r.finished_at desc limit 1) as upstream,
      (select r.counts      from public.world_graph_ingest_runs r where r.feed = feeds.feed and r.status = 'ok' order by r.finished_at desc limit 1) as counts,
      (select r.status      from public.world_graph_ingest_runs r where r.feed = feeds.feed order by r.started_at desc limit 1) as latest_status,
      (select r.note        from public.world_graph_ingest_runs r where r.feed = feeds.feed order by r.started_at desc limit 1) as latest_note
    from (select distinct feed from public.world_graph_ingest_runs) feeds) f;
$$;

-- ----------------------------------------------------------------------------
--  world_graph_find: the labels a source gave an object (`facts.names`: the English and Japanese label, the UN/LOCODE name)
--  match as exactly as `name` does — «ロッテルダム港» finds Port of Rotterdam. Still exact: a fuzzy match is a guess.
-- ----------------------------------------------------------------------------
create or replace function public.world_graph_find(p_q text)
returns setof public.world_graph_nodes
language sql stable security invoker set search_path = public, pg_temp
as $$
  select n.* from public.world_graph_nodes n
  where length(coalesce(p_q, '')) between 1 and 200
    and ( n.ref = p_q
       or (p_q ~ '^[A-Za-z][A-Za-z0-9_]*:.+$' and n.ids ->> lower(split_part(p_q, ':', 1)) = substr(p_q, position(':' in p_q) + 1))
       or lower(n.name) = lower(p_q)
       or (jsonb_typeof(n.facts -> 'names') = 'array' and exists (select 1 from jsonb_array_elements_text(n.facts -> 'names') x where lower(x) = lower(p_q))))
  order by (n.ref = p_q) desc, (lower(n.name) = lower(p_q)) desc, (n.ids ? 'unlocode') desc, n.ref
  limit 20;
$$;

grant execute on function public.world_graph_freshness() to anon, authenticated, service_role;
revoke execute on function public.world_graph_freshness() from public;
grant execute on function public.world_graph_ingest_begin(text), public.world_graph_ingest_apply(bigint, jsonb, jsonb, jsonb),
  public.world_graph_ingest_finish(bigint, jsonb, jsonb, numeric), public.world_graph_ingest_fail(bigint, text) to service_role;
revoke execute on function public.world_graph_ingest_begin(text), public.world_graph_ingest_apply(bigint, jsonb, jsonb, jsonb),
  public.world_graph_ingest_finish(bigint, jsonb, jsonb, numeric), public.world_graph_ingest_fail(bigint, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
--  The weekly run. Posts only when its secret is in vault (the rule of 20260925090000: a database without production's
--  secrets — a branch, a restore drill — calls nothing). Where pg_cron is not installed (the local stack, CI) this does nothing.
--  The secret: `select vault.create_secret('<WORLD_GRAPH_INGEST_SECRET of the function>', 'world_graph_ingest_secret');`
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — the world-graph ingest is not scheduled (production has it)';
    return;
  end if;
  perform cron.schedule('world-graph-ingest-ports', '37 3 * * 1', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/world-graph-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-world-graph-secret', s.decrypted_secret),
  body := '{"feed":"ports"}'::jsonb,
  timeout_milliseconds := 150000
)
from vault.decrypted_secrets s
where s.name = 'world_graph_ingest_secret';
$cmd$);
end $$;
