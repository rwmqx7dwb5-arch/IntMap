-- IntMap — admin moderation policies
-- Run ONCE in the Supabase SQL Editor. Lets accounts with profiles.is_admin = true
-- (1) read every community report and (2) delete any post or comment, so the
-- admin console (admin.html → Community tab) can moderate abuse / spam.

-- Helper predicate: is the current user an admin?
-- (inlined in each policy below so no extra function is required)

-- ---- community_reports: admins can read them all ----
alter table if exists public.community_reports enable row level security;
drop policy if exists "reports admin read" on public.community_reports;
create policy "reports admin read" on public.community_reports
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ---- community_posts: admins can delete any post ----
drop policy if exists "posts admin delete" on public.community_posts;
create policy "posts admin delete" on public.community_posts
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ---- community_comments: admins can delete any comment ----
drop policy if exists "comments admin delete" on public.community_comments;
create policy "comments admin delete" on public.community_comments
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- (Posts & comments already have public SELECT policies from supabase_community_v2.sql,
--  so the moderation tables list fine for admins; only reports + deletes needed widening.)
