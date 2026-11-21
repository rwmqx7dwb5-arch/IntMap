-- ============================================================================
--  IntMap · world graph — IDENTITY that survives an upstream refresh, and the HISTORY of what changed
--  (docs/architecture/06-supabase.md · dev-notes/2026-11-20-world-graph-identity.md)
-- ----------------------------------------------------------------------------
--  WHY. A node was keyed by `ref` (type:id) and held ONE value per external scheme. Two things were missing:
--   (a) a handle of IntMap's own that does not move when a supplier re-issues an identifier (Overture GERS: ~6.5 %
--       of facility ids per release), and the reason a record was judged to be the same object;
--   (b) a record of what an upstream refresh CHANGED — the ingest overwrites a row in place and deletes what is no
--       longer stated, so «the name changed in November», «this id was replaced», «this tie ended» were unrecoverable.
--
--  ADDITIVE ONLY. One new column, three columns on world_graph_id_history, one append-only log, triggers that fill it
--  from WHATEVER writes the three graph tables (the seeds, world_graph_ingest_apply, the Overture SQL) — no writer
--  was edited — and four public reads. Nothing here writes a node, a tie or a claim.
--
--    world_graph_nodes.uid        IntMap's stable id of the object. Assigned once, never changed (a trigger refuses a
--                                 change). `ref` stays the key the page uses; `uid` is what a bookmark can hold.
--    world_graph_id_history       + basis (HOW the id was tied to this object: stated | source_record | attribute | seed),
--                                 + evidence (WHAT matched: {scheme,value} / the source records / the distance), + confidence.
--    world_graph_changes          one row per change of a node, a tie or a claim: when, which feed run, op, and the
--                                 before/after of the fields that changed. It starts when this migration is applied
--                                 (what was written earlier has no «before» to record).
--    world_graph_identifier_periods (view)   per (object, scheme, id): first and last release that held it, and whether it is
--                                 the node's present id.
--    world_graph_resolve(q)       a uid, a ref, or «scheme:value» (a present OR a past id) → the object, and HOW it was reached.
--    world_graph_history(ref)     the changes and the identifier periods of one object.
--    world_graph_changes_between(from, to, feed)   what a refresh did, in counts.
--  ACCESS as the other world_graph tables: public read; only service_role writes (the triggers run as the writer).
-- ============================================================================

alter table public.world_graph_nodes add column if not exists uid uuid not null default gen_random_uuid();
create unique index if not exists world_graph_nodes_uid_uq on public.world_graph_nodes (uid);
comment on column public.world_graph_nodes.uid is
  '(world-graph) IntMap''s own stable identifier of the object. Assigned at insert, never changed: ref and the external ids in `ids` may be replaced by a refresh, this does not.';

create or replace function public.world_graph_keep_uid() returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $$ begin new.uid := old.uid; return new; end $$;
drop trigger if exists world_graph_nodes_keep_uid on public.world_graph_nodes;
create trigger world_graph_nodes_keep_uid before update on public.world_graph_nodes
  for each row when (new.uid is distinct from old.uid) execute function public.world_graph_keep_uid();

-- ---------------------------------------------------------------------------- how an id was tied to an object
alter table public.world_graph_id_history
  add column if not exists basis      text  not null default 'stated',
  add column if not exists evidence   jsonb not null default '{}'::jsonb,
  add column if not exists confidence text  not null default 'high';
alter table public.world_graph_id_history drop constraint if exists world_graph_id_history_basis_check;
alter table public.world_graph_id_history add constraint world_graph_id_history_basis_check
  check (basis in ('stated', 'source_record', 'attribute', 'seed'));
alter table public.world_graph_id_history drop constraint if exists world_graph_id_history_confidence_check;
alter table public.world_graph_id_history add constraint world_graph_id_history_confidence_check
  check (confidence in ('high', 'medium', 'low'));
alter table public.world_graph_id_history drop constraint if exists world_graph_id_history_evidence_check;
alter table public.world_graph_id_history add constraint world_graph_id_history_evidence_check
  check (jsonb_typeof(evidence) = 'object');
comment on column public.world_graph_id_history.basis is
  '(world-graph) How this id was tied to the object. stated = the supplier gave the id for this very object; source_record = the supplier named the same source record; attribute = a match by kind, country and position (never a name) — confidence says how far to trust it; seed = written by a hand-built snapshot.';

