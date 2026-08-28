-- ============================================================================
--  #R341 — WHERE THE SHARED AIRCRAFT SNAPSHOT LIVES
-- ----------------------------------------------------------------------------
--  The whole point of supabase/functions/aviation-feed is that ONE upstream read serves every
--  IntMap user (AGENTS.md §5.1). The first version kept the snapshot in the Edge Function's own
--  isolate memory, and MEASURED AGAINST THE DEPLOYED FUNCTION that turned out not to hold:
--
--      three identical viewport requests, 15 s TTL, cache expected to serve two of them
--        call 1  200  7,140 bytes  5.64 s   x-intmap-age-ms: 2
--        call 2  200  7,140 bytes  5.76 s   x-intmap-age-ms: 1
--        call 3  200  7,089 bytes  6.39 s   x-intmap-age-ms: 1
--
--  An age of 1 ms on every call means every call rebuilt the answer: Supabase hands a request a
--  cold isolate often enough that isolate memory is not a cache at all. Upstream reads were
--  therefore proportional to REQUESTS — the exact structure the round set out to remove, just
--  moved from the browser to the server.
--
--  So the snapshot needs somewhere outside the isolate. This bucket is that place:
--
--    · the function writes `world.bin` (the IMAV/1 snapshot) after each refresh, with the service
--      role key it already has in its environment;
--    · a cold isolate HYDRATES from it instead of starting empty, so a first request answers from
--      real aircraft rather than from nothing;
--    · the object is PUBLIC, so a browser can read it straight from the CDN without invoking the
--      function at all — which is the cheapest possible fan-out and the reason `public` is true.
--
--  ⚠ NOTHING PRIVATE GOES IN THIS BUCKET. It holds one file: positions of aircraft that are already
--  broadcasting them unencrypted, under a licence (ODbL) that permits redistribution. No user
--  identifier, no account data, no provider credential. The write path is the service role key and
--  it never leaves the Edge Function's environment (docs/SECURITY-ARCHITECTURE.md).
--
--  Non-destructive: it creates a bucket and two policies and touches no existing row.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aviation', 'aviation', true, 33554432, array['application/octet-stream'])
on conflict (id) do update
  set public = true,
      file_size_limit = 33554432,
      allowed_mime_types = array['application/octet-stream'];

-- Anyone may READ the snapshot. It is public data by construction and serving it from the CDN
-- rather than through the function is the whole saving.
drop policy if exists "aviation snapshot is world readable" on storage.objects;
create policy "aviation snapshot is world readable"
  on storage.objects for select
  using (bucket_id = 'aviation');

-- ⚠ NO INSERT/UPDATE/DELETE POLICY IS CREATED, AND THAT IS DELIBERATE. With RLS enabled and no
-- write policy, an anon or authenticated caller cannot write here at all; the Edge Function writes
-- with the SERVICE ROLE key, which bypasses RLS. Adding a write policy "so the function can write"
-- would hand the same ability to every browser holding the anon key — which is every visitor.
