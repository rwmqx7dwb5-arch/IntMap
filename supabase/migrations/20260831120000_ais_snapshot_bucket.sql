-- ============================================================================
--  #R510 — WHERE THE SHARED SHIP SNAPSHOT LIVES
-- ----------------------------------------------------------------------------
--  supabase/functions/ais-feed serves every IntMap browser from ONE snapshot, for the same reason
--  aviation-feed does (migration 20260823130000): isolate memory is not a cache here. Supabase
--  hands a request a cold isolate often enough that upstream reads would otherwise be proportional
--  to REQUESTS — which is the structure the function exists to remove, not to move to the server.
--
--  ⚠ TWO MIME TYPES, AND THE FUNCTION MUST SEND ONE OF THEM. The aviation bucket allows only
--  application/octet-stream, so #R504's honest `application/json` upload was refused with HTTP 415
--  and the write silently never happened while every other path looked healthy (#R505). The ship
--  snapshot IS json, so json is declared — and tests/r510 compares this list against the
--  content-type the function actually sends, because the two facts live in different files.
--
--  ⚠ NOTHING PRIVATE GOES IN THIS BUCKET. It holds one file: positions of vessels that are already
--  broadcasting them unencrypted over AIS, from providers whose terms permit redistribution with
--  attribution. No user identifier, no account data, no provider credential. The write path is the
--  service role key and it never leaves the Edge Function's environment
--  (docs/SECURITY-ARCHITECTURE.md).
--
--  Non-destructive: it creates a bucket and one policy and touches no existing row.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ais', 'ais', true, 33554432, array['application/json', 'application/octet-stream'])
on conflict (id) do update
  set public = true,
      file_size_limit = 33554432,
      allowed_mime_types = array['application/json', 'application/octet-stream'];

-- Anyone may READ the snapshot: it is the same public data the map draws, and serving it straight
-- from the CDN is the cheapest fan-out there is.
drop policy if exists "ais snapshot is world readable" on storage.objects;
create policy "ais snapshot is world readable"
  on storage.objects for select
  using (bucket_id = 'ais');

-- Nobody may WRITE it through the API. The Edge Function uses the service role key, which bypasses
-- RLS; there is deliberately no insert/update policy, so a leaked publishable key cannot replace
-- the world's ships.