-- ---------------------------------------------------------------------------- the append-only change log
create table if not exists public.world_graph_changes (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default clock_timestamp(),
  entity  text not null check (entity in ('node', 'tie', 'claim')),
  op      text not null check (op in ('added', 'changed', 'retired')),
  ref     text not null,            -- the node (for a tie: the node that states it; for a claim: the node it is about)
  uid     uuid,                     -- that node's stable id when it still existed to be asked
  feed    text,
  feed_run bigint,
  detail  jsonb not null default '{}'::jsonb   -- node: {fields:{name:{from,to},…}} · tie: {rel,to_ref,from_ms,to_ms,…} · claim: {key,value,unit,…}
);
comment on table public.world_graph_changes is
  '(world-graph) What a write changed: one row per added / changed / retired node, tie or claim, with the before and after of the fields that changed. Filled by triggers, so every writer is covered. Append-only; public read; written only through the triggers.';
create index if not exists world_graph_changes_ref_idx on public.world_graph_changes (ref, id);
create index if not exists world_graph_changes_at_idx  on public.world_graph_changes (at);
alter table public.world_graph_changes enable row level security;
revoke all on public.world_graph_changes from public, anon, authenticated;
grant select on public.world_graph_changes to anon, authenticated;
grant all on public.world_graph_changes to service_role;
drop policy if exists world_graph_changes_read on public.world_graph_changes;
create policy world_graph_changes_read on public.world_graph_changes for select to anon, authenticated using (true);

-- node: which columns are the object's statement (everything but bookkeeping)
create or replace function public.world_graph_log_node() returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare o jsonb; n jsonb; d jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.world_graph_changes (entity, op, ref, uid, feed, feed_run, detail)
    values ('node', 'added', new.ref, new.uid, new.feed, new.feed_run,
            jsonb_build_object('type', new.type, 'kind', new.kind, 'name', new.name, 'ids', new.ids));
  elsif tg_op = 'UPDATE' then
    o := to_jsonb(old) - array['updated_at', 'feed_run', 'uid', 'feed']; n := to_jsonb(new) - array['updated_at', 'feed_run', 'uid', 'feed'];
    select jsonb_object_agg(k, jsonb_build_object('from', o -> k, 'to', n -> k)) into d
      from jsonb_object_keys(n) k where (o -> k) is distinct from (n -> k);
    if d is not null then
      insert into public.world_graph_changes (entity, op, ref, uid, feed, feed_run, detail)
      values ('node', 'changed', new.ref, new.uid, new.feed, new.feed_run, jsonb_build_object('fields', d));
    end if;
  else
    insert into public.world_graph_changes (entity, op, ref, uid, feed, feed_run, detail)
    values ('node', 'retired', old.ref, old.uid, old.feed, old.feed_run,
            jsonb_build_object('type', old.type, 'kind', old.kind, 'name', old.name, 'ids', old.ids));
  end if;
  return null;
end $$;
drop trigger if exists world_graph_nodes_log_ins on public.world_graph_nodes;
drop trigger if exists world_graph_nodes_log_upd on public.world_graph_nodes;
drop trigger if exists world_graph_nodes_log_del on public.world_graph_nodes;
create trigger world_graph_nodes_log_ins after insert on public.world_graph_nodes for each row execute function public.world_graph_log_node();
-- an UPDATE that only touches bookkeeping (feed_run, updated_at) does not fire this one
create trigger world_graph_nodes_log_upd after update of type, kind, name, country, lng, lat, provenance, ids, valid_from_ms, valid_to_ms, facts, sources
  on public.world_graph_nodes for each row execute function public.world_graph_log_node();
create trigger world_graph_nodes_log_del after delete on public.world_graph_nodes for each row execute function public.world_graph_log_node();

