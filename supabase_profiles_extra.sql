-- IntMap — public profile fields (avatar + bio) for the account editor & public profile cards.
-- Run ONCE in the Supabase SQL Editor.

alter table if exists public.profiles add column if not exists bio        text;
alter table if exists public.profiles add column if not exists avatar_url  text;

-- Allow everyone to read the public-facing profile fields (so other users' name / avatar / bio
-- show on community posts). Profiles already exist per user; this only widens SELECT.
alter table if exists public.profiles enable row level security;
drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read" on public.profiles for select using (true);

-- (Update/insert policies from your existing setup remain unchanged — users still edit only their own row.)
