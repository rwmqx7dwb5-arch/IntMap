-- ============================================================================
--  atlas-semantic-search — THE CAPABILITY VECTORS BEHIND ATLAS'S SEMANTIC SEARCH
-- ----------------------------------------------------------------------------
--  js/atlas-capabilities.js fuses two rankings for find_capability: the lexical one it always had,
--  and a semantic one — the cosine similarity between the query and each capability's own
--  documentation, as embedded by supabase/functions/atlas-embed. The query is embedded per call and
--  never stored. The CAPABILITY side does not change between calls, so it is embedded once and kept
--  here.
--
--  THE KEY IS THE DOCUMENTATION ITSELF. `catalog_hash` is the SHA-256 of the canonical catalogue
--  (atlas-embed/core.js), recomputed by the function over the text it embeds. So:
--    · a catalogue that changes is a NEW key and is embedded afresh — nothing has to be invalidated;
--    · no caller can file text under a key that is not the hash of that text, so a row a reader's
--      search reads is always the embedding of the documentation that reader's page is running.
--  `model` is part of the key because two models' vectors are not comparable.
--
--  ⚠ NO CLIENT MAY TOUCH THIS. RLS on, no policy, every table privilege revoked from
--  anon/authenticated/public, and the three functions are executable by service_role only — the
--  way relay_rate_buckets is (20260918100000_r801_relay_rate_limit.sql).
--
--  ⚠ search_path IS `extensions` ALONE, not the empty string: pgvector's `<=>` lives there and an
--  operator is resolved through the search path — the same reason the three news embedding
--  functions pin it (docs/DATABASE.md). Every table is schema-qualified.
-- ============================================================================

create extension if not exists vector with schema extensions;

create table if not exists public.atlas_capability_vectors (
  catalog_hash  text                     not null check (catalog_hash ~ '^[0-9a-f]{64}$'),
  model         text                     not null check (length(model) between 1 and 128),
  capability_id text                     not null check (length(capability_id) between 3 and 64),
  embedding     extensions.vector(1536)  not null,
  created_at    timestamptz              not null default now(),
  primary key (catalog_hash, model, capability_id)
);
comment on table public.atlas_capability_vectors is
  'Embeddings of each Atlas capability''s documentation, keyed by the SHA-256 of the whole catalogue and the model (atlas-semantic-search). Written and read only through the service-role functions below; the query side is never stored.';

create index if not exists atlas_capability_vectors_created_idx on public.atlas_capability_vectors (created_at);

-- ─────────────────────────────────────────────────────────────────────────────
--  1. How many capabilities are stored under (catalogue, model). 0 means «unknown» — the function
--     then asks the page for the catalogue instead of embedding a query it cannot compare.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.atlas_capability_catalog_size(p_catalog text, p_model text)
returns integer
language sql
stable
security definer
set search_path = extensions
as $$
  select count(*)::integer
    from public.atlas_capability_vectors v
   where v.catalog_hash = p_catalog and v.model = p_model
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. The similarity of one query vector to EVERY capability of one catalogue. All of them, not a
--     top-k: the page decides what stands out from the query's own distribution
--     (js/atlas-capabilities.js), and a top-k cut here would hide that distribution from it.
--     145 rows is the whole registry.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.atlas_capability_similarity(p_catalog text, p_model text, p_query text)
returns table (capability_id text, similarity real)
language sql
stable
security definer
set search_path = extensions
as $$
  select v.capability_id,
         (1 - (v.embedding <=> p_query::extensions.vector))::real as similarity
    from public.atlas_capability_vectors v
   where v.catalog_hash = p_catalog and v.model = p_model
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. Store one catalogue — ALL of it in one statement, so a catalogue is either present whole or
--     absent (the size above is then an honest «known»). `p` is [{id, e:'[0.1,…]'}]; a malformed
--     vector raises and nothing is written. Idempotent: rows already there are left alone.
--     Housekeeping in the same transaction: catalogues other than this one older than 30 days go.
--     30 days: a release changes the catalogue, and a page cached longer than a month is not a page
--     anyone is running; if one still is, its catalogue is re-embedded on its next search — a
--     fraction of a US cent (atlas-embed/index.ts, THE SPEND CEILING). Expires if releases slow to
--     less than monthly AND embedding becomes expensive; then the horizon, not the rule, moves.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.atlas_capability_seed(p_catalog text, p_model text, p jsonb)
returns integer
language plpgsql
security definer
set search_path = extensions
as $$
declare n integer;
begin
  delete from public.atlas_capability_vectors v
   where v.catalog_hash <> p_catalog
     and v.created_at < now() - interval '30 days';

  insert into public.atlas_capability_vectors (catalog_hash, model, capability_id, embedding)
  select p_catalog, p_model, x.e ->> 'id', (x.e ->> 'e')::extensions.vector
    from jsonb_array_elements(coalesce(p, '[]'::jsonb)) as x(e)
  on conflict (catalog_hash, model, capability_id) do nothing;

  select count(*)::integer into n
    from public.atlas_capability_vectors v
   where v.catalog_hash = p_catalog and v.model = p_model;
  return n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. RLS + grants — nobody but the service role. ⚠ TRUNCATE is not subject to RLS, so the grant
--     layer is the only thing that refuses it (docs/SECURITY-ARCHITECTURE.md §8 item 5).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.atlas_capability_vectors enable row level security;

revoke all on table public.atlas_capability_vectors from public, anon, authenticated;

revoke execute on function public.atlas_capability_catalog_size(text, text)       from public, anon, authenticated;
revoke execute on function public.atlas_capability_similarity(text, text, text)   from public, anon, authenticated;
revoke execute on function public.atlas_capability_seed(text, text, jsonb)        from public, anon, authenticated;
grant  execute on function public.atlas_capability_catalog_size(text, text)       to service_role;
grant  execute on function public.atlas_capability_similarity(text, text, text)   to service_role;
grant  execute on function public.atlas_capability_seed(text, text, jsonb)        to service_role;