create or replace function public.world_graph_log_tie() returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare r public.world_graph_edges; u uuid; o jsonb; n jsonb; d jsonb;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select uid into u from public.world_graph_nodes where ref = r.from_ref;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old) - array['id', 'feed_run', 'retrieved']; n := to_jsonb(new) - array['id', 'feed_run', 'retrieved'];
    select jsonb_object_agg(k, jsonb_build_object('from', o -> k, 'to', n -> k)) into d from jsonb_object_keys(n) k where (o -> k) is distinct from (n -> k);
    if d is null then return null; end if;
    insert into public.world_graph_changes (entity, op, ref, uid, feed, feed_run, detail)
    values ('tie', 'changed', r.from_ref, u, r.feed, r.feed_run, jsonb_build_object('rel', r.rel, 'to_ref', r.to_ref, 'fields', d));
  else
    insert into public.world_graph_changes (entity, op, ref, uid, feed, feed_run, detail)
    values ('tie', case when tg_op = 'INSERT' then 'added' else 'retired' end, r.from_ref, u, r.feed, r.feed_run,
            jsonb_build_object('rel', r.rel, 'to_ref', r.to_ref, 'from_ms', r.from_ms, 'to_ms', r.to_ms, 'confidence', r.confidence, 'source', r.source));
  end if;
  return null;
end $$;
drop trigger if exists world_graph_edges_log_ins on public.world_graph_edges;
drop trigger if exists world_graph_edges_log_upd on public.world_graph_edges;
drop trigger if exists world_graph_edges_log_del on public.world_graph_edges;
create trigger world_graph_edges_log_ins after insert on public.world_graph_edges for each row execute function public.world_graph_log_tie();
create trigger world_graph_edges_log_upd after update of from_ms, to_ms, confidence, source on public.world_graph_edges for each row execute function public.world_graph_log_tie();
create trigger world_graph_edges_log_del after delete on public.world_graph_edges for each row execute function public.world_graph_log_tie();

create or replace function public.world_graph_log_claim() returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare r public.world_graph_claims; u uuid;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select uid into u from public.world_graph_nodes where ref = r.ref;
  insert into public.world_graph_changes (entity, op, ref, uid, feed, feed_run, detail)
  values ('claim', case tg_op when 'INSERT' then 'added' when 'DELETE' then 'retired' else 'changed' end, r.ref, u, r.feed, r.feed_run,
          case when tg_op = 'UPDATE'
               then jsonb_build_object('key', r.key, 'from_ms', r.from_ms, 'to_ms', r.to_ms, 'source', r.source,
                                       'value', jsonb_build_object('from', old.value, 'to', new.value), 'unit', jsonb_build_object('from', old.unit, 'to', new.unit))
               else jsonb_build_object('key', r.key, 'value', r.value, 'unit', r.unit, 'from_ms', r.from_ms, 'to_ms', r.to_ms, 'source', r.source) end);
  return null;
end $$;
drop trigger if exists world_graph_claims_log_ins on public.world_graph_claims;
drop trigger if exists world_graph_claims_log_upd on public.world_graph_claims;
drop trigger if exists world_graph_claims_log_del on public.world_graph_claims;
create trigger world_graph_claims_log_ins after insert on public.world_graph_claims for each row execute function public.world_graph_log_claim();
create trigger world_graph_claims_log_upd after update of value, unit on public.world_graph_claims for each row
  when ((old.value, old.unit) is distinct from (new.value, new.unit)) execute function public.world_graph_log_claim();
create trigger world_graph_claims_log_del after delete on public.world_graph_claims for each row execute function public.world_graph_log_claim();

-- ---------------------------------------------------------------------------- reads
create or replace view public.world_graph_identifier_periods with (security_invoker = true) as
  select h.ref, n.uid, h.scheme, h.ext_id,
         min(h.release) as first_release, max(h.release) as last_release, min(h.observed) as first_observed, max(h.observed) as last_observed,
         (n.ids ->> h.scheme) = h.ext_id as is_current,
         (array_agg(h.basis order by h.release))[1] as basis, (array_agg(h.confidence order by h.release))[1] as confidence,
         bool_or(h.status = 'removed') as removed_by_supplier
  from public.world_graph_id_history h join public.world_graph_nodes n on n.ref = h.ref
  group by h.ref, n.uid, h.scheme, h.ext_id, n.ids;
grant select on public.world_graph_identifier_periods to anon, authenticated, service_role;

