-- ============================================================================
--  #R464 — WHERE THE SHARED GDELT ANSWERS LIVE
-- ----------------------------------------------------------------------------
--  supabase/functions/gdelt-relay exists because api.gdeltproject.org refuses roughly four requests
--  in five and takes 10.7-26.0 s to say so (15 samples, 2026-08-25). The only thing that turns that
--  into a usable source is REMEMBERING THE ANSWER: GDELT stamps its own replies
--  `cache-control: public, max-age=900`, so one upstream read serves every reader asking about that
--  topic for fifteen minutes.
--
--  ⚠ THE CACHE CANNOT LIVE IN THE EDGE FUNCTION. This is the same wall #R341 hit and recorded in
--  migration 20260823130000, re-measured against a deployed probe for this round:
--
--      caches.open("...")        -> throws "Web Cache is not available in this context"
--      module-level Map, 3 calls -> hits=1 every time, three different execution ids
--
--  Supabase hands every request a cold isolate, so isolate memory is not a cache at all and the
--  Web Cache API is not offered. This bucket is the place outside the isolate:
--
--    · the function writes `<sha256-of-the-canonical-query>.json` after each successful upstream
--      read, with the service role key it already has in its environment;
--    · any isolate — always cold — reads it back before deciding whether to touch GDELT;
--    · the object is PUBLIC, so the read is a CDN GET rather than a database round trip.
--
--  ⚠ NOTHING PRIVATE GOES IN THIS BUCKET. It holds GDELT DOC 2.0 article lists: headline, outlet
--  domain, public article URL and GDELT's seen-date, for queries the app itself composes from place
--  names. No user identifier, no account data, no provider credential, and no reader's question —
--  the key is a hash of the CANONICAL GDELT URL, not of anything a person typed.
--
--  ⚠ AND IT CANNOT BE GROWN ON DEMAND BY A STRANGER. gdelt-relay writes an object only after an
--  upstream 200, and GDELT's own throttle caps those at roughly one per several seconds globally —
--  so the object count is bounded by the upstream, not by how fast a caller can send requests.
--
--  Non-destructive: it creates a bucket and one policy and touches no existing row.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gdelt', 'gdelt', true, 2097152, array['application/json'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['application/json'];

-- Anyone may READ a cached answer. It is public news metadata by construction, and serving it from
-- the CDN rather than through the function is part of the saving.
drop policy if exists "gdelt cache is world readable" on storage.objects;
create policy "gdelt cache is world readable"
  on storage.objects for select
  using (bucket_id = 'gdelt');

-- ⚠ NO INSERT/UPDATE/DELETE POLICY IS CREATED, AND THAT IS DELIBERATE — the same rule as the
-- aviation bucket. With RLS enabled and no write policy, an anon or authenticated caller cannot
-- write here at all; the Edge Function writes with the SERVICE ROLE key, which bypasses RLS. Adding
-- a write policy "so the function can write" would hand the same ability to every browser holding
-- the anon key, which is every visitor.