-- world_graph_resolve(q): a uid, a ref, or «scheme:value» — the PRESENT id first, then every id of the history.
-- `via` says how it was reached (uid | ref | present_id | past_id), so a reader knows when it followed an id that has been replaced.
-- Never a name, never a position. An id two objects have each carried returns BOTH rows (the caller's to choose).
create or replace function public.world_graph_resolve(p_q text)
returns table (ref text, uid uuid, via text, scheme text, ext_id text, release text, basis text, confidence text)
language sql stable security invoker set search_path = public, pg_temp
as $$
  with q as (select btrim(coalesce(p_q, '')) as s where length(btrim(coalesce(p_q, ''))) between 1 and 250),
  parts as (select s, case when s ~ '^[A-Za-z][A-Za-z0-9_]*:.+$' then lower(split_part(s, ':', 1)) end as sch,
                    case when s ~ '^[A-Za-z][A-Za-z0-9_]*:.+$' then substr(s, position(':' in s) + 1) end as val from q)
  select n.ref, n.uid, 'uid', null::text, null::text, null::text, null::text, null::text
    from parts p join public.world_graph_nodes n on p.s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and n.uid = p.s::uuid
  union all
  select n.ref, n.uid, 'ref', null, null, null, null, null from parts p join public.world_graph_nodes n on n.ref = p.s
  union all
  select n.ref, n.uid, 'present_id', p.sch, p.val, null, null, null from parts p join public.world_graph_nodes n on p.sch is not null and n.ids ->> p.sch = p.val
  union all
  select h.ref, n.uid, 'past_id', h.scheme, h.ext_id, h.release, h.basis, h.confidence
    from parts p join public.world_graph_id_history h on p.sch is not null and h.scheme = p.sch and h.ext_id = p.val
    join public.world_graph_nodes n on n.ref = h.ref
   where coalesce(n.ids ->> h.scheme, '') <> h.ext_id;
$$;
comment on function public.world_graph_resolve(text) is
  '(world-graph) The object a uid, a ref or an external id («gers:…») names — a present id, or an id the object held in an earlier release. via says which. Never a name or a position. SECURITY INVOKER.';

create or replace function public.world_graph_history(p_ref text, p_since timestamptz default null)
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ref', p_ref,
    'uid', (select n.uid from public.world_graph_nodes n where n.ref = p_ref),
    'identifiers', coalesce((select jsonb_agg(to_jsonb(p) order by p.scheme, p.first_release) from public.world_graph_identifier_periods p where p.ref = p_ref), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.world_graph_changes c
                          where c.ref = p_ref and (p_since is null or c.at >= p_since)), '[]'::jsonb));
$$;
comment on function public.world_graph_history(text, timestamptz) is
  '(world-graph) One object''s identifier periods (which id it held in which releases, and on what basis) and every recorded change of it, its ties and its claims since p_since. SECURITY INVOKER.';

create or replace function public.world_graph_changes_between(p_from timestamptz, p_to timestamptz default null, p_feed text default null)
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select c.entity || '.' || c.op as k, count(*) as v
    from public.world_graph_changes c
    where c.at >= p_from and (p_to is null or c.at <= p_to) and (p_feed is null or c.feed = p_feed)
    group by 1
    union all
    select 'node.id_replaced', count(*) from public.world_graph_changes c
    where c.entity = 'node' and c.op = 'changed' and c.at >= p_from and (p_to is null or c.at <= p_to) and (p_feed is null or c.feed = p_feed)
      and c.detail -> 'fields' ? 'ids'
  ) t;
$$;
comment on function public.world_graph_changes_between(timestamptz, timestamptz, text) is
  '(world-graph) A refresh in counts: how many nodes, ties and claims were added / changed / retired between two moments (optionally one feed), and how many nodes had an external id replaced. SECURITY INVOKER.';

grant execute on function public.world_graph_resolve(text) to anon, authenticated, service_role;
grant execute on function public.world_graph_history(text, timestamptz) to anon, authenticated, service_role;
grant execute on function public.world_graph_changes_between(timestamptz, timestamptz, text) to anon, authenticated, service_role;
revoke execute on function public.world_graph_resolve(text) from public;
revoke execute on function public.world_graph_history(text, timestamptz) from public;
revoke execute on function public.world_graph_changes_between(timestamptz, timestamptz, text) from public;
